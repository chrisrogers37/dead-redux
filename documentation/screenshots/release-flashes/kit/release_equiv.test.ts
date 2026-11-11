import { appendFileSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BODY_REACH } from "../../../public/world/collide.js";
import { BOUND, height, STAGE, STAGE_REACH } from "../../../public/world/ground.js";
import { DESCENT_S } from "../../../public/world/modes.js";
import { postPose } from "../../../public/world/pose.js";

// public/world/main.js runs here as a page runs it, frame by frame, with the modules it imports: what keeps a walk in bounds (confine,
// with the limits walkLimits builds from the bears' live spots), where attract puts the camera (postPose), and what the show's map does
// (maps.js, beat.js and audio.js's mappings; the analyser hears nothing here, since no AudioContext is made). three, and the modules
// that import it (the island, the path and its landmarks, the bears, the visitor's bear, the sky and the stage), load only in a
// browser, through the page's import map, so stand-ins play them, with what the frames here use: a desktop's, in third person. They
// draw nothing, and keep what the tests read: where each bear stands, where the visitor's bear steps, where the camera stands and
// looks, the stage light, the flame's size, the sky's drop, the figures' beat and the rig's aim.

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
  }
  type Bear = { g: { position: Vec; rotation: { y: number } }; legs: { rotation: { x: number } }[]; phase: number };
  type Stage = {
    light: { visible: boolean; intensity: number };
    rig: { show: Float32Array; mesh: { visible: boolean; renderOrder?: number } };
    move: (dt: number, t: number, beats: number) => void;
  };
  type CrowdMesh = { count: number; renderOrder?: number };
  type Sky = { uniforms: Record<string, { value: number | Vec }> };

  // What the world main.js built: its scene, its camera, every bear it made (a downgrade drops some from the scene), and where the
  // visitor's bear last stepped; the flame of a fire landmark, the stage, the crowd's mesh, the sky and the meshes main.js makes itself
  // (the beam); and the figures' phase in beats, as the last frame gave it to the stage, the crowd's pose, as the last frame gave it to
  // the crowd, and whether its last parting stood the figures at once.
  // `line` is the bears' line each test gives it, and `onset` the time of the last onset the analyser heard, which each test sets (null
  // for none).
  const world = {
    line: undefined as unknown as Line,
    scene: undefined as unknown as Scene,
    camera: undefined as unknown as Camera,
    bears: [] as Bear[],
    stepped: { x: NaN, z: NaN, heading: NaN },
    flame: { scale: new Vec(1, 1, 1) },
    stage: undefined as unknown as Stage,
    crowd: undefined as unknown as CrowdMesh,
    sky: undefined as unknown as Sky,
    meshes: [] as { material: unknown }[],
    beats: NaN,
    posed: { beats: NaN, dance: NaN, rise: NaN, sit: NaN },
    partedAtOnce: null as boolean | null,
    onset: null as number | null,
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
    constructor() {
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
  const three = {
    WebGLRenderer: class {
      shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false };
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
    island: { buildIsland: () => ({ caves: [] }) },
    path: {
      // The loop, where the walker stands before a frame puts it in its place in the bears' line.
      buildPath: () => ({ at: () => new Vec(), tangentAt: () => new Vec(1, 0, 0) }),
      // Where each song's landmark stands along the loop, and the loop's end: the first song at 0.5.
      layout: (tracks: unknown[]) => Array.from({ length: tracks.length + 1 }, (_, i) => 0.5 + 0.1 * i),
      placeLandmarks: () => [],
      buildSegues: () => {},
      buildWalkLine: () => world.line,
    },
    landmarks: {
      // One part that moves: a fire landmark's flame, which swells before a peak.
      makeBuilders: () => {
        world.flame = { scale: new Vec(1, 1, 1) };
        return { moving: [{ obj: world.flame, kind: "swell" }] };
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
    },
    avatar: {
      buildAvatar: () => ({
        g: { visible: true },
        head: new Vec(),
        top: new Vec(),
        feet: new Vec(),
        step: (x: number, z: number, heading: number) => {
          world.stepped = { x, z, heading };
        },
        // The third-person camera's boom, which here only looks at the walker.
        boom: (_camera: Camera, walker: Point) => new Vec(walker.x, 0, walker.z),
        settle: () => {},
        turnDown: () => TURN,
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
        return {
          skyMat: world.sky,
          hemi: { color: new Vec() },
          sun: { castShadow: false },
          // The stage panel's material, whose gain each frame writes.
          panelMat: { uniforms: { uGain: { value: Float32Array.of(1) } } },
        };
      },
      skyPair: () => [new Vec(), new Vec()],
    },
    stage: {
      buildStage: () => {
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
  return { world, three, modules, TURN };
});

vi.mock("three", () => fake.three);
vi.mock("../../../public/world/island.js", () => fake.modules.island);
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
  mode: string;
  crowd: { drawn: number; dance: number; sit: number; parted: number };
  analysis: { source: string | null; weight: number };
  map: { step: number; bass: number; build: number; swell: number; bpm: number | null } | null;
};
const hill = () => (window as unknown as { __hill: Hill }).__hill;

// The page around the world, played by stand-ins: <main>, which carries the player's state, how the show sounds and the view; the
// world's element; the window, which takes the keys; a desktop's screen, which quality.js reads in matchMedia, innerWidth and navigator;
// the site, which serves `map` as the show's map, and no other; and the frames, which `run` hands main.js, each `ms` long (a frame adds
// at most 50 ms of world time), calling `each` after each one. `playing` starts the show playing; `routing` is how it sounds ("webaudio"
// through the world's graph, "plain" in plain stereo); `search` is the page's query, on a preview; `reduced` asks for reduced motion;
// `title` names the track. A page with a map waits until the world has read it.
async function startWorld({ playing = false, routing = "webaudio", search = "", reduced = false, map = null as object | null, title = TRACK.title, duration = TRACK.duration } = {}) {
  let now = 0;
  let queued: FrameRequestCallback | null = null;
  const container = Object.assign(new EventTarget(), {
    dataset: {},
    clientWidth: 1280,
    clientHeight: 720,
    appendChild: () => {},
    getBoundingClientRect: () => ({ top: 0 }),
  });
  const main = { dataset: { state: playing ? "playing" : "paused", routing, view: "third", ...(search ? { testHooks: "1" } : {}) } };
  const data = { showDate: SHOW, identifier: RECORDING, tracks: [{ ...TRACK, title, duration }], seed: 7 };
  const byId: Record<string, unknown> = { world: container, "world-data": { textContent: JSON.stringify(data) } };
  const media = (query: string) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)" });
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
      querySelector: (selector: string) => (selector === "main" ? main : null),
      querySelectorAll: () => [],
      createElement: () => ({ getContext: () => ({}) }),
    }),
  );
  vi.stubGlobal("window", Object.assign(new EventTarget(), { matchMedia: media, devicePixelRatio: 1 }));
  vi.stubGlobal("matchMedia", media);
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("navigator", { maxTouchPoints: 0, userAgent: "" });
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
  vi.stubGlobal("MutationObserver", class { observe() {} });
  fake.world.line = LINE;
  fake.world.meshes = [];
  fake.world.onset = null;
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
  return {
    run,
    hold,
    mode: () => hill().mode,
    // The bears in the scene, lead first.
    shown: () => fake.world.bears.filter((b) => fake.world.scene.shown.has(b.g)),
    stepped: () => fake.world.stepped,
    // The addresses the page asked the site for.
    asked,
    // Puts the show `position` seconds into the track, as the player's report does.
    seek: (position: number) =>
      document.dispatchEvent(new CustomEvent("player:now", { detail: { index: 0, position, duration, at: now } })),
    // How long ago the sky's last drop fell, in seconds of world time.
    sinceDrop: () => (fake.world.sky.uniforms.uDrop.value as { z: number }).z,
    // The beam over the song's landmark, the one mesh main.js makes itself.
    beam: () => fake.world.meshes[0].material as { opacity: number; color: number },
    // The page's clock, in ms.
    now: () => now,
  };
}

