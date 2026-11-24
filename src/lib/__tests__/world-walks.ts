import { readFileSync } from "fs";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { swift } from "../../../public/world/avatar.js";
import { height } from "../../../public/world/ground.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { confine } from "../../../public/world/modes.js";
import { surfaceOf } from "../../../public/world/island.js";
import { buildPath, buildWalkLine, layout, nearStand, outline, placeLandmarks } from "../../../public/world/path.js";
import { buildTrees, cameraWays, placeTrees, TARGET } from "../../../public/world/trees.js";

// What the tests that walk the world share: a show's songs and its landmarks placed, a frame of a walk, the walk's camera stepped
// through one, and the test of a point against what is drawn. Not a test.

/** public/maps/, one map a show. */
export const MAPS = new URL("../../../public/maps/", import.meta.url);

/**
 * A show's songs as its map has them.
 *
 * @param date The show's date, which names its map.
 * @returns Each track's title and how long it plays, in s.
 */
export const tracksOf = (date: string) =>
  (JSON.parse(readFileSync(new URL(`${date}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] }).tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));

/** The world's own path, and the bears' line 7 m to its left, as main.js builds them. */
export const path = buildPath(), line = buildWalkLine(path, 7);

/**
 * A show's landmarks placed as main.js places them.
 *
 * @param tracks The show's songs (tracksOf).
 * @param set2 The track its second set opens at, which the maps do not hold; null for a show with one set.
 * @param phone Whether they are a phone's, which have fewer faces.
 * @param as Songs whose landmarks are built for other titles, as ?as=K:Title does: [K, title] each.
 * @returns Where each song stands along the path, the builders, and the landmarks.
 */
export function landmarksOf(tracks: { title: string; duration: number }[], set2: number | null, phone: boolean, as: [number, string][] = []) {
  const landmarkU = layout(tracks, set2, path), builders = makeBuilders(phone), titles = new Map(as);
  const landmarks = placeLandmarks(new THREE.Scene(), path, tracks.map((t, k) => ({ ...t, title: titles.get(k) ?? t.title })), true, builders, landmarkU, line, surfaceOf(phone ? 52 : 80));
  return { landmarkU, builders, landmarks };
}

/** What a show's trees give a walk and its camera (trees.js): the trunks near a place, and the camera's way round one and under a crown. */
export type Wood = {
  trunks(x: number, z: number, r: number): { x: number; z: number }[];
  slide(p: unknown, room: number, toward?: unknown): void;
  ceiling(x: number, y: number, z: number, room: number): number;
};

/**
 * A show's trees planted and built as main.js plants them for a tier: by its landmarks' outlines and the ways of its cameras.
 *
 * @param placed The show's landmarks (landmarksOf).
 * @param phone Whether they are a phone's trees, which are fewer.
 * @returns The trees' keep-outs.
 */
export function treesOf({ landmarkU, builders, landmarks }: ReturnType<typeof landmarksOf>, phone: boolean) {
  const all = landmarks as { position: { x: number; z: number }; rotation: { y: number } }[];
  const marks = all.map((g, k) => {
    const s = nearStand(path, landmarkU, all, k) as { x: number; z: number } | null;
    return { x: g.position.x, z: g.position.z, rot: g.rotation.y, poly: outline(g, builders.moving), d: line.dOf(landmarkU[k]), stand: s ? { x: s.x, z: s.z } : null };
  });
  const loop = Array.from({ length: Math.ceil(path.curveLength / 2) }, (_, k) => { const p = path.at((2 * k) / path.curveLength); return [p.x, p.z]; });
  const along = Array.from({ length: Math.ceil(line.length) }, (_, d) => { const p = line.at(d); return [p.x, p.z]; });
  const ways = (cameraWays as unknown as (ask: unknown) => object)({ line, height, marks, phone, bears: phone ? [3, 1] : [5, 3, 1] });
  const { spots } = (placeTrees as unknown as (ask: unknown) => { spots: unknown[] })({ count: phone ? TARGET.phone : TARGET.desktop, loop, line: along, landmarks: marks, ...ways });
  // A stand-in for the light the ground takes.
  const lit = (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; };
  return (buildTrees as unknown as (scene: unknown, spots: unknown[], how: unknown) => Wood)(new THREE.Scene(), spots, { lit, phone });
}

/**
 * How often a line crosses a skin of triangles.
 *
 * @param tris The triangles, nine numbers each.
 * @param way The line's way from the point (x, y, z).
 * @param most How far along the way, in lengths of it, a crossing still counts: all of it when left out.
 * @returns The number of triangles the line crosses ahead of the point.
 */
export function crossings(tris: ArrayLike<number>, x: number, y: number, z: number, [dx, dy, dz]: number[], most = Infinity) {
  let hits = 0;
  for (let o = 0; o < tris.length; o += 9) {
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az, e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const tx = x - ax, ty = y - ay, tz = z - az, u = (tx * px + ty * py + tz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) / det;
    if (w < 0 || u + w > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (t > 0 && t < most) hits += 1;
  }
  return hits;
}

/** Three nearly level ways, a third of a turn apart. */
const LEVEL = [[1, 0.0003, 0.0007], [-0.5, 0.0005, 0.866], [-0.5, -0.0004, -0.866]];

/**
 * Whether a point is inside what the triangles draw: a nearly level line from it crosses the skin an odd number of times, along each
 * of three ways. A tube open at its ends, as a trunk is, is one a level line from inside never leaves by; a line from outside that
 * leaves by an open end crosses once, but not along all three ways.
 *
 * @param tris The triangles, nine numbers each.
 * @returns Whether (x, y, z) is inside them.
 */
export const within = (tris: ArrayLike<number>, x: number, y: number, z: number) => LEVEL.every((way) => crossings(tris, x, y, z, way) % 2 === 1);

/** A frame of the world's time, in s, at 60 frames a second. */
export const DT = 1 / 60;

/**
 * How far the walk's camera goes in one such frame at its swiftest, where a landmark or the stage has moved its goal (avatar.js
 * `swift`, which says the figures).
 *
 * @param phone Whether the camera is a phone's, whose boom is longer.
 * @returns The distance, in m.
 */
export const pace = (phone: boolean) => swift(phone) / 60;

/** Where the visitor stands and looks, as main.js keeps it. */
export type Walker = { x: number; z: number; heading: number; pitch: number };

/**
 * One frame of a walk, as main.js takes it: the keys tilt the view, turn the walker and move it, and the walk's limits keep it where
 * a walker may stand.
 *
 * @param walker The walker, moved in place.
 * @param keys What is held: forward (1) or back (-1), a step to the right (1) or the left (-1), a turn to the left (1) or the right
 *   (-1), whether it runs, and a look up (1) or down (-1). A stick gives the parts between.
 * @param limits The walk's limits (modes.js walkLimits).
 */
export function stride(walker: Walker, [spd, side, turn, run, tilt]: number[], limits: unknown) {
  walker.pitch = Math.max(-0.8, Math.min(0.8, walker.pitch + (tilt * 1.2) / 60));
  walker.heading += (turn * 1.6) / 60;
  const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading), pace = (12 * (run ? 1.6 : 1)) / 60;
  walker.x += (fx * spd - fz * side) * pace; walker.z += (fz * spd + fx * side) * pace;
  confine(walker, limits as never);
}

/** The visitor's bear and its camera, as avatar.js builds them. */
export type Avatar = {
  /** The bear: its group, which holds all it draws. */
  g: unknown;
  step(x: number, z: number, heading: number, dt: number): void;
  boom(camera: unknown, walker: Walker, dt: number, cut: boolean): unknown;
  settle(position: unknown, aim: unknown): void;
};

const was = new THREE.Vector3();
/**
 * Steps the walk's camera through a walk, cutting to its first frame: each frame the walker is stood, the bear takes its step, and
 * the boom places the camera.
 *
 * @param camera A three camera, which the boom places.
 * @param walker The walker, which `stand` moves.
 * @param frames How many frames.
 * @param stand Puts the walker where frame `f` has it.
 * @param counted The first frame whose move counts: the frames after a cut settle the boom. 2 when left out.
 * @param first The first frame's length, in s: a frame's when left out.
 * @param steps Whether the bear takes its step each frame: it does when left out.
 * @returns The camera's largest move in one frame, in m.
 */
export function walkCamera(avatar: Avatar, camera: { position: { distanceTo(v: unknown): number } }, walker: Walker, frames: number, stand: (f: number, walker: Walker) => void, { counted = 2, first = DT, steps = true } = {}) {
  let most = 0;
  for (let f = 0; f < frames; f++) {
    stand(f, walker);
    if (steps) avatar.step(walker.x, walker.z, walker.heading, DT);
    avatar.boom(camera, walker, f ? DT : first, f === 0);
    if (f >= counted) most = Math.max(most, camera.position.distanceTo(was));
    was.copy(camera.position);
  }
  return most;
}
