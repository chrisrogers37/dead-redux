/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MOVE as STEP, SLOW, STRUM } from "./band.js";
import { height, SHELF_Y, STAGE, STAGE_COLUMN, TEST_POSES } from "./ground.js";
import { eraOn } from "./lineup.js";
import { gathering, keepOuts, parting, PERSON, seats, wholeGroups } from "./seats.js";

/* The crowd on the hill: a few hundred people, no two of them alike, lit and in colour, in the clothes of the show's era, and
   faceless, on the slope in front of the stage (seats.js). One merged mesh on a Lambert material, so the crowd keeps the island's light and fog and costs one
   draw call. One figure's geometry holds a body and everything anyone wears or carries; each figure's own numbers say which of those
   it wears, how its body is built, what colours it is in and how it moves. The mesh holds each figure's body and the parts it wears,
   and nothing it does not, each corner carrying its figure's numbers; the vertex shader shapes the body and moves it, from a few
   uniforms that `pose` sets each frame. It steps aside for the visitor from two attributes that `part` updates, at the corners of
   the figures that moved (seats.js's parting). Nothing is printed on anyone, and no figure is anyone's likeness.
   Why one mesh and not instances of one figure: a frame's cost goes with the triangles sent to be drawn. An instance draws the whole
   geometry, so every figure sent every part, 1,117 triangles to show 513 of them, the rest folded away by the shader; and the
   shoot's renderer pays some 4 microseconds for each instance of a mesh besides, so a mesh for each kind of part cost more than it
   saved (counted, crowd alone, in that renderer). The price is memory: each corner repeats its figure's numbers, 172 bytes a corner. */

/* One figure in its own units, standing on y = 0 and facing +z, TALL to the top of its head: two legs LEG tall on their shoes HIP_X
   either side, a torso with hips, a waist, a chest and shoulders that slope up to a neck, a head, and two arms at its sides ending in
   hands, hanging from shoulders SHOULDER_X either side and SHOULDER_Y up and bending at the elbow, ELBOW down them. Each leg has a
   ring at the knee, halfway up it, where it bends. Its head's middle stands at HEAD_Y, and nods about NECK_Y. */
export const LEG = 0.86, SHOULDER_X = 0.285, SHOULDER_Y = 1.44, TALL = 1.8076, HIP_X = 0.095;
const HEAD_Y = 1.655, NECK_Y = 1.56, ELBOW = 0.27, HAND_Y = SHOULDER_Y - 0.565, STAND_X = -0.14, STAND_Z = 0.22, SKIRT_X = 0.262;
/* The body's shape, ring by ring, each ring out to the sides (rx), ahead (rz) and behind (rb). The torso from the neck down (TORSO,
   each ring at its height y): the neck up inside the head, its foot (NECK_FOOT, where the skin ends), the slope of the shoulders, the
   shoulders, the chest, the ribs, the waist (WAIST, where a top meets what is worn on the legs), the hips over the seat and the seat.
   A leg from inside the hips (HIP_TOP, over its pivot at LEG, so that the hips riding up on a leg as a figure sways or shifts its
   weight lift no seat off it) down (LEG_RINGS, [y, rx, rz, rb]): the thigh, a ring halfway down it where shorts end (SHORTS_HEM),
   the knee, halfway, the calf (CALF), behind, and the ankle. An arm from the shoulder down (ARM_RINGS, [down, rx, rz, rb]): the upper
   arm, a ring two thirds of the way down it where a short or rolled sleeve ends (SLEEVE_HEM), the elbow, its point behind, and the
   forearm tapering to the wrist, inside the hand. Each hem's ring stands far enough from its joint that, as the shader bends the joint
   and mitres the ring there, no corner of that ring passes the hem's, in any stance (crowd.test.ts): 4 cm over the knee, the mitre
   folded a seated figure's knee over the hem by up to 12 cm. The cloth ends at the hem: the faces under it are the shin's and the
   forearm's (TINT), bare on those who show them. OPEN is how far those two hems stand open on those who wear them (CUT.SHORTS, CUT.BARE),
   times the limb there, as the shader opens them, and how much narrower than a trouser's hem a bare ankle is. A shoe from its heel to
   its toe (SHOE_SECTIONS, [z, wide, high]): the heel, the instep, high at the ankle, and the toe, low. A phone and a television,
   which see the crowd from further off, draw it with fewer: no ring at the neck's foot or the ribs, no shorts' hem, calf or sleeve's
   hem, and a shoe from heel to toe in one (PLAIN_SHOE): a phone's frame has the least to spare for its crowd. And the skull (JAW):
   how much narrower at the jaw, how far its lower half is drawn up, and how much fuller behind and tucked in at the nape. */
const NECK_FOOT = 1.53, WAIST = 1.04, HIP_TOP = 0.9, SHORTS_HEM = 0.62, CALF = 0.2, SLEEVE_HEM = 0.18, FRINGE = 0.07;
export const TORSO = [{ y: 1.62, rx: 0.052, rz: 0.05 }, { y: 1.535, rx: 0.064, rz: 0.058, rb: 0.064 }, { y: 1.5, rx: 0.165, rz: 0.09, rb: 0.11 },
  { y: 1.445, rx: 0.25, rz: 0.135, rb: 0.1666 }, { y: 1.32, rx: 0.218, rz: 0.162, rb: 0.1496 }, { y: 1.17, rx: 0.172, rz: 0.135, rb: 0.1292 },
  { y: WAIST, rx: 0.148, rz: 0.112, rb: 0.1115 }, { y: 0.92, rx: 0.18, rz: 0.12, rb: 0.13 }, { y: 0.845, rx: 0.17, rz: 0.126, rb: 0.126 }];
export const LEG_RINGS = [[HIP_TOP, 0.09, 0.088, 0.09], [SHORTS_HEM, 0.082, 0.081, 0.078], [LEG / 2, 0.075, 0.075, 0.066], [CALF, 0.063, 0.068, 0.078], [0, 0.06, 0.062, 0.06]];
export const ARM_RINGS = [[0, 0.056, 0.056, 0.056], [SLEEVE_HEM, 0.048, 0.05, 0.048], [ELBOW, 0.043, 0.043, 0.048], [0.54, 0.025, 0.031, 0.029]];
export const OPEN = { sleeve: 1.2, shorts: 1.18, ankle: 0.72 };
/* How much flatter a seated figure's coat's tail lies over its thighs before and under them behind than it hangs standing (a
   skirt's, 0.45 both ways): flat enough to lie on them, and no flatter than leaves them inside it, with room: flattened 0.4
   behind, it went into a kneeling figure's (crowd.test.ts). */
export const COAT_SAT = [0.1, 0.2];
/* A hood, down, as a rope through five points, each [x, y, z], at its own thickness: from inside one shoulder, over it, round the
   back of the neck, where it lies on it, and over the other shoulder to inside it (crowd.test.ts). */
export const HOOD_ROPE = { points: [[-0.135, 1.47, -0.02], [-0.105, 1.53, -0.1], [0, 1.565, -0.12], [0.105, 1.53, -0.1], [0.135, 1.47, -0.02]], radii: [0.035, 0.05, 0.06, 0.05, 0.035] };
const SHOE_SECTIONS = [[-0.055, 0.075, 0.06], [0.035, 0.108, 0.085], [0.155, 0.08, 0.035]], PLAIN_SHOE = [[-0.055, 0.1, 0.07], [0.155, 0.095, 0.04]];
const JAW = { narrow: 0.25, chin: 0.8, back: 0.06, nape: 0.2 };
/* A seated figure's hand that holds a pole or a string slides HOLD_UP up it, straight up: the forearm, FOREARM from the elbow to
   the hand's middle, bent up at the elbow (HOLD[1], rad) and the upper arm turned back from the shoulder (HOLD[0]) as far as keeps
   the hand where it was below the shoulder, ahead and across, so that the pole stays as near the figure's axis as standing. */
export const FOREARM = SHOULDER_Y - ELBOW - HAND_Y, HOLD_UP = 0.13;
const holdBend = Math.PI - Math.acos((ELBOW ** 2 + FOREARM ** 2 - (SHOULDER_Y - HAND_Y - HOLD_UP) ** 2) / (2 * ELBOW * FOREARM));
export const HOLD = [-Math.atan2(FOREARM * Math.sin(holdBend), ELBOW + FOREARM * Math.cos(holdBend)), holdBend];

/* What a figure may wear or carry, each a part of the one geometry with a bit of its own. A figure's `parts` (aWear.x) is the sum of
   the bits it wears, and buildCrowd puts those parts in the mesh for it and no others. A plain figure, a phone's and a TV's
   (main.js), is built without the parts PLAIN_LEAVES_OUT names (figureGeometry's `add` passes them by), and with fewer sides to the
   round ones. */
export const PART = {
  BRIM: 1, CROWN: 2, BILL: 4, BAND: 8, KNOT: 16, WREATH: 32, HAIR: 64, TAIL: 128, TAIL2: 256, BEARD: 512, SKIRT: 1024, PONCHO: 2048,
  PACK: 4096, ROLL: 8192, POLE: 16384, FLAG: 32768, STAND: 65536, BALLOON: 131072, HOOP: 262144, DRUM: 524288, RIDER: 1048576,
  FINGER: 2097152, CUP: 4194304, HOOD: 8388608,
};
export const PLAIN_LEAVES_OUT = ["WREATH", "TAIL2", "BEARD", "ROLL", "HOOP", "DRUM"];
/* Some parts come in several shapes, its forms, each its own piece of the one geometry: a figure that wears the part wears one of
   them, and buildCrowd puts that one in the mesh for it and no other, so a form costs triangles only for the figures that wear it.
   The first of each list is the part as it was. A crown is a hat's, a tall knit cap's, a jester's three points or a hat's with a
   plume; a wreath is a lumpy ring or flowers that stand up from it; the hair down the back of the head is a tube, dreadlocks or a high
   bun; a pole stands straight up beside the head or leans in over it; on it flies a flag, cut square, with a swallowtail, as a
   pennant or as streamers, or stands a star, a moon, a parasol or a puppet's head; a balloon is one or three; and the hand held up
   holds up a finger, a hat or a tambourine; a skirt is a coat's tail on some, open down the front, and a poncho may be fringed. A
   vertex carries its form in aMark.z, over the tint (TINTS). */
export const FORMS = {
  SKIRT: ["skirt", "coat"], PONCHO: ["poncho", "fringed"], CROWN: ["crown", "knit", "jester", "plume"], WREATH: ["wreath", "flowers"], HAIR: ["hair", "dreads", "bun"], POLE: ["straight", "lean"],
  FLAG: ["oblong", "swallowtail", "pennant", "streamer", "star", "moon", "parasol", "puppet"], BALLOON: ["one", "bunch"], FINGER: ["finger", "aloft", "tambourine"],
};
const FORM = Object.fromEntries(Object.entries(FORMS).map(([name, list]) => [name, Object.fromEntries(list.map((form, k) => [form, k]))]));
/* aMark.z is a tint (TINT) and TINTS times a form. */
export const TINTS = 16;
/* How a part hangs on the figure (aMark.x): with its body, on a leg or a foot, on an arm, round the legs as a skirt does, on its head,
   or standing on the ground beside it. */
export const RIG = { BODY: 0, LEG: 1, FOOT: 2, ARM_L: 3, ARM_R: 4, SKIRT: 5, HEAD: 6, GROUND: 7 };
/* Whose colour a face takes (aMark.z, in its ones of TINTS): its top's (the figure's own colour, at each corner), or one of the four tones the figure carries (aTone): its
   legs', its hair's, its skin's and its things'. A shin is bare under shorts, a forearm under short sleeves, a skirt is a long
   shirt's tail on some, and a scalp is bare on the bald. What is held up over the heads is cloth or a balloon in one of three of
   the figure's own cloth colours (CLOTH), not a tone. */
export const TINT = { TOP: 0, LEGS: 1, HAIR: 2, SELF: 3, THING: 4, SHIN: 5, FOREARM: 6, SKIRT: 7, SCALP: 8, SHOE: 9, CLOTH: 10, CLOTH2: 11, CLOTH3: 12 };
/* How a figure is cut (aWear.y, with its way of moving and what its arms do): flared trousers, shorts, short sleeves, a long shirt
   for a skirt, a big round head of hair, a bald head, a shawl for a poncho. */
export const CUT = { BELLS: 1, SHORTS: 2, BARE: 4, TUNIC: 8, AFRO: 16, BALD: 32, SHAWL: 64 };
/* The ways of moving, and what a figure's arms do when they hold something: nothing, keep the right one down on a pole or a string,
   hold a finger up, hold a child's legs, drum, or lift a hoop. */
export const MOVES = ["bob", "sway", "wave", "spin", "nod", "clap", "watch", "shift"];
const MOVE = Object.fromEntries(MOVES.map((name, k) => [name, k]));
const ARMS = { none: 0, flag: 1, swallowtail: 1, pennant: 1, streamer: 1, star: 1, moon: 1, parasol: 1, puppet: 1, balloon: 1, bunch: 1, finger: 2, aloft: 2,
  tambourine: 2, rider: 3, drum: 4, hoop: 5, stand: 0 };
/* How a figure stands (STANDS) and how it sits (SITS), its stance, which no neighbour shares (stances). Standing: square on both feet;
   its weight on its left leg or its right, the hip out over that foot and the other knee bent; a hand on its hip, both on its hips,
   its arms folded, a cup in its right hand, its hands behind its back, an arm round a friend's shoulders, an arm round a friend's
   waist and its head toward them, or its hands in its pockets, each of those on one leg or both. Seated: its knees up and apart, its
   forearms on them; cross-legged, its hands in its lap; its arms round its knees; its body leaning back on its hands; kneeling,
   sitting on its heels; or, on a blanket, lying back on its elbows. */
export const STANDS = ["square", "left", "right", "hip", "akimbo", "folded", "cup", "behind", "round", "roundLeft", "waist", "waistLeft", "pockets"];
export const SITS = ["knees", "cross", "hug", "back", "kneel", "recline"];
const STAND = Object.fromEntries(STANDS.map((name, k) => [name, k])), SITTING = Object.fromEntries(SITS.map((name, k) => [name, k]));
/* A figure's style (aWear.y) is one number: its way of moving in the ones, what its arms do in the STYLE.ARMS, how it is cut from
   STYLE.CUT up, and its stance from STYLE.STANCE, how it stands in the ones of that and how it sits in the STYLE.SITS. Each holds
   fewer kinds than the next one's place, and the whole of it is a whole number a float holds exactly. */
const STYLE = { ARMS: 8, CUT: 64, STANCE: 16384, SITS: 16 };

/* A tube of rings from the top down, each { y, rx, rz, rb, cx, cz } and `sides` round, facing out: `rx` out to either side, `rz` ahead
   and `rb` behind (`rz` where it has none), so a body's front and back can differ; `dy(turn)` lets a ring's edge rise and fall round it,
   and `open` leaves that many sides out either side of straight ahead, a coat's open front. */
function tube(rings, sides, { top = false, bottom = false, dy = null, open = 0 } = {}) {
  const at = (r, j, last) => {
    const a = (2 * Math.PI * j) / sides, deep = Math.cos(a) < 0 ? r.rb ?? r.rz ?? r.rx : r.rz ?? r.rx;
    return [(r.cx ?? 0) + r.rx * Math.sin(a), r.y + (last && dy ? dy(a) : 0), (r.cz ?? 0) + deep * Math.cos(a)];
  };
  const out = [];
  for (let i = 0; i + 1 < rings.length; i++) for (let j = open; j < sides - open; j++) {
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

/* A flat piece cut to the outline `points` ([x, y] each, in turn round it), `thick` through about the depth `z`. */
function slab(points, z, thick) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, z - thick / 2);
}

/* A shoe at `x`, from its heel to its toe through `sections` ([z, wide, high] each, from the back forward): each a pentagon standing
   on the flat sole, its top a ridge along the middle, or, `square`, a box's end; closed at the heel and the toe. */
function shoe(x, sections, square = false) {
  const ring = ([z, w, h]) => (square ? [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]] : [[-w / 2, 0], [w / 2, 0], [w / 2, 0.6 * h], [0, h], [-w / 2, 0.6 * h]])
    .map(([u, v]) => [x + u, v, z]);
  const rings = sections.map(ring), m = rings[0].length, out = [];
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < m; j++) {
    const a = rings[i][j], b = rings[i][(j + 1) % m], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % m];
    out.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const heel = rings[0], toe = rings[rings.length - 1];
  for (let j = 1; j + 1 < m; j++) out.push(...toe[0], ...toe[j], ...toe[j + 1], ...heel[0], ...heel[j + 1], ...heel[j]);
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(out), 3));
}

/* Where the hair starts on a head and a tail on its back, the foot of a hat's crown, a tail's place to one side, and how far a big
   round head of hair stands out from the head. */
const HAIR_TOP = 1.775, TAIL_TOP = 1.6, CROWN_FOOT = 1.7076, TAIL_X = 0.09, AFRO = 0.75;
/* How small a hat or a tambourine held up is in the fist, as it is built and as the parting brings the arm down: the shader grows it
   to its size as the arm goes up. */
const TUCK = 0.25;
/* How far a head's vertex is hair, 0 at the face and 1 over the top and the back: where a big round head of hair grows from. */
const hairy = (x, y, z) => Math.min(1, Math.max(0, 0.5 + ((y - HEAD_Y) * 0.9 - z) / 0.12));

/* The figure's geometry: the body, then every form of every part of PART, each vertex marked (aMark) with how it hangs (RIG), its
   part's bit (0 for the body), whose colour its face takes (TINT) and which form of its part it is (FORMS), and, where a part bends or
   flies, how far along it the vertex lies. `plain` builds a plain one. Nothing on a figure reads a texture, so its vertices carry no
   texture coordinates. */
