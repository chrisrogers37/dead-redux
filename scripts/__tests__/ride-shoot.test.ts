import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorFailure, fileFailures, FOCUS_STOPS, movePointer, pressFailure, pressWorld, RIDE, RIDE_RECORDINGS, rideFailure, rideIdle, rideNow, ridePages, rideSteps, stillInLook } from "../../.github/screenshots/ride.mjs";
import { planFailures } from "../../.github/screenshots/shards.mjs";
import { IDLE_S, watchIdle } from "../../src/components/world/ride";

// The shoot's stills and recordings of the ride (.github/screenshots/ride.mjs). The ride changes look on a timer, so each of its
// stills depends on the look the page is in as it is taken. On CI's software renderer, where a still takes seconds, the first run of
// these steps found a page settled before the step that pressed its sleep timer: the control was gone, the step was skipped in
// silence, two stills were never taken, and the run was green. These tests hold every step to saying the look it needs and to
// failing the run where it cannot have it.

type Later = { ms: number; shot: string; ride?: string; cursor?: string };
type Step = {
  click?: string; tap?: string; focus?: string; press?: string; move?: boolean; world?: boolean; from?: string; cursor?: string; required?: boolean; waitFor?: string; waitMs?: number;
  player?: boolean; ride?: string; crane?: boolean;
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
const stills = (page: Page) => page.steps.flatMap((step) => [[step.shot, step.ride], ...(step.later ? [[step.later.shot, step.later.ride]] : [])]);

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
        devices: ["desktop", "desktop-reduced"],
        stills: [["fixed-newday-ride", "awake"], ["fixed-newday-ride-settled", "settled"], ["fixed-newday-ride-moved", "settled"], ["fixed-newday-ride-woken", "awake"], ["fixed-newday-tapped", "settled"]],
      },
      // The phone's, a page of its own: it has no pointer to move over the page.
      newdayTouch: { devices: ["phone"], stills: [["fixed-newday-ride", "awake"], ["fixed-newday-ride-settled", "settled"], ["fixed-newday-ride-woken", "awake"], ["fixed-newday-tapped", "settled"]] },
      sleep: { devices: ["desktop"], stills: [["fixed-sleep-ride", "awake"], ["fixed-sleep-30", "awake"], ["fixed-slept", "settled"], ["fixed-cursor-back", "settled"], ["fixed-key-woken", "awake"]] },
      lookup: { devices: ["desktop", "phone", "phone-360"], stills: [["fixed-lookup-failed-ride", "awake"], ["fixed-lookup-failed-ride-settled", "settled"]] },
      frame: { devices: ["phone", "phone-landscape"], stills: [["fixed-shelf-frame-ride", "awake"]] },
    });
  });

  // What SHOOT_PLAN=1 prints (shards.mjs): the files a shard saves, or the whole shoot.
  type Plan = { pages: { device: string; path: string; stills: string[] }[]; recordings: string[] };
  const planOf = (shard?: string): Plan => {
    const env: NodeJS.ProcessEnv = { ...process.env, SHOOT_PLAN: "1" };
    delete env.SHARD;
    delete env.SITE_URL;
    if (shard) env.SHARD = shard;
    const run = spawnSync(process.execPath, [".github/screenshots/shoot.mjs"], { cwd: join(__dirname, "../.."), env, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    return JSON.parse(run.stdout) as Plan;
  };
  // The devices that shoot every page, and the TV, which of those shoots the home page alone.
  const EVERY = ["desktop", "phone", "desktop-reduced", "phone-360"];
  const devicesOf = (name: string, page: Page) => page.devices ?? (name === "home" ? [...EVERY, "tv"] : EVERY);

  it("takes no still the shoot's plan does not name, and none the plan names is left to a step some device skips: every step of a page is taken on every device that shoots it", () => {
    // The run ends by holding what it saved to its plan, whose names come from each page's steps: a step for some devices alone
    // would leave the others a still the plan names and nobody took.
    for (const [name, page] of Object.entries(pages)) {
      for (const step of page.steps) expect(Object.keys(step).filter((key) => key === "touch" || key === "devices"), `${name}: ${step.shot}`).toEqual([]);
    }
    expect(shoot).not.toMatch(/step\.touch|step\.devices/);
    const whole = planOf(), named = whole.pages.flatMap((page) => page.stills);
    const mine = Object.entries(pages).flatMap(([name, page]) => devicesOf(name, page).flatMap((device) => stills(page).map(([shot]) => `${device}-${shot}.png`)));
    expect(new Set(mine).size).toBe(mine.length);
    // Sixteen on the desktop, and thirty-three on the other seven devices.
    expect(mine).toHaveLength(49);
    expect(mine.filter((file) => /^desktop-(?!reduced-|nowebgl-)/.test(file))).toHaveLength(16);
    for (const file of mine) expect(named, file).toContain(file);
    // And the recordings, under the names here.
    for (const r of Object.values(recordings)) expect(whole.recordings).toContain(`${r.device}-${r.name}.webm`);
  });

  it("shoots the desktop's ride pages with the pages that act, in the list's order, and every other device's with the rest, where the recordings are", () => {
    const acts = planOf("desktop-acts"), looks = planOf("desktop-looks"), rest = planOf("rest");
    const taking = (plan: Plan, file: string) => plan.pages.findIndex((page) => page.stills.includes(file));
    for (const [name, page] of Object.entries(pages)) {
      for (const device of devicesOf(name, page)) for (const [shot] of stills(page)) {
        const file = `${device}-${shot}.png`;
        expect([taking(acts, file) >= 0, taking(looks, file) >= 0, taking(rest, file) >= 0], file).toEqual([device === "desktop", false, device !== "desktop"]);
      }
    }
    // The pages that act keep their order, so each ride page finds what the pages before it left: the fixed day's show playing,
    // then the new day's, then the sleep timer's, whose page stops the show where the page after it joins.
    const order = ["desktop-ride.png", "desktop-fixed-ride.png", "desktop-fixed-newday-ride.png", "desktop-fixed-sleep-ride.png", "desktop-fixed-lookup-failed-ride.png"].map((file) => taking(acts, file));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(rest.recordings).toEqual(expect.arrayContaining(Object.values(recordings).map((r) => `${r.device}-${r.name}.webm`)));
    expect([acts.recordings, looks.recordings]).toEqual([[], []]);
  }, 20_000);

  it("uses the settled page as it is: a pointer's move shows the cursor and leaves the look, a press on the bare world wakes it, and the settled chip's link is followed at its first press, a tap's or a click's", () => {
    const LINK = "[data-action='play-next']";
    const [, , moved, woken, byMouse] = pages.newday.steps, [, , tapWoken, byTap] = pages.newdayTouch.steps;
    // With a mouse, the pointer moves over the settled page: the still is of the settled look, and the cursor is read as shown.
    expect(moved).toEqual({ move: true, cursor: "shown", ride: "settled", shot: "fixed-newday-ride-moved" });
    // A press on the bare world wakes it, on every device: the phone's page has the same step.
    expect(woken).toEqual({ world: true, waitFor: "main[data-ride='awake']", required: true, ride: "awake", shot: "fixed-newday-ride-woken" });
    expect(tapWoken).toEqual(woken);
    // The link is pressed in the settled look, which the press waits for, since the step before woke the page; and the run fails
    // unless the page is settled as the press is made and today's page arrives: no chip, and the show playing or paused.
    expect(byTap).toMatchObject({ tap: LINK, from: "settled", required: true, ride: "settled", waitMs: PLAY_WAIT_MS });
    expect(byMouse).toMatchObject({ click: LINK, from: "settled", required: true, ride: "settled", waitMs: PLAY_WAIT_MS });
    expect(byTap.waitFor).toBe(byMouse.waitFor);
    expect(byTap.waitFor).toContain("main:not(:has([data-next]))[data-state='playing']");
    expect([byTap.shot, byMouse.shot]).toEqual(["fixed-newday-tapped", "fixed-newday-tapped"]);
    // The phone's page is the phone's alone, and the shoot knows the phone for a touch screen; no other page taps.
    expect(pages.newdayTouch.devices).toEqual(["phone"]);
    expect(shoot).toMatch(/\n  phone: \{\n    viewport: \{ width: 390, height: 844 \},\n    deviceScaleFactor: 2,\n    isMobile: true,\n    hasTouch: true,\n  \},/);
    expect(Object.entries(pages).filter(([, page]) => page.steps.some((step) => step.tap)).map(([name]) => name)).toEqual(["newdayTouch"]);
  });

  it("brings the cursor back to a settled page that has slept, as the step it replaces did, by focus on the sleep timer and a key that only modifies another; then wakes the page with a letter that is no control's", () => {
    const SLEEP = "[data-action='sleep']";
    const [, timer, back, key] = pages.sleep.steps;
    // Thirty seconds of timer and two more: the show is paused, the ride has settled, and the cursor is hidden.
    expect(timer.later).toEqual({ ms: 32_000, shot: "fixed-slept", ride: "settled", cursor: "hidden" });
    // The settled look has the sleep timer, so the step finds it there: its look stays settled, and its cursor is read as shown.
    expect(back).toEqual({ focus: SLEEP, press: "ShiftLeft", required: true, cursor: "shown", ride: "settled", shot: "fixed-cursor-back" });
    expect(key).toEqual({ press: "KeyX", waitFor: "main[data-ride='awake']", required: true, ride: "awake", shot: "fixed-key-woken" });
  });

  it("has every step say the look its still needs, and none that can be skipped in silence: a control it presses is required, and so is a state it waits for", () => {
    for (const [name, page] of Object.entries(pages)) {
      for (const step of page.steps) {
        const where = `${name}: ${step.shot}`;
        expect(["awake", "settled"], where).toContain(step.ride);
        if (step.later) expect(["awake", "settled"], where).toContain(step.later.ride);
        // What a step does: a press on a control, a key, or the pointer's move; or nothing, for a still of the page left alone.
        // What a step does is one thing: a press on a control, a key, the pointer's move, a press on the world; or nothing, for a
        // still of the page left alone.
        expect([step.click, step.tap, step.press, step.move, step.world].filter(Boolean).length, where).toBeLessThanOrEqual(1);
        if (step.click || step.tap || step.focus || step.waitFor) expect(step.required, where).toBe(true);
        // A tap is of a control in one look: it says which.
        if (step.tap) expect(step.from, where).toBe("settled");
        // A still's name says its look: settled, slept, arrived, or settled with the cursor back; the others are awake.
        expect(step.ride, where).toBe(/-settled$|-tapped$|-moved$|^fixed-cursor-back$/.test(step.shot) ? "settled" : "awake");
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
    // A press of a control in one look waits for the page to come to it, since a step before may have woken it, and then the
    // page's mark is that look, or the run fails.
    const waits: unknown[][] = [];
    const waiting = (marks: (string | undefined)[], comes: boolean) => ({
      ...standIn(marks).page,
      waitForSelector: (...asked: unknown[]) => {
        waits.push(asked);
        return comes ? Promise.resolve() : Promise.reject(new Error("timed out"));
      },
    });
    expect(await pressFailure(waiting(["settled"], true), "settled")).toBe(null);
    expect(waits).toEqual([["main[data-ride='settled']", { timeout: 40_000 }]]);
    for (const now of ["awake", undefined]) {
      expect(await pressFailure(waiting([now], false), "settled")).toBe(`the press needs the ride settled, and the page had it ${now ?? "none"}`);
    }
    // That wait outlasts the longest wait to settle, with the slowest awake still before it.
    expect(40_000 / 1000).toBeGreaterThan(rideIdle("desktop") + 2 * SLOWEST_S.desktop);
  });

  it("gives a still one failure line, its first, which says why; and a still that was not taken for a reason said there is not listed again by the plan's check for being missing", () => {
    const failures: string[] = [], perFile = fileFailures(failures);
    // A look the step never came to, and then a still in the wrong one: the first says why.
    perFile.fail("desktop-fixed-ride.png", "never reached main[data-ride='awake']");
    perFile.fail("desktop-fixed-ride.png", rideFailure("awake", "settled", "settled")!);
    // A control that was not on the page: neither its still nor its later one was taken.
    perFile.fail("desktop-fixed-sleep-30.png", "[data-action='sleep'] absent, so the still was not taken", false);
    perFile.fail("desktop-fixed-slept.png", "[data-action='sleep'] absent, so the still was not taken", false);
    // Another still's failure is its own.
    perFile.fail("desktop-fixed-cursor-back.png", "the cursor should be shown, and it is hidden");
    // A file that failed first for something else, and is then known not to have been saved: one line still, and it is kept.
    perFile.fail("phone-fixed-ride.png", "the press needs the ride settled, and the page had it awake");
    perFile.fail("phone-fixed-ride.png", "[data-action='ride'] absent, so the still was not taken", false);
    expect(failures).toEqual([
      "desktop-fixed-ride.png: never reached main[data-ride='awake']",
      "desktop-fixed-sleep-30.png: [data-action='sleep'] absent, so the still was not taken",
      "desktop-fixed-slept.png: [data-action='sleep'] absent, so the still was not taken",
      "desktop-fixed-cursor-back.png: the cursor should be shown, and it is hidden",
      "phone-fixed-ride.png: the press needs the ride settled, and the page had it awake",
    ]);
    expect([...perFile.untaken]).toEqual(["desktop-fixed-sleep-30.png", "desktop-fixed-slept.png", "phone-fixed-ride.png"]);
    // The plan's check, for a run that saved the other three stills of that page: nothing more of the two that have said why,
    // and its own line for one that is missing without a word.
    const files = { pages: [{ device: "desktop", path: "/2026-10-20?sleep=seconds", stills: ["desktop-fixed-sleep-ride.png", "desktop-fixed-sleep-30.png", "desktop-fixed-slept.png", "desktop-fixed-cursor-back.png", "desktop-fixed-key-woken.png"] }], recordings: ["tv-ride.webm"], assets: [] };
    const saved = ["desktop-fixed-sleep-ride.png", "desktop-fixed-cursor-back.png", "tv-ride.webm"];
    expect(planFailures(files, saved, perFile.untaken)).toEqual(["desktop-fixed-key-woken.png: the plan names this still, of desktop /2026-10-20?sleep=seconds, and it was not saved"]);
    expect(planFailures(files, saved)).toHaveLength(3);
    // A recording too; and a file that was saved though it said it was not is still held to the plan's names.
    expect(planFailures(files, saved.slice(0, 2), ["tv-ride.webm"])).toEqual(["desktop-fixed-sleep-30.png: the plan names this still, of desktop /2026-10-20?sleep=seconds, and it was not saved", "desktop-fixed-slept.png: the plan names this still, of desktop /2026-10-20?sleep=seconds, and it was not saved", "desktop-fixed-key-woken.png: the plan names this still, of desktop /2026-10-20?sleep=seconds, and it was not saved"]);
    expect(planFailures(files, [...saved, "desktop-other.png"], ["desktop-other.png"])).toContain("desktop-other.png: saved, and the plan does not name it");
  });

  it("reads the cursor from the class the page hides it under, and says where it is not as the step needs it", async () => {
    const withCursor = (off: boolean) => {
      vi.stubGlobal("document", { documentElement: { classList: { contains: (name: string) => name === "cursor-off" && off } } });
      return { evaluate: async (run: () => unknown) => run() };
    };
    expect(await cursorFailure(withCursor(false), "shown")).toBe(null);
    expect(await cursorFailure(withCursor(true), "hidden")).toBe(null);
    expect(await cursorFailure(withCursor(true), "shown")).toBe("the cursor should be shown, and it is hidden");
    expect(await cursorFailure(withCursor(false), "hidden")).toBe("the cursor should be hidden, and it is shown");
  });

  // A mouse as Playwright moves it, from where it was, in so many steps, each a move the window hears; its click, a press and a
  // lift where it is; and a touch screen's tap, a press and a lift at a place. And the page's own watch, on a settled page.
  function settledWatch() {
    const win = new EventTarget(), told: boolean[] = [], places: number[][] = [];
    let at = [0, 0], stirred = 0;
    const hear = (type: string, pointerType: string, [screenX, screenY]: number[]) => {
      places.push([screenX, screenY]);
      const event = Object.assign(new Event(type), { pointerId: 1, pointerType, button: 0, screenX, screenY });
      Object.defineProperty(event, "target", { value: { name: "the world" } });
      win.dispatchEvent(event);
    };
    const mouse = {
      move: async (x: number, y: number, { steps = 1 } = {}) => {
        const from = at;
        for (let i = 1; i <= steps; i++) {
          at = [from[0] + ((x - from[0]) * i) / steps, from[1] + ((y - from[1]) * i) / steps];
          hear("pointermove", "mouse", at);
        }
      },
      click: async (x: number, y: number) => {
        await mouse.move(x, y);
        hear("pointerdown", "mouse", at);
        hear("pointerup", "mouse", at);
      },
    };
    const touchscreen = {
      tap: async (x: number, y: number) => {
        hear("pointerdown", "touch", [x, y]);
        hear("pointerup", "touch", [x, y]);
      },
    };
    const stop = watchIdle(win, { ms: IDLE_S * 1000, settled: true, control: () => false, onStir: () => { stirred += 1; }, onChange: (settled) => told.push(settled) });
    return { page: { viewportSize: () => ({ width: 1440, height: 900 }), mouse, touchscreen }, told, places, stirs: () => stirred, stop };
  }
  // Over the world, clear of the plates in the page's corners: about the middle of the screen.
  const overWorld = (places: number[][]) => {
    for (const [x, y] of places) {
      expect(x / 1440).toBeGreaterThan(0.4);
      expect(x / 1440).toBeLessThan(0.6);
      expect(y / 900).toBeGreaterThan(0.4);
      expect(y / 900).toBeLessThan(0.7);
    }
  };

  it("moves the pointer over a settled page by the page's own rule for one: the first move only says where the pointer is, the next show the cursor, and none wakes the page", async () => {
    const { page, told, places, stirs, stop } = settledWatch();
    await movePointer(page);
    stop();
    expect(told).toEqual([]);
    expect(stirs()).toBeGreaterThan(0);
    expect(places.length).toBeGreaterThan(1);
    overWorld(places);
  });

  it("wakes a settled page by a press on the bare world: a tap where the device has a touch screen, else a mouse's click, whose way there wakes nothing", async () => {
    for (const touch of [true, false]) {
      const { page, told, places, stop } = settledWatch();
      await pressWorld(page, touch);
      stop();
      expect(told, String(touch)).toEqual([false]);
      // A tap is a press and a lift at one place; a click, the pointer's move there first.
      expect(places.length, String(touch)).toBe(touch ? 2 : 3);
      overWorld(places.slice(touch ? 0 : 1));
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
    // A still in the wrong look is a failure of the run, which the shoot's last lines throw for: one line for the still.
    expect(shoot).toContain("const perFile = fileFailures(failures);");
    expect(shoot).toContain("const failure = await stillInLook(page, need, () => page.screenshot(options));\n  if (!failure) return;\n  perFile.fail(file, failure);");
    // So is a step's control that is not on the page, for the still it would have taken and for its later one, neither of them
    // taken; and a state a required step waits for that never comes.
    expect(shoot).toContain("for (const shot of [step.shot, step.later?.shot].filter(Boolean)) perFile.fail(`${device}-${shot}.png`, `${selector} absent, so the still was not taken`, false);\n          console.log(`${step.shot}: ${selector} absent`);\n          continue;");
    expect(shoot).toContain("if (step.required) perFile.fail(`${device}-${step.shot}.png`, `never reached ${step.waitFor}`);");
    // The stills that were not taken have said why, and the plan's check at the run's end does not list them again.
    expect(shoot).toContain("failures.push(...planFailures(planFiles(plan), await writtenSince(outDir, began), perFile.untaken));");
    expect(shoot).toContain("if (step.move) await movePointer(page);");
    expect(shoot).toContain("if (step.world) await pressWorld(page, Boolean(options.hasTouch));");
    // A cursor that is not as a step needs it is a failure too, read once the step has acted, and before a later still.
    expect(shoot).toContain("const cursorWrong = step.cursor ? await cursorFailure(page, step.cursor) : null;\n        if (cursorWrong) perFile.fail(`${device}-${step.shot}.png`, cursorWrong);\n        if (step.near === undefined) await page.waitForTimeout(STEP_SETTLE_MS);");
    expect(shoot).toContain("const laterCursorWrong = step.later.cursor ? await cursorFailure(page, step.later.cursor) : null;\n          if (laterCursorWrong) perFile.fail(laterFile, laterCursorWrong);\n          await takeStill(page, laterFile, step.later.ride,");
    // A tap is a tap, on the control a click would press; and a press made in the wrong look fails the run, before the press.
    expect(shoot).toContain("const selector = step.click ?? step.tap ?? step.focus;");
    expect(shoot).toContain("else if (step.tap) await page.tap(selector);");
    expect(shoot).toContain("const pressedWrong = step.from ? await pressFailure(page, step.from) : null;\n        if (pressedWrong) perFile.fail(`${device}-${step.shot}.png`, pressedWrong);\n        if (step.focus)");
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
    expect(shoot).toContain("perFile.fail(file, `${click} absent, so nothing was recorded`, false);");
    expect(shoot).toContain("if (required) perFile.fail(file, `never reached ${waitFor}`);");
    expect(shoot).toContain('if (required) perFile.fail(file, "the camera never reached the crane");');
  });
});
