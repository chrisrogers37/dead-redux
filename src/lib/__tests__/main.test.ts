import { afterEach, describe, expect, it, vi } from "vitest";
import { BODY_REACH } from "../../../public/world/collide.js";
import { BOUND, height, STAGE, STAGE_COLUMN, STAGE_REACH } from "../../../public/world/ground.js";
import { DEAD, REACH } from "../../../public/world/input.js";
import { BEAR_GAP, DESCENT_S } from "../../../public/world/modes.js";
import { DEEP, HOUR_RATE, lookAt, newLook } from "../../../public/world/night.js";
import { CRANE, DESCENT_FROM, postPose } from "../../../public/world/pose.js";
import { WINDOW } from "../../../public/world/quality.js";

// public/world/main.js runs here as a page runs it, frame by frame, with the modules it imports: what keeps a walk in bounds (confine,
// with the limits walkLimits builds from the bears' live spots), where attract puts the camera (postPose), and what the show's map does
// (maps.js, beat.js and audio.js's mappings; the analyser hears nothing here, since no AudioContext is made). three, and the modules
// that import it (the island, the trees, the path and its landmarks, the bears, the visitor's bear, the crowd, the sky and the stage), are played
// by stand-ins, with what the frames here use: a desktop's, in either view. The stand-ins keep these tests on main.js alone, and fast,
// frame by frame. They draw nothing, and keep what the tests read: where each bear stands, where the visitor's bear steps, where the
// camera stands and looks and its near plane, the sun's shadow, the stage light, the flame's size, the sky's drop, the figures' beat
// and the rig's aim. night.js runs as it is: the night's hour and its look are plain numbers.

type Point = { x: number; z: number };
type Point3 = Point & { y: number };
type Line = { length: number; at(d: number): Point3; tangentAt(d: number): Point3; dOf(u: number): number };

const fake = vi.hoisted(() => {
  // A point or a colour, as three's Vector3 and Color hold one.
  class Vec {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v: Point3) {
      return this.set(v.x, v.y, v.z);
    }
    lerp(v: Point3, a: number) {
      return this.set(this.x + (v.x - this.x) * a, this.y + (v.y - this.y) * a, this.z + (v.z - this.z) * a);
    }
    multiplyScalar(s: number) {
      return this.set(this.x * s, this.y * s, this.z * s);
    }
    setScalar(s: number) {
      return this.set(s, s, s);
    }
    crossVectors(a: Point3, b: Point3) {
      return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    }
    normalize() {
      return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1));
    }
  }
  type Bear = { g: { position: Vec; rotation: { y: number }; visible?: boolean }; legs: { rotation: { x: number } }[]; phase: number };
  type Stage = {
    light: { visible: boolean; intensity: number };
    rig: { show: Float32Array; mesh: { visible: boolean; renderOrder?: number } };
    move: (dt: number, t: number, beats: number) => void;
  };
  type CrowdMesh = { count: number; renderOrder?: number };
  type Sky = { uniforms: Record<string, { value: number | Vec }> };

  // What the world main.js built: its scene, its camera, every bear it made (a downgrade drops some from the scene), and where the
  // visitor's bear last stepped; the landmarks' moving parts, one of each kind (a fire landmark's flame and its light, a ball that
  // pulses, a wheel that turns and a miracle that bobs), the stage, the crowd's mesh, the sky, its sun and the meshes main.js makes
  // itself (the beam); and the figures' phase in beats, as the last frame gave it to the stage, the crowd's pose, as the last frame gave
  // it to the crowd, and whether its last parting stood the figures at once.
  // `line` is the bears' line each test gives it, and `onset` the time of the last onset the analyser heard, which each test sets (null
  // for none). `keptY` is how high in the frame the last frame asked that the visitor's bear be kept, from -1 at the frame's foot to 1
  // at its top: on a phone, its feet.
  const world = {
    line: undefined as unknown as Line,
    scene: undefined as unknown as Scene,
    camera: undefined as unknown as Camera,
    bears: [] as Bear[],
    stepped: { x: NaN, z: NaN, heading: NaN },
    keptY: NaN,
    // The landmarks the path places, one a song (none unless a test gives some); where ?pose=near-K stands the visitor by song k's,
    // which a test sets; and whether the last frame told the third-person camera's boom to cut.
    landmarks: [] as { position: Point3; rotation: { y: number } }[],
    // The trees (trees.js). Where the stand-in stands them, which a test gives; what main.js gave it to place them by, and what to
    // reckon the cameras' ways by; each time they were built, and with what; the order the trees and the island were made in; what
    // the island was given to ask of the trunks, and each time the placing was asked whether a tree stands near a place, as [x, z, r];
    // each time the trees were asked for the trunks near a place, the same; and every property of the built trees main.js has read.
    treeSpots: [] as Point[],
    treesAsked: [] as { count: number; loop: unknown[]; line: number[][]; landmarks: { x: number; z: number; rot: number; poly: unknown }[]; eyes: unknown; views: unknown }[],
    waysAsked: [] as { line: unknown; height: unknown; phone: boolean; bears: number[]; marks: unknown[] }[],
    treesBuilt: [] as { spots: Point[]; lit: unknown; phone: boolean }[],
    made: [] as string[],
    trunks: undefined as unknown,
    nearAsks: [] as number[][],
    trunkAsks: [] as number[][],
    treeReads: new Set<string>(),
    // What the visitor's bear was built with for its camera to keep clear of: the columns, and the trees' own slide and ceiling; and
    // what the columns held at the last boom.
    avatarAsk: undefined as unknown as { columns: unknown[]; slide: unknown; ceiling: unknown },
    columnsAtBoom: [] as unknown[],
    nearSpot: (k: number) => ({ x: k, z: 0, heading: 0, pitch: 0, clear: true }),
    cut: false,
    // The songs' titles the path was last asked to lay out, and those it was asked to place landmarks for.
    laidOut: [] as string[],
    placed: [] as string[],
    flame: { scale: new Vec(1, 1, 1) },
    torch: { intensity: 40 },
    ball: { material: { emissiveIntensity: 0.6 } },
    wheel: { rotation: { y: 0 } },
    miracle: { position: { y: 4 } },
    stage: undefined as unknown as Stage,
    crowd: undefined as unknown as CrowdMesh,
    sky: undefined as unknown as Sky,
    sun: undefined as unknown as { castShadow: boolean },
    meshes: [] as { material: unknown; position: Vec; visible: boolean }[],
    beats: NaN,
    posed: { beats: NaN, dance: NaN, rise: NaN, sit: NaN },
    partedAtOnce: null as boolean | null,
    onset: null as number | null,
    // The renderer's shadow map; the hour of the look the last frame handed the sky, and the steady share of the stage's light in it;
    // and whether the sky then says its key light has turned, which each test sets.
    shadowMap: undefined as unknown as { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean },
    graded: NaN,
    lift: NaN,
    // How dark the look last graded was, 0 to 1 (night.js), unrounded.
    dark: NaN,
    keyTurned: false,
    // The time the island's water last took its look at (island.js), and how quiet the music was then, 0 to 1.
    tide: NaN,
    calm: NaN,
    // Whether the land's tufts are thinned by half (flora.js), as the quality ladder last set it, and whether the world asked for a
    // handful of them, as the draw-call sweep does.
    thinned: null as boolean | null,
    sparse: false,
  };
  class Scene {
    shown = new Set<unknown>();
    constructor() {
      world.scene = this;
    }
    add(o: unknown) {
      this.shown.add(o);
    }
    remove(o: unknown) {
      this.shown.delete(o);
    }
  }
  class Camera {
    position = new Vec();
    // Where it last looked.
    target = new Vec();
    // Its near plane, from the arguments it is made with: field of view, aspect, near and far.
    near: number;
    constructor(_fov?: number, _aspect?: number, near = NaN) {
      this.near = near;
      world.camera = this;
    }
    lookAt(x: number | Point3, y = 0, z = 0) {
      if (typeof x === "number") this.target.set(x, y, z);
      else this.target.copy(x);
    }
    updateProjectionMatrix() {}
  }
  class Part {
    position = new Vec();
    visible = true;
  }
  // A mesh keeps its material, and a material the values it is made with: the beam's opacity is read from them.
  class Mesh extends Part {
    material: unknown;
    constructor(_geometry?: unknown, material?: unknown) {
      super();
      this.material = material;
      world.meshes.push(this);
    }
  }
  class Material {
    constructor(values: object = {}) {
      Object.assign(this, values);
    }
  }
  // How far a third-person view turns down to keep the visitor's bear in the frame (avatar.js's turnDown).
  const TURN = 0.05;
  // The stand-ins' own: the light the island hands on, a landmark's outline, the cameras' ways, a tree's column, how near a walk comes
  // to a trunk and how far from one anything grows.
  const LIT = (material: unknown) => material, OUTLINE = [[0, 0], [1, 0], [0, 1]], WAYS = { eyes: [[1, 2, 3]], views: [{ from: [0, 0], to: [1, 1], half: 5 }] };
  const SLIDE = () => {}, CEILING = () => Infinity, TREE_REACH = 2.5, TRUNK_ROOM = 2.25;
  const three = {
    WebGLRenderer: class {
      shadowMap = (world.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false });
      setPixelRatio() {}
      setSize() {}
      render() {}
    },
    Scene,
    PerspectiveCamera: Camera,
    Vector3: Vec,
    Color: Vec,
    Fog: Part,
    Mesh,
    CylinderGeometry: Part,
    MeshBasicMaterial: Material,
    AdditiveBlending: 2,
    DoubleSide: 2,
  };
  const modules = {
    // The island draws the night's look on its sea and its ground itself (island.js), which the frames here do not read.
    island: {
      buildIsland: (_scene: unknown, _grid: number, _phone: boolean, _loop: unknown, trunks: unknown) => {
        world.made.push("island");
        world.trunks = trunks;
        return { caves: [], shade: (_look: unknown, time: number, calm: number) => { world.tide = time; world.calm = calm; }, flora: { thin: (half: boolean) => { world.thinned = half; }, sparse: () => { world.sparse = true; } }, lit: LIT };
      },
    },
    // The trees stand where a test puts them and draw nothing; what main.js gives them and takes from them is kept.
    trees: {
      TARGET: { desktop: 100, tv: 75, phone: 45 },
      TREE_REACH,
      TRUNK_ROOM,
      cameraWays: (ask: (typeof world.waysAsked)[number]) => { world.waysAsked.push(ask); return WAYS; },
      // A tree stands near a place, the stand-in says, wherever x is over 0.
      placeTrees: (ask: (typeof world.treesAsked)[number]) => {
        world.made.push("places");
        world.treesAsked.push(ask);
        return { spots: world.treeSpots, near: (x: number, z: number, r: number) => { world.nearAsks.push([x, z, r]); return x > 0; } };
      },
      buildTrees: (_scene: unknown, spots: Point[], { lit, phone }: { lit: unknown; phone: boolean }) => {
        world.made.push("trees");
        world.treesBuilt.push({ spots, lit, phone });
        const built: Record<string, unknown> = {
          count: spots.length,
          slide: SLIDE,
          ceiling: CEILING,
          // Every trunk is near, the stand-in says: the walk keeps out of whichever it is handed.
          trunks: (x: number, z: number, r: number) => { world.trunkAsks.push([x, z, r]); return spots; },
        };
        // What main.js reads of them is kept: the trees have nothing else to give it, and nothing that takes a time.
        return new Proxy(built, { get: (target, name) => { world.treeReads.add(String(name)); return target[String(name)]; } });
      },
    },
    path: {
      // The loop, where the walker stands before a frame puts it in its place in the bears' line.
      buildPath: () => ({ at: () => new Vec(), tangentAt: () => new Vec(1, 0, 0) }),
      // Where each song's landmark stands along the loop, and the loop's end: the first song at 0.5.
      layout: (tracks: { title: string }[]) => {
        world.laidOut = tracks.map((t) => t.title);
        return Array.from({ length: tracks.length + 1 }, (_, i) => 0.5 + 0.1 * i);
      },
      placeLandmarks: (_scene: unknown, _path: unknown, tracks: { title: string }[]) => {
        world.placed = tracks.map((t) => t.title);
        return world.landmarks;
      },
      // Where ?pose=near-K stands the visitor. path.js's own answer is tested with path.js; here song k's is the spot a test names, and a
      // song with no landmark has none.
      nearStand: (_path: unknown, _landmarkU: unknown, landmarks: unknown[], k: number) => (landmarks[k] ? world.nearSpot(k) : null),
      // A landmark's outline from above, the same for each here.
      outline: () => OUTLINE,
      buildSegues: () => {},
      buildWalkLine: () => world.line,
    },
    landmarks: {
      // The parts that move, one of each kind, each as landmarks.js builds it: a fire landmark's flame, which swells before a
      // peak, and its light, which follows the low end; Not Fade Away's ball, which pulses; a wheel, which turns; and a miracle,
      // which bobs.
      makeBuilders: () => {
        world.flame = { scale: new Vec(1, 1, 1) };
        world.torch = { intensity: 40 };
        world.ball = { material: { emissiveIntensity: 0.6 } };
        world.wheel = { rotation: { y: 0 } };
        world.miracle = { position: { y: 4 } };
        return { moving: [{ obj: world.flame, kind: "swell" }, { obj: world.torch, kind: "flame", base: world.torch.intensity }, { obj: world.ball, kind: "pulse" }, { obj: world.wheel, kind: "spin" }, { obj: world.miracle, kind: "bob" }] };
      },
      mergeLandmarks: () => {},
    },
    bears: {
      buildBears: (scene: Scene, count: number) => {
        const bears: Bear[] = Array.from({ length: count }, (_, k) => ({
          g: { position: new Vec(), rotation: { y: 0 } },
          legs: [0, 1, 2, 3].map(() => ({ rotation: { x: 0 } })),
          phase: k,
        }));
        for (const b of bears) scene.add(b.g);
        world.bears = [...bears];
        return bears;
      },
      drawLegs: () => {},
      // The gait as bears.js's stride swings it: an arm with the leg across from it.
      stride: (b: Bear, swing: number) => {
        b.legs.forEach((leg, k) => { leg.rotation.x = k === 0 || k === 3 ? swing : -swing; });
      },
    },
    avatar: {
      buildAvatar: (_scene: unknown, _landmarks: unknown, ask: { columns: unknown[]; slide: unknown; ceiling: unknown }) => ({
        g: { visible: true },
        head: new Vec(),
        top: new Vec(),
        feet: new Vec(),
        step: (x: number, z: number, heading: number) => {
          world.stepped = { x, z, heading };
        },
        // The third-person camera's boom, which here only looks at the walker.
        boom: (_camera: Camera, walker: Point, _dt: number, cut: boolean) => {
          world.cut = cut;
          world.avatarAsk = ask;
          world.columnsAtBoom = [...ask.columns];
          return new Vec(walker.x, 0, walker.z);
        },
        settle: () => {},
        turnDown: (_camera: Camera, _from: Point3, _look: Point3, _point: Vec, ndcY: number) => {
          world.keptY = ndcY;
          return TURN;
        },
      }),
    },
    sky: {
      buildSky: () => {
        world.sky = {
          uniforms: {
            uOct: { value: 0 },
            uEnergy: { value: 0 },
            uTime: { value: 0 },
            uC0: { value: new Vec() },
            uC1: { value: new Vec() },
            uC2: { value: new Vec() },
            uPage: { value: new Vec() },
            // The drop: where it falls, and how long since it fell.
            uDrop: { value: new Vec() },
            uAmber: { value: 0 },
          },
        };
        world.sun = { castShadow: false };
        return {
          skyMat: world.sky,
          hemi: { color: new Vec() },
          sun: world.sun,
          // The stage panel's material, whose gain each frame writes.
          panelMat: { uniforms: { uGain: { value: Float32Array.of(1) } } },
          // The sky draws the night's look itself (sky.js), and says whether its key light has turned far enough to redraw the
          // stage's shadow.
          grade: (look: { hour: number; stageLift: number; dark: number }) => {
            world.graded = look.hour;
            world.lift = look.stageLift;
            world.dark = look.dark;
            return world.keyTurned;
          },
        };
      },
      skyPair: () => [new Vec(), new Vec()],
    },
    stage: {
      // With shadows, the desktop's, the stage has the sun cast its shadow, as stage.js does.
      buildStage: (_scene: Scene, sun: { castShadow: boolean }, shadows: boolean) => {
        if (shadows) sun.castShadow = true;
        world.stage = {
          light: { visible: true, intensity: 60 },
          // The rig's five numbers, as the last frame wrote them, and whether it is drawn.
          rig: { show: new Float32Array(5), mesh: { visible: false } },
          move: (_dt, _t, beats) => {
            world.beats = beats;
          },
        };
        return world.stage;
      },
      STAGE_SOUND: { x: 0, y: 0, z: 0, facing: [0, 0, 1] },
    },
    crowd: {
      // As many figures as the tier asks for, which the downgrade may halve, the pose each frame gives them, and its parting.
      buildCrowd: (_scene: Scene, { count }: { count: number }) => ({
        mesh: (world.crowd = { count }),
        count,
        pose: (beats: number, dance: number, rise: number, sit: number) => {
          world.posed = { beats, dance, rise, sit };
        },
        part: (_dt: number, _feet: Vec, _head: Vec, reduced: boolean) => {
          world.partedAtOnce = reduced;
        },
        over: () => {},
        ahead: () => {},
        hold: () => {},
        parted: 0,
      }),
    },
  };
  return { world, three, modules, TURN, LIT, OUTLINE, WAYS, SLIDE, CEILING, TREE_REACH, TRUNK_ROOM };
});

