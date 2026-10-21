/* eslint-disable */

/* The show's sound graph. No element is routed into it: every element plays plain stereo through its own output. */

/* Whether phones route the show through Web Audio; false makes phones play plain stereo. */
export const PHONE_ROUTES_WEB_AUDIO = true;

let ctx = null;
const resume = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); };

/* The AudioContext, created on the first move inside the activating event and resumed then, and again whenever the page comes back into view. */
export function ensureContext() {
  if (!ctx) {
    if (!window.AudioContext) return null;
    ctx = new AudioContext({ latencyHint: "playback" });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });
  }
  resume();
  return ctx;
}
