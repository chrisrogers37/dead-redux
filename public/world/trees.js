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
export const NY_MIN = 0.85, CELL = 6, TRIES = 3, TARGET = { desktop: 75, tv: 75, phone: 45 };
/* The groves, each [x, z, r, pines]: of the trees within `r` m of (x, z), the share `pines` are pines and the rest broad-crowned,
   so the island has pine woods and broad-crowned groves. Where a tree stands is not theirs to say: a wood grows wherever the rules
   below leave room and it spoils no view, in the island's three quarters between the path's arms and at its north-east rim, with
   open ground along the path. A tree outside every grove is a pine, and so are the few by the stage, at the north-east rim: one
   standing by itself reads as a tree from far off, where a broad-crowned one alone is a bare stick with a tuft. */
export const GROVES = [
  [-46, 84, 23, 0.85], [-82, 38, 26, 0.8], [-44, 42, 14, 0.2],
  [32, 64, 22, 0.1], [66, 38, 22, 0.3], [18, 24, 11, 0],
  [-62, -40, 25, 0.85], [-28, -64, 17, 0.25], [-24, -22, 14, 0.1],
  [38, -96, 20, 0.9], [98, -38, 10, 1],
];
/* A crown's lowest corner may sit this far under BASE_FRAC of its tree's height: a lean lowers its downwind rim, and the ground under
   it is read at a few places, not all. And how far past a crown's reach the ground is read for the air under it. */
export const DROP = 0.3, UNDER = 1.5;
/* The way the wind blows across the island, [x, z]: the trees lean down it. */
const WIND = [0.86, 0.51];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/* The share of pines among the trees at a place: that of the grove it is deepest in, by the grove's own measure, and all of them
   outside every grove. */
export function grove(x, z) {
  let deep = 0, pines = 1;
  for (const [gx, gz, r, share] of GROVES) {
    const d = 1 - Math.hypot(x - gx, z - gz) / r;
    if (d > deep) { deep = d; pines = share; }
  }
  return pines;
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

/* Whether a place lies in a view ({ from: [x, z], to: [x, z], half, spread }): within its half-width of its line, which is `half` m
   at `from` and `spread` m more for each metre on toward `to`, so a view may widen as a sight does with distance. */
function inside({ from: [ax, az], to: [bx, bz], half, spread = 0 }, x, z) {
  const dx = bx - ax, dz = bz - az, long = dx * dx + dz * dz, t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(long, 1e-9));
  return Math.hypot(x - ax - t * dx, z - az - t * dz) < half + spread * t * Math.sqrt(long);
}

/* Views by the squares each passes within its widest of, so a place is tried against the few views near it. `crosses(x, z)` is
   whether the place lies in a view; `worst(x, z)` what the worst of the views it lies in costs (below). */
function corridors(views, side = 16) {
  const grid = squares(side);
  for (const view of views) {
    const { from: [ax, az], to: [bx, bz], half, spread = 0 } = view, most = half + spread * Math.hypot(bx - ax, bz - az);
    for (let i = grid.cell(Math.min(ax, bx) - most); i <= grid.cell(Math.max(ax, bx) + most); i++) for (let j = grid.cell(Math.min(az, bz) - most); j <= grid.cell(Math.max(az, bz) + most); j++) {
      /* Only the squares the view comes near: its line's distance from a square's middle, less the square's half diagonal. */
      if (fromSegment((i + 0.5) * side, (j + 0.5) * side, ax, az, bx, bz) <= most + side * 0.7072) grid.put(i, j, view);
    }
  }
  let worst = 0, px = 0, pz = 0;
  const weigh = (view) => { if (view.cost > worst && inside(view, px, pz)) worst = view.cost; };
  return {
    crosses: (x, z) => grid.some(x, z, 0, (view) => inside(view, x, z)),
    /* The highest `cost` of the views a place lies in, or 0. */
    worst: (x, z) => { worst = 0; px = x; pz = z; grid.some(x, z, 0, weigh); return worst; },
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
   A place is tried in each square of CELL m, in an order shuffled by the squares' own numbers, and kept where no rule forbids it,
   and then the squares' other places are tried (TRIES), a square growing one tree at the most. A view with a
   `cost` forbids nothing: a tree in it spoils the view, the more the higher the cost, so the places that spoil no view are filled
   first, in that order, and one that spoils a view only when no better place is left for the tier's count; each tree says what it
   spoils (`spoils`, 0 for nothing). So a show whose landmarks leave little room still has its trees, where they do least harm; so with the same cameras' ways a tier that draws fewer draws the first of a tier's that draws more, as a TV
   does of a desktop's, and the trees are the same on every visit.
   A tree is as tall as its place gives it, or taller where the ground under its crown stands higher than its foot: its crown starts
   CROWN_BASE m over the highest ground under it. `reach`, `base` and `top` bound its crown for the walk's camera: no part of it is
   further out than `reach` from (x, z), lower than `base` or higher than `top`. */
export function placeTrees({ count, loop = [], line = [], landmarks = [], eyes = [], views = [], groves = grove }) {
  const spoils = corridors(views.filter((view) => view.cost));
  const ctx = {
    path: index(loop, 12), line: index(line, 12), eyes: index(eyes, 8), views: corridors(views.filter((view) => !view.cost)), trees: index([], 8),
    landmarks: landmarks.map(({ x, z, rot, poly }) => ({ x, z, c: Math.cos(rot), s: Math.sin(rot), poly, reach: Math.max(0, ...poly.map(([px, pz]) => Math.hypot(px, pz))) })),
  };
  /* `crowded` is tried as the trees are placed; the others say where a tree could stand at all. */
  const { crowded, ...still } = RULES, rules = Object.values(still);
  const span = Math.ceil(RING / CELL), cells = [];
  /* Every square's first place, in the shuffled order, then every square's second, and so on: each try has numbers of its own. */
  for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) for (let nth = 0; nth < TRIES; nth++) cells.push([nth + chance(a, b, 20 * nth), a, b, 20 * nth]);
  cells.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  /* The places a tree could stand, in that order, each with what it would spoil. */
  const places = [];
  for (const [, a, b, salt] of cells) {
    const x = (a + 0.1 + 0.8 * chance(a, b, salt + 1)) * CELL, z = (b + 0.1 + 0.8 * chance(a, b, salt + 2)) * CELL;
    if (rules.some((rule) => rule(x, z, ctx))) continue;
    places.push({ a, b, x, z, spoils: spoils.worst(x, z) });
  }
  const spots = [];
  /* The places that spoil no view first; then, only while the tier's count is not met, those that spoil the least. */
  for (let spoiled = 0; spoiled <= SPOILS && spots.length < count; spoiled++) for (const { a, b, x, z, spoils: cost } of places) {
    if (spots.length >= count) break;
    if (cost !== spoiled || crowded(x, z, ctx)) continue;
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
      kind: chance(a, b, 8) < groves(x, z) ? "pine" : "broad", tint: chance(a, b, 9), spoils: cost,
      reach: crownOut(wide, lean, tall), base: y - SUNK + (tall + SUNK) * BASE_FRAC - DROP, top: y + tall + 0.1,
    });
  }
  return { spots, near: ctx.trees.within };
}

