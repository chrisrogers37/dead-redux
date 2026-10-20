/**
 * Which show each date features, as data: picks are never derived from the
 * catalog, so refreshing data/shows.json cannot move one.
 */
export interface PickSchedule {
  /** The first date the rotation picks for. */
  rotationStart: string;
  /**
   * Featured date → show date for every day from launch until rotationStart,
   * as the site served them.
   */
  openingPicks: Partial<Record<string, string>>;
  /**
   * Show dates, one per day from rotationStart, starting over at the top when
   * they run out. Each show appears once, and the shows the opening picks
   * featured come last, so every other show plays before any comes back.
   */
  rotation: string[];
  /** Catalog shows left out of the rotation, each with the reason. */
  skipped: { show: string; reason: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since 1970-01-01 for an ISO date string "YYYY-MM-DD". */
function dayNumber(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`) / DAY_MS;
}

/**
 * The show date a schedule features on a date. A date before launch was never
 * featured, so it borrows an opening pick: those never change.
 *
 * @param dateStr - ISO date string "YYYY-MM-DD".
 */
export function showDateFor(schedule: PickSchedule, dateStr: string): string {
  const opening = schedule.openingPicks[dateStr];
  if (opening) return opening;
  const days = dayNumber(dateStr) - dayNumber(schedule.rotationStart);
  if (days >= 0) return schedule.rotation[days % schedule.rotation.length];
  const openingShows = Object.values(schedule.openingPicks) as string[];
  const index = days % openingShows.length;
  return openingShows[index < 0 ? index + openingShows.length : index];
}

/**
 * The rotation index of the first show an opening pick featured. Every show
 * before it plays for the first time.
 */
export function firstRepeatIndex(schedule: PickSchedule): number {
  const featured = new Set(Object.values(schedule.openingPicks));
  const index = schedule.rotation.findIndex((show) => featured.has(show));
  return index === -1 ? schedule.rotation.length : index;
}

/**
 * Add shows new to the catalog to the rotation, just before its first repeat,
 * which moves no date before that point. Refuses once the rotation has
 * reached that point, since the dates after it have been featured.
 *
 * @param today - Today's date string "YYYY-MM-DD".
 */
export function addToRotation(
  schedule: PickSchedule,
  shows: string[],
  today: string
): PickSchedule {
  const index = firstRepeatIndex(schedule);
  if (dayNumber(schedule.rotationStart) + index <= dayNumber(today)) {
    throw new Error(
      `The rotation reached its first repeat by ${today}, so ${shows.join(", ")} must be placed by hand`
    );
  }
  const rotation = [...schedule.rotation];
  rotation.splice(index, 0, ...shows);
  return { ...schedule, rotation };
}
