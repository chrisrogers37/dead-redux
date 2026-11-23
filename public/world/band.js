/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* The band on the stage (stage.js): six players as flat black silhouettes, never likenesses, so all a visitor reads of them is their
   outline against the light panel behind. From the crowd's left: a bass, a guitar, two drummers side by side, a second guitar, and
   keys; with the stage's furniture, which is theirs: amplifiers, microphones on stands, wedge monitors at the lip.

   It costs eight draw calls on every tier. Each player's trunk, head and instrument are one mesh, which sways as one; every limb that
   moves on its own (legs, a strumming arm, a tapping foot, the keys' arms, the drummers' arms and sticks) is an instance of one
   tapered bar in one instanced mesh, laid each frame between two joints; and everything that stands still (the kits, the keyboards,
   the amplifiers, the stands, the shoes that stay down) is one merged mesh. One unlit material draws all of it.

   No one is anyone. The six are told apart by build, height and the outline of their hair (curls, short, a knot, a bob, long, a cap),
   none with a beard, glasses or a hat that points at a musician; the instruments are plain shapes of their kind, and the line-up
   stands where no band's did. */

/* A player is drawn in their own units, a person about 1.78 tall, and stands SCALE times that: the crowd's height (seats.js PERSON). */
export const SCALE = 1.77;

/* The band keeps its own count of the beat, and plays in half time when the figures' beat (beat.js) is fast: over HALF_OVER beats a
   second (105 a minute) its count runs at half the beat, until the beat falls under HALF_UNDER (90 a minute). So the count never runs
   faster than HALF_OVER a second, whatever the tempo.

   How the band moves is set by CLAUDE.md's bar on flashes, which the six capsules this band replaced broke two and three times
   over. A black limb against the lit panel swings a point's brightness as its edge passes, and at the hill's distance an arm, a
   stick or a guitar's neck is a pixel wide: it flickers on and off whole as it moves. So the band plays gently and slowly. What
   shows against the panel comes and goes once in four counts: a sway of the hips, a stick's stroke, a hand at the keys, each by no
   more than a hand's breadth, a pixel from the back of the crowd on a phone. What is quicker moves black over black: a hand
   strumming over its instrument, one way on a count and back on the next; or against the floor: a foot tapping the count. The
   heads stay at their microphones, and nothing moves on the half count. */
export const HALF_OVER = 1.75, HALF_UNDER = 1.5;

/* How far a standing player's trunk leans for each metre their hips sway, in rad, against the sway: so the mouth, 0.68 over the
   hips, stays where it is, at the microphone, and the hips and the instrument sway under it. */
const LEAN = 1.45;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), BACK = V(-1, 0, 0);

/* ---------- parts ---------- */

/* A part as the band's meshes take it: its corners alone. Nothing here is lit or textured. */
const bare = (geo) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  return g;
};
const turned = new THREE.Quaternion(), way = V();
/* A round bar from `a` to `b`, `ra` in radius at a and `rb` at b. */
const bar = (a, b, ra, rb = ra, sides = 6) => {
  const length = way.subVectors(b, a).length();
  return new THREE.CylinderGeometry(rb, ra, length, sides).translate(0, length / 2, 0)
    .applyQuaternion(turned.setFromUnitVectors(Y, way.normalize())).translate(a.x, a.y, a.z);
};
const ball = (c, r, sx = 1, sy = 1, sz = 1, detail = 1) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(c.x, c.y, c.z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/* A drum or a disc: `r0` in radius on top and `r1` below, `h` high, its middle at `c`, tipped `tip` rad about x and `roll` about z. */
const drum = (c, r0, r1, h, sides, tip = 0, roll = 0) => new THREE.CylinderGeometry(r0, r1, h, sides).rotateX(tip).rotateZ(roll).translate(c.x, c.y, c.z);
/* A flat plate cut to an outline of [x, y] points, `thick` deep about z = 0: rounded through the points, or straight between them. */
const plate = (points, thick, round = true) => {
  const shape = new THREE.Shape(), [first, ...rest] = points.map(([x, y]) => new THREE.Vector2(x, y));
  shape.moveTo(first.x, first.y);
  if (round) shape.splineThru(rest);
  else for (const p of rest) shape.lineTo(p.x, p.y);
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, -thick / 2);
};

/* The one bar every moving limb is an instance of: 1 long up y from its thick end, 1 across there and tapering, its ends eased. */
const LIMB = bare(new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.5, 0.07], [0.37, 0.95], [0.3, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 6));
/* Where a limb lies, as a matrix on LIMB: from `a` to `b`, `wide` across at a along `ref` (made square to the limb) and `thick` the
   other way, running `pads` past a and b so that two limbs meeting at a joint cover its bend. */
const side = V(), up = V(), along = V();
function lay(m, a, b, wide, thick, pads, ref) {
  const length = along.subVectors(b, a).length();
  along.divideScalar(length);
  side.copy(ref).addScaledVector(along, -ref.dot(along));
  if (side.lengthSq() < 1e-6) side.copy(Y).addScaledVector(along, -along.y);
  side.normalize();
  up.crossVectors(side, along);
  const l = length + pads[0] + pads[1], ax = a.x - along.x * pads[0], ay = a.y - along.y * pads[0], az = a.z - along.z * pads[0];
  return m.set(side.x * wide, along.x * l, up.x * thick, ax, side.y * wide, along.y * l, up.y * thick, ay, side.z * wide, along.z * l, up.z * thick, az, 0, 0, 0, 1);
}
/* A limb that never moves, as a part: the same bar, laid once. */
const laid = new THREE.Matrix4();
const limb = (a, b, wide, thick = wide, pads = [0, 0], ref = X) => LIMB.clone().applyMatrix4(lay(laid, a, b, wide, thick, pads, ref));

