import { describe, it, expect } from "vitest";
import { flatten, nextIndex, prevIndex, setName } from "../queue";
import type { Source, Track } from "../types";

function track(title: string): Track {
  return { title, duration: 60, trackPosition: 1, mp3Url: `https://example.org/${title}.mp3`, flacUrl: null };
}

const a = track("a");
const b = track("b");
const c = track("c");

const source: Source = {
  id: 1,
  uuid: "uuid-1",
  upstreamIdentifier: "gd-queue-test",
  isSoundboard: true,
  isRemaster: false,
  avgRating: 8,
  avgRatingWeighted: 8,
  duration: 180,
  numReviews: 1,
  flacType: "Flac16Bit",
  description: null,
  taperNotes: null,
  source: null,
  taper: null,
  lineage: null,
  transferrer: null,
  unlabeled: false,
  sets: [
    { name: "Set", tracks: [a, b] },
    { name: null, tracks: [c] },
  ],
};

describe("flatten", () => {
  it("is empty without a source", () => {
    expect(flatten(null)).toEqual([]);
  });

  it("lists every set's tracks in order", () => {
    expect(flatten(source)).toEqual([a, b, c]);
  });
});

describe("nextIndex", () => {
  it("is the track after", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
  });

  it("is null at the last track, and in a queue of one or none", () => {
    expect(nextIndex(2, 3)).toBe(null);
    expect(nextIndex(0, 1)).toBe(null);
    expect(nextIndex(0, 0)).toBe(null);
  });
});

describe("prevIndex", () => {
  it("restarts the current track once more than 3 s of it have played", () => {
    expect(prevIndex(5, 10, 3.5)).toBe(5);
    expect(prevIndex(0, 10, 30)).toBe(0);
  });

  it("goes back a track at 3 s or less", () => {
    expect(prevIndex(5, 10, 3)).toBe(4);
    expect(prevIndex(5, 10, 0)).toBe(4);
  });

  it("never goes before the first track", () => {
    expect(prevIndex(0, 10, 1)).toBe(0);
    expect(prevIndex(0, 0, 0)).toBe(0);
  });
});

describe("setName", () => {
  it("names set 1, set 2 and the encore when both starts are known", () => {
    const sets = { set2Start: 7, encoreStart: 18 };
    expect(setName(0, sets)).toBe("Set 1");
    expect(setName(6, sets)).toBe("Set 1");
    expect(setName(7, sets)).toBe("Set 2");
    expect(setName(17, sets)).toBe("Set 2");
    expect(setName(18, sets)).toBe("Encore");
  });

  it("names nothing for a show with neither start", () => {
    const sets = { set2Start: null, encoreStart: null };
    expect(setName(0, sets)).toBe(null);
    expect(setName(9, sets)).toBe(null);
  });

  it("names only the encore while set 2's start is unknown", () => {
    const sets = { set2Start: null, encoreStart: 18 };
    expect(setName(5, sets)).toBe(null);
    expect(setName(18, sets)).toBe("Encore");
  });

  it("names set 1 and set 2 for a show with no encore", () => {
    const sets = { set2Start: 7, encoreStart: null };
    expect(setName(6, sets)).toBe("Set 1");
    expect(setName(18, sets)).toBe("Set 2");
  });
});
