/* eslint-disable */
import * as THREE from "three";
import { outside } from "./collide.js";
import { chance } from "./flora.js";
import { CAVES, height, STAGE, TEST_POSES, TRAILHEAD } from "./ground.js";
import { FEATHER, offTracks, RING } from "./island.js";
import { postPose } from "./pose.js";
import { onCrowdGround } from "./seats.js";

/* The trees: groves of tall pines and broad-crowned trees between the landmarks, so the island has an outline against the sky. All
   of one kind are one instanced mesh, so the trees cost two draw calls however many stand. A trunk is solid to a walk (modes.js) and
   to the walk's camera, and so is a crown to that camera (boom.js); every other camera's way is kept clear of them when they are
   placed. A tree stands on the island's own height (ground.js), which a walk and its camera reckon by, with its foot sunk under it:
   the ground's mesh lies up to 0.7 m off that height on a phone's coarser grid, and the sunk foot covers it. */

/* A tree stands TALL m over the ground, its foot SUNK m under it, since on a slope the ground falls away under its lower side. Its
   crown is the upper part of it, from BASE_FRAC of the way up from its foot, and CROWN_R m across its half; and there are CROWN_BASE m
   of air under a crown wherever a walker can stand below it, so a bear walks under any crown with its head 1.65 m clear, and the walk's
   camera's boom starts 2.9 m under it. A tree leans up to LEAN rad, and the wind moves a crown's top SWAY m to either side, so no part
   of a crown is ever further than CROWN_R_MAX m from its tree's foot. */
export const SUNK = 1.6, TALL = [11, 18], CROWN_BASE = 6.5, BASE_FRAC = 0.66;
export const CROWN_R = [2.8, 4.0], LEAN = 0.04, SWAY = 0.25, CROWN_R_MAX = 5;
/* How far a tree's foot keeps from the setlist's path, from the bears' line, from a landmark's outline, from the crowd's ground, from
   the stage's centre and from a cave's; from the tracks' edges and inside the ring road; from every place the camera that walks with
   the bears stands (EYE_ROOM); and from each other. A view (cameraWays) is kept clear to VIEW_HALF m either side of its line, which
   is 4 m of air beside the widest crown, and a camera's sight of a bear, or of a landmark as its song begins, to SIGHT_HALF m, a
   crown's reach. */
export const PATH_ROOM = 9, LINE_ROOM = 8, LANDMARK_ROOM = 6, CROWD_ROOM = 8, STAGE_ROOM = 30, CAVE_ROOM = 13.5 + 4;
export const TRACK_ROOM = 2, RING_ROOM = 3, EYE_ROOM = 6.5, VIEW_HALF = 4 + CROWN_R_MAX, SIGHT_HALF = CROWN_R_MAX, MIN_APART = 6.5;
/* A tree stands where the land's normal is no lower than NY_MIN, which takes in the stony slopes a tuft does not grow on; a steeper
   slope would ask for a taller tree than any is. One place is tried in each square of CELL m. TARGET is how many trees a tier draws. */
export const NY_MIN = 0.85, CELL = 6, TARGET = { desktop: 100, tv: 75, phone: 45 };
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
export const GROVE_CORE = 0.7, LONE = 0.2;
/* A crown's lowest corner may sit this far under BASE_FRAC of its tree's height: a lean lowers its downwind rim, and the ground under
   it is read at a few places, not all. And how far past a crown's reach the ground is read for the air under it, so the boom's foot
   is as far from a crown beside it as from one overhead. */
export const DROP = 0.3, UNDER = 1.5;
/* The way the wind blows across the island, [x, z]: the crowns sway along it and the trees lean down it. */
const WIND = [0.86, 0.51];
/* The bears walk this far apart on their line (main.js). */
const GAP = 7;

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

/* Points [x, z] by the square of `square` m each lies in, so a place is tried against the few points near it. `within(x, z, r)` is
   whether any point lies nearer than `r`; `add` takes one more, with a number of its own, which `each(x, z, r, see)` hands back with
   every point in the squares within `r`. */
