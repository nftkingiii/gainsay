// Thin wrapper around the Virtuals ACP CLI (@virtuals-protocol/acp-cli).
// Each role runs with its own ACP_CONFIG_DIR, whose active agent is that role's agent.
// Signer keys stay in the OS keychain; nothing secret passes through here.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

const ACP_JS = env.ACP_CLI_JS ?? join(env.APPDATA ?? "", "npm", "node_modules", "@virtuals-protocol", "acp-cli", "dist", "bin", "acp.js");
export const CHAIN = env.ACP_CHAIN_ID ?? "8453";

export type Role = "seller" | "buyer";

export function acp(role: Role, args: string[]): any {
  const r = spawnSync(process.execPath, [ACP_JS, ...args, "--json"], {
    env: { ...env, ACP_CONFIG_DIR: join(homedir(), ".config", `acp-${role}`) },
    encoding: "utf8",
    timeout: 180_000,
  });
  const out = (r.stdout ?? "").trim();
  if (r.status !== 0) throw new Error(`acp ${args.slice(0, 2).join(" ")} failed: ${(out || r.stderr || "").slice(0, 400)}`);
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

/** Status and messages of one job, as the CLI reports them. */
export function history(role: Role, jobId: string) {
  return acp(role, ["job", "history", "--job-id", jobId, "--chain-id", CHAIN]);
}

export function statusOf(h: any): string {
  const s = h?.status ?? h?.job?.status ?? h?.data?.status ?? "";
  return String(s).toLowerCase();
}

export function messagesOf(h: any): any[] {
  return h?.entries ?? h?.messages ?? h?.job?.messages ?? h?.data?.messages ?? [];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function log(role: string, msg: string, extra?: unknown) {
  console.log(`${new Date().toISOString()} [${role}] ${msg}${extra === undefined ? "" : " " + JSON.stringify(extra)}`);
}
