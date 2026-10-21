/* eslint-disable */
import * as THREE from "three";
import { height, buildIsland } from "./island.js";
import { buildPath, placeLandmarks } from "./path.js";
import { makeBuilders } from "./landmarks.js";
import { buildBears } from "./bears.js";
import { buildSky } from "./sky.js";
import { bindInput } from "./input.js";
import { ensureContext } from "./audio.js";
import { budgetFor, median, pickTier, SLOW_MS, stepDown, WINDOW } from "./quality.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, under a sky of liquid light.
   The setlist is the path; each song is a landmark; five bears walk it ahead of the listener. */

const container = document.getElementById("world");
const main = document.querySelector("main");
const data = JSON.parse(document.getElementById("world-data").textContent);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tier = pickTier();
const budget = budgetFor(tier);
const hasShow = data.tracks.length > 0;
/* Without a recording the clock still sums over one stand-in track; it never shapes the path or places a landmark. */
const tracks = hasShow ? data.tracks : [{ title: "Set", duration: 600 }];
const N = tracks.length;
/* Where each track starts in the show, in seconds, and the show's length. */
const starts = [];
let total = 0;
for (const t of tracks) { starts.push(total); total += t.duration; }

const canvas = document.createElement("canvas");
/* If the page gave up waiting for this module, the still stays and nothing starts. */
if (container.dataset.world !== "fallback") {
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "low-power", alpha: false });
  if (!gl) {
    container.dataset.world = "fallback";
    document.dispatchEvent(new CustomEvent("world:ready", { detail: { webgl: false, tier, scale: 0 } }));
  } else {
    container.appendChild(canvas);
    start(gl);
  }
}

