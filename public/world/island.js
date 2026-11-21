/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildFlora } from "./flora.js";
import { CAVES, G, height, SHELF_Y, STAGE } from "./ground.js";
import { MOON } from "./night.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, and at its north-east edge a shelf for the stage.
   The ground's height is in ground.js. */

/* The ground turns from turf to bare stone as its normal leans from 28 to 42 degrees off straight up. */
const TURF_TO = Math.cos((28 * Math.PI) / 180), STONE_FROM = Math.cos((42 * Math.PI) / 180);
/* The ring road runs from RING to SHORE m from the island's centre, and the shore past it is sand. */
export const RING = 112, SHORE = 118;
/* The lightning path's corners, from the island's north edge to its south, and how far it reaches to either side of its line. */
export const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)], BOLT_HALF = 1.5;
/* Whether a point stands clear of both tracks, the ring road and the lightning path, by `room` m: what grows on the land grows there. */
export function offTracks(x, z, room) {
  const far = Math.hypot(x, z);
  if (far > RING - room && far < SHORE + room) return false;
  for (let k = 0; k < BOLT.length - 1; k++) {
    const [ax, az] = BOLT[k], [bx, bz] = BOLT[k + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < BOLT_HALF + room) return false;
  }
  return true;
}

/* The stage's light on the water: its colour at its fullest, as the screen shows it, and where it lies, from SHINE_OUT m past the stage's
   centre out to sea along the stage's axis, SHINE_LONG m along it and SHINE_WIDE m across. The shore stands 25 m past the stage. */
const SHINE = [0.4, 0.25, 0.1], SHINE_OUT = 36, SHINE_LONG = 30, SHINE_WIDE = 28;
/* The stage's glow on the ground: a steady warm light from POOL_UP m over the stage's floor, in POOL's colour at the night's deepest,
   half as strong POOL_HALF m away and gone by POOL_END. It lights the ground and the bands on it and nothing else, so the crowd stands
   dark against it; and the music does not move it, so it adds no swing in brightness to the stage's own light (stage.js), which the
   music does move. */
const POOL = new THREE.Color(0xff7a30).multiplyScalar(5), POOL_UP = 7, POOL_HALF = 15, POOL_END = 85;
const f = (v) => v.toFixed(4);

/* Has a Lambert material take the stage's glow (`uPool`, its colour times its strength) as one more light on it, by the angle its
   face turns to the stage. */
