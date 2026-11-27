import { describe, expect, it } from "vitest";
import { LIN, lum } from "../flash/analyse.mjs";
import { AREA, DARKER, fieldOf, FIELD, GENERAL, MOST, platesPixelMask, RED, SATURATED, STEPS, wcagCounter } from "../flash/wcag.mjs";

// The WCAG count (scripts/flash/wcag.mjs) on frames made here: WCAG 2.3.1's general and red flash thresholds, by the area of a 10° field
// that is a third of the frame by a third. Each run is a frame size, a number of frames, and the colour of each pixel at each frame.

type RGB = [number, number, number];
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];
// A grey whose relative luminance is nearest `l`.
const grey = (l: number): RGB => {
  let best = 0;
  for (let v = 0; v < 256; v++) if (Math.abs(LIN[v] - l) < Math.abs(LIN[best] - l)) best = v;
  return [best, best, best];
};
const L = (c: RGB) => lum(c[0], c[1], c[2]);
// The red measure, (R − G − B) × 320 on linear values with a negative value 0, and the share of red, R / (R + G + B).
const redOf = (c: RGB) => Math.max(0, LIN[c[0]] - LIN[c[1]] - LIN[c[2]]) * 320;
const shareOf = (c: RGB) => LIN[c[0]] / (LIN[c[0]] + LIN[c[1]] + LIN[c[2]]);

// A box in a frame, by its left, its top, its width and its height in pixels.
type Box = [number, number, number, number];
// What the pixels of a box do: its colour at frame f, or null where it shows the ground under it.
type Paint = { box: Box; at: (f: number) => RGB | null };
// A square wave between two colours at `hz` flashes a second, at 60 frames a second: `b` from the first change on, every half period.
const flicker = (hz: number, a: RGB, b: RGB, from = 1) => (f: number) => (f < from ? a : Math.floor(((f - from) * 2 * hz) / 60) % 2 === 0 ? b : a);

// Counts `frames` frames of `width` by `height`, the ground `ground` (or its own colour at frame f) with `paints` over it.
function count(width: number, height: number, frames: number, paints: Paint[], { ground = BLACK as RGB | ((f: number) => RGB), lead = 0, mask = null as Uint8Array | null } = {}) {
  const counter = wcagCounter(width, height, { lead });
  if (mask) counter.mask(mask);
  const rgba = new Uint8Array(width * height * 4);
  for (let f = 0; f < frames; f++) {
    const g = typeof ground === "function" ? ground(f) : ground;
    for (let p = 0; p < width * height; p++) rgba.set([g[0], g[1], g[2], 255], p * 4);
    for (const { box: [x0, y0, w, h], at } of paints) {
      const c = at(f);
      if (!c) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) rgba.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
    }
    counter.add(rgba);
  }
  return counter.result();
}
// A frame 120 by 90: its field is 40 by 30, 1200 pixels, so a box of 360 is 30 % of it.
const W = 120, H = 90, FIELD_PX = 40 * 30;
const whole: Box = [0, 0, W, H];

describe("the 10° field", () => {
  it("is WCAG's 341 by 256 px on a 1024 by 768 screen, and the same share of any other: a third of the frame by a third", () => {
    expect(FIELD).toEqual([341 / 1024, 256 / 768]);
    expect(fieldOf(1024, 768)).toMatchObject({ w: 341, h: 256 });
    // A desktop at 800 by 500 CSS px and a pixel ratio of 1.5, and the phone's tier at 390 by 844 and 2.
    expect(fieldOf(1200, 750)).toMatchObject({ w: 400, h: 250 });
    expect(fieldOf(780, 1688)).toMatchObject({ w: 260, h: 563 });
    expect(fieldOf(W, H)).toMatchObject({ w: 40, h: 30 });
  });

  it("stands its windows a thirty-second of itself apart each way, from edge to edge of the frame", () => {
    const { w, h, xs, ys } = fieldOf(1200, 750);
    expect(STEPS).toBe(32);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(1200 - w);
    expect(ys[ys.length - 1]).toBe(750 - h);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeLessThanOrEqual(Math.ceil(w / 32));
    for (let k = 1; k < ys.length; k++) expect(ys[k] - ys[k - 1]).toBeLessThanOrEqual(Math.ceil(h / 32));
  });

  it("scales with the frame: a box that flashes over 40 % of the field in a small frame flashes over 10 % of it in one twice as wide and high, and passes", () => {
    const box: Paint = { box: [4, 4, 24, 20], at: flicker(4, BLACK, WHITE) };
    expect(count(W, H, 90, [box]).pass).toBe(false);
    const big = count(2 * W, 2 * H, 90, [box]);
    expect(big.pass).toBe(true);
    expect(big.general.largest!.share).toBeCloseTo((24 * 20) / (80 * 60), 4);
  });
});

