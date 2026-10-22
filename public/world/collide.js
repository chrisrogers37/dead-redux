/* eslint-disable */

/* The bears are solid to the walker. A walker nearer a bear's centre than `reach`, on the ground, goes back out to `reach` along
   the line from the bear, so a held walk slides along the column instead of passing through it. `spots` are the bears' positions. */
export function keepOut(walker, spots, reach) {
  for (const s of spots) {
    const dx = walker.x - s.x, dz = walker.z - s.z, d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    /* Right on a bear's centre there is no line from it, so the walker steps back against its heading. */
    const ux = d > 1e-9 ? dx / d : Math.sin(walker.heading), uz = d > 1e-9 ? dz / d : Math.cos(walker.heading);
    walker.x = s.x + ux * reach; walker.z = s.z + uz * reach;
  }
}
