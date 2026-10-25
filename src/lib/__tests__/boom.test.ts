import { describe, expect, it } from "vitest";
import { nearest, rise } from "../../../public/world/boom.js";

// The boom as the walk camera hangs it (public/world/avatar.js): 11 m behind the head on a desktop, 0.35 rad above it.
const LEN = 11;
const EL = 0.35;
// The head, 3.6 m above level ground.
const HEAD = { x: 0, y: 3.6, z: 0 };

type V = { x: number; y: number; z: number };
type Box = { min: V; max: V };
type Column = { x: number; z: number; r: number; top: number };

// The unit direction from the head toward the camera, along `bearing` (rad, from +x toward +z) at elevation `el`.
const line = (bearing: number, el = EL): V => ({
  x: Math.cos(bearing) * Math.cos(el),
  y: Math.sin(el),
  z: Math.sin(bearing) * Math.cos(el),
});
// A landmark standing on the ground, `height` tall and 1.6 m square, its centre `centre` metres from the head along `bearing`.
const landmark = (bearing: number, centre: number, height: number): Box => {
  const cx = Math.cos(bearing) * centre, cz = Math.sin(bearing) * centre;
  return { min: { x: cx - 0.8, y: 0, z: cz - 0.8 }, max: { x: cx + 0.8, y: height, z: cz + 0.8 } };
};
const inside = (p: V, b: Box) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
// A column `r` round from the ground up to `top`, its side `side` metres from the head along `bearing`.
const column = (bearing: number, side: number, r: number, top: number): Column => ({
  x: Math.cos(bearing) * (side + r),
  z: Math.sin(bearing) * (side + r),
  r,
  top,
});
const inColumn = (p: V, c: Column) => Math.hypot(p.x - c.x, p.z - c.z) <= c.r && p.y >= 0 && p.y <= c.top;
const elevation = (d: V) => Math.atan2(d.y, Math.hypot(d.x, d.z));

