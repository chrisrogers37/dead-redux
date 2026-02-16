# Phase 02: Dead-Themed Visual Design

> **Status:** 🔧 IN PROGRESS
> **Started:** 2026-02-16

## PR Title
`feat: dead-themed visual design with dancing bears and psychedelic aesthetic`

## Risk Level: Low
## Estimated Effort: Medium (1-2 days)

## Files Created
- `src/components/DancingBears.tsx`
- `src/components/SteelYourFace.tsx`
- `public/fonts/` (web font files — see font selection below)
- `public/images/dancing-bear.svg` (hand-drawn or sourced SVG)
- `public/images/steal-your-face.svg`
- `public/images/bolt-pattern.svg` (repeating lightning bolt for backgrounds)

## Files Modified
- `src/app/layout.tsx` — add fonts, update body classes
- `src/app/globals.css` — add custom properties, background patterns, animations
- `src/app/[date]/page.tsx` — wrap content in themed layout, add bears
- `src/components/ShowPlayer.tsx` — add themed wrapper around iframe
- ~~`tailwind.config.ts`~~ — N/A, Tailwind v4 uses CSS `@theme` in globals.css

## Files Deleted
- None

---

## Context

The user wants the site to be "minimal and clean from a display standpoint but heavily Dead-themed in blank space." This means the content area stays readable and uncluttered, but the surrounding space, backgrounds, and decorative elements are unmistakably Grateful Dead.

Key visual elements:
- **Dancing Bears** — the iconic marching bears (the user specifically called these out as "teddy bears")
- **Steal Your Face** (SYF) skull with lightning bolt
- **Color palette** — the classic Dead red, white, blue, with warm accents
- **Psychedelic typography** — for headers/logo, not body text
- **Texture** — subtle aged/vintage feel, not sterile modern

---

## Dependencies

- **Requires:** Phase 01 (project exists, basic page renders)
- **Unlocks:** Phase 05 (past picks needs the design system)

---

## Detailed Implementation Plan

### Step 1: Color Palette & Theme (Tailwind v4 CSS `@theme`)

> **Plan correction:** Project uses Tailwind v4 which uses CSS `@theme` directives, not `tailwind.config.ts`. All theme customization goes in `globals.css`.

Add the Dead color palette, fonts, and animations via `@theme` in `globals.css`:

```css
@theme {
  --color-dead-red: #D42A2A;
  --color-dead-blue: #1A3A6B;
  --color-dead-cream: #F5E6C8;
  --color-dead-gold: #D4A843;
  --color-dead-bone: #E8DCC8;
  --color-dead-charcoal: #1C1C1E;
  --color-dead-ink: #0D0D0F;

  --font-display: var(--font-playfair-display), serif;
  --font-body: system-ui, sans-serif;

  --animate-bear-walk: bear-walk 12s linear infinite;
}

@keyframes bear-walk {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(calc(100vw + 100%)); }
}
```

**Color rationale:**
- `dead-red` / `dead-blue` — from the Steal Your Face logo
- `dead-cream` / `dead-bone` — warm vintage tones for text on dark backgrounds
- `dead-gold` — accent color (roses, highlights)
- `dead-charcoal` / `dead-ink` — dark backgrounds (not pure black — warmer)

### Step 2: Typography

Choose two fonts:
- **Display font:** A serif or decorative font with character. Recommendation: **"Playfair Display"** (Google Fonts, free) — it has the right vintage/editorial feel without being illegible. Alternative: **"EB Garamond"** for a more classic look.
- **Body font:** Use system fonts (already fast, clean).

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const displayFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

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
    <html lang="en" className={displayFont.variable}>
      <body className="bg-dead-ink text-dead-cream antialiased font-body">
        {children}
      </body>
    </html>
  );
}
```

### Step 3: Global Styles & Background Pattern

Update `src/app/globals.css`:

```css
@import "tailwindcss";

/*
 * Subtle background texture: a faint noise overlay to give the
 * dark background a vintage/aged feel instead of flat digital black.
 */
body {
  background-color: #0D0D0F;
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(26, 58, 107, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 50%, rgba(212, 42, 42, 0.06) 0%, transparent 50%);
  min-height: 100vh;
}

/*
 * Lightning bolt divider — a subtle horizontal rule styled
 * after the SYF lightning bolt.
 */
.bolt-divider {
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #D42A2A 20%,
    #F5E6C8 50%,
    #1A3A6B 80%,
    transparent 100%
  );
  opacity: 0.4;
}

