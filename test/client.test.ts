import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAsker } from "../src/telegraph/client.ts";

// Hardhat's well-known first test key: public, holds nothing.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const challenge = {
  accepts: [
    { scheme: "exact", network: "eip155:84532", payTo: "0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e", amount: "10000" },
    {
      scheme: "escrow",
      network: "eip155:11155111",
      payTo: "0x72a70e949362670bf8bcead24efc5b8f950aa08b",
      extra: {
        message:
          "Telegraph Escrow Payment\n\nWallet: {from}\nPay To: 0x72a70e949362670bf8bcead24efc5b8f950aa08b\nNetwork: eip155:11155111\nAmount: 10000 uUSDC\nResource: /v1/ask/7330\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}",
      },
    },
  ],
};

test("pays from escrow when the node offers it, signing the quoted message", async () => {
  const realFetch = globalThis.fetch;
  const seen: { payment?: string }[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ payment: headers["x-payment"] });
    if (!headers["x-payment"]) {
      return new Response("{}", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") } });
    }
    const receipt = { receipt_hash: "0xreceipt", rail: "escrow", amount_uusdc: 10000 };
    return new Response(JSON.stringify({ result: { ok: true }, signal_hash: "0xsignal" }), {
      status: 200,
      headers: { "x-payment-response": Buffer.from(JSON.stringify(receipt)).toString("base64") },
    });
  }) as typeof fetch;
  try {
    const out = await createAsker(KEY).askNative("7330", "/score", { question: "x" });
    assert.equal(out.status, 200);
    assert.equal(out.body.signal_hash, "0xsignal");
    assert.equal(out.receipt?.receipt_hash, "0xreceipt");
    const sent = JSON.parse(Buffer.from(seen[1]!.payment!, "base64").toString()) as {
      scheme: string;
      payload: { signature: `0x${string}`; authorization: { from: string; value: string; nonce: string; validAfter: string; validBefore: string } };
    };
    assert.equal(sent.scheme, "escrow");
    const a = sent.payload.authorization;
    assert.equal(a.value, "10000");
    const message = (challenge.accepts[1]!.extra!.message as string)
      .replace("{from}", a.from)
      .replace("{nonce}", a.nonce)
      .replace("{validAfter}", a.validAfter)
      .replace("{validBefore}", a.validBefore);
    assert.ok(await verifyMessage({ address: privateKeyToAccount(KEY).address, message, signature: sent.payload.signature }));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refuses a quote above the per-call ceiling", async () => {
  const realFetch = globalThis.fetch;
  const dear = JSON.parse(JSON.stringify(challenge));
  dear.accepts[1].extra.message = dear.accepts[1].extra.message.replace("10000 uUSDC", "50000 uUSDC");
  globalThis.fetch = (async () =>
    new Response("{}", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(dear)).toString("base64") } })) as typeof fetch;
  try {
    await assert.rejects(createAsker(KEY).askNative("7330", "/score", {}), /ceiling/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
