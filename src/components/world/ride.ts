import { keyBelongsToControl, lettersActive } from "@/components/player/keys";
import type { Carry } from "./carry";

/**
 * The ride: the page's one way to be carried along the setlist with the bears. One control starts and ends it. While the visitor
 * touches the page it is awake, with the whole HUD; left alone it settles, to the title, the line and the seek slider, and any
 * input wakes it. The page marks <main data-ride="awake"> or "settled", which the world reads for its camera (public/world/modes.js).
 */

/**
 * The ride's name, said here and nowhere else in the code: its button, the button's tooltip and the legend read it, and the README's
 * table of keys is held to it (ride.test.ts).
 */
export const RIDE_NAME = "Ride with the bears";

/** How long a ride goes without input before it settles, in seconds. */
export const IDLE_S = 10;

/**
 * That wait in ms. The test hook ?idle=<seconds> shortens it, so the shoot need not wait ten seconds a still: `testHooks` is the
 * server's word on whether hooks answer here (src/lib/test-hooks.ts), and the page's query is read only where it is true.
 */
export function idleMs(testHooks: boolean, search: string): number {
  const asked = testHooks ? new URLSearchParams(search).get("idle") : null;
  const seconds = asked === null || asked.trim() === "" ? NaN : Number(asked);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : IDLE_S) * 1000;
}

/** The sleep timer's lengths, in units; a press moves to the next, and past the last to off. */
const SLEEP_STEPS = [30, 60, 90];

/**
 * What a press makes of the sleep timer, in units, or null for off: off, 30, 60, 90, off. A running timer, with `left` units to go,
 * counts as the shortest length that still holds it.
 */
export function sleepAfterPress(left: number | null): number | null {
  if (left === null) return SLEEP_STEPS[0];
  const held = SLEEP_STEPS.findIndex((step) => step >= left);
  return held === -1 ? null : (SLEEP_STEPS[held + 1] ?? null);
}

/** The class on <html> while the cursor is hidden; globals.css hides the cursor under it. */
const CURSOR_OFF = "cursor-off";

/** What counts as input: a pointer that moves, presses or lifts, a key, the wheel. A touch and the stick are pointers. */
const INPUTS = ["pointermove", "pointerdown", "pointerup", "pointercancel", "keydown", "keyup", "wheel"] as const;
/** What ends every hold without saying so: a menu that opens under a press takes its lift, and so does a window that loses focus. */
const LETS_GO = ["blur", "contextmenu"] as const;

interface Idle {
  /** How long without input before the page settles, in ms. */
  ms: number;
  /** Whether the page is settled as the watch begins, as a ride carried over from the day before is. */
  settled: boolean;
  /** Whether a press on this holds the look as it is until the press lifts. */
  holds?: (target: EventTarget | null) => boolean;
  onChange: (settled: boolean) => void;
}

/** An input as the watch reads it: a pointer's or a key's event. */
type Input = Event & { pointerId?: number; pointerType?: string; button?: number; screenX?: number; screenY?: number; code?: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };

/**
 * Watches `target` (the window) for input: after `ms` with none the page settles, and any input wakes it. A control held down, a
 * key or a pointer, is input for as long as it is held, so a look that turns for a minute never settles under the thumb that turns
 * it. A hold that may never be let go in the page's hearing is not counted: a mouse's other buttons, whose menu takes the lift, and
 * a key pressed with Ctrl, Alt or Meta, a browser's shortcut, whose release a Mac does not send. A pointer that has not moved is no
 * input: a browser sends a move when the page changes under a cursor at rest, as it does when the page settles. A press that
 * begins on what `holds` names wakes the page only as it lifts, so the slider a finger has hold of is not moved from under it.
 * Returns what stops the watch.
 */
