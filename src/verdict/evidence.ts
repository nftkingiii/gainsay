export interface Evidence {
  source: string;
  minerId: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  finished: boolean;
  kickoff: Date | null;
  signalHash: string;
  receiptHash: string | null;
  costUsd: number;
}

type Meta = Pick<Evidence, "minerId" | "signalHash" | "receiptHash" | "costUsd">;

export function fromSportwire(result: Record<string, unknown>, meta: Meta): Evidence | null {
  const { home_team, away_team, home_score, away_score, finished, kickoff } = result;
  if (typeof home_team !== "string" || typeof away_team !== "string") return null;
  if (typeof home_score !== "number" || typeof away_score !== "number") return null;
  return {
    ...meta,
    source: "espn",
    home: home_team,
    away: away_team,
    homeScore: home_score,
    awayScore: away_score,
    finished: finished === true,
    kickoff: typeof kickoff === "string" ? new Date(kickoff) : null,
  };
}

interface NhlTeam {
  abbrev: string;
  score?: number;
  name?: { default?: string };
}
interface NhlGame {
  awayTeam: NhlTeam;
  homeTeam: NhlTeam;
  gameState?: string;
  startTimeUTC?: string;
}

export function fromNhlOfficial(result: { games?: NhlGame[] }, meta: Meta): Evidence[] {
  return (result.games ?? []).flatMap((game) => {
    const { awayTeam: away, homeTeam: home } = game;
    if (away.score === undefined || home.score === undefined) return [];
    return [
      {
        ...meta,
        source: "nhl-official",
        home: home.name?.default ?? home.abbrev,
        away: away.name?.default ?? away.abbrev,
        homeScore: home.score,
        awayScore: away.score,
        finished: game.gameState === "OFF" || game.gameState === "FINAL",
        kickoff: game.startTimeUTC ? new Date(game.startTimeUTC) : null,
      },
    ];
  });
}

interface MlbSide {
  score?: number;
  team: { name: string };
}
interface MlbDay {
  games: { gameDate?: string; status: { detailedState: string }; teams: { away: MlbSide; home: MlbSide } }[];
}

export function fromMlbOfficial(result: { dates?: MlbDay[] }, meta: Meta): Evidence[] {
  return (result.dates ?? []).flatMap((day) =>
    day.games.flatMap((game) => {
      const { away, home } = game.teams;
      if (away.score === undefined || home.score === undefined) return [];
      return [
        {
          ...meta,
          source: "mlb-official",
          home: home.team.name,
          away: away.team.name,
          homeScore: home.score,
          awayScore: away.score,
          finished: game.status.detailedState === "Final",
          kickoff: game.gameDate ? new Date(game.gameDate) : null,
        },
      ];
    }),
  );
}
