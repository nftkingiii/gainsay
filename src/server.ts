import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { resolveMarket } from "./gamma.ts";
import { createChecker } from "./service/checker.ts";
import { createFeed } from "./service/feed.ts";
import { createAsker } from "./telegraph/client.ts";

const env = process.env;
const key = env.GAINSAY_EVM_PRIVATE_KEY as `0x${string}` | undefined;
const dailyBudgetUsd = Number(env.GAINSAY_DAILY_BUDGET_USD ?? "0");

const checker = createChecker({ asker: key ? createAsker(key) : null, dailyBudgetUsd });
const feed = createFeed({
  wsUrl: env.POLYGON_WS_URL ?? "wss://polygon-bor-rpc.publicnode.com",
  httpUrl: env.POLYGON_RPC_URL ?? "https://polygon.drpc.org",
  checker,
  autoCheck: env.GAINSAY_AUTO_CHECK === "true",
  log: (message) => console.log(message),
});

const PUBLIC = new URL("../public/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const CHECKS_PER_MINUTE = 10;
const hits = new Map<string, { count: number; reset: number }>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const hit = hits.get(ip);
  if (!hit || hit.reset < now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  return ++hit.count <= CHECKS_PER_MINUTE;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4_000) throw new Error("body too large");
  }
  return body;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://gainsay");
  try {
    if (url.pathname === "/api/health") return json(res, 200, { status: "ok" });

    if (url.pathname === "/api/status") {
      return json(res, 200, {
        network: "Ethereum Sepolia testnet (Telegraph), Polygon mainnet (UMA)",
        paidChecks: checker.paidChecksEnabled(),
        budgetLeftUsd: checker.budgetLeftUsd(),
        autoCheck: env.GAINSAY_AUTO_CHECK === "true",
      });
    }

    if (url.pathname === "/api/feed") return json(res, 200, feed.snapshot());

    if (url.pathname === "/api/check" && req.method === "POST") {
      const forwarded = req.headers["x-real-ip"];
      const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.socket.remoteAddress ?? "unknown";
      if (!allowed(ip)) return json(res, 429, { error: "Too many checks. Wait a minute." });

      const { market: input } = JSON.parse(await readBody(req)) as { market?: string };
      if (!input || input.length > 300) return json(res, 400, { error: "Paste a Polymarket market link or id." });
      const resolved = await resolveMarket(input);
      if (!resolved) return json(res, 404, { error: "No Polymarket market matches that link or id." });
      if ("choices" in resolved) return json(res, 300, { choices: resolved.choices });
      const result = await checker.check(resolved.market, feed.proposalFor(resolved.market.id));
      return json(res, 200, result);
    }

    if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(PUBLIC, path));
    if (!file.startsWith(normalize(PUBLIC)) || !TYPES[extname(file)]) return json(res, 404, { error: "not found" });
    const content = await readFile(file).catch(() => null);
    if (!content) return json(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": TYPES[extname(file)]!, "cache-control": "no-cache" });
    res.end(content);
  } catch (error) {
    console.error((error as Error).message);
    json(res, 500, { error: "Something went wrong on our side. Try again." });
  }
});

server.listen(Number(env.PORT ?? 8090), () => {
  console.log(`gainsay listening; paid checks ${checker.paidChecksEnabled() ? "on" : "off"}`);
  feed.start();
});
