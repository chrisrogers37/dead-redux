import { createHash } from "crypto";
import { readdirSync } from "fs";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { GROVE_POSES } from "../../../.github/screenshots/assets.mjs";
import { AS_TITLES } from "../../../.github/screenshots/near.mjs";
import { boomLength, buildAvatar, eyeRoom, HEAD, TOP } from "../../../public/world/avatar.js";
import { landmarksOf, line, MAPS, path, stride, tracksOf, within } from "./world-walks";
import { SNOUT } from "../../../public/world/bears.js";
import { LEAST } from "../../../public/world/boom.js";
import { BODY_REACH, outside } from "../../../public/world/collide.js";
import { chance, STONE_REACH } from "../../../public/world/flora.js";
import { BOUND, CAVES, FIRST_EYE, height, STAGE, STAGE_COLUMN, STAGE_REACH, TEST_POSES, TRAILHEAD } from "../../../public/world/ground.js";
import { buildIsland as worldIsland, FEATHER, offTracks, RING, takesPool as worldPool } from "../../../public/world/island.js";
import { BEAR_GAP, confine, walkLimits as worldLimits } from "../../../public/world/modes.js";
import { nearStand, outline } from "../../../public/world/path.js";
import { CRANE, cranePose, DESCENT_FROM, postPose, ridePose, RIG_EASE_S } from "../../../public/world/pose.js";
import { onCrowdGround } from "../../../public/world/seats.js";
import {
  BASE_FRAC, BESIDE, BROAD_MASSES, broadGeometry, buildTrees, cameraWays, CAVE_ROOM, CELL, CLOSE, CROWD_ROOM, CROWN_BASE, CROWN_R, CROWN_R_MAX, CROWN_REACH, EDGE_NEAR,
  EYE_ROOM, FOOT_IN, FOOT_TOP, formOf, FORMS, FRAME, GLOW_SHARE, grove, GROVES, LANDMARK_ROOM, LEAN, LINE_ROOM, MIN_APART, NY_MIN, PASS, PATH_ROOM, pineGeometry,
  placeTrees, REF_TALL, REF_WIDE, RIDE_FAR, RIDE_STEP, RING_ROOM, ROOTS, RULES, SIGHT_HALF, SPOILS, SQUARE, STAGE_ROOM, SUNK, TALL, TARGET, TRACK_ROOM, TREE_REACH, TRIES,
  TRUNK_FOOT, TRUNK_R_MAX, TRUNK_ROOM, UNDER, VIEW_HALF,
} from "../../../public/world/trees.js";

// The trees are placed here as main.js places them: on the island's own path and bears' line, round a show's landmarks, clear of the
// ways of a tier's cameras. Every show with a map is tried, once as a desktop has it (a TV draws the first 75 of a
// desktop's) and once as a phone has it, whose landmarks have fewer faces and whose cameras stand elsewhere. The trees are placed once
// for each, before the tests, and every test reads those.

type Spot = { x: number; y: number; z: number; tall: number; wide: number; turn: number; lean: number[]; kind: string; tint: number; spoils: number; reach: number; base: number; top: number };
type View = { from: number[]; to: number[]; half: number; spread?: number; cost?: number };
type Mark = { x: number; z: number; rot: number; poly: number[][]; d: number; stand: { x: number; z: number } | null };
type Point = { x: number; y: number; z: number };
type Stand = { x: number; z: number; to: number[]; d: number };
type Ask = { count: number; loop: number[][]; line: number[][]; landmarks: { x: number; z: number; rot: number; poly: number[][] }[]; eyes: number[][]; views: View[]; groves?: (x: number, z: number) => number };
// The trees' own functions, with the shapes of what they take and give, which the world's plain modules do not spell out.
const waysOf = cameraWays as unknown as (ask: { line: unknown; height: unknown; marks: Mark[]; phone: boolean; bears: number[] }) => { eyes: number[][]; views: View[] };
const placed = placeTrees as unknown as (ask: Ask) => { spots: Spot[]; near(x: number, z: number, r: number): boolean };
const rules = RULES as unknown as Record<string, (x: number, z: number, ctx: unknown) => boolean>;
const walkLimits = worldLimits as unknown as (bears: { x: number; z: number }[], trees: (x: number, z: number, r: number) => { x: number; z: number }[], treeReach: number) => ReturnType<typeof worldLimits>;
type Lit = { onBeforeCompile(shader: unknown): void };
const takesPool = worldPool as unknown as (material: unknown, uPool: unknown, stands?: unknown) => Lit;
type Flock = { count: number; getMatrixAt(i: number, m: unknown): void; geometry: { getAttribute(name: string): Corners } };
const buildIsland = worldIsland as unknown as (scene: unknown, grid: number, phone: boolean, loop: number[][], trunks?: (x: number, z: number) => boolean) => { flora: { tufts: Flock; stones: Flock }; lit(material: unknown, stands?: unknown): Lit };
type Built = {
  count: number; meshes: Mesh[]; trunks(x: number, z: number, r: number): { x: number; z: number }[];
  slide(p: Point, room: number, toward?: { x: number; z: number } | null): void; ceiling(x: number, y: number, z: number, room: number): number;
};
type Corners = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
type Mesh = {
  isInstancedMesh: boolean; count: number; castShadow: boolean; frustumCulled: boolean; getMatrixAt(i: number, m: unknown): void;
  getMorphAt(i: number, into: { morphTargetInfluences: number[] }): void; morphTexture: { needsUpdate?: boolean; version: number } | null;
  geometry: { groups: unknown[]; getAttribute(name: string): Corners; morphAttributes: { position: Corners[]; normal: Corners[]; color: Corners[] }; morphTargetsRelative: boolean };
  material: { vertexColors: boolean; onBeforeCompile(shader: unknown): void };
};

// In date order, whatever order the file system lists them in.
const DATES = readdirSync(MAPS).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", "")).sort();
const FIXED = "1986-07-04";
const loop = Array.from({ length: Math.ceil(path.curveLength / 2) }, (_, k) => { const p = path.at((2 * k) / path.curveLength); return [p.x, p.z]; });
const linePoints = Array.from({ length: Math.ceil(line.length) }, (_, d) => { const p = line.at(d); return [p.x, p.z]; });
// How many bears a tier can show, its own number and each the downgrade leaves (main.test.ts holds main.js to these, by the ladder).
const bearsOf = (phone: boolean) => (phone ? [3, 1] : [5, 3, 1]);

// A show's world as main.js gathers it for a tier's trees: its landmarks placed, their outlines, the stands the near views are taken
// from, the ways of the tier's cameras, and the tier's trees placed by them. `as` builds some songs' landmarks for other titles, as
// ?as=K:Title does.
function world(date: string, phone = false, as: [number, string][] = []) {
  const tracks = tracksOf(date);
  // The fixed day's second set opens at track 7; the maps do not say where another show's does, so it is taken to open partway.
  const { landmarkU, builders, landmarks: all } = landmarksOf(tracks, date === FIXED ? 7 : Math.floor(tracks.length * 0.45), phone, as);
  const landmarks = all as { position: { x: number; y: number; z: number }; rotation: { y: number } }[];
  const marks: Mark[] = landmarks.map((g, k) => {
    const s = nearStand(path, landmarkU, landmarks, k);
    return { x: g.position.x, z: g.position.z, rot: g.rotation.y, poly: outline(g, builders.moving), d: line.dOf(landmarkU[k]), stand: s ? { x: s.x, z: s.z } : null };
  });
  // Each stand with its landmark's place and where the bears stand as its song begins.
  const stands: Stand[] = marks.flatMap((m) => (m.stand ? [{ x: m.stand.x, z: m.stand.z, to: [m.x, m.z], d: m.d }] : []));
  const ways = waysOf({ line, height, marks, phone, bears: bearsOf(phone) });
  const ask: Ask = { count: phone ? TARGET.phone : TARGET.desktop, loop, line: linePoints, landmarks: marks, ...ways };
  const { spots, near } = placed(ask);
  return { date, phone, landmarks, marks, stands, ways, ask, trees: spots, near };
}
type World = ReturnType<typeof world>;
// A stand-in for the light the ground takes, and the trees built with it.
const plain = (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; };
const built = (trees: Spot[], phone = false) => { const scene = new THREE.Scene(); return { scene, ...(buildTrees(scene, trees, { lit: plain, phone }) as unknown as Built) }; };

// Every show as a desktop has it and as a phone has it; the fixed day's of each; and the fixed day's trees built. Placing every show's trees on two tiers takes
// several seconds on a busy machine, more than a hook's ten, so it has a limit of its own, as the standing stones' has.
let DESKTOP: World[], PHONE: World[], WORLDS: World[], fixed: World, fixedPhone: World, made: ReturnType<typeof built>, phones: ReturnType<typeof built>;
// A show by its date, as a desktop has it or as a phone has it. Tests that look at a few shows name them by date: an index into the
// shows moves whenever a show is added, and a number pinned on the show that used to stand there then fails for no reason.
const on = (date: string, phone = false) => { const w = (phone ? PHONE : DESKTOP).find((world) => world.date === date); if (!w) throw new Error(`no show of ${date}`); return w; };
beforeAll(() => {
  DESKTOP = DATES.map((date) => world(date));
  PHONE = DATES.map((date) => world(date, true));
  WORLDS = [...DESKTOP, ...PHONE];
  fixed = DESKTOP.find((w) => w.date === FIXED)!;
  fixedPhone = PHONE.find((w) => w.date === FIXED)!;
  // A build that threw here would fail this hook and skip every test unnamed; so a throw is kept, and each test that uses the fixed
  // day's built trees fails by its own name, with it.
  try {
    made = built(fixed.trees);
    phones = built(fixedPhone.trees, true);
  } catch (error) {
    made = phones = new Proxy({}, { get: () => { throw error; } }) as ReturnType<typeof built>;
  }
}, 120000);

const eachTree = (see: (tree: Spot, w: World) => void) => { for (const w of WORLDS) for (const tree of w.trees) see(tree, w); };
const least = (values: number[]) => values.reduce((a, b) => Math.min(a, b), Infinity);
const fromSegment = (x: number, z: number, a: number[], b: number[]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};
// How far the nearest of `points` ({ x, z }) lies from each tree, at the least over every tree: the points sorted into squares of
// 16 m, so each tree is tried against the few near it.
function leastFrom(points: { x: number; z: number }[], trees: Spot[]) {
  const cells = new Map<string, { x: number; z: number }[]>(), cell = (v: number) => Math.floor(v / 16);
  for (const p of points) { const k = `${cell(p.x)},${cell(p.z)}`; if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(p); }
  let nearest = Infinity;
  for (const t of trees) for (let i = cell(t.x) - 1; i <= cell(t.x) + 1; i++) for (let j = cell(t.z) - 1; j <= cell(t.z) + 1; j++) {
    for (const p of cells.get(`${i},${j}`) ?? []) nearest = Math.min(nearest, Math.hypot(t.x - p.x, t.z - p.z));
  }
  return nearest;
}
// The form a mesh's instance `k` is drawn in, as the GPU reads it: its share of each of the shape's morph targets.
const formAt = (mesh: Mesh, k: number) => { const into = { morphTargetInfluences: new Array<number>(mesh.geometry.morphAttributes.position.length).fill(0) }; mesh.getMorphAt(k, into); return into.morphTargetInfluences; };
// A shape's corners in a form, in its own frame, three numbers a corner: its own place and each morph target's share of its change.
function inForm(geometry: Mesh["geometry"], form: number[]) {
  const position = geometry.getAttribute("position"), moves = geometry.morphAttributes.position, out = new Float64Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    form.forEach((w, k) => { x += w * moves[k].getX(i); y += w * moves[k].getY(i); z += w * moves[k].getZ(i); });
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
  return out;
}
// Every corner of every tree a mesh draws, where its instance puts it in its own form: [x, y, z, the tree].
function corners(mesh: Mesh, trees: Spot[], see: (x: number, y: number, z: number, tree: Spot) => void) {
  const matrix = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let k = 0; k < mesh.count; k++) {
    mesh.getMatrixAt(k, matrix);
    const at = inForm(mesh.geometry, formAt(mesh, k));
    for (let i = 0; i < at.length; i += 3) {
      v.set(at[i], at[i + 1], at[i + 2]).applyMatrix4(matrix);
      see(v.x, v.y, v.z, trees[k]);
    }
  }
}
const byKind = (trees: Spot[]) => ["pine", "broad"].map((kind) => trees.filter((t) => t.kind === kind));
// Each tree's triangles where its instance stands them in its own form, nine numbers a triangle; with `trunk`, only those that lie wholly under its
// crown's base, which are its trunk's, a pine's stubs among them.
function shapes(meshes: Mesh[], trees: Spot[], trunk = false) {
  const out = new Map<Spot, number[]>(), matrix = new THREE.Matrix4(), v = new THREE.Vector3();
  byKind(trees).filter((mine) => mine.length > 0).forEach((mine, k) => {
    mine.forEach((tree, i) => {
      meshes[k].getMatrixAt(i, matrix);
      const at = inForm(meshes[k].geometry, formAt(meshes[k], i)), tris: number[] = [];
      for (let t = 0; t < at.length / 3; t += 3) {
        const nine: number[] = [];
        for (let c = t; c < t + 3; c++) { v.set(at[3 * c], at[3 * c + 1], at[3 * c + 2]).applyMatrix4(matrix); nine.push(v.x, v.y, v.z); }
        if (!trunk || Math.max(nine[1], nine[4], nine[7]) < tree.base) tris.push(...nine);
      }
      out.set(tree, tris);
    });
  });
  return out;
}
// How far a point stands from the nearest of the triangles: from each one's nearest point, which is a corner's, an edge's or its face's.
function farFrom(tris: number[], x: number, y: number, z: number) {
  const p = new THREE.Vector3(x, y, z), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), at = new THREE.Vector3(), triangle = new THREE.Triangle(a, b, c);
  let nearest = Infinity;
  for (let o = 0; o < tris.length; o += 9) {
    a.set(tris[o], tris[o + 1], tris[o + 2]); b.set(tris[o + 3], tris[o + 4], tris[o + 5]); c.set(tris[o + 6], tris[o + 7], tris[o + 8]);
    nearest = Math.min(nearest, triangle.closestPointToPoint(p, at).distanceTo(p));
  }
  return nearest;
}

