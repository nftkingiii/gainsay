import { marketById } from "./gamma.ts";
import { createAsker } from "./telegraph/client.ts";
import { decide } from "./verdict/engine.ts";
import type { Evidence } from "./verdict/evidence.ts";
import { parseGameMarket } from "./verdict/market.ts";
import { requestsFor } from "./verdict/route.ts";

const [marketId, proposed, flag] = process.argv.slice(2);
if (!marketId || !proposed) throw new Error("usage: check.ts <gamma market id> <0|1> [--pay]");

const raw = await marketById(marketId);
if (!raw) throw new Error(`no market ${marketId}`);
const market = parseGameMarket(raw);
if (!market) {
  console.log(JSON.stringify({ verdict: "no_independent_source", note: "final scores cannot settle this market type", question: raw.question }));
  process.exit(0);
}

const requests = requestsFor(market);
const started = Date.now() >= market.kickoff.getTime();
console.log(`${raw.question} | ${market.kind} | ${market.league} | bond ${raw.umaBond ?? "?"}, reward ${raw.umaReward ?? "?"}`);

const evidence: Evidence[] = [];
if (started && requests.length && flag !== "--pay") {
  console.log(`dry run: would buy ${requests.map((r) => `${r.label} (miner ${r.minerId})`).join(", ")} at about $${(requests.length * 0.01).toFixed(2)}. Add --pay to buy.`);
  process.exit(0);
}
if (started && flag === "--pay") {
  const key = process.env.GAINSAY_EVM_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("GAINSAY_EVM_PRIVATE_KEY is not set");
  const asker = createAsker(key);
  for (const request of requests) {
    const { status, body, receipt } = await asker.askNative(request.minerId, request.endpoint, request.payload);
    if (status !== 200 || typeof body.signal_hash !== "string") {
      console.log(`${request.label}: failed with status ${status}`);
      continue;
    }
    evidence.push(
      ...request.read(body.result, {
        minerId: request.minerId,
        signalHash: body.signal_hash,
        receiptHash: receipt?.receipt_hash ?? null,
        costUsd: 0.01,
      }),
    );
  }
}

const verdict = decide(market, Number(proposed), evidence, new Date());
console.log(
  JSON.stringify(
    {
      verdict: verdict.verdict,
      note: verdict.note,
      singleSource: verdict.singleSource,
      costUsd: verdict.costUsd,
      accepted: verdict.accepted,
      rejected: verdict.rejected.length,
      firstRejection: verdict.rejected[0]?.reason,
    },
    null,
    2,
  ),
);
