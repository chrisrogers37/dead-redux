import { describe, expect, it } from "vitest";
import { FACING, height, STAGE } from "../../../public/world/ground.js";
import { crowdPlan, parting, seats } from "../../../public/world/seats.js";

type Seat = { x: number; z: number; r: number; sit: boolean };
type Plan = { dance: boolean; sit: boolean };
type Point = [number, number];

const none = { path: [], line: [], landmarks: [] };
// A point `r` metres from the stage's centre and `th` radians off its axis, as the seats are laid out.
const at = (r: number, th: number): Point => [STAGE[0] + r * Math.sin(FACING + th), STAGE[1] + r * Math.cos(FACING + th)];
const nearest = (seat: Seat, points: Point[]) => Math.min(...points.map(([x, z]) => Math.hypot(seat.x - x, seat.z - z)));

describe("seats", () => {
  it("leaves out just the seats within 4 m of the path or the bears' line, or 1.5 m of a landmark's circle", () => {
    // The path runs up the crowd's axis and the bears' line across its middle, both every half metre, and a landmark's circle 6 m round
    // stands among the sitters.
    const path = Array.from({ length: 101 }, (_, i) => at(10 + i / 2, 0));
    const line = Array.from({ length: 101 }, (_, i) => at(35, -1 + i / 50));
    const landmark = at(48, 0.4);
    const kept = seats({ path, line, landmarks: [[...landmark, 6]] });
    const clear = (s: Seat) => nearest(s, path) >= 4 && nearest(s, line) >= 4 && nearest(s, [landmark]) >= 7.5;
    expect(kept.length).toBeLessThan(seats(none).length);
    expect(kept).toEqual(seats(none).filter(clear));
  });

  it("leaves an aisle up the stage's axis, where ?pose=stage stands and the walk down to the stage goes: no seat within 3 m of it", () => {
    for (const s of seats(none) as Seat[]) {
      const off = Math.atan2(s.x - STAGE[0], s.z - STAGE[1]) - FACING;
      expect(Math.abs(s.r * Math.sin(off))).toBeGreaterThanOrEqual(3);
    }
  });

  it("puts the front first: the first half keeps more of the front rows than of the middle, and more of the middle than of the sitters", () => {
    const all: Seat[] = seats(none);
    const half = all.slice(0, Math.ceil(all.length / 2));
    const share = (keep: (s: Seat) => boolean) => half.filter(keep).length / all.filter(keep).length;
    const front = share((s) => s.r < 28), middle = share((s) => s.r >= 28 && !s.sit), sitters = share((s) => s.sit);
    expect(front).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(sitters);
  });
});

describe("crowdPlan", () => {
  const plan = (titles: string[], set2Start: number | null = null) =>
    (crowdPlan(titles, set2Start) as Plan[]).map(({ dance, sit }) => (dance ? "d" : "-") + (sit ? "s" : "-"));

  it("dances to the songs, Drums and Space among them, sits in Space and through a set break, and stands through the rest", () => {
    const titles = ["Crowd", "Tuning", "Jack Straw", "Tuning", "Samson And Delilah", "Set Break", "Drums ->", "Space ->", "Crowd", "Encore Break"];
    expect(plan(titles)).toEqual(["--", "--", "d-", "--", "d-", "-s", "d-", "ds", "--", "--"]);
  });

  it("sits where set 2 starts through what is not a song just before it, and nowhere else between songs", () => {
    const titles = ["Tuning", "Jack Straw", "Tuning", "Deal", "Tuning", "Crowd", "Samson And Delilah", "Set Break", "Drums"];
    expect(plan(titles, 6)).toEqual(["--", "d-", "--", "d-", "-s", "-s", "d-", "--", "d-"]);
  });

  it("reads each song in a title by its whole name", () => {
    const titles = ["Jack Straw", "Heartbreak Hotel", "Breakdown Palace", "Spaceman", "The Other One Space >", "Drums > Space", "Drums/Space",
      "Space (12:01) ->", "Setbreak", "Set 1 Break", "Break", "Set Break 2"];
    expect(plan(titles)).toEqual(["d-", "d-", "d-", "d-", "d-", "d-", "d-", "ds", "-s", "-s", "-s", "-s"]);
  });
});

