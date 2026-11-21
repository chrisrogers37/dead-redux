/**
 * The HUD's three shelves: the show's title (top left), the page's buttons (top right) and the now-plate's stack (bottom right). A tab
 * beside each puts it away past its edge of the screen and brings it back, so the world can be seen whole.
 */
export const SHELVES = ["title", "actions", "player"] as const;
export type Shelf = (typeof SHELVES)[number];

/** localStorage key of the shelves put away: their names, in SHELVES' order, joined by commas; "" or nothing when all are out. */
const SHELVES_STORAGE = "dead-redux:shelves";
/** Fired on document when a shelf moves; the storage event reaches only other tabs. */
const SHELVES_EVENT = "dead-redux:shelves-change";

/** The shelves a stored value names, in SHELVES' order, each once, joined by commas; anything else in it is dropped. */
export function parseShelves(value: string | null): string {
  const named = (value ?? "").split(",");
  return SHELVES.filter((shelf) => named.includes(shelf)).join(",");
}

/** Whether `away` (parseShelves' string) names a shelf. */
export function isAway(away: string, shelf: Shelf): boolean {
  return away.split(",").includes(shelf);
}

/** `away` with a shelf put away or brought out. */
export function withShelf(away: string, shelf: Shelf, put: boolean): string {
  return SHELVES.filter((s) => (s === shelf ? put : isAway(away, s))).join(",");
}

/** The shelves put away: none by default, and whenever storage cannot be read. A string, so useSyncExternalStore can compare it. */
export function shelvesAway(): string {
  try {
    return parseShelves(localStorage.getItem(SHELVES_STORAGE));
  } catch {
    return "";
  }
}

/** Puts a shelf away or brings it out, and tells this tab's listeners. */
export function setShelf(shelf: Shelf, put: boolean): void {
  try {
    localStorage.setItem(SHELVES_STORAGE, withShelf(shelvesAway(), shelf, put));
  } catch {
    // storage unavailable: the shelves stay out
  }
  document.dispatchEvent(new Event(SHELVES_EVENT));
}

/** Subscribes to the shelves' moves, from this tab or another, for useSyncExternalStore. */
export function subscribeShelves(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  document.addEventListener(SHELVES_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    document.removeEventListener(SHELVES_EVENT, onChange);
  };
}
