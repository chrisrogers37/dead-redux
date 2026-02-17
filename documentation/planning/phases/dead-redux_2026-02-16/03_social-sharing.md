<!-- Status: 🔧 IN PROGRESS | Started: 2026-02-16 -->
# Phase 03: Social Sharing

## PR Title
`feat: social sharing with dynamic OG images and share buttons`

## Risk Level: Low
## Estimated Effort: Low-Medium (0.5-1 day)

## Files Created
- `src/app/[date]/opengraph-image.tsx`
- `src/components/ShareButtons.tsx`

## Files Modified
- `src/app/[date]/page.tsx` — add ShareButtons component
- `src/app/layout.tsx` — add base OG metadata and site URL config

## Files Deleted
- None

---

## Context

The daily-same-show-for-everyone mechanic is the sharing hook — "have you heard today's Dead show?" This phase makes sharing frictionless with dynamic Open Graph images (so links look great on Twitter/Facebook/iMessage) and simple share buttons.

The URL scheme is already in place from Phase 01: `/{YYYY-MM-DD}`. This means every day's show has a permanent, shareable URL.

---

## Dependencies

- **Requires:** Phase 01 (date-based routing, show data)
- **Can run in parallel with:** Phase 02, Phase 04

---

## Detailed Implementation Plan

### Step 1: Dynamic OG Image Generation

Next.js App Router supports generating Open Graph images at build/request time using the `opengraph-image.tsx` convention. This creates a unique social preview image for each day's show.

Create `src/app/[date]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { getDailyShow, isValidDateStr } from "@/lib/daily-show";

export const runtime = "edge";

export const alt = "Dead Redux — Today's Grateful Dead Show";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  if (!isValidDateStr(date)) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#0D0D0F",
            color: "#F5E6C8",
            fontSize: 48,
            fontFamily: "serif",
          }}
        >
          Dead Redux
        </div>
      ),
      { ...size }
    );
  }

  const show = getDailyShow(date);

  // Format the date nicely: "May 8, 1977"
  const dateObj = new Date(date + "T00:00:00Z");
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

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

        {/* Venue name */}
        <div
          style={{
            fontSize: 52,
            fontFamily: "serif",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 900,
            display: "flex",
          }}
        >
          {show.venue}
        </div>

        {/* Location + date */}
        <div
          style={{
            fontSize: 28,
            color: "#E8DCC8",
            opacity: 0.7,
            marginTop: 20,
            display: "flex",
          }}
        >
          {show.location} · {formattedDate}
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

**How this works:**
- Next.js automatically serves this as the OG image for any `/{date}` route
- Social platforms (Twitter, Facebook, iMessage, Slack) fetch this image when a link is shared
- Each day's URL produces a unique image with the venue name and date
- Uses the Edge runtime for fast generation on Vercel

### Step 2: Share Buttons Component

Create `src/components/ShareButtons.tsx`:

```tsx
"use client";

import { useState } from "react";

interface ShareButtonsProps {
  showDate: string;
  venue: string;
  location: string;
}

