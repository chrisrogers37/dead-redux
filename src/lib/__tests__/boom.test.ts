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

  // The platform's edge (issue #194): the head 5 cm outside the stage's column and 5 m under its top. The line meets the column
  // further off than 3 m, yet under its top, only between 89.05 and 89.43 degrees up: a third of a degree, where a step is 2.9.
  // As the boom's own elevation eases, its steps land in that third of a degree or past it: the camera was drawn in to 2.5 m
  // over the bear or hung at the boom's length, and went from the one to the other as the boom settled.
  it("rises over a landmark it is all but over, whatever its own elevation: hard against a tall column, where the angles that stop the line in front of it are fewer than a step, the line passes over the column from every elevation the easing boom goes through", () => {
    const col = column(0, 0.05, STAGE_COLUMN.r, HEAD.y + 5);
    let stepped = 0;
    for (let n = 0; n <= 200; n++) {
      const el = 0.3 + n * 0.0005, dir = line(0, el);
      // The plain steps, as the boom takes them: up from its own elevation until the line is clear for 3 m.
      let need = 0;
      while (el + need < Math.PI / 2 && nearest(HEAD, line(0, el + need), [], [col]) < 3) need += 0.05;
      const inFront = el + need < Math.PI / 2 && nearest(HEAD, line(0, el + need), [], [col]) < LEN;
      const { lift, room } = rise(HEAD, dir, LEN, [], [col], 0, 1);
      // Where the steps' own line passes over, that is the rise; where it stops in front of the column, a step more.
      expect(lift, `from ${el.toFixed(4)} rad`).toBe(inFront ? need + 0.05 : need);
      expect(room, `from ${el.toFixed(4)} rad`).toBe(1);
      expect(nearest(HEAD, dir, [], [col]), `from ${el.toFixed(4)} rad`).toBe(Infinity);
      if (inFront) stepped += 1;
    }
    // Both happen over these elevations: the steps alone stop the line in front of the column from 26 of the 201.
    expect(stepped).toBe(26);
  });

  it("still stops in front of a tall landmark where the angles that meet its face are a step or more, from every elevation: a step past the least rise that clears 3 m would not pass over it", () => {
    // 1 m from the head and 8 m over it: the line meets its face beyond 3 m from 70.5 degrees up to 82.9, over four steps. And
    // 0.5 m from the head and 5 m over it: from 80.4 degrees to 84.3, a step and a third, where a step on from the steps' own
    // line passes over from some elevations and not from others; the least rise that clears, found to a hair, tells the same
    // from all of them.
    for (const [side, over] of [[1, 8], [0.5, 5]]) {
      const col = column(0, side, STAGE_COLUMN.r, HEAD.y + over);
      let passes = 0;
      for (let n = 0; n <= 200; n++) {
        const el = 0.3 + n * 0.0005, dir = line(0, el), at = `${side} m off, from ${el.toFixed(4)} rad`;
        const { lift, room } = rise(HEAD, dir, LEN, [], [col], 0, 1);
        // The least step that clears 3 m, and no more; and the line stops in front of the column.
        expect(nearest(HEAD, line(0, el + lift - 0.05), [], [col]), at).toBeLessThan(3);
        expect(nearest(HEAD, line(0, el + lift), [], [col]), at).toBeGreaterThanOrEqual(3);
        expect(room, at).toBeLessThan(1);
        if (nearest(HEAD, line(0, el + lift + 0.05), [], [col]) >= LEN) passes += 1;
      }
      // (For the nearer column a step on from the steps' own line does pass over, from some of these elevations.)
      if (side === 0.5) expect(passes).toBeGreaterThan(0);
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

  it("does not rise for a landmark 3 m or more from the head, however little its top stands over the boom's line: the step more is for a landmark the boom has risen at", () => {
    // Its near face 5.2 m off, and its top half a millimetre over where the line meets that face: a line a fifth of a
    // milliradian higher, which is how finely the least rise is found, would pass over it.
    const box = landmark(0, 6, HEAD.y + 5.2 * Math.tan(EL) + 0.0005), dir = line(0);
    expect(nearest(HEAD, line(0, EL + 0.0002), [box], [])).toBe(Infinity);
    const { lift, room } = rise(HEAD, dir, LEN, [box], [], 0, 1);
    expect(lift).toBe(0);
    expect(room).toBeCloseTo((5.2 / Math.cos(EL) - 0.5) / LEN, 9);
    expect(elevation(dir)).toBeCloseTo(EL, 12);
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
      standOff(p, AWAY, AWAY, [TOWER], [], ROOM);
      expect(p).toEqual(to);
    }
    // In the room and not in the box: half the room out from a side, and over the top.
    const beside = { x: 8 - ROOM / 2, y: 5, z: 1 }, over = { x: 9, y: 12 + ROOM / 2, z: 1 };
    standOff(beside, AWAY, AWAY, [TOWER], [], ROOM);
    standOff(over, AWAY, AWAY, [TOWER], [], ROOM);
    expect([beside, over]).toEqual([{ x: 8 - ROOM, y: 5, z: 1 }, { x: 9, y: 12 + ROOM, z: 1 }]);
    // Outside the room, by a centimetre: left where it is.
    for (const from of [{ x: 8 - ROOM - 0.01, y: 5, z: 0 }, { x: 10, y: 12 + ROOM + 0.01, z: 0 }, { x: 10, y: 5, z: 2 + ROOM + 0.01 }]) {
      const p = { ...from };
      standOff(p, AWAY, AWAY, [TOWER], [], ROOM);
      expect(p).toEqual(from);
    }
  });

  it("takes a box to stand on the ground: a point under one that hangs in the air is put out by its side, never left under it", () => {
    // As the miracle hangs: 2 m square, from 3 m over the ground to 5.
    const hung: Box = { min: { x: 9, y: 3, z: -1 }, max: { x: 11, y: 5, z: 1 } }, p = { x: 9.5, y: 1.5, z: 0.2 };
    standOff(p, AWAY, AWAY, [hung], [], ROOM);
    expect(p).toEqual({ x: 9 - ROOM, y: 1.5, z: 0.2 });
  });

  it("takes no notice of a box that stands around the head and around where the boom's end hangs, the room goRound lets the camera's place into", () => {
    const p = { x: 9, y: 5, z: 0 }, head = { x: 10, y: 3.6, z: 0 }, hangs = { x: 11, y: 6, z: 1 };
    standOff(p, head, hangs, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 9, y: 5, z: 0 });
    // A head just outside the box is not in it, though it is in its room.
    const beside = { ...p };
    standOff(beside, { x: 8 - ROOM / 2, y: 3.6, z: 0 }, hangs, [TOWER], [], ROOM);
    expect(beside).toEqual({ x: 8 - ROOM, y: 5, z: 0 });
    // And with the head in the box and the boom's end out beyond its room, the point is put out: the camera's place is kept out
    // of that room then, and a goal left in it would be one the place never came to.
    standOff(p, head, { x: 20, y: 7, z: 0 }, [TOWER], [], ROOM);
    expect(p).toEqual({ x: 8 - ROOM, y: 5, z: 0 });
  });

  it("leaves a point in no room where two boxes' rooms overlap: put out of one by a side that lies in the other's, it goes up to that one's top", () => {
    // A second box 1 m west of the tower, 5 m tall: its room and the tower's overlap by 0.68 m. A point 0.2 m inside the tower's
    // west wall goes out by that side, to 0.16 m inside the low box's east wall, and so up to the low box's room's top.
    const low: Box = { min: { x: 4, y: 0, z: -2 }, max: { x: 7, y: 5, z: 2 } }, from = { x: 8.2, y: 3, z: 0 };
    for (const boxes of [[TOWER, low], [low, TOWER]]) {
      const p = { ...from };
      standOff(p, AWAY, AWAY, boxes, [], ROOM);
      expect(boxes.some((b) => inRoom(p, b, 1e-6))).toBe(false);
      // Whichever box is first: of the two places the two orders give, the nearer to where the point was, 3 m off on the low
      // box's room's top, and not the other, 9.8 m off on the tower's.
      expect(p).toEqual({ x: 8 - ROOM, y: 5 + ROOM, z: 0 });
    }
    // A point in one room only is put out by its nearest side, as before: no higher.
    const alone = { x: 4.3, y: 3, z: 0 };
    standOff(alone, AWAY, AWAY, [TOWER, low], [], ROOM);
    expect(alone).toEqual({ x: 4 - ROOM, y: 3, z: 0 });
    // And a box around the head is one of them where the boom's end hangs out beyond its room: the point is left in neither.
    const held = { ...from };
    standOff(held, { x: 10, y: 3.6, z: 0 }, { x: 20, y: 7, z: 0 }, [TOWER, low], [], ROOM);
    expect(held).toEqual({ x: 8 - ROOM, y: 5 + ROOM, z: 0 });
  });

  it("puts a point out of a column's room by its side or its top, whichever is nearer", () => {
    const col: Column = { x: 10, z: 0, r: 5, top: 9 };
    const side = { x: 13, y: 4, z: 4 * 0.75 }, over = { x: 11, y: 8.5, z: 0 }, out = { x: 10 + 5 + ROOM + 0.01, y: 4, z: 0 }, high = { x: 10, y: 9 + ROOM + 0.01, z: 0 };
    for (const p of [side, over, out, high]) standOff(p, AWAY, AWAY, [], [col], ROOM);
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

  it("takes a place round a tall column by the side the goal lies to, at its own height, or over one it stood over, never into its room", () => {
    // 5 m across its room's rim to the far side is 18.3 m; up to this one's top and down again is 34.
    const col: Column = { x: 10, z: 0, r: 5, top: 20 };
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
    const over = go({ x: 9, y: 23, z: 0 }, { x: 20, y: 15, z: 0 }, [], [col], 0.5);
    expect(over.inside).toBe(false);
    expect(over.frames).toBeLessThan(40);
    expect(over.way.some((q) => Math.abs(q.y - (20 + ROOM)) < 1e-9 && Math.hypot(q.x - 10, q.z) < 5)).toBe(true);
  });

  it("takes a place over a low column where the climb is shorter than the way round, and never back down its near side", () => {
    // 9 m tall: up 5.84 m to its room's top and down again is 11.7 m, against 18.3 m round.
    const col: Column = { x: 10, z: 0, r: 5, top: 9 };
    for (const z of [0.5, -0.5, 3]) {
      const { frames, most, inside, way } = go({ x: 0, y: 4, z }, { x: 20, y: 4, z: 0 }, [], [col], 0.5);
      expect(inside, `z ${z}`).toBe(false);
      expect(frames, `z ${z}`).toBeLessThan(36 / 0.5);
      expect(most, `z ${z}`).toBeLessThanOrEqual(0.5 + 1e-6);
      // Up the side it met, across the top, and down beyond: it is over the column's middle at its room's top.
      expect(Math.max(...way.map((q) => q.y)), `z ${z}`).toBeCloseTo(9 + ROOM, 2);
      expect(way.some((q) => Math.hypot(q.x - 10, q.z) < 3.5 && Math.abs(q.y - (9 + ROOM)) < 1e-9), `z ${z}`).toBe(true);
      // Once over the top it does not come back to the side it climbed.
      const topped = way.findIndex((q) => q.y >= 9 + ROOM - 1e-9);
      expect(Math.min(...way.slice(topped).map((q) => q.x)), `z ${z}`).toBeGreaterThanOrEqual(way[topped].x - 1e-9);
    }
  });

  // The review of #191 found the camera swinging between two places for ever, 0.5 m apart, beside the stage's column with its
  // goal over the column: the way round turned back each frame as the place passed under the goal.
  it("goes up the side of a column or a box to a goal that stands over it, where no way round reaches: straight there, never swinging between two places", () => {
    const col: Column = { x: 10, z: 0, r: 5, top: 9 };
    // The place beside each, 4 m up; the goal over it, a metre in from its room's side, at three places along that side.
    for (const [name, boxes, columns, from, goals] of [
      ["column", [], [col], { x: 10 - 5 - ROOM, y: 4, z: 0 }, [{ x: 5.2, y: 10.5, z: 0 }, { x: 6, y: 9 + ROOM, z: 2 }, { x: 6, y: 12, z: -2 }]],
      ["box", [TOWER], [], { x: 8 - ROOM, y: 4, z: 0 }, [{ x: 8.2, y: 13.5, z: 0 }, { x: 8.2, y: 12 + ROOM, z: 1.5 }, { x: 8.2, y: 14, z: -1.5 }]],
    ] as [string, Box[], Column[], V, V[]][]) for (const goal of goals) for (const step of [0.3, 0.55, 1]) {
      const { frames, most, inside, way } = go(from, goal, boxes, columns, step), at = `${name}, goal ${goal.x} ${goal.y} ${goal.z}, ${step} m a frame`;
      expect(inside, at).toBe(false);
      // It arrives: within twice the straight way, a frame for each step of it.
      expect(frames, at).toBeLessThan((2 * apart(from, goal)) / step + 4);
      expect(most, at).toBeLessThanOrEqual(step + 1e-9);
      // And never turns back: no frame undoes the frame before it, as the swing did, whose every frame went straight back
      // along the last (a cosine of -1 between them).
      for (let k = 2; k < way.length; k++) {
        const a = way[k - 1], b = way[k], o = way[k - 2];
        expect(((b.x - a.x) * (a.x - o.x) + (b.y - a.y) * (a.y - o.y) + (b.z - a.z) * (a.z - o.z)) / (apart(a, b) * apart(o, a) || 1), `${at}, frame ${k}`).toBeGreaterThan(-0.05);
      }
      // Up, and never down again but by the millimetre it went past the top's edge.
      expect(way.every((q, k) => k === 0 || q.y >= way[k - 1].y - 0.0011), at).toBe(true);
    }
  });

  // A goal that standOff set on a side of a room and the bear's least then moved by a hair (avatar.js `clear`) stood 1.7e-15 m
  // inside the room at a stop beside a landmark of 1986-07-04: it was taken for a goal over the box, and the place, coming down
  // that side to it, was sent 0.5 m back up the side for two frames.
  it("takes a goal within a hair of a room's side for a goal on that side: a place coming down the side to it comes down, and one on the next side goes round to it, neither sent up the box as to a goal over it", () => {
    for (const hair of [1e-15, 1e-9, 1e-4]) for (const step of [0.3, 0.55]) {
      // Down the east side of the tower's room, from 10 m up to a goal 4 m up, a hair in from that side.
      // (The place stops on the side, the hair short of a goal that is in the room by it: it is there within 25 frames.)
      const east = TOWER.max.x + ROOM, goal = { x: east - hair, y: 4, z: 0.5 }, down = go({ x: east, y: 10, z: 0.4 }, goal, [TOWER], [], step).way.slice(0, 25);
      expect(down.every((q, k) => k === 0 || q.y <= down[k - 1].y + 1e-9), `down, ${hair} m in, ${step} m a frame`).toBe(true);
      expect(apart(down[down.length - 1], goal), `down, ${hair} m in, ${step} m a frame`).toBeLessThan(hair + 1e-6);
      // From the north side, 2 m up, round the corner to the same goal: level, never up the 12 m box.
      const round = go({ x: 10, y: 2, z: TOWER.min.z - ROOM }, { ...goal, y: 2 }, [TOWER], [], step).way.slice(0, 45);
      expect(Math.max(...round.map((q) => q.y)), `round, ${hair} m in, ${step} m a frame`).toBeLessThan(2.01);
      expect(apart(round[round.length - 1], { ...goal, y: 2 }), `round, ${hair} m in, ${step} m a frame`).toBeLessThan(hair + 1e-6);
      // And from over the box, a metre in from that side on the room's top: across to over the goal, out over the top's
      // edge and down the side to it. It stood on the top over such a goal for good.
      const over = go({ x: east - 1, y: TOWER.max.y + ROOM, z: 0.5 }, goal, [TOWER], [], step).way.slice(0, 60);
      expect(apart(over[over.length - 1], goal), `from the top, ${hair} m in, ${step} m a frame`).toBeLessThan(hair + 1e-6);
      // (Only a place within that hair of the edge is put on it: one whose step has taken it on past the edge, to a goal
      // further out, is where its step took it, as far out as it went.)
      const past = go({ x: east - 0.2, y: TOWER.max.y + ROOM, z: 0.5 }, { x: east + 3, y: 4, z: 0.5 }, [TOWER], [], step).way[0];
      expect(past.x, `past the edge, ${step} m a frame`).toBeGreaterThan(east + 0.05);
    }
  });

  it("comes down a column's side as it goes round it, to a goal lower on the side: never held at its own height over a goal it stands above", () => {
    // A column too tall to go over: 20 m.
    const col: Column = { x: 10, z: 0, r: 5, top: 20 }, R = 5 + ROOM;
    // On the room's side 8 m up; the goal on it 5 m lower, 0.05 rad round, which is 0.3 m, and 2 rad round, which is 11.7 m.
    for (const turn of [0.05, 2]) {
      const from = { x: 10 - R, y: 8, z: 0 }, goal = { x: 10 - R * Math.cos(turn), y: 3, z: R * Math.sin(turn) };
      const { frames, most, inside, way } = go(from, goal, [], [col], 0.5), at = `${turn} rad round`;
      expect(inside, at).toBe(false);
      expect(frames, at).toBeLessThan((5 + R * turn) / 0.5 + 6);
      expect(most, at).toBeLessThanOrEqual(0.5 + 1e-6);
      // Down all the way, and round all the way: neither turns back.
      expect(way.every((q, k) => k === 0 || q.y <= way[k - 1].y + 1e-9), at).toBe(true);
      const bearing = (q: V) => Math.atan2(q.z, 10 - q.x);
      expect(way.every((q, k) => k === 0 || bearing(q) >= bearing(way[k - 1]) - 1e-9), at).toBe(true);
    }
  });

  it("goes no further round a column than the goal's bearing, however long its step: a place carried a long way in a frame stops at the goal's side of the column and does not turn back from beyond it", () => {
    const col: Column = { x: 10, z: 0, r: 5, top: 20 }, R = 5 + ROOM;
    // On the room's side; the goal on it 0.1 rad round, which is 0.58 m; and a step of 3 m into the room, as the walk may carry it.
    const was = { x: 10 - R, y: 4, z: 0 }, goal = { x: 10 - R * Math.cos(0.1), y: 4, z: R * Math.sin(0.1) }, p = { x: was.x + 3, y: 4, z: 0.2 };
    goRound(p, was, goal, AWAY, AWAY, [], [col], ROOM);
    expect(apart(p, goal)).toBeLessThan(1e-9);
    // And the next frame's step from there is its own: it is at its goal.
    const next = { ...p };
    goRound(next, p, goal, AWAY, AWAY, [], [col], ROOM);
    expect(next).toEqual(p);
  });

  it("takes a place that stands a little way in a room, where the bear has pressed it, on round the box from the nearest side: it does not only come out by that side and stand there", () => {
    // 0.05 m in from the tower's room's east side, the goal beyond the tower to the west, south of its middle: the way round is south.
    const was = { x: 12 + ROOM - 0.05, y: 5, z: 0.5 }, goal = { x: 2, y: 5, z: 1 }, p = { x: was.x - 0.5, y: 5, z: 0.52 };
    goRound(p, was, goal, AWAY, AWAY, [TOWER], [], ROOM);
    // Out to the east side, and along it by the rest of its step of half a metre.
    expect(p.x).toBeCloseTo(12 + ROOM, 9);
    expect(p.z - was.z).toBeCloseTo(apart({ x: was.x - 0.5, y: 5, z: 0.52 }, was) - 0.05, 9);
    expect(p.y).toBe(5);
    // With no goal, or one on its own side of the box, it comes out by the nearest side and no more.
    for (const to of [null, { x: 20, y: 5, z: 0 }]) {
      const q = { x: was.x - 0.5, y: 5, z: 0.52 };
      goRound(q, was, to, AWAY, AWAY, [TOWER], [], ROOM);
      expect(q).toEqual({ x: expect.closeTo(12 + ROOM + 0.001, 9), y: 5, z: 0.5 });
    }
    // And a step no longer than the way out is spent on the way out.
    const short = { x: was.x - 0.04, y: 5, z: 0.5 };
    goRound(short, was, goal, AWAY, AWAY, [TOWER], [], ROOM);
    expect(short).toEqual({ x: expect.closeTo(was.x + 0.04, 9), y: 5, z: 0.5 });
  });

  it("goes up out of the corner between two boxes whose rooms overlap, where the way round each leads into the other: it neither stands there nor swings, and comes to its goal", () => {
    // The tower, and a wall 1 m south of it that runs 8 m further west and is 7 m tall: their rooms overlap. The place comes
    // from the west at the tower's west side, south of its middle, so its way round the tower is south, into the corner the wall
    // makes with it; and the wall, with the goal on its own north side, only stops it. Its goal is east of them both.
    const wall: Box = { min: { x: 2, y: 0, z: 3 }, max: { x: 12, y: 7, z: 5 } };
    for (const boxes of [[TOWER, wall], [wall, TOWER]]) for (const step of [0.3, 0.55, 1]) {
      const { frames, most, inside, way } = go({ x: 4, y: 3, z: 1 }, { x: 18, y: 3, z: 1.5 }, boxes, [], step), at = `${boxes.indexOf(TOWER)}, ${step} m a frame`;
      expect(frames, at).toBeLessThan(400);
      expect(inside, at).toBe(false);
      expect(most, at).toBeLessThanOrEqual(step + 1e-9);
      // Over the wall, the lower of the two, and no higher than it need be for that.
      expect(Math.max(...way.map((q) => q.y)), at).toBeGreaterThanOrEqual(7 + ROOM);
      expect(Math.max(...way.map((q) => q.y)), at).toBeLessThan(7 + ROOM + step + 0.01);
    }
  });
});
