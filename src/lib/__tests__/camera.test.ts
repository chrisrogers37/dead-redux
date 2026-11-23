import { readFileSync } from "fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { boomLength, buildAvatar, eyeRoom, GATHER, GRACE, HEAD, keepOutBox, LAND, SLACK, swift } from "../../../public/world/avatar.js";
import { LEAST } from "../../../public/world/boom.js";
import { BOUND, height, STAGE, STAGE_COLUMN, STAGE_REACH } from "../../../public/world/ground.js";
import { confine, walkLimits } from "../../../public/world/modes.js";
import { TREE_REACH } from "../../../public/world/trees.js";
import { type Avatar, crossings, DT, landmarksOf, pace, path, stride, tracksOf, treesOf, type Walker, walkCamera, within } from "./world-walks";

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
// Three more that the review of #191 walked, where it found the camera swinging between two places beside the stage and between
// two landmarks that stand close. No one has said where their second sets open, so each is taken to open partway, as
// trees.test.ts takes it.
const MORE = ["1980-05-15", "1991-09-12", "1973-11-28"];
const partway = (date: string) => Math.floor(tracksOf(date).length * 0.45);

// Every Vector3, Box3 and Matrix4 the world's modules make is counted, so that a test can say how many a frame of the camera made.
// They are three's own classes with nothing changed but the count.
const made = vi.hoisted(() => ({ count: 0 }));
vi.mock("three", async (original) => {
  const three = await original<Record<string, new (...args: never[]) => object>>();
  const counted = (Base: new (...args: never[]) => object) => class extends Base { constructor(...args: never[]) { super(...args); made.count += 1; } };
  return { ...three, Vector3: counted(three.Vector3), Box3: counted(three.Box3), Matrix4: counted(three.Matrix4) };
});

type Point = { x: number; y: number; z: number };
type Box = { min: Point; max: Point; containsPoint(p: unknown): boolean };
// A walk: where it starts and the keys held at each frame (world-walks.ts `stride`). One that swings is one whose keys walk or run
// while they turn, and so may themselves move the boom's end further in a frame than the camera's swift pace.
type Walk = { of: string; name: string; start: Walker; frames: number; swings?: boolean; keys(f: number, walker: Walker): number[] };
type Mark = { position: Point; rotation: { y: number }; userData: { reach?: number }; updateMatrixWorld(force: boolean): void; traverse(see: (o: Part) => void): void };
type Part = { isMesh?: boolean; matrixWorld: unknown; geometry: { index: { count: number; getX(i: number): number } | null; attributes: { position: { count: number } } } };
const avatarOf = (marks: unknown[], phone: boolean, more: Record<string, unknown> = {}) =>
  buildAvatar(new THREE.Scene(), marks as never[], { phone, reduced: false, columns: [STAGE_COLUMN] as never[], ...more }) as unknown as Avatar;
// A camera that nothing is in the way of: no landmark and no column.
const bareOf = (phone: boolean) => buildAvatar(new THREE.Scene(), [], { phone, reduced: false }) as unknown as Avatar;
const cameraOf = (phone: boolean) => new THREE.PerspectiveCamera(phone ? 75 : 60, phone ? 390 / 844 : 1440 / 900, 0.5, 900);
const WALK = 12, RUN = 1.6, TURN = 1.6;

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

// A show's landmarks placed, with what each draws, the box the camera keeps out of, and the box of all it draws.
// `drawn` false leaves out what each draws, for a test that does not try the eye against it.
function world(date: string, set2: number, phone: boolean, drawn = true) {
  const tracks = tracksOf(date), placed = landmarksOf(tracks, set2, phone), marks = placed.landmarks as unknown as Mark[];
  const solids = (drawn ? marks : []).map((mark) => ({ tris: trianglesOf(mark), drawn: new THREE.Box3().setFromObject(mark) as Box, keep: keepOutBox(mark as never) as unknown as Box }));
  return { date, set2, phone, tracks, placed, marks, solids };
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
    // Backwards while looking up as far as the look goes: the camera goes first and low, between the bear and what it backs into.
    walk([o, -len], [o, len], "backwards along at a run looking up", { spd: -1, run: 1, pitch: 0.8 }); walk([len, q], [-len, q], "backwards across looking up", { spd: -1, pitch: 0.8 });
    // Round it, and turning on the spot inside it, beside it and further off.
    const [x, z] = to(R + 1, 0);
    out.push({ of: `song ${k}`, name: `round song ${k}`, start: { x, z, heading: mark.rotation.y, pitch: 0 }, frames: Math.ceil((2 * Math.PI * (R + 1)) / (WALK * DT)), swings: true, keys: hold(1, 0, -WALK / (TURN * (R + 1)), 0, 0) });
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
    out.push({ of: "the stage", name: `round the stage ${r.toFixed(0)} m out`, start: { x: sx + r, z: sz, heading: way > 0 ? 0 : Math.PI, pitch: 0 }, frames, swings: true, keys: hold(1, 0, (-way * WALK) / (TURN * r), 0, 0) });
    if (way > 0) out.push({ of: "the stage", name: `sideways round the stage ${r.toFixed(0)} m out`, start: { x: sx + r, z: sz, heading: -Math.PI / 2, pitch: 0.3 }, frames, swings: true, keys: hold(0, 1, -WALK / (TURN * r), 0, 0) });
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
    out.push({ of: "the path", name: `the path ${way > 0 ? "on" : "back at a run"}`, start: { x: p0.x, z: p0.z, heading: Math.atan2(-t0.x * way, -t0.z * way), pitch: 0 }, frames: Math.floor(path.curveLength / (WALK * (run ? RUN : 1) * DT)), swings: true,
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
    out.push({ of: "at random", name: `at random, ${i}`, start: { x: from.x + (random() - 0.5) * 16, z: from.z + (random() - 0.5) * 16, heading: random() * 6.283, pitch: 0 }, frames: 600, swings: true,
      keys: (f) => { if (f >= till) { till = f + 20 + Math.floor(random() * 70); now = [pick([1, 1, 1, 0, -1, -1]), pick([0, 0, 0, 1, -1]), pick([0, 0, 1, -1, 0.4, -0.4]), pick([0, 0, 1]), pick([0, 0, 0, 1, -1])]; } return now; } });
  });
  return out;
}

