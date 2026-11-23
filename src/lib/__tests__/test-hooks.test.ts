import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { idleMs } from "../../components/world/ride";
import { forcedLookup, testHooksEnabled } from "../test-hooks";

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

describe("?idle=", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers only on a preview: the server's switch is what the page is handed, and elsewhere a ride waits its own ten seconds whatever the query says", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(idleMs(testHooksEnabled(), "?idle=2")).toBe(2000);
    for (const elsewhere of ["production", "development", ""]) {
      vi.stubEnv("VERCEL_ENV", elsewhere);
      expect(idleMs(testHooksEnabled(), "?idle=2"), elsewhere).toBe(10_000);
    }
  });

  it("is read by the page from the switch the server hands it, never from the environment: neither the ride nor the page around it names a variable", () => {
    for (const file of ["../../components/world/ride.ts", "../../components/world/WorldHome.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/process\.env|NEXT_PUBLIC_/);
    }
    // The page hands the ride the server's word and its own query, and nothing else decides it.
    expect(readFileSync(new URL("../../components/world/WorldHome.tsx", import.meta.url), "utf8")).toContain("idleMs(testHooks, search)");
  });
});
