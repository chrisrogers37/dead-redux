import { LIFT_LEAST, outlineChecks } from "./band-outline";

// The seven of 1990 to 1992 (lineup.js), named by a day of its row, held to the checks every line-up keeps (band-outline.ts). From
// the front of the crowd on a desktop its keys player's body shows 326 px below the shoulders at the top of the left lift, under the
// 340 the six's keys are held to: standing at the crowd's left end, turned the other way, its own arms lie over 137 px of the body,
// where they lie over 72 to 113 at the six's two lifts, the 1968 seven's and its own right lift; and a seven stands at 0.95 of the
// six's size (band.js CLOSE), so the trunk is 754 px to the six's 842. Held to 300.
outlineChecks("the seven of 1990–92", "1991-06-01", { touch: ["rung 2: 3 and 4", "rung 3: 3 and 4"], apart: ["3 crash"], lift: { keys: { ...LIFT_LEAST.keys, "desktop band": { arm: 130, body: 300 } } } });
