import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types; this is the list three's WebGLRenderer puts a frame's draws in and sorts
import { WebGLRenderList } from "three/src/renderers/webgl/WebGLRenderLists.js";

// public/world/main.js builds the world here as a page builds it, from the world's own modules and three, and plays a song through its
// frames. Of the modules, only three's WebGLRenderer is a stand-in, since there is no WebGL here: it hands each frame's scene and
// camera to `drawn`, which lists what three draws and in what order, as WebGLRenderer does, in three's own render list.
//
// The crowd's figures stay dark under the rig's beams because three draws the beams with the solid things, before the crowd: a figure
// covers whatever light the beams added where it stands, from any camera. And the beams write no depth, so they hide no figure that
// stands behind them.

type Material = { visible: boolean; depthWrite: boolean };
type Part = {
  visible: boolean;
  renderOrder: number;
  layers: { test(layers: unknown): boolean };
  isGroup?: boolean;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  material: Material | Material[];
  geometry: { groups: { materialIndex: number }[] };
  children: Part[];
};
type Item = { object: Part; material: Material };

const world = vi.hoisted(() => ({
  // The rig and the crowd as rig.js and crowd.js built them, both running as they are, and what each frame's render does.
  rig: undefined as unknown as { mesh: Part },
  crowd: undefined as unknown as { mesh: Part },
  render: (_scene: unknown, _camera: unknown) => {},
}));

vi.mock("three", async (original) => ({
  ...(await original<object>()),
  WebGLRenderer: class {
    shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false };
    info = { render: { calls: 0, triangles: 0, frame: 0 } };
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown, camera: unknown) {
      world.render(scene, camera);
    }
  },
}));
vi.mock("../../../public/world/rig.js", async (original) => {
  const rig = await original<{ buildRig: (...args: unknown[]) => { mesh: Part } }>();
  return { ...rig, buildRig: (...args: unknown[]) => (world.rig = rig.buildRig(...args)) };
});
vi.mock("../../../public/world/crowd.js", async (original) => {
  const crowd = await original<{ buildCrowd: (...args: unknown[]) => { mesh: Part } }>();
  return { ...crowd, buildCrowd: (...args: unknown[]) => (world.crowd = crowd.buildCrowd(...args)) };
});

// What three draws of `scene` from `camera` in a frame, in order. WebGLRenderer's projectObject puts each mesh, line, point and sprite
// shown on the camera's layers in the list, with the render order of the nearest group it sits in; renderScene then draws the list's
// opaque things, its transmissive ones and its transparent ones, each as the list sorts them. Here nothing is culled and every draw
// stands at one depth, so the camera's place plays no part.
function drawn(scene: Part, camera: { layers: unknown; reversedDepth: boolean }) {
  const list = new WebGLRenderList();
  list.init();
  const project = (part: Part, groupOrder: number) => {
    if (!part.visible) return;
    if (part.layers.test(camera.layers)) {
      if (part.isGroup) groupOrder = part.renderOrder;
      else if (part.isMesh || part.isLine || part.isPoints || part.isSprite) {
        if (Array.isArray(part.material)) {
          for (const group of part.geometry.groups) {
            const material = part.material[group.materialIndex];
            if (material?.visible) list.push(part, part.geometry, material, groupOrder, 0, group);
          }
        } else if (part.material.visible) list.push(part, part.geometry, part.material, groupOrder, 0, null);
      }
    }
    for (const child of part.children) project(child, groupOrder);
  };
  project(scene, 0);
  list.finish();
  list.sort(null, null, camera.reversedDepth);
  const lists: Record<string, Item[]> = { opaque: list.opaque, transmissive: list.transmissive, transparent: list.transparent };
  return { lists, order: [...list.opaque, ...list.transmissive, ...list.transparent] as Item[] };
}

// Each frame that draws the rig's beams: the list three draws them in, whether they write depth, and the places among the frame's draws
// of the beams' last draw and the figures' first (-1 for none).
type Frame = { list: string; depthWrite: boolean; lastBeam: number; firstFigure: number };
const lit: Frame[] = [];

// The page around the world, played by stand-ins: <main>, playing the show; the world's element; a desktop's window and screen; the
// site, which serves no map; and the frames, 20 ms each.
beforeAll(async () => {
  let now = 0;
  let queued: FrameRequestCallback | null = null;
  const container = Object.assign(new EventTarget(), {
    dataset: {},
    clientWidth: 1280,
    clientHeight: 720,
    appendChild: () => {},
    getBoundingClientRect: () => ({ top: 0 }),
  });
  const main = { dataset: { state: "playing", routing: "webaudio", view: "third" } };
  const data = { showDate: "1986-07-04", identifier: "gd1986-07-04.sbd.test", tracks: [{ title: "Bertha", duration: 600 }], seed: 7 };
  const byId: Record<string, unknown> = { world: container, "world-data": { textContent: JSON.stringify(data) } };
  const media = () => ({ matches: false });
  vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
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
  vi.stubGlobal("location", { search: "" });
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
  world.render = (scene, camera) => {
    const { lists, order } = drawn(scene as Part, camera as { layers: unknown; reversedDepth: boolean });
    const places = (mesh: Part) => order.flatMap((item, at) => (item.object === mesh ? [at] : []));
    const beams = places(world.rig.mesh), figures = places(world.crowd.mesh);
    if (beams.length === 0) return;
    const beam = order[beams[0]];
    lit.push({
      list: Object.keys(lists).find((name) => lists[name].includes(beam))!,
      depthWrite: beam.material.depthWrite,
      lastBeam: Math.max(...beams),
      firstFigure: figures.length > 0 ? Math.min(...figures) : -1,
    });
  };
  // Runs `count` frames, each 20 ms long.
  const run = (count: number) => {
    for (let k = 0; k < count; k++) {
      const frame = queued;
      queued = null;
      if (!frame) throw new Error("main.js queued no frame");
      now += 20;
      frame(now);
    }
  };
  await import("../../../public/world/main.js");
  // Two seconds of the song.
  run(100);
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("main.js's frames, as three draws them", () => {
  it("draw the rig's beams in three's opaque list, with the solid things, in every frame that lights them", () => {
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.filter((f) => f.list !== "opaque").map((f) => f.list)).toEqual([]);
  });

  it("draw the crowd's figures after the rig's beams in every frame that lights them", () => {
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.filter((f) => !(f.firstFigure > f.lastBeam)).map(({ lastBeam, firstFigure }) => ({ lastBeam, firstFigure }))).toEqual([]);
  });

  it("draw the rig's beams without writing depth, so they hide no figure behind them", () => {
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.filter((f) => f.depthWrite !== false).map((f) => f.depthWrite)).toEqual([]);
  });
});
