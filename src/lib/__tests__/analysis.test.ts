import { describe, it, expect } from "vitest";
import { binOf, rmsOf, bassOf, brightOf, readStep, mappings } from "../../../public/world/audio.js";

/* A spectrum of 512 bins in dB, as getFloatFrequencyData fills one, each bin's level given by its index. */
const spectrum = (dbAt: (k: number) => number) => new Float32Array(512).map((_, k) => dbAt(k));

describe("binOf", () => {
  it("finds the bins nearest 43 Hz, 344 Hz and 8 kHz at 44.1 kHz", () => {
    expect([43, 344, 8000].map((hz) => binOf(hz, 44100, 1024))).toEqual([1, 8, 186]);
  });

  it("finds them at 48 kHz, where each bin is wider", () => {
    expect([43, 344, 8000].map((hz) => binOf(hz, 48000, 1024))).toEqual([1, 7, 171]);
  });

  it("gives the spectrum's last bin for 8 kHz at 16 kHz and under, where 8 kHz lies past it", () => {
    expect([8000, 11025, 16000].map((rate) => binOf(8000, rate, 1024))).toEqual([511, 511, 511]);
  });
});

describe("rmsOf", () => {
  it("is 0 for silence", () => {
    expect(rmsOf(new Float32Array(1024))).toBe(0);
  });

  it("is a full-scale sine's peak over the square root of 2, over whole periods", () => {
    const sine = new Float32Array(1024).map((_, n) => Math.sin((2 * Math.PI * n) / 64));
    expect(rmsOf(sine)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe("bassOf", () => {
  /* Silent except for bins 1 to 8, which sit at -20 dB: a linear magnitude of 0.1 each. */
  const lowEnd = () => spectrum((k) => (k >= 1 && k <= 8 ? -20 : -Infinity));

  it("is 0 for a silent spectrum", () => {
    expect(bassOf(spectrum(() => -Infinity), 1, 8)).toBe(0);
  });

  it("is the mean linear magnitude over the bins", () => {
    expect(bassOf(lowEnd(), 1, 8)).toBeCloseTo(0.1, 9);
  });

  it("averages only bins lo to hi", () => {
    const db = lowEnd();
    db[9] = 0;
    expect(bassOf(db, 1, 8)).toBeCloseTo(0.1, 9);
  });
});

describe("brightOf", () => {
  it("is 0 for a silent spectrum", () => {
    expect(brightOf(spectrum(() => -Infinity), 186)).toBe(0);
  });

  it("is the middle of bins 1 to hi, as a fraction of hi, for a flat spectrum", () => {
    expect(brightOf(spectrum(() => -30), 186)).toBeCloseTo((186 + 1) / 2 / 186, 9);
  });

  it("reads a flat spectrum's middle at 16 kHz and under, up to the spectrum's last bin", () => {
    for (const rate of [8000, 11025, 16000]) {
      expect(brightOf(spectrum(() => -30), binOf(8000, rate, 1024)), `${rate} Hz`).toBeCloseTo((511 + 1) / 2 / 511, 9);
    }
  });

  it("reads a spectrum that rises with frequency higher than one that falls", () => {
    const rising = spectrum((k) => -80 + 0.2 * k);
    const falling = spectrum((k) => -40 - 0.2 * k);
    expect(brightOf(rising, 186)).toBeGreaterThan(brightOf(falling, 186));
  });
});

/* The shapes readStep takes and returns, which the type checker cannot infer from its plain-JS module. */
type Levels = { loud: number; bass: number; bright: number };
type Drive = Levels & { source: string };
const read = (level: Levels, ref: Levels, raw: Levels, dt: number) =>
  readStep({ level, ref }, raw, dt) as { level: Levels; ref: Levels; drive: Drive };
const zero: Levels = { loud: 0, bass: 0, bright: 0 };

describe("readStep", () => {
  it("starts the references at the levels on the first read, which reads at full drive", () => {
    const first = read(zero, zero, { loud: 1, bass: 1, bright: 1 }, Infinity);
    expect(first.level).toEqual({ loud: 0.25, bass: 0.25, bright: 0.1 });
    expect(first.ref).toEqual(first.level);
    expect(first.drive).toEqual({ source: "analyser", loud: 1, bass: 1, bright: 1 });
  });

  it("reads a level at half its reference as 0.5", () => {
    const level = { loud: 0.2, bass: 0.2, bright: 0.2 };
    const { drive } = read(level, { loud: 0.4, bass: 0.4, bright: 0.4 }, level, 0);
    expect(drive.loud).toBeCloseTo(0.5, 9);
    expect(drive.bass).toBeCloseTo(0.5, 9);
    expect(drive.bright).toBeCloseTo(0.5, 9);
  });

  it("halves a reference in 30 s when no higher level reaches it", () => {
    const { ref } = read(zero, { loud: 0.5, bass: 0.5, bright: 0.5 }, zero, 30);
    expect(ref.loud).toBeCloseTo(0.25, 9);
    expect(ref.bass).toBeCloseTo(0.25, 9);
    expect(ref.bright).toBeCloseTo(0.25, 9);
  });

  it("reads no brightness in silence, whatever the spectrum's shape, and fades it under loudness's floor", () => {
    expect(read(zero, zero, { loud: 0, bass: 0, bright: 0.5 }, Infinity).level.bright).toBe(0);
    /* An RMS of 0.005 is half loudness's floor, so a raw brightness of 0.5 counts as 0.25, and a first read smooths it by 0.1. */
    expect(read(zero, zero, { loud: 0.005, bass: 0, bright: 0.5 }, Infinity).level.bright).toBeCloseTo(0.025, 9);
  });

  it("reads a value under its floor as a fraction of the floor", () => {
    /* Loudness's floor is an RMS of 0.01, so 0.005 is half of it. */
    const under = { loud: 0.005, bass: 0, bright: 0 };
    expect(read(under, zero, under, 0).drive.loud).toBeCloseTo(0.5, 9);
  });
});

/* What mappings gives, and a check of each value to within a billionth. */
type Layer2 = Record<"energy" | "hemi" | "stage" | "panel" | "flame" | "amber" | "rate" | "amp", number>;
function expectClose(got: Layer2, want: Layer2) {
  for (const k of Object.keys(want) as (keyof Layer2)[]) expect(got[k], k).toBeCloseTo(want[k], 9);
}
const FULL = { source: "analyser", loud: 1, bass: 1, bright: 1 };
const SILENT = { source: "analyser", loud: 0, bass: 0, bright: 0 };

describe("mappings", () => {
  it("leaves the world as it was at weight 0, whatever the drive: every factor 1, no amber, the legs at 6 rad/s and 0.5 rad", () => {
    const own = { energy: 1, hemi: 1, stage: 1, panel: 1, flame: 1, amber: 0, rate: 6, amp: 0.5 };
    for (const drive of [FULL, null]) expect(mappings(drive, 0)).toEqual(own);
  });

  it("reaches the top of each range at weight 1 with a full drive", () => {
    expectClose(mappings(FULL, 1), { energy: 1.4, hemi: 1.1, stage: 2, panel: 1.2, flame: 2, amber: 0.3, rate: 12, amp: 0.65 });
  });

  it("reaches the bottom of each range at weight 1 with a silent drive", () => {
    expectClose(mappings(SILENT, 1), { energy: 0.6, hemi: 0.9, stage: 0.4, panel: 0.6, flame: 0.5, amber: 0, rate: 6, amp: 0.35 });
  });

  it("reads each line from its own value, with a drive whose three values differ", () => {
    const drive = { source: "analyser", loud: 0.2, bass: 0.5, bright: 0.8 };
    expectClose(mappings(drive, 1), { energy: 0.76, hemi: 0.94, stage: 1.2, panel: 0.72, flame: 1.25, amber: 0.24, rate: 7.2, amp: 0.5 });
  });

  it("is halfway at weight 0.5", () => {
    const half = mappings(FULL, 0.5);
    expect(half.stage).toBeCloseTo(1.5, 9);
    expect(half.rate).toBeCloseTo(9, 9);
  });
});
