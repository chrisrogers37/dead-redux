/* eslint-disable */
import * as THREE from "three";
import { buildFlora } from "./flora.js";
import { CAVES, G, height, SHELF_Y, STAGE } from "./ground.js";
import { MOON } from "./night.js";
import { onCrowdGround } from "./seats.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, and at its north-east edge a shelf for the stage.
   The ground's height is in ground.js. */

/* The ground turns from turf to bare stone as its normal leans from 28 to 42 degrees off straight up. */
const TURF_TO = Math.cos((28 * Math.PI) / 180), STONE_FROM = Math.cos((42 * Math.PI) / 180);
/* The ring road runs from RING to SHORE m from the island's centre, and the shore past it is sand. */
export const RING = 112, SHORE = 118;
/* The lightning path's corners, from the island's north edge to its south, and how far it reaches to either side of its line. */
export const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)], BOLT_HALF = 1.5;
/* The tracks are packed earth worn into the land: the ring road, and the lightning path BOLT_HALF m to either side of its line. Each
   gives way to the land's own colour over FEATHER m at its edge. They are drawn in the ground's own shader (grained), by where a
   point of the ground lies, so they lie on it exactly wherever the ground goes. */
export const TRACK = 0x8a806c, FEATHER = 0.9;
const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* How far a point lies from the lightning path's line. */
function fromBolt(x, z) {
  let least = Infinity;
  for (let k = 0; k < BOLT.length - 1; k++) {
    const [ax, az] = BOLT[k], [bx, bz] = BOLT[k + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(dx * dx + dz * dz, 1e-6)));
    least = Math.min(least, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return least;
}
/* How far a point lies from the middle of the ring road. */
const fromRing = (x, z) => Math.abs(Math.hypot(x, z) - (RING + SHORE) / 2);
/* How much of a point of the ground is track: 1 on packed earth, 0 on the land, between them across a track's edge. The ground's
   shader reckons the same (TRACKS). */
export function tracksAt(x, z) {
  return Math.max(1 - ease((SHORE - RING) / 2, (SHORE - RING) / 2 + FEATHER, fromRing(x, z)), 1 - ease(BOLT_HALF, BOLT_HALF + FEATHER, fromBolt(x, z)));
}
/* Whether a point stands clear of both tracks by `room` m: what grows on the land grows there. */
export function offTracks(x, z, room) {
  return fromRing(x, z) > (SHORE - RING) / 2 + room && fromBolt(x, z) > BOLT_HALF + room;
}

/* How far past the crowd's ground the turf is trodden bare of tufts: a figure stands or sits anywhere on that ground, steps aside
   for the visitor and rises with the music, and a blade or a bloom that came up through it would flicker against it as it swayed. */
const CROWD_ROOM = 2;
/* How far from the setlist's path anything grows, and the side of the squares its points are sorted into (no less than that). */
const LOOP_ROOM = 2.2, LOOP_SQUARE = 4;
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
      /* Where the point stands in the world: for an instanced mesh, where its instance puts it. */
      .replace("#include <project_vertex>", `#include <project_vertex>
        #ifdef USE_INSTANCING
          vPoolAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
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
/* The grain's sizes, in cells a metre: tussocks about a metre across, and blades a hand across, which fade out between FINE_NEAR and
   FINE_FAR m from the eye, where they would only shimmer, and are not reckoned past it. The land's broad patches, some 9 m across, are
   in its colours by vertex (landColour), which costs a pixel nothing. With `relief` the two finer sizes also stand RELIEF m
   proud of the ground at their highest, so a low sun or the stage's glow picks the turf out; a phone does without it. The relief is
   read from how the grain's height changes from one pixel to the next, which costs no more of the grain than its colour does. */
const TUSSOCK = 0.9, BLADE = 5.3, FINE_NEAR = 22, FINE_FAR = 70, RELIEF = 0.126;
/* A grain is drawn in full while a pixel takes in no more than HELD_FROM of one of its cells, and is gone, into the ground's even
   colour, by HELD_TO of one: past that a pixel cannot hold it, and it would break into a dither where the land is seen edge-on. */
const HELD_FROM = 0.25, HELD_TO = 0.6;
/* The angle a pixel spans on a desktop's frame, 900 px tall with a 60 degree view; and the angle one spans for a camera and a frame
   `tall` px high. */
const PIXEL = (2 * Math.tan(Math.PI / 6)) / 900;
export const pixelAngle = (camera, tall) => (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, tall);
/* The tracks, as the ground's shader reckons them: tracksAt, in GLSL. */
const g2 = ([x, z]) => `vec2(${f(x)}, ${f(z)})`;
const TRACKS = `
float fromLine(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return distance(p, a + clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0) * ab); }
float tracks(vec2 p) {
  float ring = 1.0 - smoothstep(${f((SHORE - RING) / 2)}, ${f((SHORE - RING) / 2 + FEATHER)}, abs(length(p) - ${f((RING + SHORE) / 2)}));
  float bolt = min(min(fromLine(p, ${g2(BOLT[0])}, ${g2(BOLT[1])}), fromLine(p, ${g2(BOLT[1])}, ${g2(BOLT[2])})), fromLine(p, ${g2(BOLT[2])}, ${g2(BOLT[3])}));
  return max(ring, 1.0 - smoothstep(${f(BOLT_HALF)}, ${f(BOLT_HALF + FEATHER)}, bolt));
}`;
/* Has a material that takes the stage's glow (takesPool) wear the land's grain as well, and with `tracked` the tracks' packed earth
   where they run. `pixel` holds the angle one pixel of the frame spans, in radians, which whoever draws the mesh keeps to the camera
   and the frame (pixelAngle); left alone it is a desktop's. The material is one that shades smooth: the grain reads its normal. */
export function grained(material, relief, tracked = false, pixel = { value: PIXEL }) {
  const pool = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    pool(shader);
    shader.uniforms.uPixel = pixel;
    const earth = new THREE.Color(TRACK);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uPixel;${GRAIN}${tracked ? TRACKS : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${tracked ? `
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(earth.r)}, ${f(earth.g)}, ${f(earth.b)}), tracks(vPoolAt.xz));` : ""}
        /* How much ground this pixel takes in along the line of sight, in metres: as far as the ground is from the eye, by the
           angle a pixel spans (uPixel), over how squarely the eye meets the ground. Seen edge-on a pixel takes in more than a
           grain is wide, and a grain a pixel cannot hold only dithers, so each size of grain goes as its cells near a pixel's
           reach. The ground's own smooth normal is read, so the fade runs across the mesh's triangles without a step. */
        float covers = length(vViewPosition) * uPixel / max(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.02);
        /* Where the land bends sharply, as at the shore's rim, the smooth normal can stand squarer to the eye than the face it is
           drawn on, so the reach is never taken for less than the face's own, read from pixel to pixel. */
        vec2 acrossGround = dFdx(vPoolAt.xz), downGround = dFdy(vPoolAt.xz);
        covers = max(covers, sqrt(max(dot(acrossGround, acrossGround), dot(downGround, downGround))));
        float coarseShown = 1.0 - smoothstep(${f(HELD_FROM)}, ${f(HELD_TO)}, covers * ${f(TUSSOCK)});
        float fineShown = (1.0 - smoothstep(${f(FINE_NEAR)}, ${f(FINE_FAR)}, length(vViewPosition))) * (1.0 - smoothstep(${f(HELD_FROM)}, ${f(HELD_TO)}, covers * ${f(BLADE)}));
        float tussocks = 0.5, blades = 0.5;
        if (coarseShown > 0.0) tussocks = mix(0.5, grain(vPoolAt.xz * ${f(TUSSOCK)} + 17.0), coarseShown);
        if (fineShown > 0.0) blades = grain(vPoolAt.xz * ${f(BLADE)} + 41.0);
        diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - 0.5) + 0.26 * (blades - 0.5) * fineShown;`);
    if (relief) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        {
          /* The surface leans away from where the grain rises, as a bump map leans it (three's own way of it). */
          float high = ${f(RELIEF)} * (tussocks + 0.45 * fineShown * blades);
          vec3 acrossX = dFdx(-vViewPosition), acrossY = dFdy(-vViewPosition);
          vec3 r1 = cross(acrossY, normal), r2 = cross(normal, acrossX);
          float det = dot(acrossX, r1);
          vec3 grad = sign(det) * (dFdx(high) * r1 + dFdy(high) * r2);
          normal = normalize(max(abs(det), 1e-12) * normal - grad);
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
        float reach = max(abs(vAt.x), abs(vAt.y));
        float swell = 0.5;
        if (reach < 340.0) swell = 0.6 * grain(one / ${f(SWELL_M)}) + 0.4 * grain(two / ${f(SWELL_M * 0.45)} + 31.0);
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
        float foam = 0.0;
        if (depth < 0.5) foam = (1.0 - smoothstep(0.0, 0.5, depth)) * (0.55 + 0.45 * grain(vAt * 0.9 + 3.0));
        col = mix(col, uSea * 1.8 + vec3(0.06) + 0.3 * uGlow * pow(facing, 3.0), 0.7 * foam);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        /* The water ends 350 m out along each axis, nearer than the fog's far end from the shore: it is all haze before it ends. */
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(250.0, 340.0, reach));
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
  /* Each of the grid's points is reckoned once, the first time it is asked for. */
  const cell = 260 / grid, side = grid + 1, known = new Float64Array(side * side).fill(NaN);
  const at = (ix, iz) => {
    const k = iz * side + ix;
    if (Number.isNaN(known[k])) known[k] = height(ix * cell - 130, iz * cell - 130);
    return known[k];
  };
  return (x, z) => {
    const gx = Math.min(grid - 1e-9, Math.max(0, (x + 130) / cell)), gz = Math.min(grid - 1e-9, Math.max(0, (z + 130) / cell));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const a = at(ix, iz), b = at(ix, iz + 1), c = at(ix + 1, iz + 1), d = at(ix + 1, iz);
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
}

