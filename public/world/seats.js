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

/* The parting: the figures make room for the visitor. Each keeps `keep` m from the visitor's middle, halfway between their bear's feet
   and its head, and never comes nearer than `reach`. Ahead of the visitor, as far as they walk in `lead` s, a figure steps across their
   way, and beside or behind them straight back from them, each time to the side it already stands on, so it never crosses their path.
   It steps aside at `step` m/s at most and walks back to its seat at `back` m/s once they have passed; it stands on the ground wherever
   it goes, keeps clear of what the seats keep clear of (`keeps`, keepOuts, each [x, z, distance]) and strays no more than `most` m
   from its seat. Figures whose seats stand nearer than `space` m move as one group, so they keep to each other as they stood, and a
   group keeps `space` m from every other figure. A figure stands still once it has stepped 0.25 m aside, and so does any within `ring`
   m of it, so no dancer's arms reach it. Under reduced motion, and where the visitor arrives at once, each stands at once where it would
   end. Each frame visits only the groups near the visitor and those still walking back, found on a grid of the seats, so its work does
   not grow with the crowd. `offset` holds each figure's [dx, dy, dz] from its seat and how still it stands (0-1); `step` moves the
   figures for a frame and returns whether any moved; `over` is how high a camera must keep over them. */
export function parting(placed, { keep, reach, lead, step: pace, back, space, most, passes, ring, top, wide, clear, keeps }) {
  const n = placed.length, CELL = 2, len = (x, z) => Math.sqrt(x * x + z * z);
  const sx = new Float64Array(n), sz = new Float64Array(n), sy = new Float64Array(n), offset = new Float32Array(4 * n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const { x, z } = placed[i];
    sx[i] = x; sz[i] = z; sy[i] = height(x, z);
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  /* The grid, over the seats and `most` round them: a point's column and row, or those of the nearest cell off the grid. */
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
      const j = items[k];
      if (j > i && len(sx[i] - sx[j], sz[i] - sz[j]) < space) up[root(i)] = root(j);
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
  const visit = (g) => { if (seen[g] !== stamp) { seen[g] = stamp; near[count++] = g; qx[g] = gx[g]; qz[g] = gz[g]; } };
  /* Of those, the groups that move this frame: off their seats or making room, and any they push (`act`, in the order they joined). */
  const acting = new Uint32Array(groups), act = new Int32Array(groups), order = new Int32Array(groups);
  let actCount = 0;
  const join = (g) => { visit(g); if (acting[g] !== stamp) { acting[g] = stamp; order[g] = actCount; act[actCount++] = g; } };
  /* This frame's figures by the cell they stand in now: a list from head1 through next1, and the cells used. */
  const head1 = new Int32Array(cols * rows).fill(-1), next1 = new Int32Array(n), usedCells = new Int32Array(n);
  let used = 0;
  /* The figures standing still, this frame's and the last's, and how still each stands now. */
  const stillNow = new Int32Array(n), stillWas = new Int32Array(n), stillAt = new Uint32Array(n), still = new Float64Array(n);
  let stillCount = 0, wasCount = 0, round = 0;
  /* How far the farthest figure stands from its seat, and how many stand off theirs. */
  let farthest = 0, parted = 0;

  /* The visitor's middle, its velocity eased over 0.2 s, and its way; whether the last frame moved anyone. */
  let mx = NaN, mz = NaN, vx = 0, vz = 0, wx = 0, wz = 1, moved = false;
  /* How far a point stands out of the visitor's way: from the line of it ahead of their middle, from their middle behind it. */
  const outOfWay = (x, z) => {
    const a = (x - mx) * wx + (z - mz) * wz, b = (z - mz) * wx - (x - mx) * wz;
    return a >= 0 ? Math.abs(b) : len(a, b);
  };
  /* Keeps figure i and figure j, of another group, `space` m apart where they stand nearer. The group farther out of the visitor's way
     gives way, so the room is never pressed back into it; two as far out share it. */
  function apart(i, j) {
    const g = groupOf[i], h = groupOf[j];
    const xi = sx[i] + gx[g], zi = sz[i] + gz[g], xj = sx[j] + gx[h], zj = sz[j] + gz[h];
    const ax = xi - xj, az = zi - zj, d = len(ax, az);
    if (d >= space - 1e-6) return false;
    const ux = d > 1e-9 ? ax / d : 1, uz = d > 1e-9 ? az / d : 0, gap = space - d;
    const t = Math.min(1, Math.max(0, 0.5 + (outOfWay(xj, zj) - outOfWay(xi, zi)) / 0.2));
    gx[g] += ux * gap * (1 - t); gz[g] += uz * gap * (1 - t); gx[h] -= ux * gap * t; gz[h] -= uz * gap * t;
    return true;
  }
  /* Steps group g out to `limit` m from (px, pz) where its figure at (x, z) stands nearer. */
  function pushOut(g, x, z, px, pz, limit) {
    const ax = x - px, az = z - pz, d = len(ax, az);
    if (d < limit && d > 1e-9) { gx[g] += (ax / d) * (limit - d); gz[g] += (az / d) * (limit - d); }
  }
  /* Each of this frame's groups steps out of whatever its figures keep clear of, then out of the visitor's reach. */
  function constrain() {
    for (let k = 0; k < actCount; k++) {
      const g = act[k];
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], x = sx[i] + gx[g], z = sz[i] + gz[g], c = rowAt(z) * cols + colAt(x);
        for (let q = kFirst[c]; q < kFirst[c + 1]; q++) pushOut(g, x, z, kx[kItems[q]], kz[kItems[q]], kd[kItems[q]]);
      }
      for (let m = start[g]; m < start[g + 1]; m++) pushOut(g, sx[members[m]] + gx[g], sz[members[m]] + gz[g], mx, mz, reach);
    }
  }

  /* One frame of the figures' walk, `dt` s long, with the room reaching `ahead` m ahead of the visitor's middle: each of this frame's
     groups toward where it would stand, no faster than `pace`, then apart from the figures round it, within `most` of its seats, clear of
     what it keeps clear of and out of the visitor's reach; then the figures' offsets. `relax` holds the groups where they stand and
     spaces them out at length, for a settle. Returns how far the farthest group moved; `changed` says whether an offset did. */
  let changed = false;
  function walk(dt, ahead, relax) {
    stamp += 1; count = 0; actCount = 0;
    for (let k = 0; k < offCount; k++) visit(list[k]);
    /* The seats from `keep` behind the middle to `ahead` in front of it and `keep` to either side, and `space` round that. */
    const ex = Math.abs(wz) * keep + space, ez = Math.abs(wx) * keep + space;
    const fx = mx + wx * ahead, fz = mz + wz * ahead, bx = mx - wx * keep, bz = mz - wz * keep;
    for (let r = rowAt(Math.min(fz, bz) - ez); r <= rowAt(Math.max(fz, bz) + ez); r++)
      for (let c = colAt(Math.min(fx, bx) - ex); c <= colAt(Math.max(fx, bx) + ex); c++)
        for (let k = first[r * cols + c]; k < first[r * cols + c + 1]; k++) visit(groupOf[items[k]]);

    /* Each group walks toward where it would stand: its seats, or as little off them as takes every member out of the room the visitor
       needs, on the side its middle stands on. */
    const visited = count;
    for (let k = 0; k < visited; k++) {
      const g = near[k], side = ((cz0[g] + gz[g] - mz) * wx - (cx0[g] + gx[g] - mx) * wz) >= 0 ? 1 : -1;
      let tx = 0, tz = 0, need = 0;
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], ax = sx[i] - mx, az = sz[i] - mz, along = ax * wx + az * wz, across = az * wx - ax * wz;
        let ux, uz;
        if (along >= 0 && along <= ahead && Math.abs(across) < keep) {
          const s = side * keep - across;
          ux = -wz * s; uz = wx * s;
        } else if (along < 0 && len(ax, az) < keep) {
          const rx = wx * along - wz * side * Math.abs(across), rz = wz * along + wx * side * Math.abs(across), l = len(rx, rz);
          ux = mx + (l > 1e-9 ? rx / l : -wz * side) * keep - sx[i]; uz = mz + (l > 1e-9 ? rz / l : wx * side) * keep - sz[i];
        } else continue;
        const u = len(ux, uz);
        if (u > need) { need = u; tx = ux; tz = uz; }
      }
      if (need === 0 && gx[g] === 0 && gz[g] === 0) continue;
      join(g);
      if (relax) continue;
      const ax = tx - gx[g], az = tz - gz[g], w = len(ax, az), cap = (need > 0 ? pace : back) * dt;
      const t = w > cap ? cap / w : 1;
      gx[g] += ax * t; gz[g] += az * t;
    }
    /* Then each group keeps its distance from the figures round it: one at its seat, from the seats' grid, and one of this frame's,
       from a grid of where they stand now, each pair once. Settling, they also keep clear and out of reach at each pass. */
    for (let pass = 0; pass < (relax ? 32 : passes); pass++) {
      for (let t = 0; t < used; t++) head1[usedCells[t]] = -1;
      used = 0;
      for (let k = 0; k < actCount; k++) for (let m = start[act[k]]; m < start[act[k] + 1]; m++) {
        const i = members[m], c = rowAt(sz[i] + gz[act[k]]) * cols + colAt(sx[i] + gx[act[k]]);
        if (head1[c] < 0) usedCells[used++] = c;
        next1[i] = head1[c]; head1[c] = i;
      }
      /* A group pushed this pass pushes on from the next, so a push reaches `passes` neighbours out in a frame. */
      let pushed = false;
      const acted = actCount;
      for (let k = 0; k < acted; k++) {
        const g = act[k];
        for (let m = start[g]; m < start[g + 1]; m++) {
          const i = members[m], xi = sx[i] + gx[g], zi = sz[i] + gz[g];
          for (let r = rowAt(zi - space); r <= rowAt(zi + space); r++) for (let c = colAt(xi - space); c <= colAt(xi + space); c++) {
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
      if (relax) constrain();
      if (!pushed) break;
    }
    /* No group moves faster than it steps aside or strays past `most` from its seats; then each keeps clear and out of reach. */
    for (let k = 0; k < actCount; k++) {
      const g = act[k], ax = gx[g] - qx[g], az = gz[g] - qz[g], w = len(ax, az), cap = relax ? Infinity : pace * dt;
      if (w > cap) { gx[g] = qx[g] + (ax * cap) / w; gz[g] = qz[g] + (az * cap) / w; }
      const o = len(gx[g], gz[g]);
      if (o > most) { gx[g] *= most / o; gz[g] *= most / o; }
    }
    constrain();
    let far = 0;
    offCount = 0; farthest = 0; parted = 0;
    for (let k = 0; k < actCount; k++) {
      const g = act[k];
      far = Math.max(far, len(gx[g] - qx[g], gz[g] - qz[g]));
      const o = len(gx[g], gz[g]);
      if (o < 1e-4) { gx[g] = 0; gz[g] = 0; } else { list[offCount++] = g; parted += start[g + 1] - start[g]; }
      for (let m = start[g]; m < start[g + 1]; m++) {
        const i = members[m], ox = Math.fround(gx[g]), oz = Math.fround(gz[g]);
        const oy = Math.fround(o >= 1e-4 ? height(sx[i] + gx[g], sz[i] + gz[g]) - sy[i] : 0);
        farthest = Math.max(farthest, Math.sqrt(ox * ox + oy * oy + oz * oz));
        if (offset[4 * i] === ox && offset[4 * i + 1] === oy && offset[4 * i + 2] === oz) continue;
        offset[4 * i] = ox; offset[4 * i + 1] = oy; offset[4 * i + 2] = oz;
        changed = true;
      }
    }
    return far;
  }

  function step(dt, feet, head, settle) {
    const cx = (feet.x + head.x) / 2, cz = (feet.z + head.z) / 2;
    /* At once under reduced motion, on the first frame, and where the visitor moved more than 3 m since the last. */
    const now = settle || !(len(cx - mx, cz - mz) <= 3);
    if (now) { vx = 0; vz = 0; }
    else if (dt > 0) {
      const k = 1 - Math.exp(-dt / 0.2);
      vx += ((cx - mx) / dt - vx) * k; vz += ((cz - mz) / dt - vz) * k;
      if (len(vx, vz) < 0.01) { vx = 0; vz = 0; }
    }
    if (cx === mx && cz === mz && vx === 0 && vz === 0 && !moved) return false;
    mx = cx; mz = cz;
    /* The way: where the visitor moves, or where their bear faces below 0.5 m/s. */
    const speed = len(vx, vz);
    if (speed > 0.5) { wx = vx / speed; wz = vz / speed; }
    else { wx = head.x - feet.x; wz = head.z - feet.z; const l = len(wx, wz) || 1; wx /= l; wz /= l; }
    changed = false;
    /* At once, the figures walk on in 1/30 s steps, the visitor standing, until none moves a millimetre: where the walk would leave them;
       then they space themselves out where they stand. */
    if (now) { for (let k = 0; k < 150 && walk(1 / 30, keep, false) > 1e-3; k++); walk(0, keep, true); moved = false; }
    else moved = walk(dt, keep + (speed > 0.5 ? speed * lead : 0), false) > 0;
    if (changed) stand();
    return changed;
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
      const g = list[k], own = Math.min(1, len(gx[g], gz[g]) / 0.25);
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
    for (let k = 0; k < stillCount; k++) {
      const j = stillNow[k], v = Math.fround(still[j]);
      if (offset[4 * j + 3] !== v) { offset[4 * j + 3] = v; changed = true; }
    }
    for (let k = 0; k < wasCount; k++) {
      const j = stillWas[k];
      if (stillAt[j] !== round && offset[4 * j + 3] !== 0) { offset[4 * j + 3] = 0; changed = true; }
    }
  }

  /* How high a camera at (x, z) must stand to keep `clear` m out of every figure: `clear` over a figure's highest point, `top` m over its
     feet, within `wide` + `clear` m of where it stands, `wide` being its farthest reach, and 1.5 m lower for each metre past that, out to
     3 m; -Infinity with no figure that near. */
  function over(x, z) {
    const r = wide + clear, far = r + 3;
    let y = -Infinity;
    for (let rr = rowAt(z - far); rr <= rowAt(z + far); rr++) for (let c = colAt(x - far); c <= colAt(x + far); c++)
      for (let q = first[rr * cols + c]; q < first[rr * cols + c + 1]; q++) {
        const i = items[q], g = groupOf[i], d = len(sx[i] - x, sz[i] - z);
        if (gx[g] === 0 && gz[g] === 0 && d < far) y = Math.max(y, sy[i] + top + clear - 1.5 * Math.max(0, d - r));
      }
    for (let k = 0; k < offCount; k++) for (let m = start[list[k]]; m < start[list[k] + 1]; m++) {
      const i = members[m], d = len(sx[i] + offset[4 * i] - x, sz[i] + offset[4 * i + 2] - z);
      if (d < far) y = Math.max(y, sy[i] + offset[4 * i + 1] + top + clear - 1.5 * Math.max(0, d - r));
    }
    return y;
  }

  return { offset, step, over, get farthest() { return farthest; }, get parted() { return parted; } };
}

/* What the crowd does through each of the show's tracks, by its title and where set 2 starts: it dances while a song plays, Drums and
   Space among them, and stands still through what is not a song (tuning, crowd noise, a break); it sits in Space, still dancing, and
   through the set break. A title names its songs between the segue marks (">", "->" or "/") and each by its whole name, so a song with
   one of these words inside its name is still a song, and a track sits in Space only when Space is all it holds. Where `set2Start` is
   known, the set break is what is not a song just before set 2; where it is not, a track named a break, after the first song. Before
   the first song the crowd stands, waiting for the band, and through an encore break, calling for more. Each track gets { dance, sit }. */
const BREAK = /^(set(\d|one|two|i|ii)?)?break(\d|one|two|i|ii)?$|^intermission$/, NOT_A_SONG = /^(tuning|crowd|crowdnoise|encorebreak)$/;
const notASong = (name) => NOT_A_SONG.test(name) || BREAK.test(name);
/* A title's songs, each as its letters and digits alone, lower case, and without what a parenthesis holds. */
const names = (title) => title.toLowerCase().replace(/\([^)]*\)/g, "").split(/->|>|\//).map((name) => name.replace(/[^a-z0-9]/g, "")).filter(Boolean);
export function crowdPlan(titles, set2Start) {
  const parts = titles.map(names), song = parts.map((p) => p.some((name) => !notASong(name))), first = song.indexOf(true);
  const brk = titles.map(() => false);
  if (set2Start !== null) for (let i = set2Start - 1; i > first && first >= 0 && !song[i]; i--) brk[i] = true;
  else parts.forEach((p, i) => { brk[i] = first >= 0 && i > first && p.length > 0 && p.every((name) => BREAK.test(name)); });
  return titles.map((_, i) => ({ dance: song[i], sit: (parts[i].length > 0 && parts[i].every((name) => name === "space")) || brk[i] }));
}
