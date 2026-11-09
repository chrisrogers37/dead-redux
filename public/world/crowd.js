/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FACING, height, SHELF_Y, STAGE } from "./ground.js";

/* The crowd on the hill: faceless, flat figures in the band's silhouette style, on the slope in front of the stage, drawn as one
   instanced mesh whose dance runs in the vertex shader, so it keeps the island's light and fog and costs one draw call; and the
   stage's rig, one instanced mesh of additive beams over their heads. Nothing is printed on anyone. */

/* What a figure does: dances standing near the stage, sways in the middle, sits up the hill, spins at the edges, or tapes (stands
   still among the mic poles); a pole is a figure the shader draws as a taper's mic stand. */
export const STAND = 0, SWAY = 1, SIT = 2, SPIN = 3, TAPER = 4, POLE = 5;

/* The seating, in rings round the stage's centre (m) and either side of its axis (rad): dancers from the front rail back to 28 m,
   swayers to 42 m, sitters to 55 m, spinners in the bands past the edges, and the tapers' block just off the axis, its poles among them. */
const RINGS = [
  { r0: 13.5, r1: 28, side: 0.7, gap: 1.05, kind: STAND },
  { r0: 28, r1: 42, side: 0.85, gap: 1.5, kind: SWAY },
  { r0: 42, r1: 55, side: 0.85, gap: 2.2, kind: SIT },
];
const EDGE = { r0: 16, r1: 44, side: 1.0, gap: 3.0 };
const TAPERS = { r0: 34, r1: 40.5, from: -0.34, to: -0.16, gap: 1.2 };
export const CROWD_FAR = 55;

/* A few colours, dark enough to read as silhouettes against the lit slope and the panel. */
const PALETTE = [0x3b2a3f, 0x2b2f4a, 0x5a3326, 0x34402c, 0x2f4257, 0x262428, 0x6a2f4f, 0x6b4a22, 0x1f2a2a];
const POLE_COLOR = 0x2a2a2e;

function random(seed) {
  let a = (Math.floor(Math.abs(seed) * 1e6) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A seat at `r` metres from the stage's centre, `th` radians off its axis (toward the island's middle). */
const seatAt = (r, th) => [STAGE[0] + r * Math.sin(FACING + th), STAGE[1] + r * Math.cos(FACING + th)];

/* The seats: a jittered grid in rings round the stage, kept clear of the path, the bears' line and the landmarks; the tapers' block
   and the edges' spinners laid over the rings. Each seat is [x, z, r, th, kind]. */
export function seats(rnd, { path, line, landmarks }) {
  const out = [];
  const jitter = (gap) => (rnd() - 0.5) * 0.7 * gap;
  const inTapers = (r, th) => r >= TAPERS.r0 && r < TAPERS.r1 && th >= TAPERS.from && th < TAPERS.to;
  for (const ring of RINGS) {
    for (let r = ring.r0 + ring.gap / 2; r < ring.r1; r += ring.gap) {
      const n = Math.max(1, Math.floor((2 * ring.side * r) / ring.gap));
      for (let k = 0; k < n; k++) {
        const rr = r + jitter(ring.gap), th = -ring.side + ((k + 0.5) * 2 * ring.side) / n + jitter(ring.gap) / r;
        if (inTapers(rr, th)) continue;
        out.push([...seatAt(rr, th), rr, th, ring.kind]);
      }
    }
  }
  for (let r = EDGE.r0; r < EDGE.r1; r += EDGE.gap) {
    const inner = r < 28 ? 0.7 : 0.85;
    for (const s of [-1, 1]) {
      for (let th = inner + EDGE.gap / r / 2; th < EDGE.side; th += EDGE.gap / r) {
        const rr = r + jitter(EDGE.gap), t = s * (th + jitter(EDGE.gap) / r);
        out.push([...seatAt(rr, t), rr, t, SPIN]);
      }
    }
  }
  let row = 0;
  for (let r = TAPERS.r0 + TAPERS.gap / 2; r < TAPERS.r1; r += TAPERS.gap, row++) {
    const n = Math.floor(((TAPERS.to - TAPERS.from) * r) / TAPERS.gap);
    for (let k = 0; k < n; k++) {
      const th = TAPERS.from + ((k + 0.5) * (TAPERS.to - TAPERS.from)) / n;
      out.push([...seatAt(r + jitter(TAPERS.gap) * 0.4, th), r, th, (k + row) % 2 ? POLE : TAPER]);
    }
  }
  /* What a seat keeps clear of: the path's centre by 4 m, the bears' line by 4 m, and each landmark's centre by 8 m. */
  const near = [];
  const keep = (x, z, d) => { if (Math.hypot(x - STAGE[0], z - STAGE[1]) < CROWD_FAR + 12) near.push([x, z, d * d]); };
  for (let i = 0; i < 1200; i++) { const p = path.at(i / 1200); keep(p.x, p.z, 4); }
  for (let d = 0; d < line.length; d += 1) { const p = line.at(d); keep(p.x, p.z, 4); }
  for (const l of landmarks) keep(l.position.x, l.position.z, 8);
  return out.filter(([x, z]) => near.every(([nx, nz, d2]) => (x - nx) * (x - nx) + (z - nz) * (z - nz) >= d2));
}

/* One figure, standing on y = 0 and facing +z: legs, torso, head and two arms, each vertex marked with its part (aPart) for the shader. */
function figureGeometry() {
  const part = (geo, k) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1));
    return g;
  };
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.2, 0.15, 0.86, 6, 1, true).translate(0, 0.43, 0), 0),
    part(new THREE.CylinderGeometry(0.27, 0.2, 0.62, 6, 1, false).translate(0, 1.17, 0), 1),
    part(new THREE.IcosahedronGeometry(0.15, 0).translate(0, 1.68, 0), 2),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(-0.3, 1.44 - 0.31, 0), 3),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(0.3, 1.44 - 0.31, 0), 4),
  ]);
}

