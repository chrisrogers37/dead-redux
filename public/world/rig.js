/* eslint-disable */
import * as THREE from "three";

/* The stage's rig: BEAMS lamps under the front edge of the roof, each throwing a beam of light out over the crowd and up into the air
   above it. One instanced mesh of additive cones, so the rig costs one draw call while it is lit and none while it is dark. Each beam is
   aimed in the vertex shader, from its place in the fan and the five numbers the frame writes to `show`, so the CPU's cost does not grow
   with the beams. It lights no figure: the beams add to what is behind them and cast no light, and the crowd draws after them (main.js). */

/* The lamps, in the stage's own frame (stage.js: +z toward the crowd): BEAMS of them along the roof's front edge, from -SPAN to SPAN m,
   just under it. */
const BEAMS = 8, SPAN = 7.5, LAMP_Y = 7.9, LAMP_Z = 4.3;
/* A beam: a cone LENGTH m long, R0 m in radius at its lamp and R1 at its end, which fades to nothing along it. */
const LENGTH = 44, R0 = 0.2, R1 = 3, SIDES = 12;
/* The fan at rest: the beams spread from -SPREAD to SPREAD rad across, every other one lower (EL_LOW) or higher (EL_HIGH), in rad above
   level. At those angles a beam's lower edge stays more than 3.5 m over the reach of a figure's raised hands everywhere along it, over
   the whole of its swing. */
const SPREAD = 0.7, EL_LOW = 0.45, EL_HIGH = 0.7;
/* On the figures' beat each beam swings out SWAY rad to either side and back once every eight beats, and tilts TILT rad up and down two
   beats behind its swing, so it draws a loop; each is at its widest on a beat, the next beam along the rig a beat after it, so a ripple
   runs along the rig once every eight beats. Nothing in the rig goes faster: at the top of the figures' range (160 a minute, beat.js) a
   beam swings past any point at most twice in 3 s. */
const SWAY = 0.12, TILT = 0.05;
/* The build-up before a peak gathers the fan: at the peak its spread and its swing have closed by GATHER, its beams risen RISE rad, and
   its light grown by BRIGHT. In Space the beams lift toward SPACE_EL rad, nearly upright, the fan closing by SPACE_CLOSE, the swing by
   SPACE_CALM and the light by SPACE_DIM. */
const GATHER = 0.5, RISE = 0.3, BRIGHT = 0.6, SPACE_EL = 1.25, SPACE_CLOSE = 0.4, SPACE_CALM = 0.5, SPACE_DIM = 0.4;
/* How much light a beam adds where it is thickest to the eye: near its lamp, seen across. It rises from nothing over the first SOFT of its
   length, so the row of lamps, where the beams start close together, is no hard bright line. */
const LIGHT = 0.22, SOFT = 0.06;
/* A beam seen end-on is thicker to the eye than one seen across, up to THICK times. */
const THICK = 2.5;

const f = (v) => v.toFixed(4);

/* The beam's place in the fan (aBeam: its angles at rest and its place along the rig, in beats behind the first) and the frame's five
   numbers (uRig, the rig's `show`: the figures' phase in eight beats, how far the rig is lit, how far its beams swing, the build-up as it
   acts, and how far the crowd sits). */
