// The band's stills: the shoot stands the visitor at the front of the crowd, in the aisle up its middle 19 m from the stage's centre,
// facing the stage and looking a little down (?pose=X,Z,HEADING,PITCH, public/world/main.js), in first person with the HUD's shelves
// put away, as the near stills are, while the show plays: the light panel is lit behind the players, so each is judged by an
// outline, at the size a visitor at the front sees it. It is taken on a desktop and on a phone, which stands 4 m further back: from
// the desktop's place a phone's narrower view cut the keyboard at its right edge. Two stills, both with the show playing: one as it
// starts and one some 15 s on, once the world's hour is the show's, so the pair also shows how far the players move. The band is the
// line-up of the day's show (public/world/lineup.js), so the stills are taken on three days (BAND_DAYS): the fixed day's six, and two
// line-ups of other eras. scripts/__tests__/band-still.test.ts holds each pose to the stage and to every line-up as
// public/world/band.js builds it.
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
// The days the band is shot on, each with its show (data/pick-schedule.json) and the song the stills are taken in: its index and the
// seconds into it the page joins it at, early in the show's second set, by which night has fallen; and the stills' name. The fixed
// day's show is the six of 1979 to 1990, in Fire On The Mountain. 2026-11-24's, 1969-04-17, is the seven of 1968 to 1970, with the
// organ and a second keyboard, in Turn On Your Love Light, after Dark Star; 2026-11-27's, 1973-03-30, the six of 1972 to 1974, with
// the piano and the singer, in Jack Straw, after China Cat Sunflower opens the second set.
export const BAND_DAYS = [
  { day: FIXED_DAY, show: "1986-07-04", index: 8, seconds: 130, title: "Fire On The Mountain ->", shot: "fixed-band" },
  { day: "2026-11-24", show: "1969-04-17", index: 8, seconds: 130, title: "Turn On Your Love Light", shot: "1969-04-17-band" },
  { day: "2026-11-27", show: "1973-03-30", index: 17, seconds: 130, title: "Jack Straw", shot: "1973-03-30-band" },
];
// The fixed day's song and place in it.
export const BAND_AT = { index: BAND_DAYS[0].index, seconds: BAND_DAYS[0].seconds };

// The page's path: the day from the pose, the show's map driving the world (?drive=map), joined at the song.
export const bandPath = (device = "desktop", { day, index, seconds } = BAND_DAYS[0]) => {
  const pose = bandPose(device);
  return `/${day}?pose=${pose.x},${pose.z},${pose.heading},${pose.pitch}&drive=map&at=${index}&t=${seconds}`;
};