describe("where the trees stand", () => {
  it("draws each tier its own number of trees on every show, the same ones on every visit, a TV's the first of a desktop's, and a phone's by its own cameras", () => {
    // A show whose landmarks left less room than the tier's count would draw fewer: none does.
    for (const w of DESKTOP) expect(w.trees, w.date).toHaveLength(TARGET.desktop);
    for (const w of PHONE) expect(w.trees, w.date).toHaveLength(TARGET.phone);
    // A desktop draws as many as a TV: the island has no room for more that stand out of its cameras' way (the cameras' ways, below).
    expect(TARGET).toEqual({ desktop: 75, tv: 75, phone: 45 });
    for (const w of [fixed, on("1971-03-14"), on("1986-02-12", true)]) {
      expect(placed(w.ask).spots).toEqual(w.trees);
      // With the same cameras' ways, fewer are the first of more: a TV's 75 of a desktop's 100.
      expect(placed({ ...w.ask, count: w.phone ? 20 : TARGET.tv }).spots).toEqual(w.trees.slice(0, w.phone ? 20 : TARGET.tv));
    }
    // A phone's cameras stand elsewhere, so its trees are placed by other ways and are not the first of a desktop's.
    expect(fixedPhone.trees.map((t) => [t.x, t.z])).not.toEqual(fixed.trees.slice(0, TARGET.phone).map((t) => [t.x, t.z]));
    expect(fixedPhone.ways.views.length).toBeLessThan(fixed.ways.views.length);
  });

  it("grows pine woods and broad-crowned groves: a tree's kind is by the grove it stands in, and a tree outside every grove is a pine", () => {
    // The share of pines at a place is its grove's, the one it is deepest in; outside every grove, all.
    for (const [x, z, , share] of GROVES) expect(grove(x, z)).toBe(share);
    expect(grove(0, -60)).toBe(1);
    expect(grove(-46 + 22.9, 84)).toBe(0.85);
    expect(grove(-46 + 23.1, 84)).toBe(1);
    // Where two groves meet, the one a place is deeper in, by each grove's own width: 25.3 m into the pine wood round (-82, 38),
    // 26 m across its half, and 13 m into the broad grove round (-44, 42), 14 m across its half, is the grove's.
    expect(grove(-57, 42)).toBe(0.2);
    expect(grove(-61, 42)).toBe(0.8);
    for (const w of WORLDS) {
      const outside = w.trees.filter((t) => GROVES.every(([x, z, r]) => Math.hypot(t.x - x, t.z - z) >= r));
      expect(outside.every((t) => t.kind === "pine"), w.date).toBe(true);
      for (const kind of ["pine", "broad"]) expect(w.trees.some((t) => t.kind === kind), w.date).toBe(true);
    }
    // Over the shows, a pine wood's trees are mostly pines and a broad grove's mostly broad-crowned.
    const count = (share: (s: number) => boolean, kind: string) => DESKTOP.reduce((sum, w) => sum + w.trees.filter((t) => GROVES.some(([x, z, r]) => Math.hypot(t.x - x, t.z - z) < r) && share(grove(t.x, t.z)) && t.kind === kind).length, 0);
    expect(count((s) => s >= 0.8, "pine")).toBeGreaterThan(4 * count((s) => s >= 0.8, "broad"));
    expect(count((s) => s <= 0.3, "broad")).toBeGreaterThan(2.5 * count((s) => s <= 0.3, "pine"));
  });

  it("keeps PATH_ROOM from the setlist's path, so the widest crown stands 4 m back from it", () => {
    // The path is given to the trees a point every 2 m; between two of them it comes 6 cm nearer.
    const fine = Array.from({ length: Math.ceil(path.curveLength * 2) }, (_, k) => path.at(k / 2 / path.curveLength));
    for (const w of WORLDS) expect(leastFrom(fine, w.trees), w.date).toBeGreaterThan(PATH_ROOM - 0.06);
    expect(PATH_ROOM - CROWN_R_MAX).toBeGreaterThanOrEqual(4);
  });

  it("keeps LINE_ROOM from the bears' line: a crown, a settled ride's crane swaying to either side of the line, and a metre", () => {
    const fine = Array.from({ length: Math.ceil(line.length * 2) }, (_, k) => line.at(k / 2));
    for (const w of WORLDS) expect(leastFrom(fine, w.trees), w.date).toBeGreaterThan(LINE_ROOM - 0.02);
    expect(LINE_ROOM).toBeGreaterThanOrEqual(CROWN_R_MAX + CRANE.sway + 1);
  });

  it("keeps LANDMARK_ROOM from every landmark's outline, so no crown hangs over one", () => {
    let nearest = Infinity;
    eachTree((t, w) => {
      for (const m of w.marks) {
        const dx = t.x - m.x, dz = t.z - m.z, c = Math.cos(m.rot), s = Math.sin(m.rot);
        nearest = Math.min(nearest, outside(m.poly, dx * c - dz * s, dx * s + dz * c));
      }
    });
    expect(nearest).toBeGreaterThanOrEqual(LANDMARK_ROOM);
    // And no further than it need: on some show a tree stands within 4 m of that.
    expect(nearest).toBeLessThan(LANDMARK_ROOM + 4);
    expect(LANDMARK_ROOM).toBeGreaterThan(CROWN_R_MAX);
  });

  it("keeps off the crowd's ground and CROWD_ROOM round it, STAGE_ROOM from the stage, and out of the caves", () => {
    eachTree((t, w) => {
      expect(onCrowdGround(t.x, t.z, CROWD_ROOM), w.date).toBe(false);
      expect(Math.hypot(t.x - STAGE[0], t.z - STAGE[1]), w.date).toBeGreaterThanOrEqual(STAGE_ROOM);
      expect(least(CAVES.map(([cx, cz]) => Math.hypot(t.x - cx, t.z - cz))), w.date).toBeGreaterThanOrEqual(CAVE_ROOM);
    });
  });

  it("keeps off the tracks and inside the ring road", () => {
    eachTree((t, w) => {
      expect(offTracks(t.x, t.z, TRACK_ROOM + FEATHER), w.date).toBe(true);
      expect(Math.hypot(t.x, t.z), w.date).toBeLessThanOrEqual(RING - RING_ROOM);
    });
  });

  it("stands where the land is no steeper than NY_MIN, and never taller than its tallest for the slope's sake", () => {
    let steepest = 1;
    eachTree((t, w) => {
      const gx = height(t.x + 0.5, t.z) - height(t.x - 0.5, t.z), gz = height(t.x, t.z + 0.5) - height(t.x, t.z - 0.5), ny = 1 / Math.sqrt(1 + gx * gx + gz * gz);
      expect(ny, w.date).toBeGreaterThanOrEqual(NY_MIN);
      steepest = Math.min(steepest, ny);
      expect(t.tall, w.date).toBeGreaterThanOrEqual(TALL[0]);
      expect(t.tall, w.date).toBeLessThanOrEqual(TALL[1]);
      expect(t.y, w.date).toBe(height(t.x, t.z));
    });
    // Trees do stand on the hill's flanks, which are steeper than a tuft's turf (0.9).
    expect(steepest).toBeLessThan(0.9);
  });

  it("keeps MIN_APART from each other, so a walk passes between any two trunks", () => {
    let nearest = Infinity;
    for (const w of WORLDS) {
      for (let i = 0; i < w.trees.length; i++) for (let j = 0; j < i; j++) nearest = Math.min(nearest, Math.hypot(w.trees[i].x - w.trees[j].x, w.trees[i].z - w.trees[j].z));
    }
    expect(nearest).toBeGreaterThanOrEqual(MIN_APART);
    // A grove is thick: some two stand within a tenth of a metre of that.
    expect(nearest).toBeLessThan(MIN_APART + 0.1);
    // Two trunks' reaches never meet: the walker's own point has PASS m between them, half a metre, and a bear walking through,
    // 1.5 m to either flank (collide.js), has over a metre of air between each flank and the widest trunk.
    expect(MIN_APART).toBe(2 * TREE_REACH + PASS);
    expect(PASS).toBe(0.5);
    expect(MIN_APART / 2 - 1.5 - TRUNK_R_MAX).toBeGreaterThan(1);
  });

  it("tries a square's other places when a neighbour's tree stands too near its first: every tree at one of its square's TRIES places, a square growing one at the most, some at a later place", () => {
    for (const w of [fixed, fixedPhone, on("1973-11-28"), on("1970-08-30", true)]) {
      const squares = new Set<string>(), tries = [0, 0, 0];
      for (const t of w.trees) {
        const a = Math.floor(t.x / CELL), b = Math.floor(t.z / CELL);
        const nth = Array.from({ length: TRIES }, (_, k) => k).filter((k) => t.x === (a + 0.1 + 0.8 * chance(a, b, 20 * k + 1)) * CELL && t.z === (b + 0.1 + 0.8 * chance(a, b, 20 * k + 2)) * CELL);
        expect(nth, `${w.date}: the tree at ${t.x}, ${t.z}`).toHaveLength(1);
        tries[nth[0]] += 1;
        squares.add(`${a},${b}`);
      }
      expect(squares.size, w.date).toBe(w.trees.length);
      // Most stand at their square's first place, tried before any second.
      expect(tries[0], w.date).toBeGreaterThan(w.trees.length * 0.6);
      if (!w.phone) expect(tries[1] + tries[2], w.date).toBeGreaterThan(0);
    }
    expect(TRIES).toBe(3);
    // A square is narrower than two trees stand apart, so one place in each would leave room unused.
    expect(CELL).toBeLessThan(MIN_APART);
  });

  it("hands back whether a tree's foot stands near a place, as it placed them", () => {
    const tree = fixed.trees[0];
    expect(fixed.near(tree.x + 1, tree.z, 2)).toBe(true);
    expect(fixed.near(tree.x + 2.1, tree.z, 2)).toBe(false);
    // Every tree, and nowhere else: a place more than a reach from all of them.
    for (const t of fixed.trees) expect(fixed.near(t.x, t.z + 0.5, 1)).toBe(true);
    expect(fixed.near(STAGE[0], STAGE[1], STAGE_ROOM - 1)).toBe(false);
  });

  it("has each rule, by itself, turn away a place just inside its room and leave one just outside it", () => {
    // Some rules forbid ground that another already does on this island (a track under the path, the bears' line under the cameras'
    // sights of the bears), so each is tried here alone, with a world of one thing: a point of the path, of the line, an eye, a tree,
    // a landmark 2 m square turned an eighth of a turn.
    const at = (px: number, pz: number) => ({ within: (x: number, z: number, r: number) => Math.hypot(x - px, z - pz) < r, each: () => false });
    const none = { within: () => false, each: () => false };
    const free = { path: none, line: none, trees: none, eyes: none, views: { crosses: () => false }, landmarks: [] as unknown[] };
    expect(Object.keys(RULES)).toEqual(["pastRing", "nearStage", "inCave", "onTracks", "steep", "onCrowd", "nearPath", "nearLine", "crowded", "nearLandmark", "nearEye", "inView", "underDescent"]);
    const tries: [string, unknown, number[], number[]][] = [
      ["pastRing", free, [RING - RING_ROOM + 0.1, 0], [RING - RING_ROOM - 0.1, 0]],
      ["nearStage", free, [STAGE[0] + STAGE_ROOM - 0.1, STAGE[1]], [STAGE[0] - STAGE_ROOM - 0.1, STAGE[1]]],
      ["inCave", free, [CAVES[0][0], CAVES[0][1] + CAVE_ROOM - 0.1], [CAVES[1][0], CAVES[1][1] + CAVE_ROOM + 0.1]],
      // The ring road's inner edge is RING m out, and a track's edge feathers FEATHER m.
      ["onTracks", free, [RING - TRACK_ROOM - FEATHER + 0.1, 0], [RING - TRACK_ROOM - FEATHER - 0.1, 0]],
      ["onCrowd", free, [27.16, -23.6], [0, 60]],
      ["nearPath", { ...free, path: at(10, 20) }, [10 + PATH_ROOM - 0.1, 20], [10 + PATH_ROOM + 0.1, 20]],
      ["nearLine", { ...free, line: at(10, 20) }, [10, 20 - LINE_ROOM + 0.1], [10, 20 - LINE_ROOM - 0.1]],
      ["crowded", { ...free, trees: at(10, 20) }, [10 + MIN_APART - 0.1, 20], [10 + MIN_APART + 0.1, 20]],
      ["nearEye", { ...free, eyes: at(10, 20) }, [10, 20 + EYE_ROOM - 0.1], [10, 20 + EYE_ROOM + 0.1]],
      ["inView", { ...free, views: { crosses: (x: number) => x > 0 } }, [1, 0], [-1, 0]],
    ];
    for (const [name, ctx, inside, outside_] of tries) {
      expect(rules[name](inside[0], inside[1], ctx), name).toBe(true);
      expect(rules[name](outside_[0], outside_[1], ctx), name).toBe(false);
    }
    // A cave's bowl is steeper than any tree's ground; the island's middle is not.
    const bowl = [CAVES[0][0] + 11, CAVES[0][1]], gx = height(bowl[0] + 0.5, bowl[1]) - height(bowl[0] - 0.5, bowl[1]);
    expect(1 / Math.sqrt(1 + gx * gx)).toBeLessThan(NY_MIN);
    expect(rules.steep(bowl[0], bowl[1], free)).toBe(true);
    expect(rules.steep(0, 0, free)).toBe(false);
    // The landmark's outline reaches 1 m to each side in its own frame; along its own x, turned, that is LANDMARK_ROOM past 1 m.
    const turn = Math.PI / 4, landmark = { x: 30, z: 40, c: Math.cos(turn), s: Math.sin(turn), poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]], reach: Math.SQRT2 };
    const along = (d: number) => [30 + d * Math.cos(turn), 40 - d * Math.sin(turn)];
    expect(rules.nearLandmark(...(along(1 + LANDMARK_ROOM - 0.1) as [number, number]), { ...free, landmarks: [landmark] })).toBe(true);
    expect(rules.nearLandmark(...(along(1 + LANDMARK_ROOM + 0.1) as [number, number]), { ...free, landmarks: [landmark] })).toBe(false);
    // Toward its corner the outline reaches further than toward its side: the same distance out along the world's x is inside.
    expect(rules.nearLandmark(30 + 1 + LANDMARK_ROOM + 0.1, 40, { ...free, landmarks: [landmark] })).toBe(true);
    // The descent to an eye 100 m east of the middle and 12 m up is under 22 m up, a tall tree's top there, for its last 8 m or so:
    // a place within a crown's reach of that stretch is turned away, one further off or further up the line is not.
    const asked: number[] = [];
    const eye = { ...none, each: (_x: number, _z: number, r: number, see: (ex: number, ez: number, ey: number) => boolean) => { asked.push(r); return see(100, 0, 12); } };
    const descent = { ...free, eyes: eye };
    expect(rules.underDescent(96, CROWN_R_MAX - 0.2, descent)).toBe(true);
    expect(rules.underDescent(96, CROWN_R_MAX + 0.2, descent)).toBe(false);
    expect(rules.underDescent(60, 0, descent)).toBe(false);
    // It asks for the eyes near enough that their descent could be that low within a crown's reach of the place. The last `share`
    // of a descent is under a tall tree's top there, at the most; and an eye that far off, straight out from the middle past the
    // place, is the furthest whose descent could: its low stretch, `share` of its own way out, ends a crown's reach short of the place.
    const share = (height(96, CROWN_R_MAX - 0.2) + TALL[1] + 1) / DESCENT_FROM, out = Math.hypot(96, CROWN_R_MAX - 0.2);
    expect(asked[0]).toBeCloseTo((share * out + CROWN_R_MAX) / (1 - share), 9);
    expect(share * (out + asked[0]) + CROWN_R_MAX).toBeCloseTo(asked[0], 9);
    // Along the descent's own line, the first place turned away is a crown's reach short of where the line, coming down from
    // DESCENT_FROM m, is as low as a tall tree's top there: `low` m out, found by halving.
    const starts = (x: number) => 100 * ((DESCENT_FROM - (height(x, 0) + TALL[1] + 1)) / (DESCENT_FROM - 12)) - CROWN_R_MAX;
    let short = 50, low = 100;
    for (let k = 0; k < 50; k++) { const mid = (short + low) / 2; if (mid < starts(mid)) short = mid; else low = mid; }
    expect(low).toBeGreaterThan(60);
    expect(low).toBeLessThan(90);
    expect(rules.underDescent(low - 0.3, 0, descent)).toBe(false);
    expect(rules.underDescent(low + 0.3, 0, descent)).toBe(true);
  });
});

