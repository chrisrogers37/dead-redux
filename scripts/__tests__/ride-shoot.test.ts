import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOCUS_STOPS, pressFailure, RIDE, RIDE_RECORDINGS, rideFailure, rideIdle, rideNow, ridePages, rideSteps, stillInLook, wakeByPointer } from "../../.github/screenshots/ride.mjs";
import { IDLE_S, watchIdle } from "../../src/components/world/ride";

// The shoot's stills and recordings of the ride (.github/screenshots/ride.mjs). The ride changes look on a timer, so each of its
// stills depends on the look the page is in as it is taken. On CI's software renderer, where a still takes seconds, the first run of
// these steps found a page settled before the step that pressed its sleep timer: the control was gone, the step was skipped in
// silence, two stills were never taken, and the run was green. These tests hold every step to saying the look it needs and to
// failing the run where it cannot have it.

type Later = { ms: number; shot: string; ride?: string };
type Step = {
  click?: string; tap?: string; press?: string; wake?: boolean; touch?: boolean; from?: string; required?: boolean; waitFor?: string; waitMs?: number; player?: boolean; ride?: string; crane?: boolean;
  shot: string; later?: Later;
};
type Page = { devices: string[] | null; ownIdle?: boolean; steps: Step[] };
type Recording = { device: string; name: string; path: string; click: string; required?: boolean; waitFor: string; settled?: boolean; keys?: [string, number][]; recordMs?: number };

// How long a step that starts a show waits for it (shoot.mjs's PLAY_WAIT_MS), which the new day's last step waits too.
const PLAY_WAIT_MS = 45_000;
const pages = ridePages(PLAY_WAIT_MS) as Record<string, Page>;
const recordings = RIDE_RECORDINGS as unknown as Record<string, Recording>;
const shoot = readFileSync(join(__dirname, "../../.github/screenshots/shoot.mjs"), "utf8");
// A page's stills, each with the look it needs: a step's own, and a later one's after it.
// A step may be for the devices with a touch screen alone, or for those without one: `touch` says which the list is for.
const stills = (page: Page, touch = false) =>
  page.steps.filter((step) => step.touch === undefined || step.touch === touch).flatMap((step) => [[step.shot, step.ride], ...(step.later ? [[step.later.shot, step.later.ride]] : [])]);

// What the shoot measured on CI's software renderer (the Screenshots run of 33ddbf6), in seconds: the longest span from a press to
// the end of the still after it, on a desktop (the TV took no longer) and on any other device.
const SLOWEST_S = { desktop: 6.4, other: 2.3 };

