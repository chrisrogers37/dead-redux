import { describe, expect, it } from "vitest";
import { analyse, blockLuminance, LIN, lum, mostWithin, platesMask, swingsOf, THRESHOLD } from "../flash/analyse.mjs";

// The flash counter's arithmetic. A block's luminance is a uint16, relative luminance times 65535, so the bar's 10 % is 6553.5: a
// change of 6554 is a swing and one of 6553 is not.
const TENTH = 6554;

// One block's luminance, frame after frame.
const one = (values: number[]) => Uint16Array.from(values);
// The swings of that block, as [frame, direction] pairs.
const swings = (values: number[]) => {
  const flat = swingsOf(one(values), values.length, 1, 0), pairs: number[][] = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return pairs;
};

describe("swingsOf", () => {
  it("counts a swing at every frame of a block that flashes by 10 %, up and down in turn", () => {
    // A counter that lost the alternation would count the rises only, or count a turn twice.
    expect(swings([0, TENTH, 0, TENTH, 0, TENTH])).toEqual([[1, 1], [2, -1], [3, 1], [4, -1], [5, 1]]);
    expect(swings([TENTH, 0, TENTH, 0])).toEqual([[1, -1], [2, 1], [3, -1]]);
  });

  it("counts nothing under 10 %: a flash of 9.9 % is no swing, nor one a 65535th short of 10 %", () => {
    expect(THRESHOLD).toBe(0.1);
    expect(swings([0, 6488, 0, 6488, 0, 6488])).toEqual([]);
    expect(swings([0, TENTH - 1, 0, TENTH - 1, 0])).toEqual([]);
    expect(swings([20000, 20000 + TENTH - 1, 20000])).toEqual([]);
  });

  it("counts a steady rise once, at the frame it first stands 10 % over where it began", () => {
    // 0 to 20000 by 1000 a frame: frame 7 is the first at 6554 or over, and a rise that goes on is the same swing.
    expect(swings(Array.from({ length: 21 }, (_, f) => f * 1000))).toEqual([[7, 1]]);
  });

  it("measures a swing from the last turning point, not from the last frame: a slow fall after a rise counts once it is 10 % under the top", () => {
    // Up to 30000, then down 3000 a frame: the fall is a swing at the third frame of it, the first that is 6554 under the top.
    expect(swings([0, 30000, 27000, 24000, 21000, 18000])).toEqual([[1, 1], [4, -1]]);
  });

  it("reads its own block out of a frame of several", () => {
    // Two blocks a frame: the first steady, the second flashing.
    const L = Uint16Array.from([100, 0, 100, TENTH, 100, 0]);
    expect(swingsOf(L, 3, 2, 0)).toEqual([]);
    expect(swingsOf(L, 3, 2, 1)).toEqual([1, 1, 2, -1]);
  });
});

describe("mostWithin", () => {
  // Swings at these frames, each up or down in turn.
  const at = (...frames: number[]) => frames.flatMap((f, k) => [f, k % 2 ? -1 : 1]);

  it("counts two swings 60 frames apart as within a second, and two 61 apart as not", () => {
    expect(mostWithin(at(0, 60), 60).best).toBe(2);
    expect(mostWithin(at(0, 61), 60).best).toBe(1);
    // The strict reading, a second's 60 frames, is a span of 59.
    expect(mostWithin(at(0, 59), 59).best).toBe(2);
    expect(mostWithin(at(0, 60), 59).best).toBe(1);
  });

  it("finds the busiest second, and says the frame its run starts at", () => {
    expect(mostWithin(at(5, 10, 100, 120, 130, 161, 400), 60)).toEqual({ best: 3, at: 100 });
    expect(mostWithin(at(5, 10, 100, 120, 130, 160, 400), 60)).toEqual({ best: 4, at: 100 });
  });

  it("finds nothing where nothing swings", () => {
    expect(mostWithin([], 60)).toEqual({ best: 0, at: -1 });
  });
});

