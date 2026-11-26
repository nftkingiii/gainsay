import { parseGameMarket, type GameMarket } from "../verdict/market.ts";
import type { JupEvent, JupMarket } from "./jupiter.ts";

export type Provider = "polymarket" | "kalshi";

export type VenueResult =
  | { kind: "winner"; side: "first" | "second"; label: string }
  | { kind: "refund" }
  | { kind: "split"; note: string }
  | { kind: "open" }
  | { kind: "unclear"; note: string };

export interface ResultAccount {
  marketId: string;
  apiResult: string | null;
  pubkey: string;
}

export interface VenueMarket {
  id: string;
  type: "moneyline" | "team_win" | "draw" | "total" | "spread";
  label: string;
  game: GameMarket;
  result: VenueResult;
  accounts: ResultAccount[];
}

export interface VenueGame {
  provider: Provider;
  eventId: string;
  title: string;
  league: string;
  kickoff: Date;
  /** Moneyline-type markets first, then totals and spreads. */
  markets: VenueMarket[];
}

export type Mapped = { ok: true; game: VenueGame } | { ok: false; reason: string };

const fail = (reason: string): Mapped => ({ ok: false, reason });

/** Result for two markets that are the two sides of one question. */
export function pairResult(first: JupMarket, second: JupMarket, labels: [string, string]): VenueResult {
  const [a, b] = [first.result, second.result];
  if (first.status !== "closed" || second.status !== "closed" || (!a && !b)) return { kind: "open" };
  if (a === "refund" || b === "refund") return { kind: "refund" };
  if (a === "draw" || b === "draw") return { kind: "split", note: "Jupiter reports the result as draw" };
  if (a === "yes" && b === "yes") return { kind: "split", note: "the venue recorded yes on both sides" };
  if (a === "yes") return { kind: "winner", side: "first", label: labels[0] };
  if (b === "yes") return { kind: "winner", side: "second", label: labels[1] };
  return { kind: "unclear", note: "no side is marked yes" };
}

function singleResult(m: JupMarket): VenueResult {
  if (m.status !== "closed" || !m.result) return { kind: "open" };
  if (m.result === "refund") return { kind: "refund" };
  if (m.result === "draw") return { kind: "split", note: "Jupiter reports the result as draw" };
  return m.result === "yes" ? { kind: "winner", side: "first", label: "Yes" } : { kind: "winner", side: "second", label: "No" };
}

const accounts = (ms: JupMarket[]): ResultAccount[] =>
  ms.filter((m) => m.marketResultPubkey).map((m) => ({ marketId: m.marketId, apiResult: m.result, pubkey: m.marketResultPubkey! }));

const teamsOf = (title: string): [string, string] | null => {
  const parts = title.split(/\s+vs\.?\s+/i).map((t) => t.trim());
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
};

function kickoffOf(event: JupEvent): Date | null {
  const seconds = Number(event.beginAt);
  if (!event.beginAt || !Number.isFinite(seconds) || seconds < 1_000_000_000) return null;
  return new Date(seconds * 1000);
}

const ORDER = { moneyline: 0, team_win: 0, draw: 0, total: 1, spread: 2 } as const;

/** A Polymarket sports event as Jupiter lists it. Only final-score markets are kept; the rest are skipped. */
export function polymarketGame(event: JupEvent): Mapped {
  const slug = event.metadata.slug;
  const kickoff = kickoffOf(event);
  const teams = teamsOf(event.metadata.title);
  if (!slug || !kickoff || !teams) return fail("not a single game");
  const iso = kickoff.toISOString();

  const groups = new Map<string, JupMarket[]>();
  for (const m of event.markets ?? []) {
    const base = m.marketId.replace(/^(POLY-\d+)-\d$/, "$1");
    groups.set(base, [...(groups.get(base) ?? []), m].sort((x, y) => x.marketId.localeCompare(y.marketId)));
  }

  const markets: VenueMarket[] = [];
  let league: string | null = null;
  for (const [base, ms] of groups) {
    const head = ms[0]!;
    const type = head.sportsMarketType;
    const outcomes = head.outcomes;
    if (!outcomes || outcomes.length !== 2) continue;
    const common = { slug, gameStartTime: iso, outcomes: JSON.stringify(outcomes) };
    const yesNo = outcomes[0] === "Yes";
    let parsed: GameMarket | null = null;
    let result: VenueResult;
    let kind: VenueMarket["type"];
    let label: string;

    if (type === "moneyline" && !yesNo && ms.length === 2) {
      parsed = parseGameMarket({ ...common, question: event.metadata.title, sportsMarketType: "moneyline" });
      result = pairResult(ms[0]!, ms[1]!, [outcomes[0]!, outcomes[1]!]);
      kind = "moneyline";
      label = `${outcomes[0]} vs ${outcomes[1]}`;
    } else if (type === "moneyline" && yesNo && ms.length === 1) {
      const draw = /^draw$/i.test(head.title);
      const probe = parseGameMarket({ ...common, question: `Will ${head.title} win`, sportsMarketType: "moneyline" });
      if (probe) {
        parsed = draw ? { league: probe.league, kickoff, outcomes: ["Yes", "No"], teams, kind: "draw" } : { ...probe, teams: [...teams] };
      }
      result = singleResult(head);
      kind = draw ? "draw" : "team_win";
      label = draw ? "Draw" : `${head.title} win`;
    } else if (type === "totals" && ms.length === 2 && head.sportsLine != null) {
      const line = Number(head.sportsLine);
      parsed = parseGameMarket({ ...common, question: `${event.metadata.title}: O/U ${line}`, sportsMarketType: "totals", line });
      result = pairResult(ms[0]!, ms[1]!, [outcomes[0]!, outcomes[1]!]);
      kind = "total";
      label = `Total ${line}`;
    } else if (type === "spreads" && ms.length === 2 && head.sportsLine != null) {
      const line = Number(head.sportsLine);
      parsed = parseGameMarket({ ...common, question: event.metadata.title, sportsMarketType: "spreads", line });
      result = pairResult(ms[0]!, ms[1]!, [outcomes[0]!, outcomes[1]!]);
      kind = "spread";
      label = `${outcomes[0]} ${line > 0 ? "+" : ""}${line}`;
    } else continue;

    if (!parsed) continue;
    league = parsed.league;
    markets.push({ id: base, type: kind, label, game: parsed, result, accounts: accounts(ms) });
  }
  if (!league) return fail("no league Gainsay can settle");
  markets.sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  if (!markets.some((m) => ORDER[m.type] === 0)) return fail("no final-score market");
  return { ok: true, game: { provider: "polymarket", eventId: event.eventId, title: event.metadata.title, league, kickoff, markets } };
}

