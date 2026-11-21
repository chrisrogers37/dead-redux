import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildFlora, chance, stoneGeometry, tuftGeometry } from "../../../public/world/flora.js";
import { CAVES, height, STAGE } from "../../../public/world/ground.js";
import { landColour, offTracks, RING, SHORE } from "../../../public/world/island.js";

// The flora as island.js builds it, on the island's own ground, with a stand-in for the light the ground takes.
function flora(tufts = 1500, stones = 120, flies = 90) {
  const scene = new THREE.Scene();
  const built = buildFlora(scene, { tufts, stones, flies, extent: RING - 1, beach: [SHORE + 0.8, SHORE + 3.6], colour: landColour,
    lit: (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; },
    clear: (x: number, z: number) => offTracks(x, z, 1.3) });
  return { scene, ...built };
}
// Where each instance of a mesh stands, with its scale.
function places(mesh: { count: number; getMatrixAt(i: number, m: unknown): void }) {
  const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, matrix);
    matrix.decompose(at, turn, size);
    return { x: at.x, y: at.y, z: at.z, size: size.clone() };
  });
}
const upright = (x: number, z: number) => 1 / Math.sqrt(1 + (height(x + 0.5, z) - height(x - 0.5, z)) ** 2 + (height(x, z + 0.5) - height(x, z - 0.5)) ** 2);

describe("chance", () => {
  it("gives the same number from 0 to 1 for the same place and salt, and spreads them evenly", () => {
    const all = Array.from({ length: 4000 }, (_, k) => chance(k % 71, Math.floor(k / 71), 5));
    expect(all).toEqual(Array.from({ length: 4000 }, (_, k) => chance(k % 71, Math.floor(k / 71), 5)));
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeLessThan(1);
    for (let band = 0; band < 4; band++) {
      const share = all.filter((v) => v >= band / 4 && v < (band + 1) / 4).length / all.length;
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.3);
    }
    expect(chance(3, 4, 5)).not.toBe(chance(3, 4, 6));
  });
});

describe("the tuft", () => {
  const geo = tuftGeometry(), position = geo.getAttribute("position"), n = position.count;
  const column = (name: string) => Array.from({ length: n }, (_, i) => geo.getAttribute(name).getX(i) as number);

  it("is a few triangles a metre tall at the most, standing on the ground, its blades' feet marked still and their tips free to sway", () => {
    expect(n / 3).toBeLessThanOrEqual(24);
    const ys = Array.from({ length: n }, (_, i) => position.getY(i));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1.15);
    const tip = column("aTip");
    ys.forEach((y, i) => { if (y === 0) expect(tip[i]).toBe(0); });
    expect(tip.filter((t) => t === 1).length).toBeGreaterThan(0);
  });

  it("carries one bloom, marked apart from the blades, which a tuft that is not in flower folds away", () => {
    const bloom = column("aBloom");
    expect([...new Set(bloom)].sort()).toEqual([0, 1]);
    expect(bloom.filter((b) => b === 1).length).toBe(24);
    expect(geo.getAttribute("uv")).toBeUndefined();
  });
});

describe("the stone", () => {
  it("is closed, lower than it is wide, and no ball: its corners stand at different distances out", () => {
    const geo = stoneGeometry(), position = geo.getAttribute("position");
    const box = new THREE.Box3().setFromBufferAttribute(position), size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeLessThan(0.8 * Math.min(size.x, size.z));
    // Corners that share a place before the squash still share one after it: no face has come apart from its neighbours.
    const seen = new Map<string, number>();
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => v.toFixed(5)).join(",");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(Math.min(...seen.values())).toBeGreaterThanOrEqual(5);
    const radii = [...seen.keys()].map((key) => Math.hypot(...key.split(",").map(Number)));
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.3);
  });
});

