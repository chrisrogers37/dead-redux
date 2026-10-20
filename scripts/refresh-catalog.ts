import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";
import { mergeCatalog } from "../src/lib/catalog";
import { placeNewShows, type PickSchedule } from "../src/lib/pick-schedule";
import type { ShowSummary } from "../src/lib/types";

interface RelistenYear {
  year: string;
  show_count: number;
}

interface RelistenShow {
  display_date: string;
  venue: {
    name: string;
    location: string;
  } | null;
  avg_rating: number;
  source_count: number;
  has_soundboard_source: boolean;
}

interface RelistenYearResponse {
  shows: RelistenShow[];
}

const API_BASE = "https://api.relisten.net/api/v2/artists/grateful-dead";
const ATTEMPTS = 3;

/** What a refresh does beyond its data directory. Tests pass fakes. */
export interface RefreshIO {
  fetch: (url: string) => Promise<Response>;
  sleep: (ms: number) => Promise<unknown>;
  log: (message: string) => void;
  error: (message: string) => void;
}

const nodeIO: RefreshIO = {
  fetch: (url) => fetch(url),
  sleep: (ms) => sleep(ms),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

/**
 * Fetch JSON, retrying a failed request with a growing pause, and throw once
 * every attempt has failed. An answer that `check` rejects counts as a failed
 * request.
 */
async function fetchJson<T>(
  io: RefreshIO,
  url: string,
  check?: (data: T) => void
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await io.fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as T;
      check?.(data);
      return data;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt === ATTEMPTS) throw new Error(`Failed to fetch ${url}: ${reason}`);
      io.log(`  ${reason}; retrying ${url}`);
      await io.sleep(1000 * attempt);
    }
  }
}

/** A Relisten show as a catalog record. */
function toSummary(show: RelistenShow): ShowSummary {
  return {
    date: show.display_date,
    venue: show.venue?.name ?? "Unknown Venue",
    location: show.venue?.location ?? "Unknown Location",
    avgRating: show.avg_rating ?? 0,
    sourceCount: show.source_count ?? 0,
    hasSoundboard: show.has_soundboard_source ?? false,
  };
}

/**
 * Refresh the catalog from Relisten and put shows new to it in the rotation.
 * A year is refreshed only when Relisten answers with as many shows as its
 * year list reports, and at least one. Every other year keeps its shows as
 * they were, and the rest of the refresh is still written.
 *
 * @param dataDir - The directory holding shows.json and pick-schedule.json.
 * @param today - Today's date string "YYYY-MM-DD".
 * @returns The exit code: 1 when a year was not refreshed, otherwise 0.
 * @throws When the year list can't be fetched, before anything is written.
 */
export async function refreshCatalog(
  dataDir: string,
  today: string,
  io: RefreshIO = nodeIO
): Promise<number> {
  io.log("Fetching Grateful Dead show catalog from Relisten...\n");

  // Step 1: Get all years
  const years = await fetchJson<RelistenYear[]>(io, `${API_BASE}/years`);
  io.log(`Found ${years.length} years of touring\n`);

  // Step 2: Fetch shows for each year. An answer that leaves shows out would
  // take away their recordings, so one that doesn't match the year list's
  // count is retried like a failed request. A year that still fails after its
  // retries is recorded, and the run exits 1 once everything else is written.
  const fetched: ShowSummary[] = [];
  const refreshedYears: string[] = [];
  const failedYears: string[] = [];

  for (const year of years) {
    // Only an empty answer could match a count of zero, and an empty answer is
    // never trusted, so such a year fails without a request.
    if (year.show_count < 1) {
      io.error(`  ${year.year} has no shows in Relisten's year list`);
      failedYears.push(year.year);
      continue;
    }

    io.log(`Fetching ${year.year} (${year.show_count} shows)...`);
    try {
      const yearData = await fetchJson<RelistenYearResponse>(
        io,
        `${API_BASE}/years/${year.year}`,
        ({ shows }) => {
          if (shows.length !== year.show_count) {
            throw new Error(
              `answered ${shows.length} show(s) where the year list reports ${year.show_count}`
            );
          }
        }
      );
      fetched.push(...yearData.shows.map(toSummary));
      refreshedYears.push(year.year);
    } catch (err) {
      io.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failedYears.push(year.year);
    }

    // Be respectful of the API — small delay between requests
    await io.sleep(200);
  }

  // Step 3: Merge the refresh into the catalog
  const catalogPath = join(dataDir, "shows.json");
  const known: ShowSummary[] = JSON.parse(readFileSync(catalogPath, "utf8"));
  const { catalog, delisted, unrefreshed } = mergeCatalog(known, fetched, refreshedYears);
  if (delisted.length > 0) {
    io.log(`\nKept ${delisted.length} show(s) Relisten no longer lists: ${delisted.join(", ")}`);
  }

  // The merge kept every catalog year that wasn't refreshed. Those not already
  // failed are years the year list left out: they count as failed too.
  const unlisted = unrefreshed.filter((year) => !failedYears.includes(year));
  for (const year of unlisted) {
    io.error(`  ${year} is in the catalog but not in Relisten's year list`);
  }

  // Step 4: Put shows new to the catalog in the rotation
  const schedulePath = join(dataDir, "pick-schedule.json");
  const schedule: PickSchedule = JSON.parse(readFileSync(schedulePath, "utf8"));
  const { schedule: nextSchedule, added } = placeNewShows(
    schedule,
    catalog.map((show) => show.date),
    today
  );

  // Step 5: Write data/shows.json and data/pick-schedule.json
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  if (added.length > 0) {
    writeFileSync(schedulePath, JSON.stringify(nextSchedule, null, 2) + "\n");
    io.log(`\nAdded ${added.length} new show(s) to the rotation: ${added.join(", ")}`);
  }

  io.log(`\nDone! Wrote ${catalog.length} shows to ${catalogPath}`);

  const notRefreshed = [...failedYears, ...unlisted].sort();
  if (notRefreshed.length > 0) {
    io.error(
      `\nThese years failed to load, so their shows were kept as they were: ${notRefreshed.join(", ")}`
    );
    return 1;
  }
  return 0;
}
