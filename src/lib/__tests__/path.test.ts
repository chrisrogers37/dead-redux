import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { FIRST_EYE, height } from "../../../public/world/ground.js";
import { BAND_RANGE, BAND_SIDE, BAND_STEP, bandAway, bandMask, buildPath, layout, nearStand } from "../../../public/world/path.js";

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

describe("the lit bands' mask", () => {
  type Mask = { image: { data: Uint8Array; width: number; height: number }; format: number; type: number; minFilter: number; magFilter: number; wrapS: number; wrapT: number; generateMipmaps: boolean; flipY: boolean };
  // A straight path 200 m long, from west to east 20 m south of the island's middle, and a show of five songs on it, the second of
  // which runs into the third: one band, from 60 m west of the middle to 60 m east of it. `also` names more songs that run on.
  const straight = { at: (u: number) => new THREE.Vector3(-100 + 200 * u, 0, 20), curveLength: 200 };
  const points = [0, 0.2, 0.8, 0.9, 0.95, 1];
  const five = (...also: number[]) => Array.from({ length: 5 }, (_, i) => ({ title: `Song ${i}`, duration: 300, segueOut: i === 1 || also.includes(i) }));
  const quantum = BAND_RANGE / 255;

  it.each([512, 256])("holds how far the ground lies from the band's middle, in a mask %i texels a side: on the band, beside it, past its ends and off it", (size) => {
    const mask = bandMask(straight, five(), points, size) as Mask, cell = BAND_SIDE / size;
    // On the centre line the reading is the two rows of texels that straddle it, each half a texel off: no more than that.
    for (const x of [-59, -20, 0, 33.3, 59]) expect(bandAway(mask, x, 20), `on the band at x ${x}`).toBeLessThanOrEqual(cell / 2 + quantum);
    // Beside it, a texel or more from the line and a texel or more inside the mask's range, the reading is the distance, to a step
    // of the byte; on either side alike. A mask turned over in z would have the band 20 m north of the middle, and one with x and z
    // swapped would run it north to south.
    for (const x of [-50, 0, 41.7]) for (const off of [1.1, 1.7, 2.5, 4, 4.9, -1.1, -2.5, -4.9]) {
      expect(bandAway(mask, x, 20 + off), `${off} m beside the band at x ${x}`).toBeGreaterThan(Math.abs(off) - quantum);
      expect(bandAway(mask, x, 20 + off), `${off} m beside the band at x ${x}`).toBeLessThan(Math.abs(off) + quantum);
    }
    for (const [x, z] of [[0, 20 + BAND_RANGE + cell], [0, 20 - BAND_RANGE - cell], [0, -20], [20, 0], [20, 60]]) expect(bandAway(mask, x, z), `off the band at ${x}, ${z}`).toBe(BAND_RANGE);
    // Past each end the band is rounded off: 3 m past it along the path is 3 m away, to the few centimetres the filter gives a
    // distance that bends between texels, and the song before it, which runs into nothing, has no band, nor has the one after.
    for (const x of [-63, 63]) expect(Math.abs(bandAway(mask, x, 20) - 3), `3 m past the band's end at x ${x}`).toBeLessThan(0.05);
    for (const x of [-99, -80, -60 - BAND_RANGE - cell, 60 + BAND_RANGE + cell, 70, 85, 99]) expect(bandAway(mask, x, 20), `on the path at x ${x}`).toBe(BAND_RANGE);
    // Each texel is a byte: 255 on the line, one less for each 2.4 cm from it, by the texel's own middle, and 0 from BAND_RANGE on.
    const at = (ix: number, iz: number) => mask.image.data[iz * size + ix], middle = (i: number) => (i + 0.5) * cell - BAND_SIDE / 2;
    for (const [x, z] of [[0, 20], [10, 21.3], [-30, 16.2], [0, 25.9], [64.5, 22.5]]) {
      const ix = Math.floor((x + BAND_SIDE / 2) / cell), iz = Math.floor((z + BAND_SIDE / 2) / cell);
      const away = Math.hypot(Math.max(Math.abs(middle(ix)) - 60, 0), middle(iz) - 20);
      expect(at(ix, iz), `the texel at ${x}, ${z}`).toBe(Math.max(0, Math.round(255 * (1 - away / BAND_RANGE))));
    }
    expect(mask.image.data.reduce((most, byte) => Math.max(most, byte), 0)).toBeGreaterThanOrEqual(255 - Math.ceil(cell / 2 / quantum));
  });

  it("is a texture the ground's shader reads as it is: one byte a texel, the four round a point weighed by the linear filter, with no smaller copies, the edge's texel past the edge", () => {
    const mask = bandMask(straight, five(), points) as Mask;
    expect(mask.image.width).toBe(512);
    expect(mask.image.height).toBe(512);
    expect(mask.image.data).toHaveLength(512 * 512);
    expect(mask.format).toBe(THREE.RedFormat);
    expect(mask.type).toBe(THREE.UnsignedByteType);
    // A nearest filter would draw the band's edge in half-metre steps, and a mipmap would read the mean of distances far off, which
    // is no distance: the band would thin to nothing.
    expect(mask.minFilter).toBe(THREE.LinearFilter);
    expect(mask.magFilter).toBe(THREE.LinearFilter);
    expect(mask.generateMipmaps).toBe(false);
    expect(mask.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(mask.wrapT).toBe(THREE.ClampToEdgeWrapping);
    // Row 0 is the island's north edge.
    expect(mask.flipY).toBe(false);
    // bandAway reads it as the filter does: halfway between two texels' middles, the mean of the two; a quarter of the way, three
    // parts of the nearer to one of the further; and past the mask's edge, the edge.
    const size = 8, data = Uint8Array.from({ length: size * size }, (_, k) => (k * 37) % 256), cell = BAND_SIDE / size, middle = (i: number) => (i + 0.5) * cell - BAND_SIDE / 2;
    const small = { image: { data, width: size, height: size } }, far = (byte: number) => (1 - byte / 255) * BAND_RANGE;
    const texel = (ix: number, iz: number) => data[iz * size + ix];
    expect(bandAway(small, middle(3), middle(5))).toBeCloseTo(far(texel(3, 5)), 12);
    expect(bandAway(small, (middle(3) + middle(4)) / 2, middle(5))).toBeCloseTo(far((texel(3, 5) + texel(4, 5)) / 2), 12);
    expect(bandAway(small, middle(3), middle(5) + cell / 4)).toBeCloseTo(far(0.75 * texel(3, 5) + 0.25 * texel(3, 6)), 12);
    expect(bandAway(small, middle(2) + cell / 2, middle(6) + cell / 2)).toBeCloseTo(far((texel(2, 6) + texel(3, 6) + texel(2, 7) + texel(3, 7)) / 4), 12);
    expect(bandAway(small, -BAND_SIDE, middle(5))).toBeCloseTo(far(texel(0, 5)), 12);
    expect(bandAway(small, middle(3), 2 * BAND_SIDE)).toBeCloseTo(far(texel(3, 7)), 12);
  });

  it("lights the stretch after each song that runs into the next and no other, the first song's and the last but one's among them", () => {
    // Song k's stretch on the straight path, from its point to the next song's, as x; and a show in which song k alone runs on.
    const stretch = (k: number) => [-100 + 200 * points[k], -100 + 200 * points[k + 1]];
    const only = (k: number) => Array.from({ length: 5 }, (_, i) => ({ title: `Song ${i}`, duration: 300, segueOut: i === k }));
    const cell = BAND_SIDE / 512;
    for (const k of [0, 1, 2, 3]) {
      // A mask that passed over the show's first song, or its last but one, would be null here, and the band missing.
      const mask = bandMask(straight, only(k), points) as Mask, [from, to] = stretch(k);
      expect(mask, `song ${k} runs on`).not.toBeNull();
      // On the band all along its own stretch, its two ends among them.
      for (const part of [0, 0.25, 0.5, 0.75, 1]) expect(bandAway(mask, from + part * (to - from), 20), `song ${k}'s stretch, ${part} of the way along`).toBeLessThanOrEqual(cell / 2 + quantum);
      // And every other song's stretch is off it, at its end furthest from the band: 10 m or more away.
      for (const other of [0, 1, 2, 3, 4]) {
        if (other === k) continue;
        const far = stretch(other)[other < k ? 0 : 1];
        expect(Math.min(Math.abs(far - from), Math.abs(far - to)), `song ${other}'s far end from song ${k}'s band`).toBeGreaterThanOrEqual(10);
        expect(bandAway(mask, far, 20), `song ${other}'s stretch, with song ${k} running on`).toBe(BAND_RANGE);
      }
    }
    // The first and the last but one together, the two ends of the show: both bands, and the songs between them dark.
    const ends = bandMask(straight, Array.from({ length: 5 }, (_, i) => ({ title: `Song ${i}`, duration: 300, segueOut: i === 0 || i === 3 })), points) as Mask;
    expect(bandAway(ends, -80, 20)).toBeLessThanOrEqual(cell / 2 + quantum);
    expect(bandAway(ends, 85, 20)).toBeLessThanOrEqual(cell / 2 + quantum);
    expect(bandAway(ends, 0, 20)).toBe(BAND_RANGE);
  });

  it("is null for a show none of whose songs runs into the next, and the last song's segue joins nothing", () => {
    const none = Array.from({ length: 5 }, (_, i) => ({ title: `Song ${i}`, duration: 300 }));
    expect(bandMask(straight, none, points)).toBeNull();
    expect(bandMask(straight, [], [1])).toBeNull();
    // A day with no recording has one stand-in track (main.js), which runs into nothing: main.js asks for its mask and gets none.
    expect(bandMask(straight, [{ title: "Set", duration: 600 }], [0, 1])).toBeNull();
    expect(bandMask(straight, [{ title: "Set", duration: 600, segueOut: true }], [0, 1])).toBeNull();
    expect(bandMask(straight, none.map((t, i) => ({ ...t, segueOut: i === 4 })), points)).toBeNull();
  });

  it("is the same on every build, and one band where two meet: each texel holds the nearer band's distance, never the two summed", () => {
    const one = bandMask(straight, five(), points) as Mask, again = bandMask(straight, five(), points) as Mask;
    expect(Buffer.from(again.image.data).equals(Buffer.from(one.image.data))).toBe(true);
    // The second song runs into the third, and the third into the fourth: they meet at the third's point, 60 m east of the middle.
    const next = bandMask(straight, Array.from({ length: 5 }, (_, i) => ({ title: `Song ${i}`, duration: 300, segueOut: i === 2 })), points) as Mask;
    const both = bandMask(straight, five(2), points) as Mask;
    let lit = 0, wrong = 0;
    for (let k = 0; k < both.image.data.length; k++) {
      if (both.image.data[k] !== Math.max(one.image.data[k], next.image.data[k])) wrong += 1;
      if (one.image.data[k] > 0 && next.image.data[k] > 0) lit += 1;
    }
    expect(wrong).toBe(0);
    // The two do overlap, round where they meet, and there is no gap at the joint.
    expect(lit).toBeGreaterThan(100);
    expect(bandAway(both, 60, 20)).toBeLessThanOrEqual(BAND_SIDE / 512 / 2 + quantum);
    expect(Math.abs(bandAway(both, 60, 23) - 3)).toBeLessThan(quantum);
  });

  // The island's own path, and a show of twelve songs of which the fourth, the fifth and the tenth run on: bands round the summit,
  // and one out of the right cave. The measure is against the path itself, a point every 5 cm.
  it.each([512, 256])("follows the island's own path between the songs' points, in a mask %i texels a side, to within a hand of it all over the island", { timeout: 20000 }, (size) => {
    const tracks = show({ 5: "Drums", 9: "Space" }).map((t, i) => ({ ...t, segueOut: i === 3 || i === 4 || i === 9 })), u = layout(tracks, 3, path);
    const mask = bandMask(path, tracks, u, size) as Mask, cell = BAND_SIDE / size;
    const line: number[][] = [];
    for (const i of [3, 4, 9]) for (let d = 0, long = (u[i + 1] - u[i]) * path.curveLength; d <= long; d += 0.05) { const p = path.at(u[i] + d / path.curveLength); line.push([p.x, p.z]); }
    const squares = new Map<number, number[][]>(), square = (v: number) => Math.floor(v / 8), key = (i: number, j: number) => i * 4096 + j;
    for (const p of line) { const k = key(square(p[0]), square(p[1])); if (!squares.has(k)) squares.set(k, []); squares.get(k)!.push(p); }
    const truly = (x: number, z: number) => {
      let least = Infinity;
      for (let i = square(x) - 1; i <= square(x) + 1; i++) for (let j = square(z) - 1; j <= square(z) + 1; j++) for (const [px, pz] of squares.get(key(i, j)) ?? []) least = Math.min(least, Math.hypot(x - px, z - pz));
      return least;
    };
    let near = 0, off = 0, worst = 0, worstBeyond = 0;
    const wrong: string[] = [];
    for (let x = -129; x <= 129; x += 0.7) for (let z = -129; z <= 129; z += 0.7) {
      const real = truly(x, z), read = bandAway(mask, x, z);
      if (real >= BAND_RANGE + 1.5 * cell) { off += 1; if (read !== BAND_RANGE) wrong.push(`${x.toFixed(1)}, ${z.toFixed(1)}: ${read.toFixed(2)} m, off the bands`); continue; }
      // Within a texel of the line the reading is rounded off, as above, and within one of the mask's range it nears the range.
      if (real < cell || real > BAND_RANGE - cell) continue;
      // A band is drawn within 2 m of its middle or so (island.js); the mask reads on to its range for a pixel that takes in more.
      if (real < 2.5) { near += 1; worst = Math.max(worst, Math.abs(read - real)); }
      else worstBeyond = Math.max(worstBeyond, Math.abs(read - real));
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    // The points do try the bands and the ground off them.
    expect(near).toBeGreaterThan(2000);
    expect(off).toBeGreaterThan(100000);
    // A byte's step, the path's bend within a step of BAND_STEP m (a tenth of a metre where it turns tightest), and the filter
    // between texels: a hand's breadth where a band is drawn, and a little more where two stretches of a band are as near as each
    // other. A mask half a texel out of place is a quarter of a metre off on a desktop and half a metre on a phone.
    expect(worst).toBeLessThan(0.15);
    expect(worstBeyond).toBeLessThan(0.25);
    expect(BAND_STEP).toBeLessThanOrEqual(2);
  });
});