export function takesPool(material, uPool) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPool = uPool;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPoolAt;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPool;\nvarying vec3 vPoolAt;")
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        vec3 poolTo = vec3(${f(STAGE[0])}, ${f(SHELF_Y + POOL_UP)}, ${f(STAGE[1])}) - vPoolAt;
        float poolFar = length(poolTo) / ${f(POOL_HALF)};
        float poolLit = max(dot(normal, normalize((viewMatrix * vec4(poolTo, 0.0)).xyz)), 0.0);
        reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit * (1.0 - smoothstep(${f(0.6 * POOL_END / POOL_HALF)}, ${f(POOL_END / POOL_HALF)}, poolFar)) / (1.0 + poolFar * poolFar);`);
  };
  return material;
}

/* The land's grain, drawn in the ground's own shader: three sizes of soft mottling by a point's place on the island, so turf, stone and
   sand each read as a surface and not as one flat colour. `grain` runs 0 to 1 over cells one unit across. */
const GRAIN = `
float grainAt(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float grain(vec2 p) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(grainAt(i), grainAt(i + vec2(1.0, 0.0)), u.x), mix(grainAt(i + vec2(0.0, 1.0)), grainAt(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
/* The grain's sizes, in cells a metre: patches some 9 m across, tussocks about a metre, and blades a hand across, which fade out
   between FINE_NEAR and FINE_FAR m from the eye, where they would only shimmer. With `relief` the two finer sizes also tilt the
   surface a little, so a low sun or the stage's glow picks the turf out; a phone does without it. */
const PATCH = 0.11, TUSSOCK = 0.9, BLADE = 5.3, FINE_NEAR = 22, FINE_FAR = 70;
/* Has a material that takes the stage's glow (takesPool) wear the land's grain as well. */
export function grained(material, relief) {
  const pool = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    pool(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${GRAIN}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float fineShown = 1.0 - smoothstep(${f(FINE_NEAR)}, ${f(FINE_FAR)}, length(vViewPosition));
        diffuseColor.rgb *= 0.8 + 0.3 * grain(vPoolAt.xz * ${f(PATCH)}) + 0.2 * (grain(vPoolAt.xz * ${f(TUSSOCK)} + 17.0) - 0.5)
          + 0.26 * (grain(vPoolAt.xz * ${f(BLADE)} + 41.0) - 0.5) * fineShown;`);
    if (relief) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        {
          vec2 at = vPoolAt.xz;
          float shown = 1.0 - smoothstep(${f(FINE_NEAR)}, ${f(FINE_FAR)}, length(vViewPosition));
          #define LAND(p) (grain((p) * ${f(TUSSOCK)} + 17.0) + 0.45 * shown * grain((p) * ${f(BLADE)} + 41.0))
          float here = LAND(at);
          vec3 tilt = vec3(here - LAND(at + vec2(0.14, 0.0)), 0.0, here - LAND(at + vec2(0.0, 0.14)));
          normal = normalize(normal + 0.9 * (viewMatrix * vec4(tilt, 0.0)).xyz);
        }`);
  };
  return material;
}

/* The sea: water in the night's colour for it (night.js), with twilight's glow lying on it as a path toward where the sun set or
   will rise, the moon's path the same way toward the moon, and the stage's light on the water behind the stage. A slow swell crosses
   it, a little paler on its backs, and breaks each path into bars of light; over the sand the water is shallow and paler, and it
   laps the shore in a line of foam. One mesh on its own material, so it costs one draw call, as the plain sea did; it is not lit, and
   it takes the fog, so it fades into the haze as the ground does. It writes its colours as they are, as the sky does (sky.js).
   Returns what draws a look of the night on it at a time (the sky's own, which stands still under reduced motion) and sets the
   stage's glow on the ground (`uPool`). */
/* The swell: SWELL_M m from back to back, crossing a point every SWELL_S seconds, slow enough that no patch of water brightens and
   dims faster than once in several seconds. The shore's line breathes in and out over LAP_S seconds. */
const SWELL_M = 9, SWELL_S = 7, LAP_S = 9;
function buildSea(scene, uPool) {
  const far = Math.hypot(STAGE[0], STAGE[1]), ox = STAGE[0] / far, oz = STAGE[1] / far;
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSea: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uShine: { value: new THREE.Color() }, uSunTo: { value: new THREE.Vector2(0, -1) }, uMoon: { value: 0 }, uTide: { value: 0 } };
  /* The way to the moon along the water. */
  const moonFar = Math.hypot(MOON[0], MOON[2]), mx = MOON[0] / moonFar, mz = MOON[2] / moonFar;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      varying highp vec2 vAt;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vAt = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uSea, uGlow, uShine;
      uniform vec2 uSunTo;
      uniform float uMoon;
      uniform highp float uTide;
      varying highp vec2 vAt;
      #include <fog_pars_fragment>
      ${GRAIN}
      void main() {
        float r = length(vAt);
        /* The swell, 0 in a trough and 1 on a back: two trains of it crossing, drifting. */
        highp vec2 drift = vec2(0.31, 0.95) * uTide * ${f(SWELL_M / SWELL_S)};
        /* Each train's backs lie long across the way it runs: three times as long as the trains stand apart. */
        highp vec2 one = vec2(dot(vAt + drift, vec2(0.31, 0.95)), 0.33 * dot(vAt, vec2(0.95, -0.31)));
        highp vec2 two = vec2(dot(vAt - 1.7 * drift, vec2(-0.62, 0.78)), 0.33 * dot(vAt, vec2(0.78, 0.62)));
        float swell = 0.6 * grain(one / ${f(SWELL_M)}) + 0.4 * grain(two / ${f(SWELL_M * 0.45)} + 31.0);
        /* How deep the water stands over the island's own ground (ground.js slope, past the ring road), lapping in and out. */
        float depth = (r - 118.0) * 0.55 - 2.5 - 0.6 * sin(vAt.x * 0.3) * cos(vAt.y * 0.27) + 0.22 * sin(6.2832 * uTide / ${f(LAP_S)} + 0.11 * (vAt.x + vAt.y));
        /* The light lies on the water between the eye and its source, so each path runs from under the eye toward it. */
        vec2 out2 = vAt - cameraPosition.xz;
        vec2 away = out2 / max(length(out2), 1.0);
        float facing = max(dot(away, uSunTo), 0.0);
        float bars = 0.55 + 0.9 * swell;
        vec3 col = uSea * (0.92 + 0.18 * swell) + uGlow * (0.34 * pow(facing, 60.0) * bars + 0.1 * pow(facing, 6.0)) * smoothstep(118.0, 160.0, r);
        float moonward = max(dot(away, vec2(${f(mx)}, ${f(mz)})), 0.0);
        col += uMoon * vec3(0.2, 0.25, 0.37) * (pow(moonward, 90.0) * bars + 0.16 * pow(moonward, 6.0)) * smoothstep(118.0, 150.0, r);
        vec2 s = vAt - vec2(${f(STAGE[0])}, ${f(STAGE[1])});
        float along = (dot(s, vec2(${f(ox)}, ${f(oz)})) - ${f(SHINE_OUT)}) / ${f(SHINE_LONG)}, across = dot(s, vec2(${f(-oz)}, ${f(ox)})) / ${f(SHINE_WIDE)};
        col += uShine * exp(-along * along - across * across) * (0.7 + 0.6 * swell);
        /* The shallows over the sand, paler and a little greener, and the foam where the water gives out. */
        vec3 pale = uSea * 1.5 + vec3(0.02, 0.035, 0.03) + 0.25 * uGlow * pow(facing, 6.0);
        col = mix(col, pale, 0.6 * exp(-max(depth, 0.0) * 0.9));
        float foam = (1.0 - smoothstep(0.0, 0.5, depth)) * (0.55 + 0.45 * grain(vAt * 0.9 + 3.0));
        col = mix(col, uSea * 1.8 + vec3(0.06) + 0.3 * uGlow * pow(facing, 3.0), 0.7 * foam);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        /* The water ends 350 m out along each axis, nearer than the fog's far end from the shore: it is all haze before it ends. */
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(250.0, 340.0, max(abs(vAt.x), abs(vAt.y))));
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), mat));
  return (look, time = 0) => {
    uniforms.uTide.value = time;
    uniforms.uSea.value.fromArray(look.sea);
    uniforms.uGlow.value.fromArray(look.glow);
    uniforms.uSunTo.value.fromArray(look.glowTo);
    uniforms.uMoon.value = look.moon;
    uniforms.uShine.value.fromArray(SHINE).multiplyScalar(look.shine);
    uPool.value.copy(POOL).multiplyScalar(look.shine);
  };
}

