import { spawnSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EASE_MS, RECORDINGS } from "../../.github/screenshots/recordings.mjs";
import { awakeHolds, cursorFailure, cursorNow, fileFailures, FOCUS_STOPS, HOLD, keyHold, movePointer, pressFailure, pressWorld, RIDE, rideFailure, rideIdle, rideNow, ridePages, rideSteps, stillInLook } from "../../.github/screenshots/ride.mjs";
import { planFailures } from "../../.github/screenshots/shards.mjs";
import { IDLE_S, watchIdle } from "../../src/components/world/ride";

// The shoot's stills of the ride (.github/screenshots/ride.mjs); its recordings are in the shoot's list of them, which
// shoot-recordings.test.ts holds. The ride changes look on a timer, so each of its
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

// How long a step that starts a show waits for it (shoot.mjs's PLAY_WAIT_MS), which the new day's last step waits too.
const PLAY_WAIT_MS = 45_000;
const pages = ridePages(PLAY_WAIT_MS) as Record<string, Page>;
// The ride's recordings, by their names.
const recordings = (RECORDINGS as { device: string; name: string }[]).filter(({ name }) => /^ride(-|$)/.test(name));
const shoot = readFileSync(join(__dirname, "../../.github/screenshots/shoot.mjs"), "utf8");
// A page's stills, each with the look it needs: a step's own, and a later one's after it.
const stills = (page: Page) => page.steps.flatMap((step) => [[step.shot, step.ride], ...(step.later ? [[step.later.shot, step.later.ride]] : [])]);

