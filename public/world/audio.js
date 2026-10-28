/* eslint-disable */

/* The show's sound graph, which the world owns, since it owns where the listener stands. An audio element is routed into it once both
   have happened: the context exists and runs (it is made on the first move), and the element has loaded its metadata with crossOrigin
   set, which proves its CORS check passed. Once routed, an element sounds only through the graph, so an element without crossOrigin (the
   player's fallback) is never routed: it plays plain stereo. In the graph the element feeds an analyser on the dry signal, then a dry
   path at 0.35 that sounds the same everywhere and a path at 0.65 placed at the stage, louder near it and moving between the ears as the
   listener turns. The world tells the player how each element sounds (world:routing). */

/* Whether phones route the show through Web Audio; false makes phones play plain stereo. */
export const PHONE_ROUTES_WEB_AUDIO = true;

/* What happens to an element: "plain" when it will never be routed (this device plays plain stereo, or the element has no
   crossOrigin); "route" once the context runs and the element's metadata has loaded with crossOrigin; else "wait". */
export function verdict({ routes, cors, running, metadata }) {
  if (!routes || !cors) return "plain";
  return running && metadata ? "route" : "wait";
}

let ctx = null, analyser = null, panner = null, routes = false, stage = null;
/* Each slot's element by its id, with its source node once it is routed. */
const slots = new Map();
const resume = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); };
/* Tells the player how an element sounds: "webaudio" once routed, "plain" when it never will be. */
const report = (el, routing) => document.dispatchEvent(new CustomEvent("world:routing", { detail: { el, routing } }));

/* The AudioContext and its graph, made on the first move inside the activating event. It resumes then, on any later gesture while it is
   not running (one made after the first move, or one the system interrupted), and whenever the page comes back into view. */
function ensureContext() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "playback" });
    analyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.8 });
    panner = new PannerNode(ctx, {
      panningModel: "equalpower", distanceModel: "inverse", refDistance: 12, maxDistance: 300, rolloffFactor: 0.6,
      coneInnerAngle: 120, coneOuterAngle: 300, coneOuterGain: 0.5,
      positionX: stage.x, positionY: stage.y, positionZ: stage.z,
      orientationX: stage.facing[0], orientationY: stage.facing[1], orientationZ: stage.facing[2],
    });
    const master = new GainNode(ctx);
    master.connect(ctx.destination);
    analyser.connect(new GainNode(ctx, { gain: 0.35 })).connect(master);
    analyser.connect(panner).connect(new GainNode(ctx, { gain: 0.65 })).connect(master);
    ctx.addEventListener("statechange", routeAll);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });
  }
  resume();
}

/* Routes a slot's element when both conditions hold, once; reports one that never will be routed. */
function consider(el) {
  const slot = slots.get(el.id);
  if (slot?.el !== el || slot.source) return;
  const v = verdict({ routes, cors: el.crossOrigin === "anonymous", running: ctx?.state === "running", metadata: el.readyState >= HTMLMediaElement.HAVE_METADATA });
  if (v === "plain") report(el, "plain");
  if (v !== "route") return;
  slot.source = ctx.createMediaElementSource(el);
  slot.source.connect(analyser);
  report(el, "webaudio");
}
function routeAll() {
  for (const { el } of slots.values()) consider(el);
}

/* An element the player mounted. A re-mount replaces its slot's element; the old one's source, if it was routed, leaves the graph. */
function adopt(el) {
  const old = slots.get(el.id);
  if (old?.el === el) return;
  old?.source?.disconnect();
  slots.set(el.id, { el, source: null });
  el.addEventListener("loadedmetadata", () => consider(el));
  consider(el);
}

/* Starts the sound at boot: places the stage's sound, takes the player's two elements (mounted before the world loaded), and listens
   for the first move and for re-mounts. A first move made before the world loaded found no listener, so the context is made now and,
   if it cannot start yet, resumes on the next gesture. */