/* The land's colour at a point `y` up whose normal's height is `ny`, into `out`: turf over the hill, greener in its hollows and drier
   toward the summit, in broad patches; bare stone where the slope is steep; sand past the ring road, darker where the sea wets it; and
   the caves' bowls dark. Each gives way to the next over a few metres. */
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
  out.lerp(other.setHex(0x2a2622), 1 - ease(9, 14.5, cave));
  /* Broad patches of lighter and darker ground, some 9 m across. */
  return out.multiplyScalar(0.85 + 0.3 * field(x * 2.9 + 40, z * 2.9 - 15, 2.4));
}

/* The ground (a grid of the tier's size, coloured by vertex, with the ring road and the lightning path worn into it) and the sea,
   then what grows, lies and flies on the land (flora.js), then the caves' pools and lights. `loop` is the setlist's path as points
   [x, z] every couple of metres, which nothing grows on. It returns the caves, the flora and `shade`, which draws a look of the night
   on the island at a time: the water's colour, the light lying on it and its swell, the stage's glow on the ground (buildSea,
   takesPool), the wind in the tufts, and the fireflies. */
export function buildIsland(scene, grid, phone, loop = []) {
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
  const uPixel = { value: PIXEL }, drawn = new THREE.Vector2();
  const land = new THREE.Mesh(ground, grained(takesPool(new THREE.MeshLambertMaterial({ vertexColors: true }), uPool), !phone, true, uPixel));
  /* The grain fades by what a pixel of this frame takes in of the ground, whatever the tier's view and the render scale. */
  land.onBeforeRender = (renderer, _scene, camera) => { uPixel.value = pixelAngle(camera, renderer.getDrawingBufferSize(drawn).y); };
  scene.add(land);
  const sea = buildSea(scene, uPool);

  /* What grows and lies on the land (flora.js): as many tufts and stones as the tier's ground is fine, thickest on a desktop's (a
     grid of 80 or more), thinner on a TV's and fewer than half as thick on a phone's, whose frame is small and whose every triangle
     costs it more. Each stands on the ground as its mesh draws it and takes the stage's glow as the ground does, and none of them
     stands on a track or on the setlist's path, where the bears walk and the lit bands lie. No tuft grows on the crowd's ground;
     stones lie there as anywhere. */
  const thick = phone ? 0.6 : grid >= 80 ? 1.0 : 0.8;
  /* The path's points by the square of LOOP_SQUARE m each lies in, so a place is tried against the few points near it and not
     against the whole path. */
  const near = new Map(), square = (v) => Math.floor(v / LOOP_SQUARE), key = (i, j) => i * 4096 + j;
  for (const [px, pz] of loop) {
    const k = key(square(px), square(pz));
    if (!near.has(k)) near.set(k, []);
    near.get(k).push(px, pz);
  }
  const offLoop = (x, z) => {
    for (let i = square(x) - 1; i <= square(x) + 1; i++) for (let j = square(z) - 1; j <= square(z) + 1; j++) {
      const points = near.get(key(i, j));
      if (!points) continue;
      for (let k = 0; k < points.length; k += 2) if ((x - points[k]) ** 2 + (z - points[k + 1]) ** 2 < LOOP_ROOM * LOOP_ROOM) return false;
    }
    return true;
  };
  const flora = buildFlora(scene, { tufts: Math.round(grid * grid * thick), stones: Math.round(grid * (phone ? 2.5 : 4)), flies: Math.round(grid * (phone ? 8 : 14)),
    extent: RING - 1, beach: [SHORE + 0.8, SHORE + 3.6], surface: surfaceOf(grid),
    colour: landColour, lit: (material) => takesPool(material, uPool),
    clear: (x, z) => offTracks(x, z, FEATHER + 0.4) && offLoop(x, z), trodden: (x, z) => onCrowdGround(x, z, CROWD_ROOM) });

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
