/* eslint-disable */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, under a sky of liquid light.
   The setlist is the path; each song is a landmark; five bears walk it ahead of the listener. */

const container = document.getElementById("world");
const main = document.querySelector("main");
const data = JSON.parse(document.getElementById("world-data").textContent);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = window.matchMedia("(max-width: 639px)").matches;
const tracks = data.tracks.length > 0 ? data.tracks : [{ title: "Set", duration: 600 }];
const N = tracks.length;
const total = tracks.reduce((a, t) => a + t.duration, 0);

const canvas = document.createElement("canvas");
const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "low-power", alpha: false });
if (!gl) {
  container.dataset.world = "fallback";
} else {
  container.appendChild(canvas);
  start(gl);
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
  const G = (gx, gy) => [(gx - 100) * 1.2, (gy - 100) * 1.2]; // the mark's 200 grid to metres
  const CAVES = [G(66, 108), G(134, 108)];
  function height(x, z) {
    const d = Math.hypot(x, z);
    let h = 2.5 + 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
    const t = Math.max(0, 1 - (d / 84) * (d / 84));
    h += 28 * t * Math.sqrt(t);
    for (const [cx, cz] of CAVES) {
      const dc = Math.hypot(x - cx, z - cz);
      if (dc < 13) h -= 6 * (1 - (dc / 13) * (dc / 13));
    }
    const nose = Math.hypot(x, z - 26);
    if (nose < 9) h -= 2.5 * (1 - nose / 9);
    if (d > 118) h -= ((d - 118) / 10) * 5.5;
    return h;
  }
  const ground = new THREE.PlaneGeometry(260, 260, phone ? 52 : 80, phone ? 52 : 80);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  scene.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ color: 0x5f6b4e, flatShading: true })));
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0e1014 })));

  /* The ring road and the lightning path, as flat bands just above the ground. */
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x8e8a82 });
  /* The ring lies on the ground, so it follows the shore's gentle rise and fall. */
  const ringGeo = new THREE.RingGeometry(112, 118, 160, 2).rotateX(-Math.PI / 2);
  const ringPos = ringGeo.attributes.position;
  for (let i = 0; i < ringPos.count; i++) ringPos.setY(i, height(ringPos.getX(i), ringPos.getZ(i)) + 0.2);
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(ringGeo, bandMat);
  scene.add(ring);
  const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)];
  for (let s = 0; s < BOLT.length - 1; s++) {
    const [ax, az] = BOLT[s], [bx, bz] = BOLT[s + 1];
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, Math.hypot(x1 - x0, z1 - z0) + 0.4), bandMat);
      seg.position.set((x0 + x1) / 2, height((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2);
      seg.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      scene.add(seg);
    }
  }

  /* ---------- the path and the landmarks ---------- */
  const LOOP = [G(100, 186), G(97, 172), G(94, 158), G(90, 144), G(86, 128), G(82, 112), G(100, 100), G(118, 92), G(110, 72), G(104, 50),
    G(100, 14), G(42, 40), G(12, 100), G(66, 108), G(134, 108), G(188, 100), G(160, 160), G(122, 184), G(104, 180)];
  const loopCurve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "catmullrom", 0.5);
  const points = N === LOOP.length ? LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z))
    : Array.from({ length: N }, (_, i) => loopCurve.getPointAt(i / N));
  const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
  const curveLength = curve.getLength();
  const at = (u) => { const p = curve.getPointAt(((u % 1) + 1) % 1); p.y = height(p.x, p.z); return p; };
  const tangentAt = (u) => curve.getTangentAt(((u % 1) + 1) % 1);

  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const amber = new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.6 });
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const moving = []; // objects that move while the show plays (still under reduced motion)

  const BUILDERS = [
    [/tuning/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), wood, 0, 3, 0), mesh(new THREE.SphereGeometry(1.2, 8, 6), amber, 0, 6.8, 0)); }],
    [/straw/i, (g) => { const b = mesh(new THREE.CylinderGeometry(2, 2, 4, 10), new THREE.MeshLambertMaterial({ color: 0xc9a24a, flatShading: true }), 0, 2, 0); b.rotation.z = Math.PI / 2; g.add(b); }],
    [/diamond/i, (g) => { g.add(mesh(new THREE.BoxGeometry(2, 1, 2), stone, 0, 0.5, 0), mesh(new THREE.OctahedronGeometry(2), new THREE.MeshLambertMaterial({ color: 0xbfe3ea, flatShading: true }), 0, 3.2, 0)); }],
    [/rider/i, (g) => { if (!phone) for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), wood, i * 2.4, 1.2, 0)); g.add(mesh(new THREE.BoxGeometry(10, 0.2, 0.2), wood, 0, 2, 0)); }],
    [/jed/i, (g) => { g.add(mesh(new THREE.BoxGeometry(5, 3, 4), wood, 0, 1.5, 0)); const r = mesh(new THREE.ConeGeometry(3.8, 2.2, 4), stone, 0, 4.1, 0); r.rotation.y = Math.PI / 4; g.add(r); }],
    [/esau/i, (g) => { g.add(mesh(new THREE.BoxGeometry(1.6, 5, 1.2), stone, -1.2, 2.5, 0), mesh(new THREE.BoxGeometry(1.6, 4.2, 1.2), stone, 1.2, 2.1, 0)); }],
    [/grey|gray/i, (g) => { g.add(mesh(new THREE.DodecahedronGeometry(3), new THREE.MeshLambertMaterial({ color: 0x7d7a74, flatShading: true }), 0, 2.4, 0)); }],
    [/snow/i, (g) => { g.add(mesh(new THREE.ConeGeometry(3, 7, 7), stone, 0, 3.5, 0), mesh(new THREE.ConeGeometry(1.4, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5.7, 0)); }],
    [/fire/i, (g) => { g.add(mesh(new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshLambertMaterial({ color: 0x4a3a30, flatShading: true }), 0, 2.5, 0), mesh(new THREE.ConeGeometry(1, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 0.8 }), 0, 6.2, 0)); const l = new THREE.PointLight(0xff8a3a, 40, 30); l.position.set(0, 6.5, 0); g.add(l); }],
    [/samson/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, -1.5, 3, 0)); const p = mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, 1.5, 2.8, 0); p.rotation.z = -0.25; g.add(p, mesh(new THREE.BoxGeometry(4.4, 0.6, 1), stone, 0, 6.3, 0)); }],
    [/wheel/i, (g) => { const w = mesh(new THREE.TorusGeometry(3.2, 0.4, 6, 16), wood, 0, 3.6, 0); g.add(w); moving.push({ obj: w, kind: "spin" }); }],
    [/miracle/i, (g) => { const s = mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 }), 0, 4, 0); g.add(s); moving.push({ obj: s, kind: "bob" }); }],
    [/band/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(4, 4, 0.8, 8), wood, 0, 0.4, 0)); if (!phone) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 5), wood, Math.cos(a) * 3.6, 2.3, Math.sin(a) * 3.6)); } g.add(mesh(new THREE.ConeGeometry(4.6, 2, 8), stone, 0, 4.8, 0)); }],
    [/drums/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 10), wood, -2, 1, 0), mesh(new THREE.CylinderGeometry(1.1, 1.1, 3, 10), wood, 0.6, 1.5, 1), mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.5, 10), wood, 2.4, 0.75, -1)); }],
    [/space/i, (g) => { g.add(mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.15, 0)); }],
    [/lovin/i, (g) => { const a = mesh(new THREE.BoxGeometry(1, 6, 1), stone, -1.6, 2.8, 0); a.rotation.z = -0.35; const b = mesh(new THREE.BoxGeometry(1, 6, 1), stone, 1.6, 2.8, 0); b.rotation.z = 0.35; g.add(a, b); }],
    [/road/i, (g) => { g.add(mesh(new THREE.BoxGeometry(4, 0.2, 18), stone, 0, 0.4, 0)); }],
    [/lovelight|light/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.2, 1.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5, 0)); const b = mesh(new THREE.BoxGeometry(1, 1, 1), amber, 0, 10.6, 0); g.add(b); moving.push({ obj: b, kind: "spin" }); }],
    [/blues/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 6), stone, 0, 6, 0), mesh(new THREE.BoxGeometry(3, 1.8, 0.05), new THREE.MeshLambertMaterial({ color: 0xd6508a }), 1.6, 11, 0)); }],
  ];
  const standingStone = (g) => g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), stone, 0, 2.25, 0));
  const landmarks = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    const p = points[i];
    g.position.set(p.x, height(p.x, p.z), p.z);
    const t = tangentAt(i / N);
    g.rotation.y = Math.atan2(t.x, t.z);
    const b = BUILDERS.find(([re]) => re.test(tracks[i].title));
    (b ? b[1] : standingStone)(g);
    scene.add(g);
    landmarks.push(g);
  }

  /* ---------- the bears ---------- */
  const HUES = [0xd4607a, 0xd4a056, 0x78b070, 0x6898d0, 0x9a80c0];
  const bears = [];
  const bearCount = phone ? 3 : 5;
  for (let k = 0; k < bearCount; k++) {
    const m = new THREE.MeshLambertMaterial({ color: HUES[k], flatShading: true });
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(1.5, 8, 6), m, 0, 2.2, 0); body.scale.set(1, 1.3, 1);
    const head = mesh(new THREE.SphereGeometry(1.1, 8, 6), m, 0, 3.6, 0.8);
    const earL = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, -0.7, 4.5, 0.6), earR = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, 0.7, 4.5, 0.6);
    const snout = mesh(new THREE.SphereGeometry(0.45, 6, 4), m, 0, 3.4, 1.8);
    const legs = [];
    for (const [lx, lz] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
      const leg = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 5), m, lx, 0.8, lz);
      legs.push(leg); g.add(leg);
    }
    g.add(body, head, earL, earR, snout);
    scene.add(g);
    bears.push({ g, legs, phase: k * 0.9 });
  }

  /* ---------- the sky ---------- */
  const OCT = phone ? 3 : 4;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: data.seed }, uEnergy: { value: 0.5 },
      uC0: { value: new THREE.Color(0xe8b04b) }, uC1: { value: new THREE.Color(0xd6508a) }, uC2: { value: new THREE.Color(0x3a2238) }, uPage: { value: new THREE.Color(0x0b0b0d) },
      uDrop: { value: new THREE.Vector3(0.5, 0.5, 99) },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      varying vec3 vDir;
      uniform float uTime, uSeed, uEnergy; uniform vec3 uC0, uC1, uC2, uPage, uDrop;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < ${OCT}; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        vec2 p = d.xz / (d.y + 0.35) * 1.2;
        float t = uTime * 0.03 + uSeed;
        float w = 1.2 + 1.4 * uEnergy;
        vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(0.7 * t, 0.0)));
        vec2 r = vec2(fbm(p + w * q + vec2(1.7, 9.2) + 0.15 * t), fbm(p + w * q + vec2(8.3, 2.8) - 0.12 * t));
        float v = fbm(p + w * r);
        vec2 uv = p * 0.25 + 0.5;
        float dd = distance(uv, uDrop.xy);
        v += 0.3 * exp(-pow(abs((dd - 0.06 * uDrop.z) * 22.0), 2.0)) * exp(-uDrop.z * 0.4);
        vec3 col = mix(uC0, uC1, clamp(v * 1.5 - 0.1, 0.0, 1.0));
        col = mix(col, uC2, clamp(length(q), 0.0, 1.0) * 0.6);
        float horizon = smoothstep(-0.05, 0.3, d.y);
        gl_FragColor = vec4(mix(uPage, col, horizon), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), skyMat));
  /* Light intensities are in physical units, so the soft daylight look needs a factor of pi. */
  const hemi = new THREE.HemisphereLight(0xe8b04b, 0x1a1613, 1.1 * Math.PI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.5 * Math.PI);
  sun.position.set(60, 100, 40);
  scene.add(sun);

  /* ---------- the show clock ---------- */
  let playing = false, showPos = 0, index = 0, frac = 0, lastReported = -1;
  function locate() {
    let acc = 0;
    for (let i = 0; i < N; i++) {
      if (showPos < acc + tracks[i].duration || i === N - 1) { index = i; frac = Math.min(1, (showPos - acc) / tracks[i].duration); return; }
      acc += tracks[i].duration;
    }
  }
  function report(force) {
    const sec = Math.floor(showPos);
    if (!force && sec === lastReported) return;
    lastReported = sec;
    let acc = 0; for (let i = 0; i < index; i++) acc += tracks[i].duration;
    document.dispatchEvent(new CustomEvent("world:now", { detail: { index, position: showPos - acc } }));
  }
  document.addEventListener("world:seek", (e) => {
    const i = Math.max(0, Math.min(N - 1, e.detail.index));
    showPos = 0; for (let k = 0; k < i; k++) showPos += tracks[k].duration;
    locate(); report(true);
  });
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
  const keys = { fwd: false, back: false, left: false, right: false };
  let mode = reduced ? "walk" : "descent";
  let attractU = 0, idleTimer = 0, elapsed = 0, drag = null, dragSpeed = 0;
  const forward = () => new THREE.Vector3(-Math.sin(walker.heading), 0, -Math.cos(walker.heading));
  function userInput() {
    if (mode !== "drift") mode = "walk";
    idleTimer = 0;
  }
  const KEYMAP = { ArrowUp: "fwd", KeyW: "fwd", ArrowDown: "back", KeyS: "back", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  container.addEventListener("keydown", (e) => { const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); keys[k] = true; userInput(); });
  container.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); keys[k] = false; });
  container.addEventListener("pointerdown", (e) => { container.focus(); drag = { x: e.clientX, y: e.clientY, h: walker.heading }; userInput(); });
  window.addEventListener("pointermove", (e) => { if (!drag) return; walker.heading = drag.h - (e.clientX - drag.x) * 0.005; dragSpeed = Math.max(-1, Math.min(1, -(e.clientY - drag.y) / 80)); userInput(); });
  window.addEventListener("pointerup", () => { drag = null; dragSpeed = 0; });
  window.addEventListener("pointercancel", () => { drag = null; dragSpeed = 0; });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = { up: "fwd", down: "back", left: "left", right: "right" }[b.dataset.pad];
    const on = (e) => { e.preventDefault(); keys[k] = true; userInput(); };
    const off = () => { keys[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
  }
  new MutationObserver(() => {
    const lean = main.dataset.mode === "leanback";
    playing = main.dataset.state === "playing";
    if (lean && mode !== "drift") mode = "drift";
    if (!lean && mode === "drift") { mode = "walk"; idleTimer = 0; }
  }).observe(main, { attributes: true, attributeFilter: ["data-mode", "data-state"] });

  const lookTarget = new THREE.Vector3();
  const easeOut = (x) => { const t = Math.max(0, Math.min(1, x)); return 1 - (1 - t) * (1 - t) * (1 - t); };
  const up = new THREE.Vector3(0, 1, 0);

  function placeWalker() {
    const y = height(walker.x, walker.z) + 3.2;
    camera.position.set(walker.x, y, walker.z);
    lookTarget.copy(camera.position).add(forward());
    camera.lookAt(lookTarget);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    /* The show. */
    if (playing) { showPos = Math.min(total - 0.001, showPos + dt); locate(); report(false); }
    const targetEnergy = energyOf(index);
    energy += (targetEnergy - energy) * Math.min(1, dt * 0.12);
    const f = total > 0 ? showPos / total : 0;
    skyMat.uniforms.uEnergy.value = energy;
    skyMat.uniforms.uC0.value.lerp(stopAt(STOPS_A, f), Math.min(1, dt * 0.12));
    skyMat.uniforms.uC1.value.lerp(stopAt(STOPS_B, f), Math.min(1, dt * 0.12));
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
    const moving_ = keys.fwd || keys.back || dragSpeed !== 0;
    if (mode === "walk") {
      const spd = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0) + dragSpeed;
      const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
      walker.heading += turn * 1.6 * dt;
      const fw = forward();
      walker.x += fw.x * spd * 12 * dt; walker.z += fw.z * spd * 12 * dt;
      const d = Math.hypot(walker.x, walker.z);
      if (d > 108) { walker.x *= 108 / d; walker.z *= 108 / d; }
      placeWalker();
      if (moving_ && !reduced) camera.position.y += 0.12 * Math.sin(elapsed * 9);
      if (!reduced) { idleTimer += dt; if (idleTimer > 15) { mode = "attract"; attractU = nearestU(walker.x, walker.z); } }
    } else if (mode === "descent") {
      const k = easeOut(elapsed / 6);
      const p0 = at(0), fw = forward();
      camera.position.set(p0.x * k, 140 + (p0.y + 3.2 - 140) * k, p0.z * k);
      lookTarget.set(p0.x * k + fw.x * (k * 2 + 0.05), (p0.y + 3.2) * k, p0.z * k + fw.z * (k * 2 + 0.05)); // a hair off vertical at the top, so the view is never straight down
      camera.lookAt(lookTarget);
      if (elapsed >= 6) { mode = "attract"; attractU = 0; }
    } else if (mode === "attract") {
      attractU += (10 / curveLength) * dt;
      const p = at(attractU), ahead = at(attractU + 0.015);
      camera.position.set(p.x, p.y + 3.2, p.z);
      camera.lookAt(ahead.x, ahead.y + 3.2, ahead.z);
      walker.x = p.x; walker.z = p.z; const tg = tangentAt(attractU); walker.heading = Math.atan2(-tg.x, -tg.z);
    } else if (mode === "drift") {
      if (reduced) {
        const p0 = at(0);
        camera.position.set(0, height(0, 0) + 8, 0);
        camera.lookAt(p0.x, p0.y, p0.z);
      } else {
        const u = uLead - 4 / curveLength;
        const p = at(u), tg = tangentAt(u);
        const side = new THREE.Vector3().crossVectors(tg, up).normalize();
        const sway = 2 * Math.sin((elapsed * Math.PI * 2) / 30);
        camera.position.set(p.x + side.x * sway, p.y + 5, p.z + side.z * sway);
        const lead = bears[0].g.position;
        camera.lookAt(lead.x, lead.y + 2, lead.z);
      }
    }

    renderer.render(scene, camera);
  }
  function nearestU(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 200; i++) { const p = curve.getPointAt(i / 200); const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i / 200; } }
    return best;
  }

  container.dataset.world = "ready";
  locate(); report(true); placeWalker();
  requestAnimationFrame(frame);
}
