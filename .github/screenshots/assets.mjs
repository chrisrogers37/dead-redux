import { writeFile } from "fs/promises";
import { join } from "path";

/**
 * What the run does with a generated image's answer: it saves a 200 and skips a 404, since an image can be missing before the change
 * that adds it lands. Anything else, a 401, a 403 or a 5xx, is a page the site should serve and does not, so it fails the run.
 */
export function assetAction(status) {
  if (status === 200) return "save";
  if (status === 404) return "skip";
  return "fail";
}

/** Each world tier's draw-call budget: a frame over its tier's budget fails the run. */
export const CALL_BUDGET = { desktop: 70, phone: 45, tv: 60 };

/**
 * Why a frame's render stats (window.__hill) fail the run, or null when they pass: more draw calls than its tier's budget. A page
 * without stats, a frame at its budget and a tier with no budget all pass.
 */
export function callsFailure(stats) {
  const { tier, calls } = stats ?? {};
  const budget = CALL_BUDGET[tier];
  return budget !== undefined && typeof calls === "number" && calls > budget ? `${calls} draw calls, over the ${tier} budget of ${budget}` : null;
}

/** The world camera's near plane, in metres (main.js): a face with a vertex nearer than this is cut. */
export const NEAR_PLANE = 0.5;

/**
 * Why a frame's render stats (window.__hill) fail the run, or null when they pass: a first-person frame whose nearest bear vertex in view
 * is inside the camera's near plane. A page without stats, a frame in third person and a frame with no bear in view all pass.
 */
export function nearFailure(stats) {
  const near = stats?.bears?.near;
  return typeof near === "number" && near < NEAR_PLANE ? `a bear ${near} m from the camera, inside its ${NEAR_PLANE} m near plane` : null;
}

/**
 * Why a play step's later shot fails the run, or null when it passes: a show playing on a ready world whose sound goes neither through
 * the world ("webaudio") nor in plain stereo for a reason the player names (its corsFallback stat).
 */
export function routingFailure({ state, world, routing, corsFallback }) {
  return state === "playing" && world === "ready" && routing !== "webaudio" && !(routing === "plain" && corsFallback)
    ? `playing, with routing ${routing} and no corsFallback`
    : null;
}

/**
 * Runs fn in the page, as page.evaluate does, and once more if a navigation destroyed the page's context mid-read: a step can leave the
 * page reloading itself (the day turning, say) just as the run reads it. The second read waits for the new page's load and calls
 * onReread first. Any other error, or a second destroyed context, still fails the run.
 */
export async function evaluateAcrossNavigation(page, fn, onReread = () => {}) {
  try {
    return await page.evaluate(fn);
  } catch (error) {
    if (!String(error?.message).includes("Execution context was destroyed")) throw error;
    onReread();
    await page.waitForLoadState("load");
    return await page.evaluate(fn);
  }
}

/** The file a generated image is saved as: "/icon-192.png" as asset-icon-192.png, "/2026-03-01/opengraph-image" as asset-2026-03-01-opengraph-image.png. */
export const assetFile = (path) => `asset-${path.slice(1).replace(/\.png$/, "").replace(/\//g, "-")}.png`;

/**
 * Fetches each generated image from the site: a 200 is saved byte for byte in outDir, a 404 is logged and skipped. Returns each path
 * that answered anything else, with its status, after trying them all, so one failure does not hide another.
 */
export async function saveAssets(site, paths, outDir, log = console.log) {
  const failed = [];
  for (const path of paths) {
    const response = await fetch(new URL(path, site));
    const action = assetAction(response.status);
    if (action === "save") {
      const file = assetFile(path);
      await writeFile(join(outDir, file), Buffer.from(await response.arrayBuffer()));
      log(`${file}  ${path}`);
      continue;
    }
    await response.body?.cancel();
    log(`${path} answered ${response.status}${action === "fail" ? ", which fails the run" : ""}`);
    if (action === "fail") failed.push(`${path} answered ${response.status}`);
  }
  return failed;
}
