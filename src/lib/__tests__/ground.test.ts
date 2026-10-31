import { describe, expect, it } from "vitest";
import { BOUND, FACING, height, PATH_POSE, SHELF_Y, slope, SLOPE_POSE, STAGE, STAGE_POSE } from "../../../public/world/ground.js";

// How near a walk comes to the stage's centre (STAGE_REACH, public/world/stage.js).
const REACH = 11;
// How far the stage's solids stand from its centre: its column's radius (STAGE_COLUMN, public/world/stage.js).
const COLUMN = 10.95;
// Where the ring road starts, and where the shore beyond it starts to fall (public/world/island.js, slope()).
const RING = 112, SHORE = 118;
// The longest walk to the platform's edge that the desktop-stage recording's 25-s hold covers with seconds to spare
// (.github/screenshots/shoot.mjs): at most 0.6 m a frame, and CI draws this view about once every 0.5 s.
const WALK = 24.5;
// How high a bear's head stands over the ground it walks on (public/world/avatar.js).
const HEAD = 3.6;
// The middle of the stage's light panel, in the stage's own frame: centred, 3.7 m above the floor, on the back wall (public/world/stage.js).
const PANEL = { y: 3.7, z: -4.08 };
// Half the desktop frame's width, in degrees: a 60-degree field (public/world/quality.js) at the shots' 1440 x 900.
const HALF_WIDTH = (Math.atan(1.6 * Math.tan(Math.PI / 6)) * 180) / Math.PI;

type Pose = { x: number; z: number; heading: number };

// The angle between two directions on the ground, in degrees.
const between = (ax: number, az: number, bx: number, bz: number) =>
  (Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) * 180) / Math.PI;
// How far the line from the stage's centre to (x, z) turns from its front. A group's local +z points along its facing.
const offFront = (x: number, z: number) => between(Math.sin(FACING), Math.cos(FACING), x - STAGE[0], z - STAGE[1]);
// How far the line from a walker to the stage's centre turns from its heading. A heading h walks along (-sin h, -cos h) (main.js).
const offHeading = ({ x, z, heading }: Pose) => between(-Math.sin(heading), -Math.cos(heading), STAGE[0] - x, STAGE[1] - z);
const fromStage = ({ x, z }: Pose) => Math.hypot(x - STAGE[0], z - STAGE[1]);
// A point `r` metres from the stage's centre along `a` (rad).
const around = (r: number, a: number): [number, number] => [STAGE[0] + r * Math.cos(a), STAGE[1] + r * Math.sin(a)];
// A point `r` metres out from the stage's centre along its front.
const ahead = (r: number): [number, number] => [STAGE[0] + r * Math.sin(FACING), STAGE[1] + r * Math.cos(FACING)];

describe("the stage's place", () => {
  it("stands at the island's edge, past the hill's foot, its solids inside the ring road and its shelf inside the shore", () => {
    const d = Math.hypot(STAGE[0], STAGE[1]);
    expect(d).toBeGreaterThan(90);
    expect(d + COLUMN).toBeLessThan(RING);
    expect(d + 14).toBeLessThan(SHORE);
  });
});

describe("the stage's shelf", () => {
  it("stands at the ground's own height, so the stage neither sinks into the ground nor stands on a mound", () => {
    expect(Math.abs(slope(STAGE[0], STAGE[1]) - SHELF_Y)).toBeLessThan(0.05);
  });

  it("is flat within 8 m of the stage and leaves the ground its own from 14 m", () => {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      for (const r of [0, 4, 8]) expect(height(...around(r, a))).toBeCloseTo(SHELF_Y, 9);
      for (const r of [14.01, 20]) {
        const [x, z] = around(r, a);
        expect(height(x, z)).toBe(slope(x, z));
      }
    }
  });

  it("cuts or fills no more than a metre where it blends into the ground, so it needs no terrace", () => {
    for (let k = 0; k < 64; k++) {
      const a = (k * Math.PI) / 32;
      for (const r of [9.5, 11, 12.5, 14]) {
        const [x, z] = around(r, a);
        expect(Math.abs(slope(x, z) - SHELF_Y)).toBeLessThan(1);
      }
    }
  });
});