export function watchIdle(target: EventTarget, { ms, settled: start, holds, onChange }: Idle): () => void {
  let settled = start;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What is held down: a key by its code, a pointer by its id. */
  const held = new Set<string>();
  /** The pointer whose press holds the look, if any. */
  let holding: string | null = null;
  /** Where the pointer last was on the screen. */
  let at: [number | undefined, number | undefined] | null = null;

  const set = (to: boolean) => {
    if (settled === to) return;
    settled = to;
    onChange(to);
  };
  const wait = () => {
    clearTimeout(timer);
    timer = held.size > 0 ? undefined : setTimeout(() => set(true), ms);
  };
  const input = (e: Input) => {
    const pointer = `pointer ${e.pointerId}`;
    if (e.type.startsWith("pointer")) {
      const moved = at === null || at[0] !== e.screenX || at[1] !== e.screenY;
      at = [e.screenX, e.screenY];
      if (e.type === "pointermove" && !moved) return;
    }
    if (e.type === "pointerdown") {
      if (e.pointerType !== "mouse" || !e.button) held.add(pointer);
      if (settled && held.has(pointer) && holds?.(e.target)) holding = pointer;
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      held.delete(pointer);
      if (holding === pointer) holding = null;
    } else if (e.type === "keydown") {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) held.add(`key ${e.code}`);
    } else if (e.type === "keyup") held.delete(`key ${e.code}`);
    if (holding === null) set(false);
    wait();
  };
  const letGo = () => {
    held.clear();
    holding = null;
    wait();
  };

  for (const type of INPUTS) target.addEventListener(type, input);
  for (const type of LETS_GO) target.addEventListener(type, letGo);
  wait();
  return () => {
    clearTimeout(timer);
    for (const type of INPUTS) target.removeEventListener(type, input);
    for (const type of LETS_GO) target.removeEventListener(type, letGo);
  };
}

/** What the page shows of the ride. */
export interface RideState {
  riding: boolean;
  /** Left alone long enough: the HUD is stripped and the cursor hidden. False out of a ride. */
  settled: boolean;
  /** When the sleep timer ends, in ms since the epoch, or null while it is off. Leaving the ride turns it off. */
  sleepEndsAt: number | null;
}

interface RideOptions {
  /** How long without input before the ride settles, in ms. */
  idleMs: number;
  /** The length of the sleep timer's unit in ms: a minute, or a second under the test hook. */
  unitMs: number;
}

export interface Ride {
  /** The ride as the page shows it; a new object whenever it changes, for useSyncExternalStore. */
  state(): RideState;
  /** The units left on the sleep timer, refreshed each second; null while it is off. */
  left(): number | null;
  subscribe(onChange: () => void): () => void;
  /**
   * Listens to the page from now on: the ride's keys, the world's word that a step has left the ride, and input. Returns what stops
   * the listening.
   */
  start(options: RideOptions): () => void;
  /** The one control: starts the ride, and the show with it, or ends it. */
  toggle(): void;
  leave(): void;
  /** A press on the sleep timer. */
  pressSleep(): void;
  /** What the page before handed over: a visitor who was riding arrives riding, settled at once, the sleep timer still running. */
  arrive(carry: Carry): void;
  /** Once the page is awake again, gives focus back to the control that had it when the page settled and took the control away. */
  refocus(): void;
}

/** The seek slider, which stays through both looks: a press on it holds the look until it lifts. */
const onSeek = (target: EventTarget | null) => typeof Element !== "undefined" && target instanceof Element && target.closest("[data-action='seek']") !== null;

/** How to find a control again once the page has drawn it anew: by its action, and a shelf's tab by its shelf. Null for any other. */
export function controlKey(el: Element | null): string | null {
  const data = (el as HTMLElement | null)?.dataset;
  if (!data?.action) return null;
  return `[data-action="${data.action}"]${data.shelfTab ? `[data-shelf-tab="${data.shelfTab}"]` : ""}`;
}

/**
 * A page's ride. It holds the ride's state apart from the page's render, so the idle wait and the sleep timer run whatever the page
 * shows, and so each rule can be tried without a browser. B and F both toggle it and Escape leaves it; a step in the world leaves it
 * too, which the world says with `world:mode`.
 */
