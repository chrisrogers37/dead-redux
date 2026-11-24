/* eslint-disable */
import { AMONG_POSE, FACING, height, STAGE, STAGE_POSE } from "./ground.js";

/* Where the crowd on the hill stands (crowd.js draws it), and what it does through the show, as plain numbers: no three import, so the
   unit tests load it. */

/* A figure stands this tall: the band's height on the stage (stage.js), so the bears' 4.85 m is about one and a half people. */
export const PERSON = 3.15;

/* The crowd's ground, in rings round the stage's centre: `r0` to `r1` metres out, and `a0` to `a1` radians either side of its axis
   (from 0, one span across the axis). The gathering stands on it (below); the land grows nothing there that a figure would stand or
   sit in (island.js), and a tree keeps its distance from it (trees.js). */
const SECTIONS = [
  { r0: 13.5, r1: 28, a0: 0, a1: 0.7 },
  { r0: 28, r1: 42, a0: 0, a1: 0.85 },
  { r0: 42, r1: 55, a0: 0, a1: 0.85 },
  { r0: 16, r1: 28, a0: 0.7, a1: 1 },
  { r0: 28, r1: 44, a0: 0.85, a1: 1 },
];
/* The stage's axis as a way along the ground, [x, z]: the way the stage faces. */
export const AXIS = [Math.sin(FACING), Math.cos(FACING)];
/* A point `r` metres from the stage's centre and `th` radians off its axis, as [x, z]. */
export const fromStage = (r, th) => [STAGE[0] + r * Math.sin(FACING + th), STAGE[1] + r * Math.cos(FACING + th)];
/* Where a point lies about the stage: `r` metres from its centre, `along` metres out along its axis, `aside` metres to either side of
   the axis, and `off` radians off it, 0 on the axis and pi behind the stage. */
export function offAxis(x, z) {
  const dx = x - STAGE[0], dz = z - STAGE[1], along = dx * AXIS[0] + dz * AXIS[1], aside = Math.abs(dx * AXIS[1] - dz * AXIS[0]);
  return { r: Math.hypot(dx, dz), along, aside, off: Math.atan2(aside, along) };
}
/* How far a point lies to one side of the stage's axis, in metres: the side `aside` (offAxis) does not tell, the right as one looks
   out from the stage less than nothing. */
export const across = (x, z) => (x - STAGE[0]) * AXIS[1] - (z - STAGE[1]) * AXIS[0];
/* A point `along` metres out along the stage's axis and `side` metres to one side of it (across), as [x, z]. */
export const onAxes = (along, side) => [STAGE[0] + along * AXIS[0] + side * AXIS[1], STAGE[1] + along * AXIS[1] - side * AXIS[0]];
/* Whether a point lies on the crowd's ground: in one of its sections, or within `room` metres of one. The land grows nothing there
   that a figure would stand or sit in (island.js). */
export function onCrowdGround(x, z, room = 0) {
  const { r, off } = offAxis(x, z);
  return SECTIONS.some(({ r0, r1, a1 }) => r >= r0 - room && r <= r1 + room && off <= a1 + room / Math.max(r, 1));
}
/* The crowd's ground as spans, each [r0, r1, a1]: r0 to r1 metres from the stage and a1 radians to either side of its axis. A
   section's span runs on through every section that touches it and is as wide or wider, since the ground does: 2 m inside the crowd's
   ground is then 2 m from its rim, and never 0 m from a line where one section ends and the next begins. */
export const SPANS = [...new Set(SECTIONS.map(({ r0, r1, a1 }) => {
  for (let grown = true; grown;) {
    grown = false;
    for (const s of SECTIONS) if (s.a1 >= a1 && s.r0 <= r1 && s.r1 >= r0 && (s.r0 < r0 || s.r1 > r1)) { r0 = Math.min(r0, s.r0); r1 = Math.max(r1, s.r1); grown = true; }
  }
  return `${r0},${r1},${a1}`;
}))].map((span) => span.split(",").map(Number));
/* How far into the crowd's ground a point lies, in metres: the least of its distances from a span's two rings and its two sides, the
   greatest over the spans (they overlap), and less than nothing outside the ground. */
export function intoCrowdGround(x, z) {
  const { r, off } = offAxis(x, z);
  return Math.max(...SPANS.map(([r0, r1, a1]) => Math.min(r - r0, r1 - r, (a1 - off) * r)));
}
/* How near the crowd's ground comes to the stage's centre, and how far it reaches from it. */
const NEAR = Math.min(...SECTIONS.map((s) => s.r0)), FAR = Math.max(...SECTIONS.map((s) => s.r1));

/* The ground the gathering tries its places on (gathering, place), NEAR to FAR m from the stage's centre and PLACES radians either side
   of its axis, as a lattice of LATTICE m: its corner nearest the origin, a cell further each way, and how many cells it runs each way. */
const PLACES = 1.05;
/* The gathering reads how thick it stands off a lattice of LATTICE m over the ground it tries its places on, and gives up a cell of it
   once FULL groups in a row have been tried there and none has stood (gathering). */
export const LATTICE = 1, FULL = 8;
const LAID = (() => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  /* Each radius runs straight out from the stage, so its two ends bound it. */
  for (const r of [NEAR, FAR]) for (let k = 0; k <= 420; k++) {
    const [x, z] = fromStage(r, PLACES * (k / 210 - 1));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const from = (v) => (Math.floor(v / LATTICE) - 1) * LATTICE;
  return { x0: from(x0), z0: from(z0), nx: Math.ceil((x1 - from(x0)) / LATTICE) + 1, nz: Math.ceil((z1 - from(z0)) / LATTICE) + 1 };
})();
/* `fn` read off the lattice: reckoned once at each corner of the cell a point lies in, the first time a point asks, and between the
   corners as the point lies. A point off the lattice is reckoned itself. */
function onLattice(fn) {
  const { x0, z0, nx, nz } = LAID, values = new Float64Array((nx + 1) * (nz + 1)).fill(NaN);
  const corner = (i, j) => {
    const k = i * (nz + 1) + j;
    if (Number.isNaN(values[k])) values[k] = fn(x0 + i * LATTICE, z0 + j * LATTICE);
    return values[k];
  };
  return (x, z) => {
    const u = (x - x0) / LATTICE, w = (z - z0) / LATTICE, i = Math.floor(u), j = Math.floor(w);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return fn(x, z);
    const a = u - i, b = w - j;
    return (corner(i, j) * (1 - a) + corner(i + 1, j) * a) * (1 - b) + (corner(i, j + 1) * (1 - a) + corner(i + 1, j + 1) * a) * b;
  };
}
/* The cells of the lattice a filling of the gathering gives up: `full` says whether a point's cell is given up, and `tried` counts a
   group tried there, which stood or did not. */
function filling() {
  const { x0, z0, nx, nz } = LAID, failed = new Uint8Array(nx * nz);
  const cell = (x, z) => Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / LATTICE))) * nz + Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / LATTICE)));
  return {
    full: (x, z) => failed[cell(x, z)] >= FULL,
    tried: (x, z, stood) => { const k = cell(x, z); failed[k] = stood ? 0 : Math.min(255, failed[k] + 1); },
  };
}

/* How far a figure's place keeps from the path, from the bears' line and from a landmark's bounds, in metres. */
const KEEP = { path: 4, line: 4, landmark: 1.5 };

/* What a figure keeps clear of, each [x, z, distance]: the points of `path` and `line` ([x, z] each) and `landmarks`, each a circle
   [x, z, radius] round one, those near the crowd. */
export function keepOuts({ path, line, landmarks }) {
  return [
    ...path.map(([x, z]) => [x, z, KEEP.path]),
    ...line.map(([x, z]) => [x, z, KEEP.line]),
    ...landmarks.map(([x, z, radius]) => [x, z, radius + KEEP.landmark]),
  ].filter(([x, z, d]) => Math.hypot(x - STAGE[0], z - STAGE[1]) < FAR + d);
}

/* ---------- the gathering ---------- */

/* How many seats the gathering has: as many as the crowd's rows of seats held before it, so each tier draws as many figures as it did
   (quality.js), and a desktop all of them. */
export const COUNT = 292;
/* How near two people may be: no two seats nearer than APART m, twice a standing figure's reach with its arms hanging (crowd.js HANG,
   0.666 m at the largest figure's size), so no two standing still pass through each other. A seated figure's feet rest LEGS m ahead
   of its seat at the most (crowd.js FEET), and no other seat stands within half of APART of the line out to them. */
export const APART = 1.34, LEGS = 1.04;
/* How far up the hill a figure may face. Seated, as everyone is in Space, its feet follow the ground ahead of its seat up a rise of
   0.12 of its height at the most (crowd.js DROP), and they reach 0.36 of its height ahead, a little more on the broadest: a rise of
   0.317 m a metre. So no figure faces up a rise of more than RISE m a metre, read at RISE_AT m ahead of its seat, wherever it turns. */
export const RISE = 0.28, RISE_AT = [0.35, 0.7];
/* The aisle: a way up through the crowd from the stage's front to past its back, which no seat stands within `half` m of its middle.
   It winds. Its middle bows to one side of the stage's axis between AISLE.from m out along the axis and ?pose=stage, which stands on
   the axis in it (ground.js), and to the other side up the hill from there to AISLE.to m, each by as much as the day's seed says,
   between `front` (m, the least and the most) and `back`, which bends it well off the axis up the hill, toward the side the gathering
   spills to; and the room kept clear, `half`, widens and narrows along it, between its least and most. The front's bow is the
   smaller, so the stage's axis keeps within the aisle down to the stage: the walk from ?pose=stage to the stage's edge passes no seat
   nearer than half of APART. */
export const AISLE = { from: 11, to: 58, front: [0.9, 1.5], back: [5.5, 8], half: [2.5, 3.2] };
/* How far off the aisle each seat and each blanket's edge keeps, in metres: intoAisle reads the half-width at the middle's nearest
   point, and where the half-width widens along it a point a few millimetres outside by that lies inside by the half-width a little
   further along. */
const AISLE_CLEAR = 0.1;
/* A group's members stand on a ring round its middle, or in a line, each NEXT m from the next (the least and the most): nearer than
   the parting's `space` (crowd.js partingOptions, 1.4 m), so a group steps aside and back as one (parting), and no nearer than
   APART. Anyone of another group stands GROUPS_APART m off at the least: the first number before the stage, out to GROUPS_FROM m from
   its centre, widening to the second by GROUPS_TO m, so the crowd packs in at the front and loosens up the hill. */
export const NEXT = [1.345, 1.385], GROUPS_APART = [1.5, 1.8], GROUPS_FROM = 20, GROUPS_TO = 34;
/* A ring of people facing its middle: a drum circle of DRUMS people, and a hacky-sack ring of SACK. */
const DRUMS = [7, 9], SACK = [4, 5];
/* Those who stand off on their own, the rings among them, keep OFF m or more from everyone not of their own group, so grass shows
   between them and the rest even from the descent's height. A clearing in the gathering is CLEARING m across (the least and the
   most). */
export const OFF = 4.5, CLEARING = [5, 8];
/* A tier that draws fewer than COUNT keeps first the groups of those nearest where ?pose=among stands, until AMONG_KEEP[0] or more of
   them stand within AMONG_KEEP[1] m of it (gathering). */
export const AMONG_KEEP = [3, 3];
/* A tier that draws fewer than COUNT thins the rest of the gathering side by side, band by band out from the stage, each to BANDS m
   from its centre, and square by square, THIN m across (gathering). */
