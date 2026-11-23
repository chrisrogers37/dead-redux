import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusWorldOnRelease, Transport } from "../../components/player/Transport";

describe("Transport", () => {
  const archiveUrl = "https://archive.org/details/gd1986-07-04";
  const props = {
    settled: false,
    title: "Touch of Grey",
    index: 0,
    count: 19,
    set: "Set 1",
    position: 0,
    duration: 360,
    status: null,
    archiveUrl,
    playing: false,
    onPrevious: () => {},
    onPlay: () => {},
    onNext: () => {},
    onSeek: () => {},
    onRetry: () => {},
    detailsOpen: false,
    onDetails: () => {},
  };

  it("offers Try again beside the archive.org link once a track could not play", () => {
    const failed = renderToStaticMarkup(<Transport {...props} failed />);
    expect(failed).toContain("Could not play this track.");
    expect(failed).toContain('data-action="retry"');
    expect(failed).toContain(">Try again<");
    expect(failed).toContain(`href="${archiveUrl}"`);

    const playing = renderToStaticMarkup(<Transport {...props} failed={false} />);
    expect(playing).not.toContain("Could not play this track.");
    expect(playing).not.toContain("Try again");
  });

  it("writes no style attribute at the start, where the stylesheet fills the seek bar to 0%, and the position once it moves", () => {
    expect(renderToStaticMarkup(<Transport {...props} failed={false} />)).not.toContain("style=");
    expect(renderToStaticMarkup(<Transport {...props} position={90} failed={false} />)).toContain('style="--p:25%"');
  });
});

