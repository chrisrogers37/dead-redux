/* eslint-disable */
import * as THREE from "three";

/* The liquid light: a field of noise folded through itself, flowing with the world's time, more restless with the music's energy, with a
   drop's ring spreading through it, in the sky's colours, the second set apart by the first's dark veins and the whole washed toward amber
   by the music's brightness. Its octave count is a uniform the downgrade can lower, up to `octaves`. The sky plays it, and the stage's
   panel too (panelMaterial). */
const liquid = (octaves) => `
      uniform float uTime, uSeed, uEnergy, uAmber; uniform vec3 uC0, uC1, uC2, uDrop, uAmberColor;
      uniform int uOct;
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
        vec3 col = mix(uC0, uC1, clamp(v * 1.5 - 0.1, 0.0, 1.0));
        col = mix(col, uC2, clamp(length(q), 0.0, 1.0) * 0.6);
        return mix(col, uAmberColor, uAmber);
      }`;

/* The sky of liquid light, fading into the page's colour below the horizon, and its two lights: the hemisphere light, which takes its
   colour from the sky, and the sun, whose shadow the stage aims. */
export function buildSky(scene, octaves, seed) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: seed }, uEnergy: { value: 0.5 }, uOct: { value: octaves },
      uC0: { value: new THREE.Color(0xe8b04b) }, uC1: { value: new THREE.Color(0xd6508a) }, uC2: { value: new THREE.Color(0x3a2238) }, uPage: { value: new THREE.Color(0x0b0b0d) },
      uDrop: { value: new THREE.Vector3(0.5, 0.5, 99) },
      uAmber: { value: 0 }, uAmberColor: { value: new THREE.Color(0xe8b04b) },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      varying vec3 vDir;
      uniform vec3 uPage;
      ${liquid(octaves)}
      void main() {
        vec3 d = normalize(vDir);
        float horizon = smoothstep(-0.05, 0.3, d.y);
        gl_FragColor = vec4(mix(uPage, liquid(d.xz / (d.y + 0.35) * 1.2), horizon), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), skyMat));
  /* Light intensities are in physical units, so the soft daylight look needs a factor of pi. */
  const hemi = new THREE.HemisphereLight(0xe8b04b, 0x1a1613, 1.1 * Math.PI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.5 * Math.PI);
  sun.position.set(60, 100, 40);
  scene.add(sun);
  return { skyMat, hemi, sun };
}

/* The stage's light panel plays the sky's liquid light on its own plane: the same field and the same uniforms, shared, so it follows the
   sky's colours, energy, drops and octaves and holds still when the sky does, PANEL_ZOOM times closer and seen flat, since a light panel
   is a screen. `uGain` is the music's factor on its light (audio.js mappings). It takes the fog, as the panel's plain colour did. */
const PANEL_ZOOM = 1.6;
export function panelMaterial(skyMat, octaves) {
  const { uPage, ...shared } = skyMat.uniforms;
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uGain: { value: 1 } },
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
      uniform float uGain;
      ${liquid(octaves)}
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(liquid((vUv - 0.5) * vec2(3.2, 1.0) * ${PANEL_ZOOM.toFixed(2)}) * uGain, 1.0);
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
