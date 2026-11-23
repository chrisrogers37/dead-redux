import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildBand, HALF_OVER, HALF_UNDER, SCALE } from "../../../public/world/band.js";
import { beatStep } from "../../../public/world/beat.js";
import { PERSON } from "../../../public/world/seats.js";
import { FLOOR, FLOOR_R, FLOOR_SIDES, PANEL } from "../../../public/world/stage.js";

// public/world/band.js builds the band here as stage.js builds it, from three itself, in a group of the test's own that stands where
// the stage's does in its own frame: at its origin, so a corner's place in the world here is its place on the stage. Nothing is
// drawn: the tests read the meshes' corners and the matrices `move` writes.
//
// Three's own Vector3, Matrix4, Quaternion and Euler are counted as band.js makes them, so a frame that made one would show.

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

type Vec = { x: number; y: number; z: number };
type Bone = { of: number; name: string; pads: [number, number]; span: [number, number] | null; at: number };
type Joint = { bone: number; end: 0 | 1; of: number; on?: boolean; at?: unknown; to?: number };
type Part = { of: string; by: number | null; from: number; count: number };
type Band = ReturnType<typeof buildBand>;

// A band of the test's own, in its own group, and what plays it: `play` runs frames of 1/60 s at a tempo, as main.js's frame does,
// the figures' phase running on from the last frame's.
function stand() {
  const stage = new THREE.Group();
  const band: Band = buildBand(stage, FLOOR);
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
// Every corner the band has, where it stands in the stage's frame, with the name of the part it is a corner of.
function corners({ stage, band }: { stage: unknown; band: Band }, each: (at: Vec, of: string) => void) {
  (stage as { updateMatrixWorld(force: boolean): void }).updateMatrixWorld(true);
  const at = new THREE.Vector3();
  const still = band.still.geometry.getAttribute("position");
  for (const part of band.still.userData.parts) for (let i = part.from; i < part.from + part.count; i++) each(at.fromBufferAttribute(still, i), part.of);
  for (const p of band.players) {
    const body = p.body.geometry.getAttribute("position");
    for (let i = 0; i < body.count; i++) each(at.fromBufferAttribute(body, i).applyMatrix4(p.body.matrixWorld), `${p.plays}'s body`);
  }
  const limb = band.limbs.geometry.getAttribute("position");
  band.bones.forEach((bone: Bone, k: number) => {
    band.limbs.getMatrixAt(k, matrix);
    for (let i = 0; i < limb.count; i++) each(at.fromBufferAttribute(limb, i).applyMatrix4(matrix), bone.name);
  });
}

// A bone's two ends in the stage's frame, as its matrix lays it: the limb runs up its own y from its thick end, past each end by the
// bone's pad, in the player's own metres.
function ends(band: Band, k: number) {
  const bone: Bone = band.bones[k];
  band.limbs.getMatrixAt(k, matrix);
  const from = new THREE.Vector3().setFromMatrixPosition(matrix), along = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
  const length = along.length(), scale = band.players[bone.of].g.scale.x;
  along.divideScalar(length);
  return { a: from.clone().addScaledVector(along, bone.pads[0] * scale), b: from.clone().addScaledVector(along, length - bone.pads[1] * scale) };
}
// Where a joint holds its bone's end: at the end of the bone before it, or at a point of the player's body or of the floor they stand
// on, each as three's own matrices place it.
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
// A point of the stage in a player's own frame and their own metres, where +x is their left and +z the way they face.
const own = (band: Band, of: number, at: Vec) => new THREE.Vector3(at.x, at.y, at.z).applyMatrix4(band.players[of].g.matrix.clone().invert());
const boneNamed = (band: Band, of: number, name: string): number => band.bones.findIndex((bone: Bone) => bone.of === of && bone.name === name);

// How many times a series turns back: rises after falling or falls after rising, by more than `slack` each way. The slack is 5 mm, a
// quarter of a pixel from the front of the crowd: a turn smaller than that moves no edge on any screen.
function turns(series: number[], slack = 0.005) {
  let count = 0, way = 0, edge = series[0];
  for (const value of series) {
    if (way >= 0 && value < edge - slack) { if (way > 0) count += 1; way = -1; edge = value; }
    else if (way <= 0 && value > edge + slack) { if (way < 0) count += 1; way = 1; edge = value; }
    else if ((way > 0 && value > edge) || (way < 0 && value < edge)) edge = value;
  }
  return count;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the band, as it is built", () => {
  const built = stand(), { band, stage } = built;

  it("is six players: a bass, a guitar, two drummers, a guitar and keys, from the crowd's left", () => {
    expect(band.players.map((p: { plays: string }) => p.plays)).toEqual(["bass", "guitar", "drums", "drums", "guitar", "keys"]);
    const across = band.players.map((p: { g: { position: Vec } }) => p.g.position.x);
    expect(across).toEqual([...across].sort((a, b) => a - b));
  });

  it("draws everything with one material, flat black and unlit, never transparent, in eight draws at three's default order", () => {
    const meshes: { material: unknown; renderOrder: number; isInstancedMesh?: boolean }[] = [];
    const orders: number[] = [];
    stage.traverse((part: { isMesh?: boolean; material: unknown; renderOrder: number }) => {
      orders.push(part.renderOrder);
      if (part.isMesh) meshes.push(part);
    });
    // Six bodies, the limbs and the still parts.
    expect(meshes).toHaveLength(8);
    expect(meshes.filter((m) => m.isInstancedMesh)).toHaveLength(1);
    expect(meshes.filter((m) => m.material !== band.black)).toEqual([]);
    expect(band.black.isMeshBasicMaterial).toBe(true);
    expect(band.black.color.getHex()).toBe(0x0b0b0d);
    expect([band.black.transparent, band.black.vertexColors, band.black.map, band.black.depthWrite, band.black.blending]).toEqual([false, false, null, true, THREE.NormalBlending]);
    // The rig's beams draw at order 1 (main.js), after the band.
    expect(orders.filter((order) => order !== 0)).toEqual([]);
  });

  it("is at most 10,500 triangles, on every tier: the build takes no tier", () => {
    let triangles = 0;
    stage.traverse((part: { isMesh?: boolean; isInstancedMesh?: boolean; count: number; geometry: { index: unknown; getAttribute(name: string): { count: number } } }) => {
      if (!part.isMesh) return;
      expect(part.geometry.index).toBeNull();
      triangles += (part.geometry.getAttribute("position").count / 3) * (part.isInstancedMesh ? part.count : 1);
    });
    expect(buildBand.length).toBe(2);
    expect(triangles).toBeGreaterThan(5000);
    expect(triangles).toBeLessThanOrEqual(10_500);
    expect(band.limbs.count).toBe(band.bones.length);
  });

  it("stands the players as tall as the crowd: a standing head within 0.2 m of a figure's height, a seated one 0.35 to 0.65 m under it", () => {
    expect(SCALE * 1.78).toBeCloseTo(PERSON, 2);
    stage.updateMatrixWorld(true);
    const tops = band.players.map((p: { plays: string; body: unknown }) => ({ plays: p.plays, top: new THREE.Box3().setFromObject(p.body).max.y - FLOOR }));
    for (const { plays, top } of tops) {
      if (plays === "drums") {
        expect(top).toBeGreaterThan(PERSON - 0.65);
        expect(top).toBeLessThan(PERSON - 0.35);
      } else expect(Math.abs(top - PERSON)).toBeLessThan(0.2);
    }
    // No two of the standing four are one height.
    const standing = tops.filter(({ plays }: { plays: string }) => plays !== "drums").map(({ top }: { top: number }) => Math.round(top * 100));
    expect(new Set(standing).size).toBe(4);
  });

  it("puts every foot on the floor: the lowest corner of each of the twelve shoes is on it, and nothing of the band is under it", () => {
    const lowest = new Map<string, number>();
    let under = Infinity;
    corners(built, (at, of) => {
      under = Math.min(under, at.y);
      if (/shoe$|tapping foot$/.test(of)) lowest.set(of, Math.min(lowest.get(of) ?? Infinity, at.y));
    });
    expect(under).toBeGreaterThan(FLOOR - 1e-4);
    expect([...lowest.keys()].sort()).toEqual(["bass shoe", "drums shoe", "guitar shoe", "keys shoe", "tapping foot"]);
    for (const [of, y] of lowest) expect([of, Math.abs(y - FLOOR) < 0.005]).toEqual([of, true]);
    // Each shoe on its own: the still ones by the corners they hold, and each tapping foot by its bone.
    const still = band.still.geometry.getAttribute("position");
    const shoes = band.still.userData.parts.filter((part: { of: string }) => part.of.endsWith("shoe"));
    expect(shoes).toHaveLength(9);
    for (const part of shoes) {
      let y = Infinity;
      for (let i = part.from; i < part.from + part.count; i++) y = Math.min(y, still.getY(i));
      expect(Math.abs(y - FLOOR)).toBeLessThan(0.005);
    }
    const taps = band.bones.filter((bone: Bone) => bone.name === "tapping foot");
    expect(taps.map((bone: Bone) => band.players[bone.of].plays)).toEqual(["bass", "guitar", "guitar"]);
    const limb = band.limbs.geometry.getAttribute("position"), at = new THREE.Vector3();
    for (const bone of taps) {
      band.limbs.getMatrixAt(bone.at, matrix);
      let y = Infinity;
      for (let i = 0; i < limb.count; i++) y = Math.min(y, at.fromBufferAttribute(limb, i).applyMatrix4(matrix).y);
      expect(Math.abs(y - FLOOR)).toBeLessThan(0.005);
    }
  });

  it("stands nothing in the air: every shoe, stand, kit, keyboard, amplifier and monitor reaches the floor, and a cuff sits on its shoe", () => {
    const still = band.still.geometry.getAttribute("position");
    const lowest = new Map<string, number>();
    for (const part of band.still.userData.parts) {
      const name = `${part.of} of ${part.by}`;
      for (let i = part.from; i < part.from + part.count; i++) lowest.set(name, Math.min(lowest.get(name) ?? Infinity, still.getY(i)));
    }
    // A seated drummer's legs are the only still part that hangs: from the hips, down into the cuffs.
    const kinds = [...new Set([...lowest.keys()].map((name) => name.replace(/^(bass|guitar|keys|drums) /, "").replace(/ of .*/, "")))].sort();
    expect(kinds).toEqual(["amplifier", "cuff", "keyboard", "kit", "leg", "microphone", "monitor", "shoe"]);
    for (const [name, y] of lowest) expect([name, y - FLOOR < (name.includes("leg") ? 0.3 : name.includes("cuff") ? 0.15 : 0.03)]).toEqual([name, true]);
    // And piece by piece: every piece of a stand, a kit, a keyboard or an amplifier stands on the floor or on a piece that does. Two
    // pieces hold one another where their boxes meet, within 2 cm.
    const at = new THREE.Vector3(), pieces = new Map<string, { box: { min: Vec; max: Vec; intersectsBox(other: unknown): boolean; expandByScalar(by: number): unknown }; held: boolean }[]>();
    for (const part of band.still.userData.parts) {
      if (!["microphone", "kit", "keyboard", "amplifier"].includes(part.of)) continue;
      const box = new THREE.Box3();
      for (let i = part.from; i < part.from + part.count; i++) box.expandByPoint(at.fromBufferAttribute(still, i));
      const name = `${part.of} of ${part.by}`;
      pieces.set(name, [...(pieces.get(name) ?? []), { box, held: box.min.y - FLOOR < 0.03 }]);
      box.expandByScalar(0.01);
    }
    expect(pieces.size).toBe(8);
    for (const [name, group] of pieces) {
      for (let pass = 0; pass < group.length; pass++) for (const piece of group) if (!piece.held && group.some((other) => other.held && other.box.intersectsBox(piece.box))) piece.held = true;
      expect([name, group.length, group.filter((piece) => !piece.held).length]).toEqual([name, group.length, 0]);
    }
  });

  it("keeps on the platform's floor, in front of the light panel and under the top third of it", () => {
    // The floor's edge is FLOOR_SIDES straight sides: its corners stand FLOOR_R out, and the middle of a side nearer.
    const edge = FLOOR_R * Math.cos(Math.PI / FLOOR_SIDES), top = PANEL.y - PANEL.h / 2 + (2 * PANEL.h) / 3;
    const out: string[] = [];
    corners(built, (at, of) => {
      if (Math.hypot(at.x, at.z) > edge || Math.abs(at.x) > PANEL.w / 2 || at.z < PANEL.z + 0.2 || at.y > top) out.push(of);
    });
    expect([...new Set(out)]).toEqual([]);
  });

  it("is laid before anything plays it: every bone lies at its joints as built, the pose a frame at a standstill gives", () => {
    const before = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    // No bone is left where an instanced mesh starts them, all at its origin.
    for (let k = 0; k < band.bones.length; k++) expect(ends(band, k).a.y).toBeGreaterThan(FLOOR);
    for (const joint of band.joints as Joint[]) expect(gap(ends(band, joint.bone)[joint.end ? "b" : "a"], held(band, joint))).toBeLessThan(2e-4);
    const places = band.players.map((p: { body: { position: Vec; rotation: Vec } }) => [p.body.position.x, p.body.position.y, p.body.position.z, p.body.rotation.x, p.body.rotation.z]);
    band.move(1 / 60, 0, 0, false);
    expect(Array.from(band.limbs.instanceMatrix.array as Float32Array)).toEqual(before);
    expect(band.players.map((p: { body: { position: Vec; rotation: Vec } }) => [p.body.position.x, p.body.position.y, p.body.position.z, p.body.rotation.x, p.body.rotation.z])).toEqual(places);
  });

  it("rests every hand where it plays: the keys' on the keyboards, and each stick's tip on its drummer's kit", () => {
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    const cornersOf = (of: string, by: number) => {
      const out: Vec[] = [];
      for (const part of band.still.userData.parts) if (part.of === of && part.by === by) for (let i = part.from; i < part.from + part.count; i++) out.push(at.fromBufferAttribute(still, i).clone());
      return out;
    };
    const keys = band.players.findIndex((p: { plays: string }) => p.plays === "keys");
    const board = new THREE.Box3().setFromPoints(cornersOf("keyboard", keys));
    for (const name of ["left hand", "right hand"]) {
      const tip = ends(band, boneNamed(band, keys, name)).b;
      expect([tip.x > board.min.x, tip.x < board.max.x, tip.z > board.min.z, tip.z < board.max.z, tip.y < board.max.y + 0.15, tip.y > FLOOR + 1.2]).toEqual([true, true, true, true, true, true]);
    }
    band.players.forEach((p: { plays: string }, k: number) => {
      if (p.plays !== "drums") return;
      const kit = cornersOf("kit", k);
      for (const name of ["left stick", "right stick"]) {
        const tip = ends(band, boneNamed(band, k, name)).b;
        expect(Math.min(...kit.map((corner) => gap(corner, tip)))).toBeLessThan(0.3);
      }
    });
  });

  it("hangs every limb from its own side, each elbow against the trunk: a left arm from the left shoulder, its elbow left of the body's middle and no farther out than the shoulder; a left leg from the left hip; and the right the same", () => {
    const seen: string[] = [];
    band.bones.forEach((bone: Bone, k: number) => {
      if (!/^(left|right) (upper arm|forearm|thigh)$/.test(bone.name)) return;
      const side = bone.name.startsWith("left") ? 1 : -1, from = side * own(band, bone.of, ends(band, k).a).x;
      // An upper arm and a thigh begin at the body, on their own side of it. A forearm begins at the elbow, which lies against the
      // trunk: on its own side of the body's middle, and no farther out than a finger past its shoulder.
      const shoulder = bone.name.endsWith("forearm") ? side * own(band, bone.of, ends(band, boneNamed(band, bone.of, bone.name.replace("forearm", "upper arm"))).a).x : Infinity;
      expect([bone.of, bone.name, bone.name.endsWith("forearm") ? from > 0.02 && from < shoulder + 0.03 : from > 0.05]).toEqual([bone.of, bone.name, true]);
      seen.push(bone.name.replace(/^\w+ /, ""));
    });
    // The keys and the drummers reach with both arms, and all but the drummers stand on legs that move.
    expect(seen.sort()).toEqual([...Array(6).fill("forearm"), ...Array(8).fill("thigh"), ...Array(6).fill("upper arm")]);
    // A drummer's legs stand still: a thigh and a shin for the left, then for the right, the top of each on its side.
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    band.players.forEach((p: { plays: string }, k: number) => {
      if (p.plays !== "drums") return;
      const legs: Part[] = band.still.userData.parts.filter((part: Part) => part.of === "drums leg" && part.by === k);
      expect(legs).toHaveLength(4);
      legs.forEach((part, i) => {
        let top = { x: 0, y: -Infinity, z: 0 };
        for (let j = part.from; j < part.from + part.count; j++) { const corner = own(band, k, at.fromBufferAttribute(still, j)); if (corner.y > top.y) top = corner; }
        expect([k, i, (i < 2 ? top.x : -top.x) > 0.05]).toEqual([k, i, true]);
      });
    });
  });

  it("stands each microphone at its player's mouth: its head within 3 cm of the face's front at its height, as the body rests, upright or leaning, and its stand toward the crowd from there", () => {
    stage.updateMatrixWorld(true);
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    const gaps = band.players.flatMap((p: { plays: string; body: { matrixWorld: unknown; geometry: { getAttribute(name: string): { count: number } } } }, k: number) => {
      // The microphone's head: the highest corner of the player's stand.
      const top = new THREE.Vector3(0, -Infinity, 0);
      for (const part of band.still.userData.parts as Part[]) if (part.of === "microphone" && part.by === k) for (let i = part.from; i < part.from + part.count; i++) if (still.getY(i) > top.y) top.fromBufferAttribute(still, i);
      if (top.y < 0) return [];
      const mic = own(band, k, top), body = p.body.geometry.getAttribute("position");
      // The face's front at that height: the body's corners within 4 cm of it up and down and 6 cm to either side, in the player's metres.
      let face = -Infinity;
      for (let i = 0; i < body.count; i++) {
        const corner = own(band, k, at.fromBufferAttribute(body, i).applyMatrix4(p.body.matrixWorld));
        if (Math.abs(corner.y - mic.y) < 0.04 && Math.abs(corner.x - mic.x) < 0.06) face = Math.max(face, corner.z);
      }
      return [{ plays: p.plays, before: mic.z - face }];
    });
    expect(gaps.map(({ plays }: { plays: string }) => plays)).toEqual(["bass", "guitar", "guitar", "keys"]);
    // In the player's own metres: a head 0.027 across that stood off the face as it did, 0.065 before it, would fail this.
    for (const { plays, before } of gaps) expect([plays, before > -0.03 && before < 0.03]).toEqual([plays, true]);
    // The stand's foot: the lowest corner of the stand. From the mouth it lies toward the crowd, +z on the stage, within 0.2 rad.
    band.players.forEach((p: { plays: string; g: { matrix: unknown } }, k: number) => {
      const stand: Part[] = band.still.userData.parts.filter((part: Part) => part.of === "microphone" && part.by === k);
      if (!stand.length) return;
      const foot = new THREE.Vector3(0, Infinity, 0), head = new THREE.Vector3(0, -Infinity, 0);
      for (const part of stand) for (let i = part.from; i < part.from + part.count; i++) {
        if (still.getY(i) < foot.y) foot.fromBufferAttribute(still, i);
        if (still.getY(i) > head.y) head.fromBufferAttribute(still, i);
      }
      expect([p.plays, Math.abs(Math.atan2(foot.x - head.x, foot.z - head.z)) < 0.2 + (p.plays === "keys" ? 0.15 : 0)]).toEqual([p.plays, true]);
    });
  });

  it("stands a kit's poles upright, each cymbal within reach of one: a piece over 45 cm tall and thin is under 5 cm across, and every disc's middle is within 30 cm of a pole, in the drummer's metres", () => {
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    band.players.forEach((p: { plays: string }, k: number) => {
      if (p.plays !== "drums") return;
      const poles: { x: number; z: number; across: number }[] = [], discs: { x: number; z: number }[] = [];
      for (const part of band.still.userData.parts as Part[]) {
        if (part.of !== "kit" || part.by !== k) continue;
        const box = new THREE.Box3();
        for (let i = part.from; i < part.from + part.count; i++) box.expandByPoint(own(band, k, at.fromBufferAttribute(still, i)));
        const across = [box.max.x - box.min.x, box.max.z - box.min.z], tall = box.max.y - box.min.y, middle = { x: (box.max.x + box.min.x) / 2, z: (box.max.z + box.min.z) / 2 };
        if (tall > 0.45 && Math.min(...across) < 0.1) poles.push({ ...middle, across: Math.max(...across) });
        // A cymbal: a disc, level and thin, over the height of the drummer's knees.
        if (tall < 0.12 && Math.min(...across) > 0.25 && box.min.y > 0.65) discs.push(middle);
      }
      // The snare's stand and a cymbal's pole at the least; a hi-hat's two cymbals, a ride and, for the first drummer, a crash.
      expect(poles.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...poles.map((pole) => pole.across))).toBeLessThan(0.05);
      expect(discs.length).toBe(k === 2 ? 4 : 3);
      for (const disc of discs) expect(Math.min(...poles.map((pole) => Math.hypot(pole.x - disc.x, pole.z - disc.z)))).toBeLessThan(0.3);
    });
  });
});

