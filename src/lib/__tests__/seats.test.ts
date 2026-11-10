import { describe, expect, it } from "vitest";
import { FACING, STAGE } from "../../../public/world/ground.js";
import { crowdPlan, seats } from "../../../public/world/seats.js";

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
  it("dances to the songs, Drums and Space among them, sits in Space and through a set break, and stands through the rest", () => {
    const titles = ["Tuning", "Jack Straw", "Tuning", "Samson And Delilah", "Set Break", "Drums ->", "Space ->", "Crowd", "Encore Break"];
    expect((crowdPlan(titles) as Plan[]).map(({ dance, sit }) => (dance ? "d" : "-") + (sit ? "s" : "-"))).toEqual(
      ["--", "d-", "-s", "d-", "-s", "d-", "ds", "--", "--"],
    );
  });
});
