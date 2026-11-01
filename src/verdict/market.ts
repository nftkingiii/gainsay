export type GameMarket = {
  league: string;
  kickoff: Date;
  /** Index 0 wins when the proposed value is 1; index 1 wins when it is 0. */
  outcomes: [string, string];
  teams: string[];
} & (
  | { kind: "moneyline" }
  | { kind: "team_win"; team: string }
  | { kind: "total"; line: number }
  | { kind: "spread"; line: number }
);

export interface RawMarket {
  question: string;
  slug?: string;
  sportsMarketType?: string;
  line?: number | string | null;
  gameStartTime?: string;
  outcomes?: string;
}

const LEAGUES: Record<string, string> = {
  nba: "nba",
  nhl: "nhl",
  mlb: "mlb",
  nfl: "nfl",
  lal: "laliga",
  epl: "epl",
  ucl: "ucl",
};

function parseKickoff(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T").replace(/\+00$/, "Z"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pair(question: string): string[] {
  const head = question.split(":")[0] ?? "";
  const parts = head.split(/\s+vs\.?\s+/i).map((t) => t.trim());
  return parts.length === 2 ? parts : [];
}

/** Returns null for anything final scores cannot settle, such as props and quarters. */
export function parseGameMarket(market: RawMarket): GameMarket | null {
  const league = LEAGUES[(market.slug ?? "").split("-")[0] ?? ""];
  const kickoff = parseKickoff(market.gameStartTime);
  if (!league || !kickoff || !market.outcomes) return null;

  const outcomes = JSON.parse(market.outcomes) as string[];
  const [first, second] = outcomes;
  if (outcomes.length !== 2 || !first || !second) return null;
  const base = { league, kickoff, outcomes: [first, second] as [string, string] };
  const line = market.line == null ? NaN : Number(market.line);

  switch (market.sportsMarketType) {
    case "moneyline": {
      const win = /^Will (.+?) win\b/i.exec(market.question);
      if (win?.[1]) return { ...base, kind: "team_win", team: win[1], teams: [win[1]] };
      return { ...base, kind: "moneyline", teams: [first, second] };
    }
    case "totals": {
      const teams = pair(market.question);
      if (!teams.length || Number.isNaN(line)) return null;
      return { ...base, kind: "total", line, teams };
    }
    case "spreads":
      if (Number.isNaN(line)) return null;
      return { ...base, kind: "spread", line, teams: [first, second] };
    default:
      return null;
  }
}