describe("the shoot's stills of the ride", () => {
  it("takes every still the pull request's table names, each on the devices it names and in the look its name says", () => {
    expect(Object.fromEntries(Object.entries(pages).map(([name, page]) => [name, { devices: page.devices, stills: stills(page) }]))).toEqual({
      home: { devices: null, stills: [["ride", "awake"], ["ride-settled", "settled"]] },
      fixed: { devices: null, stills: [["fixed-ride", "awake"], ["fixed-ride-settled", "settled"]] },
      still: { devices: ["desktop-nowebgl", "phone-nowebgl"], stills: [["fixed-ride", "awake"], ["fixed-ride-settled", "settled"]] },
      newday: {
        devices: ["desktop", "phone", "desktop-reduced"],
        stills: [["fixed-newday-ride", "awake"], ["fixed-newday-ride-settled", "settled"], ["fixed-newday-ride-woken", "awake"], ["fixed-newday-tapped", "settled"]],
      },
      sleep: { devices: ["desktop"], stills: [["fixed-sleep-ride", "awake"], ["fixed-sleep-30", "awake"], ["fixed-slept", "settled"], ["fixed-cursor-back", "awake"]] },
      lookup: { devices: ["desktop", "phone", "phone-360"], stills: [["fixed-lookup-failed-ride", "awake"], ["fixed-lookup-failed-ride-settled", "settled"]] },
      frame: { devices: ["phone", "phone-landscape"], stills: [["fixed-shelf-frame-ride", "awake"]] },
    });
    // A phone, which has a touch screen, takes the same stills, but for the new day's: there the first tap on the settled chip's link
    // follows it, with no still of a page woken on the way.
    for (const [name, page] of Object.entries(pages)) {
      if (name !== "newday") expect(stills(page, true), name).toEqual(stills(page));
    }
    expect(stills(pages.newday, true)).toEqual([["fixed-newday-ride", "awake"], ["fixed-newday-ride-settled", "settled"], ["fixed-newday-tapped", "settled"]]);
  });

  it("follows the new day's link by one tap on the settled chip where the device has a touch screen, and fails the run unless the page is settled as it taps; with a mouse it presses the link of a page the pointer has woken", () => {
    const LINK = "[data-action='play-next']";
    const [byMouse, byTap] = pages.newday.steps.filter((step) => step.shot === "fixed-newday-tapped");
    expect(byTap).toMatchObject({ touch: true, tap: LINK, from: "settled", required: true, ride: "settled", waitMs: PLAY_WAIT_MS });
    expect(byMouse).toMatchObject({ touch: false, click: LINK, required: true, ride: "settled", waitMs: PLAY_WAIT_MS });
    expect(byMouse.from).toBeUndefined();
    // Both wait for today's page: no chip, and the show playing or paused.
    expect(byTap.waitFor).toBe(byMouse.waitFor);
    expect(byTap.waitFor).toContain("main:not(:has([data-next]))[data-state='playing']");
    // The step before the tap leaves the page settled and sends it nothing; the one before the mouse's press wakes it.
    const taps = pages.newday.steps.filter((step) => step.touch !== false), clicks = pages.newday.steps.filter((step) => step.touch !== true);
    expect(taps.at(-2)).toMatchObject({ ride: "settled", shot: "fixed-newday-ride-settled" });
    expect(clicks.at(-2)).toMatchObject({ wake: true, ride: "awake", shot: "fixed-newday-ride-woken" });
    // A phone shoots the page, and the shoot knows it for a touch screen; no other page has a step for one kind of device alone.
    expect(pages.newday.devices).toContain("phone");
    expect(shoot).toMatch(/\n  phone: \{\n    viewport: \{ width: 390, height: 844 \},\n    deviceScaleFactor: 2,\n    isMobile: true,\n    hasTouch: true,\n  \},/);
    expect(Object.entries(pages).filter(([, page]) => page.steps.some((step) => step.touch !== undefined)).map(([name]) => name)).toEqual(["newday"]);
  });

  it("has every step say the look its still needs, and none that can be skipped in silence: a control it presses is required, and so is a state it waits for", () => {
    for (const [name, page] of Object.entries(pages)) {
      for (const step of page.steps) {
        const where = `${name}: ${step.shot}`;
        expect(["awake", "settled"], where).toContain(step.ride);
        if (step.later) expect(["awake", "settled"], where).toContain(step.later.ride);
        // What a step does: a press on a control, a key, or the pointer's move; or nothing, for a still of the page left alone.
        expect([step.click, step.tap, step.press, step.wake].filter(Boolean).length, where).toBe(step.ride === "settled" && !step.click && !step.tap ? 0 : 1);
        if (step.click || step.tap || step.waitFor) expect(step.required, where).toBe(true);
        // A tap is of a control in one look, on a touch screen: it says both.
        if (step.tap) expect([step.touch, step.from], where).toEqual([true, "settled"]);
        // A still's name says its look: settled, slept or arrived; the others are awake.
        expect(step.ride, where).toBe(/-settled$|-tapped$/.test(step.shot) ? "settled" : "awake");
      }
    }
    // The sleep timer's own control, which is on the page only while the ride is awake, is among them.
    expect(pages.sleep.steps.find((step) => step.click === "[data-action='sleep']")).toMatchObject({ required: true, ride: "awake", shot: "fixed-sleep-30" });
  });

  it("starts each ride by the one button, waits for the page's own mark of the look, and gives a settled still the wait and the crane its subject needs", () => {
    const [awake, settled] = rideSteps("x") as Step[], [, onCrane] = rideSteps("x", true) as Step[];
    expect(awake).toEqual({ click: RIDE, required: true, waitFor: "main[data-ride='awake']", ride: "awake", shot: "x" });
    expect(settled).toEqual({ waitFor: "main[data-ride='settled']", waitMs: 40_000, required: true, ride: "settled", crane: false, shot: "x-settled" });
    expect(onCrane.crane).toBe(true);
    expect(RIDE).toBe("[data-action='ride']");
    // The settled ride itself is the subject on the home page and the fixed day; elsewhere it is a plate, and no still waits.
    expect(Object.entries(pages).filter(([, page]) => page.steps.some((step) => step.crane)).map(([name]) => name)).toEqual(["home", "fixed"]);
    // A settled still's wait outlasts the longest wait to settle, with the slowest awake still before it.
    expect(settled.waitMs! / 1000).toBeGreaterThan(rideIdle("desktop") + 2 * SLOWEST_S.desktop);
  });

  it("sizes the wait before a ride settles to the device: over twice the slowest step CI's renderer took, on a desktop and a TV and on the others", () => {
    expect([rideIdle("desktop"), rideIdle("tv")]).toEqual([15, 15]);
    for (const device of ["phone", "phone-360", "phone-landscape", "desktop-reduced", "desktop-nowebgl", "phone-nowebgl"]) expect(rideIdle(device), device).toBe(6);
    expect(rideIdle("desktop")).toBeGreaterThan(2 * SLOWEST_S.desktop);
    expect(rideIdle("phone")).toBeGreaterThan(2 * SLOWEST_S.other);
    // The sleep timer's later still, 30 s of timer after its press, is of a page that has settled: its wait is past both the timer
    // and the desktop's wait to settle with a slow still before it.
    const later = pages.sleep.steps.find((step) => step.later)!.later!;
    expect(later.ms).toBeGreaterThan(30_000);
    expect(later.ms / 1000).toBeGreaterThan(rideIdle("desktop") + 2 * SLOWEST_S.desktop);
    // One page keeps the page's own ten seconds: the phones' shelf, whose steps CI took 2.8 s apiece.
    expect(Object.entries(pages).filter(([, page]) => page.ownIdle).map(([name]) => name)).toEqual(["frame"]);
  });

  it("says what is wrong with a still taken in another look, whichever side of it the page changed, and nothing of one taken in the look it needs", () => {
    expect(rideFailure("awake", "awake", "awake")).toBe(null);
    expect(rideFailure("settled", "settled", "settled")).toBe(null);
    // Settled before the still began; settled while it was taken; never riding; woken while a settled still was taken.
    for (const [need, before, after] of [["awake", "settled", "settled"], ["awake", "awake", "settled"], ["awake", "none", "none"], ["settled", "settled", "awake"], ["settled", "awake", "settled"]]) {
      const failure = rideFailure(need, before, after);
      expect(failure, `${need} ${before} ${after}`).toContain(`needs the ride ${need}`);
      expect(failure).toContain(`${before} just before`);
      expect(failure).toContain(`${after} just after`);
    }
  });

  // A page as the shoot's helpers use it: what it runs in the page is run here, against a <main> whose mark is the next of `marks`.
  function standIn(marks: (string | undefined)[]) {
    const did: string[] = [];
    vi.stubGlobal("document", {
      querySelector: (selector: string) => {
        did.push(`read ${selector}`);
        return { dataset: { ride: marks.shift() } };
      },
    });
    return { did, page: { evaluate: async (run: () => unknown) => run() }, take: async () => void did.push("still") };
  }
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the page's own mark of the ride just before a still and just after, and passes only a still with the look it needs on both sides", async () => {
    const kept = standIn(["awake", "awake"]);
    expect(await stillInLook(kept.page, "awake", kept.take)).toBe(null);
    expect(kept.did).toEqual(["read main", "still", "read main"]);
    // The page settled while the still was being taken, as a slow renderer lets it: the mark after says so.
    const late = standIn(["awake", "settled"]);
    expect(await stillInLook(late.page, "awake", late.take)).toBe(rideFailure("awake", "awake", "settled"));
    // It had settled before the still began; or was woken under a settled one.
    const gone = standIn(["settled", "settled"]);
    expect(await stillInLook(gone.page, "awake", gone.take)).toBe(rideFailure("awake", "settled", "settled"));
    const woken = standIn(["settled", "awake"]);
    expect(await stillInLook(woken.page, "settled", woken.take)).toBe(rideFailure("settled", "settled", "awake"));
    // Out of a ride the page has no mark, which reads as "none".
    const out = standIn([undefined, undefined]);
    expect(await rideNow(out.page)).toBe("none");
    expect(await stillInLook(out.page, "awake", out.take)).toContain("none just before");
    // A still that needs no look is taken, and the page is not read for it.
    const plain = standIn([]);
    expect(await stillInLook(plain.page, undefined, plain.take)).toBe(null);
    expect(plain.did).toEqual(["still"]);
    // A press of a control in one look: the page's mark as it is made is that look, or the run fails.
    expect(await pressFailure(standIn(["settled"]).page, "settled")).toBe(null);
    for (const now of ["awake", undefined]) {
      expect(await pressFailure(standIn([now]).page, "settled")).toBe(`the press needs the ride settled, and the page had it ${now ?? "none"}`);
    }
  });

  it("wakes a settled ride with a pointer the page had not heard of, by the page's own rule for one: a first move only says where the pointer is", async () => {
    // A mouse as Playwright moves it: from where it was, in so many steps, each a move the window hears. And the page's own watch.
    const win = new EventTarget(), told: boolean[] = [], moves: number[][] = [];
    let at = [0, 0];
    const mouse = {
      move: async (x: number, y: number, { steps = 1 } = {}) => {
        const from = at;
        for (let i = 1; i <= steps; i++) {
          at = [from[0] + ((x - from[0]) * i) / steps, from[1] + ((y - from[1]) * i) / steps];
          moves.push(at);
          win.dispatchEvent(Object.assign(new Event("pointermove"), { pointerId: 1, pointerType: "mouse", screenX: at[0], screenY: at[1] }));
        }
      },
    };
    const stop = watchIdle(win, { ms: IDLE_S * 1000, settled: true, onChange: (settled) => told.push(settled) });
    await wakeByPointer({ viewportSize: () => ({ width: 1440, height: 900 }), mouse });
    stop();
    expect(told).toEqual([false]);
    // Over the world, clear of the plates in the page's corners: about the middle of the screen.
    for (const [x, y] of moves) {
      expect(x / 1440).toBeGreaterThan(0.4);
      expect(x / 1440).toBeLessThan(0.6);
      expect(y / 900).toBeGreaterThan(0.4);
      expect(y / 900).toBeLessThan(0.7);
    }
  });

  it("is what the shoot runs: each page's steps and each recording come from here, a ride page loads with its device's wait, and a still in the wrong look, a missing control or a state that never comes fails the run", () => {
    for (const name of Object.keys(pages)) expect(shoot, name).toContain(`RIDE_PAGES.${name}.steps`);
    for (const name of Object.keys(recordings)) expect(shoot, name).toContain(`RIDE_RECORDINGS.${name},`);
    expect(shoot).toContain("const RIDE_PAGES = ridePages(PLAY_WAIT_MS);");
    expect(shoot).toContain(`const PLAY_WAIT_MS = ${PLAY_WAIT_MS.toLocaleString("en-US").replace(",", "_")};`);
    expect(shoot).toContain("steps?.some((step) => step.ride) && !ownIdle ? rideIdle(device) : null");
    expect(shoot).toContain("await takeStill(page, file, step.ride,");
    expect(shoot).toContain("await takeStill(page, laterFile, step.later.ride,");
    // A still in the wrong look is a failure of the run, which the shoot's last lines throw for.
    expect(shoot).toContain("const failure = await stillInLook(page, need, () => page.screenshot(options));\n  if (!failure) return;\n  failures.push(`${file}: ${failure}`);");
    // So is a required step's control that is not on the page, and a state it waits for that never comes.
    expect(shoot).toContain("if (step.required) failures.push(`${device}-${step.shot}.png: ${selector} absent`);");
    expect(shoot).toContain("if (step.required) failures.push(`${device}-${step.shot}.png: never reached ${step.waitFor}`);");
    expect(shoot).toContain("if (step.wake) await wakeByPointer(page);");
    // A step for one kind of device is skipped on the other; a tap is a tap, on the control a click would press; and a press made
    // in the wrong look fails the run, before the press.
    expect(shoot).toContain("if (step.touch !== undefined && step.touch !== Boolean(options.hasTouch)) continue;");
    expect(shoot).toContain("const selector = step.click ?? step.tap ?? step.focus;");
    expect(shoot).toContain("else if (step.tap) await page.tap(selector);");
    expect(shoot).toContain("const pressedWrong = step.from ? await pressFailure(page, step.from) : null;\n        if (pressedWrong) failures.push(`${device}-${step.shot}.png: ${pressedWrong}`);\n        if (step.focus)");
    expect(shoot).toContain("FOCUS_STOPS.map((_, i) => ({ press: \"Tab\", shot: `fixed-focus-${i + 1}` }))");
    // The shelf's tab back, the one other step of a ride page, needs the ride awake too: the tab is there only while it is.
    expect(shoot).toContain('{ ...shelfStep("player", "out", "fixed-shelf-frame-back"), ride: "awake" }');
    // And no step of the shoot's own presses the ride's button, names its looks or sets its wait: they are all here.
    expect(shoot).not.toMatch(/data-action='ride'|data-ride=|idle=/);
  });

  it("walks the focus through the HUD's twelve stops, the ride's one button the fourth, with a still for each", () => {
    expect(FOCUS_STOPS).toHaveLength(12);
    expect(FOCUS_STOPS.indexOf("the ride's button")).toBe(3);
    expect(new Set(FOCUS_STOPS).size).toBe(12);
  });
});

