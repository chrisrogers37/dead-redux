import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { makeBuilders, mergeLandmarks, mergeStill, mesh } from "../../../public/world/landmarks.js";

type Part = { isMesh?: boolean; material: { vertexColors: boolean; flatShading: boolean; emissive: { getHex(): number } }; geometry: { index: unknown; attributes: Record<string, { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number }> } };
type Build = (g: unknown) => void;
// The builders' table as path.js reads it: a title's rule and the landmark it builds.
function builders(phone: boolean) {
  const { BUILDERS, standingStone, moving } = makeBuilders(phone);
  return { table: BUILDERS as unknown as [{ test(title: string): boolean }, Build][], standingStone: standingStone as Build, moving: moving as { obj: unknown }[] };
}
// A landmark as path.js builds it: the builder the title's rule names, run on a group. Its still parts are merged as it is built.
function landmark(title: string, phone = false) {
  const { table, standingStone, moving } = builders(phone);
  const g = new THREE.Group(), rule = table.find(([re]) => re.test(title));
  (rule ? rule[1] : standingStone)(g);
  return { g, moving, parts: g.children as Part[] };
}
const triangles = (parts: Part[]) => parts.reduce((sum, part) => sum + part.geometry.attributes.position.count / 3, 0);
const bounds = (g: unknown) => new THREE.Box3().setFromObject(g);
// The five that are built of many parts, by a title of each.
const RICH = ["Tuning", "Jack Straw", "Dupree's Diamond Blues", "C C Rider", "Tennessee Jed"];

describe("mergeStill", () => {
  it("merges a landmark's still parts into one mesh, each part as faceted or as round as it was on its own", () => {
    const g = new THREE.Group();
    const flat = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true }), smooth = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
    g.add(mesh(new THREE.SphereGeometry(1, 8, 6), flat, -3, 1, 0), mesh(new THREE.SphereGeometry(1, 8, 6), smooth, 3, 1, 0));
    mergeStill(g);
    expect(g.children).toHaveLength(1);
    const { geometry, material } = g.children[0] as Part;
    // One material for every merged mesh: it reads the colours and the normals the parts bring, and forces no facets of its own.
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(false);
    expect(Object.keys(geometry.attributes).sort()).toEqual(["color", "normal", "position"]);
    const { position, normal, color } = geometry.attributes, corner = new THREE.Vector3(), out = new THREE.Vector3();
    let facets = 0, rounds = 0;
    for (let i = 0; i < position.count; i += 3) {
      const left = position.getX(i) < 0, centre = new THREE.Vector3(left ? -3 : 3, 1, 0);
      const same = [1, 2].every((k) => Math.abs(normal.getX(i) - normal.getX(i + k)) + Math.abs(normal.getY(i) - normal.getY(i + k)) + Math.abs(normal.getZ(i) - normal.getZ(i + k)) < 1e-6);
      if (left) {
        // The flat part: a face's three corners share the face's own normal.
        expect(same).toBe(true);
        facets += 1;
      } else {
        // The smooth part: each corner's normal points out from the ball's middle, so a face's corners differ.
        for (let k = 0; k < 3; k++) {
          corner.fromBufferAttribute(position, i + k).sub(centre).normalize();
          out.fromBufferAttribute(normal, i + k);
          expect(out.dot(corner)).toBeGreaterThan(0.999);
        }
        if (!same) rounds += 1;
      }
      // Each part keeps its own colour.
      expect(color.getX(i)).toBeCloseTo(new THREE.Color(left ? 0x8e8a82 : 0x6b4e2e).r, 5);
    }
    expect(facets).toBeGreaterThan(40);
    expect(rounds).toBeGreaterThan(40);
  });

  it("leaves what glows, what moves and what wears another material out of the merge", () => {
    const g = new THREE.Group();
    const still = new THREE.MeshLambertMaterial({ color: 0x8e8a82 }), glows = new THREE.MeshLambertMaterial({ color: 0xe8b04b, emissive: 0xe8b04b });
    const spins = mesh(new THREE.BoxGeometry(1, 1, 1), still, 0, 3, 0), lamp = mesh(new THREE.BoxGeometry(1, 1, 1), glows, 0, 5, 0), shiny = mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial(), 0, 7, 0);
    g.add(mesh(new THREE.BoxGeometry(1, 1, 1), still, 0, 0, 0), mesh(new THREE.BoxGeometry(1, 1, 1), still, 2, 0, 0), spins, lamp, shiny);
    mergeStill(g, [spins]);
    expect(g.children).toHaveLength(4);
    expect(g.children).toEqual(expect.arrayContaining([spins, lamp, shiny]));
  });
});