describe("rise", () => {
  it("raises the camera clear of a landmark that starts within 3 m of the head, never into it, at every heading", () => {
    for (let k = 0; k < 16; k++) {
      const bearing = (k * Math.PI) / 8;
      for (const centre of [1.3, 2, 2.6]) {
        for (const height of [4.5, 12]) {
          const box = landmark(bearing, centre, height);
          const dir = line(bearing);
          // The boom at its own elevation runs into it within 3 m.
          expect(nearest(HEAD, dir, [box], [])).toBeLessThan(3);
          const { lift, room } = rise(HEAD, dir, LEN, [box], [], 0, 1);
          const reach = LEN * room;
          const camera = { x: HEAD.x + dir.x * reach, y: HEAD.y + dir.y * reach, z: HEAD.z + dir.z * reach };
          expect(lift).toBeGreaterThan(0);
          expect(inside(camera, box)).toBe(false);
          // The camera keeps 0.5 m short of where the line from the head meets the landmark, if it meets it at all.
          expect(nearest(HEAD, dir, [box], [])).toBeGreaterThanOrEqual(reach + 0.5 - 1e-9);
          // A short landmark the boom passes over; a tall one it meets high enough up its face to come in front of it.
          if (height === 4.5) expect(camera.y).toBeGreaterThan(box.max.y);
        }
      }
    }
  });

  it("raises the camera clear of a column that starts within 3 m of the head, never into it, at every heading", () => {
    // As wide as the stage's column, and narrower.
    for (let k = 0; k < 8; k++) {
      const bearing = (k * Math.PI) / 4 + 0.2;
      for (const side of [1.3, 2, 2.6]) {
        for (const r of [3, 10.95]) {
          for (const top of [5, 12]) {
            const col = column(bearing, side, r, top);
            const dir = line(bearing);
            expect(nearest(HEAD, dir, [], [col])).toBeLessThan(3);
            const { lift, room } = rise(HEAD, dir, LEN, [], [col], 0, 1);
            const reach = LEN * room;
            const camera = { x: HEAD.x + dir.x * reach, y: HEAD.y + dir.y * reach, z: HEAD.z + dir.z * reach };
            expect(lift).toBeGreaterThan(0);
            expect(inColumn(camera, col)).toBe(false);
            expect(nearest(HEAD, dir, [], [col])).toBeGreaterThanOrEqual(reach + 0.5 - 1e-9);
            if (top === 5) expect(camera.y).toBeGreaterThan(top);
          }
        }
      }
    }
  });

  it("raises it no further than the next 0.05 rad step past the landmark", () => {
    for (let k = 0; k < 16; k++) {
      const bearing = (k * Math.PI) / 8;
      const box = landmark(bearing, 2, 4.5);
      const { lift } = rise(HEAD, line(bearing), LEN, [box], [], 0, 1);
      expect(lift).toBeGreaterThan(0);
      expect(nearest(HEAD, line(bearing, EL + lift - 0.05), [box], [])).toBeLessThan(3);
      expect(nearest(HEAD, line(bearing, EL + lift), [box], [])).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws the camera in to 0.5 m in front of a landmark 3 m or more from the head, without rising", () => {
    const box = landmark(0, 7, 20);
    const dir = line(0);
    const entry = nearest(HEAD, dir, [box], []);
    // Its near face stands 6.2 m out along the ground, so the line from the head meets it 6.2 / cos(EL) m along the boom.
    expect(entry).toBeCloseTo(6.2 / Math.cos(EL), 9);
    const { lift, room } = rise(HEAD, dir, LEN, [box], [], 0, 1);
    expect(lift).toBe(0);
    expect(elevation(dir)).toBeCloseTo(EL, 12);
    expect(LEN * room).toBeCloseTo(entry - 0.5, 9);
  });

  it("measures the entry distance along +z and along a diagonal", () => {
    expect(nearest(HEAD, line(Math.PI / 2), [landmark(Math.PI / 2, 7, 20)], [])).toBeCloseTo(6.2 / Math.cos(EL), 9);
    // Along the diagonal the line enters the box at its near corner, 0.8 m in on both axes.
    expect(nearest(HEAD, line(Math.PI / 4), [landmark(Math.PI / 4, 7, 20)], [])).toBeCloseTo((7 - 0.8 * Math.SQRT2) / Math.cos(EL), 9);
  });

  it("takes the nearer of two landmarks on one line, in either order", () => {
    const near = landmark(0, 7, 20), far = landmark(0, 12, 20);
    expect(nearest(HEAD, line(0), [far, near], [])).toBeCloseTo(6.2 / Math.cos(EL), 9);
    expect(nearest(HEAD, line(0), [near, far], [])).toBeCloseTo(6.2 / Math.cos(EL), 9);
  });

  it("keeps a face just beyond the camera from drawing it in", () => {
    // Its near face is 11.2 m along the boom, past the camera at 11 m.
    expect(rise(HEAD, line(0), LEN, [landmark(0, 11.2 * Math.cos(EL) + 0.8, 20)], [], 0, 1).room).toBe(1);
  });

  it("draws the camera in front of a landmark with the boom below the head, as when the walker looks up", () => {
    const box = landmark(0, 7, 20);
    const dir = line(0, -0.24);
    const { lift, room } = rise(HEAD, dir, LEN, [box], [], 0, 1);
    expect(lift).toBe(0);
    expect(LEN * room).toBeCloseTo(6.2 / Math.cos(0.24) - 0.5, 9);
  });

  it("never draws the camera nearer the head than 2.5 m, easing down through a landmark that hangs above the boom", () => {
    // Easing down from 0.6 rad at k = 0.25 aims the boom 0.45 rad up, a line that meets this box's face 2.8 m from the head; the
    // boom's own line passes under it.
    const face = 2.8 * Math.cos(EL + 0.45);
    const box = { min: { x: face, y: 5, z: -0.8 }, max: { x: face + 1.6, y: 9, z: 0.8 } };
    expect(nearest(HEAD, line(0), [box], [])).toBe(Infinity);
    const dir = line(0);
    const { lift, room } = rise(HEAD, dir, LEN, [box], [], 0.6, 0.25);
    expect(lift).toBeCloseTo(0.45, 12);
    expect(nearest(HEAD, dir, [box], [])).toBeCloseTo(2.8, 9);
    expect(LEN * room).toBeCloseTo(2.5, 9);
  });

  it("leaves the boom alone with no landmark on its line", () => {
    const dir = line(1);
    // One square off the line, and one the line passes close beside: it crosses the box's x and z extents, but at different points.
    const beside = landmark(1.45, 3.5, 12);
    expect(nearest(HEAD, line(1), [beside], [])).toBe(Infinity);
    const { lift, room } = rise(HEAD, dir, LEN, [landmark(1 + Math.PI / 2, 3, 12), beside], [], 0, 1);
    expect(lift).toBe(0);
    expect(room).toBe(1);
    const level = line(1);
    expect(dir.x).toBeCloseTo(level.x, 12);
    expect(dir.y).toBeCloseTo(level.y, 12);
    expect(dir.z).toBeCloseTo(level.z, 12);
  });

  it("raises the boom at once, even while the camera eases", () => {
    for (let k = 0; k < 16; k++) {
      const bearing = (k * Math.PI) / 8;
      const box = landmark(bearing, 2, 4.5);
      const once = rise(HEAD, line(bearing), LEN, [box], [], 0, 1).lift;
      expect(once).toBeGreaterThan(0);
      expect(rise(HEAD, line(bearing), LEN, [box], [], 0, 0.25).lift).toBe(once);
    }
  });

  it("leaves the boom alone for a landmark ahead of the bear, on the far side of the head", () => {
    for (let k = 0; k < 8; k++) {
      const bearing = (k * Math.PI) / 4;
      const { lift, room } = rise(HEAD, line(bearing), LEN, [landmark(bearing + Math.PI, 2, 12)], [], 0, 1);
      expect(lift).toBe(0);
      expect(room).toBe(1);
    }
  });

  it("skips a landmark around the head", () => {
    const box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 6, z: 1 } };
    const { lift, room } = rise(HEAD, line(0), LEN, [box], [], 0, 1);
    expect(lift).toBe(0);
    expect(room).toBe(1);
  });

  it("lets the rise back down at the ease once the line is clear", () => {
    const dir = line(2);
    const { lift, room } = rise(HEAD, dir, LEN, [], [], 0.6, 0.25);
    expect(lift).toBeCloseTo(0.45, 12);
    expect(elevation(dir)).toBeCloseTo(EL + 0.45, 12);
    expect(room).toBe(1);
  });
});