vi.mock("three", () => fake.three);
vi.mock("../../../public/world/island.js", () => fake.modules.island);
vi.mock("../../../public/world/trees.js", () => fake.modules.trees);
vi.mock("../../../public/world/path.js", () => fake.modules.path);
vi.mock("../../../public/world/landmarks.js", () => fake.modules.landmarks);
vi.mock("../../../public/world/bears.js", () => fake.modules.bears);
vi.mock("../../../public/world/avatar.js", () => fake.modules.avatar);
vi.mock("../../../public/world/sky.js", () => fake.modules.sky);
vi.mock("../../../public/world/stage.js", () => fake.modules.stage);
vi.mock("../../../public/world/crowd.js", () => fake.modules.crowd);
// audio.js runs as it is, but for the time of the last onset, which the analyser never hears here.
vi.mock("../../../public/world/audio.js", async (original) => ({ ...(await original<object>()), onsetAt: () => fake.world.onset }));

const stage = { x: STAGE[0], z: STAGE[1] };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
// The bears' line here is straight: from START m out from the stage's centre (ground.js), on through the island's centre, so `d` m
// along it stands START + d m from the stage's centre. Until the show plays the bears stand where it is, the first song, which the line
// puts 50 m along (`dOf`); the visitor's place in the line, one gap behind the last bear, stands between them and the stage.
const START = 25;
const toCentre = { x: -stage.x / Math.hypot(stage.x, stage.z), z: -stage.z / Math.hypot(stage.x, stage.z) };
const LINE: Line = {
  length: 200,
  at(d) {
    const x = stage.x + (START + d) * toCentre.x, z = stage.z + (START + d) * toCentre.z;
    return { x, y: height(x, z), z };
  },
  tangentAt: () => ({ x: toCentre.x, y: 0, z: toCentre.z }),
  dOf: (u) => 100 * u,
};
// How far along the line a point stands, and how far to one side of it.
const along = (p: Point) => (p.x - stage.x) * toCentre.x + (p.z - stage.z) * toCentre.z - START;
const across = (p: Point) => (p.x - stage.x) * toCentre.z - (p.z - stage.z) * toCentre.x;
const fromCentre = (p: Point) => Math.hypot(p.x, p.z);

// The show the page plays: one track, from one recording.
const SHOW = "1986-07-04";
const RECORDING = "gd1986-07-04.sbd.test";
const TRACK = { title: "Bertha", duration: 600 };

// A map of the show as the site serves one (maps.js checks it): TRACK at `step` seconds an envelope byte, with each byte's loudness
// `rms` and low end `bass` (0-255, or a byte's value from its index), the tempo `bpm` in every 10-s window (0 for none), and the peaks
// as [second, strength].
function showMap({ rms = 0 as number | ((byte: number) => number), bass = 0 as number | ((byte: number) => number), bpm = 0, peaks = [] as number[][], step = 1 } = {}) {
  const bytes = (values: number[]) => Buffer.from(values).toString("base64");
  const series = (value: number | ((byte: number) => number)) =>
    bytes(Array.from({ length: Math.ceil(TRACK.duration / step) }, (_, i) => (typeof value === "function" ? value(i) : value)));
  return {
    v: 1,
    show: SHOW,
    analysed: RECORDING,
    playing: RECORDING,
    step,
    tracks: [
      {
        title: TRACK.title,
        analysedDuration: TRACK.duration,
        playingDuration: TRACK.duration,
        env: { rms: series(rms), bass: series(bass), bright: series(0) },
        tempo: bytes(Array.from({ length: (2 * TRACK.duration) / 10 }, (_, i) => (i % 2 ? 255 : bpm))),
        peaks,
      },
    ],
  };
}

type Hill = {
  tier: string;
  scale: number;
  mode: string;
  near: { index: number; title: string; clear: boolean } | null;
  rung: number;
  still: boolean;
  hold: boolean;
  walker: { x: number; z: number; heading: number; pitch: number };
  crowd: { drawn: number; dance: number; sit: number; parted: number };
  analysis: { source: string | null; weight: number };
  map: { step: number; bass: number; build: number; swell: number; bpm: number | null } | null;
  night: { hour: number; show: number; dark: number };
};
const hill = () => (window as unknown as { __hill: Hill }).__hill;

// A screen, which the world fills: its size in px, and whether it takes touches. quality.js gives a screen under 640 px wide the phone's
// tier, and a touch screen under 900 px.
type Screen = { width: number; height: number; touch: boolean };
const DESKTOP: Screen = { width: 1280, height: 720, touch: false };
// The HUD's boxes that a phone's camera frames the visitor's bear above (measurePlate), each by its top in px from the frame's top: the
// now-plate's (null on a page without a player), whether its shelf has put it `away`, the stick's (null where the page hides it, so it
// has no box) and the hint's (null once the first move has taken it off the page).
type Hud = { plate?: number | null; away?: boolean; stick?: number | null; hint?: number | null };