/* The dance, in the figure's own frame before its instance matrix. aSeat is (kind, phase, distance from the front 0-1, eagerness 0-1).
   The build-up raises arms, the front first, so the rise ripples back up the hill; spinners turn with their arms out over flared
   skirts; sitters sit, and everyone sits when uSit is 1; a pole draws as a thin stand with a mic and a bar. */
const DANCE = `
  int kind = int(aSeat.x + 0.5), part = int(aPart + 0.5);
  float ph = aSeat.y;
  float lift = clamp((uBuild - 0.5 * aSeat.z - 0.3 * aSeat.w) / 0.25, 0.0, 1.0);
  if (kind == 5) {
    if (part <= 1) { transformed.xz *= 0.12; transformed.y *= 2.3; }
    else if (part == 2) { transformed = (transformed - vec3(0.0, 1.68, 0.0)) * vec3(0.55, 0.8, 0.55) + vec3(0.0, 3.5, 0.0); }
    else {
      float sd = part == 3 ? -1.0 : 1.0;
      vec3 q = transformed - vec3(0.3 * sd, 1.44, 0.0);
      q = vec3(-q.y * sd, q.x * sd, q.z) * vec3(0.5, 0.35, 0.35);
      transformed = vec3(0.0, 3.32, 0.0) + q;
    }
  } else {
    float arm = 0.15;
    if (kind == 0 || kind == 1) arm = mix(0.15, 2.75, lift);
    else if (kind == 3) arm = 1.45;
    else if (kind == 2) arm = 0.3;
    if (part >= 3) {
      float sd = part == 3 ? -1.0 : 1.0;
      vec3 pv = vec3(0.3 * sd, 1.44, 0.0);
      vec3 q = transformed - pv;
      float ca = cos(arm * sd);
      float sa = sin(arm * sd);
      transformed = pv + vec3(q.x * ca - q.y * sa, q.x * sa + q.y * ca, q.z);
    }
    if (kind == 3 && part == 0) transformed.xz *= 1.0 + 1.8 * clamp((0.86 - transformed.y) / 0.86, 0.0, 1.0);
    float sit = kind == 2 ? 1.0 : kind == 3 ? 0.0 : uSit;
    if (part == 0) { transformed.y *= mix(1.0, 0.18, sit); transformed.z += 0.3 * sit; }
    else transformed.y -= 0.66 * sit;
    if (kind == 3) {
      float ta = uTime * (2.2 + 1.2 * ph) + ph * 6.2832;
      float ct = cos(ta);
      float st = sin(ta);
      transformed.xz = vec2(transformed.x * ct + transformed.z * st, -transformed.x * st + transformed.z * ct);
    }
    float amp = kind == 1 ? 0.13 : kind == 0 ? 0.07 : 0.03;
    float sw = uLevel * amp * sin(3.14159 * (uBeats + ph * 0.5));
    float cs = cos(sw), ss = sin(sw);
    transformed.xy = vec2(transformed.x * cs - transformed.y * ss, transformed.x * ss + transformed.y * cs);
    float hop = kind == 0 ? 0.08 + 0.14 * lift : kind == 1 ? 0.04 : 0.015;
    transformed.y += uLevel * hop * max(0.0, sin(6.2832 * (uBeats + ph * 0.15)));
  }
`;

/* Builds the crowd: up to `count` figures, the front kept first, so a smaller count thins the back of the hill before the front.
   Returns the mesh and `move`, which plays them; under reduced motion nothing calls it, so they hold their places. */
