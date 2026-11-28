import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildBand, glided, SLOW, SOLO, STAGING, WARDROBES } from "../../../public/world/band.js";
import { FLOOR } from "../../../public/world/stage.js";

// The players' bodies as people (band.js `trunk`, `armParts`, `fist`, `leg`): each player one piece, joint to joint, at rest and as the
// band plays; each hand where its role puts it, measured where it is drawn; each singer's head at its microphone; each stand beside
// its player; the legs under a skirt or a coat inside it; and the feet on the floor.

type Vec = InstanceType<typeof THREE.Vector3>;
type Band = ReturnType<typeof buildBand>;
type Part = { of: string; as: string; by: number | null; from: number; count: number };
type Bone = { of: number; name: string };
type Run = { name: string; from: number; count: number };
type Attr = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
type Player = {
  role: string;
  plays: string;
  at: number;
  g: { matrixWorld: { clone(): { invert(): unknown } }; scale: Vec; position: Vec; rotation: { y: number } };
  body: { matrix: unknown; matrixWorld: { clone(): { invert(): unknown } }; quaternion: unknown; geometry?: { getAttribute(name: string): Attr } };
  holds: { neck: [Vec, Vec]; strings: Vec; face: Vec } | null;
  drawn: Run[];
  look: { broad: number; skirt: number };
  dress: { coat: unknown };
};

const LINEUPS = Object.keys(STAGING);
const ERAS = (WARDROBES as [string, string, string][]).map(([from]) => from);
// The band plays at 96 a minute, a count 0.625 s. A test plays it through a whole SOLO counts (32), over which the lead's solo comes
// and goes once and every other move comes round a whole number of times, from a second in, once it has taken up playing
// (band.js EASE), at each quarter of a count: under a third of one, so that no move that comes and goes inside a third of a count
// goes unseen. CYCLE is those times, and COUNTS the first of each count's quarters.
const COUNT = 60 / 96, CYCLE = Array.from({ length: SOLO * 4 }, (_, i) => 1 + (i * COUNT) / 4), COUNTS = CYCLE.filter((_, i) => i % 4 === 0);

function build(key: string, date: string | null = null) {
  const stage = new THREE.Group(), band: Band = buildBand(stage, FLOOR, key.split(" "), date);
  stage.updateMatrixWorld(true);
  let beats = 0, time = 0;
  // Plays the band on at 96 a minute to `seconds` in, from where it stands.
  const to = (seconds: number) => {
    while (time < seconds - 1e-9) { time += 1 / 60; beats += 96 / 3600; band.move(1 / 60, time, beats, true); }
    stage.updateMatrixWorld(true);
  };
  return { band, to, players: band.players as Player[], bones: band.bones as Bone[] };
}

// What is a player's own, of the still parts: their head, a still body, their legs, cuffs and shoes; not what they play at or on (a
// kit, a keyboard, a bench) nor their microphone, which stand apart from them.
const own = (part: Part) => part.of === "head" || part.of === "body" || / (cuff|shoe|leg)$/.test(part.of);

// Each player's triangles, in their own frame and metres, as runs of corners (x, y, z, three corners a triangle): their own still
// parts', which are taken once a band, and the moving body's and their bones' at the pose now.
const stillOf = new WeakMap<Band, number[][]>();
function trianglesOf(band: Band) {
  const players = band.players as Player[], back = players.map((p) => p.g.matrixWorld.clone().invert()), v = new THREE.Vector3(), m = new THREE.Matrix4();
  let fixed = stillOf.get(band);
  if (!fixed) {
    fixed = players.map(() => [] as number[]);
    const still = band.still.geometry.getAttribute("position");
    for (const part of band.still.userData.parts as Part[]) {
      if (part.by === null || !own(part)) continue;
      for (let i = part.from; i < part.from + part.count; i++) { v.fromBufferAttribute(still, i).applyMatrix4(back[part.by]); fixed[part.by].push(v.x, v.y, v.z); }
    }
    stillOf.set(band, fixed);
  }
  const out = fixed.map((corners) => corners.slice());
  players.forEach((p, k) => {
    if (!p.body.geometry) return;
    const corner = p.body.geometry.getAttribute("position");
    m.multiplyMatrices(back[k], p.body.matrixWorld);
    for (let i = 0; i < corner.count; i++) { v.fromBufferAttribute(corner, i).applyMatrix4(m); out[k].push(v.x, v.y, v.z); }
  });
  const limb = band.limbs.geometry.getAttribute("position");
  (band.bones as Bone[]).forEach((bone, k) => {
    band.limbs.getMatrixAt(k, m);
    m.premultiply(back[bone.of]);
    for (let i = 0; i < limb.count; i++) { v.fromBufferAttribute(limb, i).applyMatrix4(m); out[bone.of].push(v.x, v.y, v.z); }
  });
  return out;
}

