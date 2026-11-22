// The flash counter. Renders a window of the show frame by frame on a virtual clock of 60 frames a second, from the branch (the
// server's world, or WORLD_DIR's) or from main (the world modules of MAIN_REF, routed in), takes a screenshot of every frame, and counts
// the swings in relative luminance per 2x2 block of device pixels. README.md here says what a count is, how to run one and what a PR
// reports.
//
//   node scripts/flash/capture.mjs matrix quick|standard
//   node scripts/flash/capture.mjs jobs <file>
//   node scripts/flash/capture.mjs one "<variant> <window> [key=value ...]"
//
// Writes <tag>.json and heat maps under OUT_DIR, which is outside the repo, and with STILLS=1 a still of every 30th frame.
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { analyse, blockLuminance, platesMask, THRESHOLD } from "./analyse.mjs";
import { cue, FPS, headOf, hideDevIndicator, hill, jobUrl, launch, loadPlaywright, mainSha, matrixJobs, openPage, parseJobs, PATCHES, readConfig, tagOf, windowsFor } from "./lib.mjs";

const SETTLE_S = 12, WARM_FRAMES = 60;
// Blocks within this many px of a plate's box are masked with it (a plate's edge is antialiased over a fraction of a pixel).
const PAD = 2;

const readPlates = (page) => page.evaluate(() => [...document.querySelectorAll(".plate")].map((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, drawn: el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && r.width > 0 && r.height > 0,
    text: el.innerText.replace(/\s+/g, " ").trim().slice(0, 50) };
}));