/*
 * Glow effect for the player area
 */
.player-glow {
  box-shadow:
    0 0 40px rgba(212, 42, 42, 0.1),
    0 0 80px rgba(26, 58, 107, 0.08);
}
```

### Step 4: Dancing Bears Component

Create `src/components/DancingBears.tsx`:

```tsx
/**
 * A row of dancing bears that slowly marches across the bottom of the page.
 * Uses CSS animation — no JS animation libraries needed.
 *
 * The bears are rendered as inline SVGs for easy color control.
 * Each bear is offset slightly in timing to create a parade effect.
 */

const BEAR_COLORS = [
  "#D42A2A", // red
  "#D4A843", // gold
  "#1A3A6B", // blue
  "#2D8B46", // green
  "#D46A2A", // orange
];

function Bear({ color, delay }: { color: string; delay: number }) {
  return (
    <div
      className="inline-block mx-3 animate-bear-walk"
      style={{ animationDelay: `${delay}s` }}
    >
      <svg
        width="32"
        height="36"
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Simplified dancing bear silhouette */}
        {/* Head */}
        <circle cx="16" cy="6" r="5" fill={color} />
        {/* Ears */}
        <circle cx="12" cy="2" r="2.5" fill={color} />
        <circle cx="20" cy="2" r="2.5" fill={color} />
        {/* Body */}
        <ellipse cx="16" cy="18" rx="7" ry="9" fill={color} />
        {/* Arms - raised in dance pose */}
        <ellipse cx="7" cy="14" rx="2.5" ry="5" fill={color} transform="rotate(-30 7 14)" />
        <ellipse cx="25" cy="14" rx="2.5" ry="5" fill={color} transform="rotate(30 25 14)" />
        {/* Legs - mid-step */}
        <ellipse cx="12" cy="29" rx="2.5" ry="5" fill={color} transform="rotate(-10 12 29)" />
        <ellipse cx="20" cy="30" rx="2.5" ry="5" fill={color} transform="rotate(10 20 30)" />
      </svg>
    </div>
  );
}

export function DancingBears() {
  return (
    <div
      className="fixed bottom-4 left-0 w-full overflow-hidden pointer-events-none opacity-30"
      aria-hidden="true"
    >
      <div className="flex whitespace-nowrap">
        {BEAR_COLORS.map((color, i) => (
          <Bear key={i} color={color} delay={i * 2.4} />
        ))}
      </div>
    </div>
  );
}
```

**Note:** This is a simplified SVG bear. For a more accurate dancing bear, consider commissioning or sourcing a proper SVG and placing it at `public/images/dancing-bear.svg`. The Grateful Dead's dancing bear imagery is iconic and widely reproduced in fan art — source one that is free/open for use, or create an original interpretation. The component structure supports swapping in a better SVG later without changing any other code.

### Step 5: Steal Your Face Component

Create `src/components/SteelYourFace.tsx`:

```tsx
/**
 * A subtle Steal Your Face (SYF) skull rendered as a background watermark.
 * Positioned behind the main content at low opacity.
 */
