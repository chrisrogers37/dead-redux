import { describe, expect, it } from "vitest";
import { beatStep, figuresTempo, foldTempo } from "../../../public/world/beat.js";

// A track's tempo as a read map holds it: for each 10-s window a reading in beats a minute (0 for none), each at full confidence.
const track = (bpms: number[]) => ({ tempo: Uint8Array.from(bpms.flatMap((bpm) => [bpm, 255])) });
// The figures' beat before any frame.
const START = { beats: 0, pull: 0, locks: 0 };

describe("foldTempo", () => {
  it("doubles a tempo under 80 a minute and halves one at 160 or over, into the figures' range", () => {
    expect([60, 69, 160, 162, 200].map(foldTempo)).toEqual([120, 138, 80, 81, 100]);
  });

  it("leaves a tempo at either end of the range as it is", () => {
    expect([80, 159].map(foldTempo)).toEqual([80, 159]);
  });

  it("leaves no tempo as none", () => {
    expect(foldTempo(null)).toBeNull();
  });
});

describe("figuresTempo", () => {
  it("takes the median of the window a time falls in and four each side, so a few windows at another multiple of the beat are outvoted", () => {
    // 45 s is window 4; windows 3 to 5 read 4/3 of the beat, 3 of the 9 around it.
    expect(figuresTempo(track([100, 100, 100, 133, 133, 133, 100, 100, 100, 100]), 45)).toBe(100);
  });

  it("folds each reading before the median, so a beat read at half its speed counts as itself", () => {
    expect(figuresTempo(track([50, 50, 50, 100, 100]), 20)).toBe(100);
  });

  it("reads each window within the track once at its ends, where fewer windows stand on one side", () => {
    // At 0 s it reads windows 0 to 4, one of them at 90; at 59 s, in the last of six windows, windows 1 to 5, one of them at 90.
    expect(figuresTempo(track([90, 120, 120, 120, 120, 120]), 0)).toBe(120);
    expect(figuresTempo(track([120, 120, 120, 120, 120, 90]), 59)).toBe(120);
  });

  it("takes the lower of the middle two of an even count, so it is always one of the readings", () => {
    expect(figuresTempo(track([100, 130]), 0)).toBe(100);
  });

  it("leaves out the windows with no tempo, and gives none where none of them has one", () => {
    expect(figuresTempo(track([0, 0, 110, 0, 0]), 0)).toBe(110);
    expect(figuresTempo(track([0, 0, 0]), 10)).toBeNull();
  });
});

describe("beatStep", () => {
  it("advances at the tempo while no onset comes", () => {
    let s = START;
    for (let k = 0; k < 500; k++) s = beatStep(s, 0.02, 120, null);
    expect(s.beats).toBeCloseTo(20, 9);
    expect(s.locks).toBe(0);
  });

  it("pulls the phase half way back onto the beat of an onset that comes a tenth of a beat after it, over a fifth of a second", () => {
    // At 60 a minute a beat lasts a second. The phase reads 3.1 at an onset: the figures are a tenth of a beat ahead of the music.
    let s = beatStep({ ...START, beats: 3.1 }, 0, 60, 0);
    expect(s.pull).toBeCloseTo(-0.05, 9);
    expect(s.locks).toBe(1);
    for (let k = 0; k < 50; k++) s = beatStep(s, 0.02, 60, null);
    // A second on, the phase stands half of that behind where it ran.
    expect(s.beats).toBeCloseTo(3.1 + 1 - 0.05, 3);
  });

  it("takes the pull up frame by frame, never at once, so the figures never jump", () => {
    const s = beatStep({ ...START, beats: 3.2 }, 0.02, 60, 0);
    // One 20-ms frame takes a tenth of the 0.1 pull.
    expect(s.beats - (3.2 + 0.02)).toBeCloseTo(-0.01, 9);
    expect(s.pull).toBeCloseTo(-0.09, 9);
  });

  it("lets an onset between beats go by: half a beat off, and a quarter either way", () => {
    for (const beats of [3.5, 3.25, 2.75]) {
      expect(beatStep({ ...START, beats }, 0.02, 60, 0)).toEqual({ ...START, beats: beats + 0.02 });
    }
  });

  it("reads the onset's phase where it came, `ago` seconds back, with the pull still to come", () => {
    // At 120 a minute, 2 beats a second, the frame reads 5.3, so an onset 0.1 s back came at 5.1, a tenth of a beat after beat 5.
    expect(beatStep({ ...START, beats: 5.3 }, 0, 120, 0.1).pull).toBeCloseTo(-0.05, 9);
    // With a pull of -0.1 still to come, the same onset falls on beat 5 and adds nothing.
    expect(beatStep({ ...START, beats: 5.3, pull: -0.1 }, 0, 120, 0.1).pull).toBeCloseTo(-0.1, 9);
  });
});
