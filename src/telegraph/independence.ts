export interface Miner {
  id: string;
  slug: string;
  base_url: string;
  description?: string;
}

export type Screened =
  | { miner: Miner; accepted: true; source: string }
  | { miner: Miner; accepted: false; reason: string };

const VENUES = ["polymarket", "manifold", "kalshi"];

/** Providers that wrap a public feed say so; two wrappers of one feed are one source. */
const KNOWN_UPSTREAMS: [RegExp, string][] = [
  [/espn/i, "espn"],
  [/thesportsdb/i, "thesportsdb"],
  [/football-data/i, "football-data"],
  [/nhle|\bnhl web api\b/i, "nhl"],
  [/statsapi\.mlb|mlb stats/i, "mlb"],
  [/openligadb/i, "openligadb"],
  [/jolpi/i, "jolpica"],
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function screen(miner: Miner): Screened {
  const host = hostOf(miner.base_url);
  const text = `${miner.slug} ${miner.description ?? ""}`;
  if (!host) return { miner, accepted: false, reason: "invalid base URL" };
  if (VENUES.some((v) => host.includes(v) || new RegExp(v, "i").test(text))) {
    return { miner, accepted: false, reason: "derived from a market venue" };
  }
  if (host.endsWith(".sslip.io") || /^\d+\.\d+\.\d+\.\d+/.test(host) || host === "127.0.0.1:8080") {
    return { miner, accepted: false, reason: "unidentified proxy host" };
  }
  for (const [pattern, source] of KNOWN_UPSTREAMS) {
    if (pattern.test(host) || pattern.test(text)) return { miner, accepted: true, source };
  }
  return { miner, accepted: true, source: host };
}

/** Keeps one provider per upstream source, so agreement means independent agreement. */
export function pickIndependent(miners: Miner[]): { picked: Screened[]; dropped: Screened[] } {
  const seen = new Set<string>();
  const picked: Screened[] = [];
  const dropped: Screened[] = [];
  for (const miner of miners) {
    const result = screen(miner);
    if (!result.accepted) {
      dropped.push(result);
    } else if (seen.has(result.source)) {
      dropped.push({ miner, accepted: false, reason: `same source as another provider (${result.source})` });
    } else {
      seen.add(result.source);
      picked.push(result);
    }
  }
  return { picked, dropped };
}
