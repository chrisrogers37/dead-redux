import { appendFile, mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { TEST_POSES } from "../../public/world/ground.js";
import { logText } from "../../scripts/job-text.mjs";
import {
  CALL_BUDGET,
  callsFailure,
  evaluateAcrossNavigation,
  GROVE_POSES,
  nearFailure,
  readWalkCalls,
  routingFailure,
  saveAssets,
  sweepPeak,
  sweepSummary,
  walkPoses,
} from "./assets.mjs";
import { BAND_DAYS, bandPath } from "./band.mjs";
import { NEAR_FRAMES, nearPages, standFailure } from "./near.mjs";
import { EASE_MS, press, RECORD_MS, RECORDINGS, step, WORLD_MS, worldStarted } from "./recordings.mjs";
import { cursorFailure, cursorNow, fileFailures, FOCUS_STOPS, movePointer, pressFailure, pressWorld, rideIdle, ridePages, stillInLook } from "./ride.mjs";
import { planFailures, planFiles, shardPlan, writtenSince } from "./shards.mjs";

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  tv: { viewport: { width: 1920, height: 1080 } },
  "desktop-reduced": { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
  // The narrowest common phone, for the top row and long dates.
  "phone-360": {
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  // A phone on its side: 640 px wide or wider, where the page lays itself out as on a desktop and hides the stick, and still a touch
  // screen under 900 px, which keeps the phone's tier (quality.js). It shoots only the pages that name it.
  "phone-landscape": {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  // Without WebGL 2, for the designed still. That is a launch switch, so these two get their own browser, and they shoot only the
  // pages that name them.
  "desktop-nowebgl": { viewport: { width: 1440, height: 900 } },
  "phone-nowebgl": {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const NO_WEBGL = new Set(["desktop-nowebgl", "phone-nowebgl"]);
// The devices that shoot only the pages that name them.
const BY_NAME = new Set([...NO_WEBGL, "phone-landscape"]);

// archive.org can take tens of seconds to start a stream from CI, so a play step waits this long for the player to settle.
const PLAY_WAIT_MS = 45_000;

// A track's audio, which a page with failAudio aborts: Relisten's mp3 files.
const isTrackAudio = (url) => url.pathname.endsWith(".mp3");

// The play step: press play, wait for the player to settle, then shoot; `later` ({ ms, shot }) adds a later shot. The log names the
// state the player reached and the sentence on its now-plate, so a slow upstream shows there instead of failing the step.
const playStep = (shot, later) => ({
  click: "[data-action='play']",
  waitFor: "[data-state='playing'], [data-state='stalled'], [data-state='error']",
  waitMs: PLAY_WAIT_MS,
  player: true,
  shot,
  later,
});

// A shelf's tab, and the tab of a shelf the page marks away ("in") or back on the screen ("out").
const shelfTab = (shelf) => `[data-shelf-tab='${shelf}']`;
const shelfAt = (shelf, state) => `[data-shelf='${state}'] > ${shelfTab(shelf)}`;

// The shelf step: press a shelf's tab, wait for the page to mark the shelf away ("in") or back on the screen ("out"), then shoot, with
// the box log where `boxes` asks. A tab that is missing, or never moves its shelf, fails the run.
const shelfStep = (shelf, state, shot, boxes = false) => ({
  click: shelfTab(shelf),
  waitFor: shelfAt(shelf, state),
  required: true,
  boxes,
  shot,
});

// The ride's own steps on each page that shoots it (ride.mjs). A page with one of them loads with the wait its device needs before
// the ride settles (the idle hook, rideIdle), unless it keeps the page's own.
const RIDE_PAGES = ridePages(PLAY_WAIT_MS);

// Each step acts on the loaded page, then shoots it. The prefix keeps one page's file names
// apart from another's, afterPlaying ({ ms, shot }) adds a later shot of the play step, and the ride's steps come last.
const playerSteps = (prefix, afterPlaying, ride) => [
  { click: "[data-action='details']", boxes: true, shot: `${prefix}details` },
  // Keyboard focus, which is what draws the ring: Chromium shows :focus-visible after a Tab, not after a script focus that follows
  // a mouse click. Tab from the previous button lands on the play disc and starts nothing.
  { focus: "[data-action='prev']", press: "Tab", shot: `${prefix}focus-play` },
  playStep(`${prefix}playing`, afterPlaying),
  ...ride,
];

const PAGES = [
  // Two shots of one load catch the animated display moving.
  {
    path: "/",
    shots: ["home-1", "home-2"],
    steps: playerSteps("", undefined, RIDE_PAGES.home.steps),
  },
  // A fixed day whose show never changes, so every run plays the same tracks.
  {
    path: "/2026-10-20",
    shots: ["fixed-1", "fixed-2"],
    steps: playerSteps("fixed-", { ms: 8000, shot: "fixed-playing-8s" }, RIDE_PAGES.fixed.steps),
  },
  // The fixed day's walk: G (a look down, which starts nothing) leaves the opening for a walk behind the visitor's bear; then the
  // Details switch turns to first person, the walker's eye with no bear, and back, which leaves the view setting as it was.
  {
    path: "/2026-10-20",
    devices: ["desktop"],
    shots: [],
    steps: [
      { focus: "#world", press: "KeyG", shot: "fixed-walk" },
      { click: "[data-action='details']", boxes: true, shot: "fixed-view-details" },
      { click: "[data-action='view']", shot: "fixed-first-person" },
      { click: "[data-action='view']", shot: "fixed-third-person" },
    ],
  },
  // The fixed day in first person at a bear's reach, on previews: ?pose=snout stands the walker in front of the lead bear's snout looking
  // a little down, and ?pose=pass behind the last bear and a little to its side; V turns to first person for the shot and back. The
  // stats line's `bears` gives the nearest bear depth in view and the share of the frame's width a bear covers.
  {
    path: "/2026-10-20?pose=snout",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [
      { focus: "#world", press: "KeyV", shot: "fixed-reach-snout" },
      { focus: "#world", press: "KeyV", shot: "fixed-reach-snout-third" },
    ],
  },
  {
    path: "/2026-10-20?pose=pass",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [
      { focus: "#world", press: "KeyV", shot: "fixed-reach-pass" },
      { focus: "#world", press: "KeyV", shot: "fixed-reach-pass-third" },
    ],
  },
  // The fixed day without WebGL 2: the designed still under the HUD, its Details, then the show playing from the still, and the ride,
  // which there is the page's half of it: the HUD awake, then settled.
  {
    path: "/2026-10-20",
    devices: RIDE_PAGES.still.devices,
    ready: "#world[data-world='fallback']",
    shots: ["fixed"],
    steps: [{ click: "[data-action='details']", boxes: true, shot: "fixed-details" }, playStep("fixed-playing"), ...RIDE_PAGES.still.steps],
  },
  // The fixed day's focus walk, under reduced motion so the shots differ by the ring alone: Tab lands on each of the HUD's stops in
  // the order the screen shows them (FOCUS_STOPS in ride.mjs, the ride's one button among them), with a shot after each press.
  {
    path: "/2026-10-20",
    devices: ["desktop-reduced"],
    shots: [],
    steps: FOCUS_STOPS.map((_, i) => ({ press: "Tab", shot: `fixed-focus-${i + 1}` })),
  },
  // The fixed day 5 s before its first track ends: playing crosses into track 2, and the later shot logs the gap between them.
  {
    path: "/2026-10-20?at=0&t=93",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-gap-start", { ms: 12000, shot: "fixed-gap" })],
  },
  // The fixed day from Cold Rain And Snow, on the summit: the bears set off along the lit band that joins it to Fire On The Mountain.
  {
    path: "/2026-10-20?at=7",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-segue-start", { ms: 12000, shot: "fixed-segue" })],
  },
  // The fixed day at Drums, then at Space: the left cave lights, then the right, over 8 s, while the now-plate names set 2.
  {
    path: "/2026-10-20?at=13",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-drums-start", { ms: 12000, shot: "fixed-drums" })],
  },
  {
    path: "/2026-10-20?at=14",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-space-start", { ms: 12000, shot: "fixed-space" })],
  },
  // The fixed day from ?pose=stage: the visitor's bear on the slope in front of the stage, and over its head the six players against the
  // panel, the open front toward the camera. Then the show plays, shot again 8 s later from the same still camera, where the panel and the
  // light follow the music.
  {
    path: "/2026-10-20?pose=stage",
    devices: ["desktop"],
    shots: ["fixed-stage"],
    steps: [playStep("fixed-stage-playing", { ms: 8000, shot: "fixed-stage-playing-8s" })],
  },
  // The fixed day 20 s before Fire On The Mountain's peak (150 s into the track, in its map): the build-up lifts the stage panel and the
  // beam and swells the flame, more by the later shot, which lands a few seconds before the peak. The `map` line reads the build-up,
  // the flame's scale and the panel's factor beside desktop-fixed-playing-8s's, while the analyser drives the rest of the world.
  {
    path: "/2026-10-20?at=8&t=130",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-fire-build", { ms: 8000, shot: "fixed-fire-build-8s" })],
  },
  // The same from ?pose=stage with ?drive=map on previews: the map drives the world, as where the analyser cannot hear the show, and the
  // `analysis` line reads source "map"; the panel and the platform's light follow the map's envelopes and the build-up, from the still
  // camera, and the figures play at the map's tempo.
  {
    path: "/2026-10-20?pose=stage&drive=map&at=8&t=130",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-map-stage", { ms: 8000, shot: "fixed-map-stage-8s" })],
  },
  // The fixed day from ?pose=slope: the visitor's bear higher up the slope, looking down over it to the stage at its foot.
  { path: "/2026-10-20?pose=slope", devices: ["desktop"], shots: ["fixed-stage-slope"] },
  // The fixed day from ?pose=path: the visitor's bear on the loop at the summit's north-east shoulder, heading along it, and down the slope
  // to the left of it the stage's front.
  { path: "/2026-10-20?pose=path", devices: ["desktop"], shots: ["fixed-stage-path"] },
  // The fixed day from ?pose=crowd: the visitor's bear behind the crowd's last rows, and down the slope before it the crowd standing still
  // to the stage. The stats line's `crowd.drawn` counts the figures the tier draws. Under reduced motion, two shots 5 s apart, which the
  // reduced-motion compare holds to no change.
  { path: "/2026-10-20?pose=crowd", devices: ["desktop", "phone", "phone-360"], shots: ["fixed-crowd"] },
  { path: "/2026-10-20?pose=crowd", devices: ["desktop-reduced"], shots: ["fixed-crowd-1", "fixed-crowd-2"] },
  // The same while the show plays, with ?drive=map: from Jack Straw's start the crowd dances to the figures' beat, as far as the map's
  // loudness takes it, and the rig's beams swing over it; from 20 s before Fire On The Mountain's peak the build-up lifts it, the front
  // rows first, and gathers the beams, and the later shot lands a few seconds before the peak, with the rise rippled out toward the back
  // (the light show's key screen, on a phone and phone-360 too); and in Space it sits, swaying where it sits, and the beams lift. The
  // stats line's `crowd` reads how far it dances and how far it sits, and `rig` how far the rig is lit, gathered and lifted. Jack Straw's
  // start is shot on a phone too, and Space's later shot waits 20 s: they are the night's shots as well (below).
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=1",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [playStep("fixed-crowd-dance", { ms: 8000, shot: "fixed-crowd-dance-8s" })],
  },
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=8&t=130",
    devices: ["desktop", "phone", "phone-360"],
    shots: [],
    steps: [playStep("fixed-crowd-rise", { ms: 8000, shot: "fixed-crowd-rise-8s" })],
  },
  // The band, close: from the front of the crowd (band.mjs), shot whole as the near stills are, while the show plays with ?drive=map,
  // so the light panel is lit behind the players and each reads by an outline. K starts the show, since the play disc is on a shelf
  // that is away. Both stills are of the show playing: `-start` as it starts and the other 8 s and the wait for the world's hour later,
  // some 15 s on, so the pair shows how far the players move. A phone stands further back, where its narrower view holds them all.
  // The band is the day's show's line-up (public/world/lineup.js): the fixed day's six in Fire On The Mountain, then the seven of
  // 1968 to 1970 and the six of 1972 to 1974, with the piano and the singer, each on a day whose show is theirs (BAND_DAYS).
  // Each page names ?at=, so it needs no place an earlier page left. On the desktop the next page that plays names its place too (the
  // crowd's page of Space), so nothing there resumes from these; on a phone the next play step is the new day's, which resumes in the
  // fixed day's Fire On The Mountain, a few seconds on from where the crowd's page of it left it before the fixed day's band page
  // stood there. The other days' pages keep their own places (src/components/player/useResume.ts), which no later page reads.
  ...BAND_DAYS.flatMap((band) => ["desktop", "phone"].map((device) => ({
    path: bandPath(device, band),
    devices: [device],
    whole: true,
    shots: [],
    steps: [
      {
        focus: "#world",
        press: "KeyK",
        waitFor: "[data-state='playing'], [data-state='stalled'], [data-state='error']",
        waitMs: PLAY_WAIT_MS,
        player: true,
        shot: `${band.shot}-start`,
        later: { ms: 8000, shot: band.shot, night: true },
      },
    ],
  }))),
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=14",
    devices: ["desktop"],
    shots: [],
    steps: [
      playStep("fixed-crowd-space", { ms: 20000, shot: "fixed-crowd-space-20s", night: true }),
      // The moon, which no camera of the shoot faces: it stands 150 degrees round from north and 30 up (night.js), which from
      // ?pose=crowd's heading is 1.76 rad to the right and, from its look down, 1 rad up. A drag turns the view 0.005 rad a px.
      { drag: [353, -200], shot: "fixed-crowd-moon" },
    ],
  },
  // The fixed day from ?pose=among: the visitor's bear among the crowd's middle rows, off the aisle, and the figures round it stepped
  // aside.
  { path: "/2026-10-20?pose=among", devices: ["desktop"], shots: ["fixed-crowd-among"] },
  // The fixed day from inside the groves, each from a pose of four numbers (GROVE_POSES, assets.mjs): the pine wood, looking in
  // through its trunks, and the broad-crowned grove, looking north-east through its trunks. Each is shot whole, as the near pages are: in first person, with the shelves away, so
  // a phone's title shelf does not cover the crowns. The stats line's `avatar.head` says where the visitor's bear stands, 0.8 m
  // ahead of the pose.
  ...Object.entries(GROVE_POSES).map(([shot, pose]) => ({ path: `/2026-10-20?pose=${pose.join(",")}`, devices: ["desktop", "phone"], whole: true, shots: [shot] })),
  // The fixed day from ?pose=landmark-K: from 30 m over a landmark, north up, with the bears standing where their line passes nearest it,
  // the lead bear there. Jack Straw (1) stands by the trailhead, which the line rounds as the loop closes; Touch Of Grey (6) on the
  // summit's south-west shoulder and Cold Rain And Snow (7) on the summit, both beside the line from the left cave to the right one;
  // Uncle John's Band (12) on the bend at the island's west end, where the line draws in.
  { path: "/2026-10-20?pose=landmark-1", devices: ["desktop"], shots: ["fixed-over-jack-straw"] },
  { path: "/2026-10-20?pose=landmark-6", devices: ["desktop"], shots: ["fixed-over-touch-of-grey"] },
  { path: "/2026-10-20?pose=landmark-7", devices: ["desktop"], shots: ["fixed-over-cold-rain"] },
  { path: "/2026-10-20?pose=landmark-12", devices: ["desktop"], shots: ["fixed-over-uncle-johns-band"] },
  // The near stills (near.mjs): the visitor stands beside each landmark, 14 m short of it on the path and facing it, the last bear
  // beside it and the others on ahead, and the page is shot whole. Every landmark of the fixed day, then, on a second load of it,
  // every other kind of landmark, and on a third the eight kinds of standing stone, each built at one of the fixed day's songs'
  // points. A landmark is read here at the size a visitor sees it.
  ...nearPages(),
  // The fixed day with the site's day faked as 2099-01-01, a day it will not reach: the chip names the new day at load and stays while
  // the show plays on (the 8-s shot's clock has moved; the url line still reads the fixed page); once the ride has settled it sits above
  // the title. The settled page is then used as it is: a pointer moves over it, a press on the world wakes it, and once it has
  // settled again the chip's link is pressed there and loads today's page, which arrives riding, settled at once, and starts the
  // show, or shows it paused where the browser refuses (ride.mjs).
  {
    path: "/2026-10-20?day=2099-01-01",
    devices: RIDE_PAGES.newday.devices,
    shots: ["fixed-newday"],
    steps: [playStep("fixed-newday-playing", { ms: 8000, shot: "fixed-newday-8s" }), ...RIDE_PAGES.newday.steps],
  },
  // The same on the phone, whose finger has no pointer to move over the page and taps where a mouse clicks.
  {
    path: "/2026-10-20?day=2099-01-01",
    devices: RIDE_PAGES.newdayTouch.devices,
    shots: ["fixed-newday"],
    steps: [playStep("fixed-newday-playing", { ms: 8000, shot: "fixed-newday-8s" }), ...RIDE_PAGES.newdayTouch.steps],
  },
  // The night the show carries the island through (night.js), at four of its hours, while the show plays with ?drive=map: the last light,
  // as Jack Straw opens set 1; the deep of the night, in Space, with the moon; first light, as U.S. Blues, the encore, begins; and
  // daybreak, as it ends. From ?pose=crowd on
  // the desktop and a phone, where fixed-crowd-dance and the desktop's fixed-crowd-space, above, are the first two; and from ?pose=path on
  // the desktop. The stats line's `night` reads the hour the world shows beside the hour the show stands at.
  // The join moves the show's hour at once, and the world follows it frame by frame (followHour): a frame adds at most 50 ms of world
  // time, so it moves the hour at most 0.0225 (0.45 a second), and once under 0.42 of an hour is left, 5.4 % of that (1 - e^(-0.05/0.9)).
  // From hour 0, Space's hour, 1, is 26 frames and 39 more to come within 0.05 of it, 65 in all; first light's, 1.7, which moves on as the
  // encore plays, about 100. CI draws the desktop 2.2 to 4 frames a second, about 25 of them between the join and the play step's shot,
  // which so falls near hour 0.6, the blue hour; and a later shot comes 2 to 4 s after its wait. So the desktop waits 20 s for Space (25 +
  // 2.2 × 24 = 78 frames or more) and 30 s for first light (25 + 2.2 × 34 = 100). A phone draws 10 to 30 a second there, so the 8 s of its
  // other later shots is over 100 frames. A slower runner still gets its hour: each of these shots is `night`, which waits on for the
  // world's hour to reach the show's. By then a slow runner may have stepped the world down a rung (quality.js), as in any later shot. These stand before the show's end, which forgets the point each of them saves: no later play step resumes
  // from one.
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=14",
    devices: ["phone"],
    shots: [],
    steps: [playStep("fixed-crowd-space", { ms: 8000, shot: "fixed-crowd-space-8s", night: true })],
  },
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=18",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-crowd-first-light-start", { ms: 30000, shot: "fixed-crowd-first-light", night: true })],
  },
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=18",
    devices: ["phone"],
    shots: [],
    steps: [playStep("fixed-crowd-first-light-start", { ms: 8000, shot: "fixed-crowd-first-light", night: true })],
  },
  // Daybreak, behind the stage: the encore joined 72 s before its end (U.S. Blues, 287 s), shot 30 s on, with the show still playing,
  // the sun's edge on the horizon and the rig's beams washed out to about half.
  {
    path: "/2026-10-20?pose=crowd&drive=map&at=18&t=215",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [playStep("fixed-crowd-daybreak-start", { ms: 30000, shot: "fixed-crowd-daybreak", night: true })],
  },
  {
    path: "/2026-10-20?pose=path&drive=map&at=18&t=215",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-path-daybreak-start", { ms: 30000, shot: "fixed-path-daybreak", night: true })],
  },
  // From ?pose=path the last light is fixed-stage-path, above: the world opens on hour 0, before the show plays.
  {
    path: "/2026-10-20?pose=path&drive=map&at=14",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-path-night-start", { ms: 20000, shot: "fixed-path-night", night: true })],
  },
  {
    path: "/2026-10-20?pose=path&drive=map&at=18",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-path-first-light-start", { ms: 30000, shot: "fixed-path-first-light", night: true })],
  },
  // The fixed day 6 s before its last track ends (U.S. Blues, 287 s): the show ends, and the offer names a past pick.
  {
    path: "/2026-10-20?at=18&t=281",
    devices: ["desktop", "phone"],
    shots: [],
    steps: [playStep("fixed-end-start", { ms: 12000, shot: "fixed-end" })],
  },
  // The same with the day faked: at the end (about 6.5 s in) the new day loads on its own; 20 s on, the later shot is today's page,
  // its state in the log, and never lands mid-navigation.
  {
    path: "/2026-10-20?day=2099-01-01&at=18&t=281",
    devices: ["desktop"],
    shots: [],
    steps: [playStep("fixed-turn-start", { ms: 20000, shot: "fixed-turned" })],
  },
  // The sleep timer counting seconds, in a ride: the ride's own row has it while the page is awake, and one press sets 30 s; 32 s on,
  // the show is paused and, with no input since the click, the ride has settled and the cursor is hidden; focus on the settled look's
  // timer and Shift bring the cursor back, and a letter then wakes the page, the ride still on (ride.mjs).
  {
    path: "/2026-10-20?sleep=seconds",
    devices: RIDE_PAGES.sleep.devices,
    shots: [],
    steps: [playStep("fixed-sleep-playing"), ...RIDE_PAGES.sleep.steps],
  },
  // The end shot shows the last screen, where the archive's count line sits. The TV shoots the archive too, at 1920 by 1080.
  { path: "/archive", devices: ["desktop", "desktop-reduced", "phone", "phone-360", "tv"], shots: ["archive"], end: "archive-end" },
  // September 2026 opened from the archive's month list: a closed month, so its rows compare across runs. The log's url line reads
  // the month's own page, and the end shot shows its list, which names October and not September, over the count line.
  {
    path: "/archive",
    devices: ["desktop", "desktop-reduced", "phone", "phone-360", "tv"],
    shots: [],
    steps: [{ click: "a[href='/archive/2026-09']", waitFor: "main[data-month='2026-09']", shot: "archive-2026-09" }],
    end: "archive-2026-09-end",
  },
  // A path no route answers, and a date that is not one: each answers 404 with the site's own page, which the policy check covers too.
  { path: "/no/such/page", status: 404, devices: ["desktop", "phone"], shots: ["not-found"] },
  { path: "/2026-02-30", status: 404, devices: ["desktop", "phone"], shots: ["not-found-date"] },
  // A fixed past day, so its shots compare across runs.
  { path: "/2026-03-01", shots: ["2026-03-01"] },
  // The same day, which no step plays, so no saved point stands in: L seeks 10 s before the first move, and play starts from there.
  // Both state lines read about 0:10.
  {
    path: "/2026-03-01",
    devices: ["desktop"],
    shots: [],
    steps: [{ focus: "#world", press: "KeyL", player: true, shot: "2026-03-01-seek-before-join" }, playStep("2026-03-01-seek-playing")],
  },
  // A fixed past day whose show has a partial date and one track.
  { path: "/2026-05-10", shots: ["2026-05-10"] },
  // A fixed past day with a long featured month over a long show month.
  { path: "/2026-09-29", shots: ["2026-09-29"] },
  // The fixed day with Relisten's answer forced, on previews: the look-up failed (the plate says so, with Try again and the Relisten
  // link), then in a ride, awake and settled; and a show it has no recording of (the plate as before). Either way the world loads
  // without the show's path.
  {
    path: "/2026-10-20?lookup=failed",
    devices: RIDE_PAGES.lookup.devices,
    shots: ["fixed-lookup-failed"],
    steps: RIDE_PAGES.lookup.steps,
  },
  { path: "/2026-10-20?lookup=missing", devices: ["desktop", "phone"], shots: ["fixed-no-recording"] },
  // The fixed day's shelves: each tab puts its shelf away past its edge of the screen, the title's, then the buttons', then the
  // player's. With all three away the box log reads every control on them hidden and the three tabs 44 px square. They stay away for
  // the page after this one.
  {
    path: "/2026-10-20",
    devices: ["desktop", "phone", "phone-360", "desktop-reduced"],
    shots: [],
    steps: [
      shelfStep("title", "in", "fixed-shelf-title-away"),
      shelfStep("actions", "in", "fixed-shelf-actions-away"),
      shelfStep("player", "in", "fixed-shelf-player-away", true),
    ],
  },
  // The same page loaded again, the three shelves stored away: the HTML the server sends already has them away (`served`), so the first
  // shot shows them away without any slide, and its box log reads as the last one did. Then each tab brings its shelf back, which
  // leaves every shelf out for the pages after this one.
  {
    path: "/2026-10-20",
    devices: ["desktop", "phone", "phone-360", "desktop-reduced"],
    served: 'data-shelves="title,actions,player"',
    shots: ["fixed-shelves-stored"],
    steps: [
      shelfStep("title", "out", "fixed-shelf-title-back"),
      shelfStep("actions", "out", "fixed-shelf-actions-back"),
      shelfStep("player", "out", "fixed-shelf-player-back", true),
    ],
  },
  // The fixed day with the player away, on a phone and on a phone on its side: the camera frames the visitor's bear above what is left
  // at the foot of the frame. The first shot comes before the first move, while the hint is up. The ride then starts the
  // show, which takes the hint away, and puts the camera behind the bears: on the upright phone the visitor's bear stands above the
  // stick, and on its side, where the page shows no stick, as low as the frame's foot. The stats line's `avatar.clear` reads whether
  // its feet land in the frame above that. Then the tab brings the player back, the ride still awake: the tab is there only while it is.
  {
    path: "/2026-10-20",
    devices: RIDE_PAGES.frame.devices,
    ownIdle: RIDE_PAGES.frame.ownIdle,
    ready: "#world[data-world='ready']",
    shots: [],
    steps: [shelfStep("player", "in", "fixed-shelf-frame"), ...RIDE_PAGES.frame.steps, { ...shelfStep("player", "out", "fixed-shelf-frame-back"), ride: "awake" }],
  },
  // The walk's draw calls on the fixed day, from ?pose=sweep: the visitor's bear at each of the sweep's poses, with the world on the
  // day's first track and then on Drums (index 13), where the left cave lights. The log names each device's peak and the pose that
  // drew it.
  { path: "/2026-10-20?pose=sweep", devices: ["desktop", "phone", "tv"], ready: "#world[data-world='ready']", shots: [], sweep: [0, 13] },
  // The fixed day with every track's audio failing, on any deployment: the player spends its reloads, and the transport says it could
  // not play, with Try again and the archive.org link. Try again starts the reloads over, so the now-plate says Reconnecting… again
  // rather than staying on the error.
  {
    path: "/2026-10-20",
    devices: ["desktop", "phone"],
    shots: [],
    failAudio: true,
    steps: [
      {
        click: "[data-action='play']",
        waitFor: "[data-state='error']",
        waitMs: PLAY_WAIT_MS,
        required: true,
        player: true,
        shot: "fixed-track-failed",
      },
      {
        click: "[data-action='retry']",
        waitFor: "[data-state='stalled']",
        waitMs: PLAY_WAIT_MS,
        required: true,
        player: true,
        shot: "fixed-track-retry",
      },
    ],
  },
];

