import showCatalog from "../../data/shows.json";
import type { ShowSummary } from "./types";

const shows: ShowSummary[] = showCatalog as ShowSummary[];

/** The site's day turns over at midnight in this time zone. */
const TIME_ZONE = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Simple string hash function (djb2).
 * Deterministic: same input always produces same output.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Get the show featured on a date.
 * Uses the date string as a seed to deterministically select a show.
 * Everyone visiting on the same day sees the same show.
 *
 * @param dateStr - ISO date string "YYYY-MM-DD".
 */
export function getDailyShow(dateStr: string): ShowSummary {
  const index = hashString(`dead-redux-${dateStr}`) % shows.length;
  return shows[index];
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
 * Get the total number of shows in the catalog.
 */
export function getShowCount(): number {
  return shows.length;
}
