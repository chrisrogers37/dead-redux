import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cueQueue } from "../../components/player/cue";

// The player tells the world where the queue is cued with a player:track event on document, which node does not have, so a stand-in
// keeps each event's type and detail.
let told: { type: string; detail: unknown }[];

beforeEach(() => {
  told = [];
  vi.stubGlobal("document", {
    dispatchEvent: (e: Event) => {
      told.push({ type: e.type, detail: (e as CustomEvent).detail });
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cueQueue", () => {
  it("moves the queue and tells the world the track and the position it is cued at", () => {
    const queue = { index: 0 };
    cueQueue(queue, 18, 281);
    expect(queue.index).toBe(18);
    expect(told).toEqual([{ type: "player:track", detail: { index: 18, position: 281 } }]);
  });

  it("tells the world a cue within the track the queue is on", () => {
    const queue = { index: 0 };
    cueQueue(queue, 0, 93);
    expect(told).toEqual([{ type: "player:track", detail: { index: 0, position: 93 } }]);
  });
});
