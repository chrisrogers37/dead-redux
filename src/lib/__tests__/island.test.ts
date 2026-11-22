import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { BOLT, BOLT_HALF, buildIsland, FEATHER, grained, landColour, offTracks, pixelAngle, RING, SHORE, surfaceOf, takesPool, TRACK, tracksAt } from "../../../public/world/island.js";
import { CAVES, height } from "../../../public/world/ground.js";
import { lookAt, newLook } from "../../../public/world/night.js";

describe("takesPool", () => {
  it("adds the stage's glow to three's Lambert shader as the pinned version writes it: its place from the vertex shader, its light in the fragment shader", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    // Each line the edit hangs on is in the shader once. A three upgrade that renames one would leave the ground without its glow.
    for (const [source, anchor] of [[vertexShader, "#include <common>"], [vertexShader, "#include <project_vertex>"], [fragmentShader, "#include <common>"], [fragmentShader, "#include <lights_fragment_end>"]]) {
      expect(source.split(anchor)).toHaveLength(2);
    }
    const uPool = { value: new THREE.Color(0xff7a30) };
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    takesPool(new THREE.MeshLambertMaterial(), uPool).onBeforeCompile(shader);
    expect(shader.uniforms.uPool).toBe(uPool);
    expect(shader.vertexShader).toContain("varying vec3 vPoolAt;");
    expect(shader.vertexShader).toContain("vPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    // An instanced mesh's point stands where its instance puts it: without this every tuft and stone took the glow as if it stood
    // at the island's middle, out of the glow's reach.
    expect(shader.vertexShader).toMatch(/#ifdef USE_INSTANCING\s+vPoolAt = \(modelMatrix \* instanceMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;\s+#else/);
    expect(shader.fragmentShader).toContain("uniform vec3 uPool;");
    expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
  });
});

describe("grained", () => {
  it("adds the land's grain to three's Lambert shader as the pinned version writes it, on top of the stage's glow, and its relief only where asked", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    for (const anchor of ["#include <color_fragment>", "#include <normal_fragment_begin>"]) expect(fragmentShader.split(anchor)).toHaveLength(2);
    const compiled = (relief: boolean) => {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
      grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), relief).onBeforeCompile(shader);
      return shader;
    };
    const flat = compiled(false), tilted = compiled(true);
    for (const shader of [flat, tilted]) {
      expect(shader.uniforms.uPool).toBeDefined();
      expect(shader.fragmentShader).toContain("float grain(vec2 p)");
      expect(shader.fragmentShader).toContain("diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - 0.5)");
      // Each size of grain goes as its cells near what a pixel takes in of the ground, so none dithers where the land is seen
      // edge-on: in full to a quarter of a cell a pixel, gone by six tenths.
      expect(shader.fragmentShader).toContain("uniform float uPixel;");
      expect(shader.fragmentShader).toContain("float covers = length(vViewPosition) * uPixel / max(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.02);");
      // And never less than the drawn face's own reach, read from pixel to pixel, where the land bends sharply.
      expect(shader.fragmentShader).toContain("covers = max(covers, sqrt(max(dot(acrossGround, acrossGround), dot(downGround, downGround))));");
      // Left alone, a pixel spans what one does on a desktop's frame: 900 px tall, a 60 degree view.
      expect((shader.uniforms.uPixel as { value: number }).value).toBeCloseTo((2 * Math.tan(Math.PI / 6)) / 900, 9);
      expect(shader.fragmentShader).toContain("float coarseShown = 1.0 - smoothstep(0.2500, 0.6000, covers * 0.9000);");
      expect(shader.fragmentShader).toContain("* (1.0 - smoothstep(0.2500, 0.6000, covers * 5.3000));");
      expect(shader.fragmentShader).toContain("if (coarseShown > 0.0) tussocks = mix(0.5, grain(vPoolAt.xz * 0.9000 + 17.0), coarseShown);");
      expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool");
    }
    // The relief leans the normal by the grain's own change from pixel to pixel, and takes no more of the grain to do it.
    expect(tilted.fragmentShader).toContain("normal = normalize(max(abs(det), 1e-12) * normal - grad);");
    expect(flat.fragmentShader).not.toContain("dFdx(high)");
    expect(tilted.fragmentShader.split("grain(vPoolAt.xz").length).toBe(flat.fragmentShader.split("grain(vPoolAt.xz").length);
  });
});

