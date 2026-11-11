/* eslint-disable */
import { FACING, height, STAGE } from "./ground.js";

/* Where the crowd on the hill stands (crowd.js draws it), and what it does through the show, as plain numbers: no three import, so the
   unit tests load it. */

/* A figure stands this tall: the band's height on the stage (stage.js), so the bears' 4.85 m is about one and a half people. */
export const PERSON = 3.15;

/* The crowd's sections, in rings round the stage's centre: `r0` to `r1` metres out, and `a0` to `a1` radians either side of its axis
   (from 0, one span across the axis). A section's rows stand `gap` metres apart, and its figures about as far apart along a row; the
   front stands closest. Up the hill they sit. */
const SECTIONS = [
  { r0: 13.5, r1: 28, a0: 0, a1: 0.7, gap: 1.6 },
  { r0: 28, r1: 42, a0: 0, a1: 0.85, gap: 2.6 },
  { r0: 42, r1: 55, a0: 0, a1: 0.85, gap: 3.8, sit: true },
  { r0: 16, r1: 28, a0: 0.7, a1: 1, gap: 5.2 },
  { r0: 28, r1: 44, a0: 0.85, a1: 1, gap: 5.2 },
];
/* How near the sections come to the stage's centre, and how far they reach from it. */
const NEAR = Math.min(...SECTIONS.map((s) => s.r0)), FAR = Math.max(...SECTIONS.map((s) => s.r1));

/* How far a figure's place keeps from the path, from the bears' line, from a landmark's bounds, and to either side of the stage's axis,
   which leaves an aisle up the middle of the crowd for the walk down to the stage, in metres. */
const KEEP = { path: 4, line: 4, landmark: 1.5, aisle: 3 };

/* What a figure keeps clear of, each [x, z, distance]: the points of `path` and `line` ([x, z] each) and `landmarks`, each a circle
   [x, z, radius] round one, those near the crowd. */
export function keepOuts({ path, line, landmarks }) {
  return [
    ...path.map(([x, z]) => [x, z, KEEP.path]),
    ...line.map(([x, z]) => [x, z, KEEP.line]),
    ...landmarks.map(([x, z, radius]) => [x, z, radius + KEEP.landmark]),
  ].filter(([x, z, d]) => Math.hypot(x - STAGE[0], z - STAGE[1]) < FAR + d);
}

/* The seats, front first: each { x, z, r, sit }, `r` metres from the stage's centre. Rows of each section, jittered the same way every
   day, keep clear of the aisle and of what keepOuts names. Front first with a random spread, so any count of the first seats keeps the
   crowd's shape and thins the back of the hill first. */
export function seats(around) {
  let s = 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const keeps = keepOuts(around);
  const clear = (x, z) => keeps.every(([kx, kz, d]) => Math.hypot(x - kx, z - kz) >= d);
  const out = [];
  for (const { r0, r1, a0, a1, gap, sit = false } of SECTIONS) {
    const spans = a0 === 0 ? [[-a1, a1]] : [[a0, a1], [-a1, -a0]];
    for (let row = r0 + gap / 2; row < r1; row += gap) {
      for (const [lo, hi] of spans) {
        const n = Math.max(1, Math.floor(((hi - lo) * row) / gap));
        for (let k = 0; k < n; k++) {
          const r = row + (rnd() - 0.5) * 0.7 * gap, th = lo + ((k + 0.5) * (hi - lo)) / n + ((rnd() - 0.5) * 0.7 * gap) / row;
          const x = STAGE[0] + r * Math.sin(FACING + th), z = STAGE[1] + r * Math.cos(FACING + th);
          const key = rnd() * (0.4 + (r - NEAR) / (FAR - NEAR));
          if (Math.abs(r * Math.sin(th)) >= KEEP.aisle && clear(x, z)) out.push({ x, z, r, sit, key });
        }
      }
    }
  }
  return out.sort((a, b) => a.key - b.key).map(({ key, ...seat }) => seat);
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
   `space` m move as one group; groups nearer each other than that push apart, `passes` neighbours out a frame. A figure walks no
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
  /* Each group's own step this frame, toward where it would stand, which gives way first when the cap is reached; and whether the room
     reached it late (LATE), already within half its lead of the visitor, as a turn brings it, or in time (ON_TIME), until it no longer
     needs room. A group's own step starts each frame at nothing, as the frame first visits it. */
  const ownX = new Float64Array(groups), ownZ = new Float64Array(groups), late = new Uint8Array(groups);
  const visit = (g) => {
    if (seen[g] !== stamp) { seen[g] = stamp; near[count++] = g; qx[g] = gx[g]; qz[g] = gz[g]; ownX[g] = 0; ownZ[g] = 0; }
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
     gives way, so the room is never pressed back into it; two as far out share it. How far out of the way a figure stands: from the line
     of it ahead of the visitor's middle (along it, `a`, and across it, `b`), from their middle behind it. */
  function apart(i, j) {
    const g = groupOf[i], h = groupOf[j];
    const xi = sx[i] + gx[g], zi = sz[i] + gz[g], xj = sx[j] + gx[h], zj = sz[j] + gz[h];
    const ax = xi - xj, az = zi - zj, d = Math.sqrt(ax * ax + az * az);
    if (d >= space - 1e-6) return false;
    const ux = d > 1e-9 ? ax / d : 1, uz = d > 1e-9 ? az / d : 0, gap = space - d;
    const mx = at[0], mz = at[1], wx = at[4], wz = at[5];
    const ai = (xi - mx) * wx + (zi - mz) * wz, bi = (zi - mz) * wx - (xi - mx) * wz, oi = ai >= 0 ? Math.abs(bi) : Math.sqrt(ai * ai + bi * bi);
    const aj = (xj - mx) * wx + (zj - mz) * wz, bj = (zj - mz) * wx - (xj - mx) * wz, oj = aj >= 0 ? Math.abs(bj) : Math.sqrt(aj * aj + bj * bj);
    const t = Math.min(1, Math.max(0, 0.5 + (oj - oi) / 0.2));
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
   song. A title names its songs between the segue marks (">", "->" or "/"), each by its whole name: its letters and digits alone,
   lower case, and without what a parenthesis holds, unless the title names nothing outside one, as "(Tuning)" does. A track is Drums
   when one of its songs is Drums. It is Space only when Space is all it holds, as the crowd sits through Space: a track that Space
   shares with Drums or a song counts as that, so "Space > The Wheel" is a song. It is not a song when it names something and none of
   what it names is a song: the band tuning or the crowd's noise between songs, or a break, between the sets or before the encore. It
   is the band tuning when the tuning is among those names, so "Tuning > Drums" is Drums. So a song with one of these words inside its
   name is still that song, and "The Other One Space >", one name with no segue mark, is a song, not Space. A track is a song unless
   its title says otherwise, so a title that names nothing, such as "./-", is a song. */
const BREAK = /^(set(\d|one|two|i|ii)?)?break(\d|one|two|i|ii)?$|^intermission$/, BETWEEN = /^(tuning|crowd|crowdnoise)$/;
const notASong = (name) => BETWEEN.test(name) || name === "encorebreak" || BREAK.test(name);
const namesIn = (text) => text.split(/->|>|\//).map((name) => name.replace(/[^a-z0-9]/g, "")).filter(Boolean);
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
