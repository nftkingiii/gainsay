import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeProposal, type RawLog } from "../src/uma/events.ts";
import { lookupFor, titleOf } from "../src/uma/mapping.ts";

const logs = JSON.parse(
  readFileSync(new URL("./fixtures/proposals-sample.json", import.meta.url), "utf8"),
) as RawLog[];
const proposals = logs.map(decodeProposal);

test("decodes every recorded proposal", () => {
  assert.equal(proposals.length, 36);
  for (const p of proposals) {
    assert.ok([0, 0.5, 1].includes(p.proposedValue));
    assert.ok(p.expiresAt > 1_700_000_000);
    assert.ok(titleOf(p).length > 0);
  }
});

test("maps text-format proposals by question ID", () => {
  const text = proposals.filter((p) => p.requester.startsWith("0x6507"));
  assert.equal(text.length, 5);
  for (const p of text) {
    assert.deepEqual(lookupFor(p), { by: "questionID", value: p.ancillaryHash });
  }
});

test("maps JSON-format proposals by integration ID", () => {
  const json = proposals.filter((p) => p.requester.startsWith("0x5370"));
  assert.equal(json.length, 28);
  for (const p of json) {
    const lookup = lookupFor(p);
    assert.equal(lookup?.by, "id");
    assert.match(lookup?.value ?? "", /^\d+$/);
  }
});

test("refuses requesters that are not Polymarket", () => {
  const other = proposals.filter((p) => p.requester.startsWith("0x69c4"));
  assert.equal(other.length, 3);
  for (const p of other) assert.equal(lookupFor(p), null);
});

test("refuses a JSON proposal from another integration", () => {
  const sample = proposals.find((p) => p.requester.startsWith("0x5370"));
  assert.ok(sample);
  const forged = {
    ...sample,
    ancillaryText: sample.ancillaryText.replace('"integration":"polymarket"', '"integration":"other"'),
  };
  assert.equal(lookupFor(forged), null);
});
