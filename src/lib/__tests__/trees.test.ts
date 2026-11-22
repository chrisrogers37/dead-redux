import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { AS_TITLES } from "../../../.github/screenshots/near.mjs";
import { buildAvatar, HEAD } from "../../../public/world/avatar.js";
import { BODY_REACH, enterColumn, outside, TREE_REACH, TRUNK_R_MAX } from "../../../public/world/collide.js";
import { BOUND, CAVES, height, STAGE, STAGE_COLUMN, STAGE_REACH, TEST_POSES, TRAILHEAD } from "../../../public/world/ground.js";
import { buildIsland, FEATHER, offTracks, RING, takesPool, TRUNK_ROOM } from "../../../public/world/island.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { confine, walkLimits } from "../../../public/world/modes.js";
import { buildPath, buildWalkLine, layout, nearStand, outline, placeLandmarks } from "../../../public/world/path.js";
import { postPose } from "../../../public/world/pose.js";
import { onCrowdGround } from "../../../public/world/seats.js";
import {
  BASE_FRAC, broadGeometry, buildTrees, cameraWays, CAVE_ROOM, CROWD_ROOM, CROWN_BASE, CROWN_R, CROWN_R_MAX, EYE_ROOM, grove, GROVES, LANDMARK_ROOM,
  LEAN, LINE_ROOM, MIN_APART, NEAR, NY_MIN, PATH_ROOM, pineGeometry, placeTrees, RING_ROOM, RULES, SIGHT_HALF, SQUARE, STAGE_ROOM, SUNK, SWAY, TALL,
  TARGET, TRACK_ROOM, trunkIndex, UNDER, VIEW_HALF,
} from "../../../public/world/trees.js";

// The trees are placed here as main.js places them: on the island's own path and bears' line, round a show's landmarks, clear of the
// cameras' ways. Every show with a map is tried, 38 of them, its landmarks a desktop's; and a few with a phone's, which have fewer faces.

type Spot = { x: number; y: number; z: number; tall: number; wide: number; turn: number; lean: number[]; kind: string; tint: number; reach: number; base: number; top: number };
type View = { from: number[]; to: number[]; half: number };
type Mark = { x: number; z: number; rot: number; poly: number[][] };
type Column = { x: number; z: number; r: number; top: number; base?: number };
type Stand = { x: number; z: number; to: number[]; d: number };
// The trees' own functions, with the shapes of what they take and give, which the world's plain modules do not spell out.
const waysOf = cameraWays as unknown as (ask: { line: unknown; height: unknown; stands: Stand[] }) => { eyes: number[][]; views: View[] };
const placed = placeTrees as unknown as (ask: { count: number; loop: number[][]; line: number[][]; landmarks: Mark[]; eyes: number[][]; views: View[] }) => Spot[];
const rules = RULES as unknown as Record<string, (x: number, z: number, ctx: unknown) => boolean>;
type Built = { count: number; meshes: Mesh[]; wind(time: number): void; columns(x: number, z: number, into: Column[]): Column[] };
type Mesh = {
  isInstancedMesh: boolean; count: number; castShadow: boolean; frustumCulled: boolean; getMatrixAt(i: number, m: unknown): void;
  geometry: { groups: unknown[]; getAttribute(name: string): { count: number; getX(i: number): number } };
  material: { vertexColors: boolean; onBeforeCompile(shader: unknown): void };
};

const MAPS = new URL("../../../public/maps/", import.meta.url);
const DATES = readdirSync(MAPS).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", ""));
const FIXED = "1986-07-04";
const path = buildPath(), line = buildWalkLine(path, 7);
const loop = Array.from({ length: Math.ceil(path.curveLength / 2) }, (_, k) => { const p = path.at((2 * k) / path.curveLength); return [p.x, p.z]; });
const linePoints = Array.from({ length: Math.ceil(line.length) }, (_, d) => { const p = line.at(d); return [p.x, p.z]; });

