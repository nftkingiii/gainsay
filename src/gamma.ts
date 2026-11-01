import type { Lookup } from "./uma/mapping.ts";

const GAMMA = "https://gamma-api.polymarket.com";

export interface Market {
  id: string;
  question: string;
  slug?: string;
  sportsMarketType?: string;
  line?: number | string | null;
  questionID?: string;
  negRiskRequestID?: string;
  gameStartTime?: string;
  resolutionSource?: string;
  umaBond?: string;
  umaReward?: string;
  outcomes?: string;
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(GAMMA + path, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gamma ${res.status} on ${path}`);
  return res.json();
}

export async function marketById(id: string): Promise<Market | null> {
  return (await getJson(`/markets/${encodeURIComponent(id)}`)) as Market | null;
}

export async function findMarket(lookup: Lookup): Promise<Market | null> {
  if (lookup.by === "id") {
    return (await getJson(`/markets/${encodeURIComponent(lookup.value)}`)) as Market | null;
  }
  if (lookup.by === "questionID") {
    for (const closed of ["false", "true"]) {
      const rows = (await getJson(
        `/markets?question_ids=${lookup.value}&closed=${closed}`,
      )) as Market[];
      const hit = rows.find((m) => m.questionID?.toLowerCase() === lookup.value);
      if (hit) return hit;
    }
    return null;
  }
  // Gamma has no filter on negRiskRequestID; the caller supplies candidates.
  return null;
}
