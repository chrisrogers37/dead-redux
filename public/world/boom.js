/* eslint-disable */
import { enterColumn } from "./collide.js";

/* The walk camera's boom against the landmarks, with no three import so that vitest can load it. Points and directions are anything
   with x, y and z; boxes anything with `min` and `max` points, as three's Box3; columns as collide.js's enterColumn takes them. The
   box test and the distance follow three.js r185's Box3.containsPoint, Ray.intersectBox and Vector3.distanceTo step for step, so the
   camera lands where it did with three's. Nothing here makes anything in a frame: no object, no array, no function, and no loop
   over a list but by its indexes (camera.test.ts). */

/* Whether a box stands around a point, as Box3.containsPoint has it: the box the boom takes no notice of. */
const around = (p, b) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
/* How far the point (x, y, z) is from the point `b`, as Vector3.distanceTo has it. */
const far = (x, y, z, b) => Math.sqrt((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) + (z - b.z) * (z - b.z));

/* How far from `from` along the unit direction `dir` the line enters the nearest box (any box around `from` aside) or column, or
   Infinity. */
export function nearest(from, dir, boxes, columns) {
  let s = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (around(from, b)) continue;
    const t = enters(from, dir, b);
    if (t === null) continue;
    s = Math.min(s, far(from.x + dir.x * t, from.y + dir.y * t, from.z + dir.z * t, from));
  }
  for (let i = 0; i < columns.length; i++) s = Math.min(s, enterColumn(from, dir, columns[i]));
  return s;
}

