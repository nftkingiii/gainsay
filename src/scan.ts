import { findMarket, marketById } from "./gamma.ts";
import { decodeProposal, MANAGED_ORACLE, PROPOSE_TOPIC, type RawLog } from "./uma/events.ts";
import { lookupFor } from "./uma/mapping.ts";
import { parseGameMarket } from "./verdict/market.ts";
import { requestsFor } from "./verdict/route.ts";

const RPC = process.env.POLYGON_RPC_URL ?? "https://polygon.drpc.org";
const hours = Number(process.argv[2] ?? 2);
const STEP = 100;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.result === undefined) throw new Error(body.error?.message ?? "rpc error");
  return body.result;
}

const head = Number(await rpc<string>("eth_blockNumber", []));
const from = head - Math.round((hours * 3600) / 2.1);
const counts = { seen: 0, refused: 0, unmapped: 0, unsupported: 0, noProvider: 0, usable: 0 };

for (let block = from; block <= head; block += STEP) {
  const logs = await rpc<RawLog[]>("eth_getLogs", [
    {
      address: MANAGED_ORACLE,
      topics: [[PROPOSE_TOPIC]],
      fromBlock: "0x" + block.toString(16),
      toBlock: "0x" + Math.min(block + STEP - 1, head).toString(16),
    },
  ]);
  for (const log of logs) {
    counts.seen++;
    const proposal = decodeProposal(log);
    const lookup = lookupFor(proposal);
    if (!lookup) { counts.refused++; continue; }
    const found = await findMarket(lookup).catch(() => null);
    const raw = found ? await marketById(found.id).catch(() => null) : null;
    if (!raw) { counts.unmapped++; continue; }
    const market = parseGameMarket(raw);
    if (!market) { counts.unsupported++; continue; }
    if (!requestsFor(market).length) { counts.noProvider++; continue; }
    counts.usable++;
    const minutes = Math.round((proposal.expiresAt - Date.now() / 1000) / 60);
    console.log(`${raw.id}\t${proposal.proposedValue}\t${market.kind}\t${market.league}\t${minutes}m\t${market.kickoff.toISOString()}\t${raw.question}`);
  }
}
console.log(JSON.stringify(counts));
