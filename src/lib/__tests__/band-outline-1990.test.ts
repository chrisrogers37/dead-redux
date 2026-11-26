import { LIFT_LEAST, outlineChecks } from "./band-outline";

// The seven of 1990 to 1992 (lineup.js), named by a day of its row, held to the checks every line-up keeps (band-outline.ts). From
// the front of the crowd on a desktop its keys player's body (`liftShown`'s `body`) shows 324 px below the shoulders at the top of the
// left lift, under the 340 the six's keys are held to. Standing at the crowd's left end, turned the other way, its two arms hide 139
// of the 463 px its trunk shows below the shoulders when drawn without them, where they hide 72 to 113 at the six's two lifts, the
// 1968 seven's and its own right lift. (That is not `liftShown`'s `arm`, the lifted forearm and hand against the panel: 157 here.)
// And a seven stands at 0.95 of the six's size (band.js CLOSE), so the whole trunk, drawn without the arms, is 845 px to the six's
// 955. Held to 300.
outlineChecks("the seven of 1990–92", "1991-06-01", { touch: ["rung 2: 3 and 4", "rung 3: 3 and 4"], apart: ["3 crash"], lift: { keys: { ...LIFT_LEAST.keys, "desktop band": { arm: 130, body: 300 } } } });