describe("the cameras' ways", () => {
  // The camera that walks with the bears on a tier, for each number of bears it can show, the lead bear `d` m along the line.
  const eyesAt = (d: number, phone: boolean) => bearsOf(phone).map((count) => ({ count, ...postPose({ third: true, phone, bearD: d, count, gap: BEAR_GAP, line, height, keepInView: () => 0 }, 0, 0).pos }));
  const has = (views: View[], from: number[], to: number[], half: number) => views.some((v) => v.from[0] === from[0] && v.from[1] === from[1] && v.to[0] === to[0] && v.to[1] === to[1] && v.half === half);
  const xz = (p: { x: number; z: number }) => [p.x, p.z];
  // The views no tree stands in that are as wide at one end as the other: all there were before a view could widen or cost.
  const plain = (views: View[]) => views.filter((v) => !v.cost && !v.spread);
  // Whether a place lies in a view, reckoned here apart from trees.js: within its half-width of its line, which grows by `spread`
  // for each metre from `from`.
  const lies = ({ from, to, half, spread = 0 }: View, x: number, z: number) => {
    const dx = to[0] - from[0], dz = to[1] - from[1], long = Math.hypot(dx, dz), along = Math.max(0, Math.min(long, ((x - from[0]) * dx + (z - from[1]) * dz) / (long || 1)));
    return Math.hypot(x - from[0] - (dx / (long || 1)) * along, z - from[1] - (dz / (long || 1)) * along) < half + spread * along;
  };
  // A landmark as an eye at `from` sees it: how far off, the way to it, and how wide to either side of that sight by its outline.
  const seen = (mark: Mark, from: number[]) => {
    const dx = mark.x - from[0], dz = mark.z - from[1], far = Math.hypot(dx, dz), c = Math.cos(mark.rot), sn = Math.sin(mark.rot);
    const wide = Math.max(...mark.poly.map(([px, pz]) => Math.abs(((px * c + pz * sn) * dz - (pz * c - px * sn) * dx) / far)));
    return { far, wide, ux: dx / far, uz: dz / far };
  };
  // The two cameras a visitor rides, the lead bear `d` m along the line with `count` bears: where each stands and where it looks.
  const rides = (d: number, count: number, phone: boolean) => {
    const pos = postPose({ third: true, phone, bearD: d, count, gap: BEAR_GAP, line, height, keepInView: () => 0 }, 0, 0).pos, crane = d - count * BEAR_GAP - CRANE.back;
    return [{ from: [pos.x, pos.z], to: xz(line.at(d)) }, { from: xz(line.at(crane)), to: xz(line.at(crane + CRANE.ahead)) }];
  };
  // Whether a landmark is in the frame of a camera at `from` looking to `to`, within RIDE_FAR m of it.
  const framed = (mark: Mark, from: number[], to: number[], phone: boolean) => {
    const { far, wide, ux, uz } = seen(mark, from), lx = to[0] - from[0], lz = to[1] - from[1];
    return far <= RIDE_FAR && Math.acos(Math.max(-1, Math.min(1, (ux * lx + uz * lz) / Math.hypot(lx, lz)))) - Math.atan2(wide, far) <= FRAME(phone);
  };

  it("lists a tier's own cameras and no other's: the camera that walks with the bears every 2 m of their line, for each number of bears the tier can show, with its sight of every bear", () => {
    const steps = Math.ceil(line.length / 2);
    for (const [w, phone] of [[fixed, false], [fixedPhone, true]] as const) {
      const { eyes, views } = w.ways, counts = bearsOf(phone);
      expect(eyes).toHaveLength(steps * counts.length);
      const here = eyesAt(40, phone);
      for (const eye of here) {
        expect(eyes.some(([x, z, y]) => x === eye.x && z === eye.z && y === eye.y)).toBe(true);
        // From it to the lead bear, each bear behind it, and the visitor's, BEAR_GAP m apart.
        for (let k = 0; k <= eye.count; k++) expect(has(views, [eye.x, eye.z], xz(line.at(40 - k * BEAR_GAP)), SIGHT_HALF)).toBe(true);
        expect(plain(views).filter((v) => v.from[0] === eye.x && v.from[1] === eye.z)).toHaveLength(eye.count + 1);
      }
      // No eye of the other tier's camera, which stands elsewhere.
      const other = eyesAt(40, !phone)[0];
      expect(eyes.some(([x, z]) => x === other.x && z === other.z)).toBe(false);
      // A settled ride's crane, 40 m along: to the visitor's bear CRANE.back m on, to each bear a gap further, and to where it looks.
      const crane = xz(line.at(40)), sees = new Set([...Array.from({ length: counts[0] + 1 }, (_, k) => CRANE.back + k * BEAR_GAP), CRANE.ahead]);
      for (const on of sees) expect(has(views, crane, xz(line.at(40 + on)), SIGHT_HALF)).toBe(true);
      expect(plain(views).filter((v) => v.from[0] === crane[0] && v.from[1] === crane[1] && v.half === SIGHT_HALF)).toHaveLength(sees.size);
      // The stage from where the walk's camera hangs behind each test pose: its boom's length and 2 m more.
      for (const pose of Object.values(TEST_POSES) as { x: number; z: number; heading: number }[]) {
        const back = boomLength(phone) + 2;
        expect(views.some((v) => v.to === STAGE && v.half === VIEW_HALF && Math.hypot(v.from[0] - pose.x - back * Math.sin(pose.heading), v.from[1] - pose.z - back * Math.cos(pose.heading)) < 1e-9)).toBe(true);
      }
      expect(views.filter((v) => v.to === STAGE)).toHaveLength(5);
      expect(has(views, [0, 0], TRAILHEAD, VIEW_HALF)).toBe(true);
      // Each landmark from a boom's length behind its stand, to 10 m past it.
      for (const stand of w.stands) {
        const dx = stand.to[0] - stand.x, dz = stand.to[1] - stand.z, far = Math.hypot(dx, dz), boom = boomLength(phone);
        expect(views.some((v) => v.half === VIEW_HALF && Math.hypot(v.from[0] - (stand.x - (dx / far) * boom), v.from[1] - (stand.z - (dz / far) * boom)) < 1e-9 && Math.hypot(v.to[0] - (stand.to[0] + (dx / far) * 10), v.to[1] - (stand.to[1] + (dz / far) * 10)) < 1e-9)).toBe(true);
      }
      expect(views.filter((v) => v.half === VIEW_HALF)).toHaveLength(Object.keys(TEST_POSES).length + 1 + w.stands.length);
      // And two sights of each landmark as its song begins, from the camera and from the crane: no other view is a plain one, of one
      // width from end to end and with no cost.
      const sights = counts.reduce((sum, count) => sum + count + 1, 0);
      expect(plain(views)).toHaveLength(steps * (sights + sees.size) + Object.keys(TEST_POSES).length + 1 + w.stands.length + 2 * w.marks.length);
    }
    expect([boomLength(false), boomLength(true)]).toEqual([11, 20]);
    expect(CRANE).toEqual({ back: 14, sway: 2, ahead: 28 });
    expect(BEAR_GAP).toBe(7);
  });

  it("keeps every tree EYE_ROOM from the camera that walks with the bears, wherever the bears are, so the eye is never in a crown", () => {
    // Every metre of the line, between the places the trees were given, a tier's eyes against its own trees.
    let nearest = Infinity;
    for (const phone of [false, true]) {
      const eyes = Array.from({ length: Math.ceil(line.length) }, (_, d) => eyesAt(d, phone)).flat();
      for (const w of phone ? PHONE : DESKTOP) nearest = Math.min(nearest, leastFrom(eyes, w.trees));
    }
    // Between two places 2 m apart along the line the camera swings up to 3.5 m, so it passes a tree a quarter metre nearer than
    // either: over a metre outside the widest crown all the same.
    expect(nearest).toBeGreaterThan(EYE_ROOM - 0.25);
    expect(nearest - CROWN_R_MAX).toBeGreaterThan(1);
    // The rule is no wider than it says: on some show a tree stands within a metre and a half of it.
    expect(nearest).toBeLessThan(EYE_ROOM + 1.5);
    expect(EYE_ROOM).toBeGreaterThan(CROWN_R_MAX + 1);
  });

  it("keeps every view that has no cost clear to its half-width: the camera's sight of each bear, the stage from the test poses, the trailhead from the summit", () => {
    // How far the nearest tree stands outside a sight's half-width, and a view's, over every show, a tier's views against its own trees.
    let sight = Infinity, wide = Infinity, cones = 0;
    for (const w of WORLDS) {
      for (const view of w.ways.views) {
        if (view.cost) continue;
        const { from, to, half, spread = 0 } = view, most = half + spread * Math.hypot(to[0] - from[0], to[1] - from[1]);
        const x0 = Math.min(from[0], to[0]) - most - 3, x1 = Math.max(from[0], to[0]) + most + 3, z0 = Math.min(from[1], to[1]) - most - 3, z1 = Math.max(from[1], to[1]) + most + 3;
        if (spread) cones += 1;
        for (const t of w.trees) {
          // Only a tree within 3 m of the view's box can stand within 3 m of its edge.
          if (t.x < x0 || t.x > x1 || t.z < z0 || t.z > z1) continue;
          if (spread) expect(lies(view, t.x, t.z), w.date).toBe(false);
          else if (half === SIGHT_HALF) sight = Math.min(sight, fromSegment(t.x, t.z, from, to) - half);
          else wide = Math.min(wide, fromSegment(t.x, t.z, from, to) - half);
        }
      }
    }
    expect(sight).toBeGreaterThanOrEqual(0);
    expect(wide).toBeGreaterThanOrEqual(0);
    // Each is a rule that bites: on some show a tree stands within three metres of a sight's edge, and of a view's.
    expect(sight).toBeLessThan(3);
    expect(wide).toBeLessThan(3);
    expect(cones).toBeGreaterThan(WORLDS.length * 10);
    expect(SIGHT_HALF).toBe(CROWN_R_MAX);
    expect(VIEW_HALF).toBe(CROWN_R_MAX + 4);
  });

  it("keeps the opening clear on every show and tier: no tree behind the first song's landmark on to the ring, none across the sight of any landmark in the frame, and none in either ridden camera's frame within twice EDGE_NEAR", () => {
    // From the two cameras a visitor rides, with each number of bears the tier can show: the first song's landmark is the first a
    // visitor sees, the beam on it, and it stands against the sky and the sea.
    let behind = Infinity, across = Infinity, edge = Infinity, sights = 0;
    for (const w of WORLDS) {
      const first = w.marks[0];
      for (const count of bearsOf(w.phone)) rides(first.d, count, w.phone).forEach(({ from, to }, which) => {
        const subject = seen(first, from), look = Math.hypot(to[0] - from[0], to[1] - from[1]), lx = (to[0] - from[0]) / look, lz = (to[1] - from[1]) / look;
        const others = w.marks.filter((mark) => framed(mark, from, to, w.phone)).map((mark) => seen(mark, from));
        sights += others.length;
        for (const t of w.trees) {
          const dx = t.x - from[0], dz = t.z - from[1];
          // Behind it: how far a tree's crown stands outside the landmark's width and BESIDE m, as they widen with the distance.
          const along = dx * subject.ux + dz * subject.uz, off = Math.abs(dx * subject.uz - dz * subject.ux);
          if (along > subject.far) behind = Math.min(behind, off - t.reach - ((subject.wide + BESIDE) * along) / subject.far);
          // Across a sight: between the camera and a landmark in its frame, outside the landmark's width as it narrows to the eye.
          for (const mark of others) {
            const on = dx * mark.ux + dz * mark.uz;
            if (on > 0 && on < mark.far) across = Math.min(across, Math.abs(dx * mark.uz - dz * mark.ux) - t.reach - (mark.wide * on) / mark.far);
          }
          // The camera's own frame, near it: outside the frame's spread for twice EDGE_NEAR m on from the camera.
          const ahead = dx * lx + dz * lz;
          if (which >= 0 && ahead > 0 && ahead < 2 * EDGE_NEAR) edge = Math.min(edge, Math.abs(dx * lz - dz * lx) - t.reach - Math.tan(FRAME(w.phone)) * ahead);
        }
      });
    }
    expect([behind, across, edge].map((v) => Math.min(v, 0))).toEqual([0, 0, 0]);
    expect(behind).toBeGreaterThanOrEqual(0);
    // Each bites: on some show a tree's crown stands within 3 m of where it may not.
    expect(behind).toBeLessThan(3);
    expect(across).toBeLessThan(3);
    expect(edge).toBeLessThan(10);
    // Some eight landmarks are in the opening's frame, on a show and a tier and a number of bears.
    expect(sights).toBeGreaterThan(WORLDS.length * 8);
    // A tree nearer than EDGE_NEAR cannot fit a frame 60 degrees high from 9 or 10 m up: it is cut off from foot to crown.
    expect([BESIDE, RIDE_FAR, EDGE_NEAR, FRAME(false), FRAME(true)]).toEqual([2, 100, 16, 0.8, 0.42]);
    expect(EDGE_NEAR).toBeGreaterThan(9 / Math.tan(Math.PI / 6));
  });

  it("gives the views it cannot keep clear a cost: a ridden camera's own frame near it costs most, then across a landmark's sight from one as a song begins, then close behind a view's subject, and far behind or between two songs least", () => {
    for (const w of [fixed, fixedPhone]) {
      const { views } = w.ways, own = bearsOf(w.phone)[0], costly = views.filter((v) => v.cost);
      const one = (from: number[], to: number[], cost: number) => costly.filter((v) => v.cost === cost && Math.hypot(v.from[0] - from[0], v.from[1] - from[1]) < 1e-9 && Math.hypot(v.to[0] - to[0], v.to[1] - to[1]) < 1e-9);
      expect(new Set(costly.map((v) => v.cost))).toEqual(new Set([1, 2, 3, 4]));
      expect(SPOILS).toBe(4);
      // A ridden camera's frame for EDGE_NEAR m on from it, as wide as the frame spreads and a crown's reach.
      const near = (from: number[], to: number[]) => {
        const far = Math.hypot(to[0] - from[0], to[1] - from[1]);
        return one(from, [from[0] + ((to[0] - from[0]) / far) * EDGE_NEAR, from[1] + ((to[1] - from[1]) / far) * EDGE_NEAR], 4).map((v) => [v.half, v.spread]);
      };
      w.marks.forEach((mark, k) => {
        // Behind it from its stand: CLOSE m at 2, then on to the ring at 1, as wide as the landmark and BESIDE m at its distance, a
        // crown's reach more, and widening as the sight does.
        if (mark.stand) {
          const from = [mark.stand.x, mark.stand.z], { far, wide, ux, uz } = seen(mark, from);
          const near = one([mark.x, mark.z], [mark.x + ux * CLOSE, mark.z + uz * CLOSE], 2);
          expect(near).toHaveLength(1);
          expect(near[0].half).toBeCloseTo(wide + BESIDE + CROWN_R_MAX, 9);
          expect(near[0].spread).toBeCloseTo((wide + BESIDE) / far, 9);
          // It runs on past the ring, the island's width from the landmark, so all of it inside the ring is taken in.
          const on = one([mark.x + ux * CLOSE, mark.z + uz * CLOSE], [mark.x + ux * 2 * RING, mark.z + uz * 2 * RING], 1);
          expect(on).toHaveLength(1);
          expect(on[0].half).toBeCloseTo(wide + BESIDE + CROWN_R_MAX + ((wide + BESIDE) / far) * CLOSE, 9);
          expect(on[0].spread).toBeCloseTo((wide + BESIDE) / far, 9);
        }
        // As its song begins, from the ridden cameras with the tier's own number of bears: every landmark in the frame at 3, but the
        // opening's, which no tree stands across at all.
        for (const { from, to } of rides(mark.d, own, w.phone)) {
          if (k > 0) expect(near(from, to)).toEqual([[CROWN_R_MAX, Math.tan(FRAME(w.phone))]]);
          else expect(near(from, to)).toEqual([]);
        }
        for (const { from, to } of rides(mark.d, own, w.phone)) for (const other of w.marks) {
          if (!framed(other, from, to, w.phone)) continue;
          const sights = views.filter((v) => Math.hypot(v.from[0] - from[0], v.from[1] - from[1]) < 1e-9 && v.to[0] === other.x && v.to[1] === other.z && v.half === CROWN_R_MAX && v.spread !== undefined);
          expect(sights.some((v) => (k === 0 ? !v.cost : v.cost === 3) && Math.abs(v.spread! - seen(other, from).wide / seen(other, from).far) < 1e-9), `${w.date} song ${k}`).toBe(true);
        }
      });
      // Between two songs' starts, the bears every RIDE_STEP m: each landmark's sight at 1, and the camera's own near frame at 4.
      const between = 16 * RIDE_STEP;
      expect(w.marks.some((mark) => Math.abs(mark.d - between) < 1e-9)).toBe(false);
      for (const { from, to } of rides(between, own, w.phone)) {
        const inFrame = w.marks.filter((mark) => framed(mark, from, to, w.phone));
        expect(inFrame.length).toBeGreaterThan(0);
        for (const mark of inFrame) expect(one(from, [mark.x, mark.z], 1)).toHaveLength(1);
        expect(near(from, to)).toEqual([[CROWN_R_MAX, Math.tan(FRAME(w.phone))]]);
      }
    }
    expect([CLOSE, RIDE_STEP]).toEqual([60, 8]);
  });

  it("fills the places that spoil no view first, and one that spoils a view only when no cheaper place is left: each tree says the worst cost of the views it stands in, and no tier's trees could have spoiled less", () => {
    for (const w of [fixed, fixedPhone, on("1970-12-31"), on("1970-12-31", true), on("1986-02-12"), on("1988-09-12", true)]) {
      // What each tree spoils is the highest cost among the views its foot lies in.
      const costly = w.ways.views.filter((v) => v.cost);
      for (const t of w.trees) expect(t.spoils, `${w.date}: the tree at ${t.x}, ${t.z}`).toBe(Math.max(0, ...costly.filter((v) => lies(v, t.x, t.z)).map((v) => v.cost!)));
      // In the order they were placed, the cheapest first.
      for (let k = 1; k < w.trees.length; k++) expect(w.trees[k].spoils).toBeGreaterThanOrEqual(w.trees[k - 1].spoils);
      // With no limit to their number, the trees are every place the rules leave: the tier's are the first of them, and none left
      // out costs less than the dearest the tier took.
      const every = placed({ ...w.ask, count: 5000 }).spots, dearest = w.trees[w.trees.length - 1].spoils;
      expect(every.slice(0, w.trees.length)).toEqual(w.trees);
      for (const left of every.slice(w.trees.length)) expect(left.spoils).toBeGreaterThanOrEqual(dearest);
      expect(every.length).toBeGreaterThan(w.trees.length * 1.1);
    }
    // On the fixed day a phone's 45 stand close behind no subject and across no sight as a song begins; of a desktop's 75 none
    // stands in a ridden camera's near frame, and a handful across a landmark's sight as a song begins, the island having no
    // better place for them.
    expect(fixedPhone.trees.filter((t) => t.spoils >= 2)).toHaveLength(0);
    expect(fixed.trees.filter((t) => t.spoils === 4)).toHaveLength(0);
    const dear = fixed.trees.filter((t) => t.spoils === 3).length;
    expect(dear).toBeGreaterThan(0);
    expect(dear).toBeLessThan(6);
    // Over every show a phone's never do either; a desktop's stand in a near frame on few shows (one of the 38 there were when this
    // was written, two trees), and across a sight as a song begins seldom: fewer than one tree in twelve. With a hundred to a
    // desktop, one in six would stand in a near frame, which is why it draws 75. The bars grow with the number of shows, so that a
    // show added to the maps cannot fail them by being the second such show: no more than one show in twenty, nor more than one such
    // tree to every ten shows.
    expect(PHONE.every((w) => w.trees.every((t) => t.spoils < 3))).toBe(true);
    expect(DESKTOP.filter((w) => w.trees.some((t) => t.spoils === 4)).length).toBeLessThanOrEqual(Math.ceil(DESKTOP.length / 20));
    expect(DESKTOP.reduce((sum, w) => sum + w.trees.filter((t) => t.spoils === 4).length, 0)).toBeLessThanOrEqual(Math.ceil(DESKTOP.length / 10));
    expect(DESKTOP.reduce((sum, w) => sum + w.trees.filter((t) => t.spoils === 3).length, 0)).toBeLessThan((DESKTOP.length * TARGET.desktop) / 12);
    for (const w of DESKTOP) expect(placed({ ...w.ask, count: 100 }).spots.filter((t) => t.spoils === 4).length, w.date).toBeGreaterThan(10);
  });

  it("shows the landmarks as a review of the frames looks for them: with every tree and every landmark boxed in the frame, no tree's box lies over the first landmark's from the opening's camera, nor over any landmark's in front of it; and from each landmark's stand none lies over it in front, and one behind it only where the island had no clear place", () => {
    // A box's place in a camera's frame: the least and most its eight corners reach across and up it, or null if one is behind
    // the camera.
    const v = new THREE.Vector3();
    const boxed = (camera: unknown, [x0, y0, z0]: number[], [x1, y1, z1]: number[]) => {
      const at = [Infinity, -Infinity, Infinity, -Infinity];
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
        v.set(x, y, z).project(camera);
        if (v.z > 1) return null;
        at[0] = Math.min(at[0], v.x); at[1] = Math.max(at[1], v.x); at[2] = Math.min(at[2], v.y); at[3] = Math.max(at[3], v.y);
      }
      return at;
    };
    const inFrame = (a: number[] | null) => a !== null && a[0] < 1 && a[1] > -1 && a[2] < 1 && a[3] > -1;
    const over = (a: number[] | null, b: number[] | null) => a !== null && b !== null && a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
    const tree = (camera: unknown, t: Spot) => boxed(camera, [t.x - t.reach, t.y, t.z - t.reach], [t.x + t.reach, t.top, t.z + t.reach]);
    let stands = 0, behind = 0;
    for (const phone of [false, true]) for (const w of [phone ? fixedPhone : fixed, world(FIXED, phone, AS_TITLES as [number, string][])]) {
      const camera = new THREE.PerspectiveCamera(phone ? 75 : 60, phone ? 390 / 844 : 1440 / 900, 0.5, 900), at = `${phone ? "phone" : "desktop"}${w === fixed || w === fixedPhone ? "" : ", the other kinds"}`;
      const boxes = w.landmarks.map((g) => new THREE.Box3().setFromObject(g) as { min: Point; max: Point });
      const mark = (k: number) => boxed(camera, [boxes[k].min.x, boxes[k].min.y, boxes[k].min.z], [boxes[k].max.x, boxes[k].max.y, boxes[k].max.z]);
      // The opening's settled camera: the one that walks with the bears, the lead bear at the first song's landmark.
      const { pos, look } = postPose({ third: true, phone, bearD: w.marks[0].d, count: bearsOf(phone)[0], gap: BEAR_GAP, line, height, keepInView: () => 0 }, 0, 0);
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(look.x, look.y, look.z);
      camera.updateMatrixWorld(true);
      const first = mark(0);
      expect(inFrame(first), at).toBe(true);
      for (const t of w.trees) expect(over(tree(camera, t), first), `${at}: the tree at ${t.x.toFixed(0)}, ${t.z.toFixed(0)} over the first landmark at the opening`).toBe(false);
      w.marks.forEach((m, k) => {
        const far = Math.hypot(m.x - pos.x, m.z - pos.z), box = mark(k);
        if (!inFrame(box) || far > RIDE_FAR) return;
        // Nearer than the landmark, by more than its own reach: in front of it.
        for (const t of w.trees) if (Math.hypot(t.x - pos.x, t.z - pos.z) + t.reach < far) expect(over(tree(camera, t), box), `${at}: the tree at ${t.x.toFixed(0)}, ${t.z.toFixed(0)} before landmark ${k} at the opening`).toBe(false);
      });
      // Each landmark from its stand, as its near still is shot: from the visitor's own eye, looking at it.
      w.marks.forEach((m, k) => {
        if (!m.stand) return;
        const y = height(m.stand.x, m.stand.z) + FIRST_EYE, far = Math.hypot(m.x - m.stand.x, m.z - m.stand.z);
        camera.position.set(m.stand.x, y, m.stand.z);
        camera.lookAt(m.x, height(m.x, m.z) + 4, m.z);
        camera.updateMatrixWorld(true);
        const box = mark(k);
        stands += 1;
        const on = w.trees.filter((t) => over(tree(camera, t), box));
        for (const t of on) {
          // None in front of it or beside it; a tree behind it stands in a view that costs, taken for want of a clear place.
          expect(Math.hypot(t.x - m.stand.x, t.z - m.stand.z), `${at}: the tree at ${t.x.toFixed(0)}, ${t.z.toFixed(0)} by landmark ${k}`).toBeGreaterThan(far + 10);
          expect(t.spoils, `${at}: the tree at ${t.x.toFixed(0)}, ${t.z.toFixed(0)} behind landmark ${k}`).toBeGreaterThanOrEqual(1);
        }
        if (on.length > 0) behind += 1;
      });
    }
    // Every landmark of the fixed day and of the other kinds, on each tier.
    // Every landmark of the fixed day, with its own kinds and with the others, on each tier.
    expect(stands).toBe(4 * fixed.stands.length);
    // The island cannot clear behind them all: on fewer than half of those stills a tree's box lies over the landmark's, behind it.
    expect(behind).toBeGreaterThan(0);
    expect(behind).toBeLessThan(stands / 2);
  });

  it("stands no tree in the view of a landmark from the path: not within its crown's reach and 4 m of the line of sight, from a boom's length behind the visitor to 10 m past the landmark", () => {
    // Every show's own landmarks, on a desktop and a phone; and the fixed day's as the shoot builds them with the other kinds (?as=), on
    // each. The stand is where ?pose=near-K puts the visitor (path.js nearStand).
    const shoots = [world(FIXED, false, AS_TITLES as [number, string][]), world(FIXED, true, AS_TITLES as [number, string][])];
    let stood = 0;
    for (const w of [...WORLDS, ...shoots]) {
      // Each of a show's songs has a landmark and a stand.
      expect(w.stands, w.date).toHaveLength(w.marks.length);
      stood += w.stands.length;
      // How far the nearest crown's edge stands from a line of sight, over the show's stands.
      let room = Infinity;
      for (const stand of w.stands) {
        const dx = stand.to[0] - stand.x, dz = stand.to[1] - stand.z, d = Math.hypot(dx, dz), boom = boomLength(w.phone);
        const behind = [stand.x - (dx / d) * boom, stand.z - (dz / d) * boom], past = [stand.to[0] + (dx / d) * 10, stand.to[1] + (dz / d) * 10];
        for (const t of w.trees) room = Math.min(room, fromSegment(t.x, t.z, behind, past) - t.reach);
      }
      expect(room, `${w.date} ${w.phone ? "phone" : "desktop"}`).toBeGreaterThanOrEqual(4);
    }
    expect(stood).toBeGreaterThan(1400);
    // The 13 other kinds stand at the fixed day's own songs' points, and their outlines differ from the songs' own.
    expect(shoots[0].marks).toHaveLength(fixed.marks.length);
    expect(shoots[0].marks.filter((m, k) => m.poly.length !== fixed.marks[k].poly.length || m.x !== fixed.marks[k].x).length).toBeGreaterThan(5);
    for (const w of shoots) expect(w.trees).toHaveLength(w.phone ? TARGET.phone : TARGET.desktop);
  });

  it("stands no tree behind a landmark as its song begins and the beam stands on it: not within a crown's reach of the sight of it for 24 m past it, from the camera that walks with the bears or from a settled ride's crane", () => {
    // The opening is the first song's: the bears stand at its landmark, on every show, all that the tier draws. Under reduced motion
    // they stand at each song's.
    let room = Infinity, sights = 0;
    for (const w of WORLDS) {
      const count = bearsOf(w.phone)[0];
      for (const mark of w.marks) {
        const stand = { to: [mark.x, mark.z], d: mark.d };
        const eye = postPose({ third: true, phone: w.phone, bearD: stand.d, count, gap: BEAR_GAP, line, height, keepInView: () => 0 }, 0, 0).pos, crane = line.at(stand.d - count * BEAR_GAP - CRANE.back);
        for (const from of [[eye.x, eye.z], [crane.x, crane.z]]) {
          const dx = stand.to[0] - from[0], dz = stand.to[1] - from[1], far = Math.hypot(dx, dz), past = [stand.to[0] + (dx / far) * 24, stand.to[1] + (dz / far) * 24];
          sights += 1;
          for (const t of w.trees) room = Math.min(room, fromSegment(t.x, t.z, from, past) - CROWN_R_MAX);
        }
      }
    }
    expect(sights).toBeGreaterThan(2000);
    expect(room).toBeGreaterThanOrEqual(0);
    // The rule bites: on some show a tree stands within three metres of such a sight's edge.
    expect(room).toBeLessThan(3);
    // The first song's point is the trailhead, where the line begins.
    expect(fixed.stands[0].d).toBeCloseTo(0, 6);
  });

  it("brings the opening's descent down through no crown, from DESCENT_FROM m over the island's middle to the camera that walks with the bears", () => {
    // How far outside the nearest crown's reach the descent passes, while it is as high as that crown stands: the stretch of its
    // line between the crown's top and its base, seen from above, and how far the tree's foot stands from that.
    let room = Infinity, low = 0, tops = 0;
    for (const phone of [false, true]) {
      for (let d = 0; d < line.length; d += 4) {
        for (const eye of eyesAt(d, phone)) {
          for (const w of phone ? PHONE : DESKTOP) for (const t of w.trees) {
            // The line is (eye.x k, DESCENT_FROM + (eye.y - DESCENT_FROM) k, eye.z k), k from 0 to 1.
            const from = Math.max(0, (DESCENT_FROM - t.top) / (DESCENT_FROM - eye.y)), to = Math.min(1, (DESCENT_FROM - t.base) / (DESCENT_FROM - eye.y));
            if (from >= to) continue;
            low += 1;
            room = Math.min(room, fromSegment(t.x, t.z, [eye.x * from, eye.z * from], [eye.x * to, eye.z * to]) - t.reach);
          }
        }
      }
    }
    // The line does come down among the crowns' heights, and passes outside every one, and near some.
    expect(low).toBeGreaterThan(100_000);
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(3);
    eachTree((t) => { tops = Math.max(tops, t.top); });
    expect(tops).toBeLessThan(DESCENT_FROM);
    expect(DESCENT_FROM).toBe(140);
  });

  it("finds the eyes whose descent could be low over a place however far off they stand: with one eye far out and trees wherever they may grow, none stands under its descent, and some stand just clear of it", () => {
    // One eye 100 m east of the middle, 12 m up, and nothing else on the island; a tree in every square that the land allows.
    const eye = [100, 0, 12], { spots } = placed({ count: 2000, loop: [], line: [], landmarks: [], eyes: [eye], views: [], groves: () => 0 });
    expect(spots.length).toBeGreaterThan(300);
    // How far each tree's foot stands from the stretch of the descent that is as low as the tallest tree its place could grow.
    let nearest = Infinity, longest = 0;
    for (const t of spots) {
      const from = (DESCENT_FROM - (t.y + TALL[1] + 1)) / (DESCENT_FROM - eye[2]);
      nearest = Math.min(nearest, fromSegment(t.x, t.z, [eye[0] * from, 0], [eye[0], 0]));
      if (Math.abs(t.z) < 15 && t.x > 50) longest = Math.max(longest, eye[0] * (1 - from));
    }
    expect(nearest).toBeGreaterThanOrEqual(CROWN_R_MAX);
    // Trees stand right up to it; and the stretch is some 13 m long there, twice as far from the eye as EYE_ROOM keeps a tree, so it
    // is this rule that keeps the rest of it clear.
    expect(nearest).toBeLessThan(CROWN_R_MAX + 4);
    expect(longest).toBeGreaterThan(2 * EYE_ROOM);
  });

  it("keeps a settled ride's crane a metre clear of every crown as it sways to either side of the bears' line", () => {
    const hangs = [];
    for (let d = 0; d < line.length; d += 1) {
      const p = line.at(d), tangent = line.tangentAt(d);
      for (const sway of [-CRANE.sway, 0, CRANE.sway]) hangs.push({ x: p.x + tangent.z * sway, z: p.z - tangent.x * sway });
    }
    let nearest = Infinity;
    for (const w of WORLDS) nearest = Math.min(nearest, leastFrom(hangs, w.trees));
    expect(nearest - CROWN_R_MAX).toBeGreaterThan(0.9);
  });
});

