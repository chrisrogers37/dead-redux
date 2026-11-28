import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { eraOn } from "./lineup.js";

/* The band on the stage (stage.js): the line-up that played the day's show (lineup.js), five to seven players, lit, dressed in
   their era's colours and faceless, never likenesses, each read by their outline against the light panel behind and by their
   clothes (WARDROBES, dressOf), their skin and hair, and their instruments in their materials. A line-up is roles, never people: a
   lead guitar, a rhythm guitar, a bass, one or two drummers, and the keyboards of its era (an organ, a second keyboard, a piano),
   and a singer at a microphone, with a tambourine; with the stage's furniture, which is theirs: microphones on
   stands and wedge monitors at the lip. Given no line-up, the band is the six of 1979 to 1990 (SIX): from the crowd's left a
   guitar, a bass, two drummers side by side, a second guitar, and keys.

   It costs eight draw calls at the most, on every tier and for every line-up. Each player's trunk and instrument are one mesh, which
   sways as one, a drummer's head with it; the head of each who sings stands still, among the still parts; every limb that moves on
   its own (legs, a strumming arm, a tapping foot, a keyboard player's arms, the drummers' arms and sticks) is an instance of one
   tapered bar in one instanced mesh, laid each frame between two joints; and everything that stands
   still (the kits, the keyboards, the stands, the shoes that stay down, and the bodies of the organ's player and the pianist, who
   move only their arms) is one merged mesh. One material draws all of it, in its corners' colours (each bone's its own), lit by a
   light of the band's own that takes the hour alone (LIGHT), never the music.

   No one is anyone, and by construction: no player pairs an instrument with the build and the hair a fan knows a player of it by.
   The players are told apart by build, height, clothes and the outline of their hair (DEAL): a tall, lean guitarist in a peaked
   cap, a long coat and boots; a short bassist in a long skirt, hair in a bun at the back of the crown; a drummer with a tail of hair
   and one with long hair; a broad guitarist in a long skirt with a bob; a slight keys player with short hair; and the three roles
   the six lack. None has a beard, a brimmed hat or a bushy head, and no collar and no hair stands under a jaw, where an outline
   would read it as a beard. A head is a smooth form in its skin and its hair, with no eyes, nose or mouth. Their colours are the
   era's and the seat's (dressOf), never a player's: no seat keeps a look from one era to the next, and a role picks which garments
   are worn (DEAL), not their colours, but that a lead guitar's are never nearly black where they show. The bass stands between the
   two guitars and the keyboards face the crowd: the band this site is for stood its bass at an end of its front
   line through all its years, as far as its stage plots are known here. The instruments are plain shapes of their kind. */

/* A player is drawn in their own units, a person about 1.78 tall, and stands SCALE times that: the crowd's height (seats.js PERSON). */
export const SCALE = 1.77;

/* The band keeps its own count of the beat, and plays in half time when the figures' beat (beat.js) is fast: over HALF_OVER beats a
   second (105 a minute) its count runs at half the beat, until the beat falls under HALF_UNDER (90 a minute). So the count never runs
   faster than HALF_OVER a second, whatever the tempo: nor in the frames before half time takes hold, while the beat's smoothed speed
   (RATE_SMOOTH) rises past it, when the count is held to that pace and comes back onto the beat after (RETUNE). The pull back onto
   the beat is held to the same pace, and never runs the count back: `move` returns the count, and a test steps it frame by frame.

   How the band moves was set by the old bar on flashes (CLAUDE.md), which the six capsules this band replaced broke two and three
   times over. A limb against the lit panel swings a point's brightness as its edge passes, and at the hill's distance an arm, a
   stick or a guitar's neck is a pixel wide: it flickers on and off whole as it moves. So the band plays gently and slowly. What
   shows against the panel comes and goes once in four counts: a sway of the hips, by no more than a hand's breadth, a pixel from
   the back of the crowd on a phone; a stick's stroke, which lifts its tip out past the drummer's shoulder, so the drummers show
   playing from the front. The keys player's hands take turns, once in eight counts: one lifts from the keys to beside the head as
   the other comes down, and stays up for three counts, so that no point of the panel is crossed by a hand going up and again by it
   coming down within a second. What is quicker moves over the player's own outline: a hand strumming over its
   instrument, one way on a count and back on the next; or against the floor: a foot tapping the count. The heads of the four who
   sing stand still at their microphones, and nothing moves on the half count.

   And nothing creeps. Each move holds still, goes at an even pace over MOVE of a count and arrives on a count, and holds again (a
   lift of the keys' hands over LIFT_MOVE, its joints turning at an even pace); a stick lies on its drum, climbs at an even pace,
   holds at its top and falls at an even pace (STROKE). An edge that eased
   to a stop lingered on a pixel's middle, where the GPU's rounding of its corners flipped that pixel frame after frame: the keys
   player's arm, at the end of a sway, 16 times in a second from the stage pose on a phone.

   And the outlines are closed. Nothing here is antialiased, so a pocket of the panel's light a pixel or two wide inside a player's
   outline is the panel's or the band's as a whole pixel, and an edge that rests on that pixel's centre flips it from one frame to the next: a
   drummer's arm, nearly still, counted 11 swings in a second at one pixel under it at daybreak, with the edge within three
   thousandths of a pixel of the centre for 18 frames. So no limb stands a little off a trunk or an instrument: a guitarist's arm
   lies against the trunk to the elbow, a fretting arm's bend is filled to the neck, a drummer's elbows stand out with the bend
   behind them filled, a cymbal stands well clear, and each microphone's stand, beside its singer, joins them or stands whole on its base.
   What thin gaps are left are a wedge's tip where two parts part, the notches of an instrument's own outline, and gaps between
   parts that stand still (`band.test.ts` counts them).

   And each outline holds together on a phone from the back of the crowd, where a phone draws the stage at 17 to 20 cm a pixel
   and stretches its 0.85 of a pixel over the screen, and at every step down of its quality, to half that. A part a pixel or so
   across comes to the screen grey and broken where its pixels meet corner to corner, and what is wider at the end of it, a
   headstock, a hand, a cuff, a stand's foot, is left as a dark speck alone, which comes and goes as the visitor walks. So
   what stands clear of an outline is short, or is fitted to the canvas: what of a guitar's or the bass's neck runs on past where
   it is fretted, to its head, is fitted to the canvas (axe, NECK_PX); a crash's pole, a microphone's stand and the singer's
   microphone, an organ's legs, a keyboard player's lifted forearm and hand, a drummer's forearms, a tapping foot and the singer's
   legs are each as stout as a pixel of the canvas from the back of the crowd (SEEN, `fit`); a fretting hand lies where the arm's
   bend is filled; a crash's pole and the singer's stand stand on no foot, and a microphone's stand on a low base that lies flat
   on the floor; boots reach up into a long coat; the keys stand on a case as wide as the legs behind it; a cymbal tips toward
   the crowd, so it shows as a disc; and a drummer's stick is thickest at its tip, which is what shows of it. And nothing comes
   within two pixels of the stage's own black, where it would read as part of the wall or a PA stack. `band-outline.ts` draws each
   line-up with the stage as the shoot's devices draw them, counts the specks, and weighs each player's outline against the panel
   by its contrast in luminance. */
export const HALF_OVER = 1.75, HALF_UNDER = 1.5;

/* The counts in which a move comes and goes once, each set by a count of flashes (scripts/flash; the bar then was 6 swings a second at
   a block). What shows against the panel takes SLOW counts: a sway once in two counted 8 where an arm passed a trunk, a stroke once in
   two counted 7 to 9 on a phone, and once in four both count 5 at the most. A strum takes STRUM, one way a count: down and up inside
   each count, riding the sway, it counted 6. Only a foot keeps the count itself, against the floor. */
export const SLOW = 4, STRUM = 2;
/* A lead guitar's solo comes and goes once in SOLO counts: through half of them its player leans over to the right about the mouth,
   which stays at the microphone, the hips going out to the left, and the guitar's neck rises (`strummer`'s `solo`). */
export const SOLO = 32;
/* How long a move takes, in counts, at an even pace, so that no edge creeps (above): the GPU puts each corner of a triangle on a grid
   of 1/256 of a pixel, so an edge that creeps over a pixel's middle crosses it to and fro as its corners step. An edge that goes at
   an even pace crosses it once, and one that holds still flips nothing. */
export const MOVE = 0.35;
/* A move that comes and goes once in `per` counts, `counts` into it: it holds at 1 from its count, goes at an even pace to -1 over
   MOVE counts (a quarter of `per` at the most), arriving halfway to the next, holds there, and comes back so, arriving on its count. */
export const swing = (counts, per, move = MOVE) => {
  const u = counts / per - Math.floor(counts / per), m = Math.min(move, per / 4) / per;
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
/* How long a lift takes, in counts: a hand goes a metre of the stage and more, and over MOVE it set off and stopped faster than a
   stick does. And a keyboard player's upper arm and forearm, long. */
const LIFT_MOVE = 1;
/* How far along the keys a keyboard player's hand stands from where it lifts, out toward its own end of them (`keyboardist`'s
   `glide`): all of `glide` while the hand is down on its keys, none at the top of its lift, and between, at the lift's own even pace,
   so a hand goes along the keys as it comes down to them and back as it leaves, at the same speed all the way. `slow` is the lift's
   move (swing, 1 to -1) and `lead` the hand's turn in it, 1 the left hand's and -1 the right's. */
export const glided = (glide, level, slow, lead) => (level * glide * (lead + slow)) / 2;
const ARM = { upper: 0.29, fore: 0.26 };
/* Where each of a standing keyboard player's wrists lifts to, in their own metres: as high as the chin, a little in front of the
   shoulder and out on its own side (the left the further out, since the keys player turns it from the crowd), so that from the front
   and from the hill the forearm and the hand stand against the panel beside the head; the way the fingers point there; and the way
   each elbow bends: down and back while the hand is on the keys, and out to its side and forward at the top, so that the forearm
   stands up beside the head. */
const LIFT = { left: [0.32, 1.55, 0.2], right: [0.2, 1.55, 0.3], fingers: [0.05, 1, 0.1], tucked: [0.2, -1, -0.5], forward: [0.6, -0.6, 0.6] };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), BACK = V(-1, 0, 0), AHEAD = V(0, 0, 1);

/* ---------- parts ---------- */

/* A part as the band's meshes take it: its corners, each with its normal, which the band's light shades (LIGHT), and its colour
   (`paint`), under its name, if it has one. Nothing here is textured. A part with no colour is a mistake, and the build stops on it. */
const bare = (geo) => {
  const g = geo.index ? Object.assign(geo.toNonIndexed(), { name: geo.name }) : geo;
  g.deleteAttribute("uv");
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  if (!g.getAttribute("color")) throw new Error("band.js: a part with no colour");
  return g;
};
/* A colour as the band's vertices hold it, from its sRGB hex: three's working space, linear. */
const tone = (hex) => new THREE.Color(hex);
/* A part in one colour, every corner of it. */
function paint(geo, c) {
  const n = geo.getAttribute("position").count, colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return geo;
}
/* A part coloured a face at a time, as `pick` says: it is handed each triangle's middle, its face's normal and its number, all in
   the part's own frame as it is now, and gives the face's colour. */
const tri = [V(), V(), V()], mid = V(), across1 = V(), across2 = V(), facing = V();
function paintBy(geo, pick) {
  const g = geo.index ? geo.toNonIndexed() : geo, at = g.getAttribute("position"), n = at.count, colours = new Float32Array(n * 3);
  for (let i = 0; i + 2 < n; i += 3) {
    for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(at, i + k);
    mid.copy(tri[0]).add(tri[1]).add(tri[2]).divideScalar(3);
    facing.crossVectors(across1.subVectors(tri[1], tri[0]), across2.subVectors(tri[2], tri[0])).normalize();
    const c = pick(mid, facing, i / 3);
    for (let k = 0; k < 3; k++) colours.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return g;
}
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

/* The one bar every moving limb is an instance of: 1 long up y from its thick end, 0.94 across at its widest, a tenth of the way up,
   tapering to three quarters of that, its ends rounded: an upper arm's swell to the elbow and a forearm's to the wrist, a thigh's to
   the knee. Eight sides, so that from every side its outline is round; and as wide across its flats as the six-sided bar it
   replaced (0.94 of it across its corners), so that no outline widens: a limb a full 1 across at its corners met a neighbour's
   outline at a phone's lower rungs (band-outline.test.ts, "keeps each player an outline of their own"). */
const LIMB_SIDES = 8;
const LIMB = bare(paint(new THREE.LatheGeometry([[0, 0], [0.36, 0], [0.47, 0.1], [0.44, 0.45], [0.35, 0.9], [0.28, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y)), LIMB_SIDES), tone(0xffffff)));
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
/* A limb that never moves, as a part: the same bar, laid once, in colour `c`. */
const laid = new THREE.Matrix4();
const limb = (c, a, b, wide, thick = wide, pads = [0, 0], ref = X) => paint(LIMB.clone().applyMatrix4(lay(laid, a, b, wide, thick, pads, ref)), c);
/* A web: a flat piece between three points, seen from both sides, that fills what three parts enclose, in colour `c`: of the clothes,
   where it fills an arm's bend. */
const web = (c, a, b, d) => {
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([a, b, d, a, d, b].flatMap((v) => [v.x, v.y, v.z]), 3));
  geo.computeVertexNormals();
  return paint(geo, c);
};
/* A smooth body through rings of corners, each ring as many as the next, closed round each ring and over its first and its last:
   each corner's normal the mean of its faces', so that it shades round, not in facets. Its faces face out, whichever way its rings
   run: wound the other way where the body they close has less than no volume so. */
