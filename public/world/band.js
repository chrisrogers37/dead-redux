import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* The band on the stage (stage.js): six players as flat black silhouettes, never likenesses, so all a visitor reads of them is their
   outline against the light panel behind. From the crowd's left: a guitar, a bass, two drummers side by side, a second guitar, and
   keys; with the stage's furniture, which is theirs: microphones on stands and wedge monitors at the lip.

   It costs eight draw calls on every tier. Each player's trunk and instrument are one mesh, which sways as one, a drummer's head
   with it; the head of each of the four who sing stands still, among the still parts; every limb that moves on its own (legs, a
   strumming arm, a tapping foot, the keys' arms, the drummers' arms and sticks) is an instance of one tapered bar in one instanced
   mesh, laid each frame between two joints; and everything that stands still (the kits, the organ, the stands, the shoes that stay
   down) is one merged mesh. One unlit material draws all of it.

   No one is anyone, and by construction: no player pairs an instrument with the build and the hair a fan knows a player of it by.
   The six are told apart by build, height, clothes and the outline of their hair: a tall, lean guitarist in a peaked cap, a long
   coat and boots; a short bassist in a long skirt, hair in a bun at the back of the crown; a drummer with a tail of hair and one
   with long hair; a broad guitarist in a long skirt with a bob; a slight keys player with short hair. None has a beard, a brimmed
   hat or a bushy head, and no collar and no hair stands under a jaw, where a silhouette would read it as a beard. The bass stands
   between the two guitars and the keys player faces the crowd: the band this site is for stood its bass at an end of its front
   line through all its years, as far as its stage plots are known here. The instruments are plain shapes of their kind. */

/* A player is drawn in their own units, a person about 1.78 tall, and stands SCALE times that: the crowd's height (seats.js PERSON). */
export const SCALE = 1.77;

/* The band keeps its own count of the beat, and plays in half time when the figures' beat (beat.js) is fast: over HALF_OVER beats a
   second (105 a minute) its count runs at half the beat, until the beat falls under HALF_UNDER (90 a minute). So the count never runs
   faster than HALF_OVER a second, whatever the tempo: nor in the frames before half time takes hold, while the beat's smoothed speed
   (RATE_SMOOTH) rises past it, when the count is held to that pace and comes back onto the beat after (RETUNE). The pull back onto
   the beat is held to the same pace, and never runs the count back: `move` returns the count, and a test steps it frame by frame.

   How the band moves is set by CLAUDE.md's bar on flashes, which the six capsules this band replaced broke two and three times
   over. A black limb against the lit panel swings a point's brightness as its edge passes, and at the hill's distance an arm, a
   stick or a guitar's neck is a pixel wide: it flickers on and off whole as it moves. So the band plays gently and slowly. What
   shows against the panel comes and goes once in four counts: a sway of the hips, by no more than a hand's breadth, a pixel from
   the back of the crowd on a phone; a hand lifted off the keys; a stick's stroke, which lifts its tip out past the drummer's
   shoulder, so the drummers show playing from the front. What is quicker moves black over black: a hand strumming over its
   instrument, one way on a count and back on the next; or against the floor: a foot tapping the count. The heads of the four who
   sing stand still at their microphones, and nothing moves on the half count.

   And nothing creeps. Each move holds still, goes at an even pace over MOVE of a count and arrives on a count, and holds again;
   a stick lies on its drum, climbs at an even pace, holds at its top and falls at an even pace (STROKE). An edge that eased
   to a stop lingered on a pixel's middle, where the GPU's rounding of its corners flipped that pixel frame after frame: the keys
   player's arm, at the end of a sway, 16 times in a second from the stage pose on a phone.

   And the outlines are closed. Nothing here is antialiased, so a pocket of the panel's light a pixel or two wide inside a player's
   outline is lit or black as a whole pixel, and an edge that rests on that pixel's centre flips it from one frame to the next: a
   drummer's arm, nearly still, counted 11 swings in a second at one pixel under it at daybreak, with the edge within three
   thousandths of a pixel of the centre for 18 frames. So no limb stands a little off a trunk or an instrument: a guitarist's arm
   lies against the trunk to the elbow, a fretting arm's bend is filled to the neck, a drummer's elbows stand out with the bend
   behind them filled, a cymbal stands well clear, and each microphone's stand rises on the crowd's line of sight to its singer.
   What thin gaps are left are a wedge's tip where two parts part, the notches of an instrument's own outline, and gaps between
   parts that stand still (`band.test.ts` counts them).

   And each outline holds together on a phone from the back of the crowd, where a phone draws the stage at 17 to 20 cm a pixel
   and stretches its 0.85 of a pixel over the screen. A part one or two of those pixels across comes to the screen grey and broken,
   and what is wider at the end of it, a headstock, a hand, a cuff, a stand's foot, is left as a speck of black alone, which comes
   and goes as the visitor walks. So what stands clear of an outline is narrow, under 0.6 of that
   pixel (10 cm), and rises at about 45 degrees on the screen, so that its pixels fall corner to corner and never two side by
   side; or it is joined to the outline through two pixels and more. An instrument's head is barely wider than its neck; a fretting
   hand lies where the arm's bend is filled; a stand and a pole stand on no foot; boots reach up into a long coat; the keys
   stand on an organ's cabinet; a cymbal tips toward the crowd, so it shows as a disc; and a drummer's stick is thickest at its
   tip, which is what shows of it. `band-outline.test.ts` draws the band as the shoot's devices draw it and counts the specks. */
export const HALF_OVER = 1.75, HALF_UNDER = 1.5;

/* The counts in which a move comes and goes once, each set by a count of flashes (scripts/flash; the bar is 6 swings a second at a
   block). What shows against the panel takes SLOW counts: a sway once in two counted 8 where an arm passed a trunk, a stroke once in
   two counted 7 to 9 on a phone, and once in four both count 5 at the most. A strum takes STRUM, one way a count: down and up inside
   each count, riding the sway, it counted 6. Only a foot keeps the count itself, against the floor. */
