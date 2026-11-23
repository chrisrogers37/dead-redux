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

/** What counts as input: a pointer that moves, presses or lifts, a key, the wheel. A touch and the stick are pointers. */
const INPUTS = ["pointermove", "pointerdown", "pointerup", "pointercancel", "keydown", "keyup", "wheel"] as const;
/** What ends every hold without saying so: a menu that opens under a press takes its lift, and so does a window that loses focus. */
const LETS_GO = ["blur", "contextmenu"] as const;
/**
 * For a listener that hears an event on its way down to its target. Said as an object: Node's EventTarget (v25.9), which the tests
 * listen on, does not remove a listener whose removal says `true`.
 */
const ON_THE_WAY_DOWN = { capture: true };
/** The keys that press the control that has focus: they click a link or a button. */
const PRESS_KEYS = new Set(["Enter", "NumpadEnter", "Space"]);

/**
 * How long the look holds on once a press on a control has ended, for the click that may follow, in ms. A mouse's click comes in
 * the same turn as its lift. A tap's comes in a later one: 1 to 8 ms after the lift in Chromium with a touch screen emulated. The
 * wait is far longer than that, for a main thread busy with a frame, and for a browser that holds a tap's click back to see whether
 * a second tap follows. A press that brings no click, a finger's slide along the slider, wakes the page this long after it lifts.
 */
export const CLICK_WAIT_MS = 400;

interface Idle {
  /** How long without input before the page settles, in ms. */
  ms: number;
  /** Whether the page is settled as the watch begins, as a ride carried over from the day before is. */
  settled: boolean;
  /** Whether a press on this holds the look as it is until the press has ended and its click has been delivered. */
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
 * input: a browser may send a move when the page changes under a cursor at rest, as it does when the page settles. So the first
 * move the watch hears only says where the pointer is, since a ride begun by a key has not heard of the pointer yet, and a hand
 * that moves it sends a second.
 * A press that begins on what `holds` names, a control the settled look shows, holds the look until the press has done what it
 * does: a pointer's press, or the press of a key that clicks the control with focus. Waking draws the page anew, and a control
 * drawn anew or moved between a press and its lift gets no click, so the link would not be followed and the slider would go from
 * under the finger. The look holds until the click that follows the press has been delivered, or for CLICK_WAIT_MS after the
 * press ends where none follows, and then the page wakes. A press that is cancelled brings no click, and wakes the page at once.
 * A mouse sends hundreds of moves a second, so an input only notes its time: one timeout is armed for the wait, and when it comes
 * due it is armed again for what is left of the wait since the last input, or the page settles. Returns what stops the watch.
 */
export function watchIdle(target: EventTarget, { ms, settled: start, holds, onChange }: Idle): () => void {
  let settled = start;
  /** When input last came, by the page's own clock, and the one timeout, armed from an input until it next comes due. */
  let last = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What is held down: the keys by their codes, the pointers by their ids. */
  const keys = new Set<string>(), pointers = new Set<number>();
  /** The press that holds the look, if any: the pointer's id, or the key's code. */
  let holding: number | string | null = null;
  /** Armed once that press has ended or its click has come: when it is due the hold is over and the page wakes. */
  let ending: ReturnType<typeof setTimeout> | undefined;
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
  /* Input, or a letting go: the wait runs from now. */
  const note = () => {
    last = performance.now();
    if (timer === undefined) timer = setTimeout(due, ms);
  };
  /* A press on a control of the settled look begins: the look holds from here. */
  const hold = (by: number | string) => {
    clearTimeout(ending);
    ending = undefined;
    holding = by;
  };
  /* The hold ends after `wait`: CLICK_WAIT_MS from the end of the press, or none once its click has come, which is then delivered
     before the page is drawn anew. */
  const endHold = (wait: number) => {
    clearTimeout(ending);
    ending = setTimeout(() => {
      ending = undefined;
      holding = null;
      set(false);
      note();
    }, wait);
  };
  /* A click: the one a held press was for, if that press has ended, or is a key's, whose click may come while the key is down. */
  const clicked = () => {
    if (holding !== null && (ending !== undefined || typeof holding === "string")) endHold(0);
  };
  const input = (e: Input) => {
    if (e.type.startsWith("pointer")) {
      const moved = placed && (atX !== e.screenX || atY !== e.screenY);
      placed = true;
      atX = e.screenX as number;
      atY = e.screenY as number;
      if (e.type === "pointermove" && !moved) return;
    }
    const pointer = e.pointerId ?? 0, code = e.code as string;
    if (e.type === "pointerdown") {
      if (e.pointerType !== "mouse" || !e.button) {
        pointers.add(pointer);
        if (settled && holds?.(e.target)) hold(pointer);
      }
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      pointers.delete(pointer);
      if (holding === pointer) {
        if (e.type === "pointerup") endHold(CLICK_WAIT_MS);
        else holding = null;
      }
    } else if (e.type === "keydown") {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        keys.add(code);
        if (settled && PRESS_KEYS.has(code) && holds?.(e.target)) hold(code);
      }
    } else if (e.type === "keyup") {
      keys.delete(code);
      if (holding === code && ending === undefined) endHold(CLICK_WAIT_MS);
    }
    if (holding === null) set(false);
    note();
  };
  /* A press that is let go without a word holds nothing more; one that had ended still wakes the page when its wait is over. */
  const letGo = () => {
    keys.clear();
    pointers.clear();
    holding = null;
    note();
  };

