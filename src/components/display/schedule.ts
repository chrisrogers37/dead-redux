import type { Track } from "@/lib/types";

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A seed in [0, 1000) from the featured date, so each day has its own light. */
export function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

/** A small deterministic generator for the drop clock. */
export function makeRandom(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Energy by structure: what the setlist says about each track. */
export function energyOf(tracks: Track[], index: number): number {
  const title = (tracks[index]?.title ?? "").toLowerCase();
  if (title.includes("tuning")) return 0.2;
  if (title.includes("drums")) return 0.9;
  if (title.includes("space")) return 0.3;
  if (index === tracks.length - 1) return 0.8;
  if (index < Math.floor(tracks.length * 0.37)) return 0.5;
  return 0.7;
}

/** Elapsed fraction of the whole show at the start of a track plus a position within it. */
export function showFraction(tracks: Track[], index: number, position: number): number {
  let total = 0;
  let before = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (i < index) before += tracks[i].duration;
    total += tracks[i].duration;
  }
  if (total <= 0) return 0;
  return Math.min(1, (before + position) / total);
}

/** Three hue stops walked by the show's elapsed fraction, blended. */
export function hueAt(stops: [Rgb, Rgb, Rgb], fraction: number): Rgb {
  if (fraction < 0.5) return mixRgb(stops[0], stops[1], fraction / 0.5);
  return mixRgb(stops[1], stops[2], (fraction - 0.5) / 0.5);
}

export function easeOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) * (1 - x) * (1 - x);
}
