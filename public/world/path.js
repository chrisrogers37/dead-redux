/* eslint-disable */
import * as THREE from "three";
import { FIRST_EYE, G, height, TRAILHEAD } from "./ground.js";
import { hull, standClear } from "./collide.js";
import { isDrums, isSpace } from "./seats.js";

/* The setlist is the path: a closed loop over the island, with a landmark at each song's point. */
export function buildPath() {
  const LOOP = [TRAILHEAD, G(97, 172), G(94, 158), G(90, 144), G(86, 128), G(82, 112), G(100, 100), G(118, 92), G(110, 72), G(104, 50),
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
  const drums = tracks.findIndex((t) => isDrums(t.title)), space = tracks.findIndex((t) => isSpace(t.title));
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

/* The test hook ?pose=near-K (main.js) stands the visitor NEAR_SHORT m short of a landmark, in a straight line, or one of the NEAR_CLOSER
   distances where another landmark would stand in the view: within NEAR_CLEAR m of the line of sight. At each it also keeps the
   NEAR_ROOM beside it from the landmark's furthest reach (placeLandmarks), so that a long landmark's near end is not under the
   frame: the road's slab reaches 9.2 m. The first-person view is centred NEAR_AIM m up the landmark, which at 14 m keeps the foot
   and the top of a 12 m landmark in a desktop's frame, and a flat one, lying downhill, in it too. */
const NEAR_SHORT = 14, NEAR_CLOSER = [11, 8], NEAR_ROOM = [8, 6, 4], NEAR_CLEAR = 4, NEAR_AIM = 4;

/* Where ?pose=near-K stands the visitor: on the path, `short` metres in a straight line from where landmark k really stands, which may be
   off its song's point (placeLandmarks), or as far as its reach asks, found by stepping back along the path from that point, the
   first song's round the loop's closing. A landmark that already stands that far or further from its song's point is seen from the
   point. Where another landmark
   stands in the view from there, the visitor stands closer, at the first of NEAR_CLOSER that clears it, or the last, and `clear` says
   whether the view is clear in the end. It faces the landmark and looks NEAR_AIM m up it, no steeper than the walk's own tilt goes
   (0.8 rad, main.js). Null where there is no landmark k, or the path never gets `short` metres from it. */
export function nearStand({ at, curveLength }, landmarkU, landmarks, k, short = NEAR_SHORT) {
  const to = landmarks[k]?.position;
  if (!to) return null;
  const gap = (p) => Math.hypot(p.x - to.x, p.z - to.z);
  const step = 0.25 / curveLength;
  /* The spot on the path `away` metres from the landmark, behind its song's point. */
  const spot = (away) => {
    let near = landmarkU[k], far = near;
    for (let n = 1; gap(at(far)) < away; n++) {
      if (n * step >= 1) return null;
      near = far;
      far = landmarkU[k] - n * step;
    }
    /* Between the last step inside `away` and the first one out of it, the spot that is `away` from the landmark. */
    for (let i = 0; near !== far && i < 40; i++) { const mid = (near + far) / 2; if (gap(at(mid)) < away) near = mid; else far = mid; }
    return at(far);
  };
  /* Whether another landmark stands in the view from p: between the eye and this landmark, within NEAR_CLEAR m of the line of sight. */
  const blocked = (p) => landmarks.some(({ position: q }, j) => {
    if (j === k) return false;
    const dx = to.x - p.x, dz = to.z - p.z, t = ((q.x - p.x) * dx + (q.z - p.z) * dz) / (dx * dx + dz * dz);
    return t > 0 && t < 1 && Math.hypot(q.x - p.x - dx * t, q.z - p.z - dz * t) < NEAR_CLEAR;
  });
  /* How far the landmark reaches from its own middle, seen from above; a stand keeps its room from that. */
  const reach = landmarks[k].userData?.reach ?? 0;
  let p = spot(Math.max(short, reach + NEAR_ROOM[0]));
  if (!p) return null;
  for (const [n, closer] of NEAR_CLOSER.entries()) {
    if (closer >= short || !blocked(p)) break;
    p = spot(Math.max(closer, reach + NEAR_ROOM[n + 1]));
  }
  const pitch = Math.atan2(to.y + NEAR_AIM - p.y - FIRST_EYE, gap(p));
  return { x: p.x, z: p.z, heading: Math.atan2(p.x - to.x, p.z - to.z), pitch: Math.max(-0.8, Math.min(0.8, pitch)), clear: !blocked(p) };
}

/* The bears' line: `side` metres to the left of the path. On the inside of a left bend it is drawn in so it never turns tighter than
   `rMin` metres, eased in and out over `ease` metres either side, then rounded by `passes` of neighbour averaging, which keeps its
   tightest turn wider than a bear. On a right bend it stays out: the outside of a bend, even where the loop doubles back at its
   closing, is rounder than the path. It keeps its own arc-length table, so bears spaced along it by distance keep their gaps and an
   even pace. `dOf` converts the path's u to distance on the line. */
export function buildWalkLine({ curve, curveLength }, side, rMin = 4.5, passes = 200, ease = 8) {
  const M = 1600, ds = curveLength / M;
  const P = [], T = [], N = [];
  for (let i = 0; i < M; i++) {
    const p = curve.getPointAt(i / M), t = curve.getTangentAt(i / M), l = Math.hypot(t.x, t.z);
    P.push([p.x, p.z]); T.push([t.x / l, t.z / l]); N.push([t.z / l, -t.x / l]);
  }
  const wrap = (i) => (i + M) % M;
  const room = P.map((_, i) => {
    const a = T[wrap(i - 1)], b = T[wrap(i + 1)], n = N[i];
    const k = ((b[0] - a[0]) * n[0] + (b[1] - a[1]) * n[1]) / (2 * ds); // above 0 where the path bends toward the line
    return k > 0 ? Math.max(0, Math.min(side, 1 / k - rMin)) : side;
  });
  const W = Math.round(ease / ds);
  const near = room.map((_, i) => { let m = Infinity; for (let j = -W; j <= W; j++) m = Math.min(m, room[wrap(i + j)]); return m; });
  const offset = near.map((_, i) => { let s = 0; for (let j = -W; j <= W; j++) s += near[wrap(i + j)]; return s / (2 * W + 1); });
  let Q = P.map(([x, z], i) => [x + N[i][0] * offset[i], z + N[i][1] * offset[i]]);
  for (let pass = 0; pass < passes; pass++) {
    Q = Q.map((q, i) => { const a = Q[wrap(i - 1)], b = Q[wrap(i + 1)]; return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4]; });
  }
  const D = [0];
  for (let i = 1; i <= M; i++) { const a = Q[i - 1], b = Q[i % M]; D.push(D[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const length = D[M];
  /* The fractional sample at a distance along the line, which wraps round the loop. */
  const sampleAt = (d) => {
    const x = ((d % length) + length) % length;
    let lo = 0, hi = M;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (D[mid] <= x) lo = mid; else hi = mid; }
    return lo + (x - D[lo]) / (D[lo + 1] - D[lo] || 1);
  };
  const at = (d) => {
    const f = sampleAt(d), i = Math.floor(f), w = f - i, a = Q[i % M], b = Q[(i + 1) % M];
    const x = a[0] + (b[0] - a[0]) * w, z = a[1] + (b[1] - a[1]) * w;
    return new THREE.Vector3(x, height(x, z), z);
  };
  const tangentAt = (d) => { const a = at(d - 1), b = at(d + 1); return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); };
  const dOf = (u) => { const f = (((u % 1) + 1) % 1) * M, i = Math.floor(f); return D[i] + (D[i + 1] - D[i]) * (f - i); };
  return { length, at, tangentAt, dOf };
}

/* A landmark's outline seen from above, in its own frame (collide.js): the hull of all its parts, a part that spins covering the
   circle it turns through. */
function outline(g, moving) {
  const v = new THREE.Vector3(), pts = [];
  for (const o of g.children) {
    if (!o.isMesh) continue;
    o.updateMatrix();
    const pos = o.geometry.attributes.position, spins = moving.some((m) => m.obj === o && m.kind === "spin");
    const { x, z } = o.position;
    let r = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrix);
      if (spins) r = Math.max(r, Math.hypot(v.x - x, v.z - z));
      else pts.push([v.x, v.z]);
    }
    for (let k = 0; spins && k < 32; k++) pts.push([x + r * Math.cos((k * Math.PI) / 16), z + r * Math.sin((k * Math.PI) / 16)]);
  }
  return hull(pts);
}

