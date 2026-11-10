import { describe, it, expect } from "vitest";
import { binOf, rmsOf, bassOf, brightOf, fluxOf, onsetStep, readStep, mappings } from "../../../public/world/audio.js";

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

/* What mappings gives, and a check of each value it names to within a billionth. */
type Layer2 = Record<
  "energy" | "hemi" | "stage" | "panel" | "flame" | "amber" | "rate" | "amp" | "beam" | "swell" | "dance" | "rise",
  number
>;
function expectClose(got: Layer2, want: Partial<Layer2>) {
  for (const k of Object.keys(want) as (keyof Layer2)[]) expect(got[k], k).toBeCloseTo(want[k] ?? NaN, 9);
}
const FULL = { source: "analyser", loud: 1, bass: 1, bright: 1 };
const SILENT = { source: "analyser", loud: 0, bass: 0, bright: 0 };

describe("mappings", () => {
  it("leaves the world as it was at weight 0, whatever the drive and the build-up: every factor 1, no amber, the legs at 6 rad/s and 0.5 rad", () => {
    const own = { energy: 1, hemi: 1, stage: 1, panel: 1, flame: 1, amber: 0, rate: 6, amp: 0.5, beam: 1, swell: 1, dance: 1, rise: 0 };
    for (const drive of [FULL, null]) {
      expect(mappings(drive, 0)).toEqual(own);
      expect(mappings(drive, 0, 1)).toEqual(own);
    }
  });

  it("reaches the top of each range at weight 1 with a full drive", () => {
    expectClose(mappings(FULL, 1), { energy: 1.4, hemi: 1.1, stage: 2, panel: 1.2, flame: 2, amber: 0.3, rate: 12, amp: 0.65, dance: 1.6 });
  });

  it("reaches the bottom of each range at weight 1 with a silent drive", () => {
    const bottom = { energy: 0.6, hemi: 0.9, stage: 0.4, panel: 0.6, flame: 0.5, amber: 0, rate: 6, amp: 0.35, dance: 0.4 };
    expectClose(mappings(SILENT, 1), bottom);
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

  it("takes the panel and the beam to the tops of their ranges at a peak's full build-up, whatever the drive, and swells the flame", () => {
    for (const drive of [FULL, SILENT]) expectClose(mappings(drive, 1, 1), { panel: 1.2, beam: 1.2, swell: 2.2, rise: 1 });
  });

  it("is halfway there at half the build-up, and at half the weight, with which the build-up acts", () => {
    expectClose(mappings(SILENT, 1, 0.5), { panel: 0.9, beam: 1.1, swell: 1.6, rise: 0.5 });
    expectClose(mappings(SILENT, 0.5, 1), { panel: 1, beam: 1.1, swell: 1.6, rise: 0.5 });
  });
});

describe("fluxOf", () => {
  // A spectrum in dB of these linear magnitudes from bin 0, and silence in every other bin.
  const of = (m: number[]) => spectrum((k) => (k < m.length ? 20 * Math.log10(m[k]) : -Infinity));
  // Bin 0 (the DC term) rises by 1, bin 1 by 0.4, bin 2 falls by 0.9, bin 3 rises by 0.9 and bin 4, past hi, by 1.
  const BEFORE = [0, 0.1, 1, 0.1, 0], AFTER = [1, 0.5, 0.1, 1, 1];

  it("sums each bin's rise in linear magnitude since the last read, from bin 1 to bin hi, and passes over the bins that fell", () => {
    expect(fluxOf(of(AFTER), Float32Array.from(BEFORE), 3)).toBeCloseTo(1.3, 5);
  });

  it("keeps this read's magnitudes for the next, so a spectrum that holds still has no flux", () => {
    const prev = Float32Array.from(BEFORE);
    fluxOf(of(AFTER), prev, 3);
    expect(Array.from(prev)).toEqual([0, expect.closeTo(0.5, 6), expect.closeTo(0.1, 6), expect.closeTo(1, 6), 0]);
    expect(fluxOf(of(AFTER), prev, 3)).toBeCloseTo(0, 6);
  });
});

describe("onsetStep", () => {
  // An RMS over loudness's floor.
  const LOUD = 0.1;
  // Reads 33 ms apart with these fluxes, from no reads before: the reads that were onsets, and the onsets' state after the last.
  function read(fluxes: number[], rms = LOUD) {
    let s = { recent: [] as [number, number][], above: false, count: 0, at: null as number | null };
    const found: number[] = [];
    fluxes.forEach((flux, i) => {
      const next = onsetStep(s, flux, rms, i * 33);
      if (next.onset) found.push(i);
      s = next;
    });
    return { found, state: s };
  }
  const onsetsOf = (fluxes: number[], rms = LOUD) => read(fluxes, rms).found;
  // A beat every 15 reads, about 0.5 s, from read 15: its flux jumps to 1 for three reads over a floor of 0.1.
  const beats = Array.from({ length: 90 }, (_, i) => (i >= 15 && i % 15 < 3 ? 1 : 0.1));

  it("finds an onset at each beat, once each, however many reads its flux stays up, and counts them and keeps the last one's time", () => {
    const { found, state } = read(beats);
    expect(found).toEqual([15, 30, 45, 60, 75]);
    expect(state).toMatchObject({ count: 5, at: 75 * 33 });
  });

  it("finds none in a flux that holds steady", () => {
    expect(onsetsOf(Array.from({ length: 60 }, () => 0.5))).toEqual([]);
  });

  it("takes a read as an onset when its flux rises over one and a half times the median, and not under it", () => {
    const quiet = Array.from({ length: 10 }, () => 0.1);
    expect(onsetsOf([...quiet, 0.14])).toEqual([]);
    expect(onsetsOf([...quiet, 0.16])).toEqual([10]);
  });

  it("finds none before five reads to stand out from", () => {
    expect(onsetsOf([0.1, 0.1, 0.1, 0.1, 1, 0.1])).toEqual([]);
    expect(onsetsOf([0.1, 0.1, 0.1, 0.1, 0.1, 1])).toEqual([5]);
  });

  it("finds none under loudness's floor, so silence has no onsets", () => {
    expect(onsetsOf(beats, 0.009)).toEqual([]);
  });

  it("measures a read against the reads of the 1.5 s before it only", () => {
    // 45 loud reads, then 45 quiet ones, then a loud read: by then the loud reads are more than 1.5 s back.
    const fluxes = [...Array.from({ length: 45 }, () => 1), ...Array.from({ length: 45 }, () => 0.1), 1];
    expect(onsetsOf(fluxes)).toEqual([90]);
  });
});
