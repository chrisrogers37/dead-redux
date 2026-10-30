import { appendFile, mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { chromium } from "playwright";
import { callsFailure, evaluateAcrossNavigation, routingFailure, saveAssets } from "./assets.mjs";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  tv: { viewport: { width: 1920, height: 1080 } },
  "desktop-reduced": { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
  // The narrowest common phone, for the top row and long dates.
  "phone-360": {
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  // Without WebGL 2, for the designed still. That is a launch switch, so these two get their own browser, and they shoot only the
  // pages that name them.
  "desktop-nowebgl": { viewport: { width: 1440, height: 900 } },
  "phone-nowebgl": {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const NO_WEBGL = new Set(["desktop-nowebgl", "phone-nowebgl"]);

// archive.org can take tens of seconds to start a stream from CI, so a play step waits this long for the player to settle.
const PLAY_WAIT_MS = 45_000;

// A track's audio, which a page with failAudio aborts: Relisten's mp3 files.
const isTrackAudio = (url) => url.pathname.endsWith(".mp3");

// The play step: press play, wait for the player to settle, then shoot; `later` ({ ms, shot }) adds a later shot. The log names the
// state the player reached and the sentence on its now-plate, so a slow upstream shows there instead of failing the step.
const playStep = (shot, later) => ({
  click: "[data-action='play']",
  waitFor: "[data-state='playing'], [data-state='stalled'], [data-state='error']",
  waitMs: PLAY_WAIT_MS,
  player: true,
  shot,
  later,
});

// Each step acts on the loaded page, then shoots it. The prefix keeps one page's file names
// apart from another's, and afterPlaying ({ ms, shot }) adds a later shot of the play step.
const playerSteps = (prefix, afterPlaying) => [
  { click: "[data-action='details']", shot: `${prefix}details` },
  // Keyboard focus, which is what draws the ring: Chromium shows :focus-visible after a Tab, not after a script focus that follows
  // a mouse click. Tab from the previous button lands on the play disc and starts nothing.
  { focus: "[data-action='prev']", press: "Tab", shot: `${prefix}focus-play` },
  playStep(`${prefix}playing`, afterPlaying),
  {
    click: "[data-action='lean-back']",
    waitFor: "[data-mode='leanback']",
    shot: `${prefix}leanback`,
  },
];

const PAGES = [
  // Two shots of one load catch the animated display moving.
  {
    path: "/",
    shots: ["home-1", "home-2"],
    steps: playerSteps(""),
  },
  // A fixed day whose show never changes, so every run plays the same tracks.
  {
    path: "/2026-10-20",
    shots: ["fixed-1", "fixed-2"],
    steps: playerSteps("fixed-", { ms: 8000, shot: "fixed-playing-8s" }),
  },
  // The fixed day's walk: G (a look down, which starts nothing) leaves the opening for a walk behind the visitor's bear; then the
  // Details switch turns to first person, the walker's eye with no bear, and back, which leaves the view setting as it was.
  {
    path: "/2026-10-20",
    devices: ["desktop"],
    shots: [],
    steps: [
      { focus: "#world", press: "KeyG", shot: "fixed-walk" },
      { click: "[data-action='details']", shot: "fixed-view-details" },
      { click: "[data-action='view']", shot: "fixed-first-person" },
      { click: "[data-action='view']", shot: "fixed-third-person" },
    ],
  },
  // The fixed day without WebGL 2: the designed still under the HUD, its Details, then the show playing from the still.
  {
    path: "/2026-10-20",
    devices: ["desktop-nowebgl", "phone-nowebgl"],
    ready: "#world[data-world='fallback']",
    shots: ["fixed"],
    steps: [{ click: "[data-action='details']", shot: "fixed-details" }, playStep("fixed-playing")],
  },
  // The fixed day's focus walk, under reduced motion so the ten shots differ by the ring alone: Tab lands on the world, Archive,
  // Walk with the bears, Lean back, Share, prev, play, next, Details and the seek slider, with a shot after each press.
  {
    path: "/2026-10-20",
    devices: ["desktop-reduced"],
    shots: [],
    steps: Array.from({ length: 10 }, (_, i) => ({ press: "Tab", shot: `fixed-focus-${i + 1}` })),
  },
  // The fixed day 5 s before its first track ends: playing crosses into track 2, and the later shot logs the gap between them.
  {
    path: "/2026-10-20?at=0&t=93",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-gap-start", { ms: 12000, shot: "fixed-gap" })],
  },
  // The fixed day from Cold Rain And Snow, on the summit: the bears set off along the lit band that joins it to Fire On The Mountain.
  {
    path: "/2026-10-20?at=7",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-segue-start", { ms: 12000, shot: "fixed-segue" })],
  },
  // The fixed day at Drums, then at Space: the left cave lights, then the right, over 8 s, while the now-plate names set 2.
  {
    path: "/2026-10-20?at=13",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-drums-start", { ms: 12000, shot: "fixed-drums" })],
  },
  {
    path: "/2026-10-20?at=14",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-space-start", { ms: 12000, shot: "fixed-space" })],
  },
  // The fixed day from ?pose=stage: the visitor's bear on the slope in front of the stage, and over its head the six players against the
  // panel, the open front toward the camera.
  { path: "/2026-10-20?pose=stage", devices: ["desktop"], shots: ["fixed-stage"] },
  // The fixed day from ?pose=slope: the visitor's bear higher up the slope, looking down over it to the stage at its foot.
  { path: "/2026-10-20?pose=slope", devices: ["desktop"], shots: ["fixed-stage-slope"] },
  // The fixed day from ?pose=path: the visitor's bear on the loop at the summit's north-east shoulder, heading along it, and down the slope
  // to the left of it the stage's front.
  { path: "/2026-10-20?pose=path", devices: ["desktop"], shots: ["fixed-stage-path"] },
  // The fixed day with the site's day faked as 2099-01-01, a day it will not reach: the chip names the new day at load and stays while
  // the show plays on (the 8-s shot's clock has moved; the url line still reads the fixed page); in lean-back it sits above the title; its
  // link loads today's page, which arrives leaned back and starts the show, or shows it paused where the browser refuses.
  {
    path: "/2026-10-20?day=2099-01-01",
    devices: ["desktop", "phone", "desktop-reduced"],
    shots: ["fixed-newday"],
    steps: [
      playStep("fixed-newday-playing", { ms: 8000, shot: "fixed-newday-8s" }),
      { click: "[data-action='lean-back']", waitFor: "[data-mode='leanback']", shot: "fixed-newday-leanback" },
      {
        click: "[data-action='play-next']",
        waitFor: "main:not(:has([data-next]))[data-state='playing'], main:not(:has([data-next]))[data-state='paused']",
        waitMs: PLAY_WAIT_MS,
        player: true,
        shot: "fixed-newday-tapped",
      },
    ],
  },
  // The fixed day 6 s before its last track ends (U.S. Blues, 287 s): the show ends, and the offer names a past pick.
  {
    path: "/2026-10-20?at=18&t=281",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [playStep("fixed-end-start", { ms: 12000, shot: "fixed-end" })],
  },
  // The same with the day faked: at the end (about 6.5 s in) the new day loads on its own; 20 s on, the later shot is today's page,
  // its state in the log, and never lands mid-navigation.
  {
    path: "/2026-10-20?day=2099-01-01&at=18&t=281",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-turn-start", { ms: 20000, shot: "fixed-turned" })],
  },
  // The sleep timer counting seconds, in lean-back: one press sets 30 s; 32 s on, the show is paused and, with no input since the
  // click, the cursor is hidden; a key brings it back.
  {
    path: "/2026-10-20?sleep=seconds",
    devices: ["desktop"],
    shots: [],
    steps: [
      playStep("fixed-sleep-playing"),
      { click: "[data-action='lean-back']", waitFor: "[data-mode='leanback']", shot: "fixed-sleep-leanback" },
      { click: "[data-action='sleep']", shot: "fixed-sleep-30", later: { ms: 32000, shot: "fixed-slept" } },
      { focus: "[data-action='sleep']", press: "ShiftLeft", shot: "fixed-cursor-back" },
    ],
  },
  // The end shot shows the last screen, where the archive's count line sits. The TV shoots the archive too, at 1920 by 1080.
  { path: "/archive", devices: ["desktop", "desktop-reduced", "phone", "phone-360", "tv"], shots: ["archive"], end: "archive-end" },
  // September 2026 opened from the archive's month list: a closed month, so its rows compare across runs. The log's url line reads
  // the month's own page, and the end shot shows its list, which names October and not September, over the count line.
  {
    path: "/archive",
    devices: ["desktop", "desktop-reduced", "phone", "phone-360", "tv"],
    shots: [],
    steps: [{ click: "a[href='/archive/2026-09']", waitFor: "main[data-month='2026-09']", shot: "archive-2026-09" }],
    end: "archive-2026-09-end",
  },
  // A fixed past day, so its shots compare across runs.
  { path: "/2026-03-01", shots: ["2026-03-01"] },
  // The same day, which no step plays, so no saved point stands in: L seeks 10 s before the first move, and play starts from there.
  // Both state lines read about 0:10.
  {
    path: "/2026-03-01",
    devices: ["desktop"],
    shots: [],
    steps: [{ focus: "#world", press: "KeyL", player: true, shot: "2026-03-01-seek-before-join" }, playStep("2026-03-01-seek-playing")],
  },
  // A fixed past day whose show has a partial date and one track.
  { path: "/2026-05-10", shots: ["2026-05-10"] },
  // A fixed past day with a long featured month over a long show month.
  { path: "/2026-09-29", shots: ["2026-09-29"] },
  // The fixed day with Relisten's answer forced, on previews: the look-up failed (the plate says so, with Try again and the Relisten
  // link), then in lean-back; and a show it has no recording of (the plate as before). Either way the world loads without the
  // show's path.
  {
    path: "/2026-10-20?lookup=failed",
    devices: ["desktop", "phone", "phone-360"],
    shots: ["fixed-lookup-failed"],
    steps: [{ click: "[data-action='lean-back']", waitFor: "[data-mode='leanback']", shot: "fixed-lookup-failed-leanback" }],
  },
  { path: "/2026-10-20?lookup=missing", devices: ["desktop", "phone"], shots: ["fixed-no-recording"] },
  // The fixed day with every track's audio failing, on any deployment: the player spends its reloads, and the transport says it could
  // not play, with Try again and the archive.org link. Try again starts the reloads over, so the now-plate says Reconnecting… again
  // rather than staying on the error.
  {
    path: "/2026-10-20",
    devices: ["desktop", "phone"],
    shots: [],
    failAudio: true,
    steps: [
      {
        click: "[data-action='play']",
        waitFor: "[data-state='error']",
        waitMs: 30_000,
        required: true,
        player: true,
        shot: "fixed-track-failed",
      },
      { click: "[data-action='retry']", waitFor: "[data-state='stalled']", required: true, player: true, shot: "fixed-track-retry" },
    ],
  },
];

// Generated images are saved byte for byte as the site serves them.
const ASSETS = [
  "/icon",
  "/apple-icon",
  "/icon-192.png",
  "/icon-512.png",
  "/opengraph-image",
  "/2026-03-01/opengraph-image",
  "/archive/opengraph-image",
];

// Pause between shots of one page load.
const SHOT_GAP_MS = 5000;

// Pause after a step's action, before its shot.
const STEP_SETTLE_MS = 1000;

// How long a page gets to finish loading; a slower page is logged and shot anyway.
const LOAD_MS = 30_000;

// Full-page shots stop at this many screens; the archive lists a month.
const MAX_SCREENS = 4;

// Short recordings show the motion that stills cannot. Lean-back records on the TV.
// An entry records the page at its path, "/" unless it names one.
const RECORDINGS = [
  { device: "desktop", name: "home" },
  { device: "phone", name: "home" },
  {
    device: "tv",
    name: "leanback",
    click: "[data-action='lean-back']",
    waitFor: "[data-mode='leanback']",
  },
  // Roaming: focus the scene, then hold each key for its milliseconds, in order.
  {
    device: "desktop",
    name: "roam",
    click: "canvas",
    keys: [
      ["ArrowUp", 3000],
      ["ArrowLeft", 1200],
      ["ArrowUp", 3000],
      ["ArrowRight", 800],
      // Then look up at the sky and down past the horizon.
      ["KeyT", 700],
      ["KeyG", 1400],
    ],
  },
  // The phone roams with its on-screen pads, each held for its milliseconds, in order.
  {
    device: "phone",
    name: "roam",
    pads: [
      ["[data-pad='up']", 3000],
      ["[data-pad='left']", 1200],
    ],
  },
  // Walking with the bears on the fixed day, once the world is ready: the button puts the camera behind the bears.
  {
    device: "desktop",
    name: "follow",
    path: "/2026-10-20",
    click: "#world[data-world='ready'] ~ div [data-action='follow']",
    waitFor: "[data-action='follow'][aria-pressed='true']",
  },
  // The same from C C Rider 0:42 in, where the bears set off along a straight stretch in one line, clear of the landmarks.
  {
    device: "desktop",
    name: "follow-straight",
    path: "/2026-10-20?at=3&t=42",
    click: "#world[data-world='ready'] ~ div [data-action='follow']",
    waitFor: "[data-action='follow'][aria-pressed='true']",
  },
  // Walking with the bears on a phone: its three bears ahead and the visitor's bear above the now-plate.
  {
    device: "phone",
    name: "follow",
    path: "/2026-10-20",
    click: "#world[data-world='ready'] ~ div [data-action='follow']",
    waitFor: "[data-action='follow'][aria-pressed='true']",
  },
  // From ?pose=stage the click starts the show, then the visitor's bear walks down the slope to the platform and stops at its edge. The
  // walk is 23 m, and a frame moves the bear at most 0.6 m (12 m/s, each frame's step capped at 50 ms), so it takes 39 frames. CI's
  // software renderer draws this view about once every 0.5 s, so the walk takes about 20 s there: it is held for 25 s, a few seconds of
  // them at the edge, and the recording runs 26.
  {
    device: "desktop",
    name: "stage",
    path: "/2026-10-20?pose=stage",
    click: "canvas",
    keys: [["ArrowUp", 25_000]],
    recordMs: 26_000,
  },
  // The sound's listener through the camera's modes, from ?pose=stage: the click starts the show, B walks with the bears, a step walks
  // again, F leans back, Escape leaves it and a step walks on. The stats line after each control shows the mode, where the listener
  // stands and where the visitor's bear's head does; in third person they are the same point in every mode.
  {
    device: "desktop",
    name: "stage-modes",
    path: "/2026-10-20?pose=stage",
    click: "canvas",
    keys: [
      ["KeyB", 3000],
      ["ArrowUp", 2000],
      ["KeyF", 3000],
      ["Escape", 500],
      ["ArrowUp", 2000],
    ],
  },
];

// How long each recording runs once the page has loaded and any control is pressed, unless it names its own `recordMs`.
const RECORD_MS = 10_000;

// What fails the run once every shot is taken: a generated image the site answers with an error, a frame over its tier's draw-call
// budget, a show playing with its sound neither through the world nor in plain stereo for a reason the player names, and a required
// step whose control is missing or whose state never comes.
const failures = [];

// What the log says when a read had to wait for the page to load again: the shot was taken, then the page navigated as it was read.
const reread = (file) => () => console.log(`reread ${file}: the page navigated while it was read`);

// Logs the page's render stats (window.__hill) for a shot, or for a recording after each control it holds; null on a page without them.
// A frame over its tier's draw-call budget is a failure.
const logStats = async (page, file) => {
  const stats = await evaluateAcrossNavigation(page, () => JSON.stringify(window.__hill ?? null), reread(file));
  console.log(`stats ${file} ${stats}`);
  const failure = callsFailure(JSON.parse(stats));
  if (failure) failures.push(`${file}: ${failure}`);
};

// Logs every control's box after a page's first shot, so a touch target is read rather than measured: links, buttons, summaries,
// inputs and the world's focusable container, `small` on one under 44 px either way, `hidden` on one not rendered.
const logBoxes = async (page, file) => {
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a, button, summary, input, [tabindex='0']"), (el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      const name = el.dataset.action ?? el.dataset.pad ?? (el.id || el.getAttribute("aria-label") || el.textContent.trim());
      return { name, x, y, width, height, visible: el.checkVisibility() };
    })
  );
  for (const { name, x, y, width, height, visible } of boxes) {
    const size = `${Math.round(width)}x${Math.round(height)} at ${Math.round(x)},${Math.round(y)}`;
    console.log(`box ${file} ${name}: ${visible ? `${size}${width < 44 || height < 44 ? " small" : ""}` : "hidden"}`);
  }
};

// Opens a page once its document arrives, then waits for the rest: an embedded player can
// hold back the load event past a navigation's time limit.
const open = async (page, url) => {
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("load", { timeout: LOAD_MS })
    .catch(() => console.log(`${url} never finished loading; going on anyway`));
  return response;
};

// Logs where a shot was taken and what the page says: its URL, the player's state with the now-plate's sentence, whether lean-back has
// hidden the cursor, and the next-show chip's kind and text, or null without one.
const logPage = async (page, file) => {
  const [state, line, cursor, next] = await evaluateAcrossNavigation(page, () => {
    const chip = document.querySelector("[data-next]");
    return [
      document.querySelector("main")?.dataset.state ?? null,
      document.querySelector("[data-action='play']")?.closest(".plate")?.querySelector(".t-tag")?.textContent ?? null,
      document.documentElement.classList.contains("cursor-off"),
      chip ? `${chip.dataset.next} · ${chip.textContent}` : null,
    ];
  }, reread(file));
  console.log(`url ${file} ${page.url()}`);
  console.log(`state ${file} ${state} · ${line}`);
  console.log(`cursor ${file} ${cursor}`);
  console.log(`next ${file} ${next}`);
};

const site = new URL(process.env.SITE_URL);
if (site.protocol !== "https:") {
  throw new Error(`SITE_URL must be an https URL, got ${process.env.SITE_URL}`);
}

// A path's URL for a device. The TV device asks for the TV tier: a headless browser cannot be told apart from a desktop.
const pageUrl = (path, device) => {
  const url = new URL(path, site);
  if (device === "tv") url.searchParams.set("tier", "tv");
  return url;
};

// The workflow names the artifact after this host, so each artifact says which site it shows.
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `host=${site.hostname}\n`);
}

