import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildBears, drawLegs } from "../../../public/world/bears.js";

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