describe("the land's colour", () => {
  const hex = (x: number, y: number, z: number, ny: number) => landColour(x, y, z, ny, new THREE.Color());
  const luma = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  it("is turf on the hill's gentle ground: green before it is anything else", () => {
    const turf = hex(20, height(20, -40), -40, 0.98);
    expect(turf.g).toBeGreaterThan(turf.r);
    expect(turf.g).toBeGreaterThan(turf.b);
  });

  it("turns to bare stone as the slope steepens past 28 degrees, all stone by 42, and to dark in the caves' bowls", () => {
    const turf = hex(20, 12, -40, Math.cos((20 * Math.PI) / 180)), stone = hex(20, 12, -40, Math.cos((45 * Math.PI) / 180));
    const between = hex(20, 12, -40, Math.cos((35 * Math.PI) / 180));
    // Stone is grey: its green stands little over its blue, where turf's stands well over.
    expect(stone.g - stone.b).toBeLessThan(0.15 * stone.g);
    expect(turf.g - turf.b).toBeGreaterThan(0.25 * turf.g);
    expect(between.b).toBeGreaterThan(turf.b);
    expect(between.b).toBeLessThan(stone.b);
    const [cx, cz] = CAVES[0];
    expect(luma(hex(cx, height(cx, cz), cz, 1))).toBeLessThan(0.5 * luma(turf));
  });

  it("is sand past the ring road, paler than the turf above it and darker where the sea wets it", () => {
    const dry = hex(SHORE + 3, 2, 0, 1), wet = hex(SHORE + 3, 0.1, 0, 1), turf = hex(RING - 12, 2.5, 0, 1);
    expect(luma(dry)).toBeGreaterThan(luma(turf));
    expect(luma(wet)).toBeLessThan(luma(dry));
  });
});

describe("the ground as its mesh draws it", () => {
  it("is the island's own height at every point of the mesh's grid, and flat across each half of a cell between them", () => {
    const grid = 52, cell = 260 / grid, surface = surfaceOf(grid);
    for (const [ix, iz] of [[0, 0], [10, 31], [26, 26], [51, 7]]) {
      const x = ix * cell - 130, z = iz * cell - 130;
      expect(surface(x, z)).toBeCloseTo(height(x, z), 9);
      // Halfway along the cell's diagonal, and at the middle of each of its two triangles.
      const a = height(x, z), b = height(x, z + cell), c = height(x + cell, z + cell), d = height(x + cell, z);
      expect(surface(x + cell / 2, z + cell / 2)).toBeCloseTo((b + d) / 2, 9);
      expect(surface(x + cell / 3, z + cell / 3)).toBeCloseTo((a + b + d) / 3, 9);
      expect(surface(x + (2 * cell) / 3, z + (2 * cell) / 3)).toBeCloseTo((b + c + d) / 3, 9);
    }
  });

  it("matches the ground buildIsland builds, triangle by triangle", () => {
    const scene = new THREE.Scene(), grid = 20;
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, grid, false);
    const ground = scene.children.find((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } } }) => o.isMesh && o.geometry.attributes.position.count === (grid + 1) ** 2);
    const position = ground.geometry.attributes.position, index = ground.geometry.index, surface = surfaceOf(grid);
    const corner = new THREE.Vector3(), middle = new THREE.Vector3();
    for (let t = 0; t < index.count; t += 3) {
      middle.set(0, 0, 0);
      for (let k = 0; k < 3; k++) middle.addScaledVector(corner.fromBufferAttribute(position, index.getX(t + k)), 1 / 3);
      expect(surface(middle.x, middle.z)).toBeCloseTo(middle.y, 4);
    }
  });
});