/* The elbow of an arm from a shoulder (`from`) to a wrist (`to`), `upper` and `fore` long, bent toward `pole`, written to `elbow`. A
   wrist past the arm's reach, or nearer the shoulder than a folded arm brings it, is taken as at the nearest place the arm reaches. */
const line = V(), bent = V();
function elbowOf(elbow, from, to, upper, fore, pole) {
  const reach = Math.max(Math.abs(upper - fore) * 1.001 + 0.001, Math.min(line.subVectors(to, from).length(), (upper + fore) * 0.999));
  line.normalize();
  const near = (upper * upper - fore * fore + reach * reach) / (2 * reach);
  bent.copy(pole).addScaledVector(line, -pole.dot(line)).normalize();
  return elbow.copy(from).addScaledVector(line, near).addScaledVector(bent, Math.sqrt(Math.max(0, upper * upper - near * near)));
}

/* A trunk and a head, facing +z, its hips `h` up: 0.92 standing and 0.6 seated. `broad` widens it. The hair is an outline and no
   more: "short", "long" past the shoulders, a "bob" to the jaw, "curls", a "cap" with a peak, a "knot" on the crown. Returns the
   parts, the hip joints and the shoulders (left first: +x is the player's left), and the mouth. */
function trunk(h, broad, hair) {
  const head = V(0, h + 0.735, 0.005);
  const parts = [
    new THREE.CylinderGeometry(0.17, 0.18, 0.2, 8).scale(broad, 1, 0.72).translate(0, h + 0.02, 0),
    new THREE.CylinderGeometry(0.2, 0.15, 0.34, 8).scale(broad, 1, 0.62).translate(0, h + 0.28, 0),
    new THREE.CapsuleGeometry(0.07, 0.41 * broad, 2, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.9).translate(0, h + 0.455, 0),
    new THREE.CylinderGeometry(0.07, 0.2, 0.09, 8).scale(broad, 1, 0.62).translate(0, h + 0.495, 0),
    new THREE.CylinderGeometry(0.05, 0.058, 0.1, 6).translate(0, h + 0.585, 0),
    ball(head, 0.112, 0.88, 1.12, 1),
  ];
  const lift = (x, y, z) => V(head.x + x, head.y + y, head.z + z);
  /* Hair that falls: a dome over the crown, and a skirt from it down to `to` below the head's middle, `wide` at its hem. */
  const fall = (to, wide) => [ball(lift(0, 0.012, -0.014), 0.124, 1, 1, 0.96),
    new THREE.CylinderGeometry(0.123, wide, to + 0.01, 8).scale(1, 1, 0.86).translate(head.x, head.y + 0.005 - to / 2, head.z - 0.02)];
  if (hair === "short" || hair === "knot") parts.push(ball(lift(0, 0.024, -0.018), 0.113, 0.93, 1, 1.02));
  if (hair === "knot") parts.push(ball(lift(0, 0.15, -0.045), 0.052));
  if (hair === "long") parts.push(...fall(0.33, 0.152));
  if (hair === "bob") parts.push(...fall(0.15, 0.142));
  if (hair === "curls") for (const a of [-0.5, 0.2, 0.9, 1.57, 2.25, 2.95, 3.65]) parts.push(ball(lift(0.094 * Math.cos(a), 0.02 + 0.094 * Math.sin(a), -0.012), 0.064, 1, 1, 1, 0));
  if (hair === "curls") parts.push(ball(lift(0, 0.03, -0.075), 0.09, 1, 1, 1, 0));
  if (hair === "cap") parts.push(new THREE.CylinderGeometry(0.096, 0.106, 0.08, 8).translate(head.x, head.y + 0.094, head.z), box(0.16, 0.014, 0.115, head.x, head.y + 0.062, head.z + 0.15));
  return { parts, hips: [V(0.09 * broad, h - 0.02, 0), V(-0.09 * broad, h - 0.02, 0)], shoulders: [V(0.205 * broad, h + 0.455, 0), V(-0.205 * broad, h + 0.455, 0)], mouth: V(0, h + 0.685, 0.105) };
}

/* A guitar or a bass, held: flat in its own frame, x along the strings from the body's end toward the head and y across them, with the
   point `strum` along the strings put at `at`, the neck risen `rise` rad to the player's left and brought `yaw` rad forward, drawn
   `big` times its size, a little over life, so that its outline carries from the hill. `body` is the body's outline from the neck's
   joint round to the joint again; the neck runs from `joint` to `nut`, `neck` wide; the head is `head` long and `spread` wide, with
   `pegs` each side `peg` across. Returns the parts and `on(x, y, z)`, a point of its frame in the player's. */
