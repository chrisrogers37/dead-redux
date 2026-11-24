// The shoot's recordings: the list shoot.mjs records, and the steps one takes once its page is open, apart from the browser so that
// scripts/__tests__/shoot-recordings.test.ts can take them with a stand-in for the page.
//
// A step that waits on the world fails the run when what it waits for never comes. CI's renderer draws one to two frames a second
// where a visitor's draws sixty, and a frame of the world is 50 ms of its time at the most, so a step held for a time ends
// somewhere else on every runner, and one that only logged a miss gave a green run and a recording of nothing: in seven of the
// nineteen runs of 2026-11-22 and 23 whose logs tell, the stage's recording, held 25 s, left its bear 2 to 5 m short of the
// platform's edge.
import { STAGE, STAGE_REACH } from "../../public/world/ground.js";
import { RIG_EASE_S } from "../../public/world/pose.js";
import { bandPath } from "./band.mjs";
import { AWAKE, RIDE, SETTLED } from "./ride.mjs";

/** How long each recording runs once the page has loaded and any control is pressed, unless its steps take longer. */
export const RECORD_MS = 10_000;
/** How long a control gets to appear, and its state to come once it is pressed, in ms. */
export const PRESS_MS = 15_000;
/** How long a step waits for the world to say where the visitor stands, in ms: the world's start, after the page's load. */
export const WORLD_MS = 30_000;
/** How often a step that waits on the world reads it, in ms. */
export const POLL_MS = 50;
/** How long by the clock, as well as for how many of the world's frames, the camera must have kept still to be at rest, in ms. */
export const REST_MS = 1000;
/** How many frames of the world the camera must have kept still to be at rest; they are the end of the recording, and show it resting. */
export const REST_FRAMES = 12;

/** The platform's edge, as a hold's end: within a tenth of a metre of where the walk's limit stops a walker, [x, z, r]. */
export const STAGE_EDGE = [STAGE[0], STAGE[1], STAGE_REACH + 0.1];

// How long a hold may last is reckoned from how many frames of the world it needs, at 2 s a frame: CI's slowest in the logs of
// 2026-11-22 and 23 is 0.78 s, at the stage. A hold ends as soon as what it waits for has come, so a long limit costs a run nothing
// unless the step has failed.
const FRAME_MS = 2000;

// The ride's recordings (src/components/world/ride.ts): the button, once the world is ready, and the state its press must bring,
// the button pressed; the page's marks of the ride's two looks are ride.mjs's, with its stills. A recording that is of the ride
// with the bears, and not of its settling, asks for a minute's wait to settle (?idle=, on previews), so the page stays awake
// through its ten seconds and whatever a slow renderer adds to them.
const ONCE_READY = `#world[data-world='ready'] ~ div ${RIDE}`, PRESSED = `${RIDE}[aria-pressed='true']`, STAYS_AWAKE = "idle=60";
// The ride's camera eases between its two rigs over RIG_EASE_S of the world's time (pose.js), and a frame is at most 50 ms of it:
// 60 frames each way.
const EASE_FRAMES = RIG_EASE_S * 20;
/** How long the ride's camera may take on its way between its rigs, either way, in ms: a recording that waits for it to come to the
 * crane or back, and a settled still whose subject is the crane (shoot.mjs), fail the run past this. */
export const EASE_MS = EASE_FRAMES * FRAME_MS;