export const BANDS = [22, 28, 34, 40, Infinity], THIN = 12;
/* A blanket, BLANKET m across and as deep (each the least and the most), which two to five sit on, and no nearer another blanket than
   BLANKET_APART m: island.js draws them on the ground, each to its edge, from a mask that holds for each place the nearest one. */
const BLANKET = { wide: [2.7, 3.6], deep: [2.0, 2.5] }, BLANKET_APART = 2.2;
/* The colours a blanket may be (island.js draws them), as many as BLANKET_TONES. */
export const BLANKET_TONES = 7;

/* A stream of numbers from 0 to 1 for a seed. */
function stream(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* An angle brought to -pi to pi. */
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/* The way a figure at a point turns to face the stage's centre, as crowd.js turns it (its +z to (sin, cos) of the turn). */
export const toStage = (x, z) => Math.atan2(STAGE[0] - x, STAGE[1] - z);
/* How steeply the ground rises ahead of a figure at a point facing `face`, in metres a metre: the most of it read at RISE_AT. */
export function riseAhead(x, z, face) {
  const h = height(x, z);
  return Math.max(...RISE_AT.map((d) => (height(x + d * Math.sin(face), z + d * Math.cos(face)) - h) / d));
}
/* A way to face as near `face` as the hill lets a figure at a point face: turned, a little at a time, toward the way the hill falls
   until the ground ahead rises no more than RISE. With how far it was turned. */
function downhillOf(x, z, face) {
  if (riseAhead(x, z, face) <= RISE) return { face, turned: 0 };
  const fall = Math.atan2(height(x - 0.5, z) - height(x + 0.5, z), height(x, z - 0.5) - height(x, z + 0.5)), by = Math.sign(wrap(fall - face)) || 1;
  for (let turned = 0.05; turned <= Math.PI; turned += 0.05) if (riseAhead(x, z, face + by * turned) <= RISE) return { face: wrap(face + by * turned), turned };
  return { face: fall, turned: Math.PI };
}

/* The aisle's middle for a stream `rnd`, as points every half metre along the stage's axis, each [along, side, half] (across). */
function aisleOf(rnd, side) {
  const pose = offAxis(STAGE_POSE.x, STAGE_POSE.z).along;
  const pick = ([least, most]) => least + (most - least) * rnd();
  const front = pick(AISLE.front), back = pick(AISLE.back), phase = 2 * Math.PI * rnd(), [h0, h1] = AISLE.half;
  const line = [];
  for (let u = AISLE.from; u <= AISLE.to + 1e-9; u += 0.5) {
    const mid = u <= pose ? side * front * Math.sin((Math.PI * (u - AISLE.from)) / (pose - AISLE.from)) : -side * back * Math.sin((Math.PI * (u - pose)) / (AISLE.to - pose));
    line.push([u, mid, h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(u / 3.7 + phase))]);
  }
  return line;
}
/* How far a point (along, side) lies inside the aisle, in metres: its half-width less its distance from the middle, nearest along it;
   less than nothing outside. From the stretch of the middle level with the point outward each way, as far as a stretch could still
   come nearer: the middle bows no further to a side than AISLE.back's most, and its half-width is AISLE.half's most at the widest. */
export function intoAisle(line, along, side) {
  const last = line.length - 2, at = Math.max(0, Math.min(last, Math.floor((along - line[0][0]) / (line[1][0] - line[0][0]))));
  const aside = Math.max(0, Math.abs(side) - AISLE.back[1]);
  let most = -Infinity;
  for (let k = at, way = 1; k >= 0; k += way) {
    if (k > last || AISLE.half[1] - Math.hypot(Math.max(0, way > 0 ? line[k][0] - along : along - line[k + 1][0]), aside) <= most) {
      if (way < 0) break;
      way = -1; k = at;
      continue;
    }
    const a = line[k], b = line[k + 1], du = b[0] - a[0], ds = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((along - a[0]) * du + (side - a[1]) * ds) / (du * du + ds * ds)));
    most = Math.max(most, a[2] + (b[2] - a[2]) * t - Math.hypot(along - a[0] - t * du, side - a[1] - t * ds));
  }
  return most;
}

/* How thick the gathering stands at a point for a stream `rnd`, 0 to 1, and how far inside its outline the point lies (`inside`, 0 to
   1). The outline is lopsided: the side `lean` of the stage's axis spills further round and further up the hill, and the other is cut
   short, each by the day's own numbers; its front edge comes and goes in bays a few metres deep; and up the hill and round the sides
   it frays out to stragglers. Within it the gathering is thickest before the stage and thins up the hill, thicker on the side it
   spills to, in patches tens of metres across, and open in two or three clearings CLEARING m across where no one stands. Where
   ?pose=among stands, which looks out from among the crowd, it always stands: the outline takes the spot in, and no clearing opens
   there. */
function thicknessOf(rnd, lean) {
  const by = 0.7 + 0.2 * rnd(), wide = [0.82 + 0.1 * rnd(), 0.36 + 0.1 * rnd()], up = [4 + 3 * rnd(), -6 - 4 * rnd()];
  const back = 42 + 4 * rnd(), ph = Array.from({ length: 12 }, () => 2 * Math.PI * rnd());
  const clearings = [];
  for (let n = 2 + Math.floor(2 * rnd()), t = 0; clearings.length < n && t < 50; t++) {
    const at = fromStage(25 + 16 * rnd(), (rnd() < 0.5 ? 1 : -1) * (0.12 + 0.5 * rnd())), half = pick2(CLEARING, rnd) / 2;
    if (Math.hypot(at[0] - AMONG_POSE.x, at[1] - AMONG_POSE.z) > half + 5) clearings.push({ at, r: half });
  }
  const insideAt = (r, off, side, grow = 0) => {
    const k = side === lean ? 0 : 1, edge = wide[k] + k * 0.3 * (1 - ease(NEAR, 28, r)) + 0.08 * Math.sin(r / 4.1 + ph[k]) + 0.05 * Math.sin(r / 1.7 + ph[2]) + grow / r;
    const top = back + up[k] + 4 * Math.sin(2.3 * off * side + ph[3]) + 2.5 * Math.sin(6.1 * off * side + ph[4]) + grow;
    const bay = NEAR + 0.3 + 1.5 * (1 + Math.sin(3.3 * off * side + ph[8])) * (0.5 + 0.5 * Math.sin(7.9 * off * side + ph[9])) - grow;
    return ease(0, 0.2, edge - off) * ease(0, 5, top - r) * ease(0, 1.5, r - bay);
  };
  /* Wherever the outline runs, it takes in the ground round where ?pose=among stands. */
  const among = (x, z) => 1 - ease(4, 7, Math.hypot(x - AMONG_POSE.x, z - AMONG_POSE.z));
  const insideOf = (x, z, grow = 0) => { const { r, off } = offAxis(x, z); return Math.max(insideAt(r, off, across(x, z) >= 0 ? 1 : -1, grow), among(x, z)); };
  const thick = (x, z) => {
    const { r, off } = offAxis(x, z), aside = across(x, z), front = Math.exp(-(r - NEAR) / 10), leaning = 1 + by * lean * Math.tanh(aside / 10);
    const patch = Math.max(among(x, z), 1 + ease(NEAR + 4, 30, r) * (0.55 * Math.sin(0.15 * x + ph[5]) * Math.cos(0.17 * z + ph[6]) + 0.35 * Math.sin(0.29 * (x - z) + ph[7])));
    let open = 1;
    for (const c of clearings) open = Math.min(open, ease(c.r, c.r + 2, Math.hypot(x - c.at[0], z - c.at[1])));
    return (front * leaning * patch * open * (0.02 + 0.98 * Math.max(insideAt(r, off, aside >= 0 ? 1 : -1), among(x, z)))) / 0.8;
  };
  /* Each read off the lattice, as the gathering asks for it: the thickness, how far inside the outline a point lies, and how far inside
     the outline grown 5 m. */
  const read = onLattice(thick);
  read.inside = onLattice(insideOf);
  read.grown = onLattice((x, z) => insideOf(x, z, 5));
  read.clearings = clearings;
  return read;
}
const pick2 = ([least, most], rnd) => least + (most - least) * rnd();

/* The gathering for a seed: where each of its COUNT people stands, which way they face, who sits, and the groups they stand in; the
   blankets under those who sit; and the aisle. Not rows: groups of two to six friends turned toward each other, a drum circle and a
   hacky-sack ring facing in, people alone and in lines facing the stage, a few turned away, and groups sitting on blankets up the hill,
   all as thick as the gathering stands there (thicknessOf), and off the aisle. The rings, a blanket or two and a few people alone
   stand off from the rest with grass round them (OFF), and stragglers fill out the fringe. Each group is tried at a place drawn at
   random on the crowd's ground, kept as the gathering's thickness there says, and kept only where every one of its people stands on
   that ground, AISLE_CLEAR off the aisle, no nearer one of its own than APART and anyone else than GROUPS_APART, out of a seated
   figure's legs (LEGS), and facing no further up the hill than RISE lets them (each turned toward the hill's fall as far as it must
   be, a ring's people hardly at all), and where its people hold together (NEXT), so it steps aside and back as one (parting).
   The seats come front first with a random spread, a group's together: so any count of the first seats keeps the crowd's shape and
   its groups, and thins the back of the hill first. Each seat is { x, z, r, sit, face, group, blanket }: `r` metres from the stage's
   centre, `face` the way it faces (crowd.js turns its figure so), `group` its group's index in `groups` and `blanket` the index of the
   blanket it sits on in `blankets`, or -1. A group is { kind, seats } (the indices of its seats), a blanket { x, z, face, wide, deep,
   tone, rim }: its middle, the way its sitters face, its size across and along that way, and its colour and its border's (the same
   for none), each one of BLANKET_TONES. `aisle` is aisleOf's. The same for the same seed every time; the last seed's is kept, and is
   not to be changed. */
