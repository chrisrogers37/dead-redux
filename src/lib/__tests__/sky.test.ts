import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { lookAt, newLook } from "../../../public/world/night.js";
import { buildSky } from "../../../public/world/sky.js";

// The sky and its lights in a scene with fog, as main.js builds them, and the look of an hour with its key light turned `degrees`
// about the vertical.
function sky() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 100, 400);
  return { scene, ...buildSky(scene, 3, 0.5) };
}
function lookTurned(hour: number, degrees: number) {
  const look = lookAt(hour, newLook());
  const [x, y, z] = look.keyTo, a = (degrees * Math.PI) / 180;
  look.keyTo.set([x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)]);
  return look;
}

describe("the sky's grade", () => {
  it("asks for the stage's shadow to be redrawn on its first look, and after that only once the key light has turned more than half a degree since the last redraw", () => {
    const { grade } = sky();
    expect(grade(lookTurned(0, 0))).toBe(true);
    expect(grade(lookTurned(0, 0))).toBe(false);
    expect(grade(lookTurned(0, 0.3))).toBe(false);
    // Small turns add up: the shadow drawn at 0 is redrawn once the light stands a degree from it.
    expect(grade(lookTurned(0, 0.45))).toBe(false);
    expect(grade(lookTurned(0, 1))).toBe(true);
    expect(grade(lookTurned(0, 1.3))).toBe(false);
  });

  it("keeps the key light as far from what it aims at through the whole night, where the stage's shadow camera is framed", () => {
    const { grade, sun } = sky();
    const far = sun.position.distanceTo(sun.target.position);
    expect(far).toBeCloseTo(Math.hypot(60, 100, 40), 9);
    for (let hour = 0; hour <= 2; hour += 0.05) {
      grade(lookAt(hour, newLook()));
      expect(sun.position.distanceTo(sun.target.position)).toBeCloseTo(far, 4);
      expect(sun.position.y).toBeGreaterThan(sun.target.position.y);
    }
  });

  it("gives the fog the look's haze, which the sky under the horizon and the far sea both fade into", () => {
    const { grade, scene, skyMat } = sky();
    const look = lookAt(1, newLook());
    grade(look);
    expect(skyMat.uniforms.uHaze.value.toArray()).toEqual([...look.haze]);
    expect(scene.fog.color.getHex(THREE.SRGBColorSpace)).toBe(new THREE.Color().setRGB(look.haze[0], look.haze[1], look.haze[2], THREE.SRGBColorSpace).getHex(THREE.SRGBColorSpace));
  });
});
