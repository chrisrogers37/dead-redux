import * as THREE from "three";
import { boomLength, TOP } from "./avatar.js";
import { SNOUT } from "./bears.js";
import { outside } from "./collide.js";
import { chance, STONE_REACH } from "./flora.js";
import { CAVES, height, STAGE, TEST_POSES, TRAILHEAD } from "./ground.js";
import { FEATHER, offTracks, RING } from "./island.js";
import { BEAR_GAP } from "./modes.js";
import { CRANE, DESCENT_FROM, postPose } from "./pose.js";
import { onCrowdGround } from "./seats.js";

/* The trees: groves of tall pines and broad-crowned trees between the landmarks, so the island has an outline against the sky. All
   of one kind are one instanced mesh, so the trees cost two draw calls however many stand. A trunk is solid to a walk (modes.js);
   the walk's camera slides round a trunk and dips under a crown (avatar.js); every other camera's way is kept clear of them when
   they are placed. A tree stands on the island's own height (ground.js), which a walk and its camera reckon by, with its foot sunk under it:
   the ground's mesh lies up to 0.7 m off that height on a phone's coarser grid, and the sunk foot covers it.
   The trees stand still. A crown that swayed made the pixels its edge crossed flicker against a bright sky, up to six swings in a
   second at a block where the trees held still counted three (scripts/flash), so nothing here moves a corner once it is built. */

/* A tree stands TALL m over the ground, its foot SUNK m under it, since on a slope the ground falls away under its lower side. Its
   crown is the upper part of it, from BASE_FRAC of the way up from its foot, and CROWN_R m across its half; and there are CROWN_BASE m
   of air under a crown wherever a walker can stand below it, so a bear walks under any crown with its head clear (avatar.js TOP),
   and the walk's camera passes under it. A tree leans up to LEAN rad. */
export const SUNK = 1.6, TALL = [11, 18], CROWN_BASE = 6.5, BASE_FRAC = 0.66;
export const CROWN_R = [2.8, 4.0], LEAN = 0.04;
/* A tree's shape is built with its crown's radius for a unit across (the shapes, below). In those: a trunk's half-width at its sunk
   foot, where it is widest, with no part of a trunk, a pine's stubs among them, further from its middle line; and how far a crown's
   corners reach. */
export const TRUNK_FOOT = 0.2, CROWN_REACH = 0.98;
/* How far a crown `wide` m across its half reaches from the middle of its tree's foot: its corners, and what its lean (rad) carries
   its top over. And a trunk, no higher than `up` m over its sunk foot: its foot's half-width, and its lean by there. */
const crownOut = (wide, lean, tall) => wide * CROWN_REACH + lean * (tall + SUNK);
const trunkOut = (wide, lean, up) => wide * TRUNK_FOOT + lean * up;
/* The furthest any crown reaches from its tree's foot, and any trunk no higher than a bear is tall. */
export const CROWN_R_MAX = crownOut(CROWN_R[1], LEAN, TALL[1]), TRUNK_R_MAX = trunkOut(CROWN_R[1], LEAN, SUNK + TOP);
/* How near a walk comes to the middle of a trunk's foot, whichever way the walker faces: the furthest any part of a bear stands from
   its centre, its nose's tip (bears.js SNOUT), outside the widest trunk. So no part of the visitor's bear is in the bark of a trunk
   it has walked up to, and turning beside one never moves it. The reach is the bear's as it stands: the lean a walk gives it
   (avatar.js) carries its nose 0.4 m further for the moment after it is stopped, which the widest trunk's foot, wider than where a
   nose meets it, all but covers. Two such reaches and PASS m fit between any two trees (MIN_APART), so a walk passes between any
   two trunks, with over a metre of air beside each flank, and slides round any one of them. */
export const TREE_REACH = SNOUT + TRUNK_R_MAX, PASS = 0.5, MIN_APART = 2 * TREE_REACH + PASS;
/* How far from the middle of a tree's foot anything grows or lies (island.js): the widest trunk and the largest stone's reach. */
export const TRUNK_ROOM = TRUNK_R_MAX + STONE_REACH;
/* How far a tree's foot keeps from the setlist's path, from the bears' line, from a landmark's outline, from the crowd's ground, from
   the stage's centre and from a cave's; from the tracks' edges and inside the ring road; and from every place the camera that walks
   with the bears stands (EYE_ROOM). A view (cameraWays) is kept clear to VIEW_HALF m either side of its line, which
   is 4 m of air beside the widest crown, and a camera's sight of a bear, or of a landmark as its song begins, to SIGHT_HALF m, a
   crown's reach. */
export const PATH_ROOM = 9, LINE_ROOM = 8, LANDMARK_ROOM = 6, CROWD_ROOM = 8, STAGE_ROOM = 30, CAVE_ROOM = 13.5 + 4;
export const TRACK_ROOM = 2, RING_ROOM = 3, EYE_ROOM = 6.5, VIEW_HALF = 4 + CROWN_R_MAX, SIGHT_HALF = CROWN_R_MAX;
/* A tree stands where the land's normal is no lower than NY_MIN, which takes in the stony slopes a tuft does not grow on; a steeper
   slope would ask for a taller tree than any is. TRIES places are tried in each square of CELL m, which is narrower than two trees
   stand apart: a square whose first place is too near a neighbour's tree may still grow its own at another. TARGET is how many
   trees a tier draws. */