// The ride's camera goes between its two rigs in a straight line (pose.js ridePose), and no rule of the trees' names that line: these
// hold it clear of them all the same, on every show there is and on any there could be.
describe("the ride's way between its rigs", () => {
  type Way = { from: Point; to: Point };
  // When the crane hangs at either end of its sway and on the line: a quarter and three quarters of its 30 s, and its start.
  const SWAYS = [7.5, 22.5, 0];
  // A tier's ways in one view, third person or first: from the camera that walks with the bears to the crane, the lead bear every
  // `step` m of the line, for each number of bears the tier can show and the crane at each of those three places.
  const waysOn = (phone: boolean, third: boolean, step = 0.5) => {
    const ways: Way[] = [];
    for (let d = 0; d < line.length; d += step) for (const count of bearsOf(phone)) {
      const deps = { third, phone, bearD: d, count, gap: BEAR_GAP, line, height, keepInView: () => 0 }, from = postPose(deps, 0, 0).pos;
      for (const elapsed of SWAYS) ways.push({ from, to: cranePose(deps, elapsed).pos });
    }
    return ways;
  };
  // The ways by squares of 24 m, each in the square its middle lies in: no way is 50 m long, so a place within 12 m of one finds
  // it in its own square or a neighbour. `nearest(x, z)` is how far the nearest way passes, seen from above.
  const sorted = (ways: Way[]) => {
    const cells = new Map<string, Way[]>(), cell = (v: number) => Math.floor(v / 24);
    for (const way of ways) {
      const k = `${cell((way.from.x + way.to.x) / 2)},${cell((way.from.z + way.to.z) / 2)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k)!.push(way);
    }
    return (x: number, z: number) => {
      let nearest = Infinity;
      for (let i = cell(x) - 1; i <= cell(x) + 1; i++) for (let j = cell(z) - 1; j <= cell(z) + 1; j++) {
        for (const { from, to } of cells.get(`${i},${j}`) ?? []) nearest = Math.min(nearest, fromSegment(x, z, [from.x, from.z], [to.x, to.z]));
      }
      return nearest;
    };
  };
  const TIERS = [false, true], VIEWS = [true, false];
  let nearestWay: Map<string, (x: number, z: number) => number>, longest: number;
  const nearestOn = (phone: boolean, third: boolean) => nearestWay.get(`${phone},${third}`)!;
  beforeAll(() => {
    nearestWay = new Map();
    longest = 0;
    for (const phone of TIERS) for (const third of VIEWS) {
      const ways = waysOn(phone, third);
      for (const { from, to } of ways) longest = Math.max(longest, Math.hypot(to.x - from.x, to.z - from.z));
      nearestWay.set(`${phone},${third}`, sorted(ways));
    }
  }, 60000);

  // What the near plane of the widest frame the trees' tests reckon with needs: a frame twice as wide as a desktop's (eyeRoom).
  const WIDE_ROOM = 1.3;

  it("passes outside every crown on every show, on a desktop and a phone, in third person and in first, with room for the widest frame's near plane", () => {
    // The longest way, seen from above, is under 25 m: the rigs stand furthest apart where the line bends.
    expect(longest).toBeLessThan(25);
    expect(longest).toBeGreaterThan(20);
    const rooms = new Map<string, number>();
    for (const w of WORLDS) for (const third of VIEWS) {
      const nearest = nearestOn(w.phone, third);
      let room = Infinity;
      for (const t of w.trees) room = Math.min(room, nearest(t.x, t.z) - t.reach);
      expect(room, `${w.date} ${w.phone ? "phone" : "desktop"} ${third ? "third" : "first"} person`).toBeGreaterThan(WIDE_ROOM);
      const k = `${w.phone},${third}`;
      rooms.set(k, Math.min(rooms.get(k) ?? Infinity, room));
    }
    // Over all the shows the nearest crown leaves what the widest frame's near plane needs and more, in either view. In third
    // person it is a tree that stands as near the camera that walks with the bears as EYE_ROOM lets one, at the way's start:
    // under 3 m from it on some show, as that rule's own test finds. More shows can only bring that down, never under the bar.
    for (const phone of TIERS) for (const third of VIEWS) expect(rooms.get(`${phone},${third}`)).toBeGreaterThan(WIDE_ROOM);
    for (const phone of TIERS) expect(rooms.get(`${phone},true`)).toBeLessThan(3);
  });

  it("could pass through no crown on any show: of every place a square may try a tree, those the tier's own cameras' rules leave all stand further from the way than their crown could reach, whatever landmarks a show has", { timeout: 20000 }, () => {
    // Every place a tree is ever tried: each square's TRIES, with the widest its crown could be and the furthest it could reach, as
    // placeTrees reckons them, at the tallest a tree stands.
    const span = Math.ceil(RING / CELL), tries: { x: number; z: number; reach: number }[] = [];
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) for (let nth = 0; nth < TRIES; nth++) {
      const wide = CROWN_R[0] + (CROWN_R[1] - CROWN_R[0]) * chance(a, b, 7), lean = LEAN * (0.25 + 0.75 * chance(a, b, 11));
      tries.push({ x: (a + 0.1 + 0.8 * chance(a, b, 20 * nth + 1)) * CELL, z: (b + 0.1 + 0.8 * chance(a, b, 20 * nth + 2)) * CELL, reach: wide * CROWN_REACH + lean * (TALL[1] + SUNK) });
    }
    const key = (x: number, z: number) => `${x},${z}`, reachAt = new Map(tries.map((t) => [key(t.x, t.z), t.reach]));
    const from = (points: number[][]) => {
      const cells = new Map<string, number[][]>(), cell = (v: number) => Math.floor(v / 16);
      for (const p of points) { const k = `${cell(p[0])},${cell(p[1])}`; if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(p); }
      return (x: number, z: number, r: number) => {
        for (let i = cell(x - r); i <= cell(x + r); i++) for (let j = cell(z - r); j <= cell(z + r); j++) for (const p of cells.get(`${i},${j}`) ?? []) if (Math.hypot(x - p[0], z - p[1]) < r) return true;
        return false;
      };
    };
    const lies = ({ from: [ax, az], to: [bx, bz], half, spread = 0 }: View, x: number, z: number) => {
      const dx = bx - ax, dz = bz - az, long = Math.hypot(dx, dz), along = Math.max(0, Math.min(long, ((x - ax) * dx + (z - az) * dz) / (long || 1)));
      return Math.hypot(x - ax - (dx / (long || 1)) * along, z - az - (dz / (long || 1)) * along) < half + spread * along;
    };
    const nearLine = from(linePoints);
    for (const phone of TIERS) {
      // The rules that are the cameras' own and no show's: LINE_ROOM from the bears' line, EYE_ROOM from the camera that walks with
      // the bears, and out of the views that cost nothing, as a day without a recording has them. A show's landmarks only add to
      // these, so its trees are among the places they leave.
      const { eyes, views } = waysOf({ line, height, marks: [], phone, bears: bearsOf(phone) }), nearEye = from(eyes), clear = views.filter((v) => !v.cost);
      const left = tries.filter((t) => !nearLine(t.x, t.z, LINE_ROOM) && !nearEye(t.x, t.z, EYE_ROOM) && !clear.some((v) => lies(v, t.x, t.z)));
      expect(left.length).toBeGreaterThan(1000);
      for (const third of VIEWS) {
        const nearest = nearestOn(phone, third), where = `${phone ? "phone" : "desktop"}, ${third ? "third" : "first"} person`;
        // The nearest such place to a way stands LINE_ROOM from the line, opposite the crane at the end of its sway, 6.0 m from
        // the way. The one whose crown could come nearest stands 6.4 m from it and could reach 4.5 m of that, which leaves
        // 1.9 m, on either tier and in either view: both are by the crane's end of the way, which every tier and view shares.
        expect(least(left.map((t) => nearest(t.x, t.z))), where).toBeGreaterThan(LINE_ROOM - CRANE.sway);
        const room = least(left.map((t) => nearest(t.x, t.z) - t.reach));
        expect(room, where).toBeGreaterThan(WIDE_ROOM);
        expect(room, where).toBeLessThan(2.5);
      }
      // And the shows' own trees are among those places, none reaching further than its place could: the fixed day's and two more.
      const places = new Set(left.map((t) => key(t.x, t.z)));
      for (const w of phone ? [fixedPhone, on("1973-03-30", true), on("1986-07-07", true)] : [fixed, on("1973-03-30"), on("1986-07-07")]) {
        for (const t of w.trees) {
          expect(places.has(key(t.x, t.z)), `${w.date}: the tree at ${t.x}, ${t.z}`).toBe(true);
          expect(t.reach).toBeLessThanOrEqual(reachAt.get(key(t.x, t.z))! + 1e-12);
        }
      }
    }
  });

  it("stays well over the ground all the way: 6 m and more in third person on a desktop and 4 m in the other views, where the rigs themselves hang 6.5 m up or more", () => {
    for (const phone of TIERS) for (const third of VIEWS) {
      let low = Infinity;
      for (const { from, to } of waysOn(phone, third, 2)) for (let k = 0; k <= 16; k++) {
        const s = k / 16, x = from.x + (to.x - from.x) * s, z = from.z + (to.z - from.z) * s;
        low = Math.min(low, from.y + (to.y - from.y) * s - height(x, z));
      }
      expect(low, `${phone ? "phone" : "desktop"}, ${third ? "third" : "first"} person`).toBeGreaterThan(third && !phone ? 6 : 4);
      expect(low).toBeLessThan(6.5 + 1e-9);
    }
  });

  it("moves the camera under a metre in a frame as the page settles and wakes, wherever the bears are, where the cut it replaces moved it up to 24 m: on a desktop and a phone, in both views, at 20 frames a second", { timeout: 20000 }, () => {
    // The bears walk 2.5 m/s (main.js); a frame adds 50 ms of world time at the most. From every 3 m of the line, with each number
    // of bears: the page settles, the camera goes out for RIG_EASE_S and rests a second, and a look control brings it back.
    const DT = 0.05, PACE = 2.5;
    const apart = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    for (const phone of TIERS) for (const third of VIEWS) {
      let most = 0, rigs = 0, cut = 0;
      for (const count of bearsOf(phone)) for (let d0 = 0; d0 < line.length; d0 += 3) {
        let lean = 0, was: Point | null = null, post: Point | null = null, crane: Point | null = null;
        for (let f = 0; f < (2 * RIG_EASE_S + 1) / DT; f++) {
          const deps = { third, phone, bearD: d0 + PACE * DT * f, count, gap: BEAR_GAP, line, height, keepInView: () => 0 };
          // As main.js steps it: toward the crane while the page is settled, back once it wakes to a look.
          lean = Math.max(0, Math.min(1, lean + (f * DT < RIG_EASE_S + 1 ? DT : -DT) / RIG_EASE_S));
          const a = postPose(deps, 0, 0), b = cranePose(deps, DT * f), at = ridePose(a, b, lean).pos;
          if (was) {
            most = Math.max(most, apart(at, was));
            rigs = Math.max(rigs, apart(a.pos, post!), apart(b.pos, crane!));
          }
          cut = Math.max(cut, apart(a.pos, b.pos));
          was = at; post = a.pos; crane = b.pos;
        }
      }
      const where = `${phone ? "phone" : "desktop"}, ${third ? "third" : "first"} person`;
      // The rigs themselves move the camera as they go with the bears: the one that walks with them up to 0.64 m in a frame on a
      // desktop where the line bends, in third person, and both of them 0.22 m in first, where they keep to the line. The way
      // between them adds under a fifth of a metre to that in third person and under half a metre in first: 0.73 m in a frame at
      // the most, on a desktop in third person. The cut it replaces was as far as the rigs stand apart, up to 24 m.
      expect(most, where).toBeLessThan(third ? rigs + 0.2 : rigs + 0.5);
      expect(most, where).toBeLessThan(0.8);
      expect(most, where).toBeGreaterThan(0.5);
      expect(cut, where).toBeGreaterThan(19);
      expect(cut, where).toBeLessThan(25);
    }
  });

  it("stands the same trees as before the two modes became one: a day with no recording, whose trees only the land and the cameras place, hashed on a desktop and a phone", () => {
    // Each tree's place, size and kind to the millimetre. A show's landmarks move its trees, and other tests hold those; these two
    // move only if the path, the line, the land's rules or a camera's numbers do.
    const hashes = TIERS.map((phone) => {
      const { spots } = placed({ count: phone ? TARGET.phone : TARGET.desktop, loop, line: linePoints, landmarks: [], ...waysOf({ line, height, marks: [], phone, bears: bearsOf(phone) }) });
      const mm = (v: number) => Math.round(v * 1000);
      return createHash("sha256").update(JSON.stringify(spots.map((t) => [mm(t.x), mm(t.z), mm(t.tall), mm(t.wide), t.kind]))).digest("hex").slice(0, 16);
    });
    expect(hashes).toEqual(["15daee0e449cb724", "36c1feb36bd2d0e7"]);
  });
});

describe("a walk among the trees", () => {
  it("has every trunk's reach to itself: clear of every other's, of the stage's, of the bound and of the bears' line", () => {
    // So no two reaches close a gap between them, a walk reaches everywhere it did but the trunks, and the bears never push a walker
    // into one.
    const fine = Array.from({ length: Math.ceil(line.length * 2) }, (_, k) => line.at(k / 2));
    eachTree((t, w) => {
      expect(Math.hypot(t.x - STAGE_COLUMN.x, t.z - STAGE_COLUMN.z), w.date).toBeGreaterThan(STAGE_REACH + TREE_REACH + 1);
      expect(Math.hypot(t.x, t.z) + TREE_REACH, w.date).toBeLessThan(BOUND - 1);
    });
    for (const w of WORLDS) expect(leastFrom(fine, w.trees), w.date).toBeGreaterThan(BODY_REACH + TREE_REACH + 1);
    expect(MIN_APART - 2 * TREE_REACH).toBeCloseTo(PASS, 12);
  });

  it("leaves the ground a walk can stand on in one piece, on the fixed day's show and on three more", () => {
    for (const w of [fixed, fixedPhone, on("1966-02-25"), on("1982-04-02"), on("1994-09-27", true)]) {
      // Every quarter metre of the island a walker may stand on, and those reached from the trailhead by steps of a quarter metre:
      // finer than PASS, the least a walker has between two trunks' reaches.
      const n = Math.ceil(BOUND * 4), at = (i: number) => (i - n) / 4, side = 2 * n + 1;
      const free = new Uint8Array(side * side).fill(1);
      for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
        const x = at(i), z = at(j);
        if (Math.hypot(x, z) > BOUND || Math.hypot(x - STAGE_COLUMN.x, z - STAGE_COLUMN.z) < STAGE_REACH) free[i * side + j] = 0;
      }
      // Each tree takes the quarter metres within its reach.
      for (const t of w.trees) {
        for (let i = Math.floor((t.x - TREE_REACH) * 4) + n; i <= Math.ceil((t.x + TREE_REACH) * 4) + n; i++) for (let j = Math.floor((t.z - TREE_REACH) * 4) + n; j <= Math.ceil((t.z + TREE_REACH) * 4) + n; j++) {
          if (Math.hypot(at(i) - t.x, at(j) - t.z) < TREE_REACH) free[i * side + j] = 0;
        }
      }
      const open = free.reduce((sum, f) => sum + f, 0);
      const start = (Math.round(TRAILHEAD[0] * 4) + n) * side + Math.round(TRAILHEAD[1] * 4) + n, queue = [start];
      expect(free[start]).toBe(1);
      free[start] = 2;
      let reached = 1;
      while (queue.length > 0) {
        const k = queue.pop()!;
        for (const next of [k - 1, k + 1, k - side, k + side]) if (free[next] === 1) { free[next] = 2; reached += 1; queue.push(next); }
      }
      expect(reached, w.date).toBe(open);
      // The trees do take ground: some 587 quarter metres each.
      expect(open).toBeLessThan(Math.PI * BOUND * BOUND * 16 - w.trees.length * 570);
    }
  });

  it("stops a walk at a trunk and slides it round, from every side, and never lets it nearer than TREE_REACH, trying only the trunks near it", () => {
    const trees = fixed.trees;
    for (const tree of trees.slice(0, 30)) {
      for (let k = 0; k < 8; k++) {
        // From 8 m off, straight at a point half a metre to one side of the trunk's middle, two and a half seconds at the walk's pace:
        // once among all the trees, as the world's walk has them, by the look-up the trees give it; and once with this tree alone,
        // where nothing else turns the walk.
        const a = (k * Math.PI) / 4, heading = Math.atan2(Math.cos(a), Math.sin(a));
        for (const alone of [false, true]) {
          const limits = walkLimits([], alone ? () => [tree] : made.trunks, TREE_REACH), walker = { x: tree.x + 8 * Math.cos(a) - 0.5 * Math.sin(a), z: tree.z + 8 * Math.sin(a) + 0.5 * Math.cos(a), heading };
          confine(walker, limits);
          let nearest = Infinity, any = Infinity;
          for (let f = 0; f < 150; f++) {
            walker.x -= Math.sin(heading) * 0.2; walker.z -= Math.cos(heading) * 0.2;
            confine(walker, limits);
            for (const t of alone ? [tree] : trees) any = Math.min(any, Math.hypot(walker.x - t.x, walker.z - t.z));
            nearest = Math.min(nearest, Math.hypot(walker.x - tree.x, walker.z - tree.z));
          }
          // It was never in any trunk's reach, of all the trees on the island.
          expect(any).toBeGreaterThanOrEqual(TREE_REACH - 1e-9);
          if (!alone) continue;
          // It met this trunk's reach, slid round it, and went on past it, clear of it along its way.
          expect(nearest).toBeCloseTo(TREE_REACH, 6);
          expect((walker.x - tree.x) * -Math.sin(heading) + (walker.z - tree.z) * -Math.cos(heading)).toBeGreaterThan(TREE_REACH);
        }
      }
    }
  });
});

describe("the trees' shapes", () => {
  const shapes = [["pine", pineGeometry], ["broad", broadGeometry]] as const;
  type Attribute = Corners & { itemSize: number; getW(i: number): number };
  type Shape = { index: unknown; attributes: Record<string, Attribute>; getAttribute(name: string): Attribute; morphAttributes: Record<string, Attribute[]>; morphTargetsRelative: boolean };
  const geometryOf = (kind: string, phone: boolean) => (kind === "pine" ? pineGeometry : broadGeometry)(phone) as unknown as Shape;
  const nameOf = (kind: string, phone: boolean) => `${kind} on a ${phone ? "phone" : "desktop"}`;
  // The form of every number 0; and the corners of the box of forms, each number 0 or 1. A corner's place, normal and colour each
  // move with a form's numbers in proportion, so what holds of a place or a colour at every corner of the box holds of every form
  // inside it, which is every form a tree can take.
  const NONE = new Array<number>(FORMS).fill(0);
  const BOX = Array.from({ length: 2 ** FORMS }, (_, b) => Array.from({ length: FORMS }, (_, k) => (b >> k) & 1));
  const AXES = ["getX", "getY", "getZ"] as const;
  // A shape's corners in a form, in its own frame: from 0 at the sunk foot to 1 at the top, and in its crown's radii out from its
  // middle line; whether a corner's colour is a leaf's, greener than it is red, where bark is redder; how squarely its normal faces
  // the sky on a tree of the middle size, REF_WIDE m across its crown's half and REF_TALL m from its sunk foot; and how pale it is.
  const read = (geo: Shape, form = NONE) => {
    const moved = (name: string, i: number, axis: (typeof AXES)[number]) => geo.getAttribute(name)[axis](i) + form.reduce((sum, w, k) => sum + w * geo.morphAttributes[name][k][axis](i), 0);
    return Array.from({ length: geo.getAttribute("position").count }, (_, i) => {
      const [x, y, z] = AXES.map((a) => moved("position", i, a)), [r, g, b] = AXES.map((a) => moved("color", i, a)), n = AXES.map((a) => moved("normal", i, a));
      return { x, y, z, leaf: g > r, up: n[1] / REF_TALL / Math.hypot(n[0] / REF_WIDE, n[1] / REF_TALL, n[2] / REF_WIDE), light: 0.2126 * r + 0.7152 * g + 0.0722 * b };
    });
  };
  type Corner = ReturnType<typeof read>[number];
  const out = (c: { x: number; z: number }) => Math.hypot(c.x, c.z);
  const mean = (list: number[]) => list.reduce((sum, v) => sum + v, 0) / list.length;

  it("are a few hundred triangles on a desktop and under a third as many on a phone, with a place, a normal and a colour to every corner, and FORMS forms that move them", () => {
    const triangles = (phone: boolean) => Object.fromEntries(shapes.map(([kind]) => [kind, geometryOf(kind, phone).getAttribute("position").count / 3]));
    expect(triangles(false)).toEqual({ pine: 530, broad: 494 });
    expect(triangles(true)).toEqual({ pine: 76, broad: 122 });
    for (const [kind] of shapes) expect(triangles(true)[kind] * 3, kind).toBeLessThan(triangles(false)[kind]);
    for (const [kind] of shapes) for (const phone of [false, true]) {
      const geo = geometryOf(kind, phone), count = geo.getAttribute("position").count, name = nameOf(kind, phone);
      expect(Object.keys(geo.attributes).sort(), name).toEqual(["color", "normal", "position"]);
      expect(geo.index, name).toBeNull();
      // A colour has four parts, the last always 1, as three's shader blends a morph target's colour only so.
      const colour = geo.getAttribute("color"), normal = geo.getAttribute("normal");
      expect(["position", "normal", "color"].map((n) => geo.getAttribute(n).itemSize), name).toEqual([3, 3, 4]);
      for (let i = 0; i < count; i++) expect(colour.getW(i)).toBe(1);
      for (let i = 0; i < count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      // FORMS morph targets of the same corners, each what one number at 1 changes, kept as a change; none changes a colour's last part.
      expect(Object.keys(geo.morphAttributes).sort(), name).toEqual(["color", "normal", "position"]);
      expect(geo.morphTargetsRelative, name).toBe(true);
      for (const n of ["color", "normal", "position"]) {
        expect(geo.morphAttributes[n], name).toHaveLength(FORMS);
        for (const target of geo.morphAttributes[n]) expect([target.count, target.itemSize], name).toEqual([count, geo.getAttribute(n).itemSize]);
      }
      for (const target of geo.morphAttributes.color) for (let i = 0; i < count; i++) expect(target.getW(i)).toBe(0);
      // Every number moves the shape: each but the last carries some corner 5 cm and more on a tree of the middle size, three of
      // them 40 cm and more; and the last moves none, and greys the bark.
      const most = geo.morphAttributes.position.map((d) => { let far = 0; for (let i = 0; i < count; i++) far = Math.max(far, Math.hypot(d.getX(i) * REF_WIDE, d.getY(i) * REF_TALL, d.getZ(i) * REF_WIDE)); return far; });
      expect(Math.min(...most.slice(0, FORMS - 1)), name).toBeGreaterThan(0.05);
      expect(most.filter((m) => m > 0.4).length, name).toBeGreaterThanOrEqual(3);
      expect(most[FORMS - 1], name).toBe(0);
      const grey = geo.morphAttributes.color[FORMS - 1], base = read(geo);
      let greyed = 0;
      for (let i = 0; i < count; i++) {
        const change = Math.abs(grey.getX(i)) + Math.abs(grey.getY(i)) + Math.abs(grey.getZ(i));
        if (base[i].leaf) expect(change).toBe(0);
        else greyed = Math.max(greyed, change);
      }
      expect(greyed, name).toBeGreaterThan(0.2);
    }
  });

  it("stand each trunk on a foot of ROOTS roots: fluted, as wide as the sunk foot to FOOT_TOP, which is within a third of a metre of the ground on any tree, and drawing in to the trunk by FOOT_IN, the flare bending in as it goes, and darker than the bark over it", () => {
    for (const [kind] of shapes) for (const phone of [false, true]) {
      const [widest, trunk] = kind === "pine" ? [0.19, 0.135] : [TRUNK_FOOT, 0.14], all = read(geometryOf(kind, phone)), name = nameOf(kind, phone);
      // A ring's corners, each once, by their way round from the foot's middle.
      const ring = (y: number) => {
        const at = new Map<number, Corner>();
        for (const c of all) if (Math.abs(c.y - y) < 1e-6) at.set(Math.round(Math.atan2(c.z, c.x) * 1e4), c);
        return [...at.entries()].sort(([p], [q]) => p - q).map(([, c]) => c);
      };
      // Fluted at the sunk foot: each root's corner stands out at most of the foot's width and the corners between the roots well
      // in from it; a desktop's ROOTS roots, a corner between each two, and a phone's three of five corners.
      const sunk = ring(0), drawn = ring(FOOT_IN), roots = sunk.map((c) => out(c) > 0.85 * widest);
      expect([sunk.length, drawn.length], name).toEqual(phone ? [5, 5] : [2 * ROOTS, 2 * ROOTS]);
      expect(Math.max(...sunk.map(out)), name).toBeLessThanOrEqual(widest + 1e-6);
      expect(Math.max(...sunk.map(out)), name).toBeGreaterThan(0.95 * widest);
      expect(roots.filter(Boolean).length, name).toBe(phone ? 3 : ROOTS);
      expect(Math.max(...sunk.filter((_, k) => !roots[k]).map(out)), name).toBeLessThan(0.78 * widest);
      if (!phone) roots.forEach((root, k) => expect(root === roots[(k + 1) % roots.length], name).toBe(false));
      // By FOOT_IN the roots have drawn into the trunk: every corner within a sixth of its width.
      expect(Math.max(...drawn.map(out)), name).toBeLessThanOrEqual(0.96 * trunk + 1e-6);
      expect(least(drawn.map(out)), name).toBeGreaterThan(0.8 * trunk);
      if (phone) {
        // A phone's draws straight in from the sunk foot, with no ring between.
        expect(ring(FOOT_TOP), name).toHaveLength(0);
      } else {
        // A desktop's is as wide at FOOT_TOP as at the sunk foot, root by root; and each root's corner, halfway on to FOOT_IN, stands
        // further in than halfway between where it was and where it goes, as a root bends in to its trunk.
        const top = ring(FOOT_TOP), bend = ring((FOOT_TOP + FOOT_IN) / 2);
        expect(top.map(out), name).toEqual(sunk.map((c) => expect.closeTo(out(c), 9)));
        expect(bend, name).toHaveLength(2 * ROOTS);
        top.forEach((c, k) => { if (out(c) > 0.85 * widest) expect(out(bend[k]), name).toBeLessThan((out(c) + out(drawn[k])) / 2 - 0.005); });
      }
      // The darkest bark is at the ground: the foot's corners there under three quarters as pale as the bark from 4 m up, on a
      // tree of the middle size.
      const over = all.filter((c) => !c.leaf && c.y * REF_TALL > 4), ground = phone ? sunk : [...sunk, ...ring(FOOT_TOP)];
      expect(over.length, name).toBeGreaterThan(4);
      expect(Math.max(...ground.map((c) => c.light)), name).toBeLessThan(0.75 * mean(over.map((c) => c.light)));
    }
    // The ground stands SUNK of a tree's whole height up it: FOOT_TOP is no more than 0.36 m over it, on the tallest, or under it,
    // on the shortest; and the flare has drawn in within 1.2 m over that.
    for (const tall of TALL) expect(Math.abs(FOOT_TOP * (tall + SUNK) - SUNK)).toBeLessThan(0.37);
    expect((FOOT_IN - FOOT_TOP) * (TALL[1] + SUNK)).toBeLessThan(1.2);
  });

  it("stand in every form from 0 at the sunk foot to 1 at the crown's top, the crown no lower than BASE_FRAC and no wider than CROWN_REACH, the trunk no wider than TRUNK_FOOT", () => {
    for (const phone of [false, true]) for (const [kind] of shapes) {
      const geo = geometryOf(kind, phone), name = nameOf(kind, phone), leaves = read(geo).map((c) => c.leaf);
      let reaches = Infinity;
      for (const form of BOX) {
        const all = read(geo, form);
        // A corner is a leaf's or the bark's in every form alike.
        expect(all.every((c, i) => c.leaf === leaves[i]), name).toBe(true);
        expect(least(all.map((c) => c.y)), name).toBe(0);
        expect(Math.max(...all.map((c) => c.y)), name).toBeCloseTo(1, 6);
        // Under BASE_FRAC of its height a tree is trunk, bark and no wider than its foot; every leaf is over it (as a corner is
        // kept to a float's measure, to within a millionth).
        const under = all.filter((c) => c.y < BASE_FRAC - 1e-6);
        expect(Math.max(...under.map(out)), name).toBeLessThanOrEqual(TRUNK_FOOT + 1e-6);
        expect(under.every((c) => !c.leaf), name).toBe(true);
        // No corner stands further out than CROWN_REACH; and the crown is most of the tree.
        expect(Math.max(...all.map(out)), name).toBeLessThanOrEqual(CROWN_REACH + 1e-6);
        expect(all.filter((c) => c.leaf).length, name).toBeGreaterThan(all.length / 2);
        reaches = Math.min(reaches, Math.max(...all.map(out)));
      }
      // No crown is a stub: in every form it reaches three fifths of its radius and more.
      expect(reaches, name).toBeGreaterThan(0.6);
    }
    expect([TRUNK_FOOT, CROWN_REACH, BASE_FRAC]).toEqual([0.2, 0.98, 0.66]);
  });

  // A shape's parts in a form, on a tree of the middle size, in metres: its triangles joined by the corners they share, each with how
  // many of its edges no other of its triangles shares the other way (none, for a closed skin), how much it holds (above 0 for a
  // closed skin that faces out), whether it is leaves, and its triangles, nine numbers each.
  function partsOf(geo: Shape, form: number[]) {
    const all = read(geo, form), key = (c: Corner) => `${c.x.toFixed(7)},${c.y.toFixed(7)},${c.z.toFixed(7)}`;
    const parent = all.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const first = new Map<string, number>();
    all.forEach((c, i) => { const k = key(c), f = first.get(k); if (f === undefined) first.set(k, i); else parent[find(i)] = find(f); });
    for (let f = 0; f < all.length; f += 3) { parent[find(f + 1)] = find(f); parent[find(f + 2)] = find(f); }
    const groups = new Map<number, number[]>();
    for (let f = 0; f < all.length; f += 3) { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(f); }
    return [...groups.values()].map((faces) => {
      const edges = new Map<string, number>(), tris: number[] = [];
      let holds = 0;
      for (const f of faces) {
        const [a, b, c] = [all[f], all[f + 1], all[f + 2]].map((p) => ({ ...p, x: p.x * REF_WIDE, y: p.y * REF_TALL, z: p.z * REF_WIDE }));
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        holds += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
        for (let e = 0; e < 3; e++) { const k = `${key(all[f + e])}|${key(all[f + ((e + 1) % 3)])}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
      }
      let open = 0;
      for (const [k, n] of edges) { const [p, q] = k.split("|"); if (n !== 1 || edges.get(`${q}|${p}`) !== 1) open += 1; }
      return { faces, open, holds, leaf: all[faces[0] + 1].leaf, low: Math.min(...faces.map((f) => all[f].y)), tris };
    });
  }
  // Whether segment p–q crosses a triangle of `tris`, strictly between its ends.
  function crosses(tris: number[], p: number[], q: number[]) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ray = new THREE.Ray(new THREE.Vector3(...p), new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize()), hit = new THREE.Vector3();
    const long = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    for (let o = 0; o < tris.length; o += 9) {
      a.set(tris[o], tris[o + 1], tris[o + 2]); b.set(tris[o + 3], tris[o + 4], tris[o + 5]); c.set(tris[o + 6], tris[o + 7], tris[o + 8]);
      if (ray.intersectTriangle(a, b, c, false, hit) && hit.distanceTo(ray.origin) < long) return true;
    }
    return false;
  }
  // Two parts are joined where a corner of one lies inside the other's skin, or an edge of one passes through the other's skin.
  const joined = (one: number[], other: number[]) => {
    for (let o = 0; o < one.length; o += 3) if (within(other, one[o], one[o + 1], one[o + 2])) return true;
    for (let o = 0; o < one.length; o += 9) for (let e = 0; e < 3; e++) {
      const p = one.slice(o + 3 * e, o + 3 * e + 3), q = one.slice(o + 3 * ((e + 1) % 3), o + 3 * ((e + 1) % 3) + 3);
      if (crosses(other, p, q)) return true;
    }
    return false;
  };

  it("draw every mass of leaves or needles as a closed skin that faces out, so no sky shows through one from under it, in every form; and join every part to the foot, through the trunk, in the forms trees of the fixed day take", { timeout: 30000 }, () => {
    for (const phone of [false, true]) for (const [kind] of shapes) {
      const geo = geometryOf(kind, phone), name = nameOf(kind, phone), own = byKind(phone ? fixedPhone.trees : fixed.trees)[kind === "pine" ? 0 : 1];
      // Its leaves are closed skins, each holding a fiftieth of a cubic metre and more, so facing out and no flat sheet; its bark
      // open tubes, whose ends lie in other parts.
      for (const form of BOX) for (const part of partsOf(geo, form)) {
        if (part.leaf) { expect(part.open, name).toBe(0); expect(part.holds, name).toBeGreaterThan(0.02); }
        else expect(part.open, name).toBeGreaterThan(0);
      }
      // The forms with every number 0, each number alone at 1, all at 1, and five trees' of the fixed day.
      const forms = [NONE, ...NONE.map((_, k) => NONE.map((__, j) => (j === k ? 1 : 0))), NONE.map(() => 1), ...own.slice(0, 5).map((t) => formOf(t) as number[])];
      for (const form of forms) {
        const parts = partsOf(geo, form);
        // The foot is one part.
        const foot = parts.filter((p) => p.low === 0);
        expect(foot, name).toHaveLength(1);
        // Each part is joined to the foot, through the parts it touches.
        const reached = new Set([parts.indexOf(foot[0])]), todo = [...reached];
        while (todo.length > 0) {
          const i = todo.pop()!;
          parts.forEach((p, j) => { if (!reached.has(j) && (joined(p.tris, parts[i].tris) || joined(parts[i].tris, p.tris))) { reached.add(j); todo.push(j); } });
        }
        expect(reached.size, name).toBe(parts.length);
      }
      // A pine's needles are in clumps, one to a bough, and its leader, and a phone's in its four tiers; a broad-crowned tree's
      // leaves are BROAD_MASSES' masses.
      const leaves = partsOf(geo, NONE).filter((p) => p.leaf).length;
      expect(leaves, name).toBe(kind === "pine" ? (phone ? 4 : 51) : BROAD_MASSES[phone ? "phone" : "desktop"].length);
    }
  });

  it("keep every face turned its own way in every form: at every corner of the box of forms and in 3,000 forms between, no face's normal turns a right angle or more from its own in the form of every number 0, on a desktop and a phone, for both kinds", () => {
    // Forms between the box's corners, each number its own, the same every run.
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const forms = [...BOX, ...Array.from({ length: 3000 }, () => NONE.map(next))];
    for (const phone of [false, true]) for (const [kind] of shapes) {
      const geo = geometryOf(kind, phone), name = nameOf(kind, phone), place = geo.getAttribute("position"), moves = geo.morphAttributes.position, count = place.count;
      // Each corner's place and each number's change to it, in metres on a tree of the middle size.
      const scale = [REF_WIDE, REF_TALL, REF_WIDE], at = new Float64Array(3 * count), by = moves.map(() => new Float64Array(3 * count));
      for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) {
        at[3 * i + c] = place[AXES[c]](i) * scale[c];
        moves.forEach((m, k) => { by[k][3 * i + c] = m[AXES[c]](i) * scale[c]; });
      }
      const normals = (form: number[]) => {
        const p = Float64Array.from(at);
        form.forEach((w, k) => { if (w !== 0) for (let j = 0; j < p.length; j++) p[j] += w * by[k][j]; });
        const n = new Float64Array(count);
        for (let f = 0; f < count; f += 3) {
          const ax = p[3 * f + 3] - p[3 * f], ay = p[3 * f + 4] - p[3 * f + 1], az = p[3 * f + 5] - p[3 * f + 2], bx = p[3 * f + 6] - p[3 * f], by_ = p[3 * f + 7] - p[3 * f + 1], bz = p[3 * f + 8] - p[3 * f + 2];
          n[f] = ay * bz - az * by_; n[f + 1] = az * bx - ax * bz; n[f + 2] = ax * by_ - ay * bx;
        }
        return n;
      };
      const own = normals(NONE);
      let least = Infinity;
      for (const form of forms) {
        const now = normals(form);
        for (let f = 0; f < count; f += 3) {
          const a = Math.hypot(own[f], own[f + 1], own[f + 2]), b = Math.hypot(now[f], now[f + 1], now[f + 2]);
          if (a > 0 && b > 0) least = Math.min(least, (own[f] * now[f] + own[f + 1] * now[f + 1] + own[f + 2] * now[f + 2]) / a / b);
        }
      }
      // The cosine of the most any face turns, over every form tried.
      expect(least, name).toBeGreaterThan(0);
    }
  });

  it("run a pine's trunk up through its crown to a leader at its top, its bark all trunk, and fork a broad-crowned tree's trunk into limbs that reach out on every side into its crown, at every corner of the box of forms", { timeout: 60000 }, () => {
    for (const phone of [false, true]) {
      const name = phone ? "phone" : "desktop";
      // The pine's trunk is the bark that rises from under its crown's base (a bough's limb would start in the crown): of those
      // parts, the one that reaches highest. At every corner of the box it runs on to within a metre of the top; and above the
      // crown's base no bark of the pine, the trunk's or any other, stands further from the middle line than 0.13 of a crown radius,
      // where the trunk's bend carries it at the most (0.126): no bough's bark shows out of its clump. Since a corner moves in a
      // straight line as a form changes, and its distance from the middle line can only bow down between two forms, that holds in
      // every form. The leader's point is the top, in needles.
      const high = (part: { tris: number[] }) => Math.max(...part.tris.filter((_, i) => i % 3 === 1));
      for (const form of BOX) {
        const pine = read(geometryOf("pine", phone), form);
        const trunk = partsOf(geometryOf("pine", phone), form).filter((p) => !p.leaf && p.low < BASE_FRAC).sort((p, q) => high(q) - high(p))[0];
        expect(REF_TALL - high(trunk), `${name}, ${form}`).toBeLessThan(1);
        for (const c of pine) if (!c.leaf && c.y > BASE_FRAC) expect(out(c), `${name}, ${form}`).toBeLessThan(0.13);
        const top = pine.find((c) => c.y === Math.max(...pine.map((p) => p.y)))!;
        expect(top.leaf).toBe(true);
        expect(out(top)).toBeLessThan(0.05);
      }
      // The broad tree's bark leaves its middle line under its crown and reaches out into it, a quarter of its radius and more, on
      // every side and in every form: round the trunk, no gap between its limbs wider than 0.4 of a half turn on a desktop, or a
      // third of a turn on a phone, which has three limbs.
      const broad = geometryOf("broad", phone);
      for (const form of BOX) {
        const limbs = [...new Set(read(broad, form).filter((c) => !c.leaf && c.y > BASE_FRAC && out(c) > 0.25).map((c) => Math.round(Math.atan2(c.z, c.x) * 1e3) / 1e3))].sort((p, q) => p - q);
        expect(limbs.length, name).toBeGreaterThan(phone ? 4 : 12);
        const gap = Math.max(...limbs.map((a, k) => (limbs[(k + 1) % limbs.length] - a + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI));
        expect(gap, `${name}, ${form}`).toBeLessThan(phone ? (2 * Math.PI) / 3 : 0.4 * Math.PI);
      }
    }
  });

  // A desktop pine's crown, in a form: how far out its needles reach in each of BANDS bands of height from its crown's base to its
  // top, by points over each face; and each clump of needles but the leader, with how far its tip stands under its own top, as a
  // share of its length: its tip is its corner furthest across from its corner nearest the middle line, where it leaves the trunk.
  function outline(form: number[], BANDS = 6) {
    const base = BASE_FRAC * REF_TALL, reach = new Array<number>(BANDS).fill(0), clumps: { hang: number; high: number }[] = [];
    const parts = partsOf(geometryOf("pine", false), form).filter((p) => p.leaf), top = Math.max(...parts.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1)));
    for (const part of parts) {
      const t = part.tris;
      for (let o = 0; o < t.length; o += 9) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8 - i; j++) {
        const w = [1 - (i + j) / 8, i / 8, j / 8], [x, y, z] = [0, 1, 2].map((a) => w[0] * t[o + a] + w[1] * t[o + 3 + a] + w[2] * t[o + 6 + a]);
        if (y < base) continue;
        const band = Math.min(BANDS - 1, Math.floor(((y - base) / (REF_TALL - base)) * BANDS));
        reach[band] = Math.max(reach[band], Math.hypot(x, z));
      }
      const corners = Array.from({ length: t.length / 3 }, (_, k) => t.slice(3 * k, 3 * k + 3)), high = Math.max(...corners.map((c) => c[1]));
      if (high === top) continue;
      const near = corners.reduce((p, c) => (Math.hypot(c[0], c[2]) < Math.hypot(p[0], p[2]) ? c : p)), across = (c: number[]) => Math.hypot(c[0] - near[0], c[2] - near[2]);
      const tip = corners.reduce((p, c) => (across(c) > across(p) ? c : p));
      clumps.push({ hang: (high - tip[1]) / across(tip), high });
    }
    return { reach, clumps };
  }

  it("keep a desktop pine's outline a cone that narrows to its leader, at every corner of the box of forms: cut into six bands of height from its crown's base to its top, no band's needles reach further out than the band's under it by 5 cm, the widest band is in the lower half, and no clump hangs: its boughs are level to their tips, and none's tip stands under its top by more than 0.4 of its length, or 0.3 in the crown's upper half", { timeout: 60000 }, () => {
    const half = ((1 + BASE_FRAC) / 2) * REF_TALL;
    for (const form of BOX) {
      const { reach, clumps } = outline(form);
      for (let b = 1; b < reach.length; b++) expect(reach[b] - reach[b - 1], `${form}: band ${b}, ${reach.map((r) => r.toFixed(2))}`).toBeLessThan(0.05);
      expect(reach.indexOf(Math.max(...reach)), `${form}`).toBeLessThan(reach.length / 2);
      expect(clumps.length).toBe(50);
      for (const { hang, high } of clumps) expect(hang, `${form}: a clump to ${high.toFixed(2)} m`).toBeLessThan(high > half ? 0.3 : 0.4);
    }
  });

  it("show sky through a desktop pine's crown from under it, between its boughs, with no clump a lid: of the lines straight up through the ring from half its needles' reach to the whole, two fifths and more meet no part of the tree, and no clump of needles covers more than an eighth of the crown's footprint, in the form of every number 0, of every number 1, and those of the fixed day's first three pines", { timeout: 60000 }, () => {
    const geo = geometryOf("pine", false), up = new THREE.Vector3(0, 1, 0), ray = new THREE.Ray(), hit = new THREE.Vector3();
    for (const form of [NONE, NONE.map(() => 1), ...byKind(fixed.trees)[0].slice(0, 3).map((t) => formOf(t) as number[])]) {
      const all = read(geo, form), faces: THREE.Vector3[][] = [];
      for (let f = 0; f < all.length; f += 3) faces.push(all.slice(f, f + 3).map((c) => new THREE.Vector3(c.x * REF_WIDE, c.y * REF_TALL, c.z * REF_WIDE)));
      const reach = Math.max(...all.filter((c) => c.leaf).map((c) => out(c))) * REF_WIDE;
      let sky = 0;
      // Lines evenly over the ring, by area.
      const N = 2000;
      for (let k = 0; k < N; k++) {
        const r = reach * Math.sqrt(0.25 + 0.75 * ((k * 0.6180339887) % 1)), a = (2 * Math.PI * k * 37) / N;
        ray.set(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)), up);
        if (!faces.some((t) => ray.intersectTriangle(t[0], t[1], t[2], false, hit) !== null)) sky += 1;
      }
      expect(sky / N, `${form.map((w) => w.toFixed(2))}`).toBeGreaterThan(0.4);
      // A clump's footprint, seen from straight under it: its skin is closed, so half the area its faces cover, seen so. The leader,
      // over the trunk, is not a clump.
      const clumps = partsOf(geo, form).filter((p) => p.leaf), top = Math.max(...clumps.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1)));
      for (const { tris: t } of clumps.filter((p) => !p.tris.some((v, i) => i % 3 === 1 && v === top))) {
        let under = 0;
        for (let o = 0; o < t.length; o += 9) under += Math.abs((t[o + 3] - t[o]) * (t[o + 8] - t[o + 2]) - (t[o + 5] - t[o + 2]) * (t[o + 6] - t[o])) / 4;
        expect(under / (Math.PI * reach * reach), `${form.map((w) => w.toFixed(2))}`).toBeLessThan(1 / 8);
      }
    }
  });

  // A crown as it is seen from straight above, on a tree of the middle size: the crown's radius cut into 30, and for each square the
  // highest face over its middle: how high (in the tree's heights), how pale the colour there, how squarely the face itself lies to
  // the sky, and how squarely its light does (the corners' normals).
  function fromAbove(all: Corner[], owner: number[] = []) {
    const N = 30, cells = new Map<number, { x: number; z: number; y: number; light: number; faceUp: number; lightUp: number; part: number }>();
    for (let f = 0; f < all.length; f += 3) {
      const c = all.slice(f, f + 3);
      if (!c[1].leaf) continue;
      const ax = (c[1].x - c[0].x) * REF_WIDE, ay = (c[1].y - c[0].y) * REF_TALL, az = (c[1].z - c[0].z) * REF_WIDE, bx = (c[2].x - c[0].x) * REF_WIDE, by = (c[2].y - c[0].y) * REF_TALL, bz = (c[2].z - c[0].z) * REF_WIDE;
      const faceUp = (az * bx - ax * bz) / Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (faceUp <= 0) continue;
      const area = (c[1].x - c[0].x) * (c[2].z - c[0].z) - (c[2].x - c[0].x) * (c[1].z - c[0].z);
      for (let i = Math.ceil(Math.min(c[0].x, c[1].x, c[2].x) * N); i <= Math.floor(Math.max(c[0].x, c[1].x, c[2].x) * N); i++) for (let j = Math.ceil(Math.min(c[0].z, c[1].z, c[2].z) * N); j <= Math.floor(Math.max(c[0].z, c[1].z, c[2].z) * N); j++) {
        const x = i / N, z = j / N;
        const w1 = ((x - c[0].x) * (c[2].z - c[0].z) - (c[2].x - c[0].x) * (z - c[0].z)) / area, w2 = ((c[1].x - c[0].x) * (z - c[0].z) - (x - c[0].x) * (c[1].z - c[0].z)) / area, w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const y = w0 * c[0].y + w1 * c[1].y + w2 * c[2].y, key = i * 1000 + j;
        if ((cells.get(key)?.y ?? -Infinity) < y) cells.set(key, { x, z, y, light: w0 * c[0].light + w1 * c[1].light + w2 * c[2].light, faceUp, lightUp: w0 * c[0].up + w1 * c[1].up + w2 * c[2].up, part: owner[f / 3] ?? -1 });
      }
    }
    return [...cells.values()];
  }

  it("give a broad crown a canopy of round tops from above: masses whose tops stand at heights of their own, each showing its own top, paler there than down its flanks and lit as a round thing of its own", () => {
    for (const phone of [false, true]) {
      const masses = BROAD_MASSES[phone ? "phone" : "desktop"] as [number, number, number, number[], number, number, number][];
      const geo = geometryOf("broad", phone), name = phone ? "phone" : "desktop", owner: number[] = [];
      partsOf(geo, NONE).filter((p) => p.leaf).forEach((p, k) => { for (const f of p.faces) owner[f / 3] = k; });
      const seen = fromAbove(read(geo), owner);
      expect(masses, name).toHaveLength(phone ? 4 : 9);
      // The crown covers most of its circle, a phone's nearly half.
      expect(seen.length, name).toBeGreaterThan((phone ? 0.45 : 0.5) * Math.PI * 30 * 30);
      // The first mass tops the crown; the others stand lower, each by its own measure: the lowest over a metre and a half under
      // it, and no two within 10 cm of each other. And their sizes are their own.
      const tops = masses.map(([, , y, [, up]]) => y + up);
      expect(tops[0], name).toBeCloseTo(REF_TALL, 9);
      expect(Math.max(...tops.slice(1)), name).toBeLessThan(tops[0] - 0.5);
      expect(tops[0] - Math.min(...tops), name).toBeGreaterThan(1.5);
      const sorted = [...tops].sort((p, q) => q - p);
      for (let k = 1; k < sorted.length; k++) expect(sorted[k - 1] - sorted[k], name).toBeGreaterThan(0.1);
      expect(new Set(masses.map(([, , , [across]]) => across)).size, name).toBeGreaterThan(masses.length / 2);
      // They stand on every side of the first, which is over the trunk.
      expect(masses[0][1], name).toBeLessThan(0.2);
      const turns = masses.slice(1).map(([turn]) => turn).sort((p, q) => p - q);
      for (let k = 0; k < turns.length; k++) expect((turns[(k + 1) % turns.length] - turns[k] + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI, name).toBeLessThan(Math.PI);
      // Each shows some of its own top from above, between those over it: of what is seen, a fortieth and more on a desktop, and
      // a tenth on a phone, is each mass's own.
      const shares = masses.map((_, k) => seen.filter((c) => c.part === k).length / seen.length);
      expect(Math.min(...shares), name).toBeGreaterThan(phone ? 0.1 : 0.025);
      // No flat top: under a twentieth of what is seen stands within 10 cm of the highest, and the middle four fifths of it span
      // over a metre and a half.
      expect(seen.filter((c) => c.y * REF_TALL > REF_TALL - 0.1).length / seen.length, name).toBeLessThan(0.05);
      const high = seen.map((c) => c.y * REF_TALL).sort((p, q) => p - q);
      expect(high[Math.floor(seen.length * 0.9)] - high[Math.floor(seen.length * 0.1)], name).toBeGreaterThan(1.5);
      // Where a face lies squarely to the sky it is paler than where it leans away, by a third and more; and its light leans with
      // it, as a dome's does, and is not one flat crown's.
      const level = seen.filter((c) => c.faceUp > 0.8), leaning = seen.filter((c) => c.faceUp < 0.65);
      expect(level.length, name).toBeGreaterThan(seen.length * 0.1);
      expect(leaning.length, name).toBeGreaterThan(seen.length * 0.15);
      expect(mean(level.map((c) => c.light)), name).toBeGreaterThan(1.33 * mean(leaning.map((c) => c.light)));
      expect(mean(level.map((c) => c.lightUp)), name).toBeGreaterThan(0.7);
      expect(mean(leaning.map((c) => c.lightUp)), name).toBeLessThan(0.55);
    }
    // From below each crown is in its own shade: the corners that face down are the darkest, under half as pale as a broad
    // crown's flanks, and as a pine's clumps' tops.
    for (const [kind] of shapes) {
      const crown = read(geometryOf(kind, false)).filter((c) => c.leaf);
      const under = crown.filter((c) => c.up < -0.5), lit = crown.filter((c) => (kind === "pine" ? c.up > 0.5 : c.up > -0.1 && c.up < 0.5));
      expect(under.length, kind).toBeGreaterThan(30);
      expect(mean(lit.map((c) => c.light)), kind).toBeGreaterThan(2 * mean(under.map((c) => c.light)));
    }
  });

  // A crown as a walker sees it, the eye FIRST_EYE m over the ground and `far` m from the trunk on eight sides, on a tree of the
  // middle size whose foot is sunk SUNK m: of the faces of leaves or needles the eye sees (each face's middle turned to the eye, with
  // no part of the tree between them), the share, by how large each looks, whose face looks to the sky, so shows its lit side.
  function fromWalk(all: Corner[], far: number) {
    const faces: { leaf: boolean; at: THREE.Vector3[] }[] = [];
    for (let f = 0; f < all.length; f += 3) faces.push({ leaf: all[f + 1].leaf, at: all.slice(f, f + 3).map((c) => new THREE.Vector3(c.x * REF_WIDE, c.y * REF_TALL, c.z * REF_WIDE)) });
    const ray = new THREE.Ray(), hit = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3(), mid = new THREE.Vector3(), to = new THREE.Vector3();
    let up = 0, seen = 0;
    for (let side = 0; side < 8; side++) {
      const eye = new THREE.Vector3(far * Math.cos((side * Math.PI) / 4), SUNK + FIRST_EYE, far * Math.sin((side * Math.PI) / 4));
      for (const face of faces) {
        if (!face.leaf) continue;
        const [a, b, c] = face.at;
        n.subVectors(b, a).cross(e.subVectors(c, a));
        const area = n.length() / 2;
        if (area === 0) continue;
        n.normalize();
        mid.copy(a).add(b).add(c).divideScalar(3);
        to.subVectors(eye, mid);
        const dist = to.length(), facing = n.dot(to.divideScalar(dist));
        if (facing <= 0) continue;
        ray.set(mid.clone().addScaledVector(to, 1e-3), to);
        if (faces.some((g) => g !== face && ray.intersectTriangle(g.at[0], g.at[1], g.at[2], false, hit) !== null && hit.distanceTo(mid) < dist)) continue;
        seen += (area * facing) / dist ** 2;
        if (n.y > 0) up += (area * facing) / dist ** 2;
      }
    }
    return up / seen;
  }

  it("show a walker a pine's needles' lit side from under its crown, the more the further off: from 15, 20 and 30 m off, on a phone two fifths and more of the needles seen face the sky, and on a desktop, whose boughs are level to their bending tips, a sixth and more from 30 m; in the form of every number 0, of every number 1, and those of the fixed day's first three pines", { timeout: 60000 }, () => {
    for (const phone of [false, true]) {
      const geo = geometryOf("pine", phone), name = nameOf("pine", phone), own = byKind(phone ? fixedPhone.trees : fixed.trees)[0];
      for (const form of [NONE, NONE.map(() => 1), ...own.slice(0, 3).map((t) => formOf(t) as number[])]) {
        const shares = [15, 20, 30].map((far) => fromWalk(read(geo, form), far)), at = `${name}, ${form.map((w) => w.toFixed(2))}`;
        // A desktop's bar is lower, a sixth at 30 m where it was two fifths on average: its boughs are level, and bend down only at
        // their tips, so a walker under them sees mostly their shaded undersides. Boughs that drooped enough to show their tops
        // made the crown a palm from afar (e102f8b), which the outline test now forbids.
        if (phone) expect(mean(shares), at).toBeGreaterThan(0.4);
        else expect(shares[2], at).toBeGreaterThan(1 / 6);
        // And more of them the further off: the further, the more the eye sees of the crown's tops.
        expect(shares[2], name).toBeGreaterThan(shares[0]);
      }
    }
  });

});

