import { appendFile, mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { chromium, request } from "playwright";

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
};

// archive.org can take tens of seconds to start a stream from CI, so a play step waits this long for the player to settle.
const PLAY_WAIT_MS = 45_000;

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
  // The fixed day from ?pose=stage, on the lawn in front of the stage: the six players against the panel, the open front toward the camera.
  { path: "/2026-10-20?pose=stage", devices: ["desktop"], shots: ["fixed-stage"] },
  // The end shot shows the last screen, where the archive's count line sits.
  { path: "/archive", shots: ["archive"], end: "archive-end" },
  // A fixed past day, so its shots compare across runs.
  { path: "/2026-03-01", shots: ["2026-03-01"] },
  // A fixed past day whose show has a partial date and one track.
  { path: "/2026-05-10", shots: ["2026-05-10"] },
  // A fixed past day with a long featured month over a long show month.
  { path: "/2026-09-29", shots: ["2026-09-29"] },
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

// Full-page shots stop at this many screens; the archive lists every day.
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
  // From ?pose=stage the click starts the show, then the walk goes down the lawn to the platform and stops at its edge. CI's software
  // renderer draws a few frames a second, each moving the world at most 50 ms, so the walk is held for 15 s and the recording runs 16.
  {
    device: "desktop",
    name: "stage",
    path: "/2026-10-20?pose=stage",
    click: "canvas",
    keys: [["ArrowUp", 15_000]],
    recordMs: 16_000,
  },
];

// How long each recording runs once the page has loaded and any control is pressed, unless it names its own `recordMs`.
const RECORD_MS = 10_000;

// Logs the page's render stats (window.__hill) for a shot; null on a page without them.
const logStats = async (page, file) => {
  const stats = await page.evaluate(() => JSON.stringify(window.__hill ?? null));
  console.log(`stats ${file} ${stats}`);
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

// The runner has no GPU, so WebGL runs in software.
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
try {
  for (const [device, options] of Object.entries(DEVICES)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    // Playwright trims the clip to the page, so it only cuts tall pages short.
    const clip = {
      x: 0,
      y: 0,
      width: options.viewport.width * MAX_SCREENS,
      height: options.viewport.height * MAX_SCREENS,
    };

    for (const { path, shots, steps, end, devices } of PAGES) {
      // The TV device is for lean-back, so it shoots only the home page.
      if (device === "tv" && path !== "/") {
        continue;
      }
      // A page may name the devices that shoot it.
      if (devices && !devices.includes(device)) {
        continue;
      }
      const url = pageUrl(path, device);
      const response = await open(page, url);
      // A redirect to another host, such as a login wall, is not the site.
      if (!response?.ok() || new URL(page.url()).host !== url.host) {
        throw new Error(`${url} answered ${response?.status()} at ${page.url()}`);
      }
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => console.log(`${url} never went network-idle; shooting anyway`));
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
      }

      for (const step of steps ?? []) {
        const selector = step.click ?? step.focus;
        // A control missing from the page is logged and skipped, not an error.
        if ((await page.locator(selector).count()) === 0) {
          console.log(`${step.shot}: ${selector} absent`);
          continue;
        }
        if (step.focus) {
          await page.focus(selector);
          if (step.press) await page.keyboard.press(step.press);
        } else {
          await page.click(selector);
        }
        if (step.waitFor) {
          await page
            .waitForSelector(step.waitFor, { timeout: step.waitMs ?? 15_000 })
            .catch(() => console.log(`${step.shot}: waitFor timed out; shooting anyway`));
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
        console.log(`${file}  ${url}  ${selector}`);
        await logStats(page, file);
        // The follow-up shot shows the page after it has been playing for a while.
        if (step.later) {
          await page.waitForTimeout(step.later.ms);
          const laterFile = `${device}-${step.later.shot}.png`;
          await page.screenshot({ path: join(outDir, laterFile), fullPage: true, clip });
          console.log(`${laterFile}  ${url}  ${selector}`);
          await logStats(page, laterFile);
          // Serialised in the page, so each reading prints as one line of JSON.
          const [analysis, lastGapMs, routing] = await page.evaluate(() => [
            JSON.stringify(window.__hill?.analysis ?? null),
            JSON.stringify(window.__hill?.lastGapMs ?? null),
            document.querySelector("main")?.dataset.routing ?? null,
          ]);
          console.log(`analysis ${laterFile} ${analysis}`);
          console.log(`lastGapMs ${laterFile} ${lastGapMs}`);
          console.log(`routing ${laterFile} ${routing}`);
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
    }
    await page.waitForTimeout(Math.max(recordMs - held, 0));
    const video = page.video();
    // The video is complete only once its context closes.
    await context.close();
    await video.saveAs(join(outDir, file));
    console.log(`${file}  ${url}`);
  }

  const api = await request.newContext();
  for (const path of ASSETS) {
    const response = await api.get(new URL(path, site).href);
    // An image the site does not serve is logged and skipped.
    if (!response.ok()) {
      console.log(`${path} answered ${response.status()}`);
      continue;
    }
    const file = `asset-${path.slice(1).replace(/\.png$/, "").replace(/\//g, "-")}.png`;
    await writeFile(join(outDir, file), await response.body());
    console.log(`${file}  ${path}`);
  }
  await api.dispose();
} finally {
  await browser.close();
}
