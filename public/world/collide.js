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
