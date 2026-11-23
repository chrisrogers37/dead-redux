import { readFileSync } from "fs";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { boomLength, buildAvatar, eyeRoom, GATHER, GRACE, HEAD, keepOutBox, LAND, SLACK, swift } from "../../../public/world/avatar.js";
import { LEAST } from "../../../public/world/boom.js";
import { BOUND, height, STAGE, STAGE_COLUMN, STAGE_REACH } from "../../../public/world/ground.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { confine, walkLimits } from "../../../public/world/modes.js";
import { buildPath, buildWalkLine, layout, placeLandmarks } from "../../../public/world/path.js";

// The walk's camera at the landmarks and the stage (issue #178), stepped here with the world's own avatar.js, boom.js and collide.js
// and no browser, as main.js steps it: the visitor walks, the bear takes its step, the boom places the camera. The landmarks are a
// show's own, placed as main.js places them, and the stage is its column. There is no crowd and there are no trees here: the crowd
// raises the camera by a rule of its own (crowd.js `over`), and trees.test.ts holds the camera among the trees.
//
// The shows are named by date, each with the track its second set opens at, which the maps do not hold:
// - 1986-07-04, the fixed day's show, from track 7: the Lovelight tower, the wheel, the bandstand, the road and the caves' two;
// - 1971-12-09 from track 17, where the review of #183 found the road's box leaving the bear's head on a slope;
// - 1970-12-31 from track 11, which stands Uncle John's bandstand where the ground falls 6.6 m across it;
// - 1987-09-12 from track 18, with Space at its cave's mouth.
const SHOWS: [string, number][] = [["1986-07-04", 7], ["1971-12-09", 17], ["1970-12-31", 11], ["1987-09-12", 18]];

type Point = { x: number; y: number; z: number };
type Box = { min: Point; max: Point };
type Walker = { x: number; z: number; heading: number; pitch: number };
// A walk: where it starts and the keys held at each frame (forward, sideways, turn, run, tilt, as main.js reads them).
type Walk = { of: string; name: string; start: Walker; frames: number; keys(f: number, walker: Walker): number[] };
type Avatar = { step(x: number, z: number, heading: number, dt: number): void; boom(camera: unknown, walker: Walker, dt: number, cut: boolean): Point; settle(position: unknown, aim: unknown): void };
type Mark = { position: Point; rotation: { y: number }; userData: { reach?: number }; updateMatrixWorld(force: boolean): void; traverse(see: (o: Part) => void): void };
type Part = { isMesh?: boolean; matrixWorld: unknown; geometry: { index: { count: number; getX(i: number): number } | null; attributes: { position: { count: number } } } };
const avatarOf = (marks: unknown[], phone: boolean, more: Record<string, unknown> = {}) =>
  buildAvatar(new THREE.Scene(), marks as never[], { phone, reduced: false, columns: [STAGE_COLUMN] as never[], ...more }) as unknown as Avatar;
const cameraOf = (phone: boolean) => new THREE.PerspectiveCamera(phone ? 75 : 60, phone ? 390 / 844 : 1440 / 900, 0.5, 900);

