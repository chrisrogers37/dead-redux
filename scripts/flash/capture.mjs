// The flash counter. Renders a window of the show frame by frame on a virtual clock of 60 frames a second, from the branch (the
// server's world, or WORLD_DIR's) or from main (the world modules of MAIN_REF, routed in), takes a screenshot of every frame, and counts
// the flashes by WCAG 2.3.1's general and red flash thresholds as the frames arrive (wcag.mjs); with --blocks, the swings in relative
// luminance per 2x2 block of device pixels too, the bar before 2026-11-27 (analyse.mjs), from the same frames. README.md here says what
// a count is, how to run one and what a PR reports.
//
//   node scripts/flash/capture.mjs [--blocks] matrix quick|standard
//   node scripts/flash/capture.mjs [--blocks] jobs <file>
//   node scripts/flash/capture.mjs [--blocks] one "<variant> <window> [key=value ...]"
//
// Each run writes into a new folder of its own under OUT_DIR, which is outside the repo: <tag>.json for each job; with HEAT=1 and
// --blocks a heat map of each grid, and with STILLS=1 a still of every 30th frame. A job that did not measure what it was asked to
// stops and writes nothing: a clock that did not keep its rate, a frame the screenshot did not show, a page error, a pose the walk moved.
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { blockLuminance, counter, platesMask, THRESHOLD } from "./analyse.mjs";
import { cue, FPS, hideDevIndicator, jobUrl, launch, loadPlaywright, mainSha, matrixJobs, openPage, parseJobs, readConfig, readPlates, runFolder, tagOf, windowsFor, worldFrom, worldHash } from "./lib.mjs";
import { tables } from "./table.mjs";
import { MOST, platesPixelMask, wcagCounter } from "./wcag.mjs";

const SETTLE_S = 12, WARM_FRAMES = 60;
// The lead-in: a second of frames before each window. They set every pixel's, window's and block's state and count for nothing else
// (wcag.mjs, analyse.mjs).
const LEAD = FPS;
// Pixels and blocks within this many px of a plate's box are masked with it (a plate's edge is antialiased over a fraction of a pixel).
const PAD = 2;
// A frame of the virtual clock, in ms, and how far the clock may stand from where the frames put it: a sum's rounding and no more.
const FRAME_MS = 1000 / FPS, CLOCK_SLACK = 1e-6;
// How far a screenshot may differ from the canvas at a checked point, of 255: the browser's own rounding as it composites.
const SHOT_SLACK = 2;
// How far the visitor may stand from the pose a job asked, in metres, and look from it, in radians: the stats' rounding.
const STAND_SLACK = 0.02, LOOK_SLACK = 0.002;

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

const gridName = (ox, oy) => (ox || oy ? `the grid moved ${ox} px right and ${oy} px down` : "the even grid");
const plateKey = (p) => `${p.x},${p.y},${p.w},${p.h}`;
// The virtual clock and the world's own count of the frames it has drawn, read in the page.
const readClock = (page) => page.evaluate(() => ({ now: window.__stepper.now(), steps: window.__stepper.steps(), frames: window.__hill.frames }));

