import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { height } from "../../../public/world/ground.js";
import { makeBuilders, mergeLandmarks, mergeStill, mesh, STONE_KINDS, stoneKind, titleHash } from "../../../public/world/landmarks.js";
import { buildPath, buildWalkLine, layout, placeLandmarks } from "../../../public/world/path.js";
import { readdirSync, readFileSync } from "fs";

type Part = { isMesh?: boolean; material: { vertexColors: boolean; flatShading: boolean; emissive: { getHex(): number } }; geometry: { index: unknown; attributes: Record<string, { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number }> } };
type Build = (g: unknown, title?: string) => void;
// The builders' table as path.js reads it: a title's rule and the landmark it builds.
function builders(phone: boolean) {
  const { BUILDERS, standingStone, moving } = makeBuilders(phone);
  return { table: BUILDERS as unknown as [{ test(title: string): boolean }, Build][], standingStone: standingStone as Build, moving: moving as { obj: unknown }[] };
}
// A landmark as path.js builds it: the builder the title's rule names, run on a group with the title, which the standing stone reads.
// Its still parts are merged as it is built.
function landmark(title: string, phone = false) {
  const { table, standingStone, moving } = builders(phone);
  const g = new THREE.Group(), rule = table.find(([re]) => re.test(title));
  (rule ? rule[1] : standingStone)(g, title);
  return { g, moving, parts: g.children as Part[] };
}
const triangles = (parts: Part[]) => parts.reduce((sum, part) => sum + part.geometry.attributes.position.count / 3, 0);
const bounds = (g: unknown) => new THREE.Box3().setFromObject(g);
// The five that are built of many parts, by a title of each.
const RICH = ["Tuning", "Jack Straw", "Dupree's Diamond Blues", "C C Rider", "Tennessee Jed"];

