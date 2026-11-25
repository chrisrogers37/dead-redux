import { LIFT_LEAST, outlineChecks } from "./band-outline";

// The seven of 1990 to 1992 (lineup.js), held to the checks every line-up keeps (band-outline.ts).
outlineChecks("the seven of 1990–92", ["lead", "rhythm", "bass", "drums", "drums", "keys", "piano"], { touch: ["rung 2: 3 and 4", "rung 3: 2 and 3", "rung 3: 3 and 4"], apart: ["3 crash"], lift: { keys: { ...LIFT_LEAST.keys, "desktop band": { arm: 130, body: 300 } } } });
