import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildFlora, chance, stoneGeometry, tuftGeometry } from "../../../public/world/flora.js";
import { CAVES, height, STAGE } from "../../../public/world/ground.js";
import { landColour, offTracks, RING, SHORE, surfaceOf } from "../../../public/world/island.js";
import { onCrowdGround } from "../../../public/world/seats.js";

type Where = (x: number, z: number) => boolean;
// The flora as island.js builds it, on the island's own ground, with a stand-in for the light the ground takes. `crowd` adds what
// island.js gives for the crowd's ground: how many fireflies fly over it, where it is, and where the turf is trodden; and the ground
// as a tier's mesh draws it.
function flora(tufts = 1500, stones = 120, flies = 90, crowd: { crowdFlies?: number; over?: Where; trodden?: Where; surface?: (x: number, z: number) => number } = {}) {
  const scene = new THREE.Scene();
  const options = { tufts, stones, flies, extent: RING - 1, beach: [SHORE + 0.8, SHORE + 3.6], colour: landColour,
    lit: (material: { onBeforeCompile: (shader: unknown) => void }) => { material.onBeforeCompile = () => {}; return material; },
    clear: (x: number, z: number) => offTracks(x, z, 1.3), ...crowd };
  // flora.js's own defaults for `over` and `trodden` take no arguments, and their types are read from them.
  const built = buildFlora(scene, options as Parameters<typeof buildFlora>[1]);
  return { scene, ...built };
}
// The crowd's ground as island.js gives it: fireflies over the ground itself, and no tuft within 4.5 m of it.
const crowdGround = { over: (x: number, z: number) => onCrowdGround(x, z), trodden: (x: number, z: number) => onCrowdGround(x, z, 4.5) };
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
  const triangles = geo.index.count / 3;
  const column = (name: string) => Array.from({ length: n }, (_, i) => geo.getAttribute(name).getX(i) as number);

  it("is a few triangles a metre tall at the most, standing on the ground, its blades' feet marked still and their tips free to sway", () => {
    // Its corners are shared where faces meet, so each tuft is a few dozen vertices to place.
    expect(triangles).toBeLessThanOrEqual(16);
    expect(n).toBeLessThanOrEqual(28);
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
    // Six corners, eight faces.
    expect(bloom.filter((b) => b === 1).length).toBe(6);
    // The bloom carries its own shading, palest at its top corner and deepest at its bottom one, and no two corners alike.
    const shades = Array.from({ length: n }, (_, i) => [position.getY(i), geo.getAttribute("color").getX(i) as number]).filter((_, i) => bloom[i] === 1);
    const byHeight = [...shades].sort((a, b) => a[0] - b[0]);
    expect(byHeight[0][1]).toBe(Math.min(...shades.map(([, shade]) => shade)));
    expect(byHeight[5][1]).toBe(Math.max(...shades.map(([, shade]) => shade)));
    expect(byHeight[5][1] / byHeight[0][1]).toBeGreaterThan(1.8);
    expect(new Set(shades.map(([, shade]) => shade.toFixed(3))).size).toBe(6);
    expect(geo.getAttribute("uv")).toBeUndefined();
  });
});