describe("the trees as they are built", () => {
  it("are two instanced meshes, all the pines and all the broad-crowned, so two draw calls, and cast no shadow", () => {
    expect(made.scene.children).toHaveLength(2);
    expect(made.meshes).toEqual(made.scene.children);
    expect(made.count).toBe(TARGET.desktop);
    const kinds = byKind(fixed.trees);
    made.meshes.forEach((mesh, k) => {
      expect(mesh.isInstancedMesh).toBe(true);
      expect(mesh.count).toBe(kinds[k].length);
      // One material and no groups: one draw.
      expect(Array.isArray(mesh.material)).toBe(false);
      expect(mesh.geometry.groups).toHaveLength(0);
      expect(mesh.castShadow).toBe(false);
      // Its bounds are one tree's, and the trees stand all over the island.
      expect(mesh.frustumCulled).toBe(false);
    });
    // A wood of one kind is one mesh, and no trees none.
    expect(built(fixed.trees.filter((t) => t.kind === "pine")).scene.children).toHaveLength(1);
    expect(built([]).scene.children).toHaveLength(0);
  });

  it("draw each tree in a form of its own, by its own place's seed (formOf), set once as it is built, so no two trees of a kind near each other are alike", () => {
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      byKind(w.trees).forEach((mine, k) => {
        const mesh = own.meshes[k];
        // A morph target's share for each tree, as the GPU reads it: its form, every number within 0 and 1. The texture that holds
        // them is marked to go to the GPU: it starts at version 0, and three uploads a texture only once it is past that.
        expect(mesh.morphTexture).not.toBeNull();
        expect(mesh.morphTexture!.version).toBeGreaterThan(0);
        mine.forEach((tree, i) => {
          const form = formOf(tree) as number[];
          expect(form).toHaveLength(FORMS);
          expect(form.every((v) => v >= 0 && v <= 1)).toBe(true);
          expect(formAt(mesh, i)).toEqual(form.map((v) => expect.closeTo(v, 6)));
        });
      });
      // Built again, the same: a form is its tree's place's, and nothing else.
      const again = built(w.trees, w.phone);
      own.meshes.forEach((mesh, k) => { for (let i = 0; i < mesh.count; i++) expect(formAt(again.meshes[k], i)).toEqual(formAt(mesh, i)); });
    }
    // The fixed day's forms spread over each number's whole measure.
    for (let n = 0; n < FORMS; n++) {
      const values = [...fixed.trees, ...fixedPhone.trees].map((tree) => (formOf(tree) as number[])[n]);
      expect(least(values)).toBeLessThan(0.05);
      expect(Math.max(...values)).toBeGreaterThan(0.95);
    }
    // On every show, on a desktop and a phone, any two trees of a kind within 40 m of each other differ by a twentieth and more in
    // some number of their forms, each of which moves the shape (it is 5 cm and more at a corner; "the trees' shapes").
    let nearest = Infinity, pairs = 0;
    for (const w of WORLDS) for (const mine of byKind(w.trees)) {
      const forms = mine.map((tree) => formOf(tree) as number[]);
      for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) {
        if (Math.hypot(mine[a].x - mine[b].x, mine[a].z - mine[b].z) > 40) continue;
        pairs += 1;
        nearest = Math.min(nearest, Math.max(...forms[a].map((v, n) => Math.abs(v - forms[b][n]))));
      }
    }
    expect(pairs).toBeGreaterThan(10_000);
    expect(nearest).toBeGreaterThan(0.05);
  });

  it("add fewer than 5,000 triangles to a phone's frame on every show, and say what a desktop's and a TV's add", () => {
    const each = (phone: boolean) => ({ pine: pineGeometry(phone).getAttribute("position").count / 3, broad: broadGeometry(phone).getAttribute("position").count / 3 });
    const desktop = each(false), phone = each(true);
    const sum = (trees: Spot[], per: { pine: number; broad: number }) => trees.reduce((a, t) => a + per[t.kind as "pine" | "broad"], 0);
    const most = { desktop: 0, tv: 0, phone: 0 };
    for (const w of DESKTOP) {
      most.desktop = Math.max(most.desktop, sum(w.trees, desktop));
      most.tv = Math.max(most.tv, sum(w.trees.slice(0, TARGET.tv), desktop));
    }
    for (const w of PHONE) most.phone = Math.max(most.phone, sum(w.trees, phone));
    expect(most.phone).toBeLessThan(5000);
    expect(most.phone).toBeGreaterThan(4000);
    // Each tier's meshes draw its own shapes: a phone's trees are a phone's.
    const drawn = (meshes: Mesh[]) => meshes.map((mesh) => mesh.geometry.getAttribute("position").count / 3);
    expect(drawn(made.meshes)).toEqual([desktop.pine, desktop.broad]);
    expect(drawn(phones.meshes)).toEqual([phone.pine, phone.broad]);
    expect(most.desktop).toBeLessThan(41_000);
    expect(most.tv).toBeLessThan(41_000);
  });

  it("sink every foot SUNK m under the ground and stand every tree to its own height over it", () => {
    for (const [meshes, trees] of [[made.meshes, fixed.trees], [phones.meshes, fixedPhone.trees]] as const) {
      byKind(trees).forEach((mine, k) => {
        const lowest = new Map<Spot, number>(), highest = new Map<Spot, number>();
        corners(meshes[k], mine, (_x, y, _z, tree) => {
          lowest.set(tree, Math.min(lowest.get(tree) ?? Infinity, y));
          highest.set(tree, Math.max(highest.get(tree) ?? -Infinity, y));
        });
        for (const tree of mine) {
          // The foot's own middle is SUNK under the ground; a lean tips its rim a few centimetres either way.
          expect(lowest.get(tree)! - (tree.y - SUNK)).toBeGreaterThan(-0.04);
          expect(lowest.get(tree)! - (tree.y - SUNK)).toBeLessThan(0.04);
          // Its top stands its height over the ground, a lean tipping it a few centimetres either way, and under the top its tree gives
          // the camera.
          expect(highest.get(tree)! - tree.y).toBeGreaterThan(tree.tall - 0.05);
          expect(highest.get(tree)! - tree.y).toBeLessThan(tree.tall + 0.05);
          expect(tree.top - tree.y).toBeCloseTo(tree.tall + 0.1, 9);
          expect(Math.hypot(tree.lean[0], tree.lean[1])).toBeLessThanOrEqual(LEAN);
        }
      });
    }
  });

  it("hold every tree inside the bounds it gives the camera: what stands out past its trunk is no further out than its reach, no lower than its base, no higher than its top", () => {
    for (const w of [fixed, fixedPhone, on("1970-12-31"), on("1987-12-30", true)]) {
      const { meshes } = built(w.trees, w.phone);
      // The least room any corner leaves inside its tree's reach and under its top; and, of the corners that stand out past the
      // trunk's foot, over its base: those are its crown.
      let within = Infinity, over = Infinity, under = Infinity;
      byKind(w.trees).forEach((mine, k) => corners(meshes[k], mine, (x, y, z, tree) => {
        const out = Math.hypot(x - tree.x, z - tree.z);
        within = Math.min(within, tree.reach - out);
        under = Math.min(under, tree.top - y);
        if (out > TRUNK_R_MAX + 0.5) over = Math.min(over, y - tree.base);
      }));
      expect(within, w.date).toBeGreaterThanOrEqual(0);
      expect(over, w.date).toBeGreaterThanOrEqual(0);
      expect(under, w.date).toBeGreaterThanOrEqual(0);
      // The bounds are no looser than a lean asks: some crown comes within 0.4 m of its base, and one within a quarter of a metre
      // of its reach, which a tree's own form may leave its crown a little short of.
      expect(over, w.date).toBeLessThan(0.4);
      expect(within, w.date).toBeLessThan(0.25);
      for (const tree of w.trees) {
        expect(tree.wide).toBeGreaterThanOrEqual(CROWN_R[0]);
        expect(tree.wide).toBeLessThanOrEqual(CROWN_R[1]);
        // Its reach is its own crown's: its corners' reach and what its lean carries its top over; never the widest's.
        expect(tree.reach).toBeCloseTo(tree.wide * CROWN_REACH + Math.hypot(tree.lean[0], tree.lean[1]) * (tree.tall + SUNK), 9);
        expect(tree.reach).toBeLessThanOrEqual(CROWN_R_MAX);
      }
    }
    // The widest crown on the tallest tree, leaning its most.
    expect(CROWN_R_MAX).toBeCloseTo(CROWN_R[1] * CROWN_REACH + LEAN * (TALL[1] + SUNK), 12);
    expect(CROWN_R_MAX).toBeLessThan(5);
  });

  it("leave CROWN_BASE m of air under every crown, over the highest ground a walker can stand on under it or within UNDER m of it", () => {
    // So a bear, TOP m tall, walks under any crown, and the boom's foot, HEAD m over the ground, is 2.9 m under it.
    let lowest = Infinity;
    eachTree((t) => {
      let ground = -Infinity;
      for (let dx = -(t.reach + UNDER); dx <= t.reach + UNDER; dx += 0.5) for (let dz = -(t.reach + UNDER); dz <= t.reach + UNDER; dz += 0.5) {
        if (Math.hypot(dx, dz) <= t.reach + UNDER) ground = Math.max(ground, height(t.x + dx, t.z + dz));
      }
      lowest = Math.min(lowest, t.base - ground);
    });
    // The ground under a crown is read at 97 places when its tree is placed, and here every half metre: within 5 cm.
    expect(lowest).toBeGreaterThan(CROWN_BASE - 0.05);
    expect(CROWN_BASE - HEAD).toBeCloseTo(2.9, 9);
    expect(CROWN_BASE - TOP).toBeCloseTo(1.65, 9);
  });

  it("keep every trunk, as high as a bear is tall, within TRUNK_R_MAX of the middle of its foot, where a walk is held TREE_REACH off", () => {
    let widest = 0;
    for (const w of [fixed, fixedPhone, on("1970-12-31"), on("1987-12-30", true)]) {
      const { meshes } = built(w.trees, w.phone);
      byKind(w.trees).forEach((mine, k) => corners(meshes[k], mine, (x, y, z, tree) => {
        if (y < tree.y + TOP) widest = Math.max(widest, Math.hypot(x - tree.x, z - tree.z));
      }));
    }
    expect(widest).toBeLessThanOrEqual(TRUNK_R_MAX);
    // A trunk is no pole: the widest is over half a metre across its half; and the bound is within a third of a metre of it.
    expect(widest).toBeGreaterThan(0.5);
    expect(TRUNK_R_MAX - widest).toBeLessThan(0.33);
    // The widest crown's trunk at its foot, and what the most lean carries it over by a bear's height.
    expect(TRUNK_R_MAX).toBeCloseTo(CROWN_R[1] * TRUNK_FOOT + LEAN * (SUNK + TOP), 12);
    // A bear's furthest point, its nose's tip, outside it.
    expect(TREE_REACH).toBe(SNOUT + TRUNK_R_MAX);
    expect(SNOUT).toBeCloseTo(2.36, 9);
    expect(TREE_REACH).toBeCloseTo(3.418, 9);
  });

  it("stand still: one material for both meshes, with no time in it and nothing that moves a corner over time, which takes the stage's glow no more strongly than level ground at a tree's foot does, and a share of that", () => {
    const uPool = { value: new THREE.Color(0xff7a30) }, scene = new THREE.Scene();
    const asked: unknown[] = [];
    const lit = (material: unknown, stands: unknown) => { asked.push(stands); return takesPool(material, uPool, stands); };
    const { meshes, ...rest } = buildTrees(scene, fixed.trees, { lit, phone: false }) as unknown as Built;
    // One material, lit once, as a thing that stands on the ground, its root SUNK m under it.
    expect(asked).toEqual([{ sunk: SUNK, share: GLOW_SHARE }]);
    expect(meshes).toHaveLength(2);
    expect(meshes[0].material).toBe(meshes[1].material);
    expect(meshes[0].material.vertexColors).toBe(true);
    expect(GLOW_SHARE).toBeLessThan(0.5);
    expect(GLOW_SHARE).toBeGreaterThan(0);
    // The built trees give the world their count and what a walk and its camera keep clear of, and nothing to hand a time to.
    expect(Object.keys(rest).sort()).toEqual(["ceiling", "count", "slide", "trunks"]);
    const plainShader = { vertex: THREE.ShaderLib.lambert.vertexShader as string, fragment: THREE.ShaderLib.lambert.fragmentShader as string };
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: plainShader.vertex, fragmentShader: plainShader.fragment };
    meshes[0].material.onBeforeCompile(shader);
    // The glow is the one thing added to three's own Lambert shader: its colour is the only uniform, and no corner's place is
    // touched, so a tree is drawn where its instance stands it, the same in every frame.
    expect(Object.keys(shader.uniforms)).toEqual(["uPool"]);
    expect(shader.uniforms.uPool).toBe(uPool);
    expect(shader.vertexShader).not.toMatch(/transformed\s*(\.\w+)?\s*[+\-*]?=/);
    expect(shader.vertexShader + shader.fragmentShader).not.toMatch(/uWind|uTime|aSway|sin\(/);
    expect(shader.vertexShader.replace(/\s+/g, " ")).toContain("#include <project_vertex> #ifdef USE_INSTANCING vPoolAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
    // How squarely level ground at its foot turns to the glow: straight up, at the instance's root and SUNK m over it.
    const from = `vec3(${STAGE[0].toFixed(4)}, 9.5000, ${STAGE[1].toFixed(4)})`;
    expect(shader.vertexShader).toContain(`vPoolMost = max(normalize(${from} - (modelMatrix * instanceMatrix[3]).xyz - vec3(0.0, ${SUNK.toFixed(4)}, 0.0)).y, 0.0);`);
    // A face takes the glow by its own angle to it, no more than that ground does, and GLOW_SHARE of it.
    const light = shader.fragmentShader.slice(shader.fragmentShader.indexOf("float poolLit"));
    expect(light.split("\n").slice(0, 3).map((l) => l.trim())).toEqual([
      "float poolLit = max(dot(normal, normalize((viewMatrix * vec4(poolTo, 0.0)).xyz)), 0.0);",
      `poolLit = min(poolLit, vPoolMost) * ${GLOW_SHARE.toFixed(4)};`,
      expect.stringMatching(/^reflectedLight\.directDiffuse \+= uPool \* diffuseColor\.rgb \* poolLit \* /),
    ]);
    for (const text of [shader.vertexShader, shader.fragmentShader]) expect(text).toContain("varying float vPoolMost;");
    // The ground's own light is as it was: by its face's angle alone.
    const ground = { uniforms: {} as Record<string, unknown>, vertexShader: plainShader.vertex, fragmentShader: plainShader.fragment };
    takesPool(new THREE.MeshLambertMaterial(), uPool).onBeforeCompile(ground);
    expect(ground.vertexShader + ground.fragmentShader).not.toContain("vPoolMost");
    expect(ground.fragmentShader).toContain("float poolLit = max(dot(normal, normalize((viewMatrix * vec4(poolTo, 0.0)).xyz)), 0.0);\n        reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
  });

  it("hand the walk the trunks near a place, in one array that is the same every time, and every trunk within the reach asked", () => {
    let fewest = Infinity, most = 0;
    for (const tree of fixed.trees) {
      const x = tree.x + 1.3, z = tree.z - 0.9, near = made.trunks(x, z, TREE_REACH);
      expect(new Set(near).size).toBe(near.length);
      expect(near.some((c) => c.x === tree.x && c.z === tree.z)).toBe(true);
      // Every tree whose foot is within the reach is there, and none from past the squares the reach comes to.
      for (const t of fixed.trees) if (Math.hypot(t.x - x, t.z - z) < TREE_REACH) expect(near.some((c) => c.x === t.x && c.z === t.z)).toBe(true);
      for (const c of near) expect(Math.hypot(c.x - x, c.z - z)).toBeLessThanOrEqual(TREE_REACH + Math.SQRT2 * SQUARE);
      fewest = Math.min(fewest, near.length);
      most = Math.max(most, near.length);
      // The same array, emptied and filled again.
      expect(made.trunks(x, z, TREE_REACH)).toBe(near);
    }
    // A walk's frame tries a handful of trunks, never the island's hundred.
    expect(most).toBeLessThan(fixed.trees.length / 3);
    expect(fewest).toBeGreaterThanOrEqual(1);
    expect(made.trunks(400, 400, TREE_REACH)).toEqual([]);
    // A wider reach takes in more squares: every trunk on the island within the island's width.
    expect(made.trunks(0, 0, 2 * BOUND)).toHaveLength(fixed.trees.length);
  });

  it("stop a walk where no part of the visitor's bear is in a trunk: stood TREE_REACH from each tree of the fixed day and facing it, from 32 ways round it, on a desktop and a phone, every corner of the bear is outside the bark", { timeout: 20000 }, () => {
    const v = new THREE.Vector3();
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      const avatar = buildAvatar(new THREE.Scene(), [], { phone: w.phone, reduced: true }) as unknown as { g: { updateMatrixWorld(force: boolean): void; traverse(see: (o: BearPart) => void): void }; step(x: number, z: number, heading: number, dt: number): void };
      type BearPart = { isMesh?: boolean; matrixWorld: unknown; geometry: { attributes: { position: Corners } } };
      const trunks = shapes(own.meshes, w.trees, true);
      let inside = 0, least = Infinity, corners = 0;
      for (const tree of w.trees) for (let k = 0; k < 32; k++) {
        const a = (k * Math.PI) / 16, x = tree.x + TREE_REACH * Math.cos(a), z = tree.z + TREE_REACH * Math.sin(a), bark = trunks.get(tree)!;
        // The walk's own limits leave it there, at the very edge of the trunk's reach; it faces the trunk (a heading of 0 faces -z).
        avatar.step(x, z, Math.atan2(x - tree.x, z - tree.z), 1 / 60);
        avatar.g.updateMatrixWorld(true);
        avatar.g.traverse((part) => {
          if (!part.isMesh) return;
          const position = part.geometry.attributes.position;
          for (let i = 0; i < position.count; i++) {
            v.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld);
            corners += 1;
            // Only a corner within 1.7 m of the foot's middle can be near the bark: the widest trunk and its lean, and half a metre.
            if (Math.hypot(v.x - tree.x, v.z - tree.z) > TRUNK_R_MAX + 0.65) continue;
            if (within(bark, v.x, v.y, v.z)) inside += 1;
            least = Math.min(least, farFrom(bark, v.x, v.y, v.z));
          }
        });
      }
      expect(inside, w.phone ? "phone" : "desktop").toBe(0);
      // The nose's tip comes nearest: a third of a metre from the bark at the least, since the reach allows for the widest trunk's
      // foot and a nose meets a trunk higher, where it is slimmer; and under a metre at the trunk it comes nearest.
      expect(least).toBeGreaterThan(0.3);
      expect(least).toBeLessThan(0.9);
      expect(corners).toBeGreaterThan(w.trees.length * 32 * 2000);
    }
  });
});

