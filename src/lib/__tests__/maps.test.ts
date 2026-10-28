import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildUp,
  checkMap,
  envAt,
  loadMap,
  MAX_PEAKS,
  readMap,
  tempoAt,
} from "../../../public/world/maps.js";

// A show of two tracks at one second a step: "Touch Of Grey" lasts 5 s analysed and listed, and "Fire On The Mountain" is 24 s
// analysed and listed at 30 s, a length a reading is never stretched by.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/map-tiny.json", import.meta.url), "utf8"));

// A loose, mutable copy of the fixture (or of another map).
const copy = (map: unknown = fixture) => JSON.parse(JSON.stringify(map));
type Loose = ReturnType<typeof copy>;

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const zeros = (n: number) => b64(Array.from({ length: n }, () => 0));
const peaksAt = (n: number) => Array.from({ length: n }, (_, i) => [i, 0.5]);

// A track of `seconds` seconds at one second a step, quiet and with no tempo.
function quiet(seconds: number) {
  return {
    title: "Quiet",
    analysedDuration: seconds,
    playingDuration: seconds,
    env: { rms: zeros(seconds), bass: zeros(seconds), bright: zeros(seconds) },
    tempo: zeros(2 * Math.ceil(seconds / 10)),
    peaks: peaksAt(0),
  };
}

// The fixture rebuilt for a step: every envelope series is j * 10 for j = 0..ceil(analysedDuration / step) - 1.
function atStep(step: number) {
  const map = copy();
  map.step = step;
  for (const track of map.tracks) {
    const series = b64(Array.from({ length: Math.ceil(track.analysedDuration / step) }, (_, j) => j * 10));
    track.env = { rms: series, bass: series, bright: series };
  }
  return map;
}