describe("buildFlora", () => {
  const built = flora(), tufts = places(built.tufts), stones = places(built.stones);

  it("draws all its tufts as one instanced mesh, all its stones as another and all its fireflies as one set of points: three draw calls at the most", () => {
    expect(built.scene.children).toHaveLength(3);
    expect(built.scene.children.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh)).toHaveLength(2);
    expect(built.scene.children.filter((o: { isPoints?: boolean }) => o.isPoints)).toEqual([built.flies]);
    expect(tufts.length).toBeGreaterThan(900);
    expect(tufts.length).toBeLessThanOrEqual(1500);
    expect(stones.length).toBeGreaterThan(60);
    expect(stones.length).toBeLessThanOrEqual(120);
  });

  it("grows its tufts on turf alone: on the ground, off both tracks, out of the caves, clear of the stage, and never on a steep slope", () => {
    for (const { x, y, z, size } of tufts) {
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(RING - 1);
      expect(offTracks(x, z, 1.3)).toBe(true);
      expect(Math.min(...CAVES.map(([cx, cz]) => Math.hypot(x - cx, z - cz)))).toBeGreaterThanOrEqual(13.5);
      expect(Math.hypot(x - STAGE[0], z - STAGE[1])).toBeGreaterThanOrEqual(15);
      expect(upright(x, z)).toBeGreaterThanOrEqual(0.9);
      expect(y).toBeCloseTo(height(x, z) - 0.03, 4);
      // No taller than a figure's knee: 0.8 m at the most.
      expect(size.y).toBeLessThanOrEqual(0.8 + 1e-6);
    }
  });

  it("lays its stones on scree, on the shore's sand and here and there on the turf, none on a track, in a cave or under water, none higher than a bear's shin", () => {
    let shore = 0;
    for (const { x, y, z, size } of stones) {
      const far = Math.hypot(x, z);
      expect(offTracks(x, z, 1.3)).toBe(true);
      expect(Math.min(...CAVES.map(([cx, cz]) => Math.hypot(x - cx, z - cz)))).toBeGreaterThanOrEqual(13.5);
      expect(height(x, z)).toBeGreaterThanOrEqual(0.25);
      expect(far <= RING - 1 || far >= SHORE + 0.8).toBe(true);
      expect(far).toBeLessThanOrEqual(SHORE + 3.6);
      if (far >= SHORE + 0.8) shore += 1;
      // A stone is 0.62 of a metre high in its own units before its scale: under 1.5 m at its largest.
      expect(0.62 * size.y).toBeLessThan(1.5);
      expect(y).toBeGreaterThanOrEqual(height(x, z));
    }
    expect(shore).toBeGreaterThan(0);
    expect(shore).toBeLessThan(stones.length);
  });

  it("builds the same land every time, so two stills of a world that holds still are the same", () => {
    const again = flora();
    expect(places(again.tufts)).toEqual(tufts);
    expect(places(again.stones)).toEqual(stones);
    expect([...again.tufts.geometry.getAttribute("aFlower").array]).toEqual([...built.tufts.geometry.getAttribute("aFlower").array]);
  });

  it("puts some tufts in flower and leaves most without", () => {
    const flower = built.tufts.geometry.getAttribute("aFlower");
    const inFlower = Array.from({ length: built.tufts.count }, (_, i) => flower.getW(i)).filter((w) => w === 1).length;
    expect(inFlower).toBeGreaterThan(0.03 * built.tufts.count);
    expect(inFlower).toBeLessThan(0.25 * built.tufts.count);
  });

  it("thins the tufts by half when asked, across the whole island, and gives them all back", () => {
    const all = built.tufts.count;
    built.thin(true);
    expect(built.tufts.count).toBe(Math.ceil(all / 2));
    // The half that is left still reaches every quarter of the island.
    const left = places(built.tufts);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) expect(left.filter(({ x, z }) => Math.sign(x) === sx && Math.sign(z) === sz).length).toBeGreaterThan(left.length / 12);
    built.thin(false);
    expect(built.tufts.count).toBe(all);
  });

  it("draws a handful of tufts once asked to be sparse, still one draw call's worth, whatever the ladder then asks", () => {
    const counted = flora();
    counted.sparse();
    expect(counted.tufts.count).toBe(64);
    counted.thin(false);
    expect(counted.tufts.count).toBe(64);
    counted.thin(true);
    expect(counted.tufts.count).toBe(64);
    expect(counted.tufts.count).toBeGreaterThan(0);
    // The stones and the fireflies are as they were.
    expect(counted.stones.count).toBe(built.stones.count);
  });
});