describe("the general flash", () => {
  it("passes the whole frame flickering black to white at 2 a second, and fails it at 4", () => {
    const two = count(W, H, 130, [{ box: whole, at: flicker(2, BLACK, WHITE) }]);
    // Changes every 15 frames: 5 in any 61 frames, 2.5 flashes.
    expect(two.general).toMatchObject({ mostInASecond: 5, flashes: 2.5 });
    expect(two.pass).toBe(true);
    const four = count(W, H, 130, [{ box: whole, at: flicker(4, BLACK, WHITE) }]);
    expect(four.general.mostInASecond).toBeGreaterThanOrEqual(8);
    expect(four.general.flashes).toBeGreaterThan(3);
    expect(four.pass).toBe(false);
    expect(four.general.largest).toMatchObject({ share: 1 });
    // Black and white are no red.
    expect(four.red.mostInASecond).toBe(0);
  });

  it("holds a second to 61 frames, the cautious reading, and the bar to 6 changes in it: a change every 11 frames passes, every 10 fails", () => {
    expect(MOST).toBe(6);
    // A change every n frames from frame 1 on.
    const every = (n: number) => (f: number) => (f < 1 ? BLACK : Math.floor((f - 1) / n) % 2 === 0 ? WHITE : BLACK);
    const eleven = count(W, H, 130, [{ box: whole, at: every(11) }]);
    expect(eleven.general).toMatchObject({ mostInASecond: 6, flashes: 3 });
    expect(eleven.pass).toBe(true);
    // Every 10: 7 changes 60 frames first to last, and 6 within 59, the strict reading.
    const ten = count(W, H, 130, [{ box: whole, at: every(10) }]);
    expect(ten.general).toMatchObject({ mostInASecond: 7, mostInASecondStrict: 6 });
    expect(ten.pass).toBe(false);
  });

  it("passes a 2x2-pixel block flickering at 10 a second: it is a sliver of any field", () => {
    const result = count(2 * W, 2 * H, 90, [{ box: [100, 70, 2, 2], at: flicker(10, BLACK, WHITE) }]);
    expect(result.general.mostInASecond).toBe(0);
    expect(result.general.largest!.share).toBeCloseTo(4 / (80 * 60), 4);
    expect(result.pass).toBe(true);
  });

  it("fails a box of 30 % of a field flickering at 4 a second, and passes one of 20 %", () => {
    expect(AREA).toBe(0.25);
    const thirty = count(W, H, 90, [{ box: [10, 6, 20, 18], at: flicker(4, BLACK, WHITE) }]);
    expect(thirty.general.largest!.share).toBeCloseTo(360 / FIELD_PX, 6);
    expect(thirty.pass).toBe(false);
    // A quarter of the field exactly counts: WCAG passes 25 % and no more, and the count errs a pixel the cautious way.
    expect(count(W, H, 90, [{ box: [10, 6, 20, 15], at: flicker(4, BLACK, WHITE) }]).pass).toBe(false);
    const twenty = count(W, H, 90, [{ box: [10, 6, 20, 12], at: flicker(4, BLACK, WHITE) }]);
    expect(twenty.general.largest!.share).toBeCloseTo(240 / FIELD_PX, 6);
    expect(twenty.general.mostInASecond).toBe(0);
    expect(twenty.pass).toBe(true);
  });

  it("adds up the boxes that flash together in one field: two of 15 % each, apart, fail; the same two in fields of their own pass", () => {
    const at = flicker(4, BLACK, WHITE);
    const together = count(W, H, 90, [{ box: [2, 2, 12, 15], at }, { box: [24, 12, 12, 15], at }]);
    expect(together.general.largest!.share).toBeCloseTo(360 / FIELD_PX, 6);
    expect(together.pass).toBe(false);
    // At opposite corners of the frame no field holds both.
    const apart = count(W, H, 90, [{ box: [0, 0, 12, 15], at }, { box: [W - 12, H - 15, 12, 15], at }]);
    expect(apart.general.largest!.share).toBeCloseTo(180 / FIELD_PX, 6);
    expect(apart.pass).toBe(true);
  });

  it("counts a change of 10 % in relative luminance and not one under it: 0.114 fails at 4 a second, 0.089 passes", () => {
    expect(GENERAL).toBe(0.1);
    const over = grey(0.114), under = grey(0.089);
    expect(L(over)).toBeGreaterThan(0.11);
    expect(L(under)).toBeLessThan(0.09);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, over) }]).pass).toBe(false);
    const quiet = count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, under) }]);
    expect(quiet.general.mostInASecond).toBe(0);
    expect(quiet.pass).toBe(true);
  });

  it("counts no flash where the darker state is 0.80 or over: 0.85 to 0.97 passes at 4 a second, 0.75 to 0.88 fails", () => {
    expect(DARKER).toBe(0.8);
    const [a, b, c, d] = [grey(0.855), grey(0.973), grey(0.752), grey(0.88)];
    expect(L(a)).toBeGreaterThan(0.8);
    expect(L(b) - L(a)).toBeGreaterThan(0.1);
    expect(L(c)).toBeLessThan(0.8);
    expect(L(d) - L(c)).toBeGreaterThan(0.1);
    const bright = count(W, H, 90, [{ box: whole, at: flicker(4, a, b) }]);
    expect(bright.general.mostInASecond).toBe(0);
    expect(bright.pass).toBe(true);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, c, d) }]).pass).toBe(false);
  });

  it("counts a smooth pulse by its turns, though no frame changes by a tenth: 0.1 to 0.4 and back at 4 a second fails", () => {
    const pulse = (f: number) => grey(0.25 - 0.15 * Math.cos((2 * Math.PI * 4 * f) / 60));
    const frames = Array.from({ length: 90 }, (_, f) => L(pulse(f)));
    expect(Math.max(...frames.slice(1).map((v, f) => Math.abs(v - frames[f])))).toBeLessThan(0.07);
    expect(count(W, H, 90, [{ box: whole, at: pulse }]).pass).toBe(false);
  });

  it("takes pixels that leave a valley together as flashing together, though they pass a tenth frames apart: a light that fades in over 6 frames to six strengths", () => {
    // Bands 5 px high, a sixth of a field's height, rise over 6 frames and fall back over 6, to strengths that pass a tenth at the
    // 1st, 2nd ... 6th frame of the rise: no one frame holds more than a sixth of any field, and all six leave black together.
    const tops = [0.9, 0.4, 0.25, 0.17, 0.135, 0.11];
    const tri = (f: number) => { const p = f % 14; return (p <= 6 ? p : 13 - p) / 6; };
    const paints = Array.from({ length: H / 5 }, (_, k): Paint => ({ box: [0, k * 5, W, 5], at: (f) => grey(tops[k % 6] * tri(f)) }));
    for (const [k, top] of tops.entries()) {
      // Band k is under a tenth at frame k of the rise, and over it at frame k + 1.
      expect(L(grey((top * k) / 6))).toBeLessThan(0.1);
      expect(L(grey((top * (k + 1)) / 6))).toBeGreaterThan(0.1);
    }
    const result = count(W, H, 90, paints);
    expect(result.general.largest!.share).toBe(1);
    expect(result.pass).toBe(false);
  });

  it("counts a pair of opposing changes, not each change: the frame brightening in eight steps of 0.12 passes", () => {
    const stairs = (f: number) => grey(Math.min(8, Math.floor(f / 4)) * 0.12);
    const result = count(W, H, 90, [{ box: whole, at: stairs }]);
    expect(result.general.mostInASecond).toBe(1);
    expect(result.pass).toBe(true);
  });

  it("counts a pair of opposing changes at a pixel, not each change: half the frame brightening in steps of 0.12 as the other half dims in steps between them passes", () => {
    // The left half steps up every 8 frames from frame 1, the right half down every 8 from frame 5: neither ever turns.
    const up = (f: number) => grey(Math.min(8, Math.floor((f + 7) / 8)) * 0.12), down = (f: number) => grey(0.96 - Math.min(8, Math.floor((f + 3) / 8)) * 0.12);
    const result = count(W, H, 90, [{ box: [0, 0, W / 2, H], at: up }, { box: [W / 2, 0, W / 2, H], at: down }]);
    expect(result.general.mostInASecond).toBeLessThanOrEqual(2);
    expect(result.pass).toBe(true);
  });

  it("counts a field half of which rises as the other half falls as one change, not two: two halves flickering against each other at 2 a second pass", () => {
    const at = flicker(2, BLACK, WHITE), back = flicker(2, WHITE, BLACK);
    const result = count(W, H, 130, [{ box: [0, 0, W / 2, H], at }, { box: [W / 2, 0, W / 2, H], at: back }]);
    expect(result.general.mostInASecond).toBe(5);
    expect(result.pass).toBe(true);
  });

  it("counts a field's two halves changing against each other as one change, though one changes in a frame and the other over three", () => {
    // The left half steps between black and 0.3 every 15 frames; the right half goes the other way by 0.04 a frame, and passes a
    // tenth on the third. At each turn the field rises and falls at once, and goes on falling, or rising, for two frames more.
    const left = flicker(2, BLACK, grey(0.3));
    const right = (f: number) => { const p = (((f - 1) % 30) + 30) % 30; return grey(p < 15 ? Math.max(0, 0.3 - 0.04 * (p + 1)) : Math.min(0.3, 0.04 * (p - 14))); };
    const result = count(W, H, 130, [{ box: [0, 0, W / 2, H], at: left }, { box: [W / 2, 0, W / 2, H], at: right }]);
    expect(result.general.mostInASecond).toBe(5);
    expect(result.pass).toBe(true);
  });

  it("counts a field's changes the same way in a row as one: three lights coming on in turn and going off together, twice a second, pass", () => {
    // Each light is 30 % of the field. They come on at frames 1, 6 and 11 of every 30 and go off together at 16.
    const light = (on: number): Paint["at"] => (f) => { const p = (f - 1) % 30; return f >= 1 && p >= on - 1 && p < 15 ? WHITE : BLACK; };
    const result = count(W, H, 130, [{ box: [0, 0, 12, 30], at: light(1) }, { box: [14, 0, 12, 30], at: light(6) }, { box: [28, 0, 12, 30], at: light(11) }]);
    expect(result.general.mostInASecond).toBe(5);
    expect(result.pass).toBe(true);
  });

  it("says where and when: the field over the box, and the frame its busiest second starts at", () => {
    // A box at the frame's far corner, flickering at 6 a second from frame 30 to frame 90 and still before and after.
    const at = (f: number) => (f >= 30 && f < 90 ? flicker(6, BLACK, WHITE, 30)(f) : BLACK);
    const result = count(W, H, 150, [{ box: [90, 64, 24, 20], at }]);
    expect(result.pass).toBe(false);
    const worst = result.general.worst!;
    expect(worst.runStartsAtFrame).toBe(30);
    // The field it names holds a quarter of itself or more of the box.
    const across = Math.min(worst.x + worst.w, 114) - Math.max(worst.x, 90), down = Math.min(worst.y + worst.h, 84) - Math.max(worst.y, 64);
    expect([worst.w, worst.h]).toEqual([40, 30]);
    expect(across * down).toBeGreaterThanOrEqual(FIELD_PX / 4);
    expect(worst.transitions[0]).toEqual([30, 1]);
    expect(worst.transitions).toHaveLength(worst.mostInASecond);
  });
});

