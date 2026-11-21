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

/* One figure in its own units, standing on y = 0 and facing +z, TALL to the top of its head: two legs LEG tall on their feet, hips, a
   torso that widens to its shoulders, a neck, a head, and two arms at its sides ending in hands, hanging from shoulders SHOULDER_X
   either side and SHOULDER_Y up. Each leg has a ring at the knee, halfway up it, where it bends. It stands within the plain figure it
   replaces, 0.35 to either side and 0.27 fore and aft, its arms within that figure's, so the reaches below still bound it. The legs
   carry aLeg = 1 and the feet aLeg = 2, the arms and hands aArm = -1 and 1.
   Some figures wear a brimmed hat and some long hair, neither taller than the head: those parts carry aWear = 1 and 2, and the vertex
   shader folds them away on the figures that do not wear them (HAT, HAIR), so the whole crowd is still one mesh. */
export const LEG = 0.86, SHOULDER_X = 0.285, SHOULDER_Y = 1.44, TALL = 1.8076;
const HEAD_Y = 1.655;
export function figureGeometry() {
  const part = (geo, leg, arm, wear = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count;
    g.setAttribute("aLeg", new THREE.BufferAttribute(new Float32Array(n).fill(leg), 1));
    g.setAttribute("aArm", new THREE.BufferAttribute(new Float32Array(n).fill(arm), 1));
    g.setAttribute("aWear", new THREE.BufferAttribute(new Float32Array(n).fill(wear), 1));
    return g;
  };
  /* The head, an egg whose top stands at TALL. */
  const head = new THREE.IcosahedronGeometry(0.135, 1).scale(1, 1.13, 1.05);
  head.computeBoundingBox();
  head.translate(0, TALL - head.boundingBox.max.y, 0);
  const parts = [part(head, 0, 0)];
  for (const side of [-1, 1]) {
    parts.push(
      part(new THREE.CylinderGeometry(0.088, 0.062, LEG, 6, 2, true).translate(side * 0.095, LEG / 2, 0), 1, 0),
      part(new THREE.BoxGeometry(0.11, 0.07, 0.21).translate(side * 0.095, 0.035, 0.05), 2, 0),
      part(new THREE.CylinderGeometry(0.056, 0.042, 0.54, 6, 1, true).translate(side * SHOULDER_X, SHOULDER_Y - 0.27, 0), 0, side),
      part(new THREE.IcosahedronGeometry(0.05, 0).translate(side * SHOULDER_X, SHOULDER_Y - 0.565, 0), 0, side),
      /* The shoulder: a ball at the arm's pivot, part of the body, which the torso's top runs into and the arm's open top turns
         inside, so an arm that swings or lifts stays joined to its figure and shows no hollow from above. */
      part(new THREE.IcosahedronGeometry(0.064, 0).translate(side * SHOULDER_X, SHOULDER_Y, 0), 0, 0),
    );
  }
  parts.push(
    /* The hips, closed above and below: the torso's foot is narrower than their top, and a seated figure shows their underside. */
    part(new THREE.CylinderGeometry(0.165, 0.17, 0.17, 8).scale(1, 1, 0.74).translate(0, 0.93, 0), 0, 0),
    part(new THREE.CylinderGeometry(0.25, 0.158, 0.46, 8).scale(1, 1, 0.68).translate(0, 1.24, 0), 0, 0),
    part(new THREE.CylinderGeometry(0.075, 0.25, 0.075, 8, 1, true).scale(1, 1, 0.68).translate(0, 1.5075, 0), 0, 0),
    part(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 6, 1, true).translate(0, 1.57, 0), 0, 0),
    /* The hat: a brim round the head and a crown that ends at the head's top. */
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 10).translate(0, HEAD_Y + 0.055, 0), 0, 0, 1),
    part(new THREE.CylinderGeometry(0.118, 0.137, 0.1, 8).translate(0, TALL - 0.05, 0), 0, 0, 1),
    /* Long hair: down the back of the head to the shoulders. */
    part(new THREE.IcosahedronGeometry(0.165, 0).scale(1, 1.3, 0.85).translate(0, 1.585, -0.05), 0, 0, 2),
  );
  /* Nothing on a figure reads a texture, so its vertices carry no texture coordinates. */
  return mergeGeometries(parts).deleteAttribute("uv");
}
/* Who wears what, by a figure's own phase (aFig.y, 0-1) turned into a pick from 0 to 1: a hat under HAT, long hair from HAIR[0] to
   HAIR[1]. */