export const NY_MIN = 0.85, CELL = 6, TRIES = 3, TARGET = { desktop: 100, tv: 75, phone: 45 };
/* The groves, each [x, z, r, pines]: a wood round (x, z), thick out to GROVE_CORE of `r` m from it and thinning to nothing by `r`, with
   `pines` the share of its trees that are pines and the rest broad-crowned. They stand where the rules below leave room: in the
   island's three quarters between the path's arms and at its north-east rim, with meadows between them. Away from them the share
   LONE of the places tried grow a broad-crowned tree by itself, so a grove has stragglers and no hard edge. */
export const GROVES = [
  [-46, 84, 23, 0.85], [-82, 38, 26, 0.8], [-44, 42, 14, 0.2],
  [32, 64, 22, 0.1], [66, 38, 22, 0.3], [18, 24, 11, 0],
  [-62, -40, 25, 0.85], [-28, -64, 17, 0.25], [-24, -22, 14, 0.1],
  [38, -96, 20, 0.9], [98, -38, 10, 0],
];
export const GROVE_CORE = 0.8, LONE = 0.2;
/* A crown's lowest corner may sit this far under BASE_FRAC of its tree's height: a lean lowers its downwind rim, and the ground under
   it is read at a few places, not all. And how far past a crown's reach the ground is read for the air under it. */
export const DROP = 0.3, UNDER = 1.5;
/* The way the wind blows across the island, [x, z]: the trees lean down it. */
const WIND = [0.86, 0.51];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/* How thickly the groves grow at a place, 0 to 1, and the share of pines there: the thickest grove's that reaches it. */
export function grove(x, z) {
  let thick = 0, pines = 0;
  for (const [gx, gz, r, share] of GROVES) {
    const t = clamp01((1 - Math.hypot(x - gx, z - gz) / r) / (1 - GROVE_CORE));
    if (t > thick) { thick = t; pines = share; }
  }
  return { thick, pines };
}

/* Things by the square of `side` m each lies in, so what is near a place is found without trying everything. `add(x, z, thing)` puts
   one in the square (x, z) lies in, and `put(i, j, thing)` in the square numbered (i, j), as `cell` numbers a coordinate.
   `some(x, z, r, see)` hands `see` each thing in the squares that come within `r` m of (x, z), until it answers true for one, and
   says whether it did. */
function squares(side) {
  const cells = new Map(), cell = (v) => Math.floor(v / side);
  /* A square's key: the island is far narrower than 4096 squares of any size used here. */
  const key = (i, j) => i * 4096 + j;
  const put = (i, j, thing) => { const k = key(i, j), list = cells.get(k); if (list) list.push(thing); else cells.set(k, [thing]); };
  return {
    cell, put, add: (x, z, thing) => put(cell(x), cell(z), thing),
    some(x, z, r, see) {
      for (let i = cell(x - r); i <= cell(x + r); i++) for (let j = cell(z - r); j <= cell(z + r); j++) {
        const list = cells.get(key(i, j));
        if (list) for (let k = 0; k < list.length; k++) if (see(list[k])) return true;
      }
      return false;
    },
  };
}

/* Points [x, z] in squares of `side` m, so a place is tried against the few points near it. `within(x, z, r)` is whether any point
   lies nearer than `r`; `add` takes one more, with a number of its own, which `each(x, z, r, see)` hands back with every point in the
   squares within `r`. */
function index(points, side) {
  const grid = squares(side);
  const add = (x, z, value = 0) => grid.add(x, z, [x, z, value]);
  for (const [x, z, value] of points) add(x, z, value);
  const each = (x, z, r, see) => grid.some(x, z, r, (p) => see(p[0], p[1], p[2]));
  return { add, each, within: (x, z, r) => each(x, z, r, (px, pz) => (x - px) ** 2 + (z - pz) ** 2 < r * r) };
}

/* How far a point lies from the line between two others. */
function fromSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(dx * dx + dz * dz, 1e-9));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/* Views ({ from: [x, z], to: [x, z], half }) by the squares each passes within `half` of, so a place is tried against the few views
   near it. `crosses(x, z)` is whether the place lies within a view's `half` of its line. */
function corridors(views, side = 16) {
  const grid = squares(side);
  for (const view of views) {
    const { from: [ax, az], to: [bx, bz], half } = view;
    for (let i = grid.cell(Math.min(ax, bx) - half); i <= grid.cell(Math.max(ax, bx) + half); i++) for (let j = grid.cell(Math.min(az, bz) - half); j <= grid.cell(Math.max(az, bz) + half); j++) {
      /* Only the squares the view comes near: its line's distance from a square's middle, less the square's half diagonal. */
      if (fromSegment((i + 0.5) * side, (j + 0.5) * side, ax, az, bx, bz) <= half + side * 0.7072) grid.put(i, j, view);
    }
  }
  return { crosses: (x, z) => grid.some(x, z, 0, ({ from, to, half }) => fromSegment(x, z, from[0], from[1], to[0], to[1]) < half) };
}

/* The rules of where a tree may not stand, each `(x, z, ctx)` and true where it may not: `ctx` is what placeTrees gathers of the
   world. They are tried in this order, the cheapest first. */
