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
});
