import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCarry, readCarry, writeCarry } from "../../components/world/carry";
import { CLICK_WAIT_MS, controlKey, CONTROLS, createRide, eachSecond, IDLE_S, idleMs, RIDE_NAME, sleepAfterPress, sleepLabel, sleepLeft, sleepUnitMs, TIMEOUT_MAX_MS, watchIdle } from "../../components/world/ride";
import { WorldHome } from "../../components/world/WorldHome";
import type { ShowSummary } from "../types";

// The ride is the page's one way to be carried along the setlist with the bears (src/components/world/ride.ts). Node has no page, so
// the window and the document are stand-ins that take listeners, and the clock is vitest's.

const ROOT = join(__dirname, "../../..");
// Every file under a folder, by its path from the repo's root.
const files = (folder: string): string[] =>
  readdirSync(join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)]));
// What the site is made of, the tests apart: the page's code and styles, and the world's modules.
const SOURCE = [...files("src"), ...files("public/world")].filter((file) => /\.(ts|tsx|js|css)$/.test(file) && !file.includes("__tests__"));
const text = (file: string) => readFileSync(join(ROOT, file), "utf8");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("the ride's name", () => {
  it("is said once in the code, in ride.ts, so that another name is a change to one line", () => {
    const said = SOURCE.filter((file) => text(file).includes(RIDE_NAME));
    expect(said).toEqual(["src/components/world/ride.ts"]);
    expect(count(text(said[0]), RIDE_NAME)).toBe(1);
    expect(RIDE_NAME).toBe("Ride with the bears");
  });

  it("is what the README's table of keys calls it, with both its keys and the one that leaves it", () => {
    expect(text("README.md")).toContain(`| ${RIDE_NAME} | B or F; Esc leaves it |`);
  });

  it("has taken the place of both the names it replaces, in the code, the styles, the shoot, the README and CLAUDE.md", () => {
    const old = /lean.?back|walk with the bears/i;
    // The shoot's own scripts, not what is installed beside them.
    const shoot = readdirSync(join(ROOT, ".github/screenshots")).filter((file) => file.endsWith(".mjs")).map((file) => join(".github/screenshots", file));
    expect(shoot).toContain(".github/screenshots/shoot.mjs");
    expect([...SOURCE, ...shoot, "README.md", "CLAUDE.md"].filter((file) => old.test(text(file)))).toEqual([]);
  });

  it("is on the one button the page has for it, as its label, its tooltip and its text, with the paw; the button is not pressed until the visitor rides", () => {
    const show: ShowSummary = { date: "1977-05-08", venue: "Barton Hall, Cornell University", location: "Ithaca, NY, USA", avgRating: 9, sourceCount: 1, hasSoundboard: true };
    const html = renderToStaticMarkup(
      createElement(WorldHome, {
        show, featuredDate: "2026-02-16", today: "2026-02-16", renderedAt: 0, pastPick: null, bestSource: null, isToday: true, tourName: null,
        testHooks: false, lookupFailed: false, shelves: "",
      }),
    );
    const buttons = html.match(/<button[^>]* data-action="ride"[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain(`aria-label="${RIDE_NAME}"`);
    expect(buttons[0]).toContain(`title="${RIDE_NAME}"`);
    expect(buttons[0]).toContain(`>${RIDE_NAME}</span>`);
    expect(buttons[0]).toContain('aria-pressed="false"');
    expect(buttons[0]).toContain("<svg");
    // The legend names its keys; and nothing of the two buttons it replaces is left, nor of the ride's own row before it starts.
    expect(html).toContain(`B or F: ${RIDE_NAME}`);
    for (const gone of ['data-action="follow"', 'data-action="lean-back"', 'data-action="sleep"', 'data-action="leave"', "data-ride", "data-mode"]) expect(html).not.toContain(gone);
  });
});

describe("idleMs", () => {
  it("is ten seconds, and what ?idle= asks only where the server says the test hooks answer", () => {
    expect(IDLE_S).toBe(10);
    expect(idleMs(false, "")).toBe(10_000);
    expect(idleMs(true, "")).toBe(10_000);
    expect(idleMs(true, "?idle=2")).toBe(2000);
    expect(idleMs(true, "?stats=1&idle=0.5")).toBe(500);
    expect(idleMs(true, "?idle=0")).toBe(0);
    // Off a preview the page does not read its query for it.
    expect(idleMs(false, "?idle=2")).toBe(10_000);
    // What is no length of time is not one.
    for (const junk of ["?idle=", "?idle=soon", "?idle=-3", "?idle=Infinity", "?idle=%20"]) expect(idleMs(true, junk), junk).toBe(10_000);
  });

  it("is never longer than a timeout can hold, which a longer wait would come due at once in", () => {
    expect(TIMEOUT_MAX_MS).toBe(2147483647);
    expect(idleMs(true, "?idle=2147483")).toBe(2_147_483_000);
    for (const huge of ["?idle=2147484", "?idle=1e12", "?idle=1e300"]) expect(idleMs(true, huge), huge).toBe(TIMEOUT_MAX_MS);
  });
});

describe("sleepAfterPress", () => {
  it("steps off, 30, 60, 90, off, a running timer counting as the shortest length that still holds it", () => {
    expect(sleepAfterPress(null)).toBe(30);
    expect(sleepAfterPress(30)).toBe(60);
    expect(sleepAfterPress(12)).toBe(60);
    expect(sleepAfterPress(31)).toBe(90);
    expect(sleepAfterPress(60)).toBe(90);
    expect(sleepAfterPress(61)).toBe(null);
    expect(sleepAfterPress(90)).toBe(null);
  });
});

describe("the sleep timer's reading", () => {
  const MINUTE = 60_000, END = 1_800_000_000_000;

  it("counts minutes, and seconds only under ?sleep=seconds where the server says the test hooks answer", () => {
    expect(sleepUnitMs(false, "")).toBe(MINUTE);
    expect(sleepUnitMs(true, "")).toBe(MINUTE);
    expect(sleepUnitMs(true, "?sleep=seconds")).toBe(1000);
    expect(sleepUnitMs(true, "?idle=2&sleep=seconds")).toBe(1000);
    expect(sleepUnitMs(false, "?sleep=seconds")).toBe(MINUTE);
    for (const other of ["?sleep=", "?sleep=1", "?sleep=minutes", "?sleep=Seconds"]) expect(sleepUnitMs(true, other), other).toBe(MINUTE);
  });

  it("reads the units left from when the timer ends and the clock: a part of a unit counts as one, and a timer not yet turned off never reads 0", () => {
    expect(sleepLeft(null, MINUTE, END)).toBe(null);
    expect(sleepLeft(END, MINUTE, END - 30 * MINUTE)).toBe(30);
    expect(sleepLeft(END, MINUTE, END - 30 * MINUTE + 1)).toBe(30);
    expect(sleepLeft(END, MINUTE, END - 29 * MINUTE)).toBe(29);
    expect(sleepLeft(END, MINUTE, END - 1)).toBe(1);
    expect(sleepLeft(END, 1000, END - 17_500)).toBe(18);
    // As it ends, and for the moment after before the ride has turned it off.
    expect(sleepLeft(END, MINUTE, END)).toBe(1);
    expect(sleepLeft(END, MINUTE, END + 400)).toBe(1);
  });

  it("says off, or the units left with the unit's name, on its button", () => {
    expect(sleepLabel(null, MINUTE)).toBe("Sleep · off");
    expect(sleepLabel(30, MINUTE)).toBe("Sleep · 30 min");
    expect(sleepLabel(29, sleepUnitMs(true, "?sleep=seconds"))).toBe("Sleep · 29 s");
    expect(sleepLabel(1, sleepUnitMs(true, ""))).toBe("Sleep · 1 min");
  });

  it("is read again once a second while its button is on the page, and no longer", () => {
    vi.useFakeTimers();
    try {
      let ticks = 0;
      const stop = eachSecond(() => { ticks += 1; });
      vi.advanceTimersByTime(999);
      expect(ticks).toBe(0);
      vi.advanceTimersByTime(1);
      expect(ticks).toBe(1);
      vi.advanceTimersByTime(4000);
      expect(ticks).toBe(5);
      stop();
      vi.advanceTimersByTime(60_000);
      expect(ticks).toBe(5);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// An input as the window hears it.
type Fields = { pointerId?: number; pointerType?: string; button?: number; screenX?: number; screenY?: number; code?: string; key?: string; repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; target?: unknown };
const input = (type: string, { target, ...fields }: Fields = {}) => {
  const event = Object.assign(new Event(type), fields);
  if (target !== undefined) Object.defineProperty(event, "target", { value: target });
  return event;
};

describe("watchIdle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const MS = IDLE_S * 1000;
  // A watch on a window of its own, with what it has told the page so far.
  function watching(options: Partial<Parameters<typeof watchIdle>[1]> = {}) {
    const win = new EventTarget(), told: boolean[] = [];
    const stop = watchIdle(win, { ms: MS, settled: false, onChange: (settled) => told.push(settled), ...options });
    const send = (type: string, fields?: Fields) => win.dispatchEvent(input(type, fields));
    return { told, send, stop };
  }

  it("settles after the wait with no input, and not a millisecond before", () => {
    const { told } = watching();
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    // And says so once, however long nothing happens.
    vi.advanceTimersByTime(10 * MS);
    expect(told).toEqual([true]);
  });

  it("wakes on each kind of input, and starts the wait again from it: a pointer that moves, a press, a touch, the stick, a key, the wheel", () => {
    const kinds: [string, Fields][] = [
      ["pointermove", { pointerId: 1, pointerType: "mouse", screenX: 5, screenY: 9 }],
      ["pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 5, screenY: 9 }],
      ["pointerdown", { pointerId: 4, pointerType: "touch", screenX: 50, screenY: 90 }],
      // A thumb sliding on the stick is a pointer that moves.
      ["pointermove", { pointerId: 4, pointerType: "touch", screenX: 52, screenY: 90 }],
      ["keydown", { code: "KeyL" }],
      ["wheel", {}],
    ];
    for (const [type, fields] of kinds) {
      const { told, send } = watching();
      // The watch has heard where the pointer is: at rest in a corner.
      send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 0, screenY: 0 });
      vi.advanceTimersByTime(MS);
      expect(told, type).toEqual([true]);
      send(type, fields);
      expect(told, type).toEqual([true, false]);
      // Let go, where it is held: then the wait runs its whole length again.
      if (type === "pointerdown") send("pointerup", fields);
      if (type === "keydown") send("keyup", fields);
      vi.advanceTimersByTime(MS - 1);
      expect(told, type).toEqual([true, false]);
      vi.advanceTimersByTime(1);
      expect(told, type).toEqual([true, false, true]);
    }
  });

  it("puts the settling off for an input that comes while the page is awake", () => {
    const { told, send } = watching();
    vi.advanceTimersByTime(MS - 1);
    send("wheel");
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
  });

  it("settles the whole wait after the last input, wherever that input fell against the wait's own timeout: just before it came due, in the same millisecond ahead of it, and in the same millisecond behind it", () => {
    // Just before: a millisecond short of the wait.
    const before = watching();
    vi.advanceTimersByTime(MS - 1);
    before.send("wheel");
    vi.advanceTimersByTime(MS - 1);
    expect(before.told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(before.told).toEqual([true]);
    before.stop();
    // In the same millisecond, the input first: a timer set before the watch's own comes due ahead of it. The page never settled.
    const first = new EventTarget(), told: boolean[] = [];
    setTimeout(() => first.dispatchEvent(input("wheel")), MS);
    const stop = watchIdle(first, { ms: MS, settled: false, onChange: (settled) => told.push(settled) });
    vi.advanceTimersByTime(MS);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    stop();
    // In the same millisecond, the wait first: the page settles, and the input wakes it at once.
    const after = watching();
    setTimeout(() => after.send("wheel"), MS);
    vi.advanceTimersByTime(MS);
    expect(after.told).toEqual([true, false]);
    vi.advanceTimersByTime(MS - 1);
    expect(after.told).toEqual([true, false]);
    vi.advanceTimersByTime(1);
    expect(after.told).toEqual([true, false, true]);
    // And a millisecond after the wait began: the timeout comes due with one millisecond of the wait left, and waits it out.
    const early = watching();
    vi.advanceTimersByTime(1);
    early.send("wheel");
    vi.advanceTimersByTime(MS - 1);
    expect(early.told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(early.told).toEqual([true]);
  });

  it("keeps one timeout however much input comes: a thousand moves of the pointer set none and clear none, and the wait is armed once more as it comes due, for what is left of it", () => {
    const { told, send } = watching();
    expect(vi.getTimerCount()).toBe(1);
    const set = vi.spyOn(globalThis, "setTimeout"), clear = vi.spyOn(globalThis, "clearTimeout");
    // A move a millisecond for a second, then a press and its lift, a key and its lift, and the wheel.
    for (let k = 1; k <= 1000; k++) {
      vi.advanceTimersByTime(1);
      send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: k, screenY: 7 });
    }
    send("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 1000, screenY: 7 });
    send("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 1000, screenY: 7 });
    send("keydown", { code: "KeyL" });
    send("keyup", { code: "KeyL" });
    send("wheel");
    expect(set).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    // The wait comes due ten seconds from the start, a second short of the last input's: armed once for that second, then settled.
    vi.advanceTimersByTime(MS - 1000);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][1]).toBe(1000);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(999);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    // Settled, nothing is armed until an input wakes the page.
    expect(vi.getTimerCount()).toBe(0);
    send("wheel");
    expect(vi.getTimerCount()).toBe(1);
    vi.restoreAllMocks();
  });

  it("waits its whole length from the letting go of a control that was held for a while and let go before the wait came due", () => {
    const { told, send } = watching();
    vi.advanceTimersByTime(2000);
    send("pointerdown", { pointerId: 7, pointerType: "touch", screenX: 1, screenY: 1 });
    vi.advanceTimersByTime(1000);
    send("pointerup", { pointerId: 7, pointerType: "touch", screenX: 1, screenY: 1 });
    // Not ten seconds from the start, nor from the press: from the lift, three seconds in.
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
  });

  it("takes the first move it hears only for where the pointer is, since a ride begun by a key has not heard of the pointer: it neither wakes the page nor puts the settling off, and the next move does both", () => {
    // Settled, with the pointer never heard of: the browser's move at the cursor's own place, as the HUD goes from under it.
    const settled = watching();
    vi.advanceTimersByTime(MS);
    settled.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 640, screenY: 40 });
    expect(settled.told).toEqual([true]);
    settled.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 640, screenY: 40 });
    expect(settled.told).toEqual([true]);
    // A hand on the mouse sends a second, elsewhere.
    settled.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 641, screenY: 40 });
    expect(settled.told).toEqual([true, false]);
    // Awake: the first move, a millisecond before the wait is over, does not put it off.
    const awake = watching();
    vi.advanceTimersByTime(MS - 1);
    awake.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 640, screenY: 40 });
    vi.advanceTimersByTime(1);
    expect(awake.told).toEqual([true]);
    // A first press is a press: it wakes the page wherever it lands, and says where the pointer is.
    const pressed = watching();
    vi.advanceTimersByTime(MS);
    pressed.send("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 640, screenY: 40 });
    pressed.send("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 640, screenY: 40 });
    expect(pressed.told).toEqual([true, false]);
    vi.advanceTimersByTime(MS);
    pressed.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 640, screenY: 40 });
    expect(pressed.told).toEqual([true, false, true]);
    // So the one move after a press, to another place, is a move: the pointer's place is known from the press.
    pressed.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 700, screenY: 40 });
    expect(pressed.told).toEqual([true, false, true, false]);
    const lifted = watching();
    lifted.send("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 640, screenY: 40 });
    vi.advanceTimersByTime(MS);
    lifted.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 640, screenY: 41 });
    expect(lifted.told).toEqual([true, false]);
  });

  it("takes a pointer that has not moved for no input: the move a browser sends as the page changes under a cursor at rest neither wakes it nor puts the settling off", () => {
    const { told, send } = watching();
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(MS - 1);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    expect(told).toEqual([true]);
    // A pixel's move is one, across the screen or down it.
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 200 });
    expect(told).toEqual([true, false]);
    vi.advanceTimersByTime(MS);
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 200 });
    expect(told).toEqual([true, false, true]);
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 201 });
    expect(told).toEqual([true, false, true, false]);
  });

  it("never settles under a control that is held, a key or a pointer, and waits its whole length from the letting go", () => {
    for (const [down, up, fields] of [["keydown", "keyup", { code: "ArrowLeft" }], ["pointerdown", "pointerup", { pointerId: 7, pointerType: "touch", screenX: 1, screenY: 1 }], ["pointerdown", "pointercancel", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 1, screenY: 1 }]] as [string, string, Fields][]) {
      const { told, send } = watching();
      send(down, fields);
      vi.advanceTimersByTime(6 * MS);
      expect(told, down).toEqual([]);
      send(up, fields);
      vi.advanceTimersByTime(MS - 1);
      expect(told, up).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told, up).toEqual([true]);
    }
    // Two held, one let go: still held. Two keys, and two fingers.
    const { told, send } = watching();
    send("keydown", { code: "ArrowLeft" });
    send("keydown", { code: "KeyT" });
    send("keyup", { code: "ArrowLeft" });
    vi.advanceTimersByTime(6 * MS);
    expect(told).toEqual([]);
    const fingers = watching();
    fingers.send("pointerdown", { pointerId: 7, pointerType: "touch", screenX: 1, screenY: 1 });
    fingers.send("pointerdown", { pointerId: 8, pointerType: "touch", screenX: 90, screenY: 90 });
    fingers.send("pointerup", { pointerId: 8, pointerType: "touch", screenX: 90, screenY: 90 });
    vi.advanceTimersByTime(6 * MS);
    expect(fingers.told).toEqual([]);
    fingers.send("pointerup", { pointerId: 7, pointerType: "touch", screenX: 1, screenY: 1 });
    vi.advanceTimersByTime(MS);
    expect(fingers.told).toEqual([true]);
  });

  it("counts no hold whose letting go it may never hear: a mouse's other buttons, a key pressed with Ctrl, Alt or Meta, and anything held as a menu opens or the window loses focus", () => {
    const unheard: [string, Fields][] = [
      ["pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, screenX: 1, screenY: 1 }],
      ["keydown", { code: "KeyC", metaKey: true }],
      ["keydown", { code: "KeyL", ctrlKey: true }],
      ["keydown", { code: "ArrowLeft", altKey: true }],
    ];
    for (const [type, fields] of unheard) {
      const { told, send } = watching();
      send(type, fields);
      vi.advanceTimersByTime(MS);
      expect(told, JSON.stringify(fields)).toEqual([true]);
    }
    for (const end of ["contextmenu", "blur"]) {
      const { told, send } = watching();
      send("keydown", { code: "ArrowLeft" });
      send("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 1, screenY: 1 });
      send(end);
      vi.advanceTimersByTime(MS - 1);
      expect(told, end).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told, end).toEqual([true]);
    }
  });

  // A watch told to hold the look under a press on two controls, a link and the slider, settled and left alone.
  function held() {
    const link = { name: "the chip's link" }, slider = { name: "the seek slider" }, world = { name: "the world" };
    const watch = watching({ holds: (target) => (target as unknown) === link || (target as unknown) === slider });
    vi.advanceTimersByTime(MS);
    expect(watch.told).toEqual([true]);
    const touch = (target: object) => ({ pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target });
    const mouse = (target: object) => ({ pointerId: 1, pointerType: "mouse", button: 0, screenX: 80, screenY: 700, target });
    return { ...watch, link, slider, world, touch, mouse };
  }

  it("holds the settled look under a press on a control until its click has been delivered, so a first tap on the settled link is followed: the page wakes only after the click, a finger's or a mouse's", () => {
    for (const pointer of ["touch", "mouse"] as const) {
      const { told, send, link, [pointer]: press } = held();
      send("pointerdown", press(link));
      expect(told, pointer).toEqual([true]);
      send("pointerup", press(link));
      expect(told, pointer).toEqual([true]);
      // The click itself wakes nothing while it is on its way: whatever it does is done on the page as it was pressed.
      send("click", { target: link });
      expect(told, pointer).toEqual([true]);
      vi.advanceTimersByTime(0);
      expect(told, pointer).toEqual([true, false]);
      // And once: the wait the lift began is not left to wake the page a second time, nor to settle it late.
      vi.advanceTimersByTime(MS - 1);
      expect(told, pointer).toEqual([true, false]);
      vi.advanceTimersByTime(1);
      expect(told, pointer).toEqual([true, false, true]);
      // The hold is over with the press: settled again, the page wakes at once on any input.
      send("keydown", { code: "KeyL" });
      expect(told, pointer).toEqual([true, false, true, false]);
    }
  });

  it("wakes a press that brings no click, a slide along the settled slider, a set wait after it lifts, and holds the look for as long as it is down", () => {
    expect(CLICK_WAIT_MS).toBe(400);
    const { told, send, slider, touch } = held();
    send("pointerdown", touch(slider));
    send("pointermove", { ...touch(slider), screenX: 140 });
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([true]);
    send("pointerup", { ...touch(slider), screenX: 140 });
    vi.advanceTimersByTime(CLICK_WAIT_MS - 1);
    expect(told).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true, false]);
    // The wait to settle runs from there: the wake is the last input.
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([true, false]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true, false, true]);
  });

  it("wakes at once on a press of the bare world, on a press of a control that is cancelled, and on another pointer's lift while a control is held it does not", () => {
    const bare = held();
    bare.send("pointerdown", bare.touch(bare.world));
    expect(bare.told).toEqual([true, false]);
    // A cancelled press brings no click to wait for.
    const cancelled = held();
    cancelled.send("pointerdown", cancelled.touch(cancelled.link));
    cancelled.send("pointercancel", cancelled.touch(cancelled.link));
    expect(cancelled.told).toEqual([true, false]);
    // A second finger that comes and goes ends nothing: the first still has the slider.
    const two = held();
    two.send("pointerdown", two.touch(two.slider));
    two.send("pointerup", { pointerId: 9, pointerType: "touch", screenX: 300, screenY: 300, target: two.world });
    vi.advanceTimersByTime(CLICK_WAIT_MS);
    expect(two.told).toEqual([true]);
    // Nor does a click from elsewhere while the finger is down: only its own lift lets a click end the hold.
    two.send("click", { target: two.world });
    vi.advanceTimersByTime(CLICK_WAIT_MS);
    expect(two.told).toEqual([true]);
    two.send("pointerup", two.touch(two.slider));
    vi.advanceTimersByTime(CLICK_WAIT_MS);
    expect(two.told).toEqual([true, false]);
  });

  it("holds on through a second press that begins before the first's wait is over, and hears a click on its own as no input", () => {
    const { told, send, link, slider, touch } = held();
    // A click nobody pressed for, as a script's is: the settled page stays as it is.
    send("click", { target: link });
    vi.advanceTimersByTime(CLICK_WAIT_MS);
    expect(told).toEqual([true]);
    send("pointerdown", touch(slider));
    send("pointerup", touch(slider));
    vi.advanceTimersByTime(CLICK_WAIT_MS - 1);
    send("pointerdown", touch(link));
    vi.advanceTimersByTime(3 * CLICK_WAIT_MS);
    expect(told).toEqual([true]);
    send("pointerup", touch(link));
    send("click", { target: link });
    vi.advanceTimersByTime(0);
    expect(told).toEqual([true, false]);
  });

  it("holds the look under a key that presses the control with focus, Enter or Space, until its click: Enter's comes while the key is down, Space's as it lifts; any other key wakes the page at once", () => {
    for (const code of ["Enter", "NumpadEnter"]) {
      const { told, send, link } = held();
      send("keydown", { code, target: link });
      expect(told, code).toEqual([true]);
      send("click", { target: link });
      // The key's lift, however soon, does not put the wake off: the click has come.
      send("keyup", { code, target: link });
      expect(told, code).toEqual([true]);
      vi.advanceTimersByTime(0);
      expect(told, code).toEqual([true, false]);
      vi.advanceTimersByTime(CLICK_WAIT_MS);
      expect(told, code).toEqual([true, false]);
    }
    const space = held();
    space.send("keydown", { code: "Space", target: space.link });
    vi.advanceTimersByTime(3 * MS);
    expect(space.told).toEqual([true]);
    space.send("keyup", { code: "Space", target: space.link });
    space.send("click", { target: space.link });
    expect(space.told).toEqual([true]);
    vi.advanceTimersByTime(0);
    expect(space.told).toEqual([true, false]);
    // A press key that clicks nothing, as Enter on the slider: the page wakes a set wait after the key lifts.
    const none = held();
    none.send("keydown", { code: "Enter", target: none.slider });
    none.send("keyup", { code: "Enter", target: none.slider });
    vi.advanceTimersByTime(CLICK_WAIT_MS - 1);
    expect(none.told).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(none.told).toEqual([true, false]);
    // The slider's own keys, Tab, a press key on the bare world, and a press key with Ctrl, whose lift may never be heard.
    const others: [string, Fields][] = [["ArrowRight", { target: "slider" }], ["Tab", { target: "link" }], ["Enter", { target: "world" }], ["Enter", { target: "link", ctrlKey: true }], ["Space", { target: "link", metaKey: true }]];
    for (const [code, { target, ...fields }] of others) {
      const other = held();
      other.send("keydown", { code, target: other[target as "link" | "slider" | "world"], ...fields });
      expect(other.told, `${code} ${JSON.stringify(fields)}`).toEqual([true, false]);
    }
  });

  it("drops a hold the window lets go of without waking, and still wakes for a press that had ended before the window lost focus", () => {
    // A menu or another window takes the lift: the hold is over, the page stays settled, and the next input wakes it.
    const dropped = held();
    dropped.send("pointerdown", dropped.touch(dropped.slider));
    dropped.send("blur");
    vi.advanceTimersByTime(3 * MS);
    expect(dropped.told).toEqual([true]);
    dropped.send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 5, screenY: 5 });
    expect(dropped.told).toEqual([true, false]);
    // A link that opens another tab takes the focus with it, after its click: the page still wakes.
    const opened = held();
    opened.send("pointerdown", opened.mouse(opened.link));
    opened.send("pointerup", opened.mouse(opened.link));
    opened.send("click", { target: opened.link });
    opened.send("blur");
    vi.advanceTimersByTime(0);
    expect(opened.told).toEqual([true, false]);
    // Stopped while a press's wait is running, the watch says nothing more.
    const stopped = held();
    stopped.send("pointerdown", stopped.touch(stopped.slider));
    stopped.send("pointerup", stopped.touch(stopped.slider));
    stopped.stop();
    vi.advanceTimersByTime(3 * MS);
    stopped.send("click", { target: stopped.slider });
    vi.advanceTimersByTime(3 * MS);
    expect(stopped.told).toEqual([true]);
  });

  it("takes a press on a control of an awake page for input like any other: the page stays awake, and the wait starts over from its lift", () => {
    const link = { name: "the chip's link" };
    const { told, send } = watching({ holds: (target) => (target as unknown) === link });
    vi.advanceTimersByTime(MS - 1);
    send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: link });
    send("pointerup", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: link });
    send("click", { target: link });
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    // Nor does a press that brings no click hold anything on an awake page: the wait to settle runs from the lift, and no longer.
    const slide = watching({ holds: (target) => (target as unknown) === link });
    slide.send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: link });
    slide.send("pointerup", { pointerId: 4, pointerType: "touch", screenX: 140, screenY: 700, target: link });
    vi.advanceTimersByTime(MS - 1);
    expect(slide.told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(slide.told).toEqual([true]);
  });

  it("begins settled where it is told the page is, and wakes on the first input", () => {
    const { told, send } = watching({ settled: true });
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([]);
    send("keydown", { code: "Tab" });
    expect(told).toEqual([false]);
  });

  it("hears nothing more once it is stopped", () => {
    const { told, send, stop } = watching();
    stop();
    vi.advanceTimersByTime(3 * MS);
    send("keydown", { code: "KeyL" });
    expect(told).toEqual([]);
  });
});

