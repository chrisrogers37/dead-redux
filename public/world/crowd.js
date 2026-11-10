/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { height, STAGE } from "./ground.js";
import { PERSON, seats } from "./seats.js";

/* The crowd on the hill: faceless figures at the band's height, dark like the band's silhouettes, on the slope in front of the stage
   (seats.js). One instanced mesh on a Lambert material, so the crowd keeps the island's light and fog and costs one draw call; it dances
   in the vertex shader, from a few uniforms that `pose` sets each frame, so its cost on the CPU does not grow with its size. Nothing is
   printed on anyone. */

/* Dark, nearly grey colours, a little apart in hue, so the figures read as silhouettes and as many people. */
const PALETTE = [0x1d1b22, 0x22201d, 0x1a1f26, 0x26201f, 0x1e2320, 0x2a2420, 0x18181b, 0x241c24];

/* One figure in its own units, standing on y = 0 and facing +z, 1.81 tall: legs LEG tall, a torso, a head and two arms at its sides,
   hanging from shoulders SHOULDER_X either side and SHOULDER_Y up. The legs carry aLeg = 1, the arms aArm = -1 and 1. */
const LEG = 0.86, SHOULDER_X = 0.3, SHOULDER_Y = 1.44;
function figureGeometry() {
  const part = (geo, leg, arm) => {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count;
    g.setAttribute("aLeg", new THREE.BufferAttribute(new Float32Array(n).fill(leg), 1));
    g.setAttribute("aArm", new THREE.BufferAttribute(new Float32Array(n).fill(arm), 1));
    return g;
  };
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.2, 0.15, LEG, 6, 1, true).translate(0, LEG / 2, 0), 1, 0),
    part(new THREE.CylinderGeometry(0.27, 0.2, 0.62, 6, 1, false).translate(0, 1.17, 0), 0, 0),
    part(new THREE.IcosahedronGeometry(0.15, 0).translate(0, 1.68, 0), 0, 0),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(-SHOULDER_X, SHOULDER_Y - 0.31, 0), 0, -1),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(SHOULDER_X, SHOULDER_Y - 0.31, 0), 0, 1),
  ]);
}

/* A figure folds to sit: its legs to FOLD of their height, and the rest of it down onto them. The sitters' section sits (aFig.x = 1);
   the rest of the crowd sits as `sit` rises, each figure in its turn, the last STAGGER behind the first. */
const FOLD = 0.18, STAGGER = 0.5;
/* The dance, on the figures' beat: the knees bend on each beat by BOB of a sit, and the arms swing out ARM_SWING rad between beats;
   the body sways SWAY rad to each side over two beats. Each figure keeps its own phase (aFig.y), within JITTER of a beat of the rest. */
const BOB = 0.12, ARM_SWING = 0.5, SWAY = 0.08, JITTER = 0.12;
/* The rise before a peak: a figure stands, its arms go up to ARM_UP rad and its knees bend twice as deep, as `rise` passes from
   RISE_FROM to RISE_FROM + RISE_W at the front rows and RISE_SPAN later at the back (aFig.z, 0 at the front and 1 at the back), so the
   rise ripples outward from the stage and the whole crowd is up at the peak. */
const ARM_UP = 2.7, RISE_FROM = 0.3, RISE_SPAN = 0.6, RISE_W = 0.1;
/* The parting: a figure within PART_R m of the visitor steps aside, straight away from them, by PART m at their centre and less with
   distance, so none stands within PART m of them: the visitor's bear's snout reaches 2.4 m from its centre and a figure's raised hand
   1 m from its own. It keeps to the ground along the slope at its seat (aSlope). */
const PART = 3.5, PART_R = 3 * PART;