// The test poses (ground.js) open each sweep, so their calls can be read beside the full-size shots taken from them.
const SWEEP_POSES = [...Object.values(TEST_POSES), ...walkPoses(15, 12)];

// Generated images are saved byte for byte as the site serves them.
const ASSETS = [
  "/icon",
  "/apple-icon",
  "/icon-192.png",
  "/icon-512.png",
  "/opengraph-image",
  "/2026-03-01/opengraph-image",
  "/archive/opengraph-image",
];

// Pause between shots of one page load.
const SHOT_GAP_MS = 5000;

// Pause after a step's action, before its shot.
const STEP_SETTLE_MS = 1000;

// How long a page gets to finish loading; a slower page is logged and shot anyway.
const LOAD_MS = 30_000;

// Full-page shots stop at this many screens; the archive lists a month.
const MAX_SCREENS = 4;

// What fails the run once every shot is taken: a generated image the site answers with an error, a frame over its tier's draw-call
// budget (a shot's, or the walk's peak in a sweep), a first-person frame where a bear comes inside the camera's near plane, a show
// playing with its sound neither through the world nor in plain stereo for a reason the player names, a required step whose control is
// missing or whose state never comes, a page whose HTML arrives without the text it names (`served`), a sweep that cannot finish, a
// recording whose control's state never comes, whose world never starts or whose step waits for what never comes (recordings.mjs),
// and a policy problem (below).
const failures = [];
// A still's or a recording's own failures, one line a file, and those of them that were not saved (ride.mjs).
const perFile = fileFailures(failures);