describe("the walk's camera among the trees", () => {
  // What a camera's near plane needs on a desktop's frame (avatar.js eyeRoom): 0.84 m.
  const ROOM = 0.84;
  // A trunk's middle at a height, where its lean has carried it, and the least a camera's point keeps from it.
  const middle = (tree: Spot, y: number) => ({ x: tree.x + tree.lean[0] * (y - tree.y + SUNK), z: tree.z + tree.lean[1] * (y - tree.y + SUNK), r: tree.wide * TRUNK_FOOT + ROOM });

  it("slides a camera level out of a trunk: to its room outside the trunk's widest at the camera's own height, straight out from the trunk's middle there, and leaves one outside it alone", () => {
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) for (const tree of w.trees) {
      // Just over the ground, at a bear's head and at the highest a camera may hang under the crown; and one over that, which is slid
      // as at that height, since under the crown is where it will hang.
      for (const [up, as] of [[1.2, 1.2], [HEAD, HEAD], [tree.base - tree.y - ROOM, tree.base - tree.y - ROOM], [tree.base - tree.y + 5, tree.base - tree.y - ROOM]]) for (let k = 0; k < 4; k++) {
        const y = tree.y + up, { x: cx, z: cz, r } = middle(tree, tree.y + as), a = (k * Math.PI) / 2 + 0.2;
        const p = { x: cx + 0.4 * r * Math.cos(a), y, z: cz + 0.4 * r * Math.sin(a) };
        own.slide(p, ROOM);
        expect(Math.hypot(p.x - cx, p.z - cz)).toBeCloseTo(r, 9);
        expect([(p.x - cx) / r, (p.z - cz) / r]).toEqual([expect.closeTo(Math.cos(a), 9), expect.closeTo(Math.sin(a), 9)]);
        expect(p.y).toBe(y);
        const out = { x: cx + (r + 0.01) * Math.cos(a), y, z: cz + (r + 0.01) * Math.sin(a) }, was = { ...out };
        own.slide(out, ROOM);
        expect(out).toEqual(was);
      }
    }
    // A lean carries a trunk's middle half a metre by its crown's base: the keep-out goes with it.
    const most = Math.max(...fixed.trees.map((t) => Math.hypot(t.lean[0], t.lean[1]) * (t.base - t.y + SUNK)));
    expect(most).toBeGreaterThan(0.4);
    // Right on a trunk's middle there is no line out: it steps out all the same.
    const tree = fixed.trees[0], { x: cx, z: cz, r } = middle(tree, tree.y + 3), on = { x: cx, y: tree.y + 3, z: cz };
    made.slide(on, ROOM);
    expect(Math.hypot(on.x - cx, on.z - cz)).toBeCloseTo(r, 9);
  });

  it("leaves a slid camera its room from every part of the trunk as it is drawn, at any height under the crown, from any side", () => {
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      const trunks = shapes(own.meshes, w.trees, true);
      let least = Infinity;
      for (const tree of w.trees) for (let k = 0; k < 8; k++) for (const up of [1.2, 3, 5, tree.base - tree.y - ROOM]) {
        // From a hand's width off the trunk's middle, inside the bark.
        const a = (k * Math.PI) / 4, y = tree.y + up, { x: cx, z: cz } = middle(tree, y), p = { x: cx + 0.1 * Math.cos(a), y, z: cz + 0.1 * Math.sin(a) };
        own.slide(p, ROOM);
        least = Math.min(least, farFrom(trunks.get(tree)!, p.x, p.y, p.z));
      }
      // The keep-out is reckoned from a trunk's widest, at its foot: higher up the bark is further off. Never nearer than the room.
      expect(least).toBeGreaterThanOrEqual(ROOM - 0.005);
      expect(least).toBeLessThan(ROOM + 0.35);
    }
  });

  it("takes a camera round a trunk that stands square in its way, by as far as the trunk stopped it and on the side it is going; and only puts out one that is going no further than the trunk", () => {
    const tree = fixed.trees[3], y = tree.y + 3, { x: cx, z: cz, r } = middle(tree, y);
    for (const side of [1, -1]) {
      // Going on to a place 10 m past the trunk and a little to one side, it has stepped 0.3 m into the keep-out, dead on the middle.
      const p = { x: cx - r + 0.3, y, z: cz };
      made.slide(p, ROOM, { x: cx + 10, z: cz + 0.5 * side });
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeCloseTo(r, 9);
      // Put out to the keep-out's edge, and round it by 0.3 m toward that side.
      expect(Math.atan2((p.z - cz) * side, cx - p.x)).toBeCloseTo(0.3 / r, 9);
    }
    // Dead on, with its place straight through the middle: it goes round all the same, one way, so nothing holds it behind the trunk.
    const dead = { x: cx - r + 0.3, y, z: cz };
    made.slide(dead, ROOM, { x: cx + 10, z: cz });
    expect(Math.abs(Math.atan2(dead.z - cz, cx - dead.x))).toBeCloseTo(0.3 / r, 9);
    // Its place is inside the keep-out, the trunk standing where it would hang: it is put straight out, and a second time moves it
    // nowhere, so it comes to rest there.
    const held = { x: cx - r + 0.3, y, z: cz + 0.2 };
    made.slide(held, ROOM, { x: cx + 0.5, z: cz + 0.3 });
    expect(Math.atan2(held.z - cz, held.x - cx)).toBeCloseTo(Math.atan2(0.2, -r + 0.3), 9);
    const rest = { ...held };
    made.slide(held, ROOM, { x: cx + 0.5, z: cz + 0.3 });
    expect(held.x).toBeCloseTo(rest.x, 12);
    expect(held.z).toBeCloseTo(rest.z, 12);
  });

  it("brings an easing camera round a trunk its place passes straight through: never inside the keep-out, past it within a second and a half, and never further in a frame than half a metre, which is under three times what it would move with no trunk there", () => {
    const tree = fixed.trees[3], y = tree.y + 3, { x: cx, z: cz, r } = middle(tree, y), k = 1 - Math.exp(-1 / 60 / 0.2);
    for (const pace of [0.2, 0.32]) for (const off of [0, 1e-7, 0.4]) {
      // Its place runs along x through the trunk's middle, or a hair or 0.4 m beside it, at a walk's pace and a run's; the camera
      // eases after it as the boom does (avatar.js), from 6 m short of the trunk.
      const want = { x: cx - 6, z: cz + off }, cam = { x: cx - 6 - pace / k, y, z: cz + off }, free = { x: cam.x };
      let most = 0, freeMost = 0, nearest = Infinity, passed = -1;
      for (let f = 0; f < 200 && passed < 0; f++) {
        want.x += pace;
        const from = { x: cam.x, z: cam.z }, freeFrom = free.x;
        cam.x += (want.x - cam.x) * k; cam.z += (want.z - cam.z) * k;
        free.x += (want.x - free.x) * k;
        made.slide(cam, ROOM, want);
        most = Math.max(most, Math.hypot(cam.x - from.x, cam.z - from.z));
        freeMost = Math.max(freeMost, free.x - freeFrom);
        nearest = Math.min(nearest, Math.hypot(cam.x - cx, cam.z - cz));
        if (cam.x > cx + r) passed = f;
      }
      expect(nearest, `pace ${pace}, ${off} m beside`).toBeGreaterThanOrEqual(r - 1e-9);
      // The place reaches the trunk after 30 frames at a walk; the camera is past it within 90.
      expect(passed, `pace ${pace}, ${off} m beside`).toBeGreaterThan(0);
      expect(passed, `pace ${pace}, ${off} m beside`).toBeLessThan(90);
      // Going round is further than going through, so it falls behind its place and eases after it the faster.
      expect(most, `pace ${pace}, ${off} m beside`).toBeLessThan(freeMost * 3);
      expect(most, `pace ${pace}, ${off} m beside`).toBeLessThan(0.75);
    }
  });

  it("gives the camera a ceiling under the crowns: its room under a crown's base beneath it, a metre higher for each metre outside the crown's circle, the lowest of the crowns near, and none where no crown is that near", () => {
    const tree = fixed.trees[5], alone = built([tree]);
    // One tree by itself: under it, at its rim, and out from it.
    for (const [out, rise] of [[-tree.reach, 0], [-1, 0], [0, 0], [1, 1], [3, 3], [12.5, 12.5]]) {
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7, x = tree.x + (tree.reach + out) * Math.cos(a), z = tree.z + (tree.reach + out) * Math.sin(a);
        expect(alone.ceiling(x, tree.base + 40, z, ROOM)).toBeCloseTo(tree.base - ROOM + rise, 9);
      }
    }
    // A crown is found from as far off as it could lower the ceiling under the camera, however high the camera: 55 m out, from 60 m
    // over its base; and from nearer the camera's own height it is not looked for, since it could not.
    expect(alone.ceiling(tree.x + tree.reach + 55, tree.base + 60, tree.z, ROOM)).toBeCloseTo(tree.base - ROOM + 55, 9);
    expect(alone.ceiling(tree.x + tree.reach + 55, tree.base, tree.z, ROOM)).toBe(Infinity);
    expect(made.ceiling(400, 30, 400, ROOM)).toBe(Infinity);
    // Among all the fixed day's trees, on each tier: at places all over the groves and at heights from a bear's head to well over the
    // crowns, the ceiling is the lowest any crown gives, wherever that is under the camera; elsewhere it is no lower than the camera.
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      let lowered = 0;
      for (const t of w.trees) for (let k = 0; k < 6; k++) for (const up of [HEAD, 9, 30]) {
        const far = [0, 2, 4.5, 7, 14, 30][k], x = t.x + far * Math.cos(k), z = t.z + far * Math.sin(k), y = height(x, z) + up;
        const lowest = least(w.trees.map((c) => c.base - ROOM + Math.max(0, Math.hypot(x - c.x, z - c.z) - c.reach))), got = own.ceiling(x, y, z, ROOM);
        if (lowest < y) { expect(got).toBeCloseTo(lowest, 9); lowered += 1; } else expect(got).toBeGreaterThanOrEqual(y);
      }
      expect(lowered).toBeGreaterThan(w.trees.length * 4);
    }
  });

  it("keeps every crown's ceiling over what the ground asks of the camera, 1.2 m, under the crown and for 30 m round it, with room for the widest frame's near plane", () => {
    // A frame twice as wide as a desktop's needs 1.3 m (avatar.js eyeRoom).
    const wide = 1.3;
    let lowest = Infinity;
    eachTree((t, w) => {
      if (w !== fixed && w !== fixedPhone && w !== on("1973-03-30") && w !== on("1986-07-07", true)) return;
      for (let dx = -(t.reach + 30); dx <= t.reach + 30; dx += 1) for (let dz = -(t.reach + 30); dz <= t.reach + 30; dz += 1) {
        const x = t.x + dx, z = t.z + dz;
        if (Math.hypot(x, z) > BOUND) continue;
        lowest = Math.min(lowest, t.base - wide + Math.max(0, Math.hypot(dx, dz) - t.reach) - height(x, z) - 1.2);
      }
    });
    // Under a crown the ceiling is 6.5 m less that room over the highest ground there; and nowhere round one does the ground climb a
    // metre in a metre for long enough to meet it.
    expect(lowest).toBeGreaterThan(3);
    expect(lowest).toBeLessThan(CROWN_BASE - wide - 1.2 + 0.1);
  });

  it("moves the walk's camera only a little at a time: on a desktop and a phone, walking, running, backing, stepping sideways and turning through every grove, it is never in a trunk or a crown or within its near plane's reach of one, never nearer the head than the boom's least, and never moves further in a frame than the same walk's does with no trees and half a metre", () => {
    for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      const phone = w.phone, trees = w.trees, all = shapes(own.meshes, trees);
      // Two cameras on the one walk: the world's, among the trees, and one that no tree moves.
      const among = buildAvatar(new THREE.Scene(), [], { phone, reduced: false, columns: [STAGE_COLUMN] as never[], slide: own.slide as never, ceiling: own.ceiling as never });
      const bare = buildAvatar(new THREE.Scene(), [], { phone, reduced: false, columns: [STAGE_COLUMN] as never[] });
      const camera = new THREE.PerspectiveCamera(phone ? 75 : 60, phone ? 390 / 844 : 1440 / 900, 0.5, 900), other = camera.clone();
      const room = eyeRoom(camera), limits = walkLimits([], own.trunks, TREE_REACH);
      const was = new THREE.Vector3(), otherWas = new THREE.Vector3(), pivot = new THREE.Vector3();
      let frames = 0, most = 0, bareMost = 0, nearestHead = Infinity, nearestTree = Infinity, lowest = Infinity, dipped = 0, slid = 0;
      const inside: string[] = [];
      // Through each grove's middle four ways: ahead at a walk looking level; ahead at a run looking down as far as a walker may;
      // backwards at a run looking down, the camera going first; and sideways, the camera trailing beside the way. Then once round on
      // the spot, half-way out from the grove's middle.
      for (const [gx, gz, r] of GROVES) for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI) / 4 + 0.3, along = Math.atan2(Math.cos(a), Math.sin(a));
        const [spd, side, run, pitch, turn, face] = [[1, 0, 1, 0, 0, 0], [1, 0, 1.6, -0.8, 0, 0], [-1, 0, 1.6, -0.8, 0, Math.PI], [0, 1, 1, 0.4, 0, Math.PI / 2], [0, 0, 1, 0, 1, 0]][k];
        const walker = k === 4 ? { x: gx + 0.5 * r * Math.cos(a), z: gz + 0.5 * r * Math.sin(a), heading: along, pitch } : { x: gx + (r + 12) * Math.cos(a), z: gz + (r + 12) * Math.sin(a), heading: along + face, pitch };
        const pace = (12 * run) / 60, last = k === 4 ? 240 : Math.round((2 * r + 24) / pace);
        confine(walker, limits);
        for (let f = 0; f < last; f++) {
          if (f > 0) stride(walker, [spd, side, turn, run > 1 ? 1 : 0, 0], limits);
          among.step(walker.x, walker.z, walker.heading, 1 / 60);
          bare.step(walker.x, walker.z, walker.heading, 1 / 60);
          among.boom(camera, walker, 1 / 60, f === 0);
          bare.boom(other, walker, 1 / 60, f === 0);
          const { x, y, z } = camera.position;
          // The frames after a cut settle the bear's pace and the boom: they count for where the camera is, not for how it moved.
          if (f > 1) { most = Math.max(most, camera.position.distanceTo(was)); bareMost = Math.max(bareMost, other.position.distanceTo(otherWas)); }
          was.copy(camera.position); otherWas.copy(other.position);
          for (const t of trees) {
            if (Math.hypot(x - t.x, z - t.z) > t.reach + 2 || y > t.top + 2) continue;
            const tris = all.get(t)!;
            if (within(tris, x, y, z)) inside.push(`${phone ? "phone" : "desktop"} grove ${gx},${gz} way ${k} frame ${f}`);
            nearestTree = Math.min(nearestTree, farFrom(tris, x, y, z));
          }
          nearestHead = Math.min(nearestHead, camera.position.distanceTo(pivot.set(walker.x, height(walker.x, walker.z) + HEAD, walker.z)));
          lowest = Math.min(lowest, y - height(x, z));
          if (other.position.y - y > 0.5) dipped += 1;
          if (Math.hypot(other.position.x - x, other.position.z - z) > 0.5) slid += 1;
          frames += 1;
        }
      }
      const tier = phone ? "phone" : "desktop";
      expect(inside).toEqual([]);
      // Clear of bark and leaves by what the near plane needs: its corners' reach, with eyeRoom's hand to spare.
      expect(nearestTree, tier).toBeGreaterThan(room - 0.1);
      expect(room).toBeCloseTo(phone ? 0.75 : 0.84, 2);
      expect(nearestHead, tier).toBeGreaterThanOrEqual(LEAST - 1e-6);
      // Never under what the boom keeps over the ground at the camera.
      expect(lowest, tier).toBeGreaterThanOrEqual(1.2 - 1e-6);
      // No cut: the furthest it moves in a sixtieth of a second is what the same walk moves it with no trees and under half a metre
      // more, as when it comes down under a crown while it swings round: under a metre in all, where a cut is the boom's length.
      expect(most, tier).toBeLessThan(bareMost + 0.5);
      expect(most, tier).toBeLessThan(1);
      // And the trees did move it: under a crown for some of the walk, and round a trunk for some.
      expect(dipped / frames, tier).toBeGreaterThan(0.05);
      expect(slid, tier).toBeGreaterThan(20);
      expect(frames).toBeGreaterThan(9000);
    }
  });

  it("asks the trees with what its near plane needs and the place it is easing to, and asks again where a column has drawn the camera in or raised it to where a tree stands", () => {
    type Ask = { room: number; toward: { x: number; z: number } | null };
    const asks: Ask[] = [], rooms: number[] = [];
    const spy = buildAvatar(new THREE.Scene(), [], {
      phone: false, reduced: false,
      slide: ((_p: Point, room: number, toward: { x: number; z: number } | null) => { asks.push({ room, toward: toward && { x: toward.x, z: toward.z } }); }) as never,
      ceiling: ((_x: number, _y: number, _z: number, room: number) => { rooms.push(room); return Infinity; }) as never,
    });
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.5, 900);
    spy.boom(camera, { x: 10, z: 20, heading: 0.7, pitch: 0.1 }, 1 / 60, true);
    // The corners of the near plane, half a metre off, stand 0.74 m from the camera in a frame 1.6 times as wide as it is high; and
    // a hand more.
    expect(eyeRoom(camera)).toBeCloseTo(0.5 * Math.hypot(1, Math.tan(Math.PI / 6), 1.6 * Math.tan(Math.PI / 6)) + 0.1, 12);
    expect(eyeRoom(camera)).toBeCloseTo(0.84, 2);
    // Once for the place it eases to, the boom's length behind the bear, 0.25 rad up; no tree moved it, so not again.
    expect(asks).toEqual([{ room: eyeRoom(camera), toward: { x: expect.closeTo(10 + Math.sin(0.7) * 11 * Math.cos(0.25), 9), z: expect.closeTo(20 + Math.cos(0.7) * 11 * Math.cos(0.25), 9) } }]);
    expect(rooms).toEqual([eyeRoom(camera)]);

    // A tree of the fixed day with level ground west of it, the bear 6 m east of its trunk and facing east, so the boom runs west
    // past the trunk; and a column, as the stage's is one, whose side is 0.5 m past where the trunk's keep-out begins: it draws the
    // camera in to its side, inside the keep-out.
    const room = eyeRoom(camera);
    const tree = fixed.trees.find((t) => Math.abs(height(t.x - 4, t.z) - t.y) < 0.3 && Math.abs(height(t.x + 6, t.z) - t.y) < 0.3)!;
    const walker = { x: tree.x + 6, z: tree.z, heading: -Math.PI / 2, pitch: 0.35 };
    for (const ours of [true, false]) {
      const avatar = buildAvatar(new THREE.Scene(), [], {
        phone: false, reduced: false, columns: [{ x: tree.x - 2.2, z: tree.z, r: 1.2, top: 40 }] as never[],
        ...(ours ? { slide: made.slide as never, ceiling: made.ceiling as never } : {}),
      });
      avatar.step(walker.x, walker.z, walker.heading, 1 / 60);
      avatar.boom(camera, walker, 1 / 60, true);
      const { x, y, z } = camera.position, mid = { x: tree.x + tree.lean[0] * (y - tree.y + SUNK), z: tree.z + tree.lean[1] * (y - tree.y + SUNK) };
      const off = Math.hypot(x - mid.x, z - mid.z);
      // With no trees to ask it hangs half a metre short of the column, in the trunk; with them it is put out of the trunk's keep-out.
      if (ours) expect(off).toBeGreaterThanOrEqual(tree.wide * TRUNK_FOOT + room - 1e-9);
      else expect(off).toBeLessThan(tree.wide * TRUNK_FOOT);
    }
    // And a low column half a metre behind the bear, which stands under the crown: the boom rises steeply to pass over it, into
    // the crown with no trees to ask; with them the camera stops under the crown's base.
    const under = { x: tree.x + TREE_REACH + 0.2, z: tree.z, heading: -Math.PI / 2, pitch: 0 }, pivot = height(under.x, under.z) + HEAD;
    for (const ours of [true, false]) {
      const avatar = buildAvatar(new THREE.Scene(), [], {
        phone: false, reduced: false, columns: [{ x: under.x - 1.5, z: under.z, r: 1, top: pivot + 2.2 }] as never[],
        ...(ours ? { slide: made.slide as never, ceiling: made.ceiling as never } : {}),
      });
      avatar.step(under.x, under.z, under.heading, 1 / 60);
      avatar.boom(camera, under, 1 / 60, true);
      if (ours) expect(camera.position.y).toBeLessThan(tree.base - 0.3);
      else expect(camera.position.y).toBeGreaterThan(tree.base + 1);
    }
    // A camera that another camera left a metre from the head, with a ceiling lower still: the ceiling does not bring it down,
    // which would be nearer the head than the boom's least; and nothing raises it either.
    const held = buildAvatar(new THREE.Scene(), [], { phone: false, reduced: false, ceiling: (() => pivot + 0.5) as never });
    held.step(under.x, under.z, under.heading, 1 / 60);
    held.settle(new THREE.Vector3(under.x - 1, pivot + 1, under.z), new THREE.Vector3(under.x + 6, pivot, under.z));
    held.boom(camera, under, 1 / 60, false);
    expect(camera.position.y).toBeGreaterThan(pivot + 1);
    expect(camera.position.y).toBeLessThan(pivot + 1.5);
    expect(Math.hypot(camera.position.x - under.x, camera.position.z - under.z)).toBeLessThan(LEAST - 0.5);
  });

  it("takes the shoot's two grove stills from where a walk may stand, with trees of the grove's own kind in the view from the visitor's eye, on a desktop and a phone", () => {
    expect(Object.keys(GROVE_POSES)).toEqual(["fixed-grove-pines", "fixed-grove-broad"]);
    for (const [shot, [x, z, heading, pitch]] of Object.entries(GROVE_POSES as Record<string, number[]>)) for (const [w, own] of [[fixed, made], [fixedPhone, phones]] as const) {
      const at = `${shot} on a ${w.phone ? "phone" : "desktop"}`, kind = shot.endsWith("pines") ? "pine" : "broad";
      // The walk leaves the visitor where the pose puts it: outside every trunk's reach, by a metre and more.
      const stood = { x, z, heading };
      confine(stood, walkLimits([], own.trunks, TREE_REACH));
      expect(stood, at).toEqual({ x, z, heading });
      expect(least(w.trees.map((t) => Math.hypot(t.x - x, t.z - z))), at).toBeGreaterThan(TREE_REACH + 1);
      // The view, as the still is shot, in first person (main.js placeWalker): from FIRST_EYE m over the ground, the way the pose
      // faces and tilts. The trees whose trunks, 4 m up, stand in the frame within 60 m.
      const camera = new THREE.PerspectiveCamera(w.phone ? 75 : 60, w.phone ? 390 / 844 : 1440 / 900, 0.5, 900), y = height(x, z) + FIRST_EYE;
      camera.position.set(x, y, z);
      camera.lookAt(x - Math.sin(heading) * Math.cos(pitch), y + Math.sin(pitch), z - Math.cos(heading) * Math.cos(pitch));
      camera.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      const seen = w.trees.filter((t) => { v.set(t.x, t.y + 4, t.z).project(camera); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 && Math.hypot(t.x - x, t.z - z) < 60; });
      expect(seen.length, at).toBeGreaterThanOrEqual(w.phone ? 3 : 5);
      expect(seen.filter((t) => t.kind === kind).length, at).toBeGreaterThan(seen.length * 0.6);
      // And one of them near enough to stand tall in the frame.
      expect(least(seen.map((t) => Math.hypot(t.x - x, t.z - z))), at).toBeLessThan(25);
    }
  });
});

