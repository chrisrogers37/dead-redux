import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAway, matchShelvesCookie, parseShelves, setShelf, SHELVES, SHELVES_COOKIE, shelvesAway, shelvesFromCookie, subscribeShelves, withShelf } from "../../components/world/shelves";
import { WorldHome } from "../../components/world/WorldHome";
import type { ShowSummary } from "../types";

describe("parseShelves", () => {
  it("names the shelves a stored value puts away, in the shelves' own order, each once", () => {
    expect(parseShelves("player,title")).toBe("title,player");
    expect(parseShelves("actions,actions")).toBe("actions");
    expect(parseShelves("title,actions,player")).toBe("title,actions,player");
  });

  it("has every shelf out for nothing stored, an empty value or names it does not know", () => {
    expect(parseShelves(null)).toBe("");
    expect(parseShelves("")).toBe("");
    expect(parseShelves("sidebar, title")).toBe("");
  });
});

describe("shelvesFromCookie", () => {
  it("names the shelves a request's cookie puts away, and has every shelf out for a request without one", () => {
    expect(shelvesFromCookie("title,player")).toBe("title,player");
    expect(shelvesFromCookie("player,actions")).toBe("actions,player");
    expect(shelvesFromCookie(undefined)).toBe("");
    expect(shelvesFromCookie("")).toBe("");
  });

  it("lets nothing a visitor writes in the cookie through but the three names", () => {
    expect(shelvesFromCookie('player,"><script>alert(1)</script>,title')).toBe("title,player");
    expect(shelvesFromCookie('in" data-mode="leanback')).toBe("");
  });
});

describe("isAway and withShelf", () => {
  it("tells which shelves are away", () => {
    expect(isAway("title,player", "title")).toBe(true);
    expect(isAway("title,player", "actions")).toBe(false);
    expect(isAway("", "player")).toBe(false);
  });

  it("puts one shelf away or brings it out and leaves the others where they are", () => {
    expect(withShelf("", "player", true)).toBe("player");
    expect(withShelf("player", "title", true)).toBe("title,player");
    expect(withShelf("title,player", "title", false)).toBe("player");
    expect(withShelf("player", "player", true)).toBe("player");
    expect(withShelf("", "actions", false)).toBe("");
  });
});