// What the log says when a read had to wait for the page to load again: the shot was taken, then the page navigated as it was read.
const reread = (file) => () => console.log(`reread ${file}: the page navigated while it was read`);

// Logs the page's render stats (window.__hill) for a shot, or for a recording after each control it holds; null on a page without them.
// A frame over its tier's draw-call budget is a failure, and so is a first-person frame where a bear comes inside the near plane.
// Returns the stats.
const logStats = async (page, file) => {
  const stats = await evaluateAcrossNavigation(page, () => JSON.stringify(window.__hill ?? null), reread(file));
  console.log(`stats ${file} ${stats}`);
  const parsed = JSON.parse(stats);
  for (const failure of [callsFailure(parsed), nearFailure(parsed)]) {
    if (failure) failures.push(`${file}: ${failure}`);
  }
  return parsed;
};

// Takes a still. One that needs the ride in a look (`need`, a step's `ride`) fails the run where the page marks any other just before
// it or just after (stillInLook in ride.mjs): the page changes look on a timer, and a slow renderer can be late for it.
const takeStill = async (page, file, need, options) => {
  const failure = await stillInLook(page, need, () => page.screenshot(options));
  if (!failure) return;
  perFile.fail(file, failure);
  console.log(`${file}: ${failure}`);
};

// The HUD's shelves, by their tabs' names (src/components/world/shelves.ts).
const SHELVES = ["title", "actions", "player"];
// Shows the world whole (`whole`), or as the shoot's other pages expect it: whole is the view in first person, where the visitor's
// own bear is out of the frame, with the HUD's three shelves put away. Both are set as a visitor sets them, with V and with each
// shelf's tab, and only where they are not so already, since the page keeps both from one load to the next. Then the page settles.
// A view or a shelf that does not follow fails the run for `where`: left as it is, it would be in every later page of the device.
const showWhole = async (page, whole, where) => {
  const state = whole ? "in" : "out";
  // Whether the view is first person already, and which shelves are where they are wanted already.
  const { first, there } = await page.evaluate(
    (selectors) => ({
      first: document.querySelector("main")?.dataset.view === "first",
      there: selectors.map((selector) => document.querySelector(selector) !== null),
    }),
    SHELVES.map((shelf) => shelfAt(shelf, state)),
  );
  if (first !== whole) {
    await page.focus("#world");
    await page.keyboard.press("KeyV");
    await page
      .waitForSelector(`main[data-view='${whole ? "first" : "third"}']`, { timeout: 15_000 })
      .catch(() => failures.push(`${where}: the view never turned to ${whole ? "first" : "third"} person`));
  }
  for (const [k, shelf] of SHELVES.entries()) {
    if (there[k]) continue;
    if ((await page.locator(shelfTab(shelf)).count()) === 0) {
      failures.push(`${where}: no tab for the ${shelf} shelf`);
      continue;
    }
    await page.click(shelfTab(shelf));
    await page
      .waitForSelector(shelfAt(shelf, state), { timeout: 15_000 })
      .catch(() => failures.push(`${where}: the ${shelf} shelf was never ${whole ? "put away" : "brought back"}`));
  }
  if (first !== whole || there.includes(false)) await page.waitForTimeout(STEP_SETTLE_MS);
};

