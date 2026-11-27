import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildBear, buildBears, drawLegs, EAR_TOP, FUR, furMaterial, HAUNCH, LIMBS, NOSE, ROCK, SNOUT, stride, TAIL_BACK } from "../../../public/world/bears.js";
import { BODY_REACH } from "../../../public/world/collide.js";
import { readFileSync } from "fs";
import { buildAvatar } from "../../../public/world/avatar.js";

// The visitor's bear's colour, the site's ink (avatar.js).
const VISITOR = 0xeceae4;

// Every vertex of a bear's meshes, the hidden limbs among them, in the bear's own frame, as [x, y, z].
function vertices(bear: ReturnType<typeof buildBear>): number[][] {
  bear.g.updateMatrixWorld(true);
  const inverse = bear.g.matrixWorld.clone().invert(), out: number[][] = [], v = new THREE.Vector3();
  bear.g.traverse((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } }; matrixWorld: unknown }) => {
    if (!o.isMesh) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) out.push(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse).toArray());
  });
  return out;
}
// A body's parts as buildBear records them (body.userData.parts), each with its triangles, nine numbers each, and its corners with
// their colours, in the body's own frame.
type Corner = { at: number[]; colour: number[] };
function partsOf(bear: ReturnType<typeof buildBear>) {
  const { index, attributes: { position, color } } = bear.body.geometry;
  const out: Record<string, { tris: number[]; corners: Corner[] }> = {};
  for (const [name, [first, count]] of Object.entries(bear.body.userData.parts as Record<string, number[]>)) {
    const tris: number[] = [], seen = new Set<number>();
    for (let i = first; i < first + count; i++) {
      const k = index.getX(i);
      tris.push(position.getX(k), position.getY(k), position.getZ(k));
      seen.add(k);
    }
    out[name] = { tris, corners: [...seen].map((k) => ({ at: [position.getX(k), position.getY(k), position.getZ(k)], colour: [color.getX(k), color.getY(k), color.getZ(k)] })) };
  }
  return out;
}
// Whether a point is inside a closed skin of triangles: a line from it crosses the skin an odd number of times, along each of three
// ways (as world-walks.ts's `within`).
function within(tris: number[], x: number, y: number, z: number) {
  return [[1, 0.0003, 0.0007], [-0.5, 0.0005, 0.866], [-0.5, -0.0004, -0.866]].every(([dx, dy, dz]) => {
    let hits = 0;
    for (let o = 0; o < tris.length; o += 9) {
      const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az, e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const tx = x - ax, ty = y - ay, tz = z - az, u = (tx * px + ty * py + tz * pz) / det;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) / det;
      if (w < 0 || u + w > 1) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) / det > 0) hits += 1;
    }
    return hits % 2 === 1;
  });
}
const light = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// The swings a bear's limbs take, every fortieth of a radian from the visitor's widest at a run one way to the other (0.7,
// avatar.js; the five's widest to the music is 0.65, audio.js), so the swing where the forward paw's toe dips deepest is among them.
const SWINGS = Array.from({ length: 57 }, (_, k) => Math.round((k - 28) * 25) / 1000);