const SLOW = 4, STRUM = 2;
/* How long a move takes, in counts, at an even pace, so that no edge creeps (above): the GPU puts each corner of a triangle on a grid
   of 1/256 of a pixel, so an edge that creeps over a pixel's middle crosses it to and fro as its corners step. An edge that goes at
   an even pace crosses it once, and one that holds still flips nothing. */
const MOVE = 0.35;
/* A move that comes and goes once in `per` counts, `counts` into it: it holds at 1 from its count, goes at an even pace to -1 over
   MOVE counts (a quarter of `per` at the most), arriving halfway to the next, holds there, and comes back so, arriving on its count. */
const swing = (counts, per) => {
  const u = counts / per - Math.floor(counts / per), m = Math.min(MOVE, per / 4) / per;
  if (u < 0.5 - m) return 1;
  if (u < 0.5) return 1 - (2 * (u - 0.5 + m)) / m;
  if (u < 1 - m) return -1;
  return -1 + (2 * (u - 1 + m)) / m;
};
/* The seconds over which the band takes up playing or leaves off, as the capsules did. */
const EASE = 0.8;
/* The seconds over which the beat's speed is smoothed before it is read for half time: longer than the 0.2 s over which an onset
   pulls the beat (beat.js PULL_S). The hardest pull, an eighth of a beat, adds 0.6 beats a second for a frame, and under 0.14 to
   the speed read here. */
const RATE_SMOOTH = 0.5;
/* The seconds over which the count comes back onto the beat after half time begins or ends: it is half a count off at the most,
   and closes that at a quarter of a count a second and slower, so no one jumps. */
const RETUNE = 2;
/* Standing idle: a breath lifts a body BREATH every 4 s, standing, and SEATED_BREATH on a stool; and a standing player shifts their
   weight SHIFT to either side, each in their own time. In a player's own metres: a centimetre on the stage, under a pixel from the
   hill. */
const BREATH = 0.006, SEATED_BREATH = 0.005, SHIFT = 0.006;
const breathe = (level, time, amp) => (1 - level) * amp * Math.sin((Math.PI * time) / 2);
/* A drummer's stroke through its SLOW counts, from the stick's fall: it lies where it fell for `rest` of them, climbs at an even pace
   for `climb` to its top at `up`, holds there until `top`, and falls at an even pace for `fall`, to land on its count. Each goes at
   an even pace for the reason a move does (MOVE): a stick that eased to its top and away again lingered there against the panel.
   The spans are written out: 0.35 - 0.2 is not 0.15 to a float. */
const STROKE = { rest: 0.2, climb: 0.15, up: 0.35, top: 0.7, fall: 0.3 };
const stroke = (turn) => {
  const f = turn - Math.floor(turn);
  if (f < STROKE.rest) return 0;
  if (f < STROKE.up) return (f - STROKE.rest) / STROKE.climb;
  if (f < STROKE.top) return 1;
  return (1 - f) / STROKE.fall;
};
/* How far a stroke tips a stick back and out to its side, in rad, and how thick a stick is at its tip. */
const RAISE = 0.75, SPLAY = 0.9, STICK = 0.075;

/* How far a standing player's trunk leans for each metre their hips sway, in rad, against the sway: so the mouth, 0.68 over the
   hips, stays where it is, at the microphone, and the hips and the instrument sway under it. */
const LEAN = 1.45;
/* How far the keys player's hands rise from the keys, in their own metres. */
const HAND_RISE = 0.1;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), BACK = V(-1, 0, 0), AHEAD = V(0, 0, 1);

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
/* A web: a flat piece between three points, seen from both sides, that fills what three parts enclose. */
const web = (a, b, c) => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, b].flatMap((v) => [v.x, v.y, v.z]), 3));
/* A trouser cuff round an ankle, `hem` in radius at its foot and `tall`, and a shoe from heel to toe. */
const cuff = (ankle, hem = 0.084, tall = 0.14, top = 0.062) => new THREE.CylinderGeometry(top, hem, tall, 8).translate(ankle.x, 0.055 + tall / 2, ankle.z);
const shoe = (heel, toe) => limb(heel, toe, 0.105, 0.08);

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

/* A posture: how high the hips are, and how far over them the waist is, about which the body turns. */
const STANDING = { hips: 0.92, waist: 0.01 }, SEATED = { hips: 0.6, waist: 0.02 };
/* A trunk and a head in a posture, facing +z. `broad` widens it. A collar stands from the shoulders' slope to under the head's
   widest, behind the jaw's line, so no notch is open under the jaw from the front and nothing stands under the chin from the side.
   The hair is an outline and no more, and falls behind the jaw too: "short", "long" past the shoulders, a "bob" to them, a "tail"
   down the back, a "cap" with a peak, a "knot" on the crown. `skirt` is the length of a skirt or a coat's skirts from the hips, 0
   for none. Returns the parts, the `pivot` at the waist, the `hip` and the `shoulder` of a side (1 the player's left, +x, and -1
   their right), and the mouth. */