/* Where along the line the slab test meets the box, or null. */
function enters(o, d, b) {
  let tmin, tmax, tymin, tymax, tzmin, tzmax;
  const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
  if (ix >= 0) { tmin = (b.min.x - o.x) * ix; tmax = (b.max.x - o.x) * ix; } else { tmin = (b.max.x - o.x) * ix; tmax = (b.min.x - o.x) * ix; }
  if (iy >= 0) { tymin = (b.min.y - o.y) * iy; tymax = (b.max.y - o.y) * iy; } else { tymin = (b.max.y - o.y) * iy; tymax = (b.min.y - o.y) * iy; }
  if (tmin > tymax || tymin > tmax) return null;
  if (tymin > tmin || isNaN(tmin)) tmin = tymin;
  if (tymax < tmax || isNaN(tmax)) tmax = tymax;
  if (iz >= 0) { tzmin = (b.min.z - o.z) * iz; tzmax = (b.max.z - o.z) * iz; } else { tzmin = (b.max.z - o.z) * iz; tzmax = (b.min.z - o.z) * iz; }
  if (tmin > tzmax || tzmin > tmax) return null;
  if (tzmin > tmin || tmin !== tmin) tmin = tzmin;
  if (tzmax < tmax || tmax !== tmax) tmax = tzmax;
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

/* The camera never comes nearer the head than this, in m, whatever stands in the boom's way. */
export const LEAST = 2.5;

/* What follows keeps the camera's place out of the landmarks' boxes and the stage's column, and out of their rooms: a box's room
   is the box, `room` m round its four sides and over its top, and all that lies under it. So a box is taken to stand on the
   ground, as every landmark does but one that hangs in the air, which the camera goes round as it would a post. A column's room
   is the column, `room` m round its side and over its top. `room` is what the eye's near plane needs (avatar.js eyeRoom). */

/* A place within SKIN m of a room's side stands on that side, where the last frame's stop left it; and a place sent along a side
   goes SKIN m past its edge, clear of the side it left. A millimetre: a hundred million times what a sum or a scaling leaves a
   coordinate of some hundred metres out by (1e-13 m; the bear's least moved a goal 1e-15 m off a side), and a hundredth of what
   a pixel shows at the boom's length. */
const SKIN = 0.001;
/* Whether `v` is at `edge` or past it, up the numbers (`way` 1) or down them (-1), or within SKIN of being so. */
const past = (v, edge, way) => (way > 0 ? v >= edge - SKIN : v <= edge + SKIN);
/* Whether `v` lies between `lo` and `hi`, deeper in than a point set on either. */
const deep = (v, lo, hi) => !past(v, lo, -1) && !past(v, hi, 1);
/* `v`, or whichever of `lo` and `hi` it lies inside of by less than SKIN. */
const edged = (v, lo, hi) => (v > lo && v - lo < SKIN ? lo : v < hi && hi - v < SKIN ? hi : v);
/* A length shorter than this has no way to it, in m: nothing is divided by one. */
export const NIL = 1e-9;
/* Whether a point is in a box's room. */
const inRoom = (p, b, room) => p.x > b.min.x - room && p.x < b.max.x + room && p.z > b.min.z - room && p.z < b.max.z + room && p.y < b.max.y + room;
/* A squared distance is tried against a bound's square first, and against the bound itself, by its root, only within a hair of
   it: a place that the last frame set on a bound is then on the side of it that the root says, as it was before the squares.
   The hair is a part in a thousand million of the square: a square and its root's square differ by a part in 1e16, so this is
   wide of that ten million times over, and at 20 m it is a hundredth of a micrometre. */
export const HAIR = 1 + 1e-9;
/* How little of its step a place that two rooms have stopped may have made, as a share of the step, before it is taken to stand
   in the corner between them (goRound). */
const STALL = 0.1;
/* A room's four sides and its top; 0 is none. */
const WEST = 1, EAST = 2, NORTH = 3, SOUTH = 4, TOP = 5;
/* The nearest of a room's sides to a point in it, from how far the point is in from each: where two are as near, its top first,
   then west, east, north and south. */
const nearestSide = (west, east, north, south, up) => {
  const least = Math.min(west, east, north, south, up);
  return least === up ? TOP : least === west ? WEST : least === east ? EAST : least === north ? NORTH : SOUTH;
};
/* Puts a point on a side of a room, whose sides stand at x0 and x1 (west and east), z0 and z1 (north and south) and y1 (its top). */
const put = (p, side, x0, x1, z0, z1, y1) => {
  if (side === TOP) p.y = y1; else if (side === WEST) p.x = x0; else if (side === EAST) p.x = x1; else if (side === NORTH) p.z = z0; else p.z = z1;
};
/* Whether a point is out on a side's own side of the room: over its top, or west of its west side, and so on; or within SKIN m
   of being so, as a point set on that side is, and one that the bear's least has since moved by a hair (avatar.js `clear`). */
const before = (g, side, x0, x1, z0, z1, y1) => (side === TOP ? past(g.y, y1, 1) : side === WEST ? past(g.x, x0, -1) : side === EAST ? past(g.x, x1, 1) : side === NORTH ? past(g.z, z0, -1) : past(g.z, z1, 1));
/* Moves a point `by` m the way a side looks: up, west, east, north or south. */
const out = (p, side, by) => {
  if (side === TOP) p.y += by; else if (side === WEST) p.x -= by; else if (side === EAST) p.x += by; else if (side === NORTH) p.z -= by; else p.z += by;
};

/* One try at standOff: out of each box's room by the nearest of its four sides and its top, the boxes taken from the first, or
   from the last when `back`; out of each column's by its side or its top; and then, since landmarks stand close and the side of
   one's room may lie in the next one's, up to the top of any room the point is still in, deeper than a point on its side stands.
   A room reaches down to the ground, so going up takes a point into no room it was not in, and this leaves it in none. Tells
   whether it had to go up. */
function stoodOff(p, head, hangs, boxes, columns, room, back) {
  for (let n = 0; n < boxes.length; n++) {
    const b = boxes[back ? boxes.length - 1 - n : n];
    if (!inRoom(p, b, room) || (around(head, b) && inRoom(hangs, b, room))) continue;
    const side = nearestSide(p.x - b.min.x + room, b.max.x + room - p.x, p.z - b.min.z + room, b.max.z + room - p.z, b.max.y + room - p.y);
    put(p, side, b.min.x - room, b.max.x + room, b.min.z - room, b.max.z + room, b.max.y + room);
  }
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i], dx = p.x - c.x, dz = p.z - c.z, dd = dx * dx + dz * dz, r = c.r + room, hx = head.x - c.x, hz = head.z - c.z;
    if (hx * hx + hz * hz < c.r * c.r || dd >= r * r * HAIR || p.y >= c.top + room) continue;
    const d = Math.sqrt(dd);
    if (d >= r) continue;
    if (c.top + room - p.y < r - d) p.y = c.top + room;
    else if (d > NIL) { p.x = c.x + (dx / d) * r; p.z = c.z + (dz / d) * r; }
    else p.x = c.x + r;
  }
  let up = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (inRoom(p, b, room - SKIN) && !(around(head, b) && inRoom(hangs, b, room))) { p.y = b.max.y + room; up = true; }
  }
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i], dx = p.x - c.x, dz = p.z - c.z, r = c.r + room - SKIN, hx = head.x - c.x, hz = head.z - c.z;
    if (hx * hx + hz * hz >= c.r * c.r && p.y < c.top + room - SKIN && dx * dx + dz * dz < r * r) { p.y = c.top + room; up = true; }
  }
  return up;
}

