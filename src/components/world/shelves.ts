/**
 * The HUD's three shelves: the show's title (top left), the page's buttons (top right) and the now-plate's stack (bottom right). A tab
 * beside each puts it away past its edge of the screen and brings it back, so the world can be seen whole.
 */
export const SHELVES = ["title", "actions", "player"] as const;
export type Shelf = (typeof SHELVES)[number];

/** localStorage key of the shelves put away: their names, in SHELVES' order, joined by commas; "" or nothing when all are out. */
const SHELVES_STORAGE = "dead-redux:shelves";
/**
 * The cookie that carries the same string to the server, which renders each shelf where the visitor left it. Storage alone is read
 * only once the page's script runs, so a shelf put away would load out and then slide off.
 */
export const SHELVES_COOKIE = "dead-redux-shelves";
/** How long the cookie lasts, in seconds: a year. */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
/** Fired on document when a shelf moves; the storage event reaches only other tabs. */
const SHELVES_EVENT = "dead-redux:shelves-change";

/** The shelves a stored value names, in SHELVES' order, each once, joined by commas; anything else in it is dropped. */
export function parseShelves(value: string | null): string {
  const named = (value ?? "").split(",");
  return SHELVES.filter((shelf) => named.includes(shelf)).join(",");
}

/**
 * The shelves a request's cookie puts away, for the server's render: parseShelves' string, so whatever a visitor writes in the cookie,
 * only the three names reach the markup.
 */
export function shelvesFromCookie(value: string | undefined): string {
  return parseShelves(value ?? null);
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

/** Writes the cookie to match `away`, on every path, for a year; with every shelf out it is cleared. */
function writeCookie(away: string): void {
  try {
    document.cookie = `${SHELVES_COOKIE}=${away}; path=/; max-age=${away ? COOKIE_MAX_AGE : 0}; SameSite=Lax`;
  } catch {
    // cookies unavailable: the server renders every shelf out, and the page puts the stored ones away once it has loaded
  }
}

/**
 * Puts a shelf away or brings it out, and tells this tab's listeners. Storage is what this browser goes by, and the cookie is written
 * to match what it now holds, so where storage cannot be written the cookie names no shelf either.
 */
export function setShelf(shelf: Shelf, put: boolean): void {
  try {
    localStorage.setItem(SHELVES_STORAGE, withShelf(shelvesAway(), shelf, put));
  } catch {
    // storage unavailable: the shelves stay out
  }
  writeCookie(shelvesAway());
  document.dispatchEvent(new Event(SHELVES_EVENT));
}

/**
 * Once the page has hydrated: where the shelves stored here differ from `sent`, the ones the request's cookie named and the server
 * rendered, the stored ones stand (useSyncExternalStore has drawn them by then) and the cookie is rewritten to match, so the next
 * load's HTML is right. That is a visitor whose cookie was cleared, or who put a shelf away before there was a cookie. While any
 * shelf is away the cookie is written again on every load, which keeps it a year from the last visit, or a week where the browser
 * caps a script's cookie at that (Safari): it would otherwise be dropped a week after the last press on a tab, however often the
 * visitor came.
 */
export function matchShelvesCookie(sent: string): void {
  const away = shelvesAway();
  if (away !== sent || away) writeCookie(away);
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