// The walk's camera at the stage and at a landmark (#178, #191), which no still and no other recording shows: in third person a
// landmark or the stage in the boom's way used to cut the view, and the first mend of that left the camera swinging for ever beside
// the stage once the bear stood still. Two walks on the fixed day, each from a place of its own (?pose=X,Z,HEADING,PITCH), since
// the stage and the nearest tall landmark stand 131 m apart; a desktop and a phone record each.
// At the stage: from 5 m short of the platform's edge the bear walks to the edge, facing the stage (9 frames); turns round, which
// swings the boom onto the stage (39 frames); and stands. At the tower: from 14 m short of the Lovelight tower the bear walks past
// it, 2.5 m from its middle, to 7 m beyond (35 frames), which brings the tower into the boom's way; and stands with its back to it.
// Each stand lasts until the camera has come to rest, which the walk's own tests give three seconds of the world's time for
// (src/lib/__tests__/camera.test.ts), 60 frames; so its last frames show the camera at rest, which is what the recording is for.
export const CAMERA_WALKS = [
  ["camera-stage", "61.12,-53.12,-0.855,0", [["ArrowUp", 15 * FRAME_MS, { near: STAGE_EDGE }], ["ArrowLeft", 40 * FRAME_MS, { turned: Math.PI }], [null, 90 * FRAME_MS, { rest: REST_FRAMES }]]],
  ["camera-tower", "81.66,54.33,2.524,0", [["ArrowUp", 40 * FRAME_MS, { near: [69.5, 71.46, 1] }], [null, 90 * FRAME_MS, { rest: REST_FRAMES }]]],
];

