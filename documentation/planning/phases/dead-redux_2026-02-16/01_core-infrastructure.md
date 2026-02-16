# Phase 01: Core Infrastructure & Daily Show Page

**Status:** 🔧 IN PROGRESS
**Started:** 2026-02-16

## PR Title
`feat: core daily show page with Relisten API and Archive.org embed`

## Risk Level: Low
## Estimated Effort: Medium (1-2 days)

## Files Created
- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `.env.example`
- `.gitignore`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/[date]/page.tsx`
- `src/app/globals.css`
- `src/lib/relisten.ts`
- `src/lib/daily-show.ts`
- `src/lib/types.ts`
- `src/components/ShowPlayer.tsx`
- `scripts/fetch-shows.ts`
- `data/shows.json` (generated)
- `vercel.json`
- `vitest.config.ts`
- `src/lib/__tests__/daily-show.test.ts`

## Files Modified
- None (greenfield)

## Files Deleted
- None

---

## Context

This is the foundation phase. It sets up the entire project, integrates with the Relisten API to fetch the Grateful Dead show catalog, implements deterministic daily show selection, and renders an Archive.org audio embed. Everything else builds on top of this.

The key product insight: the show selection must be **deterministic** — everyone sees the same show on a given day, like Wordle. This is achieved by using the date string as a seed for a simple hash function that maps to a show index.

---

## Dependencies

- None (this is the foundation phase)
- **Unlocks:** Phases 02, 03, 04, 05

---

## Detailed Implementation Plan

### Step 1: Project Scaffolding

Initialize the Next.js project:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

This creates the project in the current directory (`/Users/chris/Projects/dead-redux/`).

After scaffolding, update `package.json` to add the data fetching script dependency:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "fetch-shows": "npx tsx scripts/fetch-shows.ts",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Install additional dependencies:

```bash
npm install tsx --save-dev
npm install vitest @vitejs/plugin-react --save-dev
```

### Step 2: Type Definitions

Create `src/lib/types.ts`:

```typescript
/**
 * Minimal show record stored in the static JSON catalog.
 * Kept lean — full details are fetched at render time from Relisten.
 */
export interface ShowSummary {
  /** ISO date string: "1977-05-08" */
  date: string;
  /** Venue name: "Barton Hall, Cornell University" */
  venue: string;
  /** Venue location: "Ithaca, NY, USA" */
  location: string;
  /** Average rating (0-10 scale) */
  avgRating: number;
  /** Number of available source recordings */
  sourceCount: number;
  /** Whether a soundboard recording exists */
  hasSoundboard: boolean;
}

/**
 * Full show details fetched from Relisten API at render time.
 */
export interface ShowDetails {
  date: string;
  displayDate: string;
  venue: {
    name: string;
    location: string;
  };
  tour: {
    name: string;
  } | null;
  sources: Source[];
  avgRating: number;
}

export interface Source {
  id: number;
  uuid: string;
  /** The Archive.org item identifier, e.g. "gd77-05-08.sbd.hicks.4982.sbeok.shnf" */
  upstreamIdentifier: string;
  isSoundboard: boolean;
  isRemaster: boolean;
  avgRating: number;
  avgRatingWeighted: number;
  duration: number;
  numReviews: number;
  flacType: string;
  description: string | null;
  taperNotes: string | null;
  source: string | null;
  sets: Set[];
}

export interface Set {
  name: string | null;
  tracks: Track[];
}

export interface Track {
  title: string;
  duration: number;
  trackPosition: number;
  mp3Url: string;
  flacUrl: string | null;
}
```

### Step 3: Show Catalog Fetch Script

Create `scripts/fetch-shows.ts`:

This script fetches all Grateful Dead shows from the Relisten API and saves them as a static JSON file. It runs once (or on demand) — the Dead aren't playing new shows.

```typescript
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
```

Run the script after project setup:

```bash
npm run fetch-shows
```

This generates `data/shows.json` — a ~200KB JSON file containing all ~2,079 shows. This file is committed to the repo.

### Step 4: Deterministic Daily Show Selection

Create `src/lib/daily-show.ts`:

```typescript
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
```

### Step 5: Relisten API Client

Create `src/lib/relisten.ts`:

```typescript
import type { ShowDetails, Source, Set, Track } from "./types";