/* Puts the point `p` out of every room it is in: to the nearest of a box's four sides and its top, or of a column's side and its
   top. It is where the camera comes to rest beside a landmark. One room is let be, as goRound lets it be: that of a box that
   stands around `head` and around `hangs`, where the boom's end hangs.
   Where rooms overlap and the point had to go up out of them, which box put it out first told where it went: so it is tried
   from the last box too, and takes the nearer of the two to where it was. */
export function standOff(p, head, hangs, boxes, columns, room) {
  const x = p.x, y = p.y, z = p.z;
  if (!stoodOff(p, head, hangs, boxes, columns, room, false)) return;
  const ax = p.x, ay = p.y, az = p.z;
  p.x = x; p.y = y; p.z = z;
  stoodOff(p, head, hangs, boxes, columns, room, true);
  if ((ax - x) * (ax - x) + (ay - y) * (ay - y) + (az - z) * (az - z) < (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) + (p.z - z) * (p.z - z)) { p.x = ax; p.y = ay; p.z = az; }
}

/* The camera's place on its way to `goal`, a frame at a time: `p` is where this frame's step has taken it and `was` where it
   stood. A room it stood outside stops it at the side or the top it came in by, as a wall stops a walker. Stopped short of a goal
   that lies on past the box, it goes along that side instead, as far as its step was long: round the box the way the goal lies
   from it, or up it and over where that is shorter. So it comes round a landmark or over it and never through it, no faster
   than it would have gone straight. With no goal (null) it is stopped and no more.
   One room is let be: that of a box that stands around the head and around `hangs`, where the boom's end hangs with nothing in
   its way. There the bear is in a landmark and the camera's own place is in it too, as under a roof.
   A place that already stood in a room, as in the box the head has just left, may step only nearer the room's sides: any other
   step is spent on going out by the nearest of them, and on round the box from there.
   Once the goal stands still, the place comes to it and rests: no choice here turns back from one frame to the next. The way
   round a box is by the turn about its middle, which only grows less as the place goes that way; a goal over a box or a column,
   which no way round reaches, sends the place up; each of the ways round and over shortens only its own measure; and a place
   that rooms which overlap leave no way goes up, where no room is (camera.test.ts stops every kind of walk, and holds this). */