function tube(rings) {
  const n = rings[0].length, at = rings.flat().flatMap((v) => [v.x, v.y, v.z]), index = [];
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < n; k++) {
    const a = r * n + k, b = r * n + ((k + 1) % n);
    index.push(a, b, b + n, a, b + n, a + n);
  }
  const mid = (ring) => ring.reduce((sum, v) => sum.add(v), V()).divideScalar(n), last = (rings.length - 1) * n, low = at.length / 3;
  for (const c of [mid(rings[0]), mid(rings.at(-1))]) at.push(c.x, c.y, c.z);
  for (let k = 0; k < n; k++) index.push(low, (k + 1) % n, k, low + 1, last + k, last + ((k + 1) % n));
  let volume = 0;
  const p = (i) => V(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]);
  for (let i = 0; i < index.length; i += 3) volume += p(index[i]).dot(V().crossVectors(p(index[i + 1]), p(index[i + 2])));
  if (volume < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(at, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
/* A ring round a body, `sides` corners on an ellipse `w` across to either side and `d` deep before and behind its middle at `y`, `z`
   forward; `shape(a)` scales it at the angle a from the front, and `drop(a)` lowers it there. */
const ring = (y, w, d, z, sides, shape = () => 1, drop = () => 0) => Array.from({ length: sides }, (_, k) => {
  const a = (2 * Math.PI * k) / sides, s = shape(a);
  return V(w * s * Math.sin(a), y - drop(a), z + d * s * Math.cos(a));
});
/* A trouser cuff round an ankle, `hem` in radius at its foot and `tall` from CUFF's `foot`, in colour `c`. A boot is one, taller
   (`stand`), tapering to BOOT_TOP in radius at its top, which reaches up under a coat's skirts: a lead guitar's, 0.074 at its top,
   stood out of the side of its coat (band-bodies.test.ts), and its ankles each 2 cm nearer its middle thinned the light between its
   boots from the hill (band.test.ts, "leaves few gaps"). */
const CUFF = { foot: 0.055, tall: 0.14 }, BOOT_TOP = 0.054;
const cuff = (c, ankle, hem = 0.084, tall = CUFF.tall, top = 0.062) => paint(new THREE.CylinderGeometry(top, hem, tall, 10).translate(ankle.x, CUFF.foot + tall / 2, ankle.z), c);
/* A shoe from its heel to its toe, in colour `c`: flat on the floor, its upper rising over the instep behind the ankle, widest at the
   ball of the foot, and rounding down to the toe; each ring across it a half-ellipse over a flat sole. */
/* A standing player's foot, FOOT from heel to toe, its toe turned out by their `toes` (DEAL). Turned out twice as far and 2 cm longer,
   a still shoe's toe stood a pixel apart from its ankle, corner to corner, from the back of the crowd on a phone at dusk, once no
   microphone's base stood before it (band-outline.test.ts, "comes apart little"). */
const FOOT = 0.25;
const SHOE = [[-0.032, 0.036, 0.055], [0, 0.046, 0.085], [0.08, 0.048, 0.098], [0.17, 0.054, 0.07], [0.235, 0.05, 0.058], [0.275, 0.038, 0.045], [0.298, 0.018, 0.03]];
function shoe(c, heel, toe) {
  const way = V(toe.x - heel.x, 0, toe.z - heel.z), scale = way.length() / 0.27, turn = Math.atan2(way.x, way.z);
  const rings = SHOE.map(([z, w, t]) => [0, 1, 2, 3, 4, 5, 6].map((k) => V(w * Math.cos((Math.PI * k) / 6), t * Math.sin((Math.PI * k) / 6), z * scale)));
  return paint(tube(rings).rotateY(turn).translate(heel.x, 0, heel.z), c);
}
/* A hand closed on what it holds, as still parts in colour `c`: at `at`, the middle of the grip; the knuckles the way `ahead` from the
   wrist, and what it holds running the way `across`. A palm, the fingers' mass curled over the held thing on the side the knuckles
   turn to (ahead × across, or the other way with `flip`), and a thumb along it on the other; and the wrist it is held from, behind
   the palm, which an arm ends in. */
function fist(c, at, ahead, across, flip = false, big = 1) {
  const f = ahead.clone().normalize(), a = across.clone().addScaledVector(f, -across.dot(f)).normalize(), u = V().crossVectors(f, a).multiplyScalar(flip ? -1 : 1);
  const p = (x, y, z) => at.clone().addScaledVector(a, x * big).addScaledVector(f, y * big).addScaledVector(u, z * big);
  const palm = new THREE.IcosahedronGeometry(1, 1).scale(0.042 * big, 0.05 * big, 0.034 * big).applyMatrix4(new THREE.Matrix4().makeBasis(a, f, u)).translate(at.x, at.y, at.z);
  palm.name = "palm";
  return { parts: [paint(palm, c), limb(c, p(-0.04, 0.035, 0.012), p(0.042, 0.03, 0.004), 0.05 * big, 0.04 * big, [0.008, 0.008], u),
    limb(c, p(-0.02, -0.028, -0.03), p(0.035, 0.012, -0.034), 0.03 * big, 0.026 * big, [0, 0.004], f)], wrist: p(0, -0.055, 0) };
}
/* An arm that never moves, as still parts of a body: an upper arm from the shoulder to the elbow and a forearm to the wrist, the elbow
   between them, in the sleeves the dress has (worn): a long sleeve to the wrist, with a cuff; a short one, a tee's, ending above the
   elbow over the skin of the arm; or one rolled to under the elbow. */
function armParts(dress, shoulder, elbow, wrist = null, wide = 0.118) {
  const { skin, upper, fore, sleeve } = worn(dress), parts = [], at = (t) => shoulder.clone().lerp(elbow, t);
  if (sleeve === "short") parts.push(limb(upper, shoulder, at(0.55), wide * 1.12, wide * 1.12, [0.02, 0]), limb(skin, at(0.4), elbow, wide * 0.9, wide * 0.9, [0, 0.02]));
  else parts.push(limb(upper, shoulder, elbow, wide, wide, [0.02, 0.02]));
  parts.push(paint(ball(elbow, wide * 0.38, 1, 1, 1, 1), sleeve === "short" ? skin : upper));
  if (!wrist) return parts;
  parts.push(limb(fore, elbow, wrist, wide * 0.88, wide * 0.8, [0.015, 0.01]));
  if (sleeve === "long") parts.push(limb(fore, elbow.clone().lerp(wrist, 0.86), wrist, wide * 0.84, wide * 0.8, [0, 0.008]));
  if (sleeve === "rolled") parts.push(limb(upper, elbow.clone().lerp(wrist, 0.04), elbow.clone().lerp(wrist, 0.24), wide * 0.98, wide * 0.92));
  return parts;
}

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
/* A leg under a skirt or a coat (`stand`), never seen, is as wide as this at the thigh and the shin: as wide as a leg in trousers,
   0.2 and 0.148, a thigh stood out of the side of the bass's and the rhythm guitarist's skirts, and the lead guitar's thigh and
   shin out of its coat (band-bodies.test.ts). */
const HIDDEN_LEG = { thigh: 0.12, shin: 0.1 };
/* How far a skirt's corners go from where its body has them, at most, as it hangs (buildBand's `hang`): a body's bounds take that
   much more, so it is never culled while a skirt shows. */
const HANG_SLACK = 0.2;
const bound = (geo) => {
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += geo.userData.slack ?? 0;
};
/* Sends `count` corners of a body's attribute `a` from `from` to the GPU on the next draw, and no more of it than the ranges sent so,
   which three clears once they are sent: a skirt's each frame (buildBand's `hang`), and a neck's tip as the canvas changes (`fit`). */
function send(a, from, count) {
  for (let i = 0; i < a.updateRanges.length; i++) if (a.updateRanges[i].start === from * 3) { a.needsUpdate = true; return; }
  a.addUpdateRange(from * 3, count * 3);
  a.needsUpdate = true;
}
/* The torso, from under the hips to the neck's foot, as rings over the hips, each [up, half its width, half its depth, how far forward
   its middle stands], in a player's own metres, the width times their build (`broad`): the hips; the waist, narrower; the chest,
   deepest and forward; the shoulders' line, widest; and the slope up to the neck. A ring stands at each line where the clothes'
   colours change (`trunk`: the belt's at 0.04, a check's rows at 0.223 and 0.337, the shoulders' at 0.49), since each face takes
   the colour at its middle, and a line between two rings came out in teeth. */
const TORSO = [[-0.1, 0.165, 0.12, 0], [0, 0.175, 0.125, 0], [0.04, 0.171, 0.122, 0.001], [0.08, 0.166, 0.118, 0.002], [0.16, 0.142, 0.106, 0.006],
  [0.223, 0.152, 0.111, 0.011], [0.26, 0.164, 0.116, 0.014], [0.337, 0.186, 0.123, 0.019], [0.35, 0.19, 0.124, 0.02], [0.42, 0.205, 0.118, 0.014],
  [0.47, 0.195, 0.1, 0.004], [0.49, 0.18, 0.094, 0.002], [0.51, 0.162, 0.086, 0], [0.54, 0.118, 0.072, -0.002], [0.56, 0.072, 0.06, -0.004]];
/* How wide a front stands open at a height up the chest (`up`, 0 at the waist and 1 at the shoulders), as an angle from the front to
   either side, in rad: a coat's down its front, wider at the top where its lapels turn back; a vest's in a deep V; an open shirt's. */
const OPEN = { coat: (u) => 0.1 + 0.32 * Math.max(0, u - 0.3), vest: (u) => Math.max(0, 0.58 * (u - 0.3)), open: (u) => 0.08 + 0.26 * Math.max(0, u - 0.4) };
/* A trunk and a head in a posture, facing +z, dressed as `dress` says (WARDROBES). `broad` widens it. A collar stands from the
   shoulders' slope to under the head's widest, behind the jaw's line, so no notch is open under the jaw from the front and nothing
   stands under the chin from the side. The hair is an outline and no more, and falls behind the jaw too: "short", "long" past the
   shoulders, a "bob" to them, a "tail" down the back, a "cap" with a peak, a "knot" on the crown, a "beanie", or "bunches" either
   side. `skirt` is the length of a skirt or a coat's skirts from the hips, 0 for none: a coat, `dress.coat`, closes over the trunk
   and the arms, open down the front over what is under it, its lapels turned back. The head is a smooth form, with no eyes, nose or
   mouth, and the skin's colour, its jaw under it; the hair is the hair's, and a cap or a beanie the hat's. Returns the parts, the
   `pivot` at the waist, the `hip` and the `shoulder` of a side (1 the player's left, +x, and -1 their right), and the mouth. */
function trunk({ hips: h, waist }, broad, hair, skirt = 0, dress) {
  const head = V(0, h + 0.735, 0.005), { skin, shoulders, slope, under, pattern, collar, cut } = worn(dress);
  const below = dress.coat ?? (skirt ? dress.skirt : dress.lower), open = under ? OPEN[dress.coat ? "coat" : cut] ?? OPEN.open : null;
  /* The torso, sixteen corners round, in its garments: below the hips' line what is worn under it; over the shoulders' line the slope
     to the neck; and between, the chest's pattern (a check's or a print's squares, `pattern`), but where a front stands open, which
     shows what is under it, and a vest's armholes, which show the shirt's sleeves. */
  const torso = paintBy(tube(TORSO.map(([y, w, d, z]) => ring(h + y, w * broad, d, z, 16))), (at) => {
    const u = (at.y - h - 0.11) / 0.34, turn = Math.atan2(at.x / broad, at.z / 0.62);
    if (at.y < h + 0.04) return below;
    if (at.y > h + 0.49) return slope;
    if (open && Math.abs(turn) < open(u)) return under;
    if (cut === "vest" && !dress.coat && u > 0.75 && Math.abs(Math.abs(turn) - Math.PI / 2) < 0.4) return dress.second;
    return pattern(turn, u);
  });
  torso.name = "torso";
  const parts = [torso, ...[1, -1].map((s) => paint(ball(V(s * 0.188 * broad, h + 0.45, 0), 0.064, 1.05, 1.1, 1, 1), shoulders))];
  /* A coat's lapels: a flap each side of its open front, from under the collar halfway down the chest, turned back over it. */
  if (dress.coat) for (const s of [1, -1]) {
    const on = (u, out, proud) => { const y = h + 0.11 + 0.34 * u, r = ringAt(y - h), a = s * (open(u) + out); return V(r.w * broad * Math.sin(a) * (1 + proud), y, r.z + r.d * Math.cos(a) * (1 + proud)); };
    parts.push(web(dress.coat, on(1.05, 0, 0.04), on(0.55, 0, 0.04), on(0.62, 0.42, 0.1)), web(dress.coat, on(1.05, 0, 0.04), on(0.62, 0.42, 0.1), on(0.98, 0.36, 0.1)));
  }
  /* The head, with its neck, its collar, its jaw and its hair: its own list, since one who sings keeps theirs still (see buildBand).
     The head is an ellipsoid of 180 faces, turned so that a corner stands at its crown, as band.test.ts's faceless test finds it. */
  const top = [
    paint(new THREE.CylinderGeometry(0.054, 0.062, 0.17, 10).translate(0, h + 0.55, -0.005), skin),
    paint(new THREE.CylinderGeometry(0.094, 0.115, 0.19, 12).scale(1, 1, 0.5).translate(0, h + 0.58, -0.035), collar),
    paint(skull(new THREE.IcosahedronGeometry(0.112, 2).rotateX(-Math.atan((1 + Math.sqrt(5)) / 2)).scale(0.88, 1.12, 1)).translate(head.x, head.y, head.z), skin),
  ];
  const lift = (x, y, z) => V(head.x + x, head.y + y, head.z + z);
  const tops = (...parts) => parts.map((part) => paint(part, dress.hair));
  /* Hair over the crown, with its own volume: fuller at the crown and the back than the head under it. */
  const crown = () => ball(lift(0, 0.028, -0.022), 0.117, 0.96, 1.02, 1.05, 2);
  /* Hair that falls: a dome over the crown, and a skirt from it down to `to` below the head's middle, `wide` at its hem. */
  const fall = (to, wide) => tops(crown(),
    paint(tube([0, 1, 2, 3].map((k) => ring(head.y + 0.005 - ((to + 0.01) * k) / 3, 0.124 + ((wide - 0.124) * k * k) / 9, (0.124 + ((wide - 0.124) * k * k) / 9) * 0.66, head.z - 0.055, 12))), dress.hair));
  if (hair === "short" || hair === "knot") top.push(...tops(crown()));
  if (hair === "knot") top.push(...tops(ball(lift(0, 0.088, -0.108), 0.068, 1.25, 0.85, 1, 2)));
  if (hair === "long") top.push(...fall(0.33, 0.162));
  if (hair === "bob") top.push(...fall(0.215, 0.158));
  if (hair === "tail") top.push(...tops(crown(), ball(lift(0, -0.01, -0.128), 0.05, 1, 1, 1, 1), limb(dress.hair, lift(0, -0.02, -0.135), lift(0, -0.2, -0.12), 0.072, 0.06), limb(dress.hat, lift(0, -0.02, -0.134), lift(0, -0.05, -0.132), 0.078, 0.066)));
  if (hair === "cap") top.push(...[new THREE.CylinderGeometry(0.098, 0.108, 0.08, 12).translate(head.x, head.y + 0.094, head.z), ball(lift(0, 0.13, 0), 0.098, 1, 0.3, 1, 1),
    new THREE.BoxGeometry(0.16, 0.026, 0.1).rotateX(0.35).translate(head.x, head.y + 0.055, head.z + 0.14)].map((part) => paint(part, dress.hat)));
  /* A knitted cap with no brim, from the brow up, flat at the sides and rounded on top: the head stands taller and squarer than
     under hair. */
  if (hair === "beanie") top.push(...[new THREE.CylinderGeometry(0.106, 0.12, 0.13, 8).translate(head.x, head.y + 0.05, head.z - 0.01), ball(lift(0, 0.115, -0.01), 0.106, 1, 0.55, 1, 1)].map((part) => paint(part, dress.hat)));
  /* Two bunches of hair, one each side of the crown, behind the ears and over the jaw's line: from the front, a bump to either side. */
  if (hair === "bunches") top.push(...tops(crown(), ...[1, -1].map((s) => ball(lift(s * 0.112, 0.035, -0.05), 0.052, 1, 1.15, 1, 1))));
  /* A skirt or a coat's skirts, `skirt` long from the hips, flaring to its hem, which closes the gap between the legs. A skirt's hem
     falls in folds; a coat's skirts hang longer behind, part at the front over what is under, and are 0.93 as wide: as wide as a
     skirt, from among the crowd on a desktop the first guitar's coat met the bass in the sevens (band-outline-1990.test.ts). Either
     hangs from the hips over the legs, which stay under it as they move (buildBand's `hang`; band-bodies.test.ts). The torso and the
     skirt are named, as the parts a skirt's legs stay inside. */
  if (skirt) {
    const rows = [0, 0.25, 0.5, 0.75, 1].map((t) => [h + 0.03 - (skirt + 0.01) * t, 0.178 + 0.153 * skirt * t ** 1.3]);
    const folds = (a) => 1 + (dress.coat ? 0 : 0.035) * Math.cos(7 * a), tail = (a) => (dress.coat ? 0.035 * (1 - Math.cos(a)) : 0);
    const geo = tube(rows.map(([y, r], k) => ring(y, r * broad * (dress.coat ? 0.93 : 1), r * 0.8, 0, 20, k ? folds : () => 1, k === 4 ? tail : () => 0)));
    const skirts = bare(dress.coat ? paintBy(geo, (at) => (Math.abs(Math.atan2(at.x / broad, at.z)) < 0.1 ? dress.lower : dress.coat)) : paint(geo, dress.skirt));
    skirts.name = "skirt";
    parts.push(skirts);
  }
  for (const part of top) part.name = "head";
  return { parts, head: top, pivot: V(0, h + waist, 0), hip: (side) => V(side * 0.09 * broad, h - 0.02, 0), shoulder: (side) => V(side * 0.205 * broad, h + 0.455, 0), mouth: V(0, h + 0.685, 0.105) };
}
/* A head's ellipsoid (`trunk`), about its middle, shaped as a skull is: below 3 cm under its middle it narrows, to 0.72 of its width
   and 0.9 of its depth at its foot, into a jaw and a chin, and the back of it more than the front, into the neck. All of it stays
   inside the ellipsoid, and over that line it is the ellipsoid, which band.test.ts's faceless test holds. */
function skull(geo) {
  const at = geo.getAttribute("position"), ry = 0.112 * 1.12, from = -0.03;
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i);
    if (y >= from) continue;
    const t = (from - y) / (ry + from), z = at.getZ(i);
    at.setXYZ(i, at.getX(i) * (1 - 0.28 * t * t), y, z * (1 - (z < 0 ? 0.2 : 0.1) * t * t));
  }
  geo.computeVertexNormals();
  return geo;
}
/* The torso's ring at height `y` over the hips' (TORSO), between the two it lies between. */
function ringAt(y) {
  const k = Math.max(1, TORSO.findIndex(([u]) => u >= y)), [ua, wa, da, za] = TORSO[k - 1], [ub, wb, db, zb] = TORSO[k], t = (y - ua) / (ub - ua);
  return { w: wa + (wb - wa) * t, d: da + (db - da) * t, z: za + (zb - za) * t };
}

