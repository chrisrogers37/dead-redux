// The ride's stills (src/components/world/ride.ts): one button starts the ride, and left alone it settles. Every one of them
// depends on which of its two looks the ride is in as the still is taken, and the page changes look on a timer, so a slow
// renderer can take a still of the wrong look, or look for a control that has gone. So each step here says the look it needs
// (`ride`: "awake" or "settled"), the shoot reads the page's own mark just before the still and just after, and a still taken in
// any other look fails the run (stillInLook). A control a step presses that is not on the page fails the run for the still it would
// have taken, and a state a `required` step waits for that never comes fails it too. Each still has one failure line, its first,
// which says why (fileFailures).
// A settled page is used as it is: a pointer that moves only shows its cursor, and a press on one of its controls does that
// control's work. What wakes it is a press on the bare world, or a key that is no control's. The steps below try each of these.
// An awake page settles a wait after its last input, and the shoot's own work after a press takes the renderer's frames: a still
// of the world is several of them to draw and save, and each read of the page waits for one. On a slow runner that work outlasted
// the wait. So a still that needs the ride awake is taken with a key held down from its step's act (HOLD, awakeHolds), which an
// awake page cannot settle under and a settled page is not woken by. The page's own script holds it (holdEvent), not the browser's
// keyboard, which would show the focus ring of the button just pressed.
// scripts/__tests__/ride-shoot.test.ts holds every step to that, and the stills' names to the list there. The ride's recordings are
// in the shoot's one list of them, with the button and the looks named here (RECORDINGS in recordings.mjs).

export const RIDE = "[data-action='ride']";
export const AWAKE = "main[data-ride='awake']", SETTLED = "main[data-ride='settled']";

// How long a ride waits to settle on a page the shoot takes its stills from, by device, in seconds (?idle=, on previews), in place of
// the page's own ten. The wait runs from the last input. It used to have to hold from a step's press to the end of its still: on CI's
// software renderer that was 5.3 to 6.4 s on a desktop in the Screenshots run of 33ddbf6, and up to some 15 s on 2026-11-26, when
// a desktop's frame took 0.55 to 0.78 s and the sleep timer's press came after the wait was over. Now a still that needs the ride
// awake is taken under HOLD, pressed straight after the step's act, so the wait has only to outlast the act's end and that one key,
// three frames at most (awakeHolds). The waits stay as they were, a desktop and a TV 15 s and the others 6 s: a desktop's is that
// for frames of 5 s, a phone's for frames of 2 s, where CI's phones drew one in 0.12 s at the slowest.
const RIDE_IDLE_S = { desktop: 15, tv: 15 };
const RIDE_IDLE_ELSE_S = 6;
export const rideIdle = (device) => RIDE_IDLE_S[device] ?? RIDE_IDLE_ELSE_S;

// What is wrong with a still that needs the ride in the look `need`, where the page marked `before` just before the still and `after`
// just after it ("awake", "settled", or "none" out of a ride): null where both are the look it needs. The look changes only on a
// timer or an input, and the shoot sends no input between the two readings, so the same look either side is the look in the still.
export function rideFailure(need, before, after) {
  if (before === need && after === need) return null;
  return `the still needs the ride ${need}, and the page had it ${before} just before the still and ${after} just after`;
}

// A file's failures, one line a file: its first, which says why. A step can fail in several ways one after another, a look it never
// came to and then a still taken in the wrong one, and the later ones only follow from the first. `untaken` is the files that
// were not saved for a reason said here (`taken` false), a step's control that was not on the page: when what the run saved is
// held to its plan, those are not listed again for being missing (planFailures in shards.mjs).
export function fileFailures(failures) {
  const failed = new Set(), untaken = new Set();
  return {
    untaken,
    fail(file, why, taken = true) {
      if (!taken) untaken.add(file);
      if (failed.has(file)) return;
      failed.add(file);
      failures.push(`${file}: ${why}`);
    },
  };
}