const INVALID: { name: string; change: (map: Loose) => void; problem: RegExp }[] = [
  {
    name: "a version other than 1",
    change: (m) => {
      m.v = 2;
    },
    problem: /^v is 2, not 1$/,
  },
  {
    name: "a show that is not YYYY-MM-DD",
    change: (m) => {
      m.show = "1986-7-4";
    },
    problem: /^show is "1986-7-4", not a YYYY-MM-DD date$/,
  },
  {
    name: "a show date its month does not have",
    change: (m) => {
      m.show = "1986-02-30";
    },
    problem: /^show is "1986-02-30", not a YYYY-MM-DD date$/,
  },
  {
    name: "a show date that is not on the calendar",
    change: (m) => {
      m.show = "1986-13-45";
    },
    problem: /^show is "1986-13-45"/,
  },
  {
    name: "an analysed identifier that is not an archive.org one",
    change: (m) => {
      m.analysed = "gd1986 07 04";
      m.playing = "gd1986 07 04";
    },
    problem: /^analysed is "gd1986 07 04", not an archive\.org identifier$/,
  },
  {
    name: "a playing recording other than the analysed one",
    change: (m) => {
      m.playing = "gd1990-01-01.sbd.other.12345.flac16";
    },
    problem: /^playing is not the analysed recording$/,
  },
  {
    name: "a step outside the list",
    change: (m) => {
      m.step = 3;
    },
    problem: /^step is 3, not one of 1, 2, 4, 8$/,
  },
  {
    name: "an extra key",
    change: (m) => {
      m.extra = true;
    },
    problem: /^extra is unexpected$/,
  },
  {
    name: "no tracks",
    change: (m) => {
      delete m.tracks;
    },
    problem: /^tracks is missing$/,
  },
  {
    name: "tracks that are not a list",
    change: (m) => {
      m.tracks = {};
    },
    problem: /^tracks is not an array$/,
  },
  {
    name: "an empty list of tracks",
    change: (m) => {
      m.tracks = [];
    },
    problem: /^tracks has 0 entries, not 1 to 200$/,
  },
  {
    name: "a track that is not an object",
    change: (m) => {
      m.tracks[1] = "Fire On The Mountain";
    },
    problem: /^tracks\[1\] is not an object$/,
  },
  {
    name: "an empty title",
    change: (m) => {
      m.tracks[0].title = "";
    },
    problem: /^tracks\[0\]\.title is not a string of 1 to 300 characters$/,
  },
  {
    name: "an analysed duration of 0",
    change: (m) => {
      m.tracks[1].analysedDuration = 0;
    },
    problem: /^tracks\[1\]\.analysedDuration is 0, not above 0 and up to 86400 seconds$/,
  },
  {
    name: "a playing duration over a day",
    change: (m) => {
      m.tracks[0].playingDuration = 86401;
    },
    problem: /^tracks\[0\]\.playingDuration is 86401, not above 0 and up to 86400 seconds$/,
  },
  {
    name: "an envelope series one byte short",
    change: (m) => {
      m.tracks[0].env.rms = b64([0, 64, 128, 192]);
    },
    problem: /^tracks\[0\]\.env\.rms has 4 bytes, not 5$/,
  },
  {
    name: "an envelope series that is not base64",
    change: (m) => {
      m.tracks[0].env.bass = "!!!!";
    },
    problem: /^tracks\[0\]\.env\.bass is not base64$/,
  },
  {
    name: "an envelope without its bright series",
    change: (m) => {
      delete m.tracks[0].env.bright;
    },
    problem: /^tracks\[0\]\.env\.bright is missing$/,
  },
  {
    name: "a tempo of 4 bytes for 3 windows",
    change: (m) => {
      m.tracks[1].tempo = b64([96, 128, 0, 0]);
    },
    problem: /^tracks\[1\]\.tempo has 4 bytes, not 6$/,
  },
  {
    name: "a tempo of 30 bpm",
    change: (m) => {
      m.tracks[0].tempo = b64([30, 200]);
    },
    problem: /^tracks\[0\]\.tempo byte 0 is 30, not 0 or 60 to 200$/,
  },
  {
    name: "a tempo of 201 bpm in the second window",
    change: (m) => {
      m.tracks[1].tempo = b64([96, 128, 0, 0, 201, 255]);
    },
    problem: /^tracks\[1\]\.tempo byte 4 is 201, not 0 or 60 to 200$/,
  },
  {
    name: "a peak at the track's end",
    change: (m) => {
      m.tracks[0].peaks = [[5, 0.5]];
    },
    problem: /^tracks\[0\]\.peaks\[0\]\[0\] is 5, not a whole second before 5$/,
  },
  {
    name: "a peak between two seconds",
    change: (m) => {
      m.tracks[0].peaks = [[2.5, 0.5]];
    },
    problem: /^tracks\[0\]\.peaks\[0\]\[0\] is 2\.5, not a whole second before 5$/,
  },
  {
    name: "peaks out of time order",
    change: (m) => {
      m.tracks[1].peaks = [
        [10, 0.5],
        [5, 0.5],
      ];
    },
    problem: /^tracks\[1\]\.peaks\[1\]\[0\] is 5, not after 10$/,
  },
  {
    name: "two peaks in one second",
    change: (m) => {
      m.tracks[1].peaks = [
        [5, 0.5],
        [5, 0.6],
      ];
    },
    problem: /^tracks\[1\]\.peaks\[1\]\[0\] is 5, not after 5$/,
  },
  {
    name: "a strength of 1.5",
    change: (m) => {
      m.tracks[0].peaks = [[3, 1.5]];
    },
    problem: /^tracks\[0\]\.peaks\[0\]\[1\] is 1\.5, not 0 to 1$/,
  },
  {
    name: "a peak that is not a pair",
    change: (m) => {
      m.tracks[0].peaks = [[3]];
    },
    problem: /^tracks\[0\]\.peaks\[0\] is not \[second, strength\]$/,
  },
  {
    name: "41 peaks",
    change: (m) => {
      m.tracks[0] = { ...quiet(60), peaks: peaksAt(MAX_PEAKS + 1) };
    },
    problem: /^tracks\[0\]\.peaks has 41 entries, more than 40$/,
  },
  {
    name: "an extra key in a track",
    change: (m) => {
      m.tracks[0].mood = "calm";
    },
    problem: /^tracks\[0\]\.mood is unexpected$/,
  },
];