const KALSHI_LEAGUE: Record<string, string> = { KXNBAGAME: "nba", KXNHLGAME: "nhl", KXMLBGAME: "mlb", KXNFLGAME: "nfl" };

/** Kalshi shortens teams that share a city to "City X". Anything not listed here is refused rather than guessed. */
const KALSHI_TEAMS: Record<string, string> = {
  "nba:Los Angeles L": "Lakers",
  "nba:Los Angeles C": "Clippers",
  "nhl:New York R": "Rangers",
  "nhl:New York I": "Islanders",
  "nfl:New York G": "Giants",
  "nfl:New York J": "Jets",
  "nfl:Los Angeles R": "Rams",
  "nfl:Los Angeles C": "Chargers",
  "mlb:New York Y": "Yankees",
  "mlb:New York M": "Mets",
  "mlb:Los Angeles D": "Dodgers",
  "mlb:Los Angeles A": "Angels",
  "mlb:Chicago C": "Cubs",
  "mlb:Chicago W": "White Sox",
};

function kalshiTeam(league: string, name: string): string | null {
  const alias = KALSHI_TEAMS[`${league}:${name}`];
  if (alias) return alias;
  return /\s[A-Z]{1,2}$/.test(name) ? null : name;
}

/** A Kalshi game moneyline event ("Away at Home") as Jupiter lists it. */
export function kalshiGame(event: JupEvent): Mapped {
  const league = KALSHI_LEAGUE[event.eventId.split("-")[0] ?? ""];
  const kickoff = kickoffOf(event);
  const parts = event.metadata.title.split(/\s+at\s+/i).map((t) => t.trim());
  if (!league || !kickoff || parts.length !== 2) return fail("not a Kalshi game market Gainsay covers");
  const away = kalshiTeam(league, parts[0]!);
  const home = kalshiTeam(league, parts[1]!);
  if (!away || !home) return fail("ambiguous team names, refused");
  const ms = event.markets ?? [];
  const mA = ms.find((m) => m.title === parts[0]);
  const mB = ms.find((m) => m.title === parts[1]);
  if (ms.length !== 2 || !mA || !mB) return fail("market titles do not match the teams");
  const game: GameMarket = { league, kickoff, outcomes: [away, home], teams: [away, home], kind: "moneyline" };
  const market: VenueMarket = {
    id: event.eventId,
    type: "moneyline",
    label: `${away} at ${home}`,
    game,
    result: pairResult(mA, mB, [away, home]),
    accounts: accounts([mA, mB]),
  };
  return { ok: true, game: { provider: "kalshi", eventId: event.eventId, title: event.metadata.title, league, kickoff, markets: [market] } };
}

export const mapEvent = (event: JupEvent): Mapped => (event.eventId.startsWith("POLY-") ? polymarketGame(event) : kalshiGame(event));

/** What the venue says, in words. */
export function describeResult(r: VenueResult): string {
  switch (r.kind) {
    case "winner":
      return r.label;
    case "refund":
      return "Refund";
    case "split":
      return `Split (${r.note})`;
    case "open":
      return "Not settled";
    case "unclear":
      return `Unclear (${r.note})`;
  }
}