export const RULES = {
  /* Inside the ring road, with room for the ring's verge. */
  pastRing: (x, z) => Math.hypot(x, z) > RING - RING_ROOM,
  nearStage: (x, z) => Math.hypot(x - STAGE[0], z - STAGE[1]) < STAGE_ROOM,
  inCave: (x, z) => CAVES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < CAVE_ROOM),
  onTracks: (x, z) => !offTracks(x, z, TRACK_ROOM + FEATHER),
  /* The land's own slope, as flora.js reads it for a tuft. */
  steep: (x, z) => {
    const gx = height(x + 0.5, z) - height(x - 0.5, z), gz = height(x, z + 0.5) - height(x, z - 0.5);
    return 1 / Math.sqrt(1 + gx * gx + gz * gz) < NY_MIN;
  },
  /* The crowd's ground and the wedge between it and the stage: its sections reach to 13.5 m from the stage. */
  onCrowd: (x, z) => onCrowdGround(x, z, CROWD_ROOM),
  nearPath: (x, z, ctx) => ctx.path.within(x, z, PATH_ROOM),
  nearLine: (x, z, ctx) => ctx.line.within(x, z, LINE_ROOM),
  crowded: (x, z, ctx) => ctx.trees.within(x, z, MIN_APART),
  nearLandmark: (x, z, ctx) => ctx.landmarks.some((l) => {
    const dx = x - l.x, dz = z - l.z;
    return Math.hypot(dx, dz) < l.reach + LANDMARK_ROOM && outside(l.poly, dx * l.c - dz * l.s, dx * l.s + dz * l.c) < LANDMARK_ROOM;
  }),
  nearEye: (x, z, ctx) => ctx.eyes.within(x, z, EYE_ROOM),
  inView: (x, z, ctx) => ctx.views.crosses(x, z),
  /* The opening's descent comes straight down from DESCENT_FROM m over the island's middle to one of those eyes (pose.js), so it is
     as low as a tree only near the eye: no tree stands within a crown's reach of the part of that line that is lower than the
     tallest tree its place could grow. That part is the last `low` of the line at the most, as far as the eye stands from the
     middle; so an eye whose line could be that low within a crown's reach of the place stands no further from it than a crown's
     reach and `low` of the place's own way out, over 1 - `low`, and only the eyes that near are tried. */
  underDescent: (x, z, ctx) => {
    const top = height(x, z) + TALL[1] + 1, low = top / DESCENT_FROM;
    return ctx.eyes.each(x, z, (low * Math.hypot(x, z) + CROWN_R_MAX) / (1 - low), (ex, ez, ey) => {
      const from = (DESCENT_FROM - top) / (DESCENT_FROM - ey);
      return from < 1 && fromSegment(x, z, ex * from, ez * from, ex, ez) < CROWN_R_MAX;
    });
  },
};

/* The highest the ground stands under a crown that reaches `reach` m from (x, z), and UNDER m past it: read at the middle and round
   three rings, which finds it to a few centimetres on this island's slopes. */
function groundUnder(x, z, reach) {
  let over = height(x, z);
  for (let ring = 1; ring <= 3; ring++) for (let k = 0; k < 32; k++) {
    const a = (k * Math.PI) / 16, r = ((reach + UNDER) * ring) / 3;
    over = Math.max(over, height(x + r * Math.cos(a), z + r * Math.sin(a)));
  }
  return over;
}

/* Where the trees stand: `spots`, at most `count` of them, each { x, y, z, tall, wide, turn, lean, kind, tint, reach, base, top }; and
   `near(x, z, r)`, whether one's foot stands within `r` m of a place. `loop` is the setlist's path and `line` the bears' line, as
   points [x, z] no more than 2 m apart; `landmarks` each { x, z, rot, poly }, where one stands, how it is turned and its outline from
   above in its own frame (path.js outline); `eyes` and `views` what the tier's cameras need kept clear (cameraWays).
   A place is tried in each square of CELL m, in an order shuffled by the squares' own numbers, and kept where the groves grow and
   no rule forbids it, and then the squares' other places are tried (TRIES), a square growing one tree at the most; so with the same cameras' ways a tier that draws fewer draws the first of a tier's that draws more, as a TV
   does of a desktop's, and the trees are the same on every visit.
   A tree is as tall as its place gives it, or taller where the ground under its crown stands higher than its foot: its crown starts
   CROWN_BASE m over the highest ground under it. `reach`, `base` and `top` bound its crown for the walk's camera: no part of it is
   further out than `reach` from (x, z), lower than `base` or higher than `top`. */