// The page around the world, played by stand-ins: <main>, which carries the player's state, how the show sounds and the view; the
// world's element; the window, which takes the keys; the `screen`, a desktop's unless a test names one, which quality.js reads in
// matchMedia, innerWidth and navigator; the `hud`; the site, which serves `map` as the show's map, and no other; and the frames, which
// `run` hands main.js, each `ms` long (a frame adds at most 50 ms of world time), calling `each` after each one. `playing` starts the
// show playing; `routing` is how it sounds ("webaudio" through the world's graph, "plain" in plain stereo); `search` is the page's
// query, on a preview, or anywhere else with `hooks` false; `reduced` asks for reduced motion; `title` names the track, the first of
// `songs`, each with one of the `landmarks`; `trees` is where the trees stand; `view` is "third" or "first" person; and a day with no
// `recording` has no tracks. A page
// with a map waits until the world has read it.
async function startWorld({ playing = false, routing = "webaudio", search = "", hooks = true, reduced = false, map = null as object | null, title = TRACK.title, songs = 1, landmarks = [] as { position: Point3; rotation: { y: number } }[], trees = [] as Point[], view = "third", recording = true, screen = DESKTOP, hud = {} as Hud } = {}) {
  let now = 0;
  let queued: FrameRequestCallback | null = null;
  const container = Object.assign(new EventTarget(), {
    dataset: {},
    clientWidth: screen.width,
    clientHeight: screen.height,
    appendChild: () => {},
    getBoundingClientRect: () => ({ top: 0 }),
  });
  const main: { dataset: Record<string, string> } = { dataset: { state: playing ? "playing" : "paused", routing, view, ...(search && hooks ? { testHooks: "1" } : {}) } };
  // What main.js asked to be told of <main>'s changes with.
  const observers: (() => void)[] = [];
  const { plate: plateTop = null, away = false, stick: stickTop = 0, hint: hintTop = null } = hud;
  // The stick on a phone (input.js), 112 px across with its centre at (56, 56) unless a test puts it lower; hidden, its box is empty.
  const stick = Object.assign(new EventTarget(), {
    dataset: {},
    style: { setProperty: () => {} },
    setPointerCapture: () => {},
    getBoundingClientRect: () => (stickTop === null ? { left: 0, top: 0, width: 0, height: 0 } : { left: 0, top: stickTop, width: 112, height: 112 }),
  });
  // The now-plate, which main.js finds from its play button, in a shelf the page marks "in" while it is away; and the hint.
  const plate = plateTop === null ? null : {
    closest: (selector: string) => (selector === "[data-shelf='in']" && away ? {} : null),
    getBoundingClientRect: () => ({ top: plateTop, height: 180 }),
  };
  const play = plate && { closest: (selector: string) => (selector === ".plate" ? plate : null) };
  const hint = hintTop === null ? null : { getBoundingClientRect: () => ({ top: hintTop, height: 52 }) };
  const found: Record<string, unknown> = { main, "[data-stick]": stick, "[data-action='play']": play, "[data-hint]": hint };
  const data = { showDate: SHOW, identifier: recording ? RECORDING : null, tracks: recording ? Array.from({ length: songs }, (_, k) => ({ ...TRACK, title: k ? `${title} ${k + 1}` : title })) : [], seed: 7 };
  const byId: Record<string, unknown> = { world: container, "world-data": { textContent: JSON.stringify(data) } };
  const media = (query: string) => ({ matches: query === "(max-width: 639px)" ? screen.width < 640 : reduced && query === "(prefers-reduced-motion: reduce)" });
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return map && url === `/maps/${SHOW}.json` ? new Response(JSON.stringify(map)) : new Response(null, { status: 404 });
  });
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      hidden: false,
      getElementById: (id: string) => byId[id] ?? null,
      querySelector: (selector: string) => found[selector] ?? null,
      querySelectorAll: () => [],
      createElement: () => ({ getContext: () => ({}) }),
    }),
  );
  vi.stubGlobal("window", Object.assign(new EventTarget(), { matchMedia: media, devicePixelRatio: 1 }));
  vi.stubGlobal("matchMedia", media);
  vi.stubGlobal("innerWidth", screen.width);
  vi.stubGlobal("navigator", { maxTouchPoints: screen.touch ? 5 : 0, userAgent: "" });
  vi.stubGlobal("location", { search });
  // input.js tells a key typed into a field from one for the world by its target.
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
    queued = f;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queued = null;
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  vi.stubGlobal("MutationObserver", class { constructor(told: () => void) { observers.push(told); } observe() {} });
  fake.world.line = LINE;
  fake.world.landmarks = landmarks;
  fake.world.treeSpots = trees;
  fake.world.treesAsked = [];
  fake.world.waysAsked = [];
  fake.world.treesBuilt = [];
  fake.world.made = [];
  fake.world.nearAsks = [];
  fake.world.trunkAsks = [];
  fake.world.treeReads = new Set();
  fake.world.columnsAtBoom = [];
  fake.world.meshes = [];
  fake.world.onset = null;
  fake.world.keyTurned = false;
  vi.resetModules();
  await import("../../../public/world/main.js");
  if (map && !reduced) await vi.waitFor(() => expect(hill().map).not.toBeNull());

  const run = (seconds: number, { ms = 20, each = () => {} } = {}) => {
    for (let k = Math.round((seconds * 1000) / ms); k > 0; k--) {
      const frame = queued;
      queued = null;
      if (!frame) throw new Error("main.js queued no frame");
      now += ms;
      frame(now);
      each();
    }
  };
  const key = (type: string, code: string) => window.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  // Holds a key down through `seconds` of frames.
  const hold = (code: string, seconds: number, each?: () => void) => {
    key("keydown", code);
    run(seconds, { each });
    key("keyup", code);
  };
  // Holds the stick pushed (dx, dy) px from its centre through `seconds` of frames, then lets go.
  const push = (dx: number, dy: number, seconds: number) => {
    const at = (type: string) => stick.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, clientX: 56 + dx, clientY: 56 + dy }));
    at("pointerdown");
    run(seconds);
    at("pointerup");
  };
  return {
    run,
    hold,
    push,
    mode: () => hill().mode,
    // The bears in the scene, lead first.
    shown: () => fake.world.bears.filter((b) => fake.world.scene.shown.has(b.g)),
    stepped: () => fake.world.stepped,
    // The addresses the page asked the site for.
    asked,
    // Puts the show `position` seconds into the track, as the player's report does.
    seek: (position: number) =>
      document.dispatchEvent(new CustomEvent("player:now", { detail: { index: 0, position, duration: TRACK.duration, at: now } })),
    // How long ago the sky's last drop fell, in seconds of world time.
    sinceDrop: () => (fake.world.sky.uniforms.uDrop.value as { z: number }).z,
    // The beam over the song's landmark, the one mesh main.js makes itself.
    beam: () => fake.world.meshes[0].material as { opacity: number; color: number },
    // The page's clock, in ms.
    now: () => now,
    // Turns lean-back on or off, as the page does on <main>.
    lean: (on: boolean) => { main.dataset.mode = on ? "leanback" : ""; for (const told of observers) told(); },
  };
}

// The world once its descent has ended with the bears (attract), the visitor's bear in its place in their line.
async function afterDescent(options?: { playing?: boolean }) {
  const page = await startWorld(options);
  page.run(DESCENT_S + 0.1);
  expect(page.mode()).toBe("attract");
  return page;
}

