/* eslint-disable */
import * as THREE from "three";
import { height, buildIsland } from "./island.js";
import { buildPath, layout, placeLandmarks, buildSegues, buildWalkLine } from "./path.js";
import { makeBuilders } from "./landmarks.js";
import { buildBears } from "./bears.js";
import { buildAvatar } from "./avatar.js";
import { buildSky, skyPair } from "./sky.js";
import { bindInput } from "./input.js";
import { keepOut } from "./collide.js";
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
const phone = tier === "phone";
const hasShow = data.tracks.length > 0;
/* Without a recording the clock still sums over one stand-in track; it never shapes the path or places a landmark. */
const tracks = hasShow ? data.tracks : [{ title: "Set", duration: 600 }];
const N = tracks.length;
/* Where set 2 and the encore begin, from the notes; null where they do not say. */
const set2Start = hasShow ? data.set2Start ?? null : null, encoreStart = hasShow ? data.encoreStart ?? null : null;
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
  /* The loop: each frame queues the next. Under reduced motion it runs on only while a control that acts over time is held, and
     each input or state change wakes it for a frame, always at rung 0. A hidden tab's loop sleeps until the tab shows again. */
  let last = performance.now(), raf = 0;
  function wake() {
    if (raf || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x141418, 80, 320);
  const camera = new THREE.PerspectiveCamera(budget.fov, 1, 0.5, 900);
  /* The frame's height, and the now-plate's top edge in it (px from the top; 0.62 of the height without a player): on a phone the
     camera keeps the visitor's bear above the plate. Measured on a resize and when the plate moves (the join, lean-back). */
  let frameH = 1, plateTop = 0;
  function measurePlate() {
    const plate = document.querySelector("[data-action='play']")?.closest(".plate");
    plateTop = plate ? plate.getBoundingClientRect().top - container.getBoundingClientRect().top : 0.62 * frameH;
  }

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    frameH = h;
    measurePlate();
    renderer.setSize(Math.round(w * quality.scale), Math.round(h * quality.scale), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wake();
  }
  resize();
  new ResizeObserver(resize).observe(container);

  /* ---------- the island ---------- */
  const { caves } = buildIsland(scene, budget.grid, phone);

  /* ---------- the path and the landmarks ---------- */
  const path = buildPath();
  const { at, tangentAt } = path;
  const landmarkU = layout(tracks, set2Start, path);
  const builders = makeBuilders(phone);
  const { moving } = builders;
  const landmarks = placeLandmarks(scene, path, tracks, hasShow, builders, landmarkU);
  if (hasShow) buildSegues(scene, path, tracks, landmarkU);

  /* ---------- the bears ---------- */
  const bears = buildBears(scene, budget.bears);

  /* ---------- the visitor's bear ---------- */
  const avatar = buildAvatar(scene, landmarks, { phone, reduced });

  /* ---------- the sky ---------- */
  const { skyMat, hemi } = buildSky(scene, budget.octaves, data.seed);

  /* ---------- the beam ---------- */
  /* The song that plays stands in a soft column of light, so the show's progress reads from anywhere on the island. */
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 36, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8b04b, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.visible = hasShow;
  scene.add(beam);

  /* ---------- the show clock ---------- */
  /* The audio element owns the clock: the world keeps the player's last report (sent on each timeupdate, on play and on pause)
     and runs on from it while the show plays. */
  let playing = false, showPos = 0, index = 0, frac = 0;
  let clock = { index: 0, position: 0, duration: tracks[0].duration, at: performance.now() };
  document.addEventListener("player:now", (e) => { clock = e.detail; });
  /* A track change reaches the world at once, before its audio plays, so the world shows where the show is while it loads. */
  document.addEventListener("player:track", (e) => {
    const i = Math.max(0, Math.min(N - 1, e.detail.index));
    clock = { index: i, position: 0, duration: tracks[i].duration, at: performance.now() };
    wake();
  });
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
    if (t.includes("tuning") || t.includes("crowd")) return 0.2; if (t.includes("drums")) return 0.9; if (t.includes("space")) return 0.3;
    if (encoreStart !== null && i >= encoreStart) return 0.8;
    if (set2Start !== null) return i >= set2Start ? 0.7 : 0.5;
    /* One list: the last song as the encore and the break at about a third. */
    if (i === N - 1) return 0.8; return i < Math.floor(N * 0.37) ? 0.5 : 0.7;
  };
  let energy = 0.5;
  let rnd = (() => { let s = data.seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  let nextDrop = 40 + rnd() * 20, dropAt = -99;

  /* ---------- the camera: walker, attract, descent, drift ---------- */
  /* The walker is the visitor, seen from behind as their own bear (third person, the default) or through its eyes (first person). The
     page mirrors the setting on <main>; changing it cuts the camera. */
  const trailhead = at(0);
  const walker = { x: trailhead.x, z: trailhead.z, heading: 0, pitch: 0 };
  const t0 = tangentAt(0); walker.heading = Math.atan2(-t0.x, -t0.z);
  let third = true, cut = false;
  let mode = reduced ? "walk" : "descent";
  let idleTimer = 0, elapsed = 0;
  /* The walker's heading when follow began; the look turns away from the lead bear by how far the heading has moved since. */
  let followBase = 0;
  /* The bears walk their own line at a lively pace, five 7 m apart by distance along it. The line keeps 7 m to the left of the path
     so they pass the landmarks rather than walk through them (path.js). */
  const BEAR_GAP = 7, BEAR_SPEED = 2.5;
  /* How near a walk comes to a bear's centre. In first person a bear's snout tip ends 2.4 m ahead of it, and the camera draws nothing
     nearer than 0.5 m. In third person the walker is a bear too, and one bear's snout tip meets another's flank 1.5 m from its centre.
     Neighbours stay at least 5.9 m apart on the line's tightest bend, so the wider reaches overlap there (collide.js). */
  const BEAR_REACH = 2.9, BODY_REACH = 3.9, bearSpots = bears.map((b) => b.g.position);
  const line = buildWalkLine(path, 7);
  /* The walk keeps within this distance of the island's centre: past the bears' line, which reaches 112.4 m out, by more than a reach,
     so stepping back from a bear never carries a walker past it. */
  const BOUND = 117;
  /* How far the lead bear is along its line. Until the show first plays the bears stand where it is; then they set off and keep
     their own pace while it plays. Under reduced motion they stand at the landmark of the song that plays. */
  let bearD = 0, bearsOff = false;
  /* The visitor's place in the line: a sixth bear, one gap behind the last bear shown, facing along the line. */
  const slotD = () => bearD - bears.length * BEAR_GAP;
  function slot() {
    const d = slotD(), p = line.at(d), t = line.tangentAt(d);
    return { x: p.x, z: p.z, heading: Math.atan2(-t.x, -t.z) };
  }
  /* Puts the walker in its place in the line. Every walk starts there: one begun in attract, the descent or lean-back, one that leaves
     follow, and the walk reduced motion opens on. */
  function toSlot() {
    const s = slot();
    walker.x = s.x; walker.z = s.z; walker.heading = s.heading;
  }
  /* The camera that walks with the bears, in follow and attract, its eye 6.5 m up, above their heads; it looks at the lead bear, turned
     by `yaw` and tilted by `pitch`. In third person it stands behind the visitor's bear and to its left, away from the path, along the
     chord from that bear to the lead one, and looks 2 m over the lead bear's head, so all six read; where a climb toward the lead bear
     would sink the visitor's bear, the view turns down first (keepInView). In first person it stands on the line, 6 m behind the last
     bear, and looks 2 m over the lead bear's feet. */
  function postPose(yaw, pitch) {
    const lead = line.at(bearD);
    let x, z;
    if (third) {
      const s = line.at(slotD()), cl = Math.hypot(lead.x - s.x, lead.z - s.z) || 1, cx = (lead.x - s.x) / cl, cz = (lead.z - s.z) / cl;
      const back = phone ? 12 : 8, side = phone ? 3 : 5;
      x = s.x - cx * back + cz * side; z = s.z - cz * back - cx * side;
    } else {
      const p = line.at(bearD - ((bears.length - 1) * BEAR_GAP + 6));
      x = p.x; z = p.z;
    }
    const pos = new THREE.Vector3(x, height(x, z) + 6.5, z);
    const h0 = Math.atan2(-(lead.x - x), -(lead.z - z)), dist = Math.hypot(lead.x - x, lead.z - z);
    let e0 = Math.atan2(lead.y + (third ? 5.6 : 2) - pos.y, dist);
    if (third) e0 -= keepInView(pos, new THREE.Vector3(x - Math.sin(h0) * dist, pos.y + Math.tan(e0) * dist, z - Math.cos(h0) * dist));
    const h = h0 + yaw, e = Math.max(-1.3, Math.min(1.3, e0 + pitch));
    return { pos, look: new THREE.Vector3(x - Math.sin(h) * dist, pos.y + Math.tan(e) * dist, z - Math.cos(h) * dist) };
  }
  /* Where the visitor's feet stand on a phone: 24 px above the now-plate, as a share of the frame's height from -1 to 1. */
  const plateY = () => 1 - (2 * (plateTop - 24)) / frameH;
  /* How far a third-person view from `from` toward `look` turns down to keep the visitor's bear in the frame: on a phone until its feet
     stand above the now-plate, at most 0.45 rad, which still keeps the lead bear below the top plates; elsewhere until the top of its
     head stands 36 % up the frame, at most 0.3 rad. */
  const keepInView = (from, look) => phone ? avatar.turnDown(camera, from, look, avatar.feet, plateY(), 0.45) : avatar.turnDown(camera, from, look, avatar.top, -0.28);
  const forward = () => new THREE.Vector3(-Math.sin(walker.heading), 0, -Math.cos(walker.heading));
  /* Changes the camera's mode and tells the page. A walk starts in the visitor's place in the line; entering follow frames the bears
     again, level. */
  function setMode(m) {
    if (m === mode) return;
    if (m === "walk") toSlot();
    if (m === "follow") { followBase = walker.heading; walker.pitch = 0; }
    mode = m;
    document.dispatchEvent(new CustomEvent("world:mode", { detail: { mode } }));
  }
  /* The controls that only look around, so they keep walking with the bears. */
  const LOOKS = new Set(["left", "right", "lookUp", "lookDown", "drag"]);
  /* Any input resets the idle timer. B (or the button) toggles walking with the bears; in follow, turning, looking up or down and
     dragging only look around, and any step leaves it for a walk. Lean-back ignores the controls. */
  function userInput(action) {
    idleTimer = 0;
    if (mode === "drift") return;
    wake();
    if (action === "follow") { setMode(mode === "follow" ? "walk" : "follow"); return; }
    if (mode === "follow" && LOOKS.has(action)) return;
    setMode("walk");
  }
  document.addEventListener("world:follow", () => userInput("follow"));
  const input = bindInput(container, walker, userInput);
  const { keys } = input;
  /* Whether a control that acts over time is held: a key or the pad that walks, turns or looks. */
  const held = () => keys.fwd || keys.back || keys.left || keys.right || keys.strafeL || keys.strafeR || keys.lookUp || keys.lookDown;
  /* Lean-back, the player's state and the view live on <main>; read them now too, since the show may have started before the world
     loaded. The join and lean-back move the now-plate. */
  function syncMain() {
    const lean = main.dataset.mode === "leanback";
    playing = main.dataset.state === "playing";
    const t = main.dataset.view !== "first";
    if (t !== third) { third = t; cut = true; }
    avatar.g.visible = third;
    measurePlate();
    if (lean && mode !== "drift") setMode("drift");
    if (!lean && mode === "drift") { setMode("walk"); idleTimer = 0; }
    wake();
  }
  new MutationObserver(syncMain).observe(main, { attributes: true, attributeFilter: ["data-mode", "data-state", "data-view", "data-joined"] });
  syncMain();

  const lookTarget = new THREE.Vector3();
  const easeOut = (x) => { const t = Math.max(0, Math.min(1, x)); return 1 - (1 - t) * (1 - t) * (1 - t); };
  const up = new THREE.Vector3(0, 1, 0);

  function placeWalker() {
    const y = height(walker.x, walker.z) + 3.2;
    camera.position.set(walker.x, y, walker.z);
    const fw = forward(), c = Math.cos(walker.pitch);
    lookTarget.set(walker.x + fw.x * c, y + Math.sin(walker.pitch), walker.z + fw.z * c);
    camera.lookAt(lookTarget);
  }
  /* Points the camera at `look`. On a phone in third person the view first turns down until the visitor's bear stands above the
     now-plate, in every mode; the camera that walks with the bears (`post`) has done so in postPose, before the visitor's own turns. */
  function aim(look, post = false) {
    if (phone && third && !post) avatar.tilt(camera, look, avatar.feet, plateY());
    camera.lookAt(look);
  }

  /* The downgrade: every WINDOW frames the median frame time decides; over SLOW_MS, one rung down (quality.js). */
  const frameTimes = [];
  let frameMs = 0;
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
    /* The downgrade never steps back up, so the bears it drops leave the scene, and all that reads `bears` sees only the rest. */
    for (const b of bears.splice(quality.bears)) scene.remove(b.g);
    bearSpots.length = bears.length;
  }
  /* The stats the CI shoot script logs after every shot and ?stats=1 shows, read live. They are defined on window.__hill, which the
     player also writes, so its fields stay. */
  const stat = (get) => ({ get, enumerable: true, configurable: true });
  Object.defineProperties((window.__hill ??= {}), {
    tier: stat(() => tier), scale: stat(() => quality.scale), rung: stat(() => rung),
    calls: stat(() => renderer.info.render.calls), triangles: stat(() => renderer.info.render.triangles),
    frameMs: stat(() => Math.round(frameMs * 10) / 10), frames: stat(() => renderer.info.render.frame),
    /* The view, whether the visitor's bear is drawn, whether its feet land in the frame (and above the now-plate on a phone), and where
       its head lands, as fractions from the top-left. */
    avatar: stat(() => ({ view: third ? "third" : "first", shown: avatar.g.visible,
      ...(third ? avatar.report(camera, phone ? plateTop / frameH : null) : { clear: false, screen: null }) })),
  });

  function frame(now) {
    raf = !reduced || held() ? requestAnimationFrame(frame) : 0;
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
    const [c0, c1] = skyPair(index, f, set2Start, encoreStart);
    skyMat.uniforms.uEnergy.value = energy;
    skyMat.uniforms.uC0.value.lerp(c0, blend);
    skyMat.uniforms.uC1.value.lerp(c1, blend);
    skyMat.uniforms.uC2.value.copy(skyMat.uniforms.uC0.value).lerp(skyMat.uniforms.uPage.value, 0.7);
    hemi.color.copy(skyMat.uniforms.uC0.value).lerp(new THREE.Color(0xffffff), 0.3);
    if (!reduced) {
      skyMat.uniforms.uTime.value = elapsed;
      if (elapsed >= nextDrop) { dropAt = elapsed; skyMat.uniforms.uDrop.value.set(0.2 + rnd() * 0.6, 0.3 + rnd() * 0.5, 0); nextDrop = elapsed + 40 + rnd() * 20; }
      skyMat.uniforms.uDrop.value.z = elapsed - dropAt;
      for (const m of moving) {
        if (m.kind === "spin") m.obj.rotation.y += dt * 0.3;
        else if (m.kind === "pulse") m.obj.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(elapsed * 3);
        else if (m.kind === "bob") m.obj.position.y = 4 + 0.5 * Math.sin(elapsed * 1.5);
      }
    } else {
      skyMat.uniforms.uTime.value = data.seed;
    }

    /* Drums lights the left cave and Space the right, over eight seconds; under reduced motion at once. */
    const title = tracks[index].title;
    for (const [k, c] of caves.entries()) {
      const target = hasShow && (k === 0 ? /drums/i : /space/i).test(title) ? 1 : 0;
      c.level = reduced ? target : target > c.level ? Math.min(target, c.level + dt / 8) : Math.max(target, c.level - dt / 8);
      c.disc.visible = c.level > 0;
      c.disc.material.opacity = 0.9 * c.level;
      c.disc.material.color.copy(c1);
      if (c.light) { c.light.intensity = 30 * c.level; c.light.color.copy(c1); }
    }

    /* The beam stands on the landmark of the song that plays. */
    const lp = at(landmarkU[index]);
    beam.position.set(lp.x, lp.y + 18, lp.z);

    /* The bears. Before the show first plays they stand where it is; in the frame it starts they walk on from there, so nothing steps. */
    if (reduced) bearD = line.dOf(landmarkU[index]);
    else {
      if (!bearsOff && !playing) bearD = line.dOf(landmarkU[index] + frac * (landmarkU[index + 1] - landmarkU[index]));
      if (playing) { bearsOff = true; bearD += BEAR_SPEED * dt; }
    }
    for (let k = 0; k < bears.length; k++) {
      const b = bears[k];
      const db = bearD - k * BEAR_GAP;
      const p = line.at(db), tg = line.tangentAt(db);
      b.g.position.copy(p);
      b.g.rotation.y = Math.atan2(tg.x, tg.z);
      const swing = (playing && !reduced) ? Math.sin(elapsed * 6 + b.phase) * 0.5 : 0;
      b.legs[0].rotation.x = swing; b.legs[3].rotation.x = swing; b.legs[1].rotation.x = -swing; b.legs[2].rotation.x = -swing;
    }

    /* The camera. T and G (or a vertical drag) look up and down, up to 0.8 rad either way, while walking or with the bears. */
    const tilt = (keys.lookUp ? 1 : 0) - (keys.lookDown ? 1 : 0);
    if (tilt && (mode === "walk" || mode === "follow")) walker.pitch = Math.max(-0.8, Math.min(0.8, walker.pitch + tilt * 1.2 * dt));
    const moving_ = keys.fwd || keys.back || keys.strafeL || keys.strafeR;
    if (mode === "walk") {
      const spd = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
      const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
      const side = (keys.strafeR ? 1 : 0) - (keys.strafeL ? 1 : 0);
      const pace = 12 * (keys.run ? 1.6 : 1) * dt;
      walker.heading += turn * 1.6 * dt;
      const fw = forward();
      walker.x += (fw.x * spd - fw.z * side) * pace; walker.z += (fw.z * spd + fw.x * side) * pace;
      const d = Math.hypot(walker.x, walker.z);
      if (d > BOUND) { walker.x *= BOUND / d; walker.z *= BOUND / d; }
      keepOut(walker, bearSpots, third ? BODY_REACH : BEAR_REACH);
      avatar.step(walker.x, walker.z, walker.heading, dt);
      if (third) aim(lookTarget.copy(avatar.boom(camera, walker, dt, cut)));
      else {
        placeWalker();
        if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      }
      if (!reduced) { idleTimer += dt; if (idleTimer > 15) setMode("attract"); }
    } else {
      /* Every other camera keeps the visitor's bear in its place in the line, walking with the five, and the walker with it; but
         follow's turns keep their own heading. */
      const s = slot();
      if (mode !== "follow") toSlot();
      avatar.step(s.x, s.z, s.heading, dt);
      if (mode === "descent") {
        /* From above the summit, where the island reads as the mark, north up the screen, down to the camera that walks with the bears. */
        const k = easeOut(elapsed / 6);
        const end = postPose(0, 0);
        camera.position.set(end.pos.x * k, 140 + (end.pos.y - 140) * k, end.pos.z * k);
        aim(lookTarget.set(end.look.x * k, end.look.y * k, -3 + (end.look.z + 3) * k), true);
        if (elapsed >= 6) setMode("attract");
      } else if (mode === "attract" || mode === "follow") {
        /* In follow, turning adds an offset to the look. */
        if (mode === "follow") walker.heading += ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * 1.6 * dt;
        const pose = mode === "follow" ? postPose(walker.heading - followBase, walker.pitch) : postPose(0, 0);
        camera.position.copy(pose.pos);
        aim(lookTarget.copy(pose.look), true);
      } else if (mode === "drift") {
        if (reduced) {
          const p0 = at(0);
          camera.position.set(0, height(0, 0) + 8, 0);
          camera.lookAt(lookTarget.set(p0.x, p0.y, p0.z));
        } else {
          /* A slow crane high above the bears, 14 m behind the visitor's bear along their line. */
          const dd = slotD() - 14;
          const p = line.at(dd), tg = line.tangentAt(dd);
          const side = new THREE.Vector3().crossVectors(tg, up).normalize();
          const sway = 2 * Math.sin((elapsed * Math.PI * 2) / 30);
          const x = p.x + side.x * sway, z = p.z + side.z * sway;
          camera.position.set(x, height(x, z) + 9, z);
          const ahead = line.at(dd + 28);
          aim(lookTarget.set(ahead.x, ahead.y + 8, ahead.z));
        }
      }
      avatar.settle(camera.position, lookTarget);
    }
    cut = false;

    renderer.render(scene, camera);
  }

  /* The page reads the tier beside the world's state. */
  container.dataset.tier = tier;
  container.dataset.world = "ready";
  locate(performance.now());
  if (reduced) { bearD = line.dOf(landmarkU[index]); toSlot(); }
  placeWalker();
  wake();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else wake();
  });
}
