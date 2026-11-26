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

  /**
   * The node now offers Sepolia payment only as "escrow" (the x402 exact scheme it lists is on Base Sepolia and
   * Solana devnet). Escrow draws on the wallet's Telegraph escrow balance: read the 402 challenge, sign its
   * message with personal_sign, retry with X-PAYMENT, and read the receipt from X-PAYMENT-RESPONSE.
   */
  async function postEscrow(path: string, payload: unknown): Promise<AskResult | null> {
    const body = JSON.stringify(payload);
    const send = (headers: Record<string, string>) =>
      fetch(NODE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body, signal: AbortSignal.timeout(65_000) });
    const first = await send({});
    if (first.status !== 402) return { status: first.status, body: (await first.json()) as Record<string, unknown>, receipt: null };
    const header = first.headers.get("payment-required");
    const challenge = header ? (JSON.parse(Buffer.from(header, "base64").toString()) as { accepts: { scheme: string; network: string; payTo: string; extra?: { message?: string } }[] }) : null;
    const escrow = challenge?.accepts.find((a) => a.scheme === "escrow" && a.network === NETWORK);
    const template = escrow?.extra?.message;
    if (!escrow || !template) return null;
    const value = /Amount:\s*(\d+)\s*uUSDC/.exec(template)?.[1];
    if (!value || Number(value) > Number(MAX_PER_CALL)) throw new Error("the node's quote is above Gainsay's per-call ceiling");
    const validAfter = Math.floor(Date.now() / 1000) - 30;
    const validBefore = validAfter + 90;
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
    const from = account.address.toLowerCase();
    const message = template
      .replace("{from}", from)
      .replace("{nonce}", nonce)
      .replace("{validAfter}", String(validAfter))
      .replace("{validBefore}", String(validBefore));
    const signature = await account.signMessage({ message });
    const paid = await send({
      "x-payment": Buffer.from(
        JSON.stringify({
          x402Version: 2,
          scheme: "escrow",
          network: escrow.network,
          payload: { signature, authorization: { from, to: escrow.payTo, value, validAfter: String(validAfter), validBefore: String(validBefore), nonce } },
        }),
      ).toString("base64"),
    });
    const answer = (await paid.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = paid.headers.get("x-payment-response");
    const receipt = raw ? (JSON.parse(Buffer.from(raw, "base64").toString()) as Receipt) : null;
    return { status: paid.status, body: answer, receipt };
  }

  async function post(path: string, payload: unknown): Promise<AskResult> {
    const escrow = await postEscrow(path, payload);
    if (escrow) return escrow;
    // No escrow option offered: fall back to the x402 exact scheme on Sepolia.
    const res = await paidFetch(NODE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as Record<string, unknown>;
    const header = res.headers.get("x-telegraph-receipt");
    const receipt = header
      ? (JSON.parse(Buffer.from(header, "base64").toString()) as Receipt)
      : null;
    return { status: res.status, body, receipt };
  }

  return {
    ask: (intent: string, params: Record<string, unknown>, minerId?: string) =>
      post(minerId ? `/engine/v1/ask/${minerId}` : "/engine/v1/ask", { intent, params }),
    /** Calls a provider's own endpoint with its own parameters. */
    askNative: (minerId: string, endpoint: string, payload: Record<string, unknown>) =>
      post(`/engine/v1/ask/${minerId}`, { method: "GET", endpoint, payload }),
  };
}

export async function lookupSignal(hash: string): Promise<unknown> {
  const res = await fetch(`${NODE}/engine/v1/signal/${hash}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`signal lookup ${res.status}`);
  return res.json();
}
