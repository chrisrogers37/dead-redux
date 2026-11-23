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

- `src/app/`: the pages, the `/api/playing/<date>` route, the sitemap, `robots.txt` and the feed (`sitemap.ts`, `robots.ts`, `feed.xml/route.ts`), the icons and the share cards.
- `src/components/world/WorldHome.tsx`: the page around the world, its HUD, and the script tag that loads the world.
- `src/components/player/`: the audio player.
- `src/lib/`: the daily pick, the Relisten look-up, the site's address (`site.ts`), the sitemap's and the feed's entries (`feeds.ts`), the policy and the import map.
- `public/world/*.js`: the world, as plain ES modules outside the bundle. They import only each other and three.js. `trees.js` is the groves.
- `public/maps/<show date>.json`: one map per show.
- `data/shows.json`: the catalog. `data/pick-schedule.json`: every date's show.
- `scripts/`: the catalog refresh and the Maps workflow's scripts.
- `scripts/flash/`: the flash counter (`README.md` there).
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
- What repeats draws as one instanced or merged mesh: the crowd, the bears' legs, the rig's beams, the still landmarks, and the trees, all of a kind as one (`crowd.js`, `bears.js`, `rig.js`, `landmarks.js`, `trees.js`). A phone's trees add under 5,000 triangles to a frame (`trees.test.ts`).
- The tier, desktop, phone or TV, is picked once at load (`pickTier` in `public/world/quality.js`), or by `?tier=`. It sets the render scale, the ground's grid, the sky's octaves, the bears, the field of view, shadows and the crowd (`BUDGETS`).
- When the median of a 60-frame window is over 34 ms, the world steps down one rung, and never back up: the render scale down to half, then shadows, the sky's octaves, half the crowd, the bears, the stage light, the rig (`stepDown`; `quality.test.ts`). Windows drawn while the world loads don't count.

## Figures are silhouettes, and the beams never light them

- People are faceless, flat figures, never anyone's likeness (#121). The band is six flat-black, unlit silhouettes (`stage.js`); the crowd's figures are dark and faceless (`crowd.js`).
- The rig's beams are added light. They draw in three's opaque list, before the crowd (render order 1, then 2), and write no depth, so a figure in front of a beam stays dark from every camera (`draw-order.test.ts`, `rig.test.ts`, `main.test.ts`).

## The trees

- A trunk is solid. A walk keeps `TREE_REACH`, 3.42 m, from the middle of every tree's foot, whichever way the walker faces, and slides round it, trying only the trunks near it (`trees.js`, `modes.js`; `modes.test.ts`, `trees.test.ts`). The reach is a bear's furthest point, its nose's tip (`SNOUT` in `bears.js`), outside the widest trunk: stood at it and facing the trunk, no corner of the visitor's bear is in the bark (`trees.test.ts`). Two reaches and half a metre fit between any two trees (`MIN_APART`, `PASS`), so a walk passes between any two.
- A tree never changes the length of the walk's camera's boom, and so never cuts the view: the camera's own place slides level round a trunk and comes down under a crown, a metre for each metre it nears one (`slide` and `ceiling` in `trees.js`, `boom` in `avatar.js`; `trees.test.ts`). It keeps what its near plane needs from bark and leaves (`eyeRoom`), and a trunk may stand between it and the bear for a moment. There are 6.5 m of air under every crown over the ground a walker stands on (`CROWN_BASE`), so the ceiling is over what the camera needs over the ground. The stage's column and the landmarks still draw the boom in (`boom.js`).
- A tree's sizes are said once, in `trees.js`: how far a crown and a trunk reach, how near a walk comes, how far apart trees stand and how far off anything grows all derive from them (`CROWN_R_MAX`, `TRUNK_R_MAX`, `TREE_REACH`, `MIN_APART`, `TRUNK_ROOM`; `trees.test.ts`).
- Where a tree may not stand is a list of rules, each with its own test (`RULES` in `trees.js`; `trees.test.ts`): the path, the bears' line, 6 m round each landmark's outline, the crowd's ground, the stage, and the ways of the tier's own cameras (`cameraWays`), the view of each landmark from `?pose=near-K` among them. A new camera or fixed view adds its way there; a tree that stands in a view moves by a rule, never the camera.
- A camera's numbers are said once, in the module that flies it, and `trees.js` imports them: `BEAR_GAP` (`modes.js`), `CRANE` and `DESCENT_FROM` (`pose.js`), `boomLength` (`avatar.js`). `main.test.ts` holds `main.js` to the same ones.
- The trees are the same on every visit. A tier's are placed clear of its own cameras, with its boom's length and each number of bears its ladder shows, so a phone's are not a desktop's; a TV's are the first 75 of a desktop's (`placeTrees`; `trees.test.ts`, `main.test.ts`).
- A tree takes the stage's glow no more strongly than level ground at its foot does, and a quarter of that, its bark and leaves being paler than the turf (`takesPool`'s `stands` in `island.js`, `GLOW_SHARE` in `trees.js`; `trees.test.ts`).
- The shoot takes a still from inside the pine wood and one from inside a broad-crowned grove, on a desktop and a phone, from the poses in `GROVE_POSES` (`.github/screenshots/assets.mjs`); `trees.test.ts` holds each pose to standing outside every trunk's reach with trees of its grove in view, so a change that moves the trees moves the pose with them.

