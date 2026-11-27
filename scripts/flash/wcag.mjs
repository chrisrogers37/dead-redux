// WCAG 2.3.1's general flash and red flash thresholds, counted by area: the bar the light show is held to (README.md here says what a
// count is, and where this departs from WCAG and why).
//
// A pixel's relative luminance, and its red, are followed frame by frame as the old count follows a block's (analyse.mjs): a transition
// is a change of a threshold or more from the pixel's last turn, each opposite to the one before. The 10° field is a window a third of
// the frame wide by a third high (341/1024 by 256/768, WCAG's 341 × 256 px of a 1024 × 768 screen), at every place it can stand in the
// frame. A field's count in a second is the worse of two measures:
//
// - At once. A pixel's transition takes the frames from when it left its last peak or valley to the frame it had moved the threshold,
//   and two pixels change together when those frames overlap. Where the pixels changing one way together cover a quarter of a field or
//   more, the field changes that way: one transition of the field, each opposite to the one before, at the last frame of that run.
// - Pixel by pixel. Where a quarter of a field or more is pixels that each make n transitions or more in the same second, the field
//   makes n in that second, though its pixels change at different frames: a beam sweeping across it, or a pattern moving over it.
//
// A job passes when no field makes more than 6 general transitions in any second, nor more than 6 red ones: 3 flashes of each.
//
// The count is taken as the frames arrive (`wcagCounter`): it keeps each pixel's turning, a ring of the last SPAN frames' changes, each
// pixel's transitions in the last second, and each field's last KEEP transitions, never the run.
import { LIN } from "./analyse.mjs";

// A general transition: a change in relative luminance of 10 % of the maximum (1.0) or more, the darker state below 0.80.
export const GENERAL = 0.1, DARKER = 0.8;
// A red transition: a change of more than 20 in (R − G − B) × 320, a negative value counted as 0, either state a saturated red,
// R / (R + G + B) of 0.8 or more; R, G and B are linear, from 0 to 1, as in relative luminance (WCAG 2.0's working definition).
export const RED = 20, RED_SCALE = 320, SATURATED = 0.8;
// The share of a 10° field that flashes together, at which it counts: WCAG passes 25 % or less, and this counts 25 % on the cautious
// side, a pixel more than WCAG would.
export const AREA = 0.25;
// The 10° field as a share of the frame: WCAG's 341 × 256 px of a 1024 × 768 screen.
export const FIELD = [341 / 1024, 256 / 768];
// The most frames of a transition that count toward its area at once: the last 30 before it completes, half a second. A transition that
// took longer is no part of a flash of more than 1 a second on its own; the cap bounds what the count keeps.
export const SPAN = 30;
// The bar: at most 6 transitions in any second of any field, general or red, which is 3 flashes.
export const MOST = 6;
// The transitions a field keeps, its last 16: enough to tell any count over the bar, and to name one of up to 16 in a second.
export const KEEP = 16;
// A pixel is at its peak or valley while it stands within a tenth of the threshold of it: its transition starts when it leaves.
export const NEAR = [GENERAL / 10, RED / 10];
// The bits of a frame's changes at a pixel: a general rise, a general fall, a red rise, a red fall.
const BIT = [1, 2, 4, 8];

// The 10° field in a frame `width` by `height` device pixels, and how many places it can stand at across the frame and down it.
export function fieldOf(width, height) {
  const w = Math.max(1, Math.min(width, Math.round(width * FIELD[0]))), h = Math.max(1, Math.min(height, Math.round(height * FIELD[1])));
  return { w, h, nx: width - w + 1, ny: height - h + 1 };
}

// Whether a change of `change` is a transition: for the general measure (k 0) 10 % or more with the darker state, `darker`, below
// 0.80; for the red (k 1) more than 20 with either state saturated.
const passes = (k, change, darker, sat, otherSat) => (k ? change > RED && (sat === 1 || otherSat === 1) : change >= GENERAL && darker < DARKER);

// The pixels the HUD's plates cover, which are not counted: 1 for each pixel of a `width` by `height` frame within `pad` device px of a
// plate's box. `plates` are boxes in CSS px, { x, y, w, h }, and `dpr` the device's pixel ratio.
export function platesPixelMask(plates, width, height, dpr, pad = 2) {
  const mask = new Uint8Array(width * height);
  for (const p of plates) {
    const x0 = Math.max(0, Math.floor(p.x * dpr) - pad), x1 = Math.min(width - 1, Math.ceil((p.x + p.w) * dpr) + pad - 1);
    const y0 = Math.max(0, Math.floor(p.y * dpr) - pad), y1 = Math.min(height - 1, Math.ceil((p.y + p.h) * dpr) + pad - 1);
    if (x1 < x0 || y1 < y0) continue;
    for (let y = y0; y <= y1; y++) mask.fill(1, y * width + x0, y * width + x1 + 1);
  }
  return mask;
}