let kept = null;
export function gathering(seed = 0) {
  if (kept && kept.seed === seed) return kept;
  /* The aisle's front bows to the side `bend`, and its back, the longer bow, to the side the gathering spills to. */
  const rnd = stream(seed + 1), bend = rnd() < 0.5 ? 1 : -1, aisle = aisleOf(rnd, bend), thick = thicknessOf(rnd, -bend);
  /* The seats placed, by cells of CELL m, as wide as the farthest two groups stand apart. */
  const placed = [], blankets = [], groups = [], CELL = GROUPS_APART[1], cell = (v) => Math.floor(v / CELL);
  /* The cells, each the list of those placed in it, by a cell's column and row (within 128 cells of the origin, all the island). */
  const grid = Array.from({ length: 65536 }, () => null), slot = (i, j) => (i + 128) * 256 + (j + 128);
  /* Those who stand off on their own, by cells of OFF m. */
  const apart = new Map(), offCell = (v) => Math.floor(v / OFF);
  /* The line of a seated figure's legs, out to its feet, and how near a point comes to it. */
  const legsFrom = (x, z, face, d) => {
    const t = Math.max(0, Math.min(LEGS, (d[0] - x) * Math.sin(face) + (d[1] - z) * Math.cos(face)));
    return Math.hypot(d[0] - x - t * Math.sin(face), d[1] - z - t * Math.cos(face));
  };
  /* How far a point lies inside a blanket, in metres: less than nothing outside it. */
  const inBlanket = (b, x, z) => {
    const dx = x - b.x, dz = z - b.z, side = dx * Math.cos(b.face) - dz * Math.sin(b.face), fore = dx * Math.sin(b.face) + dz * Math.cos(b.face);
    return Math.min(b.wide / 2 - Math.abs(side), b.deep / 2 - Math.abs(fore));
  };
  /* How far apart two groups stand, `r` m from the stage's centre. */
  const apartAt = (r) => GROUPS_APART[0] + (GROUPS_APART[1] - GROUPS_APART[0]) * Math.max(0, Math.min(1, (r - GROUPS_FROM) / (GROUPS_TO - GROUPS_FROM)));
  /* Whether a seat may stand at a point among those placed and those of its own group already taken: on the crowd's ground, off the
     aisle and off any blanket but its own, no nearer one of its own than APART or anyone else than apartAt there, and out of a seated
     figure's legs, as it keeps out of its. */
  /* Those placed within `reach` m of a point, and maybe a few more, from the cells round it. */
  const nearby = (x, z, reach) => {
    const out = [], n = Math.ceil(reach / CELL);
    for (let i = cell(x) - n; i <= cell(x) + n; i++) for (let j = cell(z) - n; j <= cell(z) + n; j++) for (const k of grid[slot(i, j)] ?? []) out.push(placed[k]);
    return out;
  };
  const crowds = (o, s, least) => Math.hypot(o.x - s.x, o.z - s.z) < least
    || (o.sit && legsFrom(o.x, o.z, o.face, [s.x, s.z]) < APART / 2) || (s.sit && legsFrom(s.x, s.z, s.face, [o.x, o.z]) < APART / 2);
  const fits = (s, taken, own) => {
    if (!free(s)) return false;
    const others = apartAt(Math.hypot(s.x - STAGE[0], s.z - STAGE[1]));
    for (let i = cell(s.x) - 1; i <= cell(s.x) + 1; i++) for (let j = cell(s.z) - 1; j <= cell(s.z) + 1; j++)
      for (const k of grid[slot(i, j)] ?? []) if (crowds(placed[k], s, others)) return false;
    if (taken.some((o) => crowds(o, s, APART))) return false;
    if (!onCrowdGround(s.x, s.z) || intoCrowdGround(s.x, s.z) < 0.4 || inAisle(s.x, s.z, AISLE_CLEAR)) return false;
    return !blankets.some((b) => b !== own && inBlanket(b, s.x, s.z) > -0.3);
  };
  /* Whether a point stands as far from everyone placed as a seat must, apartAt there and OFF from those who stand off, by distance
     alone: what fits asks first, and a group tried with too few of its people free is let go before they are turned (room). */
  const free = (s) => {
    const others = apartAt(Math.hypot(s.x - STAGE[0], s.z - STAGE[1]));
    for (let i = cell(s.x) - 1; i <= cell(s.x) + 1; i++) for (let j = cell(s.z) - 1; j <= cell(s.z) + 1; j++)
      for (const k of grid[slot(i, j)] ?? []) if (Math.hypot(placed[k].x - s.x, placed[k].z - s.z) < others) return false;
    for (let i = offCell(s.x) - 1; i <= offCell(s.x) + 1; i++) for (let j = offCell(s.z) - 1; j <= offCell(s.z) + 1; j++)
      for (const o of apart.get(i * 4096 + j) ?? []) if (Math.hypot(o.x - s.x, o.z - s.z) < OFF) return false;
    return true;
  };
  /* Whether `need` or more of a group's people stand free (free): take keeps those that fit, so a group with fewer is never taken. */
  const room = (members, need) => members.reduce((n, s) => n + (free(s) ? 1 : 0), 0) >= need;
  /* Whether a point lies within `clear` m of the aisle, or in it. Its middle bows no further to a side than AISLE.back's most, and its
     half-width is AISLE.half's most at the widest, so a point further across than both and `clear` lies outside it. */
  const inAisle = (x, z, clear) => Math.abs(across(x, z)) < AISLE.back[1] + AISLE.half[1] + clear
    && intoAisle(aisle, (x - STAGE[0]) * AXIS[0] + (z - STAGE[1]) * AXIS[1], across(x, z)) > -clear;
  /* Whether a blanket fits: on the crowd's ground and AISLE_CLEAR off the aisle at its corners, over no one placed, and no nearer
     another blanket than BLANKET_APART. The aisle bends too gently for a side between two corners clear of it to reach into it. */
  const corners = (b) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [
    b.x + (i * b.wide * Math.cos(b.face)) / 2 + (j * b.deep * Math.sin(b.face)) / 2, b.z - (i * b.wide * Math.sin(b.face)) / 2 + (j * b.deep * Math.cos(b.face)) / 2]);
  const blanketFits = (b) => corners(b).every(([x, z]) => onCrowdGround(x, z) && !inAisle(x, z, AISLE_CLEAR))
    && nearby(b.x, b.z, Math.hypot(b.wide, b.deep) / 2 + 0.3).every((s) => inBlanket(b, s.x, s.z) < -0.3)
    && blankets.every((o) => Math.hypot(o.x - b.x, o.z - b.z) > (Math.hypot(o.wide, o.deep) + Math.hypot(b.wide, b.deep)) / 2 + BLANKET_APART);
  /* Faces a seat as near `face` as the hill lets it, no further turned than `most`; false where it would be turned further. */
  const facing = (s, face, most) => {
    const { face: f, turned } = downhillOf(s.x, s.z, face);
    if (turned > most) return false;
    s.face = f;
    return true;
  };
  const pick = ([least, most]) => least + (most - least) * rnd(), whole = ([least, most]) => least + Math.floor((most - least + 1) * rnd());
  const at = (x, z, sit = false) => ({ x, z, sit, face: 0 });

  /* A group of `n` round (cx, cz), each member facing the stage turned toward the group's middle by `inward` (0 to 1), or a ring of
     them facing its middle; or `n` side by side across the way to the stage, facing it. */
  function standing(kind, n, cx, cz) {
    const stage = toStage(cx, cz), ring = kind === "drums" || kind === "sack", out = [], turns = [];
    if (kind === "line") {
      const gap = pick(NEXT);
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * gap;
        out.push(at(cx + o * Math.cos(stage), cz - o * Math.sin(stage)));
        turns.push([stage + 0.12 * (rnd() - 0.5) - 0.15 * Math.sign(o), 0.6]);
      }
    } else {
      const inward = ring ? 1 : kind === "pit" ? 0.15 + 0.3 * rnd() : 0.35 + 0.5 * rnd(), radius = pick(NEXT) / (2 * Math.sin(Math.PI / n));
      /* A pair stands across the slope more often than along it. */
      const start = n === 2 ? stage + Math.PI / 2 + 0.9 * (rnd() - 0.5) : 2 * Math.PI * rnd();
      for (let k = 0; k < n; k++) {
        const a = start + (2 * Math.PI * k) / n + (ring ? 0.02 : 0.1) * (rnd() - 0.5), d = radius * (ring ? 1 : 0.98 + 0.04 * rnd());
        const s = at(cx + d * Math.sin(a), cz + d * Math.cos(a)), mid = Math.atan2(cx - s.x, cz - s.z), own = toStage(s.x, s.z);
        out.push(s);
        turns.push([own + inward * wrap(mid - own) + (ring ? 0 : 0.2 * (rnd() - 0.5)), ring ? 0.3 : 1.1]);
      }
    }
    /* Where too few of them stand free for take to keep, they are let go before they are turned. */
    if (!room(out, ring ? n : n > 1 && kind !== "pit" ? 2 : 1)) return null;
    return out.every((s, k) => facing(s, ...turns[k])) ? out : null;
  }
  /* One alone, mostly facing the stage, a few turned well away from it, as far as the hill lets them; seated or not. */
  function alone(cx, cz, sit) {
    const s = at(cx, cz, sit), stage = toStage(cx, cz), away = rnd() < 0.12;
    const face = away ? stage + (rnd() < 0.5 ? 1 : -1) * (1.3 + 1.6 * rnd()) : stage + 0.5 * (rnd() - 0.5);
    return room([s], 1) && facing(s, face, away ? Math.PI : 0.9) ? [s] : null;
  }
  /* Two to five seated on a blanket, facing the way it does, toward the stage: a row along its back and any more before them, between
     them; or two at its ends facing each other across it, one a little ahead of the other, so neither's legs reach the other. */
  function onBlanket(n, cx, cz) {
    const face = toStage(cx, cz) + 0.5 * (rnd() - 0.5), b = { x: cx, z: cz, face, wide: pick(BLANKET.wide), deep: pick(BLANKET.deep) };
    if (!blanketFits(b)) return null;
    const right = [Math.cos(face), -Math.sin(face)], ahead = [Math.sin(face), Math.cos(face)], out = [];
    const put = (side, fore, turn) => {
      const s = at(cx + side * right[0] + fore * ahead[0], cz + side * right[1] + fore * ahead[1], true);
      if (!facing(s, face + turn, 0.5)) return false;
      out.push(s);
      return true;
    };
    if (n === 2 && rnd() < 0.4) {
      const end = b.wide / 2 - 0.45, by = rnd() < 0.5 ? 1 : -1;
      if (!put(end, by * 0.37, -Math.PI / 2 + 0.2 * (rnd() - 0.5)) || !put(-end, -by * 0.37, Math.PI / 2 + 0.2 * (rnd() - 0.5))) return null;
    } else {
      const row = Math.min(n, Math.max(2, Math.floor(1 + (b.wide - 0.9) / APART))), gap = (b.wide - 0.9) / Math.max(1, row - 1);
      for (let k = 0; k < row; k++) if (!put((k - (row - 1) / 2) * gap, -b.deep / 2 + 0.45, 0.25 * (rnd() - 0.5))) return null;
      for (let k = row; k < n; k++) if (!put((k - row + 0.5 - (n - row) / 2) * gap, -b.deep / 2 + 1.6, 0.25 * (rnd() - 0.5))) return null;
    }
    b.tone = Math.floor(rnd() * BLANKET_TONES);
    b.rim = rnd() < 0.55 ? (b.tone + 1 + Math.floor(rnd() * (BLANKET_TONES - 1))) % BLANKET_TONES : b.tone;
    return { members: out, blanket: b };
  }

  /* Whether a group's members hold together: each within NEXT's most of another, and so of all the rest, one by one. */
  const joined = (members) => {
    const reached = [members[0]];
    for (let k = 0; k < reached.length; k++) for (const s of members)
      if (!reached.includes(s) && Math.hypot(s.x - reached[k].x, s.z - reached[k].z) < 1.4) reached.push(s);
    return reached.length === members.length;
  };
  /* Takes a group's members, those that fit (all of them for a ring or a blanket), or none: none too where the count has no room for
     them all, or where those that fit do not hold together (joined). */
  function take(kind, members, blanket = null, all = false, alone = false) {
    if (!members) return false;
    const taken = [];
    for (const s of members) if (fits(s, taken, blanket)) taken.push(s); else if (all) return false;
    if (taken.length === 0 || (members.length > 1 && taken.length < 2 && kind !== "pit")) return false;
    if (taken.length > COUNT - placed.length || (!blanket && !joined(taken))) return false;
    const g = groups.length;
    const key = rnd();
    if (blanket) blankets.push(blanket);
    for (const [k, s] of taken.entries()) {
      Object.assign(s, { r: offAxis(s.x, s.z).r, group: g, blanket: blanket ? blankets.length - 1 : -1, key: key + k * 1e-9 });
      (grid[slot(cell(s.x), cell(s.z))] ??= []).push(placed.length);
      placed.push(s);
    }
    groups.push({ kind });
    if (alone) for (const s of taken) apart.set(offCell(s.x) * 4096 + offCell(s.z), [...(apart.get(offCell(s.x) * 4096 + offCell(s.z)) ?? []), s]);
    return true;
  }
  /* A place on the crowd's ground, at random over it, for a group to be tried at: within `r` metres of the stage, `side` of its axis. */
  const place = (most = FAR, side = 0) => {
    for (;;) {
      const r = NEAR + (most - NEAR) * rnd(), th = (rnd() * 2 - 1) * PLACES;
      if (SECTIONS.some(({ r0, r1, a1 }) => r >= r0 && r <= r1 && Math.abs(th) <= a1) && (side === 0 || Math.sign(th) === side)) return fromStage(r, th);
    }
  };

  /* First those who stand off on their own, each where the gathering's outline leaves the ground thin (inside it by a fifth at the
     most), OFF m from everyone else: a drum circle on one side of the aisle and a hacky-sack ring on the other, where the ground is
     level enough for a ring to face in, a blanket or two, and a few alone round the edges. */
  const thin = (most, side = 0, least = 1) => {
    for (let t = 0; t < 400; t++) {
      const [x, z] = place(most, side);
      if (thick.inside(x, z) <= 0.2 && intoCrowdGround(x, z) >= least) return [x, z];
    }
    return place(most, side);
  };
  const drumSide = rnd() < 0.5 ? 1 : -1;
  for (const [kind, sizes, side] of [["drums", DRUMS, drumSide], ["sack", SACK, -drumSide]]) {
    for (let t = 0; t < 400; t++) if (take(kind, standing(kind, whole(sizes), ...thin(40, side, 3)), null, true, true)) break;
  }
  for (let k = 0, n = 1 + Math.floor(2 * rnd()); k < n; k++) {
    for (let t = 0; t < 200; t++) {
      const b = onBlanket(whole([2, 4]), ...thin(FAR, 0, 2));
      if (take("blanket", b?.members, b?.blanket, true, true)) break;
    }
  }
  for (let k = 0, n = 3 + Math.floor(3 * rnd()); k < n; k++) {
    for (let t = 0; t < 200; t++) {
      const [x, z] = thin(FAR);
      if (take("alone", alone(x, z, offAxis(x, z).r > 34 && rnd() < 0.5), null, false, true)) break;
    }
  }
  /* Then the rest, group by group, until there are COUNT. Near the stage they stand alone and in twos and threes, packed and facing
     it; further up in groups of friends; and up the hill many sit, on blankets and alone. */
  /* Where the gathering has filled, the tries cost next to nothing: a cell of the lattice where FULL groups in a row have not stood is
     given up (filling), and each filling below has its own. */
  const main = filling();
  for (let t = 0; placed.length < COUNT && t < 60000; t++) {
    const [x, z] = place();
    if (main.full(x, z) || rnd() > thick(x, z)) continue;
    const { r } = offAxis(x, z), q = rnd();
    let stood;
    if (r < 22) {
      if (q < 0.15) stood = take("alone", alone(x, z, false));
      else if (q < 0.4) stood = take("line", standing("line", whole([3, 5]), x, z));
      else stood = take("pit", standing("pit", whole([3, 6]), x, z));
    } else if (r < 34) {
      if (q < 0.2) stood = take("alone", alone(x, z, false));
      else if (q < 0.3) stood = take("line", standing("line", whole([2, 3]), x, z));
      else if (q < (r < 28 ? 0.95 : 0.82)) stood = take("clump", standing("clump", whole([2, 6]), x, z));
      else { const b = onBlanket(whole([2, 4]), x, z); stood = take("blanket", b?.members, b?.blanket, true); }
    } else {
      if (q < 0.6) { const b = onBlanket(whole([2, 4]), x, z); stood = take("blanket", b?.members, b?.blanket, true); }
      else if (q < 0.8) stood = take("alone", alone(x, z, rnd() < 0.6));
      else stood = take("clump", standing("clump", whole([2, 5]), x, z));
    }
    main.tried(x, z, stood);
  }
  /* And where the gathering has filled before COUNT stand, stragglers round its fringe, near its outline and not deep inside it, in
     twos and threes and alone, wherever there is room; then anywhere there is. */
  const straggle = (x, z, cells) => {
    if (cells.full(x, z)) return;
    cells.tried(x, z, rnd() < 0.6 ? take("clump", standing("clump", whole([2, 3]), x, z)) : take("alone", alone(x, z, offAxis(x, z).r > 34 && rnd() < 0.5)));
  };
  const fringe = filling(), anywhere = filling();
  for (let t = 0; placed.length < COUNT && t < 100000; t++) {
    const [x, z] = place();
    if (!fringe.full(x, z) && thick.inside(x, z) < 0.7 && thick.grown(x, z) > 0.3) straggle(x, z, fringe);
  }
  for (let t = 0; placed.length < COUNT && t < 100000; t++) straggle(...place(), anywhere);
  /* The order a tier keeps them in when it draws fewer (wholeGroups), a group's together. First the drum circle and the sack ring,
     then the groups of those nearest where ?pose=among stands, one after another until AMONG_KEEP[0] or more of them stand within
     AMONG_KEEP[1] m of it. Then the others a group at a time: from the side of the stage's axis and the band out from the stage
     (BANDS) that between them keep the least share so far of the people who stand in them, and within those from the square of THIN m
     in the stage's frame that keeps the least (the part of it in that band), in a random order within each square. So a crowd of any count keeps about as many of
     every part of the gathering as of any other: its outline, its two sides and its thinning up the hill. */
  const among = new Set(), fromPose = (s) => Math.hypot(s.x - AMONG_POSE.x, s.z - AMONG_POSE.z);
  for (const s of [...placed].sort((a, b) => fromPose(a) - fromPose(b))) {
    if (placed.filter((o) => among.has(o.group) && fromPose(o) < AMONG_KEEP[1]).length >= AMONG_KEEP[0]) break;
    among.add(s.group);
  }
  const rank = (g) => (groups[g].kind === "drums" || groups[g].kind === "sack" ? 0 : among.has(g) ? 1 : 2);
  const of = groups.map(() => []);
  placed.forEach((s) => of[s.group].push(s));
  /* Each part, a side, a band or a square, counts all its people and those kept so far; a square holds its groups that wait, in their
     random order, and a side's band its squares. */
  const parts = new Map(), part = (k) => {
    if (!parts.has(k)) parts.set(k, { all: 0, kept: 0, waiting: [], squares: new Set() });
    return parts.get(k);
  };
  const share = (p) => p.kept / p.all, first = [], where = [], strata = new Set();
  for (const g of groups.map((_, k) => k).sort((a, b) => rank(a) - rank(b) || of[a][0].key - of[b][0].key)) {
    const x = of[g].reduce((sum, s) => sum + s.x, 0) / of[g].length, z = of[g].reduce((sum, s) => sum + s.z, 0) / of[g].length;
    const side = across(x, z) >= 0 ? 1 : 0, band = BANDS.findIndex((b) => Math.hypot(x - STAGE[0], z - STAGE[1]) < b);
    const along = (x - STAGE[0]) * AXIS[0] + (z - STAGE[1]) * AXIS[1];
    const stratum = part(`side ${side} band ${band}`), square = part(`side ${side} band ${band} square ${Math.floor(along / THIN)} ${Math.floor(across(x, z) / THIN)}`);
    stratum.by = [part(`side ${side}`), part(`band ${band}`)];
    stratum.squares.add(square);
    strata.add(stratum);
    where[g] = [...stratum.by, square];
    for (const p of where[g]) p.all += of[g].length;
    if (rank(g) < 2) { first.push(g); for (const p of where[g]) p.kept += of[g].length; } else square.waiting.push(g);
  }
  /* Of parts, the one that keeps least (`kept`), the one whose next group comes first in the random order where two keep as much. */
  const least = (list, kept) => list.reduce((a, b) => (kept(b) < kept(a) || (kept(b) === kept(a) && b.key < a.key) ? b : a));
  const waiting = (stratum) => [...stratum.squares].filter((q) => q.waiting.length > 0);
  for (let left = [...strata].filter((p) => waiting(p).length > 0); left.length > 0; left = left.filter((p) => waiting(p).length > 0)) {
    for (const stratum of left) {
      for (const square of waiting(stratum)) square.key = of[square.waiting[0]][0].key;
      stratum.key = Math.min(...waiting(stratum).map((q) => q.key));
    }
    const square = least(waiting(least(left, (p) => share(p.by[0]) + share(p.by[1]))), share), g = square.waiting.shift();
    first.push(g);
    for (const p of where[g]) p.kept += of[g].length;
  }
  const order = first.flatMap((g) => of[g].map((s) => placed.indexOf(s)));
  const seats = order.map((k) => { const { x, z, r, sit, face, group, blanket } = placed[k]; return { x, z, r, sit, face, group, blanket }; });
  const members = groups.map(() => []);
  seats.forEach((s, i) => members[s.group].push(i));
  kept = { seed, seats, blankets, aisle, groups: groups.map(({ kind }, g) => ({ kind, seats: members[g] })) };
  return kept;
}