export function createRide(): Ride {
  let state: RideState = { riding: false, settled: false, sleepEndsAt: null };
  let left: number | null = null;
  let options: RideOptions = { idleMs: IDLE_S * 1000, unitMs: 60_000 };
  let started = false;
  let unwatch: (() => void) | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  /** The control that had focus as the page settled. */
  let lost: string | null = null;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  const set = (next: Partial<RideState>) => {
    const to = { ...state, ...next };
    if (to.riding === state.riding && to.settled === state.settled && to.sleepEndsAt === state.sleepEndsAt) return;
    state = to;
    tell();
  };

  /* The page's look and the ride itself, in one change. The cursor goes with the HUD and comes back with it; and the control that
     has focus as the HUD goes is kept in mind, since the page draws it anew when it wakes. */
  function show(riding: boolean, settled: boolean) {
    if (settled && !state.settled) lost = controlKey(document.activeElement);
    document.documentElement.classList.toggle(CURSOR_OFF, settled);
    set({ riding, settled });
  }
  /* The watch for input, for as long as the visitor rides and the page listens. */
  function watch() {
    unwatch?.();
    unwatch = started && state.riding ? watchIdle(window, { ms: options.idleMs, settled: state.settled, holds: onSeek, onChange: (settled) => show(true, settled) }) : null;
  }

  /* The sleep timer: it reads the time left each second and pauses the show when it runs out. The ride stays on. */
  function tick() {
    if (state.sleepEndsAt === null) return;
    const units = Math.ceil((state.sleepEndsAt - Date.now()) / options.unitMs);
    if (units <= 0) {
      document.dispatchEvent(new Event("player:pause"));
      sleep(null);
    } else if (left !== units) {
      left = units;
      tell();
    }
  }
  function sleep(endsAt: number | null) {
    clearInterval(ticker);
    ticker = undefined;
    left = null;
    set({ sleepEndsAt: endsAt });
    if (endsAt === null) return;
    tick();
    if (state.sleepEndsAt !== null) ticker = setInterval(tick, 1000);
  }

  function leave() {
    if (!state.riding) return;
    show(false, false);
    sleep(null);
    watch();
  }
  function toggle() {
    if (state.riding) {
      leave();
      return;
    }
    /* Asks the player to start the show (nothing once it has), inside the press that asked for the ride. */
    document.dispatchEvent(new Event("player:join"));
    show(true, false);
    watch();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") leave();
    else if ((e.code === "KeyB" || e.code === "KeyF") && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) toggle();
  }

  return {
    state: () => state,
    left: () => left,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    start(next) {
      options = next;
      started = true;
      const key = (e: Event) => onKey(e as KeyboardEvent);
      /* Any walking control leaves the ride for a walk, in the world; the page follows. */
      const mode = (e: Event) => {
        if ((e as CustomEvent<{ mode?: string }>).detail?.mode === "walk") leave();
      };
      window.addEventListener("keydown", key);
      document.addEventListener("world:mode", mode);
      watch();
      if (state.sleepEndsAt !== null && ticker === undefined) ticker = setInterval(tick, 1000);
      return () => {
        started = false;
        window.removeEventListener("keydown", key);
        document.removeEventListener("world:mode", mode);
        watch();
        clearInterval(ticker);
        ticker = undefined;
      };
    },
    toggle,
    leave,
    pressSleep() {
      if (!state.riding) return;
      const units = sleepAfterPress(left);
      sleep(units === null ? null : Date.now() + units * options.unitMs);
    },
    arrive(carry) {
      if (!carry.riding) return;
      show(true, true);
      sleep(carry.sleepEndsAt);
      watch();
    },
    refocus() {
      if (state.settled || lost === null) return;
      const key = lost;
      lost = null;
      const focused = document.activeElement;
      if (focused && focused !== document.body) return;
      document.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
    },
  };
}
