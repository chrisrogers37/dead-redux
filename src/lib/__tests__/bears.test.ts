import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { buildBear, buildBears, drawLegs, furMaterial, NOSE, SNOUT, stride } from "../../../public/world/bears.js";
import { BODY_REACH } from "../../../public/world/collide.js";
import { readFileSync } from "fs";

// The visitor's bear's colour, the site's ink (avatar.js).
const VISITOR = 0xeceae4;

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
// The swings a bear's limbs take, every fortieth of a radian from the visitor's widest at a run one way to the other (0.7,
// avatar.js; the five's widest to the music is 0.65, audio.js), so the swing where the forward paw's toe dips deepest is among them.
const SWINGS = Array.from({ length: 57 }, (_, k) => Math.round((k - 28) * 25) / 1000);

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
      // The furthest of a bear from its centre is its nose's tip, SNOUT m ahead of it, whatever its limbs do: what stops a bear is
      // reckoned from there (trees.js).
      expect(most(([, , z]) => z)).toBeCloseTo(SNOUT, 6);
      expect(most(([x, , z]) => Math.hypot(x, z))).toBeCloseTo(SNOUT, 6);
      expect(most(([x, , z]) => Math.hypot(x, z))).toBeLessThan(BODY_REACH);
      // crowd.js's BEAR: the visitor's bear reaches 1.98 m from its middle, which stands 0.4 m ahead of its centre.
      expect(most(([x, , z]) => Math.hypot(x, z - 0.4))).toBeLessThanOrEqual(1.98);
    }
  });

  it("says where its nose is: SNOUT is the nose's own place and size", () => {
    expect(NOSE).toEqual({ up: 3.5, ahead: 2.16, r: 0.2 });
    expect(SNOUT).toBeCloseTo(2.36, 12);
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

  it("shows its ruff and its tail: each stands out past the body it is on, the ruff round at its edge, both in a tone apart from the fur", () => {
    const bear = buildBear(new THREE.Scene(), 0xd4607a);
    const position = bear.body.geometry.attributes.position;
    const own = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]);
    // At the neck the torso is 1.03 m to either side at its widest; the ruff stands past it, and no further than the arms do.
    const neck = own.filter(([, y]) => y > 2.9 && y < 3.3).map(([x]) => Math.abs(x));
    expect(Math.max(...neck)).toBeGreaterThan(1.1);
    expect(Math.max(...neck)).toBeLessThan(1.3);
    // Behind the hips the torso's back stands 0.95 m behind the centre; the tail stands past it.
    const rump = own.filter(([x, y]) => Math.abs(x) < 0.3 && y > 1.15 && y < 1.7).map(([, , z]) => z);
    expect(Math.min(...rump)).toBeLessThan(-1.15);
    // The ruff is a ring 1 m round the neck and 0.17 m thick, tipped 0.22 rad forward, 3.1 m up. Its corners stand at 28 places
    // round the neck, so its edge reads round from where the walk's camera stands: at 14 it showed straight sides. Exactly 28: a
    // bear's triangles are reckoned from it, and more of them would be paid for on every bear.
    const tip = Math.PI / 2 - 0.22, onRuff = (x: number, y: number, z: number) => {
      const up = y - 3.1, across = up * Math.cos(tip) + z * Math.sin(tip), along = -up * Math.sin(tip) + z * Math.cos(tip);
      // To a hundredth of a millimetre: the nearest corner of the body that is no part of the ruff stands 1.2 mm off its surface.
      return Math.abs(Math.hypot(Math.hypot(x, across) - 1, along) - 0.17) < 1e-5 ? Math.atan2(across, x) : null;
    };
    const turns = own.map(([x, y, z]) => onRuff(x, y, z)).filter((turn): turn is number => turn !== null);
    expect(new Set(turns.map((turn) => Math.round(((turn + 2 * Math.PI) % (2 * Math.PI)) * 100) % 628)).size).toBe(28);
    // Paler than the fur on a bear in a colour, and a shade deeper on the visitor's, whose fur is near white: a quarter apart at least.
    const light = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // The five as buildBears colours them, and the visitor's, which avatar.js builds in VISITOR.
    const five = buildBears(new THREE.Scene(), 5).map((b: { color: { r: number; g: number; b: number } }) => b.color);
    expect(five).toHaveLength(5);
    expect(readFileSync(new URL("../../../public/world/avatar.js", import.meta.url), "utf8")).toContain(`buildBear(scene, 0x${VISITOR.toString(16)})`);
    for (const fur of [...five, new THREE.Color(VISITOR)]) {
      const visitor = fur.getHex() === VISITOR;
      const { body } = buildBear(new THREE.Scene(), fur.getHex()), at = body.geometry.attributes.position, colour = body.geometry.attributes.color;
      const furLight = light(fur.r, fur.g, fur.b);
      let ruffs = 0;
      for (let i = 0; i < at.count; i++) {
        const tail = Math.abs(Math.hypot(at.getX(i), at.getY(i) - 1.42, at.getZ(i) + 1.02) - 0.24) < 1e-5;
        if (onRuff(at.getX(i), at.getY(i), at.getZ(i)) === null && !tail) continue;
        ruffs += 1;
        const ratio = light(colour.getX(i), colour.getY(i), colour.getZ(i)) / furLight;
        if (visitor) expect(ratio).toBeLessThan(0.75);
        else expect(ratio).toBeGreaterThan(1.25);
      }
      expect(ruffs).toBeGreaterThan(200);
    }
  });

  it("gives the visitor's near-white bear a belly, a muzzle and inner ears a shade deeper than its fur and less deep than its ruff, and the five theirs paler than their fur, as before", () => {
    const light = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    // Corners where each part is drawn in its own tone in full: the belly's middle, the front of the torso inside its oval, under
    // the head's lowest corner (2.5 m up), where nothing else stands; and, each found by an exact test of its surface, to a hundredth
    // of a millimetre, as the ruff's are, the muzzle, an egg 0.5175 by 0.405 by 0.45 m about a point 3.4 m up and 1.8 m ahead, and the
    // inner ears, each the front of a ball of 0.35 m about a point 0.7 m to its side, 4.5 m up and 0.6 m ahead, within 0.16 m of the
    // ear's middle.
    const torsoAt = (x: number, y: number, z: number) => z > 0.4 && y < 2.45 && Math.hypot(x / 0.78, (y - 2) / 1.15) < 0.7;
    const muzzleAt = (x: number, y: number, z: number) => Math.abs((x / 0.5175) ** 2 + ((y - 3.4) / 0.405) ** 2 + ((z - 1.8) / 0.45) ** 2 - 1) < 1e-5;
    const earAt = (x: number, y: number, z: number) =>
      Math.abs(Math.hypot(Math.abs(x) - 0.7, y - 4.5, z - 0.6) - 0.35) < 1e-5 && z > 0.84 && Math.hypot(Math.abs(x) - 0.7, y - 4.5) <= 0.16;
    const ruffAt = (x: number, y: number, z: number) => {
      const tip = Math.PI / 2 - 0.22, up = y - 3.1, across = up * Math.cos(tip) + z * Math.sin(tip), along = -up * Math.sin(tip) + z * Math.cos(tip);
      return Math.abs(Math.hypot(Math.hypot(x, across) - 1, along) - 0.17) < 1e-5;
    };
    const coloursOf = (hue: number) => {
      const { body } = buildBear(new THREE.Scene(), hue), at = body.geometry.attributes.position, colour = body.geometry.attributes.color;
      const found: Record<"belly" | "muzzle" | "ears" | "ruff", { r: number; g: number; b: number }[]> = { belly: [], muzzle: [], ears: [], ruff: [] };
      for (let i = 0; i < at.count; i++) {
        const [x, y, z] = [at.getX(i), at.getY(i), at.getZ(i)], c = { r: colour.getX(i), g: colour.getY(i), b: colour.getZ(i) };
        if (torsoAt(x, y, z)) found.belly.push(c);
        if (muzzleAt(x, y, z)) found.muzzle.push(c);
        if (earAt(x, y, z)) found.ears.push(c);
        if (ruffAt(x, y, z)) found.ruff.push(c);
      }
      // Each part is found, and the ears on both sides.
      expect(found.belly.length).toBeGreaterThan(5);
      expect(found.muzzle.length).toBeGreaterThan(100);
      expect(found.ears.length).toBeGreaterThanOrEqual(6);
      expect(found.ruff.length).toBeGreaterThan(200);
      return found;
    };
    // The visitor's: a shade deeper than its fur, 10 to 25 % less light, where paler than near white would not show (it was 11 %
    // lighter); and lighter than its ruff, which is deeper still, so the two stay apart.
    const fur = new THREE.Color(VISITOR), visitor = coloursOf(VISITOR);
    expect(light(fur)).toBeGreaterThan(0.6);
    const deepestRuff = Math.max(...visitor.ruff.map((c) => light(c) / light(fur)));
    for (const part of ["belly", "muzzle", "ears"] as const) {
      for (const c of visitor[part]) {
        const ratio = light(c) / light(fur);
        expect(ratio).toBeGreaterThanOrEqual(0.75);
        expect(ratio).toBeLessThanOrEqual(0.9);
        expect(ratio).toBeGreaterThan(deepestRuff + 0.05);
        // The same hue as the fur, deeper: its channels in the fur's own proportions.
        expect([c.r / fur.r, c.g / fur.g, c.b / fur.b].map((k) => k - ratio)).toEqual([0, 0, 0].map(() => expect.closeTo(0, 5)));
      }
    }
    // The five's: half way from their fur to white, as on main, to the float a vertex holds.
    const five = buildBears(new THREE.Scene(), 5).map((b: { color: { getHex(): number } }) => b.color.getHex());
    expect(five).toHaveLength(5);
    for (const hue of five) {
      const own = coloursOf(hue), half = new THREE.Color(hue).lerp(new THREE.Color(0xffffff), 0.5);
      for (const part of ["belly", "muzzle", "ears"] as const) {
        for (const c of own[part]) expect([c.r, c.g, c.b]).toEqual([half.r, half.g, half.b].map((v: number) => expect.closeTo(v, 6)));
      }
    }
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
      // The rim pales by how far the surface turns from the eye, and only where the surface is fur: what is dark stays dark.
      expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.45 * fuzz * furred);");
      expect(shader.fragmentShader).toContain("float furred = smoothstep(0.03, 0.2, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));");
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