/* A guitar or a bass, held: flat in its own frame, x along the strings from the body's end toward the head and y across them, with the
   point `strum` along the strings put at `at`, the neck risen `rise` rad to the player's left and brought `yaw` rad forward, drawn
   `big` times its size, a little over life, so that its outline carries from the hill. `body` is the body's outline from the neck's
   joint round to the joint again; the neck runs from `joint` to `nut`, `neck` wide; the head is `head` long and `face` wide, a
   paddle square at its end, flared over 4 cm or its length, and no more than a quarter wider than the neck: pegs apart are teeth a
   pixel wide from the crowd, whose tips counted 8 swings in a second at daybreak. The neck runs on past the fretting hand at
   `fret` to the nut and a head, so that from the front it reads as a neck; and what of it stands past the hand, the `tip`, is its
   own part, fitted to the canvas as a crash's pole is (buildBand's `fit`): from the back of the crowd on a phone a neck as built
   is half a pixel wide, and a tip as thin came to CI's screen as a dot of its own (band-outline.test.ts). Returns the parts, the
   tip's parts, `hold`, the matrix from its frame to the player's, and `on(x, y, z)`, a point of its frame in the player's. */
function axe({ at, rise, yaw, big, strum, body, joint, nut, neck, head, face }, fret, finish) {
  const hold = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationY(-yaw))
    .multiply(new THREE.Matrix4().makeRotationZ(rise)).multiply(new THREE.Matrix4().makeScale(big, big, big)).multiply(new THREE.Matrix4().makeTranslation(-strum, 0, 0));
  const half = face / 2, tip = nut + head, flare = Math.min(nut + 0.04, tip);
  /* The body's two faces in its finish's colour, and its edge, square to them, in the binding's; and on the face toward the crowd a
     disc that shades from the finish's middle at its centre to its face at its rim, inside the body's outline: a sunburst, where the
     two differ. */
  const parts = [paintBy(plate(body, 0.045), (_, n) => (Math.abs(n.z) > 0.7 ? finish.face : finish.edge)), burst(body, 0.0235, finish),
    paint(box(fret - joint + 0.04, neck, 0.028, (fret + joint - 0.04) / 2, 0, 0), finish.neck)];
  const ends = [paint(box(nut - fret + 0.02, neck, 0.028, (nut + fret - 0.02) / 2, 0, 0), finish.neck),
    paint(plate([[nut - 0.01, -neck / 2], [flare, -half], [tip, -half], [tip, half], [flare, half], [nut - 0.01, neck / 2]], 0.022, false), finish.head)];
  for (const p of [...parts, ...ends]) {
    p.applyMatrix4(hold);
    p.name = "instrument";
  }
  return { parts, tip: ends, hold, on: (x, y, z = 0) => V(x, y, z).applyMatrix4(hold) };
}
/* The sunburst on a body of outline `body`, `z` in front of its middle: an ellipse round the middle of the body's lower bout, two
   thirds as long as the body is from its end to the neck's joint and three fifths as wide as the bout, a fan of 16 faces from its
   centre, which is the finish's `burst`, to its rim, which is its `face`. */
function burst(body, z, finish) {
  const joint = body[0][0], wide = Math.min(...body.filter(([x]) => x > 0.1 && x < joint - 0.1).map(([, y]) => Math.abs(y)));
  const rx = joint / 3, ry = 0.6 * wide, cx = joint * 0.45, corners = [], colours = [];
  for (let k = 0; k < 16; k++) {
    const a = (2 * Math.PI * k) / 16, b = (2 * Math.PI * (k + 1)) / 16;
    corners.push(cx, 0, z, cx + rx * Math.cos(a), ry * Math.sin(a), z, cx + rx * Math.cos(b), ry * Math.sin(b), z);
    for (const c of [finish.burst, finish.face, finish.face]) colours.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(corners, 3)).setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  return geo;
}
/* Three plain instruments: a guitar with two short horns, one with a single cutaway, and a bass, longer in the neck. Each neck runs
   12 to 20 cm past where its player frets it (`fret`, below) to a head 12 to 14 cm long. */
const TWO_HORNS = { strum: 0.19, joint: 0.42, nut: 0.96, neck: 0.052, head: 0.12, face: 0.064,
  body: [[0.42, 0.032], [0.455, 0.06], [0.47, 0.1], [0.4, 0.122], [0.32, 0.135], [0.24, 0.122], [0.15, 0.165], [0.07, 0.155], [0.012, 0.09], [0, 0],
    [0.012, -0.09], [0.06, -0.16], [0.14, -0.17], [0.24, -0.124], [0.33, -0.14], [0.42, -0.135], [0.49, -0.115], [0.46, -0.07], [0.42, -0.032]] };
const ONE_CUT = { strum: 0.19, joint: 0.43, nut: 0.92, neck: 0.052, head: 0.12, face: 0.064,
  body: [[0.43, 0.032], [0.445, 0.08], [0.41, 0.125], [0.34, 0.146], [0.26, 0.13], [0.16, 0.176], [0.08, 0.17], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.166], [0.15, -0.176], [0.25, -0.126], [0.33, -0.142], [0.41, -0.146], [0.475, -0.12], [0.45, -0.075], [0.43, -0.032]] };
const BASS = { strum: 0.2, joint: 0.47, nut: 1.14, neck: 0.058, head: 0.13, face: 0.07,
  body: [[0.47, 0.036], [0.55, 0.062], [0.58, 0.1], [0.46, 0.13], [0.36, 0.14], [0.27, 0.125], [0.17, 0.172], [0.08, 0.165], [0.012, 0.1], [0, 0],
    [0.012, -0.1], [0.07, -0.165], [0.17, -0.176], [0.27, -0.125], [0.37, -0.14], [0.46, -0.14], [0.54, -0.12], [0.5, -0.07], [0.47, -0.036]] };
/* A neck's tip is fitted to NECK_PX of a pixel SEEN m off (buildBand's `fit`), and no more than NECK_MOST times as wide as built,
   where a canvas is at its smallest. A neck slants at about 45 degrees, and a line a pixel wide at a slant holds together only corner
   to corner, which a phone's scaling to its screen breaks: from the back of the crowd on a phone, tips fitted to a pixel came apart
   0.39 times a frame at night, and 0.01 at 1.25 px (band-outline.test.ts). */
const NECK_PX = 1.25, NECK_MOST = 3;

/* A microphone on a stand, in a player's frame: the microphone from `back` to `tip`, before the mouth, at the end of a short boom from
   the top of a straight stand, which rises from a low round base on the floor at `foot`. The microphone is the kit's chrome. The
   stand is a dull steel (STUFF.steel), lit, so against a lit body it is a stand and no black bar, as it was in black; and no
   lighter, for where it stands at the outline against the panel it reads against it as a lit body does: in the kit's chrome the
   six of 1970-71's outline read 44 px of 180 from the back of the crowd on a phone at dusk, under its quarter (band-outline.ts
   BAND_READS), and in this steel 47. The stand is the part buildBand's `fit` widens (the first). The singer's microphone's head,
   a ball MIC_HEAD in radius, `fit` widens no further than MIC_HEAD_MOST: as far as a stand, on a phone it stood before the singer's
   face over the mouth (band-outline.ts `standsBefore`). */
const STAND = 0.036, MIC_BASE = 0.1, MIC_HEAD = 0.04, MIC_HEAD_MOST = 0.05;
/* Where a microphone stands, in the player's own frame and metres (`voice`). Its tip is MIC.off before the middle of the
   player at the mouth's height, 6 cm before the face, which keeps every corner and edge of it 0.42 of the head's radii off the face
   and more, over the 0.3 of band.test.ts's faceless test; it reaches MIC.long from there, out and down, its fall over its run
   MIC.tip. Its stand's top is `high`, under the chin, and a boom rises from there to the microphone's back, under the mouth: so from
   every camera of the shoot it comes in to the mouth from below and beside, and stands before no head above the mouth and no
   instrument (band-outline.ts `standsBefore`). With the top at the mouth's height, 1.6, the boom was a level bar over the lower face
   from the front of the crowd, and the bass's guitar neck crossed it.
   - A keyboard player's stand stands beside them, MIC.beside from their middle and MIC.back behind it, so that from the crowd it
     stands beside the torso and never before it (band-bodies.test.ts), on their side toward the stage's middle: they stand at its
     ends, turned in, and from the front the boom stands behind the hand at the top of its lift (band-outline.ts counts what shows of
     a lift with the stands left out). Its top, MIC.high, is at the shoulders: 7.5 cm under their joints, 21.5 under the chin and
     30.5 under the mouth (`trunk`), and the boom rises 24 cm.
   - A guitarist's and the bass's stand stands beside them on the side they strum on (STRUMMING), STRUMMING.out further out than
     the shoulder's joint, so that each stands as clear of their own torso, 37 to 40 cm from their middle, and STRUMMING.back behind
     it. Its top is at the chest, 17.5 cm under the shoulders' joints, 31.5 under the chin and 40.5 under the mouth, and the boom
     rises 34 cm, in front of the strumming shoulder, to the mouth. Their neck rises on the other side, where a boom rising to the
     mouth crossed it from the front. With the top at the shoulders, as a keyboard player's, the rhythm's stood 26 cm across from
     the second drummer's crash from the front, under the 35 of band.test.ts. With the top there, and each 38 cm out and 4 behind:
     2 cm further out, the lead's, at the stage's end, came within two pixels of a PA stack from among the crowd (band-outline.ts);
     2 cm further in, the rhythm's cuff stood over the base (band.test.ts), and 4 cm further in the lead's stood before the guitar
     from the front on a phone (band-outline.ts); 4 cm further back the boom went through the body, and 12 cm further forward the
     stand did; and behind the shoulder the boom went through it and came within 10 cm of the head (band.test.ts).
   Of the other places tried: just before the strumming hand, or before a keyboard's front corner, it stood before the torso from
   the crowd, the keyboard player's for their turn; on a keyboard player's side toward the stage's edge it came within two pixels of
   a PA stack or the back wall (band-outline.ts); a keyboard player's further in, out of line with the lead's stand from among the
   crowd, stood in their lifting arm's way, and behind their shoulder its boom went through it (band.test.ts); and a keyboard
   player's with its top at 2, over the lifted hand, stood over the top third of the light panel (band-lineups.test.ts), its boom
   within 10 cm of the head (band.test.ts), and at 1.1 the lifting hand went through the boom (band.test.ts). */
const MIC = { off: 0.178, tip: 0.5, long: 0.15, beside: 0.52, back: -0.1, high: 1.3 }, STRUMMING = { out: 0.18, back: -0.04, high: 1.2 };
/* A boom is BOOM in radius, 1 to 1.1 cm across in the player's metres, and `fit` widens it no further than BOOM_MOST. From every
   camera of the outline tests, desktop and phone, `fit` would widen it further, to hold together from the back of the crowd, so it is drawn
   4.2 to 4.9 cm across, under the width of a guitar's neck, 5.7 (TWO_HORNS and ONE_CUT at their `big`; the bass's is 6.3). At 0.022
   in radius and widened as far as a stand, it was 7.2 to 8.5 cm across on a desktop and 12 to 14 on a phone, over twice a neck; and
   capped at 3.9 to 4.6 cm, a keys player's boom came apart in two pixels at a phone's lowest rung from the front of the crowd
   (band-outline.ts). */
const BOOM = 0.006, BOOM_MOST = 0.026;
function microphone(tip, back, top, foot) {
  const steel = tone(STUFF.steel), along = V().subVectors(tip, back).normalize(), end = back.clone().addScaledVector(along, 0.025);
  return [
    paint(bar(V(foot.x, 0, foot.z), top, STAND, STAND - 0.002, 6), steel),
    paint(bar(back, tip, 0.022, 0.03, 6), tone(STUFF.chrome)),
    paint(bar(top, end, BOOM, BOOM * 0.8, 5), steel),
    paint(new THREE.CylinderGeometry(0, MIC_BASE, 0.03, 6, 1, true).translate(foot.x, 0.015, foot.z), steel),
  ];
}
/* A straight stand that leans, from the floor at `foot` up to `top`, `ra` in radius at the floor and `rb` at the top: its foot cut
   level with the floor, so the whole of it stands on the floor; and the way it leans (`along`), about which buildBand's `fit`
   widens it. */
function leaning(foot, top, ra, rb = ra, sides = 6) {
  const along = V().subVectors(top, foot).normalize(), geo = bar(foot, top, ra, rb, sides), at = geo.getAttribute("position");
  for (let i = 0; i < at.count; i++) {
    if (at.getY(i) > foot.y + 0.05) continue;
    const s = (at.getY(i) - foot.y) / along.y;
    at.setXYZ(i, at.getX(i) - along.x * s, foot.y, at.getZ(i) - along.z * s);
  }
  return { geo, along };
}

/* A cymbal, in a drummer's frame: a shallow cone `r` in radius, its middle at `c`, tipped `tip` rad toward the crowd and rolled `roll`
   to the side. A level cymbal is a line from the front of the crowd, a pixel thick, and a line comes and goes; tipped, it shows as
   an ellipse from the front and from the hill alike. */
const cymbal = (c, r, tip, roll = 0) => paint(drum(c, 0.03, r, 0.04, 14, tip, roll), tone(STUFF.bronze));
/* A stout pole from the floor at [x, z] up to `top`, 15 cm across as it stands on the stage: two pixels and more from among the
   crowd on a desktop, and from the hill a line a pixel wide that holds together, where a thinner one broke into specks. No foot
   and no tripod: a foot is a speck of its own from the back of the crowd on a phone, and a tripod's legs a pixel wide at best. */
const POLE = 0.042;
const pole = (x, z, top) => [paint(bar(V(x, 0, z), V(x, top, z), POLE, POLE, 8), tone(STUFF.chrome))];
/* What stands clear of an outline a pixel or so across from the back of the crowd is fitted to the canvas as the world draws it
   (buildBand's `fit`): a crash's pole, a microphone's stand and its boom, the singer's microphone and legs, an organ's legs, a keyboard
   player's lifted forearm and hand, a drummer's forearms (DRUM_FOREARM), and a tapping foot, whose toe stood a pixel off the floor
   as it lifted from the back of the crowd and came apart from the shin. Each is as stout as a pixel of it SEEN m off, as far as
   the path's pose stands from the band, so that it holds together from the back of the crowd however small the canvas, and no
   thinner than it was built, nor stouter than STOUT_MOST in radius: a boom than BOOM_MOST, and the singer's microphone's head than
   MIC_HEAD_MOST, which stand before a face.
   A drawn part is a pixel wide where its middle is a pixel's, so each is 5 % over a pixel across its flats (LIMB_FLATS of a
   limb's width: across the flats of its eight sides where it is narrowest, short of its rounded end, 0.7 across). On a phone at full scale a crash's pole is 21 cm across and at half scale 38 cm, where each
   crash stood alone in the air, its pole under half a pixel; and there a lifted hand stood apart from its arm. */
const SEEN = 95, STOUT_MOST = 0.12, LIMB_FLATS = 0.7 * Math.cos(Math.PI / LIMB_SIDES);
/* A drummer's forearm, fitted so, is no stouter than this across, the right and the left: its wrist's end, a pixel across from the
   back of the crowd on a phone as built, met the forearm only corner to corner through a stroke and came to the screen as a speck
   alone, the right's for up to a third of a second at a time, the left's for 3 ms. Any stouter, the right forearm swings more of
   the panel's blocks (band-outline.ts's flicker), and the left as stout as the right swung one block of the seven of 1974-79's
   seven times in a second. Stout as they are, either reaches within a pixel of the other drummer, or of the bass, at a phone's
   lower rungs: the line-ups' tests name where (`touch`). */
const DRUM_FOREARM = { right: 0.17, left: 0.12 };
/* A drum that reads as one in outline from every side: a shell `r` in radius and `deep`, upright about its own middle, its rims
   rounded and its heads flat to four fifths of the radius; or `rounder`, to three fifths. A plain cylinder is a box from the front
   and from the hill. */
const SHELL = [[0, -0.5], [0.82, -0.5], [1, -0.2], [1, 0.2], [0.82, 0.5], [0, 0.5]], ROUNDER = [[0, -0.5], [0.62, -0.5], [0.9, -0.38], [1, -0.2], [1, 0.2], [0.9, 0.38], [0.62, 0.5], [0, 0.5]];
const shell = (r, deep, colour, rounder = false) => paintBy(new THREE.LatheGeometry((rounder ? ROUNDER : SHELL).map(([a, b]) => new THREE.Vector2(a * r, b * deep)), 12),
  (_, n) => (Math.abs(n.y) > 0.9 ? tone(STUFF.drumhead) : colour));
/* The rad a rack tom's head tips toward its drummer, and how far in front of the drummer the rack toms' middles are. */
const TOM_TIP = 0.3, TOM_Z = 0.66;
/* Where a drummer's hi-hat is, in their frame: under the hands, to the right of the snare. */
const HAT = V(-0.11, 0.8, 0.25);
/* How far a drummer leans forward at rest, in rad; the way each elbow bends, out to its side (1 the drummer's left), down and back;
   and how far inside the upper arm's middle the web that fills the arm's bend reaches its elbow. */
