import type { DerivedSets, ShowSummary, Source, Track } from "@/lib/types";
import { segueOut } from "@/lib/sets";

/* The world's seed, 0 to 999, fixed by the date alone (an FNV-1a hash). */
function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000;
}

/**
 * The show as the page hands it to the world, as JSON. `identifier` is the best source's archive.org identifier, by which the world
 * finds the show's map, or null when the show has no recording.
 */
export function worldData(featuredDate: string, show: ShowSummary, bestSource: Source | null, tracks: Track[], sets: DerivedSets) {
  return {
    featuredDate,
    showDate: show.date,
    identifier: bestSource?.upstreamIdentifier ?? null,
    venue: show.venue,
    location: show.location,
    seed: seedFromDate(featuredDate),
    set2Start: sets.set2Start,
    encoreStart: sets.encoreStart,
    tracks: tracks.map((t) => ({ title: t.title, duration: t.duration, segueOut: segueOut(t.title) })),
  };
}