/* The ground's height as its mesh draws it: the mesh is flat across each half of a cell of its grid, so between the grid's points it
   lies a little under or over the island's own height (ground.js). What lies on the ground lies on this. */
export function surfaceOf(grid) {
  const cell = 260 / grid;
  return (x, z) => {
    const gx = Math.min(grid - 1e-9, Math.max(0, (x + 130) / cell)), gz = Math.min(grid - 1e-9, Math.max(0, (z + 130) / cell));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, x0 = ix * cell - 130, z0 = iz * cell - 130;
    const a = height(x0, z0), b = height(x0, z0 + cell), c = height(x0 + cell, z0 + cell), d = height(x0 + cell, z0);
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
}

/* The land's colour at a point `y` up whose normal's height is `ny`, into `out`: turf over the hill, greener in its hollows and drier
   toward the summit, in broad patches; bare stone where the slope is steep; sand past the ring road, darker where the sea wets it; and
   the caves' bowls dark. Each gives way to the next over a few metres. */
const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* A soft field 0 to 1 over the island, the same on every tier: three sines that never line up. */
const field = (x, z, k) => 0.5 + 0.25 * Math.sin(x * 0.071 * k + 1.3) * Math.cos(z * 0.063 * k - 0.4) + 0.25 * Math.sin((x + z) * 0.043 * k + 2.1);
const other = new THREE.Color(), tone = new THREE.Color();
export function landColour(x, y, z, ny, out) {
  out.setHex(0x55663f).lerp(other.setHex(0x6d7748), field(x, z, 1));
  out.lerp(other.setHex(0x8a8148), 0.75 * ease(14, 30, y) * field(x, z, 2.3));
  out.lerp(other.setHex(0x8e8a82).lerp(tone.setHex(0x6f6a63), field(z, x, 3.1)), 1 - ease(STONE_FROM, TURF_TO, ny));
  out.lerp(other.setHex(0xa39672).lerp(tone.setHex(0x6b6350), 1 - ease(0.2, 1.6, y)), ease(SHORE - 3, SHORE + 1.5, Math.hypot(x, z)));
  let cave = Infinity;
  for (const [cx, cz] of CAVES) cave = Math.min(cave, Math.hypot(x - cx, z - cz));
  return out.lerp(other.setHex(0x2a2622), 1 - ease(9, 14.5, cave));
}

/* A track worn into the ground along `points` ([x, z], a ring when `closed`), `half` m to either side of them: packed earth that gives
   way to the land's own colour over FEATHER m at each edge, lying on the ground as its mesh draws it (`surface`), a hand above it. Its
   corners are mitred, so a track that turns sharply comes to a point, as the lightning does. */
export const TRACK = 0x8a806c, FEATHER = 0.9, TRACK_STEP = 1.2;
export function track(points, closed, half, surface) {
  /* The track's line, a point every TRACK_STEP m or less, each with the way across the track there and how far the mitre stretches it. */
  const line = [], n = points.length, last = closed ? n : n - 1;
  const across = (k) => { const [ax, az] = points[k % n], [bx, bz] = points[(k + 1) % n], len = Math.hypot(bx - ax, bz - az); return [(bz - az) / len, -(bx - ax) / len]; };
  for (let k = 0; k < last; k++) {
    const [ax, az] = points[k], [bx, bz] = points[(k + 1) % n], [nx, nz] = across(k);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / TRACK_STEP));
    for (let j = 0; j < steps; j++) {
      let mx = nx, mz = nz, stretch = 1;
      if (j === 0 && (closed || k > 0)) {
        /* A corner: across it lies halfway between the two sides' own ways across, longer by the turn. */
        const [px, pz] = across((k - 1 + n) % n), len = Math.hypot(px + nx, pz + nz) || 1;
        mx = (px + nx) / len; mz = (pz + nz) / len;
        stretch = Math.min(3, 1 / Math.max(1e-3, mx * nx + mz * nz));
      }
      line.push([ax + ((bx - ax) * j) / steps, az + ((bz - az) * j) / steps, mx, mz, stretch]);
    }
  }
  if (!closed) { const [nx, nz] = across(n - 2); line.push([points[n - 1][0], points[n - 1][1], nx, nz, 1]); }
  const count = line.length, rows = closed ? count + 1 : count;
  const position = new Float32Array(rows * 4 * 3), colour = new Float32Array(rows * 4 * 3), index = [], c = new THREE.Color();
  const OFFSETS = [-(half + FEATHER), -half, half, half + FEATHER];
  for (let r = 0; r < rows; r++) {
    const [x, z, mx, mz, stretch] = line[r % count];
    for (let e = 0; e < 4; e++) {
      const px = x + mx * OFFSETS[e] * stretch, pz = z + mz * OFFSETS[e] * stretch, edge = e === 0 || e === 3, y = surface(px, pz);
      position.set([px, y + (edge ? 0.02 : 0.1), pz], (r * 4 + e) * 3);
      if (edge) {
        const gx = (height(px + 0.5, pz) - height(px - 0.5, pz)), gz = (height(px, pz + 0.5) - height(px, pz - 0.5));
        landColour(px, y, pz, 1 / Math.sqrt(1 + gx * gx + gz * gz), c);
      } else c.setHex(TRACK);
      c.toArray(colour, (r * 4 + e) * 3);
    }
    if (r < rows - 1) for (let e = 0; e < 3; e++) { const a = r * 4 + e, b = a + 4; index.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/* The ground (a grid of the tier's size, coloured by vertex) and the sea, then the ring road and the lightning path, then the caves'
   pools and lights. It returns the caves and `shade`, which draws a look of the night on the island: the water's colour and the light
   lying on it, and the stage's glow on the ground (buildSea, takesPool). */
export function buildIsland(scene, grid, phone) {
  const ground = new THREE.PlaneGeometry(260, 260, grid, grid);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  /* The ground's colours, by vertex (landColour); the shader's grain (grained) breaks up what is left of the facets. */
  const normal = ground.attributes.normal, colors = new Float32Array(pos.count * 3), color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) landColour(pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i), color).toArray(colors, i * 3);
  ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const uPool = { value: new THREE.Color(0x000000) };
  scene.add(new THREE.Mesh(ground, grained(takesPool(new THREE.MeshLambertMaterial({ vertexColors: true }), uPool), !phone)));
  const sea = buildSea(scene, uPool);

  /* The ring road and the lightning path: two tracks worn into the ground (track), one mesh between them, so one draw call. It lies
     a hand above the ground and is drawn as if a little nearer, so the ground under it never shows through. */
  const bandMat = grained(takesPool(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), uPool), false);
  const surface = surfaceOf(grid), round = (RING + SHORE) / 2;
  const ringLine = Array.from({ length: 240 }, (_, k) => [round * Math.cos((k / 240) * 2 * Math.PI), round * Math.sin((k / 240) * 2 * Math.PI)]);
  scene.add(new THREE.Mesh(mergeGeometries([track(ringLine, true, (SHORE - RING) / 2, surface), track(BOLT, false, BOLT_HALF, surface)]), bandMat));

  /* What grows and lies on the land (flora.js): as many tufts and stones as the tier's ground is fine, thickest on a desktop's (a
     grid of 80 or more), thinner on a TV's and fewer than half as thick on a phone's, whose frame is small and whose every triangle
     costs it more; each takes the stage's glow as the ground does, and none of them stands on a track. */
  const thick = phone ? 0.8 : grid >= 80 ? 1.9 : 1.1;
  const flora = buildFlora(scene, { tufts: Math.round(grid * grid * thick), stones: Math.round(grid * (phone ? 2.5 : 4)), flies: Math.round(grid * (phone ? 4 : 7)),
    extent: RING - 1, beach: [SHORE + 0.8, SHORE + 3.6],
    colour: landColour, lit: (material) => takesPool(material, uPool), clear: (x, z) => offTracks(x, z, FEATHER + 0.4) });

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
  /* A look of the night on the island at a time: the sea's, the wind in the tufts at the same time, and the fireflies, which come out
     as far as the night is dark and `calm` (1 when the music is quiet, 0 at its loudest) lets them. */
  const shade = (look, time = 0, calm = 1) => { sea(look, time); flora.wind(time); flora.glow(look.dark * look.dark * (0.35 + 0.65 * calm)); };
  return { caves, shade, flora };
}
