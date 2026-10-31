/* eslint-disable */
import { slotDistance } from "./modes.js";

/* The camera that walks with the bears, with no three import so that vitest can load it. Points are anything with x, y and z, as
   three's Vector3. `deps` is what it reads of the world, at each call: `third` (third person, else first) and `phone`; `bearD`, how
   far the lead bear is along the bears' line (m); `count`, how many bears are shown, which a downgrade lowers; `gap`, the distance
   between neighbours on the line (m); `line`, whose `at(d)` is the line's point `d` m along it; `height`, the ground's (ground.js);
   and `keepInView(from, look)`, how far (rad) a third-person view from `from` toward `look` turns down, which reads the visitor's
   bear and the camera, so main.js holds it. The visitor's bear stands where slotDistance (modes.js) puts it. */

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