function index(points, square) {
  const cells = new Map(), cell = (v) => Math.floor(v / square), key = (i, j) => i * 4096 + j;
  const add = (x, z, value = 0) => {
    const k = key(cell(x), cell(z));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(x, z, value);
  };
  for (const [x, z, value] of points) add(x, z, value);
  const each = (x, z, r, see) => {
    for (let i = cell(x - r); i <= cell(x + r); i++) for (let j = cell(z - r); j <= cell(z + r); j++) {
      const list = cells.get(key(i, j));
      if (!list) continue;
      for (let k = 0; k < list.length; k += 3) if (see(list[k], list[k + 1], list[k + 2])) return true;
    }
    return false;
  };
  return { add, each, within: (x, z, r) => each(x, z, r, (px, pz) => (x - px) ** 2 + (z - pz) ** 2 < r * r) };
}

/* How far a point lies from the line between two others. */
function fromSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(dx * dx + dz * dz, 1e-9));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/* Views ({ from: [x, z], to: [x, z], half }) by the squares each passes within `half` of, so a place is tried against the few views
   near it. `crosses(x, z)` is whether the place lies within a view's `half` of its line. */
function corridors(views, square = 16) {
  const cells = new Map(), cell = (v) => Math.floor(v / square), key = (i, j) => i * 4096 + j;
  for (const view of views) {
    const { from: [ax, az], to: [bx, bz], half } = view;
    for (let i = cell(Math.min(ax, bx) - half); i <= cell(Math.max(ax, bx) + half); i++) for (let j = cell(Math.min(az, bz) - half); j <= cell(Math.max(az, bz) + half); j++) {
      /* Only the squares the view comes near: its line's distance from a square's middle, less the square's half diagonal. */
      if (fromSegment((i + 0.5) * square, (j + 0.5) * square, ax, az, bx, bz) > half + square * 0.7072) continue;
      const k = key(i, j);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(view);
    }
  }
  return {
    crosses(x, z) {
      const list = cells.get(key(cell(x), cell(z)));
      return list ? list.some(({ from, to, half }) => fromSegment(x, z, from[0], from[1], to[0], to[1]) < half) : false;
    },
  };
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
  /* The opening's descent comes straight down from DESCENT_FROM m over the island's middle to one of those eyes (main.js), so it
     is as low as a tree only near the eye: no tree stands within a crown's reach of the part of that line that is lower than the
     tallest tree its place could grow. */
  underDescent: (x, z, ctx) => {
    const top = height(x, z) + TALL[1] + 1;
    return ctx.eyes.each(x, z, DESCENT_NEAR, (ex, ez, ey) => {
      const from = (DESCENT_FROM - top) / (DESCENT_FROM - ey);
      return from < 1 && fromSegment(x, z, ex * from, ez * from, ex, ez) < CROWN_R_MAX;
    });
  },
};
/* The descent starts this high over the island's middle (main.js). It is lower than any tree only within DESCENT_NEAR m of the eye
   it ends at: the tallest tree on the highest ground tops out under 50 m, where the line has 0.31 of its way to go, and no eye
   stands further than 126 m from the middle. */
const DESCENT_FROM = 140, DESCENT_NEAR = 0.31 * 126 + CROWN_R_MAX;

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