export function placeTrees({ count, loop = [], line = [], landmarks = [], eyes = [], views = [], groves = grove }) {
  const ctx = {
    path: index(loop, 12), line: index(line, 12), eyes: index(eyes, 8), views: corridors(views), trees: index([], 8),
    landmarks: landmarks.map(({ x, z, rot, poly }) => ({ x, z, c: Math.cos(rot), s: Math.sin(rot), poly, reach: Math.max(0, ...poly.map(([px, pz]) => Math.hypot(px, pz))) })),
  };
  const rules = Object.values(RULES);
  const span = Math.ceil(RING / CELL), cells = [];
  /* Every square's first place, in the shuffled order, then every square's second, and so on: each try has numbers of its own. */
  for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) for (let nth = 0; nth < TRIES; nth++) cells.push([nth + chance(a, b, 20 * nth), a, b, 20 * nth]);
  cells.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const spots = [];
  for (const [, a, b, salt] of cells) {
    if (spots.length >= count) break;
    const x = (a + 0.1 + 0.8 * chance(a, b, salt + 1)) * CELL, z = (b + 0.1 + 0.8 * chance(a, b, salt + 2)) * CELL;
    const { thick, pines } = groves(x, z);
    if (chance(a, b, 3) >= Math.max(thick, LONE)) continue;
    if (rules.some((rule) => rule(x, z, ctx))) continue;
    const y = height(x, z), wide = CROWN_R[0] + (CROWN_R[1] - CROWN_R[0]) * chance(a, b, 7);
    /* It leans down the wind, give or take, by a share of LEAN. */
    const way = Math.atan2(WIND[1], WIND[0]) + 1.8 * (chance(a, b, 10) - 0.5), lean = LEAN * (0.25 + 0.75 * chance(a, b, 11));
    /* The height that puts the crown's lowest corner CROWN_BASE m over the highest ground under it, as far as the tallest it could be
       would reach. */
    const need = (groundUnder(x, z, crownOut(wide, lean, TALL[1])) + CROWN_BASE + DROP - (y - SUNK)) / BASE_FRAC - SUNK;
    const tall = Math.max(TALL[0] + (TALL[1] - TALL[0]) * chance(a, b, 6), need);
    if (tall > TALL[1]) continue;
    ctx.trees.add(x, z);
    spots.push({
      x, y, z, tall, wide, turn: 2 * Math.PI * chance(a, b, 5), lean: [lean * Math.cos(way), lean * Math.sin(way)],
      kind: chance(a, b, 8) < pines ? "pine" : "broad", tint: chance(a, b, 9),
      reach: crownOut(wide, lean, tall), base: y - SUNK + (tall + SUNK) * BASE_FRAC - DROP, top: y + tall + 0.1,
    });
  }
  return { spots, near: ctx.trees.within };
}

/* What a tier's cameras need kept clear of trees, for placeTrees. `line` is the bears' line (path.js), `height` the ground's, `phone`
   whether the tier is a phone's, `bears` how many bears it can show, its own number first and then each a downgrade leaves
   (quality.js), and `stands` where the visitor stands by each landmark to look at it, each { x, z, to: [x, z], d }: the stand (path.js
   nearStand), the landmark's place and how far along the line the bears stand as its song begins.
   `eyes` are the places [x, z, y] the camera that walks with the bears stands at (pose.js postPose), for each of those numbers of
   bears, the lead bear every 2 m along the line. `views` are the lines of sight, each { from, to, half }: from each of those eyes to
   each bear and the visitor's; from lean-back's crane (pose.js CRANE) to the visitor's bear, to the bears and to where it looks; from
   behind each test pose (ground.js), where the walk's camera hangs on its boom (avatar.js) and BOOM_BACK m more, to the stage; from
   the summit to the trailhead, as lean-back looks under reduced motion; from a boom's length behind each stand to its landmark and
   BEHIND m past it, so a landmark is seen whole with nothing close behind it; and from that camera and the crane, as a song begins
   and the beam stands on its landmark with all the tier's bears, to the landmark and BACKDROP m past it, so no tree stands behind
   the beam in the opening or at any song's start. */
const BOOM_BACK = 2, BEHIND = 10, BACKDROP = 24;
export function cameraWays({ line, height, stands = [], phone = false, bears = [5] }) {
  const eyes = [], views = [], at = (d) => { const p = line.at(d); return [p.x, p.z]; }, most = Math.max(...bears);
  const eye = (d, count) => postPose({ third: true, phone, bearD: d, count, gap: BEAR_GAP, line, height, keepInView: () => 0 }, 0, 0).pos;
  /* How far on from the crane the things it sees stand: the visitor's bear, each bear a gap further, and where it looks. */
  const craneSees = [...new Set([...Array.from({ length: most + 1 }, (_, k) => CRANE.back + k * BEAR_GAP), CRANE.ahead])];
  for (let d = 0; d < line.length; d += 2) {
    for (const count of bears) {
      const pos = eye(d, count);
      eyes.push([pos.x, pos.z, pos.y]);
      for (let k = 0; k <= count; k += 1) views.push({ from: [pos.x, pos.z], to: at(d - k * BEAR_GAP), half: SIGHT_HALF });
    }
    for (const on of craneSees) views.push({ from: at(d), to: at(d + on), half: SIGHT_HALF });
  }
  const back = boomLength(phone) + BOOM_BACK;
  for (const pose of Object.values(TEST_POSES)) {
    views.push({ from: [pose.x + back * Math.sin(pose.heading), pose.z + back * Math.cos(pose.heading)], to: STAGE, half: VIEW_HALF });
  }
  views.push({ from: [0, 0], to: TRAILHEAD, half: VIEW_HALF });
  /* The point `past` m beyond `to` on the line from `from`. */
  const beyond = (from, to, past) => { const dx = to[0] - from[0], dz = to[1] - from[1], far = Math.hypot(dx, dz) || 1; return [to[0] + (dx / far) * past, to[1] + (dz / far) * past]; };
  for (const { x, z, to, d } of stands) {
    views.push({ from: beyond(to, [x, z], boomLength(phone)), to: beyond([x, z], to, BEHIND), half: VIEW_HALF });
    if (d === undefined) continue;
    const pos = eye(d, most);
    for (const from of [[pos.x, pos.z], at(d - most * BEAR_GAP - CRANE.back)]) views.push({ from, to: beyond(from, to, BACKDROP), half: SIGHT_HALF });
  }
  return { eyes, views };
}

