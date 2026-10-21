/** localStorage key of the Details switch for single-key shortcuts: "off" turns the letter keys off at window level. */
const SINGLE_KEY_STORAGE = "dead-redux:single-key";
/** Fired on document when the setting changes; the storage event reaches only other tabs. */
const SINGLE_KEY_EVENT = "dead-redux:single-key-change";

/** Whether single-key shortcuts are on: the default, and whenever storage cannot be read. */
export function singleKeyOn(): boolean {
  try {
    return localStorage.getItem(SINGLE_KEY_STORAGE) !== "off";
  } catch {
    return true;
  }
}

/** Turns single-key shortcuts on or off, and tells this tab's listeners. */
export function setSingleKey(on: boolean): void {
  try {
    localStorage.setItem(SINGLE_KEY_STORAGE, on ? "on" : "off");
  } catch {
    // storage unavailable: the shortcuts stay on
  }
  document.dispatchEvent(new Event(SINGLE_KEY_EVENT));
}

/** Subscribes to changes of the setting, from this tab or another, for useSyncExternalStore. */
export function subscribeSingleKey(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  document.addEventListener(SINGLE_KEY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    document.removeEventListener(SINGLE_KEY_EVENT, onChange);
  };
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