// Short recordings show the motion that stills cannot. The TV records the ride as a TV has it: started, then left alone.
// An entry records the page at its path, "/" unless it names one. A `click` is pressed first, and the state its `waitFor` names
// must come. Its `keys` are steps taken one after another, each [key, ms, until]: the key is held for its milliseconds, or with no
// key (null) the bear stands. A step that names what it waits for ends when that comes, and fails the run if its milliseconds
// pass first (`step`, below):
//   near: [x, z, r]   the visitor stands within r m of a place;
//   turned: rad       the visitor has turned so far since the step began;
//   past: mode        the world has left that mode (the opening's descent);
//   lean: 1 or 0      the ride's camera is on the crane (1), or back on the rig that walks with the bears (0): how far it has
//                     gone from that rig to the crane, by the world's own count (main.js's `ride` stat);
//   rest: frames      the camera has come to rest: for so many frames of the world, and REST_MS of the clock, the visitor has
//                     stood where it stands and its bear's head has kept its place in the frame;
//   played: frames    the world has drawn so many frames while the show played: a frame drawn while the page's state was any but
//                     playing does not count.
export const RECORDINGS = [
  { device: "desktop", name: "home" },
  { device: "phone", name: "home" },
  // The ride on the TV: the button starts it; two seconds on (?idle=2) the page settles and the camera eases out to the crane. The
  // recording stands until the camera is on the crane, the page's two seconds and the ease's frames at the most, and then three
  // seconds there, which wait for nothing.
  {
    device: "tv",
    name: "ride",
    path: "/?idle=2",
    click: RIDE,
    waitFor: AWAKE,
    keys: [[null, 2_000 + EASE_MS, { lean: 1 }], [null, 3_000]],
  },
  // Roaming: focus the scene, then hold each key for its milliseconds, in order. The roam goes nowhere in particular: its holds
  // wait for nothing.
  {
    device: "desktop",
    name: "roam",
    click: "canvas",
    keys: [
      ["ArrowUp", 3000],
      ["ArrowLeft", 1200],
      ["ArrowUp", 3000],
      ["ArrowRight", 800],
      // Then look up at the sky and down past the horizon.
      ["KeyT", 700],
      ["KeyG", 1400],
    ],
  },
  // The phone roams with its on-screen stick, pushed to its rim each way in turn for its milliseconds, then let go.
  {
    device: "phone",
    name: "roam",
    stick: [
      ["up", 3000],
      ["left", 1200],
    ],
  },
  // The fixed day's descent with nothing pressed: from over the summit down to the camera that walks with the bears, which wait at the
  // trailhead. It is 6 s of the world's time, 120 frames in CI, which drew them in about a minute when this recording ran a fixed
  // 75 s and takes longer on a slower runner or a heavier world: so the recording waits for the world to leave its descent, and
  // then stands 5 s more with the bears.
  { device: "desktop", name: "descent", path: "/2026-10-20", keys: [[null, 120 * FRAME_MS, { past: "descent" }], [null, 5_000]] },
  // Riding with the bears on the fixed day, once the world is ready: the button puts the camera behind the bears. Once the button
  // is pressed the recording waits for nothing: it is ten seconds of the ride, awake.
  {
    device: "desktop",
    name: "ride",
    path: `/2026-10-20?${STAYS_AWAKE}`,
    click: ONCE_READY,
    waitFor: PRESSED,
  },
  // The same from C C Rider 0:42 in, where the bears set off along a straight stretch in one line, clear of the landmarks.
  {
    device: "desktop",
    name: "ride-straight",
    path: `/2026-10-20?at=3&t=42&${STAYS_AWAKE}`,
    click: ONCE_READY,
    waitFor: PRESSED,
  },
  // Riding with the bears on a phone: its three bears ahead and the visitor's bear above the now-plate.
  {
    device: "phone",
    name: "ride",
    path: `/2026-10-20?${STAYS_AWAKE}`,
    click: ONCE_READY,
    waitFor: PRESSED,
  },
  // A ride that settles and wakes, on the fixed day: three seconds after the button (?idle=3) the HUD strips, which the press waits
  // for, and the camera eases out to the crane; the recording stands until it is there, and the stats line after the stand is the
  // crane's. A look to the left then wakes the page and brings the camera back to the rig the look turns, as slowly: the look's
  // 600 ms wait for nothing, since what the look is for, the camera's way back, is what the next step waits for. Left alone, the
  // page would settle again three seconds into the way back and send the camera out once more, so Shift is held until the camera
  // is back with the bears: a key held down is input for as long as it is held (watchIdle in ride.ts), and Shift alone gives the
  // world no control (public/world/input.js). Then two seconds with the bears, under the page's three before it settles again,
  // which wait for nothing.
  {
    device: "desktop",
    name: "ride-settle-wake",
    path: "/2026-10-20?idle=3",
    click: ONCE_READY,
    waitFor: SETTLED,
    keys: [[null, EASE_MS, { lean: 1 }], ["ArrowLeft", 600], ["ShiftLeft", EASE_MS, { lean: 0 }], [null, 2_000]],
  },
  // From ?pose=stage the click starts the show, then the visitor's bear walks down the slope to the platform and stops at its edge. The
  // walk is 23 m, and a frame moves the bear at most 0.6 m (12 m/s, each frame's step capped at 50 ms), so it takes 39 frames, which
  // CI draws in 20 to 32 s, by its logs. The key is held until the bear is at the edge, and the bear then stands there 3 s.
  {
    device: "desktop",
    name: "stage",
    path: "/2026-10-20?pose=stage",
    click: "canvas",
    keys: [["ArrowUp", 40 * FRAME_MS, { near: STAGE_EDGE }], [null, 3_000]],
  },
  // The sound's listener through the camera's modes, from ?pose=stage: the click starts the show, B starts the ride, a step walks
  // again, F starts the ride as B does, Escape leaves it and a step walks on. The stats line after each control shows the mode, where
  // the listener stands and where the visitor's bear's head does; in third person they are the same point in every mode. A key held
  // down keeps the ride awake, so the crane's line is ride-settle-wake's. Its holds wait for nothing: each is there for its line of
  // the log.
  {
    device: "desktop",
    name: "stage-modes",
    path: "/2026-10-20?pose=stage",
    click: "canvas",
    keys: [
      ["KeyB", 3000],
      ["ArrowUp", 2000],
      ["KeyF", 3000],
      ["Escape", 500],
      ["ArrowUp", 2000],
    ],
  },
  ...["desktop", "phone"].flatMap((device) => CAMERA_WALKS.map(([name, pose, keys]) => ({ device, name, path: `/2026-10-20?pose=${pose}`, click: "canvas", keys }))),
  // The band playing a song (#184), which the band's two stills, 15 s apart, cannot show: from the front of the crowd, where those
  // stills are taken (band.mjs), in Fire On The Mountain with the show's map driving the world. The click on the scene starts the
  // show and V turns the view to first person, so the visitor's bear is out of the frame; then the band plays for 150 frames of the
  // world while the show plays. The band plays only while it does (main.js), and archive.org's sound can take its time to start, so
  // the step counts no frame drawn before then, and fails the run if the 150 never come. On CI each frame is 50 ms of the world's
  // time, so the 150 are 7.5 s of it: three bars at 96 a minute, a stick's stroke three times over on each of the four sticks.
  { device: "desktop", name: "band", path: bandPath("desktop"), click: "canvas", keys: [["KeyV", 500], [null, 180 * FRAME_MS, { played: 150 }]] },
];

