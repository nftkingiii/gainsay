import { readFileSync } from "node:fs";
import type { Checker } from "../service/checker.ts";
import { auditGame, type GameAudit } from "./audit.ts";
import { getEvent, listEvents, type JupEvent } from "./jupiter.ts";
import { explorerUrl, fetchMarketResults, type MarketResultAccount } from "./result-account.ts";
import { describeResult, mapEvent, type VenueGame } from "./venue.ts";

const POLY_LEAGUES = ["nba", "nhl", "mlb", "nfl", "epl", "lal", "ucl"];
const KALSHI_LEAGUES = ["nba", "nhl", "mlb", "nfl"];
const GAME_SLUG = /^(nba|nhl|mlb|nfl|epl|lal|ucl)-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/;
const KALSHI_GAME = /^KX(NBA|NHL|MLB|NFL)GAME-/;
const LIST_TTL_MS = 10 * 60 * 1000;
const DONE_TTL_MS = 6 * 60 * 60 * 1000;
const GAME_MS = 3.5 * 3_600_000;

export interface Stub {
  eventId: string;
  provider: "polymarket" | "kalshi";
  league: string;
  title: string;
  kickoff: string;
}

export interface AccountView {
  marketId: string;
  pubkey: string;
  explorer: string;
  apiResult: string | null;
  onChain: Pick<MarketResultAccount, "outcome" | "settledAt" | "claimsEnabled"> | null;
  /** Whether the API's result and the on-chain account say the same thing; null when the account could not be read. */
  agrees: boolean | null;
}

export interface SolanaCheck {
  eventId: string;
  provider: "polymarket" | "kalshi";
  title: string;
  league: string;
  kickoff: string;
  checkedAt: string;
  status: "checked" | "no_provider" | "not_started" | "paused" | "budget_spent" | "failed" | "refused";
  note: string;
  venue: { headline: string; markets: { label: string; type: string; result: string; accounts: AccountView[] }[] };
  audit: GameAudit | null;
  plan: { label: string; minerId: string }[];
  /** Totals and spreads whose result accounts were read, and how many matched the API. */
  chain: { read: number; matched: number; unread: number };
  testnet: true;
}

const sameResult = (api: string | null, chain: string) => (api === "draw" ? chain === "split" : api === chain);

export function loadRecord(path: URL): SolanaCheck[] {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SolanaCheck[];
  } catch {
    return [];
  }
}

