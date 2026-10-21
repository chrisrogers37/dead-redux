import { useEffect, useEffectEvent } from "react";

/** A place in the show: a track and a position in it, in seconds. */
export interface ResumePoint {
  index: number;
  seconds: number;
}

const SAVE_EVERY_MS = 5000;
/** A saved point inside the first track's first 15 s is not worth resuming. */
const MIN_RESUME_S = 15;
const storageKey = (featuredDate: string) => `dead-redux:position:${featuredDate}`;

/** Whether a place fits a queue of `n` tracks: a whole track index in range, and a finite position that is not negative. */
export function fits(p: ResumePoint, n: number): boolean {
  return Number.isInteger(p.index) && p.index >= 0 && p.index < n && Number.isFinite(p.seconds) && p.seconds >= 0;
}

/** The saved point for a featured date, when it fits a queue of `n` tracks and is past the first track's first 15 s; else null. */
export function readResume(featuredDate: string, n: number): ResumePoint | null {
  let value: unknown;
  try {
    value = JSON.parse(localStorage.getItem(storageKey(featuredDate)) ?? "null");
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { index, seconds } = value as Record<string, unknown>;
  if (typeof index !== "number" || typeof seconds !== "number") return null;
  const point = { index, seconds };
  if (!fits(point, n) || (index === 0 && seconds <= MIN_RESUME_S)) return null;
  return point;
}

/** Forgets the saved point, so the next visit starts the show from the top. */
export function clearResume(featuredDate: string): void {
  try {
    localStorage.removeItem(storageKey(featuredDate));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Saves the place every 5 s while `playing`, once more when playing stops, and when the page is hidden.
 * `point` reads the live place, or null when there is nothing to keep.
 */
export function useResume(featuredDate: string, playing: boolean, point: () => ResumePoint | null): void {
  const save = useEffectEvent(() => {
    const p = point();
    if (!p) return;
    try {
      localStorage.setItem(storageKey(featuredDate), JSON.stringify({ index: p.index, seconds: Math.floor(p.seconds) }));
    } catch {
      /* storage full or unavailable */
    }
  });

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => save(), SAVE_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      save();
    };
  }, [playing]);
}
