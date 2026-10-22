import { describe, expect, it } from "vitest";
import { keepOut } from "../../../public/world/collide.js";

// The reach the world keeps a walk from each bear's centre (BEAR_REACH in public/world/main.js).
const REACH = 2.9;

type Spot = { x: number; z: number };
const distance = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z);

describe("keepOut", () => {
  it("ends a step into a bear at the reach, on the line from the bear", () => {
    const walker = { x: 4, z: 6, heading: 0 };
    keepOut(walker, [{ x: 4, z: 5 }], REACH);
    expect(walker.x).toBeCloseTo(4, 9);
    expect(walker.z).toBeCloseTo(5 + REACH, 9);
  });

  it("ends a step into a bear at the reach from every side", () => {
    const bear = { x: -3, z: 2 };
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const walker = { x: bear.x + Math.cos(a), z: bear.z + Math.sin(a), heading: 0 };
      keepOut(walker, [bear], REACH);
      expect((walker.x - bear.x) / REACH).toBeCloseTo(Math.cos(a), 9);
      expect((walker.z - bear.z) / REACH).toBeCloseTo(Math.sin(a), 9);
    }
  });

  it("leaves a walker at or beyond the reach where it stands", () => {
    const walker = { x: REACH, z: 0, heading: 1 };
    keepOut(walker, [{ x: 0, z: 0 }, { x: 10, z: 10 }], REACH);
    expect(walker).toEqual({ x: REACH, z: 0, heading: 1 });
  });

  it("steps a walker on a bear's centre back against its heading", () => {
    // Heading 0 faces -z, so back is +z.
    const walker = { x: 1, z: 1, heading: 0 };
    keepOut(walker, [{ x: 1, z: 1 }], REACH);
    expect(walker.x).toBeCloseTo(1, 9);
    expect(walker.z).toBeCloseTo(1 + REACH, 9);
  });

  it("slides a held walk past a bear instead of through it", () => {
    // Walking toward -z, half a metre off the bear's centre line.
    const bear = { x: 0, z: 0 };
    const walker = { x: 0.5, z: 10, heading: 0 };
    for (let i = 0; i < 250; i++) {
      walker.z -= 0.1;
      keepOut(walker, [bear], REACH);
      expect(distance(walker, bear)).toBeGreaterThanOrEqual(REACH - 1e-9);
    }
    expect(walker.z).toBeLessThan(-REACH);
  });

  it("slides a held walk along a column of bears", () => {
    // Three bears 7 m apart, walked into from behind and a little to one side.
    const bears = [{ x: 0, z: 0 }, { x: 0, z: 7 }, { x: 0, z: 14 }];
    const walker = { x: 0.3, z: 30, heading: 0 };
    for (let i = 0; i < 500; i++) {
      walker.z -= 0.1;
      keepOut(walker, bears, REACH);
      for (const bear of bears) expect(distance(walker, bear)).toBeGreaterThanOrEqual(REACH - 1e-9);
    }
    expect(walker.z).toBeLessThan(-REACH);
  });
});