const VERTEX = `
attribute vec3 aBeam;
uniform float uRig[5];
varying vec3 vNormal, vView, vAxis;
varying float vAlong, vSide, vLight;
#include <fog_pars_vertex>
void main() {
  float beat = uRig[0], lit = uRig[1], swing = uRig[2], gather = uRig[3], lift = uRig[4];
  float close = 1.0 - ${f(GATHER)} * gather, sway = swing * close * (1.0 - ${f(SPACE_CALM)} * lift);
  float a = 0.7854 * (beat - aBeam.z);
  float az = aBeam.x * close * (1.0 - ${f(SPACE_CLOSE)} * lift) + ${f(SWAY)} * sway * cos(a);
  float el = mix(aBeam.y + ${f(RISE)} * gather, ${f(SPACE_EL)}, lift) + ${f(TILT)} * sway * sin(a);
  vec3 d = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  vec3 across = vec3(cos(az), 0.0, -sin(az));
  mat3 aim = mat3(across, cross(d, across), d);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(aim * position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vNormal = normalMatrix * (aim * normal);
  vAxis = normalize(normalMatrix * d);
  vView = -mvPosition.xyz;
  vAlong = position.z / ${f(LENGTH)};
  vSide = mod(aBeam.z, 2.0);
  vLight = ${f(LIGHT)} * lit * (1.0 + ${f(BRIGHT)} * gather) * (1.0 - ${f(SPACE_DIM)} * lift);
  #include <fog_vertex>
}`;
/* A beam's light at a point of its surface: the sky's first colour on the lower beams and its second on the higher, as thick as the beam
   is to the eye there (the length of the line of sight through the cone, against its width; nothing at its edges), rising from its lamp
   and fading along it, and through the fog as what is behind it does. */
const FRAGMENT = `
uniform vec3 uC0, uC1;
varying vec3 vNormal, vView, vAxis;
varying float vAlong, vSide, vLight;
#include <fog_pars_fragment>
void main() {
  vec3 v = normalize(vView);
  float along = dot(vAxis, v);
  float thick = min(abs(dot(normalize(vNormal), v)) / max(1.0 - along * along, 1e-3), ${f(THICK)});
  float a = vLight * thick * smoothstep(0.0, ${f(SOFT)}, vAlong) * pow(1.0 - vAlong, 1.6);
  #ifdef USE_FOG
  a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(mix(uC0, uC1, vSide), a);
  #include <colorspace_fragment>
}`;

/* Builds the rig in the stage's group, its beams in the sky's two colours, whose uniforms (uC0, uC1) it shares. */
export function buildRig(group, { uC0, uC1 }) {
  const geo = new THREE.CylinderGeometry(R0, R1, LENGTH, SIDES, 1, true).translate(0, -LENGTH / 2, 0).rotateX(-Math.PI / 2);
  const beam = new Float32Array(3 * BEAMS);
  for (let i = 0; i < BEAMS; i++) beam.set([SPREAD * ((2 * i) / (BEAMS - 1) - 1), i % 2 ? EL_HIGH : EL_LOW, i], 3 * i);
  geo.setAttribute("aBeam", new THREE.InstancedBufferAttribute(beam, 3));
  /* What aims and lights the beams, which the frame writes here: the figures' phase (beat.js), kept to eight beats, the swing's cycle,
     for the shader's precision; how far the rig is lit, 0 dark to 1 lit; how far the beams swing; the build-up before a peak as it acts
     (audio.js mappings' rise); and how far the crowd sits, which in Space, where the rig is lit, lifts the beams. It is the shader's own
     uniform, so writing it boxes no number. A dark rig is not drawn: the frame hides the mesh while `show[1]` is 0. */
  const show = new Float32Array(5);
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uC0, uC1, uRig: { value: show } };
  /* Its light adds to what is drawn before it, and it writes no depth. It is not a transparent material, which three draws after every
     solid thing: drawn with the solid things, it takes its place among them by its render order (main.js), before the crowd. */
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, BEAMS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < BEAMS; i++) mesh.setMatrixAt(i, m.makeTranslation(-SPAN + (2 * SPAN * i) / (BEAMS - 1), LAMP_Y, LAMP_Z));
  /* Every beam stays within its length and its width of its lamp, and every lamp within SPAN of the rig's middle, whatever the aim, so the
     mesh culls against the camera without measuring its moving beams. */
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, LAMP_Y, LAMP_Z), SPAN + LENGTH + R1);
  mesh.visible = false;
  group.add(mesh);

  return { mesh, show };
}