const round4 = (share) => Math.round(share * 10000) / 10000;

// The count as the frames arrive, for frames `width` by `height` device pixels. `add(rgba)` takes the next frame, its pixels as
// sRGB bytes, four a pixel, row after row. The first `lead` frames are the lead-in: they set each pixel's and each field's state and
// count for nothing else. `mask(m)` leaves out the pixels `m` marks from that frame on. `result()` ends the count.
export function wcagCounter(width, height, { fps = 60, lead = 0, span = SPAN } = {}) {
  const n = width * height, { w, h, nx, ny } = fieldOf(width, height), nWin = nx * ny, px = w * h, need = AREA * px;
  const two = (make) => [make(), make()];
  // Each pixel's turning, for each measure (0 general, 1 red): until its first transition it is measured from its least and its
  // greatest so far (`lo`, `hi`), after it from where its last turn left it (`ext`), in the direction `dir`. `at…` is the last frame
  // it stood at that least, greatest or turn; `…Sat` whether that state was a saturated red.
  const dir = two(() => new Int8Array(n)), ext = two(() => new Float64Array(n)), at = two(() => new Int32Array(n));
  const lo = two(() => new Float64Array(n)), hi = two(() => new Float64Array(n));
  const atLo = two(() => new Int32Array(n)), atHi = two(() => new Int32Array(n));
  const extSat = two(() => new Uint8Array(n)), loSat = two(() => new Uint8Array(n)), hiSat = two(() => new Uint8Array(n));
  const masked = new Uint8Array(n), prev = new Uint8Array(4 * n);
  // The ring: frame i's changes at slot i % span, a bit for each kind; `any` says which kinds a slot holds at all.
  const ring = new Uint8Array(span * n), any = new Uint8Array(span * 4);
  // Two summed-area tables of the frame, so that any field's count of pixels is four reads.
  const W1 = width + 1, satA = new Int32Array(W1 * (height + 1)), satB = new Int32Array(W1 * (height + 1));

  // At once, each field's state for each measure, field by field across the frame and then down: whether it is in a run of frames
  // rising, and falling, the direction of its last transition, and its last KEEP transitions' frames, with how many it has made and
  // the most it has made in a second, by the cautious reading (first to last at most fps frames apart) and the strict (fps − 1).
  const inRise = two(() => new Uint8Array(nWin)), inFall = two(() => new Uint8Array(nWin)), last = two(() => new Int8Array(nWin));
  const kept = two(() => new Int32Array(nWin * KEEP)), total = two(() => new Int32Array(nWin));
  const best = two(() => new Uint8Array(nWin)), bestStrict = two(() => new Uint8Array(nWin));
  const open = [false, false];
  // The field that first made its measure's most in a second, with its transitions in that second.
  /** @type {({ win: number, most: number, at: number, transitions: number[][] } | null)[]} */
  const worst = [null, null];
  // The largest share of any field that changed one way at once, for each measure, and where and when.
  /** @type {({ share: number, x: number, y: number, frame: number, direction: number } | null)[]} */
  const largest = [null, null];

  // Pixel by pixel: each pixel's transitions in the second up to the frame now, how many pixels have each count, and which pixels
  // made one at each of the last fps + 1 frames, to be taken off as the second moves past them.
  const counts = two(() => new Uint8Array(n)), hist = two(() => { const H = new Int32Array(fps + 3); H[0] = n; return H; });
  const due = two(() => Array.from({ length: fps + 1 }, () => /** @type {number[]} */ ([])));
  // The most transitions in a second that a quarter of a field made, and where and when; the largest share of a field that made more
  // than the bar; and the most any one pixel made.
  const level = [0, 0];
  /** @type {({ x: number, y: number, w: number, h: number, frame: number, share: number } | null)[]} */
  const levelAt = [null, null];
  /** @type {({ share: number, x: number, y: number, frame: number } | null)[]} */
  const over = [null, null];
  const atAPixel = [0, 0];
  let frames = 0, finalised = 0, done = false;

  // A change of kind q at pixel p from frame `from` (the last at its turn) to frame i: the frames after `from`, the last `span` at most.
  function mark(q, p, from, i) {
    if (masked[p]) return;
    for (let j = Math.max(from + 1, i - span + 1); j <= i; j++) { const s = j % span; ring[s * n + p] |= BIT[q]; any[s * 4 + q] = 1; }
  }

  // Measure k's turning at pixel p, frame i, its value now `v` and `sat` whether it is a saturated red.
  function track(k, p, v, sat, i) {
    const near = NEAR[k], D = dir[k], E = ext[k], A = at[k], ES = extSat[k];
    let d = 0, from = 0;
    if (D[p] === 0) {
      const LO = lo[k], HI = hi[k], LS = loSat[k], HS = hiSat[k];
      if (v <= LO[p] + near) { if (v < LO[p]) { LO[p] = v; LS[p] = sat; } atLo[k][p] = i; }
      if (v >= HI[p] - near) { if (v > HI[p]) { HI[p] = v; HS[p] = sat; } atHi[k][p] = i; }
      if (passes(k, v - LO[p], LO[p], sat, LS[p])) { d = 1; from = atLo[k][p]; }
      else if (passes(k, HI[p] - v, v, sat, HS[p])) { d = -1; from = atHi[k][p]; }
    } else if (D[p] === 1) {
      if (v >= E[p] - near) { if (v > E[p]) { E[p] = v; ES[p] = sat; } A[p] = i; }
      else if (passes(k, E[p] - v, v, sat, ES[p])) { d = -1; from = A[p]; }
    } else if (v <= E[p] + near) { if (v < E[p]) { E[p] = v; ES[p] = sat; } A[p] = i; }
    else if (passes(k, v - E[p], E[p], sat, ES[p])) { d = 1; from = A[p]; }
    if (d === 0) return;
    D[p] = d; E[p] = v; A[p] = i; ES[p] = sat;
    mark(2 * k + (d === 1 ? 0 : 1), p, from, i);
    // Pixel by pixel: one more transition in the second, from the lead-in's end on.
    if (i >= lead && !masked[p]) {
      const C = counts[k], H = hist[k], c = C[p];
      H[c] -= 1; H[c + 1] += 1; C[p] = c + 1;
      due[k][i % (fps + 1)].push(p);
    }
  }

  // The pixels of a field standing at (x, y), from summed-area table `sat`.
  const fieldSum = (sat, x, y) => sat[(y + h) * W1 + x + w] - sat[y * W1 + x + w] - sat[(y + h) * W1 + x] + sat[y * W1 + x];
  // A summed-area table of ring slot s's changes of kind q.
  function sumOfKind(sat, s, q) {
    const bit = BIT[q], base = s * n;
    for (let y = 0; y < height; y++) {
      const row0 = y * W1, row1 = row0 + W1, from = base + y * width;
      let run = 0;
      for (let x = 0; x < width; x++) { if (ring[from + x] & bit) run += 1; sat[row1 + x + 1] = sat[row0 + x + 1] + run; }
    }
  }

  // A transition of field `win` of measure k, at counted frame c, in direction d: kept, and its second counted, back from it.
  function record(k, win, c, d) {
    const T = kept[k], tot = total[k][win], base = win * KEEP;
    T[base + (tot % KEEP)] = c;
    total[k][win] = tot + 1;
    const have = tot + 1 < KEEP ? tot + 1 : KEEP;
    let inc = 0, strict = 0, first = c;
    for (let j = 0; j < have; j++) {
      const f = T[base + ((tot - j) % KEEP)];
      if (c - f > fps) break;
      inc += 1; first = f;
      if (c - f < fps) strict += 1;
    }
    if (inc > best[k][win]) best[k][win] = inc;
    if (strict > bestStrict[k][win]) bestStrict[k][win] = strict;
    if (!worst[k] || inc > worst[k].most) {
      // A field's transitions alternate, each opposite to the one before (close): the newest is d.
      const transitions = [];
      for (let j = inc - 1; j >= 0; j--) transitions.push([T[base + ((tot - j) % KEEP)], j % 2 === 0 ? d : -d]);
      worst[k] = { win, most: inc, at: first, transitions };
    }
  }

  // A field's run of frames rising, or falling, or both, that ended at counted frame c: the field's change that way is complete, at the
  // frame its last pixels to change together passed the threshold. Both at once make one transition, opposite to the field's last; one
  // way, a transition when it is opposite to the last. The lead-in's transitions set the field's direction and are not counted.
  function close(k, win, rose, fell, c) {
    const L = last[k];
    let d = 0;
    if (rose && fell) d = L[win] === 1 ? -1 : 1;
    else if (rose && L[win] !== 1) d = 1;
    else if (fell && L[win] !== -1) d = -1;
    if (d === 0) return;
    L[win] = d;
    if (c >= 0) record(k, win, c, d);
  }

  // The fields at frame t of the run, once every change that can reach it is in: each field's runs of each measure, and the largest
  // share of a field changing one way at once.
  function finalise(t) {
    const s = t % span, counted = t - lead;
    for (let k = 0; k < 2; k++) {
      const hasRise = any[s * 4 + 2 * k] === 1, hasFall = any[s * 4 + 2 * k + 1] === 1;
      if (!hasRise && !hasFall && !open[k]) continue;
      if (hasRise) sumOfKind(satA, s, 2 * k);
      if (hasFall) sumOfKind(satB, s, 2 * k + 1);
      const IR = inRise[k], IF = inFall[k];
      let still = false, most = 0, mx = 0, my = 0, md = 0;
      for (let y = 0, win = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++, win++) {
          const a = hasRise ? fieldSum(satA, x, y) : 0, b = hasFall ? fieldSum(satB, x, y) : 0;
          const r = a >= need ? 1 : 0, f = b >= need ? 1 : 0;
          // A run that held at the frame before and holds no more ended there.
          const rose = IR[win] === 1 && r === 0, fell = IF[win] === 1 && f === 0;
          if (rose || fell) close(k, win, rose, fell, counted - 1);
          IR[win] = r; IF[win] = f;
          if (r || f) still = true;
          const m = a > b ? a : b;
          if (m > most) { most = m; mx = x; my = y; md = a >= b ? 1 : -1; }
        }
      }
      open[k] = still;
      if (counted >= 0 && most > 0 && (!largest[k] || most / px > largest[k].share)) largest[k] = { share: most / px, x: mx, y: my, frame: counted, direction: md };
    }
    ring.fill(0, s * n, s * n + n);
    any.fill(0, s * 4, s * 4 + 4);
    finalised = t + 1;
  }

  // The widest share of any field whose unmasked pixels each made m transitions or more of measure k in the second now.
  function widest(k, m) {
    const C = counts[k];
    for (let y = 0; y < height; y++) {
      const row0 = y * W1, row1 = row0 + W1, from = y * width;
      let run = 0;
      for (let x = 0; x < width; x++) { const p = from + x; if (C[p] >= m && masked[p] === 0) run += 1; satA[row1 + x + 1] = satA[row0 + x + 1] + run; }
    }
    let most = -1, mx = 0, my = 0;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const v = fieldSum(satA, x, y); if (v > most) { most = v; mx = x; my = y; } }
    return { area: most, x: mx, y: my };
  }
  // Pixel by pixel, at counted frame c: the second from c − fps to c.
  function perPixel(k, c) {
    const H = hist[k];
    let top = H.length - 1;
    while (top > 0 && H[top] === 0) top -= 1;
    if (top > atAPixel[k]) atAPixel[k] = top;
    const atLeast = (m) => { let s = 0; for (let v = m; v < H.length; v++) s += H[v]; return s; };
    const noteOver = (got) => {
      if (got.area > 0 && (!over[k] || got.area / px > over[k].share)) over[k] = { share: got.area / px, x: got.x, y: got.y, frame: c };
    };
    let barSeen = false;
    // The count only climbs: try the next one up while enough pixels anywhere have it to fill a quarter of a field.
    while (level[k] < top && atLeast(level[k] + 1) >= need) {
      const m = level[k] + 1, got = widest(k, m);
      if (m === MOST + 1) { barSeen = true; noteOver(got); }
      if (got.area < need) break;
      level[k] = m;
      levelAt[k] = { x: got.x, y: got.y, w, h, frame: c, share: got.area / px };
    }
    if (!barSeen && top > MOST) noteOver(widest(k, MOST + 1));
  }

  // What a measure comes to: at once, the most transitions of a field in any second, by both readings, the field and the frames, and
  // the largest share that changed one way at once; pixel by pixel, the most transitions in a second that a quarter of a field made,
  // where and when, the largest share of a field that made more than the bar, and the most at a pixel; and the worse of the two.
  function summarise(k) {
    let withTransitions = 0, overBar = 0, strict = 0;
    for (let win = 0; win < nWin; win++) {
      if (total[k][win]) withTransitions += 1;
      if (best[k][win] > MOST) overBar += 1;
      if (bestStrict[k][win] > strict) strict = bestStrict[k][win];
    }
    const wst = worst[k], most = wst ? wst.most : 0;
    const atOnce = {
      mostInASecond: most, mostInASecondStrict: strict, flashes: most / 2, windowsWithTransitions: withTransitions, windowsOverTheBar: overBar,
      worst: wst && {
        x: wst.win % nx, y: Math.floor(wst.win / nx), w, h, mostInASecond: wst.most, mostInASecondStrict: bestStrict[k][wst.win], flashes: wst.most / 2,
        runStartsAtFrame: wst.at, transitionsInWindow: total[k][wst.win], transitions: wst.transitions,
      },
      largest: largest[k] && { ...largest[k], share: round4(largest[k].share) },
    };
    const pixels = {
      mostInASecond: level[k], flashes: level[k] / 2, worst: levelAt[k] && { ...levelAt[k], share: round4(levelAt[k].share) },
      overTheBar: over[k] && { ...over[k], share: round4(over[k].share) }, mostAtAPixel: atAPixel[k],
    };
    const worse = Math.max(atOnce.mostInASecond, pixels.mostInASecond);
    return { mostInASecond: worse, flashes: worse / 2, atOnce, perPixel: pixels };
  }

  return {
    field: { w, h, nx, ny },
    mask(m) {
      for (let p = 0; p < n; p++) if (m[p]) masked[p] = 1;
    },
    add(rgba) {
      if (done) throw new Error("the count has ended");
      if (rgba.length < 4 * n) throw new Error(`a frame of ${rgba.length / 4} pixels, and the count is of ${width}x${height}`);
      const i = frames++;
      // The second moves on: the transitions of frame i − fps − 1 leave it.
      const slot = i % (fps + 1);
      for (let k = 0; k < 2; k++) {
        const list = due[k][slot];
        if (!list.length) continue;
        const C = counts[k], H = hist[k];
        for (const p of list) { const c = C[p]; H[c] -= 1; H[c - 1] += 1; C[p] = c - 1; }
        list.length = 0;
      }
      for (let p = 0, o = 0; p < n; p++, o += 4) {
        // A pixel the same as at the frame before stays at its turn if it stood there then, and does nothing else.
        if (i > 0 && rgba[o] === prev[o] && rgba[o + 1] === prev[o + 1] && rgba[o + 2] === prev[o + 2]) {
          for (let k = 0; k < 2; k++) {
            if (dir[k][p] !== 0) { if (at[k][p] === i - 1) at[k][p] = i; continue; }
            if (atLo[k][p] === i - 1) atLo[k][p] = i;
            if (atHi[k][p] === i - 1) atHi[k][p] = i;
          }
          continue;
        }
        const R = LIN[rgba[o]], G = LIN[rgba[o + 1]], B = LIN[rgba[o + 2]];
        const L = 0.2126 * R + 0.7152 * G + 0.0722 * B, x = R - G - B, red = x > 0 ? x * RED_SCALE : 0, sum = R + G + B;
        const sat = sum > 0 && R >= SATURATED * sum ? 1 : 0;
        if (i === 0) {
          lo[0][p] = hi[0][p] = L; lo[1][p] = hi[1][p] = red; loSat[1][p] = hiSat[1][p] = sat;
          continue;
        }
        track(0, p, L, 0, i);
        track(1, p, red, sat, i);
      }
      prev.set(rgba.subarray(0, 4 * n));
      if (i - span + 1 >= 0) finalise(i - span + 1);
      if (i >= lead) for (let k = 0; k < 2; k++) perPixel(k, i - lead);
    },
    result() {
      if (!done) {
        for (let t = finalised; t < frames; t++) finalise(t);
        // A run that holds at the last frame ends there.
        for (let k = 0; k < 2; k++) {
          if (!open[k]) continue;
          for (let win = 0; win < nWin; win++) if (inRise[k][win] || inFall[k][win]) close(k, win, inRise[k][win] === 1, inFall[k][win] === 1, frames - 1 - lead);
        }
      }
      done = true;
      const general = summarise(0), red = summarise(1);
      let maskedPixels = 0;
      for (let p = 0; p < n; p++) maskedPixels += masked[p];
      return {
        field: { width: w, height: h, share: FIELD, windows: [nx, ny] }, area: AREA, span,
        general, red, pass: general.mostInASecond <= MOST && red.mostInASecond <= MOST, maskedPixels,
      };
    },
  };
}
