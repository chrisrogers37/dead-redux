import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RideState } from "../../components/world/ride";
import type { ShowSummary, Source } from "../types";

// How the page is wired to the ride (src/components/world/WorldHome.tsx): what it marks on <main> for the world, what its one button
// does, what it hands the next page, and that it starts the ride listening. Node has no page to draw on, so WorldHome is called as
// the function it is, with React's hooks played by stand-ins: a state is its first value, a store its server's reading, and an
// effect is kept to be run by hand. The ride is a stand-in too, in whatever state a test puts it, and so is the next show's hook,
// which keeps what it was handed. What comes back is the page's tree of elements, whose props the tests read.

const stand = vi.hoisted(() => {
  const calls: string[] = [];
  const state = { riding: false, settled: false, sleepEndsAt: null as number | null };
  const ride = {
    state: () => state,
    subscribe: () => () => {},
    start: (options: unknown) => {
      calls.push(`start ${JSON.stringify(options)}`);
      return () => {};
    },
    toggle: () => {},
    leave: () => {},
    pressSleep: () => {},
    arrive: () => {},
    refocus: () => {
      calls.push("refocus");
    },
  };
  return { calls, state, ride, effects: [] as { run: () => unknown; deps?: unknown[] }[], next: null as Record<string, unknown> | null };
});

vi.mock("react", async (original) => ({
  ...(await original<object>()),
  useState: (first: unknown) => [typeof first === "function" ? (first as () => unknown)() : first, () => {}],
  useEffect: (run: () => unknown, deps?: unknown[]) => {
    stand.effects.push({ run, deps });
  },
  useMemo: (make: () => unknown) => make(),
  useRef: (current: unknown) => ({ current }),
  useEffectEvent: (handler: unknown) => handler,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown, server?: () => unknown) => (server ?? read)(),
}));
vi.mock("../../components/world/ride", async (original) => ({ ...(await original<object>()), createRide: () => stand.ride }));
vi.mock("../../components/world/NextShow", async (original) => ({
  ...(await original<object>()),
  useNextShow: (inputs: Record<string, unknown>) => {
    stand.next = inputs;
    return null;
  },
}));

const { WorldHome } = await import("../../components/world/WorldHome");

const show: ShowSummary = { date: "1986-07-04", venue: "Rich Stadium", location: "Buffalo, NY, USA", avgRating: 7.5, sourceCount: 1, hasSoundboard: true };
// A recording of one song, so the page has a player.
const source = {
  id: 1, uuid: "u", upstreamIdentifier: "gd1986-07-04.sbd.test", isSoundboard: true, isRemaster: false, avgRating: 7.5, avgRatingWeighted: 7.5, duration: 98, numReviews: 9, flacType: "",
  description: null, taperNotes: null, source: null, taper: null, lineage: null, transferrer: null, unlabeled: false,
  sets: [{ name: "Set 1", tracks: [{ title: "Tuning", duration: 98, trackPosition: 1, mp3Url: "https://archive.org/t.mp3", flacUrl: null }] }],
} satisfies Source;

type Node = ReactElement<Record<string, unknown>> & { type: unknown };
// Every element of a tree, the page's own and those it hands to components it does not draw here.
function all(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((child) => all(child, found));
  else if (node && typeof node === "object" && "props" in node) {
    found.push(node as Node);
    all((node as Node).props.children, found);
  }
  return found;
}
const named = (name: string) => (node: Node) => typeof node.type === "function" && (node.type as { name: string }).name === name;
const action = (name: string) => (node: Node) => node.props["data-action"] === name;

// The page with the ride in a state, on a preview or not, with the page's own query as the server reads it (none).
function page(state: Partial<RideState>, { testHooks = false, recording = true } = {}) {
  Object.assign(stand.state, { riding: false, settled: false, sleepEndsAt: null }, state);
  stand.effects.length = 0;
  stand.calls.length = 0;
  stand.next = null;
  const tree = WorldHome({
    show, featuredDate: "2026-10-20", today: "2026-10-20", renderedAt: 0, pastPick: null, bestSource: recording ? source : null, isToday: true, tourName: null,
    testHooks, lookupFailed: false, shelves: "",
  }) as Node;
  const nodes = all(tree);
  // The effects that are about the ride, by what they depend on, run as React runs them after the page is drawn.
  const runRideEffects = () => stand.effects.filter((effect) => effect.deps?.includes(stand.ride)).forEach((effect) => effect.run());
  return { main: tree, nodes, runRideEffects, one: (is: (node: Node) => boolean) => nodes.filter(is) };
}

const STATES: [string, Partial<RideState>][] = [
  ["out of a ride", {}],
  ["riding, awake", { riding: true }],
  ["riding, settled", { riding: true, settled: true }],
];