function trunk({ hips: h, waist }, broad, hair, skirt = 0) {
  const head = V(0, h + 0.735, 0.005);
  const parts = [
    new THREE.CylinderGeometry(0.17, 0.18, 0.2, 8).scale(broad, 1, 0.72).translate(0, h + 0.02, 0),
    new THREE.CylinderGeometry(0.2, 0.15, 0.34, 8).scale(broad, 1, 0.62).translate(0, h + 0.28, 0),
    new THREE.CapsuleGeometry(0.07, 0.41 * broad, 2, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.9).translate(0, h + 0.455, 0),
    new THREE.CylinderGeometry(0.07, 0.2, 0.09, 8).scale(broad, 1, 0.62).translate(0, h + 0.495, 0),
  ];
  /* The head, with its neck, its collar and its hair: its own list, since one who sings keeps theirs still (see buildBand). */
  const top = [
    new THREE.CylinderGeometry(0.05, 0.058, 0.17, 6).translate(0, h + 0.55, 0),
    new THREE.CylinderGeometry(0.094, 0.115, 0.19, 8).scale(1, 1, 0.5).translate(0, h + 0.58, -0.035),
    ball(head, 0.112, 0.88, 1.12, 1),
  ];
  const lift = (x, y, z) => V(head.x + x, head.y + y, head.z + z);
  /* Hair that falls: a dome over the crown, and a skirt from it down to `to` below the head's middle, `wide` at its hem. */
  const fall = (to, wide) => [ball(lift(0, 0.012, -0.014), 0.124, 1, 1, 0.96),
    new THREE.CylinderGeometry(0.123, wide, to + 0.01, 8).scale(1, 1, 0.66).translate(head.x, head.y + 0.005 - to / 2, head.z - 0.055)];
  if (hair === "short" || hair === "knot") top.push(ball(lift(0, 0.024, -0.018), 0.113, 0.93, 1, 1.02));
  if (hair === "knot") top.push(ball(lift(0, 0.085, -0.105), 0.068, 1.25, 0.85, 1));
  if (hair === "long") top.push(...fall(0.33, 0.152));
  if (hair === "bob") top.push(...fall(0.215, 0.15));
  if (hair === "tail") top.push(ball(lift(0, 0.024, -0.018), 0.113, 0.93, 1, 1.02), ball(lift(0, -0.01, -0.125), 0.05), bar(lift(0, -0.02, -0.13), lift(0, -0.2, -0.115), 0.036, 0.02));
  if (hair === "cap") top.push(new THREE.CylinderGeometry(0.096, 0.106, 0.08, 8).translate(head.x, head.y + 0.094, head.z), new THREE.BoxGeometry(0.16, 0.03, 0.1).rotateX(0.35).translate(head.x, head.y + 0.055, head.z + 0.14));
  /* A skirt or a coat's skirts, `skirt` long from the hips: it hides the legs, which move under it, and closes the gap between them. */
  if (skirt) parts.push(new THREE.CylinderGeometry(0.175, 0.175 + 0.156 * skirt, skirt, 10).scale(broad, 1, 0.8).translate(0, h + 0.02 - skirt / 2, 0));
  return { parts, head: top, pivot: V(0, h + waist, 0), hip: (side) => V(side * 0.09 * broad, h - 0.02, 0), shoulder: (side) => V(side * 0.205 * broad, h + 0.455, 0), mouth: V(0, h + 0.685, 0.105) };
}

/* A guitar or a bass, held: flat in its own frame, x along the strings from the body's end toward the head and y across them, with the
   point `strum` along the strings put at `at`, the neck risen `rise` rad to the player's left and brought `yaw` rad forward, drawn
   `big` times its size, a little over life, so that its outline carries from the hill. `body` is the body's outline from the neck's
   joint round to the joint again; the neck runs from `joint` to `nut`, `neck` wide; the head is `head` long and `face` wide, a
   paddle square at its end and no more than a quarter wider than the neck: a wider head is a speck of its own from the back of the
   crowd on a phone, its neck too thin there to join it, and pegs apart are teeth a pixel wide from the crowd, whose tips counted 8
   swings in a second at daybreak. Returns the parts and `on(x, y, z)`, a point of its frame in the player's. */
function axe({ at, rise, yaw, big, strum, body, joint, nut, neck, head, face }) {
  const hold = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationY(-yaw))
    .multiply(new THREE.Matrix4().makeRotationZ(rise)).multiply(new THREE.Matrix4().makeScale(big, big, big)).multiply(new THREE.Matrix4().makeTranslation(-strum, 0, 0));
  const half = face / 2, tip = nut + head;
  const parts = [
    plate(body, 0.045),
    box(nut - joint + 0.04, neck, 0.028, (nut + joint - 0.04) / 2, 0, 0),
    plate([[nut - 0.01, -neck / 2], [nut + 0.04, -half], [tip, -half], [tip, half], [nut + 0.04, half], [nut - 0.01, neck / 2]], 0.022, false),
  ];
  return { parts: parts.map((p) => p.applyMatrix4(hold)), on: (x, y, z = 0) => V(x, y, z).applyMatrix4(hold) };
}
/* Three plain instruments: a guitar with two short horns, one with a single cutaway, and a bass, longer in the neck and the head. */
const TWO_HORNS = { strum: 0.19, joint: 0.42, nut: 0.9, neck: 0.052, head: 0.18, face: 0.064,
  body: [[0.42, 0.032], [0.455, 0.06], [0.47, 0.1], [0.4, 0.122], [0.32, 0.135], [0.24, 0.122], [0.15, 0.165], [0.07, 0.155], [0.012, 0.09], [0, 0],
    [0.012, -0.09], [0.06, -0.16], [0.14, -0.17], [0.24, -0.124], [0.33, -0.14], [0.42, -0.135], [0.49, -0.115], [0.46, -0.07], [0.42, -0.032]] };
const ONE_CUT = { strum: 0.19, joint: 0.43, nut: 0.91, neck: 0.052, head: 0.17, face: 0.064,
  body: [[0.43, 0.032], [0.445, 0.08], [0.41, 0.125], [0.34, 0.146], [0.26, 0.13], [0.16, 0.176], [0.08, 0.17], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.166], [0.15, -0.176], [0.25, -0.126], [0.33, -0.142], [0.41, -0.146], [0.475, -0.12], [0.45, -0.075], [0.43, -0.032]] };
const BASS = { strum: 0.2, joint: 0.47, nut: 1.16, neck: 0.058, head: 0.24, face: 0.07,
  body: [[0.47, 0.036], [0.55, 0.062], [0.58, 0.1], [0.46, 0.13], [0.36, 0.14], [0.27, 0.125], [0.17, 0.172], [0.08, 0.165], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.165], [0.17, -0.176], [0.27, -0.125], [0.37, -0.14], [0.46, -0.14], [0.54, -0.12], [0.5, -0.07], [0.47, -0.036]] };