describe("the stored shelves", () => {
  const stored = new Map<string, string>();
  let doc: EventTarget;
  // Each cookie the page wrote, as it was assigned to document.cookie.
  let cookies: string[];
  // The cookie that names `away` for a year, and the one that clears it.
  const YEAR = 365 * 24 * 60 * 60;
  const cookieFor = (away: string) => `dead-redux-shelves=${away}; path=/; max-age=${YEAR}; SameSite=Lax`;
  const CLEARED = "dead-redux-shelves=; path=/; max-age=0; SameSite=Lax";

  beforeEach(() => {
    stored.clear();
    cookies = [];
    doc = Object.defineProperty(new EventTarget(), "cookie", { set: (value: string) => void cookies.push(value) });
    vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with every shelf out, remembers each move, and tells this tab's listeners of it", () => {
    const heard = vi.fn();
    const stop = subscribeShelves(heard);
    expect(shelvesAway()).toBe("");
    setShelf("player", true);
    setShelf("title", true);
    expect(shelvesAway()).toBe("title,player");
    expect(stored.get("dead-redux:shelves")).toBe("title,player");
    setShelf("player", false);
    expect(shelvesAway()).toBe("title");
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    setShelf("title", false);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("writes a cookie that names the shelves put away, for a year on every path, and clears it once every shelf is out", () => {
    expect(SHELVES_COOKIE).toBe("dead-redux-shelves");
    setShelf("player", true);
    setShelf("title", true);
    setShelf("title", false);
    setShelf("player", false);
    expect(cookies).toEqual([cookieFor("player"), cookieFor("title,player"), cookieFor("player"), CLEARED]);
    // Each cookie's value, as a request carries it back, names to the server what storage held when it was written.
    const value = (cookie: string) => cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));
    expect(cookies.map((cookie) => shelvesFromCookie(value(cookie)))).toEqual(["player", "title,player", "player", ""]);
  });

  it("rewrites the cookie to match storage where the request's cookie named other shelves: none yet, another set, or ones storage no longer holds", () => {
    stored.set("dead-redux:shelves", "title,player");
    matchShelvesCookie("");
    matchShelvesCookie("player");
    expect(cookies).toEqual([cookieFor("title,player"), cookieFor("title,player")]);
    stored.clear();
    matchShelvesCookie("player");
    expect(cookies).toEqual([cookieFor("title,player"), cookieFor("title,player"), CLEARED]);
  });

  it("leaves the cookie alone where every shelf is out and the request named none, and writes it afresh on each load while a shelf is away, so it lasts from the last visit and not from the last press on a tab", () => {
    matchShelvesCookie("");
    expect(cookies).toEqual([]);
    stored.set("dead-redux:shelves", "actions");
    matchShelvesCookie("actions");
    matchShelvesCookie("actions");
    expect(cookies).toEqual([cookieFor("actions"), cookieFor("actions")]);
  });

  it("hears another tab's move through the storage event", () => {
    const heard = vi.fn();
    subscribeShelves(heard);
    window.dispatchEvent(new Event("storage"));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("keeps every shelf out where storage cannot be read, and still tells the listeners where it cannot be written", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    const heard = vi.fn();
    subscribeShelves(heard);
    expect(shelvesAway()).toBe("");
    expect(() => setShelf("title", true)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("names no shelf in the cookie where storage is blocked, as the page shows none away, and clears a cookie that still names one", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    setShelf("title", true);
    expect(cookies).toEqual([CLEARED]);
    matchShelvesCookie("title");
    expect(cookies).toEqual([CLEARED, CLEARED]);
  });

  it("still moves the shelf and tells the listeners where the cookie cannot be written", () => {
    vi.stubGlobal("document", Object.defineProperty(new EventTarget(), "cookie", { set: () => { throw new Error("blocked"); } }));
    const heard = vi.fn();
    subscribeShelves(heard);
    expect(() => setShelf("player", true)).not.toThrow();
    expect(shelvesAway()).toBe("player");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(() => matchShelvesCookie("")).not.toThrow();
  });
});

describe("the page the server sends", () => {
  const show: ShowSummary = { date: "1977-05-08", venue: "Barton Hall, Cornell University", location: "Ithaca, NY, USA", avgRating: 9, sourceCount: 1, hasSoundboard: true };
  // The world's page as the server renders it for a request whose cookie holds `cookie`, on a day without a recording.
  const page = (cookie: string | undefined) =>
    renderToStaticMarkup(
      createElement(WorldHome, {
        show, featuredDate: "2026-02-16", today: "2026-02-16", renderedAt: 0, pastPick: null, bestSource: null, isToday: true, tourName: null,
        testHooks: false, lookupFailed: false, shelves: shelvesFromCookie(cookie),
      }),
    );
  // Where the markup has each shelf, in the shelves' order: "in" for one put away, "out" for one on the screen.
  const shelves = (html: string) => Array.from(html.matchAll(/ data-shelf="(in|out)"/g), (found) => found[1]);
  // A shelf's tab, as its opening tag.
  const tab = (html: string, shelf: string) => new RegExp(`<button[^>]* data-shelf-tab="${shelf}"[^>]*>`).exec(html)?.[0] ?? "";

  it("has each shelf where the request's cookie puts it, so one put away is away before any script runs", () => {
    const html = page("player,title");
    expect(shelves(html)).toEqual(["in", "out", "in"]);
    expect(html).toContain(' data-shelves="title,player"');
    expect(SHELVES.map((shelf) => /aria-expanded="(\w+)"/.exec(tab(html, shelf))?.[1])).toEqual(["false", "true", "false"]);
  });

  it("has every shelf out for a request without the cookie, and for one whose cookie names none of them", () => {
    for (const cookie of [undefined, "", "sidebar"]) {
      const html = page(cookie);
      expect(shelves(html)).toEqual(["out", "out", "out"]);
      expect(html).not.toContain("data-shelves");
    }
  });

  it("gives each tab one label, the same whether its shelf is out or away, and points it at its shelf's body", () => {
    const out = page(undefined), away = page("title,actions,player");
    const labels = { title: "The show&#x27;s title", actions: "The page&#x27;s buttons", player: "The player" };
    for (const shelf of SHELVES) {
      for (const html of [out, away]) {
        expect(tab(html, shelf)).toContain(`aria-label="${labels[shelf]}"`);
        expect(tab(html, shelf)).toContain(`aria-controls="shelf-${shelf}"`);
        expect(html.split(`<div id="shelf-${shelf}" class="shelf-body `)).toHaveLength(2);
      }
    }
  });

  it("has each tab where a desktop shows it, so Tab reaches the buttons' tab after the buttons and before the player", () => {
    const html = page(undefined);
    // The title's tab, its body, the buttons, their tab, the player and its tab, each by where the markup has it.
    const marks = ['data-shelf-tab="title"', 'id="shelf-title"', 'id="shelf-actions"', 'data-action="share"', 'data-shelf-tab="actions"', 'id="shelf-player"', 'data-shelf-tab="player"'];
    const found = marks.map((mark) => html.indexOf(mark));
    expect(found).not.toContain(-1);
    expect(found).toEqual([...found].sort((a, b) => a - b));
  });
});
