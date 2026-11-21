/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mesh } from "./landmarks.js";

/* The bears are soft toys of a kind: round, smooth-shaded, each in one colour with a paler belly and muzzle, a dark nose and two dark
   eyes. They walk upright, arms swinging against their legs. */

/* A bear's fur: a smooth Lambert surface that brightens where it turns from the eye, by the light that already falls on it, so its
   edge reads soft against the sky by day and stays dark at night. `vertexColors` for a body, which carries its colours on its
   vertices; without them for the limbs, which take each bear's colour by instance (drawLegs). */
function furMaterial(vertexColors) {
  const m = new THREE.MeshLambertMaterial({ vertexColors });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      float fuzz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
      reflectedLight.indirectDiffuse *= 1.0 + 1.1 * fuzz;
      reflectedLight.directDiffuse *= 1.0 + 0.35 * fuzz;`);
  };
  return m;
}
const bodyMat = furMaterial(true);
/* A limb, the same on every bear: rounded, 1.6 m long, hanging from its own origin, so it swings from the hip or the shoulder, with a
   paw at its end that reaches forward; and the white that each bear's colour tints (drawLegs). */
const LEG = mergeGeometries([
  new THREE.CapsuleGeometry(0.29, 0.92, 5, 12).translate(0, -0.75, 0),
  new THREE.SphereGeometry(0.34, 12, 8).scale(1, 0.72, 1.3).translate(0, -1.355, 0.14),
]);
const legMat = furMaterial(false);
/* Where each limb hangs from, in the bear's own frame: the arms from its shoulders, shorter and slimmer than the legs (a scale on
   the same limb), then the legs from its hips. The gait swings the first with the last and the second with the third, so an arm
   swings with the leg across from it. */
const LIMBS = [
  { at: [-1.3, 3.15, 0.25], scale: [0.9, 0.78, 0.9] }, { at: [1.3, 3.15, 0.25], scale: [0.9, 0.78, 0.9] },
  { at: [-0.62, 1.6, 0], scale: [1, 1, 1] }, { at: [0.62, 1.6, 0], scale: [1, 1, 1] },
];
const INK = new THREE.Color(0x0b0b0d), WHITE = new THREE.Color(0xffffff);

/* A part of a bear's body, coloured by `paint`, which gives each vertex's colour from its place in the body. */
function part(geo, paint) {
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), at = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) paint(at.fromBufferAttribute(pos, i)).toArray(colors, i * 3);
  return geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/* One bear in a colour: a group whose four limbs swing, the rest of it one mesh. It stands 4.85 m tall and faces +z, within the same
   reach as ever: its body's flanks 1.5 m from its centre, its nose 2.4 m ahead of it (collide.js, crowd.js), and its arms 0.1 m past
   its flanks. Its belly, its muzzle and the
   insides of its ears are paler; its nose and eyes are dark. Each limb stays in the group as a hidden mesh, where the gait swings it
   and what reads the bear's meshes finds it (main.js's bearsInView); drawLegs draws them. */
export function buildBear(scene, hue) {
  const fur = new THREE.Color(hue), pale = fur.clone().lerp(WHITE, 0.5), mix = new THREE.Color();
  const plain = (c) => () => c;
  const smooth = (edge0, edge1, x) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
  /* The belly: the front of the body, an oval 0.95 m to each side of its middle and 1.25 m above and below a point 1.9 m up. */
  const belly = (v) => mix.copy(fur).lerp(pale, v.z > 0.5 ? smooth(1, 0.72, Math.hypot(v.x / 0.95, (v.y - 1.9) / 1.25)) : 0);
  const ear = (v) => mix.copy(fur).lerp(pale, smooth(0.72, 0.84, v.z) * smooth(0.3, 0.16, Math.hypot(Math.abs(v.x) - 0.7, v.y - 4.5)));
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries([
    part(new THREE.SphereGeometry(1.5, 22, 16).scale(1, 1.3, 1).translate(0, 2.2, 0), belly),
    part(new THREE.SphereGeometry(1.1, 22, 16).translate(0, 3.6, 0.8), plain(fur)),
    part(new THREE.SphereGeometry(0.35, 12, 8).translate(-0.7, 4.5, 0.6), ear),
    part(new THREE.SphereGeometry(0.35, 12, 8).translate(0.7, 4.5, 0.6), ear),
    part(new THREE.SphereGeometry(0.45, 14, 10).scale(1.15, 0.9, 1).translate(0, 3.4, 1.8), plain(pale)),
    part(new THREE.SphereGeometry(0.2, 10, 8).scale(1.2, 0.85, 1).translate(0, 3.5, 2.2), plain(INK)),
    part(new THREE.SphereGeometry(0.11, 8, 6).translate(-0.42, 3.9, 1.73), plain(INK)),
    part(new THREE.SphereGeometry(0.11, 8, 6).translate(0.42, 3.9, 1.73), plain(INK)),
  ]), bodyMat);
  const legs = LIMBS.map(({ at: [x, y, z], scale: [sx, sy, sz] }) => {
    const leg = mesh(LEG, legMat, x, y, z);
    leg.scale.set(sx, sy, sz);
    leg.visible = false;
    return leg;
  });
  g.add(...legs, body);
  scene.add(g);
  return { g, legs, color: fur };
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
