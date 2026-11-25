/* eslint-disable */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { CAVES, height, STAGE } from "./ground.js";

/* What grows, lies and flies on the land: tufts of grass over the turf, some in flower; stones where the slope steepens and along the
   shore; and fireflies over the meadows in the dark. The tufts and the stones are one instanced mesh each and the fireflies one set of
   points, so the three cost three draw calls however many there are. Nothing here is walked round: a tuft stands no higher than a
   figure's knee, its bloom a hand above that, and a stone no higher than a bear's shin. */

/* A number from 0 to 1 for a whole-numbered place and a salt, the same on every visit: nothing here is left to chance, so two stills of
   a world that holds still are the same still. */
export function chance(i, j, salt) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* One tuft in its own units, a metre tall at its tallest blade and a tenth more to its bloom's top: BLADES blades fanned round its root, each a single triangle leaning out,
   darker at the foot and paler at the tip (the colours multiply the tuft's own, by instance); and a stem with a bloom on it, which
   only a tuft in flower shows. aTip is 0 at the ground and 1 at a blade's tip, where the wind moves it; aBloom marks the bloom. */
const BLADES = 6, BLOOM = 0.19;
export function tuftGeometry() {
  const position = [], colour = [], tip = [], bloom = [], index = [];
  const blade = (turn, lean, wide, tall) => {
    const ax = Math.cos(turn), az = Math.sin(turn), first = position.length / 3;
    position.push(-az * wide, 0, ax * wide, az * wide, 0, -ax * wide, ax * lean * tall, tall, az * lean * tall);
    colour.push(0.62, 0.66, 0.56, 0.62, 0.66, 0.56, 1.2, 1.22, 1.0);
    tip.push(0, 0, 1);
    bloom.push(0, 0, 0);
    index.push(first, first + 1, first + 2);
  };
  for (let b = 0; b < BLADES; b++) blade((b / BLADES) * 2 * Math.PI + 0.6 * chance(b, 1, 7), 0.3 + 0.5 * chance(b, 2, 7), 0.1 + 0.06 * chance(b, 3, 7), 0.5 + 0.5 * chance(b, 4, 7));
  blade(0.4, 0.05, 0.025, 0.95);
  /* The bloom: eight faces on six corners round the stem's top, which sways with it. */
  const first = position.length / 3, at = [0.05 * 0.95, 0.97, 0.02];
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    position.push(at[0] + x * BLOOM, at[1] + y * BLOOM * 0.7, at[2] + z * BLOOM);
    /* Its own shading, since it takes the light as the ground does: paler on top, deeper underneath, and one side of it a little in
       its own shade, so it reads as a round head and not a flat card. The bloom's colour, by instance, multiplies it. */
    const shade = 0.9 + 0.32 * y + 0.1 * x - 0.14 * z;
    colour.push(shade, shade, shade);
    tip.push(1);
    bloom.push(1);
  }
  for (const [a, b, c] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) index.push(first + a, first + b, first + c);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colour, 3));
  geo.setAttribute("aTip", new THREE.Float32BufferAttribute(tip, 1));
  geo.setAttribute("aBloom", new THREE.Float32BufferAttribute(bloom, 1));
  /* Every corner's normal stands straight up: the shader lights a tuft as the ground under it. */
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(position.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(index);
  return geo;
}

/* How far the largest stone reaches from where it lies: its corners stand up to 0.61 of its size out (stoneGeometry), it is up to
   1.3 times as wide one way as its size, and its size is up to 1.9 m (buildFlora). */
export const STONE_REACH = 0.61 * 1.3 * 1.9;

/* A stone in its own units, about a metre across and lower than it is wide, no two of its corners the same distance out. */
export function stoneGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.5, 1), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    /* By the corner's own place, so the corners that the faces share move together and the stone stays closed. */
    const out = 0.78 + 0.44 * chance(Math.round(v.x * 100), Math.round(v.y * 100) * 31 + Math.round(v.z * 100), 11);
    pos.setXYZ(i, v.x * out, v.y * out * 0.62, v.z * out);
  }
  /* Its faces are shaded flat, so its corners need no normals of their own and each is kept once: 42 where the faces list 240. */
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  return mergeVertices(geo, 1e-4);
}

