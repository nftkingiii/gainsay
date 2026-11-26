import { marketById, type Market } from "../gamma.ts";
import type { createAsker } from "../telegraph/client.ts";
import { decide, type Verdict } from "../verdict/engine.ts";
import type { Evidence } from "../verdict/evidence.ts";
import { parseGameMarket, type GameMarket } from "../verdict/market.ts";
import { requestsFor, type Request } from "../verdict/route.ts";

export interface Proposal {
  value: number;
  closesAt: number;
  tx: string;
}

export interface CheckResult {
  market: {
    id: string;
    question: string;
    outcomes: string[];
    bond: string | null;
    reward: string | null;
    kind: string | null;
    league: string | null;
    kickoff: string | null;
  };
  proposal: (Proposal & { label: string }) | null;
  status: "checked" | "unsupported" | "no_provider" | "not_started" | "paused" | "budget_spent" | "failed";
  plan: { label: string; minerId: string }[];
  verdict: Verdict | null;
  note: string;
  testnet: true;
}

type Asker = ReturnType<typeof createAsker>;

const EVIDENCE_TTL_MS = 5 * 60 * 1000;
const FINAL_TTL_MS = 6 * 60 * 60 * 1000;

export function outcomeLabel(outcomes: string[], value: number): string {
  if (value === 0.5) return "50-50";
  return (value === 1 ? outcomes[0] : outcomes[1]) ?? String(value);
}

/**
 * Paid evidence is bought only when an asker is configured, and never past the daily budget.
 * One evidence purchase often settles many markets (a whole scoreboard), so results are cached.
 */
export function createChecker(options: { asker: Asker | null; dailyBudgetUsd: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const evidenceCache = new Map<string, { at: number; evidence: Evidence[]; final: boolean }>();
  const resultCache = new Map<string, { at: number; result: CheckResult }>();
  let spent = { day: "", usd: 0 };

  function budgetLeft(): number {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (spent.day !== day) spent = { day, usd: 0 };
    return options.dailyBudgetUsd - spent.usd;
  }

  async function evidenceFor(request: Request): Promise<Evidence[] | "budget" | "failed"> {
    const key = `${request.minerId}|${request.endpoint}|${JSON.stringify(request.payload)}`;
    const hit = evidenceCache.get(key);
    if (hit && now() - hit.at < (hit.final ? FINAL_TTL_MS : EVIDENCE_TTL_MS)) return hit.evidence;
    if (!options.asker) return "budget";
    if (budgetLeft() < 0.01) return "budget";
    spent.usd += 0.01;
    const { status, body, receipt } = await options.asker.askNative(request.minerId, request.endpoint, request.payload);
    if (status !== 200 || typeof body.signal_hash !== "string") return "failed";
    const evidence = request.read(body.result, {
      minerId: request.minerId,
      signalHash: body.signal_hash,
      receiptHash: receipt?.receipt_hash ?? null,
      costUsd: 0.01,
    });
    evidenceCache.set(key, { at: now(), evidence, final: evidence.length > 0 && evidence.every((e) => e.finished) });
    return evidence;
  }

  /** Buys (or reuses) the evidence for a game's requests. One purchase often covers every market on the game. */
  async function gather(
    requests: Request[],
  ): Promise<{ ok: true; evidence: Evidence[] } | { ok: false; status: "paused" | "budget_spent" | "failed"; note: string }> {
    const evidence: Evidence[] = [];
    for (const request of requests) {
      const got = await evidenceFor(request);
      if (got === "budget") {
        const live = Boolean(options.asker) && options.dailyBudgetUsd > 0;
        return {
          ok: false,
          status: live ? "budget_spent" : "paused",
          note: live
            ? "Today's evidence budget is spent. Try again tomorrow."
            : "Paid checks are paused on this deployment. This shows what would be bought.",
        };
      }
      if (got === "failed") {
        return { ok: false, status: "failed", note: `${request.label} did not return an answer. Nothing was charged for a failed call.` };
      }
      evidence.push(...got);
    }
    return { ok: true, evidence };
  }

  return {
    paidChecksEnabled: () => Boolean(options.asker) && options.dailyBudgetUsd > 0,
    budgetLeftUsd: () => Math.max(0, budgetLeft()),

    /** Evidence for a game that did not come from Polymarket's own API, such as a Jupiter market. */
    async evidenceForGame(game: GameMarket): Promise<
      | { status: "ok"; evidence: Evidence[]; plan: { label: string; minerId: string }[] }
      | { status: "no_provider" | "not_started" | "paused" | "budget_spent" | "failed"; note: string; plan: { label: string; minerId: string }[] }
    > {
      const requests = requestsFor(game);
      const plan = requests.map((r) => ({ label: r.label, minerId: r.minerId }));
      if (!requests.length) return { status: "no_provider", note: "No proven Telegraph provider covers this league yet.", plan };
      if (now() < game.kickoff.getTime()) return { status: "not_started", note: "The game has not started.", plan };
      const gathered = await gather(requests);
      if (!gathered.ok) return { status: gathered.status, note: gathered.note, plan };
      return { status: "ok", evidence: gathered.evidence, plan };
    },

    async check(raw: Market | string, proposal: Proposal | null): Promise<CheckResult> {
      const market = typeof raw === "string" ? await marketById(raw) : raw;
      if (!market) throw new Error("market not found");
      const outcomes = market.outcomes ? (JSON.parse(market.outcomes) as string[]) : [];
      const parsed: GameMarket | null = parseGameMarket(market);
      const base: Omit<CheckResult, "status" | "plan" | "verdict" | "note"> = {
        market: {
          id: market.id,
          question: market.question,
          outcomes,
          bond: market.umaBond ?? null,
          reward: market.umaReward ?? null,
          kind: parsed?.kind ?? null,
          league: parsed?.league ?? null,
          kickoff: parsed?.kickoff.toISOString() ?? null,
        },
        proposal: proposal ? { ...proposal, label: outcomeLabel(outcomes, proposal.value) } : null,
        testnet: true,
      };
      const finish = (status: CheckResult["status"], note: string, verdict: Verdict | null = null, plan: Request[] = []) => ({
        ...base,
        status,
        note,
        verdict,
        plan: plan.map((r) => ({ label: r.label, minerId: r.minerId })),
      });

      if (!parsed) return finish("unsupported", "Final scores cannot settle this market type yet (props, quarters, halves, non-sports).");
      const requests = requestsFor(parsed);
      if (!requests.length) return finish("no_provider", "No proven Telegraph provider covers this league yet.");
      if (now() < parsed.kickoff.getTime()) {
        return finish("not_started", "The game has not started.", decide(parsed, proposal?.value ?? null, [], new Date(now())), requests);
      }

      const cacheKey = `${market.id}|${proposal?.value ?? "none"}`;
      const cached = resultCache.get(cacheKey);
      if (cached && now() - cached.at < EVIDENCE_TTL_MS) return cached.result;

      const gathered = await gather(requests);
      if (!gathered.ok) return finish(gathered.status, gathered.note, null, requests);
      const evidence = gathered.evidence;
      const verdict = decide(parsed, proposal?.value ?? null, evidence, new Date(now()));
      const result = finish("checked", verdict.note, verdict, requests);
      resultCache.set(cacheKey, { at: now(), result });
      return result;
    },
  };
}

export type Checker = ReturnType<typeof createChecker>;
