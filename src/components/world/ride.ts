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
 * The longest wait a timeout can hold, in ms: 2^31 - 1, some 24 days. A longer one comes due at once, so a wait that re-arms itself
 * for what is left of it would spin, and a sleep timer would pause the show as it was set.
 */
export const TIMEOUT_MAX_MS = 2 ** 31 - 1;

/**
 * That wait in ms. The test hook ?idle=<seconds> sets it, so the shoot need not wait ten seconds a still: `testHooks` is the
 * server's word on whether hooks answer here (src/lib/test-hooks.ts), and the page's query is read only where it is true. It is
 * never more than a timeout can hold.
 */
export function idleMs(testHooks: boolean, search: string): number {
  const asked = testHooks ? new URLSearchParams(search).get("idle") : null;
  const seconds = asked === null || asked.trim() === "" ? NaN : Number(asked);
  return Math.min((Number.isFinite(seconds) && seconds >= 0 ? seconds : IDLE_S) * 1000, TIMEOUT_MAX_MS);
}

/** The sleep timer's unit: a minute, or a second under the test hook, so the shoot can watch a timer run out. */
const MINUTE_MS = 60_000, SECOND_MS = 1000;

/** That unit in ms. ?sleep=seconds asks for seconds, where the server says the test hooks answer, as for ?idle=. */
export function sleepUnitMs(testHooks: boolean, search: string): number {
  return testHooks && new URLSearchParams(search).get("sleep") === "seconds" ? SECOND_MS : MINUTE_MS;
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

/**
 * The units left on a sleep timer that ends at `endsAt` (ms since the epoch), at the time `now`, or null while it is off: the part
 * of a unit still running counts as one, so a timer that has not yet run out never reads 0.
 */
export function sleepLeft(endsAt: number | null, unitMs: number, now: number): number | null {
  return endsAt === null ? null : Math.max(1, Math.ceil((endsAt - now) / unitMs));
}

/** What the sleep timer's button says: off, or the units left with the unit's name. */
export function sleepLabel(left: number | null, unitMs: number): string {
  return `Sleep · ${left === null ? "off" : `${left} ${unitMs === SECOND_MS ? "s" : "min"}`}`;
}

/** Tells a listener once a second, for a reading of the clock that the page shows (useSyncExternalStore). Returns what stops it. */
export function eachSecond(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

/** The class on <html> while the cursor is hidden; globals.css hides the cursor under it. */
const CURSOR_OFF = "cursor-off";
/** How long a settled page shows its cursor after a pointer's move or press, or a key, in ms. */
export const CURSOR_MS = 3000;

/** What counts as input: a pointer that moves, presses or lifts, a key, the wheel. A touch and the stick are pointers. */
const INPUTS = ["pointermove", "pointerdown", "pointerup", "pointercancel", "keydown", "keyup", "wheel"] as const;
/** What ends every hold without saying so: a menu that opens under a press takes its lift, and so does a window that loses focus. */
const LETS_GO = ["blur", "contextmenu"] as const;
/** What shows a settled page's cursor, where it leaves the page settled: a pointer's move or press, and a key. */
const STIRS = new Set(["pointermove", "pointerdown", "keydown"]);

interface Idle {
  /** How long without input before the page settles, in ms. */
  ms: number;
  /** Whether the page is settled as the watch begins, as a ride carried over from the day before is. */
  settled: boolean;
  /** Whether a press here is on a control. On a settled page it does that control's work and wakes nothing; any other press wakes it. */
  control?: (target: EventTarget | null) => boolean;
  /** Whether a key leaves a settled page as it is. Any other key wakes it. */
  quiet?: (key: Input) => boolean;
  /** A pointer has moved or pressed, or a key has been pressed, on a settled page that stays settled. */
  onStir?: () => void;
  onChange: (settled: boolean) => void;
}

/** An input as the watch reads it: a pointer's or a key's event. */
type Input = Event & {
  pointerId?: number; pointerType?: string; button?: number; screenX?: number; screenY?: number; code?: string; key?: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean;
};

/**
 * Watches `target` (the window) for input: after `ms` with none the page settles.
 * Awake, every input puts the settling off, a pointer's move among them, so the HUD is not taken from under a hand that is using
 * it. A control held down, a key or a pointer, is input for as long as it is held, so a look that turns for a minute never settles
 * under the thumb that turns it. A hold that may never be let go in the page's hearing is not counted: a mouse's other buttons,
 * whose menu takes the lift, and a key pressed with Ctrl, Alt or Meta, a browser's shortcut, whose release a Mac does not send.
 * Settled, the page is there to be used as it is, and a mouse has to be able to reach what it shows. So a pointer that moves wakes
 * nothing; a press on a control (`control`) does that control's work and wakes nothing, and the page is not drawn anew under it;
 * and neither does a key that is `quiet`. What wakes the page is a press on anything else, the bare world, and any other key.
 * Whatever leaves the page settled starts no wait, since none runs until the page wakes, and `onStir` hears of it, for the cursor.
 * A pointer that has not moved is no input: a browser may send a move when the page changes under a cursor at rest, as it does
 * when the page settles. So the first move the watch hears only says where the pointer is, since a ride begun by a key has not
 * heard of the pointer yet, and a hand that moves it sends a second.
 * A mouse sends hundreds of moves a second, so an input only notes its time: one timeout is armed for the wait, and when it comes
 * due it is armed again for what is left of the wait since the last input, or the page settles. Returns what stops the watch.
 */
export function watchIdle(target: EventTarget, { ms, settled: start, control, quiet, onStir, onChange }: Idle): () => void {
  let settled = start;
  /** When input last came, by the page's own clock, and the one timeout, armed from an input until it next comes due. */
  let last = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What is held down: the keys by their codes, the pointers by their ids. */
  const keys = new Set<string>(), pointers = new Set<number>();
  /** Where the pointer last was on the screen, once an event has said. */
  let placed = false, atX = 0, atY = 0;

  const set = (to: boolean) => {
    if (settled === to) return;
    settled = to;
    onChange(to);
  };
  /* The wait has come due. Under a held control nothing happens, and the next input, its letting go at the latest, arms the wait
     again. Else it is armed for what is left of it since the last input, or with none left the page settles. */
  const due = () => {
    timer = undefined;
    if (keys.size > 0 || pointers.size > 0) return;
    const left = last + ms - performance.now();
    if (left > 0) timer = setTimeout(due, left);
    else set(true);
  };
  /* Input, or a letting go, on a page that is awake: the wait runs from now. */
  const note = () => {
    last = performance.now();
    if (timer === undefined) timer = setTimeout(due, ms);
  };
  const input = (e: Input) => {
    if (e.type.startsWith("pointer")) {
      const moved = placed && (atX !== e.screenX || atY !== e.screenY);
      placed = true;
      atX = e.screenX as number;
      atY = e.screenY as number;
      if (e.type === "pointermove" && !moved) return;
    }
    if (e.type === "pointerdown") {
      if (e.pointerType !== "mouse" || !e.button) pointers.add(e.pointerId ?? 0);
    } else if (e.type === "pointerup" || e.type === "pointercancel") pointers.delete(e.pointerId ?? 0);
    else if (e.type === "keydown") {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) keys.add(e.code as string);
    } else if (e.type === "keyup") keys.delete(e.code as string);
    if (settled) {
      const wakes = e.type === "pointerdown" ? !control?.(e.target) : e.type === "keydown" && !quiet?.(e);
      if (!wakes) {
        if (STIRS.has(e.type)) onStir?.();
        return;
      }
      set(false);
    }
    note();
  };
  const letGo = () => {
    keys.clear();
    pointers.clear();
    if (!settled) note();
  };

  for (const type of INPUTS) target.addEventListener(type, input);
  for (const type of LETS_GO) target.addEventListener(type, letGo);
  if (!settled) note();
  return () => {
    clearTimeout(timer);
    for (const type of INPUTS) target.removeEventListener(type, input);
    for (const type of LETS_GO) target.removeEventListener(type, letGo);
  };
}

/** What the page shows of the ride. */
export interface RideState {
  riding: boolean;
  /** Left alone long enough: the HUD is stripped to the settled look and the cursor hidden until the pointer moves. False out of a ride. */
  settled: boolean;
  /** When the sleep timer ends, in ms since the epoch, or null while it is off. Leaving the ride turns it off. */
  sleepEndsAt: number | null;
}

interface RideOptions {
  /** How long without input before the ride settles, in ms. */
  idleMs: number;
  /** The length of the sleep timer's unit in ms (sleepUnitMs). */
  unitMs: number;
}

export interface Ride {
  /** The ride as the page shows it; a new object whenever it changes, for useSyncExternalStore. */
  state(): RideState;
  subscribe(onChange: () => void): () => void;
  /**
   * Listens to the page from now on: the ride's keys, the world's word that a step has left the ride, and input. Returns what stops
   * the listening.
   */
  start(options: RideOptions): () => void;
  /** The one control: starts the ride, and the show with it, or ends it. */
  toggle(): void;
  /**
   * Leaves the ride. Leave's own press says how it was made: a click that counts no press of a pointer (`detail` 0) is a key's,
   * Enter or Space on the button, and then the ride's button has the focus Leave had.
   */
  leave(press?: { detail?: number }): void;
  /** A press on the sleep timer. */
  pressSleep(): void;
  /** What the page before handed over: a visitor who was riding arrives riding, settled at once, the sleep timer still running. */
  arrive(carry: Carry): void;
  /**
   * Once the page is drawn in its new look, gives focus back to the control that had it as the look changed, where the page drew
   * that control anew: awake, the control the settling took away; settled, a control the settled look shows too.
   */
  refocus(): void;
}

/**
 * What can be pressed, by kind. The settled look shows the seek slider, the sleep timer and Leave, the chip's link to the next
 * show, and, on a page with no recording, the plate's button and link (ride-settled.test.tsx holds the page to that list). A
 * press on any of them does its work and leaves the page settled (watchIdle), so each acts at the first press, a mouse's as a
 * finger's. A press on the bare world wakes the page.
 */
export const CONTROLS = "a[href], button, input, select, textarea, summary";
const onControl = (target: EventTarget | null) => typeof Element !== "undefined" && target instanceof Element && target.closest(CONTROLS) !== null;

/** The keys that only modify another: Shift, held for Tab, moves focus back. */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);
/**
 * Whether a key leaves the settled look as it is: Tab, which moves focus among the controls the look shows; a key that only modifies
 * another; a key that is a control's own or the browser's (keyBelongsToControl: the slider's keys, Space on a button or a link, a
 * shortcut); and Enter on a control, which presses it. Every other key wakes the page.
 */