export function goRound(p, was, goal, head, hangs, boxes, columns, room) {
  /* The step as it came, before anything here moves the place; its length is reckoned once a room is found to stop it. */
  const px = p.x, py = p.y, pz = p.z, sx = px - was.x, sy = py - was.y, sz = pz - was.z;
  /* How many rooms have stopped it, and whether one stopped it short of a goal that is not in that one. */
  let step = -1, met = 0, short = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!inRoom(p, b, room) || (around(head, b) && inRoom(hangs, b, room))) continue;
    if (step < 0) step = far(px, py, pz, was);
    met += 1;
    const x0 = b.min.x - room, x1 = b.max.x + room, z0 = b.min.z - room, z1 = b.max.z + room, y1 = b.max.y + room;
    let face = 0, late = -1;
    if (inRoom(was, b, room - SKIN)) {
      /* It stood in the room, as in the box the head has just left, or where the bear has pressed it into a room's edge (avatar.js
         `clear`). A step nearer the room's sides is its own. Any other is spent on going out by the nearest side; and where
         the step is longer than that and the goal lies on past the box from that side, it goes on round the box from there,
         as a place that stood on that side would: else the bear, pressing it back in each frame, would hold it there. */
      const deep = Math.min(was.x - x0, x1 - was.x, was.z - z0, z1 - was.z, y1 - was.y);
      if (Math.min(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z, y1 - p.y) < deep) continue;
      face = nearestSide(was.x - x0, x1 - was.x, was.z - z0, z1 - was.z, y1 - was.y);
      if (step <= deep + SKIN || goal === null || inRoom(goal, b, room - SKIN) || before(goal, face, x0, x1, z0, z1, y1)) {
        p.x = was.x; p.y = was.y; p.z = was.z;
        out(p, face, Math.min(step, deep + SKIN));
        continue;
      }
      short = true;
    } else {
      /* The side it came in by: of the room's sides it stood outside, the last its step crossed; and should it have stood
         outside none, the nearest. */
      if (was.x <= x0 + SKIN && sx > 0 && (x0 - was.x) / sx > late) { late = (x0 - was.x) / sx; face = WEST; }
      if (was.x >= x1 - SKIN && sx < 0 && (x1 - was.x) / sx > late) { late = (x1 - was.x) / sx; face = EAST; }
      if (was.z <= z0 + SKIN && sz > 0 && (z0 - was.z) / sz > late) { late = (z0 - was.z) / sz; face = NORTH; }
      if (was.z >= z1 - SKIN && sz < 0 && (z1 - was.z) / sz > late) { late = (z1 - was.z) / sz; face = SOUTH; }
      if (was.y >= y1 - SKIN && sy < 0 && (y1 - was.y) / sy > late) { late = (y1 - was.y) / sy; face = TOP; }
      if (face === 0) face = nearestSide(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z, y1 - p.y);
      put(p, face, x0, x1, z0, z1, y1);
      /* A goal in the box's own room, or out on this side of it, is not on past it: the place stops and no more. */
      if (goal === null || inRoom(goal, b, room - SKIN)) continue;
      short = true;
      if (before(goal, face, x0, x1, z0, z1, y1)) continue;
    }
    /* Along the side from where it stood, set against that side: how far that was from it comes off the step. */
    const fx = face === WEST ? x0 : face === EAST ? x1 : was.x, fy = face === TOP ? y1 : was.y, fz = face === NORTH ? z0 : face === SOUTH ? z1 : was.z;
    const rest = Math.max(0, step - far(fx, fy, fz, was));
    p.x = fx; p.y = fy; p.z = fz;
    if (face === TOP) {
      /* Over the top, with the goal lower: on toward the goal, level. And within SKIN of the top's edge it is over the edge,
         and out on that side: a goal set on a side and moved a hair in from it lies under the top's edge by that hair, and a
         place over it, still on the top, could not come down to it (0.89 m over its rest for good, at a stop of 1986-07-04). */
      const tx = goal.x - fx, tz = goal.z - fz, t = Math.sqrt(tx * tx + tz * tz), by = Math.min(rest, t);
      if (t > NIL) { p.x += (tx / t) * by; p.z += (tz / t) * by; }
      p.x = edged(p.x, x0, x1); p.z = edged(p.z, z0, z1);
      continue;
    }
    /* How far round the box's middle the goal lies from here, in rad, turning from +x toward +z: the way round. Over the box is
       shorter where the climb to its top and down to the goal's height is less than that share of the way round its four sides. */
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, turn = Math.atan2((fx - cx) * (goal.z - cz) - (fz - cz) * (goal.x - cx), (fx - cx) * (goal.x - cx) + (fz - cz) * (goal.z - cz));
    /* A goal over the box itself is reached by no way round: there the way round turns back on itself as the place passes under
       the goal, each frame the other way, and the place would swing between two spots for ever. Up, then. (Over it by more than
       SKIN: a goal set on a side of the room and moved a hair in from it is beside the box, and a place sent up for it went up
       that side 0.5 m and came down again, measured at a stop beside a landmark of 1986-07-04.) */
    const above = deep(goal.x, x0, x1) && deep(goal.z, z0, z1);
    if (above || y1 - fy + Math.max(0, y1 - goal.y) < ((x1 - x0 + z1 - z0) / Math.PI) * Math.abs(turn)) { out(p, TOP, Math.min(rest, y1 - fy + SKIN)); continue; }
    /* Turning that way goes east along the north side, south along the east, west along the south and north along the west; and
       as far as the step has left, or just past that end of the side. */
    const to = face === NORTH ? (turn > 0 ? EAST : WEST) : face === SOUTH ? (turn > 0 ? WEST : EAST) : face === EAST ? (turn > 0 ? SOUTH : NORTH) : turn > 0 ? NORTH : SOUTH;
    out(p, to, Math.min(rest, Math.max(0, to === EAST ? x1 - fx : to === WEST ? fx - x0 : to === SOUTH ? z1 - fz : fz - z0) + SKIN));
  }
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i], dx = p.x - c.x, dz = p.z - c.z, dd = dx * dx + dz * dz, r = c.r + room, top = c.top + room;
    if (dd >= r * r * HAIR || p.y >= top) continue;
    const d = Math.sqrt(dd);
    if (d >= r) continue;
    if (step < 0) step = far(px, py, pz, was);
    met += 1;
    const wx = was.x - c.x, wz = was.z - c.z, wr = Math.sqrt(wx * wx + wz * wz), over = wr < r - SKIN;
    if (over && was.y < top - SKIN) {
      const deep = Math.min(r - wr, top - was.y);
      if (Math.min(r - d, top - p.y) < deep) continue;
      const by = Math.min(step, deep + SKIN);
      p.x = was.x; p.y = was.y; p.z = was.z;
      if (deep === top - was.y) p.y += by; else if (wr > NIL) { p.x += (wx / wr) * by; p.z += (wz / wr) * by; } else p.x += by;
      continue;
    }
    const gx = goal === null ? 0 : goal.x - c.x, gz = goal === null ? 0 : goal.z - c.z, gr = Math.sqrt(gx * gx + gz * gz);
    const on = goal !== null && (gr >= r - SKIN || goal.y >= top - SKIN);
    /* It came in by the top if it stood over the column, by the side if it stood beside it, and from over and beside by the nearer. */
    const high = was.y >= top - SKIN, byTop = over || (high && top - p.y < r - d);
    if (on) short = true;
    /* The way out from the column's axis to where it stood. A goal lies on past the column where it is lower than the top the
       place came in by, or behind the upright plane that touches the side where the place stood. */
    const ux = wr > NIL ? wx / wr : 1, uz = wr > NIL ? wz / wr : 0;
    if (!on || (byTop ? goal.y >= top : gx * ux + gz * uz >= r - SKIN)) {
      /* Stopped, and no more. */
      if (byTop) p.y = top;
      else { const bearing = Math.atan2(d > NIL ? dz : 0, d > NIL ? dx : 1); p.x = c.x + r * Math.cos(bearing); p.z = c.z + r * Math.sin(bearing); }
      continue;
    }
    /* How far round the column's axis the goal lies from where the place stood, in rad. Over the column is the way where the place
       stands over it already, and where the climb to its top and down to the goal's height is less than the way round its side.
       Each way shortens only its own measure, so the choice holds from frame to frame. */
    const turn = gr > NIL ? Math.atan2(wx * gz - wz * gx, wx * gx + wz * gz) : 0;
    if (over || Math.max(0, top - was.y) + Math.max(0, top - goal.y) < r * Math.abs(turn)) {
      if (high) {
        /* Across the top from where it stood, set on the top: on toward the goal, level, and no further than over it. */
        const tx = goal.x - was.x, tz = goal.z - was.z, t = Math.sqrt(tx * tx + tz * tz), by = Math.min(t, Math.max(0, step - Math.max(0, was.y - top)));
        p.x = was.x + (t > NIL ? (tx / t) * by : 0); p.y = top; p.z = was.z + (t > NIL ? (tz / t) * by : 0);
      } else {
        /* Up its side from where it stood, set against the side, to just over its top. */
        p.x = c.x + ux * r; p.y = was.y + Math.min(Math.max(0, step - Math.max(0, wr - r)), top - was.y + SKIN); p.z = c.z + uz * r;
      }
      continue;
    }
    /* Round its side from where it stood, set against the side: straight, as the side unrolls flat, for the place on it at the
       goal's bearing and the goal's height, and no further than that place. So it comes down or goes up the side as it goes round:
       up it and out over its top to a goal that stands over the column, which no way round at the place's own height reaches;
       and never past the goal's bearing, where the way round would turn back, each frame the other way. */
    const along = r * turn, up = goal.y - was.y, all = Math.sqrt(along * along + up * up), by = Math.min(all, Math.max(0, step - Math.max(0, wr - r)));
    const bearing = Math.atan2(uz, ux) + (all > NIL ? ((along / all) * by) / r : 0);
    p.x = c.x + r * Math.cos(bearing); p.y = was.y + (all > NIL ? (up / all) * by : 0); p.z = c.z + r * Math.sin(bearing);
  }
  if (step < 0) return;
  /* Where rooms overlap, the stop at one may lie in the next, and the way round one may lead into the corner between them: the
     place would stand there for good, or swing between their sides. So a place that all this has left in a room, deeper than a
     place on its side stands, one it stood out of or one it has come no nearer the side of; and a place that two rooms or more
     have stopped, short of its goal, within STALL of its step of where it stood: either goes straight up from where it stood
     instead, as far as its step was long. Up is into no room it was not in; and it climbs so, a step a frame, until it is over
     the lower of the two. (One room alone leaves a place short of its step only at the end of a side, which it is past in the
     next frame.) */
  let up = short && met > 1 && (p.x - was.x) * (p.x - was.x) + (p.y - was.y) * (p.y - was.y) + (p.z - was.z) * (p.z - was.z) < STALL * STALL * step * step;
  for (let i = 0; i < boxes.length && !up; i++) {
    const b = boxes[i];
    if (!inRoom(p, b, room - SKIN) || (around(head, b) && inRoom(hangs, b, room))) continue;
    const x0 = b.min.x - room, x1 = b.max.x + room, z0 = b.min.z - room, z1 = b.max.z + room, y1 = b.max.y + room;
    up = !inRoom(was, b, room - SKIN) || Math.min(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z, y1 - p.y) >= Math.min(was.x - x0, x1 - was.x, was.z - z0, z1 - was.z, y1 - was.y);
  }
  for (let i = 0; i < columns.length && !up; i++) {
    const c = columns[i], dx = p.x - c.x, dz = p.z - c.z, r = c.r + room, top = c.top + room, d = Math.sqrt(dx * dx + dz * dz);
    if (d >= r - SKIN || p.y >= top - SKIN) continue;
    const wx = was.x - c.x, wz = was.z - c.z, wr = Math.sqrt(wx * wx + wz * wz);
    up = wr >= r - SKIN || was.y >= top - SKIN || Math.min(r - d, top - p.y) >= Math.min(r - wr, top - was.y);
  }
  if (up) { p.x = was.x; p.y = was.y + step; p.z = was.z; }
}

