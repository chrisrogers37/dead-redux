/* eslint-disable */
import * as THREE from "three";
import { MOON } from "./night.js";

/* The liquid light: a field of noise folded through itself, flowing with the world's time, more restless with the music's energy, with a
   drop's ring spreading through it, in the sky's colours, the second set apart by the first's dark veins and the whole washed toward amber
   by the music's brightness. Its octave count is a uniform the downgrade can lower, up to `octaves`. The sky plays it, and the stage's
   panel too (panelMaterial). `liquidV` holds the field's own value where it was last read, which the night's sky draws its ribbons
   from. */
const liquid = (octaves) => `
      uniform highp float uTime; uniform float uSeed, uEnergy, uAmber; uniform vec3 uC0, uC1, uC2, uDrop, uAmberColor;
      uniform int uOct;
      float liquidV;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < ${octaves}; i++) { if (i >= uOct) break; v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      vec3 liquid(vec2 p) {
        float t = uTime * 0.03 + uSeed;
        float w = 1.2 + 1.4 * uEnergy;
        vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(0.7 * t, 0.0)));
        vec2 r = vec2(fbm(p + w * q + vec2(1.7, 9.2) + 0.15 * t), fbm(p + w * q + vec2(8.3, 2.8) - 0.12 * t));
        float v = fbm(p + w * r);
        vec2 uv = p * 0.25 + 0.5;
        float dd = distance(uv, uDrop.xy);
        v += 0.3 * exp(-pow(abs((dd - 0.06 * uDrop.z) * 22.0), 2.0)) * exp(-uDrop.z * 0.4);
        liquidV = v;
        vec3 col = mix(uC0, uC1, clamp(v * 1.5 - 0.1, 0.0, 1.0));
        col = mix(col, uC2, clamp(length(q), 0.0, 1.0) * 0.6);
        return mix(col, uAmberColor, uAmber);
      }`;

/* The stars: the sky cut into cells STAR_CELLS to a radian, a star in STAR_SHARE of them, each a soft point at most STAR_SIZE of a cell
   across, most of them faint. They breathe by STAR_BREATH of their light, each at its own rate, the quickest once in 4 s, so no star
   blinks; with the world's time held, under reduced motion, they are still. The numbers are highp throughout: a phone's mediump float
   cannot tell one cell from the next. */
const STAR_CELLS = 70, STAR_SHARE = 0.3, STAR_SIZE = 0.22, STAR_BREATH = 0.18;
const f = (v) => v.toFixed(4);
const STARS = `
      highp float starHash(highp vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float stars(highp vec3 d, highp float time) {
        highp vec3 p = d * ${f(STAR_CELLS)}, cell = floor(p);
        highp float pick = starHash(cell);
        if (pick > ${f(STAR_SHARE)}) return 0.0;
        highp vec3 at = cell + 0.5 + 0.56 * (vec3(starHash(cell + 17.0), starHash(cell + 31.0), starHash(cell + 47.0)) - 0.5);
        highp float rank = pick / ${f(STAR_SHARE)}, phase = starHash(cell + 59.0);
        float light = 0.22 + 0.78 * rank * rank * rank * rank;
        float breath = 1.0 - ${f(STAR_BREATH)} * (0.5 + 0.5 * sin(time * (0.5 + phase) + 6.2832 * phase));
        return light * breath * smoothstep(${f(STAR_SIZE)}, ${f(STAR_SIZE * 0.25)}, distance(p, at));
      }`;

/* The sky. Its air runs from the horizon's colour up to the zenith's, with twilight's glow along the horizon toward where the sun set
   or will rise, the moon between them and, at daybreak, the sun's own edge; the liquid light plays over it as far as the hour lets it, the whole sky at dusk
   and only its brighter ribbons in the dark, where the stars show between them; and under the horizon it fades into the haze the far
   sea fades into (the scene's fog). The night's look (night.js) sets all of it through `grade`.
   Its two lights: the hemisphere light, the sky's own light on the ground, and the key light, the low sun at dusk and at dawn and the
   moon between, whose shadow the stage aims; and the stage panel's material, which plays the same liquid light (panelMaterial). */