/* Where the trees stand: at most `count` of them, each { x, y, z, tall, wide, turn, lean, kind, tint, reach, base, top }. `loop` is the
   setlist's path and `line` the bears' line, as points [x, z] no more than 2 m apart; `landmarks` each { x, z, rot, poly }, where one
   stands, how it is turned and its outline from above in its own frame (path.js outline); `eyes` and `views` what the cameras need
   kept clear (cameraWays).
   One place is tried in each square of CELL m, in an order shuffled by the squares' own numbers, and kept where the groves grow and
   no rule forbids it; so the trees of a tier that draws fewer are the first of a tier's that draws more, and the same on every visit.
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
  for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) cells.push([chance(a, b, 0), a, b]);
  cells.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const spots = [];
  for (const [, a, b] of cells) {
    if (spots.length >= count) break;
    const x = (a + 0.1 + 0.8 * chance(a, b, 1)) * CELL, z = (b + 0.1 + 0.8 * chance(a, b, 2)) * CELL;
    const { thick, pines } = groves(x, z);
    if (chance(a, b, 3) >= Math.max(thick, LONE)) continue;
    if (rules.some((rule) => rule(x, z, ctx))) continue;
    const y = height(x, z), wide = CROWN_R[0] + (CROWN_R[1] - CROWN_R[0]) * chance(a, b, 7), reach = wide + CROWN_R_MAX - CROWN_R[1];
    /* The height that puts the crown's lowest corner CROWN_BASE m over the highest ground under it. */
    const need = (groundUnder(x, z, reach) + CROWN_BASE + DROP - (y - SUNK)) / BASE_FRAC - SUNK;
    const tall = Math.max(TALL[0] + (TALL[1] - TALL[0]) * chance(a, b, 6), need);
    if (tall > TALL[1]) continue;
    /* It leans down the wind, give or take, by a share of LEAN. */
    const way = Math.atan2(WIND[1], WIND[0]) + 1.8 * (chance(a, b, 10) - 0.5), lean = LEAN * (0.25 + 0.75 * chance(a, b, 11));
    ctx.trees.add(x, z);
    spots.push({
      x, y, z, tall, wide, turn: 2 * Math.PI * chance(a, b, 5), lean: [lean * Math.cos(way), lean * Math.sin(way)],
      kind: chance(a, b, 8) < pines ? "pine" : "broad", tint: chance(a, b, 9),
      reach, base: y - SUNK + (tall + SUNK) * BASE_FRAC - DROP, top: y + tall + 0.1,
    });
  }
  return spots;
}

/* What the cameras that fly the island need kept clear of trees, for placeTrees. `line` is the bears' line (path.js), `height` the
   ground's, and `stands` where the visitor stands by each landmark to look at it, each { x, z, to: [x, z], d }: the stand (path.js
   nearStand), the landmark's place and how far along the line the bears stand as its song begins.
   `eyes` are the places [x, z, y] the camera that walks with the bears stands at (pose.js), for a desktop and a phone and five, three
   and one bears, the lead bear every 2 m along the line. `views` are the lines of sight, each { from, to, half }: from each of those
   eyes to each bear and the visitor's; from lean-back's crane, 14 m behind the visitor's bear on the line, to the bears and to where it
   looks; from behind each test pose (ground.js) to the stage; from the summit to the trailhead, as lean-back looks under reduced
   motion; from 20 m behind each stand, where a phone's boom hangs, to its landmark and BEHIND m past it, so a landmark is seen
   whole with nothing close behind it; and from that camera and the crane, as a song begins and the beam stands on its landmark, to
   the landmark and BACKDROP m past it, so no tree stands behind the beam in the opening or at any song's start. */
