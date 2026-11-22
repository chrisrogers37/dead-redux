/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { isDrums, isSpace, isTuning } from "./seats.js";

export const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/* One material whose colour comes from the vertices, shared by every merged mesh. It shades by the normals each part brings: a part
   whose own material is flat-shaded brings its faces' normals (colouredPart), so it is as faceted merged as it was alone, and a
   part whose material is smooth keeps its round. */
const vertexColoured = new THREE.MeshLambertMaterial({ vertexColors: true });

/* A still mesh: a Lambert one that does not glow and is not listed in `keep`. Meshes that glow (an emissive colour) or wear another
   material (unlit or shiny), and lights, are never merged. */
const isStill = (c, keep) => c.isMesh && !keep.includes(c) && c.material.isMeshLambertMaterial && c.material.emissive.getHex() === 0;

/* A mesh's geometry in the space `matrix` takes it to, with a colour per vertex: the colours it already carries when its material
   reads them (a merged mesh), else its material's colour. A flat-shaded part's normals are its faces' own, and so are those of a
   part that brings none. Only the corners' places, normals and colours are kept: the merged mesh reads nothing else. */
function colouredPart(m, matrix) {
  const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(matrix);
  if (m.material.flatShading || !geo.attributes.normal) geo.computeVertexNormals();
  for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(name)) geo.deleteAttribute(name);
  if (!m.material.vertexColors) {
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) m.material.color.toArray(colors, i);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  return geo;
}

/* Merges a group's still meshes into one vertex-coloured mesh, so together they cost one draw call. */
export function mergeStill(group, keep = []) {
  const still = group.children.filter((c) => isStill(c, keep));
  if (still.length < 2) return;
  const parts = still.map((m) => {
    m.updateMatrix();
    return colouredPart(m, m.matrix);
  });
  group.remove(...still);
  group.add(new THREE.Mesh(mergeGeometries(parts), vertexColoured));
}

/* Every landmark's still parts in one mesh across the whole path. A landmark merged on its own (makeBuilders) still costs a draw call
   or two, and a view along the path from the walk's edge holds every landmark; merged across the path, their still parts cost one
   call between them. Run it after anything reads a landmark's own bounds (the camera's keep-out boxes, avatar.js), which the merge a
   landmark at a time keeps tight to its parts. A part that moves (`keep`), glows or wears another material stays in its landmark. */
export function mergeLandmarks(scene, landmarks, keep) {
  const still = landmarks.flatMap((g) => g.children.filter((c) => isStill(c, keep)));
  if (still.length < 2) return;
  scene.updateMatrixWorld(true);
  const parts = still.map((m) => colouredPart(m, m.matrixWorld));
  for (const m of still) m.removeFromParent();
  scene.add(new THREE.Mesh(mergeGeometries(parts), vertexColoured));
}

