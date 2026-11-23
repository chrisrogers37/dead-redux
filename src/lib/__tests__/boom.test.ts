import { describe, expect, it } from "vitest";
import { goRound, nearest, rise, standOff } from "../../../public/world/boom.js";
import { STAGE_COLUMN } from "../../../public/world/ground.js";

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
        for (const r of [3, STAGE_COLUMN.r]) {
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

// What the eye's near plane needs on a desktop's frame (avatar.js eyeRoom), which the camera's place keeps from a box and a column.
const ROOM = 0.84;
// A box 4 m square and 12 m tall on the ground, its middle at (10, 0); and a head far from it.
const TOWER: Box = { min: { x: 8, y: 0, z: -2 }, max: { x: 12, y: 12, z: 2 } };
const AWAY = { x: 30, y: 3.6, z: 30 };
// Whether a point is in a box's room: within `ROOM` of its sides and its top, or anywhere under it.
const inRoom = (p: V, b: Box, slack = 0) => p.x > b.min.x - ROOM + slack && p.x < b.max.x + ROOM - slack && p.z > b.min.z - ROOM + slack && p.z < b.max.z + ROOM - slack && p.y < b.max.y + ROOM - slack;
const apart = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("standOff", () => {
  it("puts a point out of a box's room by the nearest of its four sides and its top, and leaves one outside the room alone", () => {
    // A metre in from each side, and a metre under the top over the middle.
    for (const [from, to] of [
      [{ x: 9, y: 5, z: 0 }, { x: 8 - ROOM, y: 5, z: 0 }], [{ x: 11, y: 5, z: 0 }, { x: 12 + ROOM, y: 5, z: 0 }],
      [{ x: 10, y: 5, z: -1 }, { x: 10, y: 5, z: -2 - ROOM }], [{ x: 10, y: 5, z: 1 }, { x: 10, y: 5, z: 2 + ROOM }],
      [{ x: 10, y: 11, z: 0 }, { x: 10, y: 12 + ROOM, z: 0 }],
    ]) {
      const p = { ...from };
      standOff(p, AWAY, [TOWER], [], ROOM);
      expect(p).toEqual(to);
    }
    // In the room and not in the box: half the room out from a side, and over the top.
    const beside = { x: 8 - ROOM / 2, y: 5, z: 1 }, over = { x: 9, y: 12 + ROOM / 2, z: 1 };
    standOff(beside, AWAY, [TOWER], [], ROOM);
    standOff(over, AWAY, [TOWER], [], ROOM);
    expect([beside, over]).toEqual([{ x: 8 - ROOM, y: 5, z: 1 }, { x: 9, y: 12 + ROOM, z: 1 }]);
    // Outside the room, by a centimetre: left where it is.
    for (const from of [{ x: 8 - ROOM - 0.01, y: 5, z: 0 }, { x: 10, y: 12 + ROOM + 0.01, z: 0 }, { x: 10, y: 5, z: 2 + ROOM + 0.01 }]) {
      const p = { ...from };
      standOff(p, AWAY, [TOWER], [], ROOM);
      expect(p).toEqual(from);
    }
  });

  it("takes a box to stand on the ground: a point under one that hangs in the air is put out by its side, never left under it", () => {
    // As the miracle hangs: 2 m square, from 3 m over the ground to 5.
    const hung: Box = { min: { x: 9, y: 3, z: -1 }, max: { x: 11, y: 5, z: 1 } }, p = { x: 9.5, y: 1.5, z: 0.2 };
    standOff(p, AWAY, [hung], [], ROOM);
    expect(p).toEqual({ x: 9 - ROOM, y: 1.5, z: 0.2 });
  });

  it("takes no notice of a box that stands around the head, as the boom takes none", () => {
    const p = { x: 9, y: 5, z: 0 };
    standOff(p, { x: 10, y: 3.6, z: 0 }, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 9, y: 5, z: 0 });
    // A head just outside the box is not in it, though it is in its room.
    standOff(p, { x: 8 - ROOM / 2, y: 3.6, z: 0 }, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 8 - ROOM, y: 5, z: 0 });
  });

  it("puts a point out of a column's room by its side or its top, whichever is nearer", () => {
    const col: Column = { x: 10, z: 0, r: 5, top: 9 };
    const side = { x: 13, y: 4, z: 4 * 0.75 }, over = { x: 11, y: 8.5, z: 0 }, out = { x: 10 + 5 + ROOM + 0.01, y: 4, z: 0 }, high = { x: 10, y: 9 + ROOM + 0.01, z: 0 };
    for (const p of [side, over, out, high]) standOff(p, AWAY, [], [col], ROOM);
    // Straight out from the column's middle to its room's edge; and straight up to the room's top.
    expect(Math.hypot(side.x - 10, side.z)).toBeCloseTo(5 + ROOM, 9);
    expect([side.z / (side.x - 10), side.y]).toEqual([expect.closeTo(1, 9), 4]);
    expect(over).toEqual({ x: 11, y: 9 + ROOM, z: 0 });
    expect([out, high]).toEqual([{ x: 10 + 5 + ROOM + 0.01, y: 4, z: 0 }, { x: 10, y: 9 + ROOM + 0.01, z: 0 }]);
  });
});

