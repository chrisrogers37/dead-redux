import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusWorldOnRelease, Transport } from "../../components/player/Transport";

describe("Transport", () => {
  const archiveUrl = "https://archive.org/details/gd1986-07-04";
  const props = {
    leanback: false,
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

  // The window, which takes the pointer's lift, and the page with its world: focusable (tabIndex 0), or the still's (-1), or none.
  function page(tabIndex: number | null) {
    const world = { tabIndex: tabIndex ?? -1, focus: vi.fn() };
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "world" && tabIndex !== null ? world : null) });
    return { world, lift: (type = "pointerup") => win.dispatchEvent(new Event(type)) };
  }

  it("renders the seek slider with nothing a first paint would refuse: the press is wired by React, not written into the markup", () => {
    const props = { leanback: false, title: "Bertha", index: 0, count: 1, set: null, position: 0, duration: 60, status: null, archiveUrl: "", playing: false,
      onPrevious: () => {}, onPlay: () => {}, onNext: () => {}, onSeek: () => {}, onRetry: () => {} };
    expect(renderToStaticMarkup(<Transport {...props} failed={false} />)).toContain('data-action="seek"');
  });

  it("gives the world focus once the pointer that pressed the slider lifts, without scrolling to it, and not before", () => {
    const { world, lift } = page(0);
    focusWorldOnRelease();
    expect(world.focus).not.toHaveBeenCalled();
    lift();
    expect(world.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("does so for a cancelled pointer too, and only once for each press", () => {
    const { world, lift } = page(0);
    focusWorldOnRelease();
    lift("pointercancel");
    lift();
    lift("pointercancel");
    expect(world.focus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus where it is over the still, which is not focusable, and on a page without a world", () => {
    const still = page(-1);
    focusWorldOnRelease();
    still.lift();
    expect(still.world.focus).not.toHaveBeenCalled();
    const none = page(null);
    focusWorldOnRelease();
    expect(() => none.lift()).not.toThrow();
  });
});
