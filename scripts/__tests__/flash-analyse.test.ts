import { describe, expect, it } from "vitest";
import { analyse, blockLuminance, counter, LIN, lum, mostWithin, platesMask, swingsOf, THRESHOLD } from "../flash/analyse.mjs";
import { parseJobs } from "../flash/lib.mjs";
import windows from "../flash/windows.json";

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

// The count of a run, taken both ways: kept whole (`analyse`, as every count before was made) and as its frames arrive (`counter`, as
// capture.mjs counts, which keeps a second of frames and never the run). The two must agree in everything. The run's first `lead`
// frames are its lead-in, from before the window that is counted.
const counted = (L: Uint16Array, frames: number, bw: number, bh: number, mask: Uint8Array, fps = 60, lead = 0) => {
  const whole = analyse(L, frames, bw, bh, mask, fps, lead), live = counter(bw, bh, fps, lead), n = bw * bh;
  for (let f = 0; f < frames; f++) live.add((out: Uint16Array, base: number) => out.set(L.subarray(f * n, (f + 1) * n), base));
  expect(live.result(mask)).toEqual(whole);
  return whole;
};

describe("the count of a run, kept whole and as its frames arrive", () => {
  // A frame of 3 by 2 blocks, 130 frames long: every block steady at 1000 but those a test names, which take `value(frame)`.
  const BW = 3, BH = 2, FRAMES = 130;
  const film = (blocks: Record<number, (f: number) => number>, frames = FRAMES) => {
    const L = new Uint16Array(frames * BW * BH).fill(1000);
    for (const [b, value] of Object.entries(blocks)) for (let f = 0; f < frames; f++) L[f * BW * BH + Number(b)] = value(f);
    return L;
  };
  const flash = (f: number) => (f % 2 ? TENTH : 0);
  const none = new Uint8Array(BW * BH);
  // A block's luminance as a result shows it: a share of white, to four places.
  const shown = (v: number) => Math.round((v / 65535) * 10000) / 10000;

  it("reports the block that flashes every frame as the worst, at its own place: 61 swings in a second, 60 by the strict reading", () => {
    const result = counted(film({ 4: flash }), FRAMES, BW, BH, none);
    expect(result.maxSwingsInASecond).toBe(61);
    expect(result.maxSwingsInASecondStrict).toBe(60);
    // Block 4 of a grid 3 wide is the second column of the second row, whose corner is 2 px in and 2 px down.
    expect(result.worst).toMatchObject({ bx: 1, by: 1, x: 2, y: 2, mostInASecond: 61, mostInASecondStrict: 60, runStartsAtFrame: 1, swingsInWindow: FRAMES - 1 });
    expect(result.worst!.swings.slice(0, 3)).toEqual([[1, 1], [2, -1], [3, 1]]);
    expect(result).toMatchObject({ unmaskedBlocks: 6, maskedBlocks: 0, totalSwings: FRAMES - 1 });
    expect(result.blocksAtLeast).toMatchObject({ 1: 1, 5: 1, 8: 1 });
    expect(result.top).toHaveLength(1);
    expect(result.maps.perBlock[4]).toBe(61);
  });

  it("counts nothing at a masked block: the same flash under a plate reports 0, with one block masked", () => {
    // A mask that is read and then ignored would report 61 here.
    const mask = Uint8Array.from([0, 0, 0, 0, 1, 0]);
    const result = counted(film({ 4: flash }), FRAMES, BW, BH, mask);
    expect(result.maxSwingsInASecond).toBe(0);
    expect(result.worst).toBeNull();
    expect(result.top).toEqual([]);
    expect(result).toMatchObject({ unmaskedBlocks: 5, maskedBlocks: 1, totalSwings: 0 });
    expect(result.blocksAtLeast).toMatchObject({ 1: 0 });
  });

  it("puts a block that never moves 10 % in the histogram's bin 0, and one that swings twice a second in bin 2", () => {
    // Block 0 flickers by 9 %; block 2 rises at frame 10 and falls at frame 40, once.
    const result = counted(film({ 0: (f) => (f % 2 ? 5900 : 0), 2: (f) => (f >= 10 && f < 40 ? 30000 : 1000) }), FRAMES, BW, BH, none);
    expect(result.histogramOfMostInASecond[0]).toBe(5);
    expect(result.histogramOfMostInASecond[2]).toBe(1);
    expect(result.maxSwingsInASecond).toBe(2);
    // Its range is the whole run's, in relative luminance: 29000 of 65535.
    expect(result.worst).toMatchObject({ bx: 2, by: 0, runStartsAtFrame: 10, range: 0.443 });
    expect(result.maps.range[2]).toBeCloseTo(29000 / 65535, 6);
  });

  it("ranks the blocks by their busiest second, then by the strict reading, then by their swings in the run, and lists the first twelve", () => {
    // 14 blocks in a row. Each swings at every `gap`th frame from frame 1: the tighter the gap, the more swings in a second. The
    // block at 3 swings twice only, at frames 1 and 41.
    const bw = 14, frames = 200, L = new Uint16Array(frames * bw).fill(1000);
    const gaps = [60, 3, 12, 40, 5, 20, 2, 30, 8, 150, 4, 1, 100, 61];
    gaps.forEach((gap, b) => { for (let f = 0; f < frames; f++) L[f * bw + b] = Math.floor((f + gap - 1) / gap) % 2 && (b !== 3 || f <= gap) ? 30000 : 1000; });
    const result = counted(L, frames, bw, 1, new Uint8Array(bw));
    // A gap of g frames fits floor(60 / g) + 1 swings in a second, and floor(59 / g) + 1 by the strict reading. The gaps of 40 and 60
    // both fit two, and by the strict reading 40 fits two and 60 one: so the block at 3 stands before the block at 0, though it comes
    // later and swings twice in the run to the other's four. The gaps of 61, 100 and 150 fit one by both; 61 swings four times in the
    // run and the others twice, so it is the twelfth.
    expect(result.top.map((t) => t.bx)).toEqual([11, 6, 1, 10, 4, 8, 2, 5, 7, 3, 0, 13]);
    expect(result.top.map((t) => t.mostInASecond)).toEqual([61, 31, 21, 16, 13, 8, 6, 4, 3, 2, 2, 1]);
    expect(result.top.map((t) => t.mostInASecondStrict)).toEqual([60, 30, 20, 15, 12, 8, 5, 3, 2, 2, 1, 1]);
    expect(result.top.map((t) => t.swingsInWindow).slice(9)).toEqual([2, 4, 4]);
    expect(result.worst).toEqual(result.top[0]);
    expect(result.histogramOfMostInASecond).toEqual([0, 3, 2, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 4]);
    expect(result.maxSwingsInASecondStrict).toBe(60);
    expect(result.blocksAtLeast).toEqual({ 1: 14, 2: 11, 3: 9, 4: 8, 5: 7, 6: 7, 7: 6, 8: 6 });
    // Every swing of the run: floor(198 / g) + 1 for each gap, and two for the block at 3.
    expect(result.totalSwings).toBe(199 + 100 + 67 + 50 + 40 + 25 + 17 + 10 + 7 + 2 + 4 + 4 + 2 + 2);
  });

  it("ranks the wider swing first where two blocks swing as often, in the second and in the run", () => {
    // Blocks 2 and 5 each rise at frame 1 and fall at frame 41: 2 in a second by both readings, 2 in the run. The second swings four
    // times as far, and stands first though it comes later.
    const pulse = (top: number) => (f: number) => (f >= 1 && f < 41 ? top : 1000);
    const result = counted(film({ 2: pulse(8000), 5: pulse(29000) }), FRAMES, BW, BH, none);
    expect(result.top.map((t) => [t.bx, t.by, t.mostInASecond, t.mostInASecondStrict, t.swingsInWindow, t.range])).toEqual([[2, 1, 2, 2, 2, 0.427], [2, 0, 2, 2, 2, 0.107]]);
  });

  it("shows a block's luminance through its busiest second and the frame before it: the 62 frames that end at that second's last swing", () => {
    // Block 1 swings at frames 100, 110, 150, 200 and 205. Its first second of three is 100 to 150; 150 to 205 holds three too, and
    // the first stands.
    const high = (f: number) => (f >= 100 && f < 110) || (f >= 150 && f < 200) || f >= 205;
    const result = counted(film({ 1: (f) => (high(f) ? 20000 : 1000) }, 260), 260, BW, BH, none);
    expect(result.worst).toMatchObject({ bx: 1, by: 0, mostInASecond: 3, runStartsAtFrame: 100, swingsInWindow: 5, traceFromFrame: 89 });
    expect(result.worst!.swings).toEqual([[100, 1], [110, -1], [150, 1], [200, -1], [205, 1]]);
    expect(result.worst!.trace).toEqual([...Array(11).fill(shown(1000)), ...Array(10).fill(shown(20000)), ...Array(40).fill(shown(1000)), shown(20000)]);
  });

  it("shows the run from its first frame where the busiest second ends within the run's first 62", () => {
    const result = counted(film({ 3: (f) => (f === 2 || f === 4 ? 20000 : 1000) }, 70), 70, BW, BH, none);
    expect(result.worst).toMatchObject({ bx: 0, by: 1, mostInASecond: 4, runStartsAtFrame: 2, traceFromFrame: 0 });
    expect(result.worst!.trace).toEqual([1000, 1000, 20000, 1000, 20000, 1000].map(shown));
  });

  it("counts a second by the frames a second it is told, and shows that many frames and two more", () => {
    // At 10 frames a second, swings at frames 5, 15 and 16. By the cautious reading 5 and 15 are two in a second, and 15 and 16 two
    // more: the first stands. By the strict reading, 9 frames apart, only 15 and 16 are.
    const result = counted(film({ 0: (f) => ((f >= 5 && f < 15) || f >= 16 ? 20000 : 1000) }, 40), 40, BW, BH, none, 10);
    expect(result.worst).toMatchObject({ mostInASecond: 2, mostInASecondStrict: 2, runStartsAtFrame: 5, traceFromFrame: 4 });
    expect(result.worst!.trace).toHaveLength(12);
  });
});