const expectNear = (a: Point3, b: Point3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe("main.js's frames", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a walk out of the bears' reach: a walk into the last bear stops BODY_REACH behind it, on its line", async () => {
    const page = await afterDescent();
    const last = page.shown().at(-1)!.g.position;
    expect(along(last) - along(page.stepped())).toBeGreaterThan(BODY_REACH);
    page.hold("ArrowUp", 2, () => expect(distance(page.stepped(), last)).toBeGreaterThan(BODY_REACH - 1e-9));
    expect(page.mode()).toBe("walk");
    expect(along(page.stepped())).toBeCloseTo(along(last) - BODY_REACH, 9);
    expect(across(page.stepped())).toBeCloseTo(0, 9);
  });

  it("keeps a walk out of the stage's reach: a walk back down the line into the stage stops STAGE_REACH from its centre", async () => {
    const page = await afterDescent();
    expect(distance(page.stepped(), stage)).toBeGreaterThan(STAGE_REACH);
    page.hold("ArrowDown", 4, () => expect(distance(page.stepped(), stage)).toBeGreaterThan(STAGE_REACH - 1e-9));
    expect(distance(page.stepped(), stage)).toBeCloseTo(STAGE_REACH, 9);
    expect(across(page.stepped())).toBeCloseTo(0, 9);
  });

  it("keeps a walk within the bound: a walk sideways off the island stops BOUND from its centre", async () => {
    const page = await afterDescent();
    // E steps to the right, square to the line, toward the bound.
    page.hold("KeyE", 10, () => expect(fromCentre(page.stepped())).toBeLessThan(BOUND + 1e-9));
    expect(fromCentre(page.stepped())).toBeCloseTo(BOUND, 9);
  });

  it("drops the bears a downgrade removes from a walk's keep-out: a walk back down the line passes where they stood", async () => {
    const page = await startWorld();
    const made = fake.world.bears.length;
    // Frames of 50 ms are slower than the downgrade allows (quality.js): once the load is over, each window of them steps the world
    // down a rung, until one leaves fewer bears.
    for (let k = 0; k < 1500 && page.shown().length === made; k++) page.run(0.05, { ms: 50 });
    const left = page.shown().length;
    expect(left).toBeLessThan(made);
    const dropped = fake.world.bears.slice(left).map((b) => b.g.position);
    page.run(0.1);
    // The visitor's place in the line, one gap behind the last bear shown, is now where the first bear dropped stood.
    expect(page.mode()).toBe("attract");
    expect(distance(page.stepped(), dropped[0])).toBeCloseTo(0, 9);
    page.hold("ArrowDown", 3, () => expect(across(page.stepped())).toBeCloseTo(0, 9));
    expect(along(page.stepped())).toBeLessThan(along(dropped.at(-1)!) - BODY_REACH);
  });

  it("halves the crowd at a downgrade's rung before any bear goes: its stat counts half the figures, and every bear walks on", async () => {
    const page = await startWorld();
    const made = hill().crowd.drawn;
    for (let k = 0; k < 1500 && hill().crowd.drawn === made; k++) page.run(0.05, { ms: 50 });
    expect(hill().crowd.drawn).toBe(Math.ceil(made / 2));
    expect(page.shown()).toHaveLength(fake.world.bears.length);
  });

  it("draws a handful of the land's tufts for the draw-call sweep, whose frames are counted and never looked at, and all of them otherwise", async () => {
    fake.world.sparse = false;
    await startWorld();
    expect(fake.world.sparse).toBe(false);
    await startWorld({ search: "?pose=crowd" });
    expect(fake.world.sparse).toBe(false);
    await startWorld({ search: "?pose=sweep" });
    expect(fake.world.sparse).toBe(true);
  });

  describe("the trees", () => {
    // A point `a` m along the bears' line and `c` m to one side of it.
    const off = (a: number, c: number) => { const p = LINE.at(a); return { x: p.x + c * toCentre.z, z: p.z - c * toCentre.x }; };
    const landmarks = [40.6, 60.3].map((d, k) => ({ position: { ...off(d, 7), y: 0 }, rotation: { y: 0.3 + k } }));

    it("are placed once, the tier's count of them, by the bears' line, the landmarks' outlines and the cameras' ways, and stand before the island is built round them", async () => {
      fake.world.nearSpot = (k) => ({ x: 10 + k, z: 20 + k, heading: 0, pitch: 0, clear: true });
      const trees = [off(15, 20)];
      await startWorld({ trees, songs: 2, landmarks });
      // Places first, since what grows on the island keeps out of the trunks; then the island; then the trees, with the island's light.
      expect(fake.world.made).toEqual(["places", "island", "trees"]);
      const [asked] = fake.world.treesAsked;
      expect(asked.count).toBe(100);
      // The bears' line, a point every metre of its 200 m, as [x, z].
      expect(asked.line).toHaveLength(200);
      expect(asked.line[37]).toEqual([LINE.at(37).x, LINE.at(37).z]);
      // Each landmark: where it stands, how it is turned and its outline; and, for the cameras' ways, how far along the line the
      // bears stand as its song begins and where the visitor stands to see it.
      const marks = landmarks.map((g, k) => ({ x: g.position.x, z: g.position.z, rot: g.rotation.y, poly: fake.OUTLINE, d: expect.closeTo(50 + 10 * k, 9), stand: { x: 10 + k, z: 20 + k } }));
      expect(asked.landmarks).toEqual(marks);
      // The ways of this tier's cameras, reckoned from the line, the ground, where the visitor stands by each landmark to see it, and
      // how far along the line the bears stand as its song begins: the stand-in lays the songs out a tenth of the loop apart from its
      // middle, and the line here is 100 m to the loop. A desktop's cameras, with each number of bears its ladder shows (quality.js).
      expect(asked.eyes).toBe(fake.WAYS.eyes);
      expect(asked.views).toBe(fake.WAYS.views);
      expect(fake.world.waysAsked).toHaveLength(1);
      expect(fake.world.waysAsked[0].line).toBe(LINE);
      expect((fake.world.waysAsked[0].height as typeof height)(31.7, -27.5)).toBe(height(31.7, -27.5));
      expect(fake.world.waysAsked[0].marks).toEqual(marks);
      expect(fake.world.waysAsked[0].marks).toBe(asked.landmarks);
      expect(fake.world.waysAsked[0].phone).toBe(false);
      expect(fake.world.waysAsked[0].bears).toEqual([5, 3, 1]);
      // The island is given the placing's own word on whether a trunk stands within TRUNK_ROOM of a place, and the trees take its
      // light; a desktop's are not a phone's.
      const trunks = fake.world.trunks as (x: number, z: number) => boolean;
      expect([trunks(3, 4), trunks(-3, 4)]).toEqual([true, false]);
      expect(fake.world.nearAsks).toEqual([[3, 4, fake.TRUNK_ROOM], [-3, 4, fake.TRUNK_ROOM]]);
      expect(fake.world.treesBuilt).toEqual([{ spots: trees, lit: fake.LIT, phone: false }]);
      expect(fake.world.treesBuilt[0].spots).toBe(trees);
      expect((hill() as unknown as { trees: number }).trees).toBe(1);
    });

    it("are as many as the tier draws, placed clear of the tier's own cameras: a phone's 45 by its three bears and one, a TV's 75 by a desktop's", async () => {
      await startWorld({ screen: { width: 390, height: 844, touch: true } });
      expect(hill().tier).toBe("phone");
      expect(fake.world.treesAsked[0].count).toBe(45);
      expect(fake.world.treesBuilt[0].phone).toBe(true);
      expect(fake.world.waysAsked[0].phone).toBe(true);
      expect(fake.world.waysAsked[0].bears).toEqual([3, 1]);
      await startWorld({ search: "?tier=tv" });
      expect(hill().tier).toBe("tv");
      expect(fake.world.treesAsked[0].count).toBe(75);
      expect(fake.world.treesBuilt[0].phone).toBe(false);
      expect(fake.world.waysAsked[0].phone).toBe(false);
      expect(fake.world.waysAsked[0].bears).toEqual([5, 3, 1]);
      // Those are the bears the world shows as it steps down: frames of 50 ms a window each, to the ladder's foot.
      const page = await startWorld();
      page.run(DESCENT_S + 0.1);
      const shown = new Set([page.shown().length]);
      for (let k = 0; k < 12; k++) { page.run((WINDOW * 50) / 1000, { ms: 50 }); shown.add(page.shown().length); }
      expect([...shown]).toEqual(fake.world.waysAsked[0].bears);
      // A day with no recording has no landmarks, and trees all the same.
      await startWorld({ recording: false });
      expect(fake.world.treesAsked[0].landmarks).toEqual([]);
      expect(fake.world.waysAsked[0].marks).toEqual([]);
      expect(fake.world.made).toEqual(["places", "island", "trees"]);
    });

    it("flies the cameras the trees are placed clear of: the descent from DESCENT_FROM m over the island's middle, the bears BEAR_GAP m apart, and lean-back's crane as pose.js's CRANE has it", async () => {
      const page = await startWorld();
      page.run(0.02);
      // One frame in, the descent has hardly left where it starts; and it comes down a straight line, which a second place on it
      // shows to start DESCENT_FROM m over the island's middle.
      expect(page.mode()).toBe("descent");
      const first = { ...fake.world.camera.position };
      expect(first.y).toBeGreaterThan(DESCENT_FROM - 2);
      expect(first.y).toBeLessThan(DESCENT_FROM);
      expect(Math.hypot(first.x, first.z)).toBeLessThan(2);
      page.run(2);
      const second = fake.world.camera.position;
      expect(second.y).toBeLessThan(DESCENT_FROM - 40);
      expect(first.y - first.x * ((second.y - first.y) / (second.x - first.x))).toBeCloseTo(DESCENT_FROM, 6);
      expect(first.z / first.x).toBeCloseTo(second.z / second.x, 6);
      page.run(DESCENT_S + 0.1);
      const bears = page.shown().map((b) => along(b.g.position));
      for (let k = 1; k < bears.length; k++) expect(bears[k - 1] - bears[k]).toBeCloseTo(BEAR_GAP, 9);
      // The visitor's bear, one gap behind the last.
      expect(bears[bears.length - 1] - along(page.stepped())).toBeCloseTo(BEAR_GAP, 9);
      // Lean-back: the crane hangs CRANE.back m behind the visitor's bear on the line, 9 m up, to one side by its sway, and looks
      // at the line CRANE.ahead m on from there, 8 m up.
      page.lean(true);
      let widest = 0;
      page.run(30, {
        ms: 50,
        each: () => {
          const at = fake.world.camera.position, look = fake.world.camera.target;
          expect(page.mode()).toBe("drift");
          expect(along(at)).toBeCloseTo(along(page.stepped()) - CRANE.back, 6);
          expect(along(look)).toBeCloseTo(along(at) + CRANE.ahead, 6);
          expect(across(look)).toBeCloseTo(0, 6);
          expect(at.y).toBeCloseTo(height(at.x, at.z) + 9, 6);
          widest = Math.max(widest, Math.abs(across(at)));
        },
      });
      // Over one sway, 30 s, it reaches CRANE.sway m to the side and no further.
      expect(widest).toBeLessThanOrEqual(CRANE.sway + 1e-9);
      expect(widest).toBeGreaterThan(CRANE.sway - 0.01);
    });

    it("are solid to a walk: a step sideways into a trunk stops TREE_REACH from its middle, on the line to it, the walk asking only for the trunks near it", async () => {
      const TREE_REACH = fake.TREE_REACH;
      // One to either side of the visitor's place in the line, 15 m along it, 20 m off.
      const page = await startWorld({ trees: [off(15, 20), off(15, -20)] });
      page.run(DESCENT_S + 0.1);
      expect(along(page.stepped())).toBeCloseTo(15, 9);
      const tree = (p: Point) => Math.min(distance(p, off(15, 20)), distance(p, off(15, -20)));
      fake.world.trunkAsks = [];
      page.hold("KeyE", 3, () => expect(tree(page.stepped())).toBeGreaterThan(TREE_REACH - 1e-9));
      expect(page.mode()).toBe("walk");
      expect(Math.abs(across(page.stepped()))).toBeCloseTo(20 - TREE_REACH, 9);
      expect(along(page.stepped())).toBeCloseTo(15, 9);
      // Each frame of the walk asked the trees for the trunks within their reach of the walker, and for none else.
      expect(fake.world.trunkAsks.length).toBeGreaterThanOrEqual(150);
      for (const [x, z, r] of fake.world.trunkAsks) { expect(r).toBe(TREE_REACH); expect(along({ x, z })).toBeCloseTo(15, 6); }
      // The same walk with no tree there goes on by.
      const open = await startWorld();
      open.run(DESCENT_S + 0.1);
      open.hold("KeyE", 3);
      expect(Math.abs(across(open.stepped()))).toBeGreaterThan(30);
    });

    it("move the walk's camera only by the slide and the ceiling the visitor's bear is built with: its boom has the stage's column alone, and no frame hands it a tree", async () => {
      const page = await startWorld({ search: "?pose=stage" });
      page.run(0.2);
      expect(page.mode()).toBe("walk");
      // The trees' own two, as they were built; and of columns, which draw the boom in, the stage's and no tree's.
      expect(fake.world.avatarAsk.slide).toBe(fake.SLIDE);
      expect(fake.world.avatarAsk.ceiling).toBe(fake.CEILING);
      expect(fake.world.columnsAtBoom).toEqual([STAGE_COLUMN]);
      page.hold("ArrowUp", 0.5);
      expect(fake.world.columnsAtBoom).toEqual([STAGE_COLUMN]);
      expect(fake.world.avatarAsk.columns).toHaveLength(1);
    });

    it("stand still: a frame hands them no time and asks them only for what a walk and its camera keep out of", async () => {
      // The opening, a walk in third person and in first, lean-back, and a walk under reduced motion: main.js reads their count for
      // the stats, the trunks a walk keeps out of, and the slide and the ceiling it hands the walk's camera, and nothing else of them,
      // so nothing it does can move them.
      const page = await startWorld({ trees: [off(15, 20)] });
      page.run(DESCENT_S + 0.1);
      page.hold("ArrowUp", 0.5);
      page.lean(true);
      page.run(1);
      page.lean(false);
      page.run(0.2);
      expect((hill() as unknown as { trees: number }).trees).toBe(1);
      expect([...fake.world.treeReads].sort()).toEqual(["ceiling", "count", "slide", "trunks"]);
      const still = await startWorld({ reduced: true, trees: [off(15, 20)] });
      still.hold("ArrowUp", 1);
      expect([...fake.world.treeReads].filter((name) => name !== "count").sort()).toEqual(["ceiling", "slide", "trunks"]);
    });
  });

  describe("?pose=near-K", () => {
    // Four songs' landmarks, each 7 m to one side of the bears' line, about 20 m apart along it and none a whole number of metres along;
    // and where the visitor stands by song k's: about 14 m short of it along the line, out of every bear's reach, facing a way of its own
    // and looking up a little, with a clear view.
    const beside = (d: number) => { const p = LINE.at(d); return { x: p.x + 7 * toCentre.z, y: p.y, z: p.z - 7 * toCentre.x }; };
    const landmarks = [40.6, 60.3, 80.9, 100.1].map((d, k) => ({ position: beside(d), rotation: { y: 0.3 * k } }));
    const spot = (k: number) => ({ ...beside(26 + 20 * k), heading: 0.5 + k, pitch: 0.12, clear: k !== 3 });
    const near = (search: string, options = {}) => {
      fake.world.nearSpot = spot;
      fake.world.sparse = false;
      return startWorld({ search, songs: 4, landmarks, ...options });
    };
    const send = (detail: unknown) => document.dispatchEvent(new CustomEvent("world:near", { detail }));
    const stood = (k: number) => ({ x: spot(k).x, z: spot(k).z, heading: spot(k).heading });
    // The last bear stands where the line passes nearest song k's landmark, to the 0.25 m the search steps by, and the others on ahead
    // of it, 7 m apart: none between the visitor and the landmark. Seen from over the landmark, the lead bear stands there.
    const bearsBy = (k: number, count = 5, lead = false) => {
      const bears = fake.world.bears.map((b) => along(b.g.position)), by = along(landmarks[k].position);
      expect(bears).toHaveLength(count);
      expect(Math.abs((lead ? bears[0] : bears[count - 1]) - by)).toBeLessThanOrEqual(0.125 + 1e-9);
      bears.slice(1).forEach((d, i) => expect(bears[i] - d).toBeCloseTo(7, 9));
    };

    it("stands the visitor by song K's landmark in a walk with no descent, the last bear beside it, and says which song", async () => {
      const page = await near("?pose=near-1");
      expect(page.mode()).toBe("walk");
      page.run(0.02);
      expect(page.mode()).toBe("walk");
      expect(page.stepped()).toEqual(stood(1));
      expect(hill().near).toEqual({ index: 1, title: "Bertha 2", clear: true });
      bearsBy(1);
      // The spot is outside every limit of the walk, so the walk's own keep-out had nothing to move.
      for (const b of fake.world.bears) expect(distance(page.stepped(), b.g.position)).toBeGreaterThan(BODY_REACH);
    });

    it("looks where the stand looks: up by its pitch, in first person", async () => {
      const page = await near("?pose=near-1", { view: "first" });
      page.run(0.02);
      const eye = fake.world.camera.position, look = fake.world.camera.target;
      expect(eye.x).toBeCloseTo(spot(1).x, 9);
      expect(eye.z).toBeCloseTo(spot(1).z, 9);
      expect(look.y - eye.y).toBeCloseTo(Math.sin(0.12), 9);
      expect(Math.hypot(look.x - eye.x, look.z - eye.z)).toBeCloseTo(Math.cos(0.12), 9);
    });

    it("puts a phone's three bears the same way: the last by the landmark, the lead 14 m on", async () => {
      // In first person: the stand-ins here do not frame a phone's third-person view.
      const page = await near("?pose=near-2", { screen: { width: 390, height: 844, touch: true }, view: "first" });
      page.run(0.02);
      expect(hill().tier).toBe("phone");
      bearsBy(2, 3);
    });

    it("cuts the camera to the spot in the first frame, and no frame after", async () => {
      const page = await near("?pose=near-1");
      page.run(0.02);
      expect(fake.world.cut).toBe(true);
      page.run(0.02);
      expect(fake.world.cut).toBe(false);
    });

    it("moves to another song's landmark on a world:near event, with the camera cut and the bears by that one", async () => {
      const page = await near("?pose=near-1");
      page.run(0.1);
      send({ index: 2 });
      page.run(0.02);
      expect(page.stepped()).toEqual(stood(2));
      expect(fake.world.cut).toBe(true);
      expect(hill().near).toEqual({ index: 2, title: "Bertha 3", clear: true });
      bearsBy(2);
      page.run(0.02);
      expect(fake.world.cut).toBe(false);
      // The first song, too: its index is 0.
      send({ index: 0 });
      page.run(0.02);
      expect(hill().near).toEqual({ index: 0, title: "Bertha", clear: true });
      bearsBy(0);
    });

    it("says where another landmark stands in the view", async () => {
      const page = await near("?pose=near-3");
      page.run(0.02);
      expect(hill().near).toEqual({ index: 3, title: "Bertha 4", clear: false });
      send({ index: 1 });
      page.run(0.02);
      expect(hill().near?.clear).toBe(true);
    });

    it("stays where it is on an event that names no landmark", async () => {
      const page = await near("?pose=near-2");
      page.run(0.1);
      for (const detail of [{ index: 4 }, { index: -1 }, { index: 1.5 }, { index: "1" }, {}, null]) {
        send(detail);
        page.run(0.02);
        expect(fake.world.cut, JSON.stringify(detail)).toBe(false);
        expect(hill().near, JSON.stringify(detail)).toEqual({ index: 2, title: "Bertha 3", clear: true });
        expect(page.stepped()).toEqual(stood(2));
      }
    });

    it("keeps the frame's size and the land's tufts, which the draw-call sweep gives up", async () => {
      const page = await near("?pose=near-1");
      page.run(0.1);
      send({ index: 2 });
      page.run(0.1);
      expect(hill().scale).toBe(1);
      expect(fake.world.sparse).toBe(false);
    });

    it("holds its rung through frames as slow as a software renderer's, where any other page steps down", async () => {
      // Three hundred frames half a second long: six windows over the downgrade's 34 ms.
      const slow = (page: { run: (seconds: number, options: { ms: number }) => void }) => page.run(150, { ms: 500 });
      fake.world.thinned = null;
      const page = await near("?pose=near-1");
      slow(page);
      send({ index: 2 });
      slow(page);
      expect(hill().rung).toBe(0);
      expect(hill().scale).toBe(1);
      expect(fake.world.thinned).not.toBe(true);
      const other = await startWorld({ search: "?pose=crowd" });
      slow(other);
      expect(hill().rung).toBeGreaterThan(1);
      expect(hill().scale).toBeLessThan(1);
    });

    it("stands still under reduced motion, the bears by the landmark, and draws a frame for an event", async () => {
      const page = await near("?pose=near-1", { reduced: true });
      page.run(0.02);
      expect(page.stepped()).toEqual(stood(1));
      bearsBy(1);
      // Nothing is drawn until something changes: the event is such a change.
      expect(() => page.run(0.02)).toThrow("main.js queued no frame");
      send({ index: 2 });
      page.run(0.02);
      expect(page.stepped()).toEqual(stood(2));
      bearsBy(2);
    });

    it("answers only on a preview: elsewhere the world opens on its descent, and an event stands the visitor nowhere", async () => {
      const page = await near("?pose=near-1", { hooks: false });
      expect(page.mode()).toBe("descent");
      expect(hill().near).toBeNull();
      send({ index: 2 });
      page.run(0.02);
      expect(page.mode()).toBe("descent");
      expect(hill().near).toBeNull();
    });

    it("is no pose for a song the show does not have, or a name that is not a song's number", async () => {
      for (const search of ["?pose=near-4", "?pose=near-99", "?pose=near-", "?pose=near-1x", "?pose=near--1", "?pose=nearly-1"]) {
        const page = await near(search);
        expect(page.mode(), search).toBe("descent");
        expect(hill().near, search).toBeNull();
        send({ index: 1 });
        page.run(0.02);
        expect(page.mode(), search).toBe("descent");
        expect(hill().near, search).toBeNull();
      }
    });

    it("leaves ?pose=landmark-K as it was: the bears by the landmark, the view from over it, and no near song", async () => {
      const page = await near("?pose=landmark-2");
      page.run(0.02);
      expect(page.mode()).toBe("attract");
      expect(hill().near).toBeNull();
      bearsBy(2, 5, true);
      const o = landmarks[2].position;
      expectNear(fake.world.camera.position, { x: o.x, y: o.y + 30, z: o.z });
    });

    describe("?as=K:Title", () => {
      const real = ["Bertha", "Bertha 2", "Bertha 3", "Bertha 4"];

      it("builds song K's landmark for another title, and changes nothing else about the song", async () => {
        const page = await near("?pose=near-1&as=1:Ripple&as=3:Dark%20Star%20%3E");
        page.run(0.02);
        expect(fake.world.placed).toEqual(["Bertha", "Ripple", "Bertha 3", "Dark Star >"]);
        // The path is still laid out for the show's own songs: a title pins Drums and Space to the caves (path.js).
        expect(fake.world.laidOut).toEqual(real);
        expect(hill().near).toEqual({ index: 1, title: "Ripple", clear: true });
        send({ index: 2 });
        page.run(0.02);
        expect(hill().near?.title).toBe("Bertha 3");
      });

      it("takes a title with a colon in it whole, and the last of two for one song", async () => {
        await near("?as=0:Drums:%20A%20Jam&as=2:First&as=2:Second");
        expect(fake.world.placed).toEqual(["Drums: A Jam", "Bertha 2", "Second", "Bertha 4"]);
      });

      it("leaves out a value that names no song or no title", async () => {
        await near("?as=Ripple&as=1&as=1:&as=x:Ripple&as=-1:Ripple&as=9:Ripple&as=1.5:Ripple");
        expect(fake.world.placed).toEqual(real);
      });

      it("answers only on a preview", async () => {
        await near("?pose=near-1&as=1:Ripple", { hooks: false });
        expect(fake.world.placed).toEqual(real);
        expect(fake.world.laidOut).toEqual(real);
      });

      it("places the show's own songs where no landmark is built for another title", async () => {
        await near("?pose=near-1");
        expect(fake.world.placed).toEqual(real);
      });
    });
  });

  describe("?hold=1", () => {
    // What a frame moves of each of the landmarks' moving parts: the flame's size, its light's strength, the ball's glow, the wheel's
    // turn and the miracle's height.
    const readParts = () => {
      const { flame, torch, ball, wheel, miracle } = fake.world;
      return { flame: flame.scale.x, light: torch.intensity, ball: ball.material.emissiveIntensity, wheel: wheel.rotation.y, miracle: miracle.position.y };
    };
    type Parts = ReturnType<typeof readParts>;
    // A show that plays where the analyser cannot hear it, on a map whose low end is half of full and whose one peak is at 300 s,
    // cued 8 s before the peak and run 2 s: by then the flame has swelled, its light follows the low end, and the ball, the wheel and
    // the miracle have moved by the time alone. `built` is each part before any frame ran, as it was built, and `parts` after.
    const moved = async (search: string, hooks = true) => {
      const page = await startWorld({ playing: true, routing: "plain", map: showMap({ bass: 128, peaks: [[300, 0.9]] }), search, hooks });
      const built = readParts();
      page.seek(292);
      page.run(2);
      return { page, built, parts: readParts() };
    };
    // Every part has moved from where it was built, by more than a rounding.
    const expectMoved = (parts: Parts, built: Parts) => {
      for (const name of Object.keys(built) as (keyof Parts)[]) expect(Math.abs(parts[name] - built[name]), name).toBeGreaterThan(0.01);
    };

    it("holds the landmarks' moving parts as they were built, and nothing else: the band plays on, the bears walk and the crowd dances", async () => {
      fake.world.beats = NaN;
      const { parts, built } = await moved("?hold=1");
      expect(hill().hold).toBe(true);
      // Each part is what it was before any frame ran.
      expect(parts).toEqual(built);
      // All else moves: the band is moved to the beat, the crowd dances, and no bear is hidden.
      expect(fake.world.beats).toBeGreaterThan(0);
      expect(fake.world.posed.dance).toBeGreaterThan(0);
      expect(fake.world.bears.filter((b) => b.g.visible === false)).toEqual([]);
      expect(hill().still).toBe(false);
    });

    it("moves every one of them without it: the same two seconds swell the flame, drive its light, pulse the ball, turn the wheel and lift the miracle", async () => {
      const { parts, built } = await moved("?pose=crowd");
      expect(hill().hold).toBe(false);
      expectMoved(parts, built);
    });

    it.each(["?hold=0", "?hold=", "?hold=true", "?hold=2", "?hold=01", "?hold=1x", "?hold"])("holds nothing under %s: only ?hold=1 does", async (search) => {
      // A hook that took any word for yes would hold the parts of a page that asked for them moving: the flash counter's, which
      // counts the ball's pulse.
      const { parts, built } = await moved(search);
      expect(hill().hold).toBe(false);
      expectMoved(parts, built);
    });

    it("answers only on a preview: elsewhere the parts move as ever", async () => {
      const { parts, built } = await moved("?hold=1", false);
      expect(hill().hold).toBe(false);
      expectMoved(parts, built);
    });

    it("holds them beside a landmark, on the page the shoot's near stills are taken from, through a move to another song's", async () => {
      fake.world.nearSpot = (k: number) => ({ x: 30 + k, z: 20, heading: 0, pitch: 0, clear: true });
      const landmarks = [40.6, 60.3].map((d) => ({ position: LINE.at(d), rotation: { y: 0 } }));
      const page = await startWorld({ search: "?pose=near-0&hold=1", songs: 2, landmarks });
      const built = readParts();
      page.run(1);
      document.dispatchEvent(new CustomEvent("world:near", { detail: { index: 1 } }));
      page.run(1);
      expect(hill().near?.index).toBe(1);
      expect(hill().hold).toBe(true);
      expect(readParts()).toEqual(built);
      // The same page without the hook moves what time alone moves: the ball, the wheel and the miracle. Its flame keeps its size and
      // its light its strength, since nothing plays there.
      const loose = await startWorld({ search: "?pose=near-0", songs: 2, landmarks });
      loose.run(1);
      const now = readParts();
      for (const name of ["ball", "wheel", "miracle"] as const) expect(Math.abs(now[name] - built[name]), name).toBeGreaterThan(0.01);
    });
  });

  describe("the flash counter's hooks", () => {
    // Stepped down by slow frames until a window finds no rung left: the foot of the tier's ladder.
    const foot = (page: Awaited<ReturnType<typeof startWorld>>) => {
      page.run(DESCENT_S, { ms: 50 });
      for (let k = 0, rung = -1; k < 30 && hill().rung !== rung; k++) {
        rung = hill().rung;
        page.run((WINDOW * 50) / 1000, { ms: 50 });
      }
      return hill().rung;
    };
    const blank = () => {
      fake.world.beats = NaN;
      fake.world.posed = { beats: NaN, dance: NaN, rise: NaN, sit: NaN };
      fake.world.thinned = null;
    };

    it("answer only on a preview: elsewhere ?still=1, ?rung=2 and a pose of four numbers change nothing", async () => {
      blank();
      const page = await startWorld({ playing: true, search: "?still=1&rung=2&pose=12,-30,1,0.1", hooks: false });
      expect(page.mode()).toBe("descent");
      page.run(1);
      expect(page.mode()).toBe("descent");
      expect(hill().still).toBe(false);
      expect(hill().rung).toBe(0);
      expect(hill().scale).toBe(1);
      expect(fake.world.bears).toHaveLength(5);
      expect(fake.world.bears.filter((b) => b.g.visible === false)).toEqual([]);
      // The band is moved and the crowd dances, as on any page.
      expect(Number.isNaN(fake.world.beats)).toBe(false);
      expect(fake.world.posed.dance).toBeGreaterThan(0);
    });

    it("stills the figures under ?still=1, and nothing else: the bears hidden, the band never moved, the crowd posed standing still, and says so in its stats", async () => {
      blank();
      const page = await startWorld({ playing: true, search: "?still=1" });
      expect(hill().still).toBe(true);
      page.run(1);
      expect(fake.world.bears).toHaveLength(5);
      expect(fake.world.bears.filter((b) => b.g.visible !== false)).toEqual([]);
      expect(fake.world.beats).toBeNaN();
      expect(fake.world.posed).toEqual({ beats: 0, dance: 0, rise: 0, sit: 0 });
      // The light itself plays on: the rig is lit as far as the show has the crowd dance, and its beams keep the figures' beat.
      const [beats, lit] = fake.world.stage.rig.show;
      expect(lit).toBe(1);
      expect(beats).toBeGreaterThan(0);
      // The same second without the hook moves the band and dances the crowd, and hides no bear.
      blank();
      const plain = await startWorld({ playing: true, search: "?pose=crowd" });
      expect(hill().still).toBe(false);
      plain.run(1);
      expect(fake.world.bears.filter((b) => b.g.visible === false)).toEqual([]);
      expect(fake.world.beats).toBeGreaterThan(0);
      expect(fake.world.posed.beats).toBe(fake.world.beats);
      expect(fake.world.posed.dance).toBe(1);
    });

    it.each(["?still=0", "?still=", "?still=true", "?still=2", "?still=01", "?still=1x", "?still"])("stills nothing under %s: only ?still=1 does", async (search) => {
      // A hook that took any word for yes would still the figures of a page that asked for them moving.
      blank();
      const page = await startWorld({ playing: true, search });
      expect(hill().still).toBe(false);
      page.run(1);
      expect(fake.world.bears.filter((b) => b.g.visible === false)).toEqual([]);
      expect(fake.world.beats).toBeGreaterThan(0);
      expect(fake.world.posed.dance).toBe(1);
    });

    it("keeps the hidden bears on their line under ?still=1, walking as the show plays and in a walker's way as ever", async () => {
      const page = await startWorld({ playing: true, search: "?still=1" });
      page.run(0.1);
      const before = fake.world.bears.map((b) => along(b.g.position));
      page.run(2);
      // They have walked on, 7 m apart, though none is drawn.
      fake.world.bears.forEach((b, k) => expect(along(b.g.position)).toBeGreaterThan(before[k] + 1));
      expect(page.shown()).toHaveLength(5);
    });

    it("still sits the crowd where the track seats it under ?still=1, standing still as it sits", async () => {
      blank();
      const page = await startWorld({ playing: true, title: "Space", search: "?still=1" });
      page.run(2);
      expect(fake.world.posed).toEqual({ beats: 0, dance: 0, rise: 0, sit: 1 });
    });

    it("starts a rung down its ladder under ?rung=1, as a slow second would leave it: the first rung's render scale and thinned tufts, the whole crowd", async () => {
      blank();
      const page = await startWorld({ search: "?rung=1" });
      const made = hill().crowd.drawn;
      // Before any frame is drawn.
      expect(hill().rung).toBe(1);
      expect(hill().scale).toBe(0.8);
      expect(fake.world.thinned).toBe(true);
      page.run(0.1);
      expect(hill().rung).toBe(1);
      expect(hill().crowd.drawn).toBe(made);
      expect(page.shown()).toHaveLength(5);
    });

    it("holds the rung it was asked for: slow frames that step any other world down leave it there", async () => {
      // Without the hook, these frames take a world to the foot of its ladder (the test of the sun's shadow, below).
      const page = await startWorld({ search: "?rung=1" });
      expect(foot(page)).toBe(1);
      expect(hill().scale).toBe(0.8);
      expect(fake.world.sun.castShadow).toBe(true);
    });

    it("takes ?rung=N that many of the ladder's own steps, and stops at its foot where N is more than it has", async () => {
      await startWorld({ search: "?rung=2" });
      expect(hill().rung).toBe(2);
      expect(hill().scale).toBe(0.64);
      const deep = foot(await startWorld());
      expect(deep).toBeGreaterThan(5);
      await startWorld({ search: `?rung=${deep}` });
      expect(hill().rung).toBe(deep);
      expect(fake.world.sun.castShadow).toBe(false);
      expect(fake.world.stage.light.visible).toBe(false);
      await startWorld({ search: "?rung=99" });
      expect(hill().rung).toBe(deep);
    });

    it.each(["?rung=0", "?rung=x", "?rung=1.5", "?rung=-1", "?rung=100", "?rung="])("starts at rung 0 under %s, which names no rung from 1 to 99, and steps down as any world does", async (search) => {
      const page = await startWorld({ search });
      expect(hill().rung).toBe(0);
      expect(hill().scale).toBe(1);
      expect(foot(page)).toBeGreaterThan(5);
    });

    it("leaves the draw-call sweep and reduced motion at rung 0, which both hold, whatever ?rung= asks", async () => {
      await startWorld({ search: "?pose=sweep&rung=2" });
      expect(hill().rung).toBe(0);
      // The sweep's own frame, a twentieth of the size.
      expect(hill().scale).toBe(0.05);
      const page = await startWorld({ search: "?rung=2", reduced: true });
      page.run(0.02);
      expect(hill().rung).toBe(0);
      expect(hill().scale).toBe(1);
    });

    // A spot on the island clear of the stage and of every bear, so the walk's own keep-out moves the visitor nowhere.
    const SPOT = { x: 12.5, z: -30, heading: 1.2, pitch: 0.1 };

    it("stands the visitor where four numbers say, ?pose=X,Z,HEADING,PITCH, in a walk with no descent and with the camera cut", async () => {
      const page = await startWorld({ search: "?pose=12.5,-30,1.2,0.1" });
      expect(page.mode()).toBe("walk");
      page.run(0.02);
      expect(page.mode()).toBe("walk");
      expect(distance(SPOT, stage)).toBeGreaterThan(STAGE_REACH);
      for (const b of fake.world.bears) expect(distance(SPOT, b.g.position)).toBeGreaterThan(BODY_REACH);
      expect(page.stepped()).toEqual({ x: 12.5, z: -30, heading: 1.2 });
      expect(fake.world.cut).toBe(true);
      page.run(0.02);
      expect(fake.world.cut).toBe(false);
      // The stats say where the visitor stands and how they look: there, as asked.
      expect(hill().walker).toEqual(SPOT);
    });

    it("says in its stats where the walk's limits have moved a visitor who was stood where no walker may stand", async () => {
      // 200 m east of the island's centre is past its bound: the walk's first frame brings the visitor back to it. The flash counter
      // reads this and stops a job whose pose was moved.
      const page = await startWorld({ search: "?pose=200,0,0.5,0" });
      expect(hill().walker).toEqual({ x: 200, z: 0, heading: 0.5, pitch: 0 });
      page.run(0.02);
      expect(hill().walker).toEqual({ x: BOUND, z: 0, heading: 0.5, pitch: 0 });
      expect(page.stepped()).toEqual({ x: BOUND, z: 0, heading: 0.5 });
    });

    it("looks from the visitor's eye there in first person: 3.2 m over the ground, along the heading, tilted by the pitch", async () => {
      const page = await startWorld({ search: "?pose=12.5,-30,1.2,0.1", view: "first" });
      page.run(0.02);
      const eye = { x: 12.5, y: height(12.5, -30) + 3.2, z: -30 };
      expectNear(fake.world.camera.position, eye);
      expectNear(fake.world.camera.target, { x: eye.x - Math.sin(1.2) * Math.cos(0.1), y: eye.y + Math.sin(0.1), z: eye.z - Math.cos(1.2) * Math.cos(0.1) });
    });

    it("takes negative numbers, whole numbers, and a pitch at the 0.8 rad the look allows", async () => {
      const page = await startWorld({ search: "?pose=-40,25,-2,-0.8" });
      expect(page.mode()).toBe("walk");
      page.run(0.02);
      expect(page.stepped()).toEqual({ x: -40, z: 25, heading: -2 });
    });

    it.each([
      ["three numbers", "1,2,3"],
      ["a word among them", "1,2,3,x"],
      ["five numbers", "1,2,3,4,5"],
      ["a pitch past 0.8 rad up", "1,2,3,1.5"],
      ["a pitch past 0.8 rad down", "1,2,3,-0.81"],
      ["NaN", "NaN,1,2,3"],
      ["an exponent", "1e3,0,0,0"],
      ["a space", "1, 2,3,0"],
      ["an empty number", "1,,3,0"],
    ])("takes %s for no pose: the world opens on its descent", async (_what, pose) => {
      const page = await startWorld({ search: `?pose=${pose}` });
      expect(page.mode()).toBe("descent");
      page.run(0.02);
      expect(page.mode()).toBe("descent");
    });
  });

  it("thins the land's tufts by half at the downgrade's first rung, with the render scale, long before the crowd is halved", async () => {
    const page = await startWorld();
    // The land is built with all its tufts, and nothing thins them while the world is at its own quality.
    fake.world.thinned = null;
    const made = hill().crowd.drawn;
    for (let k = 0; k < 1500 && hill().rung === 0; k++) {
      expect(fake.world.thinned).not.toBe(true);
      page.run(0.05, { ms: 50 });
    }
    expect(hill().rung).toBe(1);
    expect(fake.world.thinned).toBe(true);
    expect(hill().crowd.drawn).toBe(made);
  });

  it("turns off the sun's shadow and the stage light on the way down the downgrade's ladder: at its foot neither is left", async () => {
    const page = await startWorld();
    // The desktop's stage has the sun cast its shadow, and its light is on.
    expect(fake.world.sun.castShadow).toBe(true);
    expect(fake.world.stage.light.visible).toBe(true);
    // Once the load is over, each window of 50-ms frames steps the world down a rung, until a window finds no rung left.
    page.run(DESCENT_S, { ms: 50 });
    for (let k = 0, rung = -1; k < 30 && hill().rung !== rung; k++) {
      rung = hill().rung;
      page.run((WINDOW * 50) / 1000, { ms: 50 });
    }
    expect(fake.world.sun.castShadow).toBe(false);
    expect(fake.world.stage.light.visible).toBe(false);
  });

  it("steps nothing down while the world loads: 50-ms frames to just short of DESCENT_S leave it at rung 0", async () => {
    const page = await startWorld();
    page.run(DESCENT_S - 0.05, { ms: 50 });
    expect(hill().rung).toBe(0);
  });

  it("dances the crowd to a playing song over 0.8 s and sits it in Space over 1.5 s, or at once and still under reduced motion", async () => {
    const song = await startWorld({ playing: true });
    song.run(0.4);
    expect(fake.world.posed.dance).toBeCloseTo(0.5, 9);
    song.run(0.6);
    expect(fake.world.posed).toMatchObject({ dance: 1, sit: 0 });
    expect(fake.world.partedAtOnce).toBe(false);
    expect(fake.world.posed.beats).toBe(fake.world.beats);
    const space = await startWorld({ playing: true, title: "Space" });
    space.run(0.6);
    expect(fake.world.posed.sit).toBeCloseTo(0.4, 9);
    space.run(1);
    expect(fake.world.posed).toMatchObject({ dance: 1, sit: 1 });
    // Under reduced motion the world draws a frame for each input or change, and the first one, here the only one, sits the crowd.
    const still = await startWorld({ playing: true, title: "Space", reduced: true });
    fake.world.posed = { beats: NaN, dance: NaN, rise: NaN, sit: NaN };
    still.run(0.02);
    expect(fake.world.posed).toEqual({ beats: 0, dance: 0, rise: 0, sit: 1 });
    expect(fake.world.partedAtOnce).toBe(true);
  });

  it("lights the rig as the crowd dances and lifts its beams in Space, keeps it dark through what is not a song, and lights it still under reduced motion", async () => {
    // The rig's numbers: the figures' phase in eight beats, how far it is lit, its swing, the build-up and the lift.
    const rig = () => {
      const [beats, lit, swing, gather, lift] = fake.world.stage.rig.show;
      return { beats, lit, swing, gather, lift, drawn: fake.world.stage.rig.mesh.visible };
    };
    const song = await startWorld({ playing: true });
    song.run(0.4);
    expect(rig().lit).toBeCloseTo(0.5, 6);
    song.run(0.6);
    expect(rig()).toMatchObject({ lit: 1, lift: 0, drawn: true });
    expect(rig().beats).toBeCloseTo(fake.world.beats % 8, 5);
    // The swing eases toward the dance, 1 with no drive, with a 0.8 s time constant: half way at 1 s, there within 6 s.
    expect(rig().swing).toBeCloseTo(0.514, 3);
    song.run(5);
    expect(rig().swing).toBeCloseTo(1, 2);
    const tuning = await startWorld({ playing: true, title: "Tuning" });
    tuning.run(1);
    expect(rig()).toMatchObject({ lit: 0, drawn: false });
    const space = await startWorld({ playing: true, title: "Space" });
    space.run(2);
    expect(rig()).toMatchObject({ lit: 1, lift: 1 });
    // Under reduced motion the first frame lights it at once, its beams at rest and lifted for Space.
    const still = await startWorld({ playing: true, title: "Space", reduced: true });
    still.run(0.02);
    expect(rig()).toEqual({ beats: 0, lit: 1, swing: 0, gather: 0, lift: 1, drawn: true });
  });

  it("opens on a walk under reduced motion, and holds still as the visitor walks: the eye 3.2 m over the ground, the bears' legs at rest", async () => {
    const page = await startWorld({ reduced: true, playing: true, view: "first" });
    // The first frame stands the camera where the walk opens, not 140 m up, where the descent starts.
    page.run(0.02);
    expect(page.mode()).toBe("walk");
    expect(fake.world.camera.position.y).toBeLessThan(40);
    // While a key is held the world draws on: the eye never bobs, and though the show plays no bear swings a leg.
    page.hold("ArrowUp", 1, () => {
      const eye = fake.world.camera.position;
      expect(eye.y).toBeCloseTo(height(eye.x, eye.z) + 3.2, 9);
      const shown = page.shown();
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.flatMap((b) => b.legs.map((leg) => leg.rotation.x)).filter((x) => x !== 0)).toEqual([]);
    });
  });

  it("walks and turns as far as the stick is pushed: to its reach as a key does, halfway there from its dead zone a quarter as far", async () => {
    // Where 0.2 s of a control takes the visitor's bear from its place in the bears' line, in the walk the control starts.
    const after = async (go: (page: Awaited<ReturnType<typeof startWorld>>) => void) => {
      const page = await afterDescent();
      const from = page.stepped();
      go(page);
      const to = page.stepped();
      return { walked: distance(to, from), turned: to.heading - from.heading };
    };
    const half = REACH * (DEAD + (1 - DEAD) / 2);
    const back = await after((page) => page.hold("ArrowDown", 0.2));
    expect(back.walked).toBeGreaterThan(1);
    expect((await after((page) => page.push(0, REACH, 0.2))).walked).toBeCloseTo(back.walked, 9);
    expect((await after((page) => page.push(0, half, 0.2))).walked).toBeCloseTo(back.walked / 4, 9);
    const left = await after((page) => page.hold("ArrowLeft", 0.2));
    expect(left.turned).toBeGreaterThan(0.1);
    expect((await after((page) => page.push(-REACH, 0, 0.2))).turned).toBeCloseTo(left.turned, 9);
    expect((await after((page) => page.push(-half, 0, 0.2))).turned).toBeCloseTo(left.turned / 4, 9);
  });

  it("draws on under reduced motion while the stick is pushed, as while a key is held", async () => {
    const page = await startWorld({ reduced: true });
    page.run(0.02);
    expect(page.mode()).toBe("walk");
    const from = page.stepped();
    // A frame that queued no next one would stop the push here (run throws); a frame walks 0.24 m, so the bear walks back on.
    page.push(0, REACH, 1);
    expect(distance(page.stepped(), from)).toBeGreaterThan(1);
  });

  it("draws the rig's beams after the world's other solid things, and the crowd after the beams", async () => {
    await startWorld();
    // three draws the solid things in their render order, 0 unless one is given.
    const rigOrder = fake.world.stage.rig.mesh.renderOrder ?? 0;
    expect(rigOrder).toBeGreaterThan(0);
    expect(fake.world.crowd.renderOrder ?? 0).toBeGreaterThan(rigOrder);
  });

  it("walks the attract camera with the bears: it stands and looks where postPose puts it for the bears as they walk", async () => {
    const page = await afterDescent({ playing: true });
    const leads: number[] = [];
    page.run(10, {
      each: () => {
        const [lead, second] = page.shown().map((b) => b.g.position);
        const bearD = along(lead);
        const deps = { third: true, phone: false, bearD, count: page.shown().length, gap: bearD - along(second), line: LINE, height };
        const pose = postPose({ ...deps, keepInView: () => fake.TURN }, 0, 0);
        expectNear(fake.world.camera.position, pose.pos);
        expectNear(fake.world.camera.target, pose.look);
        leads.push(bearD);
      },
    });
    expect(page.mode()).toBe("attract");
    // The show plays, so the bears walked on, and the camera with them.
    expect(leads.at(-1)! - leads[0]).toBeGreaterThan(0);
  });

  it("draws the beam as added light in one pass that writes no depth, stands it on the song's landmark, and hides it without a recording", async () => {
    const page = await startWorld();
    page.run(0.02);
    const [beam] = fake.world.meshes;
    // Both its faces in one pass, adding its colour to what lies behind it, which still draws through it.
    expect(beam.material).toMatchObject({
      transparent: true,
      depthWrite: false,
      blending: fake.three.AdditiveBlending,
      side: fake.three.DoubleSide,
      forceSinglePass: true,
    });
    // The stand-ins place no landmark, so the beam stands over the song's point on their path, at height 0: its 36 m column, 18 m up,
    // stands on it.
    expect(beam.visible).toBe(true);
    expect(beam.position.y).toBe(18);
    await startWorld({ recording: false });
    expect(fake.world.meshes[0].visible).toBe(false);
  });

  it("tilts the look up to 0.8 rad either way: holding T, then G, for 3 s stops it there", async () => {
    const page = await startWorld({ view: "first" });
    // In first person the camera looks from the visitor's eye along their heading, tilted by their pitch.
    const pitch = () => Math.asin(fake.world.camera.target.y - fake.world.camera.position.y);
    page.hold("KeyT", 3);
    expect(pitch()).toBeCloseTo(0.8, 9);
    page.hold("KeyG", 3);
    expect(pitch()).toBeCloseTo(-0.8, 9);
  });

  it("makes the camera's near plane 0.5 m, which a bear's snout stays clear of in first person (collide.js)", async () => {
    await startWorld();
    expect(fake.world.camera.near).toBe(0.5);
  });
});