const outDir = process.env.OUT_DIR;
await mkdir(outDir, { recursive: true });

// The runner has no GPU, so WebGL runs in software; the no-WebGL devices get a browser with it off.
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const noWebGL = await chromium.launch({ args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] });
try {
  for (const [device, options] of Object.entries(DEVICES)) {
    const context = await (NO_WEBGL.has(device) ? noWebGL : browser).newContext(options);
    const page = await context.newPage();
    // Playwright trims the clip to the page, so it only cuts tall pages short.
    const clip = {
      x: 0,
      y: 0,
      width: options.viewport.width * MAX_SCREENS,
      height: options.viewport.height * MAX_SCREENS,
    };

    for (const { path, shots, steps, end, devices, ready, failAudio } of PAGES) {
      // The TV device is for lean-back, so it shoots the home page and only the other pages that name it.
      if (device === "tv" && path !== "/" && !devices?.includes("tv")) {
        continue;
      }
      // A page may name the devices that shoot it; a device without WebGL shoots only the pages that do.
      if (devices ? !devices.includes(device) : NO_WEBGL.has(device)) {
        continue;
      }
      const url = pageUrl(path, device);
      if (failAudio) await page.route(isTrackAudio, (route) => route.abort());
      const response = await open(page, url);
      // A redirect to another host, such as a login wall, is not the site.
      if (!response?.ok() || new URL(page.url()).host !== url.host) {
        throw new Error(`${url} answered ${response?.status()} at ${page.url()}`);
      }
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => console.log(`${url} never went network-idle; shooting anyway`));
      // A page may name a state to wait for before its first shot.
      if (ready) {
        await page
          .waitForSelector(ready, { timeout: 15_000 })
          .catch(() => console.log(`${url} never reached ${ready}; shooting anyway`));
      }
      // A running clock is not motion, so the reduced-motion shots hide it to stay comparable.
      if (options.reducedMotion) {
        await page.addStyleTag({ content: '[data-mask="time"]{visibility:hidden}' });
      }

      for (const [i, shot] of shots.entries()) {
        if (i > 0) {
          await page.waitForTimeout(SHOT_GAP_MS);
        }
        const file = `${device}-${shot}.png`;
        await page.screenshot({ path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}`);
        await logStats(page, file);
        await logPage(page, file);
        if (i === 0) await logBoxes(page, file);
      }

      for (const step of steps ?? []) {
        const selector = step.click ?? step.focus;
        // A control missing from the page is logged and skipped, and fails the run only for a required step; a step that only presses a
        // key has none to miss.
        if (selector && (await page.locator(selector).count()) === 0) {
          if (step.required) failures.push(`${device}-${step.shot}.png: ${selector} absent`);
          console.log(`${step.shot}: ${selector} absent`);
          continue;
        }
        if (step.focus) await page.focus(selector);
        else if (step.click) await page.click(selector);
        if (step.press) await page.keyboard.press(step.press);
        if (step.waitFor) {
          await page
            .waitForSelector(step.waitFor, { timeout: step.waitMs ?? 15_000 })
            .catch(() => {
              console.log(`${step.shot}: waitFor timed out; shooting anyway`);
              if (step.required) failures.push(`${device}-${step.shot}.png: never reached ${step.waitFor}`);
            });
        }
        if (step.player) {
          // The player's state and the now-plate's sentence ("Starting…", "Reconnecting…", an error, or the position), and how the
          // sound plays.
          const [state, line, routing] = await page.evaluate(() => [
            document.querySelector("main")?.dataset.state ?? null,
            document.querySelector("[data-action='play']")?.closest(".plate")?.querySelector(".t-tag")?.textContent ?? null,
            document.querySelector("main")?.dataset.routing ?? null,
          ]);
          console.log(`state ${device}-${step.shot}.png ${state} · ${line}`);
          console.log(`routing ${device}-${step.shot}.png ${routing}`);
        }
        await page.waitForTimeout(STEP_SETTLE_MS);
        const file = `${device}-${step.shot}.png`;
        await page.screenshot({ path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}  ${selector ?? `press ${step.press}`}`);
        await logStats(page, file);
        await logPage(page, file);
        // The follow-up shot shows the page after it has been playing for a while.
        if (step.later) {
          await page.waitForTimeout(step.later.ms);
          const laterFile = `${device}-${step.later.shot}.png`;
          await page.screenshot({ path: join(outDir, laterFile), fullPage: true, clip });
          console.log(`${laterFile}  ${url}  ${selector}`);
          await logStats(page, laterFile);
          await logPage(page, laterFile);
          // Serialised in the page, so each reading prints as one line of JSON.
          const [analysis, lastGapMs, routing, state, world, corsFallback] = await page.evaluate(() => [
            JSON.stringify(window.__hill?.analysis ?? null),
            JSON.stringify(window.__hill?.lastGapMs ?? null),
            document.querySelector("main")?.dataset.routing ?? null,
            document.querySelector("main")?.dataset.state ?? null,
            document.getElementById("world")?.dataset.world ?? null,
            window.__hill?.corsFallback ?? null,
          ]);
          console.log(`analysis ${laterFile} ${analysis}`);
          console.log(`lastGapMs ${laterFile} ${lastGapMs}`);
          console.log(`routing ${laterFile} ${routing}`);
          // By now a playing show sounds through the world, or in plain stereo for a reason the player names (its corsFallback stat).
          const routed = routingFailure({ state, world, routing, corsFallback });
          if (routed) failures.push(`${laterFile}: ${routed}`);
        }
      }

      if (end) {
        // The last screen, as a visitor who scrolled to the bottom sees it.
        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
        );
        const file = `${device}-${end}.png`;
        await page.screenshot({ path: join(outDir, file) });
        console.log(`${file}  ${url}`);
        await logStats(page, file);
      }
      // The next page on this device plays its audio.
      if (failAudio) await page.unroute(isTrackAudio);
    }

    await context.close();
  }

  recording: for (const { device, name, path = "/", click, waitFor, keys, pads, recordMs = RECORD_MS } of RECORDINGS) {
    const options = DEVICES[device];
    // Frames arrive at the viewport's CSS size, whatever the device scale factor.
    const context = await browser.newContext({
      ...options,
      recordVideo: {
        dir: await mkdtemp(join(tmpdir(), "recording-")),
        size: options.viewport,
      },
    });
    const page = await context.newPage();
    const url = pageUrl(path, device);
    const file = `${device}-${name}.webm`;
    await open(page, url);
    if (click) {
      // A control missing from the page is logged and skipped, not an error.
      // Scripts may draw the control after load, so it gets time to appear.
      const found = await page.waitForSelector(click, { timeout: 15_000 }).then(
        () => true,
        () => false
      );
      if (!found) {
        console.log(`${file}: ${click} absent`);
        await context.close();
        continue;
      }
      await page.click(click);
      if (waitFor) {
        await page
          .waitForSelector(waitFor, { timeout: 15_000 })
          .catch(() => console.log(`${file}: waitFor timed out; recording anyway`));
      }
    }
    let held = 0;
    for (const [key, ms] of keys ?? []) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
      held += ms;
      await logStats(page, `${file} after ${key}`);
    }
    // A pad is held with a mouse press, not a touch; the log says so.
    for (const [pad, ms] of pads ?? []) {
      // Scripts may draw the pad after load, so it gets time to appear.
      const box = await page
        .waitForSelector(pad, { timeout: 15_000 })
        .then((element) => element.boundingBox())
        .catch(() => null);
      if (!box) {
        console.log(`${file}: ${pad} absent`);
        await context.close();
        continue recording;
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
      held += ms;
      console.log(`${file}: ${pad} held ${ms} ms with the mouse, not a touch`);
      await logStats(page, `${file} after ${pad}`);
    }
    await page.waitForTimeout(Math.max(recordMs - held, 0));
    const video = page.video();
    // The video is complete only once its context closes.
    await context.close();
    await video.saveAs(join(outDir, file));
    console.log(`${file}  ${url}`);
  }

  failures.push(...(await saveAssets(site, ASSETS, outDir)));
  for (const failure of failures) console.log(`failure ${failure}`);
  if (failures.length > 0) throw new Error(`${failures.length} failure(s); each has its own "failure" line above`);
} finally {
  await browser.close();
  await noWebGL.close();
}
