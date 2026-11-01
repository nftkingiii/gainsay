import { createAsker, lookupSignal } from "./telegraph/client.ts";

const [intent, paramsJson, minerId] = process.argv.slice(2);
if (!intent || !paramsJson) throw new Error("usage: ask.ts <INTENT> '<params json>' [minerId]");

const key = process.env.GAINSAY_EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("GAINSAY_EVM_PRIVATE_KEY is not set");

const ask = createAsker(key);
const { status, body, receipt } = await ask(intent, JSON.parse(paramsJson) as Record<string, unknown>, minerId);
console.log(JSON.stringify({ status, body, receipt }, null, 2));

const hash = body.signal_hash;
if (typeof hash === "string") {
  const signal = (await lookupSignal(hash)) as { verification?: unknown };
  console.log("signal lookup verification:", JSON.stringify(signal.verification));
}