const MAPS = new URL("../../../public/maps/", import.meta.url);
const tracksOf = (date: string) => (JSON.parse(readFileSync(new URL(`${date}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] }).tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
const path = buildPath(), line = buildWalkLine(path, 7);
const DT = 1 / 60, WALK = 12, RUN = 1.6, TURN = 1.6, TILT = 1.2;

// Every triangle a landmark draws, where it stands: nine numbers each.
function trianglesOf(mark: Mark) {
  const out: number[] = [], v = new THREE.Vector3();
  mark.updateMatrixWorld(true);
  mark.traverse((o) => {
    if (!o.isMesh) return;
    const { index, attributes: { position } } = o.geometry, n = index ? index.count : position.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return Float64Array.from(out);
}
function boundsOf(tris: Float64Array): Box {
  const b = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (let i = 0; i < tris.length; i += 3) {
    b.min.x = Math.min(b.min.x, tris[i]); b.max.x = Math.max(b.max.x, tris[i]);
    b.min.y = Math.min(b.min.y, tris[i + 1]); b.max.y = Math.max(b.max.y, tris[i + 1]);
    b.min.z = Math.min(b.min.z, tris[i + 2]); b.max.z = Math.max(b.max.z, tris[i + 2]);
  }
  return b;
}
// How many of the triangles the line from a point along a way crosses, up to `most` of the way.
function crossings(tris: Float64Array, x: number, y: number, z: number, dx: number, dy: number, dz: number, most: number) {
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
// Inside what is drawn: a nearly level line from the point crosses the skin an odd number of times, along each of three ways.
const LEVEL = [[1, 0.0003, 0.0007], [-0.5, 0.0005, 0.866], [-0.5, -0.0004, -0.866]];
const within = (tris: Float64Array, x: number, y: number, z: number) => LEVEL.every(([dx, dy, dz]) => crossings(tris, x, y, z, dx, dy, dz, Infinity) % 2 === 1);
const inBox = (b: Box, x: number, y: number, z: number) => x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y && z >= b.min.z && z <= b.max.z;
// Whether the line from a to b passes through a box at all.
function meets(b: Box, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[ax, bx - ax, b.min.x, b.max.x], [ay, by - ay, b.min.y, b.max.y], [az, bz - az, b.min.z, b.max.z]]) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return false; continue; }
    const u0 = (lo - o) / d, u1 = (hi - o) / d;
    t0 = Math.max(t0, Math.min(u0, u1)); t1 = Math.min(t1, Math.max(u0, u1));
    if (t0 > t1) return false;
  }
  return true;
}
// A small seeded generator, so that the random walks are the same on every run.
const seeded = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// A show's landmarks placed, with what each draws, the box the camera keeps out of, and the box of what it draws.
function world(date: string, set2: number, phone: boolean) {
  const tracks = tracksOf(date), marks = placeLandmarks(new THREE.Scene(), path, tracks, true, makeBuilders(phone), layout(tracks, set2, path), line) as unknown as Mark[];
  const solids = marks.map((mark) => { const tris = trianglesOf(mark); return { tris, drawn: boundsOf(tris), keep: keepOutBox(mark as never) as unknown as Box }; });
  return { date, set2, phone, tracks, marks, solids };
}
type World = ReturnType<typeof world>;

// The walks of a show: at, across and round each landmark, round the stage and at it, along the path through every landmark, and
// at random. `every` thins the landmarks' walks: each landmark has all of its kinds, on one line of its own of `every`.
function walksOf({ marks }: World, every = 1): Walk[] {
  const out: Walk[] = [], hold = (...keys: number[]) => () => keys;
  marks.forEach((mark, k) => {
    const R = Math.max(4, mark.userData.reach ?? 5), c = Math.cos(mark.rotation.y), s = Math.sin(mark.rotation.y), len = R + 16;
    const to = (x: number, z: number) => [mark.position.x + x * c + z * s, mark.position.z - x * s + z * c];
    // From a to b in the landmark's own frame: forwards, backwards with the camera going first, or sideways.
    const walk = (a: number[], b: number[], name: string, { spd = 1, side = 0, run = 0, pitch = 0 } = {}) => {
      const [ax, az] = to(a[0], a[1]), [bx, bz] = to(b[0], b[1]), way = Math.atan2(ax - bx, az - bz);
      const heading = spd === 1 ? way : spd === -1 ? way + Math.PI : way + (side * Math.PI) / 2;
      out.push({ of: `song ${k}`, name: `${name}, song ${k}`, start: { x: ax, z: az, heading, pitch }, frames: Math.ceil(Math.hypot(bx - ax, bz - az) / (WALK * (run ? RUN : 1) * DT)), keys: hold(spd, side, 0, run, 0) });
    };
    // Through its middle and half-way out to either side of it, a line apiece by the landmark's number.
    const o = [0, R / 2, -R / 2][k % 3], q = [R / 2, -R / 2, 0][k % 3];
    walk([o, -len], [o, len], "along"); walk([o, len], [o, -len], "back along"); walk([-len, q], [len, q], "across"); walk([len, q], [-len, q], "back across");
    if (k % every !== 0) return;
    walk([q, -len], [q, len], "along at a run", { run: 1 }); walk([-len, o], [len, o], "backwards across", { spd: -1 }); walk([o, len], [o, -len], "backwards along at a run", { spd: -1, run: 1 });
    walk([-len, o], [len, o], "sideways across", { spd: 0, side: 1 }); walk([o, -len], [o, len], "along looking up", { pitch: 0.6 }); walk([-len, q], [len, q], "across looking up", { pitch: 0.8 });
    walk([len, o], [-len, o], "across looking down", { pitch: -0.6 });
    // Round it, and turning on the spot inside it, beside it and further off.
    const [x, z] = to(R + 1, 0);
    out.push({ of: `song ${k}`, name: `round song ${k}`, start: { x, z, heading: mark.rotation.y, pitch: 0 }, frames: Math.ceil((2 * Math.PI * (R + 1)) / (WALK * DT)), keys: hold(1, 0, -WALK / (TURN * (R + 1)), 0, 0) });
    for (const [r, a] of [[1.5, 0], [R + 1, 1], [R + 1, 4], [R + 6, 6]]) {
      const [px, pz] = to(r * Math.cos(a * 0.8 + 0.2), r * Math.sin(a * 0.8 + 0.2));
      out.push({ of: `song ${k}`, name: `turning ${r.toFixed(1)} m from song ${k}`, start: { x: px, z: pz, heading: a, pitch: a % 2 ? 0.3 : 0 }, frames: 240, keys: hold(0, 0, a % 2 ? 1 : -1, 0, 0) });
    }
  });
  // Round the stage at its reach and further out, both ways; sideways round it with the boom toward it; turning on the spot beside
  // it; and straight at it, forwards and backwards.
  const [sx, sz] = STAGE;
  for (const r of [STAGE_REACH + 0.05, STAGE_REACH + 4]) for (const way of [1, -1]) {
    const frames = Math.ceil((2 * Math.PI * r) / (WALK * DT));
    out.push({ of: "the stage", name: `round the stage ${r.toFixed(0)} m out`, start: { x: sx + r, z: sz, heading: way > 0 ? 0 : Math.PI, pitch: 0 }, frames, keys: hold(1, 0, (-way * WALK) / (TURN * r), 0, 0) });
    if (way > 0) out.push({ of: "the stage", name: `sideways round the stage ${r.toFixed(0)} m out`, start: { x: sx + r, z: sz, heading: -Math.PI / 2, pitch: 0.3 }, frames, keys: hold(0, 1, -WALK / (TURN * r), 0, 0) });
  }
  for (const r of [STAGE_REACH + 0.05, STAGE_REACH + 2, STAGE_REACH + 6]) for (let a = 0; a < 6; a++) {
    out.push({ of: "the stage", name: `turning ${r.toFixed(0)} m from the stage`, start: { x: sx + r * Math.cos(a + r), z: sz + r * Math.sin(a + r), heading: a, pitch: [0, 0.4, -0.4][a % 3] }, frames: 240, keys: hold(0, 0, a % 2 ? 1 : -1, 0, 0) });
  }
  for (let a = 0; a < 8; a++) {
    const at = (a * Math.PI) / 4 + 0.1, x = sx + 34 * Math.cos(at), z = sz + 34 * Math.sin(at), toStage = Math.atan2(x - sx, z - sz), [spd, run] = [[1, 0], [-1, 0], [-1, 1], [1, 1]][a % 4];
    out.push({ of: "the stage", name: `${spd > 0 ? "at" : "backing at"} the stage`, start: { x, z, heading: spd > 0 ? toStage : toStage + Math.PI, pitch: 0 }, frames: Math.ceil(30 / (WALK * (run ? RUN : 1) * DT)), keys: hold(spd, 0, 0, run, 0) });
  }
  // Along the path through every landmark, on at a walk and back at a run: the walker steers for the path 6 m on, turning no
  // faster than the keys turn it.
  for (const [way, run] of [[1, 0], [-1, 1]]) {
    const p0 = path.at(0), t0 = path.tangentAt(0);
    let u = 0;
    out.push({ of: "the path", name: `the path ${way > 0 ? "on" : "back at a run"}`, start: { x: p0.x, z: p0.z, heading: Math.atan2(-t0.x * way, -t0.z * way), pitch: 0 }, frames: Math.floor(path.curveLength / (WALK * (run ? RUN : 1) * DT)),
      keys: (f, walker) => {
        if (f === 1) u = 0;
        let best = Infinity, at = u;
        for (let n = 0; n <= 20; n++) { const v = u + (way * n * 0.5) / path.curveLength, p = path.at(v), d = Math.hypot(p.x - walker.x, p.z - walker.z); if (d < best) { best = d; at = v; } }
        u = at;
        const aim = path.at(u + (way * 6) / path.curveLength), off = Math.atan2(walker.x - aim.x, walker.z - aim.z) - walker.heading;
        return [1, 0, Math.max(-1, Math.min(1, Math.atan2(Math.sin(off), Math.cos(off)) / (TURN * DT))), run, 0];
      } });
  }
  // At random from beside every fourth landmark and from beside the stage: the keys change every third of a second to a second and a half.
  const starts = marks.filter((_, k) => k % 4 === 1).map((mark) => ({ x: mark.position.x, z: mark.position.z }));
  starts.push({ x: sx + 16, z: sz }, { x: sx - 9, z: sz + 13 });
  starts.forEach((from, i) => {
    const random = seeded(7919 + i * 104729), pick = (list: number[]) => list[Math.floor(random() * list.length)];
    let till = 0, now = [0, 0, 0, 0, 0];
    out.push({ of: "at random", name: `at random, ${i}`, start: { x: from.x + (random() - 0.5) * 16, z: from.z + (random() - 0.5) * 16, heading: random() * 6.283, pitch: 0 }, frames: 600,
      keys: (f) => { if (f >= till) { till = f + 20 + Math.floor(random() * 70); now = [pick([1, 1, 1, 0, -1, -1]), pick([0, 0, 0, 1, -1]), pick([0, 0, 1, -1, 0.4, -0.4]), pick([0, 0, 1]), pick([0, 0, 0, 1, -1])]; } return now; } });
  });
  return out;
}

// One frame of a walk, as main.js takes it: the keys move the walker, and the walk's limits keep it on the island and off the stage.
const limits = walkLimits([]);
function stride(walker: Walker, [spd, side, turn, run, tilt]: number[]) {
  walker.pitch = Math.max(-0.8, Math.min(0.8, walker.pitch + tilt * TILT * DT));
  walker.heading += turn * TURN * DT;
  const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading), pace = WALK * (run ? RUN : 1) * DT;
  walker.x += (fx * spd - fz * side) * pace; walker.z += (fz * spd + fx * side) * pace;
  confine(walker, limits);
}

// Walks the walks with the world's camera and, beside it, one that nothing is in the way of. Tells, of every frame: how far the
// camera moved, and the other; whether the eye is under the ground, lower over it than the camera keeps, in the stage's column or in
// something a landmark draws; how near the head it is; and whether a landmark stands between it and the bear's head, with the head
// in no landmark's box.
function measure(w: World, walks: Walk[]) {
  const { phone, marks, solids } = w, mine = avatarOf(marks, phone), bare = buildAvatar(new THREE.Scene(), [], { phone, reduced: false }) as unknown as Avatar;
  const camera = cameraOf(phone), other = cameraOf(phone), was = new THREE.Vector3(), otherWas = new THREE.Vector3();
  const told = { frames: 0, most: 0, mostAt: "", bareMost: 0, under: 0, low: 0, inColumn: 0, inDrawn: [] as string[], nearer: 0, nearest: Infinity, hidden: 0, run: 0, runAt: "" };
  for (const walk of walks) {
    const walker = { ...walk.start };
    confine(walker, limits);
    let run = 0;
    for (let f = 0; f < walk.frames; f++) {
      if (f > 0) stride(walker, walk.keys(f, walker));
      mine.step(walker.x, walker.z, walker.heading, DT);
      mine.boom(camera, walker, DT, f === 0);
      bare.boom(other, walker, DT, f === 0);
      const { x, y, z } = camera.position as Point, hy = height(walker.x, walker.z) + HEAD;
      // The frames after a cut settle the boom: they count for where the camera is, not for how it moved.
      if (f > 1) {
        const moved = camera.position.distanceTo(was);
        if (moved > told.most) { told.most = moved; told.mostAt = `${walk.name}, frame ${f}`; }
        told.bareMost = Math.max(told.bareMost, other.position.distanceTo(otherWas));
      }
      was.copy(camera.position); otherWas.copy(other.position);
      const ground = height(x, z), from = Math.hypot(x - walker.x, y - hy, z - walker.z);
      if (y < ground) told.under += 1;
      if (y < ground + 1.2 - 1e-6) told.low += 1;
      if (Math.hypot(x - STAGE_COLUMN.x, z - STAGE_COLUMN.z) < STAGE_COLUMN.r && y < STAGE_COLUMN.top) told.inColumn += 1;
      if (from < LEAST - 1e-6) told.nearer += 1;
      told.nearest = Math.min(told.nearest, from);
      let hidden = false, headIn = false;
      for (const s of solids) {
        if (inBox(s.keep, walker.x, hy, walker.z)) headIn = true;
        if (inBox(s.drawn, x, y, z) && within(s.tris, x, y, z)) told.inDrawn.push(`${walk.name}, frame ${f}`);
        if (!hidden && meets(s.drawn, x, y, z, walker.x, hy, walker.z) && crossings(s.tris, x, y, z, walker.x - x, hy - y, walker.z - z, 1) > 0) hidden = true;
      }
      if (hidden && !headIn) { told.hidden += 1; run += 1; if (run > told.run) { told.run = run; told.runAt = `${walk.name}, to frame ${f}`; } } else run = 0;
      told.frames += 1;
    }
  }
  return told;
}
// The largest move of the camera in one frame of a walk, with the world's camera.
function largestMove(w: World, walk: Walk, more: Record<string, unknown> = {}) {
  const avatar = avatarOf(w.marks, w.phone, more), camera = cameraOf(w.phone), was = new THREE.Vector3(), walker = { ...walk.start };
  confine(walker, limits);
  let most = 0;
  for (let f = 0; f < walk.frames; f++) {
    if (f > 0) stride(walker, walk.keys(f, walker));
    avatar.step(walker.x, walker.z, walker.heading, DT);
    avatar.boom(camera, walker, DT, f === 0);
    if (f > 1) most = Math.max(most, camera.position.distanceTo(was));
    was.copy(camera.position);
  }
  return most;
}
// A walk from a to b in a landmark's own frame, forwards at a walk, looking level.
function across(mark: Mark, a: number[], b: number[], name: string): Walk {
  const c = Math.cos(mark.rotation.y), s = Math.sin(mark.rotation.y), to = ([x, z]: number[]) => [mark.position.x + x * c + z * s, mark.position.z - x * s + z * c];
  const [ax, az] = to(a), [bx, bz] = to(b);
  return { of: name, name, start: { x: ax, z: az, heading: Math.atan2(ax - bx, az - bz), pitch: 0 }, frames: Math.ceil(Math.hypot(bx - ax, bz - az) / (WALK * DT)), keys: () => [1, 0, 0, 0, 0] };
}

let WORLDS: World[];
const on = (date: string, phone: boolean) => WORLDS.find((w) => w.date === date && w.phone === phone)!;
// Placing four shows' landmarks on two tiers takes a second or two, most of it their search for room beside the bears' line.
beforeAll(() => { WORLDS = SHOWS.flatMap(([date, set2]) => [false, true].map((phone) => world(date, set2, phone))); }, 30000);

describe("the walk's camera at a landmark and the stage", () => {
  // How far the camera's place goes in a sixtieth of a second at its swiftest: 0.55 m on a desktop and 1 m on a phone.
  const pace = (phone: boolean) => swift(phone) / 60;
  // How far over its swift pace, or over the same walk with nothing in its way, a frame may move the camera: what keeping over
  // rising ground adds to a step at the full pace.
  const OVER = 0.05;

  it("goes no faster than three boom lengths a second, which a sixtieth of a second makes 0.55 m on a desktop and 1 m on a phone", () => {
    expect([boomLength(false), boomLength(true)]).toEqual([11, 20]);
    expect([pace(false), pace(true)]).toEqual([0.55, 1]);
  });

  // 380,000 frames a tier over the four shows, and the eye tried against every triangle of a landmark it comes near: three seconds
  // here, and more on a busy machine.
  it("never cuts: walking, running, backwards, sideways, in arcs and turning on the spot, at and across every landmark of four shows and round the stage, the camera moves no further in a frame than its swift pace or the same walk moves it with nothing in its way; the eye is over the ground, out of the stage's column and in nothing a landmark draws but where the bear itself is in it; and a landmark hides the bear's head only for a moment", { timeout: 60000 }, () => {
    // The eye in something drawn, of the frames of a tier; how near the head the camera may come, in m; the share of frames a
    // landmark may hide the head in; and the longest it may hide it, in frames: 0.9 s.
    const IN_DRAWN = 8, NEAREST = 1.5, HIDDEN = 0.035, LOST = 54;
    for (const phone of [false, true]) {
      const sum = { frames: 0, most: 0, mostAt: "", bareMost: 0, under: 0, low: 0, inColumn: 0, inDrawn: [] as string[], nearer: 0, nearest: Infinity, hidden: 0, run: 0, runAt: "" };
      for (const [date] of SHOWS) {
        const w = on(date, phone), told = measure(w, walksOf(w)), where = `${date} on a ${phone ? "phone" : "desktop"}`;
        // No cut. Main's camera moved up to 22 m in a frame on walks like these on a desktop and 36 m on a phone (issue #178).
        expect(told.most, `${where}: ${told.mostAt}`).toBeLessThanOrEqual(Math.max(pace(phone), told.bareMost) + OVER);
        if (told.most > sum.most) { sum.most = told.most; sum.mostAt = `${where}: ${told.mostAt}`; }
        if (told.run > sum.run) { sum.run = told.run; sum.runAt = `${where}: ${told.runAt}`; }
        sum.bareMost = Math.max(sum.bareMost, told.bareMost); sum.nearest = Math.min(sum.nearest, told.nearest);
        sum.inDrawn.push(...told.inDrawn.map((at) => `${where}: ${at}`));
        for (const key of ["frames", "under", "low", "inColumn", "nearer", "hidden"] as const) sum[key] += told[key];
      }
      const tier = phone ? "phone" : "desktop";
      expect(sum.frames, tier).toBeGreaterThan(350000);
      // With nothing in its way the camera's largest move is the walk's own: running and turning at once swings the boom's end
      // 0.71 m in a frame on a desktop and 0.87 m on a phone. With the landmarks and the stage it is that, or its swift pace.
      expect(sum.bareMost, tier).toBeCloseTo(phone ? 0.87 : 0.71, 1);
      expect(sum.most, `${tier}: ${sum.mostAt}`).toBeLessThanOrEqual(Math.max(pace(phone), sum.bareMost) + OVER);
      // Over the ground by what the boom keeps, and out of the stage's column, in every frame.
      expect([sum.under, sum.low, sum.inColumn], tier).toEqual([0, 0, 0]);
      // In something a landmark draws on 4 frames of a desktop's and 1 of a phone's, each as the bear itself goes through that
      // landmark with the camera's place in its box: backwards, the camera going first, or looking up, the boom low.
      expect(sum.inDrawn.length, `${tier}: ${sum.inDrawn.slice(0, 6).join("; ")}`).toBeLessThanOrEqual(IN_DRAWN);
      // Nearer the head than the boom's least only where the bear runs at a landmark or the stage with the camera between them,
      // and its place climbs the wall as fast as its pace allows: 1 frame in 2,800 on a desktop and 1 in 13,700 on a phone,
      // never nearer than 2 m and 1.8 m.
      expect(sum.nearer / sum.frames, tier).toBeLessThan(1 / 1500);
      expect(sum.nearest, tier).toBeGreaterThan(NEAREST);
      // The bear is not lost. Main's camera, which cut, let no landmark stand between it and a head outside every box. This one
      // does while it goes round or over: in 2.2 % of these frames on a desktop and 2.4 % on a phone, which walk at every
      // landmark, and for 44 frames together at the longest.
      expect(sum.hidden / sum.frames, tier).toBeLessThan(HIDDEN);
      expect(sum.hidden / sum.frames, tier).toBeGreaterThan(0.005);
      expect(sum.run, `${tier}: ${sum.runAt}`).toBeLessThanOrEqual(LOST);
    }
  });

  it("goes round a landmark that comes into the boom's way, where main's camera cut to the front of it: past the Lovelight tower, across the bandstand and turning on the spot beside the stage", () => {
    // The walks the PR's pictures are of, on the fixed day. On main the camera moved 15.9 m in one frame of the first on a
    // desktop and 26.1 m on a phone; 15.5 m and 25.1 m in the second; and 5.8 m and 14.5 m in the third.
    for (const phone of [false, true]) {
      const w = on("1986-07-04", phone), keys = (...held: number[]) => () => held;
      const tower: Walk = { of: "", name: "past the tower", start: { x: 85.13, z: 49.44, heading: 2.524, pitch: 0 }, frames: 190, keys: keys(1, 0, 0, 0, 0) };
      const stand: Walk = { of: "", name: "across the bandstand", start: { x: -128.01, z: -1.89, heading: -1.507, pitch: 0 }, frames: 150, keys: keys(1, 0, 0, 0, 0) };
      const stage: Walk = { of: "", name: "turning by the stage", start: { x: 66.7, z: -52.34, heading: 4, pitch: 0.4 }, frames: 120, keys: keys(0, 0, -1, 0, 0) };
      for (const walk of [tower, stand, stage]) expect(largestMove(w, walk), `${walk.name} on a ${phone ? "phone" : "desktop"}`).toBeLessThanOrEqual(pace(phone) + OVER);
    }
  });

  // Twenty-one more worlds on each tier, one for each start of set 2: a second here.
  it("does not snap as the bear's head leaves a landmark's box: at the road of 1971-12-09 with set 2 from track 17, where main's camera moved 13.2 m in a frame and 22.2 m on a phone, and at that road wherever any start of set 2 stands it", { timeout: 20000 }, () => {
    const tracks = tracksOf("1971-12-09"), ROAD = 20;
    for (const phone of [false, true]) {
      const where = phone ? "on a phone" : "on a desktop";
      // Along the road and across it, on lines a metre and a half apart, as the review that found it walked.
      const walks = (w: World) => {
        const out: Walk[] = [], mark = w.marks[ROAD];
        for (let o = -9; o <= 9; o += 1.5) out.push(across(mark, [o, -26], [o, 26], `along the road ${o} m off`), across(mark, [o, 26], [o, -26], `back along the road ${o} m off`));
        for (let o = -11; o <= 11; o += 2) out.push(across(mark, [-26, o], [26, o], `across the road ${o} m along`), across(mark, [26, o], [-26, o], `back across the road ${o} m along`));
        return out;
      };
      const found = on("1971-12-09", phone);
      for (const walk of walks(found)) expect(largestMove(found, walk), `${walk.name}, ${where}`).toBeLessThanOrEqual(pace(phone) + OVER);
      // Every start of set 2 puts the road somewhere else on the path: on the line through its middle and the two beside it.
      for (let set2 = 1; set2 < tracks.length; set2++) {
        const w = world("1971-12-09", set2, phone), mark = w.marks[ROAD];
        for (const o of [-3, 0, 3]) for (const walk of [across(mark, [o, -26], [o, 26], "along"), across(mark, [-26, o], [26, o], "across")]) {
          expect(largestMove(w, walk), `${walk.name} the road ${o} m off, set 2 from ${set2}, ${where}`).toBeLessThanOrEqual(pace(phone) + OVER);
        }
      }
    }
  });

  it("takes no notice of a landmark the bear has just walked out of, for GRACE s: straight through a standing stone, the camera goes as it would with no stone there, where it used to rise over the stone and come down", () => {
    expect(GRACE).toBe(0.25);
    for (const phone of [false, true]) {
      // Beat It On Down The Line's stone, 4.4 m tall, on the line through its middle.
      const w = on("1971-12-09", phone), STONE = 6, walk = across(w.marks[STONE], [0, -24], [0, 24], "through the stone");
      const mine = avatarOf(w.marks, phone), bare = buildAvatar(new THREE.Scene(), [], { phone, reduced: false }) as unknown as Avatar;
      const camera = cameraOf(phone), other = cameraOf(phone), walker = { ...walk.start };
      let apart = 0, inside = 0;
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker));
        mine.boom(camera, walker, DT, f === 0);
        bare.boom(other, walker, DT, f === 0);
        apart = Math.max(apart, camera.position.distanceTo(other.position));
        if (inBox(w.solids[STONE].keep, walker.x, height(walker.x, walker.z) + HEAD, walker.z)) inside += 1;
      }
      // The head is in the stone's box for some frames of the walk; and the camera is never more than a hand from where it
      // would be with no stone. Without the grace it stood 5.6 m higher, a second after the stone.
      expect(inside, phone ? "phone" : "desktop").toBeGreaterThan(3);
      expect(apart, phone ? "phone" : "desktop").toBeLessThan(0.1);
    }
  });

  it("comes to rest in front of a landmark that stays in the boom's way, the eye's room out from it, no nearer the head than the boom's least and with the bear's head in sight, within a second and a half of the bear's stopping", () => {
    for (const phone of [false, true]) {
      // The bear walks past the Lovelight tower and stops 6 m beyond it with its back to it, the tower square in the boom's way.
      const w = on("1986-07-04", phone), TOWER = 17, mark = w.marks[TOWER], walk = across(mark, [0, -20], [0, 7], "past the tower");
      const avatar = avatarOf(w.marks, phone), camera = cameraOf(phone), walker = { ...walk.start }, room = eyeRoom(camera), { keep, tris } = w.solids[TOWER];
      // At rest: the first frame after the bear stops from which the camera moves under a millimetre a frame. And its last frame
      // at a quarter of its swift pace or more, and how far it moved in each frame from the bear's stopping.
      let rested = -1, fast = 0;
      const after: number[] = [];
      const was = new THREE.Vector3();
      for (let f = 0; f < walk.frames + 240; f++) {
        if (f > 0 && f < walk.frames) stride(walker, walk.keys(f, walker));
        avatar.step(walker.x, walker.z, walker.heading, DT);
        avatar.boom(camera, walker, DT, f === 0);
        const moved = camera.position.distanceTo(was);
        if (f >= walk.frames) { if (moved >= 0.001) rested = -1; else if (rested < 0) rested = f - walk.frames; }
        if (f >= walk.frames) after.push(moved);
        if (moved >= pace(phone) / 4) fast = f - walk.frames;
        was.copy(camera.position);
      }
      const { x, y, z } = camera.position as Point, hy = height(walker.x, walker.z) + HEAD, where = phone ? "phone" : "desktop";
      expect(rested, where).toBeGreaterThan(0);
      expect(rested, where).toBeLessThan(90);
      // It gathers its pace over GATHER s. The bear stops as the camera sets off round the tower, and in each of the next six
      // frames it moves further than in the last by what that gives, 0.023 m on a desktop and 0.042 m on a phone. And it lands
      // over LAND s: after its last frame at a quarter of its swift pace come five and more at a twentieth of it or over, where
      // a place that stopped dead would have none.
      for (let f = 1; f <= 6; f++) expect(after[f] - after[f - 1], `${where}, frame ${f} after the stop`).toBeCloseTo(swift(phone) / GATHER / 3600, 2);
      expect(after.slice(fast + 1).filter((moved) => moved >= pace(phone) / 20).length, where).toBeGreaterThanOrEqual(5);
      expect(LAND).toBe(0.08);
      // In front of the tower: on the bear's side of it, out of its room, and nothing of it between the eye and the head.
      const out = Math.max(keep.min.x - x, x - keep.max.x, keep.min.z - z, z - keep.max.z, y - keep.max.y);
      expect(out, where).toBeGreaterThanOrEqual(room - 1e-6);
      expect(Math.hypot(x - walker.x, y - hy, z - walker.z), where).toBeGreaterThanOrEqual(LEAST - 1e-6);
      expect(Math.hypot(x - walker.x, z - walker.z), where).toBeLessThan(Math.hypot(mark.position.x - walker.x, mark.position.z - walker.z));
      expect(crossings(tris, x, y, z, walker.x - x, hy - y, walker.z - z, 1), where).toBe(0);
      // And that is where a cut to the same stand puts it: easing there lands where it would have landed.
      const cut = avatarOf(w.marks, phone), fresh = cameraOf(phone);
      cut.step(walker.x, walker.z, walker.heading, 0);
      cut.boom(fresh, walker, 0, true);
      expect(camera.position.distanceTo(fresh.position), where).toBeLessThan(SLACK + 0.05);
    }
  });

  it("goes on from where another camera left the view: after a ride with the bears it starts from that camera's place, not from where it last stood in a walk", () => {
    for (const phone of [false, true]) {
      // A walk past the Lovelight tower; then a ridden camera leaves the view 9 m behind the bear and 5 m up, with the tower
      // between that place and the bear, so the walk's camera has somewhere else to go from there.
      const w = on("1986-07-04", phone), mark = w.marks[17], walk = across(mark, [0, -20], [0, 7], "past the tower"), avatar = avatarOf(w.marks, phone), camera = cameraOf(phone), walker = { ...walk.start };
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker));
        avatar.step(walker.x, walker.z, walker.heading, DT);
        avatar.boom(camera, walker, DT, f === 0);
      }
      const far = { x: walker.x + 60, z: walker.z + 60, heading: walker.heading, pitch: 0 };
      for (let f = 0; f < 30; f++) { avatar.step(far.x, far.z, far.heading, DT); avatar.boom(camera, far, DT, f === 0); }
      const left = new THREE.Vector3(walker.x + 9 * Math.sin(walker.heading), height(walker.x, walker.z) + HEAD + 5, walker.z + 9 * Math.cos(walker.heading));
      avatar.step(walker.x, walker.z, walker.heading, DT);
      avatar.settle(left, new THREE.Vector3(walker.x, height(walker.x, walker.z) + HEAD, walker.z));
      avatar.boom(camera, walker, DT, false);
      // One frame on, it has gone no further from there than its pace; and it is not where it stood 85 m away.
      expect(camera.position.distanceTo(left), phone ? "phone" : "desktop").toBeLessThanOrEqual(pace(phone) + OVER);
    }
  });

  it("is where it comes to rest in every frame under reduced motion: where a cut to that stand would put it, with nothing left to draw once the input ends", () => {
    for (const phone of [false, true]) {
      const w = on("1986-07-04", phone), walk = across(w.marks[17], [1, -20], [1, 20], "past the tower");
      const still = avatarOf(w.marks, phone, { reduced: true }), camera = cameraOf(phone), fresh = cameraOf(phone), again = new THREE.Vector3(), walker = { ...walk.start };
      let moved = 0;
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker));
        still.step(walker.x, walker.z, walker.heading, DT);
        still.boom(camera, walker, DT, false);
        // A camera cut to the same stand, in a world of its own.
        const cut = avatarOf(w.marks, phone);
        cut.step(walker.x, walker.z, walker.heading, 0);
        cut.boom(fresh, walker, 0, true);
        expect(camera.position.distanceTo(fresh.position), `frame ${f}`).toBeLessThan(1e-9);
        // And a frame more at the same stand moves it nowhere: it has nothing to catch up.
        again.copy(camera.position);
        still.boom(camera, walker, DT, false);
        moved = Math.max(moved, camera.position.distanceTo(again));
      }
      expect(moved).toBe(0);
    }
  });

  it("stands on its goal wherever no landmark and no column is in the boom's way: the same camera to the last bit as one in a world with none, on a walk that keeps far from both", () => {
    for (const phone of [false, true]) {
      // A world of the stage's column and one landmark, the Lovelight tower, and a walk on the island's west side, 100 m from both.
      const w = on("1986-07-04", phone), tower = w.marks[17], mine = avatarOf([tower], phone), bare = buildAvatar(new THREE.Scene(), [], { phone, reduced: false }) as unknown as Avatar;
      const camera = cameraOf(phone), other = cameraOf(phone), walker = { x: -60, z: 0, heading: 0.4, pitch: 0 }, random = seeded(3);
      let keys = [1, 0, 0, 0, 0];
      for (let f = 0; f < 900; f++) {
        // The keys change every three quarters of a second; a walker 20 m from where it set out turns back.
        if (f % 45 === 0) keys = [1, random() < 0.3 ? 1 : 0, random() < 0.5 ? 1 : -1, random() < 0.4 ? 1 : 0, random() < 0.3 ? 1 : random() < 0.5 ? -1 : 0];
        if (f > 0) stride(walker, Math.hypot(walker.x + 60, walker.z) < 20 ? keys : [1, 0, 1, 0, 0]);
        mine.boom(camera, walker, DT, f === 0);
        bare.boom(other, walker, DT, f === 0);
        expect((camera.position as { toArray(): number[] }).toArray(), `frame ${f}`).toEqual((other.position as { toArray(): number[] }).toArray());
        expect(Math.min(Math.hypot(walker.x - tower.position.x, walker.z - tower.position.z), Math.hypot(walker.x - STAGE[0], walker.z - STAGE[1]))).toBeGreaterThan(100);
      }
      expect(Math.hypot(walker.x, walker.z)).toBeLessThan(BOUND);
    }
  });
});
