import { describe, it, expect } from "vitest";
import { corsAfterError, stateAfterError } from "../fallback";

describe("corsAfterError", () => {
  it("re-mounts only the idle element when its preload fails the CORS check", () => {
    expect(corsAfterError([true, true], 1, false)).toEqual([true, false]);
  });

  it("re-mounts only the playing element when its own load fails before metadata", () => {
    expect(corsAfterError([true, true], 0, false)).toEqual([false, true]);
  });

  it("keeps the other element's state as it is", () => {
    expect(corsAfterError([false, true], 1, false)).toEqual([false, false]);
  });

  it("composes two failures that land before the next render", () => {
    expect(corsAfterError(corsAfterError([true, true], 1, false) ?? [true, true], 0, false)).toEqual([false, false]);
  });

  it("changes nothing for an error after metadata", () => {
    expect(corsAfterError([true, true], 0, true)).toBe(null);
  });

  it("changes nothing for an element already without crossOrigin", () => {
    expect(corsAfterError([true, false], 1, false)).toBe(null);
  });
});

describe("stateAfterError", () => {
  it("leaves the player idle before the join, whatever the count: the show has not started", () => {
    expect(stateAfterError(false, 0, 3)).toBe("idle");
    expect(stateAfterError(false, 3, 3)).toBe("idle");
  });

  it("shows Reconnecting while a reload is due after the join", () => {
    expect(stateAfterError(true, 0, 3)).toBe("stalled");
    expect(stateAfterError(true, 2, 3)).toBe("stalled");
  });

  it("says the track could not play once the retries are spent", () => {
    expect(stateAfterError(true, 3, 3)).toBe("error");
  });
});