describe("mergeStill", () => {
  // Two balls, one flat-shaded and one smooth, 6 m apart: after a merge the first keeps its facets and the second its round.
  const twoBalls = () => {
    const g = new THREE.Group();
    const flat = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true }), smooth = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
    g.add(mesh(new THREE.SphereGeometry(1, 8, 6), flat, -3, 1, 0), mesh(new THREE.SphereGeometry(1, 8, 6), smooth, 3, 1, 0));
    return g;
  };
  const facetedAndRound = ({ geometry, material }: Part) => {
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
  };

  it("merges a landmark's still parts into one mesh, each part as faceted or as round as it was on its own", () => {
    const g = twoBalls();
    mergeStill(g);
    expect(g.children).toHaveLength(1);
    facetedAndRound(g.children[0] as Part);
  });

  it("keeps them so when every landmark's parts merge across the path, which is the mesh that is drawn", () => {
    const scene = new THREE.Scene(), g = twoBalls();
    mergeStill(g);
    scene.add(g, twoBalls().translateZ(40));
    mergeLandmarks(scene, [g, scene.children[1]], []);
    const merged = scene.children.filter((c: Part) => c.isMesh) as Part[];
    expect(merged).toHaveLength(1);
    // The first landmark's own two balls, which went through both merges.
    const { position, normal, color } = merged[0].geometry.attributes, near: number[] = [];
    for (let i = 0; i < position.count; i++) if (position.getZ(i) < 20) near.push(i);
    const pick = (attribute: { getX(i: number): number; getY(i: number): number; getZ(i: number): number }) => new THREE.Float32BufferAttribute(near.flatMap((i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]), 3);
    facetedAndRound({ material: merged[0].material, geometry: { index: null, attributes: { position: pick(position), normal: pick(normal), color: pick(color) } } } as unknown as Part);
  });

  it("gives a part that brings no normals its faces' own, so parts of any making merge", () => {
    const g = new THREE.Group(), bare = new THREE.BufferGeometry();
    bare.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, -1], 3));
    g.add(mesh(bare, new THREE.MeshLambertMaterial({ color: 0x8e8a82 }), 0, 0, 0), mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8e8a82 }), 3, 0, 0));
    mergeStill(g);
    expect(g.children).toHaveLength(1);
    const { normal } = (g.children[0] as Part).geometry.attributes;
    expect([normal.getX(0), normal.getY(0), normal.getZ(0)]).toEqual([0, 1, 0]);
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

  it("stand on the ground and on down under it, so none hangs over a slope's lower side, and keep near the size of the shapes they replace", () => {
    for (const phone of [false, true]) {
      for (const title of RICH) {
        const { g, parts } = landmark(title, phone), box = bounds(g), size = box.getSize(new THREE.Vector3());
        const still = parts.find((c) => c.material.emissive.getHex() === 0) as Part, { position, color } = still.geometry.attributes;
        if (title === "Jack Straw") {
          // The bales lie settled into the ground: each bale's own body, in straw's colour, goes 0.45 m under it at its lowest
          // line, and its lowest corners nearly as far.
          const straw = new THREE.Color(0xc9a24a);
          let lowest = Infinity;
          for (let i = 0; i < position.count; i++) if (Math.abs(color.getX(i) - straw.r) + Math.abs(color.getY(i) - straw.g) + Math.abs(color.getZ(i) - straw.b) < 1e-4) lowest = Math.min(lowest, position.getY(i));
          expect(lowest).toBeLessThan(-0.3);
          expect(box.min.y).toBeGreaterThan(-0.6);
        } else {
          // A footing or a post goes 1.6 m under the landmark's own ground, and every part that comes down to the ground goes on
          // down with it: none ends between the ground and that depth, where a slope's lower side would show under it.
          expect(box.min.y).toBeLessThanOrEqual(-1.6 + 1e-6);
          expect(box.min.y).toBeGreaterThan(-1.65);
          for (let i = 0; i < position.count; i++) expect(position.getY(i) > -1.5 && position.getY(i) < 0.05).toBe(false);
        }
        // No taller than the shapes they replace (the ball on its pole, 8 m), about as long as the rail was, and no wider than 7 m.
        expect(box.max.y).toBeLessThanOrEqual(8);
        expect(size.x).toBeLessThan(10.6);
        expect(size.z).toBeLessThan(7);
      }
    }
  });

  it("stands a thing built in its own frame as large as it was made: the saddle, a third larger than its parts, is 2 m long", () => {
    // The saddle's leather: its seat, cantle and horn, along the rail.
    const { position, color } = landmark("C C Rider").parts[0].geometry.attributes, hide = new THREE.Color(0x8a5a34);
    let lo = Infinity, hi = -Infinity, n = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(color.getX(i) - hide.r) + Math.abs(color.getY(i) - hide.g) + Math.abs(color.getZ(i) - hide.b) > 1e-4) continue;
      lo = Math.min(lo, position.getX(i)); hi = Math.max(hi, position.getX(i)); n += 1;
    }
    expect(n).toBeGreaterThan(300);
    // 1.5 m as its parts are made, by 1.35.
    expect(hi - lo).toBeGreaterThan(1.9);
    expect(hi - lo).toBeLessThan(2.2);
  });

  it("hangs each stirrup from the saddle: its strap comes down from under a skirt, and the stirrup hooks on the strap's foot", () => {
    // By colour, in the rail's own frame: the straps, the skirts and the stirrups' iron. The saddle sits at x 1.2, turned 0.08 rad.
    const { position, color } = landmark("C C Rider").parts[0].geometry.attributes;
    const of = (hex: number, keep: (x: number, y: number, z: number) => boolean = () => true) => {
      const tone = new THREE.Color(hex), out: number[][] = [];
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) > 1e-4) continue;
        if (keep(position.getX(i), position.getY(i), position.getZ(i))) out.push([position.getX(i), position.getY(i), position.getZ(i)]);
      }
      return out;
    };
    const span = (points: number[][], axis: number) => [Math.min(...points.map((p) => p[axis])), Math.max(...points.map((p) => p[axis]))];
    for (const side of [-1, 1]) {
      const onSide = (_x: number, _y: number, z: number) => Math.sign(z - 0.13) === side;
      const strap = of(0x6a4426, onSide), skirt = of(0x7a5230, onSide), stirrup = of(0x55595c, (x, y, z) => onSide(x, y, z) && x > 0.6 && x < 1.9);
      expect(strap).toHaveLength(36);
      expect(skirt).toHaveLength(36);
      expect(stirrup.length).toBeGreaterThan(40);
      // The strap's top is above the skirt's lower edge and within a hand of the skirt, on the saddle's side of it.
      const [strapLow, strapTop] = span(strap, 1), [skirtLow] = span(skirt, 1);
      expect(strapTop).toBeGreaterThan(skirtLow);
      const far = (points: number[][]) => Math.max(...points.map((p) => Math.abs(p[2] - 0.13))), near = (points: number[][]) => Math.min(...points.map((p) => Math.abs(p[2] - 0.13)));
      expect(far(strap)).toBeLessThan(far(skirt) + 0.02);
      expect(near(strap)).toBeGreaterThan(near(skirt) - 0.12);
      // The stirrup's ring reaches up past the strap's foot and hangs under it, in the strap's own plane.
      const [ringLow, ringTop] = span(stirrup, 1);
      expect(ringTop).toBeGreaterThan(strapLow);
      expect(ringLow).toBeLessThan(strapLow - 0.2);
      expect(Math.abs((span(stirrup, 2)[0] + span(stirrup, 2)[1]) / 2 - (span(strap, 2)[0] + span(strap, 2)[1]) / 2)).toBeLessThan(0.03);
    }
  });

  it("closes the cabin: a sill under each side wall, whose first log lies half a course up, and a board under each eave", () => {
    const { position, color } = landmark("Tennessee Jed").parts[0].geometry.attributes, plank = new THREE.Color(0x4a3520);
    const planks = (keep: (x: number, y: number, z: number) => boolean) => {
      let n = 0;
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(color.getX(i) - plank.r) + Math.abs(color.getY(i) - plank.g) + Math.abs(color.getZ(i) - plank.b) > 1e-4) continue;
        if (keep(position.getX(i), position.getY(i), position.getZ(i))) n += 1;
      }
      return n;
    };
    // Each is a box: 36 corners. The sills lie between the footing's top (0.3) and the side logs' underside (0.52).
    for (const x of [-2.45, 2.45]) expect(planks((px, y, z) => Math.abs(px - x) < 0.25 && y > 0.25 && y < 0.6 && Math.abs(z) < 1.9)).toBe(36);
    // The boards lie between the front and back walls' top (3.0) and the roof over them.
    for (const z of [-1.95, 1.95]) expect(planks((x, y, pz) => Math.abs(pz - z) < 0.2 && y > 2.95 && y < 3.4 && Math.abs(x) < 2.7)).toBe(36);
  });

  it("leans the pitchfork on the big bale with its tines up, clear of the bale, where they show", () => {
    for (const phone of [false, true]) {
      // The fork's iron: its bar and three tines. The big bale's axis runs 1.45 m up, turned a quarter of a radian; it is 1.9 m thick.
      const { position, color } = landmark("Jack Straw", phone).parts[0].geometry.attributes, iron = new THREE.Color(0x55595c);
      const axis = new THREE.Vector3(Math.cos(0.25), 0, -Math.sin(0.25)), from = new THREE.Vector3();
      let n = 0, top = -Infinity;
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(color.getX(i) - iron.r) + Math.abs(color.getY(i) - iron.g) + Math.abs(color.getZ(i) - iron.b) > 1e-4) continue;
        n += 1;
        top = Math.max(top, position.getY(i));
        from.set(position.getX(i), position.getY(i) - 1.45, position.getZ(i));
        expect(from.addScaledVector(axis, -from.dot(axis)).length()).toBeGreaterThan(1.9);
      }
      expect(n).toBe(36 + 3 * 24);
      // The tines' tips stand over the bale's top, 3.35 m up.
      expect(top).toBeGreaterThan(3.6);
      // Its shaft, the one timber part here, leans on the bale and does not pass through it: the line between the middles of its
      // two ends keeps the bale's radius and its own from the bale's axis. Its foot is in the ground.
      const timber = new THREE.Color(0x6b4e2e), shaft: InstanceType<typeof THREE.Vector3>[] = [];
      for (let i = 0; i < position.count; i++) if (Math.abs(color.getX(i) - timber.r) + Math.abs(color.getY(i) - timber.g) + Math.abs(color.getZ(i) - timber.b) < 1e-4) shaft.push(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
      expect(shaft.length).toBeGreaterThan(30);
      const middle = (points: InstanceType<typeof THREE.Vector3>[]) => points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
      const half = (Math.min(...shaft.map((point) => point.y)) + Math.max(...shaft.map((point) => point.y))) / 2;
      const foot = middle(shaft.filter((point) => point.y < half)), head = middle(shaft.filter((point) => point.y >= half));
      let nearest = Infinity;
      for (let k = 0; k <= 100; k++) {
        from.copy(foot).lerp(head, k / 100);
        from.y -= 1.45;
        nearest = Math.min(nearest, from.addScaledVector(axis, -from.dot(axis)).length());
      }
      expect(nearest).toBeGreaterThan(1.9 + 0.05);
      expect(nearest).toBeLessThan(1.9 + 0.2);
      expect(Math.min(...shaft.map((point) => point.y))).toBeLessThan(-0.3);
    }
  });

  it("keeps the tuning peg's key a flattened oval, glowing, and a phone's rail without its rope", () => {
    const key = landmark("Tuning").parts.find((c) => c.material.emissive.getHex() !== 0) as Part & { position: { y: number } };
    const box = new THREE.Box3().setFromBufferAttribute(key.geometry.attributes.position), size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeLessThan(0.5 * size.x);
    expect(size.y).toBeLessThan(0.9 * size.x);
    // Its top stands no higher than main's ball did, 8 m up: on a phone the title plate hangs just over that in the opening view.
    expect(key.position.y + box.max.y).toBeLessThanOrEqual(8);
    expect(key.position.y + box.max.y).toBeGreaterThan(7.8);
    const rope = (phone: boolean) => {
      const { position, color } = landmark("C C Rider", phone).parts[0].geometry.attributes, string = new THREE.Color(0xcfc8b4);
      let n = 0;
      for (let i = 0; i < position.count; i++) if (position.getX(i) < -4 && Math.abs(color.getX(i) - string.r) + Math.abs(color.getY(i) - string.g) + Math.abs(color.getZ(i) - string.b) < 1e-4) n += 1;
      return n;
    };
    expect(rope(false)).toBeGreaterThan(200);
    expect(rope(true)).toBe(0);
  });

  it("cost a few thousand triangles between them, and fewer on a phone", () => {
    const cost = (phone: boolean) => RICH.map((title) => triangles(landmark(title, phone).parts));
    const desktop = cost(false), phone = cost(true);
    desktop.forEach((n) => { expect(n).toBeGreaterThan(300); expect(n).toBeLessThan(3000); });
    phone.forEach((n, k) => expect(n).toBeLessThanOrEqual(desktop[k]));
    expect(desktop.reduce((a, b) => a + b)).toBeLessThan(8500);
    expect(phone.reduce((a, b) => a + b)).toBeLessThan(6000);
  });

  it("turn their faces to the walker who comes up the path: the cabin's door and its window are on its near side", () => {
    // A landmark's own +z runs on along the path, so the walker comes at it from -z. The window's pane is the cabin's one pale part.
    const { parts } = landmark("Tennessee Jed"), { position, color } = parts[0].geometry.attributes, pane = new THREE.Color(0xe8c477);
    let panes = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(color.getX(i) - pane.r) + Math.abs(color.getY(i) - pane.g) + Math.abs(color.getZ(i) - pane.b) > 1e-4) continue;
      panes += 1;
      expect(position.getZ(i)).toBeLessThan(-2.1);
    }
    expect(panes).toBeGreaterThanOrEqual(36);
  });

  it("build the same on every visit: nothing in them is left to chance", () => {
    for (const title of RICH) {
      const a = landmark(title).parts[0].geometry.attributes.position, b = landmark(title).parts[0].geometry.attributes.position;
      expect(a.count).toBe(b.count);
      for (let i = 0; i < a.count; i += 37) expect([a.getX(i), a.getY(i), a.getZ(i)]).toEqual([b.getX(i), b.getY(i), b.getZ(i)]);
    }
  });
});

