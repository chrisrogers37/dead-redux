/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { height, STAGE, STAGE_COLUMN, TEST_POSES } from "./ground.js";
import { keepOuts, parting, PERSON, seats } from "./seats.js";

/* The crowd on the hill: a few hundred people, no two of them alike, faceless and dark like the band's silhouettes, on the slope in
   front of the stage (seats.js). One merged mesh on a Lambert material, so the crowd keeps the island's light and fog and costs one
   draw call. One figure's geometry holds a body and everything anyone wears or carries; each figure's own numbers say which of those
   it wears, how its body is built, what colours it is in and how it moves. The mesh holds each figure's body and the parts it wears,
   and nothing it does not, each corner carrying its figure's numbers; the vertex shader shapes the body and moves it, from a few
   uniforms that `pose` sets each frame. It steps aside for the visitor from two attributes that `part` updates, at the corners of
   the figures that moved (seats.js's parting). Nothing is printed on anyone, and no figure is anyone's likeness.
   Why one mesh and not instances of one figure: a frame's cost goes with the triangles sent to be drawn. An instance draws the whole
   geometry, so every figure sent every part, 1,117 triangles to show 513 of them, the rest folded away by the shader; and the
   shoot's renderer pays some 4 microseconds for each instance of a mesh besides, so a mesh for each kind of part cost more than it
   saved (counted, crowd alone, in that renderer). The price is memory: each corner repeats its figure's numbers, 168 bytes a corner. */

/* One figure in its own units, standing on y = 0 and facing +z, TALL to the top of its head: two legs LEG tall on their feet HIP_X
   either side, hips, a torso that widens to its shoulders, a neck, a head, and two arms at its sides ending in hands, hanging from
   shoulders SHOULDER_X either side and SHOULDER_Y up and bending at the elbow, ELBOW down them. Each leg has a ring at the knee,
   halfway up it, where it bends. Its head's middle stands at HEAD_Y, and nods about NECK_Y. */
export const LEG = 0.86, SHOULDER_X = 0.285, SHOULDER_Y = 1.44, TALL = 1.8076;
const HEAD_Y = 1.655, NECK_Y = 1.56, HIP_X = 0.095, ELBOW = 0.27, HAND_Y = SHOULDER_Y - 0.565, STAND_Z = 0.22;

/* What a figure may wear or carry, each a part of the one geometry with a bit of its own. A figure's `parts` (aWear.x) is the sum of
   the bits it wears, and buildCrowd puts those parts in the mesh for it and no others. A plain figure, a phone's and a TV's
   (main.js), is built without the parts PLAIN_LEAVES_OUT names (figureGeometry's `add` passes them by), and with fewer sides to the
   round ones. */
export const PART = {
  BRIM: 1, CROWN: 2, BILL: 4, BAND: 8, KNOT: 16, WREATH: 32, HAIR: 64, TAIL: 128, TAIL2: 256, BEARD: 512, SKIRT: 1024, PONCHO: 2048,
  PACK: 4096, ROLL: 8192, POLE: 16384, FLAG: 32768, STAND: 65536, BALLOON: 131072, HOOP: 262144, DRUM: 524288, RIDER: 1048576,
  FINGER: 2097152,
};
export const PLAIN_LEAVES_OUT = ["WREATH", "TAIL2", "BEARD", "ROLL", "HOOP", "DRUM", "RIDER"];
/* How a part hangs on the figure (aMark.x): with its body, on a leg or a foot, on an arm, round the legs as a skirt does, on its head,
   or standing on the ground beside it. */
const RIG = { BODY: 0, LEG: 1, FOOT: 2, ARM_L: 3, ARM_R: 4, SKIRT: 5, HEAD: 6, GROUND: 7 };
/* Whose colour a face takes (aMark.z): its top's (the figure's own colour, at each corner), or one of the four tones the figure carries (aTone): its
   legs', its hair's, its own dark and its things'. A shin is bare under shorts, a forearm under short sleeves, a skirt is a long
   shirt's tail on some, and a scalp is bare on the bald. */
const TINT = { TOP: 0, LEGS: 1, HAIR: 2, SELF: 3, THING: 4, SHIN: 5, FOREARM: 6, SKIRT: 7, SCALP: 8, SHOE: 9 };
/* How a figure is cut (aWear.y, with its way of moving and what its arms do): flared trousers, shorts, short sleeves, a long shirt
   for a skirt, a big round head of hair, a bald head, a shawl for a poncho, hands on its hips. */
export const CUT = { BELLS: 1, SHORTS: 2, BARE: 4, TUNIC: 8, AFRO: 16, BALD: 32, SHAWL: 64, AKIMBO: 128 };
/* The ways of moving, and what a figure's arms do when they hold something: nothing, keep the right one down on a pole or a string,
   hold a finger up, hold a child's legs, drum, or lift a hoop. */
export const MOVES = ["bob", "sway", "wave", "spin", "nod", "clap", "watch"];
const MOVE = Object.fromEntries(MOVES.map((name, k) => [name, k]));
const ARMS = { none: 0, flag: 1, balloon: 1, finger: 2, rider: 3, drum: 4, hoop: 5, stand: 0 };
/* A figure's style (aWear.y) is one number: its way of moving in the ones, what its arms do in the STYLE.ARMS, and how it is cut
   from STYLE.CUT up. Each holds fewer kinds than the next one's place. */
const STYLE = { ARMS: 8, CUT: 64 };

/* A tube of rings from the top down, each { y, rx, rz, cx, cz } and `sides` round, facing out; `dy(turn)` lets a ring's edge rise and
   fall round it. */