describe("checkMap", () => {
  it("accepts the fixture", () => {
    expect(checkMap(fixture)).toEqual([]);
  });

  it.each([{ step: 1 }, { step: 2 }, { step: 4 }, { step: 8 }])("accepts the fixture rebuilt at $step s a step", ({ step }) => {
    expect(checkMap(atStep(step))).toEqual([]);
  });

  it("accepts 40 peaks in a track", () => {
    const map = copy();
    map.tracks[0] = { ...quiet(60), peaks: peaksAt(MAX_PEAKS) };
    expect(checkMap(map)).toEqual([]);
  });

  it.each(INVALID)("rejects $name", ({ change, problem }) => {
    const map = copy();
    change(map);
    const problems = checkMap(map);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(problem);
  });

  it("reports every problem, each naming its path", () => {
    const map = copy();
    map.v = 2;
    map.tracks[0].title = "";
    map.tracks[1].env.rms = "!!!!";
    expect(checkMap(map)).toEqual([
      "v is 2, not 1",
      "tracks[0].title is not a string of 1 to 300 characters",
      "tracks[1].env.rms is not base64",
    ]);
  });

  it("rejects what is not an object", () => {
    for (const value of [null, [], "map", 7]) expect(checkMap(value)).toEqual(["map is not an object"]);
  });

  it("leaves out the checks that need a valid step", () => {
    const map = atStep(1);
    map.step = 3;
    expect(checkMap(map)).toEqual(["step is 3, not one of 1, 2, 4, 8"]);
  });
});

describe("readMap", () => {
  it("decodes each series to the fixture's bytes and copies the step onto each track", () => {
    const read = readMap(fixture);
    expect(read.show).toBe("1986-07-04");
    expect(read.playing).toBe("gd1986-07-04.sbd.miller.118659.flac16");
    expect(read.step).toBe(1);
    const [a, b] = read.tracks;
    expect(a.title).toBe("Touch Of Grey");
    expect(a.rms instanceof Uint8Array).toBe(true);
    expect(Array.from(a.rms)).toEqual([0, 64, 128, 192, 255]);
    expect(Array.from(a.bass)).toEqual([10, 20, 30, 40, 50]);
    expect(Array.from(a.bright)).toEqual([255, 0, 255, 0, 255]);
    expect(Array.from(a.tempo)).toEqual([120, 200]);
    expect(a.peaks).toEqual([[3, 0.9]]);
    expect(Array.from(b.rms)).toEqual(Array.from({ length: 24 }, (_, i) => 10 * i));
    expect(Array.from(b.bass)).toEqual(Array.from({ length: 24 }, (_, i) => 230 - 10 * i));
    expect(Array.from(b.bright)).toEqual(Array.from({ length: 24 }, () => 100));
    expect(Array.from(b.tempo)).toEqual([96, 128, 0, 0, 100, 255]);
    expect([a.step, b.step]).toEqual([1, 1]);
    // A read track carries no lengths: it is read on its own clock.
    expect(Object.keys(b).sort()).toEqual(["bass", "bright", "peaks", "rms", "step", "tempo", "title"]);
  });

  it("copies the map's step, whatever it is", () => {
    for (const step of [2, 4, 8]) expect(readMap(atStep(step)).tracks[1].step).toBe(step);
  });
});

