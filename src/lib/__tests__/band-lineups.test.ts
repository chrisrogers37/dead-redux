import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildBand, HALF_OVER, SIX, STAGING } from "../../../public/world/band.js";
import { LINEUPS } from "../../../public/world/lineup.js";
import { PERSON } from "../../../public/world/seats.js";
import { FLOOR, FLOOR_R, FLOOR_SIDES, PANEL } from "../../../public/world/stage.js";

// public/world/band.js builds the band as the show's line-up (lineup.js): every line-up of the table, built here as band.test.ts
// builds the six, and held to the rules the six keep that are no one line-up's: what it costs to draw, where it stands, how it is
// laid and held together, and how its players move. band.test.ts holds the six to the rest, and band-outline.ts every line-up to
// its outlines as the shoot's devices draw them.

const made = vi.hoisted(() => ({ count: 0 }));
vi.mock("three", async (original) => {
  const three = await original<Record<string, new (...args: unknown[]) => object>>();
  const counted = (name: string) => {
    const Base = three[name];
    return class extends Base {
      constructor(...args: unknown[]) {
        super(...args);
        made.count += 1;
      }
    };
  };
  return { ...three, Vector3: counted("Vector3"), Matrix4: counted("Matrix4"), Quaternion: counted("Quaternion"), Euler: counted("Euler") };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Vec = { x: number; y: number; z: number };
type Bone = { of: number; name: string; pads: [number, number]; span: [number, number] | null; at: number };
type Joint = { bone: number; end: 0 | 1; of: number; on?: boolean; at?: unknown; to?: number };
type Part = { of: string; as: string; by: number | null; from: number; count: number };
type Player = { role: string; plays: string; still: boolean; g: { position: Vec; scale: Vec; matrix: unknown }; body: { matrixWorld: unknown; geometry?: { getAttribute(name: string): { count: number } } }; look: { size: number; broad: number; hair: string } };
type Band = ReturnType<typeof buildBand>;

// The table's line-ups, each once, as its rows write their roles.
const lineups: string[][] = [...new Set((LINEUPS as [string, string, string[]][]).map(([, , roles]) => roles.join(" ")))].map((key) => key.split(" "));
// The roles the six did not have, each a player of the band's own (band.js DEAL).
const NEW = ["organ", "piano", "voice"];
// A move's counts, as band.js times them: MOVE for a move, LIFT_MOVE for a keyboard player's lift.
const MOVE = 0.35, LIFT_MOVE = 1;

// A line-up built in a group of the test's own that stands where the stage's does in its own frame, and what plays it: `play` runs
// frames of 1/60 s at a tempo, as main.js's frame does.
function stand(roles: string[]) {
  const stage = new THREE.Group();
  const band: Band = buildBand(stage, FLOOR, roles);
  const clock = { beats: 0, time: 0 };
  const play = (seconds: number, bpm: number, playing = true, each: () => void = () => {}) => {
    for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
      clock.beats += bpm / 3600;
      clock.time += 1 / 60;
      band.move(1 / 60, clock.time, clock.beats, playing);
      each();
    }
  };
  return { stage, band, clock, play };
}

const matrix = new THREE.Matrix4();
// Every corner the band has, in the stage's frame, with the name of the part it is a corner of and whose it is. A player who holds
// still (the organ's, the pianist) is among the still parts, body and all.
function corners({ stage, band }: { stage: unknown; band: Band }, each: (at: Vec, of: string, by: number | null) => void) {
  (stage as { updateMatrixWorld(force: boolean): void }).updateMatrixWorld(true);
  const at = new THREE.Vector3();
  const still = band.still.geometry.getAttribute("position");
  for (const part of band.still.userData.parts as Part[]) for (let i = part.from; i < part.from + part.count; i++) each(at.fromBufferAttribute(still, i), part.of, part.by);
  band.players.forEach((p: Player, k: number) => {
    if (p.still) return;
    const body = p.body.geometry!.getAttribute("position");
    for (let i = 0; i < body.count; i++) each(at.fromBufferAttribute(body, i).applyMatrix4(p.body.matrixWorld), "body", k);
  });
  const limb = band.limbs.geometry.getAttribute("position");
  band.bones.forEach((bone: Bone, k: number) => {
    band.limbs.getMatrixAt(k, matrix);
    for (let i = 0; i < limb.count; i++) each(at.fromBufferAttribute(limb, i).applyMatrix4(matrix), bone.name, bone.of);
  });
}
// A bone's two ends in the stage's frame, as its matrix lays it (band.test.ts `ends`).
function ends(band: Band, k: number) {
  const bone: Bone = band.bones[k];
  band.limbs.getMatrixAt(k, matrix);
  const from = new THREE.Vector3().setFromMatrixPosition(matrix), along = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
  const length = along.length(), scale = band.players[bone.of].g.scale.x;
  along.divideScalar(length);
  return { a: from.clone().addScaledVector(along, bone.pads[0] * scale), b: from.clone().addScaledVector(along, length - bone.pads[1] * scale) };
}
// Where a joint holds its bone's end (band.test.ts `held`).
function held(band: Band, joint: Joint) {
  if (joint.to !== undefined) return ends(band, joint.to).b;
  const p = band.players[joint.of], at = (joint.at as { clone(): { applyMatrix4(m: unknown): Vec } }).clone();
  if (joint.on) {
    p.body.updateMatrix();
    at.applyMatrix4(p.body.matrix);
  }
  return at.applyMatrix4(p.g.matrix);
}
const gap = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// The corners of the still parts `of` what, by player `k`.
function stillOf(band: Band, of: (name: string) => boolean, k: number) {
  const still = band.still.geometry.getAttribute("position"), out: Vec[] = [];
  for (const part of band.still.userData.parts as Part[]) if (of(part.of) && part.by === k) for (let i = part.from; i < part.from + part.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(still, i));
  return out;
}
const middleOf = (points: Vec[]) => points.reduce((sum, c) => sum.add(c), new THREE.Vector3()).divideScalar(points.length);
// A player's microphone (band.test.ts `microphoneOf`): the middle of its stand's foot, and the middle of the end of its capsule away
// from the foot.
function microphoneOf(band: Band, k: number) {
  const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
  const bars = (band.still.userData.parts as Part[]).filter((part) => part.of === "microphone" && part.by === k).map((part) => {
    const out: Vec[] = [];
    for (let i = part.from; i < part.from + part.count; i++) out.push(at.fromBufferAttribute(still, i).clone());
    return out;
  });
  if (!bars.length) return null;
  const all = bars.flat(), low = Math.min(...all.map((c) => c.y)), foot = middleOf(all.filter((c) => c.y < low + 0.001));
  const capsule = bars.reduce((best, b) => (Math.max(...b.map((c) => c.y)) > Math.max(...best.map((c) => c.y)) ? b : best)), middle = middleOf(capsule);
  return { foot, head: middleOf(capsule.filter((c) => gap(c, foot) > gap(middle, foot))) };
}
// A point of the stage in a player's own frame and their own metres, where +x is their left and +z the way they face.
const own = (band: Band, of: number, at: Vec) => new THREE.Vector3(at.x, at.y, at.z).applyMatrix4(band.players[of].g.matrix.clone().invert());

describe.each(lineups.map((roles) => [roles.join(", "), roles] as const))("the line-up %s, as it is built", (_, roles) => {
  const built = stand(roles), { band, stage } = built;
  const players: Player[] = band.players;

  it("is a player for each role of its row, from the crowd's left, the drummers and the keyboards at the back and the singer and the bass at the front", () => {
    expect(players.map((p) => p.role).sort()).toEqual([...roles].sort());
    const across = players.map((p) => p.g.position.x), deep = players.map((p) => p.g.position.z);
    expect(across).toEqual([...across].sort((a, b) => a - b));
    const back = players.flatMap((p, k) => (["drums", "organ", "keys", "piano"].includes(p.role) ? [deep[k]] : []));
    const front = players.flatMap((p, k) => (["lead", "rhythm", "bass", "voice"].includes(p.role) ? [deep[k]] : []));
    expect(Math.max(...back)).toBeLessThan(Math.min(...front));
    // The bass and the singer stand furthest forward but for each other.
    const ahead = [...players].sort((a, b) => b.g.position.z - a.g.position.z).map((p) => p.role).slice(0, roles.includes("voice") ? 2 : 1);
    expect(ahead.sort()).toEqual(roles.includes("voice") ? ["bass", "voice"] : ["bass"]);
  });

  it("draws everything with one material, flat black and unlit, at three's default order, in a draw for each player whose body moves, one for the limbs and one for the still parts: eight at the most, as the six are drawn", () => {
    const meshes: { material: unknown; renderOrder: number; isInstancedMesh?: boolean }[] = [];
    stage.traverse((part: { isMesh?: boolean; material: unknown; renderOrder: number }) => {
      if (part.isMesh) meshes.push(part);
    });
    expect(meshes).toHaveLength(players.filter((p) => !p.still).length + 2);
    expect(meshes.length).toBeLessThanOrEqual(stand(SIX).band.players.length + 2);
    expect(meshes.filter((m) => m.isInstancedMesh)).toHaveLength(1);
    expect(meshes.filter((m) => m.material !== band.black || m.renderOrder !== 0)).toEqual([]);
    expect([band.black.isMeshBasicMaterial, band.black.color.getHex(), band.black.transparent]).toEqual([true, 0x0b0b0d, false]);
    // Only a keyboard's player holds still, among the still parts.
    expect(players.filter((p) => p.still).map((p) => p.role)).toEqual(players.filter((p) => ["organ", "piano"].includes(p.role)).map((p) => p.role));
  });

  // The six are 10,500 at the most (band.test.ts), and so is any line-up of six or five; a seven, a player more, 12,000: the sevens
  // count 10,516 to 11,496.
  it("is at most 10,500 triangles, or a seven 12,000", () => {
    let triangles = 0;
    stage.traverse((part: { isMesh?: boolean; isInstancedMesh?: boolean; count: number; geometry: { getAttribute(name: string): { count: number } } }) => {
      if (part.isMesh) triangles += (part.geometry.getAttribute("position").count / 3) * (part.isInstancedMesh ? part.count : 1);
    });
    expect(triangles).toBeLessThanOrEqual(roles.length > 6 ? 12_000 : 10_500);
  });

  // A line-up that stands close (band.js CLOSE), the sevens', stands a twentieth smaller.
  const tall = PERSON * ((STAGING as Record<string, { close?: boolean }>)[roles.join(" ")].close ? 0.95 : 1);
  it("stands the players as tall as the crowd, or a line-up that stands close a twentieth under it: a standing head within 0.2 m of that height, a seated one 0.35 to 0.65 m under it; and no two who stand of one height", () => {
    const tops = new Map<number, number>();
    corners(built, (at, of, by) => {
      if (by !== null && (of === "body" || of === "head")) tops.set(by, Math.max(tops.get(by) ?? -Infinity, at.y - FLOOR));
    });
    const standing: number[] = [];
    players.forEach((p, k) => {
      const top = tops.get(k)!, seated = p.role === "drums" || p.role === "piano";
      expect([p.role, seated ? top > tall - 0.65 && top < tall - 0.35 : Math.abs(top - tall) < 0.2]).toEqual([p.role, true]);
      if (!seated) standing.push(Math.round(top * 100));
    });
    expect(new Set(standing).size).toBe(standing.length);
  });

  it("puts every foot on the floor and nothing under it, and stands every stand, kit, keyboard, bench and monitor on the floor or on a piece that does", () => {
    let under = Infinity;
    const lowest = new Map<string, number>();
    corners(built, (at, of, by) => {
      under = Math.min(under, at.y);
      if (/shoe$|tapping foot$/.test(of)) lowest.set(`${of} of ${by}`, Math.min(lowest.get(`${of} of ${by}`) ?? Infinity, at.y));
    });
    expect(under).toBeGreaterThan(FLOOR - 1e-4);
    for (const [of, y] of lowest) expect([of, Math.abs(y - FLOOR) < 0.005]).toEqual([of, true]);
    // Each player stands on two feet, or sits with them on the floor.
    expect(players.map((_, k) => [...lowest.keys()].filter((name) => name.endsWith(` of ${k}`)).length >= 1)).toEqual(players.map(() => true));
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    const pieces = new Map<string, { box: { min: Vec; intersectsBox(other: unknown): boolean; expandByScalar(by: number): unknown }; held: boolean }[]>();
    for (const part of band.still.userData.parts as Part[]) {
      if (!["microphone", "kit", "keyboard", "bench", "monitor"].includes(part.of)) continue;
      const box = new THREE.Box3();
      for (let i = part.from; i < part.from + part.count; i++) box.expandByPoint(at.fromBufferAttribute(still, i));
      const name = `${part.of} of ${part.by}`;
      pieces.set(name, [...(pieces.get(name) ?? []), { box, held: box.min.y - FLOOR < 0.03 }]);
      box.expandByScalar(0.01);
    }
    for (const [name, group] of pieces) {
      for (let pass = 0; pass < group.length; pass++) for (const piece of group) if (!piece.held && group.some((other) => other.held && other.box.intersectsBox(piece.box))) piece.held = true;
      expect([name, group.filter((piece) => !piece.held).length]).toEqual([name, 0]);
    }
    // A keyboard for each who plays one, a kit for each drummer, and the pianist's bench.
    const owned = (of: string) => players.flatMap((_, k) => (stillOf(band, (name) => name === of, k).length ? [players[k].role] : []));
    expect(owned("keyboard")).toEqual(players.filter((p) => ["organ", "keys", "piano"].includes(p.role)).map((p) => p.role));
    expect(owned("kit")).toEqual(players.filter((p) => p.role === "drums").map((p) => p.role));
    expect(owned("bench")).toEqual(roles.includes("piano") ? ["piano"] : []);
  });

  it("keeps on the platform's floor, in front of the light panel and under the top third of it", () => {
    const edge = FLOOR_R * Math.cos(Math.PI / FLOOR_SIDES), top = PANEL.y - PANEL.h / 2 + (2 * PANEL.h) / 3;
    const out = new Set<string>();
    corners(built, (at, of, by) => {
      if (Math.hypot(at.x, at.z) > edge || Math.abs(at.x) > PANEL.w / 2 || at.z < PANEL.z + 0.2 || at.y > top) out.add(`${of} of ${by}`);
    });
    expect([...out]).toEqual([]);
  });

  it("is laid before anything plays it, and a frame at a standstill leaves it so: every bone at its joints", () => {
    for (let k = 0; k < band.bones.length; k++) expect(ends(band, k).a.y).toBeGreaterThan(FLOOR);
    for (const joint of band.joints as Joint[]) expect(gap(ends(band, joint.bone)[joint.end ? "b" : "a"], held(band, joint))).toBeLessThan(2e-4);
    const before = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    band.move(1 / 60, 0, 0, false);
    expect(Array.from(band.limbs.instanceMatrix.array as Float32Array)).toEqual(before);
  });

  it("stands each microphone at its singer's mouth: its head within 3 cm of the face's front at its height, and its stand toward the crowd from there", () => {
    stage.updateMatrixWorld(true);
    const singing = players.flatMap((p, k) => {
      const found = microphoneOf(band, k);
      if (!found) return [];
      const mic = own(band, k, found.head);
      // The face's front at that height: the corners of the body and the head within 4 cm of it up and down and 6 cm to either side.
      let face = -Infinity;
      corners(built, (at, of, by) => {
        if (by !== k || !["body", "head"].includes(of)) return;
        const c = own(band, k, at);
        if (Math.abs(c.y - mic.y) < 0.04 && Math.abs(c.x - mic.x) < 0.06) face = Math.max(face, c.z);
      });
      const { foot, head } = found;
      return [{ role: p.role, before: mic.z - face, toward: Math.abs(Math.atan2(foot.x - head.x, foot.z - head.z)) }];
    });
    // Every one who stands sings but the pianist, who is seated side-on; no drummer does.
    expect(singing.map(({ role }) => role)).toEqual(players.filter((p) => !["drums", "piano"].includes(p.role)).map((p) => p.role));
    // The stand's foot lies toward the crowd from the head, within 0.2 rad, and for one at a keyboard, who turns from the crowd, 0.35.
    for (const { role, before, toward } of singing) expect([role, before > -0.03 && before < 0.03, toward < (["organ", "keys"].includes(role) ? 0.35 : 0.2)]).toEqual([role, true, true]);
  });

  it("dresses no two of the line-up alike, and no keyboard's player or singer as a fan knows one", () => {
    expect(new Set(players.map((p) => p.look.hair)).size).toBe(players.length);
    const standing = players.filter((p) => !["drums", "piano"].includes(p.role));
    expect(new Set(standing.map((p) => p.look.broad)).size).toBe(standing.length);
    for (const p of players) {
      if (p.role === "organ") expect([p.role, p.look.broad >= 1 || ["long", "cap"].includes(p.look.hair)]).toEqual([p.role, false]);
      if (p.role === "piano") expect([p.role, p.look.hair === "long"]).toEqual([p.role, false]);
      if (p.role === "voice") expect([p.role, p.look.hair === "long"]).toEqual([p.role, false]);
    }
  });

  it("gives the singer no instrument: hands that clap before the chest, and no neck, strumming arm or keyboard", () => {
    players.forEach((p, k) => {
      if (p.role !== "voice") return;
      const names = band.bones.filter((bone: Bone) => bone.of === k).map((bone: Bone) => bone.name);
      expect(p.plays).toBe("voice");
      expect(names.filter((name: string) => /strum|fret|stick/.test(name))).toEqual([]);
      expect(names.filter((name: string) => /clapping/.test(name)).sort()).toEqual(["left clapping forearm", "left clapping hand", "right clapping forearm", "right clapping hand"]);
      expect(stillOf(band, (name) => name === "keyboard" || name === "kit", k)).toEqual([]);
    });
  });
});

describe.each(lineups.map((roles) => [roles.join(", "), roles] as const))("the line-up %s, playing", (_, roles) => {
  it("stays joined through eight counts: no bone's end leaves the body, the floor or the bone that holds it by a fifth of a millimetre", () => {
    const { band, play } = stand(roles);
    let worst = 0;
    play(8 / 1.6 + 1, 96, true, () => {
      for (const joint of band.joints as Joint[]) worst = Math.max(worst, gap(ends(band, joint.bone)[joint.end ? "b" : "a"], held(band, joint)));
    });
    expect(worst).toBeLessThan(2e-4);
  });

  it("keeps the count under HALF_OVER a second and never runs it back, into a fast song and out of it", () => {
    const { band, clock } = stand(roles);
    let last = 0, fastest = 0, back = 0;
    for (let frame = 0; frame < 900; frame++) {
      clock.beats += (frame < 450 ? 160 : 96) / 3600;
      const count = band.move(1 / 60, frame / 60, clock.beats, true);
      if (frame > 0) {
        fastest = Math.max(fastest, (count - last) * 60);
        back = Math.min(back, count - last);
      }
      last = count;
    }
    expect([fastest <= HALF_OVER + 1e-9, back]).toEqual([true, 0]);
  });

  it("comes back to rest when the show stops: with the world's time held, every bone lies as it was built", () => {
    const { band, clock, play } = stand(roles);
    const before = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    play(3, 96);
    for (let frame = 0; frame < 120; frame++) band.move(1 / 60, 0, (clock.beats += 1.6 / 60), false);
    const after = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    expect(Math.max(...after.map((value, k) => Math.abs(value - before[k])))).toBeLessThan(1e-6);
  });

  // The band's rule for a move (band.js MOVE): it holds still, goes at an even pace and holds again. Each part of a player in a role
  // the six did not have is followed through sixteen counts at 96 a minute: every run of frames in which it moves is over within
  // MOVE of a count (a keyboard player's lift, LIFT_MOVE, as the keys player's on main), and goes at an even pace, never slower in
  // its middle than a third of its fastest, so it eases into no stop. A frame either side of a run is allowed: a run's ends fall
  // between frames.
  const mine = [...new Set(roles.filter((role) => NEW.includes(role)))];
  if (mine.length) it(`moves each player of a new role (${mine.join(", ")}) by holds and even moves, each within a third of a count, a keyboard's lift within a count`, () => {
    const { band, stage, play } = stand(roles);
    play(3, 96);
    const players: Player[] = band.players;
    const followed = players.flatMap((p, k) => (NEW.includes(p.role) ? [k] : []));
    const series = new Map<string, Vec[]>();
    const sample = () => {
      stage.updateMatrixWorld(true);
      for (const k of followed) {
        band.bones.forEach((bone: Bone, n: number) => {
          if (bone.of !== k) return;
          const { a, b } = ends(band, n);
          for (const [end, at] of [["a", a], ["b", b]] as const) series.set(`${k} ${bone.name} ${end}`, [...(series.get(`${k} ${bone.name} ${end}`) ?? []), at]);
        });
        const p = players[k];
        if (!p.still) {
          const body = p.body.geometry!.getAttribute("position"), at = new THREE.Vector3();
          for (const i of [0, Math.floor(body.count / 2), body.count - 1]) series.set(`${k} body ${i}`, [...(series.get(`${k} body ${i}`) ?? []), at.fromBufferAttribute(body, i).applyMatrix4(p.body.matrixWorld).clone()]);
        }
      }
    };
    const seen = new Set<string>();
    play(10, 96, true, sample);
    const perFrame = 1.6 / 60;
    for (const [name, at] of series) {
      const k = Number(name.split(" ")[0]), role = players[k].role, most = role === "voice" ? MOVE : LIFT_MOVE;
      const speed = at.slice(1).map((c, i) => gap(c, at[i]));
      let run: number[] = [];
      const close = () => {
        if (run.length > 2) {
          const inner = run.slice(1, -1), fastest = Math.max(...run);
          seen.add(role);
          expect([name, run.length * perFrame <= most + 2 * perFrame, Math.min(...inner) >= fastest / 3]).toEqual([name, true, true]);
        }
        run = [];
      };
      for (const v of speed) {
        if (v > 1e-6) run.push(v);
        else close();
      }
      close();
    }
    // Each new role moves at all.
    expect([...seen].sort()).toEqual([...mine].sort());
  });

  it("makes no Vector3, Matrix4, Quaternion, Euler or Float32Array in a frame: six hundred frames of playing, stopping and a change of tempo construct none", () => {
    const { band, clock } = stand(roles);
    let arrays = 0;
    const Counted = class extends Float32Array {
      constructor(...args: ConstructorParameters<typeof Float32Array>) {
        super(...args);
        arrays += 1;
      }
    };
    vi.stubGlobal("Float32Array", Counted);
    const before = made.count;
    for (let frame = 0; frame < 600; frame++) {
      clock.beats += (frame < 300 ? 96 : 156) / 3600;
      band.move(1 / 60, frame / 60, clock.beats, frame < 200 || frame > 260);
    }
    expect([made.count - before, arrays]).toEqual([0, 0]);
  });
});

it("builds every line-up of the table, and refuses one it has no staging for", () => {
  expect(lineups).toHaveLength(Object.keys(STAGING).length);
  expect(() => buildBand(new THREE.Group(), FLOOR, ["lead", "bass", "drums"])).toThrow(/no staging/);
});
