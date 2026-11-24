import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import {
  buildCrowd, COLOURS, CUT, CYCLE, DROP, FEET, figureGeometry, FOLD, FOOT, HAND, HANG, inView, LEG, MOST, MOVES, only, OUTLINE, outlineOf, PART,
  partingOptions, people, PLAIN_LEAVES_OUT, plainly, PROP_EVERY, PROPS, SEAT, SHARE, SHOULDER_X, SHOULDER_Y, TALL, tone, TOP, wearing, without,
} from "../../../public/world/crowd.js";
import { FACING, height, STAGE, STAGE_COLUMN, TEST_POSES } from "../../../public/world/ground.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { buildPath, buildWalkLine, layout, placeLandmarks } from "../../../public/world/path.js";
import { budgetFor } from "../../../public/world/quality.js";
import { gathering, keepOuts, PERSON, seats as seatsOf } from "../../../public/world/seats.js";

// buildCrowd builds the crowd here from the world's own modules and three, on the world's path and the bears' line 7 m to its left as
// main.js lays them, with two landmarks of the test's own in the front rows, at every seat on the hill. seats.js runs as it is, and
// pass-through mocks keep what buildCrowd hands seats() and parting().

type Around = { path: number[][]; line: number[][]; landmarks: number[][] };
type Seat = { x: number; z: number; r: number; sit: boolean; face: number; blanket: number };
const kept = vi.hoisted(() => ({ around: [] as Around[], options: [] as Record<string, unknown>[], placed: [] as Seat[][], idle: false }));

vi.mock("../../../public/world/seats.js", async (original) => {
  const seats = await original<{
    seats: (around: Around, seed?: number) => Seat[];
    parting: (placed: Seat[], options: Record<string, unknown>) => unknown;
  }>();
  return {
    ...seats,
    seats: (around: Around, seed?: number) => {
      kept.around.push(around);
      return seats.seats(around, seed);
    },
    parting: (placed: Seat[], options: Record<string, unknown>) => {
      kept.options.push(options);
      kept.placed.push(placed);
      // While `idle` is set, a parting that says each step that something changed, and changes nothing.
      const made = seats.parting(placed, options) as object;
      return kept.idle ? Object.assign(Object.create(made), { step: () => true }) : made;
    },
  };
});

// Out from the stage's centre along its axis, and across it.
const ux = Math.sin(FACING), uz = Math.cos(FACING), nx = uz, nz = -ux;

// Landmarks: 6 m cubes standing on the hill, each [metres out from the stage's centre, metres to the side of its axis].
const SIDE = 6;
const cubes = (where: number[][]) => where.map(([out, across]) => {
  const x = STAGE[0] + out * ux + across * nx, z = STAGE[1] + out * uz + across * nz;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(SIDE, SIDE, SIDE));
  cube.position.set(x, height(x, z) + SIDE / 2, z);
  return cube;
});
// The first crowd's: 24 m out, 7 m to either side of the axis.
const landmarkAt = [-7, 7].map((b) => [STAGE[0] + 24 * ux + b * nx, STAGE[1] + 24 * uz + b * nz]);
const landmarks = cubes([[24, -7], [24, 7]]);

const path = buildPath(), line = buildWalkLine(path, 7);
const scene = new THREE.Scene();
const crowd = buildCrowd(scene, { count: Infinity, path, line, landmarks });
// A phone's crowd on the same hill: its tier's 150 figures, built plain. And a desktop's on other hills, with no landmark near the
// crowd and with three of them elsewhere among it, since the landmarks, which differ by show, decide which seats are taken.
const phone = buildCrowd(new THREE.Scene(), { count: 150, path, line, landmarks, plain: true });
const hills = [crowd, buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [] }),
  buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: cubes([[18, 10], [33, -16], [46, 5]]) })];