export function buildSky(scene, octaves, seed) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: seed }, uEnergy: { value: 0.5 }, uOct: { value: octaves },
      uC0: { value: new THREE.Color(0xe8b04b) }, uC1: { value: new THREE.Color(0xd6508a) }, uC2: { value: new THREE.Color(0x3a2238) }, uPage: { value: new THREE.Color(0x0b0b0d) },
      uDrop: { value: new THREE.Vector3(0.5, 0.5, 99) },
      uAmber: { value: 0 }, uAmberColor: { value: new THREE.Color(0xe8b04b) },
      /* The night's: the air's colours, the glow's colour and where it lies ([x, z], and the sun's height in radians), and how far the
         liquid light, the stars and the moon show. */
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(0, -1, 0) }, uLiquid: { value: 1 }, uStars: { value: 0 }, uMoon: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      varying highp vec3 vDir;
      uniform vec3 uZenith, uHorizon, uHaze, uGlow;
      uniform highp vec3 uSun;
      uniform float uLiquid, uStars, uMoon;
      ${liquid(octaves)}
      ${STARS}
      void main() {
        highp vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(up, 0.6)));
        /* Twilight: a wide arch of the glow's colour over where the sun is, and a brighter band low along the horizon there. */
        float facing = 0.5 + 0.5 * dot(normalize(d.xz + vec2(1e-4)), uSun.xy);
        sky += uGlow * (0.36 * pow(facing, 3.0) * exp(-up * 3.5) + 0.6 * pow(facing, 24.0) * exp(-up * 9.0));
        /* The sun's edge, 1.3 degrees across, whitening the glow. */
        float cosEl = cos(uSun.z);
        float disc = smoothstep(0.99955, 0.99985, dot(d, vec3(uSun.x * cosEl, sin(uSun.z), uSun.y * cosEl)));
        sky = mix(min(sky, vec3(1.0)), vec3(1.0, 0.97, 0.86), disc);
        /* The moon, 1.8 degrees across in a soft halo, as far as the hour shows it. */
        highp float toMoon = dot(d, vec3(${MOON.map(f).join(", ")}));
        float moon = uMoon * smoothstep(0.99975, 0.99988, toMoon);
        sky += uMoon * vec3(0.16, 0.19, 0.27) * pow(max(toMoon, 0.0), 220.0);
        sky = mix(sky, vec3(0.93, 0.95, 1.0), moon);
        /* The liquid light, fading toward the horizon as it always has. Its ribbons are the upper part of its field, measured against
           the most the octaves in use can reach, so a tier with fewer octaves has as many. */
        vec3 light = liquid(d.xz / (d.y + 0.35) * 1.2);
        float ribbons = smoothstep(0.405, 0.77, liquidV / (1.0 - pow(0.5, float(uOct))));
        float show = smoothstep(-0.05, 0.3, d.y) * min(1.0, mix(1.6 * uLiquid * ribbons, 1.0, uLiquid * uLiquid)) * (1.0 - disc) * (1.0 - moon);
        sky += uStars * stars(d, uTime) * (1.0 - show) * smoothstep(0.02, 0.14, d.y);
        sky = mix(sky, light, show);
        /* Under the horizon all is haze, which the far sea has faded into by its edge; the sky rises out of it over two degrees. */
        gl_FragColor = vec4(mix(uHaze, sky, smoothstep(0.0, 0.035, d.y)), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), skyMat));
  /* Light intensities are in physical units, so the soft daylight look needs a factor of pi. The night scales both (main.js). */
  const hemi = new THREE.HemisphereLight(0xe8b04b, 0x1a1613, 1.1 * Math.PI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.5 * Math.PI);
  sun.position.set(60, 100, 40);
  scene.add(sun);
  /* The key light's own strength, how far it stands from what it aims at, and the way to it when the stage's shadow was last drawn. */
  const keyBase = sun.intensity, keyFar = sun.position.length(), drawn = new THREE.Vector3(), to = new THREE.Vector3();
  const tint = new THREE.Color(), WHITE = new THREE.Color(0xffffff);

  /* Draws a look of the night (night.js lookAt): the sky's air, glow, liquid light and stars; the haze, which is the scene's fog; the
     sky's light on the ground, tinted by the sky's first colour as far as the liquid light shows; and the key light's colour, strength
     and place, the same distance from what it aims at. True when the key light has turned more than half a degree since the stage's
     shadow was last drawn, which is when the caller redraws it. The look's colours are as the screen shows them: the sky's shader
     writes them as they are, and the lights and the fog take them as sRGB. */
  function grade(look) {
    const u = skyMat.uniforms;
    u.uZenith.value.fromArray(look.zenith);
    u.uHorizon.value.fromArray(look.horizon);
    u.uHaze.value.fromArray(look.haze);
    u.uGlow.value.fromArray(look.glow);
    u.uSun.value.set(look.glowTo[0], look.glowTo[1], (look.disc * Math.PI) / 180);
    u.uLiquid.value = look.liquid;
    u.uStars.value = look.stars;
    u.uMoon.value = look.moon;
    scene.fog.color.setRGB(look.haze[0], look.haze[1], look.haze[2], THREE.SRGBColorSpace);
    tint.copy(u.uC0.value).lerp(WHITE, 0.3);
    hemi.color.setRGB(look.ambient[0], look.ambient[1], look.ambient[2], THREE.SRGBColorSpace).lerp(tint, 0.5 * look.liquid);
    hemi.groundColor.setRGB(look.ground[0], look.ground[1], look.ground[2], THREE.SRGBColorSpace);
    sun.color.setRGB(look.key[0], look.key[1], look.key[2], THREE.SRGBColorSpace);
    sun.intensity = keyBase * look.keyGain;
    to.fromArray(look.keyTo);
    sun.position.copy(sun.target.position).addScaledVector(to, keyFar);
    if (to.dot(drawn) > 0.99996) return false;
    drawn.copy(to);
    return true;
  }

  return { skyMat, hemi, sun, panelMat: panelMaterial(skyMat, octaves), grade };
}

