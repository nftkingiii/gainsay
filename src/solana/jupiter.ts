/**
 * Jupiter Predict REST API. The documented host answered read calls without a key when checked (2026-11-26, beta);
 * the older dedicated host is the fallback. JUPITER_API_KEY, when set, is sent as x-api-key. Unset by default.
 */
const HOSTS = process.env.JUPITER_PREDICT_URL
  ? [process.env.JUPITER_PREDICT_URL]
  : ["https://api.jup.ag/prediction/v1", "https://prediction-market-api.jup.ag/api/v1"];
const API_KEY = process.env.JUPITER_API_KEY?.trim();

export interface JupMarket {
  provider: string;
  marketId: string;
  status: "open" | "closed";
  /** The API's enum is yes, no, draw, refund (null while unsettled). */
  result: string | null;
  /** The on-chain MarketResult account, present once a market is settled and claimable. */
  marketResultPubkey?: string | null;
  title: string;
  closeTime?: number;
  resolveAt?: string | null;
  rulesPrimary?: string;
  outcomes?: string[] | null;
  sportsMarketType?: string | null;
  sportsLine?: number | string | null;
}

export interface JupEvent {
  eventId: string;
  isActive?: boolean;
  subcategory?: string;
  metadata: { slug?: string; title: string; league?: string; subtitle?: string };
  beginAt?: string | number | null;
  markets?: JupMarket[];
}

async function get<T>(path: string): Promise<T> {
  let failure = "no host";
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, {
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/json", ...(API_KEY ? { "x-api-key": API_KEY } : {}) },
      });
      if (res.ok) return (await res.json()) as T;
      failure = `jupiter ${res.status} on ${path.split("?")[0]}`;
    } catch (error) {
      failure = `jupiter unreachable: ${(error as Error).message}`;
    }
  }
  throw new Error(failure);
}

/** Event stubs (no markets) for one provider and sports subcategory, closed games included. */
export async function listEvents(provider: "polymarket" | "kalshi", subcategory: string, limit = 100): Promise<JupEvent[]> {
  const q = new URLSearchParams({ provider, category: "sports", subcategory, includeClosed: "true", includeMarkets: "false", limit: String(limit) });
  return (await get<{ data: JupEvent[] }>(`/events?${q}`)).data;
}

/** One event with its markets. `allMarkets` adds totals and spreads for Polymarket sports. */
export async function getEvent(eventId: string, allMarkets: boolean): Promise<JupEvent> {
  return get<JupEvent>(`/events/${encodeURIComponent(eventId)}${allMarkets ? "?includeAllMarkets=true" : ""}`);
}
