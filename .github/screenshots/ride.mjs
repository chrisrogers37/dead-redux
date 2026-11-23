// The ride's stills and recordings (src/components/world/ride.ts): one button starts the ride, and left alone it settles. Every one of
// them depends on which of its two looks the ride is in as the still is taken, and the page changes look on a timer, so a slow
// renderer can take a still of the wrong look, or look for a control that has gone. So each step here says the look it needs
// (`ride`: "awake" or "settled"), the shoot reads the page's own mark just before the still and just after, and a still taken in
// any other look fails the run (stillInLook). A control a step clicks is `required`: one that is missing fails the run too.
// A settled page is used as it is: a pointer that moves only shows its cursor, and a press on one of its controls does that
// control's work. What wakes it is a press on the bare world, or a key that is no control's. The steps below try each of these.
// scripts/__tests__/ride-shoot.test.ts holds every step to that, and the stills' names to the list there.

export const RIDE = "[data-action='ride']";
const AWAKE = "main[data-ride='awake']", SETTLED = "main[data-ride='settled']";

// How long a ride waits to settle on a page the shoot takes its stills from, by device, in seconds (?idle=, on previews), in place of
// the page's own ten. The wait runs from the last input, which is a step's press, and an awake still must be taken, and its look
// read back, before it is over. In CI's software renderer (the Screenshots run of 33ddbf6) the press on the ride's button to the
// end of its still took a desktop 5.3 to 6.4 s, since a still of the world takes it some four seconds to draw and save, and the
// TV no longer; the next step's press came a second after that. A phone took at most 2.3 s, and a page with reduced motion or
// without WebGL 1.2 s. So a desktop and a TV wait 15 s, and the others 6 s: each over twice the longest span measured there.
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

// The ride's look as the page marks it on <main>: "awake" or "settled", or "none" out of a ride.
export const rideNow = (page) => page.evaluate(() => document.querySelector("main")?.dataset.ride ?? "none");

// Takes a still (`take`) of a page that must have the ride in the look `need`, reading the page's mark just before it and just after:
// what is wrong with the still (rideFailure), or null. A still that needs no look is only taken.
export async function stillInLook(page, need, take) {
  const before = need ? await rideNow(page) : null;
  await take();
  return need ? rideFailure(need, before, await rideNow(page)) : null;
}

// How long a press that needs the ride in a look waits for the page to come to it: a page a step has woken settles again in its
// device's wait, 15 s at most, and this is the wait a settled still gets (rideSteps).
const LOOK_WAIT_MS = 40_000;

// What is wrong with a press that needs the ride in the look `from` as it is made, a press on a control of the settled look: null
// where the page marks that look, once it has had `waitMs` to come to it.
export async function pressFailure(page, from, waitMs = LOOK_WAIT_MS) {
  await page.waitForSelector(`main[data-ride='${from}']`, { timeout: waitMs }).catch(() => {});
  const now = await rideNow(page);
  return now === from ? null : `the press needs the ride ${from}, and the page had it ${now}`;
}

