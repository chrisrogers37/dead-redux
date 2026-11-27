# The flash counter

CLAUDE.md's bar for the light show is WCAG 2.3.1's general and red flash thresholds: no more than 3 general flashes and no more than 3 red flashes in any second in any 10° field, a field's flashes counted where the pixels that change together cover a quarter of it or more, or where a quarter of it or more is pixels that each change more than 6 times in the same second. These scripts count that by render. A count is owed for a change to a light: the beams, the panel, the stage light, the sky, or anything else that glows. A change to shapes or to motion owes none. The PR's text holds the counts. No CI job runs them: a count needs a browser on a GPU and minutes for each job.

Until 2026-11-27 the bar was at most 6 swings of 10 % in relative luminance in any second at any 2×2-pixel block. Chris replaced it then. The counts of #128, #140, #169, #184 and the other PRs before this one are by that bar. `--blocks` still counts it, from the same frames as the WCAG count, so an old record can be set beside a new one (below).

## The bar, and where it comes from

[Success Criterion 2.3.1](https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold), Three Flashes or Below Threshold (Level A): "Web pages do not contain anything that flashes more than three times in any one second period, or the flash is below the general flash and red flash thresholds." The glossary's [general flash and red flash thresholds](https://www.w3.org/TR/WCAG22/#dfn-general-flash-and-red-flash-thresholds) say what is below them:

- Content passes if "there are no more than three general flashes and / or no more than three red flashes within any one-second period", or if "the combined area of flashes occurring concurrently occupies no more than a total of .006 steradians within any 10 degree visual field on the screen (25% of any 10 degree visual field on the screen) at typical viewing distance".
- "A general flash is defined as a pair of opposing changes in relative luminance of 10% or more of the maximum relative luminance (1.0) where the relative luminance of the darker image is below 0.80", and "a pair of opposing changes" is "an increase followed by a decrease, or a decrease followed by an increase".
- "A red flash is defined as any pair of opposing transitions involving a saturated red."
- Note 1: "using a 341 x 256 pixel rectangle anywhere on the displayed screen area when the content is viewed at 1024 x 768 pixels will provide a good estimate of a 10 degree visual field for standard screen sizes and viewing distances".
- Note 2: "A transition is the change in relative luminance (or relative luminance/color for red flashing) between adjacent peaks and valleys in a plot of relative luminance (or relative luminance/color for red flashing) measurement against time. A flash consists of two opposing transitions."

[Relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance) is 0.2126 R + 0.7152 G + 0.0722 B, each channel read from its sRGB byte to linear light. W3C's [Understanding Success Criterion 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) explains the criterion and names no method of counting.

### Where the count departs from WCAG, and why