/* What a tier's cameras need kept clear of trees, for placeTrees. `line` is the bears' line (path.js), `height` the ground's, `phone`
   whether the tier is a phone's, `bears` how many bears it can show, its own number first and then each a downgrade leaves
   (quality.js), and `marks` the landmarks, each { x, z, rot, poly, d, stand }: where it stands, how it is turned and its outline from
   above in its own frame (path.js outline), how far along the line the bears stand as its song begins, and where the visitor stands
   to look at it ({ x, z }, path.js nearStand), if anywhere.
   `eyes` are the places [x, z, y] the camera that walks with the bears stands at (pose.js postPose), for each of those numbers of
   bears, the lead bear every 2 m along the line. `views` are ground a tree's foot keeps off, each { from, to, half, spread, cost }
   (corridors). A view with no `cost` no tree stands in: the sights from each of those eyes to each bear and the visitor's; from
   a settled ride's crane (pose.js CRANE) to the visitor's bear, to the bears and to where it looks; from behind each test pose
   (ground.js), where the walk's camera hangs on its boom (avatar.js) and BOOM_BACK m more, to the stage; from the summit to the
   trailhead, as a settled ride looks under reduced motion; from a boom's length behind each stand to its landmark and BEHIND m past
   it, so a landmark is seen whole; and BACKDROP m behind each landmark as its song begins and the beam stands on it, from the two
   cameras a visitor rides, the one that walks with the bears and the crane.
   The opening is the first of those: the first song's landmark, from the ridden cameras with each number of bears. No tree stands
   behind that landmark at all, on to the ring, within its own width as the camera sees it and BESIDE m to either side at its
   distance, widening as a sight does; none stands across the camera's sight of any landmark in its frame within RIDE_FAR m, the
   frame taken to reach FRAME rad to either side of where the camera looks; and none stands in either camera's frame within twice
   EDGE_NEAR m of it: nearer than EDGE_NEAR a tree is too tall for the frame, which cuts it off from foot to crown.
   The same is asked for every landmark and wherever the bears are, but a show's landmarks do not leave the room: behind every
   landmark to the ring, from its stand and from the ridden cameras as its song begins, and across every sight of a landmark from
   the ridden cameras, there is nowhere left to stand a wood. So those views have a `cost`, and a tree stands in one only when the
   island has no clear place left for it (placeTrees), the cheapest first:
   4, in a ridden camera's frame within EDGE_NEAR m of it, the bears every RIDE_STEP m of the line and at each song's start;
   3, across the sight of a landmark in a ridden camera's frame as a song begins;
   2, within CLOSE m behind a landmark from its stand or from a ridden camera as its song begins;
   1, further behind such a landmark, on past the ring, or across the sight of a landmark from a ridden camera between two songs'
      starts. */
const BOOM_BACK = 2, BEHIND = 10, BACKDROP = 24;
export const BESIDE = 2, CLOSE = 60, RIDE_FAR = 100, RIDE_STEP = 8, EDGE_NEAR = 16, FRAME = (phone) => (phone ? 0.42 : 0.8);
/* The most a view costs. */
export const SPOILS = 4;
export function cameraWays({ line, height, marks = [], phone = false, bears = [5] }) {
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
  /* A landmark as an eye at `from` sees it: how far off its middle stands, the way to it, and how wide it stands to either side of
     that sight, by the corners of its outline. */
  const seen = (mark, from) => {
    const dx = mark.x - from[0], dz = mark.z - from[1], far = Math.hypot(dx, dz) || 1, c = Math.cos(mark.rot), s = Math.sin(mark.rot);
    let wide = 0;
    for (const [px, pz] of mark.poly) wide = Math.max(wide, Math.abs(((px * c + pz * s) * dz - (pz * c - px * s) * dx) / far));
    return { far, wide, ux: dx / far, uz: dz / far };
  };
  /* Behind a landmark as the eye at `from` sees it, from the landmark on past the ring, the island's width on, so that all of it
     inside the ring is taken in however it widens: `near` is what a tree costs within CLOSE m past the landmark and `far` what
     one costs beyond. */
  const behind = (mark, from, near, far) => {
    const { far: off, wide, ux, uz } = seen(mark, from), spread = (wide + BESIDE) / off, to = (run) => [mark.x + ux * run, mark.z + uz * run];
    views.push({ from: to(0), to: to(CLOSE), half: wide + BESIDE + CROWN_R_MAX, spread, cost: near });
    views.push({ from: to(CLOSE), to: to(2 * RING), half: wide + BESIDE + CROWN_R_MAX + spread * CLOSE, spread, cost: far });
  };
  /* The two cameras a visitor rides, with the lead bear `d` m along the line and `count` bears: where each stands and where it
     looks. */
  const rides = (d, count) => {
    const pos = eye(d, count), crane = d - count * BEAR_GAP - CRANE.back;
    return [{ from: [pos.x, pos.z], to: at(d) }, { from: at(crane), to: at(crane + CRANE.ahead) }];
  };
  /* A ridden camera's frame for `near` m on from it: a tree there stands too tall for the frame, and its edge cuts it off. */
  const close = (from, look, cost, near = EDGE_NEAR) => ({ from, to: beyond(from, look, near - Math.hypot(look[0] - from[0], look[1] - from[1])), half: CROWN_R_MAX, spread: Math.tan(FRAME(phone)), cost });
  marks.forEach((mark, k) => {
    const to = [mark.x, mark.z];
    if (mark.stand) {
      const stand = [mark.stand.x, mark.stand.z];
      views.push({ from: beyond(to, stand, boomLength(phone)), to: beyond(stand, to, BEHIND), half: VIEW_HALF });
      behind(mark, stand, 2, 1);
    }
    for (const { from } of rides(mark.d, most)) views.push({ from, to: beyond(from, to, BACKDROP), half: SIGHT_HALF });
    /* The opening: nothing in a ridden camera's frame nearer than EDGE_NEAR, where the frame's edge would cut it off. */
    if (k === 0) for (const count of bears) for (const { from, to: look } of rides(mark.d, count)) views.push(close(from, look, 0, 2 * EDGE_NEAR));
    /* The opening's, with each number of bears; another song's, with the tier's own. */
    for (const count of k === 0 ? bears : [bears[0]]) for (const { from } of rides(mark.d, count)) behind(mark, from, k === 0 ? 0 : 2, k === 0 ? 0 : 1);
  });
  /* The sights of every landmark in a ridden camera's frame: from the opening's, as a song begins, and between. */
  const starts = new Map();
  for (let d = 0; d < line.length; d += RIDE_STEP) starts.set(d, 1);
  marks.forEach((mark, k) => starts.set(mark.d, k === 0 ? 0 : 3));
  for (const [d, cost] of starts) for (const count of cost === 0 ? bears : [bears[0]]) for (const { from, to } of rides(d, count)) {
    if (cost) views.push(close(from, to, SPOILS));
    const lx = to[0] - from[0], lz = to[1] - from[1], look = Math.hypot(lx, lz) || 1;
    for (const mark of marks) {
      const { far, wide, ux, uz } = seen(mark, from);
      if (far > RIDE_FAR || Math.acos(Math.max(-1, Math.min(1, (ux * lx + uz * lz) / look))) - Math.atan2(wide, far) > FRAME(phone)) continue;
      views.push({ from, to: [mark.x, mark.z], half: CROWN_R_MAX, spread: wide / far, cost });
    }
  }
  return { eyes, views };
}

