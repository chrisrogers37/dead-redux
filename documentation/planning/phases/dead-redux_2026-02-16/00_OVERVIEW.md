# Dead Redux — Product Enhancement Plan

## Session Context

- **Date:** 2026-02-16
- **Scope:** Greenfield build — a minimal daily Grateful Dead show website
- **Goal:** Each day, all visitors see the same randomly-selected Grateful Dead show with an embedded audio player. Minimal UI, heavily Dead-themed aesthetic, optimized for sharing.

## User Intent

- **Discovery & ritual:** Give Deadheads (and newcomers) a daily reason to visit and discover a show
- **Social sharing:** Make it easy to share today's show on social media
- **Minimal by default:** Just the player, the date, and the venue — no clutter
- **Dead-themed:** The design should feel unmistakably Grateful Dead (dancing bears, Steal Your Face, psychedelic touches)

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15+ (App Router) | Matches existing patterns (really-personal-finance), SSR/ISR for daily updates |
| Language | TypeScript | User's standard for web apps |
| Styling | Tailwind CSS 4 | User's standard |
| Deployment | Vercel | Matches existing patterns, built-in ISR + cron |
| Database | None (Phase 1-4) | Show catalog is static, selection is deterministic |
| Data Source | Relisten API (api.relisten.net) | 2,079 shows, structured JSON, free, open source |
| Audio | Archive.org embedded player | Free, comprehensive, iframe embed |

## Phase Status

| Phase | Status | PR | Started | Completed |
|-------|--------|-----|---------|-----------|
| 01 | ✅ COMPLETE | #1 | 2026-02-16 | 2026-02-16 |
| 02 | ✅ COMPLETE | #2 | 2026-02-16 | 2026-02-16 |
| 03 | ✅ COMPLETE | #3 | 2026-02-16 | 2026-02-16 |
| 04 | ✅ COMPLETE | #4 | 2026-02-17 | 2026-02-17 |
| 05 | 📋 PENDING | — | — | — |

## Phase Summary

| Phase | Title | Effort | Risk | Dependencies |
|-------|-------|--------|------|-------------|
| 01 | Core Infrastructure & Daily Show | Medium | Low | None |
| 02 | Dead-Themed Visual Design | Medium | Low | Phase 01 |
| 03 | Social Sharing | Low-Medium | Low | Phase 01 |
| 04 | Show Info Display | Low | Low | Phase 01 |
| 05 | Past Picks Timeline | Medium | Low | Phase 01 |

## Dependency Graph

```
Phase 01 (Core Infrastructure)
  ├── Phase 02 (Visual Design)     — can run after 01
  ├── Phase 03 (Social Sharing)    — can run after 01
  ├── Phase 04 (Show Info)         — can run after 01
  └── Phase 05 (Past Picks)        — can run after 01
```

**Phases 02, 03, 04 can run in parallel** after Phase 01 is merged — they touch disjoint concerns:
- Phase 02: CSS/design files, layout components
- Phase 03: OG image generation, meta tags, share components
- Phase 04: Show info data fetching, info display component

**Phase 05** should run after Phases 02-04 are merged (it needs the design system and URL routing from those phases).

## Total Estimated Effort

~3-5 days of focused engineering time across all phases.

## Future Enhancements (Not in Scope)

- "On This Day" historical context (Phase 6, deferred)
- YouTube video embed for shows with video
- Community features (comments, ratings)
- Email digest / push notifications
- Curated "best of" collections
