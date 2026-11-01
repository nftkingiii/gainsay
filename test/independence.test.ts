import assert from "node:assert/strict";
import { test } from "node:test";
import { pickIndependent, screen } from "../src/telegraph/independence.ts";

const miner = (slug: string, base_url: string, description = "") => ({
  id: slug,
  slug,
  base_url,
  description,
});

test("rejects providers derived from a market venue", () => {
  const direct = screen(miner("event-poly-tags", "https://gamma-api.polymarket.com"));
  assert.equal(direct.accepted, false);
  const proxied = screen(
    miner("event-poly-clob-winner", "https://omni-chat.13.237.89.59.sslip.io", "Polymarket gamma resolved_yes"),
  );
  assert.equal(proxied.accepted, false);
});

test("rejects unidentified proxy hosts", () => {
  const result = screen(miner("sku-x", "https://omni-chat.13.237.89.59.sslip.io"));
  assert.deepEqual(result.accepted, false);
});

test("counts two wrappers of one feed as one source", () => {
  const { picked, dropped } = pickIndependent([
    miner("event-espn-nba-scoreboard", "https://site.api.espn.com"),
    miner("sportwire-game-result", "https://telegraph-sport.margyn.workers.dev", "read live from ESPN's public scoreboard"),
    miner("event-nhl-schedule", "https://api-web.nhle.com"),
  ]);
  assert.equal(picked.length, 2);
  assert.equal(dropped.length, 1);
});

test("keeps an unknown third-party host as its own source", () => {
  const result = screen(miner("scorewire-oracle", "https://scorewire.shadrakbessanh.me"));
  assert.ok(result.accepted);
  assert.equal(result.source, "scorewire.shadrakbessanh.me");
});