export const HAT = 0.22, HAIR = [0.3, 0.62];

/* A leg is two bones of the same length, the thigh and the shin, from the hip down to the knee and on to the foot. The knee stands
   wherever those lengths put it between the hip and the foot, always ahead of the line between them, so a leg bends and never
   stretches or shrinks. Standing, a figure's knees bend to the beat as its hips come down, a fifth of the legs' height at the most
   (the bob, which is counted in the height a leg has left once it has folded to FOLD of its own). A figure sits on the ground with its
   knees up: its hips SEAT above the ground and its feet FOOT ([forward, up]) from where it stood, lower or higher by as much as the
   ground falls or rises that far ahead of its seat (aFig.w), and tipped along that slope, so they rest on the hill. Its arms hang
   as they do standing, its hands at the ground beside it. The sitters' section sits (aFig.x = 1); the rest of the crowd sits as `sit` rises, each figure in its turn, the
   last STAGGER behind the first. */
export const FOLD = 0.18, STAGGER = 0.5, SEAT = 0.075, FOOT = [0.36, 0.03];
/* The ground's fall or rise ahead of a seat that a seated figure's feet follow, in the figure's own units, at the most. */
export const DROP = [-0.12, 0.3];
/* The dance, on the figures' beat: the hips come down on each beat by BOB of what a fold to FOLD takes, and the arms swing out ARM_SWING rad between beats;
   the body sways SWAY rad to each side over two beats. Each figure keeps its own phase (aFig.y, 0-1): its knees bend within JITTER of
   a beat of the rest, and its sway starts up to a beat from theirs. */
const BOB = 0.12, ARM_SWING = 0.5, SWAY = 0.08, JITTER = 0.12;
/* The rise before a peak: a figure stands, its arms go up to ARM_UP rad and its knees bend twice as deep, as `rise` passes from
   RISE_FROM to RISE_FROM + RISE_W at the front rows and RISE_SPAN later at the back (aFig.z, 0 at the front and 1 at the back), so the
   rise ripples outward from the stage and the whole crowd is up at the peak. */
const ARM_UP = 2.7, RISE_FROM = 0.3, RISE_SPAN = 0.6, RISE_W = 0.1;
/* How far a figure reaches in its own units, over every pose: its farthest vertex HAND from its axis (its arms level partway up the
   rise, swaying at the dance's widest), its highest TOP over its feet (its hands up at the rise's peak), and PAST beyond the bounds it
   stands in; and HANG with its arms hanging, as one standing fully still (aPart.w, seats.js) holds them. A seated figure's feet reach
   further than HANG ahead of it, 0.54 from its axis, but along the ground, under where a bear's reach is its snout. */
const HAND = 1.11, TOP = 2.08, PAST = 0.4, HANG = 0.354;
/* The visitor's bear reaches 1.98 m from its middle, halfway between its feet and its head (bears.js, avatar.js). */
const BEAR = 1.98;
/* The options buildCrowd hands parting() (seats.js) for figures at `scale`, up to the largest's size. A figure keeps 0.15 m past their
   bear's reach and its own from the visitor's middle where it has room, and never comes nearer than those two reaches, or nearer than
   the bear's reach and its hanging arms (HANG) while it stands still. It sees them coming 1.1 s ahead, steps aside at 5.5 m/s and walks
   back at 3; groups push apart within 1.4 m, past where two of the largest's hanging hands meet (0.35 units out, 1.32 m), and any
   within 2.85 m of one that has stepped aside stand still, fading over the last 0.5 m, out of reach of a dancer's hands (0.88 units
   out, 1.66 m). A figure standing fully still brings its arms down over a quarter second and raises them again once its stillness falls
   below a half, keeping to either for half a second at least; one at the fading edge rises with the rest. The walk's camera keeps 1.1 m
   out of them (avatar.js), past the near plane's corners in the widest view (1.04 m away on a phone held across, 19.5:9), rising over
   them ahead of reaching them. */