describe("reading a track", () => {
  it("reads a track on its own clock, not stretched by its listed length", () => {
    const b = readMap(fixture).tracks[1];
    // Track 2 is 24 s analysed and listed at 30 s. 23.5 s is its last byte; stretched by 24/30 it would be 18.8 s, byte 18.
    expect(envAt(b, 23.5).rms).toBe(230 / 255);
    // 11 s is the second tempo window, which is unknown; stretched it would be 8.8 s, in the first.
    expect(tempoAt(b, 11)).toBeNull();
  });

  it.each([
    { step: 1, at20: 200, last: 230 },
    { step: 2, at20: 100, last: 110 },
    { step: 4, at20: 50, last: 50 },
  ])("reads the envelope at $step s a step", ({ step, at20, last }) => {
    const b = readMap(atStep(step)).tracks[1];
    expect(envAt(b, 20)).toEqual({ rms: at20 / 255, bass: at20 / 255, bright: at20 / 255 });
    // 23.9 s is in the last byte.
    expect(envAt(b, 23.9).rms).toBe(last / 255);
    // Before the track is the first byte and after it the last.
    expect(envAt(b, -3).rms).toBe(0);
    expect(envAt(b, 40).rms).toBe(last / 255);
  });

  it("reads each of the three series", () => {
    const b = readMap(fixture).tracks[1];
    expect(envAt(b, 20)).toEqual({ rms: 200 / 255, bass: 30 / 255, bright: 100 / 255 });
  });

  it("reads the envelope byte a time falls in, not the nearest", () => {
    const b = readMap(atStep(1)).tracks[1];
    // 20.8 s is in byte 20; the nearest would be byte 21.
    expect(envAt(b, 20.8).rms).toBe(200 / 255);
  });

  it("reads the tempo of the window a time falls in", () => {
    const b = readMap(fixture).tracks[1];
    expect(tempoAt(b, 5)).toEqual({ bpm: 96, confidence: 128 / 255 });
    // 7 s is in the first window; rounded to the nearest window it would be the second.
    expect(tempoAt(b, 7)).toEqual({ bpm: 96, confidence: 128 / 255 });
    expect(tempoAt(b, 15)).toBeNull();
    expect(tempoAt(b, 23)).toEqual({ bpm: 100, confidence: 1 });
    // Before the track is the first window and after it the last.
    expect(tempoAt(b, -5)).toEqual({ bpm: 96, confidence: 128 / 255 });
    expect(tempoAt(b, 99)).toEqual({ bpm: 100, confidence: 1 });
  });

  it("rises over 20 s to a peak and is 0 once it has passed", () => {
    const b = readMap(fixture).tracks[1];
    // The peak is at 20 s.
    expect(buildUp(b, 20)).toBe(1);
    expect(buildUp(b, 10)).toBe(0.5);
    expect(buildUp(b, 0)).toBe(0);
    expect(buildUp(b, -1)).toBe(0);
    expect(buildUp(b, 20.5)).toBe(0);
    expect(buildUp(readMap(fixture).tracks[0], 0)).toBeCloseTo(0.85, 10);
  });

  it("builds up to the next peak, and to the one after once the first has passed", () => {
    const map = atStep(1);
    map.tracks[1].peaks = [
      [4, 0.5],
      [20, 1],
    ];
    const b = readMap(map).tracks[1];
    expect(buildUp(b, 0)).toBeCloseTo(0.8, 10);
    expect(buildUp(b, 4)).toBe(1);
    expect(buildUp(b, 5)).toBeCloseTo(0.25, 10);
    expect(buildUp(b, 20)).toBe(1);
    expect(buildUp(b, 21)).toBe(0);
  });

  it("builds up to nothing in a track without peaks", () => {
    const map = atStep(1);
    map.tracks[1].peaks = [];
    expect(buildUp(readMap(map).tracks[1], 10)).toBe(0);
  });
});

