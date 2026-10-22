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
