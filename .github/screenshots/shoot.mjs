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
};

const PAGES = [
  // Two shots of one load catch the animated display moving.
  {
    path: "/",
    shots: ["home-1", "home-2"],
    // Each step acts on the loaded page, then shoots it.
    steps: [
      { click: "[data-action='details']", shot: "details" },
      { focus: "[data-action='play']", shot: "focus-play" },
      {
        click: "[data-action='play']",
        waitFor: "[data-state='playing'], [data-state='stalled'], [data-state='error']",
        shot: "playing",
      },
      { click: "[data-action='lean-back']", waitFor: "[data-mode='leanback']", shot: "leanback" },
    ],
  },
  // The end shot shows the last screen, where the archive's count line sits.
  { path: "/archive", shots: ["archive"], end: "archive-end" },
  // A fixed past day, so its shots compare across runs.
  { path: "/2026-03-01", shots: ["2026-03-01"] },
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

// Full-page shots stop at this many screens; the archive lists every day.
const MAX_SCREENS = 4;

// Short recordings show the motion that stills cannot. Lean-back records on the TV.
const RECORDINGS = [
  { device: "desktop", name: "home" },
  { device: "phone", name: "home" },
  {
    device: "tv",
    name: "leanback",
    click: "[data-action='lean-back']",
    waitFor: "[data-mode='leanback']",
  },
];

// How long each recording runs once the page has loaded and any control is pressed.
const RECORD_MS = 10_000;

const site = new URL(process.env.SITE_URL);
if (site.protocol !== "https:") {
  throw new Error(`SITE_URL must be an https URL, got ${process.env.SITE_URL}`);
}

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

    for (const { path, shots, steps, end } of PAGES) {
      // The TV device is for lean-back, so it shoots only the home page.
      if (device === "tv" && path !== "/") {
        continue;
      }
      const url = new URL(path, site);
      const response = await page.goto(url.href);
      // A redirect to another host, such as a login wall, is not the site.
      if (!response?.ok() || new URL(page.url()).host !== url.host) {
        throw new Error(`${url} answered ${response?.status()} at ${page.url()}`);
      }
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => console.log(`${url} never went network-idle; shooting anyway`));

      for (const [i, shot] of shots.entries()) {
        if (i > 0) {
          await page.waitForTimeout(SHOT_GAP_MS);
        }
        const file = `${device}-${shot}.png`;
        await page.screenshot({ path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}`);
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
        } else {
          await page.click(selector);
        }
        if (step.waitFor) {
          await page
            .waitForSelector(step.waitFor, { timeout: 15_000 })
            .catch(() => console.log(`${step.shot}: waitFor timed out; shooting anyway`));
        }
        await page.waitForTimeout(STEP_SETTLE_MS);
        const file = `${device}-${step.shot}.png`;
        await page.screenshot({ path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}  ${selector}`);
      }

      if (end) {
        // The last screen, as a visitor who scrolled to the bottom sees it.
        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
        );
        const file = `${device}-${end}.png`;
        await page.screenshot({ path: join(outDir, file) });
        console.log(`${file}  ${url}`);
      }
    }

    await context.close();
  }

  for (const { device, name, click, waitFor } of RECORDINGS) {
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
    const url = new URL("/", site);
    const file = `${device}-${name}.webm`;
    await page.goto(url.href);
    if (click) {
      // A control missing from the page is logged and skipped, not an error.
      if ((await page.locator(click).count()) === 0) {
        console.log(`${file}: ${click} absent`);
        await context.close();
        continue;
      }
      await page.click(click);
      await page
        .waitForSelector(waitFor, { timeout: 15_000 })
        .catch(() => console.log(`${file}: waitFor timed out; recording anyway`));
    }
    await page.waitForTimeout(RECORD_MS);
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
