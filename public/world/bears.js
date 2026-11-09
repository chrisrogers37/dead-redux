/* eslint-disable */
import * as THREE from "three";
import { mesh, mergeStill } from "./landmarks.js";

/* A dark tip on every snout, one material for all, so the head reads from the side. */
const tipMat = new THREE.MeshLambertMaterial({ color: 0x0b0b0d, flatShading: true });
/* A leg, the same on every bear, and the white that each bear's colour tints (drawLegs). */
const LEG = new THREE.CylinderGeometry(0.22, 0.22, 1.6, 5);
const legMat = new THREE.MeshLambertMaterial({ flatShading: true });

/* One bear in a colour: a group whose four legs swing, the rest of it one mesh. It stands 4.85 m tall and faces +z. Each leg stays in
   the group as a hidden mesh, where the gait swings it and what reads the bear's meshes finds it (main.js's bearsInView); drawLegs
   draws them. */
export function buildBear(scene, hue) {
  const m = new THREE.MeshLambertMaterial({ color: hue, flatShading: true });
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(1.5, 8, 6), m, 0, 2.2, 0); body.scale.set(1, 1.3, 1);
  const head = mesh(new THREE.SphereGeometry(1.1, 8, 6), m, 0, 3.6, 0.8);
  const earL = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, -0.7, 4.5, 0.6), earR = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, 0.7, 4.5, 0.6);
  const snout = mesh(new THREE.SphereGeometry(0.45, 6, 4), m, 0, 3.4, 1.8);
  const snoutTip = mesh(new THREE.SphereGeometry(0.2, 6, 4), tipMat, 0, 3.45, 2.2);
  const legs = [];
  for (const [lx, lz] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
    const leg = mesh(LEG, legMat, lx, 0.8, lz);
    leg.visible = false;
    legs.push(leg); g.add(leg);
  }
  g.add(body, head, earL, earR, snout, snoutTip);
  mergeStill(g, legs);
  scene.add(g);
  return { g, legs, color: m.color };
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