describe("buildBear", () => {
  it("stands inside the sizes the world keeps round a bear at every swing of its limbs: 4.85 m tall, 1.5 m to either side, its nose within 2.4 m, and nothing past the reach the crowd parts round", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    for (const swing of SWINGS) {
      stride(bear, swing);
      const all = vertices(bear);
      const most = (f: (v: number[]) => number) => Math.max(...all.map(f));
      expect(most(([, y]) => y)).toBeLessThanOrEqual(4.85);
      // collide.js: a bear's flank stands within 1.5 m of its centre and its snout's tip 2.4 m ahead of it, both inside BODY_REACH.
      expect(most(([x]) => Math.abs(x))).toBeLessThanOrEqual(1.5);
      expect(most(([, , z]) => z)).toBeLessThanOrEqual(2.4);
      // The furthest of a bear from its centre is its nose's tip, SNOUT m ahead of it, whatever its limbs do: what stops a bear is
      // reckoned from there (trees.js).
      expect(most(([, , z]) => z)).toBeCloseTo(SNOUT, 6);
      expect(most(([x, , z]) => Math.hypot(x, z))).toBeCloseTo(SNOUT, 6);
      expect(most(([x, , z]) => Math.hypot(x, z))).toBeLessThan(BODY_REACH);
      // crowd.js's BEAR: the visitor's bear reaches 1.98 m from its middle, which stands 0.4 m ahead of its centre.
      expect(most(([x, , z]) => Math.hypot(x, z - 0.4))).toBeLessThanOrEqual(1.98);
    }
  });

  it("says where its nose is: SNOUT is the nose's own place and size", () => {
    expect(NOSE).toEqual({ up: 3.5, ahead: 2.16, r: 0.2 });
    expect(SNOUT).toBeCloseTo(2.36, 12);
  });

  it("keeps a paw on the ground through the stride: the bear comes down as its legs swing out, and neither floats nor sinks", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    for (const swing of SWINGS) {
      const drop = stride(bear, swing);
      // The lower paw's lowest point is on the ground: no more than 1 cm under it, where the forward toe dips early in a stride, and
      // no higher over it than the paw's own facets leave it.
      const lowest = Math.min(...vertices(bear).map(([, y]) => y));
      expect(lowest).toBeGreaterThan(-0.01);
      expect(lowest).toBeLessThan(0.03);
      // The body comes down as far as the limbs' hips do, and stride says how far; each arm hangs from its shoulder, where the body
      // carries it, rock and all: the body's own frame takes the shoulder to the arm's place.
      expect(bear.body.position.y).toBeCloseTo(-drop, 12);
      expect(bear.legs.slice(2).map((leg: { position: { y: number } }) => leg.position.y)).toEqual([1.6 - drop, 1.6 - drop].map((y) => expect.closeTo(y, 9)));
      bear.body.updateMatrix();
      for (const k of [0, 1]) {
        const shoulder = new THREE.Vector3(...LIMBS[k].at).applyMatrix4(bear.body.matrix);
        expect(bear.legs[k].position.toArray()).toEqual(shoulder.toArray().map((v: number) => expect.closeTo(v, 9)));
      }
    }
    // At rest it stands within 1.5 cm of its full height, its ears' tops EAR_TOP m up: rocked, they rise to it (the test above).
    stride(bear, 0);
    expect(bear.body.position.y).toBe(0);
    expect(Math.max(...vertices(bear).map(([, y]) => y))).toBeCloseTo(EAR_TOP, 6);
    expect(EAR_TOP).toBeGreaterThan(4.83);
  });

  it("shows its ruff and its tail: the ruff stands a hand proud of the body all round its back, its lower edge ragged with tufts, and both in a tone apart from the fur at their tips", () => {
    // The five as buildBears colours them, and the visitor's, which avatar.js builds in VISITOR.
    const five = buildBears(new THREE.Scene(), 5).map((b: { color: { r: number; g: number; b: number } }) => b.color);
    expect(five).toHaveLength(5);
    expect(readFileSync(new URL("../../../public/world/avatar.js", import.meta.url), "utf8")).toContain(`buildBear(scene, 0x${VISITOR.toString(16)})`);
    for (const fur of [...five, new THREE.Color(VISITOR)]) {
      const visitor = fur.getHex() === VISITOR, { torso, head, ruff, tail } = partsOf(buildBear(new THREE.Scene(), fur.getHex()));
      const tone = (c: Corner) => light(c.colour[0], c.colour[1], c.colour[2]) / light(fur.r, fur.g, fur.b);
      // The ruff's corners stand in rings, each straight out from the bear's middle line one way round the neck. Round the back half
      // of the neck (within a quarter turn of straight back), in every ring: some corner of it stands 0.12 m and more out of the torso,
      // level with it, and outside the head, so the ruff stands at least that proud of the body; its innermost corner, its root, is in
      // the body; its lowest corner is a tuft's tip, in the trim, and its root in the fur.
      const rings = new Map<number, Corner[]>();
      for (const c of ruff.corners) {
        const turn = Math.round((Math.atan2(c.at[0], -c.at[2]) * 180) / Math.PI * 10) / 10;
        if (Math.abs(turn) <= 90) rings.set(turn, [...(rings.get(turn) ?? []), c]);
      }
      expect(rings.size).toBeGreaterThanOrEqual(25);
      const lows: [number, number][] = [];
      const out = (c: Corner) => Math.hypot(c.at[0], c.at[2]);
      // How far a corner stands out of the torso level with it, to a centimetre, up to 0.3 m.
      const proud = ([x, y, z]: number[]) => {
        let k = 0;
        while (k < 0.3 && !within(torso.tris, x * (1 - k / Math.hypot(x, z)), y, z * (1 - k / Math.hypot(x, z)))) k += 0.01;
        return within(head.tris, x, y, z) ? 0 : k;
      };
      for (const [turn, ring] of rings) {
        const root = ring.reduce((a, c) => (out(c) < out(a) ? c : a)), low = ring.reduce((a, c) => (c.at[1] < a.at[1] ? c : a));
        const furthest = [...ring].sort((a, b) => out(b) - out(a)).slice(0, 4);
        expect(Math.max(...furthest.map((c) => proud(c.at))), `ring at ${turn}°`).toBeGreaterThanOrEqual(0.12);
        expect(within(torso.tris, ...(root.at as [number, number, number])) || within(head.tris, ...(root.at as [number, number, number])), `root at ${turn}°`).toBe(true);
        if (visitor) { expect(tone(low)).toBeLessThan(0.75); expect(tone(root)).toBeGreaterThan(0.9); }
        else { expect(tone(low)).toBeGreaterThan(1.25); expect(tone(root)).toBeLessThan(1.1); }
        lows.push([turn, low.at[1]]);
      }
      // Its lower edge rises and falls round the back, a tuft at each fall: at least six falls of 6 cm or more between the rises either
      // side of them, and 15 cm from its highest to its lowest. A ring's edge is level.
      lows.sort(([a], [b]) => a - b);
      const ys = lows.map(([, y]) => y);
      let falls = 0;
      for (let i = 1; i < ys.length - 1; i++) {
        if (!(ys[i] < ys[i - 1] && ys[i] <= ys[i + 1])) continue;
        const left = Math.max(...ys.slice(Math.max(0, i - 3), i)), right = Math.max(...ys.slice(i + 1, i + 4));
        if (Math.min(left, right) - ys[i] >= 0.06) falls += 1;
      }
      expect(falls).toBeGreaterThanOrEqual(6);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.15);
      // The tail: in the trim all over, and its back stands 0.15 m and more out past the torso behind it.
      for (const c of tail.corners) {
        if (visitor) expect(tone(c)).toBeLessThan(0.75);
        else expect(tone(c)).toBeGreaterThan(1.25);
      }
      expect(within(torso.tris, TAIL_BACK.x, TAIL_BACK.y, TAIL_BACK.z + 0.15)).toBe(false);
    }
  });

  it("joins its parts to its body: each limb's top in it, the ruff's root and the tail sunk in it, and the ears set into the head", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), { torso, head, ears, tail } = partsOf(bear);
    // The limb's top: the corners of its rounded end, above the middle of that end (the limb is a capsule 0.29 m round hanging from its
    // origin), where it hangs from the body.
    const limb = bear.legs[0].geometry.attributes.position, v = new THREE.Vector3(), into = new THREE.Matrix4();
    const top = Array.from({ length: limb.count }, (_, i) => i).filter((i) => limb.getY(i) > -0.29);
    expect(top.length).toBeGreaterThan(20);
    for (const swing of SWINGS) {
      stride(bear, swing);
      bear.g.updateMatrixWorld(true);
      into.copy(bear.body.matrixWorld).invert();
      bear.legs.forEach((leg: { matrixWorld: unknown }, k: number) => {
        const inside = top.filter((i) => { v.fromBufferAttribute(limb, i).applyMatrix4(leg.matrixWorld).applyMatrix4(into); return within(torso.tris, v.x, v.y, v.z); }).length;
        // Where it hangs from is inside the body, and so is the most of its top: all of a leg's, in its haunch, and half an arm's and
        // more, in its shoulder, whose outer side shows as the arm's own.
        v.set(0, 0, 0).applyMatrix4(leg.matrixWorld).applyMatrix4(into);
        expect(within(torso.tris, v.x, v.y, v.z), `limb ${k} at ${swing}`).toBe(true);
        expect(inside / top.length, `limb ${k} at ${swing}`).toBeGreaterThanOrEqual(k < 2 ? 0.55 : 1);
      });
    }
    // Each ear is set into the head: a tenth of its corners and more inside it, and none inside the torso.
    for (const side of [-1, 1]) {
      const own = ears.corners.filter((c) => Math.sign(c.at[0]) === side);
      expect(own.length).toBeGreaterThan(100);
      expect(own.filter((c) => within(head.tris, ...(c.at as [number, number, number]))).length / own.length).toBeGreaterThan(0.1);
      expect(own.some((c) => within(torso.tris, ...(c.at as [number, number, number])))).toBe(false);
    }
    // The tail is sunk in the body: its front half's middle inside the torso, its back outside it (the test above).
    expect(within(torso.tris, TAIL_BACK.x, TAIL_BACK.y, TAIL_BACK.z + 0.36)).toBe(true);
    expect(Math.max(...tail.corners.map((c) => c.at[2]))).toBeGreaterThan(TAIL_BACK.z + 0.36);
  });

  it("has its tail and its ears where they belong: the tail on its middle line at the back, between its haunches, and an ear to each side on top of its head, its cup to the front and its back behind", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), { torso, ears, tail } = partsOf(bear), fur = bear.color;
    // The tail: about the middle line, its back the bear's furthest back under its hips (TAIL_BACK, crowd.js's BEAR_TAIL is reckoned
    // from it), 1.2 to 1.7 m up.
    const xs = tail.corners.map((c) => c.at[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...tail.corners.map((c) => c.at[2]))).toBeCloseTo(TAIL_BACK.z, 6);
    expect(TAIL_BACK.y).toBeGreaterThan(1.2);
    expect(TAIL_BACK.y).toBeLessThan(1.7);
    // Between the haunches: at their middle height (HAUNCH) and at the tail's, the torso's back stands further back 0.45 m to either
    // side than on the middle line, by 6 cm and more: the haunches stand out, and the tail sits in the cleft between them, over it.
    const back = (x: number, y: number) => { let z = -0.5; while (within(torso.tris, x, y, z - 0.005)) z -= 0.005; return z; };
    for (const y of [HAUNCH.at[1], TAIL_BACK.y]) for (const side of [-1, 1]) expect(back(0.45 * side, y)).toBeLessThan(back(0, y) - 0.06);
    expect(TAIL_BACK.y).toBeGreaterThan(HAUNCH.at[1]);
    // The ears: each wholly to its own side, its top the bear's top as it stands, its inner side (the corners in the pale tone, the
    // furthest from the fur) facing forward and out, and its back (the corners in the fur) facing back.
    const normals = bear.body.geometry.attributes.normal, positions = bear.body.geometry.attributes.position;
    const normalAt = (c: Corner) => {
      for (let i = 0; i < positions.count; i++) if (positions.getX(i) === c.at[0] && positions.getY(i) === c.at[1] && positions.getZ(i) === c.at[2]) return [normals.getX(i), normals.getY(i), normals.getZ(i)];
      throw new Error("no such corner");
    };
    const pale = fur.clone().lerp(new THREE.Color(0xffffff), 0.5);
    const mean = (list: number[][]) => [0, 1, 2].map((k) => list.reduce((s, n) => s + n[k], 0) / list.length);
    stride(bear, 0);
    const tallest = Math.max(...vertices(bear).map(([, y]) => y));
    for (const side of [-1, 1]) {
      const own = ears.corners.filter((c) => Math.sign(c.at[0]) === side);
      expect(own.every((c) => Math.sign(c.at[0]) === side && Math.abs(c.at[0]) > 0.3)).toBe(true);
      expect(Math.max(...own.map((c) => c.at[1]))).toBeCloseTo(tallest, 9);
      const cup = own.filter((c) => c.colour.every((v, k) => Math.abs(v - [pale.r, pale.g, pale.b][k]) < 1e-6)).map(normalAt);
      const coat = own.filter((c) => c.colour.every((v, k) => Math.abs(v - [fur.r, fur.g, fur.b][k]) < 1e-6)).map(normalAt);
      expect(cup.length).toBeGreaterThanOrEqual(6);
      expect(coat.length).toBeGreaterThan(cup.length);
      const [cx, , cz] = mean(cup), [, , bz] = mean(coat);
      expect(cz).toBeGreaterThan(0.5);
      expect(cx * side).toBeGreaterThan(0.1);
      expect(bz).toBeLessThan(-0.2);
    }
  });

  it("rocks from side to side as it swings its legs, about the line from the back of its tail to the tip of its nose, which stand where they did; still where it does not swing", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), at = new THREE.Vector3();
    for (const swing of SWINGS) {
      stride(bear, swing);
      bear.body.updateMatrix();
      // The two ends of the line stand where they stood, across and along, and come down by the drop and under 3 mm more.
      for (const end of [new THREE.Vector3(0, NOSE.up, SNOUT), TAIL_BACK]) {
        at.copy(end).applyMatrix4(bear.body.matrix);
        expect([at.x, at.z]).toEqual([end.x, end.z].map((v) => expect.closeTo(v, 9)));
        expect(Math.abs(at.y - (end.y + bear.body.position.y))).toBeLessThan(0.003);
      }
      // The top of the head goes to the side of the leg that swings forward (the left leg, legs[2], for a swing over 0), ROCK rad for
      // each radian of swing, about the line, which passes 1.8 m from it.
      at.set(0, 4.7, 0.8).applyMatrix4(bear.body.matrix);
      if (swing === 0) expect(at.x).toBe(0);
      else {
        expect(Math.sign(at.x)).toBe(-Math.sign(swing));
        expect(Math.abs(at.x) / Math.abs(ROCK * swing)).toBeGreaterThan(1.7);
        expect(Math.abs(at.x) / Math.abs(ROCK * swing)).toBeLessThan(1.95);
      }
    }
    // At a walk's swing (0.5, avatar.js) the head's top goes 5 cm and more to the side.
    stride(bear, 0.5);
    bear.body.updateMatrix();
    expect(Math.abs(at.set(0, 4.7, 0.8).applyMatrix4(bear.body.matrix).x)).toBeGreaterThan(0.05);
    // Under reduced motion the visitor's bear neither swings nor rocks as it walks (avatar.js).
    const avatar = buildAvatar(new THREE.Scene(), [], { phone: false, reduced: true }), body = avatar.g.children.find((o: { visible: boolean }) => o.visible);
    for (let f = 0; f <= 120; f++) {
      avatar.step(0.2 * f, 0, -Math.PI / 2, f === 0 ? 0 : 1 / 60);
      expect(body.quaternion.equals(new THREE.Quaternion())).toBe(true);
      expect(body.position.x === 0 && body.position.z === 0).toBe(true);
    }
  });

  it("deepens its fur in the folds of its body, in the fur's own colour and never paler: the groove of its spine, the cleft under its tail, the creases over its legs", () => {
    for (const hue of [0xd4607a, VISITOR]) {
      const bear = buildBear(new THREE.Scene(), hue), { torso } = partsOf(bear), fur = bear.color;
      // Off the belly (which is its own tone) every corner of the torso is the fur, times no more than 1 and no less than 0.7, its
      // channels in the fur's proportions.
      const share = (c: Corner) => c.colour[1] / fur.g;
      for (const c of torso.corners.filter((c) => c.at[2] < 0.3)) {
        expect(share(c)).toBeLessThanOrEqual(1 + 1e-6);
        expect(share(c)).toBeGreaterThan(0.7);
        expect([c.colour[0] / fur.r, c.colour[2] / fur.b].map((k) => k - share(c))).toEqual([0, 0].map(() => expect.closeTo(0, 5)));
      }
      // The groove: the back's middle line from 2 m up to 3.2 m is 8 % deeper and more than the back 0.35 to 0.7 m to its sides.
      const mid = (list: Corner[]) => list.reduce((s, c) => s + share(c), 0) / list.length;
      const backAt = (lo: number, hi: number) => torso.corners.filter((c) => c.at[2] < -0.5 && c.at[1] > 2 && c.at[1] < 3.2 && Math.abs(c.at[0]) >= lo && Math.abs(c.at[0]) < hi);
      expect(backAt(0, 0.05).length).toBeGreaterThan(4);
      expect(mid(backAt(0, 0.05))).toBeLessThan(mid(backAt(0.35, 0.7)) - 0.08);
      // The cleft under the tail, deeper than the haunches' tops either side of it.
      const at = (x0: number, y0: number, z0: number, r: number) => torso.corners.filter((c) => Math.hypot(c.at[0] - x0, c.at[1] - y0) < r && c.at[2] < z0);
      expect(mid(at(0, 1.15, -0.5, 0.12))).toBeLessThan(mid([...at(0.45, 1.5, -0.5, 0.12), ...at(-0.45, 1.5, -0.5, 0.12)]) - 0.1);
    }
  });

  it("gives the visitor's near-white bear a belly, a muzzle and inner ears a shade deeper than its fur and less deep than its ruff, and the five theirs paler than their fur, as before", () => {
    const light = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const toneOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Corners where each part is drawn in its own tone in full: the belly's middle, the front of the torso inside its oval, under
    // the head's lowest corner (2.5 m up), where nothing else stands; and, found by an exact test of its surface, to a hundredth of a
    // millimetre, the muzzle, an egg 0.5175 by 0.405 by 0.45 m about a point 3.4 m up and 1.8 m ahead.
    const torsoAt = (x: number, y: number, z: number) => z > 0.4 && y < 2.45 && Math.hypot(x / 0.78, (y - 2) / 1.15) < 0.7;
    const muzzleAt = (x: number, y: number, z: number) => Math.abs((x / 0.5175) ** 2 + ((y - 3.4) / 0.405) ** 2 + ((z - 1.8) / 0.45) ** 2 - 1) < 1e-5;
    // The inner ears: the corners of the ears' cups in their own tone in full, those furthest from the fur (the next test holds them to
    // the cups' middles, facing forward); and the ruff's tips, the trim, its corners furthest from the fur.
    const coloursOf = (hue: number) => {
      const bear = buildBear(new THREE.Scene(), hue), { body } = bear, at = body.geometry.attributes.position, colour = body.geometry.attributes.color;
      const found: Record<"belly" | "muzzle" | "ears" | "ruff", { r: number; g: number; b: number }[]> = { belly: [], muzzle: [], ears: [], ruff: [] };
      for (let i = 0; i < at.count; i++) {
        const [x, y, z] = [at.getX(i), at.getY(i), at.getZ(i)], c = { r: colour.getX(i), g: colour.getY(i), b: colour.getZ(i) };
        if (torsoAt(x, y, z)) found.belly.push(c);
        if (muzzleAt(x, y, z)) found.muzzle.push(c);
      }
      const own = partsOf(bear), off = (c: Corner) => Math.abs(toneOf(c.colour[0], c.colour[1], c.colour[2]) - toneOf(bear.color.r, bear.color.g, bear.color.b));
      for (const name of ["ears", "ruff"] as const) {
        const most = Math.max(...own[name].corners.map(off));
        found[name] = own[name].corners.filter((c) => off(c) > most - 1e-6).map((c) => ({ r: c.colour[0], g: c.colour[1], b: c.colour[2] }));
      }
      // Each part is found, and the ears on both sides.
      expect(found.belly.length).toBeGreaterThan(5);
      expect(found.muzzle.length).toBeGreaterThan(100);
      expect(found.ears.length).toBeGreaterThanOrEqual(6);
      expect(found.ruff.length).toBeGreaterThan(30);
      return found;
    };
    // The visitor's: a shade deeper than its fur, 10 to 25 % less light, where paler than near white would not show (it was 11 %
    // lighter); and lighter than its ruff's tips, which are deeper still, so the two stay apart.
    const fur = new THREE.Color(VISITOR), visitor = coloursOf(VISITOR);
    expect(light(fur)).toBeGreaterThan(0.6);
    const deepestRuff = Math.max(...visitor.ruff.map((c) => light(c) / light(fur)));
    for (const part of ["belly", "muzzle", "ears"] as const) {
      for (const c of visitor[part]) {
        const ratio = light(c) / light(fur);
        expect(ratio).toBeGreaterThanOrEqual(0.75);
        expect(ratio).toBeLessThanOrEqual(0.9);
        expect(ratio).toBeGreaterThan(deepestRuff + 0.05);
        // The same hue as the fur, deeper: its channels in the fur's own proportions.
        expect([c.r / fur.r, c.g / fur.g, c.b / fur.b].map((k) => k - ratio)).toEqual([0, 0, 0].map(() => expect.closeTo(0, 5)));
      }
    }
    // The five's: half way from their fur to white, as on main, to the float a vertex holds.
    const five = buildBears(new THREE.Scene(), 5).map((b: { color: { getHex(): number } }) => b.color.getHex());
    expect(five).toHaveLength(5);
    for (const hue of five) {
      const own = coloursOf(hue), half = new THREE.Color(hue).lerp(new THREE.Color(0xffffff), 0.5);
      for (const part of ["belly", "muzzle", "ears"] as const) {
        for (const c of own[part]) expect([c.r, c.g, c.b]).toEqual([half.r, half.g, half.b].map((v: number) => expect.closeTo(v, 6)));
      }
    }
  });

  it("is one mesh to draw and four hidden limbs: two arms, then two legs, an arm swinging with the leg across from it", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    const meshes = bear.g.children.filter((o: { isMesh?: boolean }) => o.isMesh);
    expect(meshes.filter((o: { visible: boolean }) => o.visible)).toEqual([bear.body]);
    expect(bear.legs).toHaveLength(4);
    expect(bear.legs.map((leg: { visible: boolean }) => leg.visible)).toEqual([false, false, false, false]);
    // Arms hang from the shoulders, above the legs' hips, each pair one to a side.
    const at = bear.legs.map((leg: { position: { x: number; y: number } }) => [Math.sign(leg.position.x), leg.position.y]);
    expect(at.map(([side]: number[]) => side)).toEqual([-1, 1, -1, 1]);
    expect(at[0][1]).toBe(at[1][1]);
    expect(at[2][1]).toBe(at[3][1]);
    expect(at[0][1]).toBeGreaterThan(at[2][1]);
    // The legs swing from the hips; each arm in its shoulder, which the body carries as it rocks: the arm's turn is the body's, then
    // its own swing about the body's across.
    stride(bear, 0.4);
    expect(bear.legs.slice(2).map((leg: { rotation: { x: number } }) => leg.rotation.x)).toEqual([-0.4, 0.4]);
    const across = new THREE.Vector3(1, 0, 0);
    for (const [k, swing] of [[0, 0.4], [1, -0.4]]) {
      const own = bear.body.quaternion.clone().invert().multiply(bear.legs[k].quaternion), want = new THREE.Quaternion().setFromAxisAngle(across, swing);
      expect(own.toArray()).toEqual(want.toArray().map((v: number) => expect.closeTo(v, 9)));
    }
  });
});