export function partingOptions(scale) {
  const big = scale * 1.08, hand = HAND * big, reach = BEAR + hand;
  return { keep: reach + 0.15, reach, hang: BEAR + HANG * big, lead: 1.1, step: 5.5, back: 3, space: 1.4, most: reach + 6, passes: 4,
    ring: 2.85, top: TOP * big, wide: hand, clear: 1.1, grade: 1.5 };
}

const f = (v) => v.toFixed(4);
/* After common: the crowd's attributes and uniforms, and `rot`, which turns a point in its plane by `a` rad. */
const DECLARE = `
attribute float aLeg;
attribute float aArm;
attribute float aWear;
attribute vec4 aFig;
attribute vec4 aPart;
attribute float aRise;
uniform float uBeat;
uniform float uDance;
uniform float uRise;
uniform float uSit;
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }`;
/* In the figure's own units, after begin_vertex: what the figure does not wear folds to a point inside its head (HAT, HAIR); then the rise,
   the sit, the arms, the legs and the sway, as far as the figure dances where it stands (aPart.w: still 1, at its seat 0). The hips
   come down to the beat and, sitting, to SEAT, and the rest of the figure with them. Each leg runs from its hip to its foot through
   the knee: the thigh from the leg's upper half and the shin from its lower, each keeping its thickness across the way it lies, the
   ring at the knee cut on the mitre between them; the foot stays flat. Every figure rises with the build-up as far as aRise lets it:
   all the way, but with its arms brought down while it stands fully still (seats.js). */