export function ShareButtons({ showDate, venue, location }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? window.location.href
    : `https://dead-redux.vercel.app/${showDate}`;

  const text = `Today's Dead show: ${venue}, ${location} — ${showDate}`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing — button will just not show "Copied"
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Twitter/X */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   bg-dead-cream/10 text-dead-cream/70 hover:bg-dead-cream/20 hover:text-dead-cream
                   transition-colors"
        aria-label="Share on Twitter"
      >
        <XIcon />
        Share
      </a>

      {/* Facebook */}
      <a
        href={facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   bg-dead-cream/10 text-dead-cream/70 hover:bg-dead-cream/20 hover:text-dead-cream
                   transition-colors"
        aria-label="Share on Facebook"
      >
        <FacebookIcon />
        Share
      </a>

      {/* Copy link */}
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   bg-dead-cream/10 text-dead-cream/70 hover:bg-dead-cream/20 hover:text-dead-cream
                   transition-colors cursor-pointer"
        aria-label="Copy link"
      >
        <LinkIcon />
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}

// Minimal inline SVG icons (no icon library dependency)

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
```

**Design decisions:**
- Pill-shaped buttons with low-opacity backgrounds (matches the Dead aesthetic)
- No heavy icon library — 3 tiny inline SVGs
- "Copied!" feedback on copy link
- `"use client"` directive because this component uses `useState` and `onClick`

### Step 3: Add ShareButtons to Daily Show Page

Update `src/app/[date]/page.tsx`. Add the import and place the component between the player and the footer:

**Add import at the top:**
```tsx
import { ShareButtons } from "@/components/ShareButtons";
```

**Add after the player div and before the footer div:**
```tsx
        {/* Share */}
        <ShareButtons
          showDate={show.date}
          venue={show.venue}
          location={show.location}
        />
```

The full ordering of elements in the page should be:
1. SYF watermark (background)
2. Site title ("Dead Redux")
3. Show info (venue, location, date)
4. Player (Archive.org embed)
5. **Share buttons** (new)
6. Footer (Relisten/Archive.org credits)
7. Dancing bears (fixed bottom)

### Step 4: Update Layout Metadata

Update `src/app/layout.tsx` metadata to include base OG tags:

```tsx
export const metadata: Metadata = {
  title: "Dead Redux",
  description: "A new Grateful Dead show every day",
  metadataBase: new URL("https://dead-redux.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Dead Redux",
    title: "Dead Redux",
    description: "A new Grateful Dead show every day",
  },
  twitter: {
    card: "summary_large_image",
  },
};
```

**Note on `metadataBase`:** Set this to the actual production URL once deployed. During development, the OG images will still work locally via the dev server. If the domain isn't `dead-redux.vercel.app`, update this value accordingly.

---

## Test Plan

### Manual Verification

1. **OG Image preview:**
   - Visit `http://localhost:3000/2026-02-16/opengraph-image` in the browser
   - Verify it renders a 1200x630 PNG with the venue name, date, and Dead Redux branding
   - Visit a different date and verify the image changes
   - Visit an invalid date and verify a fallback image renders

2. **Share buttons:**
   - Click "Copy Link" — verify clipboard contains the current URL and button text changes to "Copied!"
   - Click Twitter share — verify it opens a new tab with the correct pre-filled tweet text
   - Click Facebook share — verify it opens the Facebook share dialog with the correct URL

3. **Social preview testing:**
   - Deploy to Vercel preview
   - Test the URL in [Twitter Card Validator](https://cards-dev.twitter.com/validator)
   - Test the URL in [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - Paste the URL in iMessage/Slack — verify the preview card shows the OG image

### Automated Tests

- Existing tests from Phase 01 should still pass

---

## Documentation Updates

- None for this phase

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Very long venue name in OG image | Text truncates gracefully (maxWidth: 900) |
| Share button on mobile | Touch targets are large enough (padding), share dialogs open correctly |
| navigator.clipboard not available (HTTP) | Copy button silently fails — no crash |
| OG image for invalid date | Fallback "Dead Redux" image renders |
| Multiple rapid clicks on "Copy Link" | Timer resets correctly, no stale state |

---

## Verification Checklist

- [ ] OG image route renders at `/{date}/opengraph-image`
- [ ] OG image contains venue name, date, and "Dead Redux" branding
- [ ] Different dates produce different OG images
- [ ] Twitter share button opens correct intent URL
- [ ] Facebook share button opens correct sharer URL
- [ ] Copy Link button copies URL and shows "Copied!" feedback
- [ ] `metadataBase` is set in layout.tsx
- [ ] Twitter card meta tag is set to `summary_large_image`
- [ ] All Phase 01 tests still pass

---

## What NOT To Do

- **Do NOT add a Web Share API implementation.** It has inconsistent browser support and the simple button approach works everywhere. Can be added later if needed.
- **Do NOT add share counts or analytics tracking.** Keep it simple — the buttons just open share dialogs.
- **Do NOT install an icon library (lucide, heroicons, etc.) for 3 icons.** Inline SVGs are lighter and have zero dependency cost.
- **Do NOT hardcode the production URL in ShareButtons.** Use `window.location.href` at runtime (already implemented above).
- **Do NOT add email sharing.** Twitter, Facebook, and copy-link cover the primary use cases. Additional channels can come later.
