import { useEffect } from "react";

/** The class on <html> while the cursor is hidden; globals.css hides the cursor under it. */
const HIDDEN = "cursor-off";
const INPUTS = ["pointermove", "pointerdown", "keydown"] as const;

/** Hides the cursor after `ms` without input while mounted; a pointer move, a press or a key brings it back and starts the wait again. */
export function useHiddenCursor(ms: number): void {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const hide = () => root.classList.add(HIDDEN);
    const wake = () => {
      root.classList.remove(HIDDEN);
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, ms);
    };
    for (const type of INPUTS) window.addEventListener(type, wake);
    timer = window.setTimeout(hide, ms);
    return () => {
      window.clearTimeout(timer);
      root.classList.remove(HIDDEN);
      for (const type of INPUTS) window.removeEventListener(type, wake);
    };
  }, [ms]);
}
