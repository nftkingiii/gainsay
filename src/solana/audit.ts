import { decide, expectedFrom, type VerdictName } from "../verdict/engine.ts";
import type { Evidence } from "../verdict/evidence.ts";
import { describeResult, type VenueGame, type VenueMarket } from "./venue.ts";

export type Audit = VerdictName | "venue_open";

export interface MarketAudit {
  id: string;
  type: VenueMarket["type"];
  label: string;
  venue: string;
  audit: Audit;
  note: string;
}

export interface GameAudit {
  headline: Audit;
  note: string;
  /** Moneyline-type markets: one for a two-way game, three for soccer. */
  main: MarketAudit[];
  /** Totals and spreads judged from the same purchased score. */
  lines: { total: number; holds: number; wrong: number; other: number; wrongLabels: string[] };
  accepted: Evidence[];
  rejected: string[];
  costUsd: number;
}

/** One market against the evidence: the venue's recorded result is treated as a proposal and judged by the score. */
export function auditMarket(m: VenueMarket, evidence: Evidence[], now: Date): MarketAudit {
  const base = { id: m.id, type: m.type, label: m.label, venue: describeResult(m.result) };
  const r = m.result;
  if (r.kind === "open") return { ...base, audit: "venue_open", note: "the venue has not settled this market" };
  if (r.kind === "winner") {
    const v = decide(m.game, r.side === "first" ? 1 : 0, evidence, now);
    return { ...base, audit: v.verdict, note: v.note };
  }
  const v = decide(m.game, null, evidence, now);
  if (v.verdict === "too_early" || v.verdict === "no_independent_source") return { ...base, audit: v.verdict, note: v.note };
  const level = v.accepted.length > 0 && v.accepted.every((e) => expectedFrom(m.game, e) === null);
  if (level) return { ...base, audit: "holds", note: "the score is a push or a tie, which a refund or split matches" };
  const what = r.kind === "refund" ? "refunded" : r.kind === "split" ? "split" : "left unclear";
  return {
    ...base,
    audit: "contested",
    note:
      v.verdict === "settled"
        ? `the venue ${what} this market but the official score decides it; check the market rules for a postponement or void`
        : v.note,
  };
}

const RANK: Audit[] = ["wrong", "contested", "too_early", "venue_open", "no_independent_source", "holds", "settled"];

export function auditGame(game: VenueGame, evidence: Evidence[], now: Date): GameAudit {
  const isMain = (m: VenueMarket) => m.type === "moneyline" || m.type === "team_win" || m.type === "draw";
  const audits = game.markets.map((m) => ({ m, a: auditMarket(m, evidence, now) }));
  const main = audits.filter((x) => isMain(x.m)).map((x) => x.a);
  const lines = audits.filter((x) => !isMain(x.m)).map((x) => x.a);
  const headline = RANK.find((r) => main.some((x) => x.audit === r)) ?? "no_independent_source";
  const full = decide(game.markets[0]!.game, null, evidence, now);
  return {
    headline,
    note: main.find((x) => x.audit === headline)?.note ?? "",
    main,
    lines: {
      total: lines.length,
      holds: lines.filter((x) => x.audit === "holds").length,
      wrong: lines.filter((x) => x.audit === "wrong").length,
      other: lines.filter((x) => x.audit !== "holds" && x.audit !== "wrong").length,
      wrongLabels: lines.filter((x) => x.audit === "wrong").map((x) => x.label).slice(0, 6),
    },
    accepted: full.accepted,
    rejected: [...new Set(full.rejected.map((x) => x.reason))].slice(0, 6),
    costUsd: full.costUsd,
  };
}
