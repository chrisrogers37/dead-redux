import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildBear, buildBears, drawLegs, EAR_TOP, FUR, furMaterial, HAUNCH, LIMBS, lobe, LOCKS, NOSE, OVER, ROCK, RUFF, SNOUT, stride, TAIL_BACK, tuftAt } from "../../../public/world/bears.js";
import { BODY_REACH } from "../../../public/world/collide.js";
import { readFileSync } from "fs";
import { buildAvatar, HEAD, SLACK, TOP } from "../../../public/world/avatar.js";

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
// Where the line from (x, y, z) the way (dx, dy, dz) crosses a skin of triangles: how far along it, a unit of the way at a time, and
// whether it leaves the skin there (the triangle faces the way the line goes, as each of a closed skin's faces out of it).
function crossings(tris: number[], [x, y, z]: number[], [dx, dy, dz]: number[]) {
  const out: { t: number; leaving: boolean }[] = [];
  for (let o = 0; o < tris.length; o += 9) {
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az, e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const tx = x - ax, ty = y - ay, tz = z - az, u = (tx * px + ty * py + tz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) / det;
    if (w < 0 || u + w > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (t > 0) out.push({ t, leaving: det < 0 });
  }
  return out;
}
// Whether a point is inside a closed skin of triangles: a line from it crosses the skin an odd number of times, along each of three
// ways (as world-walks.ts's `within`).
function within(tris: number[], x: number, y: number, z: number) {
  return [[1, 0.0003, 0.0007], [-0.5, 0.0005, 0.866], [-0.5, -0.0004, -0.866]].every((way) => crossings(tris, [x, y, z], way).length % 2 === 1);
}
// How far the outermost of a skin stands from a point along a level way `turn` rad round from straight back (0) by the bear's left:
// the furthest the line from it crosses the skin.
const outTo = (tris: number[], y: number, turn: number) => Math.max(...crossings(tris, [0, y, 0], [Math.sin(turn), 0, -Math.cos(turn)]).map((c) => c.t));
// Every corner of a list of corners, mirrored across the bear's middle line, is a corner of the other list, to the float a vertex holds.
const mirrored = (one: number[][], other: number[][]) => one.every(([x, y, z]) => other.some(([u, v, w]) => Math.abs(x + u) + Math.abs(y - v) + Math.abs(z - w) < 1e-5));
// The least and most of a list of points, along x, y and z.
const extent = (points: number[][]) => [0, 1, 2].map((k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))]);
const light = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// The swings a bear's limbs take, every fortieth of a radian from the visitor's widest at a run one way to the other (0.7,
// avatar.js; the five's widest to the music is 0.65, audio.js), so the swing where the forward paw's toe dips deepest is among them.
const SWINGS = Array.from({ length: 57 }, (_, k) => Math.round((k - 28) * 25) / 1000);

