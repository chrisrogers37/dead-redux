/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAVES, G, height } from "./ground.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, and at its north-east edge a shelf for the stage.
   The ground's height is in ground.js. */

/* A ground vertex whose normal leans more than 35 degrees from straight up stands on a steep slope. */
const STEEP = Math.cos((35 * Math.PI) / 180);

/* The ground (a grid of the tier's size, coloured by vertex) and the sea, then the ring road and the lightning path, then the caves'
   pools and lights, which it returns. */
export function buildIsland(scene, grid, phone) {
  const ground = new THREE.PlaneGeometry(260, 260, grid, grid);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  /* The caves' bowls are dark, slopes steeper than 35 degrees are stone, the shore past the ring road is sand, and the rest is grass. */
  const normal = ground.attributes.normal, colors = new Float32Array(pos.count * 3), color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const hex = CAVES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 13) ? 0x2a2622
      : normal.getY(i) < STEEP ? 0x8e8a82 : Math.hypot(x, z) > 118 ? 0x8a8370 : 0x5f6b4e;
    color.setHex(hex).toArray(colors, i * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0e1014 })));

  /* The ring road and the lightning path, as flat bands just above the ground. */
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x8e8a82 });
  /* The ring lies on the ground, so it follows the shore's gentle rise and fall. */
  const ringGeo = new THREE.RingGeometry(112, 118, 160, 2).rotateX(-Math.PI / 2);
  const ringPos = ringGeo.attributes.position;
  for (let i = 0; i < ringPos.count; i++) ringPos.setY(i, height(ringPos.getX(i), ringPos.getZ(i)) + 0.2);
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(ringGeo, bandMat);
  scene.add(ring);
  const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)];
  /* The lightning path's segments merge into one mesh: one draw call instead of seventy-two. */
  const segments = [];
  for (let s = 0; s < BOLT.length - 1; s++) {
    const [ax, az] = BOLT[s], [bx, bz] = BOLT[s + 1];
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      const geo = new THREE.BoxGeometry(3, 0.3, Math.hypot(x1 - x0, z1 - z0) + 0.4);
      geo.rotateY(Math.atan2(x1 - x0, z1 - z0));
      geo.translate((x0 + x1) / 2, height((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2);
      segments.push(geo);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(segments), bandMat));

  /* The caves light for Drums (left) and Space (right): a pool on each floor and, but on a phone, a light inside. */
  const caves = CAVES.map(([cx, cz]) => {
    const poolGeo = new THREE.RingGeometry(0, 8, 32, 8).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    const poolPos = poolGeo.attributes.position;
    for (let i = 0; i < poolPos.count; i++) poolPos.setY(i, height(poolPos.getX(i), poolPos.getZ(i)) + 0.15);
    const disc = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: 0xd6508a, transparent: true, opacity: 0, depthWrite: false }));
    disc.visible = false;
    scene.add(disc);
    let light = null;
    if (!phone) {
      light = new THREE.PointLight(0xd6508a, 0, 30);
      light.position.set(cx, height(cx, cz) + 4, cz);
      scene.add(light);
    }
    return { disc, light, level: 0 };
  });
  return { caves };
}
