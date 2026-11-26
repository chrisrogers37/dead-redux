import { describe, expect, it } from "vitest";
import { DROP, FEET, FOOT, HANG, partingOptions, TALL } from "../../../public/world/crowd.js";
import { AMONG_POSE, FACING, height, STAGE, STAGE_COLUMN, STAGE_POSE } from "../../../public/world/ground.js";
import { budgetFor } from "../../../public/world/quality.js";
import {
  across, AISLE, AMONG_KEEP, APART, BANDS, BLANKET_TONES, CLEARING, COUNT, crowdPlan, FULL, fromStage, gathering, GROUPS_APART, GROUPS_FROM, GROUPS_TO,
  intoAisle, intoCrowdGround, isBetweenSongs, isDrums, isNotASong, isSpace, isTuning, LATTICE, LEGS, NEXT, OFF, offAxis, onAxes, onCrowdGround, parting,
  PERSON, RISE, RISE_AT, riseAhead, seats, songsOf, SPANS, STOOD, THIN, toStage, wholeGroups,
} from "../../../public/world/seats.js";

type Seat = { x: number; z: number; r: number; sit: boolean; face: number; blanket: number; group: number };
type Blanket = { x: number; z: number; face: number; wide: number; deep: number; tone: number; rim: number };
type Gathered = { seats: Seat[]; blankets: Blanket[]; aisle: number[][]; groups: { kind: string; seats: number[] }[] };
type Plan = { dance: boolean; sit: boolean };
type Point = [number, number];

const none = { path: [], line: [], landmarks: [] };
// A point `r` metres from the stage's centre and `th` radians off its axis, as the seats are laid out.
const at = fromStage as (r: number, th: number) => Point;
const nearest = (seat: Seat, points: Point[]) => Math.min(...points.map(([x, z]) => Math.hypot(seat.x - x, seat.z - z)));

describe("seats", () => {
  it("leaves out whole every group any of whose people stand within 4 m of the path or the bears' line, or 1.5 m of a landmark's circle, and no one else", () => {
    // The path runs up the crowd's axis and the bears' line across its middle, both every half metre, and a landmark's circle 6 m round
    // stands among the sitters.
    const path = Array.from({ length: 101 }, (_, i) => at(10 + i / 2, 0));
    const line = Array.from({ length: 101 }, (_, i) => at(35, -1 + i / 50));
    const landmark = at(48, 0.4);
    for (const seed of [0, 800]) {
      const kept = seats({ path, line, landmarks: [[...landmark, 6]] }, seed);
      const clear = (s: Seat) => nearest(s, path) >= 4 && nearest(s, line) >= 4 && nearest(s, [landmark]) >= 7.5;
      const all = seats(none, seed) as Seat[], cut = new Set(all.filter((s) => !clear(s)).map((s) => s.group));
      expect(cut.size).toBeGreaterThan(0);
      // Some of a cut group stood clear: the whole group goes, those too.
      expect(all.some((s) => cut.has(s.group) && clear(s))).toBe(true);
      expect(kept).toEqual(all.filter((s) => !cut.has(s.group)));
    }
  });

  it("takes whole groups for a smaller crowd, in the gathering's order: the most of its first seats that are whole groups and no more than asked", () => {
    for (const seed of [0, 800]) {
      const all = seats(none, seed) as Seat[], sizes = new Map<number, number>();
      for (const s of all) sizes.set(s.group, (sizes.get(s.group) ?? 0) + 1);
      for (let count = 0; count <= COUNT + 5; count++) {
        const some = seats(none, seed, count) as Seat[], held = new Map<number, number>();
        for (const s of some) held.set(s.group, (held.get(s.group) ?? 0) + 1);
        // The first of the day's seats, no more than asked, every group of them whole, and the next group would not have fitted.
        expect(some).toEqual(all.slice(0, some.length));
        expect([seed, count, some.length <= count, [...held].every(([g, n]) => n === sizes.get(g))]).toEqual([seed, count, true, true]);
        if (some.length < all.length) expect([seed, count, some.length + sizes.get(all[some.length].group)! > count]).toEqual([seed, count, true]);
        expect(wholeGroups(all, count)).toBe(some.length);
      }
    }
  }, 30000);

  it("are the day's gathering, each seat as it stands there, the same for a day every time and another the next day", () => {
    const strip = ({ x, z, r, sit, face, blanket, group }: Seat) => ({ x, z, r, sit, face, blanket, group });
    expect(seats(none, 800)).toEqual((gathering(800) as Gathered).seats.map(strip));
    expect(seats(none)).toEqual(seats(none, 0));
    // The same seed, asked again after another, gives the same gathering.
    const first = JSON.stringify(gathering(800));
    gathering(3);
    expect(JSON.stringify(gathering(800))).toBe(first);
    // Another day's stands elsewhere: of one day's people, nearly none has another's seat to within 10 cm.
    const a = (gathering(0) as Gathered).seats.map(strip), b = (gathering(1) as Gathered).seats.map(strip);
    expect(a.filter((s) => b.some((t) => Math.hypot(s.x - t.x, s.z - t.z) < 0.1)).length).toBeLessThan(10);
  }, 30000);
});

