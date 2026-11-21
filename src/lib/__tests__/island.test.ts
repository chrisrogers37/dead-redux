import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { BOLT, BOLT_HALF, buildIsland, FEATHER, grained, landColour, offTracks, RING, SHORE, surfaceOf, takesPool, TRACK, track } from "../../../public/world/island.js";
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
      expect(shader.fragmentShader).toContain("diffuseColor.rgb *= 0.8 + 0.3 * grain(vPoolAt.xz");
      expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool");
    }
    expect(tilted.fragmentShader).toContain("normal = normalize(normal + ");
    expect(flat.fragmentShader).not.toContain("normal = normalize(normal + ");
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

describe("a track", () => {
  const flat = () => 0;
  const rows = (geo: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } }) => {
    const p = geo.attributes.position;
    return Array.from({ length: p.count / 4 }, (_, r) => [0, 1, 2, 3].map((e) => [p.getX(r * 4 + e), p.getY(r * 4 + e), p.getZ(r * 4 + e)]));
  };

  it("runs `half` m to either side of its line in packed earth, a hand above the ground, and gives way to the land's own colour over FEATHER m at each edge, which lies almost on it", () => {
    const geo = track([[0, -20], [0, 20]], false, 1.5, flat), colour = geo.attributes.color, earth = new THREE.Color(TRACK), land = new THREE.Color();
    for (const [r, row] of rows(geo).entries()) {
      expect(row.map(([x]) => Math.abs(x))).toEqual([1.5 + FEATHER, 1.5, 1.5, 1.5 + FEATHER].map((v) => expect.closeTo(v, 5)));
      expect(row.map(([, y]) => y)).toEqual([0.02, 0.1, 0.1, 0.02].map((v) => expect.closeTo(v, 5)));
      for (const e of [1, 2]) expect(new THREE.Color().fromBufferAttribute(colour, r * 4 + e).getHex()).toBe(earth.getHex());
      for (const e of [0, 3]) {
        const [x, , z] = row[e];
        expect(new THREE.Color().fromBufferAttribute(colour, r * 4 + e).getHex()).toBe(landColour(x, 0, z, 1 / Math.sqrt(1 + (height(x + 0.5, z) - height(x - 0.5, z)) ** 2 + (height(x, z + 0.5) - height(x, z - 0.5)) ** 2), land).getHex());
      }
    }
    // A point every 1.2 m or less along it, the last at its end.
    const along = rows(geo).map((row) => (row[1][2] + row[2][2]) / 2);
    expect(along[0]).toBeCloseTo(-20, 5);
    expect(along.at(-1)).toBeCloseTo(20, 5);
    for (let k = 1; k < along.length; k++) expect(along[k] - along[k - 1]).toBeLessThanOrEqual(1.2 + 1e-5);
  });

  it("lies on the ground it is given", () => {
    const surface = surfaceOf(52), geo = track([[-40, 10], [30, -25]], false, 1.5, surface);
    for (const row of rows(geo)) row.forEach(([x, y, z], e) => expect(y - surface(x, z)).toBeCloseTo(e === 0 || e === 3 ? 0.02 : 0.1, 4));
  });

  it("comes to a point where it turns sharply, its width kept along both sides of the corner, and never more than three times as far out", () => {
    // A right angle: the corner's outer points stand a root of two further out.
    const corner = rows(track([[-10, 0], [0, 0], [0, 10]], false, 1, flat)).find((row) => Math.abs((row[1][0] + row[2][0]) / 2) < 1e-5 && Math.abs((row[1][2] + row[2][2]) / 2) < 1e-5)!;
    expect(Math.hypot(corner[1][0], corner[1][2])).toBeCloseTo(Math.SQRT2, 5);
    // A turn almost back on itself: the mitre stops at three times the track's own reach.
    const hairpin = rows(track([[-10, 0], [0, 0], [-10, 0.5]], false, 1, flat));
    expect(Math.max(...hairpin.flat().map(([x, , z]) => Math.hypot(Math.max(0, x), z)))).toBeLessThanOrEqual(3 * (1 + FEATHER) + 1e-5);
  });

  it("closes a ring with no gap: its last row lies on its first", () => {
    const ring = Array.from({ length: 48 }, (_, k) => [50 * Math.cos((k / 48) * 2 * Math.PI), 50 * Math.sin((k / 48) * 2 * Math.PI)]);
    const all = rows(track(ring, true, 3, flat));
    all[0].forEach((point, e) => point.forEach((v, k) => expect(all.at(-1)![e][k]).toBeCloseTo(v, 5)));
    // Its core runs 3 m to either side of the ring's 50 m all the way round, to within the chords the ring is drawn in.
    for (const row of all) {
      const [inner, outer] = [row[1], row[2]].map(([x, , z]) => Math.hypot(x, z)).sort((a, b) => a - b);
      expect(Math.abs(inner - 47)).toBeLessThan(0.15);
      expect(Math.abs(outer - 53)).toBeLessThan(0.15);
    }
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
  it("draws the ground, the sea, and the ring road and the lightning path as one mesh between them, with a pool for each cave", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const { caves } = buildIsland(scene, 20, true);
    const meshes = scene.children.filter((o: { isMesh?: boolean }) => o.isMesh);
    expect(caves).toHaveLength(2);
    // The ground, the sea, the tracks, the tufts and the stones (flora.js), and the two caves' pools, which stay hidden until their songs.
    expect(meshes).toHaveLength(7);
    expect(meshes.filter((o: { visible: boolean }) => o.visible)).toHaveLength(5);
    expect(meshes.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh)).toHaveLength(2);
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
