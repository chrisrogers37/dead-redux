/* eslint-disable */
import * as THREE from "three";
import { G, height } from "./island.js";

/* The setlist is the path: a closed loop over the island, with a landmark at each song's point. */
export function buildPath(N) {
  const LOOP = [G(100, 186), G(97, 172), G(94, 158), G(90, 144), G(86, 128), G(82, 112), G(100, 100), G(118, 92), G(110, 72), G(104, 50),
    G(100, 14), G(42, 40), G(12, 100), G(66, 108), G(134, 108), G(188, 100), G(160, 160), G(122, 184), G(104, 180)];
  const loopCurve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "catmullrom", 0.5);
  /* With fewer than two songs the path is the bare loop, because a closed curve through one point has no length. */
  const points = N < 2 || N === LOOP.length ? LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z))
    : Array.from({ length: N }, (_, i) => loopCurve.getPointAt(i / N));
  const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
  const curveLength = curve.getLength();
  const at = (u) => { const p = curve.getPointAt(((u % 1) + 1) % 1); p.y = height(p.x, p.z); return p; };
  const tangentAt = (u) => curve.getTangentAt(((u % 1) + 1) % 1);
  return { points, curve, curveLength, at, tangentAt };
}

/* Each song's landmark stands at its point on the path, facing along it. */
export function placeLandmarks(scene, { points, tangentAt }, tracks, N, hasShow, { BUILDERS, standingStone }) {
  const landmarks = [];
  /* A show with no recording has no landmarks. */
  for (let i = 0; hasShow && i < N; i++) {
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
  return landmarks;
}