describe("the shoot's recordings of the ride", () => {
  it("records the ride on the TV, with the bears on a desktop, on a straight stretch and on a phone, and as it settles and wakes, under the names the pull request's table gives", () => {
    expect(Object.fromEntries(Object.entries(recordings).map(([key, r]) => [key, `${r.device}-${r.name}.webm`]))).toEqual({
      tv: "tv-ride.webm", desktop: "desktop-ride.webm", straight: "desktop-ride-straight.webm", phone: "phone-ride.webm", settleWake: "desktop-ride-settle-wake.webm",
    });
  });

  it("fails the run where a recording's button is missing or its state never comes, and keeps a ride that is not about settling awake through its recording six times over", () => {
    for (const [key, r] of Object.entries(recordings)) {
      expect(r.required, key).toBe(true);
      expect(r.click.endsWith(RIDE), key).toBe(true);
      expect(r.waitFor, key).toMatch(/data-ride='(awake|settled)'|aria-pressed='true'/);
    }
    // Ten seconds of recording (shoot.mjs's RECORD_MS) under a wait of a minute.
    expect(shoot).toContain("const RECORD_MS = 10_000;");
    for (const key of ["desktop", "straight", "phone"]) {
      expect(new URL(recordings[key].path, "https://x").searchParams.get("idle"), key).toBe("60");
      expect(recordings[key].recordMs, key).toBeUndefined();
    }
    // The one that settles waits for the settled page and for the camera on the crane before the look that wakes it.
    expect(recordings.settleWake).toMatchObject({ waitFor: "main[data-ride='settled']", settled: true, keys: [["ArrowLeft", 600]] });
    expect(new URL(recordings.settleWake.path, "https://x").searchParams.get("idle")).toBe("3");
    expect(shoot).toContain("if (required) failures.push(`${file}: ${click} absent`);");
    expect(shoot).toContain("if (required) failures.push(`${file}: never reached ${waitFor}`);");
    expect(shoot).toContain("if (required) failures.push(`${file}: the camera never reached the crane`);");
  });
});