const BEHIND = 10, BACKDROP = 24;
export function cameraWays({ line, height, stands = [] }) {
  const eyes = [], views = [], at = (d) => { const p = line.at(d); return [p.x, p.z]; };
  for (let d = 0; d < line.length; d += 2) {
    for (const phone of [false, true]) for (const count of [5, 3, 1]) {
      const { pos } = postPose({ third: true, phone, bearD: d, count, gap: GAP, line, height, keepInView: () => 0 }, 0, 0);
      eyes.push([pos.x, pos.z, pos.y]);
      for (let k = 0; k <= count; k += 1) views.push({ from: [pos.x, pos.z], to: at(d - k * GAP), half: SIGHT_HALF });
    }
    /* The crane, `d` m along: the visitor's bear 14 m on, the bears each GAP m further, and its look 28 m on. */
    for (let k = 2; k <= 7; k++) views.push({ from: at(d), to: at(d + k * GAP), half: SIGHT_HALF });
  }
  for (const pose of Object.values(TEST_POSES)) {
    views.push({ from: [pose.x + 22 * Math.sin(pose.heading), pose.z + 22 * Math.cos(pose.heading)], to: STAGE, half: VIEW_HALF });
  }
  views.push({ from: [0, 0], to: TRAILHEAD, half: VIEW_HALF });
  /* The point `past` m beyond `to` on the line from `from`. */
  const beyond = (from, to, past) => { const dx = to[0] - from[0], dz = to[1] - from[1], far = Math.hypot(dx, dz) || 1; return [to[0] + (dx / far) * past, to[1] + (dz / far) * past]; };
  for (const { x, z, to, d } of stands) {
    views.push({ from: beyond(to, [x, z], 20), to: beyond([x, z], to, BEHIND), half: VIEW_HALF });
    if (d === undefined) continue;
    /* With all the bears a tier draws: a desktop's and a TV's five, a phone's three. */
    for (const [phone, count] of [[false, 5], [true, 3]]) {
      const { pos } = postPose({ third: true, phone, bearD: d, count, gap: GAP, line, height, keepInView: () => 0 }, 0, 0);
      for (const from of [[pos.x, pos.z], at(d - count * GAP - 14)]) views.push({ from, to: beyond(from, to, BACKDROP), half: SIGHT_HALF });
    }
  }
  return { eyes, views };
}

/* The trunks by where they stand, for what lies on the land (island.js): `near(x, z, r)` is whether one stands within `r` m. */
export function trunkIndex(spots) {
  const trunks = index(spots.map(({ x, z }) => [x, z]), 8);
  return { near: trunks.within };
}

/* ---------- the shapes ---------- */

/* A shape is built in a frame of its own: y runs from 0 at the trunk's sunk foot to 1 at the crown's top, and x and z are in crown
   radii, so a tree's own height and width scale it. Every face is three corners of its own, each with a normal, a colour and how far
   the wind moves it (aSway: 0 on the trunk, and on the crown from 0.2 at its base to 1 at its top). */
function shape() {
  const position = [], normal = [], colour = [], sway = [];
  const swayAt = (y) => 0.2 + 0.8 * clamp01((y - BASE_FRAC) / (1 - BASE_FRAC));
  return {
    /* One corner: its place, its normal, its colour, and whether the wind moves it. */
    corner(p, n, c, moves) {
      position.push(p[0], p[1], p[2]);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      normal.push(n[0] / l, n[1] / l, n[2] / l);
      colour.push(c[0], c[1], c[2]);
      sway.push(moves ? swayAt(p[1]) : 0);
    },
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colour, 3));
      geo.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
      return geo;
    },
  };
}
const rgb = (hex) => new THREE.Color(hex).toArray();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const times = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/* A limb: a tube of `sides` sides through `rings`, each { at: [x, y, z], r }, open at both ends, which stand inside what it joins.
   Its colour runs from `dark` at its first ring to `pale` at its last. */
function limb(out, rings, sides, dark, pale, moves) {
  const ring = ({ at, r }) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * 2 * Math.PI, n = [Math.cos(a), 0, Math.sin(a)];
    return { p: [at[0] + n[0] * r, at[1], at[2] + n[2] * r], n };
  });
  for (let s = 0; s < rings.length - 1; s++) {
    const lower = ring(rings[s]), upper = ring(rings[s + 1]);
    const cl = mix(dark, pale, s / (rings.length - 1)), cu = mix(dark, pale, (s + 1) / (rings.length - 1));
    for (let k = 0; k < sides; k++) {
      const a = lower[k], b = lower[(k + 1) % sides], c = upper[(k + 1) % sides], d = upper[k];
      out.corner(a.p, a.n, cl, moves); out.corner(d.p, d.n, cu, moves); out.corner(c.p, c.n, cu, moves);
      out.corner(a.p, a.n, cl, moves); out.corner(c.p, c.n, cu, moves); out.corner(b.p, b.n, cl, moves);
    }
  }
}

