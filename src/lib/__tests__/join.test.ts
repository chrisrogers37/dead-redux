import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinMoves, type JoinMoves } from "../../components/player/join";

// A reordered or awaited play() is silent on a phone while a desktop browser still plays, so the order of the join's moves is checked
// here, not by listening. Its moves are the player's own, played by recorders, and the player:start event it dispatches on document,
// which node does not have, played by a stand-in. All of them note themselves on one list, which is then the order they were made in;
// every test reads it right after a call that is not awaited.
type Call = ["goTo", number, number] | ["recue"] | ["play"] | ["event", string];

let calls: Call[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("document", {
    dispatchEvent: (e: Event) => {
      calls.push(["event", e.type]);
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// `play` is what the recorded play() returns: a real play() starts a promise, which the join must not wait for.
function recorders(play: () => unknown = () => undefined): JoinMoves {
  return {
    goTo: (index, seconds) => {
      calls.push(["goTo", index, seconds]);
    },
    recue: () => {
      calls.push(["recue"]);
    },
    play: () => {
      calls.push(["play"]);
      return play();
    },
  };
}

describe("joinMoves", () => {
  it("goes to the point it is given, its track and its position, then plays, then dispatches player:start", () => {
    joinMoves({ index: 4, seconds: 93.5 }, false, recorders());
    expect(calls).toEqual([["goTo", 4, 93.5], ["play"], ["event", "player:start"]]);
  });

  it("goes to the point and does not cue the track again when the source had failed", () => {
    joinMoves({ index: 4, seconds: 93.5 }, true, recorders());
    expect(calls).toEqual([["goTo", 4, 93.5], ["play"], ["event", "player:start"]]);
  });

  it("cues the active track again, then plays, then dispatches player:start, when the source failed and there is no point", () => {
    joinMoves(null, true, recorders());
    expect(calls).toEqual([["recue"], ["play"], ["event", "player:start"]]);
  });

  it("plays, then dispatches player:start, when there is no point and nothing failed", () => {
    joinMoves(null, false, recorders());
    expect(calls).toEqual([["play"], ["event", "player:start"]]);
  });

  it("does not wait for play: it dispatches player:start while play's promise is still pending, and returns nothing to wait on", () => {
    const returned = joinMoves(null, false, recorders(() => new Promise<void>(() => {})));
    expect(calls).toEqual([["play"], ["event", "player:start"]]);
    expect(returned).toBeUndefined();
  });
});
