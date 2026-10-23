import { spawnSync } from "child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkMap, MAX_MAP_BYTES } from "../../public/world/maps.js";
import {
  analyseShow,
  blockMeans,
  buildMap,
  createAnalyser,
  fft,
  FRAME,
  main,
  peaks,
  politeClient,
  SAMPLE_RATE,
  SITE,
  tempo,
  toBytes,
  USER_AGENT,
} from "../analyse-show.mjs";

// A tone of `freq` Hz at the analysis sample rate.
function tone(freq: number, seconds: number, amp = 0.5): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * SAMPLE_RATE) },
    (_, n) => amp * Math.sin((2 * Math.PI * freq * n) / SAMPLE_RATE)
  );
}

// Silence with a 220-sample burst of a 2 kHz tone at 0.8, starting every 60/bpm s.
function clicks(bpm: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let k = 0; ; k++) {
    const start = Math.round((k * 60 * SAMPLE_RATE) / bpm);
    if (start >= samples.length) break;
    for (let j = 0; j < 220 && start + j < samples.length; j++) {
      samples[start + j] = 0.8 * Math.sin((2 * Math.PI * 2000 * j) / SAMPLE_RATE);
    }
  }
  return samples;
}

// Samples as s16le PCM.
function toPcm(samples: Float32Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((x, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  return pcm;
}

// What the analyser makes of the samples, pushed whole or in chunks of `chunk` bytes.
function analyse(samples: Float32Array, chunk?: number) {
  const analyser = createAnalyser();
  const pcm = toPcm(samples);
  if (chunk === undefined) analyser.push(pcm);
  else for (let at = 0; at < pcm.length; at += chunk) analyser.push(pcm.subarray(at, at + chunk));
  return analyser.finish();
}

// A loudness series of `n` seconds: `base` with a swell of `height` and 20 s of width at each centre.
const swells = (centres: number[], base: number, height: number, n = 300) =>
  Float64Array.from(
    { length: n },
    (_, i) => base + height * centres.reduce((sum, c) => sum + Math.exp(-(((i - c) / 20) ** 2)), 0)
  );

describe("fft", () => {
  it("turns an impulse into a spectrum of 1 in every bin", () => {
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    re[0] = 1;
    fft(re, im);
    // The widest miss of any bin from 1.
    const worst = Math.max(...Array.from({ length: FRAME }, (_, k) => Math.abs(Math.hypot(re[k], im[k]) - 1)));
    expect(worst).toBeCloseTo(0, 9);
  });

  it("puts a cosine in its bin and the bin's mirror", () => {
    const re = Float64Array.from({ length: FRAME }, (_, n) => Math.cos((2 * Math.PI * 8 * n) / FRAME));
    const im = new Float64Array(FRAME);
    fft(re, im);
    expect(Math.hypot(re[8], im[8])).toBeCloseTo(512, 6);
    expect(Math.hypot(re[1016], im[1016])).toBeCloseTo(512, 6);
    expect(Math.hypot(re[7], im[7])).toBeCloseTo(0, 6);
  });

  it("is the forward transform: an impulse at 1 becomes e^(-2*pi*i*k/N)", () => {
    const re = new Float64Array(FRAME);
    const im = new Float64Array(FRAME);
    re[1] = 1;
    fft(re, im);
    // At k = N/4 that is -i.
    expect(re[FRAME / 4]).toBeCloseTo(0, 9);
    expect(im[FRAME / 4]).toBeCloseTo(-1, 9);
  });
});

describe("createAnalyser", () => {
  it("reads the loudness of each second", () => {
    const { duration, seconds } = analyse(tone(440, 3, 0.5));
    expect(duration).toBe(3);
    expect(seconds.rms).toHaveLength(3);
    // A sine of amplitude 0.5 has an rms of 0.5 / sqrt(2).
    for (const rms of seconds.rms) expect(rms).toBeCloseTo(0.354, 2);
  });

  it("reads a low tone as bass and a high tone as bright", () => {
    const low = analyse(tone(100, 3)).seconds;
    const high = analyse(tone(3000, 3)).seconds;
    expect(low.bass[1]).toBeGreaterThan(10 * high.bass[1]);
    // The centroid of a tone is its frequency over the 8 kHz the brightness looks up to.
    expect(high.bright[1]).toBeCloseTo(0.375, 1);
    expect(low.bright[1]).toBeLessThan(0.05);
  });

  it("gives the same readings when the audio arrives in odd-sized chunks", () => {
    const samples = tone(220, 3);
    samples.set(clicks(120, 3).map((x, i) => x + samples[i]));
    expect(analyse(samples, 1001)).toEqual(analyse(samples));
    // A byte at a time splits every sample.
    const short = samples.subarray(0, 4096);
    expect(analyse(short, 1)).toEqual(analyse(short));
  });

  it("measures the whole audio but frames only whole frames", () => {
    const { duration, seconds, flux } = analyse(tone(440, 2.5));
    expect(duration).toBe(2.5);
    expect(seconds.rms).toHaveLength(3);
    // 55125 samples hold frames at 0, 512, ... 54016: 106 of them.
    expect(flux).toHaveLength(106);
    expect(flux[0]).toBe(0);
  });

  it("reads nothing from no audio", () => {
    const { duration, seconds, flux } = createAnalyser().finish();
    expect(duration).toBe(0);
    expect(seconds.rms).toHaveLength(0);
    expect(flux).toHaveLength(0);
  });

  it("reads 0 for a second with no frame", () => {
    // 44300 samples last just over 2 s, so there are 3 seconds, but the last frame's middle is at 43520: none is in the third.
    const { seconds } = analyse(tone(440, 44300 / SAMPLE_RATE));
    expect(seconds.rms).toHaveLength(3);
    expect(seconds.rms[1]).toBeGreaterThan(0);
    expect(seconds.rms[2]).toBe(0);
    expect(seconds.bass[2]).toBe(0);
    expect(seconds.bright[2]).toBe(0);
  });
});

// A kick (a 2 kHz burst) on every beat and a quieter, higher hat (6 kHz) halfway between: eighths between the beats.
function kickAndHat(bpm: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  const beat = (60 * SAMPLE_RATE) / bpm;
  const burst = (start: number, freq: number, amp: number, length: number) => {
    for (let j = 0; j < length && start + j < samples.length; j++) {
      samples[start + j] += amp * Math.sin((2 * Math.PI * freq * j) / SAMPLE_RATE);
    }
  };
  for (let k = 0; k * beat < samples.length; k++) {
    burst(Math.round(k * beat), 2000, 0.6, 220);
    burst(Math.round(k * beat + beat / 2), 6000, 0.3, 120);
  }
  return samples;
}

// The two windows' readings of 20 s of audio, each within 3 bpm of `bpm` and confident.
function expectTempo(samples: Float32Array, bpm: number) {
  const bytes = tempo(analyse(samples).flux, 20);
  expect(bytes).toHaveLength(4);
  for (const w of [0, 1]) {
    expect(Math.abs(bytes[2 * w] - bpm)).toBeLessThanOrEqual(3);
    expect(bytes[2 * w + 1]).toBeGreaterThan(64);
  }
}

describe("tempo", () => {
  it.each([{ bpm: 60 }, { bpm: 80 }, { bpm: 100 }, { bpm: 110 }, { bpm: 130 }, { bpm: 160 }, { bpm: 200 }])(
    "finds $bpm bpm in a click train",
    ({ bpm }) => {
      expectTempo(clicks(bpm, 20), bpm);
    }
  );

  it.each([{ bpm: 65 }, { bpm: 70 }, { bpm: 80 }, { bpm: 85 }, { bpm: 90 }, { bpm: 100 }])(
    "reads a $bpm bpm beat with eighths between as the beat, not twice it",
    ({ bpm }) => {
      expectTempo(kickAndHat(bpm, 20), bpm);
    }
  );

  // A beat of 120 bpm is 21.53 frames, between whole frames, while two beats are 43.07: the whole lag 43 fits them better. Telling
  // a beat from its half is beyond an autocorrelation, so the reading is one or the other.
  it("reads a 120 bpm click train as the beat or its half", () => {
    const bytes = tempo(analyse(clicks(120, 20)).flux, 20);
    for (const w of [0, 1]) {
      const bpm = bytes[2 * w];
      expect((bpm >= 117 && bpm <= 123) || (bpm >= 58 && bpm <= 62)).toBe(true);
      expect(bytes[2 * w + 1]).toBeGreaterThan(64);
    }
  });

  it("leaves a window shorter than two of the longest lag unknown", () => {
    expect(Array.from(tempo(new Float32Array(50), 1))).toEqual([0, 0]);
  });

  it("leaves silence unknown", () => {
    // 20 s of frames, all zero.
    expect(Array.from(tempo(new Float32Array(860), 20))).toEqual([0, 0, 0, 0]);
  });

  it("makes two bytes for each ten seconds, rounded up", () => {
    expect(tempo(new Float32Array(0), 25)).toHaveLength(6);
    expect(tempo(new Float32Array(0), 10)).toHaveLength(2);
  });
});

describe("peaks", () => {
  it("finds the one swell of a track", () => {
    const found = peaks(swells([150], 0.2, 0.8));
    expect(found).toHaveLength(1);
    expect(found[0][0]).toBeGreaterThanOrEqual(147);
    expect(found[0][0]).toBeLessThanOrEqual(153);
    expect(found[0][1]).toBeGreaterThanOrEqual(0.9);
    expect(found[0][1]).toBeLessThanOrEqual(1);
  });

  it("finds nothing in a flat track", () => {
    expect(peaks(new Float64Array(300).fill(0.5))).toEqual([]);
  });

  it("finds nothing in silence", () => {
    expect(peaks(new Float64Array(300))).toEqual([]);
  });

  it("finds two swells in time order", () => {
    const found = peaks(swells([80, 220], 0.2, 0.8));
    expect(found).toHaveLength(2);
    expect(Math.abs(found[0][0] - 80)).toBeLessThanOrEqual(3);
    expect(Math.abs(found[1][0] - 220)).toBeLessThanOrEqual(3);
  });

  it("finds nothing in a swell that rises less than 0.2", () => {
    expect(peaks(swells([150], 0.5, 0.05))).toEqual([]);
  });

  it("keeps the 40 most prominent of more, in time order", () => {
    // 60 swells 40 s apart, each taller than the one before: the 20 lowest are the ones left out.
    const series = Float64Array.from({ length: 60 * 40 }, (_, i) => {
      const swell = Math.floor(i / 40);
      return (0.3 + (0.7 * swell) / 59) * Math.exp(-((((i % 40) - 20) / 6) ** 2));
    });
    const found = peaks(series);
    expect(found).toHaveLength(40);
    expect(Math.abs(found[0][0] - (20 * 40 + 20))).toBeLessThanOrEqual(3);
    expect(Math.abs(found[39][0] - (59 * 40 + 20))).toBeLessThanOrEqual(3);
    for (let i = 1; i < found.length; i++) expect(found[i][0]).toBeGreaterThan(found[i - 1][0]);
  });
});

describe("toBytes", () => {
  it("scales the 99th percentile to 255 and stops louder values there", () => {
    const bytes = toBytes(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(bytes[98]).toBe(255);
    expect(bytes[99]).toBe(255);
    expect(bytes[49]).toBe(129);
    expect(bytes[0]).toBe(3);
  });

  it("makes zeros of a series that is all zeros", () => {
    expect(Array.from(toBytes([0, 0, 0]))).toEqual([0, 0, 0]);
  });

  it("makes nothing of nothing", () => {
    expect(toBytes([])).toHaveLength(0);
  });
});

describe("blockMeans", () => {
  it("averages consecutive blocks, the last one short", () => {
    expect(Array.from(blockMeans([1, 2, 3, 4, 5], 2))).toEqual([1.5, 3.5, 5]);
  });

  it("is the series itself at one value a block", () => {
    expect(Array.from(blockMeans([4, 5, 6], 1))).toEqual([4, 5, 6]);
  });
});

// An analysis of `seconds` seconds: 0.3 everywhere with a swell in the middle, and no flux.
function synthetic(seconds: number) {
  const series = () =>
    Float64Array.from(
      { length: seconds },
      (_, i) => 0.3 + 0.5 * Math.exp(-(((i - seconds / 2) / (seconds / 20)) ** 2))
    );
  return { duration: seconds, seconds: { rms: series(), bass: series(), bright: series() }, flux: new Float32Array(0) };
}

describe("buildMap", () => {
  it("makes a valid map at one second a step when it fits", () => {
    const { map, text } = buildMap("1986-07-04", "id", [{ title: "Short", playingDuration: 600, analysis: synthetic(600) }]);
    expect(map.step).toBe(1);
    expect(map.analysed).toBe("id");
    expect(map.playing).toBe("id");
    expect(checkMap(map)).toEqual([]);
    expect(text).toBe(JSON.stringify(map) + "\n");
    expect(map.tracks[0].peaks).toHaveLength(1);
    expect(map.tracks[0].peaks[0][0]).toBeGreaterThanOrEqual(295);
    expect(map.tracks[0].peaks[0][0]).toBeLessThanOrEqual(305);
  });

  it("takes the coarser step a long show needs", () => {
    const { map, text } = buildMap("1986-07-04", "id", [{ title: "Long", playingDuration: 10800, analysis: synthetic(10800) }]);
    expect(map.step).toBe(2);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_MAP_BYTES);
    expect(checkMap(map)).toEqual([]);
  });

  it("refuses a show that does not fit at any step", () => {
    const tracks = Array.from({ length: 40 }, (_, i) => ({
      title: `Track ${i + 1}`,
      playingDuration: 2700,
      analysis: synthetic(2700),
    }));
    expect(() => buildMap("1986-07-04", "id", tracks)).toThrow("1986-07-04: the map is over 40960 bytes even at 8 s a step");
  });

  it("rounds the analysed duration to hundredths and fits each series to it", () => {
    // 5.004 s rounds to 5, so the 6 values of its seconds are cut to 5; the playing duration is kept as listed.
    const cut = { ...synthetic(6), duration: 5.004 };
    const { map } = buildMap("1986-07-04", "id", [{ title: "Cut", playingDuration: 7, analysis: cut }]);
    expect(map.tracks[0].analysedDuration).toBe(5);
    expect(map.tracks[0].playingDuration).toBe(7);
    expect(checkMap(map)).toEqual([]);
    // 4.5 s keeps its half second and the 5 values of its seconds.
    const half = { ...synthetic(5), duration: 4.5 };
    const rounded = buildMap("1986-07-04", "id", [{ title: "Half", playingDuration: 4.5, analysis: half }]);
    expect(rounded.map.tracks[0].analysedDuration).toBe(4.5);
    expect(checkMap(rounded.map)).toEqual([]);
  });

  it("scales each series to its own 99th percentile", () => {
    const { map } = buildMap("1986-07-04", "id", [{ title: "Short", playingDuration: 100, analysis: synthetic(100) }]);
    const rms = Buffer.from(map.tracks[0].env.rms, "base64");
    expect(Math.max(...rms)).toBe(255);
  });
});

// The answers for the fakes below.
type Answer = Response | Error;
const ok = () => new Response("{}", { status: 200 });
const httpStatus = (code: number) => new Response(null, { status: code });

// A client's io: every request is recorded and answered from the queue, and every pause is recorded and skipped.
function fakeClientIO(answers: Answer[]) {
  const queue = [...answers];
  const urls: string[] = [];
  const agents: (string | null)[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const io = {
    fetch: async (url: string, init?: RequestInit) => {
      urls.push(url);
      agents.push(new Headers(init?.headers).get("User-Agent"));
      const next = queue.shift();
      if (next === undefined) throw new Error("no answer queued");
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    log: (message: string) => {
      logs.push(message);
    },
  };
  return { io, urls, agents, sleeps, logs };
}

describe("politeClient", () => {
  it("pauses before every request but the first, and says who is asking", async () => {
    const f = fakeClientIO([ok(), ok()]);
    const client = politeClient(f.io);
    await client.request("https://example.test/1", (res: Response) => res.json());
    await client.request("https://example.test/2", (res: Response) => res.json());
    expect(f.sleeps).toEqual([1000]);
    expect(f.agents).toEqual([USER_AGENT, USER_AGENT]);
    expect(f.urls).toEqual(["https://example.test/1", "https://example.test/2"]);
    expect(f.logs).toEqual(["  pause 1 s"]);
  });

  it("returns what its read makes of the response", async () => {
    const f = fakeClientIO([new Response('{"a":1}', { status: 200 })]);
    expect(await politeClient(f.io).request("https://example.test/1", (res: Response) => res.json())).toEqual({ a: 1 });
  });

  it("retries a 503 after 5 s and again after 20 s instead of the usual pause", async () => {
    const f = fakeClientIO([httpStatus(503), httpStatus(503), ok()]);
    const result = await politeClient(f.io).request("https://example.test/1", (res: Response) => res.json());
    expect(result).toEqual({});
    expect(f.sleeps).toEqual([5000, 20000]);
    expect(f.urls).toHaveLength(3);
    expect(f.logs).toEqual([
      "  retry 1 of 2 in 5 s: https://example.test/1 answered 503",
      "  retry 2 of 2 in 20 s: https://example.test/1 answered 503",
    ]);
  });

  it("gives up with the last error after the second retry", async () => {
    const f = fakeClientIO([httpStatus(503), httpStatus(503), httpStatus(503), ok()]);
    await expect(politeClient(f.io).request("https://example.test/1", (res: Response) => res.json())).rejects.toThrow("503");
    expect(f.sleeps).toEqual([5000, 20000]);
    expect(f.urls).toHaveLength(3);
  });

  it("does not retry a refusal, and pauses before the next request all the same", async () => {
    const f = fakeClientIO([httpStatus(404), ok()]);
    const client = politeClient(f.io);
    await expect(client.request("https://example.test/1", (res: Response) => res.json())).rejects.toThrow("404");
    expect(f.sleeps).toEqual([]);
    await client.request("https://example.test/2", (res: Response) => res.json());
    expect(f.sleeps).toEqual([1000]);
  });

  it.each([{ code: 429 }, { code: 500 }, { code: 502 }])("retries a $code", async ({ code }) => {
    const f = fakeClientIO([httpStatus(code), ok()]);
    await politeClient(f.io).request("https://example.test/1", (res: Response) => res.json());
    expect(f.sleeps).toEqual([5000]);
  });

  it.each([{ code: 400 }, { code: 401 }, { code: 403 }, { code: 404 }])("does not retry a $code", async ({ code }) => {
    const f = fakeClientIO([httpStatus(code), ok()]);
    const request = politeClient(f.io).request("https://example.test/1", (res: Response) => res.json());
    await expect(request).rejects.toThrow(String(code));
    expect(f.urls).toHaveLength(1);
  });

  it("retries a request that fails before an answer", async () => {
    const f = fakeClientIO([new Error("socket hang up"), ok()]);
    await politeClient(f.io).request("https://example.test/1", (res: Response) => res.json());
    expect(f.sleeps).toEqual([5000]);
    expect(f.logs).toEqual(["  retry 1 of 2 in 5 s: socket hang up"]);
  });

  it("retries a read that throws once", async () => {
    const f = fakeClientIO([ok(), ok()]);
    let reads = 0;
    const result = await politeClient(f.io).request("https://example.test/1", async (res: Response) => {
      if (++reads === 1) throw new Error("the stream was cut");
      return res.json();
    });
    expect(result).toEqual({});
    expect(f.sleeps).toEqual([5000]);
    expect(f.urls).toHaveLength(2);
  });

  it("makes one request at a time", async () => {
    const f = fakeClientIO([ok(), ok()]);
    const client = politeClient(f.io);
    const order: string[] = [];
    const slow = (name: string) => async (res: Response) => {
      order.push(`${name} starts`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`${name} ends`);
      return res.json();
    };
    await Promise.all([
      client.request("https://example.test/1", slow("first")),
      client.request("https://example.test/2", slow("second")),
    ]);
    expect(order).toEqual(["first starts", "first ends", "second starts", "second ends"]);
    expect(f.sleeps).toEqual([1000]);
  });
});

const PLAYING_URL = `${SITE}/api/playing/1986-07-04`;
const T01 = "https://archive.org/download/sbd-id/t01.mp3";
const T02 = "https://archive.org/download/sbd-id/t02.mp3";

// What the site's /api/playing route answers for a show: the recording the page plays, two tracks of 4 s and 3 s.
const playing = (show: string) => ({
  show,
  identifier: "sbd-id",
  tracks: [
    { title: "Touch Of Grey", duration: 4, mp3Url: T01 },
    { title: "Hell In A Bucket", duration: 3, mp3Url: T02 },
  ],
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
// An mp3 answer of 1000 bytes, whose length the response says.
const mp3 = (length = "1000") => new Response(new Uint8Array(1000), { headers: { "content-length": length } });

// A whole run's io with nothing real in it. Relisten answers the same for every date; `answers` puts responses first in line for
// a url.
// The decoder reads the body it is given and "decodes" it to a 220 Hz tone as long as the next of `lengths`, in seconds.
function fakeRun(options: { lengths?: number[]; answers?: Record<string, Response[]> } = {}) {
  const lengths = [...(options.lengths ?? [4, 3])];
  const answers = new Map(Object.entries(options.answers ?? {}));
  const urls: string[] = [];
  const agents: (string | null)[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const io = {
    fetch: async (url: string, init?: RequestInit) => {
      urls.push(url);
      agents.push(new Headers(init?.headers).get("User-Agent"));
      const first = answers.get(url)?.shift();
      if (first) return first;
      const show = /\/api\/playing\/(\d{4}-\d{2}-\d{2})$/.exec(url);
      if (show) return json(playing(show[1]));
      if (url.endsWith(".mp3")) return mp3();
      return httpStatus(404);
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    log: (message: string) => {
      logs.push(message);
    },
    error: (message: string) => {
      errors.push(message);
    },
    decode: async (body: ReadableStream<Uint8Array> | null, onBytes: (k: number) => void, onPcm: (pcm: Buffer) => void) => {
      if (!body) throw new Error("the response has no body");
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onBytes(value.length);
      }
      const seconds = lengths.shift();
      if (seconds === undefined) throw new Error("no decoded length queued");
      onPcm(toPcm(tone(220, seconds)));
    },
  };
  return { io, urls, agents, sleeps, logs, errors };
}

describe("analyseShow", () => {
  it("maps the recording the page plays, track by track", async () => {
    const f = fakeRun();
    const { map, text } = await analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    expect(map.analysed).toBe("sbd-id");
    expect(map.playing).toBe("sbd-id");
    expect(map.tracks.map((t: { title: string }) => t.title)).toEqual(["Touch Of Grey", "Hell In A Bucket"]);
    expect(map.tracks.map((t: { playingDuration: number }) => t.playingDuration)).toEqual([4, 3]);
    expect(map.tracks.map((t: { analysedDuration: number }) => t.analysedDuration)).toEqual([4, 3]);
    expect(checkMap(map)).toEqual([]);
    expect(text).toBe(JSON.stringify(map) + "\n");
    expect(f.urls).toEqual([PLAYING_URL, T01, T02]);
    expect(f.sleeps).toEqual([1000, 1000]);
    expect(f.agents).toEqual([USER_AGENT, USER_AGENT, USER_AGENT]);
  });

  it("logs what it reads and fetches", async () => {
    const f = fakeRun();
    await analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    expect(f.logs).toEqual([
      "1986-07-04: the page plays sbd-id, 2 tracks, 7 s listed",
      `  1/2 Touch Of Grey: ${T01}`,
      "  pause 1 s",
      "    1000 bytes fetched, 4.00 s decoded, 4 s listed",
      `  2/2 Hell In A Bucket: ${T02}`,
      "  pause 1 s",
      "    1000 bytes fetched, 3.00 s decoded, 3 s listed",
      "1986-07-04: 2000 bytes fetched",
    ]);
  });

  it("names the server that refused a request, and the refusal it marked", async () => {
    const refusal = new Response(null, { status: 403, headers: { server: "cloudflare", "cf-mitigated": "challenge" } });
    const f = fakeRun({ answers: { [PLAYING_URL]: [refusal] } });
    const run = analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    await expect(run).rejects.toThrow(`${PLAYING_URL} answered 403 (server cloudflare, cf-mitigated challenge)`);
    expect(f.urls).toEqual([PLAYING_URL]);
  });

  it("refuses a show the site names no recording for", async () => {
    const empty = fakeRun({ answers: { [PLAYING_URL]: [json({ ...playing("1986-07-04"), tracks: [] })] } });
    await expect(analyseShow("1986-07-04", politeClient(empty.io).request, empty.io)).rejects.toThrow(
      `1986-07-04: ${SITE} names no recording with tracks`
    );
    const missing = fakeRun({ answers: { [PLAYING_URL]: [httpStatus(404)] } });
    await expect(analyseShow("1986-07-04", politeClient(missing.io).request, missing.io)).rejects.toThrow("404");
    expect(missing.urls).toEqual([PLAYING_URL]);
  });

  it("fetches MP3s from archive.org only", async () => {
    const elsewhere = { ...playing("1986-07-04"), tracks: [{ title: "Touch Of Grey", duration: 4, mp3Url: "https://example.test/t01.mp3" }] };
    const f = fakeRun({ answers: { [PLAYING_URL]: [json(elsewhere)] } });
    await expect(analyseShow("1986-07-04", politeClient(f.io).request, f.io)).rejects.toThrow("archive.org MP3");
    expect(f.urls).toEqual([PLAYING_URL]);
  });

  it("refuses a track whose decoded length is not its listed one", async () => {
    const f = fakeRun({ lengths: [4, 9] });
    await expect(analyseShow("1986-07-04", politeClient(f.io).request, f.io)).rejects.toThrow("Hell In A Bucket");
  });

  it("takes a decoded length within two seconds of the listed one", async () => {
    const f = fakeRun({ lengths: [5.9, 1.1] });
    const { map } = await analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    expect(map.tracks.map((t: { analysedDuration: number }) => t.analysedDuration)).toEqual([5.9, 1.1]);
  });

  it("refuses a track that decodes to no audio", async () => {
    const f = fakeRun({ lengths: [0, 3] });
    await expect(analyseShow("1986-07-04", politeClient(f.io).request, f.io)).rejects.toThrow("Touch Of Grey: decoded no audio");
  });

  it("fetches a track again when its body is shorter than its content-length", async () => {
    // The first answer promises 2000 bytes and delivers 1000; the first decode's length is spent on it.
    const f = fakeRun({ lengths: [4, 4, 3], answers: { [T01]: [mp3("2000")] } });
    const { map } = await analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    expect(checkMap(map)).toEqual([]);
    expect(f.urls).toEqual([PLAYING_URL, T01, T01, T02]);
    expect(f.sleeps).toEqual([1000, 5000, 1000]);
    expect(f.logs).toContain("  retry 1 of 2 in 5 s: fetched 1000 of 2000 bytes");
    expect(f.logs).toContain("1986-07-04: 2000 bytes fetched");
  });

  it("does not hold a compressed body to its content-length", async () => {
    const headers = { "content-length": "300", "content-encoding": "gzip" };
    const compressed = () => new Response(new Uint8Array(1000), { headers });
    const f = fakeRun({ answers: { [T01]: [compressed()], [T02]: [compressed()] } });
    const { map } = await analyseShow("1986-07-04", politeClient(f.io).request, f.io);
    expect(checkMap(map)).toEqual([]);
    expect(f.urls).toEqual([PLAYING_URL, T01, T02]);
  });
});

// A directory a run that is refused must not make.
const NEVER_MADE = join(tmpdir(), "analyse-show-never-made");

describe("main", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "analyse-show-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses more shows than a run may make, before any request", async () => {
    const f = fakeRun();
    const code = await main(["--out", dir, "1986-07-04", "1987-03-27", "1990-03-29"], f.io);
    expect(code).toBe(2);
    expect(f.urls).toEqual([]);
    expect(f.errors).toEqual(["At most 2 shows a run, not 3"]);
  });

  it.each([
    { name: "a date that is not YYYY-MM-DD", args: ["--out", NEVER_MADE, "1986-7-4"] },
    { name: "no dates", args: ["--out", NEVER_MADE] },
    { name: "no --out", args: ["1986-07-04"] },
    { name: "an --out without a directory", args: ["1986-07-04", "--out"] },
    { name: "a site with a path", args: ["--out", NEVER_MADE, "--site", "https://preview.test/api", "1986-07-04"] },
    { name: "a site that is not a web address", args: ["--out", NEVER_MADE, "--site", "preview.test", "1986-07-04"] },
  ])("refuses $name", async ({ args }) => {
    const f = fakeRun();
    expect(await main(args, f.io)).toBe(2);
    expect(f.urls).toEqual([]);
    expect(f.errors).toHaveLength(1);
  });

  it("writes the map of a show to <out>/<date>.json", async () => {
    const f = fakeRun();
    const out = join(dir, "maps");
    expect(await main(["--out", out, "1986-07-04"], f.io)).toBe(0);
    const written = readFileSync(join(out, "1986-07-04.json"), "utf8");
    expect(checkMap(JSON.parse(written))).toEqual([]);
    expect(JSON.parse(written).show).toBe("1986-07-04");
    expect(f.logs).toContain(`1986-07-04: map written, ${Buffer.byteLength(written)} bytes at 1 s a step`);
    expect(f.errors).toEqual([]);
    expect(f.urls[0]).toBe(PLAYING_URL);
  });

  it("reads the playing route of the site it is given, such as a branch's preview", async () => {
    const f = fakeRun();
    expect(await main(["--out", dir, "--site", "https://preview.test/", "1986-07-04"], f.io)).toBe(0);
    expect(f.urls).toEqual(["https://preview.test/api/playing/1986-07-04", T01, T02]);
  });

  it("goes on to the next show when one fails, and exits 1", async () => {
    const f = fakeRun({ answers: { [PLAYING_URL]: [httpStatus(404)] } });
    const code = await main(["--out", dir, "1986-07-04", "1987-03-27"], f.io);
    expect(code).toBe(1);
    expect(readdirSync(dir)).toEqual(["1987-03-27.json"]);
    expect(f.errors).toEqual([`1986-07-04: ${PLAYING_URL} answered 404`]);
  });

  it("pauses between the two shows as between any two requests", async () => {
    const f = fakeRun({ lengths: [4, 3, 4, 3] });
    expect(await main(["--out", dir, "1986-07-04", "1987-03-27"], f.io)).toBe(0);
    expect(readdirSync(dir)).toEqual(["1986-07-04.json", "1987-03-27.json"]);
    expect(f.sleeps).toEqual([1000, 1000, 1000, 1000, 1000]);
  });

  // Loading every module it imports before it reads its arguments.
  it("starts as the maps workflow runs it: plain Node, no hook", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const run = spawnSync(process.execPath, ["scripts/analyse-show.mjs"], { cwd: root, encoding: "utf8" });
    // Node may add its own warnings to stderr; the usage line shows every import loaded.
    expect(run.stderr).toContain("Usage: node scripts/analyse-show.mjs --out DIR [--site URL] SHOW_DATE [SHOW_DATE]\n");
    expect(run.status).toBe(2);
  });
});
