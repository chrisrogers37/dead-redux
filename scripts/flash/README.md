# The flash counter

CLAUDE.md's bar for the light show is at most 6 swings of 10 % in relative luminance in any second at any 2×2-pixel block, which is 3 flashes. These scripts count that by render. A change that speeds a light's rise or fall, or adds a fast swing in brightness, is counted with them before it merges, and its PR text holds the counts. No CI job runs them: a count needs a browser on a GPU and minutes for each job.

## What a count is

- **A frame** is a screenshot of the page in device pixels, one for every frame the world draws. The page runs on a virtual clock of exactly 1/60 s a frame, so a count is the same however fast the machine draws. Where the canvas is drawn at the screen's own size, each screenshot is checked against the canvas's pixels, to show it is the frame just drawn.
- **A block** is 2×2 device pixels. Its relative luminance is the mean of its four pixels', each read from sRGB (`analyse.mjs`).
- **A swing** is a change of 10 % (0.1 of full white) from the block's last turning point, and each swing is opposite to the one before. A rise and the fall after it are two swings, one flash.
- **A second** is 60 frames: a block's count is the most swings whose first and last are at most 60 frames apart, anywhere in the window. The result also holds the strict reading, 59 frames apart.
- **Two grids.** The blocks on the even grid start at the frame's corner. A flash that straddles their lines is spread over four of them, so each job also counts the grid moved 1 px right and 1 px down, from the same screenshots. `grids=` counts the other two, `1,0` and `0,1`.
- **The HUD is not counted.** The panels are put away by their cookie, and every block within 2 px of a plate (`.plate`) that is drawn at any frame is masked.
- **A window** is a stretch of one day's show, named in `windows.json`: `A` Fire On The Mountain through its peak, `B` Drums, `C` Jack Straw at dusk, `Q` Space, `D` U.S. Blues from first light to daybreak, and `S` the seeks, 28 s in which the show is cued from dusk to Drums, to the encore and back, so the night passes at its fastest. The fixed day is `/2026-10-20`, whose show is 1986-07-04; the track numbers are that show's.
- **A pass** is the whole frame, or the light alone (`still=1`, the world's `?still=1`): the bears hidden, the band not moved and the crowd standing still, so that what swings is the light and not a figure crossing it.

## How to run it

It needs:

1. The shoot's packages and its browser, once: `cd .github/screenshots && npm ci && npx playwright install --only-shell chromium`. The root `package.json` has no Playwright.
2. A site with the test hooks on. Locally that is `VERCEL_ENV=preview npm run dev` in another terminal; or give a Vercel preview's address as `SITE_URL`. On a site without them the script stops and says so.
3. `git fetch origin main`, so that `origin/main` is main as it is now. The page asks Relisten for the day's tracks, so the run needs the network.

The quick set, from the repo's root on a Mac:

```sh
# Once: the shoot's packages and its browser.
(cd .github/screenshots && npm ci && npx playwright install --only-shell chromium)
# In another terminal: the site, with the test hooks on.
VERCEL_ENV=preview npm run dev
# The count, then its table.
git fetch origin main
OUT_DIR=/tmp/flash-quick GPU=metal npm run flash -- matrix quick
node scripts/flash/table.mjs /tmp/flash-quick
```

`npm run flash` is `node scripts/flash/capture.mjs`, which takes one of:

| | |
|---|---|
| `matrix quick` | The quick set, below |
| `matrix standard` | The standard set, below |
| `jobs <file>` | A file of job lines |
| `one "<job line>"` | One job |

A job line is `<variant> <window> [key=value ...]`, and `#` starts a comment.

- The variant is `branch` or `main`. `branch` counts the server's own world, or the world in `WORLD_DIR`. `main` counts the world modules of `MAIN_REF`, read from git and served to the page in the server's place. Only `public/world/*.js` is swapped: the page around the world is the server's in both.
- The keys, with what each is when left out: `pose=crowd` (a named test pose, `home` for the page's own opening, or four numbers `x,z,heading,pitch`), `view=800x500` (CSS px), `dpr=1`, `tier=` (the page's own pick, or `phone` or `tv`), `still=0`, `rung=0` (the world starts that many rungs down its quality ladder and holds there), `grids=0,0+1,1` and `patch=` (below).

The settings come from the environment:

| | default | |
|---|---|---|
| `SITE_URL` | `http://127.0.0.1:3000` | The site |
| `GPU` | unset | `metal` renders on a Mac's GPU. Unset, the browser picks its own renderer: for the shoot's headless Chromium that is SwiftShader, in software, and slow |
| `MAIN_REF` | `origin/main` | The commit whose world the variant `main` counts |
| `WORLD_DIR` | unset | A checkout's `public/world`, counted as `branch` whatever tree the server runs |
| `OUT_DIR` | `dead-redux-flash` in the system's temp folder | Where the results go. A folder inside the repo is refused |
| `DAY` | `2026-10-20` | The day, which must have windows in `windows.json` |
| `PARALLEL` | `3` | Jobs at once. The seeks on a phone hold about 2 GB a job |
| `STILLS` | unset | `1` keeps a still of every 30th frame, about half a megabyte each: 28 MB for the seeks on the desktop |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright's own | Where Playwright finds its browser |

Each job writes `<tag>.json` and a heat map of each grid's counts and ranges under `OUT_DIR`, and with `STILLS=1` its stills in `stills/<tag>/`. The tag names every field of the job, so two jobs never share a file. On an M4 Mac's GPU the seeks take about 6 minutes and a 12 s window about 2.5 as a browser's only job, about 9 and 4 with two jobs at a time, and the quick set 13 minutes at two at a time.

## The two sets

- **`quick`**, for a first look: Space and the seeks from behind the crowd (`pose=crowd`), a desktop of 800×500 at a pixel ratio of 1.5, the whole frame, rung 0, on main and on the branch. 4 jobs.
- **`standard`**, before a merge: windows `A`, `B`, `Q`, `D` and `S`; `pose=crowd` and `pose=stage`; that desktop, and the phone tier at 390×844 and 2; the whole frame and the light alone; rung 0; main and the branch. 80 jobs. Then the seeks' light alone from behind the crowd a rung down, on both devices and both variants. 4 jobs, 84 in all.

A PR whose change shows best from somewhere else adds its own job lines: a pose beside the thing, a window in which it plays.

## What a PR reports

For each window, the worst block's count on main and on the branch, from the same machine and the same renderer, with the device, the rung, the pose and the pass: `table.mjs` prints that table from a folder of results, and warns when its rows come from more than one renderer. Counts from different renderers are not comparable.

The bar is held on the light alone: never over 6, and no worse than main at the same block in the same frames. A result's `worst` and `top` give each block's place, the frame its busiest second starts at, its swings and its luminance frame by frame (`trace`).

The whole frame counts motion too: the edge of a dancing figure or a walking bear against the light swings a block, which is no flash of the light show. It reads over 6 on main: as this was written, 17 on the even grid through the seeks from behind the crowd and 7 in Space, on the desktop at 1.5. So the whole frame is held to main's: no worse at the worst block, and the PR says where any new blocks at 5 or more lie.

## The known baseline

On main's world, with the light alone, the seeks from behind the crowd count:

- on the desktop at 1.5 and rung 0, 4 on the even grid, 5 with the grid 1 px down, and 6 at one block at the stage with the grid moved 1 px right and 1 px down: block (608, 324) of that grid, frames 166 to 216, a second after the seek to Drums;
- on the phone tier, 5 on the even grid.

#169 counted these, and its text holds the table. This counter found the 4 and the 6 again on main at `c27c328`, at the same blocks in the same frames, and the phone's 5 at the same place on that world with the test hooks added. The 6 is at the bar, not over it, and it is main's: a change is held to adding nothing to it.

#169 also counted 5 on the even grid for the desktop a rung down, on main as it was then (`f20c256`). Main at `c27c328` counts 4 there, by `rung=1` and by the patch #169 stepped the world down with alike.

## Patches

`patch=<name>` changes a world module's text before the page loads it, for a one-off experiment a test hook does not cover. `PATCHES` in `lib.mjs` holds them, each a text that must be in its module exactly once and what takes its place, so a patch that the world has moved away from fails instead of counting something else.

- `glow` holds the fireflies at full glow whatever the night and the music.
- `still-before-hooks` is the light alone for a world from before `?still=1`. `still=1` on such a world stops the job, since it would count the whole frame and call it the light. It goes once main's world has the hook.

A count with a patch is not comparable with one without, and neither set has one.