/* How far in front of a landmark the boom's line stops, and how near the head a landmark must start for the boom to rise over it
   instead, in m. */
const SHORT = 0.5, CLOSE = 3;
/* The boom rises a STEP rad at a time; and where it has to say to within less than a step how far it must rise, it halves the
   step HALVINGS times for that, which is to a fifth of a milliradian. */
const STEP = 0.05, HALVINGS = 8;
/* Turns `dir` to the elevation `a` rad, along the level way (hx, hz). */
const aim = (dir, hx, hz, a) => { dir.x = hx * Math.cos(a); dir.y = Math.sin(a); dir.z = hz * Math.cos(a); };
/* What rise answers: one object, written anew at each call. */
const risen = { lift: 0, room: 1 };

/* How far the boom rises where its steps have brought its line, `dir`, to `el + need` rad, short of straight up and clear of
   every landmark for CLOSE m: `need`, or a step more.
   The steps start from the boom's own elevation, which eases for a second after the bear has stopped; so which angles they try
   moves by hundredths of a radian while nothing else does. That matters where the angles at which the line meets a landmark
   further off than CLOSE, yet under its top, are fewer than a step: close against a tall landmark, as at the platform's edge,
   where the stage's column stands 5 cm behind the head and 5 m over it, and those angles are a third of a degree. There a step
   landed among them or past them by where the easing boom happened to be: the camera was drawn in to its least, 2.5 m over the
   bear, or hung straight up at the boom's length, and went from the one to the other and back as the boom settled.
   So where the line meets a landmark further off, the least rise that clears CLOSE is found to within a step halved HALVINGS
   times, which is the same wherever the steps started; and if a step above that the line meets nothing, the landmark is one
   the boom is all but over, and it rises a step more and over it. Else `need` is as the steps left it: the boom is over a
   short landmark already, or stops in front of a tall one. */