// The walk's limits with no bear and no tree: the island's edge and the stage's reach.
const limits = walkLimits([]);

// How near the bear the eye must be for it to be tried against the bear, in m, as `measure` tells how near: the bear's furthest
// corner from its head's point that is no lower than it, its nose, is 2.4 m from there as it stands, and lower than that none is
// further than that from the bear's own line.
const BEAR_NEAR = 4.5;
// What the bear draws, as avatar.js builds it: each mesh of its group, the body and the four legs, with its triangles in the mesh's
// own frame. The eye is brought into that frame and tried there, which costs a frame nothing but the trying.
type BearPart = Part & { matrixWorld: unknown };
function bearOf(avatar: Avatar) {
  const parts: { mesh: BearPart; tris: Float64Array }[] = [], v = new THREE.Vector3();
  (avatar.g as Mark).traverse((o) => {
    if (!o.isMesh) return;
    const { index, attributes: { position } } = o.geometry, n = index ? index.count : position.count, out: number[] = [];
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(position, index ? index.getX(i) : i); out.push(v.x, v.y, v.z); }
    parts.push({ mesh: o as BearPart, tris: Float64Array.from(out) });
  });
  const inverse = new THREE.Matrix4(), eye = new THREE.Vector3();
  // Whether the point is inside any of them, where they stand now.
  return (x: number, y: number, z: number) => {
    (avatar.g as Mark).updateMatrixWorld(true);
    return parts.some(({ mesh, tris }) => { eye.set(x, y, z).applyMatrix4(inverse.copy(mesh.matrixWorld).invert()); return within(tris, eye.x, eye.y, eye.z); });
  };
}

// Walks the walks with the world's camera, and each walk that swings with a camera that nothing is in the way of besides: a walk
// that does not swing, straight or turning on the spot, moves that camera less than the swift pace, so it has no need of one. Tells,
// of every frame: how far the camera moved, in a walk that swings and in one that does not, and how far the other camera did;
// whether the eye is under the ground, lower over it than the camera keeps or in the stage's column; whether it is in something a
// landmark draws, and which of three ways (below); how near the bear it is, and whether it is in what the bear itself draws; and
// whether a landmark stands between it and the bear's head, with the head in no landmark's box.
// The eye in something a landmark draws is one of three things. With the bear's head in that landmark's box, it is the camera in
// the landmark with the bear (`inOwn`). Out of the box the camera keeps out of for that landmark, it is in what the landmark has
// higher than that box, which is open to it as a handrail is (avatar.js keepOutBox; `inOpen`). Any other is the eye where the
// camera's own rules say it never is (`inDrawn`).
function measure(w: World, walks: Walk[]) {
  const { phone, marks, solids } = w, mine = avatarOf(marks, phone), bare = bareOf(phone), inBear = bearOf(mine);
  const camera = cameraOf(phone), other = cameraOf(phone), was = new THREE.Vector3(), otherWas = new THREE.Vector3(), head = new THREE.Vector3();
  const told = { frames: 0, most: 0, mostAt: "", steadyMost: 0, steadyAt: "", bareMost: 0, under: 0, low: 0, inColumn: 0, inDrawn: [] as string[], inOwn: 0, inOpen: 0, nearer: 0, nearest: Infinity, inBear: [] as string[], tried: 0, hidden: 0, run: 0, runAt: "" };
  for (const walk of walks) {
    const walker = { ...walk.start };
    confine(walker, limits);
    let run = 0;
    for (let f = 0; f < walk.frames; f++) {
      if (f > 0) stride(walker, walk.keys(f, walker), limits);
      mine.step(walker.x, walker.z, walker.heading, DT);
      mine.boom(camera, walker, DT, f === 0);
      if (walk.swings) bare.boom(other, walker, DT, f === 0);
      const { x, y, z } = camera.position as Point, hy = height(walker.x, walker.z) + HEAD;
      // The frames after a cut settle the boom: they count for where the camera is, not for how it moved.
      if (f > 1) {
        const moved = camera.position.distanceTo(was);
        if (moved > told.most) { told.most = moved; told.mostAt = `${walk.name}, frame ${f}`; }
        if (walk.swings) told.bareMost = Math.max(told.bareMost, other.position.distanceTo(otherWas));
        else if (moved > told.steadyMost) { told.steadyMost = moved; told.steadyAt = `${walk.name}, frame ${f}`; }
      }
      was.copy(camera.position); otherWas.copy(other.position);
      // How near the bear: from its head's point where the eye is higher than that, and from the bear's own line where it is lower.
      const ground = height(x, z), from = Math.hypot(x - walker.x, Math.max(0, y - hy), z - walker.z);
      if (y < ground) told.under += 1;
      if (y < ground + 1.2 - 1e-6) told.low += 1;
      if (Math.hypot(x - STAGE_COLUMN.x, z - STAGE_COLUMN.z) < STAGE_COLUMN.r && y < STAGE_COLUMN.top) told.inColumn += 1;
      if (from < LEAST - 1e-6) told.nearer += 1;
      told.nearest = Math.min(told.nearest, from);
      let hidden = false, headIn = false;
      head.set(walker.x, hy, walker.z);
      for (const s of solids) {
        const own = s.keep.containsPoint(head);
        if (own) headIn = true;
        if (s.drawn.containsPoint(camera.position) && within(s.tris, x, y, z)) {
          if (own) told.inOwn += 1; else if (!s.keep.containsPoint(camera.position)) told.inOpen += 1; else told.inDrawn.push(`${walk.name}, frame ${f}`);
        }
        if (!hidden && meets(s.drawn, x, y, z, walker.x, hy, walker.z) && crossings(s.tris, x, y, z, [walker.x - x, hy - y, walker.z - z], 1) > 0) hidden = true;
      }
      if (hidden && !headIn) { told.hidden += 1; run += 1; if (run > told.run) { told.run = run; told.runAt = `${walk.name}, to frame ${f}`; } } else run = 0;
      // The bear's own body and legs, where they stand this frame.
      if (from < BEAR_NEAR) { told.tried += 1; if (inBear(x, y, z)) told.inBear.push(`${walk.name}, frame ${f}`); }
      told.frames += 1;
    }
  }
  return told;
}
// The largest move of the camera in one frame of a walk, with the world's camera.
function largestMove(w: World, walk: Walk) {
  const walker = { ...walk.start };
  confine(walker, limits);
  return walkCamera(avatarOf(w.marks, w.phone), cameraOf(w.phone), walker, walk.frames, (f, at) => { if (f > 0) stride(at, walk.keys(f, at), limits); });
}
// A walk from a to b in a landmark's own frame, forwards at a walk, looking level.
function across(mark: Mark, a: number[], b: number[], name: string): Walk {
  const c = Math.cos(mark.rotation.y), s = Math.sin(mark.rotation.y), to = ([x, z]: number[]) => [mark.position.x + x * c + z * s, mark.position.z - x * s + z * c];
  const [ax, az] = to(a), [bx, bz] = to(b);
  return { of: name, name, start: { x: ax, z: az, heading: Math.atan2(ax - bx, az - bz), pitch: 0 }, frames: Math.ceil(Math.hypot(bx - ax, bz - az) / (WALK * DT)), keys: () => [1, 0, 0, 0, 0] };
}

