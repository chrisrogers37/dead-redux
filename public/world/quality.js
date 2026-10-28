/* eslint-disable */

/* Quality tiers and the frame-time downgrade. The tier is picked once at boot, from the screen and the browser or from ?tier=. Its
   budget is rung 0, and a device that renders slowly steps down one rung at a time and never back up. */

/* Rung 0 of each tier. Only the desktop draws a shadow map, the stage's. */
const BUDGETS = {
  desktop: { scale: 1.0, grid: 80, octaves: 4, bears: 5, fov: 60, shadows: true },
  phone: { scale: 0.85, grid: 52, octaves: 3, bears: 3, fov: 75, shadows: false },
  tv: { scale: 0.8, grid: 64, octaves: 3, bears: 5, fov: 60, shadows: false },
};
/* A median frame time over this many milliseconds steps the world down a rung: slower than 30 frames a second, with a margin, so a
   display capped at 30 Hz (33.3 ms a frame) is not taken for a slow device. */
export const SLOW_MS = 34;
/* Frames in each median. */
export const WINDOW = 60;

/* The downgrade's sampler. Each frame's time goes in, and every WINDOW frames the window's median is measured. A median over SLOW_MS
   asks for one rung down. */
export function frameSampler() {
  const times = [];
  let frameMs = 0;
  return {
    /* The last window's median frame time, in milliseconds; 0 until the first window ends. */
    get frameMs() {
      return frameMs;
    },
    /* Adds a frame's time, and whether the world drew it while loading. True when the window it ends asks for one rung down. */
    add(dtMs, loading) {
      times.push(dtMs);
      if (times.length < WINDOW) return false;
      frameMs = median(times);
      times.length = 0;
      return frameMs > SLOW_MS;
    },
  };
}

/* The tier: ?tier= when it names one; a phone by its width, or by touch on a screen under 900 px wide; a TV by a wide screen without a
   fine pointer, or by its browser's name; else a desktop. */
export function pickTier() {
  const asked = new URLSearchParams(location.search).get("tier");
  if (asked && Object.hasOwn(BUDGETS, asked)) return asked;
  if (matchMedia("(max-width: 639px)").matches || (navigator.maxTouchPoints > 0 && innerWidth < 900)) return "phone";
  if ((innerWidth >= 1600 && !matchMedia("(pointer: fine)").matches) || /TV|SMART-TV|Tizen|Web0S|AFT/.test(navigator.userAgent)) return "tv";
  return "desktop";
}

/* A tier's budget, with its pixel-ratio cap, which depends on the device. */
export function budgetFor(tier) {
  return { ...BUDGETS[tier], pixelRatio: tier === "desktop" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1 };
}

/* The median of a list of numbers. */
export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* One rung down from a quality, or null at the bottom. In order: the render scale ×0.8, down to 0.5; shadows off; one sky octave
   fewer, down to 2; two bears fewer, down to 1; the stage light off. A rung with nothing to change is skipped. */
export function stepDown(q) {
  if (q.scale > 0.5) return { ...q, scale: Math.max(0.5, Math.round(q.scale * 0.8 * 1000) / 1000) };
  if (q.shadows) return { ...q, shadows: false };
  if (q.octaves > 2) return { ...q, octaves: q.octaves - 1 };
  if (q.bears > 1) return { ...q, bears: Math.max(1, q.bears - 2) };
  if (q.stageLight) return { ...q, stageLight: false };
  return null;
}