describe("analyse", () => {
  // A frame of 3 by 2 blocks, 130 frames long: every block steady at 1000 but those a test names, which take `value(frame)`.
  const BW = 3, BH = 2, FRAMES = 130;
  const film = (blocks: Record<number, (f: number) => number>) => {
    const L = new Uint16Array(FRAMES * BW * BH).fill(1000);
    for (const [b, value] of Object.entries(blocks)) for (let f = 0; f < FRAMES; f++) L[f * BW * BH + Number(b)] = value(f);
    return L;
  };
  const flash = (f: number) => (f % 2 ? TENTH : 0);
  const none = new Uint8Array(BW * BH);

  it("reports the block that flashes every frame as the worst, at its own place: 61 swings in a second, 60 by the strict reading", () => {
    const result = analyse(film({ 4: flash }), FRAMES, BW, BH, none);
    expect(result.maxSwingsInASecond).toBe(61);
    expect(result.maxSwingsInASecondStrict).toBe(60);
    // Block 4 of a grid 3 wide is the second column of the second row, whose corner is 2 px in and 2 px down.
    expect(result.worst).toMatchObject({ bx: 1, by: 1, x: 2, y: 2, mostInASecond: 61, runStartsAtFrame: 1, swingsInWindow: FRAMES - 1 });
    expect(result.worst!.trace.slice(0, 3)).toEqual([0, 0.1, 0]);
    expect(result).toMatchObject({ unmaskedBlocks: 6, maskedBlocks: 0, blocksWithAnySwing: 1, totalSwings: FRAMES - 1 });
    expect((result.blocksAtLeast as Record<number, number>)[5]).toBe(1);
    expect(result.maps.perBlock[4]).toBe(61);
  });

  it("counts nothing at a masked block: the same flash under a plate reports 0, with one block masked", () => {
    // A mask that is read and then ignored would report 61 here.
    const mask = Uint8Array.from([0, 0, 0, 0, 1, 0]);
    const result = analyse(film({ 4: flash }), FRAMES, BW, BH, mask);
    expect(result.maxSwingsInASecond).toBe(0);
    expect(result.worst).toBeNull();
    expect(result).toMatchObject({ unmaskedBlocks: 5, maskedBlocks: 1, blocksWithAnySwing: 0, totalSwings: 0 });
  });

  it("puts a block that never moves 10 % in the histogram's bin 0, and one that swings twice a second in bin 2", () => {
    // Block 0 flickers by 9 %; block 2 rises at frame 10 and falls at frame 40, once.
    const result = analyse(film({ 0: (f) => (f % 2 ? 5900 : 0), 2: (f) => (f >= 10 && f < 40 ? 30000 : 1000) }), FRAMES, BW, BH, none);
    expect(result.histogramOfMostInASecond[0]).toBe(5);
    expect(result.histogramOfMostInASecond[2]).toBe(1);
    expect(result.maxSwingsInASecond).toBe(2);
    expect(result.worst).toMatchObject({ bx: 2, by: 0, runStartsAtFrame: 10 });
    // The widest range is that block's too, in relative luminance.
    expect(result.largestRange).toMatchObject({ bx: 2, by: 0, range: 0.443 });
  });
});

describe("lum", () => {
  it("is 0 for black and 1 for white, and weighs red at 0.2126", () => {
    expect(lum(0, 0, 0)).toBe(0);
    expect(lum(255, 255, 255)).toBeCloseTo(1, 12);
    expect(lum(255, 0, 0)).toBeCloseTo(0.2126, 12);
    expect(lum(0, 255, 0)).toBeCloseTo(0.7152, 12);
    expect(lum(0, 0, 255)).toBeCloseTo(0.0722, 12);
  });

  it("reads a byte as sRGB: mid grey, byte 128, is 0.2159 in linear light, not a half", () => {
    expect(Math.abs(LIN[128] - 0.2159)).toBeLessThan(1e-4);
    // Under the curve's knee a byte is a straight share of 12.92.
    expect(LIN[10]).toBeCloseTo(10 / 255 / 12.92, 12);
  });
});

