/* eslint-disable */
import * as THREE from "three";
import { G, height } from "./island.js";

/* The setlist is the path: a closed loop over the island, with a landmark at each song's point. */
export function buildPath() {
  const LOOP = [G(100, 186), G(97, 172), G(94, 158), G(90, 144), G(86, 128), G(82, 112), G(100, 100), G(118, 92), G(110, 72), G(104, 50),
    G(100, 14), G(42, 40), G(12, 100), G(66, 108), G(134, 108), G(188, 100), G(160, 160), G(122, 184), G(104, 180)];
  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "catmullrom", 0.5);
  /* Twenty arc-length steps per loop point, so each loop point falls on a step. */
  curve.arcLengthDivisions = LOOP.length * 20;
  const lengths = curve.getLengths();
  const curveLength = lengths[lengths.length - 1];
  const at = (u) => { const p = curve.getPointAt(((u % 1) + 1) % 1); p.y = height(p.x, p.z); return p; };
  const tangentAt = (u) => curve.getTangentAt(((u % 1) + 1) % 1);
  /* Where loop point k lies along the loop, from 0 at the trailhead to 1 back at it. */
  const pointU = (k) => lengths[k * 20] / curveLength;
  return { curve, curveLength, at, tangentAt, pointU };
}

/* Where each song's landmark stands along the loop (0 to 1 from the trailhead), with one more entry, 1, for the show's end.
   Songs are spaced by their start times between pins: set 2's opener on the summit (loop point 6), Drums in the left cave
   (point 13) and Space in the right one (point 14). A pin that does not apply, or would run backward, is left out. */
export function layout(tracks, set2Start, { pointU }) {
  const N = tracks.length;
  const start = [0];
  for (const t of tracks) start.push(start[start.length - 1] + t.duration);
  const drums = tracks.findIndex((t) => /drums/i.test(t.title)), space = tracks.findIndex((t) => /space/i.test(t.title));
  const pins = [[0, 0]];
  for (const [i, u] of [[set2Start, pointU(6)], [drums, pointU(13)], [space, pointU(14)]]) {
    if (i !== null && i > pins[pins.length - 1][0] && i < N) pins.push([i, u]);
  }
  pins.push([N, 1]);
  const landmarkU = [];
  for (let p = 0; p < pins.length - 1; p++) {
    const [ia, ua] = pins[p], [ib, ub] = pins[p + 1], span = start[ib] - start[ia];
    for (let i = ia; i < ib; i++) landmarkU.push(ua + (span > 0 ? (start[i] - start[ia]) / span : (i - ia) / (ib - ia)) * (ub - ua));
  }
  landmarkU.push(1);
  return landmarkU;
}

/* Each song's landmark stands at its point on the path, facing along it. */
export function placeLandmarks(scene, { at, tangentAt }, tracks, hasShow, { BUILDERS, standingStone }, landmarkU) {
  const landmarks = [];
  /* A show with no recording has no landmarks. */
  for (let i = 0; hasShow && i < tracks.length; i++) {
    const g = new THREE.Group();
    const p = at(landmarkU[i]);
    g.position.copy(p);
    const t = tangentAt(landmarkU[i]);
    g.rotation.y = Math.atan2(t.x, t.z);
    const b = BUILDERS.find(([re]) => re.test(tracks[i].title));
    (b ? b[1] : standingStone)(g);
    scene.add(g);
    landmarks.push(g);
  }
  return landmarks;
}

/* A lit band on the ground between two landmarks whose first song segues into the next, so the show's structure reads on the island. */
export function buildSegues(scene, { at, tangentAt, curveLength }, tracks, landmarkU) {
  const arr = [];
  for (let i = 0; i < tracks.length - 1; i++) {
    if (!tracks[i].segueOut) continue;
    /* Samples every two metres or so along the loop, with an edge point a metre to either side of each. */
    const u0 = landmarkU[i], u1 = landmarkU[i + 1], n = Math.max(2, Math.ceil((u1 - u0) * curveLength / 2));
    const left = [], right = [];
    for (let s = 0; s <= n; s++) {
      const u = u0 + (u1 - u0) * (s / n), p = at(u), t = tangentAt(u), len = Math.hypot(t.x, t.z);
      const sx = -t.z / len, sz = t.x / len;
      left.push([p.x + sx, height(p.x + sx, p.z + sz) + 0.35, p.z + sz]);
      right.push([p.x - sx, height(p.x - sx, p.z - sz) + 0.35, p.z - sz]);
    }
    for (let s = 0; s < n; s++) arr.push(...left[s], ...left[s + 1], ...right[s], ...right[s], ...left[s + 1], ...right[s + 1]);
  }
  if (arr.length === 0) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.25, side: THREE.DoubleSide })));
}
