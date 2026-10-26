/**
 * Which of the two audio elements keep crossOrigin after one of them fails to load. With crossOrigin set, a hop that fails the CORS
 * check fails the load outright, before metadata, so that element alone re-mounts without it and the other plays on untouched. Any
 * other error (one after metadata, or on an element already without crossOrigin) changes nothing and returns null.
 */
export function corsAfterError(cors: readonly [boolean, boolean], slot: 0 | 1, hadMetadata: boolean): [boolean, boolean] | null {
  if (!cors[slot] || hadMetadata) return null;
  return slot === 0 ? [false, cors[1]] : [cors[0], false];
}

/**
 * What the now-plate shows after a track fails to load, by the retries made so far: "stalled" while another reload is due, "error"
 * once they are spent, and "idle" before the join, where the show has not started and the reloads happen quietly.
 */
export function stateAfterError(joined: boolean, retries: number, limit: number): "idle" | "stalled" | "error" {
  if (!joined) return "idle";
  return retries < limit ? "stalled" : "error";
}
