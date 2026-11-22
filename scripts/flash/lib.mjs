// Shared pieces of the flash counter: where the repo is, a run's settings, the jobs, the browser, the frame stepper, a ref's world
// modules and the cue. Nothing here runs at import: every export is a constant or a function, so a unit test imports it on a machine
// with no browser and no git.
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

export const FPS = 60;

// The repo this file is in, two folders up.
export const repoRoot = () => resolve(fileURLToPath(new URL("../../", import.meta.url)));

// Playwright and pngjs, from the shoot's own packages (.github/screenshots), as the shoot has them: the root package.json has neither.
export function loadPlaywright() {
  const require = createRequire(new URL("../../.github/screenshots/", import.meta.url));
  return { chromium: require("playwright").chromium, PNG: require("pngjs").PNG };
}

// A run's settings, from the environment (README.md lists them). OUT_DIR is outside the repo, so a result never lands in a commit.
export function readConfig(env) {
  const outDir = resolve(env.OUT_DIR || join(tmpdir(), "dead-redux-flash"));
  const within = relative(repoRoot(), outDir);
  if (within === "" || (!within.startsWith("..") && !isAbsolute(within))) throw new Error(`OUT_DIR ${outDir} is inside the repo: a count's files stay out of it`);
  const gpu = env.GPU || "";
  if (gpu !== "" && gpu !== "metal") throw new Error(`GPU=${gpu}: metal, or unset for the browser's own renderer`);
  const day = env.DAY || "2026-10-20";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`DAY=${day} is no date`);
  const parallel = Number(env.PARALLEL || 3);
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error(`PARALLEL=${env.PARALLEL} is no count of jobs`);
  // A job's stills are half a megabyte each, 28 MB for the seeks on a desktop: none is kept unless STILLS=1 asks.
  if (!["", "0", "1"].includes(env.STILLS ?? "")) throw new Error(`STILLS=${env.STILLS}: 1 keeps a still of every 30th frame, and unset or 0 keeps none`);
  return {
    siteUrl: (env.SITE_URL || "http://127.0.0.1:3000").replace(/\/+$/, ""), day, outDir, gpu,
    worldDir: env.WORLD_DIR ? resolve(env.WORLD_DIR) : null, mainRef: env.MAIN_REF || "origin/main", parallel, stills: env.STILLS === "1",
  };
}

// The windows of a day's show (windows.json): the stretches of it that are counted. The track numbers belong to that day's show.
export function windowsFor(day) {
  const all = JSON.parse(readFileSync(new URL("./windows.json", import.meta.url), "utf8"));
  if (!Object.hasOwn(all, day)) throw new Error(`windows.json has no windows for ${day}: it has ${Object.keys(all).join(", ")}`);
  return all[day];
}

// One-off changes to a world module, each [text in the module exactly once, what takes its place], by the module's file name. A job
// asks for one by name (patch=). A patch is an experiment: a count with one is not comparable with one without, and none is in a matrix.
export const PATCHES = {
  // The fireflies held at full glow whatever the night and the music: the most they can add.
  glow: { "island.js": [["flora.glow(look.dark * look.dark * (0.35 + 0.65 * calm));", "flora.glow(1.0);"]] },
  // The light alone, for a world from before ?still=1: what the hook does, as the counts before it did it (#128, "Two passes"). The
  // bears are hidden, the band is never moved and the crowd is posed standing still. It goes once main's world has the hook.
  "still-before-hooks": { "main.js": [
    ["const bears = buildBears(scene, budget.bears);", "const bears = buildBears(scene, budget.bears); for (const b of bears) b.g.visible = false;"],
    ["stage.move(dt, elapsed, figures.beats, playing);", "/* still: the band is not moved */"],
    ["crowd.pose(figures.beats, dancing * layer2.dance, dancing * layer2.rise, sitting);", "crowd.pose(0, 0, 0, sitting);"],
  ] },
};
export function patched(name, source, patches) {
  let out = source;
  for (const [from, to] of patches) {
    if (out.split(from).length !== 2) throw new Error(`patch: "${from}" is in ${name} ${out.split(from).length - 1} times`);
    out = out.replace(from, to);
  }
  return out;
}

