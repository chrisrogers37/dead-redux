import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildBear, buildBears, drawLegs, furMaterial, stride } from "../../../public/world/bears.js";
import { BODY_REACH } from "../../../public/world/collide.js";

// Every vertex of a bear's meshes, the hidden limbs among them, in the bear's own frame, as [x, y, z].
function vertices(bear: ReturnType<typeof buildBear>): number[][] {
  bear.g.updateMatrixWorld(true);
  const inverse = bear.g.matrixWorld.clone().invert(), out: number[][] = [], v = new THREE.Vector3();
  bear.g.traverse((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } }; matrixWorld: unknown }) => {
    if (!o.isMesh) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) out.push(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse).toArray());
  });
  return out;
}
// The swings a bear's limbs take: at rest, the five's widest to the music (0.65, audio.js) and the visitor's at a run (0.7, avatar.js).
// and a tenth of a radian, where the forward paw's toe dips deepest.
const SWINGS = [0, 0.1, -0.1, 0.3, -0.3, 0.5, -0.5, 0.65, -0.65, 0.7, -0.7];

describe("buildBear", () => {
  it("stands inside the sizes the world keeps round a bear at every swing of its limbs: 4.85 m tall, 1.5 m to either side, its nose within 2.4 m, and nothing past the reach the crowd parts round", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    for (const swing of SWINGS) {
      stride(bear, swing);
      const all = vertices(bear);
      const most = (f: (v: number[]) => number) => Math.max(...all.map(f));
      expect(most(([, y]) => y)).toBeLessThanOrEqual(4.85);
      // collide.js: a bear's flank stands within 1.5 m of its centre and its snout's tip 2.4 m ahead of it, both inside BODY_REACH.
      expect(most(([x]) => Math.abs(x))).toBeLessThanOrEqual(1.5);
      expect(most(([, , z]) => z)).toBeLessThanOrEqual(2.4);
      expect(most(([x, , z]) => Math.hypot(x, z))).toBeLessThan(BODY_REACH);
      // crowd.js's BEAR: the visitor's bear reaches 1.98 m from its middle, which stands 0.4 m ahead of its centre.
      expect(most(([x, , z]) => Math.hypot(x, z - 0.4))).toBeLessThanOrEqual(1.98);
    }
  });

  it("keeps a paw on the ground through the stride: the bear comes down as its legs swing out, and neither floats nor sinks", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    for (const swing of SWINGS) {
      const drop = stride(bear, swing);
      // The lower paw's lowest point is on the ground: no more than 1 cm under it, where the forward toe dips early in a stride, and
      // no higher over it than the paw's own facets leave it.
      const lowest = Math.min(...vertices(bear).map(([, y]) => y));
      expect(lowest).toBeGreaterThan(-0.01);
      expect(lowest).toBeLessThan(0.03);
      // The body comes down as far as the limbs' hips and shoulders do, and stride says how far.
      expect(bear.body.position.y).toBeCloseTo(-drop, 12);
      expect(bear.legs.map((leg: { position: { y: number } }) => leg.position.y)).toEqual([3.2 - drop, 3.2 - drop, 1.6 - drop, 1.6 - drop].map((y) => expect.closeTo(y, 9)));
    }
    // At rest it stands at its full height.
    stride(bear, 0);
    expect(bear.body.position.y).toBe(0);
    expect(Math.max(...vertices(bear).map(([, y]) => y))).toBeCloseTo(4.85, 2);
  });

  it("is one mesh to draw and four hidden limbs: two arms, then two legs, an arm swinging with the leg across from it", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    const meshes = bear.g.children.filter((o: { isMesh?: boolean }) => o.isMesh);
    expect(meshes.filter((o: { visible: boolean }) => o.visible)).toEqual([bear.body]);
    expect(bear.legs).toHaveLength(4);
    expect(bear.legs.map((leg: { visible: boolean }) => leg.visible)).toEqual([false, false, false, false]);
    // Arms hang from the shoulders, above the legs' hips, each pair one to a side.
    const at = bear.legs.map((leg: { position: { x: number; y: number } }) => [Math.sign(leg.position.x), leg.position.y]);
    expect(at.map(([side]: number[]) => side)).toEqual([-1, 1, -1, 1]);
    expect(at[0][1]).toBe(at[1][1]);
    expect(at[2][1]).toBe(at[3][1]);
    expect(at[0][1]).toBeGreaterThan(at[2][1]);
    stride(bear, 0.4);
    expect(bear.legs.map((leg: { rotation: { x: number } }) => leg.rotation.x)).toEqual([0.4, -0.4, -0.4, 0.4]);
  });
});

describe("furMaterial", () => {
  it("adds its pale rim to three's Lambert shader as that shader is written at the pinned version, and changes the surface's colour, never the light", () => {
    for (const vertexColors of [true, false]) {
      const shader = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader };
      expect(shader.fragmentShader.split("#include <normal_fragment_begin>")).toHaveLength(2);
      furMaterial(vertexColors).onBeforeCompile(shader);
      expect(shader.fragmentShader).not.toBe(THREE.ShaderLib.lambert.fragmentShader);
      expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0)");
      expect(shader.fragmentShader).not.toMatch(/reflectedLight\.\w+ \*=/);
      expect(shader.vertexShader).toBe(THREE.ShaderLib.lambert.vertexShader);
    }
  });
});

describe("drawLegs", () => {
  it("draws four legs for each bear a frame shows and none for one hidden or out of the scene, keeps the bears' own legs hidden, and bounds the legs where the bears stand each frame", () => {
    // Five bears 10 m apart: three shown, one hidden, as the visitor's is in first person, and one the downgrade took out of the scene.
    const scene = new THREE.Scene(), bears = buildBears(scene, 5);
    bears.forEach((b, k) => b.g.position.set(10 * k, 0, 0));
    bears[3].g.visible = false;
    scene.remove(bears[4].g);
    drawLegs(scene, bears);
    const legs = scene.children.at(-1);
    expect(legs.isInstancedMesh).toBe(true);
    // A frame as three draws it: every part placed, then the scene's onBeforeRender, before three culls and draws.
    const frame = () => {
      scene.updateMatrixWorld();
      scene.onBeforeRender();
    };
    const bounded = (b: (typeof bears)[number]) =>
      b.legs.every((leg) => legs.boundingSphere.containsPoint(leg.getWorldPosition(new THREE.Vector3())));
    frame();
    expect(legs.count).toBe(4 * 3);
    expect(bears.flatMap((b) => b.legs.map((leg) => leg.visible))).toEqual(Array(4 * 5).fill(false));
    expect(legs.boundingSphere).not.toBeNull();
    expect(bears.slice(0, 3).every(bounded)).toBe(true);
    // A bear walks 200 m on: the next frame's bounds take its legs in where it stands now.
    bears[0].g.position.x += 200;
    frame();
    expect(bounded(bears[0])).toBe(true);
  });
});
