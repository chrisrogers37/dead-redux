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
  /* A shape from its faces' corners, three to a face, each [x, y, z] laid end to end. */
  const solid = (corners) => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
  /* A shape turned smooth about the upright from a profile of [radius, height], foot first. */
  const lathe = (profile, sides) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides);
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
    const post = [[0.42, 0], [0.42, 0.4], [0.3, 0.65], [0.26, 2], [0.34, 2.25], [0.34, 2.6], [0.24, 2.85], [0.22, 4.1], [0.36, 4.35], [0.36, 4.6], [0.2, 4.8]];
    put(g, lathe(post, phone ? 8 : 12), tone(TIMBER), 0, 0.75, 0);
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
    [/sugar magnolia|sugaree/i, magnolia],
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
    [{ test: isDrums }, drumCircle],
    [{ test: isSpace }, spaceRim],
    [/lovin/i, leaningStones],
    [/road/i, (g) => { g.add(mesh(new THREE.BoxGeometry(4, 0.2, 18), stone, 0, 0.4, 0)); }],
    [/lovelight|light/i, (g) => { g.add(mesh(new THREE.CylinderGeometry(1.2, 1.6, 10, 8), new THREE.MeshLambertMaterial({ color: 0xeceae4, flatShading: true }), 0, 5, 0)); const b = mesh(new THREE.BoxGeometry(1, 1, 1), amber, 0, 10.6, 0); g.add(b); moving.push({ obj: b, kind: "spin" }); }],
    [/blues/i, bannerPole],
  ];
  /* ---------- the standing stones ---------- */
  /* A song no rule matches gets a standing stone: one of eight kinds, by its title's number, the same on every visit. Each is cut
     from the plain block that stood for them all, 1.6 m across the path, 1.2 m along it and 4.5 m tall, and keeps inside that
     block's faces: a landmark is stood off its song's point by its outline seen from above (path.js), so a stone inside the block's
     outline is never stood further off than the block was, whatever its title. Keeping within a metre of the middle is not enough:
     a round stone 0.9 m out is wider than the block along the path, and is stood a step further off where the bears' line passes
     close.
     Nothing trims a stone to the block: each kind's own numbers keep it there, and each kind says its widest beside them. A hewn
     ring reaches no further than its middle's offset + its half-width x (1 + its roughness), across the path (0.8 m at the most)
     and along it (0.6 m); a boulder, its radius x (1 + its roughness) x its scale, + how far off the middle it is laid. None is
     taller than the menhir and the stele, whose tips are 4.5 m up at their full height.
     A foot goes SUNK under the ground, as every landmark's does. A landmark stands level, and on a slope the ground climbs its
     upper side: under a stone's corners it stands up to 0.75 m over the stone's own ground on the maps' steepest stand, and under
     the block's outline up to 0.85 m at the steepest place on the path. CLEAR is over both, with a hand to spare: nothing of a
     stone but its plain foot is under it. A split stone's crack ends there, a stele's step is there, and a stone laid on another
     is over it. */
  const CLEAR = 0.95;
  const BLUESTONE = 0x6f7782, SANDSTONE = 0x9a8c74, LICHEN = 0xa9a45c;
  /* A tone a little darker or lighter; and a stone's tones, worked out once for each of the four: its own, a shade darker and a
     shade lighter for its faces' grain, and two paler ones, for a face where it has broken and for one a mason has cut. */
  const shade = (hex, k) => [16, 8, 0].reduce((sum, bit) => sum | (Math.min(255, Math.round(((hex >> bit) & 255) * k)) << bit), 0);
  const STONE_TONES = [GREY, PALE_STONE, BLUESTONE, SANDSTONE].map((tone) => ({ tone, dark: shade(tone, 0.86), light: shade(tone, 1.1), broken: shade(tone, 1.12), cut: shade(tone, 1.25) }));
  /* What a title's number gives its stone: its tones, which way it leans or points (`turn`, 1 or -1), how tall it stands of its
     kind's full height, and a salt for each of its pieces. Two stones of one kind differ in all four. */
  const stoneOf = (h) => ({ tones: STONE_TONES[(h >>> 8) & 3], turn: (h >>> 10) & 1 ? 1 : -1, tall: 0.9 + (0.1 * ((h >>> 13) & 7)) / 7, salt: (k) => (h >>> 11) + k });
  /* A stone's bare face, by its middle in the landmark's frame: the stone's tone, a face here and there a shade darker or lighter. */
  const grain = ({ tone, dark, light }, salt) => (x, y, z) => { const at = roll(x, y, z, salt); return at > 0.7 ? dark : at < 0.2 ? light : tone; };
  /* A piece's skin, by a face's middle: its bare face, with moss and lichen in patches half a metre across, over the foot.
     `pale`, where a kind gives one, names the paler tone of a face that is freshly broken or cut (null for a weathered face). */
  const skin = (tones, salt, pale = () => null) => {
    const bare = grain(tones, salt);
    return (x, y, z) => {
      const fresh = pale(x, y, z);
      if (fresh !== null) return fresh;
      if (y < 0.3) return bare(x, y, z);
      const patch = roll(Math.round(x * 2), Math.round(y * 1.6), Math.round(z * 2), salt + 1);
      return patch > 0.86 ? MOSS : patch < 0.1 ? LICHEN : bare(x, y, z);
    };
  };
  /* One piece of a stone: the shape its salt gives it, in the skin that salt gives it. */
  const piece = (g, tones, salt, shape, pale) => put(g, paint(shape(salt), skin(tones, salt, pale)), painted, 0, 0, 0);
  /* A stone hewn in rings, from the foot up. A ring is [y, rx, rz, cx, cz, slant]: its height, its half-width across the path and
     along it, its middle, and how much higher its +x side stands, per metre. The corners of each ring stand half a step round from
     those of the ring under it, so the faces between lean both ways and no ring shows as a level line; each corner stands in or
     out from its ring's middle by up to `rough` of its distance, and, above the foot, up or down by a part of the gap to the next
     ring. `square` over 2 squares the section's corners. A `worked` stone's rings are level and stand corner over corner instead,
     so its faces are upright and its steps flat. The top closes on `tip` and the foot on its own middle.
     `from` and `to` hew a part of the stone, between two of its rings: the part closes level on each of those, and the ring two
     parts share is the same in both, corner for corner, so one stands on the other with no step between them. */
  const hewn = (rings, tip, sides, rough, salt, square = 2, worked = false, from = 0, to = rings.length - 1) => {
    const whole = to === rings.length - 1, middle = ([y, , , cx = 0, cz = 0]) => [cx, y, cz];
    const P = rings.slice(from, to + 1).map(([y, rx, rz, cx = 0, cz = 0, slant = 0], n) => {
      const j = from + n, gap = Math.min(n ? y - rings[j - 1][0] : 0, j < to ? rings[j + 1][0] - y : whole ? Math.abs(tip[1] - y) : 0);
      return Array.from({ length: sides }, (_, i) => {
        const a = ((i + (worked ? 0.5 : (j % 2) / 2)) / sides) * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a), k = 1 - rough + 2 * rough * roll(i, j, 0, salt);
        const x = cx + rx * k * Math.sign(s) * Math.abs(s) ** (2 / square);
        return [x, y + slant * (x - cx) + (worked ? 0 : 4 * rough * (roll(i, j, 1, salt) - 0.5) * gap), cz + rz * k * Math.sign(c) * Math.abs(c) ** (2 / square)];
      });
    });
    const corners = [], face = (...three) => corners.push(...three.flat());
    for (let k = 0; k < P.length - 1; k++) {
      for (let i = 0; i < sides; i++) {
        const A = P[k], B = P[k + 1], n = (i + 1) % sides;
        if (worked || (from + k) % 2) { face(A[i], A[n], B[n]); face(A[i], B[n], B[i]); } else { face(A[i], A[n], B[i]); face(A[n], B[n], B[i]); }
      }
    }
    const foot = P[0], top = P[P.length - 1], over = whole ? tip : middle(rings[to]), under = middle(rings[from]);
    for (let i = 0; i < sides; i++) { face(top[i], top[(i + 1) % sides], over); face(foot[(i + 1) % sides], foot[i], under); }
    return solid(corners);
  };
  /* A kind's rings, and its tip, as a title's stone has them: turned `turn` (1, or -1 for the other way), and `tall` of their
     height above the ground. */
  const stood = (rings, turn, tall) => rings.map(([y, rx, rz, cx = 0, cz = 0, slant = 0]) => [y > 0 ? y * tall : y, rx, rz, cx * turn, cz, slant * turn]);
  const point = ([x, y, z], turn, tall) => [x * turn, y * tall, z];
  /* A shape is a hewn stone's numbers: its rings and its tip, its sides on a desktop and on a phone, the ring a phone leaves out
     (`fine`, where it leaves one out), its roughness and its section's squareness. This hews it for the tier, turned and as tall
     as told, and is the one place where a phone's stone is made the coarser. `from` and `to` are the heights of two of its rings,
     for a part of it. */
  const hewnAs = ({ rings, tip, sides, fine, rough, square }, turn, tall, salt, from, to) => {
    const kept = stood(phone ? rings.filter((_, j) => j !== fine) : rings, turn, tall), at = (y) => (y === undefined ? undefined : kept.findIndex((ring) => ring[0] === y));
    return hewn(kept, point(tip, turn, tall), sides[phone ? 1 : 0], rough, salt, square, false, at(from), at(to));
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
    /* A menhir: one tall stone, broad at the belly, narrowing to a point that stands off to one side. Widest at the belly:
       0.03 + 0.71 x 1.08 = 0.797 m across, 0.52 x 1.08 = 0.562 m along. */
    menhir: { rings: [[-SUNK, 0.68, 0.5], [0.3, 0.7, 0.52], [1.5, 0.71, 0.5, 0.03], [2.7, 0.58, 0.44, 0.08], [3.6, 0.4, 0.34, 0.17], [4.15, 0.2, 0.2, 0.26]], tip: [0.34, 4.5, 0.02], sides: [7, 6], fine: 4, rough: 0.08 },
    /* A slab that leans: broad to the walker and thin, its foot to one side of its ground and its top over the other, cut off
       aslant. Widest at the foot: 0.31 + 0.46 x 1.06 = 0.798 m across, 0.27 x 1.06 = 0.286 m along. */
    slab: { rings: [[-SUNK, 0.46, 0.27, -0.31], [0.2, 0.46, 0.27, -0.31], [1.4, 0.47, 0.26, -0.12], [2.6, 0.43, 0.24, 0.1], [3.6, 0.37, 0.21, 0.32, 0, 0.4]], tip: [0.4, 3.85, 0], sides: [8, 6], fine: 2, rough: 0.06, square: 4 },
    /* The pair: a tall stone that leans its point toward a short one, a hand apart at the ground. The tall one reaches
       0.41 + 0.36 x 1.08 = 0.799 m across and the short one 0.45 + 0.32 x 1.08 = 0.796 m; along, 0.44 x 1.08 = 0.475 m. */
    elder: { rings: [[-SUNK, 0.35, 0.42, -0.41], [0.3, 0.36, 0.44, -0.41], [1.8, 0.36, 0.42, -0.4], [3.2, 0.32, 0.38, -0.36], [4.0, 0.23, 0.29, -0.29]], tip: [-0.2, 4.4, 0], sides: [6, 5], fine: 3, rough: 0.08 },
    younger: { rings: [[-SUNK, 0.31, 0.4, 0.45], [0.3, 0.32, 0.42, 0.45], [1.2, 0.32, 0.4, 0.45], [1.9, 0.26, 0.33, 0.44]], tip: [0.42, 2.25, 0.03], sides: [6, 5], fine: 2, rough: 0.08 },
    /* The narrow stone a boulder is balanced on: 0.52 x 1.08 = 0.562 m across, 0.46 x 1.08 = 0.497 m along. */
    stand: { rings: [[-SUNK, 0.5, 0.44], [0.2, 0.52, 0.46], [0.9, 0.4, 0.36], [1.5, 0.3, 0.28]], tip: [0.04, 1.62, 0], sides: [6, 5], fine: 2, rough: 0.08 },
  };
  const plain = (g, of, shape, part) => piece(g, of.tones, of.salt(part), (salt) => hewnAs(shape, of.turn, of.tall, salt));

  /* 0. A menhir. */
  const menhir = (g, of) => plain(g, of, PLAIN.menhir, 0);
  /* 1. A leaning slab. */
  const leaningSlab = (g, of) => plain(g, of, PLAIN.slab, 1);
  /* 2. A split stone: one stone cracked from its top down to ROOT, where its two halves begin, a hair apart, and lean away from each
     other as they rise, with the sky between them. Under ROOT it is one solid, with no face inside it, and ROOT is CLEAR, so the
     crack ends over the ground on any slope. The halves' inner faces match, paler where the stone broke, and the lesser half is
     a little the shorter. Each half is the whole upper stone with every corner past the cleft drawn straight back to it, so the
     halves' outsides are one stone's and their insides the break's, the whole depth of the stone. They stand on the foot's top
     ring corner for corner, drawn in by INSET, a hair: so the foot and the two halves are three solids, no corner of one on
     another's. The whole stone reaches 0.73 x 1.07 = 0.781 m across and 0.52 x 1.07 = 0.556 m along, and drawing a corner back
     takes it no further out. */
  const ROOT = CLEAR, HAIR = 0.002, CLEFT = (y) => HAIR + 0.105 * Math.max(0, y - ROOT), LESSER = 0.9, INSET = 0.995;
  const SPLIT = { rings: [[-SUNK, 0.52, 0.5], [0.3, 0.54, 0.52], [ROOT, 0.59, 0.52], [1.7, 0.64, 0.52], [2.5, 0.7, 0.48], [3.25, 0.73, 0.42]], tip: [0, 3.55, 0], sides: [7, 5], fine: 3, rough: 0.07 };
  function splitStone(g, of) {
    /* Over the root it is as tall as its title has it. */
    const up = above(ROOT, SPLIT.tip[1], of.tall), off = 0.06 * of.turn;
    const whole = { ...SPLIT, rings: SPLIT.rings.map(([y, ...ring]) => [up(y), ...ring]), tip: [0, up(SPLIT.tip[1]), 0] };
    piece(g, of.tones, of.salt(2), (salt) => hewnAs(whole, of.turn, 1, salt, -SUNK, ROOT));
    for (const side of [-1, 1]) {
      const lesser = side === of.turn;
      piece(g, of.tones, of.salt(2), (salt) => {
        const half = hewnAs(whole, of.turn, 1, salt, ROOT), pos = half.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i), root = y < ROOT + 0.001, edge = off + side * CLEFT(y);
          /* The middle its foot's faces meet at is the whole stone's: it is moved into the half, a hand from the cleft, or the
             faces from it to the corners drawn back along the root would have no area. */
          const middle = root && pos.getX(i) === 0 && pos.getZ(i) === 0, x = pos.getX(i) * (root ? INSET : 1);
          pos.setXYZ(i, middle ? edge + side * 0.2 : side * (x - edge) < 0 ? edge : x, lesser ? ROOT + (y - ROOT) * LESSER : y, pos.getZ(i) * (root ? INSET : 1));
        }
        return half;
      }, (x, y) => (y > ROOT && Math.abs(x - off) < CLEFT(lesser ? ROOT + (y - ROOT) / LESSER : y) + 0.04 ? of.tones.broken : null));
    }
  }
  /* 3. A cairn: a great stone in the ground and five lesser ones piled on it, each smaller than the one under and laid to the
     other side of it, so the pile leans this way and that (a phone's, four). Each of them has a tone of its own. The great stone
     reaches 0.73 x 1.08 = 0.788 m across and 0.53 x 1.08 = 0.572 m along; the largest laid on it, 0.06 + 0.62 x 1.1 = 0.742 m
     and 0.04 + 0.8 x 0.62 x 1.1 = 0.586 m. Its top is 1.1 m up, so the first stone laid on it lies over CLEAR. */
  const CAIRN_FOOT = { rings: [[-SUNK, 0.7, 0.5], [0.2, 0.73, 0.53], [0.98, 0.6, 0.45]], tip: [0.05, 1.1, 0], sides: [6, 5], rough: 0.08 };
  function cairn(g, of) {
    let under = piece(g, of.tones, of.salt(4), (salt) => hewnAs(CAIRN_FOOT, of.turn, 1, salt)).geometry;
    [0.62, 0.54, 0.45, 0.36, 0.27].slice(0, phone ? 4 : 5).forEach((r, k) => {
      const laid = (salt) => rest(flatRock(r, 0.1, salt).rotateY(k * 2.1 + of.turn).scale(1, 0.72 * of.tall, 0.8), [under], (k % 2 ? -0.06 : 0.06) * of.turn, k % 2 ? 0.04 : -0.04);
      under = piece(g, STONE_TONES[(STONE_TONES.indexOf(of.tones) + k + 1) & 3], of.salt(5 + k), laid).geometry;
    });
  }
  /* 4. A trilithon: two upright slabs, one the broader and the shorter, with a lintel laid across them that overhangs them before
     and behind, and the sky through the doorway, which faces the walker. The lintel lies on both: it is tilted as their tops
     are, the shorter upright's end the lower, so the taller upright shows. An upright reaches 0.525 + 0.26 x 1.05 = 0.798 m
     across and 0.43 x 1.05 = 0.452 m along. The lintel is hewn standing and laid over, its length across the path, and tilted
     0.146 rad at the most a title gives it: its tip, 0.79 m out on its middle line, then reaches 0.79 x 0.989 = 0.782 m across,
     and its end ring, 0.74 m out and 0.27 x 1.06 = 0.286 m off that line, 0.74 x 0.989 + 0.286 x 0.146 = 0.774 m; along, it
     reaches 0.55 x 1.06 = 0.583 m. */
  const LINTEL = { rings: [[-0.74, 0.27, 0.52], [0, 0.3, 0.55], [0.74, 0.27, 0.52]], tip: [0, 0.79, 0], sides: [6, 5], fine: 1, rough: 0.06, square: 3.5 };
  function trilithon(g, of) {
    /* Each upright stands on its own side; the title's turn says which is the broader and the shorter. */
    const uprights = [-1, 1].map((side) => {
      const lesser = side === of.turn, wide = lesser ? 0.26 : 0.24, tall = lesser ? 2.9 : 3.05;
      return { rings: [[-SUNK, wide, 0.42, side * 0.525], [0.3, wide, 0.43, side * 0.525], [1.6, wide - 0.01, 0.42, side * 0.52], [tall, wide - 0.03, 0.4, side * 0.51]], tip: [side * 0.51, tall + 0.03, 0], sides: [6, 5], fine: 2, rough: 0.05, square: 3.5 };
    });
    const [left, right] = uprights.map((upright, k) => piece(g, of.tones, of.salt(5 + 2 * k), (salt) => hewnAs(upright, 1, of.tall, salt)).geometry);
    const tilt = Math.atan2((uprights[1].tip[1] - uprights[0].tip[1]) * of.tall, uprights[1].tip[0] - uprights[0].tip[0]);
    piece(g, of.tones, of.salt(8), (salt) => rest(hewnAs(LINTEL, 1, 1, salt).rotateZ(Math.PI / 2 + tilt), [left, right]));
  }
  /* 5. A pair: two plain stones. */
  const stonePair = (g, of) => { plain(g, of, PLAIN.elder, 9); plain(g, of, PLAIN.younger, 10); };
  /* 6. A stele: a worked stone, squared, on a foot a step wider, narrowing as it rises to a collar and a pointed cap, with a band
     cut round it. The cuts are paler. Its foot's step is STEP up whatever the stele's height, and STEP is CLEAR, so the ground on
     a slope's upper side comes up the foot and never over the step. Widest at the step, where it has settled 0.03 x 0.95 m to
     one side: 0.62 x 1.02 + 0.029 = 0.661 m across, and 0.48 x 1.02 = 0.490 m along. */
  const STEP = CLEAR, STELE_TOP = 4.5;
  function stele(g, of) {
    const rings = [[-SUNK, 0.62, 0.48], [STEP, 0.62, 0.48], [STEP, 0.47, 0.4], [2.8, 0.4, 0.34], [2.8, 0.34, 0.29], [3.0, 0.34, 0.29], [3.0, 0.39, 0.33], [3.82, 0.36, 0.31], [3.82, 0.43, 0.37], [4.0, 0.43, 0.37]];
    /* Over the step it is as tall as its title has it, and it has settled a little to one side. */
    const up = above(STEP, STELE_TOP, of.tall), lean = (y) => 0.03 * of.turn * Math.max(0, y);
    const cut = (x, y) => ((y > up(2.8) && y < up(3.0)) || y > up(4.0) ? of.tones.cut : null);
    piece(g, of.tones, of.salt(11), (salt) => hewn(rings.map(([y, rx, rz]) => [up(y), rx, rz, lean(up(y))]), [lean(up(STELE_TOP)), up(STELE_TOP), 0], 4, 0.02, salt, Infinity, true), cut);
  }
  /* 7. A balanced boulder: a great round stone at rest on a narrow one that stands in the ground. The boulder reaches
     0.03 + 0.7 x 1.09 = 0.793 m across and 0.76 x 0.7 x 1.09 = 0.580 m along. */
  function balancedBoulder(g, of) {
    const stand = plain(g, of, PLAIN.stand, 12).geometry;
    piece(g, of.tones, of.salt(13), (salt) => rest(rock(0.7, 1, 0.09, salt).rotateY(of.turn).scale(1, 1.2 * of.tall, 0.76), [stand], 0.03 * of.turn, 0));
  }
  /* The kinds, in the order of a title's kind (stoneKind), and the title's own stone. */
  const STONES = [menhir, leaningSlab, splitStone, cairn, trilithon, stonePair, stele, balancedBoulder];
  const standingStone = (g, title = "") => STONES[stoneKind(title)](g, stoneOf(titleHash(title)));

  /* ---------- Drums, the blues, Space, Sugar Magnolia and Lovin' ---------- */
  /* Each of these five keeps inside the outline, seen from above, of the plain shape it replaced: the hull of that shape's parts,
     which is what a landmark is stood off its song's point by (path.js). Keeping within the old shape's furthest reach is not
     enough: a rounder shape inside that reach is wider somewhere than the old one was. None is taller than the shape it replaced
     but Space's rim, which stands round a disc that lay flat.
     A wide landmark sees more of a slope than a stone does: it stands level, and under its far side the ground falls further than
     SUNK. So each foot here goes down as far as the ground falls under its own place anywhere on the path, and a hand more. */
  const UP = new THREE.Vector3(0, 1, 0);
  /* A rod from one place to another, `r` thick, of `sides` flat sides, open at its ends unless `capped`. */
  const rod = (g, mat, from, to, r, sides = 4, capped = false) => {
    const along = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)), length = along.length();
    const m = mesh(new THREE.CylinderGeometry(r, r, length, sides, 1, !capped), mat, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    m.quaternion.setFromUnitVectors(UP, along.divideScalar(length));
    g.add(m);
  };
  /* A shape turned about the upright from a profile of [radius, height], foot first, with `sides` flat sides. Where the profile
     meets the upright it closes on a point, with no face of no area there. */
  const turned = (profile, sides) => {
    const corners = [], at = ([r, y], i) => { const a = (i / sides) * 2 * Math.PI; return [r * Math.sin(a), y, r * Math.cos(a)]; };
    for (let k = 0; k < profile.length - 1; k++) {
      const low = profile[k], high = profile[k + 1];
      for (let i = 0; i < sides; i++) {
        if (low[0] > 0) corners.push(...at(low, i), ...at(low, i + 1), ...at(high, i + 1));
        if (high[0] > 0) corners.push(...at(low, i), ...at(high, i + 1), ...at(high, i));
      }
    }
    return solid(corners);
  };
  /* The faces between two rings of as many corners, one over the other, all round: two to a side, added to `corners`. */
  const band = (corners, lower, upper) => lower.forEach((_, i) => { const n = (i + 1) % lower.length; corners.push(...lower[n], ...lower[i], ...upper[i], ...lower[n], ...upper[i], ...upper[n]); });

  /* Drums: a drum circle, three great drums where the three plain ones stood, each as broad as the old one's ten sides let it
     be: a bass drum, broad and low, laced with rope from hoop to hoop, two beaters left on its head; a goblet drum behind it, the
     tallest, laced round its bowl; and a barrel drum with iron bands and the rods that draw its head down. Each head is a pale
     skin whose edge is turned down over the shell's rim, with a hoop under it, which is what says drum from the side.
     They stand level on a slope, and wide. Under the bass drum's place the ground falls 2.9 m at the path's steepest, so the
     shells go on down DRUM_SUNK. And it rises: 1.4 m over the landmark's own ground under the bass drum at the steepest stand
     the maps give it, 1.5 m under the barrel and 2.6 m under the goblet anywhere on the path. Each drum's hoop begins over that
     (BASS, less its head and its hoop, is 1.55 m), so its head and its hoop show wherever a show has stood it; only the bass drum
     can lose them, where the ground rises more than that under it, which it does along some 7 % of the path. */
  const SKIN = 0xd9c9a0, WORN = 0xc2a878, BEATER = 0x8f6c3e, OXBLOOD = 0x8a3d2b, HONEY = 0xa3733f, DRUM_SUNK = 3.2, BASS = 1.85;
  /* A head is HEAD of skin down from its top, LIP wider than the shell all round; the hoop under it is HOOP tall and PROUD of the
     shell. */
  const HEAD = 0.16, HOOP = 0.14, LIP = 0.04, PROUD = 0.09;
  /* A drum in its own frame, its foot at its own ground: a shell turned from `profile` ([radius, height], foot first), which goes
     straight on down from its foot; its head, as high as the profile's top; and under the head the hoop that holds it. Gives its
     parts, its head's height, its hoop's radius and the height of the hoop's foot, where a rope or a rod meets it. */
  const drum = (profile, wood, metal, sides) => {
    const parts = new THREE.Group(), [rim, tall] = profile[profile.length - 1], edge = rim + LIP, hoop = rim + PROUD, worn = 0.55 * rim;
    put(parts, lathe([[profile[0][0], -DRUM_SUNK], ...profile], sides), tone(wood, true), 0, 0, 0);
    /* The head: the skin's edge turned down over the rim, and on top a ring of it round its middle, which is worn where it is
       played. */
    put(parts, new THREE.CylinderGeometry(edge, edge, HEAD, sides, 1, true), tone(SKIN, true), 0, tall - HEAD / 2, 0);
    put(parts, new THREE.RingGeometry(worn, edge, sides).rotateX(-Math.PI / 2), tone(SKIN, true), 0, tall, 0);
    put(parts, new THREE.CircleGeometry(worn, sides).rotateX(-Math.PI / 2), tone(WORN, true), 0, tall, 0);
    put(parts, new THREE.CylinderGeometry(hoop, hoop, HOOP, sides), tone(metal, true), 0, tall - HEAD - HOOP / 2, 0);
    return { parts, tall, hoop, under: tall - HEAD - HOOP };
  };
  /* A drum's lacing: one rope in `n` V's round it, between two rings, each given as the rope's own [radius, height] there. It
     goes down from the first ring to the second, then up again, turn about. */
  const lace = (parts, n, upper, lower) => {
    const at = ([r, y], k) => { const a = (k / (2 * n)) * 2 * Math.PI; return [r * Math.sin(a), y, r * Math.cos(a)]; };
    for (let k = 0; k < 2 * n; k++) { const [from, to] = k % 2 ? [lower, upper] : [upper, lower]; rod(parts, tone(STRING), at(from, k), at(to, k + 1), 0.03); }
  };
  function drumCircle(g) {
    const sides = phone ? 8 : 12;
    /* The bass drum: a straight shell, a hoop under its head and one like it near its foot, and the rope between them. Its eight
       V's turn where a phone's eight-sided shell has its corners, so each length of rope lies over a flat of the shell, clear of
       it. */
    const bass = drum([[1.62, BASS]], OXBLOOD, DARK_TIMBER, sides);
    put(bass.parts, new THREE.CylinderGeometry(bass.hoop, bass.hoop, HOOP, sides), tone(DARK_TIMBER, true), 0, 0.37, 0);
    lace(bass.parts, 8, [1.68, bass.under], [1.68, 0.44]);
    /* The beaters lie on the head, a centimetre or two into it: a stick's foot and its padded end both rest there. */
    for (const [x, z, turn] of [[-0.3, -0.4, 0.5], [0.2, 0.45, -0.4]]) {
      const beater = new THREE.Group();
      rod(beater, tone(BEATER), [-0.75, 0.025, 0], [0.62, 0.105, 0], 0.045, phone ? 4 : 6, true);
      put(beater, new THREE.SphereGeometry(0.13, phone ? 5 : 6, phone ? 3 : 4), tone(LEATHER), 0.7, 0.11, 0);
      stand(bass.parts, beater, x, bass.tall, z, 0, turn, 0);
    }
    stand(g, bass.parts, 2.4, 0, -1);
    /* The goblet drum: a foot that flares, a waist, and a bowl that widens straight to its head from `bowl` up, where an iron
       ring goes round it, so the rope lies along it; its V's turn at the shell's corners on both tiers. */
    const bowl = 1.66, goblet = drum([[0.9, 0], [0.92, 0.08], [0.68, 0.6], [0.54, 1.12], [0.57, 1.38], [0.7, bowl], [0.94, 2.72], [0.92, 2.98]], HONEY, IRON, sides);
    put(goblet.parts, new THREE.CylinderGeometry(0.78, 0.75, 0.1, sides), tone(IRON, true), 0, bowl, 0);
    lace(goblet.parts, phone ? 4 : 6, [0.99, goblet.under], [0.76, 1.71]);
    stand(g, goblet.parts, 0.6, 0, 1);
    /* The barrel drum: staves that swell to its belly, two iron bands, and rods from the upper band up into the hoop. */
    const barrel = drum([[1.06, 0], [1.13, 0.45], [1.22, 1.2], [1.25, 1.62], [1.19, 2.06], [1.12, 2.45]], TIMBER, IRON, sides);
    for (const [r, y] of [[1.185, 0.72], [1.275, 1.58]]) put(barrel.parts, new THREE.CylinderGeometry(r, r, 0.1, sides, 1, true), tone(IRON, true), 0, y, 0);
    const lugs = phone ? 4 : 6;
    for (let k = 0; k < lugs; k++) {
      const a = ((k + 0.5) / lugs) * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a);
      rod(barrel.parts, tone(IRON), [1.29 * s, 1.6, 1.29 * c], [1.235 * s, barrel.tall - HEAD - HOOP / 2, 1.235 * c], 0.03);
    }
    stand(g, barrel.parts, -2, 0, 0);
  }

  /* The blues: a banner pole. The plain one was a thin pole with a flag out to one side, and seen from above that is all the room
     there is: a pole no thicker than 0.26 m, and a banner no thicker than the old flag's 5 cm that reaches 3.1 m. So it is a
     pale turned pole with brass collars and a finial, a yard near its top, a cord from the pole's head to the yard's end, and a
     long banner in the blues' own colour hung from the yard, broad face to the walker: banded, and cut to two tails. Its bands
     are the banner's own cloth, not laid on it. */
  const BLUE = 0x5c86e0, PALE_BLUE = 0xdce8fa, POLE = 0xd8d2c4;
  /* The yard crosses the pole YARD up and is YARD_DEEP from its top to its underside; the cloth, and the yard with it, is CLOTH
     through. The pole swells to a seat for a brass collar in two places: COLLAR up, and at the yard. */
  const YARD = 11.31, YARD_DEEP = 0.12, CLOTH = 0.05, COLLAR = 2.41;
  function bannerPole(g) {
    const sides = phone ? 6 : 8, pole = [[0.125, -SUNK], [0.125, 0.45], [0.095, 0.7], [0.085, 2.2], [0.118, COLLAR - 0.09], [0.118, COLLAR + 0.09], [0.08, 2.64], [0.07, 11], [0.105, YARD - 0.19], [0.105, YARD + 0.19], [0.07, 11.6]];
    put(g, lathe(pole, sides), tone(POLE), 0, 0, 0);
    for (const y of [COLLAR, YARD]) put(g, new THREE.CylinderGeometry(0.125, 0.125, 0.1, sides, 1, true), tone(BRASS), 0, y, 0);
    /* The finial stands on the pole's own last ring. */
    put(g, turned([pole[pole.length - 1], [0.115, 11.66], [0.125, 11.76], [0.085, 11.86], [0.035, 11.9], [0, 11.99]], sides), tone(BRASS, true), 0, 0, 0);
    /* The yard, from the pole's middle, and the cord that holds its far end up, from the pole's head to the yard's top. */
    put(g, new THREE.BoxGeometry(3.08, YARD_DEEP, CLOTH), tone(DARK_TIMBER, true), 1.54, YARD, 0);
    rod(g, tone(STRING), [0, 11.8, 0], [2.9, YARD + 0.09, 0], 0.03);
    /* The banner hangs from the yard's underside: three bands of blue with two pale ones between, then the tails. */
    const left = 0.3, wide = 2.75, hung = YARD - YARD_DEEP / 2;
    let y = hung;
    for (const [deep, colour] of [[0.85, BLUE], [0.27, PALE_BLUE], [0.9, BLUE], [0.27, PALE_BLUE], [1.05, BLUE]]) {
      put(g, new THREE.BoxGeometry(wide, deep, CLOTH), tone(colour, true), left + wide / 2, y - deep / 2, 0);
      y -= deep;
    }
    const tails = new THREE.Shape([[0, 0], [0, -1.9], [wide / 2, -0.75], [wide, -1.9], [wide, 0]].map(([x, drop]) => new THREE.Vector2(x, drop)));
    put(g, new THREE.ExtrudeGeometry(tails, { depth: CLOTH, bevelEnabled: false }), tone(BLUE, true), left, y, -CLOTH / 2);
    /* The halyard comes down the pole from the yard's underside to a cleat set into it. */
    rod(g, tone(STRING), [0.17, hung, 0], [0.17, 1.45, 0], 0.03);
    put(g, new THREE.BoxGeometry(0.14, 0.3, 0.06), tone(BRASS, true), 0.13, 1.4, 0);
  }

  /* Space: main's black disc, level, 0.15 m over its own ground, in a ring of rough blue-grey stones on a wall of them. A level
     disc 10 m across lies in a slope: in the right cave, where Space is pinned, the ground stands 3 m over the disc's edge on the
     hill's side, which buries half of it there as it always did, and falls 2.2 m under its edge on the other; nowhere on the path
     does the ground fall further under the disc than 4.8 m. So the wall goes down RIM_SUNK, and stands at the disc's very edge
     all round: the disc is a polygon, and the wall's corners are the disc's own corners, bit for bit, from the stones' shoulders,
     which are over the disc, to under it, so none of the disc shows past the wall and no gap lets the eye in under it. Further
     down the wall is rough, drawn in from that edge. Over the shoulders each stone is its own: a belly that swells in over the
     disc, and a rough head, some tall and some low, RIM_TOP up at the most, with a cleft between it and the next. */
  const VOID = { r: 5, sides: 24, y: 0.15 }, RIM_SUNK = 5, RIM_IN = 3.95, RIM_SHOULDER = 0.3, RIM_UNDER = 0.05, RIM_TOP = 0.8;
  const RIM_TONES = [0x5f6570, BLUESTONE, 0x80868f];
  /* How many of the disc's sides each stone stands along, round the ring. */
  const RIM_SPANS = [2, 1, 2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2];
  /* The wall's levels, from the top down: RIM_EDGE, the shoulder and a level under the disc, both at the disc's very edge; then
     RIM_ROUGH, drawn in from it; and the foot. */
  const RIM_EDGE = [RIM_SHOULDER, 0.1], RIM_ROUGH = phone ? [-1.2, -2.6] : [-0.5, -1.2, -2, -2.9];
  /* A face of the rim: a shade darker or lighter here and there. */
  const rimGrain = (tint, salt, lit = () => 1) => (x, y, z) => { const rough = roll(x, y, z, salt); return shade(tint, lit(y) * (rough > 0.7 ? 0.84 : rough < 0.25 ? 1.14 : 1)); };
  function spaceRim(g) {
    const disc = mesh(new THREE.CircleGeometry(VOID.r, VOID.sides).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, VOID.y, 0);
    g.add(disc);
    /* The disc's own corners [x, z], round from +x toward +z. */
    const edge = Array.from({ length: VOID.sides }, (_, k) => { const i = ((VOID.sides - k) % VOID.sides) + 1; return [disc.geometry.attributes.position.getX(i), disc.geometry.attributes.position.getZ(i)]; });
    /* The wall, level by level: a corner under each of the disc's at each. A corner of a rough level is drawn in toward the
       middle, and stands a little higher or lower than its level; the foot's are drawn in and stand level. */
    const levels = [...RIM_EDGE, ...RIM_ROUGH, -RIM_SUNK].map((y, j) => edge.map(([x, z], i) => {
      if (j < RIM_EDGE.length) return [x, y, z];
      const k = 1 - (0.04 + 0.2 * roll(i, j, 0, 55)) / VOID.r;
      return [x * k, y + (j < RIM_EDGE.length + RIM_ROUGH.length ? 0.35 * (roll(i, j, 1, 55) - 0.5) : 0), z * k];
    }));
    const wall = [];
    for (let j = 0; j + 1 < levels.length; j++) band(wall, levels[j + 1], levels[j]);
    put(g, paint(solid(wall), rimGrain(shade(RIM_TONES[0], 0.8), 54)), painted, 0, 0, 0);
    /* The stones, each on its sides of the disc; every third one tall. */
    let first = 0;
    RIM_SPANS.forEach((span, k) => {
      const tall = k % 3 ? 0.4 + 0.25 * roll(k, 1, 0, 52) : RIM_TOP - 0.16 * roll(k, 1, 0, 52), r = (i, n) => roll(i, n, 0, 60 + k);
      /* Its ground: the disc's corners along it, then the same ones drawn in toward the disc's middle, back again, as far in as
         this stone is deep; and its heart. */
      const outer = Array.from({ length: span + 1 }, (_, i) => edge[(first + i) % VOID.sides]), m = outer.length, loop = 2 * m, deep = (RIM_IN + 0.6 * (r(0, 0) - 0.6)) / VOID.r;
      const ground = [...outer, ...outer.slice().reverse().map(([x, z]) => [x * deep, z * deep])];
      const heart = [0, 1].map((axis) => ground.reduce((sum, corner) => sum + corner[axis], 0) / loop);
      /* A ring of it: corner i is drawn `inn` of its way to the heart (past its own place, away from the heart, under 0: an
         inner corner only, which then swells in over the disc) and stands `y` up. */
      const ring = (inn, y) => ground.map(([x, z], i) => [x + (heart[0] - x) * inn(i), y(i), z + (heart[1] - z) * inn(i)]);
      const up = (i, share) => (i < m ? RIM_SHOULDER : VOID.y) + (tall - RIM_SHOULDER) * share;
      const rings = [ring(() => 0, (i) => (i < m ? RIM_SHOULDER : RIM_UNDER))];
      if (!phone) rings.push(ring((i) => (i < m ? 0.03 + 0.08 * r(i, 1) : 0.1 - 0.3 * r(i, 2)), (i) => up(i, 0.38 + 0.22 * r(i, 3))));
      rings.push(ring((i) => (i < m ? 0.28 + 0.25 * r(i, 4) : 0.22 + 0.3 * r(i, 5)), (i) => up(i, 0.7 + 0.22 * r(i, 6))));
      const top = [heart[0] * (1 + 0.06 * (r(0, 7) - 0.5)), tall, heart[1] * (1 + 0.06 * (r(1, 7) - 0.5))];
      const corners = [];
      for (let n = 0; n + 1 < rings.length; n++) band(corners, rings[n], rings[n + 1]);
      const last = rings[rings.length - 1];
      for (let i = 0; i < loop; i++) corners.push(...last[(i + 1) % loop], ...last[i], ...top);
      /* Its upward faces are the lighter, as the sky lights them. */
      put(g, paint(solid(corners), rimGrain(RIM_TONES[Math.floor(3 * roll(k, 2, 0, 53))], 56 + k, (y) => (y > RIM_SHOULDER + 0.7 * (tall - RIM_SHOULDER) ? 1.18 : 1))), painted, 0, 0, 0);
      first += span;
    });
  }

  /* Sugar Magnolia and Sugaree: a magnolia in flower, as broad and as tall as the plain bush it replaces, which was a ball 4 m
     across on the ground. A short stout trunk; a crown of leaf clumps in tiers, dark beneath and lighter where the sky is on
     them, out to the old bush's own corners seen from above and down to half a metre over the ground, with the trunk showing
     under it; and its great blossoms standing in the leaves like pale candles, each a bud of six petals (a phone's, five),
     blush at its foot. */
  const BARK = 0x6a5a4a, LEAF = 0x6da564, LEAF_LIT = 0x8cc47e, LEAF_SHADE = 0x538550, PETAL = 0xf6eee2, FLUSH = 0xf2c6d1, BLUSH = 0xd9879f;
  /* A clump of leaves is a boulder RUGGED rough, FLAT of its radius up and down. */
  const RUGGED = 0.1, FLAT = 0.84;
  function magnolia(g) {
    /* The trunk goes up into the crown's middle, which the clumps stand round. */
    put(g, new THREE.CylinderGeometry(0.2, 0.38, 1.7 + SUNK, 7), tone(BARK, true), 0, (1.7 - SUNK) / 2, 0);
    /* The clumps: where each is, its radius `r`, how far its blossom leans from upright, and how much broader the clump is
       across the path. A low tier out toward the old bush's six corners, a middle tier that fills its breadth across the path,
       a high tier at its shoulders, and the top. A phone's tree has the low tier, four of the middle one, and one broad top in
       place of the high tier. */
    const clumps = [];
    [[0.99, 0.61], [0, 1.02], [-0.99, 0.61], [-0.99, -0.61], [0, -1.02], [0.99, -0.61]].forEach(([x, z], k) => clumps.push({ x, y: k % 2 ? 1.12 : 0.98, z, r: 0.6, lean: 0.8, wide: 1 }));
    [[1.08, 0, 0.55], [0.5, 0.85, 0.52], [-0.5, 0.85, 0.52], [-1.08, 0, 0.55], [-0.5, -0.85, 0.52], [0.5, -0.85, 0.52]].forEach(([x, z, r], k) => { if (!phone || k !== 1 && k !== 4) clumps.push({ x, y: k % 2 ? 2.04 : 1.9, z, r, lean: 0.6, wide: 1 }); });
    if (!phone) for (const [x, z, wide] of [[0.85, 0.1, 1.3], [-0.85, 0.1, 1.3], [0, -0.62, 1]]) clumps.push({ x, y: 2.66, z, r: 0.56, lean: 0.4, wide });
    clumps.push(phone ? { x: 0.03, y: 2.78, z: -0.03, r: 0.72, lean: 0.1, wide: 1.55 } : { x: 0.03, y: 2.98, z: -0.03, r: 0.56, lean: 0.1, wide: 1 });
    clumps.forEach(({ x, y, z, r, wide }, k) => {
      const leaves = (fx, fy, fz) => (fy > 0.28 * r ? (roll(fx, fy, fz, 61) > 0.3 ? LEAF_LIT : LEAF) : fy < -0.3 * r ? LEAF_SHADE : roll(fx, fy, fz, 62) > 0.6 ? LEAF_SHADE : LEAF);
      put(g, paint(rock(r, 1, RUGGED, 63 + k).scale(wide, FLAT, 1), leaves), painted, x, y, z);
    });
    /* The crown's heart: one dark clump inside the others, so that a gap between two of them shows leaves in shade, not the sky. */
    put(g, rock(0.95, 0, RUGGED, 62).scale(1, 1.15, 1), tone(LEAF_SHADE, true), 0, 1.8, 0);
    /* The blossoms: a bud turned from a profile, its petals pale and flushed by turns, blush at its foot. One stands on each
       clump, leaning out from the tree's middle, and on a phone a second on the top; its foot is a little way into the leaves. */
    const petals = phone ? 5 : 6;
    const bud = (size) => paint(turned([[0, 0], [0.15, 0.1], [0.2, 0.3], [0.13, 0.5], [0, 0.62]].map(([r, y]) => [r * size, y * size]), petals), (x, y, z) => (y < 0.11 * size ? BLUSH : Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 1) * petals) % 2 ? FLUSH : PETAL));
    const blossom = ({ x, y, z, r, wide }, lean, turn, size) => {
      const way = new THREE.Vector3(Math.sin(lean) * Math.cos(turn), Math.cos(lean), Math.sin(lean) * Math.sin(turn));
      /* How far out the clump's face is that way, at the least its roughness leaves it. The bud's foot is 0.1 m further in. */
      const out = (r * (1 - RUGGED)) / Math.hypot(way.x / wide, way.y / FLAT, way.z) - 0.1;
      put(g, bud(size), painted, x + way.x * out, y + way.y * out, z + way.z * out).quaternion.setFromUnitVectors(UP, way);
    };
    clumps.forEach((clump, k) => {
      const top = k === clumps.length - 1, outward = Math.atan2(clump.z, clump.x);
      /* A clump straight ahead of the tree's middle or behind it leans its blossom to one side: the old bush's outline is
         nearest there. */
      blossom(clump, clump.lean, top ? 0.6 : outward + (Math.abs(clump.x) < 0.1 ? 0.9 : 0.5 * (roll(k, 0, 0, 64) - 0.5)), top ? 0.66 : 0.84 + 0.14 * roll(k, 1, 0, 64));
      if (top && phone) blossom(clump, 0.85, 3.6, 0.8);
    });
  }

  /* Good Lovin' and Gimme Some Lovin': two great slabs that lean on each other, where the two plain blocks leaned, each broader
     than a block was and its broad face to the walker. The taller leans in over the middle, and the other is brought in to it
     until the two touch, and LAP further, so its head lies in the taller one's side and they hold each other up, with the sky
     between them below. They are hewn like the standing stones, one pale and one warm, and keep inside the two blocks' ground:
     6.2 m by 1 m. Under an end of that ground the ground falls 1.5 m at the path's steepest, so their feet go LEAN_SUNK under.
     Their faces are a standing stone's bare faces, and what grows on them grows in one blotch on each: low on the weather side,
     which is the walker's (-z), spreading from the hearts in `growth`, each [x, y, how far it spreads]. A face in a blotch is
     one of `grown`, a muted grey-green near the stone's own tone, the deeper of the two at a heart: a shade under the stone's
     own face, no darker than its darkest, and never its brightest. A standing stone's moss and lichen, a face here and a face
     there, read on faces this large as stray bright triangles. */
  const LEAN_SUNK = 2;
  const LEANING = {
    taller: { rings: [[-LEAN_SUNK, 0.72, 0.45, -2.3], [0.3, 0.74, 0.46, -2.26], [1.2, 0.74, 0.45, -1.93], [2.1, 0.73, 0.44, -1.6], [3, 0.72, 0.43, -1.27], [3.9, 0.7, 0.41, -0.94], [4.7, 0.66, 0.38, -0.65], [5.35, 0.56, 0.33, -0.41]], tip: [-0.3, 5.76, 0.02], sides: [10, 7], fine: 3, rough: 0.06, square: 3, tones: STONE_TONES[1], grown: [0x8fa37c, 0x86986f], growth: [[-2.3, 0.8, 0.75], [-1.75, 1.85, 0.55]] },
    other: { rings: [[-LEAN_SUNK, 0.72, 0.45, 2.3], [0.3, 0.74, 0.46, 2.26], [1.1, 0.74, 0.45, 1.95], [1.9, 0.73, 0.44, 1.64], [2.7, 0.72, 0.43, 1.33], [3.5, 0.7, 0.41, 1.03], [4.2, 0.62, 0.38, 0.76], [4.85, 0.48, 0.33, 0.55]], tip: [0.42, 5.3, -0.02], sides: [10, 7], fine: 3, rough: 0.06, square: 3, tones: STONE_TONES[3], grown: [0x8c8e68, 0x7e825e], growth: [[2.3, 0.7, 0.75], [1.7, 1.65, 0.55]] },
  };
  /* A leaning stone's skin, by a face's middle: its bare face, or what has grown on it. */
  const leanSkin = ({ tones, grown, growth }, salt) => {
    const bare = grain(tones, salt);
    return (x, y, z) => {
      /* How near the face is to a blotch's heart, as a share of how far the blotch spreads: under 1, it is in the blotch. */
      const near = z < 0 ? Math.min(...growth.map(([gx, gy, spread]) => Math.hypot(x - gx, y - gy) / spread)) : Infinity;
      return near < 0.55 ? grown[1] : near < 1 ? grown[0] : bare(x, y, z);
    };
  };
  /* A shape with its side up: what stood to its +x is over it, so that how near two stones stand, side by side, is how far one
     can fall on the other. */
  const onItsSide = (geo) => geo.clone().rotateZ(Math.PI / 2);
  function leaningStones(g) {
    const taller = hewnAs(LEANING.taller, 1, 1, 71), other = hewnAs(LEANING.other, 1, 1, 72);
    other.translate(-fall(onItsSide(other), onItsSide(taller)) - LAP, 0, 0);
    put(g, paint(taller, leanSkin(LEANING.taller, 71)), painted, 0, 0, 0);
    put(g, paint(other, leanSkin(LEANING.other, 72)), painted, 0, 0, 0);
  }

  /* Each landmark's still parts merge into one mesh once it is built; a part that moves stays apart. The standing stone alone is
     built for its song's title. */
  const merged = (build) => (g) => { build(g); mergeStill(g, moving.map((m) => m.obj)); };
  return { BUILDERS: BUILDERS.map(([re, build]) => [re, merged(build)]), standingStone: (g, title) => merged((group) => standingStone(group, title))(g), moving };
}
