// Gainsay as an ACP provider. Polls its jobs; proposes the $0.01 budget on new jobs;
// once funded, runs the paid Telegraph check through the live Gainsay service and submits it.
//
//   tsx src/acp/seller.ts            loop
//   tsx src/acp/seller.ts once       one pass
import { argv } from "node:process";
import { acp, CHAIN, history, log, messagesOf, sleep, statusOf } from "./cli.ts";

const GAINSAY = process.env.GAINSAY_URL ?? "https://gainsay.up.railway.app";
const PRICE = "0.01";
const SELF = "0x82c761e6b9e2daf8ab4697da5d4c72b9c3c850ef".toLowerCase();
const handled = new Map<string, string>();

function jobsOf(list: any): any[] {
  return list?.data ?? list?.jobs ?? (Array.isArray(list) ? list : []);
}
const idOf = (j: any) => String(j?.onChainJobId ?? j?.jobId ?? j?.id);

async function runCheck(eventId: string) {
  const r = await fetch(`${GAINSAY}/api/solana/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId }),
    signal: AbortSignal.timeout(170_000),
  });
  if (!r.ok) throw new Error(`Gainsay check answered ${r.status}`);
  return (await r.json()) as any;
}

function toDeliverable(c: any) {
  const verdict: string = c.status === "checked" && c.audit ? c.audit.headline : "no_independent_source";
  const evidence = (c.audit?.accepted ?? []).map((e: any) => ({
    minerId: e.minerId,
    signal: e.signalHash,
    receipt: e.receiptHash,
    source: e.source,
    score: `${e.away} ${e.awayScore} at ${e.home} ${e.homeScore}`,
    finished: e.finished,
    costUsd: e.costUsd,
  }));
  const accounts = (c.venue?.markets ?? []).flatMap((m: any) =>
    (m.accounts ?? []).filter((a: any) => a.onChain).map((a: any) => ({ pubkey: a.pubkey, claimed: a.onChain.outcome })),
  );
  return {
    schema: "gainsay-acp/1",
    eventId: c.eventId,
    title: c.title,
    verdict,
    summary: `${c.title}: venue says ${c.venue?.headline ?? "?"}; Gainsay ${verdict}. ${c.audit?.note ?? c.note ?? ""}`.slice(0, 400),
    lines: c.audit?.lines ?? null,
    chain: c.chain,
    receipts: evidence,
    accounts,
    page: `${GAINSAY}/#solana`,
    telegraphNetwork: "Ethereum Sepolia testnet (test USDC)",
  };
}

async function pass() {
  const jobs = jobsOf(acp("seller", ["job", "list"]));
  for (const j of jobs) {
    const id = idOf(j);
    const provider = String(j?.providerAddress ?? j?.provider ?? "").toLowerCase();
    if (provider && provider !== SELF) continue;
    const h = history("seller", id);
    const status = statusOf(h);
    if (handled.get(id) === status) continue;
    if (status === "open" || status === "request") {
      log("seller", "proposing budget", { id });
      acp("seller", ["provider", "set-budget", "--job-id", id, "--amount", PRICE, "--chain-id", CHAIN]);
    } else if (status === "funded" || status === "transaction") {
      const req = messagesOf(h).find((m: any) => m?.contentType === "requirement");
      const eventId = req ? JSON.parse(req.content).eventId : null;
      if (!eventId) continue;
      log("seller", "running paid Telegraph check", { id, eventId });
      const d = toDeliverable(await runCheck(eventId));
      log("seller", "submitting", { id, verdict: d.verdict, receipts: d.receipts.length, accounts: d.accounts.length });
      acp("seller", ["provider", "submit", "--job-id", id, "--deliverable", JSON.stringify(d), "--chain-id", CHAIN]);
    }
    handled.set(id, status);
  }
}

async function main() {
  do {
    try {
      await pass();
    } catch (e) {
      log("seller", "pass failed", (e as Error).message);
    }
    if (argv[2] === "once") break;
    await sleep(15_000);
  } while (true);
}

main();
