/* eslint-disable */
import * as THREE from "three";

export const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/* The builders table: a title rule and the landmark it builds; a song no rule matches gets a standing stone. */
export function makeBuilders(phone) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const amber = new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.6 });
  const moving = []; // objects that move while the show plays (still under reduced motion)

  const BUILDERS = [
    [/tuning/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), wood, 0, 3, 0), mesh(new THREE.SphereGeometry(1.2, 8, 6), amber, 0, 6.8, 0)); }],
    [/straw/i, (g) => { const b = mesh(new THREE.CylinderGeometry(2, 2, 4, 10), new THREE.MeshLambertMaterial({ color: 0xc9a24a, flatShading: true }), 0, 2, 0); b.rotation.z = Math.PI / 2; g.add(b); }],
    [/diamond/i, (g) => { g.add(mesh(new THREE.BoxGeometry(2, 1, 2), stone, 0, 0.5, 0), mesh(new THREE.OctahedronGeometry(2), new THREE.MeshLambertMaterial({ color: 0xbfe3ea, flatShading: true }), 0, 3.2, 0)); }],
    [/rider/i, (g) => { if (!phone) for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), wood, i * 2.4, 1.2, 0)); g.add(mesh(new THREE.BoxGeometry(10, 0.2, 0.2), wood, 0, 2, 0)); }],
    [/jed/i, (g) => { g.add(mesh(new THREE.BoxGeometry(5, 3, 4), wood, 0, 1.5, 0)); const r = mesh(new THREE.ConeGeometry(3.8, 2.2, 4), stone, 0, 4.1, 0); r.rotation.y = Math.PI / 4; g.add(r); }],
    [/esau/i, (g) => { g.add(mesh(new THREE.BoxGeometry(1.6, 5, 1.2), stone, -1.2, 2.5, 0), mesh(new THREE.BoxGeometry(1.6, 4.2, 1.2), stone, 1.2, 2.1, 0)); }],
    [/grey|gray/i, (g) => { g.add(mesh(new THREE.DodecahedronGeometry(3), new THREE.MeshLambertMaterial({ color: 0x7d7a74, flatShading: true }), 0, 2.4, 0)); }],
    [/snow/i, (g) => { g.add(mesh(new THREE.ConeGeometry(3, 7, 7), stone, 0, 3.5, 0), mesh(new THREE.ConeGeometry(1.4, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5.7, 0)); }],
    [/fire/i, (g) => { g.add(mesh(new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshLambertMaterial({ color: 0x4a3a30, flatShading: true }), 0, 2.5, 0), mesh(new THREE.ConeGeometry(1, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 0.8 }), 0, 6.2, 0)); const l = new THREE.PointLight(0xff8a3a, 40, 30); l.position.set(0, 6.5, 0); g.add(l); }],
    [/samson/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, -1.5, 3, 0)); const p = mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, 1.5, 2.8, 0); p.rotation.z = -0.25; g.add(p, mesh(new THREE.BoxGeometry(4.4, 0.6, 1), stone, 0, 6.3, 0)); }],
    [/wheel/i, (g) => { const w = mesh(new THREE.TorusGeometry(3.2, 0.4, 6, 16), wood, 0, 3.6, 0); g.add(w); moving.push({ obj: w, kind: "spin" }); }],
    [/miracle/i, (g) => { const s = mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 }), 0, 4, 0); g.add(s); moving.push({ obj: s, kind: "bob" }); }],
    [/band/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(4, 4, 0.8, 8), wood, 0, 0.4, 0)); if (!phone) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 5), wood, Math.cos(a) * 3.6, 2.3, Math.sin(a) * 3.6)); } g.add(mesh(new THREE.ConeGeometry(4.6, 2, 8), stone, 0, 4.8, 0)); }],
    [/drums/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 10), wood, -2, 1, 0), mesh(new THREE.CylinderGeometry(1.1, 1.1, 3, 10), wood, 0.6, 1.5, 1), mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.5, 10), wood, 2.4, 0.75, -1)); }],
    [/space/i, (g) => { g.add(mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.15, 0)); }],
    [/lovin/i, (g) => { const a = mesh(new THREE.BoxGeometry(1, 6, 1), stone, -1.6, 2.8, 0); a.rotation.z = -0.35; const b = mesh(new THREE.BoxGeometry(1, 6, 1), stone, 1.6, 2.8, 0); b.rotation.z = 0.35; g.add(a, b); }],
    [/road/i, (g) => { g.add(mesh(new THREE.BoxGeometry(4, 0.2, 18), stone, 0, 0.4, 0)); }],
    [/lovelight|light/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.2, 1.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5, 0)); const b = mesh(new THREE.BoxGeometry(1, 1, 1), amber, 0, 10.6, 0); g.add(b); moving.push({ obj: b, kind: "spin" }); }],
    [/blues/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 6), stone, 0, 6, 0), mesh(new THREE.BoxGeometry(3, 1.8, 0.05), new THREE.MeshLambertMaterial({ color: 0xd6508a }), 1.6, 11, 0)); }],
  ];
  const standingStone = (g) => g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), stone, 0, 2.25, 0));
  return { BUILDERS, standingStone, moving };
}
