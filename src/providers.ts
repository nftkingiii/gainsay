import { pickIndependent, type Miner } from "./telegraph/independence.ts";

const NODE = process.env.TELEGRAPH_NODE_URL ?? "https://devnode.telegraphprotocol.com";
const intent = process.argv[2] ?? "EVENT_OUTCOME_RESOLUTION";

const res = await fetch(`${NODE}/engine/v1/intents/${intent}/miners`, {
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) throw new Error(`telegraph ${res.status}`);
const body = (await res.json()) as Miner[] | { miners: Miner[] };
const miners = Array.isArray(body) ? body : body.miners;

const { picked, dropped } = pickIndependent(miners);
console.log(`${intent}: ${miners.length} providers, ${picked.length} independent sources`);
for (const p of picked) if (p.accepted) console.log(`  use  ${p.miner.id} ${p.miner.slug} [${p.source}]`);
for (const d of dropped) if (!d.accepted) console.log(`  skip ${d.miner.slug}: ${d.reason}`);
