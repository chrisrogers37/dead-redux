# The flash counter

CLAUDE.md's bar for the light show is at most 6 swings of 10 % in relative luminance in any second at any 2×2-pixel block, which is 3 flashes. These scripts count that by render. A change that speeds a light's rise or fall, or adds a fast swing in brightness, is counted with them before it merges, and its PR text holds the counts. No CI job runs them: a count needs a browser on a GPU and minutes for each job.

## What a count is

- **A frame** is a screenshot of the page in device pixels, one for every frame the world draws. The page runs on a virtual clock of exactly 1/60 s a frame, so a count is the same however fast the machine draws. A job stops if the clock moves by anything else between two frames, or the world draws more or fewer than one.
- **A block** is 2×2 device pixels. Its relative luminance is the mean of its four pixels', each read from sRGB (`analyse.mjs`).
- **A swing** is a change of 10 % (0.1 of full white) from the block's last turning point, and each swing is opposite to the one before. A rise and the fall after it are two swings, one flash.
- **A second** is 60 frames: a block's count is the most swings whose first and last are at most 60 frames apart, anywhere in the window. The result also holds the strict reading, 59 frames apart.
- **Two grids.** The blocks on the even grid start at the frame's corner. A flash that straddles their lines is spread over four of them, so each job also counts the grid moved 1 px right and 1 px down, from the same screenshots. `grids=` counts the other two, `1,0` and `0,1`.
- **The HUD is not counted.** The panels are put away by their cookie, and a job stops if the page shows one out. Every block within 2 px of a plate (`.plate`) that is drawn at any frame is masked.
- **A window** is a stretch of one day's show, named in `windows.json`: `A` Fire On The Mountain through its peak, `B` Drums, `C` Jack Straw at dusk, `Q` Space, `D` U.S. Blues from first light to daybreak, and `S` the seeks, 28 s in which the show is cued from dusk to Drums, to the encore and back, so the night passes at its fastest. The fixed day is `/2026-10-20`, whose show is 1986-07-04; the track numbers are that show's.
- **A lead-in** is the second before a window: 60 frames that are captured as the window's are and counted for nothing but each block's state. So a swing that began before the window and ends in it is counted, and one that ended before it is not. The window's first frame is frame 0, and the lead-in's are numbered back from it.
- **A pass** is the whole frame, or what these scripts call the light alone (`still=1`, the world's `?still=1`): the figures are stilled, and nothing else. The bears are hidden, the band is not moved and the crowd is posed standing still. Everything else moves as ever: the rig and the lights, the sky and its drops, the sea, the tufts in the wind, the fireflies and the landmarks' moving parts; the hidden bears walk on and keep the visitor out of their reach, and the visitor's own bear stands where it is posed.

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
# The count. It ends with its table, and with the folder its results are in.
git fetch origin main
OUT_DIR=/tmp/flash GPU=metal npm run flash -- matrix quick
```

`npm run flash` is `node scripts/flash/capture.mjs`, which takes one of:

| | |
|---|---|
| `matrix quick` | The quick set, below |
| `matrix standard` | The standard set, below |
| `jobs <file>` | A file of job lines |
| `one "<job line>"` | One job |

A job line is `<variant> <window> [key=value ...]`, and `#` starts a comment.

- The variant is `branch` or `main`. `branch` counts the server's own world, or the world in `WORLD_DIR`. `main` counts the world modules of `MAIN_REF`, read from git at the commit it names when the run starts, and served to the page in the server's place. Only `public/world/*.js` is swapped: the page around the world is the server's in both.
- The keys, with what each is when left out: `pose=crowd` (a named test pose, `home` for the page's own opening, or four numbers `x,z,heading,pitch`), `view=800x500` (CSS px), `dpr=1`, `tier=` (the page's own pick, or `phone` or `tv`), `still=0`, `rung=0` (0 to 99: the world starts that many rungs down its quality ladder and holds there) and `grids=0,0+1,1`.
- An experiment that needs a changed world counts a scratch checkout: change its `public/world`, and name it as `WORLD_DIR`. The result says the folder has changed since its commit, and holds a hash of what was served.

The settings come from the environment. Each is checked before a browser starts, and one that is wrong stops the run.

| | default | |
|---|---|---|
| `SITE_URL` | `http://127.0.0.1:3000` | The site, with its `http://` or `https://` |
| `GPU` | unset | `metal` renders on a Mac's GPU. Unset, the browser picks its own renderer: for the shoot's headless Chromium that is SwiftShader, in software, and slow. Nothing else is taken. Each result names its renderer |
| `MAIN_REF` | `origin/main` | The commit whose world the variant `main` counts. It must name one |
| `WORLD_DIR` | unset | A checkout's `public/world`, the folder that holds `main.js`, counted as `branch` whatever tree the server runs |
| `OUT_DIR` | `dead-redux-flash` in the system's temp folder | Where each run makes its folder. A folder inside the repo is refused, by whatever path it is reached |
| `DAY` | `2026-10-20` | The day, which must have windows in `windows.json` |
| `PARALLEL` | `2` | Jobs at once |
| `HEAT` | unset | `1` writes a heat map of each grid's counts and of its ranges |
| `STILLS` | unset | `1` keeps a still of every 30th frame |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright's own | Where Playwright finds its browser |

On an M4 Mac's GPU the seeks take 6 to 7 minutes and a 12 s window about 3 as a browser's only job, and the quick set about 13 minutes at the default two jobs at a time. The script counts as the frames arrive and keeps a second of them and each block's swings, so its memory grows with a window's swings and not with its frames: about half a gigabyte for the seeks on the desktop.

### What stops a job

A job that did not measure what it was asked to stops, says why, and writes no result:

- the virtual clock moved by other than 1/60 s between two frames, or the world drew other than one frame;
- a screenshot differs from the canvas by more than 2/255 at a checked point, so it does not show the frame just drawn;
- the page reported an error;
- the HUD's shelves are not put away, or the page plays another show than the windows';
- the world does not know what it was asked: a pose it does not take, or `still=1` or a rung on a world from before those hooks. Until main has them, that is every `main` job with either;
- the visitor does not stand where a pose of four numbers put them, because the walk's limits moved them (the island's edge, the stage, a bear's reach); or, from any pose but `home`, moved during the count.

**The check against the canvas is a check, and not on every job.** It reads some 600 points of the canvas in the same frame and compares the screenshot at them. It runs only where the world draws at the screen's own size: the desktop at rung 0 with a pixel ratio of 1.5 or less. The phone's tier, the TV's, and any rung of 1 or more draw smaller and are scaled up, so none of their frames is checked: 44 of the standard set's 84 jobs. Such a job prints a warning, its result says so (`canvasCheck.unchecked`), and the table lists it. Its count is of screenshots that nothing vouches for: one that showed the frame before would not be caught.

### What a run writes

Each run makes a new folder of its own under `OUT_DIR`, named by when it started and what it ran, and prints its path first and last. No run writes into another's, so a table of a folder is of one run. The tag in each file's name holds every field of the job.

- `<tag>.json`, always, about 25 KB. It holds the job and its page; the world: a hash of every `/world/*.js` the page was served, where they came from (main's commit, `WORLD_DIR` and its checkout's commit, or the server), whether that folder has changed since its commit, and its tier and renderer; how many frames were checked against the canvas; the plates that were masked; and for each grid the counts: the most swings in a second by both readings, how many blocks reach each count from 1 to 8, the histogram, and the twelve busiest blocks (`top`, the first of them also as `worst`). A block has its place on its grid, the frame its busiest second starts at, its swings, its range in the window, and its luminance through the 62 frames that end at that second's last swing (`trace`, from `traceFromFrame`).
- With `HEAT=1`, four PNGs a job, a block a pixel: about 0.4 MB for the seeks on the desktop.
- With `STILLS=1`, a PNG of every 30th frame in `stills/<tag>/`: about half a megabyte each, 28 MB for the seeks on the desktop.

Nothing clears `OUT_DIR`: `rm -r` it when the PR's text has its numbers.

## The two sets

- **`quick`**, for a first look: Space and the seeks from behind the crowd (`pose=crowd`), a desktop of 800×500 at a pixel ratio of 1.5, the whole frame, rung 0, on main and on the branch. 4 jobs.
- **`standard`**, before a merge: windows `A`, `B`, `Q`, `D` and `S`; `pose=crowd` and `pose=stage`; that desktop, and the phone tier at 390×844 and 2; the whole frame and the light alone; rung 0; main and the branch. 80 jobs. Then the seeks' light alone from behind the crowd a rung down, on both devices and both variants. 4 jobs, 84 in all.

A PR whose change shows best from somewhere else adds its own job lines: a pose beside the thing, a window in which it plays.

## What a PR reports

For each window, the worst block's count on main and on the branch, from the same machine and the same renderer, with the device, the rung, the pose and the pass. A run prints that table as it ends, and `node scripts/flash/table.mjs <a run's folder> [<another's> ...]` prints it again, or of several runs together. The table names the world of each side by its hash. It refuses rows whose branch worlds differ, or whose main worlds do, since they are counts of different code; `--mixed` prints them all the same and says what it mixed. It warns when its rows come from more than one renderer, whose counts are not comparable, and of each job whose frames were not checked against the canvas.

The bar is held on the light alone: never over 6, and no worse than main at the same block in the same frames.

- **Main is no clean sheet.** Main's own light show has counted exactly 6 at one block at the stage, in the seeks with the grid moved (#169). A branch is held to main's count at the same block in the same frames, and to adding nothing to it.
- **The whole frame counts motion too.** The edge of a dancing figure or a walking bear against the light swings a block, which is no flash of the light show, and the whole frame reads well over 6 on main. It is held to main's and not to 6: no worse at the worst block, and the PR says where any new blocks at 5 or more lie.
- **The light alone is not the rig alone.** With the figures stilled, a firefly still flies, and one near the eye crosses a dark block as a point of near white. So a top block can be a firefly: its range is 0.9 or more, it swings twice a few frames apart, up and down, and the next blocks in `top` are its neighbours along a line, each a few frames later, as it drifts. Space's top blocks are these. The rig's blocks stand about the stage, swing with the beat, and by less.
