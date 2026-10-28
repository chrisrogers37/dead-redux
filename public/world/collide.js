/* eslint-disable */

/* The bears are solid to the walker. A walker nearer a bear's centre than `reach`, on the ground, goes back out to `reach` along
   the line from the bear, so a held walk slides along the column instead of passing through it. `spots` are the bears' positions.
   Where two bears' reaches overlap, a walker inside or at the edge of both goes to where their edges cross, on its side of the line
   between them; the check repeats, at most four times, until the walker stands outside every reach. */
export function keepOut(walker, spots, reach) {
  const dist = (s) => Math.hypot(walker.x - s.x, walker.z - s.z);
  for (let pass = 0; pass < 4; pass++) {
    const near = spots.filter((s) => dist(s) < reach + 1e-9).sort((p, q) => dist(p) - dist(q));
    if (!near.some((s) => dist(s) < reach - 1e-9)) return;
    const [a, b] = near;
    if (!b) {
      const d = dist(a);
      /* Right on a bear's centre there is no line from it, so the walker steps back against its heading. */
      const ux = d > 1e-9 ? (walker.x - a.x) / d : Math.sin(walker.heading), uz = d > 1e-9 ? (walker.z - a.z) / d : Math.cos(walker.heading);
      walker.x = a.x + ux * reach; walker.z = a.z + uz * reach;
    } else {
      const ex = b.x - a.x, ez = b.z - a.z, e = Math.hypot(ex, ez), nx = -ez / e, nz = ex / e;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, half = Math.sqrt(Math.max(0, reach * reach - (e * e) / 4));
      let side = (walker.x - mx) * nx + (walker.z - mz) * nz;
      /* Right on the line between the two, the walker steps out to its left. */
      if (Math.abs(side) < 1e-9) side = -Math.cos(walker.heading) * nx + Math.sin(walker.heading) * nz || 1;
      walker.x = mx + Math.sign(side) * nx * half; walker.z = mz + Math.sign(side) * nz * half;
    }
  }
}

/* The stage is solid to the third-person camera as well: it stands for a column, a vertical cylinder `r` round (x, z) from the ground
   up to `top`. How far the line from `o` along the unit direction `d` goes before it enters one, through its side or, falling from
   above, through its top; Infinity if it never does, or if the column stands around `o`. From outside, the side's two crossings lie
   both ahead or both behind, and straight up meets neither. */
export function enterColumn(o, d, { x, z, r, top }) {
  const ox = o.x - x, oz = o.z - z, c = ox * ox + oz * oz - r * r;
  const a = d.x * d.x + d.z * d.z, b = ox * d.x + oz * d.z, q = b * b - a * c;
  if (a < 1e-9 || c < 0 || q < 0) return Infinity;
  const w = Math.sqrt(q), t0 = (-b - w) / a, t1 = (-b + w) / a;
  if (t0 < 0) return Infinity;
  if (o.y + d.y * t0 <= top) return t0;
  return o.y + d.y * t1 <= top ? (top - o.y) / d.y : Infinity;
}

/* A landmark stands clear of the bears' line when, seen from above, every point of the line keeps CLEAR from all of it: a bear's
   half-width, 1.5 m (bears.js), and a quarter metre more. */
export const CLEAR = 1.75;

/* The convex hull of points [x, z], counter-clockwise: a landmark's outline seen from above (path.js). */
export function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  /* One side of the hull, along `list`: a point where the outline would not turn left is dropped. */
  const side = (list) => {
    const h = [];
    for (const q of list) { while (h.length > 1 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
    return h.slice(0, -1);
  };
  return side(p).concat(side(p.reverse()));
}

/* How far a point stands outside a convex outline given counter-clockwise, or, negative, how deep inside it. */
export function outside(poly, x, z) {
  let inside = poly.length > 2, d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
    if (ex * wz - ez * wx < 0) inside = false;
    const t = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez || 1)));
    d = Math.min(d, Math.hypot(wx - ex * t, wz - ez * t));
  }
  return inside ? -d : d;
}

/* Where a landmark stands: at its song's point (x, z), wherever the bears' line passes. */
export function standClear(x, z, rot, poly, pts, within = 20) {
  return { x, z };
}
