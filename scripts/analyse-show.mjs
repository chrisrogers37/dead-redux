// Makes a show's map for the world's third layer (public/world/maps.js) from the recording the page plays, as the site's
// /api/playing route names it, fetched track by track from archive.org, decoded by ffmpeg in memory and reduced to loudness, low end,
// brightness, tempo and peaks. Only the map is written; no audio is kept.
//
// Usage: node scripts/analyse-show.mjs --out DIR [--site URL] SHOW_DATE [SHOW_DATE]
import { spawn } from "child_process";
import * as fs from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { setTimeout as sleep } from "timers/promises";
import { pathToFileURL } from "url";
import { checkMap, isDuration, MAP_VERSION, MAX_MAP_BYTES, MAX_PEAKS, STEPS, TEMPO_WINDOW } from "../public/world/maps.js";

// The site whose /api/playing route says what the page plays; a branch's preview can stand in for it.
export const SITE = "https://dead-redux.vercel.app";
// Every track the page plays streams from here, and the analysis fetches from nowhere else.
const MP3_PREFIX = "https://archive.org/download/";
export const USER_AGENT = "dead-redux-maps (+https://dead-redux.vercel.app)";
// archive.org gets one request at a time with a pause before each, and a failed one is retried after a longer pause.
export const PAUSE_MS = 1000;
export const RETRY_PAUSES_MS = [5000, 20000];
// The most shows a run analyses: two shows of about 180 MB each fit the job's time.
export const MAX_SHOWS = 2;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export const SAMPLE_RATE = 22050;
export const FRAME = 1024;
export const HOP = 512;
// Frames a second.
export const FPS = SAMPLE_RATE / HOP;
const BIN_HZ = SAMPLE_RATE / FRAME;
// Bass is bins 2-16 (43-344 Hz). Brightness and flux look up to 8 kHz.
const BASS_FIRST = 2;
const BASS_LAST = 16;
const TOP_BIN = Math.floor(8000 / BIN_HZ);
// Loudness is smoothed over this many seconds before its peaks are picked, and a peak must stand this far above the lower of
// its two sides.
const SMOOTH_S = 15;
const PROMINENCE = 0.2;