// The ride's look as the page marks it on <main>: "awake" or "settled", or "none" out of a ride.
export const rideNow = (page) => page.evaluate(() => document.querySelector("main")?.dataset.ride ?? "none");

// Takes a still (`take`) of a page that must have the ride in the look `need`, reading the page's mark just before it and just after:
// what is wrong with the still (rideFailure), or null. A still that needs no look is only taken.
export async function stillInLook(page, need, take) {
  const before = need ? await rideNow(page) : null;
  await take();
  return need ? rideFailure(need, before, await rideNow(page)) : null;
}

// The key the shoot holds down while it takes a still that needs the ride awake. The page counts a key held down as input for as
// long as it is held (watchIdle in ride.ts), so an awake page does not settle under it, however long the still takes; Shift is a
// key the settled look leaves as it is (quietKey there), so a page that has settled already stays so, and its still fails; and
// Shift alone gives the world no control (public/world/input.js). The ride-settle-wake recording holds it for the same reason. The
// right one, since a step of the sleep timer's page presses the left.
export const HOLD = "ShiftRight";

// HOLD's keydown or keyup (`type`), dispatched by script in the page (page.evaluate): from the focused element, as the browser's own
// would come, bubbling to the window, where the ride (watchIdle in ride.ts) and the world (input.js) listen for keys, and none of
// the page's listeners asks whether an event is the browser's (isTrusted). It is not pressed on Playwright's keyboard: a key the
// browser sees puts the page in its keyboard mode, and the button a step has just clicked takes its focus ring (:focus-visible),
// which a visitor who clicked it never sees. One dispatched by script leaves that mode as the click set it, so a still taken under
// it differs from one taken without in nothing but the ride's look; and a click made under it is a plain one, with no shiftKey.
export function holdEvent([type, code]) {
  const from = document.activeElement ?? document.body ?? document;
  from.dispatchEvent(new KeyboardEvent(type, { code, key: "Shift", location: 2, shiftKey: type === "keydown", bubbles: true, cancelable: true, composed: true }));
}

// For each of a page's steps, what the shoot does with HOLD. `hold`: it presses it straight after the step's act, where the step's
// still needs the ride awake (a press that wakes the page, or one on a control of the awake look, comes first). `letGo`: once the
// step's still has been read back it lets it go, unless the next step's press needs the ride awake too (`from: "awake"`), a press
// on a control only the awake look shows, which is then made with HOLD still down. Let go, the page settles its own wait later,
// which a settled still and a later one wait for with nothing held.
export const awakeHolds = (steps) => steps.map((step, i) => ({ hold: step.ride === "awake", letGo: steps[i + 1]?.from !== "awake" }));

// HOLD over one page's steps as awakeHolds says, for the shoot's step loop: `acted(n)` once step n has acted, `after(n)` once its
// still has been read back or the step has been skipped without one, and `done()` once the page's steps are over, so the key is
// never down for the page after. `held()` says whether it is down now. Each press and letting go is holdEvent's, in the page.
export function keyHold(page, steps) {
  const holds = awakeHolds(steps);
  let down = false;
  const up = async () => {
    if (!down) return;
    down = false;
    await page.evaluate(holdEvent, ["keyup", HOLD]);
  };
  return {
    held: () => down,
    async acted(n) {
      if (!holds[n].hold || down) return;
      await page.evaluate(holdEvent, ["keydown", HOLD]);
      down = true;
    },
    after: async (n) => {
      if (holds[n].letGo) await up();
    },
    done: up,
  };
}

// How long a press that needs the ride settled waits for the page to come to it: a page a step has woken settles again in its
// device's wait, 15 s at most, and this is the wait a settled still gets (rideSteps). Nothing but input wakes a page, so a press
// that needs the ride awake waits for nothing.
const LOOK_WAIT_MS = 40_000;

// What is wrong with a press that needs the ride in the look `from` as it is made, a press on a control of one look: null where the
// page marks that look, once a press that needs it settled has had `waitMs` to come to it.
export async function pressFailure(page, from, waitMs = from === "settled" ? LOOK_WAIT_MS : 0) {
  if (waitMs > 0) await page.waitForSelector(`main[data-ride='${from}']`, { timeout: waitMs }).catch(() => {});
  const now = await rideNow(page);
  return now === from ? null : `the press needs the ride ${from}, and the page had it ${now}`;
}

