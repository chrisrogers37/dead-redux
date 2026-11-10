/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { height, STAGE, STAGE_COLUMN } from "./ground.js";
import { keepOuts, parting, PERSON, seats } from "./seats.js";

/* The crowd on the hill: faceless figures at the band's height, dark like the band's silhouettes, on the slope in front of the stage
   (seats.js). One instanced mesh on a Lambert material, so the crowd keeps the island's light and fog and costs one draw call; it dances
   in the vertex shader, from a few uniforms that `pose` sets each frame, and steps aside for the visitor from one instanced attribute
   that `part` updates (seats.js's parting). Nothing is printed on anyone. */

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
   the body sways SWAY rad to each side over two beats. Each figure keeps its own phase (aFig.y, 0-1): its knees bend within JITTER of
   a beat of the rest, and its sway starts up to a beat from theirs. */
const BOB = 0.12, ARM_SWING = 0.5, SWAY = 0.08, JITTER = 0.12;
/* The rise before a peak: a figure stands, its arms go up to ARM_UP rad and its knees bend twice as deep, as `rise` passes from
   RISE_FROM to RISE_FROM + RISE_W at the front rows and RISE_SPAN later at the back (aFig.z, 0 at the front and 1 at the back), so the
   rise ripples outward from the stage and the whole crowd is up at the peak. */
const ARM_UP = 2.7, RISE_FROM = 0.3, RISE_SPAN = 0.6, RISE_W = 0.1;
/* How far a figure reaches in its own units, over every pose: its farthest vertex HAND from its axis (its arms level partway up the
   rise, swaying at the dance's widest), its highest TOP over its feet (its hands up at the rise's peak), and PAST beyond the bounds it
   stands in; and HANG with its arms hanging, as one standing fully still (aPart.w, seats.js) holds them. */
const HAND = 1.11, TOP = 2.08, PAST = 0.4, HANG = 0.354;
/* The visitor's bear reaches 1.98 m from its middle, halfway between its feet and its head (bears.js, avatar.js). */
const BEAR = 1.98;

const f = (v) => v.toFixed(4);
/* After common: the crowd's attributes and uniforms, and `rot`, which turns a point in its plane by `a` rad. */
const DECLARE = `
attribute float aLeg;
attribute float aArm;
attribute vec3 aFig;
attribute vec4 aPart;
uniform float uBeat;
uniform float uDance;
uniform float uRise;
uniform float uSit;
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }`;
/* In the figure's own units, after begin_vertex: the rise, the sit, the arms, the knees and the sway, as far as the figure dances where
   it stands (aPart.w: still 1, at its seat 0). Every figure rises with the build-up but one standing fully still, whose arms hang. */
const DANCE = `
float moves = 1.0 - aPart.w, dance = uDance * moves;
float rise = clamp((uRise - ${f(RISE_FROM)} - ${f(RISE_SPAN)} * aFig.z) / ${f(RISE_W)}, 0.0, 1.0) * (1.0 - step(1.0, aPart.w));
float sit = max(aFig.x, clamp(uSit * ${f(1 + STAGGER)} - aFig.y * ${f(STAGGER)}, 0.0, 1.0)) * (1.0 - rise);
float bounce = 0.5 + 0.5 * cos(6.2832 * (uBeat + ${f(JITTER)} * aFig.y));
if (aArm != 0.0) {
  float swing = rise * ${f(ARM_UP)} + (1.0 - rise) * dance * ${f(ARM_SWING)} * (1.0 - bounce);
  vec2 shoulder = vec2(aArm * ${f(SHOULDER_X)}, ${f(SHOULDER_Y)});
  transformed.xy = shoulder + rot(transformed.xy - shoulder, aArm * swing);
}
float fold = sit + (1.0 - sit) * dance * (1.0 + rise) * ${f(BOB)} * bounce;
transformed.y = aLeg > 0.5 ? transformed.y * (1.0 - ${f(1 - FOLD)} * fold) : transformed.y - ${f(LEG * (1 - FOLD))} * fold;
transformed.xy = rot(transformed.xy, dance * ${f(SWAY)} * sin(3.1416 * (uBeat + aFig.y)));`;
/* project_vertex for the crowd, which is instanced and never batched: the figure's place on the hill, then where the parting has
   stepped it (aPart.xyz), in metres. */
