/* eslint-disable */

/* Layer 3 of the world is a precomputed map of each show, made in GitHub Actions from the recording the page plays and served at
   /maps/<show date>.json. checkMap is the map's schema: the analysis checks a map before writing it, the publish job before committing
   it, and loadMap before the world reads it.

   { v: 1, show, analysed, playing, step, tracks: [{ title, analysedDuration, playingDuration, env: { rms, bass, bright }, tempo, peaks }] }

   analysed and playing are the same archive.org identifier: each map comes from the files the page plays. step is the seconds each
   envelope byte covers, the smallest of STEPS that keeps the file within MAX_MAP_BYTES. env is base64 bytes, one per `step` seconds of
   the analysed track: loudness (rms), low end (bass) and spectral centroid (bright), each scaled so the track's 99th percentile is 255.
   tempo is base64 bytes, two per TEMPO_WINDOW seconds: beats per minute (60-200; 0 where unknown) and a confidence (0-255). peaks are
   [second, strength] where the track's 15-s-smoothed loudness swells, in time order, at most MAX_PEAKS; strength is that smoothed
   loudness at the peak, 0-1 of the track's 99th percentile. */

export const MAP_VERSION = 1;
/* The most a map file may weigh; the analysis picks the finest step that fits. */
export const MAX_MAP_BYTES = 40 * 1024;
/* The seconds an envelope byte may cover, finest first. */
export const STEPS = [1, 2, 4, 8];
/* Seconds of the analysed track under each tempo reading. */
export const TEMPO_WINDOW = 10;
/* The most peaks a track keeps. */
export const MAX_PEAKS = 40;
/* The seconds before a peak over which buildUp rises from 0 to 1. */
export const BUILD_UP = 20;

const MAX_TRACKS = 200;
const MAX_TITLE = 300;
const MAX_SECONDS = 86400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER = /^[A-Za-z0-9._-]{1,200}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAP_KEYS = ["v", "show", "analysed", "playing", "step", "tracks"];
const TRACK_KEYS = ["title", "analysedDuration", "playingDuration", "env", "tempo", "peaks"];
const ENV_KEYS = ["rms", "bass", "bright"];

const isObject = (value) => Object.prototype.toString.call(value) === "[object Object]";
const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);

