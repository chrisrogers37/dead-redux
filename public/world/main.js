/* eslint-disable */
import * as THREE from "three";
import { buildIsland } from "./island.js";
import { height, PATH_POSE, SLOPE_POSE, STAGE_POSE } from "./ground.js";
import { buildPath, layout, placeLandmarks, buildSegues, buildWalkLine } from "./path.js";
import { makeBuilders } from "./landmarks.js";
import { buildBears } from "./bears.js";
import { buildAvatar } from "./avatar.js";
import { buildSky, skyPair } from "./sky.js";
import { bindInput } from "./input.js";
import { keepOut } from "./collide.js";
import { keepSpot } from "./modes.js";
import { cueClock } from "./clock.js";
import { listen, soundStats, startSound } from "./audio.js";
import { buildStage, STAGE_COLUMN, STAGE_REACH, STAGE_SOUND } from "./stage.js";
import { budgetFor, frameSampler, pickTier, stepDown } from "./quality.js";

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
  let quality = { scale: budget.scale, shadows: budget.shadows, octaves: budget.octaves, bears: budget.bears, stageLight: true };
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
  const avatar = buildAvatar(scene, landmarks, { phone, reduced, columns: [STAGE_COLUMN] });

  /* ---------- the sky ---------- */
  const { skyMat, hemi, sun } = buildSky(scene, budget.octaves, data.seed);

  /* ---------- the stage ---------- */
  const stage = buildStage(scene, sun, quality.shadows);
  /* The desktop's one shadow map, the stage's, is drawn once: nothing that casts a shadow moves. */
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

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
  /* A cue reaches the world at once, before its audio plays, so the world shows where the show is while it loads: the bears wait
     at the cued point (clock.js). */
  document.addEventListener("player:track", (e) => {
    clock = cueClock(e.detail, tracks, performance.now());
    wake();
  });
  function locate(now) {
    const i = Math.max(0, Math.min(N - 1, clock.index));
    const d = clock.duration > 0 ? clock.duration : tracks[i].duration;
    const pos = Math.min(d, clock.position + (playing ? (now - clock.at) / 1000 : 0));
    index = i; frac = d > 0 ? pos / d : 0; showPos = starts[i] + pos;
  }
  /* The show sounds from the stage, through the graph the first move makes (audio.js). */
  startSound(STAGE_SOUND, phone);
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
  /* The test hooks ?pose=stage, ?pose=slope and ?pose=path, on preview deployments only (the server marks <main data-test-hooks="1">):
     the walk starts with the visitor on the slope in front of the stage, higher up it, or on the path where it shows the stage
     (ground.js), with no descent, and no idle time hands the view to attract. ?pose=snout stands the walker in front of the lead bear's
     snout looking a little down, and ?pose=pass behind the last bear, a little to its side, facing its way; both start inside the
     bear's reach and are taken again when the view changes, so the walk's keep-out sets each view's distance. */
  const hook = main.dataset.testHooks === "1" ? new URLSearchParams(location.search).get("pose") : null;
  const testPose = hook === "stage" ? STAGE_POSE : hook === "slope" ? SLOPE_POSE : hook === "path" ? PATH_POSE : null;
  const bearHook = hook === "snout" || hook === "pass" ? hook : null;
  let bearPose = bearHook;
  const posed = testPose !== null || bearPose !== null;
  let mode = reduced || posed ? "walk" : "descent";
  let idleTimer = 0, elapsed = 0;
  /* The descent's length, in seconds of world time. A frame adds at most 50 ms to the world's time, so a slow load stretches the
     descent rather than outrunning it. */
  const DESCENT_S = 6;
  /* The walker's heading when follow began; the look turns away from the lead bear by how far the heading has moved since. */
  let followBase = 0;
  /* The bears walk their own line at a lively pace, five 7 m apart by distance along it. The line keeps 7 m to the left of the path
     so they pass the landmarks rather than walk through them (path.js). */
  const BEAR_GAP = 7, BEAR_SPEED = 2.5;
  /* How near a walk comes to a bear's centre, in either view: one bear's snout tip meets another's flank 1.5 m from its centre, and a
     snout tip ends 2.4 m ahead of it. In first person the camera stands where the visitor's bear would, so a bear's snout tip stays 1.5 m
     from the eye, clear of the camera's 0.5 m near plane at any pitch and through the walking bob. Neighbours stay at least 5.9 m apart
     on the line's tightest bend, so the reaches overlap there (collide.js). */
  const BODY_REACH = 3.9, bearSpots = bears.map((b) => b.g.position);
  /* The stage's platform is solid too: a walk stops at its edge, STAGE_REACH from the centre of its column (stage.js). */
  const stageSpot = [STAGE_COLUMN];
  const line = buildWalkLine(path, 7);
  /* The walk keeps within this distance of the island's centre: past the bears' line, which reaches 112.4 m out, by more than a reach,
     so stepping back from a bear never carries a walker past it. */
  const BOUND = 117;
  /* How far the lead bear is along its line. Until the show first plays the bears stand where it is, from the world's first frame
     even if it is already playing; then they set off and keep their own pace while it plays. Under reduced motion they stand at the
     landmark of the song that plays. */
  let bearD = 0, bearsOff = false, bearsPlaced = false;
  /* The visitor's place in the line: a sixth bear, one gap behind the last bear shown, facing along the line. */
  const slotD = () => bearD - bears.length * BEAR_GAP;
  function slot() {
    const d = slotD(), p = line.at(d), t = line.tangentAt(d);
    return { x: p.x, z: p.z, heading: Math.atan2(-t.x, -t.z) };
  }
  /* Puts the walker in its place in the line, where every camera but the walk's and follow's keeps it, and where the walk reduced motion
     opens on. */
  function toSlot() {
    const s = slot();
    walker.x = s.x; walker.z = s.z; walker.heading = s.heading;
  }
  /* A walk starts where the visitor's bear last stood in a walk, or at the nearest spot where a walker may stand if it no longer may
     there, else in its place in the line, as the first walk after the descent does (modes.js). */
  const spot = keepSpot(walker, slot, () => ({ bound: BOUND, stage: STAGE_COLUMN, stageReach: STAGE_REACH, bears: bearSpots,
    bearReach: BODY_REACH }));
  /* The camera that walks with the bears, in follow and attract, its eye above their heads; it looks at the lead bear, turned by `yaw`
     and tilted by `pitch`. In third person it stands behind the visitor's bear and to its left, away from the path, along the chord from
     that bear to the lead one, and looks 2 m over the lead bear's head, so all six read: 16 m behind and 6 m to the left with the eye
     10 m up on a desktop or a TV, which keeps the visitor's bear left of the plates at the lower right; 12 m and 3 m with the eye 6.5 m
     up on a phone. Where a climb toward the lead bear would sink the visitor's bear, the view turns down first (keepInView). In first
     person it stands on the line, 6 m behind the last bear, the eye 6.5 m up, and looks 2 m over the lead bear's feet. */
  function postPose(yaw, pitch) {
    const lead = line.at(bearD);
    let x, z, eye = 6.5;
    if (third) {
      const s = line.at(slotD()), cl = Math.hypot(lead.x - s.x, lead.z - s.z) || 1, cx = (lead.x - s.x) / cl, cz = (lead.z - s.z) / cl;
      const back = phone ? 12 : 16, side = phone ? 3 : 6;
      x = s.x - cx * back + cz * side; z = s.z - cz * back - cx * side;
      if (!phone) eye = 10;
    } else {
      const p = line.at(bearD - ((bears.length - 1) * BEAR_GAP + 6));
      x = p.x; z = p.z;
    }
    const pos = new THREE.Vector3(x, height(x, z) + eye, z);
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
  /* Changes the camera's mode and tells the page. A walk starts where the visitor's bear last stood in one (`spot`). Where that is away
     from its place in the line the camera cuts to it, since easing there would carry the view across the island without the bear in
     it; entering follow frames the bears again, level. */
  function setMode(m) {
    if (m === mode) return;
    if (m === "walk" && spot.walk() !== "slot") cut = true;
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
    if (t !== third) { third = t; cut = true; bearPose = bearHook; }
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

  /* The downgrade (quality.js): every WINDOW frames the median frame time decides, and over SLOW_MS the world steps down a rung. The
     world's first DESCENT_S seconds are its load, and a window that holds a frame of them decides nothing, even when input cuts the
     descent short or a test pose skips it. */
  const sampler = frameSampler();
  function sample(dtMs) {
    if (!sampler.add(dtMs, elapsed < DESCENT_S)) return;
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
    sun.castShadow = quality.shadows;
    stage.light.visible = quality.stageLight;
  }
  const vertex = new THREE.Vector3();
  /* In first person, how near the view comes to a bear and how much of the frame's width one covers: the depth of the nearest bear
     vertex in front of the camera, in the view or within half of it past an edge (the near plane, 0.5 m, cuts any face with a vertex
     nearer than that), and the widest share of the frame's width that one bear spans. */
  function bearsInView() {
    camera.updateMatrixWorld();
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tx = ty * camera.aspect;
    let near = Infinity, cover = 0;
    for (const b of bears) {
      b.g.updateMatrixWorld();
      let lo = Infinity, hi = -Infinity;
      b.g.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          vertex.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          const d = -vertex.z;
          if (d <= 0) continue;
          const x = vertex.x / (d * tx), y = vertex.y / (d * ty);
          if (Math.abs(x) <= 1.5 && Math.abs(y) <= 1.5 && d < near) near = d;
          if (d >= camera.near) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
        }
      });
      if (hi > lo) cover = Math.max(cover, (Math.min(hi, 1) - Math.max(lo, -1)) / 2);
    }
    const round = (v) => Math.round(v * 100) / 100;
    return { near: near === Infinity ? null : round(near), cover: round(cover) };
  }
  /* The stats the CI shoot script logs after every shot and every control a recording holds, and ?stats=1 shows, read live. They are
     defined on window.__hill, which the player also writes, so its fields stay. */
  const stat = (get) => ({ get, enumerable: true, configurable: true });
  Object.defineProperties((window.__hill ??= {}), {
    tier: stat(() => tier), scale: stat(() => quality.scale), rung: stat(() => rung),
    calls: stat(() => renderer.info.render.calls), triangles: stat(() => renderer.info.render.triangles),
    frameMs: stat(() => Math.round(sampler.frameMs * 10) / 10), frames: stat(() => renderer.info.render.frame), sound: stat(soundStats),
    mode: stat(() => mode),
    /* The view, whether the visitor's bear is drawn, where its head stands to the centimetre (the sound's listener in third person),
       whether its feet land in the frame (and above the now-plate on a phone), and where its head lands, as fractions from the top-left. */
    avatar: stat(() => ({ view: third ? "third" : "first", shown: avatar.g.visible,
      head: avatar.head.toArray().map((v) => Math.round(v * 100) / 100),
      ...(third ? avatar.report(camera, phone ? plateTop / frameH : null) : { clear: false, screen: null }) })),
    /* In first person, the nearest bear vertex's depth in the view and the widest share of the frame's width one bear covers. */
    bears: stat(() => (third ? null : bearsInView())),
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
    stage.panel.material.color.copy(skyMat.uniforms.uC0.value);
    if (!reduced) {
      skyMat.uniforms.uTime.value = elapsed;
      if (elapsed >= nextDrop) { dropAt = elapsed; skyMat.uniforms.uDrop.value.set(0.2 + rnd() * 0.6, 0.3 + rnd() * 0.5, 0); nextDrop = elapsed + 40 + rnd() * 20; }
      skyMat.uniforms.uDrop.value.z = elapsed - dropAt;
      for (const m of moving) {
        if (m.kind === "spin") m.obj.rotation.y += dt * 0.3;
        else if (m.kind === "pulse") m.obj.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(elapsed * 3);
        else if (m.kind === "bob") m.obj.position.y = 4 + 0.5 * Math.sin(elapsed * 1.5);
      }
      stage.move(dt, elapsed, playing);
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

    /* The bears. Before the show first plays they stand where it is, and a world that opens while it plays places them there in its
       first frame; in the frame it starts they walk on from where they stand, so nothing steps. */
    if (reduced) bearD = line.dOf(landmarkU[index]);
    else {
      if (!bearsOff && (!playing || !bearsPlaced)) bearD = line.dOf(landmarkU[index] + frac * (landmarkU[index + 1] - landmarkU[index]));
      if (playing) { bearsOff = true; bearD += BEAR_SPEED * dt; }
      bearsPlaced = true;
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

    /* A bear pose (the test hooks) lands once the bears stand where this frame puts them: the walker 2 m from the lead bear's centre,
       in front of its snout and facing it, or from the last bear's, behind it and 0.35 m across, facing its way. Either is inside any
       reach, so the keep-out below sets how near. */
    if (bearPose) {
      const lead = bearPose === "snout", g = bears[lead ? 0 : bears.length - 1].g, r = g.rotation.y;
      const along = lead ? 2 : -2, across = lead ? 0 : 0.35;
      walker.x = g.position.x + Math.sin(r) * along + Math.cos(r) * across;
      walker.z = g.position.z + Math.cos(r) * along - Math.sin(r) * across;
      walker.heading = lead ? r : r + Math.PI; walker.pitch = lead ? -0.25 : 0;
      bearPose = null; cut = true;
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
      keepOut(walker, stageSpot, STAGE_REACH);
      keepOut(walker, bearSpots, BODY_REACH);
      avatar.step(walker.x, walker.z, walker.heading, dt);
      spot.stand();
      if (third) aim(lookTarget.copy(avatar.boom(camera, walker, dt, cut)));
      else {
        placeWalker();
        if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      }
      if (!reduced && !posed) { idleTimer += dt; if (idleTimer > 15) setMode("attract"); }
    } else {
      /* Every other camera keeps the visitor's bear in its place in the line, walking with the five, and the walker with it; but
         follow's turns keep their own heading. */
      const s = slot();
      if (mode !== "follow") toSlot();
      avatar.step(s.x, s.z, s.heading, dt);
      if (mode === "descent") {
        /* From above the summit, where the island reads as the mark, north up the screen, down to the camera that walks with the bears. */
        const k = easeOut(elapsed / DESCENT_S);
        const end = postPose(0, 0);
        camera.position.set(end.pos.x * k, 140 + (end.pos.y - 140) * k, end.pos.z * k);
        aim(lookTarget.set(end.look.x * k, end.look.y * k, -3 + (end.look.z + 3) * k), true);
        if (elapsed >= DESCENT_S) setMode("attract");
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
    /* The sound's listener is the visitor: their bear's head in third person, the camera in first (listenerAt); it faces where the
       camera looks. */
    listen(third, avatar.head, camera);
  }

  /* The page reads the tier beside the world's state. */
  container.dataset.tier = tier;
  container.dataset.world = "ready";
  locate(performance.now());
  if (reduced) { bearD = line.dOf(landmarkU[index]); toSlot(); }
  if (testPose !== null) { Object.assign(walker, testPose); cut = true; }
  placeWalker();
  wake();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else wake();
  });
}
