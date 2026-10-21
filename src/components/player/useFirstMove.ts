import { useEffect, useEffectEvent } from "react";
import { keyBelongsToControl, lettersActive } from "./keys";

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const LETTERS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

function onWorldOrPad(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("#world, [data-pad]") !== null;
}

/**
 * The join: the first move on the page starts the show. While `waiting`, capture-phase listeners on window watch the walking keys,
 * and pointer and touch input on the world and the pad; the first event that counts as user activation calls `onMove` synchronously,
 * inside that event's own handler, and the listeners go. Space joins through the player's play key. Mouse-look, the wheel and
 * gamepads never count. Nothing stops the event, so the world still gets it: the first key press also walks.
 */
export function useFirstMove(onMove: () => void, waiting: boolean): void {
  const fire = useEffectEvent(onMove);

  useEffect(() => {
    if (!waiting) return;
    let done = false;
    const off: (() => void)[] = [];

    const listen = <K extends "keydown" | "pointerdown" | "pointerup" | "touchend">(type: K, handler: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, handler, { capture: true });
      off.push(() => window.removeEventListener(type, handler, { capture: true }));
    };
    const join = () => {
      if (done) return;
      done = true;
      off.forEach((f) => f());
      fire();
    };
    const onPointer = (e: PointerEvent) => {
      if (!onWorldOrPad(e.target)) return;
      if (e.type === "pointerdown" ? e.pointerType === "mouse" : e.pointerType !== "mouse") join();
    };

    listen("keydown", (e) => {
      if (keyBelongsToControl(e)) return;
      if (ARROWS.has(e.code) || (LETTERS.has(e.code) && lettersActive(e))) join();
    });
    listen("pointerdown", onPointer);
    listen("pointerup", onPointer);
    listen("touchend", (e) => {
      if (onWorldOrPad(e.target)) join();
    });
    return () => off.forEach((f) => f());
  }, [waiting]);
}
