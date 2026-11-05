/* eslint-disable */
import { BODY_REACH, keepOut } from "./collide.js";
import { BOUND, STAGE_COLUMN, STAGE_REACH } from "./ground.js";

/* Where a walk starts, with no three import so that vitest can load it. A walk is the visitor's own: their bear stands where the
   walker does. Every other camera (the descent, attract, follow and lean-back's drift) walks the bear in its place in the bears' line,
   so leaving one would leave the bear there; instead a walk starts where the bear last stood in a walk. A spot is { x, z, heading }.
   `limits` is what a walk's frame keeps the walker to (walkLimits): within `bound` of the island's centre, out of the reach
   `stageReach` round each column in `stages`, the stage's, and out of the reach `bearReach` round each of the bears' spots, `bears`
   (collide.js). */

/* The limits of the world's walk: within BOUND of the island's centre, out of STAGE_REACH round the stage's column (ground.js), and
   out of BODY_REACH round each of `bears` (collide.js). `bears` is held, not copied: it is the bears' live spots, which a walk reads
   when it begins and which the downgrade truncates in place. */
export function walkLimits(bears) {
  return { bound: BOUND, stages: [STAGE_COLUMN], stageReach: STAGE_REACH, bears, bearReach: BODY_REACH };
}

/* Whether a walker may stand at `p`. */
export function fits(p, { bound, stages, stageReach, bears, bearReach }) {
  return Math.hypot(p.x, p.z) <= bound + 1e-9 && stages.every((s) => Math.hypot(p.x - s.x, p.z - s.z) >= stageReach - 1e-9) &&
    bears.every((b) => Math.hypot(p.x - b.x, p.z - b.z) >= bearReach - 1e-9);
}

/* Moves `p` where each frame of a walk keeps the walker (main.js): back within the bound on the same bearing, then out of the stage's
   reach, then out of the bears', so the bears have the last word. keepOut reads `p.heading` to break a tie on a centre (collide.js). */
export function confine(p, { bound, stages, stageReach, bears, bearReach }) {
  const d = Math.hypot(p.x, p.z);
  if (d > bound) { p.x *= bound / d; p.z *= bound / d; }
  keepOut(p, stages, stageReach);
  keepOut(p, bears, bearReach);
}

/* Where a walk starts: where the bear last stood in a walk, `stood`, if a walker may still stand there. Else the nearest spot where one
   may, which is where a walk's frame would move it (`confine`). Else, as with no walk before it (the first after the descent), its
   place in the line, `slot`. Returns the spot, and in `from` which of the three it is: "stood", "nearest" or "slot". */
export function walkFrom(stood, slot, limits) {
  if (stood) {
    const p = { x: stood.x, z: stood.z, heading: stood.heading };
    if (fits(p, limits)) return { ...p, from: "stood" };
    confine(p, limits);
    if (fits(p, limits)) return { ...p, from: "nearest" };
  }
  return { x: slot.x, z: slot.z, heading: slot.heading, from: "slot" };
}

/* The walker's spot across the modes. `stand()` keeps it in each frame of a walk, once the bear has stepped there; `walk()` puts the
   walker where walkFrom says when a walk begins, reading `slot()` and the limits' bears then, and returns which spot it chose. */
export function keepSpot(walker, slot, limits) {
  const stood = { x: 0, z: 0, heading: 0 };
  let walked = false;
  return {
    stand() { stood.x = walker.x; stood.z = walker.z; stood.heading = walker.heading; walked = true; },
    walk() {
      const s = walkFrom(walked ? stood : null, slot(), limits);
      walker.x = s.x; walker.z = s.z; walker.heading = s.heading;
      return s.from;
    },
  };
}

/* How far along the bears' line the visitor's bear stands: a sixth bear, one `gap` behind the last of the `count` bears shown, so
   `count` gaps behind the lead bear at `bearD`. */
export function slotDistance(bearD, count, gap) {
  return bearD - count * gap;
}

/* The visitor's place in the bears' line, `d` m along it: the line's point there, facing along the line. `line` is the bears' line
   (path.js), whose `at(d)` and `tangentAt(d)` give the point and the unit tangent at `d`. Heading 0 faces -z, so a tangent `t` is
   faced by atan2(-t.x, -t.z). It is the `slot` keepSpot reads. */
export function slotAt(line, d) {
  const p = line.at(d), t = line.tangentAt(d);
  return { x: p.x, z: p.z, heading: Math.atan2(-t.x, -t.z) };
}

/* What entering the mode `to` from the mode `from` asks of the camera, for main.js to carry out. Nothing happens when the mode is the
   same (`changed` is false). A walk starts where `spot` (keepSpot's) says and puts the walker there, so it is asked once for each
   entry to a walk and for no other mode; the camera `cut`s to the walk unless that is its place in the line, where the last camera
   already is, since easing from there to anywhere else would carry the view across the island without the bear in it. Follow frames
   the bears again, level (`followEntered`). */
export function enterMode(from, to, spot) {
  if (to === from) return { changed: false, cut: false, followEntered: false };
  const cut = to === "walk" && spot.walk() !== "slot";
  return { changed: true, cut, followEntered: to === "follow" };
}
