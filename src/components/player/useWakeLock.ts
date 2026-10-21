import { useEffect } from "react";

/**
 * Keeps the screen on while `on`: requests a screen wake lock, requests it again when the page comes back into view (browsers drop
 * it on hide), and releases it when `on` turns false. Where the API is missing or refuses, nothing breaks.
 */
export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let live = true;
    const request = () => {
      if (sentinel && !sentinel.released) return;
      navigator.wakeLock.request("screen").then(
        (s) => {
          if (live) sentinel = s;
          else s.release().catch(() => {});
        },
        () => {}, // refused (a hidden page, a power saver, a policy): the screen may sleep
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [on]);
}
