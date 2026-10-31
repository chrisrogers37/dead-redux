import { describe, expect, it } from "vitest";
import { CLEAR, enterColumn, hull, keepOut, outside, standClear } from "../../../public/world/collide.js";

// The reaches the world keeps a walk from each bear's centre (public/world/main.js): BEAR_REACH in first person, BODY_REACH when the
// walker is the visitor's bear.
const REACH = 2.9;
const BODY_REACH = 3.9;
// The bears' closest spacing on their line, on its tightest bend.
const CLOSEST = 5.93;

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

  it("settles a walker outside two bears whose reaches overlap", () => {
    // Twice the body reach is more than the closest spacing, so a step out of one bear's reach can land in the other's.
    const bears = [{ x: 0, z: 0 }, { x: 0, z: CLOSEST }];
    for (const start of [{ x: 0.4, z: 3.2 }, { x: -1.5, z: 2.6 }, { x: 0, z: CLOSEST / 2 }]) {
      const walker = { ...start, heading: 0 };
      keepOut(walker, bears, BODY_REACH);
      for (const bear of bears) expect(distance(walker, bear)).toBeGreaterThanOrEqual(BODY_REACH - 1e-9);
    }
  });

  it("steps a walker right between two bears out to its left", () => {
    // Heading 0 faces -z, so left is -x; where the two reaches cross on that side.
    const walker = { x: 0, z: CLOSEST / 2, heading: 0 };
    keepOut(walker, [{ x: 0, z: 0 }, { x: 0, z: CLOSEST }], BODY_REACH);
    expect(walker.x).toBeCloseTo(-Math.sqrt(BODY_REACH ** 2 - (CLOSEST / 2) ** 2), 9);
    expect(walker.z).toBeCloseTo(CLOSEST / 2, 9);
  });

  it("pushes a walker just inside either reach out to it, and leaves one at the reach where it stands", () => {
    const bear = { x: 2, z: -1 };
    for (const reach of [REACH, BODY_REACH]) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.3;
        for (const gap of [1e-3, 1e-6]) {
          const walker = { x: bear.x + (reach - gap) * Math.cos(a), z: bear.z + (reach - gap) * Math.sin(a), heading: 0 };
          keepOut(walker, [bear], reach);
          expect(distance(walker, bear)).toBeCloseTo(reach, 9);
          expect(Math.atan2(walker.z - bear.z, walker.x - bear.x)).toBeCloseTo(Math.atan2(Math.sin(a), Math.cos(a)), 9);
        }
        const walker = { x: bear.x + reach * Math.cos(a), z: bear.z + reach * Math.sin(a), heading: 0 };
        const before = { ...walker };
        keepOut(walker, [bear], reach);
        expect(walker).toEqual(before);
      }
    }
  });

  it("steps a walker on a bear's centre back against any heading", () => {
    // Heading h faces (-sin h, -cos h), so back is (sin h, cos h).
    for (const heading of [1, -2.5, Math.PI / 2]) {
      const walker = { x: -2, z: 3, heading };
      keepOut(walker, [{ x: -2, z: 3 }], BODY_REACH);
      expect(walker.x).toBeCloseTo(-2 + BODY_REACH * Math.sin(heading), 9);
      expect(walker.z).toBeCloseTo(3 + BODY_REACH * Math.cos(heading), 9);
    }
  });

  it("puts a walker inside two reaches where they cross on its side, for pairs lying any way", () => {
    const half = Math.sqrt(BODY_REACH ** 2 - (CLOSEST / 2) ** 2);
    for (const angle of [0.4, 1.3, 2.6, -2]) {
      // The pair's own frame, turned by `angle`: one bear at its origin, the other CLOSEST along it.
      const at = (x: number, z: number) => ({
        x: 5 + x * Math.cos(angle) - z * Math.sin(angle),
        z: -4 + x * Math.sin(angle) + z * Math.cos(angle),
      });
      const bears = [at(0, 0), at(0, CLOSEST)];
      for (const side of [0.5, -0.5]) {
        const walker = { ...at(side, CLOSEST / 2 + 0.3), heading: 0 };
        keepOut(walker, bears, BODY_REACH);
        const want = at(Math.sign(side) * half, CLOSEST / 2);
        expect(walker.x).toBeCloseTo(want.x, 9);
        expect(walker.z).toBeCloseTo(want.z, 9);
      }
    }
  });

  it("settles a walker whose push out of one reach lands in the next, on each side, for pairs lying any way", () => {
    // Two bears 7 m apart, as they walk; there the body reaches overlap.
    const half = Math.sqrt(BODY_REACH ** 2 - 3.5 ** 2);
    for (const angle of [0, 0.7, 2.2, -1.1]) {
      const at = (x: number, z: number) => ({
        x: -3 + x * Math.cos(angle) - z * Math.sin(angle),
        z: 6 + x * Math.sin(angle) + z * Math.cos(angle),
      });
      const bears = [at(0, 0), at(0, 7)];
      for (const side of [0.3, -0.3]) {
        // Inside the first bear's reach only; straight out of it is inside the second's.
        const walker = { ...at(side, 3), heading: 0 };
        expect(distance(walker, bears[1])).toBeGreaterThan(BODY_REACH);
        keepOut(walker, bears, BODY_REACH);
        const want = at(Math.sign(side) * half, 3.5);
        expect(walker.x).toBeCloseTo(want.x, 9);
        expect(walker.z).toBeCloseTo(want.z, 9);
        for (const bear of bears) expect(distance(walker, bear)).toBeGreaterThanOrEqual(BODY_REACH - 1e-9);
      }
    }
  });

  it("does not count a bear half a millimetre outside the reach", () => {
    // 3 m from the first bear and 3.9005 m from the second, off the line it is pushed along; the push leaves the second 4.0 m away.
    const walker = { x: 3, z: 0, heading: 0 };
    keepOut(walker, [{ x: 0, z: 0 }, { x: 3, z: BODY_REACH + 5e-4 }], BODY_REACH);
    expect(walker.x).toBeCloseTo(BODY_REACH, 9);
    expect(walker.z).toBeCloseTo(0, 9);
  });

  it("sends a walker on the line between two bears, heading across it, out on the side away from the nearer bear's partner", () => {
    // Heading 0 faces -z, across a line along x, so the walker has no left of the line to step to. It goes out along the normal
    // from the nearer bear toward the other: behind it (+z) when nearer the first, ahead (-z) when nearer the second. The choice is
    // arbitrary; pinning it makes a change to it deliberate.
    const bears = [{ x: 0, z: 0 }, { x: 3, z: 0 }];
    const half = Math.sqrt(BODY_REACH ** 2 - 1.5 ** 2);
    for (const [x, z] of [[1, half], [2, -half]]) {
      const walker = { x, z: 0, heading: 0 };
      keepOut(walker, bears, BODY_REACH);
      expect(walker.x).toBeCloseTo(1.5, 9);
      expect(walker.z).toBeCloseTo(z, 9);
    }
  });

  it("holds a walker off only the bears it is given, so one the downgrade dropped is no longer solid", () => {
    const bears = [{ x: 0, z: 0 }, { x: 0, z: 7 }, { x: 0, z: 14 }];
    // main.js drops bears from the end of the line and shortens the spots to match.
    const walker = { x: 0.5, z: 13, heading: 0 };
    keepOut(walker, bears.slice(0, 2), BODY_REACH);
    expect(walker).toEqual({ x: 0.5, z: 13, heading: 0 });
    keepOut(walker, bears, BODY_REACH);
    expect(distance(walker, bears[2])).toBeCloseTo(BODY_REACH, 9);
  });

  it("keeps a walk pressed into the gap between two bears outside both", () => {
    // Walking across the line between them, toward +x.
    const bears = [{ x: 0, z: 0 }, { x: 0, z: CLOSEST }];
    const walker = { x: -8, z: CLOSEST / 2 - 0.2, heading: Math.PI / 2 };
    for (let i = 0; i < 100; i++) {
      walker.x += 0.1;
      keepOut(walker, bears, BODY_REACH);
      for (const bear of bears) expect(distance(walker, bear)).toBeGreaterThanOrEqual(BODY_REACH - 1e-9);
    }
  });
});