function crest(from, dir, len, boxes, columns, hx, hz, el, need) {
  if (nearest(from, dir, boxes, columns) >= len) return need;
  /* A step above the steps' own line is as high as a step above the least rise can be. Where the line there still meets a
     landmark, a lower one does too, every landmark standing on the ground: it stops in front of one, and no halving is needed
     to tell. So the halving is for the few frames a landmark's top is within two steps. */
  aim(dir, hx, hz, Math.min(Math.PI / 2, el + need + STEP));
  if (nearest(from, dir, boxes, columns) < len) return need;
  let low = el + need - STEP, high = el + need;
  for (let n = 0; n < HALVINGS; n++) {
    const mid = (low + high) / 2;
    aim(dir, hx, hz, mid);
    if (nearest(from, dir, boxes, columns) < Math.min(CLOSE, len)) low = mid; else high = mid;
  }
  aim(dir, hx, hz, Math.min(Math.PI / 2, high + STEP));
  return nearest(from, dir, boxes, columns) >= len ? need + STEP : need;
}

/* One frame of the boom against the landmarks. `dir` is the unit direction from the head (`from`) toward the eased camera, `len` the
   boom's length, `lift` the rise carried from the last frame and `k` the ease (1 lands at once). The boom's line stops SHORT m in
   front of a landmark between its end and the head, but never nearer the head than LEAST. A landmark that starts within CLOSE m of
   the head leaves no room for that, so the boom rises instead, STEP rad at a time, until the line from the head meets no landmark
   within CLOSE m: it passes over a short one, and meets a tall one high enough up its face to stop in front of it, unless a step
   more would pass over that one too (`crest`). It rises at once
   and comes back down at the ease. Straight up always clears, since every box and column stands on the ground and so none reaches
   over a head outside it. Turns `dir` to the line and answers the new rise and the share of `len` the line may use, in `risen`.
   That is where the landmarks would have the camera, its goal: its place goes there at a pace of its own, and comes to rest out
   of their rooms, which is further from a landmark than SHORT (avatar.js). */
export function rise(from, dir, len, boxes, columns, lift, k) {
  const h = Math.hypot(dir.x, dir.z), el = Math.atan2(dir.y, h), hx = dir.x / (h || 1), hz = dir.z / (h || 1);
  let need = 0;
  while (el + need < Math.PI / 2 && nearest(from, dir, boxes, columns) < Math.min(CLOSE, len)) aim(dir, hx, hz, el + (need += STEP));
  if (need > 0 && el + need < Math.PI / 2) need = crest(from, dir, len, boxes, columns, hx, hz, el, need);
  lift = need > lift ? need : lift + (need - lift) * k;
  aim(dir, hx, hz, Math.max(el, Math.min(Math.PI / 2, el + lift)));
  const s = nearest(from, dir, boxes, columns);
  risen.lift = lift;
  risen.room = s < len ? Math.min(1, Math.max(LEAST, s - SHORT) / (len || 1)) : 1;
  return risen;
}