// GLSL, run from its text: enough of it for the code the fur adds to three's shader. Numbers and vectors; a vector's parts by their
// letters (p.x, p.zyx, diffuseColor.rgb); + - * / part by part, a number with each part of a vector; the functions that code calls;
// functions of its own; and the statements `float a = …, b = …;`, `a = …;`, `a.rgb *= …;` (and +=, -=, /=), `return …;`, and a
// varying's declaration, whose value is given among the names where code reads it. Returns every name it defined, its functions among them, beside the
// names it was given. It knows those names and no others: code that reads any other name fails, saying which.
type Value = number | number[];
type Fn = (...args: Value[]) => Value;
type Scope = Record<string, Value | Fn>;
const each = (f: (...v: number[]) => number) => (...args: Value[]): Value => {
  const n = Math.max(0, ...args.map((a) => (typeof a === "number" ? 0 : a.length)));
  return n === 0 ? f(...(args as number[])) : Array.from({ length: n }, (_, k) => f(...args.map((a) => (typeof a === "number" ? a : a[k]))));
};
const BUILT_IN: Record<string, Fn> = {
  vec3: (...a) => { const v = a.flat(); return v.length === 1 ? [v[0], v[0], v[0]] : v; },
  vec4: (...a) => a.flat(),
  fract: each((v) => v - Math.floor(v)), floor: each(Math.floor), max: each(Math.max), min: each(Math.min), pow: each(Math.pow),
  mix: each((a, b, t) => a + (b - a) * t), clamp: each((v, lo, hi) => Math.min(hi, Math.max(lo, v))),
  smoothstep: each((e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }),
  dot: (a, b) => (a as number[]).reduce((s, v, k) => s + v * (b as number[])[k], 0),
};
function glsl(text: string, names: Scope): Scope {
  const t = text.replace(/\/\*[\s\S]*?\*\//g, "").match(/\d+\.\d*|\.\d+|\d+|[A-Za-z_]\w*|[-+*/]=|\S/g) ?? [];
  let at = 0;
  const peek = () => t[at], take = (want?: string) => { const s = t[at++]; if (want !== undefined && s !== want) throw new Error(`${want} wanted, ${s} found`); return s; };
  const letters = (s: string) => [...s].map((c) => Math.max("xyzw".indexOf(c), "rgba".indexOf(c)));
  const read = (scope: Scope, name: string) => { if (!(name in scope)) throw new Error(`no ${name} here`); return scope[name]; };
  type Expr = (scope: Scope) => Value;
  const primary = (): Expr => {
    const s = take();
    if (s === "(") { const e = sum(); take(")"); return e; }
    if (/^[\d.]/.test(s)) { const v = Number(s); return () => v; }
    if (!/^[A-Za-z_]/.test(s)) throw new Error(`${s} found`);
    if (peek() !== "(") return (scope) => read(scope, s) as Value;
    take("(");
    const args: Expr[] = [];
    while (peek() !== ")") { args.push(sum()); if (peek() === ",") take(); }
    take(")");
    return (scope) => (read(scope, s) as Fn)(...args.map((a) => a(scope)));
  };
  const unary = (): Expr => {
    if (peek() === "-") { take(); const e = unary(); return (scope) => each((v) => -v)(e(scope)); }
    let e = primary();
    while (peek() === ".") { take(); const k = letters(take()), of = e; e = (scope) => { const v = of(scope) as number[]; return k.length === 1 ? v[k[0]] : k.map((i) => v[i]); }; }
    return e;
  };
  const OPS: Record<string, (a: number, b: number) => number> = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b };
  const binary = (next: () => Expr, ops: string[]) => (): Expr => {
    let e = next();
    while (ops.includes(peek())) { const op = each(OPS[take()]), a = e, b = next(); e = (scope) => op(a(scope), b(scope)); }
    return e;
  };
  const product = binary(unary, ["*", "/"]), sum = binary(product, ["+", "-"]);
  const TYPES = ["float", "vec3", "vec4"];
  type Step = (scope: Scope) => { value: Value } | undefined;
  const statement = (): Step => {
    const s = take();
    if (s === "return") { const e = sum(); take(";"); return (scope) => ({ value: e(scope) }); }
    if (s === "varying") { take(); take(); take(";"); return () => undefined; }
    if (TYPES.includes(s) && t[at + 1] === "(") {
      const name = take(), params: string[] = [], body: Step[] = [];
      take("(");
      while (peek() !== ")") { take(); params.push(take()); if (peek() === ",") take(); }
      take(")");
      take("{");
      while (peek() !== "}") body.push(statement());
      take("}");
      return (scope) => {
        scope[name] = (...args: Value[]) => {
          const own: Scope = Object.create(scope);
          params.forEach((p, k) => (own[p] = structuredClone(args[k])));
          for (const step of body) { const done = step(own); if (done) return done.value; }
          throw new Error(`${name} returned nothing`);
        };
        return undefined;
      };
    }
    if (TYPES.includes(s)) {
      const made: [string, Expr][] = [];
      do { const name = take(); take("="); made.push([name, sum()]); } while (peek() === "," && take(","));
      take(";");
      return (scope) => { for (const [name, e] of made) scope[name] = e(scope); return undefined; };
    }
    const parts = peek() === "." ? (take(), letters(take())) : null, op = take(), e = sum();
    take(";");
    if (!["=", "+=", "-=", "*=", "/="].includes(op)) throw new Error(`${op} found`);
    return (scope) => {
      const was = read(scope, s) as Value, value = e(scope), into = (old: Value) => (op === "=" ? value : each(OPS[op[0]])(old, value));
      if (!parts) scope[s] = into(was);
      else { const v = [...(was as number[])], got = into(parts.map((i) => v[i])); parts.forEach((i, k) => (v[i] = typeof got === "number" ? got : got[k])); scope[s] = v; }
      return undefined;
    };
  };
  const scope: Scope = Object.assign(Object.create(null), BUILT_IN, names);
  while (at < t.length) statement()(scope);
  return scope;
}

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

  it("shows its ruff and its tail: the ruff stands proud of the body all round its back, its lower edge uneven with locks, and both in the fur's own colour out to their tips, deeper at their roots", () => {
    // The five as buildBears colours them, and the visitor's, which avatar.js builds in VISITOR.
    const five = buildBears(new THREE.Scene(), 5).map((b: { color: { r: number; g: number; b: number } }) => b.color);
    expect(five).toHaveLength(5);
    expect(readFileSync(new URL("../../../public/world/avatar.js", import.meta.url), "utf8")).toContain(`buildBear(scene, 0x${VISITOR.toString(16)})`);
    for (const fur of [...five, new THREE.Color(VISITOR)]) {
      const { torso, head, ruff, tail } = partsOf(buildBear(new THREE.Scene(), fur.getHex()));
      // How light a corner is, as a share of the fur; and whether its channels keep the fur's proportions, so it is the fur's own
      // colour, deeper or not, and never paler or another hue.
      const tone = (c: Corner) => light(c.colour[0], c.colour[1], c.colour[2]) / light(fur.r, fur.g, fur.b);
      const own = (c: Corner) => [c.colour[0] / fur.r, c.colour[1] / fur.g, c.colour[2] / fur.b].every((k) => Math.abs(k - tone(c)) < 1e-5);
      // The ruff's corners stand in rings, each straight out from the bear's middle line one way round the neck. Round the back half
      // of the neck (within a quarter turn of straight back), in every ring: some corner of it stands 8 cm and more out of the torso,
      // level with it, and outside the head, so the ruff stands at least that proud of the body; its innermost corner, its root, is in
      // the body, and is the fur deepened by a tenth and more; its lowest corner, a lock's end, is the fur's own colour, to a
      // hundredth.
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
        let cm = 0;
        while (cm < 30 && !within(torso.tris, x * (1 - cm / 100 / Math.hypot(x, z)), y, z * (1 - cm / 100 / Math.hypot(x, z)))) cm += 1;
        return within(head.tris, x, y, z) ? 0 : cm / 100;
      };
      for (const [turn, ring] of rings) {
        const root = ring.reduce((a, c) => (out(c) < out(a) ? c : a)), low = ring.reduce((a, c) => (c.at[1] < a.at[1] ? c : a));
        const furthest = [...ring].sort((a, b) => out(b) - out(a)).slice(0, 4);
        expect(Math.max(...furthest.map((c) => proud(c.at))), `ring at ${turn}°`).toBeGreaterThanOrEqual(0.08);
        expect(within(torso.tris, ...(root.at as [number, number, number])) || within(head.tris, ...(root.at as [number, number, number])), `root at ${turn}°`).toBe(true);
        expect(ring.every(own), `ring at ${turn}°`).toBe(true);
        expect(tone(low), `end at ${turn}°`).toBeGreaterThan(0.99);
        expect(tone(low), `end at ${turn}°`).toBeLessThanOrEqual(1 + 1e-6);
        expect(tone(root), `root at ${turn}°`).toBeLessThan(0.9);
        expect(tone(root), `root at ${turn}°`).toBeGreaterThan(0.8);
        lows.push([turn, low.at[1]]);
      }
      // Its lower edge rises and falls round the back, a lock at each fall: at least four falls of 1.5 cm or more below the rises
      // either side of them (within five rings, half a lock), and 10 cm from its highest to its lowest. A ring's edge is level.
      lows.sort(([a], [b]) => a - b);
      const ys = lows.map(([, y]) => y);
      let falls = 0;
      for (let i = 1; i < ys.length - 1; i++) {
        if (!(ys[i] < ys[i - 1] && ys[i] <= ys[i + 1])) continue;
        const left = Math.max(...ys.slice(Math.max(0, i - 5), i)), right = Math.max(...ys.slice(i + 1, i + 6));
        if (Math.min(left, right) - ys[i] >= 0.015) falls += 1;
      }
      expect(falls).toBeGreaterThanOrEqual(4);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
      // The tail: the fur's own colour, its back the fur itself and its root, where it meets the body, deeper; its back stands 0.1 m
      // and more out past the torso behind it.
      expect(tail.corners.every(own)).toBe(true);
      const back = tail.corners.reduce((a, c) => (c.at[2] < a.at[2] ? c : a)), base = tail.corners.reduce((a, c) => (c.at[2] > a.at[2] ? c : a));
      expect(tone(back)).toBeGreaterThan(0.99);
      expect(tone(base)).toBeLessThan(0.9);
      expect(within(torso.tris, TAIL_BACK.x, TAIL_BACK.y, TAIL_BACK.z + 0.1)).toBe(false);
      // How much deeper the tail is by how far back a ring of its corners lies, to a thousandth: none at its back, 1.108 m behind
      // the centre, easing to 16 % at 0.97 m behind it and ahead of that.
      const TAIL_TONE: [number, number][] = [[-1.108, 1], [-1.074, 0.984], [-1.043, 0.934], [-1.018, 0.889], [-0.999, 0.861], [-0.94, 0.84], [-0.772, 0.84]];
      for (const [z, want] of TAIL_TONE) {
        const ring = tail.corners.filter((c) => Math.abs(c.at[2] - z) < 0.001);
        expect(ring.length, `the tail's corners ${-z} m back`).toBeGreaterThan(0);
        for (const c of ring) expect(Math.abs(tone(c) - want), `the tail ${-z} m back`).toBeLessThan(0.001);
      }
    }
  });

  it("joins its parts to its body: each limb's top in it, the ruff's root and the tail sunk in it, and the ears set into the head", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), { torso, head, ears, ruff, tail } = partsOf(bear);
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
    // The tail is sunk in the body past its middle: the middle of it inside the torso, its back outside it (the test above).
    const along = tail.corners.map((c) => c.at[2]), middle = (Math.min(...along) + Math.max(...along)) / 2;
    expect(middle).toBeGreaterThan(TAIL_BACK.z + 0.1);
    expect(within(torso.tris, TAIL_BACK.x, TAIL_BACK.y, middle)).toBe(true);
    // The ruff's top lies back into the neck, with no ledge: in each ring of it, one way round the neck, the highest corner is
    // inside the torso or the head.
    const rings = new Map<number, Corner[]>();
    for (const c of ruff.corners) {
      const turn = Math.round((Math.atan2(c.at[0], -c.at[2]) * 180) / Math.PI * 10) / 10;
      rings.set(turn, [...(rings.get(turn) ?? []), c]);
    }
    expect(rings.size).toBeGreaterThanOrEqual(100);
    for (const [turn, ring] of rings) {
      const [x, y, z] = ring.reduce((a, c) => (c.at[1] > a.at[1] ? c : a)).at;
      expect(within(torso.tris, x, y, z) || within(head.tris, x, y, z), `top at ${turn}°`).toBe(true);
    }
  });

  it("has its tail and its ears where they belong: the tail on its middle line at the back, between its haunches, and an ear to each side on top of its head, its cup to the front and its back behind", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), { torso, ears, tail } = partsOf(bear), fur = bear.color;
    // The tail: about the middle line, its back the bear's furthest back (TAIL_BACK, one end of the line the bear rocks about), 1.2
    // to 1.7 m up.
    const xs = tail.corners.map((c) => c.at[0]), ys = tail.corners.map((c) => c.at[1]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...tail.corners.map((c) => c.at[2]))).toBeCloseTo(TAIL_BACK.z, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(TAIL_BACK.y, 6);
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
      const [cx, cy, cz] = mean(cup), [, , bz] = mean(coat);
      expect(cz).toBeGreaterThan(0.5);
      expect(cx * side).toBeGreaterThan(0.1);
      expect(bz).toBeLessThan(-0.2);
      // The cup is hollow: the way it faces, its rim stands 2 cm and more proud of its pale middle.
      const ahead = (c: Corner) => (c.at[0] * cx + c.at[1] * cy + c.at[2] * cz) / Math.hypot(cx, cy, cz);
      const middle = own.filter((c) => c.colour.every((v, k) => Math.abs(v - [pale.r, pale.g, pale.b][k]) < 1e-6));
      expect(Math.max(...middle.map(ahead))).toBeLessThan(Math.max(...own.map(ahead)) - 0.02);
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

  it("deepens its fur in the folds of its body, in the fur's own colour and never paler: the groove of its spine, the cleft under its tail, the creases over its legs and its armpits", () => {
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
      // The creases where the haunches meet the legs, 6 % deeper and more than the haunches over them; and the armpits, 2 % deeper and
      // more than the flanks under them.
      const zone = (lo: number, hi: number, y0: number, y1: number, near: (z: number) => boolean) =>
        torso.corners.filter((c) => Math.abs(c.at[0]) >= lo && Math.abs(c.at[0]) < hi && c.at[1] > y0 && c.at[1] < y1 && near(c.at[2]));
      const crease = zone(0.2, 0.65, 0.78, 0.98, (z) => z < -0.3), haunch = zone(0.2, 0.65, 1.05, 1.5, (z) => z < -0.3);
      const armpit = zone(0.9, 2, 2.5, 2.9, (z) => Math.abs(z - 0.1) < 0.25), flank = zone(0.9, 2, 1.9, 2.2, (z) => Math.abs(z - 0.1) < 0.25);
      for (const list of [crease, haunch, armpit, flank]) expect(list.length).toBeGreaterThan(4);
      expect(mid(crease)).toBeLessThan(mid(haunch) - 0.06);
      expect(mid(armpit)).toBeLessThan(mid(flank) - 0.02);
    }
  });

  it("gives the visitor's near-white bear a belly, a muzzle and inner ears a shade deeper than its fur, and the five theirs paler than their fur, as before", () => {
    const light = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const toneOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Corners where each part is drawn in its own tone in full: the belly's middle, the front of the torso inside its oval, under
    // the head's lowest corner (2.5 m up), where nothing else stands; and, found by an exact test of its surface, to a hundredth of a
    // millimetre, the muzzle, an egg 0.5175 by 0.405 by 0.45 m about a point 3.4 m up and 1.8 m ahead.
    const torsoAt = (x: number, y: number, z: number) => z > 0.4 && y < 2.45 && Math.hypot(x / 0.78, (y - 2) / 1.15) < 0.7;
    const muzzleAt = (x: number, y: number, z: number) => Math.abs((x / 0.5175) ** 2 + ((y - 3.4) / 0.405) ** 2 + ((z - 1.8) / 0.45) ** 2 - 1) < 1e-5;
    // The inner ears: the corners of the ears' cups in their own tone in full, those furthest from the fur (the next test holds them to
    // the cups' middles, facing forward).
    const coloursOf = (hue: number) => {
      const bear = buildBear(new THREE.Scene(), hue), { body } = bear, at = body.geometry.attributes.position, colour = body.geometry.attributes.color;
      const found: Record<"belly" | "muzzle" | "ears", { r: number; g: number; b: number }[]> = { belly: [], muzzle: [], ears: [] };
      for (let i = 0; i < at.count; i++) {
        const [x, y, z] = [at.getX(i), at.getY(i), at.getZ(i)], c = { r: colour.getX(i), g: colour.getY(i), b: colour.getZ(i) };
        if (torsoAt(x, y, z)) found.belly.push(c);
        if (muzzleAt(x, y, z)) found.muzzle.push(c);
      }
      const own = partsOf(bear), off = (c: Corner) => Math.abs(toneOf(c.colour[0], c.colour[1], c.colour[2]) - toneOf(bear.color.r, bear.color.g, bear.color.b));
      const most = Math.max(...own.ears.corners.map(off));
      found.ears = own.ears.corners.filter((c) => off(c) > most - 1e-6).map((c) => ({ r: c.colour[0], g: c.colour[1], b: c.colour[2] }));
      // Each part is found, and the ears on both sides.
      expect(found.belly.length).toBeGreaterThan(5);
      expect(found.muzzle.length).toBeGreaterThan(100);
      expect(found.ears.length).toBeGreaterThanOrEqual(6);
      return found;
    };
    // The visitor's: a shade deeper than its fur, 10 to 25 % less light, where paler than near white would not show (it was 11 %
    // lighter).
    const fur = new THREE.Color(VISITOR), visitor = coloursOf(VISITOR);
    expect(light(fur)).toBeGreaterThan(0.6);
    for (const part of ["belly", "muzzle", "ears"] as const) {
      for (const c of visitor[part]) {
        const ratio = light(c) / light(fur);
        expect(ratio).toBeGreaterThanOrEqual(0.75);
        expect(ratio).toBeLessThanOrEqual(0.9);
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

  it("stands the visitor's bear, as avatar.js stands it, as tall as the walk's camera frames it and as round as any bear: its top under the top the camera keeps in the frame by less than 2 cm, what the camera takes for no move, and its head about the boom's pivot", () => {
    // 2 cm (avatar.js SLACK) is a pixel and a half of a desktop's frame at the boom's length: a bear grown or shrunk by more would
    // show in the walk's frame, where the camera, set for this bear, keeps its top in the frame and pivots about its head.
    expect(SLACK).toBe(0.02);
    const avatar = buildAvatar(new THREE.Scene(), [], { phone: false, reduced: false });
    // At rest and facing +z, measured in the world from its feet, so whatever avatar.js does to the bear's group is counted in.
    avatar.step(0, 0, Math.PI, 0);
    avatar.g.updateMatrixWorld(true);
    const points: number[][] = [], v = new THREE.Vector3();
    avatar.g.traverse((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } }; matrixWorld: unknown }) => {
      if (!o.isMesh) return;
      const position = o.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) points.push(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld).sub(avatar.feet).toArray());
    });
    const [[left, right], [low, high], [back, front]] = extent(points);
    expect(avatar.top.y - avatar.feet.y).toBeCloseTo(TOP, 9);
    expect(high).toBeLessThanOrEqual(TOP);
    expect(high).toBeGreaterThan(TOP - SLACK);
    expect(low).toBeGreaterThan(-0.01);
    // Its nose SNOUT ahead of its centre and its tail's back TAIL_BACK behind it, to a millimetre; its arms 1.4 m to either side.
    expect(front).toBeCloseTo(SNOUT, 3);
    expect(back).toBeCloseTo(TAIL_BACK.z, 3);
    for (const reach of [-left, right]) expect(Math.abs(reach - 1.4)).toBeLessThan(SLACK);
    // Its head's middle is the boom's pivot: HEAD m over its feet and 0.8 m ahead of its centre, where avatar.js puts the head.
    const body = avatar.g.children.find((o: { visible: boolean }) => o.visible), head = partsOf({ body } as never).head.corners.map((c) => v.set(c.at[0], c.at[1], c.at[2]).applyMatrix4(body.matrixWorld).toArray());
    const middle = extent(head).map(([a, b]) => (a + b) / 2);
    expect(middle).toEqual([avatar.head.x, avatar.head.y, avatar.head.z].map((at) => expect.closeTo(at, 6)));
    expect(avatar.head.y - avatar.feet.y).toBeCloseTo(HEAD, 9);
    expect(avatar.head.z - avatar.feet.z).toBeCloseTo(0.8, 9);
  });

  it("keeps the outline its sheets show, its two sides each the other's mirror, to 2 cm (SLACK): the extent of each of its parts, and the body's surface round its middle line", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    stride(bear, 0);
    bear.g.updateMatrixWorld(true);
    const parts = partsOf(bear), into = bear.g.matrixWorld.clone().invert(), v = new THREE.Vector3();
    const limb = (k: number) => {
      const position = bear.legs[k].geometry.attributes.position;
      return Array.from({ length: position.count }, (_, i) => v.fromBufferAttribute(position, i).applyMatrix4(bear.legs[k].matrixWorld).applyMatrix4(into).toArray());
    };
    const [leftArm, rightArm, leftLeg, rightLeg] = [0, 1, 2, 3].map(limb);
    // Its two sides: each corner of a part to one side, mirrored, is a corner of it to the other side, and each limb the other's.
    const side = (list: number[][], s: number) => list.filter(([x]) => Math.abs(x) > 1e-9 && Math.sign(x) === s);
    for (const name of ["torso", "head", "ears", "muzzle", "eyes", "tail"]) {
      const at = parts[name].corners.map((c) => c.at);
      expect(mirrored(side(at, -1), side(at, 1)) && mirrored(side(at, 1), side(at, -1)), name).toBe(true);
    }
    expect(mirrored(leftArm, rightArm) && mirrored(rightArm, leftArm)).toBe(true);
    expect(mirrored(leftLeg, rightLeg) && mirrored(rightLeg, leftLeg)).toBe(true);
    // Each part's least and most across, up and along, in m, as its sheets show it: an arm and a leg the right one.
    const OUTLINE: Record<string, number[][]> = {
      torso: [[-1.278, 1.278], [0.589, 4.143], [-1.08, 1.12]],
      head: [[-1.1, 1.1], [2.5, 4.7], [-0.3, 1.9]],
      ears: [[-1.047, 1.047], [4.137, 4.835], [0.359, 0.736]],
      muzzle: [[-0.518, 0.518], [2.995, 3.805], [1.35, 2.25]],
      nose: [[-0.24, 0.24], [3.33, 3.67], [1.96, 2.36]],
      eyes: [[-0.53, 0.53], [3.79, 4.01], [1.62, 1.84]],
      ruff: [[-0.902, 0.898], [3.255, 3.826], [-0.809, 0.764]],
      tail: [[-0.276, 0.276], [1.18, 1.66], [-1.108, -0.772]],
      arm: [[0.801, 1.399], [1.92, 3.2], [-0.066, 0.712]],
      leg: [[0.16, 0.84], [0, 1.6], [-0.252, 0.632]],
    };
    const got: Record<string, number[][]> = { ...Object.fromEntries(Object.entries(parts).map(([name, p]) => [name, extent(p.corners.map((c) => c.at))])), arm: extent(rightArm), leg: extent(rightLeg) };
    expect(Object.keys(got).sort()).toEqual(Object.keys(OUTLINE).sort());
    for (const [name, want] of Object.entries(OUTLINE)) {
      want.forEach((pair, k) => pair.forEach((at, end) => expect(Math.abs(got[name][k][end] - at), `${name}'s ${["least", "most"][end]} ${"xyz"[k]}`).toBeLessThan(SLACK)));
    }
    // The tail to a millimetre, as its size is what makes it a tuft flattened against the rump and not a ball: 0.552 m across,
    // 0.48 m up and down, and 0.336 m fore and aft.
    OUTLINE.tail.forEach((pair, k) => pair.forEach((at, end) => expect(Math.abs(got.tail[k][end] - at), `the tail's ${["least", "most"][end]} ${"xyz"[k]}`).toBeLessThan(0.0005)));
    // The body's surface: how far it stands out from its middle line at nine heights, every 15° round from straight back (0°) to
    // straight ahead (180°), the same to either side, in m. Its groove down the back, its shoulders, its haunches and its nape.
    const ROUND: [number, number[]][] = [
      [0.8, [0.537, 0.556, 0.587, 0.619, 0.661, 0.718, 0.765, 0.738, 0.667, 0.596, 0.55, 0.53, 0.525]],
      [1.0, [0.75, 0.835, 0.928, 0.895, 0.872, 0.905, 0.941, 0.922, 0.861, 0.788, 0.74, 0.717, 0.713]],
      [1.3, [0.945, 1.061, 1.137, 1.074, 1.015, 1.014, 1.031, 1.02, 0.99, 0.947, 0.915, 0.897, 0.894]],
      [1.6, [1.009, 1.09, 1.137, 1.105, 1.077, 1.077, 1.089, 1.084, 1.07, 1.048, 1.026, 1.009, 1.007]],
      [2.0, [1.029, 1.089, 1.121, 1.123, 1.116, 1.118, 1.135, 1.141, 1.142, 1.13, 1.112, 1.095, 1.093]],
      [2.4, [1.039, 1.108, 1.143, 1.157, 1.169, 1.189, 1.212, 1.207, 1.189, 1.162, 1.138, 1.119, 1.117]],
      [2.8, [0.976, 1.056, 1.107, 1.122, 1.157, 1.217, 1.271, 1.252, 1.191, 1.117, 1.075, 1.053, 1.051]],
      [3.2, [0.834, 0.893, 0.942, 0.959, 0.996, 1.072, 1.147, 1.12, 1.035, 0.955, 0.913, 0.893, 0.89]],
      [3.6, [0.471, 0.48, 0.505, 0.542, 0.596, 0.665, 0.745, 0.741, 0.723, 0.702, 0.685, 0.674, 0.672]],
    ];
    for (const [y, row] of ROUND) {
      row.forEach((want, k) => {
        for (const s of k === 0 || k === 12 ? [1] : [1, -1]) expect(Math.abs(outTo(parts.torso.tris, y, (s * k * 15 * Math.PI) / 180) - want), `${y} m up, ${s * k * 15}°`).toBeLessThan(SLACK);
      });
    }
  });

  it("cups its ears: each a shell, the floor of its cup ahead of its back by 1.5 cm and more at its middle, and the cup facing forward, out and a little up, within 3° of where its sheets show it", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a), { ears } = partsOf(bear), fur = bear.color, pale = fur.clone().lerp(new THREE.Color(0xffffff), 0.5);
    const { position, normal } = bear.body.geometry.attributes, normals = new Map<string, number[]>(), key = (at: number[]) => at.join();
    for (let i = 0; i < position.count; i++) normals.set(key([position.getX(i), position.getY(i), position.getZ(i)]), [normal.getX(i), normal.getY(i), normal.getZ(i)]);
    const mean = (list: number[][]) => [0, 1, 2].map((k) => list.reduce((s, n) => s + n[k], 0) / list.length);
    const unit = (a: number[]) => a.map((v) => v / Math.hypot(...a));
    for (const side of [-1, 1]) {
      const cup = ears.corners.filter((c) => Math.sign(c.at[0]) === side && c.colour.every((v, k) => Math.abs(v - [pale.r, pale.g, pale.b][k]) < 1e-6));
      expect(cup.length).toBeGreaterThanOrEqual(6);
      // The way the cup faces, the mean of its normals: 27.5° out from straight ahead and 6.7° up. 3° turns the ear's rim by under a
      // centimetre.
      const facing = unit(mean(cup.map((c) => normals.get(key(c.at)) as number[]))), want = unit([side * 0.4585, 0.116, 0.8811]);
      expect(facing.reduce((s, v, k) => s + v * want[k], 0)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
      // Along the line through the cup's middle the way it faces, from 0.3 m behind: the line enters the ear through its back and then
      // leaves it through the cup's floor, 1.5 cm and more further on. A cup hollowed through its back would be left before it was
      // entered.
      const middle = mean(cup.map((c) => c.at)), met = crossings(ears.tris, middle.map((v, k) => v - 0.3 * facing[k]), facing).sort((a, b) => a.t - b.t);
      expect(met.map((c) => c.leaving)).toEqual([false, true]);
      expect(met[1].t - met[0].t).toBeGreaterThanOrEqual(0.015);
    }
  });

  it("runs the back of its head down into its neck and its neck into its ruff, with no dome of its body between them: what of the body stands higher than the ruff's top, at its own turn round the neck, is inside the head", () => {
    const { torso, head, ruff } = partsOf(buildBear(new THREE.Scene(), 0xd4607a));
    const turnOf = ([x, , z]: number[]) => Math.atan2(x, -z);
    // The ruff's top at each of its rings round the neck.
    const tops = new Map<number, number>();
    for (const c of ruff.corners) {
      const turn = Math.round(turnOf(c.at) * 1000);
      tops.set(turn, Math.max(tops.get(turn) ?? -Infinity, c.at[1]));
    }
    const rings = [...tops];
    expect(rings.length).toBeGreaterThanOrEqual(100);
    const topAt = (turn: number) => rings.reduce((a, r) => (Math.abs(r[0] / 1000 - turn) < Math.abs(a[0] / 1000 - turn) ? r : a))[1];
    const over = torso.corners.filter((c) => c.at[1] > topAt(turnOf(c.at)));
    expect(over.length).toBeGreaterThan(50);
    for (const c of over) expect(within(head.tris, ...(c.at as [number, number, number])), `${c.at.map((v) => v.toFixed(2))}`).toBe(true);
    // From 3.85 m up, the body lies 3 cm and more inside the head, along the level way out from its middle line; and where it would
    // have stood further out, 3 cm inside, to a tenth of a millimetre. The head is a ball, as its own corners have it.
    const [[left, right], [low, high], [back, front]] = extent(head.corners.map((c) => c.at));
    const r = (right - left) / 2, up = (low + high) / 2, ahead = (back + front) / 2;
    expect(head.corners.every(({ at: [x, y, z] }) => Math.abs(Math.hypot(x, y - up, z - ahead) - r) < 1e-5)).toBe(true);
    const inside = torso.corners.filter(({ at: [x, y, z] }) => y >= 3.85 && Math.hypot(x, z) > 1e-6).map(({ at: [x, y, z] }) => {
      const level = Math.hypot(x, z), b = (z / level) * ahead;
      return b + Math.sqrt(b * b - ahead * ahead - (y - up) ** 2 + r * r) - level;
    });
    expect(inside.length).toBeGreaterThan(100);
    expect(Math.min(...inside)).toBeGreaterThan(0.03 - 1e-4);
    expect(inside.filter((d) => d < 0.03 + 1e-4).length).toBeGreaterThanOrEqual(20);
  });

  it("ends its ruff in short, round locks that overlap out of step, and not in a row of points: shallow notches, broad ends, no two gaps between them alike", () => {
    // The ruff's lower edge round the back half of the neck, a quarter turn to either side of straight back, as tuftAt has it.
    const N = 2881, hem = Array.from({ length: N }, (_, i) => tuftAt(-Math.PI / 2 + (Math.PI * i) / (N - 1)));
    const ends: number[] = [], notches: number[] = [];
    for (let i = 1; i < N - 1; i++) {
      if (hem[i] > hem[i - 1] && hem[i] >= hem[i + 1]) ends.push(i);
      if (hem[i] < hem[i - 1] && hem[i] <= hem[i + 1]) notches.push(i);
    }
    expect(ends.length).toBeGreaterThanOrEqual(6);
    // Short: no lock hangs more than 0.2 m.
    expect(Math.max(...hem)).toBeLessThanOrEqual(0.2);
    // Each notch between two locks hangs nearly half as far as the shorter of the two (0.45 of it and more), so a notch is shallow
    // where it would be a gap between points; and of each lock, the part that hangs
    // more than half way from its deeper notch to its end is two fifths of it and more, on the mean: a lock's end is broad and round.
    const shares: number[] = [];
    for (const end of ends) {
      const before = notches.filter((n) => n < end).at(-1), after = notches.find((n) => n > end);
      if (before === undefined || after === undefined) continue;
      const half = (hem[end] + Math.max(hem[before], hem[after])) / 2;
      shares.push(hem.slice(before, after + 1).filter((h) => h >= half).length / (after - before + 1));
    }
    for (const notch of notches) {
      const before = ends.filter((e) => e < notch).at(-1), after = ends.find((e) => e > notch);
      if (before !== undefined && after !== undefined) expect(hem[notch] / Math.min(hem[before], hem[after])).toBeGreaterThan(0.45);
    }
    expect(shares.length).toBeGreaterThanOrEqual(5);
    expect(shares.reduce((s, v) => s + v, 0) / shares.length).toBeGreaterThan(0.4);
    // Out of step: the widest gap between two locks' ends is half as wide again as the narrowest.
    const gaps = ends.slice(1).map((e, k) => e - ends[k]);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5);
    // Two layers of locks, each of its own lengths: no two neighbours alike.
    expect(LOCKS).toHaveLength(RUFF.tufts);
    expect(OVER).toHaveLength(RUFF.over);
    for (const list of [LOCKS, OVER]) list.forEach((l: number, k: number) => expect(Math.abs(l - list[(k + 1) % list.length])).toBeGreaterThan(0.05));
    // As its sheets show them: each layer's lengths; a lock's end (lobe), whole at its middle and none at the notch, down by a
    // sixteenth a third of the way out and by a quarter half way; and the edge's drop at a few turns round the neck, from straight
    // back (0) round by the bear's left, to a hundredth of a millimetre.
    expect(LOCKS).toEqual([1, 0.78, 0.92, 0.72, 0.97, 0.8, 0.88, 0.7, 0.9, 0.76, 1, 0.82, 0.74, 0.94]);
    expect(OVER).toEqual([0.7, 0.55, 0.8, 0.6, 0.75, 0.5, 0.78, 0.62, 0.52]);
    for (const [phase, share] of [[0, 1], [Math.PI / 3, 0.9375], [Math.PI / 2, 0.75], [(2 * Math.PI) / 3, 0.4375], [Math.PI, 0]]) expect(lobe(phase)).toBeCloseTo(share, 9);
    const EDGE = [[0, 0.154769], [0.3, 0.07054], [0.9, 0.108278], [1.4, 0.096137], [-0.7, 0.057152], [-1.2, 0.048148], [2.5, 0.041268]];
    for (const [turn, drop] of EDGE) expect(tuftAt(turn), `${turn}`).toBeCloseTo(drop, 5);
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
  it("builds its shape once, and gives each bear a copy of its own to colour: a bear keeps its colours however many bears are built after it, in whatever colours, and what is done to one bear's mesh no other bear's shows", async () => {
    // A fresh copy of bears.js, whose shape is not built yet; three is the same three.
    vi.resetModules();
    const fresh = await import("../../../public/world/bears.js");
    const normals = vi.spyOn(THREE.BufferGeometry.prototype, "computeVertexNormals");
    const colours = (b: ReturnType<typeof buildBear>) => Array.from(b.body.geometry.attributes.color.array as Float32Array);
    const corners = (b: ReturnType<typeof buildBear>) => Array.from(b.body.geometry.attributes.position.array as Float32Array);
    try {
      // The first bear builds the shape, its smooth surfaces' normals among it; no bear after it builds them again.
      const pink = fresh.buildBear(new THREE.Scene(), 0xd4607a), built = normals.mock.calls.length;
      expect(built).toBeGreaterThan(0);
      const pinkColours = colours(pink), pinkCorners = corners(pink);
      const blue = fresh.buildBear(new THREE.Scene(), 0x6898d0), white = fresh.buildBear(new THREE.Scene(), VISITOR);
      expect(normals.mock.calls.length).toBe(built);
      // Each its own mesh and its own corners, the same shape, each in its own colours.
      const bears = [pink, blue, white];
      expect(new Set(bears.map((b) => b.body.geometry)).size).toBe(3);
      expect(new Set(bears.map((b) => b.body.geometry.attributes.position)).size).toBe(3);
      expect(new Set(bears.map((b) => b.body.geometry.attributes.color)).size).toBe(3);
      for (const b of bears) expect(corners(b)).toEqual(pinkCorners);
      expect(colours(pink)).toEqual(pinkColours);
      expect(colours(blue)).not.toEqual(pinkColours);
      // Whatever is done to one bear's corners and colours, the next bear is built as the first was.
      (pink.body.geometry.attributes.position.array as Float32Array).fill(0);
      (pink.body.geometry.attributes.color.array as Float32Array).fill(0);
      const again = fresh.buildBear(new THREE.Scene(), 0xd4607a);
      expect(corners(again)).toEqual(pinkCorners);
      expect(colours(again)).toEqual(pinkColours);
      expect(colours(blue)).not.toEqual(colours(pink));
      expect(normals.mock.calls.length).toBe(built);
    } finally {
      normals.mockRestore();
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

  it("gives the fur a grain fixed to the bear, of its own colour deepened and never paled, drawn only where a pixel can hold it: the shader's own code, run here from its text, reads nothing of the eye or the screen", () => {
    const shader = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader };
    furMaterial(true).onBeforeCompile(shader);
    const text: string = shader.fragmentShader;
    // The grain is a product on the surface's colour, before the rim pales it, and the only one.
    const grain = text.indexOf("diffuseColor.rgb *= "), rim = text.indexOf("float fuzz");
    expect(grain).toBeGreaterThan(text.indexOf("#include <normal_fragment_begin>"));
    expect(grain).toBeLessThan(rim);
    expect(text.match(/diffuseColor\.rgb \*=/g)).toHaveLength(1);
    // Of what the fur adds to three's shader, only the rim reads the eye's way to the surface (vViewPosition) and its normal, in the
    // one line that measures how far the surface turns from the eye; nothing reads the screen or the camera.
    const view = /\b(vViewPosition|gl_FragCoord|gl_FrontFacing|cameraPosition|viewMatrix|modelViewMatrix|projectionMatrix|modelMatrix|isOrthographic|normal|vNormal)\b/;
    expect(text.split("\n").map((line) => line.trim()).filter((line) => view.test(line))).toEqual(["float fuzz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);"]);
    // The fur's functions (furHash, furNoise, furSeen), as the shader has them after three's common chunk; and its grain, from the
    // normal chunk to the rim. Each runs here from its own text (glsl), given only the corner's place on the bear (vFurAt), the
    // surface's colour and how fast a place changes from pixel to pixel (fwidth); a name the code read beside those would fail it.
    const after = (from: string, to: string) => { const start = text.indexOf(from) + from.length; return text.slice(start, text.indexOf(to, start)); };
    let w = 0;
    const fur = glsl(after("#include <common>", "#include"), { fwidth: () => [w, w, w] });
    const drawn = (at: number[], colour: number[], pixel: number) => {
      w = pixel;
      return glsl(after("#include <normal_fragment_begin>", "float fuzz"), { ...fur, vFurAt: at, diffuseColor: [...colour, 1] }).diffuseColor as number[];
    };
    // The test can fail where it says: a grain that read the eye's place or the screen's would not run here.
    expect(() => (glsl(after("#include <common>", "#include").replace("floor(p)", "floor(p + vViewPosition * 0.2)"), { fwidth: () => [0, 0, 0] }).furNoise as Fn)([1, 2, 3])).toThrow(/vViewPosition/);
    const screened = after("#include <normal_fragment_begin>", "float fuzz").replace("vec3 clumps = vFurAt", "vec3 clumps = (vFurAt + gl_FragCoord.xyx * 0.01)");
    expect(() => glsl(screened, { ...fur, vFurAt: [1, 2, 3], diffuseColor: [1, 1, 1, 1] })).toThrow(/gl_FragCoord/);
    // The noise lies between 0 and 1 wherever it is read, and ranges over most of that: a grain, not a flat tone.
    let seed = 7, lo = Infinity, hi = -Infinity;
    const next = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 40 - 20; };
    for (let k = 0; k < 20000; k++) { const n = (fur.furNoise as Fn)([next(), next(), next()]) as number; lo = Math.min(lo, n); hi = Math.max(hi, n); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.8);
    // And its own values, as the shader's text has them now: at a cell's corner, that corner's hash; between, the hashes of the
    // cell's eight corners, eased (f * f * (3 - 2f)) and mixed along x, then y, then z. A changed hash, easing or mix moves them.
    const NOISE: [number[], number][] = [
      [[1, 2, 3], 0.178830833], [[-4, 0, 7], 0.184429675], [[0.3, 1.7, -2.45], 0.61291899],
      [[5.15, -3.62, 0.81], 0.323139576], [[-12.7, 8.35, 3.9], 0.864789757], [[0.62, 0.21, 0.37], 0.345848254],
    ];
    for (const [at, value] of NOISE) expect((fur.furNoise as Fn)(at) as number, `${at}`).toBeCloseTo(value, 8);
    // The fade: whole where a cell is four pixels across and more (a quarter of a cell a pixel or less), none where it is two or less.
    for (const [pixel, seen] of [[0, 1], [0.25, 1], [0.375, 0.5], [0.5, 0], [2, 0]]) {
      w = pixel;
      expect((fur.furSeen as Fn)([1, 2, 3]) as number).toBeCloseTo(seen, 9);
    }
    // The grain at corners all over the bear, and the same corner as the eye draws away: the colour times one number, between 1 less
    // the sum of FUR.deep and 1, the same at the same corner whatever else, all of it gone where a pixel cannot hold a cell; and over
    // the bear it ranges over most of what it may.
    expect(FUR.deep.every((d: number) => d > 0)).toBe(true);
    expect(FUR.deep[0] + FUR.deep[1]).toBeLessThanOrEqual(0.2);
    const colour = [0.8, 0.5, 0.3];
    let least = 1, most = 0;
    for (let k = 0; k < 400; k++) {
      const at = [next() * 0.075, (next() + 20) * 0.12, next() * 0.09];
      const [r, g, b] = drawn(at, colour, 0), share = r / colour[0];
      expect(g / colour[1]).toBeCloseTo(share, 9);
      expect(b / colour[2]).toBeCloseTo(share, 9);
      expect(share).toBeLessThanOrEqual(1);
      expect(share).toBeGreaterThanOrEqual(1 - FUR.deep[0] - FUR.deep[1]);
      expect(drawn(at, colour, 0)).toEqual([r, g, b, 1]);
      expect(drawn(at, colour, 0.6)).toEqual([...colour, 1]);
      least = Math.min(least, share);
      most = Math.max(most, share);
    }
    expect(most - least).toBeGreaterThan(0.6 * (FUR.deep[0] + FUR.deep[1]));
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
