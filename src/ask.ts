import { createAsker, lookupSignal } from "./telegraph/client.ts";

const usage = "usage: ask.ts <INTENT> '<params json>' [minerId] | ask.ts native <minerId> <endpoint> '<payload json>'";
const args = process.argv.slice(2);

const key = process.env.GAINSAY_EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("GAINSAY_EVM_PRIVATE_KEY is not set");
const asker = createAsker(key);

async function run() {
  if (args[0] === "native") {
    const [, minerId, endpoint, payload] = args;
    if (!minerId || !endpoint || !payload) throw new Error(usage);
    return asker.askNative(minerId, endpoint, JSON.parse(payload) as Record<string, unknown>);
  }
  const [intent, params, minerId] = args;
  if (!intent || !params) throw new Error(usage);
  return asker.ask(intent, JSON.parse(params) as Record<string, unknown>, minerId);
}

const { status, body, receipt } = await run();
console.log(JSON.stringify({ status, body, receipt }, null, 2));

const hash = body.signal_hash;
if (typeof hash === "string") {
  const signal = (await lookupSignal(hash)) as { verification?: unknown };
  console.log("signal lookup verification:", JSON.stringify(signal.verification));
}
