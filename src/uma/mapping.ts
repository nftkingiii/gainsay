import type { Proposal } from "./events.ts";

export type Lookup =
  | { by: "questionID"; value: string }
  | { by: "negRiskRequestID"; value: string }
  | { by: "id"; value: string };

/**
 * Only these requesters are Polymarket. Others on the same oracle copy its
 * catalogue or belong to other platforms, so they are refused, not guessed.
 */
const REQUESTERS: Record<string, (p: Proposal) => Lookup | null> = {
  "0x65070be91477460d8a7aeeb94ef92fe056c2f2a7": (p) => ({
    by: "questionID",
    value: p.ancillaryHash,
  }),
  "0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d": (p) => ({
    by: "negRiskRequestID",
    value: p.ancillaryHash,
  }),
  "0x53703dd6129d723066b6362510e5ae2fecd48218": (p) => {
    try {
      const body = JSON.parse(p.ancillaryText) as {
        integration?: string;
        integration_id?: string;
      };
      if (body.integration !== "polymarket" || !body.integration_id) return null;
      return { by: "id", value: body.integration_id };
    } catch {
      return null;
    }
  },
};

export function lookupFor(proposal: Proposal): Lookup | null {
  return REQUESTERS[proposal.requester]?.(proposal) ?? null;
}

export function titleOf(proposal: Proposal): string {
  const text = proposal.ancillaryText;
  if (text.startsWith("{")) {
    try {
      return (JSON.parse(text) as { title?: string }).title ?? "";
    } catch {
      return "";
    }
  }
  return /title: (.*?), description:/s.exec(text)?.[1] ?? "";
}