// The outlines' rule (band.js): nothing here is antialiased, so a gap a pixel or two wide between a limb and a trunk, an instrument or
// another limb is lit or black a whole pixel at a time, and flickers where an edge rests on it. The band is drawn here in black and
// white as a rasterizer has it, a pixel black where its middle is inside a triangle, from the front and far off: once from 0.5 rad up
// at 12 cm a pixel, as from the hill on a desktop, and once from 0.12 rad up at 4 cm a pixel, as from the front of the crowd. What
// stands under 0.6 m over the floor is left out: from the hill that is seen against the floor, not the panel.
describe("the band's outlines, from the front, through four counts of playing", () => {
  const FROM = 0.6, UP = 2;
  // Every triangle of the band as it stands: each corner's place across the stage and up the view, and whether its part moves.
  function triangles({ stage, band }: { stage: { updateMatrixWorld(force: boolean): void }; band: Band }, tilt: number) {
    stage.updateMatrixWorld(true);
    const out: number[] = [], at = new THREE.Vector3(), c = Math.cos(tilt), sn = Math.sin(tilt);
    const push = (corner: { count: number }, m: unknown, moving: number) => {
      for (let i = 0; i < corner.count; i++) {
        at.fromBufferAttribute(corner, i);
        if (m) at.applyMatrix4(m);
        out.push(at.x, FLOOR + (at.y - FLOOR) * c - at.z * sn, moving);
      }
    };
    push(band.still.geometry.getAttribute("position"), null, 0);
    for (const p of band.players) push(p.body.geometry.getAttribute("position"), p.body.matrixWorld, 1);
    band.bones.forEach((_: Bone, k: number) => { band.limbs.getMatrixAt(k, matrix); push(band.limbs.geometry.getAttribute("position"), matrix, 1); });
    return out;
  }
  // The outline at a pixel `px` m across, 1 where a still part covers a pixel's middle and 2 where a moving one does. `thin` counts
  // the lit pixels in a gap 1 or 2 px wide, across or down, with a moving part at one end; `pockets` the lit patches shut in by
  // black, under 3 px one way, with a moving part at their edge.
  function gaps(tris: number[], px: number) {
    const w = Math.ceil(18 / px), h = Math.ceil(6 / px), mask = new Uint8Array(w * h), low = Math.ceil((FROM + UP) / px);
    for (let t = 0; t < tris.length; t += 9) {
      const ax = (tris[t] + 9) / px, ay = (tris[t + 1] - FLOOR + UP) / px, bx = (tris[t + 3] + 9) / px, by = (tris[t + 4] - FLOOR + UP) / px, cx = (tris[t + 6] + 9) / px, cy = (tris[t + 7] - FLOOR + UP) / px;
      const kind = tris[t + 2] + 1, area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0) continue;
      for (let y = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)); y <= Math.min(h - 1, Math.floor(Math.max(ay, by, cy) - 0.5)); y++) {
        for (let x = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)); x <= Math.min(w - 1, Math.floor(Math.max(ax, bx, cx) - 0.5)); x++) {
          const qx = x + 0.5, qy = y + 0.5;
          const inside = ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax)) / area >= 0 && ((cx - bx) * (qy - by) - (cy - by) * (qx - bx)) / area >= 0 && ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx)) / area >= 0;
          if (inside && mask[y * w + x] < kind) mask[y * w + x] = kind;
        }
      }
    }
    let thin = 0, pockets = 0;
    const run = (o: number, step: number, within: (q: number) => boolean) => {
      let a = o, b = o;
      while (within(a - step) && !mask[a - step] && (o - a) / step < 2) a -= step;
      while (within(b + step) && !mask[b + step] && (b - o) / step < 2) b += step;
      return within(a - step) && within(b + step) && mask[a - step] > 0 && mask[b + step] > 0 && (b - a) / step < 2 && (mask[a - step] === 2 || mask[b + step] === 2);
    };
    for (let y = low; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x;
      if (!mask[o] && (run(o, 1, (q) => q >= y * w && q < (y + 1) * w) || run(o, w, (q) => q >= 0 && q < w * h))) thin += 1;
    }
    const seen = new Uint8Array(w * h);
    const flood = (start: number) => {
      const got = [start];
      let moving = false;
      seen[start] = 1;
      for (let i = 0; i < got.length; i++) {
        const x = got[i] % w, y = (got[i] - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const n = Y * w + X;
          if (mask[n]) moving ||= mask[n] === 2;
          else if (!seen[n]) { seen[n] = 1; got.push(n); }
        }
      }
      return { got, moving };
    };
    // What the frame's edge reaches through lit pixels is the light outside; the rest are pockets.
    for (let x = 0; x < w; x++) for (const o of [x, (h - 1) * w + x]) if (!mask[o] && !seen[o]) flood(o);
    for (let y = 0; y < h; y++) for (const o of [y * w, y * w + w - 1]) if (!mask[o] && !seen[o]) flood(o);
    for (let o = 0; o < w * h; o++) {
      if (mask[o] || seen[o]) continue;
      const { got, moving } = flood(o), xs = got.map((g) => g % w), ys = got.map((g) => Math.floor(g / w));
      if (moving && Math.max(...ys) >= low && Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 2) pockets += 1;
    }
    return { thin, pockets };
  }

  it("leaves few gaps under 3 px with a moving part at their edge: from the hill no more than 36 thin pixels and 4 small pockets in any of 16 poses, and from the front of the crowd 176 and 5", () => {
    const built = stand();
    built.play(1.5, 96);
    const most = { far: { thin: 0, pockets: 0 }, near: { thin: 0, pockets: 0 } };
    for (let sample = 0; sample < 16; sample++) {
      built.play(0.15, 96);
      for (const [view, px, tilt] of [["far", 0.12, 0.5], ["near", 0.04, 0.12]] as ["far" | "near", number, number][]) {
        const found = gaps(triangles(built, tilt), px);
        most[view] = { thin: Math.max(most[view].thin, found.thin), pockets: Math.max(most[view].pockets, found.pockets) };
      }
    }
    // Counted 34 and 4 from the hill and 170 and 4 from the front; the band before its outlines were closed counted 100 and 12,
    // and 250 and 20. Something is counted: a wedge's tip is thin wherever two parts part.
    // Counted 34 and 4 from the hill and 170 and 4 from the front; the band before its outlines were closed counted 100 and 12,
    // and 255 and 21. Something is counted: a wedge's tip is thin wherever two parts part.
    expect(most.far.thin).toBeGreaterThan(10);
    expect([most.far.thin <= 36, most.far.pockets <= 4, most.near.thin <= 176, most.near.pockets <= 5]).toEqual([true, true, true, true]);
  });
});