/* ---------- the shapes ---------- */

/* A shape is built in a frame of its own: y runs from 0 at the trunk's sunk foot to 1 at the crown's top, and x and z are in crown
   radii, so a tree's own height and width scale it. Every face is three corners of its own, each with a normal and a colour. */
function shape() {
  const position = [], normal = [], colour = [];
  return {
    /* One corner: its place, its normal and its colour. */
    corner(p, n, c) {
      position.push(p[0], p[1], p[2]);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      normal.push(n[0] / l, n[1] / l, n[2] / l);
      colour.push(c[0], c[1], c[2]);
    },
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colour, 3));
      return geo;
    },
  };
}
const rgb = (hex) => new THREE.Color(hex).toArray();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const times = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/* A limb: a tube of `sides` sides through `rings`, each { at: [x, y, z], r }, open at both ends, which stand inside what it joins.
   Its colour runs from `dark` at its first ring to `pale` at its last. */
function limb(out, rings, sides, dark, pale) {
  const ring = ({ at, r }) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * 2 * Math.PI, n = [Math.cos(a), 0, Math.sin(a)];
    return { p: [at[0] + n[0] * r, at[1], at[2] + n[2] * r], n };
  });
  for (let s = 0; s < rings.length - 1; s++) {
    const lower = ring(rings[s]), upper = ring(rings[s + 1]);
    const cl = mix(dark, pale, s / (rings.length - 1)), cu = mix(dark, pale, (s + 1) / (rings.length - 1));
    for (let k = 0; k < sides; k++) {
      const a = lower[k], b = lower[(k + 1) % sides], c = upper[(k + 1) % sides], d = upper[k];
      out.corner(a.p, a.n, cl); out.corner(d.p, d.n, cu); out.corner(c.p, c.n, cu);
      out.corner(a.p, a.n, cl); out.corner(c.p, c.n, cu); out.corner(b.p, b.n, cl);
    }
  }
}

/* How far down from its top a lobe's last ring stands, in rad: past its widest, so its rim tucks in under it. And how far a lobe's
   corners stand in or out of its radii. */
const TUCK = 1.85;
export const LOBE_ROUGH = 0.14;

/* A lobe of a broad crown: a dome of leaves round `at`, `rad` its radii, of `sides` sides and `rings` rings under its top, the last of
   them tucked in under its widest (TUCK rad down from its top) and drooping unevenly, and closed underneath, where it bellies down
   a little (with `belly`; flat without). Its corners stand in or out by up to `rough` of its radii, each by its own number, and
   none further from the tree's middle line than CROWN_REACH. It takes the light as a round thing of its own does, a share `round`
   of each corner's normal being the whole crown's (`heart` its middle, `span` its radii), so a crown reads as one soft thing made
   of several. Its colour runs from `over` on its top, down its flanks to `flank` at its widest, and to `under` beneath, so that from
   above each lobe shows its own round top and from below the crown is in its own shade; the lower a lobe sits in the crown (`low`
   to `high`), the deeper its colour; each corner mottled, each face a shade of its own. `top` moves the dome's top up to that
   height exactly. */
function lobe(out, at, rad, sides, rings, salt, { rough, heart, span, round, under, flank, over, low, high }, { belly = false, top = null } = {}) {
  const corner = (unit, k, drop, mottle) => {
    const p = [at[0] + unit[0] * rad[0] * k, at[1] + (unit[1] * k - drop) * rad[1], at[2] + unit[2] * rad[2] * k];
    const far = Math.hypot(p[0], p[2]);
    if (far > CROWN_REACH) { p[0] *= CROWN_REACH / far; p[2] *= CROWN_REACH / far; }
    /* Its own normal, a dome's; and the whole crown's there. */
    const own = [unit[0] / rad[0], unit[1] / rad[1], unit[2] / rad[2]], l = Math.hypot(...own) || 1;
    const whole = [(p[0] - heart[0]) / (span[0] * span[0]), (p[1] - heart[1]) / (span[1] * span[1]), (p[2] - heart[2]) / (span[2] * span[2])], w = Math.hypot(...whole) || 1;
    const tone = unit[1] >= 0 ? mix(flank, over, unit[1] ** 1.4) : mix(flank, under, Math.min(1, -3 * unit[1]));
    const deep = 0.8 + 0.2 * clamp01((p[1] - low) / (high - low));
    return { p, c: times(tone, deep * (0.86 + 0.28 * mottle)), n: [(own[0] / l) * (1 - round) + (whole[0] / w) * round, (own[1] / l) * (1 - round) + (whole[1] / w) * round, (own[2] / l) * (1 - round) + (whole[2] / w) * round] };
  };
  const apex = corner([0.08 * (chance(salt, 0, 71) - 0.5), 1, 0.08 * (chance(salt, 0, 72) - 0.5)], 1 - rough + 2 * rough * chance(salt, 0, 73), 0, chance(salt, 0, 74));
  if (top !== null) apex.p[1] = top;
  /* The rings, from just under the top out and down to the tuck, every other one turned half a side. */
  const ring = Array.from({ length: rings }, (_, j) => Array.from({ length: sides }, (_, i) => {
    const down = ((j + 1) / rings) * TUCK, turn = ((i + 0.5 * (j % 2) + 0.5 * (chance(i, j, salt) - 0.5)) / sides) * 2 * Math.PI;
    return corner([Math.sin(down) * Math.cos(turn), Math.cos(down), Math.sin(down) * Math.sin(turn)], 1 - rough + 2 * rough * chance(i, j, salt + 1), j === rings - 1 ? 0.25 * chance(i, j, salt + 2) : 0, chance(i, j, salt + 3));
  }));
  let face = 0;
  const tri = (a, b, c) => { const shade = 0.95 + 0.1 * chance(face++, salt, 41); for (const { p, n, c: tone } of [a, b, c]) out.corner(p, n, times(tone, shade)); };
  for (let i = 0; i < sides; i++) tri(apex, ring[0][(i + 1) % sides], ring[0][i]);
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < sides; i++) {
    /* The ring below is turned half a side one way or the other, and the faces between the two follow it. */
    const upper = ring[j], lower = ring[j + 1], i1 = (i + 1) % sides, shift = j % 2 === 0 ? 0 : 1, l0 = lower[(i + shift) % sides], l1 = lower[(i + shift + 1) % sides];
    tri(upper[i], upper[i1], l0); tri(upper[i1], l1, l0);
  }
  /* Underneath: in the crown's own shade, and facing down. */
  const rim = ring[rings - 1].map(({ p, n }) => ({ p, c: times(under, 1.35), n: [n[0] * 0.5, n[1] * 0.5 - 0.5, n[2] * 0.5] }));
  if (belly) {
    const foot = { p: [at[0], Math.min(...rim.map(({ p }) => p[1])) - 0.2 * rad[1], at[2]], c: under, n: [0, -1, 0] };
    for (let i = 0; i < sides; i++) tri(foot, rim[i], rim[(i + 1) % sides]);
  } else for (let i = 1; i < sides - 1; i++) tri(rim[0], rim[i], rim[i + 1]);
}