describe("furMaterial", () => {
  it("adds its pale rim to three's Lambert shader as that shader is written at the pinned version, and changes the surface's colour, never the light", () => {
    for (const vertexColors of [true, false]) {
      const shader = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader };
      expect(shader.fragmentShader.split("#include <normal_fragment_begin>")).toHaveLength(2);
      for (const chunk of ["#include <common>", "#include <begin_vertex>"]) expect(shader.vertexShader.split(chunk)).toHaveLength(2);
      expect(shader.fragmentShader.split("#include <common>")).toHaveLength(2);
      furMaterial(vertexColors).onBeforeCompile(shader);
      expect(shader.fragmentShader).not.toBe(THREE.ShaderLib.lambert.fragmentShader);
      // The rim pales by how far the surface turns from the eye, and only where the surface is fur: what is dark stays dark.
      expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.45 * fuzz * furred);");
      expect(shader.fragmentShader).toContain("float furred = smoothstep(0.03, 0.2, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));");
      expect(shader.fragmentShader).not.toMatch(/reflectedLight\.\w+ \*=/);
      // The vertex shader is three's with one thing added: each corner hands on its own place, before anything moves it, so the
      // grain is fixed to the bear.
      const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
      const added = lines(shader.vertexShader).filter((line) => !lines(THREE.ShaderLib.lambert.vertexShader).includes(line));
      expect(added).toEqual(["varying vec3 vFurAt;", "vFurAt = position;"]);
      expect(shader.vertexShader.indexOf("vFurAt = position;")).toBeGreaterThan(shader.vertexShader.indexOf("#include <begin_vertex>"));
    }
  });

  it("gives the fur a grain fixed to the bear, of its own colour deepened and never paled, drawn only where a pixel can hold it", () => {
    const shader = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader };
    furMaterial(true).onBeforeCompile(shader);
    const text = shader.fragmentShader;
    // The grain is a product on the surface's colour, before the rim pales it: a share taken away, two grains' at most FUR.deep each.
    const grain = text.indexOf("diffuseColor.rgb *= 1.0 - "), rim = text.indexOf("float fuzz");
    expect(grain).toBeGreaterThan(text.indexOf("#include <normal_fragment_begin>"));
    expect(grain).toBeLessThan(rim);
    expect(text).toContain(`diffuseColor.rgb *= 1.0 - ${FUR.deep[0].toFixed(2)} * furSeen(clumps) * furNoise(clumps) - ${FUR.deep[1].toFixed(2)} * furSeen(strands) * furNoise(strands);`);
    expect(text.match(/diffuseColor\.rgb \*=/g)).toHaveLength(1);
    expect(FUR.deep.every((d: number) => d > 0)).toBe(true);
    expect(FUR.deep[0] + FUR.deep[1]).toBeLessThanOrEqual(0.2);
    // Of the corner's own place, handed on by the vertex shader; and the noise, the hash and the fade as the shader has them, which
    // here run as JavaScript: the noise lies between 0 and 1 wherever it is read, and so does the fade, so the colour is taken to
    // between 1 and 1 less the sum of FUR.deep of itself, and never above it.
    expect(text).toContain("vec3 clumps = vFurAt * vec3(8.00, 3.50, 8.00), strands = vFurAt * vec3(26.00, 9.00, 26.00);");
    expect(text).toContain("float furHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }");
    expect(text).toContain("f = f * f * (3.0 - 2.0 * f);");
    expect(text).toContain(`float furSeen(vec3 p) { vec3 w = fwidth(p); return 1.0 - smoothstep(${FUR.seen[0].toFixed(2)}, ${FUR.seen[1].toFixed(2)}, max(w.x, max(w.y, w.z))); }`);
    const fract = (v: number) => v - Math.floor(v);
    const hash = ([x, y, z]: number[]) => {
      let [a, b, c] = [x, y, z].map((v) => fract(v * 0.1031));
      const d = a * c + b * b + c * a + 31.32 * (a + b + c);
      [a, b, c] = [a + d, b + d, c + d];
      return fract((a + b) * c);
    };
    const noise = (p: number[]) => {
      const i = p.map(Math.floor), f = p.map((v, k) => { const t = v - i[k]; return t * t * (3 - 2 * t); });
      const at = (dx: number, dy: number, dz: number) => hash([i[0] + dx, i[1] + dy, i[2] + dz]);
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      return lerp(lerp(lerp(at(0, 0, 0), at(1, 0, 0), f[0]), lerp(at(0, 1, 0), at(1, 1, 0), f[0]), f[1]), lerp(lerp(at(0, 0, 1), at(1, 0, 1), f[0]), lerp(at(0, 1, 1), at(1, 1, 1), f[0]), f[1]), f[2]);
    };
    let seed = 7, lo = Infinity, hi = -Infinity;
    const next = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 40 - 20; };
    for (let k = 0; k < 20000; k++) { const n = noise([next(), next(), next()]); lo = Math.min(lo, n); hi = Math.max(hi, n); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    // It is a grain, not a flat tone: across the bear it ranges over most of that.
    expect(hi - lo).toBeGreaterThan(0.8);
    // The fade: whole where a cell is four pixels across and more (a quarter of a cell a pixel or less), none where it is two or less.
    expect(FUR.seen).toEqual([0.25, 0.5]);
  });
});