// What is wrong with a page whose cursor should be `want`, "shown" or "hidden": null where it is. A settled page hides its cursor,
// and shows it for three seconds after a pointer's move or press, or a key (the class on <html>, ride.ts). A still cannot show a
// cursor, and a slow renderer's still outlasts those three seconds, so the shoot reads it as soon as the step has acted.
export async function cursorFailure(page, want) {
  const now = (await page.evaluate(() => document.documentElement.classList.contains("cursor-off"))) ? "hidden" : "shown";
  return now === want ? null : `the cursor should be ${want}, and it is ${now}`;
}

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
  // The new day's chip: under the title's plate while the ride is awake, over the title once it has settled. With a mouse
  // (`touch: false`) the pointer then moves over the world: the cursor shows and the page stays settled. A press on the bare world
  // wakes it, a tap where the device has a touch screen, which is a look too. Left alone it settles again, and the press on the
  // settled chip's link waits for that (`from`): a tap on a touch screen, else a click, the pointer's way to it waking nothing. The
  // link is followed at that first press, and today's page arrives riding and settled at once.
  newday: {
    devices: ["desktop", "phone", "desktop-reduced"],
    steps: [
      ...rideSteps("fixed-newday-ride"),
      { touch: false, move: true, cursor: "shown", ride: "settled", shot: "fixed-newday-ride-moved" },
      { world: true, waitFor: AWAKE, required: true, ride: "awake", shot: "fixed-newday-ride-woken" },
      { touch: false, click: NEXT_LINK, from: "settled", required: true, waitFor: ARRIVED, waitMs: playWaitMs, player: true, ride: "settled", shot: "fixed-newday-tapped" },
      { touch: true, tap: NEXT_LINK, from: "settled", required: true, waitFor: ARRIVED, waitMs: playWaitMs, player: true, ride: "settled", shot: "fixed-newday-tapped" },
    ],
  },
  // The sleep timer counting seconds: the ride's own row has it while the page is awake, and one press sets 30 s. The later still
  // comes 32 s after that one: the show is paused, and with no input since the press the ride has settled and the cursor is hidden.
  // Focus on the settled look's sleep timer and a key that only modifies another bring the cursor back and leave the look. Then a
  // letter that is no control's wakes the page, the ride still on.
  sleep: {
    devices: ["desktop"],
    steps: [
      { click: RIDE, required: true, waitFor: AWAKE, ride: "awake", shot: "fixed-sleep-ride" },
      { click: SLEEP, required: true, ride: "awake", shot: "fixed-sleep-30", later: { ms: 32_000, shot: "fixed-slept", ride: "settled", cursor: "hidden" } },
      { focus: SLEEP, press: "ShiftLeft", required: true, cursor: "shown", ride: "settled", shot: "fixed-cursor-back" },
      { press: "KeyX", waitFor: AWAKE, required: true, ride: "awake", shot: "fixed-key-woken" },
    ],
  },
  // The look-up failed: the plate that says so, in a ride awake and settled.
  lookup: { devices: ["desktop", "phone", "phone-360"], steps: rideSteps("fixed-lookup-failed-ride") },
  // The player's shelf away, on a phone and a phone on its side: the ride puts the camera behind the bears. This page keeps the
  // page's own ten seconds (`ownIdle`): CI's phones took 2.8 s a step here, so the tab's press, the step after the ride's, came
  // under 5 s after it.
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

// The ride's recordings. One that is of the ride with the bears, and not of its settling, asks for a minute's wait, so the ride stays
// awake through its ten seconds and whatever a slow renderer adds to them.
const STAYS_AWAKE = "idle=60";
const ONCE_READY = `#world[data-world='ready'] ~ div ${RIDE}`, PRESSED = `${RIDE}[aria-pressed='true']`;
export const RIDE_RECORDINGS = {
  // The ride on the TV: the button starts it; two seconds on it settles, and the camera goes out to the crane, three seconds of world
  // time that a software renderer takes most of a minute to draw at this size.
  tv: { device: "tv", name: "ride", path: "/?idle=2", click: RIDE, required: true, waitFor: AWAKE, recordMs: 50_000 },
  // Riding with the bears on the fixed day, once the world is ready: the button puts the camera behind the bears.
  desktop: { device: "desktop", name: "ride", path: `/2026-10-20?${STAYS_AWAKE}`, click: ONCE_READY, required: true, waitFor: PRESSED },
  // The same from C C Rider 0:42 in, where the bears set off along a straight stretch in one line, clear of the landmarks.
  straight: { device: "desktop", name: "ride-straight", path: `/2026-10-20?at=3&t=42&${STAYS_AWAKE}`, click: ONCE_READY, required: true, waitFor: PRESSED },
  // Riding with the bears on a phone: its three bears ahead and the visitor's bear above the now-plate.
  phone: { device: "phone", name: "ride", path: `/2026-10-20?${STAYS_AWAKE}`, click: ONCE_READY, required: true, waitFor: PRESSED },
  // A ride that settles and wakes, on the fixed day: three seconds after the button the HUD strips and the camera eases out to the
  // crane; once it is there (`settled`, which logs the stats on the crane), a look to the left wakes the page and brings the camera
  // back to the rig the look turns, as slowly. Each way is three seconds of world time, half a minute in a software renderer.
  settleWake: {
    device: "desktop", name: "ride-settle-wake", path: "/2026-10-20?idle=3", click: ONCE_READY, required: true, waitFor: SETTLED, settled: true,
    keys: [["ArrowLeft", 600]], recordMs: 40_000,
  },
};
