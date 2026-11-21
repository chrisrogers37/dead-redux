/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAVES, height, STAGE } from "./ground.js";

/* What grows and lies on the land: tufts of grass over the turf, some in flower, and stones where the slope steepens and along the
   shore. Each is one instanced mesh, so the two cost two draw calls however many there are. Nothing here is walked round: a tuft
   stands no higher than a figure's knee, and a stone no higher than a bear's shin. */

/* A number from 0 to 1 for a whole-numbered place and a salt, the same on every visit: nothing here is left to chance, so two stills of
   a world that holds still are the same still. */
export function chance(i, j, salt) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* One tuft in its own units, a metre tall at its tallest: BLADES blades fanned round its root, each a single triangle leaning out,
   darker at the foot and paler at the tip (the colours multiply the tuft's own, by instance); and a stem with a bloom on it, which
   only a tuft in flower shows. aTip is 0 at the ground and 1 at a blade's tip, where the wind moves it; aBloom marks the bloom. */
const BLADES = 8, BLOOM = 0.19;
export function tuftGeometry() {
  const position = [], colour = [], tip = [], bloom = [];
  const blade = (turn, lean, wide, tall) => {
    const ax = Math.cos(turn), az = Math.sin(turn);
    position.push(-az * wide, 0, ax * wide, az * wide, 0, -ax * wide, ax * lean * tall, tall, az * lean * tall);
    colour.push(0.62, 0.66, 0.56, 0.62, 0.66, 0.56, 1.2, 1.22, 1.0);
    tip.push(0, 0, 1);
    bloom.push(0, 0, 0);
  };
  for (let b = 0; b < BLADES; b++) blade((b / BLADES) * 2 * Math.PI + 0.6 * chance(b, 1, 7), 0.3 + 0.5 * chance(b, 2, 7), 0.1 + 0.06 * chance(b, 3, 7), 0.5 + 0.5 * chance(b, 4, 7));
  blade(0.4, 0.05, 0.025, 0.95);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colour, 3));
  geo.setAttribute("aTip", new THREE.Float32BufferAttribute(tip, 1));
  geo.setAttribute("aBloom", new THREE.Float32BufferAttribute(bloom, 1));
  geo.computeVertexNormals();
  /* The bloom: eight faces round the stem's top, which sways with it. */
  const head = new THREE.OctahedronGeometry(BLOOM).scale(1, 0.7, 1).translate(0.05 * 0.95, 0.97, 0.02).deleteAttribute("uv");
  const n = head.attributes.position.count;
  head.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  head.setAttribute("aTip", new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
  head.setAttribute("aBloom", new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
  return mergeGeometries([geo, head]);
}

/* A stone in its own units, about a metre across and lower than it is wide, no two of its corners the same distance out. */
export function stoneGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.5, 1), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    /* By the corner's own place, so the corners that three's faces share move together and the stone stays closed. */
    const out = 0.78 + 0.44 * chance(Math.round(v.x * 100), Math.round(v.y * 100) * 31 + Math.round(v.z * 100), 11);
    pos.setXYZ(i, v.x * out, v.y * out * 0.62, v.z * out);
  }
  geo.deleteAttribute("uv");
  geo.computeVertexNormals();
  return geo;
}

/* Tufts are drawn in full to SEEN_NEAR m from the eye and are gone by SEEN_FAR, where each would be a speck that only shimmers. The
   wind moves a blade's tip by SWAY of the tuft's height at the most. */
const SEEN_NEAR = 55, SEEN_FAR = 95, SWAY = 0.09;
const f = (v) => v.toFixed(4);
/* The dancing bears' colours and the page's white, for the blooms. */
const BLOOMS = [0xd4607a, 0xe8b04b, 0xeceae4, 0x9a80c0, 0xe8b04b, 0xd4607a];

/* Builds what grows and lies on the land: at most `tufts` tufts and `stones` stones. The turf reaches `extent` m from the island's
   centre and the shore's sand lies from `beach[0]` to `beach[1]` m out; `colour(x, y, z, ny, out)` gives the land's colour at a point,
   `lit(material)` has a material take the light the ground takes (the stage's glow), and `clear(x, z)` is false where nothing may
   stand (a track). A tuft grows on turf, more thickly in some meadows than others, and a stone lies where the turf gives way to bare
   stone, along the shore's sand, and here and there on the turf. Returns `wind(time)`, which sways the tufts at a time, and
   `thin(half)`, which draws half the tufts or all of them. */
