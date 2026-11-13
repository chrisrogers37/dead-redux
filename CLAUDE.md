# CLAUDE.md

Dead Redux features one Grateful Dead show a day and plays it in a three.js world. `README.md` describes the site and how to run it; `PROJECT_MISSION.md` says where it is going. This file holds the rules the repo already keeps, each cited to the test, script, workflow or record behind it.

## Checks

CI's three required checks (`.github/workflows/ci.yml`):

```sh
npm run lint        # Lint
npx tsc --noEmit    # Type-check
npm run test:run    # Unit tests: every vitest file in src/lib/__tests__/ and scripts/__tests__/
```

One file: `npx vitest run src/lib/__tests__/quality.test.ts`. The dev server sends no Content-Security-Policy (`src/proxy.ts`), so check anything the policy governs on a build or a preview.

## Where things are

- `src/app/`: the pages, the `/api/playing/<date>` route, the icons and the share cards.
- `src/components/world/WorldHome.tsx`: the page around the world, its HUD, and the script tag that loads the world.
- `src/components/player/`: the audio player.
- `src/lib/`: the daily pick, the Relisten look-up, the policy and the import map.
- `public/world/*.js`: the world, as plain ES modules outside the bundle. They import only each other and three.js.
- `public/maps/<show date>.json`: one map per show.
- `data/shows.json`: the catalog. `data/pick-schedule.json`: every date's show.
- `scripts/`: the catalog refresh and the Maps workflow's scripts.
- `src/lib/__tests__/` (the world's tests too) and `scripts/__tests__/`: vitest.
- `.github/workflows/`: `ci.yml`, `screenshots.yml`, `maps.yml`. `.github/screenshots/`: the shoot, with its own `package.json`.

## How a change lands

- Through a pull request off `main`. The repo's "Protect main" ruleset requires one, with Lint, Type-check and Unit tests passing and one approving review, and refuses force pushes and deletion.
- Small PRs, each with a code review and a review of its screenshots (#121).
- Every push to a PR's branch gets a Vercel preview, and the Screenshots workflow shoots it (`screenshots.yml`). The run's artifact holds the stills and recordings the screenshot review reads.
- Commit and PR titles start with the area they change, such as `world:`, `maps:`, `ci:` or `player:` (`git log`).

## three.js is pinned, by version and by hash

- three 0.185.0 loads from jsDelivr through the import map in `src/lib/import-map.ts`, which gives each file a sha384 digest. `import-map.test.ts` holds the map to exactly the files the world imports, at the version `package.json` installs for the tests (`devDependencies`).
- The Screenshots workflow fetches each pinned file and fails when the CDN's copy doesn't match its digest.
- An upgrade changes the version in both places and every digest, in one PR.

## The Content-Security-Policy

- Each page gets a policy with a fresh nonce (`src/proxy.ts`, `src/lib/csp.ts`): scripts only from the site, the nonce and the pinned three.js files; media only from archive.org; connections only to the site. `security-headers.test.ts` pins the policy and the other headers (`next.config.ts`).
- The roadmap's arcs are "built in code, with no files from outside the site and no change to the security policy" (#121).

## Draw calls and the quality tiers

- Each tier has a draw-call budget a frame: desktop 70, phone 45, TV 60 (`CALL_BUDGET` in `.github/screenshots/assets.mjs`; `scripts/__tests__/screenshot-assets.test.ts`). The shoot fails when a shot's frame goes over, or the peak of its walk across the island (`?pose=sweep`) does.
- What repeats draws as one instanced or merged mesh: the crowd, the bears' legs, the rig's beams and the still landmarks (`crowd.js`, `bears.js`, `rig.js`, `landmarks.js`).
- The tier, desktop, phone or TV, is picked once at load (`pickTier` in `public/world/quality.js`), or by `?tier=`. It sets the render scale, the ground's grid, the sky's octaves, the bears, the field of view, shadows and the crowd (`BUDGETS`).
- When the median of a 60-frame window is over 34 ms, the world steps down one rung, and never back up: the render scale down to half, then shadows, the sky's octaves, half the crowd, the bears, the stage light, the rig (`stepDown`; `quality.test.ts`). Windows drawn while the world loads don't count.

## Figures are silhouettes, and the beams never light them

- People are faceless, flat figures, never anyone's likeness (#121). The band is six flat-black, unlit silhouettes (`stage.js`); the crowd's figures are dark and faceless (`crowd.js`).
- The rig's beams are added light. They draw in three's opaque list, before the crowd (render order 1, then 2), and write no depth, so a figure in front of a beam stays dark from every camera (`draw-order.test.ts`, `rig.test.ts`, `main.test.ts`).

## Motion and flashes

- Under `prefers-reduced-motion` the world holds still. It draws a frame only for an input or a change of state, or while a control is held, always at full quality (`main.js`; `main.test.ts`). The shoot takes two reduced-motion stills of the home page and two of `?pose=crowd`, and fails when a pair differs (`compare.mjs`).
- The light show's bar is at most 6 swings of 10 % in relative luminance in any second at any 2×2-pixel block, which is 3 flashes. #128 and #140 measured the light show against it, by render, and their PR text holds the counts. No test or CI job counts flashes, so a change that speeds a light's rise or fall, or adds a fast swing in brightness, is measured the same way before it merges.

## Test hooks

The test hooks, `?at=`, `?t=`, `?stats=1`, `?day=`, `?sleep=`, `?lookup=`, `?pose=` and `?drive=`, answer only on Vercel previews. The server reads the switch, never a `NEXT_PUBLIC_` variable (`src/lib/test-hooks.ts`; `test-hooks.test.ts`). `?tier=` works anywhere.

## The daily pick

- The site's day turns at midnight `America/New_York` (`src/lib/site-day.ts`; `site-day.test.ts`).
- A date keeps its show. `pick-schedule.test.ts` pins the opening picks and the rotation by sha256. A refresh adds new shows just before the rotation's first repeat (`addToRotation`), which moves no date before it: it changes the whole rotation's pin and `firstRepeatIndex`, never the others.
- Every show in the rotation has a recording. A show without one goes in `skipped`, with its reason (`pick-schedule.test.ts`).

## The maps job

- The Maps workflow (`.github/workflows/maps.yml`) runs daily at 06:20 UTC. Its `analyse` job can only read the repo. Its `publish` job checks the maps with `scripts/check-maps.mjs` and commits them to the `maps` branch, or to the branch a manual run names, never to `main`. Only the map is kept, never the audio (`scripts/analyse-show.mjs`).
- Vercel builds no deployment of `maps` (`vercel.json`).
- Maps reach `main` through a PR from a branch off `main` that merges `maps` with a merge commit and changes only `public/maps/*.json` (#117, #120).

## Kept on purpose

- `src/components/DancingBears.tsx` and `src/components/StealYourFace.tsx` stay, though nothing imports them: they are kept to be redrawn (Chris, 2026-10-20).