/* How many of the first of `list`, seats a group's together (gathering), a crowd of `count` takes: the most that are whole groups and
   no more than `count`, so it never cuts a group and leaves part of it. */
export function wholeGroups(list, count) {
  let most = 0;
  for (let i = 1; i <= Math.min(count, list.length); i++) if (i === list.length || list[i].group !== list[i - 1].group) most = i;
  return most;
}
/* The seats of the day's gathering (seed), in its order, each { x, z, r, sit, face, blanket, group } (gathering), for a crowd of
   `count`: whole groups (wholeGroups), and none of a group any of whose people stand within what keepOuts names, which is left out
   whole and moves no one else. */
export function seats(around, seed = 0, count = Infinity) {
  const keeps = keepOuts(around), all = gathering(seed).seats;
  const clear = (x, z) => keeps.every(([kx, kz, d]) => Math.hypot(x - kx, z - kz) >= d);
  const out = new Set(all.filter((s) => !clear(s.x, s.z)).map((s) => s.group)), left = all.filter((s) => !out.has(s.group));
  return left.slice(0, wholeGroups(left, count)).map(({ x, z, r, sit, face, blanket, group }) => ({ x, z, r, sit, face, blanket, group }));
}

/* Whether the room reached a group late or in time (parting). */
const LATE = 1, ON_TIME = 2;
/* A figure's arms come down over RISE_EASE s once it stands fully still, and go up again over as long once its stillness falls below
   RISE_HOLD; either way they keep to it for RISE_KEEP s at least (parting, `rising`). */
const RISE_EASE = 0.25, RISE_HOLD = 0.5, RISE_KEEP = 0.5;

