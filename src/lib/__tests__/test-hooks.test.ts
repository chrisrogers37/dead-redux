import { afterEach, describe, expect, it, vi } from "vitest";
import { forcedLookup } from "../test-hooks";

describe("forcedLookup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers only on a preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(forcedLookup("failed")).toEqual({ kind: "failed", reason: "forced by ?lookup=failed" });
    expect(forcedLookup("missing")).toEqual({ kind: "missing" });
    // Any other value, and a repeated parameter, leave the show to be looked up.
    for (const other of ["slow", undefined, ["failed"]]) expect(forcedLookup(other)).toBe(null);
    vi.stubEnv("VERCEL_ENV", "production");
    for (const value of ["failed", "missing"]) expect(forcedLookup(value)).toBe(null);
  });
});