async function run(browser, PNG, config, day, job) {
  const win = day.windows[job.window], tag = tagOf(job), url = jobUrl(config.siteUrl, config.day, job);
  const stop = (why) => { throw new Error(why); };
  const VIEWPORT = job.view, DPR = job.dpr;
  // The frame that is counted: the screenshot, in device pixels.
  const FRAME = { width: Math.round(VIEWPORT.width * DPR), height: Math.round(VIEWPORT.height * DPR) };
  // The WCAG count, of the whole frame.
  const wcag = wcagCounter(FRAME.width, FRAME.height, { fps: FPS, lead: LEAD });
  // With --blocks, each grid of 2x2 blocks, with its own count. One moved a pixel right or down counts the blocks that straddle the even
  // grid's lines, and leaves out a column or a row of pixels at the frame's edge. Without it the job has no grids.
  const grids = job.grids.map(([ox, oy]) => {
    const bw = Math.floor((FRAME.width - ox) / 2), bh = Math.floor((FRAME.height - oy) / 2);
    return { ox, oy, bw, bh, count: counter(bw, bh, FPS, LEAD) };
  });
  const nFrames = (win.to - win.from) * FPS + 1;
  const t0 = Date.now();
  const { context, page, errors, modules } = await openPage(browser, job, config);
  // The stills are kept only when asked for: they are most of what a run can write.
  const stills = config.stills ? join(config.runDir, "stills", tag) : null;
  if (stills) await mkdir(stills, { recursive: true });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Polled from here on a real timer: the page's own animation frames stand still until a step, and so would a wait that polls on them.
    const until = async (what, test) => {
      for (const t = Date.now(); Date.now() - t < 60_000;) { if (await page.evaluate(test)) return; await new Promise((r) => setTimeout(r, 100)); }
      stop(`${what} did not come in 60 s`);
    };
    await until("the world", () => document.getElementById("world")?.dataset.world === "ready");
    if (await page.evaluate(() => document.querySelector("main")?.dataset.testHooks !== "1")) stop("the test hooks are off on this server; run it with VERCEL_ENV=preview");
    await until("the map", () => window.__hill?.map != null);
    await page.evaluate(() => document.fonts.ready);
    await hideDevIndicator(page);
    const world = await page.evaluate(() => {
      const c = document.querySelector("#world canvas"), r = c.getBoundingClientRect(), h = window.__hill;
      const gl = c.getContext("webgl2"), info = gl?.getExtension("WEBGL_debug_renderer_info");
      return { tier: h.tier, scale: h.scale, rung: h.rung, mode: h.mode, still: h.still ?? null, show: h.map?.show ?? null,
        renderer: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null,
        canvas: { x: r.x, y: r.y, w: r.width, h: r.height, bufferW: c.width, bufferH: c.height },
        shelves: [...document.querySelectorAll("[data-shelf]")].map((el) => el.dataset.shelf) };
    });
    const { canvas } = world;
    if (canvas.x !== 0 || canvas.y !== 0 || canvas.w !== VIEWPORT.width || canvas.h !== VIEWPORT.height) stop(`the canvas is not the frame: ${JSON.stringify(canvas)}`);
    // The HUD is out of the frame: every shelf the page has is put away (the cookie's doing, and the storage's).
    if (!world.shelves.length || world.shelves.some((shelf) => shelf !== "in")) stop(`the HUD's shelves are not put away (${world.shelves.join(", ") || "the page has none"}): its panels would be in the frame`);
    // The world heard what the job asked of it: a world from before a hook, or a pose it does not take, would count something else.
    if (world.show !== day.show) stop(`the page plays ${world.show}, and the windows are ${day.show}'s`);
    if (job.still && world.still !== true) stop("still=1 was asked, and this world does not know ?still=1");
    if (job.pose !== "home" && (job.pose.includes(",") ? world.mode !== "walk" : world.mode === "descent")) stop(`pose=${job.pose} was asked, and the world opened in the mode "${world.mode}": it does not take the pose`);
    if (world.rung !== job.rung) stop(`rung=${job.rung} was asked, and the world stands at rung ${world.rung}: its ladder ends there, or it does not know ?rung=`);
    // Which world this is: every module the page was served.
    const served = await Promise.all(modules.values());
    if (!served.some(([name]) => name === "main.js")) stop("the page was served no /world/main.js to tell its world by");

    // The world's first second, the show at its start and paused, then the cue SETTLE_S before the window, playing. The frames up to
    // the lead-in are run and not looked at; the clock and the world's own count of frames must both have kept step through them.
    const before = await readClock(page);
    await page.evaluate((n) => window.__stepper.step(n), WARM_FRAMES);
    await cue(page, win.track, win.from - SETTLE_S);
    const settleFrames = SETTLE_S * FPS - 1 - LEAD;
    for (let done = 0; done < settleFrames;) { const n = Math.min(60, settleFrames - done); await page.evaluate((k) => window.__stepper.step(k), n); done += n; }
    let last = await readClock(page);
    const stepped = WARM_FRAMES + settleFrames;
    if (last.steps - before.steps !== stepped || Math.abs(last.now - before.now - stepped * FRAME_MS) > CLOCK_SLACK) stop(`${stepped} frames were stepped before the window, and the virtual clock moved ${last.steps - before.steps} steps and ${last.now - before.now} ms`);
    if (last.frames - before.frames !== stepped) stop(`${stepped} frames were stepped before the window, and the world drew ${last.frames - before.frames}`);

    // Every plate drawn at any frame is masked: these, and any a frame adds. The 2x2 count masks a plate's blocks through the whole run;
    // the WCAG count masks its pixels from the frame it is first drawn on, since it counts each frame's fields as the frames arrive.
    const plates = new Map((await readPlates(page)).map((p) => [plateKey(p), p]));
    wcag.mask(platesPixelMask([...plates.values()], FRAME.width, FRAME.height, DPR, PAD));
    // Points the canvas's own pixels are read at, to check each screenshot against the frame just drawn: a grid, clear of the plates.
    // Only where the canvas's buffer is the screen's own pixels: a frame drawn at another size and scaled to the screen cannot be
    // checked so, which is every job on the phone's tier or the TV's and every rung of 1 or more.
    const evenW = FRAME.width / 2, even = platesMask([...plates.values()], evenW, FRAME.height / 2, DPR, PAD);
    const points = [];
    if (canvas.bufferW === FRAME.width && canvas.bufferH === FRAME.height) {
      for (let y = 9; y < FRAME.height; y += 26) for (let x = 11; x < FRAME.width; x += 38) if (!even[Math.floor(y / 2) * evenW + Math.floor(x / 2)]) points.push([x, y]);
    } else {
      console.warn(`WARNING ${tag}: no frame of this job is checked against the canvas: the world draws at ${canvas.bufferW}x${canvas.bufferH} and the screen shows it at ${FRAME.width}x${FRAME.height}. ` +
        "A screenshot that showed the frame before would not be caught.");
    }

    const check = { checked: 0, unchecked: 0, worst: 0 };
    // Where the visitor stands: a pose of four numbers is held to what was asked, and any other but the page's own opening to where
    // it stood at the first frame, since a count from a camera that moved is a count of motion.
    const asked = job.pose.includes(",") ? job.pose.split(",").map(Number) : null;
    let stand = asked && { x: asked[0], z: asked[1], heading: asked[2], pitch: asked[3] };
    // Whether the pose was held to its place through the count: not asked of the page's own opening, and not possible where the world
    // does not say where the visitor stands, which is a world from before window.__hill.walker.
    let poseHeld = job.pose === "home" ? null : true;
    for (let f = -LEAD; f < nFrames; f++) {
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
        return { px, now: window.__stepper.now(), frames: h.frames, rung: h.rung, state: document.querySelector("main").dataset.state, walker: h.walker ?? null, plates: window.__plates() };
      }), points);
      // One frame, a sixtieth of a second after the last, on the clock and in the world.
      if (Math.abs(read.now - last.now - FRAME_MS) > CLOCK_SLACK) stop(`frame ${f}: the virtual clock moved ${read.now - last.now} ms, not ${FRAME_MS}`);
      if (read.frames !== last.frames + 1) stop(`frame ${f}: the world drew ${read.frames - last.frames} frames, not one`);
      last = read;
      if (read.rung !== job.rung || read.state !== "playing") stop(`frame ${f}: rung ${read.rung}, state ${read.state}`);
      if (errors.length) stop(`frame ${f}: the page reported an error: ${errors[0]}`);
      if (job.pose !== "home") {
        if (asked && !read.walker) stop("a pose of four numbers was asked, and this world does not say where the visitor stands (window.__hill.walker)");
        if (!read.walker && poseHeld) {
          poseHeld = false;
          console.warn(`WARNING ${tag}: nothing checks that the visitor stood still at pose=${job.pose} through this count: the world does not say where they stand (it is from before window.__hill.walker).`);
        }
        stand ??= read.walker;
        const w = read.walker;
        if (w && (Math.hypot(w.x - stand.x, w.z - stand.z) > STAND_SLACK || Math.abs(w.heading - stand.heading) > LOOK_SLACK || Math.abs(w.pitch - stand.pitch) > LOOK_SLACK)) {
          stop(`frame ${f}: the visitor stands at ${w.x},${w.z},${w.heading},${w.pitch}, not ${stand.x},${stand.z},${stand.heading},${stand.pitch}${asked ? " as asked" : " as at the first frame"}: the walk's limits moved them (the island's edge, the stage, a bear)`);
        }
      }
      for (const p of read.plates) {
        if (plates.has(plateKey(p))) continue;
        plates.set(plateKey(p), { ...p, fromFrame: f });
        wcag.mask(platesPixelMask([p], FRAME.width, FRAME.height, DPR, PAD));
      }
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }, type: "png" });
      const png = PNG.sync.read(buf);
      if (png.width !== FRAME.width || png.height !== FRAME.height) stop(`screenshot is ${png.width}x${png.height}`);
      const d = png.data;
      if (read.px) {
        let worst = 0;
        for (let i = 0; i < points.length; i++) {
          const o = (points[i][1] * png.width + points[i][0]) * 4;
          worst = Math.max(worst, Math.abs(d[o] - read.px[3 * i]), Math.abs(d[o + 1] - read.px[3 * i + 1]), Math.abs(d[o + 2] - read.px[3 * i + 2]));
        }
        if (worst > SHOT_SLACK) stop(`frame ${f}: the screenshot differs from the canvas by ${worst}/255 at a checked point: it does not show the frame just drawn`);
        check.checked += 1; check.worst = Math.max(check.worst, worst);
      } else check.unchecked += 1;
      // The WCAG count, and with --blocks the relative luminance of each 2x2 block on each grid, from the one screenshot, as it arrives.
      wcag.add(d);
      for (const g of grids) g.count.add((out, base) => blockLuminance(d, FRAME.width, g.bw, g.bh, g.ox, g.oy, out, base));
      if (stills && f >= 0 && (f % 30 === 0 || f === nFrames - 1)) await writeFile(join(stills, `f${String(f).padStart(4, "0")}.png`), buf);
    }
    if (points.length && check.unchecked) console.warn(`WARNING ${tag}: ${check.unchecked} of ${check.checked + check.unchecked} frames could not be read from the canvas and were not checked against it`);
    const platesMasked = [...plates.values()], results = [];
    const flash = wcag.result(), cell = (r) => (r.worst ? `${r.mostInASecond} (strict ${r.mostInASecondStrict}) transitions in a second, ${r.flashes} flashes, at the field at (${r.worst.x}, ${r.worst.y}) from frame ${r.worst.runStartsAtFrame}` : "no transition");
    const share = (r) => (r.largest ? `${Math.round(r.largest.share * 1000) / 10} % of a field at once at most, at (${r.largest.x}, ${r.largest.y}), frame ${r.largest.frame}` : "nothing changed by a threshold");
    console.log(`${tag}, WCAG: ${flash.pass ? "passes" : "OVER THE BAR"}; general: ${cell(flash.general)}, ${share(flash.general)}; red: ${cell(flash.red)}, ${share(flash.red)}; ` +
      `field ${flash.field.width}x${flash.field.height} px (${flash.field.width / DPR}x${flash.field.height / DPR} CSS px); ${flash.maskedPixels} px masked`);
    for (const g of grids) {
      const mask = platesMask(platesMasked, g.bw, g.bh, DPR, PAD);
      const { maps, ...rest } = g.count.result(mask);
      if (config.heat) {
        await writeFile(join(config.runDir, `${tag}-g${g.ox}${g.oy}-most-in-a-second.png`), heat(PNG, maps.perBlock, mask, 6, g.bw, g.bh));
        await writeFile(join(config.runDir, `${tag}-g${g.ox}${g.oy}-range.png`), heat(PNG, maps.range, mask, 0.3, g.bw, g.bh));
      }
      // A block's x and y in the result are its place on its own grid, in px: the frame's pixel is that plus the grid's offset.
      results.push({ grid: [g.ox, g.oy], ...rest });
      const w = rest.worst;
      console.log(`${tag}, ${gridName(g.ox, g.oy)}: max ${rest.maxSwingsInASecond} (strict ${rest.maxSwingsInASecondStrict}) swings in a second; blocks >=5: ${rest.blocksAtLeast[5]}; >=1: ${rest.blocksAtLeast[1]}; ` +
        `worst ${w ? `(${w.x}, ${w.y}) from frame ${w.runStartsAtFrame}, range ${w.range}` : "none"}; ${Math.round((100 * rest.unmaskedBlocks) / (g.bw * g.bh))} % counted`);
    }
    const out = {
      tag, job, url, day: config.day, show: day.show, window: win, frame: FRAME, frames: nFrames, leadIn: LEAD, fps: FPS,
      measures: grids.length ? ["wcag", "blocks"] : ["wcag"], wcag: { ...flash, field: { ...flash.field, css: [flash.field.width / DPR, flash.field.height / DPR] } },
      ...(grids.length ? { threshold: THRESHOLD } : {}),
      world: { hash: worldHash(served), modules: served.length, ...worldFrom(job.variant, config), tier: world.tier, scale: world.scale, renderer: world.renderer, bufferW: canvas.bufferW, bufferH: canvas.bufferH },
      canvasCheck: check, poseHeld, platesMasked, seconds: Math.round((Date.now() - t0) / 1000),
      results,
    };
    await writeFile(join(config.runDir, `${tag}.json`), JSON.stringify(out));
    console.log(`${tag}: frame ${FRAME.width}x${FRAME.height} (buffer ${canvas.bufferW}x${canvas.bufferH}), tier ${world.tier}, rung ${world.rung}, scale ${world.scale}; ${world.renderer}; world ${out.world.hash.slice(0, 12)}; ` +
      `${check.checked} frames checked against the canvas, worst ${check.worst}/255; plates ${platesMasked.length}; ${out.seconds} s`);
    return out;
  } finally {
    await context.close();
  }
}

