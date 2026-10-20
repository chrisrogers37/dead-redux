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

/**
 * Fetch JSON, retrying a failed request with a growing pause, and throw once
 * every attempt has failed.
 */
async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempt === ATTEMPTS) throw new Error(`Failed to fetch ${url}: ${reason}`);
      console.log(`  ${reason}; retrying ${url}`);
      await sleep(1000 * attempt);
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

async function main() {
  console.log("Fetching Grateful Dead show catalog from Relisten...\n");

  // Step 1: Get all years
  const years = await fetchJson<RelistenYear[]>(`${API_BASE}/years`);
  console.log(`Found ${years.length} years of touring\n`);

  // Step 2: Fetch shows for each year. A year that still fails after its
  // retries is recorded, and the run exits 1 once everything else is written.
  const fetched: ShowSummary[] = [];
  const failedYears: string[] = [];

  for (const year of years) {
    console.log(`Fetching ${year.year} (${year.show_count} shows)...`);
    try {
      const yearData = await fetchJson<RelistenYearResponse>(
        `${API_BASE}/years/${year.year}`
      );
      fetched.push(...yearData.shows.map(toSummary));
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failedYears.push(year.year);
    }

    // Be respectful of the API — small delay between requests
    await sleep(200);
  }

  // Step 3: Merge the refresh into the catalog
  const catalogPath = join(process.cwd(), "data", "shows.json");
  const known: ShowSummary[] = JSON.parse(readFileSync(catalogPath, "utf8"));
  const { catalog, delisted } = mergeCatalog(known, fetched, failedYears);
  if (delisted.length > 0) {
    console.log(`\nKept ${delisted.length} show(s) Relisten no longer lists: ${delisted.join(", ")}`);
  }

  // Step 4: Put shows new to the catalog in the rotation
  const schedulePath = join(process.cwd(), "data", "pick-schedule.json");
  const schedule: PickSchedule = JSON.parse(readFileSync(schedulePath, "utf8"));
  // UTC's date runs ahead of the site's, which only makes the first-repeat check stricter.
  const today = new Date().toISOString().split("T")[0];
  const { schedule: nextSchedule, added } = placeNewShows(
    schedule,
    catalog.map((show) => show.date),
    today
  );

  // Step 5: Write data/shows.json and data/pick-schedule.json
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  if (added.length > 0) {
    writeFileSync(schedulePath, JSON.stringify(nextSchedule, null, 2) + "\n");
    console.log(`\nAdded ${added.length} new show(s) to the rotation: ${added.join(", ")}`);
  }

  console.log(`\nDone! Wrote ${catalog.length} shows to ${catalogPath}`);

  if (failedYears.length > 0) {
    console.error(`\nThese years failed to load, so their shows were kept as they were: ${failedYears.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