const DANCE = `
if (aWear > 0.5) {
  float pick = fract(aFig.y * 7.13 + 0.37);
  if (aWear < 1.5 ? pick >= ${f(HAT)} : (pick < ${f(HAIR[0])} || pick >= ${f(HAIR[1])})) transformed = vec3(0.0, ${f(HEAD_Y)}, 0.0);
}
float moves = 1.0 - aPart.w, dance = uDance * moves;
float rise = clamp((uRise - ${f(RISE_FROM)} - ${f(RISE_SPAN)} * aFig.z) / ${f(RISE_W)}, 0.0, 1.0) * aRise;
float sit = max(aFig.x, clamp(uSit * ${f(1 + STAGGER)} - aFig.y * ${f(STAGGER)}, 0.0, 1.0)) * (1.0 - rise);
float bounce = 0.5 + 0.5 * cos(6.2832 * (uBeat + ${f(JITTER)} * aFig.y));
if (aArm != 0.0) {
  float swing = rise * ${f(ARM_UP)} + (1.0 - rise) * dance * ${f(ARM_SWING)} * (1.0 - bounce);
  vec2 shoulder = vec2(aArm * ${f(SHOULDER_X)}, ${f(SHOULDER_Y)});
  transformed.xy = shoulder + rot(transformed.xy - shoulder, aArm * swing);
}
float bob = (1.0 - sit) * dance * (1.0 + rise) * ${f(BOB)} * bounce;
float lower = ${f(LEG * (1 - FOLD))} * bob + ${f(LEG - SEAT)} * sit;
if (aLeg > 0.5) {
  /* The hip, the foot and the knee between them, as [forward, up]. */
  vec2 hip = vec2(0.0, ${f(LEG)} - lower);
  vec2 foot = sit * vec2(${f(FOOT[0])}, ${f(FOOT[1])} - clamp(aFig.w, ${f(DROP[0])}, ${f(DROP[1])}));
  float span = max(distance(hip, foot), 1e-4);
  vec2 along = (foot - hip) / span;
  float half_ = 0.5 * min(span, ${f(LEG - 1e-3)});
  vec2 ahead = vec2(-along.y, along.x);
  vec2 knee = hip + along * half_ + ahead * sqrt(max(${f((LEG / 2) ** 2)} - half_ * half_, 0.0));
  foot = hip + along * min(span, ${f(LEG)});
  /* A foot lies along the ground it rests on: tipped, seated, as the ground falls from the seat to it. */
  if (aLeg > 1.5) transformed.zy = foot + rot(transformed.zy, -sit * atan(clamp(aFig.w, ${f(DROP[0])}, ${f(DROP[1])}), ${f(FOOT[0])}));
  else {
    float leg = clamp(transformed.y / ${f(LEG)}, 0.0, 1.0);
    vec2 thigh = normalize(knee - hip), shin = normalize(foot - knee);
    vec2 overThigh = vec2(-thigh.y, thigh.x), overShin = vec2(-shin.y, shin.x);
    vec2 over = leg > 0.51 ? overThigh : leg < 0.49 ? overShin : (overThigh + overShin) / max(dot(overThigh, overThigh + overShin), 0.4);
    transformed.zy = (leg > 0.5 ? mix(knee, hip, 2.0 * leg - 1.0) : mix(foot, knee, 2.0 * leg)) + transformed.z * over;
  }
} else transformed.y -= lower;
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
  const fig = new Float32Array(4 * n);
  const near = Math.min(...placed.map((p) => p.r)), far = Math.max(...placed.map((p) => p.r));
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  /* The seats come in a random order across the hill, so a figure's place in it picks its turn, its size, its colour and its phase. */
  placed.forEach((p, i) => {
    dummy.position.set(p.x, height(p.x, p.z), p.z);
    dummy.rotation.set(0, Math.atan2(STAGE[0] - p.x, STAGE[1] - p.z) + (i % 7 - 3) * 0.08, 0);
    /* Each is its own height, and as broad as the standard figure or up to 12 % slighter, so none reaches past the bounds below. */
    const tall = scale * (1 + ((i * 37) % 17 - 8) * 0.01), broad = 1 - 0.012 * ((i * 29) % 11);
    dummy.scale.set(tall * broad, tall, tall * broad);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(PALETTE[(i * 5) % PALETTE.length]));
    /* How far the ground falls from the seat to where a seated figure's feet rest, ahead of it the way it faces, in its own units. */
    const reach = FOOT[0] * tall * broad, turn = dummy.rotation.y;
    const drop = (height(p.x, p.z) - height(p.x + Math.sin(turn) * reach, p.z + Math.cos(turn) * reach)) / tall;
    fig.set([p.sit ? 1 : 0, (i * 0.618034) % 1, far > near ? (p.r - near) / (far - near) : 0, drop], 4 * i);
  });
  geo.setAttribute("aFig", new THREE.InstancedBufferAttribute(fig, 4));
  /* The parting (partingOptions), each figure keeping clear of what the seats keep clear of, and its hands of the stage's solids
     (STAGE_COLUMN). */
  const big = scale * 1.08, opts = partingOptions(scale);
  const parts = parting(placed, { ...opts, keeps: [...keepOuts(around), [STAGE[0], STAGE[1], STAGE_COLUMN.r + opts.wide]] });
  const aPart = new THREE.InstancedBufferAttribute(parts.offset, 4).setUsage(THREE.DynamicDrawUsage);
  const aRise = new THREE.InstancedBufferAttribute(parts.rising, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aPart", aPart);
  geo.setAttribute("aRise", aRise);
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
     (avatar.js), at once under reduced motion; the attributes go up only in a frame where a figure moved or eased its arms. */
  function part(dt, feet, head, reduced) {
    if (!parts.step(dt, feet, head, reduced)) return;
    aPart.needsUpdate = true;
    aRise.needsUpdate = true;
    mesh.boundingSphere.radius = rest + parts.farthest[0];
  }

  return { mesh, count: n, pose, part, over: parts.over, ahead: parts.ahead, hold: parts.hold, get parted() { return parts.parted; } };
}