describe("the gathering", () => {
  // Fifty days' gatherings and the fixed day's (seed 800).
  const days = [...Array.from({ length: 50 }, (_, k) => k), 800].map((seed) => ({ seed, g: gathering(seed) as Gathered }));
  // And each as every tier draws it: all COUNT on a desktop, and whole groups of the first a TV's and a phone's crowd take (crowd.js
  // seats(), quality.js BUDGETS), as `n`. The shape, the rings and ?pose=among's company hold at each.
  const TIERS = [COUNT as number, ...["tv", "phone"].map((tier) => (budgetFor(tier) as { crowd: number }).crowd)];
  const tierOf = (g: Gathered, n: number): Gathered => {
    const k = wholeGroups(g.seats, n) as number;
    return { ...g, seats: g.seats.slice(0, k), groups: g.groups.filter((group) => group.seats[0] < k) };
  };
  const tiers = days.flatMap(({ seed, g }) => TIERS.map((n) => ({ seed, n, g: tierOf(g, n) })));
  const frame = (x: number, z: number): Point => [(x - STAGE[0]) * Math.sin(FACING) + (z - STAGE[1]) * Math.cos(FACING), across(x, z) as number];
  const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  const middleOf = (list: Seat[]) => [list.reduce((sum, s) => sum + s.x, 0) / list.length, list.reduce((sum, s) => sum + s.z, 0) / list.length];
  // How far a point lies inside a blanket, less than nothing outside it.
  const inBlanket = (b: Blanket, x: number, z: number) => {
    const dx = x - b.x, dz = z - b.z;
    return Math.min(b.wide / 2 - Math.abs(dx * Math.cos(b.face) - dz * Math.sin(b.face)), b.deep / 2 - Math.abs(dx * Math.sin(b.face) + dz * Math.cos(b.face)));
  };

  // The tests below read some of these and hold the gathering to what they make of them; these hold the values themselves.
  it("keeps the values its look was judged at, by the frames and the flash counts: a change to any is a change to the look, to be shot and counted again", () => {
    expect({ COUNT, APART, LEGS, NEXT, GROUPS_APART, GROUPS_FROM, GROUPS_TO, RISE, RISE_AT, OFF, CLEARING, AMONG_KEEP, BANDS, THIN, LATTICE, FULL, BLANKET_TONES }).toEqual({
      COUNT: 292, APART: 1.34, LEGS: 1.04, NEXT: [1.345, 1.385], GROUPS_APART: [1.5, 1.8], GROUPS_FROM: 20, GROUPS_TO: 34, RISE: 0.28, RISE_AT: [0.35, 0.7],
      OFF: 4.5, CLEARING: [5, 8], AMONG_KEEP: [3, 3], BANDS: [22, 28, 34, 40, Infinity], THIN: 12, LATTICE: 1, FULL: 8, BLANKET_TONES: 7,
    });
    expect(AISLE).toEqual({ from: 11, to: 58, front: [0.9, 1.5], back: [5.5, 8], half: [2.5, 3.2] });
  });

  it("seats COUNT people every day, each on the crowd's ground, 40 cm in from its rim or more, and off the aisle", () => {
    for (const { seed, g } of days) {
      expect([seed, g.seats.length]).toEqual([seed, COUNT]);
      for (const s of g.seats) {
        expect([seed, onCrowdGround(s.x, s.z), intoCrowdGround(s.x, s.z) >= 0.4]).toEqual([seed, true, true]);
        expect([seed, intoAisle(g.aisle, ...frame(s.x, s.z)) <= 0]).toEqual([seed, true]);
        expect(s.r).toBeCloseTo(Math.hypot(s.x - STAGE[0], s.z - STAGE[1]), 9);
      }
    }
  });

  it("stands no two people nearer than a person, and no one in a seated person's legs: APART is two standing figures' reach with their arms hanging, LEGS a seated one's feet", () => {
    // The largest figure's reaches, as crowd.js stands it: PERSON tall and 8 % more.
    const big = (PERSON / TALL) * 1.08;
    expect(APART).toBeGreaterThanOrEqual(2 * HANG * big);
    expect(LEGS).toBeGreaterThanOrEqual(FEET * big);
    let least = Infinity, inLegs = 0;
    for (const { g } of days) {
      const s = g.seats;
      for (let i = 0; i < s.length; i++) for (let j = 0; j < s.length; j++) {
        if (i === j) continue;
        if (i < j) least = Math.min(least, Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z));
        if (!s[i].sit) continue;
        // The line from a seated figure's seat out to its feet, LEGS ahead the way it faces, and how near the other comes to it.
        const fx = Math.sin(s[i].face), fz = Math.cos(s[i].face), t = Math.max(0, Math.min(LEGS, (s[j].x - s[i].x) * fx + (s[j].z - s[i].z) * fz));
        if (Math.hypot(s[j].x - s[i].x - t * fx, s[j].z - s[i].z - t * fz) < APART / 2) inLegs += 1;
      }
    }
    expect(least).toBeGreaterThanOrEqual(APART - 1e-9);
    expect(inLegs).toBe(0);
  });

  it("leaves an aisle open end to end: a winding way up from the stage's front to past the back, no one within its half-width of its middle, which ?pose=stage stands in", () => {
    const { from, to, front, back, half } = AISLE as { from: number; to: number; front: number[]; back: number[]; half: number[] };
    const pose = frame(STAGE_POSE.x, STAGE_POSE.z);
    for (const { seed, g } of days) {
      const line = g.aisle;
      // From the stage's front to past the crowd's back, a point every half metre, its half-width within AISLE's.
      expect([seed, line[0][0], line[line.length - 1][0]]).toEqual([seed, from, to]);
      for (let k = 1; k < line.length; k++) expect(line[k][0] - line[k - 1][0]).toBeCloseTo(0.5, 9);
      for (const [, , h] of line) expect([seed, h >= half[0] && h <= half[1]]).toEqual([seed, true]);
      // It winds: it bows to one side of the stage's axis before ?pose=stage and to the other past it, and is on the axis there.
      const before = line.filter(([u]) => u < pose[0]).map(([, side]) => side), after = line.filter(([u]) => u > pose[0]).map(([, side]) => side);
      const bow = (sides: number[]) => sides.reduce((most, side) => (Math.abs(side) > Math.abs(most) ? side : most), 0);
      expect([seed, Math.abs(bow(before)) >= front[0] - 0.01, Math.abs(bow(after)) >= back[0] - 0.01, Math.sign(bow(before)) === -Math.sign(bow(after))]).toEqual([seed, true, true, true]);
      expect([seed, Math.abs(bow(before)) <= front[1], Math.abs(bow(after)) <= back[1]]).toEqual([seed, true, true]);
      // Open from end to end: walking its middle every 25 cm, no one stands within its half-width there.
      for (let k = 1; k < line.length; k++) for (let t = 0; t < 1; t += 0.5) {
        const u = line[k - 1][0] + t * (line[k][0] - line[k - 1][0]), side = line[k - 1][1] + t * (line[k][1] - line[k - 1][1]), h = line[k - 1][2] + t * (line[k][2] - line[k - 1][2]);
        const [x, z] = onAxes(u, side) as Point;
        expect([seed, u, g.seats.every((s) => Math.hypot(s.x - x, s.z - z) >= h - 1e-6)]).toEqual([seed, u, true]);
      }
      // ?pose=stage stands well inside it, and the walk from there down the axis to the stage's front passes no one within half of
      // APART.
      expect([seed, intoAisle(line, ...pose) > 2]).toEqual([seed, true]);
      for (let u = from; u <= pose[0]; u += 0.25) {
        const [x, z] = onAxes(u, 0) as Point;
        expect([seed, u, g.seats.every((s) => Math.hypot(s.x - x, s.z - z) >= APART / 2)]).toEqual([seed, u, true]);
      }
    }
  });

  it("reads how far a point lies in the aisle from the stretches of its middle that could be nearest, as reading every stretch does", () => {
    // Every stretch, as intoAisle once read them all: its half-width less the point's distance, at the stretch's nearest point.
    const every = (line: number[][], along: number, side: number) => {
      let most = -Infinity;
      for (let k = 0; k + 1 < line.length; k++) {
        const [u0, s0, h0] = line[k], [u1, s1, h1] = line[k + 1], du = u1 - u0, ds = s1 - s0;
        const t = Math.max(0, Math.min(1, ((along - u0) * du + (side - s0) * ds) / (du * du + ds * ds)));
        most = Math.max(most, h0 + (h1 - h0) * t - Math.hypot(along - u0 - t * du, side - s0 - t * ds));
      }
      return most;
    };
    // Points over the crowd's ground and past its ends and sides, in and out of the aisle, on ten days.
    let a = 12345;
    const next = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const { seed, g } of days.slice(0, 10)) for (let k = 0; k < 2000; k++) {
      const along = -5 + 75 * next(), side = k % 2 ? -30 + 60 * next() : -5 + 10 * next();
      expect([seed, along, side, intoAisle(g.aisle, along, side)]).toEqual([seed, along, side, every(g.aisle, along, side)]);
    }
  });

  it("gathers in groups, not rows: clumps of two to six turned toward each other, a drum circle and a hacky-sack ring facing in on either side of the aisle, and some turned away from the stage, as every tier draws it", () => {
    let inClumps = 0, turnedIn = 0;
    for (const { seed, n, g } of tiers) {
      const of = (kind: string) => g.groups.filter((group) => group.kind === kind);
      // Every seat is in one group, and each group's people come one after another.
      expect(g.groups.flatMap((group) => group.seats).sort((a, b) => a - b)).toEqual(g.seats.map((_, i) => i));
      for (const group of g.groups) group.seats.forEach((i, k) => expect(i).toBe(group.seats[0] + k));
      // Clumps of two to six, many of them (a tenth as many as the tier's people), each within a couple of metres of its middle; and
      // in those of three or more, each turned from the stage toward the clump's middle.
      expect([seed, n, of("clump").length >= n / 10]).toEqual([seed, n, true]);
      for (const clump of of("clump")) {
        const people = clump.seats.map((i) => g.seats[i]), [mx, mz] = middleOf(people);
        expect([seed, people.length >= 2 && people.length <= 6]).toEqual([seed, true]);
        for (const s of people) expect(Math.hypot(s.x - mx, s.z - mz)).toBeLessThan(2.5);
        if (people.length < 3) continue;
        for (const s of people) {
          const toMiddle = Math.atan2(mx - s.x, mz - s.z);
          inClumps += 1;
          if (Math.abs(wrap(s.face - toMiddle)) < Math.abs(wrap(toStage(s.x, s.z) - toMiddle))) turnedIn += 1;
        }
      }
      // One drum circle of seven to nine, and one or two hacky-sack rings of four or five, each a ring facing its middle, its people
      // evenly round it; the drums on one side of the stage's axis and a sack ring on the other.
      const rings = [...of("drums"), ...of("sack")].map((ring) => ({ kind: ring.kind, people: ring.seats.map((i) => g.seats[i]) }));
      expect([seed, n, of("drums").length, of("sack").length >= 1 && of("sack").length <= 2]).toEqual([seed, n, 1, true]);
      for (const { kind, people } of rings) {
        const [mx, mz] = middleOf(people), radii = people.map((s) => Math.hypot(s.x - mx, s.z - mz));
        expect([seed, kind, kind === "drums" ? people.length >= 7 && people.length <= 9 : people.length >= 4 && people.length <= 5]).toEqual([seed, kind, true]);
        expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.1);
        for (const s of people) expect(Math.abs(wrap(s.face - Math.atan2(mx - s.x, mz - s.z)))).toBeLessThanOrEqual(0.31);
      }
      const sideOf = (people: Seat[]) => Math.sign(across(...middleOf(people)));
      const drums = rings.find((ring) => ring.kind === "drums")!;
      expect([seed, n, rings.some((ring) => ring.kind === "sack" && sideOf(ring.people) === -sideOf(drums.people))]).toEqual([seed, n, true]);
      // Some face more than a right angle away from the stage, a ring's far side among them, and most do not.
      const away = g.seats.filter((s) => Math.abs(wrap(s.face - toStage(s.x, s.z))) > Math.PI / 2).length;
      expect([seed, n, away >= 10, away <= 0.2 * n]).toEqual([seed, n, true, true]);
    }
    expect(turnedIn).toBeGreaterThan(0.8 * inClumps);
  }, 30000);

  it("stands each group's people together, each within the parting's space of another, so it parts as one, and other groups off: GROUPS_APART at the front, wider up the hill", () => {
    const { space } = partingOptions(PERSON / TALL) as { space: number };
    const [least, most] = NEXT as number[], [front, back] = GROUPS_APART as number[];
    expect(least).toBeGreaterThanOrEqual(APART);
    expect(most).toBeLessThan(space);
    const apartAt = (r: number) => front + (back - front) * Math.min(1, Math.max(0, (r - (GROUPS_FROM as number)) / ((GROUPS_TO as number) - (GROUPS_FROM as number))));
    for (const { seed, g } of days) {
      const groupOf = new Map<number, number>();
      g.groups.forEach((group, k) => group.seats.forEach((i) => groupOf.set(i, k)));
      for (const group of g.groups) {
        if (group.kind === "blanket" || group.seats.length < 2) continue;
        // Held together: from its first, every one is reached a step under `space` at a time.
        const reached = [group.seats[0]];
        for (let k = 0; k < reached.length; k++) for (const i of group.seats) {
          const a = g.seats[i], b = g.seats[reached[k]];
          if (!reached.includes(i) && Math.hypot(a.x - b.x, a.z - b.z) < space) reached.push(i);
        }
        expect([seed, group.kind, reached.length]).toEqual([seed, group.kind, group.seats.length]);
      }
      // Two of different groups stand no nearer than the gap at the nearer of the two to the stage.
      const near: number[][] = [];
      for (let i = 0; i < g.seats.length; i++) for (let j = i + 1; j < g.seats.length; j++) {
        const a = g.seats[i], b = g.seats[j];
        if (groupOf.get(i) !== groupOf.get(j) && Math.hypot(a.x - b.x, a.z - b.z) < apartAt(Math.min(a.r, b.r)) - 1e-9) near.push([i, j]);
      }
      expect([seed, near]).toEqual([seed, []]);
    }
  });

  it("is no mirror image of itself across the stage's axis: hardly any seat has a twin where its mirror image would stand, at every tier", () => {
    for (const { seed, n, g } of tiers) {
      const twins = g.seats.filter((s) => {
        const [u, side] = frame(s.x, s.z), [mx, mz] = onAxes(u, -side) as Point;
        return g.seats.some((t) => Math.hypot(t.x - mx, t.z - mz) < 0.3);
      }).length;
      expect([seed, n, twins < 0.15 * n]).toEqual([seed, n, true]);
    }
  }, 30000);

  it("stands thickest before the stage and thins up the hill to a ragged edge, which leaves three tenths or more of its ground's outer rim empty, at every tier", () => {
    // The crowd's ground, every half metre, by bands out from the stage.
    const ground: Point[] = [];
    for (let x = -10; x <= 140; x += 0.5) for (let z = -130; z <= 10; z += 0.5) if (onCrowdGround(x, z)) ground.push([x, z]);
    const OUT = [[13.5, 22], [22, 28], [28, 34], [34, 40], [40, 55]], far = (x: number, z: number) => Math.hypot(x - STAGE[0], z - STAGE[1]);
    const area = OUT.map(([a, b]) => ground.filter(([x, z]) => far(x, z) >= a && far(x, z) < b).length * 0.25);
    // The outer rim: the ground within 3 m of its edge, but for the front, which the crowd packs up to, from 22 m out.
    const rim = ground.filter(([x, z]) => intoCrowdGround(x, z) < 3 && far(x, z) >= 22);
    const sums = new Map(TIERS.map((n) => [n, OUT.map(() => 0)]));
    for (const { seed, n, g } of tiers) {
      const thick = OUT.map(([a, b], k) => g.seats.filter((s) => s.r >= a && s.r < b).length / area[k]);
      thick.forEach((t, k) => { sums.get(n)![k] += t; });
      // Thicker at the front than anywhere from 28 m out, and at the back under 0.6 as thick. Between, a knot of the gathering may
      // stand as thick as its front on a day: it is patchy, at tens of metres, as well as lopsided.
      for (let k = 2; k < OUT.length; k++) expect([seed, n, k, thick[0] > thick[k]]).toEqual([seed, n, k, true]);
      expect([seed, n, thick[4] < 0.6 * thick[0]]).toEqual([seed, n, true]);
      // The rim: three tenths or more of it lies 3 m and more from anyone, and some on each side of the axis, the side the gathering
      // spills round to as well.
      const empty = (own: Point[]) => own.filter(([x, z]) => !g.seats.some((s) => Math.hypot(s.x - x, s.z - z) < 3)).length;
      expect([seed, n, empty(rim) > 0.3 * rim.length]).toEqual([seed, n, true]);
      for (const side of [1, -1]) {
        const own = rim.filter(([x, z]) => Math.sign(across(x, z)) === side);
        expect([seed, n, side, empty(own) > own.length / 20]).toEqual([seed, n, side, true]);
      }
    }
    // Over the days, each band thinner than the one before by 15 % and more, at each tier.
    for (const [n, sum] of sums) for (let k = 1; k < OUT.length; k++) expect([n, k, sum[k] < 0.85 * sum[k - 1]]).toEqual([n, k, true]);
  }, 60000);

  it("is lopsided: one side of the stage's axis holds half as many again as the other, and at 8 m squares a quarter of its people have no one where their mirror images would stand, at every tier", () => {
    for (const { seed, n, g } of tiers) {
      const right = g.seats.filter((s) => across(s.x, s.z) >= 0).length, left = g.seats.length - right;
      expect([seed, n, Math.max(left, right) >= 1.5 * Math.min(left, right)]).toEqual([seed, n, true]);
      // Those in each 8 m square of the stage's frame, against those in its mirror image across the axis.
      const square = new Map<string, number>(), key = (a: number, b: number) => `${a},${b}`;
      for (const s of g.seats) {
        const [u, v] = frame(s.x, s.z), k = key(Math.floor(u / 8), Math.floor(v / 8));
        square.set(k, (square.get(k) ?? 0) + 1);
      }
      let unmirrored = 0;
      for (const [k, n] of square) {
        const [a, b] = k.split(",").map(Number);
        unmirrored += Math.max(0, n - (square.get(key(a, -b - 1)) ?? 0));
      }
      expect([seed, n, unmirrored >= 0.25 * n]).toEqual([seed, n, true]);
    }
  }, 30000);

  it("bends its aisle well off the stage's axis: somewhere up the hill its middle strays 5 m and more to one side, the same aisle at every tier", () => {
    // Every tier treads the day's whole aisle into the grass (crowd.js hands the island the gathering's aisle, whatever it draws).
    for (const { seed, g } of tiers) expect([seed, Math.max(...g.aisle.map(([, middle]) => Math.abs(middle))) >= 5]).toEqual([seed, true]);
  });

  it("stands some apart, with grass between: three knots and more of two to twelve 4 m and more from anyone else, the drum circle and the sack ring among them; and leaves clearings in it several metres across, at every tier", () => {
    for (const { seed, n, g } of tiers) {
      // Knots: those who stand within 4 m of each other, one to the next.
      const knot = g.seats.map((_, i) => i), root = (i: number): number => (knot[i] === i ? i : (knot[i] = root(knot[i])));
      for (let i = 0; i < g.seats.length; i++) for (let j = i + 1; j < g.seats.length; j++) {
        if (Math.hypot(g.seats[i].x - g.seats[j].x, g.seats[i].z - g.seats[j].z) < 4) knot[root(i)] = root(j);
      }
      const size = new Map<number, number>();
      g.seats.forEach((_, i) => size.set(root(i), (size.get(root(i)) ?? 0) + 1));
      expect([seed, n, [...size.values()].filter((m) => m >= 2 && m <= 12).length >= 3]).toEqual([seed, n, true]);
      const rings = g.groups.filter((group) => group.kind === "drums" || group.kind === "sack");
      expect([seed, n, rings.map((ring) => ring.kind).sort()]).toEqual([seed, n, ["drums", "sack"]]);
      for (const ring of rings) {
        expect([seed, n, ring.kind, size.get(root(ring.seats[0]))]).toEqual([seed, n, ring.kind, ring.seats.length]);
        for (const i of ring.seats) expect(root(i)).toBe(root(ring.seats[0]));
      }
      // Clearings: spots 20 to 45 m out with no one within 3 m and someone within 8 m on every side, 6 m and more apart.
      const clearings: Point[] = [];
      for (let u = 20; u <= 45; u += 1) for (let v = -35; v <= 35; v += 1) {
        const [x, z] = onAxes(u, v) as Point;
        if (!onCrowdGround(x, z) || g.seats.some((s) => Math.hypot(s.x - x, s.z - z) < 3)) continue;
        const sides = new Set(g.seats.filter((s) => Math.hypot(s.x - x, s.z - z) < 8).map((s) => (s.x >= x ? 1 : 0) + (s.z >= z ? 2 : 0)));
        if (sides.size === 4 && clearings.every(([a, b]) => Math.hypot(a - x, b - z) > 6)) clearings.push([x, z]);
      }
      expect([seed, n, clearings.length >= 5]).toEqual([seed, n, true]);
    }
  }, 60000);

  it("sits groups on blankets: two to five on each, facing its way, on the crowd's ground and off the aisle, apart from the others, with no one standing on one", () => {
    let sitting = 0;
    for (const { seed, g } of days) {
      expect([seed, g.blankets.length >= 4]).toEqual([seed, true]);
      g.blankets.forEach((b, k) => {
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [b.x + (i * b.wide * Math.cos(b.face)) / 2 + (j * b.deep * Math.sin(b.face)) / 2, b.z - (i * b.wide * Math.sin(b.face)) / 2 + (j * b.deep * Math.cos(b.face)) / 2] as Point);
        for (const [x, z] of corners) expect([seed, k, onCrowdGround(x, z)]).toEqual([seed, k, true]);
        // Off the aisle all round its edge, every 10 cm.
        const edge = corners.flatMap(([x, z], c) => {
          const [nx, nz] = corners[(c + 1) % 4], n = Math.ceil(Math.hypot(nx - x, nz - z) / 0.1);
          return Array.from({ length: n }, (_, t) => [x + ((nx - x) * t) / n, z + ((nz - z) * t) / n] as Point);
        });
        expect([seed, k, edge.filter(([x, z]) => intoAisle(g.aisle, ...frame(x, z)) >= 0)]).toEqual([seed, k, []]);
        expect(Number.isInteger(b.tone) && b.tone >= 0 && b.tone < BLANKET_TONES).toBe(true);
        expect(Number.isInteger(b.rim) && b.rim >= 0 && b.rim < BLANKET_TONES).toBe(true);
        const on = g.seats.filter((s) => s.blanket === k);
        expect([seed, k, on.length >= 2 && on.length <= 5]).toEqual([seed, k, true]);
        for (const s of on) {
          expect([seed, k, s.sit, inBlanket(b, s.x, s.z) >= 0.3]).toEqual([seed, k, true, true]);
          // Facing its way, turned no further than the hill makes it, or across it, two facing each other.
          const off = Math.abs(wrap(s.face - b.face));
          expect([seed, k, off <= 0.65 || Math.abs(off - Math.PI / 2) <= 0.65]).toEqual([seed, k, true]);
        }
        sitting += on.length;
        // No one but its own stands or sits on it or within 30 cm of it, and it lies 2 m and more from every other blanket.
        g.seats.forEach((s) => { if (s.blanket !== k) expect([seed, k, inBlanket(b, s.x, s.z) < -0.3]).toEqual([seed, k, true]); });
        g.blankets.forEach((o, q) => {
          if (q !== k) expect([seed, k, Math.hypot(o.x - b.x, o.z - b.z) > (Math.hypot(o.wide, o.deep) + Math.hypot(b.wide, b.deep)) / 2 + 2]).toEqual([seed, k, true]);
        });
      });
      // A blanket's sitters are the only ones on one.
      expect(g.seats.every((s) => s.blanket === -1 || g.blankets[s.blanket] !== undefined)).toBe(true);
    }
    expect(sitting).toBeGreaterThan(20 * days.length);
  }, 30000);

  it("faces no one up a rise steeper than RISE, which a seated figure's feet follow, and most down the hill toward the stage, at every tier", () => {
    // A seated figure's feet reach 0.36 of its height ahead and follow the ground there up a rise of 0.12 of its height at the most
    // (crowd.js FOOT and DROP): RISE is under that, read out to past its feet.
    expect(RISE).toBeLessThan(-(DROP as number[])[0] / (FOOT as number[])[0]);
    expect(Math.max(...(RISE_AT as number[]))).toBeGreaterThanOrEqual((FOOT as number[])[0] * 1.08 * (PERSON / TALL));
    for (const { seed, g } of days) for (const s of g.seats) expect([seed, riseAhead(s.x, s.z, s.face) <= RISE + 1e-12]).toEqual([seed, true]);
    for (const { seed, n, g } of tiers) {
      const down = g.seats.filter((s) => height(s.x + 0.7 * Math.sin(s.face), s.z + 0.7 * Math.cos(s.face)) < height(s.x, s.z) - 0.014).length;
      expect([seed, n, down > g.seats.length / 2]).toEqual([seed, n, true]);
    }
  }, 30000);

  it("thins a group at a time: the drum circle and the sack ring first, then ?pose=among's company, then the rest so that a tier's crowd, and half of it, keeps about as much of each side of the stage's axis and of each band out from it as of the whole", () => {
    const fromPose = (s: Seat) => Math.hypot(s.x - AMONG_POSE.x, s.z - AMONG_POSE.z);
    for (const { seed, g } of days) {
      // The groups in the order they come.
      const order = [...g.groups.keys()].sort((a, b) => Math.min(...g.groups[a].seats) - Math.min(...g.groups[b].seats));
      for (const k of order) expect(g.groups[k].seats).toEqual(g.groups[k].seats.map((_, i) => g.groups[k].seats[0] + i));
      expect([seed, order.slice(0, 2).map((k) => g.groups[k].kind).sort()]).toEqual([seed, ["drums", "sack"]]);
      // The company: the groups of the people nearest ?pose=among, the nearest first, until AMONG_KEEP[0] of them stand within
      // AMONG_KEEP[1] m of it. Those not rings come next, in any order.
      const company = new Set<number>();
      for (const s of [...g.seats].sort((a, b) => fromPose(a) - fromPose(b))) {
        if (g.seats.filter((o) => company.has(o.group) && fromPose(o) < AMONG_KEEP[1]).length >= AMONG_KEEP[0]) break;
        company.add(s.group);
      }
      const next = [...company].filter((k) => !["drums", "sack"].includes(g.groups[k].kind));
      expect([seed, new Set(order.slice(2, 2 + next.length))]).toEqual([seed, new Set(next)]);
      // Then each side and each band (BANDS) keeps a share of its people within a twentieth and an eighth of the share kept of all
      // at a tier, and within a twentieth and a fifth at half of one. Bands of fewer than ten are too few to share.
      for (const n of [...TIERS.slice(1), ...TIERS.map((m) => Math.ceil(wholeGroups(g.seats, m) / 2))]) {
        const k = wholeGroups(g.seats, n) as number, kept = g.seats.slice(0, k), whole = k / g.seats.length, half = !TIERS.slice(1).includes(n);
        const share = (part: (s: Seat) => boolean) => kept.filter(part).length / g.seats.filter(part).length;
        for (const side of [1, -1]) expect([seed, n, side, Math.abs(share((s) => Math.sign(across(s.x, s.z) || 1) === side) - whole) <= 0.05]).toEqual([seed, n, side, true]);
        (BANDS as number[]).forEach((b, i) => {
          const part = (s: Seat) => s.r >= (i ? (BANDS as number[])[i - 1] : 0) && s.r < b;
          if (g.seats.filter(part).length >= 10) expect([seed, n, i, Math.abs(share(part) - whole) <= (half ? 0.2 : 0.125)]).toEqual([seed, n, i, true]);
        });
      }
    }
  }, 30000);
});

