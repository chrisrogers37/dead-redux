import { describe, expect, it } from "vitest";
import { joinMoves, type JoinMoves } from "../../components/player/join";

// A reordered or awaited play() is silent on a phone while a desktop browser still plays, so the order of the join's moves is checked
// here, not by listening. The player's own moves are played by recorders that note each call on one list, which is then the order the
// moves were made in; every test reads it right after a call that is not awaited.
type Call = ["goTo", number, number] | ["recue"] | ["play"] | ["start"];

// `play` is what the recorded play() returns: a real play() starts a promise, which the join must not wait for.
function recorders(play: () => unknown = () => undefined): { calls: Call[]; moves: JoinMoves } {
  const calls: Call[] = [];
  const moves: JoinMoves = {
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
    start: () => {
      calls.push(["start"]);
    },
  };
  return { calls, moves };
}

describe("joinMoves", () => {
  it("goes to the point it is given, its track and its position, then plays, then starts", () => {
    const { calls, moves } = recorders();
    joinMoves({ index: 4, seconds: 93.5 }, false, moves);
    expect(calls).toEqual([["goTo", 4, 93.5], ["play"], ["start"]]);
  });

  it("goes to the point and does not cue the track again when the source had failed", () => {
    const { calls, moves } = recorders();
    joinMoves({ index: 4, seconds: 93.5 }, true, moves);
    expect(calls).toEqual([["goTo", 4, 93.5], ["play"], ["start"]]);
  });

  it("cues the active track again, then plays, then starts, when the source failed and there is no point", () => {
    const { calls, moves } = recorders();
    joinMoves(null, true, moves);
    expect(calls).toEqual([["recue"], ["play"], ["start"]]);
  });

  it("plays, then starts, when there is no point and nothing failed", () => {
    const { calls, moves } = recorders();
    joinMoves(null, false, moves);
    expect(calls).toEqual([["play"], ["start"]]);
  });

  it("does not wait for play: it starts while play's promise is still pending, and returns nothing to wait on", () => {
    const { calls, moves } = recorders(() => new Promise<void>(() => {}));
    const returned = joinMoves(null, false, moves);
    expect(calls).toEqual([["play"], ["start"]]);
    expect(returned).toBeUndefined();
  });
});
