// Shared pieces of the flash counter: where the repo is, a run's settings, the jobs, the browser, the frame stepper, a ref's world
// modules and the cue. Nothing here runs at import: every export is a constant or a function, so a unit test imports it on a machine
// with no browser and no git.
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

export const FPS = 60;

// The repo this file is in, two folders up.
export const repoRoot = () => resolve(fileURLToPath(new URL("../../", import.meta.url)));

// Playwright and pngjs, from the shoot's own packages (.github/screenshots), as the shoot has them: the root package.json has neither.
// The require from there is deliberate: one copy of the browser's driver serves the shoot and the count, and CI's tests install none.
export function loadPlaywright() {
  const require = createRequire(new URL("../../.github/screenshots/", import.meta.url));
  return { chromium: require("playwright").chromium, PNG: require("pngjs").PNG };
}

// The nearest folder of a path that exists, as the disk spells it through any link. A path is in the repo just when this is: the
// repo's own folder exists, so nothing under it has a nearer one outside.
function realFolder(path) {
  let dir = resolve(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  return realpathSync(dir);
}

// A run's settings, from the environment (README.md lists them). Each is checked here, before a browser starts: a setting that is
// wrong stops the run by name, where it would else fail every job late or count something that was not meant.
export function readConfig(env) {
  // OUT_DIR is outside the repo, so a result never lands in a commit. Real paths on both sides: a Mac's /tmp is a link, and a repo
  // under it is not hidden from an OUT_DIR that is spelled the other way.
  const outDir = resolve(env.OUT_DIR || join(tmpdir(), "dead-redux-flash"));
  const within = relative(realpathSync(repoRoot()), realFolder(outDir));
  if (!within.startsWith("..") && !isAbsolute(within)) throw new Error(`OUT_DIR ${outDir} is inside the repo: a count's files stay out of it`);
  const gpu = env.GPU || "";
  if (gpu !== "" && gpu !== "metal") throw new Error(`GPU=${gpu}: metal, or unset for the browser's own renderer`);
  let site = null;
  try {
    site = new URL(env.SITE_URL || "http://127.0.0.1:3000");
  } catch {
    // No address at all: refused below, with one that has no scheme.
  }
  if (!site || !/^https?:$/.test(site.protocol)) throw new Error(`SITE_URL=${env.SITE_URL} is no address: one starts with http:// or https://`);
  const worldDir = env.WORLD_DIR ? resolve(env.WORLD_DIR) : null;
  if (worldDir && !existsSync(join(worldDir, "main.js"))) {
    const inner = join(worldDir, "public", "world");
    throw new Error(`WORLD_DIR=${worldDir} holds no main.js: it is a checkout's public/world` + (existsSync(join(inner, "main.js")) ? `; did you mean ${inner}` : ""));
  }
  const day = env.DAY || "2026-10-20";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`DAY=${day} is no date`);
  const parallel = Number(env.PARALLEL || 2);
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error(`PARALLEL=${env.PARALLEL} is no count of jobs`);
  // A job writes its result, a few kilobytes. Its heat maps (HEAT=1) and its stills (STILLS=1), which are megabytes, are kept on asking.
  return {
    siteUrl: site.href.replace(/\/+$/, ""), day, outDir, gpu, worldDir, mainRef: env.MAIN_REF || "origin/main", parallel,
    heat: env.HEAT === "1", stills: env.STILLS === "1",
  };
}

// A run's own folder under OUT_DIR, named by when it started (UTC) and what it ran. No run writes into another's folder, so a table
// made from a folder is of one run.
export const runFolder = (now, command, arg) => `${now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}-${command === "matrix" ? arg : command}`;

// The windows of a day's show (windows.json): the stretches of it that are counted. The track numbers belong to that day's show.
export function windowsFor(day) {
  const all = JSON.parse(readFileSync(new URL("./windows.json", import.meta.url), "utf8"));
  if (!Object.hasOwn(all, day)) throw new Error(`windows.json has no windows for ${day}: it has ${Object.keys(all).join(", ")}`);
  return all[day];
}