/* A pine: a straight trunk, bare but for a few dead stubs, and a crown of tiers of boughs, each a cone whose rim droops in points and
   is closed underneath, since a walker under it looks up into it. A phone's has fewer tiers and sides. */
export function pineGeometry(phone) {
  const out = shape(), bark = rgb(0x7a5a44), barkDark = rgb(0x4a382c);
  const sides = phone ? 5 : 6;
  limb(out, [{ at: [0, 0, 0], r: 0.19 }, { at: [0, 0.16, 0], r: 0.135 }, { at: [0.02, 0.68, 0.01], r: 0.08 }, { at: [0.06, 0.94, 0], r: 0.02 }], sides, barkDark, bark);
  const needle = rgb(0x44664a), needleDark = rgb(0x1c2e22), tip = rgb(0x6d8c55);
  const tiers = phone
    ? [[0.665, 0.85, 0.97], [0.775, 0.94, 0.7], [0.875, 1.0, 0.42]]
    : [[0.665, 0.815, 0.97], [0.735, 0.88, 0.82], [0.805, 0.935, 0.65], [0.87, 0.975, 0.47], [0.93, 1.0, 0.29]];
  const points = phone ? 7 : 10;
  tiers.forEach(([foot, apex, r], t) => {
    /* Each tier stands a little further down the wind than the one under it. */
    const cx = 0.025 * t, top = [cx + 0.012, apex, 0], hub = [cx, foot + 0.03, 0];
    const rim = Array.from({ length: points }, (_, k) => {
      const a = ((k + 0.37 * t + 0.3 * (chance(k, t, 55) - 0.5)) / points) * 2 * Math.PI, long = k % 2 === 0;
      const far = r * (long ? 0.8 + 0.2 * chance(k, t, 51) : 0.56 + 0.16 * chance(k, t, 52));
      /* No corner further out than CROWN_REACH, the tier's own step down the wind counted. */
      const p = [cx + far * Math.cos(a), foot + (long ? 0 : 0.02) + 0.012 * chance(k, t, 53), far * Math.sin(a)], out_ = Math.hypot(p[0], p[2]);
      if (out_ > CROWN_REACH) { p[0] *= CROWN_REACH / out_; p[2] *= CROWN_REACH / out_; }
      return { p, a, long };
    });
    for (let k = 0; k < points; k++) {
      const a = rim[k], b = rim[(k + 1) % points];
      /* A tier's side leans up and out; its normal there, in this frame, where a unit of y is some five of x. */
      const up = (r / (apex - foot)) * 0.05;
      const na = [Math.cos(a.a), up, Math.sin(a.a)], nb = [Math.cos(b.a), up, Math.sin(b.a)], mid = (a.a + (b.a < a.a ? b.a + 2 * Math.PI : b.a)) / 2;
      const shade = 0.86 + 0.28 * chance(k, t, 54);
      out.corner(top, [Math.cos(mid), up * 3, Math.sin(mid)], times(needle, shade));
      out.corner(b.p, nb, times(b.long ? tip : needle, shade));
      out.corner(a.p, na, times(a.long ? tip : needle, shade));
      /* Underneath, dark. */
      out.corner(hub, [0, -1, 0], needleDark);
      out.corner(a.p, [Math.cos(a.a) * 0.2, -1, Math.sin(a.a) * 0.2], times(needleDark, 1.3));
      out.corner(b.p, [Math.cos(b.a) * 0.2, -1, Math.sin(b.a) * 0.2], times(needleDark, 1.3));
    }
  });
  /* The stubs of boughs long dead, down the bare trunk. */
  for (const [y, a, long] of phone ? [] : [[0.52, 0.6, 0.105], [0.58, 3.9, 0.085], [0.63, 2.2, 0.1]]) {
    const dx = Math.cos(a), dz = Math.sin(a), r = 0.085, end = [dx * (r + long), y + 0.014, dz * (r + long)];
    const root = [0, 1, 2].map((k) => { const b = (k / 3) * 2 * Math.PI; return [dx * r * 0.6 - dz * 0.035 * Math.cos(b), y + 0.007 * Math.sin(b), dz * r * 0.6 + dx * 0.035 * Math.cos(b)]; });
    for (let k = 0; k < 3; k++) {
      const p = root[k], q = root[(k + 1) % 3], b = ((k + 0.5) / 3) * 2 * Math.PI, n = [dx * 0.3 - dz * Math.cos(b), 0.2 * Math.sin(b), dz * 0.3 + dx * Math.cos(b)];
      out.corner(p, n, barkDark); out.corner(end, n, bark); out.corner(q, n, barkDark);
    }
  }
  return out.geometry();
}