describe("the band's joints, through eight counts of playing", () => {
  it("stay joined: no bone's end leaves the body, the floor or the bone that holds it by a fifth of a millimetre", () => {
    const { band, play } = stand();
    let worst = 0, checked = 0;
    play(8 / 1.6 + 1, 96, true, () => {
      for (const joint of band.joints as Joint[]) worst = Math.max(worst, gap(ends(band, joint.bone)[joint.end ? "b" : "a"], held(band, joint)));
      checked += 1;
    });
    expect(checked).toBe(360);
    // Every bone but a drummer's hand, which lies along its stick, is held at a joint; a shin at both ends.
    const spans = band.bones.filter((bone: Bone) => bone.span !== null);
    expect(spans.map((bone: Bone) => bone.name).sort()).toEqual(["left hand", "left hand", "right hand", "right hand"].sort());
    expect(new Set((band.joints as Joint[]).map((joint) => joint.bone)).size).toBe(band.bones.length - spans.length);
    expect(worst).toBeLessThan(2e-4);
  });

  it("turn and never stretch: an arm, a stick, a hand and a foot keep their lengths, and a leg, whose foot stays put, its own within 3 %", () => {
    const { band, play } = stand();
    const lengths = () => band.bones.map((_: Bone, k: number) => { const { a, b } = ends(band, k); return gap(a, b); });
    const rest = lengths(), most = rest.map(() => 0);
    let moved = 0;
    play(8 / 1.6 + 1, 96, true, () => lengths().forEach((length: number, k: number) => {
      most[k] = Math.max(most[k], Math.abs(length / rest[k] - 1));
      moved = Math.max(moved, Math.abs(length - rest[k]));
    }));
    band.bones.forEach((bone: Bone, k: number) => expect([bone.name, most[k] < (/thigh|shin/.test(bone.name) ? 0.03 : 1e-4)]).toEqual([bone.name, true]));
    // The legs do follow the hips: a test of bones that never moved would pass the lines above.
    expect(moved).toBeGreaterThan(0.001);
  });
});