describe("the landmarks", () => {
  it("builds every landmark in the table on a desktop and on a phone, each merged to one still mesh and whatever of it glows or moves", () => {
    for (const phone of [false, true]) {
      const { table, standingStone, moving } = builders(phone);
      for (const build of [...table.map(([, b]) => b), standingStone]) {
        const g = new THREE.Group();
        build(g);
        const parts = g.children as Part[];
        expect(parts.length).toBeGreaterThan(0);
        // At most one merged still mesh: every other part glows, moves or wears a material of its own.
        const kept = moving.map((m) => m.obj);
        const still = parts.filter((c) => c.isMesh && !kept.includes(c) && (c.material as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial && c.material.emissive.getHex() === 0);
        expect(still.length).toBeLessThanOrEqual(1);
        expect(parts.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("draws all their still parts as one mesh across the whole path", () => {
    const scene = new THREE.Scene();
    const built = RICH.map((title, k) => { const { g } = landmark(title); g.position.set(20 * k, 0, 0); scene.add(g); return g; });
    const before = RICH.reduce((sum, title) => sum + triangles(landmark(title).parts.filter((c) => c.material.emissive.getHex() === 0)), 0);
    mergeLandmarks(scene, built, []);
    const merged = scene.children.filter((c: Part) => c.isMesh);
    expect(merged).toHaveLength(1);
    expect(triangles(merged as Part[])).toBe(before);
    // What is left in the landmarks is what glows: the tuning peg's key.
    expect(built.flatMap((g) => g.children)).toHaveLength(1);
  });
});

describe("the landmarks built of many parts", () => {
  it("are each one still mesh, and the tuning peg its glowing key besides, so none costs more to draw than the plain shape it was", () => {
    for (const phone of [false, true]) {
      for (const title of RICH) {
        const { parts } = landmark(title, phone);
        expect(parts.length).toBe(title === "Tuning" ? 2 : 1);
        expect(parts.filter((c) => c.material.emissive.getHex() !== 0)).toHaveLength(title === "Tuning" ? 1 : 0);
      }
    }
  });

  it("stand on the ground and on down under it, so none hangs over a slope's lower side, and keep to the size of the shapes they replace", () => {
    for (const phone of [false, true]) {
      for (const title of RICH) {
        const box = bounds(landmark(title, phone).g), size = box.getSize(new THREE.Vector3());
        // A footing or a post goes 1.2 m under the landmark's own ground; the bales lie on it, sunk a hand.
        if (title === "Jack Straw") expect(box.min.y).toBeLessThan(-0.05);
        else expect(box.min.y).toBeLessThanOrEqual(-1.2 + 1e-6);
        expect(box.min.y).toBeGreaterThan(-1.5);
        // No taller than two bears, no longer than the rail was, and no wider than 7 m.
        expect(box.max.y).toBeLessThan(9.7);
        expect(size.x).toBeLessThan(10.6);
        expect(size.z).toBeLessThan(7);
      }
    }
  });

  it("cost a few thousand triangles between them, and fewer on a phone", () => {
    const cost = (phone: boolean) => RICH.map((title) => triangles(landmark(title, phone).parts));
    const desktop = cost(false), phone = cost(true);
    desktop.forEach((n) => { expect(n).toBeGreaterThan(300); expect(n).toBeLessThan(2800); });
    phone.forEach((n, k) => expect(n).toBeLessThanOrEqual(desktop[k]));
    expect(desktop.reduce((a, b) => a + b)).toBeLessThan(7500);
    expect(phone.reduce((a, b) => a + b)).toBeLessThan(5200);
  });

  it("turn their faces to the walker who comes up the path: the cabin's door and lit window are on its near side", () => {
    // A landmark's own +z runs on along the path, so the walker comes at it from -z. The window's pane is the cabin's one pale part.
    const { parts } = landmark("Tennessee Jed"), { position, color } = parts[0].geometry.attributes, pane = new THREE.Color(0xe8c477);
    let panes = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(color.getX(i) - pane.r) + Math.abs(color.getY(i) - pane.g) + Math.abs(color.getZ(i) - pane.b) > 1e-4) continue;
      panes += 1;
      expect(position.getZ(i)).toBeLessThan(-2.1);
    }
    expect(panes).toBe(36);
  });

  it("build the same on every visit: nothing in them is left to chance", () => {
    for (const title of RICH) {
      const a = landmark(title).parts[0].geometry.attributes.position, b = landmark(title).parts[0].geometry.attributes.position;
      expect(a.count).toBe(b.count);
      for (let i = 0; i < a.count; i += 37) expect([a.getX(i), a.getY(i), a.getZ(i)]).toEqual([b.getX(i), b.getY(i), b.getZ(i)]);
    }
  });
});
