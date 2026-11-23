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

/* A song's name as its stone is picked by, so that one song has one stone however a show's taper wrote it. The rule, in order: an
   accent is dropped from its letter ("Señor" is "senor"); capitals are lowered; a leading "the" is dropped ("The Other One" is
   "Other One"); a dropped g is put back, "in'" at a word's end read as "ing" ("Throwin' Stones" is "Throwing Stones"); and then
   only letters and digits count, so a space, a comma or a segue mark changes nothing ("Deal" and "Deal ->" are one song). */
export const songKey = (title) => String(title ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^\s*the\s+/, "").replace(/in['\u2019](?![a-z])/g, "ing").replace(/[^a-z0-9]/g, "");
/* A title's number, 0 to 2^32: FNV-1a over its song's name (songKey), then mixed so the low bits spread. Never Math.random: a song
   has the same stone every day. */
export const titleHash = (title) => {
  const s = songKey(title);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
};
export const STONE_KINDS = 8;
export const stoneKind = (title) => titleHash(title) % STONE_KINDS;

/* The builders table: a title rule and the landmark it builds; a song no rule matches gets one of eight standing stones, by its title. */
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

  /* A number 0 to 1 from a corner's own place and a salt, the same on every visit, so corners that faces share move together and a
     landmark is built the same each time. */
  const roll = (x, y, z, salt) => {
    let h = Math.imul(Math.round(x * 97), 374761393) ^ Math.imul(Math.round(y * 97), 668265263) ^ Math.imul(Math.round(z * 97), 1274126177) ^ Math.imul(salt, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  /* Rough stone: a shape whose corners stand in or out from its own middle line by up to `rough` of where they were. `keep` says
     which corners stay put (a peak's tip). */
  const roughen = (geo, rough, salt, keep = () => false) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (keep(x, y, z)) continue;
      const k = 1 - rough + 2 * rough * roll(x, y, z, salt);
      pos.setXYZ(i, x * k, y, z * k);
    }
    return geo;
  };
  /* A boulder `r` across its half, rough all round. */
  const rock = (r, detail, rough, salt) => {
    const geo = new THREE.IcosahedronGeometry(r, detail), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 - rough + 2 * rough * roll(x, y, z, salt);
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    return geo;
  };
  /* Paints a shape face by face: `colour(x, y, z)` of a face's middle, in the shape's own frame, gives its hex. The part then wears
     `painted`, which reads those colours and shades flat. */
  const painted = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const paint = (source, colour) => {
    const geo = source.index ? source.toNonIndexed() : source, pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      c.setHex(colour((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3));
      for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
    }
    return geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  /* A loose stone lies with its middle LOOSE of its radius under the landmark's ground, so most of it is in the ground, it still
     shows on the level, and a slope's lower side seldom shows under it. */
  const LOOSE = -0.55;
  const GREY = 0x7d7a74, PALE_STONE = 0xa9a59c, MOSS = 0x55663f, SNOW = 0xeceae4, BASALT = 0x4a3a30, PINE = 0x33503a;

  /* Where a landmark stands is reckoned from its outline seen from above (path.js): one that reaches further than the bears' line
     leaves room for is stood off its song's point, as far as it must go, and on the summit that is a long way. So each of these
     keeps inside the outline of the plain shape it replaced, on a phone as on a desktop, and stands where that shape stood. */

  /* My Brother Esau: two standing stones, brothers, thin as slabs. The elder is the taller and the rougher, with moss on him; the
     younger leans toward him. A small stone or two lie between their feet. They keep to the two slabs' ground: 4 m by 1.2 m. */
  function brotherStones(g) {
    put(g, rock(0.74, 1, 0.1, 5).scale(1, 4.4, 0.72), tone(0x8e8a82, true), -1.1, 3.3 - SUNK, 0, 0, 0, -0.07);
    put(g, rock(0.66, 1, 0.1, 6).scale(1, 4.2, 0.78), tone(GREY, true), 1.05, 2.45 - SUNK * 0.75, 0, 0, 0, 0.11);
    for (const [x, y, z, r] of [[-1.7, 2.4, 0.15, 0.3], [-0.55, 3.5, 0.2, 0.28], [-1.15, 1.3, 0.3, 0.3], [-1.4, 4.3, -0.2, 0.26]].slice(0, phone ? 2 : 4)) put(g, rock(r, 0, 0.18, 7).scale(1, 0.55, 1), tone(MOSS, true), x, y, z);
    for (const [x, z, r] of [[-0.1, 0.22, 0.34], [0.25, -0.28, 0.28]].slice(0, phone ? 1 : 2)) put(g, rock(r, 0, 0.2, 8 + Math.round(r * 10)).scale(1, 1.1, 1), tone(PALE_STONE, true), x, LOOSE * r, z);
  }

  /* Touch Of Grey: a great boulder with a pale vein through it, and two lesser ones against it, all within the 3 m the old one
     reached. */
  function greyBoulder(g) {
    const vein = (x, y, z) => (Math.abs(y - 0.55 * x - 0.3 * z - 0.3) < 0.34 ? SNOW : y > 1.5 && roll(x, y, z, 3) > 0.5 ? PALE_STONE : GREY);
    put(g, paint(rock(2.4, phone ? 1 : 2, 0.09, 11).scale(1, 0.85, 0.94), vein), painted, 0, 1.55, 0);
    put(g, rock(0.85, 1, 0.14, 12).scale(1, 0.8, 1), tone(0x6f6a63, true), 1.95, 0.3, 0.75);
    put(g, rock(0.6, 1, 0.16, 13).scale(1, 0.75, 1), tone(GREY, true), -2.0, 0.15, 1.1);
  }

  /* A little mountain, its foot at its own ground: a cone of eleven sides, rough but for its tip and its rim, painted by `colour`.
     It widens for PEAK_SUNK m under its ground to a rim `r` m out and round, which is the peak's outline from above, the same on
     a phone, whose peak has fewer rings. From the rim a skirt of the same eleven sides goes straight on down PEAK_SKIRT m more,
     so on a slope the rim does not hang in the air on the lower side, and the outline is no wider for it. */
  const PEAK_SUNK = 1, PEAK_SKIRT = 1;
  const peak = (r, tall, rough, salt, colour) => {
    const cone = new THREE.ConeGeometry(r, tall + PEAK_SUNK, 11, phone ? 4 : 6).translate(0, (tall - PEAK_SUNK) / 2, 0);
    const skirt = new THREE.CylinderGeometry(r, r, PEAK_SKIRT, 11).translate(0, -PEAK_SUNK - PEAK_SKIRT / 2, 0);
    return mergeGeometries([paint(roughen(cone, rough, salt, (x, y) => y > tall - 0.05 || y < 0.05 - PEAK_SUNK), colour), paint(skirt, colour)]);
  };
  /* A pine in its own frame: a trunk and three skirts of boughs. */
  const pine = (tall) => {
    const parts = new THREE.Group();
    put(parts, new THREE.CylinderGeometry(0.08 * tall, 0.11 * tall, 0.4 * tall + SUNK, 5), tone(DARK_TIMBER, true), 0, 0.2 * tall - SUNK / 2, 0);
    [[0.42, 0.5, 0.36], [0.32, 0.42, 0.62], [0.2, 0.36, 0.84]].forEach(([r, h, y], k) => put(parts, new THREE.ConeGeometry(r * tall, h * tall, 6), tone(PINE, true), 0, y * tall, 0, 0, k * 0.5, 0));
    return parts;
  };

  /* Cold Rain And Snow: a peak with snow on its top, lying lower down one side, and small pines on its lower slopes, inside its
     rim. */
  function snowPeak(g) {
    const snowline = (x, y, z) => (y > 4.3 - 0.9 * roll(Math.round(x * 2), 0, Math.round(z * 2), 21) - 0.25 * z ? SNOW : y > 2.2 && roll(x, y, z, 22) > 0.6 ? PALE_STONE : 0x8e8a82);
    put(g, peak(3, 7.4, 0.13, 20, snowline), painted, 0, 0, 0);
    for (const [x, z] of [[2.0, 0.9], [1.2, -1.85], [-2.1, 0.7]].slice(0, phone ? 1 : 3)) stand(g, pine(1.5), x, 1.1, z);
  }

  /* Fire On The Mountain: a dark peak, burnt at its top, with rocks at its foot, and the fire on it. The flame stands on the
     mountain's top, 5 m up, with its base at its own origin, so a swell grows it up and out from there. */
  function fireMountain(g) {
    /* By a face's middle: a phone's peak has fewer rings, and its top faces' middles lie 4.07 m up. */
    const burnt = (x, y, z) => (y > 3.9 ? 0x2a1d18 : roll(x, y, z, 31) > 0.72 ? 0x5e4a3c : BASALT);
    put(g, peak(2.2, 5.2, 0.14, 30, burnt), painted, 0, 0, 0);
    for (const [x, z, r] of [[1.5, 0.6, 0.45], [-1.4, 0.85, 0.4], [0.75, -1.45, 0.36]].slice(0, phone ? 1 : 3)) put(g, rock(r, 0, 0.2, 32).scale(1, 1.1, 1), tone(0x3b2e27, true), x, LOOSE * r + 0.5, z);
    /* The flame is main's one cone: three tongues in one mesh were counted at 5 swings a second at one block through the song's
       peak, where the one cone counts 3. */
    const f = mesh(new THREE.ConeGeometry(1, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 0.8 }), 0, 5, 0);
    g.add(f);
    moving.push({ obj: f, kind: "swell" });
    if (!phone) { const l = new THREE.PointLight(0xff8a3a, 40, 30); l.position.set(0, 6.5, 0); g.add(l); moving.push({ obj: l, kind: "flame", base: l.intensity }); }
  }

  /* A temple's column in its own frame, its foot at its own ground: a stepped base, a shaft of ten flat flutes that narrows as it
     rises, and a capital. `tall` is to the capital's top. */
  const column = (tall, capital = true) => {
    const parts = new THREE.Group(), flute = tone(PALE_STONE, true);
    put(parts, new THREE.BoxGeometry(1.7, 0.3 + SUNK, 1.7), stone, 0, 0.15 - SUNK / 2, 0);
    put(parts, new THREE.CylinderGeometry(0.72, 0.8, 0.3, 10), flute, 0, 0.45, 0);
    put(parts, new THREE.CylinderGeometry(0.5, 0.62, tall - 1.2, 10), flute, 0, 0.6 + (tall - 1.2) / 2, 0);
    if (capital) {
      put(parts, new THREE.CylinderGeometry(0.78, 0.52, 0.32, 10), flute, 0, tall - 0.44, 0);
      put(parts, new THREE.BoxGeometry(1.6, 0.28, 1.6), stone, 0, tall - 0.14, 0);
    }
    return parts;
  };
  /* Samson And Delilah: the temple as he brings it down. One column stands; the other is pushed over and broken, and the lintel
     has slipped from it: it leans from the standing column's capital down to the broken shaft. The broken column's drums and its
     capital lie fallen between the two, under the lintel, with rubble, so the whole keeps to the two columns' ground. */
  function templePillars(g) {
    stand(g, column(6), -1.6, 0, 0);
    stand(g, column(3.4, false), 1.6, 0, 0, 0, 0, -0.2);
    const flute = tone(PALE_STONE, true);
    put(g, new THREE.CylinderGeometry(0.44, 0.47, 1.4, 10), flute, 0.2, 0.2, -0.4, 0, 0.06, Math.PI / 2);
    put(g, new THREE.CylinderGeometry(0.38, 0.4, 1.0, 10), flute, -0.1, 0.15, 0.47, 0, -0.08, Math.PI / 2);
    put(g, new THREE.CylinderGeometry(0.7, 0.48, 0.3, 10), flute, 0.15, 0.78, 0.05, 0.32, 0, 0.2);
    /* The lintel: its upper end lies on the standing capital's edge and its lower on the broken shaft's top, in neither. */
    put(g, new THREE.BoxGeometry(4.6, 0.6, 1.0), stone, 0.68, 4.76, 0.05, 0, 0.06, -0.875);
    if (!phone) for (const [x, z, r] of [[-0.72, 0.5, 0.26], [0.7, 0.52, 0.24], [-0.6, -0.55, 0.22]]) put(g, rock(r, 0, 0.22, 41).scale(1, 1.1, 1), tone(0x8e8a82, true), x, LOOSE * r, z);
  }

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
    stand(g, fork, -0.5, -0.45, -2.75, 0.36, 0.25, 0);
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
    [/esau/i, brotherStones],
    [/grey|gray/i, greyBoulder],
    [/snow/i, snowPeak],
    /* The flame stands on the mountain's top, 5 m up, with its base at its own origin, so a swell grows it up and out from there. */
    [/fire/i, fireMountain],
    [/samson/i, templePillars],
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
  /* ---------- the standing stones ---------- */
  /* A song no rule matches gets a standing stone: one of eight kinds, by its title's number, the same on every visit. Each is cut
     from the plain block that stood for them all, 1.6 m across the path, 1.2 m along it and 4.5 m tall, and keeps inside that
     block's faces: a landmark is stood off its song's point by its outline seen from above (path.js), so a stone inside the block's
     outline is never stood further off than the block was, whatever its title. Keeping within a metre of the middle is not enough:
     a round stone 0.9 m out is wider than the block along the path, and is stood a step further off where the bears' line passes
     close.
     A stone shows the walker its broad side, as the block did, and fills the block: each kind stands most of 1.6 m across the path
     and most of 4.5 m tall, so that from the path it holds the frame the block held. A title turns no stone about: it gives the
     stone its lean, to one side or the other, and its roughness.
     Nothing trims a stone to the block: each kind's own numbers keep it there, and each kind says its widest beside them. A hewn
     ring reaches no further than its middle's offset + its half-width x (1 + its roughness), across the path (0.8 m at the most)
     and along it (0.6 m); a boulder, its radius x (1 + its roughness) x its scale, + how far off the middle it is laid. None is
     taller than 4.5 m at its full height.
     A foot goes SUNK under the ground, as every landmark's does. A landmark stands level, and on a slope the ground climbs its
     upper side: under a stone's corners it stands up to 0.75 m over the stone's own ground on the maps' steepest stand, and under
     the block's outline up to 0.85 m at the steepest place on the path. CLEAR is over both, with a hand to spare: nothing of a
     stone but its plain foot is under it. A split stone's crack ends there, a stone laid on another is over it, and a holed
     stone's hole and a stele's band are 2 m up and more. */
  const CLEAR = 0.95;
  /* A tone a little darker or lighter, and one tone with a share of another over it. */
  const shade = (hex, k) => [16, 8, 0].reduce((sum, bit) => sum | (Math.min(255, Math.round(((hex >> bit) & 255) * k)) << bit), 0);
  const blend = (hex, other, share) => [16, 8, 0].reduce((sum, bit) => sum | (Math.round(((hex >> bit) & 255) * (1 - share) + ((other >> bit) & 255) * share) << bit), 0);
  /* A stone's tones, worked out once for each of the four: its own, a shade darker and a shade lighter for its faces' grain, a
     paler one for a face where it has broken or a mason has cut it, and its own with moss on it and with lichen. The four are a
     grey, a bluestone, a sandstone and a pale rock: the grey's darkest face is the plain block's own grey (0x8e8a82), so no stone
     is darker than the block was, and the four stand a step apart in lightness and warm against cool, so that they are still four
     in the dusk's red light. What grows on a stone is a pale grey-green or an ochre over its own tone, never a dark coat. */
  const GREY_STONE = 0x969289, BLUESTONE = 0xa8bad2, SANDSTONE = 0xcea670, PALE_ROCK = 0xe6dfcf, MOSSY = 0xa0b08c, LICHEN = 0xccb464;
  const STONE_TONES = [GREY_STONE, PALE_ROCK, BLUESTONE, SANDSTONE].map((tone) => ({ tone, dark: shade(tone, 0.95), light: shade(tone, 1.06), fresh: shade(tone, 1.15), moss: blend(tone, MOSSY, 0.55), lichen: blend(tone, LICHEN, 0.55) }));
  /* What a title's number gives its stone: its tones, which way it leans or points (`turn`, 1 or -1), how tall it stands of its
     kind's full height, and a salt for each of its pieces. Two stones of one kind differ in all four. */
  const stoneOf = (h) => ({ tones: STONE_TONES[(h >>> 8) & 3], turn: (h >>> 10) & 1 ? 1 : -1, tall: 0.975 + (0.025 * ((h >>> 13) & 7)) / 7, salt: (k) => (h >>> 11) + k });
  /* Clothes a piece face by face, by the face's middle in the landmark's frame: its stone's tone, a face here and there a shade
     darker or lighter; and on a small face over the foot, here and there, moss or lichen, so that what grows on a stone is a
     scatter of pale patches and never a whole broad face. `pale`, where a kind gives one, says which faces are freshly broken or
     cut, and those are paler and bare. A shape made of `facets` (a worked stone's flat faces, each of several triangles) is
     clothed a facet at a time, so a flat face is one tone from edge to edge. */
  const SMALL = 0.16;
  const clothe = (geo, { tone, dark, light, fresh, moss, lichen }, salt, pale = () => false) => {
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color(), facets = geo.userData.facets, worn = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      const facet = facets ? facets[i / 3] : i;
      if (!worn.has(facet)) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); m.fromBufferAttribute(pos, i + 2);
        const area = b.clone().sub(a).cross(m.clone().sub(a)).length() / 2;
        m.add(a).add(b).divideScalar(3);
        const grain = roll(m.x, m.y, m.z, salt), grown = m.y > 0.3 && area < SMALL && !facets ? roll(m.x, m.y, m.z, salt + 1) : 0.5;
        worn.set(facet, pale(m.x, m.y, m.z) ? fresh : grown > 0.92 ? moss : grown < 0.07 ? lichen : grain > 0.7 ? dark : grain < 0.2 ? light : tone);
      }
      c.setHex(worn.get(facet));
      for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
    }
    return geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };
  /* One piece of a stone: the shape its salt gives it, clothed as that salt has it. */
  const piece = (g, tones, salt, shape, pale) => put(g, clothe(shape(salt), tones, salt, pale), painted, 0, 0, 0);
  /* A closed shape from rings of corners, each ring as many as the next, from the foot up: faces between the rings, a top that
     closes on `over` and a foot that closes on `under`. Where `skew(k)` says the corners of ring k + 1 stand half a step round from
     those of ring k, the faces between them lean both ways; elsewhere they stand corner over corner. With `flat`, each side's two
     triangles and each end's are told apart as one facet, for a worked stone's flat faces. */
  const loft = (P, over, under, skew = () => false, flat = false) => {
    const corners = [], facets = [], sides = P[0].length;
    const face = (id, ...three) => { corners.push(...three.flat()); facets.push(id); };
    for (let k = 0; k < P.length - 1; k++) {
      for (let i = 0; i < sides; i++) {
        const A = P[k], B = P[k + 1], n = (i + 1) % sides, id = 2 + k * sides + i;
        if (skew(k)) { face(id, A[i], A[n], B[i]); face(id, A[n], B[n], B[i]); } else { face(id, A[i], A[n], B[n]); face(id, A[i], B[n], B[i]); }
      }
    }
    const foot = P[0], top = P[P.length - 1];
    for (let i = 0; i < sides; i++) { face(0, top[i], top[(i + 1) % sides], over); face(1, foot[(i + 1) % sides], foot[i], under); }
    const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    if (flat) geo.userData.facets = facets;
    return geo;
  };
  /* A closed shape that goes round a hole: `P` is its sections, in order round the hole, each the same number of corners, in order
     round the section; faces join each section to the next and the last to the first. It has no ends to close. */
  const looped = (P) => {
    const corners = [], face = (...three) => corners.push(...three.flat());
    P.forEach((A, i) => A.forEach((a, k) => {
      const B = P[(i + 1) % P.length], n = (k + 1) % A.length;
      if ((i + k) % 2) { face(a, B[k], B[n]); face(a, B[n], A[n]); } else { face(a, B[k], A[n]); face(B[k], B[n], A[n]); }
    }));
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
  };
  /* A stone hewn in rings, from the foot up. A ring is [y, rx, rz, cx, cz, slant]: its height, its half-width across the path and
     along it, its middle, and how much higher its +x side stands, per metre. The corners of each ring stand half a step round from
     those of the ring under it, so the faces between lean both ways and no ring shows as a level line; each corner stands in or
     out from its ring's middle by up to `rough` of its distance, and, above the foot, up or down by a part of the gap to the next
     ring. `square` over 2 squares the section's corners. The top closes on `tip` and the foot on its own middle.
     `from` and `to` hew a part of the stone, between two of its rings: the part closes level on each of those, and the ring two
     parts share is the same in both, corner for corner, so one stands on the other with no step between them. */
  const hewn = (rings, tip, sides, rough, salt, square = 2, from = 0, to = rings.length - 1) => {
    const whole = to === rings.length - 1, middle = ([y, , , cx = 0, cz = 0]) => [cx, y, cz];
    const P = rings.slice(from, to + 1).map(([y, rx, rz, cx = 0, cz = 0, slant = 0], n) => {
      const j = from + n, gap = Math.min(n ? y - rings[j - 1][0] : 0, j < to ? rings[j + 1][0] - y : whole ? Math.abs(tip[1] - y) : 0);
      return Array.from({ length: sides }, (_, i) => {
        const a = ((i + (j % 2) / 2) / sides) * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a), k = 1 - rough + 2 * rough * roll(i, j, 0, salt);
        const x = cx + rx * k * Math.sign(s) * Math.abs(s) ** (2 / square), up = roll(i, j, 1, salt) - 0.5;
        return [x, y + slant * (x - cx) + 4 * rough * up * gap, cz + rz * k * Math.sign(c) * Math.abs(c) ** (2 / square)];
      });
    });
    return loft(P, whole ? tip : middle(rings[to]), middle(rings[from]), (k) => (from + k) % 2 === 0);
  };
  /* A kind's rings, and its tip, as a title's stone has them: turned `turn` (1, or -1 for the other way), and `tall` of their
     height above the ground. */
  const stood = (rings, turn, tall) => rings.map(([y, rx, rz, cx = 0, cz = 0, slant = 0]) => [y > 0 ? y * tall : y, rx, rz, cx * turn, cz, slant * turn]);
  const point = ([x, y, z], turn, tall) => [x * turn, y * tall, z];
  /* A shape is a hewn stone's numbers: its rings and its tip, its sides on a desktop and on a phone, the ring a phone leaves out
     (`fine`, where it leaves any out), its roughness and its section's squareness. This hews it for the tier, turned and as tall
     as told, and is the one place where a phone's stone is made the coarser. `from` and `to` are the heights of two of its rings,
     for a part of it. */
  const hewnAs = ({ rings, tip, sides, fine, rough, square }, turn, tall, salt, from, to) => {
    const kept = stood(phone && fine ? rings.filter((_, j) => !fine.includes(j)) : rings, turn, tall), at = (y) => (y === undefined ? undefined : kept.findIndex((ring) => ring[0] === y));
    return hewn(kept, point(tip, turn, tall), sides[phone ? 1 : 0], rough, salt, square, at(from), at(to));
  };
  /* A stone's heights where `base` is at the one height for every title and the stone over it is as tall as its title has it:
     over `base` they are stretched so that `top` comes to `tall` of `top`. */
  const above = (base, top, tall) => (y) => (y <= base ? y : base + ((y - base) * (top * tall - base)) / (top - base));
  /* Where the upright line through (x, z) meets a shape's faces: the highest such place (`top`), or the lowest. */
  const meets = (geo, x, z, top) => {
    const p = geo.attributes.position;
    let best = top ? -Infinity : Infinity;
    for (let i = 0; i < p.count; i += 3) {
      const x0 = p.getX(i) - x, z0 = p.getZ(i) - z, x1 = p.getX(i + 1) - x, z1 = p.getZ(i + 1) - z, x2 = p.getX(i + 2) - x, z2 = p.getZ(i + 2) - z;
      const w0 = x1 * z2 - x2 * z1, w1 = x2 * z0 - x0 * z2, w2 = x0 * z1 - x1 * z0, w = w0 + w1 + w2;
      if (Math.abs(w) < 1e-12 || ((w0 < 0 || w1 < 0 || w2 < 0) && (w0 > 0 || w1 > 0 || w2 > 0))) continue;
      const y = (w0 * p.getY(i) + w1 * p.getY(i + 1) + w2 * p.getY(i + 2)) / w;
      best = top ? Math.max(best, y) : Math.min(best, y);
    }
    return best;
  };
  /* How far a shape can come straight down before it touches the one under it: the least way from a corner of either to the
     other's face over or under it. */
  const fall = (upper, lower) => {
    const u = upper.attributes.position, l = lower.attributes.position;
    let least = Infinity;
    for (let i = 0; i < u.count; i++) least = Math.min(least, u.getY(i) - meets(lower, u.getX(i), u.getZ(i), true));
    for (let i = 0; i < l.count; i++) least = Math.min(least, meets(upper, l.getX(i), l.getZ(i), false) - l.getY(i));
    return least;
  };
  /* A stone laid on others, at (x, z): it comes straight down until it has touched every one of them, and settles LAP further.
     So it lies in each stone it is laid on, wherever on them it lands, and none is left with air under it. */
  const LAP = 0.05;
  const rest = (geo, unders, x = 0, z = 0) => {
    geo.translate(x, 0, z);
    return geo.translate(0, -Math.max(...unders.map((under) => fall(geo, under))) - LAP, 0);
  };
  /* A boulder with a flat face up and one down, to lie in a pile: an icosahedron's faces come in level pairs once one is turned up. */
  const FACE_UP = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  const flatRock = (r, rough, salt) => rock(r, 0, rough, salt).applyQuaternion(FACE_UP);

  /* The plain stones: each is one piece, hewn as its numbers say and stood as its title has it. */
  const PLAIN = {
    /* A menhir: the broadest and the tallest single stone of them all, full to its shoulder, then drawn in to a point that stands
       off to one side. Widest at its belly: 0.01 + 0.755 x 1.04 = 0.795 m across, 0.54 x 1.04 = 0.562 m along. */
    menhir: { rings: [[-SUNK, 0.73, 0.52], [0.35, 0.75, 0.54], [1.0, 0.755, 0.54, 0.005], [1.7, 0.755, 0.53, 0.01], [2.4, 0.755, 0.51, 0.01], [3.05, 0.75, 0.48, 0.015], [3.6, 0.735, 0.44, 0.035], [4.0, 0.63, 0.36, 0.1], [4.28, 0.38, 0.24, 0.2]], tip: [0.3, 4.5, 0.02], sides: [9, 7], fine: [2, 5], rough: 0.04, square: 2.6 },
    /* The pair: a broad stone, its top broken off aslant, and a slim one beside it, a head shorter, its top blunt, with a hand's
       gap between them from the ground up. The broad one reaches 0.305 + 0.47 x 1.05 = 0.799 m across, to one side, and 0.189 m
       to the other; the slim one, 0.505 + 0.28 x 1.05 = 0.799 m and no nearer the middle than 0.211 m: so they never meet. Along
       the path they reach 0.5 x 1.05 = 0.525 m. The slanted top stands 4.28 + 0.4 x 0.478 + 0.01 = 4.48 m at its high side. */
    elder: { rings: [[-SUNK, 0.46, 0.48, -0.305], [0.3, 0.47, 0.5, -0.305], [1.1, 0.47, 0.5, -0.305], [2.0, 0.47, 0.49, -0.305], [2.9, 0.47, 0.47, -0.305], [3.7, 0.465, 0.45, -0.305], [4.28, 0.455, 0.42, -0.305, 0, -0.4]], tip: [-0.5, 4.36, 0], sides: [8, 7], fine: [2, 4], rough: 0.05, square: 3 },
    younger: { rings: [[-SUNK, 0.275, 0.44, 0.505], [0.3, 0.28, 0.46, 0.505], [1.2, 0.28, 0.45, 0.505], [2.2, 0.28, 0.44, 0.505], [3.2, 0.28, 0.42, 0.505], [4.06, 0.265, 0.38, 0.505]], tip: [0.505, 4.16, 0], sides: [6, 5], fine: [2, 4], rough: 0.05, square: 3 },
  };
  const plain = (g, of, shape, part) => piece(g, of.tones, of.salt(part), (salt) => hewnAs(shape, of.turn, of.tall, salt));

  /* 0. A menhir. */
  const menhir = (g, of) => plain(g, of, PLAIN.menhir, 0);
  /* 1. A holed stone: a broad slab that leans a hand out of true, with a round hole clean through it that the sky shows through,
     and its top broken off unevenly, one shoulder gone. It is built round the hole: a section of it runs from the hole's rim out
     across its near face to its edge, over the edge and back across its far face to the rim, and there is one for each corner of
     its edge. A section's rim corner stands on the line from the hole's middle to its edge corner, so every section runs
     straight out from the hole and none crosses its neighbour, whichever corners a tier has: a slab whose sections crossed would
     fold a face over the next. Its faces are rough, the slab thins towards its edge and is worn thinner still round the hole, and
     where its top broke its edge is paler. `outline` is its edge on a desktop and on a phone, going round from its high shoulder:
     the top's five corners, down one side, the two feet, and up the other, the sides' corners spread so that the rim's are no
     more than 36 degrees apart on a desktop and 48 on a phone, and the hole is round.
     An edge corner is moved by no more than 0.008 m in or out and 0.06 m up or down, and the lean takes it 0.015 m further for
     each metre it stands over the ground: the furthest across is the corner 2.85 m up, 0.745 + 0.008 + 0.015 x 2.91 = 0.797 m.
     Along the path the slab reaches 0.25 + 0.06 = 0.31 m. Its top is no higher than 4.42 + 0.06 = 4.48 m. */
  const HOLED = {
    outline: [
      [[0.72, 4.25], [0.4, 4.42], [-0.08, 4.34], [-0.46, 4.1], [-0.74, 3.92], [-0.765, 3.25], [-0.765, 2.8], [-0.765, 2.15], [-0.75, -SUNK], [0.75, -SUNK], [0.75, 2.22], [0.745, 2.85], [0.735, 3.33]],
      [[0.72, 4.25], [0.4, 4.42], [-0.08, 4.34], [-0.46, 4.1], [-0.74, 3.92], [-0.765, 3.09], [-0.765, 2.42], [-0.75, -SUNK], [0.75, -SUNK], [0.75, 2.49], [0.74, 3.17]],
    ],
    hole: [0, 3.0, 0.34], rings: [[0.3, 0.65], [0.5]], lean: 0.015, broken: 3.6,
  };
  function holedStone(g, of) {
    piece(g, of.tones, of.salt(1), (salt) => {
      const tier = phone ? 1 : 0, [hx, hy, r] = HOLED.hole, between = HOLED.rings[tier];
      const stand = (x, y, z) => [(x + HOLED.lean * Math.max(0, y)) * of.turn, y > 0 ? y * of.tall : y, z];
      const sections = HOLED.outline[tier].map(([ex, ey], i) => {
        /* Its edge corner, a little in or out and, over the ground, up or down; its rim corner on the line to it from the hole's
           middle, a little in or out from the round; then its corners from the rim out, near face and far. */
        const far = ey > 0 ? [ex + 0.016 * (roll(i, 1, 2, salt) - 0.5), ey + 0.12 * (roll(i, 2, 2, salt) - 0.5)] : [ex, ey];
        const out = (r * (0.94 + 0.12 * roll(i, 0, 2, salt))) / Math.hypot(far[0] - hx, far[1] - hy), rim = [hx + out * (far[0] - hx), hy + out * (far[1] - hy)];
        const across = [0, ...between, 1].map((f) => [rim[0] + f * (far[0] - rim[0]), rim[1] + f * (far[1] - rim[1]), f === 0 ? 0.13 : f === 1 ? 0.19 : 0.25]);
        const side = (face) => across.map(([x, y, thick], k) => stand(x, y, face * (thick + 0.06 * roll(i, k, 3 + face, salt))));
        return [...side(-1), ...side(1).reverse()];
      });
      /* Turned the other way the slab is its own mirror, and its sections go round the hole the other way. */
      return looped(of.turn > 0 ? sections : sections.reverse());
    }, (x, y, z) => y > HOLED.broken * of.tall && Math.abs(z) < 0.14);
  }
  /* 2. A split stone: one stone cracked from its top down to ROOT, where its two halves begin, a hair apart, and lean away from each
     other as they rise, with the sky between them, to tops that are snapped off aslant. Under ROOT it is one solid, with no face
     inside it, and ROOT is CLEAR, so the crack ends over the ground on any slope. The halves' inner faces match, paler where the
     stone broke, and the lesser half is a little the shorter. Each half is the whole upper stone with every corner past the cleft
     drawn straight back to it, so the halves' outsides are one stone's and their insides the break's, the whole depth of the
     stone. They stand on the foot's top ring corner for corner, drawn in by INSET, a hair: so the foot and the two halves are
     three solids, no corner of one on another's. The whole stone reaches 0.745 x 1.07 = 0.797 m across and 0.52 x 1.07 = 0.556 m
     along, and drawing a corner back takes it no further out. Each half's top, its corners over CROWN, is snapped off aslant,
     SNAP up or down for each metre across from the stone's middle, where the half itself stands: its top is no higher than
     4.17 + 0.01 + 0.36 x 0.792 = 4.47 m. */
  const ROOT = CLEAR, HAIR = 0.002, CLEFT = (y) => HAIR + 0.06 * Math.max(0, y - ROOT), LESSER = 0.9, INSET = 0.995, CROWN = 3.82, SNAP = 0.36;
  const SPLIT = { rings: [[-SUNK, 0.66, 0.5], [0.3, 0.68, 0.52], [ROOT, 0.7, 0.52], [1.8, 0.72, 0.52], [2.7, 0.735, 0.5], [3.5, 0.745, 0.47], [4.17, 0.74, 0.44]], tip: [0, 4.19, 0], sides: [8, 6], fine: [3], rough: 0.07 };
  function splitStone(g, of) {
    /* Over the root it is as tall as its title has it. */
    const up = above(ROOT, SPLIT.tip[1], of.tall), off = 0.06 * of.turn, crown = up(CROWN);
    const whole = { ...SPLIT, rings: SPLIT.rings.map(([y, ...ring]) => [up(y), ...ring]), tip: [0, up(SPLIT.tip[1]), 0] };
    piece(g, of.tones, of.salt(2), (salt) => hewnAs(whole, of.turn, 1, salt, -SUNK, ROOT));
    for (const side of [-1, 1]) {
      const lesser = side === of.turn;
      piece(g, of.tones, of.salt(2), (salt) => {
        const half = hewnAs(whole, of.turn, 1, salt, ROOT), pos = half.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i), root = y < ROOT + 0.001, edge = off + side * CLEFT(y);
          /* The middles that its foot's faces and its top's meet at are the whole stone's, on its middle line: each is moved into
             the half, a hand from the cleft, or the faces from it to the corners drawn back to the cleft would have no area, and
             the top's could fall on one of those corners. */
          const middle = pos.getX(i) === 0 && pos.getZ(i) === 0, x = pos.getX(i) * (root ? INSET : 1);
          const drawn = middle ? edge + side * 0.2 : side * (x - edge) < 0 ? edge : x, snapped = y > crown ? y - SNAP * of.turn * drawn : y;
          pos.setXYZ(i, drawn, lesser ? ROOT + (snapped - ROOT) * LESSER : snapped, pos.getZ(i) * (root ? INSET : 1));
        }
        return half;
      }, (x, y) => y > ROOT && Math.abs(x - off) < CLEFT(lesser ? ROOT + (y - ROOT) / LESSER : y) + 0.04);
    }
  }
  /* 3. A cairn: a great stone in the ground and six lesser ones piled on it, each smaller than the one under and laid to the
     other side of it, so the pile leans this way and that. Each of them has a tone of its own. The great stone reaches
     0.74 x 1.08 = 0.799 m across and 0.54 x 1.08 = 0.583 m along; the largest laid on it, 0.06 + 0.67 x 1.1 = 0.797 m and
     0.04 + 0.74 x 0.67 x 1.1 = 0.585 m. Its top is 1.1 m up, so the first stone laid on it lies over CLEAR; and a laid stone's
     corners are no more than 0.874 of its radius over or under its middle, so the pile's top is no higher than
     1.1 + 2 x 0.874 x 0.72 x (0.67 + 0.6 + 0.53 + 0.46 + 0.38 + 0.3) - 6 x LAP = 4.5 m. */
  const CAIRN_FOOT = { rings: [[-SUNK, 0.72, 0.52], [0.2, 0.74, 0.54], [0.98, 0.62, 0.46]], tip: [0.05, 1.1, 0], sides: [6, 5], rough: 0.08 };
  function cairn(g, of) {
    let under = piece(g, of.tones, of.salt(4), (salt) => hewnAs(CAIRN_FOOT, of.turn, 1, salt)).geometry;
    [0.67, 0.6, 0.53, 0.46, 0.38, 0.3].forEach((r, k) => {
      const laid = (salt) => rest(flatRock(r, 0.1, salt).rotateY(k * 2.1).scale(1, 0.72 * of.tall, 0.74), [under], (k % 2 ? -0.06 : 0.06) * of.turn, k % 2 ? 0.04 : -0.04);
      under = piece(g, STONE_TONES[(STONE_TONES.indexOf(of.tones) + k + 1) & 3], of.salt(5 + k), laid).geometry;
    });
  }
  /* 4. A trilithon: two upright slabs, one the broader and the shorter, with a lintel laid across them that overhangs them before
     and behind, and the sky through the doorway, which faces the walker. The lintel lies on both: it is tilted as their tops
     are, the shorter upright's end the lower, so the taller upright shows. An upright reaches 0.525 + 0.26 x 1.05 = 0.798 m
     across and 0.43 x 1.05 = 0.452 m along. The lintel is hewn standing and laid over, its length across the path, and tilted
     0.175 rad at the most a title gives it: its tip, 0.79 m out on its middle line, then reaches 0.79 x 0.985 = 0.778 m across,
     and its end ring, 0.74 m out and 0.27 x 1.06 = 0.286 m off that line, 0.74 x 0.985 + 0.286 x 0.174 = 0.779 m; along, it
     reaches 0.55 x 1.06 = 0.583 m. Its top is no higher than the taller upright's, 3.71 m, + its own thickness, 0.636 m, + the
     rise of its tilt, 0.79 x 0.174 = 0.137 m, - LAP: 4.43 m. */
  const LINTEL = { rings: [[-0.74, 0.27, 0.52], [0, 0.3, 0.55], [0.74, 0.27, 0.52]], tip: [0, 0.79, 0], sides: [6, 5], fine: [1], rough: 0.06, square: 3.5 };
  function trilithon(g, of) {
    /* Each upright stands on its own side; the title's turn says which is the broader and the shorter. */
    const uprights = [-1, 1].map((side) => {
      const lesser = side === of.turn, wide = lesser ? 0.26 : 0.24, tall = lesser ? 3.5 : 3.68;
      return { rings: [[-SUNK, wide, 0.42, side * 0.525], [0.3, wide, 0.43, side * 0.525], [1.9, wide - 0.01, 0.42, side * 0.52], [tall, wide - 0.03, 0.4, side * 0.51]], tip: [side * 0.51, tall + 0.03, 0], sides: [6, 5], fine: [2], rough: 0.05, square: 3.5 };
    });
    const [left, right] = uprights.map((upright, k) => piece(g, of.tones, of.salt(5 + 2 * k), (salt) => hewnAs(upright, 1, of.tall, salt)).geometry);
    const tilt = Math.atan2((uprights[1].tip[1] - uprights[0].tip[1]) * of.tall, uprights[1].tip[0] - uprights[0].tip[0]);
    piece(g, of.tones, of.salt(8), (salt) => rest(hewnAs(LINTEL, 1, 1, salt).rotateZ(Math.PI / 2 + tilt), [left, right]));
  }
  /* 5. A pair: two plain stones. */
  const stonePair = (g, of) => { plain(g, of, PLAIN.elder, 9); plain(g, of, PLAIN.younger, 10); };
  /* 6. A stele: one worked stone, broad and squared, with four flat faces and its four edges hewn back, each by its own share of
     the stone's width and no two heights alike, so its edges are rough and its faces true. It narrows a little as it rises and
     has settled a little to one side, a band is cut into it all round, a hand deep, and its top is shouldered, one shoulder cut
     away further than the other: it has no cap. Each broad face is flat from edge to edge and is one tone. A level is [height,
     how far the face on the side it leans to is drawn in, the face on the other side, and the two along the path]. A face stands
     furthest out at the ground, 0.79 m across at the most and 0.56 m along: it draws in faster than the stone leans. */
  const STELE = { levels: [[-SUNK, 0, 0, 0], [2.6, 0, 0, 0], [2.6, 0.06, 0.06, 0.06], [2.86, 0.06, 0.06, 0.06], [2.86, 0, 0, 0], [3.85, 0, 0, 0], [4.2, 0.04, 0.17, 0.04], [4.42, 0.13, 0.46, 0.12]], lean: 0.018, taper: [0.024, 0.012] };
  function stele(g, of) {
    /* How far each face stands out at the ground: left, right, before, behind. */
    const out = [0, 1, 2, 3].map((k) => (k < 2 ? 0.75 : 0.52) + 0.04 * roll(k, 0, 3, of.salt(11)));
    const P = STELE.levels.map(([level, inTo, inFrom, inZ], j) => {
      const y = level > 0 ? level * of.tall : level, up = Math.max(0, y), lean = STELE.lean * up * of.turn;
      const xl = -(out[0] - STELE.taper[0] * up - (of.turn < 0 ? inTo : inFrom)) + lean, xr = out[1] - STELE.taper[0] * up - (of.turn < 0 ? inFrom : inTo) + lean, zf = -(out[2] - STELE.taper[1] * up - inZ), zb = out[3] - STELE.taper[1] * up - inZ;
      /* Each edge is hewn back by its own share of the lesser half-width, a little more or less at each level. */
      const cut = [0, 1, 2, 3].map((k) => (0.14 + 0.1 * roll(k, 1, 3, of.salt(11)) + 0.08 * roll(k, 2 + j, 3, of.salt(11))) * Math.min(xr - xl, zb - zf) / 2);
      /* Its eight corners, going round as a hewn ring's do, so its faces look outward. */
      return [[xr - cut[0], y, zf], [xl + cut[3], y, zf], [xl, y, zf + cut[3]], [xl, y, zb - cut[2]], [xl + cut[2], y, zb], [xr - cut[1], y, zb], [xr, y, zb - cut[1]], [xr, y, zf + cut[0]]];
    });
    const middle = (ring) => [0, 1, 2].map((k) => ring.reduce((sum, corner) => sum + corner[k], 0) / ring.length);
    const band = (x, y) => y > STELE.levels[1][0] * of.tall && y < STELE.levels[4][0] * of.tall;
    piece(g, of.tones, of.salt(11), () => loft(P, middle(P[P.length - 1]), middle(P[0]), () => false, true), band);
  }
  /* 7. A rock on a rock: a great uneven boulder, heavy at one shoulder and cut away under the other, its top aslant, lying on a
     squat rough stone of another tone that stands in the ground, whose top slopes, so the boulder lies tilted. The squat stone
     reaches 0.76 x 1.045 = 0.794 m across and 0.54 x 1.045 = 0.564 m along, and the lowest of its top is
     1.3 - 0.18 x 0.75 - 0.02 = 1.14 m up, over CLEAR. The boulder's rings are slanted, and each stands a little to one side of
     the one under it: at its shoulder it reaches the same 0.794 m across and 0.564 m along. From its lowest corner to its highest
     it is no more than 3.09 m, and its lowest is no higher than the squat stone's top, 1.45 m, less LAP: its top is under 4.49 m. */
  const UNDER = { rings: [[-SUNK, 0.74, 0.5], [0.25, 0.76, 0.54], [0.9, 0.76, 0.53], [1.3, 0.71, 0.47, 0, 0, 0.18]], tip: [0.05, 1.42, 0], sides: [7, 5], rough: 0.045, square: 2.6 };
  const BOULDER = { rings: [[0, 0.48, 0.34, 0.12, 0, 0.18], [0.4, 0.73, 0.5, 0.03, 0, 0.12], [1.1, 0.76, 0.54, 0, 0, 0.02], [1.8, 0.76, 0.53, 0, 0, -0.08], [2.4, 0.735, 0.48, -0.025, 0, -0.2], [2.84, 0.62, 0.38, -0.1, 0, -0.22]], tip: [-0.2, 2.99, 0], sides: [9, 7], rough: 0.045, square: 3 };
  function rockOnRock(g, of) {
    const under = piece(g, STONE_TONES[(STONE_TONES.indexOf(of.tones) + 1) & 3], of.salt(12), (salt) => hewnAs(UNDER, of.turn, of.tall, salt)).geometry;
    piece(g, of.tones, of.salt(14), (salt) => rest(hewnAs(BOULDER, of.turn, 1, salt), [under]));
  }
  /* The kinds, in the order of a title's kind (stoneKind), and the title's own stone. */
  const STONES = [menhir, holedStone, splitStone, cairn, trilithon, stonePair, stele, rockOnRock];
  const standingStone = (g, title = "") => STONES[stoneKind(title)](g, stoneOf(titleHash(title)));
  /* Each landmark's still parts merge into one mesh once it is built; a part that moves stays apart. The standing stone alone is
     built for its song's title. */
  const merged = (build) => (g) => { build(g); mergeStill(g, moving.map((m) => m.obj)); };
  return { BUILDERS: BUILDERS.map(([re, build]) => [re, merged(build)]), standingStone: (g, title) => merged((group) => standingStone(group, title))(g), moving };
}
