/* eslint-disable */
import * as THREE from "three";

/* The sky of liquid light, with its octave count as a uniform the downgrade can lower and an amber mix the music's brightness drives, and its
   two lights: the hemisphere light, which takes its colour from the sky, and the sun, whose shadow the stage aims. */
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
      uniform float uTime, uSeed, uEnergy, uAmber; uniform vec3 uC0, uC1, uC2, uPage, uDrop, uAmberColor;
      uniform int uOct;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < ${octaves}; i++) { if (i >= uOct) break; v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        vec2 p = d.xz / (d.y + 0.35) * 1.2;
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
        col = mix(col, uAmberColor, uAmber);
        float horizon = smoothstep(-0.05, 0.3, d.y);
        gl_FragColor = vec4(mix(uPage, col, horizon), 1.0);
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