describe("parting", () => {
  // The seats with nothing kept clear, the options crowd.js gives for its largest figures, and a visitor's bear facing (fx, fz).
  const placed = seats(none) as Seat[], n = placed.length;
  const OPTS = { keep: 4.2, reach: 4.07, lead: 0.9, step: 5.5, back: 3, space: 1.4, most: 9.1, passes: 4, ring: 2.3, top: 3.9, wide: 2.09,
    clear: 0.8 };
  const bear = (x: number, z: number, fx: number, fz: number) => ({ feet: { x, z }, head: { x: x + 0.8 * fx, z: z + 0.8 * fz } });
  const where = (p: { offset: Float32Array }, i: number) => [placed[i].x + p.offset[4 * i], placed[i].z + p.offset[4 * i + 2]];

  it("makes room for a walk through the crowd at 12 m/s: steps aside at 5.5 m/s at most, keeps out of reach, stands on the ground, goes back", () => {
    const p = parting(placed, OPTS);
    // Down the hill toward the stage, 9 m off its axis, at 60 frames a second, then 5 s standing past the crowd.
    const ux = -STAGE[0] / Math.hypot(...STAGE), uz = -STAGE[1] / Math.hypot(...STAGE);
    const at = (a: number) => bear(STAGE[0] + a * ux - 9 * uz, STAGE[1] + a * uz + 9 * ux, -ux, -uz);
    let last = Float32Array.from(p.offset), fastest = 0, nearest = Infinity, ground = 0, moved = 0;
    p.step(0, at(62).feet, at(62).head, false);
    for (let a = 62; a >= 0; a -= 0.2) {
      const v = at(a);
      p.step(1 / 60, v.feet, v.head, false);
      const mx = (v.feet.x + v.head.x) / 2, mz = (v.feet.z + v.head.z) / 2;
      for (let i = 0; i < n; i++) {
        const [x, z] = where(p, i);
        fastest = Math.max(fastest, Math.hypot(p.offset[4 * i] - last[4 * i], p.offset[4 * i + 2] - last[4 * i + 2]) * 60);
        nearest = Math.min(nearest, Math.hypot(x - mx, z - mz));
        ground = Math.max(ground, Math.abs(height(placed[i].x, placed[i].z) + p.offset[4 * i + 1] - height(x, z)));
        if (p.offset[4 * i] !== 0 || p.offset[4 * i + 2] !== 0) moved += 1;
      }
      last = Float32Array.from(p.offset);
    }
    expect(moved).toBeGreaterThan(0);
    expect(fastest).toBeLessThanOrEqual(5.5 + 1e-4);
    expect(fastest).toBeGreaterThan(5);
    expect(nearest).toBeGreaterThanOrEqual(4.07 - 1e-4);
    expect(ground).toBeLessThan(1e-4);
    for (let k = 0; k < 300; k++) p.step(1 / 60, at(0).feet, at(0).head, false);
    expect([...p.offset].every((v) => v === 0)).toBe(true);
  });

  it("stands each figure at once where it would end under reduced motion, still while the visitor stands, its neighbours still too", () => {
    const p = parting(placed, OPTS), v = bear(54.15, -36.66, 0.58, 0.81);
    expect(p.step(0.05, v.feet, v.head, true)).toBe(true);
    const settled = Float32Array.from(p.offset);
    expect(p.step(0.05, v.feet, v.head, true)).toBe(false);
    expect(p.offset).toEqual(settled);
    const off = (i: number) => Math.hypot(p.offset[4 * i], p.offset[4 * i + 2]), still = (i: number) => p.offset[4 * i + 3];
    const all = placed.map((_, i) => i), moved = all.filter((i) => off(i) > 0), aside = all.filter((i) => off(i) >= 0.25);
    expect(aside.length).toBeGreaterThan(0);
    expect(p.parted).toBe(moved.length);
    for (const i of aside) expect(still(i)).toBe(1);
    // A figure at its seat within 1.8 m of one that stepped 0.25 m aside stands still; one 2.3 m from every figure off its seat dances.
    const apart = (i: number, j: number) => Math.hypot(where(p, i)[0] - where(p, j)[0], where(p, i)[1] - where(p, j)[1]);
    const from = (i: number, of: number[]) => Math.min(...of.map((j) => apart(i, j)));
    for (const i of all) if (off(i) === 0 && from(i, aside) < 1.8) expect(still(i)).toBe(1);
    for (const i of all) if (off(i) === 0 && from(i, moved) >= 2.3) expect(still(i)).toBe(0);
  });

  it("holds a camera 0.8 m over the highest a figure reaches, out to its reach and 0.8 m, then 1.5 m lower each metre to 3 m past", () => {
    const s = { x: 70, z: -60 }, p = parting([s], OPTS), top = height(s.x, s.z) + 3.9 + 0.8;
    expect(p.over(s.x + 2.89, s.z)).toBeCloseTo(top, 9);
    expect(p.over(s.x, s.z + 3.89)).toBeCloseTo(top - 1.5, 9);
    expect(p.over(s.x + 5.9, s.z)).toBe(-Infinity);
  });
});