/* Tufts are drawn in full to SEEN_NEAR m from the eye and are gone by SEEN_FAR, where each would be a speck that only shimmers. The
   wind leans a blade's tip SWAY of the tuft's height downwind and back once in ten seconds or so, with a smaller lean every four and
   a half seconds, so a tall tuft's tip travels further than a short one's and both lean alike: 1.6 times SWAY of its height at the
   most, when the two fall together. Slow and slight, so a pale bloom never flickers against the ground behind it. */
const SEEN_NEAR = 55, SEEN_FAR = 95, SWAY = 0.058;
/* How many tufts a frame that is only counted draws (sparse). */
const SPARSE = 64;
const f = (v) => v.toFixed(4);
/* The dancing bears' colours and a cream, each a little muted, for the blooms. */
const BLOOMS = [0xc85a72, 0xd9a548, 0xcfc8b4, 0x9078b4, 0xd9a548, 0xc85a72];

/* The fireflies: each wanders FLY_ROAM m to every side of its own place over the grass, along the lie of the land there, and rises
   and falls FLY_BOB of that as it goes; and lights up once every FLY_SLOW to FLY_QUICK seconds, a soft rise and fall that fills
   about a third of that time, so no one of them brightens and dims faster than once in FLY_QUICK seconds. They show as far as the
   night is dark and the music quiet, and are gone by FLY_FAR m from the eye. */
const FLY_ROAM = 1.6, FLY_BOB = 0.45, FLY_SLOW = 5.2, FLY_QUICK = 2.5, FLY_FAR = 80;
/* At the lowest of its wander a firefly is FLY_CLEAR m over the highest ground it passes, or up to FLY_LIFT m more, so none ever
   sinks into a hillside and goes out. The ground under a wander is read at FLY_STEPS places each way from its middle, and the land's
   lie it follows is never steeper than FLY_LIE. */
const FLY_CLEAR = 0.4, FLY_LIFT = 1.2, FLY_STEPS = 3, FLY_LIE = 0.6;
/* The glow under which a firefly is too faint to see. The show's opening is under it: the dark there is under 0.2, and the glow is
   no more than its square. */
const FLY_SEEN = 0.05;
const FLY_COLOUR = [0.8, 1.0, 0.42];

/* Builds what grows and lies on the land: at most `tufts` tufts and `stones` stones, and `flies` fireflies over the tufts. The turf reaches `extent` m from the island's
   centre and the shore's sand lies from `beach[0]` to `beach[1]` m out; `surface(x, z)` is the ground's height as its mesh draws it,
   which all of them stand on; `colour(x, y, z, ny, out)` gives the land's colour at a point,
   `lit(material)` has a material take the light the ground takes (the stage's glow), `clear(x, z)` is false where nothing may
   stand (a track), and `trodden(x, z)` is true where the turf is trodden, so no tuft grows, no stone lies and no firefly flies (the crowd's ground). A tuft grows on turf, more thickly in some meadows than others, and a stone lies where the turf gives way to bare
   stone, along the shore's sand, and here and there on the turf, but never among the crowd. Returns `wind(time)`, which sways the tufts and moves the
   fireflies at a time; `glow(level)`, which lights the fireflies from 0, by day, to 1; `thin(half)`, which draws half the tufts
   and half the fireflies, or all of them; and `sparse()`, which from then on draws a handful of tufts, for a frame that is only
   counted and never looked at. */
