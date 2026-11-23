/* eslint-disable */
import { slotDistance } from "./modes.js";

/* The camera that walks with the bears, with no three import so that vitest can load it. Points are anything with x, y and z, as
   three's Vector3. `deps` is what it reads of the world, at each call: `third` (third person, else first) and `phone`; `bearD`, how
   far the lead bear is along the bears' line (m); `count`, how many bears are shown, which a downgrade lowers; `gap`, the distance
   between neighbours on the line (m); `line`, whose `at(d)` is the line's point `d` m along it; `height`, the ground's (ground.js);
   and `keepInView(from, look)`, how far (rad) a third-person view from `from` toward `look` turns down, which reads the visitor's
   bear and the camera, so main.js holds it. The visitor's bear stands where slotDistance (modes.js) puts it. */

/* The opening's descent comes straight down from this high over the island's middle to the camera that walks with the bears. */
export const DESCENT_FROM = 140;

/* The crane, which has the view once a ride has settled (modes.js), hangs `back` m behind the visitor's bear along the bears' line,
   sways `sway` m to either side of the line, and looks at the line `ahead` m on from where it hangs. */
export const CRANE = { back: 14, sway: 2, ahead: 28 };

/* The crane's place and where it looks, `elapsed` seconds of world time in: 9 m over the ground it hangs above, swaying to either
   side of the line and back once in 30 s, and looking 8 m over the line. `deps` is postPose's, of which it reads `bearD`, `count`,
   `gap`, `line`, whose `tangentAt(d)` is the line's level unit tangent `d` m along it, and `height`. */
export function cranePose(deps, elapsed) {
  const { bearD, count, gap, line, height } = deps;
  const d = slotDistance(bearD, count, gap) - CRANE.back, p = line.at(d), t = line.tangentAt(d), ahead = line.at(d + CRANE.ahead);
  const sway = CRANE.sway * Math.sin((elapsed * Math.PI * 2) / 30);
  /* To the line's side: its tangent turned a quarter of a turn. */
  const x = p.x - t.z * sway, z = p.z + t.x * sway;
  return { pos: { x, y: height(x, z) + 9, z }, look: { x: ahead.x, y: ahead.y + 8, z: ahead.z } };
}

/* A ride's camera goes from the one rig to the other in RIG_EASE_S seconds of world time, in a straight line and at the same share
   of the way in its look: `lean` is the share of that time passed, 0 on the camera that walks with the bears (`post`, postPose's)
   and 1 on the crane (`crane`, cranePose's), and rigShare the share of the way it has then gone, setting off and arriving at
   rest. No tree's crown can reach that line, wherever a show stands its trees (trees.test.ts). */
export const RIG_EASE_S = 3;
export const rigShare = (lean) => lean * lean * (3 - 2 * lean);
export function ridePose(post, crane, lean) {
  if (lean <= 0) return post;
  if (lean >= 1) return crane;
  const k = rigShare(lean), mix = (a, b) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
  return { pos: mix(post.pos, crane.pos), look: mix(post.look, crane.look) };
}

/* The camera that walks with the bears, in follow and attract, its eye above their heads; it looks at the lead bear, turned by `yaw`
   and tilted by `pitch`. In third person it stands behind the visitor's bear and to its left, away from the path, along the chord from
   that bear to the lead one, and looks 2 m over the lead bear's head, so all six read: 16 m behind and 6 m to the left with the eye
   10 m up on a desktop or a TV, which keeps the visitor's bear left of the plates at the lower right; 12 m and 3 m with the eye 6.5 m
   up on a phone. Where a climb toward the lead bear would sink the visitor's bear, the view turns down first (keepInView). In first
   person it stands on the line, 6 m behind the last bear, the eye 6.5 m up, and looks 2 m over the lead bear's feet. */
export function postPose(deps, yaw, pitch) {
  const { third, phone, bearD, count, gap, line, height, keepInView } = deps;
  const lead = line.at(bearD);
  let x, z, eye = 6.5;
  if (third) {
    const s = line.at(slotDistance(bearD, count, gap)), cl = Math.hypot(lead.x - s.x, lead.z - s.z) || 1, cx = (lead.x - s.x) / cl, cz = (lead.z - s.z) / cl;
    const back = phone ? 12 : 16, side = phone ? 3 : 6;
    x = s.x - cx * back + cz * side; z = s.z - cz * back - cx * side;
    if (!phone) eye = 10;
  } else {
    const p = line.at(bearD - ((count - 1) * gap + 6));
    x = p.x; z = p.z;
  }
  const pos = { x, y: height(x, z) + eye, z };
  const h0 = Math.atan2(-(lead.x - x), -(lead.z - z)), dist = Math.hypot(lead.x - x, lead.z - z);
  let e0 = Math.atan2(lead.y + (third ? 5.6 : 2) - pos.y, dist);
  if (third) e0 -= keepInView(pos, { x: x - Math.sin(h0) * dist, y: pos.y + Math.tan(e0) * dist, z: z - Math.cos(h0) * dist });
  const h = h0 + yaw, e = Math.max(-1.3, Math.min(1.3, e0 + pitch));
  return { pos, look: { x: x - Math.sin(h) * dist, y: pos.y + Math.tan(e) * dist, z: z - Math.cos(h) * dist } };
}