/* ---------- the shapes ---------- */

/* A shape is drawn in metres for a tree of the middle sizes, REF_WIDE m across its crown's half and REF_TALL m from its sunk foot to
   its top, and kept in a frame of its own: y runs from 0 at the trunk's sunk foot to 1 at the crown's top, and x and z are in crown
   radii, so a tree's own height and width scale it. A corner's normal is kept as that frame needs it: three's instancing divides a
   normal by the instance's scale, which turns it back into the face's own. Every face is three corners of its own, each with a
   normal and a colour, and faces out, whichever way round its corners are handed in: away from the point `from` where one is
   given, the middle of the thing it is a face of, and else the way its corners' normals lean. */
export const REF_WIDE = 3.4, REF_TALL = 16.6;
/* The sizes every rule derives from, in those metres: how far out any corner stands, and where the crown starts. */
const REACH_M = CROWN_REACH * REF_WIDE, BASE_M = BASE_FRAC * REF_TALL;

const rgb = (hex) => new THREE.Color(hex).toArray();
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const times = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => times(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

function shape() {
  const position = [], normal = [], colour = [], leaf = [];
  const corner = ({ p, n, c }, green) => {
    position.push(p[0] / REF_WIDE, p[1] / REF_TALL, p[2] / REF_WIDE);
    const u = [n[0] * REF_WIDE, n[1] * REF_TALL, n[2] * REF_WIDE], l = Math.hypot(u[0], u[1], u[2]) || 1;
    normal.push(u[0] / l, u[1] / l, u[2] / l);
    colour.push(c[0], c[1], c[2], 1);
    leaf.push(green);
  };
  return {
    /* A face of three corners, each { p, n, c }, its colour shaded by `shade`; `green` if it is leaves. It faces the way its corners'
       normals do. */
    tri(a, b, c, shade = 1, green = false, from = null) {
      const face = cross(sub(b.p, a.p), sub(c.p, a.p));
      const out = from ? sub(times(add(add(a.p, b.p), c.p), 1 / 3), from) : add(add(a.n, b.n), c.n);
      const [p, q] = dot(face, out) < 0 ? [c, b] : [b, c];
      for (const v of [a, p, q]) corner(shade === 1 ? v : { ...v, c: times(v.c, shade) }, green);
    },
    position, normal, colour, leaf,
  };
}

/* A tube through `rings`, each { at: [x, y, z], r, c, rough }, of `sides` sides, open at both ends, which stand inside what it joins.
   Each ring is square to the tube's way there, or level with `level`, and turned by `across`, a way the tube never runs along, so a
   tube that bends does not twist. A ring's corners stand `r` m from its middle, each by its share in `rough` where it has one: the
   flutes of a root's flare. Each corner's colour is its ring's. */
function tube(out, rings, sides, { level = false, across = [1, 0, 0], spin = 0 } = {}) {
  const at = rings.map((ring, s) => {
    const t = level ? [0, 1, 0] : unit(sub(rings[Math.min(rings.length - 1, s + 1)].at, rings[Math.max(0, s - 1)].at));
    const side = unit(sub(across, times(t, dot(across, t)))), other = cross(side, t);
    return Array.from({ length: sides }, (_, k) => {
      const a = spin + (k / sides) * 2 * Math.PI, n = add(times(side, Math.cos(a)), times(other, Math.sin(a)));
      return { p: add(ring.at, times(n, ring.r * (ring.rough ? ring.rough[k] : 1))), n, c: ring.c };
    });
  });
  for (let s = 0; s < rings.length - 1; s++) for (let k = 0; k < sides; k++) {
    const a = at[s][k], b = at[s][(k + 1) % sides], c = at[s + 1][(k + 1) % sides], d = at[s + 1][k];
    out.tri(a, d, c); out.tri(a, c, b);
  }
}

/* The middle line of a level tube at height `y`: between the middles of the rings it lies between, or past its last. */
function middleAt(rings, y) {
  for (let s = 0; s < rings.length - 1; s++) if (y <= rings[s + 1].at[1]) return mix(rings[s].at, rings[s + 1].at, clamp01((y - rings[s].at[1]) / (rings[s + 1].at[1] - rings[s].at[1])));
  const { at } = rings[rings.length - 1];
  return [at[0], y, at[2]];
}

/* A cone of `sides` sides from a ring { at, r, c } up to its point { p, c }, with its underside closed where `closed`. */
function cone(out, ring, point, sides, closed, spin = 0) {
  const rim = Array.from({ length: sides }, (_, k) => {
    const a = spin + (k / sides) * 2 * Math.PI, n = [Math.cos(a), 0.6, Math.sin(a)];
    return { p: add(ring.at, [Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r]), n, c: ring.c };
  });
  const top = { p: point.p, n: [0, 1, 0], c: point.c };
  for (let k = 0; k < sides; k++) out.tri(top, rim[k], rim[(k + 1) % sides], 1, true, ring.at);
  if (closed) {
    const under = { p: add(ring.at, [0, -0.1, 0]), n: [0, -1, 0], c: times(ring.c, 0.5) };
    for (let k = 0; k < sides; k++) out.tri(under, { ...rim[k], n: [0, -1, 0] }, { ...rim[(k + 1) % sides], n: [0, -1, 0] }, 1, true, add(ring.at, [0, 0.3, 0]));
  }
}

/* A trunk's bark by its height `y` m, from `stops`, each [a height, a colour], dark at the foot: the same for the foot and the trunk
   over it, so the one runs into the other with no edge. */
const barkAt = (stops, y) => {
  for (let s = 0; s < stops.length - 1; s++) if (y <= stops[s + 1][0]) return mix(stops[s][1], stops[s + 1][1], clamp01((y - stops[s][0]) / (stops[s + 1][0] - stops[s][0])));
  return stops[stops.length - 1][1];
};

/* A trunk's foot: its rings from the sunk foot to over the ground, `r` m across its half there, fluted into ROOTS roots that spread
   into the ground and draw into the trunk, `trunk` m across its half, by FOOT_IN of its height, the flare bending in as a root's
   does. It stands as wide as its sunk foot to FOOT_TOP of the tree's height, which is within a third of a metre of the ground on any
   tree (the ground is SUNK of SUNK + TALL up it), and takes its bark's colour (`bark`, by height), darkest at the ground. Each
   root's reach is its own (`salt`). A phone's foot has five corners, three of them roots', and draws straight in from the sunk foot,
   with no ring at FOOT_TOP and no bend in its flare. */
export const FOOT_TOP = 0.1, FOOT_IN = 0.16, ROOTS = 5;
function foot(r, trunk, bark, salt, phone) {
  const sides = phone ? 5 : 2 * ROOTS, bend = (FOOT_TOP + FOOT_IN) / 2;
  /* A root's corner stands at the foot's whole width, by its own share of it, and the corner between two roots `deep` in from it. */
  const rough = (deep) => Array.from({ length: sides }, (_, k) => (phone ? 1 - (deep * [0, 0.26, 0.06, 0.3, 0.12][k]) / 0.38 : k % 2 === 0 ? 1 - 0.1 * chance(k, salt, 81) : 1 - deep));
  const ring = (y, half, deep) => ({ at: [0, y * REF_TALL, 0], r: half, c: bark(y * REF_TALL), rough: rough(deep) });
  return {
    sides,
    rings: [
      ring(0, r, 0.38),
      ...(phone ? [] : [ring(FOOT_TOP, r, 0.38), ring(bend, trunk + 0.3 * (r - trunk), 0.3)]),
      ring(FOOT_IN, trunk * 0.96, 0.12),
    ],
  };
}

/* The forms each kind is drawn in. A tree's form is FORMS numbers, each from 0 to 1, which its own seed gives it (formOf), and each
   moves the kind's shape its own way (drawPine, drawBroad): its asymmetry, the heights of its whorls or masses, which of them are
   full, the bend of its trunk, and the shade of its bark. */
export const FORMS = 7;
/* How far a trunk bends at the most, in metres: a pine's along its whole height, a broad-crowned tree's under its crown. */
export const BEND = { pine: 0.3, broad: 0.2 };
/* A trunk's bend at height `y` m, as a share of its most: next to none by a walker's head, most some two thirds of the way up, and
   back by the top, a pine's over its whole height, a broad-crowned tree's to its crown. */
const bendAt = (kind, y) => {
  const t = clamp01((y - SUNK) / ((kind === "pine" ? REF_TALL : BASE_M) - SUNK));
  return 1.727 * t * Math.sin(Math.PI * t);
};

/* How far down from its top a lobe's last ring stands, in rad: past its widest, so its rim tucks in under it. And how far a lobe's
   corners stand in or out of its radii. */
const TUCK = 1.85;
const LOBE_ROUGH = 0.14;
/* A mass of leaves or needles: a dome round `at`, in metres, `rad` its radii along the way `turn` (rad, from x toward z), up and
   across, of `sides` sides and `rings` rings under its top, the last of them tucked in under its widest and drooping unevenly, and
   closed underneath, where it bellies down a little. Its corners stand in or out by up to `rough` of its radii, each by its own
   number, none further from the tree's middle line than its reach and none lower than its crown's base. It takes the light as a
   round thing of its own does, a share `round` of each corner's normal being the whole crown's (`heart` its middle, `span` its
   radii), so a crown reads as one soft thing made of several. Its colour runs from `over` on its top, down its flanks to `flank` at
   its widest, and to `under` beneath, so that from above each mass shows its own round top and from below the crown is in its own
   shade; the lower a mass sits in the crown (`low` to `high` m), the deeper its colour; each corner mottled, each face a shade of its
   own. `top` moves the dome's top up to that height exactly. */
function lobe(out, at, rad, sides, rings, salt, { rough, heart, span, round, under, flank, over, low, high }, top = null, turn = 0) {
  const c = Math.cos(turn), s = Math.sin(turn), spin = ([x, y, z]) => [x * c - z * s, y, x * s + z * c];
  const corner = (u, k, drop, mottle) => {
    const p = add(at, spin([u[0] * rad[0] * k, (u[1] * k - drop) * rad[1], u[2] * rad[2] * k]));
    const far = Math.hypot(p[0], p[2]);
    if (far > REACH_M) { p[0] *= REACH_M / far; p[2] *= REACH_M / far; }
    p[1] = Math.max(p[1], BASE_M);
    const own = unit(spin([u[0] / rad[0], u[1] / rad[1], u[2] / rad[2]]));
    const whole = unit([(p[0] - heart[0]) / (span[0] * span[0]), (p[1] - heart[1]) / (span[1] * span[1]), (p[2] - heart[2]) / (span[2] * span[2])]);
    const tone = u[1] >= 0 ? mix(flank, over, u[1] ** 1.4) : mix(flank, under, Math.min(1, -3 * u[1]));
    const deep = 0.8 + 0.2 * clamp01((p[1] - low) / (high - low));
    return { p, c: times(tone, deep * (0.86 + 0.28 * mottle)), n: add(times(own, 1 - round), times(whole, round)) };
  };
  const apex = corner([0.08 * (chance(salt, 0, 71) - 0.5), 1, 0.08 * (chance(salt, 0, 72) - 0.5)], 1 - rough + 2 * rough * chance(salt, 0, 73), 0, chance(salt, 0, 74));
  if (top !== null) apex.p[1] = top;
  /* The rings, from just under the top out and down to the tuck, every other one turned half a side. */
  const ring = Array.from({ length: rings }, (_, j) => Array.from({ length: sides }, (_, i) => {
    const down = ((j + 1) / rings) * TUCK, turn = ((i + 0.5 * (j % 2) + 0.5 * (chance(i, j, salt) - 0.5)) / sides) * 2 * Math.PI;
    return corner([Math.sin(down) * Math.cos(turn), Math.cos(down), Math.sin(down) * Math.sin(turn)], 1 - rough + 2 * rough * chance(i, j, salt + 1), j === rings - 1 ? 0.25 * chance(i, j, salt + 2) : 0, chance(i, j, salt + 3));
  }));
  let face = 0;
  const tri = (a, b, c) => out.tri(a, b, c, 0.95 + 0.1 * chance(face++, salt, 41), true, at);
  for (let i = 0; i < sides; i++) tri(apex, ring[0][(i + 1) % sides], ring[0][i]);
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < sides; i++) {
    const upper = ring[j], lower = ring[j + 1], i1 = (i + 1) % sides, shift = j % 2 === 0 ? 0 : 1, l0 = lower[(i + shift) % sides], l1 = lower[(i + shift + 1) % sides];
    tri(upper[i], upper[i1], l0); tri(upper[i1], l1, l0);
  }
  /* Underneath: in the crown's own shade, facing down, and bellying down a little. */
  const rim = ring[rings - 1].map(({ p, n }) => ({ p, c: times(under, 1.35), n: [n[0] * 0.5, n[1] * 0.5 - 0.5, n[2] * 0.5] }));
  const belly = { p: [at[0], Math.max(BASE_M, Math.min(...rim.map(({ p }) => p[1])) - 0.2 * rad[1]), at[2]], c: under, n: [0, -1, 0] };
  for (let i = 0; i < sides; i++) tri(belly, rim[i], rim[(i + 1) % sides]);
}