describe("the tracks", () => {
  const round = (RING + SHORE) / 2, half = (SHORE - RING) / 2;

  it("are packed earth on the ring road and along the lightning path, land beyond them, and between the two across FEATHER m at each edge", () => {
    expect(tracksAt(round, 0)).toBe(1);
    expect(tracksAt(0, -(RING + 0.5))).toBe(1);
    expect(tracksAt(RING - FEATHER - 0.1, 0)).toBe(0);
    expect(tracksAt(SHORE + FEATHER + 0.1, 0)).toBe(0);
    const edge = tracksAt(RING - FEATHER / 2, 0);
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(0.7);
    // Across the lightning path from the middle of its second stroke.
    const [ax, az] = BOLT[1], [bx, bz] = BOLT[2], mx = (ax + bx) / 2, mz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    expect(tracksAt(mx, mz)).toBe(1);
    expect(tracksAt(mx + nx * (BOLT_HALF - 0.1), mz + nz * (BOLT_HALF - 0.1))).toBe(1);
    expect(tracksAt(mx + nx * (BOLT_HALF + FEATHER + 0.1), mz + nz * (BOLT_HALF + FEATHER + 0.1))).toBe(0);
    // Every corner of the lightning is on it, and the hill's open turf is not.
    for (const [x, z] of BOLT) expect(tracksAt(x, z)).toBe(1);
    expect(tracksAt(40, 40)).toBe(0);
    expect(half).toBe(3);
  });

  it("are drawn in the ground's own shader with the same numbers, so they lie on the ground wherever it goes and cost no mesh", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, true).onBeforeCompile(shader);
    const earth = new THREE.Color(TRACK);
    expect(shader.fragmentShader).toContain(`float ring = 1.0 - smoothstep(${half.toFixed(4)}, ${(half + FEATHER).toFixed(4)}, abs(length(p) - ${round.toFixed(4)}));`);
    expect(shader.fragmentShader).toContain(`return max(ring, 1.0 - smoothstep(${BOLT_HALF.toFixed(4)}, ${(BOLT_HALF + FEATHER).toFixed(4)}, bolt));`);
    for (const [x, z] of BOLT) expect(shader.fragmentShader).toContain(`vec2(${x.toFixed(4)}, ${z.toFixed(4)})`);
    expect(shader.fragmentShader).toContain(`diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${earth.r.toFixed(4)}, ${earth.g.toFixed(4)}, ${earth.b.toFixed(4)}), tracks(vPoolAt.xz));`);
    // A material that is not the ground's wears the grain without them.
    const plain = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false).onBeforeCompile(plain);
    expect(plain.fragmentShader).not.toContain("tracks(");
  });

  it("are reckoned in the shader as tracksAt reckons them: the whole of its GLSL is as written here, and the same sums in JS agree with tracksAt all over the island", () => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, true).onBeforeCompile(shader);
    const n = (v: number) => v.toFixed(4), v2 = ([x, z]: number[]) => `vec2(${n(x)}, ${n(z)})`, squash = (text: string) => text.replace(/\s+/g, " ");
    // The shader's two functions, whole. A change to either fails here, and is then made to the sums below as well.
    expect(squash(shader.fragmentShader)).toContain(squash(`
      float fromLine(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return distance(p, a + clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0) * ab); }
      float tracks(vec2 p) {
        float ring = 1.0 - smoothstep(${n(half)}, ${n(half + FEATHER)}, abs(length(p) - ${n(round)}));
        float bolt = min(min(fromLine(p, ${v2(BOLT[0])}, ${v2(BOLT[1])}), fromLine(p, ${v2(BOLT[1])}, ${v2(BOLT[2])})), fromLine(p, ${v2(BOLT[2])}, ${v2(BOLT[3])}));
        return max(ring, 1.0 - smoothstep(${n(BOLT_HALF)}, ${n(BOLT_HALF + FEATHER)}, bolt));
      }`));
    // The same, line for line, with the numbers as the shader's text rounds them.
    const r = (v: number) => Number(n(v)), clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
    const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const fromLine = (px: number, pz: number, [ax, az]: number[], [bx, bz]: number[]) => {
      const abx = r(bx) - r(ax), abz = r(bz) - r(az), t = clamp(((px - r(ax)) * abx + (pz - r(az)) * abz) / Math.max(abx * abx + abz * abz, 1e-6), 0, 1);
      return Math.hypot(px - r(ax) - t * abx, pz - r(az) - t * abz);
    };
    const tracks = (px: number, pz: number) => {
      const ring = 1 - smoothstep(r(half), r(half + FEATHER), Math.abs(Math.hypot(px, pz) - r(round)));
      const bolt = Math.min(Math.min(fromLine(px, pz, BOLT[0], BOLT[1]), fromLine(px, pz, BOLT[1], BOLT[2])), fromLine(px, pz, BOLT[2], BOLT[3]));
      return Math.max(ring, 1 - smoothstep(r(BOLT_HALF), r(BOLT_HALF + FEATHER), bolt));
    };
    const points: number[][] = [];
    // All over the island, every 1.3 m; round both edges of the ring road; and about each corner of the lightning, its ends too.
    for (let x = -125; x <= 125; x += 1.3) for (let z = -125; z <= 125; z += 1.3) points.push([x, z]);
    for (let k = 0; k < 720; k++) for (const far of [RING - FEATHER, RING - FEATHER / 2, RING, SHORE, SHORE + FEATHER / 2, SHORE + FEATHER]) points.push([far * Math.cos(k / 114.6), far * Math.sin(k / 114.6)]);
    for (const [x, z] of BOLT) for (let k = 0; k < 360; k++) for (const far of [0.3, BOLT_HALF, BOLT_HALF + FEATHER / 2, BOLT_HALF + FEATHER]) points.push([x + far * Math.cos(k / 57.3), z + far * Math.sin(k / 57.3)]);
    let onTrack = 0, between = 0;
    for (const [x, z] of points) {
      const here = tracksAt(x, z);
      expect(Math.abs(tracks(x, z) - here)).toBeLessThan(1e-4);
      if (here === 1) onTrack += 1;
      else if (here > 0) between += 1;
    }
    // The points do try the tracks, their edges and the land.
    expect(onTrack).toBeGreaterThan(2000);
    expect(between).toBeGreaterThan(2000);
    expect(points.length - onTrack - between).toBeGreaterThan(20000);
  });
});