describe("the title rule", () => {
  it("reads Drums and Space with or without a segue mark", () => {
    for (const title of ["Drums", "Drums ->", "Drums >", "Drums>"]) {
      expect([isDrums(title), isSpace(title), isNotASong(title)]).toEqual([true, false, false]);
    }
    for (const title of ["Space", "Space ->", "Space >", "Space>"]) {
      expect([isSpace(title), isDrums(title), isNotASong(title)]).toEqual([true, false, false]);
    }
  });

  it("drops what a parenthesis holds", () => {
    expect(songsOf("Space (incomplete)")).toEqual(["space"]);
    expect(isSpace("Space (incomplete)")).toBe(true);
    expect(songsOf("Man Smart (Woman Smarter) ->")).toEqual(["mansmart"]);
  });

  it("counts a track that Drums shares as Drums, and as Space only when Space is all it holds", () => {
    for (const title of ["Drums > Space", "Drums/Space"]) {
      expect([isDrums(title), isSpace(title)]).toEqual([true, false]);
    }
    expect(isDrums("Jam > Drums")).toBe(true);
  });

  it("counts a track that a song shares as that song", () => {
    expect(songsOf("The Other One Space >")).toEqual(["theotheronespace"]);
    expect([isSpace("The Other One Space >"), isDrums("The Other One Space >"), isNotASong("The Other One Space >")]).toEqual([false, false, false]);
    expect([isSpace("Space > The Wheel"), isNotASong("Space > The Wheel")]).toEqual([false, false]);
  });

  it("keeps a song with one of the words inside its name a song", () => {
    expect(isDrums("Drumstick")).toBe(false);
    expect([isSpace("Spaceman"), isNotASong("Spaceman")]).toEqual([false, false]);
    expect([isNotASong("Crowd Pleaser"), isBetweenSongs("Crowd Pleaser")]).toEqual([false, false]);
  });

  it("reads tuning, crowd noise and the breaks as not songs, and only tuning and crowd noise as between songs", () => {
    for (const title of ["Tuning", "Tuning >", "tuning", "Crowd", "Crowd Noise"]) {
      expect([isNotASong(title), isBetweenSongs(title)]).toEqual([true, true]);
    }
    for (const title of ["Encore Break", "Set Break", "Intermission"]) {
      expect([isNotASong(title), isBetweenSongs(title)]).toEqual([true, false]);
    }
  });

  it("reads a title by what its parenthesis holds when it names nothing outside one", () => {
    expect(songsOf("(Tuning)")).toEqual(["tuning"]);
    expect([isNotASong("(Tuning)"), isBetweenSongs("(Tuning)"), isTuning("(Tuning)")]).toEqual([true, true, true]);
    expect(songsOf("(fade in ) >")).toEqual(["fadein"]);
  });

  it("reads a title that names nothing as a song", () => {
    for (const title of ["./-", ""]) {
      expect(songsOf(title)).toEqual([]);
      expect([isNotASong(title), isBetweenSongs(title), isTuning(title), isDrums(title), isSpace(title)]).toEqual([false, false, false, false, false]);
    }
  });

  it("reads a track as the band tuning when it names the tuning and no song", () => {
    for (const title of ["Tuning", "Tuning >", "tuning", "Crowd > Tuning", "Tuning > Set Break"]) expect(isTuning(title)).toBe(true);
    for (const title of ["Crowd", "Set Break", "Tuning > Drums", "Jack Straw > Tuning"]) expect(isTuning(title)).toBe(false);
    expect([isDrums("Tuning > Drums"), isNotASong("Tuning > Drums"), isBetweenSongs("Tuning > Drums")]).toEqual([true, false, false]);
  });

  it("reads a track of tuning or crowd noise as between songs, with a break or without", () => {
    for (const title of ["Tuning > Set Break", "Crowd > Encore Break"]) {
      expect([isNotASong(title), isBetweenSongs(title)]).toEqual([true, true]);
    }
  });

  it("parts a title's names at a spaced hyphen, ampersand or \"and\", as at a segue mark", () => {
    for (const title of ["crowd - tuning", "crowd & tuning", "crowd and tuning", "[crowd - tuning]"]) {
      expect(songsOf(title)).toEqual(["crowd", "tuning"]);
      expect([isNotASong(title), isBetweenSongs(title), isTuning(title)]).toEqual([true, true, true]);
    }
    expect([isDrums("Drums & Space"), isSpace("Drums & Space")]).toEqual([true, false]);
    for (const title of ["Me & My Uncle", "Samson and Delilah", "Mississippi Half-Step Uptown Toodeloo"]) expect(isNotASong(title)).toBe(false);
    expect(songsOf("Mississippi Half-Step Uptown Toodeloo")).toEqual(["mississippihalfstepuptowntoodeloo"]);
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

  it("sits through Space alone, and dances through the transition after it", () => {
    const titles = ["Truckin' >", "Drums >", "Space >", "The Other One Space >", "The Other One >"];
    expect(plan(titles, 0)).toEqual(["d-", "d-", "ds", "d-", "d-"]);
  });

  it("reads each song in a title by its whole name", () => {
    const titles = ["Jack Straw", "Heartbreak Hotel", "Breakdown Palace", "Spaceman", "The Other One Space >", "Drums > Space", "Drums/Space",
      "Space (12:01) ->", "Setbreak", "Set 1 Break", "Break", "Set Break 2"];
    expect(plan(titles)).toEqual(["d-", "d-", "d-", "d-", "d-", "d-", "d-", "ds", "-s", "-s", "-s", "-s"]);
  });

  it("dances through a track whose title names nothing, as through a song, and never sits through it as the set break", () => {
    expect(plan(["Jack Straw", "./-", "Deal"])).toEqual(["d-", "d-", "d-"]);
  });
});

describe("parting", () => {
  // The seats with nothing kept clear; the options crowd.js gives parting() for its figures, at the scale buildCrowd stands them at,
  // PERSON tall; and a visitor's bear facing (fx, fz). The figures' sizes come from the options: how near a figure comes to the
  // visitor's middle (reach), or with its arms hanging (hang), how high it reaches (top) and how far out (wide).
  const placed = seats(none) as Seat[], n = placed.length;
  const OPTS = { ...partingOptions(PERSON / TALL), keeps: [] as number[][] };
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
    expect(nearest).toBeGreaterThanOrEqual(OPTS.reach - 1e-4);
    expect(nearestStill).toBeGreaterThanOrEqual(OPTS.hang - 1e-4);
    expect(ground).toBeLessThan(1e-4);
    for (let k = 0; k < 300; k++) p.step(1 / 60, at(0).feet, at(0).head, false);
    expect([...p.offset].every((v) => v === 0)).toBe(true);
    expect([...p.rising].every((v) => v === 1)).toBe(true);
  });

  it("sends everyone back to their seats after a walk on any day, stepping aside no faster than ever: no one is held off theirs by another at its seat that the visitor's walk left nearer the visitor", () => {
    // Down the hill toward the stage at 12 m/s, `off` metres off its axis, then 5 s standing past the crowd; whether everyone stands
    // at their seat again, and the fastest anyone stepped.
    const ux = -STAGE[0] / Math.hypot(...STAGE), uz = -STAGE[1] / Math.hypot(...STAGE);
    let fastest = 0;
    const back = (day: Seat[], off: number) => {
      const p = parting(day, OPTS), at = (a: number) => bear(STAGE[0] + a * ux - off * uz, STAGE[1] + a * uz + off * ux, -ux, -uz);
      let last = Float32Array.from(p.offset);
      const step = (a: number, dt: number) => {
        p.step(dt, at(a).feet, at(a).head, false);
        for (let i = 0; i < day.length; i++) fastest = Math.max(fastest, Math.hypot(p.offset[4 * i] - last[4 * i], p.offset[4 * i + 2] - last[4 * i + 2]) * 60);
        last = Float32Array.from(p.offset);
      };
      step(62, 0);
      for (let a = 62; a >= 0; a -= 0.2) step(a, 1 / 60);
      for (let k = 0; k < 300; k++) step(0, 1 / 60);
      return day.every((_, i) => p.offset[4 * i] === 0 && p.offset[4 * i + 2] === 0);
    };
    // Six walks on each of ten days and the fixed day: every one comes back, two that meet walking back head on among them, as they
    // pass each other. And no one on any of them steps faster than the 5.5 m/s that the walk on the first day holds them to: while a
    // group makes room, the one further from the visitor gives way, however far each stands from its seat.
    const walks = [-12, -6, 0, 6, 9, 12], stuck: number[][] = [];
    for (const seed of [800, ...Array.from({ length: 10 }, (_, k) => k)]) {
      const day = seats(none, seed) as Seat[];
      for (const off of walks) if (!back(day, off)) stuck.push([seed, off]);
    }
    expect(stuck).toEqual([]);
    expect(fastest).toBeLessThanOrEqual(5.5 + 1e-4);
  }, 30000);

  // A walk at 12 m/s along `at`, `length` m from its start, the stage's solids and a hand kept clear, as buildCrowd keeps them, then
  // 5 s standing at its end: the most anyone stepped in a frame past the visitor's step, or past the pace it steps aside at where the
  // visitor's step is less; then how many stand off their seats, and the nearest two. A step is read from the offsets as the mesh
  // takes them, 32-bit numbers, which a figure carried 15 to 23 m up the hill holds to 2 µm: so a step is too far by more than 4 µm.
  const ROUNDING = 4e-6;
  // And how near the cap the steps come, the most of a step over its cap; and how long each group had stood in a pass when it stood
  // there too long to pass anyone again (STOOD), in s.
  const walked = (day: Seat[], at: (t: number) => ReturnType<typeof bear>, length: number) => {
    const p = parting(day, { ...OPTS, keeps: [[STAGE[0], STAGE[1], STAGE_COLUMN.r + OPTS.wide]] });
    // The visitor arrives at the walk's start at once, and the figures stand at once where they would end.
    p.step(0, at(0).feet, at(0).head, false);
    let last = Float32Array.from(p.offset), was = 0, past = 0, fullest = 0;
    const { stood, halted } = p.passes as { stood: Float64Array; halted: Uint8Array }, halts: number[] = [];
    const step = (t: number) => {
      const before = Uint8Array.from(halted);
      p.step(1 / 60, at(t).feet, at(t).head, false);
      for (let g = 0; g < halted.length; g++) if (halted[g] === 1 && before[g] === 0) halts.push(stood[g]);
      // The visitor's middle moves as far as their bear does.
      const visitorStep = Math.abs(t - was), cap = Math.max(visitorStep, OPTS.step / 60);
      for (let i = 0; i < day.length; i++) {
        const stepped = Math.hypot(p.offset[4 * i] - last[4 * i], p.offset[4 * i + 2] - last[4 * i + 2]);
        past = Math.max(past, stepped - cap); fullest = Math.max(fullest, stepped / cap);
      }
      last = Float32Array.from(p.offset); was = t;
    };
    for (let t = 0; t <= length; t += 0.2) step(t);
    for (let k = 0; k < 300; k++) step(was);
    const xs = day.map((s, i) => s.x + p.offset[4 * i]), zs = day.map((s, i) => s.z + p.offset[4 * i + 2]);
    let nearest = Infinity;
    for (let i = 0; i < day.length; i++) for (let j = i + 1; j < day.length; j++) nearest = Math.min(nearest, Math.hypot(xs[i] - xs[j], zs[i] - zs[j]));
    return { past, fullest, halts, left: day.filter((_, i) => p.offset[4 * i] !== 0 || p.offset[4 * i + 2] !== 0).length, nearest };
  };

  it("sends everyone back after a walk down past the stage's solids, no two nearer than APART once they stand, and steps no one faster in a frame than the visitor or the pace it steps aside at", () => {
    // Down the hill toward the stage from 62 m out, `off` metres off its axis, to its centre. Fifteen walks on each of the days the
    // team's review found faults on: on days 40, 79, 96 and 111 two that passed each other walking back head on stood in each other
    // for good, and on day 69 for 5 s; on day 24 a figure the stage's solids held in the visitor's reach jumped 1.2 m in a frame, and
    // on days 5 and 43 others jumped less far. Day 31 has the walk where a step straight out of the solids goes past the cap; days 33
    // and 53 have walks that leave people off their seats where a group that stands still a moment out of a pass passes no one again.
    const ux = -STAGE[0] / Math.hypot(...STAGE), uz = -STAGE[1] / Math.hypot(...STAGE), faults: string[] = [];
    for (const seed of [5, 24, 31, 33, 40, 43, 53, 69, 79, 96, 111]) {
      const day = seats(none, seed) as Seat[];
      for (let off = -14; off <= 14; off += 2) {
        const at = (t: number) => bear(STAGE[0] + (62 - t) * ux - off * uz, STAGE[1] + (62 - t) * uz + off * ux, -ux, -uz);
        const { past, left, nearest } = walked(day, at, 62);
        if (past > ROUNDING || left > 0 || nearest < APART - 1e-9)
          faults.push(`day ${seed}, ${off} m: a step ${past.toFixed(6)} m too far, ${left} off their seats, the nearest two ${nearest.toFixed(3)} m apart`);
      }
    }
    expect(faults).toEqual([]);
  }, 60000);

  it("stands no two nearer than APART once they stand after walks up the hill and across the front rows, which turn two that pass each other back to pushing apart once either stands in the pass or is back on its seat, and steps no one faster in a frame than the visitor or the pace", () => {
    // Up the hill from the front rows, 14 m from the stage's centre, to 62 m, `off` metres off its axis; and across the front rows,
    // `off` metres from the stage's centre, from 26 m to one side of the axis to 26 m to the other. The visitor stands at the end among
    // the crowd, so some stand off their seats there. The walks that a pass which went on through a stand, or past a seat, leaves two
    // standing in each other on: up the hill on day 125; across the front rows on days 68, 69 and 109, and day 76 past a seat.
    const mx = -STAGE[0] / Math.hypot(...STAGE), mz = -STAGE[1] / Math.hypot(...STAGE);
    const ax = Math.sin(FACING), az = Math.cos(FACING), nx = az, nz = -ax, faults: string[] = [];
    let fullest = 0;
    const halts: number[] = [];
    const check = (name: string, day: Seat[], at: (t: number) => ReturnType<typeof bear>, length: number) => {
      const walk = walked(day, at, length), { past, nearest } = walk;
      fullest = Math.max(fullest, walk.fullest); halts.push(...walk.halts);
      if (past > ROUNDING || nearest < APART - 1e-9) faults.push(`${name}: a step ${past.toFixed(6)} m too far, the nearest two ${nearest.toFixed(3)} m apart`);
    };
    const up = seats(none, 125) as Seat[];
    for (let off = -14; off <= 14; off += 4)
      check(`up the hill on day 125, ${off} m`, up, (t) => bear(STAGE[0] + (14 + t) * mx - off * mz, STAGE[1] + (14 + t) * mz + off * mx, mx, mz), 48);
    for (const seed of [68, 69, 76, 109]) {
      const day = seats(none, seed) as Seat[];
      for (const off of [15, 17, 19, 22, 25])
        check(`across on day ${seed}, ${off} m`, day, (t) => bear(STAGE[0] + off * ax + (t - 26) * nx, STAGE[1] + off * az + (t - 26) * nz, nx, nz), 52);
    }
    expect(faults).toEqual([]);
    // The cap is reached, so a step held to less than the visitor's or the pace would show here: the fullest step is the cap's own.
    expect(fullest).toBeGreaterThan(0.999);
    // And a group in a pass that stands stops passing after it has stood STOOD s, a quarter second: these walks need it. Fifteen 60ths
    // add up to a hair under it, so it stops on the sixteenth frame, and never later.
    expect(STOOD).toBe(0.25);
    expect(halts.length).toBeGreaterThan(3);
    for (const s of halts) expect([s >= STOOD - 1e-9, s < STOOD + 2 / 60 - 1e-6]).toEqual([true, true]);
  }, 30000);

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
    // A figure at its seat within 2.35 m of one that stepped 0.25 m aside stands still, and so does any within the reach and a metre of
    // the visitor's middle; one 2.85 m from every figure off its seat and past that dances.
    const apart = (i: number, j: number) => Math.hypot(where(p, i)[0] - where(p, j)[0], where(p, i)[1] - where(p, j)[1]);
    const from = (i: number, of: number[]) => Math.min(...of.map((j) => apart(i, j)));
    const middle = (i: number) => Math.hypot(where(p, i)[0] - (v.feet.x + v.head.x) / 2, where(p, i)[1] - (v.feet.z + v.head.z) / 2);
    for (const i of all) if (off(i) === 0 && from(i, aside) < 2.35) expect(still(i)).toBe(1);
    for (const i of all) if (middle(i) < OPTS.reach + 1) expect(still(i)).toBe(1);
    for (const i of all) if (off(i) === 0 && from(i, moved) >= 2.85 && middle(i) >= OPTS.reach + 1) expect(still(i)).toBe(0);
  });

  it("makes room through a turn across the front rows: no step past the visitor's own, or the pace it steps aside at where a figure holds the visitor back, and none past that pace but near the visitor; none in what it keeps clear of, out of reach", () => {
    // Along the front, 17 m from the stage's centre, at 12 m/s, the stage's solids and a hand kept clear, as buildCrowd keeps them, the
    // walker held as main.js holds it.
    const kept = STAGE_COLUMN.r + OPTS.wide, p = parting(placed, { ...OPTS, keeps: [[STAGE[0], STAGE[1], kept]] });
    // A figure steps faster than the pace it steps aside at only where the room reached its group within half the lead, as a turn
    // brings it, or where the visitor's reach pushed it, or pushed one that pushed it, `passes` neighbours out. The room reaches `keep`
    // to either side of the visitor's middle and as far ahead as they walk in `lead` s and `keep`, so a group reached late, at 12 m/s,
    // has a seat within `late` of their middle; one pushed, within the reach and `passes` groups' `space` of it, which is less. The
    // groups the parting moves as one: seats nearer than `space` joined.
    const late = Math.hypot(OPTS.keep + (12 * OPTS.lead) / 2, OPTS.keep);
    expect(OPTS.reach + OPTS.passes * OPTS.space).toBeLessThan(late);
    const up = placed.map((_, i) => i), root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z) < OPTS.space) up[root(i)] = root(j);
    const group = new Map<number, number[]>();
    placed.forEach((_, i) => group.set(root(i), [...(group.get(root(i)) ?? []), i]));
    let fast = 0, far = 0;
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
        const stepped = Math.hypot(p.offset[4 * i] - last[4 * i], p.offset[4 * i + 2] - last[4 * i + 2]);
        worst = Math.max(worst, stepped - Math.max(visitorStep, OPTS.step / 60));
        if (stepped > OPTS.step / 60 + 1e-6) {
          fast += 1;
          far = Math.max(far, Math.min(...(group.get(root(i)) ?? []).map((j) => Math.hypot(placed[j].x - mx, placed[j].z - mz))));
        }
        if (p.offset[4 * i] === 0 && p.offset[4 * i + 2] === 0) continue;
        moved += 1;
        inside = Math.max(inside, kept - Math.hypot(x - STAGE[0], z - STAGE[1]));
        if (p.offset[4 * i + 3] >= 1 && p.rising[i] === 0) nearestStill = Math.min(nearestStill, d); else nearest = Math.min(nearest, d);
      }
      last = Float32Array.from(p.offset); [lx, lz] = [mx, mz];
    }
    expect(moved).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(1e-6);
    expect(fast).toBeGreaterThan(0);
    expect(far).toBeLessThanOrEqual(late);
    expect(inside).toBeLessThanOrEqual(1e-3);
    expect(nearest).toBeGreaterThanOrEqual(OPTS.reach - 1e-4);
    expect(nearestStill).toBeGreaterThanOrEqual(OPTS.hang - 1e-4);
  });

  it("holds the visitor's walker back from a figure standing still, to the bear's reach and the figure's hanging arms", () => {
    const s = { x: 70, z: -60 }, p = parting([s], OPTS);
    // The visitor stands 3 m from the figure, which steps aside and stands still; a walker 1 m from it is held the bear's reach and the
    // figure's hanging arms off.
    p.step(1 / 60, { x: s.x - 3.4, z: s.z }, { x: s.x - 2.6, z: s.z }, true);
    expect(p.offset[3]).toBe(1);
    const fx = s.x + p.offset[0], fz = s.z + p.offset[2], walker = { x: fx - 1.4, z: fz, heading: -Math.PI / 2 };
    p.hold(walker);
    expect(Math.hypot(walker.x - 0.4 * Math.sin(walker.heading) - fx, walker.z - 0.4 * Math.cos(walker.heading) - fz)).toBeCloseTo(OPTS.hang, 6);
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
    const s = { x: 70, z: -60 }, h = height(s.x, s.z), p = parting([s], OPTS), top = h + OPTS.top + 1.1, edge = OPTS.wide + 1.1;
    const raised = (x: number, z: number, y = h + 1.2) => { const point = { x, y, z }; p.over(point); return point.y; };
    expect(raised(s.x + edge - 0.01, s.z)).toBe(top);
    expect(raised(s.x, s.z + edge + 1)).toBeCloseTo(top - 1.5, 9);
    expect(raised(s.x + 6.8, s.z)).toBe(h + 1.2);
    // A camera far below the figure: the slope reaches it 10 m out, with nothing cut off.
    expect(raised(s.x - 10, s.z, h - 10)).toBeCloseTo(top - 1.5 * (10 - edge), 9);
    expect(raised(s.x - 20, s.z, h - 10)).toBe(h - 10);
    expect(raised(s.x, s.z, top + 1)).toBe(top + 1);
  });

  it("says how far a camera should climb now to stand as high as a figure asks when its way reaches it, and the most it asks on the way", () => {
    // On level ground 1.2 m off it, 10 m short of the figure and closing at 10 m/s, read 20 times over 2 s and climbing at 3 m/s: 0.7 s on
    // it is 3 m out, within the figure's reach and 1.1 m, where the figure asks the camera up to 1.1 m over its top, from 1.2 m over
    // its feet now; 2.1 m of that is climbed by then.
    const s = { x: 78, z: -60 }, h = height(s.x, s.z), p = parting([s], OPTS), camera = { x: s.x - 10, y: h + 1.2, z: s.z };
    expect(height(camera.x, camera.z)).toBe(h);
    const way = Float64Array.of(10, 0, 0, 2, 20, 3, 0, 0);
    p.ahead(camera, way);
    expect(way[6]).toBeCloseTo(OPTS.top + 1.1 - 1.2 - 2.1, 9);
    expect(way[7]).toBeCloseTo(OPTS.top + 1.1 - 1.2, 9);
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

describe("the crowd's ground", () => {
  it("holds every seat, and not the stage, the hill behind the crowd or the ground to the stage's sides and back", () => {
    for (const seat of seats({ path: [], line: [], landmarks: [] }) as { x: number; z: number }[]) expect(onCrowdGround(seat.x, seat.z)).toBe(true);
    expect(onCrowdGround(...at(5, 0))).toBe(false);
    expect(onCrowdGround(...at(12, 0))).toBe(false);
    expect(onCrowdGround(...at(30, 0))).toBe(true);
    expect(onCrowdGround(...at(54, 0.8))).toBe(true);
    expect(onCrowdGround(...at(58, 0))).toBe(false);
    expect(onCrowdGround(...at(30, 1.1))).toBe(false);
    expect(onCrowdGround(...at(30, Math.PI))).toBe(false);
    // The sections' own shape: the back rows are narrower than the wings, and the front rows narrower still.
    expect(onCrowdGround(...at(50, 0.95))).toBe(false);
    expect(onCrowdGround(...at(40, 0.95))).toBe(true);
    expect(onCrowdGround(...at(14.5, 0.9))).toBe(false);
  });

  it("is reckoned about the stage's axis: a point's distance from the stage, along the axis and to either side of it, and its angle off it", () => {
    // fromStage and offAxis undo one another, to either side of the axis, before the stage and behind it.
    for (const [r, th] of [[20, 0], [33, 0.4], [33, -0.4], [50, 1.2], [12, 2.5], [40, -3]]) {
      const [x, z] = at(r, th), about = offAxis(x, z);
      expect(about.r).toBeCloseTo(r, 9);
      expect(about.off).toBeCloseTo(Math.abs(th), 9);
      expect(about.along).toBeCloseTo(r * Math.cos(th), 9);
      expect(about.aside).toBeCloseTo(Math.abs(r * Math.sin(th)), 9);
    }
    // The axis runs from the stage toward the island's middle: the stage faces up its hill.
    expect(offAxis(0, 0).off).toBeCloseTo(0, 9);
    expect(offAxis(0, 0).along).toBeCloseTo(Math.hypot(STAGE[0], STAGE[1]), 9);
    expect(at(1, 0)[0] - STAGE[0]).toBeCloseTo(Math.sin(FACING), 9);
  });

  it("is so many metres deep at each point, from its rim: the same ground as its sections make, whole where one section runs on into the next", () => {
    const all = seats({ path: [], line: [], landmarks: [] }) as { x: number; z: number; r: number }[];
    let onIt = 0, deep = 0;
    for (let x = -10; x <= 110; x += 0.9) for (let z = -110; z <= 10; z += 0.9) {
      const into = intoCrowdGround(x, z);
      // In it where onCrowdGround says so and nowhere else, and within `room` of it wherever it is less than `room` outside.
      expect(into >= 0).toBe(onCrowdGround(x, z));
      for (const room of [2, 4.5]) if (into > -room) expect(onCrowdGround(x, z, room)).toBe(true);
      if (into < 0) continue;
      onIt += 1;
      // A point with 2 m of the crowd's ground all round it is 2 m deep, or a little less by a corner where a wing ends (1.45 m).
      // Reckoned a section at a time it was 0 m deep on the line where one section ends and the next begins.
      if (!Array.from({ length: 32 }, (_, k) => onCrowdGround(x + 2.05 * Math.cos((k * Math.PI) / 16), z + 2.05 * Math.sin((k * Math.PI) / 16))).every(Boolean)) continue;
      expect(into).toBeGreaterThan(1.4);
      deep += 1;
    }
    expect(onIt).toBeGreaterThan(2000);
    expect(deep).toBeGreaterThan(1000);
    for (const seat of all) expect(intoCrowdGround(seat.x, seat.z)).toBeGreaterThanOrEqual(0);
    // Its spans reach as far as its seats, and each is a ring's span to either side of the axis.
    const spans = SPANS as number[][], rows = all.map((seat) => seat.r);
    expect(spans.length).toBeGreaterThan(0);
    for (const [r0, r1, a1] of spans) { expect(r0).toBeLessThan(r1); expect(a1).toBeGreaterThan(0); expect(a1).toBeLessThanOrEqual(Math.PI / 2); }
    expect(Math.min(...spans.map(([r0]) => r0))).toBeLessThanOrEqual(Math.min(...rows));
    expect(Math.max(...spans.map(([, r1]) => r1))).toBeGreaterThanOrEqual(Math.max(...rows));
  });

  it("is wider by the room asked, all round", () => {
    expect(onCrowdGround(...at(56.5, 0), 2)).toBe(true);
    expect(onCrowdGround(...at(57.5, 0), 2)).toBe(false);
    expect(onCrowdGround(...at(12, 0), 2)).toBe(true);
    expect(onCrowdGround(...at(11, 0), 2)).toBe(false);
    // 2 m round the arc at 30 m is 1/15 rad.
    expect(onCrowdGround(...at(30, 1.06), 2)).toBe(true);
    expect(onCrowdGround(...at(30, 1.08), 2)).toBe(false);
  });
});