/* A pine's bark: dark at its foot, warming up the trunk to the orange of an old pine's upper bark; and, with its form's last number,
   greyer and paler. Its needles: paler on each clump's top near its bough, mid toward its rim, dark underneath. */
const PINE = { bark: [[0, rgb(0x33271f)], [FOOT_TOP * REF_TALL, rgb(0x3d2f25)], [3.2, rgb(0x5f4535)], [7, rgb(0x7a5840)], [12, rgb(0x9a6743)]], grey: rgb(0x8a8076) };
const NEEDLES = { rough: 0.16, heart: [0, 13.6, 0], span: [3.0, 3.0, 3.0], round: 0.3, under: rgb(0x1c2e22), flank: rgb(0x44664a), over: rgb(0x6d8c55), low: 11, high: 16.6 };
/* A pine's whorls, each [its height in metres, its boughs, how far its boughs reach]: the lowest over the crown's base by as far as
   its clumps droop, and each shorter than the one under it, so the crown narrows to its leader. */
const PINE_WHORLS = [[13.0, 3, 2.9], [13.55, 3, 2.45], [14.1, 3, 2.0], [14.6, 3, 1.55], [15.05, 2, 1.1], [15.5, 2, 0.7]];
/* Two ways a pine's whorls stand at heights of their own, each in metres a whorl, at its form's second and third numbers. */
const PINE_WHORL_A = [0, 0.38, -0.25, 0.3, -0.22, 0.1], PINE_WHORL_B = [0, -0.22, 0.36, 0.22, -0.3, 0];
/* How steeply each whorl's clumps droop, in radians from level, on average from their boughs to their rims. */
const DROOP = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75];
/* A clump's corners across it, where along it its middle ones stand, and how it bows: down the more the further out (its height
   falls as the FAN_BOW-th power of the way out), down at its sides by FAN_SAG of its drop, and its rim drawn in at its sides. */