export function createSolana(options: { checker: Checker; record: SolanaCheck[]; now?: () => number }) {
  const now = options.now ?? Date.now;
  let listing: { at: number; stubs: Stub[]; error: string | null } | null = null;
  const done = new Map<string, { at: number; result: SolanaCheck }>();
  const inflight = new Map<string, Promise<SolanaCheck>>();

  async function stubs(): Promise<{ stubs: Stub[]; error: string | null }> {
    if (listing && now() - listing.at < LIST_TTL_MS) return listing;
    const calls = [
      ...POLY_LEAGUES.map((l) => ["polymarket", l] as const),
      ...KALSHI_LEAGUES.map((l) => ["kalshi", l] as const),
    ];
    const settled = await Promise.allSettled(calls.map(([p, l]) => listEvents(p, l)));
    const out: Stub[] = [];
    let failures = 0;
    settled.forEach((r, i) => {
      if (r.status === "rejected") return void failures++;
      const [provider] = calls[i]!;
      const recent = r.value
        .filter((e: JupEvent) => {
          const ok = provider === "polymarket" ? GAME_SLUG.test(e.metadata.slug ?? "") : KALSHI_GAME.test(e.eventId);
          const start = Number(e.beginAt) * 1000;
          return ok && Number.isFinite(start) && start > 0 && start < now() - GAME_MS;
        })
        .sort((a, b) => Number(b.beginAt) - Number(a.beginAt))
        .slice(0, 4);
      for (const e of recent) {
        out.push({
          eventId: e.eventId,
          provider,
          league: (e.metadata.slug ?? e.eventId).split("-")[0]!.replace(/^kx/i, "").replace(/game$/i, "").toLowerCase(),
          title: e.metadata.title,
          kickoff: new Date(Number(e.beginAt) * 1000).toISOString(),
        });
      }
    });
    const error = failures === calls.length ? "Jupiter Predict did not answer" : null;
    // A failed listing is not cached for long, so one bad moment does not hide the tab for ten minutes.
    listing = { at: error ? now() - LIST_TTL_MS + 30_000 : now(), stubs: out.sort((a, b) => b.kickoff.localeCompare(a.kickoff)), error };
    return listing;
  }

  async function accountsFor(game: VenueGame) {
    const keys = game.markets.flatMap((m) => m.accounts.map((a) => a.pubkey));
    const chain = await fetchMarketResults(keys);
    let read = 0;
    let matched = 0;
    let unread = 0;
    const view = (m: VenueGame["markets"][number]): AccountView[] =>
      m.accounts.map((a) => {
        const c = chain.get(a.pubkey) ?? null;
        return {
          marketId: a.marketId,
          pubkey: a.pubkey,
          explorer: explorerUrl(a.pubkey),
          apiResult: a.apiResult,
          onChain: c ? { outcome: c.outcome, settledAt: c.settledAt, claimsEnabled: c.claimsEnabled } : null,
          agrees: c ? sameResult(a.apiResult, c.outcome) : null,
        };
      });
    for (const m of game.markets) {
      for (const a of view(m)) {
        if (a.agrees === null) unread++;
        else {
          read++;
          if (a.agrees) matched++;
        }
      }
    }
    return { view, chain: { read, matched, unread } };
  }

  async function run(eventId: string): Promise<SolanaCheck> {
    const event = await getEvent(eventId, eventId.startsWith("POLY-"));
    const mapped = mapEvent(event);
    const stamp = new Date(now()).toISOString();
    const empty = { read: 0, matched: 0, unread: 0 };
    if (!mapped.ok) {
      return {
        eventId,
        provider: eventId.startsWith("POLY-") ? "polymarket" : "kalshi",
        title: event.metadata.title,
        league: "",
        kickoff: "",
        checkedAt: stamp,
        status: "refused",
        note: `Not checked: ${mapped.reason}.`,
        venue: { headline: "", markets: [] },
        audit: null,
        plan: [],
        chain: empty,
        testnet: true,
      };
    }
    const game = mapped.game;
    const { view, chain } = await accountsFor(game);
    const main = game.markets.filter((m) => m.type === "moneyline" || m.type === "team_win" || m.type === "draw");
    const settledMain = main.find((m) => m.result.kind === "winner" && (m.type === "moneyline" || m.result.label === "Yes"));
    const headline = settledMain
      ? settledMain.type === "moneyline"
        ? describeResult(settledMain.result)
        : settledMain.type === "draw"
          ? "Draw"
          : settledMain.label.replace(/ win$/, "")
      : describeResult(main[0]!.result);
    const base = {
      eventId,
      provider: game.provider,
      title: game.title,
      league: game.league,
      kickoff: game.kickoff.toISOString(),
      checkedAt: stamp,
      venue: {
        headline,
        markets: game.markets
          .filter((m) => main.includes(m))
          .map((m) => ({ label: m.label, type: m.type, result: describeResult(m.result), accounts: view(m) })),
      },
      chain,
      testnet: true as const,
    };

    const got = await options.checker.evidenceForGame(game.markets[0]!.game);
    if (got.status !== "ok") {
      return { ...base, status: got.status, note: got.note, audit: null, plan: got.plan };
    }
    const audit = auditGame(game, got.evidence, new Date(now()));
    return { ...base, status: "checked", note: audit.note, audit, plan: got.plan };
  }

  return {
    async list() {
      const { stubs: all, error } = await stubs();
      const recorded = new Set(options.record.map((r) => r.eventId));
      return {
        error,
        recorded: options.record,
        recent: all.filter((s) => !recorded.has(s.eventId)),
        paidChecks: options.checker.paidChecksEnabled(),
      };
    },
    /** Checks one Jupiter event. Results are cached, and concurrent callers share one purchase. */
    check(eventId: string): Promise<SolanaCheck> {
      const hit = done.get(eventId);
      if (hit && now() - hit.at < DONE_TTL_MS) return Promise.resolve(hit.result);
      const running = inflight.get(eventId);
      if (running) return running;
      const p = run(eventId)
        .then((result) => {
          // Only a finished audit is kept; budget, network and not-started answers are retried next time.
          if (result.status === "checked" || result.status === "refused") done.set(eventId, { at: now(), result });
          return result;
        })
        .finally(() => inflight.delete(eventId));
      inflight.set(eventId, p);
      return p;
    },
  };
}

export type Solana = ReturnType<typeof createSolana>;