  for (const type of INPUTS) target.addEventListener(type, input);
  for (const type of LETS_GO) target.addEventListener(type, letGo);
  /* The click is heard on its way down, before anything on the page can stop it. */
  target.addEventListener("click", clicked, ON_THE_WAY_DOWN);
  note();
  return () => {
    clearTimeout(timer);
    clearTimeout(ending);
    for (const type of INPUTS) target.removeEventListener(type, input);
    for (const type of LETS_GO) target.removeEventListener(type, letGo);
    target.removeEventListener("click", clicked, ON_THE_WAY_DOWN);
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
  leave(): void;
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
 * What can be pressed, by kind. The settled look shows the seek slider, the chip's link to the next show, and, on a page with no
 * recording, the plate's button and link (ride-settled.test.tsx holds the page to that list). A press on any of them holds the
 * look until it has done what it does (watchIdle), so each acts at the first press. A press on the bare world wakes the page at
 * once.
 */
export const CONTROLS = "a[href], button, input, select, textarea, summary";
const onControl = (target: EventTarget | null) => typeof Element !== "undefined" && target instanceof Element && target.closest(CONTROLS) !== null;

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
  const listeners = new Set<() => void>();

  /* The watch for input, for as long as the visitor rides and the page listens. */
  function watch() {
    unwatch?.();
    unwatch = options && state.riding ? watchIdle(window, { ms: options.idleMs, settled: state.settled, holds: onControl, onChange: (settled) => become({ ...state, settled }) }) : null;
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
     has focus as the HUD goes is kept in mind, since the page draws it anew, in the settled look if that shows it and when it
     wakes; the sleep timer's timeout is armed for its new end; and the watch for input begins and ends with the ride. */
  function become(next: RideState) {
    const was = state;
    if (next.riding === was.riding && next.settled === was.settled && next.sleepEndsAt === was.sleepEndsAt) return;
    if (next.settled && !was.settled) lost = controlKey(document.activeElement);
    if (next.settled !== was.settled) document.documentElement.classList.toggle(CURSOR_OFF, next.settled);
    state = next;
    if (next.sleepEndsAt !== was.sleepEndsAt) armSleep();
    if (next.riding !== was.riding) watch();
    for (const listener of listeners) listener();
  }

  function leave() {
    become({ riding: false, settled: false, sleepEndsAt: null });
  }
  function toggle() {
    if (state.riding) {
      leave();
      return;
    }
    /* Asks the player to start the show (nothing once it has), inside the press that asked for the ride. */
    document.dispatchEvent(new Event("player:join"));
    become({ riding: true, settled: false, sleepEndsAt: null });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") leave();
    else if ((e.code === "KeyB" || e.code === "KeyF") && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) toggle();
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
      return () => {
        options = null;
        window.removeEventListener("keydown", key);
        document.removeEventListener("world:mode", mode);
        watch();
        armSleep();
      };
    },
    toggle,
    leave,
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