// The page's cursor as the page has it now: "hidden" under the class a settled page hides it with, else "shown" (ride.ts). A settled
// page shows its cursor for three seconds after a pointer's move or press, or a key. A still cannot show a cursor, and on a slow
// renderer the step's second of settling and its still outlast those three seconds, so the line the shoot logs of the page after
// the still can read "hidden" for a cursor the step did bring back. So a step that says how its cursor should be (`cursor`) has
// it read here straight after it has acted, the reading is in the step's own line of the log, and a wrong one fails the run.
export const cursorNow = async (page) => ((await page.evaluate(() => document.documentElement.classList.contains("cursor-off"))) ? "hidden" : "shown");

// What is wrong with a cursor that should be `want`, "shown" or "hidden", and was read as `now`: null where it is as it should be.
export const cursorFailure = (want, now) => (now === want ? null : `the cursor should be ${want}, and it is ${now}`);

// A place over the world, clear of every plate of both looks, on a desktop and on a phone, where the settled look's corner ends
// 184 px down and its chip begins 489 px down of 844: left of the middle and a little above it.
const overWorld = (page) => {
  const { width, height } = page.viewportSize();
  return [width * 0.45, height * 0.45];
};

// A pointer that moves over the world, which shows a settled page's cursor and wakes nothing. The page takes the first move it
// hears only for where the pointer is (watchIdle in ride.ts), so the pointer goes to one place and then on to another, in a few
// moves.
export async function movePointer(page) {
  const [x, y] = overWorld(page);
  await page.mouse.move(x, y);
  await page.mouse.move(x + 24, y + 12, { steps: 4 });
}