export function figureGeometry(plain = false) {
  const parts = [], leftOut = new Set(plain ? PLAIN_LEAVES_OUT.map((name) => PART[name]) : []);
  /* Adds a piece, of its part's form `form`: its corners alone, each marked. A face's colour is `tint`, or what `tint` makes of the
     middle of the face. A plain figure takes no piece of a part it leaves out. */
  const add = (geo, rig, bit, tint, weight = null, form = 0) => {
    if (leftOut.has(bit)) return;
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of ["uv", "normal"]) g.deleteAttribute(name);
    const p = g.attributes.position, m = new Float32Array(4 * p.count), middle = (t, k) => (p.getComponent(t, k) + p.getComponent(t + 1, k) + p.getComponent(t + 2, k)) / 3;
    for (let t = 0; t < p.count; t += 3) {
      const tone = (typeof tint === "function" ? tint(middle(t, 0), middle(t, 1), middle(t, 2)) : tint) + TINTS * form;
      for (let k = t; k < t + 3; k++) m.set([rig, bit, tone, weight ? weight(p.getX(k), p.getY(k), p.getZ(k)) : 0], 4 * k);
    }
    g.setAttribute("aMark", new THREE.BufferAttribute(m, 4));
    parts.push(g);
  };
  const round = (most, fewer) => (plain ? fewer : most);

  /* The head, an egg whose top stands at TALL, shaped as a skull: narrower to the jaw, its chin raised clear of the neck, fuller behind
     over the nape and tucked in at it, so that from the side the neck shows under it. Its face is its skin, smooth, with nothing on it,
     and the rest of it its hair's. */
  const head = new THREE.IcosahedronGeometry(0.135, 1).scale(1, 1.13, 1.05), skull = head.attributes.position;
  for (let k = 0; k < skull.count; k++) {
    const x = skull.getX(k), y = skull.getY(k), z = skull.getZ(k), u = y / (0.135 * 1.13), low = Math.max(-u, 0), jaw = low * low * (3 - 2 * low);
    const back = z < 0 ? 1 + JAW.back * Math.max(0, 1 - ((u - 0.1) / 0.7) ** 2) - JAW.nape * jaw : 1;
    skull.setXYZ(k, x * (1 - JAW.narrow * jaw), u < 0 ? y * JAW.chin : y, z * back);
  }
  head.computeBoundingBox();
  head.translate(0, TALL - head.boundingBox.max.y, 0);
  add(head, RIG.HEAD, 0, (x, y, z) => (z > 0.045 && y < HEAD_Y + 0.06 ? TINT.SELF : TINT.SCALP), hairy);
  for (const side of [-1, 1]) {
    const arm = side < 0 ? RIG.ARM_L : RIG.ARM_R;
    /* A leg, from the hip down: the thigh, which tapers to the knee, the calf behind the shin, and the ankle, where a trouser's hem
       is; with a ring halfway down the thigh where shorts end, which the shader opens for them (OPEN). Its knee is the ring
       halfway up it, where the shader bends it. Its top is closed: seated, the thigh's top turns to face back under the seat. Six
       sides on every tier, one straight behind: seated, a figure rests on the backs of its thighs, and with five a television's seats
       stood 1.5 cm higher. */
    add(tube(LEG_RINGS.filter(([y]) => !plain || (y !== CALF && y !== SHORTS_HEM)).map(([y, rx, rz, rb]) => ({ y, rx, rz, rb, cx: side * HIP_X })), 6, { top: true }), RIG.LEG, 0, (x, y) => (y > (plain ? LEG / 2 : SHORTS_HEM) - 0.005 ? TINT.LEGS : TINT.SHIN));
    add(shoe(side * HIP_X, plain ? PLAIN_SHOE : SHOE_SECTIONS, plain), RIG.FOOT, 0, TINT.SHOE);
    /* An arm, from the shoulder down: the upper arm, a ring over the elbow where a short or rolled sleeve ends, which the
       shader opens for them (OPEN), the elbow, and the forearm down to the wrist; and the hand, a mitten turned in to the thigh, its
       thumb ahead of it, or on a phone and a television eight faces and no thumb. */
    add(tube(ARM_RINGS.filter(([down]) => !plain || down !== SLEEVE_HEM).map(([down, rx, rz, rb]) => ({ y: SHOULDER_Y - down, rx, rz, rb, cx: side * SHOULDER_X })), round(6, 5)), arm, 0,
      (x, y) => (y > SHOULDER_Y - (plain ? ELBOW : SLEEVE_HEM) - 0.005 ? TINT.TOP : TINT.FOREARM));
    add(new (plain ? THREE.OctahedronGeometry : THREE.IcosahedronGeometry)(0.05, 0).scale(0.6, 1, 0.95).translate(side * SHOULDER_X, HAND_Y, 0), arm, 0, TINT.SELF);
    if (!plain) add(rope([[side * (SHOULDER_X - 0.008), HAND_Y + 0.018, 0.028], [side * (SHOULDER_X - 0.014), HAND_Y - 0.022, 0.05]], [0.014, 0.009], 3), arm, 0, TINT.SELF);
    /* The shoulder: a ball at the arm's pivot, part of the body, which the torso's top runs into and the arm's open top turns
       inside, so an arm that swings or lifts stays joined to its figure and shows no hollow from above. */
    add(new THREE.IcosahedronGeometry(0.064, 0).translate(side * SHOULDER_X, SHOULDER_Y, 0), RIG.BODY, 0, TINT.TOP);
  }
  /* The torso, one piece from the seat to the neck, closed under the seat, which a seated figure shows: the hips, the waist, the
     chest, the shoulders sloping up to the neck, and the neck, its skin, up into the head. Its back stands as far behind the spine
     as backOf says, and its waist is where a top meets what is worn on the legs. */
  add(tube(plain ? TORSO.filter(({ y }) => y !== 1.535 && y !== 1.17) : TORSO, round(10, 8), { bottom: true }), RIG.BODY, 0, (x, y) => (y > NECK_FOOT ? TINT.SELF : y > WAIST ? TINT.TOP : TINT.LEGS));

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
  add(tube([{ y: 1.0, rx: 0.172, rz: 0.128 }, { y: LEG, rx: 0.2, rz: 0.16 }, { y: LEG / 2, rx: SKIRT_X, rz: 0.22 }, { y: 0.08, rx: 0.32, rz: 0.27 }], round(10, 8)),
    RIG.SKIRT, PART.SKIRT, TINT.SKIRT);
  const ponchoSides = round(10, 8), ponchoDip = (a) => -0.13 * Math.cos(2 * a), ponchoRings = [{ y: 1.545, rx: 0.085, rz: 0.08 }, { y: 1.43, rx: 0.33, rz: 0.2 }, { y: 1.02, rx: 0.345, rz: 0.25 }];
  for (const form of [FORM.PONCHO.poncho, FORM.PONCHO.fringed]) {
    add(tube(ponchoRings, ponchoSides, { dy: ponchoDip }), RIG.BODY, PART.PONCHO, TINT.THING, (x, y) => (y < 1.3 ? 1 : 0), form);
  }
  /* A fringe along a fringed poncho's hem: two tongues of it to each side of the hem, hanging FRINGE down. */
  const hemAt = (a) => [0.345 * Math.sin(a), 1.02 + ponchoDip(a), 0.25 * Math.cos(a)], fringe = [];
  for (let j = 0; j < ponchoSides; j++) {
    const a = hemAt((2 * Math.PI * j) / ponchoSides), b = hemAt((2 * Math.PI * (j + 1)) / ponchoSides), at = (t) => a.map((v, k) => v + (b[k] - v) * t);
    for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) {
      const p0 = at(t0), p1 = at(t1), tip = at((t0 + t1) / 2);
      fringe.push(...p0, tip[0], tip[1] - FRINGE, tip[2], ...p1);
    }
  }
  add(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(fringe), 3)), RIG.BODY, PART.PONCHO, TINT.THING, () => 1, FORM.PONCHO.fringed);
  /* A coat's tail, open down the front: from the ribs out over the hips to a hem that the figure's own number sets (aCut.y), its rings
     at the ribs, the hips, the thigh and the hem, which follow the legs as a skirt's do. It is the top's colour, for the coat is the
     top. */
  add(tube([{ y: 1.17, rx: 0.155, rz: 0.12, rb: 0.115 }, { y: LEG, rx: 0.2, rz: 0.16 }, { y: 0.4, rx: 0.27, rz: 0.215, rb: 0.235 }, { y: 0.08, rx: 0.275, rz: 0.22, rb: 0.24 }],
    round(10, 8), { open: 1 }), RIG.SKIRT, PART.SKIRT, TINT.TOP, null, FORM.SKIRT.coat);
  /* A hood, down: a roll of the top's cloth round the back of the neck, from one shoulder to the other (HOOD_ROPE). */
  add(rope(HOOD_ROPE.points, HOOD_ROPE.radii, round(6, 4)), RIG.BODY, PART.HOOD, TINT.TOP);
  /* On the back: a pack, and a bedroll across the top of it or alone. */
  add(new THREE.BoxGeometry(0.27, 0.36, 0.13).translate(0, 1.26, -0.205), RIG.BODY, PART.PACK, TINT.THING);
  add(new THREE.CylinderGeometry(0.062, 0.062, 0.36, 6).rotateZ(Math.PI / 2).translate(0, 1.5, -0.19), RIG.BODY, PART.ROLL, TINT.LEGS);

  /* A plain figure, which a phone draws from the hill a few of its pixels across, holds up what it holds up on a pole as thick as a
     pixel of the phone's there, 40 m off (POLE_R; the same distance inside the hand, IN, so it reaches no farther out), so that no
     cloth reads as floating; its balloons on sticks of nearly that, not strings (STRING_R); its flags DROPS deeper and its streamers
     THICK times as broad. */
  const POLE_R = plain ? 0.034 : 0.015, IN = POLE_R - 0.015, STRING_R = plain ? 0.03 : 0.008, DROPS = plain ? 0.1 : 0, THICK = plain ? 1.8 : 1;
  /* In the hands and overhead. A pole in the right hand, and a flag on it over the head, which waves from the pole out (its weight
     along it); a balloon over the right shoulder on a string from that hand, which goes up past the head a hand's breadth out and
     leans from the hand up. */
  add(new THREE.CylinderGeometry(POLE_R, POLE_R, 2.04, round(4, 3)).translate(0.3 - IN, 1.88, 0.075), RIG.BODY, PART.POLE, TINT.SHOE);
  add(new THREE.BoxGeometry(0.64, 0.5 + DROPS, 0.014, round(3, 1), 1, 1).translate(-0.02, 2.65 - DROPS / 2, 0.075), RIG.BODY, PART.FLAG, TINT.CLOTH, (x) => (0.3 - x) / 0.64);
  const lift = (x, y) => Math.min(1, Math.max(0, (y - 0.885) / 1.1));
  add(new THREE.SphereGeometry(0.13, round(7, 6), 4).scale(1, 1.18, 1).translate(0.2, 2.6, -0.03), RIG.BODY, PART.BALLOON, TINT.CLOTH, lift);
  add(rope([[0.285, 0.885, 0.03], [0.3 - IN, 1.7, 0], [0.2, 2.447, -0.03]], [STRING_R, STRING_R, STRING_R], 3), RIG.BODY, PART.BALLOON, TINT.SHOE, lift);
  /* A taper's stand before the left foot, on the ground: a pole to over the head, a bar across its top and, but on a plain figure, a
     microphone at each end; a plain figure's pole and bar as thick as its other poles, so the bar does not float. */
  add(new THREE.CylinderGeometry(POLE_R - 0.001, POLE_R - 0.001, 2.2, 4, 1, true).translate(STAND_X, 1.1, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  add(new THREE.BoxGeometry(0.18, 0.022 + 2 * IN, 0.022 + 2 * IN).translate(STAND_X, 2.19, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  if (!plain) for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.034, 0.085, 0.034).translate(STAND_X + side * 0.08, 2.195, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  add(new THREE.ConeGeometry(0.06, 0.1, 3).translate(STAND_X, 0.05, STAND_Z), RIG.GROUND, PART.STAND, TINT.SHOE);
  /* The finger of the right hand, for the one who holds it up for a ticket. */
  add(new THREE.ConeGeometry(0.016, 0.1, 4).rotateX(Math.PI).translate(SHOULDER_X, 0.79, 0), RIG.ARM_R, PART.FINGER, TINT.SELF);
  /* A cup in the right fist, standing out of it the way the forearm bends (CUP_ARM), so it stands upright as the forearm comes up
     level before the figure. */
  add(new THREE.CylinderGeometry(0.036, 0.028, 0.1, round(6, 5)).rotateX(Math.PI / 2).rotateY(cupWay)
    .translate(SHOULDER_X + 0.045 * Math.sin(cupWay), HAND_Y, 0.045 * Math.cos(cupWay)), RIG.ARM_R, PART.CUP, TINT.THING);
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
  /* The other forms of a crown, each on the head as a hat's crown is and raised from CROWN_FOOT as its own number says (aCut.z): a
     tall knit cap whose tip bends back, with a bobble on it; a jester's cap, its three points out to either side and up behind, each
     with a bell; and a hat's crown with a plume standing up from its band and curling back. */
  add(tube([{ y: 2.02, rx: 0.025, cz: -0.12 }, { y: 1.95, rx: 0.07, cz: -0.06 }, { y: 1.85, rx: 0.12, rz: 0.125, cz: -0.015 }, { y: 1.72, rx: 0.145, rz: 0.152 }],
    round(8, 6), { top: true }), RIG.HEAD, PART.CROWN, TINT.THING, null, FORM.CROWN.knit);
  add(new THREE.IcosahedronGeometry(0.042, 0).translate(0, 2.035, -0.135), RIG.HEAD, PART.CROWN, TINT.LEGS, null, FORM.CROWN.knit);
  add(tube([{ y: 1.83, rx: 0.1, rz: 0.105, cz: -0.01 }, { y: 1.72, rx: 0.145, rz: 0.152 }], round(8, 6), { top: true }), RIG.HEAD, PART.CROWN, TINT.THING, null, FORM.CROWN.jester);
  for (const [point, tint] of [[[[-0.07, 1.8, 0], [-0.19, 1.88, -0.01], [-0.27, 1.82, -0.02], [-0.29, 1.71, -0.03]], TINT.THING],
    [[[0.07, 1.8, 0], [0.19, 1.88, -0.01], [0.27, 1.82, -0.02], [0.29, 1.71, -0.03]], TINT.LEGS], [[[0, 1.82, -0.05], [0, 1.95, -0.1], [0, 2.0, -0.19], [0, 1.94, -0.25]], TINT.THING]]) {
    add(rope(point, [0.05, 0.035, 0.022, 0.012], round(4, 3)), RIG.HEAD, PART.CROWN, tint, null, FORM.CROWN.jester);
    add(new THREE.OctahedronGeometry(0.032, 0).translate(...point[3]), RIG.HEAD, PART.CROWN, TINT.SHOE, null, FORM.CROWN.jester);
  }
  add(new THREE.CylinderGeometry(0.118, 0.137, 0.1, round(8, 6)).translate(0, TALL - 0.05, 0), RIG.HEAD, PART.CROWN, TINT.THING, null, FORM.CROWN.plume);
  add(rope([[0.11, 1.78, -0.03], [0.14, 1.9, -0.08], [0.15, 2.0, -0.16], [0.13, 2.05, -0.24]], [0.02, 0.03, 0.022, 0.006], round(4, 3)), RIG.HEAD, PART.CROWN, TINT.LEGS,
    null, FORM.CROWN.plume);
  /* Flowers on the crown of the head: a thin ring and seven blooms standing up and out from it. */
  add(new THREE.TorusGeometry(0.118, 0.02, 3, round(7, 6)).rotateX(Math.PI / 2).translate(0, HEAD_Y + 0.11, 0), RIG.HEAD, PART.WREATH, TINT.LEGS, null, FORM.WREATH.flowers);
  for (let k = 0; k < 7; k++) {
    const a = (2 * Math.PI * k) / 7 + 0.22;
    add(new THREE.OctahedronGeometry(0.044, 0).translate(0.125 * Math.sin(a), HEAD_Y + 0.15, 0.125 * Math.cos(a)), RIG.HEAD, PART.WREATH, TINT.THING, null, FORM.WREATH.flowers);
  }
  /* Dreadlocks, from round the back and sides of the head out and down: the long ones behind, which the figure's own length lets down
     (their weight, aMark.w), and the short ones at the sides, which end over the shoulders whatever it. A high bun on the crown. */
  const LOCKS = plain ? [[0, 1.38, 0.2, 1], [0.8, 1.42, 0.21, 0.9], [1.6, 1.58, 0.18, 0]]
    : [[0, 1.38, 0.2, 1], [0.5, 1.4, 0.2, 1], [1, 1.44, 0.21, 0.8], [1.5, 1.58, 0.18, 0], [2, 1.6, 0.16, 0]];
  for (const [turn, end, out, long] of LOCKS) for (const side of turn === 0 ? [1] : [-1, 1]) {
    const at = (r, y) => [r * side * Math.sin(turn), y, -r * Math.cos(turn) - 0.03];
    add(rope([at(0.11, 1.77), at(0.165, 1.63), at(out, end)], [0.03, 0.027, 0.02], 3), RIG.HEAD, PART.HAIR, TINT.HAIR, () => long, FORM.HAIR.dreads);
  }
  add(new THREE.IcosahedronGeometry(0.08, round(1, 0)).scale(1, 0.9, 1).translate(0, 1.86, -0.05), RIG.HEAD, PART.HAIR, TINT.HAIR, null, FORM.HAIR.bun);

  /* A pole that leans in from the hand to stand its top over the head, and what stands on it: a star, a moon on its back, a parasol and
     a puppet's head in a ruff. And what else flies from a straight pole, from its top out over the head: a swallowtail, a pennant and
     two streamers, which wave from the pole out as the square flag does. None of them is printed with anything. */
  const flies = (x) => Math.min(1, Math.max(0, (0.3 - x) / 0.64));
  add(rope([[0.3 - IN, 0.86, 0.075], [0.14, 2.6, 0]], [POLE_R, POLE_R], round(4, 3)), RIG.BODY, PART.POLE, TINT.SHOE, null, FORM.POLE.lean);
  add(slab([[0.3, 2.42 - DROPS], [0.3, 2.9], [-0.34, 2.9], [-0.14, 2.66 - DROPS / 2], [-0.34, 2.42 - DROPS]], 0.075, 0.014), RIG.BODY, PART.FLAG, TINT.CLOTH, flies, FORM.FLAG.swallowtail);
  add(slab([[0.3, 2.56 - DROPS], [0.3, 2.9], [-0.34, 2.73 - DROPS / 2]], 0.075, 0.014), RIG.BODY, PART.FLAG, TINT.CLOTH, flies, FORM.FLAG.pennant);
  for (const [y, wide, far, tint] of [[2.83, 0.045 * THICK, -0.34, TINT.CLOTH], [2.66, 0.04 * THICK, -0.27, TINT.CLOTH2]]) {
    const along = Array.from({ length: 6 }, (_, k) => [0.3 + ((far - 0.3) * k) / 5, y + 0.03 * Math.sin(2.4 * k)]), half = (k) => wide * (1 - 0.7 * (k / 5));
    add(slab([...along.map(([x, v], k) => [x, v + half(k)]), ...along.map(([x, v], k) => [x, v - half(k)]).reverse()], 0.075, 0.012), RIG.BODY, PART.FLAG, tint, flies, FORM.FLAG.streamer);
  }
  const star = Array.from({ length: 10 }, (_, k) => [0.14 + (k % 2 ? 0.085 : 0.2) * Math.sin((Math.PI * k) / 5), 2.75 + (k % 2 ? 0.085 : 0.2) * Math.cos((Math.PI * k) / 5)]);
  add(slab(star, 0, 0.02), RIG.BODY, PART.FLAG, TINT.CLOTH, null, FORM.FLAG.star);
  /* The moon: the part of a circle 0.2 round (0.14, 2.76) outside one 0.1667 round a point 0.1 over that, its thick middle below. */
  const arc = (cy, r, from, to) => Array.from({ length: 9 }, (_, k) => { const a = from + ((to - from) * k) / 8; return [0.14 + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const horn = Math.atan2(0.0833, 0.1247), inner = Math.atan2(0.0083, 0.1247);
  add(slab([...arc(2.76, 0.2, Math.PI - horn, 2 * Math.PI + horn), ...arc(2.86, 0.1667, inner, -Math.PI - inner).slice(1, -1)], 0, 0.02), RIG.BODY, PART.FLAG, TINT.CLOTH, null, FORM.FLAG.moon);
  add(tube([{ y: 2.71, rx: 0.02, cx: 0.14 }, { y: 2.67, rx: 0.15, cx: 0.14 }, { y: 2.6, rx: 0.21, cx: 0.14 }], round(8, 6), { top: true, bottom: true }), RIG.BODY, PART.FLAG, TINT.CLOTH, null, FORM.FLAG.parasol);
  add(new THREE.IcosahedronGeometry(0.2, round(1, 0)).scale(1, 1.3, 1).translate(0.14, 2.72, 0), RIG.BODY, PART.FLAG, TINT.CLOTH, null, FORM.FLAG.puppet);
  add(tube([{ y: 2.5, rx: 0.08, cx: 0.14 }, { y: 2.46, rx: 0.17, cx: 0.14 }, { y: 2.42, rx: 0.065, cx: 0.14 }], round(8, 6)), RIG.BODY, PART.FLAG, TINT.CLOTH2, null, FORM.FLAG.puppet);
  /* Three balloons on three strings from the one hand, each its own colour, at three heights over the shoulder: each string passes the
     head a hand's breadth out. */
  for (const [x, y, z, r, tint] of [[0.215, 2.4, 0.06, 0.11, TINT.CLOTH], [0.12, 2.62, -0.08, 0.11, TINT.CLOTH2], [0.23, 2.78, 0.02, 0.1, TINT.CLOTH3]]) {
    add((plain ? new THREE.IcosahedronGeometry(r, 0) : new THREE.SphereGeometry(r, 7, 4)).scale(1, 1.18, 1).translate(x, y, z), RIG.BODY, PART.BALLOON, tint, lift, FORM.BALLOON.bunch);
    add(rope([[0.285, 0.885, 0.03], [0.3 - IN, 1.7, 0], [x, y - 1.18 * r, z]], [STRING_R, STRING_R, STRING_R], 3), RIG.BODY, PART.BALLOON, TINT.SHOE, lift, FORM.BALLOON.bunch);
  }
  /* What the hand held up holds up, past it as the hand hangs, so over it once raised: a hat, its brim flat and its crown on top, or a
     tambourine's ring, seen whole from behind. Each is built in the fist, TUCK of its size. */
  const fisted = (geo) => geo.translate(-SHOULDER_X, -HAND_Y, 0).scale(TUCK, TUCK, TUCK).translate(SHOULDER_X, HAND_Y, 0);
  add(fisted(new THREE.CylinderGeometry(0.12, 0.12, 0.014, round(10, 8)).translate(SHOULDER_X, HAND_Y - 0.13, 0)), RIG.ARM_R, PART.FINGER, TINT.THING, null, FORM.FINGER.aloft);
  add(fisted(new THREE.CylinderGeometry(0.07, 0.078, 0.075, round(8, 6)).translate(SHOULDER_X, HAND_Y - 0.175, 0)), RIG.ARM_R, PART.FINGER, TINT.THING, null, FORM.FINGER.aloft);
  add(fisted(new THREE.TorusGeometry(0.085, 0.018, 3, round(10, 8)).translate(SHOULDER_X, HAND_Y - 0.11, 0)), RIG.ARM_R, PART.FINGER, TINT.THING, null, FORM.FINGER.tambourine);

  /* The corners and their marks are all a figure's geometry holds. The material shades each face flat, from the face itself, so it
     reads no normal to light one, and none is kept. */
  return mergeGeometries(parts);
}

/* The faces of a figure's geometry that are one form of one part's (`bit`, 0 for the body, and `form`), with their corners shared: a
   corner that several faces meet at with one mark is kept once, and worked out once a frame and not once for each face. `position`
   and `mark` are the corners, three and four numbers each, `index` three corners to a face, and `tints` each face's tint. */
export const formOfMark = (z) => Math.floor(z / TINTS);
export function pieces(figure, bit, form = 0) {
  const position = figure.getAttribute("position"), mark = figure.getAttribute("aMark"), at = [], marks = [], index = [], seen = new Map();
  for (let k = 0; k < position.count; k++) {
    if (mark.getY(k - (k % 3)) !== bit || formOfMark(mark.getZ(k - (k % 3))) !== form) continue;
    const corner = [position.getX(k), position.getY(k), position.getZ(k), mark.getX(k), mark.getY(k), mark.getZ(k), mark.getW(k)], key = corner.join();
    if (!seen.has(key)) { seen.set(key, at.length / 3); at.push(corner[0], corner[1], corner[2]); marks.push(corner[3], corner[4], corner[5], corner[6]); }
    index.push(seen.get(key));
  }
  /* And each face's tint, as drawnOf reads it. */
  const tints = Int8Array.from({ length: index.length / 3 }, (_, t) => marks[4 * index[3 * t] + 2] % TINTS);
  return { position: new Float32Array(at), mark: new Float32Array(marks), index, tints };
}

/* A leg is two bones of the same length, the thigh and the shin, from the hip down to the knee and on to the foot. The knee stands
   wherever those lengths put it between the hip and the foot, always ahead of the line between them, so a leg bends and never
   stretches or shrinks. Standing, a figure's knees bend to the beat as its hips come down, a fifth of the legs' height at the most
   (the bob, which is counted in the height a leg has left once it has folded to FOLD of its own). A figure sits on the ground with its
   knees up and apart: its hips SEAT above the ground and its feet FOOT ([forward, up]) from where it stood, lower or higher by as much
   as the ground falls or rises that far ahead of its seat (aFig.w), and tipped along that slope, so they rest on the hill; and its
   knees fall out to either side, SPLAY rad of a turn about the line from the hip to the foot, so that a camera behind it, from which
   its back hides any leg in line with it, sees its knees beside it. Seated, its forearms rest on its knees (REST), and a skirt lies
   over its knees and on the ground. Those the gathering seats sit (aFig.x = 1); the rest of the crowd sits as `sit` rises, each figure
   in its turn, the last STAGGER behind the first.
   The ground under a figure is a plane through its seat, falling ahead of it as aFig.w says and rising across it, to its right, by
   aPlace.w of a unit up for each unit out. Its legs lean with that plane, each corner of a leg, of a foot or of a skirt over them
   raised by the plane's rise at the corner's own place, all of it at the foot and none at the hip: across, standing or seated, so that
   no foot stands in the slope on its uphill side; and ahead, standing, where a seated figure's feet already rest where its fall puts
   them. */
export const FOLD = 0.18, STAGGER = 0.5, SEAT = 0.075, FOOT = [0.36, 0.005], SPLAY = 0.7;
/* The ground's fall or rise ahead of a seat that a seated figure's feet follow, in the figure's own units, at the most. */
export const DROP = [-0.12, 0.3];
/* Where a figure meets the ground, in its own units across and ahead of its seat (groundUnder): standing, the corners of its soles;
   and seated as its stance sits it (SITS), its thighs and its soles, and the hands of a figure leaning back, its shins and knees kneeling, and
   its seat and forearms lying back, the hands (HANDS) out with its shoulders, SHOULDER_X for each unit wider (aBody.y): where they
   stood for the standard figure's, a slight one's leaning back stood its seat 4.05 cm over a desktop's ground. Each is mirrored to
   the figure's other side. NEARS are where a part comes near the ground and
   must not go far into it, each [x, z, h] h over the ground where the figure rests on it: the back of a seat and a poncho's points
   behind it and ahead, a cross-legged figure's knees and a skirt over them, and a hugging one's feet. */
const soles = (x, z0, z1) => [[x - 0.05, z0], [x + 0.05, z0], [x - 0.05, z1], [x + 0.05, z1]];
export const CONTACTS = {
  stand: soles(0.12, -0.05, 0.15),
  knees: [[0.1, 0.1], [0.1, 0.3], ...soles(0.1, 0.32, 0.52)],
  cross: [[0.09, 0.05], [0.2, 0.05], [0.2, 0.2], ...soles(0.2, 0.14, 0.34)],
  hug: [[0.1, 0.1], [0.1, 0.3], ...soles(0.26, 0.24, 0.44)],
  back: [[0.1, 0.1], [0.1, 0.3], ...soles(0.1, 0.32, 0.52)],
  kneel: [[0.1, -0.08], [0.08, 0.28], [0.2, 0.28], [0.08, 0.52], [0.2, 0.52], ...soles(0.1, -0.24, -0.02)],
  recline: [[0.1, 0.08], [0.1, 0.2], ...soles(0.1, 0.32, 0.52)],
};
const HANDS = { back: [[0.33, -0.18], [0.38, -0.18], [0.35, -0.13]], recline: [[0.3, -0.33], [0.35, -0.02], [0.35, 0.03]] };
const SEATED_NEAR = [[0.12, -0.06, 0.02], [0, -0.26, 0.1], [0, 0.25, 0.08]];
export const NEARS = { stand: [], knees: SEATED_NEAR, cross: [...SEATED_NEAR, [0.56, 0.1, 0.045], [0.5, 0.08, 0.015]], hug: [...SEATED_NEAR, [0.36, 0.23, 0.05]],
  back: SEATED_NEAR.slice(0, 1), kneel: [], recline: [] };
/* And what comes near the ground out past those for what a figure wears and how it moves, as wearing gives it: a flared trouser's
   cuff, standing and seated, as far out as the stoutest figure's goes; a skirt's hem, spread round a kneeling figure as far as a
   maxi's goes; and the feet of one that turns on the spot, which sweep round its middle, and a flared cuff's wider. With only the
   contacts looked at, they went 3.9, 5.5 and 6.2 cm into a television's or a phone's ground, which folds between points further
   apart than a desktop's. */
const CUFFS = { stand: [[0.24, -0.08], [0.24, 0.08], [0.11, -0.15]], knees: [[0.24, 0.28, 0.005]], cross: [[0.26, 0.1, 0.005], [0.26, 0.26, 0.005]],
  hug: [[0.4, 0.2, 0.005]], back: [[0.24, 0.28, 0.005]], kneel: [[0.24, -0.16]], recline: [[0.24, 0.3, 0.005]] };
const HEMS = { kneel: [[0.31, 0, 0.012], [0.19, 0.51, 0.012], [0, 0.54, 0.012]] };
const TURNING = [[0.21, -0.05], [0.06, 0.21], [0.06, -0.21], [0.15, -0.14]];
const TURNING_CUFFS = [[0.25, 0], [0.18, 0.18], [0, 0.25], [0.18, -0.18], [0, -0.25]];
/* How far a part near the ground (NEARS) may go into it, and how far a contact may stand over it where the figure sits as a stance sits it
   (stances), in metres. */
export const SINK = 0.02, FLOAT = 0.03;
/* How high over the ground a seated figure leans with it across, in its own units: all the way on it, and less the higher (DANCE). */
export const GROUNDED = 0.4;
const mirrored = (list) => list.flatMap(([x, z, h = 0]) => (x === 0 ? [[x, z, h]] : [[x, z, h], [-x, z, h]]));
export const touching = (name, wide = 1) => mirrored([...CONTACTS[name], ...(HANDS[name] ?? []).map(([x, z]) => [x + SHOULDER_X * (wide - 1), z])]);
export const nearing = (name, worn = { parts: 0, style: 0 }) => mirrored([...NEARS[name],
  ...(Math.floor(worn.style / STYLE.CUT) & CUT.BELLS ? CUFFS[name] : []), ...((worn.parts & PART.SKIRT) !== 0 ? HEMS[name] ?? [] : []),
  ...(name === "stand" && worn.style % STYLE.ARMS === MOVE.spin ? [...TURNING, ...(Math.floor(worn.style / STYLE.CUT) & CUT.BELLS ? TURNING_CUFFS : [])] : [])]);
/* How high a point [x, z, h] of a figure stands, in its own units over its seat's ground, where the ground falls `fall` to FOOT[0]
   ahead of it and rises `rises` a unit out across it: a seated figure goes down with the ground ahead, and leans with it across as
   far as it is near it (GROUNDED); a standing one's soles lean with it all the way; and nothing passes under it (DANCE). */
export const standsAt = ([x, z, h = 0], rises, fall) => -(fall * z) / FOOT[0] + Math.max(h + Math.max(1 - h / GROUNDED, 0) * rises * x, rises * x);
/* The plane a figure lies on, for the ground's height `at(x, z)` in metres at a point in its own units, its height `tall`, how it
   stands or sits at its seat (`own`, "stand" or one of SITS), how it does the other way (`other`), and what it wears and how it
   moves and how broad its shoulders are (`worn`, as fitted gives it): as how far the ground falls ahead of the seat to FOOT[0] (aFig.w, `drop`, within DROP) and
   rises across it, a unit up for each unit out (aPlace.w, `rises`), in its own units; and how far the figure stands over the seat's
   ground, `lift`, in metres, so that the highest of its contacts touches the ground and nothing near it (nearing) goes more than SINK
   into it, and how far the other way, `other`, so of that way's; and how far the lowest of its own contacts then stands over the
   ground, `spread`: the plane that fits the ground at those contacts best, by least squares. */
export function groundUnder(at, tall, own, other, worn) {
  const g = at(0, 0), wide = worn?.wide ?? 1, ways = { [own]: [touching(own, wide), nearing(own, worn)], [other]: [touching(other, wide), nearing(other, worn)] }, fit = ways[own][0];
  const ground = new Map(Object.values(ways).flat(2).map((c) => [c, at(c[0], c[1]) - g]));
  /* The least squares of c + a x + b z through the ground at the contacts. */
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  for (const c of fit) {
    const row = [1, c[0], c[1]], y = ground.get(c);
    for (let r = 0; r < 3; r++) { v[r] += row[r] * y; for (let k = 0; k < 3; k++) m[r][k] += row[r] * row[k]; }
  }
  const det = (q) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const col = (k) => det(m.map((r, i) => r.map((e, j) => (j === k ? v[i] : e)))), whole = det(m);
  const within = (d) => Math.min(Math.max(d, DROP[0]), DROP[1]);
  const over = (c, rises, fall) => ground.get(c) - tall * standsAt(c, rises, fall);
  const highest = (name, rises, fall) => Math.max(...ways[name][0].map((c) => over(c, rises, fall)), ...ways[name][1].map((c) => over(c, rises, fall) - SINK));
  const rises = col(1) / whole / tall, drop = (-col(2) / whole) * FOOT[0] / tall, fall = within(drop), lift = highest(own, rises, fall);
  return { drop, rises, lift, other: highest(other, rises, fall), spread: lift - Math.min(...fit.map((c) => over(c, rises, fall))) };
}

/* The dance, on the band's count (main.js gives the crowd band.js's, never over HALF_OVER a second and never back). Each figure
   moves one way (MOVES), as far as its own size lets it (aWear.w, 1 at the most, and a quarter to a half for a third of them,
   QUIET), and on its own count of four (DANCE), within JITTER of a count of the rest. One that bobs brings its hips down on its count
   by BOB of what a fold to FOLD takes, sways SWAY rad to one side and swings that arm out ARM_SWING rad, and two counts on comes up
   and leans to the other. One that sways leans from the feet, its hips out and its shoulders back over them, to one side and two
   counts on to the other; one waves both arms overhead so; one turns on the spot, there and back over eight counts, its arms out and
   a skirt flaring as it turns; one nods; one claps on every other count, before its chest; one shifts its weight from one foot to
   the other and back over eight counts, holding on each; and one stands and watches, still. A stance, a hand on a hip, folded arms,
   a cup or an arm round a friend, is kept dancing or not, but let go, like the dance, as the parting stills a figure. Seated, every
   arm but one that holds something (below) rests its forearm on its knee: turned out REST[0] rad at the shoulder and forward REST[1],
   and bent REST[2] forward at the elbow. An arm that hung beside a seated figure put its hand on the ground there, and from behind,
   where the figure's back hides its legs, read as the side of one sunk to its waist.
   A hand that holds something keeps hold of it, standing, seated, as the build-up lifts the rest, and held still by the parting:
   the right hand at the foot of a flag's pole or a balloon's string; both hands at the legs of a child on the shoulders; a
   drummer's at the drum, each tapping on every other count; and the finger held up stays up, which a figure tucks into its fist
   only as the parting brings that arm down. A hoop is in the hands only at rest: dancing, it goes round the hips and the arms
   stand clear of it.
   The dance moves as the band does, for the old bar on flashes (CLAUDE.md, motion and flashes; band.js says why). A dark limb that passes
   over lit ground, the stage's apron or the sky swings each block on its way twice as it goes and twice as it comes back: an arm
   raised at a peak, its knees bending on every beat, crossed one block 7 and 8 times in a second from the stage and from the front
   of the crowd. So every move a figure makes is band.js's (swing): it holds still, goes at an even pace and arrives on the figure's
   count, and holds again, so no edge creeps over a pixel's middle; and what can pass against the light comes and goes once in SLOW
   counts, its knees, its nod, its arms and its lean, its turn and a shift of its weight once in twice that, and only the hands of a
   clap or at a drum, before the figure's own body, once in STRUM, as a strum does. Each move takes a quarter of its counts, a count
   of the four and two of the eight, and a hand before the chest the band's STEP of a count. And a figure's knees, lean, nod and arms
   all keep one stride, so it passes a point at most once as it goes and once as it comes back. No arm is raised by one that sits,
   as the whole crowd does through Space, but the one held up with a finger, which does not move of itself. It was counted by render,
   with scripts/flash, and those PRs' text holds the counts. Motion owes no count now: a PR may loosen these rules with frames to show it.
   No way of moving carries a hand further from the figure's axis than the bob does as the build-up lifts its arms, so the reaches
   below bound them all (crowd.test.ts). */
const BOB = 0.12, ARM_SWING = 0.5, SWAY = 0.08, JITTER = 0.12;
export const REST = [0.12, 0.55, 0.35];
/* One that turns on the spot holds its arms out SPIN_OUT rad from its sides, a little below level, its right higher than its left,
   and a little further out and back once a turn; its elbows bent SPIN_BEND, the forearms turned up from them, so that from behind
   its arms show their elbows, where held level and straight they read as one stick across its shoulders. One that bobs dances with
   its elbows bent, BENT[1] rad, its upper arms forward BENT[0] and its forearms turned in BENT[2], not at all, so that a hand swings
   out from the body's line and never back across it, once in four counts, on the side it leans to: a swing out the other way ended
   past the lean carrying it back, and went back on itself a few millimetres as the lean held. One that sways, BENT[3]. As the
   parting stills a figure they straighten, so a still figure's arms hang as they did. */
const SPIN_OUT = 1.15, SPIN_BEND = 0.7;
export const BENT = [0.2, 0.6, 0, 0.35];
/* The share of the crowd that dances only a little (people). */
export const QUIET = 0.34;
/* A stance (STANDS) stands its figure on one leg (WEIGHT, -1 its left and 1 its right): its hips go SHIFT out over that foot and its
   other hip HIP_DROP down, which bends that knee, and above them it tips TILT that way, its head back over its feet. One with an
   arm round a friend leans LEAN_TO toward them from the hips, and one whose arm is round their waist lays its head HEAD_TO further.
   Its arms (STAND_ARMS) are each [lift, fore, bend, inward] as the arm block takes them (DANCE), for its left arm or its right: an
   arm round a friend's shoulders goes out level and its forearm round behind them, its hand on their back below the shoulders;
   one round a friend's waist goes out low and behind them, its hand on their back at the waist (crowd.test.ts). A cup's right arm
   is CUP_ARM. Each is held as far as the figure stands and dances where it stands, so the parting's stillness and a seat let it go,
   like the dance: but a cup is held up seated too, and as the parting lets its arm down it stays upright in the fist. */
const SHIFT = 0.045, HIP_DROP = 0.025, TILT = 0.06, LEAN_TO = 0.15, HEAD_TO = 0.22;
export const CUP_ARM = [0.08, 0.12, 1.45, 0.35];
const cupWay = -0.5 * Math.PI * CUP_ARM[3];
const ROUND_ARM = [1.6, 0.32, 1.3, 1.65], WAIST_ARM = [0.76, -0.46, 0.6, -0.6];
export const STAND_ARMS = {
  hip: { left: [0.62, 0, 1.5, 1] }, akimbo: { left: [0.62, 0, 1.5, 1], right: [0.62, 0, 1.5, 1] },
  folded: { left: [0.12, 0.25, 1.75, 0.75], right: [0.12, 0.25, 1.75, 0.75] }, cup: { right: CUP_ARM },
  behind: { left: [0.1, -0.3, 1.2, 1.6], right: [0.1, -0.3, 1.2, 1.6] }, round: { right: ROUND_ARM }, roundLeft: { left: ROUND_ARM },
  waist: { right: WAIST_ARM }, waistLeft: { left: WAIST_ARM }, pockets: { left: [0.08, 0.05, 0.5, 0.6], right: [0.08, 0.05, 0.5, 0.6] },
};
export const WEIGHT = { left: -1, right: 1, hip: -1, folded: 1, cup: -1, waist: 1, waistLeft: -1, pockets: 1 };
const TOWARD = { round: 1, roundLeft: -1, waist: 1, waistLeft: -1 };
/* How each seated stance (SITS) sits: its forearms' rest, [lift, fore, bend, inward] as REST is; its feet `foot` ahead of its seat; its
   knees fallen `splay` rad apart; its feet crossed `cross` over to the other side; it leaning `pitch` rad forward from its hips, or
   back; its hips `hip` over the ground; whether it kneels, on its heels, its feet behind it and turned back; and how far ahead of
   its seat the whole of it sits, which keeps a head lying back as near its seat as its knees reach (KNEES); and whether its hands or
   forearms rest on the ground behind it, where they reach PRESS[0] further down, onto it, as a kneeling figure's knees do PRESS[1]. */
const PRESS = [0.05, 0.01];
export const SIT_POSE = {
  knees: { arms: [...REST, 0], foot: FOOT[0], splay: SPLAY, cross: 0, pitch: 0, hip: SEAT - 0.017, kneel: 0, ahead: 0, hands: 0 },
  cross: { arms: [0.1, 0.4, 1.1, 0.75], foot: 0.18, splay: 1.0, cross: 0.28, pitch: 0, hip: SEAT, kneel: 0, ahead: 0, hands: 0 },
  hug: { arms: [0.02, 0.95, 0.5, 0.9], foot: 0.28, splay: 0.06, cross: -0.16, pitch: 0.14, hip: SEAT - 0.031, kneel: 0, ahead: 0, hands: 0 },
  back: { arms: [0.12, -0.3, 0, 0], foot: FOOT[0], splay: 0.35, cross: 0, pitch: -0.2, hip: SEAT - 0.023, kneel: 0, ahead: 0, hands: 1 },
  kneel: { arms: [0.05, 0.3, 0.25, 0.3], foot: -0.08, splay: 0.12, cross: 0, pitch: 0, hip: 0.285, kneel: 1, ahead: 0, hands: 0 },
  recline: { arms: [0.15, -1.05, 1.5, 0], foot: 0.12, splay: 0.2, cross: 0, pitch: -1.1, hip: SEAT, kneel: 0, ahead: 0.22, hands: 1 },
};
/* The beats the phase is kept to: the longest move's cycle, the turn's, which every other divides. */
export const CYCLE = 8;
/* The rise before a peak: a figure stands, its arms go up to ARM_UP rad and its knees bend on every beat and twice as deep, as
   `rise` passes from RISE_FROM to RISE_FROM + RISE_W at the crowd's front and RISE_SPAN later at its back (aFig.z, 0 at the front and 1
   at the back), so the rise ripples outward from the stage and the whole crowd is up at the peak, but for the hands that hold
   something. */
const ARM_UP = 2.7, RISE_FROM = 0.3, RISE_SPAN = 0.6, RISE_W = 0.1;
/* How far a figure reaches in its own units, over every pose: its farthest vertex HAND from its axis (its arms level partway up the
   rise, swaying at the dance's widest), its highest TOP over its feet (what it holds up over the heads round it, half a figure's
   height over the tallest of them, its hands up at the rise's peak well under that), and PAST beyond the bounds it
   stands in; and HANG with its arms hanging, as one standing fully still (aPart.w, seats.js) holds them. A seated figure's feet reach
   further than HANG ahead of it, FEET from its axis, and its knees, fallen apart, with the forearms on them and a skirt over them,
   KNEES out at the most, but all of it low along the ground, where the bear reaches less far (BEAR_LEGS). Whatever a figure wears or
   carries stays inside these: buildCrowd makes each as broad and as tall as they let the largest be, and no more, its feet fitted to
   FEET; KNEES is where the broadest there could be, the stoutest build on the longest legs at the largest's size, then comes to
   (crowd.test.ts). */
export const HAND = 1.11, TOP = 2.8, HANG = 0.354, FEET = 0.55, KNEES = 0.63;
/* How far a figure lying back reaches from its axis, in its own units, at the most: its head, behind it, LYING and LYING_BIG more
   for each unit bigger its head is than the standard figure's (aBody.w), and its legs and a skirt over them no further than LYING;
   and how far a cross-legged or a kneeling figure's knees reach, or a skirt over them (LOW), the first number and the second more
   for each unit of its girth (aBody.x). Only one whose head, or knees, then keep clear of the visitor's bear lies back, sits
   cross-legged or kneels (buildCrowd). */
export const LYING = 0.655, LYING_BIG = 0.24, LOW = { cross: [0.51, 0.075], kneel: [0.55, 0.02] };
export const lyingOf = (big) => LYING + LYING_BIG * Math.max(big - 1, 0);
const PAST = 0.5;
/* The visitor's bear reaches 1.98 m from its middle, halfway between its feet and its head (bears.js, avatar.js). Lower down it
   reaches less, turned any way and at a run: under a metre up its hind legs, swung back, reach BEAR_LEGS from its middle, and under
   two the ends of its arms, swung to a run's widest, where they come down to two metres, BEAR_TAIL. That is named for its tail,
   which reached it before the tail was sunk into the rump, and reaches 1.51 m now. The parting keeps its middle `hang` from a seated
   figure's axis (partingOptions), so what of the figure is under a metre up keeps within hang - BEAR_LEGS of its axis, and under two
   within hang - BEAR_TAIL (crowd.test.ts, from bears.js). */
const BEAR = 1.98;
export const BEAR_LEGS = 1.59, BEAR_TAIL = 1.66;
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

/* The colours, by the show's era, as the stage and the line-up are (lineup.js eraOn): a figure's top, its legs and the things it
   wears and carries are the era's (DRESS), and its skin and its hair are anyone's (SKIN, HAIRS). Each row of DRESS is [from, to,
   palette], both dates the row's own, in date order and none overlapping; a show with no date dresses as the eighties do, as it
   stands before the six of 1979 to 1990 (band.js SIX). The late sixties wear bright shirts, paisley and flowered prints, suede and
   vests over shirts; the seventies denim, earth tones and plaid; the eighties tie-dye, bright tees and bandanas; the nineties tie-dye,
   flannel and dark tees. A top is [colour, pattern, second colour] (PATTERN): plain, tie-dyed, striped, checked, a vest over a
   shirt, or printed, the pattern drawn on it by the shader (DRESS_LOOK). Trousers, skirts and shoes are plain, and plainer than
   tops. No channel of any colour is brighter than MOST of full light, which is also all a tone can hold (tone), so no shirt is
   white under the stage's light. From every side, the lightest quarter of a figure as the eye sees it stands APART times lighter
   than its darkest, whatever it wears (drawnOf, dressFor), so every figure stands apart from the ground and the sky
   (crowd.test.ts). Each palette holds as many of each as COLOURS says, so a person is the same person in every era (people deals
   each an index into each list), and only what they wear changes. */
export const MOST = 0.8;
export const PATTERN = { PLAIN: 0, TIE: 1, STRIPE: 2, CHECK: 3, VEST: 4, PRINT: 5 }, PATTERNS = 8, SEEDS = 256;
const { PLAIN, TIE, STRIPE, CHECK, VEST, PRINT } = PATTERN;
export const DRESS = [
  ["1965-06-01", "1970-12-31", {
    top: [[0xc8582a, PLAIN], [0xc89a30, PLAIN], [0xa83068, PRINT, 0xe0a040], [0x5e3a86, PRINT, 0xd07040], [0x2a8a8a, PLAIN], [0xd6ccb0, VEST, 0x8a6038],
      [0xb03a30, VEST, 0x4a3020], [0x9a7048, PLAIN], [0x6a7a2c, PLAIN], [0xd8c090, PRINT, 0x5a7a2a], [0x3a5a9a, STRIPE, 0xd8c8a0], [0xc04a2a, TIE, 0xe0c040],
      [0x7a2a40, PLAIN], [0x4a6a3a, VEST, 0x9a7a4a]],
    legs: [0x3a5070, 0x5a7090, 0x6a4a2a, 0x6a2030, 0x9a7a30, 0x2a2826, 0xc8bea8, 0x4a3060],
    thing: [0x9a6a3a, 0x7a5030, 0x5a3a20, 0xc03050, 0xe0a020, 0x3080a0, 0x80a040, 0xa04080, 0x2a2a2a, 0xd8c8a0],
  }],
  ["1971-01-01", "1979-12-31", {
    top: [[0x4a6a94, PLAIN], [0x7c92aa, PLAIN], [0x6a4428, PLAIN], [0xa8502a, PLAIN], [0xb8902c, PLAIN], [0x56662e, PLAIN], [0xd2c6a2, PLAIN],
      [0xa83a2a, CHECK, 0x2e4a30], [0x8a6a3a, CHECK, 0x3a2a1e], [0x3a5a8a, CHECK, 0xc8b88a], [0xc04a3a, TIE, 0x3a70b0], [0x2e5a3a, PLAIN],
      [0xd0c8b8, STRIPE, 0x8a3a2a], [0x4e6a92, VEST, 0x8a6a40]],
    legs: [0x2e4462, 0x3e5a7e, 0x5a7896, 0x5a3e24, 0x8a7a54, 0x2a2826, 0x6a5a3a, 0x3a4a2a],
    thing: [0x6a4424, 0x9a7a4a, 0xc0a060, 0x4a5030, 0xa02a24, 0x2a4a8a, 0x5a3a28, 0x8a3a1c, 0x2a2826, 0xd0c4a0],
  }],
  ["1980-01-01", "1989-12-31", {
    top: [[0xc8302a, TIE, 0xe0c030], [0x3050b0, TIE, 0x30a050], [0x8040a8, TIE, 0xe06090], [0xe08a20, TIE, 0x2080b0], [0x20a0a0, TIE, 0xd04080],
      [0xc8302a, PLAIN], [0xd8b830, PLAIN], [0x2a50b0, PLAIN], [0x2a9a4a, PLAIN], [0xd04080, PLAIN], [0xdcd8cc, PLAIN], [0x262428, PLAIN],
      [0x3a4a6a, STRIPE, 0xc8c0b0], [0x8a4a2a, STRIPE, 0xd8b070]],
    legs: [0x3a5274, 0x7a90ac, 0x9a8a62, 0x26262a, 0xc8c4b8, 0x7a7a7e, 0x2e4462, 0x5a4a3a],
    thing: [0xb02a2a, 0x2a4a9a, 0x262626, 0xc04a80, 0xe0c030, 0x2a8a4a, 0x8a5a30, 0xd8d0c0, 0x7040a0, 0xe07020],
  }],
  ["1990-01-01", "1995-07-09", {
    top: [[0xb83a6a, TIE, 0x40a0c0], [0x4a3a9a, TIE, 0xe0b030], [0x2a8a5a, TIE, 0xd0602a], [0xd0a030, TIE, 0xa03040], [0xa02a2a, CHECK, 0x1a1a1e],
      [0x2e5a3a, CHECK, 0x1e2a44], [0x3a5a8a, CHECK, 0x22283a], [0x8a6a3a, CHECK, 0x3a2418], [0x1e1e22, PLAIN], [0x3a3a3e, PLAIN], [0x22304a, PLAIN],
      [0x4a1e26, PLAIN], [0xb0a084, PLAIN], [0x4a5a7a, STRIPE, 0xb8b0a0]],
    legs: [0x2e4462, 0x46607e, 0x222226, 0x8a7e5a, 0x4e5434, 0x5a4a38, 0x6a6a6e, 0x3a2a4a],
    thing: [0x1e1e22, 0x4a2a5a, 0x2a4a3a, 0x8a6a3a, 0x5a3a28, 0xa02a2a, 0x2a3a6a, 0xc0a060, 0x6a6a6e, 0xd04a20],
  }],
];
/* Skin, from light to deep, on a figure's face, its neck and hands, and its forearms, shins and scalp where they are bare; and hair,
   black, browns, auburn, blond and grey. */
export const SKIN = [0xe0b896, 0xc89670, 0xab7650, 0x8c5a3a, 0x6c4229, 0x4c2e1c];
export const HAIRS = [0x161210, 0x3a2516, 0x5a3a22, 0x7a5434, 0x8a3a1c, 0xbf9a62, 0x8c8884];
/* How many colours of each a palette holds: tops, legs, hair, skin (a figure's own) and things. */
export const COLOURS = { top: 14, legs: 8, hair: HAIRS.length, self: SKIN.length, thing: 10 };
/* The palette a show on `date` (YYYY-MM-DD) dresses its crowd in, and every colour anyone wears in any era. */
export const dressOn = (date) => (date ? eraOn(DRESS, date) : DRESS[2])[2];
export const CLOTHES = DRESS.flatMap(([, , d]) => [...d.top.flatMap(([hex, , second]) => (second === undefined ? [hex] : [hex, second])), ...d.legs, ...d.thing]);
const SHOE = 0.02;
/* What is held up over the heads, cloth and balloons, is dyed: eight colours a flag or a balloon is, the brightest channel of any
   CLOTH_MOST of full light, so that from the hill each reads as a patch of colour over the heads, lit by the crowd's own light as
   the figures are. Each figure that holds something up holds it
   in one of them (its `colour.cloth`, which people deals so that no two such within DYED m share one), and its second and third in
   the dyes three and five on from that. A figure carries its dye in aTone.w over its things' tone, DYE times it: a float, which
   holds every whole number to 2^24 exactly, and the most it holds is the last dye over the brightest tone, DYE - 1 + 7 DYE, which
   is 2^24 - 1 exactly. A ninth dye, or a tone of more than 128 levels a channel, would not fit. */
export const CLOTHS = [0xa8281e, 0xb07a12, 0x2a5fa0, 0x2f8a3c, 0x7a3a98, 0x178a86, 0xa82a6a, 0xb85a18];
export const CLOTH_MOST = 0.5, DYE = 128 ** 3, DYED = 6;
/* A colour as one number a figure can carry: each channel's light as 0 to 127 on a square-root scale up to MOST, the red in the
   ones, the green in the 128s and the blue in the 16384s. */
const shade = new THREE.Color();
export function tone(hex, most = MOST) {
  shade.setHex(hex);
  const n = (c) => Math.min(127, Math.round(127 * Math.sqrt(c / most)));
  return n(shade.r) + 128 * n(shade.g) + 16384 * n(shade.b);
}

/* How much of a patterned top its second colour covers on the whole (DRESS_LOOK), so what colour the top is from far off. */
export const COVER = { [PATTERN.TIE]: 0.5, [PATTERN.STRIPE]: 0.5, [PATTERN.CHECK]: 0.5, [PATTERN.VEST]: 0.85, [PATTERN.PRINT]: 0.2 };
/* The luminance of a colour as the crowd draws it (tone), and of a top on the whole. */
export const lightOf = (hex, most = MOST) => {
  const q = tone(hex, most), red = (q % 128) / 127, green = (Math.floor(q / 128) % 128) / 127, blue = Math.floor(q / 16384) / 127;
  return most * (0.2126 * red * red + 0.7152 * green * green + 0.0722 * blue * blue);
};
export const topLight = (/** @type {number[]} */ [shirt, pattern, second]) => (second === undefined ? lightOf(shirt) : (1 - COVER[pattern]) * lightOf(shirt) + COVER[pattern] * lightOf(second));
/* Whose colour a face of a figure shows (SOURCES), by its tint and the figure's cut (CUT), as TONE has it: its top's, its legs', its
   hair's, its skin's, its things' or a shoe's near black; and -1 for what is held up over the heads, which is no part of the figure
   (CLOTH). */
export const SOURCES = ["top", "legs", "hair", "self", "thing", "shoe"];
const SOURCE = Object.fromEntries(SOURCES.map((name, k) => [name, k]));
export function sourceOf(tint, cut) {
  const cuts = (bit) => (cut & bit) !== 0;
  return tint === TINT.TOP ? SOURCE.top : tint === TINT.LEGS ? SOURCE.legs : tint === TINT.HAIR ? SOURCE.hair : tint === TINT.SELF ? SOURCE.self
    : tint === TINT.THING ? SOURCE.thing : tint === TINT.SHIN ? (cuts(CUT.SHORTS) ? SOURCE.self : SOURCE.legs)
    : tint === TINT.FOREARM ? (cuts(CUT.BARE) ? SOURCE.self : SOURCE.top) : tint === TINT.SKIRT ? (cuts(CUT.TUNIC) ? SOURCE.top : SOURCE.legs)
    : tint === TINT.SCALP ? (cuts(CUT.BALD) ? SOURCE.self : SOURCE.hair) : tint === TINT.SHOE ? SOURCE.shoe : -1;
}
/* How much of a figure the eye sees in each colour from each side, as SOURCES lists them: for each of DRAWN_VIEWS, the share of its
   pixels each fills at rest, DRAWN pixels to a unit, which keeps them inside the bounds 30 did, for under half the pixels
   (crowd.test.ts). The views span every way an eye looks at a figure, in the figure's own frame, its own height and breadth taken
   out: from the stage, 0.29 rad under its middle to 0.12 over, the only eye that looks up at one, and from where the stage is round
   it; from the hill (TEST_POSES.crowd), 0.33 to 0.62 over; and from each camera the shoot takes, first and third person on every
   tier, 0.25 to 1.11 over, the most from a phone's boom over a figure 10 m off. Rings of them go round it every 0.4 rad from level
   to 1.2 over, four round it on the two lowest and fewer higher up, where the turns draw together (DRAWN_RINGS), so that no two
   neighbours on a ring stand further apart than the level ring's; and one 0.4 under, toward the stage. Each ring turns from the
   stage's bearing round the figure (`stage`, stageTurn), for a figure that sits in a gathering faces any way. So every eye stands
   between views, the stage's 0.11 rad inside the lowest and the steepest camera's 0.09 inside the highest: a figure seen past the
   views, under the level ones from the stage and over the steepest from the hill, was where the rule below failed (crowd.test.ts).
   It is drawn from its tier's own geometry (`kit`, buildCrowd's, of pieces): its body and each part it wears (`parts`) in the
   form it wears it (`forms`) but the thin black poles it holds up or stands by (UNDRAWN), each face in the colour its tint takes
   for its cut (`cut`, sourceOf), and only the faces turned to the eye and, at each pixel, the nearest.
   Each corner stands where the vertex shader stands it before it moves (DANCE, standerOf), by the figure's own numbers
   (`shape`, aCut, and `body`, aBody): its hair's length, its tails', its crown's and its brim's, an afro's puff and its head's size;
   its belly, its shoulders, its legs' girth and length; a shawl's hem raised, flared trousers flared, and a skirt's knee and hem
   where its own number sets them; and, for one that sits (`seat`, the way it sits, SITS), its hips down, its knees and feet where
   that way of sitting puts them (SIT_POSE), the knees out to the sides and the shins crossed as it does, and its body leaning as it
   does from the hips, its forearms resting as that way of sitting rests them. Standing, its arms hang; and how it stands, what it
   holds and how it moves are left out: drawnOf is for how much of it shows in each colour, and the unit tests hold that to the
   figures as the shader draws them (crowd.test.ts). Each view is [turn, tilt]: turned `turn` rad round it from the stage's bearing,
   and looking down `tilt` rad. Each ring is [tilt, how many views round it]. It draws DRAWN_VIEWS, or as many other views as
   those (`looks`), as the unit tests draw a figure from where an eye stands. */
export const DRAWN = 20, DRAWN_RINGS = [[0, 4], [0.4, 4], [0.8, 2], [1.2, 1]];
export const DRAWN_VIEWS = [[0, -0.4], ...DRAWN_RINGS.flatMap(([tilt, turns]) => Array.from({ length: turns }, (_, k) => [(2 * Math.PI * k) / turns, tilt]))];
/* The stage's bearing round a figure that stands at (x, z) turned `turn` (aSize.z): the turn from before it of the way to the stage. */
export const stageTurn = (x, z, turn) => {
  const dx = STAGE[0] - x, dz = STAGE[1] - z, c = Math.cos(turn), s = Math.sin(turn);
  return Math.atan2(c * dx - s * dz, s * dx + c * dz);
};
/* The parts drawnOf leaves out: the pole a figure holds a flag, a pennant, a star or a parasol up on, and a taper's stand. Black and
   thin, a pole fills a tenth or more of a television's figure drawn finely and a twentieth of a desktop's, and the eye's test, which
   draws a figure 40 pixels across with what it holds, catches it from some sides and misses it on others (crowd.test.ts); so the
   rule below asks a figure's own colours to stand it apart, and never leans on a stick's black. */
export const UNDRAWN = PART.POLE | PART.STAND;
const DRAWN_X = 0.9, DRAWN_LOW = -0.4, DRAWN_HIGH = 3, DRAWN_ACROSS = Math.ceil(2 * DRAWN_X * DRAWN), DRAWN_UP = Math.ceil((DRAWN_HIGH - DRAWN_LOW) * DRAWN);
const DRAWN_CELLS = DRAWN_ACROSS * DRAWN_UP, drawnDepth = new Float32Array(DRAWN_VIEWS.length * DRAWN_CELLS), drawnWhose = new Int8Array(DRAWN_VIEWS.length * DRAWN_CELLS);
let drawnStood = new Float32Array(0), drawnSeen = new Float32Array(0);
/* Clear between figures: each call clears the cells it drew on as it counts them. */
drawnDepth.fill(Infinity); drawnWhose.fill(-1);
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
/* Where the vertex shader stands each corner of a figure at rest (DANCE), by the figure's own numbers, as drawnOf draws it: a
   function that puts corner `k` of a piece of its tier's figure (`kit`'s), of part `bit` in form `form`, in `out`. */
/** @param {{ parts: number, cut: number, shape: number[] | Float32Array, body: number[] | Float32Array, seat?: string | null }} figure */
export function standerOf({ parts, cut, shape: [hair, hem, crown, brim], body: [girth, wide, leg, big], seat = null }) {
  const shawl = (cut & CUT.SHAWL) !== 0, bells = (cut & CUT.BELLS) !== 0, afro = (cut & CUT.AFRO) !== 0, mid = hem < 0.5 ? 0.5 : 0.5 * (1 + hem);
  const shortLegs = (cut & CUT.SHORTS) !== 0, shortSleeves = (cut & CUT.BARE) !== 0;
  const up = LEG * leg - LEG, thick = 1 + 0.5 * (girth - 1), legL = LEG * leg;
  /* Seated: the hip, the knee and the foot, forward (z) and up (y), as the shader solves them, and how far the knee goes out. */
  const sat = seat && SIT_POSE[seat], lower = sat ? legL - sat.hip - 0.044 * Math.max(girth - 1, 0) : 0, hipY = legL - lower;
  const span = sat ? Math.max(Math.hypot(sat.foot, FOOT[1] - hipY), 1e-4) : 1, alongZ = sat ? sat.foot / span : 0, alongY = sat ? (FOOT[1] - hipY) / span : -1;
  const halfway = 0.5 * Math.min(span, legL - 1e-3), bowed = Math.sqrt(Math.max(0.25 * legL * legL - halfway * halfway, 0));
  const outward = sat ? bowed * Math.sin(sat.splay) : 0, bow = sat ? bowed * Math.cos(sat.splay) : 0;
  const kneeZ = alongZ * halfway - alongY * bow, kneeY = hipY + alongY * halfway + alongZ * bow, footZ = alongZ * Math.min(span, legL), footY = hipY + alongY * Math.min(span, legL);
  const thighL = Math.max(Math.hypot(kneeZ, kneeY - hipY), 1e-5), shinL = Math.max(Math.hypot(footZ - kneeZ, footY - kneeY), 1e-5);
  const thighZ = -(kneeY - hipY) / thighL, thighY = kneeZ / thighL, shinZ = -(footY - kneeY) / shinL, shinY = (footZ - kneeZ) / shinL;
  const mitre = Math.max(thighZ * (thighZ + shinZ) + thighY * (thighY + shinY), 0.4), pitch = sat ? sat.pitch : 0;
  return (piece, k, bit, form, out) => {
    let x = piece.position[3 * k], y = piece.position[3 * k + 1], z = piece.position[3 * k + 2];
    const rig = piece.mark[4 * k], weight = piece.mark[4 * k + 3];
    if (rig === RIG.HEAD) {
      if (bit === PART.HAIR) y = HAIR_TOP - (HAIR_TOP - y) * (form === FORM.HAIR.dreads ? 1 + (hair - 1) * weight : hair);
      if (bit === PART.TAIL || bit === PART.TAIL2) {
        y = TAIL_TOP - (TAIL_TOP - y) * Math.min(hair, 1.5);
        if ((parts & PART.TAIL2) === 0) { x = (x - TAIL_X) * 1.6; y += 0.07; }
      }
      if (bit === PART.CROWN) y = CROWN_FOOT + (y - CROWN_FOOT) * crown;
      if (bit === PART.BRIM) { const rim = x * x + z * z > 0.01 ? 1 : 0; x *= brim; z *= brim; y -= rim * 0.22 * Math.max(brim - 1.2, 0); }
      if (afro && weight > 0) { const puff = 1 + AFRO * hair * weight; x *= puff; z *= puff; y = HEAD_Y + (y - HEAD_Y) * puff; }
      x *= big; z *= big; y = NECK_Y + (y - NECK_Y) * big;
    }
    const core = rig === RIG.BODY && bit === 0;
    if (core || bit === PART.SKIRT || bit === PART.PONCHO) {
      const belly = (girth - 1) * clamp01(1 - Math.abs(y - 1.02) / 0.4);
      if (bit !== PART.PONCHO) x *= 1 + belly;
      z *= 1 + belly * (z < 0 ? 0.35 : bit === PART.PONCHO ? 0.5 : 1.5);
    }
    if (core || bit === PART.HOOD) { const t = clamp01((y - 1.2) / (SHOULDER_Y - 1.2)); x *= 1 + (wide - 1) * t * t * (3 - 2 * t); }
    if (bit === PART.PONCHO && shawl) y = 1.43 - (1.43 - y) * (1 - 0.58 * weight);
    /* Which side it is on as built (the shader's legSide). */
    const side = x > 0 ? 1 : -1;
    if (rig === RIG.LEG || rig === RIG.FOOT) {
      const flare = rig === RIG.LEG && shortLegs && Math.abs(y - SHORTS_HEM) < 0.001 ? OPEN.shorts
        : rig === RIG.LEG && shortLegs && y < 0.001 ? OPEN.ankle : rig === RIG.LEG && bells ? 1 + 0.9 * clamp01(1 - y / (LEG / 2)) : 1;
      x = side * HIP_X * (0.5 + 0.5 * thick) + (x - side * HIP_X) * (rig === RIG.LEG ? thick * flare : 1);
      if (rig === RIG.LEG) { z *= thick * flare; y *= leg; }
    }
    if (rig === RIG.SKIRT) {
      if (y < 0.2) { const flare = 0.62 + (0.38 * (1 - hem)) / 0.907; x *= flare; z *= flare; y = hem * LEG; }
      else if (y < 0.6) { const full = 0.62 + 0.38 * clamp01((1 - mid) / 0.5); x *= full; z *= full; y = mid * LEG; }
      if (form === FORM.SKIRT.coat && y < LEG - 0.001) { x *= thick; z *= thick; }
      y = y > LEG - 0.001 ? y + up : y * leg;
    } else if (rig !== RIG.LEG && rig !== RIG.FOOT && rig !== RIG.GROUND) y += up;
    if (rig === RIG.ARM_L || rig === RIG.ARM_R) {
      const side = rig === RIG.ARM_R ? 1 : -1;
      if (shortSleeves && bit === 0 && Math.abs(y - up - SHOULDER_Y + SLEEVE_HEM) < 0.001) { x = side * SHOULDER_X + (x - side * SHOULDER_X) * OPEN.sleeve; z *= OPEN.sleeve; }
      if (!sat) x += side * SHOULDER_X * (wide - 1);
      else {
        /* Seated, its forearm on its knee: turned out at the shoulder, forward, and bent at the elbow toward its middle, as DANCE
           rests it. */
        const [lift, fore, bend, inward] = sat.arms;
        let px = x - side * SHOULDER_X, py = y - SHOULDER_Y - up, pz = z;
        const below = -py - ELBOW;
        if (below > -0.001 && bend > 0) {
          const ix = -side * Math.sin(1.5708 * inward), iz = Math.cos(1.5708 * inward), along = px * ix + pz * iz, cb = Math.cos(bend), sb = Math.sin(bend);
          const along2 = below > 0.001 ? below * sb + along * cb : along, below2 = below > 0.001 ? below * cb - along * sb : -along * Math.min(Math.tan(0.5 * bend), 1.2);
          px += (along2 - along) * ix; pz += (along2 - along) * iz; py = -ELBOW - below2;
        }
        const qz = pz * Math.cos(fore) - py * Math.sin(fore), qy = pz * Math.sin(fore) + py * Math.cos(fore), cl = Math.cos(side * lift), sl = Math.sin(side * lift);
        x = side * SHOULDER_X * wide + cl * px - sl * qy; y = SHOULDER_Y + up + sl * px + cl * qy; z = qz;
      }
    }
    if (sat && (rig === RIG.LEG || rig === RIG.FOOT || (rig === RIG.SKIRT && y < legL + 0.001))) {
      const sideL = side, t = clamp01(y / legL);
      if (rig === RIG.FOOT) {
        const middle = sideL * HIP_X * (0.75 + 0.25 * girth), about = Math.PI * sat.kneel, cu = Math.cos(about), su = Math.sin(about), mx = x - middle;
        x = middle + cu * mx + su * z; z = cu * z - su * mx;
        z += footZ; y += footY; x -= sideL * sat.cross;
      } else {
        let overZ = t > 0.51 ? thighZ : t < 0.49 ? shinZ : (thighZ + shinZ) / mitre, overY = t > 0.51 ? thighY : t < 0.49 ? shinY : (thighY + shinY) / mitre;
        if (t < 0.01 && rig === RIG.LEG) { overZ = 1; overY = 0; }
        const atZ = t > 0.5 ? kneeZ + (0 - kneeZ) * (2 * t - 1) : footZ + (kneeZ - footZ) * 2 * t, atY = t > 0.5 ? kneeY + (hipY - kneeY) * (2 * t - 1) : footY + (kneeY - footY) * 2 * t;
        const deep = rig === RIG.SKIRT ? z * (1 - (form === FORM.SKIRT.coat ? COAT_SAT[z > 0 ? 0 : 1] : 0.45)) : z;
        z = atZ + deep * overZ; y = atY + deep * overY;
        const spread = rig === RIG.SKIRT ? Math.min(Math.abs(x) / HIP_X, 1) * (form === FORM.SKIRT.coat ? 1 : 1 - 0.5 * clamp01((Math.abs(x) - HIP_X) / (SKIRT_X - HIP_X))) : 1;
        x += (x > 0 ? 1 : -1) * spread * outward * (t > 0.5 ? 2 - 2 * t : 2 * t);
        x += -sideL * sat.cross * Math.max(1 - 2 * t, 0);
      }
    } else if (sat && rig !== RIG.GROUND) {
      y -= lower;
      const py = y - hipY;
      y = hipY + py * Math.cos(pitch) - z * Math.sin(pitch); z = z * Math.cos(pitch) + py * Math.sin(pitch);
    }
    out[0] = x; out[1] = y; out[2] = z;
  };
}
/** @param {Map<string, { position: Float32Array, mark: Float32Array, index: number[], tints: Int8Array }>} kit
    @param {{ parts: number, forms?: Record<number, number>, cut: number, shape: number[] | Float32Array, body: number[] | Float32Array, seat?: string | null, stage?: number }} figure
    @param {number[][]} [looks] */
export function drawnOf(kit, figure, looks = DRAWN_VIEWS) {
  if (looks.length > DRAWN_VIEWS.length) throw new Error(`drawnOf draws at most ${DRAWN_VIEWS.length} views`);
  const { parts, forms = {}, cut, stage = 0 } = figure, stand = standerOf(figure), tri = [[0, 0, 0]];
  const worn = [[0, 0], ...Object.values(PART).filter((bit) => (parts & bit) !== 0 && (bit & UNDRAWN) === 0).map((bit) => [bit, forms[bit] ?? 0])];
  /* Whose colour each tint takes for this figure's cut, worked out once for the figure and not once a face for each view. */
  const whoseTint = Int8Array.from({ length: TINTS }, (_, tint) => sourceOf(tint, cut));
  const views = looks.map(([turn, tilt]) => ({ c: Math.cos(stage + turn), s: Math.sin(stage + turn), lean: Math.sin(tilt), level: Math.cos(tilt) }));
  /* The box, in every view, round the faces drawn: only it is counted and cleared after, not the whole of each view. */
  let low = DRAWN_UP, high = -1, left = DRAWN_ACROSS, right = -1;
  for (const [bit, form] of worn) {
    const piece = kit.get(`${bit} ${form}`);
    if (!piece) continue;
    /* Each corner of the piece once, where the shader stands it, and then as each view sees it: across, up the view and away. */
    const corners = piece.position.length / 3;
    if (drawnStood.length < 3 * corners) { drawnStood = new Float32Array(3 * corners); drawnSeen = new Float32Array(3 * corners); }
    for (let k = 0; k < corners; k++) { stand(piece, k, bit, form, tri[0]); drawnStood.set(tri[0], 3 * k); }
    views.forEach(({ c, s, lean, level }, view) => {
      for (let k = 0; k < corners; k++) {
        const x = c * drawnStood[3 * k] - s * drawnStood[3 * k + 2], y = drawnStood[3 * k + 1], z = s * drawnStood[3 * k] + c * drawnStood[3 * k + 2];
        drawnSeen[3 * k] = (x + DRAWN_X) * DRAWN; drawnSeen[3 * k + 1] = (y * level - z * lean - DRAWN_LOW) * DRAWN; drawnSeen[3 * k + 2] = -y * lean - z * level;
      }
      const depth = drawnDepth.subarray(view * DRAWN_CELLS, (view + 1) * DRAWN_CELLS), whoseAt = drawnWhose.subarray(view * DRAWN_CELLS, (view + 1) * DRAWN_CELLS);
      for (let t = 0; t < piece.index.length; t += 3) {
        const whose = whoseTint[piece.tints[t / 3]];
        if (whose < 0) continue;
        const ia = 3 * piece.index[t], ib = 3 * piece.index[t + 1], ic = 3 * piece.index[t + 2];
        const ax = drawnSeen[ia], ay = drawnSeen[ia + 1], az = drawnSeen[ia + 2], bx = drawnSeen[ib], by = drawnSeen[ib + 1], bz = drawnSeen[ib + 2];
        const cx = drawnSeen[ic], cy = drawnSeen[ic + 1], cz = drawnSeen[ic + 2];
        /* Turned to the eye: its corners go round anticlockwise as the eye sees them, the side three draws. A pixel's middle is in it
           where it lies on the inner side of each of its edges, which steps by a constant along a row. */
        const whole = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (whole <= 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(DRAWN_ACROSS - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(DRAWN_UP - 1, Math.ceil(Math.max(ay, by, cy)));
        low = Math.min(low, y0); high = Math.max(high, y1); left = Math.min(left, x0); right = Math.max(right, x1);
        const ux = (cy - by) / whole, vx = (ay - cy) / whole;
        for (let py = y0; py <= y1; py++) {
          let u = ((cx - bx) * (py + 0.5 - by) - (cy - by) * (x0 + 0.5 - bx)) / whole, v = ((ax - cx) * (py + 0.5 - cy) - (ay - cy) * (x0 + 0.5 - cx)) / whole;
          /* A row crosses the face once: past its far edge, nothing more of the row is in it. */
          for (let px = x0, inside = false; px <= x1; px++, u -= ux, v -= vx) {
            const w = 1 - u - v;
            if (u < 0 || v < 0 || w < 0) { if (inside) break; continue; }
            inside = true;
            const d = u * az + v * bz + w * cz, at = py * DRAWN_ACROSS + px;
            if (d < depth[at]) { depth[at] = d; whoseAt[at] = whose; }
          }
        }
      }
    });
  }
  return views.map((_, view) => {
    const sums = SOURCES.map(() => 0);
    for (let row = low; row <= high; row++) {
      for (let at = view * DRAWN_CELLS + row * DRAWN_ACROSS + left, end = at + right - left; at <= end; at++) {
        if (drawnWhose[at] >= 0) { sums[drawnWhose[at]] += 1; drawnWhose[at] = -1; drawnDepth[at] = Infinity; }
      }
    }
    const all = sums.reduce((sum, n) => sum + n, 0);
    return sums.map((n) => n / all);
  });
}
/* Which of its era's colours a person wears (`dress`, an era's palette, DRESS): its top's, its legs' and its things', as indices into
   the palette's lists. From every side the eye sees it (`drawn`, drawnOf's shares for each of DRAWN_VIEWS), the lightest quarter of
   it stands APART times lighter than the darkest quarter (apartOf), so that on any ground the one end of it or the other stands off
   it: a quarter, more than twice the tenth the eye's test takes (crowd.test.ts), so that the light, which falls on some faces of a
   colour more than on others, and a side the views fall between leave that tenth inside it. Where the colours it was dealt do that,
   it wears them; else one of them gives, the first of its legs, its things and its top that can: it takes the next of its era's on
   from the one it was dealt with which every side does. Where no one can, two give, the first two of those that can, each the
   nearest on from its own. Where no colours of its era can, as where one colour covers most of it, it wears those that bring its
   lightest fifth that far apart from its darkest in the same way, and where none can, its lightest tenth, as much as the eye's test
   takes (ENDS), as for one reclining in a long skirt, seen level from the stage's side over four fifths skirt. Below the quarter a
   figure is a hard one, and it takes its era's best, not the colours it was dealt nor the first that scrape through: of all that
   bring that end apart from every side, those that bring the end above it apart from the most sides, and of those the ones that
   stand farthest apart at its own end from the side they do least from; the first that scraped through stood under the eye's bar
   from the hill or the stage, where the best stood well over it (crowd.test.ts). And where none do even the tenth, as from steeply
   over one in a hat and a poncho, which show one colour, those that bring its tenth apart from the most sides, and of those the
   ones that stand farthest apart from the side they do least from. Its skin, its hair and a shoe's
   black never give. A top gives to no colour that a figure within CLOSE m wears in the same top (`worn`), so that none is dressed
   like one that close (people), unless only such a colour can. */
export const APART = 3, ENDS = [0.25, 0.2, 0.1];
const GIVES = ["legs", "thing", "top"];
/* How many times lighter the lightest `ends` of a figure is than its darkest, seen as `shares` (a view of drawnOf) shows it, with
   each of SOURCES as light as `lights` has it: the colour at which, from the lightest, that share of it is reached, over the one at
   which it is from the darkest. */
export function apartOf(shares, lights, ends = ENDS[ENDS.length - 1]) {
  const order = SOURCES.map((_, k) => k).filter((k) => shares[k] > 0).sort((p, q) => lights[p] - lights[q]);
  const end = (list) => { let sum = 0; for (const k of list) if ((sum += shares[k]) >= ends - 1e-9) return lights[k]; return lights[list[list.length - 1]]; };
  return end([...order].reverse()) / end(order);
}
export function dressFor(dress, person, drawn, worn = new Set()) {
  const colour = person.colour, dealt = { top: colour.top, legs: colour.legs, thing: colour.thing };
  const own = { self: lightOf(SKIN[colour.self]), hair: lightOf(HAIRS[colour.hair]), shoe: SHOE };
  const lightsOf = (chosen) => SOURCES.map((name) => (name in own ? own[name] : name === "top" ? topLight(dress.top[chosen.top]) : lightOf(dress[name][chosen[name]])));
  /* How many sides a choice stands apart from at `ends`, and how far apart it stands at `least` from the side it does least from. */
  const score = (chosen, ends, least = ends) => {
    const lights = lightsOf(chosen);
    return [drawn.filter((shares) => apartOf(shares, lights, ends) >= APART).length, Math.min(...drawn.map((shares) => apartOf(shares, lights, least)))];
  };
  const better = (p, q) => p[0] > q[0] || (p[0] === q[0] && p[1] > q[1]);
  /* Each colour a giver may take, the nearest on from its own first, and for a top those that close by wear last. */
  const waysOf = (gives) => {
    const count = dress[gives].length, ways = [...Array(count).keys()].map((step) => (dealt[gives] + step) % count), skip = gives === "top" ? worn : new Set();
    return [...ways.filter((k) => !skip.has(k)), ...ways.filter((k) => skip.has(k))];
  };
  const givers = GIVES.filter((gives) => drawn.some((shares) => shares[SOURCES.indexOf(gives)] > 0));
  const tries = [[], ...givers.map((gives) => [gives]), ...givers.flatMap((one, k) => givers.slice(k + 1).map((two) => [one, two]))];
  /* Each choice in turn, until `visit` takes one: at the first of ENDS, the first that stands apart from every side, a side it fails
     ending its trial; at each after it, the best of those that do; and failing that, the best at the last of them. */
  const eachChoice = (visit) => {
    for (const [one, two] of tries) for (const k of one ? waysOf(one) : [null]) for (const q of two ? waysOf(two) : [null]) {
      if (visit({ ...dealt, ...(one ? { [one]: k } : {}), ...(two ? { [two]: q } : {}) })) return true;
    }
    return false;
  };
  const apart = (chosen, ends) => { const lights = lightsOf(chosen); return drawn.every((shares) => apartOf(shares, lights, ends) >= APART); };
  let taken = dealt;
  if (eachChoice((chosen) => { if (!apart(chosen, ENDS[0])) return false; taken = chosen; return true; })) return taken;
  for (let k = 1; k < ENDS.length; k++) {
    let pick = null, most = null;
    eachChoice((chosen) => {
      if (!apart(chosen, ENDS[k])) return false;
      const got = score(chosen, ENDS[k - 1], ENDS[k]);
      if (!most || better(got, most)) { pick = chosen; most = got; }
      return false;
    });
    if (pick) return pick;
  }
  let best = dealt, most = null;
  eachChoice((chosen) => { const got = score(chosen, ENDS[ENDS.length - 1]); if (!most || better(got, most)) { best = chosen; most = got; } return false; });
  return best;
}

/* A figure's own seed for its top's pattern, 0 to SEEDS - 1, from its place in the seats' order: the turn of a tie-dye's spiral. */
export const seedOf = (i) => Math.imul(i + 1, 0x9e3779b1) >>> 24;

/* What a figure can be, each list a choice made on its own with these weights, so the people there can be are the product of the
   lists and not their sum. */
export const CHOICES = {
  stature: [["child", 6], ["teen", 4], ["short", 22], ["mid", 43], ["tall", 25]],
  build: [["slight", 22], ["average", 32], ["stout", 16], ["broad", 14], ["pear", 16]],
  legs: [["jeans", 28], ["bells", 20], ["shorts", 14], ["maxi", 14], ["dress", 12], ["tunic", 12]],
  top: [["shirt", 38], ["tee", 30], ["poncho", 16], ["shawl", 16]],
  hair: [["bald", 6], ["crop", 15], ["bob", 7], ["long", 18], ["mane", 9], ["tail", 11], ["braids", 9], ["afro", 10], ["dreads", 8], ["bun", 7]],
  head: [["none", 32], ["hat", 8], ["topper", 4], ["floppy", 8], ["cap", 7], ["bandana", 6], ["band", 5], ["wreath", 4], ["knit", 8], ["jester", 4], ["plumed", 5],
    ["flowers", 6]],
  back: [["none", 66], ["pack", 17], ["roll", 8], ["both", 9]],
  move: [["bob", 24], ["sway", 19], ["wave", 7], ["spin", 6], ["nod", 12], ["clap", 6], ["watch", 15], ["shift", 11]],
};
/* One who sits low on the hill is no part of the crowd's skyline, and wears its hair and its head as the crowd did before it had one:
   bare-headed as often, and nothing that stands up from the head (person). */
const SEATED_CHOICES = {
  hair: [["bald", 7], ["crop", 18], ["bob", 8], ["long", 22], ["mane", 11], ["tail", 13], ["braids", 11], ["afro", 10]],
  head: [["none", 54], ["hat", 9], ["topper", 3], ["floppy", 8], ["cap", 9], ["bandana", 7], ["band", 5], ["wreath", 5]],
};
/* What some carry, one figure in PROP_EVERY taking the next of these in turn, so there are a few of each across the hill; and those
   of them that stand over a head, which no one in the way of a test pose's view of the band carries (inView). What flies from a
   straight pole (FLIES) and what stands on one leaning in over the head (STANDS_ON) keep clear of what the head wears (person). */
export const PROPS = ["flag", "parasol", "balloon", "aloft", "stand", "puppet", "swallowtail", "finger", "rider", "star", "pennant", "bunch", "hoop", "moon",
  "streamer", "tambourine", "rider", "drum"], PROP_EVERY = 3;
export const OVERHEAD = PROPS.filter((prop) => !["finger", "hoop", "drum"].includes(prop));
const FLIES = ["flag", "swallowtail", "pennant", "streamer"], STANDS_ON = ["star", "moon", "parasol", "puppet"], BALLOONS = ["balloon", "bunch"];
/* What is cloth or a balloon held up over the head, dyed one of CLOTHS. */
export const DYED_PROPS = [...FLIES, ...STANDS_ON, ...BALLOONS];
/* The one way of moving each of these props leaves its holder (person); any other prop leaves it to sway or to watch. */
const MOVES_HOLDING = { stand: ["watch"], rider: ["sway"], hoop: ["sway"], drum: ["bob"] };
/* What makes a figure's outline, which no two figures of a crowd share (people). */
export const OUTLINE = ["stature", "build", "legs", "top", "hair", "beard", "head", "back", "prop"];
/* A person as a plain figure shows them: without what its geometry leaves out, a wreath or flowers a band, braids one tail, a bedroll
   a pack. A child on the shoulders stays, for it is what stands up on a phone. */
export function plainly(p) {
  return { ...p, head: p.head === "wreath" || p.head === "flowers" ? "band" : p.head, hair: p.hair === "braids" ? "tail" : p.hair, beard: false,
    back: p.back === "none" ? "none" : "pack", prop: ["hoop", "drum"].includes(p.prop) ? "none" : p.prop };
}
export const outlineOf = (p) => OUTLINE.map((slot) => p[slot]).join(" ");
/* What rises over a figure's shoulders, its crest: what it wears on its head, its hair, what it holds up (a hoop and a drum are held
   low) and its stature. No two figures within CREST m of each other share one, on a desktop or as a phone draws them (people). */
export const CREST = 8;
export const crestOf = (p) => `${p.head} ${p.hair} ${p.prop === "hoop" || p.prop === "drum" ? "none" : p.prop} ${p.stature}`;

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
   holds decides some of the rest: a child rides on bare shoulders; what flies from a pole flies over no crown, big round head of hair
   or bun, and what stands on a pole leaning in over the head over no dreadlocks either; a balloon goes up over no big round head of
   hair, bun or tall knit cap, and its string past no brim, jester's point or flowers; the one with a hoop or beside a stand wears
   nothing it would catch on; and whoever turns on the spot mostly wears a skirt to flare. A bun wears no hat, and a child no top hat,
   jester's cap or plume. What stands up from the head is for those who stand, the crowd's skyline: one seated low on the hill wears
   its hair and its head as the crowd did before (SEATED_CHOICES), so its body can still lean back or lie back on a blanket (stances). */
function person(r, sits, prop, stature) {
  const p = { prop, stature };
  const child = p.stature === "child", small = child || p.stature === "teen";
  p.build = child ? choose(r, only(CHOICES.build, ["slight", "average"])) : choose(r, CHOICES.build);
  p.move = MOVES_HOLDING[prop]?.[0] ?? (prop !== "none" ? choose(r, only(CHOICES.move, ["sway", "watch"]))
    : sits ? choose(r, only(CHOICES.move, ["bob", "sway", "nod", "watch"]))
    : child ? choose(r, only(CHOICES.move, ["bob", "wave", "spin", "clap"])) : choose(r, CHOICES.move));
  p.legs = p.move === "spin" && r() < 0.85 ? choose(r, only(CHOICES.legs, ["maxi", "dress"]))
    : prop === "stand" ? choose(r, without(CHOICES.legs, ["maxi"])) : choose(r, CHOICES.legs);
  p.top = prop === "hoop" || prop === "drum" || prop === "stand" ? choose(r, only(CHOICES.top, ["shirt", "tee"])) : choose(r, CHOICES.top);
  const hairs = sits ? SEATED_CHOICES.hair : CHOICES.hair, heads = sits ? SEATED_CHOICES.head : CHOICES.head;
  const kept = (list) => (child ? without(list, ["bald", "topper", "jester", "plumed"]) : list);
  p.hair = prop === "rider" ? choose(r, only(hairs, ["bald", "crop", "bob"])) : FLIES.includes(prop) || BALLOONS.includes(prop) ? choose(r, kept(without(hairs, ["afro", "bun"])))
    : STANDS_ON.includes(prop) ? choose(r, without(hairs, ["afro", "dreads", "bun"])) : choose(r, kept(hairs));
  p.head = p.hair === "afro" ? "none" : prop === "rider" ? choose(r, only(heads, ["none", "bandana", "band"]))
    : FLIES.includes(prop) || STANDS_ON.includes(prop) || p.hair === "bun" ? choose(r, only(heads, ["none", "bandana", "band", "wreath", "flowers"]))
    : BALLOONS.includes(prop) ? choose(r, kept(without(heads, ["hat", "topper", "floppy", "plumed", "jester", "flowers", "knit"]))) : choose(r, kept(heads));
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
  /* One who holds something up over the heads stands up straight under it, its top a figure's height over its hips. */
  if (OVERHEAD.includes(prop)) p.stoop = Math.min(p.stoop, 0.02);
  /* How far it dances (aWear.w): a third of the crowd only a little, a quarter to a half as far as the rest. */
  const most = r();
  p.size = most < QUIET ? 0.25 + 0.25 * most / QUIET : 0.62 + 0.38 * (most - QUIET) / (1 - QUIET);
  p.akimbo = r() < 0.6;
  p.hairLength = { bob: span(0.72, 0.82), long: span(0.95, 1.25), mane: span(1.55, 2.05), tail: span(0.8, 1.4), braids: span(0.9, 1.4), dreads: span(0.9, 1.5),
    bun: span(0.9, 1.3), afro: span(0.8, 1.3) }[p.hair] ?? 1;
  p.hem = { maxi: span(0.093, 0.18), dress: span(0.42, 0.56), tunic: span(0.62, 0.72) }[p.legs] ?? 0.093;
  [p.crown, p.brim] = { hat: [span(1, 1.25), span(0.95, 1.1)], topper: [span(2.3, 2.7), span(0.72, 0.8)], floppy: [span(1, 1.1), span(1.3, 1.45)],
    knit: [span(0.85, 1.3), 1], jester: [span(0.95, 1.1), 1], plumed: [span(1, 1.2), span(0.95, 1.1)] }[p.head] ?? [1, 1];
  p.colour = Object.fromEntries(Object.entries(COLOURS).map(([name, many]) => [name, Math.floor(r() * many)]));
  return p;
}
/* What some of a show's crowd wear besides, as its era does (WARDROBE, by eraOn, the 1980s' where no date is given): of the grown
   ones in a shirt over trousers, flares or shorts with nothing at the hips, a share in a coat whose tail hangs below the waist, to a
   hem of its own; of the rest in a shirt or a tee whose hair is short or up, with nothing rolled on its back or a child on its
   shoulders, a share with a hood down behind the neck; and of those in a poncho or a shawl, a share with a fringe on it. Each
   figure draws from a stream of its own, so whom people() deals is as it was. */
export const WARDROBE = [
  ["1965-06-01", "1970-12-31", { coat: 0.2, hood: 0, fringe: 0.7 }],
  ["1971-01-01", "1979-12-31", { coat: 0.4, hood: 0, fringe: 0.35 }],
  ["1980-01-01", "1989-12-31", { coat: 0.2, hood: 0.15, fringe: 0.1 }],
  ["1990-01-01", "1995-07-09", { coat: 0.45, hood: 0.35, fringe: 0.1 }],
];
/** @template {{ stature: string, top: string, legs: string, prop: string, hair: string, back: string, hem: number }} P
    @param {P[]} who @param {string | null} [date] */
export function wardrobe(who, date = null) {
  const shares = (date ? eraOn(WARDROBE, date) : WARDROBE[2])[2];
  return who.map((p, i) => {
    const r = stream(0x5bd1e995 * (i + 1)), [coat, hood, fringe, hem] = [r(), r(), r(), r()];
    const coated = p.stature !== "child" && p.top === "shirt" && ["jeans", "bells", "shorts"].includes(p.legs) && !["hoop", "drum", "stand"].includes(p.prop) && coat < shares.coat;
    const hooded = !coated && ["shirt", "tee"].includes(p.top) && ["bald", "crop", "bun"].includes(p.hair) && !["roll", "both"].includes(p.back) && p.prop !== "rider"
      && hood < shares.hood;
    return { ...p, coat: coated ? "coat" : "none", hem: coated ? 0.58 + 0.14 * hem : p.hem, hood: hooded ? "hood" : "none", fringe: WEARS.top[p.top] !== undefined && fringe < shares.fringe };
  });
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
   figure of a crowd is a different person; and, drawing on until it finds one, never one whose crest a figure within CREST m has,
   on a desktop or a phone, or that shares more than SHARE[1] of the OUTLINE with a figure within NEAR m, or more than SHARE[0] with
   one within CLOSE m, or that is dressed or moves like one that close, or that moves as all four of its nearest so far do, or as all
   four of another's would with it among them; and where three seats before it stand within NEIGHBOUR m, never one that could sit
   through Space neither with its body leaning back nor hugging its knees (fitsBack, fitsForward), or where four, one that could not
   do both, so that it has a way to sit none of them has. It draws on for at most 400 TRIES: on three thousand gatherings swept, no
   figure was left with such a crest or share, but where four seats before it stand close, on fewer than one gathering in a hundred
   a figure found none that could do both, and is, of those with the fewest such clashes, the one least like its neighbours: stances
   then sits it only in the ways it can, as it sits any figure that cannot do one of them. */
const TRIES = 20, NEAR = 8, CLOSE = 4;
export const SHARE = [4, 5];
/* Whether each seat stands beside another of its group as two friends could stand together (stances): both standing, near, facing
   nearly the same way, square to the line between them. A friend holds nothing, so such a seat is left for a friend, and what it
   would have carried goes to the next. */
function besides(placed) {
  const ahead = (from, to) => Math.cos(from.face ?? 0) * (to.z - from.z) + Math.sin(from.face ?? 0) * (to.x - from.x);
  return placed.map((a, i) => !a.sit && placed.some((b, j) => {
    if (j === i || b.sit || b.group !== a.group) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z), turn = Math.abs(Math.atan2(Math.sin(b.face - a.face), Math.cos(b.face - a.face)));
    return d < 1.45 && turn < 0.5 && Math.abs(ahead(a, b)) < 0.4 * d && Math.abs(ahead(b, a)) < 0.4 * d;
  }));
}
export function people(placed) {
  const out = [], taken = new Set(), crests = [];
  const due = [], paired = besides(placed);
  /* How many seats before a standing seat stand within NEIGHBOUR m of it, each of which may sit through Space a way of its own: only
     those before it, so that a smaller crowd's people are a larger one's first. */
  const crowded = placed.map((a, i) => (a.sit ? 0 : placed.slice(0, i).filter((b) => Math.hypot(b.x - a.x, b.z - a.z) < NEIGHBOUR).length));
  /* Each figure's four nearest of those placed so far, nearest first, as [distance, index]. */
  const nearest = [], fourth = (list) => (list.length < 4 ? Infinity : list[3][0]);
  const closer = (list, d, j) => [...list, [d, j]].sort((a, b) => a[0] - b[0]).slice(0, 4);
  placed.forEach((seat, i) => {
    if (i % PROP_EVERY === PROP_EVERY - 1) due.push(PROPS[Math.floor(i / PROP_EVERY) % PROPS.length]);
    /* Those before it within NEAR m, its four nearest of them, theirs it joins, and the dyes they hold up within DYED m of it. */
    const near = [], joins = [], held = new Set();
    let own = [];
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(placed[j].x - seat.x, placed[j].z - seat.z);
      if (d < NEAR) near.push([out[j], 1 / (1 + d), SHARE[d < CLOSE ? 0 : 1], d < CREST && !seat.sit ? crests[j] : null]);
      if (d < fourth(own)) own = closer(own, d, j);
      if (d < fourth(nearest[j])) joins.push([j, closer(nearest[j], d, i)]);
      if (d < DYED && out[j].colour.cloth !== undefined) held.add(out[j].colour.cloth);
    }
    const patch = (move) => (own.length === 4 && own.every(([, j]) => out[j].move === move) ? 1 : 0)
      + joins.filter(([j, list]) => list.length === 4 && out[j].move === move && list.every(([, k]) => k === i || out[k].move === move)).length;
    /* The next prop due goes to the first figure that can carry it: one that stands, for what stands over a head out of the test poses'
       view of the band, that stands where no friend could stand beside it (besides), that has no one within CLOSE m carrying the
       same, for what is dyed one with a dye no one within DYED m of it holds up, and that can move a way the prop leaves it (person)
       as neither its four nearest nor another's would. */
    const k = due.findIndex((prop) => !(seat.sit && prop !== "stand" && prop !== "finger") && !(OVERHEAD.includes(prop) && inView(seat.x, seat.z)) && !paired[i]
      && !near.some(([other, , share]) => share === SHARE[0] && other.prop === prop) && !(DYED_PROPS.includes(prop) && held.size === CLOTHS.length)
      && (MOVES_HOLDING[prop] ?? ["sway", "watch"]).some((move) => patch(move) === 0));
    const prop = k < 0 ? "none" : due.splice(k, 1)[0];
    const r = stream(0x9e3779b1 * (i + 1));
    /* A child holds a balloon, a bunch of them or nothing, and half the single balloons are children's. */
    const drawn = choose(r, CHOICES.stature);
    const stature = prop === "balloon" ? (r() < 0.5 ? "child" : drawn) : prop !== "none" && prop !== "bunch" && drawn === "child" ? "short" : drawn;
    let best = null, least = Infinity, fewest = Infinity;
    for (let t = 0; t < TRIES || best === null || (fewest > 0 && t < 40 * TRIES) || (fewest >= 100 && t < 400 * TRIES); t++) {
      const p = person(r, seat.sit, prop, stature), outline = outlineOf(plainly(p)), crest = [crestOf(p), crestOf(plainly(p))];
      if (taken.has(outline)) continue;
      let score = 0, clashes = 0;
      for (const [other, weight, share, its] of near) {
        if (its && (its[0] === crest[0] || its[1] === crest[1])) clashes += 100;
        if (OUTLINE.filter((slot) => p[slot] === other[slot]).length > share) clashes += 100;
        if (share === SHARE[0] && (dressedAlike(p, other) || movingAlike(p, other))) clashes += 1;
        const a = alike(p, other);
        score += weight * a * a;
      }
      clashes += patch(p.move);
      if ((crowded[i] === 3 && !fitsBack(p) && !fitsForward(p)) || (crowded[i] === 4 && !(fitsBack(p) && fitsForward(p)))) clashes += 100;
      if (clashes < fewest || (clashes === fewest && score < least)) { fewest = clashes; least = score; best = p; }
    }
    /* Where no draw dressed it unlike every close neighbour, its top takes the first colour none of those in that top wears: a top's
       colour is no part of its outline. */
    if (near.some(([other, , share]) => share === SHARE[0] && dressedAlike(best, other))) {
      const worn = new Set(near.filter(([other, , share]) => share === SHARE[0] && other.top === best.top).map(([other]) => other.colour.top));
      const free = Array.from({ length: COLOURS.top }, (_, k) => k).findIndex((k) => !worn.has(k));
      if (free >= 0) best.colour = { ...best.colour, top: free };
    }
    /* What it holds up is dyed: the first of CLOTHS, on from one its place in the seats' order picks, that no one within DYED m of it
       before it holds up, of which the deal left it one at least. */
    if (DYED_PROPS.includes(best.prop)) {
      const from = (5 * i) % CLOTHS.length, k = CLOTHS.findIndex((_, m) => !held.has((from + m) % CLOTHS.length));
      best.colour = { ...best.colour, cloth: (from + k) % CLOTHS.length };
    }
    taken.add(outlineOf(plainly(best)));
    crests.push(seat.sit ? null : [crestOf(best), crestOf(plainly(best))]);
    out.push(best);
    nearest.push(own);
    for (const [j, list] of joins) nearest[j] = list;
  });
  return out;
}

/* How each of the people `who` at the seats `placed` stands and sits, its stance (STANDS, SITS), the same for the same seats every
   day. It is dealt a group at a time, in the seats' order, so a crowd of whole groups (wholeGroups) stands as a larger one's first
   groups do, its neighbours in the groups before it among those it is unlike. In a group, two friends side by side, of a
   height, facing the same way, neither a child nor holding anything, whose ways of moving leave their arms to them (FREE), stand
   together as often as PAIRS says where each one's hand would rest on the other's back (`holds`, ON_BACK): the taller's arm round
   the other's shoulders, the other's round its waist, both turned (`face`) to face the same way square to the line between them,
   the way nearer the two ways they faced. The shorter dances as the taller does (`lead`). Then each figure takes the first stance
   its stream draws (STANDING) whose pose no figure within NEIGHBOUR m of it has: what its arms do and which leg its weight is on
   (poseOf). A figure whose way of moving keeps its arms, or that holds something, takes only a stance of the legs. And then each
   takes the first way of sitting its stream draws (SEATED) that no figure within NEIGHBOUR m of it has taken with what it holds,
   those with the fewest ways first: dealt in the seats' order, a figure that could sit only one way came after a neighbour that had
   taken it, and on forty days 141 pairs of neighbours sat alike where 21 do now. Lying back on the elbows is for a blanket; and it,
   and the body leaning back on the hands, for one with both hands free, whose hair and hat stay clear of the ground as it leans and
   with nothing on its back, and no one close behind. Few may lie back, so it is drawn far more often than the rest where it may.
   Hugging the knees is for one whose head and arms stay clear of them; and it, and sitting with the knees up, for one without a full
   poncho: from behind, a poncho's point reaches the ground behind a seated figure and its sides stand past the knees and the feet,
   and it hid all but half a percent of them hugged and 2.19 % of them up. Each way of sitting is for a seat whose ground it fits,
   and lying back, cross-legged or kneeling for one whose head or knees keep clear of the visitor's bear (`fits`, buildCrowd). One
   that fits no way stands, and sits, as the whole crowd does, a way that keeps clear of the bear but may not fit its ground; and
   where none does, it kneels in a full poncho and has its knees up in anything else. */
const NEIGHBOUR = 1.6, PAIRS = 1, FREE = ["watch", "sway", "nod", "shift"];
/* Where the middle of the hand of an arm round a friend rests, the figure standing still: [out to the friend's side, up, behind], in
   its own units, for the standard figure's shoulders and legs; out further by SHOULDER_X for each unit wider its shoulders (aBody.y),
   and up by LEG for each unit longer its legs (aBody.z), as the shader poses it (crowd.test.ts holds these to it). One that shifts its
   weight from foot to foot stands, still, with its hips shifted, and its hand round a waist rests lower and nearer (`shifted`). */
export const FRIEND_HAND = { round: [0.754, 1.199, -0.12], waist: [0.8, 1.092, -0.14], shifted: [0.7675, 1.0554, -0.14] };
/* Where on its friend's back that hand may rest, in the friend's own units: how high, between the hips and the shoulder blades for
   an arm round the waist and higher for one round the shoulders; how far across from the spine, to the holder's side and past it; and
   how far behind the back, in and out, as figureGeometry's hips and torso and the shader's belly make it (backOf). Paired 1.45 m apart
   by their seats alone, a pair on a slope or of two sizes rested a hand on the other's thighs, over its shoulders or 0.1 off its back,
   and dancing apart took it 0.27 off. */
export const ON_BACK = { waist: [0.84, 1.25], round: [1.0, 1.42], across: [-0.13, 0.04], behind: [-0.025, 0.03] };
/* How deep a figure's back is behind its spine at a height, in its own units: the torso's (TORSO) at its rings from the hips to the
   shoulders, and as deep as the hips under the waist, and a belly's share behind (figureGeometry, the crowd's shader). The friends'
   hands rest on it (ON_BACK), and the stances deal friends by it, so it keeps the depths the friends were dealt by. */
export const backOf = (y, girth) => (y < 1.01 ? 0.74 * (0.17 - (0.005 * (y - 0.845)) / 0.17) : 0.68 * (0.158 + (0.092 * (y - 1.01)) / 0.46))
  * (1 + 0.35 * (girth - 1) * Math.max(1 - Math.abs(y - 1.02) / 0.4, 0));
/* Whether one seated can lean its body back on its hands, its hair and hat within the seated reaches as it leans, and hug its knees
   leaning forward, with nothing held up over its head going forward with it and no full poncho (stances; people deals the crowded
   ones a head that does one). A knit cap and a jester's cap keep a figure from leaning back, and not from hugging the knees: the
   knit's tip bends back and the jester's points go out and up behind (figureGeometry), so a figure leaning back carries them past the
   seated reaches behind, and leaning forward carries them away from the knees, which a brim or a bill (hat, topper, floppy, plumed,
   cap) goes into. */
const fitsBack = (p) => !["afro", "dreads"].includes(p.hair) && !["hat", "topper", "floppy", "bandana", "knit", "jester", "plumed"].includes(p.head) && p.back === "none"
  && p.hood !== "hood";
const fitsForward = (p) => !["hat", "topper", "floppy", "cap", "plumed"].includes(p.head) && p.hair !== "afro" && ARMS[p.prop] !== ARMS.flag && p.top !== "poncho"
  && p.stoop < 0.05;
const STANDING = { square: 4, left: 7, right: 7, hip: 8, akimbo: 6, folded: 7, cup: 6, behind: 5, pockets: 6 };
const SEATED = { knees: 6, cross: 6, hug: 5, back: 4, kneel: 4, recline: 100 };
const LEGS_ONLY = ["square", "left", "right"];
const armsOf = (p, stand) => (p.prop !== "none" ? p.prop : !FREE.includes(p.move) ? p.move : STAND_ARMS[stand] ? stand : p.move === "nod" ? "folded" : "hang");
/* A standing figure's pose, what its arms do and which leg it stands on, which no neighbour shares. */
export const poseOf = (p, stand) => `${armsOf(p, stand)} ${Math.sign(WEIGHT[stand] ?? 0)}`;
export function stances(placed, who, fits = () => true, holds = () => true) {
  const n = placed.length, out = Array.from({ length: n }, () => ({ stand: "square", sit: "knees" })), standKey = [], sitKey = [];
  /* Where seat `to` stands from seat `from`, in metres to its right (+x, as the figure's own units have it) and ahead of it. */
  const local = (from, to) => {
    const dx = to.x - from.x, dz = to.z - from.z, c = Math.cos(from.face ?? 0), s = Math.sin(from.face ?? 0);
    return [c * dx - s * dz, s * dx + c * dz];
  };
  const young = (p) => p.stature === "child" || p.stature === "teen";
  const friends = (a, b) => {
    const p = who[a], q = who[b], sa = placed[a], sb = placed[b];
    if (sa.sit || sb.sit || p.prop !== "none" || q.prop !== "none" || !FREE.includes(p.move) || !FREE.includes(q.move)) return false;
    if (young(p) || young(q) || Math.abs(p.tall - q.tall) > 0.12) return false;
    const d = Math.hypot(sb.x - sa.x, sb.z - sa.z), turn = Math.abs(Math.atan2(Math.sin(sb.face - sa.face), Math.cos(sb.face - sa.face)));
    return d < 1.45 && turn < 0.5 && Math.abs(local(sa, sb)[1]) < 0.4 * d && Math.abs(local(sb, sa)[1]) < 0.4 * d;
  };
  /* The way two friends at seats a and b face side by side: square to the line between them, the way nearer the way they faced. */
  const sideBySide = (a, b) => {
    const sa = placed[a], sb = placed[b], dx = sb.x - sa.x, dz = sb.z - sa.z, mid = Math.atan2(Math.sin(sa.face) + Math.sin(sb.face), Math.cos(sa.face) + Math.cos(sb.face));
    const right = Math.atan2(-dz, dx), off = (f) => Math.abs(Math.atan2(Math.sin(f - mid), Math.cos(f - mid)));
    return off(right) <= off(right + Math.PI) ? right : Math.atan2(Math.sin(right + Math.PI), Math.cos(right + Math.PI));
  };
  const fitsLying = (p) => ["bald", "crop", "tail", "braids"].includes(p.hair) && ["none", "bandana", "band", "wreath"].includes(p.head);
  /* Draws stances by their weights until one is not `taken`, or takes the first drawn where all are. */
  const deal = (r, weights, taken) => {
    let left = Object.entries(weights).filter(([, w]) => w > 0), first = null;
    while (left.length) {
      const name = choose(r, left);
      if (!taken(name)) return name;
      first ??= name;
      left = left.filter(([k]) => k !== name);
    }
    return first;
  };
  for (let g0 = 0, g1 = 0; g0 < n; g0 = g1) {
    for (g1 = g0 + 1; g1 < n && placed[g1].group === placed[g0].group; g1++);
    const paired = new Set();
    for (let b = g0; b < g1; b++) {
      const r = stream(0x2545f491 * (b + 1));
      for (let a = g0; a < b && !paired.has(b); a++) {
        if (paired.has(a) || !friends(a, b) || r() >= PAIRS) continue;
        const [tall, short] = who[a].tall >= who[b].tall ? [a, b] : [b, a], face = sideBySide(a, b);
        if (!holds(tall, short, face)) continue;
        out[tall].stand = local({ ...placed[tall], face }, placed[short])[0] > 0 ? "round" : "roundLeft";
        out[short].stand = local({ ...placed[short], face }, placed[tall])[0] > 0 ? "waist" : "waistLeft";
        out[tall].face = face; out[short].face = face; out[short].lead = tall;
        for (const k of [a, b]) { paired.add(k); standKey[k] = poseOf(who[k], out[k].stand); }
      }
    }
    const sitting = [];
    for (let i = g0; i < g1; i++) {
      const p = who[i], seat = placed[i], r = stream(0x6c8e9cf5 * (i + 1));
      const near = [], round = [];
      for (let j = 0; j < g1; j++) if (j !== i && Math.hypot(placed[j].x - seat.x, placed[j].z - seat.z) < NEIGHBOUR) { round.push(j); if (j < i || paired.has(j)) near.push(j); }
      if (!paired.has(i)) {
        const legsOnly = p.prop !== "none" || !FREE.includes(p.move);
        const weights = Object.fromEntries(Object.entries(STANDING).filter(([name]) => (!legsOnly || LEGS_ONLY.includes(name)) && !(name === "cup" && young(p)))
          .map(([name, w]) => [name, w * (p.akimbo && (name === "akimbo" || name === "hip") ? 2 : 1)]));
        out[i].stand = deal(r, weights, (name) => near.some((j) => standKey[j] === poseOf(p, name)));
        standKey[i] = poseOf(p, out[i].stand);
      }
      const faced = { ...seat, face: out[i].face ?? seat.face };
      const behind = (depth) => near.concat(Array.from({ length: g1 - g0 }, (_, k) => g0 + k)).some((j) => {
        if (j === i) return false;
        const [x, z] = local(faced, placed[j]);
        return z < 0 && z > -depth && Math.abs(x) < 0.9;
      });
      const free = p.prop === "none" && out[i].stand !== "cup";
      const ways = (ground) => Object.fromEntries(Object.entries(SEATED).filter(([name]) => fits(i, name, faced.face, ground)
        && (name === "recline" ? seat.blanket >= 0 && fitsLying(p) && free && !behind(1.8) : name === "back" ? fitsBack(p) && free && !behind(1.1) : name === "hug" ? fitsForward(p) : name === "knees" ? p.top !== "poncho" : true)));
      sitting.push({ i, r, fitting: ways(true), ways, round });
    }
    /* Those with the fewest ways to sit take theirs first, each unlike the neighbours that have taken theirs. */
    sitting.sort((a, b) => Object.keys(a.fitting).length - Object.keys(b.fitting).length || a.i - b.i);
    for (const { i, r, fitting, ways, round } of sitting) {
      const none = Object.keys(fitting).length === 0, prop = who[i].prop, loose = none ? ways(false) : fitting;
      if (none && placed[i].sit) out[i].stands = true;
      const last = who[i].top === "poncho" ? { kneel: SEATED.kneel } : { knees: SEATED.knees };
      out[i].sit = deal(r, Object.keys(loose).length ? loose : last, (name) => round.some((j) => sitKey[j] === `${name} ${prop}`));
      sitKey[i] = `${out[i].sit} ${prop}`;
    }
  }
  return out;
}

/* What a figure wears, as the numbers it carries: the sum of its parts' bits, and its style (STYLE). WEARS says which parts
   each choice of a person's wears, each named with its form after a point where it is not the first (FORMS), and CUTS how a choice
   cuts the figure (CUT); a beard and hands on the hips are a person's own. */
const WEARS = {
  stand: { cup: ["CUP"] },
  head: { hat: ["BRIM", "CROWN"], topper: ["BRIM", "CROWN"], floppy: ["BRIM", "CROWN"], cap: ["CROWN", "BILL"], band: ["BAND"], bandana: ["BAND", "KNOT"], wreath: ["WREATH"],
    knit: ["CROWN.knit"], jester: ["CROWN.jester"], plumed: ["BRIM", "CROWN.plume"], flowers: ["WREATH.flowers"] },
  hair: { bob: ["HAIR"], long: ["HAIR"], mane: ["HAIR"], tail: ["TAIL"], braids: ["TAIL", "TAIL2"], dreads: ["HAIR.dreads"], bun: ["HAIR.bun"] },
  legs: { maxi: ["SKIRT"], dress: ["SKIRT"], tunic: ["SKIRT"] },
  top: { poncho: ["PONCHO"], shawl: ["PONCHO"] },
  coat: { coat: ["SKIRT.coat"] },
  hood: { hood: ["HOOD"] },
  back: { pack: ["PACK"], roll: ["ROLL"], both: ["PACK", "ROLL"] },
  prop: { flag: ["POLE", "FLAG"], swallowtail: ["POLE", "FLAG.swallowtail"], pennant: ["POLE", "FLAG.pennant"], streamer: ["POLE", "FLAG.streamer"],
    star: ["POLE.lean", "FLAG.star"], moon: ["POLE.lean", "FLAG.moon"], parasol: ["POLE.lean", "FLAG.parasol"], puppet: ["POLE.lean", "FLAG.puppet"], stand: ["STAND"],
    balloon: ["BALLOON"], bunch: ["BALLOON.bunch"], finger: ["FINGER"], aloft: ["FINGER.aloft"], tambourine: ["FINGER.tambourine"], hoop: ["HOOP"], rider: ["RIDER"], drum: ["DRUM"] },
};
const CUTS = {
  hair: { afro: "AFRO", bald: "BALD" },
  legs: { bells: "BELLS", shorts: "SHORTS", dress: "SHORTS", tunic: "TUNIC" },
  top: { tee: "BARE", shawl: "SHAWL" },
};
/* How a person is cut, as the sum of its CUT bits. */
export function cutOf(p) {
  let cut = 0;
  for (const slot in CUTS) cut += CUT[CUTS[slot][p[slot]]] ?? 0;
  return cut;
}
export function wearing(p) {
  const stand = p.stance?.stand ?? "square", sits = p.stance?.sit ?? "knees", own = { ...p, stand };
  let parts = p.beard ? PART.BEARD : 0;
  for (const slot in WEARS) for (const name of WEARS[slot][own[slot]] ?? []) parts += PART[name.split(".")[0]];
  return { parts, style: MOVE[p.move] + STYLE.ARMS * ARMS[p.prop] + STYLE.CUT * cutOf(p) + STYLE.STANCE * (STAND[stand] + STYLE.SITS * SITTING[sits]) };
}
/* What groundUnder takes of a figure: what it wears and how it moves, and how broad its shoulders are (aBody.y). */
export const fitted = (p) => ({ ...wearing(p), wide: p.wide ?? 1 });
/* The form of each part a person wears in other than its first form, as { bit: form }: empty for most. */
export function formsOf(p) {
  const forms = {};
  for (const slot in WEARS) for (const name of WEARS[slot][p[slot]] ?? []) {
    const [part, form] = name.split(".");
    if (form) forms[PART[part]] = FORM[part][form];
  }
  if (p.fringe && WEARS.top[p.top]) forms[PART.PONCHO] = FORM.PONCHO.fringed;
  return forms;
}

/* How far a figure's rest reaches from its axis in its own units, standing still with its arms down, and how high over its feet at the
   most, its arms up: what buildCrowd fits inside HANG and TOP. Each part's number is its farthest vertex, as it is built and as the
   figure's own numbers widen it; a stoop carries what is on the head forward, and a lean back carries a pack back. It is a bound
   on the safe side, and not a tight one: a figure's breadth is its build's before it is the reach's (buildCrowd), so most figures
   stand some 10 cm inside HANG, and a number here that fell a little short would pass unseen on them. The unit tests stand every
   figure through every pose against the same bounds (crowd.test.ts), which catches a short number where the fit binds. */
function reaches(p, wear, forms = formsOf(p)) {
  const has = (name) => (wear.parts & PART[name]) !== 0, forward = Math.max(p.stoop, 0) * 0.95, back = Math.max(-p.stoop, 0) * 0.6;
  const form = (name) => (has(name) ? forms[PART[name]] ?? 0 : -1);
  /* What stands over the head is carried forward with the stoop from the hips, 2.15 units under it at the most. */
  const ahead = Math.max(p.stoop, 0) * 2.15;
  /* The shoulders' balls, each 0.06 round and a little ahead of the body's line, carried forward with the stoop from the hips to the
     shoulders. */
  let out = Math.max(Math.hypot(SHOULDER_X * p.wide + 0.06, Math.max(p.stoop, 0) * (SHOULDER_Y - LEG) + 0.035), 0.166 * p.girth);
  const reach = (r) => { out = Math.max(out, r); };
  if (has("SKIRT")) reach(Math.max(0.32 * (0.62 + (0.38 * (1 - p.hem)) / 0.907), 0.2 * (1 + 0.65 * Math.max(p.girth - 1, 0))));
  if (has("PONCHO")) reach(0.348);
  if (has("BRIM")) reach(0.21 * p.brim * p.big + forward);
  if (form("CROWN") === FORM.CROWN.knit) reach(0.18 * p.big + forward);
  if (form("CROWN") === FORM.CROWN.jester) reach(0.33 * p.big + forward);
  if (form("CROWN") === FORM.CROWN.plume) reach(0.28 * p.big + forward);
  if (form("WREATH") === FORM.WREATH.flowers) reach(0.17 * p.big + forward);
  if (has("BILL")) reach(0.29 * p.big + forward);
  if (has("HAIR") || has("TAIL")) reach(0.26 * p.big + back);
  if (p.hair === "afro") reach(0.26 * p.big + back);
  if (has("PACK") || has("ROLL")) reach(0.315 + back);
  if (has("HOOD")) reach(0.215 + back);
  if (has("POLE")) reach(0.335 + ahead);
  /* Seated, the arm that holds a pole or a string turns back from the shoulder (HOLD), and its elbow, 0.045 round, stands 0.18
     behind the shoulder, ELBOW turned back HOLD[0], and no further out than it, as the shader poses it sitting cross-legged,
     kneeling or with the knees up, the ways a holder sits; 0.184 behind at the most stoop a holder has (person). It is counted at
     0.215 behind and 0.005 out, room for a lean, 0.406 out for the standard figure's shoulders; hugging the knees, which no holder
     does, takes it to 0.206. */
  if (ARMS[p.prop] === ARMS.flag) reach(Math.hypot(SHOULDER_X * p.wide + 0.005, 0.215) + 0.045);
  const stood = [null, null, null, null, 0.2, 0.2, 0.21, 0.2][form("FLAG")];
  if (stood) reach(Math.hypot(0.14, ahead) + stood);
  else if (has("FLAG")) reach(Math.hypot(0.34, 0.085 + ahead));
  if (form("FINGER") > 0) reach(Math.hypot(SHOULDER_X * p.wide + 0.04, Math.max(p.stoop, 0) * (SHOULDER_Y - LEG) + 0.04));
  if (has("STAND")) reach(0.35);
  if (has("BALLOON")) reach(0.335 + ahead + back);
  if (has("HOOP")) reach(0.33);
  if (has("DRUM")) reach(0.345 + forward);
  if (has("RIDER")) reach(0.27 + back);
  if (has("CUP")) reach(0.34);
  /* The top: its hands at the rise's peak, and what stands over its head, each as far up as the sway lifts its far side. */
  const lift = LEG * (p.leg - 1);
  let top = SHOULDER_Y + lift + 0.64 + [0, 0.14, 0.32, 0.32][form("FINGER") + 1];
  if (has("FLAG")) top = Math.max(top, [2.96, 2.96, 2.96, 2.96, 3.01, 2.93, 2.77, 3.04][form("FLAG")] + lift);
  if (has("BALLOON")) top = Math.max(top, [2.85, 2.92][form("BALLOON")] + lift);
  /* And what is on the head: a crown, raised from its foot as the figure's own number says, and a bun, as its length does, each with
     the head as big as it is. */
  const onHead = (y) => NECK_Y + (y - NECK_Y) * p.big + lift + 0.04;
  if (has("CROWN")) top = Math.max(top, onHead(CROWN_FOOT + ([1.8576, 2.077, 2.03, 2.06][form("CROWN")] - CROWN_FOOT) * p.crown));
  if (form("HAIR") === FORM.HAIR.bun) top = Math.max(top, onHead(HAIR_TOP + 0.16 * p.hairLength));
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
/* Sets `names` to a table's numbers for the stance `code` holds, one entry [stance, numbers] after another; where it holds none of
   them, they keep the numbers they were declared with. */
const chain = (code, entries, names) => entries.map(([k, values], j) => `${j ? " else " : ""}if (${is(code, k)}) { ${names.map((name, m) => `${name} = ${f(values[m])};`).join(" ")} }`).join("");
const SIT_NAMES = ["sitL", "sitF", "sitB", "sitI", "sitFoot", "sitSplay", "sitCross", "sitPitch", "sitHip", "kneel", "sitAhead", "sitHands"];
const sitsAs = (name) => { const q = SIT_POSE[name]; return [...q.arms, q.foot, q.splay, q.cross, q.pitch, q.hip, q.kneel, q.ahead, q.hands]; };
const armsOn = (side) => Object.entries(STAND_ARMS).filter(([, arms]) => arms[side]).map(([name, arms]) => [STAND[name], [...arms[side], 1]]);
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
attribute vec4 aPlace;
attribute vec4 aSize;
uniform float uBeat;
uniform float uDance;
uniform float uRise;
uniform float uSit;
varying vec4 vDress;
varying vec4 vSecond;`;
/* In the figure's own units, after begin_vertex. It is written with plain numbers alone, one to a name, so that the unit tests can
   read it as it stands and stand every figure through every pose (crowd.test.ts).
   First the figure's own shape: what its head wears (aCut), its
   belly, its shoulders (aBody), its legs' length and thickness, a skirt's hem. Then the pose, as far as the figure dances where it
   stands (aPart.w: still 1, at its seat 0): its arms, each turned at the shoulder and bent at the elbow, the ring at the elbow cut on
   the mitre; its head's nod; the rise and the sit. The hips come down to the beat and, sitting, to SEAT, and the rest of the figure
   with them. Each leg runs from its hip to its foot through the knee: the thigh from the leg's upper half and the shin from its
   lower, each keeping its thickness across the way it lies, the ring at the knee cut on the mitre between them; the foot lies flat
   standing and, seated, tips along the ground's fall to it; seated, the knees fall apart; a skirt's rings follow the legs, and never
   pass under the ground. Every figure rises with the build-up as far as aRise lets it: all the way, but with its arms brought down
   while it stands fully still (seats.js). Then its stoop, its lean, which leaves its feet flat on the ground, and its turn. Last, its
   legs lean with the ground under it (aFig.w ahead and aPlace.w across), and nothing of a seated figure passes under that ground. */
/* band.js's swing as the shader writes it: the expression that a move takes once in `per` counts, `counts` (an expression) into
   them, held at 1, at an even pace to -1 over `move` counts (a quarter of `per` at the most) arriving halfway, held, and so back,
   arriving on its count. */
const swung = (counts, per, move) => {
  const m = Math.min(move, per / 4) / per, u = `fract((${counts}) / ${f(per)})`;
  return `(${u} < 0.5 ? clamp(1.0 - 2.0 * (${u} - ${f(0.5 - m)}) / ${f(m)}, -1.0, 1.0) : clamp(-1.0 + 2.0 * (${u} - ${f(1 - m)}) / ${f(m)}, -1.0, 1.0))`;
};
const DANCE = `
float rig = aMark.x, bit = aMark.y, parts = aWear.x, form = floor(aMark.z / ${n(TINTS)});
{
  float x = transformed.x, y = transformed.y, z = transformed.z;
  float kind = mod(aWear.y, ${n(STYLE.ARMS)}), arms = mod(floor(aWear.y / ${n(STYLE.ARMS)}), ${n(STYLE.CUT / STYLE.ARMS)});
  float cuts = mod(floor(aWear.y / ${n(STYLE.CUT)}), ${n(STYLE.STANCE / STYLE.CUT)}), stance = floor(aWear.y / ${n(STYLE.STANCE)});
  float st = mod(stance, ${n(STYLE.SITS)}), se = floor(stance / ${n(STYLE.SITS)});
  bool bells = ${has("cuts", CUT.BELLS)}, afro = ${has("cuts", CUT.AFRO)}, shawl = ${has("cuts", CUT.SHAWL)};
  bool shortLegs = ${has("cuts", CUT.SHORTS)}, shortSleeves = ${has("cuts", CUT.BARE)};
  bool legRig = ${is("rig", RIG.LEG)}, footRig = ${is("rig", RIG.FOOT)}, armRig = (${is("rig", RIG.ARM_L)}) || (${is("rig", RIG.ARM_R)}), skirtRig = ${is("rig", RIG.SKIRT)};
  bool headRig = ${is("rig", RIG.HEAD)}, groundRig = ${is("rig", RIG.GROUND)}, core = ${is("rig", RIG.BODY)} && bit < 0.5;
  bool bobber = ${is("kind", MOVE.bob)}, swayer = ${is("kind", MOVE.sway)}, waver = ${is("kind", MOVE.wave)}, spinner = ${is("kind", MOVE.spin)};
  bool nodder = ${is("kind", MOVE.nod)}, clapper = ${is("kind", MOVE.clap)}, shifter = ${is("kind", MOVE.shift)};
  /* How it sits (SIT_POSE), and how it stands: on which leg (WEIGHT), and toward which side a friend stands (TOWARD). */
  float ${SIT_NAMES.map((name, m) => `${name} = ${f(sitsAs("knees")[m])}`).join(", ")}, leaning = 0.0, toward = 0.0;
  ${chain("se", SITS.slice(1).map((name) => [SITTING[name], sitsAs(name)]), SIT_NAMES)}
  ${chain("st", Object.entries(WEIGHT).map(([name, w]) => [STAND[name], [w]]), ["leaning"])}
  ${chain("st", Object.entries(TOWARD).map(([name, w]) => [STAND[name], [w]]), ["toward"])}
  float girth = aBody.x, legL = ${f(LEG)} * aBody.z, up = legL - ${f(LEG)};
  /* How far a corner leans with the ground under the figure (below): a leg's or a skirt's by how near the foot it stands, a foot's all
     the way, and the rest of the figure not at all. And how far that ground rises across the figure, to its right, a unit out. */
  float low = footRig ? 1.0 : legRig || skirtRig ? 1.0 - clamp(y / ${f(LEG)}, 0.0, 1.0) : 0.0;
  bool cuff = legRig && low > 0.999;
  float rises = aPlace.w;

  float moves = 1.0 - aPart.w, dance = uDance * moves * aWear.w, going = min(2.5 * dance, 1.0);
  float rise = clamp((uRise - ${f(RISE_FROM)} - ${f(RISE_SPAN)} * aFig.z) / ${f(RISE_W)}, 0.0, 1.0) * aRise;
  float sit = max(aFig.x, clamp(uSit * ${f(1 + STAGGER)} - aFig.y * ${f(STAGGER)}, 0.0, 1.0)) * (1.0 - rise);
  float standing = moves * (1.0 - sit);
  /* The figure's own count: the band's, within JITTER of it, and its own of every four (aFig.y). Each move the figure makes comes and
     goes on it as the band's do (band.js swing), holding at either end, and over a quarter of its counts: its stride (and bounce, 1
     with its hips down), which its knees, its lean, its nod and its arms all keep, once in SLOW counts; its turn, once in twice
     SLOW, its arms out and its skirt flaring (fling) as it turns; and only its hands before its chest (slow, 1 with them in), once in
     STRUM, over the band's STEP of a count. Each arrives on the figure's count, all of them on the same counts. */
  float own = uBeat + ${f(JITTER)} * aFig.y - floor(4.0 * fract(5.3 * aFig.y));
  float stride = ${swung("own", SLOW, SLOW / 4)}, turned = ${swung("own", 2 * SLOW, SLOW / 2)};
  float bounce = 0.5 + 0.5 * stride, slow = 0.5 + 0.5 * ${swung("own", STRUM, STEP)}, fling = 1.0 - abs(turned);
  float spin = spinner ? 1.0 : 0.0;
  /* How far it leans toward a friend; and its weight: on the leg its stance stands it on, or, for one that shifts it, from one foot to
     the other and back over eight beats, holding on each a while, and half as far with its arm round a friend, so that each one's
     hand stays on the other's back; as far as it stands and dances where it stands. */
  float friend = standing * toward, weight = standing * (shifter ? going * turned * (1.0 - 0.5 * abs(toward)) : leaning);

  if (headRig) {
    /* Dreadlocks are let down as far as each lock's weight says, and the rest of the hair all the way. */
    if (bit == ${B.HAIR}) y = ${f(HAIR_TOP)} - (${f(HAIR_TOP)} - y) * (${is("form", FORM.HAIR.dreads)} ? mix(1.0, aCut.x, aMark.w) : aCut.x);
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
      float puff = 1.0 + ${f(AFRO)} * aCut.x * aMark.w;
      x *= puff; z *= puff; y = ${f(HEAD_Y)} + (y - ${f(HEAD_Y)}) * puff;
    }
    x *= aBody.w; z *= aBody.w; y = ${f(NECK_Y)} + (y - ${f(NECK_Y)}) * aBody.w;
  }
  if (core || bit == ${B.SKIRT} || bit == ${B.PONCHO}) {
    float belly = (girth - 1.0) * clamp(1.0 - abs(y - 1.02) / 0.4, 0.0, 1.0);
    if (bit != ${B.PONCHO}) x *= 1.0 + belly;
    z *= 1.0 + belly * (z < 0.0 ? 0.35 : bit == ${B.PONCHO} ? 0.5 : 1.5);
  }
  if (core || bit == ${B.HOOD}) x *= 1.0 + (aBody.y - 1.0) * smoothstep(1.2, ${f(SHOULDER_Y)}, y);
  if (bit == ${B.PONCHO} && shawl) y = 1.43 - (1.43 - y) * (1.0 - 0.58 * aMark.w);
  /* Which side a corner of a leg or a foot is on, as it is built, where every one of them is on its own leg's side: a flared cuff
     opens past the middle, and its inner corner, taken for the other leg's, was thrown across with the other shin as a figure sat
     cross-legged. */
  float legSide = x > 0.0 ? 1.0 : -1.0;
  if (legRig || footRig) {
    float thick = 1.0 + 0.5 * (girth - 1.0);
    float flare = legRig && bells ? 1.0 + 0.9 * clamp(1.0 - y / ${f(LEG / 2)}, 0.0, 1.0) : 1.0;
    /* Shorts' hems stand open round the thigh, and the ankle under them is bare (OPEN). */
    if (legRig && shortLegs && abs(y - ${f(SHORTS_HEM)}) < 0.001) flare = ${f(OPEN.shorts)};
    if (legRig && shortLegs && y < 0.001) flare = ${f(OPEN.ankle)};
    x = legSide * ${f(HIP_X)} * (0.5 + 0.5 * thick) + (x - legSide * ${f(HIP_X)}) * (legRig ? thick * flare : 1.0);
    if (legRig) { z *= thick * flare; y *= aBody.z; }
  }
  if (skirtRig) {
    float hem = aCut.y, swirl = 0.5 * spin * dance * fling * (1.0 - sit), mid = hem < 0.5 ? 0.5 : 0.5 * (1.0 + hem);
    if (y < 0.2) {
      /* As it flares out turning, its hem rises, 0.3 of the way it goes out: flared flat, it went 5.5 cm into a phone's ground, which
         lies off the plane its figure stands on further out. And it rises to no more than 2 cm under the ring at the knee (mid): a
         dress's hem, a few centimetres under it, rose past it and folded the skirt up over itself. */
      float flare = 0.62 + 0.38 * (1.0 - hem) / 0.907, spread = sqrt(x * x + z * z) * flare * swirl;
      x *= flare * (1.0 + swirl); z *= flare * (1.0 + swirl); y = hem * ${f(LEG)} + min(0.3 * spread, max((mid - hem) * ${f(LEG)} - 0.02, 0.0));
    } else if (y < 0.6) {
      float full = (0.62 + 0.38 * clamp((1.0 - mid) / 0.5, 0.0, 1.0)) * (1.0 + 0.5 * swirl);
      x *= full; z *= full; y = mid * ${f(LEG)};
    }
    /* A coat's tail hangs outside the thighs, which a stout figure's are thicker: under the hips, it is as much broader (a skirt,
       which the hips' and the knees' rings shape, is not). */
    if (${is("form", FORM.SKIRT.coat)} && y < ${f(LEG - 0.001)}) { float thick = 1.0 + 0.5 * (girth - 1.0); x *= thick; z *= thick; }
    y = y > ${f(LEG - 0.001)} ? y + up : y * aBody.z;
  }
  if (!legRig && !footRig && !skirtRig && !groundRig) y += up;
  /* Seated, the hand that holds a pole or a string slides up it (HOLD), and what it holds goes with the hand's middle, upright:
     hanging at the pole as it does standing, a seated figure's hand went 6 cm into the ground beside it. */
  if (${is("arms", ARMS.flag)} && (bit == ${B.POLE} || bit == ${B.FLAG} || bit == ${B.BALLOON})) {
    float hf = ${f(HOLD[0])} * sit, hb = ${f(HOLD[1])} * sit, hy = -${f(ELBOW)} - ${f(FOREARM)} * cos(hb), hz = ${f(FOREARM)} * sin(hb);
    y += hz * sin(hf) + hy * cos(hf) + ${f(SHOULDER_Y - HAND_Y)}; z += hz * cos(hf) - hy * sin(hf);
  }
  if (bit == ${B.FLAG}) z += 0.06 * dance * aMark.w * stride;
  /* The finger goes into the fist along the arm as the parting brings it down; what else the hand holds up, built in the fist, grows
     every way to its size as the arm goes up. */
  if (bit == ${B.FINGER}) {
    if (form > 0.5) {
      float grow = mix(1.0, ${f(1 / TUCK)}, moves);
      x = ${f(SHOULDER_X)} + (x - ${f(SHOULDER_X)}) * grow; y = ${f(HAND_Y)} + (y - ${f(HAND_Y)}) * grow; z *= grow;
    } else y = ${f(HAND_Y)} + (y - ${f(HAND_Y)}) * mix(0.37, 1.0, moves);
  }
  if (bit == ${B.BALLOON}) { x += 0.03 * dance * aMark.w * stride; z += 0.05 * dance * aMark.w * stride; }
  if (bit == ${B.HOOP}) y += (1.0 - sit) * (0.13 * going + 0.28 * min(dance, 1.2) * x * stride);

  if (armRig) {
    float side = ${is("rig", RIG.ARM_L)} ? -1.0 : 1.0, stand = standing, aloft = going * (1.0 - sit);
    float lift = 0.0, fore = 0.0, bend = 0.0, inward = 0.0, held = 0.0;
    /* The stance's arm on this side, where it has one (STAND_ARMS), for one whose way of moving leaves its arms to it. */
    float poseL = 0.0, poseF = 0.0, poseB = 0.0, poseI = 0.0, posed = 0.0;
    if (side < 0.0) { ${chain("st", armsOn("left"), ["poseL", "poseF", "poseB", "poseI", "posed"])} }
    else { ${chain("st", armsOn("right"), ["poseL", "poseF", "poseB", "poseI", "posed"])} }
    bool cupped = ${is("st", STAND.cup)} && side > 0.0;
    float keeps = cupped ? moves : stand;
    if (posed > 0.5 && !(bobber || waver || spinner || clapper)) { lift = poseL * keeps; fore = poseF * keeps; bend = poseB * keeps; inward = poseI; held = cupped ? 1.0 : 0.0; }
    else if (bobber) { lift = dance * ${f(ARM_SWING)} * (0.5 - 0.5 * side * stride) * (1.0 - sit); fore = ${f(BENT[0])} * stand; bend = ${f(BENT[1])} * stand; inward = ${f(BENT[2])}; }
    /* One that sways swings the arm on the side it leans out, and the other in no further than 0.04 rad inside hanging, arriving
       there as the stride does, so that it never holds while the lean goes on and carries it back. */
    else if (swayer) {
      float outward = side * stride, reach = dance * 0.1 * (1.0 - sit);
      lift = 0.05 * stand + outward * (outward > 0.0 ? reach : min(reach, 0.05 * stand + 0.04)); bend = ${f(BENT[3])} * stand;
    }
    else if (waver) { lift = aloft * (2.65 + side * 0.3 * min(dance, 1.3) * stride); bend = aloft * 0.25; inward = 1.0; }
    else if (spinner) { lift = aloft * (${f(SPIN_OUT)} + 0.12 * side + 0.2 * fling); bend = ${f(SPIN_BEND)} * aloft; inward = -1.0; }
    else if (nodder) { lift = 0.12 * stand; fore = 0.25 * stand; bend = 1.75 * stand; inward = 0.75; }
    else if (clapper) { fore = 0.6 * aloft; bend = 1.75 * aloft; inward = 0.35 + 0.37 * slow; }
    if (${is("arms", ARMS.flag)} && side > 0.0) { lift = 0.0; fore = ${f(HOLD[0])} * sit; bend = ${f(HOLD[1])} * sit; inward = 0.0; held = 1.0; }
    else if (${is("arms", ARMS.finger)} && side > 0.0) { lift = 2.95 * moves; fore = 0.0; bend = 0.0; held = 1.0; }
    else if (${is("arms", ARMS.rider)}) { lift = 0.0; fore = 0.3; bend = 2.1; inward = 0.6; held = 1.0; }
    else if (${is("arms", ARMS.drum)}) { lift = 0.1 * moves; fore = 0.15; bend = 1.2 + 0.3 * dance * (side > 0.0 ? slow : 1.0 - slow); inward = 0.8; held = 1.0; }
    else if (${is("arms", ARMS.hoop)}) lift = 0.6 * aloft;
    /* Seated, a forearm rests on its knee: an arm the figure holds something with keeps its hold (above), and this adds nothing to it
       but on the side it does not hold with. */
    float resting = sit * (1.0 - held);
    lift += resting * sitL; fore += resting * sitF; bend += resting * sitB; inward = mix(inward, sitI, resting);
    float lifted = rise * (1.0 - held);
    lift = mix(lift, ${f(ARM_UP)}, lifted); fore *= 1.0 - lifted; bend *= 1.0 - lifted;
    float sx = side * ${f(SHOULDER_X)} * aBody.y, sy = ${f(SHOULDER_Y)} + up;
    float px = x + side * ${f(SHOULDER_X)} * (aBody.y - 1.0) - sx, py = y - sy, pz = z;
    /* A short or rolled sleeve's hem stands open round the arm (OPEN). */
    if (shortSleeves && bit < 0.5 && abs(py + ${f(SLEEVE_HEM)}) < 0.001) { px *= ${f(OPEN.sleeve)}; pz *= ${f(OPEN.sleeve)}; }
    /* A cup stands upright in the fist however far the forearm is bent: turned about its middle the way CUP_ARM bends the forearm, as
       far as the forearm is less bent than that, so that let down by the parting it is held upright beside the hip. Lying the way
       the forearm hung, it lay flat there. */
    if (bit == ${B.CUP}) {
      float up2 = max(${f(CUP_ARM[2])} - bend, 0.0), cx = ${f(Math.sin(cupWay))}, cz = ${f(Math.cos(cupWay))};
      float along = px * cx + pz * cz - 0.045, down = ${f(HAND_Y - SHOULDER_Y)} - py, cu = cos(up2), su = sin(up2);
      float along2 = along * cu + down * su, down2 = down * cu - along * su;
      px += (along2 - along) * cx; pz += (along2 - along) * cz; py = ${f(HAND_Y - SHOULDER_Y)} - down2;
    }
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
  if (headRig) {
    /* Its head toward a friend whose waist its arm is round. */
    float lay = ${is("st", STAND.waist)} || ${is("st", STAND.waistLeft)} ? -${f(HEAD_TO)} * friend : 0.0, cy = cos(lay), sy = sin(lay), hy = y - ${f(NECK_Y)} - up;
    y = ${f(NECK_Y)} + up + x * sy + hy * cy; x = x * cy - hy * sy;
  }

  /* The knees: one that bobs bends them on its stride, one that sways a little, and the rest not at all; as the build-up lifts them,
     all of them, on the stride. */
  float bobs = bobber ? 1.0 : swayer ? 0.35 : 0.0;
  float dip = bounce;
  float bob = (1.0 - sit) * dance * (1.0 + rise) * ${f(BOB)} * dip * mix(bobs, 1.0, rise);
  /* A seat stands as much higher as the thighs are thicker, so that a broad figure's rest on the ground as a slight one's do. */
  float lower = legL * ${f(1 - FOLD)} * bob + (legL - sitHip - 0.044 * max(girth - 1.0, 0.0)) * sit;
  bool onLeg = legRig || footRig || (skirtRig && y < legL + 0.001);
  /* How far the ground falls (or, below nought, rises) from the seat to the seated feet ahead of it. */
  float fall = clamp(aFig.w, ${f(DROP[0])}, ${f(DROP[1])});
  if (onLeg) {
    /* The hip, the foot and the knee between them, as forward (Z) and up (Y): the hip of the leg the figure's weight is off comes
       down, and its knee bends; seated, the feet stand where its stance puts them, and go down with the ground as it falls from the
       seat to them, with the rest of the figure (below). */
    float sideL = legSide, t = clamp(y / legL, 0.0, 1.0);
    float hipY = legL - lower - ${f(HIP_DROP)} * max(-weight * sideL, 0.0);
    float footZ = sit * sitFoot, footY = sit * ${f(FOOT[1])};
    float span = max(sqrt(footZ * footZ + (footY - hipY) * (footY - hipY)), 1e-4);
    float alongZ = footZ / span, alongY = (footY - hipY) / span, halfway = 0.5 * min(span, legL - 1e-3);
    float bow = sqrt(max(0.25 * legL * legL - halfway * halfway, 0.0));
    /* Seated, the knee falls out to its side: of how far it stands off the line from the hip to the foot, the share SPLAY's sine
       gives goes out sideways (wide), and the rest stays up and ahead. */
    float splay = sitSplay * sit, wide = bow * sin(splay);
    bow *= cos(splay);
    float kneeZ = alongZ * halfway - alongY * bow, kneeY = hipY + alongY * halfway + alongZ * bow;
    footZ = alongZ * min(span, legL); footY = hipY + alongY * min(span, legL);
    if (footRig) {
      /* A kneeling figure's foot is turned about its own middle to point back. */
      float middle = sideL * ${f(HIP_X)} * (0.75 + 0.25 * girth), about = 3.1416 * kneel * sit, cu = cos(about), su = sin(about), mx = x - middle;
      x = middle + cu * mx + su * z; z = cu * z - su * mx;
      z += footZ; y += footY;
      x -= sideL * sitCross * sit;
    } else {
      float thighL = max(sqrt(kneeZ * kneeZ + (kneeY - hipY) * (kneeY - hipY)), 1e-5);
      float shinL = max(sqrt((footZ - kneeZ) * (footZ - kneeZ) + (footY - kneeY) * (footY - kneeY)), 1e-5);
      float thighZ = -(kneeY - hipY) / thighL, thighY = kneeZ / thighL, shinZ = -(footY - kneeY) / shinL, shinY = (footZ - kneeZ) / shinL;
      float mitre = max(thighZ * (thighZ + shinZ) + thighY * (thighY + shinY), 0.4);
      float overZ = t > 0.51 ? thighZ : t < 0.49 ? shinZ : (thighZ + shinZ) / mitre, overY = t > 0.51 ? thighY : t < 0.49 ? shinY : (thighY + shinY) / mitre;
      /* A trouser's hem, the ring at the foot, stays level however the shin slants, so it never dips into the ground. */
      if (t < 0.01 && legRig) { overZ = 1.0; overY = 0.0; }
      /* And a skirt's rings under the knee hang level while the figure stands, as cloth does: tipped with the shin, the back of a
         dress's hem a centimetre or two under its knee stood as high as the ring at the knee, or higher, and higher still as the
         skirt flared turning. Seated, they go with the shins. */
      if (t < 0.49 && skirtRig) { overZ = mix(1.0, overZ, sit); overY *= sit; }
      float atZ = t > 0.5 ? mix(kneeZ, 0.0, 2.0 * t - 1.0) : mix(footZ, kneeZ, 2.0 * t), atY = t > 0.5 ? mix(kneeY, hipY, 2.0 * t - 1.0) : mix(footY, kneeY, 2.0 * t);
      /* Seated, a skirt lies flatter over the thighs and under them than it hangs round them standing; a coat's tail, which hangs
         round both outside them, less so (COAT_SAT): as flat as a skirt, its corners over and under the middle of a thigh went 8 mm
         into it, every way of sitting (crowd.test.ts). */
      float deep = skirtRig ? z * (1.0 - (${is("form", FORM.SKIRT.coat)} ? (z > 0.0 ? ${f(COAT_SAT[0])} : ${f(COAT_SAT[1])}) : 0.45) * sit) : z;
      z = atZ + deep * overZ; y = atY + deep * overY;
      /* Out to the side with its knee, the knee all the way and the hip and the foot not at all. A skirt goes with the knees as far
         as it hangs over a leg, and half as far at its sides, which so stand just past the knees and no further; but a coat's tail,
         open before and hanging outside the thighs, goes with them all the way at its sides, for half as far left its hem's sides 4 cm
         inside the thighs of one sitting cross-legged. */
      float spread = skirtRig ? min(abs(x) / ${f(HIP_X)}, 1.0) * (${is("form", FORM.SKIRT.coat)} ? 1.0 : 1.0 - 0.5 * clamp((abs(x) - ${f(HIP_X)}) / ${f(SKIRT_X - HIP_X)}, 0.0, 1.0)) : 1.0;
      x += (x > 0.0 ? 1.0 : -1.0) * spread * wide * (t > 0.5 ? 2.0 - 2.0 * t : 2.0 * t);
      /* Crossed, the shin goes over to the other side, the foot all the way and the knee not at all; and the hip goes out over the
         foot the weight is on, the hip all the way and the foot not at all. */
      x += -sideL * sitCross * sit * max(1.0 - 2.0 * t, 0.0) + ${f(SHIFT)} * weight * t;
    }
  } else if (!groundRig) {
    y -= lower;
    /* Above the hips, standing on one leg: down by half the hip that drops, out over that foot and tipped toward it, and toward a
       friend; and seated, leaning forward or back from the hips as its stance sits it. */
    float hip = legL - lower, tilt = ${f(TILT)} * weight - ${f(LEAN_TO)} * friend, ch = cos(tilt), sh = sin(tilt), hx = x, hy = y - hip;
    x = ch * hx - sh * hy + ${f(SHIFT)} * weight; y = hip - ${f(HIP_DROP / 2)} * abs(weight) + sh * hx + ch * hy;
    float pitch = sit * sitPitch, cp = cos(pitch), sp = sin(pitch), py = y - hip;
    y = hip + py * cp - z * sp; z = z * cp + py * sp;
  }

  if (!groundRig) {
    float lean = bobber ? stride : swayer ? stride * (1.0 + 0.6 * (1.0 - rise) * (1.0 - sit)) : waver ? 0.6 * stride : spinner ? 0.0 : nodder ? 0.25 * stride : clapper ? 0.3 * stride : 0.0;
    /* A foot stays flat where it stands as the figure leans over it, and so does a trouser's cuff, the ring at the foot: a foot that
       tipped with the lean lifted an edge off the ground and sank the other in it, which on a phone's small frame flickered against
       the lit ground, and a flared cuff that tipped went 9 cm into the ground drawn. A figure that leans back on its hands or lies
       back does not lean, for its hands would go into the ground; and seated, a figure leans from its hips, about them, and its legs
       stay where they rest, for a knee near the ground went into it as the figure leaned that way. */
    float tilt = footRig || cuff ? 0.0 : dance * ${f(SWAY)} * lean * (1.0 - sit * sitHands) * (onLeg ? 1.0 - sit : 1.0);
    if (!onLeg) {
      /* Above the hips: the stoop, which one with its arm round a friend straightens, so that the other's arm lies on its back; and,
         for one that sways, the lean back over its feet, most of twice as far as its legs lean out. */
      float over = max(y - legL + lower, 0.0), back = swayer ? -1.8 * tilt * (1.0 - rise) * (1.0 - sit) : 0.0;
      float ck = cos(back), sk = sin(back);
      z += aWear.z * over * (1.0 - abs(friend));
      y += sk * x + (ck - 1.0) * over; x = ck * x - sk * over;
    }
    float pivot = onLeg ? 0.0 : sit * (legL - lower), cs = cos(tilt), ss = sin(tilt), tx = cs * x - ss * (y - pivot), ty = ss * x + cs * (y - pivot) + pivot;
    float turn = spin * 1.6 * min(dance, 1.3) * turned * (1.0 - sit), cr = cos(turn), sr = sin(turn);
    x = cr * tx + sr * z; y = ty; z = cr * z - sr * tx + sit * sitAhead;
  }
  /* The ground under the figure falls or rises ahead of its seat as far as its seated feet follow it, and rises across it. Standing,
     the legs lean with it, ahead and across, as low says. Seated, the whole figure goes down with it ahead, each corner as far as
     the ground falls under it, upright; and leans with it across as far as it is near it, all the way on it and not at all
     GROUNDED over it; so that its seat, its thighs, its feet and its hands rest on it where they did on the level. Hands that rest
     on the ground reach down onto it, and so do knees that kneel on it. A skirt's hem never passes under it; nor does anything else of a figure as far as it sits,
     where a lap, a hem, a hoop or a knee would; and a taper's stand goes down to it where it falls away. */
  float seated = groundRig ? 0.0 : sit, nigh = clamp(1.0 - y / ${f(GROUNDED)}, 0.0, 1.0);
  /* Pressed onto the ground, a hand or a knee leans with it as far as it then is near it: leaning as far as it was before, a hand
     a reclining figure lay on stood 5 cm over a steep slope across it. */
  if (armRig || legRig) { y -= seated * nigh * (armRig ? sitHands * ${f(PRESS[0])} : kneel * ${f(PRESS[1])}); nigh = clamp(1.0 - y / ${f(GROUNDED)}, 0.0, 1.0); }
  y += mix(low, nigh, seated) * rises * x - fall * z / ${f(FOOT[0])} * mix(low, 1.0, seated);
  if (skirtRig) y = max(y, 0.012 - fall * z / ${f(FOOT[0])} + rises * x);
  else if (groundRig) y -= max(fall * ${f(STAND_Z)} / ${f(FOOT[0])} - rises * ${f(STAND_X)}, 0.0);
  else y = max(y, -fall * z / ${f(FOOT[0])} + rises * x - 0.4 * (1.0 - sit));
  /* The figure's place stands it on the ground as its seat stands or sits it (buildCrowd); the other way, standing to the build-up or
     sitting through Space, it stands aSize.w higher, as far as it has gone that way. A taper's stand stays on the ground. */
  if (!groundRig) y += (aFig.x > 0.5 ? 1.0 - sit : sit) * aSize.w;
  transformed.x = x; transformed.y = y; transformed.z = z;
}`;
/* After color_vertex, where the colour is the corner's own, its figure's numbers for its top (buildCrowd): the top's colour as a tone
   (tone), its second colour's, and its pattern with PATTERNS times the figure's own seed for it (PATTERN, under SEEDS). Every face takes a
   tone: its top's, or one of the figure's four (aTone, each as tone() packs it), or a shoe's near black, or what it holds up its dye.
   A face of the top, a long sleeve or a long shirt's tail, with a pattern, hands the fragment shader the pattern, the second colour
   and the seed (vDress.w, vSecond), but on the sleeves of a vest, which are its shirt's; vDress.xyz, where on the figure the face lies, comes after fog_vertex (DRESS_AT). */
const TONE = `
float tint = mod(aMark.z, ${n(TINTS)});
float dressing = vColor.b, second = vColor.g;
float cutting = mod(floor(aWear.y / ${n(STYLE.CUT)}), ${n(STYLE.STANCE / STYLE.CUT)});
bool shorts = ${has("cutting", CUT.SHORTS)}, bare = ${has("cutting", CUT.BARE)}, tunic = ${has("cutting", CUT.TUNIC)}, bald = ${has("cutting", CUT.BALD)};
float things = mod(aTone.w, ${n(DYE)}), most = ${f(MOST)};
float tone = ${is("tint", TINT.TOP)} ? vColor.r : ${is("tint", TINT.LEGS)} ? aTone.x : ${is("tint", TINT.HAIR)} ? aTone.y : ${is("tint", TINT.SELF)} ? aTone.z : ${is("tint", TINT.THING)} ? things
  : ${is("tint", TINT.SHIN)} ? (shorts ? aTone.z : aTone.x) : ${is("tint", TINT.FOREARM)} ? (bare ? aTone.z : vColor.r) : ${is("tint", TINT.SKIRT)} ? (tunic ? vColor.r : aTone.x)
  : ${is("tint", TINT.SCALP)} ? (bald ? aTone.z : aTone.y) : -2.0;
if (tint > ${n(TINT.CLOTH - 0.5)} && tint < ${n(TINT.CLOTH3 + 0.5)}) {
  float dye = mod(floor(aTone.w / ${n(DYE)}) + (${is("tint", TINT.CLOTH2)} ? 3.0 : ${is("tint", TINT.CLOTH3)} ? 5.0 : 0.0), ${n(CLOTHS.length)});
  tone = ${CLOTHS.map((hex, k) => (k < CLOTHS.length - 1 ? `dye < ${n(k + 0.5)} ? ${n(tone(hex, CLOTH_MOST))} : ` : n(tone(hex, CLOTH_MOST)))).join("")};
  most = ${f(CLOTH_MOST)};
}
if (tone > -0.5) {
  float red = mod(tone, 128.0) / 127.0, green = mod(floor(tone / 128.0), 128.0) / 127.0, blue = floor(tone / 16384.0) / 127.0;
  vColor.r = most * red * red; vColor.g = most * green * green; vColor.b = most * blue * blue;
} else {
  vColor.r = ${f(SHOE)}; vColor.g = ${f(SHOE)}; vColor.b = ${f(SHOE)};
}
float pattern = mod(dressing, ${n(PATTERNS)}), sleeve = aMark.x > ${n(RIG.ARM_L - 0.5)} && aMark.x < ${n(RIG.ARM_R + 0.5)} ? 1.0 : 0.0;
bool topped = ${is("tint", TINT.TOP)} || (${is("tint", TINT.FOREARM)} && !bare) || (${is("tint", TINT.SKIRT)} && tunic);
vDress.w = 0.0; vSecond.x = 0.0; vSecond.y = 0.0; vSecond.z = 0.0; vSecond.w = 0.0;
if (topped && pattern > 0.5 && !(sleeve > 0.5 && ${is("pattern", PATTERN.VEST)})) {
  float red2 = mod(second, 128.0) / 127.0, green2 = mod(floor(second / 128.0), 128.0) / 127.0, blue2 = floor(second / 16384.0) / 127.0;
  vDress.w = pattern;
  vSecond.x = most * red2 * red2; vSecond.y = most * green2 * green2; vSecond.z = most * blue2 * blue2; vSecond.w = floor(dressing / ${n(PATTERNS)}) / ${n(SEEDS - 1)};
}`;
/* After fog_vertex: where on the figure a face lies, in its own units as it stands before it moves, so a pattern keeps to the cloth
   as the figure dances. */
const DRESS_AT = `
vDress.xyz = position;`;
/* project_vertex for the crowd: the figure's place on the hill, as broad and as tall as it is (aSize.xy), turned (its turn, aSize.z)
   and stood at its seat (aPlace), and stepped where the parting has stepped it (aPart.xyz), in metres. Its first three lines are
   plain numbers too, and the unit tests run them against the figure's own matrix. */
const PROJECT = `
float turnC = cos(aSize.z), turnS = sin(aSize.z);
float wide = transformed.x * aSize.x, deep = transformed.z * aSize.x;
float putX = aPlace.x + turnC * wide + turnS * deep + aPart.x, putY = aPlace.y + aSize.y * transformed.y + aPart.y, putZ = aPlace.z - turnS * wide + turnC * deep + aPart.z;
vec4 mvPosition = modelViewMatrix * vec4(putX, putY, putZ, 1.0);
gl_Position = projectionMatrix * mvPosition;`;

/* The rim: a thin edge of light on each figure's stage side, as a stage lights a crowd from behind, which parts the figures from
   one another and from the ground at night. It is light added to what the figure reflects, and the night alone gives it: RIM at
   the deep of the night, and less as the night is less dark, down to RIM_LEAST of it where the night is not dark at all (`light`,
   which main.js hands the look's `dark`, night.js). So in the last light, when the stage's lights are on but the sky is bright, a
   figure alone in the open keeps a faint edge, and at night the whole crowd is outlined. Nothing of the music moves it, nor the
   beat, the rig, the stage's own light or the map, so it holds still while the figures dance; and the beams still light no figure
   (main.js). A face takes it as far as it stands edge-on to the eye, its facing to the power RIM_EDGE; and as far as the stage
   stands behind the figure from the eye (behind), or, seen from the side, as the face turns to the stage (stageward, RIM_SIDE of
   it). So from the hill, the stage beyond the figures, their outlines are lit all round; from the side, only the stage's side,
   and fainter; and from the stage, which stands before them, nothing. RIM_TO is the stage's middle at its lit panel's height
   (stage.js PANEL), RIM_TINT a warm white. At its brightest the rim adds under a tenth of full white's luminance to a pixel, and
   in the deep of the night more than the sky's and the house lights give back from the brightest shirt (crowd.test.ts). Its weight is written in plain numbers, after
   a line that takes the three dot products, so that the unit tests run it. */
export const RIM = 0.1, RIM_LEAST = 0.45, RIM_EDGE = 4, RIM_SIDE = 0.5, RIM_TINT = [1, 0.74, 0.46], RIM_TO = [STAGE[0], SHELF_Y + 3.7, STAGE[1]];
/* Before opaque_fragment, where the light the face reflects is summed: its normal in the view's space (`normal`, which three's flat
   shading takes from the face's own plane), and the way to the eye (`vViewPosition`). */
const RIM_LIGHT = `
vec3 toEye = normalize(vViewPosition), toStage = normalize((viewMatrix * vec4(uStage, 1.0)).xyz + vViewPosition);
float facing = dot(normal, toEye), stageward = dot(normal, toStage), behind = -dot(toEye, toStage);
float rimLit = uRim * pow(1.0 - clamp(facing, 0.0, 1.0), ${f(RIM_EDGE)}) * clamp(behind + ${f(RIM_SIDE)} * stageward, 0.0, 1.0);
outgoingLight += rimLit * vec3(${RIM_TINT.map(f).join(", ")});
`;

/* The light on the crowd. A figure takes the sky's light (the hemisphere light) and the sun's or the moon's (the key light) as the
   island does, and then lights of its own that the night alone gives, as the rim is: the stage's light, from LAMP_TO, the stage
   light's own place (stage.js) and the stage's glow's on the ground (island.js POOL_UP), half as strong LAMP_HALF m off, on the faces
   turned to it, so the crowd is lit from the stage and each body has a lit side and a shadow side; and the house lights, which the
   band played under, from above (HOUSE_LOW of it on a face turned down), so the crowd's backs keep their colours from the hill. Both
   are LIT and HOUSE at the deep of the night and nothing where it is not dark (`light`). None of the scene's point lights lights a
   figure: the stage light swings with the bass, the flame with it too, and a crowd that took them would swing with the music across
   the frame. Nor does the music's share of the sky's light (audio.js mappings, `hemi`), which `uSky` takes back out. So the music,
   the beat, the beams, the map and the downgrade's rungs move no light on the crowd: only the hour does. The beams still light no
   figure, and draw before it (main.js). How much of each a face takes is written in plain numbers, after a line that takes how
   squarely it turns to the stage and up and how far the stage is, so that the unit tests run it. */
export const LAMP_TO = [STAGE[0], SHELF_Y + 7, STAGE[1]], LAMP_HALF = 22, LIT = 0.55, LAMP_TINT = [1, 0.8, 0.58], HOUSE = 0.07, HOUSE_LOW = 0.35,
  HOUSE_TINT = [1, 0.93, 0.82];
const FRAGMENT_DECLARE = `uniform float uRim;
uniform vec3 uStage;
uniform vec3 uLamp;
uniform float uLit;
uniform float uHouse;
uniform float uSky;
varying vec4 vDress;
varying vec4 vSecond;`;
const STAGE_LIGHT = `
vec3 toLamp = (viewMatrix * vec4(uLamp, 1.0)).xyz + vViewPosition;
float lampFacing = dot(normal, normalize(toLamp)), lampFar = length(toLamp) / ${f(LAMP_HALF)}, houseUp = dot(normal, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)));
float lampLit = uLit * max(lampFacing, 0.0) / (1.0 + lampFar * lampFar), houseLit = uHouse * (${f(HOUSE_LOW)} + ${f(1 - HOUSE_LOW)} * (0.5 + 0.5 * houseUp));
outgoingLight += diffuseColor.rgb * (lampLit * vec3(${LAMP_TINT.map(f).join(", ")}) + houseLit * vec3(${HOUSE_TINT.map(f).join(", ")}));
`;
/* Three's lights, but for the point lights: their block, from its #if to its own #endif, left out. A newer three that writes it
   otherwise fails here, and does not light the crowd with the stage light again unseen. */
const POINT_LIGHTS = "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )";
function unlitByPoints() {
  const lines = THREE.ShaderChunk.lights_fragment_begin.split("\n"), from = lines.findIndex((line) => line.trim() === POINT_LIGHTS);
  let depth = 0, to = from;
  for (; from >= 0 && to < lines.length; to++) {
    depth += lines[to].trim().startsWith("#if") ? 1 : lines[to].trim() === "#endif" ? -1 : 0;
    if (depth === 0) break;
  }
  const kept = from < 0 || to === lines.length ? null : [...lines.slice(0, from), ...lines.slice(to + 1)].join("\n");
  if (!kept || kept.includes("pointLight")) throw new Error("crowd.js: three's lights_fragment_begin no longer has its point lights' loop as crowd.js reads it");
  return kept;
}

/* After color_fragment, where the face's colour is its tone: a top's pattern (PATTERN), drawn where on the figure the face lies
   (vDress.xyz), in the top's colour and its second (vSecond), as how much of the second it shows (`share`). Tie-dye is a spiral of the
   two from the chest, front and back alike, its arms (`spokes`) and its turn the figure's own seed's; stripes go round the body; checks
   are bands both ways, the top's colour where neither crosses, the second where both do; a vest is the second colour, open down the
   front over the shirt; a print is blots of the second. Each pattern grows finer than a pixel far off, so as its bands come nearer
   than DRESS_FINE of a pixel (`fine`) it turns to the colour it is on the whole, and a far figure is a steady colour and not a flicker
   of bands as it moves. How far a pixel spans on the figure along each of its three ways (`pixel`) is the shader's one derivative;
   the rest is plain numbers, so that the unit tests run it, and each pattern's `fine` takes the span along every way its bands change
   in: the tie-dye's along both ways of the chest, with its arms, which crowd together towards the spiral's centre, so that the centre
   turns to the colour on the whole and does not flicker even near; a check's along all three; a print's along all three; a vest's
   across its opening, its one band (down it and round the body, the opening has an edge and no band). A stripe's or a check's edge
   is softened over the pixel it crosses, and never by less than DRESS_EDGE of a band, so smoothstep's two ends stay apart, as GLSL
   needs, on a face its bands do not cross: a thousandth of a band is finer than a pixel ever spans where they do, which even at the
   camera's near plane (main.js), half a metre off, on a 4K screen, is about two thousandths of the coarser band, the check's. */
export const DRESS_FINE = [0.35, 0.8], DRESS_EDGE = 0.001;
const DRESS_LOOK = `
if (vDress.w > 0.5) {
  vec3 at = vDress.xyz, pixel = fwidth(vDress.xyz);
  float seed = vSecond.w, share = 0.0, cover = ${f(COVER[PATTERN.TIE])}, fine = 0.0;
  if (vDress.w < ${n(PATTERN.TIE + 0.5)}) {
    float aside = at.x, above = at.y - 1.24, reach = max(sqrt(aside * aside + above * above), 0.0001), spokes = 2.0 + floor(seed * 2.99), ring = reach * 11.0;
    float band = spokes * atan(above, aside) / 6.2832 + (seed > 0.5 ? ring : -ring) + 7.0 * seed;
    share = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(6.2832 * band));
    fine = max(pixel.x, pixel.y) * (11.0 + spokes / 6.2832 / reach);
  } else if (vDress.w < ${n(PATTERN.STRIPE + 0.5)}) {
    float band = at.y * 13.0;
    fine = pixel.y * 13.0;
    float soft = max(fine, ${f(DRESS_EDGE)});
    share = smoothstep(0.5 - soft, 0.5 + soft, abs(fract(band) - 0.5) * 2.0);
  } else if (vDress.w < ${n(PATTERN.CHECK + 0.5)}) {
    float down = at.y * 7.0, across = (at.x + at.z) * 7.0, downFine = pixel.y * 7.0, acrossFine = (pixel.x + pixel.z) * 7.0;
    float downSoft = max(downFine, ${f(DRESS_EDGE)}), acrossSoft = max(acrossFine, ${f(DRESS_EDGE)});
    share = 0.5 * (smoothstep(0.5 - downSoft, 0.5 + downSoft, abs(fract(down) - 0.5) * 2.0) + smoothstep(0.5 - acrossSoft, 0.5 + acrossSoft, abs(fract(across) - 0.5) * 2.0));
    fine = max(downFine, acrossFine);
  } else if (vDress.w < ${n(PATTERN.VEST + 0.5)}) {
    float open = 0.035 + 0.1 * clamp((at.y - 1.15) / 0.35, 0.0, 1.0);
    share = at.z > 0.0 && abs(at.x) < open ? 0.0 : 1.0;
    fine = pixel.x * 8.0;
    cover = ${f(COVER[PATTERN.VEST])};
  } else {
    float blot = sin(at.x * 47.0 + 20.0 * seed) * sin(at.y * 41.0 + 9.0 * seed) * sin(at.z * 53.0);
    share = smoothstep(0.18, 0.32, blot);
    fine = 0.5 * max(max(pixel.x * 47.0, pixel.y * 41.0), pixel.z * 53.0);
    cover = ${f(COVER[PATTERN.PRINT])};
  }
  diffuseColor.rgb = mix(vColor.rgb, vSecond.rgb, mix(share, cover, smoothstep(${f(DRESS_FINE[0])}, ${f(DRESS_FINE[1])}, fine)));
}
`;

/* Builds the crowd: at most `count` figures, on whole groups of the day's gathering (`seed`, seats.js) in the order it thins them,
   none of a group cut by the path, the bears' line or a circle round each landmark's bounds. It reads those bounds, so it runs before the landmarks merge
   (landmarks.js) empties them. Each figure faces the way its seat does, and is its own person (people): the standard figure stands
   PERSON tall, a child a little over half that and the tallest 8 % more, each as broad as its build and what it wears let it be
   inside the reaches above. `plain` builds plain figures,
   as a phone and a TV draw. `mix` turns the people that people() deals for the seats into others, given those people and the
   seats, as a test mixes them (every standing figure turning on the spot, say); the world passes none. `count` is how many it seated; `each` holds every figure's own numbers, a figure to a row, `figure` the
   geometry of one whole figure, and `corners` and `faces` where each figure's corners and faces begin in the mesh; `ground` the
   gathering as these figures stand it, for the island to wear (island.js crowdMask): their seats, the blankets any of them sits on,
   and the aisle. Each figure stands on `surface`, the ground as the tier's island draws it (island.js surfaceOf), which lies over or
   under the island's own height by up to half a metre between the points of a phone's grid; and its legs lean with it (DANCE). */
export function buildCrowd(scene, { count, path, line, landmarks, plain = false, seed = 0, surface = height, date = /** @type {string | null} */ (null), mix = (who, placed) => who }) {
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
  const placed = seats(around, seed, count), gathered = gathering(seed);
  const ground = { seats: placed, blankets: gathered.blankets.filter((_, k) => placed.some((p) => p.blanket === k)), aisle: gathered.aisle };
  const n = placed.length;
  const figure = figureGeometry(plain);
  const scale = PERSON / TALL, big = scale * 1.08;
  const uniforms = { uBeat: { value: 0 }, uDance: { value: 0 }, uRise: { value: 0 }, uSit: { value: 0 }, uRim: { value: 0 }, uStage: { value: new THREE.Vector3(...RIM_TO) },
    uLamp: { value: new THREE.Vector3(...LAMP_TO) }, uLit: { value: 0 }, uHouse: { value: 0 }, uSky: { value: 1 } };
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${DECLARE}`)
      .replace("#include <color_vertex>", `#include <color_vertex>${TONE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${DANCE}`)
      .replace("#include <project_vertex>", PROJECT)
      .replace("#include <fog_vertex>", `#include <fog_vertex>${DRESS_AT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${DRESS_LOOK}`)
      .replace("#include <lights_fragment_begin>", unlitByPoints())
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= uSky;")
      .replace("#include <opaque_fragment>", `${STAGE_LIGHT}${RIM_LIGHT}#include <opaque_fragment>`);
  };
  /* The options the parting (below) keeps the figures by, which also bound how broad one in a poncho may be (sized). */
  const opts = partingOptions(scale);
  /* Each figure's own numbers, a figure to a row: where it stands (as a matrix), its top's colour, and what the shader reads of it;
     how high it reaches over its feet at the most, in metres (`top`, reaches); and the parting's own two rows, where it has stepped each figure and how far
     it lets its arms rise. */
  const each = { count: n, matrix: new Float32Array(16 * n), dress: new Float32Array(3 * n), aFig: new Float32Array(4 * n), aBody: new Float32Array(4 * n),
    aWear: new Float32Array(4 * n), aCut: new Float32Array(4 * n), aTone: new Float32Array(4 * n), aPlace: new Float32Array(4 * n), aSize: new Float32Array(4 * n),
    forms: new Array(n), colours: new Array(n), top: new Float32Array(n), offset: /** @type {Float32Array} */ (null), rising: /** @type {Float32Array} */ (null), ball: new Float32Array(4 * n) };
  const near = Math.min(...placed.map((p) => p.r)), far = Math.max(...placed.map((p) => p.r));
  const dummy = new THREE.Object3D();
  const who = wardrobe(mix(people(placed), placed), date), palette = dressOn(date);
  /* Each figure's size: as tall as it is, its head's top that share of PERSON over its feet whatever its legs' length, and no taller
     than TOP lets what it holds up stand; and as broad as its build, and no broader than HANG lets what it wears reach, or FEET its
     seated feet, which also keeps it no broader than the largest figure the reaches are for. One in a full poncho, which neither
     hugs its knees nor has them up (stances), is no broader than lets it kneel clear of the visitor's bear (LOW, BEAR_LEGS), so that
     it may always sit one way: on forty days' crowds 88 of 2,383 in ponchos were up to 2.4 cm too broad at the knee for that, and
     70 of them, fitting no other way, had their knees up. And the ground under it, in its own units across and ahead of its seat,
     the way it faces. */
  const sized = (one) => {
    const { out, top, feet } = reaches(one, wearing(one));
    const tall = Math.min((scale * one.tall * TALL) / (TALL + LEG * (one.leg - 1)), (TOP * big - 0.005) / top);
    const kneels = one.top === "poncho" ? (opts.hang - BEAR_LEGS - 0.001) / (tall * (LOW.kneel[0] + LOW.kneel[1] * one.girth)) : Infinity;
    return { tall, top: top * tall, broad: Math.min(one.slim, (HANG * big - 0.003) / (tall * out), (FEET * big - 0.003) / (tall * feet), kneels) };
  };
  const under = (p, tall, broad, face) => {
    const cos = Math.cos(face), sin = Math.sin(face), wide = tall * broad;
    return (x, z) => surface(p.x + wide * (cos * x + sin * z), p.z + wide * (cos * z - sin * x));
  };
  /* A figure sits only as the ground under it lets it rest on it, the way it faces, its contacts no more than FLOAT over it; lies
     back only if its head then keeps clear of the bear under two metres (lyingOf, BEAR_TAIL), and sits cross-legged or kneels only
     if its knees keep clear of the bear's legs (LOW, BEAR_LEGS): a broad figure's head lying back once went 9.8 cm into the bear's
     tail, which reached furthest there then, and its knees cross-legged 6.3 cm into its legs. With its knees up and apart, too, and
     where no way of sitting fits, it stands: sat
     with its knees up anywhere, one stood its seat 7.4 cm over a phone's ground. Two stand together as friends where each one's hand,
     standing still, rests on the other's back (ON_BACK): from where it rests in its own units (FRIEND_HAND), in metres as each stands
     on its ground, to the other's units. A stance adds nothing to a friend that sizes it (WEARS). */
  const sizes = [], grounds = [];
  /* One turns on the spot only where its feet can sweep round it with those it rests on no more than FLOAT over the ground
     (nearing); elsewhere it sways: over a bump, the plane that kept its sweep out of the ground stood its feet 5 cm over it. */
  for (let i = 0; i < who.length; i++) if (who[i].move === "spin" && !placed[i].sit) {
    const one = plain ? plainly(who[i]) : who[i], { tall, broad } = sized(one);
    if (groundUnder(under(placed[i], tall, broad, placed[i].face), tall, "stand", "knees", fitted(one)).spread > FLOAT) who[i] = { ...who[i], move: "sway" };
  }
  const sizeOf = (i) => (sizes[i] ??= sized(plain ? plainly(who[i]) : who[i]));
  const dealt = stances(placed, who, (i, name, face, ground = true) => {
    if (!grounds[i]) { const { tall, broad } = sizeOf(i); grounds[i] = { tall, wide: tall * broad, at: under(placed[i], tall, broad, face), worn: fitted(plain ? plainly(who[i]) : who[i]) }; }
    const { wide } = grounds[i], { girth, big: head } = who[i];
    return (name !== "recline" || wide * lyingOf(head) <= opts.hang - BEAR_TAIL) && (!LOW[name] || wide * (LOW[name][0] + LOW[name][1] * girth) <= opts.hang - BEAR_LEGS)
      && (!ground || groundUnder(grounds[i].at, grounds[i].tall, name, "stand", grounds[i].worn).spread <= FLOAT);
  }, (tall, short, face) => {
    const stood = (i) => {
      const { tall: up, broad } = sizeOf(i), at = under(placed[i], up, broad, face), body = plain ? plainly(who[i]) : who[i];
      return { up, across: up * broad, y: at(0, 0) + groundUnder(at, up, "stand", "knees", fitted(body)).lift, x: placed[i].x, z: placed[i].z, body };
    };
    const a = stood(tall), b = stood(short), d = Math.hypot(b.x - a.x, b.z - a.z);
    return [[a, b, "round"], [b, a, "waist"]].every(([one, other, arm]) => {
      const [x0, y0, z0] = FRIEND_HAND[arm === "waist" && a.body.move === "shift" ? "shifted" : arm];
      const x = (x0 + SHOULDER_X * (one.body.wide - 1)) * one.across, y = (y0 + LEG * (one.body.leg - 1)) * one.up + one.y;
      const across = (x - d) / other.across, up = (y - other.y) / other.up, behind = (-z0 * one.across) / other.across - backOf(up, other.body.girth);
      return up >= ON_BACK[arm][0] && up <= ON_BACK[arm][1] && across >= ON_BACK.across[0] && across <= ON_BACK.across[1] && behind >= ON_BACK.behind[0] && behind <= ON_BACK.behind[1];
    });
  });
  /* The figure's pieces, each one form of one part's, or its body (pieces): what the mesh is made of, and what drawnOf draws. */
  const kit = new Map([[0, 0], ...Object.values(PART).flatMap((bit) => {
    const name = Object.keys(PART).find((k) => PART[k] === bit);
    return (FORMS[name] ?? [0]).map((_, form) => [bit, form]);
  })].map(([bit, form]) => [`${bit} ${form}`, pieces(figure, bit, form)]).filter(([, piece]) => piece.index.length > 0));
  /* Each figure's colours (dressFor), from the colours people dealt it and what of it the eye sees in each (drawnOf), its top's among
     them as it may give: what those within CLOSE m of it in the same top wear by then. */
  const tops = who.map((one) => one.colour.top);
  /* The seats come in a random order across the hill, so a figure's place in it picks its turn and its phase, and who it is. */
  placed.forEach((p, i) => {
    /* A friend whose arm is round the other's waist dances as the other does: its way, its phase and how far. */
    const lead = dealt[i].lead ?? i, mine = { ...who[i], move: who[lead].move, size: who[lead].size, stance: dealt[i] };
    const one = plain ? plainly(mine) : mine, worn = fitted(one), { tall, broad, top } = sized(one);
    /* The plane it lies on there (groundUnder): the ground as drawn bends away from a plane where a fold between two of its triangles
       runs under the figure, or where the hill rounds, so it is the plane that fits where the figure rests on the ground, standing or
       seated as its seat has it. */
    const turn = dealt[i].face ?? p.face, wide = tall * broad, at = under(p, tall, broad, turn);
    const sits = p.sit && !dealt[i].stands;
    const { drop, rises, lift, other } = sits ? groundUnder(at, tall, dealt[i].sit, "stand", worn) : groundUnder(at, tall, "stand", dealt[i].sit, worn);
    dummy.position.set(p.x, at(0, 0) + lift, p.z);
    each.top[i] = top;
    dummy.rotation.set(0, turn, 0);
    dummy.scale.set(wide, tall, wide);
    dummy.updateMatrix();
    dummy.matrix.toArray(each.matrix, 16 * i);
    each.aFig.set([sits ? 1 : 0, (lead * 0.618034) % 1, far > near ? (p.r - near) / (far - near) : 0, drop], 4 * i);
    each.aBody.set([one.girth, one.wide, one.leg, one.big], 4 * i);
    each.aWear.set([worn.parts, worn.style, one.stoop, one.size], 4 * i);
    each.aCut.set([one.hairLength, one.hem, one.crown, one.brim], 4 * i);
    each.forms[i] = formsOf(one);
    /* Its colours, from what of it the eye sees in each as the numbers it carries shape it. */
    const close = new Set(placed.flatMap((q, j) => (j !== i && who[j].top === one.top && Math.hypot(q.x - p.x, q.z - p.z) < CLOSE ? [tops[j]] : [])));
    const drawn = drawnOf(kit, { parts: worn.parts, forms: each.forms[i], cut: cutOf(one), shape: each.aCut.subarray(4 * i, 4 * i + 4), body: each.aBody.subarray(4 * i, 4 * i + 4),
      seat: sits ? dealt[i].sit : null, stage: stageTurn(p.x, p.z, turn) });
    const colours = (each.colours[i] = dressFor(palette, one, drawn, close));
    tops[i] = colours.top;
    const [shirt, pattern, second] = palette.top[colours.top];
    each.dress.set([tone(shirt), second === undefined ? 0 : tone(second), pattern + PATTERNS * seedOf(i)], 3 * i);
    each.aTone.set([tone(palette.legs[colours.legs]), tone(HAIRS[one.colour.hair]), tone(SKIN[one.colour.self]),
      tone(palette.thing[colours.thing]) + DYE * (one.colour.cloth ?? 0)], 4 * i);
    /* The same place as the shader takes it: where it stands and how the ground rises across it; and its breadth, its height, its turn,
       and how much higher it stands the other way, standing or seated, in its own units. */
    each.aPlace.set([dummy.position.x, dummy.position.y, dummy.position.z, rises], 4 * i);
    each.aSize.set([tall * broad, tall, turn, (other - lift) / tall], 4 * i);
  });
  /* The parting (partingOptions, opts above), each figure keeping clear of what the seats keep clear of, and its hands of the
     stage's solids (STAGE_COLUMN); a camera over the crowd keeps clear of each figure's own top, so it climbs over a flag and not
     over every head as if each held one. */
  const parts = parting(placed, { ...opts, tops: placed.map((p, i) => each.aPlace[4 * i + 1] - surface(p.x, p.z) + each.top[i]), keeps: [...keepOuts(around), [STAGE[0], STAGE[1], STAGE_COLUMN.r + opts.wide]], ground: surface });
  each.offset = parts.offset; each.rising = parts.rising;

  /* The mesh: every figure's body and the parts it wears, each in its form, and nothing it does not, one figure after another in the
     seats' order (kit, above). Each corner carries its figure's numbers beside its own place and mark. */
  /* What a figure wears goes before its body, so a renderer that tests depth before it shades a pixel passes by what of the body
     its clothes cover. */
  const wornBy = (i) => [...Object.values(PART).filter((bit) => Math.floor(each.aWear[4 * i] / bit) % 2 === 1).map((bit) => `${bit} ${each.forms[i][bit] ?? 0}`)
    .filter((key) => kit.has(key)), "0 0"];
  const corners = new Uint32Array(n + 1), faces = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    corners[i + 1] = corners[i]; faces[i + 1] = faces[i];
    for (const bit of wornBy(i)) { corners[i + 1] += kit.get(bit).position.length / 3; faces[i + 1] += kit.get(bit).index.length; }
  }
  const all = corners[n], rows = { position: 3, aMark: 4, color: 3, aPlace: 4, aSize: 4, aFig: 4, aBody: 4, aWear: 4, aCut: 4, aTone: 4, aPart: 4, aRise: 1 };
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
      held.color.set(each.dress.subarray(3 * i, 3 * i + 3), 3 * k);
      for (const name of ["aPlace", "aSize", "aFig", "aBody", "aWear", "aCut", "aTone"]) held[name].set(each[name].subarray(4 * i, 4 * i + 4), 4 * k);
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

  /* Lights the figures for a frame by how dark the night is, `dark` 0-1 (night.js lookAt), and by nothing else: their rims, RIM_LEAST
     of RIM where it is not dark at all and the whole of it in the deep of the night; the stage's light and the house lights, LIT and
     HOUSE at the deep of the night and none where it is not dark. `music` is the music's factor on the sky's light this frame (audio.js
     mappings, `hemi`), which the crowd takes back out of it, so it takes the sky's light as the hour gives it. For a loudness of
     0-1 audio.js gives it between 0.9 and 1.1; it is taken as no less than half all the same, so a factor that came to nothing could
     not light the crowd without end. */
  function light(dark, music = 1) {
    uniforms.uRim.value = RIM * (RIM_LEAST + (1 - RIM_LEAST) * dark);
    uniforms.uLit.value = LIT * dark;
    uniforms.uHouse.value = HOUSE * dark;
    uniforms.uSky.value = 1 / Math.max(music, 0.5);
  }

  /* Moves the figures round the visitor for a frame `dt` s long, the visitor's bear standing with its feet and head at `feet` and `head`
     (avatar.js), at once under reduced motion; the two attributes go up only in a frame where a figure moved or eased its arms, and
     only at that figure's corners. */
  function part(dt, feet, head, reduced) {
    if (!parts.step(dt, feet, head, reduced)) return;
    follow(false);
    geo.boundingSphere.radius = rest + parts.farthest[0];
  }

  /* Draws the first `some` figures, or as many fewer as the last whole group among them leaves (wholeGroups): the seats' order keeps
     both rings and the company round ?pose=among first and thins the rest in step all over the gathering. `shown` is how many are
     drawn. */
  let shown = n;
  function show(some) {
    shown = wholeGroups(placed, Math.max(0, Math.min(n, some)));
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

  return { mesh, each, figure, corners, faces, count: n, ground, get shown() { return shown; }, pose, light, part, show, cull, over: parts.over, ahead: parts.ahead, hold: parts.hold,
    get parted() { return parts.parted; } };
}