const API_BASE = "https://api.relisten.net/api/v2/artists/grateful-dead";

interface RelistenShowResponse {
  sources: RelistenSource[];
  display_date: string;
  date: string;
  venue: {
    name: string;
    location: string;
  } | null;
  tour: {
    name: string;
  } | null;
  avg_rating: number;
}

interface RelistenSource {
  id: number;
  uuid: string;
  upstream_identifier: string;
  is_soundboard: boolean;
  is_remaster: boolean;
  avg_rating: number;
  avg_rating_weighted: number;
  duration: number;
  num_reviews: number;
  flac_type: string;
  description: string | null;
  taper_notes: string | null;
  source: string | null;
  sets: RelistenSet[];
}

interface RelistenSet {
  name: string | null;
  tracks: RelistenTrack[];
}

interface RelistenTrack {
  title: string;
  duration: number;
  track_position: number;
  mp3_url: string;
  flac_url: string | null;
}

/**
 * Fetch full show details from Relisten by date string.
 *
 * @param dateStr - ISO date: "1977-05-08"
 * @returns ShowDetails or null if not found
 */
export async function fetchShowDetails(
  dateStr: string
): Promise<ShowDetails | null> {
  const year = dateStr.split("-")[0];
  const url = `${API_BASE}/years/${year}/${dateStr}`;

  const res = await fetch(url, { next: { revalidate: 86400 } }); // Cache for 24h

  if (!res.ok) {
    // Try alternate endpoint format
    const altUrl = `${API_BASE}/shows/${dateStr}`;
    const altRes = await fetch(altUrl, { next: { revalidate: 86400 } });
    if (!altRes.ok) return null;
    return parseShowResponse(await altRes.json());
  }

  return parseShowResponse(await res.json());
}

function parseShowResponse(data: RelistenShowResponse): ShowDetails {
  return {
    date: data.date,
    displayDate: data.display_date,
    venue: {
      name: data.venue?.name ?? "Unknown Venue",
      location: data.venue?.location ?? "Unknown Location",
    },
    tour: data.tour ? { name: data.tour.name } : null,
    sources: (data.sources ?? []).map(parseSource),
    avgRating: data.avg_rating ?? 0,
  };
}

function parseSource(s: RelistenSource): Source {
  return {
    id: s.id,
    uuid: s.uuid,
    upstreamIdentifier: s.upstream_identifier,
    isSoundboard: s.is_soundboard,
    isRemaster: s.is_remaster,
    avgRating: s.avg_rating,
    avgRatingWeighted: s.avg_rating_weighted,
    duration: s.duration,
    numReviews: s.num_reviews,
    flacType: s.flac_type,
    description: s.description,
    taperNotes: s.taper_notes,
    source: s.source,
    sets: (s.sets ?? []).map(parseSet),
  };
}

function parseSet(s: RelistenSet): Set {
  return {
    name: s.name,
    tracks: (s.tracks ?? []).map(parseTrack),
  };
}

function parseTrack(t: RelistenTrack): Track {
  return {
    title: t.title,
    duration: t.duration,
    trackPosition: t.track_position,
    mp3Url: t.mp3_url,
    flacUrl: t.flac_url,
  };
}

/**
 * Pick the best available source for a show.
 * Prefers: soundboard > highest weighted rating > most reviews.
 */
