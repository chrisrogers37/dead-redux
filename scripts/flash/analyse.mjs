// Counts swings in relative luminance per 2x2 block of device pixels. A block's luminance is a uint16, relative luminance x 65535.
// A swing is a change of at least THRESHOLD from the block's last turning point, each swing opposite in direction to the one before.
//
// capture.mjs counts as the frames arrive (`counter`): it keeps each block's state and its swings, and a second of frames, never the
// run. `analyse` counts a run that is kept whole, as every count before was made; it is the reference the counter is held to
// (scripts/__tests__/flash-analyse.test.ts), and no script calls it.
//
// A run may open with a lead-in: `lead` frames from before the window that is counted. They set each block's state, so that a swing
// which began before the window and ends in it is counted, and they count for nothing else. The window's first frame is frame 0, and
// a lead-in's frames are numbered back from it, -1 the last.

export const THRESHOLD = 0.1;
const T16 = THRESHOLD * 65535;

// The frames of the window at which a block swings, as [frame, direction] pairs flattened. `L` is nFrames x nBlocks, frame after
// frame, its first `lead` frames the lead-in.
export function swingsOf(L, nFrames, nBlocks, b, lead = 0) {
  const out = [];
  let lo = L[b], hi = L[b], ext = 0, dir = 0;
  for (let i = 1; i < nFrames; i++) {
    const v = L[i * nBlocks + b];
    let d = 0;
    if (dir === 0) {
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      if (v - lo >= T16) d = 1;
      else if (hi - v >= T16) d = -1;
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= T16) d = -1;
    } else if (v < ext) ext = v;
    else if (v - ext >= T16) d = 1;
    if (d === 0) continue;
    dir = d; ext = v;
    if (i >= lead) out.push(i - lead, d);
  }
  return out;
}

// The most swings within `span` frames of each other (first to last, inclusive), and the first frame of that run.
export function mostWithin(swings, span) {
  let best = 0, at = -1;
  for (let i = 0, j = 0; i < swings.length; i += 2) {
    while (swings[i] - swings[j] > span) j += 2;
    const n = (i - j) / 2 + 1;
    if (n > best) { best = n; at = swings[j]; }
  }
  return { best, at };
}

// How many frames of a block's luminance a result shows: its busiest second and the frame before it.
const traceFrames = (fps) => fps + 2;
const shown = (v) => Math.round((v / 65535) * 10000) / 10000;

// What a run's blocks come to. `lo` and `hi` hold each block's least and greatest luminance in the window, `swings(b)` gives a
// block's swings as swingsOf does, and `trace(b, last)` its luminance through the frames that end at frame `last`, traceFrames of
// them or as many as the run has by then, its lead-in with it. `mask` marks the blocks that are not counted.
function summarise(bw, bh, mask, fps, lead, lo, hi, swings, trace) {
  const nBlocks = bw * bh;
  // A second holds fps frame intervals: swings whose frames are at most fps apart (inclusive, the cautious reading), and at most fps - 1
  // apart (a second's fps frames, the strict one).
  const perBlock = new Uint8Array(nBlocks), range = new Float32Array(nBlocks);
  const hist = new Array(16).fill(0);
  let unmasked = 0, totalSwings = 0;
  const ranked = [];
  for (let b = 0; b < nBlocks; b++) {
    if (mask[b]) continue;
    unmasked += 1;
    range[b] = (hi[b] - lo[b]) / 65535;
    // A block may swing in a window through which it moves less than a tenth: where its last turn was in the lead-in.
    const s = swings(b), n = s.length / 2;
    if (n === 0) { hist[0] += 1; continue; }
    totalSwings += n;
    const inc = mostWithin(s, fps), strict = mostWithin(s, fps - 1);
    perBlock[b] = inc.best;
    hist[Math.min(15, inc.best)] += 1;
    if (inc.best > 0) ranked.push({ b, s, most: inc.best, strict: strict.best, at: inc.at, total: n, range: range[b] });
  }
  ranked.sort((p, q) => q.most - p.most || q.strict - p.strict || q.total - p.total || q.range - p.range);
  const atLeast = {};
  for (let k = 1; k <= 8; k++) atLeast[k] = ranked.filter((r) => r.most >= k).length;
  const describe = (r) => {
    // The last swing of the block's busiest second: the run starts with the swing at frame `at` and holds `most` of them.
    let first = 0;
    while (r.s[first] !== r.at) first += 2;
    const last = r.s[first + 2 * (r.most - 1)], pairs = [];
    for (let i = 0; i < r.s.length; i += 2) pairs.push([r.s[i], r.s[i + 1]]);
    return {
      bx: r.b % bw, by: Math.floor(r.b / bw), x: (r.b % bw) * 2, y: Math.floor(r.b / bw) * 2,
      mostInASecond: r.most, mostInASecondStrict: r.strict, runStartsAtFrame: r.at, swingsInWindow: r.total, range: Math.round(r.range * 1000) / 1000,
      swings: pairs, traceFromFrame: Math.max(0, last + lead - traceFrames(fps) + 1) - lead, trace: trace(r.b, last),
    };
  };
  const top = ranked.slice(0, 12).map(describe);
  return {
    unmaskedBlocks: unmasked, maskedBlocks: nBlocks - unmasked,
    maxSwingsInASecond: ranked.length ? ranked[0].most : 0,
    maxSwingsInASecondStrict: ranked.reduce((m, r) => Math.max(m, r.strict), 0),
    blocksAtLeast: atLeast, totalSwings,
    histogramOfMostInASecond: hist,
    worst: top[0] ?? null, top,
    maps: { perBlock, range },
  };
}