// The waits before a ride settles are sized in frames of CI's software renderer, since what the shoot does after a step's act is
// so many of them. The slowest frame in CI's logs of 2026-11-22, 23 and 26, by device: a desktop's 0.78 s, the TV's 0.25 s and a
// phone's 0.07 s; a page with reduced motion or without WebGL draws none of its own. The shoot is sized for a runner 2.6 times
// slower than that, a desktop's frame at 2 s, the figure the recordings' holds are reckoned at (FRAME_MS in recordings.mjs).
const SLOWEST_FRAME_S: Record<string, number> = { desktop: 0.78, tv: 0.25, phone: 0.07, "phone-360": 0.07, "phone-landscape": 0.07 };
const SLOWER = 2 / 0.78;
// Between a step's act and HOLD's press: the act's own end and the key's, three frames at most. A local run at 0.7 s a frame took
// 2.1 s from the ride's press to the key's, and 0.7 s from a press on the world.
const ACT_TO_HOLD_FRAMES = 3;
// The frame page's steps as the shoot has them (shoot.mjs): the shelf's tab away, the ride's, and the tab back while the ride is awake.
const FRAME_BACK = '{ ...shelfStep("player", "out", "fixed-shelf-frame-back"), from: "awake", ride: "awake" }';
const frameSteps = (): Step[] => [
  { click: "[data-shelf-tab='player']", required: true, shot: "fixed-shelf-frame" },
  ...pages.frame.steps,
  { click: "[data-shelf-tab='player']", required: true, from: "awake", ride: "awake", shot: "fixed-shelf-frame-back" },
];

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
    expect(recordings).toHaveLength(5);
    for (const r of recordings) expect(whole.recordings).toContain(`${r.device}-${r.name}.webm`);
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
    expect(rest.recordings).toEqual(expect.arrayContaining(recordings.map((r) => `${r.device}-${r.name}.webm`)));
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
        // A tap is of a control in one look: it says which. A press that says its look says one of the two.
        if (step.tap) expect(step.from, where).toBe("settled");
        if (step.from) expect(["awake", "settled"], where).toContain(step.from);
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
    // A still whose camera never reaches the crane fails the run, by the wait a recording of the ease has: it is not shot as if it had.
    expect(shoot).toContain("{ timeout: EASE_MS })\n            .catch(() => {\n              console.log(`${step.shot}: the camera had not reached the crane`);\n              perFile.fail(`${device}-${step.shot}.png`, `the camera had not reached the crane ${EASE_MS} ms after the page settled`);");
    expect(EASE_MS).toBe(120_000);
    // A settled still's wait is over twice the longest wait to settle, which runs from HOLD's letting go just after the awake still
    // before it.
    expect(settled.waitMs! / 1000).toBeGreaterThan(2 * rideIdle("desktop"));
  });

  it("keeps the waits before a ride settles, a desktop's and a TV's and the others', each over what is left of an awake step once it has acted: its act's end and HOLD's press, on a runner 2.6 times slower than CI's slowest", () => {
    expect([rideIdle("desktop"), rideIdle("tv")]).toEqual([15, 15]);
    const others = ["phone", "phone-360", "phone-landscape", "desktop-reduced", "desktop-nowebgl", "phone-nowebgl"];
    for (const device of others) expect(rideIdle(device), device).toBe(6);
    for (const device of ["desktop", "tv", ...others]) expect(rideIdle(device), device).toBeGreaterThan(ACT_TO_HOLD_FRAMES * (SLOWEST_FRAME_S[device] ?? 0) * SLOWER);
    // The sleep timer's later still, 30 s of timer after its press, is of a page that has settled: its wait, from HOLD's letting go
    // just after the still before it, is past both the timer and the desktop's wait to settle.
    const later = pages.sleep.steps.find((step) => step.later)!.later!;
    expect(later.ms).toBeGreaterThan(30_000);
    expect(later.ms / 1000).toBeGreaterThan(rideIdle("desktop"));
    // One page keeps the page's own ten seconds: the phones' shelf, whose steps CI took 2.8 s apiece.
    expect(Object.entries(pages).filter(([, page]) => page.ownIdle).map(([name]) => name)).toEqual(["frame"]);
  });

  it("takes each still that needs the ride awake with HOLD down from its step's act, and makes a press on a control of the awake look with it still down", () => {
    // On CI's renderer of 2026-11-26 a desktop took some 15 s from the ride's press to the end of its still, of a wait of 15, and
    // the sleep timer's press came after the wait was over: the page had settled, and its still was of the settled look.
    expect(HOLD).toBe("ShiftRight");
    const all: [string, Step[]][] = [...Object.entries(pages).map(([name, page]) => [name, page.steps] as [string, Step[]]), ["frame, as the shoot has it", frameSteps()]];
    for (const [name, steps] of all) {
      const holds = awakeHolds(steps);
      steps.forEach((step, i) => {
        const where = `${name}: ${step.shot}`;
        // Held from the act of each step whose still needs the ride awake, and of no other.
        expect(holds[i].hold, where).toBe(step.ride === "awake");
        // Let go once each still has been read back, but where the next step's press needs the ride awake.
        expect(holds[i].letGo, where).toBe(steps[i + 1]?.from !== "awake");
        // A press made with HOLD down is a click on a control of the awake look, which Shift does not change; it follows a still
        // taken with HOLD down that has no later still, since a later one waits with nothing held. No key is pressed with it down.
        if (step.from === "awake") {
          expect(step.click, where).toBeTruthy();
          expect(step.press, where).toBeUndefined();
          expect(holds[i - 1], where).toEqual({ hold: true, letGo: false });
          expect(steps[i - 1].later, where).toBeUndefined();
        }
        // A later still is taken with HOLD let go, so none needs the ride awake.
        if (step.later) expect(step.later.ride, where).toBe("settled");
      });
    }
    // The sleep timer's page: the ride's press and its still, the timer's press and its still with HOLD still down, let go before
    // the later still; nothing held for the cursor; and the letter's press and its still.
    expect(awakeHolds(pages.sleep.steps)).toEqual([{ hold: true, letGo: false }, { hold: true, letGo: true }, { hold: false, letGo: true }, { hold: true, letGo: true }]);
    expect(pages.sleep.steps[1]).toMatchObject({ click: "[data-action='sleep']", from: "awake", ride: "awake", shot: "fixed-sleep-30" });
    expect(awakeHolds(frameSteps())).toEqual([{ hold: false, letGo: true }, { hold: true, letGo: false }, { hold: true, letGo: true }]);
    expect(shoot).toContain(`steps: [shelfStep("player", "in", "fixed-shelf-frame"), ...RIDE_PAGES.frame.steps, ${FRAME_BACK}],`);
    // The shoot does as keyHold says (below): HOLD down straight after the act, before any wait; and let go once the still is read
    // back, before the reads of the page after it, where a step is skipped without a still, and at the end of the page's steps.
    expect(shoot).toContain("const hold = keyHold(page, steps ?? []);");
    const down = shoot.indexOf("await hold.acted(n);");
    expect(down).toBeGreaterThan(shoot.indexOf("if (step.world) await pressWorld(page, Boolean(options.hasTouch));"));
    expect(down).toBeLessThan(shoot.indexOf("if (step.near !== undefined) {\n          const from"));
    expect(shoot).toContain("${rideNote(step.ride, wrongLook, hold.held())}`);\n        await hold.after(n);\n        const stats = await logStats(page, file);");
    expect(shoot).toContain("console.log(`${step.shot}: no still, the world is not drawing`);\n            await hold.after(n);\n            continue;");
    expect(shoot).toContain("      }\n      await hold.done();\n      // The view and the shelves");
    expect(shoot.match(/await hold\.after\(n\);/g)).toHaveLength(3);
    // Nothing else in the shoot presses or lets go of it.
    expect(shoot).not.toMatch(/keyboard\.(down|up)\(/);
    // What Shift is to the world: the run of a walk, which alone is no control (input.js), and no control held, so a world under
    // reduced motion draws no frame for it; it is read nowhere but in a walk's pace (main.js). To the page it is a key that only
    // modifies another (ride.ts), and nothing in the page or the world reads a press's shiftKey: neither of the two presses made with
    // HOLD down, the sleep timer's button and the shelf's tab, both buttons, does anything else for it.
    const world = (file: string) => readFileSync(join(__dirname, "../../public/world", file), "utf8");
    expect(world("input.js")).toContain('ShiftLeft: "run", ShiftRight: "run"');
    expect(world("input.js")).toContain('if (k !== "run") userInput(k);');
    expect(world("main.js")).toMatch(/const held = \(\) => keys\.fwd \|\| [^;]*stick\.turn !== 0;/);
    expect(world("main.js").match(/const held = \(\) => [^;]*;/)![0]).not.toContain("keys.run");
    expect(world("main.js").match(/keys\.run/g)).toEqual(["keys.run"]);
    expect(world("main.js")).toContain("const pace = 12 * (keys.run ? 1.6 : 1) * dt;");
    const sources = [
      ...readdirSync(join(__dirname, "../../src"), { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__")).map((f) => join("src", f)),
      ...readdirSync(join(__dirname, "../../public/world")).filter((f) => f.endsWith(".js")).map((f) => join("public/world", f)),
    ];
    expect(sources.length).toBeGreaterThan(40);
    for (const file of sources) expect(readFileSync(join(__dirname, "../..", file), "utf8"), file).not.toMatch(/shiftKey/);
    expect(pages.sleep.steps[1].click).toBe("[data-action='sleep']");
    // And the step's line of the log says the look either side and the key held: a still in the wrong look has its own line.
    expect(shoot).toContain("const rideNote = (need, failure, held) => `${need && !failure ? `  ride ${need} either side` : \"\"}${held ? `  ${HOLD} held` : \"\"}`;");
  });

  it("keeps an awake page awake under HOLD however long it is down, and the page settles its whole wait after HOLD is let go (watchIdle in ride.ts)", () => {
    // A settled page is left as it is under HOLD: Shift is a key that only modifies another, which src/lib/__tests__/ride.test.ts
    // holds the page to, the right one with the left.
    vi.useFakeTimers();
    try {
      const MS = rideIdle("desktop") * 1000, win = new EventTarget(), told: boolean[] = [];
      const stop = watchIdle(win, { ms: MS, settled: false, onChange: (settled) => told.push(settled) });
      const key = (type: string) => win.dispatchEvent(Object.assign(new Event(type), { code: HOLD, key: "Shift" }));
      key("keydown");
      vi.advanceTimersByTime(10 * MS);
      expect(told).toEqual([]);
      key("keyup");
      vi.advanceTimersByTime(MS - 1);
      expect(told).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told).toEqual([true]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  // A page's steps as the shoot's loop goes through them (shoot.mjs), with keyHold on a page that only records the key's presses and
  // lettings go: each step is skipped (`skip`), or acts, takes its still, and then its later one. What is seen is each press a step
  // makes, each still and each cursor read, with whether HOLD was down at it.
  async function throughSteps(steps: Step[], skip = -1) {
    const calls: string[] = [], seen: string[] = [];
    const hold = keyHold({ keyboard: { down: async (key: string) => void calls.push(`down ${key}`), up: async (key: string) => void calls.push(`up ${key}`) } }, steps);
    for (const [n, step] of steps.entries()) {
      if (n === skip) {
        await hold.after(n);
        continue;
      }
      if (step.click || step.tap || step.press || step.move || step.world) seen.push(`press ${step.shot} ${hold.held()}`);
      await hold.acted(n);
      if (step.cursor) seen.push(`cursor ${step.shot} ${hold.held()}`);
      seen.push(`still ${step.shot} ${hold.held()}`);
      await hold.after(n);
      if (step.later?.cursor) seen.push(`cursor ${step.later.shot} ${hold.held()}`);
      if (step.later) seen.push(`still ${step.later.shot} ${hold.held()}`);
    }
    await hold.done();
    return { calls, seen, held: hold.held() };
  }

  it("lets HOLD go on every way out of a step, so no later still, cursor, key or page after has it down: a still taken, a step skipped, and the page's end", async () => {
    // The sleep timer's page: down for the ride's still and on through the timer's press and still, up before the later still and
    // the cursor's step, and down again for the letter's still.
    const sleep = await throughSteps(pages.sleep.steps);
    expect(sleep.calls).toEqual([`down ${HOLD}`, `up ${HOLD}`, `down ${HOLD}`, `up ${HOLD}`]);
    expect(sleep.seen).toEqual([
      "press fixed-sleep-ride false", "still fixed-sleep-ride true",
      "press fixed-sleep-30 true", "still fixed-sleep-30 true", "cursor fixed-slept false", "still fixed-slept false",
      "press fixed-cursor-back false", "cursor fixed-cursor-back false", "still fixed-cursor-back false",
      "press fixed-key-woken false", "still fixed-key-woken true",
    ]);
    const all: [string, Step[]][] = [...Object.entries(pages).map(([name, page]) => [name, page.steps] as [string, Step[]]), ["frame, as the shoot has it", frameSteps()]];
    for (const [name, steps] of all) {
      // Every step taken, and then each one skipped in turn.
      for (let skip = -1; skip < steps.length; skip++) {
        const { calls, seen, held } = await throughSteps(steps, skip);
        const where = `${name}, skipping ${skip}`;
        // Up at the end, as often let go as pressed, and never pressed while down.
        expect(held, where).toBe(false);
        expect(calls.filter((call) => call.startsWith("down")).length, where).toBe(calls.filter((call) => call.startsWith("up")).length);
        calls.forEach((call, i) => expect(call, where).toBe(`${i % 2 === 0 ? "down" : "up"} ${HOLD}`));
        // Each still that needs the ride awake has it down; no still that needs it settled, no later still and no cursor's reading.
        for (const step of steps) {
          if (seen.includes(`still ${step.shot} ${step.ride !== "awake"}`)) throw new Error(`${where}: ${step.shot} taken with HOLD ${step.ride === "awake" ? "up" : "down"}`);
          if (step.later) expect(seen, where).not.toContain(`still ${step.later.shot} true`);
          expect(seen.filter((one) => one.startsWith(`cursor ${step.shot} true`) || one.startsWith(`cursor ${step.later?.shot} true`)), where).toEqual([]);
          // A press with it down is one that needs the ride awake; no key's press, a pointer's move or a press on the world.
          if (step.press || step.move || step.world) expect(seen, where).not.toContain(`press ${step.shot} true`);
          if (seen.includes(`press ${step.shot} true`)) expect(step.from, where).toBe("awake");
        }
      }
    }
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
    // That wait is over twice the longest wait to settle, which runs from HOLD's letting go after the awake still before the press.
    expect(40_000 / 1000).toBeGreaterThan(2 * rideIdle("desktop"));
    // Only input wakes a page, so a press of a control of the awake look waits for nothing: the page is awake as it is made, or the
    // run fails.
    waits.length = 0;
    expect(await pressFailure(waiting(["awake"], true), "awake")).toBe(null);
    expect(await pressFailure(waiting(["settled"], true), "awake")).toBe("the press needs the ride awake, and the page had it settled");
    expect(waits).toEqual([]);
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
    expect(await cursorNow(withCursor(false))).toBe("shown");
    expect(await cursorNow(withCursor(true))).toBe("hidden");
    expect(cursorFailure("shown", "shown")).toBe(null);
    expect(cursorFailure("hidden", "hidden")).toBe(null);
    expect(cursorFailure("shown", "hidden")).toBe("the cursor should be shown, and it is hidden");
    expect(cursorFailure("hidden", "shown")).toBe("the cursor should be hidden, and it is shown");
  });

  it("reads the cursor straight after a step has acted, before its second of settling and its still, says the reading in the step's own line, and fails the run where it is wrong: the two stills of a cursor a settled page shows, and the one of a cursor it hides", () => {
    // A settled page shows its cursor for three seconds. On CI the line the shoot logs of the page after a still read "hidden" for
    // desktop-fixed-newday-ride-moved, a second after a still that itself takes seconds: the reading that counts is the one
    // made as the pointer has moved, or as the key has been pressed.
    const steps = Object.values(pages).flatMap((page) => page.steps);
    expect(steps.filter((step) => step.cursor).map((step) => [step.shot, step.cursor, step.ride])).toEqual([
      ["fixed-newday-ride-moved", "shown", "settled"],
      ["fixed-cursor-back", "shown", "settled"],
    ]);
    expect(steps.filter((step) => step.later?.cursor).map((step) => [step.later!.shot, step.later!.cursor])).toEqual([["fixed-slept", "hidden"]]);
    // Neither of the two waits for anything between its act and the reading: no state, no crane, no show.
    for (const step of steps.filter((one) => one.cursor)) expect([step.waitFor, step.crane, step.player], step.shot).toEqual([undefined, undefined, undefined]);
    const read = shoot.indexOf("const cursorRead = step.cursor ? await cursorNow(page) : null;");
    expect(read).toBeGreaterThan(shoot.indexOf("if (step.move) await movePointer(page);"));
    expect(shoot).toContain(
      "const cursorRead = step.cursor ? await cursorNow(page) : null;\n        const cursorWrong = step.cursor ? cursorFailure(step.cursor, cursorRead) : null;\n        if (cursorWrong) perFile.fail(`${device}-${step.shot}.png`, cursorWrong);\n        if (step.near === undefined) await page.waitForTimeout(STEP_SETTLE_MS);\n        const file = `${device}-${step.shot}.png`;\n        const wrongLook = await takeStill(page, file, step.ride,",
    );
    expect(shoot).toContain('`waited for ${step.waitFor}`)}${cursorRead ? `  cursor ${cursorRead} as the step acted` : ""}${rideNote(step.ride, wrongLook, hold.held())}`);');
    // The later still's, read just before it.
    expect(shoot).toContain(
      "const laterCursorRead = step.later.cursor ? await cursorNow(page) : null;\n          const laterCursorWrong = step.later.cursor ? cursorFailure(step.later.cursor, laterCursorRead) : null;\n          if (laterCursorWrong) perFile.fail(laterFile, laterCursorWrong);\n          const laterWrongLook = await takeStill(page, laterFile, step.later.ride,",
    );
    expect(shoot).toContain('console.log(`${laterFile}  ${url}  ${selector}${laterCursorRead ? `  cursor ${laterCursorRead} before the still` : ""}${rideNote(step.later.ride, laterWrongLook, hold.held())}`);');
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

  it("is what the shoot runs: each page's steps come from here, a ride page loads with its device's wait, and a still in the wrong look, a missing control or a state that never comes fails the run", () => {
    for (const name of Object.keys(pages)) expect(shoot, name).toContain(`RIDE_PAGES.${name}.steps`);
    expect(shoot).toContain("const RIDE_PAGES = ridePages(PLAY_WAIT_MS);");
    expect(shoot).toContain(`const PLAY_WAIT_MS = ${PLAY_WAIT_MS.toLocaleString("en-US").replace(",", "_")};`);
    expect(shoot).toContain("steps?.some((step) => step.ride) && !ownIdle ? rideIdle(device) : null");
    expect(shoot).toContain("await takeStill(page, file, step.ride,");
    expect(shoot).toContain("await takeStill(page, laterFile, step.later.ride,");
    // A still in the wrong look is a failure of the run, which the shoot's last lines throw for: one line for the still.
    expect(shoot).toContain("const perFile = fileFailures(failures);");
    expect(shoot).toContain("const failure = await stillInLook(page, need, () => page.screenshot(options));\n  if (!failure) return null;\n  perFile.fail(file, failure);");
    // So is a step's control that is not on the page, for the still it would have taken and for its later one, neither of them
    // taken; and a state a required step waits for that never comes.
    expect(shoot).toContain("for (const shot of [step.shot, step.later?.shot].filter(Boolean)) perFile.fail(`${device}-${shot}.png`, `${selector} absent, so the still was not taken`, false);\n          console.log(`${step.shot}: ${selector} absent`);\n          await hold.after(n);\n          continue;");
    expect(shoot).toContain("if (step.required) perFile.fail(`${device}-${step.shot}.png`, `never reached ${step.waitFor}`);");
    // The stills that were not taken have said why, and the plan's check at the run's end does not list them again.
    expect(shoot).toContain("failures.push(...planFailures(planFiles(plan), await writtenSince(outDir, began), perFile.untaken));");
    expect(shoot).toContain("if (step.move) await movePointer(page);");
    expect(shoot).toContain("if (step.world) await pressWorld(page, Boolean(options.hasTouch));");
    // A tap is a tap, on the control a click would press; and a press made in the wrong look fails the run, before the press.
    expect(shoot).toContain("const selector = step.click ?? step.tap ?? step.focus;");
    expect(shoot).toContain("else if (step.tap) await page.tap(selector);");
    expect(shoot).toContain("const pressedWrong = step.from ? await pressFailure(page, step.from) : null;\n        if (pressedWrong) perFile.fail(`${device}-${step.shot}.png`, pressedWrong);\n        if (step.focus)");
    expect(shoot).toContain("FOCUS_STOPS.map((_, i) => ({ press: \"Tab\", shot: `fixed-focus-${i + 1}` }))");
    // The shelf's tab back, the one other step of a ride page, needs the ride awake too: the tab is there only while it is, so it
    // is pressed with the ride's key still held.
    expect(shoot).toContain(FRAME_BACK);
    // And no step of the shoot's own presses the ride's button, names its looks or sets its wait: they are all here.
    expect(shoot).not.toMatch(/data-action='ride'|data-ride=|idle=/);
  });

  it("walks the focus through the HUD's twelve stops, the ride's one button the fourth, with a still for each", () => {
    expect(FOCUS_STOPS).toHaveLength(12);
    expect(FOCUS_STOPS.indexOf("the ride's button")).toBe(3);
    expect(new Set(FOCUS_STOPS).size).toBe(12);
  });
});
