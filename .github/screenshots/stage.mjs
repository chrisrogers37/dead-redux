// The stage's stills on a day of the Wall of Sound (public/world/stage.js STAGES), the one stage of the era table that is not the roof's:
// the shoot's other days' shows all stand on the roof's stage. It is taken from the back of the crowd (?pose=crowd) and from among it
// (?pose=among), as the fixed day's stage is, and from the front of the crowd, where the band's stills stand (band.mjs), in first
// person with the HUD's shelves put away, so the Wall is seen whole at the size a visitor at the front sees it; on a desktop and on a
// phone. The pages only load and shoot: no 1974 show has a map yet (public/maps), so none plays, and the world stands at the hour it
// opens on. scripts/__tests__/stage-still.test.ts holds the day to its show and the show to the Wall.
import { bandPose } from "./band.mjs";

// The days, each with its show (data/pick-schedule.json) and the stills' name. 2027-06-13's show is 1974-07-19, at Selland Arena in
// Fresno, the six of 1972 to 1974 with the piano and the singer (public/world/lineup.js), on the Wall: the schedule's first day whose
// show is in the Wall's row and in North America. The one before it, 2027-02-16's, is of the European tour of September 1974, of
// which the source of the Wall's dates says nothing.
export const WALL_DAYS = [{ day: "2027-06-13", show: "1974-07-19", shot: "1974-07-19-wall" }];

// The shoot's pages for the stills: from the back of the crowd and from among it, then from the front, each device from its own place.
export const stagePages = () => WALL_DAYS.flatMap(({ day, shot }) => [
  { path: `/${day}?pose=crowd`, devices: ["desktop", "phone"], shots: [`${shot}-crowd`] },
  { path: `/${day}?pose=among`, devices: ["desktop", "phone"], shots: [`${shot}-among`] },
  ...["desktop", "phone"].map((device) => {
    const { x, z, heading, pitch } = bandPose(device);
    return { path: `/${day}?pose=${x},${z},${heading},${pitch}`, devices: [device], whole: true, shots: [`${shot}-front`] };
  }),
]);