// Each policy problem, with the devices and pages where it happened: a Content-Security-Policy violation, a Permissions Policy error,
// or a page response without the site's security headers.
const policyProblems = new Map();
const policyProblem = (text, where) => policyProblems.set(text, (policyProblems.get(text) ?? new Set()).add(where));
// How many requests the pages made to each origin, by the kind of request: what the Content-Security-Policy has to allow.
const loaded = new Map();
let responsesChecked = 0;
// Vercel's preview build loads its toolbar from vercel.live on every page; production's loads it only with Vercel's opt-in cookie. The
// policy refuses it on both, and the run counts those refusals apart from the site's own.
const VERCEL_TOOLBAR = " refused https://vercel.live/";
let toolbarRefusals = 0;

// A page's path and query, which name it in a policy problem.
const where = (device, page) => {
  const url = page ? new URL(page.url()) : null;
  return `${device} ${url ? `${url.pathname}${url.search}` : "(no page)"}`;
};

// Watches a context's pages. The page reports each Content-Security-Policy violation as an event, which an init script writes to the
// console, where the browser writes its Permissions Policy errors too; and each request's origin goes into the tally.
const watchPolicies = async (context, device) => {
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`securitypolicyviolation ${event.effectiveDirective} refused ${event.blockedURI || "inline"}`);
    });
  });
  context.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("securitypolicyviolation ") && text.includes(VERCEL_TOOLBAR)) {
      toolbarRefusals += 1;
    } else if (/^securitypolicyviolation |permissions[- ]policy/i.test(text)) {
      policyProblem(text.replace(/^securitypolicyviolation /, "Content-Security-Policy: "), where(device, message.page()));
    }
  });
  context.on("request", (request) => {
    const key = `${request.resourceType()} ${new URL(request.url()).origin}`;
    loaded.set(key, (loaded.get(key) ?? 0) + 1);
  });
};

