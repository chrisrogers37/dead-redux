import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoRecording } from "../../components/world/NoRecording";

describe("NoRecording", () => {
  const relisten = "https://relisten.net/grateful-dead/1986/07/04";

  it("tells a failed look-up from a missing recording", () => {
    const failed = renderToStaticMarkup(<NoRecording failed relisten={relisten} />);
    expect(failed).toContain("Can’t load the recording right now.");
    expect(failed).toContain(">Try again<");
    expect(failed).toContain(`href="${relisten}"`);
    expect(failed).not.toContain("No recording for this show.");

    const missing = renderToStaticMarkup(<NoRecording failed={false} relisten={relisten} />);
    expect(missing).toContain("No recording for this show.");
    expect(missing).toContain(`href="${relisten}"`);
    expect(missing).not.toContain("Try again");
  });
});
