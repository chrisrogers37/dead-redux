/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { mesh } from "./landmarks.js";

/* The bears are soft toys of a kind: round, smooth-shaded, each in one colour with a belly and muzzle a shade apart from it, a dark
   nose and two dark eyes. They walk upright, arms swinging against their legs, rocking a little from side to side. */

/* A bear's fur: a smooth Lambert surface whose colour pales toward white where it turns from the eye, so its edge reads soft against the
   sky by day and stays dark at night. It is the surface's own colour that pales, never the light on it: at its palest the rim is
   still no brighter than a white surface under the same light, so the music's light swings no further on a bear's edge than on
   anything white. Before it pales, the fur has a grain (FUR): clumps, and strands in them, longer up and down than across, a value
   noise of the corner's own place on the bear, so the grain holds still on the bear however it or the eye moves. It deepens the
   fur's own colour by up to the sum of FUR.deep, and never pales it. A grain whose cells a pixel cannot hold is not drawn: each fades
   out as its cells come down from FUR.seen[1] to FUR.seen[0] of a metre of its own a pixel (cells four pixels across, to two), so
   nothing finer than a few pixels breaks into specks far off. `vertexColors` for a body, which carries its colours on its vertices;
   without them for the limbs, which take each bear's colour by instance (drawLegs). */
