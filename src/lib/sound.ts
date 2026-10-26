import type { Routing } from "@/components/player/Player";

/**
 * The Details Sound row: how the active element sounds once the world has reported it, "not yet known" until then, and plain stereo
 * in the still, where no world loads to report and the elements play as they are.
 */
export function soundLabel(routing: Routing, world: string): string {
  if (routing === "webaudio") return "through the world";
  if (routing === "plain" || world === "fallback") return "plain stereo";
  return "not yet known";
}
