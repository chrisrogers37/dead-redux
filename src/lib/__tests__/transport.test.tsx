import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Transport } from "../../components/player/Transport";

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
});