/* A value as a problem message quotes it: strings and objects as JSON, cut short. */
function shown(value) {
  const text = typeof value === "string" || (typeof value === "object" && value !== null) ? JSON.stringify(value) : String(value);
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* Reports each of `keys` the object lacks and each key of it that `keys` does not name. */
function checkKeys(object, keys, path, add) {
  const at = (key) => (path ? `${path}.${key}` : key);
  for (const key of keys) if (!Object.hasOwn(object, key)) add(`${at(key)} is missing`);
  for (const key of Object.keys(object)) if (!keys.includes(key)) add(`${at(key)} is unexpected`);
}

const isDuration = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_SECONDS;

/* The bytes of a base64 string, or null (reported) when it is not base64. `length` is the byte count it must have, or null to skip that. */
function checkBytes(value, path, length, add) {
  if (typeof value !== "string" || !BASE64.test(value)) {
    add(`${path} is not base64`);
    return null;
  }
  const bytes = decode(value);
  if (length !== null && bytes.length !== length) add(`${path} has ${bytes.length} bytes, not ${length}`);
  return bytes;
}

/* `seconds` is the track's analysed duration when it is valid, else null: what depends on it is then left unchecked. */
function checkPeaks(peaks, path, seconds, add) {
  if (!Array.isArray(peaks)) return add(`${path} is not an array`);
  if (peaks.length > MAX_PEAKS) return add(`${path} has ${peaks.length} entries, more than ${MAX_PEAKS}`);
  let latest = -1;
  peaks.forEach((peak, i) => {
    if (!Array.isArray(peak) || peak.length !== 2) return add(`${path}[${i}] is not [second, strength]`);
    const [t, s] = peak;
    if (!Number.isInteger(t) || t < 0 || (seconds !== null && t >= seconds)) {
      add(`${path}[${i}][0] is ${shown(t)}, not a whole second ${seconds !== null ? `before ${seconds}` : "from 0"}`);
    } else {
      if (t <= latest) add(`${path}[${i}][0] is ${t}, not after ${latest}`);
      latest = Math.max(latest, t);
    }
    if (typeof s !== "number" || !Number.isFinite(s) || s < 0 || s > 1) add(`${path}[${i}][1] is ${shown(s)}, not 0 to 1`);
  });
}

function checkTrack(track, path, step, add) {
  if (!isObject(track)) return add(`${path} is not an object`);
  checkKeys(track, TRACK_KEYS, path, add);
  const has = (key) => Object.hasOwn(track, key);
  if (has("title") && !(typeof track.title === "string" && track.title.length >= 1 && track.title.length <= MAX_TITLE)) {
    add(`${path}.title is not a string of 1 to ${MAX_TITLE} characters`);
  }
  for (const key of ["analysedDuration", "playingDuration"]) {
    if (has(key) && !isDuration(track[key])) add(`${path}.${key} is ${shown(track[key])}, not above 0 and up to ${MAX_SECONDS} seconds`);
  }
  /* What is measured against the analysed duration waits on it being valid, and the envelope also on a valid step. */
  const seconds = has("analysedDuration") && isDuration(track.analysedDuration) ? track.analysedDuration : null;
  if (has("env")) {
    if (!isObject(track.env)) add(`${path}.env is not an object`);
    else {
      checkKeys(track.env, ENV_KEYS, `${path}.env`, add);
      const length = seconds !== null && step !== null ? Math.ceil(seconds / step) : null;
      for (const key of ENV_KEYS) if (Object.hasOwn(track.env, key)) checkBytes(track.env[key], `${path}.env.${key}`, length, add);
    }
  }
  if (has("tempo")) {
    const bytes = checkBytes(track.tempo, `${path}.tempo`, seconds !== null ? 2 * Math.ceil(seconds / TEMPO_WINDOW) : null, add);
    /* The even bytes are the tempos; the first outside 60-200 is reported, not every one. */
    for (let i = 0; bytes && i < bytes.length; i += 2) {
      if (bytes[i] !== 0 && (bytes[i] < 60 || bytes[i] > 200)) {
        add(`${path}.tempo byte ${i} is ${bytes[i]}, not 0 or 60 to 200`);
        break;
      }
    }
  }
  if (has("peaks")) checkPeaks(track.peaks, `${path}.peaks`, seconds, add);
}

/* The problems with a map, each starting with the path it is about; empty when the map is valid. */
export function checkMap(map) {
  if (!isObject(map)) return ["map is not an object"];
  const problems = [];
  const add = (problem) => {
    problems.push(problem);
  };
  checkKeys(map, MAP_KEYS, "", add);
  const has = (key) => Object.hasOwn(map, key);
  if (has("v") && map.v !== MAP_VERSION) add(`v is ${shown(map.v)}, not ${MAP_VERSION}`);
  if (has("show") && !(typeof map.show === "string" && DATE.test(map.show) && !isNaN(Date.parse(map.show)))) {
    add(`show is ${shown(map.show)}, not a YYYY-MM-DD date`);
  }
  if (has("analysed") && !(typeof map.analysed === "string" && IDENTIFIER.test(map.analysed))) {
    add(`analysed is ${shown(map.analysed)}, not an archive.org identifier`);
  }
  if (has("playing") && map.playing !== map.analysed) add("playing is not the analysed recording");
  const step = STEPS.includes(map.step) ? map.step : null;
  if (has("step") && step === null) add(`step is ${shown(map.step)}, not one of ${STEPS.join(", ")}`);
  if (has("tracks")) {
    const { tracks } = map;
    if (!Array.isArray(tracks)) add("tracks is not an array");
    else if (tracks.length < 1 || tracks.length > MAX_TRACKS) add(`tracks has ${tracks.length} entries, not 1 to ${MAX_TRACKS}`);
    else tracks.forEach((track, i) => checkTrack(track, `tracks[${i}]`, step, add));
  }
  return problems;
}

/* A checked map for use: each series decoded once to bytes, and the step copied onto each track. */
export function readMap(map) {
  return {
    show: map.show,
    playing: map.playing,
    step: map.step,
    tracks: map.tracks.map((track) => ({
      title: track.title,
      analysedDuration: track.analysedDuration,
      playingDuration: track.playingDuration,
      step: map.step,
      rms: decode(track.env.rms),
      bass: decode(track.env.bass),
      bright: decode(track.env.bright),
      tempo: decode(track.tempo),
      peaks: track.peaks,
    })),
  };
}

/* The analysed and playing files can differ in length; the map stretches linearly between them. */
export const analysedTime = (track, t) => (t * track.analysedDuration) / track.playingDuration;
export const playingTime = (track, t) => (t * track.playingDuration) / track.analysedDuration;

/* Loudness, low end and brightness (0-1) at playing time t; before the track the first sample, after it the last. */
export function envAt(track, t) {
  const i = clamp(Math.floor(analysedTime(track, t) / track.step), 0, track.rms.length - 1);
  return { rms: track.rms[i] / 255, bass: track.bass[i] / 255, bright: track.bright[i] / 255 };
}

/* The beat at playing time t as { bpm, confidence (0-1) }, or null where the window's tempo is unknown. */
export function tempoAt(track, t) {
  const w = clamp(Math.floor(analysedTime(track, t) / TEMPO_WINDOW), 0, (track.tempo.length >> 1) - 1);
  return track.tempo[2 * w] === 0 ? null : { bpm: track.tempo[2 * w], confidence: track.tempo[2 * w + 1] / 255 };
}

/* 0-1: the next peak at or after playing time t, over the BUILD_UP seconds before it. It rises linearly to 1 at the peak and is 0 once the
   peak has passed. */
export function buildUp(track, t) {
  for (const [second] of track.peaks) {
    const ahead = playingTime(track, second) - t;
    if (ahead >= 0) return ahead > BUILD_UP ? 0 : 1 - ahead / BUILD_UP;
  }
  return 0;
}

/* Why a map's tracks are not the page's, or null when they are the same tracks. Relisten can change a show's sources after its map was
   made, and a map of other tracks would be read against the wrong times. */
function otherTracks(mapTracks, pageTracks) {
  if (mapTracks.length !== pageTracks.length) return `it has ${mapTracks.length} tracks, the page ${pageTracks.length}`;
  for (let i = 0; i < pageTracks.length; i++) {
    const mapped = mapTracks[i], page = pageTracks[i];
    if (mapped.title !== page.title) return `track ${i + 1} is "${mapped.title}", the page's "${page.title}"`;
    if (!(Math.abs(mapped.playingDuration - page.duration) < 0.5)) {
      return `track ${i + 1} lasts ${mapped.playingDuration} s, the page's ${page.duration} s`;
    }
  }
  return null;
}

/* The map of the show the world plays (data is { showDate, tracks: [{ title, duration }] }), read for use; null when there is none to use.
   A day without a map is normal, so that is silent; a failed fetch, unparseable JSON, a map that fails checkMap and a map of other tracks
   than the page's each warn. */
export async function loadMap(data, fetchMap = (url) => fetch(url)) {
  const url = `/maps/${data.showDate}.json`;
  const skip = (reason) => {
    console.warn(`map ${url}: ${reason}`);
    return null;
  };
  let map;
  try {
    const res = await fetchMap(url);
    if (!res.ok) return null;
    map = await res.json();
  } catch (err) {
    return skip(err instanceof Error ? err.message : String(err));
  }
  const problems = checkMap(map);
  if (problems.length > 0) return skip(problems[0]);
  const other = otherTracks(map.tracks, data.tracks);
  return other ? skip(other) : readMap(map);
}
