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
  // Each track 5 min long unless `durations` says, in s.
  const plan = (titles: string[], set2Start: number | null = null, durations: number[] = titles.map(() => 300)) =>
    (crowdPlan(titles.map((title, i) => ({ title, duration: durations[i] })), set2Start) as Plan[])
      .map(({ dance, sit }) => (dance ? "d" : "-") + (sit ? "s" : "-"));

  it("dances to the songs, Drums and Space among them, sits in Space and through a set break, and stands through the rest", () => {
    const titles = ["Crowd", "Tuning", "Jack Straw", "Tuning", "Samson And Delilah", "Set Break", "Drums ->", "Space ->", "Crowd", "Encore Break"];
    expect(plan(titles)).toEqual(["--", "--", "d-", "--", "d-", "-s", "d-", "ds", "--", "--"]);
  });

  it("sits where set 2 starts through what is not a song just before it, and nowhere else between songs", () => {
    const titles = ["Tuning", "Jack Straw", "Tuning", "Deal", "Tuning", "Crowd", "Samson And Delilah", "Set Break", "Drums"];
    expect(plan(titles, 6)).toEqual(["--", "d-", "--", "d-", "-s", "-s", "d-", "--", "d-"]);
  });

  it("where set 2's start is unknown and no track is named a break, sits through the run nearest 45 % of the running time, 30 to 60 %", () => {
    // Tunings at 15 %, 40 % and 53 % of a 2,620 s show: the second sits, as it does where the notes open set 2 after it.
    const titles = ["Tuning", "Jack Straw", "Tuning", "Deal", "Promised Land", "Tuning", "Scarlet Begonias", "Tuning", "Fire On The Mountain"];
    const durations = [60, 300, 60, 300, 200, 240, 200, 60, 1200];
    const sits = ["--", "d-", "--", "d-", "d-", "-s", "d-", "--", "d-"];
    expect(plan(titles, null, durations)).toEqual(sits);
    expect(plan(titles, 6, durations)).toEqual(sits);
    // Nothing that is not a song falls between 30 and 60 %: nothing sits.
    expect(plan(titles, null, [60, 300, 60, 1200, 300, 240, 100, 60, 300])).toEqual(["--", "d-", "--", "d-", "d-", "--", "d-", "--", "d-"]);
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
  const OPTS = { keep: 4.2, reach: 4.07, hang: 2.65, lead: 1.1, step: 5.5, back: 3, space: 1.4, most: 9.1, passes: 4, ring: 2.85, top: 3.9,
    wide: 2.09, clear: 1.1, grade: 1.5, keeps: [] as number[][] };
  const bear = (x: number, z: number, fx: number, fz: number) => ({ feet: { x, z }, head: { x: x + 0.8 * fx, z: z + 0.8 * fz } });
  const where = (p: { offset: Float32Array }, i: number) => [placed[i].x + p.offset[4 * i], placed[i].z + p.offset[4 * i + 2]];

  it("makes room for a walk through the crowd at 12 m/s: steps aside at 5.5 m/s at most, keeps out of reach, stands on the ground, goes back", () => {
    const p = parting(placed, OPTS);
    // Out of the bear's reach and its own, or, standing still with its arms all the way down, out of the bear's reach and theirs.
    let nearestStill = Infinity;
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
        if (p.offset[4 * i + 3] >= 1 && p.rising[i] === 0) nearestStill = Math.min(nearestStill, Math.hypot(x - mx, z - mz));
        else nearest = Math.min(nearest, Math.hypot(x - mx, z - mz));
        ground = Math.max(ground, Math.abs(height(placed[i].x, placed[i].z) + p.offset[4 * i + 1] - height(x, z)));
        if (p.offset[4 * i] !== 0 || p.offset[4 * i + 2] !== 0) moved += 1;
      }
      last = Float32Array.from(p.offset);
    }
    expect(moved).toBeGreaterThan(0);
    expect(fastest).toBeLessThanOrEqual(5.5 + 1e-4);
    expect(fastest).toBeGreaterThan(5);
    expect(nearest).toBeGreaterThanOrEqual(4.07 - 1e-4);
    expect(nearestStill).toBeGreaterThanOrEqual(2.65 - 1e-4);
    expect(ground).toBeLessThan(1e-4);
    for (let k = 0; k < 300; k++) p.step(1 / 60, at(0).feet, at(0).head, false);
    expect([...p.offset].every((v) => v === 0)).toBe(true);
    expect([...p.rising].every((v) => v === 1)).toBe(true);
  });

  it("brings a still figure's arms down over a quarter second and up as slowly, turning them at most once each half second, and keeps them down through a dip", () => {
    const p = parting(placed, OPTS);
    const ux = -STAGE[0] / Math.hypot(...STAGE), uz = -STAGE[1] / Math.hypot(...STAGE);
    const at = (a: number) => bear(STAGE[0] + a * ux - 9 * uz, STAGE[1] + a * uz + 9 * ux, -ux, -uz);
    p.step(0, at(62).feet, at(62).head, false);
    // Each figure's arms: which way they last moved and when they turned; and, with them all the way down, frames whose stillness dips
    // under 1 but stays at a half or more.
    const way = new Int8Array(n), turned = new Float64Array(n).fill(-Infinity);
    let rose = Float32Array.from(p.rising), steepest = 0, down = 0, closest = Infinity, dips = 0, raisedInDip = 0, t = 0;
    for (let a = 62; a >= 0; a -= 0.2) {
      const v = at(a);
      p.step(1 / 60, v.feet, v.head, false);
      t += 1 / 60;
      for (let i = 0; i < n; i++) {
        const d = p.rising[i] - rose[i], w = p.offset[4 * i + 3];
        steepest = Math.max(steepest, Math.abs(d));
        if (d !== 0 && Math.sign(d) !== way[i]) { if (way[i] !== 0) closest = Math.min(closest, t - turned[i]); way[i] = Math.sign(d); turned[i] = t; }
        if (rose[i] === 0 && w >= 0.5 && w < 1) { dips += 1; if (p.rising[i] > 0) raisedInDip += 1; }
        if (p.rising[i] === 0) down += 1;
      }
      rose = Float32Array.from(p.rising);
    }
    expect(down).toBeGreaterThan(0);
    expect(steepest).toBeLessThanOrEqual(1 / 60 / 0.25 + 1e-6);
    expect(closest).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(dips).toBeGreaterThan(0);
    expect(raisedInDip).toBe(0);
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
    // A figure at its seat within 2.35 m of one that stepped 0.25 m aside stands still, and so does any within 5.07 m (the reach and a
    // metre) of the visitor's middle; one 2.85 m from every figure off its seat and past that dances.
    const apart = (i: number, j: number) => Math.hypot(where(p, i)[0] - where(p, j)[0], where(p, i)[1] - where(p, j)[1]);
    const from = (i: number, of: number[]) => Math.min(...of.map((j) => apart(i, j)));
    const middle = (i: number) => Math.hypot(where(p, i)[0] - (v.feet.x + v.head.x) / 2, where(p, i)[1] - (v.feet.z + v.head.z) / 2);
    for (const i of all) if (off(i) === 0 && from(i, aside) < 2.35) expect(still(i)).toBe(1);
    for (const i of all) if (middle(i) < 5.07) expect(still(i)).toBe(1);
    for (const i of all) if (off(i) === 0 && from(i, moved) >= 2.85 && middle(i) >= 5.07) expect(still(i)).toBe(0);
  });

  it("makes room through a turn across the front rows: no step past the visitor's own, none in what it keeps clear of, out of reach", () => {
    // Along the front, 17 m from the stage's centre, at 12 m/s, the stage's solids and a hand kept clear (13.04 m), the walker held as
    // main.js holds it.
    const p = parting(placed, { ...OPTS, keeps: [[STAGE[0], STAGE[1], 13.04]] });
    const ux = Math.sin(FACING), uz = Math.cos(FACING), nx = uz, nz = -ux;
    const walker = { x: STAGE[0] + 17 * ux - 26 * nx, z: STAGE[1] + 17 * uz - 26 * nz, heading: Math.atan2(-nx, -nz) };
    const middle = () => [walker.x - 0.4 * Math.sin(walker.heading), walker.z - 0.4 * Math.cos(walker.heading)];
    const visitor = () => bear(walker.x, walker.z, -Math.sin(walker.heading), -Math.cos(walker.heading));
    p.step(0, visitor().feet, visitor().head, false);
    let last = Float32Array.from(p.offset), [lx, lz] = middle(), worst = 0, inside = 0, nearest = Infinity, nearestStill = Infinity, moved = 0;
    for (let f = 0; f < 240; f++) {
      walker.x -= Math.sin(walker.heading) * 0.2; walker.z -= Math.cos(walker.heading) * 0.2;
      p.hold(walker);
      const v = visitor(), [mx, mz] = middle();
      p.step(1 / 60, v.feet, v.head, false);
      const visitorStep = Math.hypot(mx - lx, mz - lz);
      for (let i = 0; i < n; i++) {
        const [x, z] = where(p, i), d = Math.hypot(x - mx, z - mz);
        worst = Math.max(worst, Math.hypot(p.offset[4 * i] - last[4 * i], p.offset[4 * i + 2] - last[4 * i + 2]) - visitorStep);
        if (p.offset[4 * i] === 0 && p.offset[4 * i + 2] === 0) continue;
        moved += 1;
        inside = Math.max(inside, 13.04 - Math.hypot(x - STAGE[0], z - STAGE[1]));
        if (p.offset[4 * i + 3] >= 1 && p.rising[i] === 0) nearestStill = Math.min(nearestStill, d); else nearest = Math.min(nearest, d);
      }
      last = Float32Array.from(p.offset); [lx, lz] = [mx, mz];
    }
    expect(moved).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(1e-6);
    expect(inside).toBeLessThanOrEqual(1e-3);
    expect(nearest).toBeGreaterThanOrEqual(4.07 - 1e-4);
    expect(nearestStill).toBeGreaterThanOrEqual(2.65 - 1e-4);
  });

  it("holds the visitor's walker back from a figure standing still, to the bear's reach and the figure's hanging arms", () => {
    const s = { x: 70, z: -60 }, p = parting([s], OPTS);
    // The visitor stands 3 m from the figure, which steps aside and stands still; a walker 1 m from it is held 2.65 m off.
    p.step(1 / 60, { x: s.x - 3.4, z: s.z }, { x: s.x - 2.6, z: s.z }, true);
    expect(p.offset[3]).toBe(1);
    const fx = s.x + p.offset[0], fz = s.z + p.offset[2], walker = { x: fx - 1.4, z: fz, heading: -Math.PI / 2 };
    p.hold(walker);
    expect(Math.hypot(walker.x - 0.4 * Math.sin(walker.heading) - fx, walker.z - 0.4 * Math.cos(walker.heading) - fz)).toBeCloseTo(2.65, 6);
  });

  it("stands still a figure within a metre past the reach of the visitor's middle that did not move", () => {
    // The visitor faces +x; one figure 2.6 m ahead steps aside, and one 4.6 m to their side, out of the room and 9 m from the first,
    // stays at its seat, still.
    const p = parting([{ x: 73, z: -60 }, { x: 70.4, z: -64.6 }], OPTS);
    p.step(1 / 60, { x: 70, z: -60 }, { x: 70.8, z: -60 }, true);
    expect(Math.hypot(p.offset[0], p.offset[2])).toBeGreaterThan(0.25);
    expect([p.offset[4], p.offset[6], p.offset[7]]).toEqual([0, 0, 1]);
  });

  it("raises a camera 1.1 m over the highest a figure reaches, out to its reach and 1.1 m, then 1.5 m lower each metre, however far", () => {
    const s = { x: 70, z: -60 }, h = height(s.x, s.z), p = parting([s], OPTS), top = h + 3.9 + 1.1;
    const raised = (x: number, z: number, y = h + 1.2) => { const point = { x, y, z }; p.over(point); return point.y; };
    expect(raised(s.x + 3.18, s.z)).toBe(top);
    expect(raised(s.x, s.z + 4.19)).toBeCloseTo(top - 1.5, 9);
    expect(raised(s.x + 5.8, s.z)).toBe(h + 1.2);
    // A camera far below the figure: the slope reaches it 10 m out, with nothing cut off.
    expect(raised(s.x - 10, s.z, h - 10)).toBeCloseTo(top - 1.5 * (10 - 3.19), 9);
    expect(raised(s.x - 20, s.z, h - 10)).toBe(h - 10);
    expect(raised(s.x, s.z, top + 1)).toBe(top + 1);
  });

  it("says how far a camera should climb now to stand as high as a figure asks when its way reaches it, and the most it asks on the way", () => {
    // On level ground 1.2 m off it, 10 m short of the figure and closing at 10 m/s, read 20 times over 2 s and climbing at 3 m/s: 0.7 s on
    // it is 3 m out, within the figure's reach and 1.1 m, where the figure asks 5 m over its feet, 3.8 m above it, of which 2.1 m is climbed.
    const s = { x: 78, z: -60 }, h = height(s.x, s.z), p = parting([s], OPTS), camera = { x: s.x - 10, y: h + 1.2, z: s.z };
    expect(height(camera.x, camera.z)).toBe(h);
    const way = Float64Array.of(10, 0, 0, 2, 20, 3, 0, 0);
    p.ahead(camera, way);
    expect(way[6]).toBeCloseTo(1.7, 9);
    expect(way[7]).toBeCloseTo(3.8, 9);
    way[0] = -10;
    p.ahead(camera, way);
    expect(way[6]).toBe(0);
    expect(way[7]).toBe(0);
  });

  it("reads the camera along its way as high over the ground as it stands, where the ground falls away under it", () => {
    // Walking level toward a figure on the terrace below: by the time it passes the figure it stands 1.2 m over the terrace, as now.
    const s = { x: 66, z: -60 }, p = parting([s], OPTS), from = { x: 56, z: -60 }, below = height(from.x, from.z) - height(s.x, s.z);
    expect(below).toBeGreaterThan(0.5);
    const camera = { x: from.x, y: height(from.x, from.z) + 1.2, z: from.z }, way = Float64Array.of(10, 0, 0, 2, 20, 3, 0, 0);
    p.ahead(camera, way);
    const there = { x: s.x, y: height(s.x, s.z) + 1.2, z: s.z }, asked = there.y;
    p.over(there);
    // As the camera will stand there, to the few centimetres the ground's table reads between its points.
    expect(way[7]).toBeGreaterThan(there.y - asked - 0.05);
  });

  it("reads a figure that stepped aside at its seat as well, which it goes back to", () => {
    const s = { x: 78, z: -60 }, h = height(s.x, s.z), camera = { x: s.x - 10, y: h + 1.2, z: s.z };
    // The visitor faces across the camera's way, so the figure steps off the way.
    const parted = parting([s], OPTS), v = bear(s.x, s.z, 0, 1);
    parted.step(0.05, v.feet, v.head, true);
    expect(Math.abs(parted.offset[2])).toBeGreaterThan(2);
    const atSeat = Float64Array.of(10, 0, 0, 2, 20, 3, 0, 0), aside = Float64Array.from(atSeat);
    parting([s], OPTS).ahead(camera, atSeat);
    parted.ahead(camera, aside);
    expect(aside[6]).toBeGreaterThanOrEqual(atSeat[6] - 1e-9);
    expect(aside[7]).toBeGreaterThanOrEqual(atSeat[7] - 1e-9);
  });
});
