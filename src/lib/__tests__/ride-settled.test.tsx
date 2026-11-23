import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ShowSummary, Source } from "../types";

// What the settled look shows that can be pressed (src/components/world/WorldHome.tsx). A control there does what it does at the
// first press: the ride holds the look under a press on anything of the kinds in CONTROLS until its click has been delivered
// (ride.ts), since waking draws the page anew and a control drawn anew under a press gets no click. So this holds the settled page
// to a list of its controls, each of a kind CONTROLS names: a control of another kind, a plate with a handler of its own, say,
// would wake the page under its own press and must be added there first. The page is drawn to HTML with the ride a stand-in that
// is settled, and the next show's hook a stand-in that offers what a test asks.

type Next = { kind: "day" | "past"; href: string; line: string; carryOver: () => void } | null;
const stand = vi.hoisted(() => ({ ride: { riding: true, settled: true, sleepEndsAt: null as number | null }, next: null as unknown }));

vi.mock("../../components/world/ride", async (original) => ({
  ...(await original<object>()),
  createRide: () => ({ state: () => stand.ride, subscribe: () => () => {}, start: () => () => {}, toggle() {}, leave() {}, pressSleep() {}, arrive() {}, refocus() {} }),
}));
vi.mock("../../components/world/NextShow", async (original) => ({ ...(await original<object>()), useNextShow: () => stand.next }));

const { WorldHome } = await import("../../components/world/WorldHome");
const { CONTROLS } = await import("../../components/world/ride");

const show: ShowSummary = { date: "1986-07-04", venue: "Rich Stadium", location: "Buffalo, NY, USA", avgRating: 7.5, sourceCount: 1, hasSoundboard: true };
const source = {
  id: 1, uuid: "u", upstreamIdentifier: "gd1986-07-04.sbd.test", isSoundboard: true, isRemaster: false, avgRating: 7.5, avgRatingWeighted: 7.5, duration: 98, numReviews: 9, flacType: "",
  description: null, taperNotes: null, source: null, taper: null, lineage: null, transferrer: null, unlabeled: false,
  sets: [{ name: "Set 1", tracks: [{ title: "Tuning", duration: 98, trackPosition: 1, mp3Url: "https://archive.org/t.mp3", flacUrl: null }] }],
} satisfies Source;

// The page's HTML with the ride settled or awake, what the next show's hook offers, and a recording, none, or a look-up that failed.
function html({ settled = true, next = null as Next, recording = true, lookupFailed = false } = {}) {
  stand.ride = { riding: true, settled, sleepEndsAt: null };
  stand.next = next;
  return renderToStaticMarkup(
    createElement(WorldHome, {
      show, featuredDate: "2026-10-20", today: "2026-10-20", renderedAt: 0, pastPick: null, bestSource: recording ? source : null, isToday: true, tourName: null,
      testHooks: false, lookupFailed, shelves: "",
    }),
  );
}

const KINDS = CONTROLS.split(", ");
// Everything in the HTML that takes a press or the focus: each element of a kind that does, or with a tab stop or a role that says
// so, as its kind and its name (its action, its id, or what it links to).
function pressable(page: string): string[] {
  return [...page.matchAll(/<([a-z0-9]+)((?:\s[^>]*)?)>/g)].flatMap(([, tag, attrs]) => {
    const kind = tag === "a" && /\shref=/.test(attrs) ? "a[href]" : tag;
    if (!KINDS.includes(kind) && !/\s(tabindex|onclick)=|\srole="(button|link|slider|switch|tab|application)"/.test(attrs)) return [];
    const name = attrs.match(/\sdata-action="([^"]+)"/)?.[1] ?? attrs.match(/\sid="([^"]+)"/)?.[1] ?? attrs.match(/\shref="([^"]+)"/)?.[1] ?? (/\sdata-stick=/.test(attrs) ? "stick" : "?");
    return [`${kind} ${name}`];
  });
}
// The bare world, a press on which wakes the page at once, and the stick, which a settled ride hides.
const WORLD = "div world", STICK = "div stick";

describe("what the settled look shows that can be pressed", () => {
  const day: Next = { kind: "day", href: "/", line: "A new show is up for January 1.", carryOver: () => {} };
  const past: Next = { kind: "past", href: "/2026-10-19", line: "Barton Hall · May 8, 1977", carryOver: () => {} };

  it("is the seek slider alone on a page with a show; the chip's link beside it when a new day or a past pick is offered", () => {
    expect(pressable(html())).toEqual([WORLD, "input seek", STICK]);
    expect(pressable(html({ next: day }))).toEqual([WORLD, "a[href] play-next", "input seek", STICK]);
    expect(pressable(html({ next: past }))).toEqual([WORLD, "a[href] play-next", "input seek", STICK]);
    // The stick is on the page for the world to bind, hidden.
    expect(html()).toMatch(/<div data-stick=""[^>]*class="[^"]*\shidden!"/);
  });

  it("is the plate's button and link on a page whose recording could not be loaded, and its link on one with none", () => {
    expect(pressable(html({ recording: false, lookupFailed: true }))).toEqual([WORLD, "button retry", "a[href] https://relisten.net/grateful-dead/1986/07/04", STICK]);
    expect(pressable(html({ recording: false }))).toEqual([WORLD, "a[href] https://relisten.net/grateful-dead/1986/07/04", STICK]);
  });

  it("is of the kinds the ride holds the look under, each one, so each does what it does at the first press", () => {
    expect(CONTROLS).toBe("a[href], button, input, select, textarea, summary");
    for (const page of [html(), html({ next: day }), html({ next: past }), html({ recording: false, lookupFailed: true }), html({ recording: false })]) {
      for (const control of pressable(page)) {
        if (control !== WORLD && control !== STICK) expect(KINDS, control).toContain(control.split(" ")[0]);
      }
    }
    // The awake look has the rest of the HUD's controls, which a settled page does not show: the list above is the settled look's own.
    expect(pressable(html({ settled: false, next: day })).length).toBeGreaterThan(pressable(html({ next: day })).length + 8);
  });
});