export function pickBestSource(sources: Source[]): Source | null {
  if (sources.length === 0) return null;

  // Sort: soundboard first, then by weighted rating, then by review count
  const sorted = [...sources].sort((a, b) => {
    if (a.isSoundboard !== b.isSoundboard) return a.isSoundboard ? -1 : 1;
    if (a.avgRatingWeighted !== b.avgRatingWeighted)
      return b.avgRatingWeighted - a.avgRatingWeighted;
    return b.numReviews - a.numReviews;
  });

  return sorted[0];
}
```

### Step 6: ShowPlayer Component

Create `src/components/ShowPlayer.tsx`:

```tsx
interface ShowPlayerProps {
  /** Archive.org item identifier */
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="w-full">
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        frameBorder="0"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className="rounded-lg"
      />
    </div>
  );
}
```

**Note:** The height of `400` accommodates the Archive.org playlist view (tracklist + controls). If it renders too tall/short, this can be adjusted in Phase 02.

### Step 7: Main Page

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTodayDateStr } from "@/lib/daily-show";

/**
 * Root page redirects to today's date URL.
 * This ensures the URL always reflects the current day's show.
 */
export default function Home() {
  const today = getTodayDateStr();
  redirect(`/${today}`);
}
```

Create `src/app/[date]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPlayer } from "@/components/ShowPlayer";

interface PageProps {
  params: Promise<{ date: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { date } = await params;

  if (!isValidDateStr(date)) return { title: "Dead Redux" };

  const show = getDailyShow(date);

  return {
    title: `${show.venue} — ${show.date} | Dead Redux`,
    description: `Today's Grateful Dead show: ${show.venue}, ${show.location} on ${show.date}`,
  };
}

