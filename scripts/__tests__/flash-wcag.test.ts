import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { LIN } from "../flash/analyse.mjs";
import { repoRoot } from "../flash/lib.mjs";
import { AREA, DARKER, fieldOf, FIELD, GENERAL, KEEP, MOST, NEAR, platesPixelMask, RED, SATURATED, SPAN, wcagCounter } from "../flash/wcag.mjs";

// The WCAG count (scripts/flash/wcag.mjs) on frames made here: WCAG 2.3.1's general and red flash thresholds, by the area of a 10° field
// that is a third of the frame by a third. Each run is a frame size, a number of frames, and the colour of each pixel at each frame.

type RGB = [number, number, number];
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255];

// WCAG's relative luminance, written out from its definition (WCAG 2.2, "relative luminance") and not taken from the counter: each sRGB
// byte over 255, made linear, and weighted 0.2126, 0.7152 and 0.0722.
const linear = (byte: number) => { const c = byte / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (c: RGB) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
// The red measure, (R − G − B) × 320 on linear values with a negative value 0, and the share of red, R / (R + G + B).
const redOf = (c: RGB) => Math.max(0, linear(c[0]) - linear(c[1]) - linear(c[2])) * 320;
const shareOf = (c: RGB) => linear(c[0]) / (linear(c[0]) + linear(c[1]) + linear(c[2]));
// A grey whose relative luminance is nearest `l`.
const GREYS = Array.from({ length: 256 }, (_, v) => L([v, v, v]));
const grey = (l: number): RGB => {
  let best = 0;
  for (let v = 0; v < 256; v++) if (Math.abs(GREYS[v] - l) < Math.abs(GREYS[best] - l)) best = v;
  return [best, best, best];
};

// A box in a frame, by its left, its top, its width and its height in pixels.
type Box = [number, number, number, number];
// What the pixels of a box do: its colour at frame f, or null where it shows the ground under it; or each pixel's own colour.
type Paint = { box: Box; at: (f: number) => RGB | null } | { box: Box; each: (x: number, y: number, f: number) => RGB };
// A square wave between two colours at `hz` flashes a second, at 60 frames a second: `b` from the first change on, every half period.
const flicker = (hz: number, a: RGB, b: RGB, from = 1) => (f: number) => (f < from ? a : Math.floor(((f - from) * 2 * hz) / 60) % 2 === 0 ? b : a);
// Stripes 24 px black and 24 px white moving across at 3.2 px a frame: each pixel flickers at 4 a second, but out of step with the next.
const stripes = (x: number, _y: number, f: number): RGB => (Math.floor((x + 3.2 * f) / 24) % 2 ? WHITE : BLACK);

// Counts `frames` frames of `width` by `height`, the ground `ground` (or its own colour at frame f) with `paints` over it.
// `mask` leaves out pixels from frame `maskFrom` on.
function count(width: number, height: number, frames: number, paints: Paint[], { ground = BLACK as RGB | ((f: number) => RGB), lead = 0, mask = null as Uint8Array | null, maskFrom = 0 } = {}) {
  const counter = wcagCounter(width, height, { lead });
  const rgba = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, c: RGB) => { const o = (y * width + x) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; };
  for (let f = 0; f < frames; f++) {
    if (mask && f === maskFrom) counter.mask(mask);
    const g = typeof ground === "function" ? ground(f) : ground;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, g);
    for (const paint of paints) {
      const [x0, y0, w, h] = paint.box;
      const c = "at" in paint ? paint.at(f) : null;
      if ("at" in paint && !c) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, "each" in paint ? paint.each(x, y, f) : c!);
    }
    counter.add(rgba);
  }
  return counter.result();
}
// A frame 120 by 90: its field is 40 by 30, 1200 pixels, so a box of 360 is 30 % of it.
const W = 120, H = 90, FIELD_PX = 40 * 30;
const whole: Box = [0, 0, W, H];
// A run of greys, frame by frame, as a box's colour: `steps` is [frame, luminance] from that frame on, black before the first.
const steps = (...at: [number, number][]) => (f: number) => { let l = 0; for (const [from, v] of at) if (f >= from) l = v; return grey(l); };