const f = (v) => v.toFixed(4);
const ATTRIBUTES = `
attribute float aLeg;
attribute float aArm;
attribute vec3 aFig;
attribute vec2 aSlope;
uniform float uBeat;
uniform float uDance;
uniform float uRise;
uniform float uSit;
uniform vec2 uVisitor;`;
/* In the figure's own units, after begin_vertex: the rise, the sit, the arms, the knees and the sway. */
const DANCE = `
float rise = clamp((uRise - ${f(RISE_FROM)} - ${f(RISE_SPAN)} * aFig.z) / ${f(RISE_W)}, 0.0, 1.0);
float sit = max(aFig.x, clamp(uSit * ${f(1 + STAGGER)} - aFig.y * ${f(STAGGER)}, 0.0, 1.0)) * (1.0 - rise);
float bounce = 0.5 + 0.5 * cos(6.2832 * (uBeat + ${f(JITTER)} * aFig.y));
float arm = aArm * (rise * ${f(ARM_UP)} + (1.0 - rise) * uDance * ${f(ARM_SWING)} * (1.0 - bounce));
vec2 shoulder = vec2(aArm * ${f(SHOULDER_X)}, ${f(SHOULDER_Y)}), hang = transformed.xy - shoulder;
transformed.xy = shoulder + vec2(cos(arm) * hang.x - sin(arm) * hang.y, sin(arm) * hang.x + cos(arm) * hang.y);
float fold = sit + (1.0 - sit) * uDance * (1.0 + rise) * ${f(BOB)} * bounce;
transformed.y = aLeg > 0.5 ? transformed.y * (1.0 - ${f(1 - FOLD)} * fold) : transformed.y - ${f(LEG * (1 - FOLD))} * fold;
float lean = uDance * ${f(SWAY)} * sin(3.1416 * (uBeat + aFig.y));
transformed.xy = vec2(cos(lean) * transformed.x - sin(lean) * transformed.y, sin(lean) * transformed.x + cos(lean) * transformed.y);`;
/* project_vertex for the crowd, which is instanced and never batched: the figure's place on the hill, then the parting, in metres. */
const PROJECT = `
vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
vec2 away = instanceMatrix[3].xz - uVisitor;
float near = max(0.0, 1.0 - length(away) / ${f(PART_R)});
vec2 aside = ${f(PART)} * near * near * normalize(away + vec2(0.0, 1e-4));
mvPosition.xz += aside;
mvPosition.y += dot(aSlope, aside);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;

/* Builds the crowd: at most `count` figures on the first seats, kept clear of the path, the bears' line and a circle round each
   landmark's bounds. It reads those bounds, so it runs before the landmarks merge (landmarks.js) empties them. Each figure faces the
   stage, turned a little, and stands PERSON tall, give or take 8 %. `count` is how many it seated. */
export function buildCrowd(scene, { count, path, line, landmarks }) {
  /* A point every 2 m along `length` metres of the path or the line. */
  const along = (length, at) => Array.from({ length: Math.ceil(length / 2) }, (_, i) => { const p = at(i * 2); return [p.x, p.z]; });
  const box = new THREE.Box3(), mid = new THREE.Vector3();
  const placed = seats({
    path: along(path.curveLength, (d) => path.at(d / path.curveLength)),
    line: along(line.length, (d) => line.at(d)),
    landmarks: landmarks.map((l) => {
      box.setFromObject(l).getCenter(mid);
      return [mid.x, mid.z, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2];
    }),
  }).slice(0, count);
  const n = placed.length;
  const geo = figureGeometry();
  geo.computeBoundingBox();
  const scale = PERSON / geo.boundingBox.max.y;
  const uniforms = { uBeat: { value: 0 }, uDance: { value: 0 }, uRise: { value: 0 }, uSit: { value: 0 }, uVisitor: { value: new THREE.Vector2() } };
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${ATTRIBUTES}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${DANCE}`)
      .replace("#include <project_vertex>", PROJECT);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const fig = new Float32Array(3 * n), slope = new Float32Array(2 * n);
  const near = Math.min(...placed.map((p) => p.r)), far = Math.max(...placed.map((p) => p.r));
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  /* The seats come in a random order across the hill, so a figure's place in it picks its turn, its size, its colour and its phase. */
  placed.forEach((p, i) => {
    dummy.position.set(p.x, height(p.x, p.z), p.z);
    dummy.rotation.set(0, Math.atan2(STAGE[0] - p.x, STAGE[1] - p.z) + (i % 7 - 3) * 0.08, 0);
    dummy.scale.setScalar(scale * (1 + ((i * 37) % 17 - 8) * 0.01));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(PALETTE[(i * 5) % PALETTE.length]));
    fig.set([p.sit ? 1 : 0, (i * 0.618034) % 1, far > near ? (p.r - near) / (far - near) : 0], 3 * i);
    slope.set([height(p.x + 0.5, p.z) - height(p.x - 0.5, p.z), height(p.x, p.z + 0.5) - height(p.x, p.z - 0.5)], 2 * i);
  });
  geo.setAttribute("aFig", new THREE.InstancedBufferAttribute(fig, 3));
  geo.setAttribute("aSlope", new THREE.InstancedBufferAttribute(slope, 2));
  mesh.computeBoundingSphere();
  /* The parting carries a figure up to PART m from its seat, and raised arms reach past its standing bounds, so the culling sphere
     takes them in. */
  mesh.boundingSphere.radius += PART + 1;
  scene.add(mesh);

  /* Poses the crowd for a frame: `beats` is the figures' phase (beat.js); `dance` how far they dance, 0 for standing still; `rise` how
     far the build-up before a peak has lifted them (audio.js mappings); `sit` how far the crowd sits, 0-1; and `visitor` the ground point
     of the visitor, whom the figures near it step aside from. The phase is kept to two beats, the sway's cycle, for the shader's
     precision. */
  function pose(beats, dance, rise, sit, visitor) {
    uniforms.uBeat.value = beats % 2;
    uniforms.uDance.value = dance;
    uniforms.uRise.value = rise;
    uniforms.uSit.value = sit;
    uniforms.uVisitor.value.set(visitor.x, visitor.z);
  }

  return { mesh, count: n, pose };
}