const FAN = 5, FAN_MID = 0.55, FAN_BOW = 1.3, FAN_SAG = 0.4, FAN_ROUND = 0.15;

/* A clump of needles at a bough's end, as a fan: from `x0` m out along `way` from `from` to a rim `x1` m out, widening to `wide` m
   either side, and drooping `drop` m by its rim. Its top is the needles' lit side and slopes out and down, so a walker under the
   crown sees it; its rim is ragged. Under it, from its edge up and in to a belly `thick` m under its top, it is in its own shade
   and faces down and in toward the trunk. None of it stands further from the tree's middle line than its reach or lower than its
   crown's base. Each face turns the way its corners' normals do, out of it. It gives back a point inside it, where its bough
   runs in. */
function fan(out, from, way, { x0, x1, wide, drop, thick }, salt) {
  const side = [-way[2], 0, way[0]];
  const surface = (f, s) => {
    const x = x0 + (x1 - x0) * f * (1 - FAN_ROUND * s * s), y = 0.5 * thick - drop * f ** FAN_BOW - FAN_SAG * drop * f * s * s;
    return add(from, add(times(way, x), add(times(side, s * wide * (0.3 + 0.7 * f)), [0, y, 0])));
  };
  const normalAt = (f, s) => unit(cross(sub(surface(f, s + 0.02), surface(f, s - 0.02)), sub(surface(Math.min(1, f + 0.02), s), surface(Math.max(0, f - 0.02), s))));
  const corner = (f, i, ragged) => {
    const s = -1 + (2 * i) / (FAN - 1), g = ragged ? f * (0.93 + 0.14 * chance(salt, i, 61)) : f, p = surface(g, s);
    if (ragged) p[1] -= 0.14 * drop * (chance(salt, i, 62) - 0.5);
    const far = Math.hypot(p[0], p[2]);
    if (far > REACH_M) { p[0] *= REACH_M / far; p[2] *= REACH_M / far; }
    p[1] = Math.max(p[1], BASE_M);
    const tone = mix(NEEDLES.over, NEEDLES.flank, clamp01((g - 0.35) * 1.5)), deep = 0.8 + 0.2 * clamp01((p[1] - NEEDLES.low) / (NEEDLES.high - NEEDLES.low));
    return { p, n: normalAt(Math.min(1, g), s), c: times(tone, deep * (0.86 + 0.28 * chance(salt, i, 63))) };
  };
  const apex = corner(0, (FAN - 1) / 2, false), mid = [], rim = [];
  for (let i = 0; i < FAN; i++) { mid.push(corner(FAN_MID, i, false)); rim.push(corner(1, i, true)); }
  const inward = unit(add(times(way, -0.5), [0, -1, 0])), belly = { p: add(surface(0.6, 0), [0, -thick, 0]), c: NEEDLES.under, n: inward };
  belly.p[1] = Math.max(BASE_M, belly.p[1]);
  const edge = [apex, mid[0], ...rim, mid[FAN - 1]].map(({ p, n }) => ({ p, c: times(NEEDLES.under, 1.35), n: unit(add(times(n, 0.3), times(inward, 0.7))) }));
  let face = 0;
  const tri = (a, b, c) => out.tri(a, b, c, 0.95 + 0.1 * chance(face++, salt, 41), true);
  for (let i = 0; i < FAN - 1; i++) { tri(apex, mid[i], mid[i + 1]); tri(mid[i], rim[i], rim[i + 1]); tri(mid[i], rim[i + 1], mid[i + 1]); }
  edge.forEach((e, i) => out.tri(belly, edge[(i + 1) % edge.length], e, 1, true));
  return times(add(surface(0.3, 0), times(add(apex.p, belly.p), 0.5)), 0.5);
}

