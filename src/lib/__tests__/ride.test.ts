import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCarry, readCarry, writeCarry } from "../../components/world/carry";
import { controlKey, createRide, IDLE_S, idleMs, RIDE_NAME, sleepAfterPress, watchIdle } from "../../components/world/ride";
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

  it("has taken the place of both the names it replaces, in the code, the styles and the README", () => {
    const old = /lean.?back|walk with the bears/i;
    expect([...SOURCE, "README.md"].filter((file) => old.test(text(file)))).toEqual([]);
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

  it("takes a pointer that has not moved for no input: the move a browser sends as the page changes under a cursor at rest neither wakes it nor puts the settling off", () => {
    const { told, send } = watching();
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(MS - 1);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    vi.advanceTimersByTime(1);
    expect(told).toEqual([true]);
    send("pointermove", { pointerId: 1, screenX: 300, screenY: 200 });
    expect(told).toEqual([true]);
    // A pixel's move is one.
    send("pointermove", { pointerId: 1, screenX: 301, screenY: 200 });
    expect(told).toEqual([true, false]);
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
    // Two held, one let go: still held.
    const { told, send } = watching();
    send("keydown", { code: "ArrowLeft" });
    send("keydown", { code: "KeyT" });
    send("keyup", { code: "ArrowLeft" });
    vi.advanceTimersByTime(6 * MS);
    expect(told).toEqual([]);
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

  it("holds the settled look under a press on what it is told to hold, the seek slider, and wakes as the press lifts; awake, the same press is input like any other", () => {
    const slider = { name: "the seek slider" };
    const { told, send } = watching({ holds: (target) => (target as unknown) === slider });
    vi.advanceTimersByTime(MS);
    send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: slider });
    send("pointermove", { pointerId: 4, pointerType: "touch", screenX: 140, screenY: 700, target: slider });
    vi.advanceTimersByTime(3 * MS);
    expect(told).toEqual([true]);
    send("pointerup", { pointerId: 4, pointerType: "touch", screenX: 140, screenY: 700, target: slider });
    expect(told).toEqual([true, false]);
    // Awake, a press on the slider keeps the page awake and the wait starts over from its lift.
    send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: slider });
    send("pointerup", { pointerId: 4, pointerType: "touch", screenX: 80, screenY: 700, target: slider });
    vi.advanceTimersByTime(MS - 1);
    expect(told).toEqual([true, false]);
    // A press anywhere else on the settled page wakes it at once.
    vi.advanceTimersByTime(1);
    send("pointerdown", { pointerId: 4, pointerType: "touch", screenX: 200, screenY: 300, target: { name: "the world" } });
    expect(told).toEqual([true, false, true, false]);
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
    return { ride, stop, win, doc, classes, heard, key, release, world, body };
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
    p.win.dispatchEvent(input("pointermove", { pointerId: 1, screenX: 10, screenY: 10 }));
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
      expect(p.ride.left()).toBe(null);
      p.ride.pressSleep();
      expect(p.ride.left()).toBe(30);
      expect(p.ride.state().sleepEndsAt).toBe(Date.now() + 30 * 60_000);
      // Awake, the visitor holds a look key down all the while; settled, they leave the page alone.
      if (!settled) p.key("ArrowLeft");
      for (let minute = 1; minute <= 29; minute++) {
        vi.advanceTimersByTime(60_000);
        expect(p.ride.left()).toBe(30 - minute);
      }
      expect(p.ride.state().settled).toBe(settled);
      expect(p.heard).toEqual(["player:join"]);
      vi.advanceTimersByTime(60_000);
      expect(p.heard).toEqual(["player:join", "player:pause"]);
      expect(p.ride.left()).toBe(null);
      expect(p.ride.state()).toEqual({ riding: true, settled, sleepEndsAt: null });
      // It fired once.
      vi.advanceTimersByTime(600_000);
      expect(p.heard).toEqual(["player:join", "player:pause"]);
      p.stop();
    }
  });

  it("steps the sleep timer with each press, counts seconds under the test hook's unit, and turns it off as the visitor leaves", () => {
    const p = page({ unit: 1000 });
    p.ride.pressSleep();
    expect(p.ride.left()).toBe(null);
    p.ride.toggle();
    p.ride.pressSleep();
    expect(p.ride.state().sleepEndsAt).toBe(Date.now() + 30_000);
    vi.advanceTimersByTime(12_000);
    expect(p.ride.left()).toBe(18);
    // 18 s left counts as 30: the next is 60, then 90, then off.
    p.ride.pressSleep();
    expect(p.ride.left()).toBe(60);
    p.ride.pressSleep();
    expect(p.ride.left()).toBe(90);
    p.ride.pressSleep();
    expect(p.ride.left()).toBe(null);
    expect(p.ride.state().sleepEndsAt).toBe(null);
    p.ride.pressSleep();
    p.ride.leave();
    expect(p.ride.left()).toBe(null);
    vi.advanceTimersByTime(60_000);
    expect(p.heard).toEqual(["player:join"]);
  });

  it("brings a visitor who was riding on the page before in riding, settled at once, with the sleep timer as it was; and one who was not, not", () => {
    const p = page();
    const endsAt = Date.now() + 25 * 60_000;
    p.ride.arrive({ riding: true, sleepEndsAt: endsAt });
    expect(p.ride.state()).toEqual({ riding: true, settled: true, sleepEndsAt: endsAt });
    expect(p.classes.has("cursor-off")).toBe(true);
    expect(p.ride.left()).toBe(25);
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
    // Settled, the page has taken the button away and focus has fallen to the body; asked too soon, the ride gives nothing back.
    p.doc.activeElement = p.body;
    p.ride.refocus();
    expect(button.focus).not.toHaveBeenCalled();
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
    // Leaving a settled ride with its timer running is one change of the look and one of the timer, not a change for each field.
    p.ride.pressSleep();
    vi.advanceTimersByTime(MS);
    told = 0;
    p.ride.leave();
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
  });

  const storage = () => {
    const held = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => held.set(key, value), removeItem: (key: string) => held.delete(key) });
    return held;
  };

  it("hands the ride and its sleep timer to the next page, once", () => {
    storage();
    expect(readCarry()).toBe(null);
    writeCarry({ riding: true, sleepEndsAt: 1_800_000_000_000 });
    expect(readCarry()).toEqual({ riding: true, sleepEndsAt: 1_800_000_000_000 });
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
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(readCarry()).toBe(null);
    expect(() => writeCarry({ riding: true, sleepEndsAt: null })).not.toThrow();
    expect(() => clearCarry()).not.toThrow();
  });
});
