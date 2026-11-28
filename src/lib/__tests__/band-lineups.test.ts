import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildBand, HALF_OVER, SIX, STAGING } from "../../../public/world/band.js";
import { LINEUPS, lineupOn } from "../../../public/world/lineup.js";
import { PERSON } from "../../../public/world/seats.js";
import { buildStage, FLOOR, FLOOR_R, FLOOR_SIDES, PANEL } from "../../../public/world/stage.js";

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

// The keyboards' roles; and a frame's counts at 96 a minute, the tempo the moves are followed at.
const KEYBOARDS = ["keys", "organ", "piano"], PER_FRAME = 1.6 / 60;

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
// from the boom, which holds it at its other end; and its parts (band.js `microphone`: the stand, the capsule, the boom and the
// base), each as its corners.
function microphoneOf(band: Band, k: number) {
  const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
  const bars = (band.still.userData.parts as Part[]).filter((part) => part.of === "microphone" && part.by === k).map((part) => {
    const out: Vec[] = [];
    for (let i = part.from; i < part.from + part.count; i++) out.push(at.fromBufferAttribute(still, i).clone());
    return out;
  });
  if (!bars.length) return null;
  const all = bars.flat(), low = Math.min(...all.map((c) => c.y)), foot = middleOf(all.filter((c) => c.y < low + 0.001));
  const capsule = bars[1], from = (c: Vec) => Math.min(...bars[2].map((b) => gap(b, c))), middle = from(middleOf(capsule));
  return { foot, head: middleOf(capsule.filter((c) => from(c) > middle)), bars };
}
// A point of the stage in a player's own frame and their own metres, where +x is their left and +z the way they face.
const own = (band: Band, of: number, at: Vec) => new THREE.Vector3(at.x, at.y, at.z).applyMatrix4(band.players[of].g.matrix.clone().invert());
// The runs of frames in which each part of the players `follow` picks moves, played from rest 3 s and followed 10 s more at 96 a minute
// (sixteen counts): each bone's two ends, and three corners of a body that moves, by name ("player part end"), each run as the
// distance its part goes each frame of it, a frame being in a run where its part moves over a micrometre. A run cut off by either end
// of the ten seconds is left out.
function moving(roles: string[], follow: (p: Player) => boolean) {
  const { band, stage, play } = stand(roles);
  play(3, 96);
  const players: Player[] = band.players;
  const followed = players.flatMap((p, k) => (follow(p) ? [k] : []));
  const series = new Map<string, Vec[]>();
  const add = (name: string, at: Vec) => series.set(name, [...(series.get(name) ?? []), at]);
  play(10, 96, true, () => {
    stage.updateMatrixWorld(true);
    for (const k of followed) {
      band.bones.forEach((bone: Bone, n: number) => {
        if (bone.of !== k) return;
        const { a, b } = ends(band, n);
        add(`${k} ${bone.name} a`, a);
        add(`${k} ${bone.name} b`, b);
      });
      const p = players[k];
      if (!p.still) {
        const body = p.body.geometry!.getAttribute("position");
        for (const i of [0, Math.floor(body.count / 2), body.count - 1]) add(`${k} body ${i}`, new THREE.Vector3().fromBufferAttribute(body, i).applyMatrix4(p.body.matrixWorld));
      }
    }
  });
  const runs = new Map<string, number[][]>();
  for (const [name, at] of series) {
    const speed = at.slice(1).map((c, i) => gap(c, at[i])), list: number[][] = [];
    let run: number[] = [], whole = speed[0] <= 1e-6;
    for (const v of speed) {
      if (v > 1e-6) run.push(v);
      else {
        if (run.length && whole) list.push(run);
        run = [];
        whole = true;
      }
    }
    runs.set(name, list);
  }
  return { players, runs };
}

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

  it("draws everything with one material, the band's own lit one in its corners' colours, at three's default order, in a draw for each player whose body moves, one for the limbs and one for the still parts: eight at the most, as the six are drawn", () => {
    const meshes: { material: unknown; renderOrder: number; isInstancedMesh?: boolean }[] = [];
    stage.traverse((part: { isMesh?: boolean; material: unknown; renderOrder: number }) => {
      if (part.isMesh) meshes.push(part);
    });
    expect(meshes).toHaveLength(players.filter((p) => !p.still).length + 2);
    expect(meshes.length).toBeLessThanOrEqual(stand(SIX).band.players.length + 2);
    expect(meshes.filter((m) => m.isInstancedMesh)).toHaveLength(1);
    expect(meshes.filter((m) => m.material !== band.material || m.renderOrder !== 0)).toEqual([]);
    expect([band.material.isMeshLambertMaterial, band.material.vertexColors, band.material.transparent]).toEqual([true, true, false]);
    // Only a keyboard's player holds still, among the still parts.
    expect(players.filter((p) => p.still).map((p) => p.role)).toEqual(players.filter((p) => ["organ", "piano"].includes(p.role)).map((p) => p.role));
  });

  // The six are 20,500 at the most (band.test.ts), and so is any line-up of six or five; a seven, a player more, 23,500: shaped as
  // people, the fives and sixes count 16,394 to 19,754 and the sevens 19,526 to 23,030.
  it("is at most 20,500 triangles, or a seven 23,500", () => {
    let triangles = 0;
    stage.traverse((part: { isMesh?: boolean; isInstancedMesh?: boolean; count: number; geometry: { getAttribute(name: string): { count: number } } }) => {
      if (part.isMesh) triangles += (part.geometry.getAttribute("position").count / 3) * (part.isInstancedMesh ? part.count : 1);
    });
    expect(triangles).toBeLessThanOrEqual(roles.length > 6 ? 23_500 : 20_500);
  });

  // A line-up that stands close (band.js CLOSE), the sevens', stands a twentieth smaller.
  // The side the singer's microphone stands on, and the hand that holds it: their left (+x), but where the line-up's staging says.
  const singerSide = ((STAGING as Record<string, { players: unknown[][] }>)[roles.join(" ")].players.find(([role]) => role === "voice")?.[4] as { side?: number } | undefined)?.side ?? 1;
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

  it("stands each microphone at its singer's mouth: its head 5 to 7 cm before the face's front at its height, on a boom from a stand beside the player, on the side a guitarist strums on, the singer's left, or on a keyboard player's side toward the stage's middle", () => {
    stage.updateMatrixWorld(true);
    const singing = players.flatMap((p, k) => {
      const found = microphoneOf(band, k);
      if (!found) return [];
      const mic = own(band, k, found.head);
      // The face's front at that height: the corners of the head within 4 cm of it up and down and 6 cm to either side. (The body
      // reaches no higher than the collar, but for the singer's hand, which holds the microphone before the face.)
      let face = -Infinity;
      corners(built, (at, of, by) => {
        if (by !== k || of !== "head") return;
        const c = own(band, k, at);
        if (Math.abs(c.y - mic.y) < 0.04 && Math.abs(c.x - mic.x) < 0.06) face = Math.max(face, c.z);
      });
      const { foot, head, bars } = found, s = p.g.scale.x;
      const boom = bars.filter((c) => Math.min(...c.map((q) => Math.hypot(q.x - foot.x, q.z - foot.z))) < 0.05 * s && Math.min(...c.map((q) => gap(q, head))) < 0.15 * s).length;
      // The side toward the stage's middle, in the player's frame: a keyboard stands at an end of the stage, turned in.
      const inward = -Math.sign(p.g.position.x);
      return [{ role: p.role, before: mic.z - face, foot: own(band, k, foot), inward, boom }];
    });
    // Every one who stands sings but the pianist, who is seated side-on; no drummer does.
    expect(singing.map(({ role }) => role)).toEqual(players.filter((p) => !["drums", "piano"].includes(p.role)).map((p) => p.role));
    // In the player's own metres, whichever way they turn (band.js MIC): the microphone's head 6 cm before the face, which keeps it
    // off the face (band.test.ts, the faceless test). The stand's foot lies, each within a centimetre: with a guitar or the bass to
    // their right (-x), the side they strum on, 18 cm further out than the shoulder's joint and 4 cm behind their middle (-z); the
    // singer's as far out on the side of the hand that holds the boom, their left (+x) but for early 1972's, and 8 cm before their
    // middle, clear of the arm that reaches forward to it (band.js SINGING); at a keyboard 52 cm out to the side toward the stage's
    // middle and 10 cm behind. And one part, the boom, reaches from within 5 cm of the stand's line to within 15 cm of the
    // head (band.test.ts). The singer's stand leaned in to the mouth from 42 cm before them, a pole down their front from the crowd.
    for (const { role, before, foot, inward, boom } of singing) {
      const p = players.find((q) => q.role === role)!, [side, beside, back] = role === "keys" || role === "organ" ? [inward, 0.52, -0.1] : role === "voice" ? [singerSide, 0.205 * p.look.broad + 0.18, 0.08] : [-1, 0.205 * p.look.broad + 0.18, -0.04];
      expect([role, before > 0.05 && before < 0.07, Math.abs(foot.x - side * beside) < 0.01, Math.abs(foot.z - back) < 0.01, boom]).toEqual([role, true, true, true, 1]);
    }
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

  // The singer's arms are the body's, and the tambourine with them (band.js `singer`): the hand on the microphone's side, their left
  // but for early 1972's, holds its boom behind the microphone, and the other hangs to the thigh, the tambourine's disc before it.
  it("gives the singer no instrument but a tambourine: a hand on the microphone's boom, behind the microphone, the tambourine before the other thigh, and no neck, strumming arm, stick or keyboard", () => {
    stage.updateMatrixWorld(true);
    players.forEach((p, k) => {
      if (p.role !== "voice") return;
      const names = band.bones.filter((bone: Bone) => bone.of === k).map((bone: Bone) => bone.name);
      expect(p.plays).toBe("voice");
      expect(names.filter((name: string) => /strum|fret|stick|hand|forearm/.test(name))).toEqual([]);
      expect(stillOf(band, (name) => name === "keyboard" || name === "kit", k)).toEqual([]);
      // In the singer's own frame and metres: the microphone's head, the boom from the stand's top to its end at the microphone, and
      // the body's corners.
      const { head, bars } = microphoneOf(band, k)!, mic = own(band, k, head), body: Vec[] = [];
      const upright = bars[0].map((c) => own(band, k, c)), boom = bars[2].map((c) => own(band, k, c)), high = Math.max(...upright.map((c) => c.y));
      const top = middleOf(upright.filter((c) => c.y > high - 0.001)), far = Math.max(...boom.map((c) => gap(c, top))), end = middleOf(boom.filter((c) => gap(c, top) > far - 0.01));
      corners(built, (at, of, by) => { if (by === k && of === "body") body.push(own(band, k, at)); });
      // A hand round the boom: where the body comes within 2 cm of the boom's line in its last 25 cm, it is 5 to 20 cm from its end
      // along it, and none of the body is over the microphone's head. The hand closes on it 12 cm behind its end (band.js `singer`,
      // DEAL.voice's `grip`), and its corners come within 2 cm of the line from 5.5 cm to 17 cm. (Further back the boom passes in
      // front of the left shoulder, as a guitarist's does in front of the strumming shoulder.)
      const along = new THREE.Vector3().subVectors(end, top), length = along.length();
      along.normalize();
      const on = body.map((c) => { const t = Math.min(length, Math.max(0, new THREE.Vector3().subVectors(c, top).dot(along))); return { off: gap(c, top.clone().addScaledVector(along, t)), back: length - t }; });
      const held = on.filter((c) => c.off < 0.02 && c.back < 0.25).map((c) => c.back);
      expect([held.length > 0, Math.min(...held) > 0.05 && Math.max(...held) < 0.2, Math.max(...body.map((c) => c.y)) < mic.y]).toEqual([true, true, true]);
      // The tambourine, before the other thigh and out past it: the body 25 cm and more to that side of the middle under the hips,
      // and before the thigh, and nothing of the body as far out under the hips on the microphone's side.
      const hips = 0.92, low = body.filter((c) => c.y < hips + 0.05 && c.z > 0.1).map((c) => c.x * singerSide);
      expect([Math.min(...low) < -0.25, Math.max(...low) < 0.25]).toEqual([true, true]);
    });
  });

  // The tip of each guitar's and the bass's neck, its head with it (band.js `fit`, NECK_PX): as wide across the strings as built
  // where NECK_PX of the canvas's pixel SEEN m off is no wider, widened in step with the pixel past that, and NECK_MOST times as
  // wide at the most, as from a phone's lower rungs. Measured from the corners `fit` moves, across the way it moves them: at a tenth
  // of the desktop's pixel, at the desktop's, where the tips are 1.5 to 1.7 times as wide as built, at half as much again, and at a
  // pixel of a whole rad.
  it("fits each neck's tip to the canvas's pixel: as built on a fine canvas, wider in step with the pixel, and three times as wide at the most", () => {
    const fresh: Band = stand(roles).band;
    const necked = (fresh.players as Player[]).flatMap((p, k) => (p.plays === "guitar" || p.plays === "bass" ? [k] : []));
    const corners = () => necked.map((k) => Float32Array.from(fresh.players[k].body.geometry.getAttribute("position").array as Float32Array));
    const fitted = (perPx: number) => {
      fresh.fit(perPx);
      return corners();
    };
    const built = corners(), most = fitted(1);
    // The corners `fit` moves, and the way it moves them, from the widest fit.
    const tips = necked.map((_, j) => {
      const moved: number[] = [], way = new THREE.Vector3(), d = new THREE.Vector3();
      for (let i = 0; i < built[j].length / 3; i++) {
        d.set(most[j][3 * i] - built[j][3 * i], most[j][3 * i + 1] - built[j][3 * i + 1], most[j][3 * i + 2] - built[j][3 * i + 2]);
        if (d.length() > 1e-6) moved.push(i);
        if (d.length() > way.length()) way.copy(d);
      }
      return { moved, way: way.normalize() };
    });
    const spread = (at: Float32Array[], j: number) => {
      const { moved, way } = tips[j], across = moved.map((i) => at[j][3 * i] * way.x + at[j][3 * i + 1] * way.y + at[j][3 * i + 2] * way.z);
      return Math.max(...across) - Math.min(...across);
    };
    const DESKTOP = (2 * Math.tan(Math.PI / 6)) / 900, NECK_MOST = 3;
    const [fine, desktop, more, whole] = [DESKTOP / 10, DESKTOP, DESKTOP * 1.5, 1].map((perPx) => {
      const at = fitted(perPx);
      return necked.map((_, j) => spread(at, j) / spread(built, j));
    });
    necked.forEach((k, j) => {
      expect([k, tips[j].moved.length > 0, fine[j], desktop[j] > 1.4, more[j] / desktop[j], whole[j]].map((v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v)))
        .toEqual([k, true, 1, true, 1.5, NECK_MOST]);
    });
  });

  // The stands `fit` widens (band.js): each microphone's stand, the singer's with the rest, and each of the organ's legs, upright,
  // widened across at each height about its own line so that its foot stays on the floor. At a pixel of a whole rad each is at its
  // most in radius in its player's metres: 0.036 as built, STOUT_MOST (0.12). The singer's stand leaned in to the mouth from the
  // floor before them, and was widened about its own leaning line, its ball of a microphone's head every way to 0.05: a pole down
  // their front wider than a guitar's neck on a phone (#224).
  it("fits each microphone's stand, the singer's too, and each of the organ's legs upright to the canvas's pixel, each foot staying on the floor", () => {
    const fresh: Band = stand(roles).band, still = fresh.still.geometry.getAttribute("position"), players = fresh.players as Player[], parts = fresh.still.userData.parts as Part[];
    const picked = parts.filter((part) => part.by !== null && ((part.of === "microphone" && parts.find((q) => q.of === "microphone" && q.by === part.by) === part) || (players[part.by].role === "organ" && part.as === "leg")));
    const read = () => picked.map((part) => Array.from({ length: part.count }, (_, i) => own(fresh, part.by!, new THREE.Vector3().fromBufferAttribute(still, part.from + i))));
    const built = read();
    fresh.fit(1);
    const most = read();
    const singing = players.filter((p, k) => parts.some((part) => part.of === "microphone" && part.by === k));
    expect(picked.map((part) => `${players[part.by!].role} ${part.as}`).sort()).toEqual([...(roles.includes("organ") ? ["organ leg", "organ leg", "organ leg", "organ leg"] : []), ...singing.map((p) => `${p.role} microphone`)].sort());
    if (roles.includes("voice")) expect(singing.some((p) => p.role === "voice")).toBe(true);
    picked.forEach((part, j) => {
      const name = `${players[part.by!].role} ${j}`, a = built[j], b = most[j], middle = (c: Vec[]) => middleOf(c.map((v) => new THREE.Vector3(v.x, v.y, v.z)));
      // Its middle stands where it stood, and its foot on the floor; and each corner moves only across, at its own height, 0.12 / 0.036
      // times as far from the upright line through its middle as built.
      const floor = Math.min(...a.map((c) => c.y)), centre = middle(a);
      expect([name, gap(centre, middle(b)) < 1e-4, Math.abs(floor - Math.min(...b.map((c) => c.y))) < 1e-5]).toEqual([name, true, true]);
      const off = (c: Vec) => Math.hypot(c.x - centre.x, c.z - centre.z), ratios = a.flatMap((c, i) => (off(c) > 0.01 ? [off(b[i]) / off(c)] : []));
      expect([name, a.every((c, i) => Math.abs(c.y - b[i].y) < 1e-6), Math.min(...ratios).toFixed(2), Math.max(...ratios).toFixed(2)]).toEqual([name, true, (0.12 / 0.036).toFixed(2), (0.12 / 0.036).toFixed(2)]);
    });
  });

  // What else `fit` makes as stout as a pixel of the canvas SEEN m off (band.js): each drummer's forearms, each keyboard player's
  // forearms and hands, even a pianist's hand that never lifts, each tapping foot, and the singer's thighs and shins. Each is read
  // from the limbs' mesh, across and through, in its player's own metres: as built on a fine canvas, a tenth of the desktop's
  // pixel; then as stout as SEEN times the pixel, 5 % over, across LIMB_FLATS of its width, and no less than built, up to its most,
  // at the desktop's pixel, half as much again and three times it, as from the back of the crowd on a phone; and at its most at a
  // pixel of a whole rad: a drummer's right forearm 0.17 and left 0.12 (DRUM_FOREARM), the rest three times STOUT_MOST. A drummer's
  // left forearm left as built passed every outline test but a sweep at 960 frames a second, where its wrist stood alone for 3 ms;
  // this fails it.
  it("fits each drummer's forearms, each keyboard player's forearms and hands, each tapping foot and the singer's legs to the canvas's pixel: as built on a fine canvas, stouter in step with the pixel, and at its most at a pixel of a whole rad", () => {
    const fresh: Band = stand(roles).band, m = new THREE.Matrix4(), axis = new THREE.Vector3();
    const kept = (bone: Bone) => {
      const role = (fresh.players as Player[])[bone.of].role, side = bone.name.split(" ")[0];
      if (role === "drums" && / forearm$/.test(bone.name)) return { built: [0.1, 0.1], most: side === "right" ? 0.17 : 0.12 };
      if (KEYBOARDS.includes(role) && / forearm$/.test(bone.name)) return { built: [0.1, 0.1], most: 0.36 };
      if (KEYBOARDS.includes(role) && / hand$/.test(bone.name)) return { built: [0.085, 0.045], most: 0.36 };
      if (bone.name === "tapping foot") return { built: [0.105, 0.085], most: 0.36 };
      if (role === "voice" && / thigh$/.test(bone.name)) return { built: [0.2, 0.2], most: 0.36 };
      if (role === "voice" && / shin$/.test(bone.name)) return { built: [0.148, 0.148], most: 0.36 };
      return null;
    };
    const fitted = (fresh.bones as Bone[]).flatMap((bone, k) => {
      const keep = kept(bone);
      return keep ? [{ k, name: `${(fresh.players as Player[])[bone.of].role} ${bone.of} ${bone.name}`, scale: (fresh.players as Player[])[bone.of].g.scale.x, ...keep }] : [];
    });
    // Each drummer two forearms, each keyboard player two of each, a foot for each who taps, and the singer's two thighs and shins.
    const tappers = (fresh.players as Player[]).filter((p) => !["drums", ...KEYBOARDS].includes(p.role)).length;
    const players = fresh.players as Player[];
    expect(fitted.length).toBe(players.filter((p) => p.role === "drums").length * 2 + players.filter((p) => KEYBOARDS.includes(p.role)).length * 4 + tappers + players.filter((p) => p.role === "voice").length * 4);
    const sizes = (perPx: number) => {
      fresh.fit(perPx);
      return fitted.map(({ k, scale }) => {
        fresh.limbs.getMatrixAt(k, m);
        return [0, 2].map((column) => axis.setFromMatrixColumn(m, column).length() / scale);
      });
    };
    const DESKTOP = (2 * Math.tan(Math.PI / 6)) / 900, round = (v: number) => Math.round(v * 1e4) / 1e4;
    // A limb is eight-sided and 0.7 across at its narrowest (band.js LIMB), so it is 0.7 cos(π/8) of its width across its flats there.
    const least = (perPx: number, scale: number) => (95 * perPx * 1.05) / (0.7 * Math.cos(Math.PI / 8) * scale);
    const canvases = [DESKTOP, DESKTOP * 1.5, DESKTOP * 3], [fine, whole] = [DESKTOP / 10, 1].map(sizes), coarser = canvases.map(sizes);
    fitted.forEach(({ name, built, most, scale }, j) => {
      const stout = (perPx: number) => built.map((b) => round(Math.max(b, Math.min(most, least(perPx, scale)))));
      expect([name, fine[j].map(round), ...coarser.map((at) => at[j].map(round)), whole[j].map(round)]).toEqual([name, built, ...canvases.map(stout), [most, most]]);
    });
    // The parts the desktop's pixel leaves as built are all legs: every forearm, hand and foot is stouter than built there, so its
    // next test is of the fit; the legs are only from a phone's pixel on, three times the desktop's or so.
    expect(fitted.filter(({ built, scale }) => Math.max(...built) >= least(DESKTOP, scale)).map(({ name }) => name).every((name) => / (thigh|shin)$/.test(name))).toBe(true);
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
    const { players, runs } = moving(roles, (p) => NEW.includes(p.role));
    const seen = new Set<string>();
    for (const [name, list] of runs) {
      const role = players[Number(name.split(" ")[0])].role, most = role === "voice" ? MOVE : LIFT_MOVE;
      for (const run of list.filter((r) => r.length > 2)) {
        const inner = run.slice(1, -1), fastest = Math.max(...run);
        seen.add(role);
        expect([name, run.length * PER_FRAME <= most + 2 * PER_FRAME, Math.min(...inner) >= fastest / 3]).toEqual([name, true, true]);
      }
    }
    // Each new role moves at all.
    expect([...seen].sort()).toEqual([...mine].sort());
  });

  // And a keyboard player's lift takes its whole count (band.js LIFT_MOVE), the keys player's as the organ's and the pianist's: every
  // run of frames in which any part of a keyboard player moves, through sixteen counts at 96 a minute, lasts LIFT_MOVE of a count to
  // a frame either side, so a lift that set off and stopped sooner fails here as one that took longer does.
  const keyboards = [...new Set(roles.filter((role) => KEYBOARDS.includes(role)))];
  if (keyboards.length) it(`lifts each keyboard player's hands (${keyboards.join(", ")}) over a count, no sooner and no later`, () => {
    const { players, runs } = moving(roles, (p) => KEYBOARDS.includes(p.role));
    const seen = new Set<string>();
    for (const [name, list] of runs) {
      const role = players[Number(name.split(" ")[0])].role;
      for (const run of list) {
        seen.add(role);
        expect([name, Math.abs(run.length * PER_FRAME - LIFT_MOVE) <= 2 * PER_FRAME]).toEqual([name, true]);
      }
    }
    expect([...seen].sort()).toEqual([...keyboards].sort());
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

// Each line-up of the table is held to its outlines by a file of its own (band-outline.ts), so that vitest draws them side by side:
// each band-outline test file calls outlineChecks once, with a day of the line-up's row, and the files' line-ups are the
// table's, each once. Read from the files themselves: a line-up added to the table with no file, a file dropped, or two files for one
// line-up fails here.
it("has a file of outline tests for every line-up of the table, and one only", () => {
  const here = new URL(".", import.meta.url);
  const files = readdirSync(here).filter((file) => /^band-outline.*\.test\.ts$/.test(file)).sort();
  const held = files.map((file) => {
    const text = readFileSync(new URL(file, here), "utf8");
    const days = [...text.matchAll(/\boutlineChecks\(\s*"[^"]*",\s*"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
    expect([file, (text.match(/\boutlineChecks\(/g) ?? []).length, days.length]).toEqual([file, 1, 1]);
    return (lineupOn(days[0]).roles as string[]).join(" ");
  });
  expect(held.sort()).toEqual(lineups.map((roles) => roles.join(" ")).sort());
});

// The stage builds the band itself (stage.js), as the line-up of the show it is given, and the six without one: the stage as main.js
// builds it, for a show of each of three eras none of whose line-ups is another's or the six, its players' roles against the table's
// row for the date.
it("is built by the stage as the line-up of the show on its date, and as the six with no date", () => {
  const roles = (showDate?: string) => {
    const built = buildStage(new THREE.Scene(), null, false, new THREE.MeshBasicMaterial(), { uC0: { value: null }, uC1: { value: null } }, showDate);
    const players: Player[] = built.band.players;
    expect(players.every((p) => (p.g as unknown as { parent: unknown }).parent === built.group)).toBe(true);
    return players.map((p) => p.role).sort();
  };
  const dates = ["1969-04-17", "1973-03-30", "1977-05-08"];
  expect(new Set([...dates.map((date) => (lineupOn(date).roles as string[]).join(" ")), SIX.join(" ")]).size).toBe(dates.length + 1);
  for (const date of dates) expect([date, roles(date)]).toEqual([date, [...(lineupOn(date).roles as string[])].sort()]);
  expect(roles()).toEqual([...SIX].sort());
});
