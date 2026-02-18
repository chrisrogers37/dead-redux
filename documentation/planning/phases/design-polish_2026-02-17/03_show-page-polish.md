# Phase 03: Show Page Polish

## PR Title
`fix: show page UX polish — venue wrapping, player skeleton, details toggle, share buttons`

## Risk Level: Low
## Estimated Effort: Low-Medium (0.5 day)

## Files Created
- None

## Files Modified
- `src/app/[date]/page.tsx` — fix venue name wrapping
- `src/components/ShowPlayer.tsx` — add loading skeleton
- `src/components/ShowInfo.tsx` — make toggle more discoverable
- `src/components/ShareButtons.tsx` — enhanced styling

## Files Deleted
- None

---

## Context

Four small polish items on the show page, each addressing a specific visual or UX gap identified in the design review:

1. **Venue name truncation** — on mobile (375px), long venue names like "Travelodge Theatre in the Round" get cut off with ellipsis. They should wrap naturally.
2. **Player loading state** — the Archive.org iframe shows a gray/blank rectangle while loading. A skeleton pulse gives visual feedback.
3. **"Show Details" toggle** — the current button is very faint (40% opacity, tiny text) and easy to miss. Making it a subtle pill makes it scannable as interactive.
4. **Share button styling** — the buttons work but are visually plain. Adding a subtle border ties them to the Dead-themed aesthetic.

**Screenshot references:**
- `/tmp/design-review/home-mobile.png` — venue truncation visible
- `/tmp/design-review/home-desktop2.png` — player gray box, faint "Show Details" text

---

## Dependencies

- **Requires:** None
- **Can run in parallel with:** Phase 01, Phase 02

---

## Detailed Implementation Plan

### Step 1: Fix Venue Name Wrapping

In `src/app/[date]/page.tsx`, the venue is displayed in an `<h2>` (line 53-54):

**Current (line 53):**
```tsx
<h2 className="font-display text-2xl md:text-3xl text-dead-cream">
```

The h2 doesn't have truncation, but the container has `text-center` which handles wrapping fine on desktop. On mobile, the issue is the `md:text-3xl` being too large for long names at 375px. The actual screenshot shows the venue text slightly clipping on the right edge.

**No CSS class change needed.** The text already wraps. However, looking at the mobile screenshot more carefully, the text is slightly too large on very small screens. Add a smaller base size:

**Replace line 53:**
```tsx
<h2 className="font-display text-xl sm:text-2xl md:text-3xl text-dead-cream">
```

This adds `text-xl` (1.25rem) as the smallest breakpoint, scaling up to `text-2xl` at `sm` (640px) and `text-3xl` at `md` (768px). Long venue names will wrap cleanly at 375px.

### Step 2: Player Loading Skeleton

In `src/components/ShowPlayer.tsx`, the iframe currently renders with no loading indicator.

**Current full file:**
```tsx
interface ShowPlayerProps {
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="w-full bg-dead-charcoal/50">
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className="block border-0"
      />
    </div>
  );
}
```

**Replace with:**
```tsx
"use client";

import { useState } from "react";

interface ShowPlayerProps {
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const [loaded, setLoaded] = useState(false);
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="relative w-full bg-dead-charcoal/50">
      {/* Skeleton pulse while loading */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse text-dead-bone/20 text-sm">Loading player...</div>
        </div>
      )}
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className={`block border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
```

Changes:
- Convert to client component (`"use client"`) for `useState` and `onLoad`
- Add `relative` to container for absolute positioning of skeleton
- Show "Loading player..." with `animate-pulse` while iframe loads
- Iframe starts `opacity-0`, transitions to `opacity-100` on load via `onLoad` callback
- `transition-opacity duration-500` for a smooth fade-in

### Step 3: Make "Show Details" Toggle More Discoverable

In `src/components/ShowInfo.tsx`, the toggle button (lines 40-60) is currently:

**Current (lines 41-43):**
```tsx
className="w-full flex items-center justify-center gap-2 py-2 text-xs
           text-dead-bone/40 hover:text-dead-bone/70 transition-colors cursor-pointer"