/**
 * What a step reads of the world (window.__hill, main.js): where the visitor stands, how many frames the world has drawn, its
 * mode, where the visitor's bear's head lands in the frame, as fractions of it to a thousandth, in a ride how far its camera has
 * gone to the crane ({ lean, yaw }, null out of one), and whether the show plays (the page's state, which main.js plays the band
 * by). Null until the world has started. The page tells nothing of the camera's own place; with the bear standing, its head moves
 * in the frame when the camera does, by a thousandth of the frame for one to three centimetres of the camera's way at the walk's
 * distances.
 */
export const readWorld = (page) =>
  page.evaluate(() => {
    const hill = window.__hill, playing = window.document?.querySelector("main")?.dataset.state === "playing";
    return hill?.walker ? { walker: hill.walker, frames: hill.frames, mode: hill.mode, screen: hill.avatar?.screen ?? null, ride: hill.ride ?? null, playing } : null;
  });

/**
 * Waits for the world to start: to say where the visitor stands.
 *
 * @param now - The clock, in ms; a test gives its own.
 * @returns What the world says (readWorld), or null if it has not started within `ms`.
 */
export async function worldStarted(page, ms = WORLD_MS, now = Date.now) {
  for (const from = now(); ; ) {
    const world = await readWorld(page);
    if (world !== null || now() - from >= ms) return world;
    await page.waitForTimeout(POLL_MS);
  }
}

/**
 * Whether what a step waits for has come.
 *
 * @param until - What the step waits for: near, turned, past, lean, rest or played (RECORDINGS, above).
 * @param world - What the world says now (readWorld).
 * @param start - What it said as the step began.
 * @param seen - The step's own memory: for `rest`, { still, frame, at }, what was last seen to change and when; for `played`,
 *   { frame, played }, the frame it last read and how many frames it has seen drawn while the show played.
 * @param at - The clock now, in ms.
 */
export function arrived(until, world, start, seen, at) {
  const { walker } = world;
  if (until.near) return Math.hypot(walker.x - until.near[0], walker.z - until.near[1]) <= until.near[2];
  if (until.turned !== undefined) return Math.abs(walker.heading - start.walker.heading) >= until.turned;
  if (until.past !== undefined) return world.mode !== until.past;
  // The ride's camera on the crane, or back with the bears: a world out of a ride has no such camera, and has not come to either.
  if (until.lean !== undefined) return world.ride?.lean === until.lean;
  // Frames drawn while the show played: those since the last reading count if the show plays now.
  if (until.played !== undefined) {
    if (seen.frame === undefined) Object.assign(seen, { frame: start.frames, played: 0 });
    if (world.playing) seen.played += world.frames - seen.frame;
    seen.frame = world.frames;
    return seen.played >= until.played;
  }
  // At rest: the same picture of the bear, from the same stand, for long enough. A page that does not say where the head lands
  // (the view is first person) never rests: its count starts again at every reading.
  const still = JSON.stringify([walker, world.screen]);
  if (world.screen === null || still !== seen.still) Object.assign(seen, { still, frame: world.frames, at });
  return world.frames - seen.frame >= until.rest && at - seen.at >= REST_MS;
}

