// The band's still: the shoot stands the visitor at the front of the crowd, in the aisle up its middle 19 m from the stage's centre,
// facing the stage and looking a little down (?pose=X,Z,HEADING,PITCH, public/world/main.js), in first person with the HUD's shelves
// put away, as the near stills are, while the show plays: the light panel is lit behind the six players, so each is judged by an
// outline, at the size a visitor at the front sees it. It is taken on a desktop and on a phone, which stands 4 m further back: from
// the desktop's place a phone's narrower view cut the keyboard at its right edge. Two stills, both with the show playing: one as it
// starts and one some 15 s on, once the world's hour is the show's, so the pair also shows how far the players move.
// scripts/__tests__/band-still.test.ts holds each pose to the stage and to the band as public/world/band.js builds it.
import { FIXED_DAY } from "./near.mjs";

// Where the visitor stands and how they look, in the world's own frame: x, z, heading and pitch.
export const BAND_POSE = { x: 58.86, z: -51.14, heading: -0.855, pitch: -0.08 };
// The phone's place: the same line of sight from 4 m further back along it.
export const BAND_BACK_PHONE = 4;
export const BAND_POSE_PHONE = {
  ...BAND_POSE,
  x: Math.round((BAND_POSE.x + Math.sin(BAND_POSE.heading) * BAND_BACK_PHONE) * 100) / 100,
  z: Math.round((BAND_POSE.z + Math.cos(BAND_POSE.heading) * BAND_BACK_PHONE) * 100) / 100,
};
/** The pose a device's still is taken from. */
export const bandPose = (device) => (device.startsWith("phone") ? BAND_POSE_PHONE : BAND_POSE);
// The song the still is taken in, and the seconds into it the page joins it at: Fire On The Mountain, by which night has fallen.
export const BAND_AT = { index: 8, seconds: 130 };

// The page's path: the fixed day from the pose, the show's map driving the world (?drive=map), joined at the song.
export const bandPath = (device = "desktop") => {
  const pose = bandPose(device);
  return `/${FIXED_DAY}?pose=${pose.x},${pose.z},${pose.heading},${pose.pitch}&drive=map&at=${BAND_AT.index}&t=${BAND_AT.seconds}`;
};