/* A mass of leaves: a ball of `detail` (an icosahedron's faces each split so many times, or, under 0, an octahedron's) pulled into
   the radii `rad` round `at`, flatter underneath than on top, its corners in or out by up to `rough` of that, each by its own place so
   the corners that faces share move together. Its faces take the light as one soft round thing does, the whole crown's (`heart` its
   middle, `span` its radii): a share `round` of each corner's normal is the crown's. Its colour runs from `under` at `low` to `over`
   at `high`, mottled by the corner, and each face a shade of its own. */
function mass(out, at, rad, detail, rough, salt, { heart, span, round, under, over, low, high }) {
  const ball = detail < 0 ? new THREE.OctahedronGeometry(1, -detail) : new THREE.IcosahedronGeometry(1, detail), pos = ball.attributes.position;
  const corners = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), i1 = Math.round(x * 1000), i2 = Math.round(y * 1000) * 31 + Math.round(z * 1000);
    const k = 1 - rough + 2 * rough * chance(i1, i2, salt);
    const p = [at[0] + x * rad[0] * k, Math.min(1, at[1] + y * rad[1] * (y < 0 ? 0.55 : k)), at[2] + z * rad[2] * k];
    /* No corner of a crown stands further out than CROWN_REACH of its radius. */
    const far = Math.hypot(p[0], p[2]);
    if (far > CROWN_REACH) { p[0] *= CROWN_REACH / far; p[2] *= CROWN_REACH / far; }
    const own = [x / rad[0], y / rad[1], z / rad[2]], l = Math.hypot(...own);
    const whole = [(p[0] - heart[0]) / (span[0] * span[0]), (p[1] - heart[1]) / (span[1] * span[1]), (p[2] - heart[2]) / (span[2] * span[2])], w = Math.hypot(...whole) || 1;
    const c = times(mix(under, over, clamp01((p[1] - low) / (high - low))), 0.84 + 0.32 * chance(i1, i2, salt + 100));
    corners.push({ p, c, n: [(own[0] / l) * (1 - round) + (whole[0] / w) * round, (own[1] / l) * (1 - round) + (whole[1] / w) * round, (own[2] / l) * (1 - round) + (whole[2] / w) * round] });
  }
  for (let f = 0; f < corners.length; f += 3) {
    const shade = 0.94 + 0.12 * chance(f, salt, 41);
    for (const { p, n, c } of [corners[f], corners[f + 1], corners[f + 2]]) out.corner(p, n, times(c, shade), true);
  }
  ball.dispose();
}

/* A trunk's half-width at its foot, where it spreads into the ground, in crown radii: no part of a trunk, a pine's stubs among them,
   stands further from its middle line. And how far a crown's corners reach, in the same: a little under 1, which leaves the widest
   crown, leant and swaying, inside CROWN_R_MAX. */
const TRUNK_FOOT = 0.2, CROWN_REACH = 0.98;

/* A pine: a straight trunk, bare but for a few dead stubs, and a crown of tiers of boughs, each a cone whose rim droops in points and
   is closed underneath, since a walker under it looks up into it. A phone's has fewer tiers and sides. */
