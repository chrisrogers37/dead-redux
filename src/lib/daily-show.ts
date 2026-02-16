import showCatalog from "../../data/shows.json";
import type { ShowSummary } from "./types";

const shows: ShowSummary[] = showCatalog as ShowSummary[];

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
 * Get today's show based on the current date.
 * Uses the date string as a seed to deterministically select a show.
 * Everyone visiting on the same day sees the same show.
 *
 * @param dateStr - ISO date string "YYYY-MM-DD". Defaults to today (UTC).
 */
export function getDailyShow(dateStr?: string): ShowSummary {
  const date = dateStr ?? new Date().toISOString().split("T")[0];
  const index = hashString(`dead-redux-${date}`) % shows.length;
  return shows[index];
}

/**
 * Get the date string for today in UTC.
 */
export function getTodayDateStr(): string {
  return new Date().toISOString().split("T")[0];
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
