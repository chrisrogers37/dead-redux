# Phase 01: Archive Page Polish

## PR Title
`feat: add visual identity to archive page (SYF watermark, bears, OG image)`

## Risk Level: Low
## Estimated Effort: Low (0.25 day)

## Files Created
- `src/app/archive/opengraph-image.tsx`

## Files Modified
- `src/app/archive/page.tsx`

## Files Deleted
- None

---

## Context

The archive page currently feels visually disconnected from the show page. The show page has a SYF watermark background, dancing bears, and a player-glow effect that give it character. The archive page is plain text on a dark background with no visual richness. This phase brings the archive page into visual parity by adding the same background elements and creating a shareable OG image.

**Screenshot reference:** `/tmp/design-review/archive-desktop.png` — note the bare dark background with no decorative elements.

---

## Dependencies

- **Requires:** None
- **Can run in parallel with:** Phase 02, Phase 03

---

## Detailed Implementation Plan

### Step 1: Add SYF Watermark and Dancing Bears to Archive Page

Update `src/app/archive/page.tsx`:

**Add imports:**
```tsx
import { StealYourFace } from "@/components/StealYourFace";
import { DancingBears } from "@/components/DancingBears";
```

**Restructure the `<main>` to match the show page pattern:**

Current:
```tsx
<main className="min-h-screen p-4">
  <div className="w-full max-w-2xl mx-auto">
    {/* Nav */}
    <NavBar />
    {/* ... rest of content */}
  </div>
</main>
```

Replace with:
```tsx
<main className="relative min-h-screen flex flex-col items-center p-4 overflow-hidden">
  {/* Background SYF watermark */}
  <StealYourFace className="absolute inset-0 flex items-center justify-center text-dead-cream" />

  {/* Content */}
  <div className="relative z-10 w-full max-w-2xl mx-auto">
    {/* Nav */}
    <NavBar />

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

  {/* Dancing bears */}
  <DancingBears />
</main>
```

Key changes:
- Add `relative overflow-hidden` to `<main>` for watermark positioning
- Add `flex flex-col items-center` for centering
- Add SYF watermark as absolute background
- Add `relative z-10` to content wrapper so it sits above watermark
- Add DancingBears at the bottom

### Step 2: Create Archive OG Image

Create `src/app/archive/opengraph-image.tsx`, modeled on the existing `src/app/[date]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { getDailyPicksRange, getLaunchDate } from "@/lib/archive";
import { getTodayDateStr } from "@/lib/daily-show";

export const runtime = "edge";

export const alt = "Dead Redux — Archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const today = getTodayDateStr();
  const launch = getLaunchDate();
  const count = today >= launch
    ? getDailyPicksRange(launch, today).length
    : 0;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#0D0D0F",
          color: "#F5E6C8",
          padding: "60px",
          position: "relative",
        }}
      >
        {/* Subtle background gradient */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(26,58,107,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(212,42,42,0.12) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Top: Site name */}
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#D4A843",
            marginBottom: 20,
            display: "flex",
          }}
        >
          Dead Redux
        </div>

        {/* Lightning bolt divider */}
        <div
          style={{
            width: 200,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, #D42A2A, #F5E6C8, #1A3A6B, transparent)",
            marginBottom: 40,
            display: "flex",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontFamily: "serif",
            textAlign: "center",
            lineHeight: 1.2,
            display: "flex",
          }}
        >
          Archive
        </div>

        {/* Show count */}
        <div
          style={{
            fontSize: 28,
            color: "#E8DCC8",
            opacity: 0.7,
            marginTop: 20,
            display: "flex",
          }}
        >
          {count} show{count !== 1 ? "s" : ""} featured
        </div>

        {/* Bottom: CTA */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 18,
            color: "#E8DCC8",
            opacity: 0.4,
            display: "flex",
          }}
        >
          A new Grateful Dead show every day
        </div>
      </div>
    ),
    { ...size }
  );
}
```

This follows the exact same visual style as the existing show page OG image (same colors, gradient, divider, layout).

---

## Test Plan

### Manual Verification

1. **Archive page:** Visit `/archive` — SYF watermark visible behind content, dancing bears at bottom
2. **Visual parity:** Compare archive page and show page side by side — both should have the same background treatment
3. **Content readability:** Ensure timeline text is still readable over the watermark (watermark is very low opacity)
4. **OG image:** Run `curl -s https://dead-redux.vercel.app/archive | grep og:image` — verify OG image URL is present
5. **OG image render:** Visit the OG image URL directly — should show "Archive" with show count

### Automated Tests

- No new tests needed (visual changes only)
- All existing tests still pass

---

## Verification Checklist

- [ ] SYF watermark visible on archive page
- [ ] Dancing bears visible at bottom of archive page
- [ ] Timeline content is readable (not obscured by watermark)
- [ ] Archive OG image generates without errors
- [ ] OG image shows "Archive" title and show count
- [ ] Mobile layout still works at 375px
- [ ] All existing tests pass
- [ ] `npm run build` succeeds

---

## What NOT To Do

- **Do NOT change the Timeline or NavBar components.** This phase only modifies the archive page layout and adds the OG image.
- **Do NOT add the `player-glow` effect to the archive page.** There's no player on this page — the glow effect is specific to the audio player container.
- **Do NOT change the archive page's ISR revalidation.** The `revalidate = 3600` setting is correct for this page.