export function buildCrowd(scene, { count, seed, path, line, landmarks }) {
  const rnd = random(seed + 0.618);
  const all = seats(rnd, { path, line, landmarks });
  /* Front and middle first, with a random spread, so any prefix keeps the crowd's shape. */
  const ranked = all.map((s) => ({ s, key: rnd() * (0.4 + Math.min(1, (s[2] - 13.5) / (CROWD_FAR - 13.5))) }))
    .sort((a, b) => a.key - b.key).slice(0, count).map((o) => o.s);
  const n = ranked.length;
  const geo = figureGeometry();
  const seat = new Float32Array(n * 4);
  const uniforms = { uBeats: { value: 0 }, uTime: { value: 0 }, uLevel: { value: 0 }, uBuild: { value: 0 }, uSit: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPart;\nattribute vec4 aSeat;\nuniform float uBeats, uTime, uLevel, uBuild, uSit;")
      .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_INSTANCING_COLOR )\n  vColor.rgb *= aPart < 0.5 ? 0.62 : (aPart > 1.5 && aPart < 2.5 ? 0.85 : 1.0);\n#endif")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + DANCE);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  mesh.count = n;
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  ranked.forEach(([x, z, r, th, kind], i) => {
    dummy.position.set(x, height(x, z), z);
    dummy.rotation.set(0, FACING + th + Math.PI + (kind === POLE ? 0 : (rnd() - 0.5) * 0.5), 0);
    dummy.scale.setScalar(kind === POLE ? 1 : 0.9 + rnd() * 0.18);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(kind === POLE ? POLE_COLOR : PALETTE[Math.floor(rnd() * PALETTE.length)]));
    seat.set([kind, rnd(), Math.min(1, Math.max(0, (r - 13.5) / (CROWD_FAR - 13.5))), rnd()], i * 4);
  });
  geo.setAttribute("aSeat", new THREE.InstancedBufferAttribute(seat, 4));
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += 3;
  scene.add(mesh);

  /* Plays the figures: `beats` is the band's phase in beats (beat.js), `t` the world's time, `build` the build-up as it acts, and
     `sit` whether the show sits (Space). Each change eases over 0.8 s, as the band's does. */
  let level = 0, sitting = 0;
  function move(dt, t, beats, playing, build, sit) {
    level = Math.max(0, Math.min(1, level + (playing ? dt : -dt) / 0.8));
    sitting = Math.max(0, Math.min(1, sitting + (sit ? dt : -dt) / 0.8));
    uniforms.uBeats.value = beats;
    uniforms.uTime.value = t;
    uniforms.uLevel.value = level;
    uniforms.uBuild.value = build;
    uniforms.uSit.value = sitting;
  }
  return { mesh, move, count: n };
}

/* The rig: `count` lamps along the front of the stage's roof, each a beam of added light that fades to nothing 46 m out, in the sky's
   two colours. They fan out over the crowd, sweep on the band's beat, and lift toward the sky as a build-up nears its peak. */
export function buildRig(scene, count = 8) {
  const H = 46;
  const geo = new THREE.CylinderGeometry(0.25, 3.2, H, 12, 1, true).translate(0, -H / 2, 0).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, fade = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) fade.fill(Math.pow(1 - Math.min(1, Math.max(0, pos.getZ(i) / H)), 1.6), i * 3, i * 3 + 3);
  geo.setAttribute("color", new THREE.BufferAttribute(fade, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const c = Math.cos(FACING), s = Math.sin(FACING);
  const toWorld = (x, y, z) => new THREE.Vector3(STAGE[0] + x * c + z * s, SHELF_Y + y, STAGE[1] - x * s + z * c);
  const lamps = Array.from({ length: count }, (_, i) => ({
    at: toWorld(-7.5 + (15 * i) / Math.max(1, count - 1), 8.0, 4.4),
    az: -0.62 + (1.24 * i) / Math.max(1, count - 1),
    el: i % 2 ? 0.42 : 0.16,
  }));
  /* Every place a beam can reach, once, so the mesh culls against the camera without measuring its moving beams each frame. */
  mesh.boundingSphere = new THREE.Sphere(toWorld(0, 18, 26), 58);
  scene.add(mesh);
  const dummy = new THREE.Object3D(), dir = new THREE.Vector3(), color = new THREE.Color();
  /* Aims the beams: `beats` the band's phase, `level` how far they follow it (0-1), `build` the build-up as it acts, and c0 and c1 the
     sky's colours. */
  function aim(beats, level, build, c0, c1) {
    lamps.forEach((l, i) => {
      const swing = level * 0.32 * Math.sin((Math.PI / 2) * beats + i * 1.3);
      const az = l.az * (1 - 0.35 * build) + swing, el = l.el + 0.45 * build + level * 0.08 * Math.sin(Math.PI * beats + i);
      const lx = Math.sin(az) * Math.cos(el), ly = Math.sin(el), lz = Math.cos(az) * Math.cos(el);
      dir.set(lx * c + lz * s, ly, -lx * s + lz * c);
      dummy.position.copy(l.at);
      dummy.lookAt(dir.add(l.at));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.copy(i % 2 ? c1 : c0));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  aim(0, 0, 0, new THREE.Color(0xe8b04b), new THREE.Color(0xd6508a));
  return { mesh, aim };
}