/* A microphone on a stand, in a player's frame: the microphone at `to` (at the mouth), on a straight stand that rises from the
   floor at `foot` ([x, z]), or, with `boom`, at the end of an arm from a taller stand there. The stand has no foot: a round foot on
   the floor is a speck of its own from the back of the crowd on a phone. */
function microphone(to, [x, z], boom) {
  const top = V(x, boom ? 1.38 : to.y - 0.1, z), aim = V().subVectors(to, top).normalize();
  const parts = [bar(V(x, 0, z), top, 0.036, 0.034, 6), bar(to.clone().addScaledVector(aim, -0.15), to, 0.022, 0.03, 6)];
  parts.push(bar(boom ? top.clone().addScaledVector(aim, -0.28) : top, to.clone().addScaledVector(aim, -0.12), 0.034, 0.026, 6));
  return parts;
}

/* A cymbal, in a drummer's frame: a shallow cone `r` in radius, its middle at `c`, tipped `tip` rad toward the crowd and rolled `roll`
   to the side. A level cymbal is a line from the front of the crowd, a pixel thick, and a line comes and goes; tipped, it shows as
   an ellipse from the front and from the hill alike. */
const cymbal = (c, r, tip, roll = 0) => drum(c, 0.03, r, 0.04, 14, tip, roll);
/* A stout pole from the floor at [x, z] up to `top`, 15 cm across as it stands on the stage: two pixels and more from among the
   crowd on a desktop, and from the hill a line a pixel wide that holds together, where a thinner one broke into specks. No foot
   and no tripod: a foot is a speck of its own from the back of the crowd on a phone, and a tripod's legs a pixel wide at best. */
const pole = (x, z, top) => [bar(V(x, 0, z), V(x, top, z), 0.042, 0.042, 8)];
/* A drum that reads as one in outline from every side: a shell `r` in radius and `deep`, upright about its own middle, its rims
   rounded and its heads flat to four fifths of the radius; or `rounder`, to three fifths. A plain cylinder is a box from the front
   and from the hill. */
const SHELL = [[0, -0.5], [0.82, -0.5], [1, -0.2], [1, 0.2], [0.82, 0.5], [0, 0.5]], ROUNDER = [[0, -0.5], [0.62, -0.5], [0.9, -0.38], [1, -0.2], [1, 0.2], [0.9, 0.38], [0.62, 0.5], [0, 0.5]];
const shell = (r, deep, rounder = false) => new THREE.LatheGeometry((rounder ? ROUNDER : SHELL).map(([a, b]) => new THREE.Vector2(a * r, b * deep)), 12);
/* The rad a rack tom's head tips toward its drummer, and how far in front of the drummer the rack toms' middles are. */
const TOM_TIP = 0.3, TOM_Z = 0.66;
/* Where a drummer's hi-hat is, in their frame: under the hands, to the right of the snare. */
const HAT = V(-0.11, 0.8, 0.25);
/* How far a drummer leans forward at rest, in rad; the way each elbow bends, out to its side (1 the drummer's left), down and back;
   and how far inside the upper arm's middle the web that fills the arm's bend reaches its elbow. */
const DRUM_LEAN = 0.07, WEB_IN = 0.01;
const elbowOut = (side) => V(0.85 * side, -0.5, -0.15);

/* ---------- the band ---------- */

