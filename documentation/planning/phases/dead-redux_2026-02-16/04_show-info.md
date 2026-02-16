# Phase 04: Show Info Display

## PR Title
`feat: show info section with setlist, venue details, and source info`

## Risk Level: Low
## Estimated Effort: Low (0.5 day)

## Files Created
- `src/components/ShowInfo.tsx`
- `src/lib/format.ts`

## Files Modified
- `src/app/[date]/page.tsx` — add ShowInfo component below player

## Files Deleted
- None

---

## Context

The user wants "an always displayed super minimal date and show name with nothing else" as the default — but also wants a show info section for those who want to dig deeper. This phase adds an expandable section below the player that reveals the setlist, source quality information, and a link to Relisten for the full experience.

The minimal info (date, venue, location) is already visible from Phase 01/02. This phase adds the **expandable detail section**.

---

## Dependencies

- **Requires:** Phase 01 (Relisten API client, show data fetching, type definitions)
- **Can run in parallel with:** Phase 02, Phase 03

---

## Detailed Implementation Plan

### Step 1: Formatting Utilities

Create `src/lib/format.ts`:

```typescript
/**
 * Format seconds into a human-readable duration string.
 * Examples: 342 → "5:42", 3661 → "1:01:01"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Format an ISO date string into a readable date.
 * "1977-05-08" → "May 8, 1977"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format a rating to one decimal place.
 * 9.570934 → "9.6"
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}
```

### Step 2: ShowInfo Component