```

**Replace with:**
```tsx
className="mx-auto flex items-center justify-center gap-2 py-2 px-5 rounded-full text-xs
           text-dead-bone/50 hover:text-dead-bone/80 border border-dead-bone/10 hover:border-dead-bone/20
           transition-colors cursor-pointer"
```

Changes:
- `w-full` → `mx-auto` — button is no longer full-width, centers naturally as a pill
- Added `px-5 rounded-full` — pill shape gives it a clear interactive affordance
- Added `border border-dead-bone/10 hover:border-dead-bone/20` — subtle border makes it scannable
- Increased opacity: `/40` → `/50` default, `/70` → `/80` hover — slightly more visible

### Step 4: Enhanced Share Button Styling

In `src/components/ShareButtons.tsx`, the three buttons (lines 40-42, 54-56, 66-68) share the same base class:

**Current class (used on all three):**
```
inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
bg-dead-cream/10 text-dead-cream/70 hover:bg-dead-cream/20 hover:text-dead-cream
transition-colors
```

**Replace with (on all three):**
```
inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
border border-dead-cream/10 bg-dead-cream/5 text-dead-cream/70
hover:border-dead-cream/20 hover:bg-dead-cream/10 hover:text-dead-cream
transition-colors
```

Changes:
- Added `border border-dead-cream/10` — subtle border matching the player container border
- Reduced `bg-dead-cream/10` → `bg-dead-cream/5` — lighter fill so the border is the primary affordance
- Hover: `hover:border-dead-cream/20` — border becomes slightly more visible on hover
- Hover: `hover:bg-dead-cream/10` (was `/20`) — balanced with the new border

Additionally, on the `<button>` (copy link, line 64), add `cursor-pointer` if not already present. It's already there — confirmed on line 68.

---

## Test Plan

### Manual Verification

1. **Venue wrapping:** Visit a show with a long venue name on mobile (375px) — name should wrap to two lines, not truncate
2. **Player skeleton:** Load a show page — see "Loading player..." pulse, then smooth fade-in when iframe loads
3. **Show Details toggle:** The button should appear as a subtle pill with a border, more visible than before
4. **Share buttons:** All three buttons should have subtle borders, lighter background, consistent hover behavior
5. **Desktop:** Verify all changes look correct at 1440px
6. **Mobile:** Verify all changes look correct at 375px

### Automated Tests

- No new tests needed (visual/interaction changes only)
- All existing tests still pass

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Very long venue name (40+ chars) | Wraps to 2-3 lines at mobile, stays 1-2 lines at desktop |
| Archive.org embed fails to load | "Loading player..." stays visible indefinitely — acceptable, matches current behavior |
| Archive.org embed loads instantly | Skeleton flashes briefly, then fades in — `duration-500` makes this smooth |
| "Show Details" with setlist expanded | Pill button changes text to "Hide Details", border stays consistent |
| "Copied!" state on copy button | Button text changes, border styling remains |

---

## Verification Checklist

- [ ] Venue name wraps on mobile (not truncated)
- [ ] Font size scales: `text-xl` → `text-2xl` → `text-3xl` across breakpoints
- [ ] Player shows "Loading player..." pulse before iframe loads
- [ ] Player fades in smoothly when iframe loads
- [ ] "Show Details" appears as a pill with border
- [ ] "Show Details" opacity increased (more visible)
- [ ] Share buttons have subtle borders
- [ ] Share button hover state works (border + background)
- [ ] All changes look correct at 375px mobile
- [ ] All changes look correct at 1440px desktop
- [ ] All existing tests pass
- [ ] `npm run build` succeeds

---

## What NOT To Do

- **Do NOT add JavaScript-based loading detection (IntersectionObserver, etc.)** The iframe `onLoad` event is sufficient and simple.
- **Do NOT change the player height (400px).** That's the right size for the Archive.org embed.
- **Do NOT add animations to the share buttons.** A subtle border is enough polish — hover glow or scale transforms would be over-engineered for this minimal aesthetic.
- **Do NOT change the "Show Details" expanded panel styling.** This phase only touches the toggle button, not the expandable content.
- **Do NOT make the share buttons larger.** The current `px-3 py-1.5 text-xs` sizing is intentionally minimal — we're adding refinement, not prominence.