/** A response that was not ok; `status` is its HTTP status. The message names the server that answered and any refusal it marked. */
export class HttpError extends Error {
  constructor(url, status, server = null, mitigated = null) {
    const by = [server && `server ${server}`, mitigated && `cf-mitigated ${mitigated}`].filter(Boolean).join(", ");
    super(`${url} answered ${status}${by ? ` (${by})` : ""}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Makes requests one at a time, with a pause before each but the first. A request that fails is retried after the longer pauses
 * of RETRY_PAUSES_MS, unless the server refused it for good (a 4xx other than 429). A failure inside `read` (a cut stream, a
 * short body) counts as the request failing.
 *
 * @param io - { fetch, sleep, log }.
 * @returns `request(url, read)`: the result of `read(response)`.
 */
export function politeClient(io) {
  let started = false;
  let tail = Promise.resolve();

  async function attempt(url, read) {
    const res = await io.fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      await res.body?.cancel();
      throw new HttpError(url, res.status, res.headers.get("server"), res.headers.get("cf-mitigated"));
    }
    return await read(res);
  }

  async function run(url, read) {
    if (started) {
      io.log(`  pause ${PAUSE_MS / 1000} s`);
      await io.sleep(PAUSE_MS);
    }
    started = true;
    for (let failures = 1; ; failures++) {
      try {
        return await attempt(url, read);
      } catch (err) {
        const refused = err instanceof HttpError && err.status !== 429 && err.status < 500;
        if (refused || failures > RETRY_PAUSES_MS.length) throw err;
        const pause = RETRY_PAUSES_MS[failures - 1];
        const reason = err instanceof Error ? err.message : err;
        io.log(`  retry ${failures} of ${RETRY_PAUSES_MS.length} in ${pause / 1000} s: ${reason}`);
        await io.sleep(pause);
      }
    }
  }

  return {
    request(url, read) {
      const result = tail.then(() => run(url, read));
      // The next request waits for this one to finish, however it ends; its caller sees the failure.
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}

// The FFT's tables are built once: the bit-reversed order of the samples and the twiddle factors e^(-2*pi*i*k/N).
const LOG2_FRAME = Math.log2(FRAME);
const BIT_REVERSED = new Uint16Array(FRAME);
for (let i = 0; i < FRAME; i++) {
  let reversed = 0;
  for (let bit = 0; bit < LOG2_FRAME; bit++) reversed |= ((i >> bit) & 1) << (LOG2_FRAME - 1 - bit);
  BIT_REVERSED[i] = reversed;
}
const TWIDDLE_RE = new Float64Array(FRAME / 2);
const TWIDDLE_IM = new Float64Array(FRAME / 2);
for (let k = 0; k < FRAME / 2; k++) {
  TWIDDLE_RE[k] = Math.cos((2 * Math.PI * k) / FRAME);
  TWIDDLE_IM[k] = -Math.sin((2 * Math.PI * k) / FRAME);
}
const HANN = Float64Array.from({ length: FRAME }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (FRAME - 1)));

/**
 * The forward FFT of FRAME samples, in place: Float64Arrays of the real and imaginary parts, unscaled.
 *
 * @param re - Real parts, replaced by the transform's.
 * @param im - Imaginary parts, replaced by the transform's.
 */
export function fft(re, im) {
  for (let i = 0; i < FRAME; i++) {
    const j = BIT_REVERSED[i];
    if (j > i) {
      const r = re[i];
      re[i] = re[j];
      re[j] = r;
      const m = im[i];
      im[i] = im[j];
      im[j] = m;
    }
  }
  for (let size = 2; size <= FRAME; size *= 2) {
    const half = size / 2;
    const stride = FRAME / size;
    for (let start = 0; start < FRAME; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = TWIDDLE_RE[k * stride];
        const wi = TWIDDLE_IM[k * stride];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/**
 * Reduces mono 22050 Hz audio to one reading a frame: loudness, low end and brightness, summed per second, and spectral flux.
 *
 * @returns `push(chunk)` takes Buffers of s16le PCM of any byte length, and `finish()` gives
 *   `{ duration, seconds: { rms, bass, bright }, flux }`: each seconds series holds that second's mean (0 for a second with no
 *   frame), flux one reading per frame. Only whole frames count.
 */
export function createAnalyser() {
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const previous = new Float64Array(TOP_BIN + 1);
  const sums = { rms: [], bass: [], bright: [] };
  const counts = [];
  const flux = [];
  // The samples from the start of the next frame, and the low byte of a sample whose high byte has not arrived.
  let pending = new Float64Array(0);
  let lowByte = -1;
  let samples = 0;

  function frame(x, start) {
    let energy = 0;
    for (let n = 0; n < FRAME; n++) {
      energy += x[start + n] * x[start + n];
      re[n] = x[start + n] * HANN[n];
      im[n] = 0;
    }
    fft(re, im);
    let bass = 0;
    let weighted = 0;
    let total = 0;
    let rise = 0;
    for (let k = 1; k <= TOP_BIN; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const logMag = Math.log1p(mag);
      if (k >= BASS_FIRST && k <= BASS_LAST) bass += mag;
      weighted += k * BIN_HZ * mag;
      total += mag;
      rise += Math.max(0, logMag - previous[k]);
      previous[k] = logMag;
    }
    // The first frame has nothing before it to rise from.
    const index = flux.length;
    flux.push(index === 0 ? 0 : rise);
    // A frame belongs to the second its middle falls in.
    const second = Math.floor((index * HOP + FRAME / 2) / SAMPLE_RATE);
    while (counts.length <= second) {
      for (const series of Object.values(sums)) series.push(0);
      counts.push(0);
    }
    sums.rms[second] += Math.sqrt(energy / FRAME);
    sums.bass[second] += bass / (BASS_LAST - BASS_FIRST + 1);
    sums.bright[second] += total > 0 ? Math.min(1, weighted / total / 8000) : 0;
    counts[second]++;
  }

  return {
    push(chunk) {
      let at = 0;
      const fresh = new Float64Array((chunk.length + (lowByte >= 0 ? 1 : 0)) >> 1);
      let n = 0;
      if (lowByte >= 0 && chunk.length > 0) {
        fresh[n++] = ((((chunk[0] << 8) | lowByte) << 16) >> 16) / 32768;
        lowByte = -1;
        at = 1;
      }
      for (; at + 1 < chunk.length; at += 2) fresh[n++] = ((((chunk[at + 1] << 8) | chunk[at]) << 16) >> 16) / 32768;
      if (at < chunk.length) lowByte = chunk[at];
      samples += n;
      const merged = new Float64Array(pending.length + n);
      merged.set(pending);
      merged.set(fresh, pending.length);
      let start = 0;
      for (; start + FRAME <= merged.length; start += HOP) frame(merged, start);
      pending = merged.subarray(start);
    },
    finish() {
      const duration = samples / SAMPLE_RATE;
      const mean = (series) =>
        Float64Array.from({ length: Math.ceil(duration) }, (_, s) => (counts[s] > 0 ? series[s] / counts[s] : 0));
      return {
        duration,
        seconds: { rms: mean(sums.rms), bass: mean(sums.bass), bright: mean(sums.bright) },
        flux: Float32Array.from(flux),
      };
    },
  };
}

// The value at the 99th percentile of the series: the level a map calls full.
function p99(values) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(0.99 * (sorted.length - 1))];
}

/**
 * A series as bytes, scaled so its 99th percentile is 255 (louder values stop at 255). All zeros when that percentile is not
 * above 0.
 *
 * @param values - Non-negative numbers.
 */
export function toBytes(values) {
  const bytes = new Uint8Array(values.length);
  const top = p99(values);
  if (!(top > 0)) return bytes;
  for (let i = 0; i < values.length; i++) bytes[i] = Math.min(255, Math.round((values[i] / top) * 255));
  return bytes;
}

/** The means of consecutive blocks of `step` values; the last block may be short. */
export function blockMeans(values, step) {
  const means = new Float64Array(Math.ceil(values.length / step));
  for (let block = 0; block < means.length; block++) {
    const end = Math.min(values.length, (block + 1) * step);
    let sum = 0;
    for (let i = block * step; i < end; i++) sum += values[i];
    means[block] = sum / (end - block * step);
  }
  return means;
}

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);

/**
 * The beat of each TEMPO_WINDOW seconds, from the spectral flux: the lag between 0.3 and 1 s at which the window's flux, less
 * its mean, best matches itself. A window too short to repeat twice at the slowest lag is left unknown.
 *
 * Each onset is first spread over the frames beside it, so a beat that falls between two frames still lines up, and each lag's
 * match is the mean of the products it compares rather than their sum, which would favour short lags: so the eighths between
 * beats do not outscore the beat. Like any autocorrelation it cannot always tell a beat from its half or double: a fast or
 * backbeat-heavy beat can read as half its tempo (120 as 60), and eighths almost as loud as the beat as twice it. The confidence
 * says how well the lag matches, not which of those it is.
 *
 * @param flux - One reading per frame.
 * @param duration - The track's length in seconds.
 * @returns Two bytes a window: beats per minute (60-200, 0 where unknown) and a confidence (0-255), the best match as a share
 *   of the flux's energy.
 */
export function tempo(flux, duration) {
  const windows = Math.ceil(duration / TEMPO_WINDOW);
  const bytes = new Uint8Array(2 * windows);
  const minLag = Math.ceil(0.3 * FPS);
  const maxLag = Math.floor(1.0 * FPS);
  for (let w = 0; w < windows; w++) {
    const from = Math.round(w * TEMPO_WINDOW * FPS);
    const to = Math.min(flux.length, Math.round((w + 1) * TEMPO_WINDOW * FPS));
    const length = to - from;
    if (length < 2 * maxLag) continue;
    const x = new Float64Array(length);
    let mean = 0;
    for (let i = 0; i < length; i++) {
      const at = from + i;
      x[i] = 0.25 * flux[i > 0 ? at - 1 : at] + 0.5 * flux[at] + 0.25 * flux[i < length - 1 ? at + 1 : at];
      mean += x[i];
    }
    mean /= length;
    let r0 = 0;
    for (let i = 0; i < length; i++) {
      x[i] -= mean;
      r0 += x[i] * x[i];
    }
    if (r0 <= 0) continue;
    r0 /= length;
    const r = new Float64Array(maxLag + 1);
    let best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < length; i++) sum += x[i] * x[i + lag];
      r[lag] = sum / (length - lag);
      if (r[lag] > r[best]) best = lag;
    }
    if (r[best] <= 0) continue;
    let lag = best;
    if (best > minLag && best < maxLag) {
      // The peak between the three lags around the best, for a finer tempo than whole frames give.
      const a = r[best - 1];
      const b = r[best];
      const c = r[best + 1];
      const d = a - 2 * b + c;
      lag = best + (d < 0 ? (0.5 * (a - c)) / d : 0);
    }
    bytes[2 * w] = clamp(Math.round((60 * FPS) / lag), 60, 200);
    bytes[2 * w + 1] = clamp(Math.round((255 * r[best]) / r0), 0, 255);
  }
  return bytes;
}

/**
 * Where a track's loudness swells: the 1 Hz loudness, scaled to its 99th percentile and smoothed over SMOOTH_S seconds, has a
 * peak where it rises above the lower of its two sides by more than PROMINENCE. The MAX_PEAKS most prominent are kept.
 *
 * @param rms - Loudness a second.
 * @returns [second, strength] in time order, the strength being the smoothed loudness there (0-1) to two places.
 */
export function peaks(rms) {
  const top = p99(rms);
  if (!(top > 0)) return [];
  const n = rms.length;
  const level = Float64Array.from(rms, (x) => Math.min(1, x / top));
  const reach = (SMOOTH_S - 1) / 2;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - reach);
    const to = Math.min(n - 1, i + reach);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += level[j];
    s[i] = sum / (to - from + 1);
  }
  const found = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(s[i] > s[i - 1] && s[i] >= s[i + 1])) continue;
    // How far the loudness falls on each side before it climbs above this peak (or the track ends).
    let leftMin = s[i];
    for (let j = i - 1; j >= 0 && s[j] <= s[i]; j--) leftMin = Math.min(leftMin, s[j]);
    let rightMin = s[i];
    for (let j = i + 1; j < n && s[j] <= s[i]; j++) rightMin = Math.min(rightMin, s[j]);
    const prominence = s[i] - Math.max(leftMin, rightMin);
    if (prominence > PROMINENCE) found.push({ i, prominence });
  }
  return found
    .sort((a, b) => b.prominence - a.prominence || a.i - b.i)
    .slice(0, MAX_PEAKS)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => [i, Math.round(s[i] * 100) / 100]);
}

const base64 = (bytes) => Buffer.from(bytes).toString("base64");

/**
 * The map of a show, at the finest step whose file fits MAX_MAP_BYTES.
 *
 * @param show - The show date.
 * @param identifier - The archive.org identifier of the recording analysed, which is also the one the page plays.
 * @param tracks - [{ title, playingDuration, analysis }], analysis being what `createAnalyser().finish()` returned.
 * @returns { map, text }: the map and the JSON that is written.
 * @throws When even the coarsest step is too big.
 */
export function buildMap(show, identifier, tracks) {
  // A series fitted to the whole seconds of the rounded duration: cut, or padded with 0.
  const fit = (values, n) => Float64Array.from({ length: n }, (_, i) => values[i] ?? 0);
  const analysed = tracks.map(({ title, playingDuration, analysis }) => {
    const analysedDuration = Math.round(analysis.duration * 100) / 100;
    const n = Math.ceil(analysedDuration);
    const series = {
      rms: fit(analysis.seconds.rms, n),
      bass: fit(analysis.seconds.bass, n),
      bright: fit(analysis.seconds.bright, n),
    };
    return {
      title,
      analysedDuration,
      playingDuration,
      series,
      tempo: base64(tempo(analysis.flux, analysedDuration)),
      peaks: peaks(series.rms),
    };
  });
  for (const step of STEPS) {
    const env = (series) => base64(toBytes(blockMeans(series, step)));
    const map = {
      v: MAP_VERSION,
      show,
      analysed: identifier,
      playing: identifier,
      step,
      tracks: analysed.map((track) => ({
        title: track.title,
        analysedDuration: track.analysedDuration,
        playingDuration: track.playingDuration,
        env: { rms: env(track.series.rms), bass: env(track.series.bass), bright: env(track.series.bright) },
        tempo: track.tempo,
        peaks: track.peaks,
      })),
    };
    const text = JSON.stringify(map) + "\n";
    if (Buffer.byteLength(text) <= MAX_MAP_BYTES) return { map, text };
  }
  throw new Error(`${show}: the map is over ${MAX_MAP_BYTES} bytes even at ${STEPS[STEPS.length - 1]} s a step`);
}

// ffmpeg reads an mp3 from stdin and writes mono 16-bit little-endian PCM at SAMPLE_RATE to stdout.
const FFMPEG_ARGS = [
  "-hide_banner", "-loglevel", "error", "-f", "mp3", "-i", "pipe:0", "-map", "0:a:0",
  "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1",
];

/**
 * Decodes an mp3 stream with ffmpeg, in memory: the body goes to ffmpeg's input as it arrives and its output comes back as mono
 * s16le PCM at SAMPLE_RATE.
 *
 * @param body - The response body, a web ReadableStream.
 * @param onBytes - Called with the length of each chunk of the body.
 * @param onPcm - Called with each Buffer of PCM.
 * @throws With ffmpeg's own error when its process fails, as an ffmpeg that cannot start does, or else the first failure of the feed,
 *   the read or ffmpeg's exit.
 */
export async function ffmpegDecode(body, onBytes, onPcm) {
  // A body that cannot be read throws here, before ffmpeg is running to be left waiting for it.
  const source = Readable.fromWeb(body);
  const ffmpeg = spawn("ffmpeg", FFMPEG_ARGS, { stdio: ["pipe", "pipe", "inherit"] });
  // The feed and the read are joined to ffmpeg at once, in this tick, so that every failure of the body has a listener. When ffmpeg's
  // process fails ("spawn ffmpeg ENOENT" for a missing ffmpeg), the feed and the read fail after it, and its own error is the one reported.
  let processError = null;
  // A failure of any part stops ffmpeg, so the other parts end too.
  const stopOnFailure = (promise) =>
    promise.catch((err) => {
      ffmpeg.kill();
      throw err;
    });
  const fed = stopOnFailure(
    pipeline(
      source,
      async function* (chunks) {
        for await (const chunk of chunks) {
          onBytes(chunk.length);
          yield chunk;
        }
      },
      ffmpeg.stdin
    )
  );
  const read = stopOnFailure(
    (async () => {
      for await (const pcm of ffmpeg.stdout) onPcm(pcm);
    })()
  );
  const exited = stopOnFailure(
    new Promise((resolve, reject) => {
      ffmpeg.once("error", (err) => {
        processError = err;
        reject(err);
      });
      ffmpeg.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    })
  );
  const settled = await Promise.allSettled([fed, read, exited]);
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw processError ?? failed.reason;
}

// A track's analysis had its audio been silent: what the listing's map is built from before any audio is fetched.
const silence = (duration) => ({ duration, seconds: { rms: [], bass: [], bright: [] }, flux: [] });

/**
 * The recording the page plays for a show, as the site's /api/playing route answers: the page's own choice and its tracks. Before any
 * audio is fetched, the listing's map is built from silence and checked. That map has every part of the real one that the listing
 * decides, so a listing whose map would fail checkMap, or fit no step, fails here rather than after the download.
 *
 * @throws When the answer names no recording with tracks, a track is not a length and an archive.org MP3, or the listing's map would
 *   fail checkMap or fit no step.
 */
async function fetchPlaying(site, date, request) {
  const { identifier, tracks } = (await request(`${site}/api/playing/${date}`, (res) => res.json())) ?? {};
  if (typeof identifier !== "string" || !Array.isArray(tracks) || tracks.length === 0) {
    throw new Error(`${date}: ${site} names no recording with tracks`);
  }
  // The silent map is as long as each listed length, so the lengths are checked before it is built.
  for (const track of tracks) {
    const valid = isDuration(track?.duration) && String(track.mp3Url).startsWith(MP3_PREFIX);
    if (!valid) throw new Error(`${date}: a track of ${identifier} is not a length and an archive.org MP3: ${JSON.stringify(track)}`);
  }
  const listed = tracks.map((track) => ({ title: track.title, playingDuration: track.duration, analysis: silence(track.duration) }));
  const problems = checkMap(buildMap(date, identifier, listed).map);
  if (problems.length > 0) {
    const more = problems.length > 1 ? `, and ${problems.length - 1} more` : "";
    throw new Error(`${date}: the listing would make an invalid map: ${problems[0]}${more}`);
  }
  return { identifier, tracks };
}

/**
 * The map of one show, from the recording the page plays.
 *
 * @param date - The show date.
 * @param request - `politeClient(io).request`.
 * @param io - { decode, log }.
 * @param site - The site whose /api/playing route names the recording.
 * @throws When the site names no recording, a track fails to download or decode, or its decoded length is not its listed length.
 */
export async function analyseShow(date, request, io, site = SITE) {
  const { identifier, tracks } = await fetchPlaying(site, date, request);
  const listedTotal = tracks.reduce((sum, track) => sum + track.duration, 0);
  io.log(`${date}: the page plays ${identifier}, ${tracks.length} tracks, ${listedTotal} s listed`);

  let total = 0;
  const analysed = [];
  for (const [i, track] of tracks.entries()) {
    io.log(`  ${i + 1}/${tracks.length} ${track.title}: ${track.mp3Url}`);
    let bytes = 0;
    const analysis = await request(track.mp3Url, async (res) => {
      bytes = 0;
      const analyser = createAnalyser();
      await io.decode(
        res.body,
        (k) => {
          bytes += k;
        },
        (pcm) => analyser.push(pcm)
      );
      // A body that ends early is a cut download. A compressed one is decoded on the way in, so its length says nothing.
      const length = Number(res.headers.get("content-length"));
      if (!res.headers.has("content-encoding") && length > 0 && length !== bytes) {
        throw new Error(`fetched ${bytes} of ${length} bytes`);
      }
      return analyser.finish();
    });
    const decoded = analysis.duration;
    io.log(`    ${bytes} bytes fetched, ${decoded.toFixed(2)} s decoded, ${track.duration} s listed`);
    if (decoded === 0) throw new Error(`${track.title}: decoded no audio`);
    if (Math.abs(decoded - track.duration) > Math.max(2, 0.02 * track.duration)) {
      throw new Error(`${track.title}: ${decoded} s decoded, ${track.duration} s listed`);
    }
    total += bytes;
    analysed.push({ title: track.title, playingDuration: track.duration, analysis });
  }
  io.log(`${date}: ${total} bytes fetched`);
  return buildMap(date, identifier, analysed);
}

const USAGE = "Usage: node scripts/analyse-show.mjs --out DIR [--site URL] SHOW_DATE [SHOW_DATE]";

const nodeIO = {
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  sleep: (ms) => sleep(ms),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  decode: ffmpegDecode,
};

/**
 * Makes the map of each show date and writes it to DIR/<date>.json. A show that fails is reported and the others still run.
 *
 * @param args - ["--out", DIR, "--site", URL, date, ...], at most MAX_SHOWS dates; the site defaults to SITE.
 * @param io - { fetch, sleep, log, error, decode }.
 * @returns The exit code: 2 for a usage problem, 1 when a show failed, otherwise 0.
 */
export async function main(args, io = nodeIO) {
  const dates = [];
  let out;
  let site = SITE;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") out = args[++i];
    else if (args[i] === "--site") site = (args[++i] ?? "").replace(/\/+$/, "");
    else dates.push(args[i]);
  }
  const notDate = dates.find((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date));
  if (!out || dates.length === 0 || notDate !== undefined) {
    io.error(notDate !== undefined ? `Not a show date: ${notDate}` : USAGE);
    return 2;
  }
  // A site is an origin: a scheme and a host, nothing after.
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(site)) {
    io.error(`Not a site: ${site}`);
    return 2;
  }
  if (dates.length > MAX_SHOWS) {
    io.error(`At most ${MAX_SHOWS} shows a run, not ${dates.length}`);
    return 2;
  }
  await fs.mkdir(out, { recursive: true });
  const client = politeClient(io);
  let failed = false;
  for (const date of dates) {
    try {
      const { map, text } = await analyseShow(date, client.request, io, site);
      const problems = checkMap(map);
      if (problems.length > 0) throw new Error(`the map fails its schema: ${problems.join("; ")}`);
      await fs.writeFile(join(out, `${date}.json`), text);
      io.log(`${date}: map written, ${Buffer.byteLength(text)} bytes at ${map.step} s a step`);
    } catch (err) {
      io.error(`${date}: ${err instanceof Error ? err.message : err}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  );
}
