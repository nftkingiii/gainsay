import { findMarket, marketById, type Market } from "../gamma.ts";
import { decodeProposal, MANAGED_ORACLE, PROPOSE_TOPIC, type Proposal as RawProposal, type RawLog } from "../uma/events.ts";
import { lookupFor } from "../uma/mapping.ts";
import { parseGameMarket } from "../verdict/market.ts";
import { requestsFor } from "../verdict/route.ts";
import type { VerdictName } from "../verdict/engine.ts";
import { outcomeLabel, type Checker, type Proposal } from "./checker.ts";

export interface FeedEntry {
  marketId: string;
  question: string;
  proposed: string;
  value: number;
  closesAt: number;
  seenAt: number;
  bond: string | null;
  reward: string | null;
  tx: string;
  coverage: "covered" | "unsupported" | "no_provider";
  verdict: VerdictName | null;
  singleSource: boolean | null;
}

const MAX_ENTRIES = 300;
const BACKFILL_HOURS = 2;

export function createFeed(options: {
  wsUrl: string;
  httpUrl: string;
  checker: Checker;
  autoCheck: boolean;
  log?: (message: string) => void;
}) {
  const log = options.log ?? (() => {});
  const entries = new Map<string, FeedEntry>();
  const counts = { seen: 0, notPolymarket: 0, unmapped: 0 };
  const proposals = new Map<string, Proposal>();

  async function ingest(raw: RawLog) {
    counts.seen++;
    let proposal: RawProposal;
    try {
      proposal = decodeProposal(raw);
    } catch {
      return;
    }
    const lookup = lookupFor(proposal);
    if (!lookup) {
      counts.notPolymarket++;
      return;
    }
    const found: Market | null = await findMarket(lookup).catch(() => null);
    const market = found ? await marketById(found.id).catch(() => null) : null;
    if (!market) {
      counts.unmapped++;
      return;
    }
    const outcomes = market.outcomes ? (JSON.parse(market.outcomes) as string[]) : [];
    const parsed = parseGameMarket(market);
    const coverage = !parsed ? "unsupported" : requestsFor(parsed).length ? "covered" : "no_provider";
    const entry: FeedEntry = {
      marketId: market.id,
      question: market.question,
      proposed: outcomeLabel(outcomes, proposal.proposedValue),
      value: proposal.proposedValue,
      closesAt: proposal.expiresAt * 1000,
      seenAt: Date.now(),
      bond: market.umaBond ?? null,
      reward: market.umaReward ?? null,
      tx: proposal.tx,
      coverage,
      verdict: null,
      singleSource: null,
    };
    proposals.set(market.id, { value: proposal.proposedValue, closesAt: entry.closesAt, tx: proposal.tx });
    entries.set(`${market.id}|${proposal.tx}`, entry);
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);

    if (coverage === "covered" && options.autoCheck && options.checker.paidChecksEnabled()) {
      const result = await options.checker.check(market, proposals.get(market.id) ?? null).catch(() => null);
      if (result?.verdict) {
        entry.verdict = result.verdict.verdict;
        entry.singleSource = result.verdict.singleSource;
      }
    }
  }

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(options.httpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.result === undefined) throw new Error(body.error?.message ?? "rpc error");
    return body.result;
  }

  async function backfill() {
    const head = Number(await rpc<string>("eth_blockNumber", []));
    const from = head - Math.round((BACKFILL_HOURS * 3600) / 2.1);
    for (let block = from; block <= head; block += 100) {
      const logs = await rpc<RawLog[]>("eth_getLogs", [
        {
          address: MANAGED_ORACLE,
          topics: [[PROPOSE_TOPIC]],
          fromBlock: "0x" + block.toString(16),
          toBlock: "0x" + Math.min(block + 99, head).toString(16),
        },
      ]);
      for (const raw of logs) await ingest(raw);
    }
    log(`backfill done: ${counts.seen} proposals seen`);
  }

  function subscribe(attempt = 0) {
    const ws = new WebSocket(options.wsUrl);
    ws.onopen = () => {
      attempt = 0;
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_subscribe",
          params: ["logs", { address: MANAGED_ORACLE, topics: [[PROPOSE_TOPIC]] }],
        }),
      );
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { params?: { result: RawLog } };
      if (message.params) void ingest(message.params.result);
    };
    ws.onclose = () => {
      const delay = Math.min(60_000, 2_000 * 2 ** attempt);
      log(`feed socket closed, reconnecting in ${delay / 1000}s`);
      setTimeout(() => subscribe(attempt + 1), delay);
    };
    ws.onerror = () => ws.close();
  }

  return {
    start() {
      subscribe();
      backfill().catch((error: Error) => log(`backfill failed: ${error.message}`));
    },
    proposalFor: (marketId: string) => proposals.get(marketId) ?? null,
    snapshot() {
      const list = [...entries.values()].sort((a, b) => b.seenAt - a.seenAt);
      return { counts, entries: list.slice(0, 120) };
    },
  };
}