export function startSound(at, phone) {
  stage = at;
  routes = !!window.AudioContext && (!phone || PHONE_ROUTES_WEB_AUDIO);
  for (const id of ["show-audio-a", "show-audio-b"]) {
    const el = document.getElementById(id);
    if (el) adopt(el);
  }
  document.addEventListener("player:element", (e) => adopt(e.detail.el));
  if (!routes) return;
  document.addEventListener("player:start", () => { ensureContext(); routeAll(); });
  for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, () => { if (ctx) resume(); }, true);
  if (document.querySelector("main")?.dataset.joined === "true") ensureContext();
}

/* Where the listener stands: at the visitor's bear's head in third person, at the camera in first. `head` is the point the bear moves,
   not a copy, so the listener goes wherever the bear goes. */
export const listenerAt = (third, head, camera) => (third ? head : camera.position);

/* The listener stands where the view puts it (listenerAt) and faces where the camera looks, with the camera's up. It reads the camera's
   world matrix, so it is called after the frame renders. The listener's AudioParams where the browser has them, else its older
   setters. */
export function listen(third, head, camera) {
  if (!ctx) return;
  const pos = listenerAt(third, head, camera), l = ctx.listener, m = camera.matrixWorld.elements;
  const fx = -m[8], fy = -m[9], fz = -m[10], ux = m[4], uy = m[5], uz = m[6];
  if (l.positionX) {
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
    l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fx, fy, fz, ux, uy, uz);
  }
}

/* For the stats: the context's state (null before the first move), how many elements play through the graph, and where the listener
   stands, read back from its AudioParams to the centimetre (null before the first move, or where the browser has only the setters). */
export const soundStats = () => {
  const l = ctx?.listener;
  const listener = l?.positionX ? [l.positionX.value, l.positionY.value, l.positionZ.value].map((v) => Math.round(v * 100) / 100) : null;
  return { context: ctx?.state ?? null, routed: [...slots.values()].filter((s) => s.source).length, listener };
};

/* Layer 2: the live sound, read from the analyser above. Each value smooths per read and then reads against a running reference, the
   highest it has been lately, so loudness, low end and brightness each run 0-1 as a fraction of the show's recent loud, low or bright
   end, as a layer-3 map's envelopes are fractions of their track's 99th percentile. */
const READ_MS = 33;
/* Seconds for a reference to halve while nothing reaches it. */
const HALF_LIFE = 30;
/* How far each value moves toward a read: loudness and the low end quickly, brightness slowly. */
const SMOOTH = { loud: 0.25, bass: 0.25, bright: 0.1 };
/* Under its floor a value reads as a fraction of the floor: loudness's RMS of 0.01 is -40 dBFS, and the low end's floor is -70 dB. */
const FLOORS = { loud: 0.01, bass: 10 ** (-70 / 20), bright: 0.05 };

/* The FFT bin nearest a frequency, within the spectrum: a frequency past its last bin, as 8 kHz is at a sample rate of 16 kHz or less,
   gives the last bin. */
export const binOf = (hz, sampleRate, fftSize) => Math.min(fftSize / 2 - 1, Math.round(hz / (sampleRate / fftSize)));

/* The root mean square of a block of samples. */
export function rmsOf(samples) {
  let sum = 0;
  for (const x of samples) sum += x * x;
  return Math.sqrt(sum / samples.length);
}

/* The mean linear magnitude over bins lo to hi of a spectrum in dB, as getFloatFrequencyData gives it. */
export function bassOf(db, lo, hi) {
  let sum = 0;
  for (let k = lo; k <= hi; k++) sum += 10 ** (db[k] / 20);
  return sum / (hi - lo + 1);
}

/* The spectral centroid over bins 1 to hi, weighted by linear magnitude, as a fraction of bin hi; 0 for a silent spectrum. */
export function brightOf(db, hi) {
  let sum = 0, moment = 0;
  for (let k = 1; k <= hi; k++) {
    const m = 10 ** (db[k] / 20);
    sum += m;
    moment += k * m;
  }
  return sum > 0 ? moment / sum / hi : 0;
}

/* One read: each raw value (loudness's is the RMS) smooths into its level, each reference follows its level, and the drive is each level
   against its reference, at most 1 since a reference never falls below its level. `dt` is the seconds since the previous read (Infinity
   for the first, so the references start at the levels). Near-silence still has a spectrum with a centroid, so under loudness's floor the
   raw brightness fades with the RMS: silence reads no brightness, and its centroid never reaches brightness's reference. */
