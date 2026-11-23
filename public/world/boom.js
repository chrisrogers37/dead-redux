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
   goes SKIN m past its edge, clear of the side it left. */
const SKIN = 0.001;
/* Whether a point is in a box's room. */
const inRoom = (p, b, room) => p.x > b.min.x - room && p.x < b.max.x + room && p.z > b.min.z - room && p.z < b.max.z + room && p.y < b.max.y + room;
/* A squared distance is tried against a bound's square first, and against the bound itself, by its root, only within a hair of
   it: a place that the last frame set on a bound is then on the side of it that the root says, as it was before the squares. */
export const HAIR = 1 + 1e-9;
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
/* Moves a point `by` m the way a side looks: up, west, east, north or south. */
const out = (p, side, by) => {
  if (side === TOP) p.y += by; else if (side === WEST) p.x -= by; else if (side === EAST) p.x += by; else if (side === NORTH) p.z -= by; else p.z += by;
};

/* Puts the point `p` out of every room it is in, a box's that stands around `head` aside: to the nearest of a box's four sides
   and its top, or of a column's side and its top. It is where the camera comes to rest beside a landmark. */
export function standOff(p, head, boxes, columns, room) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (around(head, b) || !inRoom(p, b, room)) continue;
    const side = nearestSide(p.x - b.min.x + room, b.max.x + room - p.x, p.z - b.min.z + room, b.max.z + room - p.z, b.max.y + room - p.y);
    put(p, side, b.min.x - room, b.max.x + room, b.min.z - room, b.max.z + room, b.max.y + room);
  }
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i], dx = p.x - c.x, dz = p.z - c.z, dd = dx * dx + dz * dz, r = c.r + room, hx = head.x - c.x, hz = head.z - c.z;
    if (hx * hx + hz * hz < c.r * c.r || dd >= r * r * HAIR || p.y >= c.top + room) continue;
    const d = Math.sqrt(dd);
    if (d >= r) continue;
    if (c.top + room - p.y < r - d) p.y = c.top + room;
    else if (d > 1e-9) { p.x = c.x + (dx / d) * r; p.z = c.z + (dz / d) * r; }
    else p.x = c.x + r;
  }
}

/* The camera's place on its way to `goal`, a frame at a time: `p` is where this frame's step has taken it and `was` where it
   stood. A room it stood outside stops it at the side or the top it came in by, as a wall stops a walker. Stopped short of a goal
   that lies on past the box, it goes along that side instead, as far as its step was long: round the box the way the goal lies
   from it, or up it and over where that is shorter. So it comes round a landmark or over it and never through it, no faster
   than it would have gone straight. With no goal (null) it is stopped and no more.
   One room is let be: that of a box that stands around the head and around `hangs`, where the boom's end hangs with nothing in
   its way. There the bear is in a landmark and the camera's own place is in it too, as under a roof.
   A place that already stood in a room, as in the box the head has just left, may step only nearer the room's sides: any other
   step is spent on going out by the nearest of them. */
