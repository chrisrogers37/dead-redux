<!-- Status: 🔧 IN PROGRESS | Started: 2026-02-17 -->
# Phase 05: Past Picks Timeline

## PR Title
`feat: archive page with timeline of past daily shows`

## Risk Level: Low
## Estimated Effort: Medium (1 day)

## Files Created
- `src/app/archive/page.tsx`
- `src/components/Timeline.tsx`
- `src/components/NavBar.tsx`
- `src/lib/archive.ts`
- `src/lib/__tests__/archive.test.ts`

## Files Modified
- `src/app/[date]/page.tsx` — add subtle Archive link in footer

## Files Deleted
- None

---

## Context

The user wants a second page where people can go back and see prior days' shows as a timeline. The main page stays the core simple target — the archive is a separate page at `/archive`. This gives returning users a way to catch up on shows they missed.

Since show selection is deterministic (date → show), we can generate the "past picks" for any date range without storing anything. We simply compute what show was featured for each past day.

---

## Dependencies

- **Requires:** Phase 01 (daily show selection logic, types)
- **Should run after:** Phases 02, 03, 04 (needs the design system and URL routing to be in place)

---

## Detailed Implementation Plan

### Step 1: Archive Utility Functions

Create `src/lib/archive.ts`:

```typescript
import { getDailyShow } from "./daily-show";
import type { ShowSummary } from "./types";

export interface DailyPick {
  /** The calendar date this show was featured: "2026-02-16" */
  featuredDate: string;
  /** The show that was selected for this date */
  show: ShowSummary;
}

/**
 * Get the daily pick for a specific date.
 */
export function getDailyPick(dateStr: string): DailyPick {
  return {
    featuredDate: dateStr,
    show: getDailyShow(dateStr),
  };
}

/**
 * Generate an array of daily picks for a date range.
 * Returns picks in reverse chronological order (most recent first).
 *
 * @param startDate - The earliest date (inclusive), ISO format
 * @param endDate - The latest date (inclusive), ISO format
 */
export function getDailyPicksRange(
  startDate: string,
  endDate: string
): DailyPick[] {
  const picks: DailyPick[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  const current = new Date(end);
  while (current >= start) {
    const dateStr = current.toISOString().split("T")[0];
    picks.push(getDailyPick(dateStr));
    current.setUTCDate(current.getUTCDate() - 1);
  }

  return picks;
}

/**
 * Get the site's launch date. Past picks are only valid from this date forward.
 * Update this when the site actually launches.
 */
export function getLaunchDate(): string {
  return "2026-02-16";
}

```

**Note:** `getAllPastPicks()` was removed during challenge review. The archive page calls `getDailyPicksRange(getLaunchDate(), getTodayDateStr())` directly, keeping the utility layer pure and testable with no wall-clock coupling.

### Step 2: NavBar Component

Create `src/components/NavBar.tsx` — used **only on the archive page** to provide a way back to today's show. The daily show page stays immersive; it links to the archive subtly in its footer instead.

```tsx
import Link from "next/link";

export function NavBar() {
  return (
    <nav className="flex items-center justify-center gap-6 text-xs text-dead-bone/40 py-4">
      <Link
        href="/"
        className="hover:text-dead-bone/70 transition-colors"
      >
        Today&apos;s Show
      </Link>
      <span className="text-dead-bone/20">/</span>
      <span className="text-dead-cream/70">Archive</span>
    </nav>
  );
}
```

**Design:** Minimal nav centered at the top of the archive page only. "Archive" is static text (already on that page), "Today's Show" is a link back. No props needed — this component is archive-specific.

### Step 3: Timeline Component

Create `src/components/Timeline.tsx`:

```tsx
import Link from "next/link";
import type { DailyPick } from "@/lib/archive";
import { formatDate, formatRating } from "@/lib/format";

interface TimelineProps {
  picks: DailyPick[];
}

export function Timeline({ picks }: TimelineProps) {
  if (picks.length === 0) {
    return (
      <div className="text-center py-16 text-dead-bone/40">
        <p>No shows in the archive yet.</p>
        <p className="text-sm mt-2">Check back tomorrow!</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {picks.map((pick) => (
        <Link
          key={pick.featuredDate}
          href={`/${pick.featuredDate}`}
          className="group flex items-baseline gap-4 py-3 px-4 -mx-4 rounded-lg
                     hover:bg-dead-cream/5 transition-colors"
        >
          {/* Featured date */}
          <time
            dateTime={pick.featuredDate}
            className="text-xs text-dead-bone/40 tabular-nums shrink-0 w-24"
          >
            {formatDate(pick.featuredDate)}
          </time>

          {/* Show info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-dead-cream/80 group-hover:text-dead-cream transition-colors truncate">
              {pick.show.venue}
            </p>
            <p className="text-xs text-dead-bone/40 truncate">
              {pick.show.location} &middot; {formatDate(pick.show.date)}
            </p>
          </div>

          {/* Rating badge */}
          {pick.show.avgRating > 0 && (
            <span className="text-xs text-dead-gold/50 tabular-nums shrink-0">
              {formatRating(pick.show.avgRating)}
            </span>
          )}

          {/* Soundboard badge */}
          {pick.show.hasSoundboard && (
            <span className="text-[10px] text-dead-gold/40 uppercase tracking-wider shrink-0">
              SBD
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
```

**Design decisions:**
- Each row shows: featured date (when it was "pick of the day"), venue name, show date/location, rating
- Two dates displayed: the date the pick was featured AND the date the Dead actually played. These are different — the featured date is "Feb 16, 2026" while the show date might be "May 8, 1977"
- Clicking a row goes to that day's show page (`/{featuredDate}`)
- Minimal hover effect — subtle background color change
- "SBD" badge for soundboard recordings (Deadheads care about this)

### Step 4: Archive Page

Create `src/app/archive/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getDailyPicksRange, getLaunchDate } from "@/lib/archive";
import { getTodayDateStr } from "@/lib/daily-show";
import { Timeline } from "@/components/Timeline";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Archive | Dead Redux",
  description: "Browse past daily Grateful Dead show picks",
};

export const revalidate = 3600; // Re-generate at most once per hour

export default function ArchivePage() {
  const today = getTodayDateStr();
  const launch = getLaunchDate();
  const picks = today >= launch ? getDailyPicksRange(launch, today) : [];

  return (
    <main className="min-h-screen p-4">
      <div className="w-full max-w-2xl mx-auto">
        {/* Nav */}
        <NavBar active="archive" />

        {/* Header */}
        <div className="text-center space-y-2 py-8">
          <h1 className="font-display text-3xl text-dead-cream">Archive</h1>
          <p className="text-xs text-dead-bone/40">
            Every show we&apos;ve featured, newest first
          </p>
          <div className="bolt-divider mt-3 mx-auto max-w-xs" />
        </div>

        {/* Timeline */}
        <Timeline picks={picks} />

        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/30 py-8">
          <p>
            {picks.length} show{picks.length !== 1 ? "s" : ""} featured so far
          </p>
        </div>
      </div>
    </main>
  );
}
```

### Step 5: Add Archive Link to Daily Show Page Footer

Update `src/app/[date]/page.tsx` — add a subtle "Archive" link in the existing footer, keeping the daily show page immersive (no top NavBar).

**Add to the existing footer section** (after the Relisten & Archive.org credits):

```tsx
        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/30 pt-4 space-y-2">
          <p>
            Powered by{" "}
            <a href="https://relisten.net/grateful-dead" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-dead-bone/50">Relisten</a>
            {" "}&amp;{" "}
            <a href="https://archive.org/details/GratefulDead" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-dead-bone/50">Archive.org</a>
          </p>
          <p>
            <a href="/archive" className="underline hover:text-dead-bone/50">Past Shows</a>
          </p>
        </div>
```

This replaces the existing footer. The only change is wrapping the content in `space-y-2` and adding the "Past Shows" link below the credits.

### Step 6: Tests