// The world once its descent has ended with the bears (attract), the visitor's bear in its place in their line.

// The release harness (capture_release2.py, RELEASE) restates main.js's frame for the rig's swing and gather by hand. Here main.js runs
// itself, as above, through each of the release rows' real tracks (their maps, from the site the harness serves), one 30-fps frame at a
// time from 45 s before the peak, and each frame the harness's own lines run beside it on main.js's own t and dt: the frame's place in
// the track and its step. From 3 s before the peak, where the harness starts drawing, to 1 s past the release, each frame's rig[3] (the
// gather) and rig[2] (the swing), as main.js wrote them, are set against the restatement's. GATHER is the harness's row setting: "rise"
// (main at eaf2181c) or 8 (the fix's RIG_OPEN_S). Each row's result is a JSON line in OUT.
const SITE = process.env.SITE ?? "";
const OUT = process.env.OUT ?? "";
const GATHER: "rise" | number = process.env.GATHER === "rise" ? "rise" : Number(process.env.GATHER);
const ROWS = [
  { name: "159-change", show: "1973-11-11", index: 10, peak: 183 },
  { name: "159-wide", show: "1979-08-05", index: 6, peak: 522 },
  { name: "140-wide", show: "1994-09-27", index: 1, peak: 487 },
  { name: "140-change", show: "1990-12-09", index: 6, peak: 366 },
  { name: "120-wide", show: "1986-12-16", index: 14, peak: 656 },
  { name: "120-change", show: "1986-07-07", index: 3, peak: 122 },
];

