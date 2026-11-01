import { findMarket } from "./gamma.ts";
import { decodeProposal, MANAGED_ORACLE, PROPOSE_TOPIC, type RawLog } from "./uma/events.ts";
import { lookupFor, titleOf } from "./uma/mapping.ts";

const WS_URL = process.env.POLYGON_WS_URL ?? "wss://polygon-bor-rpc.publicnode.com";
const seconds = Number(process.argv[2] ?? 120);

async function handle(log: RawLog) {
  const proposal = decodeProposal(log);
  const lookup = lookupFor(proposal);
  const minutes = Math.round((proposal.expiresAt - Date.now() / 1000) / 60);
  const title = titleOf(proposal).slice(0, 60);
  if (!lookup) {
    console.log(`refused  ${proposal.requester.slice(0, 10)} ${title}`);
    return;
  }
  const market = await findMarket(lookup).catch(() => null);
  console.log(
    `${market ? "mapped " : "unmapped"} ${proposal.proposedValue} ${minutes}m left | ${title}` +
      (market ? ` -> market ${market.id}, bond ${market.umaBond}` : ""),
  );
}

const ws = new WebSocket(WS_URL);
ws.onopen = () =>
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_subscribe",
      params: ["logs", { address: MANAGED_ORACLE, topics: [[PROPOSE_TOPIC]] }],
    }),
  );
ws.onmessage = (event) => {
  const message = JSON.parse(String(event.data)) as { params?: { result: RawLog } };
  if (message.params) void handle(message.params.result);
};
ws.onerror = () => {
  console.error("websocket error");
  process.exit(1);
};
setTimeout(() => {
  ws.close();
  process.exit(0);
}, seconds * 1000);
