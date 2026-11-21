/* eslint-disable */
import { isDrums, isSpace } from "./seats.js";

/* Dusk to Dawn: the show carries the island through one night. Set 1 opens in the last light, the dark is deepest through Drums and
   Space, and the encore plays at first light. This is the night as plain numbers, with no three import, so the unit tests load it: the
   hour the show clock stands at (nightPlan), how the world follows it (followHour) and what the island looks like at it (lookAt). The
   sky, the lights and the sea draw the look (sky.js, island.js, main.js). */

/* The night's hours: 0 at the show's start, in the last light; SET_BREAK where set 2 begins, the dusk gone; DEEP through Drums and
   Space; FIRST_LIGHT where the encore begins; DAYBREAK at the show's end. */
export const SET_BREAK = 0.6, DEEP = 1, FIRST_LIGHT = 1.7, DAYBREAK = 2;
/* A show whose notes mark no set 2 takes its break at this share of its tracks, as the show's energy does (main.js energyOf), and a
   show with no Drums or Space is at its darkest this far from set 2's start to the encore's. */
const BREAK_AT = 0.37, DEEP_AT = 0.6;

/* The night of a show: `hourAt(seconds)` is the hour at a place in the show, in seconds from its start, and `hourOf(index)` the hour a
   track begins at. The hour runs straight between the show's marks: its start, set 2's start, Drums and Space (the first run of them
   in set 2, held at DEEP from its first second to its last), the encore's start and the show's end. Where the notes mark no set 2 or
   no encore, the break falls at BREAK_AT of the tracks and the last track is the encore, as the rest of the world takes them. A mark
   that does not come after the mark before it is left out, so the hour never runs back as the show plays on. */
export function nightPlan(tracks, set2Start, encoreStart) {
  const n = tracks.length, starts = [];
  let total = 0;
  for (const t of tracks) { starts.push(total); total += t.duration; }
  const startOf = (i) => (i >= n ? total : starts[Math.max(0, i)]);
  const second = set2Start ?? Math.floor(n * BREAK_AT);
  const encore = encoreStart ?? n - 1;
  let from = -1, to = -1;
  for (let i = second; i < n && to < 0; i++) {
    const held = isDrums(tracks[i].title) || isSpace(tracks[i].title);
    if (held && from < 0) from = i;
    else if (!held && from >= 0) to = i;
  }
  const deepest = startOf(second) + DEEP_AT * (startOf(encore) - startOf(second));
  const marks = [[0, 0], [startOf(second), SET_BREAK], [from < 0 ? deepest : startOf(from), DEEP], [from < 0 ? deepest : startOf(to < 0 ? n : to), DEEP],
    [startOf(encore), FIRST_LIGHT], [total, DAYBREAK]];
  const kept = [marks[0]];
  for (const m of marks.slice(1)) if (m[0] > kept[kept.length - 1][0]) kept.push(m);
  function hourAt(seconds) {
    if (!(seconds > 0)) return kept[0][1];
    for (let k = 1; k < kept.length; k++) {
      const [t0, h0] = kept[k - 1], [t1, h1] = kept[k];
      if (seconds < t1) return h0 + ((h1 - h0) * (seconds - t0)) / (t1 - t0);
    }
    return kept[kept.length - 1][1];
  }
  return { hourAt, hourOf: (index) => hourAt(startOf(index)), marks: kept };
}

/* The world's hour follows the show's with a time constant of HOUR_TAU seconds and at most HOUR_RATE hours a second. While the show
   plays the hour moves a few thousandths a second, and the world keeps to it. A seek, a skipped song or a join mid-show moves the
   show's hour at once: the world then passes through the hours between, a night from dusk to dawn in about seven seconds, so the light
   never steps. */
export const HOUR_TAU = 0.9, HOUR_RATE = 0.45;
export function followHour(hour, target, dt) {
  const most = HOUR_RATE * dt;
  return hour + Math.max(-most, Math.min(most, (target - hour) * (1 - Math.exp(-dt / HOUR_TAU))));
}

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
/* A unit vector toward a point of the sky, `az` degrees east of north and `el` degrees above the horizon: north is -z and east +x
   (the opening looks down on the island with north up the screen). */
