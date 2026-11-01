import { fromMlbOfficial, fromNhlOfficial, fromSportwire, type Evidence } from "./evidence.ts";
import type { GameMarket } from "./market.ts";

export interface Request {
  label: string;
  minerId: string;
  endpoint: string;
  payload: Record<string, unknown>;
  read: (result: unknown, meta: Pick<Evidence, "minerId" | "signalHash" | "receiptHash" | "costUsd">) => Evidence[];
}

const SPORTWIRE_LEAGUES = new Set(["nba", "laliga", "epl"]);

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
    return [
      {
        label: "SportWire (ESPN)",
        minerId: "7331",
        endpoint: "/game",
        payload: { team: market.teams[0], league: market.league },
        read: (result, meta) => {
          const evidence = fromSportwire(result as Record<string, unknown>, meta);
          return evidence ? [evidence] : [];
        },
      },
    ];
  }
  return [];
}
