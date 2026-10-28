import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyBelongsToControl, lettersActive } from "../../components/player/keys";
import { lettersActive as worldLettersActive } from "../../../public/world/input.js";

// The page's elements, played by stand-ins that answer only what keys.ts asks of them: node has no DOM. `matches` knows the two
// selectors keys.ts uses and throws on any other, so a changed selector fails here instead of passing.
class FakeElement {
  tag: string;
  attrs: Record<string, string>;
  inWorld: boolean;

  constructor(tag: string, attrs: Record<string, string> = {}, inWorld = false) {
    this.tag = tag;
    this.attrs = attrs;
    this.inWorld = inWorld;
  }

  closest(selector: string): FakeElement | null {
    if (selector !== "#world") throw new Error(`no stand-in for the selector ${selector}`);
    return this.inWorld ? new FakeElement("main", { id: "world" }) : null;
  }
}

class FakeHTMLElement extends FakeElement {
  get isContentEditable(): boolean {
    return this.attrs.contenteditable === "true";
  }

  matches(selector: string): boolean {
    if (selector === "input, select, textarea") return ["input", "select", "textarea"].includes(this.tag);
    if (selector === "button, summary, a, [role='button']") {
      return ["button", "summary", "a"].includes(this.tag) || this.attrs.role === "button";
    }
    throw new Error(`no stand-in for the selector ${selector}`);
  }
}

const html = (tag: string, attrs: Record<string, string> = {}, inWorld = false) => new FakeHTMLElement(tag, attrs, inWorld);

type Held = { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };
// A key press as keys.ts reads it: the code, the modifiers held, and what has focus.
const press = (code: string, target: unknown, held: Held = {}) =>
  ({ code, ctrlKey: false, altKey: false, metaKey: false, ...held, target }) as unknown as KeyboardEvent;

// The Details switch's key: "off" turns the letter keys off outside the world.
const SINGLE_KEY = "dead-redux:single-key";
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyBelongsToControl", () => {
  // The elements that act on Space themselves.
  const pressable = () => [html("button"), html("summary"), html("a"), html("div", { role: "button" })];

  it("belongs to the browser whenever Ctrl, Alt or Meta is held, whatever has focus", () => {
    for (const held of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      for (const target of [html("div"), null]) expect(keyBelongsToControl(press("KeyK", target, held))).toBe(true);
    }
  });

  it("belongs to a text field: an input, a select or a textarea keeps every key", () => {
    for (const tag of ["input", "select", "textarea"]) {
      for (const code of ["KeyK", "Space"]) expect(keyBelongsToControl(press(code, html(tag)))).toBe(true);
    }
  });

  it("belongs to an editable element, whatever the key", () => {
    for (const code of ["KeyK", "Space"]) expect(keyBelongsToControl(press(code, html("div", { contenteditable: "true" })))).toBe(true);
  });

  it("keeps Space for a button, a summary, a link and a role=button element", () => {
    for (const target of pressable()) expect(keyBelongsToControl(press("Space", target))).toBe(true);
  });

  it("leaves the letter keys on those same elements to the player", () => {
    for (const target of pressable()) expect(keyBelongsToControl(press("KeyK", target))).toBe(false);
  });

  it("leaves Space on a plain element to the player", () => {
    expect(keyBelongsToControl(press("Space", html("div")))).toBe(false);
  });

  it("leaves every key to the player when the target is not an HTML element", () => {
    // The plain object claims to be a text field, so only the check on what the target is can turn it away.
    const claimsToBeAField = { tagName: "INPUT", isContentEditable: true, matches: () => true };
    for (const target of [null, claimsToBeAField, new FakeElement("svg")]) {
      for (const code of ["KeyK", "Space"]) expect(keyBelongsToControl(press(code, target))).toBe(false);
    }
  });
});

describe("lettersActive", () => {
  it("acts anywhere while single-key shortcuts are on: by default, and when stored as on", () => {
    expect(lettersActive(press("KeyK", html("div")))).toBe(true);
    stored.set(SINGLE_KEY, "on");
    expect(lettersActive(press("KeyK", html("div")))).toBe(true);
  });

  it("stays off outside the world while they are off, and acts inside it", () => {
    stored.set(SINGLE_KEY, "off");
    expect(lettersActive(press("KeyK", html("div")))).toBe(false);
    expect(lettersActive(press("KeyK", null))).toBe(false);
    expect(lettersActive(press("KeyK", html("canvas", {}, true)))).toBe(true);
  });

  it("counts unreadable storage as on", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage is unavailable");
      },
    });
    expect(lettersActive(press("KeyK", html("div")))).toBe(true);
  });
});

// The world keeps its own copy of the rule (public/world/input.js): it reads the Details switch from the data-single-key attribute the
// page mirrors onto <main>, where the player reads it from storage. The same stand-ins play the page's elements.
describe("the world's lettersActive", () => {
  // The page's <main>, which carries the Details switch as its data-single-key attribute: "on", "off", or none.
  const mainWith = (singleKey?: string) => ({ dataset: singleKey === undefined ? {} : { singleKey } });

  it("acts anywhere while the attribute is absent, since only off turns the letter keys off", () => {
    for (const target of [html("div"), null, html("canvas", {}, true)]) {
      expect(worldLettersActive(mainWith(), press("KeyK", target))).toBe(true);
    }
  });

  it("acts anywhere while the attribute is on", () => {
    for (const target of [html("div"), null, html("canvas", {}, true)]) {
      expect(worldLettersActive(mainWith("on"), press("KeyK", target))).toBe(true);
    }
  });

  it("stays off outside the world while the attribute is off", () => {
    for (const target of [html("div"), null]) {
      expect(worldLettersActive(mainWith("off"), press("KeyK", target))).toBe(false);
    }
  });

  it("acts inside the world while the attribute is off", () => {
    expect(worldLettersActive(mainWith("off"), press("KeyK", html("canvas", {}, true)))).toBe(true);
  });

  it("acts anywhere when the page has no main element", () => {
    for (const target of [html("div"), null, html("canvas", {}, true)]) {
      expect(worldLettersActive(null, press("KeyK", target))).toBe(true);
    }
  });

  it("answers as the player's rule does, on the same events", () => {
    const targets: [string, unknown][] = [
      ["a plain element", html("div")],
      ["no target", null],
      ["an element in the world", html("canvas", {}, true)],
    ];
    for (const setting of [undefined, "on", "off"]) {
      // One setting of the switch, held where each rule reads it: in storage for the player, on <main> for the world.
      stored.clear();
      if (setting !== undefined) stored.set(SINGLE_KEY, setting);
      for (const [where, target] of targets) {
        const e = press("KeyK", target);
        expect(worldLettersActive(mainWith(setting), e), `${setting ?? "unset"}, ${where}`).toBe(lettersActive(e));
      }
    }
  });
});
