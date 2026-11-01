import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const NODE = process.env.TELEGRAPH_NODE_URL ?? "https://devnode.telegraphprotocol.com";
const NETWORK = "eip155:11155111";
const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
/** Hard ceiling per call, in micro-USDC ($0.02). */
const MAX_PER_CALL = "20000";

export interface Receipt {
  receipt_hash: string;
  rail: string;
  payer: string;
  miner: string;
  intent: string;
  amount_uusdc: string;
  epoch_id: number;
  settlement: string;
  chain: string;
  tx_hash: string;
  timestamp: number;
}

export interface AskResult {
  status: number;
  body: Record<string, unknown>;
  receipt: Receipt | null;
}

export function createAsker(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
    spendControls: {
      allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: MAX_PER_CALL }],
    },
  });

  return async function ask(
    intent: string,
    params: Record<string, unknown>,
    minerId?: string,
  ): Promise<AskResult> {
    const path = minerId ? `/engine/v1/ask/${minerId}` : "/engine/v1/ask";
    const res = await paidFetch(NODE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, params }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    const header = res.headers.get("x-telegraph-receipt");
    const receipt = header
      ? (JSON.parse(Buffer.from(header, "base64").toString()) as Receipt)
      : null;
    return { status: res.status, body, receipt };
  };
}

export async function lookupSignal(hash: string): Promise<unknown> {
  const res = await fetch(`${NODE}/engine/v1/signal/${hash}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`signal lookup ${res.status}`);
  return res.json();
}