/* The lobes of a broad crown, each [its middle, its radii, its sides, its rings, its salt] (lobe). The first tops the trunk; the
   others stand round it, each lower than it by its own measure and far enough out that its own top shows from above. A phone's
   crown has fewer, of fewer sides. */
export const broadLobes = (phone) => phone
  ? [
    [[0.03, 0.885, 0.03], [0.5, 0.115, 0.48], 7, 2, 61], [[-0.5, 0.83, 0.26], [0.45, 0.085, 0.43], 5, 2, 62],
    [[0.44, 0.862, -0.36], [0.45, 0.085, 0.43], 5, 2, 63], [[0.12, 0.806, 0.54], [0.41, 0.075, 0.39], 5, 2, 64],
  ]
  : [
    [[0.03, 0.885, 0.0], [0.5, 0.115, 0.48], 9, 3, 61], [[-0.5, 0.83, 0.24], [0.45, 0.088, 0.43], 7, 3, 62],
    [[0.45, 0.862, -0.34], [0.45, 0.085, 0.43], 7, 3, 63], [[0.13, 0.806, 0.55], [0.41, 0.075, 0.4], 7, 2, 64],
    [[-0.19, 0.846, -0.54], [0.41, 0.085, 0.39], 7, 2, 65], [[0.58, 0.83, 0.2], [0.36, 0.07, 0.36], 6, 2, 66],
  ];

/* A broad-crowned tree, as a stone pine grows: a trunk that bends a little and forks high up into boughs that fan out and up, each
   holding a lobe of leaves, the lobes at heights of their own round a dome at the top, so the crown is an umbrella with an outline
   of its own from every side, a canopy of round tops from above, and the sky shows between its boughs. */
export function broadGeometry(phone) {
  const out = shape(), bark = rgb(0x86694f), barkDark = rgb(0x4d3b2e);
  const sides = phone ? 5 : 6, fork = [0.035, 0.685, 0.01];
  limb(out, [{ at: [0, 0, 0], r: TRUNK_FOOT }, { at: [0, 0.16, 0], r: 0.14 }, { at: [-0.035, 0.42, 0.02], r: 0.115 }, { at: fork, r: 0.085 }].filter((_, k) => !phone || k !== 2), sides, barkDark, bark);
  const leaf = { rough: LOBE_ROUGH, heart: [0.04, 0.84, 0], span: [1, 0.16, 1], round: 0.3, under: rgb(0x26331b), flank: rgb(0x46592a), over: rgb(0x8a9c4a), low: 0.78, high: 1 };
  const lobes = broadLobes(phone);
  lobes.forEach(([at, rad, around, rings, salt], k) => lobe(out, at, rad, around, rings, salt, leaf, { belly: !phone, top: k === 0 ? 1 : null }));
  /* The trunk's own top goes on up into the first lobe, and a bough from the fork out and up into each of the others. */
  limb(out, [{ at: fork, r: 0.075 }, { at: [0.05, lobes[0][0][1] - 0.01, 0.0], r: 0.035 }], 3, bark, bark);
  for (const [at] of lobes.slice(1)) {
    const rings = [{ at: [fork[0], BASE_FRAC + 0.006, fork[2]], r: 0.06 }, { at: [at[0] * 0.5, at[1] - 0.075, at[2] * 0.5], r: 0.042 }, { at: [at[0] * 0.92, at[1] - 0.008, at[2] * 0.92], r: 0.02 }];
    limb(out, phone ? [rings[0], rings[2]] : rings, 3, bark, bark);
  }
  return out.geometry();
}

/* ---------- the meshes ---------- */

/* The side of the squares the trees are sorted into for the walk and its camera, so a frame tries the few trees near a place. */
export const SQUARE = 30;
/* Of the stage's glow that level ground at its foot would take, a tree takes this share (island.js takesPool): its bark and leaves
   are paler than the turf, and the ground at its foot may slope away from the stage, so with less than a half it is never the
   brighter of the two. */
export const GLOW_SHARE = 0.25;