Create `src/components/ShowInfo.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";
import { formatDuration, formatRating } from "@/lib/format";

interface ShowInfoProps {
  showDate: string;
  venue: string;
  location: string;
  tourName: string | null;
  avgRating: number;
  source: Source | null;
}

export function ShowInfo({
  showDate,
  venue,
  location,
  tourName,
  avgRating,
  source,
}: ShowInfoProps) {
  const [expanded, setExpanded] = useState(false);

  const relistenUrl = `https://relisten.net/grateful-dead/${showDate.replace(/-/g, "/")}`;

  // Compute total show duration from tracks
  const totalDuration = source
    ? source.sets.reduce(
        (total, set) =>
          total + set.tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
        0
      )
    : 0;

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs
                   text-dead-bone/40 hover:text-dead-bone/70 transition-colors cursor-pointer"
        aria-expanded={expanded}
        aria-controls="show-info-panel"
      >
        <span>{expanded ? "Hide" : "Show"} Details</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {/* Expandable panel */}
      {expanded && (
        <div
          id="show-info-panel"
          className="mt-2 rounded-xl border border-dead-cream/10 bg-dead-charcoal/30 p-5 space-y-5"
        >
          {/* Quick stats row */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-dead-bone/60">
            {avgRating > 0 && (
              <span>
                <span className="text-dead-gold">{formatRating(avgRating)}</span>/10 rating
              </span>
            )}
            {totalDuration > 0 && (
              <span>{formatDuration(totalDuration)} total</span>
            )}
            {tourName && <span>{tourName}</span>}
            {source?.isSoundboard && (
              <span className="text-dead-gold">Soundboard</span>
            )}
          </div>

          {/* Setlist */}
          {source && source.sets.length > 0 && (
            <div className="space-y-4">
              {source.sets.map((set, setIndex) => (
                <div key={setIndex}>
                  {/* Set header */}
                  {set.name && (
                    <h4 className="text-xs font-medium uppercase tracking-widest text-dead-bone/40 mb-2">
                      {set.name}
                    </h4>
                  )}

                  {/* Tracks */}
                  <ol className="space-y-1">
                    {set.tracks.map((track, trackIndex) => (
                      <li
                        key={trackIndex}
                        className="flex items-baseline justify-between text-sm"
                      >
                        <span className="text-dead-cream/80">{track.title}</span>
                        {track.duration > 0 && (
                          <span className="text-dead-bone/40 text-xs ml-3 tabular-nums shrink-0">
                            {formatDuration(track.duration)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* Source info */}
          {source?.description && (
            <div className="text-xs text-dead-bone/40 leading-relaxed">
              <p className="font-medium text-dead-bone/50 mb-1">Source</p>
              <p>{source.description}</p>
            </div>
          )}

          {/* Relisten link */}
          <div className="text-center pt-2">
            <a
              href={relistenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-dead-gold/60 hover:text-dead-gold transition-colors"
            >
              View on Relisten
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 3: Add ShowInfo to Daily Show Page

Update `src/app/[date]/page.tsx`. Add the import and place the component after the player and share buttons:

**Add import at the top:**
```tsx
import { ShowInfo } from "@/components/ShowInfo";
```

**Add after ShareButtons and before the footer:**
```tsx
        {/* Show details */}
        <ShowInfo
          showDate={show.date}
          venue={show.venue}
          location={show.location}
          tourName={details?.tour?.name ?? null}
          avgRating={show.avgRating}
          source={bestSource}
        />
```

The full element ordering on the page becomes:
1. SYF watermark (background)
2. Site title ("Dead Redux")
3. Show info header (venue, location, date) — always visible
4. Player (Archive.org embed)
5. Share buttons
6. **Show details toggle** (new) — "Show Details" / "Hide Details"
7. Footer (Relisten/Archive.org credits)
8. Dancing bears (fixed bottom)

---

## Test Plan

### Manual Verification

1. **Collapsed state:** "Show Details" button visible below share buttons, no setlist visible
2. **Expanded state:** Click "Show Details" — panel expands with:
   - Rating (gold number out of 10)
   - Total duration
   - Tour name (if available)
   - "Soundboard" badge (if applicable)
   - Full setlist with track names and durations
   - Source description (if available)
   - "View on Relisten" link
3. **Collapse:** Click "Hide Details" — panel collapses, chevron rotates back
4. **Relisten link:** Opens correct Relisten page in new tab
5. **No source:** If show has no source data, the details section should still show the rating and Relisten link
6. **Mobile:** Panel renders cleanly at 375px width, long track names wrap

### Automated Tests

Add to `src/lib/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatDuration, formatDate, formatRating } from "../format";

describe("formatDuration", () => {
  it("formats seconds to mm:ss", () => {
    expect(formatDuration(342)).toBe("5:42");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(5)).toBe("0:05");
  });

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("handles zero/invalid", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-1)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats ISO date to readable string", () => {
    expect(formatDate("1977-05-08")).toBe("May 8, 1977");
    expect(formatDate("1995-07-09")).toBe("July 9, 1995");
  });
});

describe("formatRating", () => {
  it("rounds to one decimal", () => {
    expect(formatRating(9.570934)).toBe("9.6");
    expect(formatRating(8.0)).toBe("8.0");
  });
});
```

---

## Documentation Updates

- None for this phase

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Show with no sets/tracks | "Show Details" still works, shows rating and Relisten link, no setlist section |
| Show with unnamed sets (set.name is null) | Set header is omitted, tracks still display |
| Track with 0 duration | Duration column shows nothing for that track |
| Very long track name ("Drums > Space > The Other One > ...") | Text wraps to next line, duration stays right-aligned |
| Source with no description | Source info section is omitted |
| Rapid toggle clicks | No visual glitches (CSS transition handles this) |

---

## Verification Checklist

- [ ] "Show Details" toggle button visible below share buttons
- [ ] Clicking expands panel with setlist and metadata
- [ ] Clicking again collapses panel
- [ ] Chevron icon rotates on expand/collapse
- [ ] Rating displays in gold with "/10"
- [ ] Total duration is calculated and displayed
- [ ] Tour name shows when available
- [ ] "Soundboard" badge shows for soundboard sources
- [ ] Setlist tracks show name and duration
- [ ] Source description shows when available
- [ ] "View on Relisten" link points to correct URL
- [ ] Format utility tests pass
- [ ] All Phase 01 tests still pass

---

## What NOT To Do

- **Do NOT make the details expanded by default.** The user explicitly wants minimal by default. Discovery of the toggle is part of the experience.
- **Do NOT fetch additional API data for this section.** All the data (setlist, source info, rating) is already available from the `fetchShowDetails` call in Phase 01. Just pass it through as props.
- **Do NOT add tabs or complex navigation within the info panel.** A single expandable section with clear hierarchy is sufficient.
- **Do NOT add a separate setlist API call.** The Relisten show endpoint already includes sets and tracks within each source.
- **Do NOT add taper notes display yet.** While available in the API, taper notes are often very long and technical. Keep it to the source description for now. Taper notes can be added as a follow-up if users want it.
