// Counts swings in relative luminance per 2x2 block. `L` is nFrames x nBlocks of uint16 (relative luminance x 65535), frame after frame.
// A swing is a change of at least THRESHOLD from the block's last turning point, each swing opposite in direction to the one before.

export const THRESHOLD = 0.1;
const T16 = THRESHOLD * 65535;

// The frames at which a block swings, as [frame, direction] pairs flattened.
export function swingsOf(L, nFrames, nBlocks, b) {
  const out = [];
  let lo = L[b], hi = L[b], ext = 0, dir = 0;
  for (let f = 1; f < nFrames; f++) {
    const v = L[f * nBlocks + b];
    if (dir === 0) {
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      if (v - lo >= T16) { dir = 1; ext = v; out.push(f, 1); }
      else if (hi - v >= T16) { dir = -1; ext = v; out.push(f, -1); }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= T16) { dir = -1; ext = v; out.push(f, -1); }
    } else {
      if (v < ext) ext = v;
      else if (v - ext >= T16) { dir = 1; ext = v; out.push(f, 1); }
    }
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

export function analyse(L, nFrames, bw, bh, mask, fps = 60) {
  const nBlocks = bw * bh;
  // A second holds fps frame intervals: swings whose frames are at most fps apart (inclusive, the cautious reading), and at most fps - 1
  // apart (a second's fps frames).
  const perBlock = new Uint8Array(nBlocks), perBlockStrict = new Uint8Array(nBlocks), total = new Uint16Array(nBlocks), range = new Float32Array(nBlocks);
  const hist = new Array(16).fill(0);
  let unmasked = 0, anySwing = 0, totalSwings = 0, maxRange = 0, maxRangeAt = -1, brightSwings = 0;
  const ranked = [];
  for (let b = 0; b < nBlocks; b++) {
    if (mask[b]) continue;
    unmasked += 1;
    let lo = 65535, hi = 0;
    for (let f = 0; f < nFrames; f++) { const v = L[f * nBlocks + b]; if (v < lo) lo = v; if (v > hi) hi = v; }
    range[b] = (hi - lo) / 65535;
    if (range[b] > maxRange) { maxRange = range[b]; maxRangeAt = b; }
    if (hi - lo < T16) { hist[0] += 1; continue; }
    const s = swingsOf(L, nFrames, nBlocks, b);
    const n = s.length / 2;
    total[b] = n;
    if (n) { anySwing += 1; totalSwings += n; }
    /* WCAG's general flash leaves out a swing whose darker side is at 0.8 or over; these count here, and how many there are is reported. */
    if (lo >= 0.8 * 65535) brightSwings += n;
    const inc = mostWithin(s, fps), strict = mostWithin(s, fps - 1);
    perBlock[b] = inc.best; perBlockStrict[b] = strict.best;
    hist[Math.min(15, inc.best)] += 1;
    if (inc.best > 0) ranked.push({ b, most: inc.best, strict: strict.best, at: inc.at, total: n, range: range[b] });
  }
  ranked.sort((p, q) => q.most - p.most || q.strict - p.strict || q.total - p.total || q.range - p.range);
  const atLeast = {}, atLeastStrict = {};
  for (let k = 1; k <= 8; k++) {
    atLeast[k] = ranked.filter((r) => r.most >= k).length;
    atLeastStrict[k] = ranked.filter((r) => r.strict >= k).length;
  }
  const place = (b) => ({ bx: b % bw, by: Math.floor(b / bw), x: (b % bw) * 2, y: Math.floor(b / bw) * 2 });
  const trace = (b) => Array.from({ length: nFrames }, (_, f) => Math.round((L[f * nBlocks + b] / 65535) * 10000) / 10000);
  const describe = (r) => ({ ...place(r.b), mostInASecond: r.most, mostInASecondStrict: r.strict, runStartsAtFrame: r.at, swingsInWindow: r.total, range: Math.round(r.range * 1000) / 1000,
    swings: (() => { const s = swingsOf(L, nFrames, nBlocks, r.b); const o = []; for (let i = 0; i < s.length; i += 2) o.push([s[i], s[i + 1]]); return o; })() });
  const worst = ranked[0] ?? null;
  return {
    unmaskedBlocks: unmasked, maskedBlocks: nBlocks - unmasked,
    maxSwingsInASecond: worst ? worst.most : 0,
    maxSwingsInASecondStrict: ranked.reduce((m, r) => Math.max(m, r.strict), 0),
    blocksAtLeast: atLeast, blocksAtLeastStrict: atLeastStrict,
    blocksWithAnySwing: anySwing, totalSwings, swingsAtBlocksNeverUnder08: brightSwings,
    histogramOfMostInASecond: hist,
    worst: worst ? { ...describe(worst), trace: trace(worst.b) } : null,
    top: ranked.slice(0, 12).map(describe),
    largestRange: maxRangeAt >= 0 ? { ...place(maxRangeAt), range: Math.round(maxRange * 1000) / 1000, trace: trace(maxRangeAt) } : null,
    maps: { perBlock, total, range },
  };
}

// sRGB byte to linear light, and the relative luminance of a pixel's three bytes.
export const LIN = Float64Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const lum = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];

