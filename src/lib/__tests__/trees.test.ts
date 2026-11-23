import { readdirSync, readFileSync } from "fs";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { AS_TITLES } from "../../../.github/screenshots/near.mjs";
import { boomLength, buildAvatar, HEAD, TOP } from "../../../public/world/avatar.js";
import { BODY_REACH, CLEAR, enterColumn, outside } from "../../../public/world/collide.js";
import { STONE_REACH } from "../../../public/world/flora.js";
import { BOUND, CAVES, height, STAGE, STAGE_COLUMN, STAGE_REACH, TEST_POSES, TRAILHEAD } from "../../../public/world/ground.js";
import { buildIsland as worldIsland, FEATHER, offTracks, RING, takesPool as worldPool } from "../../../public/world/island.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { BEAR_GAP, confine, walkLimits as worldLimits } from "../../../public/world/modes.js";
import { buildPath, buildWalkLine, layout, nearStand, outline, placeLandmarks } from "../../../public/world/path.js";
import { CRANE, DESCENT_FROM, postPose } from "../../../public/world/pose.js";
import { onCrowdGround } from "../../../public/world/seats.js";
import {
  BASE_FRAC, broadGeometry, broadLobes, buildTrees, cameraWays, CAVE_ROOM, CROWD_ROOM, CROWN_BASE, CROWN_R, CROWN_R_MAX, CROWN_REACH, EYE_ROOM, GLOW_SHARE, grove,
  GROVES, LANDMARK_ROOM, LEAN, LINE_ROOM, LOBE_ROUGH, MIN_APART, NEAR, NY_MIN, PATH_ROOM, pineGeometry, placeTrees, RING_ROOM, RULES, SIGHT_HALF, SQUARE, STAGE_ROOM, SUNK, SWAY,
  TALL, TARGET, TRACK_ROOM, TREE_REACH, TRUNK_FOOT, TRUNK_R_MAX, TRUNK_ROOM, UNDER, VIEW_HALF,
} from "../../../public/world/trees.js";

// The trees are placed here as main.js places them: on the island's own path and bears' line, round a show's landmarks, clear of the
// ways of a tier's cameras. Every show with a map is tried, 38 of them, once as a desktop has it (a TV draws the first 75 of a
// desktop's) and once as a phone has it, whose landmarks have fewer faces and whose cameras stand elsewhere. The trees are placed once
// for each, before the tests, and every test reads those.

type Spot = { x: number; y: number; z: number; tall: number; wide: number; turn: number; lean: number[]; kind: string; tint: number; reach: number; base: number; top: number };
type View = { from: number[]; to: number[]; half: number };
type Mark = { x: number; z: number; rot: number; poly: number[][] };
type Column = { x: number; z: number; r: number; top: number; base?: number };
type Stand = { x: number; z: number; to: number[]; d: number };
type Ask = { count: number; loop: number[][]; line: number[][]; landmarks: Mark[]; eyes: number[][]; views: View[]; groves?: (x: number, z: number) => { thick: number; pines: number } };
// The trees' own functions, with the shapes of what they take and give, which the world's plain modules do not spell out.
const waysOf = cameraWays as unknown as (ask: { line: unknown; height: unknown; stands: Stand[]; phone: boolean; bears: number[] }) => { eyes: number[][]; views: View[] };
const placed = placeTrees as unknown as (ask: Ask) => { spots: Spot[]; near(x: number, z: number, r: number): boolean };
const rules = RULES as unknown as Record<string, (x: number, z: number, ctx: unknown) => boolean>;
const walkLimits = worldLimits as unknown as (bears: { x: number; z: number }[], trees: (x: number, z: number, r: number) => { x: number; z: number }[], treeReach: number) => ReturnType<typeof worldLimits>;
type Lit = { onBeforeCompile(shader: unknown): void };
const takesPool = worldPool as unknown as (material: unknown, uPool: unknown, stands?: unknown) => Lit;
type Flock = { count: number; getMatrixAt(i: number, m: unknown): void; geometry: { getAttribute(name: string): Corners } };
const buildIsland = worldIsland as unknown as (scene: unknown, grid: number, phone: boolean, loop: number[][], trunks?: (x: number, z: number) => boolean) => { flora: { tufts: Flock; stones: Flock }; lit(material: unknown, stands?: unknown): Lit };
type Built = { count: number; meshes: Mesh[]; wind(time: number): void; columns(x: number, z: number, into: Column[]): Column[]; trunks(x: number, z: number, r: number): Column[] };
type Corners = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
type Mesh = {
  isInstancedMesh: boolean; count: number; castShadow: boolean; frustumCulled: boolean; getMatrixAt(i: number, m: unknown): void;
  geometry: { groups: unknown[]; getAttribute(name: string): Corners };
  material: { vertexColors: boolean; onBeforeCompile(shader: unknown): void };
};

const MAPS = new URL("../../../public/maps/", import.meta.url);
const DATES = readdirSync(MAPS).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", ""));
const FIXED = "1986-07-04";
const path = buildPath(), line = buildWalkLine(path, 7);
const loop = Array.from({ length: Math.ceil(path.curveLength / 2) }, (_, k) => { const p = path.at((2 * k) / path.curveLength); return [p.x, p.z]; });
const linePoints = Array.from({ length: Math.ceil(line.length) }, (_, d) => { const p = line.at(d); return [p.x, p.z]; });
// How many bears a tier can show, its own number and each the downgrade leaves (main.test.ts holds main.js to these, by the ladder).
const bearsOf = (phone: boolean) => (phone ? [3, 1] : [5, 3, 1]);