// The count of a run kept whole: `L` is nFrames x nBlocks of uint16, frame after frame, its first `lead` frames the lead-in. The
// reference for `counter`.
export function analyse(L, nFrames, bw, bh, mask, fps = 60, lead = 0) {
  const nBlocks = bw * bh, lo = new Uint16Array(nBlocks).fill(65535), hi = new Uint16Array(nBlocks);
  for (let i = lead; i < nFrames; i++) {
    for (let b = 0; b < nBlocks; b++) { const v = L[i * nBlocks + b]; if (v < lo[b]) lo[b] = v; if (v > hi[b]) hi[b] = v; }
  }
  const trace = (b, last) => {
    const out = [];
    for (let i = Math.max(0, last + lead - traceFrames(fps) + 1); i <= last + lead; i++) out.push(shown(L[i * nBlocks + b]));
    return out;
  };
  return summarise(bw, bh, mask, fps, lead, lo, hi, (b) => swingsOf(L, nFrames, nBlocks, b, lead), trace);
}

// The count as the frames arrive. `add(write)` takes the next frame in: `write(out, base)` writes its blocks' luminance into `out`
// from `base` on. The first `lead` frames are the lead-in. `result(mask)` is what `analyse` gives for the same frames.
// It holds, for each block, where its last turn left it, its least and greatest luminance in the window, and its swings, so it grows
// with the swings of a run and not with its frames; and the last traceFrames of the run, from which a block's frames are kept each
// time a second ends with more swings than any second of that block before it, so that at the end each block has the frames of its
// busiest second.
export function counter(bw, bh, fps = 60, lead = 0) {
  const nBlocks = bw * bh, span = traceFrames(fps);
  const ring = new Uint16Array(span * nBlocks), kept = new Uint16Array(span * nBlocks);
  // A block's turning: until its first swing it is measured from its least and greatest so far (`low`, `high`), the lead-in's with
  // them; after it, from where its last turn left it (`ext`), in the direction `dir`.
  const low = new Uint16Array(nBlocks), high = new Uint16Array(nBlocks), ext = new Uint16Array(nBlocks), dir = new Int8Array(nBlocks);
  // Its least and greatest in the window alone, for its range.
  const lo = new Uint16Array(nBlocks), hi = new Uint16Array(nBlocks);
  const most = new Uint8Array(nBlocks), keptAt = new Int32Array(nBlocks).fill(-1);
  const lists = new Array(nBlocks);
  let frames = 0;
  // A swing of block b at the window's frame f. The second that ends here holds the swings at most fps frames before it, as mostWithin
  // counts them.
  function swing(b, f, d) {
    const s = (lists[b] ??= []);
    s.push(f, d);
    let first = s.length - 2;
    while (first >= 2 && f - s[first - 2] <= fps) first -= 2;
    const n = (s.length - first) / 2;
    if (n <= most[b]) return;
    most[b] = n;
    keptAt[b] = f;
    // The ring holds the run's frame i, the window's frame i - lead, at i % span.
    for (let i = Math.max(0, f + lead - span + 1); i <= f + lead; i++) kept[b * span + (i % span)] = ring[(i % span) * nBlocks + b];
  }
  return {
    add(write) {
      const i = frames++, base = (i % span) * nBlocks;
      write(ring, base);
      if (i === lead) { lo.set(ring.subarray(base, base + nBlocks)); hi.set(lo); }
      if (i === 0) { low.set(ring.subarray(base, base + nBlocks)); high.set(low); return; }
      for (let b = 0; b < nBlocks; b++) {
        const v = ring[base + b];
        if (i > lead) { if (v > hi[b]) hi[b] = v; if (v < lo[b]) lo[b] = v; }
        let d = 0;
        if (dir[b] === 0) {
          if (v > high[b]) high[b] = v;
          if (v < low[b]) low[b] = v;
          if (v - low[b] >= T16) d = 1;
          else if (high[b] - v >= T16) d = -1;
        } else if (dir[b] === 1) {
          if (v > ext[b]) ext[b] = v;
          else if (ext[b] - v >= T16) d = -1;
        } else if (v < ext[b]) ext[b] = v;
        else if (v - ext[b] >= T16) d = 1;
        if (d === 0) continue;
        dir[b] = d; ext[b] = v;
        // A turn in the lead-in sets the block's state and is no swing of the window.
        if (i >= lead) swing(b, i - lead, d);
      }
    },
    result(mask) {
      const trace = (b, last) => {
        if (keptAt[b] !== last) throw new Error(`block ${b}: the frames kept end at frame ${keptAt[b]}, and its busiest second at ${last}`);
        const out = [];
        for (let i = Math.max(0, last + lead - span + 1); i <= last + lead; i++) out.push(shown(kept[b * span + (i % span)]));
        return out;
      };
      return summarise(bw, bh, mask, fps, lead, lo, hi, (b) => lists[b] ?? [], trace);
    },
  };
}