// How many pieces a run of triangles makes, drawn flat along one axis (0 x, 1 y, 2 z) at PX m a pixel, a pixel in where its middle is
// inside a triangle, and two pixels of one piece where they touch at an edge or a corner.
const PX = 0.006;
function pieces(c: number[], drop: number) {
  const [u, v] = [[1, 2], [0, 2], [0, 1]][drop];
  let lu = Infinity, lv = Infinity, hu = -Infinity, hv = -Infinity;
  for (let i = 0; i < c.length; i += 3) { lu = Math.min(lu, c[i + u]); hu = Math.max(hu, c[i + u]); lv = Math.min(lv, c[i + v]); hv = Math.max(hv, c[i + v]); }
  const W = Math.ceil((hu - lu) / PX) + 2, H = Math.ceil((hv - lv) / PX) + 2, on = new Uint8Array(W * H);
  for (let i = 0; i < c.length; i += 9) {
    const x0 = (c[i + u] - lu) / PX, y0 = (c[i + v] - lv) / PX, x1 = (c[i + 3 + u] - lu) / PX, y1 = (c[i + 3 + v] - lv) / PX, x2 = (c[i + 6 + u] - lu) / PX, y2 = (c[i + 6 + v] - lv) / PX;
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (Math.abs(area) < 1e-12) continue;
    const top = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2))), right = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    for (let y = Math.max(0, Math.floor(Math.min(y0, y1, y2))); y <= top; y++) {
      for (let x = Math.max(0, Math.floor(Math.min(x0, x1, x2))); x <= right; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        if (((x1 - x0) * (qy - y0) - (y1 - y0) * (qx - x0)) / area >= 0 && ((x2 - x1) * (qy - y1) - (y2 - y1) * (qx - x1)) / area >= 0 && ((x0 - x2) * (qy - y2) - (y0 - y2) * (qx - x2)) / area >= 0) on[y * W + x] = 1;
      }
    }
  }
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), sizes: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || seen[s]) continue;
    let size = 0, n = 0;
    stack[n++] = s;
    seen[s] = 1;
    while (n) {
      const i = stack[--n], x = i % W, y = (i - x) / W;
      size += 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * W + x + dx;
        if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && on[j] && !seen[j]) { seen[j] = 1; stack[n++] = j; }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