describe("enterColumn", () => {
  const column = { x: 0, z: 0, r: 10, top: 8 };
  const start = { x: 15, y: 2, z: 0 };

  it("meets the side of a column ahead, below its top", () => {
    expect(enterColumn(start, { x: -1, y: 0, z: 0 }, column)).toBeCloseTo(5, 9);
    // At a slant: 15 m out, 30 degrees off the line to the centre.
    const d = { x: -Math.cos(Math.PI / 6), y: 0, z: Math.sin(Math.PI / 6) };
    const t = enterColumn(start, d, column);
    expect(Math.hypot(start.x + d.x * t, start.z + d.z * t)).toBeCloseTo(10, 9);
  });

  it("passes over a column whose top it clears", () => {
    expect(enterColumn({ x: 15, y: 9, z: 0 }, { x: -1, y: 0, z: 0 }, column)).toBe(Infinity);
    // Rising from below the top: by the side, 5 m on, it stands at 9 m, over the top.
    expect(enterColumn({ x: 15, y: 4, z: 0 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, column)).toBe(Infinity);
  });

  it("comes down through the top of a column it falls on", () => {
    // Over the side, 10 m out, the line stands at 10 m, above the top; it reaches the top 8 m out.
    expect(enterColumn({ x: 12, y: 12, z: 0 }, { x: -Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }, column)).toBeCloseTo(4 * Math.SQRT2, 9);
  });

  it("never enters a column behind it, to its side, or straight up", () => {
    expect(enterColumn(start, { x: 1, y: 0, z: 0 }, column)).toBe(Infinity);
    expect(enterColumn(start, { x: 0, y: 0, z: 1 }, column)).toBe(Infinity);
    expect(enterColumn(start, { x: 0, y: 1, z: 0 }, column)).toBe(Infinity);
    expect(enterColumn({ x: 10.01, y: 2, z: 0 }, { x: 0, y: 1, z: 0 }, column)).toBe(Infinity);
  });

  it("leaves out a column that stands around the start", () => {
    expect(enterColumn({ x: 1, y: 2, z: 0 }, { x: -1, y: 0, z: 0 }, column)).toBe(Infinity);
  });

  it("meets the side of a column from starts along the z axis and off both axes", () => {
    // From (0, 2, 15) straight at the centre: 15 m out, the side is 10 m out, so 5 m on.
    expect(enterColumn({ x: 0, y: 2, z: 15 }, { x: 0, y: 0, z: -1 }, column)).toBeCloseTo(5, 9);
    // From (-9, 2, -12), a 9-12-15 triangle, so 15 m out; toward the centre along (9, 0, 12) / 15 the side is 5 m on.
    expect(enterColumn({ x: -9, y: 2, z: -12 }, { x: 9 / 15, y: 0, z: 12 / 15 }, column)).toBeCloseTo(5, 9);
    // From (6, 2, -18) toward +z the line passes 6 m from the centre, so it enters where z² = 10² - 6², at z = -8: 10 m on.
    expect(enterColumn({ x: 6, y: 2, z: -18 }, { x: 0, y: 0, z: 1 }, column)).toBeCloseTo(10, 9);
  });

  it("meets the side of a column that stands away from the origin", () => {
    // The last two walks with the column moved to (10, 20) and the starts moved with it: the same 5 m and 10 m on.
    const moved = { x: 10, z: 20, r: 10, top: 8 };
    expect(enterColumn({ x: 1, y: 2, z: 8 }, { x: 9 / 15, y: 0, z: 12 / 15 }, moved)).toBeCloseTo(5, 9);
    expect(enterColumn({ x: 16, y: 2, z: 2 }, { x: 0, y: 0, z: 1 }, moved)).toBeCloseTo(10, 9);
  });
});

// The bears' line as path.js samples it for the landmarks, a point every quarter metre: here straight along x, at z.
const lineAt = (z: number): [number, number][] => Array.from({ length: 241 }, (_, i) => [-30 + i * 0.25, z]);

// A landmark's outline from above, in its own frame: a 2 m square.
const SQUARE: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

describe("hull", () => {
  it("keeps only the corners of points that fill a square", () => {
    const outline = hull([[0, 0], [1, 1], [-1, -1], [0.5, -1], [1, -1], [-1, 1], [1, 0.2], [-1, -1]]);
    expect(outline).toHaveLength(4);
    for (const corner of SQUARE) expect(outline).toContainEqual(corner);
  });
});

describe("outside", () => {
  it("measures how far a point stands outside a square, or how deep inside it", () => {
    const square = hull(SQUARE);
    expect(outside(square, 3, 0)).toBeCloseTo(2, 9);
    expect(outside(square, 2, 2)).toBeCloseTo(Math.SQRT2, 9);
    expect(outside(square, 0, 0)).toBeCloseTo(-1, 9);
    expect(outside(square, 0.5, -0.2)).toBeCloseTo(-0.5, 9);
  });
});

describe("standClear", () => {
  it("leaves a landmark the line passes clear of at its song's point, at CLEAR from it too", () => {
    expect(standClear(0, 0, 0, hull(SQUARE), lineAt(5))).toEqual({ x: 0, z: 0 });
    expect(standClear(0, 0, 0, hull(SQUARE), lineAt(1 + CLEAR))).toEqual({ x: 0, z: 0 });
  });

  it("steps a landmark the line passes too near straight back from it, to CLEAR and no further", () => {
    // The square's side is 1 m from the line, so it steps back 0.75 m.
    const at = standClear(0, 0, 0, hull(SQUARE), lineAt(2));
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(2 - 1 - CLEAR, 9);
  });

  it("takes the roomiest spot on the nearest ring that has room", () => {
    // With the line 2.1 m off, five spots 0.75 m away have room, and straight back has the most.
    const at = standClear(0, 0, 0, hull(SQUARE), lineAt(2.1));
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(-0.75, 9);
  });

  it("turns the outline as the landmark is turned", () => {
    // An arm 5 m out to the landmark's left (+x), as a rail is. Unturned it lies along a line 4 m off; turned a quarter it points to -z,
    // across the line, so the landmark steps the other way until the arm's tip is CLEAR from it.
    const arm = hull([[0, -0.15], [5, -0.15], [5, 0.15], [0, 0.15]]);
    expect(standClear(0, 0, 0, arm, lineAt(-4))).toEqual({ x: 0, z: 0 });
    const at = standClear(0, 0, Math.PI / 2, arm, lineAt(-4));
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(5 - 4 + CLEAR, 9);
  });

  it("finds the room between two lines", () => {
    // Lines 4 m either side, the square 2.5 m toward one: it needs CLEAR from both, which it has 1.25 m from the middle.
    const at = standClear(0, 2.5, 0, hull(SQUARE), [...lineAt(4), ...lineAt(-4)]);
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(4 - 1 - CLEAR, 9);
  });

  it("steps past the nearer of two lines that leave no room between them", () => {
    // Lines at 4 and -1 leave 5 m, and the square needs 1 + CLEAR from each.
    const at = standClear(0, 2.5, 0, hull(SQUARE), [...lineAt(4), ...lineAt(-1)]);
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.z).toBeCloseTo(4 + 1 + CLEAR, 9);
  });

  it("leaves a landmark at its point when no spot within reach has room", () => {
    // Lines 2 m either side leave none, and past them is 4.75 m away.
    expect(standClear(0, 0, 0, hull(SQUARE), [...lineAt(2), ...lineAt(-2)], 4)).toEqual({ x: 0, z: 0 });
  });
});