export function goRound(p, was, goal, head, hangs, boxes, columns, room) {
  /* The step as it came, before anything here moves the place; its length is reckoned once a room is found to stop it. */
  const px = p.x, py = p.y, pz = p.z, sx = px - was.x, sy = py - was.y, sz = pz - was.z;
  let step = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!inRoom(p, b, room) || (around(head, b) && inRoom(hangs, b, room))) continue;
    if (step < 0) step = far(px, py, pz, was);
    const x0 = b.min.x - room, x1 = b.max.x + room, z0 = b.min.z - room, z1 = b.max.z + room, y1 = b.max.y + room;
    if (inRoom(was, b, room - SKIN)) {
      const deep = Math.min(was.x - x0, x1 - was.x, was.z - z0, z1 - was.z, y1 - was.y);
      if (Math.min(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z, y1 - p.y) < deep) continue;
      p.x = was.x; p.y = was.y; p.z = was.z;
      out(p, nearestSide(was.x - x0, x1 - was.x, was.z - z0, z1 - was.z, y1 - was.y), Math.min(step, deep + SKIN));
      continue;
    }
    /* The side it came in by: of the room's sides it stood outside, the last its step crossed; and should it have stood outside
       none, the nearest. */
    let face = 0, late = -1;
    if (was.x <= x0 + SKIN && sx > 0 && (x0 - was.x) / sx > late) { late = (x0 - was.x) / sx; face = WEST; }
    if (was.x >= x1 - SKIN && sx < 0 && (x1 - was.x) / sx > late) { late = (x1 - was.x) / sx; face = EAST; }
    if (was.z <= z0 + SKIN && sz > 0 && (z0 - was.z) / sz > late) { late = (z0 - was.z) / sz; face = NORTH; }
    if (was.z >= z1 - SKIN && sz < 0 && (z1 - was.z) / sz > late) { late = (z1 - was.z) / sz; face = SOUTH; }
    if (was.y >= y1 - SKIN && sy < 0 && (y1 - was.y) / sy > late) { late = (y1 - was.y) / sy; face = TOP; }
    if (face === 0) face = nearestSide(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z, y1 - p.y);
    put(p, face, x0, x1, z0, z1, y1);
    /* A goal in the box's own room, or out on this side of it, is not on past it: the place stops and no more. */
    if (goal === null || inRoom(goal, b, room - SKIN)) continue;
    if (face === TOP ? goal.y >= y1 : face === WEST ? goal.x <= x0 : face === EAST ? goal.x >= x1 : face === NORTH ? goal.z <= z0 : goal.z >= z1) continue;
    /* Along the side from where it stood, set against that side: how far that was from it comes off the step. */
    const fx = face === WEST ? x0 : face === EAST ? x1 : was.x, fy = face === TOP ? y1 : was.y, fz = face === NORTH ? z0 : face === SOUTH ? z1 : was.z;
    const rest = Math.max(0, step - far(fx, fy, fz, was));
    p.x = fx; p.y = fy; p.z = fz;
    if (face === TOP) {
      /* Over the top, with the goal lower: on toward the goal, level. */
      const tx = goal.x - fx, tz = goal.z - fz, t = Math.sqrt(tx * tx + tz * tz), by = Math.min(rest, t);
      if (t > 1e-9) { p.x += (tx / t) * by; p.z += (tz / t) * by; }
      continue;
    }
    /* How far round the box's middle the goal lies from here, in rad, turning from +x toward +z: the way round. Over the box is
       shorter where the climb to its top and down to the goal's height is less than that share of the way round its four sides. */
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, turn = Math.atan2((fx - cx) * (goal.z - cz) - (fz - cz) * (goal.x - cx), (fx - cx) * (goal.x - cx) + (fz - cz) * (goal.z - cz));
    if (y1 - fy + Math.max(0, y1 - goal.y) < ((x1 - x0 + z1 - z0) / Math.PI) * Math.abs(turn)) { out(p, TOP, Math.min(rest, y1 - fy + SKIN)); continue; }
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
    const wx = was.x - c.x, wz = was.z - c.z, wr = Math.sqrt(wx * wx + wz * wz), over = wr < r - SKIN;
    if (over && was.y < top - SKIN) {
      const deep = Math.min(r - wr, top - was.y);
      if (Math.min(r - d, top - p.y) < deep) continue;
      const by = Math.min(step, deep + SKIN);
      p.x = was.x; p.y = was.y; p.z = was.z;
      if (deep === top - was.y) p.y += by; else if (wr > 1e-9) { p.x += (wx / wr) * by; p.z += (wz / wr) * by; } else p.x += by;
      continue;
    }
    const gx = goal === null ? 0 : goal.x - c.x, gz = goal === null ? 0 : goal.z - c.z;
    const on = goal !== null && (gx * gx + gz * gz >= (r - SKIN) * (r - SKIN) || goal.y >= top - SKIN);
    /* It came in by the top if it stood over the column, by the side if it stood beside it, and from over and beside by the nearer. */
    if (over || (was.y >= top - SKIN && top - p.y < r - d)) {
      p.y = top;
      if (!on || goal.y >= top) continue;
      /* Over the top, with the goal lower: from where it stood, set on the top, on toward the goal, level. */
      const tx = goal.x - was.x, tz = goal.z - was.z, t = Math.sqrt(tx * tx + tz * tz), by = Math.min(t, Math.max(0, step - (was.y - top)));
      p.x = was.x + (t > 1e-9 ? (tx / t) * by : 0); p.z = was.z + (t > 1e-9 ? (tz / t) * by : 0);
    } else if (!on) {
      const bearing = Math.atan2(d > 1e-9 ? dz : 0, d > 1e-9 ? dx : 1);
      p.x = c.x + r * Math.cos(bearing); p.z = c.z + r * Math.sin(bearing);
    } else {
      /* Round its side from where it stood, set against it, toward the goal's side of it. */
      const turn = Math.atan2(wr > 1e-9 ? wz : 0, wr > 1e-9 ? wx : 1) + (Math.max(0, step - Math.max(0, wr - r)) / r) * (wx * gz - wz * gx < 0 ? -1 : 1);
      p.x = c.x + r * Math.cos(turn); p.z = c.z + r * Math.sin(turn); p.y = was.y;
    }
  }
}

/* How far in front of a landmark the boom's line stops, and how near the head a landmark must start for the boom to rise over it
   instead, in m. */
const SHORT = 0.5, CLOSE = 3;
/* Turns `dir` to the elevation `a` rad, along the level way (hx, hz). */
const aim = (dir, hx, hz, a) => { dir.x = hx * Math.cos(a); dir.y = Math.sin(a); dir.z = hz * Math.cos(a); };
/* What rise answers: one object, written anew at each call. */
const risen = { lift: 0, room: 1 };

/* One frame of the boom against the landmarks. `dir` is the unit direction from the head (`from`) toward the eased camera, `len` the
   boom's length, `lift` the rise carried from the last frame and `k` the ease (1 lands at once). The boom's line stops SHORT m in
   front of a landmark between its end and the head, but never nearer the head than LEAST. A landmark that starts within CLOSE m of
   the head leaves no room for that, so the boom rises instead, 0.05 rad at a time, until the line from the head meets no landmark
   within CLOSE m: it passes over a short one, and meets a tall one high enough up its face to stop in front of it. It rises at once
   and comes back down at the ease. Straight up always clears, since every box and column stands on the ground and so none reaches
   over a head outside it. Turns `dir` to the line and answers the new rise and the share of `len` the line may use, in `risen`.
   That is where the landmarks would have the camera, its goal: its place goes there at a pace of its own, and comes to rest out
   of their rooms, which is further from a landmark than SHORT (avatar.js). */
export function rise(from, dir, len, boxes, columns, lift, k) {
  const h = Math.hypot(dir.x, dir.z), el = Math.atan2(dir.y, h), hx = dir.x / (h || 1), hz = dir.z / (h || 1);
  let need = 0;
  while (el + need < Math.PI / 2 && nearest(from, dir, boxes, columns) < Math.min(CLOSE, len)) aim(dir, hx, hz, el + (need += 0.05));
  lift = need > lift ? need : lift + (need - lift) * k;
  aim(dir, hx, hz, Math.max(el, Math.min(Math.PI / 2, el + lift)));
  const s = nearest(from, dir, boxes, columns);
  risen.lift = lift;
  risen.room = s < len ? Math.min(1, Math.max(LEAST, s - SHORT) / (len || 1)) : 1;
  return risen;
}