describe("the stage's facing", () => {
  it("turns the stage's front to the island's middle", () => {
    expect(offFront(0, 0)).toBeCloseTo(0, 9);
  });

  it("has the hill rise before it as seating: the ground climbs more than 3 m in each 10 m from 20 to 60 m out", () => {
    for (let r = 20; r < 60; r += 10) expect(slope(...ahead(r + 10)) - slope(...ahead(r))).toBeGreaterThan(3);
  });

  it("lets a bear's head 30, 45 or 60 m up the slope see the panel over the ground between", () => {
    const px = STAGE[0] + PANEL.z * Math.sin(FACING), py = SHELF_Y + PANEL.y, pz = STAGE[1] + PANEL.z * Math.cos(FACING);
    for (const r of [30, 45, 60]) {
      const [sx, sz] = ahead(r), sy = slope(sx, sz) + HEAD;
      const n = Math.ceil(Math.hypot(px - sx, pz - sz));
      for (let k = 1; k < n; k++) {
        const u = k / n;
        expect(height(sx + (px - sx) * u, sz + (pz - sz) * u)).toBeLessThan(sy + (py - sy) * u);
      }
    }
  });
});

describe("?pose=stage", () => {
  it("stands in front of the stage, beyond its reach and within the walk's bound, facing its centre", () => {
    expect(fromStage(STAGE_POSE)).toBeGreaterThan(REACH);
    expect(Math.hypot(STAGE_POSE.x, STAGE_POSE.z)).toBeLessThan(BOUND);
    expect(offFront(STAGE_POSE.x, STAGE_POSE.z)).toBeLessThan(20);
    expect(offHeading(STAGE_POSE)).toBeLessThan(0.1);
  });

  it("stands up the slope from the stage and looks down, so in third person the boom rises and the stage stands over the bear's head", () => {
    expect(slope(STAGE_POSE.x, STAGE_POSE.z)).toBeGreaterThan(SHELF_Y + 5);
    expect(STAGE_POSE.pitch).toBeLessThan(0);
  });

  it("is a walk to the platform's edge that the desktop-stage recording's hold covers", () => {
    expect(fromStage(STAGE_POSE) - REACH).toBeLessThan(WALK);
  });
});

describe("?pose=slope", () => {
  it("stands in front of the stage, further up the slope than ?pose=stage and within the walk's bound, facing its centre", () => {
    expect(fromStage(SLOPE_POSE)).toBeGreaterThan(fromStage(STAGE_POSE));
    expect(Math.hypot(SLOPE_POSE.x, SLOPE_POSE.z)).toBeLessThan(BOUND);
    expect(offFront(SLOPE_POSE.x, SLOPE_POSE.z)).toBeLessThan(20);
    expect(offHeading(SLOPE_POSE)).toBeLessThan(0.1);
  });

  it("looks down at the stage from high over it: its floor lies more than 15 degrees below a bear's head there", () => {
    const below = slope(SLOPE_POSE.x, SLOPE_POSE.z) + HEAD - SHELF_Y;
    expect((Math.atan2(below, fromStage(SLOPE_POSE)) * 180) / Math.PI).toBeGreaterThan(15);
    expect(SLOPE_POSE.pitch).toBeLessThan(0);
  });
});

describe("?pose=path", () => {
  it("sees the stage's front, not its back", () => {
    expect(offFront(PATH_POSE.x, PATH_POSE.z)).toBeLessThan(60);
  });

  it("has the stage in the desktop frame, short of its edge", () => {
    expect(offHeading(PATH_POSE)).toBeLessThan(HALF_WIDTH - 5);
  });
});
