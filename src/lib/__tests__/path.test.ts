import { describe, expect, it } from "vitest";
import { FIRST_EYE, height } from "../../../public/world/ground.js";
import { buildPath, layout, nearStand } from "../../../public/world/path.js";

const path = buildPath();
const { pointU } = path;
// A show of twelve five-minute tracks: the titles given by index, and "Song i" at every other index.
const show = (titles: Record<number, string>) => Array.from({ length: 12 }, (_, i) => ({ title: titles[i] ?? `Song ${i}`, duration: 300 }));
// Where track i stands between pins (ia, ua) and (ib, ub): tracks as long as each other stand evenly spaced.
const between = (i: number, [ia, ua]: number[], [ib, ub]: number[]) => ua + ((i - ia) / (ib - ia)) * (ub - ua);

describe("layout", () => {
  it("pins Drums to the left cave, loop point 13, and Space to the right one, point 14", () => {
    const u = layout(show({ 5: "Drums", 9: "Space" }), null, { pointU });
    expect(u[5]).toBe(pointU(13));
    expect(u[9]).toBe(pointU(14));
  });

  it("pins set 2's opener to the summit, point 6, before the Drums pin", () => {
    const u = layout(show({ 5: "Drums", 9: "Space" }), 3, { pointU });
    expect([u[3], u[5], u[9]]).toEqual([pointU(6), pointU(13), pointU(14)]);
  });

  it("pins nothing to the left cave in a show with no Drums: the songs from set 2's opener to Space stand evenly between their pins", () => {
    const u = layout(show({ 9: "Space" }), 3, { pointU });
    expect(u).toHaveLength(13);
    for (let i = 3; i <= 9; i++) expect(u[i], `track ${i}`).toBeCloseTo(between(i, [3, pointU(6)], [9, pointU(14)]), 12);
  });

  it("leaves out a pin out of order, here Space before Drums: Drums keeps its pin, and Space stands between the pins round it", () => {
    const u = layout(show({ 5: "Space", 9: "Drums" }), null, { pointU });
    expect(u).toHaveLength(13);
    expect(u[9]).toBe(pointU(13));
    expect(u[5]).toBeCloseTo(between(5, [0, 0], [9, pointU(13)]), 12);
  });
});

