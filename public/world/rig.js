/* eslint-disable */
import * as THREE from "three";

/* The stage's rig: BEAMS lamps under the front edge of the roof, each throwing a beam of light out over the crowd and up into the air
   above it. One instanced mesh of additive cones, so the rig costs one draw call while it is lit and none while it is dark. Each beam is
   aimed in the vertex shader, from its place in the fan and a few uniforms that `aim` sets each frame, so the CPU's cost does not grow
   with the beams. It lights no figure: the beams add to what is behind them and cast no light. */

/* The lamps, in the stage's own frame (stage.js: +z toward the crowd): BEAMS of them along the roof's front edge, from -SPAN to SPAN m,
   just under it. */
const BEAMS = 8, SPAN = 7.5, LAMP_Y = 7.9, LAMP_Z = 4.3;
/* A beam: a cone LENGTH m long, R0 m across at its lamp and R1 at its end, which fades to nothing along it. */
const LENGTH = 44, R0 = 0.2, R1 = 3, SIDES = 12;
/* The fan at rest: the beams spread from -SPREAD to SPREAD rad across, every other one lower (EL_LOW) or higher (EL_HIGH), in rad above
   level. At those angles a beam's lower edge stays more than 3.5 m over the reach of a figure's raised hands everywhere along it, over
   the whole of its swing. */
const SPREAD = 0.7, EL_LOW = 0.45, EL_HIGH = 0.7;
/* On the figures' beat each beam swings out SWAY rad to either side and back once every four beats, and tilts TILT rad up and down a
   beat behind its swing, so it draws a loop; each is at its widest on a beat, the next beam along the rig a beat after it. Nothing in
   the rig goes faster, so at the top of the figures' range (160 a minute, beat.js) a beam swings past any point at most twice in 1.5 s. */
const SWAY = 0.12, TILT = 0.05;
/* The build-up before a peak gathers the fan: at the peak its spread and its swing have closed by GATHER, its beams risen RISE rad, and
   its light grown by BRIGHT. In Space the beams lift toward SPACE_EL rad, nearly upright, the fan closing by SPACE_CLOSE, the swing by
   SPACE_CALM and the light by SPACE_DIM. */
const GATHER = 0.5, RISE = 0.3, BRIGHT = 0.6, SPACE_EL = 1.25, SPACE_CLOSE = 0.4, SPACE_CALM = 0.5, SPACE_DIM = 0.4;
/* How much light a beam adds where it is thickest to the eye: at its lamp, seen across. */
const LIGHT = 0.22;
/* A beam seen end-on is thicker to the eye than one seen across, up to THICK times. */
const THICK = 2.5;

/* The beam's place in the fan: its angles at rest and its place along the rig, in beats behind the first. */
const VERTEX = `
attribute vec3 aBeam;
uniform float uBeat, uSwing, uGather, uLift;
varying vec3 vNormal, vView, vAxis;
varying float vAlong, vSide;
#include <fog_pars_vertex>
void main() {
  float sway = uSwing * (1.0 - ${GATHER.toFixed(4)} * uGather) * (1.0 - ${SPACE_CALM.toFixed(4)} * uLift);
  float a = 1.5708 * (uBeat - aBeam.z);
  float az = aBeam.x * (1.0 - ${GATHER.toFixed(4)} * uGather) * (1.0 - ${SPACE_CLOSE.toFixed(4)} * uLift) + ${SWAY.toFixed(4)} * sway * cos(a);
  float el = mix(aBeam.y + ${RISE.toFixed(4)} * uGather, ${SPACE_EL.toFixed(4)}, uLift) + ${TILT.toFixed(4)} * sway * sin(a);
  vec3 d = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  vec3 across = vec3(cos(az), 0.0, -sin(az));
  mat3 aim = mat3(across, cross(d, across), d);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(aim * position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vNormal = normalMatrix * (aim * normal);
  vAxis = normalMatrix * d;
  vView = -mvPosition.xyz;
  vAlong = position.z / ${LENGTH.toFixed(1)};
  vSide = mod(aBeam.z, 2.0);
  #include <fog_vertex>
}`;
/* A beam's light at a point of its surface: the sky's first colour on the lower beams and its second on the higher, as thick as the beam
   is to the eye there (the length of the line of sight through the cone, against its width; nothing at its edges), fading along it,
   and through the fog as what is behind it does. */