describe("the red flash", () => {
  // A saturated red whose change in luminance from black is under a tenth, and a red that is not saturated, as dim.
  const RED_SAT: RGB = [150, 51, 51], RED_DULL: RGB = [140, 55, 55];

  it("fails a saturated red flickering with black at 4 a second, whose luminance alone would pass", () => {
    expect(SATURATED).toBe(0.8);
    expect(RED).toBe(20);
    expect(shareOf(RED_SAT)).toBeGreaterThan(0.8);
    expect(shareOf(RED_SAT)).toBeLessThan(0.83);
    expect(L(RED_SAT)).toBeLessThan(0.1);
    expect(redOf(RED_SAT)).toBeGreaterThan(20);
    const result = count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, RED_SAT) }]);
    expect(result.general.mostInASecond).toBe(0);
    expect(result.red.mostInASecond).toBeGreaterThanOrEqual(8);
    expect(result.pass).toBe(false);
  });

  it("passes a red that is not saturated, under 0.8 of R + G + B, though its red measure changes by more than 20", () => {
    expect(shareOf(RED_DULL)).toBeLessThan(0.8);
    expect(shareOf(RED_DULL)).toBeGreaterThan(0.75);
    expect(redOf(RED_DULL)).toBeGreaterThan(20);
    expect(L(RED_DULL)).toBeLessThan(0.1);
    const result = count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, RED_DULL) }]);
    expect(result.red.mostInASecond).toBe(0);
    expect(result.pass).toBe(true);
  });

  it("counts a change of more than 20 in the red measure and not one under it", () => {
    const dim: RGB = [61, 0, 0], brighter: RGB = [80, 0, 0];
    expect(redOf(dim)).toBeLessThan(20);
    expect(redOf(brighter)).toBeGreaterThan(20);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, dim) }]).pass).toBe(true);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, brighter) }]).red.mostInASecond).toBeGreaterThanOrEqual(8);
  });

  it("holds the red to the same area: a saturated red of 20 % of a field passes, and one of 30 % fails", () => {
    expect(count(W, H, 90, [{ box: [10, 6, 20, 12], at: flicker(4, BLACK, RED_SAT) }]).pass).toBe(true);
    expect(count(W, H, 90, [{ box: [10, 6, 20, 18], at: flicker(4, BLACK, RED_SAT) }]).red.mostInASecond).toBeGreaterThan(MOST);
  });
});