describe("a window's lead-in", () => {
  // One block. Its luminance in shares of white, frame after frame.
  const run = (values: number[]) => Uint16Array.from(values, (v) => Math.round(v * 65535));
  const one = new Uint8Array(1);

  it("counts the swing that began before the window: a fall from a peak the window never saw", () => {
    // The block stood at 0.20, peaked at 0.35 and is on its way down as the window opens at 0.26: then 0.20 and 0.30. By the
    // definition the 0.20 is a swing, 0.15 under the peak, and the 0.30 another. A count that knows nothing before the window takes
    // 0.26 for where the block started, and finds the one rise.
    const without = counted(run([0.26, 0.2, 0.3]), 3, 1, 1, one);
    expect(without.totalSwings).toBe(1);
    expect(without.worst!.swings).toEqual([[2, 1]]);
    const withIt = counted(run([0.2, 0.35, 0.26, 0.2, 0.3]), 5, 1, 1, one, 60, 2);
    expect(withIt.totalSwings).toBe(2);
    expect(withIt.worst).toMatchObject({ mostInASecond: 2, runStartsAtFrame: 1, swingsInWindow: 2 });
    // The window's first frame is frame 0: the fall lands on frame 1 and the rise on frame 2.
    expect(withIt.worst!.swings).toEqual([[1, -1], [2, 1]]);
  });

  it("counts no swing of the lead-in itself, and a swing that lands on the window's first frame", () => {
    // Up and down twice in the lead-in, then still: nothing in the window.
    expect(counted(run([0.1, 0.3, 0.1, 0.3, 0.1, 0.1, 0.1]), 7, 1, 1, one, 60, 5).totalSwings).toBe(0);
    // The lead-in ends low, and the window opens a tenth higher: a swing at frame 0, which no window without a lead-in can have.
    const first = counted(run([0.3, 0.1, 0.1, 0.25, 0.25]), 5, 1, 1, one, 60, 3);
    expect(first.worst!.swings).toEqual([[0, 1]]);
    expect(first.worst).toMatchObject({ runStartsAtFrame: 0, traceFromFrame: -3 });
  });

  it("measures a block's range in the window alone, and counts a block that swings there while moving less than a tenth in it", () => {
    // A peak of 0.40 in the lead-in; the window holds 0.31, 0.29, 0.31: a range of 0.02, and the 0.29 is a swing, 0.11 under the peak.
    const result = counted(run([0.2, 0.4, 0.31, 0.29, 0.31]), 5, 1, 1, one, 60, 2);
    expect(result.worst).toMatchObject({ mostInASecond: 1, runStartsAtFrame: 1, range: 0.02 });
    expect(result.histogramOfMostInASecond.slice(0, 2)).toEqual([0, 1]);
    expect(result.maps.range[0]).toBeCloseTo(0.02, 4);
  });

  it("shows the lead-in's frames before the window's in a block's trace, numbered back from frame 0", () => {
    const values = [0.2, 0.35, 0.26, 0.2, 0.3];
    const result = counted(run(values), 5, 1, 1, one, 60, 2);
    expect(result.worst).toMatchObject({ traceFromFrame: -2 });
    expect(result.worst!.trace).toEqual(values);
  });
});