describe("what grows round the trees", () => {
  it("grows no tuft and lays no stone within TRUNK_ROOM of a trunk, so no stone lies against one, and the island hands back the light the trees take", () => {
    for (const [grid, w] of [[80, fixed], [52, fixedPhone]] as const) {
      const scene = new THREE.Scene(), trees = w.trees;
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const { flora, lit } = buildIsland(scene, grid, w.phone, loop, (x: number, z: number) => w.near(x, z, TRUNK_ROOM));
      const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), corner = new THREE.Vector3();
      for (const mesh of [flora.tufts, flora.stones]) {
        let nearest = Infinity;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          at.setFromMatrixPosition(matrix);
          nearest = Math.min(nearest, least(trees.map((t) => Math.hypot(at.x - t.x, at.z - t.z))));
        }
        expect(nearest).toBeGreaterThanOrEqual(TRUNK_ROOM);
        // And no further: the grass comes up to a metre of that.
        if (mesh === flora.tufts) expect(nearest).toBeLessThan(TRUNK_ROOM + 1);
      }
      // No stone reaches further from where it lies than STONE_REACH, and the largest comes within a third of a metre of it.
      const stone = flora.stones.geometry.getAttribute("position");
      let reach = 0;
      for (let i = 0; i < flora.stones.count; i++) {
        flora.stones.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        for (let k = 0; k < stone.count; k++) reach = Math.max(reach, corner.fromBufferAttribute(stone, k).applyMatrix4(matrix).distanceTo(at));
      }
      expect(reach).toBeLessThanOrEqual(STONE_REACH);
      if (!w.phone) expect(reach).toBeGreaterThan(STONE_REACH - 0.33);
      // The same land grows more round the trunks when it is told of none.
      const bare = new THREE.Scene();
      bare.fog = new THREE.Fog(0x000000, 100, 400);
      const without = buildIsland(bare, grid, w.phone, loop).flora;
      let inside = 0;
      for (let i = 0; i < without.tufts.count; i++) {
        without.tufts.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        if (w.near(at.x, at.z, TRUNK_ROOM)) inside += 1;
      }
      expect(inside).toBeGreaterThan(0);
      // The light: a material takes the stage's glow, as takesPool gives it, the ground's way or a standing thing's.
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: THREE.ShaderLib.lambert.fragmentShader as string };
      lit(new THREE.MeshLambertMaterial()).onBeforeCompile(shader);
      expect(shader.uniforms.uPool).toBeDefined();
      expect(shader.fragmentShader).toContain("uniform vec3 uPool;");
      expect(shader.fragmentShader).not.toContain("vPoolMost");
      const standing = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: THREE.ShaderLib.lambert.fragmentShader as string };
      lit(new THREE.MeshLambertMaterial(), { sunk: 1, share: 0.5 }).onBeforeCompile(standing);
      expect(standing.uniforms.uPool).toBe(shader.uniforms.uPool);
      expect(standing.fragmentShader).toContain("poolLit = min(poolLit, vPoolMost) * 0.5000;");
    }
    // The widest trunk and the largest stone's reach.
    expect(TRUNK_ROOM).toBe(TRUNK_R_MAX + STONE_REACH);
  });
});
