import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import {
  backOf, BEAR_LEGS, BEAR_TAIL, buildCrowd, CHOICES, CLOTHS, COLOURS, CREST, crestOf, CUP_ARM, CUT, CYCLE, DROP, DYE, DYED, DYED_PROPS, FEET, figureGeometry, FOLD, FOOT, FORMS, formOfMark, formsOf,
  ARM_RINGS, FRIEND_HAND, groundUnder, HAND, HANG, HIP_X, LEG_RINGS, TORSO, HOLD_UP, inView, KNEES, LEG, LOW, lyingOf, MOST, MOVES, only, OUTLINE, outlineOf, OVERHEAD, PART, partingOptions, people, PLAIN_LEAVES_OUT, plainly, poseOf,
  PROP_EVERY, PROPS, QUIET, dressOn, HAIRS, SKIN, DRESS, PATTERN, PATTERNS, SEEDS, seedOf, CLOTHES, RIM, RIM_LEAST, RIM_SIDE, RIM_TINT, RIM_TO, LIT, HOUSE, HOUSE_LOW, HOUSE_TINT, LAMP_HALF, LAMP_TINT, LAMP_TO, COVER, APART, stageTurn, standerOf, HOOD_ROPE, apartOf, dressFor, dressPick, drawnOf, DRAWN_VIEWS, ENDS, MARGIN, AWAY, CLOSE, UNDRAWN, sourceOf, SOURCES, pieces, lightOf, topLight, TINT, RIG, DRESS_FINE, DRESS_EDGE, SEAT, wardrobe, WARDROBE, SHARE, SHOULDER_X, SHOULDER_Y, SIT_POSE, SITS, SPLAY, STANDS, stances, TALL, TINTS, tone, TOP, wearing, without,
} from "../../../public/world/crowd.js";
import { MOVE as STEP, SLOW, STRUM, swing } from "../../../public/world/band.js";
import { buildStage, FLOOR } from "../../../public/world/stage.js";
import { buildBear, stride } from "../../../public/world/bears.js";
import { DAYBREAK, DEEP, FIRST_LIGHT, lookAt, newLook } from "../../../public/world/night.js";
import { boomLength, HEAD, swingAt } from "../../../public/world/avatar.js";
import { FACING, height, SHELF_Y, STAGE, STAGE_COLUMN, TEST_POSES } from "../../../public/world/ground.js";
import { makeBuilders } from "../../../public/world/landmarks.js";
import { landColour, POOL, POOL_END, POOL_HALF, POOL_UP, surfaceOf, WEAR, WORN } from "../../../public/world/island.js";
import { buildPath, buildWalkLine, layout, placeLandmarks } from "../../../public/world/path.js";
import { budgetFor } from "../../../public/world/quality.js";
import { gathering, keepOuts, PERSON, seats as seatsOf, wholeGroups } from "../../../public/world/seats.js";

// buildCrowd builds the crowd here from the world's own modules and three, on the world's path and the bears' line 7 m to its left as
// main.js lays them, with two landmarks of the test's own in the front rows, at every seat on the hill. seats.js runs as it is, and
// pass-through mocks keep what buildCrowd hands seats() and parting().

type Around = { path: number[][]; line: number[][]; landmarks: number[][] };
type Seat = { x: number; z: number; r: number; sit: boolean; face: number; blanket: number; group: number };
const kept = vi.hoisted(() => ({ around: [] as Around[], options: [] as Record<string, unknown>[], placed: [] as Seat[][], idle: false }));

vi.mock("../../../public/world/seats.js", async (original) => {
  const seats = await original<{
    seats: (around: Around, seed?: number, count?: number) => Seat[];
    parting: (placed: Seat[], options: Record<string, unknown>) => unknown;
  }>();
  return {
    ...seats,
    seats: (around: Around, seed?: number, count?: number) => {
      kept.around.push(around);
      return seats.seats(around, seed, count);
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
// The landmarks are raised from `from`'s map: the show's own, or, for a day whose show has none, the one the site takes (the
// nearest show's of its era).
function crowdOf(date: string, small = false, count = small ? 150 : 350, seed = 0, from = date): typeof crowd {
  const map = JSON.parse(readFileSync(new URL(`${from}.json`, MAPS), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
  const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
  const raised = placeLandmarks(new THREE.Scene(), path, tracks, true, makeBuilders(small), layout(tracks, from === FIXED ? 7 : Math.floor(tracks.length * 0.45), path), line, surfaceOf(small ? 52 : 80));
  const c = buildCrowd(new THREE.Scene(), { count, path, line, landmarks: raised, plain: small, date, seed });
  placedOf.set(c, kept.placed[kept.placed.length - 1]);
  return c;
}
const SHOWS = [FIXED, "1970-08-30", "1990-12-09"].map((date) => ({ date, desktop: crowdOf(date), phone: crowdOf(date, true) }));
// The people a crowd is built of: as people() deals them, in what the era wears besides (wardrobe; these crowds are of no date).
const peopleOf = (c: typeof crowd) => wardrobe(people(placedOf.get(c)!));
// Mixes of people the crowd's bounds are to hold for, whatever people() deals (buildCrowd's mix), each of the kind a review's mix
// had more of: every standing figure that holds nothing turning on the spot; every figure stout, or as broad as any may be;
// every standing one but a child holding a flag or a balloon; every standing one free-armed, so friends; every seated one in a
// poncho, a shawl or a shirt in turn, with nothing, a pack, a bedroll or both on its back; every seated one with its hair, its
// head and its hands as lie back, so as many lie back as may; and every seated one but a child broad and holding a flag or a
// balloon.
type Person = Record<string, unknown>;
const MIXES: Record<string, (who: Person[], placed: { sit: boolean }[]) => Person[]> = {
  turning: (who, placed) => who.map((p, i) => (!placed[i].sit && p.prop === "none" ? { ...p, move: "spin" } : p)),
  stout: (who) => who.map((p, i) => ({ ...p, build: "stout", girth: 1.32 + 0.28 * ((i * 0.618) % 1) })),
  widest: (who) => who.map((p) => ({ ...p, build: "stout", girth: 1.6, wide: 1.04 })),
  holding: (who, placed) => who.map((p, i) => (!placed[i].sit && p.stature !== "child" ? { ...p, prop: i % 2 ? "flag" : "balloon", move: i % 4 < 2 ? "sway" : "watch" } : p)),
  free: (who, placed) => who.map((p, i) => (!placed[i].sit ? { ...p, prop: "none", move: ["watch", "sway", "nod", "shift"][i % 4], stature: p.stature === "child" ? "mid" : p.stature } : p)),
  covered: (who, placed) => who.map((p, i) => (placed[i].sit ? { ...p, top: ["poncho", "shawl", "shirt"][i % 3], back: ["none", "pack", "roll", "both"][Math.floor(i / 3) % 4] } : p)),
  lying: (who, placed) => who.map((p, i) => (placed[i].sit ? { ...p, hair: ["crop", "tail", "braids", "bald"][i % 4], head: ["none", "wreath", "band", "bandana"][Math.floor(i / 4) % 4], prop: "none", back: "none" } : p)),
  seatedHolding: (who, placed) => who.map((p, i) => (placed[i].sit && p.stature !== "child" ? { ...p, prop: i % 2 ? "flag" : "balloon", build: "stout", girth: 1.32 + 0.28 * ((i * 0.618) % 1), wide: 1.04 } : p)),
};
// A day's crowd of the free-armed, so of friends: on any mix, some to look at. It is built when it is first looked at, after the
// tests that look at the fixed day's own gathering, since gathering() keeps only the last day's.
let freeArmed: typeof crowd | undefined;
const befriended = () => (freeArmed ??= buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [], seed: 600, mix: MIXES.free }));

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
// The figure wearing() is asked for when a test makes one up: in jeans and a shirt, carrying nothing, bobbing.
const BASE_FIGURE = { stature: "mid", build: "average", legs: "jeans", top: "shirt", hair: "crop", beard: false, head: "none", back: "none", prop: "none", move: "bob", akimbo: false };
const own: Record<string, number> = partingOptions(scale);
// Where the parting has stepped each figure from its seat, [dx, dy, dz, stillness] each.
const offset: Float32Array = crowd.each.offset;

// Walks the visitor `frames` frames from `[x, z]` along `[wx, wz]`, a unit vector, at 12 m/s: 0.2 m a frame of 1/60 s, held as main.js
// holds the walker (the crowd's hold before the step, its part after it), their bear's head 0.8 m ahead of its feet (avatar.js). After
// each frame, `each(i)` for each figure. Through the first crowd, or through `among`.
function walk([x, z]: number[], [wx, wz]: number[], frames: number, each: (i: number) => void, among: typeof crowd = crowd) {
  const walker = { x, z, heading: Math.atan2(-wx, -wz) };
  const visitor = () => {
    const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading);
    return { feet: { x: walker.x, z: walker.z }, head: { x: walker.x + 0.8 * fx, z: walker.z + 0.8 * fz } };
  };
  among.part(0, visitor().feet, visitor().head, false);
  for (let f = 0; f < frames; f++) {
    walker.x -= Math.sin(walker.heading) * 0.2;
    walker.z -= Math.cos(walker.heading) * 0.2;
    among.hold(walker);
    const v = visitor();
    among.part(1 / 60, v.feet, v.head, false);
    for (let i = 0; i < among.count; i++) each(i);
  }
}

// ---------- the shader, run here ----------

// The crowd's vertex shader is written with plain numbers alone, so its own text runs here as JavaScript once `float` and `bool` read
// `let`: what the tests below measure is what the shader does, and no copy of it. `dance` is what it adds after begin_vertex, which
// moves a vertex, and `tones` what it adds after color_vertex, which colours one.
type Vec = { x: number; y: number; z: number; w: number };
type Xyz = { x: number; y: number; z: number };
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
const READS = ["transformed", "vColor", "aMark", "aFig", "aPart", "aRise", "aBody", "aWear", "aCut", "aTone", "uBeat", "uDance", "uRise", "uSit", "aPlace", "aSize", "vDress", "vSecond"];
// The GLSL functions are handed over once, as the made function's own names, and never with each of its millions of calls. What the
// tones hand the fragment shader of a top's pattern (vDress.w, vSecond) is written to objects of their own where a call passes none.
const asJs = (glsl: string) =>
  new Function(...Object.keys(GLSL), `return function (${READS.map((name) => (name.startsWith("v") && name !== "vColor" ? `${name} = {}` : name)).join(", ")}) {${glsl.replace(/\b(?:float|bool)\s+/g, "let ")}\n};`)(...Object.values(GLSL)) as (...reads: unknown[]) => void;
const runDance = asJs(dance), runTones = asJs(tones);
// The fragment shader is three's own with the crowd's lines added (crowd.js): its uniforms and varyings after common, a top's pattern
// after color_fragment, three's lights but for the point lights, the sky's light without the music's share after lights_fragment_end,
// and before opaque_fragment its own lights and the rim. The line that weighs the rim is plain numbers, and runs here too, given the
// three dot products the line before it takes.
const STOCK = THREE.ShaderLib.lambert.fragmentShader as string;
const declared = compiled.fragmentShader.split("#include <common>\n")[1].split("\n#include <")[0];
const dressLines = compiled.fragmentShader.split("#include <color_fragment>")[1].split("\n\t#include <")[0];
const ownLights = compiled.fragmentShader.split("#include <envmap_fragment>")[1].split("#include <opaque_fragment>")[0];
const rimLines = ownLights.slice(ownLights.indexOf("vec3 toEye"));
const lampLines = ownLights.slice(0, ownLights.indexOf("vec3 toEye"));
const rimWeight = rimLines.split("\n").find((line) => line.startsWith("float rimLit")) ?? "";
const runRim = new Function(...Object.keys(GLSL), "pow", `return function (uRim, facing, stageward, behind) {${rimWeight.replace(/\bfloat\s+/g, "let ")}\nreturn rimLit;\n};`)(
  ...Object.values(GLSL), Math.pow) as (uRim: number, facing: number, stageward: number, behind: number) => number;
// So is the line that weighs the crowd's own lights, given how squarely the face turns to the stage and up, and how far the stage is
// in LAMP_HALFs.
const lampWeight = lampLines.split("\n").find((line) => line.startsWith("float lampLit")) ?? "";
const runLamp = new Function(...Object.keys(GLSL), `return function (uLit, uHouse, lampFacing, lampFar, houseUp) {${lampWeight.replace(/\bfloat\s+/g, "let ")}\nreturn [lampLit, houseLit];\n};`)(
  ...Object.values(GLSL)) as (uLit: number, uHouse: number, lampFacing: number, lampFar: number, houseUp: number) => [number, number];
// And the line that adds them to the light the face sends out, a channel at a time (0 red, 1 green, 2 blue): given the face's
// colour in that channel and the two weights, what it adds there.
const lampSum = lampLines.split("\n").find((line) => line.startsWith("outgoingLight += diffuseColor.rgb")) ?? "";
const lampAdds = [0, 1, 2].map((j) => new Function(`return function (colour, lampLit, houseLit) { return ${lampSum.replace(/^outgoingLight \+= /, "").replace(/;\s*$/, "")
  .replace("diffuseColor.rgb", "colour").replace(/vec3\(([^)]*)\)/g, (_: string, args: string) => args.split(",")[j].trim())}; };`)()) as ((colour: number, lampLit: number, houseLit: number) => number)[];
// The stage light, where stage.js hangs it, as bright and as far as it reaches: the crowd's own light from the stage comes from there.
const hung = buildStage(new THREE.Scene(), null, false, new THREE.MeshBasicMaterial(), { uC0: { value: null }, uC1: { value: null } }, FIXED).light;
const hungAt: number[] = hung.getWorldPosition(new THREE.Vector3()).toArray();
// And so is a top's pattern, but for its first line, which takes where on the figure the face lies and how far a pixel spans there
// along each way (the shader's one derivative), and its last, which mixes the top's two colours: given those, the pattern and the
// seed (vDress.w, vSecond.w), it runs to how much of the second colour the face shows, and how fine its bands are there.
const dressRun = dressLines.split("\n").filter((line) => !line.trim().startsWith("vec3 ")).join("\n")
  .replace(/diffuseColor\.rgb = mix\(vColor\.rgb, vSecond\.rgb, (.*)\);/, "return [$1, fine];");
const runDress = new Function(...Object.keys(GLSL), `return function (vDress, vSecond, at, pixel) {${dressRun.replace(/\bfloat\s+/g, "let ")}\n};`)(
  ...Object.values(GLSL)) as (vDress: { w: number }, vSecond: { w: number }, at: Xyz, pixel: Xyz) => [number, number] | undefined;
// The rim a face takes, its normal `n`, with the eye and the stage each a unit way `toEye` and `toStage` from it, as the shader weighs
// it in the view's space: the three dot products are the same in any frame.
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rimOf = (n: number[], toEye: number[], toStage: number[], uRim = RIM) => runRim(uRim, dot3(n, toEye), dot3(n, toStage), -dot3(toEye, toStage));

// A vertex of the figure, with its marks; a figure, with the numbers its corners carry and its scale across and up, in metres a
// unit, and the ground's rise across it (aPlace.w, flat where it is not given); and a pose: the phase in beats, how far the crowd dances, the build-up and the sit as main.js gives them, how still the
// parting holds the figure (aPart.w) and how far it lets its arms rise (aRise).
type Vertex = { x: number; y: number; z: number; mark: Vec };
type Figure = { i: number; across: number; up: number; fig: Vec; body: Vec; wear: Vec; cut: Vec; tone: Vec; top: Rgb; place?: Vec; size?: Vec; forms?: Record<number, number> };
type Pose = { beat: number; dance: number; rise?: number; sit?: number; still?: number; rising?: number };
const vec = (attribute: { getX(i: number): number; getY(i: number): number; getZ(i: number): number; getW(i: number): number }, i: number): Vec =>
  ({ x: attribute.getX(i), y: attribute.getY(i), z: attribute.getZ(i), w: attribute.getW(i) });
// The geometry's vertices, each once, however many triangles share it.
function verticesOf(geo: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number; getW(i: number): number } }) {
  const position = geo.getAttribute("position"), mark = geo.getAttribute("aMark"), seen = new Map<string, Vertex>();
  for (let k = 0; k < position.count; k++) {
    const v = { x: position.getX(k), y: position.getY(k), z: position.getZ(k), mark: vec(mark, k) };
    seen.set([v.x, v.y, v.z, v.mark.x, v.mark.y, v.mark.w, formOfMark(v.mark.z)].join(), v);
  }
  return [...seen.values()];
}
// A figure's row of four in one of the crowd's own arrays (`each`), a figure to a row.
const row = (array: Float32Array, i: number): Vec => ({ x: array[4 * i], y: array[4 * i + 1], z: array[4 * i + 2], w: array[4 * i + 3] });
function figuresOf(c: typeof crowd): Figure[] {
  const e = c.each;
  return Array.from({ length: c.count }, (_, i) => {
    size.setFromMatrixScale(matrix.fromArray(e.matrix, 16 * i));
    return { i, across: size.x, up: size.y, fig: row(e.aFig, i), body: row(e.aBody, i), wear: row(e.aWear, i), cut: row(e.aCut, i), tone: row(e.aTone, i), place: row(e.aPlace, i), size: row(e.aSize, i),
      top: { r: e.dress[3 * i], g: e.dress[3 * i + 1], b: e.dress[3 * i + 2] }, forms: e.forms[i] };
  });
}
// A figure wears a vertex of its body, and of each part it wears in the form it wears it (FORMS).
const carries = (f: Figure, bit: number, form = 0) => Math.floor(f.wear.x / bit) % 2 === 1 && (f.forms?.[bit] ?? 0) === form;
const wears = (f: Figure, v: Vertex) => v.mark.y === 0 || carries(f, v.mark.y, formOfMark(v.mark.z));
// Where the shader puts a vertex of a figure in a pose, in the figure's own units. The pose's build-up and sit are the figure's own:
// the uniforms are set so that this figure has risen `rise` and sat `sit`, whatever its row and its turn.
const moved = { x: 0, y: 0, z: 0 }, part: Vec = { x: 0, y: 0, z: 0, w: 0 }, flat: Vec = { x: 0, y: 0, z: 0, w: 0 };
function put(f: Figure, v: Vertex, pose: Pose) {
  moved.x = v.x; moved.y = v.y; moved.z = v.z;
  part.w = pose.still ?? 0;
  const rise = pose.rise ?? 0, sit = pose.sit ?? 0;
  runDance(moved, null, v.mark, f.fig, part, pose.rising ?? 1, f.body, f.wear, f.cut, f.tone, pose.beat, pose.dance,
    rise > 0 ? 0.3 + 0.6 * f.fig.z + 0.1 * rise : 0, sit > 0 ? (sit + 0.5 * f.fig.y) / 1.5 : 0, f.place ?? flat, f.size ?? flat);
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

// How far each figure of a crowd stands apart from what is seen past it, the land or the sky (the separation test below says how):
// for each of `views` and each of `hours`, the least by which any figure does, and where. The crowd's light (crowd.js STAGE_LIGHT,
// RIM_LIGHT, and three's Lambert but for the point lights), on each face of a figure standing at rest: its colour times the sky's
// light (the hemisphere's sky and ground colours by the hour, mixed by how far the face turns up) and the key light's, over pi; and
// its own lights as the night gives them, the stage's (LAMP_TO) by how squarely the face turns to it and how far it is, and the house
// lights by how far the face turns up; and the rim, as the shader's own line weighs it. A patterned top is taken at its colour on the
// whole (COVER). What is seen past the figure is the land where the line from the eye through the figure's middle meets it beyond,
// or the sky's horizon where it meets none: the land in its colour (island.js landColour) and as the crowd may have worn it (WEAR of
// the way to WORN), each lit as the island is, by the sky's light, the key light, the stage's glow (POOL) and the stage light, which
// the music swings from 0.4 of its own to twice it (audio.js mappings). The sky's light leaves out the tint the panel's liquid light
// lends it, which falls on figure and land alike, and the shadows. Each figure is seen as a small depth-tested raster draws it, each
// corner it wears worked out once, its faces turned to the eye. A figure stands apart by the more of its lightest tenth over what is
// past it at its brightest, worn or not and the stage light at its highest, and of that at its darkest over its darkest tenth.
const SEEN_SHARE = 0.1, SEEN_N = 40;
// How near drawnOf draws each figure to the shader (its test): the share of figures' sides on which its verdict on the figure's fifths
// (ENDS) standing APART is not the shader's, how far its shares are off on the whole and on seated figures alone, and how far any one
// colour's share leans, more or less than the shader's, on the whole, standing and seated or seated alone.
const DRAWN_AGREE = { differ: 0.005, mean: 0.025, seated: 0.0225, lean: 0.02 };
// The hours each figure is seen at: the show's start, its first half, the deep of the night, the first light and daybreak.
const HOURS = [0, 0.25, 0.5, 0.75, DEEP, 1.25, 1.4, FIRST_LIGHT, 1.85, DAYBREAK], SEPARATE = 1.3, SEVENTIES = "1977-02-27";
// A show of each era of the crowd's clothes (DRESS): the eighties' fixed day, the sixties', the nineties' and the seventies'; and the
// seeds of the days' gatherings the test of other days stands each in.
const ERA_SHOWS = ["1986-07-04", "1970-08-30", "1990-12-09", SEVENTIES], SEEDED = [2, 10, 12, 15, 21, 27, 31, 387, 879, 510, 895, 606, 392, 661, 104];
const unit3 = (a: number[]) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: number[], b: number[]) => a.map((q, j) => q - b[j]);
// Whether a point in a plane, [across, up], stands inside a loop of others there: a line from it crosses the loop an odd number of times.
const inLoop = ([u, w]: number[], loop: number[][]) =>
  loop.filter((q, j) => { const r = loop[(j + 1) % loop.length]; return q[1] > w !== r[1] > w && u < q[0] + ((w - q[1]) * (r[0] - q[0])) / (r[1] - q[1]); }).length % 2 === 1;
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), lin = (rgb: ArrayLike<number>) => [linear(rgb[0]), linear(rgb[1]), linear(rgb[2])];
const lumOf3 = (rgb: number[]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const [hillX, hillZ] = [TEST_POSES.crowd.x, TEST_POSES.crowd.z];
const EYES = { hill: [hillX, height(hillX, hillZ) + 3.2, hillZ], stage: [STAGE[0], SHELF_Y + FLOOR + 1.7, STAGE[1]] };
const lightAt = (look: ReturnType<typeof newLook>) => ({
  sky: lin(look.ambient), ground: lin(look.ground), key: lin(look.key), hemi: 1.1 * Math.PI * look.ambientGain, keyGain: 0.5 * Math.PI * look.keyGain, to: Array.from(look.keyTo) as number[],
  lit: LIT * look.dark, house: HOUSE * look.dark, rim: RIM * (RIM_LEAST + (1 - RIM_LEAST) * look.dark), pool: POOL.toArray().map((q: number) => q * look.shine), lift: look.stageLift,
  horizon: lumOf3(lin(look.horizon)),
});
type Light = ReturnType<typeof lightAt>;
// The luminance a face of colour `c` sends to `eye`, its unit normal `n`, at `at`.
const onFace = (L: Light, c: number[], n: number[], at: number[], eye: number[]) => {
  const up = 0.5 + 0.5 * n[1], key = Math.max(dot3(n, L.to), 0), toLamp = LAMP_TO.map((q: number, j: number) => q - at[j]);
  const [lamp, house] = runLamp(L.lit, L.house, dot3(n, unit3(toLamp)), Math.hypot(...toLamp) / LAMP_HALF, n[1]);
  const rim = rimOf(n, unit3(eye.map((q, j) => q - at[j])), unit3(RIM_TO.map((q: number, j: number) => q - at[j])), L.rim);
  return lumOf3(c.map((q, j) => q * (((L.ground[j] + (L.sky[j] - L.ground[j]) * up) * L.hemi + L.key[j] * L.keyGain * key) / Math.PI) + lampAdds[j](q, lamp, house) + rim * RIM_TINT[j]));
};
// The luminance land of colour `g` at `at` sends out, its unit normal `n`, the stage light at `share` of its own.
const stageLight = [hung.color.r, hung.color.g, hung.color.b], poolFrom = [STAGE[0], SHELF_Y + POOL_UP, STAGE[1]];
const onLand = (L: Light, g: number[], n: number[], at: number[], share: number) => {
  const toPool = poolFrom.map((q, j) => q - at[j]), poolFar = Math.hypot(...toPool) / POOL_HALF;
  const pool = (Math.max(dot3(n, unit3(toPool)), 0) * (1 - THREE.MathUtils.smoothstep(poolFar, (0.6 * POOL_END) / POOL_HALF, POOL_END / POOL_HALF))) / (1 + poolFar * poolFar);
  const toStage = hungAt.map((q, j) => q - at[j]), d = Math.hypot(...toStage), falls = (d < hung.distance ? (1 - (d / hung.distance) ** 4) ** 2 : 0) / (d * d);
  const stageOn = hung.intensity * (share + L.lift) * falls * Math.max(dot3(n, unit3(toStage)), 0), up = 0.5 + 0.5 * n[1];
  return lumOf3(g.map((q, j) => q * (((L.ground[j] + (L.sky[j] - L.ground[j]) * up) * L.hemi + L.key[j] * L.keyGain * Math.max(dot3(n, L.to), 0) + stageLight[j] * stageOn) / Math.PI + L.pool[j] * pool)));
};
// What the eye sees past a figure, from `eye` through `through`: the land, fresh and worn, where the line first meets it, or none.
const past = (eye: number[], through: number[]) => {
  const way = unit3(through.map((q, j) => q - eye[j])), from = Math.hypot(...through.map((q, j) => q - eye[j])) + 1;
  for (let t = from; t < from + 400; t += 0.25) {
    const x = eye[0] + t * way[0], y = eye[1] + t * way[1], z = eye[2] + t * way[2];
    if (y > height(x, z)) continue;
    const e = 0.25, n = unit3([height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)]), land = landColour(x, height(x, z), z, n[1], new THREE.Color());
    const worn = land.clone().lerp(new THREE.Color(WORN), WEAR);
    return { at: [x, height(x, z), z], n, colours: [[land.r, land.g, land.b], [worn.r, worn.g, worn.b]] };
  }
  return null;
};
// The pieces of a crowd's figure geometry, each its corners once and its faces (pieces), by `${bit} ${form}`.
const kitOf = (c: typeof crowd) => new Map([[0, 0], ...Object.values(PART as Record<string, number>).flatMap((bit) => (FORMS[Object.keys(PART).find((k) => (PART as Record<string, number>)[k] === bit) as keyof typeof FORMS] ?? [0]).map((_, form) => [bit, form]))]
  .map(([bit, form]) => [`${bit} ${form}`, pieces(c.figure, bit, form)] as const).filter(([, piece]) => piece.index.length > 0));
type Seen = { by: number; i: number; view: string; hour: number; pixels: number; tenths: number[]; back: number[]; shares: number[] };
// Or, given `eyesOf`, from the eyes it gives each figure, by its middle, named `drawn 0` on; and with no hours, only its shares.
// Each figure is drawn `n` pixels across its widest, and without the parts `without` names; and only those `only` names, if it does.
function seenApart(c: typeof crowd, views: (keyof typeof EYES)[], hours: number[], eyesOf?: (f: Figure, middle: number[]) => number[][], { without = 0, n = SEEN_N, only = null as number[] | null } = {}) {
  const kit = kitOf(c), lights = hours.map((hour) => lightAt(lookAt(hour, newLook()))), least: Record<string, Seen> = {}, each: Seen[] = [];
  for (const f of figuresOf(c)) {
    if (only && !only.includes(f.i)) continue;
    const s = f.size!, p = f.place!, middle = [p.x, p.y + 0.5 * TALL * s.y, p.z];
    const toWorld = (q: Xyz) => { const cc = Math.cos(s.z), ss = Math.sin(s.z), wide = q.x * s.x, deep = q.z * s.x; return [cc * wide + ss * deep, s.y * q.y, -ss * wide + cc * deep]; };
    // Each face it wears, but what it holds up, a flag's or a banner's dyed cloth, which is no part of the figure: its corners where
    // the figure stands them at rest, its normal and its colour.
    const faces: { at: number[][]; n: number[]; colour: number[]; whose: number }[] = [], cut = Math.floor(f.wear.y / 64) % 256;
    for (const [key, piece] of kit) {
      const [bit, form] = key.split(" ").map(Number);
      if (bit !== 0 && (!carries(f, bit, form) || (bit & without) !== 0)) continue;
      const at: number[][] = [];
      for (let k = 0; k < piece.position.length / 3; k++) {
        const mark = { x: piece.mark[4 * k], y: piece.mark[4 * k + 1], z: piece.mark[4 * k + 2], w: piece.mark[4 * k + 3] };
        at.push(toWorld({ ...put(f, { x: piece.position[3 * k], y: piece.position[3 * k + 1], z: piece.position[3 * k + 2], mark }, { beat: 0, dance: 0 }) }));
      }
      const tones = new Map<string, number[]>();
      for (let t = 0; t < piece.index.length; t += 3) {
        const k0 = piece.index[t], mark = { x: piece.mark[4 * k0], y: piece.mark[4 * k0 + 1], z: piece.mark[4 * k0 + 2], w: piece.mark[4 * k0 + 3] };
        if (mark.z % TINTS >= TINT.CLOTH) continue;
        const tri = [0, 1, 2].map((j) => at[piece.index[t + j]]);
        const n = cross3(tri[1].map((q, j) => q - tri[0][j]), tri[2].map((q, j) => q - tri[0][j])), length = Math.hypot(...n);
        if (length < 1e-12) continue;
        const toned = `${mark.x} ${mark.z}`;
        if (!tones.has(toned)) {
          const colour = { r: f.top.r, g: f.top.g, b: f.top.b }, dress: Vec = { x: 0, y: 0, z: 0, w: 0 }, second: Vec = { x: 0, y: 0, z: 0, w: 0 };
          runTones(null, colour, mark, f.fig, null, 1, f.body, f.wear, f.cut, f.tone, 0, 0, 0, 0, f.place, f.size, dress, second);
          const cover = dress.w < 0.5 ? 0 : COVER[dress.w as keyof typeof COVER];
          tones.set(toned, [colour.r + (second.x - colour.r) * cover, colour.g + (second.y - colour.g) * cover, colour.b + (second.z - colour.b) * cover]);
        }
        faces.push({ at: tri, n: n.map((q) => q / length), colour: tones.get(toned)!, whose: sourceOf(mark.z % TINTS, cut) });
      }
    }
    const eyes: [string, number[]][] = eyesOf ? eyesOf(f, middle).map((eye, k) => [`drawn ${k}`, eye]) : views.map((view) => [view, EYES[view]]);
    for (const [view, eye] of eyes) {
      const toEye = unit3(eye.map((q, j) => q - middle[j]));
      const ahead = toEye.map((q) => -q), across = unit3(cross3(ahead, [0, 1, 0])), over = cross3(across, ahead);
      const facing = faces.filter((t) => dot3(t.n, toEye) > 0).map((t) => ({ ...t, on: t.at.map((q) => [dot3(q, across), dot3(q, over), dot3(q, ahead)]) }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of facing) for (const q of t.on) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      const px = n / (Math.max(x1 - x0, y1 - y0) * 1.02), N = n;
      const depth = new Float64Array(N * N).fill(Infinity), which = new Int32Array(N * N).fill(-1);
      facing.forEach((t, m) => {
        const on = t.on.map((q) => [(q[0] - x0) * px, (q[1] - y0) * px, q[2]]);
        const area = (a: number[], b: number[], c2: number[]) => (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]), whole = area(on[0], on[1], on[2]);
        if (Math.abs(whole) < 1e-12) return;
        const bx0 = Math.max(0, Math.floor(Math.min(on[0][0], on[1][0], on[2][0]))), bx1 = Math.min(N - 1, Math.ceil(Math.max(on[0][0], on[1][0], on[2][0])));
        const by0 = Math.max(0, Math.floor(Math.min(on[0][1], on[1][1], on[2][1]))), by1 = Math.min(N - 1, Math.ceil(Math.max(on[0][1], on[1][1], on[2][1])));
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const at2 = [x + 0.5, y + 0.5], b = [area(on[1], on[2], at2) / whole, area(on[2], on[0], at2) / whole, area(on[0], on[1], at2) / whole];
          if (b[0] < 0 || b[1] < 0 || b[2] < 0) continue;
          const d = b[0] * on[0][2] + b[1] * on[1][2] + b[2] * on[2][2];
          if (d < depth[y * N + x]) { depth[y * N + x] = d; which[y * N + x] = m; }
        }
      });
      const seen = [...which].filter((m) => m >= 0), shown = [...new Set(seen)], behind = hours.length ? past(eye, middle) : null, shares = SOURCES.map(() => 0);
      for (const m of seen) shares[facing[m].whose] += 1 / seen.length;
      let worst: Seen | null = null;
      lights.forEach((L, h) => {
        const lumOf = new Map(shown.map((m) => [m, onFace(L, facing[m].colour, facing[m].n, middle, eye)]));
        const lums = seen.map((m) => lumOf.get(m)!).sort((a, b) => a - b);
        const darkest = lums[Math.floor(SEEN_SHARE * lums.length)], lightest = lums[Math.floor((1 - SEEN_SHARE) * lums.length)];
        const back = behind ? behind.colours.flatMap((g) => [0.4, 2].map((share) => onLand(L, g, behind.n, behind.at, share))) : [L.horizon];
        const by = Math.max(lightest / Math.max(...back), Math.min(...back) / darkest), key = `${view} ${hours[h]}`;
        const one = { by, i: f.i, view, hour: hours[h], pixels: seen.length, tenths: [darkest, lightest], back: [Math.min(...back), Math.max(...back)], shares };
        if (!least[key] || by < least[key].by) least[key] = one;
        if (!worst || by < worst.by) worst = one;
      });
      each.push(worst ?? { by: Infinity, i: f.i, view, hour: NaN, pixels: seen.length, tenths: [], back: [], shares });
    }
  }
  return { least, each };
}
// The numbers drawnOf takes of a figure, as the figure carries them: what it wears, in which forms, how it is cut (its style's
// CUT, aWear.y), its shape and its body (aCut, aBody), seated, the way it sits (its style's stance), and the stage's bearing round
// it, from where it stands and its turn (aPlace, aSize.z).
const figureNumbers = (f: Figure) => ({ parts: f.wear.x, forms: f.forms ?? {}, cut: Math.floor(f.wear.y / 64) % 256, shape: [f.cut.x, f.cut.y, f.cut.z, f.cut.w],
  body: [f.body.x, f.body.y, f.body.z, f.body.w], seat: f.fig.x > 0.5 ? SITS[Math.floor(Math.floor(f.wear.y / 16384) / 16)] : null,
  stage: stageTurn(f.place!.x, f.place!.z, f.size!.z) });
// The view drawnOf takes of figure `f` from `eye` (DRAWN_VIEWS): the turn round it from the stage's bearing, and how far down it looks,
// to its middle, as seenApart looks at it.
const viewFrom = (f: Figure, eye: number[]) => {
  const p = f.place!, middle = [p.x, p.y + 0.5 * TALL * f.size!.y, p.z], dx = eye[0] - middle[0], dz = eye[2] - middle[2], c = Math.cos(f.size!.z), s = Math.sin(f.size!.z);
  return [Math.atan2(c * dx - s * dz, s * dx + c * dz) - stageTurn(p.x, p.z, f.size!.z), Math.atan2(eye[1] - middle[1], Math.hypot(dx, dz))];
};
// Dresses figure `i` of crowd `c` in `to` of palette `d` where it wore `from`, as buildCrowd sets its top's colours and tones: its top
// and its pattern's seed, its legs' tone, and its things' with the dye it holds up kept.
function redress(c: typeof crowd, i: number, d: Palette, from: Chosen, to: Chosen) {
  const [shirt, pattern, second] = d.top[to.top];
  c.each.dress.set([tone(shirt), second === undefined ? 0 : tone(second), pattern + PATTERNS * seedOf(i)], 3 * i);
  c.each.aTone[4 * i] = tone(d.legs[to.legs]);
  c.each.aTone[4 * i + 3] += tone(d.thing[to.thing]) - tone(d.thing[from.thing]);
}
// The rule dressFor keeps, written out here on its own, for a figure dealt `colour` that the eye sees as `drawn` shows it (drawnOf's
// shares from each of DRAWN_VIEWS), on palette `d`; `worn` the tops those close by wear in the same top, `taken` the colours those
// dressed before it wear whole (each top * 100 + legs * 10 + thing) and `pick` its own draw (dressPick). Every choice is the colours
// it was dealt with none, one or two of those that show (its legs, its things and its top) moved, each to another of its era's. How
// far a choice is from what was dealt (AWAY): a step for its legs and one for its things moved, and for its top a step and a half in
// its own pattern, two and a half in another pattern, three and a half from plain to patterned or back, and four more in a colour
// one close by wears in that top. At the quarter (ENDS), the colours it was dealt where those stand apart from every side; else,
// of those that do, nearest first and in the order the rule lists them (as dealt, each giver alone, each two, each the nearest on
// from its own first), the first that no one before it wears whole of those no more than a step further than the nearest, or else
// the nearest. Below it, at the fifth and then the tenth, of all that stand apart from every side, those that bring the end above
// apart from as many sides as the best does and stand as far apart at their own end, from the side they do least from, as MARGIN
// of the best: of those the colours it was dealt where they are among them; else the nearest of those no more than a step further
// than the nearest that no one before it wears whole, or the nearest where there are none, and of those the one its draw picks.
// Returns the choice and the end it stands apart at, or none where no colours of its era bring its tenth apart.
type Rule = { chosen: Chosen; ends: number; kind: string } | undefined;
function ruleFor(d: Palette, colour: Record<string, number>, drawn: number[][], worn: Set<number>, taken: Set<number>, pick: number): Rule {
  const dealt: Chosen = { top: colour.top, legs: colour.legs, thing: colour.thing };
  const lightsOf = (one: Chosen) => [topLight(d.top[one.top]), lightOf(d.legs[one.legs]), lightOf(HAIRS[colour.hair]), lightOf(SKIN[colour.self]), lightOf(d.thing[one.thing]), 0.02];
  const everySide = (one: Chosen, ends: number) => drawn.every((shares) => apartOf(shares, lightsOf(one), ends) >= APART);
  const givers = GIVES.filter((name) => drawn.some((shares) => shares[SOURCES.indexOf(name)] > 0));
  const others = (name: (typeof GIVES)[number]) => d[name].map((_, step) => (dealt[name] + step) % d[name].length).slice(1);
  const listed: Chosen[] = [dealt, ...givers.flatMap((name) => others(name).map((k) => ({ ...dealt, [name]: k }))),
    ...givers.flatMap((a, j) => givers.slice(j + 1).flatMap((b) => others(a).flatMap((k) => others(b).map((q) => ({ ...dealt, [a]: k, [b]: q })))))];
  const pattern = (k: number) => d.top[k][1] as number, own = pattern(dealt.top);
  const away = (one: Chosen) => (one.legs !== dealt.legs ? 1 : 0) + (one.thing !== dealt.thing ? 1 : 0)
    + (one.top === dealt.top ? 0 : (pattern(one.top) === own ? 1.5 : pattern(one.top) !== PATTERN.PLAIN && own !== PATTERN.PLAIN ? 2.5 : 3.5) + (worn.has(one.top) ? 4 : 0));
  const order = listed.map((one, seq) => ({ one, seq, far: away(one) })).sort((p, q) => p.far - q.far || p.seq - q.seq).map(({ one }) => one);
  const whole = (one: Chosen) => one.top * 100 + one.legs * 10 + one.thing;
  const nearestOf = (list: Chosen[]) => list.filter((one) => away(one) === away(list[0]));
  const moved = (one: Chosen) => GIVES.filter((name) => one[name] !== dealt[name]).length;
  const quarter = order.filter((one) => everySide(one, ENDS[0])), free = (one: Chosen) => !taken.has(whole(one));
  if (quarter.length) {
    const chosen = quarter[0] === dealt ? dealt : quarter.filter((one) => away(one) <= away(quarter[0]) + 1).find(free) ?? quarter[0];
    return { chosen, ends: ENDS[0], kind: ["dealt", "one", "two"][moved(chosen)] };
  }
  for (let k = 1; k < ENDS.length; k++) {
    const passing = order.filter((one) => everySide(one, ENDS[k])).map((one) => {
      const lights = lightsOf(one);
      return { one, sides: drawn.filter((shares) => apartOf(shares, lights, ENDS[k - 1]) >= APART).length, least: Math.min(...drawn.map((shares) => apartOf(shares, lights, ENDS[k]))) };
    });
    if (!passing.length) continue;
    const sides = Math.max(...passing.map((p) => p.sides)), least = Math.max(...passing.filter((p) => p.sides === sides).map((p) => p.least));
    const near = passing.filter((p) => p.sides >= sides && p.least >= MARGIN * least).map(({ one }) => one);
    const open = near.filter((one) => away(one) <= away(near[0]) + 1 && free(one)), from = near[0] === dealt ? [dealt] : nearestOf(open.length ? open : near);
    return { chosen: from[Math.min(from.length - 1, Math.floor(pick * from.length))], ends: ENDS[k], kind: "near" };
  }
  return undefined;
}
// What a figure of a crowd went by when it was dressed: the tops those within CLOSE m of it in the same top wore by then, those
// dressed before it as they were dressed and those after as they were dealt (`worn`), and the colours those before it wore whole.
function dressedBy(c: typeof crowd, who: Person[], i: number) {
  const placed = placedOf.get(c)!, p = placed[i], mine = who[i] as { top: string };
  const worn = new Set(placed.flatMap((q, j) => (j !== i && (who[j] as { top: string }).top === mine.top && Math.hypot(q.x - p.x, q.z - p.z) < CLOSE
    ? [j < i ? (c.each.colours[j] as Chosen).top : (who[j] as { colour: Record<string, number> }).colour.top] : [])));
  const taken = new Set(Array.from({ length: i }, (_, j) => { const one = c.each.colours[j] as Chosen; return one.top * 100 + one.legs * 10 + one.thing; }));
  return { worn, taken };
}
// Each figure of crowd `c` of a show on `date` wears the colours dressFor chose (each.colours), as the shader colours them, and those
// are the colours the rule (ruleFor) gives it, from what drawnOf draws of it from every side (DRAWN_VIEWS), from its tier's own
// figure and its own numbers, in the tones the shader gives the tints that show them (a patterned top's on the whole, topLight).
// Counts in `counted` how many wear their colours as dealt, how many moved one and how many two at the quarter, how many the nearest
// within MARGIN of the best at the fifth and the tenth, and how many no colours of its era bring apart from every side at any:
// `short` where in the colours it wears it stands apart from every side under STEEP, and `short under` where not; and returns each
// figure's, by its index.
type Chosen = { top: number; legs: number; thing: number };
type Palette = { top: number[][]; legs: number[]; thing: number[] };
const GIVES = ["legs", "thing", "top"] as const;
// The views of DRAWN_VIEWS that look down on a figure more steeply than the hill does, at most 0.62 rad (drawnOf): from there one in a
// hat and a poncho, which are one colour, shows little else, so that no colours of its era bring it apart from every side.
const STEEP = 0.8;
const underSteep = (k: number) => (DRAWN_VIEWS[k] as number[])[1] < STEEP;
function dressedApart(c: typeof crowd, date: string, counted: Record<string, number>) {
  const kit = kitOf(c), who = peopleOf(c), d = dressOn(date) as Palette, out: Rgb = { r: 0, g: 0, b: 0 }, kinds: string[] = [];
  const whose: Record<string, number> = { legs: TINT.LEGS, hair: TINT.HAIR, self: TINT.SELF, thing: TINT.THING };
  for (const f of figuresOf(c)) {
    const p = who[f.i] as { colour: Record<string, number> }, chosen = c.each.colours[f.i] as Chosen, drawn = drawnOf(kit, figureNumbers(f)) as number[][];
    const shader = (name: string) => {
      out.r = f.top.r; out.g = f.top.g; out.b = f.top.b;
      runTones(null, out, { x: 0, y: 0, z: whose[name], w: 0 }, f.fig, null, 1, f.body, f.wear, f.cut, f.tone, 0, 0, 0, 0, f.place, f.size);
      return light(out);
    };
    // Each colour as the shader shows it on the figure: its legs' and its things' are those the palette holds.
    const shown = [topLight(d.top[chosen.top]), shader("legs"), shader("hair"), shader("self"), shader("thing"), 0.02];
    expect([date, f.i, shown[1], shown[4]].map((q) => (typeof q === "number" ? +q.toFixed(6) : q))).toEqual([date, f.i, +lightOf(d.legs[chosen.legs]).toFixed(6), +lightOf(d.thing[chosen.thing]).toFixed(6)]);
    const { worn, taken } = dressedBy(c, who, f.i), rule = ruleFor(d, p.colour, drawn, worn, taken, dressPick(f.i));
    const under = () => drawn.every((shares, k) => !underSteep(k) || apartOf(shares, shown, ENDS[ENDS.length - 1]) >= APART * (1 - 1e-9));
    const kind = rule ? `${rule.kind} ${rule.ends}` : under() ? "short" : "short under";
    counted[kind] = (counted[kind] ?? 0) + 1;
    kinds[f.i] = kind;
    if (!rule) continue;
    expect([date, f.i, kind, chosen, drawn.every((shares) => apartOf(shares, shown, rule.ends) >= APART * (1 - 1e-9))]).toEqual([date, f.i, kind, rule.chosen, true]);
  }
  return kinds;
}

describe("the crowd, as buildCrowd builds it", () => {
  it("parts its figures with the options for the standard figure's size, PERSON tall, and stands none taller than the largest those allow", () => {
    expect(kept.options.length).toBeGreaterThan(0);
    const options = kept.options[0];
    expect(Object.keys(options).sort()).toEqual([...Object.keys(own), "keeps", "ground", "tops"].sort());
    // The ground they stand on as they part is the one the crowd's figures stand on: the island's own height, unless main.js hands
    // buildCrowd the tier's (island.js surfaceOf).
    expect(options.ground).toBe(height);
    // Each figure's own top, which the camera keeps clear of over it, is its reach over its feet (each.top) and how far its feet
    // stand over the ground there, and none is higher than `top`.
    const tops = options.tops as number[];
    expect(tops.length).toBe(crowd.count);
    for (let i = 0; i < crowd.count; i++) expect(Math.abs(tops[i] - (crowd.each.aPlace[4 * i + 1] - height(crowd.each.aPlace[4 * i], crowd.each.aPlace[4 * i + 2]) + crowd.each.top[i]))).toBeLessThan(1e-4);
    expect(Math.max(...crowd.each.top)).toBeLessThanOrEqual(own.top);
    const off = Object.keys(own).filter((name) => !(Math.abs((options[name] as number) - own[name]) < 1e-5));
    expect(off.map((name) => `${name}: ${options[name]}, for ${own[name]}`)).toEqual([]);
    // A figure's head stands TALL over its feet and as much higher as its legs are longer; children stand a little over half PERSON.
    const heads = figures.map((f) => f.up * (TALL + LEG * (f.body.z - 1)));
    expect(Math.max(...heads)).toBeLessThanOrEqual(1.08 * PERSON + 1e-6);
    expect(Math.max(...heads)).toBeGreaterThan(1.05 * PERSON);
    expect(Math.min(...heads)).toBeGreaterThan(0.5 * PERSON);
    expect(Math.min(...heads)).toBeLessThan(0.7 * PERSON);
  });

  it("parts a tier's crowd on the ground that tier draws: a figure stepped off its seat stands where a phone's ground is, not the hill's own height", () => {
    // The parting lifts or lowers each figure it steps aside by its ground's rise from its seat (seats.js parting, `ground`). A
    // phone's ground lies the farthest off the hill's own height, up to half a metre (island.js surfaceOf, 52 cells a side): a phone's
    // crowd built on it, and the walk across the front rows the test below takes.
    const surface = surfaceOf(52), small = buildCrowd(new THREE.Scene(), { count: 150, path, line, landmarks, plain: true, surface });
    expect(kept.options[kept.options.length - 1].ground).toBe(surface);
    const placed = kept.placed[kept.placed.length - 1], step: Float32Array = small.each.offset;
    // Over the walk's frames, each figure off its seat, as the parting stepped it, against the ground under it and under its seat.
    let moved = 0, wrong = 0, apart = 0, most = 0;
    walk([STAGE[0] + 15 * ux - 20 * nx, STAGE[1] + 15 * uz - 20 * nz], [nx, nz], 200, (i) => {
      if (step[4 * i] === 0 && step[4 * i + 2] === 0) return;
      const { x, z } = placed[i], to = [x + step[4 * i], z + step[4 * i + 2]];
      const drawn = surface(to[0], to[1]) - surface(x, z), own = height(to[0], to[1]) - height(x, z);
      moved += 1;
      if (step[4 * i + 1] !== Math.fround(drawn)) wrong += 1;
      if (Math.abs(drawn - own) > 0.01) apart += 1;
      most = Math.max(most, Math.abs(drawn - own));
    }, small);
    // Each stands by just its ground's rise, as a 32-bit number holds it: 3,889 figures' frames. And that is no rise of the hill's own
    // height under it: by over a centimetre for 3,120 of them, by as much as 36 cm.
    expect(moved).toBeGreaterThan(2000);
    expect(wrong).toBe(0);
    expect(apart).toBeGreaterThan(moved / 2);
    expect(most).toBeGreaterThan(0.2);
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
    // So on every tier, a desktop's, a TV's and a phone's, its stances and its cup with the rest: a scene with the crowd in it and nothing
    // else draws one thing.
    for (const [count, plain] of [[Infinity, false], [250, true], [150, true]] as const) {
      const own = new THREE.Scene(), c = buildCrowd(own, { count, path, line, landmarks, plain });
      expect([own.children.length, own.children[0] === c.mesh, c.mesh.children.length, Array.isArray(c.mesh.material), c.mesh.geometry.groups.length]).toEqual([1, true, 0, false, 0]);
      expect(c.figure.getAttribute("aMark").array.some((_: number, k: number) => k % 4 === 1 && c.figure.getAttribute("aMark").array[k] === PART.CUP)).toBe(true);
    }
    expect(crowd.count).toBe(placedOf.get(crowd)!.length);
    expect(phone.count).toBe(wholeGroups(placedOf.get(crowd)!, 150));
    expect(phone.count).toBeGreaterThan(144);
    // A frame's cost goes with the triangles sent to be drawn, so the mesh holds no part that its figure does not wear: an instance
    // of the whole figure sent 1,117 triangles to show 513 of them. Figure by figure, on a desktop and on a phone: its corners are
    // those of its body and of each part it wears, each once, and every one of them carries the figure's own numbers; its faces are
    // those parts' faces, every one and no other, between its own corners; and what it wears is drawn before its body, so that a
    // renderer that tests depth first shades nothing of the body that its clothes cover.
    const key = (x: number, y: number, z: number, m: Vec) => [x, y, z, m.x, m.y, m.z, m.w].join();
    for (const [c, list] of [[crowd, figures], [phone, phones]] as const) {
      const geo = c.mesh.geometry, e = c.each, position = geo.getAttribute("position"), mark = geo.getAttribute("aMark"), index = geo.index;
      const own = c.figure.getAttribute("position"), marks = c.figure.getAttribute("aMark"), facesOf = new Map<string, string[]>();
      for (let t = 0; t < own.count; t += 3) {
        const face = [0, 1, 2].map((k) => key(own.getX(t + k), own.getY(t + k), own.getZ(t + k), vec(marks, t + k))).join("|"), piece = `${marks.getY(t)} ${formOfMark(marks.getZ(t))}`;
        facesOf.set(piece, [...(facesOf.get(piece) ?? []), face]);
      }
      const wornBy = (f: Figure) => [...facesOf.keys()].filter((piece) => { const [bit, form] = piece.split(" ").map(Number); return bit === 0 || carries(f, bit, form); });
      expect([c.corners.length, c.faces.length, c.corners[0], c.faces[0]]).toEqual([c.count + 1, c.count + 1, 0, 0]);
      expect([position.count, index.count]).toEqual([c.corners[c.count], c.faces[c.count]]);
      const wrong = { corners: 0, numbers: 0, faces: 0, outside: 0, order: 0 };
      const rows: [string, Float32Array, number][] = [["aFig", e.aFig, 4], ["aBody", e.aBody, 4], ["aWear", e.aWear, 4], ["aCut", e.aCut, 4], ["aTone", e.aTone, 4], ["aSize", e.aSize, 4],
        ["aPlace", e.aPlace, 4], ["color", e.dress, 3], ["aPart", e.offset, 4], ["aRise", e.rising, 1]];
      for (const f of list) {
        const from = c.corners[f.i], to = c.corners[f.i + 1], seen = new Set<string>();
        for (let k = from; k < to; k++) {
          seen.add(key(position.getX(k), position.getY(k), position.getZ(k), vec(mark, k)));
          for (const [name, array, size] of rows) for (let q = 0; q < size; q++) if (geo.getAttribute(name).array[size * k + q] !== array[size * f.i + q]) wrong.numbers += 1;
        }
        if (seen.size !== to - from) wrong.corners += 1;
        const worn = wornBy(f), drawn: string[] = [];
        let body = -1, last = -1;
        for (let t = c.faces[f.i]; t < c.faces[f.i + 1]; t += 3) {
          const ks = [0, 1, 2].map((q) => index.getX(t + q) as number);
          if (!ks.every((k) => k >= from && k < to)) wrong.outside += 1;
          drawn.push(ks.map((k) => key(position.getX(k), position.getY(k), position.getZ(k), vec(mark, k))).join("|"));
          if (mark.getY(ks[0]) === 0) { if (body < 0) body = t; } else last = t;
        }
        if (drawn.sort().join(" ") !== worn.flatMap((piece) => facesOf.get(piece)!).sort().join(" ")) wrong.faces += 1;
        if (body < 0 || last > body) wrong.order += 1;
      }
      expect(wrong).toEqual({ corners: 0, numbers: 0, faces: 0, outside: 0, order: 0 });
      // So the mesh is the triangles its figures wear, and far fewer corners than three to a triangle.
      const wornFaces = list.reduce((sum, f) => sum + wornBy(f).reduce((n, piece) => n + facesOf.get(piece)!.length, 0), 0);
      expect(index.count / 3).toBe(wornFaces);
      expect(position.count).toBeLessThan(0.8 * (index.count / 3));
    }
  });

  it("stands each corner where its figure's matrix would, turned, sized and set at its seat, and stepped where the parting has stepped the figure", () => {
    // The mesh is not instanced, so no matrix places a figure: each corner carries its figure's seat, its breadth and height and its
    // turn, and the shader's own two lines put it there. They are run here against the matrix buildCrowd made of the same numbers.
    const placing = compiled.vertexShader.slice(compiled.vertexShader.indexOf("float turnC ="), compiled.vertexShader.indexOf("vec4 mvPosition"));
    expect(placing.split(";").length).toBe(4);
    expect(compiled.vertexShader).toContain("vec4 mvPosition = modelViewMatrix * vec4(putX, putY, putZ, 1.0);");
    expect(compiled.vertexShader).not.toContain("#include <project_vertex>");
    const placer = new Function("cos", "sin", "transformed", "aSize", "aPlace", "aPart", `${placing.replace(/\bfloat\s+/g, "let ")}\nreturn [putX, putY, putZ];`) as (...reads: unknown[]) => number[];
    const place = (...reads: unknown[]) => placer(Math.cos, Math.sin, ...reads);
    const e = crowd.each, want = new THREE.Vector3();
    let off = 0, looked = 0;
    for (const f of figures.filter((_, k) => k % 4 === 0)) for (const v of rich.filter((_, k) => k % 7 === 0)) for (const stepped of [{ x: 0, y: 0, z: 0, w: 0 }, { x: 0.7, y: -0.1, z: -0.4, w: 1 }]) {
      const got = place(v, row(e.aSize, f.i), row(e.aPlace, f.i), stepped);
      want.set(v.x, v.y, v.z).applyMatrix4(matrix.fromArray(e.matrix, 16 * f.i));
      off = Math.max(off, Math.abs(got[0] - want.x - stepped.x), Math.abs(got[1] - want.y - stepped.y), Math.abs(got[2] - want.z - stepped.z));
      looked += 1;
    }
    expect(looked).toBeGreaterThan(10000);
    // To a hundredth of a millimetre: the numbers are single floats of places some tens of metres from the island's middle.
    expect(off).toBeLessThan(1e-5);
  });

  it("turns each figure the way its seat faces, and hands the island the ground its figures stand: their seats, the blankets they sit on and the aisle", () => {
    // A figure faces +z in its own units: its matrix turns that to (sin, cos) of its seat's `face`, to friends, a ring's middle or away;
    // and its turn (aSize.z) is the same. Two friends with their arms round each other face the same way side by side, square to
    // the line between them, which turns each a little off its seat's way (the friends test below).
    let friends = 0, most = 0;
    const look = (c: typeof crowd) => {
      const placed = c === crowd || c === phone ? placedOf.get(c)! : null;
      for (let i = 0; i < c.count; i++) {
        matrix.fromArray(c.each.matrix, 16 * i);
        const turn = Math.atan2(c.each.matrix[16 * i + 8], c.each.matrix[16 * i + 10]), seat = c.ground.seats[i] as Seat, off = Math.abs(Math.atan2(Math.sin(turn - seat.face), Math.cos(turn - seat.face)));
        const stand = (STANDS as string[])[Math.floor(c.each.aWear[4 * i + 1] / 16384) % 16];
        expect(Math.abs(Math.atan2(Math.sin(turn - c.each.aSize[4 * i + 2]), Math.cos(turn - c.each.aSize[4 * i + 2])))).toBeLessThan(1e-5);
        if (stand.startsWith("round") || stand.startsWith("waist")) { friends += 1; most = Math.max(most, off); }
        else expect(off).toBeLessThan(1e-5);
        if (placed) expect(seat).toBe(placed[i]);
      }
    };
    for (const c of [crowd, phone, ...SHOWS.map((s) => s.desktop)]) look(c);
    // The fixed day's own gathering on a desktop, and on a phone, which seats whole groups of the first 150: the blankets any of them
    // sits on and no other, and the day's aisle.
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
    // And the free-armed day's. 22 friends among them, 16 of them the free-armed day's, the furthest turned 0.31 rad: on any mix of
    // people, a pair at least.
    look(befriended());
    expect(friends).toBeGreaterThanOrEqual(2);
    expect(most).toBeLessThan(0.4);
  });

  it("draws whole groups of the gathering as it thins when asked for fewer figures, and is left out of a frame that has none of its figures in view", () => {
    // The seats come in the order the gathering thins, a group's together, so the quality ladder's half crowd (main.js) is the mesh's
    // first faces, up to the last of the last whole group in the half: never part of a group.
    const geo = crowd.mesh.geometry, placed = placedOf.get(crowd)!, half = Math.ceil(crowd.count / 2), whole = wholeGroups(placed, half) as number;
    expect([crowd.shown, geo.drawRange.start, geo.drawRange.count]).toEqual([crowd.count, 0, Infinity]);
    crowd.show(half);
    expect([crowd.shown, geo.drawRange.start, geo.drawRange.count]).toEqual([whole, 0, crowd.faces[whole]]);
    expect(whole).toBeGreaterThan(half - 6);
    expect(placed[whole].group).not.toBe(placed[whole - 1].group);
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
    // Only the figures that are drawn count, each where the parting has stepped it. Asked for one figure it draws none, since the
    // first group is a ring of more. With the first group alone drawn: a camera 8 m behind its first figure sees it, and turned round
    // sees nothing that is drawn, though the rest of the crowd stands there.
    const first = placed.findIndex((s) => s.group !== placed[0].group);
    crowd.show(1);
    expect(crowd.shown).toBe(0);
    crowd.show(first);
    expect(crowd.shown).toBe(first);
    const [x0, z0] = seats[0], y0 = height(x0, z0) + 1.2, near = [x0 + 8 * ux, y0, z0 + 8 * uz], away = [x0 + 60 * ux, y0, z0 + 60 * uz];
    expect([look(near, [x0, y0, z0]), look(near, away)]).toEqual([true, false]);
    // Stepped 40 m to the side, it is seen there and not at its seats.
    const stepped = [x0 + 40 * nx, y0, z0 + 40 * nz], was = offset.slice(0, 4 * first);
    for (let i = 0; i < first; i++) { offset[4 * i] += 40 * nx; offset[4 * i + 2] += 40 * nz; }
    expect([look(near, [x0, y0, z0]), look([stepped[0] + 8 * ux, y0, stepped[2] + 8 * uz], stepped)]).toEqual([false, true]);
    offset.set(was, 0);
    crowd.show(0);
    expect([crowd.shown, look(behind, [STAGE[0], 0, STAGE[1]])]).toEqual([0, false]);
    crowd.show(crowd.count + 50);
    expect([crowd.shown, geo.drawRange.count, look(near, away)]).toEqual([crowd.count, crowd.faces[crowd.count], true]);
    crowd.cull(camera);
  });

  it("needs 13 of the 16 vertex attribute slots a WebGL program is sure of, and holds 172 bytes to a corner", () => {
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
    // coordinates. Every corner repeats its figure's numbers, which is what one mesh of what is worn costs: 43 numbers, 172 bytes,
    // the last of them the ground's rise across the figure (aPlace.w), which its legs lean with.
    for (const c of [crowd, phone]) {
      const attributes = c.mesh.geometry.attributes as Record<string, { itemSize: number; array: Float32Array; isInstancedBufferAttribute?: boolean }>;
      expect(Object.keys(attributes).sort()).toEqual([...declared.map((d) => d.name), "position", "color"].sort());
      expect(Object.values(attributes).every((a) => a.array instanceof Float32Array && !a.isInstancedBufferAttribute)).toBe(true);
      expect(Object.values(attributes).reduce((sum, a) => sum + 4 * a.itemSize, 0)).toBe(172);
    }
    // A phone's 150 figures fit a two-byte index, which a desktop's 292 do not.
    expect([phone.mesh.geometry.index.array.constructor.name, crowd.mesh.geometry.index.array.constructor.name]).toEqual(["Uint16Array", "Uint32Array"]);
    expect(phone.mesh.geometry.getAttribute("position").count).toBeLessThanOrEqual(65535);
    expect(Object.keys(figureGeometry().attributes).sort()).toEqual(["aMark", "position"]);
  });

  it("is lit by the sky, the key light and its own steady lights, by no point light and never by a beam, and hides nothing: a solid Lambert material that three's own fragment shader draws, the crowd's lines added", () => {
    // The rig's beams never light a figure because the crowd draws after them and covers them (draw-order.test.ts). A crowd that
    // glowed, or let the beams show through it, or wrote no depth, would undo that from inside.
    const material = crowd.mesh.material;
    expect(material.isMeshLambertMaterial).toBe(true);
    expect([material.transparent, material.opacity, material.depthWrite, material.depthTest, material.blending]).toEqual([false, 1, true, true, THREE.NormalBlending]);
    expect([material.emissive.getHex(), material.map, material.emissiveMap, material.lightMap, material.envMap, material.alphaMap]).toEqual([0, null, null, null, null, null]);
    // A corner's colour is its figure's numbers for its top, which the shader turns into a colour on every face (below).
    expect([material.fog, material.flatShading, material.vertexColors, material.side]).toEqual([true, true, true, THREE.FrontSide]);
    // main.js sets the mesh's render order, after the rig's (main.test.ts); buildCrowd leaves it alone.
    expect(crowd.mesh.renderOrder).toBe(0);
    // The fragment shader is three's own but for the crowd's lines, each once: put back what each replaced and it is three's.
    const begin = THREE.ShaderChunk.lights_fragment_begin as string, points = "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )";
    expect(begin.split(points)).toHaveLength(2);
    const lines = begin.split("\n"), from = lines.findIndex((line) => line.trim() === points);
    let depth = 0, to = from;
    for (; to < lines.length; to++) { depth += lines[to].trim().startsWith("#if") ? 1 : lines[to].trim() === "#endif" ? -1 : 0; if (depth === 0) break; }
    const unlit = [...lines.slice(0, from), ...lines.slice(to + 1)].join("\n"), sky = "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= uSky;";
    for (const part of [declared, dressLines, unlit, sky, ownLights]) expect(compiled.fragmentShader.split(part)).toHaveLength(2);
    const gap = STOCK.split("#include <envmap_fragment>")[1].split("#include <opaque_fragment>")[0];
    expect(compiled.fragmentShader.replace(`#include <common>\n${declared}`, "#include <common>").replace(`#include <color_fragment>${dressLines}`, "#include <color_fragment>")
      .replace(unlit, "#include <lights_fragment_begin>").replace(sky, "#include <lights_fragment_end>").replace(ownLights, gap)).toBe(STOCK);
    // So no point light of the scene's lights a figure: not the stage light, which swings with the bass (audio.js mappings), nor the
    // flame. A three that wrote its point lights' loop otherwise would make the crowd refuse to build, not light it unseen.
    expect(begin).toContain("pointLights[");
    expect(compiled.fragmentShader).not.toContain("pointLights[");
    expect(compiled.fragmentShader).not.toContain("NUM_POINT_LIGHTS");
    // What the crowd's own lines read and write. Names a line declares are its own; the rest are read from outside.
    const ownNames = (lines: string) => new Set([...lines.matchAll(/\b(?:float|vec[234])\s+([^;]+);/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/).map((d) => d.trim().split(/\s|=/)[0])));
    const language = ["abs", "atan", "clamp", "dot", "else", "float", "floor", "fract", "fwidth", "if", "length", "mat3", "max", "mix", "normalize", "pow", "sin", "smoothstep", "sqrt", "vec2", "vec3", "vec4"];
    const reads = (lines: string) => { const own = ownNames(lines); return [...new Set([...lines.replace(/\.[xyzwrgb]+\b/g, "").matchAll(/(?<![.\w])[A-Za-z_]\w*/g)].map((m) => m[0]))].filter((name) => !own.has(name) && !language.includes(name)).sort(); };
    const writes = (lines: string) => { const own = ownNames(lines); return [...new Set([...lines.matchAll(/(?:^|[;{}]\s*|\)\s+)([A-Za-z_]\w*)(?:\.[xyzwrgb]+)?\s*[-+*/]?=(?!=)/gm)].map((m) => m[1]).filter((name) => !own.has(name)))].sort(); };
    // The rim reads of the crowd's uniforms only its own two: no beat, no dance, no rise and no sit; of three's, the face's normal, the
    // way to the eye and the view's matrix, and so no light of the scene's. The stage's light and the house lights read their own
    // three, and the face's colour. Each only adds to the light the face sends out.
    expect(reads(rimLines)).toEqual(["normal", "outgoingLight", "uRim", "uStage", "vViewPosition", "viewMatrix"]);
    expect(writes(rimLines)).toEqual(["outgoingLight"]);
    expect(rimLines).toContain("outgoingLight += rimLit * vec3(");
    expect(reads(lampLines)).toEqual(["diffuseColor", "normal", "outgoingLight", "uHouse", "uLamp", "uLit", "vViewPosition", "viewMatrix"]);
    // The stage's light falls on a face as squarely as the face turns to the stage, on none turned away, and half as strong LAMP_HALF
    // off; the house lights as far as the face turns up, HOUSE_LOW of them on a face turned down.
    expect(lampWeight).not.toBe("");
    // The way to the stage and up that the line is handed, in the view's space, as the shader takes them (its vectors keep these tests
    // from running that line).
    expect(lampLines).toContain("vec3 toLamp = (viewMatrix * vec4(uLamp, 1.0)).xyz + vViewPosition;");
    expect(lampLines).toContain(`float lampFacing = dot(normal, normalize(toLamp)), lampFar = length(toLamp) / ${LAMP_HALF.toFixed(4)}, houseUp = dot(normal, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)));`);
    const [full, house] = runLamp(LIT, HOUSE, 1, 0, 1);
    expect([full, house]).toEqual([LIT, HOUSE]);
    expect(runLamp(LIT, HOUSE, -0.3, 0, -1)[0]).toBe(0);
    expect(runLamp(LIT, HOUSE, -0.3, 0, -1)[1]).toBeCloseTo(HOUSE * HOUSE_LOW, 12);
    expect(runLamp(LIT, HOUSE, 0.5, 1, 0)[0]).toBeCloseTo(0.25 * LIT, 12);
    expect(runLamp(LIT, HOUSE, 0.5, 1, 0)[1]).toBeCloseTo(HOUSE * (HOUSE_LOW + 0.5 * (1 - HOUSE_LOW)), 12);
    expect(writes(lampLines)).toEqual(["outgoingLight"]);
    expect(lampLines).toContain("outgoingLight += diffuseColor.rgb * (");
    // The line that adds them, run a channel at a time: a face takes the stage's light in LAMP_TINT and the house lights in
    // HOUSE_TINT, each as strong as its weight, and as much of each as its colour sends back. The tests below light figures by it.
    expect(lampSum).not.toBe("");
    for (const [colour, lampLit, houseLit] of [[1, 1, 0], [1, 0, 1], [0.5, 0.3, 0.05], [0.2, 0, 0], [0, 0.4, 0.07], [0.8, LIT, HOUSE]]) for (const j of [0, 1, 2]) {
      expect([colour, lampLit, houseLit, j, lampAdds[j](colour, lampLit, houseLit)]).toEqual([colour, lampLit, houseLit, j, expect.closeTo(colour * (lampLit * LAMP_TINT[j] + houseLit * HOUSE_TINT[j]), 12)]);
    }
    // And the stage's light comes from where stage.js hangs the stage light.
    for (let j = 0; j < 3; j++) expect(LAMP_TO[j]).toBeCloseTo(hungAt[j], 9);
    // A top's pattern reads what the vertex shader handed it and writes the face's colour, and nothing else: it lights nothing.
    expect(reads(dressLines)).toEqual(["diffuseColor", "vColor", "vDress", "vSecond"]);
    expect(writes(dressLines)).toEqual(["diffuseColor"]);
    // What the crowd adds to the vertex shader writes a vertex's place, its colour and what the fragment shader draws a pattern from,
    // and nothing else.
    const after = compiled.vertexShader.split("#include <fog_vertex>")[1].split("}")[0];
    expect(after.trim()).toBe("vDress.xyz = position;");
    const written = [...`${dance}\n${tones}`.matchAll(/(?:^|[;{}]\s*|\)\s+)([A-Za-z_]\w*)(?:\.[xyzwrgb]+)?\s*[-+*/]?=(?!=)/gm)].map((m) => m[1]);
    const names = new Set([...`${dance}\n${tones}`.matchAll(/\b(?:float|bool)\s+([^;]+);/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/).map((d) => d.trim().split(/\s|=/)[0])));
    expect([...new Set(written.filter((name) => !names.has(name)))].sort()).toEqual(["transformed", "vColor", "vDress", "vSecond"]);
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
    // The nearest any of those four million posed corners comes to its figure's sphere is 0.31 m inside it: a seated figure's feet
    // follow the ground's fall ahead of its seat, which differs with the way the gathering faces it, and its legs lean with the ground
    // across it (aPlace.w), which took that from 0.20 m to under the 0.15 m this test held before (#203); and the sphere stands a
    // tenth of a unit further out (PAST) since its arms dance bent and a spinner's out level, which came within 0.08 m of it. How
    // steeply the ground leans across under a seat differs by day and by the tier's ground. So the bound is a tenth of a metre, under
    // all of those, and not one fitted to this day's.
    expect(least).toBeGreaterThan(0.1);
    expect(least).toBeLessThan(0.4);
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
  }, 30000);

  it("draws a frame from four numbers and the night's own lights, and sends up the parting's two attributes only in a frame where a figure moved, and only at that figure's corners", () => {
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
    const ownUniforms = ["uBeat", "uDance", "uHouse", "uLamp", "uLit", "uRim", "uRise", "uSit", "uSky", "uStage"];
    for (const name of ownUniforms) expect(compiled.uniforms[name]).toBe(uniforms[name]);
    expect(Object.keys(compiled.uniforms).sort()).toEqual(ownUniforms);
    // The phase is kept to CYCLE beats, and the rest are passed as they come.
    crowd.light(0.25);
    crowd.pose(3 * CYCLE + 2.5, 1.2, 0.4, 0.7);
    expect(["uBeat", "uDance", "uRise", "uSit"].map((name) => compiled.uniforms[name].value)).toEqual([2.5, 1.2, 0.4, 0.7]);
    // The crowd's own lights are the night's alone: a pose leaves them as they were, and they leave the pose. The stage they come from
    // never moves.
    const lights = () => ["uRim", "uLit", "uHouse", "uSky"].map((name) => compiled.uniforms[name].value as number);
    expect(lights()[0]).toBeCloseTo(RIM * (RIM_LEAST + (1 - RIM_LEAST) * 0.25), 15);
    expect(lights().slice(1)).toEqual([LIT * 0.25, HOUSE * 0.25, 1]);
    crowd.light(1);
    expect(["uBeat", "uDance", "uRise", "uSit", "uRim", "uLit", "uHouse"].map((name) => compiled.uniforms[name].value)).toEqual([2.5, 1.2, 0.4, 0.7, RIM, LIT, HOUSE]);
    expect((compiled.uniforms.uStage.value as unknown as Xyz)).toMatchObject({ x: RIM_TO[0], y: RIM_TO[1], z: RIM_TO[2] });
    expect((compiled.uniforms.uLamp.value as unknown as Xyz)).toMatchObject({ x: LAMP_TO[0], y: LAMP_TO[1], z: LAMP_TO[2] });
    // The music's factor on the sky's light, as main.js passes it, is taken back out: the sky's light on the crowd is the hour's.
    crowd.light(1, 1.08);
    expect(compiled.uniforms.uSky.value * 1.08).toBeCloseTo(1, 15);
    expect(lights().slice(0, 3)).toEqual([RIM, LIT, HOUSE]);
    // audio.js gives it 0.9 to 1.1; were it ever to come to nothing, the crowd would take the sky's light at most twice, and not
    // without end.
    for (const music of [0.5, 0.2, 0, -1]) { crowd.light(1, music); expect([music, compiled.uniforms.uSky.value]).toEqual([music, 2]); }
    // As dark as the night gets, the whole rim; where it is not dark at all, RIM_LEAST of it; and in between, as the night is. The
    // stage's light and the house lights go as the night does, from none to the whole.
    const rimAt = (dark: number) => { crowd.light(dark); return compiled.uniforms.uRim.value as number; };
    expect(rimAt(0)).toBeCloseTo(RIM * RIM_LEAST, 15);
    expect(lights().slice(1)).toEqual([0, 0, 1]);
    expect(rimAt(0.5)).toBeCloseTo(RIM * (1 + RIM_LEAST) / 2, 15);
    // So through the night's looks (night.js): in the last light, the stage's lights on and the sky still bright, a figure alone in
    // the open keeps an edge, at least 0.4 of the deep's; at daybreak, the lightest, no more than 0.6 of it; and the deep has the whole.
    const at = (hour: number) => rimAt(lookAt(hour, newLook()).dark) / RIM;
    expect(at(DEEP)).toBeCloseTo(1, 12);
    expect(at(0)).toBeGreaterThan(0.4);
    expect(at(0)).toBeLessThan(0.6);
    expect(at(DAYBREAK)).toBeGreaterThan(0.4);
    expect(at(DAYBREAK)).toBeLessThan(0.6);
    crowd.light(0);
    // Among the crowd figures step aside, and only the parting's two go up: at the corners of the figures that moved or eased their
    // arms in that frame, and at no other corner of the hundred thousand. A renderer takes the ranges and forgets them; so here.
    // From every figure at its seat, whatever walks the tests before this one took, so what is counted here is the same run alone.
    crowd.part(0, far, { x: 0.8, z: 0 }, true);
    const [x, z] = seats[0], rising: Float32Array = crowd.each.rising;
    const atSeat = new Set(figures.filter((g) => offset[4 * g.i] === 0 && offset[4 * g.i + 2] === 0).map((g) => g.i)), leftSeat = new Set<number>();
    let frames = 0;
    for (let f = 0; f < 12; f++) {
      aPart.clearUpdateRanges(); aRise.clearUpdateRanges();
      const stepped = versions(), had = [offset.slice(), rising.slice()];
      crowd.part(1 / 60, { x: x + 2.5 - 0.2 * f, z }, { x: x + 3.3 - 0.2 * f, z }, false);
      const after = versions(), movedNow = figures.filter((g) => [0, 1, 2, 3].some((q) => offset[4 * g.i + q] !== had[0][4 * g.i + q]) || rising[g.i] !== had[1][g.i]).map((g) => g.i);
      // The parting spreads as far as it did when this was measured, and no further: 38 figures move in a frame at the most, an eighth
      // of the crowd, and the farthest of them is one whose seat lies 15 m from the visitor's feet, stepped aside by an earlier walk.
      expect([f, movedNow.length <= 40]).toEqual([f, true]);
      expect([f, movedNow.every((i) => Math.hypot(seats[i][0] - (x + 2.5 - 0.2 * f), seats[i][1] - z) < 15.5)]).toEqual([f, true]);
      for (const i of movedNow) if (atSeat.has(i) && (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0)) leftSeat.add(i);
      expect([...after.slice(0, fixed.length), after[held.length]]).toEqual([...stepped.slice(0, fixed.length), stepped[held.length]]);
      expect([after[fixed.length] > stepped[fixed.length], after[fixed.length + 1] > stepped[fixed.length + 1]]).toEqual([movedNow.length > 0, movedNow.length > 0]);
      const sent = (attribute: { updateRanges: { start: number; count: number }[] }, size: number) => attribute.updateRanges.map((r) => [r.start / size, r.count / size]).sort((a, b) => a[0] - b[0]);
      const want = movedNow.map((i) => [crowd.corners[i], crowd.corners[i + 1] - crowd.corners[i]]);
      expect(sent(aPart, 4)).toEqual(want);
      expect(sent(aRise, 1)).toEqual(want);
      if (movedNow.length > 0) frames += 1;
    }
    expect(frames).toBeGreaterThan(6);
    // And the room it makes, as it was measured: 12 figures that stood at their seats step off them over these frames. A room 0.15 m
    // wider all round (partingOptions' keep) steps 17 off theirs, and one 0.1 m narrower 11.
    expect(leftSeat.size).toBe(12);
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
  const rig = marks(0), bit = marks(1), tint = marks(2).map((z) => z % TINTS), form = marks(2).map(formOfMark);
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
      // The torso's shoulders, at their widest, stand inside the ball's inner side.
      const torso = Math.max(...vertices.filter(([, y], i) => rig[i] === 0 && bit[i] === 0 && side[i] === 0 && Math.abs(y - 1.445) < 1e-6).map(([x]) => s * x));
      expect(s * Math.min(...ball.map(([x]) => s * x))).toBeLessThan(torso);
      // An arm's rings stand at the shoulder, a short sleeve's hem over the elbow, the elbow, 0.27 down it, and the wrist:
      // where the shader turns it, opens a short sleeve, and bends it, the elbow alone within a millimetre of the bend, where the
      // shader mitres it.
      const rings = [...new Set(vertices.filter((_, i) => side[i] === s && tint[i] !== 3).map(([, y]) => Math.round(y * 1e6) / 1e6))].sort((a, b) => b - a);
      expect(rings.map((y) => Math.round((SHOULDER_Y - y) * 1e6) / 1e6)).toEqual([0, 0.18, 0.27, 0.54]);
      expect(rings.filter((y) => Math.abs(SHOULDER_Y - y - 0.27) < 0.001)).toHaveLength(1);
    }
  });

  it("marks every vertex with how it hangs, its part's bit and whose colour it takes, each triangle one part of one colour, and carries nothing a texture would read", () => {
    expect([mark.itemSize, mark.count]).toEqual([4, n]);
    expect([...new Set(rig)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...new Set(tint)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...new Set(bit)].sort((a, b) => a - b)).toEqual([0, ...Object.values(PART)]);
    for (let t = 0; t < n; t += 3) {
      expect([bit[t + 1], bit[t + 2], rig[t + 1], rig[t + 2], tint[t + 1], tint[t + 2], form[t + 1], form[t + 2]]).toEqual([bit[t], bit[t], rig[t], rig[t], tint[t], tint[t], form[t], form[t]]);
    }
    // A part's forms are its own (FORMS), each built: every part built in its first form, and those with more in each of theirs.
    const P = PART as Record<string, number>, F = FORMS as Record<string, string[]>;
    for (const name of Object.keys(P)) {
      const built = [...new Set(form.filter((_, i) => bit[i] === P[name]))].sort((a, b) => a - b);
      expect([name, built]).toEqual([name, (F[name] ?? ["one"]).map((_, k) => k)]);
    }
    expect(geo.getAttribute("uv")).toBeUndefined();
    // Each part's bit is a power of two of its own, and all of them together are a number a 32-bit float holds exactly.
    const bits = Object.values(PART) as number[];
    for (const b of bits) expect(Number.isInteger(Math.log2(b))).toBe(true);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits.reduce((sum, b) => sum + b, 0)).toBeLessThan(2 ** 24);
  });

  it("is 2,765 triangles on a desktop and 1,772 on a phone, a cup and every form of every part among them, whose figure leaves out six parts and keeps the rest, and a crowd draws of them only what its figures wear", () => {
    const lean = figureGeometry(true);
    expect([geo.index, lean.index]).toEqual([null, null]);
    expect([n / 3, lean.getAttribute("position").count / 3]).toEqual([2765, 1772]);
    // And those are the figures the crowds are built of: a desktop's whole, a phone's plain.
    expect([crowd.figure.getAttribute("position").count / 3, phone.figure.getAttribute("position").count / 3]).toEqual([2765, 1772]);
    const leanBits = new Set(Array.from({ length: lean.getAttribute("aMark").count }, (_, i) => lean.getAttribute("aMark").getY(i) as number));
    const left = Object.entries(PART).filter(([, b]) => !leanBits.has(b as number)).map(([name]) => name);
    expect(left.sort()).toEqual([...PLAIN_LEAVES_OUT].sort());
    // The body: 580 triangles on a desktop and 364 on a phone, where it was 372 on both as a stack of tubes. A phone's and a
    // television's leave out the rings at the neck's foot and the ribs, the shorts' hem, the calf, the sleeve's hem, the instep and
    // the thumb, and its hands have 8 faces, not 20 (TORSO, LEG_RINGS, ARM_RINGS, PLAIN_SHOE).
    const bodyOf = (g: typeof geo) => Array.from({ length: g.getAttribute("position").count }, (_, i) => i).filter((i) => g.getAttribute("aMark").getY(i) === 0).length / 3;
    expect([bodyOf(geo), bodyOf(lean)]).toEqual([580, 364]);
    // A frame's cost goes with the triangles sent to be drawn, and the figure every figure was before its people differed was 440
    // of them. A crowd sends only what its figures wear: on the hills of 1986-07-04, 1970-08-30 and 1990-12-09 under 750 a figure
    // on a desktop and under 480 on a TV and a phone, where every figure sent the whole figure's 1,117 and 729 when it was an
    // instance of it. (As a stack of tubes, before its body was shaped, it was under 540 and 485.) So a tier's whole crowd, at the
    // figures its budget seats (quality.js), is under 262,500 triangles on a desktop, 120,000 on a TV and 72,000 on a phone, whose
    // crowd was 66,000 before its people differed.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const seated = Object.fromEntries(["desktop", "tv", "phone"].map((tier) => [tier, (budgetFor(tier) as { crowd: number }).crowd]));
    vi.unstubAllGlobals();
    expect(seated).toEqual({ desktop: 350, tv: 250, phone: 150 });
    for (const { date, desktop, phone: small } of SHOWS) {
      const each = (c: typeof crowd) => c.mesh.geometry.index.count / 3 / c.count, tv = crowdOf(date, true, seated.tv);
      expect([date, each(desktop) < 750, each(tv) < 480, each(small) < 480]).toEqual([date, true, true, true]);
      expect([date, each(desktop) > 740, each(tv) > 465, each(small) > 465]).toEqual([date, true, true, true]);
      expect([tv.count <= seated.tv, small.count <= seated.phone, desktop.count <= seated.desktop]).toEqual([true, true, true]);
    }
  });

  it("has leg rings at the foot, the calf, the knee halfway up, where shorts end and inside the hips, the knee alone where the vertex shader bends it, and a skirt's rings there and at the waist", () => {
    const rings = (r: number) => [...new Set(vertices.filter((_, i) => rig[i] === r && form[i] === 0).map(([, y]) => Math.round(y * 1e6) / 1e6))].sort((a, b) => a - b);
    // The leg's top is closed, 4 cm over its pivot at LEG, inside the hips; a phone's and a television's leave out the calf and the
    // shorts' hem.
    expect(rings(1)).toEqual([0, 0.2, LEG / 2, 0.62, 0.9]);
    const lean = verticesOf(figureGeometry(true));
    expect([...new Set(lean.filter((v) => v.mark.x === 1 && formOfMark(v.mark.z) === 0).map((v) => Math.round(v.y * 1e6) / 1e6))].sort((a, b) => a - b)).toEqual([0, LEG / 2, 0.9]);
    expect(vertices.filter((_, i) => rig[i] === 1 && form[i] === 0).filter(([x, y, z]) => y === Math.fround(0.9) && Math.abs(Math.abs(x) - HIP_X) < 1e-6 && z === 0).length).toBe(2 * 6);
    // The shader takes a corner within a hundredth of the leg's length of halfway up it for the knee's, and mitres it.
    expect(rings(1).filter((y) => Math.abs(y / LEG - 0.5) < 0.01)).toEqual([LEG / 2]);
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
      for (let t = 0; t < n; t += 3) if (bit[t] === (PART as Record<string, number>)[name] && form[t] === 0) {
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
    // Main's bob came and went on every beat, and its arms and sway in two: now each comes and goes as the band's moves do (band.js
    // swing), once in SLOW counts on the figure's own of four, over a quarter of them, held between.
    const step = swing(pose.beat + 0.12 * fig.y - Math.floor(4 * ((5.3 * fig.y) % 1)), SLOW, SLOW / 4), bounce = 0.5 + 0.5 * step;
    if (arm !== 0) {
      // Main's arms swung out and back on every beat, 0.5 rad at the most (1 - bounce), seated too. They swing with the sway now,
      // once in two beats, each out as the figure leans its way, and hang while it sits.
      const out = 0.5 + 0.5 * arm * step;
      const swing = rise * 2.7 + (1 - rise) * danced * 0.5 * out * (1 - sit);
      [x, y] = rot(x - arm * SHOULDER_X, y - SHOULDER_Y, arm * swing);
      x += arm * SHOULDER_X; y += SHOULDER_Y;
    }
    const bob = (1 - sit) * danced * (1 + rise) * 0.12 * bounce, lower = LEG * (1 - FOLD) * bob + (LEG - SEAT) * sit;
    if (leg > 0) {
      const fall = clamp(fig.w, DROP[0], DROP[1]), hip = [0, LEG - lower];
      let foot = [sit * FOOT[0], sit * (FOOT[1] - fall)];
      const span = Math.max(Math.hypot(foot[0] - hip[0], foot[1] - hip[1]), 1e-4), along = [(foot[0] - hip[0]) / span, (foot[1] - hip[1]) / span];
      // Seated, the knee falls out to its side, SPLAY rad about the line from the hip to the foot (new).
      const half = 0.5 * Math.min(span, LEG - 1e-3), ahead = [-along[1], along[0]], bowAll = Math.sqrt(Math.max((LEG / 2) ** 2 - half * half, 0));
      const bow = bowAll * Math.cos(SPLAY * sit), wide = bowAll * Math.sin(SPLAY * sit);
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
        x += Math.sign(v.x) * wide * (t > 0.5 ? 2 - 2 * t : 2 * t);
      }
    } else y -= lower;
    if (sways) [x, y] = rot(x, y, danced * 0.08 * step);
    // Standing, the legs lean with the ground's fall ahead of the seat, all of it at the foot and none at the hip (new).
    y -= (leg === 2 ? 1 : leg === 1 ? 1 - clamp(v.y / LEG, 0, 1) : 0) * (1 - sit) * (clamp(fig.w, DROP[0], DROP[1]) * z) / FOOT[0];
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

  it("moves a plain figure that bobs, standing, as every figure moved before, but for its arms, which swing slower and bend at the elbow, its flat feet and its level hems: its bob, the rise and its sway, to a hundredth of a millimetre", () => {
    // The body's vertices, standing on rising and falling ground, through two beats, still and rising and at each end of the crowd;
    // where the shader's legs or sway went wrong, this figure would no longer dance as main's did. Five things differ, the first two
    // for the flash count: it bobs and sways once in four counts, held between, as the band moves (before); its arms swing with its
    // sway and not on every beat, and bend at the elbow as it dances, so they are left out here (the rules below hold them); its feet,
    // which tipped with the sway before, stay flat on the ground, so they are held to main's without the sway; its legs lean with the
    // ground's fall, so its feet lie on it; and a trouser's hem, the ring at the foot, stays level as the shin slants, and is left out
    // here. Seated, or as far as it sits, it sits as its stance sits it, on the ground the stance and ground tests below hold, and is
    // left out here.
    const bodyOnly = rich.filter((v) => v.mark.y === 0);
    let worst = 0, looked = 0, feet = 0;
    for (const fig of [{ x: 0, y: 0.37, z: 0, w: 0.11 }, { x: 0, y: 0.81, z: 1, w: -0.07 }, { x: 1, y: 0.15, z: 0.4, w: 0.25 }])
      for (const pose of [{ dance: 1.6 }, { dance: 0.4 }, { dance: 1.3, rise: 1 }, { dance: 1.3, rise: 0.45 }, { dance: 1, sit: 1 }, { dance: 1, sit: 0.5 }, { dance: 1.6, still: 0.6 }, { dance: 1.6, rise: 1, rising: 0.3 }])
        for (let beat = 0; beat < 2; beat += 0.19) for (const v of bodyOnly) {
          if (v.mark.x === 3 || v.mark.x === 4 || (v.mark.x === 1 && v.y < 0.01 * LEG)) continue;
          if (Math.max(fig.x, pose.sit ?? 0) * (1 - (pose.rise ?? 0) * (pose.rising ?? 1)) > 0) continue;
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
        const [a, b, c2] = [0, 1, 2].map((k) => ({ ...put({ ...f, wear: { ...f.wear, x: 2 ** 23 - 1 } }, { x: position.getX(t + k), y: position.getY(t + k), z: position.getZ(t + k), mark: vec(mark, t + k) }, pose) }));
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
    // And none passes its own top (each.top), which the camera keeps clear of over it (seats.js parting), so it climbs over one who
    // holds something up and not over every head as if each did.
    const most = { wide: 0, top: 0, hang: 0, sat: 0, held: 0, feet: 0, lean: 0, against: Infinity, overOwn: -Infinity };
    let looked = 0, holders = 0;
    // A seated figure's upper arms and what it holds, if it holds a flag or a balloon, seated and still.
    const holdsUp = (f: Figure, worn: Vertex[]) => {
      if (f.fig.x !== 1 || Math.floor(f.wear.y / 8) % 8 !== 1) return;
      holders += 1;
      for (const v of worn) if (v.mark.x === 7 || ((v.mark.x === 3 || v.mark.x === 4) && v.y > SHOULDER_Y - 0.3)) {
        const q = put(f, v, { beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 });
        most.held = Math.max(most.held, f.across * Math.hypot(q.x, q.z));
      }
    };
    for (const [list, vertices, c] of [[figures, rich, crowd], [phones, plain, phone]] as const) for (const f of list) {
      const worn = vertices.filter((v) => wears(f, v)), beats = beatsOf(f);
      const reach = (pose: Pose, each: (out: number, up: number) => void) => {
        for (const v of worn) { const p = put(f, v, pose); each(f.across * Math.hypot(p.x, p.z), f.up * p.y); most.overOwn = Math.max(most.overOwn, f.up * p.y - c.each.top[f.i]); looked += 1; }
      };
      for (const beat of beats) for (const pose of [{ dance: 1.6 }, { dance: 1.6, rise: 0.5 }, { dance: 1.6, rise: 1 }, { dance: 1.6, sit: 1 }, { dance: 0.9, rise: 0.25 }])
        reach({ ...pose, beat }, (out, up) => { most.wide = Math.max(most.wide, out); most.top = Math.max(most.top, up); });
      if (f.fig.x === 0) for (const beat of [0, 1.7, 4.4]) reach({ beat, dance: 1.6, rise: 1, still: 1, rising: 0 }, (out, up) => { most.hang = Math.max(most.hang, out); most.top = Math.max(most.top, up); });
      // Seated and fully still, a figure's feet and knees reach further: its feet FEET out at the largest's size, along the ground,
      // as they did, and its knees, fallen apart, with the forearms on them and a skirt over them, KNEES; what of it passes the bear
      // is held below. A seated figure that holds a flag or a balloon holds it up its pole or string (HOLD_UP), the upper arm turned
      // back and the elbow 0.18 behind the shoulder, which its fit counts at 0.215 (reaches): its upper arms and what it holds reach no
      // further than its hanging arms do standing, HANG (a broad one's elbow went 1 cm past it). Where the ground rises across it
      // (aPlace.w), its legs lean with it, and no part of them goes up or down by more than the ground under that part does (a
      // taper's stand, which is stood whole on the ground where it stands, is held to that below).
      const level = { ...f, place: { ...(f.place ?? flat), w: 0 } }, rises = f.place?.w ?? 0, seated = { beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 };
      holdsUp(f, worn);
      for (const v of worn) {
        const p = { ...put(level, v, seated) }, q = put(f, v, seated), out = f.across * Math.hypot(q.x, q.z);
        most.sat = Math.max(most.sat, out);
        if (v.mark.x === 2) most.feet = Math.max(most.feet, out);
        if (v.mark.x !== 7 && Math.abs(rises * q.x) > 0.01) { const share = (q.y - p.y) / (rises * q.x); most.lean = Math.max(most.lean, share); most.against = Math.min(most.against, share); }
        looked += 1;
      }
    }
    // And so on a desktop's and a phone's crowd of broad seated figures holding a flag or a balloon (MIXES).
    for (const small of [false, true]) {
      const c = buildCrowd(new THREE.Scene(), { count: small ? 150 : Infinity, path, line, landmarks: [], plain: small, seed: 5, mix: MIXES.seatedHolding });
      for (const f of figuresOf(c)) holdsUp(f, (small ? plain : rich).filter((v) => wears(f, v)));
    }
    expect(looked).toBeGreaterThan(2e6);
    expect(holders).toBeGreaterThan(80);
    expect(most.held).toBeLessThanOrEqual(HANG * BIG);
    expect(most.held).toBeGreaterThan(0.95 * HANG * BIG);
    expect(most.wide).toBeLessThanOrEqual(own.wide);
    expect(most.top).toBeLessThanOrEqual(own.top);
    expect(most.overOwn).toBeLessThanOrEqual(0);
    expect(most.overOwn).toBeGreaterThan(-0.05);
    expect(most.hang).toBeLessThanOrEqual(HANG * BIG);
    expect(most.feet).toBeLessThanOrEqual(FEET * BIG);
    expect(most.sat).toBeLessThanOrEqual(KNEES * BIG);
    expect(FEET).toBe(0.55);
    // No figure is broader than the largest the parting's reaches are for.
    for (const list of [figures, phones]) expect(Math.max(...list.map((f) => f.across))).toBeLessThanOrEqual(BIG + 1e-9);
    expect(most.lean).toBeLessThanOrEqual(1 + 1e-6);
    expect(most.against).toBeGreaterThanOrEqual(-1e-6);
    expect(most.lean).toBeGreaterThan(0.99);
    expect(FEET * BIG).toBeLessThan(KNEES * BIG);
    // The reaches are used: a hand does go most of the way out, a pole most of the way up and a hem most of the way to HANG. (A hand
    // went further out when the arms danced straight; bent at the elbow, it goes 85 % of HAND.)
    expect(most.wide).toBeGreaterThan(0.8 * HAND * BIG);
    expect(most.top).toBeGreaterThan(0.97 * TOP * BIG);
    expect(most.hang).toBeGreaterThan(0.96 * HANG * BIG);
    expect(most.feet).toBeGreaterThan(0.96 * FEET * BIG);
    // The knees are no part of a figure's fit (buildCrowd), so KNEES is held on the broadest seated figure there can be, whatever
    // the crowds above hold: the stoutest build, girth 1.6, on the longest legs, in trousers, in flares and in the fullest skirt, at
    // the largest's size, sitting each way it can, on the steepest fall and rise ahead the seat allows and on ground that rises across
    // it either way;
    const knees: Record<string, number> = {};
    for (const sit of SITS as string[]) for (const legs of ["jeans", "bells", "maxi"]) for (const w of [DROP[0], 0, DROP[1]]) for (const rises of [-0.5, 0, 0.5]) {
      const worn = wearing({ ...BASE_FIGURE, legs, stance: { stand: "square", sit } }), f: Figure = { ...standard({ x: 1, y: 1, z: 0, w }), across: BIG, up: BIG, body: { x: 1.6, y: 1.04, z: 1.07, w: 1.08 },
        wear: { x: worn.parts, y: worn.style, z: 0, w: 1 }, place: { x: 0, y: 0, z: 0, w: rises } };
      for (const v of rich.filter((v) => wears(f, v))) { const p = put(f, v, { beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 }); knees[sit] = Math.max(knees[sit] ?? 0, f.across * Math.hypot(p.x, p.z)); }
    }
    // (one lying back reaches further, behind it, and is held below).
    delete knees.recline;
    expect(Math.max(...Object.values(knees))).toBeLessThanOrEqual(KNEES * BIG);
    expect(Math.max(...Object.values(knees))).toBeGreaterThan(0.97 * KNEES * BIG);
    // and in the crowds above, a seated figure's knees do reach out nearly as far as its feet may, FEET, where the bear's legs let
    // them (LOW, below).
    expect(most.sat).toBeGreaterThan(0.97 * FEET * BIG);
  }, 120000);

  it("keeps every seated figure clear of the visitor's bear as near as the parting lets it come, on level ground: every part of the figure, at its height, clear of the bear's own shape there, turned any way and at every swing of its legs", () => {
    // The parting keeps the visitor's bear's middle `hang` from a seated figure's axis (seats.js hold, partingOptions). The bear's
    // reach at each height, every 2 cm up: every triangle of its meshes, at every swing of its legs, every fortieth of a radian or
    // less, to the widest it swings at any speed (swingAt), its corner farthest across from its middle, 0.4 m ahead of its centre, at
    // every height the triangle spans; all round, since it turns. A part of a seated figure, still, that stands further from its axis
    // at a height than hang less that reach would be in the bear. This test once held a seated figure under 0.65 units up to the
    // hanging arms' reach (HANG) and took the bear's belly to reach 1.3 m from its middle there: but its hind legs, swung back at a
    // run, reach 1.59 m below a metre, and its tail then 1.66 m below two (sunk into the rump since, it reaches 1.51 m, and the ends
    // of the arms, swung to a run's widest, come down to two metres within a centimetre of 1.66 m), and a broad figure's head
    // lying back went 9.8 cm into the tail
    // (seed 10) and a cross-legged one's knees 6.3 cm into the legs (seed 25). The ground is taken level between the seat and the
    // bear, as the parting takes it; where the hill rises between them it is not held (#207's text).
    const widest = Math.max(...Array.from({ length: 401 }, (_, k) => swingAt(k / 10))), n = Math.ceil(widest / 0.025);
    const BAND = 0.02, reach: number[] = [], SWINGS = Array.from({ length: 2 * n + 1 }, (_, k) => (widest * (k - n)) / n);
    expect(widest).toBeGreaterThan(0);
    const bear = buildBear(new THREE.Scene(), 0xeceae4), v3 = new THREE.Vector3(), inverse = new THREE.Matrix4();
    for (const swing of SWINGS) {
      stride(bear, swing);
      bear.g.updateMatrixWorld(true);
      inverse.copy(bear.g.matrixWorld).invert();
      bear.g.traverse((o: { isMesh?: boolean; geometry: { getAttribute(name: string): THREE.BufferAttribute; index: THREE.BufferAttribute | null }; matrixWorld: THREE.Matrix4 }) => {
        if (!o.isMesh) return;
        const position = o.geometry.getAttribute("position"), index = o.geometry.index;
        for (let t = 0; t < (index ? index.count : position.count); t += 3) {
          let lo = Infinity, hi = -Infinity, far = 0;
          for (let k = 0; k < 3; k++) {
            v3.fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
            lo = Math.min(lo, v3.y); hi = Math.max(hi, v3.y); far = Math.max(far, Math.hypot(v3.x, v3.z - 0.4));
          }
          for (let b = Math.max(0, Math.floor(lo / BAND)); b <= Math.floor(hi / BAND); b++) reach[b] = Math.max(reach[b] ?? 0, far);
        }
      });
    }
    const bearAt = (h: number) => reach[Math.max(0, Math.floor(h / BAND))] ?? 0, under = (metres: number) => Math.max(...reach.slice(0, metres / BAND));
    // The bear's reaches buildCrowd deals by (BEAR_LEGS, BEAR_TAIL), and the parting's (BEAR, the whole bear's).
    expect(under(1)).toBeLessThanOrEqual(BEAR_LEGS);
    expect(under(1)).toBeGreaterThan(BEAR_LEGS - 0.01);
    expect(under(2)).toBeLessThanOrEqual(BEAR_TAIL);
    expect(under(2)).toBeGreaterThan(BEAR_TAIL - 0.01);
    expect(Math.max(...reach)).toBeLessThanOrEqual(own.hang - HANG * BIG);
    // A seated figure's least clearance: of every part it wears, at the height over its seat's ground it stands at, seated and still.
    const seated = { beat: 0.9, dance: 1.6, sit: 1, still: 1, rising: 0 };
    const clear = (f: Figure, worn: Vertex[], base: number) => {
      let least = Infinity;
      for (const v of worn) { const p = put(f, v, seated); least = Math.min(least, own.hang - f.across * Math.hypot(p.x, p.z) - bearAt(base + f.up * p.y)); }
      return least;
    };
    // Each way of sitting, at the broadest the crowd may sit that way (buildCrowd: no broader than the largest, and lying back,
    // cross-legged or kneeling no broader than its fit lets it), as tall as the largest: of each build, the slightest and the
    // stoutest, short and long legs, a standard figure's head and a child's, in trousers, flares, a long skirt and a dress, a shirt and
    // a poncho, lying back with its hair and head as lie back, on the steepest fall and rise ahead and across the seat allows.
    const least: Record<string, number> = {};
    for (const sit of SITS as string[]) for (const girth of [0.8, 1.2, 1.6]) for (const big of sit === "recline" ? [0.95, 1.05, 1.12, 1.32] : [0.95, 1.32]) for (const leg of [0.86, 1.07])
    for (const legs of ["jeans", "bells", "maxi", "dress"]) for (const top of ["shirt", "poncho"]) for (const [hair, head, length] of (sit === "recline" ? [["crop", "none", 1], ["braids", "wreath", 1.4], ["tail", "band", 1.4]] : [["crop", "none", 1]]) as [string, string, number][])
    for (const w of [DROP[0], 0, DROP[1]]) for (const rises of [-0.5, 0, 0.5]) {
      const worn = wearing({ ...BASE_FIGURE, legs, top, hair, head, stance: { stand: "square", sit } }), low = (LOW as Record<string, number[]>)[sit], fit = sit === "recline" ? lyingOf(big) : low ? low[0] + low[1] * girth : 0;
      const across = Math.min(BIG, fit ? (own.hang - (sit === "recline" ? BEAR_TAIL : BEAR_LEGS)) / fit : BIG);
      const f: Figure = { ...standard({ x: 1, y: 1, z: 0, w }), across, up: BIG, body: { x: girth, y: 1.04, z: leg, w: big }, wear: { x: worn.parts, y: worn.style, z: 0.04, w: 1 },
        cut: { x: length, y: { maxi: 0.093, dress: 0.42 }[legs] ?? 0.093, z: 1, w: 1 }, place: { x: 0, y: 0, z: 0, w: rises } };
      least[sit] = Math.min(least[sit] ?? Infinity, clear(f, rich.filter((v) => wears(f, v)), 0));
    }
    for (const [sit, margin] of Object.entries(least)) expect([sit, margin > 0]).toEqual([sit, true]);
    // And every seated figure of a desktop's crowds, a television's and a phone's, each on its tier's ground: on six days as dealt,
    // two with every figure stout, four with every seated one as lies back and one with every seated one broad and holding something
    // (MIXES): two of those that lie back had 16 lie back with the people the crowd deals now, and four have 30. A television draws
    // 250 of the gathering, to a desktop's 350 and a phone's 150, and plainly, as a phone does.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const budgets = Object.fromEntries(["desktop", "tv", "phone"].map((tier) => [tier, budgetFor(tier) as { crowd: number; grid: number }]));
    vi.unstubAllGlobals();
    const dealt: Record<string, number> = {}, onDesktop = new Map<string, string>();
    let sat = 0, lying = 0, both = 0, alike = 0;
    for (const [tier, small] of [["desktop", false], ["tv", true], ["phone", true]] as const) {
      const surface = surfaceOf(budgets[tier].grid);
      for (const [mix, seed] of [...Array.from({ length: 6 }, (_, k): [string, number] => ["", k]), ["stout", 8], ["stout", 9], ["lying", 10], ["lying", 11], ["lying", 13], ["lying", 14], ["seatedHolding", 12]] as [string, number][]) {
        const c = buildCrowd(new THREE.Scene(), { count: budgets[tier].crowd, path, line, landmarks: [], plain: small, seed, surface, mix: MIXES[mix] }), e = c.each;
        const vertices = small ? plain : rich;
        for (const f of figuresOf(c)) if (f.fig.x === 1) {
          const sits = SITS[Math.floor(Math.floor(f.wear.y / 16384) / 16)], x = e.matrix[16 * f.i + 12], z = e.matrix[16 * f.i + 14];
          dealt[sits] = Math.min(dealt[sits] ?? Infinity, clear(f, vertices.filter((v) => wears(f, v)), e.matrix[16 * f.i + 13] - surface(x, z)));
          sat += 1; lying += sits === "recline" ? 1 : 0;
          const seat = c.ground.seats[f.i] as Seat, key = `${mix} ${seed} ${seat.x} ${seat.z}`;
          if (tier === "desktop") onDesktop.set(key, sits);
          else if (tier === "tv" && onDesktop.has(key)) { both += 1; if (onDesktop.get(key) === sits) alike += 1; }
        }
      }
    }
    expect(sat).toBeGreaterThan(1200);
    expect(lying).toBeGreaterThan(20);
    // A television's crowd is mostly a desktop's: of the seats both sit, 409 of 486 sit the same way here. The rest do not, as a
    // television draws its figures plainly, which sizes some otherwise, on its own ground; so it is looked at too. The first line
    // guards against a gross mismatch between the two tiers' dealing; the second holds that a television does deal some seats
    // otherwise, which, with its ground, is what its crowds add here to a desktop's.
    expect(alike).toBeGreaterThan(0.6 * both);
    expect(alike).toBeLessThan(both);
    expect(Object.keys(dealt).sort()).toEqual([...SITS].sort());
    // Here the least clearance is 3.3 cm, of a cross-legged figure's knees, and of main's one way of sitting, the knees up, 3.4;
    // above, at the broadest each way of sitting may be, 0.5 cm, of a head lying back.
    for (const [sit, margin] of Object.entries(dealt)) expect([sit, margin > 0]).toEqual([sit, true]);
  }, 60000);

  it("stands every figure of a show where the hill's own ground is, children too, upright", () => {
    // The figure's own units say nothing of where on the hill it stands: a crowd set a metre over the ground, or its children a hand
    // higher than the rest, would dance the same. Each instance's place against the ground's height there (ground.js), on three
    // shows' hills, as a desktop draws them and as a phone does: over it or under it by just as far as the plane the figure lies on
    // stands it so that its highest contact with the ground, standing or seated as its seat has it, touches it (groundUnder), and
    // lying on that plane: its fall ahead (aFig.w) and its rise across (aPlace.w) are the plane's; and its lift the other way
    // (aSize.w) is how much higher it stands the other way.
    let children = 0, most = 0, plane = 0;
    for (const { date, desktop, phone: small } of SHOWS) for (const c of [desktop, small]) {
      let off = 0, tipped = 0;
      for (let i = 0; i < c.count; i++) {
        matrix.fromArray(c.each.matrix, 16 * i);
        at.setFromMatrixPosition(matrix);
        size.setFromMatrixScale(matrix);
        const [wide, tall, turn, other] = c.each.aSize.slice(4 * i, 4 * i + 4), cos = Math.cos(turn), sin = Math.sin(turn);
        const ground = (x: number, z: number) => height(at.x + wide * (cos * x + sin * z), at.z + wide * (cos * z - sin * x));
        const stance = Math.floor(c.each.aWear[4 * i + 1] / 16384), sits = SITS[Math.floor(stance / 16)], seated = c.each.aFig[4 * i] === 1;
        const worn = { parts: c.each.aWear[4 * i], style: c.each.aWear[4 * i + 1], wide: c.each.aBody[4 * i + 1] };
        const fit = groundUnder(ground, tall, seated ? sits : "stand", seated ? "stand" : sits, worn), lift = fit.lift;
        off = Math.max(off, Math.abs(at.y - ground(0, 0) - lift)); most = Math.max(most, Math.abs(lift));
        plane = Math.max(plane, Math.abs(c.each.aPlace[4 * i + 3] - fit.rises), Math.abs(c.each.aFig[4 * i + 3] - fit.drop), Math.abs(other - (fit.other - lift) / tall));
        tipped = Math.max(tipped, Math.abs(matrix.elements[4]), Math.abs(matrix.elements[6]), Math.abs(matrix.elements[1]), Math.abs(matrix.elements[9]));
        if (size.y < 0.7 * scale) { children += 1; expect(Math.abs(at.y - ground(0, 0) - lift)).toBeLessThan(1e-5); }
      }
      // To a hundredth of a millimetre, which is what an instance's matrix holds of a height of some tens of metres.
      expect([date, c.count, off < 1e-5, tipped]).toEqual([date, c.count, true, 0]);
    }
    // As 32-bit numbers hold them. The hill's own height bends under a figure by a few centimetres at the most.
    expect(plane).toBeLessThan(1e-5);
    expect(most).toBeGreaterThan(0.001);
    expect(most).toBeLessThan(0.05);
    expect(children).toBeGreaterThan(20);
  });

  it("keeps every figure of three shows over the ground it stands or sits on: nothing it wears or is passes under the hill, a trouser's hem among them, and a taper's stand goes down to the ground", () => {
    // In the figure's own units over the ground under each vertex, which falls or rises ahead of the seat as the hill does (aFig.w)
    // and rises across it (aPlace.w), for the crowds of 1986-07-04, 1970-08-30 and 1990-12-09 on both tiers, since the landmarks a show raises decide which seats
    // are taken and how the ground lies at each. Standing and dancing: no skirt, poncho, hair, pack or anything it holds is under
    // it, and nor is a trouser's hem, which tipped with the figure's lean and went under by up to a tenth of a unit, a flared one,
    // and stays level now as its foot does. Seated, dancing or held still by the parting: nothing at all is under it, not a lap, a
    // flared hem, a hoop's rim, a poncho's point or a hanging hand, and a skirt lies a hundredth over it.
    const low = { stand: Infinity, hems: Infinity, sit: Infinity, skirt: Infinity, standSkirt: Infinity };
    let stands = 0, looked = 0;
    for (const { desktop, phone: small } of SHOWS) for (const [c, vertices] of [[desktop, rich], [small, plain]] as const) for (const f of figuresOf(c)) {
      const fall = clamp(f.fig.w, DROP[0], DROP[1]), rises = f.place?.w ?? 0, under = (p: Xyz) => p.y + (fall * p.z) / FOOT[0] - rises * p.x;
      for (const v of vertices.filter((v) => wears(f, v))) {
        looked += 1;
        if (v.mark.x === 7) {
          // The stand is set down where the ground is under it, 0.22 ahead of the seat and 0.14 to its left, where that falls away,
          // and never raised where it rises: the same in every pose.
          for (const pose of [{ beat: 0.5, dance: 1.6 }, { beat: 0.5, dance: 1.2, sit: 1 }]) expect(put(f, v, pose).y - v.y).toBeCloseTo(-Math.max((fall * 0.22) / FOOT[0] + 0.14 * rises, 0), 9);
          stands += 1;
          continue;
        }
        if (f.fig.x === 0) for (const beat of [0, 0.5, 3.3]) {
          const p = put(f, v, { beat, dance: 1.6 });
          if (v.mark.x === 1) low.hems = Math.min(low.hems, under(p));
          else if (v.mark.x === 5) low.standSkirt = Math.min(low.standSkirt, under(p));
          else if (v.mark.x !== 2) low.stand = Math.min(low.stand, under(p));
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
    expect(low.hems).toBeGreaterThan(-1e-6);
    expect(low.standSkirt).toBeGreaterThan(0.012 - 1e-6);
    // Seated the other way, as the whole crowd sits through Space, a figure stands aSize.w higher or lower, so that its seated contacts
    // meet the hill where it bends away from the plane it stands on: a part goes under that plane by a thousandth of a unit at the
    // most, which the test below holds against the ground as drawn.
    expect(low.sit).toBeGreaterThan(-1e-3);
    expect(low.skirt).toBeGreaterThan(0.012 - 1e-3);
    // A broad sitter's seat stands as much higher as its thighs are thicker, 0.044 for each whole girth more, so that its lap rests
    // on the ground as a slight sitter's does and is not pressed flat into it.
    const hipsOf = (girth: number) => Math.min(...rich.filter((v) => v.mark.x === 0 && v.mark.y === 0 && Math.abs(v.y - 0.845) < 1e-4)
      .map((v) => put({ ...standard({ x: 0, y: 0.3, z: 0, w: 0 }), body: { x: girth, y: 1, z: 1, w: 1 } }, v, { beat: 0, dance: 0, sit: 1 }).y));
    expect(hipsOf(1.6) - hipsOf(1)).toBeCloseTo(0.044 * 0.6, 6);
  });

  it("stands every figure on the ground as its tier draws it, on twelve days' hills, twenty-six more on a television and twelve crowds a sweep of mixes of people found cases on, standing, seated, and dancing seated and standing: nothing of it goes more than 3 cm into that ground, and its feet, turning on the spot or not, its seat, its knees kneeling and its hands leaning back stand no more than 4 cm over it; and on five crowds a further sweep found the most on, 3.5 and 4.6 cm", () => {
    // The island's mesh lies flat between the points of its tier's grid (island.js surfaceOf), up to half a metre over or under the
    // hill's own height on a phone's. A figure stood on the hill's own height went as far into the ground drawn, and a seated one,
    // facing away with its legs hidden, read as sunk to its waist (#203). So each stands on its tier's ground, its legs lean with that
    // ground across it, and it stands on the plane that fits that ground where it rests on it (groundUnder). Here every corner of it
    // within half a unit of its feet, and of its arms, in metres over the drawn ground under that corner, for every figure of the
    // gathering on twelve days, the fixed day's among them, as each tier builds and draws it: standing still, seated (the crowd sits
    // on its spot, aFig.x or uSit), and seated and standing dancing at the dance's most, at the beats it leans and bobs furthest each
    // way; and on twenty-six days more as a television builds and draws them, standing and seated, and the feet of those that turn as
    // they turn: the days a review measured, 101 on by sevens, on which a seat stood 4.4 cm over a television's ground and a kneeling
    // figure's skirt went 3 cm into it, and two a flared cuff went into it on (below). A taper's stand, which goes down to the ground where it stands, is held above. And no
    // figure of them lies back that is broader than its head lets it lie (lyingOf).
    // And where it rests on that ground, standing or seated as its seat has it, the lowest corner of each foot, of its seat, of each
    // knee that kneels and of each hand that leans back on the ground, over it: main's stood up to 12 cm over it and sat up to 15.
    const TWELVE = [800, ...Array.from({ length: 11 }, (_, k) => 3 * k)], MORE = [...Array.from({ length: 24 }, (_, k) => 101 + 7 * k), 103, 202];
    // And on days a sweep of four mixes of people (MIXES) found each case on, as that mix, standing and seated, and dancing as the
    // mix's kind does: turning, a flared cuff 3.6 cm into a phone's ground and feet 4.9 over it; holding, a seated hand 4.6 to 5.9
    // cm into each tier's; stout, a kneeling figure's knee 4.2 cm over a desktop's ground; and as dealt, a hand lying back 5 cm over a
    // television's, a slight figure's seat leaning back 4.05 over a desktop's, and a kneeling figure's skirt, which went 3.03 cm into
    // a phone's where its hem was not looked at (HEMS). And the crowds the two sweeps below found the most on, with the people the
    // crowd now deals, those that hold things up over the heads among them (FURTHER): as dealt, a seated figure 2.85 cm into a
    // television's ground (541), a seat with its knees up 4.05 over it (659) and a standing figure's foot 4.02 over a phone's (51);
    // and every figure as broad as any may be (`widest`), a kneeling figure's knee 4.09 and 4.01 over a desktop's (643, 670).
    const STRESS: [string, string, number][] = [["turning", "phone", 59], ["turning", "desktop", 18], ["turning", "phone", 7], ["holding", "desktop", 3],
      ["holding", "phone", 24], ["holding", "tv", 30], ["stout", "desktop", 55], ["stout", "tv", 49], ["stout", "desktop", 47], ["", "tv", 38], ["", "desktop", 56],
      ["", "phone", 36]];
    const FURTHER: [string, string, number][] = [["", "tv", 541], ["", "tv", 659], ["", "phone", 51], ["widest", "desktop", 643], ["widest", "desktop", 670]];
    const turns = (f: Figure, state: string) => state === "dancing standing" && MOVES[f.wear.y % 8] === "spin";
    const holds = (f: Figure, state: string) => state === "dancing seated" && Math.floor(f.wear.y / 8) % 8 === 1;
    const low: Record<string, number> = {}, high: Record<string, number> = {}, lowFurther: Record<string, number> = {}, highFurther: Record<string, number> = {};
    let looked = 0, lying = 0, broadest = 0;
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const budgets = Object.fromEntries(["desktop", "tv", "phone"].map((tier) => [tier, budgetFor(tier) as { crowd: number; grid: number }]));
    vi.unstubAllGlobals();
    for (const [tier, small] of [["desktop", false], ["tv", true], ["phone", true]] as const) {
      const surface = surfaceOf(budgets[tier].grid), count = budgets[tier].crowd;
      const jobs = [...TWELVE.map((seed) => [seed, "", () => true]), ...(tier === "tv" ? MORE : []).map((seed) => [seed, "", turns]),
        ...STRESS.filter(([, t]) => t === tier).map(([mix, , seed]) => [seed, mix, mix === "holding" ? holds : turns]),
        ...FURTHER.filter(([, t]) => t === tier).map(([mix, , seed]) => [seed, mix, turns, true])] as [number, string, (f: Figure, state: string) => boolean, boolean?][];
      for (const [seed, mix, dances, further] of jobs) {
        const lows = further ? lowFurther : low, highs = further ? highFurther : high;
        const c = buildCrowd(new THREE.Scene(), { count, path, line, landmarks: [], plain: small, seed, surface, mix: MIXES[mix] }), e = c.each;
        const near = verticesOf(c.figure).filter((v) => v.mark.x !== 7 && (v.y < 0.95 || v.mark.x === 3 || v.mark.x === 4));
        for (const f of figuresOf(c)) if (SITS[Math.floor(Math.floor(f.wear.y / 16384) / 16)] === "recline") { lying += 1; broadest = Math.max(broadest, e.aSize[4 * f.i] * lyingOf(e.aBody[4 * f.i + 3])); }
        const poses: [string, Pose][] = [["standing", { beat: 0, dance: 0 }], ["seated", { beat: 0, dance: 0, sit: 1 }],
          ...[0.5, 1, 1.5, 3].map((beat): [string, Pose] => ["dancing seated", { beat, dance: 1.6, sit: 1 }]),
          ...[0.5, 1, 1.5, 3].map((beat): [string, Pose] => ["dancing standing", { beat, dance: 1.6 }])];
        for (const f of figuresOf(c)) for (const [state, pose] of poses) {
          if ((state === "standing" || state === "dancing standing") && f.fig.x === 1) continue;
          if (state.startsWith("dancing") && !dances(f, state)) continue;
          const [wide, tall, turn] = e.aSize.slice(4 * f.i, 4 * f.i + 3), cos = Math.cos(turn), sin = Math.sin(turn), place = f.place!;
          const sits = SITS[Math.floor(Math.floor(f.wear.y / 16384) / 16)], rests = (state === "standing") === (f.fig.x === 0), lowest: Record<string, number> = {};
          for (const v of near.filter((v) => wears(f, v))) {
            const p = put(f, v, pose), x = place.x + wide * (cos * p.x + sin * p.z), z = place.z + wide * (cos * p.z - sin * p.x), key = `${tier} ${state}`;
            const over = place.y + tall * p.y - surface(x, z), side = v.x > 0 ? "right" : "left";
            const turning = state === "dancing standing" && v.mark.x === 2 && MOVES[f.wear.y % 8] === "spin" ? `${key}, its feet turning` : key;
            lows[turning] = Math.min(lows[turning] ?? Infinity, over);
            looked += 1;
            if (!rests || state === "dancing seated") continue;
            const contact = v.mark.x === 2 ? `foot ${side}` : state !== "seated" ? null
              : sits !== "kneel" && v.mark.x <= 1 && Math.abs(p.z - (SIT_POSE as Record<string, { ahead: number }>)[sits].ahead) < 0.15 ? "seat"
              : sits === "kneel" && v.mark.x === 1 && p.z > 0.25 ? `knee ${side}`
              : (sits === "back" || sits === "recline") && (v.mark.x === 3 || v.mark.x === 4) ? `hand ${side}` : null;
            if (contact) lowest[contact] = Math.min(lowest[contact] ?? Infinity, over);
          }
          for (const [contact, over] of Object.entries(lowest)) {
            const key = `${tier} ${state === "seated" ? sits : MOVES[f.wear.y % 8] === "spin" ? "turning" : "standing"} ${contact.split(" ")[0]}`;
            highs[key] = Math.max(highs[key] ?? -Infinity, over);
          }
        }
      }
    }
    expect(looked).toBeGreaterThan(6e6);
    expect(lying).toBeGreaterThan(10);
    expect(broadest).toBeLessThanOrEqual(own.hang - BEAR_TAIL);
    // Standing and dancing, a trouser's cuff, which tipped with the lean, went 9 cm into the ground, and a skirt flared out flat as
    // its figure turned 5.5 cm: neither does now, the cuff staying level and the hem rising as it flares. And where only a figure's
    // contacts were looked at, what reaches out past them went into a television's or a phone's ground, which folds between points
    // further apart: a flared cuff 3.9 cm, a kneeling figure's skirt 5.5, and the feet of one turning on the spot, which sweep round
    // its middle, 6.2; now they are looked at too (nearing). And a seated hand that held a pole or a string hung at it 6 cm into the
    // ground beside the figure; it holds them higher now (HOLD_UP).
    for (const [key, under] of Object.entries(low)) expect([key, under > -0.03]).toEqual([key, true]);
    expect(Object.keys(low).length).toBe(15);
    // A seat with its knees up was dealt anywhere, and one that turns on the spot turned anywhere, its feet as high as a bump under
    // its sweep: they stood up to 4.4 and 4.8 cm over the ground on these days, and on others 7.4 and 4.9. Each is dealt now only
    // where it fits (stances, buildCrowd); and a hand a figure leans or lies back on leans with the ground as far as it is pressed
    // onto it, which over a steep slope across stood it 5 cm over. On sixty days' crowds as each tier builds them, of the people as
    // they come, and with every standing figure turning, every figure stout, and every standing one holding a pole or a string, 720
    // crowds, nothing went more than 2.74 cm into the ground and no contact stood more than 3.92 over it. On eighty days more (540 to
    // 579, 640 to 679), as dealt, stout, every figure as broad as any may be, and that with every standing one turning, 960 crowds,
    // they went 3.37 cm into it and 4.49 over it (#207's text). With the people the crowd deals now, who hold things up over the heads,
    // the same 720 crowds went 2.46 cm into it and 4.02 over it, and the 960 2.85 and 4.09. So the rest are held to 3 and 4 cm, and
    // the five crowds of the two sweeps that went furthest, the deepest of them and the four that stood a contact over 4 cm, to 3.5 and
    // 4.6 cm, the deepest past 2.8 cm and the highest past 4. Each bound is a sweep's most, not one any day must keep. Held to 3.5 and 4.6
    // everywhere, the test let go a flared cuff's guard (CUFFS) and a seat's hands leaning back out with its shoulders (touching).
    for (const [key, over] of Object.entries(high)) expect([key, over < 0.04]).toEqual([key, true]);
    for (const [key, under] of Object.entries(lowFurther)) expect([key, under > -0.035]).toEqual([key, true]);
    for (const [key, over] of Object.entries(highFurther)) expect([key, over < 0.046]).toEqual([key, true]);
    expect(Math.min(...Object.values(lowFurther))).toBeLessThan(-0.028);
    expect(Math.max(...Object.values(highFurther))).toBeGreaterThan(0.04);
    // Every tier's feet standing, and turning; seated, every stance's seat or knees and feet, and the hands of those that lean back.
    expect(Object.keys(high).length).toBe(3 * (2 + 2 * 5 + 2 + 2));
  }, 120000);

  it("shows a seated figure's legs from behind it, its knees fallen apart out past its hips, or the arms it leans back on, but for what a pack on its back hides", () => {
    // A seated figure facing away drew its back, its hips and its arms hanging to the ground beside them, its knees and feet hidden
    // behind it: on CI's crowd stills one near the camera read as a torso cut off at the waist on the hill (#203). Each seated figure
    // of three shows' crowds, as a desktop draws them and as a phone does, drawn alone in its own units by a small depth-tested raster
    // of the triangles it wears, from behind and 30 degrees to either side of that, looking 15 and 30 degrees down: of what is seen,
    // the share that is its legs, its feet or a skirt over them. Before, it was nothing straight from behind at 30 degrees down, and
    // the knees together give that still. One that leans back on its hands, or lies back, shows its arms going down to the ground
    // behind it, which hold it up, before its legs: of it, the share that is its legs or its arms. A poncho hides much of what the
    // knees show, and more over a pack or a bedroll, so each cover has its own bar: none, a pack or a bedroll, a poncho, a poncho over
    // one of those. The bars are to hold for any mix of people, so on a desktop's crowds each seated figure is also looked at in each
    // of the other covers it could wear sitting as it does (a full poncho, not a shawl, and none with its knees up or hugging them:
    // stances) from straight behind, where every cover showed its least on thirty days' crowds with every seated figure given each
    // cover in turn (MIXES, #207's text): 7.3, 8.6, 5.4 and 2.8 %. There, hugging its knees with its feet together, a figure with a
    // pack showed 0.6 % of its legs, and one in a full poncho hugging them still did; and one day's crowd of that mix is looked at
    // here too. And with its knees up in a full poncho, one showed 2.19 % (seed 88, here as dealt).
    const N = 64, least: Record<string, number> = {}, COVER = (PART.PONCHO as number) | (PART.PACK as number) | (PART.ROLL as number);
    const coverOf = (parts: number) => ((parts & (PART.PONCHO as number)) !== 0 ? ((parts & COVER) !== PART.PONCHO ? "poncho and packed" : "poncho") : (parts & COVER) !== 0 ? "packed" : "uncovered");
    const BAR: Record<string, number> = { uncovered: 0.06, packed: 0.06, poncho: 0.045, "poncho and packed": 0.025 };
    let figures2 = 0;
    const covered = buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [], seed: 10, mix: MIXES.covered });
    const day88 = buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [], seed: 88 });
    for (const [c, forced] of [...SHOWS.flatMap(({ desktop, phone: small }) => [[desktop, true], [small, false]]), [covered, true], [day88, true]] as [typeof crowd, boolean][]) {
      const position = c.figure.getAttribute("position"), mark = c.figure.getAttribute("aMark"), corners: Vertex[] = [];
      for (let k = 0; k < position.count; k++) corners.push({ x: position.getX(k), y: position.getY(k), z: position.getZ(k), mark: vec(mark, k) });
      for (const f of figuresOf(c).filter((f) => f.fig.x === 1)) {
        figures2 += 1;
        const sits = SITS[Math.floor(Math.floor(f.wear.y / 16384) / 16)], leans = ["back", "recline"].includes(sits);
        const own = corners.map((v) => (wears(f, v) ? { ...put(f, v, { beat: 0, dance: 0, sit: 1 }), legs: [1, 2, 5].includes(v.mark.x) || (leans && [3, 4].includes(v.mark.x)) } : null));
        const unshawled = { ...f, wear: { ...f.wear, y: f.wear.y - (Math.floor(f.wear.y / 64) & CUT.SHAWL ? 64 * CUT.SHAWL : 0) } };
        const others = !forced ? [] : [0, PART.PACK as number, PART.PONCHO as number, (PART.PONCHO as number) | (PART.PACK as number)]
          .filter((bits) => coverOf(bits) !== coverOf(f.wear.x) && !((sits === "hug" || sits === "knees") && (bits & (PART.PONCHO as number)) !== 0)).map((bits) => ({ ...unshawled, wear: { ...unshawled.wear, x: (f.wear.x & ~COVER) | bits } }));
        for (const [g, turns] of [[f, [-30, 0, 30]], ...others.map((g) => [g, [0]])] as [Figure, number[]][]) for (const turn of turns) for (const down of [15, 30]) {
          // Only the covers' own corners move with the cover.
          const posed = g === f ? own : corners.map((v, k) => (!wears(g, v) ? null : (v.mark.y & COVER) === 0 ? own[k] : { ...put(g, v, { beat: 0, dance: 0, sit: 1 }), legs: false }));
          const t = (turn * Math.PI) / 180, e = (down * Math.PI) / 180;
          const ahead = [Math.sin(t) * Math.cos(e), -Math.sin(e), Math.cos(t) * Math.cos(e)], right = [Math.cos(t), 0, -Math.sin(t)];
          const up = [ahead[1] * right[2] - ahead[2] * right[1], ahead[2] * right[0] - ahead[0] * right[2], ahead[0] * right[1] - ahead[1] * right[0]];
          const depth = new Float64Array(N * N).fill(Infinity), legs = new Uint8Array(N * N);
          for (let k = 0; k < posed.length; k += 3) {
            const tri = [posed[k], posed[k + 1], posed[k + 2]];
            if (tri.some((q) => q === null)) continue;
            const on = tri.map((q) => [((q!.x * right[0] + q!.y * right[1] + q!.z * right[2] + 0.8) / 1.6) * N, ((q!.x * up[0] + q!.y * up[1] + q!.z * up[2] + 0.6) / 1.8) * N, q!.x * ahead[0] + q!.y * ahead[1] + q!.z * ahead[2]]);
            const area = (a: number[], b: number[], c2: number[]) => (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]), whole = area(on[0], on[1], on[2]);
            if (Math.abs(whole) < 1e-12) continue;
            const x0 = Math.max(0, Math.floor(Math.min(...on.map((q) => q[0])))), x1 = Math.min(N - 1, Math.ceil(Math.max(...on.map((q) => q[0]))));
            const y0 = Math.max(0, Math.floor(Math.min(...on.map((q) => q[1])))), y1 = Math.min(N - 1, Math.ceil(Math.max(...on.map((q) => q[1]))));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
              const at2 = [x + 0.5, y + 0.5], w = [area(on[1], on[2], at2) / whole, area(on[2], on[0], at2) / whole, area(on[0], on[1], at2) / whole];
              if (w[0] < 0 || w[1] < 0 || w[2] < 0) continue;
              const d = w[0] * on[0][2] + w[1] * on[1][2] + w[2] * on[2][2];
              if (d < depth[y * N + x]) { depth[y * N + x] = d; legs[y * N + x] = tri[0]!.legs ? 1 : 0; }
            }
          }
          let seen = 0, ofLegs = 0;
          for (let k = 0; k < N * N; k++) if (depth[k] < Infinity) { seen += 1; ofLegs += legs[k]; }
          const key = `${coverOf(g.wear.x)}, ${turn} ${down}`;
          least[key] = Math.min(least[key] ?? 1, ofLegs / seen);
        }
      }
    }
    expect(figures2).toBeGreaterThan(150);
    for (const cover of Object.keys(BAR)) for (const down of [15, 30]) expect(least[`${cover}, 0 ${down}`]).toBeDefined();
    expect(Object.keys(least).filter((key) => key.startsWith("uncovered")).length).toBe(6);
    for (const [key, share] of Object.entries(least)) expect([key, share > BAR[key.split(",")[0]]]).toEqual([key, true]);
  }, 60000);

  it("stands every figure apart from what is seen past it, the land or the sky: a tenth of it a third lighter or darker, in every era's clothes, at every hour of the show, from the hill and from the stage, whatever the music does to the stage light", () => {
    // Each figure of the four shows' crowds, the fixed day's gathering, on a desktop and a phone, lit and seen from the hill's test
    // pose and from the stage at each hour, as seenApart (above) lights and sees it. A figure stands apart when its lightest tenth is
    // SEPARATE times as bright as what is past it at its brightest, worn or not and the stage light at its highest, or its darkest
    // tenth as much darker than it at its darkest: a Weber contrast of 0.3, the share by which it differs, many times what the eye can
    // just tell at a screen's levels (a few per cent). It rests on each figure's lightest quarter standing APART times lighter than its
    // darkest from every side (dressFor): on the colours people() deals alone, without that, some figure's every part sits within the
    // ground's own range.
    const shows = [...SHOWS, { date: SEVENTIES, desktop: crowdOf(SEVENTIES), phone: crowdOf(SEVENTIES, true) }];
    expect(shows.map(({ date }) => DRESS.findIndex(([, , d]) => d === dressOn(date))).sort()).toEqual([0, 1, 2, 3]);
    const least: Record<string, Seen> = {};
    for (const { date, desktop, phone: small } of shows) for (const [tier, c] of [["desktop", desktop], ["phone", small]] as const) {
      for (const [key, one] of Object.entries(seenApart(c, ["hill", "stage"], HOURS).least)) least[`${date} ${tier} ${key}`] = one;
    }
    expect(Object.keys(least).length).toBe(shows.length * 2 * 2 * HOURS.length);
    for (const [key, { by, i }] of Object.entries(least)) expect([key, i, by >= SEPARATE]).toEqual([key, i, true]);
  }, 120000);

  it("stands every figure apart from what is seen past it on other days' gatherings too, each in every era's clothes, as a desktop draws them: the days that came nearest", () => {
    // A day's gathering is its seed, FNV-1a of the featured date, 0 to 999 (components/world/data.ts, main.js), and who stands where,
    // what each wears and so how much of it shows in each colour, are the gathering's. SEEDED holds seven seeds whose crowds fell
    // under the bar before each figure stood apart from every side whatever it wore (2, 10, 12, 15, 21, 27 and 31, each under it in
    // some era), the seed that came nearest it then in each era of all a thousand (387, 879, 510 and 895), and the two that came
    // nearest after on a desktop, of all a thousand in each era and every day the schedule has (606 in the sixties and the nineties,
    // 392 in the eighties), and the two that fell under it in the nineties before the views drawnOf draws from spanned every eye's
    // (661, a reclining figure in a long skirt, from the stage, and 104, a kneeling one in a poncho, from the hill, on a television).
    // Each in each era's clothes, as a desktop draws it, lit and seen as the test above lights and sees the fixed day's; and each
    // figure dressed as the rule says (dressedApart).
    // And how one of a kind the crowd is (the variety's counts below): how many wear the colours they were dealt, how many of those
    // dealt a patterned top wear one still, and in each crowd how many wear the same three colours as another, and how many of those
    // below the quarter do as another such.
    const least: Record<string, Seen> = {}, counted: Record<string, number> = {};
    let keeps = 0, patterned = 0, patternKept = 0, twins = 0, hard = 0, hardTwins = 0;
    for (const seed of SEEDED) for (const date of ERA_SHOWS) {
      const c = crowdOf(date, false, 350, seed), who = peopleOf(c), d = dressOn(date) as Palette, kinds = dressedApart(c, date, counted);
      const wears = new Map<number, number>(), hardWears = new Map<number, number>();
      for (let i = 0; i < c.count; i++) {
        const dealt = (who[i] as { colour: Record<string, number> }).colour, got = c.each.colours[i] as Chosen, whole = got.top * 100 + got.legs * 10 + got.thing;
        if (GIVES.every((name) => got[name] === dealt[name])) keeps += 1;
        if (d.top[dealt.top][1] !== PATTERN.PLAIN) { patterned += 1; patternKept += d.top[got.top][1] !== PATTERN.PLAIN ? 1 : 0; }
        wears.set(whole, (wears.get(whole) ?? 0) + 1);
        if (!kinds[i].endsWith(` ${ENDS[0]}`)) { hard += 1; hardWears.set(whole, (hardWears.get(whole) ?? 0) + 1); }
      }
      const alike = (counts: Map<number, number>) => [...counts.values()].filter((n) => n > 1).reduce((sum, n) => sum + n, 0);
      twins += alike(wears); hardTwins += alike(hardWears);
      for (const [key, one] of Object.entries(seenApart(c, ["hill", "stage"], HOURS).least)) least[`${seed} ${date} ${key}`] = one;
      // A desktop's crowd holds some 26 MB of corners: none is kept.
      placedOf.delete(c);
    }
    // Of these 17,520 figures, 92.4 % stand apart from every side at the quarter, 4.8 % at the fifth and 2.7 % at the tenth; the 10
    // that no colours of their era bring apart even at the tenth are in a floppy hat and a poncho, which from over STEEP show one
    // colour, and stand apart from every side under it (dressedApart). A quarter of them, 25.3 %, wear the colours they were dealt:
    // the rest take others of their era, most of them one moved to the nearest, and those below the quarter the best.
    const all = Object.values(counted).reduce((sum, n) => sum + n, 0), short = counted.short ?? 0, under = counted["short under"] ?? 0;
    const tenth = Object.entries(counted).filter(([kind]) => kind.endsWith(" 0.1")).reduce((sum, [, n]) => sum + n, 0);
    expect([all > 15000, tenth > 0.01 * all, (short + under) / all < 0.005, under / all < 0.001]).toEqual([true, true, true, true]);
    // And they are many of a kind: 25.3 % wear the colours they were dealt, 95.6 % of those dealt a patterned top wear one still,
    // and 17.8 % of them wear the same three colours as another of their crowd, and 17.8 % of those below the quarter (7.6 %) the
    // same as another such. Where each took the first that stood apart, whoever wore it, it was 45.5 % of them; where those below
    // the quarter took their era's best, 25.2 % of those; and where a patterned top gave to plain as soon as to another pattern,
    // 89.5 % kept one.
    expect({ keeps: keeps / all > 0.25, patterns: patternKept / patterned > 0.95, twins: twins / all < 0.2, hard: hard / all < 0.08, hardTwins: hardTwins / hard < 0.2 })
      .toEqual({ keeps: true, patterns: true, twins: true, hard: true, hardTwins: true });
    expect(Object.keys(least).length).toBe(SEEDED.length * ERA_SHOWS.length * 2 * HOURS.length);
    for (const [key, { by, i }] of Object.entries(least)) expect([key, i, by >= SEPARATE]).toEqual([key, i, true]);
  }, 240000);

  it("stands apart the figures that fell under the bar on the way to the rule as it is, each in its own day's gathering, on the tier and from the eye it fell under on", () => {
    // Each is a show (the day's), the map its landmarks are raised from (the show's, or the nearest of its era's), the gathering's
    // seed, the tier, the figure and the eye, and how far apart it stood. Thirteen fell under when the fifth and the tenth took the
    // first colours of their era that brought that end apart from every side: below the quarter, they had fallen to the colours that
    // stand apart from the most sides, the best of all, and stood well over the bar. Two held a flag up on a pole, which drawnOf drew
    // and the eye's test missed from the stage, so that dressFor leaned on its black (705 and 806). And one, 104's figure 212, kneels
    // in a poncho, bells and a hat with a pack: the colours it was dealt bring its fifth apart from every side, and from the hill's own
    // way too, so it was not the views that failed it but the light, which at the half hour lit its tenths within the land's range past
    // it. Each now stands apart, and so does every figure of its crowd from that eye.
    const FELL = [
      ["1982-09-17", "1982-04-12", 305, "tv", 84, "hill", 1.288], ["1971-04-15", "1971-03-14", 430, "tv", 157, "stage", 1.294],
      ["1976-06-10", "1976-06-26", 430, "tv", 157, "stage", 1.294], ["1995-06-18", "1995-03-22", 104, "tv", 212, "hill", 1.231],
      ["1994-04-06", "1993-12-10", 398, "desktop", 219, "stage", 1.253], ["1970-08-30", "1970-08-30", 780, "desktop", 279, "stage", 1.288],
      [SEVENTIES, SEVENTIES, 209, "desktop", 102, "stage", 1.209], [SEVENTIES, SEVENTIES, 430, "tv", 157, "stage", 1.294],
      [SEVENTIES, SEVENTIES, 570, "desktop", 62, "stage", 1.297], [SEVENTIES, SEVENTIES, 780, "desktop", 279, "stage", 1.19],
      [SEVENTIES, SEVENTIES, 806, "tv", 110, "stage", 1.288], [FIXED, FIXED, 305, "tv", 84, "hill", 1.288],
      ["1990-12-09", "1990-12-09", 398, "desktop", 219, "stage", 1.253], ["1990-12-09", "1990-12-09", 442, "tv", 110, "hill", 1.236],
      ["1990-12-09", "1990-12-09", 493, "desktop", 219, "hill", 1.278], ["1990-12-09", "1990-12-09", 705, "tv", 166, "stage", 1.255],
      ["1990-12-09", "1990-12-09", 104, "tv", 212, "hill", 1.231],
    ] as const;
    for (const [show, from, seed, tier, i, eye, was] of FELL) {
      const c = crowdOf(show, tier === "tv", tier === "tv" ? 250 : 350, seed, from), { each } = seenApart(c, [eye], HOURS);
      const least = each.reduce((a, b) => (b.by < a.by ? b : a)), mine = each.find((one) => one.i === i)!;
      expect([show, seed, tier, i, was < SEPARATE, mine.by >= SEPARATE, least.by >= SEPARATE]).toEqual([show, seed, tier, i, true, true, true]);
      if (seed === 104 && show === "1990-12-09") {
        const f = figuresOf(c)[i], d = dressOn(show) as Palette, p = peopleOf(c)[i] as { colour: Record<string, number> }, chosen = { ...(c.each.colours[i] as Chosen) };
        const dealt: Chosen = { top: p.colour.top, legs: p.colour.legs, thing: p.colour.thing }, kit = kitOf(c), numbers = figureNumbers(f);
        const lights = [topLight(d.top[dealt.top]), lightOf(d.legs[dealt.legs]), lightOf(HAIRS[p.colour.hair]), lightOf(SKIN[p.colour.self]), lightOf(d.thing[dealt.thing]), 0.02];
        const sides = [...(drawnOf(kit, numbers) as number[][]), ...(drawnOf(kit, numbers, [viewFrom(f, EYES.hill)]) as number[][])];
        expect([numbers.seat, sides.every((shares) => apartOf(shares, lights, ENDS[1]) >= APART), dressedApart(c, show, {})[i], GIVES.some((name) => chosen[name] !== dealt[name])])
          .toEqual(["kneel", true, "near 0.2", true]);
        redress(c, i, d, chosen, dealt);
        expect(seenApart(c, [eye], HOURS, undefined, { only: [i] }).each[0].by).toBeLessThan(SEPARATE);
        redress(c, i, d, dealt, chosen);
      }
      placedOf.delete(c);
    }
  }, 240000);

  it("lights a face's rim as it stands edge-on to the eye and as the stage stands behind the figure: all round from behind, the stage's side alone from the side, and none within 60 degrees of the stage's way", () => {
    // The shader's own line, given the three dot products. A unit way `v` to the eye; faces edge-on to it, and one turned to it.
    const v = [0, 0, 1], up = [0, 1, 0], right = [1, 0, 0], left = [-1, 0, 0], back = [0, 0, -1];
    // The stage straight behind the figure, as from the hill: every face edge-on to the eye takes the whole rim, whichever way it
    // looks, and a face turned to the eye none.
    for (const n of [up, right, left, [0, -1, 0], [Math.SQRT1_2, Math.SQRT1_2, 0]]) expect(rimOf(n, v, back)).toBeCloseTo(RIM, 12);
    expect(rimOf(v, v, back)).toBe(0);
    // It falls off fast as a face turns toward the eye, so that a broad face near edge-on, a cape's or a hat's crown, takes little:
    // turned a third of the way, between a fortieth and a twelfth of the rim (RIM_EDGE 4: under a twentieth, where 3 gave nearly a
    // tenth); halfway, under a hundredth.
    const turned = (a: number) => [Math.sin(a), 0, Math.cos(a)];
    expect(rimOf(turned(Math.PI / 3), v, back)).toBeLessThan(RIM / 12);
    expect(rimOf(turned(Math.PI / 3), v, back)).toBeGreaterThan(RIM / 40);
    expect(rimOf(turned(Math.PI / 4), v, back)).toBeLessThan(RIM / 100);
    // From the side, the stage to the eye's right: the edge toward the stage takes RIM_SIDE of the rim, and the far edge none.
    expect(RIM_SIDE).toBeGreaterThan(0.2);
    expect(RIM_SIDE).toBeLessThan(0.75);
    expect(rimOf(right, v, right)).toBeCloseTo(RIM * RIM_SIDE, 12);
    expect(rimOf(left, v, right)).toBe(0);
    expect(rimOf(up, v, right)).toBe(0);
    // With the eye within 60 degrees of the stage's way from the figure, as from the stage or beside it, no face takes any: tried for
    // every face the eye sees, from a sphere of ways.
    let most = 0;
    for (let a = 0; a <= 60; a += 5) for (let k = 0; k < 400; k++) {
      const t = (Math.PI * a) / 180, toStage = [Math.sin(t), 0, Math.cos(t)];
      const z = 1 - (2 * (k + 0.5)) / 400, r = Math.sqrt(1 - z * z), phi = k * 2.399963, n = [r * Math.cos(phi), r * Math.sin(phi), z];
      if (dot3(n, v) >= 0) most = Math.max(most, rimOf(n, v, toStage));
    }
    expect(most).toBe(0);
    // And it is as bright as uRim, which the night sets (crowd.rim), whatever the face.
    for (const share of [0, 0.45, 0.6, 1]) expect(rimOf(up, v, back, RIM * share)).toBeCloseTo(RIM * share, 12);
  });

  it("brightens an edge by at most a tenth of white's luminance, and at night by more than the brightest colour a figure wears sends back there by the sky's and the house lights", () => {
    // The rim is added light, so it is at its brightest where a face is edge-on and the stage straight behind; its colour is
    // RIM_TINT, as the shader writes it. At most it adds under a tenth of full white's luminance to a pixel, a small step that holds
    // still with the music.
    expect(rimLines).toContain(`vec3(${RIM_TINT.map((c: number) => c.toFixed(4)).join(", ")})`);
    let most = 0;
    for (let facing = 0; facing <= 1; facing += 0.05) for (let stageward = -1; stageward <= 1; stageward += 0.05) for (let behind = -1; behind <= 1; behind += 0.05) {
      most = Math.max(most, runRim(RIM, facing, stageward, behind));
    }
    expect(most).toBeCloseTo(RIM, 12);
    const brightest = most * light({ r: RIM_TINT[0], g: RIM_TINT[1], b: RIM_TINT[2] });
    expect(brightest).toBeLessThan(0.1);
    // And it shows at night: at the deep of the night it adds more than the brightest colour a figure may wear (MOST) sends back on
    // an upright face, by the sky's light (half its sky colour and half its ground's, the hemisphere's 1.1 pi at the hour's gain, over
    // pi) and the house lights (HOUSE, half turned up), so even a white shirt's outline is lit from behind.
    const deep = lookAt(DEEP, newLook()), srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const sky = light({ r: srgb(deep.ambient[0]), g: srgb(deep.ambient[1]), b: srgb(deep.ambient[2]) }), ground = light({ r: srgb(deep.ground[0]), g: srgb(deep.ground[1]), b: srgb(deep.ground[2]) });
    const fill = MOST * ((0.5 * (sky + ground) * 1.1 * deep.ambientGain) + HOUSE * deep.dark * (HOUSE_LOW + 0.5 * (1 - HOUSE_LOW)));
    expect(deep.dark).toBe(1);
    expect(brightest).toBeGreaterThan(1.5 * fill);
  });

  it("gives each body a lit side and a shadow side at night: the side turned to the stage takes LIT_SIDE times the light of the side turned away, at every figure's distance", () => {
    // An upright face of a figure at the deep of the night, turned to the stage or away from it: the sky's light on it (half its sky
    // colour and half its ground's, the hemisphere's 1.1 pi at the hour's gain, over pi), the house lights, half turned up, and the
    // stage's light as the shader's own lines weigh it and add it, for every figure of the fixed day's crowd, at its middle's
    // distance from the stage's light. Every figure's stage side is lit at least LIT_SIDE times as brightly as its far side, so the
    // stage, not the sky, models each body; the nearest, by more.
    const LIT_SIDE = 1.5, deep = lookAt(DEEP, newLook()), srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const sky = 0.5 * (light({ r: srgb(deep.ambient[0]), g: srgb(deep.ambient[1]), b: srgb(deep.ambient[2]) }) + light({ r: srgb(deep.ground[0]), g: srgb(deep.ground[1]), b: srgb(deep.ground[2]) })) * 1.1 * deep.ambientGain;
    const adds = (lampLit: number, houseLit: number) => light({ r: lampAdds[0](1, lampLit, houseLit), g: lampAdds[1](1, lampLit, houseLit), b: lampAdds[2](1, lampLit, houseLit) });
    const ratios = figuresOf(SHOWS[0].desktop).map((f) => {
      const far = Math.hypot(f.place!.x - LAMP_TO[0], f.place!.y + 0.5 * TALL * f.size!.y - LAMP_TO[1], f.place!.z - LAMP_TO[2]) / LAMP_HALF;
      const [lit, house] = runLamp(LIT * deep.dark, HOUSE * deep.dark, 1, far, 0), [unlit] = runLamp(LIT * deep.dark, HOUSE * deep.dark, -1, far, 0);
      return (sky + adds(lit, house)) / (sky + adds(unlit, house));
    });
    expect(deep.dark).toBe(1);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(LIT_SIDE);
    expect(Math.max(...ratios)).toBeGreaterThan(4);
  });

  it("draws each figure's rim as an edge: from the hill its outline is lit and its middle barely, and from the side the stage's side alone", () => {
    // Every figure of the fixed day's crowds, desktop and phone, at rest, drawn alone by a depth-tested raster that culls the faces
    // turned away, as the GPU's front side does, each pixel the rim its face takes, the face flat as three's flat shading has it.
    // The eye at the hill's test pose (?pose=crowd), FIRST_EYE high, and the stage at RIM_TO: each figure's ways to them. A pixel of
    // the outline has a neighbour that shows none of the figure.
    const [hx, hz] = [TEST_POSES.crowd.x, TEST_POSES.crowd.z], eye = [hx, height(hx, hz) + 3.2, hz];
    const unit = (a: number[]) => { const l = Math.hypot(...a); return a.map((c) => c / l); };
    const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const N = 64;
    const drawn = (c: typeof crowd, side: boolean) => {
      const position = c.figure.getAttribute("position"), mark = c.figure.getAttribute("aMark"), corners: Vertex[] = [];
      for (let k = 0; k < position.count; k++) corners.push({ x: position.getX(k), y: position.getY(k), z: position.getZ(k), mark: vec(mark, k) });
      return figuresOf(c).map((f) => {
        const s = f.size!, p = f.place!, middle = [p.x, p.y + 0.5 * s.y, p.z], toStage = unit(RIM_TO.map((q: number, j: number) => q - middle[j]));
        // From the side: the eye level with the figure, square to the stage's way across the ground.
        const toEye = side ? unit([-toStage[2], 0, toStage[0]]) : unit(eye.map((q, j) => q - middle[j]));
        const ahead = toEye.map((q) => -q), across = unit(cross3(ahead, [0, 1, 0])), over = cross3(across, ahead);
        const toWorld = (q: Xyz) => {
          const cc = Math.cos(s.z), ss = Math.sin(s.z), wide = q.x * s.x, deep = q.z * s.x;
          return [cc * wide + ss * deep, s.y * q.y, -ss * wide + cc * deep];
        };
        const tris: { at: number[][]; rim: number }[] = [];
        for (let k = 0; k < corners.length; k += 3) {
          if (!wears(f, corners[k])) continue;
          const tri = [0, 1, 2].map((j) => toWorld({ ...put(f, corners[k + j], { beat: 0, dance: 0 }) }));
          const n = cross3(tri[1].map((q, j) => q - tri[0][j]), tri[2].map((q, j) => q - tri[0][j])), length = Math.hypot(...n);
          if (length < 1e-12 || dot3(n, toEye) <= 0) continue;
          tris.push({ at: tri.map((q) => [dot3(q, across), dot3(q, over), dot3(q, ahead)]), rim: rimOf(n.map((q) => q / length), toEye, toStage) });
        }
        const xs = tris.flatMap((t) => t.at.map((q) => q[0])), ys = tris.flatMap((t) => t.at.map((q) => q[1]));
        const x0 = Math.min(...xs), y0 = Math.min(...ys), span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) * 1.02, px = N / span;
        const depth = new Float64Array(N * N).fill(Infinity), rim = new Float64Array(N * N);
        for (const t of tris) {
          const on = t.at.map((q) => [(q[0] - x0) * px, (q[1] - y0) * px, q[2]]);
          const area = (a: number[], b: number[], c2: number[]) => (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]), whole = area(on[0], on[1], on[2]);
          if (Math.abs(whole) < 1e-12) continue;
          const bx0 = Math.max(0, Math.floor(Math.min(...on.map((q) => q[0])))), bx1 = Math.min(N - 1, Math.ceil(Math.max(...on.map((q) => q[0]))));
          const by0 = Math.max(0, Math.floor(Math.min(...on.map((q) => q[1])))), by1 = Math.min(N - 1, Math.ceil(Math.max(...on.map((q) => q[1]))));
          for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
            const at2 = [x + 0.5, y + 0.5], b = [area(on[1], on[2], at2) / whole, area(on[2], on[0], at2) / whole, area(on[0], on[1], at2) / whole];
            if (b[0] < 0 || b[1] < 0 || b[2] < 0) continue;
            const d = b[0] * on[0][2] + b[1] * on[1][2] + b[2] * on[2][2];
            if (d < depth[y * N + x]) { depth[y * N + x] = d; rim[y * N + x] = t.rim; }
          }
        }
        // The outline's pixels and the rest; and, from the side, the outline on the stage's side of the figure's middle and on the
        // far side.
        const seen = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && depth[y * N + x] < Infinity;
        const towardStage = dot3(toStage, across) > 0, mid = -x0 * px;
        const sums = { edge: [0, 0], inner: [0, 0], near: [0, 0], far: [0, 0], patch: 0 };
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          if (!seen(x, y)) continue;
          const r = rim[y * N + x] / RIM, outline = !seen(x - 1, y) || !seen(x + 1, y) || !seen(x, y - 1) || !seen(x, y + 1);
          const bin = outline ? sums.edge : sums.inner;
          bin[0] += r; bin[1] += 1;
          if (!outline && r > 0.25) sums.patch += 1;
          if (outline) { const which = (x + 0.5 > mid) === towardStage ? sums.near : sums.far; which[0] += r; which[1] += 1; }
        }
        const mean = ([sum, count]: number[]) => (count ? sum / count : 0);
        return { edge: mean(sums.edge), inner: mean(sums.inner), patch: sums.patch / sums.inner[1], near: mean(sums.near), far: mean(sums.far) };
      });
    };
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const { desktop, phone: small } = SHOWS[0];
    for (const [tier, c] of [["desktop", desktop], ["phone", small]] as const) {
      const hill = drawn(c, false), side = drawn(c, true);
      const edge = median(hill.map((h) => h.edge)), inner = median(hill.map((h) => h.inner));
      // From the hill the middle figure's outline takes over three times what the rest of it does, and 5.5 % of the rim on the mean
      // (measured 6.9 % on a desktop and 6.1 % on a phone, against 1.2 % within on both). Its flat faces light whole, but those that
      // light are the ones the eye sees edge-on, so narrow: of the pixels within the outline, a figure has a median of under 1 % at
      // over a quarter of the rim (0.5 % and 0.4 %), and the most 12 % and 5.5 %. At RIM_EDGE 3 the outline took 9.5 %, but the
      // middle 2.1 % and the most 16 %; at 5, the outline only 5.2 %.
      expect([tier, edge > 3 * inner, edge > 0.055]).toEqual([tier, true, true]);
      expect([tier, median(hill.map((h) => h.patch)) < 0.01, Math.max(...hill.map((h) => h.patch)) < 0.15]).toEqual([tier, true, true]);
      // From the side, the outline on the stage's side takes over ten times what the far side's does (measured 4.9 % and 4.5 % of
      // the rim, against 0.1 %), and less than the outline from the hill.
      const near = median(side.map((h) => h.near)), far = median(side.map((h) => h.far));
      expect([tier, near > 10 * far, near < edge, median(side.map((h) => h.edge)) < edge]).toEqual([tier, true, true, true]);
    }
  }, 60000);

  it("lays a seated figure's foot along the ground as it falls ahead of its seat, and a standing figure's along the ground it stands on", () => {
    const fig = { x: 0, y: 0.2, z: 0, w: 0.2 }, f = standard(fig);
    const sole = rich.filter((v) => v.mark.x === 2 && v.y < 1e-6 && v.x > 0), heel = sole.filter((v) => v.z < 0)[0], toe = sole.filter((v) => v.z > 0)[0];
    const standing = [heel, toe].map((v) => ({ ...put(f, v, { beat: 0, dance: 0 }) })), seated = [heel, toe].map((v) => ({ ...put(f, v, { beat: 0, dance: 0, sit: 1 }) }));
    // Standing, the sole lies on the ground as it falls ahead, 0.2 of a unit over FOOT[0], neither tipped nor moved along: the heel
    // over the seat's ground as far as it stands behind the seat, and the toe under it as far as it stands ahead.
    for (const [p, v] of [[standing[0], heel], [standing[1], toe]] as const) {
      expect(p.y).toBeCloseTo((-0.2 * v.z) / FOOT[0], 8);
      expect(p.z).toBeCloseTo(v.z, 8);
    }
    // And across: where the ground rises 0.3 a unit to the figure's right, the sole lies on that too.
    const tilted = { ...f, place: { x: 0, y: 0, z: 0, w: 0.3 } };
    for (const v of [heel, toe]) expect(put(tilted, v, { beat: 0, dance: 0 }).y).toBeCloseTo(0.3 * v.x - (0.2 * v.z) / FOOT[0], 8);
    // Seated, the whole figure goes down with the ground as it falls ahead, each corner as far as the ground falls under it: the toe
    // lies lower than the heel by the fall over the foot's length, 0.2 of a unit over FOOT[0] ahead, and no further ahead.
    const length = toe.z - heel.z;
    expect(seated[1].y - seated[0].y).toBeCloseTo((-length * 0.2) / FOOT[0], 6);
    expect(seated[1].z - seated[0].z).toBeCloseTo(length, 6);
    // And every corner of the sole rests FOOT[1] over the ground, wherever it is ahead of the seat: the feet FOOT[0] ahead.
    const middle = rich.filter((v) => v.mark.x === 2 && v.y < 1e-6).map((v) => ({ ...put(f, v, { beat: 0, dance: 0, sit: 1 }) }));
    for (const p of middle) expect(p.y + (0.2 * p.z) / FOOT[0]).toBeCloseTo(FOOT[1], 6);
    expect(Math.min(...middle.map((p) => p.z))).toBeGreaterThan(FOOT[0] - 0.1);
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
    // And seated, a hoop lies at rest in the figure's lap as it dances, where it lies seated with no dance: in its body's frame, every
    // corner of it, whichever way the figure moves, through the cycle. Standing, a dancer lifts it and swings it (the rules below).
    const hoop = rich.filter((v) => v.mark.y === PART.HOOP);
    let moved = 0;
    for (const move of MOVES as string[]) {
      const f = carrying("hoop", move), rest = { beat: 0, dance: 0, sit: 1 }, frame0 = bodyFrame(f, rest);
      const at0 = hoop.map((v) => { const p = { ...put(f, v, rest) }; return frame0.in([p.x - frame0.from.x, p.y - frame0.from.y, p.z - frame0.from.z]); });
      for (const dance of [0.6, 1.2, 1.6]) for (const beat of [0.3, 1.1, 2.6, 3.9, 5.4, 7.2]) {
        const at = { beat, dance, sit: 1 }, frame = bodyFrame(f, at);
        hoop.forEach((v, k) => { const p = { ...put(f, v, at) }, q = frame.in([p.x - frame.from.x, p.y - frame.from.y, p.z - frame.from.z]); moved = Math.max(moved, Math.hypot(q[0] - at0[k][0], q[1] - at0[k][1], q[2] - at0[k][2])); });
      }
    }
    expect(moved).toBeLessThan(1e-9);
    // And its legs and feet, which stay where they rest as a seated figure leans from its hips: every corner of them, for every
    // figure of the test hills, dancing seated at four beats, where they lie seated with no dance. Since a cuff stays level as the
    // figure leans, legs that leaned with it sink no cuff into the ground, so the ground test no longer catches them.
    let legs = 0, legsLooked = 0;
    for (const f of figures) for (const v of rich.filter((v) => (v.mark.x === 1 || v.mark.x === 2) && wears(f, v))) {
      const rest = { ...put(f, v, { beat: 0, dance: 0, sit: 1 }) };
      for (const [beat, dance] of [[0.5, 1.6], [1.5, 1.6], [3, 1.2], [5.4, 1.6]]) {
        const p = put(f, v, { beat, dance, sit: 1 });
        legs = Math.max(legs, Math.hypot(p.x - rest.x, p.y - rest.y, p.z - rest.z));
        legsLooked += 1;
      }
    }
    expect(legsLooked).toBeGreaterThan(5e4);
    expect(legs).toBe(0);
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

  it("moves each figure its own way, and all of them further as the music is louder but those that stand and watch: eight ways of moving, each its own", () => {
    // How far a figure's hands, head and hips each travel through a cycle, at the dance's least and at its most.
    const lowest = (a: Vertex, b: Vertex) => (b.y < a.y ? b : a);
    const hand = rich.filter((v) => v.mark.x === 4 && v.mark.y === 0).reduce(lowest), crown = rich.filter((v) => v.mark.x === 6 && v.mark.y === 0).reduce((a, b) => lowest(b, a) === b ? a : b);
    const travel = (f: Figure, v: Vertex, danced: number) => {
      let sum = 0, last = { ...put(f, v, { beat: 0, dance: danced }) };
      for (let k = 1; k <= 160; k++) { const p = put(f, v, { beat: (k * CYCLE) / 160, dance: danced }); sum += Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z); last = { ...p }; }
      return sum;
    };
    const by: Record<string, { hand: number; head: number; n: number }> = {};
    let settles = 0, still = 0;
    for (const f of figures.filter((f) => f.fig.x === 0)) {
      const move = moveOf(f), loud = { hand: travel(f, hand, 1.6), head: travel(f, crown, 1.6) }, quiet = { hand: travel(f, hand, 0.4), head: travel(f, crown, 0.4) };
      by[move] ??= { hand: 0, head: 0, n: 0 };
      by[move].hand += loud.hand; by[move].head += loud.head; by[move].n += 1;
      if (loud.hand + loud.head > quiet.hand + quiet.head) settles += 1;
      if (move === "watch" && loud.hand + loud.head < 1e-9) still += 1;
    }
    expect(Object.keys(by).sort()).toEqual([...MOVES].sort());
    const mean = (move: string, what: "hand" | "head") => by[move][what] / by[move].n;
    // Every figure moves more at the dance's most than at its least, but one who watches, which stands still, as many at a show do.
    const watching = figures.filter((f) => f.fig.x === 0 && moveOf(f) === "watch").length;
    expect(watching).toBeGreaterThan(15);
    expect([settles, still]).toEqual([figures.filter((f) => f.fig.x === 0).length - watching, watching]);
    // One who watches moves its hands the least by far, one who turns carries them round, and one who nods moves its head.
    expect(mean("watch", "hand")).toBe(0);
    expect(mean("spin", "hand")).toBeGreaterThan(mean("sway", "hand"));
    expect(mean("nod", "head")).toBeGreaterThan(1.5 * mean("watch", "head"));
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
  // An arm's top ring, and its hand under the wrist: the lower half of the mitten, a ball 0.05 round drawn in to 0.6 of it across
  // and to 0.95 of it ahead, and not the thumb.
  const mitten = (v: Vertex, side: number) => Math.abs(Math.hypot((v.x - side * SHOULDER_X) / 0.6, v.y - (SHOULDER_Y - 0.565), v.z / 0.95) - 0.05) < 1e-4;
  const arms2 = [3, 4].map((r, k) => ({ top: bodyOf(r).filter((v) => Math.abs(v.y - SHOULDER_Y) < 1e-6), hand: bodyOf(r).filter((v) => v.y < SHOULDER_Y - 0.5401 && mitten(v, 2 * k - 1)) }));
  const core = rich.filter((v) => v.mark.x === 0 && v.mark.y === 0), neck = core.filter((v) => Math.abs(v.y - 1.62) < 1e-4), seat = core.filter((v) => Math.abs(v.y - 0.845) < 1e-4);
  function armAngle(f: Figure, k: number, pose: Pose) {
    const a = mean(f, arms2[k].top, pose), h = mean(f, arms2[k].hand, pose), n = mean(f, neck, pose), q = mean(f, seat, pose);
    const arm = [h.x - a.x, h.y - a.y, h.z - a.z], down = [q.x - n.x, q.y - n.y, q.z - n.z];
    return Math.acos(Math.min(1, (arm[0] * down[0] + arm[1] * down[1] + arm[2] * down[2]) / (Math.hypot(...arm) * Math.hypot(...down))));
  }
  // How many times a point goes back on its way round a cycle of beats (the last one the first again): where, having moved more than a
  // thousandth, it next moves more than a thousandth against that. What sweeps once passes each place once; an angle from hanging
  // turns where an arm swings across its hanging line, and counted that as two.
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  function backs(points: number[][]) {
    const one = points.slice(0, -1), back = (series: number[][]) => {
      let count = 0, from = series[0], way: number[] | null = null;
      for (const p of series) {
        const d = [p[0] - from[0], p[1] - from[1], p[2] - from[2]];
        if (Math.hypot(...d) <= 1e-3) continue;
        if (way && dot(d, way) < 0) count += 1;
        way = d; from = p;
      }
      return count;
    };
    return back([...one, ...one]) - back(one);
  }
  // The body's own frame in a pose, from its neck: across its shoulders, down its line to its hips, and ahead; and a way in it.
  const unit = (p: number[]) => { const l = Math.hypot(...p); return p.map((c) => c / l); };
  function bodyFrame(f: Figure, at: Pose) {
    const n = mean(f, neck, at), q = mean(f, seat, at), l = mean(f, arms2[0].top, at), r = mean(f, arms2[1].top, at), down = unit([q.x - n.x, q.y - n.y, q.z - n.z]);
    const across0 = [r.x - l.x, r.y - l.y, r.z - l.z], across = unit(across0.map((c, i) => c - dot(across0, down) * down[i]));
    const ahead = [down[1] * across[2] - down[2] * across[1], down[2] * across[0] - down[0] * across[2], down[0] * across[1] - down[1] * across[0]];
    return { from: n, in: (d: number[]) => [dot(d, across), dot(d, down), dot(d, ahead)] };
  }
  // And an arm's turns back: its line from its shoulder to its hand in the body's frame, a thousandth of a radian being a thousandth
  // along it.
  function armTurns(f: Figure, k: number, pose: Omit<Pose, "beat">, beats: number[]) {
    return backs(beats.map((beat) => {
      const at = { ...pose, beat }, a = mean(f, arms2[k].top, at), h = mean(f, arms2[k].hand, at);
      return bodyFrame(f, at).in(unit([h.x - a.x, h.y - a.y, h.z - a.z]));
    }));
  }
  // And how many times each corner of an arm turns back along the line it mostly moves on round the cycle, as the figure's own units
  // have it, its lean and all but its turn on the spot, which is a move of its own (above). A bob's arm swung out against its lean
  // once ended past it, and came back 2.7 mm across as the lean held: 8 turns in CYCLE, where the arm's line turned 4. A part that
  // swings or leans goes round an arc, which passes each place once: up and down, a lean's arc dips at either end and so turns
  // within each move, but along its own line it does not.
  function cornerTurns(f: Figure, k: number, pose: Omit<Pose, "beat">, beats: number[]) {
    const corners = bodyOf(k === 0 ? 3 : 4), paths = corners.map(() => [] as number[][]);
    for (const beat of beats.slice(0, -1)) {
      const at = { ...pose, beat }, l = mean(f, arms2[0].top, at), r = mean(f, arms2[1].top, at), a = Math.atan2(r.z - l.z, r.x - l.x), c = Math.cos(a), s = Math.sin(a);
      corners.forEach((v, j) => { const p = put(f, v, at); paths[j].push([c * p.x + s * p.z, p.y, c * p.z - s * p.x]); });
    }
    return paths.map((path) => {
      // The line it mostly moves on: the widest way of its spread about its middle.
      const mid = [0, 1, 2].map((i) => path.reduce((sum, p) => sum + p[i], 0) / path.length), off = path.map((p) => p.map((c2, i) => c2 - mid[i]));
      let way = [1, 0.5, 0.25];
      for (let n = 0; n < 40; n++) {
        const next = [0, 1, 2].map((i) => off.reduce((sum, d) => sum + d[i] * dot(d, way), 0)), length = Math.hypot(...next);
        if (length < 1e-12) return 0;
        way = next.map((c2) => c2 / length);
      }
      const along = off.map((d) => dot(d, way));
      return turns([...along, ...along]) - turns(along);
    });
  }
  // And how many times its knees bend and straighten round the cycle: its hips' distance from its feet, which its lean and its turn
  // leave as it is, turning by more than a thousandth.
  const soles = rich.filter((v) => v.mark.x === 2);
  function kneeTurns(f: Figure, pose: Omit<Pose, "beat">, beats: number[]) {
    const reach = beats.slice(0, -1).map((beat) => { const q = mean(f, seat, { ...pose, beat }), t = mean(f, soles, { ...pose, beat }); return Math.hypot(q.x - t.x, q.y - t.y, q.z - t.z); });
    return turns([...reach, ...reach]) - turns(reach);
  }
  // Every thing carried with every way of moving, as wearing() packs them on the standard figure, whether or not a crowd pairs them;
  // and the states a figure is drawn in: dancing, at the dance's most, seated, as the build-up lifts it and at its peak, and held
  // still by the parting, standing and seated.
  const CARRIED = ["none", ...new Set(PROPS as string[])];
  // What is held up on a pole, in its forms' order (FORMS.FLAG), and on a string; each held in the right hand.
  const POLED = ["flag", "swallowtail", "pennant", "streamer", "star", "moon", "parasol", "puppet"], HELD_UP = [...POLED, "balloon", "bunch"];
  const BASE = BASE_FIGURE;
  const carrying = (prop: string, move: string, more: Record<string, unknown> = {}): Figure => {
    const worn = wearing({ ...BASE, prop, move, ...more });
    return { ...standard({ x: 0, y: 0, z: 0, w: 0 }), wear: { x: worn.parts, y: worn.style, z: 0, w: 1 }, forms: formsOf({ ...BASE, prop, move, ...more }) as Record<number, number> };
  };
  const STATES: [string, Omit<Pose, "beat">][] = [["dancing", { dance: 1.2 }], ["dancing hard", { dance: 1.6 }], ["seated", { dance: 1.2, sit: 1 }], ["rising", { dance: 1.3, rise: 0.5 }],
    ["risen", { dance: 1.6, rise: 1 }], ["held still", { dance: 1.6, still: 1, rising: 0 }], ["seated and held still", { dance: 1.6, sit: 1, still: 1, rising: 0 }]];
  const through = Array.from({ length: 161 }, (_, k) => 0.2 + (k * CYCLE) / 160);

  it("holds every rule of how a figure moves for every thing carried with every way of moving, and every stance, dancing, seated, rising and held still: slow arms, seated forearms at rest, flat feet", () => {
    // The rules were first tested on a figure that carries nothing, and a drummer's hands kept every beat and a finger-holder's arm
    // was not in them. Here each of the 18 things a figure may carry (nothing among them) with each of the 8 ways of moving; each of
    // the 13 ways of standing with each of the 4 ways of moving that leave the arms to it; and each of the 6 ways of sitting, watching
    // and bobbing; in each of the 7 states: 1,456 figures, through the eight beats.
    const feet = rich.filter((v) => v.mark.x === 2), slow: string[] = [], raised: string[] = [], lifted: string[] = [], still: string[] = [], kneed: string[] = [];
    // How an arm that holds nothing hangs, as an angle from the body's own line, and how it rests seated, its forearm on its knee.
    const hanging = [0, 1].map((k) => armAngle(carrying("none", "watch"), k, { beat: 0, dance: 0 }));
    const resting = [0, 1].map((k) => armAngle(carrying("none", "watch"), k, { beat: 0, dance: 0, sit: 1 }));
    // Seated, each way of sitting rests its forearms its own way (SIT_POSE), still.
    const restsAs = (sit: string) => [0, 1].map((k) => armAngle(carrying("none", "watch", { stance: { stand: "square", sit } }), k, { beat: 0, dance: 0, sit: 1 }));
    const ROWS: [string, string, string, string][] = [...CARRIED.flatMap((c) => (MOVES as string[]).map((m) => [c, m, "square", "knees"] as [string, string, string, string])),
      ...(STANDS as string[]).flatMap((stand) => ["watch", "sway", "nod", "shift"].map((m) => ["none", m, stand, "knees"] as [string, string, string, string])),
      ...(SITS as string[]).flatMap((sit) => ["watch", "bob"].map((m) => ["none", m, "square", sit] as [string, string, string, string]))];
    let looked = 0;
    for (const [prop, move, stand, sit] of ROWS) for (const [state, pose] of STATES) {
      const f = carrying(prop, move, { stance: { stand, sit } }), name = `${prop}, ${move}, ${stand}, ${sit}, ${state}`, sits = (pose.sit ?? 0) === 1, held = (pose.still ?? 0) === 1;
      looked += 1;
      // No arm goes out and back more than once in SLOW counts, whatever it holds, 4 turns in CYCLE at the most; but the hands of a
      // clap and at a drum, before the figure's own body, once in STRUM, 8.
      const swings = [0, 1].map((k) => armTurns(f, k, pose, through)), most = (2 * CYCLE) / (move === "clap" || prop === "drum" ? STRUM : SLOW);
      if (Math.max(...swings) > most) slow.push(`${name}: ${swings}`);
      // And no corner of an arm turns back along its way more often (cornerTurns), its lean and all.
      if (!held) for (const k of [0, 1]) {
        const crossed = cornerTurns(f, k, pose, through);
        if (Math.max(...crossed) > most) slow.push(`${name}, ${k === 0 ? "left" : "right"} arm's corners: ${Math.max(...crossed)}`);
      }
      // Held still by the parting, nothing of it moves at all.
      const knees = kneeTurns(f, pose, through);
      if (held && (Math.max(...swings) > 0 || knees > 0)) still.push(name);
      // Its knees come down and up once in SLOW counts at the most, whatever it carries, one that bobs among them; and as the
      // build-up before a peak lifts the crowd every figure's knees come to, and at its peak all do: 4 turns in CYCLE. Before, they
      // kept every beat as it lifted them, and a raised arm crossed one block 7 and 8 times a second against the stage's apron.
      if (knees > (2 * CYCLE) / SLOW || (pose.rise === 1 && knees !== (2 * CYCLE) / SLOW)) kneed.push(`${name}: ${knees}`);
      // Seated, an arm that holds nothing rests its forearm on its knee, as one that carries nothing does, whatever the figure's way
      // of moving; one that holds a drum or a child's legs stays at them, no hand over its shoulders (a child's legs are at them);
      // the arm that holds a pole or a balloon's string keeps the line it hangs on standing, its hand HOLD_UP further up what it
      // holds and so at least 0.12 over the ground on the level (hanging, 0.03 over, it went 6 cm into a slope beside the figure,
      // #207's text); and the hand that holds a finger, a hat or a tambourine up stays up and does not move of itself, and hangs
      // while the parting holds the figure still.
      if (sits && HELD_UP.includes(prop)) {
        const span = (p: Omit<Pose, "beat">) => Math.max(...[0, 2.6, 5.1].map((beat) => { const h = mean(f, arms2[1].hand, { ...p, beat }), a = mean(f, arms2[1].top, { ...p, beat }); return Math.hypot(h.x - a.x, h.y - a.y, h.z - a.z); }));
        const short = span(pose) / span({ ...pose, sit: 0, rising: 0 });
        if (Math.abs(short - (0.565 - HOLD_UP) / 0.565) > 0.01) raised.push(`${name}, held hand: ${short.toFixed(3)} of its hanging reach`);
        const low = Math.min(...[0, 2.6, 5.1].flatMap((beat) => arms2[1].hand.map((v) => put(f, v, { ...pose, beat }).y)));
        if (low < 0.12) raised.push(`${name}, held hand: ${low.toFixed(3)} over the ground`);
      }
      if (sits) for (const k of [0, 1]) {
        const handUp = ["finger", "aloft", "tambourine"].includes(prop), up = handUp && k === 1 && !held, holds = prop === "rider" || prop === "drum" || (stand === "cup" && k === 1);
        const hangs = (handUp || HELD_UP.includes(prop)) && k === 1;
        const over = Math.max(...[0, 2.6, 5.1].map((beat) => mean(f, arms2[k].hand, { ...pose, beat }).y - mean(f, arms2[k].top, { ...pose, beat }).y));
        const off = Math.max(...[0, 2.6, 5.1].map((beat) => Math.abs(armAngle(f, k, { ...pose, beat }) - (hangs ? hanging : sit === "knees" ? resting : restsAs(sit))[k])));
        if (up ? !(over > 0.4 && swings[1] === 0) : holds ? over > 0.07 : off > 0.02) raised.push(`${name}, ${k === 0 ? "left" : "right"}: ${over.toFixed(3)} over, ${off.toFixed(3)} off, ${swings[k]} turns`);
      }
      // Standing, its feet stay flat on the ground however it leans or bobs, and where they are, but that one who turns on the spot
      // turns them with it, flat, about its own middle.
      if (!sits) for (const beat of [0.3, 1.5, 4.9]) for (const v of feet) {
        const p = put(f, v, { ...pose, beat }), turned = move === "spin" && !held;
        if (Math.abs(p.y - v.y) > 1e-9 || Math.abs(Math.hypot(p.x, p.z) - Math.hypot(v.x, v.z)) > 1e-9 || (!turned && (Math.abs(p.x - v.x) > 1e-9 || Math.abs(p.z - v.z) > 1e-9))) { lifted.push(name); break; }
      }
    }
    // What is carried moves of itself no faster: each flag's free edge, a streamer's tails and what stands on a pole, a balloon and
    // the top of a bunch, and a hoop's rim, each against the figure's own neck in its body's frame, go back on their way no more than
    // 4 times in CYCLE counts, whichever way the figure moves.
    const ofForm = (bit: number, form: number) => rich.filter((v) => v.mark.y === bit && formOfMark(v.mark.z) === form);
    const own2: [string, Vertex][] = [
      ...FORMS.FLAG.map((_, form): [string, Vertex] => [POLED[form], ofForm(PART.FLAG, form).reduce((a, b) => (b.mark.w > a.mark.w ? b : a))]),
      ...["balloon", "bunch"].map((prop, form): [string, Vertex] => [prop, ofForm(PART.BALLOON, form).reduce((a, b) => (b.y > a.y ? b : a))]),
      ["hoop", rich.filter((v) => v.mark.y === PART.HOOP).reduce((a, b) => (b.x > a.x ? b : a))]];
    for (const [prop, probe] of own2) for (const move of MOVES as string[]) for (const [state, pose] of STATES.slice(0, 5)) {
      const f = carrying(prop, move), most = backs(through.map((beat) => { const at = { ...pose, beat }, p = { ...put(f, probe, at) }, body = bodyFrame(f, at); return body.in([p.x - body.from.x, p.y - body.from.y, p.z - body.from.z]); }));
      if (most > (2 * CYCLE) / SLOW) slow.push(`${prop} itself, ${move}, ${state}: ${most}`);
    }
    expect(looked).toBe((18 * 8 + 13 * 4 + 6 * 2) * 7);
    expect(slow).toEqual([]);
    expect(still).toEqual([]);
    expect(kneed).toEqual([]);
    expect(raised).toEqual([]);
    expect([...new Set(lifted)]).toEqual([]);
    // And the rules bite: a seated forearm rests well forward of hanging, a drummer's hands do tap, each once in two counts, a finger
    // is held up, and one that bobs bends its knees once in four counts whatever it carries.
    for (const k of [0, 1]) expect(resting[k] - hanging[k]).toBeGreaterThan(0.4);
    expect([0, 1].map((k) => armTurns(carrying("drum", "bob"), k, { dance: 1.2 }, through))).toEqual([8, 8]);
    expect(mean(carrying("finger", "watch"), arms2[1].hand, { beat: 0, dance: 1.2 }).y).toBeGreaterThan(TALL);
    for (const prop of CARRIED) expect([prop, kneeTurns(carrying(prop, "bob"), { dance: 1.2 }, through)]).toEqual([prop, 4]);
  }, 60000);

  it("joins each limb to the body with no gap, in every stance, standing and seated, at every build: an arm turns inside its shoulder, a leg's closed top rides the hips, and an elbow or a knee bends at one ring its two halves share", () => {
    // The builds at the ends of what people() deals (girth, shoulders, legs, head: aBody): the standard figure's, the slightest's on
    // the shortest legs, the stoutest's on the longest, the broadest's, a pear's, and a child's, its head the largest.
    const BUILDS: Vec[] = [{ x: 1, y: 1, z: 1, w: 1 }, { x: 0.82, y: 0.8, z: 0.93, w: 0.95 }, { x: 1.6, y: 1.04, z: 1.07, w: 1.05 }, { x: 1.12, y: 1.04, z: 1, w: 1 },
      { x: 1.4, y: 0.8, z: 0.93, w: 1 }, { x: 1.05, y: 0.88, z: 0.86, w: 1.32 }];
    // Every way of standing with a way of moving that leaves its arms to it and one that shifts its weight, every way of sitting, and
    // a clap and a spin, which move the arms and the hips the most.
    const ROWS: [string, string, string][] = [...(STANDS as string[]).flatMap((stand) => ["watch", "shift"].map((m) => [m, stand, "knees"] as [string, string, string])),
      ...(SITS as string[]).map((sit) => ["bob", "square", sit] as [string, string, string]), ["clap", "square", "knees"], ["spin", "square", "knees"], ["sway", "square", "knees"]];
    const at = (x: number, y: number, rig: number, tint: number): Vertex => ({ x, y, z: 0, mark: { x: rig, y: 0, z: tint, w: 0 } });
    const where = (f: Figure, v: Vertex, pose: Pose) => { const p = put(f, v, pose); return [p.x, p.y, p.z]; };
    const apart = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const beats = through.filter((_, k) => k % 10 === 0);
    let shoulder = 0, hip = 0, looked = 0;
    for (const body of BUILDS) for (const [move, stand, sit] of ROWS) for (const [, pose] of STATES) {
      const f = { ...carrying("none", move, { stance: { stand, sit } }), body };
      looked += 1;
      for (const beat of beats) for (const k of [0, 1]) {
        const side = 2 * k - 1, now = { ...pose, beat };
        // The arm turns about the middle of its shoulder's ball, part of the body, and its open top stays inside the ball, 0.064 round.
        const ball = where(f, at(side * SHOULDER_X, SHOULDER_Y, RIG.BODY, TINT.TOP), now);
        for (const v of arms2[k].top) shoulder = Math.max(shoulder, apart(where(f, v, now), ball));
        // The leg turns about its hip, where the body's own point there goes: its top's middle, widened by the build as the shader
        // widens a leg, and the body's at that height, which the build's belly widens.
        const thick = 1 + 0.5 * (body.x - 1), belly = 1 + (body.x - 1) * clamp(1 - Math.abs(LEG - 1.02) / 0.4, 0, 1);
        const top = where(f, at(side * HIP_X, LEG, RIG.LEG, TINT.LEGS), now), hips = where(f, at((side * HIP_X * (0.5 + 0.5 * thick)) / belly, LEG, RIG.BODY, TINT.LEGS), now);
        hip = Math.max(hip, apart(top, hips));
      }
    }
    // A limb's colour changes at one ring of its one tube, the faces over it and those under it each in their own colour sharing its
    // corners, so nothing opens between them: on a desktop at the sleeve's and the shorts' hems, and the elbow and the knee, which the
    // shader bends and mitres, are each one colour, the forearm's and the shin's; on a phone and a television, which leave those hems
    // out, at the elbow and the knee. The band under a hem's ring was its cloth's, and the cloth ended at the joint, under the hem.
    const bend = (rigs: number[], y: number, geo = crowd.figure) => {
      const position = geo.getAttribute("position"), marked = geo.getAttribute("aMark"), tints = new Map<string, Set<number>>();
      for (let i = 0; i < position.count; i++) {
        if (!rigs.includes(marked.getX(i)) || marked.getY(i) !== 0 || Math.abs(position.getY(i) - y) > 1e-6) continue;
        const key = [position.getX(i), position.getZ(i)].map((c) => c.toFixed(5)).join();
        if (!tints.has(key)) tints.set(key, new Set());
        tints.get(key)!.add(marked.getZ(i) % TINTS);
      }
      return [...tints.values()].map((set) => [...set].sort((a, b) => a - b).join());
    };
    const [, [sleeveHem], [elbow]] = ARM_RINGS, [, [shortsHem]] = LEG_RINGS;
    expect(bend([3, 4], SHOULDER_Y - sleeveHem)).toEqual(Array(12).fill(`${TINT.TOP},${TINT.FOREARM}`));
    expect(bend([1], shortsHem)).toEqual(Array(12).fill(`${TINT.LEGS},${TINT.SHIN}`));
    expect(bend([3, 4], SHOULDER_Y - elbow)).toEqual(Array(12).fill(`${TINT.FOREARM}`));
    expect(bend([1], LEG / 2)).toEqual(Array(12).fill(`${TINT.SHIN}`));
    expect(bend([3, 4], SHOULDER_Y - elbow, phone.figure)).toEqual(Array(10).fill(`${TINT.TOP},${TINT.FOREARM}`));
    expect(bend([1], LEG / 2, phone.figure)).toEqual(Array(12).fill(`${TINT.LEGS},${TINT.SHIN}`));
    expect(looked).toBe(BUILDS.length * ROWS.length * STATES.length);
    // An arm's top stays inside its shoulder's ball, 0.064 round, in every pose: its top ring is 0.056 round, and turns about the ball's
    // middle.
    expect(shoulder).toBeLessThan(0.058);
    // As a figure sways or shifts its weight its hips ride up on its legs, by 4 cm at the most, the stoutest dancing hardest: less than
    // the 5.5 cm a leg's closed top stands into the hips over their seat (LEG_RINGS, TORSO), so no seat comes off its legs.
    expect([hip > 0.03, hip < LEG_RINGS[0][0] - TORSO[TORSO.length - 1].y - 0.01]).toEqual([true, true]);
  }, 120000);

  it("fits what a figure wears to it, on a desktop and a phone: a coat's tail comes out of the torso and hangs outside both thighs in every stance, standing and seated, dancing and still; a hood lies round the neck from inside one shoulder to inside the other; and a fringe hangs from a poncho's hem", () => {
    // The joins test above reads the arms, the legs and the torso; these are the garments the figure was given with them, which hang
    // off it. Where the torso is: its rings (TORSO, those its tier keeps), each a loop of corners round it, and between two of them the
    // loop of each pair of corners at one turn round it; and how far a point stands inside its faces (+) or outside them (-).
    const torsoOf = (geo: typeof crowd.figure) => {
      const position = geo.getAttribute("position"), marked = geo.getAttribute("aMark"), body = (i: number) => marked.getX(i) === RIG.BODY && marked.getY(i) === 0;
      const at = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)], tenth = (q: number) => Math.round(q * 1e4) / 1e4 + 0;
      const heights = (TORSO as { y: number }[]).map(({ y }) => y).filter((y) => Array.from({ length: position.count }, (_, i) => i).some((i) => body(i) && Math.abs(position.getY(i) - y) < 1e-6));
      const rings = heights.map((y) => {
        const seen = new Map<string, number[]>();
        for (let i = 0; i < position.count; i++) {
          // Each ring's own corners, but the middle of the cap under the hips.
          if (body(i) && Math.abs(position.getY(i) - y) < 1e-6 && Math.hypot(position.getX(i), position.getZ(i)) > 0.01) seen.set(`${tenth(position.getX(i))} ${tenth(position.getZ(i))}`, at(i));
        }
        return [...seen.values()].sort((a, b) => Math.atan2(a[0], a[2]) - Math.atan2(b[0], b[2]));
      });
      const faces: number[][][] = [];
      for (let i = 0; i < position.count; i += 3) if (body(i) && [0, 1, 2].every((j) => heights.some((y) => Math.abs(position.getY(i + j) - y) < 1e-6))) faces.push([at(i), at(i + 1), at(i + 2)]);
      const onFace = (p: number[], [a, b, c]: number[][]) => {
        const ab = a.map((q, j) => b[j] - q), ac = a.map((q, j) => c[j] - q), n = unit3(cross3(ab, ac)), d = dot3(n, a.map((q, j) => p[j] - q));
        const flat = p.map((q, j) => q - d * n[j]), inFace = [[a, b], [b, c], [c, a]].every(([u, v]) => dot3(cross3(v.map((q, j) => q - u[j]), flat.map((q, j) => q - u[j])), n) >= 0);
        const toEdge = (u: number[], v: number[]) => { const e = v.map((q, j) => q - u[j]), t = clamp(dot3(e, p.map((q, j) => q - u[j])) / dot3(e, e), 0, 1); return Math.hypot(...p.map((q, j) => q - u[j] - t * e[j])); };
        return inFace ? Math.abs(d) : Math.min(toEdge(a, b), toEdge(b, c), toEdge(c, a));
      };
      const inside = (p: number[]) => {
        const k = heights.findIndex((y, j) => j + 1 < heights.length && y >= p[1] && heights[j + 1] <= p[1]);
        if (k < 0) return false;
        const t = (p[1] - heights[k + 1]) / (heights[k] - heights[k + 1]), loop = rings[k].map((q, j) => [rings[k + 1][j][0] + (q[0] - rings[k + 1][j][0]) * t, rings[k + 1][j][2] + (q[2] - rings[k + 1][j][2]) * t]);
        return inLoop([p[0], p[2]], loop);
      };
      expect(rings.every((ring) => ring.length === rings[0].length)).toBe(true);
      return (p: number[]) => (inside(p) ? 1 : -1) * Math.min(...faces.map((face) => onFace(p, face)));
    };
    const coat = (FORMS.SKIRT as string[]).indexOf("coat"), fringed = (FORMS.PONCHO as string[]).indexOf("fringed"), HOOD = PART.HOOD as number, PONCHO = PART.PONCHO as number;
    const xyz = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z], beats = through.filter((_, k) => k % 20 === 0);
    for (const [tier, verts, geo, of] of [["desktop", rich, crowd.figure, "desktop"], ["phone", plain, phone.figure, "phone"]] as const) {
      const into = torsoOf(geo);
      // A coat's tail: its top ring, at the ribs, inside the torso, so that the tail comes out of the shirt the coat is; each ring
      // under the one over it as a figure stands; and every corner of its rings from the hips down, at the hips (LEG, under the
      // thighs' closed tops), at the thigh and at its hem, outside both thighs, as every coat wearer of three shows'
      // crowds stands, and sat each way of sitting, in the joins test's poses at eight beats of each, dancing, rising and still. On
      // level ground (aFig.w, aPlace.w): a slope moves each corner of the coat and of the thigh alike, by where it is, which keeps the
      // one outside the other but bends the planes this tells inside by.
      const tail = verts.filter((v) => v.mark.y === PART.SKIRT && formOfMark(v.mark.z) === coat);
      const ribs = tail.filter((v) => v.y > LEG + 0.01), under = tail.filter((v) => v.y < LEG + 0.01), heights = [...new Set(tail.map((v) => v.y))].sort((a, b) => b - a);
      expect([tier, heights.length, ribs.length > 5]).toEqual([tier, 4, true]);
      // And the cloth between those rings, not only their corners: three points down each edge from a ring of the tail to the one
      // under it, where the faces between the corners stand as the shader poses them.
      const ringOf = (y: number) => [...new Map(tail.filter((v) => v.y === y).map((v) => [`${v.x} ${v.z}`, v])).values()].sort((a, b) => Math.atan2(a.x, a.z) - Math.atan2(b.x, b.z));
      const down = heights.slice(1).map(ringOf), edges = down.slice(1).flatMap((lower, k) => lower.map((v, j) => [down[k][j], v]));
      expect([tier, down.every((ring) => ring.length > 5 && ring.length === down[0].length)]).toEqual([tier, true]);
      for (const v of ribs) expect([tier, "coat's top", v.x, into(xyz(v)) > 0.005]).toEqual([tier, "coat's top", v.x, true]);
      // Each thigh's rings from the hips down to the knee (LEG_RINGS, those its tier keeps), each a loop of corners in one order round
      // it; but at the knee, whose ring the vertex shader mitres between the thigh and the shin as it bends the knee, the ring the
      // thigh has just over it, unbent: the knee's corners a little of the way up to the ring over them, at 0.52 of the leg. The
      // shader stands all of these in parallel planes, which hold the leg's breadth, as it lays the thigh along its length.
      const unbent = 0.52 * LEG;
      const thighRings = [-1, 1].map((side) => {
        const leg = verts.filter((v) => v.mark.x === RIG.LEG && v.mark.y === 0 && side * v.x > 0 && Math.hypot(v.x - side * HIP_X, v.z) > 0.01);
        const ring = (y: number) => leg.filter((v) => Math.abs(v.y - y) < 1e-4).sort((a, b) => Math.atan2(a.x - side * HIP_X, a.z) - Math.atan2(b.x - side * HIP_X, b.z));
        const rings = (LEG_RINGS as number[][]).map(([y]) => ring(y)).filter((r, k) => r.length > 0 && LEG_RINGS[k][0] > LEG / 2 - 1e-4);
        const [over, knee] = rings.slice(-2), up = (unbent - knee[0].y) / (over[0].y - knee[0].y);
        return [...rings.slice(0, -1), knee.map((v, j) => ({ ...v, x: v.x + (over[j].x - v.x) * up, y: unbent, z: v.z + (over[j].z - v.z) * up }))];
      });
      expect([tier, thighRings.every((rings) => rings.length >= 2 && rings.every((r) => r.length >= 6 && r.length === rings[0].length))]).toEqual([tier, true]);
      // Whether a point is inside a thigh: between two of its rings as posed, in the plane parallel to theirs through it, inside the
      // loop that runs there from the one to the other.
      const middle = (ring: number[][]) => [0, 1, 2].map((j) => ring.reduce((sum, q) => sum + q[j], 0) / ring.length);
      const inThigh = (p: number[], rings: number[][][]) => rings.slice(1).some((lower, k) => {
        const upper = rings[k], a = middle(upper), b = middle(lower);
        const n = unit3(upper.reduce((sum, q, j) => cross3(sub(q, a), sub(upper[(j + 1) % upper.length], a)).map((w, m) => sum[m] + w), [0, 0, 0]));
        const s = dot3(n, sub(p, a)) / dot3(n, sub(b, a));
        if (!(s >= 0 && s <= 1)) return false;
        const loop = upper.map((q, j) => q.map((w, m) => w + (lower[j][m] - w) * s)), c = a.map((w, m) => w + (b[m] - w) * s);
        const e1 = unit3(sub(loop[0], c)), e2 = cross3(n, e1), flat = (q: number[]) => [dot3(sub(q, c), e1), dot3(sub(q, c), e2)];
        return inLoop(flat(p), loop.map(flat));
      });
      // And how far a point outside a thigh stands off it, in that plane, where it stands between two of its rings.
      const offThigh = (p: number[], rings: number[][][]) => Math.min(...rings.slice(1).map((lower, k) => {
        const upper = rings[k], a = middle(upper), b = middle(lower);
        const n = unit3(upper.reduce((sum, q, j) => cross3(sub(q, a), sub(upper[(j + 1) % upper.length], a)).map((w, m) => sum[m] + w), [0, 0, 0]));
        const s = dot3(n, sub(p, a)) / dot3(n, sub(b, a));
        if (!(s >= 0 && s <= 1)) return Infinity;
        const loop = upper.map((q, j) => q.map((w, m) => w + (lower[j][m] - w) * s)), c = a.map((w, m) => w + (b[m] - w) * s);
        const e1 = unit3(sub(loop[0], c)), e2 = cross3(n, e1), flat = (q: number[]) => [dot3(sub(q, c), e1), dot3(sub(q, c), e2)], [px, pz] = flat(p);
        return Math.min(...loop.map(flat).map((u, j, all) => {
          const w = all[(j + 1) % all.length], ex = w[0] - u[0], ez = w[1] - u[1], t = clamp(((px - u[0]) * ex + (pz - u[1]) * ez) / (ex * ex + ez * ez), 0, 1);
          return Math.hypot(px - u[0] - t * ex, pz - u[1] - t * ez);
        }));
      }));
      // Seated, a coat's tail lies over the thighs before the hips (COAT_SAT): of its corners there and the cloth between them, the
      // nearest a thigh in each pose stands 7 mm to 7 cm off it. Laid 0.3 flatter before, it came within 5 mm of one; as flat as a
      // skirt, into them.
      const before = [...under.filter((v) => v.z > 0.01).map((v) => [v, v, 0] as const), ...edges.filter(([u, l]) => u.z > 0.01 && l.z > 0.01).flatMap(([u, l]) => [0.25, 0.5, 0.75].map((q) => [u, l, q] as const))];
      let nearest = Infinity, farthest = 0;
      const wearers = SHOWS.flatMap(({ [of]: c }) => figuresOf(c)).filter((f) => carries(f, PART.SKIRT as number, coat));
      expect([tier, wearers.length > 20, before.length > 10]).toEqual([tier, true, true]);
      let posed = 0, flattest = 0, pressed = 0;
      const inside: string[] = [];
      for (const one of wearers) for (const sat of [-1, ...SITS.map((_, k) => k)]) {
        const level = { ...one, fig: { ...one.fig, w: 0 }, place: { ...(one.place ?? flat), w: 0 } };
        const f = sat < 0 ? level : { ...level, fig: { ...level.fig, x: 1 }, wear: { ...one.wear, y: (one.wear.y % 262144) + 262144 * sat } };
        for (const [name, state] of STATES) for (const beat of beats) {
          const pose = { ...state, beat }, at = (v: Vertex) => xyz(put(f, v, pose));
          if (f.fig.x <= 0.5 && !state.sit) {
            const fall = heights.map((y) => { const ring = tail.filter((v) => v.y === y).map((v) => at(v)[1]); return ring.reduce((sum, q) => sum + q, 0) / ring.length; });
            expect([tier, f.i, fall.every((y, k) => k === 0 || y < fall[k - 1])]).toEqual([tier, f.i, true]);
          }
          // Each ring as posed lies in its plane, to a millimetre and a half, as far as the ground holds a seated figure's hip up out of
          // it; but a kneeling figure's knee, which the shader presses onto the ground as far as each corner of it is near it, bends it.
          const kneeling = (f.fig.x > 0.5 || state.sit) && SITS[Math.floor(f.wear.y / 262144)] === "kneel";
          const posedThighs = thighRings.map((rings) => rings.map((ring) => ring.map(at)));
          if (f.fig.x > 0.5 || state.sit) {
            const off = Math.min(...before.map(([u, l, q]) => { const a = at(u), b = at(l); return Math.min(...posedThighs.map((rings) => offThigh(a.map((w, m) => w + (b[m] - w) * q), rings))); }));
            if (off < Infinity) { nearest = Math.min(nearest, off); farthest = Math.max(farthest, off); }
          }
          for (const posedRings of posedThighs) {
            for (const ring of posedRings) {
              const c = middle(ring), n = unit3(cross3(sub(ring[0], c), sub(ring[2], c))), off = Math.max(...ring.map((q) => Math.abs(dot3(n, sub(q, c)))));
              if (kneeling) pressed = Math.max(pressed, off);
              else flattest = Math.max(flattest, off);
            }
            for (const v of under) if (inThigh(at(v), posedRings)) inside.push(`${f.i} ${sat < 0 ? "as dealt" : SITS[sat]} ${name} ${beat.toFixed(2)}: ${v.x.toFixed(3)} ${v.y.toFixed(2)} ${v.z.toFixed(3)}`);
            for (const [upper, lower] of edges) {
              const a = at(upper), b = at(lower);
              for (const s of [0.25, 0.5, 0.75]) if (inThigh(a.map((q, m) => q + (b[m] - q) * s), posedRings)) inside.push(`${f.i} ${sat < 0 ? "as dealt" : SITS[sat]} ${name} ${beat.toFixed(2)}: ${s} of ${upper.x.toFixed(3)} ${upper.y.toFixed(2)} ${upper.z.toFixed(3)} to ${lower.y.toFixed(2)}`);
            }
          }
          posed += 1;
        }
      }
      expect([tier, posed > 1000, flattest < 0.0015, pressed < 0.02, inside.slice(0, 20), inside.length]).toEqual([tier, true, true, true, [], 0]);
      expect([tier, nearest > 0.007, farthest < 0.07]).toEqual([tier, true, true]);
      const position = geo.getAttribute("position"), marked = geo.getAttribute("aMark"), corner = (i: number): Vertex => ({ x: position.getX(i), y: position.getY(i), z: position.getZ(i), mark: vec(marked, i) });
      // A hood (HOOD_ROPE): each end ring inside the shoulder it lies on, its point and every corner; and each ring between, over the
      // shoulders and round the back of the neck, on them, a corner of it touching them, and not through them, its point outside and
      // no corner 2 cm into them; and no thicker, from its deepest corner to its farthest, than the neck is broad at its foot (TORSO),
      // as a roll of cloth lies round it. At rest, as the hood's corners and the torso's go together with the body (RIG.BODY) and the
      // shoulders' breadth. (A hood's middle ring 9 cm round went 3 to 4 cm into the neck and stood 15 cm thick.)
      const hood = verts.filter((v) => v.mark.y === HOOD), { points, radii } = HOOD_ROPE as { points: number[][]; radii: number[] };
      points.forEach((point, k) => {
        const depth = hood.filter((v) => Math.abs(Math.hypot(v.x - point[0], v.y - point[1], v.z - point[2]) - radii[k]) < 1e-4).map((v) => into(xyz(v)));
        expect([tier, k, depth.length >= 4]).toEqual([tier, k, true]);
        if (k === 0 || k === points.length - 1) expect([tier, k, into(point) > 0, Math.min(...depth) > 0]).toEqual([tier, k, true, true]);
        else expect([tier, k, into(point) < 0, Math.max(...depth) > 0, Math.max(...depth) < 0.02, Math.max(...depth) - Math.min(...depth) < 2 * (TORSO as { rx: number }[])[1].rx]).toEqual([tier, k, true, true, true, true]);
      });
      // A fringe: each tongue's two top corners on the poncho's hem, between two of the hem's corners, wherever the figure's build
      // and a shawl's raised hem put them; and its tip hanging a centimetre or more under the middle of them, though seated the hem
      // tips with the figure, one of its tops 6 cm under the other. Every fringed poncho's wearer of three shows' crowds, at rest.
      const tongues: Vertex[][] = [];
      for (let i = 0; i < position.count; i += 3) {
        const [a, tip, b] = [corner(i), corner(i + 1), corner(i + 2)];
        if (a.mark.y !== PONCHO || formOfMark(a.mark.z) !== fringed) continue;
        if (Math.abs(tip.x - (a.x + b.x) / 2) < 1e-5 && Math.abs(tip.z - (a.z + b.z) / 2) < 1e-5 && tip.y < (a.y + b.y) / 2 - 0.01) tongues.push([a, tip, b]);
      }
      const hem = verts.filter((v) => v.mark.y === PONCHO && formOfMark(v.mark.z) === fringed && v.y < 1.3 && !tongues.some(([, tip]) => tip.x === v.x && tip.y === v.y && tip.z === v.z));
      const ponchos = SHOWS.flatMap(({ [of]: c }) => figuresOf(c)).filter((f) => carries(f, PONCHO, fringed));
      expect([tier, tongues.length >= 16, hem.length >= 8, ponchos.length > 5]).toEqual([tier, true, true, true]);
      let furthest = 0;
      for (const f of ponchos) {
        const still = { beat: 0, dance: 0, still: 1 }, loop = hem.map((v) => xyz(put(f, v, still))).sort((p, q) => Math.atan2(p[0], p[2]) - Math.atan2(q[0], q[2]));
        const offHem = (p: number[]) => Math.min(...loop.map((u, j) => { const w = loop[(j + 1) % loop.length], e = sub(w, u), t = dot3(e, e) > 0 ? clamp(dot3(e, sub(p, u)) / dot3(e, e), 0, 1) : 0; return Math.hypot(...p.map((q, k) => q - u[k] - t * e[k])); }));
        for (const [a, tip, b] of tongues) {
          const [pa, pt, pb] = [a, tip, b].map((v) => xyz(put(f, v, still)));
          furthest = Math.max(furthest, offHem(pa), offHem(pb));
          expect([tier, f.i, pt[1] < (pa[1] + pb[1]) / 2 - 0.01]).toEqual([tier, f.i, true]);
        }
      }
      expect([tier, furthest < 0.002]).toEqual([tier, true]);
    }
  }, 240000);

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
    // The reaches are held for each figure of two crowds as its own way of moving has it. Here the 97 figures that carry a prop on
    // each of 1986-07-04, 1970-08-30 and 1990-12-09 (of 292, one in PROP_EVERY), and those that hold a cup, each made to move every one of the eight ways in turn
    // (a cup is held in a stance only one whose way of moving leaves its arms to it takes, so this goes past any crowd), at its own fitted
    // size: a rider's carrier's hands, kept at the child's legs while the parting holds it still, first reached past its hanging
    // arms here and on no figure of the two crowds.
    const carriers = SHOWS.flatMap(({ desktop }) => figuresOf(desktop).filter((f) => rich.some((v) => v.mark.y >= (PART.POLE as number) && v.mark.y !== PART.HOOD && wears(f, v))));
    const cups = carriers.filter((f) => rich.some((v) => v.mark.y === PART.CUP && wears(f, v))).length;
    expect([carriers.length - cups, cups > 20]).toEqual([3 * Math.floor(292 / PROP_EVERY), true]);
    const most = { wide: 0, top: 0, hang: 0, sat: 0 };
    for (const own2 of carriers) for (const move of MOVES as string[]) {
      const f = { ...own2, wear: { ...own2.wear, y: own2.wear.y - (own2.wear.y % 8) + MOVES.indexOf(move) } }, worn = rich.filter((v) => wears(f, v));
      for (const v of worn) {
        for (const beat of [0.13, 1.1, 2.6, 3.9, 5.2, 6.4, 7.7]) for (const pose of [{ dance: 1.6 }, { dance: 1.6, rise: 0.5 }, { dance: 1.6, rise: 1 }]) {
          const p = put(f, v, { ...pose, beat });
          most.wide = Math.max(most.wide, f.across * Math.hypot(p.x, p.z)); most.top = Math.max(most.top, f.up * p.y);
        }
        // Held still, its arms hang, as one standing does; one that sits where it is seated (aFig.x) sits still with its feet out
        // before it and its knees apart, as far as the seated reach (KNEES) lets them, and never stands to hang its arms.
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
    expect(most.sat).toBeLessThanOrEqual(KNEES * BIG);
    expect(most.top).toBeGreaterThan(0.97 * TOP * BIG);
  }, 60000);

  it("swings no arm out and back more than once in four counts but a clap's, before its chest, in two; bends no figure's knees more than once in four; and keeps a clap inside the figure's own outline", () => {
    // The old flash bar counted a block's swings in brightness, and a thin limb that passes over lit ground or the stage swings each block
    // on its way twice as it goes and twice as it comes back. Main's arms did that on every beat: 9 and 10 swings a second at one
    // block from the stage's pose in Drums, by render; and a bob's knees on every beat carried a raised arm across one block 7 and 8
    // times a second at a peak. So every arm and every figure's knees here keep to a cycle of SLOW counts, held between (band.js), and
    // a figure that claps does it on every other count and before its chest, where its own body covers it. Over CYCLE counts, standing
    // and dancing at the dance's middle: how far each arm stands out from hanging, by its hand from its shoulder, and how high the
    // hips stand.
    expect([arms2[0].top.length, arms2[0].hand.length, neck.length, seat.length].every((n) => n >= 6)).toBe(true);
    const beats = Array.from({ length: 641 }, (_, k) => 0.2 + (k * CYCLE) / 640);
    const swung: Record<string, number[]> = {};
    for (const move of MOVES as string[]) {
      const f = figureOf(move);
      swung[move] = [...[0, 1].map((k) => armTurns(f, k, { dance: 1.2 }, beats)), kneeTurns(f, { dance: 1.2 }, beats)];
    }
    // Each turn is half a swing: 4 in CYCLE counts is once out and back in four counts, 8 in two.
    expect(swung.bob).toEqual([4, 4, 4]);
    expect(swung.wave.slice(0, 2)).toEqual([4, 4]);
    expect(swung.spin.slice(0, 2)).toEqual([4, 4]);
    expect(swung.nod.slice(0, 2)).toEqual([0, 0]);
    expect(swung.watch.slice(0, 2)).toEqual([0, 0]);
    expect(swung.clap.slice(0, 2)).toEqual([8, 8]);
    for (const move of ["sway", "wave", "spin", "nod", "clap", "watch"]) {
      expect([move, Math.max(swung[move][0], swung[move][1]) <= (move === "clap" ? 8 : 4)]).toEqual([move, true]);
      expect([move, swung[move][2] <= 4]).toEqual([move, true]);
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
    // (The arm's top ring is 0.056 round, and stands out past the pivot by 0.0485 at its widest corner.)
    expect(wide).toBeGreaterThan(0.045);
    expect(high).toBeLessThan(0.07);
  });

  it("moves each figure on its own count as band.js moves the band: every move holds, goes at an even pace over a quarter of its counts and arrives on a count, once in SLOW counts, the turn in twice that, and the hands before the chest in STRUM", () => {
    // From the stage at a peak a raised arm bobbed on every count across one block of the lit apron, which counted 7 and 8 swings in
    // a second there, by render (scripts/flash): the class band.js keeps the band out of. So the crowd's moves are band.js's own
    // (swing): the shader's count terms, run here, are swing's at every 1/40 of a count through CYCLE, for figures of each count of
    // four; they are the only terms the count reaches; and swing itself holds, goes at an even pace and arrives on a count.
    expect(dance.match(/\buBeat\b/g)).toHaveLength(1);
    const at = dance.indexOf("float own ="), timing = asJs(`${dance.slice(at, dance.indexOf("float spin =", at))}\nreturn [own, stride, turned, slow, bounce, fling];`) as unknown as (...reads: unknown[]) => number[];
    const own0 = (y: number) => 0.12 * y - Math.floor(4 * ((5.3 * y) % 1));
    let looked = 0, worst = 0;
    const counts = new Set<number>();
    for (const y of [0, 0.13, 0.37, 0.52, 0.81, 0.97]) for (let k = 0; k <= 40 * CYCLE; k++) {
      const beat = k / 40, got = timing(...READS.map((name) => (name === "aFig" ? { x: 0, y, z: 0, w: 0 } : name === "uBeat" ? beat : undefined))), own = got[0];
      counts.add(Math.round(own - beat - 0.12 * y));
      const want = [beat + own0(y), swing(own, SLOW, SLOW / 4), swing(own, 2 * SLOW, SLOW / 2), 0.5 + 0.5 * swing(own, STRUM, STEP), 0.5 + 0.5 * swing(own, SLOW, SLOW / 4), 1 - Math.abs(swing(own, 2 * SLOW, SLOW / 2))];
      worst = Math.max(worst, ...want.map((w, i) => Math.abs(w - got[i])));
      looked += 1;
    }
    expect(looked).toBe(6 * (40 * CYCLE + 1));
    expect(worst).toBeLessThan(1e-9);
    // Each figure keeps its own count of four, a whole number of counts from the band's (within JITTER), and the crowd has all four.
    expect([...counts].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0]);
    // And swing: over a cycle of `per` counts at 1/80 of a count, it holds at 1 or -1 for all but twice `move` counts, goes between
    // them at one even pace, and arrives at each end on a count.
    for (const [per, move] of [[SLOW, SLOW / 4], [2 * SLOW, SLOW / 2], [STRUM, STEP]]) {
      const n = 80 * per, xs = Array.from({ length: n + 1 }, (_, k) => swing(k / 80, per, move)), held = xs.slice(0, n).filter((v) => Math.abs(v) === 1).length;
      expect(held / 80).toBeCloseTo(per - 2 * move, 1);
      const steps = xs.slice(1).map((v, k) => v - xs[k]).filter((d) => Math.abs(d) > 1e-12);
      expect(Math.max(...steps.map((d) => Math.abs(Math.abs(d) - 2 / (80 * move))))).toBeLessThan(1e-9);
      expect([0, per / 2, per].map((c) => swing(c, per, move))).toEqual([1, -1, 1]);
      expect(swing(per / 2 - 1e-9, per, move)).toBeGreaterThan(-1);
    }
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
    expect(looked).toBeGreaterThan(8e4);
    expect(over).toBe(0);
  });

  it("claps before its chest on every other count, waves both arms one way, sways from the hips, turns a skirt out, folds its arms to nod, and stands with its hands on its hips", () => {
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
    // Turning: the figure faces well round to each side in turn, over eight counts, and its skirt's hem stands further out as it
    // turns than as it holds before it turns back.
    const spin = figure("spin", 0, PART.SKIRT as number), nose = rich.filter((v) => v.mark.x === 6 && v.mark.y === 0).reduce((a, b) => (b.z > a.z ? b : a));
    const faces = [2, 6].map((beat) => at2(spin, nose, { beat, dance: 1 }));
    expect(faces[0].x * faces[1].x).toBeLessThan(0);
    expect(Math.abs(Math.atan2(faces[0].x, faces[0].z))).toBeGreaterThan(1.5);
    expect(Math.abs(Math.atan2(faces[0].x, faces[0].z))).toBeLessThan(2.2);
    // A coat's tail is the skirt's second form, and takes the skirt's flare as it turns: so each of them, the skirt and the coat.
    for (const form of [0, (FORMS.SKIRT as string[]).indexOf("coat")]) {
      const wearer = { ...spin, forms: { [PART.SKIRT]: form }, cut: { ...spin.cut, y: form === 0 ? spin.cut.y : 0.65 } }, skirtOf = (vs: Vertex[]) => vs.filter((v) => v.mark.y === PART.SKIRT && formOfMark(v.mark.z) === form);
      const hemAt = (beat: number) => Math.max(...skirtOf(rich).filter((v) => v.y < 0.2).map((v) => { const p = put(wearer, v, { beat, dance: 1 }); return Math.hypot(p.x, p.z); }));
      expect([form, hemAt(3) > 1.3 * hemAt(1), Math.abs(hemAt(1) - hemAt(5)) < 1e-4]).toEqual([form, true, true]);
      // And a long skirt's hem rises as it goes out, but every skirt's hem stays under its ring at the knee, at every length a skirt
      // is cut to, turning or bobbing at the dance's height: at each point round it, more than 0.6 of as far under that ring as it
      // hangs standing still, or of 1.5 cm (a bent knee draws the two together). A dress's hem, a few centimetres under that ring,
      // rose past it as it flared and folded the skirt up over itself; and one a centimetre under it, tipped with the shin, stood
      // over it. A coat is hemmed 0.58 to 0.72 of the legs (WARDROBE), over the knee: its hem stays under its ring at the thigh the
      // same way at every length it is cut to; and only a long skirt's hem rises as it flares.
      const ring = (low: number, high: number) => skirtOf(rich).filter((v) => v.y >= low && v.y < high);
      const [hemRing, kneeRing] = [ring(-1, 0.2), ring(0.2, 0.6)], ys = (f: Figure, vs: Vertex[], pose: Pose) => vs.map((v) => put(f, v, pose).y);
      const gap = (f: Figure, pose: Pose) => { const h = ys(f, hemRing, pose); return Math.min(...ys(f, kneeRing, pose).map((y, k) => y - h[k])); };
      expect([form, hemRing.length > 5, hemRing.length === kneeRing.length]).toEqual([form, true, true]);
      expect(Math.max(...kneeRing.map((v, k) => Math.abs(Math.atan2(v.x, v.z) - Math.atan2(hemRing[k].x, hemRing[k].z))))).toBeLessThan(0.01);
      let least = Infinity, rose = 0;
      const hems = form === 0 ? [0.093, 0.18, 0.42, 0.45, 0.48, 0.495, 0.5, 0.53, 0.56, 0.62, 0.72] : [0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72];
      for (const move of ["spin", "bob"]) for (const hem of hems) for (let beat = 0; beat < 8; beat += 1) {
        const cut = { ...figure(move, 0, PART.SKIRT as number), forms: { [PART.SKIRT]: form }, cut: { ...spin.cut, y: hem } }, still = gap(cut, { beat, dance: 0 });
        expect([form, hem, still > 0]).toEqual([form, hem, true]);
        least = Math.min(least, gap(cut, { beat, dance: 1.6 }) / Math.min(still, 0.015));
        if (hem < 0.2) rose = Math.max(rose, Math.max(...ys(cut, hemRing, { beat, dance: 1.6 })) - Math.max(...ys(cut, hemRing, { beat, dance: 0 })));
      }
      expect([form, least > 0.6, form > 0 || rose > 0.06]).toEqual([form, true, true]);
    }
    // Nodding: the head's top goes forward on its count and back two counts on, and the arms are folded across the chest, dancing or
    // not, until it stands still beside the visitor's bear.
    const nod = figure("nod");
    expect(at2(nod, crown, { beat: 0, dance: 1 }).z - at2(nod, crown, { beat: 2.5, dance: 1 }).z).toBeGreaterThan(0.04);
    for (const pose of [{ beat: 0.3, dance: 1 }, { beat: 0, dance: 0 }]) for (const v of hands) {
      const p = at2(nod, v, pose);
      expect(Math.abs(p.x)).toBeLessThan(0.2);
      expect(p.z).toBeGreaterThan(0.1);
      expect(p.y).toBeGreaterThan(1);
    }
    expect(at2(nod, hands[1], { beat: 0, dance: 1, still: 1, rising: 0 })).toEqual({ x: hands[1].x, y: hands[1].y, z: hands[1].z });
    // Watching, with its hands on its hips: the hands at the hips, the elbows out past them.
    const watch = figure("watch", 16384 * STANDS.indexOf("akimbo")), elbow = bodyOf(4).filter((v) => Math.abs(v.y - (SHOULDER_Y - 0.27)) < 1e-6).reduce((a, b) => (b.x > a.x ? b : a));
    const palm = at2(watch, hands[1], { beat: 0, dance: 0 }), out2 = at2(watch, elbow, { beat: 0, dance: 0 });
    expect(palm.x).toBeLessThan(0.3);
    expect(palm.y).toBeGreaterThan(0.85);
    expect(palm.y).toBeLessThan(1.15);
    expect(out2.x).toBeGreaterThan(0.45);
  });

  it("stands each way it stands, and dances its own way: on one leg, a hand on its hip, arms folded, a cup, hands behind or in its pockets, an arm round a friend; bobbing with its elbows bent, turning slowly with its arms out, shifting its weight", () => {
    // In the figure's own units, standing with no dance but where it says, a plain standard figure at the front. Its hands, its hips
    // (the body's lowest ring, either side), its knees and its feet, its elbows.
    const stanced = (stand: string, move = "watch", parts = 0) => figureOf(move, 16384 * STANDS.indexOf(stand), parts);
    const hands = [bodyOf(3).reduce(lowest), bodyOf(4).reduce(lowest)], elbows = [3, 4].map((r) => bodyOf(r).filter((v) => Math.abs(v.y - (SHOULDER_Y - 0.27)) < 1e-6));
    const hips = [-1, 1].map((side) => rich.filter((v) => v.mark.x === 0 && v.mark.y === 0 && v.y < 0.9 && side * v.x > 0.08));
    const knees = [-1, 1].map((side) => rich.filter((v) => v.mark.x === 1 && Math.abs(v.y - LEG / 2) < 0.02 && side * v.x > 0));
    const still = { beat: 0, dance: 0 };
    const mid = (f: Figure, list: Vertex[], pose: Pose = still) => mean(f, list, pose);
    // Square on both feet, the hips level; on its left leg, the left hip out over the left foot and higher, the right knee bent
    // forward; on its right, the other way.
    const square = stanced("square"), left = stanced("left"), right = stanced("right");
    expect(Math.abs(mid(square, hips[0]).y - mid(square, hips[1]).y)).toBeLessThan(1e-6);
    expect(mid(left, hips[0]).x).toBeLessThan(mid(square, hips[0]).x - 0.03);
    expect(mid(left, hips[0]).y).toBeGreaterThan(mid(left, hips[1]).y + 0.002);
    expect(mid(left, knees[1]).z).toBeGreaterThan(mid(square, knees[1]).z + 0.02);
    expect(mid(right, hips[1]).x).toBeGreaterThan(mid(square, hips[1]).x + 0.03);
    // A hand on its hip, the left, and its weight on that leg; both on its hips; arms folded before the chest; a cup held up before
    // it in the right hand, and the cup with it; hands behind its back; hands in its pockets, at the hips.
    const hand = (f: Figure, k: number) => at2(f, hands[k], still);
    const onHip = hand(stanced("hip"), 0);
    expect([Math.abs(onHip.x) < 0.3, onHip.y > 0.85 && onHip.y < 1.15]).toEqual([true, true]);
    expect(hand(stanced("hip"), 1).y).toBeLessThan(0.9);
    for (const k of [0, 1]) { const p = hand(stanced("akimbo"), k); expect([Math.abs(p.x) < 0.3, p.y > 0.85]).toEqual([true, true]); }
    for (const k of [0, 1]) { const p = hand(stanced("folded"), k); expect([Math.abs(p.x) < 0.2, p.z > 0.1, p.y > 1]).toEqual([true, true, true]); }
    const cupped = stanced("cup", "watch", PART.CUP as number), cup = rich.filter((v) => v.mark.y === PART.CUP);
    expect(hand(cupped, 1).y).toBeGreaterThan(1);
    expect(hand(cupped, 1).z).toBeGreaterThan(0.2);
    expect(Math.hypot(mid(cupped, cup).x - hand(cupped, 1).x, mid(cupped, cup).y - hand(cupped, 1).y, mid(cupped, cup).z - hand(cupped, 1).z)).toBeLessThan(0.08);
    expect(hand(cupped, 0).y).toBeLessThan(0.9);
    // The cup stands upright in the fist, its rim the way up and within 0.2 rad of straight up (0.12 at the most), held up before the
    // figure, seated, and let down as the parting stills it, part of the way or all: let down, it lay flat at the hip.
    const cupWay = -0.5 * Math.PI * CUP_ARM[3], ends = [1, -1].map((end) => cup.filter((v) => end * ((v.x - SHOULDER_X) * Math.sin(cupWay) + v.z * Math.cos(cupWay) - 0.045) > 0.01));
    for (const pose of [still, { beat: 1.3, dance: 1.6 }, { beat: 0, dance: 1, sit: 1 }, { beat: 0, dance: 0, still: 0.5 }, { beat: 0, dance: 0, still: 1, rising: 0 }, { beat: 0, dance: 1, sit: 1, still: 1, rising: 0 }] as Pose[]) {
      const [rim, foot] = ends.map((list) => mid(cupped, list, pose)), axis = { x: rim.x - foot.x, y: rim.y - foot.y, z: rim.z - foot.z };
      expect([pose, Math.acos(axis.y / Math.hypot(axis.x, axis.y, axis.z)) < 0.2]).toEqual([pose, true]);
      // Let down all the way, it stands beside the fist, out of the forearm that comes down into it, and not over it.
      const c = mid(cupped, cup, pose), h = mid(cupped, arms2[1].hand, pose);
      if (pose.still === 1) expect([pose, Math.hypot(c.x - h.x, c.z - h.z) > 0.035, c.y - h.y < 0.03]).toEqual([pose, true, true]);
    }
    for (const k of [0, 1]) expect(hand(stanced("behind"), k).z).toBeLessThan(-0.1);
    for (const k of [0, 1]) { const p = hand(stanced("pockets"), k); expect([Math.abs(p.x) < 0.3, p.y > 0.7 && p.y < 1]).toEqual([true, true]); }
    // An arm round a friend: round the shoulders of one to its right, the right arm out level to the side and its forearm round
    // behind them, the hand below its shoulder; round the waist of one to its left, the left arm out low and behind them, and the
    // head toward them. (Where each hand lies on the other, the friends test below holds.)
    const round = hand(stanced("round"), 1), waist = hand(stanced("waistLeft"), 0);
    expect([round.x > SHOULDER_X + 0.35, round.y > SHOULDER_Y - 0.35 && round.y < SHOULDER_Y - 0.1, round.z < -0.08]).toEqual([true, true, true]);
    expect([waist.x < -SHOULDER_X - 0.3, waist.y > 0.85 && waist.y < 1.2, waist.z < -0.08]).toEqual([true, true, true]);
    const head = bodyOf(6), tilted = mid(stanced("waistLeft"), head);
    expect(tilted.x).toBeLessThan(mid(square, head).x - 0.03);
    // Both friends lean toward each other from the hips, and only the one whose arm is round the other's waist lays its head on
    // further, HEAD_TO, which takes its head 0.018 on past the other's; the other's own stays up, its arm over that head.
    expect(mid(stanced("waist"), head).x - mid(stanced("round"), head).x).toBeGreaterThan(0.012);
    expect(mid(stanced("waistLeft"), head).x - mid(stanced("roundLeft"), head).x).toBeLessThan(-0.012);
    // Every arm of a stance hangs again as the parting stills the figure, and the cup stays held.
    for (const stand of STANDS as string[]) for (const k of [0, 1]) {
      const f = stanced(stand, "watch", stand === "cup" ? (PART.CUP as number) : 0), p = at2(f, hands[k], { beat: 0, dance: 0, still: 1, rising: 0 });
      if (!(stand === "cup" && k === 1)) expect([stand, k, p.y < 0.9]).toEqual([stand, k, true]);
    }
    // Bobbing, its elbows bend, so its forearms come forward of its upper arms; held still they hang straight.
    const bob = figureOf("bob"), forearm = (pose: Pose) => at2(bob, hands[1], pose).z - mid(bob, elbows[1], pose).z;
    expect(forearm({ beat: 0.5, dance: 1 })).toBeGreaterThan(0.1);
    expect(Math.abs(forearm({ beat: 0.5, dance: 1, still: 1, rising: 0 }))).toBeLessThan(0.02);
    // Turning, its arms are out, the hands within a fifth of a unit of the shoulders' height, on both sides, the right higher; and
    // its elbows bent, each forearm turned up from its elbow and the hand above it, so that from behind the arms are no one stick.
    const spin = figureOf("spin");
    for (const beat of [0, 2, 4, 6]) for (const k of [0, 1]) {
      const p = at2(spin, hands[k], { beat, dance: 1 }), elbow = mid(spin, elbows[k], { beat, dance: 1 }), shoulder = mid(spin, arms2[k].top, { beat, dance: 1 });
      expect([beat, k, p.y > SHOULDER_Y - 0.25, p.y > elbow.y + 0.05, elbow.y < shoulder.y - 0.05]).toEqual([beat, k, true, true, true]);
    }
    expect(at2(spin, hands[1], { beat: 0, dance: 1 }).y).toBeGreaterThan(at2(spin, hands[0], { beat: 0, dance: 1 }).y + 0.04);
    // Shifting its weight, from one foot to the other over eight beats: the hips go out over one, back, out over the other.
    const shift = figureOf("shift"), across = [0, 2, 4, 6].map((beat) => mid(shift, [...hips[0], ...hips[1]], { beat, dance: 1 }).x);
    expect(across[1] * across[3]).toBeLessThan(0);
    expect(Math.max(...across.map(Math.abs))).toBeGreaterThan(0.03);
    // And one that stands and watches stands still, dancing or not.
    const watch = figureOf("watch");
    for (const v of [...hands, ...head]) expect(at2(watch, v, { beat: 1.3, dance: 1.6 })).toEqual(at2(watch, v, { beat: 5.1, dance: 1.6 }));
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
    const head = of(0, 6), legs = of(0, 1), body = of(0, 0), belly = body.filter((v) => v.y > 0.9 && v.y < 1.2);
    // The shorts' hem ring on the legs, the sleeve's hem ring on the right arm, and the right leg's top ring, inside the hips.
    const [[legTop], [shortsHem]] = LEG_RINGS, [, [sleeveHem]] = ARM_RINGS;
    const hem = legs.filter((v) => Math.abs(v.y - shortsHem) < 0.001), cuff = of(0, 4).filter((v) => Math.abs(v.y - SHOULDER_Y + sleeveHem) < 0.001);
    const across = (f: Figure, list: Vertex[]) => { const xs = each(f, list).map((p) => p.x); return Math.max(...xs) - Math.min(...xs); };
    const inner = (f: Figure) => Math.min(...each(f, legs.filter((v) => v.x > 0 && v.y > legTop - 0.001)).map((p) => p.x));
    // How far the hips come down on the beat, for one that bobs, by how hard it dances.
    const dip = (size2: number) => mean(shaped({ move: "bob", size: size2 }), seat, { beat: 2.5, dance: 1.2 }).y - mean(shaped({ move: "bob", size: size2 }), seat, { beat: 0, dance: 1.2 }).y;
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
      ["shorts stand open at the hem round the thigh", widest(shaped({}), hem), widest(shaped({ cuts: C.SHORTS }), hem), 0.012],
      ["and the ankle under them is bare and narrower", widest(shaped({}), legs.filter((v) => v.y < 0.01)), widest(shaped({ cuts: C.SHORTS }), legs.filter((v) => v.y < 0.01)), -0.01],
      ["a short or rolled sleeve stands open at its hem round the arm", across(shaped({}), cuff), across(shaped({ cuts: C.BARE }), cuff), 0.012],
      ["a stout figure's thighs meet at the top, where a standard figure's stand apart", inner(shaped({})), inner(shaped({ body: { x: 1.5 } })), -0.006],
      ["a big round head of hair stands out from the head", widest(shaped({}), head), widest(shaped({ cuts: C.AFRO }), head), 0.08],
      ["a shawl is a poncho cut short", lowest2(shaped({ parts: P.PONCHO }), of(P.PONCHO)), lowest2(shaped({ parts: P.PONCHO, cuts: C.SHAWL }), of(P.PONCHO)), 0.15],
      ["a stoop carries the head forward", Math.min(...each(shaped({}), head).map((p) => p.z)), Math.min(...each(shaped({ stoop: 0.12 }), head).map((p) => p.z)), 0.08],
      ["one that dances harder comes down further on its count", dip(0.62), dip(1), 0.03],
    ];
    for (const [name, a, b, by] of rows) expect([name, by > 0 ? b - a > by : by < 0 ? b - a < by : b === a]).toEqual([name, true]);
    expect(inner(shaped({}))).toBeGreaterThan(0.003);
    // And the crowd's figures do differ in each number: no two of the fixed day's in how hard they dance, but a friend whose arm is
    // round the other's waist, who dances as the other does, where the day has one; and a spread of the rest.
    const real = figuresOf(SHOWS[0].desktop), led = real.filter((f) => (STANDS as string[])[Math.floor(f.wear.y / 16384) % 16].startsWith("waist"));
    expect(new Set(real.map((f) => f.wear.w)).size).toBe(real.length - led.length);
    expect([Math.min(...real.map((f) => f.wear.w)) < 0.66, Math.max(...real.map((f) => f.wear.w)) > 0.96]).toEqual([true, true]);
    for (const read of [(f: Figure) => f.body.x, (f: Figure) => f.body.y, (f: Figure) => f.body.z, (f: Figure) => f.body.w, (f: Figure) => f.wear.z, (f: Figure) => f.cut.x, (f: Figure) => f.cut.y]) {
      expect(new Set(real.map(read)).size).toBeGreaterThan(30);
    }
    // What a head wears is on the head: as one that nods bows its head, each of them goes with it, as one piece with it.
    const nodding = shaped({ move: "nod", parts: P.BRIM + P.CROWN + P.BILL + P.BAND + P.KNOT + P.WREATH + P.HAIR + P.TAIL + P.TAIL2 + P.BEARD });
    const crown = head.reduce((a, b) => (b.y > a.y ? b : a)), bowed = (v: Vertex) => [{ ...put(nodding, v, { beat: 2.5, dance: 1.2 }) }, { ...put(nodding, v, { beat: 0, dance: 1.2 }) }];
    const [crownUp, crownDown] = bowed(crown);
    expect(crownDown.z - crownUp.z).toBeGreaterThan(0.04);
    for (const name of ["BRIM", "CROWN", "BILL", "BAND", "KNOT", "WREATH", "HAIR", "TAIL", "TAIL2", "BEARD"]) {
      const v = of(P[name]).reduce((a, b) => (b.y < a.y ? b : a)), [up, down] = bowed(v), apart = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      expect([name, v.mark.x, Math.abs(apart(up, crownUp) - apart(down, crownDown)) < 1e-9, apart(up, down) > 1e-3]).toEqual([name, 6, true, true]);
    }
    // And how a figure is cut colours it: a shin under shorts and a forearm under short sleeves are its skin, a long shirt's tail is
    // its top's colour, and a bald scalp its skin and not its hair. The top's colour is its first number (its corner's red).
    const eighties = dressOn("1986-07-04");
    const tones2 = { x: tone(eighties.legs[0]), y: tone(HAIRS[4]), z: tone(SKIN[1]), w: tone(eighties.thing[0]) }, shirt = tone(eighties.top[6][0]);
    const coloured = (tint: number, cuts: number) => {
      const out = { r: shirt, g: 0, b: 0 };
      runTones(null, out, { x: 0, y: 0, z: tint, w: 0 }, null, null, 1, null, { x: 0, y: MOVES.indexOf("bob") + 64 * cuts, z: 0, w: 1 }, null, tones2, 0, 0, 0, 0);
      return [out.r, out.g, out.b].map((c) => Math.round(c * 1e4) / 1e4).join();
    };
    const [legsTone, hairTone, selfTone, top] = [coloured(1, 0), coloured(2, 0), coloured(3, 0), coloured(0, 0)];
    expect(new Set([legsTone, hairTone, selfTone, top]).size).toBe(4);
    expect([coloured(5, 0), coloured(5, C.SHORTS)]).toEqual([legsTone, selfTone]);
    expect([coloured(6, 0), coloured(6, C.BARE)]).toEqual([top, selfTone]);
    expect([coloured(7, 0), coloured(7, C.TUNIC)]).toEqual([legsTone, top]);
    expect([coloured(8, 0), coloured(8, C.BALD)]).toEqual([hairTone, selfTone]);
  });

  it("ends shorts and a short sleeve at their hems, open: the lowest ring of a desktop figure's shorts and of its short sleeve is their widest, and under it is skin", () => {
    // The cloth on a limb is its faces of the cloth's tint (TINT.LEGS on a leg, TINT.TOP on an arm), and under the hem the shin's and
    // the forearm's, which shorts and short sleeves bare (sourceOf). On a figure dealt both, standing at rest, each ring of the cloth
    // round the limb's own middle as the shader stands it: the hem, opened (OPEN), stands out past every ring over it, so that the
    // cloth ends at its widest. The band under the hem was the cloth's, and so the cloth went on past the open ring and in again, to
    // end at the knee's ring and the elbow's. A phone and a television leave the hems out (LEG_RINGS, ARM_RINGS): theirs end at the joint.
    const C = CUT as Record<string, number>, base = standard({ x: 0, y: 0, z: 0, w: 0 });
    const bared = { ...base, wear: { ...base.wear, y: MOVES.indexOf("watch") + 64 * (C.SHORTS + C.BARE) } }, still = { beat: 0, dance: 0 };
    for (const [limb, rig, tint, bare, by] of [["leg", 1, TINT.LEGS, TINT.SHIN, 0.005], ["arm", 4, TINT.TOP, TINT.FOREARM, 0.003]] as const) {
      // The limb's faces, each its corners' heights and its tint (a corner on a ring between two colours is each face's own).
      const position = crowd.figure.getAttribute("position"), marked = crowd.figure.getAttribute("aMark"), faces: { ys: number[]; tint: number }[] = [];
      for (let t = 0; t < position.count; t += 3) {
        if (marked.getX(t) !== rig || marked.getY(t) !== 0 || position.getX(t) <= 0) continue;
        faces.push({ ys: [0, 1, 2].map((k) => Math.round(position.getY(t + k) * 1e5) / 1e5), tint: marked.getZ(t) % TINTS });
      }
      const ys = [...new Set(faces.filter((face) => face.tint === tint).flatMap((face) => face.ys))].sort((a, b) => a - b);
      const mine = rich.filter((v) => v.mark.x === rig && v.mark.y === 0 && v.x > 0), width = (y: number) => {
        const at = mine.filter((v) => Math.abs(v.y - y) < 1e-5).map((v) => ({ ...put(bared, v, still) }));
        const mx = at.reduce((sum, p) => sum + p.x, 0) / at.length, mz = at.reduce((sum, p) => sum + p.z, 0) / at.length;
        return Math.max(...at.map((p) => Math.hypot(p.x - mx, p.z - mz)));
      };
      const widths = ys.map(width), under = faces.filter((face) => Math.max(...face.ys) < ys[0] + 1e-5 && face.tint !== tint);
      expect([limb, ys.length >= 2, widths[0] - Math.max(...widths.slice(1)) > by]).toEqual([limb, true, true]);
      expect([limb, under.length > 10, under.every((face) => [bare, TINT.SELF].includes(face.tint)), faces.every((face) => face.tint !== tint || Math.min(...face.ys) > ys[0] - 1e-5)])
        .toEqual([limb, true, true, true]);
    }
  });

  it("bends a limb at its joint and never folds a ring of it past the next: no ring of a leg or an arm passes the one under it, on any figure of three shows' crowds, desktop and phone, in any stance at any beat", () => {
    // The shader mitres the ring at the knee and at the elbow, its corners out along the line halfway between the limb's two parts
    // and by up to 1 / 0.4 of how far they stand off its middle, so the crease's side of the ring goes up the limb as the joint bends.
    // 4 cm over the knee, the shorts' hem's ring had the knee's fold up past it by up to 12.6 cm, seated; 3 cm over the elbow, the
    // sleeve's had the elbow's by 2.7 cm. Each ring's corners are matched round the limb, at rest, and each must stay over the one
    // under it along the line between the two rings' middles, by 2 cm. And a flared cuff's inner corner, past the middle as it opens,
    // is its own leg's (legSide): taken for the other's, it went across with the other shin, 18 cm, as a figure sat cross-legged.
    const limbsOf = (verts: Vertex[]) => ([[1, -1], [1, 1], [3, -1], [4, 1]] as const).map(([rig, side]) => {
      const mine = verts.filter((v) => v.mark.x === rig && v.mark.y === 0 && v.mark.z % TINTS !== TINT.SELF && (rig !== 1 || side * v.x > 0));
      const middle = rig === 1 ? side * HIP_X : side * SHOULDER_X;
      return [...new Set(mine.map((v) => Math.round(v.y * 1e5) / 1e5))].sort((a, b) => b - a).map((y) => {
        const seen = new Map<string, Vertex>();
        for (const v of mine) if (Math.abs(v.y - y) < 1e-5 && Math.hypot(v.x - middle, v.z) > 1e-4) seen.set(`${v.x.toFixed(5)} ${v.z.toFixed(5)}`, v);
        return [...seen.values()].sort((a, b) => Math.atan2(a.z, a.x - middle) - Math.atan2(b.z, b.x - middle));
      }).filter((ring) => ring.length >= 5);
    });
    const poses: Omit<Pose, "beat">[] = [{ dance: 0 }, { dance: 0, sit: 1 }, { dance: 1.6, sit: 1 }, ...STATES.map(([, pose]) => pose)];
    let least = Infinity, where = "", looked = 0;
    for (const [tier, verts, of] of [["desktop", rich, "desktop"], ["phone", plain, "phone"]] as const) {
      const limbs = limbsOf(verts);
      expect([tier, limbs.map((rings) => rings.length)]).toEqual([tier, tier === "desktop" ? [5, 5, 4, 4] : [3, 3, 3, 3]]);
      for (const { [of]: c } of SHOWS) for (const f of figuresOf(c)) for (const pose of poses) for (const beat of beatsOf(f)) for (const rings of limbs) {
        const posed = rings.map((ring) => ring.map((v) => { const p = put(f, v, { beat, ...pose }); return [p.x, p.y, p.z]; }));
        for (let k = 0; k + 1 < posed.length; k++) {
          const over = posed[k], under = posed[k + 1], mid = (ring: number[][]) => [0, 1, 2].map((j) => ring.reduce((sum, p) => sum + p[j], 0) / ring.length);
          const [a, b] = [mid(over), mid(under)], length = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), way = [0, 1, 2].map((j) => (a[j] - b[j]) / length);
          looked += 1;
          for (let c = 0; c < over.length; c++) {
            const by = [0, 1, 2].reduce((sum, j) => sum + (over[c][j] - under[c][j]) * way[j], 0);
            if (by < least) { least = by; where = `${tier} figure ${f.i}, ${JSON.stringify(pose)} at ${beat.toFixed(2)}, ring ${k}`; }
          }
        }
      }
    }
    expect(looked).toBeGreaterThan(500000);
    expect([least > 0.02, where]).toEqual([true, where]);
  }, 120000);

  it("keeps a seated figure's coat outside its thighs, every way of sitting", () => {
    // A coat's tail is the skirt's second form, which goes with the knees as a skirt does; but a skirt goes half as far at its sides,
    // and the coat's sides, which hang outside the thighs, went 3.6 cm inside them for one sitting cross-legged. Every coat wearer of
    // three shows' crowds, desktop and phone, sat each way of sitting, at rest and dancing: on each side the thigh's outermost corner
    // under the tail, at its top ring and, on a desktop, at the shorts' hem, stands no more than half a centimetre further out than the
    // coat's: as far as a hug's thighs, drawn up together, touch it.
    const coat = (FORMS.SKIRT as string[]).indexOf("coat");
    for (const [tier, verts, of] of [["desktop", rich, "desktop"], ["phone", plain, "phone"]] as const) {
      const wearers = SHOWS.flatMap(({ [of]: c }) => figuresOf(c)).filter((f) => carries(f, PART.SKIRT as number, coat));
      const tail = verts.filter((v) => v.mark.y === PART.SKIRT && formOfMark(v.mark.z) === coat && v.y < 0.6);
      const thigh = verts.filter((v) => v.mark.x === 1 && v.mark.y === 0 && [LEG_RINGS[0][0], LEG_RINGS[1][0]].some((y) => Math.abs(v.y - y) < 1e-4));
      expect([tier, wearers.length > 20, tail.length > 0, thigh.length > 0]).toEqual([tier, true, true, true]);
      for (let sat = 0; sat < SITS.length; sat++) {
        let most = -Infinity;
        for (const one of wearers) {
          const f = { ...one, fig: { ...one.fig, x: 1 }, wear: { ...one.wear, y: (one.wear.y % 262144) + 262144 * sat } };
          for (const pose of [{ beat: 0.3, dance: 0, sit: 1 }, { beat: 1.7, dance: 1.2, sit: 1 }]) for (const side of [-1, 1]) {
            const out = (list: Vertex[]) => Math.max(...list.filter((v) => side * v.x > 0).map((v) => side * put(f, v, pose).x));
            most = Math.max(most, out(thigh) - out(tail));
          }
        }
        expect([tier, SITS[sat], most < 0.005]).toEqual([tier, SITS[sat], true]);
      }
    }
  });

  it("dresses each show's crowd in its era's clothes, by the stage's rule for a date: its tops, trousers and things from the era's palette, its skin and hair anyone's, none brighter than MOST", () => {
    // The eras, as the stage reads its table (lineup.js eraOn): each row from its first date to its last, in date order, none
    // overlapping, from the line-up table's first day to the band's last show, every palette as long as COLOURS says.
    type Palette = { top: number[][]; legs: number[]; thing: number[] };
    const era = (k: number) => DRESS[k][2] as Palette, day = (date: unknown) => Date.parse(`${date}T00:00:00Z`) / 86400000;
    expect(DRESS[0][0]).toBe("1965-06-01");
    expect(DRESS[DRESS.length - 1][1]).toBe("1995-07-09");
    for (let k = 0; k < DRESS.length; k++) {
      if (k > 0) expect(day(DRESS[k][0])).toBe(day(DRESS[k - 1][1]) + 1);
      expect([era(k).top.length, era(k).legs.length, era(k).thing.length]).toEqual([COLOURS.top, COLOURS.legs, COLOURS.thing]);
    }
    expect([SKIN.length, HAIRS.length]).toEqual([COLOURS.self, COLOURS.hair]);
    // The five shows of the brief, one of each era, and a show with no date, which dresses as the eighties do.
    const eras = { "1969-04-17": 0, "1972-05-03": 1, "1977-05-08": 1, "1986-07-04": 2, "1993-03-24": 3 } as Record<string, number>;
    for (const [date, k] of Object.entries(eras)) expect([date, dressOn(date)]).toEqual([date, DRESS[k][2]]);
    expect(dressOn(null)).toBe(DRESS[2][2]);
    // What each era wears: the sixties prints and vests, the seventies checks, the eighties tie-dye most of all, the nineties tie-dye and
    // checks (flannel). Every era has tops of plain colour too.
    const kinds = (k: number) => era(k).top.map(([, pattern]) => pattern);
    const count = (k: number, pattern: number) => kinds(k).filter((p: number) => p === pattern).length;
    expect([count(0, PATTERN.PRINT) >= 2, count(0, PATTERN.VEST) >= 2]).toEqual([true, true]);
    expect(count(1, PATTERN.CHECK)).toBeGreaterThanOrEqual(3);
    expect(count(2, PATTERN.TIE)).toBeGreaterThanOrEqual(5);
    expect([count(3, PATTERN.TIE) >= 3, count(3, PATTERN.CHECK) >= 3]).toEqual([true, true]);
    for (let k = 0; k < DRESS.length; k++) expect(count(k, PATTERN.PLAIN)).toBeGreaterThanOrEqual(4);
    // No colour anyone wears in any era is brighter than MOST in any channel, so no shirt is white under the stage's light, and none is
    // near black but a few dark tees, trousers and black hair: under 1 % relative luminance only those.
    const rgb = (hex: number) => new THREE.Color(hex);
    for (const hex of [...CLOTHES, ...SKIN, ...HAIRS] as number[]) expect([hex.toString(16), Math.max(rgb(hex).r, rgb(hex).g, rgb(hex).b) <= MOST]).toEqual([hex.toString(16), true]);
    expect(MOST).toBeLessThanOrEqual(0.8);
    // Each figure of three shows' crowds, desktop and phone, coloured as the shader leaves each vertex: its top its era's top (or, where
    // a pattern is drawn on it, the pattern's two colours and its seed), its legs and things its era's, its skin and hair anyone's, to
    // a hundredth of MOST, the tone's rounding; and the dyes held up as before (the skyline's tests).
    const near = (out: Rgb, hex: number) => { const c = rgb(hex); return Math.max(Math.abs(out.r - c.r), Math.abs(out.g - c.g), Math.abs(out.b - c.b)) < 0.01 * MOST; };
    const out: Rgb = { r: 0, g: 0, b: 0 }, dress = { x: 0, y: 0, z: 0, w: 0 }, second = { x: 0, y: 0, z: 0, w: 0 };
    let looked = 0, moved = 0, vests = 0;
    const patterned = new Set<number>(), skins = new Set<number>(), hairs = new Set<number>();
    for (const { date, desktop, phone: small } of SHOWS) for (const c of [desktop, small]) {
      const palette = dressOn(date) as Palette, list = figuresOf(c), who = peopleOf(c);
      for (const f of list) {
        const p = who[f.i], worn = c.each.colours[f.i] as { top: number; legs: number; thing: number };
        const [shirt, pattern, two] = palette.top[worn.top];
        const at = (tint: number, wear = f.wear) => {
          out.r = f.top.r; out.g = f.top.g; out.b = f.top.b; dress.w = 0;
          runTones(null, out, { x: 0, y: 0, z: tint, w: 0 }, f.fig, null, 1, f.body, wear, f.cut, f.tone, 0, 0, 0, 0, f.place, f.size, dress, second);
          return out;
        };
        expect([f.i, near(at(0), shirt), dress.w, Math.round(f.top.b) % PATTERNS]).toEqual([f.i, true, pattern, pattern]);
        if (pattern !== PATTERN.PLAIN) {
          expect(near({ r: second.x, g: second.y, b: second.z }, two)).toBe(true);
          expect(second.w).toBeCloseTo(seedOf(f.i) / (SEEDS - 1), 6);
          patterned.add(pattern);
        }
        // The pattern runs down the sleeves too, but for a vest's: those are its shirt's, plain.
        out.r = f.top.r; out.g = f.top.g; out.b = f.top.b; dress.w = 0;
        runTones(null, out, { x: RIG.ARM_L, y: 0, z: TINT.TOP, w: 0 }, f.fig, null, 1, f.body, f.wear, f.cut, f.tone, 0, 0, 0, 0, f.place, f.size, dress, second);
        expect([f.i, near(out, shirt), dress.w]).toEqual([f.i, true, pattern === PATTERN.VEST ? 0 : pattern]);
        vests += pattern === PATTERN.VEST ? 1 : 0;
        // Its top, its trousers and its things are the era's, as dressFor chose them from those it was dealt (the test below).
        expect([f.i, near(at(1), palette.legs[worn.legs]), near(at(4), palette.thing[worn.thing])]).toEqual([f.i, true, true]);
        moved += worn.legs === p.colour.legs && worn.thing === p.colour.thing && worn.top === p.colour.top ? 0 : 1;
        expect([f.i, near(at(3), SKIN[p.colour.self]), near(at(2), HAIRS[p.colour.hair])]).toEqual([f.i, true, true]);
        skins.add(p.colour.self); hairs.add(p.colour.hair);
        looked += 1;
      }
    }
    expect(looked).toBeGreaterThan(1000);
    expect(vests).toBeGreaterThan(10);
    expect(moved).toBeGreaterThan(looked / 10);
    expect(moved).toBeLessThan(0.75 * looked);
    expect([skins.size, hairs.size]).toEqual([SKIN.length, HAIRS.length]);
    expect(patterned.size).toBeGreaterThanOrEqual(4);
    // A tone comes back from its number as the colour that went in, to a hundredth of MOST, for every colour of every list.
    for (const hex of [...CLOTHES, ...SKIN, ...HAIRS] as number[]) {
      out.r = tone(hex); out.g = 0; out.b = 0;
      runTones(null, out, { x: 0, y: 0, z: 0, w: 0 }, null, null, 1, null, { x: 0, y: 0, z: 0, w: 1 }, null, { x: 0, y: 0, z: 0, w: 0 }, 0, 0, 0, 0);
      expect([hex.toString(16), near(out, hex)]).toEqual([hex.toString(16), true]);
    }
    // Skin runs from light to deep, a step apart, and hair from black to grey through browns, auburn and blond.
    const lum = (hex: number) => light(rgb(hex));
    for (let k = 1; k < SKIN.length; k++) expect(lum(SKIN[k]) / lum(SKIN[k - 1])).toBeLessThan(0.8);
    expect(lum(SKIN[0]) / lum(SKIN[SKIN.length - 1])).toBeGreaterThan(8);
    expect(Math.min(...HAIRS.map(lum))).toBeLessThan(0.01);
    expect(Math.max(...HAIRS.map(lum))).toBeGreaterThan(0.25);
  });

  it("dresses every figure so that from every side the lightest quarter of it as the eye sees it stands APART times lighter than its darkest, whatever it wears: where the colours it was dealt fall short, its legs, then its things, then its top give, each to the nearest of its era's on from its own that does, and where none bring a quarter apart, it takes the best of its era's at the fifth or the tenth", () => {
    // So that on any ground the one end of it or the other stands off it: a quarter, more than twice the tenth the tests that stand
    // every figure apart take, so that the light, which falls on some faces of a colour more than on others, and a side the views fall
    // between leave that tenth in it; a fifth where no colours of its era can bring a quarter apart; and the tenth itself where none
    // can bring a fifth, which before fell to the colours that stand apart from the most sides, and guarantee nothing. Below the
    // quarter a figure takes its era's best that bring that end apart, not the first: the first that scraped through at the tenth
    // stood under the eye's bar where the best stood well over it (the test of the days that fell under it, below).
    expect(APART).toBeGreaterThanOrEqual(3);
    expect(ENDS).toEqual([0.25, 0.2, 0.1]);
    // apartOf: the colour at which, from the lightest, a quarter, a fifth or a tenth of the figure is reached (the last of ENDS where
    // none is given), over the one at which it is from the darkest.
    expect(apartOf([0.5, 0.3, 0.2, 0, 0, 0], [0.3, 0.1, 0.03, 9, 9, 9])).toBeCloseTo(0.3 / 0.03, 9);
    expect(apartOf([0.5, 0.3, 0.15, 0, 0, 0.05], [0.3, 0.1, 0.03, 9, 9, 0.02], 0.2)).toBeCloseTo(0.3 / 0.03, 9);
    expect(apartOf([0.5, 0.35, 0.1, 0, 0, 0.05], [0.3, 0.1, 0.03, 9, 9, 0.02], 0.2)).toBeCloseTo(0.3 / 0.1, 9);
    expect(apartOf([0.5, 0.35, 0.1, 0, 0, 0.05], [0.3, 0.1, 0.03, 9, 9, 0.02])).toBeCloseTo(0.3 / 0.03, 9);
    expect(apartOf([0.85, 0.15, 0, 0, 0, 0], [0.3, 0.1, 9, 9, 9, 9], 0.2)).toBeCloseTo(1, 9);
    expect(apartOf([0.85, 0.15, 0, 0, 0, 0], [0.3, 0.1, 9, 9, 9, 9])).toBeCloseTo(3, 9);
    expect(apartOf([0.5, 0.28, 0.22, 0, 0, 0], [0.3, 0.1, 0.03, 9, 9, 9], 0.2)).toBeCloseTo(0.3 / 0.03, 9);
    expect(apartOf([0.5, 0.28, 0.22, 0, 0, 0], [0.3, 0.1, 0.03, 9, 9, 9], 0.25)).toBeCloseTo(0.3 / 0.1, 9);
    // A top's light is its colour's, or on the whole its pattern's two (COVER), as the tone draws them.
    for (const [, , d] of DRESS) for (const top of (d as Palette).top) {
      const [shirt, pattern, second] = top;
      expect(topLight(top)).toBeCloseTo(second === undefined ? lightOf(shirt) : (1 - COVER[pattern as keyof typeof COVER]) * lightOf(shirt) + COVER[pattern as keyof typeof COVER] * lightOf(second), 9);
    }
    const out: Rgb = { r: 0, g: 0, b: 0 };
    for (const hex of [...CLOTHES, ...SKIN, ...HAIRS] as number[]) {
      out.r = tone(hex);
      runTones(null, out, { x: 0, y: 0, z: 0, w: 0 }, null, null, 1, null, { x: 0, y: 0, z: 0, w: 1 }, null, { x: 0, y: 0, z: 0, w: 0 }, 0, 0, 0, 0);
      expect(lightOf(hex)).toBeCloseTo(light(out), 9);
    }
    // The shader draws each pattern's second colour over as much of the top on the whole as COVER says, which is what topLight reads.
    for (const pattern of [PATTERN.TIE, PATTERN.VEST, PATTERN.PRINT]) expect(dressLines).toContain(`cover = ${COVER[pattern as keyof typeof COVER].toFixed(4)}`);
    expect([PATTERN.TIE, PATTERN.STRIPE, PATTERN.CHECK].map((pattern) => COVER[pattern as keyof typeof COVER])).toEqual([0.5, 0.5, 0.5]);
    expect(dressLines.match(/cover = /g)?.length).toBe(3);
    // And far off, as its bands come nearer than DRESS_FINE of a pixel, a pattern turns to that colour on the whole (the test after
    // this one runs it).
    expect(dressLines).toContain(`diffuseColor.rgb = mix(vColor.rgb, vSecond.rgb, mix(share, cover, smoothstep(${DRESS_FINE[0].toFixed(4)}, ${DRESS_FINE[1].toFixed(4)}, fine)));`);
    // The rule, for figures that show their colours in many ways (the fixed day's crowd's first 40, each from every side drawnOf
    // draws it from), each dealt every colour of each list in turn and every skin and hair, on the fixed day's palette, with a top
    // close by (`worn`), three colours others wear whole (`taken`) and a draw of its own (`pick`): dressFor gives what ruleFor (above)
    // says. It wears the colours it was dealt where from every side those stand apart; else the nearest that do (AWAY), passing by
    // those others wear whole where it can; and below the quarter, of those within MARGIN of the best, the nearest, as its draw picks.
    expect([MARGIN, AWAY]).toEqual([0.8, { top: [1.5, 2.5, 3.5], worn: 4, spread: 1 }]);
    const palette = dressOn(FIXED) as Palette, kit = kitOf(crowd), whole = (one: Chosen) => one.top * 100 + one.legs * 10 + one.thing;
    let tried = 0;
    const kinds: Record<string, number> = {};
    for (const f of figures.slice(0, 40)) {
      const drawn = drawnOf(kit, figureNumbers(f)) as number[][];
      for (let dealt = 0; dealt < 14; dealt++) for (let self = 0; self < SKIN.length; self++) for (let hair = 0; hair < HAIRS.length; hair += 2) {
        const colour = { top: dealt % palette.top.length, legs: (dealt + 3) % palette.legs.length, thing: (dealt + 5) % palette.thing.length, self, hair };
        const start: Chosen = { top: colour.top, legs: colour.legs, thing: colour.thing }, worn = new Set([(dealt + 1) % palette.top.length]);
        const taken = new Set([{ ...start, legs: (start.legs + 1) % 8 }, { ...start, legs: (start.legs + 2) % 8 }, { ...start, thing: (start.thing + 1) % 10 }].map(whole));
        const pick = ((7 * dealt + 3 * self + hair) % 10) / 10 + 0.05, want = ruleFor(palette, colour, drawn, worn, taken, pick);
        const lightsOf = (one: Chosen) => [topLight(palette.top[one.top]), lightOf(palette.legs[one.legs]), lightOf(HAIRS[hair]), lightOf(SKIN[self]), lightOf(palette.thing[one.thing]), 0.02];
        const got = dressFor(palette, { colour }, drawn, worn, taken, pick) as Chosen;
        if (want) {
          expect([f.i, dealt, self, hair, got]).toEqual([f.i, dealt, self, hair, want.chosen]);
          const moved = GIVES.filter((name) => got[name] !== start[name]).join(" ") || "dealt";
          kinds[moved] = (kinds[moved] ?? 0) + 1;
          if (want.ends !== ENDS[0]) kinds.fifth = (kinds.fifth ?? 0) + 1;
          if (taken.has(whole(got))) kinds.taken = (kinds.taken ?? 0) + 1;
        } else {
          kinds.short = (kinds.short ?? 0) + 1;
          expect(drawn.filter((shares) => apartOf(shares, lightsOf(got)) >= APART).length).toBeLessThan(drawn.length);
          if (drawn.some((shares, k) => underSteep(k) && apartOf(shares, lightsOf(got)) < APART)) kinds.under = (kinds.under ?? 0) + 1;
        }
        tried += 1;
      }
    }
    expect(tried).toBe(40 * 14 * SKIN.length * Math.ceil(HAIRS.length / 2));
    // Each way of giving comes up, and a tenth of these stand apart from every side only at the fifth or the tenth. A figure no
    // colours of its era bring apart from every side even at the tenth is one that from over STEEP shows little but one colour, a hat
    // and a poncho, which four of the 40 are in; and at the tenth none of these is. Few wear what others wear whole: only those the
    // nearest that stand apart are all taken from.
    for (const kind of ["dealt", "legs", "thing", "top"]) expect([kind, (kinds[kind] ?? 0) > 20]).toEqual([kind, true]);
    expect(Object.keys(kinds).filter((kind) => kind.includes(" ")).reduce((sum, kind) => sum + kinds[kind], 0)).toBeGreaterThan(0);
    expect((kinds.fifth ?? 0) / tried).toBeGreaterThan(0.05);
    expect((kinds.short ?? 0) / tried).toBeLessThan(0.005);
    expect((kinds.under ?? 0) / tried).toBeLessThan(0.005);
    expect((kinds.taken ?? 0) / tried).toBeLessThan(0.1);
    // And as the shader colours them, on the three shows' crowds, desktop and phone (dressedApart, above; the test of other days'
    // gatherings also runs it on theirs): most figures wear the colours they were dealt or move one, a few move two, and all but a
    // few in hats and ponchos stand apart from every side, and those from every side under STEEP.
    const counted: Record<string, number> = {};
    for (const { date, desktop, phone: small } of SHOWS) for (const c of [desktop, small]) dressedApart(c, date, counted);
    const total = Object.values(counted).reduce((sum, n) => sum + n, 0), at = (kind: string) => counted[kind] ?? 0;
    expect(total).toBeGreaterThan(1000);
    expect(at("dealt 0.25") + at("one 0.25")).toBeGreaterThan(0.75 * total);
    expect(at("two 0.25")).toBeGreaterThan(0);
    expect(at("short")).toBeLessThan(0.04 * total);
    expect(at("short under")).toBe(0);
    // The tenth is for such as figure 227 of seed 661's crowd in the nineties' clothes: reclining in a long skirt, with a pack and a
    // roll, it shows its skirt over four fifths of it seen level from the stage's side, and no colours of its era bring its lightest
    // quarter or fifth apart from every side; its tenth, they do. In the colours of the most sides it stood 1.2 apart from what is
    // seen past it from the stage at hour 0.25 (HOURS), under SEPARATE; dressed at the tenth it stands apart.
    const nineties = crowdOf("1990-12-09", false, 350, 661), reclining = figuresOf(nineties)[227], skirt = drawnOf(kitOf(nineties), figureNumbers(reclining)) as number[][];
    expect([figureNumbers(reclining).seat, carries(reclining, PART.SKIRT as number), Math.max(...skirt.map((shares) => shares[SOURCES.indexOf("legs")])) > 0.75]).toEqual(["recline", true, true]);
    expect(dressedApart(nineties, "1990-12-09", {})[227]).toMatch(/ 0\.1$/);
    const fromStage = seenApart(nineties, ["stage"], [0.25]).each.find(({ i }) => i === 227)!;
    expect(fromStage.by).toBeGreaterThanOrEqual(SEPARATE);
    placedOf.delete(nineties);
  }, 90000);

  it("takes each face's colour from the figure as the shader's tones do, whatever it bares or covers: sourceOf", () => {
    // A figure whose every colour is its own: its top, its legs, its hair, its skin and its things each a tone no other is. For each
    // tint and each way it is cut that bares or covers a part (SHORTS, BARE, TUNIC, BALD), the shader's tones give a face the colour
    // of the one sourceOf names: a shoe's near black where it names the shoe, and a dye where it names none, what is held up.
    const own = [0x803020, 0x208030, 0x302080, 0x808020, 0x208080].map((hex) => tone(hex));
    const decoded = own.map((q) => [q % 128, Math.floor(q / 128) % 128, Math.floor(q / 16384)].map((n) => MOST * (n / 127) ** 2));
    const ways = [0, CUT.SHORTS, CUT.BARE, CUT.TUNIC, CUT.BALD];
    let tried = 0;
    for (let mask = 0; mask < 16; mask++) for (let tint = 0; tint < TINT.CLOTH3 + 1; tint++) {
      const cut = ways.slice(1).filter((_, k) => mask & (1 << k)).reduce((sum, bit) => sum + bit, 0);
      const out: Rgb = { r: own[0], g: 0, b: 0 };
      runTones(null, out, { x: 0, y: 0, z: tint, w: 0 }, { x: 0, y: 0, z: 0, w: 0 }, null, 1, null, { x: 0, y: 64 * cut, z: 0, w: 0 }, null, { x: own[1], y: own[2], z: own[3], w: own[4] }, 0, 0, 0, 0);
      const rgb = [out.r, out.g, out.b], is = (want: number[]) => want.every((q, j) => Math.abs(q - rgb[j]) < 1e-9);
      const named = sourceOf(tint, cut), shown = is([0.02, 0.02, 0.02]) ? SOURCES.indexOf("shoe") : decoded.findIndex(is);
      expect([tint, cut, named]).toEqual([tint, cut, named < 0 ? -1 : shown]);
      if (named < 0) expect([tint, shown]).toEqual([tint, -1]);
      tried += 1;
    }
    expect(tried).toBe(16 * 13);
    // SOURCES names them in the order the figure's colours are taken: its top, and its four tones (aTone), and the shoe's black.
    expect(SOURCES).toEqual(["top", "legs", "hair", "self", "thing", "shoe"]);
  });

  it("draws what of each figure shows in each colour from each side as the shader draws it: drawnOf's shares are the shader's within a few per cent on the whole and on seated figures alone, no colour's share leans either way, and where they are not, its verdict on the figure's fifths standing apart is the shader's on nearly every side of every figure", () => {
    // Each figure of the three shows' crowds, desktop and phone, as seenApart draws it from far off each way DRAWN_VIEWS looks at it,
    // turned with the figure (aSize.z), its pixels by whose colour each face shows (sourceOf); and as drawnOf draws it, from its
    // tier's own figure and the numbers it carries (figureNumbers), its vertex shader's shaping of it at rest mirrored (crowd.js),
    // but for the ground's slope under it and what it holds, and the shader's without the poles drawnOf leaves out (the next test). A seated figure is held to it apart, for there are fewer of them, and so is
    // each colour's share on average, over the sides that show it, for a colour drawn too little or too much moves every figure's ends.
    const far = (f: Figure, middle: number[]) => DRAWN_VIEWS.map(([turn, tilt]: number[]) => {
      const round = stageTurn(f.place!.x, f.place!.z, f.size!.z) + turn, c = Math.cos(f.size!.z), s = Math.sin(f.size!.z), dx = Math.sin(round) * Math.cos(tilt), dz = Math.cos(round) * Math.cos(tilt);
      return [middle[0] + 300 * (c * dx + s * dz), middle[1] + 300 * Math.sin(tilt), middle[2] + 300 * (-s * dx + c * dz)];
    });
    const errors: number[] = [], seatedErrors: number[] = [], tally = { same: 0, differ: 0 }, leans = [false, true].map(() => SOURCES.map(() => ({ sum: 0, n: 0 })));
    for (const { date, desktop, phone: small } of SHOWS) for (const c of [desktop, small]) {
      const kit = kitOf(c), { each } = seenApart(c, [], [], far, { without: UNDRAWN }), d = dressOn(date) as Palette, who = peopleOf(c);
      for (const f of figuresOf(c)) {
        const drawn = drawnOf(kit, figureNumbers(f)) as number[][], views = each.filter((one) => one.i === f.i), chosen = c.each.colours[f.i] as Chosen;
        const p = who[f.i] as { colour: Record<string, number> };
        const lights = [topLight(d.top[chosen.top]), lightOf(d.legs[chosen.legs]), lightOf(HAIRS[p.colour.hair]), lightOf(SKIN[p.colour.self]), lightOf(d.thing[chosen.thing]), 0.02];
        expect(views.length).toBe(DRAWN_VIEWS.length);
        views.forEach(({ shares }, k) => {
          errors.push(...shares.map((share, j) => Math.abs(share - drawn[k][j])));
          if (f.fig.x > 0.5) seatedErrors.push(...shares.map((share, j) => Math.abs(share - drawn[k][j])));
          for (const lean of [leans[0], ...(f.fig.x > 0.5 ? [leans[1]] : [])]) {
            shares.forEach((share, j) => { if (share > 0 || drawn[k][j] > 0) { lean[j].sum += share - drawn[k][j]; lean[j].n += 1; } });
          }
          tally[(apartOf(shares, lights, ENDS[1]) >= APART) === (apartOf(drawn[k], lights, ENDS[1]) >= APART) ? "same" : "differ"] += 1;
        });
      }
    }
    expect(tally.same + tally.differ).toBeGreaterThan(1000 * DRAWN_VIEWS.length);
    expect(tally.differ / (tally.same + tally.differ)).toBeLessThan(DRAWN_AGREE.differ);
    const meanOf = (list: number[]) => list.reduce((sum, e) => sum + e, 0) / list.length;
    expect([meanOf(errors) < DRAWN_AGREE.mean, seatedErrors.length > 1000, meanOf(seatedErrors) < DRAWN_AGREE.seated]).toEqual([true, true, true]);
    const leaning = leans.flatMap((each, seated) => each.map(({ sum, n }, j) => ({ seated, colour: SOURCES[j], n, by: sum / n }))).filter(({ n, by }) => !(n > 100 && Math.abs(by) < DRAWN_AGREE.lean));
    expect(leaning).toEqual([]);
  }, 120000);

  it("draws each figure from further under it than the stage looks up at one and further over it than the walk's camera looks down on one: DRAWN_VIEWS reach past every eye's tilt at both ends, no two of them more than 0.4 rad apart up or down", () => {
    // How far an eye looks up (-) or down (+) at a figure's middle, in the figure's own frame (drawnOf draws it at its standard size):
    // the rise and the run, each over the figure's own height and breadth (aSize).
    const middleOf = (f: Figure) => [f.place!.x, f.place!.y + 0.5 * TALL * f.size!.y, f.place!.z];
    const tilt = (f: Figure, eye: number[]) => { const m = middleOf(f); return Math.atan2((eye[1] - m[1]) / f.size!.y, Math.hypot(eye[0] - m[0], eye[2] - m[2]) / f.size!.x); };
    // From the stage and the hill (EYES), where seenApart and the sweep look from, at every figure of the three shows' crowds.
    const crowds = SHOWS.flatMap(({ desktop, phone: small }) => [[desktop, "desktop"], [small, "phone"]] as const);
    const eyes = crowds.flatMap(([c]) => figuresOf(c).flatMap((f) => [tilt(f, EYES.stage), tilt(f, EYES.hill)]));
    // And from the walk's camera at each test pose (TEST_POSES), on its boom as avatar.js hangs it: boomLength behind the bear's head
    // point and 0.35 rad over it, less the pose's pitch, aimed 6 m past the head; at each figure in its tier's frame, no further over
    // or under its aim than half its field of view (budgetFor). The steepest is at the foot of the frame, and no further to a side
    // looks steeper. The crowd lifts the boom over a figure near it (crowd.js `over`), which this leaves out, so it looks a little less
    // steeply than the world's camera does.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const fovOf = Object.fromEntries(["desktop", "phone"].map((tier) => [tier, (budgetFor(tier) as { fov: number }).fov]));
    vi.unstubAllGlobals();
    const framed = crowds.flatMap(([c, tier]) => (Object.values(TEST_POSES) as { x: number; z: number; heading: number; pitch: number }[]).flatMap((pose) => {
      const R = boomLength(tier === "phone"), e = 0.35 - pose.pitch, fx = -Math.sin(pose.heading), fz = -Math.cos(pose.heading), head = height(pose.x, pose.z) + HEAD;
      const cam = [pose.x - fx * R * Math.cos(e), head + R * Math.sin(e), pose.z - fz * R * Math.cos(e)], aim = unit3(sub([pose.x + fx * 6, head, pose.z + fz * 6], cam));
      const up = unit3(cross3(unit3(cross3(aim, [0, 1, 0])), aim)), half = Math.tan((fovOf[tier] * Math.PI) / 360);
      return figuresOf(c).filter((f) => { const to = sub(middleOf(f), cam), ahead = dot3(to, aim); return ahead > 0 && Math.abs(dot3(to, up)) <= ahead * half; }).map((f) => tilt(f, cam));
    }));
    const lowest = Math.min(...eyes), highest = Math.max(...eyes), steepest = Math.max(...framed);
    const levels = [...new Set((DRAWN_VIEWS as number[][]).map(([, down]) => down))].sort((a, b) => a - b);
    // The stage looks up 0.29 rad at the front rows' middles, the hill down 0.56 on the nearest, and the walk's camera down 0.97 on
    // those at the foot of its frame.
    expect([lowest < -0.25, highest > 0.5, steepest > highest]).toEqual([true, true, true]);
    expect([levels[0] < lowest, levels[levels.length - 1] > steepest, levels.every((down, k) => k === 0 || down - levels[k - 1] <= 0.4 + 1e-9)]).toEqual([true, true, true]);
  });

  it("leaves out of drawnOf the pole a figure holds a flag, a pennant, a star or a parasol up on, and a taper's stand: from the stage and the hill, each holder's shares are the shader's for it without them within a few per cent, for the eye's test, which draws a figure 40 pixels across, catches a pole from some sides and misses it on others", () => {
    // The thin black parts a figure holds up or stands by, named here so that the shader's figure below leaves out these two and
    // only these, whatever drawnOf leaves out.
    const thin = (PART.POLE as number) | (PART.STAND as number);
    expect(UNDRAWN).toBe(thin);
    // Each figure that holds a pole or stands by a stand in the three shows' crowds, desktop and phone, and in the gatherings of two
    // days a television drew, where one leaned on the pole's black and fell under the bar from the stage (705 and 806; the test of
    // the days that fell under it, above): drawnOf from where the stage and the hill see it (viewFrom) and the shader's figure
    // without them from there.
    const crowds = [...SHOWS.flatMap(({ desktop, phone: small }) => [desktop, small]), crowdOf("1990-12-09", true, 250, 705), crowdOf(SEVENTIES, true, 250, 806)];
    const gaps: number[] = [], worst: number[] = [];
    for (const c of crowds) {
      const kit = kitOf(c), holders = figuresOf(c).filter((f) => (f.wear.x & thin) !== 0);
      const { each } = seenApart(c, ["stage", "hill"], [], undefined, { without: thin, only: holders.map((f) => f.i) });
      for (const f of holders) {
        const drawn = drawnOf(kit, figureNumbers(f), [viewFrom(f, EYES.stage), viewFrom(f, EYES.hill)]) as number[][];
        (["stage", "hill"] as const).forEach((view, k) => {
          const off = each.find((one) => one.i === f.i && one.view === view)!.shares.map((share, j) => Math.abs(share - drawn[k][j]));
          gaps.push(...off);
          worst.push(Math.max(...off));
        });
      }
    }
    const meanOf = (list: number[]) => list.reduce((sum, e) => sum + e, 0) / list.length;
    worst.sort((a, b) => a - b);
    expect([worst.length > 500, meanOf(gaps) < 0.02, worst[Math.floor(0.9 * worst.length)] < 0.075, worst[worst.length - 1] < 0.15]).toEqual([true, true, true, true]);
    // Why: 705's figure 166 holds a flag up in a television's gathering. Drawn finely, 320 pixels across, its pole fills a tenth or
    // more of it from the stage, black as a shoe; drawn as the eye's test draws it, under a twentieth. So drawnOf leaves it out, and
    // the rule asks its own colours to stand it apart.
    const c = crowds[6], holder = figuresOf(c)[166], shoe = SOURCES.indexOf("shoe");
    const fine = seenApart(c, ["stage"], [], undefined, { n: 320, only: [166] }).each[0].shares[shoe], coarse = seenApart(c, ["stage"], [], undefined, { only: [166] }).each[0].shares[shoe];
    expect([carries(holder, PART.FLAG as number), fine > 0.1, coarse < 0.05, (drawnOf(kitOf(c), figureNumbers(holder), [viewFrom(holder, EYES.stage)]) as number[][])[0][shoe] < 0.05]).toEqual([true, true, true, true]);
    for (const one of crowds.slice(6)) placedOf.delete(one);
  }, 120000);

  it("draws each figure the same whichever figure it drew before: drawnOf clears each cell it drew on as it counts it", () => {
    // drawnOf counts each view over only the box its figure drew in, and clears it as it counts. A cell left drawn on, or a depth
    // left near, would count for, or hide, the next figure whose box takes it in; drawn in one order and then in the other, every
    // figure of a crowd comes out the same.
    for (const c of [SHOWS[0].desktop, SHOWS[0].phone]) {
      const kit = kitOf(c), figures = figuresOf(c), draw = (f: Figure) => drawnOf(kit, figureNumbers(f)) as number[][];
      const forth = figures.map(draw), back = [...figures].reverse().map(draw).reverse();
      expect([figures.length > 100, back]).toEqual([true, forth]);
    }
  });

  it("stands each corner as the shader does at rest, its hems opened as the shader opens them: standing, each ring of a desktop figure's legs, and of its arms from where a short sleeve ends up, is as broad in drawnOf's figure as in the shader's, and seated, each of a skirt's and a coat's as deep", () => {
    // drawnOf stands its corners with standerOf, which leaves out how a figure stands, what it holds and how it moves, so a corner
    // may stand somewhere else than the shader stands it at rest; but a stance moves the rings that the hems open whole, or, a leg's,
    // only up and down as the ground under its foot has it. So on every standing figure of the three shows' desktop crowds, ground
    // level under it, each ring of each leg is as broad across, level, in the one as in the other (its corners' widest pair apart),
    // and each of an arm's rings at its shoulder and a short sleeve's hem as broad across, to under a percent: the shader's shorts'
    // hem and short sleeve's are 18 % and 20 % broader than ones left closed in drawnOf (OPEN), and a bare ankle 28 % narrower than
    // one left as a trouser's, which moves some figures' colours.
    const [[shoulder], [sleeveHem]] = ARM_RINGS, out = [0, 0, 0], hems: Record<string, number> = {};
    const broadest = (list: number[][], level: boolean) => Math.max(...list.flatMap((p) => list.map((q) => Math.hypot(p[0] - q[0], level ? 0 : p[1] - q[1], p[2] - q[2]))));
    let rings = 0;
    for (const { desktop } of SHOWS) {
      const body = kitOf(desktop).get("0 0") as { position: Float32Array; mark: Float32Array };
      for (const f of figuresOf(desktop).filter((f) => f.fig.x <= 0.5)) {
        const stand = standerOf(figureNumbers(f)), level = { ...f, place: { ...(f.place ?? flat), w: 0 } }, cut = figureNumbers(f).cut, each = new Map<string, number[][][]>();
        for (let k = 0; k < body.position.length / 3; k++) {
          const rig = body.mark[4 * k], [x, y, z] = body.position.subarray(3 * k, 3 * k + 3);
          const ring = rig === RIG.LEG && LEG_RINGS.some(([at]) => Math.abs(y - at) < 1e-4) ? `leg ${x > 0} ${y.toFixed(2)}`
            : (rig === RIG.ARM_L || rig === RIG.ARM_R) && [shoulder, sleeveHem].some((at) => Math.abs(SHOULDER_Y - y - at) < 1e-4) ? `arm ${rig} ${y.toFixed(2)}` : null;
          if (!ring) continue;
          stand(body, k, 0, 0, out);
          const q = put(level, { x, y, z, mark: { x: rig, y: 0, z: body.mark[4 * k + 2], w: body.mark[4 * k + 3] } }, { beat: 0, dance: 0, still: 1 });
          const both = each.get(ring) ?? [[], []];
          both[0].push([...out]); both[1].push([q.x, q.y, q.z]); each.set(ring, both);
        }
        for (const [ring, [drawn, shaded]] of each) {
          const leg = ring.startsWith("leg"), by = broadest(shaded, leg) / broadest(drawn, leg) - 1;
          const hem = leg ? (!(cut & CUT.SHORTS) ? "trousers" : ring.endsWith(" 0.00") ? "bare ankle" : ring.endsWith(` ${LEG_RINGS[1][0].toFixed(2)}`) ? "shorts' hem" : "shorts") : cut & CUT.BARE ? "short sleeve's hem" : "sleeve";
          expect([f.i, ring, drawn.length > 3, Math.abs(by) < 0.01]).toEqual([f.i, ring, true, true]);
          hems[hem] = (hems[hem] ?? 0) + 1; rings += 1;
        }
      }
    }
    // Fourteen rings a figure, over some 700 standing figures, and a few hundred hems among them each way.
    expect(rings).toBeGreaterThan(9000);
    expect([hems["shorts' hem"] > 300, hems["bare ankle"] > 300, hems["short sleeve's hem"] > 300]).toEqual([true, true, true]);
    // And seated, on a desktop and a phone, the rings of a skirt and a coat's tail from the hips down, which both lay over the thighs
    // and under them, flatter than they hang standing (COAT_SAT): each as deep, from over the thighs to under them, in the one as in the
    // other, its corners' widest pair apart but for how far apart they stand across. Not the ring at the knee, which each mitres by
    // the knee's bend; nor a ring the ground holds up in the shader, a kneeling figure's hem, which drawnOf, leaving out the ground,
    // stands as far as 13 cm under it.
    const laps: Record<string, number> = {};
    for (const c of SHOWS.flatMap(({ desktop, phone }) => [desktop, phone])) {
      const kit = kitOf(c);
      for (const f of figuresOf(c).filter((f) => f.fig.x > 0.5 && Math.floor(f.wear.x / (PART.SKIRT as number)) % 2 === 1)) {
        const form = f.forms?.[PART.SKIRT as number] ?? 0, piece = kit.get(`${PART.SKIRT} ${form}`) as { position: Float32Array; mark: Float32Array };
        const stand = standerOf(figureNumbers(f)), level = { ...f, fig: { ...f.fig, w: 0 }, place: { ...(f.place ?? flat), w: 0 } }, each = new Map<number, number[][][]>();
        const hem = f.cut.y, mid = hem < 0.5 ? 0.5 : 0.5 * (1 + hem);
        for (let k = 0; k < piece.position.length / 3; k++) {
          const [x, y, z] = piece.position.subarray(3 * k, 3 * k + 3);
          if (y > LEG + 0.01 || Math.abs((y < 0.2 ? hem : mid) - 0.5) < 0.02) continue;
          stand(piece, k, PART.SKIRT as number, form, out);
          const q = put(level, { x, y, z, mark: { x: piece.mark[4 * k], y: PART.SKIRT as number, z: piece.mark[4 * k + 2], w: piece.mark[4 * k + 3] } }, { beat: 0, dance: 0, still: 1 });
          const both = each.get(y) ?? [[], []];
          both[0].push([0, out[1], out[2]]); both[1].push([0, q.y, q.z]); each.set(y, both);
        }
        for (const [y, [drawn, shaded]] of each) {
          if (Math.min(...shaded.map((q) => q[1])) < 0.013) continue;
          const by = broadest(shaded, false) / broadest(drawn, false) - 1, name = `${(FORMS.SKIRT as string[])[form]} ${y < 0.2 ? "hem" : y > LEG - 0.01 ? "hips" : "thigh"}`;
          expect([f.i, name, drawn.length > 3, Math.abs(by) < 0.01]).toEqual([f.i, name, true, true]);
          laps[name] = (laps[name] ?? 0) + 1;
        }
      }
    }
    expect([laps["coat hem"] > 5, laps["coat thigh"] > 5, laps["coat hips"] > 2, laps["skirt hem"] > 20, laps["skirt thigh"] > 20, laps["skirt hips"] > 20]).toEqual([true, true, true, true, true, true]);
  });

  it("turns a top's pattern to its colour on the whole wherever a pixel spans two of its bands, along every way they change, and softens a band's edge by a width that never comes to nothing", () => {
    // The fragment shader's one derivative is how far a pixel spans on the figure along each way. Every width it softens an edge by
    // comes from that in the lines the tests run, and is half a width each side of the edge, never less than DRESS_EDGE, so that
    // smoothstep's two ends stay apart, as GLSL needs, on a face the bands do not cross; every other edge is two numbers apart.
    expect(dressLines.match(/fwidth|dFdx|dFdy/g)).toEqual(["fwidth"]);
    expect(dressLines).toContain("vec3 at = vDress.xyz, pixel = fwidth(vDress.xyz);");
    expect(DRESS_EDGE).toBeGreaterThan(0);
    const floored = new Set([...dressLines.matchAll(/(\w+) = max\([^;]*?, (\d+\.\d+)\)/g)].filter((m) => Number(m[2]) === DRESS_EDGE).map((m) => m[1]));
    const edges = [...dressLines.matchAll(/smoothstep\(([^,]+), ([^,]+),/g)].map((m) => [m[1], m[2]]);
    let softened = 0;
    for (const [low, high] of edges) {
      const [, middle, width] = low.match(/^(\d+\.\d+) - (\w+)$/) ?? [];
      if (width === undefined) { expect([low, high].map(Number).every(Number.isFinite)).toBe(true); expect(Number(low)).toBeLessThan(Number(high)); continue; }
      expect([low, high, floored.has(width)]).toEqual([low, `${middle} + ${width}`, true]);
      softened += 1;
    }
    expect([edges.length, softened]).toEqual([6, 3]);
    // Run, the patterns, on figures of four seeds (a tie-dye of two arms, three and four, turning either way), at places across a top
    // from the waist to the shoulders, front, side and back, and close round the tie-dye's centre, where its arms meet; and pixels
    // from a near one's span to many bands', along each way alone.
    // Along a pixel's span the pattern as a point shows it flips between the top's colour and the second so many times; where it
    // flips four times or more, the pixel holds two of its bands, and the face shows none of them, but the top's colour on the whole.
    // A stripe's, a check's and a vest's opening are straight, so where one flips twice the pixel holds a band whole, and the face
    // has begun to turn to that colour; a tie-dye's and a print's bands curve, so a pixel may just graze one.
    const shown = (at: Xyz, pattern: number, seed: number, pixel: Xyz = { x: 0, y: 0, z: 0 }) => runDress({ w: pattern }, { w: seed }, at, pixel)!;
    const point = (at: Xyz, pattern: number, seed: number, pixel?: Xyz) => shown(at, pattern, seed, pixel)[0];
    const places: Xyz[] = [];
    for (const x of [-0.21, -0.13, -0.05, 0.02, 0.09, 0.17]) for (const y of [0.98, 1.1, 1.19, 1.31, 1.43]) for (const z of [-0.12, 0.03, 0.11]) places.push({ x, y, z });
    for (const r of [0, 0.0002, 0.001, 0.004, 0.015]) for (const turn of [0.3, 2.1, 4]) places.push({ x: r * Math.cos(turn), y: 1.24 + r * Math.sin(turn), z: 0.11 });
    const SPANS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32], STEPS = 200, ways = ["x", "y", "z"] as const;
    const patterns = [PATTERN.TIE, PATTERN.STRIPE, PATTERN.CHECK, PATTERN.VEST, PATTERN.PRINT] as number[];
    const coverOf = (pattern: number) => COVER[pattern as keyof typeof COVER];
    const wrong: unknown[] = [], spanned = new Set<string>(), flipping = new Set<string>();
    let held = 0, whole = 0;
    for (const pattern of patterns) for (const seed of [0.2, 0.45, 0.7, 0.95]) for (const at of places) for (const way of ways) for (const span of SPANS) {
      const along = (k: number) => ({ ...at, [way]: at[way] + span * (k / STEPS - 0.5) });
      let flips = 0, was = Math.round(point(along(0), pattern, seed));
      for (let k = 1; k <= STEPS; k++) { const now = Math.round(point(along(k), pattern, seed)); flips += now === was ? 0 : 1; was = now; }
      const [drawn, fine] = shown(at, pattern, seed, { x: 0, y: 0, z: 0, [way]: span });
      if (flips > 0) flipping.add(`${pattern} ${way}`);
      if (flips >= 2 && [PATTERN.STRIPE, PATTERN.CHECK, PATTERN.VEST].includes(pattern) && !(fine > DRESS_FINE[0])) wrong.push({ pattern, seed, at, way, span, flips, fine });
      whole += flips >= 2 && pattern === PATTERN.VEST ? 1 : 0;
      if (flips < 4) continue;
      spanned.add(`${pattern} ${way}`);
      held += 1;
      if (!(Math.abs(drawn - coverOf(pattern)) < 1e-12)) wrong.push({ pattern, seed, at, way, span, flips, drawn });
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect([held > 1000, whole > 100]).toEqual([true, true]);
    // Which reaches every way each pattern's bands change: the tie-dye's two across its chest, the stripes' one round the body, the
    // checks' and the print's all three. A vest has the one band, its opening, across the chest, which a pixel holds once at most.
    const T = PATTERN.TIE, S = PATTERN.STRIPE, C = PATTERN.CHECK, P = PATTERN.PRINT;
    expect([...spanned].sort()).toEqual([`${T} x`, `${T} y`, `${S} y`, `${C} x`, `${C} y`, `${C} z`, `${P} x`, `${P} y`, `${P} z`].sort());
    // And a pixel's span along a way a pattern never changes in fades none of it: stripes seen round, not across, keep their bands.
    for (const pattern of patterns) for (const way of ways) {
      if (flipping.has(`${pattern} ${way}`)) continue;
      for (const seed of [0, 0.7]) for (const at of places) expect(point(at, pattern, seed, { x: 0, y: 0, z: 0, [way]: 0.32 })).toBe(point(at, pattern, seed));
    }
    expect(patterns.flatMap((pattern) => ways.filter((way) => !flipping.has(`${pattern} ${way}`)).map((way) => `${pattern} ${way}`)).sort()).toEqual([`${T} z`, `${S} x`, `${S} z`].sort());
    // A plain top draws no pattern at all.
    expect(runDress({ w: PATTERN.PLAIN }, { w: 0.5 }, { x: 0.02, y: 1.31, z: 0.11 }, { x: 0, y: 0, z: 0 })).toBeUndefined();
  }, 30000);

  it("packs every number a corner carries into what a float holds exactly: each tone in 21 bits, a dye over the things' tone and a seed over the pattern under 2 to the 24th", () => {
    // A float holds every whole number up to 2^24 exactly, and no further: one over it rounds, and its unpacking reads another colour,
    // or another dye, without a word. Each packed number of every figure is whole, under its limit, and comes back from the mesh's own
    // arrays as it went in.
    const LIMIT = 2 ** 24, TONE = 128 ** 3;
    expect(tone(0xffffff, 1)).toBe(TONE - 1);
    expect(DYE).toBe(TONE);
    expect(DYE * CLOTHS.length).toBe(LIMIT);
    expect(PATTERNS * SEEDS).toBeLessThanOrEqual(LIMIT);
    expect(Object.values(PATTERN).every((p) => (p as number) < PATTERNS)).toBe(true);
    for (const c of [crowd, phone, ...SHOWS.map((s) => s.desktop)]) {
      const e = c.each, geo = c.mesh.geometry, color = geo.getAttribute("color").array as Float32Array, toneRow = geo.getAttribute("aTone").array as Float32Array;
      for (let i = 0; i < c.count; i++) {
        const numbers = [e.dress[3 * i], e.dress[3 * i + 1], e.dress[3 * i + 2], e.aTone[4 * i], e.aTone[4 * i + 1], e.aTone[4 * i + 2], e.aTone[4 * i + 3]];
        const limits = [TONE, TONE, PATTERNS * SEEDS, TONE, TONE, TONE, LIMIT];
        expect(numbers.map((v, k) => Number.isInteger(v) && v >= 0 && v < limits[k])).toEqual(numbers.map(() => true));
        const k = c.corners[i];
        expect([...color.subarray(3 * k, 3 * k + 3), ...toneRow.subarray(4 * k, 4 * k + 4)]).toEqual(numbers);
      }
    }
  });

  it("gives no figure a face: the front of every head is one smooth form in its skin, from any camera, with nothing on it", () => {
    // The head is the egg alone where a face would be: every face of it in front of the ears and under the brow takes the figure's skin
    // (SELF), one tone, so nothing marks eyes, a nose or a mouth by colour; and no part stands in front of it there but a cap's bill
    // over the brow and a beard below the mouth. The tones put no pattern on a head (only a top's faces take one).
    const marks = (geo: typeof crowd.figure) => { const m = geo.getAttribute("aMark"), p = geo.getAttribute("position"); return Array.from({ length: p.count }, (_, k) => ({ x: p.getX(k), y: p.getY(k), z: p.getZ(k), mark: vec(m, k) })); };
    for (const geo of [crowd.figure, phone.figure]) {
      const all = marks(geo), egg = all.filter((v) => v.mark.x === 6 && v.mark.y === 0);
      const brow = 1.655 + 0.06, chin = Math.min(...egg.map((v) => v.y)), mouth = chin + 0.05;
      for (let t = 0; t < egg.length; t += 3) {
        const mid = { y: (egg[t].y + egg[t + 1].y + egg[t + 2].y) / 3, z: (egg[t].z + egg[t + 1].z + egg[t + 2].z) / 3 };
        if (mid.z > 0.06 && mid.y < brow - 0.005) expect(egg[t].mark.z % TINTS).toBe(3);
      }
      const front = all.filter((v) => v.mark.y !== 0 && v.mark.x === 6 && v.z > 0.1 && v.y > mouth && v.y < brow - 0.02);
      const allowed = new Set([PART.BILL, PART.BRIM, PART.BAND, PART.CROWN, PART.WREATH, PART.HAIR, PART.BEARD]);
      expect([...new Set(front.map((v) => v.mark.y))].filter((bit) => !allowed.has(bit))).toEqual([]);
      // What may come near the face is over the brow (a bill, a brim, a band, a crown or a wreath), round it (hair) or a beard on the
      // jaw, under the head's middle, never on it.
      for (const v of front.filter((w) => w.mark.y !== PART.HAIR && w.mark.y !== PART.BEARD)) expect(v.y).toBeGreaterThan(1.655 + 0.02);
      for (const v of front.filter((w) => w.mark.y === PART.BEARD)) expect(v.y).toBeLessThan(1.6);
    }
    const out: Rgb = { r: 0, g: 0, b: 0 }, dress = { w: 0 };
    for (const tint of [2, 3, 8]) {
      out.r = tone(0x806040); out.g = tone(0x204080); out.b = PATTERN.TIE + PATTERNS * 7;
      runTones(null, out, { x: 6, y: 0, z: tint, w: 0 }, null, null, 1, null, { x: 0, y: 0, z: 0, w: 1 }, null, { x: tone(0x404040), y: tone(0x303030), z: tone(0x907060), w: 0 }, 0, 0, 0, 0, null, null, dress, {});
      expect([tint, dress.w]).toEqual([tint, 0]);
    }
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
    for (const { who, placed } of all) {
      expect(new Set(who.map((p) => outlineOf(p))).size).toBe(who.length);
      expect(new Set(who.map((p) => outlineOf(plainly(p)))).size).toBe(who.length);
      // And whole groups of the first 150, a phone's crowd, and of the half that the quality ladder leaves, a desktop's and a phone's,
      // are as varied: each still has at least four kinds of everything that makes an outline but a beard.
      for (const few of [150, Math.ceil(who.length / 2), 75].map((n) => who.slice(0, wholeGroups(placed, n)))) {
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

  it("wear their era's coats, hoods and fringes (WARDROBE), each its share of those it can go to: a coat over a shirt and trousers, a hood on a short or tied-back head of hair, a fringe on a poncho or a shawl", () => {
    type Worn = { stature: string; top: string; legs: string; prop: string; hair: string; back: string; coat: string; hood: string; fringe: boolean; hem: number };
    const F = FORMS as Record<string, string[]>, P = PART as Record<string, number>;
    for (const [from, , shares] of WARDROBE as [string, string, Record<string, number>][]) {
      const dealt = all.flatMap(({ placed }) => wardrobe(people(placed), from)) as unknown as Worn[];
      const takes = {
        coat: (p: Worn) => p.stature !== "child" && p.top === "shirt" && ["jeans", "bells", "shorts"].includes(p.legs) && !["hoop", "drum", "stand"].includes(p.prop),
        hood: (p: Worn) => p.coat !== "coat" && ["shirt", "tee"].includes(p.top) && ["bald", "crop", "bun"].includes(p.hair) && !["roll", "both"].includes(p.back) && p.prop !== "rider",
        fringe: (p: Worn) => ["poncho", "shawl"].includes(p.top),
      };
      const wears = { coat: (p: Worn) => p.coat === "coat", hood: (p: Worn) => p.hood === "hood", fringe: (p: Worn) => p.fringe === true };
      for (const name of ["coat", "hood", "fringe"] as const) {
        // None wears one it cannot take, and of those who can, the era's share do: within 8 points, or two and a half times the
        // spread a share of so few has by chance.
        expect([from, name, dealt.filter((p) => wears[name](p) && !takes[name](p)).length]).toEqual([from, name, 0]);
        const can = dealt.filter(takes[name]), share = can.filter(wears[name]).length / can.length, want = shares[name];
        expect([from, name, can.length > 50, Math.abs(share - want) <= Math.max(0.08, 2.5 * Math.sqrt((want * (1 - want)) / can.length))]).toEqual([from, name, true, true]);
      }
      // What each wears is drawn: a coat is the skirt's second form, hemmed from 0.58 to 0.72 of the legs; a hood its own part; a
      // fringe the poncho's second form; and none of it changes who a person is (people() deals them first).
      for (const p of dealt.filter((q) => q.coat === "coat").slice(0, 20)) {
        expect([(formsOf(p) as Record<number, number>)[P.SKIRT], wearing(p).parts & P.SKIRT, p.hem >= 0.58 && p.hem <= 0.72]).toEqual([F.SKIRT.indexOf("coat"), P.SKIRT, true]);
      }
      for (const p of dealt.filter((q) => q.hood === "hood").slice(0, 20)) expect(wearing(p).parts & P.HOOD).toBe(P.HOOD);
      for (const p of dealt.filter((q) => q.fringe).slice(0, 20)) expect((formsOf(p) as Record<number, number>)[P.PONCHO]).toBe(F.PONCHO.indexOf("fringed"));
      const bare = (p: object, keys: string[]) => Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k)));
      expect(dealt.map((p) => bare(p, ["coat", "hood", "fringe", "hem"]))).toEqual(all.flatMap(({ placed }) => people(placed)).map((p) => bare(p, ["hem"])));
    }
    // The sixties and seventies wear no hoods; the nineties the most coats and hoods.
    expect((WARDROBE as [string, string, Record<string, number>][]).map(([, , w]) => w.hood)).toEqual([0, 0, 0.15, 0.35]);
  });

  it("spread their heights and builds by seed, each within its stature's and its build's range, and every build and stature has its share", () => {
    // How tall each is beside the standard figure, by stature; its girth and shoulders by build (a child's its own); its legs' length
    // and its head's size: the ranges people() deals from, which the figure's aBody carries to the shader.
    const TALLS: Record<string, number[]> = { child: [0.52, 0.66], teen: [0.72, 0.82], short: [0.84, 0.92], mid: [0.93, 1.01], tall: [1.02, 1.08] };
    const GIRTHS: Record<string, number[]> = { slight: [0.82, 0.92], average: [0.95, 1.08], stout: [1.32, 1.6], broad: [1.0, 1.12], pear: [1.2, 1.4] };
    const WIDES: Record<string, number[]> = { slight: [0.8, 0.9], average: [0.92, 1.0], stout: [0.95, 1.04], broad: [1.02, 1.04], pear: [0.8, 0.88] };
    const within = (v: number, [lo, hi]: number[]) => v >= lo && v <= hi;
    const everyone = all.flatMap(({ who }) => who), out: string[] = [];
    for (const p of everyone) {
      const child = p.stature === "child";
      if (!within(p.tall, TALLS[p.stature])) out.push(`${p.stature} ${p.tall}`);
      if (!within(p.girth, child ? [0.9, 1.05] : GIRTHS[p.build])) out.push(`${p.build} girth ${p.girth}`);
      if (!within(p.wide, child ? [0.88, 0.96] : WIDES[p.build])) out.push(`${p.build} wide ${p.wide}`);
      if (!within(p.leg, child ? [0.86, 0.92] : [0.93, 1.07])) out.push(`legs ${p.leg}`);
      if (!within(p.big, child ? [1.22, 1.32] : p.stature === "teen" ? [1.08, 1.12] : [0.95, 1.05])) out.push(`head ${p.big}`);
    }
    expect(out).toEqual([]);
    // Spread across each range, not bunched: an adult's height fills the span from short to tall, and every build and stature is dealt
    // near its share (CHOICES), within half of it.
    const adults = everyone.filter((p) => !["child", "teen"].includes(p.stature)).map((p) => p.tall);
    expect([Math.min(...adults) < 0.85, Math.max(...adults) > 1.07]).toEqual([true, true]);
    // And as the statures share the adults out: on average a little under the standard figure, spread about it by some 6 % of it.
    const average = adults.reduce((sum, t) => sum + t, 0) / adults.length, spread = Math.sqrt(adults.reduce((sum, t) => sum + (t - average) ** 2, 0) / adults.length);
    expect([adults.length > 500, average > 0.955 && average < 0.985, spread > 0.055 && spread < 0.07]).toEqual([true, true, true]);
    for (const [slot, choices] of [["build", CHOICES.build], ["stature", CHOICES.stature]] as [string, [string, number][]][]) {
      const total = choices.reduce((sum, [, w]) => sum + w, 0);
      for (const [name, w] of choices) {
        const share = everyone.filter((p) => (p as unknown as Record<string, string>)[slot] === name).length / everyone.length;
        expect([slot, name, share > (0.5 * w) / total && share < (1.5 * w) / total]).toEqual([slot, name, true]);
      }
    }
    // And the figure is drawn as its person is built: its girth, shoulders, legs and head in aBody.
    const drawn = figuresOf(hills[1]), dealt = all[1].who;
    expect(drawn.map((f) => [f.body.x, f.body.y, f.body.z, f.body.w])).toEqual(dealt.map((p) => [p.girth, p.wide, p.leg, p.big].map(Math.fround)));
  });

  it("are the same people at the same seats for a smaller crowd as for a larger, and the same every time", () => {
    const { who, placed } = all[1];
    expect(wardrobe(people(placed))).toEqual(who);
    expect(wardrobe(people(placed.slice(0, 150)))).toEqual(who.slice(0, 150));
    expect(wardrobe(people(placed.slice(0, 40)))).toEqual(who.slice(0, 40));
    // A phone's crowd on the first hill is the desktop's first whole groups up to 150, each drawn plainly.
    expect(phone.count).toBe(wholeGroups(placedOf.get(crowd)!, 150));
    // Each wears what it is, as its stance has it, which its own numbers say (stances).
    const stanceOf = (f: Figure) => { const st = Math.floor(f.wear.y / 16384); return { stand: (STANDS as string[])[st % 16], sit: (SITS as string[])[Math.floor(st / 16)] }; };
    expect(phones.map((f) => f.wear.x)).toEqual(peopleOf(crowd).slice(0, phone.count).map((p, i) => wearing(plainly({ ...p, stance: stanceOf(phones[i]) })).parts));
    expect(figures.map((f) => [f.wear.x, f.wear.y])).toEqual(peopleOf(crowd).map((p, i) => { const w = wearing({ ...p, stance: stanceOf(figures[i]) }); return [w.parts, w.style]; }));
    // and a phone's first figures stand and sit as the desktop's do.
    expect(phones.map(stanceOf)).toEqual(figures.slice(0, phone.count).map(stanceOf));
  });

  it("carry a few of each thing across the hill, sparingly, and nothing overhead between a test pose and the band", () => {
    for (const { who, placed } of all) {
      const carried = (list: typeof who) => Object.fromEntries((PROPS as string[]).map((prop) => [prop, list.filter((p) => p.prop === prop).length]));
      // One figure in PROP_EVERY at the most carries something, each thing in its turn: three to seven of each on a desktop for each
      // time it comes in the turn, a child on the shoulders twice.
      const counts = carried(who), turns = (prop: string) => (PROPS as string[]).filter((other) => other === prop).length;
      expect(turns("rider")).toBe(2);
      for (const prop of PROPS as string[]) { expect([prop, counts[prop] >= 3 * turns(prop)]).toEqual([prop, true]); expect([prop, counts[prop] <= 7 * turns(prop)]).toEqual([prop, true]); }
      expect(who.filter((p) => p.prop !== "none").length).toBeLessThanOrEqual(Math.ceil(who.length / PROP_EVERY));
      // A phone's 150 have at least one of each that a phone draws, which is all but a hoop and a drum: what rises over the heads,
      // a child on the shoulders among it, is the skyline a phone keeps.
      const few = carried(who.slice(0, 150).map((p) => plainly(p)) as typeof who);
      for (const prop of (PROPS as string[]).filter((prop) => prop !== "hoop" && prop !== "drum")) expect([prop, few[prop] >= 1]).toEqual([prop, true]);
      expect([few.hoop, few.drum]).toEqual([0, 0]);
      // What stands over a head stands out of each test pose's view of the band.
      expect([...(OVERHEAD as string[])].sort()).toEqual((PROPS as string[]).filter((prop) => !["finger", "hoop", "drum"].includes(prop)).sort());
      who.forEach((p, i) => { if ((OVERHEAD as string[]).includes(p.prop)) expect([p.prop, i, inView(placed[i].x, placed[i].z)]).toEqual([p.prop, i, false]); });
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
    // And day 198's, where a hoop, which leaves its holder only to sway, once fell to a figure whose swaying made a patch.
    for (const seed of [...Array.from({ length: 30 }, (_, k) => k), 198]) {
      const placed = seatsOf({ path: [], line: [], landmarks: [] }, seed) as { x: number; z: number }[], who = people(placed) as { move: string }[];
      const patches = who.filter((p, i) => {
        const near = who.map((q, j) => ({ q, d: Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z) })).filter((_, j) => j !== i).sort((a, b) => a.d - b.d).slice(0, 4);
        return near.every(({ q }) => q.move === p.move);
      }).length;
      expect([seed, patches]).toEqual([seed, 0]);
    }
  }, 30000);

  it("stand and sit each unlike its neighbours: no two within 1.6 m share a pose, standing or seated, and every way of standing and sitting has its share", () => {
    // A figure's pose standing is what its arms do and which leg its weight is on (poseOf); seated, how it sits and what it holds. Read
    // from each figure's own numbers on three hills, a desktop's whole crowd each.
    const stanceOf = (c: typeof crowd, i: number) => { const st = Math.floor(c.each.aWear[4 * i + 1] / 16384); return { stand: (STANDS as string[])[st % 16], sit: (SITS as string[])[Math.floor(st / 16)] }; };
    const share: Record<string, number> = {};
    let clashes = 0, crowded = 0, pairs = 0, standing = 0, seated = 0, friends = 0;
    for (const c of hills) {
      const placed = placedOf.get(c)!, who = peopleOf(c), dealt = placed.map((_, i) => stanceOf(c, i));
      placed.forEach((seat, i) => {
        const key = `${seat.sit ? "sit" : "stand"} ${seat.sit ? dealt[i].sit : dealt[i].stand}`;
        share[key] = (share[key] ?? 0) + 1;
        if (seat.sit) seated += 1; else standing += 1;
        if (["round", "roundLeft"].includes(dealt[i].stand)) friends += 1;
        for (let j = i + 1; j < placed.length; j++) {
          if (Math.hypot(placed[j].x - seat.x, placed[j].z - seat.z) >= 1.6) continue;
          pairs += 1;
          if (poseOf(who[i], dealt[i].stand) === poseOf(who[j], dealt[j].stand)) clashes += 1;
          if (`${dealt[i].sit} ${who[i].prop}` === `${dealt[j].sit} ${who[j].prop}`) { if (seat.sit || placed[j].sit) clashes += 1; else crowded += 1; }
        }
      });
    }
    expect(pairs).toBeGreaterThan(300);
    expect(clashes).toBe(0);
    // Friends are few as dealt, and these hills have one pair: the free-armed day's stand together too.
    const free = befriended();
    for (let i = 0; i < free.count; i++) {
      const { stand } = stanceOf(free, i);
      if (stand.startsWith("round") || stand.startsWith("waist")) share[`stand ${stand}`] = (share[`stand ${stand}`] ?? 0) + 1;
      if (stand.startsWith("round")) friends += 1;
    }
    // Two that stand sit only as the whole crowd does (uSit), and a few of them share a way of sitting where the ground or the bear
    // lets one of them sit only one way (stances): on forty days' crowds, 21 pairs of 8,024 neighbours (#207's text).
    expect(crowded).toBeLessThanOrEqual(pairs / 200);
    // Every way of standing and of sitting is there; on one leg or the other, about half of those that stand; none is over 40 % of its
    // kind, and the least is one in a hundred: the arm round a friend, in pairs, and lying back, on a blanket.
    for (const stand of STANDS as string[]) expect([stand, (share[`stand ${stand}`] ?? 0) > 0]).toEqual([stand, true]);
    for (const sit of SITS as string[]) expect([sit, (share[`sit ${sit}`] ?? 0) > 0]).toEqual([sit, true]);
    const of = (kind: string, names: string[]) => names.reduce((n, name) => n + (share[`${kind} ${name}`] ?? 0), 0) / (kind === "sit" ? seated : standing);
    expect(of("stand", ["left", "right"])).toBeGreaterThan(0.4);
    expect(of("stand", ["left", "right"])).toBeLessThan(0.65);
    expect(Math.max(...(STANDS as string[]).map((name) => of("stand", [name])), ...(SITS as string[]).map((name) => of("sit", [name])))).toBeLessThan(0.4);
    expect(of("sit", ["recline"])).toBeGreaterThan(0.005);
    expect(friends).toBeGreaterThan(1);
    // Friends stand in twos: as many hold the other round its waist as round its shoulders.
    expect((STANDS as string[]).filter((name) => name.startsWith("waist")).reduce((n, name) => n + (share[`stand ${name}`] ?? 0), 0)).toBe(friends);
  });

  it("deals no way of sitting to one it is not for, even where no way fits: no one in a full poncho hugs its knees or has them up, and no one with anything on its back leans back on its hands", () => {
    // From behind, a figure in a full poncho hid all but half a percent of its legs hugging its knees, and 2.19 % with them up (the
    // from-behind test below); and one leaning back with a pack or a bedroll on it reached past the seated reaches (the reach test).
    // Each figure's way of sitting, which it takes seated and, standing or not, when the whole crowd sits (uSit), against who it is:
    // on the fixed day's hill as a desktop and a phone draw it and on two more days', as dealt; on a desktop's and a phone's crowds
    // with every seated figure covered in turn (MIXES); and with every figure in a full poncho and every grown one stout, of whom the
    // broadest fit no way but kneeling, so that buildCrowd keeps them no broader than kneels clear of the visitor's bear.
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const budgets = Object.fromEntries(["desktop", "phone"].map((tier) => [tier, budgetFor(tier) as { crowd: number; grid: number }]));
    vi.unstubAllGlobals();
    const ponchoed = (who: Person[]) => who.map((p, i) => ({ ...p, top: "poncho", ...(p.stature !== "child" ? { build: "stout", girth: 1.32 + 0.28 * ((i * 0.618) % 1), wide: 1.04 } : {}) }));
    const crowds: [typeof crowd, Person[]][] = [crowd, phone, hills[1], hills[2]].map((c) => [c, peopleOf(c)]);
    for (const [tier, small] of [["desktop", false], ["phone", true]] as const) for (const [mix, seed] of [[MIXES.covered, 3], [MIXES.covered, 4], [ponchoed, 5], [ponchoed, 6]] as const) {
      let who: Person[] = [];
      const c = buildCrowd(new THREE.Scene(), { count: budgets[tier].crowd, path, line, landmarks: [], plain: small, seed, mix: (w: Person[], placed: { sit: boolean }[]) => (who = mix(w, placed)) });
      crowds.push([c, who]);
    }
    let ponchos = 0, packed = 0, broadest = 0;
    for (const [c, who] of crowds) for (let i = 0; i < c.count; i++) {
      const sits = SITS[Math.floor(Math.floor(c.each.aWear[4 * i + 1] / 16384) / 16)], p = who[i];
      if (p.top === "poncho") {
        ponchos += 1;
        expect([i, p.top, ["knees", "hug"].includes(sits)]).toEqual([i, "poncho", false]);
        const kneels = c.each.aSize[4 * i] * (LOW.kneel[0] + LOW.kneel[1] * c.each.aBody[4 * i]);
        expect(kneels).toBeLessThanOrEqual(own.hang - BEAR_LEGS);
        broadest = Math.max(broadest, kneels);
      }
      if (p.back !== "none") packed += 1;
      if (sits === "back") expect([i, p.back]).toEqual([i, "none"]);
    }
    expect(ponchos).toBeGreaterThan(800);
    expect(packed).toBeGreaterThan(200);
    // Some are as broad as that lets them be: before, on forty days' crowds, 88 of 2,383 in ponchos were up to 2.4 cm broader at the
    // knee, and 70 of them, fitting no other way, had their knees up.
    expect(broadest).toBeGreaterThan(own.hang - BEAR_LEGS - 0.002);
    // And where nothing fits at all, one in a full poncho kneels and anyone else has its knees up (stances).
    const placed = placedOf.get(crowd)!, anyone = peopleOf(crowd).map((p, i) => (i % 2 ? { ...p, top: "poncho" } : p));
    (stances(placed, anyone, () => false) as { sit: string }[]).forEach(({ sit }, i) => expect([i, sit]).toEqual([i, anyone[i].top === "poncho" ? "kneel" : "knees"]));
  }, 30000);

  it("holds a friend: two friends stand side by side, each one's hand rests on the other's back, dancing or not, and they dance as one, on six more days", () => {
    // Each pair on the hills and the shows' own, and on three more days' gatherings as a desktop draws them, and two days' with every
    // standing figure free-armed: the one whose arm is round the other's waist and its friend, the taller, whose arm is round its
    // shoulders. Each hand's middle, where the shader puts it, against the other's body where the shader puts that (its torso, hips,
    // neck and shoulders), in the other's own units, through a cycle standing still and dancing. Paired by their seats' distance alone,
    // within 0.9 of the slighter one's own units across, a pair on a slope or of two sizes rested a hand on the other's thighs or over
    // its shoulders, 0.1 off its back standing still, and dancing each its own way took it 0.27 off (seed 62). On ten of seeds 75 to 99
    // a hand went past the bounds below, as far as 0.12 off (seed 84, here); and on 23 and 31, here, a sweep of sixty days found the
    // hands that go furthest in under the other's back and out from it. Friends are few: on sixty days' gatherings, 46 pairs, and none
    // on 29 of the days (#207's text). On 23, and on 95 free-armed, a gate that let a hand rest further across a back (ON_BACK.across
    // to [-0.2, 0.1]) took one 0.063 off it, and 0.071.
    // Each figure's friend is the one beside it facing the same way that dances at its phase, which is the one that leads it.
    const stanceOf = (c: typeof crowd, i: number) => (STANDS as string[])[Math.floor(c.each.aWear[4 * i + 1] / 16384) % 16];
    // A hand is a mitten, a ball 0.05 round drawn in to 0.6 of it across and to 0.95 of it ahead.
    const handOf = (side: number) => rich.filter((v) => v.mark.x === (side < 0 ? 3 : 4) && v.mark.y === 0 && Math.abs(Math.hypot((v.x - side * SHOULDER_X) / 0.6, v.y - (SHOULDER_Y - 0.565), v.z / 0.95) - 0.05) < 1e-4);
    const position = crowd.figure.getAttribute("position"), marks = crowd.figure.getAttribute("aMark"), body: Vertex[][] = [];
    for (let t = 0; t < position.count; t += 3) if (marks.getX(t) === 0 && marks.getY(t) === 0) body.push([0, 1, 2].map((k) => ({ x: position.getX(t + k), y: position.getY(t + k), z: position.getZ(t + k), mark: vec(marks, t + k) })));
    const m = new THREE.Matrix4(), triangle = new THREE.Triangle(), near = new THREE.Vector3(), normal = new THREE.Vector3();
    const gaps: Record<string, number[]> = { dealt: [], free: [] }, days = [23, 31, 84];
    let rested = 0, pairs = 0;
    for (const [c, mix] of [...[...hills, ...SHOWS.map((s) => s.desktop), ...days.map((seed) => buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [], seed }))].map((c) => [c, "dealt"]),
      [buildCrowd(new THREE.Scene(), { count: Infinity, path, line, landmarks: [], seed: 95, mix: MIXES.free }), "free"], [befriended(), "free"]] as [typeof crowd, string][]) {
      const figs = figuresOf(c), seats2 = c.ground.seats as Seat[];
      const at = (f: Figure, v: Vertex, pose: Pose) => { const p = put(f, v, pose); return new THREE.Vector3(p.x, p.y, p.z); };
      for (let i = 0; i < c.count; i++) {
        if (!stanceOf(c, i).startsWith("waist")) continue;
        const j = figs.map((f, q) => q).filter((q) => stanceOf(c, q).startsWith("round") && c.each.aSize[4 * q + 2] === c.each.aSize[4 * i + 2] && figs[q].fig.y === figs[i].fig.y)
          .reduce((a, q) => (a < 0 || Math.hypot(seats2[q].x - seats2[i].x, seats2[q].z - seats2[i].z) < Math.hypot(seats2[a].x - seats2[i].x, seats2[a].z - seats2[i].z) ? q : a), -1);
        expect(j).toBeGreaterThanOrEqual(0);
        pairs += 1;
        // Side by side, facing the same way: each stands straight out to the other's side, the side its stance says. And they dance
        // as one: the same way, at the same phase and as far.
        for (const [a, b] of [[i, j], [j, i]]) {
          const face = c.each.aSize[4 * a + 2], dx = seats2[b].x - seats2[a].x, dz = seats2[b].z - seats2[a].z;
          const across = Math.cos(face) * dx - Math.sin(face) * dz, ahead = Math.sin(face) * dx + Math.cos(face) * dz;
          expect(Math.abs(ahead)).toBeLessThan(1e-5);
          expect(Math.sign(across)).toBe(stanceOf(c, a).endsWith("Left") ? -1 : 1);
        }
        expect([figs[i].wear.y % 8, figs[i].fig.y, figs[i].wear.w]).toEqual([figs[j].wear.y % 8, figs[j].fig.y, figs[j].wear.w]);
        for (const [a, b] of [[i, j], [j, i]]) {
          const side = stanceOf(c, a).endsWith("Left") ? -1 : 1, hand = handOf(side), own = figs[a].body;
          for (const dance of [0, 1.2, 1.6]) for (let beat = 0.1; beat < CYCLE; beat += 0.5) {
            const pose = { beat, dance }, mid = hand.reduce((sum, v) => sum.add(at(figs[a], v, pose)), new THREE.Vector3()).multiplyScalar(1 / hand.length);
            // Standing still, the hand rests where FRIEND_HAND says, out and up with the figure's shoulders and legs: within 0.01. One
            // that shifts its weight rests its hand round a waist 0.05 lower and nearer (shifted), where the gate took it to rest where
            // the others' does, 0.043 to 0.05 from where it does (on the free-armed days).
            if (dance === 0 && beat === 0.1) {
              const [x0, y0, z0] = FRIEND_HAND[stanceOf(c, a).startsWith("round") ? "round" : MOVES[figs[a].wear.y % 8] === "shift" ? "shifted" : "waist"];
              expect(Math.hypot(side * mid.x - x0 - SHOULDER_X * (own.y - 1), mid.y - y0 - LEG * (own.z - 1), mid.z - z0)).toBeLessThan(0.01);
              rested += 1;
            }
            mid.applyMatrix4(m.fromArray(c.each.matrix, 16 * a)).applyMatrix4(m.fromArray(c.each.matrix, 16 * b).invert());
            // How far its middle stands out from the other's surface, or (below nought) in under it: by the nearest face, and the
            // way that face looks out.
            let gap = Infinity, out = 1;
            for (const t of body) {
              triangle.set(...t.map((v) => at(figs[b], v, pose)));
              triangle.closestPointToPoint(mid, near);
              if (near.distanceTo(mid) < gap) { gap = near.distanceTo(mid); out = Math.sign(triangle.getNormal(normal).dot(mid.clone().sub(near))) || 1; }
            }
            gaps[mix].push(gap * out);
          }
        }
      }
    }
    // Some pairs to look at, whatever the mix of people (22 on these crowds, 13 of them the free-armed days'). As the world deals
    // them, every hand's middle no further off the other's body than the hand's own half-breadth (0.05), and no more than 0.03 in
    // under it, so that the hand is on it and its half that faces out shows: on the sixty days, from 0.0241 in to 0.0425 out, and
    // here from 0.0151 in to 0.0395 out. A hand 0.05 in, buried to its back, fails. With every standing figure free-armed, which the
    // world never deals, on 460 days (0 to 99 and 300 to 659) 1,585 pairs went from 0.0385 in to 0.0616 out, past those on 17 days:
    // the furthest out (seed 577) stood 0.051 off standing still, where its friend's back is further from it than backOf has it. So
    // there, within 0.042 and 0.065: here from 0.022 in to 0.0423 out.
    expect(pairs).toBeGreaterThanOrEqual(3);
    expect(rested).toBe(2 * pairs);
    expect(Math.max(...gaps.dealt)).toBeLessThan(0.05);
    expect(Math.min(...gaps.dealt)).toBeGreaterThan(-0.03);
    expect(Math.max(...gaps.free)).toBeLessThan(0.065);
    expect(Math.min(...gaps.free)).toBeGreaterThan(-0.042);
    // The friend's back, as backOf has it, is the body's own: half its depth behind the spine, at the hips, the middle and under the
    // shoulders, for the standard figure.
    expect([backOf(0.93, 1), backOf(1.01, 1), backOf(1.4, 1)].map((v) => Math.round(v * 1000))).toEqual([124, 107, 160]);
  }, 30000);

  it("dance as far as each will: a third only a little, a quarter to a half as far as the rest, and the rest from 0.62 of the way to all of it", () => {
    // How far a figure dances is its aWear.w (DANCE), drawn with its person (QUIET).
    const sizes = [...SHOWS.flatMap(({ desktop }) => figuresOf(desktop)), ...figures].map((f) => f.wear.w);
    const quiet = sizes.filter((w) => w < 0.5);
    expect(sizes.length).toBeGreaterThan(900);
    expect(quiet.length / sizes.length).toBeGreaterThan(QUIET - 0.06);
    expect(quiet.length / sizes.length).toBeLessThan(QUIET + 0.06);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.25);
    expect(Math.min(...sizes.filter((w) => w >= 0.5))).toBeGreaterThanOrEqual(0.62);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1);
    expect(QUIET).toBeCloseTo(1 / 3, 1);
  });

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
      // So none seated turns on the spot, where buildCrowd looks only at a standing one's sweep over the ground.
      expect(who.filter((p, i) => placed[i].sit && p.move === "spin").length).toBe(0);
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
    // A part in another of its forms (FORMS) is the same part, its bit once, and its form is the person's own (formsOf).
    const formed = (p: Record<string, unknown>) => [worn(p).parts, formsOf({ ...base, ...p })];
    expect(formed({ head: "knit" })).toEqual([P.CROWN, { [P.CROWN]: 1 }]);
    expect(formed({ head: "jester", hair: "dreads" })).toEqual([P.CROWN + P.HAIR, { [P.CROWN]: 2, [P.HAIR]: 1 }]);
    expect(formed({ head: "plumed", hair: "bun" })).toEqual([P.BRIM + P.CROWN + P.HAIR, { [P.CROWN]: 3, [P.HAIR]: 2 }]);
    expect(formed({ head: "flowers", prop: "pennant", move: "sway" })).toEqual([P.WREATH + P.POLE + P.FLAG, { [P.WREATH]: 1, [P.FLAG]: 2 }]);
    expect(formed({ prop: "puppet", move: "watch" })).toEqual([P.POLE + P.FLAG, { [P.POLE]: 1, [P.FLAG]: 7 }]);
    expect(formed({ prop: "bunch" })).toEqual([P.BALLOON, { [P.BALLOON]: 1 }]);
    expect(formed({ prop: "tambourine", move: "watch" })).toEqual([P.FINGER, { [P.FINGER]: 2 }]);
    expect(formed({ head: "hat", prop: "flag" })).toEqual([P.BRIM + P.CROWN + P.POLE + P.FLAG, {}]);
    expect(worn({ prop: "aloft", move: "watch" }).style).toBe(move("watch") + 8 * 2);
    expect(worn({ prop: "moon", move: "watch" }).style).toBe(move("watch") + 8);
    // A stance goes above the cut: how it stands in the ones of STANCE, how it sits in its sixteens; a cup is a part.
    const STANCE = 16384, stance = (stand: string, sit: string) => STANCE * ((STANDS as string[]).indexOf(stand) + 16 * (SITS as string[]).indexOf(sit));
    expect(worn({ move: "watch", stance: { stand: "akimbo", sit: "knees" } }).style).toBe(move("watch") + stance("akimbo", "knees"));
    expect(worn({ move: "watch", prop: "finger", stance: { stand: "left", sit: "kneel" } }).style).toBe(move("watch") + 8 * 2 + stance("left", "kneel"));
    expect(worn({ move: "nod", legs: "bells", stance: { stand: "folded", sit: "recline" } }).style).toBe(move("nod") + 64 * C.BELLS + stance("folded", "recline"));
    expect(worn({ move: "watch", stance: { stand: "cup", sit: "hug" } })).toEqual({ parts: P.CUP, style: move("watch") + stance("cup", "hug") });
    // and the whole of it is a whole number a 32-bit float holds exactly, at the most.
    expect(worn({ legs: "bells", hair: "afro", top: "shawl", prop: "hoop", move: "shift", stance: { stand: "pockets", sit: "recline" } }).style).toBeLessThan(2 ** 24);
    // A phone's: a wreath or flowers a band, braids one tail, a bedroll a pack, and no beard, hoop or drum, so its arms hold none;
    // a child on the shoulders it keeps, which rises over the heads round it.
    const lean = plainly({ ...base, head: "wreath", hair: "braids", beard: true, back: "roll", prop: "rider", move: "sway" });
    expect(wearing(lean)).toEqual({ parts: P.BAND + P.TAIL + P.PACK + P.RIDER, style: move("sway") + 8 * 3 });
    expect(wearing(plainly({ ...base, head: "flowers", prop: "hoop", move: "sway" }))).toEqual({ parts: P.BAND, style: move("sway") });
    expect(wearing(plainly({ ...base, prop: "drum" }))).toEqual({ parts: 0, style: move("bob") });
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
    // It is the fall of the plane the figure lies on (groundUnder), which fits the hill where the figure rests on it, standing or
    // seated as its seat has it: within a hundredth of a unit of the hill's own fall from the seat to FOOT[0] ahead.
    const turn = new THREE.Quaternion(), forward = new THREE.Vector3();
    let falls = 0, apart = 0;
    for (let i = 0; i < crowd.count; i++) {
      matrix.fromArray(crowd.each.matrix, 16 * i);
      matrix.decompose(at, turn, size);
      forward.set(0, 0, 1).applyQuaternion(turn).multiplyScalar(FOOT[0] * size.z);
      const fall = (height(at.x, at.z) - height(at.x + forward.x, at.z + forward.z)) / size.y;
      const [wide, tall, face] = crowd.each.aSize.slice(4 * i, 4 * i + 3), cos = Math.cos(face), sin = Math.sin(face);
      const ground = (x: number, z: number) => height(at.x + wide * (cos * x + sin * z), at.z + wide * (cos * z - sin * x));
      const stance = Math.floor(crowd.each.aWear[4 * i + 1] / 16384), sits = SITS[Math.floor(stance / 16)], seated = fig.getX(i) === 1;
      const worn = { parts: crowd.each.aWear[4 * i], style: crowd.each.aWear[4 * i + 1], wide: crowd.each.aBody[4 * i + 1] };
      expect(fig.getW(i)).toBeCloseTo(groundUnder(ground, tall, seated ? sits : "stand", seated ? "stand" : sits, worn).drop, 5);
      apart = Math.max(apart, Math.abs(fig.getW(i) - fall));
      // The hill never falls or rises further ahead of a seat than the feet are let to follow.
      expect(fig.getW(i)).toBeGreaterThanOrEqual(DROP[0]);
      expect(fig.getW(i)).toBeLessThanOrEqual(DROP[1]);
      if (fall > 0.02) falls += 1;
    }
    // The figures face the stage, down the hill: for most of them the ground falls away ahead.
    expect(falls).toBeGreaterThan(crowd.count / 2);
    expect(apart).toBeLessThan(0.01);
  });
});

describe("the crowd's skyline", () => {
  // Every figure of three crowds, as a desktop draws them: the fixed day's, a hill with landmarks of its own, and a show's.
  const crowds = [crowd, hills[2], SHOWS[1].desktop];
  const HEAD = 6, OVER = [PART.FLAG, PART.BALLOON, PART.POLE, PART.FINGER] as number[];
  const POSES: [string, Pose][] = [["standing", { beat: 0, dance: 0 }], ...[0.4, 1.3, 2.6, 3.5, 5.1, 6.7].flatMap((beat): [string, Pose][] => [["dancing", { beat, dance: 1.2 }], ["dancing hard", { beat, dance: 1.6 }]]),
    ["risen", { beat: 2.2, dance: 1.6, rise: 1 }], ["seated", { beat: 1.1, dance: 1.2, sit: 1 }], ["held still", { beat: 0.7, dance: 1.6, still: 1, rising: 0 }]];
  // Each triangle of a crowd's figure, its corners and its marks.
  const trianglesOf = (c: typeof crowd) => {
    const position = c.figure.getAttribute("position"), mark = c.figure.getAttribute("aMark"), out: Vertex[][] = [];
    for (let t = 0; t < position.count; t += 3) out.push([0, 1, 2].map((k) => ({ x: position.getX(t + k), y: position.getY(t + k), z: position.getZ(t + k), mark: vec(mark, t + k) })));
    return out;
  };
  const carriesOver = (f: Figure) => OVER.some((bit) => Math.floor(f.wear.x / bit) % 2 === 1);

  it("keeps a crest of one of a kind on every head: no two standing figures within CREST m share what shows over their shoulders, on a desktop or as a phone draws them", () => {
    // A crest is what rises over a figure's shoulders against the screen, the sea or the hill, from where a visitor stands: what it
    // wears on its head, its hair, what it holds up (a hoop and a drum stay down at its body) and how tall it stands. Three hills,
    // a desktop's whole crowd each and a phone's first 150, plainly.
    expect(CREST).toBe(8);
    const all = hills.map((c) => ({ who: peopleOf(c), placed: placedOf.get(c)! }));
    const counts: string[] = [];
    for (const { who, placed } of all) for (const phoneOnly of [false, true]) {
      const n = phoneOnly ? wholeGroups(placed, 150) : who.length, crest = who.slice(0, n).map((p) => crestOf(phoneOnly ? plainly(p) : p));
      const standing = Array.from({ length: n }, (_, i) => i).filter((i) => !placed[i].sit);
      let pairs = 0, same = 0, nearest = Infinity;
      for (const i of standing) for (const j of standing) {
        if (j <= i) continue;
        const d = Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z);
        if (d < CREST) { pairs += 1; if (crest[i] === crest[j]) same += 1; }
        if (crest[i] === crest[j]) nearest = Math.min(nearest, d);
      }
      expect([phoneOnly, same]).toEqual([phoneOnly, 0]);
      expect(pairs).toBeGreaterThan(phoneOnly ? 500 : 1500);
      expect(nearest).toBeGreaterThanOrEqual(CREST);
      const kinds = new Set(standing.map((i) => crest[i])).size;
      expect(kinds).toBeGreaterThan(0.7 * standing.length);
      counts.push(`${kinds}/${standing.length}`);
    }
    // And they are many: on the first hill, of 195 standing on a desktop, 160 crests; of the phone's 117, 96.
    expect(counts.slice(0, 2)).toEqual(["160/195", "96/117"]);
    // What makes a crest has its kinds: twelve heads, ten heads of hair, fifteen things held up and five heights, each worn standing.
    const who = all[0].who.filter((_, i) => !all[0].placed[i].sit);
    expect([new Set(who.map((p) => p.head)).size, new Set(who.map((p) => p.hair)).size, new Set(who.map((p) => p.prop)).size, new Set(who.map((p) => p.stature)).size]).toEqual([12, 10, 18, 5]);
  });

  it("holds what it holds up clear of its own head, its hat and its hair, standing, dancing, risen, seated and held still", () => {
    // Each figure that holds something up, its pole, what flies or stands on it and its balloons, against the triangles of its head,
    // what it wears there and its hair, as the shader puts both: no edge of the one passes through a face of the other, and no
    // corner of the one comes within a centimetre of the other.
    const ray = new THREE.Ray(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3(), triangle = new THREE.Triangle(), near = new THREE.Vector3();
    const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    const hits: string[] = [];
    let carriers = 0, least = Infinity;
    for (const c of crowds) {
      const all2 = trianglesOf(c), named = (f: Figure) => `${f.i} (${Object.entries(PART).filter(([, bit]) => carries(f, bit as number, f.forms?.[bit as number] ?? 0)).map(([name, bit]) => `${name}${f.forms?.[bit as number] ? `.${FORMS[name as keyof typeof FORMS][f.forms[bit as number]]}` : ""}`).join(" ")}, head ${f.body.w.toFixed(2)})`;
      for (const f of figuresOf(c).filter(carriesOver)) {
        carriers += 1;
        const worn = all2.filter((t) => wears(f, t[0]));
        const heads = worn.filter((t) => t[0].mark.x === HEAD), held = worn.filter((t) => OVER.includes(t[0].mark.y) && t[0].mark.x !== HEAD);
        for (const [state, pose] of POSES) {
          const H = heads.map((t) => t.map((v) => v3(put(f, v, pose)))), O = held.map((t) => t.map((v) => v3(put(f, v, pose))));
          const what = (k: number, j: number) => ` [${heads[k][0].mark.y}.${formOfMark(heads[k][0].mark.z)} by ${held[j][0].mark.y}.${formOfMark(held[j][0].mark.z)} at ${O[j][0].y.toFixed(2)}]`;
          const box = new THREE.Box3().setFromPoints(H.flat()).expandByScalar(0.02);
          for (const [j, o] of O.entries()) {
            if (!box.intersectsBox(new THREE.Box3().setFromPoints(o))) continue;
            for (const [k, h] of H.entries()) {
              triangle.set(h[0], h[1], h[2]);
              for (const p of o) { triangle.closestPointToPoint(p, near); least = Math.min(least, near.distanceTo(p)); if (near.distanceTo(p) < 0.01) hits.push(`${named(f)} ${state}: a corner ${near.distanceTo(p).toFixed(3)} off${what(k, j)}`); }
              for (let k = 0; k < 3; k++) {
                a.copy(o[k]); b.copy(o[(k + 1) % 3]);
                const length = a.distanceTo(b);
                if (length < 1e-9) continue;
                ray.set(a, b.clone().sub(a).normalize());
                if (ray.intersectTriangle(h[0], h[1], h[2], false, q) && q.distanceTo(a) <= length) hits.push(`${named(f)} ${state}: an edge through it${what(k, j)}`);
              }
            }
          }
        }
      }
    }
    expect([...new Set(hits)].slice(0, 10)).toEqual([]);
    expect(carriers).toBeGreaterThan(150);
    expect(least).toBeLessThan(0.1);
  }, 120000);

  it("holds what it holds up clear of every head round it: nothing held up passes through a neighbour's head, its hat or its hair, or comes within a centimetre of it", () => {
    // Each figure that holds something up, and each figure within 2 m of it, both as the shader puts them in the world through the same
    // beats: no edge of what is held up (its pole, what flies or stands on it, its balloons and their strings, and what a raised hand
    // holds) passes through a face of the other's head, what it wears there or its hair, and no corner of it comes within a centimetre
    // of one. And they come near: what is held up stands within 0.5 m across of a neighbour's head's reach.
    const hits: string[] = [];
    let pairs = 0, closest = Infinity;
    const m = new THREE.Matrix4(), ray = new THREE.Ray(), q = new THREE.Vector3(), b = new THREE.Vector3(), triangle = new THREE.Triangle(), near = new THREE.Vector3();
    for (const c of crowds) {
      const figs = figuresOf(c), seats2 = c.ground.seats as Seat[], all2 = trianglesOf(c);
      // Each figure's head and what it holds up, as triangles in the world in each pose, worked out once.
      const placed = new Map<string, THREE.Vector3[][]>();
      const inWorld = (f: Figure, which: string, k: number) => {
        const key = `${f.i} ${which} ${k}`;
        if (!placed.has(key)) {
          m.fromArray(c.each.matrix, 16 * f.i);
          const mine = all2.filter((t) => wears(f, t[0]) && (which === "head" ? t[0].mark.x === HEAD : OVER.includes(t[0].mark.y) && t[0].mark.x !== HEAD));
          placed.set(key, mine.map((t) => t.map((v) => { const p = put(f, v, POSES[k][1]); return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(m); })));
        }
        return placed.get(key)!;
      };
      for (const f of figs.filter(carriesOver)) for (const g of figs) {
        if (g.i === f.i || Math.hypot(seats2[g.i].x - seats2[f.i].x, seats2[g.i].z - seats2[f.i].z) > 2) continue;
        pairs += 1;
        for (const [k, [state]] of POSES.entries()) {
          const H = inWorld(g, "head", k), O = inWorld(f, "held", k), corners = H.flat(), box = new THREE.Box3().setFromPoints(corners).expandByScalar(0.02);
          const skull = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / corners.length);
          const out = Math.max(...corners.map((p) => Math.hypot(p.x - skull.x, p.z - skull.z)));
          for (const o of O) {
            for (const p of o) closest = Math.min(closest, Math.hypot(p.x - skull.x, p.z - skull.z) - out);
            if (!box.intersectsBox(new THREE.Box3().setFromPoints(o))) continue;
            for (const h of H) {
              triangle.set(h[0], h[1], h[2]);
              for (const p of o) if (triangle.closestPointToPoint(p, near).distanceTo(p) < 0.01) hits.push(`${f.i} by ${g.i}, ${state}: a corner ${near.distanceTo(p).toFixed(3)} off`);
              for (let e = 0; e < 3; e++) {
                const a = o[e], length = a.distanceTo(o[(e + 1) % 3]);
                if (length < 1e-9) continue;
                ray.set(a, b.copy(o[(e + 1) % 3]).sub(a).normalize());
                if (ray.intersectTriangle(h[0], h[1], h[2], false, q) && q.distanceTo(a) <= length) hits.push(`${f.i} by ${g.i}, ${state}: an edge through it`);
              }
            }
          }
        }
      }
    }
    expect([...new Set(hits)].slice(0, 10)).toEqual([]);
    expect(pairs).toBeGreaterThan(100);
    expect(closest).toBeLessThan(0.5);
  }, 240000);

  it("holds things up well over the heads, from the hill: a sixth of those who stand hold something 90 cm over every head within 2 m, children on the shoulders among them, on a desktop and nearly as many on a phone", () => {
    // Each standing figure, as the shader stands it still, and the highest point of what it holds up (a pole and what flies or stands
    // on it, its balloons and a child on its shoulders) against the highest head within 2 m of it, its own among them: the fixed day's
    // whole crowd and another hill's on a desktop, and the fixed day's on a phone, where a figure stands 3.15 m (PERSON). The crowd
    // before this held a few things up, none of them 90 cm over the heads round it: the top of a pole stood no higher than the hands'
    // own reach up (TOP was 2.08), which the tallest stood within.
    const UP = [PART.FLAG, PART.BALLOON, PART.POLE, PART.RIDER] as number[], pose = { beat: 0, dance: 0 };
    const m = new THREE.Matrix4(), w = new THREE.Vector3();
    const shares: string[] = [];
    for (const [c, vertices] of [[crowd, rich], [hills[1], rich], [phone, plain]] as const) {
      const figs = figuresOf(c), seats2 = c.ground.seats as Seat[];
      const highest = (f: Figure, which: (v: Vertex) => boolean) => {
        m.fromArray(c.each.matrix, 16 * f.i);
        let y = -Infinity;
        for (const v of vertices) if (which(v) && wears(f, v)) { const p = put(f, v, pose); y = Math.max(y, w.set(p.x, p.y, p.z).applyMatrix4(m).y); }
        return y;
      };
      const heads = figs.map((f) => highest(f, (v) => v.mark.x === HEAD)), held = figs.map((f) => highest(f, (v) => UP.includes(v.mark.y)));
      const standing = figs.filter((f) => f.fig.x !== 1), riders = standing.filter((f) => carries(f, PART.RIDER as number)).length;
      const over = standing.filter((f) => held[f.i] - Math.max(...figs.filter((g) => Math.hypot(seats2[g.i].x - seats2[f.i].x, seats2[g.i].z - seats2[f.i].z) <= 2).map((g) => heads[g.i])) >= 0.9);
      expect(over.length).toBeGreaterThan((c === phone ? 0.15 : 0.165) * standing.length);
      expect(riders).toBeGreaterThanOrEqual(c === phone ? 4 : 8);
      shares.push(`${over.length}/${standing.length} ${riders}`);
    }
    // On the fixed day's hill 34 of 195 standing on a desktop, nine children on the shoulders among them; on the other hill 48 of 237;
    // and on a phone 18 of 117, four.
    expect(shares).toEqual(["34/195 9", "48/237 10", "18/117 4"]);
  }, 60000);

  it("flies a flag from the top of its straight pole, which reaches down past the hand that holds it, on a desktop and a phone", () => {
    // A flag's cloth hangs from the top of its pole, and the pole goes on through the hand (at the hand's middle, SHOULDER_Y less
    // 0.565, as it hangs), so that no cloth reads as flying off a pole's end.
    for (const list of [rich, plain]) {
      const of = (bit: number, form: number) => list.filter((v) => v.mark.y === bit && formOfMark(v.mark.z) === form).map((v) => v.y);
      const pole = of(PART.POLE as number, FORMS.POLE.indexOf("straight")), cloth = of(PART.FLAG as number, FORMS.FLAG.indexOf("oblong"));
      expect(pole.length).toBeGreaterThan(0);
      expect(cloth.length).toBeGreaterThan(0);
      expect(Math.max(...pole)).toBeGreaterThanOrEqual(Math.max(...cloth) - 1e-6);
      expect(Math.min(...pole)).toBeLessThan(SHOULDER_Y - 0.565);
    }
  });

  it("spreads what is held up across the hill: nine in ten of those who stand out of the test poses' view of the band have something held up within 4.5 m, or 5.5 m on a phone", () => {
    // Where things stand over the heads, rather than in a clump of them: the fixed day's and two other hills' crowds, and the fixed
    // day's on a phone, from each standing figure's seat to the nearest seat whose figure holds something up over its head.
    for (const [c, far] of [[crowd, 4.5], [hills[1], 4.5], [hills[2], 4.5], [phone, 5.5]] as const) {
      const who = peopleOf(c), placed = placedOf.get(c)!;
      const up = placed.map((_, i) => i).filter((i) => !placed[i].sit && (OVERHEAD as string[]).includes(who[i].prop));
      const gaps = placed.map((_, i) => i).filter((i) => !placed[i].sit && !inView(placed[i].x, placed[i].z))
        .map((i) => Math.min(...up.filter((j) => j !== i).map((j) => Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z)))).sort((a, b) => a - b);
      expect(gaps.length).toBeGreaterThan(c === phone ? 80 : 120);
      expect(gaps[Math.floor(0.9 * (gaps.length - 1))]).toBeLessThan(far);
    }
  });

  it("dyes what is held up so that no two within DYED m of each other hold up the same colour, and every colour is held up", () => {
    expect(DYED).toBe(6);
    // A figure carries its dye over its things' tone in aTone.w, a float: it holds every whole number to 2^24 exactly, and the most a
    // figure carries is the last dye over the brightest tone, 2^24 - 1. A ninth dye, or a wider tone, would not fit.
    expect(tone(0xffffff, 1e-6)).toBe(DYE - 1);
    expect(DYE - 1 + DYE * (CLOTHS.length - 1)).toBe(2 ** 24 - 1);
    expect([Math.fround(2 ** 24 - 1), Math.fround(2 ** 24 + 1)]).toEqual([2 ** 24 - 1, 2 ** 24]);
    for (const c of [crowd, hills[1], hills[2], phone]) {
      const who = peopleOf(c), placed = placedOf.get(c)!;
      const up = placed.map((_, i) => i).filter((i) => (DYED_PROPS as string[]).includes(who[i].prop));
      for (const i of up) {
        expect(who[i].colour.cloth).toBe(Math.floor(c.each.aTone[4 * i + 3] / DYE));
        const same = up.filter((j) => j !== i && who[j].colour.cloth === who[i].colour.cloth && Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z) < DYED);
        expect([i, same]).toEqual([i, []]);
      }
      expect(new Set(up.map((i) => who[i].colour.cloth)).size).toBe(CLOTHS.length);
      // And no one else carries a dye.
      expect(placed.map((_, i) => i).filter((i) => !up.includes(i) && c.each.aTone[4 * i + 3] >= DYE)).toEqual([]);
    }
  });

  it("keeps what is held up and what shows over the shoulders apart on sixty days' gatherings: no two within 6 m hold up one dye, no two within 4 m carry one thing, and no two standing within 8 m share a crest, on a desktop or as a phone draws them", () => {
    // The hills above are four; these rules are kept as people() deals, a figure at a time, so a hill where a figure is left no way
    // to keep one looks like any other. Where all eight dyes were held up within 6 m, a flag once took a dye one of them held: on 58
    // of a thousand days' gatherings, five of these sixty. The deal now passes such a figure over for what is dyed. A rule broken on
    // one gathering in fourteen goes unseen on sixty about one time in eighty.
    expect([DYED, CREST]).toEqual([6, 8]);
    const broken: string[] = [], pairs = { dye: 0, prop: 0, crest: 0 };
    for (let seed = 0; seed < 60; seed++) {
      const placed = seatsOf({ path: [], line: [], landmarks: [] }, seed) as Seat[], who = people(placed) as { prop: string; colour: { cloth?: number } }[];
      const up = who.map((p) => (DYED_PROPS as string[]).includes(p.prop)), crest = who.map((p) => [crestOf(p), crestOf(plainly(p))]);
      for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) {
        const d = Math.hypot(placed[j].x - placed[i].x, placed[j].z - placed[i].z);
        if (d < 6 && up[i] && up[j]) { pairs.dye += 1; if (who[i].colour.cloth === who[j].colour.cloth) broken.push(`day ${seed}: ${i} and ${j}, ${d.toFixed(2)} m, one dye`); }
        if (d < 4 && who[i].prop !== "none" && who[j].prop !== "none") { pairs.prop += 1; if (who[i].prop === who[j].prop) broken.push(`day ${seed}: ${i} and ${j}, ${d.toFixed(2)} m, both ${who[i].prop}`); }
        if (d < 8 && !placed[i].sit && !placed[j].sit) {
          pairs.crest += 1;
          if (crest[i][0] === crest[j][0] || crest[i][1] === crest[j][1]) broken.push(`day ${seed}: ${i} and ${j}, ${d.toFixed(2)} m, crest ${crest[i][1]}`);
        }
      }
    }
    expect(broken).toEqual([]);
    // And there were many such pairs to keep apart.
    expect(pairs.dye).toBeGreaterThan(5000);
    expect(pairs.prop).toBeGreaterThan(7000);
    expect(pairs.crest).toBeGreaterThan(150000);
  }, 60000);
});
