// The band's still: the shoot stands the visitor at the front of the crowd, in the aisle up its middle 19 m from the stage's centre,
// facing the stage and looking a little down (?pose=X,Z,HEADING,PITCH, public/world/main.js), in first person with the HUD's shelves
// put away, as the near stills are, while the show plays: the light panel is lit behind the six players, so each is judged by an
// outline, at the size a visitor at the front sees it. It is taken on a desktop and on a phone, whose narrower view still holds all
// six. scripts/__tests__/band-still.test.ts holds the pose to the stage and to the band as public/world/band.js builds it.
import { FIXED_DAY } from "./near.mjs";

// Where the visitor stands and how they look, in the world's own frame: x, z, heading and pitch.
export const BAND_POSE = { x: 58.86, z: -51.14, heading: -0.855, pitch: -0.08 };
// The song the still is taken in, and the seconds into it the page joins it at: Fire On The Mountain, by which night has fallen.
export const BAND_AT = { index: 8, seconds: 130 };

// The page's path: the fixed day from the pose, the show's map driving the world (?drive=map), joined at the song.
export const bandPath = () =>
  `/${FIXED_DAY}?pose=${BAND_POSE.x},${BAND_POSE.z},${BAND_POSE.heading},${BAND_POSE.pitch}&drive=map&at=${BAND_AT.index}&t=${BAND_AT.seconds}`;