/* A bough of a pine: a limb from the trunk's middle at `from`, out the way `turn` and into a clump of needles that starts some three
   tenths of its `long` m out, reaches a little past its end, widens as it goes, and droops by `droop`, its size `size` of a full one's. */
function bough(out, { from, turn, long, size, droop }, salt, bark) {
  const way = [Math.cos(turn), 0, Math.sin(turn)], x0 = 0.3 * long, x1 = 1.04 * long + 0.3, thick = 0.1 * long + 0.42;
  /* The drop, as far as the crown's base lets it. */
  const drop = Math.min(Math.tan(droop) * (x1 - x0), from[1] + 0.5 * thick - BASE_M - 0.05);
  const into = fan(out, from, way, { x0, x1, wide: (0.6 * long + 0.34) * size, drop, thick }, salt);
  tube(out, [{ at: from, r: 0.1, c: bark }, { at: into, r: 0.05, c: bark }], 3, { across: [-way[2], 0, way[0]] });
}

/* A phone's pine's crown: PINE_TIERS tiers of needles, each a cone from the trunk out and down to a rim of PINE_TIER_SIDES corners,
   the top one the leader. A tier's top is the needles' lit side and slopes out and down, as a bough's clump does; under it, the tier
   rises back in to the trunk, to three fifths of its drop under its top, so from beside it shows no flat lid. Its form's numbers, at
   1: the rims reach further on one side; the tiers stand at heights of their own, two ways; two sets of the rims' corners draw in,
   so each rim is notched its own way; and the trunk bends. Each corner of a rim reaches and droops by its own measure. */
const PINE_TIERS = [[13.6, 2.6, 2.7], [14.8, 2.2, 2.1], [15.8, 1.8, 1.55], [REF_TALL, 1.4, 1.0]], PINE_TIER_SIDES = 7;
function tiers(out, trunk, [reach, whorlA, whorlB, tuftA, tuftB]) {
  PINE_TIERS.forEach(([y0, drop, far], k) => {
    const y = k === PINE_TIERS.length - 1 ? y0 : y0 + 0.6 * (whorlA * PINE_WHORL_A[k + 1] + whorlB * PINE_WHORL_B[k + 1]);
    const top = middleAt(trunk, y), spin = 2.4 * k + 0.35 * whorlA - 0.3 * whorlB;
    const rim = Array.from({ length: PINE_TIER_SIDES }, (_, i) => {
      const turn = spin + (2 * Math.PI * (i + 0.3 * (chance(i, k, 54) - 0.5))) / PINE_TIER_SIDES, way = [Math.cos(turn), 0, Math.sin(turn)];
      const notch = (i + k) % 3 === 0 ? tuftA : (i + k) % 3 === 1 ? tuftB : 0;
      const r = far * (0.85 + 0.3 * chance(i, k, 55)) * (1 + 0.15 * reach * Math.cos(turn)) * (1 - 0.35 * notch), d = drop * (0.85 + 0.3 * chance(i, k, 56));
      const p = add(top, [way[0] * r, -d * (1 - 0.3 * notch), way[2] * r]);
      p[1] = Math.max(p[1], BASE_M);
      return { p, way, r, d, c: times(NEEDLES.flank, 0.9 + 0.2 * chance(i, k, 57)) };
    });
    const under = add(top, [0, -0.6 * drop, 0]), apex = { p: top, n: [0, 1, 0], c: NEEDLES.over };
    const inner = { p: under, n: [0, -1, 0], c: times(NEEDLES.flank, 0.55) }, lit = (q) => unit(add(times(q.way, q.d), [0, q.r, 0])), down = (q) => unit(add(times(q.way, 0.6 * drop - q.d), [0, -q.r, 0]));
    for (let i = 0; i < PINE_TIER_SIDES; i++) {
      const a = rim[i], b = rim[(i + 1) % PINE_TIER_SIDES];
      /* Each face turned out from a point inside the tier between its two corners: midway between its top and its underside, a
         third of the way out to them. */
      const half = times(add(a.p, b.p), 0.5), within = times(add(add(top, times(sub(half, top), 1 / 3)), add(under, times(sub(half, under), 1 / 3))), 0.5);
      out.tri(apex, { p: a.p, n: lit(a), c: a.c }, { p: b.p, n: lit(b), c: b.c }, 1, true, within);
      out.tri(inner, { p: a.p, n: down(a), c: times(a.c, 0.6) }, { p: b.p, n: down(b), c: times(b.c, 0.6) }, 1, true, within);
    }
  });
}

/* A pine: a trunk on a fluted foot that runs on up to its top through whorls of boughs at uneven heights, each whorl's boughs turned
   their own ways and reaching their own lengths, each ending in a drooping clump of needles, with sky between the whorls and between
   the clumps; and a leader at the top. Its form's numbers, at 1: its boughs reach further on one side and less on the other; its
   whorls stand at heights of their own, two ways; a third of its boughs, and another third, are small tufts near the trunk; its
   trunk bends; and its bark is greyer. A phone's trunk has fewer sides and carries tiers in place of boughs. */
