/** localStorage key of the Details switch for the view: "first" walks through the bear's eyes, "third" shows it from behind. */
const VIEW_STORAGE = "dead-redux:view";
/** Fired on document when the setting changes; the storage event reaches only other tabs. */
const VIEW_EVENT = "dead-redux:view-change";

/** Whether the first-person view is on: off by default, and whenever storage cannot be read. */
export function firstPersonOn(): boolean {
  try {
    return localStorage.getItem(VIEW_STORAGE) === "first";
  } catch {
    return false;
  }
}

/** Turns the first-person view on or off, and tells this tab's listeners. */
export function setFirstPerson(on: boolean): void {
  try {
    localStorage.setItem(VIEW_STORAGE, on ? "first" : "third");
  } catch {
    // storage unavailable: the view stays third person
  }
  document.dispatchEvent(new Event(VIEW_EVENT));
}

/** Subscribes to changes of the setting, from this tab or another, for useSyncExternalStore. */
export function subscribeView(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  document.addEventListener(VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    document.removeEventListener(VIEW_EVENT, onChange);
  };
}