// What a job line may set, and what each is when the line leaves it out.
// All four grids: a 2x2 flash lies whole in a block of exactly one of them, and is seen at a half or a quarter by the rest.
const DEFAULTS = { pose: "crowd", view: "800x500", dpr: "1", tier: "", still: "0", rung: "0", grids: "0,0+1,1+1,0+0,1" };
// A pose is a name, or four numbers for ?pose=X,Z,HEADING,PITCH. Which names and which numbers are a pose is the world's to say
// (main.js): a job whose pose the world does not take stops when the page has loaded.
const POSE = /^(?:[a-z]+(?:-\d+)?|-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){3})$/;

// The jobs a text names, one a line: <variant> <window> [key=value ...], with # starting a comment. The variant is `branch` (the
// server's world, or WORLD_DIR's) or `main` (the world modules of MAIN_REF); the window is one of `windows`. The keys:
//   pose=crowd       a named test pose, `home` for the page's own opening, or four numbers x,z,heading,pitch
//   view=800x500     the viewport, in CSS px
//   dpr=1            the device's pixel ratio; the frame that is counted is the viewport times it, in device pixels
//   tier=            the page's own pick, or phone or tv (?tier=)
//   still=0          1 stills the figures (?still=1): the pass the README calls the light alone
//   rung=0           how many rungs down its quality ladder the world starts and holds (?rung=N)
//   grids=0,0+1,1+1,0+0,1   the grids of 2x2 blocks counted, each by how many px it stands right and down of the frame's corner
// The grids are the 2x2 count's, which only --blocks runs (`blocks`): without it a job has none, and a line that names some is refused.
export function parseJobs(text, windows, { blocks = true } = {}) {
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
    if (!POSE.test(given.pose)) fail(`pose=${given.pose} is no pose: a name, home, or four numbers x,z,heading,pitch`);
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
    if (!blocks && seen.has("grids")) fail("grids= is the 2x2 blocks' count, which only --blocks runs");
    const grids = blocks ? given.grids.split("+") : [];
    if (grids.some((g) => !/^[01],[01]$/.test(g)) || new Set(grids).size !== grids.length) fail(`grids=${given.grids}: one or more of 0,0 1,0 0,1 1,1, joined by +`);
    jobs.push({
      variant, window, pose: given.pose, view, dpr, tier: given.tier, still: given.still === "1", rung: Number(given.rung),
      grids: grids.map((g) => g.split(",").map(Number)),
    });
  }
  return jobs;
}

// The page a job opens: the day, driven by its map (the page plays no sound here), with the job's test hooks.
export const jobUrl = (siteUrl, day, job) => `${siteUrl}/${day}?drive=map` + (job.pose === "home" ? "" : `&pose=${job.pose}`) +
  (job.tier ? `&tier=${job.tier}` : "") + (job.still ? "&still=1" : "") + (job.rung ? `&rung=${job.rung}` : "");