// A press on the bare world, which wakes a settled page: a finger's tap where the device has a touch screen, and there the world
// takes it for a look too, so the camera comes back from the crane; else a mouse's click.
export async function pressWorld(page, touch) {
  const [x, y] = overWorld(page);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

// The ride's two stills: the press, which starts the ride with the whole HUD and the camera that walks with the bears (`<shot>`); then,
// with nothing touched, the page settled (`<shot>-settled`). The camera takes three seconds of world time to reach the crane, which
// a software renderer draws in half a minute. A still whose subject is the settled ride itself waits for it (`crane`): the home
// page's and the fixed day's. One whose subject is a plate in the settled HUD does not, and is shot a second after the page settles,
// with the camera a little way out from the bears.
export const rideSteps = (shot, crane = false) => [
  { click: RIDE, required: true, waitFor: AWAKE, ride: "awake", shot },
  { waitFor: SETTLED, waitMs: 40_000, required: true, ride: "settled", crane, shot: `${shot}-settled` },
];

// The chip's link to the next show, and today's page once that link has loaded it: no chip, and the show playing, or paused where
// the browser refuses to start it.
const NEXT_LINK = "[data-action='play-next']";
// The sleep timer, which both looks show.
const SLEEP = "[data-action='sleep']";
const ARRIVED = "main:not(:has([data-next]))[data-state='playing'], main:not(:has([data-next]))[data-state='paused']";

// The pages that shoot the ride, each with the devices it names (null for every device that shoots every page; the TV shoots the
// home page alone) and the ride's own steps, which the shoot puts among the page's others. `playWaitMs` is how long a step that
// starts a show waits for it (shoot.mjs).
export const ridePages = (playWaitMs) => ({
  // The home page and the fixed day: the ride, awake and settled, with the camera on the crane.
  home: { devices: null, steps: rideSteps("ride", true) },
  fixed: { devices: null, steps: rideSteps("fixed-ride", true) },
  // Without WebGL the ride is the page's half of it.
  still: { devices: ["desktop-nowebgl", "phone-nowebgl"], steps: rideSteps("fixed-ride") },
  // The new day's chip: under the title's plate while the ride is awake, over the title once it has settled. With a mouse the
  // pointer then moves over the world: the cursor shows and the page stays settled. A press on the bare world wakes it. Left alone
  // it settles again, and the press on the settled chip's link waits for that (`from`), the pointer's way to it waking nothing.
  // The link is followed at that first press, and today's page arrives riding and settled at once.
  newday: {
    devices: ["desktop", "desktop-reduced"],
    steps: [
      ...rideSteps("fixed-newday-ride"),
      { move: true, cursor: "shown", ride: "settled", shot: "fixed-newday-ride-moved" },
      { world: true, waitFor: AWAKE, required: true, ride: "awake", shot: "fixed-newday-ride-woken" },
      { click: NEXT_LINK, from: "settled", required: true, waitFor: ARRIVED, waitMs: playWaitMs, player: true, ride: "settled", shot: "fixed-newday-tapped" },
    ],
  },
  // The same on the phone, a page of its own since its steps are others: a finger has no pointer to move over the page, its tap on
  // the world is a look too, and it taps the settled chip's link. Every step of a page is taken on every device that shoots the
  // page, so the shoot's plan can name each device's stills from the page's steps (stillFiles in shards.mjs).
  newdayTouch: {
    devices: ["phone"],
    steps: [
      ...rideSteps("fixed-newday-ride"),
      { world: true, waitFor: AWAKE, required: true, ride: "awake", shot: "fixed-newday-ride-woken" },
      { tap: NEXT_LINK, from: "settled", required: true, waitFor: ARRIVED, waitMs: playWaitMs, player: true, ride: "settled", shot: "fixed-newday-tapped" },
    ],
  },
  // The sleep timer counting seconds: the ride's own row has it while the page is awake, so it is pressed with HOLD still down from
  // the ride's still (`from`), and one press sets 30 s. The later still comes 32 s after that one, HOLD let go between them: the
  // show is paused, and with no input since, the ride has settled and the cursor is hidden. Focus on the settled look's sleep timer
  // and a key that only modifies another bring the cursor back and leave the look. Then a letter that is no control's wakes the
  // page, the ride still on.
  sleep: {
    devices: ["desktop"],
    steps: [
      { click: RIDE, required: true, waitFor: AWAKE, ride: "awake", shot: "fixed-sleep-ride" },
      { click: SLEEP, from: "awake", required: true, ride: "awake", shot: "fixed-sleep-30", later: { ms: 32_000, shot: "fixed-slept", ride: "settled", cursor: "hidden" } },
      { focus: SLEEP, press: "ShiftLeft", required: true, cursor: "shown", ride: "settled", shot: "fixed-cursor-back" },
      { press: "KeyX", waitFor: AWAKE, required: true, ride: "awake", shot: "fixed-key-woken" },
    ],
  },
  // The look-up failed: the plate that says so, in a ride awake and settled.
  lookup: { devices: ["desktop", "phone", "phone-360"], steps: rideSteps("fixed-lookup-failed-ride") },
  // The player's shelf away, on a phone and a phone on its side: the ride puts the camera behind the bears. The tab's press, the
  // step after the ride's (shoot.mjs), is made with HOLD still down, since the tab is there only while the ride is awake. This page
  // keeps the page's own ten seconds (`ownIdle`): CI's phones took 2.8 s a step here, so the tab's press came under 5 s after the
  // ride's.
  frame: {
    devices: ["phone", "phone-landscape"],
    ownIdle: true,
    steps: [{ click: RIDE, required: true, waitFor: `${RIDE}[aria-pressed='true']`, ride: "awake", shot: "fixed-shelf-frame-ride" }],
  },
});

// The fixed day's focus walk: where Tab lands, press by press, in the order the screen shows them. Each press is a still,
// fixed-focus-1 and on.
export const FOCUS_STOPS = [
  "the world", "the title's tab", "Archive", "the ride's button", "Share", "the buttons' tab", "prev", "play", "next", "Details", "the seek slider", "the player's tab",
];
