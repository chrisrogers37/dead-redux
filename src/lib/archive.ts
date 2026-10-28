import { getDailyShow } from "./daily-show";
import { getTodayDateStr, pastPickDay } from "./site-day";
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

/**
 * Get every past pick, from launch through yesterday, newest first.
 * A day's pick joins the archive once that day is over.
 *
 * @param today - Today's date string. Defaults to today in the site's time zone.
 */
export function getArchivePicks(today: string = getTodayDateStr()): DailyPick[] {
  return getDailyPicksRange(getLaunchDate(), today).filter(
    (pick) => pick.featuredDate < today
  );
}

/** One month of the archive: its key, "2026-10", which is also its URL part, and its picks, newest first. */
export interface ArchiveMonth {
  key: string;
  picks: DailyPick[];
}

/**
 * The picks grouped by the month they were featured in, newest month first and each month's picks newest first, as the picks
 * come. The first month is the one the archive's newest day falls in.
 *
 * @param picks - Picks newest first, as getArchivePicks returns them.
 */
export function archiveMonths(picks: DailyPick[]): ArchiveMonth[] {
  const months: ArchiveMonth[] = [];
  for (const pick of picks) {
    const key = pick.featuredDate.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.picks.push(pick);
    else months.push({ key, picks: [pick] });
  }
  return months;
}

/**
 * A random past pick to offer when a page's show ends: a day from launch through yesterday, apart from the page's own day;
 * null while there is none.
 *
 * @param today - Today's date string.
 * @param featured - The page's featured date.
 */
export function randomPastPick(today: string, featured: string): DailyPick | null {
  const day = pastPickDay(getLaunchDate(), today, featured, Math.random());
  return day ? getDailyPick(day) : null;
}