const USAGE = `usage: node scripts/flash/capture.mjs [--blocks] matrix quick|standard
       node scripts/flash/capture.mjs [--blocks] jobs <file>
       node scripts/flash/capture.mjs [--blocks] one "<variant> <window> [key=value ...]"
--blocks counts the swings at each 2x2 block too, the bar before 2026-11-27, from the same frames.`;
const argv = process.argv.slice(2), blocks = argv.includes("--blocks");
const [command, ...rest] = argv.filter((arg) => arg !== "--blocks");
if (!["matrix", "jobs", "one"].includes(command) || !rest.length || rest.some((arg) => arg.startsWith("--"))) {
  console.error(USAGE);
  process.exit(2);
}
// The settings and the jobs, read before a browser is launched: a setting or a job line that is wrong stops the run here, by name.
let config, day, jobs;
try {
  config = readConfig(process.env);
  day = windowsFor(config.day);
  const text = command === "matrix" ? matrixJobs(rest[0]).join("\n") : command === "jobs" ? await readFile(rest[0], "utf8") : rest.join(" ");
  jobs = parseJobs(text, day.windows, { blocks });
  const tags = jobs.map(tagOf);
  const twice = tags.find((tag, k) => tags.indexOf(tag) !== k);
  if (twice) throw new Error(`the job ${twice} is there twice`);
  if (!jobs.length) throw new Error("no job to run");
  // Main's world is read at one commit through the run, whatever a fetch does to the ref meanwhile.
  if (jobs.some((job) => job.variant === "main")) config.mainCommit = mainSha(config.mainRef);
  config.runDir = join(config.outDir, runFolder(new Date(), command, rest[0]));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
// The run's own folder: made new, so a folder that is there already (a run of the same second) stops the run.
await mkdir(config.outDir, { recursive: true });
await mkdir(config.runDir);
console.log(`${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${config.parallel} at a time, counted by WCAG's thresholds${blocks ? " and the 2x2 blocks" : ""}, at ${config.siteUrl}/${config.day}; results in ${config.runDir}`);
const { chromium, PNG } = loadPlaywright();
const browser = await launch(chromium, config.gpu);
const done = [], failures = [];
try {
  let next = 0;
  await Promise.all(Array.from({ length: config.parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { done.push(await run(browser, PNG, config, day, job)); } catch (e) { failures.push(`${tagOf(job)}: ${e.message}`); console.log(`FAILED ${tagOf(job)}: ${e.stack}`); }
    }
  }));
} finally {
  await browser.close();
}
// The run's table, as table.mjs prints it from the run's folder.
if (done.length) {
  try {
    const { markdown, worlds, warnings } = tables(done);
    console.log(`\n${markdown}\n\n${worlds.join("; ")}`);
    for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  } catch (e) {
    console.warn(`WARNING: no table: ${e.message}`);
  }
}
// The jobs over WCAG's bar: more than 3 general flashes, or 3 red, in a second in a field.
const over = done.filter((j) => !j.wcag.pass);
if (over.length) console.log(`${over.length} of ${done.length} jobs are OVER WCAG's bar of ${MOST / 2} flashes in a second: ${over.map((j) => j.tag).join(", ")}`);
else if (done.length) console.log(`${done.length} of ${done.length} jobs pass WCAG's bar of ${MOST / 2} flashes in a second`);
if (failures.length) {
  console.log(`${failures.length} of ${jobs.length} jobs FAILED and wrote no result:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
console.log(`results in ${config.runDir}`);
