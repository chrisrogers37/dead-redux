import { describe, it, expect } from "vitest";
import { median, stepDown } from "../../../public/world/quality.js";

interface Quality {
  scale: number;
  shadows: boolean;
  octaves: number;
  bears: number;
  stageLight: boolean;
}

/* The rungs below a quality, in order, ending with the null that says there are no more; capped, so a ladder that never ends fails. */
function rungsBelow(from: Quality): (Quality | null)[] {
  const rungs: (Quality | null)[] = [];
  let q: Quality | null = from;
  for (let i = 0; i < 20 && q; i++) {
    q = stepDown(q);
    rungs.push(q);
  }
  return rungs;
}

describe("median", () => {
  it("is the middle of an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("is the mean of the middle pair of an even count", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("leaves its input unsorted", () => {
    const values = [5, 1, 3];
    const copy = [...values];
    median(values);
    expect(values).toEqual(copy);
  });
});

describe("stepDown", () => {
  it("takes the scale down to half, then sky octaves, then bears, then ends", () => {
    const desktop: Quality = { scale: 1, shadows: false, octaves: 4, bears: 5, stageLight: false };
    expect(rungsBelow(desktop)).toEqual([
      { ...desktop, scale: 0.8 },
      { ...desktop, scale: 0.64 },
      { ...desktop, scale: 0.512 },
      { ...desktop, scale: 0.5 },
      { ...desktop, scale: 0.5, octaves: 3 },
      { ...desktop, scale: 0.5, octaves: 2 },
      { ...desktop, scale: 0.5, octaves: 2, bears: 3 },
      { ...desktop, scale: 0.5, octaves: 2, bears: 1 },
      null,
    ]);
  });

  it("turns shadows off first, then the stage light, then ends", () => {
    const lit: Quality = { scale: 0.5, shadows: true, octaves: 2, bears: 1, stageLight: true };
    expect(rungsBelow(lit)).toEqual([
      { ...lit, shadows: false },
      { ...lit, shadows: false, stageLight: false },
      null,
    ]);
  });

  it("steps a phone's 0.85 down to 0.68, 0.544 and the 0.5 floor", () => {
    const phone: Quality = { scale: 0.85, shadows: false, octaves: 3, bears: 3, stageLight: false };
    expect(rungsBelow(phone).slice(0, 3).map((q) => q?.scale)).toEqual([0.68, 0.544, 0.5]);
  });
});