describe("the rough-hewn landmarks", () => {
  // The five built of rough stone, by a title of each.
  const ROUGH = ["My Brother Esau", "Touch Of Grey", "Cold Rain And Snow", "Fire On The Mountain", "Samson And Delilah"];
  const stillOf = (title: string, phone = false) => landmark(title, phone).parts.filter((c) => c.isMesh && c.material.emissive.getHex() === 0);
  // How many of a mesh's faces are in a colour, and the lowest and highest of them.
  const faces = (part: Part, hex: number) => {
    const { position, color } = part.geometry.attributes, tone = new THREE.Color(hex);
    let n = 0, low = Infinity, high = -Infinity;
    for (let i = 0; i < position.count; i += 3) {
      if (Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) > 1e-4) continue;
      n += 1;
      low = Math.min(low, position.getY(i), position.getY(i + 1), position.getY(i + 2));
      high = Math.max(high, position.getY(i), position.getY(i + 1), position.getY(i + 2));
    }
    return { n, low, high };
  };

  it("are each one still mesh, on a desktop and on a phone, and the fire its flame and its light besides", () => {
    for (const phone of [false, true]) {
      for (const title of ROUGH) {
        const { parts, moving } = landmark(title, phone);
        expect(stillOf(title, phone)).toHaveLength(1);
        if (title !== "Fire On The Mountain") { expect(parts).toHaveLength(1); continue; }
        // The flame swells with the music from its own base, 5 m up; its light is a desktop's and a TV's.
        const swell = moving.find((m) => (m as { kind?: string }).kind === "swell") as { obj: Part & { position: { y: number } } };
        expect(parts).toContain(swell.obj);
        expect(swell.obj.position.y).toBe(5);
        expect(new THREE.Box3().setFromBufferAttribute(swell.obj.geometry.attributes.position).min.y).toBeCloseTo(0, 6);
        expect(swell.obj.material.emissive.getHex()).toBe(0xff7a2a);
        expect(moving.filter((m) => (m as { kind?: string }).kind === "flame")).toHaveLength(phone ? 0 : 1);
        expect(parts).toHaveLength(phone ? 2 : 3);
      }
    }
  });

  it("stand in the ground, so none shows daylight under it on a slope, and keep near the size of the shapes they replace", () => {
    for (const phone of [false, true]) {
      for (const title of ROUGH) {
        const box = bounds(landmark(title, phone).g), size = box.getSize(new THREE.Vector3());
        // A column's base and the standing stones go 1.6 m under, a peak 2 m, and the great boulder lies 0.6 m into the ground.
        const under: Record<string, number> = { "My Brother Esau": -1.5, "Touch Of Grey": -0.55, "Cold Rain And Snow": -1.99, "Fire On The Mountain": -1.99, "Samson And Delilah": -1.55 };
        expect(box.min.y).toBeLessThan(under[title]);
        expect(box.min.y).toBeGreaterThan(-2.1);
        expect(box.max.y).toBeLessThan(9.2);
        expect(Math.max(size.x, size.z)).toBeLessThan(6.1);
      }
    }
  });

  it("are painted face by face: snow lies on the peak's top and lower down one side, the fire's peak is burnt at its top, and the boulder has its touch of grey", () => {
    const peak = stillOf("Cold Rain And Snow")[0], snow = faces(peak, 0xeceae4), all = peak.geometry.attributes.position.count / 3;
    expect(snow.n).toBeGreaterThan(10);
    expect(snow.n).toBeLessThan(0.5 * all);
    // No snow under 2.5 m, and the tip, 7.4 m up, is snow.
    expect(snow.low).toBeGreaterThan(2.5);
    expect(snow.high).toBeCloseTo(7.4, 3);
    const burnt = faces(stillOf("Fire On The Mountain")[0], 0x2a1d18);
    expect(burnt.n).toBeGreaterThan(4);
    expect(burnt.low).toBeGreaterThan(3.2);
    // The vein: a pale band through the boulder, a few faces wide.
    const boulder = stillOf("Touch Of Grey")[0], vein = faces(boulder, 0xeceae4);
    expect(vein.n).toBeGreaterThan(8);
    expect(vein.n).toBeLessThan(0.3 * (boulder.geometry.attributes.position.count / 3));
    // Every face of a rough part is flat: its three corners share one normal.
    const { normal } = peak.geometry.attributes;
    for (let i = 0; i < normal.count; i += 3) for (const k of [1, 2]) expect(Math.abs(normal.getX(i) - normal.getX(i + k)) + Math.abs(normal.getY(i) - normal.getY(i + k)) + Math.abs(normal.getZ(i) - normal.getZ(i + k))).toBeLessThan(1e-6);
  });

  it("stands one of the temple's columns to its capital, 6 m up, and breaks the other, its drums and its capital fallen between the two", () => {
    const { position, color } = stillOf("Samson And Delilah")[0].geometry.attributes, flute = new THREE.Color(0xa9a59c);
    let standing = -Infinity, fallen = 0, fallenTop = -Infinity;
    for (let i = 0; i < position.count; i++) {
      // The standing column is at x -1.6 and the broken one at 1.6, each within 0.9 m of its own line at its foot.
      if (Math.abs(position.getX(i) + 1.6) < 0.9 && Math.abs(position.getZ(i)) < 0.9) standing = Math.max(standing, position.getY(i));
      // Between the two columns' bases lie the fluted pieces that fell: two drums and the capital on them, under a bear's knee.
      if (Math.abs(position.getX(i)) < 0.74 && position.getY(i) < 1.3 && Math.abs(color.getX(i) - flute.r) + Math.abs(color.getY(i) - flute.g) + Math.abs(color.getZ(i) - flute.b) < 1e-4) { fallen += 1; fallenTop = Math.max(fallenTop, position.getY(i)); }
    }
    expect(standing).toBeGreaterThan(5.9);
    expect(fallen).toBeGreaterThan(150);
    // The capital lies on the drums: the heap's top is over the higher drum's, 0.67 m up.
    expect(fallenTop).toBeGreaterThan(0.8);
  });

  it("gives a peak a round rim of eleven sides a metre under its ground, on a phone as on a desktop, and carries its foot straight on down a metre more", () => {
    for (const [title, r] of [["Cold Rain And Snow", 3], ["Fire On The Mountain", 2.2]] as const) {
      for (const phone of [false, true]) {
        const { position } = stillOf(title, phone)[0].geometry.attributes, rim = new Set<string>(), foot = new Set<string>();
        for (let i = 0; i < position.count; i++) {
          // A corner's place to the millimetre, with no minus on a nought: the cone's seam closes at 0 and at a hair under it.
          const mm = (v: number) => Math.round(v * 1e3) / 1e3 + 0;
          const out = Math.hypot(position.getX(i), position.getZ(i)), y = position.getY(i), key = `${mm(position.getX(i))},${mm(position.getZ(i))}`;
          // The rim, the peak's outline from above: every corner at the rim's depth is on it or at the middle, and none anywhere
          // stands further out.
          expect(out).toBeLessThanOrEqual(r + 1e-4);
          if (Math.abs(y + 1) < 1e-4 && out > 0.1) { expect(out).toBeCloseTo(r, 4); rim.add(key); }
          // The skirt's foot, 2 m under: straight below the rim, so a slope's lower side shows stone and no daylight.
          if (Math.abs(y + 2) < 1e-4 && out > 0.1) { expect(out).toBeCloseTo(r, 4); foot.add(key); }
        }
        expect(rim.size).toBe(11);
        expect(foot).toEqual(rim);
      }
    }
  });

  it("keep inside the outline of the shapes they replace, on a desktop and on a phone, so each stands where its song's point is, and at the one place on both", () => {
    // How far each reaches from its own middle, seen from above: the slabs 2.09 m, the dodecahedron and the cone 3 m, the fire's
    // cone 2.2 m, the pillars and their lintel 2.82 m.
    const reach: Record<string, number> = { "My Brother Esau": 2.09, "Touch Of Grey": 3, "Cold Rain And Snow": 3, "Fire On The Mountain": 2.2, "Samson And Delilah": 2.82 };
    for (const phone of [false, true]) {
      for (const title of ROUGH) {
        let far = 0;
        for (const part of landmark(title, phone).parts.filter((c) => c.isMesh) as (Part & { position: { x: number; z: number } })[]) {
          const { position } = part.geometry.attributes;
          for (let i = 0; i < position.count; i++) far = Math.max(far, Math.hypot(position.getX(i) + part.position.x, position.getZ(i) + part.position.z));
        }
        expect(far).toBeLessThanOrEqual(reach[title] + 0.001);
      }
    }
    // The pinned show (1986-07-04, set 2 from track 7, where Cold Rain And Snow stands on the summit between two stretches of the
    // bears' line): its landmarks placed as main.js places them, on both tiers.
    const map = JSON.parse(readFileSync(new URL("../../../public/maps/1986-07-04.json", import.meta.url), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
    const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
    const path = buildPath(), landmarkU = layout(tracks, 7, path), line = buildWalkLine(path, 7);
    const stood = (phone: boolean) => placeLandmarks(new THREE.Scene(), path, tracks, true, makeBuilders(phone), landmarkU, line) as { position: { x: number; z: number } }[];
    const desktop = stood(false), phone = stood(true);
    for (const i of [5, 6, 7, 8, 9]) {
      expect(ROUGH.some((title) => tracks[i].title.startsWith(title))).toBe(true);
      const point = path.at(landmarkU[i]);
      // No further from its song's point than the plain shape stood: a metre at the most, on the summit.
      expect(Math.hypot(desktop[i].position.x - point.x, desktop[i].position.z - point.z)).toBeLessThanOrEqual(1.001);
      expect(Math.hypot(desktop[i].position.x - phone[i].position.x, desktop[i].position.z - phone[i].position.z)).toBeLessThan(0.01);
    }
  });

  it("leans the lintel from the standing column's capital to the broken shaft's top: it lies on both and in neither", () => {
    // The lintel is plain stone, as the columns' bases and the capital's slab are, and the one such part over 2.7 m up whose
    // corners stand within 0.75 m of the temple's line: the slab is 1.6 m square, its corners at z ±0.8. The capital's top is 6 m
    // up at x -2.4 to -0.8; the broken shaft's top is about 2.8 m up.
    const { position, color } = stillOf("Samson And Delilah")[0].geometry.attributes, corners: number[][] = [], stone = new THREE.Color(0x8e8a82);
    const seen = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i), key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (seen.has(key) || y < 2.7 || Math.abs(z) > 0.75) continue;
      if (Math.abs(color.getX(i) - stone.r) + Math.abs(color.getY(i) - stone.g) + Math.abs(color.getZ(i) - stone.b) > 1e-4) continue;
      seen.add(key);
      corners.push([x, y, z]);
    }
    expect(corners).toHaveLength(8);
    const upper = corners.filter(([x]) => x < 0).sort((p, q) => p[1] - q[1]), lower = corners.filter(([x]) => x > 0).sort((p, q) => p[1] - q[1]);
    expect(upper).toHaveLength(4);
    // Its underside runs between the two lower corners of each end. Where it crosses the capital's near edge (x -0.8, 6 m up) it is
    // just over it, so it lies on the edge and not in the slab; its upper end stands out past the edge, over the capital.
    const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [ux, uy] = mid(upper[0], upper[1]), [lx, ly] = mid(lower[0], lower[1]);
    const under = (x: number) => uy + ((x - ux) / (lx - ux)) * (ly - uy);
    expect(under(-0.8)).toBeGreaterThan(6);
    expect(under(-0.8)).toBeLessThan(6.12);
    expect(ux).toBeLessThan(-0.8);
    expect(ux).toBeGreaterThan(-2.4);
    // Its lower end comes down onto the broken shaft's top, 2.7 to 3.1 m up, past the standing column.
    expect(lower[0][1]).toBeGreaterThan(2.7);
    expect(lower[0][1]).toBeLessThan(3.1);
    expect(lx).toBeGreaterThan(1.4);
  });

  it("burns the fire's peak at its top on a phone as on a desktop", () => {
    for (const phone of [false, true]) {
      const burnt = faces(stillOf("Fire On The Mountain", phone)[0], 0x2a1d18);
      expect(burnt.n).toBeGreaterThan(4);
      expect(burnt.high).toBeCloseTo(5.2, 3);
    }
  });

  it("builds every part closed, and its stone rough: each edge is used once each way, and a boulder's corners stand at different distances out", () => {
    for (const phone of [false, true]) {
      for (const title of ROUGH) {
        const { position } = stillOf(title, phone)[0].geometry.attributes, edges = new Map<string, number>();
        // To a tenth of a millimetre, with no minus on a nought: a cone's seam closes at 0 and at a hair under it.
        const at = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
        const corner = (i: number) => `${at(position.getX(i))},${at(position.getY(i))},${at(position.getZ(i))}`;
        for (let i = 0; i < position.count; i += 3) for (let k = 0; k < 3; k++) {
          const a = corner(i + k), b = corner(i + ((k + 1) % 3));
          edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
        }
        for (const [edge, n] of edges) {
          const [a, b] = edge.split(">");
          expect(edges.get(`${b}>${a}`) ?? 0).toBe(n);
        }
      }
    }
    // The great boulder's own corners, about its middle 1.55 m up: no ball.
    const { position, color } = stillOf("Touch Of Grey")[0].geometry.attributes, grey = new THREE.Color(0x7d7a74);
    let near = Infinity, far = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(color.getX(i) - grey.r) + Math.abs(color.getY(i) - grey.g) + Math.abs(color.getZ(i) - grey.b) > 1e-4) continue;
      // A lesser boulder against it, at (-2, 0.15, 1.1), wears the same grey: its corners are left out.
      if (Math.hypot(position.getX(i) + 2, position.getY(i) - 0.15, position.getZ(i) - 1.1) < 0.9) continue;
      const out = Math.hypot(position.getX(i), (position.getY(i) - 1.55) / 0.85, position.getZ(i) / 0.94);
      if (out > 2.9) continue;
      near = Math.min(near, out); far = Math.max(far, out);
    }
    expect(far / near).toBeGreaterThan(1.1);
  });

  it("keeps the fire's flame and light as main builds them: one cone of six sides, 1 m by 2.4 m, and a light of 40 that reaches 30 m", () => {
    const { parts, moving } = landmark("Fire On The Mountain");
    const flame = (moving.find((m) => (m as { kind?: string }).kind === "swell") as { obj: Part & { material: { emissiveIntensity: number; color: { getHex(): number } } } }).obj;
    const reference = new THREE.ConeGeometry(1, 2.4, 6).translate(0, 1.2, 0);
    expect([...(flame.geometry.attributes.position as unknown as { array: Float32Array }).array]).toEqual([...reference.attributes.position.array]);
    expect(flame.material.emissiveIntensity).toBe(0.8);
    expect(flame.material.color.getHex()).toBe(0xff7a2a);
    const light = (moving.find((m) => (m as { kind?: string }).kind === "flame") as unknown as { obj: { isPointLight: boolean; intensity: number; distance: number; color: { getHex(): number }; position: { y: number } }; base: number });
    expect(light.obj.isPointLight).toBe(true);
    expect([light.obj.intensity, light.base, light.obj.distance, light.obj.color.getHex(), light.obj.position.y]).toEqual([40, 40, 30, 0xff8a3a, 6.5]);
    expect(parts).toContain(light.obj);
  });

  it("cost a few hundred triangles each, no more on a phone, and build the same on every visit", () => {
    for (const title of ROUGH) {
      const desktop = triangles(landmark(title).parts.filter((c) => c.isMesh)), phone = triangles(landmark(title, true).parts.filter((c) => c.isMesh));
      expect(desktop).toBeGreaterThan(150);
      expect(desktop).toBeLessThan(600);
      expect(phone).toBeLessThanOrEqual(desktop);
      const a = stillOf(title)[0].geometry.attributes.position, b = stillOf(title)[0].geometry.attributes.position;
      expect(a.count).toBe(b.count);
      for (let i = 0; i < a.count; i += 17) expect([a.getX(i), a.getY(i), a.getZ(i)]).toEqual([b.getX(i), b.getY(i), b.getZ(i)]);
    }
  });
});