export function buildFlora(scene, { tufts, stones, extent, beach, colour, lit, clear }) {
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), bloomColour = new THREE.Color();
  /* The land at a point: its height, how upright it stands (1 on level ground), and whether anything may stand there. */
  const land = (x, z) => {
    const y = height(x, z), gx = height(x + 0.5, z) - height(x - 0.5, z), gz = height(x, z + 0.5) - height(x, z - 0.5);
    return { y, ny: 1 / Math.sqrt(1 + gx * gx + gz * gz), gx, gz };
  };
  const inCave = (x, z) => CAVES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 13.5);
  const byStage = (x, z, r) => Math.hypot(x - STAGE[0], z - STAGE[1]) < r;
  /* A soft field 0 to 1, for where the meadows grow thick. */
  const meadow = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.083 + 0.7) * Math.cos(z * 0.071 + 2.2) + 0.2 * Math.sin((x - z) * 0.19 + 1.1);

  /* The tufts: one to a cell of a grid over the island, each at its own place in its cell, kept where turf grows. */
  const wind = { value: 0 };
  const tuftMat = lit(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const litCompile = tuftMat.onBeforeCompile;
  tuftMat.onBeforeCompile = (shader) => {
    litCompile(shader);
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aTip;
        attribute float aBloom;
        attribute vec4 aFlower;
        uniform float uWind;`)
      /* Every blade takes the light as the ground under it does, so a tuft has no dark side. */
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
      .replace("#include <color_vertex>", `#include <color_vertex>
        if (aBloom > 0.5) vColor.rgb = aFlower.rgb;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float shown = 1.0 - smoothstep(${f(SEEN_NEAR)}, ${f(SEEN_FAR)}, length((modelViewMatrix * vec4(root, 1.0)).xyz));
        if (aBloom > 0.5 && aFlower.a < 0.5) transformed = vec3(0.0);
        float sway = aTip * ${f(SWAY)} * (sin(uWind * 1.1 + root.x * 0.35 + root.z * 0.27) + 0.4 * sin(uWind * 2.3 + root.z * 0.9));
        transformed.xz += vec2(sway, 0.6 * sway);
        transformed *= shown;`);
    /* Both faces of a blade take the light as its upper one does. */
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        normal = normalize(vNormal);`);
  };
  /* About half the cells on the turf grow a tuft, so there are twice as many cells there as tufts asked for. */
  const cell = Math.sqrt((extent * extent * 1.6) / tufts), span = Math.ceil(extent / cell);
  const placed = [];
  for (let i = -span; i <= span && placed.length < tufts; i++) {
    for (let j = -span; j <= span && placed.length < tufts; j++) {
      /* The cells are taken in an order that scatters them, so a count cut short thins the whole island evenly. */
      const a = ((i + span) * 7919 + (j + span) * 104729) % (2 * span + 1) - span, b = ((j + span) * 6101 + (i + span) * 15485863) % (2 * span + 1) - span;
      const x = (a + chance(a, b, 1)) * cell, z = (b + chance(a, b, 2)) * cell;
      if (Math.hypot(x, z) > extent || inCave(x, z) || byStage(x, z, 15) || !clear(x, z)) continue;
      const at = land(x, z);
      if (at.ny < 0.9 || chance(a, b, 3) > 0.3 + 0.7 * meadow(x, z)) continue;
      placed.push([x, at.y, z, at.ny, a, b]);
    }
  }
  const tuftMesh = new THREE.InstancedMesh(tuftGeometry(), tuftMat, placed.length);
  const flower = new Float32Array(4 * placed.length);
  placed.forEach(([x, y, z, ny, a, b], k) => {
    const size = 0.4 + 0.4 * chance(a, b, 4);
    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(0, 2 * Math.PI * chance(a, b, 5), 0);
    dummy.scale.set(size * 1.3, size, size * 1.3);
    dummy.updateMatrix();
    tuftMesh.setMatrixAt(k, dummy.matrix);
    /* The land's own colour, a little greener and paler, so a tuft belongs to the ground it grows from. */
    colour(x, y, z, ny, tint);
    tint.r *= 1.0 + 0.3 * chance(a, b, 6); tint.g *= 1.2 + 0.35 * chance(a, b, 6); tint.b *= 0.95;
    tuftMesh.setColorAt(k, tint);
    const blooms = chance(a, b, 8) < 0.11 * (0.4 + 1.2 * meadow(z, x));
    bloomColour.setHex(BLOOMS[Math.floor(chance(a, b, 9) * BLOOMS.length)]);
    flower.set([bloomColour.r, bloomColour.g, bloomColour.b, blooms ? 1 : 0], 4 * k);
  });
  tuftMesh.geometry.setAttribute("aFlower", new THREE.InstancedBufferAttribute(flower, 4));
  tuftMesh.frustumCulled = false;
  scene.add(tuftMesh);

  /* The stones: tried at places scattered over the island, kept where the turf gives way to bare stone, along the shore's sand, and
     here and there on the turf. Each is sunk a third into the ground and turned its own way. */
  const stoneMat = lit(new THREE.MeshLambertMaterial({ flatShading: true }));
  const stonePlaces = [];
  for (let k = 0; k < stones * 60 && stonePlaces.length < stones; k++) {
    const r = beach[1] * Math.sqrt(chance(k, 1, 21)), turn = 2 * Math.PI * chance(k, 2, 21);
    const x = r * Math.cos(turn), z = r * Math.sin(turn);
    if (inCave(x, z) || byStage(x, z, 17) || !clear(x, z)) continue;
    const at = land(x, z);
    if (at.y < 0.25) continue;
    const shore = r >= beach[0];
    if (!shore && (r > extent || !((at.ny > 0.72 && at.ny < 0.9) || chance(k, 3, 21) < 0.035))) continue;
    stonePlaces.push([x, at.y, z, k]);
  }
  const stoneMesh = new THREE.InstancedMesh(stoneGeometry(), stoneMat, stonePlaces.length);
  stonePlaces.forEach(([x, y, z, k], n) => {
    const size = 0.5 + 1.4 * chance(k, 4, 21) ** 2;
    dummy.position.set(x, y + 0.08 * size, z);
    dummy.rotation.set(0.5 * (chance(k, 5, 21) - 0.5), 2 * Math.PI * chance(k, 6, 21), 0.5 * (chance(k, 7, 21) - 0.5));
    dummy.scale.set(size * (0.8 + 0.5 * chance(k, 8, 21)), size * (0.7 + 0.5 * chance(k, 9, 21)), size);
    dummy.updateMatrix();
    stoneMesh.setMatrixAt(n, dummy.matrix);
    stoneMesh.setColorAt(n, tint.setHex(0x8e8a82).lerp(bloomColour.setHex(0x5f5a54), chance(k, 10, 21)));
  });
  scene.add(stoneMesh);

  return {
    tufts: tuftMesh, stones: stoneMesh,
    wind: (time) => { wind.value = time; },
    thin: (half) => { tuftMesh.count = half ? Math.ceil(placed.length / 2) : placed.length; },
  };
}