// The tools the tests below share, for one band: a bone's ends in its player's frame and metres; the corners of a player's still parts
// of a kind, there; the corners of a named part of a moving body (band.js `drawn`) at its pose now, there, and their middle; and the
// point of a line nearest another.
function measures(band: Band) {
  const players = band.players as Player[], bones = band.bones as Bone[], m = new THREE.Matrix4();
  const still = band.still.geometry.getAttribute("position"), parts = band.still.userData.parts as Part[];
  const ends = (j: number) => {
    band.limbs.getMatrixAt(j, m);
    const back = players[bones[j].of].g.matrixWorld.clone().invert();
    return [new THREE.Vector3(0, 0, 0).applyMatrix4(m).applyMatrix4(back), new THREE.Vector3(0, 1, 0).applyMatrix4(m).applyMatrix4(back)];
  };
  const cornersOf = (k: number, test: (part: Part) => boolean) => {
    const back = players[k].g.matrixWorld.clone().invert(), out: Vec[] = [];
    for (const part of parts) if (part.by === k && test(part)) for (let i = part.from; i < part.from + part.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back));
    return out;
  };
  const drawn = (p: Player, name: string) => p.drawn.filter((run) => run.name === name).map(({ from, count }) => {
    const corner = p.body.geometry!.getAttribute("position"), at: Vec[] = [];
    for (let i = from; i < from + count; i++) at.push(new THREE.Vector3(corner.getX(i), corner.getY(i), corner.getZ(i)).applyMatrix4(p.body.matrix));
    return { at, middle: at.reduce((sum, c) => sum.add(c), new THREE.Vector3()).divideScalar(at.length) };
  });
  const nearest = (c: Vec, a: Vec, b: Vec) => new THREE.Line3(a, b).closestPointToPoint(c, false, new THREE.Vector3());
  return { players, bones, ends, cornersOf, drawn, nearest };
}
const triangles = (corners: Vec[]) => Array.from({ length: corners.length / 3 }, (_, i) => new THREE.Triangle(corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2]));
// The nearest a point comes to a set of triangles. (A lathed drum has faces with no area at its axis, whose nearest point is no number.)
const nearestTo = (tris: InstanceType<typeof THREE.Triangle>[], c: Vec) => Math.min(Infinity, ...tris.map((t) => t.closestPointToPoint(c, new THREE.Vector3()).distanceTo(c)).filter(Number.isFinite));