// sRGB byte to linear light, and the relative luminance of a pixel's three bytes.
export const LIN = Float64Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const lum = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];

// One frame's relative luminance per 2x2 block of device pixels, written as uint16 into `out` from `base` on, row after row. `rgba` is
// the frame's pixels, `frameWidth` of them a row; the grid is `bw` by `bh` blocks and stands `ox` px right and `oy` px down of the
// frame's corner (0 or 1 each), so a block that straddles the even grid's lines is counted on the grid moved by one.
export function blockLuminance(rgba, frameWidth, bw, bh, ox, oy, out, base) {
  const d = rgba;
  for (let by = 0; by < bh; by++) {
    const r0 = (by * 2 + oy) * frameWidth * 4, r1 = r0 + frameWidth * 4;
    for (let bx = 0; bx < bw; bx++) {
      const a = r0 + (bx * 2 + ox) * 4, c = r1 + (bx * 2 + ox) * 4;
      const y = (0.2126 * (LIN[d[a]] + LIN[d[a + 4]] + LIN[d[c]] + LIN[d[c + 4]]) + 0.7152 * (LIN[d[a + 1]] + LIN[d[a + 5]] + LIN[d[c + 1]] + LIN[d[c + 5]]) +
        0.0722 * (LIN[d[a + 2]] + LIN[d[a + 6]] + LIN[d[c + 2]] + LIN[d[c + 6]])) / 4;
      out[base + by * bw + bx] = Math.round(y * 65535);
    }
  }
}

// The blocks the HUD's plates cover, which are not counted: 1 for each block of a `bw` by `bh` grid within `pad` device px of a
// plate's box (a plate's edge is antialiased over a fraction of a pixel). `plates` are the boxes of the plates the page draws, in
// CSS px, { x, y, w, h }, and `dpr` the device's pixel ratio. A grid moved by a pixel takes the even grid's mask, as every count has:
// it then reaches a pixel further right and down of a plate and a pixel less far left and up, which leaves a pixel's pad at the least.
export function platesMask(plates, bw, bh, dpr, pad = 2) {
  const mask = new Uint8Array(bw * bh);
  for (const p of plates) {
    // A plate's box in device pixels, `pad` of them wider all round.
    const x0 = Math.max(0, Math.floor((Math.floor(p.x * dpr) - pad) / 2)), x1 = Math.min(bw - 1, Math.floor((Math.ceil((p.x + p.w) * dpr) + pad - 1) / 2));
    const y0 = Math.max(0, Math.floor((Math.floor(p.y * dpr) - pad) / 2)), y1 = Math.min(bh - 1, Math.floor((Math.ceil((p.y + p.h) * dpr) + pad - 1) / 2));
    if (x1 < x0 || y1 < y0) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * bw + x] = 1;
  }
  return mask;
}