const toward = (az, el) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
/* The sun sets in the north-west, to the left of the crowd as it faces the stage, and rises in the north-east, behind the stage and a
   little to its right, as it does on a summer night this far north. */
const SUNSET = 303, SUNRISE = 57;

/* The looks, by the hour. Every colour is as the screen shows it. Each look holds:
   - the sky: its colour overhead (`zenith`) and at the horizon (`horizon`); twilight's glow at the horizon, in its colour times its
     strength (`glow`), toward `glowTo` ([x, z]); how far the liquid light shows (`liquid`, 1 the whole sky) and the stars (`stars`); and
     the sun's height in degrees (`disc`), under the horizon until daybreak;
   - the air: what the far sea and the ground fade to (`haze`), and the water's own colour (`sea`);
   - the lights: the sky's light on the ground, its colour from above (`ambient`) and from below (`ground`) and its strength as a factor
     on the hemisphere light's own (`ambientGain`); the key light, the low sun at dusk and at dawn and the moon between, its colour
     (`key`), its factor on the sun's own strength (`keyGain`) and the way to it (`keyTo`);
   - the stage: the steady light the night adds to its own, as a share of it (`stageLift`), how far its light reaches in metres
     (`reach`), and its glow on the ground before it and on the sea behind it (`shine`);
   - and how dark the island is, 0 to 1 (`dark`). */
const LOOKS = [
  /* The last light: the sun is just down, the sky still burns and the ground is warm. */
  { hour: 0, zenith: 0x2b2452, horizon: 0x8c4f5e, glow: 0xff8a3a, glowGain: 1, glowTo: SUNSET, liquid: 0.9, stars: 0, disc: -4, haze: 0x4a3142,
    sea: 0x1e1b30, ambient: 0xd9a27c, ground: 0x241a16, ambientGain: 0.62, key: 0xffa25e, keyGain: 1, keyTo: toward(SUNSET, 14), stageLift: 0,
    reach: 40, shine: 0.15, dark: 0.15 },
  /* The blue hour: an ember at the horizon, the first stars. */
  { hour: 0.5, zenith: 0x0e1230, horizon: 0x2a3058, glow: 0xc4502e, glowGain: 0.55, glowTo: SUNSET, liquid: 0.5, stars: 0.3, disc: -8, haze: 0x161a30,
    sea: 0x0c1020, ambient: 0x5a6aa6, ground: 0x10121a, ambientGain: 0.3, key: 0x8090c0, keyGain: 0.08, keyTo: toward(SUNSET, 20), stageLift: 0.5,
    reach: 50, shine: 0.6, dark: 0.6 },
  /* The deep of the night, through Drums and Space: the island is dark under the stars, and the stage is the light. */
  { hour: DEEP, zenith: 0x03040a, horizon: 0x0a0f1e, glow: 0x000000, glowGain: 0, glowTo: 0, liquid: 0.28, stars: 1, disc: -18, haze: 0x05070e,
    sea: 0x04060c, ambient: 0x4a5a8c, ground: 0x06070c, ambientGain: 0.18, key: 0x9db4e8, keyGain: 0.34, keyTo: toward(180, 55), stageLift: 1,
    reach: 60, shine: 1, dark: 1 },
  /* Before dawn: a cold, pale band where the sun will rise. */
  { hour: 1.4, zenith: 0x060a18, horizon: 0x16233e, glow: 0x3a5a8a, glowGain: 0.5, glowTo: SUNRISE, liquid: 0.25, stars: 0.75, disc: -12, haze: 0x0b1120,
    sea: 0x070b16, ambient: 0x55689c, ground: 0x08090f, ambientGain: 0.22, key: 0x9db4e8, keyGain: 0.26, keyTo: toward(140, 45), stageLift: 0.8,
    reach: 60, shine: 0.9, dark: 0.9 },
  /* First light, as the encore begins: the sky pales, rose and gold where the sun will rise, and the land comes back, cool. */
  { hour: FIRST_LIGHT, zenith: 0x1c2c56, horizon: 0x6a6a8e, glow: 0xff9466, glowGain: 0.7, glowTo: SUNRISE, liquid: 0.4, stars: 0.12, disc: -5, haze: 0x3a4060,
    sea: 0x33405f, ambient: 0x8ea2d4, ground: 0x1a1c24, ambientGain: 0.5, key: 0xffb49a, keyGain: 0.6, keyTo: toward(SUNRISE, 10), stageLift: 0.2,
    reach: 45, shine: 0.4, dark: 0.5 },
  /* Daybreak, at the show's end: the sun's edge comes over the sea behind the stage. */
  { hour: DAYBREAK, zenith: 0x3c5a96, horizon: 0xe6b08c, glow: 0xffc27a, glowGain: 0.8, glowTo: SUNRISE, liquid: 0.5, stars: 0, disc: 0.8, haze: 0x9a8a96,
    sea: 0x5b6f96, ambient: 0xc0cdea, ground: 0x2c2a2a, ambientGain: 0.9, key: 0xffc890, keyGain: 1.4, keyTo: toward(SUNRISE, 12), stageLift: 0,
    reach: 40, shine: 0.1, dark: 0.1 },
].map((k) => {
  const [gx, , gz] = toward(k.glowTo, 0);
  return { ...k, zenith: rgb(k.zenith), horizon: rgb(k.horizon), glow: rgb(k.glow).map((v) => v * k.glowGain), glowTo: [gx, gz], haze: rgb(k.haze),
    sea: rgb(k.sea), ambient: rgb(k.ambient), ground: rgb(k.ground), key: rgb(k.key) };
});
const COLOURS = ["zenith", "horizon", "glow", "haze", "sea", "ambient", "ground", "key"];
const NUMBERS = ["liquid", "stars", "disc", "ambientGain", "keyGain", "stageLift", "reach", "shine", "dark"];

