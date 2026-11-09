/* eslint-disable */
import { FACING, STAGE } from "./ground.js";

/* Where the crowd on the hill stands (crowd.js draws it), as plain numbers: no three import, so the unit tests load it. */

/* A figure stands this tall: the band's height on the stage (stage.js), so the bears' 4.85 m is about one and a half people. */
export const PERSON = 3.15;

/* The crowd's sections, in rings round the stage's centre: `r0` to `r1` metres out, and `a0` to `a1` radians either side of its axis
   (from 0, one span across the axis). A section's rows stand `gap` metres apart, and its figures about as far apart along a row; the
   front stands closest. Up the hill they sit. */
const SECTIONS = [
  { r0: 13.5, r1: 28, a0: 0, a1: 0.7, gap: 1.6 },
  { r0: 28, r1: 42, a0: 0, a1: 0.85, gap: 2.6 },
  { r0: 42, r1: 55, a0: 0, a1: 0.85, gap: 3.8, sit: true },
  { r0: 16, r1: 28, a0: 0.7, a1: 1, gap: 5.2 },
  { r0: 28, r1: 44, a0: 0.85, a1: 1, gap: 5.2 },
];
/* How near the sections come to the stage's centre, and how far they reach from it. */
const NEAR = Math.min(...SECTIONS.map((s) => s.r0)), FAR = Math.max(...SECTIONS.map((s) => s.r1));

/* How far a figure's place keeps from the path, from the bears' line, from a landmark's bounds, and to either side of the stage's axis,
   which leaves an aisle up the middle of the crowd for the walk down to the stage, in metres. */
const KEEP = { path: 4, line: 4, landmark: 1.5, aisle: 3 };

/* The seats, front first: each { x, z, r, sit }, `r` metres from the stage's centre. Rows of each section, jittered the same way every
   day, keep clear of the aisle, of the points of `path` and `line` ([x, z] each) and of `landmarks`, each a circle [x, z, radius] round
   one. Front first with a random spread, so any count of the first seats keeps the crowd's shape and thins the back of the hill first. */
export function seats({ path, line, landmarks }) {
  let s = 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const keeps = [
    ...path.map(([x, z]) => [x, z, KEEP.path]),
    ...line.map(([x, z]) => [x, z, KEEP.line]),
    ...landmarks.map(([x, z, radius]) => [x, z, radius + KEEP.landmark]),
  ].filter(([x, z, d]) => Math.hypot(x - STAGE[0], z - STAGE[1]) < FAR + d);
  const clear = (x, z) => keeps.every(([kx, kz, d]) => Math.hypot(x - kx, z - kz) >= d);
  const out = [];
  for (const { r0, r1, a0, a1, gap, sit = false } of SECTIONS) {
    const spans = a0 === 0 ? [[-a1, a1]] : [[a0, a1], [-a1, -a0]];
    for (let row = r0 + gap / 2; row < r1; row += gap) {
      for (const [lo, hi] of spans) {
        const n = Math.max(1, Math.floor(((hi - lo) * row) / gap));
        for (let k = 0; k < n; k++) {
          const r = row + (rnd() - 0.5) * 0.7 * gap, th = lo + ((k + 0.5) * (hi - lo)) / n + ((rnd() - 0.5) * 0.7 * gap) / row;
          const x = STAGE[0] + r * Math.sin(FACING + th), z = STAGE[1] + r * Math.cos(FACING + th);
          const key = rnd() * (0.4 + (r - NEAR) / (FAR - NEAR));
          if (Math.abs(r * Math.sin(th)) >= KEEP.aisle && clear(x, z)) out.push({ x, z, r, sit, key });
        }
      }
    }
  }
  return out.sort((a, b) => a.key - b.key).map(({ key, ...seat }) => seat);
}
