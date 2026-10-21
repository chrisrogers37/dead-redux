import { useEffect, useEffectEvent } from "react";

/** localStorage key of the Details switch for single-key shortcuts: "off" turns the letter keys off at window level. */
export const SINGLE_KEY_STORAGE = "dead-redux:single-key";

/** Whether single-key shortcuts are on: the default, and whenever storage cannot be read. */
export function singleKeyOn(): boolean {
  try {
    return localStorage.getItem(SINGLE_KEY_STORAGE) !== "off";
  } catch {
    return true;
  }
}

/** Whether letter keys act for this key press: while single-key shortcuts are on, or while the world has focus. */
export function lettersActive(e: KeyboardEvent): boolean {
  return singleKeyOn() || (e.target instanceof Element && e.target.closest("#world") !== null);
}

/**
 * Whether a key press belongs to something other than the page: a browser shortcut (Ctrl, Alt or Meta held),
 * a text field, or, for Space, a button, summary or link, so form controls and Details keep their keys.
 */
export function keyBelongsToControl(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return true;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.matches("input, select, textarea")) return true;
  return e.code === "Space" && t.matches("button, summary, a, [role='button']");
}

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const LETTERS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

function onWorldOrPad(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("#world, [data-pad]") !== null;
}

/**
 * The join: the first move on the page starts the show. While `waiting`, capture-phase listeners on window watch keys, and pointer and
 * touch input on the world and the pad; the first event that counts as user activation calls `onMove` synchronously, inside that
 * event's own handler, and the listeners go. Mouse-look, the wheel and gamepads never count. Nothing stops the event, so the world
 * still gets it: the first key press also walks.
 */
export function useFirstMove(onMove: (e: Event) => void, waiting: boolean): void {
  const fire = useEffectEvent(onMove);

  useEffect(() => {
    if (!waiting) return;
    let done = false;
    const off: (() => void)[] = [];

    const listen = <K extends "keydown" | "pointerdown" | "pointerup" | "touchend">(type: K, handler: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, handler, { capture: true });
      off.push(() => window.removeEventListener(type, handler, { capture: true }));
    };
    const join = (e: Event) => {
      if (done) return;
      done = true;
      off.forEach((f) => f());
      fire(e);
    };
    const onPointer = (e: PointerEvent) => {
      if (!onWorldOrPad(e.target)) return;
      if (e.type === "pointerdown" ? e.pointerType === "mouse" : e.pointerType !== "mouse") join(e);
    };

    listen("keydown", (e) => {
      if (keyBelongsToControl(e)) return;
      if (e.code === "Space" || ARROWS.has(e.code) || (LETTERS.has(e.code) && lettersActive(e))) join(e);
    });
    listen("pointerdown", onPointer);
    listen("pointerup", onPointer);
    listen("touchend", (e) => {
      if (onWorldOrPad(e.target)) join(e);
    });
    return () => off.forEach((f) => f());
  }, [waiting]);
}
