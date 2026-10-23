import showCatalog from "../../data/shows.json";
import pickSchedule from "../../data/pick-schedule.json";
import { showDateFor, type PickSchedule } from "./pick-schedule";
import type { ShowSummary } from "./types";

const shows: ShowSummary[] = showCatalog as ShowSummary[];
const showsByDate = new Map(shows.map((show) => [show.date, show]));
const schedule: PickSchedule = pickSchedule;

/** The site's day turns over at midnight in this time zone. */
const TIME_ZONE = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Get the show featured on a date.
 * Everyone visiting on the same day sees the same show, and a date keeps its
 * show for good.
 *
 * @param dateStr - ISO date string "YYYY-MM-DD".
 */
export function getDailyShow(dateStr: string): ShowSummary {
  const showDate = showDateFor(schedule, dateStr);
  const show = showsByDate.get(showDate);
  if (!show) {
    throw new Error(`${showDate} is in data/pick-schedule.json but not in data/shows.json`);
  }
  return show;
}

/**
 * Get today's date string ("YYYY-MM-DD") in the site's time zone.
 *
 * @param now - The moment to read. Defaults to the current time.
 */
export function getTodayDateStr(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    dayFormat.formatToParts(now).map((part): [string, string] => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Check if a date string is valid and corresponds to a real date.
 */
export function isValidDateStr(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/**
 * Check if a date string is the date of a show in the catalog.
 */
export function isCatalogShow(dateStr: string): boolean {
  return showsByDate.has(dateStr);
}

/**
 * Get the total number of shows in the catalog.
 */
export function getShowCount(): number {
  return shows.length;
}