Create `src/lib/__tests__/archive.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getDailyPick,
  getDailyPicksRange,
  getLaunchDate,
} from "../archive";

describe("getDailyPick", () => {
  it("returns a pick with featured date and show", () => {
    const pick = getDailyPick("2026-02-16");
    expect(pick.featuredDate).toBe("2026-02-16");
    expect(pick.show).toHaveProperty("date");
    expect(pick.show).toHaveProperty("venue");
  });

  it("returns consistent results for the same date", () => {
    const pick1 = getDailyPick("2026-02-16");
    const pick2 = getDailyPick("2026-02-16");
    expect(pick1.show.date).toBe(pick2.show.date);
  });
});

describe("getDailyPicksRange", () => {
  it("returns picks in reverse chronological order", () => {
    const picks = getDailyPicksRange("2026-02-14", "2026-02-16");
    expect(picks).toHaveLength(3);
    expect(picks[0].featuredDate).toBe("2026-02-16");
    expect(picks[1].featuredDate).toBe("2026-02-15");
    expect(picks[2].featuredDate).toBe("2026-02-14");
  });

  it("returns single pick for same start and end", () => {
    const picks = getDailyPicksRange("2026-02-16", "2026-02-16");
    expect(picks).toHaveLength(1);
  });

  it("returns empty array if start is after end", () => {
    const picks = getDailyPicksRange("2026-02-17", "2026-02-16");
    expect(picks).toHaveLength(0);
  });
});

describe("getLaunchDate", () => {
  it("returns a valid date string", () => {
    const date = getLaunchDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

---

## Test Plan

### Manual Verification

1. **Archive page:** Visit `/archive` — see a list of past daily picks in reverse chronological order
2. **Empty state:** If launch date is in the future, see "No shows in the archive yet" message
3. **Navigation:** Click a pick in the timeline — navigates to `/{featuredDate}` and shows that day's show
4. **NavBar on archive page:** "Today's Show" link and "Archive" label visible at top
5. **Footer link on show page:** "Past Shows" link visible in footer, navigates to `/archive`
6. **Mobile:** Timeline rows stack properly at 375px, no horizontal overflow
7. **Back navigation:** Browser back button from a show page returns to archive

### Automated Tests

- `archive.test.ts` — tests for `getDailyPick`, `getDailyPicksRange`, `getLaunchDate`
- All existing tests still pass

---

## Documentation Updates

- None for this phase

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Site just launched (1 day) | Archive shows 1 pick |
| Site running for 1 year (365 picks) | Archive renders all 365 rows — page may need pagination later if it gets slow, but for 365 items this is fine |
| Site running for 5+ years | Consider adding year-based grouping or pagination — but not in this phase |
| Show page accessed via direct URL (no featured date context) | Page renders normally — the show is determined by the URL date |
| `/archive` accessed before launch date | Empty state message displays |
| Very long venue name in timeline | Text truncates with ellipsis (`truncate` class) |

---

## Verification Checklist

- [ ] `/archive` page renders with past daily picks
- [ ] Picks are in reverse chronological order
- [ ] Each pick shows: featured date, venue, show location/date, rating
- [ ] Clicking a pick navigates to the correct show page
- [ ] NavBar appears on archive page with "Today's Show" link
- [ ] "Past Shows" link appears in daily show page footer
- [ ] Empty state renders when no picks exist
- [ ] Show count displays in archive footer
- [ ] Mobile layout works at 375px
- [ ] Archive tests pass
- [ ] All existing tests still pass
- [ ] `npm run build` succeeds

---

## What NOT To Do

- **Do NOT add a database to track "featured" shows.** The selection is deterministic — we can always recompute which show was featured on any given date. No persistence needed.
- **Do NOT add infinite scroll or pagination yet.** For the first year (365 items), a simple list is fine. Add pagination later if the list gets unwieldy.
- **Do NOT add a calendar view yet.** A simple reverse-chronological list is clearer and easier to implement. A calendar widget can be a future enhancement.
- **Do NOT add filtering or search to the archive.** Keep it simple — scroll and browse. Advanced features can come later.
- **Do NOT put the NavBar on the daily show page.** The show page is meant to be immersive and minimal. The archive link lives in the footer. NavBar is archive-page only.
- **Do NOT add "next day" / "previous day" navigation arrows on the show page.** This adds complexity and the archive page serves the browsing use case. Can be added later if users want it.