function axe({ at, rise, yaw, big, strum, body, joint, nut, neck, head, spread, pegs, peg }) {
  const hold = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationY(-yaw))
    .multiply(new THREE.Matrix4().makeRotationZ(rise)).multiply(new THREE.Matrix4().makeScale(big, big, big)).multiply(new THREE.Matrix4().makeTranslation(-strum, 0, 0));
  const half = spread / 2, tip = nut + head;
  const parts = [
    plate(body, 0.045),
    box(nut - joint + 0.04, neck, 0.028, (nut + joint - 0.04) / 2, 0, 0),
    plate([[nut - 0.01, -neck / 2], [nut + 0.035, -half], [tip - 0.02, -half * 0.9], [tip, 0], [tip - 0.02, half * 0.9], [nut + 0.035, half], [nut - 0.01, neck / 2]], 0.022, false),
  ];
  for (let k = 0; k < pegs; k++) for (const s of [1, -1]) parts.push(box(peg, peg * 0.9, 0.016, nut + 0.035 + ((k + 0.5) * (head - 0.07)) / pegs, s * (half + peg * 0.35), 0));
  return { parts: parts.map((p) => p.applyMatrix4(hold)), on: (x, y, z = 0) => V(x, y, z).applyMatrix4(hold) };
}
/* Three plain instruments: a guitar with two short horns, one with a single cutaway, and a bass, longer in the neck and the head. */
const TWO_HORNS = { strum: 0.19, joint: 0.42, nut: 0.9, neck: 0.052, head: 0.18, spread: 0.09, pegs: 3, peg: 0.024,
  body: [[0.42, 0.032], [0.455, 0.06], [0.47, 0.1], [0.4, 0.122], [0.32, 0.135], [0.24, 0.122], [0.15, 0.165], [0.07, 0.155], [0.012, 0.09], [0, 0],
    [0.012, -0.09], [0.06, -0.16], [0.14, -0.17], [0.24, -0.124], [0.33, -0.14], [0.42, -0.135], [0.49, -0.115], [0.46, -0.07], [0.42, -0.032]] };
const ONE_CUT = { strum: 0.19, joint: 0.43, nut: 0.91, neck: 0.052, head: 0.17, spread: 0.1, pegs: 3, peg: 0.024,
  body: [[0.43, 0.032], [0.445, 0.08], [0.41, 0.125], [0.34, 0.146], [0.26, 0.13], [0.16, 0.176], [0.08, 0.17], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.166], [0.15, -0.176], [0.25, -0.126], [0.33, -0.142], [0.41, -0.146], [0.475, -0.12], [0.45, -0.075], [0.43, -0.032]] };
const BASS = { strum: 0.2, joint: 0.47, nut: 1.16, neck: 0.058, head: 0.24, spread: 0.11, pegs: 2, peg: 0.034,
  body: [[0.47, 0.036], [0.55, 0.062], [0.58, 0.1], [0.46, 0.13], [0.36, 0.14], [0.27, 0.125], [0.17, 0.172], [0.08, 0.165], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.165], [0.17, -0.176], [0.27, -0.125], [0.37, -0.14], [0.46, -0.14], [0.54, -0.12], [0.5, -0.07], [0.47, -0.036]] };

/* A microphone on a stand, in a player's frame: the microphone at `to` (before the mouth), on a straight stand with a round foot at
   `foot` ([x, z]), or, with `boom`, at the end of an arm from a tripod there. */
function microphone(to, [x, z], boom) {
  const top = V(x, boom ? 1.38 : to.y - 0.1, z), aim = V().subVectors(to, top).normalize();
  const parts = [bar(V(x, 0.02, z), top, 0.014, 0.012, 5), bar(to.clone().addScaledVector(aim, -0.15), to, 0.02, 0.027, 6)];
  if (boom) {
    parts.push(bar(top.clone().addScaledVector(aim, -0.28), to.clone().addScaledVector(aim, -0.12), 0.012, 0.011, 5));
    for (const a of [0.4, 2.5, 4.6]) parts.push(bar(V(x, 0.3, z), V(x + 0.27 * Math.cos(a), 0.016, z + 0.27 * Math.sin(a)), 0.012, 0.012, 4));
  } else parts.push(bar(top, to.clone().addScaledVector(aim, -0.12), 0.012, 0.011, 5), drum(V(x, 0.014, z), 0.12, 0.14, 0.028, 10));
  return parts;
}

/* A cymbal on a stand, in a drummer's frame: `r` in radius, its middle at `c`, tipped `tip` rad toward the drummer and `roll` to the
   side, on a pole from a tripod at `foot` ([x, z]). */
function cymbal(c, r, tip, roll, [x, z]) {
  const parts = [drum(c, 0.03, r, 0.035, 12, tip, roll), bar(V(x, 0.25, z), c, 0.013, 0.011, 5), bar(V(x, 0.02, z), V(x, 0.25, z), 0.015, 0.015, 5)];
  for (const a of [0.9, 3, 5.1]) parts.push(bar(V(x, 0.26, z), V(x + 0.22 * Math.cos(a), 0.016, z + 0.22 * Math.sin(a)), 0.011, 0.011, 4));
  return parts;
}

/* ---------- the band ---------- */

/* Builds the band in the stage's group, whose floor is `floor` m up in the stage's own frame (+z toward the crowd). Returns the six
   `players` (each `plays` its part, and has its frame `g` and its `body`), the `limbs`' mesh and each of its `bones`, the `still`
   mesh with the corners each of its parts holds (`still.userData.parts`), the `joints` each bone is held at, the material, and
   `move`, which plays them. */
