import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildBand, STAGING, WARDROBES } from "../../../public/world/band.js";
import { FLOOR } from "../../../public/world/stage.js";

// The players' bodies as people (band.js `trunk`, `armParts`, `fist`, `leg`): each player one piece, joint to joint, at rest and as the
// band plays; each hand where its role puts it; and the feet on the floor.

type Vec = InstanceType<typeof THREE.Vector3>;
type Band = ReturnType<typeof buildBand>;
type Part = { of: string; as: string; by: number | null; from: number; count: number };
type Bone = { of: number; name: string };
type Player = {
  role: string;
  plays: string;
  at: number;
  g: { matrixWorld: { clone(): { invert(): unknown } }; scale: Vec };
  body: { matrixWorld: unknown; geometry?: { getAttribute(name: string): { count: number } } };
  holds: { neck: [Vec, Vec]; fret: Vec; strings: Vec; face: Vec } | null;
};

const LINEUPS = Object.keys(STAGING);
const ERAS = (WARDROBES as [string, string, string][]).map(([from]) => from);

function build(key: string, date: string | null = null) {
  const stage = new THREE.Group(), band: Band = buildBand(stage, FLOOR, key.split(" "), date);
  stage.updateMatrixWorld(true);
  let beats = 0, time = 0;
  // Plays the band on at 96 a minute to `seconds` in, from where it stands.
  const to = (seconds: number) => {
    while (time < seconds - 1e-9) { time += 1 / 60; beats += 96 / 3600; band.move(1 / 60, time, beats, true); }
    stage.updateMatrixWorld(true);
  };
  return { band, to };
}

// What is a player's own, of the still parts: their head, a still body, their legs, cuffs and shoes; not what they play at or on (a
// kit, a keyboard, a bench) nor their microphone, which stand apart from them.
const own = (part: Part) => part.of === "head" || part.of === "body" || / (cuff|shoe|leg)$/.test(part.of);

// Each player's triangles, in their own frame and metres: the moving body's, their own still parts' and their bones'.
function trianglesOf(band: Band) {
  const out = (band.players as Player[]).map(() => [] as Vec[][]);
  const back = (band.players as Player[]).map((p) => p.g.matrixWorld.clone().invert());
  const add = (k: number, a: Vec, b: Vec, c: Vec) => out[k].push([a, b, c].map((v) => v.clone().applyMatrix4(back[k])));
  const still = band.still.geometry.getAttribute("position");
  const at = (attr: { getX(i: number): number; getY(i: number): number; getZ(i: number): number }, i: number) => new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i));
  for (const part of band.still.userData.parts as Part[]) {
    if (part.by === null || !own(part)) continue;
    for (let i = part.from; i < part.from + part.count; i += 3) add(part.by, at(still, i), at(still, i + 1), at(still, i + 2));
  }
  (band.players as Player[]).forEach((p, k) => {
    if (!p.body.geometry) return;
    const corner = p.body.geometry.getAttribute("position") as unknown as Parameters<typeof at>[0] & { count: number };
    for (let i = 0; i < corner.count; i += 3) add(k, ...([0, 1, 2].map((j) => at(corner, i + j).applyMatrix4(p.body.matrixWorld)) as [Vec, Vec, Vec]));
  });
  const limb = band.limbs.geometry.getAttribute("position"), m = new THREE.Matrix4();
  (band.bones as Bone[]).forEach((bone, k) => {
    band.limbs.getMatrixAt(k, m);
    for (let i = 0; i < limb.count; i += 3) add(bone.of, ...([0, 1, 2].map((j) => at(limb, i + j).applyMatrix4(m)) as [Vec, Vec, Vec]));
  });
  return out;
}

// How many pieces a set of triangles makes, drawn flat along one axis (0 x, 1 y, 2 z) at PX m a pixel, a pixel in where its middle is
// inside a triangle, and two pixels of one piece where they touch at an edge or a corner.
const PX = 0.006;
function pieces(tris: Vec[][], drop: number) {
  const [u, v] = [[1, 2], [0, 2], [0, 1]][drop];
  const get = (c: Vec, axis: number) => [c.x, c.y, c.z][axis];
  const all = tris.flat(), lo = [Math.min(...all.map((c) => get(c, u))), Math.min(...all.map((c) => get(c, v)))];
  const W = Math.ceil((Math.max(...all.map((c) => get(c, u))) - lo[0]) / PX) + 2, H = Math.ceil((Math.max(...all.map((c) => get(c, v))) - lo[1]) / PX) + 2;
  const on = new Uint8Array(W * H);
  for (const t of tris) {
    const p = t.map((c) => [(get(c, u) - lo[0]) / PX, (get(c, v) - lo[1]) / PX]);
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = Math.floor(Math.min(p[0][1], p[1][1], p[2][1])); y <= Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])); y++) {
      for (let x = Math.floor(Math.min(p[0][0], p[1][0], p[2][0])); x <= Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])); x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const e = [0, 1, 2].map((i) => { const a = p[i], b = p[(i + 1) % 3]; return ((b[0] - a[0]) * (qy - a[1]) - (b[1] - a[1]) * (qx - a[0])) / area; });
        if (e.every((w) => w >= 0) && x >= 0 && y >= 0 && x < W && y < H) on[y * W + x] = 1;
      }
    }
  }
  const seen = new Uint8Array(W * H), sizes: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || seen[s]) continue;
    let size = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i - x) / W;
      size += 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * W + x + dx;
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