// A show's world as main.js gathers it for a tier's trees: its landmarks placed, their outlines, the stands the near views are taken
// from, the ways of the tier's cameras, and the tier's trees placed by them. `as` builds some songs' landmarks for other titles, as
// ?as=K:Title does.
function world(date: string, phone = false, as: [number, string][] = []) {
  const map = JSON.parse(readFileSync(new URL(`${date}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
  const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
  // The fixed day's second set opens at track 7; the maps do not say where another show's does, so it is taken to open partway.
  const landmarkU = layout(tracks, date === FIXED ? 7 : Math.floor(tracks.length * 0.45), path);
  const builders = makeBuilders(phone), titles = new Map(as);
  const landmarks = placeLandmarks(new THREE.Scene(), path, tracks.map((t, k) => ({ ...t, title: titles.get(k) ?? t.title })), true, builders, landmarkU, line) as { position: { x: number; y: number; z: number }; rotation: { y: number } }[];
  const marks: Mark[] = landmarks.map((g) => ({ x: g.position.x, z: g.position.z, rot: g.rotation.y, poly: outline(g, builders.moving) }));
  const stands: Stand[] = landmarks.flatMap((g, k) => { const s = nearStand(path, landmarkU, landmarks, k); return s ? [{ x: s.x, z: s.z, to: [g.position.x, g.position.z], d: line.dOf(landmarkU[k]) }] : []; });
  const ways = waysOf({ line, height, stands, phone, bears: bearsOf(phone) });
  const ask: Ask = { count: phone ? TARGET.phone : TARGET.desktop, loop, line: linePoints, landmarks: marks, ...ways };
  const { spots, near } = placed(ask);
  return { date, phone, marks, stands, ways, ask, trees: spots, near };
}
type World = ReturnType<typeof world>;
// A stand-in for the light the ground takes, and the trees built with it.
const plain = (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; };
const built = (trees: Spot[], phone = false) => { const scene = new THREE.Scene(); return { scene, ...(buildTrees(scene, trees, { lit: plain, phone }) as unknown as Built) }; };

// Every show as a desktop has it and as a phone has it; the fixed day's of each; and the fixed day's trees built.
let DESKTOP: World[], PHONE: World[], WORLDS: World[], fixed: World, fixedPhone: World, made: ReturnType<typeof built>, phones: ReturnType<typeof built>;
beforeAll(() => {
  DESKTOP = DATES.map((date) => world(date));
  PHONE = DATES.map((date) => world(date, true));
  WORLDS = [...DESKTOP, ...PHONE];
  fixed = DESKTOP.find((w) => w.date === FIXED)!;
  fixedPhone = PHONE.find((w) => w.date === FIXED)!;
  made = built(fixed.trees);
  phones = built(fixedPhone.trees, true);
});

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
// Every corner of every tree a mesh draws, where its instance puts it: [x, y, z, aSway, the tree].
function corners(mesh: Mesh, trees: Spot[], see: (x: number, y: number, z: number, sway: number, tree: Spot) => void) {
  const matrix = new THREE.Matrix4(), v = new THREE.Vector3(), position = mesh.geometry.getAttribute("position"), sway = mesh.geometry.getAttribute("aSway");
  for (let k = 0; k < mesh.count; k++) {
    mesh.getMatrixAt(k, matrix);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      see(v.x, v.y, v.z, sway.getX(i), trees[k]);
    }
  }
}
const byKind = (trees: Spot[]) => ["pine", "broad"].map((kind) => trees.filter((t) => t.kind === kind));

describe("where the trees stand", () => {
  it("draws each tier its own number of trees on every show, the same ones on every visit, a TV's the first of a desktop's, and a phone's by its own cameras", () => {
    // A show whose landmarks left less room than the tier's count would draw fewer: none does.
    for (const w of DESKTOP) expect(w.trees, w.date).toHaveLength(TARGET.desktop);
    for (const w of PHONE) expect(w.trees, w.date).toHaveLength(TARGET.phone);
    expect(TARGET).toEqual({ desktop: 100, tv: 75, phone: 45 });
    for (const w of [fixed, DESKTOP[5], PHONE[20]]) {
      expect(placed(w.ask).spots).toEqual(w.trees);
      // With the same cameras' ways, fewer are the first of more: a TV's 75 of a desktop's 100.
      expect(placed({ ...w.ask, count: w.phone ? 20 : TARGET.tv }).spots).toEqual(w.trees.slice(0, w.phone ? 20 : TARGET.tv));
    }
    // A phone's cameras stand elsewhere, so its trees are placed by other ways and are not the first of a desktop's.
    expect(fixedPhone.trees.map((t) => [t.x, t.z])).not.toEqual(fixed.trees.slice(0, TARGET.phone).map((t) => [t.x, t.z]));
    expect(fixedPhone.ways.views.length).toBeLessThan(fixed.ways.views.length);
  });

  it("stands them in groves with meadows between: most of them in a grove's thick middle, and some of each kind", () => {
    for (const w of WORLDS) {
      const thick = w.trees.filter((t) => grove(t.x, t.z).thick === 1).length, lone = w.trees.filter((t) => grove(t.x, t.z).thick === 0).length;
      expect(thick, w.date).toBeGreaterThan(w.trees.length / 2);
      expect(lone, w.date).toBeLessThan(w.trees.length / 5);
      const pines = w.trees.filter((t) => t.kind === "pine").length;
      expect(pines, w.date).toBeGreaterThan(w.trees.length * 0.25);
      expect(pines, w.date).toBeLessThan(w.trees.length * 0.75);
    }
    // A tree alone, outside every grove, is broad-crowned; and every grove has trees in it.
    expect(grove(0, -60)).toEqual({ thick: 0, pines: 0 });
    for (const [x, z, r] of GROVES) expect(fixed.trees.some((t) => Math.hypot(t.x - x, t.z - z) < r), `the grove at ${x}, ${z}`).toBe(true);
  });

  it("keeps PATH_ROOM from the setlist's path, so the widest crown stands 4 m back from it", () => {
    // The path is given to the trees a point every 2 m; between two of them it comes 6 cm nearer.
    const fine = Array.from({ length: Math.ceil(path.curveLength * 2) }, (_, k) => path.at(k / 2 / path.curveLength));
    for (const w of WORLDS) expect(leastFrom(fine, w.trees), w.date).toBeGreaterThan(PATH_ROOM - 0.06);
    expect(PATH_ROOM - CROWN_R_MAX).toBeGreaterThanOrEqual(4);
  });

  it("keeps LINE_ROOM from the bears' line: a crown, lean-back's crane swaying to either side of the line, and a metre", () => {
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
    // And no further than it need: on some show a tree stands within 2 m of that.
    expect(nearest).toBeLessThan(LANDMARK_ROOM + 2);
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
    // A grove is thick: some two stand within a third of a metre of that.
    expect(nearest).toBeLessThan(MIN_APART + 0.35);
    // Two trunks' reaches never meet: a walker has over half a metre between them.
    expect(MIN_APART).toBeGreaterThan(2 * TREE_REACH + 0.5);
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
        expect(views.filter((v) => v.from[0] === eye.x && v.from[1] === eye.z)).toHaveLength(eye.count + 1);
      }
      // No eye of the other tier's camera, which stands elsewhere.
      const other = eyesAt(40, !phone)[0];
      expect(eyes.some(([x, z]) => x === other.x && z === other.z)).toBe(false);
      // Lean-back's crane, 40 m along: to the visitor's bear CRANE.back m on, to each bear a gap further, and to where it looks.
      const crane = xz(line.at(40)), sees = new Set([...Array.from({ length: counts[0] + 1 }, (_, k) => CRANE.back + k * BEAR_GAP), CRANE.ahead]);
      for (const on of sees) expect(has(views, crane, xz(line.at(40 + on)), SIGHT_HALF)).toBe(true);
      expect(views.filter((v) => v.from[0] === crane[0] && v.from[1] === crane[1] && v.half === SIGHT_HALF)).toHaveLength(sees.size);
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
      // And two sights of each landmark as its song begins, from the camera and from the crane: nothing else is listed.
      const sights = counts.reduce((sum, count) => sum + count + 1, 0);
      expect(views).toHaveLength(steps * (sights + sees.size) + Object.keys(TEST_POSES).length + 1 + 3 * w.stands.length);
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

  it("keeps every view clear to its half-width: the camera's sight of each bear, the stage from the test poses, the trailhead from the summit", () => {
    // How far the nearest tree stands outside a sight's half-width, and a view's, over every show, a tier's views against its own trees.
    let sight = Infinity, wide = Infinity;
    for (const w of WORLDS) {
      for (const view of w.ways.views) {
        const { from, to, half } = view, x0 = Math.min(from[0], to[0]) - half - 3, x1 = Math.max(from[0], to[0]) + half + 3, z0 = Math.min(from[1], to[1]) - half - 3, z1 = Math.max(from[1], to[1]) + half + 3;
        for (const t of w.trees) {
          // Only a tree within 3 m of the view's box can stand within 3 m of its edge.
          if (t.x < x0 || t.x > x1 || t.z < z0 || t.z > z1) continue;
          const room = fromSegment(t.x, t.z, from, to) - half;
          if (half === SIGHT_HALF) sight = Math.min(sight, room); else wide = Math.min(wide, room);
        }
      }
    }
    expect(sight).toBeGreaterThanOrEqual(0);
    expect(wide).toBeGreaterThanOrEqual(0);
    // Each is a rule that bites: on some show a tree stands within three metres of a sight's edge, and of a view's.
    expect(sight).toBeLessThan(3);
    expect(wide).toBeLessThan(3);
    expect(SIGHT_HALF).toBe(CROWN_R_MAX);
    expect(VIEW_HALF).toBe(CROWN_R_MAX + 4);
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

  it("stands no tree behind a landmark as its song begins and the beam stands on it: not within a crown's reach of the sight of it for 24 m past it, from the camera that walks with the bears or from lean-back's crane", () => {
    // The opening is the first song's: the bears stand at its landmark, on every show, all that the tier draws. Under reduced motion
    // they stand at each song's.
    let room = Infinity, sights = 0;
    for (const w of WORLDS) {
      const count = bearsOf(w.phone)[0];
      for (const stand of w.stands) {
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
    const eye = [100, 0, 12], { spots } = placed({ count: 2000, loop: [], line: [], landmarks: [], eyes: [eye], views: [], groves: () => ({ thick: 1, pines: 0 }) });
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

  it("keeps lean-back's crane a metre clear of every crown as it sways to either side of the bears' line", () => {
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
    expect(MIN_APART - 2 * TREE_REACH).toBeGreaterThan(0.5);
  });

  it("leaves the ground a walk can stand on in one piece, on the fixed day's show and on three more", () => {
    for (const w of [fixed, fixedPhone, DESKTOP[0], DESKTOP[17], PHONE[37]]) {
      // Every half metre of the island a walker may stand on, and those reached from the trailhead by steps of half a metre.
      const n = Math.ceil(BOUND * 2), at = (i: number) => (i - n) / 2, side = 2 * n + 1;
      const free = new Uint8Array(side * side).fill(1);
      for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
        const x = at(i), z = at(j);
        if (Math.hypot(x, z) > BOUND || Math.hypot(x - STAGE_COLUMN.x, z - STAGE_COLUMN.z) < STAGE_REACH) free[i * side + j] = 0;
      }
      // Each tree takes the half metres within its reach.
      for (const t of w.trees) {
        for (let i = Math.floor((t.x - TREE_REACH) * 2) + n; i <= Math.ceil((t.x + TREE_REACH) * 2) + n; i++) for (let j = Math.floor((t.z - TREE_REACH) * 2) + n; j <= Math.ceil((t.z + TREE_REACH) * 2) + n; j++) {
          if (Math.hypot(at(i) - t.x, at(j) - t.z) < TREE_REACH) free[i * side + j] = 0;
        }
      }
      const open = free.reduce((sum, f) => sum + f, 0);
      const start = (Math.round(TRAILHEAD[0] * 2) + n) * side + Math.round(TRAILHEAD[1] * 2) + n, queue = [start];
      expect(free[start]).toBe(1);
      free[start] = 2;
      let reached = 1;
      while (queue.length > 0) {
        const k = queue.pop()!;
        for (const next of [k - 1, k + 1, k - side, k + side]) if (free[next] === 1) { free[next] = 2; reached += 1; queue.push(next); }
      }
      expect(reached, w.date).toBe(open);
      // The trees do take ground: some 90 half metres each.
      expect(open).toBeLessThan(Math.PI * BOUND * BOUND * 4 - w.trees.length * 80);
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
  type Shape = { getAttribute(name: string): Corners };
  const read = (geo: Shape) => {
    const position = geo.getAttribute("position"), sway = geo.getAttribute("aSway"), colour = geo.getAttribute("color"), normal = geo.getAttribute("normal");
    // `up` is how squarely a corner's normal faces the sky on a tree of the middle size, 3.4 m across its half and 16.6 m tall.
    return Array.from({ length: position.count }, (_, i) => ({
      x: position.getX(i), y: position.getY(i), z: position.getZ(i), sway: sway.getX(i),
      up: normal.getY(i) / 16.6 / Math.hypot(normal.getX(i) / 3.4, normal.getY(i) / 16.6, normal.getZ(i) / 3.4),
      light: 0.2126 * colour.getX(i) + 0.7152 * colour.getY(i) + 0.0722 * colour.getZ(i),
    }));
  };

  it("are a few hundred triangles on a desktop and fewer on a phone, with a normal, a colour and a sway to every corner and no more", () => {
    const triangles = (phone: boolean) => Object.fromEntries(shapes.map(([kind, geometry]) => [kind, geometry(phone).getAttribute("position").count / 3]));
    expect(triangles(false)).toEqual({ pine: 145, broad: 320 });
    expect(triangles(true)).toEqual({ pine: 72, broad: 124 });
    for (const [, geometry] of shapes) {
      const geo = geometry(false);
      expect(Object.keys(geo.attributes).sort()).toEqual(["aSway", "color", "normal", "position"]);
      expect(geo.index).toBeNull();
      const normal = geo.getAttribute("normal");
      for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
    }
  });

  it("stand from 0 at the sunk foot to 1 at the crown's top, the crown no lower than BASE_FRAC and no wider than CROWN_REACH, the trunk still and no wider than TRUNK_FOOT", () => {
    for (const phone of [false, true]) for (const [kind, geometry] of shapes) {
      const all = read(geometry(phone)), crown = all.filter((c) => c.sway > 0), trunk = all.filter((c) => c.sway === 0);
      expect(least(all.map((c) => c.y)), kind).toBe(0);
      expect(Math.max(...all.map((c) => c.y)), kind).toBeCloseTo(1, 6);
      expect(crown.length, kind).toBeGreaterThan(trunk.length);
      expect(least(crown.map((c) => c.y)), kind).toBeGreaterThanOrEqual(BASE_FRAC);
      expect(Math.max(...crown.map((c) => Math.hypot(c.x, c.z))), kind).toBeLessThanOrEqual(CROWN_REACH + 1e-6);
      // The crown is no stub: it reaches most of its radius.
      expect(Math.max(...crown.map((c) => Math.hypot(c.x, c.z))), kind).toBeGreaterThan(0.85);
      // The trunk's widest is its foot, and every part of it under the crown is trunk.
      expect(Math.max(...trunk.map((c) => Math.hypot(c.x, c.z))), kind).toBeLessThanOrEqual(TRUNK_FOOT + 1e-6);
      expect(Math.max(...trunk.filter((c) => c.y === 0).map((c) => Math.hypot(c.x, c.z))), kind).toBeGreaterThan(TRUNK_FOOT - 0.02);
      expect(all.filter((c) => c.y < BASE_FRAC).every((c) => c.sway === 0), kind).toBe(true);
      // The wind moves a crown's corner by its height: a fifth of the way at the crown's base, the whole way at its top.
      for (const c of crown) expect(c.sway, kind).toBeCloseTo(0.2 + (0.8 * (c.y - BASE_FRAC)) / (1 - BASE_FRAC), 5);
    }
    expect([TRUNK_FOOT, CROWN_REACH]).toEqual([0.2, 0.98]);
  });

  it("close a pine's tiers underneath, a face under each face of a tier's side, so a walker under one sees no sky through it", () => {
    for (const [phone, tiers, points] of [[false, 5, 10], [true, 3, 7]] as const) {
      const normal = pineGeometry(phone).getAttribute("normal"), sway = pineGeometry(phone).getAttribute("aSway");
      let up = 0, down = 0;
      for (let i = 0; i < normal.count; i += 3) {
        if (sway.getX(i + 1) === 0) continue;
        const y = (normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2)) / 3;
        if (y < -0.5) down += 1; else up += 1;
      }
      expect([up, down]).toEqual([tiers * points, tiers * points]);
    }
  });

  // A crown as it is seen from straight above, on a tree of the middle size (3.4 m across its half, 16.6 m from its sunk foot): the
  // crown's radius cut into 30, and for each square the highest face over its middle: how high (in the tree's heights), how pale the
  // colour there, how squarely the face itself lies to the sky, and how squarely its light does (the corners' normals).
  function fromAbove(geo: Shape) {
    const W = 3.4, H = 16.6, N = 30, position = geo.getAttribute("position"), sway = geo.getAttribute("aSway"), colour = geo.getAttribute("color"), normal = geo.getAttribute("normal");
    const cells = new Map<number, { x: number; z: number; y: number; light: number; faceUp: number; lightUp: number }>();
    for (let f = 0; f < position.count; f += 3) {
      if (sway.getX(f) === 0) continue;
      const c = [0, 1, 2].map((k) => {
        const n = [normal.getX(f + k) / W, normal.getY(f + k) / H, normal.getZ(f + k) / W];
        return { x: position.getX(f + k), y: position.getY(f + k), z: position.getZ(f + k), up: n[1] / Math.hypot(...n), light: 0.2126 * colour.getX(f + k) + 0.7152 * colour.getY(f + k) + 0.0722 * colour.getZ(f + k) };
      });
      const ax = (c[1].x - c[0].x) * W, ay = (c[1].y - c[0].y) * H, az = (c[1].z - c[0].z) * W, bx = (c[2].x - c[0].x) * W, by = (c[2].y - c[0].y) * H, bz = (c[2].z - c[0].z) * W;
      const faceUp = (az * bx - ax * bz) / Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      if (faceUp <= 0) continue;
      const area = (c[1].x - c[0].x) * (c[2].z - c[0].z) - (c[2].x - c[0].x) * (c[1].z - c[0].z);
      for (let i = Math.ceil(Math.min(c[0].x, c[1].x, c[2].x) * N); i <= Math.floor(Math.max(c[0].x, c[1].x, c[2].x) * N); i++) for (let j = Math.ceil(Math.min(c[0].z, c[1].z, c[2].z) * N); j <= Math.floor(Math.max(c[0].z, c[1].z, c[2].z) * N); j++) {
        const x = i / N, z = j / N;
        const w1 = ((x - c[0].x) * (c[2].z - c[0].z) - (c[2].x - c[0].x) * (z - c[0].z)) / area, w2 = ((c[1].x - c[0].x) * (z - c[0].z) - (x - c[0].x) * (c[1].z - c[0].z)) / area, w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const y = w0 * c[0].y + w1 * c[1].y + w2 * c[2].y, key = i * 1000 + j;
        if ((cells.get(key)?.y ?? -Infinity) < y) cells.set(key, { x, z, y, light: w0 * c[0].light + w1 * c[1].light + w2 * c[2].light, faceUp, lightUp: w0 * c[0].up + w1 * c[1].up + w2 * c[2].up });
      }
    }
    return [...cells.values()];
  }

  it("give a broad crown a canopy of round tops from above: lobes whose tops stand at heights of their own, each showing its own top, paler there than down its flanks and lit as a round thing of its own", () => {
    const mean = (list: number[]) => list.reduce((sum, v) => sum + v, 0) / list.length;
    for (const [phone, count] of [[false, 6], [true, 4]] as const) {
      const lobes = broadLobes(phone) as [number[], number[], number, number, number][], seen = fromAbove(broadGeometry(phone)), name = phone ? "phone" : "desktop";
      expect(lobes, name).toHaveLength(count);
      // The crown covers most of its circle.
      expect(seen.length, name).toBeGreaterThan(0.5 * Math.PI * 30 * 30);
      // The first lobe tops the crown; the others stand lower, each by its own measure: by a tree of the middle size, the lowest
      // over a metre and a half under it, and no two within 10 cm of each other.
      const tops = lobes.map(([at, rad]) => (at[1] + rad[1]) * 16.6);
      expect(tops[0], name).toBeCloseTo(16.6, 9);
      expect(Math.max(...tops.slice(1)), name).toBeLessThan(tops[0] - 0.5);
      expect(tops[0] - Math.min(...tops), name).toBeGreaterThan(1.5);
      const sorted = [...tops].sort((p, q) => q - p);
      for (let k = 1; k < sorted.length; k++) expect(sorted[k - 1] - sorted[k], name).toBeGreaterThan(0.1);
      // They stand on every side of the first, which is over the trunk.
      expect(Math.hypot(lobes[0][0][0], lobes[0][0][2]), name).toBeLessThan(0.1);
      const turns = lobes.slice(1).map(([at]) => Math.atan2(at[2], at[0])).sort((p, q) => p - q);
      for (let k = 0; k < turns.length; k++) expect((turns[(k + 1) % turns.length] - turns[k] + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI, name).toBeLessThan(Math.PI);
      // Each shows its own top from above: over its middle the highest face is its own dome's, none of another lobe's over it.
      for (const [at, rad] of lobes) {
        const over = seen.filter((c) => Math.hypot(c.x - at[0], c.z - at[2]) < 0.07).map((c) => c.y);
        expect(over.length, name).toBeGreaterThan(0);
        expect(Math.max(...over), name).toBeLessThanOrEqual(at[1] + rad[1] * (1 + LOBE_ROUGH) + 1e-6);
        expect(Math.max(...over), name).toBeGreaterThan(at[1] + rad[1] * (1 - LOBE_ROUGH) * 0.85);
      }
      // No flat top: under a twentieth of what is seen stands within 10 cm of the highest, and the middle four fifths of it span
      // over a metre and a half.
      expect(seen.filter((c) => c.y * 16.6 > 16.5).length / seen.length, name).toBeLessThan(0.05);
      const high = seen.map((c) => c.y * 16.6).sort((p, q) => p - q);
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
    // From below the crown is in its own shade: the corners that face down are the darkest, under half as pale as the flanks.
    const crown = read(broadGeometry(false)).filter((c) => c.sway > 0);
    const under = crown.filter((c) => c.up < -0.5), flank = crown.filter((c) => c.up > -0.1 && c.up < 0.5);
    expect(under.length).toBeGreaterThan(30);
    expect(mean(flank.map((c) => c.light))).toBeGreaterThan(2 * mean(under.map((c) => c.light)));
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
    expect(most.desktop).toBeLessThan(24_500);
    expect(most.tv).toBeLessThan(18_500);
  });

  it("sink every foot SUNK m under the ground and stand every tree to its own height over it", () => {
    for (const [meshes, trees] of [[made.meshes, fixed.trees], [phones.meshes, fixedPhone.trees]] as const) {
      byKind(trees).forEach((mine, k) => {
        const lowest = new Map<Spot, number>(), highest = new Map<Spot, number>();
        corners(meshes[k], mine, (_x, y, _z, _sway, tree) => {
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

  it("hold every crown inside the bounds its tree gives the camera, swaying: no further out than its reach, no lower than its base, no higher than its top", () => {
    for (const w of [fixed, fixedPhone, DESKTOP[3], PHONE[30]]) {
      const { meshes } = built(w.trees, w.phone);
      // The least room any corner of a crown leaves inside its reach when the wind has it SWAY m out, over its base and under its top.
      let within = Infinity, over = Infinity, under = Infinity;
      byKind(w.trees).forEach((mine, k) => corners(meshes[k], mine, (x, y, z, sway, tree) => {
        if (sway === 0) return;
        within = Math.min(within, tree.reach - SWAY - Math.hypot(x - tree.x, z - tree.z));
        over = Math.min(over, y - tree.base);
        under = Math.min(under, tree.top - y);
      }));
      expect(within, w.date).toBeGreaterThanOrEqual(0);
      expect(over, w.date).toBeGreaterThanOrEqual(0);
      expect(under, w.date).toBeGreaterThanOrEqual(0);
      // The bounds are no looser than a lean and the wind ask: some crown comes within 0.4 m of its base and of its reach.
      expect(over, w.date).toBeLessThan(0.4);
      expect(within, w.date).toBeLessThan(0.4);
      for (const tree of w.trees) {
        expect(tree.wide).toBeGreaterThanOrEqual(CROWN_R[0]);
        expect(tree.wide).toBeLessThanOrEqual(CROWN_R[1]);
        // Its reach is its own crown's: its corners' reach, what its lean carries its top over, and the sway; never the widest's.
        expect(tree.reach).toBeCloseTo(tree.wide * CROWN_REACH + Math.hypot(tree.lean[0], tree.lean[1]) * (tree.tall + SUNK) + SWAY, 9);
        expect(tree.reach).toBeLessThanOrEqual(CROWN_R_MAX);
      }
    }
    // The widest crown on the tallest tree, leaning its most.
    expect(CROWN_R_MAX).toBeCloseTo(CROWN_R[1] * CROWN_REACH + LEAN * (TALL[1] + SUNK) + SWAY, 12);
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
    for (const w of [fixed, fixedPhone, DESKTOP[3], PHONE[30]]) {
      const { meshes } = built(w.trees, w.phone);
      byKind(w.trees).forEach((mine, k) => corners(meshes[k], mine, (x, y, z, _sway, tree) => {
        if (y < tree.y + TOP) widest = Math.max(widest, Math.hypot(x - tree.x, z - tree.z));
      }));
    }
    expect(widest).toBeLessThanOrEqual(TRUNK_R_MAX);
    // A trunk is no pole: the widest is over half a metre across its half; and the bound is within a third of a metre of it.
    expect(widest).toBeGreaterThan(0.5);
    expect(TRUNK_R_MAX - widest).toBeLessThan(0.33);
    // The widest crown's trunk at its foot, and what the most lean carries it over by a bear's height.
    expect(TRUNK_R_MAX).toBeCloseTo(CROWN_R[1] * TRUNK_FOOT + LEAN * (SUNK + TOP), 12);
    // A bear's half-width and a quarter metre outside it.
    expect(TREE_REACH).toBe(TRUNK_R_MAX + CLEAR);
    expect(TREE_REACH).toBeCloseTo(2.808, 9);
  });

  it("sway a crown's top SWAY m at the most, no faster than once in five seconds, and a trunk not at all", () => {
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: "" };
    // The lines the edit hangs on are in three's Lambert shader once each.
    for (const anchor of ["#include <common>", "#include <begin_vertex>"]) expect(shader.vertexShader.split(anchor)).toHaveLength(2);
    made.meshes[0].material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain("attribute float aSway;\nuniform float uWind;");
    const sway = /float sway = aSway \* aSway \* ([\d.]+) \* \(([\d.]+) \* sin\(uWind \* ([\d.]+) \+ root\.x \* 0\.11 \+ root\.z \* 0\.09\) \+ ([\d.]+) \* sin\(uWind \* ([\d.]+) \+ root\.z \* 0\.3\)\);/.exec(shader.vertexShader);
    expect(sway).not.toBeNull();
    const [far, slow, slowRate, quick, quickRate] = sway!.slice(1).map(Number);
    expect(far).toBe(SWAY);
    expect(SWAY).toBeLessThanOrEqual(0.125);
    // aSway is 1 at a crown's top and 0 on a trunk, and the two waves together reach 1 at the most.
    expect(slow + quick).toBe(1);
    for (const rate of [slowRate, quickRate]) expect((2 * Math.PI) / rate).toBeGreaterThanOrEqual(5);
    // It moves the corner along the wind's own way in the world, whichever way the tree is turned, and nothing else moves it.
    expect(shader.vertexShader).toContain("vec2 wind = sway * vec2(0.8600, 0.5100), ax = instanceMatrix[0].xz, az = instanceMatrix[2].xz;");
    expect(shader.vertexShader).toContain("transformed.xz += vec2(dot(wind, ax) / dot(ax, ax), dot(wind, az) / dot(az, az));");
    expect(shader.vertexShader.split("uWind")).toHaveLength(4);
    // The wind is the time it is handed: held still, the crowns hold still.
    made.wind(12.5);
    expect(shader.uniforms.uWind.value).toBe(12.5);
    // One wind for both meshes.
    for (const mesh of made.meshes) {
      const other = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: "" };
      mesh.material.onBeforeCompile(other);
      expect(other.uniforms.uWind).toBe(shader.uniforms.uWind);
    }
  });

  it("take the stage's glow no more strongly than level ground at their feet does, and a share of that: the light's own edit runs first, and the sway's on top of it", () => {
    const uPool = { value: new THREE.Color(0xff7a30) }, scene = new THREE.Scene();
    const asked: unknown[] = [];
    const lit = (material: unknown, stands: unknown) => { asked.push(stands); return takesPool(material, uPool, stands); };
    const { meshes } = buildTrees(scene, fixed.trees, { lit, phone: false }) as unknown as Built;
    // Each material is lit as a thing that stands on the ground, its root SUNK m under it.
    expect(asked).toEqual([{ sunk: SUNK, share: GLOW_SHARE }, { sunk: SUNK, share: GLOW_SHARE }]);
    expect(GLOW_SHARE).toBeLessThan(0.5);
    expect(GLOW_SHARE).toBeGreaterThan(0);
    for (const mesh of meshes) {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: THREE.ShaderLib.lambert.fragmentShader as string };
      mesh.material.onBeforeCompile(shader);
      expect(shader.uniforms.uPool).toBe(uPool);
      // A tree's point stands where its instance puts it, swayed.
      expect(shader.vertexShader).toContain("vPoolAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
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
      expect(shader.vertexShader).toContain("uniform float uWind;");
      expect(mesh.material.vertexColors).toBe(true);
    }
    // The ground's own light is as it was: by its face's angle alone.
    const ground = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: THREE.ShaderLib.lambert.fragmentShader as string };
    takesPool(new THREE.MeshLambertMaterial(), uPool).onBeforeCompile(ground);
    expect(ground.vertexShader + ground.fragmentShader).not.toContain("vPoolMost");
    expect(ground.fragmentShader).toContain("float poolLit = max(dot(normal, normalize((viewMatrix * vec4(poolTo, 0.0)).xyz)), 0.0);\n        reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
  });

  it("hand the walk's camera a column for each trunk and one for each crown near the visitor, the same ones every time, and none from past the squares round it", () => {
    const tree = fixed.trees[0], into: Column[] = [STAGE_COLUMN];
    expect(made.columns(tree.x, tree.z, into)).toBe(into);
    expect(into[0]).toBe(STAGE_COLUMN);
    const first = into.slice(1), again = made.columns(tree.x, tree.z, []);
    // The same objects, so a frame makes nothing.
    expect(again).toHaveLength(first.length);
    again.forEach((column, k) => expect(column).toBe(first[k]));
    // Every tree within SQUARE m is among them, trunk and crown; and none further than two squares' diagonal.
    const near = fixed.trees.filter((t) => Math.hypot(t.x - tree.x, t.z - tree.z) <= SQUARE);
    expect(near.length).toBeGreaterThan(5);
    for (const t of near) expect(first.filter((c) => c.x === t.x && c.z === t.z).map((c) => c.base)).toEqual([undefined, t.base]);
    for (const c of first) expect(Math.hypot(c.x - tree.x, c.z - tree.z)).toBeLessThanOrEqual(2 * Math.SQRT2 * SQUARE);
    expect(first.length).toBeLessThan(2 * fixed.trees.length);
    // The boom is longest on a phone and trails a run by a few metres more, and a crown reaches CROWN_R_MAX past its tree.
    expect(SQUARE).toBeGreaterThanOrEqual(boomLength(true) + 4 + CROWN_R_MAX);
    // Far out at sea there is nothing.
    expect(made.columns(400, 400, [])).toEqual([]);
  });

  it("hand the walk the trunks near a place and no crowns, in one array that is the same every time, and every trunk within the reach asked", () => {
    const all = (x: number, z: number) => made.columns(x, z, []).filter((c) => c.base === undefined);
    let fewest = Infinity, most = 0;
    for (const tree of fixed.trees) {
      const x = tree.x + 1.3, z = tree.z - 0.9, near = made.trunks(x, z, TREE_REACH);
      // The trunks' own columns, the ones the camera is handed, each once; and this tree's among them.
      expect(new Set(near).size).toBe(near.length);
      for (const column of near) expect(all(x, z)).toContain(column);
      expect(near.some((c) => c.x === tree.x && c.z === tree.z)).toBe(true);
      expect(near.every((c) => c.base === undefined)).toBe(true);
      // Every tree whose foot is within the reach is there.
      for (const t of fixed.trees) if (Math.hypot(t.x - x, t.z - z) < TREE_REACH) expect(near.some((c) => c.x === t.x && c.z === t.z)).toBe(true);
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

  it("stand every trunk inside its column, NEAR m of air round it, and every crown inside its own, and no walker inside either", () => {
    const held = new Map<Spot, { trunk: Column; crown: Column }>();
    for (const tree of fixed.trees) {
      const mine = made.columns(tree.x, tree.z, []).filter((c) => c.x === tree.x && c.z === tree.z);
      held.set(tree, { trunk: mine.find((c) => c.base === undefined)!, crown: mine.find((c) => c.base !== undefined)! });
    }
    const of = (tree: Spot) => held.get(tree)!;
    // The least room a corner leaves under its trunk's column's top, inside the trunk's column and inside the crown's.
    let under = Infinity, trunkRoom = Infinity, crownRoom = Infinity;
    byKind(fixed.trees).forEach((mine, k) => corners(made.meshes[k], mine, (x, y, z, sway, tree) => {
      const { trunk, crown } = of(tree), out = Math.hypot(x - tree.x, z - tree.z);
      under = Math.min(under, trunk.top - y);
      if (sway === 0 && y < crown.base!) trunkRoom = Math.min(trunkRoom, trunk.r - NEAR - out);
      if (sway > 0) crownRoom = Math.min(crownRoom, crown.r - SWAY - out);
    }));
    expect(under).toBeGreaterThanOrEqual(0);
    expect(trunkRoom).toBeGreaterThanOrEqual(0);
    expect(crownRoom).toBeGreaterThanOrEqual(0);
    for (const tree of fixed.trees) {
      const { trunk, crown } = of(tree);
      expect(crown).toEqual({ x: tree.x, z: tree.z, r: tree.reach, base: tree.base, top: tree.top });
      // A walker stands TREE_REACH off at the nearest, outside the trunk's column.
      expect(trunk.r).toBeLessThan(TREE_REACH - 0.5);
    }
  });

  it("never hangs the walk's camera in a crown or a trunk, on a desktop or a phone, walking and running through the groves, and brings it back out to its length", () => {
    for (const phone of [false, true]) {
      const trees = phone ? fixedPhone.trees : fixed.trees, { columns, trunks } = phone ? phones : made;
      const hold: Column[] = [STAGE_COLUMN], avatar = buildAvatar(new THREE.Scene(), [], { phone, reduced: false, columns: hold as never[] });
      const camera = new THREE.PerspectiveCamera(phone ? 75 : 60, 1, 0.5, 900), limits = walkLimits([], trunks, TREE_REACH);
      let cut = 0, frames = 0, nearest = Infinity, furthest = 0, closest = Infinity;
      const inside: string[] = [];
      // Through each grove's middle, four ways, at a walk and at a run.
      for (const [gx, gz, r] of GROVES) for (let k = 0; k < 4; k++) for (const run of [1, 1.6]) {
        const a = (k * Math.PI) / 4 + 0.3, heading = Math.atan2(Math.cos(a), Math.sin(a)), walker = { x: gx + (r + 12) * Math.cos(a), z: gz + (r + 12) * Math.sin(a), heading, pitch: k === 3 ? -0.5 : 0 };
        const pace = (12 * run) / 60;
        for (let f = 0; f * pace < 2 * r + 24; f++) {
          walker.x -= Math.sin(heading) * pace; walker.z -= Math.cos(heading) * pace;
          confine(walker, limits);
          for (const t of trees) closest = Math.min(closest, Math.hypot(walker.x - t.x, walker.z - t.z));
          avatar.step(walker.x, walker.z, walker.heading, 1 / 60);
          hold.length = 1;
          columns(walker.x, walker.z, hold);
          avatar.boom(camera, walker, 1 / 60, f === 0);
          const { x, y, z } = camera.position;
          for (let c = 1; c < hold.length; c++) {
            const { x: cx, z: cz, r: cr, top, base = -Infinity } = hold[c];
            if (y < top && y > base && (x - cx) ** 2 + (z - cz) ** 2 < cr * cr) inside.push(`${phone ? "phone" : "desktop"} grove ${gx},${gz} way ${k} frame ${f}`);
          }
          // The camera is never nearer the head than the boom's least, 2.5 m.
          const reach = Math.hypot(x - walker.x, y - height(walker.x, walker.z) - HEAD, z - walker.z);
          nearest = Math.min(nearest, reach);
          furthest = Math.max(furthest, reach);
          if (reach < boomLength(phone) * 0.8) cut += 1;
          frames += 1;
        }
      }
      expect(inside).toEqual([]);
      expect(nearest).toBeGreaterThanOrEqual(2.5 - 1e-6);
      // The walker was held off every trunk, by the trunks the look-up found near it.
      expect(closest).toBeGreaterThanOrEqual(TREE_REACH - 1e-9);
      expect(closest).toBeLessThan(TREE_REACH + 1e-6);
      // The trees do draw it in, and leave it at its length, the tier's own, for most of a walk through them.
      expect(cut).toBeGreaterThan(0);
      expect(cut / frames).toBeLessThan(0.35);
      expect(furthest).toBeGreaterThan(boomLength(phone) - 0.5);
    }
  });

  it("keeps the boom's foot 2.9 m from every crown wherever a walker may stand, so the camera has its 2.5 m and a crown never raises it", () => {
    let nearest = Infinity;
    eachTree((t, w) => {
      if (w !== fixed && w !== fixedPhone && w !== DESKTOP[9] && w !== PHONE[25]) return;
      const crown = { x: t.x, z: t.z, r: t.reach, base: t.base, top: t.top };
      for (let dx = -(t.reach + 4); dx <= t.reach + 4; dx += 0.5) for (let dz = -(t.reach + 4); dz <= t.reach + 4; dz += 0.5) {
        const x = t.x + dx, z = t.z + dz, out = Math.hypot(dx, dz) - t.reach, y = height(x, z) + HEAD;
        if (Math.hypot(dx, dz) < TREE_REACH) continue;
        // How far the foot stands from the crown: under it, to its underside; beside it, to its rim.
        const under = t.base - y, d = out <= 0 ? under : Math.hypot(out, Math.max(0, under));
        if (under > 0 || out > 0) nearest = Math.min(nearest, d);
        // Straight up from under it, the line meets its underside that far on.
        if (out < 0) expect(enterColumn({ x, y, z }, { x: 0, y: 1, z: 0 }, crown)).toBeCloseTo(under, 9);
      }
    });
    expect(nearest).toBeGreaterThan(2.9 - 0.05);
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
