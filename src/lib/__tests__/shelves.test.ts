import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAway, parseShelves, setShelf, shelvesAway, subscribeShelves, withShelf } from "../../components/world/shelves";

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

  beforeEach(() => {
    stored.clear();
    doc = new EventTarget();
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
});