function drawPine(phone, form) {
  const out = shape(), [reach, whorlA, whorlB, tuftA, tuftB, bend, grey] = form;
  const bark = (y) => mix(barkAt(PINE.bark, y), PINE.grey, 0.55 * grey);
  const at = (y) => [0.07, y, 0.03 + BEND.pine * bend * bendAt("pine", y)];
  const { sides, rings } = foot(0.19 * REF_WIDE, 0.135 * REF_WIDE, bark, 3, phone);
  /* The trunk, from inside the foot to just under the leader's point; a phone's runs on from the foot's own rings. */
  const trunk = phone
    ? [...rings, { at: at(15.8), r: 0.07, c: bark(15.8) }]
    : [[1.0, 0.36], [2.4, 0.45], [6.0, 0.36], [10.5, 0.27], [13.8, 0.16], [16.0, 0.035]].map(([y, r], s) => ({ at: s === 0 ? [0, y, 0] : at(y), r, c: bark(y) }));
  if (!phone) tube(out, rings, sides, { level: true });
  tube(out, trunk, phone ? sides : 6, { level: true });
  if (phone) {
    tiers(out, trunk, form);
    return out;
  }
  /* The boughs, whorl by whorl. */
  PINE_WHORLS.forEach(([y0, count, long0], k) => {
    const y = y0 + whorlA * PINE_WHORL_A[k] + whorlB * PINE_WHORL_B[k], spin = 2.4 * k + 0.35 * whorlA - 0.3 * whorlB;
    for (let j = 0; j < count; j++) {
      const turn = spin + (2 * Math.PI * (j + 0.35 * (chance(j, k, 52) - 0.5))) / count;
      const tuft = (j + k) % 3 === 0 ? tuftA : (j + k) % 3 === 1 ? tuftB : 0;
      const long = long0 * (0.9 + 0.2 * chance(j, k, 53)) * (1 + 0.2 * reach * Math.cos(turn)) * (1 - 0.45 * tuft);
      bough(out, { from: middleAt(trunk, y), turn, long, size: 1 - 0.3 * tuft, droop: DROOP[k] }, 10 * k + j, bark(y));
    }
  });
  /* The leader: the trunk's last metre in needles, to the tree's top. */
  cone(out, { at: middleAt(trunk, 15.55), r: 0.5, c: NEEDLES.flank }, { p: middleAt(trunk, REF_TALL), c: NEEDLES.over }, 5, true);
  return out;
}

/* A broad-crowned tree's bark and leaves. */
const BROAD = { bark: [[0, rgb(0x372a21)], [FOOT_TOP * REF_TALL, rgb(0x3f3127)], [3.2, rgb(0x66503d)], [7, rgb(0x80654d)]], grey: rgb(0x8e877c) };
const LEAVES = { rough: LOBE_ROUGH, heart: [0.1, 14.0, 0], span: [3.2, 2.6, 3.2], round: 0.3, under: rgb(0x26331b), flank: rgb(0x46592a), over: rgb(0x8a9c4a), low: 11.5, high: 16.6 };
/* A broad crown's masses, each [the way round from the trunk it stands, how far out, its height, its radii across and up, its sides,
   its rings, its salt], in metres: the first over the trunk and topping the crown, a ring round it, and lower ones further out between
   those, each overlapping its neighbours. The ring's first three each end a limb from the fork; the others end the limbs those carry.
   A phone's crown has fewer, of fewer sides, which overlap the first. */
export const BROAD_MASSES = {
  desktop: [
    [0, 0.1, 15.15, [1.9, 1.45], 9, 3, 61],
    [0.2, 1.5, 14.15, [1.5, 1.12], 7, 2, 62], [2.7, 1.55, 14.4, [1.55, 1.15], 7, 2, 63], [5.0, 1.45, 13.85, [1.45, 1.08], 7, 2, 64],
    [1.45, 1.5, 13.55, [1.4, 1.02], 7, 2, 65], [3.85, 1.5, 14.05, [1.38, 1.0], 7, 2, 66],
    [0.85, 1.85, 12.0, [1.15, 0.92], 7, 2, 67], [3.25, 1.85, 11.75, [1.2, 0.95], 7, 2, 68], [5.65, 1.8, 12.15, [1.1, 0.88], 7, 2, 69],
  ],
  phone: [
    [0, 0.1, 15.1, [1.95, 1.5], 6, 2, 61],
    [0.3, 1.6, 13.6, [1.6, 1.15], 5, 2, 62], [2.4, 1.65, 13.0, [1.55, 1.1], 5, 2, 63], [4.5, 1.6, 13.85, [1.55, 1.12], 5, 2, 64],
  ],
};
/* Which limb carries each mass past the ring's first three: the nearest of those, by the way round. */
const apart = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const carrier = (masses, m) => [1, 2, 3].reduce((best, k) => (apart(masses[m].turn, masses[k].turn) < apart(masses[m].turn, masses[best].turn) ? k : best), 1);
/* How each mass of the ring and under it stands higher or lower, in metres, at its form's third number; and the two sets of masses
   its fourth and fifth make smaller. */
const BROAD_HEIGHTS = [0, 0.4, -0.35, 0.3, -0.4, 0.25, -0.25, 0.3, -0.2];
const BROAD_GAPS_A = [4, 2, 8], BROAD_GAPS_B = [5, 6, 3];

/* A broad-crowned tree: a trunk on a fluted foot that bends a little and forks under its crown into stout limbs that rise and fork
   again, each holding a mass of leaves, the masses at heights and sizes of their own round one over the trunk, with gaps between
   them the sky shows through. Its form's numbers, at 1: the masses round the top spread out and down, an umbrella's; they reach
   further on one side; they stand at heights of their own; two sets of them are smaller and drawn in, so more sky shows; the trunk
   bends under the crown; and the bark is greyer. A phone's has three masses round the top, and its limbs go straight from a higher
   fork to them. */