// One frame's relative luminance per 2x2 block of device pixels, written as uint16 into `out` from `base` on, row after row. `rgba` is
// the frame's pixels, `frameWidth` of them a row; the grid is `bw` by `bh` blocks and stands `ox` px right and `oy` px down of the
// frame's corner (0 or 1 each), so a block that straddles the even grid's lines is counted on the grid moved by one. Returns the sum of
// the blocks' luminance and how many they are, leaving out the blocks `mask` marks where one is given.
export function blockLuminance(rgba, frameWidth, bw, bh, ox, oy, out, base, mask) {
  const d = rgba;
  let sum = 0, count = 0;
  for (let by = 0; by < bh; by++) {
    const r0 = (by * 2 + oy) * frameWidth * 4, r1 = r0 + frameWidth * 4;
    for (let bx = 0; bx < bw; bx++) {
      const a = r0 + (bx * 2 + ox) * 4, c = r1 + (bx * 2 + ox) * 4;
      const y = (0.2126 * (LIN[d[a]] + LIN[d[a + 4]] + LIN[d[c]] + LIN[d[c + 4]]) + 0.7152 * (LIN[d[a + 1]] + LIN[d[a + 5]] + LIN[d[c + 1]] + LIN[d[c + 5]]) +
        0.0722 * (LIN[d[a + 2]] + LIN[d[a + 6]] + LIN[d[c + 2]] + LIN[d[c + 6]])) / 4;
      out[base + by * bw + bx] = Math.round(y * 65535);
      if (!mask || !mask[by * bw + bx]) { sum += y; count += 1; }
    }
  }
  return { sum, count };
}

// The blocks the HUD's plates cover, which are not counted: 1 for each block of a `bw` by `bh` grid within `pad` device px of a drawn
// plate's box (a plate's edge is antialiased over a fraction of a pixel). `plates` are boxes in CSS px, { x, y, w, h, drawn }, and
// `dpr` the device's pixel ratio. A grid moved by a pixel takes the even grid's mask, as every count has: it then reaches a pixel
// further right and down of a plate and a pixel less far left and up, which leaves a pixel's pad at the least.
export function platesMask(plates, bw, bh, dpr, pad = 2) {
  const mask = new Uint8Array(bw * bh);
  for (const p of plates) {
    if (!p.drawn) continue;
    // A plate's box in device pixels, `pad` of them wider all round.
    const x0 = Math.max(0, Math.floor((Math.floor(p.x * dpr) - pad) / 2)), x1 = Math.min(bw - 1, Math.floor((Math.ceil((p.x + p.w) * dpr) + pad - 1) / 2));
    const y0 = Math.max(0, Math.floor((Math.floor(p.y * dpr) - pad) / 2)), y1 = Math.min(bh - 1, Math.floor((Math.ceil((p.y + p.h) * dpr) + pad - 1) / 2));
    if (x1 < x0 || y1 < y0) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * bw + x] = 1;
  }
  return mask;
}
