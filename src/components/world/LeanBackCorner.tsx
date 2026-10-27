"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useHiddenCursor } from "./useHiddenCursor";

/** The sleep timer's lengths, in units; a press moves to the next, and past the last to off. */
const SLEEP_STEPS = [30, 60, 90];
/** The cursor hides after this long without input. */
const CURSOR_MS = 3000;

interface Props {
  /** When the sleep timer ends, in ms since the epoch, or null while it is off. */
  sleepEndsAt: number | null;
  onSleep: (endsAt: number | null) => void;
  /** The length of the timer's unit in ms: a minute, or a second under the test hook. */
  unit: number;
  onLeave: () => void;
}

/**
 * Lean-back's top-right corner: the sleep timer, which reads the time left and pauses the show when it runs out, and Leave, side by
 * side, or stacked on a phone as the top icons are. While the corner is mounted the cursor hides after 3 s without input.
 */
export function LeanBackCorner({ sleepEndsAt, onSleep, unit, onLeave }: Props) {
  useHiddenCursor(CURSOR_MS);
  /* The units left on the running timer, refreshed each second; null while it is off. */
  const [left, setLeft] = useState<number | null>(null);

  /* Off, 30, 60, 90, off: a running timer counts as the shortest length that still holds it. */
  function press() {
    const i = left === null ? -1 : SLEEP_STEPS.findIndex((s) => s >= left);
    const next = i === -1 && left !== null ? undefined : SLEEP_STEPS[i + 1];
    onSleep(next === undefined ? null : Date.now() + next * unit);
  }

  const out = useEffectEvent(() => {
    document.dispatchEvent(new Event("player:pause"));
    onSleep(null);
  });
  useEffect(() => {
    const tick = () => {
      if (sleepEndsAt === null) {
        setLeft(null);
        return;
      }
      const units = Math.ceil((sleepEndsAt - Date.now()) / unit);
      if (units <= 0) {
        out();
        return;
      }
      setLeft((l) => (l === units ? l : units));
    };
    const first = window.setTimeout(tick, 0);
    const timer = sleepEndsAt === null ? 0 : window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [sleepEndsAt, unit]);

  return (
    <div className="hud right-16 top-12 flex gap-2 max-sm:flex-col max-sm:items-end">
      <button type="button" data-action="sleep" onClick={press} className="plate text-[24px] leading-8 text-ink">
        Sleep · {left === null ? "off" : `${left} ${unit === 1000 ? "s" : "min"}`}
      </button>
      <button type="button" onClick={onLeave} className="plate text-[24px] leading-8 text-ink">Leave · Esc</button>
    </div>
  );
}