describe("the page's wiring to the ride", () => {
  beforeEach(() => {
    stand.effects.length = 0;
  });

  it("marks the ride on <main> for the world: nothing out of one, awake while the visitor touches the page, settled once they have left it alone", () => {
    expect(STATES.map(([, state]) => page(state).main.props["data-ride"])).toEqual([undefined, "awake", "settled"]);
    expect(page({}).main.type).toBe("main");
  });

  it("has one button for the ride, whose press is the ride's one control, and which reads pressed while the visitor rides, in either look it shows in", () => {
    for (const [name, state] of STATES.slice(0, 2)) {
      const buttons = page(state).one(action("ride"));
      expect(buttons, name).toHaveLength(1);
      expect(buttons[0].props.onClick, name).toBe(stand.ride.toggle);
      expect(buttons[0].props["aria-pressed"], name).toBe(state.riding === true);
    }
    // Settled, the button goes with the rest of the HUD.
    expect(page({ riding: true, settled: true }).one(action("ride"))).toEqual([]);
    // The still has it too: with no world, the page shows it as it does with one. (Here the world is still loading.)
    expect(page({}, { recording: false }).one(action("ride"))).toHaveLength(1);
  });

  it("shows the ride's own two buttons, the sleep timer and Leave, for as long as the visitor rides: a row under the page's buttons while it is awake, the settled look's corner once it has settled; and hands them the ride, the timer's end and its unit", () => {
    expect(page({}).one(named("RideRow"))).toEqual([]);
    const awake = page({ riding: true, sleepEndsAt: 1_800_000_000_000 }).one(named("RideRow"));
    expect(awake.map((row) => row.props)).toEqual([{ ride: stand.ride, sleepEndsAt: 1_800_000_000_000, unit: 60_000, settled: false }]);
    const settled = page({ riding: true, settled: true, sleepEndsAt: 5 });
    expect(settled.one(named("RideRow")).map((row) => row.props)).toEqual([{ ride: stand.ride, sleepEndsAt: 5, unit: 60_000, settled: true }]);
    // The corner is the page's last element, after the stick, as the settled look's order of focus has it: the chip, the slider, then these.
    const children = settled.main.props.children as unknown[];
    expect((children.filter(Boolean).at(-1) as Node).type).toBe(settled.one(named("RideRow"))[0].type);
  });

  it("strips the HUD only once the ride has settled: the player is told so, and the title, the buttons, the shelves' tabs and the legend go", () => {
    for (const [name, state] of STATES) {
      const { one } = page(state), settled = state.settled === true;
      expect(one(named("Player")).map((player) => player.props.settled), name).toEqual([settled]);
      expect(one(named("ShelfTab")).length, name).toBe(settled ? 0 : 3);
      expect(one((node) => node.type === "h1").length, name).toBe(settled ? 0 : 1);
      expect(one((node) => node.props["data-hud"] === "top").length, name).toBe(settled ? 0 : 2);
      // The stick stays on the page, hidden by a class of its own: the world binds it once.
      const [stick] = one((node) => node.props["data-stick"] === "");
      expect(String(stick.props.className).split(" ").includes("hidden!"), name).toBe(settled);
    }
  });

  it("hands the next page's hook the ride as it is, not its look: whether the visitor rides, when the timer ends, and the ride's own way in for a visitor who arrives riding", () => {
    for (const [name, state] of [...STATES, ["riding, awake, with a timer", { riding: true, sleepEndsAt: 77 }] as [string, Partial<RideState>]]) {
      page(state);
      expect(stand.next!.riding, name).toBe(state.riding === true);
      expect(stand.next!.sleepEndsAt, name).toBe(state.sleepEndsAt ?? null);
      expect(stand.next!.onCarry, name).toBe(stand.ride.arrive);
    }
  });

  it("starts the ride listening once the page is drawn, with the page's own ten seconds and minutes off a preview, and asks for focus back each time the page is drawn in its other look", () => {
    const out = page({});
    expect(stand.calls).toEqual([]);
    out.runRideEffects();
    expect(stand.calls).toEqual(['start {"idleMs":10000,"unitMs":60000}', "refocus"]);
    // Settled too: the settled look draws the chip's link anew, and the focus the awake one had goes to it (ride.ts).
    const settled = page({ riding: true, settled: true });
    settled.runRideEffects();
    expect(stand.calls).toEqual(['start {"idleMs":10000,"unitMs":60000}', "refocus"]);
    // The asking waits on the look alone: it is run again when the page settles or wakes, and for nothing else.
    const [, asking] = stand.effects.filter((effect) => effect.deps?.includes(stand.ride));
    expect(asking.deps).toEqual([stand.ride, true]);
    // What starts it is the ride's own start, whose answer is what stops it.
    const [starting] = stand.effects.filter((effect) => effect.deps?.includes(stand.ride));
    expect(typeof starting.run()).toBe("function");
  });
});
