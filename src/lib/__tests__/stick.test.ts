import { afterEach, describe, expect, it, vi } from "vitest";
import { bindInput, DEAD, REACH, stickAxes } from "../../../public/world/input.js";

describe("stickAxes", () => {
  it("walks forward up the screen and back down it, and turns left to the left and right to the right, as main.js reads the keys", () => {
    expect(stickAxes(0, -REACH)).toEqual({ walk: 1, turn: 0 });
    expect(stickAxes(0, REACH)).toEqual({ walk: -1, turn: 0 });
    expect(stickAxes(-REACH, 0)).toEqual({ walk: 0, turn: 1 });
    expect(stickAxes(REACH, 0)).toEqual({ walk: 0, turn: -1 });
  });

  it("does nothing until a push passes the dead zone along its line", () => {
    expect(stickAxes(0, 0)).toEqual({ walk: 0, turn: 0 });
    expect(stickAxes(REACH * DEAD, -REACH * DEAD)).toEqual({ walk: 0, turn: 0 });
    expect(stickAxes(0, -REACH * (DEAD + 0.01)).walk).toBeGreaterThan(0);
  });

  it("counts each line alone: a push up that strays to the side inside the dead zone only walks, and a diagonal walks and turns", () => {
    expect(stickAxes(REACH * (DEAD - 0.01), -REACH)).toEqual({ walk: 1, turn: 0 });
    expect(stickAxes(-REACH, -REACH)).toEqual({ walk: 1, turn: 1 });
  });

  it("counts a push to the reach or past it, on the stick or off it, as a full one", () => {
    expect(stickAxes(0, -3 * REACH)).toEqual({ walk: 1, turn: 0 });
    expect(stickAxes(5 * REACH, 2 * REACH)).toEqual({ walk: -1, turn: -1 });
  });

  it("eases in: a push halfway from the dead zone to the reach walks or turns at a quarter of full", () => {
    const half = REACH * (DEAD + (1 - DEAD) / 2);
    expect(stickAxes(0, -half).walk).toBeCloseTo(0.25, 12);
    expect(stickAxes(half, 0).turn).toBeCloseTo(-0.25, 12);
  });
});

// The page bindInput binds the controls on (public/world/input.js), played by stand-ins, since node has no DOM: the window, the world's
// container and the stick take listeners, and the document answers bindInput's queries, <main> (none here) and the stick, whose
// centre is at (100, 700). `on` sends a pointer event to one of them, from the pointer `id`, at (x, y).
function bindPage() {
  const container = new EventTarget();
  const stickEl = Object.assign(new EventTarget(), {
    dataset: {},
    style: { setProperty: () => {} },
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 44, top: 644, width: 112, height: 112 }),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { querySelector: (selector: string) => (selector === "[data-stick]" ? stickEl : null) }),
  );
  const walker = { heading: 0, pitch: 0 };
  const { stick } = bindInput(container, walker, () => {});
  const on = (target: EventTarget, type: string, id: number, x: number, y: number) =>
    target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: id, clientX: x, clientY: y }));
  return { container, stickEl, walker, stick, on };
}

describe("bindInput's pointers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns the view only with the pointer that started the drag: a thumb on the stick never does, and its lift ends no drag", () => {
    const { container, stickEl, walker, stick, on } = bindPage();
    // The thumb holds the stick forward; a second finger drags the world 100 px to the left.
    on(stickEl, "pointerdown", 1, 100, 700 - REACH);
    on(container, "pointerdown", 2, 300, 300);
    on(window, "pointermove", 2, 200, 300);
    expect(walker.heading).toBeCloseTo(0.5, 12);
    // The thumb slides across the stick and lifts; the stick stops, and the view stays where the finger turned it.
    on(window, "pointermove", 1, 20, 700 - REACH);
    on(window, "pointerup", 1, 20, 700 - REACH);
    expect(walker.heading).toBeCloseTo(0.5, 12);
    on(stickEl, "pointerup", 1, 20, 700 - REACH);
    expect(stick).toEqual({ walk: 0, turn: 0 });
    // The finger drags on, 100 px further.
    on(window, "pointermove", 2, 100, 300);
    expect(walker.heading).toBeCloseTo(1, 12);
  });

  it("takes the pressing pointer's capture, so a thumb that slides off the stick keeps steering", () => {
    const { stickEl, on } = bindPage();
    // A browser sends a captured pointer's events to the stick wherever it goes. The stand-ins don't, so this reads the request.
    const capture = vi.spyOn(stickEl, "setPointerCapture");
    on(stickEl, "pointerdown", 7, 100, 700 - REACH);
    expect(capture.mock.calls).toEqual([[7]]);
  });

  it("stops on a cancelled touch: after a push, pointercancel and the lostpointercapture that follows leave the stick at rest", () => {
    const { stickEl, stick, on } = bindPage();
    on(stickEl, "pointerdown", 7, 100 - REACH, 700 - REACH);
    expect(stick).toEqual({ walk: 1, turn: 1 });
    // A browser follows a pointercancel with lostpointercapture for the pointer the stick holds, and either one lifts the stick.
    on(stickEl, "pointercancel", 7, 100 - REACH, 700 - REACH);
    on(stickEl, "lostpointercapture", 7, 100 - REACH, 700 - REACH);
    expect(stick).toEqual({ walk: 0, turn: 0 });
  });
});
