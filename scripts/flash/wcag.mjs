// WCAG 2.3.1's general flash and red flash thresholds, counted by area: the bar the light show is held to (README.md here says what a
// count is, and where this departs from WCAG and why).
//
// A pixel's relative luminance, and its red, are followed frame by frame as the old count follows a block's (analyse.mjs): a transition
// is a change of a threshold or more from the pixel's last turn, each opposite to the one before. A transition takes the frames from
// when the pixel left its last peak or valley to the frame it had moved the threshold: two pixels change together when those frames
// overlap. The 10° field is a window a third of the frame wide by a third high (341/1024 by 256/768, WCAG's 341 × 256 px of a
// 1024 × 768 screen), slid over the frame by a thirty-second of itself each way. In each window, the pixels changing one way together
// that cover a quarter of it or more are a transition of the window, each opposite to the one before; two are a flash. A job passes
// when no window has more than 6 general transitions in any second, nor more than 6 red ones: 3 flashes of each.
//
// The count is taken as the frames arrive (`wcagCounter`): it keeps each pixel's turning and a ring of the last SPAN frames' changes,
// and each window's transitions, never the run.
import { LIN, mostWithin } from "./analyse.mjs";

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
// The windows stand a thirty-second of the field apart each way, so a field put anywhere is within half a step of a window in each
// direction: of a flash that covers a share s of it, a window sees at least s − 1/32.
export const STEPS = 32;
// The most frames of a transition that count toward its area: the last 30 before it completes, half a second. A transition that
// took longer is no part of a flash of more than 1 a second on its own; the cap bounds what the count keeps.
export const SPAN = 30;
// The bar: at most 6 transitions in any second of any window, general or red, which is 3 flashes.
export const MOST = 6;
// A pixel is at its peak or valley while it stands within a tenth of the threshold of it: its transition starts when it leaves.
const NEAR = [GENERAL / 10, RED / 10];
// The bits of a frame's changes at a pixel: a general rise, a general fall, a red rise, a red fall.
const BIT = [1, 2, 4, 8];