/* The stage's light panel plays the sky's liquid light on its own plane: the same field and the same uniforms, shared, so it follows the
   sky's colours, energy, drops and octaves and holds still when the sky does, PANEL_ZOOM times closer and seen flat, since a light panel
   is a screen. `uGain` holds the music's factor on its light (audio.js mappings), which the frame writes into it, so no number is boxed.
   It takes the fog, as the panel's plain colour did. The night's own uniforms stay the sky's: the panel is lit the same at every hour. */
const PANEL_ZOOM = 1.6;
function panelMaterial(skyMat, octaves) {
  const { uTime, uSeed, uEnergy, uOct, uC0, uC1, uC2, uDrop, uAmber, uAmberColor } = skyMat.uniforms;
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSeed, uEnergy, uOct, uC0, uC1, uC2, uDrop, uAmber, uAmberColor, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uGain: { value: Float32Array.of(1) } },
    fog: true,
    vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uGain[1];
      ${liquid(octaves)}
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(liquid((vUv - 0.5) * vec2(3.2, 1.0) * ${PANEL_ZOOM.toFixed(2)}) * uGain[0], 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/* The sky's colour stops: one per set where set 2 is known, else the start, middle and end of the show. */
const C = (h) => new THREE.Color(h);
const STOPS_A = [C(0xe8b04b), C(0xd6508a), C(0x9a80c0)], STOPS_B = [C(0xd6508a), C(0x2ea3a0), C(0xe8b04b)];
const stopAt = (stops, f) => f < 0.5 ? stops[0].clone().lerp(stops[1], f / 0.5) : stops[1].clone().lerp(stops[2], (f - 0.5) / 0.5);

/* The sky's two colours: by set where set 2 is known (set 1 amber and magenta, set 2 magenta and teal, the encore lavender and amber);
   otherwise one pair for the whole show, blended by the elapsed fraction f. */
export function skyPair(index, f, set2Start, encoreStart) {
  if (set2Start === null) return [stopAt(STOPS_A, f), stopAt(STOPS_B, f)];
  const k = encoreStart !== null && index >= encoreStart ? 2 : index >= set2Start ? 1 : 0;
  return [STOPS_A[k], STOPS_B[k]];
}
