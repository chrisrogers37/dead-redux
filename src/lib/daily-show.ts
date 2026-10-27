import showCatalog from "../../data/shows.json";
import pickSchedule from "../../data/pick-schedule.json";
import { showDateFor, type PickSchedule } from "./pick-schedule";
import type { ShowSummary } from "./types";

const shows: ShowSummary[] = showCatalog as ShowSummary[];
const showsByDate = new Map(shows.map((show) => [show.date, show]));
const schedule: PickSchedule = pickSchedule;

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
 * Check if a date string is a real calendar date, written YYYY-MM-DD. Date.parse alone rolls a day the month does not have into the
 * next month (1986-02-30 becomes March 2), so the date it parses must also read back as the same string. The map schema's isShowDate
 * (public/world/maps.js) holds the same rule for the world's side.
 */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const time = Date.parse(dateStr);
  return !isNaN(time) && new Date(time).toISOString().slice(0, 10) === dateStr;
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