function tube(rings, sides, { top = false, bottom = false, dy = null } = {}) {
  const at = (r, j, last) => {
    const a = (2 * Math.PI * j) / sides;
    return [(r.cx ?? 0) + r.rx * Math.sin(a), r.y + (last && dy ? dy(a) : 0), (r.cz ?? 0) + (r.rz ?? r.rx) * Math.cos(a)];
  };
  const out = [];
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < sides; j++) {
    const last = i + 2 === rings.length;
    const a = at(rings[i], j, false), b = at(rings[i], j + 1, false), c = at(rings[i + 1], j, last), d = at(rings[i + 1], j + 1, last);
    out.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const lid = (r, up) => { for (let j = 0; j < sides; j++) out.push((r.cx ?? 0), r.y, (r.cz ?? 0), ...at(r, up ? j : j + 1, false), ...at(r, up ? j + 1 : j, false)); };
  if (top) lid(rings[0], true);
  if (bottom) lid(rings[rings.length - 1], false);
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(out), 3));
}
/* A rope along `points`, `radii[i]` thick at each and `sides` round, closed at its far end. */
function rope(points, radii, sides) {
  const P = points.map((p) => new THREE.Vector3(...p)), out = [], push = (...vs) => { for (const v of vs) out.push(v.x, v.y, v.z); };
  const rings = P.map((p, i) => {
    const dir = new THREE.Vector3().subVectors(P[Math.min(i + 1, P.length - 1)], P[Math.max(i - 1, 0)]).normalize();
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const round = (j) => (2 * Math.PI * j) / sides;
    return Array.from({ length: sides + 1 }, (_, j) => p.clone().addScaledVector(u, radii[i] * Math.cos(round(j))).addScaledVector(v, radii[i] * Math.sin(round(j))));
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < sides; j++) push(rings[i][j], rings[i][j + 1], rings[i + 1][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
  for (let j = 0; j < sides; j++) push(P[P.length - 1], rings[rings.length - 1][j], rings[rings.length - 1][j + 1]);
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(out), 3));
}

/* Where the hair starts on a head and a tail on its back, the foot of a hat's crown, a tail's place to one side, and how far a big
   round head of hair stands out from the head. */
const HAIR_TOP = 1.775, TAIL_TOP = 1.6, CROWN_FOOT = 1.7076, TAIL_X = 0.09, AFRO = 0.75;
/* How far a head's vertex is hair, 0 at the face and 1 over the top and the back: where a big round head of hair grows from. */
const hairy = (x, y, z) => Math.min(1, Math.max(0, 0.5 + ((y - HEAD_Y) * 0.9 - z) / 0.12));

/* The figure's geometry: the body, then every part of PART, each vertex marked (aMark) with how it hangs (RIG), its part's bit (0 for
   the body), whose colour its face takes (TINT) and, where a part bends or flies, how far along it the vertex lies. `plain` builds a
   plain one. Nothing on a figure reads a texture, so its vertices carry no texture coordinates. */
export function figureGeometry(plain = false) {
  const parts = [], leftOut = new Set(plain ? PLAIN_LEAVES_OUT.map((name) => PART[name]) : []);
  /* Adds a piece: its corners alone, each marked. A face's colour is `tint`, or what `tint` makes of the middle of the face. A plain
     figure takes no piece of a part it leaves out. */
  const add = (geo, rig, bit, tint, weight = null) => {
    if (leftOut.has(bit)) return;
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of ["uv", "normal"]) g.deleteAttribute(name);
    const p = g.attributes.position, m = new Float32Array(4 * p.count), middle = (t, k) => (p.getComponent(t, k) + p.getComponent(t + 1, k) + p.getComponent(t + 2, k)) / 3;
    for (let t = 0; t < p.count; t += 3) {
      const tone = typeof tint === "function" ? tint(middle(t, 0), middle(t, 1), middle(t, 2)) : tint;
      for (let k = t; k < t + 3; k++) m.set([rig, bit, tone, weight ? weight(p.getX(k), p.getY(k), p.getZ(k)) : 0], 4 * k);
    }
    g.setAttribute("aMark", new THREE.BufferAttribute(m, 4));
    parts.push(g);
  };
  const round = (most, fewer) => (plain ? fewer : most);

  /* The head, an egg whose top stands at TALL: its face its own dark, the rest of it its hair's. */
  const head = new THREE.IcosahedronGeometry(0.135, 1).scale(1, 1.13, 1.05);
  head.computeBoundingBox();
  head.translate(0, TALL - head.boundingBox.max.y, 0);
  add(head, RIG.HEAD, 0, (x, y, z) => (z > 0.045 && y < HEAD_Y + 0.06 ? TINT.SELF : TINT.SCALP), hairy);
  for (const side of [-1, 1]) {
    const arm = side < 0 ? RIG.ARM_L : RIG.ARM_R;
    add(new THREE.CylinderGeometry(0.088, 0.062, LEG, 6, 2, true).translate(side * HIP_X, LEG / 2, 0), RIG.LEG, 0, (x, y) => (y > LEG / 2 ? TINT.LEGS : TINT.SHIN));
    add(new THREE.BoxGeometry(0.11, 0.07, 0.21).translate(side * HIP_X, 0.035, 0.05), RIG.FOOT, 0, TINT.SHOE);
    add(new THREE.CylinderGeometry(0.056, 0.042, 0.54, 6, 2, true).translate(side * SHOULDER_X, SHOULDER_Y - 0.27, 0), arm, 0, (x, y) => (y > SHOULDER_Y - ELBOW ? TINT.TOP : TINT.FOREARM));
    add(new THREE.IcosahedronGeometry(0.05, 0).translate(side * SHOULDER_X, HAND_Y, 0), arm, 0, TINT.SELF);
    /* The shoulder: a ball at the arm's pivot, part of the body, which the torso's top runs into and the arm's open top turns
       inside, so an arm that swings or lifts stays joined to its figure and shows no hollow from above. */
    add(new THREE.IcosahedronGeometry(0.064, 0).translate(side * SHOULDER_X, SHOULDER_Y, 0), RIG.BODY, 0, TINT.TOP);
  }
  /* The hips, closed above and below: the torso's foot is narrower than their top, and a seated figure shows their underside. The
     torso has a ring at its middle, so a belly can round it. */
  add(new THREE.CylinderGeometry(0.165, 0.17, 0.17, 8).scale(1, 1, 0.74).translate(0, 0.93, 0), RIG.BODY, 0, TINT.LEGS);
  add(new THREE.CylinderGeometry(0.25, 0.158, 0.46, 8, 2, true).scale(1, 1, 0.68).translate(0, 1.24, 0), RIG.BODY, 0, TINT.TOP);
  add(new THREE.CylinderGeometry(0.075, 0.25, 0.075, 8, 1, true).scale(1, 1, 0.68).translate(0, 1.5075, 0), RIG.BODY, 0, TINT.TOP);
  add(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 6, 1, true).translate(0, 1.57, 0), RIG.BODY, 0, TINT.SELF);

  /* On the head. A hat is a brim and a crown, which the figure's own numbers widen, droop and raise into a brimmed hat, a floppy one
     or a top hat (aCut.zw); a cap is the crown and a bill. A band goes round the brow, with a knot's tail behind for a bandana; a
     wreath sits on the crown of the head, lumpy as flowers are. */
  add(new THREE.CylinderGeometry(0.21, 0.21, 0.02, round(10, 8)).translate(0, HEAD_Y + 0.055, 0), RIG.HEAD, PART.BRIM, TINT.THING);
  add(new THREE.CylinderGeometry(0.118, 0.137, 0.1, round(8, 6)).translate(0, TALL - 0.05, 0), RIG.HEAD, PART.CROWN, TINT.THING);
  add(new THREE.BoxGeometry(0.2, 0.016, 0.15).translate(0, 1.712, 0.195), RIG.HEAD, PART.BILL, TINT.THING);
  add(new THREE.CylinderGeometry(0.143, 0.143, 0.04, round(8, 6), 1, true).scale(1, 1, 1.05).translate(0, HEAD_Y + 0.05, 0), RIG.HEAD, PART.BAND, TINT.THING);
  add(new THREE.ConeGeometry(0.04, 0.14, 3).rotateX(Math.PI).translate(0, 1.63, -0.165), RIG.HEAD, PART.KNOT, TINT.THING);
  const wreath = new THREE.TorusGeometry(0.118, 0.03, 3, 6).rotateX(Math.PI / 2), ring = wreath.attributes.position;
  for (let k = 0; k < ring.count; k++) {
    const lump = 1 + 0.16 * Math.cos(3 * Math.atan2(ring.getZ(k), ring.getX(k)));
    ring.setXYZ(k, ring.getX(k) * lump, ring.getY(k) * lump, ring.getZ(k) * lump);
  }
  add(wreath.translate(0, HEAD_Y + 0.085, 0), RIG.HEAD, PART.WREATH, TINT.THING);
  /* Hair down the back of the head to the shoulders, which the figure's own length (aCut.x) crops to a bob or lets down to its waist;
     two tails down its back, braids, or one of them alone, moved to the middle, a ponytail; and a beard. */
  add(tube([{ y: HAIR_TOP, rx: 0.118, rz: 0.075, cz: -0.055 }, { y: 1.62, rx: 0.158, rz: 0.095, cz: -0.075 }, { y: 1.42, rx: 0.14, rz: 0.08, cz: -0.13 }],
    round(8, 6), { top: true, bottom: true }), RIG.HEAD, PART.HAIR, TINT.HAIR);
  for (const [side, bit] of [[1, PART.TAIL], [-1, PART.TAIL2]]) {
    add(tube([{ y: TAIL_TOP, rx: 0.034, cx: side * TAIL_X, cz: -0.15 }, { y: 1.38, rx: 0.038, cx: side * TAIL_X, cz: -0.2 }, { y: 1.14, rx: 0.022, cx: side * TAIL_X, cz: -0.19 }],
      4, { top: true, bottom: true }), RIG.HEAD, bit, TINT.HAIR);
  }
  add(new THREE.ConeGeometry(0.07, 0.17, 5).rotateX(Math.PI).translate(0, HEAD_Y - 0.15, 0.07), RIG.HEAD, PART.BEARD, TINT.HAIR);

  /* A skirt, from the waist down round the legs to a hem that the figure's own number sets anywhere from the ankle to the thigh
     (aCut.y); its rings stand at the waist, the hips, the knees and the hem, and below the hips they follow the legs as they bend.
     A poncho, from the neck out over the shoulders to a hem that dips to a point before and behind; a shawl is the same cut short. */
  add(tube([{ y: 1.0, rx: 0.172, rz: 0.128 }, { y: LEG, rx: 0.2, rz: 0.16 }, { y: LEG / 2, rx: 0.262, rz: 0.22 }, { y: 0.08, rx: 0.32, rz: 0.27 }], round(10, 8)),
    RIG.SKIRT, PART.SKIRT, TINT.SKIRT);
  add(tube([{ y: 1.545, rx: 0.085, rz: 0.08 }, { y: 1.43, rx: 0.33, rz: 0.2 }, { y: 1.02, rx: 0.345, rz: 0.25 }], round(10, 8), { dy: (a) => -0.13 * Math.cos(2 * a) }),
    RIG.BODY, PART.PONCHO, TINT.THING, (x, y) => (y < 1.3 ? 1 : 0));
  /* On the back: a pack, and a bedroll across the top of it or alone. */
  add(new THREE.BoxGeometry(0.27, 0.36, 0.13).translate(0, 1.26, -0.205), RIG.BODY, PART.PACK, TINT.THING);
  add(new THREE.CylinderGeometry(0.062, 0.062, 0.36, 6).rotateZ(Math.PI / 2).translate(0, 1.5, -0.19), RIG.BODY, PART.ROLL, TINT.LEGS);

  /* In the hands and overhead. A pole in the right hand, and a flag on it over the head, which waves from the pole out (its weight
     along it); a balloon over the right shoulder on a string from that hand, which leans from the hand up. */
  add(new THREE.CylinderGeometry(0.015, 0.015, 1.38, round(4, 3)).translate(0.3, 1.55, 0.075), RIG.BODY, PART.POLE, TINT.SHOE);
  add(new THREE.BoxGeometry(0.5, 0.38, 0.014, round(3, 1), 1, 1).translate(0.05, 2.045, 0.075), RIG.BODY, PART.FLAG, TINT.THING, (x) => (0.3 - x) / 0.5);
  const lift = (x, y) => Math.min(1, Math.max(0, (y - 0.885) / 1.1));
  add(new THREE.SphereGeometry(0.12, round(7, 6), 4).scale(1, 1.18, 1).translate(0.2, 2.098, -0.03), RIG.BODY, PART.BALLOON, TINT.THING, lift);
  add(rope([[0.285, 0.885, 0.03], [0.2, 1.96, -0.03]], [0.008, 0.008], 3), RIG.BODY, PART.BALLOON, TINT.SHOE, lift);
  /* A taper's stand before the left foot, on the ground: a pole to over the head, a bar across its top and, but on a plain figure, a
     microphone at each end. */
  add(new THREE.CylinderGeometry(0.014, 0.014, 2.2, 4, 1, true).translate(-0.14, 1.1, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  add(new THREE.BoxGeometry(0.18, 0.022, 0.022).translate(-0.14, 2.19, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  if (!plain) for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.034, 0.085, 0.034).translate(-0.14 + side * 0.08, 2.195, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  add(new THREE.ConeGeometry(0.06, 0.1, 3).translate(-0.14, 0.05, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  /* The finger of the right hand, for the one who holds it up for a ticket. */
  add(new THREE.ConeGeometry(0.016, 0.1, 4).rotateX(Math.PI).translate(SHOULDER_X, 0.79, 0), RIG.ARM_R, PART.FINGER, TINT.SELF);
  /* A hoop in the hands at the hips, which a dancer lifts and swings; a hand drum at the left hip. */
  add(new THREE.TorusGeometry(0.305, 0.022, 3, 10).rotateX(Math.PI / 2).translate(0, 0.9, 0), RIG.BODY, PART.HOOP, TINT.THING);
  add(new THREE.CylinderGeometry(0.105, 0.065, 0.3, 6).rotateX(-0.45).translate(-0.12, 1.0, 0.15), RIG.BODY, PART.DRUM, TINT.THING);
  /* A child on the shoulders, behind the head: a body, a head, legs down over the chest and arms up. */
  add(tube([{ y: 1.84, rx: 0.1, rz: 0.075, cz: -0.1 }, { y: 1.56, rx: 0.085, rz: 0.07, cz: -0.1 }], 6, { top: true, bottom: true }), RIG.BODY, PART.RIDER, TINT.THING);
  add(new THREE.SphereGeometry(0.098, 6, 4).translate(0, 1.955, -0.09), RIG.BODY, PART.RIDER, (x, y, z) => (z > -0.06 && y < 1.99 ? TINT.SELF : TINT.HAIR));
  for (const side of [-1, 1]) {
    add(rope([[side * 0.06, 1.58, -0.06], [side * 0.115, 1.57, 0.11], [side * 0.115, 1.33, 0.16]], [0.04, 0.036, 0.03], 3), RIG.BODY, PART.RIDER, TINT.LEGS);
    add(rope([[side * 0.1, 1.8, -0.1], [side * 0.2, 2.03, -0.08]], [0.03, 0.024], 3), RIG.BODY, PART.RIDER, TINT.THING);
  }
  /* The corners and their marks are all a figure's geometry holds. The material shades each face flat, from the face itself, so it
     reads no normal to light one, and none is kept. */
  return mergeGeometries(parts);
}

/* The faces of a figure's geometry that are one part's (`bit`, 0 for the body), with their corners shared: a corner that several
   faces meet at with one mark is kept once, and worked out once a frame and not once for each face. `position` and `mark` are the
   corners, three and four numbers each, and `index` three corners to a face. */
export function pieces(figure, bit) {
  const position = figure.getAttribute("position"), mark = figure.getAttribute("aMark"), at = [], marks = [], index = [], seen = new Map();
  for (let k = 0; k < position.count; k++) {
    if (mark.getY(k - (k % 3)) !== bit) continue;
    const corner = [position.getX(k), position.getY(k), position.getZ(k), mark.getX(k), mark.getY(k), mark.getZ(k), mark.getW(k)], key = corner.join();
    if (!seen.has(key)) { seen.set(key, at.length / 3); at.push(corner[0], corner[1], corner[2]); marks.push(corner[3], corner[4], corner[5], corner[6]); }
    index.push(seen.get(key));
  }
  return { position: new Float32Array(at), mark: new Float32Array(marks), index };
}

/* A leg is two bones of the same length, the thigh and the shin, from the hip down to the knee and on to the foot. The knee stands
   wherever those lengths put it between the hip and the foot, always ahead of the line between them, so a leg bends and never
   stretches or shrinks. Standing, a figure's knees bend to the beat as its hips come down, a fifth of the legs' height at the most
   (the bob, which is counted in the height a leg has left once it has folded to FOLD of its own). A figure sits on the ground with its
   knees up: its hips SEAT above the ground and its feet FOOT ([forward, up]) from where it stood, lower or higher by as much as the
   ground falls or rises that far ahead of its seat (aFig.w), and tipped along that slope, so they rest on the hill. Seated, its arms
   hang, its hands at the ground beside it, and a skirt lies over its knees and on the ground. The sitters' section sits (aFig.x = 1);
   the rest of the crowd sits as `sit` rises, each figure in its turn, the last STAGGER behind the first. */
export const FOLD = 0.18, STAGGER = 0.5, SEAT = 0.075, FOOT = [0.36, 0.03];
/* The ground's fall or rise ahead of a seat that a seated figure's feet follow, in the figure's own units, at the most. */
export const DROP = [-0.12, 0.3];
/* The dance, on the figures' beat. Each figure moves one way (MOVES), as far as its own size lets it (aWear.w, 1 at the most), and
   keeps its own phase (aFig.y, 0-1). One that bobs brings its hips down on each beat by BOB of what a fold to FOLD takes, its knees
   within JITTER of a beat of the rest, sways SWAY rad to each side over two beats and swings each arm out ARM_SWING rad as it leans
   that way. One that sways leans from the feet over four beats, its hips out and its shoulders back over them; one waves both arms
   overhead, over four beats; one turns on the spot, there and back over eight beats, a skirt flaring as it turns; one nods with its
   arms folded; one claps on every other beat, before its chest; one stands and watches, its hands on its hips or at its sides. A stance,
   folded arms or hands on hips, is kept dancing or not, but let go, like the dance, as the parting stills a figure. Seated, every
   arm hangs but one that holds something (below).
   A hand that holds something keeps hold of it, standing, seated, as the build-up lifts the rest, and held still by the parting:
   the right hand at the foot of a flag's pole or a balloon's string; both hands at the legs of a child on the shoulders; a
   drummer's at the drum, each tapping on its own slow beat; and the finger held up stays up, which a figure tucks into its fist
   only as the parting brings that arm down. A hoop is in the hands only at rest: dancing, it goes round the hips and the arms
   stand clear of it.
   The dance is slow on purpose, for the flash count (CLAUDE.md, motion and flashes): a limb that passes over lit ground or the stage
   swings each block on its way twice as it goes and twice as it comes back. So no arm goes out and back more than once in two
   beats, a drummer's among them, and a clap is kept before the chest, where the figure's own body covers it; what keeps every
   beat is the bob's knees and the nod alone, and every figure's knees as the build-up lifts it (below), as they did before; and no
   arm is raised by one that sits, as the whole crowd does through Space, but the one held up with a finger, which does not move
   of itself. It is counted by render, with scripts/flash, and the PR's text holds the counts: a new way of moving is counted the
   same way before it merges.
   No way of moving carries a hand further from the figure's axis than the bob does as the build-up lifts its arms, so the reaches
   below bound them all (crowd.test.ts). */
const BOB = 0.12, ARM_SWING = 0.5, SWAY = 0.08, JITTER = 0.12;
/* The beats the phase is kept to: the longest move's cycle, the turn's, which every other divides. */
export const CYCLE = 8;
/* The rise before a peak: a figure stands, its arms go up to ARM_UP rad and its knees bend on every beat and twice as deep, as
   `rise` passes from RISE_FROM to RISE_FROM + RISE_W at the front rows and RISE_SPAN later at the back (aFig.z, 0 at the front and 1
   at the back), so the rise ripples outward from the stage and the whole crowd is up at the peak, but for the hands that hold
   something. */
const ARM_UP = 2.7, RISE_FROM = 0.3, RISE_SPAN = 0.6, RISE_W = 0.1;
/* How far a figure reaches in its own units, over every pose: its farthest vertex HAND from its axis (its arms level partway up the
   rise, swaying at the dance's widest), its highest TOP over its feet (its hands up at the rise's peak), and PAST beyond the bounds it
   stands in; and HANG with its arms hanging, as one standing fully still (aPart.w, seats.js) holds them. A seated figure's feet reach
   further than HANG ahead of it, FEET from its axis, but along the ground, under where a bear's reach is its snout. Whatever a figure
   wears or carries stays inside these: buildCrowd makes each as broad and as tall as they let the largest be, and no more. */
export const HAND = 1.11, TOP = 2.08, HANG = 0.354, FEET = 0.55;
const PAST = 0.4;
/* The visitor's bear reaches 1.98 m from its middle, halfway between its feet and its head (bears.js, avatar.js). */
const BEAR = 1.98;
/* The options buildCrowd hands parting() (seats.js) for figures at `scale`, up to the largest's size. A figure keeps 0.15 m past their
   bear's reach and its own from the visitor's middle where it has room, and never comes nearer than those two reaches, or nearer than
   the bear's reach and its hanging arms (HANG) while it stands still. It sees them coming 1.1 s ahead, steps aside at 5.5 m/s and walks
   back at 3; groups push apart within 1.4 m, past where two of the largest's hanging hands meet (0.35 units out, 1.32 m), and any
   within 2.85 m of one that has stepped aside stand still, fading over the last 0.5 m, out of reach of a dancer's hands (0.88 units
   out, 1.66 m). A figure standing fully still brings its arms down over a quarter second and raises them again once its stillness falls
   below a half, keeping to either for half a second at least; one at the fading edge rises with the rest. The walk's camera keeps 1.1 m
   out of them (avatar.js), past the near plane's corners in the widest view (1.04 m away on a phone held across, 19.5:9), rising over
   them ahead of reaching them. */
export function partingOptions(scale) {
  const big = scale * 1.08, hand = HAND * big, reach = BEAR + hand;
  return { keep: reach + 0.15, reach, hang: BEAR + HANG * big, lead: 1.1, step: 5.5, back: 3, space: 1.4, most: reach + 6, passes: 4,
    ring: 2.85, top: TOP * big, wide: hand, clear: 1.1, grade: 1.5 };
}

/* ---------- who stands where ---------- */

/* The colours, all deep: a figure's top (its corners' colour), its legs, its hair, its own dark, which its face and hands are, as
   the band's silhouettes are, and the things it wears and carries. No channel of any is brighter than MOST of full light, which is
   also all a tone can hold (tone). */
export const MOST = 0.08;
export const COLOURS = {
  top: [0x141936, 0x360e11, 0x112917, 0x2a132e, 0x401e0c, 0x3c3011, 0x0b2725, 0x0d172c, 0x321121, 0x252c11, 0x19191d, 0x261811, 0x1a2329, 0x1f0e23],
  legs: [0x161e2d, 0x10151e, 0x2d1e15, 0x232613, 0x101012, 0x222223, 0x2e1215, 0x3b301e],
  hair: [0x0b0a0a, 0x160e0a, 0x25160d, 0x32150b, 0x3b2e16, 0x2e2e30, 0x3b180a],
  self: [0x1d1b22, 0x22201d, 0x26201f, 0x2a2420, 0x1e1a18, 0x241c1a],
  thing: [0x38190d, 0x0f232c, 0x2c260e, 0x230f29, 0x0d2619, 0x350f14, 0x191b36, 0x2c1f15, 0x212121, 0x362c19],
};
const SHOE = 0.006;
/* A colour as one number a figure can carry: each channel's light as 0 to 127 on a square-root scale up to MOST, the red in the
   ones, the green in the 128s and the blue in the 16384s. */
const shade = new THREE.Color();
export function tone(hex) {
  shade.setHex(hex);
  const n = (c) => Math.min(127, Math.round(127 * Math.sqrt(c / MOST)));
  return n(shade.r) + 128 * n(shade.g) + 16384 * n(shade.b);
}

/* What a figure can be, each list a choice made on its own with these weights, so the people there can be are the product of the
   lists and not their sum. */
const CHOICES = {
  stature: [["child", 6], ["teen", 4], ["short", 22], ["mid", 43], ["tall", 25]],
  build: [["slight", 22], ["average", 32], ["stout", 16], ["broad", 14], ["pear", 16]],
  legs: [["jeans", 28], ["bells", 20], ["shorts", 14], ["maxi", 14], ["dress", 12], ["tunic", 12]],
  top: [["shirt", 38], ["tee", 30], ["poncho", 16], ["shawl", 16]],
  hair: [["bald", 7], ["crop", 18], ["bob", 8], ["long", 22], ["mane", 11], ["tail", 13], ["braids", 11], ["afro", 10]],
  head: [["none", 54], ["hat", 9], ["topper", 3], ["floppy", 8], ["cap", 9], ["bandana", 7], ["band", 5], ["wreath", 5]],
  back: [["none", 66], ["pack", 17], ["roll", 8], ["both", 9]],
  move: [["bob", 28], ["sway", 22], ["wave", 8], ["spin", 7], ["nod", 12], ["clap", 7], ["watch", 16]],
};
/* What a few carry, one figure in PROP_EVERY taking the next of these in turn, so there are a few of each across the hill; and those
   of them that stand over a head, which no one in the way of a test pose's view of the band carries (inView). */
export const PROPS = ["flag", "stand", "balloon", "finger", "hoop", "rider", "drum"], PROP_EVERY = 8;
const OVERHEAD = ["flag", "stand", "balloon", "rider"];
/* What makes a figure's outline, which no two figures of a crowd share (people). */
export const OUTLINE = ["stature", "build", "legs", "top", "hair", "beard", "head", "back", "prop"];
/* A person as a plain figure shows them: without what its geometry leaves out, a wreath a band, braids one tail, a bedroll a pack. */
export function plainly(p) {
  return { ...p, head: p.head === "wreath" ? "band" : p.head, hair: p.hair === "braids" ? "tail" : p.hair, beard: false,
    back: p.back === "none" ? "none" : "pack", prop: ["hoop", "rider", "drum"].includes(p.prop) ? "none" : p.prop };
}
export const outlineOf = (p) => OUTLINE.map((slot) => p[slot]).join(" ");

/* Whether a seat stands in a test pose's view of the band: within a strip from the pose to the stage, 2 m to either side of the pose
   and widening to the band's 7 m at the stage. */
export function inView(x, z) {
  return Object.values(TEST_POSES).some((pose) => {
    const dx = STAGE[0] - pose.x, dz = STAGE[1] - pose.z, far = Math.hypot(dx, dz);
    const along = ((x - pose.x) * dx + (z - pose.z) * dz) / far, across = Math.abs((x - pose.x) * dz - (z - pose.z) * dx) / far;
    return along > -8 && along < far && across < 2 + (5 * Math.max(0, along)) / far;
  });
}

/* A stream of numbers from 0 to 1 for a seed, the same every day. */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const choose = (r, list) => {
  let at = r() * list.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of list) if ((at -= w) < 0) return name;
  return list[list.length - 1][0];
};
/* A list of choices with only those named, and without them. */
export const only = (list, names) => list.filter(([name]) => names.includes(name));
export const without = (list, names) => list.filter(([name]) => !names.includes(name));

/* One person from a stream `r`, for a seat that sits or stands, and a stature and a prop already given it ("none" for most). What it
   holds decides some of the rest: a child rides on bare shoulders, a flag flies over no tall hat, the one with a hoop or beside a
   stand wears nothing it would catch on, and whoever turns on the spot mostly wears a skirt to flare. */
function person(r, sits, prop, stature) {
  const p = { prop, stature };
  const child = p.stature === "child", small = child || p.stature === "teen";
  p.build = child ? choose(r, only(CHOICES.build, ["slight", "average"])) : choose(r, CHOICES.build);
  p.move = prop === "stand" ? "watch" : prop === "rider" || prop === "hoop" ? "sway" : prop === "drum" ? "bob"
    : prop !== "none" ? choose(r, only(CHOICES.move, ["sway", "watch"]))
    : sits ? choose(r, only(CHOICES.move, ["bob", "sway", "nod", "watch"]))
    : child ? choose(r, only(CHOICES.move, ["bob", "wave", "spin", "clap"])) : choose(r, CHOICES.move);
  p.legs = p.move === "spin" && r() < 0.85 ? choose(r, only(CHOICES.legs, ["maxi", "dress"]))
    : prop === "stand" ? choose(r, without(CHOICES.legs, ["maxi"])) : choose(r, CHOICES.legs);
  p.top = prop === "hoop" || prop === "drum" || prop === "stand" ? choose(r, only(CHOICES.top, ["shirt", "tee"])) : choose(r, CHOICES.top);
  p.hair = prop === "rider" ? choose(r, only(CHOICES.hair, ["bald", "crop", "bob"])) : prop === "flag" ? choose(r, without(CHOICES.hair, ["afro"]))
    : child ? choose(r, without(CHOICES.hair, ["bald"])) : choose(r, CHOICES.hair);
  p.head = p.hair === "afro" ? "none" : prop === "rider" ? choose(r, only(CHOICES.head, ["none", "bandana", "band"]))
    : prop === "flag" ? choose(r, without(CHOICES.head, ["topper"])) : choose(r, CHOICES.head);
  p.beard = !small && r() < 0.16;
  p.back = prop === "rider" ? choose(r, only(CHOICES.back, ["none", "pack"])) : choose(r, CHOICES.back);
  /* Its numbers: how tall beside the standard figure, and how its body is built. */
  const span = (lo, hi) => lo + (hi - lo) * r();
  p.tall = { child: span(0.52, 0.66), teen: span(0.72, 0.82), short: span(0.84, 0.92), mid: span(0.93, 1.01), tall: span(1.02, 1.08) }[p.stature];
  p.girth = child ? span(0.9, 1.05) : { slight: span(0.82, 0.92), average: span(0.95, 1.08), stout: span(1.32, 1.6), broad: span(1.0, 1.12), pear: span(1.2, 1.4) }[p.build];
  p.wide = child ? span(0.88, 0.96) : { slight: span(0.8, 0.9), average: span(0.92, 1.0), stout: span(0.95, 1.04), broad: span(1.02, 1.04), pear: span(0.8, 0.88) }[p.build];
  p.slim = child ? 1.05 : p.build === "slight" ? span(0.88, 0.96) : 1;
  p.leg = child ? span(0.86, 0.92) : span(0.93, 1.07);
  p.big = child ? span(1.22, 1.32) : p.stature === "teen" ? span(1.08, 1.12) : span(0.95, 1.05);
  p.stoop = r() < 0.25 ? span(0.06, 0.13) : span(-0.02, 0.04);
  p.size = span(0.62, 1);
  p.akimbo = r() < 0.6;
  p.hairLength = { bob: span(0.72, 0.82), long: span(0.95, 1.25), mane: span(1.55, 2.05), tail: span(0.8, 1.4), braids: span(0.9, 1.4) }[p.hair] ?? 1;
  p.hem = { maxi: span(0.093, 0.18), dress: span(0.42, 0.56), tunic: span(0.62, 0.72) }[p.legs] ?? 0.093;
  [p.crown, p.brim] = { hat: [span(1, 1.25), span(0.95, 1.1)], topper: [span(2.3, 2.7), span(0.72, 0.8)], floppy: [span(1, 1.1), span(1.3, 1.45)] }[p.head] ?? [1, 1];
  p.colour = Object.fromEntries(Object.entries(COLOURS).map(([name, list]) => [name, Math.floor(r() * list.length)]));
  return p;
}
/* How alike two people look, for telling neighbours apart: more for sharing what shows from far off. */
const ALIKE = { legs: 1.5, hair: 1.5, head: 1, build: 1, stature: 0.8, top: 0.8, back: 0.6, move: 1.2 };
function alike(a, b) {
  let sum = 0;
  for (const slot in ALIKE) if (a[slot] === b[slot]) sum += ALIKE[slot] * (a[slot] === "none" ? 0.5 : 1);
  if (a.colour.top === b.colour.top) sum += 1.5;
  if (a.colour.legs === b.colour.legs) sum += 0.5;
  if (a.colour.hair === b.colour.hair) sum += 0.5;
  return sum;
}

/* Whether two people wear the same top in the same colour, and whether they move the same way with the same legs and hair. */
export const dressedAlike = (a, b) => a.top === b.top && a.colour.top === b.colour.top;
export const movingAlike = (a, b) => a.move === b.move && a.legs === b.legs && a.hair === b.hair;

/* The people for the seats `placed`, in their order, each { x, z, sit }: the same for the same seats every day. Each figure's place in
   the order seeds its own stream, so the first so many of a larger crowd are the same people as a smaller crowd's. Its stature comes
   first, so that children stay few. Of the TRIES people its stream then draws, a figure is the one least like those already standing
   within NEAR m of it, nearer ones counting for more; never one whose outline another figure has, on a desktop or a phone, so every
   figure of a crowd is a different person; and, drawing on until it finds one, never one that shares more than SHARE[1] of the
   OUTLINE with a figure within NEAR m, or more than SHARE[0] with one within CLOSE m, or that is dressed or moves like one that
   close. */
const TRIES = 20, NEAR = 8, CLOSE = 4;
export const SHARE = [4, 5];
export function people(placed) {
  const out = [], taken = new Set();
  const due = [];
  placed.forEach((seat, i) => {
    if (i % PROP_EVERY === PROP_EVERY - 1) due.push(PROPS[Math.floor(i / PROP_EVERY) % PROPS.length]);
    /* The next prop due goes to the first figure that can carry it: one that stands, and, for what stands over a head, out of the test
       poses' view of the band. */
    const k = due.findIndex((prop) => !(seat.sit && prop !== "stand" && prop !== "finger") && !(OVERHEAD.includes(prop) && inView(seat.x, seat.z)));
    const prop = k < 0 ? "none" : due.splice(k, 1)[0];
    const near = [];
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(placed[j].x - seat.x, placed[j].z - seat.z);
      if (d < NEAR) near.push([out[j], 1 / (1 + d), SHARE[d < CLOSE ? 0 : 1]]);
    }
    const r = stream(0x9e3779b1 * (i + 1));
    /* A child holds a balloon or nothing, and half the balloons are children's. */
    const drawn = choose(r, CHOICES.stature);
    const stature = prop === "balloon" ? (r() < 0.5 ? "child" : drawn) : prop !== "none" && drawn === "child" ? "short" : drawn;
    let best = null, least = Infinity, fewest = Infinity;
    for (let t = 0; t < TRIES || best === null || (fewest > 0 && t < 40 * TRIES); t++) {
      const p = person(r, seat.sit, prop, stature), outline = outlineOf(plainly(p));
      if (taken.has(outline)) continue;
      let score = 0, clashes = 0;
      for (const [other, weight, share] of near) {
        if (OUTLINE.filter((slot) => p[slot] === other[slot]).length > share) clashes += 100;
        if (share === SHARE[0] && (dressedAlike(p, other) || movingAlike(p, other))) clashes += 1;
        const a = alike(p, other);
        score += weight * a * a;
      }
      if (clashes < fewest || (clashes === fewest && score < least)) { fewest = clashes; least = score; best = p; }
    }
    taken.add(outlineOf(plainly(best)));
    out.push(best);
  });
  return out;
}

/* What a figure wears, as the numbers it carries: the sum of its parts' bits, and its style (STYLE). WEARS says which parts
   each choice of a person's wears, and CUTS how a choice cuts the figure (CUT); a beard and hands on the hips are a person's own. */
const WEARS = {
  head: { hat: ["BRIM", "CROWN"], topper: ["BRIM", "CROWN"], floppy: ["BRIM", "CROWN"], cap: ["CROWN", "BILL"], band: ["BAND"], bandana: ["BAND", "KNOT"], wreath: ["WREATH"] },
  hair: { bob: ["HAIR"], long: ["HAIR"], mane: ["HAIR"], tail: ["TAIL"], braids: ["TAIL", "TAIL2"] },
  legs: { maxi: ["SKIRT"], dress: ["SKIRT"], tunic: ["SKIRT"] },
  top: { poncho: ["PONCHO"], shawl: ["PONCHO"] },
  back: { pack: ["PACK"], roll: ["ROLL"], both: ["PACK", "ROLL"] },
  prop: { flag: ["POLE", "FLAG"], stand: ["STAND"], balloon: ["BALLOON"], finger: ["FINGER"], hoop: ["HOOP"], rider: ["RIDER"], drum: ["DRUM"] },
};
const CUTS = {
  hair: { afro: "AFRO", bald: "BALD" },
  legs: { bells: "BELLS", shorts: "SHORTS", dress: "SHORTS", tunic: "TUNIC" },
  top: { tee: "BARE", shawl: "SHAWL" },
};
export function wearing(p) {
  let parts = p.beard ? PART.BEARD : 0, cut = p.move === "watch" && p.akimbo && p.prop === "none" ? CUT.AKIMBO : 0;
  for (const slot in WEARS) for (const name of WEARS[slot][p[slot]] ?? []) parts += PART[name];
  for (const slot in CUTS) cut += CUT[CUTS[slot][p[slot]]] ?? 0;
  return { parts, style: MOVE[p.move] + STYLE.ARMS * ARMS[p.prop] + STYLE.CUT * cut };
}

/* How far a figure's rest reaches from its axis in its own units, standing still with its arms down, and how high over its feet at the
   most, its arms up: what buildCrowd fits inside HANG and TOP. Each part's number is its farthest vertex, as it is built and as the
   figure's own numbers widen it; a stoop carries what is on the head forward, and a lean back carries a pack back. It is a bound
   on the safe side, and not a tight one: a figure's breadth is its build's before it is the reach's (buildCrowd), so most figures
   stand some 10 cm inside HANG, and a number here that fell a little short would pass unseen on them. The unit tests stand every
   figure through every pose against the same bounds (crowd.test.ts), which catches a short number where the fit binds. */
function reaches(p, wear) {
  const has = (name) => (wear.parts & PART[name]) !== 0, forward = Math.max(p.stoop, 0) * 0.95, back = Math.max(-p.stoop, 0) * 0.6;
  let out = Math.max(SHOULDER_X * p.wide + 0.06, 0.166 * p.girth);
  const reach = (r) => { out = Math.max(out, r); };
  if (has("SKIRT")) reach(Math.max(0.32 * (0.62 + (0.38 * (1 - p.hem)) / 0.907), 0.2 * (1 + 0.65 * Math.max(p.girth - 1, 0))));
  if (has("PONCHO")) reach(0.348);
  if (has("BRIM")) reach(0.21 * p.brim * p.big + forward);
  if (has("BILL")) reach(0.29 * p.big + forward);
  if (has("HAIR") || has("TAIL")) reach(0.26 * p.big + back);
  if (p.hair === "afro") reach(0.26 * p.big + back);
  if (has("PACK") || has("ROLL")) reach(0.315 + back);
  if (has("POLE")) reach(0.335 + forward);
  if (has("STAND")) reach(0.35);
  if (has("BALLOON")) reach(0.335 + back);
  if (has("HOOP")) reach(0.33);
  if (has("DRUM")) reach(0.345 + forward);
  if (has("RIDER")) reach(0.27 + back);
  /* The top: its hands at the rise's peak, and what stands over its head, each as far up as the sway lifts its far side. */
  const lift = LEG * (p.leg - 1);
  let top = SHOULDER_Y + lift + 0.64 + (has("FINGER") ? 0.14 : 0);
  if (has("POLE")) top = Math.max(top, 2.295 + lift);
  if (has("BALLOON")) top = Math.max(top, 2.335 + lift);
  if (has("STAND")) top = Math.max(top, 2.25);
  if (has("RIDER")) top = Math.max(top, 2.12 + lift);
  /* Its feet, seated, their toes tipped down the steepest fall: a broad figure's stand further apart. */
  const feet = Math.hypot(HIP_X * (0.75 + 0.25 * p.girth) + 0.055, FOOT[0] + 0.171);
  return { out, top, feet };
}

const f = (v) => v.toFixed(4);
/* The tables' whole numbers as the shader writes them, so that the shader's text holds none of its own: a number; whether a value
   is that whole number; and whether a sum of bits holds a bit. */
const n = (v) => v.toFixed(1);
const is = (value, whole) => `${value} > ${n(whole - 0.5)} && ${value} < ${n(whole + 0.5)}`;
const has = (sum, bit) => (bit === 1 ? `mod(${sum}, 2.0) > 0.5` : `mod(floor(${sum} / ${n(bit)}), 2.0) > 0.5`);
const B = Object.fromEntries(Object.entries(PART).map(([name, bit]) => [name, n(bit)]));
/* After common: the crowd's attributes and uniforms. */
const DECLARE = `
attribute vec4 aMark;
attribute vec4 aFig;
attribute vec4 aPart;
attribute float aRise;
attribute vec4 aBody;
attribute vec4 aWear;
attribute vec4 aCut;
attribute vec4 aTone;
attribute vec3 aPlace;
attribute vec4 aSize;
uniform float uBeat;
uniform float uDance;
uniform float uRise;
uniform float uSit;`;
/* In the figure's own units, after begin_vertex. It is written with plain numbers alone, one to a name, so that the unit tests can
   read it as it stands and stand every figure through every pose (crowd.test.ts).
   First the figure's own shape: what its head wears (aCut), its
   belly, its shoulders (aBody), its legs' length and thickness, a skirt's hem. Then the pose, as far as the figure dances where it
   stands (aPart.w: still 1, at its seat 0): its arms, each turned at the shoulder and bent at the elbow, the ring at the elbow cut on
   the mitre; its head's nod; the rise and the sit. The hips come down to the beat and, sitting, to SEAT, and the rest of the figure
   with them. Each leg runs from its hip to its foot through the knee: the thigh from the leg's upper half and the shin from its
   lower, each keeping its thickness across the way it lies, the ring at the knee cut on the mitre between them; the foot lies flat
   standing and, seated, tips along the ground's fall to it; a skirt's rings follow the legs, and never pass under the ground. Every
   figure rises with the build-up as far as aRise lets it: all the way, but with its arms brought down while it stands fully still
   (seats.js). Last its stoop, its lean, which leaves its feet flat on the ground, and its turn. */
const DANCE = `
float rig = aMark.x, bit = aMark.y, parts = aWear.x;
{
  float x = transformed.x, y = transformed.y, z = transformed.z;
  float kind = mod(aWear.y, ${n(STYLE.ARMS)}), arms = mod(floor(aWear.y / ${n(STYLE.ARMS)}), ${n(STYLE.CUT / STYLE.ARMS)}), cuts = floor(aWear.y / ${n(STYLE.CUT)});
  bool bells = ${has("cuts", CUT.BELLS)}, afro = ${has("cuts", CUT.AFRO)}, shawl = ${has("cuts", CUT.SHAWL)}, akimbo = ${has("cuts", CUT.AKIMBO)};
  bool legRig = ${is("rig", RIG.LEG)}, footRig = ${is("rig", RIG.FOOT)}, armRig = (${is("rig", RIG.ARM_L)}) || (${is("rig", RIG.ARM_R)}), skirtRig = ${is("rig", RIG.SKIRT)};
  bool headRig = ${is("rig", RIG.HEAD)}, groundRig = ${is("rig", RIG.GROUND)}, core = ${is("rig", RIG.BODY)} && bit < 0.5;
  bool bobber = ${is("kind", MOVE.bob)}, swayer = ${is("kind", MOVE.sway)}, waver = ${is("kind", MOVE.wave)}, spinner = ${is("kind", MOVE.spin)};
  bool nodder = ${is("kind", MOVE.nod)}, clapper = ${is("kind", MOVE.clap)};
  float girth = aBody.x, legL = ${f(LEG)} * aBody.z, up = legL - ${f(LEG)};

  float moves = 1.0 - aPart.w, dance = uDance * moves * aWear.w, going = min(2.5 * dance, 1.0);
  float rise = clamp((uRise - ${f(RISE_FROM)} - ${f(RISE_SPAN)} * aFig.z) / ${f(RISE_W)}, 0.0, 1.0) * aRise;
  float sit = max(aFig.x, clamp(uSit * ${f(1 + STAGGER)} - aFig.y * ${f(STAGGER)}, 0.0, 1.0)) * (1.0 - rise);
  float bounce = 0.5 + 0.5 * cos(6.2832 * (uBeat + ${f(JITTER)} * aFig.y));
  /* The figure's slow beat: every other beat, its own of the two, 1 on it and 0 on the beat between. */
  float slow = 0.5 + 0.5 * cos(3.1416 * (uBeat + ${f(JITTER)} * aFig.y + floor(2.0 * fract(5.3 * aFig.y))));
  /* The figure's place in its slow waves: once round in four beats (quarter) and in eight (eight). */
  float quarter = 1.5708 * (uBeat + 4.0 * aFig.y), eight = 0.7854 * (uBeat + 8.0 * aFig.y);
  float two = sin(3.1416 * (uBeat + aFig.y)), four = sin(quarter);
  float spin = spinner ? 1.0 : 0.0;

  if (headRig) {
    if (bit == ${B.HAIR}) y = ${f(HAIR_TOP)} - (${f(HAIR_TOP)} - y) * aCut.x;
    if (bit == ${B.TAIL} || bit == ${B.TAIL2}) {
      y = ${f(TAIL_TOP)} - (${f(TAIL_TOP)} - y) * min(aCut.x, 1.5);
      if (mod(floor(parts / ${B.TAIL2}), 2.0) < 0.5) { x = (x - ${f(TAIL_X)}) * 1.6; y += 0.07; }
    }
    if (bit == ${B.CROWN}) y = ${f(CROWN_FOOT)} + (y - ${f(CROWN_FOOT)}) * aCut.z;
    if (bit == ${B.BRIM}) {
      float rim = x * x + z * z > 0.01 ? 1.0 : 0.0;
      x *= aCut.w; z *= aCut.w; y -= rim * 0.22 * max(aCut.w - 1.2, 0.0);
    }
    if (afro && aMark.w > 0.0) {
      float puff = 1.0 + ${f(AFRO)} * aMark.w;
      x *= puff; z *= puff; y = ${f(HEAD_Y)} + (y - ${f(HEAD_Y)}) * puff;
    }
    x *= aBody.w; z *= aBody.w; y = ${f(NECK_Y)} + (y - ${f(NECK_Y)}) * aBody.w;
  }
  if (core || bit == ${B.SKIRT} || bit == ${B.PONCHO}) {
    float belly = (girth - 1.0) * clamp(1.0 - abs(y - 1.02) / 0.4, 0.0, 1.0);
    if (bit != ${B.PONCHO}) x *= 1.0 + belly;
    z *= 1.0 + belly * (z < 0.0 ? 0.35 : bit == ${B.PONCHO} ? 0.5 : 1.5);
  }
  if (core) x *= 1.0 + (aBody.y - 1.0) * smoothstep(1.2, ${f(SHOULDER_Y)}, y);
  if (bit == ${B.PONCHO} && shawl) y = 1.43 - (1.43 - y) * (1.0 - 0.58 * aMark.w);
  if (legRig || footRig) {
    float side = x > 0.0 ? 1.0 : -1.0, thick = 1.0 + 0.5 * (girth - 1.0);
    float flare = legRig && bells ? 1.0 + 0.9 * clamp(1.0 - y / ${f(LEG / 2)}, 0.0, 1.0) : 1.0;
    x = side * ${f(HIP_X)} * (0.5 + 0.5 * thick) + (x - side * ${f(HIP_X)}) * (legRig ? thick * flare : 1.0);
    if (legRig) { z *= thick * flare; y *= aBody.z; }
  }
  if (skirtRig) {
    float hem = aCut.y, swirl = 0.5 * spin * dance * abs(cos(eight)) * (1.0 - sit);
    if (y < 0.2) {
      float full = (0.62 + 0.38 * (1.0 - hem) / 0.907) * (1.0 + swirl);
      x *= full; z *= full; y = hem * ${f(LEG)};
    } else if (y < 0.6) {
      float mid = hem < 0.5 ? 0.5 : 0.5 * (1.0 + hem);
      float full = (0.62 + 0.38 * clamp((1.0 - mid) / 0.5, 0.0, 1.0)) * (1.0 + 0.5 * swirl);
      x *= full; z *= full; y = mid * ${f(LEG)};
    }
    y = y > ${f(LEG - 0.001)} ? y + up : y * aBody.z;
  }
  if (!legRig && !footRig && !skirtRig && !groundRig) y += up;
  if (bit == ${B.FLAG}) z += 0.06 * dance * aMark.w * sin(quarter - 2.6 * aMark.w);
  if (bit == ${B.FINGER}) y = ${f(HAND_Y)} + (y - ${f(HAND_Y)}) * mix(0.37, 1.0, moves);
  if (bit == ${B.BALLOON}) { x += 0.06 * dance * aMark.w * four; z += 0.04 * dance * aMark.w * cos(eight); }
  if (bit == ${B.HOOP}) y += (1.0 - sit) * (0.13 * going + 0.28 * min(dance, 1.2) * (x * cos(quarter) + z * sin(quarter)));

  if (armRig) {
    float side = ${is("rig", RIG.ARM_L)} ? -1.0 : 1.0, stand = moves * (1.0 - sit), aloft = going * (1.0 - sit);
    float lift = 0.0, fore = 0.0, bend = 0.0, inward = 0.0, held = 0.0;
    if (bobber) lift = dance * ${f(ARM_SWING)} * (0.5 + 0.5 * side * two) * (1.0 - sit);
    else if (swayer) lift = max(0.05 * stand + side * dance * 0.1 * (1.0 - sit) * sin(quarter - 0.9), -0.04);
    else if (waver) { lift = aloft * (2.65 + side * 0.3 * min(dance, 1.3) * four); bend = aloft * 0.25; inward = 1.0; }
    else if (spinner) lift = dance * (0.12 + 0.45 * abs(cos(eight))) * (1.0 - sit);
    else if (nodder) { lift = 0.12 * stand; fore = 0.25 * stand; bend = 1.75 * stand; inward = 0.75; }
    else if (clapper) { fore = 0.6 * aloft; bend = 1.75 * aloft; inward = 0.35 + 0.37 * slow; }
    else if (akimbo) { lift = 0.62 * stand; bend = 1.5 * stand; inward = 1.0; }
    if (${is("arms", ARMS.flag)} && side > 0.0) { lift = 0.0; fore = 0.0; bend = 0.0; held = 1.0; }
    else if (${is("arms", ARMS.finger)} && side > 0.0) { lift = 2.95 * moves; fore = 0.0; bend = 0.0; held = 1.0; }
    else if (${is("arms", ARMS.rider)}) { lift = 0.0; fore = 0.3; bend = 2.1; inward = 0.6; held = 1.0; }
    else if (${is("arms", ARMS.drum)}) { lift = 0.1 * moves; fore = 0.15; bend = 1.2 + 0.3 * dance * (side > 0.0 ? slow : 1.0 - slow); inward = 0.8; held = 1.0; }
    else if (${is("arms", ARMS.hoop)}) lift = 0.6 * aloft;
    float lifted = rise * (1.0 - held);
    lift = mix(lift, ${f(ARM_UP)}, lifted); fore *= 1.0 - lifted; bend *= 1.0 - lifted;
    float sx = side * ${f(SHOULDER_X)} * aBody.y, sy = ${f(SHOULDER_Y)} + up;
    float px = x + side * ${f(SHOULDER_X)} * (aBody.y - 1.0) - sx, py = y - sy, pz = z;
    float below = -py - ${f(ELBOW)};
    if (below > -0.001 && bend > 0.0) {
      float ix = -side * sin(1.5708 * inward), iz = cos(1.5708 * inward);
      float along = px * ix + pz * iz, cb = cos(bend), sb = sin(bend);
      float along2 = below > 0.001 ? below * sb + along * cb : along;
      float below2 = below > 0.001 ? below * cb - along * sb : -along * min(tan(0.5 * bend), 1.2);
      px += (along2 - along) * ix; pz += (along2 - along) * iz; py = -${f(ELBOW)} - below2;
    }
    float cf = cos(fore), sf = sin(fore), qz = pz * cf - py * sf, qy = pz * sf + py * cf;
    float cl = cos(side * lift), sl = sin(side * lift);
    x = sx + cl * px - sl * qy; y = sy + sl * px + cl * qy; z = qz;
  }
  if (headRig && nodder) {
    float nod = 0.24 * dance * bounce * (1.0 - rise), cn = cos(nod), sn = sin(nod), hy = y - ${f(NECK_Y)} - up;
    y = ${f(NECK_Y)} + up - z * sn + hy * cn; z = z * cn + hy * sn;
  }

  /* The knees: one that bobs bends them on every beat, one that sways, waves or claps on its slow beat and less, and the rest not at
     all; as the build-up lifts them, all on every beat. */
  float bobs = bobber ? 1.0 : swayer ? 0.35 : 0.0;
  float dip = mix(bobber ? bounce : slow, bounce, rise);
  float bob = (1.0 - sit) * dance * (1.0 + rise) * ${f(BOB)} * dip * mix(bobs, 1.0, rise);
  /* A seat stands as much higher as the thighs are thicker, so that a broad figure's rest on the ground as a slight one's do. */
  float lower = legL * ${f(1 - FOLD)} * bob + (legL - ${f(SEAT)} - 0.044 * max(girth - 1.0, 0.0)) * sit;
  bool onLeg = legRig || footRig || (skirtRig && y < legL + 0.001);
  /* How far the ground falls (or, below nought, rises) from the seat to the seated feet ahead of it. */
  float fall = clamp(aFig.w, ${f(DROP[0])}, ${f(DROP[1])});
  if (onLeg) {
    /* The hip, the foot and the knee between them, as forward (Z) and up (Y). */
    float hipY = legL - lower;
    float footZ = sit * ${f(FOOT[0])}, footY = sit * (${f(FOOT[1])} - fall);
    float span = max(sqrt(footZ * footZ + (footY - hipY) * (footY - hipY)), 1e-4);
    float alongZ = footZ / span, alongY = (footY - hipY) / span, halfway = 0.5 * min(span, legL - 1e-3);
    float bow = sqrt(max(0.25 * legL * legL - halfway * halfway, 0.0));
    float kneeZ = alongZ * halfway - alongY * bow, kneeY = hipY + alongY * halfway + alongZ * bow;
    footZ = alongZ * min(span, legL); footY = hipY + alongY * min(span, legL);
    if (footRig) {
      /* A foot lies along the ground it rests on: tipped, seated, as the ground falls from the seat to it. */
      float tip = -sit * atan(fall, ${f(FOOT[0])}), ct = cos(tip), st = sin(tip), fz = ct * z - st * y, fy = st * z + ct * y;
      z = footZ + fz; y = footY + fy;
    } else {
      float t = clamp(y / legL, 0.0, 1.0);
      float thighL = max(sqrt(kneeZ * kneeZ + (kneeY - hipY) * (kneeY - hipY)), 1e-5);
      float shinL = max(sqrt((footZ - kneeZ) * (footZ - kneeZ) + (footY - kneeY) * (footY - kneeY)), 1e-5);
      float thighZ = -(kneeY - hipY) / thighL, thighY = kneeZ / thighL, shinZ = -(footY - kneeY) / shinL, shinY = (footZ - kneeZ) / shinL;
      float mitre = max(thighZ * (thighZ + shinZ) + thighY * (thighY + shinY), 0.4);
      float overZ = t > 0.51 ? thighZ : t < 0.49 ? shinZ : (thighZ + shinZ) / mitre, overY = t > 0.51 ? thighY : t < 0.49 ? shinY : (thighY + shinY) / mitre;
      float atZ = t > 0.5 ? mix(kneeZ, 0.0, 2.0 * t - 1.0) : mix(footZ, kneeZ, 2.0 * t), atY = t > 0.5 ? mix(kneeY, hipY, 2.0 * t - 1.0) : mix(footY, kneeY, 2.0 * t);
      float deep = skirtRig ? z * (1.0 - 0.45 * sit) : z;
      z = atZ + deep * overZ; y = atY + deep * overY;
    }
  } else if (!groundRig) y -= lower;

  if (!groundRig) {
    float lean = bobber ? two : swayer ? four * (1.0 + 0.6 * (1.0 - rise) * (1.0 - sit)) : waver ? 0.6 * four : spinner ? 0.0 : nodder ? 0.25 * four : clapper ? 0.3 * four : 0.2 * four;
    /* A foot stays flat where it stands as the figure leans over it: a foot that tipped with the lean lifted an edge off the ground
       and sank the other in it, which on a phone's small frame flickered against the lit ground. */
    float tilt = footRig ? 0.0 : dance * ${f(SWAY)} * lean;
    if (!onLeg) {
      /* Above the hips: the stoop, and, for one that sways, the lean back over its feet, most of twice as far as its legs lean out. */
      float over = max(y - legL + lower, 0.0), back = swayer ? -1.8 * tilt * (1.0 - rise) * (1.0 - sit) : 0.0;
      float ck = cos(back), sk = sin(back);
      z += aWear.z * over;
      y += sk * x + (ck - 1.0) * over; x = ck * x - sk * over;
    }
    float cs = cos(tilt), ss = sin(tilt), tx = cs * x - ss * y, ty = ss * x + cs * y;
    float turn = spin * 1.6 * min(dance, 1.3) * sin(eight) * (1.0 - sit), cr = cos(turn), sr = sin(turn);
    x = cr * tx + sr * z; y = ty; z = cr * z - sr * tx;
  }
  /* The ground under the figure falls or rises ahead of its seat as far as its seated feet follow it. A skirt's hem never passes
     under it; nor does anything else of a figure as far as it sits, where a lap, a hem, a hoop or a hanging hand would; and a
     taper's stand goes down to it where it falls away. */
  if (skirtRig) y = max(y, 0.012 - fall * z / ${f(FOOT[0])});
  else if (groundRig) y -= max(fall, 0.0) * ${f(STAND_Z)} / ${f(FOOT[0])};
  else y = max(y, -fall * z / ${f(FOOT[0])} - 0.4 * (1.0 - sit));
  transformed.x = x; transformed.y = y; transformed.z = z;
}`;
/* After color_vertex, where the colour is the corner's own, its figure's top's: a face that is not its top's takes one of the
   figure's four tones (aTone, each as tone() packs it), or a shoe's near black. */
const TONE = `
float tint = aMark.z;
if (!(${is("tint", TINT.TOP)})) {
  float cutting = floor(aWear.y / ${n(STYLE.CUT)});
  bool shorts = ${has("cutting", CUT.SHORTS)}, bare = ${has("cutting", CUT.BARE)}, tunic = ${has("cutting", CUT.TUNIC)}, bald = ${has("cutting", CUT.BALD)};
  float tone = ${is("tint", TINT.LEGS)} ? aTone.x : ${is("tint", TINT.HAIR)} ? aTone.y : ${is("tint", TINT.SELF)} ? aTone.z : ${is("tint", TINT.THING)} ? aTone.w
    : ${is("tint", TINT.SHIN)} ? (shorts ? aTone.z : aTone.x) : ${is("tint", TINT.FOREARM)} ? (bare ? aTone.z : -1.0) : ${is("tint", TINT.SKIRT)} ? (tunic ? -1.0 : aTone.x)
    : ${is("tint", TINT.SCALP)} ? (bald ? aTone.z : aTone.y) : -2.0;
  if (tone > -0.5) {
    float red = mod(tone, 128.0) / 127.0, green = mod(floor(tone / 128.0), 128.0) / 127.0, blue = floor(tone / 16384.0) / 127.0;
    vColor.r = ${f(MOST)} * red * red; vColor.g = ${f(MOST)} * green * green; vColor.b = ${f(MOST)} * blue * blue;
  } else if (tone < -1.5) {
    vColor.r = ${f(SHOE)}; vColor.g = ${f(SHOE)}; vColor.b = ${f(SHOE)};
  }
}`;
/* project_vertex for the crowd: the figure's place on the hill, as broad and as tall as it is (aSize.xy), turned (its turn's cosine
   and sine, aSize.zw) and stood at its seat (aPlace), and stepped where the parting has stepped it (aPart.xyz), in metres. Its
   first two lines are plain numbers too, and the unit tests run them against the figure's own matrix. */
const PROJECT = `
float wide = transformed.x * aSize.x, deep = transformed.z * aSize.x;
float putX = aPlace.x + aSize.z * wide + aSize.w * deep + aPart.x, putY = aPlace.y + aSize.y * transformed.y + aPart.y, putZ = aPlace.z - aSize.w * wide + aSize.z * deep + aPart.z;
vec4 mvPosition = modelViewMatrix * vec4(putX, putY, putZ, 1.0);
gl_Position = projectionMatrix * mvPosition;`;

/* Builds the crowd: at most `count` figures on the first seats, kept clear of the path, the bears' line and a circle round each
   landmark's bounds. It reads those bounds, so it runs before the landmarks merge (landmarks.js) empties them. Each figure faces the
   stage, turned a little, and is its own person (people): the standard figure stands PERSON tall, a child a little over half that and
   the tallest 8 % more, each as broad as its build and what it wears let it be inside the reaches above. `plain` builds plain figures,
   as a phone and a TV draw. `count` is how many it seated; `each` holds every figure's own numbers, a figure to a row, `figure` the
   geometry of one whole figure, and `corners` and `faces` where each figure's corners and faces begin in the mesh. */
export function buildCrowd(scene, { count, path, line, landmarks, plain = false }) {
  /* A point every 2 m along `length` metres of the path or the line. */
  const along = (length, at) => Array.from({ length: Math.ceil(length / 2) }, (_, i) => { const p = at(i * 2); return [p.x, p.z]; });
  const box = new THREE.Box3(), mid = new THREE.Vector3();
  const around = {
    path: along(path.curveLength, (d) => path.at(d / path.curveLength)),
    line: along(line.length, (d) => line.at(d)),
    landmarks: landmarks.map((l) => {
      box.setFromObject(l).getCenter(mid);
      return [mid.x, mid.z, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2];
    }),
  };
  const placed = seats(around).slice(0, count);
  const n = placed.length;
  const figure = figureGeometry(plain);
  const scale = PERSON / TALL, big = scale * 1.08;
  const uniforms = { uBeat: { value: 0 }, uDance: { value: 0 }, uRise: { value: 0 }, uSit: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${DECLARE}`)
      .replace("#include <color_vertex>", `#include <color_vertex>${TONE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${DANCE}`)
      .replace("#include <project_vertex>", PROJECT);
  };
  /* The parting (partingOptions), each figure keeping clear of what the seats keep clear of, and its hands of the stage's solids
     (STAGE_COLUMN). */
  const opts = partingOptions(scale);
  const parts = parting(placed, { ...opts, keeps: [...keepOuts(around), [STAGE[0], STAGE[1], STAGE_COLUMN.r + opts.wide]] });
  /* Each figure's own numbers, a figure to a row: where it stands (as a matrix), its top's colour, and what the shader reads of it;
     and the parting's own two rows, where it has stepped each figure and how far it lets its arms rise. */
  const each = { count: n, matrix: new Float32Array(16 * n), colour: new Float32Array(3 * n), aFig: new Float32Array(4 * n), aBody: new Float32Array(4 * n),
    aWear: new Float32Array(4 * n), aCut: new Float32Array(4 * n), aTone: new Float32Array(4 * n), aPlace: new Float32Array(3 * n), aSize: new Float32Array(4 * n),
    offset: parts.offset, rising: parts.rising, ball: new Float32Array(4 * n) };
  const near = Math.min(...placed.map((p) => p.r)), far = Math.max(...placed.map((p) => p.r));
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const who = people(placed);
  /* The seats come in a random order across the hill, so a figure's place in it picks its turn and its phase, and who it is. */
  placed.forEach((p, i) => {
    const one = plain ? plainly(who[i]) : who[i], worn = wearing(one), { out, top, feet } = reaches(one, worn);
    dummy.position.set(p.x, height(p.x, p.z), p.z);
    dummy.rotation.set(0, Math.atan2(STAGE[0] - p.x, STAGE[1] - p.z) + (i % 7 - 3) * 0.08, 0);
    /* As tall as it is, its head's top that share of PERSON over its feet whatever its legs' length, and no taller than TOP lets what
       it holds up stand; and as broad as its build, and no broader than HANG lets what it wears reach, or FEET its seated feet, which
       also keeps it no broader than the largest figure the reaches are for. */
    const tall = Math.min((scale * one.tall * TALL) / (TALL + LEG * (one.leg - 1)), (TOP * big - 0.005) / top);
    const broad = Math.min(one.slim, (HANG * big - 0.003) / (tall * out), (FEET * big - 0.003) / (tall * feet));
    dummy.scale.set(tall * broad, tall, tall * broad);
    dummy.updateMatrix();
    dummy.matrix.toArray(each.matrix, 16 * i);
    color.setHex(COLOURS.top[one.colour.top]).toArray(each.colour, 3 * i);
    /* How far the ground falls from the seat to where a seated figure's feet rest, ahead of it the way it faces, in its own units. */
    const reach = FOOT[0] * tall * broad, turn = dummy.rotation.y;
    const drop = (height(p.x, p.z) - height(p.x + Math.sin(turn) * reach, p.z + Math.cos(turn) * reach)) / tall;
    each.aFig.set([p.sit ? 1 : 0, (i * 0.618034) % 1, far > near ? (p.r - near) / (far - near) : 0, drop], 4 * i);
    each.aBody.set([one.girth, one.wide, one.leg, one.big], 4 * i);
    each.aWear.set([worn.parts, worn.style, one.stoop, one.size], 4 * i);
    each.aCut.set([one.hairLength, one.hem, one.crown, one.brim], 4 * i);
    each.aTone.set([tone(COLOURS.legs[one.colour.legs]), tone(COLOURS.hair[one.colour.hair]), tone(COLOURS.self[one.colour.self]), tone(COLOURS.thing[one.colour.thing])], 4 * i);
    /* The same place as the shader takes it: where it stands, and its breadth, its height and its turn's cosine and sine. */
    each.aPlace.set([dummy.position.x, dummy.position.y, dummy.position.z], 3 * i);
    each.aSize.set([tall * broad, tall, Math.cos(turn), Math.sin(turn)], 4 * i);
  });

  /* The mesh: every figure's body and the parts it wears, and nothing it does not, one figure after another in the seats' order.
     Each corner carries its figure's numbers beside its own place and mark. */
  const kit = new Map([0, ...Object.values(PART)].map((bit) => [bit, pieces(figure, bit)]).filter(([, piece]) => piece.index.length > 0));
  /* What a figure wears goes before its body, so a renderer that tests depth before it shades a pixel passes by what of the body
     its clothes cover. */
  const wornBy = (i) => [...[...kit.keys()].filter((bit) => bit !== 0 && Math.floor(each.aWear[4 * i] / bit) % 2 === 1), 0];
  const corners = new Uint32Array(n + 1), faces = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    corners[i + 1] = corners[i]; faces[i + 1] = faces[i];
    for (const bit of wornBy(i)) { corners[i + 1] += kit.get(bit).position.length / 3; faces[i + 1] += kit.get(bit).index.length; }
  }
  const all = corners[n], rows = { position: 3, aMark: 4, color: 3, aPlace: 3, aSize: 4, aFig: 4, aBody: 4, aWear: 4, aCut: 4, aTone: 4, aPart: 4, aRise: 1 };
  const held = Object.fromEntries(Object.entries(rows).map(([name, size]) => [name, new Float32Array(size * all)]));
  const index = all > 65535 ? new Uint32Array(faces[n]) : new Uint16Array(faces[n]);
  for (let i = 0; i < n; i++) {
    let v = corners[i], f = faces[i];
    for (const bit of wornBy(i)) {
      const piece = kit.get(bit);
      held.position.set(piece.position, 3 * v);
      held.aMark.set(piece.mark, 4 * v);
      for (let k = 0; k < piece.index.length; k++) index[f + k] = v + piece.index[k];
      v += piece.position.length / 3; f += piece.index.length;
    }
    for (let k = corners[i]; k < corners[i + 1]; k++) {
      held.color.set(each.colour.subarray(3 * i, 3 * i + 3), 3 * k);
      held.aPlace.set(each.aPlace.subarray(3 * i, 3 * i + 3), 3 * k);
      for (const name of ["aSize", "aFig", "aBody", "aWear", "aCut", "aTone"]) held[name].set(each[name].subarray(4 * i, 4 * i + 4), 4 * k);
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const [name, size] of Object.entries(rows)) geo.setAttribute(name, new THREE.BufferAttribute(held[name], size));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const aPart = geo.getAttribute("aPart").setUsage(THREE.DynamicDrawUsage), aRise = geo.getAttribute("aRise").setUsage(THREE.DynamicDrawUsage);
  /* What the parting has moved goes to the corners of the figures it moved, and to no others. */
  const last = new Float32Array(5 * n).fill(NaN);
  const follow = (whole) => {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const o = parts.offset, x = o[4 * i], y = o[4 * i + 1], z = o[4 * i + 2], w = o[4 * i + 3], r = parts.rising[i];
      if (last[5 * i] === x && last[5 * i + 1] === y && last[5 * i + 2] === z && last[5 * i + 3] === w && last[5 * i + 4] === r) continue;
      last[5 * i] = x; last[5 * i + 1] = y; last[5 * i + 2] = z; last[5 * i + 3] = w; last[5 * i + 4] = r;
      for (let k = corners[i]; k < corners[i + 1]; k++) { held.aPart[4 * k] = x; held.aPart[4 * k + 1] = y; held.aPart[4 * k + 2] = z; held.aPart[4 * k + 3] = w; held.aRise[k] = r; }
      if (!whole) { aPart.addUpdateRange(4 * corners[i], 4 * (corners[i + 1] - corners[i])); aRise.addUpdateRange(corners[i], corners[i + 1] - corners[i]); }
      moved = true;
    }
    if (!moved) return;
    /* Ranges wait for the next frame that draws the crowd; past a crowd's worth of them the whole of each goes up instead. */
    if (aPart.updateRanges.length > n) { aPart.clearUpdateRanges(); aRise.clearUpdateRanges(); }
    aPart.needsUpdate = true;
    aRise.needsUpdate = true;
  };
  follow(true);
  const mesh = new THREE.Mesh(geo, mat);
  /* Each figure's own sphere (its middle and its radius, `each.ball`): the whole figure's, whatever it wears, where it stands, with
     its arms past their standing bounds. And the mesh's, round them all, which grows as `part` moves the farthest of them from its
     seat. */
  figure.computeBoundingSphere();
  const balls = each.ball, ball = new THREE.Sphere(), place = new THREE.Matrix4(), round = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    ball.copy(figure.boundingSphere).applyMatrix4(place.fromArray(each.matrix, 16 * i));
    balls.set([ball.center.x, ball.center.y, ball.center.z, ball.radius + PAST * big], 4 * i);
    round.expandByPoint(ball.center);
  }
  geo.boundingSphere = new THREE.Sphere();
  round.getCenter(geo.boundingSphere.center);
  let rest = 0;
  for (let i = 0; i < n; i++) rest = Math.max(rest, geo.boundingSphere.center.distanceTo(ball.center.set(balls[4 * i], balls[4 * i + 1], balls[4 * i + 2])) + balls[4 * i + 3]);
  geo.boundingSphere.radius = rest;
  scene.add(mesh);

  /* Poses the crowd for a frame: `beats` is the figures' phase (beat.js); `dance` how far they dance, 0 for standing still; `rise` how
     far the build-up before a peak has lifted them (audio.js mappings); and `sit` how far the crowd sits, 0-1. The phase is kept to
     CYCLE beats, which every move's cycle divides, for the shader's precision. */
  function pose(beats, dance, rise, sit) {
    uniforms.uBeat.value = beats % CYCLE;
    uniforms.uDance.value = dance;
    uniforms.uRise.value = rise;
    uniforms.uSit.value = sit;
  }

  /* Moves the figures round the visitor for a frame `dt` s long, the visitor's bear standing with its feet and head at `feet` and `head`
     (avatar.js), at once under reduced motion; the two attributes go up only in a frame where a figure moved or eased its arms, and
     only at that figure's corners. */
  function part(dt, feet, head, reduced) {
    if (!parts.step(dt, feet, head, reduced)) return;
    follow(false);
    geo.boundingSphere.radius = rest + parts.farthest[0];
  }

  /* Draws the first `some` figures, which the seats' order makes the front of the crowd; `shown` is how many are drawn. */
  let shown = n;
  function show(some) {
    shown = Math.max(0, Math.min(n, some));
    geo.setDrawRange(0, faces[shown]);
  }

  /* Leaves the crowd out of a frame that shows none of it. three culls a mesh by one sphere round all of it, which a camera that
     looks past the crowd, or over it, is often inside or facing; here each figure drawn has its own sphere, moved as the parting
     has moved it, and the mesh is sent to be drawn only when `camera` sees one of them. */
  const frustum = new THREE.Frustum(), view = new THREE.Matrix4();
  function cull(camera) {
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
    let seen = false;
    for (let i = 0; i < shown && !seen; i++) {
      ball.center.set(balls[4 * i] + parts.offset[4 * i], balls[4 * i + 1] + parts.offset[4 * i + 1], balls[4 * i + 2] + parts.offset[4 * i + 2]);
      ball.radius = balls[4 * i + 3];
      seen = frustum.intersectsSphere(ball);
    }
    mesh.visible = seen;
    return seen;
  }

  return { mesh, each, figure, corners, faces, count: n, get shown() { return shown; }, pose, part, show, cull, over: parts.over, ahead: parts.ahead, hold: parts.hold,
    get parted() { return parts.parted; } };
}