const quietKey = (e: KeyboardEvent) => e.key === "Tab" || MODIFIERS.has(e.key) || keyBelongsToControl(e) || (e.key === "Enter" && onControl(e.target));

/** The ride's button, and the actions of the ride's own two controls, which leaving the ride takes off the page. */
const RIDE_BUTTON = '[data-action="ride"]';
const OWN = new Set(["sleep", "leave"]);

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
  /** What the page listens with, from `start` until it is stopped; null while it does not listen. */
  let options: RideOptions | null = null;
  let unwatch: (() => void) | null = null;
  /** The sleep timer's one timeout, due as the timer ends. */
  let sleeper: ReturnType<typeof setTimeout> | undefined;
  /** The control that had focus as the page settled. */
  let lost: string | null = null;
  /** Armed while a settled page shows its cursor: when it is due the cursor hides again. */
  let cursor: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  /* The cursor, hidden or shown from now on, whatever wait was running for it. */
  function hideCursor(hidden: boolean) {
    clearTimeout(cursor);
    cursor = undefined;
    document.documentElement.classList.toggle(CURSOR_OFF, hidden);
  }
  /* A settled page has been stirred and stays settled: its cursor shows, and hides again CURSOR_MS after the last stir. */
  function stir() {
    hideCursor(false);
    cursor = setTimeout(() => hideCursor(true), CURSOR_MS);
  }
  /* The watch for input, for as long as the visitor rides and the page listens. */
  function watch() {
    unwatch?.();
    unwatch = options && state.riding
      ? watchIdle(window, { ms: options.idleMs, settled: state.settled, control: onControl, quiet: (key) => quietKey(key as KeyboardEvent), onStir: stir, onChange: (settled) => become({ ...state, settled }) })
      : null;
  }
  /* The sleep timer: when it runs out it pauses the show. The ride stays on. */
  function expire() {
    document.dispatchEvent(new Event("player:pause"));
    become({ ...state, sleepEndsAt: null });
  }
  function armSleep() {
    clearTimeout(sleeper);
    sleeper = options && state.sleepEndsAt !== null ? setTimeout(expire, state.sleepEndsAt - Date.now()) : undefined;
  }
  /* Every change of the ride, each told to the page once. The cursor goes with the HUD and comes back with it; the control that
     has focus as the look changes is kept in mind, since the page draws most of them anew: settling, the one that has it then, and
     waking, the one that has it in the settled look, or else the one the settling took away; the sleep timer's timeout is armed
     for its new end; and the watch for input begins and ends with the ride. */
  function become(next: RideState) {
    const was = state;
    if (next.riding === was.riding && next.settled === was.settled && next.sleepEndsAt === was.sleepEndsAt) return;
    if (next.settled !== was.settled) {
      lost = controlKey(document.activeElement) ?? (next.settled ? null : lost);
      hideCursor(next.settled);
    }
    state = next;
    if (next.sleepEndsAt !== was.sleepEndsAt) armSleep();
    if (next.riding !== was.riding) watch();
    for (const listener of listeners) listener();
  }

  /* Leaves the ride. Where a key asked for it (`byKey`) and focus is on one of the ride's own two controls, which go with the
     ride, the ride's button has the focus after, so it does not fall to the page: at once where the button is on the page, the
     awake look, and else once the page has drawn it, which the settled look does not (refocus). A pointer's press moves no focus:
     it drew no ring on what it pressed, and gets none on another button. */
  function leave(byKey = false) {
    if (!state.riding) return;
    const own = byKey && OWN.has((document.activeElement as HTMLElement | null)?.dataset?.action ?? "");
    become({ riding: false, settled: false, sleepEndsAt: null });
    if (!own) return;
    const button = document.querySelector<HTMLElement>(RIDE_BUTTON);
    if (button) button.focus({ preventScroll: true });
    else lost = RIDE_BUTTON;
  }
  function toggle(byKey = false) {
    if (state.riding) {
      leave(byKey);
      return;
    }
    /* Asks the player to start the show (nothing once it has), inside the press that asked for the ride. */
    document.dispatchEvent(new Event("player:join"));
    become({ riding: true, settled: false, sleepEndsAt: null });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") leave(true);
    else if ((e.code === "KeyB" || e.code === "KeyF") && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) toggle(true);
  }

  return {
    state: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    start(next) {
      options = next;
      const key = (e: Event) => onKey(e as KeyboardEvent);
      /* Any walking control leaves the ride for a walk, in the world; the page follows. */
      const mode = (e: Event) => {
        if ((e as CustomEvent<{ mode?: string }>).detail?.mode === "walk") leave();
      };
      window.addEventListener("keydown", key);
      document.addEventListener("world:mode", mode);
      watch();
      armSleep();
      /* A page that listens again while its ride is settled hides the cursor again. */
      hideCursor(state.settled);
      return () => {
        options = null;
        window.removeEventListener("keydown", key);
        document.removeEventListener("world:mode", mode);
        watch();
        armSleep();
        /* The cursor is the document's, which outlives the page: a page that goes while settled gives it back. */
        hideCursor(false);
      };
    },
    toggle: () => toggle(),
    leave: (press) => leave(press?.detail === 0),
    pressSleep() {
      if (!state.riding || !options) return;
      const now = Date.now(), units = sleepAfterPress(sleepLeft(state.sleepEndsAt, options.unitMs, now));
      become({ ...state, sleepEndsAt: units === null ? null : now + units * options.unitMs });
    },
    arrive(carry) {
      if (!carry.riding) return;
      /* A timer that ran out on the way is over on arrival, and the show stays paused. */
      const over = carry.sleepEndsAt !== null && carry.sleepEndsAt <= Date.now();
      become({ riding: true, settled: true, sleepEndsAt: over ? null : carry.sleepEndsAt });
      if (over) document.dispatchEvent(new Event("player:pause"));
    },
    refocus() {
      if (lost === null) return;
      const key = lost;
      /* Awake, every control is on the page again, and this is the one time it is looked for; settled, it is kept for the wake. */
      if (!state.settled) lost = null;
      const focused = document.activeElement;
      if (focused && focused !== document.body) return;
      document.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
    },
  };
}
