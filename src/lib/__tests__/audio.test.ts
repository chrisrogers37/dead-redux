import { describe, it, expect } from "vitest";
import { verdict } from "../../../public/world/audio.js";

/* Every combination of the four inputs. */
const ALL = [false, true].flatMap((routes) =>
  [false, true].flatMap((cors) => [false, true].flatMap((running) => [false, true].map((metadata) => ({ routes, cors, running, metadata })))),
);

describe("verdict", () => {
  it("never routes an element without crossOrigin, whatever else holds", () => {
    for (const c of ALL.filter((c) => !c.cors)) expect(verdict(c)).toBe("plain");
  });

  it("never routes on a device that plays plain stereo", () => {
    for (const c of ALL.filter((c) => !c.routes)) expect(verdict(c)).toBe("plain");
  });

  it("routes only once both have happened: the context runs and the element's metadata has loaded", () => {
    const ready = { routes: true, cors: true };
    expect(verdict({ ...ready, running: false, metadata: false })).toBe("wait");
    expect(verdict({ ...ready, running: true, metadata: false })).toBe("wait");
    expect(verdict({ ...ready, running: false, metadata: true })).toBe("wait");
    expect(verdict({ ...ready, running: true, metadata: true })).toBe("route");
  });
});