describe("a window's lead-in and the plates' mask", () => {
  it("counts no change of the lead-in: a flicker that stops as the window starts passes", () => {
    const at = (f: number) => (f < 60 ? flicker(6, BLACK, WHITE)(f) : BLACK);
    const result = count(W, H, 150, [{ box: whole, at }], { lead: 60 });
    expect(result.general.mostInASecond).toBeLessThanOrEqual(1);
    expect(result.pass).toBe(true);
    // And the same frames with no lead-in fail.
    expect(count(W, H, 150, [{ box: whole, at }]).pass).toBe(false);
  });

  it("counts nothing under a plate: a box that flickers under the HUD passes", () => {
    const box: Paint = { box: [10, 6, 20, 18], at: flicker(4, BLACK, WHITE) };
    // A plate at 10, 6 by 20 by 18 CSS px at a pixel ratio of 1, with no pad.
    const mask = platesPixelMask([{ x: 10, y: 6, w: 20, h: 18 }], W, H, 1, 0);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(360);
    const result = count(W, H, 90, [box], { mask });
    expect(result.maskedPixels).toBe(360);
    expect(result.pass).toBe(true);
  });

  it("masks a plate in device pixels, a pad of pixels round it", () => {
    const mask = platesPixelMask([{ x: 2.5, y: 3, w: 4, h: 2 }], 40, 30, 2, 2);
    // 5 to 13 device px across, 6 to 10 down, and 2 more each way: x 3 to 14, y 4 to 11.
    const at = (x: number, y: number) => mask[y * 40 + x];
    expect(at(3, 4)).toBe(1);
    expect(at(14, 11)).toBe(1);
    expect(at(2, 4)).toBe(0);
    expect(at(15, 11)).toBe(0);
    expect(at(3, 12)).toBe(0);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(12 * 8);
  });
});
