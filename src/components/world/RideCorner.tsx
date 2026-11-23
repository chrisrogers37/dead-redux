"use client";

import { useSyncExternalStore } from "react";
import type { Ride } from "./ride";

interface Props {
  ride: Ride;
  /** The length of the sleep timer's unit in ms: a minute, or a second under the test hook. */
  unit: number;
}

/**
 * The ride's own two buttons, in a row under the page's buttons while the visitor rides and the page is awake: the sleep timer, which
 * reads the time left and pauses the show when it runs out, and Leave. They go with the rest of the HUD when the ride settles; the
 * timer is the ride's (ride.ts), not theirs, so it runs on.
 */
export function RideCorner({ ride, unit }: Props) {
  /* The units left on the running timer, refreshed each second; null while it is off. */
  const left = useSyncExternalStore(ride.subscribe, ride.left, () => null);
  return (
    <div className="flex gap-2 max-sm:flex-col max-sm:items-end">
      <button type="button" data-action="sleep" onClick={ride.pressSleep} className="plate t-body text-ink h-11 flex items-center whitespace-nowrap">
        Sleep · {left === null ? "off" : `${left} ${unit === 1000 ? "s" : "min"}`}
      </button>
      <button type="button" data-action="leave" onClick={ride.leave} className="plate t-body text-ink h-11 flex items-center whitespace-nowrap">Leave · Esc</button>
    </div>
  );
}