// Turning on the spot a metre outside a landmark's reach, at one of eight places round it, as the review's sweeps turned: left at
// the odd places, looking up a little, and right at the even ones, looking level.
function turningBeside(mark: Mark, k: number, a: number, frames = 240): Walk {
  const r = Math.max(4, mark.userData.reach ?? 5) + 1, c = Math.cos(mark.rotation.y), s = Math.sin(mark.rotation.y), x = r * Math.cos((a * Math.PI) / 4 + 0.2), z = r * Math.sin((a * Math.PI) / 4 + 0.2);
  const name = `turning beside song ${k}, place ${a}`;
  return { of: `song ${k}`, name, start: { x: mark.position.x + x * c + z * s, z: mark.position.z - x * s + z * c, heading: a, pitch: a % 2 ? 0.3 : 0 }, frames, keys: () => [0, 0, a % 2 ? 1 : -1, 0, 0] };
}

let WORLDS: World[];
const on = (date: string, phone: boolean) => WORLDS.find((w) => w.date === date && w.phone === phone)!;
// Placing four shows' landmarks on two tiers takes a second or two, most of it their search for room beside the bears' line.
beforeAll(() => { WORLDS = SHOWS.flatMap(([date, set2]) => [false, true].map((phone) => world(date, set2, phone))); }, 30000);

