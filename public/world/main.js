/* eslint-disable */
import * as THREE from "three";
import { height, buildIsland } from "./island.js";
import { buildPath, layout, placeLandmarks, buildSegues, buildWalkLine } from "./path.js";
import { makeBuilders } from "./landmarks.js";
import { buildBears } from "./bears.js";
import { buildSky, skyPair } from "./sky.js";
import { bindInput } from "./input.js";
import { keepOut } from "./collide.js";
import { ensureContext } from "./audio.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, under a sky of liquid light.
   The setlist is the path; each song is a landmark; five bears walk it ahead of the listener. */

const container = document.getElementById("world");
const main = document.querySelector("main");
const data = JSON.parse(document.getElementById("world-data").textContent);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = window.matchMedia("(max-width: 639px)").matches;
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
  renderer.setPixelRatio(1);
  const scale = phone ? 0.6 : 0.7; // lower to 0.5 if a software-rendered recording stutters
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x141418, 80, 320);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 900);

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(container);

  /* ---------- the island ---------- */
  const { caves } = buildIsland(scene, phone);

  /* ---------- the path and the landmarks ---------- */
  const path = buildPath();
  const { at, tangentAt } = path;
  const landmarkU = layout(tracks, set2Start, path);
  const builders = makeBuilders(phone);
  const { moving } = builders;
  placeLandmarks(scene, path, tracks, hasShow, builders, landmarkU);
  if (hasShow) buildSegues(scene, path, tracks, landmarkU);

  /* ---------- the bears ---------- */
  const bears = buildBears(scene, phone);

  /* ---------- the sky ---------- */
  const { skyMat, hemi } = buildSky(scene, phone, data.seed);

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
  const trailhead = at(0);
  const walker = { x: trailhead.x, z: trailhead.z, heading: 0, pitch: 0 };
  const t0 = tangentAt(0); walker.heading = Math.atan2(-t0.x, -t0.z);
  let mode = reduced ? "walk" : "descent";
  let idleTimer = 0, elapsed = 0;
  /* The walker's heading when follow began; the look turns away from the lead bear by how far the heading has moved since. */
  let followBase = 0;
  /* The bears walk their own line at a lively pace, five 7 m apart by distance along it. The line keeps 7 m to the left of the path
     so they pass the landmarks rather than walk through them (path.js). */
  const BEAR_GAP = 7, BEAR_SPEED = 2.5;
  /* How near a walk comes to a bear's centre: a bear's snout tip ends 2.4 m ahead of it, and the camera draws nothing nearer than
     0.5 m. Neighbours stay at least 5.9 m apart on the line's tightest bend, so their reaches never overlap. */
  const BEAR_REACH = 2.9, bearSpots = bears.map((b) => b.g.position);
  const line = buildWalkLine(path, 7);
  /* How far the lead bear is along its line. Until the show first plays the bears stand where it is; then they set off and keep
     their own pace while it plays. Under reduced motion they stand at the landmark of the song that plays. */
  let bearD = 0, bearsOff = false;
  /* The attract walk and the drift keep this far behind the lead bear on its line, so the five walk ahead in view. */
  const TRAIL = 4 * BEAR_GAP + 14;
  /* The attract camera: on the bears' line with the eye 15 m up, high enough that from this far back the five read one behind
     another, and the ground they walk toward shows; looking at the lead bear, as follow does. */
  function attractPose(d) {
    const p = line.at(d), lead = line.at(d + TRAIL);
    return { pos: new THREE.Vector3(p.x, p.y + 15, p.z), look: new THREE.Vector3(lead.x, lead.y + 2, lead.z) };
  }
  /* Puts the walker where a camera pose stands, facing where it looks. Every walk starts at the attract pose: one begun in attract,
     one begun in the descent (which ends there), and the walk reduced motion opens on. */
  function putWalker(pose) {
    walker.x = pose.pos.x; walker.z = pose.pos.z; walker.heading = Math.atan2(-(pose.look.x - pose.pos.x), -(pose.look.z - pose.pos.z));
  }
  const forward = () => new THREE.Vector3(-Math.sin(walker.heading), 0, -Math.cos(walker.heading));
  /* Changes the camera's mode and tells the page. Leaving follow puts the walker where the camera stands, facing where it looked;
     entering it frames the bears again, level. */
  function setMode(m) {
    if (m === mode) return;
    if (mode === "follow") {
      const d = new THREE.Vector3(); camera.getWorldDirection(d);
      walker.x = camera.position.x; walker.z = camera.position.z; walker.heading = Math.atan2(-d.x, -d.z);
      walker.pitch = Math.max(-0.8, Math.min(0.8, Math.asin(d.y)));
    }
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
    if (action === "follow") { setMode(mode === "follow" ? "walk" : "follow"); return; }
    if (mode === "follow" && LOOKS.has(action)) return;
    setMode("walk");
  }
  document.addEventListener("world:follow", () => userInput("follow"));
  const input = bindInput(container, walker, userInput);
  const { keys } = input;
  /* Lean-back and the player's state live on <main>; read them now too, since the show may have started before the world loaded. */
  function syncMain() {
    const lean = main.dataset.mode === "leanback";
    playing = main.dataset.state === "playing";
    if (lean && mode !== "drift") setMode("drift");
    if (!lean && mode === "drift") { setMode("walk"); idleTimer = 0; }
  }
  new MutationObserver(syncMain).observe(main, { attributes: true, attributeFilter: ["data-mode", "data-state"] });
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

  let last = performance.now();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

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

    /* The bears. */
    if (reduced) bearD = line.dOf(landmarkU[index]);
    else {
      if (!bearsOff) { bearD = line.dOf(landmarkU[index] + frac * (landmarkU[index + 1] - landmarkU[index])); bearsOff = playing; }
      if (playing) bearD += BEAR_SPEED * dt;
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
      if (d > 108) { walker.x *= 108 / d; walker.z *= 108 / d; }
      keepOut(walker, bearSpots, BEAR_REACH);
      placeWalker();
      if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      if (!reduced) { idleTimer += dt; if (idleTimer > 15) setMode("attract"); }
    } else if (mode === "descent") {
      /* From above the summit, where the island reads as the mark, north up the screen, down to the attract walk's first pose. */
      const k = easeOut(elapsed / 6);
      const end = attractPose(bearD - TRAIL);
      putWalker(end);
      camera.position.set(end.pos.x * k, 140 + (end.pos.y - 140) * k, end.pos.z * k);
      lookTarget.set(end.look.x * k, end.look.y * k, -3 + (end.look.z + 3) * k);
      camera.lookAt(lookTarget);
      if (elapsed >= 6) setMode("attract");
    } else if (mode === "attract") {
      const da = bearD - TRAIL; const pose = attractPose(da);
      camera.position.copy(pose.pos);
      camera.lookAt(pose.look);
      putWalker(pose);
    } else if (mode === "drift") {
      if (reduced) {
        const p0 = at(0);
        camera.position.set(0, height(0, 0) + 8, 0);
        camera.lookAt(p0.x, p0.y, p0.z);
      } else {
        /* A slow crane high above the bears, trailing the last of them along their line. */
        const dd = bearD - TRAIL;
        const p = line.at(dd), tg = line.tangentAt(dd);
        const side = new THREE.Vector3().crossVectors(tg, up).normalize();
        const sway = 2 * Math.sin((elapsed * Math.PI * 2) / 30);
        const x = p.x + side.x * sway, z = p.z + side.z * sway;
        camera.position.set(x, height(x, z) + 9, z);
        const ahead = line.at(dd + 28);
        camera.lookAt(ahead.x, ahead.y + 8, ahead.z);
      }
    } else if (mode === "follow") {
      /* Six metres behind the last bear, the eye 6.5 m up, above their heads so all five read in a line; looking at the lead bear;
         turning adds an offset to the look. */
      walker.heading += ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * 1.6 * dt;
      const p = line.at(bearD - ((bears.length - 1) * BEAR_GAP + 6)), lead = line.at(bearD);
      camera.position.set(p.x, p.y + 6.5, p.z);
      const h = Math.atan2(-(lead.x - p.x), -(lead.z - p.z)) + walker.heading - followBase, dist = Math.hypot(lead.x - p.x, lead.z - p.z);
      const e = Math.max(-1.3, Math.min(1.3, Math.atan2(lead.y + 2 - camera.position.y, dist) + walker.pitch));
      lookTarget.set(p.x - Math.sin(h) * dist, camera.position.y + Math.tan(e) * dist, p.z - Math.cos(h) * dist);
      camera.lookAt(lookTarget);
    }

    renderer.render(scene, camera);
  }

  container.dataset.world = "ready";
  locate(performance.now());
  if (reduced) putWalker(attractPose(line.dOf(landmarkU[index]) - TRAIL));
  placeWalker();
  raf = requestAnimationFrame(frame);
  /* A hidden tab stops the loop; a visible one restarts it from the present moment. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (raf === 0) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
}