describe("the release harness's frame lines beside main.js's frames", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ROWS)("$name", async (row) => {
    const raw = JSON.parse(readFileSync(`${SITE}/maps/${row.show}.json`, "utf8"));
    const real = raw.tracks[row.index];
    const map = { v: 1, show: SHOW, analysed: RECORDING, playing: RECORDING, step: raw.step, tracks: [real] };
    const page = await startWorld({ playing: true, routing: "plain", map, title: real.title, duration: real.playingDuration });
    const maps = await import("../../../public/world/maps.js");
    const audio = await import("../../../public/world/audio.js");
    const track = maps.readMap(map).tracks[0];
    const ms = 1000 / 30;
    page.run(1, { ms });
    const position = row.peak - 45;
    page.seek(position);
    const at = page.now();
    const show = fake.world.stage.rig.show;
    // The harness's lines, as RELEASE has them, on main.js's t and dt.
    const toward = (value: number, target: number, step: number) => value + Math.max(-step, Math.min(step, target - value));
    let build = 0, swing = 0, gather = 0, last = page.now();
    let frames = 0, gatherDiffer = 0, gatherMost = 0, swingMost = 0, litLeast = 1, relFirst: number | null = null, relLast: number | null = null;
    const atPeak: Record<string, number> = {};
    for (let k = 0; k < 60 * 30; k++) {
      page.run(ms / 1000, { ms });
      const now = page.now();
      const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
      last = now;
      const t = Math.min(real.playingDuration, position + (now - at) / 1000);
      build = toward(build, maps.buildUp(track, t), dt / 0.8);
      const l2 = audio.mappings(maps.mapDrive(track, t), 1, build);
      swing += (l2.dance - swing) * (1 - Math.exp(-dt / 0.8));
      gather = GATHER === "rise" ? l2.rise : Math.fround(Math.max(l2.rise, gather - dt / GATHER));
      const f = Math.round((t - row.peak) * 30);
      if (f < -90) continue;
      frames++;
      const g = Math.fround(gather);
      if (show[3] !== g) gatherDiffer++;
      gatherMost = Math.max(gatherMost, Math.abs(show[3] - g));
      swingMost = Math.max(swingMost, Math.abs(show[2] - swing));
      litLeast = Math.min(litLeast, show[1]);
      if ([0, 12, 24, 120, 240].includes(f)) atPeak[`f${f}`] = +show[3].toFixed(4);
      if (f > 0 && show[3] < 1 && relFirst === null) relFirst = f;
      if (relFirst !== null && relLast === null && show[3] <= 1e-9) relLast = f;
      if (relLast !== null && f >= relLast + 30) break;
    }
    const result = { gather: GATHER, row: row.name, title: real.title, peak: row.peak, frames, gatherDiffer, gatherMost, swingMost, litLeast, relFirst, relLast, mainGather: atPeak };
    appendFileSync(OUT, JSON.stringify(result) + "\n");
    // 3 s before the peak, the release and 1 s after it; the gather as main.js writes it; the swing to its float array's precision.
    expect(frames).toBeGreaterThan(4 * 30);
    expect(gatherDiffer).toBe(0);
    expect(swingMost).toBeLessThan(1e-6);
  });
});