const FRAGMENT = `
uniform vec3 uC0, uC1;
uniform float uLight;
varying vec3 vNormal, vView, vAxis;
varying float vAlong, vSide;
#include <fog_pars_fragment>
void main() {
  vec3 v = normalize(vView);
  float along = dot(normalize(vAxis), v);
  float thick = min(abs(dot(normalize(vNormal), v)) / max(1.0 - along * along, 1e-3), ${THICK.toFixed(4)});
  float a = uLight * thick * pow(1.0 - vAlong, 1.6);
  #ifdef USE_FOG
  a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(mix(uC0, uC1, vSide), a);
  #include <colorspace_fragment>
}`;

/* Builds the rig in the stage's group, its beams in the sky's two colours (`colors`, the sky's uC0 and uC1 uniforms, which it shares). */
export function buildRig(group, colors) {
  const geo = new THREE.CylinderGeometry(R0, R1, LENGTH, SIDES, 1, true).translate(0, -LENGTH / 2, 0).rotateX(-Math.PI / 2);
  const beam = new Float32Array(3 * BEAMS);
  for (let i = 0; i < BEAMS; i++) beam.set([SPREAD * ((2 * i) / (BEAMS - 1) - 1), i % 2 ? EL_HIGH : EL_LOW, i], 3 * i);
  geo.setAttribute("aBeam", new THREE.InstancedBufferAttribute(beam, 3));
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uC0: colors.uC0, uC1: colors.uC1,
    uBeat: { value: 0 }, uSwing: { value: 0 }, uGather: { value: 0 }, uLift: { value: 0 }, uLight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
  const mesh = new THREE.InstancedMesh(geo, mat, BEAMS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < BEAMS; i++) mesh.setMatrixAt(i, m.makeTranslation(-SPAN + (2 * SPAN * i) / (BEAMS - 1), LAMP_Y, LAMP_Z));
  /* Every place a beam can reach, once: its lamp, and its end, at any angle its aim takes (the swing at twice its usual width, past the
     loudest dance's 1.6) and as far again as the cone is wide there, so the mesh culls against the camera without measuring its moving
     beams each frame. */
  const wide = R1 / LENGTH, az = SPREAD + 2 * SWAY + wide, lo = EL_LOW - 2 * TILT - wide;
  const hi = Math.max(EL_HIGH + RISE, SPACE_EL) + 2 * TILT + wide, reach = [];
  for (const x of [-SPAN, SPAN]) {
    reach.push(new THREE.Vector3(x, LAMP_Y, LAMP_Z));
    for (let u = 0; u <= 8; u++) for (let w = 0; w <= 8; w++) {
      const a = -az + (2 * az * u) / 8, e = lo + ((hi - lo) * w) / 8, r = LENGTH + R1;
      reach.push(new THREE.Vector3(x + r * Math.sin(a) * Math.cos(e), LAMP_Y + r * Math.sin(e), LAMP_Z + r * Math.cos(a) * Math.cos(e)));
    }
  }
  mesh.boundingSphere = new THREE.Sphere().setFromPoints(reach);
  mesh.visible = false;
  group.add(mesh);

  /* What aims the beams, which the frame writes here before it calls `aim`, so no number is boxed on the way: the figures' phase in
     beats (beat.js); how far the rig is lit, 0 dark to 1 lit; how far the beams swing; the build-up before a peak as it acts (audio.js
     mappings' rise); and how far the crowd sits, which in Space, where the rig is lit, lifts the beams. */
  const show = new Float64Array(5);
  /* Aims the beams for a frame. The phase is kept to four beats, the swing's cycle, for the shader's precision. A dark rig is not drawn. */
  function aim() {
    const lit = show[1], gather = show[3], lift = show[4];
    uniforms.uBeat.value = show[0] % 4;
    uniforms.uSwing.value = show[2];
    uniforms.uGather.value = gather;
    uniforms.uLift.value = lift;
    uniforms.uLight.value = LIGHT * lit * (1 + BRIGHT * gather) * (1 - SPACE_DIM * lift);
    mesh.visible = lit > 0;
  }

  return { mesh, show, aim };
}