/* (Each player says its `lag` and its `look`: size, breadth, hair and skirt, as dealt.) */
/* Builds the band in the stage's group, whose floor is `floor` m up in the stage's own frame (+z toward the crowd). Returns the six
   `players` (each `plays` its part, and has its frame `g` and its `body`), the `limbs`' mesh and each of its `bones`, the `still`
   mesh with the corners each of its parts holds (`still.userData.parts`: `of` what, `as` what in it, `by` whom), the `joints` each
   bone is held at, the material, and
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
    const p = { plays, g, body: null, pivot: null, lean: 0, lag: 0, look: null, at: players.length, pose: null };
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
  /* Parts that stand still, drawn in a player's frame (or, without one, in the stage's), under a name: `of` what they are a part,
     and `as` what in it, where a test tells a kit's drums and cymbals apart. */
  const keep = (p, of, parts, as = of) => { for (const part of parts) fixed.push({ of, as, by: p ? p.at : null, geo: p ? bare(part).applyMatrix4(p.g.matrix) : bare(part) }); };

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
     still part, and one that `taps` hinges at its heel, where a turn lifts its toe. With `boots`, each cuff is a boot that tall,
     which reaches up into a coat: below a coat's hem a shin is too thin to join a cuff to it, from the back of the crowd on a phone. */
  function stand(p, t, stance, toes, back, taps, boots = null) {
    let tap = null;
    for (const s of [1, -1]) {
      const ankle = V(s * stance, 0.1, back), heel = V(s * stance, 0.04, back - 0.075), toe = V(heel.x + s * 0.27 * Math.sin(toes), 0.04, heel.z + 0.27 * Math.cos(toes));
      leg(p, s > 0 ? "left" : "right", t.hip(s), ankle);
      keep(p, `${p.plays} cuff`, [boots ? cuff(ankle, 0.086, boots, 0.074) : cuff(ankle)]);
      if (taps && s > 0) tap = hinge(p, false, heel, BACK, [toe.clone().sub(heel)], [bone(p, "tapping foot", 0.105, 0.08)]);
      else keep(p, `${p.plays} shoe`, [shoe(heel, toe)]);
    }
    return tap;
  }
  /* The head of one who sings, which stands still at its microphone, leaned as the body is at rest, while the trunk sways under
     it: a head that moved with its trunk about the mouth crept a hair's breadth a frame, and a crown that creeps over a pixel's
     middle flips it several times as it passes (a cap's top counted 8 swings in a second on a phone). The collar hides the join. */
  const keepHead = (p, t) => keep(p, "head", t.head.map((part) => (p.lean ? part.translate(-p.pivot.x, -p.pivot.y, -p.pivot.z).rotateX(p.lean).translate(p.pivot.x, p.pivot.y, p.pivot.z) : part)));
  /* A player's microphone on its stand, the microphone at the mouth where the body has it at rest: where it was drawn, for one who
     stands upright, and leaned with the body for one who leans. The stand's foot is `reach` from there toward the crowd, the way
     the stage faces, so from the crowd's side of the stage the stand and its arm rise in front of the singer and not beside them. */
  function voice(p, t, mic) {
    const at = V(0, t.mouth.y - 0.005, 0.125), tip = p.lean ? leaned(p, at) : at, facing = p.g.rotation.y;
    keep(p, "microphone", microphone(tip, [tip.x - mic.reach * Math.sin(facing), tip.z + mic.reach * Math.cos(facing)], mic.boom));
  }

  /* The players' moves, each a share of `level` (0 standing, 1 playing), on the band's count less the player's own lag, a whole
     number of counts, so that no two who stand side by side sway or rock together and all keep the count. `slow` runs from 1 on a count to -1 two counts on and back:
     what follows it comes and goes once in SLOW counts. */

  /* A guitar or a bass: standing, legs apart, the instrument across the body with its neck risen to the player's left, the left hand
     on the neck and the right over the strings. The hips sway to one side and, two counts on, to the other, the instrument with
     them, under a head that stays at its microphone. Both upper arms lie against the trunk. The left elbow is tucked under the
     neck, and the bend of that arm is filled, from the shoulder to the hand and down to where the neck leaves the body, so no
     pocket stands open between the arm and the neck. The right forearm lies over the instrument from its elbow: it turns there,
     `strum` rad either way, the hand crossing the strings one way on a count and back on the next, black over the instrument's
     black from the front. The left foot taps, down on the count. */
  function strummer(plays, spot, facing, { size, broad, hair, skirt, stance, toes, hold, fret, sway, strum, tap, lag, mic, boots }) {
    const p = player(plays, spot, facing, size);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: skirt ?? 0 };
    const t = trunk(STANDING, broad, hair, skirt), a = axe(hold);
    const left = t.shoulder(1), right = t.shoulder(-1);
    const hand = a.on(fret, -0.005, -0.035), elbow = elbowOf(V(), left, hand, 0.29, 0.27, V(-0.2, -1, -0.5));
    /* The strumming arm: its wrist over the strings behind the hand's reach, its fingers at them. */
    const wrist = a.on(hold.strum - 0.05, 0.075, 0.06), fingers = a.on(hold.strum + 0.005, 0.01, 0.05);
    const tucked = elbowOf(V(), right, wrist, 0.29, 0.26, V(0.2, -1, -0.6));
    embody(p, [...t.parts, ...a.parts, bar(left, elbow, 0.058, 0.052), ball(elbow, 0.053, 1, 1, 1, 0), bar(elbow, hand, 0.052, 0.046), ball(hand, 0.058, 1, 0.9, 1, 0),
      bar(right, tucked, 0.06, 0.053), ball(tucked, 0.055, 1, 1, 1, 0), web(elbow, hand, a.on(hold.joint, 0, 0)), web(left, elbow, a.on(hold.joint, 0, 0)), web(left, elbow, hand), web(right, tucked, wrist)], t.pivot);
    const face = a.on(0, 0, 1).sub(a.on(0, 0)).normalize();
    const strumming = hinge(p, true, ofBody(p, tucked), face, [wrist.clone().sub(tucked), fingers.clone().sub(wrist)],
      [bone(p, "strumming forearm", 0.1, 0.1, [0.03, 0.01]), bone(p, "strumming hand", 0.08, 0.05, [0.02, 0.012], face)]);
    const foot = stand(p, t, stance, toes, 0, true, boots);
    keepHead(p, t);
    voice(p, t, mic);
    const { body, pivot } = p;
    p.pose = (count, level, time) => {
      const slow = swing(count - lag, SLOW), across = swing(count - lag, STRUM), beat = swing(count - lag, 1);
      const shift = level * sway * slow + (1 - level) * SHIFT * Math.sin(time * (0.7 + 0.13 * p.at));
      body.position.set(pivot.x + shift, pivot.y + breathe(level, time, BREATH), pivot.z);
      body.rotation.set(level * 0.02 * slow, 0, LEAN * shift);
      strumming.turn = -level * strum * across;
      foot.turn = (level * tap * (1 - beat)) / 2;
    };
    return p;
  }

  /* The keys: two keyboards on an organ's cabinet, the player standing behind it, turned a little from the crowd, a hand on each.
     The elbows are tucked at the waist and the hands play in front of the trunk, so from the crowd the arms lie over the trunk and
     the keyboards. The hips sway `sway` to one side and, two counts on, to the other, under a head that stays at its microphone,
     as a guitarist's do; the hands rise HAND_RISE off the keys and fall in turn, each down once in four counts; and the shoulders
     dip toward the keys with the left. */
  function keys(spot, facing, { size, broad, hair, stance, sway, lag, mic }) {
    const p = player("keys", spot, facing, size);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: 0 };
    const t = trunk(STANDING, broad, hair);
    embody(p, t.parts, t.pivot, 0.1);
    const lower = { y: 0.9, z: 0.46 }, upper = { y: 1.1, z: 0.64 };
    const rig = [box(1.14, 0.09, 0.31, 0, lower.y, lower.z), new THREE.BoxGeometry(0.96, 0.08, 0.27).rotateX(0.22).translate(0.02, upper.y, upper.z),
      box(0.96, upper.y - lower.y, 0.24, 0.02, (upper.y + lower.y) / 2, upper.z + 0.01)];
    /* The cabinet: from the floor up into the lower keyboard, which reaches past it either side, so no light shows between them.
       Legs under the keyboards, or a column, are a pixel or so wide from the back of the crowd, where they broke into specks; the
       cabinet hides the player's legs. */
    rig.push(box(0.84, lower.y - 0.02, 0.36, 0.01, (lower.y - 0.02) / 2, lower.z + 0.03));
    keep(p, "keyboard", rig);
    /* The hands: the left on the lower keyboard and the right on the upper, each a wrist behind its fingertips. `lead` is the hand's
       turn in the SLOW counts: 1 is down on the count and up two counts on, and -1 the other way about. */
    const hands = [
      { side: 1, name: "left", tip: V(0.14, lower.y + 0.075, lower.z - 0.03), lead: 1 },
      { side: -1, name: "right", tip: V(-0.12, upper.y + 0.085, upper.z - 0.05), lead: -1 },
    ].map(({ side, name, tip, lead }) => {
      const wrist = tip.clone().add(V(side * 0.012, 0.035, -0.08));
      return { wrist, fingers: tip.clone().sub(wrist), lead, arm: arm(p, name, t.shoulder(side), 0.29, 0.26, V(-0.45 * side, -1, -0.7), [bone(p, `${name} hand`, 0.085, 0.045, [0.02, 0.012])]) };
    });
    stand(p, t, stance, 0.18, -0.02, false);
    keepHead(p, t);
    voice(p, t, mic);
    const { body, pivot, lean } = p;
    p.pose = (count, level, time) => {
      const slow = swing(count - lag, SLOW), shift = level * sway * slow;
      body.position.set(pivot.x + shift, pivot.y + breathe(level, time, BREATH), pivot.z);
      body.rotation.set(lean + level * 0.015 * slow, 0, LEAN * shift);
      for (let k = 0; k < hands.length; k++) {
        const { wrist, fingers, lead, arm: a } = hands[k], rise = (level * (1 - lead * slow)) / 2;
        a.to.copy(wrist);
        a.to.y += HAND_RISE * rise;
        a.to.z -= 0.03 * rise;
        a.carry.copy(fingers).applyAxisAngle(BACK, 0.5 * rise);
      }
    };
    return p;
  }

  /* A drummer at a kit, seated. The kit is full masses that overlap, so that from the crowd its outline is a drum kit's and no
     light shows through it: a round bass drum facing the crowd, the widest drum in it; two rack toms riding on its top, their
     rims rounded, so each is a drum and no box from the front or from the hill; a floor tom standing on the floor against the
     bass drum, shorter than it; a snare between the knees; and blocks that fill the kit's middle and what is between the bass
     drum and the toms. The hi-hat stands under the drummer's hands, inside the outline.

     One cymbal shows, a `crash` on a pole out on the drummer's left, tipped `tip` rad toward the crowd so that it shows as a disc
     from the back of the crowd as from the front, and well clear of every other outline: a cymbal a pixel or two off an arm leaves
     a gap that flickers, and one on a shoulder is no cymbal. The first drummer's stands between the two drummers, over its floor
     tom, which hides the pole's foot; the second's stands past its floor tom, a forearm's length from its elbow. Nothing of a kit
     stands out on the side of the bass or of the second guitar at the height of their instruments: from the hill a guitar's head
     or body would sway a pixel from it.

     The hands play in front of the trunk, the left on the snare's head and the right on the head of the rack tom under `tom`, and
     the elbows stand out to the sides, the bend behind each filled, so the arms show from the front. The sticks move over the
     black of the drummer and the kit until a stroke's top, when each stick's tip stands over its shoulder; what moves against the
     panel is that tip, the elbows and the trunk, which rocks once in four counts. The right stick falls on one count and the left
     two counts on: each rises slowly and falls once in four counts, so one is down while the other is at its top. */
  function drummer(spot, facing, { size, broad, hair, lag, kick, toms, tom, floor: low, crash }) {
    const p = player("drums", spot, facing, size);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: 0 };
    const t = trunk(SEATED, broad, hair);
    /* The sticks: each tip rests where it falls, the left on the snare and the right on the tom at `tom`, its hand a stick's hold
       behind, and falls `delay` counts after the drummer's own count. */
    const sticks = [
      { side: 1, name: "left", tip: V(0.07, 0.69, 0.36), grip: V(0.21, 0.83, 0.13), delay: SLOW / 2 },
      { side: -1, name: "right", tip: tom.clone(), grip: V(tom.x * 0.6 - 0.1, tom.y - 0.04, tom.z - 0.33), delay: 0 },
    ];
    /* What fills each arm's bend at rest, as part of the body: from the shoulder to the elbow, a hair inside the upper arm's
       middle, and down to the waist; and from the chest to them. The elbows stand out from the trunk, so the arms show from the
       front, and nothing between an arm and the trunk is open: a pocket a pixel wide inside an outline is lit or black as a whole
       pixel, and comes and goes. */
    const turned = (v, a) => v.clone().sub(t.pivot).applyAxisAngle(X, a).add(t.pivot);
    const webs = sticks.flatMap(({ side, grip }) => {
      const shoulder = t.shoulder(side), elbow = turned(elbowOf(V(), turned(shoulder, DRUM_LEAN), grip, 0.29, 0.25, elbowOut(side)), -DRUM_LEAN);
      elbow.x -= side * WEB_IN;
      return [web(shoulder, elbow, V(side * 0.15 * broad, SEATED.hips + 0.12, 0)), web(V(side * 0.1 * broad, SEATED.hips + 0.4, 0), shoulder, elbow)];
    });
    embody(p, [...t.parts, ...t.head, ...webs], t.pivot, DRUM_LEAN);
    const kit = (as, ...parts) => keep(p, "kit", parts, as);
    kit("bass drum", drum(V(0, kick + 0.005, 0.86), kick, kick, 0.4, 24, Math.PI / 2));
    /* A rack tom `r` in radius at `x`, as high as puts its head 2 cm under the right stick's tip where that rests. */
    const high = tom.y - (toms.deep / 2 + 0.02 - (TOM_Z - tom.z) * Math.sin(TOM_TIP)) / Math.cos(TOM_TIP);
    const rack = ([x, r]) => shell(r, toms.deep).rotateX(-TOM_TIP).translate(x, high, TOM_Z);
    kit("rack tom", rack(toms.left), rack(toms.right));
    kit("floor tom", shell(low.r, 0.5, true).rotateZ(Math.sign(low.x) * 0.06).translate(low.x, 0.265, 0.45));
    kit("snare", drum(V(0.05, 0.6, 0.4), 0.18, 0.18, 0.14, 12), bar(V(0.05, 0.53, 0.4), V(0.05, 0.02, 0.4), 0.03, 0.03, 5));
    /* What the toms ride on: a block from the bass drum's top up into them, narrow enough to hide behind them, and on the floor
       tom's side out to the edge of the tom over it, so no light shows under that tom's overhang. And the kit's middle, between
       the bass drum, the snare and the knees: its top is under the snare's head, where the left stick lands. */
    const over = low.x > 0 ? toms.right : toms.left, edge = Math.abs(over[0]) + over[1];
    kit("block", box(0.28 + edge, 0.36, 0.2, (Math.sign(low.x) * (edge - 0.28)) / 2, 0.62, TOM_Z), box(0.44, 0.34, 0.5, 0, 0.43, 0.42));
    kit("stool", drum(V(0, 0.5, -0.02), 0.17, 0.17, 0.07, 10), drum(V(0, 0.24, -0.02), 0.05, 0.09, 0.46, 8));
    kit("hi-hat", drum(HAT, 0.03, 0.15, 0.035, 12), drum(V(HAT.x, HAT.y - 0.045, HAT.z), 0.15, 0.03, 0.035, 12));
    kit("pole", ...pole(-0.2, 0.3, HAT.y - 0.02));
    kit("cymbal", cymbal(V(crash.x, crash.y, crash.z), crash.r, crash.tip, -Math.sign(crash.x) * 0.1));
    kit("pole", ...pole(crash.x, crash.z, crash.y - 0.01));
    /* The legs, which stay on the pedals. */
    for (const s of [1, -1]) {
      const knee = V(s * 0.2, 0.6, 0.38), ankle = V(s * 0.17, 0.12, 0.5);
      keep(p, `${p.plays} leg`, [limb(t.hip(s), knee, 0.19, 0.19, [0.02, 0.04]), limb(knee, ankle, 0.14, 0.14, [0.04, 0])]);
      keep(p, `${p.plays} cuff`, [cuff(ankle, 0.08, 0.13)]);
      keep(p, `${p.plays} shoe`, [shoe(V(ankle.x, 0.04, ankle.z - 0.07), V(ankle.x + s * 0.02, 0.04, ankle.z + 0.2))]);
    }
    /* The arms. A stroke lifts the hand a little, out to its `side`, and tips its stick back RAISE rad and out SPLAY rad, so at
       the stroke's top the stick's tip stands over the drummer's shoulder: a stick shows against the panel once in four counts.
       The stick is a bar thickest at its tip, STICK across: what shows of it is two of a phone's pixels across from the band's
       still, where a thinner tip comes apart. A stick stands no higher than the band is playing (`level`), so as the band takes up
       playing or leaves off it goes no faster than a stroke does. */
    const arms = sticks.map(({ side, name, tip, grip, delay }) => ({ side, grip, aim: tip.clone().sub(grip), delay, lift: V(side * 0.03, 0.1, -0.02),
      arm: arm(p, name, t.shoulder(side), 0.29, 0.25, elbowOut(side), [bone(p, `${name} stick`, STICK, STICK, [0, 0], X, [1, -0.27]), bone(p, `${name} hand`, 0.085, 0.07, [0, 0], X, [-0.14, 0.14])]) }));
    const { body, pivot, lean } = p;
    p.pose = (count, level, time) => {
      const c = count - lag, slow = swing(c, SLOW);
      body.position.set(pivot.x, pivot.y + breathe(level, time, SEATED_BREATH), pivot.z);
      body.rotation.set(lean + level * 0.045 * slow, 0, level * 0.045 * slow);
      for (let k = 0; k < arms.length; k++) {
        const { side, grip, aim, delay, lift, arm: a } = arms[k], up = Math.min(level, stroke((c - delay) / SLOW));
        a.to.copy(grip).addScaledVector(lift, up);
        a.carry.copy(aim).applyAxisAngle(BACK, RAISE * up).applyAxisAngle(AHEAD, -side * SPLAY * up);
      }
    };
    return p;
  }

  /* The line-up, from the crowd's left: a guitar a step back, the bass in front, the drummers behind, side by side, the second
     guitar in front and the keys a step back. They stand close enough that from the front of the crowd all six fall on the light
     panel, and apart enough that each is an outline of their own from every front pose, the second guitar's head clear of the
     organ and of the second kit, and from the hill no instrument's head sways across a neighbour's cymbal or stand: where one
     black edge slides past another a pixel away, the gap between them flickers. So each crash stands over the height of the
     guitar beside it, and neither kit has a drum out on its guitar's side. The guitars' and the bass's necks rise at about 45
     degrees on the screen from the crowd. The kits differ as the drummers do: in each drum's size and in its crash. No two stand,
     sway, dress or wear their hair alike, and no two neighbours share a lag. The first guitarist sings into a stand right under
     the microphone, whose foot is among their boots. */
  strummer("guitar", [-6.05, -1.3], 0.25, { size: 1.035, broad: 0.93, hair: "cap", skirt: 0.58, stance: 0.16, boots: 0.32, toes: 0.3, fret: 0.8, sway: 0.03, strum: 0.15, tap: 0.1, lag: 1,
    hold: { ...TWO_HORNS, at: V(-0.13, 0.99, 0.18), rise: 0.78, yaw: 0.2, big: 1.1 }, mic: { reach: 0.04, boom: false } });
  strummer("bass", [-3.5, 1.5], 0.1, { size: 0.93, broad: 1.0, hair: "knot", skirt: 0.8, stance: 0.16, toes: 0.22, fret: 0.96, sway: -0.035, strum: 0.05, tap: 0.13, lag: 0,
    hold: { ...BASS, at: V(-0.1, 0.9, 0.18), rise: 0.85, yaw: 0.22, big: 1.08 }, mic: { reach: 0.18, boom: false } });
  drummer([-1.25, -2.5], 0.06, { size: 0.99, broad: 1.04, hair: "tail", lag: 2, kick: 0.31, toms: { left: [-0.19, 0.19], right: [0.195, 0.205], deep: 0.22 }, tom: V(-0.19, 0.93, 0.58),
    floor: { x: 0.54, r: 0.25 }, crash: { x: 0.735, y: 1.5, z: 0.45, r: 0.23, tip: 0.3 } });
  drummer([1.3, -2.5], -0.06, { size: 1.02, broad: 1.0, hair: "long", lag: 3, kick: 0.3, toms: { left: [-0.17, 0.21], right: [0.21, 0.185], deep: 0.25 }, tom: V(-0.06, 0.93, 0.58),
    floor: { x: 0.33, r: 0.17 }, crash: { x: 0.72, y: 1.42, z: 0.5, r: 0.21, tip: 0.5 } });
  strummer("guitar", [3.9, 0.9], -0.12, { size: 1.0, broad: 1.06, hair: "bob", skirt: 0.8, stance: 0.16, toes: 0.25, fret: 0.74, sway: 0.045, strum: 0.13, tap: 0.11, lag: 2,
    hold: { ...ONE_CUT, at: V(-0.12, 1.02, 0.18), rise: 0.78, yaw: 0.3, big: 1.1 }, mic: { reach: 0.18, boom: false } });
  keys([6.55, -1.4], -0.25, { size: 1.02, broad: 0.95, hair: "short", stance: 0.09, sway: 0.03, lag: 3, mic: { reach: 0.18, boom: false } });

  /* The furniture, in the stage's frame: three wedge monitors at the lip, between the players' feet. (Amplifiers stood here too:
     beside a player they were one more edge a hand from an outline, and at the floor's corners they stood outside a phone's frame.) */
  const wedge = (x, z, turn) => plate([[-0.38, 0], [0.38, 0], [0.38, 0.45], [0.14, 0.48], [-0.38, 0.11]], 0.86, false).rotateY(-Math.PI / 2 + turn).translate(x, floor, z);
  keep(null, "monitor", [wedge(-4.5, 3.1, 0.2), wedge(-2.3, 3.4, -0.1), wedge(2.2, 3.3, 0.15)]);

  /* The still parts as one mesh, which remembers the corners each named part holds. */
  let from = 0;
  const parts = fixed.map(({ of, as, by, geo }) => { const part = { of, as, by, from, count: geo.attributes.position.count }; from += part.count; return part; });
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
     holds, each hinge's bones from its pivot; then each bone's matrix, from the player's frame into the stage's. A point of a body
     turns by the body's own quaternion, which three keeps to the rotation a pose set: one a player, not one a joint. */
  const m = new THREE.Matrix4(), end = V(), swung = V();
  function place() {
    for (let k = 0; k < legs.length; k++) {
      const { p, thigh, shin, hip, ankle } = legs[k];
      thigh.a.copy(hip).applyQuaternion(p.body.quaternion).add(p.body.position);
      thigh.b.addVectors(thigh.a, ankle).multiplyScalar(0.5);
      thigh.b.z += 0.03;
      shin.a.copy(thigh.b);
      shin.b.copy(ankle);
    }
    for (let k = 0; k < arms.length; k++) {
      const { p, shoulder, upper, fore, pole, to, carry, held, bones: [top, low] } = arms[k];
      top.a.copy(shoulder).applyQuaternion(p.body.quaternion).add(p.body.position);
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
        if (on) { b.a.applyQuaternion(p.body.quaternion).add(p.body.position); b.b.applyQuaternion(p.body.quaternion).add(p.body.position); }
      }
    }
    for (let k = 0; k < bones.length; k++) {
      const b = bones[k];
      limbs.setMatrixAt(k, lay(m, b.a, b.b, b.wide, b.thick, b.pads, b.ref).premultiply(players[b.of].g.matrix));
    }
    limbs.instanceMatrix.needsUpdate = true;
  }

  /* The band's count: the figures' beat, or half of it while that is fast (HALF_OVER), eased onto the beat again over RETUNE seconds
     after a change, so no one jumps. `rate` is the beat's own speed, in beats a second, smoothed over RATE_SMOOTH. */
  let level = 0, count = 0, last = null, rate = 0, half = false;
  /* Plays the band for a frame `dt` s long: `beats` is the figures' phase in beats, which the caller keeps (beat.js), and `time` the
     world's time in seconds. While the show plays they play, on their count; otherwise they stand, breathing on a 4-s cycle and
     shifting their weight. Each change eases over EASE seconds. Under reduced motion nothing calls this, so they stand as they were
     built: at rest, their hands on their instruments. Nothing here makes anything: a frame's work is arithmetic on what the build
     made. */
  function move(dt, time, beats, playing) {
    level = Math.max(0, Math.min(1, level + (playing ? dt : -dt) / EASE));
    const step = last === null ? 0 : Math.max(0, Math.min(1, beats - last));
    last = beats;
    if (dt > 0) rate += (step / dt - rate) * Math.min(1, dt / RATE_SMOOTH);
    if (rate > HALF_OVER) half = true;
    else if (rate < HALF_UNDER) half = false;
    const pace = half ? 0.5 : 1;
    const was = count;
    count += Math.min(step * pace, HALF_OVER * dt);
    const off = count - beats * pace;
    count -= (off - Math.round(off / pace) * pace) * Math.min(1, dt / RETUNE);
    // What the frame does to the count, the retune's pull included, is held between standing still and HALF_OVER a second: a pull
    // onto the beat never runs the count faster than that, nor ever back.
    count = was + Math.max(0, Math.min(HALF_OVER * dt, count - was));
    for (let k = 0; k < players.length; k++) players[k].pose(count, level, time);
    place();
    return count;
  }
  for (let k = 0; k < players.length; k++) players[k].pose(0, 0, 0);
  place();

  return { players, limbs, bones, joints, still, black, move };
}