function start(gl) {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(budget.pixelRatio);
  /* What the world renders at now: the tier's rung 0, until a slow device steps it down. */
  let quality = { scale: budget.scale, shadows: false, octaves: budget.octaves, bears: budget.bears, stageLight: false };
  let rung = 0;
  /* Under reduced motion there is no loop: one frame for each input or state change, always at rung 0. */
  let pending = 0;
  function requestRender() {
    if (!reduced || pending) return;
    pending = requestAnimationFrame((now) => { pending = 0; frame(now); });
  }
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x141418, 80, 320);
  const camera = new THREE.PerspectiveCamera(budget.fov, 1, 0.5, 900);

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(Math.round(w * quality.scale), Math.round(h * quality.scale), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  resize();
  new ResizeObserver(resize).observe(container);

  /* ---------- the island ---------- */
  buildIsland(scene, budget.grid);

  /* ---------- the path and the landmarks ---------- */
  const path = buildPath(N);
  const { points, curve, curveLength, at, tangentAt } = path;
  const builders = makeBuilders(tier === "phone", budget.flameLight);
  const { moving } = builders;
  placeLandmarks(scene, path, tracks, N, hasShow, builders);

  /* ---------- the bears ---------- */
  const bears = buildBears(scene, budget.bears);

  /* ---------- the sky ---------- */
  const { skyMat, hemi } = buildSky(scene, budget.octaves, data.seed);

  /* ---------- the show clock ---------- */
  /* The audio element owns the clock: the world keeps the player's last report (sent on each timeupdate, on play and on pause)
     and runs on from it while the show plays. */
  let playing = false, showPos = 0, index = 0, frac = 0;
  let clock = { index: 0, position: 0, duration: tracks[0].duration, at: performance.now() };
  document.addEventListener("player:now", (e) => { clock = e.detail; });
  document.addEventListener("player:track", requestRender);
  function locate(now) {
    const i = Math.max(0, Math.min(N - 1, clock.index));
    const d = clock.duration > 0 ? clock.duration : tracks[i].duration;
    const pos = Math.min(d, clock.position + (playing ? (now - clock.at) / 1000 : 0));
    index = i; frac = d > 0 ? pos / d : 0; showPos = starts[i] + pos;
  }
  /* The first move creates the AudioContext inside its own event. */
  document.addEventListener("player:start", ensureContext);
  const energyOf = (i) => {
    const t = tracks[i].title.toLowerCase();
    if (t.includes("tuning")) return 0.2; if (t.includes("drums")) return 0.9; if (t.includes("space")) return 0.3;
    if (i === N - 1) return 0.8; return i < Math.floor(N * 0.37) ? 0.5 : 0.7;
  };
  const C = (h) => new THREE.Color(h);
  const STOPS_A = [C(0xe8b04b), C(0xd6508a), C(0x9a80c0)], STOPS_B = [C(0xd6508a), C(0x2ea3a0), C(0xe8b04b)];
  const stopAt = (stops, f) => f < 0.5 ? stops[0].clone().lerp(stops[1], f / 0.5) : stops[1].clone().lerp(stops[2], (f - 0.5) / 0.5);
  let energy = 0.5;
  let rnd = (() => { let s = data.seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  let nextDrop = 40 + rnd() * 20, dropAt = -99;

  /* ---------- the camera: walker, attract, descent, drift ---------- */
  const walker = { x: points[0].x, z: points[0].z, heading: 0 };
  const t0 = tangentAt(0); walker.heading = Math.atan2(-t0.x, -t0.z);
  let mode = reduced ? "walk" : "descent";
  let attractU = 0, driftU = 0, idleTimer = 0, elapsed = 0;
  /* The attract walk and the drift start this far behind the last bear, so the five walk ahead in view. */
  const TRAIL = (4 * 2.6 + 14) / curveLength;
  /* The attract camera: beside the path at a little above head height, looking 30 m up the path. */
  function attractPose(u) {
    const p = at(u), tg = tangentAt(u);
    const side = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0)).normalize();
    const x = p.x + side.x * 2.5, z = p.z + side.z * 2.5;
    const ahead = at(u + 30 / curveLength);
    return { pos: new THREE.Vector3(x, height(x, z) + 4.5, z), look: new THREE.Vector3(ahead.x, ahead.y + 6, ahead.z) };
  }
  const forward = () => new THREE.Vector3(-Math.sin(walker.heading), 0, -Math.cos(walker.heading));
  function userInput() {
    if (mode !== "drift") mode = "walk";
    idleTimer = 0;
    requestRender();
  }
  const input = bindInput(container, walker, userInput);
  const { keys } = input;
  /* Lean-back and the player's state live on <main>; read them now too, since the show may have started before the world loaded. */
  function syncMain() {
    const lean = main.dataset.mode === "leanback";
    playing = main.dataset.state === "playing";
    if (lean && mode !== "drift") { mode = "drift"; driftU = (index + frac) / N - TRAIL; }
    if (!lean && mode === "drift") { mode = "walk"; idleTimer = 0; }
    requestRender();
  }
  new MutationObserver(syncMain).observe(main, { attributes: true, attributeFilter: ["data-mode", "data-state"] });
  syncMain();

  const lookTarget = new THREE.Vector3();
  const easeOut = (x) => { const t = Math.max(0, Math.min(1, x)); return 1 - (1 - t) * (1 - t) * (1 - t); };
  const up = new THREE.Vector3(0, 1, 0);

  function placeWalker() {
    const y = height(walker.x, walker.z) + 3.2;
    camera.position.set(walker.x, y, walker.z);
    lookTarget.copy(camera.position).add(forward());
    camera.lookAt(lookTarget);
  }

  /* The downgrade: every WINDOW frames the median frame time decides; over SLOW_MS, one rung down (quality.js). */
  const frameTimes = [];
  let frames = 0, frameMs = 0, calls = 0, triangles = 0;
  function sample(dtMs) {
    frameTimes.push(dtMs);
    if (frameTimes.length < WINDOW) return;
    frameMs = median(frameTimes);
    frameTimes.length = 0;
    if (frameMs <= SLOW_MS) return;
    const next = stepDown(quality);
    if (!next) return;
    quality = next;
    rung += 1;
    applyQuality();
  }
  function applyQuality() {
    resize();
    skyMat.uniforms.uOct.value = quality.octaves;
    bears.forEach((b, k) => { b.g.visible = k < quality.bears; });
  }
  /* The stats the CI shoot script logs after every shot. Merged into window.__hill, which the player also writes. */
  function publishStats() {
    window.__hill = Object.assign(window.__hill ?? {}, { tier, scale: quality.scale, rung, calls, triangles, frameMs: Math.round(frameMs * 10) / 10, frames });
  }

  let last = performance.now();
  let raf = 0;
  function frame(now) {
    if (!reduced) raf = requestAnimationFrame(frame);
    const dtMs = now - last;
    const dt = Math.min(0.05, dtMs / 1000);
    last = now;
    elapsed += dt;
    if (!reduced) sample(dtMs);

    /* The show. */
    locate(now);
    const targetEnergy = energyOf(index);
    /* State changes blend over about eight seconds; under reduced motion they land at once. */
    const blend = reduced ? 1 : Math.min(1, dt * 0.12);
    energy += (targetEnergy - energy) * blend;
    const f = total > 0 ? showPos / total : 0;
    skyMat.uniforms.uEnergy.value = energy;
    skyMat.uniforms.uC0.value.lerp(stopAt(STOPS_A, f), blend);
    skyMat.uniforms.uC1.value.lerp(stopAt(STOPS_B, f), blend);
    skyMat.uniforms.uC2.value.copy(skyMat.uniforms.uC0.value).lerp(skyMat.uniforms.uPage.value, 0.7);
    hemi.color.copy(skyMat.uniforms.uC0.value).lerp(new THREE.Color(0xffffff), 0.3);
    if (!reduced) {
      skyMat.uniforms.uTime.value = elapsed;
      if (elapsed >= nextDrop) { dropAt = elapsed; skyMat.uniforms.uDrop.value.set(0.2 + rnd() * 0.6, 0.3 + rnd() * 0.5, 0); nextDrop = elapsed + 40 + rnd() * 20; }
      skyMat.uniforms.uDrop.value.z = elapsed - dropAt;
      for (const m of moving) { if (m.kind === "spin") m.obj.rotation.y += dt * 0.3; else m.obj.position.y = 4 + 0.5 * Math.sin(elapsed * 1.5); }
    } else {
      skyMat.uniforms.uTime.value = data.seed;
    }

    /* The bears walk from this song's landmark to the next at the song's pace, in a line, and stand between songs. */
    const uLead = (index + frac) / N;
    for (let k = 0; k < bears.length; k++) {
      const b = bears[k];
      const u = uLead - k * (2.6 / curveLength);
      const p = at(u), tg = tangentAt(u);
      b.g.position.set(p.x, p.y, p.z);
      b.g.rotation.y = Math.atan2(tg.x, tg.z);
      const swing = (playing && !reduced) ? Math.sin(elapsed * 6 + b.phase) * 0.5 : 0;
      b.legs[0].rotation.x = swing; b.legs[3].rotation.x = swing; b.legs[1].rotation.x = -swing; b.legs[2].rotation.x = -swing;
    }

    /* The camera. */
    const moving_ = keys.fwd || keys.back || keys.strafeL || keys.strafeR || input.dragSpeed !== 0;
    if (mode === "walk") {
      const spd = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0) + input.dragSpeed;
      const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
      const side = (keys.strafeR ? 1 : 0) - (keys.strafeL ? 1 : 0);
      const pace = 12 * (keys.run ? 1.6 : 1) * dt;
      walker.heading += turn * 1.6 * dt;
      const fw = forward();
      walker.x += (fw.x * spd - fw.z * side) * pace; walker.z += (fw.z * spd + fw.x * side) * pace;
      const d = Math.hypot(walker.x, walker.z);
      if (d > 108) { walker.x *= 108 / d; walker.z *= 108 / d; }
      placeWalker();
      if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      if (!reduced) { idleTimer += dt; if (idleTimer > 15) { mode = "attract"; attractU = nearestU(walker.x, walker.z); } }
    } else if (mode === "descent") {
      /* From above the summit, where the island reads as the mark, north up the screen, down to the attract walk's first pose. */
      const k = easeOut(elapsed / 6);
      const end = attractPose(-TRAIL);
      camera.position.set(end.pos.x * k, 140 + (end.pos.y - 140) * k, end.pos.z * k);
      lookTarget.set(end.look.x * k, end.look.y * k, -3 + (end.look.z + 3) * k);
      camera.lookAt(lookTarget);
      if (elapsed >= 6) { mode = "attract"; attractU = -TRAIL; }
    } else if (mode === "attract") {
      attractU += (6 / curveLength) * dt;
      const pose = attractPose(attractU);
      camera.position.copy(pose.pos);
      camera.lookAt(pose.look);
      walker.x = pose.pos.x; walker.z = pose.pos.z; const tg = tangentAt(attractU); walker.heading = Math.atan2(-tg.x, -tg.z);
    } else if (mode === "drift") {
      if (reduced) {
        const p0 = at(0);
        camera.position.set(0, height(0, 0) + 8, 0);
        camera.lookAt(p0.x, p0.y, p0.z);
      } else {
        /* A slow crane along the path, high above the bears, whether or not the show is playing. */
        driftU += (2.5 / curveLength) * dt;
        const p = at(driftU), tg = tangentAt(driftU);
        const side = new THREE.Vector3().crossVectors(tg, up).normalize();
        const sway = 2 * Math.sin((elapsed * Math.PI * 2) / 30);
        const x = p.x + side.x * sway, z = p.z + side.z * sway;
        camera.position.set(x, height(x, z) + 9, z);
        const ahead = at(driftU + 28 / curveLength);
        camera.lookAt(ahead.x, ahead.y + 8, ahead.z);
      }
    }

    renderer.render(scene, camera);
    frames += 1; calls = renderer.info.render.calls; triangles = renderer.info.render.triangles;
  }
  function nearestU(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 200; i++) { const p = curve.getPointAt(i / 200); const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i / 200; } }
    return best;
  }

  container.dataset.world = "ready";
  document.dispatchEvent(new CustomEvent("world:ready", { detail: { webgl: true, tier, scale: quality.scale } }));
  locate(performance.now()); placeWalker();
  raf = requestAnimationFrame(frame);
  publishStats();
  setInterval(publishStats, 1000);
  /* A hidden tab stops the loop; a visible one restarts it from the present moment (under reduced motion, draws one frame). */
  document.addEventListener("visibilitychange", () => {
    if (reduced) { if (!document.hidden) requestRender(); return; }
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (raf === 0) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
}