describe("the sea", () => {
  it("is one mesh on its own shader, which takes the fog, and draws each look at the time it is given", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const { shade } = buildIsland(scene, 20, true);
    const seas = scene.children.filter((o: { isMesh?: boolean; material?: { isShaderMaterial?: boolean } }) => o.isMesh && o.material?.isShaderMaterial);
    expect(seas).toHaveLength(1);
    const { material } = seas[0];
    expect(material.fog).toBe(true);
    const look = lookAt(1, newLook());
    shade(look, 12.5);
    expect(material.uniforms.uTide.value).toBe(12.5);
    expect(material.uniforms.uSea.value.toArray()).toEqual([...look.sea]);
    // A caller that gives no time gets still water.
    shade(look);
    expect(material.uniforms.uTide.value).toBe(0);
  });

  it("laps the island's own shore: its depth is written from the ground's slope past the ring road", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, 20, true);
    const { fragmentShader } = scene.children.find((o: { isMesh?: boolean; material?: { isShaderMaterial?: boolean } }) => o.isMesh && o.material?.isShaderMaterial).material;
    // ground.js's slope past 118 m: 2.5 + 0.6 sin(0.3 x) cos(0.27 z) - 0.55 (d - 118). The shader's depth is its negative.
    expect(fragmentShader).toContain("float depth = (r - 118.0) * 0.55 - 2.5 - 0.6 * sin(vAt.x * 0.3) * cos(vAt.y * 0.27)");
    for (const [x, z] of [[121, 0], [0, -124], [90, 85]]) {
      const d = Math.hypot(x, z);
      expect(-((d - 118) * 0.55 - 2.5 - 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27))).toBeCloseTo(height(x, z), 9);
    }
  });
});