export const FUR = { clumps: [8, 3.5, 8], strands: [26, 9, 26], deep: [0.09, 0.07], seen: [0.25, 0.5] };
const vec3 = ([x, y, z]) => `vec3(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
export function furMaterial(vertexColors) {
  const m = new THREE.MeshLambertMaterial({ vertexColors });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
      varying vec3 vFurAt;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
      vFurAt = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
      varying vec3 vFurAt;
      float furHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float furNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(furHash(i), furHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(furHash(i + vec3(0.0, 1.0, 0.0)), furHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                   mix(mix(furHash(i + vec3(0.0, 0.0, 1.0)), furHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(furHash(i + vec3(0.0, 1.0, 1.0)), furHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
      }
      float furSeen(vec3 p) { vec3 w = fwidth(p); return 1.0 - smoothstep(${FUR.seen[0].toFixed(2)}, ${FUR.seen[1].toFixed(2)}, max(w.x, max(w.y, w.z))); }`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      vec3 clumps = vFurAt * ${vec3(FUR.clumps)}, strands = vFurAt * ${vec3(FUR.strands)};
      diffuseColor.rgb *= 1.0 - ${FUR.deep[0].toFixed(2)} * furSeen(clumps) * furNoise(clumps) - ${FUR.deep[1].toFixed(2)} * furSeen(strands) * furNoise(strands);
      float fuzz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
      /* Fur pales; what is dark on a bear, its nose and its eyes, stays dark to its edge. */
      float furred = smoothstep(0.03, 0.2, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.45 * fuzz * furred);`);
  };
  return m;
}
const bodyMat = furMaterial(true);
/* A limb, the same on every bear: rounded, LIMB m long, hanging from its own origin, so it swings from the hip or the shoulder, with a
   paw at its end that reaches forward; and the white that each bear's colour tints (drawLegs). The paw is an egg PAW_UP m high and
   PAW_LONG m long about a point PAW_AT below and ahead of the origin. */
const LIMB = 1.6, PAW_UP = 0.34 * 0.72, PAW_LONG = 0.34 * 1.3, PAW_AT = [1.355, 0.14];
const LEG = mergeGeometries([
  new THREE.CapsuleGeometry(0.29, 0.92, 4, 10).translate(0, -0.75, 0),
  new THREE.SphereGeometry(0.34, 12, 6).scale(1, 0.72, 1.3).translate(0, -PAW_AT[0], PAW_AT[1]),
]);
const legMat = furMaterial(false);
/* Where each limb hangs from, in the bear's own frame: the arms from its shoulders, shorter and slimmer than the legs (a scale on
   the same limb), then the legs from its hips. The gait swings the first with the last and the second with the third, so an arm
   swings with the leg across from it. An arm hangs from inside its shoulder's mass (SHOULDER), which covers its top. */
export const LIMBS = [
  { at: [-1.1, 3.2, 0.2], scale: [0.88, 0.8, 0.88] }, { at: [1.1, 3.2, 0.2], scale: [0.88, 0.8, 0.88] },
  { at: [-0.5, 1.6, 0.05], scale: [1, 1, 1] }, { at: [0.5, 1.6, 0.05], scale: [1, 1, 1] },
];

/* The masses that give the body its form, each a soft swelling of its surface (or, by less than nothing, a hollow) about a point on it,
   `by` m at its middle and fading over `r` m along each axis, `p` the power of the fade up and down (2 a round swelling, more a long
   one with a flat top). Each stands to both sides of the bear, mirrored, where `at` is off its middle line. Seen from behind, where the
   walk's camera stands: a shoulder to each side, which an arm hangs out of; a shoulder blade to each side of a soft groove down the
   spine, both low and broad, so the back reads as one back and not as ribs; the waist drawn in; the rump, two haunches with the tail
   between them; and a thigh to each side, which a leg comes out of. */
export const SHOULDER = { at: [0.92, 2.95, 0.08], r: [0.42, 0.4, 0.5], by: 0.22, p: 2 };
export const SPINE = { at: [0, 2.6, -1.1], r: [0.2, 0.95, 0.45], by: -0.08, p: 4 };
export const HAUNCH = { at: [0.44, 1.3, -0.82], r: [0.36, 0.4, 0.42], by: 0.24, p: 2 };
const FORM = [
  SHOULDER,
  { at: [0, 3.8, -0.55], r: [0.75, 0.35, 0.4], by: -0.12, p: 2 },
  { at: [0.46, 2.95, -0.8], r: [0.36, 0.45, 0.35], by: 0.05, p: 2 },
  SPINE,
  { at: [1.15, 2.05, -0.25], r: [0.4, 0.38, 0.8], by: -0.07, p: 2 },
  HAUNCH,
  { at: [0.7, 1.05, 0.05], r: [0.35, 0.4, 0.45], by: 0.16, p: 2 },
];
/* Where the fur lies deeper in the body's folds, the same way: `by` is how much of its colour it loses at the middle of the fold. The
   groove of the spine, the cleft between the haunches under the tail, the creases where the haunches meet the legs, and the armpits. */
const SHADE = [
  { at: [0, 2.6, -1.1], r: [0.1, 0.9, 0.5], by: 0.12, p: 4 },
  { at: [0, 1.2, -1.0], r: [0.09, 0.3, 0.4], by: 0.22, p: 2 },
  { at: [0.42, 0.88, -0.6], r: [0.38, 0.13, 0.45], by: 0.14, p: 2 },
  { at: [1.0, 2.7, 0.1], r: [0.25, 0.28, 0.3], by: 0.14, p: 2 },
];
const sum = (list, x, y, z) => {
  let out = 0;
  for (const { at, r, by, p } of list) {
    const dx = (at[0] === 0 ? x : Math.abs(x) - at[0]) / r[0], dy = (y - at[1]) / r[1], dz = (z - at[2]) / r[2], q = dx * dx + Math.abs(dy) ** p + dz * dz;
    /* Nothing past three of its lengths, where it is down to a ten-thousandth: the belly's colour is its own exactly. */
    if (q < 9) out += by * Math.exp(-q);
  }
  return out;
};
/* How far the body's surface at a point swells out of its egg: the sum of every mass's (FORM). And how much of its colour the fur
   there loses (SHADE). */
export const formAt = (x, y, z) => sum(FORM, x, y, z);
export const shadeAt = (x, y, z) => sum(SHADE, x, y, z);
/* A surface's normals from its own triangles, its seams closed first, so it shades as one smooth surface; and no uv, which no bear's
   material reads. Each part of the body carries a `tone` at each corner, which the bear's colours make its colour (buildBear): how far
   into an ear's cup, or out to the ruff's tips, the corner is; 0 where nothing depends on it. */
function smoothed(geo) {
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  const out = mergeVertices(geo, 1e-6);
  out.computeVertexNormals();
  return toned(out);
}
function toned(geo, tones = new Float32Array(geo.attributes.position.count)) {
  if (!geo.attributes.tone) geo.setAttribute("tone", new THREE.BufferAttribute(tones, 1));
  return geo;
}
/* A ball, scaled or not: its own normals are true to it already, so only its uv goes. */
function ball(geo) {
  geo.deleteAttribute("uv");
  return toned(geo);
}
/* The body's egg: 1.22 m to each side of its middle and 1.12 m fore and aft at its widest, 2.4 m up, drawing in by a fifth toward its
   shoulders (`draw`, by height), so the bear has a chest and a belly and not one round ball; from 0.6 m up to 4.15 m, which leaves its
   legs showing. */
const EGG = { up: 2.37, across: 1.22, high: 1.78, deep: 1.12 };
const drawAt = (y) => { const t = Math.max(0, Math.min(1, (y - 2.4) / 1.6)); return 1 - 0.2 * t * t * (3 - 2 * t); };
/* The body: the egg, its surface then swelling and hollowing by its masses (FORM), out along the egg's own normal, and drawn in at
   the nape (napeAt). */
function torso() {
  const geo = new THREE.SphereGeometry(1, 36, 24).scale(EGG.across, EGG.high, EGG.deep).translate(0, EGG.up, 0), pos = geo.attributes.position, normal = geo.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, (y - 2.4) / 1.6)), draw = drawAt(y), slope = (-0.2 * 6 * t * (1 - t)) / 1.6;
    /* The normal turns with the surface: drawn in, it leans up where the body narrows. */
    n.fromBufferAttribute(normal, i);
    n.set(n.x / draw, n.y - (slope * (x * n.x + z * n.z)) / draw, n.z / draw).normalize();
    const out = formAt(x * draw, y, z * draw), px = x * draw + n.x * out, py = y + n.y * out, pz = z * draw + n.z * out, level = Math.hypot(px, pz);
    const nape = level > 0 ? napeAt(px / level, pz / level, py, level) / level : 1;
    pos.setXYZ(i, px * nape, py, pz * nape);
  }
  return smoothed(geo);
}
/* How far the body's surface stands from its middle line at height `y`, along the level way (dx, dz): the egg's, and its masses',
   drawn in at the nape. */
function bodyOut(dx, dz, y) {
  const k = Math.sqrt(Math.max(0, 1 - ((y - EGG.up) / EGG.high) ** 2)) * drawAt(y), egg = 1 / Math.hypot(dx / (EGG.across * k), dz / (EGG.deep * k));
  return napeAt(dx, dz, y, egg + formAt(dx * egg, y, dz * egg));
}
/* The nape: where the body stands out behind or beside the head, it draws in toward the head's surface from NAPE.from m up, and
   from NAPE.to m up it lies NAPE.in m inside it, so the back of the head runs down into the neck and the neck into the ruff, with
   no dome of the body between them. `out` is how far the body's surface would stand from the middle line there. */
export const NAPE = { from: 3.45, to: 3.85, in: 0.03 };
function napeAt(dx, dz, y, out) {
  const head = headOut(dx, dz, y) - NAPE.in;
  return head > 0 && out > head ? head + (out - head) * (1 - smooth(NAPE.from, NAPE.to, y)) : out;
}
/* The head: a ball HEAD.r m round about a point HEAD.up m over the feet and HEAD.ahead m ahead of the centre. And how far its surface
   stands from the middle line at height `y` along the level way (dx, dz), or 0 where it does not reach. */
const HEAD = { r: 1.1, up: 3.6, ahead: 0.8 };
function headOut(dx, dz, y) {
  const c = HEAD.ahead * dz, d = c * c - HEAD.ahead * HEAD.ahead - (y - HEAD.up) ** 2 + HEAD.r * HEAD.r;
  return d > 0 ? Math.max(0, c + Math.sqrt(d)) : 0;
}
const INK = new THREE.Color(0x0b0b0d), WHITE = new THREE.Color(0xffffff);
/* A bear's nose: an egg NOSE.r m long about a point NOSE.up m over its feet and NOSE.ahead m ahead of its centre. Its tip is the
   furthest any part of a bear stands from its centre, SNOUT m ahead of it: what a bear is stopped by, it is stopped that far from. */
export const NOSE = { up: 3.5, ahead: 2.16, r: 0.2 }, SNOUT = NOSE.ahead + NOSE.r;
/* Fur whose relative luminance is over NEAR_WHITE is near white; its belly, muzzle and inner ears are PALE_DEEP of its colour, a
   shade deeper than the fur. The ruff and the tail are the fur itself, in the bear's own colour out to their tips, and deeper by
   ROOT_DEEP of it where each grows out of the body, as fur lies deeper at its roots. */
const NEAR_WHITE = 0.6, PALE_DEEP = 0.84, ROOT_DEEP = 0.16;
const smooth = (edge0, edge1, x) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/* An ear: a cupped disc EAR.wide m across and EAR.high m high, its back rounded and its front hollowed into a cup, the cup turned
   forward and a little out, tipped out and tilted to the rear, set into the head to each side with its top EAR_TOP m up, the top of the
   bear. Its tone is how far into the cup a corner is (0 on the back and the rim, 1 in its middle). */
export const EAR = { wide: 0.37, high: 0.35, thick: 0.16, back: 0.1, cup: 0.24, at: [0.72, 0.55], turn: 0.45, tip: 0.25, lean: 0.12 }, EAR_TOP = 4.835;
function ear(side) {
  const geo = new THREE.SphereGeometry(1, 16, 12), pos = geo.attributes.position, inner = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    /* The front half is pushed back toward the middle by the square of how far forward it faces: the rim stays, the middle sinks. */
    pos.setXYZ(i, x * EAR.wide, y * EAR.high, z > 0 ? EAR.thick * z - EAR.cup * z * z : EAR.back * z);
    inner[i] = smooth(0.35, 0.7, z);
  }
  geo.rotateX(-EAR.lean).rotateZ(-side * EAR.tip).rotateY(side * EAR.turn);
  geo.computeBoundingBox();
  geo.translate(side * EAR.at[0], EAR_TOP - geo.boundingBox.max.y, EAR.at[1]);
  geo.setAttribute("tone", new THREE.BufferAttribute(inner, 1));
  return smoothed(geo);
}

/* The tail: a tuft TAIL.r m round, flattened against the rump to TAIL.flat of that along each axis, about a point TAIL.at, sunk into
   the cleft between the haunches past its middle, its back TAIL_BACK. Its tone is how far a corner is from its root, the body's
   surface (0), out to its back (1). */
const TAIL = { r: 0.24, flat: [1.15, 1, 0.7], at: [0, 1.42, -0.94] };
function tail() {
  const geo = ball(new THREE.SphereGeometry(TAIL.r, 12, 8).scale(...TAIL.flat).translate(...TAIL.at)), pos = geo.attributes.position, tone = geo.attributes.tone;
  for (let i = 0; i < pos.count; i++) tone.setX(i, smooth(-0.97, -1.1, pos.getZ(i)));
  return geo;
}

/* The ruff: a collar of fur round the neck, lying on the body: its ring runs on the body's surface (bodyOut), RUFF.up m up at the sides
   and tipped forward RUFF.tilt rad, so it lies lower on the back and rides up under the chin. Its roll is RUFF.thin m thick at the
   front and RUFF.thick at the back, so it stands that far proud of the body; its lower, outer edge falls into short locks, longest at
   the back, which lie down over the shoulders and the back by up to RUFF.hang m, so its edge is uneven and never a ring's. The locks
   lie in two layers that overlap: RUFF.tufts locks, each of its own length (LOCKS, from the middle of the back round by the bear's
   left), and over them RUFF.over shorter ones (OVER), set round the neck out of step with the first, so no two gaps fall alike. Each
   lock's end is round and broad (lobe), and the notch between two is a soft, shallow curve: RUFF_U is eight steps a lock, so the edge
   is a run of curves and never a row of points. Its tone is how far a corner is from the root, where the ruff grows out of the fur
   (0), to the outside of the roll and the locks (1). */
export const RUFF = { up: 3.55, tilt: 0.06, thin: 0.08, thick: 0.15, tall: 2.2, tufts: 14, over: 9, hang: 0.17 }, RUFF_U = 8 * RUFF.tufts, RUFF_V = 10;
export const LOCKS = [1, 0.78, 0.92, 0.72, 0.97, 0.8, 0.88, 0.7, 0.9, 0.76, 1, 0.82, 0.74, 0.94];
export const OVER = [0.7, 0.55, 0.8, 0.6, 0.75, 0.5, 0.78, 0.62, 0.52];
/* A lock's end, by its turn `phase` from its middle: 1 there and flat about it, so the end is round; down to 0 half a lock away. */
export const lobe = (phase) => 1 - ((1 - Math.cos(phase)) / 2) ** 2;
/* How far down the ruff's edge hangs at `u` round the neck (0 at the back, π at the front): longest at the back; the two layers'
   locks together, the longer of the two wherever they overlap, eased into each other; never less than three tenths of the longest a
   lock could be there, so a notch between two locks is shallow. */
export const tuftAt = (u) => {
  const n = RUFF.tufts, m = RUFF.over, k = ((Math.round((n * u) / (2 * Math.PI)) % n) + n) % n, j = ((Math.round((m * u + 2) / (2 * Math.PI)) % m) + m) % m;
  const locks = (LOCKS[k] * lobe(n * u)) ** 4 + (OVER[j] * lobe(m * u + 2)) ** 4;
  return RUFF.hang * (0.3 + 0.7 * ((1 + Math.cos(u)) / 2)) * (0.8 + 0.2 * Math.cos(4 * u + 1)) * (0.3 + 0.7 * locks ** 0.25);
};
/* The ring's height and its distance out from the middle line at `u`, on the body's surface. */
export function ruffRing(u) {
  const dx = Math.sin(u), dz = -Math.cos(u);
  let y = RUFF.up, out = 1;
  for (let k = 0; k < 3; k++) { out = bodyOut(dx, dz, y); y = RUFF.up + Math.tan(RUFF.tilt) * dz * out; }
  return { y, out };
}
function ruff() {
  const pos = [], tones = [], index = [];
  for (let i = 0; i <= RUFF_U; i++) {
    const u = (i / RUFF_U) * 2 * Math.PI, back = (1 + Math.cos(u)) / 2, dx = Math.sin(u), dz = -Math.cos(u);
    const roll = RUFF.thin + (RUFF.thick - RUFF.thin) * back, tuft = tuftAt(u), { y, out: ring } = ruffRing(u);
    /* Its top lies back into the neck: the top of the roll is drawn in to just inside the body or the head, whichever stands out
       further there, so the ruff slopes out and down from the neck to its outer edge, as fur grows, and has no ledge on top. */
    const top = y + roll * RUFF.tall, neck = Math.max(bodyOut(dx, dz, top), headOut(dx, dz, top)) - 0.06;
    for (let j = 0; j <= RUFF_V; j++) {
      const v = (j / RUFF_V) * 2 * Math.PI, out = Math.cos(v), up = Math.sin(v);
      /* The roll's lower, outer quarter is drawn out into the locks, which lie down over the body, three times more down than out. */
      const fall = Math.max(0, Math.cos(v + Math.PI / 4)) ** 2 * tuft, rim = ring + roll * out + 0.3 * fall;
      const along = up > 0 ? rim + (Math.min(rim, neck) - rim) * up ** 1.5 : rim;
      pos.push(dx * along, y + roll * (up > 0 ? RUFF.tall : 1) * up - 0.9 * fall, dz * along);
      tones.push(Math.max(smooth(-0.6, 0.6, out - up * 0.4), fall / RUFF.hang));
    }
  }
  /* Wound so each face's front looks out of the roll. */
  for (let i = 0; i < RUFF_U; i++) for (let j = 0; j < RUFF_V; j++) {
    const a = i * (RUFF_V + 1) + j, b = a + RUFF_V + 1;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("tone", new THREE.Float32BufferAttribute(tones, 1));
  geo.setIndex(index);
  return smoothed(geo);
}

/* A bear's shape, the same in every colour: its parts, merged into one geometry, with where each part's triangles stand in it (its
   first index and how many) and its corners (its first corner and how many). It is built once, when the first bear is, and each bear
   colours a copy of it (buildBear). */
let SHAPE = null;
function shape() {
  if (SHAPE) return SHAPE;
  const parts = {
    torso: torso(),
    head: ball(new THREE.SphereGeometry(HEAD.r, 24, 16).translate(0, HEAD.up, HEAD.ahead)),
    /* The small parts are round enough to keep a round outline a snout's length from the eye, in first person. */
    ears: mergeGeometries([ear(-1), ear(1)]),
    muzzle: ball(new THREE.SphereGeometry(0.45, 16, 10).scale(1.15, 0.9, 1).translate(0, 3.4, 1.8)),
    nose: ball(new THREE.SphereGeometry(NOSE.r, 12, 8).scale(1.2, 0.85, 1).translate(0, NOSE.up, NOSE.ahead)),
    eyes: mergeGeometries([-0.42, 0.42].map((x) => ball(new THREE.SphereGeometry(0.11, 8, 6).translate(x, 3.9, 1.73)))),
    /* What shows from behind, where the walk's camera stands: a ruff round the neck, standing a hand proud of the shoulders, and a
       round tail, both in the fur and deeper at their roots. bears.test.ts holds both to showing: a ruff inside the body is no ruff. */
    ruff: ruff(),
    tail: tail(),
  };
  const at = {}, corners = {};
  let first = 0, corner = 0;
  for (const [name, geo] of Object.entries(parts)) {
    at[name] = [first, geo.index.count];
    corners[name] = [corner, geo.attributes.position.count];
    first += geo.index.count;
    corner += geo.attributes.position.count;
  }
  SHAPE = { geo: mergeGeometries(Object.values(parts)), at, corners };
  return SHAPE;
}

/* One bear in a colour: a group whose four limbs swing, the rest of it one mesh. It stands 4.85 m tall and faces +z, inside the sizes
   the world keeps round a bear: its nose 2.36 m ahead of its centre and its arms, the widest of it, within 1.5 m to either side, within
   the 2.4 m and the 1.5 m the walk allows it (collide.js), and no part of it further than 1.98 m from its middle, which stands 0.4 m
   ahead of its centre, the reach the crowd parts round (crowd.js). bears.test.ts holds it to them. Its belly, its muzzle and the
   insides of its ears are paler than its fur on a bear in a colour and a shade deeper on a pale one; a ruff round its neck and its
   round tail are its fur, deeper at their roots; its nose and eyes are dark.
   Each limb stays in the group as a hidden mesh, where the gait swings it (stride) and what reads the bear's meshes finds it (main.js's
   bearsInView); drawLegs draws them. */
export function buildBear(scene, hue) {
  const fur = new THREE.Color(hue), mix = new THREE.Color();
  /* The belly, the muzzle and the inner ears stand apart from the fur: paler on a bear in a colour; on a bear whose fur is near white
     already (the visitor's), where paler would not show, a shade deeper than the fur. */
  const nearWhite = 0.2126 * fur.r + 0.7152 * fur.g + 0.0722 * fur.b > NEAR_WHITE;
  const pale = nearWhite ? fur.clone().multiplyScalar(PALE_DEEP) : fur.clone().lerp(WHITE, 0.5);
  /* The ruff's and the tail's: the fur, deeper toward the root by its tone. */
  const rooted = (i) => mix.copy(fur).multiplyScalar(1 - ROOT_DEEP * (1 - tone.getX(i)));
  /* The belly: the front of the body, an oval 0.78 m to each side of its middle and 1.15 m above and below a point 2 m up. */
  const belly = (v) => mix.copy(fur).lerp(pale, v.z > 0.4 ? smooth(1, 0.72, Math.hypot(v.x / 0.78, (v.y - 2) / 1.15)) : 0);
  /* The fur on the body: the belly's, deeper in the folds (SHADE). */
  const coat = (v) => belly(v).multiplyScalar(1 - shadeAt(v.x, v.y, v.z));
  const g = new THREE.Group();
  /* Each part's colour at a corner: the torso's by its place, the ears', the ruff's and the tail's by their tone, the rest one colour
     each. */
  const { geo: shaped, at, corners } = shape(), geo = shaped.clone(), pos = geo.attributes.position, tone = geo.attributes.tone, v = new THREE.Vector3();
  const paint = {
    torso: (i) => coat(v.fromBufferAttribute(pos, i)), head: () => fur, ears: (i) => mix.copy(fur).lerp(pale, tone.getX(i)), muzzle: () => pale,
    nose: () => INK, eyes: () => INK, ruff: rooted, tail: rooted,
  };
  const colors = new Float32Array(pos.count * 3);
  for (const [name, [first, count]] of Object.entries(corners)) for (let i = first; i < first + count; i++) paint[name](i).toArray(colors, i * 3);
  geo.deleteAttribute("tone");
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const body = new THREE.Mesh(geo, bodyMat);
  /* Where each part's triangles stand in the one mesh, for the tests: its first index and how many. */
  body.userData.parts = Object.fromEntries(Object.entries(at).map(([name, range]) => [name, [...range]]));
  const legs = LIMBS.map(({ at: [x, y, z], scale: [sx, sy, sz] }, k) => {
    const leg = mesh(LEG, legMat, x, y, z);
    leg.scale.set(sx, sy, sz);
    leg.visible = false;
    return leg;
  });
  g.add(...legs, body);
  scene.add(g);
  return { g, legs, body, color: fur };
}

/* How far a leg swung by `angle` reaches below its hip: its paw's lowest point, as the paw turns with the leg. */
const legReach = (angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return PAW_AT[0] * c + PAW_AT[1] * s + Math.sqrt(PAW_UP * PAW_UP * c * c + PAW_LONG * PAW_LONG * s * s);
};
/* As the legs swing the body rocks to the side of the leg that swings forward, ROCK rad for each radian of swing, about the line from
   the back of its tail to the tip of its nose (ROCK_AXIS), which stay where they are: so the furthest of the bear ahead (SNOUT) and
   behind (crowd.js BEAR_TAIL) stand where they did. Its head and shoulders go one way and its hips a little the other. The arms rock
   with it, in their shoulders; the legs swing from the hips alone. */
export const ROCK = 0.08, TAIL_BACK = new THREE.Vector3(TAIL.at[0], TAIL.at[1], TAIL.at[2] - TAIL.r * TAIL.flat[2]);
export const ROCK_AXIS = new THREE.Vector3(0, NOSE.up, SNOUT).sub(TAIL_BACK).normalize();
const rocked = new THREE.Quaternion(), swung = new THREE.Quaternion(), ACROSS = new THREE.Vector3(1, 0, 0), shift = new THREE.Vector3();
/* Swings a bear's limbs by `swing` radians: an arm with the leg across from it, the two legs against each other. A leg that swings
   from the hip lifts its paw, so the whole bear comes down by as much as its lower paw rose, and a paw stays on the ground through the
   stride. It never rises: early in a stride the toe of the forward paw dips a few millimetres under the ground instead. The body and
   the arms rock from side to side with the swing (ROCK). Returns how far the bear came down, in metres. */
const REST = legReach(0);
export function stride(bear, swing) {
  const { legs, body } = bear, drop = Math.max(0, REST - legReach(Math.abs(swing)));
  /* The rock: a turn about ROCK_AXIS, and the shift that keeps the axis where it was, across and along; the body comes down by the
     drop alone, so the axis's ends stand lower as it turns, by under 3 mm at a run's swing (0.7). */
  rocked.setFromAxisAngle(ROCK_AXIS, ROCK * swing);
  shift.copy(TAIL_BACK).applyQuaternion(rocked).negate().add(TAIL_BACK).setY(0 - drop);
  body.quaternion.copy(rocked);
  body.position.copy(shift);
  legs[2].rotation.x = -swing; legs[3].rotation.x = swing;
  for (let k = 0; k < 4; k++) {
    const [x, y, z] = LIMBS[k].at;
    if (k >= 2) { legs[k].position.y = y - drop; continue; }
    /* An arm hangs from its shoulder where the rock carries it, swinging in it: the rock, then its own swing. */
    legs[k].position.set(x, y, z).applyQuaternion(rocked).add(shift);
    legs[k].quaternion.copy(rocked).multiply(swung.setFromAxisAngle(ACROSS, k === 0 ? swing : -swing));
  }
  return drop;
}

/* The tier's bears (five, or three on a phone) in the dancing-bear colours. */
export function buildBears(scene, count) {
  const HUES = [0xd4607a, 0xd4a056, 0x78b070, 0x6898d0, 0x9a80c0];
  return HUES.slice(0, count).map((hue, k) => ({ ...buildBear(scene, hue), phase: k * 0.9 }));
}

/* Every leg of `bears` (each with its group, legs and colour, as buildBear makes them) as one instanced mesh, which costs one draw call
   where each leg cost its own. Before each render, once three has placed every part and before it culls or draws, the mesh takes the
   place of each leg of the bears the frame shows, in its bear's colour; a bear the downgrade has taken out of the scene shows none, nor
   a hidden one (the visitor's, in first person). */
export function drawLegs(scene, bears) {
  const legs = new THREE.InstancedMesh(LEG, legMat, 4 * bears.length);
  legs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12 * bears.length), 3);
  scene.add(legs);
  scene.onBeforeRender = () => {
    let n = 0;
    for (const b of bears) {
      if (b.g.parent !== scene || !b.g.visible) continue;
      for (const leg of b.legs) { legs.setMatrixAt(n, leg.matrixWorld); legs.setColorAt(n, b.color); n += 1; }
    }
    legs.count = n;
    legs.instanceMatrix.needsUpdate = true;
    legs.instanceColor.needsUpdate = true;
    legs.computeBoundingSphere();
  };
}
