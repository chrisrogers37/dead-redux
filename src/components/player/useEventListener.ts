import { useEffect, useEffectEvent } from "react";

/**
 * Listens for an event on window or document while mounted; the handler always sees the latest render. The target is named rather
 * than passed, so the call is safe while rendering on the server.
 */
export function useEventListener<E extends Event = Event>(target: "window" | "document", type: string, handler: (e: E) => void): void {
  const fire = useEffectEvent(handler);

  useEffect(() => {
    const t: EventTarget = target === "window" ? window : document;
    const listener = (e: Event) => fire(e as E);
    t.addEventListener(type, listener);
    return () => t.removeEventListener(type, listener);
  }, [target, type]);
}
