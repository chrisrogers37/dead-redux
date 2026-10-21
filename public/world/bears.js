/* eslint-disable */
import * as THREE from "three";
import { mesh } from "./landmarks.js";

/* Five bears in the dancing-bear colours (three on a phone), each a group whose four legs swing. */
export function buildBears(scene, phone) {
  const HUES = [0xd4607a, 0xd4a056, 0x78b070, 0x6898d0, 0x9a80c0];
  const bears = [];
  const bearCount = phone ? 3 : 5;
  for (let k = 0; k < bearCount; k++) {
    const m = new THREE.MeshLambertMaterial({ color: HUES[k], flatShading: true });
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(1.5, 8, 6), m, 0, 2.2, 0); body.scale.set(1, 1.3, 1);
    const head = mesh(new THREE.SphereGeometry(1.1, 8, 6), m, 0, 3.6, 0.8);
    const earL = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, -0.7, 4.5, 0.6), earR = mesh(new THREE.SphereGeometry(0.35, 6, 4), m, 0.7, 4.5, 0.6);
    const snout = mesh(new THREE.SphereGeometry(0.45, 6, 4), m, 0, 3.4, 1.8);
    const legs = [];
    for (const [lx, lz] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
      const leg = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 5), m, lx, 0.8, lz);
      legs.push(leg); g.add(leg);
    }
    g.add(body, head, earL, earR, snout);
    scene.add(g);
    bears.push({ g, legs, phase: k * 0.9 });
  }
  return bears;
}