// A page's own response carries the site's security headers, and its Content-Security-Policy a nonce, which the import map carries too.
const checkHeaders = async (page, response, device) => {
  responsesChecked += 1;
  const headers = await response.allHeaders();
  const policy = headers["content-security-policy"] ?? "";
  const nonce = policy.match(/(?:^|; )script-src [^;]*'nonce-([^']+)'/)?.[1];
  const mapNonce = await evaluateAcrossNavigation(
    page,
    () => document.querySelector('script[type="importmap"]')?.nonce ?? null,
    reread(`${device} headers`)
  );
  const problems = [
    !nonce && "no nonce in the Content-Security-Policy's script-src",
    /'unsafe-/.test(policy) && "an 'unsafe-' source in the Content-Security-Policy",
    nonce && mapNonce !== nonce && "an import map without the policy's nonce",
    headers["x-content-type-options"] !== "nosniff" && `X-Content-Type-Options: ${headers["x-content-type-options"]}`,
    headers["x-frame-options"] !== "SAMEORIGIN" && `X-Frame-Options: ${headers["x-frame-options"]}`,
    !headers["referrer-policy"] && "no Referrer-Policy",
    !headers["permissions-policy"] && "no Permissions-Policy",
    headers["x-powered-by"] && `X-Powered-By: ${headers["x-powered-by"]}`,
  ];
  for (const problem of problems.filter(Boolean)) policyProblem(`headers: ${problem}`, where(device, page));
};

// The sweep's line for each page and device, for the job summary.
const sweeps = [];

// For each track index, puts the world on that track, as the player's player:track event does, then the visitor's bear at each of the
// sweep's poses, and logs the most draw calls a frame drew, the pose that drew them, the tier's budget and the test poses' calls. A
// peak over the budget is a failure, named with its pose.
const sweepWalk = async (page, device, tracks) => {
  for (const index of tracks) {
    const started = Date.now();
    const [tier, title] = await page.evaluate((i) => {
      document.dispatchEvent(new CustomEvent("player:track", { detail: { index: i, position: 0 } }));
      return [window.__hill.tier, JSON.parse(document.getElementById("world-data").textContent).tracks[i]?.title ?? null];
    }, index);
    const calls = await page.evaluate(readWalkCalls, SWEEP_POSES);
    const { calls: peak, pose } = sweepPeak(SWEEP_POSES, calls);
    const where = `x ${pose.x.toFixed(1)}, z ${pose.z.toFixed(1)}, heading ${pose.heading.toFixed(3)}`;
    const tests = Object.keys(TEST_POSES).map((name, i) => `${name} ${calls[i]}`).join(", ");
    // One line, in the log and in the summary, whatever the track's title holds.
    const line = logText(
      `${device}, track index ${index} (${title}): at most ${peak} draw calls over ${calls.length} poses (the ${tier} budget is ` +
        `${CALL_BUDGET[tier]}), at ${where}; the test poses ${tests}; ${Math.round((Date.now() - started) / 1000)} s`
    );
    console.log(`sweep ${line}`);
    sweeps.push(line);
    const over = callsFailure({ tier, calls: peak });
    if (over) failures.push(`sweep ${device}, track index ${index}: ${over}, at ${where}`);
  }
};

