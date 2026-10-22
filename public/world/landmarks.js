/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/* One flat-shaded material whose colour comes from the vertices, shared by every merged mesh. */
const vertexColoured = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/* Merges a group's still Lambert meshes into one vertex-coloured mesh, so together they cost one draw call. Meshes listed in `keep`,
   meshes that glow (an emissive colour) or wear another material (unlit or shiny), and lights stay as they are. */
export function mergeStill(group, keep = []) {
  const still = group.children.filter((c) => c.isMesh && !keep.includes(c) && c.material.isMeshLambertMaterial && c.material.emissive.getHex() === 0);
  if (still.length < 2) return;
  const parts = still.map((m) => {
    m.updateMatrix();
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) m.material.color.toArray(colors, i);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  });
  group.remove(...still);
  group.add(new THREE.Mesh(mergeGeometries(parts), vertexColoured));
}

/* The builders table: a title rule and the landmark it builds; a song no rule matches gets a standing stone. */
export function makeBuilders(phone) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const amber = new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.6 });
  const moving = []; // objects that spin, bob or pulse (still under reduced motion)

  const BUILDERS = [
    [/tuning/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), wood, 0, 3, 0), mesh(new THREE.SphereGeometry(1.2, 8, 6), amber, 0, 6.8, 0)); }],
    [/playin/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), wood, 0, 3.5, 0)); const k = mesh(new THREE.BoxGeometry(1.8, 1.8, 0.08), new THREE.MeshLambertMaterial({ color: 0xd4607a, flatShading: true }), 0, 7.6, 0); k.rotation.z = Math.PI / 4; g.add(k); }],
    [/truckin/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6), stone, 0, 2.2, 0)); const s = mesh(new THREE.BoxGeometry(1.7, 1.7, 0.1), new THREE.MeshLambertMaterial({ color: 0xd4a056, flatShading: true }), 0, 4.6, 0.1); s.rotation.z = Math.PI / 4; g.add(s); }],
    [/sugar magnolia|sugaree/i, (g) => { g.add(mesh(new THREE.IcosahedronGeometry(2, 0), new THREE.MeshLambertMaterial({ color: 0x78b070, flatShading: true }), 0, 1.6, 0)); const rose = new THREE.MeshLambertMaterial({ color: 0xd4607a, flatShading: true }); for (const [x, y, z] of [[1.2, 2.6, 0.8], [-1.1, 2.4, 1], [0.2, 3.4, -0.6], [-0.9, 1.6, -1.4], [1.5, 1.4, -0.9]]) g.add(mesh(new THREE.SphereGeometry(0.35, 6, 4), rose, x, y, z)); }],
    [/ripple/i, (g) => { g.add(mesh(new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0e1014 }), 0, 0.12, 0)); const r = mesh(new THREE.TorusGeometry(3.2, 0.15, 6, 32), stone, 0, 0.15, 0); r.rotation.x = -Math.PI / 2; g.add(r); }],
    [/eyes/i, (g) => { for (const x of [-0.9, 0.9]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), wood, x, 1.6, 0), mesh(new THREE.SphereGeometry(0.45, 8, 6), amber, x, 3.5, 0)); }],
    [/scarlet/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.5, 6), wood, -1.1, 3.25, 0), mesh(new THREE.BoxGeometry(2, 3, 0.06), new THREE.MeshLambertMaterial({ color: 0xb8333a, flatShading: true }), 0, 4.6, 0)); }],
    [/terrapin/i, (g) => { for (const x of [-1.1, 1.1]) for (const z of [-1.2, 1.2]) g.add(mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), stone, x, 0.35, z)); const d = mesh(new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 1.3, 0); d.scale.set(1, 0.7, 1.1); g.add(mesh(new THREE.BoxGeometry(2.8, 0.6, 3.2), stone, 0, 1, 0), d, mesh(new THREE.SphereGeometry(0.45, 8, 6), stone, 0, 1, 2)); }],
    [/dark star/i, (g) => { g.add(mesh(new THREE.BoxGeometry(2, 1.2, 2), stone, 0, 0.6, 0), mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0x0b0b0d }), 0, 2.6, 0)); }],
    [/morning dew/i, (g) => { g.add(mesh(new THREE.DodecahedronGeometry(2.2), new THREE.MeshPhongMaterial({ color: 0x7d7a74, specular: 0xffffff, shininess: 80, flatShading: true }), 0, 1.8, 0)); }],
    [/box of rain/i, (g) => { for (const z of [-1.5, 1.5]) g.add(mesh(new THREE.BoxGeometry(3.2, 2.6, 0.2), stone, 0, 1.3, z)); for (const x of [-1.5, 1.5]) g.add(mesh(new THREE.BoxGeometry(0.2, 2.6, 2.8), stone, x, 1.3, 0)); }],
    [/not fade/i, (g) => { g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), stone, 0, 2.25, 0)); const l = mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.6 }), 0, 5, 0); g.add(l); moving.push({ obj: l, kind: "pulse" }); }],
    [/one more saturday/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), wood, 0, 2.5, 0)); for (const [x, y, ry] of [[0.9, 4.2, 0.4], [-0.9, 3.5, -0.5]]) { const b = mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), wood, x, y, 0); b.rotation.y = ry; g.add(b); } }],
    [/straw/i, (g) => { const b = mesh(new THREE.CylinderGeometry(2, 2, 4, 10), new THREE.MeshLambertMaterial({ color: 0xc9a24a, flatShading: true }), 0, 2, 0); b.rotation.z = Math.PI / 2; g.add(b); }],
    [/diamond/i, (g) => { g.add(mesh(new THREE.BoxGeometry(2, 1, 2), stone, 0, 0.5, 0), mesh(new THREE.OctahedronGeometry(2), new THREE.MeshLambertMaterial({ color: 0xbfe3ea, flatShading: true }), 0, 3.2, 0)); }],
    [/rider/i, (g) => { if (!phone) for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), wood, i * 2.4, 1.2, 0)); g.add(mesh(new THREE.BoxGeometry(10, 0.2, 0.2), wood, 0, 2, 0)); }],
    [/jed/i, (g) => { g.add(mesh(new THREE.BoxGeometry(5, 3, 4), wood, 0, 1.5, 0)); const r = mesh(new THREE.ConeGeometry(3.8, 2.2, 4), stone, 0, 4.1, 0); r.rotation.y = Math.PI / 4; g.add(r); }],
    [/esau/i, (g) => { g.add(mesh(new THREE.BoxGeometry(1.6, 5, 1.2), stone, -1.2, 2.5, 0), mesh(new THREE.BoxGeometry(1.6, 4.2, 1.2), stone, 1.2, 2.1, 0)); }],
    [/grey|gray/i, (g) => { g.add(mesh(new THREE.DodecahedronGeometry(3), new THREE.MeshLambertMaterial({ color: 0x7d7a74, flatShading: true }), 0, 2.4, 0)); }],
    [/snow/i, (g) => { g.add(mesh(new THREE.ConeGeometry(3, 7, 7), stone, 0, 3.5, 0), mesh(new THREE.ConeGeometry(1.4, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5.7, 0)); }],
    [/fire/i, (g) => { g.add(mesh(new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshLambertMaterial({ color: 0x4a3a30, flatShading: true }), 0, 2.5, 0), mesh(new THREE.ConeGeometry(1, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 0.8 }), 0, 6.2, 0)); if (!phone) { const l = new THREE.PointLight(0xff8a3a, 40, 30); l.position.set(0, 6.5, 0); g.add(l); } }],
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
  /* Each landmark's still parts merge into one mesh once it is built; a part that moves stays apart. */
  const merged = (build) => (g) => { build(g); mergeStill(g, moving.map((m) => m.obj)); };
  return { BUILDERS: BUILDERS.map(([re, build]) => [re, merged(build)]), standingStone: merged(standingStone), moving };
}
