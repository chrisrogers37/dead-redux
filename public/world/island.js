/* eslint-disable */
import * as THREE from "three";

/* The island is the mark: a hill with two caves, a ring road and a lightning path. */

export const G = (gx, gy) => [(gx - 100) * 1.2, (gy - 100) * 1.2]; // the mark's 200 grid to metres
const CAVES = [G(66, 108), G(134, 108)];
export function height(x, z) {
  const d = Math.hypot(x, z);
  let h = 2.5 + 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
  const t = Math.max(0, 1 - (d / 84) * (d / 84));
  h += 28 * t * Math.sqrt(t);
  for (const [cx, cz] of CAVES) {
    const dc = Math.hypot(x - cx, z - cz);
    if (dc < 13) h -= 6 * (1 - (dc / 13) * (dc / 13));
  }
  const nose = Math.hypot(x, z - 26);
  if (nose < 9) h -= 2.5 * (1 - nose / 9);
  if (d > 118) h -= ((d - 118) / 10) * 5.5;
  return h;
}

/* The ground and the sea, then the ring road and the lightning path. */
export function buildIsland(scene, phone) {
  const ground = new THREE.PlaneGeometry(260, 260, phone ? 52 : 80, phone ? 52 : 80);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  scene.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ color: 0x5f6b4e, flatShading: true })));
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
  for (let s = 0; s < BOLT.length - 1; s++) {
    const [ax, az] = BOLT[s], [bx, bz] = BOLT[s + 1];
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, Math.hypot(x1 - x0, z1 - z0) + 0.4), bandMat);
      seg.position.set((x0 + x1) / 2, height((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2);
      seg.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      scene.add(seg);
    }
  }
}
