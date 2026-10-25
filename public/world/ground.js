/* eslint-disable */

/* The island's ground and the stage's place on it, as plain numbers: no three import, so the unit tests load it beside collide.js and
   boom.js. */

export const G = (gx, gy) => [(gx - 100) * 1.2, (gy - 100) * 1.2]; // the mark's 200 grid to metres
export const CAVES = [G(66, 108), G(134, 108)];
/* Where the loop starts and ends, at the hill's south foot (path.js). */
export const TRAILHEAD = G(100, 186);
/* The stage's place, on the flat ground at the hill's south-west foot, and the height of its shelf: the ground's own height there, which
   the shelf holds flat within 8 m of the stage, blending back into it by 14 m. */
export const STAGE = G(74, 173), SHELF_Y = 2.5;
/* The stage faces the trailhead, so a visitor arriving there sees its front, and its back looks out over ground no walk crosses. A
   group's local +z points along its facing, the repo's convention (the bears face along their line so). */
export const FACING = Math.atan2(TRAILHEAD[0] - STAGE[0], TRAILHEAD[1] - STAGE[1]);
/* The test hook ?pose=stage: on the open ground in front of the stage, 35.5 m from its centre and 14 degrees off its front, facing it
   and looking a little down. In third person the look down raises the boom, so the stage stands over the bear's head. */
export const STAGE_POSE = { x: -4.2, z: 110.7, heading: 0.863, pitch: -0.2 };
/* The test hook ?pose=path: on the loop's last stretch, heading along it toward the trailhead, a few metres past where the stage first
   shows whole and clear of the fog, and past the landmark there, so the boom stands its full length behind the bear: the stage's front,
   about 72 m off, at the right of the frame. */
export const PATH_POSE = { x: 30.2, z: 99.4, heading: 1.928, pitch: 0 };

/* The island's own height, before the stage's shelf. */
export function slope(x, z) {
  const d = Math.hypot(x, z);
  let h = 2.5 + 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
  const t = Math.max(0, 1 - (d / 84) * (d / 84));
  h += 28 * t * Math.sqrt(t);
  for (const [cx, cz] of CAVES) {
    const dc = Math.hypot(x - cx, z - cz);
    if (dc < 13) h -= 6 * (1 - (dc / 13) * (dc / 13));
  }
  const nose = Math.hypot(x, z - 26);
  if (nose < 9) h -= 2.5 * (1 - nose / 9);
  if (d > 118) h -= ((d - 118) / 10) * 5.5;
  return h;
}

/* The ground's height: the island's own, with the stage's shelf. */
export function height(x, z) {
  let h = slope(x, z);
  const ds = Math.hypot(x - STAGE[0], z - STAGE[1]);
  if (ds < 14) {
    const s = Math.min(1, (14 - ds) / 6);
    h += (SHELF_Y - h) * s * s * (3 - 2 * s);
  }
  return h;
}