/* What a walk and its camera keep clear of. `trunks(x, z, r)` is the trees whose feet stand in the squares within `r` m of a
   place, each with its foot's `x` and `z`, in an array that is the same one every time (modes.js).
   The walk's camera (avatar.js) hangs on a boom whose length no tree changes: a tree moves the camera only a little at a time,
   level round its trunk and down under its crown, so the view never cuts. `room` is how far the camera keeps from bark and
   leaves, what its near plane needs.
   `slide(p, room, toward)` moves the point `p` level out of each trunk it stands in, to `room` m outside the trunk's widest at
   the point's own height, where the trunk's lean has carried it; so a camera whose way a trunk stands in slides round it as a
   walker does. One that only slid would stop dead behind a trunk that stood square in its way; so where it is going on past the
   trunk, to `toward`, it goes round by as far as the trunk stopped it, on the side `toward` lies. A trunk may stand between the
   camera and the bear for a moment.
   `ceiling(x, y, z, room)` is how high a camera at (x, z), now at `y`, may stand for the crowns: `room` m under a crown's base
   beneath it, and a metre higher for each metre the place is outside the crown's circle, so a camera coming up to a crown has
   come down under it by the time it is there, and rises as it leaves; Infinity where no crown is that near. Every crown's base
   is CROWN_BASE m over the highest ground under it, so the ceiling is over what the camera needs over the ground (avatar.js).
   A frame makes nothing: the point and its room are held here for the two that try each tree. */
function keepOuts(spots) {
  const grid = squares(SQUARE), feet = [];
  let low = Infinity;
  for (const { x, y, z, wide, lean, reach, base } of spots) {
    grid.add(x, z, { x, z, foot: y - SUNK, lean, r: wide * TRUNK_FOOT, reach, base });
    low = Math.min(low, base);
  }
  const foot = (tree) => { feet.push(tree); };
  let p = null, room = 0, toward = null, px = 0, pz = 0, top = Infinity;
  const round = (t) => {
    /* The trunk's middle at the point's height, or at the highest the point may stand under its crown. */
    const up = Math.min(p.y, t.base - room) - t.foot, cx = t.x + t.lean[0] * up, cz = t.z + t.lean[1] * up, r = t.r + room;
    let dx = p.x - cx, dz = p.z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= r) return;
    /* Right on the trunk's middle there is no line out from it: it steps out along x. */
    if (d < 1e-9) { dx = 1; dz = 0; }
    let turn = Math.atan2(dz, dx);
    if (toward) {
      const tx = toward.x - cx, tz = toward.z - cz;
      if (tx * tx + tz * tz > r * r) turn += ((r - d) / r) * (dx * tz - dz * tx < 0 ? -1 : 1);
    }
    p.x = cx + r * Math.cos(turn); p.z = cz + r * Math.sin(turn);
  };
  const lower = (t) => { top = Math.min(top, t.base - room + Math.max(0, Math.hypot(px - t.x, pz - t.z) - t.reach)); };
  /* The furthest a trunk's keep-out reaches from its foot: its widest, and its lean by its crown's base. */
  const out = trunkOut(CROWN_R[1], LEAN, (TALL[1] + SUNK) * BASE_FRAC);
  return {
    trunks(x, z, r) { feet.length = 0; grid.some(x, z, r, foot); return feet; },
    slide(point, by, to = null) { p = point; room = by; toward = to; grid.some(p.x, p.z, out + by, round); },
    /* A crown lowers the ceiling under `y` only from nearer than its reach and as far again as `y` is over its base less `room`. */
    ceiling(x, y, z, by) { px = x; pz = z; room = by; top = Infinity; grid.some(x, z, CROWN_R_MAX + Math.max(0, y - low + by), lower); return top; },
  };
}

/* Builds the trees at `spots` (placeTrees): the pines as one instanced mesh and the broad-crowned as another, of one material, which
   `lit(material, stands)` has take the stage's glow as a thing that stands on the ground does (island.js takesPool). Nothing moves
   them once they are built. Returns `count`; `meshes`; and `trunks`, `slide` and `ceiling`, what the walk and its camera keep clear
   of (keepOuts). */
export function buildTrees(scene, spots, { lit, phone }) {
  const dummy = new THREE.Object3D(), turn = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const material = lit(new THREE.MeshLambertMaterial({ vertexColors: true }), { sunk: SUNK, share: GLOW_SHARE });
  const meshes = [];
  for (const [kind, geometry] of [["pine", pineGeometry], ["broad", broadGeometry]]) {
    const mine = spots.filter((s) => s.kind === kind);
    if (mine.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry(phone), material, mine.length);
    mine.forEach(({ x, y, z, tall, wide, turn: by, lean, tint: hue }, k) => {
      dummy.position.set(x, y - SUNK, z);
      /* Turned its own way, then leaned: toward [lean] by its length, about the level line square to it. */
      const by2 = Math.hypot(lean[0], lean[1]);
      dummy.quaternion.setFromAxisAngle(axis.set(lean[1], 0, -lean[0]).normalize(), by2).multiply(turn.setFromAxisAngle(up, by));
      /* A crown is as wide as its tree's `wide` one way and up to an eighth narrower the other. */
      dummy.scale.set(wide, tall + SUNK, wide * (0.87 + 0.13 * hue));
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      /* Each a shade of its own, and from a yellower green to a bluer one. */
      const shade = 0.86 + 0.28 * ((hue * 7) % 1);
      mesh.setColorAt(k, tint.setRGB(shade * (1.08 - 0.16 * hue), shade, shade * (0.88 + 0.2 * hue)));
    });
    /* An instanced mesh is culled by its geometry's bounds, one tree's; the trees stand all over the island. */
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { count: spots.length, meshes, ...keepOuts(spots) };
}