describe("focusWorldOnRelease", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SLIDER = { name: "the seek slider" }, BODY = { name: "the page's body" }, DETAILS = { name: "the Details button" };
  // The window, which takes the pointer's lift, and the page with its world: focusable (tabIndex 0), or the still's (-1), or none.
  // `focused` is what holds focus when the pointer lifts: the slider the press focused, unless a test moves it.
  function page(tabIndex: number | null) {
    const world = { tabIndex: tabIndex ?? -1, focus: vi.fn() };
    const win = new EventTarget();
    const doc = { getElementById: (id: string) => (id === "world" && tabIndex !== null ? world : null), activeElement: SLIDER as object | null, body: BODY };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    const lift = (type = "pointerup", pointerId = 1) => win.dispatchEvent(Object.assign(new Event(type), { pointerId }));
    return { world, doc, lift };
  }
  const press = (pointerType = "mouse", pointerId = 1) => focusWorldOnRelease({ pointerId, pointerType, currentTarget: SLIDER });

  const props = { title: "Bertha", index: 0, count: 1, set: null, position: 0, duration: 60, status: null, archiveUrl: "", playing: false, failed: false,
    onPrevious: () => {}, onPlay: () => {}, onNext: () => {}, onSeek: () => {}, onRetry: () => {}, detailsOpen: false, onDetails: () => {} };
  // The seek slider among what Transport renders.
  function slider(node: unknown): { props: Record<string, unknown> } | null {
    if (Array.isArray(node)) return node.map(slider).find(Boolean) ?? null;
    if (!node || typeof node !== "object" || !("props" in node)) return null;
    const element = node as { type: unknown; props: Record<string, unknown> };
    return element.type === "input" && element.props["data-action"] === "seek" ? element : slider(element.props.children);
  }

  it("is what a press on the seek slider calls, wired by React and not written into the markup; in a settled ride the slider keeps its focus", () => {
    expect(slider(Transport({ ...props, settled: false }))!.props.onPointerDown).toBe(focusWorldOnRelease);
    expect(slider(Transport({ ...props, settled: true }))!.props.onPointerDown).toBeUndefined();
    expect(renderToStaticMarkup(<Transport {...props} settled={false} />)).not.toMatch(/onpointerdown/i);
  });

  it("keeps the slider the same element as a ride settles and wakes: in both looks it is the second of two children, after a part with a key of its own, so React moves no focus and drops no press", () => {
    // What Transport hands React in each look: a fragment's children, by their kind and key.
    const parts = (settled: boolean) => {
      const children = (Transport({ ...props, settled }) as { props: { children: { type: unknown; key: string | null }[] } }).props.children;
      return children.map((child) => ({ input: child.type === "input", key: child.key }));
    };
    expect(parts(false)).toEqual([{ input: false, key: "awake" }, { input: true, key: null }]);
    expect(parts(true)).toEqual([{ input: false, key: "settled" }, { input: true, key: null }]);
    // And each look still shows what it showed: the controls only while awake, the large title only once settled.
    const awake = renderToStaticMarkup(<Transport {...props} settled={false} />), settled = renderToStaticMarkup(<Transport {...props} settled />);
    expect(awake).toContain('data-action="play"');
    expect(settled).not.toContain('data-action="play"');
    expect(settled).toContain("text-[40px]");
    expect(awake).not.toContain("text-[40px]");
    for (const look of [awake, settled]) expect(look.split('data-action="seek"')).toHaveLength(2);
  });

  it("opens Details as the player says, and tells the player when the visitor opens or shuts it, so a ride that settles and wakes brings it back as it was", () => {
    expect(renderToStaticMarkup(<Transport {...props} settled={false} />)).toContain('<details class="ml-2">');
    expect(renderToStaticMarkup(<Transport {...props} settled={false} detailsOpen />)).toContain('<details class="ml-2" open="">');
    // The element among what Transport renders, and what its toggle tells the player.
    const find = (node: unknown): { props: Record<string, unknown> } | null => {
      if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
      if (!node || typeof node !== "object" || !("props" in node)) return null;
      const element = node as { type: unknown; props: Record<string, unknown> };
      return element.type === "details" ? element : find(element.props.children);
    };
    const told: boolean[] = [];
    const details = find(Transport({ ...props, settled: false, onDetails: (open) => told.push(open) }))!;
    const toggle = details.props.onToggle as (e: { currentTarget: { open: boolean } }) => void;
    toggle({ currentTarget: { open: true } });
    toggle({ currentTarget: { open: false } });
    expect(told).toEqual([true, false]);
  });

  it("gives the world focus once the pointer that pressed the slider lifts, without scrolling to it, and not before", () => {
    const { world, lift } = page(0);
    press();
    expect(world.focus).not.toHaveBeenCalled();
    lift();
    expect(world.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("does so for a cancelled pointer too, for a pen, and where the press left focus on the page, and only once for each press", () => {
    const { world, doc, lift } = page(0);
    press("pen");
    doc.activeElement = BODY;
    lift("pointercancel");
    lift();
    lift("pointercancel");
    expect(world.focus).toHaveBeenCalledTimes(1);
  });

  it("waits for its own pointer: another finger's lift moves nothing", () => {
    const { world, lift } = page(0);
    press("mouse", 1);
    lift("pointerup", 7);
    expect(world.focus).not.toHaveBeenCalled();
    lift("pointerup", 1);
    expect(world.focus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus on a control the visitor has gone on to, as after a press whose lift never came", () => {
    const { world, doc, lift } = page(0);
    press();
    doc.activeElement = DETAILS;
    lift();
    expect(world.focus).not.toHaveBeenCalled();
    // That lift ended the press: a later one finds nothing waiting.
    doc.activeElement = SLIDER;
    lift();
    expect(world.focus).not.toHaveBeenCalled();
  });

  it("answers a mouse and a pen alone: a touch, which walks by the stick, a press that names no pointer and one of a kind it does not know keep their place on the slider", () => {
    for (const kind of ["touch", "", "kinect"]) {
      const { world, lift } = page(0);
      press(kind);
      lift();
      expect(world.focus).not.toHaveBeenCalled();
    }
  });

  it("leaves focus where it is over the still, which is not focusable, and on a page without a world", () => {
    const still = page(-1);
    press();
    still.lift();
    expect(still.world.focus).not.toHaveBeenCalled();
    const none = page(null);
    press();
    expect(() => none.lift()).not.toThrow();
  });
});