describe("relative luminance", () => {
  it("is WCAG's: each byte made linear by the sRGB curve", () => {
    for (const byte of [0, 1, 10, 11, 50, 128, 200, 254, 255]) expect(LIN[byte]).toBeCloseTo(linear(byte), 12);
    // Written out: 10 is under the curve's knee, 11 over it.
    expect(LIN[10]).toBeCloseTo(0.0030353, 7);
    expect(LIN[11]).toBeCloseTo(0.0033465, 7);
    expect(LIN[128]).toBeCloseTo(0.2158605, 7);
    expect(LIN[255]).toBe(1);
  });

  it("weighs green most and blue least: pure blue flickering with black at 4 a second passes, its luminance 0.07, and pure green fails", () => {
    const blue: RGB = [0, 0, 255], green: RGB = [0, 255, 0];
    expect(L(blue)).toBeCloseTo(0.0722, 4);
    const b = count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, blue) }]);
    expect(b.general.mostInASecond).toBe(0);
    expect(b.pass).toBe(true);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, green) }]).general.mostInASecond).toBeGreaterThan(MOST);
  });

  it("reads all three bytes of a pixel: a change of the green byte alone is a change", () => {
    const result = count(W, H, 90, [{ box: whole, at: flicker(4, [200, 0, 200], [200, 255, 200]) }]);
    expect(result.pass).toBe(false);
  });
});

