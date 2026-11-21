/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mesh } from "./landmarks.js";

/* The bears are soft toys of a kind: round, smooth-shaded, each in one colour with a paler belly and muzzle, a dark nose and two dark
   eyes. They walk upright, arms swinging against their legs. */

/* A bear's fur: a smooth Lambert surface whose colour pales toward white where it turns from the eye, so its edge reads soft against the
   sky by day and stays dark at night. It is the surface's own colour that pales, never the light on it: at its palest the rim is
   still no brighter than a white surface under the same light, so the music's light swings no further on a bear's edge than on
   anything white. `vertexColors` for a body, which carries its colours on its vertices; without them for the limbs, which take each
   bear's colour by instance (drawLegs). */
export function furMaterial(vertexColors) {
  const m = new THREE.MeshLambertMaterial({ vertexColors });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      float fuzz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
      /* Fur pales; what is dark on a bear, its nose and its eyes, stays dark to its edge. */
      float furred = smoothstep(0.03, 0.2, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.45 * fuzz * furred);`);
  };
  return m;
}
const bodyMat = furMaterial(true);
/* A limb, the same on every bear: rounded, LIMB m long, hanging from its own origin, so it swings from the hip or the shoulder, with a
   paw at its end that reaches forward; and the white that each bear's colour tints (drawLegs). The paw is an egg PAW_UP m high and
   PAW_LONG m long about a point PAW_AT below and ahead of the origin. */
const LIMB = 1.6, PAW_UP = 0.34 * 0.72, PAW_LONG = 0.34 * 1.3, PAW_AT = [1.355, 0.14];
const LEG = mergeGeometries([
  new THREE.CapsuleGeometry(0.29, 0.92, 4, 10).translate(0, -0.75, 0),
  new THREE.SphereGeometry(0.34, 12, 6).scale(1, 0.72, 1.3).translate(0, -PAW_AT[0], PAW_AT[1]),
]);
const legMat = furMaterial(false);
/* Where each limb hangs from, in the bear's own frame: the arms from its shoulders, shorter and slimmer than the legs (a scale on
   the same limb), then the legs from its hips. The gait swings the first with the last and the second with the third, so an arm
   swings with the leg across from it. */
const LIMBS = [
  { at: [-1.15, 3.2, 0.2], scale: [0.88, 0.8, 0.88] }, { at: [1.15, 3.2, 0.2], scale: [0.88, 0.8, 0.88] },
  { at: [-0.5, 1.6, 0.05], scale: [1, 1, 1] }, { at: [0.5, 1.6, 0.05], scale: [1, 1, 1] },
];
/* The body: an egg 1.22 m to each side of its middle and 1.12 m fore and aft at its widest, 2.4 m up, drawing in by a fifth toward its
   shoulders, so the bear has a chest and a belly and not one round ball; from 0.6 m up to 4.15 m, which leaves its legs showing. */
function torso() {
  const geo = new THREE.SphereGeometry(1, 20, 14).scale(1.22, 1.78, 1.12).translate(0, 2.37, 0), pos = geo.attributes.position, normal = geo.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, (pos.getY(i) - 2.4) / 1.6)), draw = 1 - 0.2 * t * t * (3 - 2 * t), slope = (-0.2 * 6 * t * (1 - t)) / 1.6;
    pos.setXYZ(i, x * draw, pos.getY(i), z * draw);
    /* The normal turns with the surface: drawn in, it leans up where the body narrows. */
    n.fromBufferAttribute(normal, i);
    n.set(n.x / draw, n.y - (slope * (x * n.x + z * n.z)) / draw, n.z / draw).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return geo;
}
const INK = new THREE.Color(0x0b0b0d), WHITE = new THREE.Color(0xffffff);

/* A part of a bear's body, coloured by `paint`, which gives each vertex's colour from its place in the body. */
function part(geo, paint) {
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), at = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) paint(at.fromBufferAttribute(pos, i)).toArray(colors, i * 3);
  return geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/* One bear in a colour: a group whose four limbs swing, the rest of it one mesh. It stands 4.85 m tall and faces +z, inside the sizes
   the world keeps round a bear: its nose 2.36 m ahead of its centre and its arms, the widest of it, 1.45 m to either side, within the
   2.4 m and the 1.5 m the walk allows it (collide.js), and no part of it further than 1.98 m from its middle, which stands 0.4 m ahead
   of its centre, the reach the crowd parts round (crowd.js). bears.test.ts holds it to them. Its belly, its muzzle and the insides of
   its ears, a ruff round its neck and its round tail are paler; its nose and eyes are dark. Each limb stays in the group as a hidden mesh, where the gait swings it (stride) and
   what reads the bear's meshes finds it (main.js's bearsInView); drawLegs draws them. */
export function buildBear(scene, hue) {
  const fur = new THREE.Color(hue), pale = fur.clone().lerp(WHITE, 0.5), mix = new THREE.Color();
  const plain = (c) => () => c;
  const smooth = (edge0, edge1, x) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
  /* The belly: the front of the body, an oval 0.78 m to each side of its middle and 1.15 m above and below a point 2 m up. */
  const belly = (v) => mix.copy(fur).lerp(pale, v.z > 0.4 ? smooth(1, 0.72, Math.hypot(v.x / 0.78, (v.y - 2) / 1.15)) : 0);
  const ear = (v) => mix.copy(fur).lerp(pale, smooth(0.72, 0.84, v.z) * smooth(0.3, 0.16, Math.hypot(Math.abs(v.x) - 0.7, v.y - 4.5)));
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries([
    part(torso(), belly),
    part(new THREE.SphereGeometry(1.1, 20, 14).translate(0, 3.6, 0.8), plain(fur)),
    /* The small parts are round enough to keep a round outline a snout's length from the eye, in first person. */
    part(new THREE.SphereGeometry(0.35, 12, 8).translate(-0.7, 4.5, 0.6), ear),
    part(new THREE.SphereGeometry(0.35, 12, 8).translate(0.7, 4.5, 0.6), ear),
    part(new THREE.SphereGeometry(0.45, 16, 10).scale(1.15, 0.9, 1).translate(0, 3.4, 1.8), plain(pale)),
    part(new THREE.SphereGeometry(0.2, 12, 8).scale(1.2, 0.85, 1).translate(0, 3.5, 2.16), plain(INK)),
    part(new THREE.SphereGeometry(0.11, 8, 6).translate(-0.42, 3.9, 1.73), plain(INK)),
    part(new THREE.SphereGeometry(0.11, 8, 6).translate(0.42, 3.9, 1.73), plain(INK)),
    /* What shows from behind, where the walk's camera stands: a ruff round the neck, paler than the fur, and a round tail. */
    part(new THREE.TorusGeometry(0.74, 0.15, 5, 14).rotateX(Math.PI / 2 - 0.22).translate(0, 3.08, 0.32), plain(pale)),
    part(new THREE.SphereGeometry(0.24, 8, 6).translate(0, 1.42, -1.02), plain(pale)),
  ]), bodyMat);
  const legs = LIMBS.map(({ at: [x, y, z], scale: [sx, sy, sz] }) => {
    const leg = mesh(LEG, legMat, x, y, z);
    leg.scale.set(sx, sy, sz);
    leg.visible = false;
    return leg;
  });
  g.add(...legs, body);
  scene.add(g);
  return { g, legs, body, color: fur };
}

/* How far a leg swung by `angle` reaches below its hip: its paw's lowest point, as the paw turns with the leg. */
const legReach = (angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return PAW_AT[0] * c + PAW_AT[1] * s + Math.sqrt(PAW_UP * PAW_UP * c * c + PAW_LONG * PAW_LONG * s * s);
};
/* Swings a bear's limbs by `swing` radians: an arm with the leg across from it, the two legs against each other. A leg that swings
   from the hip lifts its paw, so the whole bear comes down by as much as its lower paw rose, and a paw stays on the ground through the
   stride. It never rises: early in a stride the toe of the forward paw dips a few millimetres under the ground instead. Returns how
   far the bear came down, in metres. */
const REST = legReach(0);
export function stride(bear, swing) {
  const { legs, body } = bear, drop = Math.max(0, REST - legReach(Math.abs(swing)));
  legs[0].rotation.x = swing; legs[3].rotation.x = swing; legs[1].rotation.x = -swing; legs[2].rotation.x = -swing;
  for (let k = 0; k < 4; k++) legs[k].position.y = LIMBS[k].at[1] - drop;
  body.position.y = 0 - drop;
  return drop;
}

/* The tier's bears (five, or three on a phone) in the dancing-bear colours. */
export function buildBears(scene, count) {
  const HUES = [0xd4607a, 0xd4a056, 0x78b070, 0x6898d0, 0x9a80c0];
  return HUES.slice(0, count).map((hue, k) => ({ ...buildBear(scene, hue), phase: k * 0.9 }));
}

/* Every leg of `bears` (each with its group, legs and colour, as buildBear makes them) as one instanced mesh, which costs one draw call
   where each leg cost its own. Before each render, once three has placed every part and before it culls or draws, the mesh takes the
   place of each leg of the bears the frame shows, in its bear's colour; a bear the downgrade has taken out of the scene shows none, nor
   a hidden one (the visitor's, in first person). */
export function drawLegs(scene, bears) {
  const legs = new THREE.InstancedMesh(LEG, legMat, 4 * bears.length);
  legs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12 * bears.length), 3);
  scene.add(legs);
  scene.onBeforeRender = () => {
    let n = 0;
    for (const b of bears) {
      if (b.g.parent !== scene || !b.g.visible) continue;
      for (const leg of b.legs) { legs.setMatrixAt(n, leg.matrixWorld); legs.setColorAt(n, b.color); n += 1; }
    }
    legs.count = n;
    legs.instanceMatrix.needsUpdate = true;
    legs.instanceColor.needsUpdate = true;
    legs.computeBoundingSphere();
  };
}