export function StealYourFace({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Outer circle */}
        <circle cx="100" cy="100" r="95" stroke="currentColor" strokeWidth="3" opacity="0.15" />

        {/* Lightning bolt divider — the iconic diagonal split */}
        <path
          d="M100 5 L115 95 L85 95 L100 195"
          stroke="currentColor"
          strokeWidth="4"
          opacity="0.1"
          fill="none"
        />

        {/* Simplified skull shape */}
        <ellipse cx="100" cy="90" rx="55" ry="50" stroke="currentColor" strokeWidth="2" opacity="0.08" />

        {/* Eye sockets */}
        <circle cx="80" cy="82" r="12" stroke="currentColor" strokeWidth="2" opacity="0.08" />
        <circle cx="120" cy="82" r="12" stroke="currentColor" strokeWidth="2" opacity="0.08" />
      </svg>
    </div>
  );
}
```

### Step 6: Update Daily Show Page

Update `src/app/[date]/page.tsx` to incorporate the design:

```tsx
import { notFound } from "next/navigation";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPlayer } from "@/components/ShowPlayer";
import { DancingBears } from "@/components/DancingBears";
import { StealYourFace } from "@/components/SteelYourFace";

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
    <main className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background SYF watermark */}
      <StealYourFace className="absolute inset-0 flex items-center justify-center text-dead-cream" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
        {/* Site title */}
        <div className="text-center">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight text-dead-cream">
            Dead Redux
          </h1>
          <div className="bolt-divider mt-3 mx-auto max-w-xs" />
        </div>

        {/* Show info */}
        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-dead-gold">
            {isToday ? "Today\u2019s Show" : show.date}
          </p>
          <h2 className="font-display text-2xl md:text-3xl text-dead-cream">
            {show.venue}
          </h2>
          <p className="text-sm text-dead-bone/70">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Player */}
        <div className="player-glow rounded-xl overflow-hidden border border-dead-cream/10">
          {bestSource ? (
            <ShowPlayer archiveId={bestSource.upstreamIdentifier} />
          ) : (
            <div className="text-center py-16 text-dead-bone/50">
              <p>No audio source available for this show.</p>
              <p className="text-sm mt-2">
                Try{" "}
                <a
                  href={`https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-dead-gold/70 hover:text-dead-gold"
                >
                  Relisten
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/30 pt-4">
          <p>
            Powered by{" "}
            <a href="https://relisten.net/grateful-dead" target="_blank" rel="noopener noreferrer" className="underline hover:text-dead-bone/50">
              Relisten
            </a>
            {" "}&amp;{" "}
            <a href="https://archive.org/details/GratefulDead" target="_blank" rel="noopener noreferrer" className="underline hover:text-dead-bone/50">
              Archive.org
            </a>
          </p>
        </div>
      </div>

      {/* Dancing bears */}
      <DancingBears />
    </main>
  );
}
```

### Step 7: Update ShowPlayer with Themed Wrapper

Update `src/components/ShowPlayer.tsx`:

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
        frameBorder="0"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className="block"
      />
    </div>
  );
}
```

---

## Test Plan

### Visual Verification (Manual)

1. **Dark theme:** Background should be warm dark (not pure black), with subtle red/blue radial gradients
2. **Typography:** "Dead Redux" title renders in Playfair Display serif font, body text in system sans-serif
3. **Colors:** Gold accent on "Today's Show", cream text, bone-colored secondary text
4. **Lightning bolt divider:** Horizontal gradient line below the title (red → cream → blue)
5. **Player glow:** Subtle red/blue box shadow around the player area
6. **Dancing bears:** Row of 5 colored bears scrolling across the bottom of the page at low opacity
7. **SYF watermark:** Very faint skull/circle outline behind the content
8. **Mobile:** All elements scale properly on mobile viewport (375px width)
9. **No horizontal scroll:** Bears overflow is hidden, no layout breaking

### Automated Tests

- Existing tests from Phase 01 should still pass (no logic changes)

---

## Documentation Updates

- None for this phase

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Mobile viewport (375px) | Layout stacks vertically, bears still animate, text readable |
| Very long venue name | Text wraps gracefully, no overflow |
| Reduced motion preference | Bears animation should respect `prefers-reduced-motion` — add media query |
| Dark mode toggle | N/A — site is always dark |

### Accessibility Note

Add to `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-bear-walk {
    animation: none;
    display: none;
  }
}
```

---

## Verification Checklist

- [ ] Tailwind config has Dead color palette
- [ ] Playfair Display font loads from Google Fonts
- [ ] Background has subtle red/blue gradients
- [ ] "Dead Redux" title renders in display font
- [ ] Lightning bolt divider visible below title
- [ ] Dancing bears animate across bottom of page
- [ ] SYF watermark visible at low opacity behind content
- [ ] Player has glow effect
- [ ] Mobile layout works at 375px
- [ ] `prefers-reduced-motion` hides bear animation
- [ ] All Phase 01 tests still pass

---

## What NOT To Do

- **Do NOT use copyrighted Grateful Dead artwork directly.** The dancing bear and SYF are widely used in fan art, but create original SVG interpretations rather than copying official artwork pixel-for-pixel.
- **Do NOT make the bears or SYF too prominent.** They should be ambient/atmospheric — opacity 0.3 or lower. The content area should feel clean.
- **Do NOT add custom fonts for body text.** System fonts are faster and cleaner for readable text. Only the display/heading font should be custom.
- **Do NOT use bright/saturated colors for body text.** Keep text in the cream/bone range. Only accents (gold, red) should be saturated, and sparingly.
- **Do NOT add animation libraries (Framer Motion, GSAP).** Pure CSS animations are sufficient for the bears and any hover effects. Keep the bundle small.
- **Do NOT change any logic or API calls.** This phase is purely visual — the data flow and page structure from Phase 01 stay the same.