/* The parting: the figures make room for the visitor. Each keeps `keep` m from the visitor's middle, halfway between their bear's feet
   and its head. Ahead of the visitor, as far as they walk in `lead` s, a figure steps across their way, and beside or behind them
   straight back from them, to the side it already stands on; where what it keeps clear of leaves it no room on that side and the other
   has room, it crosses ahead of them to the other, and keeps on while it needs room. It steps aside at `step` m/s, or, where the room
   reaches it already within half its lead, as a turn brings it, as fast as it must to be out of the way before the visitor's reach gets
   there, up to the visitor's own pace; and it walks back to its seat at `back` m/s once they have passed. It never comes nearer the
   visitor's middle than `reach`, or `hang` while it stands fully still with its arms all the way down. No figure moves farther in a
   frame than it steps aside, or than the visitor's middle moved where their reach pushed it, or pushed a figure that pushed it; its own
   step gives way first, and one the reach would push past that slides round the reach's edge. Figures whose seats stand nearer than
   `space` m move as one group; groups nearer each other than that push apart, `passes` neighbours out a frame, but for two walking
   back head on to seats each behind the other, which pass each other (apart). A figure walks no
   farther than `most` m from its seat; only a push takes one past that, while the visitor walks into it. It stands on the ground
   wherever it goes and keeps clear of what the seats keep clear of (`keeps`, keepOuts, each [x, z, distance]). A figure stands still
   once it has stepped 0.25 m aside, and so does any within `ring` m of it, fading over the last 0.5 m, and any within a metre past the
   visitor's reach; its arms come down over RISE_EASE s, and go up again over as long once its stillness falls below RISE_HOLD, keeping
   to either for RISE_KEEP s at least. Under reduced motion, and where the visitor arrives at once, each stands at once where it would
   end, or as near it as a second of the walk takes it. Each frame visits only the groups near the visitor and those still walking back,
   found on a grid of the seats, so its work does not grow with the crowd. `offset` holds each figure's [dx, dy, dz] from its seat and
   how still it stands (0-1), and `rising` how far each one's arms rise with the build-up (0-1); `step` moves the figures for a frame
   and returns whether any moved or eased its arms; `over` raises a camera over them, and `ahead` says how far it should climb now for
   them along its way and the most they will ask along it; `hold` stops the visitor's walker against a still figure that could not get
   out of the way; `farthest[0]` is how far the farthest figure stands from its seat. */