describe("loadMap", () => {
  const DATA = {
    showDate: "1986-07-04",
    identifier: "gd1986-07-04.sbd.miller.118659.flac16",
    tracks: [
      { title: "Touch Of Grey", duration: 5 },
      { title: "Fire On The Mountain", duration: 30 },
    ],
  };
  // The page's data with one track changed.
  const withTrack = (i: number, change: Partial<{ title: string; duration: number }>) => ({
    ...DATA,
    tracks: DATA.tracks.map((track, k) => (k === i ? { ...track, ...change } : track)),
  });
  // A fetchMap that answers every request the same way.
  const answer = (body: string | null, status = 200) => async () => new Response(body, { status });

  let warnings: string[];
  const realWarn = console.warn;

  beforeEach(() => {
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.warn = realWarn;
  });

  it("requests the show's map and returns it read", async () => {
    const asked: string[] = [];
    const fetchMap = async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };
    const map = await loadMap(DATA, fetchMap);
    expect(asked).toEqual(["/maps/1986-07-04.json"]);
    expect(map).toEqual(readMap(fixture));
    expect(warnings).toEqual([]);
  });

  it("asks for no map when the page plays no recording", async () => {
    const asked: string[] = [];
    const fetchMap = async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };
    expect(await loadMap({ ...DATA, identifier: null }, fetchMap)).toBeNull();
    expect(asked).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("takes a duration under half a second off", async () => {
    const map = await loadMap(withTrack(1, { duration: 30.4 }), answer(JSON.stringify(fixture)));
    expect(map).not.toBeNull();
    expect(warnings).toEqual([]);
  });

  it.each<{ name: string; data: typeof DATA; fetchMap: () => Promise<Response>; warning: RegExp | null }>([
    { name: "a day without a map", data: DATA, fetchMap: answer(null, 404), warning: null },
    {
      name: "a different title",
      data: withTrack(1, { title: "Fire On The Mountain >" }),
      fetchMap: answer(JSON.stringify(fixture)),
      warning: /^map \/maps\/1986-07-04\.json: track 2 is "Fire On The Mountain", the page's "Fire On The Mountain >"$/,
    },
    {
      name: "a duration 1 s off",
      data: withTrack(1, { duration: 31 }),
      fetchMap: answer(JSON.stringify(fixture)),
      warning: /^map \/maps\/1986-07-04\.json: track 2 lasts 30 s, the page's 31 s$/,
    },
    {
      name: "a duration half a second off",
      data: withTrack(0, { duration: 5.5 }),
      fetchMap: answer(JSON.stringify(fixture)),
      warning: /^map \/maps\/1986-07-04\.json: track 1 lasts 5 s, the page's 5\.5 s$/,
    },
    {
      name: "one track fewer on the page",
      data: { ...DATA, tracks: DATA.tracks.slice(0, 1) },
      fetchMap: answer(JSON.stringify(fixture)),
      warning: /^map \/maps\/1986-07-04\.json: it has 2 tracks, the page 1$/,
    },
    {
      name: "a map made from another recording than the page plays",
      data: { ...DATA, identifier: "gd1986-07-04.aud.other" },
      fetchMap: answer(JSON.stringify(fixture)),
      warning: /^map \/maps\/1986-07-04\.json: it was made from gd1986-07-04\.sbd\.miller\.118659\.flac16, the page plays gd1986-07-04\.aud\.other$/,
    },
    {
      name: "an invalid map",
      data: DATA,
      fetchMap: answer(JSON.stringify({ ...fixture, v: 2 })),
      warning: /^map \/maps\/1986-07-04\.json: v is 2, not 1$/,
    },
    {
      name: "JSON that does not parse",
      data: DATA,
      fetchMap: answer("{ not json"),
      warning: /^map \/maps\/1986-07-04\.json: /,
    },
    {
      name: "a fetch that throws",
      data: DATA,
      fetchMap: async () => {
        throw new Error("offline");
      },
      warning: /^map \/maps\/1986-07-04\.json: offline$/,
    },
  ])("gives no map for $name", async ({ data, fetchMap, warning }) => {
    expect(await loadMap(data, fetchMap)).toBeNull();
    // A day without a map is normal, so only the other cases say why.
    expect(warnings).toHaveLength(warning ? 1 : 0);
    if (warning) expect(warnings[0]).toMatch(warning);
  });
});