/* A look to write into (lookAt), which starts as the first: the last light. */
export function newLook() {
  const look = { hour: 0, glowTo: new Float32Array(2), keyTo: new Float32Array(3) };
  for (const c of COLOURS) look[c] = new Float32Array(3);
  return lookAt(0, look);
}

/* Writes the look at an hour into `look` (newLook) and returns it: each value runs straight from the look before the hour to the one
   after it, and the two directions are of length 1. It makes nothing, so a frame boxes no number. */
export function lookAt(hour, look) {
  const h = Math.max(0, Math.min(DAYBREAK, hour));
  let k = 1;
  while (k < LOOKS.length - 1 && h > LOOKS[k].hour) k += 1;
  const a = LOOKS[k - 1], b = LOOKS[k], t = (h - a.hour) / (b.hour - a.hour);
  look.hour = h;
  for (const c of COLOURS) for (let i = 0; i < 3; i++) look[c][i] = a[c][i] + (b[c][i] - a[c][i]) * t;
  for (const v of NUMBERS) look[v] = a[v] + (b[v] - a[v]) * t;
  /* A direction at a look with no glow counts for nothing, so the glow turns toward the next look that has one. */
  const ga = a.glowGain > 0 ? a.glowTo : b.glowTo, gb = b.glowGain > 0 ? b.glowTo : a.glowTo;
  unit(look.glowTo, ga, gb, t, 2);
  unit(look.keyTo, a.keyTo, b.keyTo, t, 3);
  return look;
}
/* `out` as the direction a share `t` of the way from `a` to `b`, of length 1; `a` where the two cancel. */
function unit(out, a, b, t, n) {
  let len = 0;
  for (let i = 0; i < n; i++) { out[i] = a[i] + (b[i] - a[i]) * t; len += out[i] * out[i]; }
  len = Math.sqrt(len);
  for (let i = 0; i < n; i++) out[i] = len > 1e-6 ? out[i] / len : a[i];
}