export function parting(placed, { keep, reach, hang, lead, step: pace, back, space, most, passes, ring, top, wide, clear, grade, keeps }) {
  const n = placed.length, CELL = 2, span = Math.ceil(space / CELL);
  const sx = new Float64Array(n), sz = new Float64Array(n), sy = new Float64Array(n), offset = new Float32Array(4 * n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const { x, z } = placed[i];
    sx[i] = x; sz[i] = z; sy[i] = height(x, z);
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  /* The grid, over the seats and `most` round them: a point's column and row, or those of the nearest cell off the grid. Where a large
     function cannot inline them (walk, kept), the same sums are written out, so that no number is boxed. */
  x0 -= most; z0 -= most; x1 += most; z1 += most;
  const cols = Math.floor((x1 - x0) / CELL) + 1, rows = Math.floor((z1 - z0) / CELL) + 1;
  const colAt = (x) => Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL)));
  const rowAt = (z) => Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / CELL)));
  /* An index of the grid: `each(use)` calls use(cell, item) for each cell an item falls in, and cell c holds items[first[c]] to
     items[first[c + 1] - 1]. */
  function index(each) {
    const first = new Int32Array(cols * rows + 1);
    each((c) => { first[c + 1] += 1; });
    for (let c = 0; c < cols * rows; c++) first[c + 1] += first[c];
    const items = new Int32Array(first[cols * rows]), fill = first.slice(0, cols * rows);
    each((c, i) => { items[fill[c]++] = i; });
    return { first, items };
  }
  /* The seats by cell, and what a figure the parting moves keeps clear of by the cells each reaches into. */
  const { first, items } = index((use) => { for (let i = 0; i < n; i++) use(rowAt(sz[i]) * cols + colAt(sx[i]), i); });
  /* The highest seat's ground in each cell, and in all of them, for the camera's floor (over); 3 m on for figures off their seats. */
  const cellTop = new Float64Array(cols * rows).fill(-Infinity);
  let topAll = -Infinity;
  for (let i = 0; i < n; i++) {
    const c = rowAt(sz[i]) * cols + colAt(sx[i]);
    cellTop[c] = Math.max(cellTop[c], sy[i]); topAll = Math.max(topAll, sy[i] + 3);
  }
  const kx = Float64Array.from(keeps, (k) => k[0]), kz = Float64Array.from(keeps, (k) => k[1]), kd = Float64Array.from(keeps, (k) => k[2]);
  const { first: kFirst, items: kItems } = index((use) => {
    for (let j = 0; j < keeps.length; j++) for (let r = rowAt(kz[j] - kd[j]); r <= rowAt(kz[j] + kd[j]); r++)
      for (let c = colAt(kx[j] - kd[j]); c <= colAt(kx[j] + kd[j]); c++) use(r * cols + c, j);
  });
  /* The groups: seats nearer than `space` joined, each figure's group, the members of group g (members[start[g]] onwards) and its
     middle, the mean of its seats. */
  const up = Int32Array.from({ length: n }, (_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  for (let i = 0; i < n; i++) for (let r = rowAt(sz[i] - space); r <= rowAt(sz[i] + space); r++)
    for (let c = colAt(sx[i] - space); c <= colAt(sx[i] + space); c++) for (let k = first[r * cols + c]; k < first[r * cols + c + 1]; k++) {
      const j = items[k], ax = sx[i] - sx[j], az = sz[i] - sz[j];
      if (j > i && Math.sqrt(ax * ax + az * az) < space) up[root(i)] = root(j);
    }
  const groupOf = new Int32Array(n), start = new Int32Array(n + 1), members = new Int32Array(n), slot = new Int32Array(n).fill(-1);
  let groups = 0;
  for (let i = 0; i < n; i++) { if (slot[root(i)] < 0) slot[root(i)] = groups++; groupOf[i] = slot[root(i)]; start[groupOf[i] + 1] += 1; }
  for (let g = 0; g < groups; g++) start[g + 1] += start[g];
  const put = start.slice(0, groups);
  for (let i = 0; i < n; i++) members[put[groupOf[i]]++] = i;
  const cx0 = new Float64Array(groups), cz0 = new Float64Array(groups);
  for (let i = 0; i < n; i++) { const g = groupOf[i], k = start[g + 1] - start[g]; cx0[g] += sx[i] / k; cz0[g] += sz[i] / k; }

  /* Each group's offset now and as this frame began; this frame's groups (`near`, `count` of them, marked with the frame's stamp) and
     the groups off their seats (`list`). */
  const gx = new Float64Array(groups), gz = new Float64Array(groups), qx = new Float64Array(groups), qz = new Float64Array(groups);
  const seen = new Uint32Array(groups), near = new Int32Array(groups), list = new Int32Array(groups);
  let stamp = 0, count = 0, offCount = 0;
  /* Each group's side of the visitor's way where it crosses to the far one (0 while it keeps to its own), and the frame the visitor's
     reach pushed it, or pushed a group that pushed it. */
  const sideOf = new Int8Array(groups), pushedAt = new Uint32Array(groups);
  /* Each group's own step this frame, toward where it would stand, which gives way first when the cap is reached; whether the room
     reached it late (LATE), already within half its lead of the visitor, as a turn brings it, or in time (ON_TIME), until it no longer
     needs room; and whether it needs room this frame (needy). A group's own step starts each frame at nothing, and its need at none, as
     the frame first visits it. */
  const ownX = new Float64Array(groups), ownZ = new Float64Array(groups), late = new Uint8Array(groups), needy = new Uint8Array(groups);
  const visit = (g) => {
    if (seen[g] !== stamp) { seen[g] = stamp; near[count++] = g; qx[g] = gx[g]; qz[g] = gz[g]; ownX[g] = 0; ownZ[g] = 0; needy[g] = 0; }
  };
  /* Of those, the groups that move this frame: off their seats or making room, and any they push (`act`, in the order they joined). */
  const acting = new Uint32Array(groups), act = new Int32Array(groups), order = new Int32Array(groups);
  let actCount = 0;
  const join = (g) => { visit(g); if (acting[g] !== stamp) { acting[g] = stamp; order[g] = actCount; act[actCount++] = g; } };
  /* This frame's figures by the cell they stand in now: a list from head1 through next1, and the cells used. */
  const head1 = new Int32Array(cols * rows).fill(-1), next1 = new Int32Array(n), usedCells = new Int32Array(n);
  let used = 0;
  /* The figures this step moved, each marked with the step's count. */
  const movedNow = new Int32Array(n), movedAt = new Uint32Array(n);
  let movedCount = 0, steps = 0;
  /* The figures standing still, this frame's and the last's, and how still each stands now. */
  const stillNow = new Int32Array(n), stillWas = new Int32Array(n), stillAt = new Uint32Array(n), still = new Float64Array(n);
  let stillCount = 0, wasCount = 0, round = 0;
  /* How far each figure's arms rise with the build-up (the shader's aRise): 1, eased to 0 once it stands fully still, and held there
     until its stillness falls below RISE_HOLD, so that a stillness that dips under 1 for a frame or a few moves no arms; when its hold
     last changed (`since`, s); and the figures easing or waiting to (`easing`, `easeCount` of them). */
  const rising = new Float32Array(n).fill(1), held = new Uint8Array(n), inEase = new Uint8Array(n), easing = new Int32Array(n);
  const since = new Float64Array(n).fill(-Infinity);
  let easeCount = 0;
  /* How many figures stand off their seats, and whether the last frame moved anyone. In arrays, so that a frame boxes no number: how far
     the farthest figure stands from its seat; and the visitor's middle (x, z), its velocity eased over 0.2 s (x, z) and its way (x, z),
     then a walk's length in s, how far ahead of the middle its room reaches, how far its farthest group moved, how far the middle
     moved this frame, the cap a group slides within (slide), how far a frame eases the arms (ease) and the time walked, in s; and a
     point for `kept` (probe). */
  let parted = 0, moved = false;
  const farthest = new Float64Array(1), at = Float64Array.of(NaN, NaN, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0), probe = new Float64Array(2);
  /* Keeps figure i and figure j, of another group, `space` m apart where they stand nearer. The group farther out of the visitor's way
     gives way, so the room is never pressed back into it; two as far out share it. Where neither needs room this frame (needy), the
     nearer its seats gives way, so one walking back is never held off by one at its seat that stands nearer the visitor, which would
     leave both where they stand; two as far from theirs share it. Two walking back head on, each 0.3 m and more off its seat and
     its way back toward the other, pass each other: pushed apart, they would stand in each other's way for good. How far out of the
     way a figure stands: from the line of it ahead of the visitor's middle (along it, `a`, and across it, `b`), from their middle
     behind it. */
  function apart(i, j) {
    const g = groupOf[i], h = groupOf[j];
    const xi = sx[i] + gx[g], zi = sz[i] + gz[g], xj = sx[j] + gx[h], zj = sz[j] + gz[h];
    const ax = xi - xj, az = zi - zj, d = Math.sqrt(ax * ax + az * az);
    if (d >= space - 1e-6) return false;
    const ux = d > 1e-9 ? ax / d : 1, uz = d > 1e-9 ? az / d : 0, gap = space - d;
    const mx = at[0], mz = at[1], wx = at[4], wz = at[5];
    const ai = (xi - mx) * wx + (zi - mz) * wz, bi = (zi - mz) * wx - (xi - mx) * wz, oi = ai >= 0 ? Math.abs(bi) : Math.sqrt(ai * ai + bi * bi);
    const aj = (xj - mx) * wx + (zj - mz) * wz, bj = (zj - mz) * wx - (xj - mx) * wz, oj = aj >= 0 ? Math.abs(bj) : Math.sqrt(aj * aj + bj * bj);
    let t = Math.min(1, Math.max(0, 0.5 + (oj - oi) / 0.2));
    if (needy[g] === 0 && needy[h] === 0) {
      const dg = Math.sqrt(gx[g] * gx[g] + gz[g] * gz[g]), dh = Math.sqrt(gx[h] * gx[h] + gz[h] * gz[h]);
      if (gx[g] * ux + gz[g] * uz > 0.5 * dg && -(gx[h] * ux + gz[h] * uz) > 0.5 * dh && dg > 0.3 && dh > 0.3) return false;
      t = Math.min(1, Math.max(0, 0.5 + (dg - dh) / 0.2));
    }
    gx[g] += ux * gap * (1 - t); gz[g] += uz * gap * (1 - t); gx[h] -= ux * gap * t; gz[h] -= uz * gap * t;
    if (pushedAt[g] === stamp) pushedAt[h] = stamp; else if (pushedAt[h] === stamp) pushedAt[g] = stamp;
    return true;
  }
  /* Whether the point in `probe` (x, z) stands inside what the figures keep clear of; its cell worked out here, as in `walk`. */
  function kept() {
    const x = probe[0], z = probe[1];
    const c = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL)));
    for (let q = kFirst[c]; q < kFirst[c + 1]; q++) {
      const j = kItems[q], ax = x - kx[j], az = z - kz[j];
      if (ax * ax + az * az < kd[j] * kd[j]) return true;
    }
    return false;
  }
  /* The side of the visitor's way group g steps to, `own` (1 or -1) being the one its middle stands on: that one, unless what it keeps
     clear of leaves it no room there and the other side has room, when it crosses ahead of the visitor, and keeps crossing while it
     needs room (sideOf). Apart from `walk`, with whole numbers in and out, so that no number is boxed. */
  function sideFor(g, own) {
    if (sideOf[g] !== 0) return sideOf[g];
    const mx = at[0], mz = at[1], wx = at[4], wz = at[5], cx = cx0[g] + gx[g], cz = cz0[g] + gz[g], across = (cz - mz) * wx - (cx - mx) * wz;
    probe[0] = cx - wz * (own * keep - across); probe[1] = cz + wx * (own * keep - across);
    if (!kept()) return own;
    probe[0] = cx + wz * (own * keep + across); probe[1] = cz - wx * (own * keep + across);
    return kept() ? own : -own;
  }
  /* Each of this frame's groups steps out of whatever its figures keep clear of, then, with `reaching`, out of the visitor's reach:
     wherever one of its figures stands nearer than a circle's distance from its centre, the group steps straight out from it to that
     distance. */
  function constrain(reaching) {
    for (let k = 0; k < actCount; k++) {
      const g = act[k];
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], x = sx[i] + gx[g], z = sz[i] + gz[g];
        const c = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL)));
        for (let q = kFirst[c]; q < kFirst[c + 1]; q++) {
          const j = kItems[q], ax = x - kx[j], az = z - kz[j], d = Math.sqrt(ax * ax + az * az);
          if (d < kd[j] && d > 1e-9) { gx[g] += (ax / d) * (kd[j] - d); gz[g] += (az / d) * (kd[j] - d); }
        }
      }
      if (reaching) for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], ax = sx[i] + gx[g] - at[0], az = sz[i] + gz[g] - at[1], d = Math.sqrt(ax * ax + az * az);
        const r = offset[4 * i + 3] >= 1 && rising[i] === 0 ? hang : reach;
        if (d < r && d > 1e-9) { gx[g] += (ax / d) * (r - d); gz[g] += (az / d) * (r - d); pushedAt[g] = stamp; }
      }
    }
  }
  /* No group moves farther in the frame than it steps aside, or than the visitor's middle moved where their reach pushed it or a group it
     pushed. Its own step gives way first, as much of it as the cap leaves room for beside the pushes, then the pushes; and one the cap
     leaves inside the reach slides round its edge. */
  function capAll() {
    const cap = pace * at[6], pushCap = Math.max(cap, at[9]);
    for (let k = 0; k < actCount; k++) {
      const g = act[k], ax = gx[g] - qx[g], az = gz[g] - qz[g], w = Math.sqrt(ax * ax + az * az);
      const lim = pushedAt[g] === stamp || late[g] === LATE ? pushCap : cap;
      if (w <= lim) continue;
      const px = ax - ownX[g], pz = az - ownZ[g], pp = px * px + pz * pz;
      if (pp < lim * lim) {
        const b = px * ownX[g] + pz * ownZ[g], o = ownX[g] * ownX[g] + ownZ[g] * ownZ[g];
        const f = o > 0 ? (-b + Math.sqrt(b * b + o * (lim * lim - pp))) / o : 0;
        ownX[g] *= f; ownZ[g] *= f;
        gx[g] = qx[g] + px + ownX[g]; gz[g] = qz[g] + pz + ownZ[g];
      } else {
        const p = Math.sqrt(pp);
        ownX[g] = 0; ownZ[g] = 0; gx[g] = qx[g] + (px * lim) / p; gz[g] = qz[g] + (pz * lim) / p;
      }
      at[10] = lim;
      slide(g);
    }
  }
  /* Holds group g within at[10] of where it stood as the frame began and, where that leaves a member inside the visitor's reach, slides
     the group round the reach's edge instead: to the nearest point on it that the cap allows. */
  function slide(g) {
    const lim = at[10];
    for (let t = 0; t < 2; t++) for (let m = start[g]; m < start[g + 1]; m++) {
      const i = members[m], cx = at[0] - sx[i], cz = at[1] - sz[i], ax = gx[g] - cx, az = gz[g] - cz, d = Math.sqrt(ax * ax + az * az);
      const r = offset[4 * i + 3] >= 1 && rising[i] === 0 ? hang : reach;
      if (d >= r || d < 1e-9) continue;
      let px = cx + (ax / d) * r, pz = cz + (az / d) * r;
      const bx = qx[g] - cx, bz = qz[g] - cz, e = Math.sqrt(bx * bx + bz * bz);
      const ox = px - qx[g], oz = pz - qz[g];
      if (ox * ox + oz * oz > lim * lim && e > 1e-9 && e <= r + lim && e >= Math.abs(r - lim)) {
        /* The two points where the reach's edge meets the cap's: the one nearer the edge's nearest point. */
        const a = (r * r - lim * lim + e * e) / (2 * e), h = Math.sqrt(Math.max(0, r * r - a * a));
        const mx = cx + (bx / e) * a, mz = cz + (bz / e) * a, nx = -bz / e, nz = bx / e;
        const s = (px - mx) * nx + (pz - mz) * nz >= 0 ? h : -h;
        px = mx + nx * s; pz = mz + nz * s;
      }
      gx[g] = px; gz[g] = pz;
    }
  }

  /* One frame of the figures' walk, at[6] s long, with the room reaching at[7] m ahead of the visitor's middle: each of this frame's
     groups toward where it would stand, then apart from the figures round it, clear of what it keeps clear of, out of the visitor's
     reach and within the frame's cap; then the figures' offsets. `relax` holds the groups where they stand and spaces them out at
     length, for a settle. It leaves how far the farthest group moved in at[8]; `changed` says whether an offset did. */
  let changed = false;
  function walk(relax) {
    const mx = at[0], mz = at[1], wx = at[4], wz = at[5], dt = at[6], ahead = at[7];
    stamp += 1; count = 0; actCount = 0;
    for (let k = 0; k < offCount; k++) visit(list[k]);
    /* The seats from `keep` behind the middle to `ahead` in front of it and `keep` to either side, and `space` round that. */
    const ex = Math.abs(wz) * keep + space, ez = Math.abs(wx) * keep + space;
    const fx = mx + wx * ahead, fz = mz + wz * ahead, bx = mx - wx * keep, bz = mz - wz * keep;
    /* Its cells, worked out here: a number passed to a call `walk` does not inline is boxed. */
    const ra = Math.min(rows - 1, Math.max(0, Math.floor((Math.min(fz, bz) - ez - z0) / CELL)));
    const rb = Math.min(rows - 1, Math.max(0, Math.floor((Math.max(fz, bz) + ez - z0) / CELL)));
    const ca = Math.min(cols - 1, Math.max(0, Math.floor((Math.min(fx, bx) - ex - x0) / CELL)));
    const cb = Math.min(cols - 1, Math.max(0, Math.floor((Math.max(fx, bx) + ex - x0) / CELL)));
    for (let r = ra; r <= rb; r++)
      for (let c = ca; c <= cb; c++)
        for (let k = first[r * cols + c]; k < first[r * cols + c + 1]; k++) visit(groupOf[items[k]]);

    /* Each group walks toward where it would stand: its seats, or as little off them as takes every member out of the room the visitor
       needs, on the side its middle stands on. */
    const visited = count, speed = Math.max(0.5, Math.sqrt(at[2] * at[2] + at[3] * at[3]));
    for (let k = 0; k < visited; k++) {
      const g = near[k], own = ((cz0[g] + gz[g] - mz) * wx - (cx0[g] + gx[g] - mx) * wz) >= 0 ? 1 : -1, side = sideFor(g, own);
      let tx = 0, tz = 0, need = 0, soon = Infinity;
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], ax = sx[i] - mx, az = sz[i] - mz, along = ax * wx + az * wz, across = az * wx - ax * wz;
        let ux = 0, uz = 0;
        if (along >= 0 && along <= ahead && Math.abs(across) < keep) {
          const s = side * keep - across;
          ux = -wz * s; uz = wx * s;
          if (along < soon) soon = along;
        } else if (along < 0 && Math.sqrt(ax * ax + az * az) < keep) {
          const rx = wx * along - wz * side * Math.abs(across), rz = wz * along + wx * side * Math.abs(across);
          const l = Math.sqrt(rx * rx + rz * rz);
          ux = mx + (l > 1e-9 ? rx / l : -wz * side) * keep - sx[i]; uz = mz + (l > 1e-9 ? rz / l : wx * side) * keep - sz[i];
        } else continue;
        const u = Math.sqrt(ux * ux + uz * uz);
        if (u > need) { need = u; tx = ux; tz = uz; }
      }
      sideOf[g] = need > 0 && side !== own ? side : 0;
      needy[g] = need > 0 ? 1 : 0;
      if (soon === Infinity) late[g] = 0; else if (need > 0 && late[g] === 0) late[g] = soon < keep + (ahead - keep) / 2 ? LATE : ON_TIME;
      if (need === 0 && gx[g] === 0 && gz[g] === 0) continue;
      join(g);
      if (relax) continue;
      /* It walks toward that, no farther than `most` from its seats. */
      if (need > most) { tx *= most / need; tz *= most / need; }
      /* At `pace`, or as fast as it must to be out of the way before the visitor's reach gets there, up to the visitor's own pace. */
      const ax = tx - gx[g], az = tz - gz[g], w = Math.sqrt(ax * ax + az * az);
      const cap = need === 0 ? back * dt
        : late[g] === LATE ? Math.max(pace * dt, Math.min(at[9], (w * dt) / Math.max(dt, (soon - reach) / speed))) : pace * dt;
      const t = w > cap ? cap / w : 1;
      ownX[g] = ax * t; ownZ[g] = az * t;
      gx[g] += ownX[g]; gz[g] += ownZ[g];
    }
    /* Then each group keeps its distance from the figures round it: one at its seat, from the seats' grid, and one of this frame's,
       from a grid of where they stand now, each pair once. At each pass they also keep clear and out of reach and, walking, within the
       cap (capAll). */
    for (let pass = 0; pass < (relax ? 32 : passes); pass++) {
      for (let t = 0; t < used; t++) head1[usedCells[t]] = -1;
      used = 0;
      for (let k = 0; k < actCount; k++) for (let m = start[act[k]]; m < start[act[k] + 1]; m++) {
        const i = members[m], g = act[k];
        const c = Math.min(rows - 1, Math.max(0, Math.floor((sz[i] + gz[g] - z0) / CELL))) * cols
          + Math.min(cols - 1, Math.max(0, Math.floor((sx[i] + gx[g] - x0) / CELL)));
        if (head1[c] < 0) usedCells[used++] = c;
        next1[i] = head1[c]; head1[c] = i;
      }
      /* A group pushed this pass pushes on from the next, so a push reaches `passes` neighbours out in a frame. */
      let pushed = false;
      const acted = actCount;
      for (let k = 0; k < acted; k++) {
        const g = act[k];
        for (let m = start[g]; m < start[g + 1]; m++) {
          /* A neighbour within `space` stands in the cells within `span` of the figure's own. */
          const i = members[m], r0 = Math.floor((sz[i] + gz[g] - z0) / CELL), c0 = Math.floor((sx[i] + gx[g] - x0) / CELL);
          for (let r = Math.max(0, r0 - span); r <= Math.min(rows - 1, r0 + span); r++)
          for (let c = Math.max(0, c0 - span); c <= Math.min(cols - 1, c0 + span); c++) {
            for (let q = first[r * cols + c]; q < first[r * cols + c + 1]; q++) {
              const h = groupOf[items[q]];
              if (h === g || acting[h] === stamp) continue;
              visit(h);
              if (apart(i, items[q])) { pushed = true; join(h); }
            }
            for (let j = head1[r * cols + c]; j >= 0; j = next1[j]) {
              const h = groupOf[j];
              if (h !== g && order[h] > k && order[h] < acted && apart(i, j)) pushed = true;
            }
          }
        }
      }
      constrain(true);
      if (!relax) capAll();
      if (!pushed) break;
    }
    /* What the cap held back can leave a group a little inside what it keeps clear of: it steps out of that last. */
    if (!relax) constrain(false);
    let far = 0;
    offCount = 0; parted = 0;
    for (let k = 0; k < actCount; k++) {
      const g = act[k];
      const ax = gx[g] - qx[g], az = gz[g] - qz[g], o = Math.sqrt(gx[g] * gx[g] + gz[g] * gz[g]);
      far = Math.max(far, Math.sqrt(ax * ax + az * az));
      if (o < 1e-4) { gx[g] = 0; gz[g] = 0; } else { list[offCount++] = g; parted += start[g + 1] - start[g]; }
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], ox = Math.fround(gx[g]), oz = Math.fround(gz[g]);
        if (offset[4 * i] === ox && offset[4 * i + 2] === oz) continue;
        offset[4 * i] = ox; offset[4 * i + 2] = oz;
        if (movedAt[i] !== steps) { movedAt[i] = steps; movedNow[movedCount++] = i; }
        changed = true;
      }
    }
    at[8] = far;
  }
  /* Stands each figure this step moved on the ground where it now stands, and finds the farthest of all from its seat. */
  function place() {
    for (let k = 0; k < movedCount; k++) {
      const i = movedNow[k];
      offset[4 * i + 1] = offset[4 * i] === 0 && offset[4 * i + 2] === 0 ? 0
        : Math.fround(height(sx[i] + offset[4 * i], sz[i] + offset[4 * i + 2]) - sy[i]);
    }
    let far = 0;
    for (let k = 0; k < offCount; k++) for (let m = start[list[k]]; m < start[list[k] + 1]; m++) {
      const i = members[m], ox = offset[4 * i], oy = offset[4 * i + 1], oz = offset[4 * i + 2];
      far = Math.max(far, Math.sqrt(ox * ox + oy * oy + oz * oz));
    }
    farthest[0] = far;
  }

  function step(dt, feet, head, settle) {
    const cx = (feet.x + head.x) / 2, cz = (feet.z + head.z) / 2;
    /* At once under reduced motion, on the first frame, and where the visitor moved more than 3 m since the last. */
    const dx = cx - at[0], dz = cz - at[1], now = settle || !(Math.sqrt(dx * dx + dz * dz) <= 3);
    if (now) { at[2] = 0; at[3] = 0; }
    else if (dt > 0) {
      const k = 1 - Math.exp(-dt / 0.2);
      at[2] += ((cx - at[0]) / dt - at[2]) * k; at[3] += ((cz - at[1]) / dt - at[3]) * k;
      if (Math.sqrt(at[2] * at[2] + at[3] * at[3]) < 0.01) { at[2] = 0; at[3] = 0; }
    }
    if (dt > 0) at[12] += dt;
    if (cx === at[0] && cz === at[1] && at[2] === 0 && at[3] === 0 && !moved) { at[11] = settle ? 1 : dt / RISE_EASE; return ease(); }
    at[9] = now ? 0 : Math.sqrt(dx * dx + dz * dz);
    at[0] = cx; at[1] = cz;
    /* The way: where the visitor moves, or where their bear faces below 0.5 m/s. */
    const speed = Math.sqrt(at[2] * at[2] + at[3] * at[3]);
    if (speed > 0.5) { at[4] = at[2] / speed; at[5] = at[3] / speed; }
    else { const fx = head.x - feet.x, fz = head.z - feet.z, l = Math.sqrt(fx * fx + fz * fz) || 1; at[4] = fx / l; at[5] = fz / l; }
    changed = false; steps += 1; movedCount = 0;
    /* At once, the figures walk on in 1/30 s steps, the visitor standing, until none moves a millimetre or a second has passed: where the
       walk would leave them; then they space themselves out where they stand. */
    if (now) {
      at[6] = 1 / 30; at[7] = keep;
      for (let k = 0; k < 30; k++) { walk(false); if (at[8] <= 1e-3) break; }
      at[6] = 0; walk(true);
      moved = false;
    } else {
      at[6] = dt; at[7] = keep + (speed > 0.5 ? speed * lead : 0);
      walk(false);
      moved = at[8] > 0;
    }
    if (changed) { place(); stand(); follow(); }
    at[11] = now ? 1 : dt / RISE_EASE;
    const eased = ease();
    return changed || eased;
  }

  /* How still each figure stands: still, one off its seat by 0.25 m or more, and any within `ring` m of it, fading over the last 0.5 m. */
  function mark(j, v) {
    if (stillAt[j] !== round) { stillAt[j] = round; still[j] = 0; stillNow[stillCount++] = j; }
    if (v > still[j]) still[j] = v;
  }
  function stand() {
    round += 1;
    for (let k = 0; k < stillCount; k++) stillWas[k] = stillNow[k];
    wasCount = stillCount; stillCount = 0;
    for (let k = 0; k < offCount; k++) {
      const g = list[k], own = Math.min(1, Math.sqrt(gx[g] * gx[g] + gz[g] * gz[g]) / 0.25);
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], xi = sx[i] + gx[g], zi = sz[i] + gz[g];
        mark(i, own);
        for (let r = rowAt(zi - ring); r <= rowAt(zi + ring); r++) for (let c = colAt(xi - ring); c <= colAt(xi + ring); c++)
          for (let q = first[r * cols + c]; q < first[r * cols + c + 1]; q++) {
            const j = items[q], h = groupOf[j], ax = sx[j] + gx[h] - xi, az = sz[j] + gz[h] - zi, d2 = ax * ax + az * az;
            if (j !== i && d2 < ring * ring) mark(j, own * Math.min(1, (ring - Math.sqrt(d2)) / 0.5));
          }
      }
    }
    /* And so does any figure within a metre past the reach of the visitor's middle, at its seat or off it, so that none near their bear
       raises its arms, and the reach it keeps from them changes only once while it is near, when its arms are down. */
    const mx = at[0], mz = at[1], nr = reach + 1;
    for (let r = rowAt(mz - nr); r <= rowAt(mz + nr); r++) for (let c = colAt(mx - nr); c <= colAt(mx + nr); c++)
      for (let q = first[r * cols + c]; q < first[r * cols + c + 1]; q++) {
        const j = items[q], h = groupOf[j], ax = sx[j] - mx, az = sz[j] - mz;
        if (gx[h] === 0 && gz[h] === 0 && ax * ax + az * az < nr * nr) mark(j, 1);
      }
    for (let k = 0; k < offCount; k++) for (let m = start[list[k]]; m < start[list[k] + 1]; m++) {
      const j = members[m], ax = sx[j] + gx[list[k]] - mx, az = sz[j] + gz[list[k]] - mz;
      if (ax * ax + az * az < nr * nr) mark(j, 1);
    }
    for (let k = 0; k < stillCount; k++) {
      const j = stillNow[k], v = Math.fround(still[j]);
      if (offset[4 * j + 3] !== v) { offset[4 * j + 3] = v; changed = true; }
    }
    for (let k = 0; k < wasCount; k++) {
      const j = stillWas[k];
      if (stillAt[j] !== round && offset[4 * j + 3] !== 0) { offset[4 * j + 3] = 0; changed = true; }
    }
  }
  /* Sets easing each figure whose stillness this frame may change its hold or its arms: the frame's still figures and those that just
     left them. Apart from `stand`, which then inlines `mark`, so that its numbers are not boxed. */
  function follow() {
    for (let k = 0; k < stillCount; k++) track(stillNow[k]);
    for (let k = 0; k < wasCount; k++) if (stillAt[stillWas[k]] !== round) track(stillWas[k]);
  }
  /* Whether figure j would be held still: from the frame it stands fully still until its stillness falls below RISE_HOLD. */
  function wants(j) {
    const w = offset[4 * j + 3];
    return w >= 1 ? 1 : w < RISE_HOLD ? 0 : held[j];
  }
  /* Sets figure j easing where its hold or its arms do not yet match its stillness. */
  function track(j) {
    if (inEase[j] === 0 && (wants(j) !== held[j] || rising[j] !== 1 - held[j])) { inEase[j] = 1; easing[easeCount++] = j; }
  }
  /* For each figure in `easing`: changes its hold where its stillness asks, once RISE_KEEP s have passed since the last change (at once
     with at[11] at 1), and eases its arms toward 0 while it is held and 1 otherwise, by at[11] a frame. Returns whether any moved. */
  function ease() {
    const by = at[11], t = at[12];
    let any = false;
    for (let k = 0; k < easeCount; ) {
      const j = easing[k], want = wants(j);
      if (want !== held[j] && (by >= 1 || t - since[j] >= RISE_KEEP)) { held[j] = want; since[j] = t; }
      const to = 1 - held[j], r = rising[j];
      if (r !== to) { rising[j] = to > r ? Math.min(to, r + by) : Math.max(to, r - by); any = true; }
      if (rising[j] === to && want === held[j]) { inEase[j] = 0; easing[k] = easing[--easeCount]; } else k++;
    }
    return any;
  }

  /* Raises a camera at `point` (anything with x, y and z) as high as it must stand to keep `clear` m out of every figure: `clear` over a
     figure's highest point, `top` m over its feet, within `wide` + `clear` m of where it stands, `wide` being its farthest reach, and
     `grade` m lower for each metre past that, out to wherever that falls below the camera, so the height it asks for changes no faster
     than `grade` m a metre the camera or a figure moves. A cell of the grid whose highest seat could not reach the camera is passed
     over (cellTop). */
  function over(point) {
    const x = point.x, z = point.z, r = wide + clear, y0 = point.y, far = r + Math.max(0, topAll + top + clear - y0) / grade;
    let y = y0;
    for (let rr = rowAt(z - far); rr <= rowAt(z + far); rr++) for (let c = colAt(x - far); c <= colAt(x + far); c++) {
      const cell = rr * cols + c, ex = Math.max(0, x0 + c * CELL - x, x - x0 - (c + 1) * CELL), ez = Math.max(0, z0 + rr * CELL - z, z - z0 - (rr + 1) * CELL);
      if (cellTop[cell] + top + clear - grade * Math.max(0, Math.sqrt(ex * ex + ez * ez) - r) <= y) continue;
      for (let q = first[cell]; q < first[cell + 1]; q++) {
        const i = items[q], g = groupOf[i], ax = sx[i] - x, az = sz[i] - z;
        if (gx[g] === 0 && gz[g] === 0) y = Math.max(y, sy[i] + top + clear - grade * Math.max(0, Math.sqrt(ax * ax + az * az) - r));
      }
    }
    for (let k = 0; k < offCount; k++) for (let m = start[list[k]]; m < start[list[k] + 1]; m++) {
      const i = members[m], ax = sx[i] + offset[4 * i] - x, az = sz[i] + offset[4 * i + 2] - z;
      y = Math.max(y, sy[i] + offset[4 * i + 1] + top + clear - grade * Math.max(0, Math.sqrt(ax * ax + az * az) - r));
    }
    point.y = y;
  }

  /* Room for the camera's height at each look along its way (ahead); and the ground's height every CELL m over the grid and AWAY m
     round it, as far as a running camera's way reaches past the crowd, read between the four nearest. */
  const MAX_LOOKS = 64, base = new Float64Array(MAX_LOOKS + 1);
  const AWAY = 40, gcols = cols + (2 * AWAY) / CELL + 1, grows = rows + (2 * AWAY) / CELL + 1, gx0 = x0 - AWAY, gz0 = z0 - AWAY;
  const ground = new Float64Array(gcols * grows);
  for (let r = 0; r < grows; r++) for (let c = 0; c < gcols; c++) ground[r * gcols + c] = height(gx0 + c * CELL, gz0 + r * CELL);

  /* How much higher than a camera at `point` (x, y and z), moving at way[0-2] m/s, the figures will ask it to stand (over) along that way,
     read at way[4] times (at most MAX_LOOKS) out to way[3] s, less what climbing at way[5] m/s covers by each: raised that far now and
     climbing from there, it stands as high as they ask when it gets there (way[6]); and the most they will ask along it (way[7]). Along
     its way the camera stands the lower of where its own climb takes it and as high over the ground as now (base); a parted figure is
     read where it stands and at its seat, which it goes back to. In `way`, so that no number is boxed; one pass over the figures near
     the way reads each at every look. */
  function ahead(point, way) {
    const vx = way[0], vy = way[1], vz = way[2], span = way[3], looks = Math.min(MAX_LOOKS, way[4]), climb = way[5];
    const r = wide + clear, x = point.x, z = point.z, y = point.y, ex = x + vx * span, ez = z + vz * span;
    let above = 0, low = y;
    for (let k = 0; k <= looks; k++) {
      const t = (k * span) / looks, u = (x + vx * t - gx0) / CELL, w = (z + vz * t - gz0) / CELL;
      const c = Math.min(gcols - 2, Math.max(0, Math.floor(u))), rw = Math.min(grows - 2, Math.max(0, Math.floor(w)));
      const fu = Math.min(1, Math.max(0, u - c)), fw = Math.min(1, Math.max(0, w - rw)), q = rw * gcols + c;
      const under = (ground[q] + (ground[q + 1] - ground[q]) * fu) * (1 - fw) + (ground[q + gcols] + (ground[q + gcols + 1] - ground[q + gcols]) * fu) * fw;
      if (k === 0) above = y - under;
      else {
        base[k] = Math.min(y + vy * t, under + above);
        if (base[k] < low) low = base[k];
      }
    }
    const out = r + Math.max(0, topAll + top + clear - low) / grade;
    let most = 0, hold = 0;
    for (let rr = rowAt(Math.min(z, ez) - out); rr <= rowAt(Math.max(z, ez) + out); rr++)
      for (let c = colAt(Math.min(x, ex) - out); c <= colAt(Math.max(x, ex) + out); c++) {
        const cell = rr * cols + c;
        if (cellTop[cell] === -Infinity) continue;
        for (let q = first[cell]; q < first[cell + 1]; q++) {
          const i = items[q], g = groupOf[i];
          if (gx[g] !== 0 || gz[g] !== 0) continue;
          const px = sx[i] - x, pz = sz[i] - z, py = sy[i] + top + clear;
          for (let k = 1; k <= looks; k++) {
            const t = (k * span) / looks, ax = px - vx * t, az = pz - vz * t;
            const ask = py - grade * Math.max(0, Math.sqrt(ax * ax + az * az) - r) - base[k];
            if (ask > hold) hold = ask;
            if (ask - climb * t > most) most = ask - climb * t;
          }
        }
      }
    /* A parted figure where it stands (s at 1) and at its seat (s at 0). */
    for (let j = 0; j < offCount; j++) for (let m = start[list[j]]; m < start[list[j] + 1]; m++) {
      const i = members[m];
      for (let s = 1; s >= 0; s--) {
        const px = sx[i] + s * offset[4 * i] - x, pz = sz[i] + s * offset[4 * i + 2] - z, py = sy[i] + s * offset[4 * i + 1] + top + clear;
        for (let k = 1; k <= looks; k++) {
          const t = (k * span) / looks, ax = px - vx * t, az = pz - vz * t;
          const ask = py - grade * Math.max(0, Math.sqrt(ax * ax + az * az) - r) - base[k];
          if (ask > hold) hold = ask;
          if (ask - climb * t > most) most = ask - climb * t;
        }
      }
    }
    way[6] = most; way[7] = hold;
  }

  /* Holds the walker (x, z and heading, as main.js keeps it) back from any figure that has stepped aside and stands still, its arms all
     the way down, within `hang` of their bear's middle, 0.4 m ahead of the walker (avatar.js): one the walk could not get out of the
     way, which their bear stops against, as against anyone who cannot give way, and slides round. */
  function hold(walker) {
    for (let t = 0; t < 2; t++) {
      const mx = walker.x - 0.4 * Math.sin(walker.heading), mz = walker.z - 0.4 * Math.cos(walker.heading);
      for (let k = 0; k < offCount; k++) for (let m = start[list[k]]; m < start[list[k] + 1]; m++) {
        const i = members[m];
        if (offset[4 * i + 3] < 1 || rising[i] !== 0) continue;
        const ax = mx - sx[i] - offset[4 * i], az = mz - sz[i] - offset[4 * i + 2], d = Math.sqrt(ax * ax + az * az);
        if (d < hang && d > 1e-9) { walker.x += (ax / d) * (hang - d); walker.z += (az / d) * (hang - d); }
      }
    }
  }

  return { offset, rising, step, over, ahead, hold, farthest, get parted() { return parted; } };
}