/** What to say of a step whose wait ran out: what had not come, and where the visitor stood, to the millimetre and the milliradian. */
export function missed(until, world, start, seen) {
  const to3 = (v) => Math.round(v * 1000) / 1000;
  const { walker } = world, stood = `it stood at ${to3(walker.x)}, ${to3(walker.z)} heading ${to3(walker.heading)}`;
  if (until.near) {
    const [x, z, r] = until.near;
    return `the visitor had not come within ${to3(r)} m of ${to3(x)}, ${to3(z)}: ${stood}, ${Math.hypot(walker.x - x, walker.z - z).toFixed(1)} m from there`;
  }
  if (until.turned !== undefined) {
    return `the visitor had not turned ${until.turned.toFixed(2)} rad: ${stood}, ${Math.abs(walker.heading - start.walker.heading).toFixed(2)} rad from the heading ${to3(start.walker.heading)} it began at`;
  }
  if (until.past !== undefined) return `the world had not left its ${until.past}: its mode was ${world.mode}, ${world.frames - start.frames} frames on, and ${stood}`;
  if (until.lean !== undefined) {
    const where = world.ride ? `it had gone ${world.ride.lean} of the way to the crane` : `the world was in no ride, its mode ${world.mode}`;
    return `the ride's camera had not come ${until.lean ? "to the crane" : "back to the bears"}: ${where}, ${world.frames - start.frames} frames on, and ${stood}`;
  }
  if (until.played !== undefined) return `the show had played for ${seen.played ?? 0} of the ${until.played} frames it must, ${world.frames - start.frames} frames on, and was ${world.playing ? "" : "not "}playing; ${stood}`;
  const head = world.screen === null ? "the page did not say where the bear's head lands in the frame" : `the bear's head, at ${world.screen.join(", ")} of the frame, had kept its place for ${world.frames - seen.frame} frames of the ${until.rest} it must`;
  return `the camera had not come to rest: ${head}; ${stood}`;
}

/**
 * One step of a recording: holds a key, or none, for its milliseconds, or until what it waits for has come.
 *
 * A step that waits first lets the world start, so that its key goes down in a world that can take it. If the world does not
 * start, or what the step waits for has not come when its milliseconds have passed, the step has failed.
 *
 * @param step - [key, ms, until]: the key's code or null, the milliseconds, and what it waits for, if anything.
 * @param file - The recording's file, for the failure's line; `n` is the step's number in it, from 1.
 * @param now - The clock, in ms; a test gives its own.
 * @returns { ms, failure }: how long the step took, and why it failed, in one line, or null.
 */
export async function step(page, [key, ms, until], { file, n, now = Date.now, worldMs = WORLD_MS }) {
  const name = `${file}: step ${n}, ${key ?? "standing"},`;
  const start = until ? await worldStarted(page, worldMs, now) : null;
  if (until && start === null) return { ms: 0, failure: `${name} was not taken: the world had not said where the visitor stands ${worldMs} ms after the page loaded` };
  const from = now();
  let failure = null;
  if (key) await page.keyboard.down(key);
  if (!until) await page.waitForTimeout(ms);
  else {
    const seen = {};
    for (let world = start; !arrived(until, world, start, seen, now()); world = (await readWorld(page)) ?? world) {
      if (now() - from >= ms) {
        failure = `${name} took its whole ${ms} ms and ${missed(until, world, start, seen)}`;
        break;
      }
      await page.waitForTimeout(POLL_MS);
    }
  }
  if (key) await page.keyboard.up(key);
  return { ms: now() - from, failure };
}

/**
 * Presses a recording's control, once it has appeared, and waits for the state the recording names.
 *
 * @returns { found, failure }: whether the control was there to press (a recording without it is skipped, and the run fails for the
 *   file its plan names and it did not save: shards.mjs planFailures), and why the press failed, in one line, or null: the state
 *   never came, so the recording is of a page that never did what it is a recording of.
 */
export async function press(page, click, waitFor, file, ms = PRESS_MS) {
  // Scripts may draw the control after load, so it gets time to appear.
  const found = await page.waitForSelector(click, { timeout: ms }).then(() => true, () => false);
  if (!found) return { found, failure: null };
  await page.click(click);
  if (!waitFor) return { found, failure: null };
  const came = await page.waitForSelector(waitFor, { timeout: ms }).then(() => true, () => false);
  return { found, failure: came ? null : `${file}: ${click} was pressed and ${waitFor} had not come ${ms} ms later` };
}