/* The builders table: a title rule and the landmark it builds; a song no rule matches gets a standing stone. */
export function makeBuilders(phone) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const amber = new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b, emissiveIntensity: 0.6 });
  const moving = []; // objects that spin, bob, pulse or swell, and the flame's light (still under reduced motion)

  /* A still part's material by its colour, smooth-shaded or flat, made once. */
  const tones = new Map();
  const tone = (color, flat = false) => {
    const key = `${color}:${flat}`;
    if (!tones.has(key)) tones.set(key, new THREE.MeshLambertMaterial({ color, flatShading: flat }));
    return tones.get(key);
  };
  /* Adds a part to a landmark at a place, turned (about z, then y, then x, as three turns it), and gives it back. */
  const put = (g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = mesh(geo, mat, x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  /* Stands a thing built in its own frame (`parts`, a group) in a landmark: each of its parts joins the landmark itself, placed,
     turned and scaled as the group was, since only a landmark's own parts merge. The group's scale is the same every way: a
     scale that differed by axis would shear a turned part, which a part's own place, turn and scale cannot hold. */
  const stand = (g, parts, x, y, z, rx = 0, ry = 0, rz = 0) => {
    parts.position.set(x, y, z);
    parts.rotation.set(rx, ry, rz);
    parts.updateMatrix();
    for (const m of [...parts.children]) { m.updateMatrix(); m.applyMatrix4(parts.matrix); g.add(m); }
  };
  /* How far a footing or a post goes on down under the landmark's own ground: a landmark stands level, and on a slope the ground
     falls away under its lower side. */
  const SUNK = 1.6;
  const BRASS = 0xb08a3c, TIMBER = 0x6b4e2e, DARK_TIMBER = 0x4a3520, ROOF = 0x3b2a1a, IRON = 0x55595c;
  const STRAW = 0xc9a24a, PALE_STRAW = 0xdcc079, LEATHER = 0x8a5a34, STRAP = 0x6a4426, STRING = 0xcfc8b4;

  /* Tuning: a guitar's tuning peg, taller than a bear. A turned post on a stone footing, brass collars, the string wound round it,
     and its key, a flattened oval, amber and glowing. */
  function tuningPeg(g) {
    put(g, new THREE.CylinderGeometry(1.1, 1.3, 0.4 + SUNK, 8), stone, 0, 0.2 - SUNK / 2, 0);
    put(g, new THREE.CylinderGeometry(0.8, 1.0, 0.35, 8), stone, 0, 0.575, 0);
    const turned = [[0.42, 0], [0.42, 0.4], [0.3, 0.65], [0.26, 2], [0.34, 2.25], [0.34, 2.6], [0.24, 2.85], [0.22, 4.1], [0.36, 4.35], [0.36, 4.6], [0.2, 4.8]];
    put(g, new THREE.LatheGeometry(turned.map(([r, y]) => new THREE.Vector2(r, y)), phone ? 8 : 12), tone(TIMBER), 0, 0.75, 0);
    for (const y of [3.2, 5.2]) put(g, new THREE.TorusGeometry(0.36, 0.07, 5, 12), tone(BRASS), 0, y, 0, Math.PI / 2);
    for (let k = 0; k < (phone ? 3 : 6); k++) put(g, new THREE.TorusGeometry(0.29, 0.035, 4, 10), tone(STRING), 0, 3.75 + 0.11 * k, 0, Math.PI / 2 + 0.06);
    put(g, new THREE.CylinderGeometry(0.14, 0.2, 0.7, 8), tone(BRASS), 0, 5.85, 0);
    /* The key's top is 8 m up, as the ball's was: a phone's title plate stands just over it in the opening view. */
    g.add(mesh(new THREE.SphereGeometry(1.2, 14, 10).scale(1, 0.82, 0.42), amber, 0, 7.0, 0));
  }

  /* A round bale of straw lying along x in its own frame: the coil showing at each end, and two bands of twine. */
  function bale(r, long) {
    const parts = new THREE.Group();
    put(parts, new THREE.CylinderGeometry(r, r, long, phone ? 10 : 16), tone(STRAW), 0, 0, 0, 0, 0, Math.PI / 2);
    for (const end of [-1, 1]) [0.3, 0.58, 0.86].forEach((share, k) => put(parts, new THREE.TorusGeometry(share * r, 0.07, 3, phone ? 10 : 16), tone(k % 2 ? STRAW : PALE_STRAW), end * (long / 2 + 0.01), 0, 0, 0, Math.PI / 2));
    for (const x of [-long / 4, long / 4]) put(parts, new THREE.TorusGeometry(r + 0.02, 0.045, 4, phone ? 12 : 20), tone(DARK_TIMBER), x, 0, 0, 0, Math.PI / 2);
    return parts;
  }
  /* Jack Straw: two bales, the small one against the big one, and a pitchfork leaning on the big one. Each
     bale lies BALE_SUNK m into the ground, as a heavy bale settles, which also keeps it on a slope's lower side. */
  const BALE_SUNK = 0.45;
  function strawBales(g) {
    stand(g, bale(1.9, 3.6), 0, 1.9 - BALE_SUNK, 0, 0, 0.25, 0);
    stand(g, bale(1.15, 2.3), 2.9, 1.15 - BALE_SUNK, 1.5, 0, 1.2, 0);
    /* The pitchfork leans on the big bale, on the side the walker comes from, its foot in the ground and its tines up. */
    const fork = new THREE.Group();
    put(fork, new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), tone(TIMBER), 0, 1.8, 0);
    put(fork, new THREE.BoxGeometry(0.7, 0.08, 0.08), tone(IRON), 0, 3.6, 0);
    for (const x of [-0.3, 0, 0.3]) put(fork, new THREE.ConeGeometry(0.045, 0.85, 4), tone(IRON), x, 4.05, 0);
    stand(g, fork, -0.5, -0.35, -2.45, 0.36, 0.25, 0);
  }

  /* Dupree's Diamond Blues: a cut stone, its table up and its point down, held in four brass claws over a stepped stone foot. */
  function cutDiamond(g) {
    put(g, new THREE.CylinderGeometry(1.5, 1.7, 0.45 + SUNK, 8), stone, 0, 0.225 - SUNK / 2, 0);
    put(g, new THREE.CylinderGeometry(1.15, 1.35, 0.4, 8), stone, 0, 0.65, 0);
    put(g, new THREE.CylinderGeometry(0.6, 0.95, 0.9, 8), stone, 0, 1.3, 0);
    const ice = tone(0xbfe3ea, true), girdle = 4.15, cut = 8;
    put(g, new THREE.ConeGeometry(1.7, 2.3, cut), ice, 0, girdle - 1.15, 0, Math.PI);
    put(g, new THREE.CylinderGeometry(1.72, 1.72, 0.1, cut), tone(0xe4f3f6, true), 0, girdle + 0.05, 0);
    put(g, new THREE.CylinderGeometry(1.0, 1.7, 0.8, cut), ice, 0, girdle + 0.5, 0);
    for (let k = 0; k < 4; k++) {
      const turn = (k / 4) * 2 * Math.PI + Math.PI / 8, claw = new THREE.Group();
      put(claw, new THREE.CylinderGeometry(0.07, 0.1, 2.9, 5), tone(BRASS), 0, 1.45, 0);
      put(claw, new THREE.SphereGeometry(0.14, 6, 5), tone(BRASS), 0, 2.9, 0);
      stand(g, claw, 0.5 * Math.cos(turn), 1.55, 0.5 * Math.sin(turn), 0, -turn, -0.44);
    }
  }

  /* C C Rider: a hitching rail of split timber, its posts leaning as they like, a saddle over the top rail and a rope coiled on
     the end post. A phone draws three posts and no rope. */
  function hitchingRail(g) {
    const posts = phone ? [-2, 0, 2] : [-2, -1, 0, 1, 2], gap = phone ? 4.8 : 2.4;
    posts.forEach((i, k) => {
      const lean = 0.05 * Math.sin(i * 2.3 + 1);
      put(g, new THREE.CylinderGeometry(0.15, 0.2, 2.6 + SUNK, 6), tone(TIMBER, true), i * 2.4 + (SUNK / 2) * Math.sin(lean), 1.3 - SUNK / 2, 0, 0, 0, lean);
      put(g, new THREE.ConeGeometry(0.19, 0.32, 6), tone(DARK_TIMBER, true), i * 2.4 - 1.44 * Math.sin(lean), 2.74, 0, 0, 0, lean);
      if (k === posts.length - 1) return;
      [[1.95, 0.13], [1.1, -0.13]].forEach(([y, z], rail) => put(g, new THREE.BoxGeometry(gap + 0.5, 0.17, 0.13), tone(rail ? DARK_TIMBER : TIMBER, true), i * 2.4 + gap / 2, y, z, 0.2 * (rail ? -1 : 1), 0, 0.03 * Math.sin(i * 3.1 + rail)));
    });
    const saddle = new THREE.Group(), hide = tone(LEATHER);
    for (const side of [-1, 1]) {
      put(saddle, new THREE.BoxGeometry(1.25, 0.95, 0.05), tone(0xc85a72), 0, -0.3, side * 0.4, side * 0.3);
      put(saddle, new THREE.BoxGeometry(1.27, 0.12, 0.06), tone(STRING), 0, -0.62, side * 0.5, side * 0.3);
    }
    put(saddle, new THREE.SphereGeometry(0.6, 12, 8).scale(1.25, 0.42, 0.85), hide, 0, 0.12, 0);
    put(saddle, new THREE.SphereGeometry(0.34, 8, 6).scale(0.4, 0.95, 1.5), hide, -0.62, 0.34, 0);
    put(saddle, new THREE.CylinderGeometry(0.07, 0.11, 0.36, 6), hide, 0.6, 0.4, 0);
    put(saddle, new THREE.SphereGeometry(0.12, 6, 5), tone(DARK_TIMBER), 0.6, 0.62, 0);
    for (const side of [-1, 1]) {
      put(saddle, new THREE.BoxGeometry(0.8, 0.6, 0.06), tone(0x7a5230), 0, -0.2, side * 0.47, side * 0.3);
      /* A stirrup's strap hangs straight down from behind the skirt's lower edge, and the stirrup from the strap's foot. */
      put(saddle, new THREE.BoxGeometry(0.07, 0.9, 0.03), tone(STRAP), 0.05, -0.85, side * 0.42);
      put(saddle, new THREE.TorusGeometry(0.15, 0.03, 4, 8), tone(IRON), 0.05, -1.4, side * 0.42, 0, Math.PI / 2);
    }
    saddle.scale.setScalar(1.35);
    stand(g, saddle, 1.2, 2.2, 0.13, 0, 0.08, 0.03);
    if (!phone) for (const [r, tip] of [[0.4, 0.15], [0.33, -0.2]]) put(g, new THREE.TorusGeometry(r, 0.05, 5, 14), tone(STRING), -4.8, 1.75, 0.24, tip, 0, 0.1);
  }

  /* Tennessee Jed: a log cabin. Six courses of logs crossing at the corners on a stone footing, a plank roof with a gable at each end,
     a stone chimney, a door and a pale window, and a porch along the front with a barrel on it. The window does not glow: in the
     deep of the night the stage is the island's one warm light. */
  function logCabin(landmark) {
    const g = new THREE.Group();
    const log = tone(TIMBER), plank = tone(DARK_TIMBER, true), round = phone ? 6 : 8;
    put(g, new THREE.BoxGeometry(5.5, 0.3 + SUNK, 4.5), stone, 0, 0.15 - SUNK / 2, 0);
    for (let k = 0; k < 6; k++) {
      const y = 0.53 + 0.45 * k;
      for (const z of [-1.95, 1.95]) put(g, new THREE.CylinderGeometry(0.235, 0.235, 5.7, round), log, 0, y, z, 0, 0, Math.PI / 2);
      for (const x of [-2.45, 2.45]) put(g, new THREE.CylinderGeometry(0.235, 0.235, 4.7, round), log, x, y + 0.225, 0, Math.PI / 2);
    }
    /* A sill under each side wall, whose first log lies half a course up, and a board under each eave, where the front and back
       walls stop short of the roof. */
    for (const x of [-2.45, 2.45]) put(g, new THREE.BoxGeometry(0.4, 0.26, 3.6), plank, x, 0.42, 0);
    for (const z of [-1.95, 1.95]) put(g, new THREE.BoxGeometry(5.3, 0.34, 0.3), plank, 0, 3.17, z);
    /* The gables: a triangle of planks at each end, between the top logs and the ridge. */
    const eave = 3.25, ridge = 4.85, half = 2.25;
    const gable = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, ridge - eave)]);
    for (const x of [-2.5, 2.4]) put(g, new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }), plank, x, eave, 0, 0, Math.PI / 2);
    const pitch = Math.atan2(ridge - eave, half), slope = Math.hypot(ridge - eave, half) + 0.55;
    for (const side of [-1, 1]) put(g, new THREE.BoxGeometry(6.1, 0.14, slope), tone(ROOF, true), 0, (eave + ridge) / 2 - 0.06, side * (half / 2 + 0.2), side * pitch);
    put(g, new THREE.BoxGeometry(6.2, 0.16, 0.3), tone(ROOF, true), 0, ridge + 0.1, 0);
    /* The chimney, up the back wall and past the ridge. */
    put(g, new THREE.BoxGeometry(1.0, 5.6 + SUNK, 0.9), stone, 1.3, 2.8 - SUNK / 2, -2.3);
    put(g, new THREE.BoxGeometry(1.25, 0.22, 1.15), tone(0x6f6a63, true), 1.3, 5.7, -2.3);
    /* The door and the window, proud of the front wall's logs. */
    put(g, new THREE.BoxGeometry(1.15, 2.1, 0.1), plank, -0.8, 1.45, 2.2);
    put(g, new THREE.BoxGeometry(0.95, 1.9, 0.12), tone(0x2e2015, true), -0.8, 1.4, 2.22);
    put(g, new THREE.SphereGeometry(0.06, 6, 5), tone(BRASS), -0.45, 1.4, 2.3);
    put(g, new THREE.BoxGeometry(1.1, 1.0, 0.1), plank, 1.25, 1.95, 2.2);
    put(g, new THREE.BoxGeometry(0.9, 0.8, 0.12), tone(0xe8c477, true), 1.25, 1.95, 2.22);
    put(g, new THREE.BoxGeometry(0.06, 0.78, 0.14), plank, 1.25, 1.95, 2.23);
    put(g, new THREE.BoxGeometry(0.88, 0.06, 0.14), plank, 1.25, 1.95, 2.23);
    /* The porch: its boards, two posts and a lean-to roof, and a barrel by the door. */
    put(g, new THREE.BoxGeometry(5.4, 0.2, 1.5), plank, 0, 0.4, 2.95);
    put(g, new THREE.BoxGeometry(5.2, 0.3 + SUNK, 1.3), stone, 0, 0.15 - SUNK / 2, 2.95);
    for (const x of [-2.5, 2.5]) put(g, new THREE.CylinderGeometry(0.1, 0.12, 2.35, 6), log, x, 1.67, 3.55);
    put(g, new THREE.BoxGeometry(5.9, 0.1, 1.9), tone(ROOF, true), 0, 2.98, 3.0, 0.26);
    put(g, new THREE.CylinderGeometry(0.36, 0.3, 0.85, 10), tone(0x7a5a36), -2.0, 0.92, 3.1);
    for (const y of [0.72, 1.14]) put(g, new THREE.TorusGeometry(0.345, 0.03, 4, 10), tone(IRON), -2.0, y, 3.1, Math.PI / 2);
    /* Its door faces the walker who comes up the path. */
    stand(landmark, g, 0, 0, 0, 0, Math.PI, 0);
  }

  const BUILDERS = [
    /* The tuning peg, Drums and Space by the world's title rule (seats.js); each other landmark by its song's name anywhere in a title. */
    [{ test: isTuning }, tuningPeg],
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
    [/straw/i, strawBales],
    [/diamond/i, cutDiamond],
    [/rider/i, hitchingRail],
    [/jed/i, logCabin],
    [/esau/i, (g) => { g.add(mesh(new THREE.BoxGeometry(1.6, 5, 1.2), stone, -1.2, 2.5, 0), mesh(new THREE.BoxGeometry(1.6, 4.2, 1.2), stone, 1.2, 2.1, 0)); }],
    [/grey|gray/i, (g) => { g.add(mesh(new THREE.DodecahedronGeometry(3), new THREE.MeshLambertMaterial({ color: 0x7d7a74, flatShading: true }), 0, 2.4, 0)); }],
    [/snow/i, (g) => { g.add(mesh(new THREE.ConeGeometry(3, 7, 7), stone, 0, 3.5, 0), mesh(new THREE.ConeGeometry(1.4, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5.7, 0)); }],
    /* The flame stands on the mountain's top, 5 m up, with its base at its own origin, so a swell grows it up and out from there. */
    [/fire/i, (g) => { const f = mesh(new THREE.ConeGeometry(1, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 0.8 }), 0, 5, 0); g.add(mesh(new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshLambertMaterial({ color: 0x4a3a30, flatShading: true }), 0, 2.5, 0), f); moving.push({ obj: f, kind: "swell" }); if (!phone) { const l = new THREE.PointLight(0xff8a3a, 40, 30); l.position.set(0, 6.5, 0); g.add(l); moving.push({ obj: l, kind: "flame", base: l.intensity }); } }],
    [/samson/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, -1.5, 3, 0)); const p = mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 8), stone, 1.5, 2.8, 0); p.rotation.z = -0.25; g.add(p, mesh(new THREE.BoxGeometry(4.4, 0.6, 1), stone, 0, 6.3, 0)); }],
    [/wheel/i, (g) => { const w = mesh(new THREE.TorusGeometry(3.2, 0.4, 6, 16), wood, 0, 3.6, 0); g.add(w); moving.push({ obj: w, kind: "spin" }); }],
    [/miracle/i, (g) => { const s = mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 }), 0, 4, 0); g.add(s); moving.push({ obj: s, kind: "bob" }); }],
    [/band/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(4, 4, 0.8, 8), wood, 0, 0.4, 0)); if (!phone) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 5), wood, Math.cos(a) * 3.6, 2.3, Math.sin(a) * 3.6)); } g.add(mesh(new THREE.ConeGeometry(4.6, 2, 8), stone, 0, 4.8, 0)); }],
    [{ test: isDrums }, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 10), wood, -2, 1, 0), mesh(new THREE.CylinderGeometry(1.1, 1.1, 3, 10), wood, 0.6, 1.5, 1), mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.5, 10), wood, 2.4, 0.75, -1)); }],
    [{ test: isSpace }, (g) => { g.add(mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.15, 0)); }],
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