describe("the 10° field", () => {
  it("is WCAG's 341 by 256 px on a 1024 by 768 screen, and the same share of any other: a third of the frame by a third, to the nearest pixel", () => {
    expect(FIELD).toEqual([341 / 1024, 256 / 768]);
    expect(fieldOf(1024, 768)).toEqual({ w: 341, h: 256, nx: 684, ny: 513 });
    // A desktop at 800 by 500 CSS px and a pixel ratio of 1.5, and the phone's tier at 390 by 844 and 2.
    expect(fieldOf(1200, 750)).toMatchObject({ w: 400, h: 250 });
    expect(fieldOf(780, 1688)).toMatchObject({ w: 260, h: 563 });
    expect(fieldOf(W, H)).toEqual({ w: 40, h: 30, nx: 81, ny: 61 });
    // 320 × 341/1024 is 106.6: the nearest pixel, 107.
    expect(fieldOf(320, 240)).toMatchObject({ w: 107, h: 80 });
  });

  it("stands at every place in the frame: a flash of just over a quarter of a field is caught wherever it is, and one just under passes", () => {
    // 27 by 80 is 25.2 % of a 107 by 80 field, 26 by 80 is 24.3 %.
    const at = flicker(4, BLACK, WHITE);
    for (const [x, y] of [[10, 0], [10, 2], [11, 3], [200, 160]]) {
      const result = count(320, 240, 75, [{ box: [x, y, 27, 80], at }]);
      expect(result.general.atOnce.largest!.share).toBeCloseTo((27 * 80) / (107 * 80), 4);
      expect(result.pass).toBe(false);
    }
    expect(count(320, 240, 75, [{ box: [10, 2, 26, 80], at }]).pass).toBe(true);
  });

  it("scales with the frame: a box that flashes over 40 % of the field in a small frame flashes over 10 % of it in one twice as wide and high, and passes", () => {
    const box: Paint = { box: [4, 4, 24, 20], at: flicker(4, BLACK, WHITE) };
    expect(count(W, H, 90, [box]).pass).toBe(false);
    const big = count(2 * W, 2 * H, 90, [box]);
    expect(big.pass).toBe(true);
    expect(big.general.atOnce.largest!.share).toBeCloseTo((24 * 20) / (80 * 60), 4);
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
    expect(four.general.atOnce.largest).toMatchObject({ share: 1 });
    // Black and white are no red.
    expect(four.red.mostInASecond).toBe(0);
  });

  it("holds a second to 61 frames, the cautious reading, and the bar to 6 changes in it: a change every 11 frames passes, every 10 (3 a second exactly) fails", () => {
    expect(MOST).toBe(6);
    // A change every n frames from frame 1 on.
    const every = (n: number) => (f: number) => (f < 1 ? BLACK : Math.floor((f - 1) / n) % 2 === 0 ? WHITE : BLACK);
    const eleven = count(W, H, 130, [{ box: whole, at: every(11) }]);
    expect(eleven.general).toMatchObject({ mostInASecond: 6, flashes: 3 });
    expect(eleven.pass).toBe(true);
    // Every 10: 7 changes 60 frames first to last, and 6 within 59, the strict reading.
    const ten = count(W, H, 130, [{ box: whole, at: every(10) }]);
    expect(ten.general.mostInASecond).toBe(7);
    expect(ten.general.atOnce).toMatchObject({ mostInASecond: 7, mostInASecondStrict: 6 });
    expect(ten.general.perPixel.mostInASecond).toBe(7);
    expect(ten.pass).toBe(false);
    // Seven changes 61 frames first to last are 6 in any second.
    const at = [1, 11, 21, 31, 41, 51, 62];
    const wide = count(W, H, 90, [{ box: whole, at: (f) => (at.filter((c) => c <= f).length % 2 ? WHITE : BLACK) }]);
    expect(wide.general.atOnce.mostInASecond).toBe(6);
    expect(wide.general.perPixel.mostInASecond).toBe(6);
    expect(wide.pass).toBe(true);
  });

  it("names a count of up to 16 in a second", () => {
    expect(KEEP).toBe(16);
    // A change every 3 frames: 21 in 61 frames, named as 16.
    const fast = count(W, H, 90, [{ box: whole, at: (f) => (Math.floor(f / 3) % 2 ? WHITE : BLACK) }]);
    expect(fast.general.atOnce.mostInASecond).toBe(16);
    expect(fast.general.perPixel.mostInASecond).toBe(21);
    expect(fast.pass).toBe(false);
  });

  it("passes a 2x2-pixel block flickering at 10 a second: it is a sliver of any field", () => {
    const result = count(2 * W, 2 * H, 90, [{ box: [100, 70, 2, 2], at: flicker(10, BLACK, WHITE) }]);
    expect(result.general.mostInASecond).toBe(0);
    expect(result.general.atOnce.largest!.share).toBeCloseTo(4 / (80 * 60), 4);
    expect(result.general.perPixel.mostAtAPixel).toBeGreaterThan(MOST);
    expect(result.pass).toBe(true);
  });

  it("fails a box of 30 % of a field flickering at 4 a second, and passes one of 20 %", () => {
    expect(AREA).toBe(0.25);
    const thirty = count(W, H, 90, [{ box: [10, 6, 20, 18], at: flicker(4, BLACK, WHITE) }]);
    expect(thirty.general.atOnce.largest!.share).toBeCloseTo(360 / FIELD_PX, 6);
    expect(thirty.pass).toBe(false);
    // A quarter of the field exactly counts: WCAG passes 25 % and no more, and the count errs a pixel the cautious way.
    const quarter = count(W, H, 90, [{ box: [10, 6, 20, 15], at: flicker(4, BLACK, WHITE) }]);
    expect(quarter.general.atOnce.mostInASecond).toBeGreaterThan(MOST);
    expect(quarter.general.perPixel.mostInASecond).toBeGreaterThan(MOST);
    expect(quarter.pass).toBe(false);
    const twenty = count(W, H, 90, [{ box: [10, 6, 20, 12], at: flicker(4, BLACK, WHITE) }]);
    expect(twenty.general.atOnce.largest!.share).toBeCloseTo(240 / FIELD_PX, 6);
    expect(twenty.general.perPixel.overTheBar!.share).toBeCloseTo(240 / FIELD_PX, 6);
    expect(twenty.general.mostInASecond).toBe(0);
    expect(twenty.pass).toBe(true);
  });

  it("adds up the boxes that flash together in one field: two of 15 % each, apart, fail; the same two in fields of their own pass", () => {
    const at = flicker(4, BLACK, WHITE);
    const together = count(W, H, 90, [{ box: [2, 2, 12, 15], at }, { box: [24, 12, 12, 15], at }]);
    expect(together.general.atOnce.largest!.share).toBeCloseTo(360 / FIELD_PX, 6);
    expect(together.pass).toBe(false);
    // At opposite corners of the frame no field holds both.
    const apart = count(W, H, 90, [{ box: [0, 0, 12, 15], at }, { box: [W - 12, H - 15, 12, 15], at }]);
    expect(apart.general.atOnce.largest!.share).toBeCloseTo(180 / FIELD_PX, 6);
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

  it("counts a first change down from a bright start, its darker state the one it falls to: 0.88 to 0.75 and back fails from its first frame", () => {
    for (const [from, to] of [[WHITE, BLACK], [grey(0.88), grey(0.752)]] as [RGB, RGB][]) {
      const result = count(W, H, 90, [{ box: whole, at: flicker(4, from, to) }]);
      expect(result.pass).toBe(false);
      expect(result.general.atOnce.worst!.transitions[0]).toEqual([1, -1]);
      expect(result.general.atOnce.worst!.runStartsAtFrame).toBe(1);
    }
  });

  it("counts a smooth pulse by its turns, though no frame changes by a tenth: 0.1 to 0.4 and back at 4 a second fails", () => {
    const pulse = (f: number) => grey(0.25 - 0.15 * Math.cos((2 * Math.PI * 4 * f) / 60));
    const frames = Array.from({ length: 90 }, (_, f) => L(pulse(f)));
    expect(Math.max(...frames.slice(1).map((v, f) => Math.abs(v - frames[f])))).toBeLessThan(0.07);
    expect(count(W, H, 90, [{ box: whole, at: pulse }]).pass).toBe(false);
  });

  it("counts a slow ramp up and down once each way, at the frames it has moved a tenth from its turn", () => {
    // 0 to 0.36 over 12 frames and back over 12, 0.03 a frame: it passes a tenth 4 frames after each turn, so every 12 frames.
    const tri = (f: number) => { const p = f % 24; return grey(0.03 * (p <= 12 ? p : 24 - p)); };
    const result = count(W, H, 90, [{ box: whole, at: tri }]);
    expect(result.general.atOnce.mostInASecond).toBe(6);
    expect(result.general.atOnce.worst!.transitions).toEqual([[4, 1], [16, -1], [28, 1], [40, -1], [52, 1], [64, -1]]);
    expect(result.pass).toBe(true);
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
    expect(result.general.atOnce.largest!.share).toBe(1);
    expect(result.pass).toBe(false);
  });

  it("takes a pixel's change from the frame it leaves its turn, though it pauses on the way: two lights pass a tenth together only if one left its valley in time", () => {
    // Two lights of 15 % of a field each, side by side. One rises at once to 0.12 at frame b; the other leaves black at frame 6 for
    // 0.05, holds there, and passes a tenth at frame 50, so its change takes frames 6 to 50, of which the last 30, 21 to 50, count.
    expect(SPAN).toBe(30);
    const slow: Paint = { box: [0, 0, 12, 15], at: steps([6, 0.05], [50, 0.12]) };
    const quick = (b: number): Paint => ({ box: [14, 0, 12, 15], at: steps([b, 0.12]) });
    expect(count(W, H, 70, [slow, quick(21)]).general.atOnce.largest!.share).toBeCloseTo(0.3, 6);
    expect(count(W, H, 70, [slow, quick(20)]).general.atOnce.largest!.share).toBeCloseTo(0.15, 6);
    // The field's change is at the frame it completes, 50, not at the frame its light left black.
    const alone = count(W, H, 70, [{ box: [0, 0, 24, 15], at: steps([6, 0.05], [50, 0.12]) }]);
    expect(alone.general.atOnce.worst!.transitions).toEqual([[50, 1]]);
  });

  it("takes a later change from the frame the pixel left its turn, though it pauses on the way: a light that dims in two steps changes with one that goes out between them", () => {
    // One light comes on to 0.3 at frame 3, dims to 0.25 at 10 and to 0.1 at 30: its fall takes frames 10 to 30. The other comes on
    // at 5 and goes out at 20, inside that fall.
    const result = count(W, H, 50, [{ box: [0, 0, 12, 15], at: steps([3, 0.3], [10, 0.25], [30, 0.1]) }, { box: [14, 0, 12, 15], at: (f) => (f >= 5 && f < 20 ? WHITE : BLACK) }]);
    expect(result.general.atOnce.largest).toMatchObject({ direction: -1, frame: 20 });
    expect(result.general.atOnce.largest!.share).toBeCloseTo(0.3, 6);
  });

  it("holds a pixel at its turn while it stands within a tenth of the threshold of it, and no further", () => {
    expect(NEAR).toEqual([0.01, 2]);
    // One light waits at `hold` from frame 10 and passes a tenth at 20; the other rises at once at 15. Within 0.01 of black, the
    // first's change starts at 20 and the two never change together; at 0.02, it starts at 10 and they do.
    const lights = (hold: number) => count(W, H, 40, [{ box: [0, 0, 12, 15], at: steps([10, hold], [20, 0.12]) }, { box: [14, 0, 12, 15], at: steps([15, 0.12]) }]);
    expect(L(grey(0.005))).toBeLessThan(0.01);
    expect(L(grey(0.02))).toBeGreaterThan(0.015);
    expect(lights(0.005).general.atOnce.largest!.share).toBeCloseTo(0.15, 6);
    expect(lights(0.02).general.atOnce.largest!.share).toBeCloseTo(0.3, 6);
  });

  it("holds a pixel at its peak while it stands there: two lights that come on apart and go off 10 frames apart never change together", () => {
    const light = (on: number, off: number) => (f: number) => (f >= on && f < off ? WHITE : BLACK);
    const result = count(W, H, 60, [{ box: [0, 0, 12, 15], at: light(3, 40) }, { box: [14, 0, 12, 15], at: light(8, 30) }]);
    expect(result.general.atOnce.largest!.share).toBeCloseTo(0.15, 6);
  });

  it("stamps a field's change at the frame it completes, so a slow first change counts in the second it ends in", () => {
    // The frame rises 0.0045 a frame from frame 3 and passes a tenth at 25, then changes at once every 10 frames, 35 to 85: 7 changes
    // from 25 to 85, 60 frames first to last. Stamped at frame 5, where it left black, the first would be a second and more from the last.
    const ramp = (f: number) => (f < 25 ? grey(Math.max(0, 0.0045 * (f - 2))) : f < 35 ? grey(0.3) : Math.floor((f - 35) / 10) % 2 === 0 ? BLACK : grey(0.3));
    const result = count(W, H, 90, [{ box: whole, at: (f) => (f <= 85 ? ramp(f) : ramp(85)) }]);
    expect(result.general.atOnce.worst!.transitions[0]).toEqual([25, 1]);
    expect(result.general.atOnce.mostInASecond).toBe(7);
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

  it("counts a field half of which rises as the other half falls as one change, not two, each opposite to the last: two halves flickering against each other at 2 a second pass", () => {
    const at = flicker(2, BLACK, WHITE), back = flicker(2, WHITE, BLACK);
    const result = count(W, H, 130, [{ box: [0, 0, W / 2, H], at }, { box: [W / 2, 0, W / 2, H], at: back }]);
    expect(result.general.mostInASecond).toBe(5);
    const directions = result.general.atOnce.worst!.transitions.map(([, d]) => d);
    expect(directions).toHaveLength(5);
    for (let k = 1; k < directions.length; k++) expect(directions[k]).toBe(-directions[k - 1]);
    expect(result.pass).toBe(true);
  });

  it("takes a field's change both ways at once as opposite to its last: a rise, then a fall with a rise, then a fall, is two changes", () => {
    // Two lights of half a field each: the left comes on at 10; at 20 it goes out as the right comes on; the right goes out at 30.
    const result = count(W, H, 50, [{ box: [0, 0, 20, 30], at: (f) => (f >= 10 && f < 20 ? WHITE : BLACK) }, { box: [20, 0, 20, 30], at: (f) => (f >= 20 && f < 30 ? WHITE : BLACK) }]);
    expect(result.general.atOnce.mostInASecond).toBe(2);
    expect(result.general.atOnce.worst!.transitions).toEqual([[10, 1], [20, -1]]);
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
    const light = (on: number): ((f: number) => RGB) => (f) => { const p = (f - 1) % 30; return f >= 1 && p >= on - 1 && p < 15 ? WHITE : BLACK; };
    const result = count(W, H, 130, [{ box: [0, 0, 12, 30], at: light(1) }, { box: [14, 0, 12, 30], at: light(6) }, { box: [28, 0, 12, 30], at: light(11) }]);
    expect(result.general.mostInASecond).toBe(5);
    expect(result.pass).toBe(true);
  });

  it("counts a change at the last frame", () => {
    const result = count(W, H, 40, [{ box: whole, at: (f) => (f === 39 ? WHITE : BLACK) }]);
    expect(result.general.atOnce.worst!.transitions).toEqual([[39, 1]]);
  });

  it("gives the largest share of a field that changed one way at once, falling as well as rising", () => {
    const result = count(W, H, 40, [{ box: [10, 6, 20, 18], at: (f) => (f < 10 ? WHITE : BLACK) }]);
    expect(result.general.atOnce.largest).toMatchObject({ share: 0.3, frame: 10, direction: -1 });
    expect(result.general.atOnce.worst!.transitions).toEqual([[10, -1]]);
  });

  it("says where and when: the field over the box, and the frame its busiest second starts at", () => {
    // A box at the frame's far corner, flickering at 6 a second from frame 30 to frame 90 and still before and after.
    const at = (f: number) => (f >= 30 && f < 90 ? flicker(6, BLACK, WHITE, 30)(f) : BLACK);
    const result = count(W, H, 150, [{ box: [90, 64, 24, 20], at }]);
    expect(result.pass).toBe(false);
    const worst = result.general.atOnce.worst!;
    expect(worst.runStartsAtFrame).toBe(30);
    // The field it names holds a quarter of itself or more of the box.
    const across = Math.min(worst.x + worst.w, 114) - Math.max(worst.x, 90), down = Math.min(worst.y + worst.h, 84) - Math.max(worst.y, 64);
    expect([worst.w, worst.h]).toEqual([40, 30]);
    expect(across * down).toBeGreaterThanOrEqual(FIELD_PX / 4);
    expect(worst.transitions[0]).toEqual([30, 1]);
    expect(worst.transitions).toHaveLength(worst.mostInASecond);
    const pixels = result.general.perPixel.worst!;
    expect(Math.min(pixels.x + pixels.w, 114) - Math.max(pixels.x, 90)).toBeGreaterThan(0);
    expect(pixels.share).toBeGreaterThanOrEqual(0.25);
  });
});

describe("pixel by pixel", () => {
  // A frame 96 by 72: its field is 32 by 24.
  const SW = 96, SH = 72;

  it("fails stripes moving across the frame, each pixel flickering at 4 a second out of step with its neighbours, which at once never sees", () => {
    const result = count(SW, SH, 180, [{ box: [0, 0, SW, SH], each: stripes }]);
    expect(result.general.atOnce.mostInASecond).toBeLessThanOrEqual(MOST);
    expect(result.general.atOnce.largest!.share).toBeLessThan(0.25);
    expect(result.general.perPixel.mostInASecond).toBeGreaterThan(MOST);
    expect(result.general.perPixel.overTheBar!.share).toBe(1);
    expect(result.general.mostInASecond).toBe(result.general.perPixel.mostInASecond);
    expect(result.pass).toBe(false);
  });

  it("fails a smooth wave moving across the frame, where rising and falling go on at once all through and at once counts the field's change once", () => {
    const wave = (x: number, _y: number, f: number) => grey(0.5 + 0.5 * Math.sin(2 * Math.PI * (x / 48 + (4 * f) / 60)));
    const result = count(SW, SH, 180, [{ box: [0, 0, SW, SH], each: wave }]);
    expect(result.general.atOnce.largest!.share).toBeGreaterThan(0.25);
    expect(result.general.atOnce.mostInASecond).toBeLessThanOrEqual(2);
    expect(result.general.perPixel.mostInASecond).toBeGreaterThan(MOST);
    expect(result.pass).toBe(false);
  });

  it("counts by the field's area: moving stripes over 20 % of a field pass, over 30 % fail", () => {
    // 16 by 15 and 24 by 15 of a 40 by 30 field.
    expect(count(W, H, 120, [{ box: [10, 6, 16, 15], each: stripes }]).pass).toBe(true);
    const thirty = count(W, H, 120, [{ box: [10, 6, 24, 15], each: stripes }]);
    expect(thirty.general.perPixel.overTheBar!.share).toBeCloseTo(0.3, 6);
    expect(thirty.pass).toBe(false);
  });

  it("stands at every place too: two bands of moving stripes 35 px apart, a quarter of a field only where one field holds both, fail", () => {
    // Columns 3 to 7 and 38 to 42, rows 3 to 32: 300 pixels, a quarter of a 40 by 30 field, and all of them only in the field at (3, 3).
    const bands = (x: number, y: number, f: number): RGB => ((x < 8 || x >= 38) ? stripes(x, y, f) : BLACK);
    const result = count(W, H, 120, [{ box: [3, 3, 40, 30], each: bands }]);
    expect(result.general.atOnce.largest!.share).toBeLessThan(0.25);
    expect(result.general.perPixel.worst).toMatchObject({ x: 3, y: 3, share: 0.25 });
    expect(result.pass).toBe(false);
  });

  it("leaves out a pixel from the frame it is masked, its transitions before it too", () => {
    // Two patches flicker a column at a time, every 7 frames: one of 20 % of a field from frame 1, the other of 10 % from frame 9.
    // The first is masked at frame 50, before the second has made 7 changes; together, in the second to frame 55, they are 30 %.
    const every7 = (from: number) => (x: number, _y: number, f: number): RGB => (f >= from + (x % 5) && Math.floor((f - from - (x % 5)) / 7) % 2 === 0 ? WHITE : BLACK);
    const paints: Paint[] = [{ box: [0, 0, 16, 15], each: every7(1) }, { box: [16, 0, 8, 15], each: every7(9) }];
    expect(count(W, H, 70, paints).general.perPixel.mostInASecond).toBeGreaterThan(MOST);
    const mask = platesPixelMask([{ x: 0, y: 0, w: 16, h: 15 }], W, H, 1, 0);
    const masked = count(W, H, 70, paints, { mask, maskFrom: 50 });
    expect(masked.general.perPixel.mostInASecond).toBeLessThanOrEqual(MOST);
    expect(masked.pass).toBe(true);
  });

  it("adds up only the pixels busy in the same second: two patches of 15 % of a field, a second and more apart, pass; in the same second they fail", () => {
    const during = (from: number, to: number) => (x: number, y: number, f: number): RGB => (f >= from && f < to ? stripes(x, y, f) : BLACK);
    const apart = count(W, H, 200, [{ box: [0, 0, 12, 15], each: during(0, 60) }, { box: [14, 0, 12, 15], each: during(130, 190) }]);
    expect(apart.general.perPixel.overTheBar!.share).toBeCloseTo(0.15, 6);
    expect(apart.pass).toBe(true);
    const together = count(W, H, 200, [{ box: [0, 0, 12, 15], each: during(0, 60) }, { box: [14, 0, 12, 15], each: during(0, 60) }]);
    expect(together.general.perPixel.overTheBar!.share).toBeCloseTo(0.3, 6);
    expect(together.pass).toBe(false);
  });

  it("counts each pixel's transitions in the same second: columns a frame out of step changing every 9 frames fail at a quarter of a field, and every 10 pass", () => {
    // Column x changes every n frames from frame 1 + x % 5. Every 9 frames, each makes 7 changes in 55 frames, and one second holds
    // all of them; every 10, each makes 7 in exactly 61 frames, a different 61 for each column, and no second holds 7 of every one.
    const every = (n: number) => (x: number, _y: number, f: number): RGB => (f >= 1 + (x % 5) && Math.floor((f - 1 - (x % 5)) / n) % 2 === 0 ? WHITE : BLACK);
    const nine = count(W, H, 90, [{ box: [0, 0, 20, 15], each: every(9) }]);
    expect(nine.general.atOnce.largest!.share).toBeLessThan(0.25);
    expect(nine.general.perPixel.mostInASecond).toBe(7);
    expect(nine.general.perPixel.worst!.share).toBe(0.25);
    expect(nine.pass).toBe(false);
    const ten = count(W, H, 90, [{ box: [0, 0, 20, 15], each: every(10) }]);
    expect(ten.general.perPixel.mostInASecond).toBe(6);
    expect(ten.general.perPixel.mostAtAPixel).toBe(7);
    expect(ten.pass).toBe(true);
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

  it("takes green and blue off red each by its own amount: of two saturated reds with green over blue, either side of 20, one passes and one fails", () => {
    // The reds (r, 20, 5): the first r whose measure is over 20, and the one before it.
    let r = 0;
    while (redOf([r, 20, 5]) <= 20) r += 1;
    const under: RGB = [r - 1, 20, 5], over: RGB = [r, 20, 5];
    expect(redOf(under)).toBeGreaterThan(18);
    for (const c of [under, over]) {
      expect(shareOf(c)).toBeGreaterThan(0.8);
      expect(L(c)).toBeLessThan(0.05);
    }
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, under) }]).red.mostInASecond).toBe(0);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, BLACK, over) }]).red.mostInASecond).toBeGreaterThan(MOST);
  });

  it("counts a negative red measure as 0: a dim red flickering with a dim green changes the measure by under 20, and passes", () => {
    const red: RGB = [61, 0, 0], green: RGB = [0, 50, 0];
    const raw = (c: RGB) => (linear(c[0]) - linear(c[1]) - linear(c[2])) * 320;
    expect(raw(green)).toBeLessThan(0);
    expect(redOf(red) - redOf(green)).toBeLessThan(20);
    // Were the green's measure left below 0, the change would be over 20, to and from a saturated red.
    expect(raw(red) - raw(green)).toBeGreaterThan(20);
    expect(shareOf(red)).toBe(1);
    expect(L(green) - L(red)).toBeLessThan(0.1);
    expect(count(W, H, 90, [{ box: whole, at: flicker(4, red, green) }]).pass).toBe(true);
  });

  it("reads all three bytes of a pixel: a saturated red whose blue alone comes and goes is a red flash", () => {
    // (255, 0, 0) has the measure 320; (255, 0, 255) has 0.
    expect(redOf([255, 0, 255])).toBe(0);
    const result = count(W, H, 90, [{ box: whole, at: flicker(4, [255, 0, 0], [255, 0, 255]) }]);
    expect(result.general.mostInASecond).toBe(0);
    expect(result.red.mostInASecond).toBeGreaterThan(MOST);
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
    // Nor does pixel by pixel count the lead-in's.
    const moving = count(W, H, 150, [{ box: whole, each: (x, y, f) => (f < 60 ? stripes(x, y, f) : BLACK) }], { lead: 60 });
    expect(moving.general.perPixel.mostInASecond).toBeLessThanOrEqual(1);
  });

  it("counts a change at the lead-in's last frame for nothing and one at the window's first", () => {
    // Seven changes 10 frames apart from frame s, then still: from frame 10 on, all seven count; from 9, the first is the lead-in's.
    const seven = (s: number) => (f: number) => { const k = Math.min(7, f < s ? 0 : Math.floor((f - s) / 10) + 1); return k % 2 ? WHITE : BLACK; };
    const at10 = count(W, H, 100, [{ box: whole, at: seven(10) }], { lead: 10 });
    expect(at10.general.atOnce.worst!.transitions[0]).toEqual([0, 1]);
    expect(at10.general.atOnce.mostInASecond).toBe(7);
    expect(at10.general.perPixel.mostInASecond).toBe(7);
    const at9 = count(W, H, 100, [{ box: whole, at: seven(9) }], { lead: 10 });
    expect(at9.general.atOnce.mostInASecond).toBe(6);
    expect(at9.general.perPixel.mostInASecond).toBe(6);
    expect(at9.pass).toBe(true);
  });

  it("counts nothing under a plate: a box that flickers under the HUD passes", () => {
    const box: Paint = { box: [10, 6, 20, 18], at: flicker(4, BLACK, WHITE) };
    // A plate at 10, 6 by 20 by 18 CSS px at a pixel ratio of 1, with no pad.
    const mask = platesPixelMask([{ x: 10, y: 6, w: 20, h: 18 }], W, H, 1, 0);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(360);
    const result = count(W, H, 90, [box], { mask });
    expect(result.maskedPixels).toBe(360);
    expect(result.pass).toBe(true);
    expect(count(W, H, 90, [{ box: [10, 6, 20, 18], each: stripes }], { mask }).pass).toBe(true);
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

  it("masks what no flash shows through: a plate is opaque enough that the world under it cannot change it by either threshold", () => {
    // The plates' colour (src/app/globals.css), laid over the world as the browser lays it, byte by byte: what shows through the plate
    // from black to white, or from black to the reddest red, is the most the world can change it by.
    const css = readFileSync(join(repoRoot(), "src", "app", "globals.css"), "utf8");
    const rule = css.match(/\.plate\s*\{[^}]*background:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
    expect(rule).not.toBeNull();
    const [r, g, b, alpha] = rule!.slice(1).map(Number);
    const over = (world: RGB): RGB => [alpha * r + (1 - alpha) * world[0], alpha * g + (1 - alpha) * world[1], alpha * b + (1 - alpha) * world[2]];
    expect(L(over(WHITE)) - L(over(BLACK))).toBeLessThan(GENERAL / 5);
    expect(redOf(over([255, 0, 0])) - redOf(over(BLACK))).toBeLessThan(RED / 5);
  });
});
