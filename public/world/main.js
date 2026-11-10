/* eslint-disable */
import * as THREE from "three";
import { buildIsland } from "./island.js";
import { height, STAGE_COLUMN, TEST_POSES } from "./ground.js";
import { buildPath, layout, placeLandmarks, buildSegues, buildWalkLine } from "./path.js";
import { makeBuilders, mergeLandmarks } from "./landmarks.js";
import { buildBears, drawLegs } from "./bears.js";
import { buildAvatar } from "./avatar.js";
import { buildSky, skyPair } from "./sky.js";
import { bindInput } from "./input.js";
import { confine, DESCENT_S, enterMode, keepSpot, modeRules, slotAt, slotDistance, walkLimits } from "./modes.js";
import { postPose as poseOver } from "./pose.js";
import { cueClock } from "./clock.js";
import { analyse, analysisStats, listen, mappings, onsetAt, soundStats, startSound } from "./audio.js";
import { buildUp, loadMap, mapDrive, passesPeak } from "./maps.js";
import { beatStep, FIGURES_BPM, figuresTempo } from "./beat.js";
import { buildStage, STAGE_SOUND } from "./stage.js";
import { buildCrowd } from "./crowd.js";
import { crowdPlan } from "./seats.js";
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
/* What the crowd does through each track: dances, sits, or both (seats.js). */
const crowdAt = crowdPlan(tracks, set2Start);

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
  let quality = {
    scale: budget.scale, shadows: budget.shadows, octaves: budget.octaves, bears: budget.bears, stageLight: true, fullCrowd: true, rig: true,
  };
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
  /* The bears' own line, 7 m to the left of the path, which every landmark stands clear of (path.js). */
  const line = buildWalkLine(path, 7);
  const builders = makeBuilders(phone);
  const { moving } = builders;
  const placeStart = performance.now();
  const landmarks = placeLandmarks(scene, path, tracks, hasShow, builders, landmarkU, line);
  /* How long the landmarks took to place, most of it their search for room beside the bears' line; the stats report it. */
  (window.__hill ??= {}).placeMs = Math.round((performance.now() - placeStart) * 10) / 10;
  if (hasShow) buildSegues(scene, path, tracks, landmarkU);

  /* ---------- the bears ---------- */
  const bears = buildBears(scene, budget.bears);

  /* ---------- the crowd ---------- */
  const crowd = buildCrowd(scene, { count: budget.crowd, path, line, landmarks });

  /* ---------- the visitor's bear ---------- */
  const avatar = buildAvatar(scene, landmarks, { phone, reduced, columns: [STAGE_COLUMN], over: crowd.over, ahead: crowd.ahead });
  /* Every bear's legs, the visitor's too, as one mesh (bears.js). */
  drawLegs(scene, [...bears, avatar]);
  /* The landmarks' still parts become one mesh across the path, once the camera's keep-out boxes and the crowd's are read from them. */
  mergeLandmarks(scene, landmarks, moving.map((m) => m.obj));

  /* ---------- the sky ---------- */
  const { skyMat, hemi, sun, panelMat } = buildSky(scene, budget.octaves, data.seed);

  /* ---------- the stage ---------- */
  const stage = buildStage(scene, sun, quality.shadows, panelMat, skyMat.uniforms);
  /* The lights' own intensities, which layer 2 scales. */
  const lightBase = { hemi: hemi.intensity, stage: stage.light.intensity };
  /* The desktop's one shadow map, the stage's, is drawn once: nothing that casts a shadow moves. */
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  /* ---------- the beam ---------- */
  /* The song that plays stands in a soft column of light, so the show's progress reads from anywhere on the island. Both its faces draw
     in one pass: added light sums the same in either order, so the back-then-front passes of a transparent double-sided material
     would only cost a second draw call. */
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 36, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8b04b, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true }));
  beam.visible = hasShow;
  scene.add(beam);
  /* Its own opacity, which the build-up before a peak scales. */
  const beamBase = beam.material.opacity;

  /* ---------- the show clock ---------- */
  /* The audio element owns the clock: the world keeps the player's last report (sent on each timeupdate, on play and on pause)
     and runs on from it while the show plays. */
  let playing = false, showPos = 0, index = 0, frac = 0, trackPos = 0;
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
    index = i; frac = d > 0 ? pos / d : 0; showPos = starts[i] + pos; trackPos = pos;
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
  /* Layer 2: this frame's drive from the music, the live sound's or, where the analyser cannot hear the show, its map's (null while
     neither gives one, and always under reduced motion), the last drive heard, and how far the world follows it, easing over 0.8 s each
     way so it never snaps to or from the music. */
  let drive = null, heard = null, weight = 0;
  /* What the music does to the world this frame (audio.js mappings). */
  let layer2 = mappings(null, 0);
  /* The bears' leg phase, which the music's loudness speeds; it accumulates, so a change of rate never jumps the legs. */
  let gait = 0;
  /* Layer 3: the show's map (maps.js), null until it has loaded and on a day without one. Where the analyser cannot hear the show, the
     map drives the world in the live sound's place; and from it come the build-up before each of a song's peaks, which follows the map's
     at most 1.25 a second either way, so a seek or a peak's passing never snaps, and the figures' tempo (null where it gives none). */
  let map = null, build = 0, tempo = null;
  /* The figures' beat (beat.js), and the time of the last onset it has seen. */
  let figures = { beats: 0, pull: 0, locks: 0 }, seenOnset = null;
  /* How far the crowd dances and how far it sits, each 0-1, following the track that plays (crowdAt): the dance eases over 0.8 s as the
     players' does, and only while the show plays; the sit over SIT_S, at once under reduced motion, where the crowd never dances. */
  let dancing = 0, sitting = 0;
  const SIT_S = 1.5;
  /* The last frame's song and place in it, which tell when the music passes a peak. */
  let lastIndex = -1, lastPos = 0;
  /* `value` moved toward `target` by at most `step`. */
  const toward = (value, target, step) => value + Math.max(-step, Math.min(step, target - value));
  let rnd = (() => { let s = data.seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  let nextDrop = 40 + rnd() * 20, dropAt = -99;
  /* The sky's drop: a ring that spreads from a point of the sky, from `dropAt`; the next falls 40-60 s on. */
  function drop() {
    dropAt = elapsed;
    skyMat.uniforms.uDrop.value.set(0.2 + rnd() * 0.6, 0.3 + rnd() * 0.5, 0);
    nextDrop = elapsed + 40 + rnd() * 20;
  }

  /* ---------- the camera: walker, attract, descent, drift ---------- */
  /* The walker is the visitor, seen from behind as their own bear (third person, the default) or through its eyes (first person). The
     page mirrors the setting on <main>; changing it cuts the camera. */
  const trailhead = at(0);
  const walker = { x: trailhead.x, z: trailhead.z, heading: 0, pitch: 0 };
  const t0 = tangentAt(0); walker.heading = Math.atan2(-t0.x, -t0.z);
  let third = true, cut = false;
  /* The test hooks ?pose=stage, ?pose=slope, ?pose=path, ?pose=crowd and ?pose=among, on preview deployments only (the server marks
     <main data-test-hooks="1">): the walk starts with the visitor on the slope in front of the stage, higher up it, on the path where it
     shows the stage, or behind the crowd or among it (ground.js), with no descent. ?pose=sweep is the same walk from the trailhead, for the
     CI shoot's draw-call sweep: a `world:pose` event (x, z, heading, pitch) puts the visitor anywhere with the camera cut, the world
     holds rung 0, and it draws at a twentieth of the frame's size, which changes no draw call: three culls against the camera, whose
     aspect stays the frame's. ?pose=snout stands the walker in front of the lead bear's snout looking a little down, and ?pose=pass
     behind the last bear, a little to its side, facing its way; both start inside the bear's reach and are taken again when the view
     changes, so the walk's keep-out sets each view's distance. */
  const hooks = main.dataset.testHooks === "1" ? new URLSearchParams(location.search) : null;
  const hook = hooks?.get("pose") ?? null;
  const testPose = hook && Object.hasOwn(TEST_POSES, hook) ? TEST_POSES[hook] : null;
  const sweep = hook === "sweep";
  const bearHook = hook === "snout" || hook === "pass" ? hook : null;
  let bearPose = bearHook;
  const posed = testPose !== null || sweep || bearPose !== null;
  /* The test hook ?pose=landmark-K: from 30 m over song K's landmark, looking down with north up the screen, the bears standing where
     their line passes nearest it, the lead bear there, with no descent. */
  const overK = /^landmark-(\d+)$/.exec(hook ?? "");
  const over = overK ? landmarks[Number(overK[1])] ?? null : null;
  /* The test hook ?drive=map: the show's map drives the world, as where the analyser cannot hear the show, while the sound is routed
     as ever. */
  const mapHook = hooks?.get("drive") === "map";
  /* This frame's drive, with `track` the map's for the song that plays (null without a map): the live sound's, else the map's while
     the show plays where the analyser cannot hear it, in plain stereo or before its sound is routed (the page mirrors how it sounds on
     <main>), or under ?drive=map. Never the map's where the analyser hears silence (a stall, the gap between tracks), so the two never
     take turns within a song. */
  function driveFor(now, track) {
    if (!mapHook) {
      const live = analyse(now);
      if (live || main.dataset.routing === "webaudio") return live;
    }
    return track && playing ? mapDrive(track, trackPos) : null;
  }
  let mode = over ? "attract" : reduced || posed ? "walk" : "descent";
  let elapsed = 0;
  /* The walker's heading when follow began; the look turns away from the lead bear by how far the heading has moved since. */
  let followBase = 0;
  /* The bears walk their own line at a lively pace, five 7 m apart by distance along it, and pass the landmarks rather than walk
     through them (path.js). */
  const BEAR_GAP = 7, BEAR_SPEED = 2.5;
  /* What a walk keeps the walker to (modes.js): within the island's bound, out of the stage's reach, since its platform is solid too, and
     out of each bear's, whose spots `bearSpots` holds live: the downgrade drops a bear's spot with the bear. */
  const bearSpots = bears.map((b) => b.g.position);
  const limits = walkLimits(bearSpots);
  /* How far the lead bear is along its line. Until the show first plays the bears stand where it is, from the world's first frame
     even if it is already playing; then they set off and keep their own pace while it plays. Under reduced motion they stand at the
     landmark of the song that plays. */
  let bearD = 0, bearsOff = false, bearsPlaced = false;
  /* Under ?pose=landmark-K, how far along their line the bears pass nearest the landmark. */
  let overD = 0;
  for (let d = 0, near = Infinity; over && d < line.length; d += 0.25) {
    const p = line.at(d), h = Math.hypot(p.x - over.position.x, p.z - over.position.z);
    if (h < near) { near = h; overD = d; }
  }
  /* The visitor's place in the line: a sixth bear, one gap behind the last bear shown, facing along the line. */
  const slotD = () => slotDistance(bearD, bears.length, BEAR_GAP);
  const slot = () => slotAt(line, slotD());
  /* Puts the walker in its place in the line, where every camera but the walk's and follow's keeps it, and where the walk reduced motion
     opens on. */
  function toSlot() {
    const s = slot();
    walker.x = s.x; walker.z = s.z; walker.heading = s.heading;
  }
  /* A walk starts where the visitor's bear last stood in a walk, or at the nearest spot where a walker may stand if it no longer may
     there, else in its place in the line, as the first walk after the descent does (modes.js). */
  const spot = keepSpot(walker, slot, limits);
  /* The camera that walks with the bears, in follow and attract, its eye above their heads; it looks at the lead bear, turned by `yaw`
     and tilted by `pitch` (pose.js). */
  function postPose(yaw, pitch) {
    return poseOver({ third, phone, bearD, count: bears.length, gap: BEAR_GAP, line, height, keepInView }, yaw, pitch);
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
    const entry = enterMode(mode, m, spot);
    if (!entry.changed) return;
    if (entry.cut) cut = true;
    if (entry.followEntered) { followBase = walker.heading; walker.pitch = 0; }
    mode = m;
    document.dispatchEvent(new CustomEvent("world:mode", { detail: { mode } }));
  }
  /* What changes the mode (modes.js): the controls, lean-back's switch and the frames. */
  const rules = modeRules(() => mode, setMode);
  /* A control the world takes wakes it for a frame; lean-back takes none. */
  function userInput(action) {
    if (rules.input(action)) wake();
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
    rules.lean(lean);
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
    /* The seats run front first, so half the crowd is its front half. */
    crowd.mesh.count = quality.fullCrowd ? crowd.count : Math.ceil(crowd.count / 2);
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
  const r3 = (v) => Math.round(v * 1000) / 1000;
  Object.defineProperties((window.__hill ??= {}), {
    tier: stat(() => tier), scale: stat(() => quality.scale), rung: stat(() => rung),
    calls: stat(() => renderer.info.render.calls), triangles: stat(() => renderer.info.render.triangles),
    frameMs: stat(() => Math.round(sampler.frameMs * 10) / 10), frames: stat(() => renderer.info.render.frame), sound: stat(soundStats),
    mode: stat(() => mode),
    /* The crowd: how many figures it draws (the tier's, or the front-weighted half of them once the downgrade halves it), how far it
       dances, the music's factor in, how far it sits, and how many figures stand off their seats for the visitor. */
    crowd: stat(() => ({ drawn: crowd.mesh.count, dance: r3(dancing * layer2.dance), sit: r3(sitting), parted: crowd.parted })),
    /* The rig: how far it is lit, how far the build-up has gathered its beams, and how far Space has lifted them; they swing as far as
       the crowd dances. */
    rig: stat(() => ({ lit: r3(stage.rig.show[1]), gather: r3(stage.rig.show[3]), lift: r3(stage.rig.show[4]) })),
    /* The view, whether the visitor's bear is drawn, where its head stands to the centimetre (the sound's listener in third person),
       whether its feet land in the frame (and above the now-plate on a phone), and where its head lands, as fractions from the top-left. */
    avatar: stat(() => ({ view: third ? "third" : "first", shown: avatar.g.visible,
      head: avatar.head.toArray().map((v) => Math.round(v * 100) / 100),
      ...(third ? avatar.report(camera, phone ? plateTop / frameH : null) : { clear: false, screen: null }) })),
    /* In first person, the nearest bear vertex's depth in the view and the widest share of the frame's width one bear covers. */
    bears: stat(() => (third ? null : bearsInView())),
    analysis: stat(() => ({ source: drive?.source ?? null, weight: r3(weight), ...analysisStats() })),
    /* The show's map once it has loaded, else null: its show and step; its loudness, low end and brightness where the show is, which
       drive the world where the analyser cannot hear the show; the build-up as it acts, with the music's weight, and the flame's scale
       and the panel's and the beam's factors with it; the figures' tempo (null where the map gives none); and how many onsets have
       pulled their beat. */
    map: stat(() => {
      if (!map) return null;
      const { loud, bass, bright } = mapDrive(map.tracks[index], trackPos);
      return { show: map.show, step: map.step, loud: r3(loud), bass: r3(bass), bright: r3(bright), build: r3(build * weight),
        swell: r3(layer2.swell), panel: r3(layer2.panel), beam: r3(layer2.beam), bpm: tempo, locks: figures.locks };
    }),
  });

  function frame(now) {
    raf = !reduced || held() ? requestAnimationFrame(frame) : 0;
    /* A frame's timestamp marks the frame's start, which can come before the clock reading of the wake that asked for it, so time never
       runs back: under reduced motion every frame follows a wake. */
    const dtMs = Math.max(0, now - last);
    const dt = Math.min(0.05, dtMs / 1000);
    last = now;
    elapsed += dt;
    if (!reduced && !sweep) sample(dtMs);

    /* The show. */
    locate(now);
    const targetEnergy = energyOf(index);
    /* State changes blend over about eight seconds; under reduced motion they land at once. */
    const blend = reduced ? 1 : Math.min(1, dt * 0.12);
    energy += (targetEnergy - energy) * blend;
    /* The map's track for the song that plays (null without a map). */
    const track = map?.tracks[index] ?? null;
    drive = reduced ? null : driveFor(now, track);
    if (drive) heard = drive;
    weight = toward(weight, drive ? 1 : 0, dt / 0.8);
    build = toward(build, track ? buildUp(track, trackPos) : 0, dt / 0.8);
    tempo = track ? figuresTempo(track, trackPos) : null;
    layer2 = mappings(heard, weight, build);
    const f = total > 0 ? showPos / total : 0;
    const [c0, c1] = skyPair(index, f, set2Start, encoreStart);
    skyMat.uniforms.uEnergy.value = energy * layer2.energy;
    skyMat.uniforms.uAmber.value = layer2.amber;
    skyMat.uniforms.uC0.value.lerp(c0, blend);
    skyMat.uniforms.uC1.value.lerp(c1, blend);
    skyMat.uniforms.uC2.value.copy(skyMat.uniforms.uC0.value).lerp(skyMat.uniforms.uPage.value, 0.7);
    hemi.color.copy(skyMat.uniforms.uC0.value).lerp(new THREE.Color(0xffffff), 0.3);
    hemi.intensity = lightBase.hemi * layer2.hemi;
    panelMat.uniforms.uGain.value[0] = layer2.panel;
    stage.light.intensity = lightBase.stage * layer2.stage;
    /* Whether a song plays: the crowd dances and the rig lights for one. */
    const dances = playing && crowdAt[index].dance ? 1 : 0;
    if (!reduced) {
      skyMat.uniforms.uTime.value = elapsed;
      /* A drop falls every 40-60 s, and as the music plays past a peak of the song between one frame and the next, unless one fell in
         the last 5 s. */
      const peak = track && weight > 0 && index === lastIndex && passesPeak(track, lastPos, trackPos);
      if (elapsed >= nextDrop || (peak && elapsed - dropAt > 5)) drop();
      lastIndex = index; lastPos = trackPos;
      skyMat.uniforms.uDrop.value.z = elapsed - dropAt;
      for (const m of moving) {
        if (m.kind === "spin") m.obj.rotation.y += dt * 0.3;
        else if (m.kind === "pulse") m.obj.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(elapsed * 3);
        else if (m.kind === "bob") m.obj.position.y = 4 + 0.5 * Math.sin(elapsed * 1.5);
        else if (m.kind === "flame") m.obj.intensity = m.base * layer2.flame;
        else if (m.kind === "swell") m.obj.scale.setScalar(layer2.swell);
      }
      /* The figures' beat (beat.js): the map's tempo where it gives one, onto whose beat the live sound's onsets pull them; else
         FIGURES_BPM, free-running. */
      const onset = onsetAt();
      figures = beatStep(figures, dt, tempo ?? FIGURES_BPM, tempo !== null && onset !== seenOnset ? (now - onset) / 1000 : null);
      seenOnset = onset;
      stage.move(dt, elapsed, figures.beats, playing);
      dancing = toward(dancing, dances, dt / 0.8);
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
    const lp = landmarks[index]?.position ?? at(landmarkU[index]);
    beam.position.set(lp.x, lp.y + 18, lp.z);
    beam.material.opacity = beamBase * layer2.beam;

    /* The bears. Before the show first plays they stand where it is, and a world that opens while it plays places them there in its
       first frame; in the frame it starts they walk on from where they stand, so nothing steps. */
    if (over) bearD = overD;
    else if (reduced) bearD = line.dOf(landmarkU[index]);
    else {
      if (!bearsOff && (!playing || !bearsPlaced)) bearD = line.dOf(landmarkU[index] + frac * (landmarkU[index + 1] - landmarkU[index]));
      if (playing) { bearsOff = true; bearD += BEAR_SPEED * dt; }
      bearsPlaced = true;
    }
    gait += layer2.rate * dt;
    for (let k = 0; k < bears.length; k++) {
      const b = bears[k];
      const db = bearD - k * BEAR_GAP;
      const p = line.at(db), tg = line.tangentAt(db);
      b.g.position.copy(p);
      b.g.rotation.y = Math.atan2(tg.x, tg.z);
      const swing = (playing && !reduced) ? Math.sin(gait + b.phase) * layer2.amp : 0;
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
      confine(walker, limits);
      /* A figure that could not get out of the way stops the visitor's bear (crowd.js); the limits still have the last word. */
      if (!cut) { crowd.hold(walker); confine(walker, limits); }
      avatar.step(walker.x, walker.z, walker.heading, dt);
      crowd.part(dt, avatar.feet, avatar.head, reduced);
      spot.stand();
      if (third) aim(lookTarget.copy(avatar.boom(camera, walker, dt, cut)));
      else {
        placeWalker();
        if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      }
    } else {
      /* Every other camera keeps the visitor's bear in its place in the line, walking with the five, and the walker with it; but
         follow's turns keep their own heading. */
      const s = slot();
      if (mode !== "follow") toSlot();
      avatar.step(s.x, s.z, s.heading, dt);
      crowd.part(dt, avatar.feet, avatar.head, reduced);
      if (mode === "descent") {
        /* From above the summit, where the island reads as the mark, north up the screen, down to the camera that walks with the bears. */
        const k = easeOut(elapsed / DESCENT_S);
        const end = postPose(0, 0);
        camera.position.set(end.pos.x * k, 140 + (end.pos.y - 140) * k, end.pos.z * k);
        aim(lookTarget.set(end.look.x * k, end.look.y * k, -3 + (end.look.z + 3) * k), true);
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
    /* The mode the passing frames lead to (modes.js). */
    rules.frame(elapsed);
    if (over) {
      const o = over.position;
      camera.position.set(o.x, o.y + 30, o.z);
      camera.lookAt(o.x, o.y, o.z - 1);
    }
    cut = false;

    /* The crowd dances to the figures' beat as far as the music's loudness takes it, and rises with the build-up before a peak, as far
       as it dances; and it sits. It made room for the visitor's bear, or their eye in first person, as the bear took its place, before the
       camera looked. */
    const sits = crowdAt[index].sit ? 1 : 0;
    sitting = reduced ? sits : toward(sitting, sits, dt / SIT_S);
    crowd.pose(figures.beats, dancing * layer2.dance, dancing * layer2.rise, sitting);
    /* The rig's five numbers (rig.js): the figures' phase in eight beats; how far it is lit, as far as the crowd dances, so while a song
       plays, and under reduced motion at once while one plays, its beams still; how far its beams swing, as far as the crowd dances; the
       build-up, which gathers them; and how far the crowd sits, which in Space lifts them. A dark rig is not drawn. */
    const rig = stage.rig.show;
    rig[0] = figures.beats % 8;
    rig[1] = quality.rig ? (reduced ? dances : dancing) : 0;
    rig[2] = dancing * layer2.dance;
    rig[3] = layer2.rise;
    rig[4] = sitting;
    stage.rig.mesh.visible = rig[1] > 0;

    renderer.render(scene, camera);
    /* The sound's listener is the visitor: their bear's head in third person, the camera in first (listenerAt); it faces where the
       camera looks. */
    listen(third, avatar.head, camera);
  }

  /* The page reads the tier beside the world's state. */
  container.dataset.tier = tier;
  container.dataset.world = "ready";
  /* The show's map, asked for once the world is ready, since the world runs without it: a day without one, and a map that fails, leave
     it on layers 1 and 2 (maps.js loadMap). Under reduced motion none of it would run, so it is not asked for. */
  if (!reduced) loadMap(data).then((m) => { map = m; });
  locate(performance.now());
  if (reduced) { bearD = line.dOf(landmarkU[index]); toSlot(); }
  if (testPose) { Object.assign(walker, testPose); cut = true; }
  if (sweep) {
    quality = { ...quality, scale: 0.05 };
    applyQuality();
    document.addEventListener("world:pose", ({ detail }) => { Object.assign(walker, detail); cut = true; wake(); });
  }
  placeWalker();
  wake();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else wake();
  });
}
