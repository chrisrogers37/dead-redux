import { outlineChecks } from "./band-outline";

// The seven of 1968 to 1970 (lineup.js), named by a day of its row, held to the checks every line-up keeps (band-outline.ts). At
// half a phone's pixels the two drummers meet as they do a rung above: the second's right forearm, fitted to the canvas (band.js
// DRUM_FOREARM), comes within a pixel of the first's crash pole from the back of the crowd. So do the rhythm guitarist and the
// keys player, at both rungs. They met there before the microphones' stands stood beside the players (band.js MIC) and still did
// after, but the film missed it: the keys' stand, its top at the mouth's height, stood over where they met, and a part that moved
// under a stand's pixels changed nothing the film looked again at (band-outline.ts filmOf; band-outline.test.ts).
outlineChecks("the seven of 1968–70", "1969-04-17", { touch: ["rung 2: 3 and 4", "rung 2: 5 and 6", "rung 3: 3 and 4", "rung 3: 5 and 6"], apart: ["3 crash"] });