// The show here is one track of 600 s, so its night runs straight from the last light at 0 s to daybreak at 600 s (night.js): the deep
// of the night, hour 1, falls at 300 s.
describe("main.js's frames through the night", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on the hour the show stands at, in its first frame", async () => {
    const page = await startWorld();
    page.seek(300);
    page.run(0.02);
    expect(hill().night).toMatchObject({ hour: DEEP, show: DEEP, dark: 1 });
    expect(fake.world.graded).toBe(DEEP);
  });

  it("follows a seek through the hours between, at most HOUR_RATE hours a second, and lands on the show's hour", async () => {
    const page = await startWorld();
    page.run(1);
    expect(hill().night.hour).toBe(0);
    page.seek(300);
    let last = 0;
    page.run(1, {
      each: () => {
        const { hour } = hill().night;
        expect(hour - last).toBeGreaterThan(0);
        expect(hour - last).toBeLessThanOrEqual(HOUR_RATE * 0.02 + 1e-9);
        last = hour;
      },
    });
    expect(hill().night).toMatchObject({ show: DEEP });
    expect(last).toBeGreaterThan(0.3);
    expect(last).toBeLessThan(0.5);
    page.run(8);
    expect(hill().night.hour).toBeCloseTo(DEEP, 2);
    expect(fake.world.graded).toBeCloseTo(DEEP, 2);
  });

  it("keeps to the show's hour as the show plays", async () => {
    const page = await startWorld({ playing: true });
    page.run(20);
    expect(hill().night.show).toBeCloseTo((2 * 20) / 600, 3);
    expect(hill().night.show - hill().night.hour).toBeLessThan(0.004);
  });

  it("moves the island's water by the sky's own time, which stands still under reduced motion at the show's seed", async () => {
    const page = await startWorld({ playing: true });
    page.run(1);
    const early = fake.world.tide;
    page.run(2);
    expect(fake.world.tide - early).toBeCloseTo(2, 6);
    const still = await startWorld({ reduced: true, playing: true });
    still.run(0.02);
    expect(fake.world.tide).toBe(7);
    still.hold("ArrowLeft", 0.5);
    expect(fake.world.tide).toBe(7);
  });

  it("tells the island how quiet the music is, eased over seconds: 1 in silence, less as the show's map grows loud, and always 1 under reduced motion", async () => {
    const quiet = await startWorld();
    quiet.run(1);
    expect(fake.world.calm).toBe(1);
    const loud = await startWorld({ playing: true, routing: "plain", map: showMap({ rms: 255 }) });
    loud.run(0.5);
    const early = fake.world.calm;
    expect(early).toBeLessThan(1);
    expect(early).toBeGreaterThan(0.7);
    loud.run(6);
    expect(fake.world.calm).toBeLessThan(0.2);
    const still = await startWorld({ reduced: true, playing: true, routing: "plain", map: showMap({ rms: 255 }) });
    still.run(0.02);
    expect(fake.world.calm).toBe(1);
  });

  it("lands at once under reduced motion, on the hour halfway through the song, wherever the song has got to", async () => {
    const page = await startWorld({ reduced: true });
    page.run(0.02);
    expect(hill().night).toMatchObject({ hour: DEEP, show: DEEP });
    page.seek(30);
    page.hold("ArrowLeft", 0.1);
    expect(hill().night).toMatchObject({ hour: DEEP, show: DEEP });
  });

  it("adds the night's share to the stage light steadily: the music moves the light by as much in the deep of the night as at dusk", async () => {
    const lit = async (bass: number, position: number) => {
      const page = await startWorld({ playing: true, routing: "plain", map: showMap({ bass }) });
      page.seek(position);
      page.run(2);
      return fake.world.stage.light.intensity - 60 * fake.world.lift;
    };
    // The low end at 255 and at 0, at dusk and in the deep of the night (the seek to 298 s lands in the first frame).
    const dusk = (await lit(255, 0)) - (await lit(0, 0));
    const deep = (await lit(255, 298)) - (await lit(0, 298));
    expect(dusk).toBeCloseTo(60 * 1.6, 9);
    expect(deep).toBeCloseTo(dusk, 9);
    expect(fake.world.lift).toBeGreaterThan(0.9);
    expect(fake.world.lift).toBeCloseTo(lookAt(fake.world.graded, newLook()).stageLift, 9);
  });

  it("lights the rig's beams in full through the night and lets the daylight wash them out toward daybreak", async () => {
    const lit = async (position: number) => {
      const page = await startWorld({ playing: true });
      page.seek(position);
      page.run(2);
      return (hill() as unknown as { rig: { lit: number } }).rig.lit;
    };
    expect(await lit(0)).toBe(1);
    expect(await lit(298)).toBe(1);
    // 590 s of the 600: the look's own share for the beams at that hour.
    const late = await lit(588);
    expect(late).toBeCloseTo(lookAt(fake.world.graded, newLook()).beams, 3);
    expect(late).toBeLessThan(0.6);
    expect(late).toBeGreaterThan(0.4);
  });

  it("redraws the stage's shadow only in a frame where the sky says its key light has turned", async () => {
    const page = await startWorld();
    page.run(0.1);
    fake.world.shadowMap.needsUpdate = false;
    page.run(0.1);
    expect(fake.world.shadowMap.needsUpdate).toBe(false);
    fake.world.keyTurned = true;
    page.run(0.02);
    expect(fake.world.shadowMap.needsUpdate).toBe(true);
  });
});

