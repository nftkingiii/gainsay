import type { Evidence } from "./evidence.ts";
import type { GameMarket } from "./market.ts";

export type VerdictName = "too_early" | "holds" | "wrong" | "contested" | "no_independent_source";

export interface Rejection {
  evidence: Evidence;
  reason: string;
}

export interface Verdict {
  verdict: VerdictName;
  /** The proposed value that the accepted evidence supports, when it supports one. */
  expected: 0 | 1 | null;
  /** True when only one upstream source backs the result. */
  singleSource: boolean;
  accepted: Evidence[];
  rejected: Rejection[];
  costUsd: number;
  note: string;
}

const KICKOFF_TOLERANCE_MS = 3 * 60 * 60 * 1000;

const words = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** "Knicks" matches "New York Knicks": every word of the shorter name appears in the longer. */
export function sameTeam(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)];
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.length > 0 && shorter.every((w) => longer.includes(w));
}

function rejectionFor(market: GameMarket, e: Evidence): string | null {
  for (const team of market.teams) {
    if (!sameTeam(team, e.home) && !sameTeam(team, e.away)) {
      return `answer is about ${e.away} at ${e.home}, not ${market.teams.join(" v ")}`;
    }
  }
  if (!e.kickoff) return "answer has no kickoff time, so the game cannot be confirmed";
  if (Math.abs(e.kickoff.getTime() - market.kickoff.getTime()) > KICKOFF_TOLERANCE_MS) {
    return `answer is for a game at ${e.kickoff.toISOString()}, not ${market.kickoff.toISOString()}`;
  }
  return null;
}

function scoreOf(team: string, e: Evidence): number {
  return sameTeam(team, e.home) ? e.homeScore : e.awayScore;
}

/** Which proposed value this final score supports, or null for a push or a draw. */
function expectedFrom(market: GameMarket, e: Evidence): 0 | 1 | null {
  const toValue = (firstOutcomeWins: boolean) => (firstOutcomeWins ? 1 : 0);
  const [first, second] = market.outcomes;
  switch (market.kind) {
    case "moneyline": {
      const margin = scoreOf(first, e) - scoreOf(second, e);
      return margin === 0 ? null : toValue(margin > 0);
    }
    case "team_win": {
      const rival = sameTeam(market.team, e.home) ? e.awayScore : e.homeScore;
      return toValue(scoreOf(market.team, e) > rival);
    }
    case "total": {
      const total = e.homeScore + e.awayScore;
      if (total === market.line) return null;
      return toValue(total > market.line === /^over$/i.test(first));
    }
    case "spread": {
      const margin = scoreOf(first, e) + market.line - scoreOf(second, e);
      return margin === 0 ? null : toValue(margin > 0);
    }
  }
}

export function decide(
  market: GameMarket,
  proposedValue: number,
  evidence: Evidence[],
  now: Date,
): Verdict {
  const costUsd = new Set(evidence.map((e) => e.signalHash)).size * 0.01;
  const rejected: Rejection[] = [];
  const relevant: Evidence[] = [];
  for (const e of evidence) {
    const reason = rejectionFor(market, e);
    if (reason) rejected.push({ evidence: e, reason });
    else relevant.push(e);
  }

  const result = (verdict: VerdictName, expected: 0 | 1 | null, note: string): Verdict => ({
    verdict,
    expected,
    singleSource: new Set(relevant.map((e) => e.source)).size === 1,
    accepted: relevant,
    rejected,
    costUsd,
    note,
  });

  if (now < market.kickoff) return result("too_early", null, "the game has not started");
  if (!relevant.length) {
    return result("no_independent_source", null, "no answer was about this game");
  }
  if (relevant.some((e) => !e.finished)) {
    return result("too_early", null, "a source says the game has not finished");
  }

  const expectations = new Set(relevant.map((e) => expectedFrom(market, e)));
  if (expectations.size > 1) return result("contested", null, "sources disagree on the outcome");
  const [expected = null] = expectations;
  if (expected === null) return result("contested", null, "the score gives no clear outcome");
  return expected === proposedValue
    ? result("holds", expected, "the final score supports this proposal")
    : result("wrong", expected, "the final score contradicts this proposal");
}