describe("the band's bodies", () => {
  // A joint that came apart, at a shoulder, an elbow, a wrist, a hip or a knee, leaves what is past it a piece of its own from one side
  // or another: a forearm that stopped short of its hand left the hand alone from the front, and one that ran past the elbow's ball
  // without reaching it left the forearm alone from above. So each player, drawn from the front, from the side and from above, is one
  // piece, in every line-up, at rest in every era, and as the band plays through a whole SOLO counts: from the front at every quarter
  // of a count (CYCLE), and from the side and above at every count.
  it("draws each player as one piece, joint to joint, from the front, the side and above, at rest in every line-up and era and through a whole solo as the band plays", () => {
    const apart: string[] = [];
    const look = (band: Band, as: string, views: number[]) => trianglesOf(band).forEach((tris, k) => {
      for (const drop of views) {
        const found = pieces(tris, drop);
        if (found.length !== 1) apart.push(`${as}: ${(band.players as Player[])[k].role} from ${["the side", "above", "the front"][drop]}, ${found.length} pieces of ${found.sort((a, b) => b - a).slice(0, 4).join(", ")} px`);
      }
    });
    for (const key of LINEUPS) {
      for (const from of ERAS) look(build(key, from).band, `${key}, ${from}`, [2, 0, 1]);
      const { band, to } = build(key);
      CYCLE.forEach((seconds, i) => { to(seconds); look(band, `${key}, ${seconds.toFixed(3)} s in`, i % 4 ? [2] : [2, 0, 1]); });
    }
    expect(apart).toEqual([]);
  }, 300_000);

  // Each hand where its role puts it, in the player's own metres, measured on the hand as it is drawn, through a whole SOLO counts. A
  // guitar's or the bass's fretting hand closes round the neck: its palm's middle (band.js `fist`) 4 cm under the neck's line at the
  // fret and 8 mm behind it, in the guitar's own measure (its `big`, 1.08 to 1.1 of the player's), each within 3.5 mm. Its strumming
  // hand's fingers stay at the strings over the body as the arm turns through a strum, within 7 cm of the face's plane and 15 cm of
  // the point the strum crosses. The singer's hand round the stand keeps its palm's middle within 3 cm of the stand's line, which
  // runs through it at rest, as the hips sway it to and fro; the other's palm stays on the tambourine's rim, its middle 2 to 4 cm
  // inside the rim and within the disc's depth. In every stroke, four counts (SLOW), each of a drummer's sticks comes down to rest on
  // its drum, its tip within 3 cm of the head, the left on the snare and the right on a rack tom, and its tip never comes nearer than
  // 1.5 cm, through the head. And a keyboard player's fingers come down on their own keys once in each lift, eight counts (2 SLOW):
  // the keys player's left on the lower keyboard and the right on the upper, the organ's and the piano's both on its one; on the
  // keys is over their white tops and within 5 cm of them; and a hand within 15 cm of its keys, down, coming down or lifting off,
  // stands over them, 10 cm and more inside their ends, and never under their tops.
  it("puts each hand where its role does, as drawn, through a whole solo: on the neck, at the strings, round the stand and the tambourine's rim, the sticks on the drums and the fingers on their own keys", () => {
    const off: string[] = [];
    for (const key of LINEUPS) {
      const { band, to, players, bones } = build(key), { ends, cornersOf, drawn, nearest } = measures(band);
      const colour = band.still.geometry.getAttribute("color"), parts = band.still.userData.parts as Part[], still = band.still.geometry.getAttribute("position");
      // A keyboard's tops, white (band.js `keyed`), as triangles in its player's frame: the keys' two, the lower and the upper, or the
      // organ's or the piano's one.
      const manuals = players.map((p, k) => {
        if (!["keys", "organ", "piano"].includes(p.plays)) return [];
        const back = p.g.matrixWorld.clone().invert(), tops: InstanceType<typeof THREE.Triangle>[] = [];
        for (const part of parts) {
          if (part.by !== k || part.of !== "keyboard") continue;
          for (let i = part.from; i < part.from + part.count; i += 3) {
            if (!(colour.getX(i) > 0.5 && colour.getY(i) > 0.5 && colour.getZ(i) > 0.5)) continue;
            tops.push(new THREE.Triangle(...[0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(still, i + j).applyMatrix4(back))));
          }
        }
        const high = tops.map((t) => (t.a.y + t.b.y + t.c.y) / 3), cut = (Math.min(...high) + Math.max(...high)) / 2;
        return Math.max(...high) - Math.min(...high) < 0.05 ? [tops] : [tops.filter((_, i) => high[i] < cut), tops.filter((_, i) => high[i] >= cut)];
      });
      // How high a point stands over a keyboard's top, straight up from it, and how far inside its ends; null where it is over none.
      const over = (tops: InstanceType<typeof THREE.Triangle>[], c: Vec) => {
        const hit = new THREE.Vector3();
        for (const t of tops) for (const way of [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)]) {
          if (!new THREE.Ray(c, way).intersectTriangle(t.a, t.b, t.c, false, hit)) continue;
          const xs = tops.flatMap((q) => [q.a.x, q.b.x, q.c.x]);
          return { high: c.y - hit.y, inside: Math.min(c.x - Math.min(...xs), Math.max(...xs) - c.x) };
        }
        return null;
      };
      // The drums the sticks rest on, and each stroke's nearest a stick's tip came to its drum and its least.
      const drum = (k: number, as: string) => triangles(cornersOf(k, (part) => part.of === "kit" && part.as === as));
      const heads = new Map<number, InstanceType<typeof THREE.Triangle>[]>(), strokes = new Map<string, number>(), down = new Map<string, number>();
      bones.forEach((bone, j) => { if (/stick$/.test(bone.name)) heads.set(j, drum(bone.of, bone.name === "left stick" ? "snare" : "rack tom")); });
      // The singer's stand, from its foot's middle to its top's.
      const standOf = (k: number) => {
        const first = parts.find((part) => part.of === "microphone" && part.by === k)!, back = players[k].g.matrixWorld.clone().invert(), at: Vec[] = [];
        for (let i = first.from; i < first.from + first.count; i++) at.push(new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back));
        const low = Math.min(...at.map((c) => c.y)), high = Math.max(...at.map((c) => c.y)), middle = (cs: Vec[]) => cs.reduce((s, c) => s.add(c), new THREE.Vector3()).divideScalar(cs.length);
        return [middle(at.filter((c) => c.y < low + 0.01)), middle(at.filter((c) => c.y > high - 0.01))] as [Vec, Vec];
      };
      CYCLE.forEach((seconds, step) => {
        to(seconds);
        const as = `${key}, ${seconds.toFixed(3)} s in`, stroke = Math.floor(step / (4 * SLOW)), lift = Math.floor(step / (8 * SLOW));
        players.forEach((p, k) => {
          if (p.holds) {
            const [palm] = drawn(p, "palm"), [joint, nut] = p.holds.neck.map((v) => v.clone().applyMatrix4(p.body.matrix));
            const face = p.holds.face.clone().applyQuaternion(p.body.quaternion), across = palm.middle.clone().sub(nearest(palm.middle, joint, nut));
            const behind = across.dot(face), under = across.addScaledVector(face, -behind).length();
            if (Math.abs(under - 0.0435) > 0.0035 || Math.abs(behind + 0.0087) > 0.0035) off.push(`${as}: ${p.role}'s fretting palm ${under.toFixed(4)} m under the neck's line and ${(-behind).toFixed(4)} behind it`);
            const strings = p.holds.strings.clone().applyMatrix4(p.body.matrix), strum = p.holds.face.clone().applyQuaternion(p.body.quaternion);
            bones.forEach((bone, j) => {
              if (bone.of !== k || bone.name !== "strumming hand") return;
              const fingers = ends(j)[1], depth = Math.abs(fingers.clone().sub(strings).dot(strum)), away = fingers.distanceTo(strings);
              if (depth > 0.07 || away > 0.15) off.push(`${as}: ${p.role}'s strumming fingers ${depth.toFixed(3)} m off the strings' plane and ${away.toFixed(3)} m from the strum`);
            });
          }
          if (p.plays === "voice") {
            const [onStand, onRim] = drawn(p, "palm"), [disc] = drawn(p, "tambourine"), [foot, top] = standOf(k);
            const fromStand = nearest(onStand.middle, foot, top).distanceTo(onStand.middle);
            if (fromStand > 0.03) off.push(`${as}: the singer's palm ${fromStand.toFixed(3)} m off the stand's line`);
            const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(p.body.quaternion), rel = onRim.middle.clone().sub(disc.middle), along = rel.dot(axis);
            const rim = Math.max(...disc.at.map((c) => { const d = c.clone().sub(disc.middle); return d.addScaledVector(axis, -d.dot(axis)).length(); }));
            const inside = rim - rel.addScaledVector(axis, -along).length(), deep = Math.max(...disc.at.map((c) => Math.abs(c.clone().sub(disc.middle).dot(axis))));
            if (inside < 0.02 || inside > 0.04 || Math.abs(along) > deep) off.push(`${as}: the singer's palm ${inside.toFixed(3)} m inside the tambourine's rim and ${along.toFixed(3)} m off its middle`);
          }
          if (manuals[k].length) bones.forEach((bone, j) => {
            if (bone.of !== k || !/hand$/.test(bone.name)) return;
            const keys = manuals[k][manuals[k].length === 2 && bone.name === "right hand" ? 1 : 0], tip = ends(j)[1], at = over(keys, tip), id = `${p.role} ${k}'s ${bone.name}, lift ${lift}`;
            down.set(id, (down.get(id) ?? 0) + (at && at.high < 0.05 && at.high > -0.005 ? 1 : 0));
            if (at && at.high < 0.15 && (at.inside < 0.1 || at.high < -0.005)) off.push(`${as}: ${p.role}'s ${bone.name} ${at.high.toFixed(3)} m over its keys and ${at.inside.toFixed(3)} m inside their ends`);
          });
        });
        for (const [j, tris] of heads) {
          const near = nearestTo(tris, ends(j)[0]), id = `${players[bones[j].of].role} ${bones[j].of}'s ${bones[j].name}, stroke ${stroke}`;
          strokes.set(id, Math.min(strokes.get(id) ?? Infinity, near));
          if (near < 0.015) off.push(`${as}: ${players[bones[j].of].role} ${bones[j].of}'s ${bones[j].name} ${near.toFixed(3)} m off its drum, through its head`);
        }
      });
      for (const [id, near] of strokes) if (near > 0.03) off.push(`${key}: ${id} came no nearer its drum than ${near.toFixed(3)} m`);
      for (const [id, times] of down) if (!times) off.push(`${key}: ${id} never came down on its own keys`);
    }
    expect(off).toEqual([]);
  }, 120_000);

  // The pace of a keyboard player's hand along the keys (band.js `glided`): `glide` while it is down, toward its own end, none at the
  // top of its lift, and in even steps between as the lift moves at its even pace, with no dip past either.
  it("glides a keyboard player's hand along the keys at an even pace as it lifts and comes down", () => {
    const glide = 0.04, steps = Array.from({ length: 11 }, (_, i) => 1 - i / 5);
    for (const lead of [1, -1]) {
      const along = steps.map((slow) => glided(glide, 1, slow, lead));
      expect([along[lead > 0 ? 0 : 10], along[lead > 0 ? 10 : 0]].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([lead * glide, 0]);
      const step = along.slice(1).map((v, i) => v - along[i]);
      expect(Math.max(...step) - Math.min(...step)).toBeLessThan(1e-12);
    }
    expect(glided(glide, 0.5, 1, 1)).toBeCloseTo(glide / 2, 12);
  });

  // The head of each player at a microphone stands still at it (band.js keepHead) while the trunk sways under it: so the point of the
  // body that is at the microphone's head at rest stays within 3 cm of it through a whole SOLO counts, in every line-up, the lead's
  // solo, when they lean over about the mouth and the hips go out the other way, with the rest.
  it("keeps each head at its microphone through a whole solo: the part of the body there at rest stays within 3 cm of it", () => {
    const off: string[] = [];
    for (const key of LINEUPS) {
      const { band, to, players } = build(key), parts = band.still.userData.parts as Part[], still = band.still.geometry.getAttribute("position");
      const mics = players.flatMap((p, k) => {
        const capsule = parts.filter((part) => part.of === "microphone" && part.by === k)[1];
        if (!capsule || !p.body.geometry) return [];
        const mic = new THREE.Vector3(0, -Infinity, 0);
        for (let i = capsule.from; i < capsule.from + capsule.count; i++) { const c = new THREE.Vector3().fromBufferAttribute(still, i); if (c.y > mic.y) mic.copy(c); }
        return [{ p, mic, held: mic.clone().applyMatrix4(p.body.matrixWorld.clone().invert()), most: 0 }];
      });
      for (const seconds of CYCLE) {
        to(seconds);
        for (const m of mics) m.most = Math.max(m.most, m.held.clone().applyMatrix4(m.p.body.matrixWorld).distanceTo(m.mic) / m.p.g.scale.x);
      }
      for (const { p, most } of mics) if (most > 0.03) off.push(`${key}: ${p.role}'s head ${most.toFixed(3)} m off its microphone`);
    }
    expect(off).toEqual([]);
  }, 60_000);

  // From the crowd's side, the stage's front, no stand stands before its player's torso (CLAUDE.md, "People"). The torso, with the upper
  // arms that lie against it, from the hips to the shoulders: the shoulders' joints 0.205 of the player's breadth out from the middle
  // (band.js `trunk`) and an upper arm's 6 cm past them, and 15 cm before and behind the middle. Turned as the player is, it covers a
  // span of the stage from the crowd; each stand (a microphone's first part), across the stage, stands 5 cm and more clear of that
  // span, in the player's metres, to one side. The singer's is the exception: they hold it, and it leans in to the mouth from
  // before them.
  it("stands every microphone's stand beside its player, clear of the torso from the crowd by 5 cm and more", () => {
    const off: string[] = [];
    for (const key of LINEUPS) {
      const { band, players } = build(key), parts = band.still.userData.parts as Part[], still = band.still.geometry.getAttribute("position");
      players.forEach((p, k) => {
        const first = parts.find((part) => part.of === "microphone" && part.by === k);
        if (!first || p.plays === "voice") return;
        const wide = 0.205 * p.look.broad + 0.06, s = p.g.scale.x;
        const torso = [-1, 1].flatMap((x) => [-1, 1].map((z) => new THREE.Vector3(x * wide, 1.1, z * 0.15).applyMatrix4(p.g.matrixWorld).x));
        const stand: number[] = [];
        for (let i = first.from; i < first.from + first.count; i++) stand.push(still.getX(i));
        const clear = Math.max(Math.min(...stand) - Math.max(...torso), Math.min(...torso) - Math.max(...stand)) / s;
        if (clear < 0.05) off.push(`${key}: ${p.role}'s stand ${clear.toFixed(3)} m clear of the torso from the crowd`);
      });
    }
    expect(off).toEqual([]);
  });

  // A skirt, or a coat's skirts, hangs over the legs under it (band.js `stand`, `hangFrom`), and nothing of them comes through it. So,
  // through a whole SOLO counts at every quarter of a count (CYCLE), in every line-up, each in an era of its own, round the eras, so
  // that each role that wears one is held to it in every era's clothes: every corner of each leg of a player in a skirt or a coat, the
  // hip's, the knee's and the shin's down to the top of its cuff or boot, is inside the torso or the skirt as drawn; and so is each
  // corner of the top of a cuff or a boot, which reaches up under the hem. A corner is inside a closed surface where a level line
  // from it crosses the surface an odd number of times; of three lines, two must. Nothing else hangs over a limb that moves: a
  // sleeve is part of its arm, its own bar or a still part with it (band.js `armParts`, `sleeveOf`), never a garment of its own.
  it("keeps the legs under a skirt or a coat inside it, and the tops of the cuffs and boots under its hem, through a whole solo in every era", () => {
    const off = new Map<string, { count: number; first: string }>();
    const ways = [0.3, 2.4, 4.5].map((a) => [Math.cos(a), Math.sin(a)]);
    // How many times a level line from (x, y, z), along (dx, 0, dz), crosses the triangles in `t`, nine numbers a triangle.
    const crossings = (t: Float64Array, x: number, y: number, z: number, dx: number, dz: number) => {
      let n = 0;
      for (let i = 0; i < t.length; i += 9) {
        const ay = t[i + 1], by = t[i + 4], cy = t[i + 7];
        if ((ay > y && by > y && cy > y) || (ay < y && by < y && cy < y)) continue;
        const e1x = t[i + 3] - t[i], e1y = by - ay, e1z = t[i + 5] - t[i + 2], e2x = t[i + 6] - t[i], e2y = cy - ay, e2z = t[i + 8] - t[i + 2];
        const px = -dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const sx = x - t[i], sy = y - ay, sz = z - t[i + 2], u = (sx * px + sy * py + sz * pz) / det;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dz * qz) / det;
        if (v >= 0 && u + v <= 1 && (e2x * qx + e2y * qy + e2z * qz) / det > 0) n++;
      }
      return n;
    };
    LINEUPS.forEach((key, l) => {
      const date = ERAS[l % ERAS.length], { band, to, players, bones } = build(key, date), limb = band.limbs.geometry.getAttribute("position");
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), still = band.still.geometry.getAttribute("position");
      const under = players.map((p) => p.look.skirt > 0 && Boolean(p.body.geometry));
      expect(under.filter(Boolean).length).toBeGreaterThanOrEqual(3);
      // Each cuff's and boot's top, in its player's frame: still parts, so taken once.
      const tops = players.map((p, k) => {
        if (!under[k]) return [];
        const back = p.g.matrixWorld.clone().invert(), out: Vec[] = [];
        for (const part of band.still.userData.parts as Part[]) {
          if (part.by !== k || !/cuff$/.test(part.of)) continue;
          let top = -Infinity;
          for (let i = part.from; i < part.from + part.count; i++) top = Math.max(top, still.getY(i));
          for (let i = part.from; i < part.from + part.count; i++) if (still.getY(i) > top - 1e-6) out.push(new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back));
        }
        return out;
      });
      for (const seconds of CYCLE) {
        to(seconds);
        players.forEach((p, k) => {
          if (!under[k]) return;
          const back = p.g.matrixWorld.clone().invert(), body = new THREE.Matrix4().multiplyMatrices(back, p.body.matrixWorld), corner = p.body.geometry!.getAttribute("position");
          const shells = p.drawn.filter((run) => run.name === "torso" || run.name === "skirt").map(({ from, count }) => {
            const t = new Float64Array(count * 3);
            for (let i = 0; i < count; i++) { v.set(corner.getX(from + i), corner.getY(from + i), corner.getZ(from + i)).applyMatrix4(body); t.set([v.x, v.y, v.z], i * 3); }
            return t;
          });
          expect(shells.length).toBe(2);
          const inside = (c: Vec) => shells.some((t) => ways.filter(([dx, dz]) => crossings(t, c.x, c.y, c.z, dx, dz) % 2).length >= 2);
          const note = (what: string, c: Vec) => {
            const at = `${key}, ${date}: ${p.role}'s ${what}`, seen = off.get(at);
            if (seen) seen.count += 1;
            else off.set(at, { count: 1, first: `${seconds.toFixed(3)} s in, (${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)})` });
          };
          for (const c of tops[k]) if (!inside(c)) note("cuff's top", c);
          bones.forEach((bone, j) => {
            if (bone.of !== k || !/(thigh|shin)$/.test(bone.name)) return;
            band.limbs.getMatrixAt(j, m);
            m.premultiply(back);
            for (let i = 0; i < limb.count; i++) {
              const c = new THREE.Vector3().fromBufferAttribute(limb, i).applyMatrix4(m);
              if (!inside(c)) note(bone.name, c);
            }
          });
        });
      }
    });
    expect([...off].map(([at, { count, first }]) => `${at}: ${count} corners out of the torso and the skirt, the first ${first}`)).toEqual([]);
  }, 120_000);

  // The feet on the stage's floor, the player's own 0: each shoe that stays down stands on it, its lowest corner within 2 mm of it, and
  // a tapping foot, which hinges at its heel, rests on it at rest and never goes under it through a whole SOLO counts.
  it("stands every foot on the floor: each shoe's sole on it at rest, and a tapping foot never under it through a whole solo", () => {
    const off: string[] = [];
    for (const key of LINEUPS) {
      const { band, to, players, bones } = build(key), still = band.still.geometry.getAttribute("position");
      for (const part of band.still.userData.parts as Part[]) {
        if (part.by === null || !/ shoe$/.test(part.of)) continue;
        const back = players[part.by].g.matrixWorld.clone().invert();
        let low = Infinity;
        for (let i = part.from; i < part.from + part.count; i++) low = Math.min(low, new THREE.Vector3().fromBufferAttribute(still, i).applyMatrix4(back).y);
        if (Math.abs(low) > 0.002) off.push(`${key}: ${players[part.by].role}'s shoe's sole ${low.toFixed(4)} m over the floor`);
      }
      expect(trianglesOf(band).length).toBe(players.length);
      const lowest = (j: number) => {
        const m = new THREE.Matrix4(), limb = band.limbs.geometry.getAttribute("position"), back = players[bones[j].of].g.matrixWorld.clone().invert();
        band.limbs.getMatrixAt(j, m);
        let low = Infinity;
        for (let i = 0; i < limb.count; i++) low = Math.min(low, new THREE.Vector3().fromBufferAttribute(limb, i).applyMatrix4(m).applyMatrix4(back).y);
        return low;
      };
      const feet = bones.flatMap((bone, j) => (bone.name === "tapping foot" ? [j] : []));
      for (const j of feet) if (Math.abs(lowest(j)) > 0.002) off.push(`${key}: ${players[bones[j].of].role}'s tapping foot ${lowest(j).toFixed(4)} m over the floor at rest`);
      for (const seconds of CYCLE) {
        to(seconds);
        for (const j of feet) if (lowest(j) < -0.002) off.push(`${key}: ${players[bones[j].of].role}'s tapping foot under the floor ${seconds.toFixed(3)} s in`);
      }
    }
    expect(off).toEqual([]);
  }, 120_000);
});