export default async function DailyShowPage({ params }: PageProps) {
  const { date } = await params;

  if (!isValidDateStr(date)) notFound();

  const show = getDailyShow(date);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;

  const isToday = date === getTodayDateStr();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-sm font-medium uppercase tracking-widest opacity-60">
            {isToday ? "Today's Dead Show" : "Dead Redux"}
          </h1>
          <h2 className="text-2xl font-bold">{show.venue}</h2>
          <p className="opacity-70">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Player */}
        {bestSource ? (
          <ShowPlayer archiveId={bestSource.upstreamIdentifier} />
        ) : (
          <div className="text-center py-12 opacity-50">
            <p>No audio source available for this show.</p>
            <p className="text-sm mt-2">
              Try{" "}
              <a
                href={`https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Relisten
              </a>{" "}
              instead.
            </p>
          </div>
        )}

        {/* Minimal footer */}
        <div className="text-center text-xs opacity-40 pt-8">
          <p>
            Powered by{" "}
            <a
              href="https://relisten.net/grateful-dead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Relisten
            </a>{" "}
            &amp;{" "}
            <a
              href="https://archive.org/details/GratefulDead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Archive.org
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
```

### Step 8: Layout

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dead Redux",
  description: "A new Grateful Dead show every day",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
```

Replace `src/app/globals.css`:

```css
@import "tailwindcss";
```

### Step 9: Configuration Files

Update `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Archive.org iframe embeds
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Create `.env.example`:

```
# No environment variables required for Phase 1.
# The Relisten API is public and requires no authentication.
```

Create `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json"
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### Step 10: Gitignore

Ensure `.gitignore` includes (create-next-app provides most of this, but verify):

```
node_modules/
.next/
.env
.env.local
```

**Do NOT gitignore `data/shows.json`** — this is a static asset that should be committed.

### Step 11: Tests

Create `src/lib/__tests__/daily-show.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getDailyShow,
  isValidDateStr,
  getShowCount,
} from "../daily-show";

describe("getDailyShow", () => {
  it("returns a show with expected fields", () => {
    const show = getDailyShow("2026-02-16");
    expect(show).toHaveProperty("date");
    expect(show).toHaveProperty("venue");
    expect(show).toHaveProperty("location");
    expect(show.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the same show for the same date", () => {
    const show1 = getDailyShow("2026-02-16");
    const show2 = getDailyShow("2026-02-16");
    expect(show1.date).toBe(show2.date);
    expect(show1.venue).toBe(show2.venue);
  });

  it("returns different shows for different dates", () => {
    const show1 = getDailyShow("2026-02-16");
    const show2 = getDailyShow("2026-02-17");
    // Technically could collide, but extremely unlikely with 2000+ shows
    // If this test ever flakes, pick two dates known to differ
    expect(show1.date).not.toBe(show2.date);
  });

  it("returns a show for any arbitrary date", () => {
    const show = getDailyShow("1999-12-31");
    expect(show).toHaveProperty("date");
    expect(show).toHaveProperty("venue");
  });
});

describe("isValidDateStr", () => {
  it("accepts valid date strings", () => {
    expect(isValidDateStr("2026-02-16")).toBe(true);
    expect(isValidDateStr("1977-05-08")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidDateStr("not-a-date")).toBe(false);
    expect(isValidDateStr("2026/02/16")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});

describe("getShowCount", () => {
  it("returns a reasonable number of shows", () => {
    const count = getShowCount();
    expect(count).toBeGreaterThan(2000);
    expect(count).toBeLessThan(3000);
  });
});
```

---

## Test Plan

### Automated Tests

1. **`daily-show.test.ts`** — Verifies deterministic selection, date validation, catalog integrity (described above)

### Manual Verification

1. Run `npm run fetch-shows` — verify `data/shows.json` is created with ~2,079 entries
2. Run `npm run dev` — visit `http://localhost:3000`
3. Verify redirect from `/` to `/2026-02-16` (today's date)
4. Verify the page shows a venue name, location, and date
5. Verify the Archive.org audio player loads and plays audio
6. Visit `/1977-05-08` — verify a different show appears
7. Visit `/invalid-date` — verify 404 page
8. Refresh the page multiple times — verify the same show appears each time
9. Run `npm run test:run` — verify all tests pass

---

## Documentation Updates

- None required for Phase 1 (README will be updated in later phases or after all phases)

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Relisten API is down | Page renders with "No audio source" fallback message and link to Relisten |
| Show has no sources in Relisten | Fallback message displayed |
| Show has only audience recordings (no soundboard) | Best audience recording is selected |
| Archive.org embed fails to load | Browser shows iframe error — acceptable for MVP |
| Invalid date in URL (`/abc-def-ghi`) | 404 page |
| Future date in URL (`/2030-01-01`) | Shows a deterministic show — this is fine |
| Very old date (`/1800-01-01`) | Shows a deterministic show — this is fine |

---

## Verification Checklist

- [ ] `npm run fetch-shows` generates `data/shows.json` with ~2,079 entries
- [ ] `npm run dev` starts without errors
- [ ] `/` redirects to today's date URL
- [ ] Daily show page renders venue, location, date
- [ ] Archive.org player loads and plays audio
- [ ] Same show appears on refresh (deterministic)
- [ ] Different dates produce different shows
- [ ] Invalid dates return 404
- [ ] `npm run test:run` — all tests pass
- [ ] `npm run build` — production build succeeds
- [ ] Deployed to Vercel — site loads correctly

---

## What NOT To Do

- **Do NOT use `Math.random()`** for show selection. It's not deterministic across users/requests. Use the date-seeded hash function.
- **Do NOT fetch the full show catalog on every page load.** The catalog is a static JSON file imported at build time.
- **Do NOT call the Relisten API for every track/source at build time.** Only fetch full show details (with sources) at render time for the single daily show.
- **Do NOT add database dependencies.** The show catalog is static and the selection algorithm is pure.
- **Do NOT over-style in this phase.** Keep it minimal — Phase 02 handles the Dead aesthetic. Use basic Tailwind utility classes only.
- **Do NOT add social sharing features.** That's Phase 03.
- **Do NOT worry about the Archive.org player's default styling.** It will look basic — Phase 02 will wrap it in themed styling.
