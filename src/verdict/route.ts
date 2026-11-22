import { fromMlbOfficial, fromNhlOfficial, fromSportwire, fromTakarOutcome, type Evidence } from "./evidence.ts";
import type { GameMarket } from "./market.ts";
import { localDate } from "./engine.ts";

export interface Request {
  label: string;
  minerId: string;
  endpoint: string;
  payload: Record<string, unknown>;
  read: (result: unknown, meta: Pick<Evidence, "minerId" | "signalHash" | "receiptHash" | "costUsd">) => Evidence[];
}

const SPORTWIRE_LEAGUES = new Set(["nba", "laliga", "epl"]);
/** Leagues with no other provider yet: Takar Outcome reads ESPN's scoreboard for the dated game. */
const TAKAR_LEAGUES: Record<string, string> = { nfl: "NFL", ucl: "Champions League" };
const LEAGUE_LABEL: Record<string, string> = { nba: "NBA", laliga: "LaLiga", epl: "Premier League" };

/** Providers proven through paid calls. Leagues without one return no requests. */
export function requestsFor(market: GameMarket): Request[] {
  if (market.league === "nhl") {
    return [
      {
        label: "NHL official",
        minerId: "44002",
        endpoint: "/query",
        payload: {},
        read: (result, meta) => fromNhlOfficial(result as Parameters<typeof fromNhlOfficial>[0], meta),
      },
    ];
  }
  if (market.league === "mlb") {
    // MLB files evening games under the US date, which is behind UTC.
    const date = new Date(market.kickoff.getTime() - 8 * 3_600_000).toISOString().slice(0, 10);
    return [
      {
        label: "MLB official",
        minerId: "190014",
        endpoint: "/query",
        payload: { sportId: "1", date, hydrate: "decisions" },
        read: (result, meta) => fromMlbOfficial(result as Parameters<typeof fromMlbOfficial>[0], meta),
      },
    ];
  }
  if (SPORTWIRE_LEAGUES.has(market.league)) {
    // Ask for the dated game. A team-only ask returns that team's latest game, which is the wrong
    // one for any market but the most recent (#177); 7331's /game no longer resolves dated asks.
    const question = `${market.teams.join(" vs ")}, ${LEAGUE_LABEL[market.league]}, ${localDate(market.kickoff, market.league)}, final score`;
    return [
      {
        label: "SportWire score, dated",
        minerId: "7330",
        endpoint: "/score",
        payload: { question },
        read: (result, meta) => {
          const evidence = fromSportwire(result as Record<string, unknown>, meta);
          return evidence ? [evidence] : [];
        },
      },
    ];
  }
  if (TAKAR_LEAGUES[market.league] && market.teams.length === 2) {
    // A dated, two-team question; the answer's data.scores carries home, away, scores and kickoff.
    const event = `What was the final score of ${market.teams.join(" vs ")} on ${localDate(market.kickoff, market.league)} (${TAKAR_LEAGUES[market.league]})?`;
    return [
      {
        label: "Takar Outcome, ESPN scoreboard",
        minerId: "20261117",
        endpoint: "/resolve",
        payload: { event },
        read: (result, meta) => {
          const evidence = fromTakarOutcome(result as Parameters<typeof fromTakarOutcome>[0], meta);
          return evidence ? [evidence] : [];
        },
      },
    ];
  }
  return [];
}