export function pineGeometry(phone) {
  const out = shape(), bark = rgb(0x7a5a44), barkDark = rgb(0x4a382c);
  const sides = phone ? 5 : 6;
  limb(out, [{ at: [0, 0, 0], r: 0.19 }, { at: [0, 0.16, 0], r: 0.135 }, { at: [0.02, 0.68, 0.01], r: 0.08 }, { at: [0.06, 0.94, 0], r: 0.02 }], sides, barkDark, bark, false);
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
      out.corner(top, [Math.cos(mid), up * 3, Math.sin(mid)], times(needle, shade), true);
      out.corner(b.p, nb, times(b.long ? tip : needle, shade), true);
      out.corner(a.p, na, times(a.long ? tip : needle, shade), true);
      /* Underneath, dark. */
      out.corner(hub, [0, -1, 0], needleDark, true);
      out.corner(a.p, [Math.cos(a.a) * 0.2, -1, Math.sin(a.a) * 0.2], times(needleDark, 1.3), true);
      out.corner(b.p, [Math.cos(b.a) * 0.2, -1, Math.sin(b.a) * 0.2], times(needleDark, 1.3), true);
    }
  });
  /* The stubs of boughs long dead, down the bare trunk. */
  for (const [y, a, long] of phone ? [] : [[0.52, 0.6, 0.105], [0.58, 3.9, 0.085], [0.63, 2.2, 0.1]]) {
    const dx = Math.cos(a), dz = Math.sin(a), r = 0.085, end = [dx * (r + long), y + 0.014, dz * (r + long)];
    const root = [0, 1, 2].map((k) => { const b = (k / 3) * 2 * Math.PI; return [dx * r * 0.6 - dz * 0.035 * Math.cos(b), y + 0.007 * Math.sin(b), dz * r * 0.6 + dx * 0.035 * Math.cos(b)]; });
    for (let k = 0; k < 3; k++) {
      const p = root[k], q = root[(k + 1) % 3], b = ((k + 0.5) / 3) * 2 * Math.PI, n = [dx * 0.3 - dz * Math.cos(b), 0.2 * Math.sin(b), dz * 0.3 + dx * Math.cos(b)];
      out.corner(p, n, barkDark, false); out.corner(end, n, bark, false); out.corner(q, n, barkDark, false);
    }
  }
  return out.geometry();
}

/* A broad-crowned tree, as a stone pine grows: a trunk that bends a little and forks high up into boughs that fan out and up, each
   holding a flat mass of leaves, the masses round a larger one at the top, so the crown is an umbrella with an outline of its own
   from every side and the sky shows between its boughs. */
export function broadGeometry(phone) {
  const out = shape(), bark = rgb(0x86694f), barkDark = rgb(0x4d3b2e);
  const sides = phone ? 5 : 6, fork = [0.035, 0.685, 0.01];
  limb(out, [{ at: [0, 0, 0], r: TRUNK_FOOT }, { at: [0, 0.16, 0], r: 0.14 }, { at: [-0.035, 0.42, 0.02], r: 0.115 }, { at: fork, r: 0.085 }].filter((_, k) => !phone || k !== 2), sides, barkDark, bark, false);
  const leaf = { heart: [0.04, 0.84, 0], span: [1, 0.16, 1], round: 0.7, under: rgb(0x2c3a1e), over: rgb(0x778c42), low: 0.76, high: 0.99 };
  /* Each mass: its middle, its radii, its detail and its salt. The first tops the trunk; the others stand round it. */
  const masses = phone
    ? [[[0.04, 0.895, 0.06], [0.66, 0.105, 0.62], -1, 61], [[-0.44, 0.855, 0.3], [0.5, 0.088, 0.46], 0, 62], [[0.42, 0.86, -0.36], [0.5, 0.088, 0.46], 0, 63]]
    : [[[0.04, 0.895, 0.0], [0.62, 0.105, 0.6], 1, 61], [[-0.47, 0.855, 0.24], [0.45, 0.088, 0.43], -1, 62], [[0.42, 0.862, -0.34], [0.46, 0.088, 0.44], -1, 63], [[0.14, 0.848, 0.53], [0.4, 0.08, 0.39], -1, 64], [[-0.2, 0.86, -0.52], [0.4, 0.082, 0.38], -1, 65]];
  for (const [at, rad, detail, salt] of masses) mass(out, at, rad, detail, 0.16, salt, leaf);
  /* The trunk's own top goes on up into the first mass, and a bough from the fork out and up into each of the others. */
  limb(out, [{ at: fork, r: 0.075 }, { at: [0.05, 0.86, 0.0], r: 0.035 }], 3, bark, bark, true);
  for (const [at] of masses.slice(1)) {
    const rings = [{ at: [fork[0], BASE_FRAC + 0.006, fork[2]], r: 0.06 }, { at: [at[0] * 0.5, at[1] - 0.075, at[2] * 0.5], r: 0.042 }, { at: [at[0] * 0.92, at[1] - 0.012, at[2] * 0.92], r: 0.02 }];
    limb(out, phone ? [rings[0], rings[2]] : rings, 3, bark, bark, true);
  }
  return out.geometry();
}