- **The 10° field is a third of the viewport by a third, however big the viewport is.** WCAG's 341 × 256 px of a 1024 × 768 screen is 341/1024 of its width and 256/768 of its height. The counter takes the same share of every frame: 400 × 250 device px of the desktop job's 1200 × 750, and 260 × 563 of the phone tier's 780 × 1688. The world fills whatever viewport it is given, so a light covers the same share of a small window as of a large one. The Understanding page reads the field as 341 × 256 CSS px on any screen instead. The counter's two viewports, 800 × 500 and 390 × 844 CSS px, are smaller than 1024 × 768, so for them the share is the smaller field and the stricter count. The share is the simple, honest reading, but not the whole truth. A phone held closer subtends more, and there a 10° field is more than a third of the screen's width, so the share errs the cautious way. A big monitor close to the eye subtends more than WCAG's reference screen, and there a 10° field is less than a third of its width, so the share errs the other way.
- **The red flash is WCAG 2.0's working definition.** WCAG 2.0's [Note 3](https://www.w3.org/TR/WCAG20/#general-thresholddef) said a pair of opposing transitions involves a saturated red "where, for either or both states involved in each transition, R/(R+ G + B) >= 0.8, and the change in the value of (R-G-B)x320 is > 20 (negative values of (R-G-B)x320 are set to zero) for both transitions", R, G and B being linear, from 0 to 1. WCAG 2.2's Note 3 gives a newer working definition: one state's R/(R + G + B) is 0.8 or more, "and the difference between states is more than 0.2 (unitless) in the CIE 1976 UCS chromaticity diagram". The counter keeps the older form. Black has no chromaticity, so the newer form gives no value for the red-to-black flicker that the red rule is most about. It also names no floor of brightness, so a near-black pixel, whose rounding makes any colour, would read as a saturated red changing. The older form is defined at every pixel, and it counts red to black at a change in luminance far under the general flash's tenth.
- **A quarter of the field exactly is counted.** WCAG passes "no more than" 25 %. The counter counts a transition when the pixels changing that way cover 25 % or more, a pixel more cautious than WCAG.
- **When pixels flash together is the counter's own reading, two ways, and the worse counts.** WCAG says "concurrently" and gives no method.
  - *At once:* a pixel's transition takes the frames from when it left its last peak or valley to the frame it had moved the threshold, the last 30 of them at the most, and two pixels change together when those frames overlap. So a light that fades up across a field, its bright middle passing a tenth a frame or two before its dim edge, flashes as one area.
  - *Pixel by pixel:* where a quarter of a field or more is pixels that each make n transitions or more in the same second, the field makes n in that second. That is what catches a beam sweeping over a field, or stripes moving across it: each pixel flickers, but out of step with the next, so at no one frame does a quarter of the field change together. Of a pattern that rises in one part of a field as it falls in another, all through, at once counts the field's change once, and pixel by pixel counts each pixel's.
- **The bar is read the cautious way.** A second is 61 frames, first to last at most 60 apart, so both ends of "any one-second period" are in it, and a flicker of exactly 3 a second, a change every 10 frames, makes 7 transitions in it and fails. The bar is 6 transitions, not 3 flashes: 7 transitions hold only 3 whole pairs, so a count of whole flashes would pass 7 and fail 8. For the at-once measure the result also gives the strict reading, 60 frames, under which 3 a second exactly passes.
- **The fine-pattern exception is not taken.** WCAG lets pass "flashing that is a fine, balanced, pattern such as white noise or an alternating checkerboard pattern with "squares" smaller than 0.1 degree". The counter counts such a pattern as any other pixels. That errs the cautious way.

## What a count is

- **A frame** is a screenshot of the page in device pixels, one for every frame the world draws. The page's animation clock is virtual, exactly 1/60 s a frame, so a count of a world that keeps time by it is the same however fast the machine draws. A job stops if that clock moves by anything else between two frames, or the world draws more or fewer than one.
- **The virtual clock** is `performance.now` and `requestAnimationFrame`, and under the counter `Date.now` follows it. It is not timers (`setTimeout`, `setInterval`), `new Date()`, the sound's own clock (an `AudioContext`'s `currentTime`), idle callbacks, Web Animations or CSS animations: those keep the machine's time, and the page's own scripts need some of them. A world that moved by one of them would be counted wrongly with every check passing. So a test keeps each module of `public/world` off the ones a script can name (`scripts/__tests__/flash-lib.test.ts`), `Date.now` among them, since on the site itself it is the wall's clock. No test can see a CSS animation or every spelling of a clock: a light that keeps time by anything but the frame's own time needs the stepper extended first. The HUD's own timers move only what the plates' mask hides.
- **A pixel** is a device pixel of the frame. Its relative luminance is read from its sRGB bytes. Its red measure is (R − G − B) × 320 on linear values, or 0 where that is negative, and it is a saturated red where R/(R + G + B) is 0.8 or more (`wcag.mjs`).
- **A pixel's transition** is a change from its last peak or valley, each opposite to the one before. A general transition is a change of 0.1 or more in relative luminance whose darker state is under 0.8. A red transition is a change of more than 20 in the red measure with either state a saturated red. A pixel that brightens in steps makes one transition, not one a step. A transition takes the frames from when the pixel left its peak or valley, standing more than a tenth of the threshold from it, to the frame it had moved the threshold, the last 30 at the most.
- **A field** is a window of the frame a third of its width by a third of its height, at every place it can stand: at 1200 × 750, 801 × 501 fields. A summed-area table of each frame's changes gives each field's count of pixels in four reads.
- **A field's transition, at once,** is a run of frames in which the pixels changing the same way together cover a quarter of it or more. It counts when it is opposite to the field's last, and it is stamped at the run's last frame: the frame at which pixels of it pass the threshold, and after which less than a quarter is still changing together. A run the same way as the last is the same change going on, and a field half of which rises as the other half falls makes one transition. Two transitions are a flash.
- **A field's count, pixel by pixel,** is, for each frame, each pixel's transitions in the second up to it; the field makes n in that second where a quarter of it or more is pixels that made n or more. A transition is stamped at the frame the pixel passed the threshold.
- **A second** is 61 frames: a field's count is the most transitions whose first and last are at most 60 frames apart, anywhere in the window. For the at-once measure the result also holds the strict reading, 59 frames apart. A job's count is the worse of the two measures. The bar is at most 6 transitions in a second, 3 flashes, general and red alike, in every field. A field keeps its last 16 transitions, so the at-once count names up to 16 in a second.
- **The HUD is not counted.** The panels are put away by their cookie, and a job stops if the page shows one out. Every pixel a plate's box (`.plate`) touches is masked from the first frame the plate is drawn in, and a masked pixel never flashes, though a field's share is still of its whole area. The plates are 90 % opaque (`rgba(11, 11, 13, 0.9)` in `src/app/globals.css`): the world under one, from black to white, changes what shows by 0.014 in relative luminance at the most, and by 3 in the red measure, so nothing under a plate can flash. `flash-wcag.test.ts` holds the plates' colour to a fifth of either threshold. Nothing round a plate is masked: the 2×2 count's pad of 2 px, below, takes in a block that a plate's edge straddles, and a pixel the edge touches at all is in the box already.
- **A window** is a stretch of one day's show, named in `windows.json`: `A` Fire On The Mountain through its peak, `B` Drums, `C` Jack Straw at dusk, `Q` Space, `D` U.S. Blues from first light to daybreak, and `S` the seeks, 28 s in which the show is cued from dusk to Drums, to the encore and back, so the night passes at its fastest. The fixed day is `/2026-10-20`, whose show is 1986-07-04; the track numbers are that show's. Three windows are for a count from beside a landmark's own light, the visitor stood by it with `pose=near-K`, K the window's track: `L`, Turn On Your Lovelight through its peak, and `M`, I Need A Miracle in the deep of the night, on the fixed day (`pose=near-17`, `pose=near-11`); and `E`, Eyes Of The World through a peak, on `/2026-11-25`, whose show is 1985-10-25 (`DAY=2026-11-25`, `pose=near-11`). Three more stand by a landmark's moving or lit part: `W`, The Wheel turning, on the fixed day (`pose=near-10`); `P`, Morning Dew's shiny drop at a peak, on `/2026-11-24`, whose show is 1969-04-17 (`DAY=2026-11-24`, `pose=near-2`); and `N`, the fingerpost's lantern through One More Saturday Night's peak, on `/2026-11-27`, whose show is 1973-03-30 (`DAY=2026-11-27`, `pose=near-25`). Two are where the band's stills of two other line-ups are taken (`.github/screenshots/band.mjs`), for a count of the band as the show's line-up: `T`, Turn On Your Love Light, on `/2026-11-24`, the seven of 1968–70 with the organ and a second keyboard; and `J`, Jack Straw, on `/2026-11-27`, the six of 1972–74 with the piano and the singer.
- **A lead-in** is the second before a window: 60 frames that are captured as the window's are and counted for nothing but each pixel's and each field's state. A transition is counted when it completes in the window.
- **A pass** is the whole frame, or what these scripts call the light alone (`still=1`, the world's `?still=1`): the figures are stilled, and nothing else. The bears are hidden, the band is not moved and the crowd is posed standing still. Everything else moves as ever: the rig and the lights, the sky and its drops, the sea, the tufts in the wind, the fireflies and the landmarks' moving parts; the hidden bears walk on and keep the visitor out of their reach, and the visitor's own bear stands where it is posed.

### The old count: 2×2 blocks (`--blocks`)

- **A block** is 2×2 device pixels. Its relative luminance is the mean of its four pixels', each read from sRGB (`analyse.mjs`).
- **A swing** is a change of 10 % (0.1 of full white) from the block's last turning point, and each swing is opposite to the one before. A rise and the fall after it are two swings, one flash. There is no darker-state rule, no red measure and no area: one block that swings 7 times in a second is over the old bar.
- **A second** is read as for the WCAG count, 60 frames first to last, with the strict reading of 59 beside it.
- **Four grids.** The blocks on the even grid start at the frame's corner. A flash that straddles their lines is spread over two or four of them, each of which sees a half or a quarter of it. So each job also counts the grid moved 1 px right, the grid moved 1 px down and the grid moved both, from the same screenshots: a 2×2 flash lies whole in a block of exactly one of the four. `grids=` counts fewer.
- **The HUD** is masked by block: every block within 2 px of a plate that is drawn at any frame, through the whole run.
- **The lead-in** sets each block's state. A swing is counted when it completes in the window, measured from a turn in the lead-in or the window; one that completed before the window is not. A slow swing whose last turn is older than the lead-in is measured from its least and its greatest since the lead-in's first frame instead, and can be missed, or counted where a count over the whole show would not: of 2,000 random blocks with a long history, #173's review found 25 counting fewer and 55 more.
- **What it read.** Main's own light show counted exactly 6 at one block at the stage, in the seeks with the grid moved 1 px right and 1 px down (#169). The whole frame read well over 6 on main, since the edge of a dancing figure or a walking bear against the light swings a block. With the figures stilled, a firefly near the eye crosses a dark block as a point of near white: its range is 0.9 or more, it swings twice a few frames apart, up and down, and the next blocks in `top` are its neighbours along a line, each a few frames later, as it drifts. None of these is near a quarter of a field.

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

Put `--blocks` before it to count the 2×2 blocks too, from the same frames: `npm run flash -- --blocks one "main S dpr=1.5 still=1"`.

A job line is `<variant> <window> [key=value ...]`, and `#` starts a comment.

- The variant is `branch` or `main`. `branch` counts the server's own world, or the world in `WORLD_DIR`. `main` counts the world modules of `MAIN_REF`, read from git at the commit it names when the run starts, and served to the page in the server's place. Only `public/world/*.js` is swapped: the page around the world is the server's in both.
- The keys, with what each is when left out: `pose=crowd` (a named test pose, `home` for the page's own opening, or four numbers `x,z,heading,pitch`), `view=800x500` (CSS px), `dpr=1`, `tier=` (the page's own pick, or `phone` or `tv`), `still=0`, `rung=0` (0 to 99: the world starts that many rungs down its quality ladder and holds there) and, with `--blocks` only, `grids=0,0+1,1+1,0+0,1` (all four; each is how many px a grid stands right and down of the frame's corner). A line that names `grids=` without `--blocks` is refused.
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
| `HEAT` | unset | `1`, with `--blocks`, writes a heat map of each grid's counts and of its ranges |
| `STILLS` | unset | `1` keeps a still of every 30th frame |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright's own | Where Playwright finds its browser |

On an M4 Mac's GPU a 10 s window takes about 2.5 minutes on the desktop as a browser's only job, the seeks about 7, and the quick set about 13 at the default two jobs at a time. Almost all of a job's time is the screenshots. The WCAG count keeps each pixel's turning, a ring of the last 30 frames' changes, each pixel's transitions in the last second and each field's last 16 transitions, so its memory grows with a frame's size and not with a window's length: about 0.3 GB for the phone tier's frame, whose 780 × 1688 px hold 521 × 1126 fields. It takes 20 to 40 ms a frame. The 2×2 count keeps a second of frames and each block's swings on each grid, 0.6 GB for the seeks on the desktop.

### What stops a job

A job that did not measure what it was asked to stops, says why, and writes no result:

- the virtual clock moved by other than 1/60 s between two frames, or the world drew other than one frame;
- a screenshot differs from the canvas by more than 2/255 at a checked point, so it does not show the frame just drawn;
- the page reported an error: any but the archive's audio, an aborted request, the favicon, and, on a Vercel preview, the security policy's refusal of Vercel's toolbar, which the policy refuses on purpose and the shoot counts apart;
- the HUD's shelves are not put away, or the page plays another show than the windows';
- the world does not know what it was asked: a pose it does not take, or `still=1` or a rung on a world from before those hooks;
- the visitor does not stand where a pose of four numbers put them, because the walk's limits moved them (the island's edge, the stage, a bear's reach); or, from any pose but `home`, moved during the count. A world from before `window.__hill.walker` does not say where the visitor stands: a job on it with a named pose runs unchecked, prints a warning, says so in its result (`poseHeld`), and the table lists it.

**The check against the canvas is a check, and not on every job.** It reads some 600 points of the canvas in the same frame and compares the screenshot at them. It runs only where the world draws at the screen's own size: the desktop at rung 0 with a pixel ratio of 1.5 or less. The phone's tier, the TV's, and any rung of 1 or more draw smaller and are scaled up, so none of their frames is checked: 44 of the standard set's 84 jobs. Such a job prints a warning, its result says so (`canvasCheck.unchecked`), and the table lists it. Its count is of screenshots that nothing vouches for: one that showed the frame before would not be caught.

### What a run writes

Each run makes a new folder of its own under `OUT_DIR`, named by when it started and what it ran, and prints its path first and last. No run writes into another's, so a table of a folder is of one run. The tag in each file's name holds every field of the job; a job counted with `--blocks` names its grids, and one counted without ends at its rung.

- `<tag>.json`, always. It holds the job and its page; the world: a hash of every `/world/*.js` the page was served, where they came from (main's commit, `WORLD_DIR` and its checkout's commit, or the server), whether that folder has changed since its commit, and its tier and renderer; how many frames were checked against the canvas, and whether the pose was held to its place; the plates that were masked; and `wcag`, the WCAG count. For the general measure and the red it gives the most transitions in a second, the worse of the two measures, and the flashes. `atOnce` gives that measure's most by both readings, how many fields had any transition and how many are over the bar, the field that first made the most (`worst`) with its place, the frame its busiest second starts at and its transitions in that second, and the largest share of any field that changed one way at once (`largest`), with where and when. `perPixel` gives the most transitions in a second that a quarter of a field made (`worst`: where, and the frame that second ends at), the largest share of a field whose pixels each made more than 6 in one second (`overTheBar`), and the most any one pixel made (`mostAtAPixel`). It also gives the field's size in device and CSS px, the pixels masked, and `pass`. With `--blocks` it holds `results` too, the 2×2 count for each grid: the most swings in a second by both readings, how many blocks reach each count from 1 to 8, the histogram, and the twelve busiest blocks, each with its place, its swings, its range and its luminance through the 62 frames that end at its busiest second's last swing.
- With `HEAT=1` and `--blocks`, two PNGs a grid, so eight a job, a block a pixel: about 0.8 MB for the seeks on the desktop.
- With `STILLS=1`, a PNG of every 30th frame in `stills/<tag>/`: about half a megabyte each, 28 MB for the seeks on the desktop.

Nothing clears `OUT_DIR`: `rm -r` it when the PR's text has its numbers.

## The two sets

- **`quick`**, for a first look: Space and the seeks from behind the crowd (`pose=crowd`), a desktop of 800×500 at a pixel ratio of 1.5, the whole frame, rung 0, on main and on the branch. 4 jobs.
- **`standard`**, before a merge: windows `A`, `B`, `Q`, `D` and `S`; `pose=crowd` and `pose=stage`; that desktop, and the phone tier at 390×844 and 2; the whole frame and the light alone; rung 0; main and the branch. 80 jobs. Then the seeks' light alone from behind the crowd a rung down, on both devices and both variants. 4 jobs, 84 in all.

A PR whose change shows best from somewhere else adds its own job lines: a pose beside the thing, a window in which it plays.

## What a PR reports

A PR that changes a light reports, for each window, the WCAG count on main and on the branch from the same machine and the same renderer, with the device, the rung, the pose and the pass: the most general flashes and the most red in any second in any field, the largest share of a field that changed one way at once, and the largest share of a field whose pixels each changed more than 6 times in one second. A run prints that table as it ends, and `node scripts/flash/table.mjs <a run's folder> [<another's> ...]` prints it again, or of several runs together. Where the jobs counted the 2×2 blocks too, the table sets the worst grid's count beside the WCAG count, then prints the 2×2 table, a row a grid, as every count before 2026-11-27 was printed. The table reads a result of the old counter, which has no WCAG count, into the 2×2 table alone.

The table names the world of each side by its hash. The hash is of the world's modules alone: the page round the world, which is the server's, is no part of it, and a server's own world has no commit to go by. A job's grids are part of what a job is: a result that counted two grids, one that counted four, and one that counted none stand in separate rows. The table refuses rows whose branch worlds differ, or whose main worlds do, since they are counts of different code; `--mixed` prints them all the same, every result of a job in its cell with its world's hash, and says what it mixed. It warns when its rows come from more than one renderer, whose counts are not comparable, and of each job whose frames were not checked against the canvas or whose pose could not be.

The bar is held on the light alone: at most 3 general flashes and 3 red flashes in any second in any field. That pass is what a change to a light owes; the whole frame adds the figures' motion, which owes no count, and is counted only where it shows something. A run prints which of its jobs are over the bar, and how many of all its jobs pass, a job that failed passing nothing.
