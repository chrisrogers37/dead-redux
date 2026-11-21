/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAVES, G, height, SHELF_Y, STAGE } from "./ground.js";
import { MOON } from "./night.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, and at its north-east edge a shelf for the stage.
   The ground's height is in ground.js. */

/* A ground vertex whose normal leans more than 35 degrees from straight up stands on a steep slope. */
const STEEP = Math.cos((35 * Math.PI) / 180);
/* The ring road runs from RING to SHORE m from the island's centre, and the shore past it is sand. */
export const RING = 112, SHORE = 118;

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
function takesPool(material, uPool) {
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

/* The sea: flat water in the night's colour for it (night.js), with twilight's glow lying on it as a path toward where the sun set or
   will rise, from the shore out, the moon's path the same way toward the moon, and the stage's light on the water behind the stage. One mesh on its own material, so it costs one
   draw call, as the plain sea did; it is not lit, and it takes the fog, so it fades into the haze as the ground does. It writes its
   colours as they are, as the sky does (sky.js). Returns what draws a look of the night on it and sets the stage's glow on the ground
   (`uPool`). */
function buildSea(scene, uPool) {
  const far = Math.hypot(STAGE[0], STAGE[1]), ox = STAGE[0] / far, oz = STAGE[1] / far;
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSea: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uShine: { value: new THREE.Color() }, uSunTo: { value: new THREE.Vector2(0, -1) }, uMoon: { value: 0 } };
  /* The way to the moon along the water. */
  const moonFar = Math.hypot(MOON[0], MOON[2]), mx = MOON[0] / moonFar, mz = MOON[2] / moonFar;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      varying vec2 vAt;
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
      varying vec2 vAt;
      #include <fog_pars_fragment>
      void main() {
        float r = length(vAt);
        float facing = max(dot(vAt / max(r, 1.0), uSunTo), 0.0);
        vec3 col = uSea + uGlow * (0.34 * pow(facing, 60.0) + 0.1 * pow(facing, 6.0)) * smoothstep(118.0, 160.0, r);
        float moonward = max(dot(vAt / max(r, 1.0), vec2(${f(mx)}, ${f(mz)})), 0.0);
        col += uMoon * vec3(0.2, 0.25, 0.37) * (pow(moonward, 90.0) + 0.16 * pow(moonward, 6.0)) * smoothstep(118.0, 150.0, r);
        vec2 s = vAt - vec2(${f(STAGE[0])}, ${f(STAGE[1])});
        float along = (dot(s, vec2(${f(ox)}, ${f(oz)})) - ${f(SHINE_OUT)}) / ${f(SHINE_LONG)}, across = dot(s, vec2(${f(-oz)}, ${f(ox)})) / ${f(SHINE_WIDE)};
        col += uShine * exp(-along * along - across * across);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), mat));
  return (look) => {
    uniforms.uSea.value.fromArray(look.sea);
    uniforms.uGlow.value.fromArray(look.glow);
    uniforms.uSunTo.value.fromArray(look.glowTo);
    uniforms.uMoon.value = look.moon;
    uniforms.uShine.value.fromArray(SHINE).multiplyScalar(look.shine);
    uPool.value.copy(POOL).multiplyScalar(look.shine);
  };
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
  /* The caves' bowls are dark, slopes steeper than 35 degrees are stone, the shore past the ring road is sand, and the rest is grass. */
  const normal = ground.attributes.normal, colors = new Float32Array(pos.count * 3), color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const hex = CAVES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 13) ? 0x2a2622
      : normal.getY(i) < STEEP ? 0x8e8a82 : Math.hypot(x, z) > SHORE ? 0x8a8370 : 0x5f6b4e;
    color.setHex(hex).toArray(colors, i * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const uPool = { value: new THREE.Color(0x000000) };
  scene.add(new THREE.Mesh(ground, takesPool(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), uPool)));
  const shade = buildSea(scene, uPool);

  /* The ring road and the lightning path, as flat bands just above the ground. */
  const bandMat = takesPool(new THREE.MeshLambertMaterial({ color: 0x8e8a82 }), uPool);
  /* The ring lies on the ground, so it follows the shore's gentle rise and fall. */
  const ringGeo = new THREE.RingGeometry(RING, SHORE, 160, 2).rotateX(-Math.PI / 2);
  const ringPos = ringGeo.attributes.position;
  for (let i = 0; i < ringPos.count; i++) ringPos.setY(i, height(ringPos.getX(i), ringPos.getZ(i)) + 0.2);
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(ringGeo, bandMat);
  scene.add(ring);
  const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)];
  /* The lightning path's segments merge into one mesh: one draw call instead of seventy-two. */
  const segments = [];
  for (let s = 0; s < BOLT.length - 1; s++) {
    const [ax, az] = BOLT[s], [bx, bz] = BOLT[s + 1];
    const steps = 24;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
      const geo = new THREE.BoxGeometry(3, 0.3, Math.hypot(x1 - x0, z1 - z0) + 0.4);
      geo.rotateY(Math.atan2(x1 - x0, z1 - z0));
      geo.translate((x0 + x1) / 2, height((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2);
      segments.push(geo);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(segments), bandMat));

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
  return { caves, shade };
}
