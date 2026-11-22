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
- The keys, with what each is when left out: `pose=crowd` (a named test pose, `home` for the page's own opening, or four numbers `x,z,heading,pitch`), `view=800x500` (CSS px), `dpr=1`, `tier=` (the page's own pick, or `phone` or `tv`), `still=0`, `rung=0` (the world starts that many rungs down its quality ladder and holds there) and `grids=0,0+1,1`.
- A job stops, and says why, when the world it counts does not know what it was asked: a pose the world does not take, or `still=1` or a rung on a world from before those hooks. Until main has them, that is every `main` job with either.
- An experiment that needs a changed world counts a scratch checkout: change its `public/world`, and name it as `WORLD_DIR`.

The settings come from the environment:

| | default | |
|---|---|---|
| `SITE_URL` | `http://127.0.0.1:3000` | The site |
| `GPU` | unset | `metal` renders on a Mac's GPU. Otherwise the browser picks its own renderer: for the shoot's headless Chromium that is SwiftShader, in software, and slow. Each result names its renderer |
| `MAIN_REF` | `origin/main` | The commit whose world the variant `main` counts |
| `WORLD_DIR` | unset | A checkout's `public/world`, counted as `branch` whatever tree the server runs |
| `OUT_DIR` | `dead-redux-flash` in the system's temp folder | Where the output goes. A folder inside the repo is refused |
| `DAY` | `2026-10-20` | The day, which must have windows in `windows.json` |
| `PARALLEL` | `3` | Jobs at once |
| `HEAT` | unset | `1` writes a heat map of each grid's counts and of its ranges |
| `STILLS` | unset | `1` keeps a still of every 30th frame |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright's own | Where Playwright finds its browser |

On an M4 Mac's GPU the seeks take 6 to 7 minutes and a 12 s window 2.5 to 3.5 as a browser's only job, and the quick set about 13 minutes at two jobs at a time. The script counts as the frames arrive and keeps a second of them, so a long window takes no more memory than a short one: about half a gigabyte for a job on the desktop.

### What a job writes

The script's first line says where: `OUT_DIR`. The tag in each file's name holds every field of the job, so two jobs never share a file.

- `<tag>.json`, always, about 25 KB. It holds the job and its page, the world's tier, renderer and commit, the plates that were masked, the page's errors, and for each grid the counts: the most swings in a second by both readings, how many blocks reach each count from 1 to 8, the histogram, and the twelve busiest blocks (`top`, the first of them also as `worst`). A block has its place on its grid, the frame its busiest second starts at, its swings, and its luminance through the 62 frames that end at that second's last swing (`trace`, from `traceFromFrame`).
- With `HEAT=1`, four PNGs a job, a block a pixel: about 0.4 MB for the seeks on the desktop.
- With `STILLS=1`, a PNG of every 30th frame in `stills/<tag>/`: about half a megabyte each, 28 MB for the seeks on the desktop.

Nothing clears `OUT_DIR`: `rm -r` it when the PR's text has its numbers.

## The two sets

- **`quick`**, for a first look: Space and the seeks from behind the crowd (`pose=crowd`), a desktop of 800×500 at a pixel ratio of 1.5, the whole frame, rung 0, on main and on the branch. 4 jobs.
- **`standard`**, before a merge: windows `A`, `B`, `Q`, `D` and `S`; `pose=crowd` and `pose=stage`; that desktop, and the phone tier at 390×844 and 2; the whole frame and the light alone; rung 0; main and the branch. 80 jobs. Then the seeks' light alone from behind the crowd a rung down, on both devices and both variants. 4 jobs, 84 in all.

A PR whose change shows best from somewhere else adds its own job lines: a pose beside the thing, a window in which it plays.

## What a PR reports

For each window, the worst block's count on main and on the branch, from the same machine and the same renderer, with the device, the rung, the pose and the pass: `table.mjs` prints that table from a folder of results, and warns when its rows come from more than one renderer. Counts from different renderers are not comparable.

The bar is held on the light alone: never over 6, and no worse than main at the same block in the same frames.

- **Main is no clean sheet.** Main's own light show has counted exactly 6 at one block at the stage, in the seeks with the grid moved (#169). A branch is held to main's count at the same block in the same frames, and to adding nothing to it.
- **The whole frame counts motion too.** The edge of a dancing figure or a walking bear against the light swings a block, which is no flash of the light show, and the whole frame reads well over 6 on main. It is held to main's and not to 6: no worse at the worst block, and the PR says where any new blocks at 5 or more lie.