describe("buildIsland", () => {
  it("draws the ground, the sea and what stands on the land, with a pool for each cave and no mesh for the tracks", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const { caves } = buildIsland(scene, 20, true);
    const meshes = scene.children.filter((o: { isMesh?: boolean }) => o.isMesh);
    expect(caves).toHaveLength(2);
    // The ground, with its tracks in its own shader, the sea, the tufts and the stones (flora.js), and the two caves' pools, which stay
    // hidden until their songs.
    expect(meshes).toHaveLength(6);
    expect(meshes.filter((o: { visible: boolean }) => o.visible)).toHaveLength(4);
    expect(meshes.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh)).toHaveLength(2);
  });
  it("tells the ground's grain what a pixel of the frame takes in, by the camera's view and the frame's height, as each frame is drawn", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, 20, false);
    const ground = scene.children.find((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } } }) => o.isMesh && o.geometry.attributes.position.count === 21 ** 2);
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    ground.material.onBeforeCompile(shader);
    const frame = (fov: number, tall: number) => { ground.onBeforeRender({ getDrawingBufferSize: (size: { set(x: number, y: number): unknown }) => size.set(2 * tall, tall) }, scene, { fov }); return shader.uniforms.uPixel.value; };
    // A desktop's frame; the same at half the render scale, where a pixel takes in twice the ground; and a phone's wider view.
    expect(frame(60, 900)).toBeCloseTo(0.001283, 6);
    expect(frame(60, 450)).toBeCloseTo(2 * 0.001283, 6);
    expect(frame(75, 717)).toBeCloseTo(pixelAngle({ fov: 75 }, 717), 12);
    expect(frame(75, 717)).toBeCloseTo((2 * Math.tan((75 * Math.PI) / 360)) / 717, 12);
    // From 3 m up, a desktop's pixel at 22 m takes in 0.21 m of level ground, more than a blade's cell of 0.19 m: the blades are gone
    // there (0.6 of a cell is their end), where by distance alone they were drawn in full.
    const covers = (far: number, up: number, pixel: number) => (Math.hypot(far, up) * pixel) / (up / Math.hypot(far, up));
    expect(covers(22, 3, frame(60, 900)) * 5.3).toBeGreaterThan(0.6);
    expect(covers(5, 3, frame(60, 900)) * 5.3).toBeLessThan(0.25);
  });
});

describe("offTracks", () => {
  it("is false on the ring road and the lightning path and within the room asked of either, and true on the turf between", () => {
    expect(offTracks(RING + 3, 0, 1)).toBe(false);
    expect(offTracks(0, RING - 0.5, 1)).toBe(false);
    expect(offTracks(RING - 1.5, 0, 1)).toBe(true);
    const [ax, az] = BOLT[1], [bx, bz] = BOLT[2], mx = (ax + bx) / 2, mz = (az + bz) / 2;
    expect(offTracks(mx, mz, 1)).toBe(false);
    // Across the path from its middle: just inside its reach and the room, and just past them.
    const len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    expect(offTracks(mx + nx * (BOLT_HALF + 0.9), mz + nz * (BOLT_HALF + 0.9), 1)).toBe(false);
    expect(offTracks(mx + nx * (BOLT_HALF + 1.1), mz + nz * (BOLT_HALF + 1.1), 1)).toBe(true);
    expect(offTracks(BOLT[0][0], BOLT[0][1], 0)).toBe(false);
  });
});