describe("the count as the frames arrive", () => {
  // The same numbers on every run: a linear congruential generator.
  const random = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const clamp = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));
  // Series that try the count: what each block does through a run of `frames`, by its kind.
  const KINDS: ((rnd: () => number, frames: number) => (f: number) => number)[] = [
    // Steady.
    (rnd) => { const v = clamp(rnd() * 65535); return () => v; },
    // A walk of small steps, and one of steps near the threshold.
    (rnd) => { let v = rnd() * 65535; return () => (v = clamp(v + (rnd() - 0.5) * 1500)); },
    (rnd) => { let v = rnd() * 65535; return () => (v = clamp(v + (rnd() - 0.5) * 16000)); },
    // A square wave of exactly 10 %, at a period of 1 to 40 frames, and one a 65535th short of it, which never swings.
    (rnd) => { const base = clamp(rnd() * 50000), period = 1 + Math.floor(rnd() * 40); return (f) => base + (Math.floor(f / period) % 2 ? TENTH : 0); },
    (rnd) => { const base = clamp(rnd() * 50000), period = 1 + Math.floor(rnd() * 40); return (f) => base + (Math.floor(f / period) % 2 ? TENTH - 1 : 0); },
    // A flash every frame through a stretch of the run, quiet before it and after: the stretch may open the run or close it.
    (rnd, frames) => { const from = Math.floor(rnd() * frames * 0.8), to = from + 1 + Math.floor(rnd() * 150); return (f) => (f >= from && f < to && f % 2 ? 40000 : 20000); },
    // Swings exactly 60 frames apart, and 61: either side of a second's edge.
    (rnd) => { const gap = rnd() < 0.5 ? 60 : 61, off = Math.floor(rnd() * 30); return (f) => (Math.floor((f + off) / gap) % 2 ? 30000 : 10000); },
    // A slow rise and fall, a tenth in 5 to 80 frames.
    (rnd) => { const slope = TENTH / (5 + rnd() * 75), half = 30 + Math.floor(rnd() * 120); return (f) => clamp(10000 + slope * (half - Math.abs((f % (2 * half)) - half))); },
    // Noise over the whole range, and noise that straddles the threshold about a level.
    (rnd) => () => clamp(rnd() * 65535),
    (rnd) => { const base = 20000 + clamp(rnd() * 20000); return () => clamp(base + (rnd() < 0.5 ? -1 : 1) * (TENTH / 2 + Math.floor(rnd() * 5) - 2)); },
    // Two bursts of the same count, a while apart: the first is the busiest second, and its frames are the ones shown.
    (rnd, frames) => { const a = 5 + Math.floor(rnd() * 60), b = a + 100 + Math.floor(rnd() * (frames - a - 130)), n = 2 + Math.floor(rnd() * 8); return (f) => ((f >= a && f < a + n) || (f >= b && f < b + n) ? (f % 2 ? 50000 : 5000) : 5000); },
    // Bursts that grow: each has one swing more than the last, so the frames kept are replaced time after time.
    () => (f) => (f % 70 < 2 + 2 * Math.floor(f / 70) && f % 2 ? 60000 : 30000),
    // Black to white and back at the range's ends, at any period.
    (rnd) => { const period = 1 + Math.floor(rnd() * 90); return (f) => (Math.floor(f / period) % 2 ? 65535 : 0); },
    // A swing in the run's first frames, and one in its last.
    (rnd, frames) => { const late = rnd() < 0.5; return (f) => ((late ? f >= frames - 1 - Math.floor(rnd() * 2) : f === 1) ? 40000 : 10000); },
  ];
  const series = (seed: number, bw: number, bh: number, frames: number) => {
    const n = bw * bh, L = new Uint16Array(frames * n), rnd = random(seed);
    for (let b = 0; b < n; b++) {
      const value = KINDS[Math.floor(rnd() * KINDS.length)](rnd, frames);
      for (let f = 0; f < frames; f++) L[f * n + b] = value(f);
    }
    return { L, mask: Uint8Array.from({ length: n }, () => (rnd() < 0.1 ? 1 : 0)) };
  };

  it.each([[1, 0], [2, 0], [3, 60], [4, 60], [5, 7], [6, 130]])("equals the count of the run kept whole, on 480 blocks through 7 s of every kind of series (seed %i, a lead-in of %i frames)", (seed, lead) => {
    const bw = 24, bh = 20, frames = 420 + lead, { L, mask } = series(seed, bw, bh, frames);
    const result = counted(L, frames, bw, bh, mask, 60, lead);
    // The series do swing: the test would hold of a counter that counted nothing on a run that held nothing.
    expect(result.maxSwingsInASecond).toBe(61);
    expect((result.blocksAtLeast as Record<number, number>)[1]).toBeGreaterThan(200);
    expect(result.top).toHaveLength(12);
    expect(result.maskedBlocks).toBeGreaterThan(20);
  });

  it("equals it on a run shorter than the second of frames it keeps, on one of a single frame, at another frame rate, and on a window of one frame after its lead-in", () => {
    for (const [frames, fps, lead] of [[1, 60, 0], [2, 60, 0], [40, 60, 0], [62, 60, 0], [63, 60, 0], [300, 24, 0], [300, 7, 0], [2, 60, 1], [61, 60, 60], [64, 60, 60], [300, 24, 24], [91, 60, 90]]) {
      const { L, mask } = series(9 + frames + fps + lead, 16, 10, frames);
      counted(L, frames, 16, 10, mask, fps, lead);
    }
  });

  it("takes a run of 100 s a frame at a time, and counts it as it would a short one", () => {
    // 3 blocks through 6000 frames, each handed over and gone: the count keeps the last 62 of them, and each block's swings.
    const live = counter(3, 1), frames = 6000;
    for (let f = 0; f < frames; f++) live.add((out: Uint16Array, base: number) => out.set([1000, f % 600 < 20 && f % 2 ? 30000 : 1000, 5 * f], base));
    const result = live.result(new Uint8Array(3));
    // Block 1 flashes through the first 20 frames of every 10 s: 20 swings in a second, first from frame 1 to frame 20.
    expect(result.worst).toMatchObject({ bx: 1, mostInASecond: 20, runStartsAtFrame: 1, swingsInWindow: 200, traceFromFrame: 0 });
    expect(result.worst!.trace).toHaveLength(21);
    // Block 2 rises by 5 a frame, a tenth every 1311 frames: one swing, and a range of 29995.
    expect(result.top[1]).toMatchObject({ bx: 2, mostInASecond: 1, runStartsAtFrame: 1311, traceFromFrame: 1250, range: 0.458 });
    expect(result.top[1].trace).toHaveLength(62);
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

  // The swings a grid counts when the pixels of `lit` flash once, at byte 100, the grid standing `ox` px right and `oy` px down.
  const flashed = (lit: number[][], ox: number, oy: number) => {
    const frames = [frame([], 0), frame(lit, 100), frame([], 0)];
    const bw = Math.floor((W - ox) / 2), bh = Math.floor((W - oy) / 2), L = new Uint16Array(frames.length * bw * bh);
    frames.forEach((rgba, f) => blockLuminance(rgba, W, bw, bh, ox, oy, L, f * bw * bh));
    return counted(L, frames.length, bw, bh, new Uint8Array(bw * bh)).totalSwings;
  };

  it("counts a 2x2 flash that straddles the even grid's lines only on the grid moved by (1, 1)", () => {
    // Byte 100 is 12.7 % in relative luminance: a swing where a block holds all four pixels, a quarter of one where it holds one.
    expect(lum(100, 100, 100)).toBeGreaterThan(0.12);
    expect(flashed(MIDDLE, 0, 0)).toBe(0);
    expect(flashed(MIDDLE, 1, 1)).toBe(2);
    // Moved one way only, a block holds two of the four pixels: half of 12.7 %, no swing.
    expect(flashed(MIDDLE, 1, 0)).toBe(0);
    expect(flashed(MIDDLE, 0, 1)).toBe(0);
  });

  it("counts a 2x2 flash, wherever it lies against the grids' lines, on exactly one of the grids a job counts when its line names none", () => {
    const grids = parseJobs("branch Q", windows["2026-10-20"].windows)[0].grids;
    // The four ways a 2x2 square can lie: its corner on an even or an odd pixel, across and down.
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const square = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      // Whole on the grid that stands where the square does, and a half or a quarter on each of the others: under 10 % there.
      expect(grids.map(([ox, oy]) => [ox, oy, flashed(square, ox, oy)]).filter(([, , n]) => n > 0)).toEqual([[x, y, 2]]);
    }
    // The even grid and the one moved by (1, 1), which is what a job counted before, see neither of the squares that straddle one way.
    for (const [ox, oy] of [[0, 0], [1, 1]]) for (const [x, y] of [[1, 0], [0, 1]]) expect(flashed([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], ox, oy)).toBe(0);
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
    const mask = platesMask([{ x: 6, y: 8, w: 4, h: 2 }], 10, 10, 1);
    expect(marked(mask)).toEqual(span(2, 5, 3, 5));
  });

  it("measures a plate in device pixels: half the box at twice the pixel ratio masks the same blocks", () => {
    expect(marked(platesMask([{ x: 3, y: 4, w: 2, h: 1 }], 10, 10, 2))).toEqual(span(2, 5, 3, 5));
  });

  it("takes in the pixels a box's fractional edge touches", () => {
    // From 6.5 to 10.5 px across: px 6 to 10, and with the pad 4 to 12, so one block further right.
    expect(marked(platesMask([{ x: 6.5, y: 8, w: 4, h: 2 }], 10, 10, 1))).toEqual(span(2, 6, 3, 5));
    // A left edge at 7.6 px is in px 7, and the pad reaches px 5, in block 2; rounded up to px 8 it would start a block late. And a
    // top edge at 9.7 px is in px 9, the pad reaching px 7, in block 3.
    expect(marked(platesMask([{ x: 7.6, y: 9.7, w: 2, h: 0.2 }], 10, 10, 1))).toEqual(span(2, 5, 3, 5));
    // A right edge at 10.4 px is in px 10, and the pad reaches px 12, in block 6; rounded down to px 10 it would end a block early.
    // And a bottom edge at 10.2 px is in px 10, the pad reaching px 12, in block 6.
    expect(marked(platesMask([{ x: 8, y: 8, w: 2.4, h: 2.2 }], 10, 10, 1))).toEqual(span(3, 6, 3, 6));
  });

  it("masks by the pad it is given, and keeps to the frame at its edges", () => {
    expect(marked(platesMask([{ x: 6, y: 8, w: 4, h: 2 }], 10, 10, 1, 0))).toEqual(span(3, 4, 4, 4));
    expect(marked(platesMask([{ x: 0, y: 0, w: 1, h: 1 }, { x: 19, y: 19, w: 5, h: 5 }], 10, 10, 1))).toEqual([...span(0, 1, 0, 1), ...span(8, 9, 8, 9)]);
    expect(marked(platesMask([], 10, 10, 1))).toEqual([]);
  });
});