// A PNG of a per-block map: `values[b]` over `scale` as a heat (black, red, yellow, white); masked blocks grey-blue.
function heat(PNG, values, mask, scale, bw, bh) {
  const png = new PNG({ width: bw, height: bh });
  for (let b = 0; b < bw * bh; b++) {
    const o = b * 4, v = Math.min(1, values[b] / scale);
    if (mask[b]) { png.data[o] = 40; png.data[o + 1] = 50; png.data[o + 2] = 80; }
    else { png.data[o] = Math.min(255, v * 3 * 255); png.data[o + 1] = Math.max(0, Math.min(255, (v * 3 - 1) * 255)); png.data[o + 2] = Math.max(0, Math.min(255, (v * 3 - 2) * 255)); }
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

const gridName = ([ox, oy]) => (ox || oy ? `the grid moved ${ox} px right and ${oy} px down` : "the even grid");

async function run(browser, PNG, config, day, job) {
  const win = day.windows[job.window], tag = tagOf(job), url = jobUrl(config.siteUrl, config.day, job);
  const VIEWPORT = job.view, DPR = job.dpr;
  // The frame that is counted: the screenshot, in device pixels.
  const FRAME = { width: Math.round(VIEWPORT.width * DPR), height: Math.round(VIEWPORT.height * DPR) };
  // Each grid of 2x2 blocks. One moved a pixel right or down counts the blocks that straddle the even grid's lines, and leaves out a
  // column or a row of pixels at the frame's edge.
  const grids = job.grids.map(([ox, oy]) => ({ ox, oy, bw: Math.floor((FRAME.width - ox) / 2), bh: Math.floor((FRAME.height - oy) / 2) }));
  const nFrames = (win.to - win.from) * FPS + 1;
  const t0 = Date.now();
  const { context, page, errors, served } = await openPage(browser, job, config);
  // The stills are kept only when asked for: they are most of what a run writes.
  const stills = config.stills ? join(config.outDir, "stills", tag) : null;
  if (stills) await mkdir(stills, { recursive: true });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Polled from here on a real timer: the page's own animation frames stand still until a step, and so would a wait that polls on them.
    const until = async (what, test) => {
      for (const t = Date.now(); Date.now() - t < 60_000;) { if (await page.evaluate(test)) return; await new Promise((r) => setTimeout(r, 100)); }
      throw new Error(`${tag}: ${what} did not come in 60 s`);
    };
    await until("the world", () => document.getElementById("world")?.dataset.world === "ready");
    if (await page.evaluate(() => document.querySelector("main")?.dataset.testHooks !== "1")) throw new Error(`${tag}: the test hooks are off on this server; run it with VERCEL_ENV=preview`);
    await until("the map", () => window.__hill?.map != null);
    await page.evaluate(() => document.fonts.ready);
    await hideDevIndicator(page);
    const loaded = await page.evaluate(() => {
      const c = document.querySelector("#world canvas"), r = c.getBoundingClientRect(), h = window.__hill;
      const gl = c.getContext("webgl2"), info = gl?.getExtension("WEBGL_debug_renderer_info");
      return { framesBeforeFirstStep: h.frames, night: typeof h.night, tier: h.tier, scale: h.scale, rung: h.rung, mode: h.mode, still: h.still ?? null, dpr: devicePixelRatio,
        renderer: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null,
        canvas: { x: r.x, y: r.y, w: r.width, h: r.height, bufferW: c.width, bufferH: c.height }, mapShow: h.map?.show ?? null };
    });
    const { canvas } = loaded;
    if (canvas.x !== 0 || canvas.y !== 0 || canvas.w !== VIEWPORT.width || canvas.h !== VIEWPORT.height) throw new Error(`${tag}: the canvas is not the frame: ${JSON.stringify(canvas)}`);
    // The world heard what the job asked of it: a world from before a hook, or a pose it does not know, would count something else.
    if (loaded.mapShow !== day.show) throw new Error(`${tag}: the page plays ${loaded.mapShow}, and the windows are ${day.show}'s`);
    if (job.still && loaded.still !== true) throw new Error(`${tag}: still=1 was asked, and this world does not know ?still=1 (a world from before the hook counts with patch=still-before-hooks)`);
    if (job.pose !== "home" && (job.pose.includes(",") ? loaded.mode !== "walk" : loaded.mode === "descent")) throw new Error(`${tag}: pose=${job.pose} was asked, and the world opened in the mode "${loaded.mode}": it does not know the pose`);
    if (loaded.rung !== job.rung) throw new Error(`${tag}: rung=${job.rung} was asked, and the world stands at rung ${loaded.rung}: its ladder ends there, or it does not know ?rung=`);

    // The world's first second, the show at its start and paused, then the cue SETTLE_S before the window, playing.
    await page.evaluate((n) => window.__stepper.step(n), WARM_FRAMES);
    await cue(page, win.track, win.from - SETTLE_S);
    const settleFrames = SETTLE_S * FPS - 1;
    for (let done = 0; done < settleFrames;) { const n = Math.min(60, settleFrames - done); await page.evaluate((k) => window.__stepper.step(k), n); done += n; }

    let plates = await readPlates(page);
    for (const g of grids) { g.mask = platesMask(plates, g.bw, g.bh, DPR, PAD); g.L = new Uint16Array(nFrames * g.bw * g.bh); }
    const platesSeen = new Map(plates.filter((p) => p.drawn).map((p) => [`${p.x},${p.y},${p.w},${p.h}`, p]));
    // Points the canvas's own pixels are read at, to check each screenshot shows the frame just drawn: a grid, clear of the plates.
    // Only where the canvas's buffer is the screen's own pixels; a frame drawn smaller and scaled up to the screen is not checked so.
    const oneToOne = canvas.bufferW === FRAME.width && canvas.bufferH === FRAME.height;
    const evenW = FRAME.width / 2, even = platesMask(plates, evenW, FRAME.height / 2, DPR, PAD);
    const points = [];
    if (oneToOne) for (let y = 9; y < FRAME.height; y += 26) for (let x = 11; x < FRAME.width; x += 38) if (!even[Math.floor(y / 2) * evenW + Math.floor(x / 2)]) points.push([x, y]);

    const state = [], meanLum = [];
    const sync = { checked: 0, worst: 0, over2: 0, unread: 0 };
    let framesAtStart = null, framesStepped = 0, platesChanged = 0;
    for (let f = 0; f < nFrames; f++) {
      const cueNow = win.cues?.find(([at]) => Math.round(at * FPS) === f);
      if (cueNow) await cue(page, cueNow[1], cueNow[2]);
      const read = await page.evaluate((pts) => window.__stepper.present(() => {
        const c = document.querySelector("#world canvas"), gl = c.getContext("webgl2"), h = window.__hill;
        let px = null;
        if (pts.length && gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === null) {
          px = [];
          const one = new Uint8Array(4);
          for (const [x, y] of pts) { gl.readPixels(x, c.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); px.push(one[0], one[1], one[2]); }
        }
        const m = h.map, r = h.rig, n = h.night;
        return { px, frames: h.frames, rung: h.rung, state: document.querySelector("main").dataset.state,
          s: [m?.build ?? null, m?.loud ?? null, r.lit, r.gather, h.crowd.dance, n ? n.hour : null, h.analysis.source === "map" ? 1 : 0, h.calls, n ? n.dark : null, h.analysis.weight ?? null, h.scale, h.triangles],
          plates: [...document.querySelectorAll(".plate")].map((el) => { const b = el.getBoundingClientRect(); return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && b.width > 0 ? `${b.x},${b.y},${b.width},${b.height}` : ""; }).filter(Boolean) };
      }), points);
      if (framesAtStart === null) framesAtStart = read.frames - 1;
      if (read.frames !== framesAtStart + f + 1) throw new Error(`${tag}: frame ${f} drew ${read.frames - framesAtStart - f} frames, not one`);
      if (read.rung !== job.rung || read.state !== "playing") throw new Error(`${tag}: frame ${f} rung ${read.rung}, state ${read.state}`);
      framesStepped += 1;
      for (const k of read.plates) if (!platesSeen.has(k)) { platesChanged += 1; const [x, y, w, h] = k.split(",").map(Number); platesSeen.set(k, { x, y, w, h, drawn: true, text: `(appeared at frame ${f})` }); }
      state.push(read.s);
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }, type: "png" });
      const png = PNG.sync.read(buf);
      if (png.width !== FRAME.width || png.height !== FRAME.height) throw new Error(`${tag}: screenshot is ${png.width}x${png.height}`);
      const d = png.data;
      if (read.px) {
        let worst = 0;
        for (let i = 0; i < points.length; i++) {
          const o = (points[i][1] * png.width + points[i][0]) * 4;
          worst = Math.max(worst, Math.abs(d[o] - read.px[3 * i]), Math.abs(d[o + 1] - read.px[3 * i + 1]), Math.abs(d[o + 2] - read.px[3 * i + 2]));
        }
        sync.checked += 1; sync.worst = Math.max(sync.worst, worst); if (worst > 2) sync.over2 += 1;
      } else sync.unread += 1;
      // Relative luminance of each 2x2 block, on each grid, from the one screenshot.
      for (const [k, g] of grids.entries()) {
        const { sum, count } = blockLuminance(d, FRAME.width, g.bw, g.bh, g.ox, g.oy, g.L, f * g.bw * g.bh, g.mask);
        if (k === 0) meanLum.push(Math.round((sum / count) * 100000) / 100000);
      }
      if (stills && (f % 30 === 0 || f === nFrames - 1)) await writeFile(join(stills, `f${String(f).padStart(4, "0")}.png`), buf);
    }
    // Every plate drawn at any frame is masked.
    plates = [...platesSeen.values()];
    const end = await hill(page), last = state[state.length - 1];
    const results = [];
    for (const g of grids) {
      const mask = platesMask(plates, g.bw, g.bh, DPR, PAD);
      const { maps, ...rest } = analyse(g.L, nFrames, g.bw, g.bh, mask, FPS);
      g.L = null;
      await writeFile(join(config.outDir, `${tag}-g${g.ox}${g.oy}-most-in-a-second.png`), heat(PNG, maps.perBlock, mask, 6, g.bw, g.bh));
      await writeFile(join(config.outDir, `${tag}-g${g.ox}${g.oy}-range.png`), heat(PNG, maps.range, mask, 0.3, g.bw, g.bh));
      // A block's x and y in the result are its place on its own grid, in px: the frame's pixel is that plus the grid's offset.
      results.push({ grid: [g.ox, g.oy], block: `2x2 px, on ${gridName([g.ox, g.oy])}`, ...rest });
      const w = rest.worst, masked = mask.reduce((a, b) => a + b, 0);
      console.log(`${tag}, ${gridName([g.ox, g.oy])}: max ${rest.maxSwingsInASecond} (strict ${rest.maxSwingsInASecondStrict}) swings in a second; frame ${FRAME.width}x${FRAME.height} (buffer ${canvas.bufferW}x${canvas.bufferH}), tier ${loaded.tier}, rung ${end.rung}, scale ${end.scale}, ${Math.round(100 * (1 - masked / mask.length))} % counted, dark ${last[8]}, loud ${last[1]}, tris ${last[11]}; blocks >=5: ${rest.blocksAtLeast[5]}; >=1: ${rest.blocksAtLeast[1]}; ` +
        `worst ${w ? `(${w.x}, ${w.y}) from frame ${w.runStartsAtFrame}, range ${w.range}` : "none"}; largest range ${rest.largestRange?.range} at (${rest.largestRange?.x}, ${rest.largestRange?.y})`);
    }
    const out = {
      tag, job, variant: job.variant, pass: job.still ? "light alone (?still=1: the bears hidden, the band not moved, the crowd posed standing still)" : "whole frame",
      window: job.window, ...win, day: config.day, show: day.show, url, viewport: VIEWPORT, devicePixelRatio: DPR, frame: FRAME, tier: job.tier || "picked by the page", rung: job.rung,
      patch: job.patch || null, patchEdits: job.patch ? PATCHES[job.patch] : null, gpu: config.gpu || "the browser's own choice", panels: "put away", fps: FPS, frames: nFrames, threshold: THRESHOLD,
      stepping: "init-script stepper: a virtual performance.now() and requestAnimationFrame, 1/60 s a frame; each captured frame runs inside a real animation frame and is screenshot two real frames later",
      settle: `the world's first ${WARM_FRAMES} frames with the show at its start and paused, then a cue to track ${win.track} at ${win.from - SETTLE_S} s, playing; ${settleFrames} frames uncaptured; captured frame f is at ${win.from} + f/60 s`,
      loaded, worldDir: job.variant === "branch" ? config.worldDir : null, mainRef: job.variant === "main" ? config.mainRef : null,
      worldHead: job.variant === "main" ? mainSha(config.mainRef) : config.worldDir ? headOf(config.worldDir) : null, modulesRouted: served, framesStepped, oneFramePerStep: true,
      screenshotMatchesCanvas: sync, platesMasked: plates.filter((p) => p.drawn), platesNotDrawn: (await readPlates(page)).filter((p) => !p.drawn), platesChangedDuringCapture: platesChanged, padPx: PAD,
      end: { rung: end.rung, tier: end.tier, scale: end.scale, calls: end.calls, mode: end.mode, rig: end.rig, crowd: end.crowd, night: end.night ?? null, analysis: end.analysis, map: end.map },
      errors, seconds: Math.round((Date.now() - t0) / 1000),
      results,
      meanLuminance: meanLum,
      stateColumns: ["build", "loud", "rigLit", "rigGather", "crowdDance", "nightHour", "driveIsMap", "calls", "dark", "weight", "scale", "triangles"], state,
    };
    await writeFile(join(config.outDir, `${tag}.json`), JSON.stringify(out));
    console.log(`${tag}: ${loaded.renderer}; sync worst ${sync.worst}, over 2: ${sync.over2}/${sync.checked}; plates changed ${platesChanged}; errors ${errors.length}; ${out.seconds} s`);
    return out;
  } finally {
    await context.close();
  }
}