describe("what stands on the land", () => {
  it("stands on the ground as its mesh draws it, on every tier's grid, off the tracks and off the setlist's path", () => {
    for (const [grid, phone] of [[80, false], [64, false], [52, true]] as const) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const loop = Array.from({ length: 60 }, (_, k) => [-40 + k * 1.5, 30]);
      const { flora } = buildIsland(scene, grid, phone, loop);
      const surface = surfaceOf(grid), matrix = new THREE.Matrix4(), at = new THREE.Vector3();
      expect(flora.tufts.count).toBeGreaterThan(1000);
      let nearest = Infinity;
      for (let i = 0; i < flora.tufts.count; i++) {
        flora.tufts.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        // A tuft's root is a few centimetres under the drawn ground, never over it.
        expect(at.y - surface(at.x, at.z)).toBeCloseTo(-0.03, 4);
        expect(tracksAt(at.x, at.z)).toBe(0);
        const fromLoop = Math.min(...loop.map(([x, z]) => Math.hypot(at.x - x, at.z - z)));
        expect(fromLoop).toBeGreaterThanOrEqual(2.2);
        nearest = Math.min(nearest, fromLoop);
      }
      // The path clears its own 2.2 m and no more: a tuft stands within a metre of that.
      expect(nearest).toBeLessThan(3.2);
      for (let i = 0; i < flora.stones.count; i++) {
        flora.stones.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        expect(at.y - surface(at.x, at.z)).toBeGreaterThanOrEqual(0);
        expect(at.y - surface(at.x, at.z)).toBeLessThan(0.2);
      }
    }
  });

  it("keeps every firefly over the drawn ground through the whole of its wander, on every tier's grid, so none sinks into a hillside and goes out", () => {
    for (const [grid, phone, count] of [[80, false, 1120], [64, false, 896], [52, true, 416]] as const) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const { flora } = buildIsland(scene, grid, phone);
      const surface = surfaceOf(grid), geo = flora.flies.geometry, at = geo.getAttribute("position"), seed = geo.getAttribute("aSeed"), lie = geo.getAttribute("aLie");
      expect(at.count).toBe(count);
      // The wander as the shader writes it, which the sums below repeat.
      const { vertexShader } = flora.flies.material;
      expect(vertexShader).toContain("vec3 roam = 1.6000 * vec3(sin(uTime * (0.21 + 0.2 * aSeed.x) + 6.2832 * aSeed.y), 0.4500 * sin(uTime * (0.33 + 0.2 * aSeed.z) + 6.2832 * aSeed.w),");
      expect(vertexShader).toContain("cos(uTime * (0.17 + 0.2 * aSeed.y) + 6.2832 * aSeed.x));");
      expect(vertexShader).toContain("roam.y += dot(aLie, roam.xz);");
      expect(vertexShader).toContain("vec4 seen = modelViewMatrix * vec4(position + roam, 1.0);");
      let least = Infinity, most = -Infinity;
      for (let i = 0; i < at.count; i++) {
        const sx = seed.getX(i), sy = seed.getY(i), sz = seed.getZ(i), sw = seed.getW(i);
        // Ten minutes of it, four times a second.
        for (let t = 0; t < 600; t += 0.25) {
          const x = 1.6 * Math.sin(t * (0.21 + 0.2 * sx) + 6.2832 * sy), z = 1.6 * Math.cos(t * (0.17 + 0.2 * sy) + 6.2832 * sx);
          const y = 1.6 * 0.45 * Math.sin(t * (0.33 + 0.2 * sz) + 6.2832 * sw) + lie.getX(i) * x + lie.getY(i) * z;
          const over = at.getY(i) + y - surface(at.getX(i) + x, at.getZ(i) + z);
          least = Math.min(least, over);
          most = Math.max(most, over);
        }
      }
      // Never nearer the ground than 0.3 m (it is built to clear 0.4 m at the places it reads), and never higher than a tree's lower boughs.
      expect(least).toBeGreaterThan(0.3);
      expect(most).toBeLessThan(4);
    }
  });
});