describe("the fireflies", () => {
  const built = flora(), at = built.flies.geometry.getAttribute("position"), n = at.count;

  it("fly over the tufts, spread across the island, a little above the grass", () => {
    expect(n).toBe(90);
    const tufts = places(built.tufts);
    const quarters = new Set<string>();
    for (let i = 0; i < n; i++) {
      const x = at.getX(i), y = at.getY(i), z = at.getZ(i);
      // Each over a tuft's own place, 0.6 to 2.1 m above the ground there.
      expect(tufts.some((t) => Math.abs(t.x - x) < 1e-4 && Math.abs(t.z - z) < 1e-4)).toBe(true);
      expect(y - height(x, z)).toBeGreaterThanOrEqual(0.6 - 1e-4);
      expect(y - height(x, z)).toBeLessThanOrEqual(2.1 + 1e-4);
      quarters.add(`${Math.sign(x)},${Math.sign(z)}`);
    }
    expect(quarters.size).toBe(4);
  });

  it("are not drawn by day, come out as the night's glow rises, and add their light without hiding one another", () => {
    expect(built.flies.visible).toBe(false);
    built.glow(0.005);
    expect(built.flies.visible).toBe(false);
    built.glow(0.6);
    expect(built.flies.visible).toBe(true);
    expect(built.flies.material.uniforms.uGlow.value).toBe(0.6);
    expect(built.flies.material.blending).toBe(THREE.AdditiveBlending);
    expect(built.flies.material.depthWrite).toBe(false);
    built.glow(0);
    expect(built.flies.visible).toBe(false);
  });

  it("move on the wind's own time, so they hold still when it does", () => {
    built.wind(12.25);
    expect(built.flies.material.uniforms.uTime.value).toBe(12.25);
    built.wind(12.25);
    expect(built.flies.material.uniforms.uTime.value).toBe(12.25);
  });

  it("light up no faster than once in two and a half seconds each: the slowest swell and fade a visitor can count", () => {
    // The shader's wave turns once every mix(5.2, 2.5, seed) seconds, and its lit part is the upper half of that turn.
    const { vertexShader } = built.flies.material;
    expect(vertexShader).toContain("sin(uTime * 6.2832 / mix(5.2000, 2.5000, aSeed.w)");
    expect(vertexShader).toContain("wave * wave * wave");
  });

  it("are halved with the tufts on the quality ladder's rung, and come back whole", () => {
    built.thin(true);
    expect(built.flies.geometry.drawRange.count).toBe(45);
    built.thin(false);
    expect(built.flies.geometry.drawRange.count).toBe(90);
  });
});

describe("the tufts' shader", () => {
  it("edits three's Lambert shader as the pinned version writes it: the wind and the fade in the vertex shader, both faces lit alike in the fragment shader", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    for (const anchor of ["#include <common>", "#include <beginnormal_vertex>", "#include <color_vertex>", "#include <begin_vertex>"]) expect(vertexShader.split(anchor)).toHaveLength(2);
    expect(fragmentShader.split("#include <normal_fragment_begin>")).toHaveLength(2);
    const { tufts, wind } = flora(50, 5);
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader, fragmentShader };
    tufts.material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain("uniform float uWind;");
    expect(shader.vertexShader).toContain("vec3 objectNormal = vec3(0.0, 1.0, 0.0);");
    expect(shader.vertexShader).toContain("transformed *= shown;");
    expect(shader.fragmentShader).toContain("normal = normalize(vNormal);");
    wind(4.5);
    expect(shader.uniforms.uWind.value).toBe(4.5);
  });
});