describe("main.js's frames with the show's map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The stage light: 60, its own intensity, times layer 2's factor for the low end `bass` (0-255) at full weight, or 1 while the music
  // drives nothing (null), and the steady share of it the night adds at the hour the world shows (night.js).
  const stageLight = (bass: number | null) => 60 * ((bass === null ? 1 : 0.4 + 1.6 * (bass / 255)) + fake.world.lift);

  it("asks for the show's map once the world is ready", async () => {
    const page = await startWorld({ playing: true, map: showMap() });
    expect(page.asked).toEqual([`/maps/${SHOW}.json`]);
  });

  it.each<[string, string, string]>([
    ["where the show plays in plain stereo", "plain", ""],
    ["through the world's graph too under ?drive=map, a preview's test hook", "webaudio", "?drive=map"],
  ])("drives the world with the map %s", async (_where, routing, search) => {
    await startWorld({ playing: true, routing, search, map: showMap({ bass: 128 }) }).then((page) => page.run(2));
    expect(hill().analysis).toMatchObject({ source: "map", weight: 1 });
    expect(fake.world.stage.light.intensity).toBeCloseTo(stageLight(128), 9);
  });

  it.each<[string, boolean, string]>([
    // Here the analyser hears nothing, as in a stall or between tracks: the world rests as it does with no map.
    ["while the show plays through the world's graph, where the analyser hears it", true, "webaudio"],
    ["while the show is paused", false, "plain"],
  ])("takes no drive from the map %s", async (_where, playing, routing) => {
    await startWorld({ playing, routing, map: showMap({ bass: 128 }) }).then((page) => page.run(2));
    expect(hill().analysis).toMatchObject({ source: null, weight: 0 });
    expect(fake.world.stage.light.intensity).toBeCloseTo(stageLight(null), 9);
  });

  it("reads a map of 4 s a step on its own clock: the drive from the byte a time falls in, and the build-up and the tempo as at 1 s", async () => {
    // Each 4-s byte of the low end reads its index: at 292 s, byte 73 (at 1 s a step it would be the last of the 150 bytes).
    const map = showMap({ step: 4, bass: (byte) => byte, bpm: 60, peaks: [[300, 0.9]] });
    const page = await startWorld({ playing: true, routing: "plain", map });
    page.seek(288);
    page.run(4);
    expect(hill().map).toMatchObject({ step: 4, bass: Math.round((73 / 255) * 1000) / 1000, build: 0.6, bpm: 120 });
    expect(fake.world.stage.light.intensity).toBeCloseTo(stageLight(73), 9);
    expect(fake.world.flame.scale.x).toBeCloseTo(1 + 1.2 * 0.6, 9);
  });

  it("swells the flame over the 20 s before a peak to 2.2 times its size at the peak, easing to it from a seek and from it after the peak", async () => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    page.seek(270);
    page.run(1);
    // 29 s before the peak there is no build-up yet.
    expect(fake.world.flame.scale.x).toBe(1);
    // A seek to 8 s before it: one 20-ms frame takes the build-up 0.025 of the way, and in 0.8 s it has caught up with the map.
    page.seek(292);
    page.run(0.02);
    expect(fake.world.flame.scale.x).toBeCloseTo(1 + 1.2 * 0.025, 9);
    page.run(0.98);
    expect(hill().map?.build).toBe(0.65);
    expect(fake.world.flame.scale.x).toBeCloseTo(1 + 1.2 * 0.65, 9);
    page.run(7);
    expect(fake.world.flame.scale.x).toBeCloseTo(2.2, 9);
    // The beam over the song's landmark is 1.2 times as bright, 0.192 of its colour at dusk; in the dark it is dimmed by up to 0.65,
    // and the peak, halfway through this one-track show, falls in the deep of the night.
    expect(fake.world.dark).toBeGreaterThan(0.99);
    expect(page.beam().opacity).toBeCloseTo(0.192 * (1 - 0.65 * fake.world.dark), 9);
    // Past the peak the build-up falls 0.025 a frame, so it is gone within 0.8 s.
    page.run(0.02);
    expect(fake.world.flame.scale.x).toBeCloseTo(1 + 1.2 * 0.975, 9);
    page.run(0.8);
    expect(fake.world.flame.scale.x).toBe(1);
  });

  it("eases the rig's swing toward the crowd's dance with a 0.8 s time constant, so a step of the music's loudness reaches the beams slowly", async () => {
    // The map's loudness steps from nothing to its top at 10 s, which takes the crowd's dance from 0.4 to 1.6 at once.
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ rms: (byte) => (byte < 10 ? 0 : 255) }) });
    const swing = () => fake.world.stage.rig.show[2];
    page.run(9.5);
    expect(hill().crowd.dance).toBe(0.4);
    expect(swing()).toBeCloseTo(0.4, 3);
    // 0.8 s past the step the dance stands at 1.6, and the swing has come 63 % of the way.
    page.run(1.3);
    expect(hill().crowd.dance).toBe(1.6);
    expect(swing()).toBeCloseTo(0.4 + 1.2 * (1 - Math.exp(-1)), 1);
    page.run(6);
    expect(swing()).toBeCloseTo(1.6, 2);
  });

  it("gathers the rig's beams with the build-up as it rises, and opens them again over 8 s once the music passes the peak", async () => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    const gather = () => fake.world.stage.rig.show[3];
    page.seek(296);
    page.run(4);
    // At 300 s the build-up stands at its top, and the beams are gathered with it.
    expect(hill().map?.build).toBe(1);
    expect(gather()).toBeCloseTo(1, 6);
    // Past the peak the build-up is gone within 0.8 s, while the gather falls 1/8 a second.
    page.run(0.8);
    expect(hill().map?.build).toBe(0);
    expect(gather()).toBeCloseTo(0.9, 5);
    page.run(7.2);
    expect(gather()).toBeCloseTo(0, 5);
  });

  // Frames at 100, 50, 25 and 20 a second, each of which lands on the peak at 300 s. The rig keeps its numbers in 32-bit floats, so
  // after hundreds of frames the gather reads true to 4 places.
  it.each([10, 20, 40, 50])("opens the rig's beams over the same 8 s of the music past a peak at frames of %i ms", async (ms) => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    const gather = () => fake.world.stage.rig.show[3];
    page.seek(296);
    page.run(4, { ms });
    expect(gather()).toBeCloseTo(1, 6);
    page.run(0.8, { ms });
    expect(gather()).toBeCloseTo(0.9, 4);
    page.run(4, { ms });
    expect(gather()).toBeCloseTo(0.4, 4);
  });

  it("opens the rig's beams no further in a frame of 1 s than in one of 50 ms, the most world time a frame takes", async () => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    const gather = () => fake.world.stage.rig.show[3];
    page.seek(296);
    page.run(4.8);
    expect(gather()).toBeCloseTo(0.9, 5);
    // One frame of 1 s, as when the page's frames stall: the gather falls 0.05 / 8, where 1 s would take it 1 / 8.
    page.run(1, { ms: 1000 });
    expect(gather()).toBeCloseTo(0.9 - 0.05 / 8, 5);
  });

  it("keeps every channel under the clip where the beam crosses the sand rim, at the top of its build-up", async () => {
    // The rim as the stills read it, in 8-bit sRGB. Under additive blending a ray through the beam crosses its two faces, each adding the
    // beam's colour times its opacity.
    const RIM = [161, 133, 111];
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    page.seek(296);
    page.run(4);
    // At 300 s the build-up stands at its top.
    expect(hill().map?.build).toBe(1);
    const { opacity, color } = page.beam();
    const beam = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    RIM.forEach((channel, k) => expect(channel + 2 * opacity * beam[k], `channel ${k}`).toBeLessThan(255));
  });

  it("drops a ring in the sky as the music passes a peak", async () => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    page.seek(298);
    page.run(1);
    // No drop has fallen yet: the first of every 40-60 s comes later.
    expect(page.sinceDrop()).toBeGreaterThan(99);
    page.run(2);
    // The peak passed at 300 s, 1 s ago.
    expect(page.sinceDrop()).toBeCloseTo(1, 9);
  });

  it("drops nothing when a seek jumps over a peak", async () => {
    const page = await startWorld({ playing: true, routing: "plain", map: showMap({ peaks: [[300, 0.9]] }) });
    page.seek(290);
    page.run(1);
    page.seek(310);
    page.run(1);
    expect(page.sinceDrop()).toBeGreaterThan(99);
  });

  it("plays the figures at the map's tempo, folded into their range, and at 96 a minute on a day without a map", async () => {
    // The map reads 60 a minute, which the figures play at 120: two beats a second.
    const page = await startWorld({ playing: true, map: showMap({ bpm: 60 }) });
    page.run(5);
    expect(fake.world.beats).toBeCloseTo(10, 9);
    expect(hill().map?.bpm).toBe(120);
    const plain = await startWorld({ playing: true });
    plain.run(5);
    expect(fake.world.beats).toBeCloseTo(8, 9);
  });

  it("pulls the figures onto the beat of an onset the analyser hears, where the map gives the tempo", async () => {
    // At the map's 120 a minute, 2 beats a second, the figures' phase reads 2 at 1 s. An onset heard then reaches the next frame, 20 ms
    // on, which reads it at 1.96: the music's beat came 0.04 beat before theirs, so they take up half of that over 0.2 s.
    const page = await startWorld({ playing: true, map: showMap({ bpm: 60 }) });
    page.run(1);
    fake.world.onset = page.now();
    page.run(1);
    expect(fake.world.beats).toBeCloseTo(2 + 2 + 0.02, 3);
    expect(hill().map).toMatchObject({ locks: 1 });
  });

  it("asks for no map under reduced motion, where none of it would run", async () => {
    const page = await startWorld({ playing: true, routing: "plain", reduced: true, map: showMap({ bass: 128 }) });
    await new Promise((settle) => setTimeout(settle, 50));
    expect(page.asked).toEqual([]);
    expect(hill().map).toBeNull();
  });
});