// A show's world as main.js gathers it for the trees: its landmarks placed, their outlines, the stands the near views are taken from,
// and the cameras' ways. `as` builds some songs' landmarks for other titles, as ?as=K:Title does.
function world(date: string, phone = false, as: [number, string][] = []) {
  const map = JSON.parse(readFileSync(new URL(`${date}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
  const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
  // The fixed day's second set opens at track 7; the maps do not say where another show's does, so it is taken to open partway.
  const landmarkU = layout(tracks, date === FIXED ? 7 : Math.floor(tracks.length * 0.45), path);
  const builders = makeBuilders(phone), titles = new Map(as);
  const landmarks = placeLandmarks(new THREE.Scene(), path, tracks.map((t, k) => ({ ...t, title: titles.get(k) ?? t.title })), true, builders, landmarkU, line) as { position: { x: number; y: number; z: number }; rotation: { y: number } }[];
  const marks: Mark[] = landmarks.map((g) => ({ x: g.position.x, z: g.position.z, rot: g.rotation.y, poly: outline(g, builders.moving) }));
  const stands: Stand[] = landmarks.flatMap((g, k) => { const s = nearStand(path, landmarkU, landmarks, k); return s ? [{ x: s.x, z: s.z, to: [g.position.x, g.position.z], d: line.dOf(landmarkU[k]) }] : []; });
  const ways = waysOf({ line, height, stands });
  const place = (count: number) => placed({ count, loop, line: linePoints, landmarks: marks, ...ways });
  return { date, marks, stands, ways, place, trees: place(TARGET.desktop) };
}
const WORLDS = DATES.map((date) => world(date));
const fixed = WORLDS.find((w) => w.date === FIXED)!;
const eachTree = (see: (tree: Spot, w: (typeof WORLDS)[number]) => void) => { for (const w of WORLDS) for (const tree of w.trees) see(tree, w); };
const least = (values: number[]) => values.reduce((a, b) => Math.min(a, b), Infinity);
const fromSegment = (x: number, z: number, a: number[], b: number[]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};
// A stand-in for the light the ground takes, and the trees built with it.
const plain = (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; };
const built = (trees: Spot[], phone = false) => { const scene = new THREE.Scene(); return { scene, ...(buildTrees(scene, trees, { lit: plain, phone }) as unknown as Built) }; };
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

describe("where the trees stand", () => {
  it("draws each tier its own number of trees on every show, the same ones on every visit, a phone's the first of a TV's and a TV's of a desktop's", () => {
    for (const w of WORLDS) {
      // A show whose landmarks left less room than the tier's count would draw fewer: none does.
      expect(w.trees, w.date).toHaveLength(TARGET.desktop);
      expect(w.place(TARGET.desktop)).toEqual(w.trees);
      expect(w.place(TARGET.tv)).toEqual(w.trees.slice(0, TARGET.tv));
      expect(w.place(TARGET.phone)).toEqual(w.trees.slice(0, TARGET.phone));
    }
    expect(TARGET).toEqual({ desktop: 100, tv: 75, phone: 45 });
  });

  it("stands them in groves with meadows between: most of them in a grove's thick middle, and some of each kind", () => {
    for (const w of WORLDS) {
      const thick = w.trees.filter((t) => grove(t.x, t.z).thick === 1).length, lone = w.trees.filter((t) => grove(t.x, t.z).thick === 0).length;
      expect(thick, w.date).toBeGreaterThan(50);
      expect(lone, w.date).toBeLessThan(20);
      // A phone's 45 hold both kinds too.
      for (const count of [TARGET.desktop, TARGET.phone]) {
        const pines = w.trees.slice(0, count).filter((t) => t.kind === "pine").length;
        expect(pines, w.date).toBeGreaterThan(count * 0.25);
        expect(pines, w.date).toBeLessThan(count * 0.75);
      }
    }
    // A tree alone, outside every grove, is broad-crowned; and every grove has trees in it.
    expect(grove(0, -60)).toEqual({ thick: 0, pines: 0 });
    for (const [x, z, r] of GROVES) expect(fixed.trees.some((t) => Math.hypot(t.x - x, t.z - z) < r), `the grove at ${x}, ${z}`).toBe(true);
  });

  it("keeps PATH_ROOM from the setlist's path, so the widest crown stands 4 m back from it", () => {
    // The path is given to the trees a point every 2 m; between two of them it comes 6 cm nearer.
    const fine = Array.from({ length: Math.ceil(path.curveLength * 2) }, (_, k) => path.at(k / 2 / path.curveLength));
    eachTree((t, w) => expect(least(fine.map((p) => Math.hypot(t.x - p.x, t.z - p.z))), w.date).toBeGreaterThan(PATH_ROOM - 0.06));
    expect(PATH_ROOM - CROWN_R_MAX).toBe(4);
  });

  it("keeps LINE_ROOM from the bears' line: a crown, lean-back's crane swaying 2 m off the line, and a metre", () => {
    const fine = Array.from({ length: Math.ceil(line.length * 2) }, (_, k) => line.at(k / 2));
    eachTree((t, w) => expect(least(fine.map((p) => Math.hypot(t.x - p.x, t.z - p.z))), w.date).toBeGreaterThan(LINE_ROOM - 0.02));
    expect(LINE_ROOM).toBeGreaterThanOrEqual(CROWN_R_MAX + 2 + 1);
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
    expect(MIN_APART).toBeGreaterThan(2 * TREE_REACH + 1);
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
    const eye = { ...none, each: (_x: number, _z: number, _r: number, see: (ex: number, ez: number, ey: number) => boolean) => see(100, 0, 12) };
    expect(rules.underDescent(96, CROWN_R_MAX - 0.2, { ...free, eyes: eye })).toBe(true);
    expect(rules.underDescent(96, CROWN_R_MAX + 0.2, { ...free, eyes: eye })).toBe(false);
    expect(rules.underDescent(60, 0, { ...free, eyes: eye })).toBe(false);
  });
});

describe("the cameras' ways", () => {
  // The camera that walks with the bears, for a desktop and a phone and five, three and one bears, the lead bear `d` m along the line.
  const eyesAt = (d: number) => [false, true].flatMap((phone) => [5, 3, 1].map((count) => ({ phone, count, ...postPose({ third: true, phone, bearD: d, count, gap: 7, line, height, keepInView: () => 0 }, 0, 0).pos })));

  it("lists the camera that walks with the bears every 2 m of their line, for both tiers and five, three and one bears, with its sight of every bear", () => {
    const { eyes, views } = fixed.ways;
    expect(eyes).toHaveLength(Math.ceil(line.length / 2) * 6);
    const here = eyesAt(40);
    for (const eye of here) expect(eyes.some(([x, z, y]) => x === eye.x && z === eye.z && y === eye.y)).toBe(true);
    // From the desktop's eye with five bears: to the lead bear, each bear behind it, and the visitor's.
    const lead = line.at(40), slot = line.at(40 - 35), from = [here[0].x, here[0].z];
    for (const to of [lead, slot]) expect(views.some((v) => v.from[0] === from[0] && v.from[1] === from[1] && v.to[0] === to.x && v.to[1] === to.z && v.half === SIGHT_HALF)).toBe(true);
    expect(views.filter((v) => v.from[0] === from[0] && v.from[1] === from[1])).toHaveLength(6);
    // The views of the stage from behind each test pose, of the trailhead from the summit, and of each landmark from its stand.
    expect(views.filter((v) => v.half === VIEW_HALF)).toHaveLength(Object.keys(TEST_POSES).length + 1 + fixed.stands.length);
    // And four sights of each landmark as its song begins: from the camera and from the crane, a desktop's and a phone's.
    expect(views).toHaveLength(Math.ceil(line.length / 2) * (6 + 4 + 2 + 6 + 4 + 2 + 6) + Object.keys(TEST_POSES).length + 1 + 5 * fixed.stands.length);
    expect(views.some((v) => v.from[0] === 0 && v.from[1] === 0 && v.to[0] === TRAILHEAD[0] && v.to[1] === TRAILHEAD[1])).toBe(true);
    expect(views.filter((v) => v.to === STAGE)).toHaveLength(5);
  });

  it("keeps every tree EYE_ROOM from the camera that walks with the bears, wherever the bears are, so the eye is never in a crown", () => {
    // Every metre of the line, between the places the trees were given.
    let nearest = Infinity;
    for (let d = 0; d < line.length; d += 1) {
      for (const eye of eyesAt(d)) eachTree((t) => { nearest = Math.min(nearest, Math.hypot(t.x - eye.x, t.z - eye.z)); });
    }
    expect(nearest).toBeGreaterThan(EYE_ROOM - 0.1);
    // The rule is no wider than it says: on some show a tree stands within a metre and a half of it.
    expect(nearest).toBeLessThan(EYE_ROOM + 1.5);
    expect(EYE_ROOM).toBeGreaterThan(CROWN_R_MAX + 1);
  }, 30_000);

  it("keeps every view clear to its half-width: the camera's sight of each bear, the stage from the test poses, the trailhead from the summit", () => {
    // How far the nearest tree stands outside a sight's half-width, and a view's, over every show.
    let sight = Infinity, wide = Infinity;
    for (const w of WORLDS) {
      for (const view of w.ways.views) for (const t of w.trees) {
        const room = fromSegment(t.x, t.z, view.from, view.to) - view.half;
        if (view.half === SIGHT_HALF) sight = Math.min(sight, room); else wide = Math.min(wide, room);
      }
    }
    expect(sight).toBeGreaterThanOrEqual(0);
    expect(wide).toBeGreaterThanOrEqual(0);
    // Each is a rule that bites: on some show a tree stands within three metres of a sight's edge, and of a view's.
    expect(sight).toBeLessThan(3);
    expect(wide).toBeLessThan(3);
    expect(SIGHT_HALF).toBe(CROWN_R_MAX);
    expect(VIEW_HALF).toBe(CROWN_R_MAX + 4);
  }, 30_000);

  it("stands no tree in the view of a landmark from the path: not within its crown's reach and 4 m of the line of sight, from 20 m behind the visitor to 10 m past the landmark", () => {
    // Every show's own landmarks; and the fixed day's as the shoot builds them, with its own titles and with the other kinds (?as=), on
    // a desktop and a phone. The stand is where ?pose=near-K puts the visitor (path.js nearStand).
    const shoots = [fixed, world(FIXED, true), world(FIXED, false, AS_TITLES as [number, string][]), world(FIXED, true, AS_TITLES as [number, string][])];
    let stood = 0;
    for (const w of [...WORLDS, ...shoots]) {
      // Each of a show's songs has a landmark and a stand.
      expect(w.stands, w.date).toHaveLength(w.marks.length);
      stood += w.stands.length;
      for (const count of [TARGET.desktop, TARGET.tv, TARGET.phone]) {
        // How far the nearest crown's edge stands from a line of sight, over the show's stands.
        let room = Infinity;
        const trees = w.place(count);
        for (const stand of w.stands) {
          const dx = stand.to[0] - stand.x, dz = stand.to[1] - stand.z, d = Math.hypot(dx, dz);
          const behind = [stand.x - (dx / d) * 20, stand.z - (dz / d) * 20], past = [stand.to[0] + (dx / d) * 10, stand.to[1] + (dz / d) * 10];
          for (const t of trees) room = Math.min(room, fromSegment(t.x, t.z, behind, past) - t.reach);
        }
        expect(room, `${w.date} ${count}`).toBeGreaterThanOrEqual(4);
      }
    }
    expect(stood).toBeGreaterThan(700);
    // The 13 other kinds stand at the fixed day's own songs' points, and their outlines differ from the songs' own.
    expect(shoots[2].marks).toHaveLength(fixed.marks.length);
    expect(shoots[2].marks.filter((m, k) => m.poly.length !== fixed.marks[k].poly.length || m.x !== fixed.marks[k].x).length).toBeGreaterThan(5);
  }, 30_000);

  it("stands no tree behind a landmark as its song begins and the beam stands on it: not within a crown's reach of the sight of it for 24 m past it, from the camera that walks with the bears or from lean-back's crane", () => {
    // The opening is the first song's: the bears stand at its landmark, on every show. Under reduced motion they stand at each song's.
    let room = Infinity, sights = 0;
    for (const w of WORLDS) {
      for (const stand of w.stands) {
        for (const [phone, count] of [[false, 5], [true, 3]] as const) {
          const eye = postPose({ third: true, phone, bearD: stand.d, count, gap: 7, line, height, keepInView: () => 0 }, 0, 0).pos, crane = line.at(stand.d - count * 7 - 14);
          for (const from of [[eye.x, eye.z], [crane.x, crane.z]]) {
            const dx = stand.to[0] - from[0], dz = stand.to[1] - from[1], far = Math.hypot(dx, dz), past = [stand.to[0] + (dx / far) * 24, stand.to[1] + (dz / far) * 24];
            sights += 1;
            for (const t of w.trees) room = Math.min(room, fromSegment(t.x, t.z, from, past) - CROWN_R_MAX);
          }
        }
      }
    }
    expect(sights).toBeGreaterThan(2000);
    expect(room).toBeGreaterThanOrEqual(0);
    // The first song's point is the trailhead, where the line begins.
    expect(fixed.stands[0].d).toBeCloseTo(0, 6);
  });

  it("brings the opening's descent down through no crown, from 140 m over the island's middle to the camera that walks with the bears", () => {
    // How far outside the nearest crown's reach the descent passes, at any height that crown stands at.
    let room = Infinity, low = 0;
    for (let d = 0; d < line.length; d += 8) {
      for (const eye of eyesAt(d)) {
        // No tree tops 50 m, and the line is that low only in its last third.
        for (let k = 0.6; k <= 1; k += 0.005) {
          const x = eye.x * k, y = 140 + (eye.y - 140) * k, z = eye.z * k;
          eachTree((t) => { if (y > t.base && y < t.top) { low += 1; room = Math.min(room, Math.hypot(x - t.x, z - t.z) - t.reach); } });
        }
      }
    }
    // The line does come down among the crowns' heights, and passes outside every one.
    expect(low).toBeGreaterThan(1000);
    expect(room).toBeGreaterThan(0);
    eachTree((t) => expect(t.top).toBeLessThan(50));
    expect(140 + (41 - 140) * 0.6).toBeGreaterThan(50);
  }, 30_000);

  it("keeps lean-back's crane a metre clear of every crown as it sways 2 m to either side of the bears' line", () => {
    let nearest = Infinity;
    for (let d = 0; d < line.length; d += 1) {
      const p = line.at(d), tangent = line.tangentAt(d);
      for (const sway of [-2, 0, 2]) {
        const x = p.x + tangent.z * sway, z = p.z - tangent.x * sway;
        eachTree((t) => { nearest = Math.min(nearest, Math.hypot(t.x - x, t.z - z) - t.reach); });
      }
    }
    expect(nearest).toBeGreaterThan(0.9);
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
      expect(least(fine.map((p) => Math.hypot(t.x - p.x, t.z - p.z))), w.date).toBeGreaterThan(BODY_REACH + TREE_REACH + 1);
    });
    expect(MIN_APART - 2 * TREE_REACH).toBeCloseTo(1.2, 9);
  });

  it("leaves the ground a walk can stand on in one piece, on the fixed day's show and on three more", () => {
    for (const w of [fixed, WORLDS[0], WORLDS[17], WORLDS[37]]) {
      // Every half metre of the island a walker may stand on, and those reached from the trailhead by steps of half a metre.
      const n = Math.ceil(BOUND * 2), at = (i: number) => (i - n) / 2, side = 2 * n + 1;
      const free = new Uint8Array(side * side);
      let open = 0;
      for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
        const x = at(i), z = at(j);
        if (Math.hypot(x, z) > BOUND || Math.hypot(x - STAGE_COLUMN.x, z - STAGE_COLUMN.z) < STAGE_REACH) continue;
        if (w.trees.some((t) => Math.hypot(x - t.x, z - t.z) < TREE_REACH)) continue;
        free[i * side + j] = 1;
        open += 1;
      }
      const start = (Math.round(TRAILHEAD[0] * 2) + n) * side + Math.round(TRAILHEAD[1] * 2) + n, queue = [start];
      expect(free[start]).toBe(1);
      free[start] = 2;
      let reached = 1;
      while (queue.length > 0) {
        const k = queue.pop()!;
        for (const next of [k - 1, k + 1, k - side, k + side]) if (free[next] === 1) { free[next] = 2; reached += 1; queue.push(next); }
      }
      expect(reached, w.date).toBe(open);
    }
  });

  it("stops a walk at a trunk and slides it round, from every side, and never lets it nearer than TREE_REACH", () => {
    const trees = fixed.trees;
    for (const tree of trees.slice(0, 30)) {
      for (let k = 0; k < 8; k++) {
        // From 8 m off, straight at a point half a metre to one side of the trunk's middle, two and a half seconds at the walk's pace:
        // once among all the trees, and once with this tree alone, where nothing else turns the walk.
        const a = (k * Math.PI) / 4, heading = Math.atan2(Math.cos(a), Math.sin(a));
        for (const among of [trees, [tree]]) {
          const limits = walkLimits([], among), walker = { x: tree.x + 8 * Math.cos(a) - 0.5 * Math.sin(a), z: tree.z + 8 * Math.sin(a) + 0.5 * Math.cos(a), heading };
          confine(walker, limits);
          let nearest = Infinity, any = Infinity;
          for (let f = 0; f < 150; f++) {
            walker.x -= Math.sin(heading) * 0.2; walker.z -= Math.cos(heading) * 0.2;
            confine(walker, limits);
            for (const t of among) any = Math.min(any, Math.hypot(walker.x - t.x, walker.z - t.z));
            nearest = Math.min(nearest, Math.hypot(walker.x - tree.x, walker.z - tree.z));
          }
          // It was never in any trunk's reach.
          expect(any).toBeGreaterThanOrEqual(TREE_REACH - 1e-9);
          if (among.length > 1) continue;
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
  const read = (geo: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } }) => {
    const position = geo.getAttribute("position"), sway = geo.getAttribute("aSway");
    return Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), y: position.getY(i), z: position.getZ(i), sway: sway.getX(i) }));
  };

  it("are a few hundred triangles on a desktop and fewer on a phone, with a normal, a colour and a sway to every corner and no more", () => {
    const triangles = (phone: boolean) => Object.fromEntries(shapes.map(([kind, geometry]) => [kind, geometry(phone).getAttribute("position").count / 3]));
    expect(triangles(false)).toEqual({ pine: 145, broad: 298 });
    expect(triangles(true)).toEqual({ pine: 72, broad: 110 });
    for (const [, geometry] of shapes) {
      const geo = geometry(false);
      expect(Object.keys(geo.attributes).sort()).toEqual(["aSway", "color", "normal", "position"]);
      expect(geo.index).toBeNull();
      const normal = geo.getAttribute("normal");
      for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
    }
  });

  it("stand from 0 at the sunk foot to 1 at the crown's top, the crown no lower than BASE_FRAC and no wider than its radius, the trunk still", () => {
    for (const phone of [false, true]) for (const [kind, geometry] of shapes) {
      const all = read(geometry(phone)), crown = all.filter((c) => c.sway > 0), trunk = all.filter((c) => c.sway === 0);
      expect(least(all.map((c) => c.y)), kind).toBe(0);
      expect(Math.max(...all.map((c) => c.y)), kind).toBeCloseTo(1, 6);
      expect(crown.length, kind).toBeGreaterThan(trunk.length);
      expect(least(crown.map((c) => c.y)), kind).toBeGreaterThanOrEqual(BASE_FRAC);
      expect(Math.max(...crown.map((c) => Math.hypot(c.x, c.z))), kind).toBeLessThanOrEqual(0.98 + 1e-6);
      // The crown is no stub: it reaches most of its radius.
      expect(Math.max(...crown.map((c) => Math.hypot(c.x, c.z))), kind).toBeGreaterThan(0.85);
      // The trunk's widest is its foot, a fifth of the crown's radius, and every part of it under the crown is trunk.
      expect(Math.max(...trunk.map((c) => Math.hypot(c.x, c.z))), kind).toBeLessThanOrEqual(0.2 + 1e-6);
      expect(all.filter((c) => c.y < BASE_FRAC).every((c) => c.sway === 0), kind).toBe(true);
      // The wind moves a crown's corner by its height: a fifth of the way at the crown's base, the whole way at its top.
      for (const c of crown) expect(c.sway, kind).toBeCloseTo(0.2 + (0.8 * (c.y - BASE_FRAC)) / (1 - BASE_FRAC), 5);
    }
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
});

describe("the trees as they are built", () => {
  const made = built(fixed.trees), phones = built(fixed.trees.slice(0, TARGET.phone), true);
  const byKind = (trees: Spot[]) => ["pine", "broad"].map((kind) => trees.filter((t) => t.kind === kind));

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
    const most = { desktop: 0, tv: 0, phone: 0 };
    for (const w of WORLDS) {
      const sum = (count: number, per: { pine: number; broad: number }) => w.trees.slice(0, count).reduce((a, t) => a + per[t.kind as "pine" | "broad"], 0);
      most.desktop = Math.max(most.desktop, sum(TARGET.desktop, desktop));
      most.tv = Math.max(most.tv, sum(TARGET.tv, desktop));
      most.phone = Math.max(most.phone, sum(TARGET.phone, phone));
    }
    expect(most.phone).toBeLessThan(5000);
    // Each tier's meshes draw its own shapes: a phone's trees are a phone's.
    const drawn = (meshes: Mesh[]) => meshes.map((mesh) => mesh.geometry.getAttribute("position").count / 3);
    expect(drawn(made.meshes)).toEqual([desktop.pine, desktop.broad]);
    expect(drawn(phones.meshes)).toEqual([phone.pine, phone.broad]);
    // Were every one of a phone's trees the costlier kind, it would still be under.
    expect(TARGET.phone * Math.max(phone.pine, phone.broad)).toBeLessThan(5000);
    expect(most.desktop).toBeLessThan(23_000);
    expect(most.tv).toBeLessThan(17_500);
  });

  it("sink every foot SUNK m under the ground and stand every tree to its own height over it", () => {
    for (const [meshes, trees] of [[made.meshes, fixed.trees], [phones.meshes, fixed.trees.slice(0, TARGET.phone)]] as const) {
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

  it("hold every crown inside the bounds its tree gives the camera, the wind's sway to spare: no further out than its reach, no lower than its base, no higher than its top", () => {
    for (const w of [fixed, WORLDS[3], WORLDS[30]]) {
      const { meshes } = built(w.trees);
      // The least room any corner of a crown leaves inside its reach, over its base and under its top.
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
        expect(tree.reach).toBeLessThanOrEqual(CROWN_R_MAX);
      }
    }
  });

  it("leave CROWN_BASE m of air under every crown, over the highest ground a walker can stand on under it or within UNDER m of it", () => {
    // So a bear, 4.85 m tall, walks under any crown, and the boom's foot, HEAD m over the ground, is 2.9 m under it.
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
  });

  it("keep every trunk, as high as a bear is tall, within TRUNK_R_MAX of the middle of its foot, where a walk is held TREE_REACH off", () => {
    let widest = 0;
    for (const w of [fixed, WORLDS[3], WORLDS[30]]) {
      const { meshes } = built(w.trees);
      byKind(w.trees).forEach((mine, k) => corners(meshes[k], mine, (x, y, z, _sway, tree) => {
        if (y < tree.y + 5) widest = Math.max(widest, Math.hypot(x - tree.x, z - tree.z));
      }));
    }
    expect(widest).toBeLessThanOrEqual(TRUNK_R_MAX);
    // A trunk is no pole: the widest is over half a metre across its half.
    expect(widest).toBeGreaterThan(0.5);
    expect(TREE_REACH).toBe(TRUNK_R_MAX + 1.75);
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
    expect(SWAY).toBeLessThanOrEqual(0.25);
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

  it("take the stage's glow as the ground does: the light's own edit runs first, and the sway's on top of it", () => {
    const uPool = { value: new THREE.Color(0xff7a30) }, scene = new THREE.Scene();
    const { meshes } = buildTrees(scene, fixed.trees, { lit: (material: unknown) => takesPool(material, uPool), phone: false }) as unknown as Built;
    for (const mesh of meshes) {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      mesh.material.onBeforeCompile(shader);
      expect(shader.uniforms.uPool).toBe(uPool);
      // A tree's point stands where its instance puts it, swayed.
      expect(shader.vertexShader).toContain("vPoolAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
      expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
      expect(shader.vertexShader).toContain("uniform float uWind;");
      expect(mesh.material.vertexColors).toBe(true);
    }
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
    // The boom is 20 m on a phone and trails a run by a few more, and a crown reaches 5 m past its tree.
    expect(SQUARE).toBeGreaterThanOrEqual(20 + 4 + CROWN_R_MAX);
    // Far out at sea there is nothing.
    expect(made.columns(400, 400, [])).toEqual([]);
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
      const trees = fixed.trees.slice(0, phone ? TARGET.phone : TARGET.desktop), { columns } = built(trees, phone);
      const hold: Column[] = [STAGE_COLUMN], avatar = buildAvatar(new THREE.Scene(), [], { phone, reduced: false, columns: hold as never[] });
      const camera = new THREE.PerspectiveCamera(phone ? 75 : 60, 1, 0.5, 900), limits = walkLimits([], trees);
      let cut = 0, frames = 0, nearest = Infinity;
      const inside: string[] = [];
      // Through each grove's middle, four ways, at a walk and at a run.
      for (const [gx, gz, r] of GROVES) for (let k = 0; k < 4; k++) for (const run of [1, 1.6]) {
        const a = (k * Math.PI) / 4 + 0.3, heading = Math.atan2(Math.cos(a), Math.sin(a)), walker = { x: gx + (r + 12) * Math.cos(a), z: gz + (r + 12) * Math.sin(a), heading, pitch: k === 3 ? -0.5 : 0 };
        const pace = (12 * run) / 60;
        for (let f = 0; f * pace < 2 * r + 24; f++) {
          walker.x -= Math.sin(heading) * pace; walker.z -= Math.cos(heading) * pace;
          confine(walker, limits);
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
          if (reach < (phone ? 20 : 11) * 0.8) cut += 1;
          frames += 1;
        }
      }
      expect(inside).toEqual([]);
      expect(nearest).toBeGreaterThanOrEqual(2.5 - 1e-6);
      // The trees do draw it in, and leave it at its length for most of a walk through them.
      expect(cut).toBeGreaterThan(0);
      expect(cut / frames).toBeLessThan(0.35);
    }
  }, 30_000);

  it("keeps the boom's foot 2.9 m from every crown wherever a walker may stand, so the camera has its 2.5 m and a crown never raises it", () => {
    let nearest = Infinity;
    eachTree((t, w) => {
      if (w !== fixed && w !== WORLDS[9] && w !== WORLDS[25]) return;
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
  it("grows no tuft and lays no stone within TRUNK_ROOM of a trunk, and the island hands back the light the trees take", () => {
    const trees = fixed.trees, trunks = trunkIndex(trees);
    expect(trunks.near(trees[0].x + 1, trees[0].z, 2)).toBe(true);
    expect(trunks.near(trees[0].x + 2.1, trees[0].z, 2)).toBe(false);
    for (const [grid, phone] of [[80, false], [52, true]] as const) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const { flora, lit } = buildIsland(scene, grid, phone, loop, trunks);
      const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
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
      // The same land grows more round the trunks when it is told of none.
      const bare = new THREE.Scene();
      bare.fog = new THREE.Fog(0x000000, 100, 400);
      const without = buildIsland(bare, grid, phone, loop).flora;
      let inside = 0;
      for (let i = 0; i < without.tufts.count; i++) {
        without.tufts.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        if (trunks.near(at.x, at.z, TRUNK_ROOM)) inside += 1;
      }
      expect(inside).toBeGreaterThan(0);
      // The light: a material takes the stage's glow, as takesPool gives it.
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      lit(new THREE.MeshLambertMaterial()).onBeforeCompile(shader);
      expect(shader.uniforms.uPool).toBeDefined();
      expect(shader.fragmentShader).toContain("uniform vec3 uPool;");
    }
    expect(TRUNK_ROOM).toBeGreaterThan(TRUNK_R_MAX + 1);
  });
});