/* Each song's landmark stands at its point on the path, facing along it, unless the bears' line passes too near: then at the nearest
   spot clear of the line (collide.js). */
export function placeLandmarks(scene, { at, tangentAt }, tracks, hasShow, { BUILDERS, standingStone, moving }, landmarkU, line) {
  const landmarks = [];
  /* The bears' line, a point every quarter metre. */
  const pts = [];
  for (let d = 0; d < line.length; d += 0.25) { const p = line.at(d); pts.push([p.x, p.z]); }
  /* A show with no recording has no landmarks. */
  for (let i = 0; hasShow && i < tracks.length; i++) {
    const g = new THREE.Group();
    const p = at(landmarkU[i]);
    const t = tangentAt(landmarkU[i]);
    g.rotation.y = Math.atan2(t.x, t.z);
    const b = BUILDERS.find(([re]) => re.test(tracks[i].title));
    /* A song with a landmark of its own gets it; any other, its title's standing stone. */
    if (b) b[1](g);
    else standingStone(g, tracks[i].title);
    const edge = outline(g, moving);
    const s = standClear(p.x, p.z, g.rotation.y, edge, pts);
    g.position.set(s.x, height(s.x, s.z), s.z);
    /* How far it reaches from its own middle, seen from above: ?pose=near-K stands back from a long landmark by it (nearStand). */
    g.userData.reach = Math.max(0, ...edge.map(([x, z]) => Math.hypot(x, z)));
    scene.add(g);
    landmarks.push(g);
  }
  return landmarks;
}

/* A band of the island's stone, glowing amber, on the ground between two landmarks whose first song segues into the next,
   so the show's structure reads on the island. */
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
  if (arr.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  const lit = new THREE.MeshLambertMaterial({ color: 0x8e8a82, emissive: 0xe8b04b, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geo, lit));
  return lit;
}