// A phone's first frame. For these the stand-ins also keep how high in the frame main.js keeps the visitor's bear.
describe("main.js's frames on a phone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A phone held upright, and one on its side: 640 px wide or wider, where the page hides the stick, and still a touch screen under
  // 900 px, which keeps the phone's tier.
  const UPRIGHT: Screen = { width: 390, height: 844, touch: true };
  const ON_ITS_SIDE: Screen = { width: 844, height: 390, touch: true };
  // The line the world's first frame keeps the visitor's feet at or above, in px from the frame's top. main.js asks the visitor's bear for
  // it as a height in the frame, from 1 at its top to -1 at its foot.
  const feetLine = async (screen: Screen, hud: Hud) => {
    const page = await startWorld({ screen, hud });
    expect(hill().tier).toBe("phone");
    page.run(0.02);
    return ((1 - fake.world.keptY) / 2) * screen.height;
  };

  it("keeps the visitor's feet 24 px above the now-plate while the plate is out, whatever stands below it or does not", async () => {
    expect(await feetLine(UPRIGHT, { plate: 500, stick: 708 })).toBeCloseTo(476, 9);
    expect(await feetLine(UPRIGHT, { plate: 448, stick: 708, hint: 640 })).toBeCloseTo(424, 9);
    expect(await feetLine(ON_ITS_SIDE, { plate: 196, stick: null })).toBeCloseTo(172, 9);
  });

  it("keeps them 24 px above the stick once the now-plate is away on its shelf, and above the hint while it stands over the stick", async () => {
    expect(await feetLine(UPRIGHT, { plate: 500, away: true, stick: 708 })).toBeCloseTo(684, 9);
    expect(await feetLine(UPRIGHT, { plate: 448, away: true, stick: 708, hint: 640 })).toBeCloseTo(616, 9);
  });

  it("keeps them 24 px above the frame's foot where the now-plate is away and the stick has no box, or above the hint while it shows", async () => {
    expect(await feetLine(ON_ITS_SIDE, { plate: 196, away: true, stick: null })).toBeCloseTo(366, 9);
    expect(await feetLine(ON_ITS_SIDE, { plate: 196, away: true, stick: null, hint: 314 })).toBeCloseTo(290, 9);
  });
});
