import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { auditGame, auditMarket } from "../src/solana/audit.ts";
import type { JupEvent } from "../src/solana/jupiter.ts";
import { decodeMarketResult } from "../src/solana/result-account.ts";
import { kalshiGame, polymarketGame, type VenueGame } from "../src/solana/venue.ts";
import type { Evidence } from "../src/verdict/evidence.ts";

// Real Jupiter Predict responses and Solana account reads recorded 2026-11-26 (markets trimmed to the ones under test).
const load = <T>(name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
const nbaEvent = load<JupEvent>("jupiter-poly-nba.json");
const uclEvent = load<JupEvent>("jupiter-poly-ucl.json");
const kalshiEvents = load<JupEvent[]>("jupiter-kalshi-nba.json");
const chain = load<{ accounts: Record<string, { owner: string; space: number; data: string } | null> }>("solana-result-accounts.json").accounts;

const game = (m: ReturnType<typeof polymarketGame>): VenueGame => {
  assert.ok(m.ok, m.ok ? "" : m.reason);
  return m.game;
};
const kalshi = (id: string) => game(kalshiGame(kalshiEvents.find((e) => e.eventId === id)!));

const evidence = (over: Partial<Evidence>): Evidence => ({
  source: "espn-test",
  minerId: "7330",
  home: "Philadelphia 76ers",
  away: "Miami Heat",
  homeScore: 112,
  awayScore: 107,
  finished: true,
  kickoff: new Date("2026-11-25T22:00:00Z"),
  signalHash: "0xaaa",
  receiptHash: "0xbbb",
  costUsd: 0.01,
  ...over,
});
const after = new Date("2026-11-26T06:00:00Z");

test("decodes the on-chain MarketResult layout the program's IDL describes", () => {
  const heat = decodeMarketResult("TXWNqVSWq99SbkBSLG5AUmvdXGoc62udRaJQfTRSXth", { owner: chain["TXWNqVSWq99SbkBSLG5AUmvdXGoc62udRaJQfTRSXth"]!.owner, data: chain["TXWNqVSWq99SbkBSLG5AUmvdXGoc62udRaJQfTRSXth"]!.data });
  const sixers = decodeMarketResult("ifJykH3U8oynDVZBaVLiPSyMvvrnqfkfnuq7BhhJ3HX", { owner: chain["ifJykH3U8oynDVZBaVLiPSyMvvrnqfkfnuq7BhhJ3HX"]!.owner, data: chain["ifJykH3U8oynDVZBaVLiPSyMvvrnqfkfnuq7BhhJ3HX"]!.data });
  assert.equal(heat?.outcome, "no");
  assert.equal(sixers?.outcome, "yes");
  assert.equal(sixers?.claimsEnabled, true);
  assert.match(sixers!.settledAt, /^2026-11-26T/);
});

test("refuses accounts that are not Jupiter MarketResults", () => {
  const key = "TXWNqVSWq99SbkBSLG5AUmvdXGoc62udRaJQfTRSXth";
  assert.equal(decodeMarketResult(key, { owner: "11111111111111111111111111111111", data: chain[key]!.data }), null);
  assert.equal(decodeMarketResult(key, { owner: chain[key]!.owner, data: Buffer.alloc(95).toString("base64") }), null);
  assert.equal(decodeMarketResult(key, null), null);
});

test("maps a Polymarket NBA event: moneyline, totals and spreads, with the venue's winner", () => {
  const g = game(polymarketGame(nbaEvent));
  assert.equal(g.league, "nba");
  assert.equal(g.kickoff.toISOString(), "2026-11-25T22:00:00.000Z");
  const [moneyline] = g.markets;
  assert.equal(moneyline!.type, "moneyline");
  assert.deepEqual(moneyline!.result, { kind: "winner", side: "second", label: "76ers" });
  assert.equal(moneyline!.accounts.length, 2);
  assert.equal(g.markets.filter((m) => m.type === "total").length, 2);
  assert.equal(g.markets.filter((m) => m.type === "spread").length, 2);
});

test("the recorded venue results on every line agree with one score of 112 to 107", () => {
  const g = game(polymarketGame(nbaEvent));
  const a = auditGame(g, [evidence({})], after);
  assert.equal(a.headline, "holds");
  assert.equal(a.lines.total, 4);
  assert.equal(a.lines.wrong, 0, a.lines.wrongLabels.join(","));
  assert.equal(a.lines.holds, 4);
});

test("a venue result the score contradicts is wrong", () => {
  const g = game(polymarketGame(nbaEvent));
  const a = auditGame(g, [evidence({ homeScore: 100, awayScore: 107 })], after);
  assert.equal(a.headline, "wrong");
});

test("an answer about another game never counts", () => {
  const g = game(polymarketGame(nbaEvent));
  const a = auditGame(g, [evidence({ home: "Boston Celtics", away: "Chicago Bulls" })], after);
  assert.equal(a.headline, "no_independent_source");
  assert.ok(a.rejected.length > 0);
});

test("before kickoff or unfinished is too early", () => {
  const g = game(polymarketGame(nbaEvent));
  assert.equal(auditGame(g, [], new Date("2026-11-25T10:00:00Z")).headline, "too_early");
  assert.equal(auditGame(g, [evidence({ finished: false })], after).headline, "too_early");
});

test("maps Polymarket soccer as three yes/no markets and judges the draw market too", () => {
  const g = game(polymarketGame(uclEvent));
  assert.equal(g.league, "ucl");
  const types = g.markets.map((m) => m.type).sort();
  assert.deepEqual(types, ["draw", "team_win", "team_win", "total"]);
  const liverpool = g.markets.find((m) => m.label.startsWith("Liverpool"))!;
  assert.deepEqual(liverpool.result, { kind: "winner", side: "first", label: "Yes" });
  const win = evidence({ home: "Club Brugge", away: "Liverpool", homeScore: 0, awayScore: 3, kickoff: new Date("2026-11-25T20:00:00Z") });
  const a = auditGame(g, [win], after);
  assert.equal(a.headline, "holds");
  assert.equal(a.main.length, 3);
  assert.equal(a.lines.holds, 1);
  const level = auditGame(g, [{ ...win, homeScore: 1, awayScore: 1 }], after);
  assert.equal(level.headline, "wrong");
});

test("a Kalshi refund is contested when the official score decides the game", () => {
  const g = kalshi("KXNBAGAME-26JAN25DALMIL");
  assert.equal(g.markets[0]!.result.kind, "refund");
  const played = evidence({ home: "Milwaukee Bucks", away: "Dallas Mavericks", kickoff: g.kickoff });
  assert.equal(auditGame(g, [played], after).headline, "contested");
  assert.equal(auditGame(g, [], after).headline, "no_independent_source");
});

test("a refund matches a tie", () => {
  const g = kalshi("KXNBAGAME-26JAN25DALMIL");
  const tie = evidence({ home: "Milwaukee Bucks", away: "Dallas Mavericks", homeScore: 100, awayScore: 100, kickoff: g.kickoff });
  assert.equal(auditMarket(g.markets[0]!, [tie], after).audit, "holds");
});

test("a Kalshi market settled yes on both sides is a split, never a winner", () => {
  const g = kalshi("KXNBAGAME-26JAN25DENMEM");
  assert.equal(g.markets[0]!.result.kind, "split");
  const played = evidence({ home: "Memphis Grizzlies", away: "Denver Nuggets", kickoff: g.kickoff });
  assert.equal(auditGame(g, [played], after).headline, "contested");
});

test("a Kalshi game maps away at home, and the winner is the team marked yes", () => {
  const g = kalshi("KXNBAGAME-26JAN30TORORL");
  assert.deepEqual(g.markets[0]!.game.outcomes, ["Toronto", "Orlando"]);
  assert.deepEqual(g.markets[0]!.result, { kind: "winner", side: "second", label: "Orlando" });
  const real = evidence({ home: "Orlando Magic", away: "Toronto Raptors", kickoff: g.kickoff });
  assert.equal(auditGame(g, [real], after).headline, "holds");
  assert.equal(auditGame(g, [{ ...real, homeScore: 90, awayScore: 99 }], after).headline, "wrong");
});

test("refuses team names it cannot tell apart", () => {
  const clone: JupEvent = JSON.parse(JSON.stringify(kalshiEvents[2]));
  clone.metadata.title = "Toronto at Los Angeles X";
  clone.markets![1]!.title = "Los Angeles X";
  assert.equal(kalshiGame(clone).ok, false);
  clone.eventId = "KXNCAABGAME-26JAN30TORORL";
  assert.equal(kalshiGame(clone).ok, false);
});

test("skips leagues Gainsay cannot settle", () => {
  const cbb: JupEvent = JSON.parse(JSON.stringify(nbaEvent));
  cbb.metadata.slug = "cbb-duke-unc-2026-11-25";
  assert.equal(polymarketGame(cbb).ok, false);
});