/* How the world reads a track's title: one rule for every part of it that asks whether a track is Drums, Space, the band tuning or a
   song. A title names its songs between the marks that join them, the segue marks (">", "->" or "/") and a spaced " - ", " & " or
   " and ", each by its whole name: its letters and digits alone, lower case, and without what a parenthesis holds, unless the title
   names nothing outside one, as "(Tuning)" does. A track is Drums when one of its songs is Drums. It is Space only when Space is all
   it holds, as the crowd sits through Space: a track that Space shares with Drums or a song counts as that, so "Space > The Wheel" is
   a song. It is not a song when it names something and none of what it names is a song: the band tuning or the crowd's noise between
   songs, or a break, between the sets or before the encore. It is the band tuning when the tuning is among those names, so
   "crowd - tuning" is the tuning and "Tuning > Drums" is Drums. So a song with one of these words inside its name is still that song,
   as is a song whose name holds a join ("Me & My Uncle"), and "The Other One Space >", one name with no segue mark, is a song, not
   Space. A track is a song unless its title says otherwise, so a title that names nothing, such as "./-", is a song. */
const BREAK = /^(set(\d|one|two|i|ii)?)?break(\d|one|two|i|ii)?$|^intermission$/, BETWEEN = /^(tuning|crowd|crowdnoise)$/;
const notASong = (name) => BETWEEN.test(name) || name === "encorebreak" || BREAK.test(name);
const namesIn = (text) => text.split(/->|>|\/|\s+[-&]\s+|\s+and\s+/).map((name) => name.replace(/[^a-z0-9]/g, "")).filter(Boolean);
export const songsOf = (title) => { const t = title.toLowerCase(), names = namesIn(t.replace(/\([^)]*\)/g, "")); return names.length > 0 ? names : namesIn(t); };
export const isDrums = (title) => songsOf(title).includes("drums");
export const isSpace = (title) => { const names = songsOf(title); return names.length > 0 && names.every((name) => name === "space"); };
export const isNotASong = (title) => { const names = songsOf(title); return names.length > 0 && names.every(notASong); };
export const isTuning = (title) => { const names = songsOf(title); return names.includes("tuning") && names.every(notASong); };
/* The band tuning or the crowd's noise between songs, with a break or without, and no song. A break alone is not between songs. */
export const isBetweenSongs = (title) => { const names = songsOf(title); return names.some((name) => BETWEEN.test(name)) && names.every(notASong); };

