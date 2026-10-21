/**
 * Whether this deployment serves the test hooks (`?at=`, `?t=`, `?stats=1`): Vercel preview deployments only. Read on the server
 * and never from a NEXT_PUBLIC_ variable, so no client bundle carries the switch and no custom domain can turn it on.
 */
export function testHooksEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview";
}