describe("the standing stones", () => {
  // Every show's songs as its map has them, and the titles no rule matches: those get a standing stone.
  const shows = readdirSync(new URL("../../../public/maps", import.meta.url)).filter((file) => file.endsWith(".json")).sort().map((file) => {
    const map = JSON.parse(readFileSync(new URL(`../../../public/maps/${file}`, import.meta.url), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
    return { show: file.slice(0, -5), tracks: map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration })) };
  });
  const rules = builders(false).table, falls = (title: string) => !rules.some(([re]) => re.test(title));
  const fallers = [...new Set(shows.flatMap(({ tracks }) => tracks.map((t) => t.title).filter(falls)))];
  // Songs no show has played: a new map comes every day, and a title is its stone's every roll, so what is said of a kind's shape is
  // held to these too, sixty or so of each kind beside the twenty to thirty-six the maps have. Each bar below also held for 24,000 of
  // them, 3,000 of a kind, when it was set.
  const unplayed = (n: number) => `A Song No Show Has Played ${n}`, UNPLAYED = Array.from({ length: 480 }, (_, n) => unplayed(n));
  // The kinds in the order of a title's kind; a kind's titles in the maps (`real`), and those with the unplayed songs of the kind.
  const MENHIR = 0, SLAB = 1, SPLIT = 2, CAIRN = 3, TRILITHON = 4, PAIR = 5, STELE = 6, BOULDER = 7;
  const real = (kind: number) => fallers.filter((title) => stoneKind(title) === kind);
  const of = (kind: number) => [...real(kind), ...UNPLAYED.filter((title) => stoneKind(title) === kind)];
  // The plain block the stones replace: 1.6 m across the path, 1.2 m along it, 4.5 m tall.
  const BLOCK = { x: 0.8, z: 0.6, top: 4.5 }, SUNK = -1.6;
  type Corners = Part["geometry"]["attributes"]["position"];
  const stone = (title: string, phone = false) => landmark(title, phone).parts[0].geometry.attributes;
  // A stone's separate parts, lowest first: its corners joined, to a tenth of a millimetre, wherever a face joins them.
  type Piece = { low: number; high: number; x0: number; x1: number; z0: number; z1: number; corners: number[] };
  const piecesOf = (position: Corners): Piece[] => {
    const at = (v: number) => Math.round(v * 1e4), key = (i: number) => `${at(position.getX(i))},${at(position.getY(i))},${at(position.getZ(i))}`;
    const ids = new Map<string, number>(), parent: number[] = [];
    const find = (a: number): number => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const id = (i: number) => { const k = key(i); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k) as number; };
    for (let i = 0; i < position.count; i += 3) { const a = find(id(i)); parent[find(id(i + 1))] = a; parent[find(id(i + 2))] = a; }
    const pieces = new Map<number, Piece>();
    for (let i = 0; i < position.count; i++) {
      const root = find(id(i)), piece = pieces.get(root) ?? { low: Infinity, high: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, corners: [] };
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      pieces.set(root, { low: Math.min(piece.low, y), high: Math.max(piece.high, y), x0: Math.min(piece.x0, x), x1: Math.max(piece.x1, x), z0: Math.min(piece.z0, z), z1: Math.max(piece.z1, z), corners: [...piece.corners, i] });
    }
    return [...pieces.values()].sort((a, b) => a.low - b.low);
  };
  // A piece that comes down to the ground, and one laid on another.
  const grounded = (piece: Piece) => piece.low < 0.15;
  // The span across the path of a piece's corners between two heights.
  const across = (position: Corners, piece: Piece, from: number, to: number) => {
    const xs = piece.corners.filter((i) => position.getY(i) >= from && position.getY(i) <= to).map((i) => position.getX(i));
    return { x0: Math.min(...xs), x1: Math.max(...xs), n: xs.length };
  };
  // A piece's foot: the ring of corners 1.6 m under the ground. Its middle is the middle of the piece's own ground.
  const footOf = (position: Corners, piece: Piece) => across(position, piece, -2, -1.5);
  const middle = (span: { x0: number; x1: number }) => (span.x0 + span.x1) / 2;
  // A piece's highest corner.
  const tipOf = (position: Corners, piece: Piece) => piece.corners.reduce((best, i) => (position.getY(i) > position.getY(best) ? i : best));
  // How much stone is in a piece, in cubic metres, reckoned from its faces as they are wound: a piece built inside out gives less
  // than nothing.
  const volumeOf = (position: Corners, piece: Piece) => {
    const [a, b, c] = [0, 1, 2].map(() => new THREE.Vector3());
    let volume = 0;
    for (let n = 0; n < piece.corners.length; n += 3) {
      a.fromBufferAttribute(position, piece.corners[n]); b.fromBufferAttribute(position, piece.corners[n + 1]); c.fromBufferAttribute(position, piece.corners[n + 2]);
      volume += a.dot(b.cross(c)) / 6;
    }
    return volume;
  };
  // How far a stone's corners reach: across the path, along it, up and down; and how many of its corners lie on the block's sides,
  // which is where a corner that would have passed them is drawn back to.
  const reachOf = (position: Corners) => {
    let x = 0, z = 0, top = -Infinity, low = Infinity;
    const drawnBack = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      x = Math.max(x, Math.abs(position.getX(i))); z = Math.max(z, Math.abs(position.getZ(i)));
      top = Math.max(top, position.getY(i)); low = Math.min(low, position.getY(i));
      if (Math.abs(position.getX(i)) > BLOCK.x - 1e-6 || Math.abs(position.getZ(i)) > BLOCK.z - 1e-6) drawnBack.add(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
    return { x, z, top, low, drawnBack: drawnBack.size };
  };
  // A face's colour, as the tone it was painted from.
  const TONES = { grey: 0x7d7a74, pale: 0xa9a59c, bluestone: 0x6f7782, sandstone: 0x9a8c74 }, MOSS = 0x55663f, LICHEN = 0xa9a45c;
  const isTone = (color: Corners, i: number, hex: number) => { const tone = new THREE.Color(hex); return Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) < 1e-4; };

  it("gives a title its own number: the same for a song however its title is cased or marked, so a song has one stone", () => {
    expect(titleHash("Deal")).toBe(titleHash("Deal"));
    expect(titleHash("deal")).toBe(titleHash("Deal"));
    expect(titleHash("Deal ->")).toBe(titleHash("Deal"));
    expect(titleHash("Me And My Uncle ->")).toBe(titleHash("Me and My Uncle"));
    expect(titleHash("Deal")).not.toBe(titleHash("Loser"));
    // A title with no letter or digit, or none at all, is the empty one's.
    expect(titleHash("???")).toBe(titleHash(""));
    expect(titleHash(undefined)).toBe(titleHash(""));
    expect(STONE_KINDS).toBe(8);
    for (const title of [...fallers, ""]) {
      const h = titleHash(title), kind = stoneKind(title);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
      expect(kind).toBe(h % 8);
    }
  });

  it("spreads the songs over the eight kinds: each is used, none by more than a quarter of the titles, and a show of eight such songs has three kinds or more", () => {
    // 240 titles in the 38 maps of 2026-11-22: 21 to 36 of a kind.
    expect(fallers.length).toBeGreaterThanOrEqual(240);
    const counts = Array.from({ length: 8 }, (_, kind) => real(kind).length);
    for (const n of counts) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(fallers.length / 4);
    }
    // A show's songs are few and a new map comes every day, so the bar for one show is three kinds, where the maps so far have four
    // or more: eight songs drawn evenly land on two kinds or fewer once in 2,500 shows.
    for (const { show, tracks } of shows) {
      const titles = tracks.map((t) => t.title).filter(falls);
      if (titles.length >= 8) expect(new Set(titles.map(stoneKind)).size, show).toBeGreaterThanOrEqual(3);
    }
  });

  it("builds every such song's stone as one still mesh, closed, inside the block it replaces and standing 1.6 m into the ground, on a desktop and a phone", () => {
    for (const phone of [false, true]) {
      for (const title of fallers) {
        const { parts, moving } = landmark(title, phone);
        // One mesh, which neither glows nor moves: a stone costs what the block did.
        expect(parts, title).toHaveLength(1);
        expect(parts[0].material.emissive.getHex()).toBe(0);
        expect(moving).toHaveLength(0);
        const { position } = parts[0].geometry.attributes, edges = new Map<string, number>();
        // No corner passes the block's faces, seen from above or from the side: a landmark is stood off its song's point by its
        // outline (path.js), so a stone inside the block's stands no further off than the block did. To a float's width.
        const reach = reachOf(position);
        expect(reach.x, title).toBeLessThanOrEqual(BLOCK.x + 1e-6);
        expect(reach.z, title).toBeLessThanOrEqual(BLOCK.z + 1e-6);
        expect(reach.top, title).toBeLessThanOrEqual(BLOCK.top + 1e-6);
        expect(reach.low, title).toBeCloseTo(SUNK, 5);
        // And each is made to fit: the block's sides cut nothing off it. At most a corner or two is drawn back to them, by a hair
        // (one corner at the most in 24,000 unplayed songs), where a stone made too broad would show a sawn face.
        expect(reach.drawnBack, title).toBeLessThanOrEqual(2);
        // Every piece that comes down to the ground goes on down to the same depth: none ends where a slope's lower side would
        // show under it. A piece laid on another starts well up, over any ground that rises against the stone. And each piece's
        // faces look outward: there is stone in it, 0.02 cubic metres or more down to the least stone of a cairn.
        for (const piece of piecesOf(position)) {
          if (grounded(piece)) expect(piece.low, title).toBeCloseTo(SUNK, 5);
          else expect(piece.low, title).toBeGreaterThan(0.85);
          expect(volumeOf(position, piece), title).toBeGreaterThan(0.02);
        }
        // Closed: each edge is used once each way.
        const at = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
        const corner = (i: number) => `${at(position.getX(i))},${at(position.getY(i))},${at(position.getZ(i))}`;
        for (let i = 0; i < position.count; i += 3) for (let k = 0; k < 3; k++) {
          const a = corner(i + k), b = corner(i + ((k + 1) % 3));
          edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
        }
        for (const [edge, n] of edges) {
          const [a, b] = edge.split(">");
          if ((edges.get(`${b}>${a}`) ?? 0) !== n) expect.fail(`${title}${phone ? " on a phone" : ""}: an open edge ${edge}`);
        }
      }
    }
  }, 60_000);

  it("costs at most 160 triangles a stone on a desktop and 110 on a phone, and a phone's no more than a desktop's", () => {
    for (const title of fallers) {
      const desktop = triangles(landmark(title).parts), phone = triangles(landmark(title, true).parts);
      expect(desktop, title).toBeLessThanOrEqual(160);
      expect(phone, title).toBeLessThanOrEqual(110);
      expect(phone, title).toBeLessThanOrEqual(desktop);
      expect(phone, title).toBeGreaterThanOrEqual(40);
    }
  });

  it("keeps a stone inside the block whatever its title, and cuts nothing off it: two thousand songs no map has yet, of every kind, on both tiers", () => {
    // A new map brings new titles every day, and a title is a stone's every roll. The block's faces, to a float's width.
    const kinds = new Set<number>();
    for (let n = 0; n < 2000; n++) {
      const title = unplayed(n);
      kinds.add(stoneKind(title));
      for (const phone of [false, true]) {
        const { position } = stone(title, phone), { x, z, top, low, drawnBack } = reachOf(position);
        if (x > BLOCK.x + 1e-6 || z > BLOCK.z + 1e-6 || top > BLOCK.top + 1e-6 || Math.abs(low - SUNK) > 1e-5) expect.fail(`"${title}"${phone ? " on a phone" : ""}: ${x} across, ${z} along, ${top} up, ${low} down`);
        if (drawnBack > 2) expect.fail(`"${title}"${phone ? " on a phone" : ""}: ${drawnBack} corners cut off at the block's sides`);
        if (position.count / 3 > (phone ? 110 : 160)) expect.fail(`"${title}"${phone ? " on a phone" : ""}: ${position.count / 3} triangles`);
      }
    }
    expect(kinds.size).toBe(8);
  }, 60_000);

  it("builds eight kinds that are eight, each the same for every title in how it is made, and a title's stone the same on every visit", () => {
    // How a kind is made: its triangles on a desktop and on a phone, and its pieces. Every title of a kind shares it; no two kinds do.
    const made = (title: string) => `${triangles(landmark(title).parts)}/${triangles(landmark(title, true).parts)}/${piecesOf(stone(title).position).length}`;
    const kinds = Array.from({ length: 8 }, (_, kind) => new Set(of(kind).map(made)));
    for (const kind of kinds) expect(kind.size).toBe(1);
    expect(new Set(kinds.map((kind) => [...kind][0])).size).toBe(8);
    expect(kinds.map((kind) => [...kind][0])).toEqual(["84/60/1", "80/48/1", "140/80/2", "136/110/6", "132/80/3", "108/70/2", "80/80/1", "128/110/2"]);
    for (const title of fallers) {
      const a = stone(title), b = stone(title);
      expect(a.position.count).toBe(b.position.count);
      for (let i = 0; i < a.position.count; i += 17) {
        expect([a.position.getX(i), a.position.getY(i), a.position.getZ(i)]).toEqual([b.position.getX(i), b.position.getY(i), b.position.getZ(i)]);
        expect([a.color.getX(i), a.color.getY(i), a.color.getZ(i)]).toEqual([b.color.getX(i), b.color.getY(i), b.color.getZ(i)]);
      }
    }
  });

  it("makes two songs' stones of one kind differ: in their corners, in their height, in which way they turn, and in their tone", () => {
    for (let kind = 0; kind < 8; kind++) {
      const titles = real(kind), shapes = new Set<string>(), tops = new Set<number>(), tones = new Set<string>(), turns = new Set<number>();
      for (const title of titles) {
        const { position, color } = stone(title), pieces = piecesOf(position);
        shapes.add([0, 17, 34, 51].map((i) => `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`).join(";"));
        tops.add(Math.round(Math.max(...pieces.map((piece) => piece.high)) * 100));
        // Its tone: the commonest of the four on its lowest piece.
        const count = Object.entries(TONES).map(([name, hex]) => [name, pieces[0].corners.filter((i) => isTone(color, i, hex)).length] as const).sort((a, b) => b[1] - a[1]);
        tones.add(count[0][0]);
        // Which way it turns: the side of the block's middle that its highest corner stands on.
        turns.add(Math.sign(position.getX(tipOf(position, { ...pieces[0], corners: pieces.flatMap((piece) => piece.corners) }))));
      }
      // No two songs' alike (a song under two spellings is one song), and several heights among them; each kind has stones of at
      // least three of the four tones.
      expect(shapes.size, `kind ${kind}`).toBe(new Set(titles.map(titleHash)).size);
      expect(shapes.size, `kind ${kind}`).toBeGreaterThan(10);
      expect(tops.size, `kind ${kind}`).toBeGreaterThanOrEqual(4);
      expect(tones.size, `kind ${kind}`).toBeGreaterThanOrEqual(3);
      // The cairn's top stone, the boulder and the lintel stand over the middle; every other kind turns both ways.
      if (![CAIRN, TRILITHON, BOULDER].includes(kind)) expect([...turns].sort(), `kind ${kind}`).toEqual([-1, 1]);
    }
  });

  it("paints a stone in its tone, with faces a shade darker and lighter, and moss and lichen in patches over its foot", () => {
    // Where a face's middle lies, to half a metre: the patches' own grain.
    const seen = new Set<string>(), faced = new Set<string>(), overgrown = new Set<string>();
    for (const title of fallers) {
      const { position, color } = stone(title);
      let toned = 0, shaded = 0, grown = 0;
      for (let i = 0; i < position.count; i += 3) {
        const [x, y, z] = [position.getX, position.getY, position.getZ].map((get) => (get.call(position, i) + get.call(position, i + 1) + get.call(position, i + 2)) / 3);
        const cell = `${Math.round(x * 2)},${Math.round(y * 1.6)},${Math.round(z * 2)}`;
        if (y >= 0.3) faced.add(cell);
        const tone = Object.entries(TONES).find(([, hex]) => isTone(color, i, hex));
        if (tone) { seen.add(tone[0]); toned += 1; continue; }
        const growth = isTone(color, i, MOSS) ? "moss" : isTone(color, i, LICHEN) ? "lichen" : null;
        if (!growth) { shaded += 1; continue; }
        seen.add(growth);
        overgrown.add(cell);
        grown += 1;
        // Nothing grows on a face whose middle is under 0.3 m: the foot is in the ground.
        expect(y, `${title}: ${growth}`).toBeGreaterThanOrEqual(0.3);
      }
      // A stone shows its own tone and shades of it, and what grows on it never covers it (at most 51 % of its faces, as measured).
      expect(toned, title).toBeGreaterThan(0.1 * (position.count / 3));
      expect(shaded, title).toBeGreaterThan(0.1 * (position.count / 3));
      expect(grown, title).toBeLessThan(0.7 * (position.count / 3));
    }
    expect([...seen].sort()).toEqual(["bluestone", "grey", "lichen", "moss", "pale", "sandstone"]);
    // The patches lie where the title has them, not at the same places on every stone: on one stone or another something grows
    // nearly everywhere a face lies, where patches that every stone shared would cover a quarter of those places.
    expect(overgrown.size).toBeGreaterThan(0.8 * faced.size);
  });

  it("stands a menhir as the tallest of them, broad at the belly and narrowing to a point that stands off to one side", () => {
    for (const phone of [false, true]) {
      for (const title of of(MENHIR)) {
        const { position } = stone(title, phone), [piece, ...more] = piecesOf(position);
        expect(more).toHaveLength(0);
        expect(piece.high).toBeGreaterThan(4);
        const belly = across(position, piece, 0.2, 2), crown = across(position, piece, 0.85 * piece.high, piece.high);
        expect(belly.x1 - belly.x0).toBeGreaterThan(1.1);
        expect(crown.x1 - crown.x0).toBeLessThan(0.5 * (belly.x1 - belly.x0));
        // Its point: the one highest corner, a quarter of a metre or more from over its foot's middle.
        expect(Math.abs(position.getX(tipOf(position, piece)) - middle(footOf(position, piece)))).toBeGreaterThan(0.25);
      }
    }
  });

  it("leans the slab: broad to the walker and thin, its top half a metre or more to one side of its foot", () => {
    for (const phone of [false, true]) {
      for (const title of of(SLAB)) {
        const { position } = stone(title, phone), [piece, ...more] = piecesOf(position);
        expect(more).toHaveLength(0);
        // Thin along the path, and broad across it at every height.
        expect(piece.z1 - piece.z0).toBeLessThan(0.62);
        const foot = footOf(position, piece), top = across(position, piece, 0.9 * piece.high, piece.high);
        expect(foot.x1 - foot.x0).toBeGreaterThan(0.8);
        expect(foot.x1 - foot.x0).toBeGreaterThan(1.4 * (piece.z1 - piece.z0));
        // The lean: the middle of its top against the middle of its foot. A slab that stood straight would give 0 (0.63 to 0.83 m).
        const lean = middle(top) - middle(foot);
        expect(Math.abs(lean), title).toBeGreaterThan(0.5);
        expect(Math.abs(lean), title).toBeLessThan(1);
      }
    }
  });

  it("splits the split stone: two halves that stand on one foot and lean apart, the crack shut at the ground and open above with matching faces, one half a little the shorter", () => {
    for (const phone of [false, true]) {
      for (const title of of(SPLIT)) {
        const { position } = stone(title, phone), pieces = piecesOf(position);
        // Two halves, each a closed piece down to its foot.
        expect(pieces, title).toHaveLength(2);
        expect(pieces.every(grounded)).toBe(true);
        const [left, right] = [...pieces].sort((a, b) => a.x0 - b.x0), lower = Math.min(left.high, right.high);
        // The crack between two heights: from the left half's corners to the right's, and the middle of it.
        const gap = (from: number, to: number) => across(position, right, from, to).x0 - across(position, left, from, to).x1;
        const line = (from: number, to: number) => (across(position, right, from, to).x0 + across(position, left, from, to).x1) / 2;
        // One foot: to 0.45 m over the ground the halves meet, with no crack between them. They lie a few millimetres into each
        // other there, so that no face of one lies in a face of the other.
        expect(gap(-2, 0.45), title).toBeLessThan(-0.001);
        expect(gap(-2, 0.45), title).toBeGreaterThan(-0.02);
        // Over three quarters of the way up the shorter half the sky shows through, a forearm wide or more (0.37 to 0.43 m).
        expect(gap(0.75 * lower, 9), title).toBeGreaterThan(0.3);
        expect(gap(0.75 * lower, 9), title).toBeLessThan(0.6);
        // The inner faces match: the crack's middle up there stands over the crack at the foot, to a hand.
        expect(Math.abs(line(0.75 * lower, 9) - line(-2, 0.45)), title).toBeLessThan(0.08);
        // They lean apart: together the halves are a third of a metre or more broader up there than their one foot is.
        const foot = footOf(position, right).x1 - footOf(position, left).x0, top = across(position, right, 0.75 * lower, 9).x1 - across(position, left, 0.75 * lower, 9).x0;
        expect(foot, title).toBeLessThan(1.1);
        expect(top - foot, title).toBeGreaterThan(0.25);
        // One half stands over the other, by a little: 0.2 to 0.5 m, where the pair's two stand 1.9 m apart in height.
        expect(Math.abs(left.high - right.high), title).toBeGreaterThan(0.2);
        expect(Math.abs(left.high - right.high), title).toBeLessThan(0.5);
      }
    }
  });

  it("piles the cairn: a great stone in the ground and four or five on it, each resting in the one under, smaller than it, and none afloat", () => {
    for (const phone of [false, true]) {
      for (const title of of(CAIRN)) {
        const { position, color } = stone(title, phone), pieces = piecesOf(position);
        expect(pieces, title).toHaveLength(phone ? 5 : 6);
        expect(pieces.map(grounded)).toEqual([true, ...pieces.slice(1).map(() => false)]);
        const tones = new Set<string>();
        pieces.forEach((piece, k) => {
          for (const [name, hex] of Object.entries(TONES)) if (piece.corners.some((i) => isTone(color, i, hex))) tones.add(name);
          if (k === 0) return;
          const under = pieces[k - 1], into = under.high - piece.low;
          // Its lowest corner is a little way into the one under: over it would be afloat, and deep in it would be sunk through.
          expect(into, `${title}: stone ${k}`).toBeGreaterThan(0.02);
          expect(into, `${title}: stone ${k}`).toBeLessThan(0.12);
          expect(into).toBeLessThan((piece.high - piece.low) / 2);
          // Smaller than the one under, with less stone in it, and over it: its middle within the other's breadth.
          expect(volumeOf(position, piece), `${title}: stone ${k}`).toBeLessThan(volumeOf(position, under));
          expect((piece.x0 + piece.x1) / 2).toBeGreaterThan(under.x0);
          expect((piece.x0 + piece.x1) / 2).toBeLessThan(under.x1);
        });
        // The pile is of stones of several tones: all four are there, though moss may cover the least of them.
        expect(tones.size, title).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("builds the trilithon: two uprights with a doorway between them, and a lintel that lies on both and overhangs them before and behind", () => {
    for (const phone of [false, true]) {
      for (const title of of(TRILITHON)) {
        const { position } = stone(title, phone), pieces = piecesOf(position);
        expect(pieces, title).toHaveLength(3);
        expect(pieces.map(grounded)).toEqual([true, true, false]);
        const [left, right] = pieces.slice(0, 2).sort((a, b) => a.x0 - b.x0), lintel = pieces[2];
        // The doorway: half a metre of sky or more between the uprights, all the way up.
        expect(right.x0 - left.x1, title).toBeGreaterThan(0.45);
        // The lintel reaches over both uprights' middles, lies a little way into the top of each, and is no deeper in than a quarter
        // of a metre: on neither does it float.
        expect(lintel.x0).toBeLessThan((left.x0 + left.x1) / 2);
        expect(lintel.x1).toBeGreaterThan((right.x0 + right.x1) / 2);
        for (const upright of [left, right]) {
          expect(upright.high - lintel.low, title).toBeGreaterThan(0.02);
          expect(upright.high - lintel.low, title).toBeLessThan(0.25);
          expect(lintel.z1).toBeGreaterThan(upright.z1 + 0.02);
          expect(lintel.z0).toBeLessThan(upright.z0 - 0.02);
        }
        // One upright is the taller, and the lintel is a thick stone.
        expect(Math.abs(left.high - right.high)).toBeGreaterThan(0.05);
        expect(lintel.high - lintel.low).toBeGreaterThan(0.4);
      }
    }
  });

  it("stands the pair a hand apart: a tall stone that leans its point toward a short one", () => {
    for (const phone of [false, true]) {
      for (const title of of(PAIR)) {
        const { position } = stone(title, phone), pieces = piecesOf(position);
        expect(pieces, title).toHaveLength(2);
        expect(pieces.every(grounded)).toBe(true);
        const [left, right] = [...pieces].sort((a, b) => a.x0 - b.x0), [short, tall] = [...pieces].sort((a, b) => a.high - b.high);
        expect(tall.high - short.high, title).toBeGreaterThan(1.5);
        // The gap between them up to the short one's shoulder: a hand to a forearm.
        const gap = across(position, right, -2, 1.5).x0 - across(position, left, -2, 1.5).x1;
        expect(gap, title).toBeGreaterThan(0.08);
        expect(gap, title).toBeLessThan(0.35);
        // The tall one's point stands nearer the short one than the middle of its own foot does, by a hand or more (0.2 m).
        const foot = middle(footOf(position, tall)), toShort = Math.sign(middle(short) - foot);
        expect((position.getX(tipOf(position, tall)) - foot) * toShort, title).toBeGreaterThan(0.1);
      }
    }
  });

  it("works the stele: squared, on a foot whose step is 0.9 m up whatever its height, with a band cut round it, a collar and a pointed cap", () => {
    for (const phone of [false, true]) {
      for (const title of of(STELE)) {
        const { position, color } = stone(title, phone), pieces = piecesOf(position);
        expect(pieces, title).toHaveLength(1);
        // Its levels, from the foot up: the corners at one height, to a centimetre (a worked stone's rings are level), and how far
        // they stand out along the path, which way it has not settled.
        const levels = new Map<number, Set<string>>();
        for (let i = 0; i < position.count; i++) {
          const y = Math.round(position.getY(i) * 100);
          levels.set(y, (levels.get(y) ?? new Set()).add(`${position.getX(i).toFixed(4)},${position.getZ(i).toFixed(4)}`));
        }
        const rings = [...levels].sort((a, b) => a[0] - b[0]).map(([y, corners]) => {
          const outs = [...corners].map((c) => Math.abs(Number(c.split(",")[1])));
          return { y: y / 100, n: corners.size, out: Math.max(...outs), inn: Math.min(...outs) };
        });
        // Squared: every level is four corners, or two rings of four where a step or a cut is level, or a point.
        for (const ring of rings.slice(1, -1)) expect([4, 8], `${title} at ${ring.y}`).toContain(ring.n);
        // The step: eight corners exactly 0.9 m up, the foot's four standing 6 cm or more outside the shaft's.
        const step = rings.find((ring) => Math.abs(ring.y - 0.9) < 1e-6);
        expect(step?.n, title).toBe(8);
        expect((step as { out: number }).out - (step as { inn: number }).inn).toBeGreaterThan(0.06);
        // Over the step, three more levels where one ring stands 3 cm or more inside another: the band's foot and its top, a hand
        // apart, and well over them the collar's foot.
        const cuts = rings.filter((ring) => ring.y > 1 && ring.n === 8);
        expect(cuts, title).toHaveLength(3);
        for (const cut of cuts) expect(cut.out - cut.inn, `${title} at ${cut.y}`).toBeGreaterThan(0.03);
        expect(cuts[1].y - cuts[0].y).toBeGreaterThan(0.15);
        expect(cuts[1].y - cuts[0].y).toBeLessThan(0.25);
        expect(cuts[2].y - cuts[1].y).toBeGreaterThan(0.6);
        // The band is cut in: across it the stele is as narrow as the inner ring at either end. The collar stands out: the level
        // over its foot is as wide as the foot's outer ring.
        expect(Math.abs(cuts[0].inn - cuts[1].inn)).toBeLessThan(0.02);
        expect(rings[rings.length - 2].n).toBe(4);
        expect(rings[rings.length - 2].inn).toBeGreaterThan(cuts[2].inn + 0.03);
        const cap = rings[rings.length - 1];
        expect(cap.n).toBe(1);
        expect(cap.y).toBeGreaterThan(4);
        // The cuts are paler than any weathered face: the band's faces and the cap's are in no tone, moss or lichen.
        let cut = 0;
        for (let i = 0; i < position.count; i += 3) {
          const paler = [...Object.values(TONES), MOSS, LICHEN].every((hex) => !isTone(color, i, hex)) && Object.values(TONES).some((hex) => color.getX(i) > new THREE.Color(hex).r * 1.3 && color.getX(i) < new THREE.Color(hex).r * 1.9);
          if (paler) cut += 1;
        }
        // The band's eight faces and the cap's four.
        expect(cut, title).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("balances the boulder: a great round stone at rest on the top of a narrow one, about twice its breadth", () => {
    for (const phone of [false, true]) {
      for (const title of of(BOULDER)) {
        const { position } = stone(title, phone), pieces = piecesOf(position);
        expect(pieces, title).toHaveLength(2);
        const [stand, boulder] = pieces;
        expect(grounded(stand)).toBe(true);
        // It rests a little way into the stand's top, 1.4 m up or more.
        expect(boulder.low, title).toBeGreaterThan(1.3);
        expect(stand.high - boulder.low, title).toBeGreaterThan(0.02);
        expect(stand.high - boulder.low, title).toBeLessThan(0.12);
        // The stand narrows as it rises, and the boulder is about twice as broad as the stand's top (1.9 to 2.6 times).
        const foot = footOf(position, stand), neck = across(position, stand, 0.8 * stand.high, stand.high);
        expect(neck.x1 - neck.x0).toBeLessThan(0.8 * (foot.x1 - foot.x0));
        expect(boulder.x1 - boulder.x0, title).toBeGreaterThan(1.7 * (neck.x1 - neck.x0));
        expect(boulder.x1 - boulder.x0).toBeGreaterThan(1.2);
        expect(boulder.high - boulder.low).toBeGreaterThan(1.2);
      }
    }
  });

  // Every show placed as main.js places it, on both tiers, with no second set and with one that opens half way through: the maps do
  // not hold where set 2 begins, and it moves every landmark along the path.
  const path = buildPath(), line = buildWalkLine(path, 7);
  const placed = (tracks: { title: string; duration: number }[], set2Start: number | null, phone: boolean, block = false) => {
    const made = makeBuilders(phone), landmarkU = layout(tracks, set2Start, path);
    // The plain block that main builds for every such song.
    const plain = (g: { add(part: unknown): void }) => g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true }), 0, 2.25, 0));
    const landmarks = placeLandmarks(new THREE.Scene(), path, tracks, true, block ? { ...made, standingStone: plain } : made, landmarkU, line) as unknown as { position: { x: number; y: number; z: number }; rotation: { y: number }; children: Part[] }[];
    return landmarks.map((g, i) => { const point = path.at(landmarkU[i]); return { g, off: Math.hypot(g.position.x - point.x, g.position.z - point.z) }; });
  };
  // What a title's stone is, kept from one show to the next: how many faces it has, and which of its corners are a laid stone's.
  const facts = new Map<string, { faces: number; laid: Set<number> }>();
  const factsOf = (title: string, phone: boolean) => {
    const key = `${phone}:${title}`;
    if (!facts.has(key)) {
      const { position } = stone(title, phone);
      facts.set(key, { faces: position.count / 3, laid: new Set(piecesOf(position).filter((piece) => !grounded(piece)).flatMap((piece) => piece.corners)) });
    }
    return facts.get(key) as { faces: number; laid: Set<number> };
  };
  const faces = (title: string, phone: boolean) => factsOf(title, phone).faces, laidOf = (title: string, phone: boolean) => factsOf(title, phone).laid;
  const stands = (visit: (show: string, phone: boolean, set2Start: number | null, tracks: { title: string; duration: number }[]) => void) => {
    for (const { show, tracks } of shows) for (const phone of [false, true]) for (const set2Start of [null, Math.floor(tracks.length / 2)]) visit(show, phone, set2Start, tracks);
  };

  it("stands each stone where its song's title has it, and no further from its song's point than the plain block stood, in every show", () => {
    let stones = 0;
    stands((show, phone, set2Start, tracks) => {
      const now = placed(tracks, set2Start, phone), was = placed(tracks, set2Start, phone, true);
      tracks.forEach(({ title }, i) => {
        if (!falls(title)) return;
        stones += 1;
        const where = `${show}, song ${i}, "${title}"${phone ? " on a phone" : ""}, set 2 from ${set2Start}`;
        // The stone placed is the title's own: path.js hands the builder the title.
        if (triangles(now[i].g.children) !== faces(title, phone)) expect.fail(`${where}: not its title's stone`);
        if (now[i].off > was[i].off + 0.001) expect.fail(`${where}: ${now[i].off} m from its song's point, where the block stood ${was[i].off} m`);
      });
    });
    // 426 such songs in the 38 maps, placed four times each.
    expect(stones).toBeGreaterThanOrEqual(4 * 426);
  }, 60_000);

  it("stands level on sloping ground with no foot in the air and nothing of it buried, in every show", () => {
    let steepest = 0, shallowest = Infinity;
    stands((show, phone, set2Start, tracks) => {
      placed(tracks, set2Start, phone).forEach(({ g }, i) => {
        if (!falls(tracks[i].title)) return;
        const { position } = g.children[0].geometry.attributes, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), laid = laidOf(tracks[i].title, phone);
        const where = `${show}, song ${i}, "${tracks[i].title}"${phone ? " on a phone" : ""}, set 2 from ${set2Start}`;
        for (let n = 0; n < position.count; n++) {
          const x = position.getX(n), y = position.getY(n), z = position.getZ(n);
          // The ground under the corner, against the stone's own: the landmark is turned about the vertical and stands level.
          const ground = height(g.position.x + x * c + z * s, g.position.z - x * s + z * c) - g.position.y;
          steepest = Math.max(steepest, Math.abs(ground));
          // A foot's corner is half a metre or more under the ground beneath it, on the slope's lower side too.
          if (y < SUNK + 1e-3) {
            shallowest = Math.min(shallowest, ground - y);
            if (y > ground - 0.5) expect.fail(`${where}: a foot ${ground - y} m under the ground beneath it`);
          }
          // No corner of a stone laid on another is in the ground, and nothing 0.85 m up a stone or higher: the stele's step, the
          // cairn's first joint and the boulder all stay in sight on the slope's upper side.
          if ((laid.has(n) || y >= 0.85) && y <= ground) expect.fail(`${where}: a corner ${y} m up it lies ${ground - y} m in the ground`);
        }
      });
    });
    // The test has seen real slopes: somewhere the ground stands half a metre over or under a stone's own within its outline, and
    // the shallowest foot is still most of a metre down.
    expect(steepest).toBeGreaterThan(0.5);
    expect(shallowest).toBeGreaterThan(0.5);
    expect(shallowest).toBeLessThan(1.4);
  }, 60_000);
});
