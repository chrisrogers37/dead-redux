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
// looks, the stage light, the flame's size, the sky's drop and the figures' beat.

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
  type Stage = { light: { visible: boolean; intensity: number }; panel: { material: { color: Vec } }; move: (dt: number, t: number, beats: number) => void };
  type Sky = { uniforms: Record<string, { value: number | Vec }> };

  // What the world main.js built: its scene, its camera, every bear it made (a downgrade drops some from the scene), and where the
  // visitor's bear last stepped; the flame of a fire landmark, the stage and the sky; and the figures' phase in beats, as the last
  // frame gave it to the stage. `line` is the bears' line each test gives it.
  const world = {
    line: undefined as unknown as Line,
    scene: undefined as unknown as Scene,
    camera: undefined as unknown as Camera,
    bears: [] as Bear[],
    stepped: { x: NaN, z: NaN, heading: NaN },
    flame: { scale: new Vec(1, 1, 1) },
    stage: undefined as unknown as Stage,
    sky: undefined as unknown as Sky,
    beats: NaN,
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
    },
    avatar: {
      buildAvatar: () => ({
        g: { visible: true },
        head: new Vec(),
        top: new Vec(),
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
        return { skyMat: world.sky, hemi: { color: new Vec() }, sun: { castShadow: false } };
      },
      skyPair: () => [new Vec(), new Vec()],
    },
    stage: {
      buildStage: () => {
        world.stage = {
          light: { visible: true, intensity: 60 },
          panel: { material: { color: new Vec() } },
          move: (_dt, _t, beats) => {
            world.beats = beats;
          },
        };
        return world.stage;
      },
      STAGE_SOUND: { x: 0, y: 0, z: 0, facing: [0, 0, 1] },
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

// A map of the show as the site serves one (maps.js checks it): TRACK at one second a step, every second's loudness `rms` and low end
// `bass` as bytes (0-255), the tempo `bpm` in every 10-s window (0 for none), and the peaks as [second, strength].
function showMap({ rms = 0, bass = 0, bpm = 0, peaks = [] as number[][] } = {}) {
  const bytes = (values: number[]) => Buffer.from(values).toString("base64");
  const each = (n: number, value: number) => bytes(Array.from({ length: n }, () => value));
  return {
    v: 1,
    show: SHOW,
    analysed: RECORDING,
    playing: RECORDING,
    step: 1,
    tracks: [
      {
        title: TRACK.title,
        analysedDuration: TRACK.duration,
        playingDuration: TRACK.duration,
        env: { rms: each(TRACK.duration, rms), bass: each(TRACK.duration, bass), bright: each(TRACK.duration, 0) },
        tempo: bytes(Array.from({ length: (2 * TRACK.duration) / 10 }, (_, i) => (i % 2 ? 255 : bpm))),
        peaks,
      },
    ],
  };
}

type Hill = {
  mode: string;
  analysis: { source: string | null; weight: number };
  map: { build: number; swell: number; bpm: number | null } | null;
};
const hill = () => (window as unknown as { __hill: Hill }).__hill;

// The page around the world, played by stand-ins: <main>, which carries the player's state, how the show sounds and the view; the
// world's element; the window, which takes the keys; a desktop's screen, which quality.js reads in matchMedia, innerWidth and navigator;
// the site, which serves `map` as the show's map, and no other; and the frames, which `run` hands main.js, each `ms` long (a frame adds
// at most 50 ms of world time), calling `each` after each one. `playing` starts the show playing; `routing` is how it sounds ("webaudio"
// through the world's graph, "plain" in plain stereo); `search` is the page's query, on a preview; `reduced` asks for reduced motion.
// A page with a map waits until the world has read it.
async function startWorld({ playing = false, routing = "webaudio", search = "", reduced = false, map = null as object | null } = {}) {
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
  const data = { showDate: SHOW, identifier: RECORDING, tracks: [TRACK], seed: 7 };
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
      document.dispatchEvent(new CustomEvent("player:now", { detail: { index: 0, position, duration: TRACK.duration, at: now } })),
    // How long ago the sky's last drop fell, in seconds of world time.
    sinceDrop: () => (fake.world.sky.uniforms.uDrop.value as { z: number }).z,
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
});

describe("main.js's frames with the show's map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The stage light as the music sets it: 60, its own intensity, times layer 2's factor for the low end `bass` (0-255) at full weight.
  const stageLight = (bass: number) => 60 * (0.4 + 1.6 * (bass / 255));

  it("asks for the show's map once the world is ready", async () => {
    const page = await startWorld({ playing: true, map: showMap() });
    expect(page.asked).toEqual([`/maps/${SHOW}.json`]);
  });

  it.each([
    { where: "where the show plays in plain stereo", routing: "plain", search: "" },
    { where: "through the world's graph too under ?drive=map, a preview's test hook", routing: "webaudio", search: "?drive=map" },
  ])("drives the world with the map $where", async ({ routing, search }) => {
    await startWorld({ playing: true, routing, search, map: showMap({ bass: 128 }) }).then((page) => page.run(2));
    expect(hill().analysis).toMatchObject({ source: "map", weight: 1 });
    expect(fake.world.stage.light.intensity).toBeCloseTo(stageLight(128), 9);
  });

  it.each([
    // Here the analyser hears nothing, as in a stall or between tracks: the world rests as it does with no map.
    { where: "while the show plays through the world's graph, where the analyser hears it", playing: true, routing: "webaudio" },
    { where: "while the show is paused", playing: false, routing: "plain" },
  ])("takes no drive from the map $where", async ({ playing, routing }) => {
    await startWorld({ playing, routing, map: showMap({ bass: 128 }) }).then((page) => page.run(2));
    expect(hill().analysis).toMatchObject({ source: null, weight: 0 });
    expect(fake.world.stage.light.intensity).toBe(60);
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
    // Past the peak the build-up falls 0.025 a frame, so it is gone within 0.8 s.
    page.run(0.02);
    expect(fake.world.flame.scale.x).toBeCloseTo(1 + 1.2 * 0.975, 9);
    page.run(0.8);
    expect(fake.world.flame.scale.x).toBe(1);
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

  it("asks for no map under reduced motion, where none of it would run", async () => {
    const page = await startWorld({ playing: true, routing: "plain", reduced: true, map: showMap({ bass: 128 }) });
    await new Promise((settle) => setTimeout(settle, 50));
    expect(page.asked).toEqual([]);
    expect(hill().map).toBeNull();
  });
});