describe("the band's playing", () => {
  it("moves each drummer's arms apart, each stick down while the other is at its top, and the second drummer a count behind the first", () => {
    const { band, clock, play } = stand();
    const drummers = band.players.flatMap((p: { plays: string }, k: number) => (p.plays === "drums" ? [k] : []));
    expect(drummers).toHaveLength(2);
    const sticks = drummers.map((k: number) => ({ left: boneNamed(band, k, "left stick"), right: boneNamed(band, k, "right stick") }));
    const rest = sticks.map(({ left, right }: { left: number; right: number }) => ({ left: ends(band, left).b.y, right: ends(band, right).b.y }));
    // At 96 a minute the band's count is the figures' beat, so a frame's count is its beats.
    play(2, 96);
    const lift: { count: number; left: number; right: number }[][] = [[], []];
    play(10, 96, true, () => sticks.forEach(({ left, right }: { left: number; right: number }, d: number) =>
      lift[d].push({ count: clock.beats, left: ends(band, left).b.y - rest[d].left, right: ends(band, right).b.y - rest[d].right })));
    for (const drummer of lift) {
      const top = { left: Math.max(...drummer.map((f) => f.left)), right: Math.max(...drummer.map((f) => f.right)) };
      expect(Math.min(top.left, top.right)).toBeGreaterThan(0.1);
      expect(drummer.some((f) => f.left > 0.9 * top.left && f.right < 0.01)).toBe(true);
      expect(drummer.some((f) => f.right > 0.9 * top.right && f.left < 0.01)).toBe(true);
      // Never both at the top at once.
      expect(drummer.filter((f) => f.left > 0.9 * top.left && f.right > 0.9 * top.right)).toEqual([]);
    }
    // The counts at which a stick lands: it comes within a millimetre of where it rests, having been 5 cm up.
    const lands = (frames: { count: number; left: number; right: number }[], side: "left" | "right") => {
      const out: number[] = [];
      let up = false;
      for (const f of frames) {
        if (f[side] > 0.05) up = true;
        else if (up && f[side] < 0.001) { out.push(f.count); up = false; }
      }
      return out;
    };
    const first = lands(lift[0], "right"), second = lands(lift[1], "right"), other = lands(lift[0], "left");
    expect(first.length).toBeGreaterThanOrEqual(3);
    // Each stick falls once in four counts; a drummer's other stick two counts on; the second drummer's a count on.
    for (let k = 1; k < first.length; k++) expect(first[k] - first[k - 1]).toBeCloseTo(4, 1);
    const after = (count: number, list: number[]) => Math.min(...list.filter((c) => c > count - 0.05).map((c) => c - count));
    expect(after(first[0], other)).toBeCloseTo(2, 1);
    expect(after(first[0], second)).toBeCloseTo(1, 1);
  });

  it("lifts the keys' hands in turn: each is on the keys while the other is at its top, and the two are never both over halfway up", () => {
    const { band, play } = stand();
    const keys = band.players.findIndex((p: { plays: string }) => p.plays === "keys");
    const left = boneNamed(band, keys, "left hand"), right = boneNamed(band, keys, "right hand");
    const rest = { left: ends(band, left).b.y, right: ends(band, right).b.y };
    play(2, 96);
    const lift: { left: number; right: number }[] = [];
    play(10, 96, true, () => lift.push({ left: ends(band, left).b.y - rest.left, right: ends(band, right).b.y - rest.right }));
    const top = { left: Math.max(...lift.map((f) => f.left)), right: Math.max(...lift.map((f) => f.right)) };
    expect(Math.min(top.left, top.right)).toBeGreaterThan(0.05);
    expect(lift.some((f) => f.left > 0.9 * top.left && f.right < 0.001)).toBe(true);
    expect(lift.some((f) => f.right > 0.9 * top.right && f.left < 0.001)).toBe(true);
    expect(lift.filter((f) => f.left > 0.5 * top.left && f.right > 0.5 * top.right)).toEqual([]);
  });

  it("rocks each drummer about their seat: what sits on the stool moves under a third as far as the top of the head, which moves 3 cm or more", () => {
    const { band, stage, play } = stand();
    stage.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    const drummers = band.players.flatMap((p: { plays: string; body: { matrixWorld: unknown; geometry: { getAttribute(name: string): { count: number; getY(i: number): number } } } }) => {
      if (p.plays !== "drums") return [];
      const corner = p.body.geometry.getAttribute("position");
      let seat = 0, crown = 0;
      for (let i = 0; i < corner.count; i++) {
        if (corner.getY(i) < corner.getY(seat)) seat = i;
        if (corner.getY(i) > corner.getY(crown)) crown = i;
      }
      const where = (i: number) => at.fromBufferAttribute(corner, i).applyMatrix4(p.body.matrixWorld).clone();
      return [{ where, seat, crown, rest: { seat: where(seat), crown: where(crown) }, moved: { seat: 0, crown: 0 } }];
    });
    expect(drummers).toHaveLength(2);
    play(12, 96, true, () => {
      stage.updateMatrixWorld(true);
      for (const d of drummers) {
        d.moved.seat = Math.max(d.moved.seat, gap(d.where(d.seat), d.rest.seat));
        d.moved.crown = Math.max(d.moved.crown, gap(d.where(d.crown), d.rest.crown));
      }
    });
    for (const { moved } of drummers) {
      expect(moved.crown).toBeGreaterThan(0.03);
      expect(moved.seat).toBeLessThan(moved.crown / 3);
    }
  });

  it("plays in half time when the beat is fast: a foot taps on each beat up to 105 a minute, on every second one from 135, and never oftener than HALF_OVER a second", () => {
    expect([HALF_OVER, HALF_UNDER]).toEqual([1.75, 1.5]);
    for (const [bpm, pace] of [[80, 1], [96, 1], [104, 1], [108, 0.5], [134, 0.5], [156, 0.5], [159, 0.5]]) {
      const { band, play } = stand();
      const foot = band.bones.findIndex((bone: Bone) => bone.name === "tapping foot"), down = ends(band, foot).b.y;
      play(6, bpm);
      let taps = 0, up = false;
      play(20, bpm, true, () => {
        const y = ends(band, foot).b.y - down;
        if (y > 0.02) up = true;
        else if (up && y < 0.002) { taps += 1; up = false; }
      });
      expect([bpm, Math.abs(taps / 20 - (bpm / 60) * pace) < 0.06]).toEqual([bpm, true]);
      expect(taps / 20).toBeLessThanOrEqual(HALF_OVER + 0.06);
    }
  });

  it("keeps a tempo it has taken up while the beat stays between the two: at 96 a minute after 150, it still plays every second beat", () => {
    const { band, play } = stand();
    const foot = band.bones.findIndex((bone: Bone) => bone.name === "tapping foot"), down = ends(band, foot).b.y;
    const tapsIn = (seconds: number, bpm: number) => {
      let taps = 0, up = false;
      play(seconds, bpm, true, () => {
        const y = ends(band, foot).b.y - down;
        if (y > 0.02) up = true;
        else if (up && y < 0.002) { taps += 1; up = false; }
      });
      return taps / seconds;
    };
    play(6, 150);
    play(4, 96);
    expect(tapsIn(20, 96)).toBeCloseTo(0.8, 1);
    play(4, 84);
    expect(tapsIn(20, 84)).toBeCloseTo(1.4, 1);
  });

  it("is not thrown into half time by a pull on the beat: at 92 a minute the hardest pull an onset gives leaves a foot tapping every beat", () => {
    const { band } = stand();
    const foot = band.bones.findIndex((bone: Bone) => bone.name === "tapping foot"), down = ends(band, foot).b.y;
    // The figures' beat as main.js steps it (beat.js), with the pull still to take up.
    let beat = { beats: 0, pull: 0, locks: 0 }, time = 0;
    const frames = (count: number, each: () => void = () => {}) => {
      for (let frame = 0; frame < count; frame++) {
        beat = beatStep(beat, 1 / 60, 92, null);
        time += 1 / 60;
        band.move(1 / 60, time, beat.beats, true);
        each();
      }
    };
    frames(360);
    // An onset just under a quarter of a beat off pulls the beat by half of that (beat.js LOCK and PULL), over a fifth of a second:
    // for a frame the beat runs 0.6 a second faster, past HALF_OVER.
    beat = { ...beat, pull: 0.124 };
    const before = beat.beats;
    frames(1);
    expect((beat.beats - before) * 60).toBeGreaterThan(HALF_OVER + 0.3);
    frames(119);
    let taps = 0, up = false;
    frames(1200, () => {
      const y = ends(band, foot).b.y - down;
      if (y > 0.02) up = true;
      else if (up && y < 0.002) { taps += 1; up = false; }
    });
    expect(taps / 20).toBeCloseTo(92 / 60, 1);
  });

  // A part that went a little one way in one frame and back in the next, over and over, would flicker every edge that rests near a
  // pixel's middle (CLAUDE.md, "Motion and flashes"). Each bone's ends and each body's place and turn are followed here, frame by
  // frame: none turns back twice within three frames; none's pace quickens and slackens by turns through four frames, as a part
  // would that moved by uneven steps; and none's change of pace from one frame to the next is over what the band's sharpest move
  // makes, a stick's landing.
  it("moves every part smoothly from frame to frame, at rest and through four bars at 90, 120 and 140 a minute: no part goes back and forth within three frames or shivers through four, and none's pace changes by more than a stick's landing", () => {
    const zigzags: string[] = [], shivers: string[] = [];
    let sharpest = 0, sharpestAtRest = 0;
    for (const [bpm, playing] of [[96, false], [90, true], [120, true], [140, true]] as [number, boolean][]) {
      const { band, play } = stand();
      if (playing) play(3, bpm);
      const series = new Map<string, number[]>();
      const follow = (name: string, value: number) => { const list = series.get(name) ?? []; list.push(value); series.set(name, list); };
      play(playing ? (16 * 60) / bpm : 8, bpm, playing, () => {
        band.bones.forEach((bone: Bone, k: number) => {
          const { a, b } = ends(band, k);
          for (const [end, at] of [["a", a], ["b", b]] as [string, Vec][]) { follow(`${bone.of} ${bone.name} ${end} x`, at.x); follow(`${bone.of} ${bone.name} ${end} y`, at.y); follow(`${bone.of} ${bone.name} ${end} z`, at.z); }
        });
        band.players.forEach((p: { plays: string; body: { position: Vec; rotation: Vec } }, k: number) => {
          follow(`${k} ${p.plays} across`, p.body.position.x); follow(`${k} ${p.plays} up`, p.body.position.y); follow(`${k} ${p.plays} nod`, p.body.rotation.x); follow(`${k} ${p.plays} lean`, p.body.rotation.z);
        });
      });
      expect(series.size).toBe(band.bones.length * 6 + 24);
      for (const [name, values] of series) {
        for (let i = 2; i < values.length; i++) {
          const before = values[i - 1] - values[i - 2], after = values[i] - values[i - 1];
          if (playing) sharpest = Math.max(sharpest, Math.abs(after - before)); else sharpestAtRest = Math.max(sharpestAtRest, Math.abs(after - before));
          // Back, forth and back again in three frames, by more than rounding: a bone's end is read from its matrix, which holds
          // 32-bit numbers, good to a few millionths of a metre here; a body's place and turn are whole.
          const bone = / [ab] [xyz]$/.test(name), slack = bone ? 4e-6 : 1e-12;
          if (i >= 3) { const first = values[i - 2] - values[i - 3]; if (first * before < 0 && before * after < 0 && Math.min(Math.abs(first), Math.abs(before), Math.abs(after)) > slack) zigzags.push(`${name} at ${bpm}, frame ${i}`); }
          // The pace up, down, up and down again over four frames, each by more than the same rounding makes of a change of pace.
          if (i >= 5) {
            const d2 = [0, 1, 2, 3].map((n) => values[i - n] - 2 * values[i - n - 1] + values[i - n - 2]);
            if (d2.every((v, n) => Math.abs(v) > (bone ? 5e-5 : 1e-9) && (n === 0 || v * d2[n - 1] < 0))) shivers.push(`${name} at ${bpm}, frame ${i}`);
          }
        }
      }
    }
    expect(zigzags).toEqual([]);
    expect(shivers).toEqual([]);
    // A frame's change of pace, in the stage's metres or in radians: the most is where a stick lands, 3 cm a frame at its tip; a
    // band that stands only breathes and shifts its weight.
    expect(sharpest).toBeGreaterThan(0.01);
    expect(sharpest).toBeLessThan(0.045);
    expect(sharpestAtRest).toBeLessThan(2e-5);
  });

  it("jumps nowhere as the tempo changes or the show stops: no bone's end moves faster then than the fastest of a steady song, by a quarter", () => {
    const fastest = (run: (each: () => void) => void, band: Band) => {
      let last: Vec[] | null = null, most = 0;
      run(() => {
        const now = band.bones.flatMap((_: Bone, k: number) => { const { a, b } = ends(band, k); return [a, b]; });
        if (last) now.forEach((at: Vec, k: number) => { most = Math.max(most, gap(at, last![k])); });
        last = now;
      });
      return most;
    };
    const steady = stand(), changing = stand();
    steady.play(4, 96);
    const base = fastest((each) => steady.play(10, 96, true, each), steady.band);
    expect(base).toBeGreaterThan(0.01);
    const most = fastest((each) => {
      changing.play(5, 96, true, each);
      changing.play(5, 156, true, each);
      changing.play(5, 82, true, each);
      changing.play(2, 82, false, each);
      changing.play(3, 150, true, each);
    }, changing.band);
    expect(most).toBeLessThan(base * 1.25);
  });

  it("comes back to rest when the show stops: with the world's time held, every bone lies as it was built", () => {
    const { band, clock, play } = stand();
    const before = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    play(3, 96);
    const playing = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    expect(Math.max(...playing.map((value, k) => Math.abs(value - before[k])))).toBeGreaterThan(0.05);
    for (let frame = 0; frame < 120; frame++) band.move(1 / 60, 0, (clock.beats += 1.6 / 60), false);
    const after = Array.from(band.limbs.instanceMatrix.array as Float32Array);
    expect(Math.max(...after.map((value, k) => Math.abs(value - before[k])))).toBeLessThan(1e-6);
  });

  it("breathes and shifts its weight while the show does not play, every player by 5 mm to 3 cm, and sways wider than that when it plays", () => {
    const idle = stand(), playing = stand();
    // How far each player's body goes from where it rests, in the stage's metres.
    const reach = ({ band, play }: ReturnType<typeof stand>, on: boolean) => {
      const rest = band.players.map((p: { body: { position: { clone(): Vec } } }) => p.body.position.clone());
      const scale = band.players.map((p: { g: { scale: Vec } }) => p.g.scale.x);
      const most = band.players.map(() => 0);
      play(12, 96, on, () => band.players.forEach((p: { body: { position: Vec } }, k: number) => { most[k] = Math.max(most[k], gap(p.body.position, rest[k]) * scale[k]); }));
      return most;
    };
    const still = reach(idle, false);
    expect(Math.min(...still)).toBeGreaterThan(0.005);
    expect(Math.max(...still)).toBeLessThan(0.03);
    // The three who stand with an instrument sway.
    const swaying = reach(playing, true).filter((_: number, k: number) => ["bass", "guitar"].includes(playing.band.players[k].plays));
    expect(swaying).toHaveLength(3);
    expect(Math.min(...swaying)).toBeGreaterThan(0.05);
  });

  it("keeps every head at its microphone: the part of a player at the microphone stays within 3 cm of it while the hips sway over 10", () => {
    const { band, stage, play } = stand();
    stage.updateMatrixWorld(true);
    const still = band.still.geometry.getAttribute("position"), at = new THREE.Vector3();
    // Each microphone's head: the highest corner of the player's stand. And the point of the player's body that is there at rest.
    const singers = band.players.flatMap((p: { plays: string; body: { matrixWorld: { clone(): { invert(): unknown } }; position: Vec }; g: { scale: Vec } }, k: number) => {
      const mic = new THREE.Vector3(0, -Infinity, 0);
      for (const part of band.still.userData.parts) if (part.of === "microphone" && part.by === k) for (let i = part.from; i < part.from + part.count; i++) if (still.getY(i) > mic.y) mic.fromBufferAttribute(still, i);
      return mic.y > 0 ? [{ p, mic, held: mic.clone().applyMatrix4(p.body.matrixWorld.clone().invert()), rest: p.body.position.x, hips: 0, off: 0 }] : [];
    });
    expect(singers.map(({ p }: { p: { plays: string } }) => p.plays)).toEqual(["bass", "guitar", "guitar", "keys"]);
    play(12, 96, true, () => {
      stage.updateMatrixWorld(true);
      for (const singer of singers) {
        singer.off = Math.max(singer.off, gap(at.copy(singer.held).applyMatrix4(singer.p.body.matrixWorld), singer.mic));
        singer.hips = Math.max(singer.hips, Math.abs(singer.p.body.position.x - singer.rest) * singer.p.g.scale.x);
      }
    });
    for (const { p, off, hips } of singers) {
      expect([p.plays, off < 0.03]).toEqual([p.plays, true]);
      // The three with an instrument sway their hips 5 cm or more to either side, under that head.
      if (p.plays !== "keys") expect(hips).toBeGreaterThan(0.05);
    }
  });

  // The flash bar's part in the motion (CLAUDE.md, "Motion and flashes"). A swing of brightness at a point of the screen is an edge of
  // black passing it. Here each bone's end and each player's crown is followed across the light panel's plane, and how often it
  // turns back is counted: a point that turns back twice a count passes anything in its way twice a count.
  it("turns nothing back more than twice in a count, and all but a tapping foot no more than once; what only sways, twice in four", () => {
    const { band, stage, play } = stand();
    play(4, 96);
    // The points: both ends of each bone, and each body's highest and widest corners, which are a head's crown and an instrument's head.
    const marks = band.players.map((p: { body: { geometry: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number } } } }) => {
      const corner = p.body.geometry.getAttribute("position");
      let top = 0, wide = 0;
      for (let i = 0; i < corner.count; i++) {
        if (corner.getY(i) > corner.getY(top)) top = i;
        if (corner.getX(i) > corner.getX(wide)) wide = i;
      }
      return { top, wide };
    });
    const tracks = new Map<string, { x: number[]; y: number[] }>();
    const follow = (name: string, at: Vec) => {
      const track = tracks.get(name) ?? { x: [], y: [] };
      track.x.push(at.x);
      track.y.push(at.y);
      tracks.set(name, track);
    };
    const at = new THREE.Vector3(), COUNTS = 16;
    play(COUNTS / 1.6, 96, true, () => {
      stage.updateMatrixWorld(true);
      band.bones.forEach((bone: Bone, k: number) => {
        const { a, b } = ends(band, k);
        follow(`${bone.of} ${bone.name} a`, a);
        follow(`${bone.of} ${bone.name} b`, b);
      });
      band.players.forEach((p: { plays: string; body: { matrixWorld: unknown; geometry: { getAttribute(name: string): unknown } } }, k: number) => {
        follow(`${k} ${p.plays} crown`, at.fromBufferAttribute(p.body.geometry.getAttribute("position"), marks[k].top).applyMatrix4(p.body.matrixWorld));
        follow(`${k} ${p.plays} widest`, at.fromBufferAttribute(p.body.geometry.getAttribute("position"), marks[k].wide).applyMatrix4(p.body.matrixWorld));
      });
    });
    const over: string[] = [];
    let busiest = 0;
    for (const [name, { x, y }] of tracks) {
      const most = Math.max(turns(x), turns(y));
      busiest = Math.max(busiest, most);
      // Only a foot that taps keeps the count itself, down and up in each. A hand strums one way on a count and back on the next; a
      // stick rises and falls once in four counts, and the sway comes and goes once in them.
      if (most > (/tapping/.test(name) ? 2 * COUNTS : COUNTS) + 1) over.push(`${name}: ${most}`);
      // What only sways goes across the stage and back once in four counts; its height dips at either end of that.
      if (/crown|widest|thigh|shin/.test(name) && turns(x) > COUNTS / 2 + 1) over.push(`${name}: ${turns(x)} across, which sways`);
    }
    expect(over).toEqual([]);
    // Something does turn back twice a count: the tapping foot.
    expect(busiest).toBeGreaterThanOrEqual(2 * COUNTS - 1);
  });

  it("makes nothing in a frame: six hundred frames of playing, stopping and a change of tempo construct no vector, matrix or array", () => {
    const { band, clock } = stand();
    let arrays = 0;
    const Counted = class extends Float32Array {
      constructor(...args: ConstructorParameters<typeof Float32Array>) {
        super(...args);
        arrays += 1;
      }
    };
    const matrices = band.limbs.instanceMatrix.array, version = band.limbs.instanceMatrix.version;
    vi.stubGlobal("Float32Array", Counted);
    const before = made.count;
    for (let frame = 0; frame < 600; frame++) {
      clock.beats += (frame < 300 ? 96 : 156) / 3600;
      band.move(1 / 60, frame / 60, clock.beats, frame < 200 || frame > 260);
    }
    expect(made.count - before).toBe(0);
    expect(arrays).toBe(0);
    vi.unstubAllGlobals();
    // The counters do count: one of each, made here.
    new THREE.Vector3();
    expect(made.count - before).toBe(1);
    // The frames wrote the limbs' own matrices, and said so each time.
    expect(band.limbs.instanceMatrix.array).toBe(matrices);
    expect(band.limbs.instanceMatrix.version - version).toBe(600);
  });
});
