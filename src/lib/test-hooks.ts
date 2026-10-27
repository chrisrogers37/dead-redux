import type { ShowLookup } from "./relisten";

/**
 * Whether this deployment serves the test hooks (`?at=`, `?t=`, `?stats=1`, `?lookup=`): Vercel preview deployments only. Read on
 * the server and never from a NEXT_PUBLIC_ variable, so no client bundle carries the switch and no custom domain can turn it on.
 */
export function testHooksEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

/**
 * On a preview, ?lookup=failed or ?lookup=missing stands in for Relisten's answer, so each plate can be shot without an outage; null
 * means look the show up. Read on the server, gated like the other hooks: never on production, never from a NEXT_PUBLIC_ variable.
 */
export function forcedLookup(value: string | string[] | undefined): ShowLookup | null {
  if (!testHooksEnabled()) return null;
  if (value === "failed") return { kind: "failed", reason: "forced by ?lookup=failed" };
  if (value === "missing") return { kind: "missing" };
  return null;
}