describe("goRound", () => {
  // A place that goes `step` m toward its goal each frame and is sent round what it meets. Tells how many frames it took to
  // arrive, the furthest it moved in one, and whether it was ever in a room, a millimetre's skin aside.
  function go(from: V, goal: V, boxes: Box[], columns: Column[], step: number, head: V = AWAY, hangs: V = AWAY) {
    const p = { ...from }, way: V[] = [];
    let most = 0, inside = false, frames = 0;
    for (; frames < 400 && apart(p, goal) > 1e-6; frames++) {
      const was = { ...p }, left = apart(p, goal), by = Math.min(1, step / left);
      p.x += (goal.x - p.x) * by; p.y += (goal.y - p.y) * by; p.z += (goal.z - p.z) * by;
      goRound(p, was, goal, head, hangs, boxes, columns, ROOM);
      most = Math.max(most, apart(p, was));
      if (boxes.some((b) => inRoom(p, b, 0.002)) || columns.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + ROOM - 0.002 && p.y < c.top + ROOM - 0.002)) inside = true;
      way.push({ ...p });
    }
    return { frames, most, inside, way };
  }

  it("stops a step into a box's room at the side it came in by, though another side be nearer, and keeps what of the step ran along that side", () => {
    // From west of the room, in by its west side near the north-west corner: the north side is the nearer once inside.
    const was = { x: 8 - ROOM - 0.1, y: 5, z: -2.5 }, p = { x: 8 - ROOM + 0.4, y: 5, z: -2.6 };
    goRound(p, was, null, AWAY, AWAY, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 8 - ROOM, y: 5, z: -2.6 });
    // From over it, in by the top.
    const high = { x: 9, y: 12 + ROOM + 0.2, z: 0 }, low = { x: 9.1, y: 12 + ROOM - 0.3, z: 0 };
    goRound(low, high, null, AWAY, AWAY, [TOWER], [], ROOM);
    expect(low).toEqual({ x: 9.1, y: 12 + ROOM, z: 0 });
    // A step that ends outside the room is left alone.
    const free = { x: 8 - ROOM - 0.01, y: 5, z: 0 };
    goRound(free, was, null, AWAY, AWAY, [TOWER], [], ROOM);
    expect(free).toEqual({ x: 8 - ROOM - 0.01, y: 5, z: 0 });
  });

  it("takes a place round a tall box to a goal on its far side, from dead behind it and from either hand, never into its room and never further in a frame than its step", () => {
    for (const z of [0, 0.3, -1.5, 1.5]) for (const step of [0.2, 0.55, 1]) {
      const from = { x: 2, y: 6, z }, goal = { x: 16, y: 5, z: -0.2 };
      const { frames, most, inside, way } = go(from, goal, [TOWER], [], step);
      // Straight through is 14 m; round the room's corner is under 20.
      expect(frames, `from z ${z} at ${step} m a frame`).toBeLessThan(21 / step + 3);
      expect(inside, `from z ${z} at ${step} m a frame`).toBe(false);
      expect(most, `from z ${z} at ${step} m a frame`).toBeLessThanOrEqual(step + 1e-9);
      // Round its side, not over its top, 6 m higher; and by the side the goal lies round toward.
      expect(Math.max(...way.map((q) => q.y))).toBeLessThan(7);
      if (z !== 0) expect(Math.sign(way[Math.floor(way.length / 2)].z)).toBe(Math.sign(z));
    }
  });

  it("takes a place over a low wide box where that is shorter than round it", () => {
    // 20 m wide and 3 m tall, the place 2 m up at its middle: 1.84 m up to its room's top, against 11 m to either end.
    const low: Box = { min: { x: 8, y: 0, z: -10 }, max: { x: 12, y: 3, z: 10 } };
    const { frames, most, inside, way } = go({ x: 2, y: 2, z: 0.4 }, { x: 18, y: 2, z: 0 }, [low], [], 0.5);
    expect(inside).toBe(false);
    expect(frames).toBeLessThan(21 / 0.5);
    expect(most).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(Math.max(...way.map((q) => q.y))).toBeCloseTo(3 + ROOM, 2);
    expect(Math.max(...way.map((q) => Math.abs(q.z)))).toBeLessThan(1);
  });

  it("stops and goes no further where the goal lies in the box's own room or out on the side it came to, and with no goal at all", () => {
    // A goal in the room: the place comes to its side and rests there.
    const rest = go({ x: 2, y: 5, z: 0 }, { x: 9, y: 5, z: 0.5 }, [TOWER], [], 0.5);
    expect(rest.frames).toBe(400);
    expect(rest.way[399].x).toBeCloseTo(8 - ROOM, 9);
    expect(rest.way[399].z).toBeCloseTo(0.5, 2);
    expect(rest.inside).toBe(false);
    // No goal: stopped at the side, with what of its step ran along it.
    const p = { x: 8 - ROOM + 0.3, y: 5, z: 0.4 };
    goRound(p, { x: 8 - ROOM - 0.2, y: 5, z: 0 }, null, AWAY, AWAY, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 8 - ROOM, y: 5, z: 0.4 });
  });

  it("lets a place into the room of a box that stands around the head and around where the boom's end hangs, and into no other", () => {
    const head = { x: 10, y: 3.6, z: 0 }, hangs = { x: 11, y: 6, z: 1 }, was = { x: 8 - ROOM - 0.1, y: 5, z: 0 };
    const own = { x: 8.2, y: 5, z: 0 }, other = { x: 8.2, y: 5, z: 0 }, beyond = { x: 8.2, y: 5, z: 0 };
    goRound(own, was, null, head, hangs, [TOWER], [], ROOM);
    expect(own).toEqual({ x: 8.2, y: 5, z: 0 });
    // The head in the box and the boom's end beyond it: the place is kept out, as the camera goes round a tower the bear is in.
    goRound(beyond, was, null, head, { x: 20, y: 7, z: 0 }, [TOWER], [], ROOM);
    expect(beyond).toEqual({ x: 8 - ROOM, y: 5, z: 0 });
    goRound(other, was, null, AWAY, hangs, [TOWER], [], ROOM);
    expect(other).toEqual({ x: 8 - ROOM, y: 5, z: 0 });
  });

  it("lets a place that stood in a room step only nearer its sides, and spends any other step on the nearest of them", () => {
    // 0.5 m in from the west side's room. A step west is its own; a step east, deeper in, becomes one out by the west.
    const was = { x: 8 - ROOM + 0.5, y: 5, z: 0 }, outward = { x: 8 - ROOM + 0.2, y: 5, z: 0.1 }, inward = { x: 8 - ROOM + 0.9, y: 5, z: 0 };
    goRound(outward, was, { x: 20, y: 5, z: 0 }, AWAY, AWAY, [TOWER], [], ROOM);
    expect(outward).toEqual({ x: 8 - ROOM + 0.2, y: 5, z: 0.1 });
    goRound(inward, was, { x: 20, y: 5, z: 0 }, AWAY, AWAY, [TOWER], [], ROOM);
    expect(inward).toEqual({ x: expect.closeTo(8 - ROOM + 0.1, 9), y: 5, z: 0 });
    // So a place left in a box the head has walked out of comes out of it, and then round it: never across it.
    const { frames, most, way } = go({ x: 9, y: 5, z: 0.1 }, { x: 16, y: 5, z: 0 }, [TOWER], [], 0.5);
    expect(frames).toBeLessThan(40);
    expect(most).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(Math.max(...way.slice(0, 3).map((q) => q.x))).toBeLessThan(9);
    expect(way.filter((q) => inRoom(q, TOWER, 0.002)).length).toBeLessThan(4);
  });

  it("takes a place round a column by the side the goal lies to, or over one it stood over, never into its room", () => {
    const col: Column = { x: 10, z: 0, r: 5, top: 9 };
    for (const z of [0.5, -0.5, 3]) {
      const { frames, most, inside, way } = go({ x: 0, y: 4, z }, { x: 20, y: 4, z: 0 }, [], [col], 0.5);
      expect(inside, `z ${z}`).toBe(false);
      // Round half the room's rim, 18.3 m, and the straights to it: under 33 m in all.
      expect(frames, `z ${z}`).toBeLessThan(33 / 0.5);
      expect(most, `z ${z}`).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(Math.sign(way[Math.floor(way.length / 2)].z), `z ${z}`).toBe(Math.sign(z));
      expect(Math.max(...way.map((q) => q.y)), `z ${z}`).toBeCloseTo(4, 9);
    }
    // From over the column, coming down on it: stopped on its room's top, and on toward a lower goal, level.
    const over = go({ x: 9, y: 12, z: 0 }, { x: 20, y: 4, z: 0 }, [], [col], 0.5);
    expect(over.inside).toBe(false);
    expect(over.frames).toBeLessThan(40);
    expect(over.way.some((q) => Math.abs(q.y - (9 + ROOM)) < 1e-9 && Math.hypot(q.x - 10, q.z) < 5)).toBe(true);
  });
});