// The 10° field in a frame `width` by `height` device pixels, and where its windows stand: their left edges and their tops.
export function fieldOf(width, height) {
  const w = Math.max(1, Math.min(width, Math.round(width * FIELD[0]))), h = Math.max(1, Math.min(height, Math.round(height * FIELD[1])));
  return { w, h, xs: places(width, w), ys: places(height, h) };
}
function places(size, w) {
  const step = Math.max(1, w / STEPS), out = [];
  for (let k = 0; k * step < size - w; k++) out.push(Math.round(k * step));
  out.push(size - w);
  return [...new Set(out)];
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

// The count as the frames arrive, for frames `width` by `height` device pixels. `add(rgba)` takes the next frame, its pixels as
// sRGB bytes, four a pixel, row after row. The first `lead` frames are the lead-in: they set each pixel's and each window's state and
// count for nothing else. `mask(m)` leaves out the pixels `m` marks from that frame on. `result()` ends the count.
export function wcagCounter(width, height, { fps = 60, lead = 0, span = SPAN } = {}) {
  const n = width * height, { w, h, xs, ys } = fieldOf(width, height), nx = xs.length, nWin = nx * ys.length, need = AREA * w * h;
  // Each pixel's turning, for each measure (0 general, 1 red): until its first transition it is measured from its least and its
  // greatest so far (`lo`, `hi`), after it from where its last turn left it (`ext`), in the direction `dir`. `at…` is the last frame
  // it stood at that least, greatest or turn; `…Sat` whether that state was a saturated red.
  const dir = [new Int8Array(n), new Int8Array(n)], ext = [new Float64Array(n), new Float64Array(n)], at = [new Int32Array(n), new Int32Array(n)];
  const lo = [new Float64Array(n), new Float64Array(n)], hi = [new Float64Array(n), new Float64Array(n)];
  const atLo = [new Int32Array(n), new Int32Array(n)], atHi = [new Int32Array(n), new Int32Array(n)];
  const sats = () => [new Uint8Array(n), new Uint8Array(n)], extSat = sats(), loSat = sats(), hiSat = sats();
  const masked = new Uint8Array(n), prev = new Uint8Array(4 * n);
  // The ring: frame i's changes at slot i % span, a bit for each kind; `any` says which kinds a slot holds at all.
  const ring = new Uint8Array(span * n), any = new Uint8Array(span * 4);
  const sums = new Int32Array((width + 1) * (height + 1)), areas = [0, 1, 2, 3].map(() => new Int32Array(nWin));
  // Each window's state, for each measure: the direction of its last transition, whether it was changing each way at the frame before,
  // and its transitions in the window, as [frame, direction] pairs flattened.
  const last = [new Int8Array(nWin), new Int8Array(nWin)], was = [new Uint8Array(2 * nWin), new Uint8Array(2 * nWin)], wasAny = [false, false];
  const lists = [new Array(nWin), new Array(nWin)];
  // The largest share of any window that changed one way at once, for each measure, and where and when.
  /** @type {({ share: number, x: number, y: number, frame: number, direction: number } | null)[]} */
  const largest = [null, null];
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
  }

  // How many pixels of kind q each window holds at ring slot s: by a summed-area table of the slot.
  function windowAreas(s, q) {
    const W1 = width + 1, bit = BIT[q], base = s * n, out = areas[q];
    for (let y = 0; y < height; y++) {
      const row0 = y * W1, row1 = row0 + W1, from = base + y * width;
      let run = 0;
      for (let x = 0; x < width; x++) { if (ring[from + x] & bit) run += 1; sums[row1 + x + 1] = sums[row0 + x + 1] + run; }
    }
    for (let k = 0; k < nWin; k++) {
      const x = xs[k % nx], y = ys[(k / nx) | 0], top = y * W1, bottom = (y + h) * W1;
      out[k] = sums[bottom + x + w] - sums[top + x + w] - sums[bottom + x] + sums[top + x];
    }
    return out;
  }

  // The windows at frame t of the run, once every change that can reach it is in: each window's transitions of each measure.
  function finalise(t) {
    const s = t % span, counted = t - lead;
    for (let k = 0; k < 2; k++) {
      const rise = any[s * 4 + 2 * k] ? windowAreas(s, 2 * k) : null, fall = any[s * 4 + 2 * k + 1] ? windowAreas(s, 2 * k + 1) : null;
      if (!rise && !fall && !wasAny[k]) continue;
      const L = last[k], P = was[k], list = lists[k];
      let still = false;
      for (let win = 0; win < nWin; win++) {
        const a = rise ? rise[win] : 0, b = fall ? fall[win] : 0, r = a >= need, f = b >= need;
        const newR = r && P[2 * win] === 0, newF = f && P[2 * win + 1] === 0;
        P[2 * win] = r ? 1 : 0; P[2 * win + 1] = f ? 1 : 0;
        if (r || f) still = true;
        // A window that starts changing both ways at once makes one transition, opposite to its last; one way, a transition when it is
        // opposite to the last. A run of frames changing the same way is one transition.
        let d = 0;
        if (newR && newF) d = L[win] === 1 ? -1 : 1;
        else if (newR && L[win] !== 1) d = 1;
        else if (newF && L[win] !== -1) d = -1;
        if (d !== 0) { L[win] = d; if (counted >= 0) (list[win] ??= []).push(counted, d); }
        if (counted >= 0 && (a || b)) {
          const share = Math.max(a, b) / (w * h);
          if (!largest[k] || share > largest[k].share) largest[k] = { share, x: xs[win % nx], y: ys[(win / nx) | 0], frame: counted, direction: a >= b ? 1 : -1 };
        }
      }
      wasAny[k] = still;
    }
    ring.fill(0, s * n, s * n + n);
    any.fill(0, s * 4, s * 4 + 4);
    finalised = t + 1;
  }

  // What a measure's windows come to: the most transitions in any second, by the cautious reading (first to last at most fps frames
  // apart) and the strict (fps - 1), the window and the frames, and the busiest windows.
  function summarise(k) {
    const ranked = [];
    for (let win = 0; win < nWin; win++) {
      const s = lists[k][win];
      if (!s) continue;
      const inc = mostWithin(s, fps), strict = mostWithin(s, fps - 1);
      ranked.push({ win, most: inc.best, strict: strict.best, at: inc.at, total: s.length / 2, s });
    }
    ranked.sort((p, q) => q.most - p.most || q.strict - p.strict || q.total - p.total || p.win - q.win);
    const describe = (r) => {
      let first = 0;
      while (r.s[first] !== r.at) first += 2;
      const transitions = [];
      for (let i = first; i < first + 2 * r.most; i += 2) transitions.push([r.s[i], r.s[i + 1]]);
      return { x: xs[r.win % nx], y: ys[(r.win / nx) | 0], w, h, mostInASecond: r.most, mostInASecondStrict: r.strict, flashes: r.most / 2, runStartsAtFrame: r.at, transitionsInWindow: r.total, transitions };
    };
    const top = ranked.slice(0, 8).map(describe);
    return {
      mostInASecond: ranked.length ? ranked[0].most : 0, mostInASecondStrict: ranked.reduce((m, r) => Math.max(m, r.strict), 0),
      flashes: (ranked.length ? ranked[0].most : 0) / 2, windowsWithTransitions: ranked.length, windowsOverTheBar: ranked.filter((r) => r.most > MOST).length,
      worst: top[0] ?? null, top, largest: largest[k] && { ...largest[k], share: Math.round(largest[k].share * 10000) / 10000 },
    };
  }

  return {
    field: { w, h, xs, ys },
    mask(m) {
      for (let p = 0; p < n; p++) if (m[p]) masked[p] = 1;
    },
    add(rgba) {
      if (done) throw new Error("the count has ended");
      if (rgba.length < 4 * n) throw new Error(`a frame of ${rgba.length / 4} pixels, and the count is of ${width}x${height}`);
      const i = frames++;
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
    },
    result() {
      if (!done) for (let t = finalised; t < frames; t++) finalise(t);
      done = true;
      const general = summarise(0), red = summarise(1);
      let maskedPixels = 0;
      for (let p = 0; p < n; p++) maskedPixels += masked[p];
      return {
        field: { width: w, height: h, share: FIELD, steps: STEPS, windows: [nx, ys.length] }, area: AREA, span,
        general, red, pass: general.mostInASecond <= MOST && red.mostInASecond <= MOST, maskedPixels,
      };
    },
  };
}
