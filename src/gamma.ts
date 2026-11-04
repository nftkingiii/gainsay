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

export type Resolved = { market: Market } | { choices: { id: string; question: string }[] } | null;

/** Accepts a market id, a market slug, or a Polymarket link to a market or an event. */
export async function resolveMarket(input: string): Promise<Resolved> {
  const text = input.trim();
  if (/^\d+$/.test(text)) {
    const market = await marketById(text);
    return market ? { market } : null;
  }
  const parts = text.replace(/[?#].*$/, "").split("/").filter(Boolean);
  const slugs = [...parts].reverse().filter((p) => /^[a-z0-9-]+$/.test(p));
  for (const slug of slugs) {
    const markets = (await getJson(`/markets?slug=${encodeURIComponent(slug)}`)) as Market[] | null;
    if (markets?.[0]) return { market: markets[0] };
    const events = (await getJson(`/events?slug=${encodeURIComponent(slug)}`)) as
      | { markets?: Market[] }[]
      | null;
    const inEvent = events?.[0]?.markets ?? [];
    if (inEvent.length === 1 && inEvent[0]) return { market: inEvent[0] };
    if (inEvent.length > 1) {
      return { choices: inEvent.slice(0, 40).map((m) => ({ id: m.id, question: m.question })) };
    }
  }
  return null;
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