const DRUM_LEAN = 0.07, WEB_IN = 0.01;
const elbowOut = (side) => V(0.85 * side, -0.5, -0.15);

/* The keys' two keyboards, in the player's own metres: the lower keyboard's top and its reach in front of them, the upper's, and the
   lower's width, so the keyboards stand no higher than the hips and the trunk shows over them from the hips up. */
const TWO_MANUALS = { lower: { y: 0.78, z: 0.38 }, upper: { y: 0.9, z: 0.55 }, wide: 0.86 };
/* The keys' slim case under the keyboards: its width, its depth and its middle's reach in front of the player. */
const SLIM = { wide: 0.3, deep: 0.2, z: 0.25 };
/* The organ: its one keyboard's height and its reach in front of the player, its width, its top's height behind the keys, how high
   the cabinet stands on its legs, and their radius. */
const ONE_MANUAL = { y: 0.8, z: 0.37, wide: 0.74, top: 0.96, legs: 0.3, leg: 0.036 };
/* The upright piano, in its seated player's own metres: the keys' height, the front of their ledge and their width; the case's front,
   its depth, height and width; and the bench, its width and how far it stands from the player's middle. */
const UPRIGHT = { keys: { y: 0.72, z: 0.3, wide: 0.9 }, case: { z: 0.56, deep: 0.36, high: 1.2, wide: 1.02 }, bench: { wide: 0.62, z: -0.02 } };
/* Where a pianist's wrist lifts to: straight up off the keys, to the height of the brow, out over the keys in front of the face;
   the fingers up; and the elbow's ways, as LIFT has them. */
const PIANO_LIFT = { left: [0.14, 1.27, 0.3], right: [0.14, 1.27, 0.3], fingers: [0, 1, 0.12], tucked: [0.2, -1, -0.5], forward: [0.45, -0.7, 0.2] };

/* Each role's player, as #184 dealt the six, and the three roles it did not have, dealt as their own people too: build, height,
   clothes and the outline of the hair (trunk), and how each plays. No player pairs an instrument with the build and the hair a fan
   knows a player of it by: the organ's player is slight, in a beanie; the pianist broad, with bunches; the singer of middling build,
   in trousers, with short hair. A role is the same player in every era (lineup.js): two drummers are dealt, the second only to a
   line-up with two. Within a line-up no two wear their hair alike, and no two who stand are of a height or a build
   (band.test.ts). */
const DEAL = {
  lead: { size: 1.035, broad: 0.93, hair: "cap", skirt: 0.58, coat: true, stance: 0.16, boots: 0.32, toes: 0.15, fret: 0.8, sway: 0.03, strum: 0.15, tap: 0.1, lag: 1,
    lean: 0.09, knee: 0.03, solo: 0.07,
    hold: { ...TWO_HORNS, at: V(-0.13, 0.99, 0.18), rise: 0.78, yaw: 0.2, big: 1.1 } },
  bass: { size: 0.93, broad: 1.0, hair: "knot", skirt: 0.8, stance: 0.16, toes: 0.11, fret: 0.96, sway: -0.035, strum: 0.05, tap: 0.13, lag: 0,
    knee: 0.05,
    hold: { ...BASS, at: V(-0.1, 0.9, 0.18), rise: 0.85, yaw: 0.22, big: 1.08 } },
  rhythm: { size: 1.0, broad: 1.06, hair: "bob", skirt: 0.8, stance: 0.19, toes: 0.125, fret: 0.74, sway: 0.045, strum: 0.13, tap: 0.11, lag: 2, knee: 0.04,
    hold: { ...ONE_CUT, at: V(-0.12, 1.02, 0.18), rise: 0.95, yaw: 0.3, big: 1.1 } },
  drums: [
    { size: 0.99, broad: 1.04, hair: "tail", lag: 2, kick: 0.31, toms: { left: [-0.19, 0.19], right: [0.195, 0.205], deep: 0.22 }, tom: V(-0.19, 0.93, 0.58),
      floor: { x: 0.54, r: 0.25 }, crash: { x: 0.735, y: 1.5, z: 0.45, r: 0.23, tip: 0.3 } },
    { size: 1.02, broad: 1.0, hair: "long", lag: 3, kick: 0.3, toms: { left: [-0.17, 0.21], right: [0.21, 0.185], deep: 0.25 }, tom: V(-0.06, 0.93, 0.58),
      floor: { x: 0.33, r: 0.17 }, crash: { x: 0.72, y: 1.42, z: 0.5, r: 0.21, tip: 0.5 } },
  ],
  keys: { size: 1.02, broad: 0.95, hair: "short", stance: 0.09, sway: 0.03, lean: 0.1, lag: 3, mic: true, glide: 0.025 },
  organ: { size: 0.98, broad: 0.9, hair: "beanie", stance: 0.1, sway: 0, lean: 0.1, lag: 0, still: true, mic: true, glide: 0.04 },
  piano: { size: 0.97, broad: 1.08, hair: "bunches", stance: 0, sway: 0, lean: 0.12, lag: 1, still: true, mic: null },
  voice: { size: 0.96, broad: 0.98, hair: "short", skirt: 0, stance: 0.13, toes: 0.12, sway: 0.03, tap: 0.1, lag: 3, knee: 0.05, mic: { foot: [0.42, 0.42], head: [0.03, -0.01, 0.19] } },
};

/* What a player changes in a line-up that stands close (STAGING `close`), the sevens, for whom the light panel is narrow: the lead
   guitar's and the bass's necks rise steeper, as the rhythm guitar's does in every line-up, so that they reach less far across;
   the first kit's floor tom and the second's crash stand nearer their drummers; and every player stands a twentieth smaller
   (`size`), so that seven stand apart where six did. The bass's rises to 1.09, between what fails each way: below it, edge-on
   from a phone's band pose, a pixel of the bass's outline stood alone as it took up playing (for a frame at 1.02, 6 ms at 1.04),
   and the bass met the first drummer at a phone's lower rungs (at 1.07, from the stage pose at the first rung down and from the
   back of the crowd at the last); above it, from the back of the crowd on a phone at dusk, a speck stood alone at the shoot's own
   place of the pixel grid (1.11). */
const CLOSE = { lead: { hold: { rise: 0.95 } }, bass: { hold: { rise: 1.09 } },
  drums: [{ floor: { x: 0.42 } }, { crash: { x: 0.52 } }], size: 0.95 };
/* A player's deal as their line-up stands them: as dealt, with what a close line-up changes, and what their own staging changes. */
function dealt(role, k, close, over) {
  const deal = role === "drums" ? DEAL.drums[k] : DEAL[role], change = close ? (role === "drums" ? CLOSE.drums[k] : CLOSE[role]) ?? {} : {};
  const out = { ...deal };
  for (const [key, value] of Object.entries(change)) out[key] = { ...deal[key], ...value };
  if (close) out.size = deal.size * CLOSE.size;
  return { ...out, ...over };
}

/* The six of 1979 to 1990, and of 1992 to 1995 (lineup.js), whom the band stands as when it is given no line-up. */
export const SIX = ["lead", "rhythm", "bass", "drums", "drums", "keys"];
/* The three wedge monitors at the lip as the six have them: where each stands on the stage, and its turn. */
const WEDGES = [[-4.5, 3.1, 0.2], [-2.3, 3.4, -0.1], [2.2, 3.3, 0.15]];
/* Where each line-up's players stand on the stage, from the crowd's left: each role, where on the floor ([x, z] in the stage's metres,
   +z toward the crowd), the way they face, and anything of their deal the line-up changes; whether it stands `close` (CLOSE); and
   its monitors. Each line-up stands as the six do: the drummers at the back, side by side, the keyboards back at the ends, the
   guitars and the bass in front with the bass between the guitars, and a singer beside the bass at the front. They stand close
   enough that from the front of the crowd every player falls on the light panel, two pixels and more clear of the stage's black,
   and apart enough that from every pose of the shoot each is an outline of their own, at every rung a phone steps down to but
   where a line-up's test says two meet (band-outline.test.ts and the tests beside it, one a line-up). The places were found by a
   search over them against those tests, and a few were then moved by two to four centimetres, which keeps a part from coming apart
   at the shoot's own place of the pixel grid. Two leads stand 3 cm further in since the guitarists' microphones stood beside the
   strumming arm (STRUMMING): December 1971's, whose tapping foot, which the stand had stood beside, came apart from the shin from the
   back of the crowd at a smaller phone's second rung; and 1990-92's, whose stand stood before the end of the keys' keyboard from
   among the crowd (band-outline.ts `standsBefore`). The six stand as #184 stood them, but the second guitar 5 cm further in, its neck
   risen steeper (DEAL), so that the longer neck keeps clear of the second drummer's crash: a guitar a step back, the bass in front,
   the drummers behind, side by side, the second guitar in front and the keys back by the drummers. */
export const STAGING = {
  "lead rhythm bass drums drums keys": { players: [["lead", -5.9, -1.3, 0.25], ["bass", -3.5, 1.5, 0.1], ["drums", -1.25, -2.5, 0.06],
    ["drums", 1.3, -2.5, -0.06], ["rhythm", 3.85, 0.9, -0.12], ["keys", 6.25, -2, -0.38]], monitors: WEDGES },
  "lead rhythm bass drums organ": { players: [["lead", -5.36, -1.0, 0.25], ["bass", -2.96, 1.5, 0.1], ["drums", 0.04, -2.5, 0],
    ["rhythm", 3.24, 0.9, -0.12], ["organ", 5.94, -2, -0.38]], monitors: WEDGES },
  "lead rhythm bass drums drums organ": { players: [["lead", -5.86, -1.3, 0.25], ["bass", -3.46, 1.5, 0.1],
    ["drums", -1.21, -2.5, 0.06], ["drums", 1.34, -2.5, -0.06], ["rhythm", 3.89, 0.9, -0.12], ["organ", 6.29, -2, -0.38]],
    monitors: WEDGES },
  "lead rhythm bass drums drums organ keys": { players: [["organ", -6.33, -2.2, 0.38], ["lead", -4.17, -0.4, 0.25],
    ["bass", -2.31, 1.7, 0.1], ["drums", -0.52, -2.6, 0.06], ["drums", 1.9, -2.6, -0.06], ["rhythm", 4.01, 1, -0.12],
    ["keys", 6.41, -2.2, -0.38]], monitors: WEDGES, close: true },
  "lead rhythm bass drums piano": { players: [["lead", -5.65, -1, 0.25], ["bass", -3.2, 1.5, 0.1], ["drums", -0.25, -2.5, 0],
    ["rhythm", 2.78, 0.9, -0.12], ["piano", 6.43, -2.2, -1.85]], monitors: WEDGES },
  "lead rhythm bass drums organ piano": { players: [["organ", -6.22, -2.2, 0.38], ["lead", -3.92, -0.6, 0.25],
    ["bass", -1.87, 1.6, 0.1], ["drums", 0.46, -2.5, 0], ["rhythm", 3.26, 0.9, -0.12], ["piano", 6.75, -2.2, -1.85]],
    monitors: WEDGES },
  "lead rhythm bass drums organ piano voice": { players: [["organ", -6.21, -2.2, 0.38], ["lead", -4.05, -0.6, 0.25],
    ["bass", -2.11, 1.6, 0.1], ["voice", -0.41, 1.9, 0.05], ["drums", 1.03, -2.5, 0], ["rhythm", 3.63, 0.8, -0.12],
    ["piano", 6.81, -2.2, -1.85]], monitors: WEDGES, close: true },
  "lead rhythm bass drums piano voice": { players: [["lead", -5.64, -1, 0.25], ["bass", -3.32, 1.5, 0.1], ["voice", -1.31, 1.9, 0.05],
    ["drums", 0.38, -2.5, 0], ["rhythm", 3.2, 0.8, -0.12], ["piano", 6.72, -2.2, -1.85]], monitors: WEDGES },
  "lead rhythm bass drums drums piano voice": { players: [["lead", -5.98, -1.3, 0.25], ["bass", -3.76, 1.5, 0.1],
    ["voice", -2.15, 1.9, 0.05], ["drums", -0.91, -2.5, 0.06], ["drums", 1.59, -2.5, -0.06], ["rhythm", 3.7, 0.8, -0.12],
    ["piano", 6.9, -2.4, -1.85]], monitors: WEDGES, close: true },
  "lead rhythm bass drums drums keys piano": { players: [["keys", -6.35, -2.2, 0.38], ["lead", -4.12, -0.4, 0.25],
    ["bass", -2.31, 1.7, 0.1], ["drums", -0.6, -2.6, 0.06], ["drums", 1.71, -2.6, -0.06], ["rhythm", 3.83, 0.8, -0.12],
    ["piano", 7.0, -2.4, -1.85]], monitors: WEDGES, close: true },
};

/* ---------- what they wear ---------- */

/* The clothes of the band's eras, by the show's date, as the line-up and the stage are read (lineup.js eraOn): each row [from, to,
   era], both dates the row's own, in date order. The late sixties wear bright shirts in prints and vests; the early seventies
   denim, checks and earth tones; the late seventies and the eighties t-shirts and open shirts; the nineties dark tees and loose
   shirts. The edges stand at the turn of a year: the early seventies end with 1974, the year the Wall of Sound was retired, before
   the band's break in 1975. A show with no date is dressed as the six of 1979 to 1990 are, in the late seventies' and eighties'. */
export const WARDROBES = [
  ["1965-06-01", "1970-12-31", "the late sixties"],
  ["1971-01-01", "1974-12-31", "the early seventies"],
  ["1975-01-01", "1989-12-31", "the late seventies and the eighties"],
  ["1990-01-01", "1995-07-09", "the nineties"],
];
/* Each era's clothes, a generic palette, as sRGB: what is worn on the chest (`tops`, each a cut and its colours: a "tee", short
   sleeved; a "shirt", long sleeved; an "open" shirt over a tee, its sleeves rolled; a "vest" over a shirt; a "check", a shirt in
   squares of two colours; a "print", a shirt in a scatter of two), the trousers (`lower`), a long skirt (`skirts`), a coat
   (`coats`), the shoes, a cap or a beanie (`hats`), and a drum kit's shells (`shells`): each a deep colour, none near-black, so a
   kit shows its colour under the band's light as a guitar does, and none pale, for a kit's toms stand at the band's outline
   against the panel, where a pale shell does not read against it (band-outline.ts): ivory, silver and maple read 7 px fewer of
   the six of 1970-71's 180 from the back of the crowd on a phone at dusk. Nothing here is anyone's: no list holds a colour or a cut
   that a player of the band is known by, and each seat's is drawn from them by the seat's place on the stage and the era alone
   (dressOf). */