describe("the walk's camera at a landmark and the stage", () => {
  // How far over its swift pace (world-walks.ts `pace`), or over the same walk with nothing in its way, a frame may move the
  // camera: what keeping over rising ground adds to a step at the full pace.
  const OVER = 0.05;

  it("goes no faster than three boom lengths a second", () => {
    expect([swift(false), swift(true)]).toEqual([3 * boomLength(false), 3 * boomLength(true)]);
    // The one place the figures are held: in a sixtieth of a second, on a desktop and on a phone.
    expect([pace(false), pace(true)]).toEqual([0.55, 1]);
  });

  // 420,000 frames a tier over the four shows, and the eye tried against every triangle of a landmark it comes near and of the
  // bear when it is near that: four seconds here, and more on a busy machine.
  it("never cuts: walking, running, backwards, sideways, in arcs and turning on the spot, at and across every landmark of four shows and round the stage, the camera moves no further in a frame than its swift pace or the same walk moves it with nothing in its way; the eye is over the ground, out of the stage's column, no nearer the bear's head than the boom's least, never in the bear, and in nothing a landmark draws inside its keep-out box but where the bear itself is in that box; and a landmark hides the bear's head only for a moment", { timeout: 60000 }, () => {
    // The share of frames a landmark may hide the head in; and the longest it may hide it, in frames: 0.9 s.
    const HIDDEN = 0.035, LOST = 54;
    for (const phone of [false, true]) {
      const sum = { frames: 0, most: 0, mostAt: "", bareMost: 0, under: 0, low: 0, inColumn: 0, inDrawn: [] as string[], inOwn: 0, inOpen: 0, nearer: 0, nearest: Infinity, inBear: [] as string[], tried: 0, hidden: 0, run: 0, runAt: "" };
      for (const [date] of SHOWS) {
        const w = on(date, phone), told = measure(w, walksOf(w)), where = `${date} on a ${phone ? "phone" : "desktop"}`;
        // No cut. Main's camera moved up to 22 m in a frame on walks like these on a desktop and 36 m on a phone (issue #178).
        expect(told.most, `${where}: ${told.mostAt}`).toBeLessThanOrEqual(Math.max(pace(phone), told.bareMost) + OVER);
        // A walk that does not swing has no camera beside it to be held to: it is held to the pace alone.
        expect(told.steadyMost, `${where}: ${told.steadyAt}`).toBeLessThanOrEqual(pace(phone) + OVER);
        if (told.most > sum.most) { sum.most = told.most; sum.mostAt = `${where}: ${told.mostAt}`; }
        if (told.run > sum.run) { sum.run = told.run; sum.runAt = `${where}: ${told.runAt}`; }
        sum.bareMost = Math.max(sum.bareMost, told.bareMost); sum.nearest = Math.min(sum.nearest, told.nearest);
        sum.inDrawn.push(...told.inDrawn.map((at) => `${where}: ${at}`)); sum.inBear.push(...told.inBear.map((at) => `${where}: ${at}`));
        for (const key of ["frames", "under", "low", "inColumn", "inOwn", "inOpen", "nearer", "tried", "hidden"] as const) sum[key] += told[key];
      }
      const tier = phone ? "phone" : "desktop";
      expect(sum.frames, tier).toBeGreaterThan(400000);
      // With nothing in its way the camera's largest move is the walk's own: in the walks that swing, running and turning at
      // once swings the boom's end 0.71 m in a frame on a desktop and 0.87 m on a phone. With the landmarks and the stage it is
      // that, or its swift pace.
      expect(sum.bareMost, tier).toBeCloseTo(phone ? 0.87 : 0.71, 1);
      expect(sum.most, `${tier}: ${sum.mostAt}`).toBeLessThanOrEqual(Math.max(pace(phone), sum.bareMost) + OVER);
      // Over the ground by what the boom keeps, and out of the stage's column, in every frame.
      expect([sum.under, sum.low, sum.inColumn], tier).toEqual([0, 0, 0]);
      // In nothing a landmark draws inside the box the camera keeps out of for it, unless the bear's head is in that box. With
      // the head in the box it is in something that landmark draws on 7 frames of a desktop's and none of a phone's, backing
      // through the bandstand at a run; and on 3 frames of each it is in what the road has over its keep-out box, the open
      // part of it, where the camera goes as it would with no road there (landmarks.test.ts).
      expect(sum.inDrawn, tier).toEqual([]);
      expect(sum.inOwn, tier).toBeLessThanOrEqual(12);
      expect(sum.inOpen, tier).toBeLessThanOrEqual(6);
      // No nearer the bear than the boom's least, in any frame: from its head's point, or lower than that from its own line.
      // And never in the bear, which it is tried against in the frames that have it within BEAR_NEAR, 13,700 of a desktop's
      // and 10,000 of a phone's. The camera of the commit before this rule was nearer the head's point than the least on 972
      // of these frames on a desktop, 1.34 m at the nearest, and in the bear on 30: backing at a landmark while looking up, it
      // went down under the bear's head.
      expect(sum.nearer, tier).toBe(0);
      expect(sum.nearest, tier).toBeGreaterThanOrEqual(LEAST - 1e-6);
      expect(sum.tried, tier).toBeGreaterThan(5000);
      expect(sum.inBear, tier).toEqual([]);
      // The bear is not lost. Main's camera, which cut, let no landmark stand between it and a head outside every box. This one
      // does while it goes round or over: in 2.0 % of these frames on a desktop and 2.3 % on a phone, which walk at every
      // landmark, and for 43 frames together at the longest on a desktop and 49 on a phone. (These are frames with the head
      // out of every landmark's box; with the frames it is in one counted too, the shares are half as much again.)
      expect(sum.hidden / sum.frames, tier).toBeLessThan(HIDDEN);
      expect(sum.hidden / sum.frames, tier).toBeGreaterThan(0.005);
      expect(sum.run, `${tier}: ${sum.runAt}`).toBeLessThanOrEqual(LOST);
    }
  });

  it("holds its whole step to its pace on two more shows, where the review of #191 found a phone's camera moving 1.06 to 1.10 m in a frame: turning on the spot at eight places round every landmark, and across each looking up, on both tiers", { timeout: 60000 }, () => {
    // What added to the pace there: the place is carried with the bear's turn, goes after its goal by what the turn leaves of the
    // pace, and is then sent on along a landmark's side by the length of both together, and raised by the ground. Its whole
    // step is now held to the pace (avatar.js): without that these walks move it 1.21 m in a frame on a phone.
    for (const date of ["1976-06-26", "1969-04-17"]) for (const phone of [false, true]) {
      const w = world(date, partway(date), phone, false), walks = walksOf(w).filter((walk) => !walk.swings && walk.name.includes("looking up"));
      w.marks.forEach((mark, k) => { for (let a = 0; a < 8; a++) walks.push(turningBeside(mark, k, a)); });
      expect(walks.length).toBeGreaterThan(100);
      // The largest of them is now the pace and 4 mm on a desktop, and the pace to a fifth of a millimetre on a phone.
      for (const walk of walks) expect(largestMove(w, walk), `${date} on a ${phone ? "phone" : "desktop"}: ${walk.name}`).toBeLessThanOrEqual(pace(phone) + 0.01);
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
      const mine = avatarOf(w.marks, phone), bare = bareOf(phone);
      const camera = cameraOf(phone), other = cameraOf(phone), walker = { ...walk.start };
      let apart = 0, inside = 0;
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker), limits);
        mine.boom(camera, walker, DT, f === 0);
        bare.boom(other, walker, DT, f === 0);
        apart = Math.max(apart, camera.position.distanceTo(other.position));
        if (w.solids[STONE].keep.containsPoint(new THREE.Vector3(walker.x, height(walker.x, walker.z) + HEAD, walker.z))) inside += 1;
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
        if (f > 0 && f < walk.frames) stride(walker, walk.keys(f, walker), limits);
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
      // What this test's own figures are reckoned from is held here, so that they cannot follow a change to it.
      expect([GATHER, LAND, SLACK]).toEqual([0.4, 0.08, 0.02]);
      // In front of the tower: on the bear's side of it, out of its room, and nothing of it between the eye and the head.
      const out = Math.max(keep.min.x - x, x - keep.max.x, keep.min.z - z, z - keep.max.z, y - keep.max.y);
      expect(out, where).toBeGreaterThanOrEqual(room - 1e-6);
      expect(Math.hypot(x - walker.x, y - hy, z - walker.z), where).toBeGreaterThanOrEqual(LEAST - 1e-6);
      expect(Math.hypot(x - walker.x, z - walker.z), where).toBeLessThan(Math.hypot(mark.position.x - walker.x, mark.position.z - walker.z));
      expect(crossings(tris, x, y, z, [walker.x - x, hy - y, walker.z - z], 1), where).toBe(0);
      // And that is where a cut to the same stand puts it: easing there lands where it would have landed.
      const cut = avatarOf(w.marks, phone), fresh = cameraOf(phone);
      cut.step(walker.x, walker.z, walker.heading, 0);
      cut.boom(fresh, walker, 0, true);
      expect(camera.position.distanceTo(fresh.position), where).toBeLessThan(SLACK + 0.05);
    }
  });

  // A walker who has stopped, and a camera that has not: the review of #191 found the camera swinging for ever between two places
  // 0.5 m apart (1 m on a phone) beside the stage's column, its goal over the column, where the way round turned back each frame;
  // and the same between two landmarks whose rooms overlap. Here every kind of walk is cut off at a frame of its own and the bear
  // stands still. 1,771 stops a tier on seven shows, 1.6 million frames in all: four seconds, and more on a busy machine.
  it("comes to rest once the bear stands still, whatever the walk before: after each kind of walk at every third landmark of seven shows, round the stage, along the path and at random, and after turning round at the stage's edge as the review did, it moves less than a centimetre a frame within three seconds and rests where a cut to that stand would put it", { timeout: 120000 }, () => {
    // How long the bear stands, in frames; and by when the camera must be at rest, in frames: 3 s.
    const STILL = 300, REST = 180;
    const [sx, sz] = STAGE;
    for (const phone of [false, true]) {
      const tier = phone ? "phone" : "desktop";
      let stops = 0, longest = 0, longestAt = "";
      for (const [date, set2] of [...SHOWS, ...MORE.map((d): [string, number] => [d, partway(d)])]) {
        const w = SHOWS.some(([d]) => d === date) ? on(date, phone) : world(date, set2, phone, false), random = seeded(31 + set2);
        const avatar = avatarOf(w.marks, phone), cutter = avatarOf(w.marks, phone), camera = cameraOf(phone), fresh = cameraOf(phone), was = new THREE.Vector3();
        // Each kind of the show's walks, those at a landmark at every third one, cut off between a third of a second in and its
        // end, or 400 frames in at the latest.
        const walks: Walk[] = walksOf(w, 3).filter((walk) => !walk.of.startsWith("song ") || Number(walk.of.slice(5)) % 3 === 0).map((walk) => ({ ...walk, frames: 20 + Math.floor(random() * Math.min(400, walk.frames - 20)) }));
        // The review's: on the walk's limit at the stage, facing it, still for 120 frames; the turn key held for 90, which turns
        // the bear round; and still. From twelve places round the stage, turning either way, looking level and looking up.
        for (let a = 0; a < 12; a++) for (const turn of [1, -1]) for (const pitch of [0, 0.4]) {
          const x = sx + STAGE_REACH * Math.cos((a * Math.PI) / 6), z = sz + STAGE_REACH * Math.sin((a * Math.PI) / 6);
          walks.push({ of: "the stage", name: `turning round at the stage's edge, place ${a}, ${turn > 0 ? "left" : "right"}, pitch ${pitch}`, start: { x, z, heading: Math.atan2(x - sx, z - sz), pitch }, frames: 210, keys: (f) => [0, 0, f >= 120 ? turn : 0, 0, 0] });
        }
        // Two stands that sweeps of ten shows found, where the camera came to rest metres from where a cut would put it. In the
        // corner between two landmarks whose rooms overlap, where each one's way round led into the other: 5.3 m short. And
        // pressed a hand's breadth into a room's edge by the bear, which pressed it back in each frame it came out: 10.2 m short.
        if (date === "1987-09-12") walks.push(turningBeside(w.marks[3], 3, 3, 34));
        if (date === "1980-05-15") walks.push(turningBeside(w.marks[5], 5, 5, 225));
        for (const walk of walks) {
          const walker = { ...walk.start }, at = `${date} on a ${tier}: ${walk.name}, stopped at frame ${walk.frames}`;
          confine(walker, limits);
          let rested = 0;
          for (let f = 0; f < walk.frames + STILL; f++) {
            if (f > 0 && f < walk.frames) stride(walker, walk.keys(f, walker), limits);
            avatar.step(walker.x, walker.z, walker.heading, DT);
            avatar.boom(camera, walker, DT, f === 0);
            // At rest from the frame after the last in which it moved a centimetre.
            if (f >= walk.frames && camera.position.distanceTo(was) >= 0.01) rested = f - walk.frames + 1;
            was.copy(camera.position);
          }
          cutter.step(walker.x, walker.z, walker.heading, 0);
          cutter.boom(fresh, walker, 0, true);
          expect(rested, at).toBeLessThanOrEqual(REST);
          expect(camera.position.distanceTo(fresh.position), at).toBeLessThan(SLACK + 0.05);
          if (rested > longest) { longest = rested; longestAt = at; }
          stops += 1;
        }
      }
      expect(stops, tier).toBeGreaterThan(1500);
      // The longest it takes: 123 frames on a desktop and 118 on a phone, two seconds. Most of that is the boom's own: its goal goes on moving after the bear stops, as
      // the boom eases, takes notice of a landmark the head has just left (GRACE) and rises for it, a step at a time; the place
      // is at rest within its gathering, its way and its landing of the goal's last move.
      expect(longest, `${tier}: ${longestAt}`).toBeGreaterThan(60);
    }
  });

  it("goes round a trunk in its way as it goes after its goal, and under a crown no faster than the crown's slope makes it: in the woods beside the landmarks of two shows, turning on the spot at eight places round each, it never jumps from one side of a trunk to the other", { timeout: 120000 }, () => {
    // A crown's ceiling comes down a metre for each metre nearer the crown (trees.js `ceiling`). So a place that goes level at its
    // pace under a crown's edge takes the camera down as fast as it takes it along: the two together, the square root of two paces.
    const SLOPE = Math.SQRT2;
    for (const phone of [false, true]) for (const date of ["1973-11-28", "1991-09-12"]) {
      const w = world(date, partway(date), phone, false), wood = treesOf(w.placed, phone), where = `${date} on a ${phone ? "phone" : "desktop"}`;
      const among = walkLimits([], wood.trunks as never, TREE_REACH as never), trees = { slide: wood.slide, ceiling: wood.ceiling };
      const mine = avatarOf(w.marks, phone, trees), open = buildAvatar(new THREE.Scene(), [], { phone, reduced: false, ...trees } as never) as unknown as Avatar, treeless = avatarOf(w.marks, phone);
      const camera = cameraOf(phone), other = cameraOf(phone), third = cameraOf(phone), was = new THREE.Vector3(), otherWas = new THREE.Vector3();
      let most = 0, mostAt = "", openMost = 0, moved = 0, frames = 0;
      w.marks.forEach((mark, k) => {
        // A landmark with a tree within 30 m of it: its wood is beside it.
        if (wood.trunks(mark.position.x, mark.position.z, 30).length === 0) return;
        for (let a = 0; a < 8; a++) {
          const walk = turningBeside(mark, k, a), walker = { ...walk.start };
          confine(walker, among);
          for (let f = 0; f < walk.frames; f++) {
            if (f > 0) stride(walker, walk.keys(f, walker), among);
            mine.step(walker.x, walker.z, walker.heading, DT);
            mine.boom(camera, walker, DT, f === 0); open.boom(other, walker, DT, f === 0);
            if (f > 1) {
              const went = camera.position.distanceTo(was);
              if (went > most) { most = went; mostAt = `${walk.name}, frame ${f}`; }
              openMost = Math.max(openMost, other.position.distanceTo(otherWas));
            }
            was.copy(camera.position); otherWas.copy(other.position);
            // How far the trees have this camera from where it would be with none, told at every other place.
            if (a % 2 === 0) { treeless.boom(third, walker, DT, f === 0); moved = Math.max(moved, camera.position.distanceTo(third.position)); }
            frames += 1;
          }
        }
      });
      // The trees did move this camera from where it would be with none, by 3 m and more; and with the landmarks it goes no
      // faster than its pace under a crown's slope, or than the same turns move a camera with the trees and no landmark. Its
      // largest move is 0.66 m on a desktop and 1.19 m on a phone, under a crown; before the place itself went round a trunk
      // (avatar.js `slide`), the camera was slid out of each trunk from wherever the place was, and where the place crossed a
      // trunk's middle it jumped from one side of the trunk to the other: 2.98 m in a frame on a phone, in these turns.
      expect(frames, where).toBeGreaterThan(10000);
      expect(moved, where).toBeGreaterThan(1);
      expect(most, `${where}: ${mostAt}`).toBeLessThanOrEqual(Math.max(SLOPE * pace(phone), openMost) + OVER);
    }
  });

  it("stands as high as the crowd asks in every frame, on its way to its goal as at it: with a stand-in for the crowd that asks 9 m over the ground everywhere, a walk past the tower never has the camera lower", () => {
    // crowd.js `over` raises a camera's place to clear the crowd's figures. It is asked of the boom's end and, last of all, of the
    // camera's place, which a landmark has drawn in from there: this stand-in asks the same of both.
    const HIGH = 9, over = (p: Point) => { p.y = Math.max(p.y, height(p.x, p.z) + HIGH); };
    for (const phone of [false, true]) {
      const w = on("1986-07-04", phone), walk = across(w.marks[17], [0, -20], [0, 7], "past the tower");
      const raised = avatarOf(w.marks, phone, { over }), plain = avatarOf(w.marks, phone), camera = cameraOf(phone), other = cameraOf(phone), walker = { ...walk.start };
      let lower = 0;
      for (let f = 0; f < walk.frames + 90; f++) {
        if (f > 0 && f < walk.frames) stride(walker, walk.keys(f, walker), limits);
        raised.step(walker.x, walker.z, walker.heading, DT);
        raised.boom(camera, walker, DT, f === 0); plain.boom(other, walker, DT, f === 0);
        const { x, y, z } = camera.position as Point, low = other.position as Point;
        expect(y, `frame ${f}`).toBeGreaterThanOrEqual(height(x, z) + HIGH - 1e-9);
        lower = Math.max(lower, height(low.x, low.z) + HIGH - low.y);
      }
      // And it had to be raised: with no crowd the same walk has the camera 3.8 m lower than that on a desktop, drawn in at the tower.
      expect(lower, phone ? "phone" : "desktop").toBeGreaterThan(3);
    }
  });

  it("goes on from where another camera left the view: after a ride with the bears it starts from that camera's place, not from where it last stood in a walk", () => {
    for (const phone of [false, true]) {
      // A walk past the Lovelight tower; then a ridden camera leaves the view 9 m behind the bear and 5 m up, with the tower
      // between that place and the bear, so the walk's camera has somewhere else to go from there.
      const w = on("1986-07-04", phone), mark = w.marks[17], walk = across(mark, [0, -20], [0, 7], "past the tower"), avatar = avatarOf(w.marks, phone), camera = cameraOf(phone), walker = { ...walk.start };
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker), limits);
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

  it("gathers its pace from nothing each time: cut off in the middle of its way, it sets off the next time a landmark comes into the boom's way as slowly as it did the first", () => {
    for (const phone of [false, true]) {
      // The bear stands 9 m from the Lovelight tower's middle and turns on the spot at the keys' rate, so that the boom sweeps
      // round onto the tower. A camera with nothing in its way turns beside it, to tell the frame the tower moves this one.
      const w = on("1986-07-04", phone), mark = w.marks[17], avatar = avatarOf(w.marks, phone), bare = bareOf(phone), camera = cameraOf(phone), other = cameraOf(phone), was = new THREE.Vector3();
      const walker = { x: mark.position.x + 9, z: mark.position.z + 1, heading: 0, pitch: 0 }, turn = () => { walker.heading += (TURN * 1) / 60; avatar.step(walker.x, walker.z, walker.heading, DT); };
      // Cuts to a heading, turns on, and tells the first frame in which the camera is not where the other is: how far it moved in
      // that frame, and the heading. The frame of the cut has nothing in the boom's way.
      const setsOff = (heading: number) => {
        walker.heading = heading;
        for (let f = 0; f < 300; f++) {
          if (f > 0) turn();
          avatar.boom(camera, walker, DT, f === 0);
          bare.boom(other, walker, DT, f === 0);
          const apart = camera.position.distanceTo(other.position);
          if (f === 0) expect(apart, "at the cut").toBeLessThan(1e-9);
          else if (apart > 1e-9) return { moved: camera.position.distanceTo(was), heading: walker.heading };
          was.copy(camera.position);
        }
        throw new Error("nothing came into the boom's way in a whole turn");
      };
      // The heading the boom is clear at for the longest stretch of a turn, told by a cut to each heading of one: the cut is
      // made a third of a second into it.
      let best = 0, from = 0;
      for (let n = 0, run = 0; n < 472; n++) {
        const heading = (n * TURN) / 60;
        walker.heading = heading;
        avatar.boom(camera, walker, 0, true); bare.boom(other, walker, 0, true);
        run = camera.position.distanceTo(other.position) < 1e-9 ? run + 1 : 0;
        if (run > best) { best = run; from = heading - ((run - 1) * TURN) / 60; }
      }
      expect(best, phone ? "phone" : "desktop").toBeGreaterThan(40);
      const first = setsOff(from + (20 * TURN) / 60);
      // On for a fifth of a second, the camera going after its goal and gathering pace; then the cut, to a third of a second
      // before that heading, and the turn again.
      for (let f = 0; f < 12; f++) { turn(); avatar.boom(camera, walker, DT, false); }
      const second = setsOff(first.heading - (20 * TURN) / 60);
      // Each time it sets off from nothing: in its first frame it goes what a frame of gathering gives, 0.023 m on a desktop
      // and 0.042 m on a phone, where a pace kept from before the cut would take it ten times as far.
      const gathered = swift(phone) / GATHER / 3600;
      expect(first.moved, phone ? "phone" : "desktop").toBeLessThanOrEqual(gathered + 1e-6);
      expect(second.moved, phone ? "phone" : "desktop").toBeLessThanOrEqual(gathered + 1e-6);
      // The same landmark, a frame or two sooner: the boom had not yet fallen as far behind the turn as in a whole one.
      expect(Math.abs(second.heading - first.heading)).toBeLessThan(0.1);
    }
  });

  it("makes nothing in a frame: no vector, box or matrix as it goes round the tower and lands, and its code has no loop over a list but by its indexes, no function made as it runs and no object or list written out", () => {
    for (const phone of [false, true]) {
      // The walk of the rest's test: through the Lovelight tower, a stop 6 m past it, and a second and a half more.
      const w = on("1986-07-04", phone), walk = across(w.marks[17], [0, -20], [0, 7], "past the tower"), avatar = avatarOf(w.marks, phone), bare = bareOf(phone);
      const camera = cameraOf(phone), other = cameraOf(phone), walker = { ...walk.start };
      // The counter sees what the world's modules make: building the bear and its camera made vectors.
      expect(made.count).toBeGreaterThan(0);
      let frames = 0, apart = 0;
      for (let f = 0; f < walk.frames + 90; f++) {
        if (f > 0 && f < walk.frames) stride(walker, walk.keys(f, walker), limits);
        avatar.step(walker.x, walker.z, walker.heading, DT);
        const before = made.count;
        avatar.boom(camera, walker, DT, f === 0);
        frames += made.count - before;
        bare.boom(other, walker, DT, f === 0);
        apart = Math.max(apart, camera.position.distanceTo(other.position));
      }
      // The landmarks did move this camera: it stood metres from where it would with none, going after its goal. And made nothing.
      expect(apart, phone ? "phone" : "desktop").toBeGreaterThan(5);
      expect(frames, phone ? "phone" : "desktop").toBe(0);
    }
    // What a count of three's classes cannot see: a list walked by `for ... of` makes an iterator, an arrow or a function written in
    // a function is made at each call, and an object or a list written out is made where it stands. None is in the frame's code:
    // boom.js's functions, and avatar.js's boom and clear. (rise's Math.hypot is as it was: a root in its place is another number.)
    const made0 = /\bnew\b|=>|\bfunction\b.*\bfunction\b|\bfor \([^;)]*\bof\b|\.\.\.|return \{|[=(,] \[|= \{|\.(map|filter|some|every|forEach|slice|concat)\(/;
    const boomJs = readFileSync(new URL("../../../public/world/boom.js", import.meta.url), "utf8"), avatarJs = readFileSync(new URL("../../../public/world/avatar.js", import.meta.url), "utf8");
    const bodies = ["nearest", "enters", "stoodOff", "standOff", "goRound", "rise"].map((name) => { const from = boomJs.indexOf(`function ${name}(`); return [name, boomJs.slice(from, boomJs.indexOf("\n}\n", from))]; });
    bodies.push(["boom", avatarJs.slice(avatarJs.indexOf("  function boom(camera, walker, dt, cut) {"), avatarJs.indexOf("  /* Another camera placed the view"))]);
    bodies.push(["clear", avatarJs.slice(avatarJs.indexOf("  function clear(p) {"), avatarJs.indexOf("  /* The walk's camera. Its place and its aim ease after the bear"))]);
    for (const [name, text] of bodies) {
      expect(text.length, name).toBeGreaterThan(200);
      expect(text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => made0.test(line)), name).toEqual([]);
    }
    // And the check can fail: each of these would be caught.
    for (const bad of ["for (const b of boxes) {", "const aim = (a) => { dir.x = a; };", "return { lift, room };", "const out = [];", "boxes.some((b) => b)", "new THREE.Vector3()"]) expect(made0.test(bad), bad).toBe(true);
  });

  it("is where it comes to rest in every frame under reduced motion: where a cut to that stand would put it, with nothing left to draw once the input ends", () => {
    for (const phone of [false, true]) {
      const w = on("1986-07-04", phone), walk = across(w.marks[17], [1, -20], [1, 20], "past the tower");
      const still = avatarOf(w.marks, phone, { reduced: true }), camera = cameraOf(phone), fresh = cameraOf(phone), again = new THREE.Vector3(), walker = { ...walk.start };
      let moved = 0;
      for (let f = 0; f < walk.frames; f++) {
        if (f > 0) stride(walker, walk.keys(f, walker), limits);
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

  it("stands on its goal wherever no landmark and no column is in the boom's way: the same camera to the last bit as one in a world with none, on a walk that keeps far from both, and that one eases after the bear as the boom always has", () => {
    for (const phone of [false, true]) {
      // A world of the stage's column and one landmark, the Lovelight tower, and a walk on the island's west side, 100 m from both.
      const w = on("1986-07-04", phone), tower = w.marks[17], mine = avatarOf([tower], phone), bare = bareOf(phone);
      const camera = cameraOf(phone), other = cameraOf(phone), walker = { x: -60, z: 0, heading: 0.4, pitch: 0 }, random = seeded(3);
      // The boom's own ease, a fifth of a second, toward its length behind the bear and 0.35 rad over its head, less the look's
      // tilt (avatar.js). The ground and the crowd move the camera up and down only, so its place seen from above is that ease's.
      const ease = 1 - Math.exp(-DT / 0.2), was = { x: 0, z: 0 };
      let keys = [1, 0, 0, 0, 0];
      for (let f = 0; f < 900; f++) {
        // The keys change every three quarters of a second; a walker 20 m from where it set out turns back.
        if (f % 45 === 0) keys = [1, random() < 0.3 ? 1 : 0, random() < 0.5 ? 1 : -1, random() < 0.4 ? 1 : 0, random() < 0.3 ? 1 : random() < 0.5 ? -1 : 0];
        if (f > 0) stride(walker, Math.hypot(walker.x + 60, walker.z) < 20 ? keys : [1, 0, 1, 0, 0], limits);
        mine.boom(camera, walker, DT, f === 0);
        bare.boom(other, walker, DT, f === 0);
        expect((camera.position as { toArray(): number[] }).toArray(), `frame ${f}`).toEqual((other.position as { toArray(): number[] }).toArray());
        const { x, z } = camera.position as Point, back = boomLength(phone) * Math.cos(0.35 - walker.pitch), to = { x: walker.x + Math.sin(walker.heading) * back, z: walker.z + Math.cos(walker.heading) * back };
        if (f > 0) expect([x, z], `frame ${f}`).toEqual([expect.closeTo(was.x + (to.x - was.x) * ease, 9), expect.closeTo(was.z + (to.z - was.z) * ease, 9)]);
        was.x = x; was.z = z;
        expect(Math.min(Math.hypot(walker.x - tower.position.x, walker.z - tower.position.z), Math.hypot(walker.x - STAGE[0], walker.z - STAGE[1]))).toBeGreaterThan(100);
      }
      expect(Math.hypot(walker.x, walker.z)).toBeLessThan(BOUND);
    }
  });
});
