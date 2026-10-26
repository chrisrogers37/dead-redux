import { describe, it, expect } from "vitest";
import { soundLabel } from "../sound";

describe("soundLabel", () => {
  it("reads not yet known until the world reports the active element", () => {
    expect(soundLabel("pending", "loading")).toBe("not yet known");
    expect(soundLabel("pending", "ready")).toBe("not yet known");
  });

  it("reads through the world once the element is routed", () => {
    expect(soundLabel("webaudio", "ready")).toBe("through the world");
  });

  it("reads plain stereo when the world says the element never will be routed", () => {
    expect(soundLabel("plain", "ready")).toBe("plain stereo");
  });

  it("reads plain stereo in the still, where no world loads to report", () => {
    expect(soundLabel("pending", "fallback")).toBe("plain stereo");
  });
});
