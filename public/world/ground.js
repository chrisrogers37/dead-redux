/* eslint-disable */

/* The island's ground and the stage's place on it, as plain numbers: no three import, so the unit tests load it beside collide.js and
   boom.js. */

export const G = (gx, gy) => [(gx - 100) * 1.2, (gy - 100) * 1.2]; // the mark's 200 grid to metres
export const CAVES = [G(66, 108), G(134, 108)];
/* Where the loop starts and ends, at the hill's south foot (path.js). */
export const TRAILHEAD = G(100, 186);
/* The stage's place, on the flat ground at the island's north-east edge, its platform 5.5 m inside the ring road, and the height of its
   shelf: the ground's own height there, which the shelf holds flat within 8 m of the stage, blending back into it by 14 m. */
export const STAGE = G(161, 47), SHELF_Y = 2.5;
/* The stage faces the island's middle, so the hill rises before it as an amphitheatre's seating does, and its back looks out over the
   shore. A group's local +z points along its facing, the repo's convention (the bears face along their line so). */
export const FACING = Math.atan2(-STAGE[0], -STAGE[1]);
/* The test hook ?pose=stage: on the slope in front of the stage, on its axis 34 m from its centre and 8 m above its floor, facing it and
   looking a little down. In third person the look down raises the boom, so the stage stands over the bear's head. */
export const STAGE_POSE = { x: 47.5, z: -41.3, heading: -0.855, pitch: -0.2 };
/* The test hook ?pose=slope: higher up the slope on the stage's axis, 55 m from its centre and 18 m above its floor, facing it and
   looking down over the slope between, as its seating sees it. */
export const SLOPE_POSE = { x: 31.7, z: -27.5, heading: -0.855, pitch: -0.3 };
/* The test hook ?pose=path: on the loop at the summit's north-east shoulder, heading along it, with the stage's front in the frame below,
   about 80 m off down the slope, and the boom its full length behind the bear. */
export const PATH_POSE = { x: 18.6, z: -6.4, heading: -1.053, pitch: 0 };
/* The walk keeps within this distance of the island's centre: past the bears' line, which reaches 112.4 m out, by more than a reach,
   so stepping back from a bear never carries a walker past it. */
export const BOUND = 117;

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
