import { getDailyShow } from "./daily-show";
import type { ShowSummary } from "./types";

export interface DailyPick {
  /** The calendar date this show was featured: "2026-02-16" */
  featuredDate: string;
  /** The show that was selected for this date */
  show: ShowSummary;
}

/**
 * Get the daily pick for a specific date.
 */
export function getDailyPick(dateStr: string): DailyPick {
  return {
    featuredDate: dateStr,
    show: getDailyShow(dateStr),
  };
}

/**
 * Generate an array of daily picks for a date range.
 * Returns picks in reverse chronological order (most recent first).
 *
 * @param startDate - The earliest date (inclusive), ISO format
 * @param endDate - The latest date (inclusive), ISO format
 */
export function getDailyPicksRange(
  startDate: string,
  endDate: string
): DailyPick[] {
  const picks: DailyPick[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  const current = new Date(end);
  while (current >= start) {
    const dateStr = current.toISOString().split("T")[0];
    picks.push(getDailyPick(dateStr));
    current.setUTCDate(current.getUTCDate() - 1);
  }

  return picks;
}

/**
 * Get the site's launch date. Past picks are only valid from this date forward.
 */
export function getLaunchDate(): string {
  return "2026-02-16";
}
