/* eslint-disable */
import { enterColumn } from "./collide.js";

/* The walk camera's boom against the landmarks, with no three import so that vitest can load it. Points and directions are anything
   with x, y and z; boxes anything with `min` and `max` points, as three's Box3; columns as collide.js's enterColumn takes them. The
   box test and the distance follow three.js r185's Box3.containsPoint, Ray.intersectBox and Vector3.distanceTo step for step, so the
   camera lands where it did with three's. */

/* How far from `from` along the unit direction `dir` the line enters the nearest box (any box around `from` aside) or column, or
   Infinity. */
export function nearest(from, dir, boxes, columns) {
  let s = Infinity;
  for (const b of boxes) {
    if (from.x >= b.min.x && from.x <= b.max.x && from.y >= b.min.y && from.y <= b.max.y && from.z >= b.min.z && from.z <= b.max.z) continue;
    const t = enters(from, dir, b);
    if (t === null) continue;
    const dx = from.x + dir.x * t - from.x, dy = from.y + dir.y * t - from.y, dz = from.z + dir.z * t - from.z;
    s = Math.min(s, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  for (const c of columns) s = Math.min(s, enterColumn(from, dir, c));
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

/* One frame of the boom against the landmarks. `dir` is the unit direction from the head (`from`) toward the eased camera, `len` the
   boom's length, `lift` the rise carried from the last frame and `k` the ease (1 lands at once). The camera comes 0.5 m in front of a
   landmark between it and the head, but never nearer the head than 2.5 m. A landmark that starts within 3 m of the head leaves no room
   for that, so the boom rises instead, 0.05 rad at a time, until the line from the head meets no landmark within 3 m: it passes over a
   short one, and meets a tall one high enough up its face to come in front of it. It rises at once and comes back down at the ease.
   Straight up always clears, since every box and column stands on the ground and so none reaches over a head outside it. Turns `dir`
   to the line the camera takes and returns the new rise and the share of `len` the camera may use. */
export function rise(from, dir, len, boxes, columns, lift, k) {
  const h = Math.hypot(dir.x, dir.z), el = Math.atan2(dir.y, h), hx = dir.x / (h || 1), hz = dir.z / (h || 1);
  const aim = (a) => { dir.x = hx * Math.cos(a); dir.y = Math.sin(a); dir.z = hz * Math.cos(a); };
  let need = 0;
  while (el + need < Math.PI / 2 && nearest(from, dir, boxes, columns) < Math.min(3, len)) aim(el + (need += 0.05));
  lift = need > lift ? need : lift + (need - lift) * k;
  aim(Math.max(el, Math.min(Math.PI / 2, el + lift)));
  const s = nearest(from, dir, boxes, columns);
  return { lift, room: s < len ? Math.min(1, Math.max(2.5, s - 0.5) / (len || 1)) : 1 };
}