describe("the band's bodies", () => {
  // A joint that came apart, at a shoulder, an elbow, a wrist, a hip or a knee, leaves what is past it a piece of its own from one side
  // or another: a forearm that stopped short of its hand left the hand alone from the front, and one that ran past the elbow's ball
  // without reaching it left the forearm alone from above. So each player, drawn from the front, from the side and from above, is one
  // piece, in every line-up, at rest in every era and as the band plays.
  it("draws each player as one piece, joint to joint, from the front, the side and above, at rest in every line-up and era and as the band plays", () => {
    const apart: string[] = [];
    const look = (band: Band, as: string) => trianglesOf(band).forEach((tris, k) => {
      for (const drop of [2, 0, 1]) {
        const found = pieces(tris, drop);
        if (found.length !== 1) apart.push(`${as}: ${(band.players as Player[])[k].role} from ${["the side", "above", "the front"][[0, 1, 2].indexOf(drop)]}, ${found.length} pieces of ${found.sort((a, b) => b - a).slice(0, 4).join(", ")} px`);
      }
    });
    for (const key of LINEUPS) {
      for (const from of ERAS) look(build(key, from).band, `${key}, ${from}`);
      const { band, to } = build(key);
      for (const seconds of [0.7, 1.9, 3.1, 4.4]) { to(seconds); look(band, `${key}, ${seconds} s in`); }
    }
    expect(apart).toEqual([]);
  }, 300_000);

  // Each hand where its role puts it, in the player's own metres. A guitar's or the bass's fretting hand closes round the neck, its
  // middle 4 cm under the neck's line at the fret; its strumming hand's fingers stay at the strings over the body, as the arm turns
  // through a strum, within 7 cm of the face's plane and 15 cm of the point the strum crosses. A drummer's sticks rest on their drums,
  // the tip within 3 cm of a head; and a keyboard's player's fingers rest on the keys, over the keyboard and within 5 cm of its top.
  it("puts each hand where its role does: on the neck, at the strings, the sticks on the drums and the fingers on the keys", () => {
    const off: string[] = [];
    const segment = (c: Vec, [a, b]: [Vec, Vec]) => new THREE.Line3(a, b).closestPointToPoint(c, true, new THREE.Vector3()).distanceTo(c);
    for (const key of LINEUPS) {
      const { band, to } = build(key);
      const players = band.players as Player[], bones = band.bones as Bone[], m = new THREE.Matrix4(), tip = new THREE.Vector3(), base = new THREE.Vector3();
      // A bone's ends, in its player's frame and metres.
      const ends = (k: number) => {
        band.limbs.getMatrixAt(k, m);
        const back = players[bones[k].of].g.matrixWorld.clone().invert();
        return [base.set(0, 0, 0).applyMatrix4(m).applyMatrix4(back).clone(), tip.set(0, 1, 0).applyMatrix4(m).applyMatrix4(back).clone()];
      };
      // A point of a player's body, at its pose now, in their frame.
      const onBody = (p: Player, v: Vec) => v.clone().applyMatrix4((p.body as unknown as { matrix: unknown }).matrix);
      const still = band.still.geometry.getAttribute("position"), parts = band.still.userData.parts as Part[];
      const cornersOf = (k: number, test: (part: Part) => boolean) => {
        const back = players[k].g.matrixWorld.clone().invert(), out: Vec[] = [];
        for (const part of parts) if (part.by === k && test(part)) for (let i = part.from; i < part.from + part.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back));
        return out;
      };
      const check = (as: string) => {
        players.forEach((p, k) => {
          if (p.holds) {
            const fret = onBody(p, p.holds.fret), neck = p.holds.neck.map((v) => onBody(p, v)) as [Vec, Vec];
            const along = segment(fret, neck);
            if (Math.abs(along - 0.04) > 0.012) off.push(`${as}: ${p.role}'s fretting hand ${along.toFixed(3)} m off the neck's line`);
            const strings = onBody(p, p.holds.strings), face = p.holds.face.clone().applyQuaternion((p.body as unknown as { quaternion: unknown }).quaternion);
            bones.forEach((bone, j) => {
              if (bone.of !== k || bone.name !== "strumming hand") return;
              const fingers = ends(j)[1], depth = Math.abs(fingers.clone().sub(strings).dot(face)), away = fingers.distanceTo(strings);
              if (depth > 0.07 || away > 0.15) off.push(`${as}: ${p.role}'s strumming fingers ${depth.toFixed(3)} m off the strings' plane and ${away.toFixed(3)} m from the strum`);
            });
          }
        });
      };
      // At rest, the sticks on the drums and the fingers on the keys.
      players.forEach((p, k) => {
        if (p.plays === "drums") {
          // The left stick on the snare, the right on a rack tom.
          const drum = (as: string) => {
            const heads = cornersOf(k, (part) => part.of === "kit" && part.as === as), tris: InstanceType<typeof THREE.Triangle>[] = [];
            for (let i = 0; i < heads.length; i += 3) tris.push(new THREE.Triangle(heads[i], heads[i + 1], heads[i + 2]));
            return tris;
          };
          bones.forEach((bone, j) => {
            if (bone.of !== k || !/stick$/.test(bone.name)) return;
            const tris = drum(bone.name === "left stick" ? "snare" : "rack tom");
            // A stick lies from its tip, its thick end (band.js `drummer`'s span), back past the hand.
            // (A lathed drum has faces with no area at its axis, whose nearest point is no number.)
            const end = ends(j)[0], near = Math.min(Infinity, ...tris.map((t) => t.closestPointToPoint(end, new THREE.Vector3()).distanceTo(end)).filter(Number.isFinite));
            if (!(near <= 0.03)) off.push(`${key}: ${p.role} ${k}'s ${bone.name} ${near.toFixed(3)} m off its drum`);
          });
        }
        if (["keys", "organ", "piano"].includes(p.plays)) {
          const board = cornersOf(k, (part) => part.of === "keyboard"), keys = board.filter((c) => c.y > 0.5 && c.y < 1.0);
          const box = new THREE.Box3().setFromPoints(keys);
          bones.forEach((bone, j) => {
            if (bone.of !== k || !/hand$/.test(bone.name)) return;
            const end = ends(j)[1], over = end.x > box.min.x && end.x < box.max.x && end.z > box.min.z && end.z < box.max.z && end.y < box.max.y + 0.05;
            if (!over) off.push(`${key}: ${p.role}'s ${bone.name} at ${end.toArray().map((v: number) => v.toFixed(2))}, not over the keys`);
          });
        }
      });
      check(`${key}, at rest`);
      for (const seconds of [0.5, 1.3, 2.2, 3.6]) { to(seconds); check(`${key}, ${seconds} s in`); }
    }
    expect(off).toEqual([]);
  }, 120_000);

  // The feet on the stage's floor, the player's own 0: each shoe that stays down stands on it, its lowest corner within 2 mm of it, and
  // a tapping foot, which hinges at its heel, rests on it and never goes under it as the band plays.
  it("stands every foot on the floor: each shoe's sole on it at rest, and a tapping foot never under it as the band plays", () => {
    const off: string[] = [];
    for (const key of LINEUPS) {
      const { band, to } = build(key), players = band.players as Player[], bones = band.bones as Bone[];
      const tris = trianglesOf(band), still = band.still.geometry.getAttribute("position");
      for (const part of band.still.userData.parts as Part[]) {
        if (part.by === null || !/ shoe$/.test(part.of)) continue;
        const back = players[part.by].g.matrixWorld.clone().invert();
        let low = Infinity;
        for (let i = part.from; i < part.from + part.count; i++) low = Math.min(low, new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back).y);
        if (Math.abs(low) > 0.002) off.push(`${key}: ${players[part.by].role}'s shoe's sole ${low.toFixed(4)} m over the floor`);
      }
      expect(tris.length).toBe(players.length);
      const lowest = (j: number) => {
        const m = new THREE.Matrix4(), limb = band.limbs.geometry.getAttribute("position"), back = players[bones[j].of].g.matrixWorld.clone().invert();
        band.limbs.getMatrixAt(j, m);
        let low = Infinity;
        for (let i = 0; i < limb.count; i++) low = Math.min(low, new THREE.Vector3().fromBufferAttribute(limb, i).applyMatrix4(m).applyMatrix4(back).y);
        return low;
      };
      const feet = bones.flatMap((bone, j) => (bone.name === "tapping foot" ? [j] : []));
      for (const j of feet) if (Math.abs(lowest(j)) > 0.002) off.push(`${key}: ${players[bones[j].of].role}'s tapping foot ${lowest(j).toFixed(4)} m over the floor at rest`);
      for (let s = 0.1; s < 4; s += 0.1) {
        to(s);
        for (const j of feet) if (lowest(j) < -0.002) off.push(`${key}: ${players[bones[j].of].role}'s tapping foot under the floor ${s.toFixed(1)} s in`);
      }
    }
    expect(off).toEqual([]);
  }, 120_000);
});