/* What the crowd does through each of the show's tracks ({ title, duration } each, in s) and where set 2 starts: it dances while a
   song plays, Drums and Space among them, and stands still through what is not a song (tuning, crowd noise, a break); it sits in Space,
   still dancing, and through the set break. Where `set2Start` is known, the set break is what is not a song just before set 2. Where
   it is not, it is a track named a break after the first song; else, of the runs of tracks that are not songs between the first song
   and the last, the one whose middle falls nearest 45 % of the show's running time, between 30 and 60 %, where set 1 ends; another
   such run, a tuning inside a set, stands. Before the first song the crowd stands, waiting for the band, and through an encore break,
   calling for more. Each track gets { dance, sit }. */
export function crowdPlan(tracks, set2Start) {
  const parts = tracks.map((t) => songsOf(t.title)), song = tracks.map((t) => !isNotASong(t.title));
  const first = song.indexOf(true), last = song.lastIndexOf(true);
  const brk = tracks.map(() => false);
  if (set2Start !== null) for (let i = set2Start - 1; i > first && first >= 0 && !song[i]; i--) brk[i] = true;
  else parts.forEach((p, i) => { brk[i] = first >= 0 && i > first && p.length > 0 && p.every((name) => BREAK.test(name)); });
  if (set2Start === null && !brk.includes(true)) {
    const total = tracks.reduce((sum, t) => sum + t.duration, 0);
    let from = 0, best = -1, end = -1, near = Infinity;
    for (let i = 0, j = 0; i < tracks.length; i = j) {
      const t0 = from;
      for (j = i; j < tracks.length && (j === i || song[j] === song[i]); j++) from += tracks[j].duration;
      const mid = (t0 + from) / 2 / total;
      if (!song[i] && i > first && j - 1 < last && mid >= 0.3 && mid <= 0.6 && Math.abs(mid - 0.45) < near) { near = Math.abs(mid - 0.45); best = i; end = j; }
    }
    for (let i = best; i >= 0 && i < end; i++) brk[i] = true;
  }
  return tracks.map((t, i) => ({ dance: song[i], sit: isSpace(t.title) || brk[i] }));
}
