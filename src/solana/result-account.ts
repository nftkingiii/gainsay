/**
 * Jupiter Prediction Market's on-chain MarketResult account.
 * Layout verified from the program's own Anchor IDL, stored on-chain:
 *   program 3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp, IDL account 3rFCKtvgmZeyy27Gj3azhbndZwXyuKqBYh1ogerUUmw8
 *   (name prediction_market, version 0.10.0, "Jupiter Prediction Market"), read 2026-11-26.
 * Fields: 8-byte discriminator, market_id (u32 length + utf8), outcome u8 (0 No, 1 Yes, 2 Split 50/50, 3 Refund),
 * settlement_time i64, claims_enabled bool, created_at i64, bump u8. The accounts are 95 bytes, with zero padding after.
 */
export const PROGRAM = "3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp";
export const IDL_ACCOUNT = "3rFCKtvgmZeyy27Gj3azhbndZwXyuKqBYh1ogerUUmw8";
const DISCRIMINATOR = Buffer.from("e474c0ea7d36458e", "hex");
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export type OnChainOutcome = "no" | "yes" | "split" | "refund";
const OUTCOMES: Record<number, OnChainOutcome> = { 0: "no", 1: "yes", 2: "split", 3: "refund" };

export interface MarketResultAccount {
  pubkey: string;
  /** The program's own market id, not Jupiter's marketId. */
  programMarketId: string;
  outcome: OnChainOutcome;
  settledAt: string;
  claimsEnabled: boolean;
  createdAt: string;
}

export interface RawAccount {
  owner: string;
  data: string;
}

/** Returns null for anything that is not a MarketResult owned by the Jupiter program. */
export function decodeMarketResult(pubkey: string, account: RawAccount | null): MarketResultAccount | null {
  if (!account || account.owner !== PROGRAM) return null;
  const b = Buffer.from(account.data, "base64");
  if (b.length < 12 || !b.subarray(0, 8).equals(DISCRIMINATOR)) return null;
  const idLength = b.readUInt32LE(8);
  const end = 12 + idLength;
  if (idLength > 64 || b.length < end + 1 + 8 + 1 + 8 + 1) return null;
  const outcome = OUTCOMES[b[end]!];
  if (!outcome) return null;
  const at = (offset: number) => new Date(Number(b.readBigInt64LE(offset)) * 1000).toISOString();
  return {
    pubkey,
    programMarketId: b.subarray(12, end).toString("utf8"),
    outcome,
    settledAt: at(end + 1),
    claimsEnabled: b[end + 9] === 1,
    createdAt: at(end + 10),
  };
}

/** One batched read of many result accounts, in the order given. Failures return nulls, never guesses. */
export async function fetchMarketResults(pubkeys: string[]): Promise<Map<string, MarketResultAccount | null>> {
  const out = new Map<string, MarketResultAccount | null>();
  const unique = [...new Set(pubkeys)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [batch, { encoding: "base64" }] }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json()) as { result?: { value: ({ owner: string; data: [string, string] } | null)[] } };
      batch.forEach((key, n) => {
        const v = body.result?.value[n];
        out.set(key, v ? decodeMarketResult(key, { owner: v.owner, data: v.data[0] }) : null);
      });
    } catch {
      for (const key of batch) out.set(key, null);
    }
  }
  return out;
}

export const explorerUrl = (pubkey: string) => `https://explorer.solana.com/address/${pubkey}`;
