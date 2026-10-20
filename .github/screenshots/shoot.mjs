import { mkdir } from "fs/promises";
import { join } from "path";
import { chromium } from "playwright";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

const PAGES = [
  // Two shots of one load catch the animated display moving.
  { path: "/", shots: ["home-1", "home-2"] },
  { path: "/archive", shots: ["archive"] },
  // A fixed past day, so its shots compare across runs.
  { path: "/2026-03-01", shots: ["2026-03-01"] },
];

// Pause between shots of one page load.
const SHOT_GAP_MS = 5000;

// Full-page shots stop at this many screens; the archive lists every day.
const MAX_SCREENS = 4;

const site = new URL(process.env.SITE_URL);
if (site.protocol !== "https:") {
  throw new Error(`SITE_URL must be an https URL, got ${process.env.SITE_URL}`);
}

const outDir = process.env.OUT_DIR;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
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

    for (const { path, shots } of PAGES) {
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
    }

    await context.close();
  }
} finally {
  await browser.close();
}