## Motion and flashes

- Under `prefers-reduced-motion` the world holds still. It draws a frame only for an input or a change of state, or while a control is held, always at full quality (`main.js`; `main.test.ts`). The shoot takes two reduced-motion stills of the home page and two of `?pose=crowd`, and fails when a pair differs (`compare.mjs`).
- The trees do not move: their shapes hold a place, a normal and a colour to a corner, and nothing hands them a time (`trees.js`; `trees.test.ts`, `main.test.ts`). A crown that swayed an eighth of a metre was counted with `scripts/flash/`, the whole frame from inside a pine wood and a broad-crowned grove at daybreak: where its edge crossed the bright sky a block swung 6 times in a second, on a desktop and on the phone tier, where the trees held still counted 3, and halving the sway did not lower it. A change that makes the trees move is counted from inside a grove at daybreak before it merges.
- The light show's bar is at most 6 swings of 10 % in relative luminance in any second at any 2×2-pixel block, which is 3 flashes. #128 and #140 measured the light show against it, by render, and their PR text holds the counts. No CI job counts flashes. `scripts/flash/` counts them by render, on a machine with a GPU, and a change that speeds a light's rise or fall, or adds a fast swing in brightness, is counted with it before it merges, the PR text holding the counts.

## Test hooks

The test hooks, `?at=`, `?t=`, `?stats=1`, `?day=`, `?sleep=`, `?lookup=`, `?pose=`, `?as=`, `?drive=`, `?still=` and `?rung=`, answer only on Vercel previews. The server reads the switch, never a `NEXT_PUBLIC_` variable (`src/lib/test-hooks.ts`; `test-hooks.test.ts`). `?tier=` works anywhere.

`?pose=near-K` stands the visitor on the path beside song K's landmark, facing it (`nearStand` in `public/world/path.js`), and `?as=K:Title` builds song K's landmark as a song of that title would have it. With them the shoot takes a still of every landmark of the fixed day, and then of every other kind of landmark, on a desktop and a phone (`.github/screenshots/near.mjs`). `scripts/__tests__/near-landmarks.test.ts` holds those titles to the builders' table, so a new kind of landmark gets a still there.

`?still=1`, `?rung=N` and a `?pose=` of four numbers, `X,Z,HEADING,PITCH`, are the flash counter's (`public/world/main.js`; `main.test.ts`). `?still=1` stills the figures and nothing else: the bears are hidden, the band is not moved and the crowd is posed standing still, while the rig and the lights, the sky, the sea, the tufts in the wind, the fireflies and the landmarks' moving parts move as ever. `?rung=N` starts the world N rungs down its quality ladder and holds it there. The four numbers stand the visitor anywhere a walker may stand.

## The daily pick

- The site's day turns at midnight `America/New_York` (`src/lib/site-day.ts`; `site-day.test.ts`).
- A date keeps its show. `pick-schedule.test.ts` pins the opening picks and the rotation by sha256. A refresh adds new shows just before the rotation's first repeat (`addToRotation`), which moves no date before it: it changes the whole rotation's pin and `firstRepeatIndex`, never the others.
- Every show in the rotation has a recording. A show without one goes in `skipped`, with its reason (`pick-schedule.test.ts`).

## The site's address

- `SITE_URL` (`src/lib/site.ts`) is the base of every absolute link the site gives: `metadataBase`, the share link, the sitemap, `robots.txt` and the feed's links.
- A feed item's ID never changes with the site's address. It is a tag URI written out in `itemId` (`src/lib/feeds.ts`), never built from `SITE_URL` (`feeds.test.ts`).

## The maps job

- The Maps workflow (`.github/workflows/maps.yml`) runs daily at 06:20 UTC. Its `analyse` job can only read the repo. Its `publish` job checks the maps with `scripts/check-maps.mjs` and commits them to the `maps` branch, or to the branch a manual run names, never to `main`. Only the map is kept, never the audio (`scripts/analyse-show.mjs`).
- Vercel builds no deployment of `maps` (`vercel.json`).
- Maps reach `main` through a PR from a branch off `main` that merges `maps` with a merge commit and changes only `public/maps/*.json` (#117, #120).

## Kept on purpose

- `src/components/DancingBears.tsx` and `src/components/StealYourFace.tsx` stay, though nothing imports them: they are kept to be redrawn (Chris, 2026-10-20).