const ERA_CLOTHES = {
  "the late sixties": {
    tops: [["print", 0xb8336a, 0xe0a030], ["vest", 0x5c3a21, 0xd2691e], ["print", 0x2a9d8f, 0x7b3fa0], ["shirt", 0x7b3fa0, 0], ["vest", 0x22222a, 0xd4a017],
      ["print", 0xc0392b, 0xe8c070], ["shirt", 0x3a5fcd, 0], ["vest", 0x6b4f2a, 0x2a9d8f]],
    lower: [0x2b2b33, 0x4a3728, 0x3b3f5c, 0x5a4a3a, 0x3a2a3a, 0x2e3a2e, 0x4a4040],
    skirts: [0x8a2a5a, 0x5a2a6a, 0x9a5a2a, 0x2a5a5a, 0x6a2a2a],
    coats: [0x4b2a5e, 0x5c3a21, 0x2f2f35, 0x6a2a2a],
    shoes: [0x3b2a1e, 0x1a1a1a, 0x5a3a22],
    hats: [0x6b2d3a, 0x3b3b3b, 0x8a6d3b, 0x2a3a5a],
    shells: [0x8a2a2a, 0x2a4a7a, 0x5a2a6a, 0x2a5a4a, 0x7a5a2a],
  },
  "the early seventies": {
    tops: [["shirt", 0x4a6a8e, 0], ["check", 0x8b2e2e, 0x2a2420], ["shirt", 0x8b5a2b, 0], ["open", 0x3e5a7e, 0xc8b890], ["check", 0x2e5e3a, 0x1e2e4e],
      ["shirt", 0x6b6b3a, 0], ["tee", 0xa08050, 0], ["open", 0x7a4a2a, 0xe0d8c0]],
    lower: [0x3a5070, 0x4a6080, 0x5a3e2a, 0x2e4060, 0x6a5a40, 0x3a3a2a, 0x445878],
    skirts: [0x7a4a2a, 0x4a5a3a, 0x8a6a40, 0x3e5a7e, 0x6a3a2a],
    coats: [0x6a4a2a, 0x3e5a7e, 0x5a4a3a, 0x3a3a30],
    shoes: [0x4a3020, 0x3a2a1e, 0x5a4030],
    hats: [0x5a4a3a, 0x3a4a5a, 0x6a3a2a, 0x4a4a30],
    shells: [0x6a4022, 0x7a2a32, 0x4a5a2a, 0x3a4a6a, 0x7a5a3a],
  },
  "the late seventies and the eighties": {
    tops: [["tee", 0xe0dcd0, 0], ["open", 0x5a7a9a, 0x8a8a8a], ["tee", 0xb03030, 0], ["tee", 0x2a3f6a, 0], ["open", 0x9a3a3a, 0xe0dcd0],
      ["tee", 0xd8b040, 0], ["tee", 0x3a7a5a, 0], ["open", 0xc8a878, 0x2a3f6a]],
    lower: [0x3a5070, 0x2e3e5e, 0x9a8a6a, 0x4a5a78, 0x5a5048, 0x2a2a30, 0x6a6a70],
    skirts: [0x5a7a9a, 0x8a3a5a, 0x3a5a4a, 0xc8a878, 0x6a4a7a],
    coats: [0x5a4a3a, 0x3a3a48, 0x6a5a40, 0x2e3e5e],
    shoes: [0xdedad0, 0x3a2a1e, 0x8a8a8a, 0x2a2a2a],
    hats: [0x2a3f6a, 0xb03030, 0x5a5048, 0x3a7a5a],
    shells: [0x8a2222, 0x22408a, 0x6a4a2a, 0x2a5a3a, 0x6a2a4a],
  },
  "the nineties": {
    tops: [["tee", 0x1e1e22, 0], ["shirt", 0x3a6a7a, 0], ["tee", 0x2e2e38, 0], ["shirt", 0x6a4a7a, 0], ["tee", 0x4a1e2a, 0],
      ["open", 0x8a6a3a, 0x1e1e22], ["tee", 0x1e3a2e, 0], ["shirt", 0x5a5a6a, 0]],
    lower: [0x2e3e5e, 0x1e1e22, 0x7a6a50, 0x3a4a6a, 0x4a4a50, 0x2a3050, 0x5a5040],
    skirts: [0x2a2a40, 0x4a2a3a, 0x3a4a3a, 0x5a4a6a, 0x26262e],
    coats: [0x2a2a30, 0x3a3040, 0x4a3a2a, 0x2a3a3a],
    shoes: [0x1e1e1e, 0x4a3a2a, 0xd0ccc0, 0x3a3a3a],
    hats: [0x1e1e22, 0x3a3a48, 0x4a1e2a, 0x2a3a3a],
    shells: [0x2a5a6a, 0x6a2a3a, 0x3a4a7a, 0x2a5a3a, 0x6a4a2a],
  },
};
/* Skin, in a range of tones, and hair, every era's: no grey or white, which would put an age on a player. */
const SKINS = [0xe8bf9a, 0xd4a07a, 0xb98058, 0x9a6440, 0x7a4c30, 0x5c3820];
const HAIRS = [0x1a1410, 0x2e2018, 0x4a3020, 0x6a3e22, 0x8a6a40, 0x3a2a20];
/* The instruments' and the stage's things, in their materials, as sRGB. A guitar's or a bass's finish: its body's face from the
   middle (`burst`) to the edge (`face`), its edge's binding, its neck and its head: a sunburst, amber at the middle and dark brown
   at the edge; cherry; natural wood; and black. (A kit's shells are the era's, ERA_CLOTHES.) */
const FINISHES = [
  { burst: 0xd8902a, face: 0x3a1a0a, edge: 0x1a0e06, neck: 0x8a5a2a, head: 0x161412 },
  { burst: 0x7a1a1a, face: 0x6a1414, edge: 0x2a0a0a, neck: 0x6a4024, head: 0x6a1414 },
  { burst: 0xc89a5a, face: 0xb8884a, edge: 0x5a3a1e, neck: 0xc89a5a, head: 0x8a5a2a },
  { burst: 0x161616, face: 0x161616, edge: 0xd8d0c0, neck: 0x6a4024, head: 0x161616 },
];
const STUFF = {
  drumhead: 0xd2c8b4, white: 0xf0ece4, bronze: 0x8a6a2e, chrome: 0x5c5e64, steel: 0x44464c, black: 0x161618, stick: 0xd0b07a, keys: 0xe8e4d8, keyboard: 0x1c1c20,
  organ: 0x5a361c, piano: 0x2a1a10, bench: 0x2a1a10, tambourine: 0xc8a060, monitor: 0x1c1c1e, grille: 0x2c2c30, case: 0x202024,
};

/* An era's or a seat's number, from its name: FNV-1a, 32 bits. The same name gives the same number on every machine. */
const hashOf = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
/* What seat `seat` (its place on the stage, from the crowd's left) takes from a `list` of the era's: the list is read from a start
   that the era and the thing's name (`what`) give, in a step prime to its length (1 for a list whose length all of STEPS divide), so
   two seats take the same thing only where they stand a whole multiple of the list's length apart: a line-up no longer than the list
   takes as many different things as it has seats, and one longer comes round the list again. The seat alone, never the player's
   role, says which. */
const STEPS = [3, 5, 7, 11];
function pickFor(list, era, seat, what) {
  const step = STEPS.find((k) => list.length % k !== 0) ?? 1;
  return list[(hashOf(`${era} ${what}`) + seat * step) % list.length];
}
/* A colour that is nearly black: under DARK in lightness (HSL's, of the sRGB colour as the palette gives it): charcoal, and the
   darkest wine and green too, which the stage's dark could take for black. No lead guitar shows one on its upper body: a fan knows the
   lead of the band's later years by a black t-shirt. */
export const DARK = 0.22;
export const nearBlack = (colour) => colour.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l < DARK;
/* What a dress shows of a body's upper half, as worn() puts it on: the shoulders and the slope to them, every square of the chest,
   what shows down an open front, the collar and both sleeves, each with the garment it is part of (the coat, or the top); skin aside. */
export function shownOf(dress) {
  const on = worn(dress), out = [];
  const add = (colour) => { if (colour && colour !== on.skin && !out.some((c) => c.colour === colour)) out.push({ colour, of: colour === dress.coat ? "coat" : "top" }); };
  for (const colour of [on.shoulders, on.slope, on.under, on.collar, on.upper, on.fore]) add(colour);
  for (let a = 0; a < 8; a++) for (let b = 0; b < 3; b++) add(on.pattern(-Math.PI + (a * Math.PI) / 4, (b + 0.5) / 3));
  return out;
}

/* What the player in seat `seat` wears in the era of a show on `date`, and the colours of their skin, hair and instrument: each drawn
   from the era's palette by the seat and the era (pickFor). The role picks which garments are worn, not their colours: whether a coat
   is (its deal's `coat`, DEAL), as it picks the garments' shapes; with the one exception that a lead guitar shows nothing nearly
   black on its upper body (shownOf, nearBlack), and takes the next coat, or the next top, where it would. Returns linear colours
   (tone), the era, the cut of the top and the coat (null for none). */
export function dressOf(date, seat, role, coat = Boolean(DEAL[role]?.coat)) {
  const era = date ? eraOn(WARDROBES, date)[2] : "the late seventies and the eighties", clothes = ERA_CLOTHES[era];
  const pick = (list, what) => pickFor(list, era, seat, what), finish = pick(FINISHES, "finish");
  const wear = (top) => ({ cut: top[0], top: tone(top[1]), second: tone(top[2] || top[1]) });
  let top = pick(clothes.tops, "top"), over = coat ? pick(clothes.coats, "coat") : null;
  const dress = {
    era, ...wear(top), lower: tone(pick(clothes.lower, "lower")), skirt: tone(pick(clothes.skirts, "skirt")), coat: over === null ? null : tone(over),
    shoes: tone(pick(clothes.shoes, "shoes")), hat: tone(pick(clothes.hats, "hat")), skin: tone(pick(SKINS, "skin")), hair: tone(pick(HAIRS, "hair")),
    finish: Object.fromEntries(Object.entries(finish).map(([k, hex]) => [k, tone(hex)])), shell: tone(pick(clothes.shells, "shell")),
  };
  const next = (list, item) => list[(list.indexOf(item) + 1) % list.length];
  for (let k = 0; role === "lead" && k < clothes.tops.length + clothes.coats.length; k++) {
    const dark = shownOf(dress).filter(({ colour }) => nearBlack(colour));
    if (!dark.length) break;
    if (dark.some(({ of }) => of === "coat")) dress.coat = tone((over = next(clothes.coats, over)));
    else Object.assign(dress, wear((top = next(clothes.tops, top))));
  }
  return dress;
}
/* How a dress covers a body (trunk and the arms): the skin; the shoulders and the slope from the neck to them; what shows down the
   front (`under`, none for a tee, a plain shirt, a check or a print); the chest's colour at an angle round it (`turn`, rad from the
   front) and a height up it (`up`, 0 at the waist and 1 at the shoulders); the collar; and the upper arm's and the forearm's sleeves.
   A player in a coat (`dress.coat`, which dressOf gives only one whose deal has a coat) wears it closed over the arms
   and open over the shirt; a tee's collar is the neck's skin, and its forearms bare; an open shirt's sleeves are rolled. */
export function worn(dress) {
  const { skin, top, second, cut, coat } = dress;
  const plain = () => top;
  if (coat) return { skin, cut, sleeve: "long", shoulders: coat, slope: coat, under: top, pattern: () => coat, collar: coat, upper: coat, fore: coat };
  /* A check: squares of the two colours, eight round and three up; a print: the second colour in a scatter, a square in three. */
  const square = (turn, up) => [Math.floor(((turn + Math.PI) / (2 * Math.PI)) * 8 + 0.5), Math.min(2, Math.max(0, Math.floor(up * 3)))];
  if (cut === "check") return { skin, cut, sleeve: "long", shoulders: top, slope: top, under: null, pattern: (turn, up) => { const [a, b] = square(turn, up); return (a + b) % 2 ? second : top; }, collar: top, upper: top, fore: top };
  if (cut === "print") return { skin, cut, sleeve: "long", shoulders: top, slope: top, under: null, pattern: (turn, up) => { const [a, b] = square(turn, up); return (a * 5 + b * 3) % 3 === 0 ? second : top; }, collar: top, upper: top, fore: top };
  if (cut === "vest") return { skin, cut, sleeve: "long", shoulders: second, slope: top, under: second, pattern: plain, collar: second, upper: second, fore: second };
  if (cut === "open") return { skin, cut, sleeve: "rolled", shoulders: top, slope: top, under: second, pattern: plain, collar: top, upper: top, fore: skin };
  if (cut === "tee") return { skin, cut, sleeve: "short", shoulders: top, slope: top, under: null, pattern: plain, collar: skin, upper: top, fore: skin };
  return { skin, cut, sleeve: "long", shoulders: top, slope: top, under: null, pattern: plain, collar: top, upper: top, fore: top };
}
/* The colour of a bone (buildBand's `bone`) of a player in `dress`, by its name: an upper arm's sleeve, a forearm's sleeve or skin
   (worn), a hand's skin, a stick's wood, a leg's trousers and a tapping foot's shoe. */
function sleeveOf(dress, name) {
  const on = worn(dress);
  if (/upper arm$/.test(name)) return on.upper;
  if (/forearm$/.test(name)) return on.fore;
  if (/hand$/.test(name)) return on.skin;
  if (/stick$/.test(name)) return tone(STUFF.stick);
  if (/(thigh|shin)$/.test(name)) return dress.lower;
  if (name === "tapping foot") return dress.shoes;
  throw new Error(`band.js: no colour for a bone named ${name}`);
}

/* ---------- the band's light ---------- */

/* The band is lit by a light of its own, never by the world's (LIGHT): steady through the music, so that the players, who fill much
   of the frame from the front of the crowd, never brighten and darken on the beat, as the stage's own light does with the bass
   (stage.js, audio.js `mappings`). The hour alone moves it, through `light` (buildBand), which main.js hands the look's `dark`
   (night.js) each frame: so a seek, which passes through a night in about seven seconds, changes it no faster than the sky.
   Three parts, each a colour times a strength, added:
   - the key, the stage's front lights: from KEY_TO in the stage's frame, from the crowd's right, a little up and toward the crowd,
     KEY strong and KEY_TINT, a warm white; so each body has a lit side and a side in shadow (Lambert's law), and a face turned
     edge-on to the crowd, as an outline's faces are from the front, takes less of it than one turned to the crowd;
   - the fill, the sky's own light, from above and less from below (FILL_BELOW of it from straight under): FILL_DUSK strong where
     the night is not dark at all and FILL_NIGHT in the deep of it, FILL_TINT, a cool blue;
   - the back light, the panel's (RIM_FROM, its middle, stage.js PANEL): a warm edge, RIM_TINT, on the faces that turn toward the
     panel, away from the crowd, as far as they turn to it and the more as they stand edge-on to the eye (to the power RIM_EDGE).
     So a player seen from above or from the side has a warm edge on their panel side, and from the crowd's own line next to none:
     there the panel is behind them, and a light edge would close on its light.
   The beams never light the band (main.js draws them after it), nor does the stage's light or anything of the music. */
export const KEY_TO = [0.6, 0.45, 0.66], KEY = 0.55, KEY_TINT = [1, 0.87, 0.7];
export const FILL_DUSK = 0.2, FILL_NIGHT = 0.1, FILL_TINT = [0.62, 0.68, 0.9];
export const RIM_FROM = [0, 3.7, -4.08], RIM = 0.5, RIM_TINT = [1, 0.72, 0.42], RIM_EDGE = 3;
/* The share of the fill that comes from below, as against from above. */
export const FILL_BELOW = 0.35;
const num = (v) => v.toFixed(4);
/* The light, in place of three's own lights in a Lambert material: the view's normal (`normal`), the way to the eye (vViewPosition),
   and the three parts above. Written in plain numbers, so the unit tests run it from its own text (band-light.ts). */
export const LIGHT = `
vec3 toEye = normalize(vViewPosition), keyTo = normalize((viewMatrix * vec4(uKeyTo, 0.0)).xyz), upward = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 toPanel = normalize((viewMatrix * vec4(uPanel, 1.0)).xyz + vViewPosition);
float facing = dot(normal, toEye), keyward = dot(normal, keyTo), skyward = dot(normal, upward), panelward = dot(normal, toPanel);
float sky = ${num(FILL_BELOW)} + ${num(1 - FILL_BELOW)} * 0.5 * (1.0 + skyward);
float key = max(keyward, 0.0);
float edge = pow(1.0 - clamp(facing, 0.0, 1.0), ${num(RIM_EDGE)}) * clamp(panelward, 0.0, 1.0);
reflectedLight.directDiffuse = diffuseColor.rgb * (uFill * sky + uKey * key + uRim * edge);
`;
/* The band's one material and its light's uniforms, in the world's frame: the key's way, from the stage's frame of `stage`, and the
   panel's middle. `light(dark)` sets the three strengths for how dark the night is, 0 to 1 (night.js `dark`), and nothing else. */
function bandLight(stage) {
  stage.updateWorldMatrix(true, false);
  const turn = new THREE.Quaternion();
  stage.getWorldQuaternion(turn);
  const uniforms = {
    uKey: { value: new THREE.Color(...KEY_TINT).multiplyScalar(KEY) }, uFill: { value: new THREE.Color() }, uRim: { value: new THREE.Color(...RIM_TINT).multiplyScalar(RIM) },
    uKeyTo: { value: V(...KEY_TO).normalize().applyQuaternion(turn) }, uPanel: { value: stage.localToWorld(V(...RIM_FROM)) },
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uKey, uFill, uRim, uKeyTo, uPanel;")
      .replace("#include <lights_fragment_begin>", LIGHT)
      .replace("#include <lights_fragment_maps>", "")
      .replace("#include <lights_fragment_end>", "");
  };
  const fill = new THREE.Color(...FILL_TINT);
  function light(dark) {
    const d = Math.max(0, Math.min(1, dark));
    uniforms.uFill.value.copy(fill).multiplyScalar(FILL_DUSK + (FILL_NIGHT - FILL_DUSK) * d);
  }
  light(1);
  return { material, uniforms, light };
}

/* ---------- the band ---------- */