const PROJECT = `
vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
mvPosition.xyz += aPart.xyz;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;

/* Builds the crowd: at most `count` figures on the first seats, kept clear of the path, the bears' line and a circle round each
   landmark's bounds. It reads those bounds, so it runs before the landmarks merge (landmarks.js) empties them. Each figure faces the
   stage, turned a little, and stands PERSON tall, give or take 8 %. `count` is how many it seated. */
export function buildCrowd(scene, { count, path, line, landmarks }) {
  /* A point every 2 m along `length` metres of the path or the line. */
  const along = (length, at) => Array.from({ length: Math.ceil(length / 2) }, (_, i) => { const p = at(i * 2); return [p.x, p.z]; });
  const box = new THREE.Box3(), mid = new THREE.Vector3();
  const around = {
    path: along(path.curveLength, (d) => path.at(d / path.curveLength)),
    line: along(line.length, (d) => line.at(d)),
    landmarks: landmarks.map((l) => {
      box.setFromObject(l).getCenter(mid);
      return [mid.x, mid.z, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2];
    }),
  };
  const placed = seats(around).slice(0, count);
  const n = placed.length;
  const geo = figureGeometry();
  geo.computeBoundingBox();
  const scale = PERSON / geo.boundingBox.max.y;
  const uniforms = { uBeat: { value: 0 }, uDance: { value: 0 }, uRise: { value: 0 }, uSit: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${DECLARE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${DANCE}`)
      .replace("#include <project_vertex>", PROJECT);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const fig = new Float32Array(3 * n);
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
  });
  geo.setAttribute("aFig", new THREE.InstancedBufferAttribute(fig, 3));
  /* The parting, for figures up to the largest's size. A figure keeps 0.15 m past their bear's reach and its own from the visitor's
     middle where it has room, and never comes nearer than those two reaches, or nearer than the bear's reach and its hanging arms
     (HANG) while it stands still. It sees them coming 1.1 s ahead, steps aside at 5.5 m/s and walks back at 3; groups push apart
     within 1.4 m, past where two of the largest's hanging hands meet (0.35 units out, 1.32 m), and any within 2.85 m of one that has
     stepped aside stand still, fading over the last 0.5 m, out of reach of a dancer's hands (0.88 units out, 1.66 m). A figure standing
     fully still does not rise; one at the fading edge rises with the rest. It keeps clear of what the seats keep clear of, and its
     hands of the stage's solids (STAGE_COLUMN). The walk's camera keeps 1.1 m out of them (avatar.js), past the near plane's corners
     in the widest view (1.04 m away on a phone held across, 19.5:9), rising over them ahead of reaching them. */
  const big = scale * 1.08, hand = HAND * big, reach = BEAR + hand;
  const parts = parting(placed, { keep: reach + 0.15, reach, hang: BEAR + HANG * big, lead: 1.1, step: 5.5, back: 3, space: 1.4,
    most: reach + 6, passes: 4, ring: 2.85, top: TOP * big, wide: hand, clear: 1.1, grade: 1.5,
    keeps: [...keepOuts(around), [STAGE[0], STAGE[1], STAGE_COLUMN.r + hand]] });
  const aPart = new THREE.InstancedBufferAttribute(parts.offset, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aPart", aPart);
  mesh.computeBoundingSphere();
  /* The culling sphere takes in the figures' arms past their standing bounds and, as `part` moves them, the farthest of them from
     its seat. */
  const rest = mesh.boundingSphere.radius + PAST * big;
  mesh.boundingSphere.radius = rest;
  scene.add(mesh);

  /* Poses the crowd for a frame: `beats` is the figures' phase (beat.js); `dance` how far they dance, 0 for standing still; `rise` how
     far the build-up before a peak has lifted them (audio.js mappings); and `sit` how far the crowd sits, 0-1. The phase is kept to two
     beats, the sway's cycle, for the shader's precision. */
  function pose(beats, dance, rise, sit) {
    uniforms.uBeat.value = beats % 2;
    uniforms.uDance.value = dance;
    uniforms.uRise.value = rise;
    uniforms.uSit.value = sit;
  }

  /* Moves the figures round the visitor for a frame `dt` s long, the visitor's bear standing with its feet and head at `feet` and `head`
     (avatar.js), at once under reduced motion; the attribute goes up only in a frame where a figure moved. */
  function part(dt, feet, head, reduced) {
    if (!parts.step(dt, feet, head, reduced)) return;
    aPart.needsUpdate = true;
    mesh.boundingSphere.radius = rest + parts.farthest[0];
  }

  return { mesh, count: n, pose, part, over: parts.over, ahead: parts.ahead, hold: parts.hold, get parted() { return parts.parted; } };
}