// What a job line may set, and what each is when the line leaves it out.
const DEFAULTS = { pose: "crowd", view: "800x500", dpr: "1", tier: "", still: "0", rung: "0", grids: "0,0+1,1", patch: "" };
const NUMBER = "-?\\d+(?:\\.\\d+)?";
const FOUR = new RegExp(`^(${NUMBER}),(${NUMBER}),(${NUMBER}),(${NUMBER})$`);

// The jobs a text names, one a line: <variant> <window> [key=value ...], with # starting a comment. The variant is `branch` (the
// server's world, or WORLD_DIR's) or `main` (the world modules of MAIN_REF); the window is one of `windows`. The keys:
//   pose=crowd       a named test pose, `home` for the page's own opening, or four numbers x,z,heading,pitch
//   view=800x500     the viewport, in CSS px
//   dpr=1            the device's pixel ratio; the frame that is counted is the viewport times it, in device pixels
//   tier=            the page's own pick, or phone or tv (?tier=)
//   still=0          1 for the light alone (?still=1)
//   rung=0           how many rungs down its quality ladder the world starts and holds (?rung=N)
//   grids=0,0+1,1    the grids of 2x2 blocks counted, each by how many px it stands right and down of the frame's corner
//   patch=           a name in PATCHES
export function parseJobs(text, windows) {
  const jobs = [];
  for (const [n, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const fail = (why) => { throw new Error(`job line ${n + 1} ("${line}"): ${why}`); };
    const [variant, window, ...pairs] = line.split(/\s+/);
    if (variant !== "branch" && variant !== "main") fail(`the variant is branch or main, not "${variant}"`);
    if (!window || !Object.hasOwn(windows, window)) fail(`no window "${window ?? ""}": the day has ${Object.keys(windows).join(", ")}`);
    const given = { ...DEFAULTS }, seen = new Set();
    for (const pair of pairs) {
      const eq = pair.indexOf("="), key = eq < 0 ? pair : pair.slice(0, eq);
      if (eq < 0 || !Object.hasOwn(DEFAULTS, key)) fail(`"${pair}" is none of ${Object.keys(DEFAULTS).map((k) => `${k}=`).join(", ")}`);
      if (seen.has(key)) fail(`${key}= is there twice`);
      seen.add(key);
      given[key] = pair.slice(eq + 1);
    }
    const four = FOUR.exec(given.pose);
    if (four ? Math.abs(Number(four[4])) > 0.8 : !/^[a-z]+(?:-\d+)?$/.test(given.pose)) fail(`pose=${given.pose} is no pose: a name, home, or x,z,heading,pitch with the pitch within 0.8 rad`);
    const size = /^(\d+)x(\d+)$/.exec(given.view);
    if (!size || Number(size[1]) < 1 || Number(size[2]) < 1) fail(`view=${given.view} is no viewport: WIDTHxHEIGHT in CSS px`);
    const view = { width: Number(size[1]), height: Number(size[2]) };
    const dpr = /^\d+(?:\.\d+)?$/.test(given.dpr) ? Number(given.dpr) : 0;
    if (!(dpr > 0)) fail(`dpr=${given.dpr} is no pixel ratio`);
    for (const px of [view.width * dpr, view.height * dpr]) {
      if (Math.abs(px - Math.round(px)) > 1e-9 || Math.round(px) % 2) fail(`the frame ${view.width * dpr}x${view.height * dpr} (the view times dpr) is not whole 2x2 blocks`);
    }
    if (!["", "phone", "tv"].includes(given.tier)) fail(`tier=${given.tier}: phone, tv, or nothing for the page's own pick`);
    if (given.still !== "0" && given.still !== "1") fail(`still=${given.still}: 0 or 1`);
    if (!/^\d{1,2}$/.test(given.rung)) fail(`rung=${given.rung}: a whole number from 0 to 99`);
    const grids = given.grids.split("+");
    if (grids.some((g) => !/^[01],[01]$/.test(g)) || new Set(grids).size !== grids.length) fail(`grids=${given.grids}: one or more of 0,0 1,0 0,1 1,1, joined by +`);
    if (given.patch !== "" && !Object.hasOwn(PATCHES, given.patch)) fail(`no patch "${given.patch}": there is ${Object.keys(PATCHES).join(", ")}`);
    jobs.push({
      variant, window, pose: given.pose, view, dpr, tier: given.tier, still: given.still === "1", rung: Number(given.rung),
      grids: grids.map((g) => g.split(",").map(Number)), patch: given.patch,
    });
  }
  return jobs;
}

// The page a job opens: the day, driven by its map (the page plays no sound here), with the job's test hooks.
export const jobUrl = (siteUrl, day, job) => `${siteUrl}/${day}?drive=map` + (job.pose === "home" ? "" : `&pose=${job.pose}`) +
  (job.tier ? `&tier=${job.tier}` : "") + (job.still ? "&still=1" : "") + (job.rung ? `&rung=${job.rung}` : "");

// A file-safe name from every field that tells one job from another, so two jobs never share a result.
export const tagOf = (job) => [
  job.variant, job.window, job.pose, `${job.view.width}x${job.view.height}`, `x${job.dpr}`, job.tier || "auto", job.still ? "still" : "whole",
  `rung${job.rung}`, `g${job.grids.map(([x, y]) => `${x}${y}`).join("+")}`, ...(job.patch ? [`patch-${job.patch}`] : []),
].join("_").replace(/[^A-Za-z0-9._+-]/g, "~");

// The two sets of jobs, as job lines. `quick`, for a first look: Space and the seeks from behind the crowd on a desktop, the whole
// frame, main and the branch (4 jobs). `standard`, before a merge: five windows from two poses on a desktop and a phone, the whole
// frame and the light alone, main and the branch (80), and the seeks' light alone a rung down on both devices (4).
const DESKTOP = "view=800x500 dpr=1.5", PHONE = "tier=phone view=390x844 dpr=2";
export function matrixJobs(name) {
  const both = (rest) => ["main", "branch"].map((variant) => `${variant} ${rest}`);
  if (name === "quick") return ["Q", "S"].flatMap((window) => both(`${window} pose=crowd ${DESKTOP}`));
  if (name === "standard") {
    return [
      ...["A", "B", "Q", "D", "S"].flatMap((window) => ["crowd", "stage"].flatMap((pose) => [DESKTOP, PHONE].flatMap((device) =>
        ["still=0", "still=1"].flatMap((pass) => both(`${window} pose=${pose} ${device} ${pass}`))))),
      ...[DESKTOP, PHONE].flatMap((device) => both(`S pose=crowd ${device} still=1 rung=1`)),
    ];
  }
  throw new Error(`no matrix "${name}": quick or standard`);
}

// The browser. GPU=metal renders on a Mac's GPU; without it the browser picks its own renderer.
export const launchArgs = (gpu) => (gpu === "metal" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : []);
export function launch(chromium, gpu) {
  if (!gpu) console.warn("GPU is unset: the browser picks its renderer, and counts from different renderers are not comparable");
  return chromium.launch({ args: launchArgs(gpu) });
}

// The stepper, installed before any of the page's scripts. performance.now() is a virtual clock that only a step moves, and
// requestAnimationFrame queues onto a virtual frame that only a step runs, so every frame the world draws is one this script asked for,
// exactly 1/60 s of the world's time after the last. step(n) runs n frames in a row (nothing is presented between them);
// present() runs one inside a real animation frame, as a display would, and resolves two real frames later, once it is on screen.
export const STEPPER = `(() => {
  const perf = performance;
  const realNow = perf.now.bind(perf);
  const realRaf = window.requestAnimationFrame.bind(window);
  const base = realNow();
  let n = 0, vnow = base, nextId = 1;
  const queue = new Map();
  perf.now = () => vnow;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  const run = (advance) => {
    if (advance) { n += 1; vnow = base + n * (1000 / 60); }
    const cbs = [...queue.values()];
    queue.clear();
    for (const cb of cbs) { try { cb(vnow); } catch (e) { console.error("stepper: " + (e && e.stack || e)); } }
    return cbs.length;
  };
  window.__stepper = {
    step(k = 1) { let ran = 0; for (let i = 0; i < k; i++) ran += run(true); return ran; },
    pump() { return run(false); },
    present(after) { return new Promise((resolve) => realRaf(() => { run(true); const out = after ? after() : null; realRaf(() => realRaf(() => resolve(out))); })); },
    queued: () => queue.size, steps: () => n, now: () => vnow, realNow,
  };
})();`;

// A ref's world modules, read from git in this repo: the commit `ref` names (origin/main by default, which `git fetch` brings up to
// date; a local `main` can stand behind it).
const git = (...args) => execFileSync("git", ["-C", repoRoot(), ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
export const mainSha = (ref) => git("rev-parse", ref).trim();
const worlds = new Map();
export function mainWorld(ref) {
  if (!worlds.has(ref)) {
    const names = git("ls-tree", "--name-only", ref, "public/world/").trim().split("\n").map((p) => p.replace("public/world/", "")).filter((p) => p.endsWith(".js"));
    worlds.set(ref, new Map(names.map((name) => [name, git("show", `${ref}:public/world/${name}`)])));
  }
  return worlds.get(ref);
}
// The commit a checkout's world stands at, where `worldDir` is in a git checkout; else null.
export function headOf(worldDir) {
  try {
    return execFileSync("git", ["-C", worldDir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Serves the world's modules to the page in the server's place: for the variant "main" the ref's, from git, and a module the ref lacks
// is a 404; for "branch" those of `worldDir`, a checkout's public/world, so what is counted is that checkout's world whatever tree the
// server runs, or with no `worldDir` the server's own. `patches` change modules by name; with neither `worldDir` nor a ref, a patched
// module's text is this checkout's.
export async function routeWorld(page, variant, { mainRef, worldDir = null, patches = null }, served) {
  const files = variant === "main" ? new Map(mainWorld(mainRef)) : new Map();
  const dir = variant === "main" ? null : worldDir;
  if (dir) for (const name of readdirSync(dir)) if (name.endsWith(".js")) files.set(name, readFileSync(join(dir, name), "utf8"));
  for (const [name, edits] of Object.entries(patches ?? {})) {
    if ((variant === "main" || dir) && !files.has(name)) throw new Error(`patch: ${name} is not in ${dir ?? mainRef}`);
    files.set(name, patched(name, files.get(name) ?? readFileSync(join(repoRoot(), "public/world", name), "utf8"), edits));
  }
  if (variant !== "main" && !files.size) return;
  await page.route((url) => /^\/world\/[^/]+\.js$/.test(url.pathname), (route) => {
    const name = new URL(route.request().url()).pathname.replace("/world/", "");
    if (variant !== "main" && !files.has(name)) return dir ? route.fulfill({ status: 404, contentType: "text/plain", body: "not in WORLD_DIR" }) : route.continue();
    served.push(name);
    if (!files.has(name)) return route.fulfill({ status: 404, contentType: "text/plain", body: "not on main" });
    return route.fulfill({ status: 200, contentType: "text/javascript", body: files.get(name), headers: { "cache-control": "no-store" } });
  });
}

// A page for a job: its viewport and pixel ratio, a phone's touch for the phone's tier, the stepper, and the world's modules routed.
export async function openPage(browser, job, { siteUrl, mainRef, worldDir }) {
  const context = await browser.newContext({ viewport: job.view, deviceScaleFactor: job.dpr, ...(job.tier === "phone" ? { hasTouch: true, isMobile: true } : {}) });
  // The HUD's panels put away (the cookie the page reads on the server), so the whole of the world's frame is counted.
  await context.addCookies([{ name: "dead-redux-shelves", value: "title,actions,player", url: siteUrl }]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("dead-redux:shelves", "title,actions,player");
    } catch {
      // A page with no storage keeps the cookie's word.
    }
  });
  await context.addInitScript(STEPPER);
  const page = await context.newPage();
  const errors = [], served = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/archive\.org|ERR_ABORTED|favicon/.test(m.text())) errors.push(`console.error: ${m.text().slice(0, 300)}`); });
  await routeWorld(page, job.variant, { mainRef, worldDir, patches: job.patch ? PATCHES[job.patch] : null }, served);
  return { context, page, errors, served };
}

// Hides the dev server's own indicator, which is no part of the site.
export const hideDevIndicator = (page) => page.evaluate(() => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync("nextjs-portal{display:none}");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
});

// Puts the show clock at a track and a position, as the player's cue does (player:track), playing.
export const cue = (page, index, position, playing = true) => page.evaluate(([i, p, on]) => {
  document.dispatchEvent(new CustomEvent("player:track", { detail: { index: i, position: p } }));
  document.querySelector("main").dataset.state = on ? "playing" : "paused";
}, [index, position, playing]);

export const hill = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__hill ?? null)));