// Logs every control's box after a page's first shot and after a step that names `boxes`, so a touch target is read rather than
// measured: links, buttons, summaries, inputs and the world's focusable container, `small` on one under 44 px either way, `hidden` on one
// not rendered, or rendered and hidden, as a shelf put away hides what it holds.
const logBoxes = async (page, file) => {
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a, button, summary, input, [tabindex='0']"), (el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      const name = el.dataset.action ?? (el.id || el.getAttribute("aria-label") || el.textContent.trim());
      return { name, x, y, width, height, visible: el.checkVisibility({ visibilityProperty: true }) };
    })
  );
  for (const { name, x, y, width, height, visible } of boxes) {
    const size = `${Math.round(width)}x${Math.round(height)} at ${Math.round(x)},${Math.round(y)}`;
    console.log(logText(`box ${file} ${name}: ${visible ? `${size}${width < 44 || height < 44 ? " small" : ""}` : "hidden"}`));
  }
};

// Opens a page once its document arrives, then waits for the rest: an embedded player can
// hold back the load event past a navigation's time limit.
const open = async (page, url) => {
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("load", { timeout: LOAD_MS })
    .catch(() => console.log(`${url} never finished loading; going on anyway`));
  return response;
};

// Logs where a shot was taken and what the page says: its URL, the player's state with the now-plate's sentence, whether a settled ride
// has hidden the cursor, and the next-show chip's kind and text, or null without one.
const logPage = async (page, file) => {
  const [state, line, cursor, next] = await evaluateAcrossNavigation(page, () => {
    const chip = document.querySelector("[data-next]");
    return [
      document.querySelector("main")?.dataset.state ?? null,
      document.querySelector("[data-action='play']")?.closest(".plate")?.querySelector(".t-tag")?.textContent ?? null,
      document.documentElement.classList.contains("cursor-off"),
      chip ? `${chip.dataset.next} · ${chip.textContent}` : null,
    ];
  }, reread(file));
  console.log(`url ${file} ${page.url()}`);
  console.log(logText(`state ${file} ${state} · ${line}`));
  console.log(`cursor ${file} ${cursor}`);
  console.log(logText(`next ${file} ${next}`));
};

// The part of the shoot this process does: the whole of it, or the part SHARD names (shards.mjs), as each of the workflow's jobs does.
// A name that is no shard's stops the script here, before it asks for a site.
const plan = shardPlan(process.env.SHARD, { devices: Object.keys(DEVICES), byName: BY_NAME, pages: PAGES, recordings: RECORDINGS, assets: ASSETS });
// SHOOT_PLAN=1 prints that part as the files it saves and stops, with no site and no browser: the shards' test reads it.
if (process.env.SHOOT_PLAN) {
  console.log(JSON.stringify({ shard: process.env.SHARD ?? null, ...planFiles(plan) }, null, 2));
  process.exit(0);
}

const site = new URL(process.env.SITE_URL);
if (site.protocol !== "https:") {
  throw new Error(`SITE_URL must be an https URL, got ${process.env.SITE_URL}`);
}

// A path's URL for a device. The TV device asks for the TV tier: a headless browser cannot be told apart from a desktop. A page that
// shoots the ride asks for the wait the device needs before the ride settles (`idle`, in seconds).
const pageUrl = (path, device, idle = null) => {
  const url = new URL(path, site);
  if (device === "tv") url.searchParams.set("tier", "tv");
  if (idle !== null) url.searchParams.set("idle", String(idle));
  return url;
};

// The workflow names the artifact after this host, so each artifact says which site it shows.
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `host=${site.hostname}\n`);
}

const outDir = process.env.OUT_DIR;
await mkdir(outDir, { recursive: true });
// When this run began, to the second below: a file in the folder that is older is not this run's.
const began = Math.floor(Date.now() / 1000) * 1000;

