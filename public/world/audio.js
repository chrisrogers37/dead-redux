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

/* The listener stands at `pos` and faces where the camera looks, with the camera's up. It reads the camera's world matrix, so it is
   called after the frame renders. The listener's AudioParams where the browser has them, else its older setters. */
export function listen(pos, camera) {
  if (!ctx) return;
  const l = ctx.listener, m = camera.matrixWorld.elements;
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

/* For the stats: the context's state (null before the first move) and how many elements play through the graph. */
export const soundStats = () => ({ context: ctx?.state ?? null, routed: [...slots.values()].filter((s) => s.source).length });