export function buildBand(stage, floor) {
  const black = new THREE.MeshBasicMaterial({ color: 0x0b0b0d });
  const players = [], bones = [], arms = [], legs = [], hinges = [], joints = [], fixed = [];

  /* A player's frame: where they stand on the floor, the way they face, and their size. */
  function player(plays, [x, z], facing, size) {
    const g = new THREE.Group();
    g.position.set(x, floor, z);
    g.rotation.y = facing;
    g.scale.setScalar(SCALE * size);
    g.updateMatrix();
    stage.add(g);
    const p = { plays, g, body: null, pivot: null, lean: 0, at: players.length, pose: null };
    players.push(p);
    return p;
  }
  /* The player's body: parts drawn upright in the player's frame, as one mesh that turns about `pivot`, leaning `lean` rad forward
     at rest. */
  function embody(p, parts, pivot, lean = 0) {
    p.body = new THREE.Mesh(mergeGeometries(parts.map(bare)).translate(-pivot.x, -pivot.y, -pivot.z), black);
    p.body.position.copy(pivot);
    p.body.rotation.x = lean;
    p.pivot = pivot.clone();
    p.lean = lean;
    p.g.add(p.body);
  }
  /* A point of the body, drawn upright in the player's frame: in the body's own frame, and where it lies once the body leans. */
  const ofBody = (p, v) => v.clone().sub(p.pivot);
  const leaned = (p, v) => ofBody(p, v).applyAxisAngle(X, p.lean).add(p.pivot);
  /* Parts that stand still, drawn in a player's frame (or, without one, in the stage's), under a name. */
  const keep = (p, of, parts) => { for (const part of parts) fixed.push({ of, by: p ? p.at : null, geo: p ? bare(part).applyMatrix4(p.g.matrix) : bare(part) }); };

  /* A bone: a limb that moves, of player `p`, `wide` and `thick` across at its thick end. A frame sets its ends, in the player's
     frame. One with a `span` lies along another's stretch, from one share of it to another. */
  function bone(p, name, wide, thick = wide, pads = [0, 0], ref = X, span = null) {
    const b = { of: p.at, name, wide, thick, pads, ref, span, a: V(), b: V(), at: bones.length };
    bones.push(b);
    return b;
  }
  /* An arm that reaches: an upper arm from `shoulder`, a point of the body, and a forearm to a wrist, `upper` and `fore` long, its
     elbow bent toward `pole`. `shoulder` is where the body, drawn upright, has it. A frame sets `to`, where the wrist is wanted, and
     `carry`, the way and the length of what the hand holds from there, both in the player's frame; `held` are the bones that lie
     along it (a hand, a stick). The shoulder moves with the body, and the wrist stays where it is put. */
  function arm(p, name, shoulder, upper, fore, pole, held) {
    const a = { p, shoulder: ofBody(p, shoulder), upper, fore, pole, to: V(), carry: V(), held,
      bones: [bone(p, `${name} upper arm`, 0.116, 0.116, [0.01, 0.04]), bone(p, `${name} forearm`, 0.1, 0.1, [0.04, 0.02])] };
    arms.push(a);
    joints.push({ bone: a.bones[0].at, end: 0, of: p.at, on: true, at: a.shoulder.clone() }, { bone: a.bones[1].at, end: 0, of: p.at, to: a.bones[0].at });
    for (const b of held) if (!b.span) joints.push({ bone: b.at, end: 0, of: p.at, to: a.bones[1].at });
    return a;
  }
  /* A leg: a thigh from a hip, which is the body's, and a shin down to an ankle, which stays where it is on the floor. The knee stands
     halfway between them and a little forward, so the leg follows the hips as they sway and the foot never slides. */
  function leg(p, name, hip, ankle) {
    const thigh = bone(p, `${name} thigh`, 0.2, 0.2, [0.01, 0.03]), shin = bone(p, `${name} shin`, 0.148, 0.148, [0.03, 0]);
    legs.push({ p, thigh, shin, hip: ofBody(p, hip), ankle: ankle.clone() });
    joints.push({ bone: thigh.at, end: 0, of: p.at, on: true, at: ofBody(p, hip) }, { bone: shin.at, end: 0, of: p.at, to: thigh.at },
      { bone: shin.at, end: 1, of: p.at, on: false, at: ankle.clone() });
  }
  /* A hinge: bones end to end from `pivot`, a point of the body (`on`) or of the player's frame, each lying along one of `rests`
     until a frame sets `turn`, which turns them all about `axis` by so many rad. */
  function hinge(p, on, pivot, axis, rests, held) {
    const h = { p, on, pivot, axis, rests, held, turn: 0 };
    hinges.push(h);
    held.forEach((b, k) => joints.push(k === 0 ? { bone: b.at, end: 0, of: p.at, on, at: pivot.clone() } : { bone: b.at, end: 0, of: p.at, to: held[k - 1].at }));
    return h;
  }
  /* The legs, the cuffs and the shoes of a player who stands with their ankles `stance` to either side: a shoe that stays down is a
     still part, and one that `taps` hinges at its heel, where a turn lifts its toe. */
  function stand(p, hips, stance, toes, back, taps) {
    let tap = null;
    for (const s of [1, -1]) {
      const ankle = V(s * stance, 0.1, back), heel = V(s * stance, 0.04, back - 0.075), toe = V(heel.x + s * 0.27 * Math.sin(toes), 0.04, heel.z + 0.27 * Math.cos(toes));
      leg(p, s > 0 ? "left" : "right", hips[s > 0 ? 0 : 1], ankle);
      keep(p, `${p.plays} cuff`, [new THREE.CylinderGeometry(0.062, 0.084, 0.14, 8).translate(ankle.x, 0.125, ankle.z)]);
      if (taps && s > 0) tap = hinge(p, false, heel, BACK, [toe.clone().sub(heel)], [bone(p, "tapping foot", 0.105, 0.08)]);
      else keep(p, `${p.plays} shoe`, [limb(heel, toe, 0.105, 0.08)]);
    }
    return tap;
  }

  /* The players' moves, each a share of `level` (0 standing, 1 playing), on the band's count less the player's own lag, a whole
     number of counts, so no two sway together and all keep the count. `slow` runs from 1 on a count to -1 two counts on and back:
     what follows it comes and goes once in four counts. */

  /* A guitar or a bass: standing, legs apart, the instrument across the body with its neck risen to the player's left, the left hand
     on the neck and the right over the strings. The hips sway to one side and, two counts on, to the other, the instrument with
     them, under a head that stays at its microphone. The right arm hangs by the trunk to an elbow tucked behind the instrument, and
     the forearm lies over it from there: it turns at the elbow, `strum` rad either way, the hand crossing the strings one way on a
     count and back on the next, black over the instrument's black from the front. The left foot taps, down on the count. */
  function strummer(plays, spot, facing, { size, broad, hair, stance, toes, hold, fret, sway, strum, tap, lag, mic }) {
    const p = player(plays, spot, facing, size);
    const t = trunk(0.92, broad, hair), a = axe(hold);
    const [left, right] = t.shoulders;
    const hand = a.on(fret, -0.01, -0.035), elbow = elbowOf(V(), left, hand, 0.29, 0.27, V(0.75, -1, -0.2));
    /* The strumming arm: its wrist over the strings behind the hand's reach, its fingers at them. */
    const wrist = a.on(hold.strum - 0.05, 0.075, 0.06), fingers = a.on(hold.strum + 0.005, 0.01, 0.05);
    const tucked = elbowOf(V(), right, wrist, 0.29, 0.26, V(-0.55, -0.5, -0.65));
    embody(p, [...t.parts, ...a.parts, bar(left, elbow, 0.058, 0.049), ball(elbow, 0.051, 1, 1, 1, 0), bar(elbow, hand, 0.049, 0.038), ball(hand, 0.052, 1, 0.85, 1, 0),
      bar(right, tucked, 0.06, 0.053), ball(tucked, 0.055, 1, 1, 1, 0)], V(0, 0.93, 0));
    const face = a.on(0, 0, 1).sub(a.on(0, 0)).normalize();
    const strumming = hinge(p, true, ofBody(p, tucked), face, [wrist.clone().sub(tucked), fingers.clone().sub(wrist)],
      [bone(p, "strumming forearm", 0.1, 0.1, [0.03, 0.01]), bone(p, "strumming hand", 0.08, 0.05, [0.02, 0.012], face)]);
    const foot = stand(p, t.hips, stance, toes, 0, true);
    if (mic) keep(p, "microphone", microphone(V(0, t.mouth.y - 0.005, 0.17), mic.foot, mic.boom));
    const { body, pivot } = p;
    p.pose = (count, level, time) => {
      const slow = Math.cos((Math.PI * (count - lag)) / 2), stroke = Math.cos(Math.PI * (count - lag)), beat = Math.cos(2 * Math.PI * (count - lag));
      const shift = level * sway * slow + (1 - level) * 0.006 * Math.sin(time * (0.7 + 0.13 * p.at));
      body.position.set(pivot.x + shift, pivot.y + (1 - level) * 0.006 * Math.sin((Math.PI * time) / 2), pivot.z);
      body.rotation.set(level * 0.02 * slow, 0, LEAN * shift);
      strumming.turn = -level * strum * stroke;
      foot.turn = (level * tap * (1 - beat)) / 2;
    };
    return p;
  }

  /* The keys: two keyboards on a crossed stand, the player standing behind it, a hand on each. The hands rise and fall in turn, each
     down once in four counts, and the shoulders dip toward the keys with the left while the hands stay where they play. */
  function keys(spot, facing, { size, broad, hair, stance, lag, mic }) {
    const p = player("keys", spot, facing, size);
    const t = trunk(0.92, broad, hair);
    embody(p, t.parts, V(0, 0.93, 0), 0.1);
    const lower = { y: 0.9, z: 0.46 }, upper = { y: 1.1, z: 0.64 };
    const rig = [box(1.32, 0.09, 0.31, 0, lower.y, lower.z), new THREE.BoxGeometry(1.06, 0.08, 0.27).rotateX(0.22).translate(0.04, upper.y, upper.z)];
    for (const s of [1, -1]) {
      rig.push(bar(V(s * 0.52, 0.03, lower.z), V(-s * 0.44, 0.85, lower.z), 0.02, 0.02, 4), box(0.05, 0.035, 0.52, s * 0.52, 0.0175, lower.z),
        box(0.05, 0.03, 0.34, s * 0.44, 0.85, lower.z), bar(V(s * 0.4, 0.85, lower.z + 0.1), V(s * 0.4, upper.y - 0.03, upper.z + 0.02), 0.018, 0.018, 4));
    }
    keep(p, "keyboard", rig);
    /* The hands: the left on the lower keyboard and the right on the upper, each a wrist behind its fingertips. */
    const hands = [[1, "left", V(0.24, lower.y + 0.075, lower.z - 0.03)], [-1, "right", V(-0.2, upper.y + 0.085, upper.z - 0.05)]].map(([s, name, tip], k) => {
      const wrist = tip.clone().add(V(s * 0.012, 0.035, -0.08));
      return { wrist, fingers: tip.clone().sub(wrist), arm: arm(p, name, t.shoulders[k], 0.29, 0.26, V(s * 0.9, -1, -0.9), [bone(p, `${name} hand`, 0.085, 0.045, [0.02, 0.012])]) };
    });
    stand(p, t.hips, stance, 0.18, -0.02, false);
    if (mic) keep(p, "microphone", microphone(leaned(p, V(0, t.mouth.y - 0.005, 0.17)), mic.foot, mic.boom));
    const { body, pivot, lean } = p;
    p.pose = (count, level, time) => {
      const slow = Math.cos((Math.PI * (count - lag)) / 2);
      body.position.set(pivot.x, pivot.y + (1 - level) * 0.006 * Math.sin((Math.PI * time) / 2), pivot.z);
      body.rotation.set(lean + level * 0.015 * slow, 0, -level * 0.01 * slow);
      for (let k = 0; k < 2; k++) {
        const { wrist, fingers, arm: a } = hands[k], rise = (level * (k === 0 ? 1 - slow : 1 + slow)) / 2;
        a.to.copy(wrist);
        a.to.y += 0.06 * rise;
        a.to.z -= 0.02 * rise;
        a.carry.copy(fingers).applyAxisAngle(BACK, 0.35 * rise);
      }
    };
    return p;
  }

  /* A drummer at a kit, seated: a kick drum facing the crowd with toms over it, a snare, a floor tom, a hi-hat and two cymbals on
     stands. The hands play in front of the trunk, the left on the snare and the right on a tom, so from the hill the sticks, which
     are thin, move over the black of the kit and the drummer, and what shows against the panel is the elbows, out to either side.
     The right stick falls on one count and the left two counts on: each rises slowly and falls once in four counts, so one is
     down while the other is at its top. The trunk rocks once in four counts, and the hands stay where they play. */
  function drummer(spot, facing, { size, broad, hair, lag, toms, tom, ride, crash, hat }) {
    const p = player("drums", spot, facing, size);
    const t = trunk(0.6, broad, hair);
    embody(p, t.parts, V(0, 0.62, 0), 0.07);
    const kit = [
      drum(V(0, 0.29, 0.88), 0.28, 0.28, 0.42, 16, Math.PI / 2), bar(V(0.2, 0.22, 1.02), V(0.34, 0.016, 1.12), 0.012, 0.012, 4), bar(V(-0.2, 0.22, 1.02), V(-0.34, 0.016, 1.12), 0.012, 0.012, 4),
      drum(V(0.05, 0.6, 0.4), 0.18, 0.18, 0.14, 12), bar(V(0.05, 0.53, 0.4), V(0.05, 0.02, 0.4), 0.014, 0.014, 5),
      drum(V(-0.45, 0.42, 0.3), 0.2, 0.2, 0.36, 12), bar(V(-0.63, 0.3, 0.3), V(-0.67, 0.016, 0.3), 0.011, 0.011, 4), bar(V(-0.35, 0.3, 0.46), V(-0.33, 0.016, 0.5), 0.011, 0.011, 4),
      drum(V(0, 0.5, -0.02), 0.17, 0.17, 0.07, 10), bar(V(0, 0.47, -0.02), V(0, 0.2, -0.02), 0.022, 0.022, 5),
      ...cymbal(V(hat[0], hat[1], hat[2]), 0.18, 0, 0, [hat[0], hat[2]]), drum(V(hat[0], hat[1] - 0.045, hat[2]), 0.18, 0.03, 0.035, 12),
      ...cymbal(V(ride[0], ride[1], ride[2]), 0.26, -0.3, -0.12, [ride[0] + 0.14, ride[2] + 0.2]),
      ...cymbal(V(crash[0], crash[1], crash[2]), 0.22, 0.28, 0.1, [crash[0] + 0.06, crash[2] + 0.1]),
    ];
    for (const a of [0.5, 2.6, 4.7]) kit.push(bar(V(0, 0.22, -0.02), V(0.24 * Math.cos(a), 0.018, -0.02 + 0.24 * Math.sin(a)), 0.014, 0.014, 4));
    for (const [x, r] of toms) kit.push(drum(V(x, 0.83, 0.74), r, r, 0.2, 12, -0.42), bar(V(x * 0.6, 0.72, 0.8), V(0, 0.56, 0.84), 0.014, 0.014, 4));
    keep(p, "kit", kit);
    /* The legs, which stay on the pedals. */
    for (const s of [1, -1]) {
      const knee = V(s * 0.22, 0.6, 0.38), ankle = V(s * 0.25, 0.12, 0.5);
      keep(p, "drums leg", [limb(t.hips[s > 0 ? 0 : 1], knee, 0.19, 0.19, [0.02, 0.04]), limb(knee, ankle, 0.14, 0.14, [0.04, 0])]);
      keep(p, "drums cuff", [new THREE.CylinderGeometry(0.062, 0.08, 0.13, 8).translate(ankle.x, 0.125, ankle.z)]);
      keep(p, "drums shoe", [limb(V(ankle.x, 0.04, ankle.z - 0.07), V(ankle.x + s * 0.02, 0.04, ankle.z + 0.2), 0.105, 0.08)]);
    }
    /* The arms. Each stick's tip rests where it falls, the left on the snare and the right on the tom at `tom`, its hand a stick's
       hold behind. A stroke tips the stick back `raise` rad, over the kit's black, and lifts the hand by `lift`, a little: the
       elbows stand beside the cymbals, and an arm that swept past one would flicker the gap between them. */
    const sticks = [
      { s: 1, name: "left", tip: V(0.07, 0.69, 0.36), grip: V(0.25, 0.79, 0.13), pole: V(1, -0.2, -0.45), lift: V(0.005, 0.035, -0.01), raise: 0.6 },
      { s: -1, name: "right", tip: V(tom[0], tom[1], tom[2]), grip: V(tom[0] - 0.07, tom[1] - 0.03, tom[2] - 0.31), pole: V(-1, -0.2, -0.45), lift: V(-0.005, 0.035, -0.01), raise: 0.6 },
    ].map(({ s, name, tip, grip, pole, lift, raise }) => ({ grip, aim: tip.clone().sub(grip), lift, raise,
      arm: arm(p, name, t.shoulders[s > 0 ? 0 : 1], 0.29, 0.25, pole, [bone(p, `${name} stick`, 0.03, 0.03, [0.09, 0]), bone(p, `${name} hand`, 0.085, 0.07, [0, 0], X, [-0.14, 0.14])]) }));
    const { body, pivot, lean } = p;
    /* A stroke through `turn` of its four counts, from the stick's fall (0): it lies where it fell, rises slowly from 0.15 to its top
       at 0.7, and falls, faster, to land on its count. The rise and the fall are a second apart or more at any point the arm
       passes, which keeps an arm a pixel wide from flickering there. */
    const stroke = (turn) => {
      const f = turn - Math.floor(turn);
      if (f < 0.15) return 0;
      if (f < 0.7) { const r = (f - 0.15) / 0.55; return r * r * (3 - 2 * r); }
      const d = (f - 0.7) / 0.3;
      return 1 - d * d;
    };
    p.pose = (count, level, time) => {
      const c = count - lag, slow = Math.cos((Math.PI * c) / 2);
      body.position.set(pivot.x, pivot.y + (1 - level) * 0.005 * Math.sin((Math.PI * time) / 2), pivot.z);
      body.rotation.set(lean + level * 0.03 * slow, 0, level * 0.03 * slow);
      for (let k = 0; k < 2; k++) {
        const { grip, aim, lift, raise, arm: a } = sticks[k], up = level * stroke((c - (k === 0 ? 2 : 0)) / 4);
        a.to.copy(grip).addScaledVector(lift, up);
        a.carry.copy(aim).applyAxisAngle(BACK, raise * up);
      }
    };
    return p;
  }

  /* The line-up, from the crowd's left: the guitars in front, the bass and the keys a step back, and the drummers behind, side by
     side. They stand close enough that from the front of the crowd all six fall on the light panel, and apart enough that from
     the hill no instrument's head sways across a neighbour's cymbal or stand: where one black edge slides past another a pixel
     away, the gap between them flickers. No two stand, sway or wear their hair alike. */
  strummer("bass", [-6.05, -1.3], 0.25, { size: 1.0, broad: 1.06, hair: "curls", stance: 0.2, toes: 0.3, fret: 0.9, sway: 0.035, strum: 0.05, tap: 0.1, lag: 1,
    hold: { ...BASS, at: V(-0.1, 0.9, 0.18), rise: 0.76, yaw: 0.2, big: 1.08 }, mic: { foot: [0.03, 0.38], boom: false } });
  strummer("guitar", [-3.5, 1.5], 0.1, { size: 1.035, broad: 0.98, hair: "short", stance: 0.18, toes: 0.22, fret: 0.76, sway: -0.04, strum: 0.15, tap: 0.13, lag: 0,
    hold: { ...TWO_HORNS, at: V(-0.13, 0.99, 0.18), rise: 0.5, yaw: 0.22, big: 1.1 }, mic: { foot: [0.02, 0.4], boom: false } });
  drummer([-1.25, -2.5], 0.06, { size: 0.99, broad: 1.04, hair: "knot", lag: 0, toms: [[0.17, 0.15], [-0.18, 0.165]], tom: [-0.19, 0.93, 0.58], hat: [0.5, 0.88, 0.3], ride: [-0.6, 1.12, 0.46], crash: [0.36, 1.3, 0.7] });
  drummer([1.3, -2.5], -0.06, { size: 1.02, broad: 1.0, hair: "bob", lag: 1, toms: [[0.0, 0.165]], tom: [-0.06, 0.93, 0.58], hat: [0.5, 0.9, 0.32], ride: [-0.52, 1.04, 0.44], crash: [0.42, 1.22, 0.66] });
  strummer("guitar", [3.35, 1.4], -0.12, { size: 0.955, broad: 0.93, hair: "long", stance: 0.16, toes: 0.25, fret: 0.68, sway: 0.045, strum: 0.13, tap: 0.11, lag: 2,
    hold: { ...ONE_CUT, at: V(-0.12, 1.02, 0.18), rise: 0.38, yaw: 0.3, big: 1.1 }, mic: { foot: [0.3, 0.47], boom: true } });
  keys([6.35, -1.2], -1.1, { size: 1.0, broad: 1.02, hair: "cap", stance: 0.17, lag: 3, mic: { foot: [0.82, 0.3], boom: true } });

  /* The furniture, in the stage's frame: three amplifiers, each with its head on it, low and set between the players or behind the
     outer two, so each stands clear of every instrument from the hill; and three wedge monitors at the lip, between the players'
     feet. */
  const wedge = (x, z, turn) => plate([[-0.27, 0], [0.27, 0], [0.27, 0.32], [0.1, 0.34], [-0.27, 0.08]], 0.62, false).rotateY(-Math.PI / 2 + turn).translate(x, floor, z);
  const amplifier = (x, z, w, h, turn) => [new THREE.BoxGeometry(w, h, 0.5).translate(0, h / 2, 0), new THREE.BoxGeometry(w * 0.8, 0.22, 0.38).translate(0, h + 0.11, 0)].map((part) => part.rotateY(turn).translate(x, floor, z));
  keep(null, "amplifier", [...amplifier(-7.3, -3.4, 1.0, 0.8, 0.25), ...amplifier(-5.5, -3.2, 0.9, 0.7, 0.1), ...amplifier(7.35, -3.3, 0.9, 0.7, -0.25)]);
  keep(null, "monitor", [wedge(-3.95, 3.0, 0.2), wedge(-2.45, 3.3, -0.1), wedge(2.2, 3.2, 0.15)]);

  /* The still parts as one mesh, which remembers the corners each named part holds. */
  let from = 0;
  const parts = fixed.map(({ of, by, geo }) => { const part = { of, by, from, count: geo.attributes.position.count }; from += part.count; return part; });
  const still = new THREE.Mesh(mergeGeometries(fixed.map((f) => f.geo)), black);
  still.userData.parts = parts;
  stage.add(still);

  /* The limbs: one instanced mesh in the stage's frame. Every bone stays over the floor, so the mesh culls against the camera by one
     sphere round the stage, without measuring its bones. */
  const limbs = new THREE.InstancedMesh(LIMB, black, bones.length);
  limbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  limbs.boundingSphere = new THREE.Sphere(V(0, floor + 2, 0), 9.5);
  stage.add(limbs);

  /* Lays every bone where the players' poses put it: each leg from its hip, each arm from its shoulder to its wrist with what the hand
     holds, each hinge's bones from its pivot; then each bone's matrix, from the player's frame into the stage's. */
  const m = new THREE.Matrix4(), end = V(), swung = V();
  function place() {
    for (let k = 0; k < legs.length; k++) {
      const { p, thigh, shin, hip, ankle } = legs[k];
      thigh.a.copy(hip).applyEuler(p.body.rotation).add(p.body.position);
      thigh.b.addVectors(thigh.a, ankle).multiplyScalar(0.5);
      thigh.b.z += 0.03;
      shin.a.copy(thigh.b);
      shin.b.copy(ankle);
    }
    for (let k = 0; k < arms.length; k++) {
      const { p, shoulder, upper, fore, pole, to, carry, held, bones: [top, low] } = arms[k];
      top.a.copy(shoulder).applyEuler(p.body.rotation).add(p.body.position);
      low.a.copy(elbowOf(top.b, top.a, to, upper, fore, pole));
      /* The wrist: the forearm's length from the elbow toward where it is wanted, which is there unless it is out of reach. */
      low.b.subVectors(to, low.a).setLength(fore).add(low.a);
      for (let i = 0; i < held.length; i++) {
        const b = held[i];
        b.a.copy(low.b);
        b.b.copy(low.b);
        if (b.span) { b.a.addScaledVector(carry, b.span[0]); b.b.addScaledVector(carry, b.span[1]); } else b.b.add(carry);
      }
    }
    for (let k = 0; k < hinges.length; k++) {
      const { p, on, pivot, axis, rests, held, turn } = hinges[k];
      end.copy(pivot);
      for (let i = 0; i < held.length; i++) {
        const b = held[i];
        b.a.copy(end);
        b.b.copy(end.add(swung.copy(rests[i]).applyAxisAngle(axis, turn)));
        if (on) { b.a.applyEuler(p.body.rotation).add(p.body.position); b.b.applyEuler(p.body.rotation).add(p.body.position); }
      }
    }
    for (let k = 0; k < bones.length; k++) {
      const b = bones[k];
      limbs.setMatrixAt(k, lay(m, b.a, b.b, b.wide, b.thick, b.pads, b.ref).premultiply(players[b.of].g.matrix));
    }
    limbs.instanceMatrix.needsUpdate = true;
  }

  /* The band's count: the figures' beat, or half of it while that is fast (HALF_OVER), eased onto the beat again over two seconds
     after a change, so no one jumps. `rate` is the beat's own speed, in beats a second, smoothed over half a second. */
  let level = 0, count = 0, last = null, rate = 0, half = false;
  /* Plays the band for a frame `dt` s long: `beats` is the figures' phase in beats, which the caller keeps (beat.js), and `time` the
     world's time in seconds. While the show plays they play, on their count; otherwise they stand, breathing on a 4-s cycle and
     shifting their weight. Each change eases over 0.8 s. Under reduced motion nothing calls this, so they stand as they were built:
     at rest, their hands on their instruments. Nothing here makes anything: a frame's work is arithmetic on what the build made. */
  function move(dt, time, beats, playing) {
    level = Math.max(0, Math.min(1, level + (playing ? dt : -dt) / 0.8));
    const step = last === null ? 0 : Math.max(0, Math.min(1, beats - last));
    last = beats;
    if (dt > 0) rate += (step / dt - rate) * Math.min(1, dt / 0.5);
    if (rate > HALF_OVER) half = true;
    else if (rate < HALF_UNDER) half = false;
    const pace = half ? 0.5 : 1;
    count += step * pace;
    const off = count - beats * pace;
    count -= (off - Math.round(off / pace) * pace) * Math.min(1, dt / 2);
    for (let k = 0; k < players.length; k++) players[k].pose(count, level, time);
    place();
  }
  for (let k = 0; k < players.length; k++) players[k].pose(0, 0, 0);
  place();

  return { players, limbs, bones, joints, still, black, move };
}