/* Builds the band in the stage's group, whose floor is `floor` m up in the stage's own frame (+z toward the crowd), as the line-up
   `roles` (lineup.js) stands on the stage (STAGING): the six of 1979 to 1990, unless it is given another. Returns the `players`,
   from the crowd's left (each `plays` its instrument in its `role`, and has its frame `g`, its `body` and its `mouth`, where the body
   has it at rest in the player's frame), the `limbs`' mesh and each
   of its `bones`, the `still` mesh with the corners each of its parts holds (`still.userData.parts`: `of` what, `as` what in it, `by`
   whom), the `joints` each bone is held at, the `material` and its `uniforms`, `move`, which plays them, `fit`, which fits their
   thin parts to the canvas, and `light`, which lights them for the hour (LIGHT). They are dressed for the era of a show on `date`
   (YYYY-MM-DD; WARDROBES), or with none as the six of 1979 to 1990 are. */
export function buildBand(stage, floor, roles = SIX, date = /** @type {string | null} */ (null)) {
  const staging = STAGING[roles.join(" ")];
  if (!staging) throw new Error(`band.js: no staging for the line-up ${roles.join(", ")}`);
  const { material, uniforms, light } = bandLight(stage);
  const players = [], bones = [], arms = [], legs = [], hinges = [], joints = [], fixed = [], stands = [], fitted = [], necks = [], hangs = [];

  /* A player's frame: where they stand on the floor, the way they face, and their size; and what they wear (dressOf). */
  function player(role, plays, [x, z], facing, size, dress) {
    const g = new THREE.Group();
    g.position.set(x, floor, z);
    g.rotation.y = facing;
    g.scale.setScalar(SCALE * size);
    g.updateMatrix();
    stage.add(g);
    const p = { role, plays, g, body: null, still: false, pivot: null, lean: 0, lag: 0, look: null, dress, at: players.length, pose: null, holds: null, drawn: [], mouth: null };
    players.push(p);
    return p;
  }
  /* The player's body: parts drawn upright in the player's frame, as one mesh that turns about `pivot`, leaning `lean` rad forward
     at rest; and the `tip` of an instrument's neck, held by `hold` (axe), last, so that `fit` can widen its corners. A `still` body
     is among the still parts, leaned as it rests, with no mesh of its own: a frame stands at its pivot for its limbs to hang from.
     So a line-up of seven is drawn in as many draws as one of six (STAGING). */
  function embody(p, parts, pivot, lean = 0, { still = false, tip = [], hold = null, neck = 0 } = {}) {
    p.pivot = pivot.clone();
    p.lean = lean;
    p.still = still;
    if (still) {
      keep(p, "body", parts.map((part) => part.translate(-pivot.x, -pivot.y, -pivot.z).rotateX(lean).translate(pivot.x, pivot.y, pivot.z)));
      p.body = new THREE.Object3D();
    } else {
      const all = [...parts, ...tip].map(bare), geo = mergeGeometries(all).translate(-pivot.x, -pivot.y, -pivot.z);
      p.body = new THREE.Mesh(geo, material);
      /* Each part of the body with a name, a closed hand's palm (`fist`), the singer's tambourine, the torso, a skirt or the head
         (`trunk`), or an instrument (`axe`), its neck's tip with it, as the run of the body's corners it is, in the order the parts
         list them: so the tests measure a hand where it is drawn (band-bodies.test.ts) and what a microphone stands before
         (band-outline.ts), and a skirt hangs (`hang`). */
      for (let k = 0, from = 0; k < all.length; from += all[k].attributes.position.count, k++) if (all[k].name) p.drawn.push({ name: all[k].name, from, count: all[k].attributes.position.count });
      if (tip.length) {
        const from = all.slice(0, parts.length).reduce((n, g) => n + g.attributes.position.count, 0), corner = geo.getAttribute("position");
        const count = corner.count - from, base = corner.array.slice(from * 3), across = new Float32Array(count), back = hold.clone().invert(), at = V();
        for (let i = 0; i < count; i++) across[i] = at.set(base[i * 3] + pivot.x, base[i * 3 + 1] + pivot.y, base[i * 3 + 2] + pivot.z).applyMatrix4(back).y;
        necks.push({ p, geo, from, count, base, across, way: V().setFromMatrixColumn(hold, 1), wide: neck * V().setFromMatrixColumn(hold, 1).length() });
      }
    }
    p.body.position.copy(pivot);
    p.body.rotation.x = lean;
    p.g.add(p.body);
  }
  /* A point of the body, drawn upright in the player's frame: in the body's own frame, and where it lies once the body leans. */
  const ofBody = (p, v) => v.clone().sub(p.pivot);
  const leaned = (p, v) => ofBody(p, v).applyAxisAngle(X, p.lean).add(p.pivot);
  /* Parts that stand still, drawn in a player's frame (or, without one, in the stage's), under a name: `of` what they are a part,
     and `as` what in it, where a test tells a kit's drums and cymbals apart. */
  const keep = (p, of, parts, as = of) => { for (const part of parts) fixed.push({ of, as, by: p ? p.at : null, geo: p ? bare(part).applyMatrix4(p.g.matrix) : bare(part) }); };

  /* A bone: a limb that moves, of player `p`, `wide` and `thick` across at its thick end. A frame sets its ends, in the player's
     frame. One with a `span` lies along another's stretch, from one share of it to another. Its colour is what its name says it is
     of the player's dress (sleeveOf). */
  function bone(p, name, wide, thick = wide, pads = [0, 0], ref = X, span = null) {
    const b = { of: p.at, name, wide, thick, pads, ref, span, a: V(), b: V(), at: bones.length, colour: sleeveOf(p.dress, name) };
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
     halfway between them and `bend` forward at rest, and further forward as the hip comes down toward the ankle, KNEE_GIVE times as
     far; so the leg bends at the knee as the weight comes onto it, follows the hips as they sway, and the foot never slides. (A knee that kept the thigh's and the shin's lengths
     exactly moved several times as fast as the hip near a leg's full stretch, and shivered as a standing body breathed: band.test.ts,
     "moves every part smoothly".) A leg under a skirt or a coat (`hidden`, `stand`) is never seen, and is HIDDEN_LEG across. */
  const KNEE_GIVE = 2;
  function leg(p, name, hip, ankle, bend = 0.06, hidden = false) {
    const [upper, lower] = hidden ? [HIDDEN_LEG.thigh, HIDDEN_LEG.shin] : [0.2, 0.148];
    const thigh = bone(p, `${name} thigh`, upper, upper, [0.01, 0.03]), shin = bone(p, `${name} shin`, lower, lower, [0.03, 0]);
    legs.push({ p, thigh, shin, hip: ofBody(p, hip), ankle: ankle.clone(), bend, reach: hip.distanceTo(ankle) });
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
     which reaches up into a coat: below a coat's hem a shin is too thin to join a cuff to it, from the back of the crowd on a phone.
     Under a skirt or a coat, whose hem comes down past the cuffs' tops, a leg is never seen: it runs from the hip to the top of its
     cuff or boot (`hidden`), slimmer than a leg in trousers, and the skirt hangs over it (`hangFrom`). */
  function stand(p, t, stance, toes, back, taps, boots = null, knee = undefined) {
    let tap = null;
    const hidden = p.look.skirt > 0, tall = boots ?? CUFF.tall;
    for (const s of [1, -1]) {
      const ankle = V(s * stance, 0.1, back), heel = V(s * stance, 0.04, back - 0.075), toe = V(heel.x + s * FOOT * Math.sin(toes), 0.04, heel.z + FOOT * Math.cos(toes));
      leg(p, s > 0 ? "left" : "right", t.hip(s), hidden ? V(ankle.x, CUFF.foot + tall, ankle.z) : ankle, knee, hidden);
      keep(p, `${p.plays} cuff`, [boots ? cuff(p.dress.shoes, ankle, 0.086, boots, BOOT_TOP) : cuff(p.dress.lower, ankle)]);
      if (taps && s > 0) {
        tap = hinge(p, false, heel, BACK, [toe.clone().sub(heel)], [bone(p, "tapping foot", 0.105, 0.085)]);
        fitted.push({ bone: tap.held[0], wide: 0.105, thick: 0.085 });
      }
      else keep(p, `${p.plays} shoe`, [shoe(p.dress.shoes, heel, toe)]);
    }
    if (hidden) hangFrom(p, t.hip(1).y, CUFF.foot + tall);
    return tap;
  }
  /* A skirt, or a coat's skirts, hangs from the hips over the legs under it, which run from the hips to the cuffs' or the boots' tops
     (`stand`): each height of it goes with the hips as far as those legs do there, all the way from the hips up, not at all at the
     cuffs' tops and below, and in proportion between; and it hangs straight down, as from a body upright at rest, never turning as
     the body sways and leans. So the legs stay under it through every move, a lead guitar's solo included (band-bodies.test.ts). A
     skirt that turned with the body, as all of the body did, swung its hem out over the planted feet as far again as the hips went,
     and more: a bass's 2.15 times as far. In the solo a lead guitar's coat left a boot's top 16 cm out past its side; and one that
     hung leaned, as its body leans at rest, stood back off its boots, which came out of its side. `hang` lays its corners each frame,
     and its normals. */
  function hangFrom(p, hips, foot) {
    const run = p.drawn.find(({ name }) => name === "skirt");
    if (!run || !p.body.geometry) return;
    const geo = p.body.geometry, at = geo.getAttribute("position"), normal = geo.getAttribute("normal"), weight = new Float32Array(run.count);
    for (let i = 0; i < run.count; i++) weight[i] = Math.max(0, Math.min(1, (at.getY(run.from + i) + p.pivot.y - foot) / (hips - foot)));
    const rest = new THREE.Matrix4().makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z);
    hangs.push({ p, geo, from: run.from, count: run.count, weight, rest, hips: V(0, hips, 0).sub(p.pivot), still: V(0, hips, 0).sub(p.pivot).applyMatrix4(rest),
      base: at.array.slice(run.from * 3, (run.from + run.count) * 3), normals: normal.array.slice(run.from * 3, (run.from + run.count) * 3) });
    geo.userData.slack = HANG_SLACK;
    bound(geo);
  }
  /* The legs, the cuffs and the shoes of one who sits, all still: each thigh from its hip to a knee `knee` in front, and each shin down
     to an ankle `ankle` in front, its foot on the floor. */
  function sit(p, t, knee, ankle) {
    for (const s of [1, -1]) {
      const k = V(s * 0.2, 0.6, knee), a = V(s * 0.17, 0.12, ankle);
      keep(p, `${p.plays} leg`, [limb(p.dress.lower, t.hip(s), k, 0.19, 0.19, [0.02, 0.04]), limb(p.dress.lower, k, a, 0.14, 0.14, [0.04, 0])]);
      keep(p, `${p.plays} cuff`, [cuff(p.dress.lower, a, 0.08, 0.13)]);
      keep(p, `${p.plays} shoe`, [shoe(p.dress.shoes, V(a.x, 0.04, a.z - 0.07), V(a.x + s * 0.02, 0.04, a.z + 0.2))]);
    }
  }
  /* The head of one who sings, which stands still at its microphone, leaned as the body is at rest, while the trunk sways under
     it: a head that moved with its trunk about the mouth crept a hair's breadth a frame, and a crown that creeps over a pixel's
     middle flips it several times as it passes (a cap's top counted 8 swings in a second on a phone). The collar hides the join. */
  const keepHead = (p, t) => keep(p, "head", t.head.map((part) => (p.lean ? part.translate(-p.pivot.x, -p.pivot.y, -p.pivot.z).rotateX(p.lean).translate(p.pivot.x, p.pivot.y, p.pivot.z) : part)));
  /* A player's microphone on its stand (MIC), all in the player's own frame, whichever way they turn: the microphone before the
     mouth where the body has it at rest, leaned with the body for one who leans; the stand `at` beside them (MIC, STRUMMING) on
     `side`, 1 their left and -1 their right. */
  function voice(p, t, side, at = MIC) {
    const lean = (v) => (p.lean ? leaned(p, v) : v), down = V(0, -MIC.tip, 1).normalize();
    const mouth = V(0, t.mouth.y - 0.005, MIC.off), tip = lean(mouth), back = lean(mouth.clone().addScaledVector(down, MIC.long));
    const foot = V(side * at.beside, 0, at.back), top = V(foot.x, at.high, foot.z), end = back.clone().addScaledVector(V().subVectors(tip, back).normalize(), 0.025);
    stands.push({ at: fixed.length, by: p, r: STAND, sides: 6 }, { at: fixed.length + 2, by: p, r: BOOM, most: BOOM_MOST, sides: 5, axis: V().subVectors(end, top).transformDirection(p.g.matrix), across: true });
    keep(p, "microphone", microphone(tip, back, top, foot));
  }

  /* The players' moves, each a share of `level` (0 standing, 1 playing), on the band's count less the player's own lag, a whole
     number of counts, so that no two who stand side by side sway or rock together and all keep the count. `slow` runs from 1 on a count to -1 two counts on and back:
     what follows it comes and goes once in SLOW counts. */

  /* A guitar or a bass: standing, legs apart, the instrument across the body with its neck risen to the player's left, the left hand
     on the neck and the right over the strings. The hips sway to one side and, two counts on, to the other, the instrument with
     them, under a head that stays at its microphone. Both upper arms lie against the trunk. The left elbow is tucked under the
     neck, and the bend of that arm is filled, from the shoulder to the hand and down to where the neck leaves the body, so no
     pocket stands open between the arm and the neck. The right forearm lies over the instrument from its elbow: it turns there,
     `strum` rad either way, the hand crossing the strings one way on a count and back on the next, over the instrument from the
     front. The left foot taps, down on the count. */
  function strummer(role, spot, facing, { size, broad, hair, skirt, stance, toes, hold, fret, sway, strum, tap, lag, boots, lean = 0, knee, solo = 0, dress }) {
    const p = player(role, role === "bass" ? "bass" : "guitar", spot, facing, size, dress);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: skirt ?? 0 };
    const t = trunk(STANDING, broad, hair, skirt, dress), a = axe(hold, fret, dress.finish), { upper, fore, skin, shoulders } = worn(dress);
    const left = t.shoulder(1), right = t.shoulder(-1);
    /* The fretting hand, closed round the neck at `fret`: the palm under it, the fingers' mass up over the fingerboard from below and
       the thumb behind the neck; the elbow tucked under. */
    const fretting = a.on(fret, -0.04, -0.008), grip = fist(skin, fretting, a.on(fret, 1, 0.25).sub(a.on(fret, 0, 0)), a.on(1, 0, 0).sub(a.on(0, 0, 0)), true);
    const hand = grip.wrist, elbow = elbowOf(V(), left, hand, 0.29, 0.27, V(-0.2, -1, -0.5));
    /* The strumming arm: its wrist over the strings behind the hand's reach, its fingers at them. */
    const wrist = a.on(hold.strum - 0.05, 0.075, 0.06), fingers = a.on(hold.strum + 0.005, 0.01, 0.05);
    const tucked = elbowOf(V(), right, wrist, 0.29, 0.26, V(0.2, -1, -0.6));
    embody(p, [...t.parts, ...a.parts, ...armParts(dress, left, elbow, hand, 0.112), ...grip.parts, ...armParts(dress, right, tucked, null, 0.116),
      web(fore, elbow, hand, a.on(hold.joint, 0, 0)), web(shoulders, left, elbow, a.on(hold.joint, 0, 0)), web(upper, left, elbow, hand), web(upper, right, tucked, wrist)], t.pivot,
      lean, { tip: a.tip, hold: a.hold, neck: hold.neck });
    p.mouth = leaned(p, t.mouth);
    const face = a.on(0, 0, 1).sub(a.on(0, 0)).normalize();
    const strumming = hinge(p, true, ofBody(p, tucked), face, [wrist.clone().sub(tucked), fingers.clone().sub(wrist)],
      [bone(p, "strumming forearm", 0.1, 0.1, [0.03, 0.01]), bone(p, "strumming hand", 0.08, 0.05, [0.02, 0.012], face)]);
    /* What the hands hold, for the tests (band-bodies.test.ts), in the body's own frame: the neck's line from its joint to its nut, and
       the strings over the body where the strumming hand crosses them, with the way the face looks. */
    p.holds = { neck: [ofBody(p, a.on(hold.joint, 0, 0)), ofBody(p, a.on(hold.nut, 0, 0))], strings: ofBody(p, a.on(hold.strum, 0, 0.0225)), face: face.clone() };
    const foot = stand(p, t, stance, toes, 0, true, boots, knee);
    keepHead(p, t);
    voice(p, t, -1, { ...STRUMMING, beside: STRUMMING.out - right.x });
    const { body, pivot } = p;
    p.pose = (count, level, time) => {
      const slow = swing(count - lag, SLOW), across = swing(count - lag, STRUM), beat = swing(count - lag, 1), rising = (level * solo * (1 - swing(count - lag, SOLO))) / 2;
      const shift = level * sway * slow + (1 - level) * SHIFT * Math.sin(time * (0.7 + 0.13 * p.at));
      body.position.set(pivot.x + shift + rising / LEAN, pivot.y + breathe(level, time, BREATH), pivot.z);
      body.rotation.set(p.lean + level * 0.02 * slow, 0, LEAN * shift + rising);
      strumming.turn = -level * strum * across;
      foot.turn = (level * tap * (1 - beat)) / 2;
    };
    return p;
  }

  /* A keyboard's player: the keys, two thin keyboards as high as the hips on a slim case, the player standing behind them, turned a
     little from the crowd, a hand on each; the organ, one keyboard on a cabinet as wide as it, under a top behind the keys, the
     cabinet on four legs with light under it, so that from the crowd it is a cabinet on legs where the keys are two boards on a
     stem; or the piano, an upright, side-on to the crowd, its player seated on a bench at it (`seated`), a ledge of keys before a
     tall case. The hands play in front of the trunk, so from the crowd an arm on the keys lies over the trunk and the keyboards;
     at the piano, in front of the player's face, seen side-on.

     The hands take turns: every four counts one lifts from its keys (LIFT, or at the piano straight up off them, PIANO_LIFT) as the
     other comes down to its keys, over LIFT_MOVE, and each goes `glide` along the keys as it does (`glided`), so the hands play up
     and down the keyboard as they take turns. The keys player's hips sway `sway` away from the lifted hand, under a head that
     stays at its microphone, as a guitarist's do, and the shoulders dip toward the keys with the left. The organ's player and the
     pianist hold their bodies `still`, among the still parts, and only their arms move: so a line-up of seven, with an organ and a
     second keyboard, or with the piano beside the keys, is drawn in eight draws (STAGING). */
  function keyboardist(role, spot, facing, { size, broad, hair, stance, sway, lag, mic, lean, still = false, glide = 0, dress }) {
    const seated = role === "piano", p = player(role, role, spot, facing, size, dress);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: 0 };
    const posture = seated ? SEATED : STANDING, t = trunk(posture, broad, hair, 0, dress);
    /* A keyboard's top is its keys, white; the rest is its case's. */
    const keyed = (geo, c) => paintBy(geo, (_, n) => (n.y > 0.7 ? tone(STUFF.keys) : c));
    embody(p, t.parts, t.pivot, lean, { still });
    p.mouth = leaned(p, t.mouth);
    let tips;
    if (role === "keys") {
      const { lower, upper, wide } = TWO_MANUALS;
      const rig = [keyed(box(wide, 0.09, 0.31, 0, lower.y, lower.z), tone(STUFF.keyboard)), keyed(new THREE.BoxGeometry(wide - 0.16, 0.08, 0.27).rotateX(0.22).translate(0.02, upper.y, upper.z), tone(STUFF.keyboard)),
        paint(box(wide - 0.16, upper.y - lower.y, 0.24, 0.02, (upper.y + lower.y) / 2, upper.z + 0.01), tone(STUFF.keyboard))];
      /* The case: slim, from the floor up into the back of the lower keyboard, which reaches well past it either side, so from the
         crowd the keys are two thin boards on a stem, where the organ is a cabinet on legs. The case stands just in front of the
         player's shins and is as wide as their legs, so the gap between the shins is behind it from the crowd and from the front.
         An X stand in front of the legs shut light in between its bars and the legs, and a leg or a column a pixel or so wide
         from the back of the crowd broke into specks. */
      rig.push(paint(box(SLIM.wide, lower.y - 0.02, SLIM.deep, 0.01, (lower.y - 0.02) / 2, SLIM.z), tone(STUFF.case)));
      keep(p, "keyboard", rig);
      tips = [V(0.14, lower.y + 0.075, lower.z - 0.03), V(-0.12, upper.y + 0.085, upper.z - 0.05)];
    } else if (role === "organ") {
      const { y, z, wide, top, legs: under, leg } = ONE_MANUAL;
      /* The keys, the cabinet from over its legs up into them, and the top behind them, as wide as the keys, with no light between;
         and a leg at each corner, from the floor up into the cabinet, so that from the crowd the organ is a cabinet on legs with
         light under it, where the keys are two thin boards on an X. Each leg is fitted to the canvas (`fit`). */
      const wood = tone(STUFF.organ);
      const organ = [keyed(box(wide, 0.08, 0.26, 0, y, z), wood), paint(box(wide, y - 0.02 - under, 0.42, 0, (y - 0.02 + under) / 2, z + 0.15), wood), paint(box(wide + 0.02, top - y, 0.28, 0, (top + y) / 2, z + 0.2), wood)];
      keep(p, "keyboard", organ);
      for (const [s, back] of [[1, 0.01], [-1, 0.01], [1, 0.29], [-1, 0.29]]) {
        stands.push({ at: fixed.length, by: p, r: leg, sides: 8 });
        keep(p, "keyboard", [paint(bar(V(s * (wide / 2 - 0.08), 0, z + back), V(s * (wide / 2 - 0.08), under + 0.05, z + back), leg, leg, 8), wood)], "leg");
      }
      tips = [V(0.15, y + 0.07, z - 0.03), V(-0.15, y + 0.07, z - 0.03)];
    } else {
      const { keys: k, case: c, bench } = UPRIGHT;
      /* The upright: its case from the floor, its keys a ledge before it, a cheek at either end of them, and its lid; and the bench, a
         block to the floor, so that side-on no light shows under the seat. */
      const wood = tone(STUFF.piano);
      keep(p, "keyboard", [paint(box(c.wide, c.high, c.deep, 0, c.high / 2, c.z + c.deep / 2), wood), keyed(box(k.wide, 0.08, c.z - k.z + 0.02, 0, k.y, (k.z + c.z) / 2), wood),
        ...[1, -1].map((s) => paint(box(0.07, 0.2, c.z - k.z + 0.04, s * (k.wide / 2 + 0.035), k.y - 0.04, (k.z + c.z) / 2 - 0.01), wood)), paint(box(c.wide + 0.02, 0.04, c.deep + 0.04, 0, c.high + 0.02, c.z + c.deep / 2), wood)]);
      keep(p, "bench", [box(bench.wide, 0.07, 0.36, 0, posture.hips - 0.06, bench.z), box(bench.wide - 0.12, posture.hips - 0.1, 0.26, 0, (posture.hips - 0.1) / 2, bench.z)].map((part) => paint(part, tone(STUFF.bench))));
      tips = [V(0.15, k.y + 0.07, k.z + 0.08), V(-0.15, k.y + 0.07, k.z + 0.08)];
    }
    /* The hands: on the keys, each a wrist behind its fingertips; the keys player's left on the lower keyboard and the right on the
       upper. `lead` is the hand's turn in the lift's counts: 1 is down on the count and up four counts on, and -1 the other way about.
       A hand lifts to its top: the upper arm turns at an even pace from where it hangs to where it is at the top, about the shoulder,
       and the forearm and the fingers each turn so from the way they point on the keys to the way they point there. An arm that only
       reached for a wrist moving at an even pace bent fastest as it left the keys, where it is nearly straight, and its elbow went
       back and forth. */
    /* A standing player turned toward the crowd's right lifts as one turned toward its left would, side for side. A pianist, side-on,
       lifts only the hand nearer the crowd (`lifts`): with both lifting, one behind the other, band-outline.test.ts's film counted 7
       swings in a second at a block of a phone's screen, over its bar of 5. */
    const lift = seated ? PIANO_LIFT : facing > 0 ? { ...LIFT, left: LIFT.right, right: LIFT.left } : LIFT;
    const shoulderAt = (side) => leaned(p, t.shoulder(side));
    const turning = (from, to) => ({ from: from.clone().normalize(), axis: V().crossVectors(from, to).normalize(), angle: from.angleTo(to) });
    const hands = [{ side: 1, name: "left", tip: tips[0], lead: 1 }, { side: -1, name: "right", tip: tips[1], lead: -1 }].map(({ side, name, tip, lead }) => {
      const wrist = tip.clone().add(V(side * 0.012, 0.035, -0.08)), fingers = tip.clone().sub(wrist), mirror = ([x, y, z]) => V(side * x, y, z);
      const top = mirror(lift[name]), tucked = mirror(lift.tucked), shoulder = shoulderAt(side);
      const low = elbowOf(V(), shoulder, wrist, ARM.upper, ARM.fore, tucked), high = elbowOf(V(), shoulder, top, ARM.upper, ARM.fore, mirror(lift.forward));
      return { shoulder, lead, lifts: !seated || side * facing < 0, fingers: fingers.length(), upper: turning(low.clone().sub(shoulder), high.clone().sub(shoulder)),
        fore: turning(wrist.clone().sub(low), top.clone().sub(high)), hand: turning(fingers, mirror(lift.fingers)),
        arm: arm(p, name, t.shoulder(side), ARM.upper, ARM.fore, tucked.clone(), [bone(p, `${name} hand`, 0.085, 0.045, [0.02, 0.012])]) };
    });
    const forearm = V();
    /* A lifted forearm and hand stand clear of the outline against the panel: each is fitted to the canvas (buildBand's `fit`), both
       ways. A hand fitted only across, as thin as built the other way, came apart from its forearm through a lift, from the back of
       the crowd on a phone and at its lower rungs, and at the piano, side-on, from the crowd on a desktop. */
    for (const { arm: a } of hands) fitted.push(...[a.bones[1], a.held[0]].map((b) => ({ bone: b, wide: b.wide, thick: b.thick })));
    if (seated) sit(p, t, 0.34, 0.42);
    else stand(p, t, stance, 0.09, -0.02, false);
    keepHead(p, t);
    if (mic) voice(p, t, spot[0] > 0 ? -1 : 1);
    const { body, pivot } = p;
    p.pose = (count, level, time) => {
      const slow = swing(count - lag, 2 * SLOW, LIFT_MOVE), shift = level * sway * slow;
      if (!still) {
        body.position.set(pivot.x + shift, pivot.y + breathe(level, time, BREATH), pivot.z);
        body.rotation.set(lean + level * 0.015 * slow, 0, LEAN * shift);
      }
      for (let k = 0; k < hands.length; k++) {
        const { shoulder, lead, fingers, upper, fore, hand, arm: a, lifts } = hands[k], rise = lifts ? (level * (1 - lead * slow)) / 2 : 0;
        a.pole.copy(upper.from).applyAxisAngle(upper.axis, upper.angle * rise);
        forearm.copy(fore.from).applyAxisAngle(fore.axis, fore.angle * rise);
        a.to.copy(shoulder).addScaledVector(a.pole, ARM.upper).addScaledVector(forearm, ARM.fore);
        a.to.x += glided(glide, level, slow, lead);
        a.carry.copy(hand.from).applyAxisAngle(hand.axis, hand.angle * rise).multiplyScalar(fingers);
      }
    };
    return p;
  }

  /* One who sings and plays no instrument but a tambourine: standing at a microphone that they hold. Its stand leans in to the mouth
     in a straight line from the floor in front of them and out to their left (`mic.foot`), so from the crowd it rises clear of the
     legs to the face; its head stands before the mouth (`mic.head`), as far off the face as a microphone's tip (MIC), and the left
     hand holds the stand 11 cm under the head, so the hand is round the stand and off the head, the forearm across from an elbow
     out to the side and as high as the chin. The right hand holds a tambourine before the right thigh, a disc that
     faces the crowd and stands out past the thigh. The arms are the body's, the bend of each filled, so no pocket opens between an
     arm and the trunk. The hips sway once in four counts, as a guitarist's do, under a head that stays at the microphone, and the
     hand at the microphone with it, two or three centimetres a sway; the tambourine rides the sway; one foot taps the count. The
     stand and the microphone's head are fitted to the canvas (`fit`): the stand widened across at each height, so its foot stays
     on the floor, and the head every way. */
  /* The singer's arms are a little stouter than a guitarist's, SINGER_ARM across at the shoulder: as thin, a hand came apart from its
     forearm on a phone from the back of the crowd at dusk (band-outline-1972-06.test.ts, "comes apart little"). */
  const SINGER_ARM = 0.128;
  function singer(role, spot, facing, { size, broad, hair, skirt, stance, toes, sway, tap, lag, mic, knee, dress }) {
    const p = player(role, "voice", spot, facing, size, dress);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: skirt ?? 0 };
    const t = trunk(STANDING, broad, hair, skirt, dress), h = STANDING.hips, { upper, fore, skin, shoulders } = worn(dress);
    /* The microphone: its head, the stand's foot, and the way the stand leans in to the head; and the side it stands on (1 the
       singer's left). */
    const head = V(mic.head[0], t.mouth.y + mic.head[1], mic.head[2]), foot = V(mic.foot[0], 0, mic.foot[1]), lean = head.clone().sub(foot).normalize();
    const side = Math.sign(foot.x), grip = head.clone().addScaledVector(lean, -0.11);
    /* The arm at the microphone: the elbow out to the side and as high as the chin, the hand round the stand under the head, and the
       bend between the arm and the neck filled. Bent down, the elbow fell in front of the chest, inside the outline. */
    const shoulder = t.shoulder(side), elbow = elbowOf(V(), shoulder, grip, 0.29, 0.26, V(side, -0.2, 0));
    /* The other arm, down to the thigh: the hand at the tambourine's rim, the elbow back. The disc lies over the thigh's top and the
       hip, so it holds the leg to the trunk from the back of the crowd at a phone's lower rungs, where the leg came apart from it.
       Out at the hip, it met the drummer behind from the front of the crowd. */
    const other = t.shoulder(-side), ring = V(-side * 0.17, h - 0.07, 0.14), hold = V(-side * 0.13, h, 0.15);
    const bend = elbowOf(V(), other, hold, 0.29, 0.26, V(-side * 0.4, -0.6, -0.7));
    /* The tambourine: its rim's wood and its head's white, which faces the crowd. */
    const tambourine = paintBy(drum(ring, 0.11, 0.11, 0.035, 12, Math.PI / 2), (_, n) => (Math.abs(n.z) > 0.9 ? tone(STUFF.drumhead) : tone(STUFF.tambourine)));
    tambourine.name = "tambourine";
    /* Each hand closed: the one round the stand, the stand through its grip, and the other on the tambourine's rim. */
    const onStand = fist(skin, grip, grip.clone().sub(elbow), lean, side < 0), onRim = fist(skin, hold, hold.clone().sub(bend), X, side > 0);
    embody(p, [...t.parts, ...armParts(dress, shoulder, elbow, onStand.wrist, SINGER_ARM), ...onStand.parts, web(upper, shoulder, elbow, onStand.wrist),
      ...armParts(dress, other, bend, onRim.wrist, SINGER_ARM), ...onRim.parts,
      web(shoulders, other, bend, V(-side * 0.12 * broad, h + 0.2, 0)), web(fore, bend, onRim.wrist, V(-side * 0.13 * broad, h + 0.05, 0)), tambourine], t.pivot);
    p.mouth = leaned(p, t.mouth);
    const tapping = stand(p, t, stance, toes, 0, true, null, knee);
    /* The legs, in trousers, are fitted to the canvas (`fit`): from the back of the crowd at a phone's lower rungs a shin as built
       is a pixel wide, and came apart at the knee. A stand before the legs held them together; one beside them does not. */
    for (const l of legs) if (l.p === p) fitted.push(...[l.thigh, l.shin].map((b) => ({ bone: b, wide: b.wide, thick: b.thick })));
    keepHead(p, t);
    /* The stand from its foot up into the head, its foot cut level with the floor; and the head, a ball. Each is fitted to the
       canvas about the stand's line. */
    const pole = leaning(foot, head.clone().addScaledVector(lean, -0.03), STAND, STAND - 0.002);
    stands.push({ at: fixed.length, by: p, r: STAND, sides: 6, axis: pole.along.transformDirection(p.g.matrix) }, { at: fixed.length + 1, by: p, r: MIC_HEAD, most: MIC_HEAD_MOST, sides: 8, round: true });
    keep(p, "microphone", [paint(pole.geo, tone(STUFF.steel)), paint(ball(head, MIC_HEAD, 1, 1, 1, 1), tone(STUFF.chrome))]);
    const { body, pivot } = p;
    p.pose = (count, level, time) => {
      const slow = swing(count - lag, SLOW), beat = swing(count - lag, 1);
      const shift = level * sway * slow + (1 - level) * SHIFT * Math.sin(time * (0.7 + 0.13 * p.at));
      body.position.set(pivot.x + shift, pivot.y + breathe(level, time, BREATH), pivot.z);
      body.rotation.set(level * 0.02 * slow, 0, LEAN * shift);
      tapping.turn = (level * tap * (1 - beat)) / 2;
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
     drummer and the kit until a stroke's top, when each stick's tip stands over its shoulder; what moves against the
     panel is that tip, the elbows and the trunk, which rocks once in four counts. The right stick falls on one count and the left
     two counts on: each rises slowly and falls once in four counts, so one is down while the other is at its top. */
  function drummer(role, spot, facing, { size, broad, hair, lag, kick, toms, tom, floor: low, crash, dress }) {
    const p = player(role, "drums", spot, facing, size, dress);
    p.lag = lag;
    p.look = { size, broad, hair, skirt: 0 };
    const t = trunk(SEATED, broad, hair, 0, dress), { shoulders, upper } = worn(dress), shell_ = dress.shell;
    /* The sticks: each tip rests where it falls, the left on the snare and the right on the tom at `tom`, its hand a stick's hold
       behind, and falls `delay` counts after the drummer's own count. */
    const sticks = [
      { side: 1, name: "left", tip: V(0.07, 0.69, 0.36), grip: V(0.21, 0.83, 0.13), delay: SLOW / 2 },
      { side: -1, name: "right", tip: tom.clone(), grip: V(tom.x * 0.6 - 0.1, tom.y - 0.04, tom.z - 0.33), delay: 0 },
    ];
    /* What fills each arm's bend at rest, as part of the body: from the shoulder to the elbow, a hair inside the upper arm's
       middle, and down to the waist; and from the chest to them. The elbows stand out from the trunk, so the arms show from the
       front, and nothing between an arm and the trunk is open: a pocket a pixel wide inside an outline is the panel's or the band's as a
       whole pixel, and comes and goes. */
    const turned = (v, a) => v.clone().sub(t.pivot).applyAxisAngle(X, a).add(t.pivot);
    const webs = sticks.flatMap(({ side, grip }) => {
      const shoulder = t.shoulder(side), elbow = turned(elbowOf(V(), turned(shoulder, DRUM_LEAN), grip, 0.29, 0.25, elbowOut(side)), -DRUM_LEAN);
      elbow.x -= side * WEB_IN;
      return [web(shoulders, shoulder, elbow, V(side * 0.15 * broad, SEATED.hips + 0.12, 0)), web(upper, V(side * 0.1 * broad, SEATED.hips + 0.4, 0), shoulder, elbow)];
    });
    embody(p, [...t.parts, ...t.head, ...webs], t.pivot, DRUM_LEAN);
    p.mouth = leaned(p, t.mouth);
    const kit = (as, ...parts) => keep(p, "kit", parts, as);
    /* A drum's heads are white, but for the bass drum's front head, which is its shell's colour halfway to white: lighter than the
       shell, so the kit's largest face shows as a drum's head and no dark disc, and of the kit's colour, so it is no pale disc of
       its own either. Its shell is the kit's (dress.shell), the era's colour by the seat, lit as a guitar is; the hardware is
       chrome, the cymbals bronze, the stool black, and what fills the kit between its drums the shell's colour in shade, so the kit
       is one coloured mass and no black block. */
    const front = shell_.clone().lerp(tone(STUFF.white), 0.5), fill = shell_.clone().multiplyScalar(0.75);
    kit("bass drum", paintBy(drum(V(0, kick + 0.005, 0.86), kick, kick, 0.4, 24, Math.PI / 2), (_, n) => (n.z > 0.9 ? front : n.z < -0.9 ? tone(STUFF.drumhead) : shell_)));
    /* A rack tom `r` in radius at `x`, as high as puts its head 2 cm under the right stick's tip where that rests. */
    const high = tom.y - (toms.deep / 2 + 0.02 - (TOM_Z - tom.z) * Math.sin(TOM_TIP)) / Math.cos(TOM_TIP);
    const rack = ([x, r]) => shell(r, toms.deep, shell_).rotateX(-TOM_TIP).translate(x, high, TOM_Z);
    kit("rack tom", rack(toms.left), rack(toms.right));
    kit("floor tom", shell(low.r, 0.5, shell_, true).rotateZ(Math.sign(low.x) * 0.06).translate(low.x, 0.265, 0.45));
    kit("snare", paintBy(drum(V(0.05, 0.6, 0.4), 0.18, 0.18, 0.14, 12), (_, n) => (Math.abs(n.y) > 0.9 ? tone(STUFF.drumhead) : tone(STUFF.chrome))), paint(bar(V(0.05, 0.53, 0.4), V(0.05, 0.02, 0.4), 0.03, 0.03, 5), tone(STUFF.chrome)));
    /* What the toms ride on: a block from the bass drum's top up into them, narrow enough to hide behind them, and on the floor
       tom's side out to the edge of the tom over it, so no light shows under that tom's overhang. And the kit's middle, between
       the bass drum, the snare and the knees: its top is under the snare's head, where the left stick lands. */
    const over = low.x > 0 ? toms.right : toms.left, edge = Math.abs(over[0]) + over[1];
    kit("block", paint(box(0.28 + edge, 0.36, 0.2, (Math.sign(low.x) * (edge - 0.28)) / 2, 0.62, TOM_Z), fill), paint(box(0.44, 0.34, 0.5, 0, 0.43, 0.42), fill));
    kit("stool", paint(drum(V(0, 0.5, -0.02), 0.17, 0.17, 0.07, 10), tone(STUFF.black)), paint(drum(V(0, 0.24, -0.02), 0.05, 0.09, 0.46, 8), tone(STUFF.chrome)));
    kit("hi-hat", paint(drum(HAT, 0.03, 0.15, 0.035, 12), tone(STUFF.bronze)), paint(drum(V(HAT.x, HAT.y - 0.045, HAT.z), 0.15, 0.03, 0.035, 12), tone(STUFF.bronze)));
    kit("pole", ...pole(-0.2, 0.3, HAT.y - 0.02));
    kit("cymbal", cymbal(V(crash.x, crash.y, crash.z), crash.r, crash.tip, -Math.sign(crash.x) * 0.1));
    stands.push({ at: fixed.length, by: p, r: POLE, sides: 8 });
    kit("pole", ...pole(crash.x, crash.z, crash.y - 0.01));
    /* The legs, which stay on the pedals. */
    sit(p, t, 0.38, 0.5);
    /* The arms. A stroke lifts the hand a little, out to its `side`, and tips its stick back RAISE rad and out SPLAY rad, so at
       the stroke's top the stick's tip stands over the drummer's shoulder: a stick shows against the panel once in four counts.
       The stick is a bar thickest at its tip, STICK across: what shows of it is two of a phone's pixels across from the band's
       still, where a thinner tip comes apart. A stick stands no higher than the band is playing (`level`), so as the band takes up
       playing or leaves off it goes no faster than a stroke does. */
    const arms = sticks.map(({ side, name, tip, grip, delay }) => ({ side, name, grip, aim: tip.clone().sub(grip), delay, lift: V(side * 0.03, 0.1, -0.02),
      arm: arm(p, name, t.shoulder(side), 0.29, 0.25, elbowOut(side), [bone(p, `${name} stick`, STICK, STICK, [0, 0], X, [1, -0.27]), bone(p, `${name} hand`, 0.085, 0.07, [0, 0], X, [-0.14, 0.14])]) }));
    for (const { name, arm: a } of arms) fitted.push({ bone: a.bones[1], wide: a.bones[1].wide, thick: a.bones[1].thick, most: DRUM_FOREARM[name] });
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

  /* The line-up as it stands (STAGING), from the crowd's left: each player as their role is dealt (DEAL), the first drummer's deal
     to the first who drums and the second's to the second, and dressed as their seat, their place from the crowd's left, is in the
     show's era (dressOf), in a coat where the deal has one. */
  const BUILD = { lead: strummer, rhythm: strummer, bass: strummer, drums: drummer, organ: keyboardist, keys: keyboardist, piano: keyboardist, voice: singer };
  let drummers = 0;
  staging.players.forEach(([role, x, z, facing, over], seat) => {
    const deal = dealt(role, role === "drums" ? drummers++ : 0, staging.close, over);
    BUILD[role](role, [x, z], facing, { ...deal, dress: dressOf(date, seat, role, Boolean(deal.coat)) });
  });

  /* The furniture, in the stage's frame: three wedge monitors at the lip, between the players' feet. (Amplifiers stood here too:
     beside a player they were one more edge a hand from an outline, and at the floor's corners they stood outside a phone's frame.) */
  const wedge = (x, z, turn) => paintBy(plate([[-0.38, 0], [0.38, 0], [0.38, 0.45], [0.14, 0.48], [-0.38, 0.11]], 0.86, false).rotateY(-Math.PI / 2 + turn).translate(x, floor, z),
    (_, n) => (n.y > 0.3 && n.y < 0.99 ? tone(STUFF.grille) : tone(STUFF.monitor)));
  keep(null, "monitor", staging.monitors.map(([x, z, turn]) => wedge(x, z, turn)));

  /* The still parts as one mesh, which remembers the corners each named part holds. */
  let from = 0;
  const parts = fixed.map(({ of, as, by, geo }) => { const part = { of, as, by, from, count: geo.attributes.position.count }; from += part.count; return part; });
  const still = new THREE.Mesh(mergeGeometries(fixed.map((f) => f.geo)), material);
  still.userData.parts = parts;
  stage.add(still);

  /* Fits to the canvas, whose pixel is `perPx` rad high at its middle (main.js), what stands clear of an outline a pixel or so
     across from the back of the crowd: each crash's pole and each microphone's stand, widened about its own upright axis from
     the corners it was built with, and the keyboard players' forearms and hands, the drummers' forearms and each tapping foot
     (`fitted`), each both ways as stout as a pixel of it SEEN m off at the least, and no stouter than STOUT_MOST, a drummer's
     than DRUM_FOREARM, a boom than BOOM_MOST and the singer's microphone's head than MIC_HEAD_MOST (`most`); and the tip of each guitar's and the bass's neck, its head with it, widened across the strings to NECK_PX
     of a pixel SEEN m off, and no more than NECK_MOST times as wide as built; and lays the bones again, for a band that stands
     still. */
  const corners = still.geometry.getAttribute("position");
  const fits = stands.map(({ at, by, r, most = STOUT_MOST, sides, axis = Y, round = false, across = false }) => {
    const { from, count } = parts[at], base = corners.array.slice(from * 3, (from + count) * 3);
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < count; i++) { x += base[i * 3] / count; y += base[i * 3 + 1] / count; z += base[i * 3 + 2] / count; }
    return { from, count, base, x, y, z, axis, round, across, r, most, flats: 2 * Math.cos(Math.PI / sides), scale: by.g.scale.x };
  });
  function fit(perPx) {
    if (!(perPx > 0)) return;
    const seen = SEEN * perPx * 1.05;
    /* A stand is widened across at each height about where its line is there (`axis`, upright unless it leans), so a foot on the
       floor stays on it; a boom, `across`, square to its own line, which runs nearer level than upright; a microphone's head,
       `round`, every way about its middle. */
    for (const { from, count, base, x, y, z, axis, round, across, r, most, flats, scale } of fits) {
      const k = Math.min(most, Math.max(r, seen / (flats * scale))) / r;
      for (let i = 0; i < count; i++) {
        const dx = base[i * 3] - x, dy = base[i * 3 + 1] - y, dz = base[i * 3 + 2] - z;
        const along = round ? 0 : across ? dx * axis.x + dy * axis.y + dz * axis.z : dy / axis.y, ax = x + axis.x * along, az = z + axis.z * along;
        corners.array[(from + i) * 3] = ax + (base[i * 3] - ax) * k;
        if (round) corners.array[(from + i) * 3 + 1] = y + (base[i * 3 + 1] - y) * k;
        else if (across) { const ay = y + axis.y * along; corners.array[(from + i) * 3 + 1] = ay + (base[i * 3 + 1] - ay) * k; }
        corners.array[(from + i) * 3 + 2] = az + (base[i * 3 + 2] - az) * k;
      }
    }
    corners.needsUpdate = true;
    for (const { p, geo, from, count, base, across, way, wide } of necks) {
      const k = Math.min(NECK_MOST, Math.max(1, (NECK_PX * seen) / (wide * p.g.scale.x))) - 1, at = geo.getAttribute("position");
      for (let i = 0; i < count; i++) {
        at.array[(from + i) * 3] = base[i * 3] + k * across[i] * way.x;
        at.array[(from + i) * 3 + 1] = base[i * 3 + 1] + k * across[i] * way.y;
        at.array[(from + i) * 3 + 2] = base[i * 3 + 2] + k * across[i] * way.z;
      }
      send(at, from, count);
      bound(geo);
    }
    for (const { bone, wide, thick, most = STOUT_MOST * 3 } of fitted) {
      const least = Math.min(most, seen / (LIMB_FLATS * players[bone.of].g.scale.x));
      bone.wide = Math.max(wide, least);
      bone.thick = Math.max(thick, least);
    }
    place();
  }

  /* The limbs: one instanced mesh in the stage's frame. Every bone stays over the floor, so the mesh culls against the camera by one
     sphere round the stage, without measuring its bones. */
  const limbs = new THREE.InstancedMesh(LIMB, material, bones.length);
  for (let k = 0; k < bones.length; k++) limbs.setColorAt(k, bones[k].colour);
  limbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  limbs.boundingSphere = new THREE.Sphere(V(0, floor + 2, 0), 9.5);
  stage.add(limbs);

  /* Lays every bone where the players' poses put it: each leg from its hip, each arm from its shoulder to its wrist with what the hand
     holds, each hinge's bones from its pivot; then each bone's matrix, from the player's frame into the stage's. A point of a body
     turns by the body's own quaternion, which three keeps to the rotation a pose set: one a player, not one a joint. */
  const m = new THREE.Matrix4(), end = V(), swung = V();
  function place() {
    for (let k = 0; k < legs.length; k++) {
      const { p, thigh, shin, hip, ankle, bend, reach } = legs[k];
      thigh.a.copy(hip).applyQuaternion(p.body.quaternion).add(p.body.position);
      thigh.b.addVectors(thigh.a, ankle).multiplyScalar(0.5);
      thigh.b.z += bend + KNEE_GIVE * (reach - thigh.a.distanceTo(ankle));
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

  /* Lays each skirt where it hangs (`hangFrom`), in its body's own frame: where it hangs from a body upright at rest, moved by its
     share of how far the hips have gone. Only its corners and normals go to the GPU. */
  const posed = new THREE.Matrix4(), toRest = new THREE.Matrix4(), turned = new THREE.Matrix3(), unturn = new THREE.Quaternion(), gone = V();
  function hang() {
    for (const { p, geo, from, count, weight, rest, hips, still, base, normals } of hangs) {
      posed.compose(p.body.position, p.body.quaternion, p.body.scale);
      toRest.copy(posed).invert().multiply(rest);
      turned.setFromMatrix4(toRest);
      gone.copy(hips).applyMatrix4(posed).sub(still).applyQuaternion(unturn.copy(p.body.quaternion).invert());
      const e = toRest.elements, r = turned.elements, at = geo.getAttribute("position"), normal = geo.getAttribute("normal");
      for (let i = 0; i < count; i++) {
        const w = weight[i], x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2], k = (from + i) * 3;
        at.array[k] = e[0] * x + e[4] * y + e[8] * z + e[12] + w * gone.x;
        at.array[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] + w * gone.y;
        at.array[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] + w * gone.z;
        normal.array[k] = r[0] * nx + r[3] * ny + r[6] * nz;
        normal.array[k + 1] = r[1] * nx + r[4] * ny + r[7] * nz;
        normal.array[k + 2] = r[2] * nx + r[5] * ny + r[8] * nz;
      }
      send(at, from, count);
      send(normal, from, count);
    }
  }
  /* The band's count: the figures' beat, or half of it while that is fast (HALF_OVER), eased onto the beat again over RETUNE seconds
     after a change, so no one jumps. `rate` is the beat's own speed, in beats a second, smoothed over RATE_SMOOTH. */
  let level = 0, count = 0, last = null, rate = 0, half = false;
  /* Plays the band for a frame `dt` s long: `beats` is the figures' phase in beats, which the caller keeps (beat.js), and `time` the
     world's time in seconds. While the show plays they play, on their count; otherwise they stand, breathing on a 4-s cycle and
     shifting their weight. Each change eases over EASE seconds. Under reduced motion nothing calls this, so they stand as they were
     built: at rest, their hands on their instruments. Nothing here makes anything but the ranges of a body's corners it sends to the
     GPU (`send`): a frame's work is arithmetic on what the build made. */
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
    hang();
    return count;
  }
  for (let k = 0; k < players.length; k++) players[k].pose(0, 0, 0);
  place();
  hang();

  return { players, limbs, bones, joints, still, material, uniforms, move, fit, light };
}