export function buildFlora(scene, { tufts, stones, flies = 0, extent, beach, surface = height, colour, lit, clear, trodden = () => false }) {
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), bloomColour = new THREE.Color();
  /* The land at a point: the height its mesh draws it at, and how upright the island's own slope stands there (1 on level ground). */
  const land = (x, z) => {
    const y = surface(x, z), gx = height(x + 0.5, z) - height(x - 0.5, z), gz = height(x, z + 0.5) - height(x, z - 0.5);
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
        if (aBloom > 0.5) vColor.rgb = aFlower.rgb * color.rgb;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        /* The tuft's root is its instance's place: the mesh itself stands at the world's origin, unturned. */
        vec3 root = instanceMatrix[3].xyz;
        float shown = 1.0 - smoothstep(${f(SEEN_NEAR)}, ${f(SEEN_FAR)}, distance(cameraPosition, root));
        if (aBloom > 0.5 && aFlower.a < 0.5) transformed = vec3(0.0);
        if (aTip > 0.0) {
          /* One wind: the same way in the world for every tuft, whichever way each is turned, so into each tuft's own frame; and
             as far as the tuft is tall. */
          float tall = length(instanceMatrix[1].xyz);
          float sway = aTip * ${f(SWAY)} * tall * (sin(uWind * 0.6 + root.x * 0.35 + root.z * 0.27) + 0.4 * sin(uWind * 1.4 + root.z * 0.9));
          vec2 wind = vec2(sway, 0.6 * sway), ax = instanceMatrix[0].xz, az = instanceMatrix[2].xz;
          transformed.xz += vec2(dot(wind, ax) / dot(ax, ax), dot(wind, az) / dot(az, az));
        }
        transformed *= shown;`);
    /* Both faces of a blade take the light as its upper one does. */
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        normal = normalize(vNormal);`);
  };
  /* The cells are of a size that puts about twice as many in the turf's circle as the tufts asked for (pi / 1.6 times). A cell on a
     track, a steep slope or a thin meadow grows none, so most lands grow nearly all that is asked and none grows more. */
  const cell = Math.sqrt((extent * extent * 1.6) / tufts), span = Math.ceil(extent / cell);
  /* Every cell once, in an order shuffled by the cells' own numbers, so half the tufts, or a handful, are spread over the whole island. */
  const cells = [];
  for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) cells.push([chance(a, b, 0), a, b]);
  cells.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const placed = [];
  for (const [, a, b] of cells) {
    if (placed.length >= tufts) break;
    const x = (a + chance(a, b, 1)) * cell, z = (b + chance(a, b, 2)) * cell;
    if (Math.hypot(x, z) > extent || inCave(x, z) || byStage(x, z, 15) || !clear(x, z) || trodden(x, z)) continue;
    const at = land(x, z);
    if (at.ny < 0.9 || chance(a, b, 3) > 0.3 + 0.7 * meadow(x, z)) continue;
    placed.push([x, at.y, z, at.ny, a, b]);
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
     here and there on the turf, off the crowd's trodden ground. Each is sunk a third into the ground and turned its own way. */
  const stoneMat = lit(new THREE.MeshLambertMaterial({ flatShading: true }));
  const stonePlaces = [];
  for (let k = 0; k < stones * 60 && stonePlaces.length < stones; k++) {
    const r = beach[1] * Math.sqrt(chance(k, 1, 21)), turn = 2 * Math.PI * chance(k, 2, 21);
    const x = r * Math.cos(turn), z = r * Math.sin(turn);
    if (inCave(x, z) || byStage(x, z, 17) || !clear(x, z) || trodden(x, z)) continue;
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

  /* The most tufts drawn: all of them, until a caller asks for a handful (sparse). */
  let most = Infinity;
  /* The fireflies: over tufts spread across the island, above the grass. Their light is added to what is behind them, and they
     write no depth, so one never hides another; they hide behind the land and whatever stands on it. */
  const flyLevel = { value: 0 };
  /* The height in pixels of the frame they are drawn into, which their size is a share of, so they are as large on the screen
     whatever the render scale. */
  const flyTall = { value: 900 }, drawn = new THREE.Vector2();
  const flyCount = Math.min(flies, placed.length);
  const flyAt = new Float32Array(3 * flyCount), flySeed = new Float32Array(4 * flyCount), flyLie = new Float32Array(2 * flyCount);
  const lie = (rise) => Math.max(-FLY_LIE, Math.min(FLY_LIE, rise / (2 * FLY_ROAM)));
  /* The lie of the land across a wander at (x, z), east and south, which the wander follows; and the highest the ground stands over
     that lie anywhere under the wander, which its lowest point clears. */
  const wander = (x, z) => {
    const lx = lie(surface(x + FLY_ROAM, z) - surface(x - FLY_ROAM, z)), lz = lie(surface(x, z + FLY_ROAM) - surface(x, z - FLY_ROAM));
    let proud = -Infinity;
    for (let i = -FLY_STEPS; i <= FLY_STEPS; i++) for (let j = -FLY_STEPS; j <= FLY_STEPS; j++) {
      const dx = (i / FLY_STEPS) * FLY_ROAM, dz = (j / FLY_STEPS) * FLY_ROAM;
      proud = Math.max(proud, surface(x + dx, z + dz) - lx * dx - lz * dz);
    }
    return { lx, lz, proud };
  };
  for (let k = 0; k < flyCount; k++) {
    /* Every so-many-th tuft, which the cells' scattered order has already spread across the island. */
    const [x, , z, , a, b] = placed[Math.floor((k * placed.length) / flyCount)];
    const { lx, lz, proud } = wander(x, z);
    flyAt.set([x, proud + FLY_BOB * FLY_ROAM + FLY_CLEAR + FLY_LIFT * chance(a, b, 31), z], 3 * k);
    flySeed.set([chance(a, b, 32), chance(a, b, 33), chance(a, b, 34), chance(a, b, 35)], 4 * k);
    flyLie.set([lx, lz], 2 * k);
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute("position", new THREE.BufferAttribute(flyAt, 3));
  flyGeo.setAttribute("aSeed", new THREE.BufferAttribute(flySeed, 4));
  flyGeo.setAttribute("aLie", new THREE.BufferAttribute(flyLie, 2));
  const flyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: wind, uGlow: flyLevel, uTall: flyTall },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aSeed;
      attribute vec2 aLie;
      uniform highp float uTime;
      uniform float uGlow, uTall;
      varying float vLit;
      void main() {
        vec3 roam = ${f(FLY_ROAM)} * vec3(sin(uTime * (0.21 + 0.2 * aSeed.x) + 6.2832 * aSeed.y), ${f(FLY_BOB)} * sin(uTime * (0.33 + 0.2 * aSeed.z) + 6.2832 * aSeed.w),
          cos(uTime * (0.17 + 0.2 * aSeed.y) + 6.2832 * aSeed.x));
        /* Up the slope as it wanders up the land, and down as it wanders down. */
        roam.y += dot(aLie, roam.xz);
        vec4 seen = modelViewMatrix * vec4(position + roam, 1.0);
        /* One light every FLY_SLOW to FLY_QUICK seconds: the upper part of a slow wave, cubed, so it swells and dies away. */
        float wave = max(0.0, sin(uTime * 6.2832 / mix(${f(FLY_SLOW)}, ${f(FLY_QUICK)}, aSeed.w) + 6.2832 * aSeed.z));
        vLit = uGlow * wave * wave * wave * (1.0 - smoothstep(${f(0.5 * FLY_FAR)}, ${f(FLY_FAR)}, -seen.z));
        gl_PointSize = uTall * clamp((0.58 + 0.36 * aSeed.x) / -seen.z, 0.0028, 0.022);
        gl_Position = projectionMatrix * seen;
      }`,
    fragmentShader: `
      varying float vLit;
      void main() {
        /* A bright heart in a soft halo. */
        float out_ = length(gl_PointCoord - 0.5) * 2.0;
        float soft = (1.0 - smoothstep(0.0, 1.0, out_)) * (0.35 + 1.9 * (1.0 - smoothstep(0.0, 0.3, out_)));
        gl_FragColor = vec4(vec3(${FLY_COLOUR.map(f).join(", ")}) * vLit * soft, 1.0);
      }`,
  });
  const flyPoints = new THREE.Points(flyGeo, flyMat);
  flyPoints.frustumCulled = false;
  flyPoints.visible = false;
  flyPoints.onBeforeRender = (renderer) => { flyTall.value = renderer.getDrawingBufferSize(drawn).y; };
  scene.add(flyPoints);

  return {
    tufts: tuftMesh, stones: stoneMesh, flies: flyPoints,
    wind: (time) => { wind.value = time; },
    /* By day and at last light, under a twentieth of their glow, they are not drawn at all, which saves their draw call. */
    glow: (level) => { flyLevel.value = level; flyPoints.visible = level > FLY_SEEN; },
    thin: (half) => {
      tuftMesh.count = Math.min(most, half ? Math.ceil(placed.length / 2) : placed.length);
      flyGeo.setDrawRange(0, half ? Math.ceil(flyCount / 2) : flyCount);
    },
    /* The tufts are one draw call however few of them are drawn, as long as one is. */
    sparse: () => { most = Math.min(placed.length, SPARSE); tuftMesh.count = Math.min(tuftMesh.count, most); },
  };
}
