import type { DerivedSets, Source, Track } from "./types";

/** Previous restarts the current track once more than this many seconds of it have played. */
const RESTART_AFTER_S = 3;

/** The queue: every set's tracks in order. Empty without a source. */
export function flatten(source: Source | null): Track[] {
  return source ? source.sets.flatMap((s) => s.tracks) : [];
}

/** The track after `i` in a queue of `n`, or null when `i` is the last. */
export function nextIndex(i: number, n: number): number | null {
  return i + 1 < n ? i + 1 : null;
}

/** Where Previous goes: the start of the current track once it has played more than 3 s, else the track before (never before the first). */
export function prevIndex(i: number, n: number, position: number): number {
  return Math.max(0, Math.min(n - 1, position > RESTART_AFTER_S ? i : i - 1));
}

/** The set a track belongs to, for the now-plate: "Encore" from its start, "Set 1"/"Set 2" only while set 2's start is known, else null. */
export function setName(i: number, sets: DerivedSets): string | null {
  if (sets.encoreStart !== null && i >= sets.encoreStart) return "Encore";
  if (sets.set2Start === null) return null;
  return i >= sets.set2Start ? "Set 2" : "Set 1";
}