describe("drawLegs", () => {
  it("draws four legs for each bear a frame shows and none for one hidden or out of the scene, keeps the bears' own legs hidden, and bounds the legs where the bears stand each frame", () => {
    // Five bears 10 m apart: three shown, one hidden, as the visitor's is in first person, and one the downgrade took out of the scene.
    const scene = new THREE.Scene(), bears = buildBears(scene, 5);
    bears.forEach((b, k) => b.g.position.set(10 * k, 0, 0));
    bears[3].g.visible = false;
    scene.remove(bears[4].g);
    drawLegs(scene, bears);
    const legs = scene.children.at(-1);
    expect(legs.isInstancedMesh).toBe(true);
    // A frame as three draws it: every part placed, then the scene's onBeforeRender, before three culls and draws.
    const frame = () => {
      scene.updateMatrixWorld();
      scene.onBeforeRender();
    };
    const bounded = (b: (typeof bears)[number]) =>
      b.legs.every((leg) => legs.boundingSphere.containsPoint(leg.getWorldPosition(new THREE.Vector3())));
    frame();
    expect(legs.count).toBe(4 * 3);
    expect(bears.flatMap((b) => b.legs.map((leg) => leg.visible))).toEqual(Array(4 * 5).fill(false));
    expect(legs.boundingSphere).not.toBeNull();
    expect(bears.slice(0, 3).every(bounded)).toBe(true);
    // A bear walks 200 m on: the next frame's bounds take its legs in where it stands now.
    bears[0].g.position.x += 200;
    frame();
    expect(bounded(bears[0])).toBe(true);
  });
});