const USAGE = `usage: node scripts/flash/capture.mjs matrix quick|standard
       node scripts/flash/capture.mjs jobs <file>
       node scripts/flash/capture.mjs one "<variant> <window> [key=value ...]"`;
const [, , command, ...rest] = process.argv;
if (!["matrix", "jobs", "one"].includes(command) || !rest.length) {
  console.error(USAGE);
  process.exit(2);
}
// The settings and the jobs, read before a browser is launched: a setting or a job line that is wrong stops the run here, by name.
let config, day, jobs;
try {
  config = readConfig(process.env);
  day = windowsFor(config.day);
  const text = command === "matrix" ? matrixJobs(rest[0]).join("\n") : command === "jobs" ? await readFile(rest[0], "utf8") : rest.join(" ");
  jobs = parseJobs(text, day.windows);
  const tags = jobs.map(tagOf);
  const twice = tags.find((tag, k) => tags.indexOf(tag) !== k);
  if (twice) throw new Error(`the job ${twice} is there twice`);
  if (!jobs.length) throw new Error("no job to run");
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
await mkdir(config.outDir, { recursive: true });
console.log(`${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${config.parallel} at a time, at ${config.siteUrl}/${config.day}; results in ${config.outDir}`);
const { chromium, PNG } = loadPlaywright();
const browser = await launch(chromium, config.gpu);
try {
  let next = 0;
  const failures = [];
  await Promise.all(Array.from({ length: config.parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await run(browser, PNG, config, day, job); } catch (e) { failures.push(`${tagOf(job)}: ${e.stack}`); console.log(`FAILED ${tagOf(job)}: ${e.message}`); }
    }
  }));
  if (failures.length) { console.log(failures.join("\n")); process.exitCode = 1; }
} finally {
  await browser.close();
}