describe("?pose=near-K: where the visitor stands by a landmark", () => {
  const { at, tangentAt, curveLength } = path;
  // A show of twelve songs, and its landmarks where their songs' points are, but for those `moved` names: [index, metres to the right
  // of the path].
  const u = layout(show({ 5: "Drums", 9: "Space" }), 3, path);
  const landmarks = (moved: Record<number, number> = {}) => u.slice(0, 12).map((v: number, k: number) => {
    const p = at(v), t = tangentAt(v), l = Math.hypot(t.x, t.z), off = moved[k] ?? 0;
    return { position: { x: p.x - (t.z / l) * off, y: p.y, z: p.z + (t.x / l) * off } };
  });
  type Spot = { x: number; z: number };
  const gap = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z);
  // Which spot in the 60 m of path before `from` lies nearest `stand`, by 1 cm steps: how far off the path that leaves it, and how far
  // back along the path it is.
  const onPath = (stand: Spot, from: number) => {
    let off = Infinity, back = 0;
    for (let d = 0; d <= 60; d += 0.01) { const g = gap(at(from - d / curveLength), stand); if (g < off) { off = g; back = d; } }
    return { off, back };
  };
  // That the view from `stand` is turned to the landmark, and passes 4 m up it from the first-person eye over the ground there.
  const faces = (stand: Spot & { heading: number; pitch: number }, to: Spot & { y: number }, label: string) => {
    const d = gap(stand, to);
    // The world's forward is (-sin heading, -cos heading) (main.js).
    expect(-Math.sin(stand.heading), label).toBeCloseTo((to.x - stand.x) / d, 9);
    expect(-Math.cos(stand.heading), label).toBeCloseTo((to.z - stand.z) / d, 9);
    expect(height(stand.x, stand.z) + FIRST_EYE + d * Math.tan(stand.pitch), label).toBeCloseTo(to.y + 4, 9);
  };

  it("stands 14 m in a straight line from the landmark, on the path behind its song's point, with the view on it", () => {
    const all = landmarks();
    // The twelve stand 30 m and more apart here, so none stands in another's view.
    for (const k of [1, 3, 5, 7, 9, 11]) {
      const stand = nearStand(path, u, all, k)!;
      expect(gap(stand, all[k].position), `song ${k}`).toBeCloseTo(14, 6);
      // On the path, and behind the song's point, as the walker comes to it: 14 m back along it or more, since a path bends.
      const { off, back } = onPath(stand, u[k]);
      expect(off, `song ${k}`).toBeLessThan(0.01);
      expect(back, `song ${k}`).toBeGreaterThanOrEqual(13.99);
      expect(back, `song ${k}`).toBeLessThan(30);
      faces(stand, all[k].position, `song ${k}`);
    }
  });

  it("looks down at a landmark that stands lower than the eye, and up at one that stands higher", () => {
    const all = landmarks();
    all[3].position.y -= 6;
    all[7].position.y += 6;
    const low = nearStand(path, u, all, 3)!, high = nearStand(path, u, all, 7)!;
    expect(low.pitch).toBeLessThan(-0.2);
    expect(high.pitch).toBeGreaterThan(0.2);
    faces(low, all[3].position, "low");
    faces(high, all[7].position, "high");
  });

  it("looks no steeper than the walk's own tilt goes: 0.8 rad up or down", () => {
    const all = landmarks();
    all[3].position.y -= 60;
    all[7].position.y += 60;
    expect(nearStand(path, u, all, 3)!.pitch).toBe(-0.8);
    expect(nearStand(path, u, all, 7)!.pitch).toBe(0.8);
  });

  it("faces a landmark that stands off its song's point, 14 m from where it stands, not from the point", () => {
    const all = landmarks({ 4: 9 });
    const stand = nearStand(path, u, all, 4)!;
    expect(gap(stand, all[4].position)).toBeCloseTo(14, 6);
    expect(gap(stand, at(u[4]))).not.toBeCloseTo(14, 1);
    expect(onPath(stand, u[4]).off).toBeLessThan(0.01);
    faces(stand, all[4].position, "moved");
  });

  it("steps back round the loop's closing for the first song, whose point is the trailhead", () => {
    expect(u[0]).toBe(0);
    const all = landmarks(), stand = nearStand(path, u, all, 0)!;
    expect(gap(stand, all[0].position)).toBeCloseTo(14, 6);
    const { off, back } = onPath(stand, 0);
    expect(off).toBeLessThan(0.01);
    expect(back).toBeGreaterThanOrEqual(13.99);
  });

  it("sees a landmark that already stands 14 m or more from its song's point from that point", () => {
    const all = landmarks({ 6: 16 }), stand = nearStand(path, u, all, 6)!, p = at(u[6]);
    expect(stand.x).toBe(p.x);
    expect(stand.z).toBe(p.z);
    expect(gap(stand, all[6].position)).toBeCloseTo(16, 6);
  });

  it("stands closer where another landmark stands in the view: 11 m, then 8 m, and 8 m where nothing clears it", () => {
    // Another landmark on the line of sight from 14 m, `ahead` metres in front of the eye and `aside` metres off the line.
    const withOne = (ahead: number, aside: number) => {
      const all = landmarks(), from = nearStand(path, u, all, 8)!, to = all[8].position, d = gap(from, to);
      const fx = (to.x - from.x) / d, fz = (to.z - from.z) / d;
      all.push({ position: { x: from.x + fx * ahead - fz * aside, y: to.y, z: from.z + fz * ahead + fx * aside } });
      return { all, to };
    };
    // With nothing in the view, it is clear from 14 m.
    expect(nearStand(path, u, landmarks(), 8)!.clear).toBe(true);
    // 2 m in front of the eye at 14 m: from 11 m it stands behind the eye, and the view is clear.
    let { all, to } = withOne(2, 0);
    expect(gap(nearStand(path, u, all, 8)!, to)).toBeCloseTo(11, 6);
    expect(nearStand(path, u, all, 8)!.clear).toBe(true);
    // 5 m in front: still in the view from 11 m, behind the eye from 8 m.
    ({ all, to } = withOne(5, 0));
    expect(gap(nearStand(path, u, all, 8)!, to)).toBeCloseTo(8, 6);
    expect(nearStand(path, u, all, 8)!.clear).toBe(true);
    // 10 m in front, 4 m short of the landmark: in every view. The closest is taken, and the stand says the view is not clear.
    ({ all, to } = withOne(10, 0));
    expect(gap(nearStand(path, u, all, 8)!, to)).toBeCloseTo(8, 6);
    expect(nearStand(path, u, all, 8)!.clear).toBe(false);
    // 3.9 m off the line of sight is in the view, and 4.5 m is not; nor is one behind the eye, or past the landmark.
    ({ all, to } = withOne(2, 3.9));
    expect(gap(nearStand(path, u, all, 8)!, to)).toBeCloseTo(11, 6);
    for (const [ahead, aside] of [[2, 4.5], [-3, 0], [-0.2, 0], [14.3, 0], [17, 0]]) {
      ({ all, to } = withOne(ahead, aside));
      expect(gap(nearStand(path, u, all, 8)!, to), `${ahead} m ahead, ${aside} m aside`).toBeCloseTo(14, 6);
    }
    // Wherever it stands, the view is on the landmark.
    ({ all, to } = withOne(5, 0));
    const stand = nearStand(path, u, all, 8)!;
    faces(stand, to, "closer");
  });

  it("stands back from a long landmark: 8 m from its furthest reach where that is more than 14 m, and 6 m and 4 m at the closer stands", () => {
    // As placeLandmarks marks one: how far the landmark reaches from its own middle, seen from above.
    const reaching = (reach: number) => { const all = landmarks() as { position: { x: number; y: number; z: number }; userData?: { reach: number } }[]; all[8].userData = { reach }; return all; };
    for (const [reach, away] of [[0, 14], [3, 14], [6, 14], [6.5, 14.5], [9.22, 17.22]]) {
      const all = reaching(reach);
      expect(gap(nearStand(path, u, all, 8)!, all[8].position), `a reach of ${reach} m`).toBeCloseTo(away, 6);
    }
    // With another landmark in the view from the first stand: the closer stands keep their own room.
    const blockedAt = (reach: number, ahead: number) => {
      const all = reaching(reach), from = nearStand(path, u, all, 8)!, to = all[8].position, d = gap(from, to);
      all.push({ position: { x: from.x + ((to.x - from.x) / d) * ahead, y: to.y, z: from.z + ((to.z - from.z) / d) * ahead } });
      return gap(nearStand(path, u, all, 8)!, to);
    };
    expect(blockedAt(0, 2)).toBeCloseTo(11, 6);
    // A reach of 7 m: 15 m, then 13 m, then 11 m.
    expect(blockedAt(7, 1)).toBeCloseTo(13, 6);
    expect(blockedAt(0, 5)).toBeCloseTo(8, 6);
    expect(blockedAt(7, 3.5)).toBeCloseTo(11, 6);
  });

  it("stands nowhere for a song the show does not have, or by a landmark the path never gets far enough from", () => {
    const all = landmarks();
    for (const k of [12, 99, -1, 1.5, Number.NaN]) expect(nearStand(path, u, all, k), `song ${k}`).toBeNull();
    // A distance no path reaches: the search ends once it has gone the loop round.
    expect(nearStand(path, u, all, 3, 1e6)).toBeNull();
  });
});