// A file-safe name from every field that tells one job from another, so two jobs never share a result. A job with no grids is counted
// by WCAG's thresholds alone, and its name ends at its rung; one with grids by the 2x2 blocks too (--blocks), and names them.
export const tagOf = (job) => [
  job.variant, job.window, job.pose, `${job.view.width}x${job.view.height}`, `x${job.dpr}`, job.tier || "auto", job.still ? "still" : "whole",
  `rung${job.rung}`, ...(job.grids.length ? [`g${job.grids.map(([x, y]) => `${x}${y}`).join("+")}`] : []),
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

// The browser. GPU=metal renders on a Mac's GPU; unset, the browser picks its own renderer, which each result names.
export function launch(chromium, gpu) {
  if (gpu !== "metal") console.warn("GPU is unset: the browser picks its renderer, and counts from different renderers are not comparable");
  return chromium.launch({ args: gpu === "metal" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [], chromiumSandbox: !process.env.GITHUB_ACTIONS });
}

// The stepper, installed before any of the page's scripts. performance.now() is a virtual clock that only a step moves, and
// requestAnimationFrame queues onto a virtual frame that only a step runs, so every frame the world draws is one this script asked for,
// exactly 1/60 s of the world's time after the last. step(n) runs n frames in a row (nothing is presented between them);
// present() runs one inside a real animation frame, as a display would, and resolves two real frames later, once it is on screen.
// Date.now() follows the virtual clock from the moment the page opened, in whole milliseconds. Nothing else is virtual: timers, new
// Date() and CSS animations keep the machine's time, which the page's own scripts need. So the world's modules keep to
// performance.now and the animation frame, and scripts/__tests__/flash-lib.test.ts holds them to it.
export const STEPPER = `(() => {
  const perf = performance;
  const realNow = perf.now.bind(perf);
  const realRaf = window.requestAnimationFrame.bind(window);
  const base = realNow(), opened = Date.now();
  let n = 0, vnow = base, nextId = 1;
  const queue = new Map();
  perf.now = () => vnow;
  Date.now = () => opened + Math.floor(vnow - base);
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

// The commit MAIN_REF names in this repo (origin/main by default, which `git fetch` brings up to date; a local `main` can stand
// behind it). A run resolves it once, before a browser starts, and reads main's world at that commit from then on.
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
export function mainSha(ref) {
  try {
    return git(repoRoot(), "rev-parse", "--verify", `${ref}^{commit}`).trim();
  } catch {
    throw new Error(`MAIN_REF=${ref} names no commit in this repo (git fetch origin main brings origin/main)`);
  }
}
// A commit's world modules, read from git in this repo.
const worlds = new Map();
export function mainWorld(commit) {
  if (!worlds.has(commit)) {
    const names = git(repoRoot(), "ls-tree", "--name-only", commit, "public/world/").trim().split("\n").map((p) => p.replace("public/world/", "")).filter((p) => p.endsWith(".js"));
    worlds.set(commit, new Map(names.map((name) => [name, git(repoRoot(), "show", `${commit}:public/world/${name}`)])));
  }
  return worlds.get(commit);
}

// Which world a job counts, for its result. `hash` tells one world from another whatever is said of where it came from: it is of the
// modules as the page was served them, every /world/*.js it loaded, by name. With it, where they came from: main's commit; a
// checkout's public/world, with the checkout's commit and whether that folder differs from it (`dirty`); or the server's own.
export function worldHash(modules) {
  const hash = createHash("sha256");
  for (const [name, text] of [...modules].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) hash.update(`${name}\0${Buffer.byteLength(text)}\0${text}`);
  return hash.digest("hex");
}
export function worldFrom(variant, { siteUrl, mainRef, mainCommit, worldDir }) {
  if (variant === "main") return { from: "main", ref: mainRef, commit: mainCommit, dirty: false };
  if (!worldDir) return { from: "server", ref: siteUrl, commit: null, dirty: null };
  try {
    return { from: "WORLD_DIR", ref: worldDir, commit: git(worldDir, "rev-parse", "HEAD").trim(), dirty: git(worldDir, "status", "--porcelain", "--", ".").trim() !== "" };
  } catch {
    // A folder that is in no git checkout: the hash alone says what it holds.
    return { from: "WORLD_DIR", ref: worldDir, commit: null, dirty: null };
  }
}

// Serves the world's modules to the page in the server's place: for the variant "main" the ref's, from git, and a module the ref lacks
// is a 404; for "branch" those of `worldDir`, a checkout's public/world, so what is counted is that checkout's world whatever tree the
// server runs, or with no `worldDir` the server's own, which is not routed at all. An experiment that needs a changed world counts a
// scratch checkout as `worldDir`.
export async function routeWorld(page, variant, { mainCommit, worldDir = null }) {
  if (variant !== "main" && !worldDir) return;
  const files = variant === "main" ? mainWorld(mainCommit) : new Map(readdirSync(worldDir).filter((name) => name.endsWith(".js")).map((name) => [name, readFileSync(join(worldDir, name), "utf8")]));
  await page.route((url) => /^\/world\/[^/]+\.js$/.test(url.pathname), (route) => {
    const name = new URL(route.request().url()).pathname.replace("/world/", "");
    if (!files.has(name)) return route.fulfill({ status: 404, contentType: "text/plain", body: variant === "main" ? "not on main" : "not in WORLD_DIR" });
    return route.fulfill({ status: 200, contentType: "text/javascript", body: files.get(name), headers: { "cache-control": "no-store" } });
  });
}

// The HUD's shelves, put away so that the whole of the world's frame is counted: the page's cookie and its storage key, and the
// names of its three shelves. They are the page's own (src/components/world/shelves.ts), and flash-lib.test.ts holds them to it: a
// name that changed there and not here would leave the HUD out, in the counted frame.
export const SHELVES_COOKIE = "dead-redux-shelves", SHELVES_STORAGE = "dead-redux:shelves", SHELVES_AWAY = "title,actions,player";

// The HUD's plates as the page draws them now, each drawn one's box in CSS px and the start of its text: window.__plates(), which the
// count reads before the frames and in every one, so one test says what is drawn. It runs in the page.
export function installPlates() {
  window.__plates = () => [...document.querySelectorAll(".plate")].flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || r.width <= 0 || r.height <= 0) return [];
    return [{ x: r.x, y: r.y, w: r.width, h: r.height, text: el.innerText.replace(/\s+/g, " ").trim().slice(0, 50) }];
  });
}
export const readPlates = (page) => page.evaluate(() => window.__plates());

// Whether a console error is the page's own, which stops a count. Not the archive's audio, an aborted request or the favicon; and not the
// Content-Security-Policy refusing Vercel's toolbar, which a preview's build loads on every page and the policy refuses on purpose (the
// shoot counts those refusals apart: VERCEL_TOOLBAR in .github/screenshots/shoot.mjs). Chromium writes the refusal as "Loading the
// script 'https://vercel.live/…' violates the following Content Security Policy directive: …", and older builds as "Refused to load
// the script '…' because it violates …": either way the address refused is the first thing quoted, and it is the toolbar's. A refusal
// of any other address is the site's, and stops the count.
const TOOLBAR_REFUSED = /^[^']*'https:\/\/vercel\.live\/[^']*' (?:because it )?violates the following Content Security Policy directive/;
export const worldError = (text) => !/archive\.org|ERR_ABORTED|favicon/.test(text) && !TOOLBAR_REFUSED.test(text);

// A page for a job: its viewport and pixel ratio, a phone's touch for the phone's tier, the shelves put away, the stepper, the plate
// reader, and the world's modules routed. `modules` gathers every world module the page is served, by name, for the world's hash.
export async function openPage(browser, job, { siteUrl, mainCommit, worldDir }) {
  const context = await browser.newContext({ viewport: job.view, deviceScaleFactor: job.dpr, ...(job.tier === "phone" ? { hasTouch: true, isMobile: true } : {}) });
  // The cookie is what the server renders the shelves by, and the storage what the page's script reads.
  await context.addCookies([{ name: SHELVES_COOKIE, value: SHELVES_AWAY, url: siteUrl }]);
  await context.addInitScript(([key, away]) => {
    try {
      localStorage.setItem(key, away);
    } catch {
      // A page with no storage keeps the cookie's word.
    }
  }, [SHELVES_STORAGE, SHELVES_AWAY]);
  await context.addInitScript(STEPPER);
  await context.addInitScript(installPlates);
  const page = await context.newPage();
  const errors = [], modules = new Map();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && worldError(m.text())) errors.push(`console.error: ${m.text().slice(0, 300)}`); });
  page.on("response", (response) => {
    const name = /^\/world\/([^/]+\.js)$/.exec(new URL(response.url()).pathname)?.[1];
    if (name && response.status() === 200) modules.set(name, response.text().then((text) => [name, text]));
  });
  await routeWorld(page, job.variant, { mainCommit, worldDir });
  return { context, page, errors, modules };
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
