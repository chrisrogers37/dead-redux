import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fits, readResume } from "../../components/player/useResume";

// A show of 19 tracks, the featured date its place is saved under, and the key the player writes it to.
const TRACKS = 19;
const DATE = "1986-07-04";
const KEY = `dead-redux:position:${DATE}`;

describe("fits", () => {
  it("accepts a whole track index inside the queue with a position of zero or more", () => {
    expect(fits({ index: 0, seconds: 0 }, TRACKS)).toBe(true);
    expect(fits({ index: 3, seconds: 42.5 }, TRACKS)).toBe(true);
    expect(fits({ index: TRACKS - 1, seconds: 1800 }, TRACKS)).toBe(true);
  });

  it("rejects an index before the first track or at the queue's length", () => {
    expect(fits({ index: -1, seconds: 10 }, TRACKS)).toBe(false);
    expect(fits({ index: TRACKS, seconds: 10 }, TRACKS)).toBe(false);
  });

  it("rejects an index that is not a whole number", () => {
    expect(fits({ index: 1.5, seconds: 10 }, TRACKS)).toBe(false);
  });

  it("rejects a position that is negative or not finite", () => {
    for (const seconds of [-1, NaN, Infinity]) expect(fits({ index: 3, seconds }, TRACKS)).toBe(false);
  });
});

describe("readResume", () => {
  let saved: Map<string, string>;

  // Node has no localStorage: a Map answers in its place.
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
      removeItem: (key: string) => {
        saved.delete(key);
      },
      clear: () => {
        saved.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const save = (value: unknown) => {
    saved.set(KEY, JSON.stringify(value));
  };

  it("reads back the place the player saved, for its own featured date", () => {
    save({ index: 3, seconds: 42 });
    expect(readResume(DATE, TRACKS)).toEqual({ index: 3, seconds: 42 });
    expect(readResume("1986-07-05", TRACKS)).toBeNull();
  });

  it("finds nothing when nothing was saved", () => {
    expect(readResume(DATE, TRACKS)).toBeNull();
  });

  it("finds nothing when what was saved is not JSON", () => {
    for (const text of ['{"index":3,"seconds":', "3:42"]) {
      saved.set(KEY, text);
      expect(readResume(DATE, TRACKS)).toBeNull();
    }
  });

  it("finds nothing when what was saved is not an object", () => {
    for (const value of [5, "5", null]) {
      save(value);
      expect(readResume(DATE, TRACKS)).toBeNull();
    }
  });

  it("finds nothing when the index or the position is missing or not a number", () => {
    for (const value of [{ index: "3", seconds: "42" }, { index: 3 }, { seconds: 42 }, [3, 42]]) {
      save(value);
      expect(readResume(DATE, TRACKS)).toBeNull();
    }
  });

  it("finds nothing when the saved place does not fit the queue", () => {
    save({ index: TRACKS, seconds: 42 });
    expect(readResume(DATE, TRACKS)).toBeNull();
    // The same place fits a longer queue, so it was the queue that ruled it out.
    expect(readResume(DATE, TRACKS + 1)).toEqual({ index: TRACKS, seconds: 42 });
    save({ index: 3, seconds: -1 });
    expect(readResume(DATE, TRACKS)).toBeNull();
  });

  it("leaves the first track's first 15 seconds alone and resumes past them", () => {
    // 15 s is the last place in the first track that is not worth resuming.
    for (const seconds of [0, 15]) {
      save({ index: 0, seconds });
      expect(readResume(DATE, TRACKS)).toBeNull();
    }
    save({ index: 0, seconds: 16 });
    expect(readResume(DATE, TRACKS)).toEqual({ index: 0, seconds: 16 });
  });

  it("resumes the very start of any later track", () => {
    save({ index: 1, seconds: 0 });
    expect(readResume(DATE, TRACKS)).toEqual({ index: 1, seconds: 0 });
  });

  it("finds nothing when storage cannot be read", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage is unavailable");
      },
    });
    expect(readResume(DATE, TRACKS)).toBeNull();
  });
});
