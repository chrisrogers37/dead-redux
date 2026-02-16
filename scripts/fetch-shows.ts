import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function main() {
  console.log("Fetching Grateful Dead show catalog from Relisten...\n");

  // Step 1: Get all years
  const years = await fetchJson<RelistenYear[]>(`${API_BASE}/years`);
  console.log(`Found ${years.length} years of touring\n`);

  // Step 2: Fetch shows for each year
  const allShows: Array<{
    date: string;
    venue: string;
    location: string;
    avgRating: number;
    sourceCount: number;
    hasSoundboard: boolean;
  }> = [];

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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Step 3: Sort by date
  allShows.sort((a, b) => a.date.localeCompare(b.date));

  // Step 4: Write to data/shows.json
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  const outputPath = join(dataDir, "shows.json");
  writeFileSync(outputPath, JSON.stringify(allShows, null, 2));

  console.log(`\nDone! Wrote ${allShows.length} shows to ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
