import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";
import { addToRotation, type PickSchedule } from "../src/lib/pick-schedule";
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
 * Fetch JSON, retrying a failed request with a growing pause. A request that
 * still fails stops the refresh before anything is written, so a partial
 * catalog is never saved.
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

async function main() {
  console.log("Fetching Grateful Dead show catalog from Relisten...\n");

  // Step 1: Get all years
  const years = await fetchJson<RelistenYear[]>(`${API_BASE}/years`);
  console.log(`Found ${years.length} years of touring\n`);

  // Step 2: Fetch shows for each year
  const allShows: ShowSummary[] = [];

  for (const year of years) {
    console.log(`Fetching ${year.year} (${year.show_count} shows)...`);
    const yearData = await fetchJson<RelistenYearResponse>(
      `${API_BASE}/years/${year.year}`
    );

    for (const show of yearData.shows) {
      allShows.push({
        date: show.display_date,
        venue: show.venue?.name ?? "Unknown Venue",
        location: show.venue?.location ?? "Unknown Location",
        avgRating: show.avg_rating ?? 0,
        sourceCount: show.source_count ?? 0,
        hasSoundboard: show.has_soundboard_source ?? false,
      });
    }

    // Be respectful of the API — small delay between requests
    await sleep(200);
  }

  // Step 3: Keep every show the catalog already has. The pick schedule names
  // shows by date, so a show Relisten stops listing keeps its record, with no
  // recordings left.
  const catalogPath = join(process.cwd(), "data", "shows.json");
  const known: ShowSummary[] = JSON.parse(readFileSync(catalogPath, "utf8"));
  const fetched = new Set(allShows.map((show) => show.date));
  const kept = known
    .filter((show) => !fetched.has(show.date))
    .map((show) => ({ ...show, sourceCount: 0 }));
  if (kept.length > 0) {
    const dates = kept.map((show) => show.date).join(", ");
    console.log(`\nKept ${kept.length} show(s) Relisten no longer lists: ${dates}`);
  }
  allShows.push(...kept);

  // Step 4: Sort by date
  allShows.sort((a, b) => a.date.localeCompare(b.date));

  // Step 5: Put shows new to the catalog in the rotation
  const schedulePath = join(process.cwd(), "data", "pick-schedule.json");
  const schedule: PickSchedule = JSON.parse(readFileSync(schedulePath, "utf8"));
  const placed = new Set([...schedule.rotation, ...schedule.skipped.map((entry) => entry.show)]);
  const newShows = allShows.map((show) => show.date).filter((date) => !placed.has(date));
  // UTC's date runs ahead of the site's, which only makes addToRotation stricter.
  const today = new Date().toISOString().split("T")[0];
  const nextSchedule = newShows.length > 0 ? addToRotation(schedule, newShows, today) : schedule;

  // Step 6: Write data/shows.json and data/pick-schedule.json
  writeFileSync(catalogPath, JSON.stringify(allShows, null, 2));
  if (newShows.length > 0) {
    writeFileSync(schedulePath, JSON.stringify(nextSchedule, null, 2) + "\n");
    console.log(`\nAdded ${newShows.length} new show(s) to the rotation: ${newShows.join(", ")}`);
  }

  console.log(`\nDone! Wrote ${allShows.length} shows to ${catalogPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
