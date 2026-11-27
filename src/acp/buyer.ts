// GainsayBuyer: hires Gainsay on ACP for one result check, pays from ACP escrow,
// and independently checks the delivery before it releases payment.
//
//   tsx src/acp/buyer.ts create <eventId>   create the job (no money moves)
//   tsx src/acp/buyer.ts status <jobId>     print the job history
//   tsx src/acp/buyer.ts fund <jobId>       fund the agreed budget (real USDC on Base: max $0.01)
//   tsx src/acp/buyer.ts evaluate <jobId>   check the deliverable, then complete or reject
import { argv, exit } from "node:process";
import { decodeMarketResult, type MarketResultAccount } from "../solana/result-account.ts";
import { acp, CHAIN, history, log, messagesOf, statusOf } from "./cli.ts";

const SELLER = "0x82c761e6b9e2daf8ab4697da5d4c72b9c3c850ef";
const OFFERING = "verify_market_result";
const MAX_USD = 0.01;
const VERDICTS = new Set(["holds", "wrong", "contested", "settled", "too_early", "no_independent_source"]);

const [cmd, arg] = argv.slice(2);

function deliverable(h: any): any | null {
  for (const m of [...messagesOf(h)].reverse()) {
    const c = m?.event?.type === "job.submitted" ? m.event.deliverable : m?.content ?? m?.deliverable;
    if (typeof c !== "string" || !c.includes("gainsay-acp/1")) continue;
    try {
      return JSON.parse(c);
    } catch {
      /* not ours */
    }
  }
  return h?.deliverable ? (typeof h.deliverable === "string" ? JSON.parse(h.deliverable) : h.deliverable) : null;
}

const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];

/** Read result accounts from Solana mainnet, trying two public RPCs with retries. */
async function readAccounts(keys: string[]): Promise<Map<string, MarketResultAccount | null>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const rpc = RPCS[attempt % RPCS.length]!;
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [keys, { encoding: "base64" }] }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json()) as any;
      const values = body?.result?.value;
      if (!Array.isArray(values)) throw new Error("no result");
      return new Map(keys.map((k, n) => [k, values[n] ? decodeMarketResult(k, { owner: values[n].owner, data: values[n].data[0] }) : null]));
    } catch (e) {
      log("buyer", `solana read via ${rpc} failed, retrying`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return new Map();
}

/** The evaluation: everything the delivery claims that the buyer can check without trusting Gainsay. */
async function evaluate(d: any, eventId: string | null) {
  const problems: string[] = [];
  if (d?.schema !== "gainsay-acp/1") problems.push("not a Gainsay delivery");
  if (eventId && d?.eventId !== eventId) problems.push(`delivery is for ${d?.eventId}, job asked for ${eventId}`);
  if (!VERDICTS.has(d?.verdict)) problems.push(`unknown verdict ${d?.verdict}`);
  const hashes = (d?.receipts ?? []).flatMap((r: any) => [r.signal, r.receipt]).filter(Boolean);
  if (d?.verdict !== "no_independent_source" && !hashes.some((x: string) => /^0x[0-9a-f]{64}$/i.test(x)))
    problems.push("verdict without a Telegraph receipt hash");
  // Re-read every Solana result account the delivery cites, straight from mainnet RPC.
  const accounts: { pubkey: string; claimed: string }[] = d?.accounts ?? [];
  const chain = accounts.length ? await readAccounts(accounts.map((a) => a.pubkey)) : new Map();
  let matched = 0;
  for (const a of accounts) {
    const c = chain.get(a.pubkey);
    if (!c) continue;
    if (c.outcome === a.claimed) matched++;
    else problems.push(`account ${a.pubkey} is ${c.outcome} on chain, delivery says ${a.claimed}`);
  }
  if (accounts.length && matched === 0 && problems.length === 0) problems.push("could not re-read any cited Solana result account");
  return { ok: problems.length === 0, problems, accountsRechecked: matched, accountsCited: accounts.length };
}

async function main() {
  if (cmd === "create" && arg) {
    const r = acp("buyer", ["client", "create-job", "--provider", SELLER, "--offering-name", OFFERING, "--requirements", JSON.stringify({ eventId: arg }), "--chain-id", CHAIN]);
    log("buyer", "job created", r);
  } else if (cmd === "status" && arg) {
    console.log(JSON.stringify(history("buyer", arg), null, 2));
  } else if (cmd === "fund" && arg) {
    const h = history("buyer", arg);
    const set = [...messagesOf(h)].reverse().find((e: any) => e?.event?.type === "budget.set");
    const budget = Number(set?.event?.amount ?? h?.budget ?? NaN);
    if (!(budget > 0 && budget <= MAX_USD)) throw new Error(`budget ${budget} is not within the $${MAX_USD} cap; not funding`);
    log("buyer", "funding", { jobId: arg, budget, status: statusOf(h) });
    log("buyer", "funded", acp("buyer", ["client", "fund", "--job-id", arg, "--amount", String(budget), "--chain-id", CHAIN]));
  } else if (cmd === "dry" && arg) {
    const h = history("buyer", arg);
    const req = messagesOf(h).find((m: any) => m?.contentType === "requirement");
    log("buyer", "dry evaluation (no action)", await evaluate(deliverable(h), req ? JSON.parse(req.content).eventId ?? null : null));
  } else if (cmd === "evaluate" && arg) {
    const h = history("buyer", arg);
    const d = deliverable(h);
    const req = messagesOf(h).find((m: any) => m?.contentType === "requirement");
    const eventId = req ? JSON.parse(req.content).eventId ?? null : null;
    const e = await evaluate(d, eventId);
    log("buyer", "evaluation", e);
    const reason = e.ok
      ? `Checked: verdict ${d.verdict}, ${e.accountsRechecked}/${e.accountsCited} result accounts re-read on Solana and matched, Telegraph receipt present`
      : `Rejected: ${e.problems.join("; ")}`.slice(0, 480);
    const action = e.ok ? "complete" : "reject";
    log("buyer", action, acp("buyer", ["client", action, "--job-id", arg, "--chain-id", CHAIN, "--reason", reason]));
  } else {
    console.error("usage: buyer.ts create <eventId> | status <jobId> | fund <jobId> | evaluate <jobId>");
    exit(2);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  exit(1);
});
