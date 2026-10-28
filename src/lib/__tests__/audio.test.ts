import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listenerAt, verdict } from "../../../public/world/audio.js";

/* Every combination of the four inputs. */
const ALL = [false, true].flatMap((routes) =>
  [false, true].flatMap((cors) => [false, true].flatMap((running) => [false, true].map((metadata) => ({ routes, cors, running, metadata })))),
);

describe("verdict", () => {
  it("never routes an element without crossOrigin, whatever else holds", () => {
    for (const c of ALL.filter((c) => !c.cors)) expect(verdict(c)).toBe("plain");
  });

  it("never routes on a device that plays plain stereo", () => {
    for (const c of ALL.filter((c) => !c.routes)) expect(verdict(c)).toBe("plain");
  });

  it("routes only once both have happened: the context runs and the element's metadata has loaded", () => {
    const ready = { routes: true, cors: true };
    expect(verdict({ ...ready, running: false, metadata: false })).toBe("wait");
    expect(verdict({ ...ready, running: true, metadata: false })).toBe("wait");
    expect(verdict({ ...ready, running: false, metadata: true })).toBe("wait");
    expect(verdict({ ...ready, running: true, metadata: true })).toBe("route");
  });
});

describe("listenerAt", () => {
  /* The visitor's bear's head and the camera, apart, as the world passes them. */
  const head = { x: 39.2, y: 13.6, z: 24.2 };
  const camera = { position: { x: 52, y: 22.5, z: 31 } };

  it("stands at the visitor's bear's head in third person: the very point the bear moves, so it goes where the bear goes", () => {
    expect(listenerAt(true, head, camera)).toBe(head);
  });

  it("stands at the camera in first person", () => {
    expect(listenerAt(false, head, camera)).toBe(camera.position);
  });
});

/* The Web Audio graph and the page that startSound and listen touch, played by stand-ins: node has neither. audio.js keeps its context
   and slots in module state, so each test loads it afresh. */
class FakeNode {
  connect<T>(next: T): T {
    return next;
  }
}

const param = () => ({ value: 0 });

class FakeContext {
  state = "suspended";
  destination = new FakeNode();
  listener = {
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    forwardX: param(),
    forwardY: param(),
    forwardZ: param(),
    upX: param(),
    upY: param(),
    upZ: param(),
  };

  constructor() {
    made.push(this);
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  addEventListener() {}

  createMediaElementSource() {
    return new FakeNode();
  }
}

/* Every context the page has made, in order. */
let made: FakeContext[];

/* The player's two audio elements, as the page mounts them before the world loads: with crossOrigin, and no metadata yet. */
const element = (id: string) => ({ id, crossOrigin: "anonymous", readyState: 0, addEventListener() {} });

/* The <main> the page marks once the visitor has joined. */
let main: { dataset: { joined?: string } };

function stubPage() {
  made = [];
  main = { dataset: {} };
  const elements = new Map(["show-audio-a", "show-audio-b"].map((id) => [id, element(id)] as const));
  const listeners = new Map<string, Array<(e: Event) => void>>();
  vi.stubGlobal("window", { AudioContext: FakeContext, addEventListener() {} });
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("AnalyserNode", FakeNode);
  vi.stubGlobal("PannerNode", FakeNode);
  vi.stubGlobal("GainNode", FakeNode);
  vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA: 1 });
  vi.stubGlobal("document", {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelector: (selector: string) => (selector === "main" ? main : null),
    addEventListener: (type: string, fn: (e: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    dispatchEvent: (e: Event) => {
      for (const fn of listeners.get(e.type) ?? []) fn(e);
      return true;
    },
  });
}

const load = () => {
  vi.resetModules();
  return import("../../../public/world/audio.js");
};

/* Where the stage's sound stands and which way it faces. */
const stage = { x: 24, y: 6, z: -30, facing: [0, 0, 1] };

describe("startSound", () => {
  beforeEach(stubPage);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes the context and resumes it at once when the visitor joined before the world loaded", async () => {
    main.dataset.joined = "true";
    const audio = await load();
    audio.startSound(stage, false);
    expect(made).toHaveLength(1);
    expect(made[0].state).toBe("running");
  });

  it("makes no context until the show starts, then makes exactly one", async () => {
    const audio = await load();
    audio.startSound(stage, false);
    expect(made).toHaveLength(0);
    document.dispatchEvent(new Event("player:start"));
    expect(made).toHaveLength(1);
    expect(made[0].state).toBe("running");
    document.dispatchEvent(new Event("player:start"));
    expect(made).toHaveLength(1);
  });
});

describe("listen", () => {
  beforeEach(stubPage);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* The visitor's bear's head and the camera, apart in every coordinate. The camera is turned off every axis: its world matrix
     (column-major) has right (1, 2, 2) / 3, up (2, 1, -2) / 3 and back (-2, 2, -1) / 3, so it looks along (2, -2, 1) / 3. */
  const head = { x: 39.2, y: 13.6, z: 24.2 };
  const camera = {
    position: { x: 52, y: 22.5, z: 31 },
    matrixWorld: { elements: [1 / 3, 2 / 3, 2 / 3, 0, 2 / 3, 1 / 3, -2 / 3, 0, -2 / 3, 2 / 3, -1 / 3, 0, 52, 22.5, 31, 1] },
  };
  const looks = { forward: [2 / 3, -2 / 3, 1 / 3], up: [2 / 3, 1 / 3, -2 / 3] };

  /* Where a context's listener stands, which way it faces and which way is up. */
  const heard = ({ listener: l }: FakeContext) => ({
    position: [l.positionX.value, l.positionY.value, l.positionZ.value],
    forward: [l.forwardX.value, l.forwardY.value, l.forwardZ.value],
    up: [l.upX.value, l.upY.value, l.upZ.value],
  });

  /* The module and the context the first move makes. */
  async function started() {
    const audio = await load();
    audio.startSound(stage, false);
    document.dispatchEvent(new Event("player:start"));
    return { audio, context: made[0] };
  }

  it("stands the listener at the bear's head in third person, facing where the camera looks", async () => {
    const { audio, context } = await started();
    audio.listen(true, head, camera);
    expect(heard(context)).toEqual({ position: [head.x, head.y, head.z], ...looks });
  });

  it("stands the listener at the camera in first person, facing where the camera looks", async () => {
    const { audio, context } = await started();
    audio.listen(false, head, camera);
    expect(heard(context)).toEqual({ position: [camera.position.x, camera.position.y, camera.position.z], ...looks });
  });

  it("does nothing before the context exists", async () => {
    const audio = await load();
    expect(() => audio.listen(true, head, camera)).not.toThrow();
    expect(made).toHaveLength(0);
  });
});
