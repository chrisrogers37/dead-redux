import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCarry, readCarry, writeCarry } from "../../components/world/carry";
import { controlKey, CONTROLS, createRide, CURSOR_MS, eachSecond, IDLE_S, idleMs, RIDE_NAME, sleepAfterPress, sleepLabel, sleepLeft, sleepUnitMs, TIMEOUT_MAX_MS, watchIdle } from "../../components/world/ride";
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
type Fields = { pointerId?: number; pointerType?: string; button?: number; screenX?: number; screenY?: number; code?: string; key?: string; repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: unknown };
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
    let stirred = 0;
    const stop = watchIdle(win, { ms: MS, settled: false, onChange: (settled) => told.push(settled), onStir: () => { stirred += 1; }, ...options });
    const send = (type: string, fields?: Fields) => win.dispatchEvent(input(type, fields));
    // A key that is no control's, pressed and let go: what wakes a settled page without holding anything.
    const key = () => {
      send("keydown", { code: "KeyX", key: "x" });
      send("keyup", { code: "KeyX", key: "x" });
    };
    return { told, send, key, stop, stirs: () => stirred };
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

  it("wakes a settled page on a press of the bare world, a mouse's or a finger's, and on a key, and starts the wait again from it", () => {
    const kinds: [string, Fields][] = [
      ["pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 5, screenY: 9 }],
      ["pointerdown", { pointerId: 4, pointerType: "touch", screenX: 50, screenY: 90 }],
      // A mouse's other button is a press too, though it is no hold.
      ["pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, screenX: 5, screenY: 9 }],
      ["keydown", { code: "KeyX", key: "x" }],
    ];
    for (const [type, fields] of kinds) {
      const { told, send } = watching();
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

  it("leaves a settled page settled under a pointer that moves, however far, and under a lift, a key's lift and the wheel: the page is there to be used as it is, and a mouse has to reach what it shows", () => {
    const { told, send, stirs } = watching();
    vi.advanceTimersByTime(MS);
    send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 100, screenY: 100 });
    for (let k = 1; k <= 50; k++) send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 100 + 10 * k, screenY: 100 + 5 * k });
    send("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, screenX: 600, screenY: 350 });
    send("pointercancel", { pointerId: 4, pointerType: "touch", screenX: 600, screenY: 350 });
    send("keyup", { code: "KeyX", key: "x" });
    send("wheel");
    expect(told).toEqual([true]);
    // Nor does any of it start a wait to settle: none runs on a settled page, and nothing is armed for one.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([true]);
    // Each move that is one is told, for the cursor; a lift and the wheel are not.
    expect(stirs()).toBe(50);
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
    setTimeout(() => after.key(), MS);
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
    send("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 2000, screenY: 7 });
    send("wheel");
    expect(vi.getTimerCount()).toBe(0);
    send("keydown", { code: "KeyX", key: "x" });
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

  it("takes the first move it hears only for where the pointer is, since a ride begun by a key has not heard of the pointer: awake it does not put the settling off, settled it shows no cursor, and the next move does", () => {
    const at = (screenX: number, screenY: number) => ({ pointerId: 1, pointerType: "mouse", screenX, screenY });
    // Awake: the first move, a millisecond before the wait is over, does not put it off.
    const awake = watching();
    vi.advanceTimersByTime(MS - 1);
    awake.send("pointermove", at(640, 40));
    vi.advanceTimersByTime(1);
    expect(awake.told).toEqual([true]);
    // A second, elsewhere, does: a hand moving the mouse over the awake HUD does not have it stripped from under it.
    const moved = watching();
    vi.advanceTimersByTime(MS - 2);
    moved.send("pointermove", at(640, 40));
    vi.advanceTimersByTime(1);
    moved.send("pointermove", at(641, 40));
    vi.advanceTimersByTime(MS - 1);
    expect(moved.told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(moved.told).toEqual([true]);
    // Settled, with the pointer never heard of: the browser's move at the cursor's own place, as the HUD goes from under it, shows
    // no cursor. A hand on the mouse sends a second, elsewhere, which does, and wakes nothing.
    const settled = watching();
    vi.advanceTimersByTime(MS);
    settled.send("pointermove", at(640, 40));
    settled.send("pointermove", at(640, 40));
    expect(settled.stirs()).toBe(0);
    settled.send("pointermove", at(641, 40));
    expect(settled.stirs()).toBe(1);
    expect(settled.told).toEqual([true]);
    // A press says where the pointer is, and so does a lift: a move at its own place is none, and the one move to another is one.
    const pressed = watching({ control: () => true });
    vi.advanceTimersByTime(MS);
    pressed.send("pointerdown", { ...at(640, 40), button: 0 });
    pressed.send("pointerup", { ...at(640, 40), button: 0 });
    expect(pressed.stirs()).toBe(1);
    pressed.send("pointermove", at(640, 40));
    expect(pressed.stirs()).toBe(1);
    pressed.send("pointermove", at(700, 40));
    expect(pressed.stirs()).toBe(2);
    const lifted = watching();
    lifted.send("pointerup", { ...at(640, 40), button: 0 });
    vi.advanceTimersByTime(MS);
    lifted.send("pointermove", at(640, 41));
    expect(lifted.stirs()).toBe(1);
  });

  it("takes a pointer that has not moved for no input: the move a browser sends as the page changes under a cursor at rest neither puts the settling off nor shows the cursor", () => {
    const { told, send, stirs } = watching();
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(MS - 1);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    expect(stirs()).toBe(0);
    // A pixel's move is one, across the screen or down it.
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 200 });
    expect(stirs()).toBe(1);
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 200 });
    expect(stirs()).toBe(1);
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 201 });
    expect(stirs()).toBe(2);
    expect(told).toEqual([true]);
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
      // Two seconds held, then let go without a word: the wait runs its whole length from there.
      vi.advanceTimersByTime(2000);
      send(end);
      vi.advanceTimersByTime(MS - 1);
      expect(told, end).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told, end).toEqual([true]);
    }
  });

  // A settled watch that knows two controls, a link and the slider, and takes Tab and whatever key the slider has for quiet.
  function used() {
    const link = { name: "the chip's link" }, slider = { name: "the seek slider" }, world = { name: "the world" };
    const watch = watching({
      control: (target) => (target as unknown) === link || (target as unknown) === slider,
      quiet: (key) => key.code === "Tab" || (key.target as unknown) === slider,
    });
    vi.advanceTimersByTime(MS);
    expect(watch.told).toEqual([true]);
    const touch = (target: object) => ({ pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target });
    const mouse = (target: object) => ({ pointerId: 1, pointerType: "mouse", button: 0, screenX: 80, screenY: 700, target });
    return { ...watch, link, slider, world, touch, mouse };
  }

  it("leaves a settled page settled under a press on a control, which does its work on the page as it is: a tap on the link, a click, a slide along the slider", () => {
    for (const pointer of ["touch", "mouse"] as const) {
      const { told, send, stirs, link, [pointer]: press } = used();
      send("pointerdown", press(link));
      send("pointerup", press(link));
      send("click", { target: link });
      expect(told, pointer).toEqual([true]);
      // Nothing is left to wake it later, and no wait is begun: the page is not drawn anew under the press, nor after it.
      expect(vi.getTimerCount(), pointer).toBe(0);
      vi.advanceTimersByTime(3 * MS);
      expect(told, pointer).toEqual([true]);
      // The press is told, for the cursor.
      expect(stirs(), pointer).toBe(1);
    }
    const { told, send, stirs, slider, touch } = used();
    send("pointerdown", touch(slider));
    send("pointermove", { ...touch(slider), screenX: 140 });
    send("pointerup", { ...touch(slider), screenX: 140 });
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([true]);
    expect(stirs()).toBe(2);
  });

  it("wakes a settled page on a press of anything that is no control, and on a key that is not quiet; a quiet key leaves it settled, and is told for the cursor", () => {
    for (const pointer of ["touch", "mouse"] as const) {
      const { told, send, stirs, world, [pointer]: press } = used();
      send("pointerdown", press(world));
      expect(told, pointer).toEqual([true, false]);
      expect(stirs(), pointer).toBe(0);
    }
    // Tab moves focus among the settled look's controls, and the slider's keys are its own.
    const quiet = used();
    quiet.send("keydown", { code: "Tab", key: "Tab", target: quiet.world });
    quiet.send("keyup", { code: "Tab", key: "Tab", target: quiet.link });
    quiet.send("keydown", { code: "ArrowRight", key: "ArrowRight", target: quiet.slider });
    quiet.send("keyup", { code: "ArrowRight", key: "ArrowRight", target: quiet.slider });
    expect(quiet.told).toEqual([true]);
    expect(quiet.stirs()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
    // Any other key wakes it, wherever focus is: on the world, on a control.
    for (const target of ["world", "link"] as const) {
      const other = used();
      other.send("keydown", { code: "KeyX", key: "x", target: other[target] });
      expect(other.told, target).toEqual([true, false]);
      expect(other.stirs(), target).toBe(0);
    }
    // Told of no controls and no quiet keys, a watch wakes on every press and every key.
    const plain = watching();
    vi.advanceTimersByTime(MS);
    plain.send("keydown", { code: "Tab", key: "Tab" });
    expect(plain.told).toEqual([true, false]);
  });

  it("starts no wait on a settled page as the window lets go of what is held, and on an awake one runs the wait from there", () => {
    const { told, send, slider, touch } = used();
    send("pointerdown", touch(slider));
    send("blur");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([true]);
    // The hold is over: woken by a key, the page settles again after the wait, though the finger's lift was never heard.
    send("keydown", { code: "KeyX", key: "x" });
    send("keyup", { code: "KeyX", key: "x" });
    vi.advanceTimersByTime(MS);
    expect(told).toEqual([true, false, true]);
  });

  it("takes a press on a control of an awake page for input like any other: the page stays awake, and the wait starts over from its lift", () => {
    const link = { name: "the chip's link" };
    const { told, send, stirs } = watching({ control: (target) => (target as unknown) === link });
    vi.advanceTimersByTime(MS - 1);
    send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: link });
    send("pointerup", { pointerId: 4, pointerType: "touch", screenX: 140, screenY: 700, target: link });
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    // And awake, nothing is told for the cursor: it is shown already.
    expect(stirs()).toBe(0);
  });

  it("begins settled where it is told the page is, with no wait running, and wakes on the first input", () => {
    const { told, send } = watching({ settled: true });
    expect(vi.getTimerCount()).toBe(0);
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
    // A key that is no control's wakes it, and the cursor is back with the HUD.
    tap(p, "KeyX");
    expect(p.ride.state()).toEqual({ riding: true, settled: false, sleepEndsAt: null });
    expect(p.classes.has("cursor-off")).toBe(false);
    vi.advanceTimersByTime(MS);
    expect(p.ride.state().settled).toBe(true);
    expect(p.classes.has("cursor-off")).toBe(true);
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

  it("shows a settled page's cursor for three seconds after the pointer moves, and leaves the page settled: the move wakes nothing, and neither does the cursor's going", () => {
    expect(CURSOR_MS).toBe(3000);
    const p = page();
    p.ride.toggle();
    vi.advanceTimersByTime(MS);
    let told = 0;
    p.ride.subscribe(() => { told += 1; });
    const move = (screenX: number) => p.win.dispatchEvent(input("pointermove", { pointerId: 1, pointerType: "mouse", screenX, screenY: 10 }));
    // The pointer's first event says where it is, and its second that it moved.
    move(10);
    expect(p.classes.has("cursor-off")).toBe(true);
    move(11);
    expect(p.classes.has("cursor-off")).toBe(false);
    vi.advanceTimersByTime(CURSOR_MS - 1);
    expect(p.classes.has("cursor-off")).toBe(false);
    // Another move starts the three seconds again.
    move(12);
    vi.advanceTimersByTime(CURSOR_MS - 1);
    expect(p.classes.has("cursor-off")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(p.classes.has("cursor-off")).toBe(true);
    // Through all of it the page stays settled and is told of nothing; and no wait to settle runs under it.
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: null });
    expect(told).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    // A wake while the cursor shows keeps it, for good: the three seconds are the settled look's.
    move(13);
    tap(p, "KeyX");
    vi.advanceTimersByTime(CURSOR_MS);
    expect(p.ride.state().settled).toBe(false);
    expect(p.classes.has("cursor-off")).toBe(false);
    // And so does leaving the ride from the settled look, with the cursor shown or hidden.
    for (const shown of [true, false]) {
      const q = page();
      q.ride.toggle();
      vi.advanceTimersByTime(MS);
      q.win.dispatchEvent(input("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 1, screenY: 1 }));
      if (shown) q.win.dispatchEvent(input("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 2, screenY: 1 }));
      expect(q.classes.has("cursor-off"), String(shown)).toBe(!shown);
      q.ride.leave();
      vi.advanceTimersByTime(CURSOR_MS);
      expect(q.classes.has("cursor-off"), String(shown)).toBe(false);
      expect(vi.getTimerCount(), String(shown)).toBe(0);
    }
    // A page that stops listening leaves no wait for the cursor running.
    const stopped = page();
    stopped.ride.toggle();
    vi.advanceTimersByTime(MS);
    stopped.win.dispatchEvent(input("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 1, screenY: 1 }));
    stopped.win.dispatchEvent(input("pointermove", { pointerId: 1, pointerType: "mouse", screenX: 2, screenY: 1 }));
    stopped.stop();
    expect(vi.getTimerCount()).toBe(0);
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
    // Settled, it wakes on a key and settles again after the wait, as any ride.
    tap(p, "KeyX");
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
    tap(p, "KeyX");
    p.ride.refocus();
    expect(button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    // Once is all: a later wake with nothing lost moves no focus.
    p.ride.refocus();
    expect(button.focus).toHaveBeenCalledTimes(1);
    // What a settling took is forgotten at the next, where nothing was asked back in between: settled with focus on the button,
    // woken, settled again with focus on the world, woken, and the button is given nothing.
    const stale = page(), kept = { dataset: { action: "ride" }, focus: vi.fn() };
    stale.doc.found['[data-action="ride"]'] = kept;
    stale.ride.toggle();
    stale.doc.activeElement = kept;
    vi.advanceTimersByTime(MS);
    stale.doc.activeElement = stale.body;
    tap(stale, "KeyX");
    stale.doc.activeElement = { name: "the world" };
    vi.advanceTimersByTime(MS);
    stale.doc.activeElement = stale.body;
    tap(stale, "KeyX");
    stale.ride.refocus();
    expect(kept.focus).not.toHaveBeenCalled();
    // Where the visitor has moved focus on, or it stayed where it was (the slider, the world), it is left there.
    p.doc.activeElement = button;
    vi.advanceTimersByTime(MS);
    p.doc.activeElement = { name: "the seek slider" };
    tap(p, "KeyX");
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
    tap(p, "KeyX");
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
    tap(p, "KeyX");
    p.ride.refocus();
    expect(settled.focus).toHaveBeenCalledTimes(1);
    expect(awake.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on the sleep timer as the look changes under it: the page draws it anew, in the settled look's corner or under the page's buttons, and the one with focus as the page wakes or settles is found again", () => {
    const p = page(), key = '[data-action="sleep"]';
    const corner = { dataset: { action: "sleep" }, focus: vi.fn() }, row = { dataset: { action: "sleep" }, focus: vi.fn() }, button = { dataset: { action: "ride" }, focus: vi.fn() };
    p.ride.toggle();
    p.doc.activeElement = button;
    vi.advanceTimersByTime(MS);
    p.doc.activeElement = p.body;
    p.ride.refocus();
    // Tab has brought focus to the settled look's sleep timer, and woken nothing. Then a key that is no control's wakes the page,
    // which draws the timer anew under its buttons: it has the focus there, not the ride's button, which lost it at the settling.
    p.doc.found[key] = corner;
    p.doc.activeElement = corner;
    tap(p, "KeyX");
    expect(p.ride.state().settled).toBe(false);
    p.doc.found[key] = row;
    p.doc.found['[data-action="ride"]'] = button;
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(row.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(button.focus).not.toHaveBeenCalled();
    // And back to the corner's as the page settles again.
    p.doc.activeElement = row;
    vi.advanceTimersByTime(MS);
    p.doc.found[key] = corner;
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(corner.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  // Elements of the page by kind, for a press or a key that lands on one: `closest` and `matches` answer for the kinds a selector lists.
  function kinds() {
    const Kind = class {
      isContentEditable = false;
      constructor(readonly kind: string) {}
      closest(selector: string) {
        return selector.split(", ").includes(this.kind) ? this : null;
      }
      matches(selector: string) {
        return selector.split(", ").some((one) => one === this.kind || one === this.kind.replace("[href]", ""));
      }
    };
    vi.stubGlobal("Element", Kind);
    vi.stubGlobal("HTMLElement", Kind);
    return Kind;
  }
  // A page in a ride that has settled, with a count of what the page is told from then on: a wake is one, whatever comes after.
  function settledPage() {
    const p = page(), Kind = kinds();
    p.ride.toggle();
    vi.advanceTimersByTime(MS);
    expect(p.ride.state().settled).toBe(true);
    let told = 0;
    p.ride.subscribe(() => { told += 1; });
    return { p, Kind, told: () => told };
  }

  it("leaves the settled page settled under a press on each kind of control the settled look shows, the link, the buttons and the slider, a finger's or a mouse's; a press on the bare world wakes it", () => {
    expect(CONTROLS).toBe("a[href], button, input, select, textarea, summary");
    const press = (pointerType: string, target: unknown) => ({ pointerId: 4, pointerType, button: 0, screenX: 80, screenY: 700, target });
    for (const kind of ["a[href]", "button", "input"]) for (const pointer of ["touch", "mouse"]) {
      const { p, Kind, told } = settledPage(), control = new Kind(kind);
      p.win.dispatchEvent(input("pointerdown", press(pointer, control)));
      expect(p.ride.state().settled, `${kind} ${pointer}`).toBe(true);
      p.win.dispatchEvent(input("pointerup", press(pointer, control)));
      p.win.dispatchEvent(input("click", { target: control }));
      vi.advanceTimersByTime(3 * MS);
      expect(p.ride.state(), `${kind} ${pointer}`).toEqual({ riding: true, settled: true, sleepEndsAt: null });
      expect(told(), `${kind} ${pointer}`).toBe(0);
      // The press shows the cursor, as a move does.
      expect(p.classes.has("cursor-off"), `${kind} ${pointer}`).toBe(true);
      p.win.dispatchEvent(input("pointerdown", press(pointer, control)));
      expect(p.classes.has("cursor-off"), `${kind} ${pointer}`).toBe(false);
      p.stop();
    }
    // The world, the title and the plates' text are no controls, and neither is what is no element: a press there wakes the page.
    for (const bare of ["div", "h1", "a", null]) for (const pointer of ["touch", "mouse"]) {
      const { p, Kind } = settledPage();
      p.win.dispatchEvent(input("pointerdown", press(pointer, bare === null ? { name: "the window" } : new Kind(bare))));
      expect(p.ride.state().settled, `${bare} ${pointer}`).toBe(false);
      p.stop();
    }
  });

  it("leaves the settled page settled under a key that moves focus, only modifies another, or is the focused control's own; every other key wakes it", () => {
    type Key = [string, string, string, Fields?];
    // Tab and Shift+Tab move focus among the settled look's controls; Enter and Space press a link or a button; the slider's keys
    // are its own; and a shortcut is the browser's.
    const quiet: Key[] = [
      ["Tab", "Tab", "div"], ["ShiftLeft", "Shift", "div"], ["Tab", "Tab", "button", { shiftKey: true }], ["ControlLeft", "Control", "div"], ["AltLeft", "Alt", "div"], ["MetaLeft", "Meta", "div"],
      ["Enter", "Enter", "a[href]"], ["Enter", "Enter", "button"], ["NumpadEnter", "Enter", "button"], ["Space", " ", "button"], ["Space", " ", "a[href]"],
      ["ArrowRight", "ArrowRight", "input"], ["KeyX", "x", "input"], ["KeyR", "r", "div", { metaKey: true }], ["KeyL", "l", "div", { ctrlKey: true }],
    ];
    for (const [code, key, kind, fields] of quiet) {
      const { p, Kind, told } = settledPage();
      p.win.dispatchEvent(input("keydown", { code, key, target: new Kind(kind), ...fields }));
      expect(p.ride.state().settled, `${code} on ${kind}`).toBe(true);
      p.win.dispatchEvent(input("keyup", { code, key, target: new Kind(kind), ...fields }));
      vi.advanceTimersByTime(MS);
      expect(told(), `${code} on ${kind}`).toBe(0);
      p.stop();
    }
    // A letter that is no control's, on the world or with focus on a button or a link; Enter and Space on the bare world, which
    // press nothing there; a look's key.
    const waking: Key[] = [["KeyX", "x", "div"], ["KeyX", "x", "button"], ["KeyX", "x", "a[href]"], ["Enter", "Enter", "div"], ["Space", " ", "div"], ["KeyT", "t", "div"]];
    for (const [code, key, kind] of waking) {
      const { p, Kind } = settledPage();
      p.win.dispatchEvent(input("keydown", { code, key, target: new Kind(kind) }));
      expect(p.ride.state().settled, `${code} on ${kind}`).toBe(false);
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
