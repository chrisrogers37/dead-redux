# Phase 02: Favicon & App Identity

## PR Title
`feat: add SYF favicon and apple touch icon`

## Risk Level: Low
## Estimated Effort: Low (0.25 day)

## Files Created
- `src/app/icon.tsx`
- `src/app/apple-icon.tsx`

## Files Modified
- `src/app/layout.tsx`

## Files Deleted
- None

---

## Context

The site currently has no favicon — browser tabs show the generic globe icon, and saving to a mobile home screen has no app icon. This phase adds a dynamic SYF (Steal Your Face) favicon using Next.js App Router's built-in icon conventions, plus proper web app metadata in the layout.

Using `icon.tsx` and `apple-icon.tsx` in the App Router generates icons dynamically at build/request time — no static PNG files needed. The SYF design is already in the codebase as an SVG (`StealYourFace.tsx`), so we reuse the same visual language.

---

## Dependencies

- **Requires:** None
- **Can run in parallel with:** Phase 01, Phase 03

---

## Detailed Implementation Plan

### Step 1: Dynamic Favicon

Create `src/app/icon.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0D0F",
          borderRadius: "6px",
        }}
      >
        {/* Simplified SYF — circle with lightning bolt */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer circle */}
          <circle cx="100" cy="100" r="90" stroke="#F5E6C8" strokeWidth="8" />
          {/* Lightning bolt */}
          <path
            d="M100 10 L115 90 L85 90 L100 190"
            stroke="#D42A2A"
            strokeWidth="8"
            fill="none"
          />
          {/* Left half fill */}
          <path
            d="M100 10 A90 90 0 0 0 100 190 L85 90 L115 90 Z"
            fill="#1A3A6B"
            opacity="0.6"
          />
          {/* Right half fill */}
          <path
            d="M100 10 A90 90 0 0 1 100 190 L85 90 L115 90 Z"
            fill="#D42A2A"
            opacity="0.6"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
```

This renders a tiny SYF icon: dark background, circle with the classic red/blue halves split by a lightning bolt. At 32x32 it reads as the iconic Dead symbol.

### Step 2: Apple Touch Icon

Create `src/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0D0F",
          borderRadius: "36px",
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer circle */}
          <circle cx="100" cy="100" r="90" stroke="#F5E6C8" strokeWidth="6" />
          {/* Lightning bolt */}
          <path
            d="M100 10 L115 90 L85 90 L100 190"
            stroke="#D42A2A"
            strokeWidth="6"
            fill="none"
          />
          {/* Left half fill */}
          <path
            d="M100 10 A90 90 0 0 0 100 190 L85 90 L115 90 Z"
            fill="#1A3A6B"
            opacity="0.6"
          />
          {/* Right half fill */}
          <path
            d="M100 10 A90 90 0 0 1 100 190 L85 90 L115 90 Z"
            fill="#D42A2A"
            opacity="0.6"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
```

Same design as the favicon but at 180x180 for Apple devices. The `borderRadius: "36px"` matches iOS icon rounding.

### Step 3: Update Layout Metadata

Update `src/app/layout.tsx` metadata to add web app manifest fields:

**Current metadata (lines 11-24):**
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

**Replace with:**
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
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dead Redux",
    "theme-color": "#0D0D0F",
  },
};
```

This adds:
- `mobile-web-app-capable` / `apple-mobile-web-app-capable` — enables "Add to Home Screen" on mobile
- `apple-mobile-web-app-status-bar-style: black-translucent` — dark status bar matching our theme
- `apple-mobile-web-app-title` — short name for home screen
- `theme-color` — browser chrome color (matches `dead-ink`)

---

## Test Plan

### Manual Verification

1. **Favicon:** Open the site in a browser tab — SYF icon should appear in the tab
2. **Apple icon:** Inspect page source — `<link rel="apple-touch-icon" ...>` should be present
3. **Theme color:** On mobile, browser chrome should be dark (#0D0D0F)
4. **Build:** Verify `icon.tsx` and `apple-icon.tsx` generate without errors

### Automated Tests

- No new tests needed (static asset generation)
- All existing tests still pass

---

## Verification Checklist

- [ ] Favicon visible in browser tab
- [ ] Apple touch icon link present in HTML head
- [ ] Theme color meta tag present
- [ ] Mobile web app meta tags present
- [ ] Favicon renders as SYF (circle with red/blue halves and lightning bolt)
- [ ] All existing tests pass
- [ ] `npm run build` succeeds

---

## What NOT To Do

- **Do NOT add a static `favicon.ico` to `public/`.** The dynamic `icon.tsx` convention is cleaner and doesn't require managing static files.
- **Do NOT add a `manifest.json` web app manifest.** The `other` metadata fields handle what we need. A full PWA manifest is overkill for this site.
- **Do NOT change any other metadata** (title, description, OG tags). Those are correct as-is.