// The browser's package is loaded here and not at the top, so that SHOOT_PLAN works where it is not installed, as in the unit tests.
const { chromium } = await import("playwright");
// The runner has no GPU, so WebGL runs in software; the no-WebGL devices get a browser with it off, where the plan has a page for one.
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"], chromiumSandbox: !process.env.GITHUB_ACTIONS });
const noWebGL = plan.pages.some(([device]) => NO_WEBGL.has(device)) ? await chromium.launch({ args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"], chromiumSandbox: !process.env.GITHUB_ACTIONS }) : null;
try {
  for (const [device, pages] of plan.pages) {
    const options = DEVICES[device];
    const context = await (NO_WEBGL.has(device) ? noWebGL : browser).newContext(options);
    await watchPolicies(context, device);
    const page = await context.newPage();
    // Playwright trims the clip to the page, so it only cuts tall pages short.
    const clip = {
      x: 0,
      y: 0,
      width: options.viewport.width * MAX_SCREENS,
      height: options.viewport.height * MAX_SCREENS,
    };

    for (const [k, { path, shots, steps, end, ready, sweep, failAudio, status, served, whole, ownIdle }] of pages.entries()) {
      // A page with a step that needs the ride in one of its looks loads with this device's wait, unless it keeps the page's own.
      const url = pageUrl(path, device, steps?.some((step) => step.ride) && !ownIdle ? rideIdle(device) : null);
      if (failAudio) await page.route(isTrackAudio, (route) => route.abort());
      const response = await open(page, url);
      // A redirect to another host, such as a login wall, is not the site. A page that names a status must answer with it.
      if ((status ? response?.status() !== status : !response?.ok()) || new URL(page.url()).host !== url.host) {
        throw new Error(`${url} answered ${response?.status()} at ${page.url()}`);
      }
      await checkHeaders(page, response, device);
      // A page may name text its HTML holds as the server sent it, before any script ran. The log says whether it does, and a page
      // without it fails the run.
      if (served) {
        const held = (await response.text()).includes(served);
        console.log(`served ${device} ${url}: the HTML ${held ? "holds" : "does not hold"} ${served}`);
        if (!held) failures.push(`${device} ${path}: the HTML arrived without ${served}`);
      }
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => console.log(`${url} never went network-idle; shooting anyway`));
      // A page may name a state to wait for before its first shot.
      if (ready) {
        await page
          .waitForSelector(ready, { timeout: 15_000 })
          .catch(() => console.log(`${url} never reached ${ready}; shooting anyway`));
      }
      // A running clock is not motion, so the reduced-motion shots hide it to stay comparable. A constructed stylesheet hides it: the
      // Content-Security-Policy refuses a style element, but not the CSSOM.
      if (options.reducedMotion) {
        await page.evaluate(() => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync('[data-mask="time"]{visibility:hidden}');
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        });
      }
      // A page shot whole is in first person with the shelves away, until its steps are done. After a page shot whole it is so already.
      if (whole) await showWhole(page, true, `${device} ${path}`);
      // A sweep that cannot finish fails the run at the end, so the shots after it are still taken.
      if (sweep) await sweepWalk(page, device, sweep).catch((error) => failures.push(`sweep ${device}: ${error.message}`));

      for (const [i, shot] of shots.entries()) {
        if (i > 0) {
          await page.waitForTimeout(SHOT_GAP_MS);
        }
        const file = `${device}-${shot}.png`;
        await page.screenshot({ path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}`);
        await logStats(page, file);
        await logPage(page, file);
        if (i === 0) await logBoxes(page, file);
      }

      for (const step of steps ?? []) {
        const selector = step.click ?? step.tap ?? step.focus;
        // A control missing from the page is logged and the step skipped; a step that only presses a key has none to miss. Its
        // untaken stills fail the run, each in one line that says why (perFile.fail), and are not listed again at the run's end, when
        // what was saved is held to the plan (planFailures).
        if (selector && (await page.locator(selector).count()) === 0) {
          for (const shot of [step.shot, step.later?.shot].filter(Boolean)) perFile.fail(`${device}-${shot}.png`, `${selector} absent, so the still was not taken`, false);
          console.log(`${step.shot}: ${selector} absent`);
          continue;
        }
        // A press that is of a control in one look of the ride waits for that look, and fails the run where the page is in another as it
        // is made (ride.mjs).
        const pressedWrong = step.from ? await pressFailure(page, step.from) : null;
        if (pressedWrong) perFile.fail(`${device}-${step.shot}.png`, pressedWrong);
        if (step.focus) await page.focus(selector);
        else if (step.tap) await page.tap(selector);
        else if (step.click) await page.click(selector);
        if (step.press) await page.keyboard.press(step.press);
        // A drag on the world turns and tilts the view by so many px ([right, down]), from a point clear of every plate.
        if (step.drag) {
          const { width, height } = page.viewportSize(), x = width * 0.45, y = height * 0.55;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + step.drag[0], y + step.drag[1], { steps: 8 });
          await page.mouse.up();
        }
        // A pointer that moves over the world, which shows a settled ride's cursor, and a press on the bare world, which wakes it
        // (ride.mjs).
        if (step.move) await movePointer(page);
        if (step.world) await pressWorld(page, Boolean(options.hasTouch));
        // A near step stands the visitor by another song's landmark and waits for the frames that draw the cut and the bears there:
        // frames, since a software renderer draws two a second and a GPU sixty. They are its settle. A world that is not drawing
        // has no still to take: the step fails the run and is skipped, at once where there is no world at all.
        if (step.near !== undefined) {
          const from = await page.evaluate((index) => {
            const from = window.__hill?.frames ?? null;
            document.dispatchEvent(new CustomEvent("world:near", { detail: { index } }));
            return from;
          }, step.near);
          const drawn =
            from !== null &&
            (await page.waitForFunction(([from, frames]) => window.__hill.frames >= from + frames, [from, NEAR_FRAMES], { timeout: 30_000 }).then(() => true, () => false));
          if (!drawn) {
            failures.push(`${device}-${step.shot}.png: ${from === null ? "the page has no world" : `the world drew fewer than ${NEAR_FRAMES} frames in 30 s`} after the move to song ${step.near}`);
            console.log(`${step.shot}: no still, the world is not drawing`);
            continue;
          }
        }
        if (step.waitFor) {
          await page
            .waitForSelector(step.waitFor, { timeout: step.waitMs ?? 15_000 })
            .catch(() => {
              console.log(`${step.shot}: waitFor timed out; shooting anyway`);
              if (step.required) perFile.fail(`${device}-${step.shot}.png`, `never reached ${step.waitFor}`);
            });
        }
        // A settled ride's still waits for the camera to reach the crane (public/world/main.js's `ride` stat), where the page has a
        // world. The crane is what the still shows, so one that never gets there fails the run, as a recording's wait for it does
        // (EASE_MS in recordings.mjs); the still is taken as it stands.
        if (step.crane) {
          await page
            .waitForFunction(() => { const ride = window.__hill?.ride; return !ride || ride.lean === 1; }, null, { timeout: EASE_MS })
            .catch(() => {
              console.log(`${step.shot}: the camera had not reached the crane`);
              perFile.fail(`${device}-${step.shot}.png`, `the camera had not reached the crane ${EASE_MS} ms after the page settled`);
            });
        }
        if (step.player) {
          // The player's state and the now-plate's sentence ("Starting…", "Reconnecting…", an error, or the position), and how the
          // sound plays.
          const [state, line, routing] = await page.evaluate(() => [
            document.querySelector("main")?.dataset.state ?? null,
            document.querySelector("[data-action='play']")?.closest(".plate")?.querySelector(".t-tag")?.textContent ?? null,
            document.querySelector("main")?.dataset.routing ?? null,
          ]);
          console.log(logText(`state ${device}-${step.shot}.png ${state} · ${line}`));
          console.log(`routing ${device}-${step.shot}.png ${routing}`);
        }
        // A step may say how the cursor should be once it has acted: shown, or hidden. It is read here, straight after the act and
        // before the step's second of settling and its still, and the reading goes in the step's line below (ride.mjs).
        const cursorRead = step.cursor ? await cursorNow(page) : null;
        const cursorWrong = step.cursor ? cursorFailure(step.cursor, cursorRead) : null;
        if (cursorWrong) perFile.fail(`${device}-${step.shot}.png`, cursorWrong);
        if (step.near === undefined) await page.waitForTimeout(STEP_SETTLE_MS);
        const file = `${device}-${step.shot}.png`;
        await takeStill(page, file, step.ride, { path: join(outDir, file), fullPage: true, clip });
        console.log(`${file}  ${url}  ${step.near !== undefined ? `near ${step.near}` : selector ?? (step.press ? `press ${step.press}` : step.move ? "a pointer's move" : step.world ? "a press on the world" : `waited for ${step.waitFor}`)}${cursorRead ? `  cursor ${cursorRead} as the step acted` : ""}`);
        const stats = await logStats(page, file);
        // A near still of the wrong song fails the run: the stats say which song the visitor stands by. Its page plays nothing, so the
        // player's lines are left out: each read of the page waits on a frame, and a software renderer's frame is a third of a second.
        if (step.near !== undefined) {
          const failure = standFailure(stats?.near ?? null, step);
          if (failure) failures.push(`${file}: ${failure}`);
        } else await logPage(page, file);
        if (step.boxes) await logBoxes(page, file);
        // The follow-up shot shows the page after it has been playing for a while.
        if (step.later) {
          await page.waitForTimeout(step.later.ms);
          // A shot of the night also waits for the world's hour to come within 0.05 of the show's (night.js followHour), which a runner
          // slower than the waits above reckon on has not reached in `ms`; a minute on, it is shot as it stands, and the log says so.
          if (step.later.night) {
            await page
              .waitForFunction(() => { const n = window.__hill?.night; return !!n && Math.abs(n.hour - n.show) < 0.05; }, null, { timeout: 60_000 })
              .catch(() => console.log(`night ${device}-${step.later.shot}.png  the world's hour had not reached the show's`));
          }
          const laterFile = `${device}-${step.later.shot}.png`;
          const laterCursorRead = step.later.cursor ? await cursorNow(page) : null;
          const laterCursorWrong = step.later.cursor ? cursorFailure(step.later.cursor, laterCursorRead) : null;
          if (laterCursorWrong) perFile.fail(laterFile, laterCursorWrong);
          await takeStill(page, laterFile, step.later.ride, { path: join(outDir, laterFile), fullPage: true, clip });
          console.log(`${laterFile}  ${url}  ${selector}${laterCursorRead ? `  cursor ${laterCursorRead} before the still` : ""}`);
          await logStats(page, laterFile);
          await logPage(page, laterFile);
          // Serialised in the page, so each reading prints as one line of JSON.
          const [analysis, map, lastGapMs, routing, state, world, corsFallback, line] = await page.evaluate(() => [
            JSON.stringify(window.__hill?.analysis ?? null),
            JSON.stringify(window.__hill?.map ?? null),
            JSON.stringify(window.__hill?.lastGapMs ?? null),
            document.querySelector("main")?.dataset.routing ?? null,
            document.querySelector("main")?.dataset.state ?? null,
            document.getElementById("world")?.dataset.world ?? null,
            window.__hill?.corsFallback ?? null,
            document.querySelector("[data-action='play']")?.closest(".plate")?.querySelector(".t-tag")?.textContent ?? null,
          ]);
          console.log(`analysis ${laterFile} ${analysis}`);
          // The show's map as the world reads it where the show is: its envelopes, the build-up with the flame, the panel and the beam,
          // and the figures' tempo and the onsets that pulled their beat.
          console.log(`map ${laterFile} ${map}`);
          console.log(`lastGapMs ${laterFile} ${lastGapMs}`);
          console.log(`routing ${laterFile} ${routing}`);
          // The player's state and the now-plate's sentence at the later shot, so a stream that stalled shows here.
          console.log(logText(`state ${laterFile} ${state} · ${line}`));
          // By now a playing show sounds through the world, or in plain stereo for a reason the player names (its corsFallback stat).
          const routed = routingFailure({ state, world, routing, corsFallback });
          if (routed) failures.push(`${laterFile}: ${routed}`);
        }
      }
      // The view and the shelves are handed back to the page after, unless it is shot whole too: they would only be put away again.
      if (whole && !pages[k + 1]?.whole) await showWhole(page, false, `${device} ${path}, after its steps`);

      if (end) {
        // The last screen, as a visitor who scrolled to the bottom sees it.
        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
        );
        const file = `${device}-${end}.png`;
        await page.screenshot({ path: join(outDir, file) });
        console.log(`${file}  ${url}`);
        await logStats(page, file);
      }
      // The next page on this device plays its audio.
      if (failAudio) await page.unroute(isTrackAudio);
    }

    await context.close();
  }

  recording: for (const { device, name, path = "/", click, waitFor, keys, stick, recordMs = RECORD_MS } of plan.recordings) {
    const options = DEVICES[device];
    // Frames arrive at the viewport's CSS size, whatever the device scale factor.
    const context = await browser.newContext({
      ...options,
      recordVideo: {
        dir: await mkdtemp(join(tmpdir(), "recording-")),
        size: options.viewport,
      },
    });
    await watchPolicies(context, device);
    const page = await context.newPage();
    const url = pageUrl(path, device);
    const file = `${device}-${name}.webm`;
    await open(page, url);
    if (click) {
      // A control missing from the page is logged and the recording skipped, and the run fails for it in one line that says why
      // (perFile.fail), which the plan's check at the run's end does not repeat (planFailures). A control whose state never comes
      // fails the run, and is recorded as it is.
      const pressed = await press(page, click, waitFor, file);
      if (!pressed.found) {
        console.log(`${file}: ${click} absent`);
        perFile.fail(file, `${click} absent, so nothing was recorded`, false);
        await context.close();
        continue;
      }
      if (pressed.failure) failures.push(pressed.failure);
    }
    // Keys and the stick go to a world that has started: pressed into a page that has not, they are lost, and the recording is of a
    // bear that stands where it began.
    if ((keys || stick) && (await worldStarted(page)) === null) {
      failures.push(`${file}: the world had not said where the visitor stands ${WORLD_MS} ms after the page loaded, so its keys went to nothing`);
    }
    let held = 0;
    for (const [n, [key, ms, until]] of (keys ?? []).entries()) {
      const taken = await step(page, [key, ms, until], { file, n: n + 1 });
      held += taken.ms;
      if (taken.failure) failures.push(taken.failure);
      await logStats(page, `${file} after ${key ?? "standing"}`);
    }
    // The stick is pushed with a mouse press, not a touch, from its centre to its rim each way in turn, and let go at the end; the
    // log says so.
    if (stick) {
      // Scripts may draw the stick after load, so it gets time to appear.
      const box = await page
        .waitForSelector("[data-stick]", { timeout: 15_000 })
        .then((element) => element.boundingBox())
        .catch(() => null);
      if (!box) {
        console.log(`${file}: [data-stick] absent`);
        perFile.fail(file, "[data-stick] absent, so nothing was recorded", false);
        await context.close();
        continue recording;
      }
      const r = box.width / 2, x = box.x + r, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const [way, ms] of stick) {
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[way];
        await page.mouse.move(x + dx * r, y + dy * r, { steps: 4 });
        await page.waitForTimeout(ms);
        held += ms;
        console.log(`${file}: the stick pushed ${way} ${ms} ms with the mouse, not a touch`);
        await logStats(page, `${file} after the stick ${way}`);
      }
      await page.mouse.up();
    }
    await page.waitForTimeout(Math.max(recordMs - held, 0));
    const video = page.video();
    // The video is complete only once its context closes.
    await context.close();
    await video.saveAs(join(outDir, file));
    console.log(`${file}  ${url}`);
  }

  // The job summary shows the sweep's peaks on the run's page, so nobody has to open the log.
  if (process.env.GITHUB_STEP_SUMMARY && sweeps.length > 0) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, sweepSummary(sweeps));
  }

  // The policies' verdict and what the pages loaded, in the log and on the run's page.
  const tally = [...loaded].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `${key} ×${count}`);
  for (const line of tally) console.log(`loaded ${line}`);
  const verdict = `${
    policyProblems.size === 0
      ? `No Content-Security-Policy violation and no Permissions Policy error, and all ${responsesChecked} page responses carried the site's security headers.`
      : `${policyProblems.size} policy problem(s); each has its own "failure" line.`
  } The policy refused Vercel's preview toolbar ${toolbarRefusals} time(s), which the run does not count.`;
  console.log(`policies: ${verdict}`);
  for (const [text, places] of policyProblems) {
    const list = [...places];
    failures.push(`${text}, at ${list.slice(0, 5).join(", ")}${list.length > 5 ? ` and ${list.length - 5} more` : ""}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### Policies\n\n${verdict}\n\n### What the pages loaded\n\n${tally.map((line) => `- ${line}`).join("\n")}\n`
    );
  }

  failures.push(...(await saveAssets(site, plan.assets, outDir)));
  // What this run saved, against what its plan names (shards.mjs). A still or a recording the plan names and the run did not save
  // fails it, and so does a file the plan does not name. A step skipped because its control is absent takes no still: its stills
  // have their failure already, with its cause, and are not listed here again.
  failures.push(...planFailures(planFiles(plan), await writtenSince(outDir, began), perFile.untaken));
  for (const failure of failures) console.log(`failure ${failure}`);
  if (failures.length > 0) throw new Error(`${failures.length} failure(s); each has its own "failure" line above`);
} finally {
  await browser.close();
  await noWebGL?.close();
}