function drawBroad(phone, form) {
  const out = shape(), [spread, reach, heights, gapsA, gapsB, bend, grey] = form;
  const bark = (y) => mix(barkAt(BROAD.bark, y), BROAD.grey, 0.55 * grey);
  const at = (y) => [0.05, y, 0.02 + BEND.broad * bend * bendAt("broad", y)];
  const forkY = phone ? 10.2 : 8.2, fork = at(forkY);
  /* The masses, as this form has them. */
  const masses = BROAD_MASSES[phone ? "phone" : "desktop"].map(([turn, far0, y0, [across, upward], sides, rings, salt], m) => {
    if (m === 0) return { turn, at: [0.1, y0 - 0.15 * spread, 0], rad: [across, upward * (1 - 0.15 * spread), across * 0.97], sides, rings, salt };
    const small = 1 - 0.35 * Math.min(1, (BROAD_GAPS_A.includes(m) ? gapsA : 0) + (BROAD_GAPS_B.includes(m) ? gapsB : 0));
    const far = (far0 * (1 + 0.12 * spread) + 0.3 * reach * Math.cos(turn)) * (0.85 + 0.15 * small);
    const size = (1 + 0.08 * spread) * (1 + 0.1 * reach * Math.cos(turn)) * small;
    return { turn, at: [far * Math.cos(turn), y0 - 0.35 * spread + heights * BROAD_HEIGHTS[m] - 0.2 * (1 - small), far * Math.sin(turn)], rad: [across * size, upward * size, across * size * 0.95], sides, rings, salt };
  });
  /* The foot, and the trunk up past the fork, where it narrows inside its limbs; a phone's ends at its fork. */
  const { sides, rings } = foot(TRUNK_FOOT * REF_WIDE, 0.14 * REF_WIDE, bark, 4, phone);
  const trunk = phone
    ? [...rings, { at: fork, r: 0.22, c: bark(forkY) }]
    : [[1.0, 0.38], [2.4, 0.47], [5.2, 0.4], [forkY, 0.34], [forkY + 1.1, 0.14]].map(([y, r], s) => ({ at: s === 0 ? [0, y, 0] : at(y), r, c: bark(y) }));
  if (!phone) tube(out, rings, sides, { level: true });
  tube(out, trunk, phone ? sides : 6, { level: true });
  /* The limbs: from the fork up through the crown's base, near the trunk, then out to a mass of the ring; the trunk's own leader up
     into the top; and from each of those limbs, a bough out to each mass it carries. */
  const limb = (from, mid, to, r, n, turn) => tube(out, [
    { at: from, r: r[0], c: bark(forkY) }, ...(mid ? [{ at: mid, r: r[1], c: bark(forkY) }] : []), { at: to, r: r[2], c: mix(bark(forkY), bark(0), 0.25) },
  ], n, { across: [-Math.sin(turn), 0, Math.cos(turn)] });
  const into = (mass) => add(mass.at, [0, -0.35 * mass.rad[1], 0]);
  const rising = (turn, y, off) => add(at(y), [off * Math.cos(turn), 0, off * Math.sin(turn)]);
  for (const m of [1, 2, 3]) {
    const mass = masses[m];
    if (phone) limb(add(fork, [0, -0.2, 0]), null, add(into(mass), [-0.4 * mass.rad[0] * Math.cos(mass.turn), 0, -0.4 * mass.rad[0] * Math.sin(mass.turn)]), [0.22, 0, 0.13], 3, mass.turn);
    else limb(add(fork, [0, -0.4, 0]), rising(mass.turn, BASE_M - 0.25, 0.3), into(mass), [0.23, 0.18, 0.12], 5, mass.turn);
  }
  if (!phone) {
    limb(add(fork, [0, -0.3, 0]), null, add(masses[0].at, [0, -0.3 * masses[0].rad[1], 0]), [0.2, 0, 0.12], 4, 1.1);
    for (let m = 4; m < masses.length; m++) {
      const parent = masses[carrier(masses, m)], start = mix(rising(parent.turn, BASE_M - 0.25, 0.3), into(parent), 0.45);
      limb(start, null, into(masses[m]), [0.13, 0, 0.08], 4, masses[m].turn);
    }
  }
  masses.forEach((mass, m) => lobe(out, mass.at, mass.rad, mass.sides, mass.rings, mass.salt, LEAVES, m === 0 ? REF_TALL : null));
  return out;
}

/* Draws a kind's shape (`draw(phone, form)`) in each of its forms, as one geometry: the shape in the form of every number 0, and FORMS
   morph targets, each what one number at 1 changes of every corner's place, normal and colour, kept relative, so a tree's own
   numbers add their shares of each (InstancedMesh setMorphAt, formOf). A drawing has the same corners in the same order in every form.
   The numbers may come in any measure together, so a corner whose changes would together carry it past the sizes every rule derives
   from has them cut back, all alike, until in no measure do they: no further out than CROWN_REACH, no higher than the top and no
   lower than the foot; a leaf no lower than BASE_FRAC; and a corner that may stand under BASE_FRAC no further from the middle line
   than TRUNK_FOOT. A colour has four parts, the last always 1: three's shader blends a morph's colour only so. */
function formed(draw, phone) {
  const zero = Array(FORMS).fill(0), base = draw(phone, zero);
  const targets = zero.map((_, k) => draw(phone, zero.map((v, j) => (j === k ? 1 : 0))));
  const count = base.position.length / 3, d = targets.map((t) => t.position.map((v, i) => v - base.position[i]));
  /* The lowest and highest a corner stands, and its furthest from the middle line, over every measure of its changes cut to `s`:
     at the corners of the measures, as each is a straight line in each number. */
  const range = (i, s) => {
    let low = Infinity, high = -Infinity, far = 0;
    for (let m = 0; m < 1 << FORMS; m++) {
      let x = base.position[3 * i], y = base.position[3 * i + 1], z = base.position[3 * i + 2];
      for (let k = 0; k < FORMS; k++) if (m & (1 << k)) { x += s * d[k][3 * i]; y += s * d[k][3 * i + 1]; z += s * d[k][3 * i + 2]; }
      low = Math.min(low, y); high = Math.max(high, y); far = Math.max(far, Math.hypot(x, z));
    }
    return { low, high, far };
  };
  const fits = (i, s) => {
    const { low, high, far } = range(i, s);
    if (far > CROWN_REACH + 1e-9 || high > 1 + 1e-9 || low < -1e-9) return false;
    return base.leaf[i] ? low >= BASE_FRAC - 1e-9 : low >= BASE_FRAC || far <= TRUNK_FOOT + 1e-9;
  };
  for (let i = 0; i < count; i++) {
    if (fits(i, 1)) continue;
    let lo = 0, hi = 1;
    for (let step = 0; step < 30; step++) { const s = (lo + hi) / 2; if (fits(i, s)) lo = s; else hi = s; }
    for (const t of d) for (let c = 0; c < 3; c++) t[3 * i + c] *= lo;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(base.position, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(base.normal, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(base.colour, 4));
  geo.morphAttributes.position = d.map((t) => new THREE.Float32BufferAttribute(t, 3));
  geo.morphAttributes.normal = targets.map((t) => new THREE.Float32BufferAttribute(t.normal.map((v, i) => v - base.normal[i]), 3));
  geo.morphAttributes.color = targets.map((t) => new THREE.Float32BufferAttribute(t.colour.map((v, i) => v - base.colour[i]), 4));
  geo.morphTargetsRelative = true;
  return geo;
}

export const pineGeometry = (phone) => formed(drawPine, phone);
export const broadGeometry = (phone) => formed(drawBroad, phone);

/* A tree's own form, by its own seed, its foot's place: FORMS numbers from 0 to 1. */
export function formOf({ x, z }) {
  const i = Math.round(x * 1000), j = Math.round(z * 1000);
  return Array.from({ length: FORMS }, (_, k) => chance(i, j, 90 + k));
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
  const meshes = [], form = { morphTargetInfluences: [] };
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
      /* And its own form, by its own seed (formOf), set once: nothing changes it again. */
      form.morphTargetInfluences = formOf(mine[k]);
      mesh.setMorphAt(k, form);
    });
    mesh.morphTexture.needsUpdate = true;
    /* An instanced mesh is culled by its geometry's bounds, one tree's; the trees stand all over the island. */
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { count: spots.length, meshes, ...keepOuts(spots) };
}
