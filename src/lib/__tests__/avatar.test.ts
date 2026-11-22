import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildAvatar } from "../../../public/world/avatar.js";

// Every leg's swing, frame after frame, as the visitor's bear walks along +x at 12 m/s, 60 frames a second for 2 s.
function swings(reduced: boolean) {
  const avatar = buildAvatar(new THREE.Scene(), [], { phone: false, reduced });
  const out: number[] = [];
  for (let f = 0; f <= 120; f++) {
    avatar.step(0.2 * f, 0, -Math.PI / 2, f === 0 ? 0 : 1 / 60);
    out.push(...avatar.legs.map((leg) => leg.rotation.x));
  }
  return out;
}

describe("the visitor's bear", () => {
  it("swings no leg as it walks under reduced motion, where the same walk swings them in full motion", () => {
    expect(swings(true).filter((x) => x !== 0)).toEqual([]);
    expect(swings(false).filter((x) => x !== 0).length).toBeGreaterThan(0);
  });

  it("brings its head and the top of it down with its stride, as far as its body comes down", () => {
    const avatar = buildAvatar(new THREE.Scene(), [], { phone: false, reduced: false });
    let most = 0;
    for (let f = 0; f <= 120; f++) {
      avatar.step(0.2 * f, 0, -Math.PI / 2, f === 0 ? 0 : 1 / 60);
      // The body mesh, the group's one visible child, stands as far under the group as the stride brought the bear down.
      const body = avatar.g.children.find((o: { visible: boolean }) => o.visible);
      const down = -body.position.y;
      expect(avatar.head.y).toBeCloseTo(avatar.g.position.y - down + 3.6, 9);
      expect(avatar.top.y).toBeCloseTo(avatar.g.position.y - down + 4.85, 9);
      most = Math.max(most, down);
    }
    // At a walk the bear comes down a few centimetres at the ends of each stride.
    expect(most).toBeGreaterThan(0.02);
  });
});