// Each crowd's seats, as buildCrowd handed them to parting(), and its people.
const placedOf = new Map([crowd, phone, hills[1], hills[2]].map((c, k) => [c, kept.placed[k]]));
// Three shows' own hills, each named by its date (a place in a list moves as shows are added): the landmarks its songs raise, placed as
// main.js places them, and the crowd among them as a desktop draws it and as a phone does. The fixed day's second set opens at track
// 7; the maps do not say where another show's does, so it is taken to open partway, as trees.test.ts takes it.
const MAPS = new URL("../../../public/maps/", import.meta.url), FIXED = "1986-07-04";
function crowdOf(date: string, small = false, count = small ? 150 : 350): typeof crowd {
  const map = JSON.parse(readFileSync(new URL(`${date}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
  const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
  const raised = placeLandmarks(new THREE.Scene(), path, tracks, true, makeBuilders(small), layout(tracks, date === FIXED ? 7 : Math.floor(tracks.length * 0.45), path), line);
  return buildCrowd(new THREE.Scene(), { count, path, line, landmarks: raised, plain: small });
}
const SHOWS = [FIXED, "1970-08-30", "1990-12-09"].map((date) => ({ date, desktop: crowdOf(date), phone: crowdOf(date, true) }));
const peopleOf = (c: typeof crowd) => people(placedOf.get(c)!);

// Each figure's seat and scale, as its matrix places and scales it. buildCrowd stands its figures at the scale that makes the
// standard figure PERSON tall.
const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), size = new THREE.Vector3();
const seats: [number, number][] = [], scales: number[] = [];
for (let i = 0; i < crowd.count; i++) {
  matrix.fromArray(crowd.each.matrix, 16 * i);
  at.setFromMatrixPosition(matrix);
  seats.push([at.x, at.z]);
  scales.push(size.setFromMatrixScale(matrix).y);
}
const scale = PERSON / TALL, BIG = scale * 1.08;
const own: Record<string, number> = partingOptions(scale);
// Where the parting has stepped each figure from its seat, [dx, dy, dz, stillness] each.
const offset: Float32Array = crowd.each.offset;

// Walks the visitor `frames` frames from `[x, z]` along `[wx, wz]`, a unit vector, at 12 m/s: 0.2 m a frame of 1/60 s, held as main.js
// holds the walker (the crowd's hold before the step, its part after it), their bear's head 0.8 m ahead of its feet (avatar.js). After
// each frame, `each(i)` for each figure.
function walk([x, z]: number[], [wx, wz]: number[], frames: number, each: (i: number) => void) {
  const walker = { x, z, heading: Math.atan2(-wx, -wz) };
  const visitor = () => {
    const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading);
    return { feet: { x: walker.x, z: walker.z }, head: { x: walker.x + 0.8 * fx, z: walker.z + 0.8 * fz } };
  };
  crowd.part(0, visitor().feet, visitor().head, false);
  for (let f = 0; f < frames; f++) {
    walker.x -= Math.sin(walker.heading) * 0.2;
    walker.z -= Math.cos(walker.heading) * 0.2;
    crowd.hold(walker);
    const v = visitor();
    crowd.part(1 / 60, v.feet, v.head, false);
    for (let i = 0; i < crowd.count; i++) each(i);
  }
}

// ---------- the shader, run here ----------

// The crowd's vertex shader is written with plain numbers alone, so its own text runs here as JavaScript once `float` and `bool` read
// `let`: what the tests below measure is what the shader does, and no copy of it. `dance` is what it adds after begin_vertex, which
// moves a vertex, and `tones` what it adds after color_vertex, which colours one.
type Vec = { x: number; y: number; z: number; w: number };
type Rgb = { r: number; g: number; b: number };
const compiled = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.lambert.vertexShader as string, fragmentShader: THREE.ShaderLib.lambert.fragmentShader as string };
crowd.mesh.material.onBeforeCompile(compiled);
const added = (after: string) => compiled.vertexShader.split(after)[1].split("#include <")[0];
const dance = added("#include <begin_vertex>"), tones = added("#include <color_vertex>");
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const GLSL: Record<string, (...v: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, min: Math.min, max: Math.max, clamp,
  mod: (a, b) => a - b * Math.floor(a / b),
  fract: (v) => v - Math.floor(v),
  mix: (a, b, t) => a + (b - a) * t,
  smoothstep: (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
  atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
};
const READS = ["transformed", "vColor", "aMark", "aFig", "aPart", "aRise", "aBody", "aWear", "aCut", "aTone", "uBeat", "uDance", "uRise", "uSit"];
// The GLSL functions are handed over once, as the made function's own names, and never with each of its millions of calls.
const asJs = (glsl: string) =>
  new Function(...Object.keys(GLSL), `return function (${READS.join(", ")}) {${glsl.replace(/\b(?:float|bool)\s+/g, "let ")}\n};`)(...Object.values(GLSL)) as (...reads: unknown[]) => void;
const runDance = asJs(dance), runTones = asJs(tones);

// A vertex of the figure, with its marks; a figure, with the numbers its corners carry and its scale across and up, in metres a
// unit; and a pose: the phase in beats, how far the crowd dances, the build-up and the sit as main.js gives them, how still the
// parting holds the figure (aPart.w) and how far it lets its arms rise (aRise).
type Vertex = { x: number; y: number; z: number; mark: Vec };
type Figure = { i: number; across: number; up: number; fig: Vec; body: Vec; wear: Vec; cut: Vec; tone: Vec; top: Rgb };
type Pose = { beat: number; dance: number; rise?: number; sit?: number; still?: number; rising?: number };
const vec = (attribute: { getX(i: number): number; getY(i: number): number; getZ(i: number): number; getW(i: number): number }, i: number): Vec =>
  ({ x: attribute.getX(i), y: attribute.getY(i), z: attribute.getZ(i), w: attribute.getW(i) });
// The geometry's vertices, each once, however many triangles share it.
function verticesOf(geo: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number; getW(i: number): number } }) {
  const position = geo.getAttribute("position"), mark = geo.getAttribute("aMark"), seen = new Map<string, Vertex>();
  for (let k = 0; k < position.count; k++) {
    const v = { x: position.getX(k), y: position.getY(k), z: position.getZ(k), mark: vec(mark, k) };
    seen.set([v.x, v.y, v.z, v.mark.x, v.mark.y, v.mark.w].join(), v);
  }
  return [...seen.values()];
}
// A figure's row of four in one of the crowd's own arrays (`each`), a figure to a row.
const row = (array: Float32Array, i: number): Vec => ({ x: array[4 * i], y: array[4 * i + 1], z: array[4 * i + 2], w: array[4 * i + 3] });
function figuresOf(c: typeof crowd): Figure[] {
  const e = c.each;
  return Array.from({ length: c.count }, (_, i) => {
    size.setFromMatrixScale(matrix.fromArray(e.matrix, 16 * i));
    return { i, across: size.x, up: size.y, fig: row(e.aFig, i), body: row(e.aBody, i), wear: row(e.aWear, i), cut: row(e.aCut, i), tone: row(e.aTone, i),
      top: { r: e.colour[3 * i], g: e.colour[3 * i + 1], b: e.colour[3 * i + 2] } };
  });
}
const wears = (f: Figure, v: Vertex) => v.mark.y === 0 || Math.floor(f.wear.x / v.mark.y) % 2 === 1;
// Where the shader puts a vertex of a figure in a pose, in the figure's own units. The pose's build-up and sit are the figure's own:
// the uniforms are set so that this figure has risen `rise` and sat `sit`, whatever its row and its turn.
const moved = { x: 0, y: 0, z: 0 }, part: Vec = { x: 0, y: 0, z: 0, w: 0 };
function put(f: Figure, v: Vertex, pose: Pose) {
  moved.x = v.x; moved.y = v.y; moved.z = v.z;
  part.w = pose.still ?? 0;
  const rise = pose.rise ?? 0, sit = pose.sit ?? 0;
  runDance(moved, null, v.mark, f.fig, part, pose.rising ?? 1, f.body, f.wear, f.cut, f.tone, pose.beat, pose.dance,
    rise > 0 ? 0.3 + 0.6 * f.fig.z + 0.1 * rise : 0, sit > 0 ? (sit + 0.5 * f.fig.y) / 1.5 : 0);
  return moved;
}
// The beats a figure is looked at through a cycle: 16 across it, and those where each of its moves' waves stands at its ends.
function beatsOf(f: Figure) {
  const beats = Array.from({ length: 16 }, (_, k) => (k * CYCLE) / 16 + 0.13);
  for (let k = 0; k < CYCLE; k++) beats.push(k - 0.12 * f.fig.y, k + 0.5 - 0.12 * f.fig.y);
  for (const k of [0.5, 1.5]) beats.push(k - f.fig.y);
  for (const k of [1, 3]) beats.push(k - 4 * f.fig.y);
  for (const k of [0, 2, 4, 6]) beats.push(k - 8 * f.fig.y);
  return beats.map((b) => ((b % CYCLE) + CYCLE) % CYCLE);
}
const rich = verticesOf(crowd.figure), plain = verticesOf(phone.figure);
const figures = figuresOf(crowd), phones = figuresOf(phone);
const moveOf = (f: Figure) => MOVES[f.wear.y % 8];
// Relative luminance of a linear colour.
const light = ({ r, g, b }: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("the crowd, as buildCrowd builds it", () => {
  it("parts its figures with the options for the standard figure's size, PERSON tall, and stands none taller than the largest those allow", () => {
    expect(kept.options.length).toBeGreaterThan(0);
    const options = kept.options[0];
    expect(Object.keys(options).sort()).toEqual([...Object.keys(own), "keeps"].sort());
    const off = Object.keys(own).filter((name) => !(Math.abs((options[name] as number) - own[name]) < 1e-5));
    expect(off.map((name) => `${name}: ${options[name]}, for ${own[name]}`)).toEqual([]);
    // A figure's head stands TALL over its feet and as much higher as its legs are longer; children stand a little over half PERSON.
    const heads = figures.map((f) => f.up * (TALL + LEG * (f.body.z - 1)));
    expect(Math.max(...heads)).toBeLessThanOrEqual(1.08 * PERSON + 1e-6);
    expect(Math.max(...heads)).toBeGreaterThan(1.05 * PERSON);
    expect(Math.min(...heads)).toBeGreaterThan(0.5 * PERSON);
    expect(Math.min(...heads)).toBeLessThan(0.7 * PERSON);
  });

  it("keeps its figures' hands clear of the stage's solids as they make room for a walk across the front rows", () => {
    // Across the front rows, 15 m from the stage's centre at the nearest. No figure's hands reach farther than `wide` from its axis
    // (partingOptions, for figures its size), so each figure, at its seat or stepped aside, stands that far past the stage's solids
    // (STAGE_COLUMN) from the stage's centre.
    const clear = STAGE_COLUMN.r + own.wide;
    let stepped = 0, nearest = Infinity;
    walk([STAGE[0] + 15 * ux - 20 * nx, STAGE[1] + 15 * uz - 20 * nz], [nx, nz], 200, (i) => {
      if (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0) stepped += 1;
      nearest = Math.min(nearest, Math.hypot(seats[i][0] + offset[4 * i] - STAGE[0], seats[i][1] + offset[4 * i + 2] - STAGE[1]));
    });
    expect(stepped).toBeGreaterThan(0);
    expect(nearest).toBeGreaterThanOrEqual(clear - 1e-3);
  });

  it("keeps its figures clear of what their seats keep clear of as they make room: the path, the bears' line and each landmark's circle", () => {
    // What the seats keep clear of (keepOuts, each [x, z, distance]): the points of the path and of the bears' line that buildCrowd
    // hands seats(), and a circle round each landmark's bounds, which for a cube runs through its corners.
    const { path: onPath, line: onLine } = kept.around[0];
    const keeps = {
      path: keepOuts({ path: onPath, line: [], landmarks: [] }),
      line: keepOuts({ path: [], line: onLine, landmarks: [] }),
      landmarks: keepOuts({ path: [], line: [], landmarks: landmarkAt.map(([x, z]) => [x, z, Math.hypot(SIDE, SIDE) / 2]) }),
    };
    // How far past each the figures stand at the nearest, at their seats or stepped aside.
    const past: Record<string, number> = { path: Infinity, line: Infinity, landmarks: Infinity };
    let stepped = 0;
    const check = (i: number) => {
      const x = seats[i][0] + offset[4 * i], z = seats[i][1] + offset[4 * i + 2];
      if (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0) stepped += 1;
      for (const [name, list] of Object.entries(keeps))
        for (const [kx, kz, d] of list) past[name] = Math.min(past[name], Math.hypot(x - kx, z - kz) - d);
    };
    // Back across the front rows, 15 m from the stage's centre at the nearest, past the landmarks.
    walk([STAGE[0] + 15 * ux + 20 * nx, STAGE[1] + 15 * uz + 20 * nz], [-nx, -nz], 200, check);
    // Past the figure nearest the line's keep, 1 m from its seat on the side away from the line, square to the way from it to the line's
    // nearest kept point, with the line on the walker's left.
    let nearest = { gap: Infinity, i: 0, k: [0, 0, 0] };
    for (const k of keeps.line)
      seats.forEach(([x, z], i) => {
        const gap = Math.hypot(x - k[0], z - k[1]) - k[2];
        if (gap < nearest.gap) nearest = { gap, i, k };
      });
    const [sx, sz] = seats[nearest.i], to = Math.hypot(nearest.k[0] - sx, nearest.k[1] - sz);
    const dx = (nearest.k[0] - sx) / to, dz = (nearest.k[1] - sz) / to;
    walk([sx - dx + 20 * dz, sz - dz - 20 * dx], [-dz, dx], 200, check);
    expect(stepped).toBeGreaterThan(0);
    const inside = Object.entries(past).filter(([, d]) => d < -1e-3);
    expect(inside.map(([name, d]) => `${name}: ${(-d).toFixed(3)} m inside`)).toEqual([]);
  });

  it("is one mesh in one draw call, of one geometry in one piece on one material, that holds each figure's body and the parts it wears and nothing it does not", () => {
    // A second mesh, a second material or a group in the geometry would each be a draw call more a frame (CLAUDE.md, draw calls).
    expect(scene.children).toEqual([crowd.mesh]);
    expect([crowd.mesh.isMesh, crowd.mesh.isInstancedMesh ?? false]).toEqual([true, false]);
    expect(crowd.mesh.children).toEqual([]);
    expect(Array.isArray(crowd.mesh.material)).toBe(false);
    expect(crowd.mesh.geometry.groups).toEqual([]);
    expect(crowd.count).toBe(placedOf.get(crowd)!.length);
    expect(phone.count).toBe(150);
    // A frame's cost goes with the triangles sent to be drawn, so the mesh holds no part that its figure does not wear: an instance
    // of the whole figure sent 1,117 triangles to show 513 of them. Figure by figure, on a desktop and on a phone: its corners are
    // those of its body and of each part it wears, each once, and every one of them carries the figure's own numbers; its faces are
    // those parts' faces, every one and no other, between its own corners; and what it wears is drawn before its body, so that a
    // renderer that tests depth first shades nothing of the body that its clothes cover.
    const key = (x: number, y: number, z: number, m: Vec) => [x, y, z, m.x, m.y, m.z, m.w].join();
    for (const [c, list] of [[crowd, figures], [phone, phones]] as const) {
      const geo = c.mesh.geometry, e = c.each, position = geo.getAttribute("position"), mark = geo.getAttribute("aMark"), index = geo.index;
      const own = c.figure.getAttribute("position"), marks = c.figure.getAttribute("aMark"), facesOf = new Map<number, string[]>();
      for (let t = 0; t < own.count; t += 3) {
        const face = [0, 1, 2].map((k) => key(own.getX(t + k), own.getY(t + k), own.getZ(t + k), vec(marks, t + k))).join("|");
        facesOf.set(marks.getY(t), [...(facesOf.get(marks.getY(t)) ?? []), face]);
      }
      expect([c.corners.length, c.faces.length, c.corners[0], c.faces[0]]).toEqual([c.count + 1, c.count + 1, 0, 0]);
      expect([position.count, index.count]).toEqual([c.corners[c.count], c.faces[c.count]]);
      const wrong = { corners: 0, numbers: 0, faces: 0, outside: 0, order: 0 };
      const rows: [string, Float32Array, number][] = [["aFig", e.aFig, 4], ["aBody", e.aBody, 4], ["aWear", e.aWear, 4], ["aCut", e.aCut, 4], ["aTone", e.aTone, 4], ["aSize", e.aSize, 4],
        ["aPlace", e.aPlace, 3], ["color", e.colour, 3], ["aPart", e.offset, 4], ["aRise", e.rising, 1]];
      for (const f of list) {
        const from = c.corners[f.i], to = c.corners[f.i + 1], seen = new Set<string>();
        for (let k = from; k < to; k++) {
          seen.add(key(position.getX(k), position.getY(k), position.getZ(k), vec(mark, k)));
          for (const [name, array, size] of rows) for (let q = 0; q < size; q++) if (geo.getAttribute(name).array[size * k + q] !== array[size * f.i + q]) wrong.numbers += 1;
        }
        if (seen.size !== to - from) wrong.corners += 1;
        const worn = [...facesOf.keys()].filter((bit) => bit === 0 || Math.floor(f.wear.x / bit) % 2 === 1), drawn: string[] = [];
        let body = -1, last = -1;
        for (let t = c.faces[f.i]; t < c.faces[f.i + 1]; t += 3) {
          const ks = [0, 1, 2].map((q) => index.getX(t + q) as number);
          if (!ks.every((k) => k >= from && k < to)) wrong.outside += 1;
          drawn.push(ks.map((k) => key(position.getX(k), position.getY(k), position.getZ(k), vec(mark, k))).join("|"));
          if (mark.getY(ks[0]) === 0) { if (body < 0) body = t; } else last = t;
        }
        if (drawn.sort().join(" ") !== worn.flatMap((bit) => facesOf.get(bit)!).sort().join(" ")) wrong.faces += 1;
        if (body < 0 || last > body) wrong.order += 1;
      }
      expect(wrong).toEqual({ corners: 0, numbers: 0, faces: 0, outside: 0, order: 0 });
      // So the mesh is the triangles its figures wear, and far fewer corners than three to a triangle.
      const wornFaces = list.reduce((sum, f) => sum + [...facesOf.keys()].filter((bit) => bit === 0 || Math.floor(f.wear.x / bit) % 2 === 1).reduce((n, bit) => n + facesOf.get(bit)!.length, 0), 0);
      expect(index.count / 3).toBe(wornFaces);
      expect(position.count).toBeLessThan(0.8 * (index.count / 3));
    }
  });

  it("stands each corner where its figure's matrix would, turned, sized and set at its seat, and stepped where the parting has stepped the figure", () => {
    // The mesh is not instanced, so no matrix places a figure: each corner carries its figure's seat, its breadth and height and its
    // turn, and the shader's own two lines put it there. They are run here against the matrix buildCrowd made of the same numbers.
    const placing = compiled.vertexShader.slice(compiled.vertexShader.indexOf("float wide ="), compiled.vertexShader.indexOf("vec4 mvPosition"));
    expect(placing.split(";").length).toBe(3);
    expect(compiled.vertexShader).toContain("vec4 mvPosition = modelViewMatrix * vec4(putX, putY, putZ, 1.0);");
    expect(compiled.vertexShader).not.toContain("#include <project_vertex>");
    const place = new Function("transformed", "aSize", "aPlace", "aPart", `${placing.replace(/\bfloat\s+/g, "let ")}\nreturn [putX, putY, putZ];`) as (...reads: unknown[]) => number[];
    const e = crowd.each, want = new THREE.Vector3();
    let off = 0, looked = 0;
    for (const f of figures.filter((_, k) => k % 4 === 0)) for (const v of rich.filter((_, k) => k % 7 === 0)) for (const stepped of [{ x: 0, y: 0, z: 0, w: 0 }, { x: 0.7, y: -0.1, z: -0.4, w: 1 }]) {
      const got = place(v, row(e.aSize, f.i), { x: e.aPlace[3 * f.i], y: e.aPlace[3 * f.i + 1], z: e.aPlace[3 * f.i + 2] }, stepped);
      want.set(v.x, v.y, v.z).applyMatrix4(matrix.fromArray(e.matrix, 16 * f.i));
      off = Math.max(off, Math.abs(got[0] - want.x - stepped.x), Math.abs(got[1] - want.y - stepped.y), Math.abs(got[2] - want.z - stepped.z));
      looked += 1;
    }
    expect(looked).toBeGreaterThan(10000);
    // To a hundredth of a millimetre: the numbers are single floats of places some tens of metres from the island's middle.
    expect(off).toBeLessThan(1e-5);
  });

  it("turns each figure the way its seat faces, and hands the island the ground its figures stand: their seats, the blankets they sit on and the aisle", () => {
    // A figure faces +z in its own units: its matrix turns that to (sin, cos) of its seat's `face`, to friends, a ring's middle or away.
    for (const c of [crowd, phone, ...SHOWS.map((s) => s.desktop)]) {
      const placed = c === crowd || c === phone ? placedOf.get(c)! : null;
      for (let i = 0; i < c.count; i++) {
        matrix.fromArray(c.each.matrix, 16 * i);
        const turn = Math.atan2(c.each.matrix[16 * i + 8], c.each.matrix[16 * i + 10]), seat = c.ground.seats[i] as Seat;
        expect(Math.abs(Math.atan2(Math.sin(turn - seat.face), Math.cos(turn - seat.face)))).toBeLessThan(1e-5);
        if (placed) expect(seat).toBe(placed[i]);
      }
    }
    // The fixed day's own gathering on a desktop, and on a phone, which seats the first 150: the blankets any of them sits on and no
    // other, and the day's aisle.
    for (const c of [crowd, phone]) {
      const day = gathering(0) as { blankets: unknown[]; aisle: number[][] }, ground = c.ground as { seats: Seat[]; blankets: unknown[]; aisle: number[][] };
      expect(ground.seats.length).toBe(c.count);
      expect(ground.aisle).toBe(day.aisle);
      expect(ground.blankets).toEqual(day.blankets.filter((_, k) => ground.seats.some((s) => s.blanket === k)));
      expect(ground.blankets.length).toBeGreaterThan(0);
    }
    expect(phone.ground.blankets.length).toBeLessThan(crowd.ground.blankets.length);
    // Another day's (main.js gives buildCrowd the day's seed): its own gathering, its seats and its aisle.
    const other = buildCrowd(new THREE.Scene(), { count: 150, path, line, landmarks, plain: true, seed: 7 });
    expect(other.ground.aisle).toBe((gathering(7) as { aisle: number[][] }).aisle);
    expect(other.ground.aisle).not.toEqual(crowd.ground.aisle);
    expect(other.ground.seats).toEqual(kept.placed[kept.placed.length - 1]);
    expect((other.ground.seats as Seat[]).every((s) => (gathering(7) as { seats: Seat[] }).seats.some((t) => t.x === s.x && t.z === s.z))).toBe(true);
  });

  it("draws the front of the crowd when asked for fewer figures, and is left out of a frame that has none of its figures in view", () => {
    // The seats run front first, so the first figures are the front rows: the quality ladder's half crowd (main.js) is the
    // mesh's first faces, up to the last of the figure that ends the half.
    const geo = crowd.mesh.geometry, half = Math.ceil(crowd.count / 2);
    expect([crowd.shown, geo.drawRange.start, geo.drawRange.count]).toEqual([crowd.count, 0, Infinity]);
    crowd.show(half);
    expect([crowd.shown, geo.drawRange.start, geo.drawRange.count]).toEqual([half, 0, crowd.faces[half]]);
    expect(crowd.faces[half]).toBeGreaterThan(0.4 * crowd.faces[crowd.count]);
    expect(crowd.faces[half]).toBeLessThan(0.6 * crowd.faces[crowd.count]);
    // three culls a mesh by one sphere round all of it, which is about the crowd's own breadth across: a camera at its edge that
    // looks away from it, or one over it that looks up, has that sphere in view and no figure. Each figure has its own sphere here.
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.3, 600), middle = new THREE.Vector3();
    for (const [x, z] of seats) middle.add(at.set(x, height(x, z), z));
    middle.divideScalar(seats.length);
    const look = (from: number[], to: number[]) => { camera.position.set(from[0], from[1], from[2]); camera.lookAt(to[0], to[1], to[2]); return crowd.cull(camera) as boolean; };
    const out = Math.max(...seats.map(([x, z]) => (x - STAGE[0]) * ux + (z - STAGE[1]) * uz)) + 12;
    const sphere = geo.boundingSphere, behind = [STAGE[0] + out * ux, height(STAGE[0] + out * ux, STAGE[1] + out * uz) + 6, STAGE[1] + out * uz];
    expect(sphere.radius).toBeGreaterThan(15);
    expect(look(behind, [STAGE[0], 0, STAGE[1]])).toBe(true);
    expect(crowd.mesh.visible).toBe(true);
    // From the same place, turned round: the sphere round all the crowd is still within the view's sides or behind it, no figure is.
    expect(look(behind, [STAGE[0] + 200 * ux, 0, STAGE[1] + 200 * uz])).toBe(false);
    expect(crowd.mesh.visible).toBe(false);
    // From 12 m over the crowd's own middle looking straight up: inside that sphere, and no figure in view.
    expect(look([middle.x, middle.y + 12, middle.z], [middle.x + 0.01, middle.y + 60, middle.z])).toBe(false);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsSphere(sphere)).toBe(true);
    // A figure's own sphere holds every corner it wears through every pose, with room: at the dance's most, its arms up at the
    // build-up's peak, and seated. And the mesh's sphere, which three culls it by, holds every figure's, and grows by as far as
    // the parting has stepped the farthest figure from its seat.
    const ball: Float32Array = crowd.each.ball, where = new THREE.Vector3();
    let out2 = -Infinity, loose = -Infinity, looked = 0;
    for (const f of figures.filter((_, k) => k % 3 === 0)) {
      matrix.fromArray(crowd.each.matrix, 16 * f.i);
      for (const v of rich.filter((v) => wears(f, v))) for (const pose of [{ beat: 0.5, dance: 1.6 }, { beat: 2.2, dance: 1.6, rise: 1 }, { beat: 1.1, dance: 1.6, sit: 1 }]) {
        const p = put(f, v, pose);
        where.set(p.x, p.y, p.z).applyMatrix4(matrix);
        out2 = Math.max(out2, Math.hypot(where.x - ball[4 * f.i], where.y - ball[4 * f.i + 1], where.z - ball[4 * f.i + 2]) - ball[4 * f.i + 3]);
        looked += 1;
      }
      loose = Math.max(loose, Math.hypot(ball[4 * f.i] - sphere.center.x, ball[4 * f.i + 1] - sphere.center.y, ball[4 * f.i + 2] - sphere.center.z) + ball[4 * f.i + 3] - sphere.radius);
    }
    expect(looked).toBeGreaterThan(70000);
    // The nearest any corner comes to its figure's sphere is 0.19 m inside it: a hand, up at the build-up's peak.
    expect(out2).toBeLessThan(-0.1);
    expect(out2).toBeGreaterThan(-0.5);
    expect(loose).toBeLessThanOrEqual(1e-9);
    // As it is built, before any step of the parting: a crowd nothing has walked through. Its sphere holds every figure's, and is
    // no larger than the farthest of them needs.
    const fresh = hills[2], round = fresh.mesh.geometry.boundingSphere, balls: Float32Array = fresh.each.ball;
    const reach = Array.from({ length: fresh.count }, (_, i) => Math.hypot(balls[4 * i] - round.center.x, balls[4 * i + 1] - round.center.y, balls[4 * i + 2] - round.center.z) + balls[4 * i + 3]);
    expect(fresh.count).toBeGreaterThan(200);
    expect(round.radius).toBeCloseTo(Math.max(...reach), 9);
    expect(round.radius).toBeGreaterThan(15);
    const farthest = () => Math.max(...figures.map((f) => Math.hypot(offset[4 * f.i], offset[4 * f.i + 1], offset[4 * f.i + 2])));
    const atRest = sphere.radius - farthest();
    walk([seats[0][0] + 3, seats[0][1]], [-1, 0], 20, () => {});
    expect(farthest()).toBeGreaterThan(1);
    expect(sphere.radius).toBeCloseTo(atRest + farthest(), 5);
    const walked = farthest();
    crowd.part(0, { x: 0, z: 0 }, { x: 0.8, z: 0 }, true);
    expect(farthest()).not.toBe(walked);
    expect(sphere.radius).toBeCloseTo(atRest + farthest(), 5);
    // Only the figures that are drawn count, each where the parting has stepped it. With the first figure alone drawn: a camera
    // 3 m behind it sees it, and turned round sees nothing that is drawn, though the rest of the crowd stands there.
    const [x0, z0] = seats[0], y0 = height(x0, z0) + 1.2, near = [x0 + 3 * ux, y0, z0 + 3 * uz], away = [x0 + 60 * ux, y0, z0 + 60 * uz];
    crowd.show(1);
    expect([look(near, [x0, y0, z0]), look(near, away)]).toEqual([true, false]);
    // Stepped 40 m to the side, it is seen there and not at its seat.
    const stepped = [x0 + 40 * nx, y0, z0 + 40 * nz], was = [offset[0], offset[1], offset[2]];
    offset[0] += 40 * nx; offset[2] += 40 * nz;
    expect([look(near, [x0, y0, z0]), look([stepped[0] + 3 * ux, y0, stepped[2] + 3 * uz], stepped)]).toEqual([false, true]);
    [offset[0], offset[1], offset[2]] = was;
    crowd.show(0);
    expect([crowd.shown, look(behind, [STAGE[0], 0, STAGE[1]])]).toEqual([0, false]);
    crowd.show(crowd.count + 50);
    expect([crowd.shown, geo.drawRange.count, look(near, away)]).toEqual([crowd.count, crowd.faces[crowd.count], true]);
    crowd.cull(camera);
  });

  it("needs 13 of the 16 vertex attribute slots a WebGL program is sure of, and holds 168 bytes to a corner", () => {
    // WebGL promises a program 16 attribute slots and no more, and a program that asks for a 17th does not link: the crowd would not
    // draw at all on a device that gives only what is promised. What the crowd's own shader declares, a slot each:
    const declared = [...compiled.vertexShader.split("#include <common>")[1].split("#include <")[0].matchAll(/attribute (float|vec[234]|mat[234]) (\w+);/g)]
      .map(([, type, name]) => ({ name, slots: type.startsWith("mat") ? Number(type[3]) : 1 }));
    expect(declared.map((d) => d.name).sort()).toEqual(["aBody", "aCut", "aFig", "aMark", "aPart", "aPlace", "aRise", "aSize", "aTone", "aWear"]);
    // And three's own for a mesh with a colour to each corner: a corner's place, its normal and its colour. three's Lambert vertex
    // shader reads `normal` whatever the shading (beginnormal_vertex), so a linked program may keep its slot though the flat-shaded
    // crowd lights no face by it and its geometry carries none.
    expect(compiled.vertexShader).toContain("#include <beginnormal_vertex>");
    expect(THREE.ShaderChunk.beginnormal_vertex).toContain("vec3( normal )");
    const threes = { position: 1, normal: 1, color: 1 };
    const slots = declared.reduce((sum, d) => sum + d.slots, 0) + Object.values(threes).reduce((sum, n) => sum + n, 0);
    expect(slots).toBe(13);
    expect(slots).toBeLessThanOrEqual(16);
    // The geometry holds what the shader declares, each corner's place and its colour, and nothing else: no normal, no texture
    // coordinates. Every corner repeats its figure's numbers, which is what one mesh of what is worn costs: 42 numbers, 168 bytes.
    for (const c of [crowd, phone]) {
      const attributes = c.mesh.geometry.attributes as Record<string, { itemSize: number; array: Float32Array; isInstancedBufferAttribute?: boolean }>;
      expect(Object.keys(attributes).sort()).toEqual([...declared.map((d) => d.name), "position", "color"].sort());
      expect(Object.values(attributes).every((a) => a.array instanceof Float32Array && !a.isInstancedBufferAttribute)).toBe(true);
      expect(Object.values(attributes).reduce((sum, a) => sum + 4 * a.itemSize, 0)).toBe(168);
    }
    // A phone's 150 figures fit a two-byte index, which a desktop's 292 do not.
    expect([phone.mesh.geometry.index.array.constructor.name, crowd.mesh.geometry.index.array.constructor.name]).toEqual(["Uint16Array", "Uint32Array"]);
    expect(phone.mesh.geometry.getAttribute("position").count).toBeLessThanOrEqual(65535);
    expect(Object.keys(figureGeometry().attributes).sort()).toEqual(["aMark", "position"]);
  });

  it("is lit by nothing the island's own light is not, and hides nothing: a solid Lambert material that three's own fragment shader draws", () => {
    // The rig's beams never light a figure because the crowd draws after them and covers them (draw-order.test.ts). A crowd that
    // glowed, or let the beams show through it, or wrote no depth, would undo that from inside.
    const material = crowd.mesh.material;
    expect(material.isMeshLambertMaterial).toBe(true);
    expect([material.transparent, material.opacity, material.depthWrite, material.depthTest, material.blending]).toEqual([false, 1, true, true, THREE.NormalBlending]);
    expect([material.emissive.getHex(), material.map, material.emissiveMap, material.lightMap, material.envMap, material.alphaMap]).toEqual([0, null, null, null, null, null]);
    // A corner's colour is its figure's top's, which the shader replaces on every face that is not the top's (below).
    expect([material.fog, material.flatShading, material.vertexColors, material.side]).toEqual([true, true, true, THREE.FrontSide]);
    // main.js sets the mesh's render order, after the rig's (main.test.ts); buildCrowd leaves it alone.
    expect(crowd.mesh.renderOrder).toBe(0);
    expect(compiled.fragmentShader).toBe(THREE.ShaderLib.lambert.fragmentShader);
    // What the crowd adds to the vertex shader writes a vertex's place and its colour, and nothing else.
    const written = [...`${dance}\n${tones}`.matchAll(/(?:^|[;{}]\s*|\)\s+)([A-Za-z_]\w*)(?:\.[xyzwrgb]+)?\s*[-+*/]?=(?!=)/gm)].map((m) => m[1]);
    const names = new Set([...`${dance}\n${tones}`.matchAll(/\b(?:float|bool)\s+([^;]+);/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/).map((d) => d.trim().split(/\s|=/)[0])));
    expect([...new Set(written.filter((name) => !names.has(name)))].sort()).toEqual(["transformed", "vColor"]);
  });

  it("tests, for each figure, a sphere that holds every corner it wears however it moves, and draws the crowd for a camera that has only a figure's edge in view", () => {
    // `cull` leaves the crowd out of a frame when no figure's sphere is in the camera's view. A sphere too small, or round the wrong
    // middle, would still pass a camera that looks at the crowd, and figures would come in late at a frame's edge.
    // First the spheres themselves (`each.ball`): the fixed day's crowd, a desktop's and a phone's, every figure moving each of the
    // seven ways in turn at the dance's most, standing, seated, rising and at a build-up's peak, 28 poses a figure, every corner
    // it wears, in the world.
    const states: Omit<Pose, "beat">[] = [{ dance: 1.6 }, { dance: 1.6, sit: 1 }, { dance: 1.6, rise: 0.5 }, { dance: 1.6, rise: 1 }];
    let least = Infinity, looked = 0;
    for (const [c, vertices] of [[SHOWS[0].desktop, rich], [SHOWS[0].phone, plain]] as const) {
      const ball: Float32Array = c.each.ball, placed: Float32Array = c.each.matrix;
      for (const own of figuresOf(c)) {
        const worn = vertices.filter((v) => wears(own, v)), m = 16 * own.i, b = 4 * own.i;
        let far = 0;
        (MOVES as string[]).forEach((_, k) => states.forEach((state, q) => {
          const f = { ...own, wear: { ...own.wear, y: own.wear.y - (own.wear.y % 8) + k } }, pose = { ...state, beat: (0.37 + 1.13 * k + 2.9 * q) % CYCLE };
          for (const v of worn) {
            const p = put(f, v, pose);
            const x = placed[m] * p.x + placed[m + 4] * p.y + placed[m + 8] * p.z + placed[m + 12] - ball[b];
            const y = placed[m + 1] * p.x + placed[m + 5] * p.y + placed[m + 9] * p.z + placed[m + 13] - ball[b + 1];
            const z = placed[m + 2] * p.x + placed[m + 6] * p.y + placed[m + 10] * p.z + placed[m + 14] - ball[b + 2];
            far = Math.max(far, x * x + y * y + z * z);
          }
          looked += worn.length;
        }));
        least = Math.min(least, ball[b + 3] - Math.sqrt(far));
      }
    }
    expect(looked).toBeGreaterThan(3.9e6);
    // The nearest any of those four million posed corners comes to its figure's sphere is 0.15 m inside it and more: a seated
    // figure's feet follow the ground's fall ahead of its seat, which differs with the way the gathering faces it.
    expect(least).toBeGreaterThan(0.15);
    expect(least).toBeLessThan(0.3);
    // Then that `cull` tests those spheres and no others. One figure at a time, the rest stepped ten kilometres off (`cull` counts a
    // figure where the parting has stepped it): a view a centimetre across and deep is in the figure's sphere 3 cm inside its
    // edge, up, down and to each side, and out of it 3 cm outside.
    const c = SHOWS[0].desktop, list = figuresOf(c), ball: Float32Array = c.each.ball, step: Float32Array = c.each.offset, rested = step.slice();
    const alone = (j: number) => { for (const f of list) step[4 * f.i] = rested[4 * f.i] + (f.i === j ? 0 : 1e4); };
    const camera = new THREE.PerspectiveCamera(0.2, 1, 2.995, 3.005);
    const sees = (x: number, y: number, z: number) => { camera.position.set(x, y, z + 3); camera.lookAt(x, y, z); return c.cull(camera) as boolean; };
    const P = PART as Record<string, number>, carries = (f: Figure, bit: number) => Math.floor(f.wear.x / bit) % 2 === 1;
    const flagged = list.find((f) => carries(f, P.POLE))!, taper = list.find((f) => carries(f, P.STAND))!, child = list.find((f) => f.up < 0.7 * scale)!, sitter = list.find((f) => f.fig.x === 1)!;
    const some = [...new Set([list[0], list.at(-1)!, flagged, taper, child, sitter, ...list.filter((_, k) => k % 37 === 5)].map((f) => f.i))];
    expect(some.length).toBeGreaterThanOrEqual(12);
    const wrong: string[] = [];
    for (const j of some) {
      alone(j);
      const [x, y, z, r] = [ball[4 * j] + step[4 * j], ball[4 * j + 1] + step[4 * j + 1], ball[4 * j + 2] + step[4 * j + 2], ball[4 * j + 3]];
      for (const [ux, uy, uz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (!sees(x + ux * (r - 0.03), y + uy * (r - 0.03), z + uz * (r - 0.03))) wrong.push(`figure ${j}: not seen 3 cm inside its sphere, ${[ux, uy, uz]}`);
        if (sees(x + ux * (r + 0.03), y + uy * (r + 0.03), z + uz * (r + 0.03))) wrong.push(`figure ${j}: seen 3 cm outside its sphere, ${[ux, uy, uz]}`);
      }
    }
    expect(wrong).toEqual([]);
    // And a camera as a visitor has it, that takes in only the edge of one figure, draws the crowd: one that looks level past the
    // one who holds a flag, with the top 5 cm of the flag at the foot of its view and nothing else of the figure in it; and one with
    // the soles of the figure's shoes at the top of its view. Half a sphere would miss the shoes, and a sphere round the feet the flag.
    // The lens is a narrow one, 10 degrees tall, so that whichever way the figure is turned (its seat faces it), what lies a little
    // beyond the edge in depth stays out of the view: a figure turned away from the stage, its shoes' uppers 0.6 m past the soles in
    // depth, stood 17 cm into a 30 degree lens's view.
    alone(flagged.i);
    const where = new THREE.Vector3(), corners = rich.filter((v) => wears(flagged, v)).map((v) => {
      const p = put(flagged, v, { beat: 0, dance: 0 });
      return where.set(p.x, p.y, p.z).applyMatrix4(matrix.fromArray(c.each.matrix, 16 * flagged.i)).clone();
    });
    const top = corners.reduce((a, b2) => (b2.y > a.y ? b2 : a)), sole = corners.reduce((a, b2) => (b2.y < a.y ? b2 : a));
    const lens = new THREE.PerspectiveCamera(10, 1.6, 0.3, 600), frustum = new THREE.Frustum(), half = Math.tan((5 * Math.PI) / 180);
    const middle = new THREE.Vector3(ball[4 * flagged.i], ball[4 * flagged.i + 1], ball[4 * flagged.i + 2]);
    for (const [edge, lift] of [[top, 4 * half - 0.05], [sole, 0.05 - 4 * half]] as const) {
      lens.position.set(edge.x - 4, edge.y + lift, edge.z);
      lens.lookAt(edge.x, edge.y + lift, edge.z);
      const drawn = c.cull(lens) as boolean;
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(lens.projectionMatrix, lens.matrixWorldInverse));
      const inView = corners.filter((p) => frustum.containsPoint(p));
      expect(inView.length).toBeGreaterThan(0);
      expect(Math.max(...inView.map((p) => Math.abs(p.y - edge.y)))).toBeLessThan(0.12);
      expect(frustum.containsPoint(middle)).toBe(false);
      expect(drawn).toBe(true);
    }
    expect(top.y - sole.y).toBeGreaterThan(1.9);
    step.set(rested);
    c.cull(lens);
  });

  it("draws a frame from four numbers, and sends up the parting's two attributes only in a frame where a figure moved, and only at that figure's corners", () => {
    const geo = crowd.mesh.geometry, fixed = ["aFig", "aBody", "aWear", "aCut", "aTone", "aMark", "position", "aPlace", "aSize", "color"], held = [...fixed, "aPart", "aRise"];
    const before = held.map((name) => geo.getAttribute(name)), arrays = before.map((a) => a.array), versions = () => [...held.map((name) => geo.getAttribute(name).version), geo.index.version];
    const uniforms = { ...compiled.uniforms }, aPart = geo.getAttribute("aPart"), aRise = geo.getAttribute("aRise");
    // The visitor stands far from the crowd: 60 frames of dancing move no figure, and nothing at all goes up.
    const far = { x: 0, z: 0 }, was = versions();
    crowd.part(0, far, { x: 0.8, z: 0 }, false);
    const settled = versions();
    for (let f = 0; f < 60; f++) { crowd.pose(f / 30, 1.2, 0.4, 0); crowd.part(1 / 60, far, { x: 0.8, z: 0 }, false); }
    expect(versions()).toEqual(settled);
    expect([...settled.slice(0, fixed.length), settled[held.length]]).toEqual([...was.slice(0, fixed.length), was[held.length]]);
    // The same attributes on the same arrays, each the very one it was.
    expect(held.map((name, k) => geo.getAttribute(name) === before[k] && geo.getAttribute(name).array === arrays[k])).toEqual(held.map(() => true));
    for (const name of ["uBeat", "uDance", "uRise", "uSit"]) expect(compiled.uniforms[name]).toBe(uniforms[name]);
    // The phase is kept to CYCLE beats, and the rest are passed as they come.
    crowd.pose(3 * CYCLE + 2.5, 1.2, 0.4, 0.7);
    expect(["uBeat", "uDance", "uRise", "uSit"].map((name) => compiled.uniforms[name].value)).toEqual([2.5, 1.2, 0.4, 0.7]);
    // Among the crowd figures step aside, and only the parting's two go up: at the corners of the figures that moved or eased their
    // arms in that frame, and at no other corner of the hundred thousand. A renderer takes the ranges and forgets them; so here.
    const [x, z] = seats[0], rising: Float32Array = crowd.each.rising;
    let frames = 0;
    for (let f = 0; f < 12; f++) {
      aPart.clearUpdateRanges(); aRise.clearUpdateRanges();
      const stepped = versions(), had = [offset.slice(), rising.slice()];
      crowd.part(1 / 60, { x: x + 2.5 - 0.2 * f, z }, { x: x + 3.3 - 0.2 * f, z }, false);
      const after = versions(), movedNow = figures.filter((g) => [0, 1, 2, 3].some((q) => offset[4 * g.i + q] !== had[0][4 * g.i + q]) || rising[g.i] !== had[1][g.i]).map((g) => g.i);
      expect(movedNow.length).toBeLessThan(crowd.count / 3);
      expect([...after.slice(0, fixed.length), after[held.length]]).toEqual([...stepped.slice(0, fixed.length), stepped[held.length]]);
      expect([after[fixed.length] > stepped[fixed.length], after[fixed.length + 1] > stepped[fixed.length + 1]]).toEqual([movedNow.length > 0, movedNow.length > 0]);
      const sent = (attribute: { updateRanges: { start: number; count: number }[] }, size: number) => attribute.updateRanges.map((r) => [r.start / size, r.count / size]).sort((a, b) => a[0] - b[0]);
      const want = movedNow.map((i) => [crowd.corners[i], crowd.corners[i + 1] - crowd.corners[i]]);
      expect(sent(aPart, 4)).toEqual(want);
      expect(sent(aRise, 1)).toEqual(want);
      if (movedNow.length > 0) frames += 1;
    }
    expect(frames).toBeGreaterThan(6);
    // And every corner of every figure holds its figure's step, moved or not.
    let stale = 0;
    for (const g of figures) for (let k = crowd.corners[g.i]; k < crowd.corners[g.i + 1]; k++) {
      if ([0, 1, 2, 3].some((q) => aPart.array[4 * k + q] !== offset[4 * g.i + q]) || aRise.array[k] !== rising[g.i]) stale += 1;
    }
    expect(stale).toBe(0);
    // Ranges that no frame takes, as when the crowd is not in view, do not pile up: past a crowd's worth of them, the next frame
    // that moves a figure sends the whole of each up instead, which is what no ranges means.
    for (let k = 0; k <= crowd.count; k++) { aPart.addUpdateRange(0, 4); aRise.addUpdateRange(0, 1); }
    const piled = versions()[fixed.length];
    for (let f = 0; f < 30 && versions()[fixed.length] === piled; f++) crowd.part(1 / 60, { x: x + (f % 2 ? 1.5 : -1.5), z }, { x: x + (f % 2 ? 2.3 : -0.7), z }, false);
    expect(versions()[fixed.length]).toBeGreaterThan(piled);
    expect([aPart.updateRanges.length, aRise.updateRanges.length]).toEqual([0, 0]);
    // And a step that says something changed while no figure's own numbers did sends nothing up: with no ranges, the whole of each
    // attribute would go.
    kept.idle = true;
    const idle = buildCrowd(new THREE.Scene(), { count: 40, path, line, landmarks: [] });
    kept.idle = false;
    const own = ["aPart", "aRise"].map((name) => idle.mesh.geometry.getAttribute(name)), made = own.map((a) => a.version);
    for (let f = 0; f < 3; f++) idle.part(1 / 60, far, { x: 0.8, z: 0 }, false);
    expect(own.map((a) => [a.version, a.updateRanges.length])).toEqual(made.map((v) => [v, 0]));
    crowd.part(0, far, { x: 0.8, z: 0 }, true);
  });
});

describe("the figure, as figureGeometry builds it", () => {
  const geo = figureGeometry();
  const position = geo.getAttribute("position"), n = position.count, mark = geo.getAttribute("aMark");
  const vertices = Array.from({ length: n }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]);
  const marks = (k: number) => Array.from({ length: n }, (_, i) => mark.getComponent(i, k) as number);
  const rig = marks(0), bit = marks(1), tint = marks(2);
  const body = vertices.filter((_, i) => bit[i] === 0);

  it("has a body that stands on the ground TALL to the top of its head, inside the plain figure it replaced: 0.35 to either side and 0.27 fore and aft", () => {
    const most = (f: (v: number[]) => number) => Math.max(...body.map(f));
    expect(Math.min(...body.map(([, y]) => y))).toBeCloseTo(0, 6);
    expect(most(([, y]) => y)).toBeCloseTo(TALL, 6);
    expect(most(([x]) => Math.abs(x))).toBeLessThanOrEqual(0.35);
    expect(most(([, , z]) => Math.abs(z))).toBeLessThanOrEqual(0.27);
  });

  it("keeps every part it can wear within its hanging arms' reach of its axis, HANG, and none through the ground", () => {
    // A part built wider than HANG would reach past where a figure standing still is let stand beside the visitor's bear, whatever
    // buildCrowd did to fit it.
    const far = Object.entries(PART).map(([name, b]) => [name, Math.max(...vertices.filter((_, i) => bit[i] === b).map(([x, , z]) => Math.hypot(x, z)))] as const);
    expect(far.filter(([, r]) => !(r <= HANG)).map(([name, r]) => `${name}: ${r.toFixed(3)}`)).toEqual([]);
    expect(Math.min(...vertices.map(([, y]) => y))).toBeCloseTo(0, 6);
  });

  it("keeps its arms within the plain figure's, 0.624 from the shoulder, so the reaches the parting keeps still bound it", () => {
    const side = rig.map((r, i) => (bit[i] !== 0 ? 0 : r === 3 ? -1 : r === 4 ? 1 : 0));
    const reach = vertices.map(([x, y, z], i) => (side[i] === 0 ? 0 : Math.hypot(x - side[i] * SHOULDER_X, y - SHOULDER_Y, z)));
    expect(side.filter((a) => a !== 0).length).toBeGreaterThan(0);
    expect(Math.max(...reach)).toBeLessThanOrEqual(0.624);
    // Each arm hangs from a ball of the body at its pivot: the arm's open top, where it turns, lies inside the ball, and the ball
    // runs into the torso, so an arm that swings or lifts stays joined and shows no hollow.
    for (const s of [-1, 1]) {
      const top = vertices.filter(([, y], i) => side[i] === s && Math.abs(y - SHOULDER_Y) < 1e-6);
      expect(top.length).toBeGreaterThan(0);
      const ball = vertices.filter(([x, y, z], i) => rig[i] === 0 && bit[i] === 0 && Math.abs(Math.hypot(x - s * SHOULDER_X, y - SHOULDER_Y, z) - 0.064) < 1e-4);
      expect(ball.length).toBe(60);
      for (const [x, , z] of top) expect(Math.hypot(x - s * SHOULDER_X, z)).toBeLessThan(0.064);
      // The torso's top edge, 0.25 out at its widest, stands inside the ball's inner side.
      expect(s * Math.min(...ball.map(([x]) => s * x))).toBeLessThan(0.25);
      // An arm's rings stand at the shoulder, the elbow halfway down it and the wrist: where the shader turns and bends it.
      const rings = [...new Set(vertices.filter((_, i) => side[i] === s && tint[i] !== 3).map(([, y]) => Math.round(y * 1e6) / 1e6))].sort((a, b) => b - a);
      expect(rings).toHaveLength(3);
      rings.forEach((y, k) => expect(y).toBeCloseTo(SHOULDER_Y - k * 0.27, 6));
    }
  });

  it("marks every vertex with how it hangs, its part's bit and whose colour it takes, each triangle one part of one colour, and carries nothing a texture would read", () => {
    expect([mark.itemSize, mark.count]).toEqual([4, n]);
    expect([...new Set(rig)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...new Set(tint)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...new Set(bit)].sort((a, b) => a - b)).toEqual([0, ...Object.values(PART)]);
    for (let t = 0; t < n; t += 3) {
      expect([bit[t + 1], bit[t + 2], rig[t + 1], rig[t + 2], tint[t + 1], tint[t + 2]]).toEqual([bit[t], bit[t], rig[t], rig[t], tint[t], tint[t]]);
    }
    expect(geo.getAttribute("uv")).toBeUndefined();
    // Each part's bit is a power of two of its own, and all of them together are a number a 32-bit float holds exactly.
    const bits = Object.values(PART) as number[];
    for (const b of bits) expect(Number.isInteger(Math.log2(b))).toBe(true);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits.reduce((sum, b) => sum + b, 0)).toBeLessThan(2 ** 24);
  });

  it("is 1,101 triangles on a desktop and 713 on a phone, whose figure leaves out seven parts and keeps the rest, and a crowd draws of them only what its figures wear", () => {
    const lean = figureGeometry(true);
    expect([geo.index, lean.index]).toEqual([null, null]);
    expect([n / 3, lean.getAttribute("position").count / 3]).toEqual([1101, 713]);
    // And those are the figures the crowds are built of: a desktop's whole, a phone's plain.
    expect([crowd.figure.getAttribute("position").count / 3, phone.figure.getAttribute("position").count / 3]).toEqual([1101, 713]);
    const leanBits = new Set(Array.from({ length: lean.getAttribute("aMark").count }, (_, i) => lean.getAttribute("aMark").getY(i) as number));
    const left = Object.entries(PART).filter(([, b]) => !leanBits.has(b as number)).map(([name]) => name);
    expect(left.sort()).toEqual([...PLAIN_LEAVES_OUT].sort());
    // The body is the same on both: 372 triangles, the torso's two lids gone, which stood inside the hips and under the shoulders.
    const bodyOf = (g: typeof geo) => Array.from({ length: g.getAttribute("position").count }, (_, i) => i).filter((i) => g.getAttribute("aMark").getY(i) === 0).length / 3;
    expect([bodyOf(geo), bodyOf(lean)]).toEqual([372, 372]);
    // A frame's cost goes with the triangles sent to be drawn, and the figure every figure was before its people differed was 440
    // of them. A crowd sends only what its figures wear: on the hills of 1986-07-04, 1970-08-30 and 1990-12-09 under 500 a figure
    // on a desktop and under 465 on a TV and a phone, where every figure sent the whole figure's 1,117 and 729 when it was an
    // instance of it. So a tier's whole crowd, at the figures its budget seats (quality.js), is under 175,000 triangles on a
    // desktop, 116,250 on a TV and 69,750 on a phone, whose crowd was 66,000 before.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const seated = Object.fromEntries(["desktop", "tv", "phone"].map((tier) => [tier, (budgetFor(tier) as { crowd: number }).crowd]));
    vi.unstubAllGlobals();
    expect(seated).toEqual({ desktop: 350, tv: 250, phone: 150 });
    for (const { date, desktop, phone: small } of SHOWS) {
      const each = (c: typeof crowd) => c.mesh.geometry.index.count / 3 / c.count, tv = crowdOf(date, true, seated.tv);
      expect([date, each(desktop) < 500, each(tv) < 465, each(small) < 465]).toEqual([date, true, true, true]);
      expect([date, each(desktop) > 440, each(small) > 372]).toEqual([date, true, true]);
      expect([tv.count <= seated.tv, small.count <= seated.phone, desktop.count <= seated.desktop]).toEqual([true, true, true]);
    }
  });

  it("has leg rings only at the foot, the knee halfway up and the hip, where the vertex shader bends it, and a skirt's rings there and at the waist", () => {
    const rings = (r: number) => [...new Set(vertices.filter((_, i) => rig[i] === r).map(([, y]) => Math.round(y * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(rings(1)).toHaveLength(3);
    rings(1).forEach((y, k) => expect(y).toBeCloseTo((k * LEG) / 2, 6));
    // The feet stand on the ground under the shins' feet, where the shader lifts them from to set them down at a seated figure's foot.
    const feet = vertices.filter((_, i) => rig[i] === 2);
    expect(Math.min(...feet.map(([, y]) => y))).toBeCloseTo(0, 6);
    expect(Math.max(...feet.map(([, y]) => y))).toBeLessThan(0.1);
    // A skirt bends with the legs at its knee ring, and its waist ring rides the hips.
    const skirt = rings(5);
    expect(skirt).toHaveLength(4);
    expect(skirt[1]).toBeCloseTo(LEG / 2, 6);
    expect(skirt[2]).toBeCloseTo(LEG, 6);
    expect(skirt[0]).toBeLessThan(0.2);
    expect(skirt[3]).toBeGreaterThan(LEG);
  });

  it("builds a skirt, a poncho, hair and tails facing out, so the side toward the eye is the side that is drawn", () => {
    // These are built here ring by ring, and the material draws front faces alone: one wound the other way would show its far inside.
    const axes: Record<string, number[]> = { SKIRT: [0, 0], PONCHO: [0, 0], HAIR: [0, -0.085], TAIL: [0.09, -0.18], TAIL2: [-0.09, -0.18] };
    for (const [name, [cx, cz]] of Object.entries(axes)) {
      let sides = 0, inward = 0;
      for (let t = 0; t < n; t += 3) if (bit[t] === (PART as Record<string, number>)[name]) {
        const [a, b, c] = [vertices[t], vertices[t + 1], vertices[t + 2]];
        const normal = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
        const out = [(a[0] + b[0] + c[0]) / 3 - cx, (a[2] + b[2] + c[2]) / 3 - cz];
        // A lid faces up or down, and tells nothing here.
        if (Math.abs(normal[1]) > 3 * Math.hypot(normal[0], normal[2]) || Math.hypot(out[0], out[1]) < 1e-3) continue;
        sides += 1;
        if (normal[0] * out[0] + normal[2] * out[1] <= 0) inward += 1;
      }
      expect([name, sides > 10, inward]).toEqual([name, true, 0]);
    }
  });

  it("can sit: its seated foot stands nearer its hip than its leg is long, so the knee bends, and both are near the ground", () => {
    expect(Math.hypot(FOOT[0], FOOT[1] - SEAT)).toBeLessThan(LEG * 0.86);
    expect(SEAT).toBeLessThan(0.1);
    expect(FOOT[1]).toBeLessThan(0.07);
    expect(FOLD).toBeGreaterThan(0);
    expect(FOLD).toBeLessThan(1);
  });
});

describe("the crowd's shader", () => {
  // A plain figure of the standard build that bobs, wearing nothing, and main's shader for it, at 359fd84, from before the crowd's
  // people differed: every figure moved this way.
  const standard = (fig: Vec): Figure => ({ i: 0, across: scale, up: scale, fig, body: { x: 1, y: 1, z: 1, w: 1 }, wear: { x: 0, y: MOVES.indexOf("bob"), z: 0, w: 1 },
    cut: { x: 1, y: 0.093, z: 1, w: 1 }, tone: { x: 0, y: 0, z: 0, w: 0 }, top: { r: 0, g: 0, b: 0 } });
  function before(v: Vertex, fig: Vec, pose: Pose, sways = true) {
    const rot = (a: number, b: number, angle: number) => [Math.cos(angle) * a - Math.sin(angle) * b, Math.sin(angle) * a + Math.cos(angle) * b];
    let { x, y, z } = v;
    const leg = v.mark.x === 1 ? 1 : v.mark.x === 2 ? 2 : 0, arm = v.mark.x === 3 ? -1 : v.mark.x === 4 ? 1 : 0;
    const danced = pose.dance * (1 - (pose.still ?? 0));
    const rise = (pose.rise ?? 0) * (pose.rising ?? 1), sit = Math.max(fig.x, pose.sit ?? 0) * (1 - rise);
    const bounce = 0.5 + 0.5 * Math.cos(6.2832 * (pose.beat + 0.12 * fig.y));
    if (arm !== 0) {
      // Main's arms swung out and back on every beat, 0.5 rad at the most (1 - bounce), seated too. They swing with the sway now,
      // once in two beats, each out as the figure leans its way, and hang while it sits.
      const out = 0.5 + 0.5 * arm * Math.sin(3.1416 * (pose.beat + fig.y));
      const swing = rise * 2.7 + (1 - rise) * danced * 0.5 * out * (1 - sit);
      [x, y] = rot(x - arm * SHOULDER_X, y - SHOULDER_Y, arm * swing);
      x += arm * SHOULDER_X; y += SHOULDER_Y;
    }
    const bob = (1 - sit) * danced * (1 + rise) * 0.12 * bounce, lower = LEG * (1 - FOLD) * bob + (LEG - SEAT) * sit;
    if (leg > 0) {
      const fall = clamp(fig.w, DROP[0], DROP[1]), hip = [0, LEG - lower];
      let foot = [sit * FOOT[0], sit * (FOOT[1] - fall)];
      const span = Math.max(Math.hypot(foot[0] - hip[0], foot[1] - hip[1]), 1e-4), along = [(foot[0] - hip[0]) / span, (foot[1] - hip[1]) / span];
      const half = 0.5 * Math.min(span, LEG - 1e-3), ahead = [-along[1], along[0]], bow = Math.sqrt(Math.max((LEG / 2) ** 2 - half * half, 0));
      const knee = [hip[0] + along[0] * half + ahead[0] * bow, hip[1] + along[1] * half + ahead[1] * bow];
      foot = [hip[0] + along[0] * Math.min(span, LEG), hip[1] + along[1] * Math.min(span, LEG)];
      if (leg === 2) {
        const [fz, fy] = rot(z, y, -sit * Math.atan2(fall, FOOT[0]));
        z = foot[0] + fz; y = foot[1] + fy;
      } else {
        const t = clamp(y / LEG, 0, 1), unit = (a: number[], b: number[]) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
        const thigh = unit(hip, knee), shin = unit(knee, foot), overThigh = [-thigh[1], thigh[0]], overShin = [-shin[1], shin[0]];
        const both = [overThigh[0] + overShin[0], overThigh[1] + overShin[1]], cut = Math.max(overThigh[0] * both[0] + overThigh[1] * both[1], 0.4);
        const over = t > 0.51 ? overThigh : t < 0.49 ? overShin : [both[0] / cut, both[1] / cut];
        const base = t > 0.5 ? [knee[0] + (hip[0] - knee[0]) * (2 * t - 1), knee[1] + (hip[1] - knee[1]) * (2 * t - 1)] : [foot[0] + (knee[0] - foot[0]) * 2 * t, foot[1] + (knee[1] - foot[1]) * 2 * t];
        [z, y] = [base[0] + z * over[0], base[1] + z * over[1]];
      }
    } else y -= lower;
    if (sways) [x, y] = rot(x, y, danced * 0.08 * Math.sin(3.1416 * (pose.beat + fig.y)));
    // Main let a seated figure's lap and a tipped heel pass a little under the ground. As far as a figure sits, nothing of it does now.
    y = Math.max(y, (-clamp(fig.w, DROP[0], DROP[1]) / FOOT[0]) * z - 0.4 * (1 - sit));
    return { x, y, z };
  }

  it("is written in plain numbers, one to a name, so that it runs here as it stands: no vector, matrix, whole number or loop", () => {
    for (const text of [dance, tones]) expect(text.replace(/\/\*[\s\S]*?\*\//g, "").match(/\b(?:vec[234]|mat[234]|u?int|[iub]vec[234]|for|while|do|struct|void|const|return)\b/g)).toBeNull();
    // And it reads a part of what is passed in by one letter at a time, never two or more, which JavaScript has no word for.
    expect(`${dance}${tones}`.match(/\.[xyzwrgba]{2,}\b/g)).toBeNull();
    expect(dance.length).toBeGreaterThan(4000);
    expect(tones.length).toBeGreaterThan(500);
  });

  it("moves a plain figure that bobs as every figure moved before, but for its arms' slower swing and its flat feet: its bob, its sit, the rise and its sway, to a hundredth of a millimetre", () => {
    // The body's vertices, standing and seated on rising and falling ground, through two beats, still and rising and at each end of
    // the crowd; where the shader's legs, arms or sway went wrong, this figure would no longer dance as main's did. Three things
    // differ, the first two for the flash count: its arms swing once in two beats and not on every beat, and hang while it sits
    // (before); its feet, which tipped with the sway before, stay flat on the ground, so they are held to main's without the sway;
    // and, seated, nothing of it passes under the ground.
    const bodyOnly = rich.filter((v) => v.mark.y === 0);
    let worst = 0, looked = 0, feet = 0;
    for (const fig of [{ x: 0, y: 0.37, z: 0, w: 0.11 }, { x: 0, y: 0.81, z: 1, w: -0.07 }, { x: 1, y: 0.15, z: 0.4, w: 0.25 }])
      for (const pose of [{ dance: 1.6 }, { dance: 0.4 }, { dance: 1.3, rise: 1 }, { dance: 1.3, rise: 0.45 }, { dance: 1, sit: 1 }, { dance: 1, sit: 0.5 }, { dance: 1.6, still: 0.6 }, { dance: 1.6, rise: 1, rising: 0.3 }])
        for (let beat = 0; beat < 2; beat += 0.19) for (const v of bodyOnly) {
          // The elbow's ring and the forearm are new, and hang straight on this figure; the torso's middle ring is new too.
          const was = before(v, fig, { ...pose, beat }, v.mark.x !== 2), is = put(standard(fig), v, { ...pose, beat });
          worst = Math.max(worst, Math.hypot(is.x - was.x, is.y - was.y, is.z - was.z));
          looked += 1;
          if (v.mark.x === 2) feet += 1;
        }
    expect(looked).toBeGreaterThan(10000);
    expect(feet).toBeGreaterThan(500);
    expect(worst).toBeLessThan(1e-5);
  });

  it("leaves every face of every part its size as it stands, and gives each part its tone", () => {
    // Standing as built, no triangle of any part has lost its area: the three corners of each stand apart. (The shader no longer
    // folds a part away: the mesh holds no part its figure does not wear.)
    let flat = 0, looked = 0;
    for (const [list, c] of [[figures, crowd], [phones, phone]] as const) {
      const position = c.figure.getAttribute("position"), mark = c.figure.getAttribute("aMark");
      const f = list[0], pose = { beat: 0, dance: 0 };
      for (let t = 0; t < position.count; t += 3) {
        const [a, b, c2] = [0, 1, 2].map((k) => ({ ...put({ ...f, wear: { ...f.wear, x: 2 ** 22 - 1 } }, { x: position.getX(t + k), y: position.getY(t + k), z: position.getZ(t + k), mark: vec(mark, t + k) }, pose) }));
        const area = 0.5 * Math.hypot((b.y - a.y) * (c2.z - a.z) - (b.z - a.z) * (c2.y - a.y), (b.z - a.z) * (c2.x - a.x) - (b.x - a.x) * (c2.z - a.z), (b.x - a.x) * (c2.y - a.y) - (b.y - a.y) * (c2.x - a.x));
        looked += 1;
        if (!(area > 1e-7)) flat += 1;
      }
    }
    expect(looked).toBeGreaterThan(1700);
    expect(flat).toBe(0);
    // A pack's face takes its figure's tone for things, and not its top's colour.
    const pack = { x: 0, y: PART.PACK as number, z: 4, w: 0 }, out: Rgb = { r: 0, g: 0, b: 0 };
    let toned = 0, carriers = 0;
    for (const f of figures.filter((g) => wears(g, { x: 0, y: 0, z: 0, mark: pack }))) {
      out.r = f.top.r; out.g = f.top.g; out.b = f.top.b;
      runTones(null, out, pack, f.fig, null, 1, f.body, f.wear, f.cut, f.tone, 0, 0, 0, 0);
      carriers += 1;
      if (out.r !== f.top.r || out.g !== f.top.g || out.b !== f.top.b) toned += 1;
    }
    expect(carriers).toBeGreaterThan(50);
    expect(toned).toBe(carriers);
  });

  it("keeps every figure inside the reaches the parting keeps for it, through every beat of its way of moving, as the build-up lifts it and as it sits", () => {
    // In metres from the figure's axis and over its feet, for every figure of a desktop's crowd and a phone's and every vertex it
    // wears. Dancing at the dance's most (1.6, audio.js), no vertex passes the hand's reach (`wide`) or the highest (`top`). Standing
    // fully still, its arms down, as it does beside the visitor's bear, none passes its hanging arms' reach, HANG at the largest's
    // size. A broader build, a skirt, a hat's brim or a pole that reached past these would stand in the bear or in a neighbour.
    const most = { wide: 0, top: 0, hang: 0, sat: 0, satHigh: 0 };
    let looked = 0;
    for (const [list, vertices] of [[figures, rich], [phones, plain]] as const) for (const f of list) {
      const worn = vertices.filter((v) => wears(f, v)), beats = beatsOf(f);
      const reach = (pose: Pose, each: (out: number, up: number) => void) => {
        for (const v of worn) { const p = put(f, v, pose); each(f.across * Math.hypot(p.x, p.z), f.up * p.y); looked += 1; }
      };
      for (const beat of beats) for (const pose of [{ dance: 1.6 }, { dance: 1.6, rise: 0.5 }, { dance: 1.6, rise: 1 }, { dance: 1.6, sit: 1 }, { dance: 0.9, rise: 0.25 }])
        reach({ ...pose, beat }, (out, up) => { most.wide = Math.max(most.wide, out); most.top = Math.max(most.top, up); });
      if (f.fig.x === 0) for (const beat of [0, 1.7, 4.4]) reach({ beat, dance: 1.6, rise: 1, still: 1, rising: 0 }, (out, up) => { most.hang = Math.max(most.hang, out); most.top = Math.max(most.top, up); });
      // Seated and fully still, a figure's feet and knees reach further, as they did: FEET out at the largest's size, along the
      // ground; nothing higher than a skirt over a seated figure's knees, 0.65 units up, reaches past its hanging arms by more than a
      // millimetre (a bedroll on a seated figure's back, where its fit to HANG binds, stands on that reach, and 0.66 units up). A bear's
      // reach is its snout, far over that: its belly reaches 1.3 m from its middle (ground.js), which the parting keeps the bear's
      // reach and HANG away, so 0.68 m and HANG clear of the figure's axis.
      reach({ beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 }, (out, up) => {
        most.sat = Math.max(most.sat, out);
        if (out > HANG * BIG + 1e-3) most.satHigh = Math.max(most.satHigh, up);
      });
    }
    expect(looked).toBeGreaterThan(2e6);
    expect(most.wide).toBeLessThanOrEqual(own.wide);
    expect(most.top).toBeLessThanOrEqual(own.top);
    expect(most.hang).toBeLessThanOrEqual(HANG * BIG);
    expect(most.sat).toBeLessThanOrEqual(FEET * BIG);
    expect(FEET).toBe(0.55);
    // No figure is broader than the largest the parting's reaches are for.
    for (const list of [figures, phones]) expect(Math.max(...list.map((f) => f.across))).toBeLessThanOrEqual(BIG + 1e-9);
    expect(most.satHigh).toBeLessThanOrEqual(0.65 * BIG);
    expect(FEET * BIG).toBeLessThan(0.68 + HANG * BIG);
    // The reaches are used: a hand does go most of the way out, a pole most of the way up and a hem most of the way to HANG.
    expect(most.wide).toBeGreaterThan(0.85 * HAND * BIG);
    expect(most.top).toBeGreaterThan(0.97 * TOP * BIG);
    expect(most.hang).toBeGreaterThan(0.97 * HANG * BIG);
  }, 120000);

  it("stands every figure of a show where the hill's own ground is, children too, upright", () => {
    // The figure's own units say nothing of where on the hill it stands: a crowd set a metre over the ground, or its children a hand
    // higher than the rest, would dance the same. Each instance's place against the ground's height there (ground.js), on three
    // shows' hills, as a desktop draws them and as a phone does.
    let children = 0;
    for (const { date, desktop, phone: small } of SHOWS) for (const c of [desktop, small]) {
      let off = 0, tipped = 0;
      for (let i = 0; i < c.count; i++) {
        matrix.fromArray(c.each.matrix, 16 * i);
        at.setFromMatrixPosition(matrix);
        size.setFromMatrixScale(matrix);
        off = Math.max(off, Math.abs(at.y - height(at.x, at.z)));
        tipped = Math.max(tipped, Math.abs(matrix.elements[4]), Math.abs(matrix.elements[6]), Math.abs(matrix.elements[1]), Math.abs(matrix.elements[9]));
        if (size.y < 0.7 * scale) { children += 1; expect(Math.abs(at.y - height(at.x, at.z))).toBeLessThan(1e-5); }
      }
      // To a hundredth of a millimetre, which is what an instance's matrix holds of a height of some tens of metres.
      expect([date, c.count, off < 1e-5, tipped]).toEqual([date, c.count, true, 0]);
    }
    expect(children).toBeGreaterThan(20);
  });

  it("keeps every figure of three shows over the ground it stands or sits on: nothing it wears or is passes under the hill but a bent knee's trouser hem, and a taper's stand goes down to the ground", () => {
    // In the figure's own units over the ground under each vertex, which falls or rises ahead of the seat as the hill does (aFig.w),
    // for the crowds of 1986-07-04, 1970-08-30 and 1990-12-09 on both tiers, since the landmarks a show raises decide which seats
    // are taken and how the ground lies at each. Standing and dancing: no skirt, poncho, hair, pack or anything it holds is under
    // it; a trouser's hem dips under as the figure sways and its knees bend, as it did before, a flared hem by a tenth of a unit at
    // the most. Seated, dancing or held still by the parting: nothing at all is under it, not a lap, a flared hem, a hoop's rim, a
    // poncho's point or a hanging hand, and a skirt lies a hundredth over it.
    const low = { stand: Infinity, hems: Infinity, sit: Infinity, skirt: Infinity, standSkirt: Infinity };
    let stands = 0, looked = 0;
    for (const { desktop, phone: small } of SHOWS) for (const [c, vertices] of [[desktop, rich], [small, plain]] as const) for (const f of figuresOf(c)) {
      const fall = clamp(f.fig.w, DROP[0], DROP[1]), under = (p: { y: number; z: number }) => p.y + (fall * p.z) / FOOT[0];
      for (const v of vertices.filter((v) => wears(f, v))) {
        looked += 1;
        if (v.mark.x === 7) {
          // The stand is set down where the ground is 0.22 ahead of the seat, where that falls away, and never raised where it rises:
          // the same in every pose.
          for (const pose of [{ beat: 0.5, dance: 1.6 }, { beat: 0.5, dance: 1.2, sit: 1 }]) expect(put(f, v, pose).y - v.y).toBeCloseTo((-Math.max(fall, 0) * 0.22) / FOOT[0], 9);
          stands += 1;
          continue;
        }
        if (f.fig.x === 0) for (const beat of [0, 0.5, 3.3]) {
          const p = put(f, v, { beat, dance: 1.6 });
          if (v.mark.x === 1) low.hems = Math.min(low.hems, p.y);
          else if (v.mark.x === 5) low.standSkirt = Math.min(low.standSkirt, under(p));
          else if (v.mark.x !== 2) low.stand = Math.min(low.stand, p.y);
        }
        for (const pose of [{ beat: 0.5, dance: 1.2, sit: 1 }, { beat: 2.1, dance: 1.6, sit: 1 }, { beat: 0, dance: 1.6, sit: 1, still: 1, rising: 0 }]) {
          const p = put(f, v, pose);
          if (v.mark.x === 5) low.skirt = Math.min(low.skirt, under(p)); else low.sit = Math.min(low.sit, under(p));
        }
      }
    }
    expect(looked).toBeGreaterThan(4e5);
    expect(stands).toBeGreaterThan(100);
    // No taper of these six crowds stands where the ground rises ahead of it, so one made up: its stand is not raised there, where
    // its microphones would stand over the highest the parting keeps (TOP), and goes down where the ground falls.
    const foot = rich.filter((v) => v.mark.x === 7).reduce(lowest), taper = carrying("stand", "watch");
    expect(put({ ...taper, fig: { x: 0, y: 0, z: 0, w: -0.1 } }, foot, { beat: 0.5, dance: 1.6 }).y).toBe(foot.y);
    expect(put({ ...taper, fig: { x: 0, y: 0, z: 0, w: 0.2 } }, foot, { beat: 0.5, dance: 1.6 }).y).toBeCloseTo(foot.y - (0.2 * 0.22) / FOOT[0], 9);
    expect(low.stand).toBeGreaterThan(-1e-6);
    expect(low.hems).toBeGreaterThan(-0.1);
    expect(low.hems).toBeLessThan(-0.01);
    expect(low.standSkirt).toBeGreaterThan(0.012 - 1e-6);
    expect(low.sit).toBeGreaterThan(-1e-6);
    expect(low.skirt).toBeGreaterThan(0.012 - 1e-6);
    // A broad sitter's seat stands as much higher as its thighs are thicker, 0.044 for each whole girth more, so that its lap rests
    // on the ground as a slight sitter's does and is not pressed flat into it.
    const hipsOf = (girth: number) => Math.min(...rich.filter((v) => v.mark.x === 0 && v.mark.y === 0 && Math.abs(v.y - 0.845) < 1e-4)
      .map((v) => put({ ...standard({ x: 0, y: 0.3, z: 0, w: 0 }), body: { x: girth, y: 1, z: 1, w: 1 } }, v, { beat: 0, dance: 0, sit: 1 }).y));
    expect(hipsOf(1.6) - hipsOf(1)).toBeCloseTo(0.044 * 0.6, 6);
  });

  it("tips a seated figure's foot toe-down as the ground falls ahead of its seat, about the foot's own heel, and leaves it flat standing", () => {
    const fig = { x: 0, y: 0.2, z: 0, w: 0.2 }, f = standard(fig);
    const sole = rich.filter((v) => v.mark.x === 2 && v.y < 1e-6 && v.x > 0), heel = sole.filter((v) => v.z < 0)[0], toe = sole.filter((v) => v.z > 0)[0];
    const standing = [heel, toe].map((v) => ({ ...put(f, v, { beat: 0, dance: 0 }) })), seated = [heel, toe].map((v) => ({ ...put(f, v, { beat: 0, dance: 0, sit: 1 }) }));
    for (const p of standing) expect(p.y).toBeCloseTo(0, 8);
    // The toe lies lower than the heel by the ground's fall over the foot's length: 0.2 of a unit over FOOT[0] ahead.
    const length = toe.z - heel.z, slope = Math.atan2(0.2, FOOT[0]);
    expect(seated[1].y - seated[0].y).toBeCloseTo(-length * Math.sin(slope), 6);
    expect(seated[1].z - seated[0].z).toBeCloseTo(length * Math.cos(slope), 6);
    // And the foot rests where the ground is, FOOT[0] ahead of the seat: the fall below the seat's ground, FOOT[1] up.
    const middle = rich.filter((v) => v.mark.x === 2 && v.y < 1e-6 && v.x > 0).map((v) => ({ v, p: { ...put(f, v, { beat: 0, dance: 0, sit: 1 }) } }));
    for (const { v, p } of middle) expect(p.y + Math.sin(slope) * v.z).toBeCloseTo(FOOT[1] - 0.2, 2);
  });

  it("holds every figure still while the crowd does not dance, whatever the beat, and one the parting holds still while it does: no part moves of itself", () => {
    // main.js poses the crowd with no dance under ?still=1 and under reduced motion, and the parting stills the figures by the
    // visitor's bear. A skirt that swirled, a flag that waved, a hoop that swung or an arm that waved by the beat alone would move
    // there. Every vertex a figure wears, standing and seated, at five beats of the cycle.
    let far = 0, looked = 0;
    for (const [list, vertices] of [[figures, rich], [phones, plain]] as const) for (const f of list) for (const v of vertices.filter((v) => wears(f, v)))
      for (const pose of [{ dance: 0 }, { dance: 0, sit: 1 }, { dance: 1.6, still: 1, rising: 0 }, { dance: 1.6, rise: 1, still: 1, rising: 0 }]) {
        const first = { ...put(f, v, { ...pose, beat: 0 }) };
        for (const beat of [0.5, 1.3, 2.75, 6.1]) {
          const p = put(f, v, { ...pose, beat });
          far = Math.max(far, Math.abs(p.x - first.x), Math.abs(p.y - first.y), Math.abs(p.z - first.z));
          looked += 1;
        }
      }
    expect(looked).toBeGreaterThan(1e6);
    expect(far).toBe(0);
  }, 120000);

  it("brings every way of moving round whole in CYCLE beats, so the phase's turn from CYCLE back to 0 moves nothing", () => {
    // The phase main.js gives runs on for the whole show, and pose() keeps it to CYCLE: a move whose own cycle did not divide that
    // would jump there. (The shader's 6.2832 is not quite a whole turn, as before: a twentieth of a millimetre at the turn.)
    let jump = 0;
    for (const f of figures) for (const v of rich.filter((v) => wears(f, v)).filter((_, k) => k % 3 === 0)) {
      const a = { ...put(f, v, { beat: CYCLE - 1e-9, dance: 1.6 }) }, b = put(f, v, { beat: 0, dance: 1.6 });
      jump = Math.max(jump, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
    expect(jump).toBeLessThan(1e-4);
  });

  it("moves each figure its own way, and all of them further as the music is louder: seven ways of moving, each its own", () => {
    // How far a figure's hands, head and hips each travel through a cycle, at the dance's least and at its most.
    const lowest = (a: Vertex, b: Vertex) => (b.y < a.y ? b : a);
    const hand = rich.filter((v) => v.mark.x === 4 && v.mark.y === 0).reduce(lowest), crown = rich.filter((v) => v.mark.x === 6 && v.mark.y === 0).reduce((a, b) => lowest(b, a) === b ? a : b);
    const travel = (f: Figure, v: Vertex, danced: number) => {
      let sum = 0, last = { ...put(f, v, { beat: 0, dance: danced }) };
      for (let k = 1; k <= 160; k++) { const p = put(f, v, { beat: (k * CYCLE) / 160, dance: danced }); sum += Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z); last = { ...p }; }
      return sum;
    };
    const by: Record<string, { hand: number; head: number; n: number }> = {};
    let settles = 0;
    for (const f of figures.filter((f) => f.fig.x === 0)) {
      const move = moveOf(f), loud = { hand: travel(f, hand, 1.6), head: travel(f, crown, 1.6) }, quiet = { hand: travel(f, hand, 0.4), head: travel(f, crown, 0.4) };
      by[move] ??= { hand: 0, head: 0, n: 0 };
      by[move].hand += loud.hand; by[move].head += loud.head; by[move].n += 1;
      if (loud.hand + loud.head > quiet.hand + quiet.head) settles += 1;
    }
    expect(Object.keys(by).sort()).toEqual([...MOVES].sort());
    const mean = (move: string, what: "hand" | "head") => by[move][what] / by[move].n;
    // Every figure moves more at the dance's most than at its least, the watchers too, who only shift their weight.
    expect(settles).toBe(figures.filter((f) => f.fig.x === 0).length);
    // One who watches moves its hands the least by far, one who turns carries them round, and one who nods moves its head.
    expect(mean("watch", "hand")).toBeLessThan(0.25 * mean("bob", "hand"));
    expect(mean("spin", "hand")).toBeGreaterThan(mean("sway", "hand"));
    expect(mean("nod", "head")).toBeGreaterThan(2 * mean("watch", "head"));
  });

  // A plain standard figure at the front, its phase 0, moving one way; a vertex where it stands in a pose; and how many times a
  // series of numbers turns, rising then falling or falling then rising, by more than a thousandth.
  const figureOf = (move: string, more = 0, parts = 0): Figure => ({ ...standard({ x: 0, y: 0, z: 0, w: 0 }), wear: { x: parts, y: MOVES.indexOf(move) + more, z: 0, w: 1 } });
  const at2 = (f: Figure, v: Vertex, pose: Pose) => ({ ...put(f, v, pose) });
  const lowest = (a: Vertex, b: Vertex) => (b.y < a.y ? b : a), bodyOf = (r: number) => rich.filter((v) => v.mark.x === r && v.mark.y === 0);
  function turns(series: number[]) {
    let count = 0, way = 0, from = series[0];
    for (const v of series) {
      if (way >= 0 && v < from - 1e-3) { if (way > 0) count += 1; way = -1; from = v; }
      else if (way <= 0 && v > from + 1e-3) { if (way < 0) count += 1; way = 1; from = v; }
      else if ((way > 0 && v > from) || (way < 0 && v < from)) from = v;
    }
    return count;
  }

  // The middle of a list of a figure's vertices in a pose. An arm's angle from hanging: the angle between its own line, from the middle
  // of its top ring to the middle of its hand, and the body's, from the neck down to the hips, the same however the figure leans or
  // turns.
  const mean = (f: Figure, list: Vertex[], pose: Pose) => {
    const sum = { x: 0, y: 0, z: 0 };
    for (const v of list) { const p = put(f, v, pose); sum.x += p.x / list.length; sum.y += p.y / list.length; sum.z += p.z / list.length; }
    return sum;
  };
  const arms2 = [3, 4].map((r) => ({ top: bodyOf(r).filter((v) => Math.abs(v.y - SHOULDER_Y) < 1e-6), hand: bodyOf(r).filter((v) => v.y < SHOULDER_Y - 0.5401) }));
  const core = rich.filter((v) => v.mark.x === 0 && v.mark.y === 0), neck = core.filter((v) => Math.abs(v.y - 1.62) < 1e-4), seat = core.filter((v) => Math.abs(v.y - 0.845) < 1e-4);
  function armAngle(f: Figure, k: number, pose: Pose) {
    const a = mean(f, arms2[k].top, pose), h = mean(f, arms2[k].hand, pose), n = mean(f, neck, pose), q = mean(f, seat, pose);
    const arm = [h.x - a.x, h.y - a.y, h.z - a.z], down = [q.x - n.x, q.y - n.y, q.z - n.z];
    return Math.acos(Math.min(1, (arm[0] * down[0] + arm[1] * down[1] + arm[2] * down[2]) / (Math.hypot(...arm) * Math.hypot(...down))));
  }
  // Every thing carried with every way of moving, as wearing() packs them on the standard figure, whether or not a crowd pairs them;
  // and the states a figure is drawn in: dancing, at the dance's most, seated, as the build-up lifts it and at its peak, and held
  // still by the parting, standing and seated.
  const CARRIED = ["none", ...(PROPS as string[])];
  const BASE = { stature: "mid", build: "average", legs: "jeans", top: "shirt", hair: "crop", beard: false, head: "none", back: "none", prop: "none", move: "bob", akimbo: false };
  const carrying = (prop: string, move: string, more: Record<string, unknown> = {}): Figure => {
    const worn = wearing({ ...BASE, prop, move, ...more });
    return { ...standard({ x: 0, y: 0, z: 0, w: 0 }), wear: { x: worn.parts, y: worn.style, z: 0, w: 1 } };
  };
  const STATES: [string, Omit<Pose, "beat">][] = [["dancing", { dance: 1.2 }], ["dancing hard", { dance: 1.6 }], ["seated", { dance: 1.2, sit: 1 }], ["rising", { dance: 1.3, rise: 0.5 }],
    ["risen", { dance: 1.6, rise: 1 }], ["held still", { dance: 1.6, still: 1, rising: 0 }], ["seated and held still", { dance: 1.6, sit: 1, still: 1, rising: 0 }]];
  const through = Array.from({ length: 161 }, (_, k) => 0.2 + (k * CYCLE) / 160);

  it("holds every rule of how a figure moves for every thing carried with every way of moving, dancing, seated, rising and held still: slow arms, seated arms down, flat feet", () => {
    // The rules were first tested on a figure that carries nothing, and a drummer's hands kept every beat and a finger-holder's arm
    // was not in them. Here each of the 8 things a figure may carry (nothing among them) with each of the 7 ways of moving, and one
    // that stands with its hands on its hips, in each of the 7 states: 399 figures, through the eight beats.
    const feet = rich.filter((v) => v.mark.x === 2), slow: string[] = [], raised: string[] = [], lifted: string[] = [], still: string[] = [], kneed: string[] = [];
    // How an arm that holds nothing hangs, as an angle from the body's own line.
    const hanging = [0, 1].map((k) => armAngle(carrying("none", "watch"), k, { beat: 0, dance: 0 }));
    let looked = 0;
    for (const [prop, move, akimbo] of [...CARRIED.flatMap((c) => (MOVES as string[]).map((m) => [c, m, false] as const)), ["none", "watch", true] as const]) for (const [state, pose] of STATES) {
      const f = carrying(prop, move, { akimbo }), name = `${prop}, ${move}${akimbo ? ", hands on hips" : ""}, ${state}`, sits = (pose.sit ?? 0) === 1, held = (pose.still ?? 0) === 1;
      looked += 1;
      // No arm goes out and back more than once in two beats, whatever it holds: 8 turns in CYCLE beats at the most.
      const swings = [0, 1].map((k) => turns(through.map((beat) => armAngle(f, k, { ...pose, beat }))));
      if (Math.max(...swings) > 8) slow.push(`${name}: ${swings}`);
      // Held still by the parting, nothing of it moves at all.
      const knees = turns(through.map((beat) => mean(f, seat, { ...pose, beat }).y));
      if (held && (Math.max(...swings) > 0 || knees > 0)) still.push(name);
      // Its knees keep every beat only if it bobs: the hips of any other come down once in two beats at the most, whatever it
      // carries. The build-up before a peak is the one exception, and is kept from before: as it lifts the crowd every figure's
      // knees come to keep every beat, and at its peak all do.
      if ((pose.rise ?? 0) === 0 ? move !== "bob" && knees > 8 : pose.rise === 1 && knees !== 16) kneed.push(`${name}: ${knees}`);
      // Seated, an arm that holds nothing hangs as it does at rest, whatever the figure's way of moving, and one that holds a drum
      // or a child's legs stays at them, no hand over its shoulders (a child's legs are at them); but the hand that holds a finger
      // up, which stays up and does not move of itself.
      if (sits) for (const k of [0, 1]) {
        const up = prop === "finger" && k === 1 && !held, holds = prop === "rider" || prop === "drum";
        const over = Math.max(...[0, 2.6, 5.1].map((beat) => mean(f, arms2[k].hand, { ...pose, beat }).y - mean(f, arms2[k].top, { ...pose, beat }).y));
        const out = Math.max(...[0, 2.6, 5.1].map((beat) => armAngle(f, k, { ...pose, beat }))) - hanging[k];
        if (up ? !(over > 0.4 && swings[1] === 0) : holds ? over > 0.07 : out > 0.02) raised.push(`${name}, ${k === 0 ? "left" : "right"}: ${over.toFixed(3)} over, ${out.toFixed(3)} out, ${swings[k]} turns`);
      }
      // Standing, its feet stay flat on the ground however it leans or bobs, and where they are, but that one who turns on the spot
      // turns them with it, flat, about its own middle.
      if (!sits) for (const beat of [0.3, 1.5, 4.9]) for (const v of feet) {
        const p = put(f, v, { ...pose, beat }), turned = move === "spin" && !held;
        if (Math.abs(p.y - v.y) > 1e-9 || Math.abs(Math.hypot(p.x, p.z) - Math.hypot(v.x, v.z)) > 1e-9 || (!turned && (Math.abs(p.x - v.x) > 1e-9 || Math.abs(p.z - v.z) > 1e-9))) { lifted.push(name); break; }
      }
    }
    // What is carried moves of itself no faster: a flag's free edge, a balloon and a hoop's rim, each against the figure's own neck,
    // turn no more than 8 times in CYCLE beats along any way, whichever way the figure moves.
    const own2: [string, Vertex][] = [["flag", rich.filter((v) => v.mark.y === PART.FLAG).reduce((a, b) => (b.mark.w > a.mark.w ? b : a))],
      ["balloon", rich.filter((v) => v.mark.y === PART.BALLOON).reduce((a, b) => (b.y > a.y ? b : a))], ["hoop", rich.filter((v) => v.mark.y === PART.HOOP).reduce((a, b) => (b.x > a.x ? b : a))]];
    for (const [prop, probe] of own2) for (const move of MOVES as string[]) for (const [state, pose] of STATES.slice(0, 5)) {
      const f = carrying(prop, move), path2 = through.map((beat) => { const p = { ...put(f, probe, { ...pose, beat }) }, n = mean(f, neck, { ...pose, beat }); return [p.x - n.x, p.y - n.y, p.z - n.z]; });
      const most = Math.max(...[0, 1, 2].map((k) => turns(path2.map((q) => q[k]))));
      if (most > 8) slow.push(`${prop} itself, ${move}, ${state}: ${most}`);
    }
    expect(looked).toBe((8 * 7 + 1) * 7);
    expect(slow).toEqual([]);
    expect(still).toEqual([]);
    expect(kneed).toEqual([]);
    expect(raised).toEqual([]);
    expect([...new Set(lifted)]).toEqual([]);
    // And the rules bite: a drummer's hands do tap, each once in two beats, a finger is held up, and one that bobs bends its knees
    // on every beat whatever it carries.
    expect([0, 1].map((k) => turns(through.map((beat) => armAngle(carrying("drum", "bob"), k, { beat, dance: 1.2 }))))).toEqual([8, 8]);
    expect(mean(carrying("finger", "watch"), arms2[1].hand, { beat: 0, dance: 1.2 }).y).toBeGreaterThan(TALL);
    for (const prop of CARRIED) expect([prop, turns(through.map((beat) => mean(carrying(prop, "bob"), seat, { beat, dance: 1.2 }).y))]).toEqual([prop, 16]);
  });

  it("keeps a hand at what it holds through every state: the pole of a flag, a balloon's string, the legs of a child on the shoulders, a drum", () => {
    // How far the middle of each holding hand stands from the nearest corner of the thing, through the eight beats of every state,
    // whichever way the figure moves. The build-up lifts every other arm overhead; these keep hold, as they do seated and while the
    // parting holds the figure still. A drummer's hands tap, so they come and go by a hand's breadth.
    const piece = (bit: number, of: (v: Vertex) => boolean = () => true) => rich.filter((v) => v.mark.y === bit && of(v));
    const HELD: [string, number[], Vertex[], number][] = [
      ["flag", [1], piece(PART.POLE as number), 0.08],
      ["balloon", [1], piece(PART.BALLOON as number, (v) => v.mark.w < 0.05), 0.08],
      ["rider", [0, 1], piece(PART.RIDER as number, (v) => v.mark.z === 1), 0.08],
      ["drum", [0, 1], piece(PART.DRUM as number), 0.15],
    ];
    const far: string[] = [], reach: Record<string, number> = {};
    for (const [prop, hands2, thing, most] of HELD) {
      expect([prop, thing.length >= 3]).toEqual([prop, true]);
      for (const move of MOVES as string[]) for (const [state, pose] of STATES) for (const beat of [0.2, 1.1, 2.4, 3.3, 5.0, 6.7]) for (const k of hands2) {
        const f = carrying(prop, move), hand = { ...mean(f, arms2[k].hand, { ...pose, beat }) };
        const d = Math.min(...thing.map((v) => { const p = put(f, v, { ...pose, beat }); return Math.hypot(p.x - hand.x, p.y - hand.y, p.z - hand.z); }));
        reach[prop] = Math.max(reach[prop] ?? 0, d);
        if (d > most) far.push(`${prop}, ${move}, ${state}, ${k === 0 ? "left" : "right"}: ${d.toFixed(3)}`);
      }
    }
    expect(far).toEqual([]);
    // Each is a real hold, the hand within its own breadth of the thing or a tap's swing of the drum, and not a bound nothing reaches.
    expect(Object.values(reach).every((d) => d > 0.02)).toBe(true);
    expect(reach.drum).toBeGreaterThan(reach.rider);
    // The finger is the hand's own, and is out only while the arm is up: as the parting brings the arm down it is tucked into the fist.
    const tip = rich.filter((v) => v.mark.y === PART.FINGER).reduce(lowest), fingered = carrying("finger", "watch");
    const out = (pose: Pose) => { const t = { ...put(fingered, tip, pose) }, h = mean(fingered, arms2[1].hand, pose); return Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z); };
    for (const pose of [{ beat: 0, dance: 1.2 }, { beat: 0, dance: 1.2, sit: 1 }, { beat: 0, dance: 1.6, rise: 1 }]) expect(out(pose)).toBeGreaterThan(0.11);
    expect(out({ beat: 0, dance: 1.6, still: 1, rising: 0 })).toBeLessThan(0.05);
  });

  it("keeps every figure that carries something inside the parting's reaches whichever way it moves, on three shows' hills", () => {
    // The reaches are held for each figure of two crowds as its own way of moving has it. Here the 36 figures that carry something
    // on each of 1986-07-04, 1970-08-30 and 1990-12-09, each made to move every one of the seven ways in turn, at its own fitted
    // size: a rider's carrier's hands, kept at the child's legs while the parting holds it still, first reached past its hanging
    // arms here and on no figure of the two crowds.
    const carriers = SHOWS.flatMap(({ desktop }) => figuresOf(desktop).filter((f) => rich.some((v) => v.mark.y >= (PART.POLE as number) && wears(f, v))));
    expect(carriers.length).toBe(3 * 36);
    const most = { wide: 0, top: 0, hang: 0, sat: 0 };
    for (const own2 of carriers) for (const move of MOVES as string[]) {
      const f = { ...own2, wear: { ...own2.wear, y: own2.wear.y - (own2.wear.y % 8) + MOVES.indexOf(move) } }, worn = rich.filter((v) => wears(f, v));
      for (const v of worn) {
        for (const beat of [0.13, 1.1, 2.6, 3.9, 5.2, 6.4, 7.7]) for (const pose of [{ dance: 1.6 }, { dance: 1.6, rise: 0.5 }, { dance: 1.6, rise: 1 }]) {
          const p = put(f, v, { ...pose, beat });
          most.wide = Math.max(most.wide, f.across * Math.hypot(p.x, p.z)); most.top = Math.max(most.top, f.up * p.y);
        }
        // Held still, its arms hang, as one standing does; one that sits where it is seated (aFig.x) sits still with its feet out
        // before it, as far as the seated feet's reach (FEET) lets them, and never stands to hang its arms.
        const still = put(f, v, { beat: 1.7, dance: 1.6, rise: 1, still: 1, rising: 0 }), held = f.across * Math.hypot(still.x, still.z);
        if (own2.fig.x === 1) most.sat = Math.max(most.sat, held); else most.hang = Math.max(most.hang, held);
        most.top = Math.max(most.top, f.up * still.y);
        const sat = put(f, v, { beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 });
        most.sat = Math.max(most.sat, f.across * Math.hypot(sat.x, sat.z));
      }
    }
    expect(most.wide).toBeLessThanOrEqual(own.wide);
    expect(most.top).toBeLessThanOrEqual(own.top);
    expect(most.hang).toBeLessThanOrEqual(HANG * BIG);
    expect(most.sat).toBeLessThanOrEqual(FEET * BIG);
    expect(most.top).toBeGreaterThan(0.97 * TOP * BIG);
  }, 60000);

  it("swings no arm out and back more than once in two beats, a clap's among them, bends the knees on every beat only of one that bobs, and keeps a clap inside the figure's own outline", () => {
    // The flash bar counts a block's swings in brightness, and a thin limb that passes over lit ground or the stage swings each block
    // on its way twice as it goes and twice as it comes back. Main's arms did that on every beat: 9 and 10 swings a second at one
    // block from the stage's pose in Drums, by render. So every arm here keeps to a cycle of two beats or longer, a figure that
    // claps does it on every other beat and before its chest, where its own body covers it, and only one that bobs bends its knees
    // on every beat. Over CYCLE beats, standing and dancing at the dance's middle: how far each arm stands out from hanging, by its hand
    // from its shoulder, and how high the hips stand.
    expect([arms2[0].top.length, arms2[0].hand.length, neck.length, seat.length].every((n) => n >= 6)).toBe(true);
    const beats = Array.from({ length: 641 }, (_, k) => 0.2 + (k * CYCLE) / 640);
    const swung: Record<string, number[]> = {};
    for (const move of MOVES as string[]) {
      const f = figureOf(move);
      swung[move] = [...[0, 1].map((k) => turns(beats.map((beat) => armAngle(f, k, { beat, dance: 1.2 })))), turns(beats.map((beat) => mean(f, seat, { beat, dance: 1.2 }).y))];
    }
    // Each turn is half a swing: 8 in CYCLE beats is once out and back in two beats, 16 once a beat.
    expect(swung.bob).toEqual([8, 8, 16]);
    expect(swung.wave.slice(0, 2)).toEqual([4, 4]);
    expect(swung.spin.slice(0, 2)).toEqual([4, 4]);
    expect(swung.nod.slice(0, 2)).toEqual([0, 0]);
    expect(swung.watch.slice(0, 2)).toEqual([0, 0]);
    expect(swung.clap.slice(0, 2)).toEqual([8, 8]);
    for (const move of ["sway", "wave", "spin", "nod", "clap", "watch"]) {
      expect([move, Math.max(swung[move][0], swung[move][1]) <= 8]).toEqual([move, true]);
      expect([move, swung[move][2] <= 8]).toEqual([move, true]);
    }
    // And the clap is inside the outline: seen from behind or before, no part of either arm stands further to the side of its
    // shoulder than the arm is thick, or over the shoulders.
    const clap = figureOf("clap");
    let wide = 0, high = 0;
    for (const beat of beats.filter((_, k) => k % 8 === 0)) for (const [k, r] of [3, 4].entries()) {
      const pivot = { ...mean(clap, arms2[k].top, { beat, dance: 1.2 }) };
      for (const v of bodyOf(r)) {
        const p = put(clap, v, { beat, dance: 1.2 });
        wide = Math.max(wide, (k === 0 ? -1 : 1) * (p.x - pivot.x)); high = Math.max(high, p.y - pivot.y);
      }
    }
    expect(wide).toBeLessThan(0.09);
    expect(wide).toBeGreaterThan(0.05);
    expect(high).toBeLessThan(0.07);
  });

  it("brings every figure's arms down when it sits: no hand of one that holds nothing stands over its shoulders, whatever its way of moving", () => {
    // The crowd sits through Space, the show's quiet, where main's seated figures swing no block over 4 times a second. Arms waved
    // and clapped overhead by seated figures counted 8 and 9 there against the lit ground before the stage (scripts/flash).
    let looked = 0, over = 0;
    for (const [list, vertices] of [[figures, rich], [phones, plain]] as const) {
      const armsOf = vertices.filter((v) => (v.mark.x === 3 || v.mark.x === 4) && v.mark.y === 0);
      const top = vertices.filter((v) => v.mark.x === 0 && v.mark.y === 0 && Math.abs(v.y - SHOULDER_Y) < 0.07 && Math.abs(v.x) > 0.25);
      for (const f of list.filter((f) => Math.floor(f.wear.y / 8) % 8 === 0)) for (const beat of [0, 0.5, 1.3, 3, 6.6]) {
        const shoulder = Math.max(...top.map((v) => put(f, v, { beat, dance: 1.6, sit: 1 }).y));
        for (const v of armsOf) { looked += 1; if (put(f, v, { beat, dance: 1.6, sit: 1 }).y > shoulder + 0.02) over += 1; }
      }
    }
    expect(looked).toBeGreaterThan(1e5);
    expect(over).toBe(0);
  });

  it("claps before its chest on every other beat, waves both arms one way, sways from the hips, turns a skirt out, folds its arms to nod, and stands with its hands on its hips", () => {
    // Each way of moving in turn, at the dance's middle.
    const figure = figureOf;
    const hands = [bodyOf(3).reduce(lowest), bodyOf(4).reduce(lowest)], crown = bodyOf(6).reduce((a, b) => (b.y > a.y ? b : a));
    const shoulder = rich.find((v) => v.mark.x === 0 && v.mark.y === 0 && Math.abs(v.y - SHOULDER_Y) < 0.01 && v.x > 0.3)!, hip = rich.find((v) => v.mark.x === 0 && v.mark.y === 0 && v.y < 0.85 && v.x > 0.15)!;
    // Clapping: the hands meet before the chest on every other beat, and stand apart on the beat between; with no song they hang.
    const clap = figure("clap");
    for (const beat of [0, 2, 6]) {
      const [left, right] = hands.map((v) => at2(clap, v, { beat, dance: 1 }));
      expect(right.x - left.x).toBeLessThan(0.12);
      for (const p of [left, right]) { expect(p.z).toBeGreaterThan(0.15); expect(p.y).toBeGreaterThan(1.05); expect(p.y).toBeLessThan(SHOULDER_Y); }
    }
    const [openL, openR] = hands.map((v) => at2(clap, v, { beat: 1, dance: 1 }));
    expect(openR.x - openL.x).toBeGreaterThan(0.2);
    expect(at2(clap, hands[1], { beat: 0.5, dance: 0 })).toEqual({ x: hands[1].x, y: hands[1].y, z: hands[1].z });
    // Waving: both hands up at the head's height or over it, leaning the same way together, there and back in four beats.
    const wave = figure("wave"), waved = [1, 3].map((beat) => hands.map((v) => at2(wave, v, { beat, dance: 1 })));
    for (const pair of waved) for (const p of pair) expect(p.y).toBeGreaterThan(SHOULDER_Y + 0.25);
    for (const hand of [0, 1]) expect(Math.abs(waved[0][hand].x - waved[1][hand].x)).toBeGreaterThan(0.15);
    expect(Math.sign(waved[0][0].x - waved[1][0].x)).toBe(Math.sign(waved[0][1].x - waved[1][1].x));
    // Swaying: the hips swing out further than the shoulders, which lean back over the feet, over four beats.
    const sway = figure("sway"), swing = (v: Vertex) => Math.abs(at2(sway, v, { beat: 1, dance: 1 }).x - at2(sway, v, { beat: 3, dance: 1 }).x);
    expect(swing(hip)).toBeGreaterThan(0.15);
    expect(swing(shoulder)).toBeLessThan(0.6 * swing(hip));
    expect(Math.abs(at2(sway, hip, { beat: 0, dance: 1 }).x - at2(sway, hip, { beat: 4, dance: 1 }).x)).toBeLessThan(1e-3);
    // Turning: the figure faces well round to each side in turn, over eight beats, and its skirt's hem stands further out as it turns
    // fastest than as it stops to turn back.
    const spin = figure("spin", 0, PART.SKIRT as number), nose = rich.filter((v) => v.mark.x === 6 && v.mark.y === 0).reduce((a, b) => (b.z > a.z ? b : a));
    const faces = [2, 6].map((beat) => at2(spin, nose, { beat, dance: 1 }));
    expect(faces[0].x * faces[1].x).toBeLessThan(0);
    expect(Math.abs(Math.atan2(faces[0].x, faces[0].z))).toBeGreaterThan(1.5);
    expect(Math.abs(Math.atan2(faces[0].x, faces[0].z))).toBeLessThan(2.2);
    const hemAt = (beat: number) => Math.max(...rich.filter((v) => v.mark.y === PART.SKIRT && v.y < 0.2).map((v) => { const p = put(spin, v, { beat, dance: 1 }); return Math.hypot(p.x, p.z); }));
    expect(hemAt(0)).toBeGreaterThan(1.3 * hemAt(2));
    expect(hemAt(2)).toBeCloseTo(hemAt(6), 4);
    // Nodding: the head's top goes forward on the beat, and the arms are folded across the chest, dancing or not, until it stands still
    // beside the visitor's bear.
    const nod = figure("nod");
    expect(at2(nod, crown, { beat: 0, dance: 1 }).z - at2(nod, crown, { beat: 0.5, dance: 1 }).z).toBeGreaterThan(0.04);
    for (const pose of [{ beat: 0.3, dance: 1 }, { beat: 0, dance: 0 }]) for (const v of hands) {
      const p = at2(nod, v, pose);
      expect(Math.abs(p.x)).toBeLessThan(0.2);
      expect(p.z).toBeGreaterThan(0.1);
      expect(p.y).toBeGreaterThan(1);
    }
    expect(at2(nod, hands[1], { beat: 0, dance: 1, still: 1, rising: 0 })).toEqual({ x: hands[1].x, y: hands[1].y, z: hands[1].z });
    // Watching, with its hands on its hips: the hands at the hips, the elbows out past them.
    const watch = figure("watch", 64 * (CUT.AKIMBO as number)), elbow = bodyOf(4).filter((v) => Math.abs(v.y - (SHOULDER_Y - 0.27)) < 1e-6).reduce((a, b) => (b.x > a.x ? b : a));
    const palm = at2(watch, hands[1], { beat: 0, dance: 0 }), out2 = at2(watch, elbow, { beat: 0, dance: 0 });
    expect(palm.x).toBeLessThan(0.3);
    expect(palm.y).toBeGreaterThan(0.85);
    expect(palm.y).toBeLessThan(1.15);
    expect(out2.x).toBeGreaterThan(0.45);
  });

  it("shapes a figure by each of its own numbers: every choice moves the corners it should, and what a head wears nods with the head", () => {
    // A figure that ignored one of its numbers would still fit every reach, being plainer. Each row is a pair of figures that differ
    // in one thing, and something measured on both, in the figure's own units, standing with no dance.
    const P = PART as Record<string, number>, C = CUT as Record<string, number>;
    const shaped = (o: { parts?: number; cuts?: number; move?: string; body?: Partial<Vec>; cut?: Partial<Vec>; stoop?: number; size?: number }): Figure => {
      const base = standard({ x: 0, y: 0, z: 0, w: 0 });
      return { ...base, body: { ...base.body, ...o.body }, cut: { ...base.cut, ...o.cut }, wear: { x: o.parts ?? 0, y: MOVES.indexOf(o.move ?? "watch") + 64 * (o.cuts ?? 0), z: o.stoop ?? 0, w: o.size ?? 1 } };
    };
    const still = { beat: 0, dance: 0 };
    const of = (bit: number, rig?: number) => rich.filter((v) => v.mark.y === bit && (rig === undefined || v.mark.x === rig));
    const each = (f: Figure, list: Vertex[], pose: Pose = still) => list.map((v) => ({ ...put(f, v, pose) }));
    const lowest2 = (f: Figure, list: Vertex[]) => Math.min(...each(f, list).map((p) => p.y)), highest = (f: Figure, list: Vertex[]) => Math.max(...each(f, list).map((p) => p.y));
    const widest = (f: Figure, list: Vertex[]) => Math.max(...each(f, list).map((p) => Math.hypot(p.x, p.z)));
    const head = of(0, 6), legs = of(0, 1), body = of(0, 0), belly = body.filter((v) => v.y > 0.9 && v.y < 1.3);
    // How far the hips come down on the beat, for one that bobs, by how hard it dances.
    const dip = (size2: number) => mean(shaped({ move: "bob", size: size2 }), seat, { beat: 0.5, dance: 1.2 }).y - mean(shaped({ move: "bob", size: size2 }), seat, { beat: 0, dance: 1.2 }).y;
    const rows: [string, number, number, number][] = [
      ["long hair hangs lower than a bob", lowest2(shaped({ parts: P.HAIR, cut: { x: 0.75 } }), of(P.HAIR)), lowest2(shaped({ parts: P.HAIR, cut: { x: 1.3 } }), of(P.HAIR)), -0.15],
      ["a long tail hangs lower than a short one", lowest2(shaped({ parts: P.TAIL, cut: { x: 0.8 } }), of(P.TAIL)), lowest2(shaped({ parts: P.TAIL, cut: { x: 1.4 } }), of(P.TAIL)), -0.2],
      ["one tail hangs at the middle, two to either side", Math.max(...each(shaped({ parts: P.TAIL }), of(P.TAIL)).map((p) => p.x)), Math.max(...each(shaped({ parts: P.TAIL + P.TAIL2 }), of(P.TAIL)).map((p) => p.x)), 0.05],
      ["a top hat's crown stands higher", highest(shaped({ parts: P.BRIM + P.CROWN }), of(P.CROWN)), highest(shaped({ parts: P.BRIM + P.CROWN, cut: { z: 2.5 } }), of(P.CROWN)), 0.14],
      ["a floppy hat's brim is wider", widest(shaped({ parts: P.BRIM + P.CROWN }), of(P.BRIM)), widest(shaped({ parts: P.BRIM + P.CROWN, cut: { w: 1.4 } }), of(P.BRIM)), 0.08],
      ["and its rim droops", lowest2(shaped({ parts: P.BRIM + P.CROWN }), of(P.BRIM)), lowest2(shaped({ parts: P.BRIM + P.CROWN, cut: { w: 1.4 } }), of(P.BRIM)), -0.04],
      ["a dress's hem stands higher than a long skirt's", lowest2(shaped({ parts: P.SKIRT, cut: { y: 0.1 } }), of(P.SKIRT)), lowest2(shaped({ parts: P.SKIRT, cut: { y: 0.55 } }), of(P.SKIRT)), 0.35],
      ["and is narrower", widest(shaped({ parts: P.SKIRT, cut: { y: 0.55 } }), of(P.SKIRT)), widest(shaped({ parts: P.SKIRT, cut: { y: 0.1 } }), of(P.SKIRT)), 0.04],
      ["a stout figure's belly stands out", Math.max(...each(shaped({}), belly).map((p) => p.z)), Math.max(...each(shaped({ body: { x: 1.5 } }), belly).map((p) => p.z)), 0.06],
      ["and its legs are thicker", Math.max(...each(shaped({}), legs).map((p) => p.z)), Math.max(...each(shaped({ body: { x: 1.5 } }), legs).map((p) => p.z)), 0.015],
      ["broad shoulders are wider than slight ones", Math.max(...each(shaped({ body: { y: 0.82 } }), body).map((p) => p.x)), Math.max(...each(shaped({ body: { y: 1.04 } }), body).map((p) => p.x)), 0.05],
      ["long legs stand the head higher", highest(shaped({ body: { z: 0.93 } }), head), highest(shaped({ body: { z: 1.07 } }), head), 0.11],
      ["a child's head is bigger for its body", widest(shaped({}), head), widest(shaped({ body: { w: 1.3 } }), head), 0.03],
      ["flared trousers are wider at the foot", widest(shaped({}), legs.filter((v) => v.y < 0.01)), widest(shaped({ cuts: C.BELLS }), legs.filter((v) => v.y < 0.01)), 0.05],
      ["and no wider at the hip", widest(shaped({ cuts: C.BELLS }), legs.filter((v) => v.y > LEG - 0.01)), widest(shaped({}), legs.filter((v) => v.y > LEG - 0.01)), 0],
      ["a big round head of hair stands out from the head", widest(shaped({}), head), widest(shaped({ cuts: C.AFRO }), head), 0.08],
      ["a shawl is a poncho cut short", lowest2(shaped({ parts: P.PONCHO }), of(P.PONCHO)), lowest2(shaped({ parts: P.PONCHO, cuts: C.SHAWL }), of(P.PONCHO)), 0.15],
      ["a stoop carries the head forward", Math.min(...each(shaped({}), head).map((p) => p.z)), Math.min(...each(shaped({ stoop: 0.12 }), head).map((p) => p.z)), 0.08],
      ["one that dances harder comes down further on the beat", dip(0.62), dip(1), 0.03],
    ];
    for (const [name, a, b, by] of rows) expect([name, by > 0 ? b - a > by : by < 0 ? b - a < by : b === a]).toEqual([name, true]);
    // And the crowd's figures do differ in each number: no two of the fixed day's in how hard they dance, and a spread of the rest.
    const real = figuresOf(SHOWS[0].desktop);
    expect(new Set(real.map((f) => f.wear.w)).size).toBe(real.length);
    expect([Math.min(...real.map((f) => f.wear.w)) < 0.66, Math.max(...real.map((f) => f.wear.w)) > 0.96]).toEqual([true, true]);
    for (const read of [(f: Figure) => f.body.x, (f: Figure) => f.body.y, (f: Figure) => f.body.z, (f: Figure) => f.body.w, (f: Figure) => f.wear.z, (f: Figure) => f.cut.x, (f: Figure) => f.cut.y]) {
      expect(new Set(real.map(read)).size).toBeGreaterThan(30);
    }
    // What a head wears is on the head: as one that nods bows its head, each of them goes with it, as one piece with it.
    const nodding = shaped({ move: "nod", parts: P.BRIM + P.CROWN + P.BILL + P.BAND + P.KNOT + P.WREATH + P.HAIR + P.TAIL + P.TAIL2 + P.BEARD });
    const crown = head.reduce((a, b) => (b.y > a.y ? b : a)), bowed = (v: Vertex) => [{ ...put(nodding, v, { beat: 0.5, dance: 1.2 }) }, { ...put(nodding, v, { beat: 0, dance: 1.2 }) }];
    const [crownUp, crownDown] = bowed(crown);
    expect(crownDown.z - crownUp.z).toBeGreaterThan(0.04);
    for (const name of ["BRIM", "CROWN", "BILL", "BAND", "KNOT", "WREATH", "HAIR", "TAIL", "TAIL2", "BEARD"]) {
      const v = of(P[name]).reduce((a, b) => (b.y < a.y ? b : a)), [up, down] = bowed(v), apart = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      expect([name, v.mark.x, Math.abs(apart(up, crownUp) - apart(down, crownDown)) < 1e-9, apart(up, down) > 1e-3]).toEqual([name, 6, true, true]);
    }
    // And how a figure is cut colours it: a shin under shorts and a forearm under short sleeves are its own dark, a long shirt's tail
    // is its top's colour, and a bald scalp its own dark and not its hair's.
    const tones2 = { x: tone(COLOURS.legs[0] as number), y: tone(COLOURS.hair[4] as number), z: tone(COLOURS.self[1] as number), w: tone(COLOURS.thing[0] as number) };
    const coloured = (tint: number, cuts: number) => {
      const out = { r: 0.5, g: 0.5, b: 0.5 };
      runTones(null, out, { x: 0, y: 0, z: tint, w: 0 }, null, null, 1, null, { x: 0, y: MOVES.indexOf("bob") + 64 * cuts, z: 0, w: 1 }, null, tones2, 0, 0, 0, 0);
      return [out.r, out.g, out.b].map((c) => Math.round(c * 1e4) / 1e4).join();
    };
    const [legsTone, hairTone, selfTone] = [coloured(1, 0), coloured(2, 0), coloured(3, 0)], top = "0.5,0.5,0.5";
    expect(new Set([legsTone, hairTone, selfTone, top]).size).toBe(4);
    expect([coloured(5, 0), coloured(5, C.SHORTS)]).toEqual([legsTone, selfTone]);
    expect([coloured(6, 0), coloured(6, C.BARE)]).toEqual([top, selfTone]);
    expect([coloured(7, 0), coloured(7, C.TUNIC)]).toEqual([legsTone, top]);
    expect([coloured(8, 0), coloured(8, C.BALD)]).toEqual([hairTone, selfTone]);
  });

  it("colours a figure in deep colours alone: its top the instance's own colour, and the rest of it from the four tones it carries, none brighter than MOST", () => {
    // Each vertex's colour as the shader leaves it, for every figure and every vertex it wears. A bright crowd would no longer read
    // as dark figures before the lit stage (CLAUDE.md, figures are silhouettes).
    let brightest = 0, lightest = 0, looked = 0;
    const seen = new Set<string>(), out: Rgb = { r: 0, g: 0, b: 0 };
    for (const [list, c] of [[figures, crowd], [phones, phone]] as const) {
      const mark = c.figure.getAttribute("aMark"), marksOnce = new Map<string, Vec>();
      for (let k = 0; k < mark.count; k++) { const m = vec(mark, k); marksOnce.set(`${m.y} ${m.z}`, m); }
      for (const f of list) for (const m of marksOnce.values()) {
        if (!(m.y === 0 || Math.floor(f.wear.x / m.y) % 2 === 1)) continue;
        out.r = f.top.r; out.g = f.top.g; out.b = f.top.b;
        runTones(null, out, m, f.fig, null, 1, f.body, f.wear, f.cut, f.tone, 0, 0, 0, 0);
        brightest = Math.max(brightest, out.r, out.g, out.b);
        lightest = Math.max(lightest, light(out));
        seen.add([out.r, out.g, out.b].map((v) => v.toFixed(4)).join());
        looked += 1;
      }
    }
    expect(looked).toBeGreaterThan(3000);
    expect(brightest).toBeLessThanOrEqual(MOST);
    expect(MOST).toBeLessThanOrEqual(0.08);
    // No colour reflects more than a twentieth of the light on it, and there are many of them.
    expect(lightest).toBeLessThan(0.05);
    expect(seen.size).toBeGreaterThan(40);
    // A tone comes back from its number as the colour that went in, to a hundredth of MOST, so a figure's parts are the colours named.
    for (const hex of [...COLOURS.legs, ...COLOURS.hair, ...COLOURS.self, ...COLOURS.thing] as number[]) {
      const want = new THREE.Color(hex);
      out.r = 1; out.g = 1; out.b = 1;
      runTones(null, out, { x: 0, y: 0, z: 1, w: 0 }, null, null, 1, null, { x: 0, y: 0, z: 0, w: 1 }, null, { x: tone(hex), y: 0, z: 0, w: 0 }, 0, 0, 0, 0);
      expect(Math.max(Math.abs(out.r - want.r), Math.abs(out.g - want.g), Math.abs(out.b - want.b))).toBeLessThan(0.01 * MOST);
    }
    // And the tops are deep colours apart from each other, no longer near one grey: at least ten hues a sixth of the wheel apart or more
    // between them.
    const hues = (COLOURS.top as number[]).map((hex) => { const hsl = { h: 0, s: 0, l: 0 }; new THREE.Color(hex).getHSL(hsl); return hsl; });
    expect(hues.filter(({ s }) => s > 0.3).length).toBeGreaterThanOrEqual(10);
    const sextants = new Set(hues.filter(({ s }) => s > 0.3).map(({ h }) => Math.floor(h * 6)));
    expect(sextants.size).toBeGreaterThanOrEqual(5);
    for (const list of Object.values(COLOURS) as number[][]) for (const hex of list) expect(light(new THREE.Color(hex))).toBeLessThan(0.05);
  });
});

describe("the crowd's people", () => {
  const all = hills.map((c) => ({ who: peopleOf(c), placed: placedOf.get(c)! }));
  // How many of what makes an outline two people share.
  const shared = (a: Record<string, unknown>, b: Record<string, unknown>) => OUTLINE.filter((slot: string) => a[slot] === b[slot]).length;

  it("are every one a different person on every hill: no two figures of a crowd share an outline, on a desktop or as a phone draws them", () => {
    // An outline is a figure's stature, build, legs, top, hair, beard, headwear, back and what it carries. Three hills, whose landmarks
    // take different seats: 292 figures where none stands near the crowd, which is every seat the path and the bears' line leave.
    expect(all.map(({ who }) => who.length)).toEqual([hills[0].count, 292, hills[2].count]);
    for (const { who } of all) {
      expect(new Set(who.map((p) => outlineOf(p))).size).toBe(who.length);
      expect(new Set(who.map((p) => outlineOf(plainly(p)))).size).toBe(who.length);
      // And the first 150, a phone's crowd, and the front half that the quality ladder leaves, are as varied: each still has at least
      // four kinds of everything that makes an outline but a beard.
      for (const few of [who.slice(0, 150), who.slice(0, Math.ceil(who.length / 2)), who.slice(0, 75)]) {
        for (const slot of OUTLINE.filter((s: string) => s !== "beard") as string[]) {
          const kinds = new Set(few.map((p) => (plainly(p) as Record<string, unknown>)[slot]));
          expect([slot, kinds.size >= (slot === "back" ? 2 : 4)]).toEqual([slot, true]);
        }
        expect(new Set(few.map((p) => p.move)).size).toBe(MOVES.length);
      }
    }
  });

  it("gives no two figures one outline as a phone draws them, on a made-up hill of 2,000 seats: where two would be one, another person is drawn", () => {
    // A phone's figure leaves parts out, so two people who differ only in those would be one on a phone. Three shows' hills never
    // bring such a pair up, so a crowd that compared whole outlines alone would pass there by luck. Here 2,000 seats stand 20 m
    // apart, far from each other and from the stage, where nothing but that rule chooses between the people a seat's stream draws.
    const far = Array.from({ length: 2000 }, (_, i) => ({ x: 2000 + 20 * (i % 50), z: 2000 + 20 * Math.floor(i / 50), r: 0, sit: false }));
    const who = people(far);
    expect(new Set(who.map((p) => outlineOf(p))).size).toBe(2000);
    expect(new Set(who.map((p) => outlineOf(plainly(p)))).size).toBe(2000);
    // And the rule did choose: some figure's first draw was passed over for another, as its plain outline was taken.
    const first = people(far.slice(0, 1))[0];
    expect(outlineOf(who[0])).toBe(outlineOf(first));
  }, 30000);

  it("stand each figure among neighbours unlike it: no two within 8 m share more than five of the nine things that make an outline, none within 4 m more than four, and the two nearest never dress alike", () => {
    expect(SHARE).toEqual([4, 5]);
    for (const { who, placed } of all) {
      let most = 0, close = 0, pairs = 0, sameTop = 0, sameMove = 0;
      who.forEach((p, i) => {
        const near = who.map((q, j) => ({ q, d: Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z) })).filter((_, j) => j !== i).sort((a, b) => a.d - b.d);
        for (const { q, d } of near) {
          if (d >= 8) break;
          const s = shared(p as Record<string, unknown>, q as Record<string, unknown>);
          most = Math.max(most, s); pairs += 1;
          if (d < 4) close = Math.max(close, s);
        }
        // Within 4 m, none wears its top in its colour, and none moves its way with its legs and its hair.
        for (const { q, d } of near) if (d < 4) {
          if (q.colour.top === p.colour.top && q.top === p.top) sameTop += 1;
          if (q.move === p.move && q.legs === p.legs && q.hair === p.hair) sameMove += 1;
        }
      });
      expect(pairs).toBeGreaterThan(2000);
      expect(most).toBeLessThanOrEqual(5);
      expect(close).toBeLessThanOrEqual(4);
      expect(sameTop).toBe(0);
      expect(sameMove).toBe(0);
    }
  });

  it("are the same people at the same seats for a smaller crowd as for a larger, and the same every time", () => {
    const { who, placed } = all[1];
    expect(people(placed)).toEqual(who);
    expect(people(placed.slice(0, 150))).toEqual(who.slice(0, 150));
    expect(people(placed.slice(0, 40))).toEqual(who.slice(0, 40));
    // A phone's crowd on the first hill is the desktop's first 150, each drawn plainly.
    expect(phones.map((f) => f.wear.x)).toEqual(peopleOf(crowd).slice(0, 150).map((p) => wearing(plainly(p)).parts));
    expect(figures.map((f) => [f.wear.x, f.wear.y])).toEqual(peopleOf(crowd).map((p) => { const w = wearing(p); return [w.parts, w.style]; }));
  });

  it("carry a few of each thing across the hill, sparingly, and nothing overhead between a test pose and the band", () => {
    for (const { who, placed } of all) {
      const carried = (list: typeof who) => Object.fromEntries((PROPS as string[]).map((prop) => [prop, list.filter((p) => p.prop === prop).length]));
      // One figure in PROP_EVERY at the most carries something, each thing in its turn: three to seven of each on a desktop.
      const counts = carried(who);
      for (const prop of PROPS as string[]) { expect([prop, counts[prop] >= 3]).toEqual([prop, true]); expect([prop, counts[prop] <= 7]).toEqual([prop, true]); }
      expect(who.filter((p) => p.prop !== "none").length).toBeLessThanOrEqual(Math.ceil(who.length / PROP_EVERY));
      // A phone's 150 have at least one of each that a phone draws.
      const few = carried(who.slice(0, 150).map((p) => plainly(p)) as typeof who);
      for (const prop of ["flag", "stand", "balloon", "finger"]) expect([prop, few[prop] >= 1]).toEqual([prop, true]);
      expect([few.hoop, few.rider, few.drum]).toEqual([0, 0, 0]);
      // What stands over a head stands out of each test pose's view of the band.
      who.forEach((p, i) => { if (["flag", "stand", "balloon", "rider"].includes(p.prop)) expect([p.prop, i, inView(placed[i].x, placed[i].z)]).toEqual([p.prop, i, false]); });
      // And the strip each pose sees the band through is real: seats do stand in it.
      expect(placed.filter((s) => inView(s.x, s.z)).length).toBeGreaterThan(20);
    }
    // The strip runs from each pose to the stage's centre and takes in the band's width there.
    for (const pose of Object.values(TEST_POSES) as { x: number; z: number }[]) {
      expect(inView(pose.x + 0.5 * (STAGE[0] - pose.x), pose.z + 0.5 * (STAGE[1] - pose.z))).toBe(true);
      expect(inView(STAGE[0] - 12 * ux + 6 * nx, STAGE[1] - 12 * uz + 6 * nz)).toBe(false);
    }
    expect(inView(STAGE[0] + 12 * ux + 5 * nx, STAGE[1] + 12 * uz + 5 * nz)).toBe(true);
    expect(inView(STAGE[0] + 40 * ux + 30 * nx, STAGE[1] + 40 * uz + 30 * nz)).toBe(false);
  });

  it("move in a mix on any day: on thirty days' gatherings, no figure's four nearest all move its way, which people() rules out as it goes", () => {
    for (let seed = 0; seed < 30; seed++) {
      const placed = seatsOf({ path: [], line: [], landmarks: [] }, seed) as { x: number; z: number }[], who = people(placed) as { move: string }[];
      const patches = who.filter((p, i) => {
        const near = who.map((q, j) => ({ q, d: Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z) })).filter((_, j) => j !== i).sort((a, b) => a.d - b.d).slice(0, 4);
        return near.every(({ q }) => q.move === p.move);
      }).length;
      expect([seed, patches]).toEqual([seed, 0]);
    }
  }, 30000);

  it("move in a mix: no figure's four nearest all move its way, a few children stand among the adults, and no child carries more than a balloon", () => {
    for (const { who, placed } of all) {
      let patches = 0;
      who.forEach((p, i) => {
        const near = who.map((q, j) => ({ q, d: Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z) })).filter((_, j) => j !== i).sort((a, b) => a.d - b.d).slice(0, 4);
        if (near.every(({ q }) => q.move === p.move)) patches += 1;
      });
      expect(patches).toBe(0);
      const children = who.filter((p) => p.stature === "child");
      expect(children.length).toBeGreaterThanOrEqual(6);
      expect(children.length).toBeLessThan(0.08 * who.length);
      for (const child of children) { expect(["none", "balloon"]).toContain(child.prop); expect(child.beard).toBe(false); expect(child.tall).toBeLessThan(0.67); }
      // Whoever sits carries only what can be held seated, and moves a way a seated figure can, its arms down (the crowd's shader).
      who.forEach((p, i) => { if (placed[i].sit) { expect(["none", "stand", "finger"]).toContain(p.prop); expect(["bob", "sway", "nod", "watch"]).toContain(p.move); } });
      // Whoever holds a thing up sways or stands, so that nothing held overhead jigs on every beat.
      for (const p of who) if (["flag", "balloon", "finger", "stand", "rider", "hoop"].includes(p.prop)) expect([p.prop, ["sway", "watch"].includes(p.move)]).toEqual([p.prop, true]);
    }
    // Where a flag falls to the seat of one who would have been a child, a short grown figure holds it. Here every seat but a child's
    // sits, so the flag, which no one seated holds, waits for that seat.
    const { who, placed } = all[1];
    const kid = who.findIndex((p, i) => i > 16 && p.stature === "child" && p.prop === "none" && !placed[i].sit && !inView(placed[i].x, placed[i].z));
    expect(kid).toBeGreaterThan(16);
    const holder = people(placed.map((seat, i) => ({ ...seat, sit: i !== kid })))[kid];
    expect([holder.prop, holder.stature]).toEqual(["flag", "short"]);
  });

  it("picks from a list of choices only those named, or all but those named, in the list's own order, and dresses whoever holds something so that it does not catch", () => {
    const list = [["a", 1], ["b", 2], ["c", 3]];
    expect(only(list, ["c", "a"])).toEqual([["a", 1], ["c", 3]]);
    expect(without(list, ["c", "a"])).toEqual([["b", 2]]);
    expect([only(list, []), without(list, [])]).toEqual([[], list]);
    // The rules made of them: a flag flies over no big round head of hair and no top hat, one beside a stand wears no skirt to the
    // ankle, a child rides on a head with little hair, and no child is bald.
    for (const { who } of all) for (const p of who) {
      if (p.prop === "flag") expect([p.hair !== "afro", p.head !== "topper"]).toEqual([true, true]);
      if (p.prop === "stand") expect(p.legs).not.toBe("maxi");
      if (p.prop === "rider") expect(["bald", "crop", "bob"]).toContain(p.hair);
      if (p.stature === "child") expect(p.hair).not.toBe("bald");
    }
  });

  it("wear what they are: each figure's parts and cut are its person's, a phone's without what its geometry leaves out", () => {
    const P = PART as Record<string, number>, C = CUT as Record<string, number>;
    const base = { stature: "mid", build: "average", legs: "jeans", top: "shirt", hair: "crop", beard: false, head: "none", back: "none", prop: "none", move: "bob", akimbo: false };
    const worn = (p: Record<string, unknown>) => wearing({ ...base, ...p });
    const move = (name: string) => MOVES.indexOf(name);
    expect(worn({})).toEqual({ parts: 0, style: move("bob") });
    expect(worn({ head: "hat" }).parts).toBe(P.BRIM + P.CROWN);
    expect(worn({ head: "cap" }).parts).toBe(P.CROWN + P.BILL);
    expect(worn({ head: "bandana" }).parts).toBe(P.BAND + P.KNOT);
    expect(worn({ hair: "braids", beard: true }).parts).toBe(P.TAIL + P.TAIL2 + P.BEARD);
    expect(worn({ hair: "afro" })).toEqual({ parts: 0, style: move("bob") + 64 * C.AFRO });
    expect(worn({ legs: "tunic", top: "shawl" })).toEqual({ parts: P.SKIRT + P.PONCHO, style: move("bob") + 64 * (C.TUNIC + C.SHAWL) });
    expect(worn({ legs: "dress", top: "tee", hair: "bald" })).toEqual({ parts: P.SKIRT, style: move("bob") + 64 * (C.SHORTS + C.BARE + C.BALD) });
    expect(worn({ legs: "bells", back: "both", move: "spin" })).toEqual({ parts: P.PACK + P.ROLL, style: move("spin") + 64 * C.BELLS });
    expect(worn({ legs: "shorts", back: "roll", hair: "long", top: "poncho" })).toEqual({ parts: P.ROLL + P.HAIR + P.PONCHO, style: move("bob") + 64 * C.SHORTS });
    expect(worn({ legs: "maxi", hair: "mane", head: "floppy", prop: "drum" })).toEqual({ parts: P.SKIRT + P.HAIR + P.BRIM + P.CROWN + P.DRUM, style: move("bob") + 8 * 4 });
    expect(worn({ hair: "tail", head: "wreath", back: "pack", prop: "hoop", move: "sway" })).toEqual({ parts: P.TAIL + P.WREATH + P.PACK + P.HOOP, style: move("sway") + 8 * 5 });
    expect(worn({ head: "topper", prop: "finger", move: "watch" })).toEqual({ parts: P.BRIM + P.CROWN + P.FINGER, style: move("watch") + 8 * 2 });
    expect(worn({ head: "band", hair: "bob", prop: "stand", move: "watch" }).parts).toBe(P.BAND + P.HAIR + P.STAND);
    expect(worn({ prop: "balloon" })).toEqual({ parts: P.BALLOON, style: move("bob") + 8 });
    expect(worn({ prop: "flag", move: "sway" })).toEqual({ parts: P.POLE + P.FLAG, style: move("sway") + 8 });
    expect(worn({ prop: "rider", move: "sway" })).toEqual({ parts: P.RIDER, style: move("sway") + 8 * 3 });
    expect(worn({ move: "watch", akimbo: true }).style).toBe(move("watch") + 64 * C.AKIMBO);
    expect(worn({ move: "watch", akimbo: true, prop: "finger" }).style).toBe(move("watch") + 8 * 2);
    expect(worn({ move: "nod", akimbo: true }).style).toBe(move("nod"));
    // A phone's: a wreath is a band, braids one tail, a bedroll a pack, and no beard, hoop, rider or drum, so its arms hold none.
    const lean = plainly({ ...base, head: "wreath", hair: "braids", beard: true, back: "roll", prop: "rider", move: "sway" });
    expect(wearing(lean)).toEqual({ parts: P.BAND + P.TAIL + P.PACK, style: move("sway") });
    const kept2 = plainly({ ...base, prop: "balloon", back: "both" });
    expect(wearing(kept2).parts).toBe(P.PACK + P.BALLOON);
    // No phone's figure wears a part its geometry lacks.
    const missing = (PLAIN_LEAVES_OUT as string[]).reduce((sum, name) => sum + P[name], 0);
    for (const f of phones) expect(Math.floor(f.wear.x) & missing).toBe(0);
  });
});

describe("the crowd's seats on the hill", () => {
  it("tells each figure how far the ground falls from its seat to where its seated feet rest, ahead of it the way it faces, in its own units", () => {
    const fig = new THREE.BufferAttribute(crowd.each.aFig, 4);
    expect(crowd.mesh.geometry.getAttribute("aFig").itemSize).toBe(4);
    const turn = new THREE.Quaternion(), forward = new THREE.Vector3();
    let falls = 0;
    for (let i = 0; i < crowd.count; i++) {
      matrix.fromArray(crowd.each.matrix, 16 * i);
      matrix.decompose(at, turn, size);
      forward.set(0, 0, 1).applyQuaternion(turn).multiplyScalar(FOOT[0] * size.z);
      const fall = (height(at.x, at.z) - height(at.x + forward.x, at.z + forward.z)) / size.y;
      expect(fig.getW(i)).toBeCloseTo(fall, 5);
      // The hill never falls or rises further ahead of a seat than the feet are let to follow.
      expect(fig.getW(i)).toBeGreaterThanOrEqual(DROP[0]);
      expect(fig.getW(i)).toBeLessThanOrEqual(DROP[1]);
      if (fall > 0.02) falls += 1;
    }
    // The figures face the stage, down the hill: for most of them the ground falls away ahead.
    expect(falls).toBeGreaterThan(crowd.count / 2);
  });
});