export function readStep({ level, ref }, raw, dt) {
  const heard = { ...raw, bright: raw.bright * Math.min(1, raw.loud / FLOORS.loud) };
  const next = {}, held = {}, drive = { source: "analyser" };
  for (const k of ["loud", "bass", "bright"]) {
    next[k] = level[k] + (heard[k] - level[k]) * SMOOTH[k];
    held[k] = Math.max(next[k], ref[k] * 0.5 ** (dt / HALF_LIFE));
    drive[k] = next[k] / Math.max(held[k], FLOORS[k]);
  }
  return { level: next, ref: held, drive };
}

/* The levels, their references and the last drive; the reads so far and the last one's time; and the buffers and bins, made at the first
   read, once the context's sample rate is known. */
let state = { level: { loud: 0, bass: 0, bright: 0 }, ref: { loud: 0, bass: 0, bright: 0 }, drive: null };
let reads = 0, lastRead = -Infinity, samples = null, spectrum = null, bins = null;
/* Whether a routed element is playing with data to play: one that waits for data (a stalled stream) is neither paused nor sounding. */
const sounding = () => {
  for (const s of slots.values()) if (s.source && !s.el.paused && !s.el.ended && s.el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return true;
  return false;
};

/* Layer 2's drive for this frame, { loud, bass, bright, source }, or null while nothing plays through the graph: before the first move,
   while the show is paused or its stream waits for data, while the system holds the context suspended, and on a device or an element
   that plays plain. It reads the analyser at most every READ_MS and gives the last reading in between. The frame loop calls it, so it
   never reads in a hidden tab, and never under reduced motion, where nothing calls it. */
export function analyse(now) {
  if (ctx?.state !== "running" || !sounding()) return null;
  if (now - lastRead >= READ_MS) {
    if (!samples) {
      samples = new Float32Array(analyser.fftSize);
      spectrum = new Float32Array(analyser.frequencyBinCount);
      /* The low end's bins, 43 to 344 Hz, and brightness's top bin, 8 kHz or the spectrum's last. */
      bins = [43, 344, 8000].map((hz) => binOf(hz, ctx.sampleRate, analyser.fftSize));
    }
    analyser.getFloatTimeDomainData(samples);
    analyser.getFloatFrequencyData(spectrum);
    state = readStep(state, { loud: rmsOf(samples), bass: bassOf(spectrum, bins[0], bins[1]), bright: brightOf(spectrum, bins[2]) }, (now - lastRead) / 1000);
    lastRead = now;
    reads += 1;
  }
  return state.drive;
}

/* For the stats: the reads since boot, the smoothed RMS before its reference, and the last drive's values. */
export function analysisStats() {
  const r = (x) => Math.round(x * 1000) / 1000;
  const d = state.drive;
  return { reads, rms: r(state.level.loud), loud: r(d?.loud ?? 0), bass: r(d?.bass ?? 0), bright: r(d?.bright ?? 0) };
}

const lerp = (a, b, t) => a + (b - a) * t;
/* What layer 2 does to the world, from the last drive heard (null for none) and how far the world follows it (`weight`, 0-1): factors on
   the sky's energy, the hemisphere light, the stage light, the panel's colour and the flame's light, each multiplying that one's own
   value; the amber mix; and the bears' leg rate (rad/s) and swing (rad). At weight 0 every factor is 1, the mix 0 and the legs as they
   were, exactly. */
export function mappings(drive, weight) {
  const L = drive?.loud ?? 0, B = drive?.bass ?? 0, R = drive?.bright ?? 0;
  return {
    energy: lerp(1, 0.6 + 0.8 * L, weight),
    hemi: lerp(1, 0.9 + 0.2 * L, weight),
    stage: lerp(1, 0.4 + 1.6 * B, weight),
    panel: lerp(1, 0.6 + 0.6 * L, weight),
    flame: lerp(1, 0.5 + 1.5 * B, weight),
    amber: 0.3 * R * weight,
    rate: lerp(6, 6 + 6 * L, weight),
    amp: lerp(0.5, 0.35 + 0.3 * B, weight),
  };
}
