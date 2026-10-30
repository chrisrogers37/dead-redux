import { describe, expect, it } from "vitest";
import { cueClock } from "../../../public/world/clock.js";

// Three tracks, as the world reads them: only their durations matter to the clock.
const tracks = [{ duration: 300 }, { duration: 240 }, { duration: 287 }];

describe("cueClock", () => {
  it("sets the clock at the cued position of the cued track, from now", () => {
    expect(cueClock({ index: 2, position: 281 }, tracks, 1000)).toEqual({ index: 2, position: 281, duration: 287, at: 1000 });
  });

  it("keeps the track within the show", () => {
    expect(cueClock({ index: 7, position: 0 }, tracks, 0).index).toBe(2);
    expect(cueClock({ index: -1, position: 0 }, tracks, 0).index).toBe(0);
  });
});
