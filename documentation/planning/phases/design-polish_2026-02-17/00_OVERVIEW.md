# Design Polish — Product Enhancement Plan

## Session Context

- **Date:** 2026-02-17
- **Scope:** Visual design review and polish pass across both pages
- **Goal:** Unify visual identity between show page and archive page, add site identity (favicon), and polish interaction details on the show page.
- **App URL:** https://dead-redux.vercel.app
- **Screenshots:** `/tmp/design-review/`

## User Intent

- **Visual consistency:** Both pages should feel like the same app (archive currently feels bare)
- **Site identity:** Favicon and app manifest for browser tabs, bookmarks, mobile home screens
- **Polish:** Small but noticeable UX improvements — player loading state, discoverable details toggle, venue name wrapping, share button styling

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16+ (App Router) |
| Styling | Tailwind CSS 4 |
| Deployment | Vercel |

## Phase Status

| Phase | Status | PR | Started | Completed |
|-------|--------|-----|---------|-----------|
| 01 | 📋 PENDING | — | — | — |
| 02 | 📋 PENDING | — | — | — |
| 03 | 📋 PENDING | — | — | — |

## Phase Summary

| Phase | Title | Effort | Risk | Dependencies |
|-------|-------|--------|------|-------------|
| 01 | Archive Page Polish | Low | Low | None |
| 02 | Favicon & App Identity | Low | Low | None |
| 03 | Show Page Polish | Low-Medium | Low | None |

## Dependency Graph

```
Phase 01 (Archive Page Polish)     — independent
Phase 02 (Favicon & App Identity)  — independent
Phase 03 (Show Page Polish)        — independent
```

**All three phases touch completely disjoint files and can run in parallel.**

- Phase 01: `src/app/archive/page.tsx`, `src/app/archive/opengraph-image.tsx`
- Phase 02: `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/app/layout.tsx`
- Phase 03: `src/app/[date]/page.tsx`, `src/components/ShowPlayer.tsx`, `src/components/ShowInfo.tsx`, `src/components/ShareButtons.tsx`

## Total Estimated Effort

~0.5–1 day of focused engineering time across all phases (can be done in under an hour if parallelized).