describe("the stone", () => {
  it("is closed, lower than it is wide, and no ball: its corners stand at different distances out", () => {
    const geo = stoneGeometry(), position = geo.getAttribute("position");
    const box = new THREE.Box3().setFromBufferAttribute(position), size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeLessThan(0.8 * Math.min(size.x, size.z));
    // Each corner is kept once and shared by the five or six faces that meet at it: 42 corners, 80 faces, and no face come apart.
    expect(position.count).toBe(42);
    expect(geo.index.count / 3).toBe(80);
    const uses = new Array(position.count).fill(0);
    for (let k = 0; k < geo.index.count; k++) uses[geo.index.getX(k)] += 1;
    expect(Math.min(...uses)).toBeGreaterThanOrEqual(5);
    expect(geo.getAttribute("normal")).toBeUndefined();
    const radii = Array.from({ length: position.count }, (_, i) => Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
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
      // Here the flora is given no surface of its own, so it stands on the island's own height; island.test.ts holds it to the mesh.
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

  it("takes each cell of its grid once, whatever the count asked, so no two tufts share a place and none is left out", () => {
    for (const asked of [330, 1500, 2890, 8200]) {
      const grown = places(flora(asked, 10, 0).tufts);
      expect(new Set(grown.map(({ x, z }) => `${x.toFixed(4)},${z.toFixed(4)}`)).size).toBe(grown.length);
      // About half the cells on the turf grow a tuft: a scan that skipped cells or took some many times over would grow far fewer.
      expect(grown.length).toBeGreaterThan(0.8 * asked);
      expect(grown.length).toBeLessThanOrEqual(asked);
    }
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

  it("fly over the tufts, spread across the island, above the grass", () => {
    expect(n).toBe(90);
    const tufts = places(built.tufts), lie = built.flies.geometry.getAttribute("aLie");
    const quarters = new Set<string>();
    for (let i = 0; i < n; i++) {
      const x = at.getX(i), y = at.getY(i), z = at.getZ(i);
      // Each over a tuft's own place. The middle of its wander is its 0.72 m of rise and fall and 0.4 m over the ground there at the
      // least, and no more than 1.2 m over that but for what the ground under its wander rises (island.test.ts runs the wander).
      expect(tufts.some((t) => Math.abs(t.x - x) < 1e-4 && Math.abs(t.z - z) < 1e-4)).toBe(true);
      expect(y - height(x, z)).toBeGreaterThanOrEqual(0.72 + 0.4 - 1e-4);
      expect(y - height(x, z)).toBeLessThanOrEqual(0.72 + 0.4 + 1.2 + 1.0);
      // The lie of the land it follows is the ground's own slope across its wander, east and south, and never steeper than 0.6.
      const east = (height(x + 1.6, z) - height(x - 1.6, z)) / 3.2, south = (height(x, z + 1.6) - height(x, z - 1.6)) / 3.2;
      expect(lie.getX(i)).toBeCloseTo(Math.max(-0.6, Math.min(0.6, east)), 5);
      expect(lie.getY(i)).toBeCloseTo(Math.max(-0.6, Math.min(0.6, south)), 5);
      quarters.add(`${Math.sign(x)},${Math.sign(z)}`);
    }
    expect(quarters.size).toBe(4);
  });

  it("are as large on the screen whatever the frame they are drawn into: their size is a share of its height, read as each frame is drawn", () => {
    const { uniforms, vertexShader } = built.flies.material;
    expect(vertexShader).toContain("gl_PointSize = uTall * clamp((0.58 + 0.36 * aSeed.x) / -seen.z, 0.0028, 0.022);");
    for (const tall of [1620, 450]) {
      built.flies.onBeforeRender({ getDrawingBufferSize: (size: { set(x: number, y: number): unknown }) => size.set(2 * tall, tall) });
      expect(uniforms.uTall.value).toBe(tall);
    }
  });

  it("are not drawn by day, come out as the night's glow rises, and add their light without hiding one another", () => {
    expect(built.flies.visible).toBe(false);
    // Under a twentieth of their glow, as at last light, they are too faint to see and are not drawn.
    built.glow(0.04);
    expect(built.flies.visible).toBe(false);
    built.glow(0.06);
    expect(built.flies.visible).toBe(true);
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

describe("the fireflies over the crowd", () => {
  const columns = (b: ReturnType<typeof flora>) => ["position", "aSeed", "aLie"].map((name) => b.flies.geometry.getAttribute(name));

  it("come after the others in the same points, which keep their places, seeds and lies to the last number", () => {
    const alone = flora(), both = flora(1500, 120, 90, { crowdFlies: 40, ...crowdGround, trodden: undefined });
    expect(both.scene.children.filter((o: { isPoints?: boolean }) => o.isPoints)).toEqual([both.flies]);
    expect(alone.flyCounts).toEqual({ ground: 90, crowd: 0 });
    expect(both.flyCounts).toEqual({ ground: 90, crowd: 40 });
    // A crowd firefly placed ahead of the others, or one more draw from their hash, would move every firefly on the island.
    for (const [k, column] of columns(alone).entries()) {
      const with40 = columns(both)[k];
      expect(column.count).toBe(90);
      expect(with40.count).toBe(130);
      expect([...with40.array.slice(0, column.array.length)]).toEqual([...column.array]);
    }
    // And the others stand where they stood before there were any over the crowd: three of them, as that code placed them.
    const [at, seed, lie] = columns(both);
    for (const [i, place, seeds, lies] of [
      [0, [0.8256, 32.341, 2.7266], [0.6583, 0.4073, 0.0019, 0.2211], [0.1146, -0.0583]],
      [44, [-23.8733, 28.4073, 5.9958], [0.6895, 0.4307, 0.684, 0.7656], [0.2664, 0.0525]],
      [89, [25.4084, 4.2972, -97.9703], [0.2182, 0.0258, 0.9356, 0.2821], [0.0099, 0.148]],
    ] as [number, number[], number[], number[]][]) {
      place.forEach((v, k) => expect(at.array[3 * i + k]).toBeCloseTo(v, 3));
      seeds.forEach((v, k) => expect(seed.array[4 * i + k]).toBeCloseTo(v, 3));
      lies.forEach((v, k) => expect(lie.array[2 * i + k]).toBeCloseTo(v, 3));
    }
  });

  it("fly over the crowd's ground and nowhere else, 5 m over it at the least through the whole of a wander, so none passes through a figure", () => {
    const both = flora(1500, 120, 90, { crowdFlies: 40, ...crowdGround }), [at, seed, lie] = columns(both);
    expect(both.flyCounts).toEqual({ ground: 90, crowd: 40 });
    // The crowd's are spread over its ground: on both sides of the stage's axis, and before and behind its middle rows.
    const sides = new Set<string>();
    let least = Infinity, most = -Infinity;
    for (let i = 0; i < at.count; i++) {
      const x0 = at.getX(i), z0 = at.getZ(i), ofCrowd = i >= 90;
      expect(onCrowdGround(x0, z0)).toBe(ofCrowd);
      // The others keep the 4.5 m off the crowd's ground that the tufts keep, so their wander of 1.6 m never crosses it.
      if (!ofCrowd) expect(onCrowdGround(x0, z0, 4.5)).toBe(false);
      else sides.add(`${Math.sign((x0 - STAGE[0]) * STAGE[1] - (z0 - STAGE[1]) * STAGE[0])},${Math.hypot(x0 - STAGE[0], z0 - STAGE[1]) > 35}`);
      const sx = seed.getX(i), sy = seed.getY(i), sz = seed.getZ(i), sw = seed.getW(i);
      // Ten minutes of the wander the shader writes (island.test.ts holds these sums to its text), four times a second.
      for (let t = 0; t < 600; t += 0.25) {
        const x = 1.6 * Math.sin(t * (0.21 + 0.2 * sx) + 6.2832 * sy), z = 1.6 * Math.cos(t * (0.17 + 0.2 * sy) + 6.2832 * sx);
        const y = 1.6 * 0.45 * Math.sin(t * (0.33 + 0.2 * sz) + 6.2832 * sw) + lie.getX(i) * x + lie.getY(i) * z;
        const over = at.getY(i) + y - height(x0 + x, z0 + z);
        // Whichever set it is of, a firefly over the crowd's ground is over the figures' heads and their raised arms, 4 m up.
        if (onCrowdGround(x0 + x, z0 + z)) expect(over).toBeGreaterThanOrEqual(5 - 1e-3);
        if (ofCrowd) { least = Math.min(least, over); most = Math.max(most, over); }
      }
    }
    expect(sides.size).toBe(4);
    // At the rim a crowd firefly wanders out past the crowd's ground, as high there as over it; and none climbs out of sight.
    expect(least).toBeGreaterThanOrEqual(5 - 1e-3);
    expect(most).toBeLessThanOrEqual(7.6);
  });

  it("would all find a place on each tier's ground as its mesh draws it, 5 to 7.6 m over it: the numbers a count of them starts from", () => {
    // island.js flies none (CROWD_FLIES). These are the counts that were tried, 2 to a line of a desktop's and a TV's grid and 1.15
    // of a phone's, with each tier's own tufts and fireflies.
    for (const [grid, thick, flies, crowdFlies] of [[80, 1, 1120, 160], [64, 0.8, 896, 128], [52, 0.6, 416, 60]]) {
      const surface = surfaceOf(grid), b = flora(Math.round(grid * grid * thick), 10, flies, { crowdFlies, ...crowdGround, surface }), [at, seed, lie] = columns(b);
      expect(b.flyCounts).toEqual({ ground: flies, crowd: crowdFlies });
      let least = Infinity, most = -Infinity;
      for (let i = flies; i < at.count; i++) {
        const sx = seed.getX(i), sy = seed.getY(i), sz = seed.getZ(i), sw = seed.getW(i);
        for (let t = 0; t < 600; t += 0.25) {
          const x = 1.6 * Math.sin(t * (0.21 + 0.2 * sx) + 6.2832 * sy), z = 1.6 * Math.cos(t * (0.17 + 0.2 * sy) + 6.2832 * sx);
          const y = 1.6 * 0.45 * Math.sin(t * (0.33 + 0.2 * sz) + 6.2832 * sw) + lie.getX(i) * x + lie.getY(i) * z;
          const over = at.getY(i) + y - surface(at.getX(i) + x, at.getZ(i) + z);
          least = Math.min(least, over);
          most = Math.max(most, over);
        }
      }
      // A lowered CROWD_UP, or a lift that carried one out of a visitor's sight among the crowd, fails here on the ground a tier draws.
      expect(least).toBeGreaterThanOrEqual(5 - 1e-3);
      expect(most).toBeLessThanOrEqual(7.6);
    }
  });

  it("go with half the others at the quality ladder's first rung, and come back with them", () => {
    for (const [crowdFlies, all] of [[0, 90], [40, 130]]) {
      const b = flora(1500, 120, 90, { crowdFlies, ...crowdGround });
      b.thin(true);
      expect(b.flies.geometry.drawRange.count).toBe(45);
      b.thin(false);
      expect(b.flies.geometry.drawRange.count).toBe(all);
    }
  });

  it("are as many as found a place and no more: a crowd's ground too small for them gives a shorter buffer, and none is left at the world's origin", () => {
    // A disc 3 m across among the middle rows: 40 are asked for, and the 3,200 places tried find it only a few times.
    const cx = STAGE[0] - 30 * (STAGE[0] / Math.hypot(STAGE[0], STAGE[1])), cz = STAGE[1] - 30 * (STAGE[1] / Math.hypot(STAGE[0], STAGE[1]));
    const small = flora(1500, 120, 90, { crowdFlies: 40, over: (x, z) => Math.hypot(x - cx, z - cz) < 1.5 });
    expect(small.flyCounts.ground).toBe(90);
    expect(small.flyCounts.crowd).toBeGreaterThan(0);
    expect(small.flyCounts.crowd).toBeLessThan(40);
    for (const column of columns(small)) expect(column.count).toBe(90 + small.flyCounts.crowd);
    const at = small.flies.geometry.getAttribute("position");
    for (let i = 90; i < at.count; i++) expect(Math.hypot(at.getX(i) - cx, at.getZ(i) - cz)).toBeLessThan(1.5);
    // With no crowd's ground at all there are none, and the buffer is the others' alone.
    const none = flora(1500, 120, 90, { crowdFlies: 40 });
    expect(none.flyCounts).toEqual({ ground: 90, crowd: 0 });
    expect(none.flies.geometry.getAttribute("position").count).toBe(90);
    small.thin(false);
    expect(small.flies.geometry.drawRange.count).toBe(90 + small.flyCounts.crowd);
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
    expect(shader.vertexShader).toContain("vec3 root = instanceMatrix[3].xyz;");
    // A bloom is its instance's colour times its own corner's shade.
    expect(shader.vertexShader).toContain("if (aBloom > 0.5) vColor.rgb = aFlower.rgb * color.rgb;");
    // One wind for every tuft, turned into each tuft's own frame, and as far as the tuft is tall: 0.058 of its height.
    expect(shader.vertexShader).toContain("float tall = length(instanceMatrix[1].xyz);");
    expect(shader.vertexShader).toContain("float sway = aTip * 0.0580 * tall * (sin(uWind * 0.6 + root.x * 0.35 + root.z * 0.27) + 0.4 * sin(uWind * 1.4 + root.z * 0.9));");
    expect(shader.vertexShader).toContain("transformed.xz += vec2(dot(wind, ax) / dot(ax, ax), dot(wind, az) / dot(az, az));");
    expect(shader.vertexShader).toContain("transformed *= shown;");
    expect(shader.fragmentShader).toContain("normal = normalize(vNormal);");
    wind(4.5);
    expect(shader.uniforms.uWind.value).toBe(4.5);
  });
});