/* ---------- the meshes ---------- */

const f = (v) => v.toFixed(4);
/* The side of the squares the trees are sorted into for the walk's camera: its boom is 20 m on a phone and trails a run by a few
   more, and a crown reaches CROWN_R_MAX past its tree, so the nine squares round the visitor hold every tree the boom can meet. */
export const SQUARE = 30;
/* The camera keeps this far from a trunk's bark: its near plane, 0.5 m (main.js), and a little more, so it never looks into one. */
export const NEAR = 0.6;

/* Builds the trees at `spots` (placeTrees): the pines as one instanced mesh and the broad-crowned as another. `lit(material)` has a
   material take the light the ground takes (the stage's glow, island.js). Returns `count`; `meshes`; `wind(time)`, which sways the
   crowns at a time; and `columns(x, z, into)`, which pushes onto `into` what the walk's camera keeps out of near (x, z): for each tree
   there a column for its trunk and one, with a `base`, for its crown (collide.js enterColumn). The same objects every time, so a
   frame makes nothing. */
export function buildTrees(scene, spots, { lit, phone }) {
  const wind = { value: 0 };
  const dummy = new THREE.Object3D(), turn = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const meshes = [];
  for (const [kind, geometry] of [["pine", pineGeometry], ["broad", broadGeometry]]) {
    const mine = spots.filter((s) => s.kind === kind);
    if (mine.length === 0) continue;
    const mat = lit(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const litCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      litCompile(shader);
      shader.uniforms.uWind = wind;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uWind;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
        /* The tree's root is its instance's place. One wind: the same way in the world for every tree, whichever way each is turned,
           so into each tree's own frame. The crown's top goes SWAY m at the most, when the two waves fall together; the slower is
           once in 10.5 s and the quicker once in 5.2 s. */
        vec3 root = instanceMatrix[3].xyz;
        float sway = aSway * aSway * ${f(SWAY)} * (0.75 * sin(uWind * 0.6 + root.x * 0.11 + root.z * 0.09) + 0.25 * sin(uWind * 1.2 + root.z * 0.3));
        vec2 wind = sway * vec2(${f(WIND[0])}, ${f(WIND[1])}), ax = instanceMatrix[0].xz, az = instanceMatrix[2].xz;
        transformed.xz += vec2(dot(wind, ax) / dot(ax, ax), dot(wind, az) / dot(az, az));`);
    };
    const mesh = new THREE.InstancedMesh(geometry(phone), mat, mine.length);
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

  const cells = new Map(), cell = (v) => Math.floor(v / SQUARE), key = (i, j) => i * 4096 + j;
  for (const { x, y, z, tall, wide, lean, reach, base, top } of spots) {
    const k = key(cell(x), cell(z));
    if (!cells.has(k)) cells.set(k, []);
    /* The trunk's column takes in its foot's width, as far as its lean carries it by where its crown starts, and NEAR. */
    const r = TRUNK_FOOT * wide + Math.hypot(lean[0], lean[1]) * (tall + SUNK) * BASE_FRAC + NEAR;
    cells.get(k).push({ x, z, r, top }, { x, z, r: reach, base, top });
  }
  function columns(x, z, into) {
    for (let i = cell(x) - 1; i <= cell(x) + 1; i++) for (let j = cell(z) - 1; j <= cell(z) + 1; j++) {
      const list = cells.get(key(i, j));
      if (list) for (let k = 0; k < list.length; k++) into.push(list[k]);
    }
    return into;
  }
  return { count: spots.length, meshes, columns, wind: (time) => { wind.value = time; } };
}