describe("createRide", () => {
  const MS = IDLE_S * 1000;
  // The page: a window, and a document with its root's classes, what has focus, and what a selector finds. `heard` is each of the
  // player's events the ride sent, in order.
  function page({ idle = MS, unit = 60_000 } = {}) {
    const classes = new Set<string>(), heard: string[] = [];
    const body = { name: "the page's body" };
    const doc = Object.assign(new EventTarget(), {
      documentElement: { classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) } },
      body,
      activeElement: body as unknown,
      found: {} as Record<string, { focus: ReturnType<typeof vi.fn> }>,
      querySelector(selector: string) {
        return this.found[selector] ?? null;
      },
    });
    for (const type of ["player:join", "player:pause"]) doc.addEventListener(type, () => heard.push(type));
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("HTMLElement", class {});
    const ride = createRide(), stop = ride.start({ idleMs: idle, unitMs: unit });
    const key = (code: string, fields: Fields = {}) => win.dispatchEvent(input("keydown", { code, key: code === "Escape" ? "Escape" : code.replace("Key", "").toLowerCase(), repeat: false, ...fields }));
    const release = (code: string) => win.dispatchEvent(input("keyup", { code }));
    const world = (mode: string) => doc.dispatchEvent(Object.assign(new Event("world:mode"), { detail: { mode } }));
    // The units left on the sleep timer as the ride's row reads them: from when the timer ends and the clock.
    const left = () => sleepLeft(ride.state().sleepEndsAt, unit, Date.now());
    return { ride, stop, win, doc, classes, heard, key, release, world, body, left };
  }
  // A key pressed and let go, as a tap on it is.
  const tap = (p: ReturnType<typeof page>, code: string, fields?: Fields) => {
    p.key(code, fields);
    p.release(code);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts the ride, and the show with it, on the button, on B and on F alike; and each of them ends it again", () => {
    const starts: ((p: ReturnType<typeof page>) => void)[] = [(p) => p.ride.toggle(), (p) => tap(p, "KeyB"), (p) => tap(p, "KeyF")];
    for (const start of starts) for (const end of starts) {
      const p = page();
      expect(p.ride.state()).toEqual({ riding: false, settled: false, sleepEndsAt: null });
      start(p);
      expect(p.ride.state()).toEqual({ riding: true, settled: false, sleepEndsAt: null });
      // The player was asked to start the show, once, as the ride began.
      expect(p.heard).toEqual(["player:join"]);
      end(p);
      expect(p.ride.state().riding).toBe(false);
      expect(p.heard).toEqual(["player:join"]);
      p.stop();
    }
  });

  it("leaves on Escape, on the world's word that a step has begun a walk, and on Leave, from the awake look and from the settled one; and on no other word of the world's", () => {
    const ends: ((p: ReturnType<typeof page>) => void)[] = [(p) => tap(p, "Escape"), (p) => p.world("walk"), (p) => p.ride.leave(), (p) => p.ride.toggle(), (p) => tap(p, "KeyB"), (p) => tap(p, "KeyF")];
    for (const settled of [false, true]) for (const end of ends) {
      const p = page();
      p.ride.toggle();
      if (settled) vi.advanceTimersByTime(MS);
      expect(p.ride.state()).toEqual({ riding: true, settled, sleepEndsAt: null });
      expect(p.classes.has("cursor-off")).toBe(settled);
      end(p);
      expect(p.ride.state()).toEqual({ riding: false, settled: false, sleepEndsAt: null });
      expect(p.classes.has("cursor-off")).toBe(false);
      p.stop();
    }
    const p = page();
    p.ride.toggle();
    for (const mode of ["follow", "drift", "attract", "descent"]) p.world(mode);
    expect(p.ride.state().riding).toBe(true);
    // Out of a ride, Escape and the world's word start nothing.
    const out = page();
    tap(out, "Escape");
    out.world("walk");
    out.world("follow");
    expect(out.ride.state().riding).toBe(false);
    expect(out.heard).toEqual([]);
  });

  it("takes B and F as the page's other letter keys are taken: not held down, not with Ctrl, Alt or Meta, not typed into a field, and not with single-key shortcuts off unless the world has focus", () => {
    for (const code of ["KeyB", "KeyF"]) {
      const p = page();
      // A text field, and the seek slider, which is an input too: its keys are its own.
      const field = Object.assign(new (globalThis as unknown as { HTMLElement: new () => object }).HTMLElement(), { isContentEditable: false, matches: (selector: string) => selector.includes("input") });
      for (const fields of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { target: field }]) {
        p.key(code, fields);
        expect(p.ride.state().riding, `${code} ${Object.keys(fields)}`).toBe(false);
      }
      // Single-key shortcuts off: the letters act only while the world has focus.
      vi.stubGlobal("localStorage", { getItem: () => "off" });
      vi.stubGlobal("Element", class {});
      p.key(code);
      expect(p.ride.state().riding, code).toBe(false);
      const inWorld = Object.assign(new (globalThis as unknown as { Element: new () => object }).Element(), { closest: (selector: string) => (selector === "#world" ? {} : null) });
      p.key(code, { target: inWorld });
      expect(p.ride.state().riding, code).toBe(true);
      // Escape is no letter: it leaves whatever has focus.
      p.key("Escape", { target: field });
      expect(p.ride.state().riding, code).toBe(false);
      p.stop();
      vi.unstubAllGlobals();
    }
  });

  it("settles after the wait with no input and hides the cursor, wakes on input and shows it, and settles again", () => {
    const p = page();
    p.ride.toggle();
    vi.advanceTimersByTime(MS - 1);
    expect(p.ride.state().settled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: null });
    expect(p.classes.has("cursor-off")).toBe(true);
    // The pointer moves: its first event says where it is, and its second that it moved.
    p.win.dispatchEvent(input("pointermove", { pointerId: 1, screenX: 10, screenY: 10 }));
    expect(p.ride.state().settled).toBe(true);
    p.win.dispatchEvent(input("pointermove", { pointerId: 1, screenX: 11, screenY: 10 }));
    expect(p.ride.state()).toEqual({ riding: true, settled: false, sleepEndsAt: null });
    expect(p.classes.has("cursor-off")).toBe(false);
    vi.advanceTimersByTime(MS);
    expect(p.ride.state().settled).toBe(true);
    // The key that starts the ride is the first of its inputs: the wait runs from it.
    const keyed = page();
    tap(keyed, "KeyB");
    vi.advanceTimersByTime(MS - 1);
    expect(keyed.ride.state().settled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(keyed.ride.state().settled).toBe(true);
  });

  it("waits out the longest wait the test hook can ask for with one timeout, where a longer one would come due at once and be armed again without end", () => {
    const p = page({ idle: idleMs(true, "?idle=1e12") });
    p.ride.toggle();
    const set = vi.spyOn(globalThis, "setTimeout");
    vi.advanceTimersByTime(60_000);
    expect(set).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    expect(p.ride.state().settled).toBe(false);
    vi.restoreAllMocks();
  });

  it("settles after the time the page was started with, and never out of a ride", () => {
    const p = page({ idle: 2000 });
    vi.advanceTimersByTime(60_000);
    expect(p.ride.state()).toEqual({ riding: false, settled: false, sleepEndsAt: null });
    p.ride.toggle();
    vi.advanceTimersByTime(1999);
    expect(p.ride.state().settled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(p.ride.state().settled).toBe(true);
  });

  it("runs the sleep timer in either look: it reads the time left, pauses the show when it runs out, and leaves the ride on", () => {
    for (const settled of [false, true]) {
      const p = page();
      p.ride.toggle();
      expect(p.left()).toBe(null);
      p.ride.pressSleep();
      expect(p.left()).toBe(30);
      expect(p.ride.state().sleepEndsAt).toBe(Date.now() + 30 * 60_000);
      // Awake, the visitor holds a look key down all the while; settled, they leave the page alone.
      if (!settled) p.key("ArrowLeft");
      for (let minute = 1; minute <= 29; minute++) {
        vi.advanceTimersByTime(60_000);
        expect(p.left()).toBe(30 - minute);
      }
      expect(p.ride.state().settled).toBe(settled);
      expect(p.heard).toEqual(["player:join"]);
      vi.advanceTimersByTime(60_000);
      expect(p.heard).toEqual(["player:join", "player:pause"]);
      expect(p.left()).toBe(null);
      expect(p.ride.state()).toEqual({ riding: true, settled, sleepEndsAt: null });
      // It fired once.
      vi.advanceTimersByTime(600_000);
      expect(p.heard).toEqual(["player:join", "player:pause"]);
      p.stop();
    }
  });

  it("keeps one timeout for the sleep timer, due as it ends, and no tick of its own: set, it pauses the show at its end and not a millisecond before; changed, only its new end counts; turned off or left behind, none is left", () => {
    const p = page({ unit: 1000 });
    p.ride.toggle();
    // A look key held down keeps the page awake, so what the page is told of below is the timer's alone.
    p.key("ArrowLeft");
    let told = 0;
    p.ride.subscribe(() => { told += 1; });
    // One timeout is armed so far, the idle wait's; the sleep timer adds one, and no more.
    expect(vi.getTimerCount()).toBe(1);
    p.ride.pressSleep();
    expect(told).toBe(1);
    expect(vi.getTimerCount()).toBe(2);
    // Set: thirty seconds, with nothing told on the way. The idle wait's timeout comes due under the held key and is not armed again.
    vi.advanceTimersByTime(29_999);
    expect(p.heard).toEqual(["player:join"]);
    expect(told).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(p.heard).toEqual(["player:join", "player:pause"]);
    expect(told).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
    // Changed: set again, and twelve seconds on pressed to sixty from then. The first end passes with no pause.
    p.ride.pressSleep();
    vi.advanceTimersByTime(12_000);
    p.ride.pressSleep();
    expect(p.ride.state().sleepEndsAt).toBe(Date.now() + 60_000);
    vi.advanceTimersByTime(18_000);
    expect(p.heard).toEqual(["player:join", "player:pause"]);
    vi.advanceTimersByTime(41_999);
    expect(p.heard).toEqual(["player:join", "player:pause"]);
    vi.advanceTimersByTime(1);
    expect(p.heard).toEqual(["player:join", "player:pause", "player:pause"]);
    // Turned off by its own button (30, 60, 90, off), and left behind with the ride: nothing is due, and nothing pauses.
    for (let press = 0; press < 4; press++) p.ride.pressSleep();
    expect(p.ride.state().sleepEndsAt).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
    p.ride.pressSleep();
    expect(vi.getTimerCount()).toBe(1);
    p.ride.leave();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(p.heard).toEqual(["player:join", "player:pause", "player:pause"]);
  });

  it("carries the sleep timer's end over to the next page as it is: the show pauses there at that end, to the millisecond", () => {
    const p = page();
    p.ride.arrive({ riding: true, sleepEndsAt: Date.now() + 25 * 60_000 });
    vi.advanceTimersByTime(25 * 60_000 - 1);
    expect(p.heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(p.heard).toEqual(["player:pause"]);
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: null });
  });

  it("steps the sleep timer with each press, counts seconds under the test hook's unit, and turns it off as the visitor leaves", () => {
    const p = page({ unit: 1000 });
    p.ride.pressSleep();
    expect(p.left()).toBe(null);
    p.ride.toggle();
    p.ride.pressSleep();
    expect(p.ride.state().sleepEndsAt).toBe(Date.now() + 30_000);
    vi.advanceTimersByTime(12_000);
    expect(p.left()).toBe(18);
    // 18 s left counts as 30: the next is 60, then 90, then off.
    p.ride.pressSleep();
    expect(p.left()).toBe(60);
    p.ride.pressSleep();
    expect(p.left()).toBe(90);
    p.ride.pressSleep();
    expect(p.left()).toBe(null);
    expect(p.ride.state().sleepEndsAt).toBe(null);
    p.ride.pressSleep();
    p.ride.leave();
    expect(p.left()).toBe(null);
    vi.advanceTimersByTime(60_000);
    expect(p.heard).toEqual(["player:join"]);
  });

  it("brings a visitor who was riding on the page before in riding, settled at once, with the sleep timer as it was; and one who was not, not", () => {
    const p = page();
    const endsAt = Date.now() + 25 * 60_000;
    p.ride.arrive({ riding: true, sleepEndsAt: endsAt });
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: endsAt });
    expect(p.classes.has("cursor-off")).toBe(true);
    expect(p.left()).toBe(25);
    // The ride itself asks for no show: the page that carries it over does, unless the timer has run out (NextShow.tsx).
    expect(p.heard).toEqual([]);
    // Settled, it wakes on input and settles again after the wait, as any ride.
    p.win.dispatchEvent(input("wheel"));
    expect(p.ride.state().settled).toBe(false);
    vi.advanceTimersByTime(MS);
    expect(p.ride.state().settled).toBe(true);
    vi.advanceTimersByTime(25 * 60_000);
    expect(p.heard).toEqual(["player:pause"]);
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: null });

    const walker = page();
    walker.ride.arrive({ riding: false, sleepEndsAt: endsAt });
    expect(walker.ride.state()).toEqual({ riding: false, settled: false, sleepEndsAt: null });
    // A timer that ran out on the way is over on arrival.
    const late = page();
    late.ride.arrive({ riding: true, sleepEndsAt: Date.now() - 1000 });
    expect(late.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: null });
    expect(late.heard).toEqual(["player:pause"]);
  });

  it("gives focus back, once the page is awake, to the control that had it when the page settled, and takes it from nothing else", () => {
    const p = page();
    const button = { dataset: { action: "ride" }, focus: vi.fn() };
    p.doc.found['[data-action="ride"]'] = button;
    p.ride.toggle();
    p.doc.activeElement = button;
    vi.advanceTimersByTime(MS);
    // Settled, the page has taken the button away and focus has fallen to the body: there is nothing to give focus to yet, and the
    // button is kept in mind for the wake.
    delete p.doc.found['[data-action="ride"]'];
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(button.focus).not.toHaveBeenCalled();
    p.doc.found['[data-action="ride"]'] = button;
    p.win.dispatchEvent(input("wheel"));
    p.ride.refocus();
    expect(button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    // Once is all: a later wake with nothing lost moves no focus.
    p.ride.refocus();
    expect(button.focus).toHaveBeenCalledTimes(1);
    // Where the visitor has moved focus on, or it stayed where it was (the slider, the world), it is left there.
    p.doc.activeElement = button;
    vi.advanceTimersByTime(MS);
    p.doc.activeElement = { name: "the seek slider" };
    p.win.dispatchEvent(input("wheel"));
    p.ride.refocus();
    expect(button.focus).toHaveBeenCalledTimes(1);
  });

  it("gives the focus the chip's link had to the link the settled look draws anew over its title, so Enter presses it there, and back to the awake one as the page wakes", () => {
    const p = page(), key = '[data-action="play-next"]';
    const awake = { dataset: { action: "play-next" }, focus: vi.fn() }, settled = { dataset: { action: "play-next" }, focus: vi.fn() };
    p.ride.toggle();
    p.doc.found[key] = awake;
    p.doc.activeElement = awake;
    vi.advanceTimersByTime(MS);
    // The settled page has drawn the chip anew: the link that had focus is gone, and focus has fallen to the body.
    p.doc.found[key] = settled;
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(settled.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    p.doc.activeElement = settled;
    p.ride.refocus();
    expect(settled.focus).toHaveBeenCalledTimes(1);
    // Waking draws it anew again, under the title's plate: the link with focus as the page wakes is the one found again.
    p.win.dispatchEvent(input("wheel"));
    p.doc.found[key] = awake;
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(awake.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    p.ride.refocus();
    expect(awake.focus).toHaveBeenCalledTimes(1);
    // A settling with focus on nothing it can find again forgets what an earlier one kept.
    p.doc.activeElement = { name: "the world" };
    vi.advanceTimersByTime(MS);
    p.doc.activeElement = p.body;
    p.ride.refocus();
    p.win.dispatchEvent(input("wheel"));
    p.ride.refocus();
    expect(settled.focus).toHaveBeenCalledTimes(1);
    expect(awake.focus).toHaveBeenCalledTimes(1);
  });

  it("holds the settled look under the first press on each kind of control the settled look shows, the link, the button and the slider, until its click is delivered; a press on the bare world wakes it at once", () => {
    expect(CONTROLS).toBe("a[href], button, input, select, textarea, summary");
    // Elements of the page by kind; `closest` answers for the kinds a selector lists, as for a press on the control itself.
    const Kind = class {
      constructor(readonly kind: string) {}
      closest(selector: string) {
        return selector.split(", ").includes(this.kind) ? this : null;
      }
    };
    vi.stubGlobal("Element", Kind);
    const press = (target: unknown) => ({ pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target });
    for (const kind of ["a[href]", "button", "input"]) {
      const p = page(), control = new Kind(kind);
      p.ride.toggle();
      vi.advanceTimersByTime(MS);
      p.win.dispatchEvent(input("pointerdown", press(control)));
      p.win.dispatchEvent(input("pointerup", press(control)));
      expect(p.ride.state().settled, kind).toBe(true);
      p.win.dispatchEvent(input("click", { target: control }));
      expect(p.ride.state().settled, kind).toBe(true);
      vi.advanceTimersByTime(0);
      expect(p.ride.state(), kind).toEqual({ riding: true, settled: false, sleepEndsAt: null });
      p.stop();
    }
    // The world, the title and the plates' text are no controls, and neither is what is no element: a press there wakes the page.
    for (const bare of [new Kind("div"), new Kind("h1"), new Kind("a"), { name: "the window" }]) {
      const p = page();
      p.ride.toggle();
      vi.advanceTimersByTime(MS);
      p.win.dispatchEvent(input("pointerdown", press(bare)));
      expect(p.ride.state().settled).toBe(false);
      p.stop();
    }
  });

  it("finds a control again by its action, and a shelf's tab by its shelf too; what has neither is not one it keeps", () => {
    expect(controlKey({ dataset: { action: "play" } } as unknown as Element)).toBe('[data-action="play"]');
    expect(controlKey({ dataset: { action: "shelf", shelfTab: "title" } } as unknown as Element)).toBe('[data-action="shelf"][data-shelf-tab="title"]');
    expect(controlKey({ dataset: {} } as unknown as Element)).toBe(null);
    expect(controlKey({} as Element)).toBe(null);
    expect(controlKey(null)).toBe(null);
  });

  it("tells the page of each change and of nothing else, with a new state for a change and the same one otherwise", () => {
    const p = page();
    let told = 0;
    const off = p.ride.subscribe(() => { told += 1; });
    const before = p.ride.state();
    p.ride.leave();
    tap(p, "Escape");
    expect(told).toBe(0);
    expect(p.ride.state()).toBe(before);
    p.ride.toggle();
    expect(told).toBe(1);
    expect(p.ride.state()).not.toBe(before);
    // Leaving a settled ride with its timer running is one change, not one for the look and one for the timer, nor one a field.
    p.ride.pressSleep();
    vi.advanceTimersByTime(MS);
    told = 0;
    p.ride.leave();
    expect(told).toBe(1);
    expect(p.ride.state()).toEqual({ riding: false, settled: false, sleepEndsAt: null });
    // So is arriving from the page before, riding, settled and with a timer.
    p.ride.arrive({ riding: true, sleepEndsAt: Date.now() + 60_000 });
    expect(told).toBe(2);
    off();
    p.ride.toggle();
    expect(told).toBe(2);
  });

  it("stops listening when the page goes, and takes up again where it was", () => {
    const p = page();
    p.ride.toggle();
    p.ride.pressSleep();
    p.stop();
    tap(p, "Escape");
    p.world("walk");
    vi.advanceTimersByTime(40 * 60_000);
    expect(p.ride.state().riding).toBe(true);
    expect(p.ride.state().settled).toBe(false);
    expect(p.heard).toEqual(["player:join"]);
    // Started again, the timer that ran out meanwhile fires at its next second, and the wait runs from the start.
    p.ride.start({ idleMs: MS, unitMs: 60_000 });
    vi.advanceTimersByTime(1000);
    expect(p.heard).toEqual(["player:join", "player:pause"]);
    vi.advanceTimersByTime(MS);
    expect(p.ride.state().settled).toBe(true);
    tap(p, "Escape");
    expect(p.ride.state().riding).toBe(false);
  });
});

describe("the carry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const storage = () => {
    const held = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => held.set(key, value), removeItem: (key: string) => held.delete(key) });
    return held;
  };

  it("hands the ride and its sleep timer to the next page, once", () => {
    storage();
    expect(readCarry()).toBe(null);
    const endsAt = Date.now() + 30 * 60_000;
    writeCarry({ riding: true, sleepEndsAt: endsAt });
    expect(readCarry()).toEqual({ riding: true, sleepEndsAt: endsAt });
    writeCarry({ riding: false, sleepEndsAt: null });
    expect(readCarry()).toEqual({ riding: false, sleepEndsAt: null });
    clearCarry();
    expect(readCarry()).toBe(null);
  });

  it("takes anything else it finds for no ride and no timer, and storage it cannot read for nothing", () => {
    const held = storage();
    for (const [stored, carry] of [['{"riding":"yes","sleepEndsAt":"soon"}', { riding: false, sleepEndsAt: null }], ["{}", { riding: false, sleepEndsAt: null }], ["7", null], ["not json", null]] as const) {
      held.set("dead-redux:carry", stored);
      expect(readCarry(), stored).toEqual(carry);
    }
    // A sleep timer's end that is no moment, or one further off than a timeout can hold, which would pause the show on arrival: the
    // ride is carried and the timer is not. One that has passed is carried: the ride turns it off as it arrives (ride.ts).
    // The clock stands still here, so the limit is tried to the millisecond: the longest wait a timeout holds is carried, and one
    // more is not.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    const now = Date.now();
    for (const [end, carried] of [["1e999", null], ["-1e999", null], [String(now + TIMEOUT_MAX_MS + 1), null], [String(now + TIMEOUT_MAX_MS), now + TIMEOUT_MAX_MS], [String(now - 5000), now - 5000]] as const) {
      held.set("dead-redux:carry", `{"riding":true,"sleepEndsAt":${end}}`);
      expect(readCarry(), end).toEqual({ riding: true, sleepEndsAt: carried });
    }
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(readCarry()).toBe(null);
    expect(() => writeCarry({ riding: true, sleepEndsAt: null })).not.toThrow();
    expect(() => clearCarry()).not.toThrow();
  });
});