describe("blockLuminance", () => {
  // A frame of 4 by 4 pixels, black but for the pixels a test lights with `grey`.
  const W = 4;
  const frame = (lit: number[][], grey: number) => {
    const rgba = new Uint8Array(W * W * 4);
    for (let p = 0; p < W * W; p++) rgba[p * 4 + 3] = 255;
    for (const [x, y] of lit) rgba.fill(grey, (y * W + x) * 4, (y * W + x) * 4 + 3);
    return rgba;
  };
  // The frame's four middle pixels: a 2x2 square that straddles the even grid's lines.
  const MIDDLE = [[1, 1], [2, 1], [1, 2], [2, 2]];

  it("writes each 2x2 block's mean relative luminance as a uint16: white is 65535, and one white pixel of four is a quarter", () => {
    const out = new Uint16Array(8);
    blockLuminance(frame([[0, 0], [1, 0], [0, 1], [1, 1], [3, 3]], 255), W, 2, 2, 0, 0, out, 4);
    // From `base` on, row after row: the first block all white, the last a quarter white.
    expect([...out]).toEqual([0, 0, 0, 0, 65535, 0, 0, 16384]);
  });

  it("counts a 2x2 flash that straddles the even grid's lines only on the grid moved by (1, 1)", () => {
    // Byte 100 is 12.7 % in relative luminance: a swing where a block holds all four pixels, a quarter of one where it holds one.
    expect(lum(100, 100, 100)).toBeGreaterThan(0.12);
    const frames = [frame([], 0), frame(MIDDLE, 100), frame([], 0)];
    const counted = (ox: number, oy: number) => {
      const bw = Math.floor((W - ox) / 2), bh = Math.floor((W - oy) / 2), L = new Uint16Array(frames.length * bw * bh);
      frames.forEach((rgba, f) => blockLuminance(rgba, W, bw, bh, ox, oy, L, f * bw * bh));
      return analyse(L, frames.length, bw, bh, new Uint8Array(bw * bh)).totalSwings;
    };
    expect(counted(0, 0)).toBe(0);
    expect(counted(1, 1)).toBe(2);
    // Moved one way only, a block holds two of the four pixels: half of 12.7 %, no swing.
    expect(counted(1, 0)).toBe(0);
    expect(counted(0, 1)).toBe(0);
  });

  it("sums the luminance of the blocks a mask leaves, and of them all without one", () => {
    const rgba = frame([[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 2], [2, 3], [3, 3]], 255);
    const out = new Uint16Array(4);
    const all = blockLuminance(rgba, W, 2, 2, 0, 0, out, 0);
    expect(all.count).toBe(4);
    expect(all.sum).toBeCloseTo(2, 12);
    const masked = blockLuminance(rgba, W, 2, 2, 0, 0, out, 0, Uint8Array.from([1, 0, 0, 0]));
    expect(masked.count).toBe(3);
    expect(masked.sum).toBeCloseTo(1, 12);
    // A masked block's luminance is written all the same: the mask is applied when the swings are counted.
    expect([...out]).toEqual([65535, 0, 0, 65535]);
  });
});

describe("platesMask", () => {
  // A grid of 10 by 10 blocks, a frame of 20 by 20 device px. The blocks a mask marks, as "x,y".
  const marked = (mask: Uint8Array, bw = 10) => [...mask].flatMap((m, b) => (m ? [`${b % bw},${Math.floor(b / bw)}`] : []));
  const span = (x0: number, x1: number, y0: number, y1: number) => {
    const out: string[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(`${x},${y}`);
    return out;
  };

  it("masks the blocks within 2 px of a plate's box, and no others", () => {
    // The plate covers px 6 to 9 across and 8 to 9 down; with 2 px all round, 4 to 11 and 6 to 11: blocks 2 to 5 and 3 to 5.
    const mask = platesMask([{ x: 6, y: 8, w: 4, h: 2, drawn: true }], 10, 10, 1);
    expect(marked(mask)).toEqual(span(2, 5, 3, 5));
  });

  it("measures a plate in device pixels: half the box at twice the pixel ratio masks the same blocks", () => {
    expect(marked(platesMask([{ x: 3, y: 4, w: 2, h: 1, drawn: true }], 10, 10, 2))).toEqual(span(2, 5, 3, 5));
  });

  it("takes in the pixels a box's fractional edge touches", () => {
    // From 6.5 to 10.5 px across: px 6 to 10, and with the pad 4 to 12, so one block further right.
    expect(marked(platesMask([{ x: 6.5, y: 8, w: 4, h: 2, drawn: true }], 10, 10, 1))).toEqual(span(2, 6, 3, 5));
  });

  it("masks by the pad it is given, keeps to the frame at its edges, and leaves out a plate that is not drawn", () => {
    expect(marked(platesMask([{ x: 6, y: 8, w: 4, h: 2, drawn: true }], 10, 10, 1, 0))).toEqual(span(3, 4, 4, 4));
    expect(marked(platesMask([{ x: 0, y: 0, w: 1, h: 1, drawn: true }, { x: 19, y: 19, w: 5, h: 5, drawn: true }], 10, 10, 1))).toEqual([...span(0, 1, 0, 1), ...span(8, 9, 8, 9)]);
    expect(marked(platesMask([{ x: 6, y: 8, w: 4, h: 2, drawn: false }], 10, 10, 1))).toEqual([]);
  });
});
