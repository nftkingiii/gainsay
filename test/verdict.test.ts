import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decide, sameTeam } from "../src/verdict/engine.ts";
import { fromMlbOfficial, fromNhlOfficial, fromSportwire, type Evidence } from "../src/verdict/evidence.ts";
import { parseGameMarket, type GameMarket } from "../src/verdict/market.ts";

// Real paid Telegraph responses, recorded 2026-11-01.
const recorded = JSON.parse(
  readFileSync(new URL("./fixtures/evidence-recorded.json", import.meta.url), "utf8"),
) as Record<string, { result: Record<string, unknown>; signal_hash: string; receipt_hash: string; miner_id: string }>;

const meta = (key: string) => {
  const run = recorded[key];
  assert.ok(run);
  return { minerId: run.miner_id, signalHash: run.signal_hash, receiptHash: run.receipt_hash, costUsd: 0.01 };
};
const knicksGame = fromSportwire(recorded.sportwire!.result, meta("sportwire"))!;
const wrongGame = fromSportwire(recorded["nhl-sportwire-game"]!.result, meta("nhl-sportwire-game"))!;
const nhlGames = fromNhlOfficial(recorded["nhl-official"]!.result, meta("nhl-official"));
const mlbGames = fromMlbOfficial(recorded["mlb-official"]!.result, meta("mlb-official"));

const after = new Date("2026-11-02T00:00:00Z");
const market = (over: Partial<Parameters<typeof parseGameMarket>[0]>) => {
  const parsed = parseGameMarket({
    question: "Knicks vs. 76ers",
    slug: "nba-nyk-phi-2026-10-30",
    sportsMarketType: "moneyline",
    gameStartTime: "2026-10-30 23:30:00+00",
    outcomes: '["Knicks", "76ers"]',
    ...over,
  });
  assert.ok(parsed);
  return parsed;
};
const avalanche: GameMarket = market({
  question: "Flames vs. Avalanche",
  slug: "nhl-cgy-col-2026-10-31",
  gameStartTime: "2026-11-01 02:00:00+00",
  outcomes: '["Flames", "Avalanche"]',
});

test("matches short and full team names only when they are the same team", () => {
  assert.ok(sameTeam("Knicks", "New York Knicks"));
  assert.ok(!sameTeam("Knicks", "Philadelphia 76ers"));
});

test("skips markets final scores cannot settle", () => {
  assert.equal(parseGameMarket({ question: "Hart: Points O/U 11.5", slug: "nba-x", sportsMarketType: "points", gameStartTime: "2026-10-28 00:00:00+00", outcomes: '["Yes","No"]' }), null);
  assert.equal(parseGameMarket({ question: "Pistons vs. Knicks: 3Q O/U 49.5", slug: "nba-x", sportsMarketType: "q3_totals", gameStartTime: "2026-10-28 00:00:00+00", outcomes: '["Over","Under"]' }), null);
});

test("a correct proposal holds and is flagged as single source", () => {
  const verdict = decide(market({}), 0, [knicksGame], after);
  assert.equal(verdict.verdict, "holds");
  assert.equal(verdict.singleSource, true);
});

test("a contradicted proposal is wrong", () => {
  assert.equal(decide(market({}), 1, [knicksGame], after).verdict, "wrong");
});

test("rejects the recorded wrong-game answer", () => {
  const verdict = decide(avalanche, 1, [wrongGame], after);
  assert.equal(verdict.verdict, "no_independent_source");
  assert.equal(verdict.rejected.length, 1);
  assert.match(verdict.rejected[0]!.reason, /Rockets/);
});

test("keeps the right game out of a whole scoreboard", () => {
  const verdict = decide(avalanche, 0, nhlGames, after);
  assert.equal(verdict.verdict, "holds");
  assert.equal(verdict.accepted.length, 1);
  assert.equal(verdict.rejected.length, nhlGames.length - 1);
  assert.equal(verdict.costUsd.toFixed(2), "0.01");
});

test("settles the recorded MLB answer", () => {
  const brewers = market({
    question: "Brewers vs. Rays",
    slug: "mlb-mil-tb-2026-10-28",
    gameStartTime: "2026-10-29 00:00:00+00",
    outcomes: '["Brewers", "Rays"]',
  });
  assert.equal(decide(brewers, 1, mlbGames, after).verdict, "holds");
});

test("the same teams on another date do not count", () => {
  const rematch = market({ gameStartTime: "2026-10-20 23:30:00+00" });
  const verdict = decide(rematch, 0, [knicksGame], after);
  assert.equal(verdict.verdict, "no_independent_source");
  assert.match(verdict.rejected[0]!.reason, /game at/);
});

test("a game that has not started is too early, with no evidence needed", () => {
  const verdict = decide(market({}), 1, [], new Date("2026-10-30T12:00:00Z"));
  assert.equal(verdict.verdict, "too_early");
  assert.equal(verdict.costUsd, 0);
});

test("an unfinished game is too early", () => {
  const live: Evidence = { ...knicksGame, finished: false };
  assert.equal(decide(market({}), 1, [live], after).verdict, "too_early");
});

test("independent sources that disagree are contested", () => {
  const other: Evidence = { ...knicksGame, source: "other", signalHash: "0xother", homeScore: 80 };
  const verdict = decide(market({}), 0, [knicksGame, other], after);
  assert.equal(verdict.verdict, "contested");
  assert.equal(verdict.singleSource, false);
});

test("settles totals, including a push", () => {
  const total = (line: string) =>
    market({ question: "Knicks vs. 76ers: O/U " + line, sportsMarketType: "totals", line, outcomes: '["Over", "Under"]' });
  assert.equal(decide(total("190.5"), 1, [knicksGame], after).verdict, "holds");
  assert.equal(decide(total("195.5"), 0, [knicksGame], after).verdict, "holds");
  assert.equal(decide(total("191"), 1, [knicksGame], after).verdict, "contested");
});

test("settles spreads from the first outcome's line", () => {
  const spread = (line: string, outcomes: string) =>
    market({ question: "Spread", sportsMarketType: "spreads", line, outcomes });
  // 76ers won by 5.
  assert.equal(decide(spread("-3.5", '["76ers", "Knicks"]'), 1, [knicksGame], after).verdict, "holds");
  assert.equal(decide(spread("-7.5", '["76ers", "Knicks"]'), 0, [knicksGame], after).verdict, "holds");
});

test("with no proposal yet, reports the outcome the score supports", () => {
  const verdict = decide(market({}), null, [knicksGame], after);
  assert.equal(verdict.verdict, "settled");
  assert.equal(verdict.expected, 0);
});
