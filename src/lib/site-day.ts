import { dayNumber } from "./pick-schedule";

/** The site's day turns over at midnight in this time zone. */
const TIME_ZONE = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" });

/**
 * The moment the site's day `day` begins: midnight in the site's time zone. The zone's clocks change at 2 a.m., so its offset at
 * midnight UTC, the evening before there, still holds at its own midnight.
 */
export function dayStart(day: string): Date {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  const zone = offsetFormat.formatToParts(midnightUtc).find((part) => part.type === "timeZoneName")?.value ?? "";
  // "GMT-04:00", or "GMT" for an offset of none.
  const [, sign, hours, minutes] = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone) ?? ["", "+", "00", "00"];
  const offset = (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60 * 1000;
  return new Date(midnightUtc - offset);
}

/** The site's day now and the moment it was read, for a page to hand its day watcher. */
export function readSiteDay(): { day: string; at: number } {
  const now = new Date();
  return { day: getTodayDateStr(now), at: now.getTime() };
}

/** The ISO date `days` days after `dateStr`. */
function dateAfter(dateStr: string, days: number): string {
  return new Date((dayNumber(dateStr) + days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The site's day at `now` when it is no longer `day`, the day a page rendered for; null while it still is. */
export function newDay(day: string, now: Date): string | null {
  const today = getTodayDateStr(now);
  return today === day ? null : today;
}

/**
 * A past day to offer after the show: one of the days from `launch` through the day before `day`, apart from `featured` (the
 * page's own day), chosen by `random` in [0, 1); null while there is no such day.
 */
export function pastPickDay(launch: string, day: string, featured: string, random: number): string | null {
  const days = dayNumber(day) - dayNumber(launch);
  const skip = dayNumber(featured) - dayNumber(launch);
  const skipping = skip >= 0 && skip < days;
  const count = skipping ? days - 1 : days;
  if (count <= 0) return null;
  const i = Math.min(count - 1, Math.floor(random * count));
  return dateAfter(launch, skipping && i >= skip ? i + 1 : i);
}

/** What follows the last track: the new day's show, or a past pick the page was given. */
export type AfterShow = { kind: "day"; day: string } | { kind: "past"; day: string };

/**
 * What plays after the last track: the new day's show when the site's day has turned by `now`, else `pastPick`, the past day the
 * page offers; null with neither.
 */
export function afterShow(day: string, now: Date, pastPick: string | null): AfterShow | null {
  const turned = newDay(day, now);
  if (turned) return { kind: "day", day: turned };
  return pastPick ? { kind: "past", day: pastPick } : null;
}
