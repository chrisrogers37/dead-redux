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
// A landmark as path.js builds it: the builder the title's rule names, run on a group, or the standing stone, which alone is built
// for the title. Its still parts are merged as it is built.
function landmark(title: string, phone = false) {
  const { table, standingStone, moving } = builders(phone);
  const g = new THREE.Group(), rule = table.find(([re]) => re.test(title));
  if (rule) rule[1](g);
  else standingStone(g, title);
  return { g, moving, parts: g.children as Part[] };
}
const triangles = (parts: Part[]) => parts.reduce((sum, part) => sum + part.geometry.attributes.position.count / 3, 0);
const bounds = (g: unknown) => new THREE.Box3().setFromObject(g);
type Corners = Part["geometry"]["attributes"]["position"];
// A corner's place to a tenth of a millimetre, with no minus on a nought: a cone's seam closes at 0 and at a hair under it.
const cornerKey = (position: Corners, i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map((v) => Math.round(v * 1e4) / 1e4 + 0).join(",");
// A mesh's open edges: it is closed when each edge its faces use one way is used as often the other way. With `once`, an edge used
// more than once either way is open too: a cone's faces meet twice at its tip, a stone's never do.
const openEdges = (position: Corners, once = false) => {
  const keys = Array.from({ length: position.count }, (_, i) => cornerKey(position, i)), edges = new Map<string, number>();
  for (let i = 0; i < position.count; i += 3) for (let k = 0; k < 3; k++) {
    const edge = `${keys[i + k]}>${keys[i + ((k + 1) % 3)]}`;
    edges.set(edge, (edges.get(edge) ?? 0) + 1);
  }
  return [...edges].filter(([edge, n]) => (edges.get(edge.split(">").reverse().join(">")) ?? 0) !== n || (once && n > 1)).map(([edge]) => edge);
};
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
        expect(openEdges(stillOf(title, phone)[0].geometry.attributes.position), title).toEqual([]);
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
  const tiers = [builders(false), builders(true)], falls = (title: string) => !tiers[0].table.some(([re]) => re.test(title));
  const fallers = [...new Set(shows.flatMap(({ tracks }) => tracks.map((t) => t.title).filter(falls)))];
  // The kinds in the order of a title's kind, and a kind's titles in the maps.
  const MENHIR = 0, SLAB = 1, SPLIT = 2, CAIRN = 3, TRILITHON = 4, PAIR = 5, STELE = 6, BOULDER = 7, KINDS = [0, 1, 2, 3, 4, 5, 6, 7];
  const real = (kind: number) => fallers.filter((title) => stoneKind(title) === kind);
  // Songs no show has played, forty of each kind, the first that a count to 4,000 finds: a new map comes every day, and a title is
  // its stone's every roll, so what is said of a stone is held to these too. Each bar below also held for 3,000 of a kind when it
  // was set.
  const UNPLAYED = KINDS.map((): string[] => []);
  for (let n = 0; n < 4000 && UNPLAYED.some((titles) => titles.length < 40); n++) {
    const title = `A Song No Show Has Played ${n}`, titles = UNPLAYED[stoneKind(title)];
    if (titles.length < 40) titles.push(title);
  }
  const of = (kind: number) => [...real(kind), ...UNPLAYED[kind]], EVERY = [...fallers, ...UNPLAYED.flat()];
  // The plain block the stones replace: 1.6 m across the path, 1.2 m along it, 4.5 m tall, and a foot's depth.
  const BLOCK = { x: 0.8, z: 0.6, top: 4.5 }, SUNK = -1.6;

  // A stone's separate pieces, lowest first: its corners joined wherever a face joins them.
  type Piece = { low: number; high: number; x0: number; x1: number; z0: number; z1: number; corners: number[] };
  const piecesOf = (position: Corners): Piece[] => {
    const ids = new Map<string, number>(), parent: number[] = [];
    const find = (a: number): number => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const id = (i: number) => { const k = cornerKey(position, i); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k) as number; };
    for (let i = 0; i < position.count; i += 3) { const a = find(id(i)); parent[find(id(i + 1))] = a; parent[find(id(i + 2))] = a; }
    const pieces = new Map<number, Piece>();
    for (let i = 0; i < position.count; i++) {
      const root = find(id(i)), x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (!pieces.has(root)) pieces.set(root, { low: Infinity, high: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, corners: [] });
      const piece = pieces.get(root) as Piece;
      piece.low = Math.min(piece.low, y); piece.high = Math.max(piece.high, y); piece.x0 = Math.min(piece.x0, x); piece.x1 = Math.max(piece.x1, x);
      piece.z0 = Math.min(piece.z0, z); piece.z1 = Math.max(piece.z1, z); piece.corners.push(i);
    }
    return [...pieces.values()].sort((a, b) => a.low - b.low);
  };
  // A title's stone on a tier, built once for every test that reads it, with its pieces.
  type Stone = { parts: Part[]; position: Corners; color: Corners; pieces: Piece[]; faces: number };
  const build = (title: string, phone: boolean) => { const g = new THREE.Group(); tiers[phone ? 1 : 0].standingStone(g, title); return g.children as Part[]; };
  const stones = new Map<string, Stone>();
  const stone = (title: string, phone = false) => {
    const key = `${phone}:${title}`;
    if (!stones.has(key)) {
      const parts = build(title, phone), { position, color } = parts[0].geometry.attributes;
      stones.set(key, { parts, position, color, pieces: piecesOf(position), faces: position.count / 3 });
    }
    return stones.get(key) as Stone;
  };
  // A piece that comes down to the ground, and one laid on another.
  const grounded = (piece: Piece) => piece.low < 0.15;
  // The span across the path of a piece's corners between two heights, and its breadth and middle.
  const across = (position: Corners, piece: Piece, from: number, to: number) => {
    const xs = piece.corners.filter((i) => position.getY(i) >= from && position.getY(i) <= to).map((i) => position.getX(i));
    return { x0: Math.min(...xs), x1: Math.max(...xs) };
  };
  const breadth = (span: { x0: number; x1: number }) => span.x1 - span.x0, middle = (span: { x0: number; x1: number }) => (span.x0 + span.x1) / 2;
  // A piece's foot: the ring of corners 1.6 m under the ground. Its middle is the middle of the piece's own ground.
  const footOf = (position: Corners, piece: Piece) => across(position, piece, -2, -1.5);
  // How squared a piece's foot is: for each corner of its foot's ring that stands off both of the foot's middle lines, how far out it
  // stands across the path times how far along it, as shares of the foot's own half-breadth and half-depth, and the mean of those. A
  // round foot gives a half; one squared at its corners, seven tenths.
  const squareness = (position: Corners, piece: Piece) => {
    const ring = [...new Set(piece.corners.filter((i) => position.getY(i) < SUNK + 1e-3).map((i) => `${position.getX(i)},${position.getZ(i)}`))].map((corner) => corner.split(",").map(Number));
    const xs = ring.map(([x]) => x), zs = ring.map(([, z]) => z), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const hx = (Math.max(...xs) - Math.min(...xs)) / 2, hz = (Math.max(...zs) - Math.min(...zs)) / 2;
    const off = ring.map(([x, z]) => [Math.abs(x - cx) / hx, Math.abs(z - cz) / hz]).filter(([x, z]) => x > 0.2 && z > 0.2);
    return off.reduce((sum, [x, z]) => sum + x * z, 0) / off.length;
  };
  // The highest corner among some.
  const tipOf = (position: Corners, corners: number[]) => corners.reduce((best, i) => (position.getY(i) > position.getY(best) ? i : best));
  // How much stone is in a piece, in cubic metres, reckoned from its faces as they are wound: a piece built inside out gives less
  // than nothing. And its least face, in square metres.
  const [a, b, c] = [0, 1, 2].map(() => new THREE.Vector3());
  const face = (position: Corners, corners: number[], n: number) => { a.fromBufferAttribute(position, corners[n]); b.fromBufferAttribute(position, corners[n + 1]); c.fromBufferAttribute(position, corners[n + 2]); };
  const volumeOf = (position: Corners, piece: Piece) => {
    let volume = 0;
    for (let n = 0; n < piece.corners.length; n += 3) { face(position, piece.corners, n); volume += a.dot(b.cross(c)) / 6; }
    return volume;
  };
  const leastFace = (position: Corners, piece: Piece) => {
    let least = Infinity;
    for (let n = 0; n < piece.corners.length; n += 3) { face(position, piece.corners, n); least = Math.min(least, b.sub(a).cross(c.sub(a)).length() / 2); }
    return least;
  };
  // A face's colour, as the tone it was painted from.
  const TONES = { grey: 0x7d7a74, pale: 0xa9a59c, bluestone: 0x6f7782, sandstone: 0x9a8c74 }, MOSS = 0x55663f, LICHEN = 0xa9a45c;
  const isTone = (color: Corners, i: number, hex: number) => { const tone = new THREE.Color(hex); return Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) < 1e-4; };
  const weathered = (color: Corners, i: number) => [...Object.values(TONES), MOSS, LICHEN].some((hex) => isTone(color, i, hex));
  // A piece's own tone: the commonest of the four on its corners.
  const toneOf = (color: Corners, piece: Piece) => Object.entries(TONES).map(([name, hex]) => ({ name, hex, n: piece.corners.filter((i) => isTone(color, i, hex)).length })).sort((p, q) => q.n - p.n)[0];

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
    for (const kind of KINDS) {
      expect(real(kind).length).toBeGreaterThan(0);
      expect(real(kind).length).toBeLessThanOrEqual(fallers.length / 4);
      // And of 4,000 songs no show has played, forty are of each kind long before the count ends: the tests below have them.
      expect(UNPLAYED[kind], `kind ${kind}`).toHaveLength(40);
    }
    // A show's songs are few and a new map comes every day, so the bar for one show is three kinds, where the maps so far have four
    // or more: eight songs drawn evenly land on two kinds or fewer once in 2,500 shows.
    for (const { show, tracks } of shows) {
      const titles = tracks.map((t) => t.title).filter(falls);
      if (titles.length >= 8) expect(new Set(titles.map(stoneKind)).size, show).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every stone inside the block it replaces, whatever its title: no corner passes the block's faces, on a desktop or a phone", () => {
    // A landmark is stood off its song's point by its outline (path.js), so a stone inside the block's stands no further off than the
    // block did. Nothing trims a stone: its kind's own numbers keep it there. To a float's width.
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const { position } = stone(title, phone);
        let x = 0, z = 0, top = -Infinity;
        for (let i = 0; i < position.count; i++) { x = Math.max(x, Math.abs(position.getX(i))); z = Math.max(z, Math.abs(position.getZ(i))); top = Math.max(top, position.getY(i)); }
        if (x > BLOCK.x + 1e-6 || z > BLOCK.z + 1e-6 || top > BLOCK.top + 1e-6) expect.fail(`"${title}"${phone ? " on a phone" : ""}: ${x} m across, ${z} m along, ${top} m up`);
      }
    }
  });

  it("builds every stone as one still mesh whose pieces are closed, with their faces outward and none of no area, each standing 1.6 m into the ground or laid well up on another", () => {
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const { parts, position, pieces } = stone(title, phone), where = `"${title}"${phone ? " on a phone" : ""}`;
        // One mesh, which neither glows nor moves: a stone costs what the block did.
        expect(parts, where).toHaveLength(1);
        expect(parts[0].material.emissive.getHex(), where).toBe(0);
        // Closed, edge for edge, each edge used once each way: a piece with a face missing, or built of faces that do not meet, is
        // open. The split stone's halves are closed so too, with the faces that folding left without area taken out of them.
        expect(openEdges(position, true), where).toEqual([]);
        for (const piece of pieces) {
          // A piece that comes down to the ground goes on down 1.6 m: none ends where a slope's lower side would show under it. A
          // piece laid on another starts over any ground that rises against the stone, which is 0.75 m at the most (the slopes' test).
          if (grounded(piece)) expect(piece.low, where).toBeCloseTo(SUNK, 5);
          else expect(piece.low, where).toBeGreaterThan(0.85);
          // Its faces look outward: there is stone in it, 0.02 cubic metres or more down to the least stone of a cairn.
          expect(volumeOf(position, piece), where).toBeGreaterThan(0.02);
          // And no face is a line or a point: a face folded to nothing would still be drawn. The least face of 48,000 stones is a
          // tenth of a square centimetre, in a split stone; the bar is a thousandth of that.
          expect(leastFace(position, piece), where).toBeGreaterThan(1e-8);
        }
      }
    }
    expect(tiers[0].moving).toHaveLength(0);
    expect(tiers[1].moving).toHaveLength(0);
  });

  it("costs at most 160 triangles a stone on a desktop and 110 on a phone, and a phone's no more than a desktop's", () => {
    for (const title of EVERY) {
      const desktop = stone(title).faces, phone = stone(title, true).faces;
      if (desktop > 160 || phone > 110 || phone > desktop || phone < 40) expect.fail(`"${title}": ${desktop} triangles on a desktop, ${phone} on a phone`);
    }
  });

  it("builds eight kinds that are eight, each made the same way for every title, and a title's stone the same on every visit", () => {
    // How a kind is made: its triangles on a desktop and on a phone, and its pieces. Every title of a kind shares it; no two kinds do.
    const made = KINDS.map((kind) => new Set(of(kind).map((title) => `${stone(title).faces}/${stone(title, true).faces}/${stone(title).pieces.length}`)));
    for (const ways of made) expect(ways.size).toBe(1);
    expect(new Set(made.map((ways) => [...ways][0])).size).toBe(8);
    // Built again, corner for corner and colour for colour.
    for (const phone of [false, true]) {
      for (const title of fallers) {
        const first = stone(title, phone), again = build(title, phone)[0].geometry.attributes;
        expect(again.position.count).toBe(first.position.count);
        for (let i = 0; i < again.position.count; i += 17) {
          expect([again.position.getX(i), again.position.getY(i), again.position.getZ(i)]).toEqual([first.position.getX(i), first.position.getY(i), first.position.getZ(i)]);
          expect([again.color.getX(i), again.color.getY(i), again.color.getZ(i)]).toEqual([first.color.getX(i), first.color.getY(i), first.color.getZ(i)]);
        }
      }
    }
  });

  it("makes two songs' stones of one kind differ: in their corners, in their height, in which way they turn, and in their tone", () => {
    for (const kind of KINDS) {
      const titles = real(kind), shapes = new Set<string>(), tops = new Set<number>(), tones = new Set<string>(), turns = new Set<number>();
      for (const title of titles) {
        const { position, color, pieces } = stone(title), all = pieces.flatMap((piece) => piece.corners);
        shapes.add([0, 17, 34, 51].map((i) => cornerKey(position, i)).join(";"));
        tops.add(Math.round(Math.max(...pieces.map((piece) => piece.high)) * 100));
        tones.add(toneOf(color, pieces[0]).name);
        // Which way it turns: the side of the block's middle that its highest corner stands on.
        turns.add(Math.sign(position.getX(tipOf(position, all))));
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
      const { position, color, faces } = stone(title);
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
      expect(toned, title).toBeGreaterThan(0.1 * faces);
      expect(shaded, title).toBeGreaterThan(0.1 * faces);
      expect(grown, title).toBeLessThan(0.7 * faces);
    }
    expect([...seen].sort()).toEqual(["bluestone", "grey", "lichen", "moss", "pale", "sandstone"]);
    // The patches lie where the title has them, not at the same places on every stone: on one stone or another something grows
    // nearly everywhere a face lies, where patches that every stone shared would cover a quarter of those places.
    expect(overgrown.size).toBeGreaterThan(0.8 * faced.size);
  });

  it("stands a menhir tall, broad at the belly and narrowing to a point that stands off to one side", () => {
    for (const phone of [false, true]) {
      for (const title of of(MENHIR)) {
        const { position, pieces } = stone(title, phone), [piece, ...more] = pieces;
        expect(more, title).toHaveLength(0);
        // Over twice as tall as its belly is broad, and its top fifth under half as broad as the belly.
        const belly = breadth(across(position, piece, 0.2, 2)), crown = breadth(across(position, piece, 0.85 * piece.high, piece.high));
        expect(piece.high, title).toBeGreaterThan(2 * belly);
        expect(crown, title).toBeLessThan(0.5 * belly);
        // Its point is the one highest corner, and stands to one side of the middle of its foot by a sixth of the belly or more.
        expect(Math.abs(position.getX(tipOf(position, piece.corners)) - middle(footOf(position, piece))), title).toBeGreaterThan(belly / 6);
      }
    }
  });

  it("leans the slab: broad to the walker, flat-faced and thin, its top well to one side of its foot", () => {
    for (const phone of [false, true]) {
      for (const title of of(SLAB)) {
        const { position, pieces } = stone(title, phone), [piece, ...more] = pieces;
        expect(more, title).toHaveLength(0);
        // Broad across the path at its foot, half as broad again as it is deep along it.
        const foot = footOf(position, piece), top = across(position, piece, 0.9 * piece.high, piece.high);
        expect(breadth(foot), title).toBeGreaterThan(1.4 * (piece.z1 - piece.z0));
        // And a slab, not a pillar: its foot is squared at its corners, so its face to the walker is flat across its breadth.
        expect(squareness(position, piece), title).toBeGreaterThan(0.6);
        // The lean: the middle of its top stands off the middle of its foot by over half the foot's breadth. A slab that stood
        // straight would give nothing.
        expect(Math.abs(middle(top) - middle(foot)), title).toBeGreaterThan(0.5 * breadth(foot));
      }
    }
  });

  it("splits the split stone: two halves that stand on one foot and lean apart, the crack shut at the ground and open above with matching faces, one half a little the shorter", () => {
    for (const phone of [false, true]) {
      for (const title of of(SPLIT)) {
        const { position, pieces } = stone(title, phone);
        // Two halves, each a closed piece down to its foot.
        expect(pieces, title).toHaveLength(2);
        expect(pieces.every(grounded)).toBe(true);
        const [left, right] = [...pieces].sort((p, q) => p.x0 - q.x0), lower = Math.min(left.high, right.high);
        // The crack between two heights: from the left half's corners to the right's, and the line down the middle of it.
        const gap = (from: number, to: number) => across(position, right, from, to).x0 - across(position, left, from, to).x1;
        const line = (from: number, to: number) => (across(position, right, from, to).x0 + across(position, left, from, to).x1) / 2;
        const foot = footOf(position, right).x1 - footOf(position, left).x0, top = across(position, right, 0.75 * lower, 9).x1 - across(position, left, 0.75 * lower, 9).x0;
        // One foot: to 0.45 m over the ground the halves meet with no crack between them. They lie a hair into each other there, so
        // that no face of one lies in a face of the other.
        expect(gap(-2, 0.45), title).toBeLessThan(0);
        expect(gap(-2, 0.45), title).toBeGreaterThan(-0.05);
        // Over three quarters of the way up the shorter half the sky shows through: a crack a fifth as wide as the stone or more,
        // and narrower than the halves beside it.
        expect(gap(0.75 * lower, 9), title).toBeGreaterThan(0.2 * top);
        expect(gap(0.75 * lower, 9), title).toBeLessThan(0.4 * top);
        // The inner faces match: the crack's middle up there stands over the crack at the foot.
        expect(Math.abs(line(0.75 * lower, 9) - line(-2, 0.45)), title).toBeLessThan(0.05 * top);
        // They lean apart: together the halves are a fifth broader up there than their one foot is, or more.
        expect(top, title).toBeGreaterThan(1.2 * foot);
        // One half stands over the other by a little: more than a twentieth of its height and less than a fifth, where the pair's
        // tall stone is twice its short one.
        expect(Math.abs(left.high - right.high), title).toBeGreaterThan(0.05 * lower);
        expect(Math.abs(left.high - right.high), title).toBeLessThan(0.2 * lower);
      }
    }
  });

  it("piles the cairn: a great stone in the ground and four or more on it, each resting in the one under, smaller than it, and none afloat", () => {
    for (const title of of(CAIRN)) {
      // A phone's pile has a stone fewer, and never more.
      expect(stone(title, true).pieces.length, title).toBeLessThanOrEqual(stone(title).pieces.length);
      for (const phone of [false, true]) {
        const { position, color, pieces } = stone(title, phone);
        expect(pieces.length, title).toBeGreaterThanOrEqual(5);
        expect(pieces.map(grounded)).toEqual([true, ...pieces.slice(1).map(() => false)]);
        const tones = new Set<string>();
        pieces.forEach((piece, k) => {
          for (const [name, hex] of Object.entries(TONES)) if (piece.corners.some((i) => isTone(color, i, hex))) tones.add(name);
          if (k === 0) return;
          const under = pieces[k - 1], into = under.high - piece.low;
          // Its lowest corner is a little way into the one under: over it would be afloat, and half way through it would be sunk in.
          expect(into, `${title}: stone ${k}`).toBeGreaterThan(0);
          expect(into, `${title}: stone ${k}`).toBeLessThan((piece.high - piece.low) / 2);
          // Smaller than the one under, with less stone in it, and over it: its middle within the other's breadth.
          expect(volumeOf(position, piece), `${title}: stone ${k}`).toBeLessThan(volumeOf(position, under));
          expect(middle(piece)).toBeGreaterThan(under.x0);
          expect(middle(piece)).toBeLessThan(under.x1);
        });
        // The pile is of stones of several tones: all four are there, though moss may cover the least of them.
        expect(tones.size, title).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("builds the trilithon: two uprights with a doorway between them, and a lintel that lies on both and overhangs them before and behind", () => {
    for (const phone of [false, true]) {
      for (const title of of(TRILITHON)) {
        const { pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(3);
        expect(pieces.map(grounded)).toEqual([true, true, false]);
        const [left, right] = pieces.slice(0, 2).sort((p, q) => p.x0 - q.x0), lintel = pieces[2];
        // The doorway: sky between the uprights all the way up, about as wide as an upright is broad.
        expect(right.x0 - left.x1, title).toBeGreaterThan(0.8 * Math.max(breadth(left), breadth(right)));
        // The lintel reaches over both uprights' middles, a thick stone a quarter as deep as it is long.
        expect(lintel.x0).toBeLessThan(middle(left));
        expect(lintel.x1).toBeGreaterThan(middle(right));
        expect(lintel.high - lintel.low, title).toBeGreaterThan(0.25 * breadth(lintel));
        for (const upright of [left, right]) {
          // It lies a little way into the top of each upright, and under half its own depth: on neither does it float.
          expect(upright.high - lintel.low, title).toBeGreaterThan(0);
          expect(upright.high - lintel.low, title).toBeLessThan(0.5 * (lintel.high - lintel.low));
          // And it stands out past each, before it and behind.
          expect(lintel.z1, title).toBeGreaterThan(upright.z1);
          expect(lintel.z0, title).toBeLessThan(upright.z0);
        }
        // One upright is a little the taller.
        expect(Math.abs(left.high - right.high), title).toBeGreaterThan(0.01 * lintel.low);
      }
    }
  });

  it("stands the pair a hand apart: a tall stone that leans its point toward a short one", () => {
    for (const phone of [false, true]) {
      for (const title of of(PAIR)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(2);
        expect(pieces.every(grounded)).toBe(true);
        const [left, right] = [...pieces].sort((p, q) => p.x0 - q.x0), [short, tall] = [...pieces].sort((p, q) => p.high - q.high);
        // The tall one stands half as tall again as the short one, or more.
        expect(tall.high, title).toBeGreaterThan(1.5 * short.high);
        // They stand apart up to the short one's shoulder, by less than half the short one's breadth.
        const gap = across(position, right, -2, 1.5).x0 - across(position, left, -2, 1.5).x1;
        expect(gap, title).toBeGreaterThan(0);
        expect(gap, title).toBeLessThan(0.5 * breadth(short));
        // The tall one's point stands nearer the short one than the middle of its own foot does, by a fifth of its foot's breadth.
        const foot = footOf(position, tall), toShort = Math.sign(middle(short) - middle(foot));
        expect((position.getX(tipOf(position, tall.corners)) - middle(foot)) * toShort, title).toBeGreaterThan(0.2 * breadth(foot));
      }
    }
  });

  it("works the stele: squared, on a foot a step wider whose step is at one height whatever the stele's, with a band cut round it, a collar and a pointed cap", () => {
    const steps = new Set<number>(), tops = new Set<number>();
    for (const phone of [false, true]) {
      for (const title of of(STELE)) {
        const { position, color, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(1);
        // Its levels, from the foot up: the corners at one height, to a centimetre (a worked stone's rings are level), and how far
        // the outermost and the innermost of them stand out along the path, which way it has not settled.
        const levels = new Map<number, Set<string>>();
        for (let i = 0; i < position.count; i++) {
          const y = Math.round(position.getY(i) * 100);
          levels.set(y, (levels.get(y) ?? new Set()).add(`${position.getX(i).toFixed(4)},${position.getZ(i).toFixed(4)}`));
        }
        const rings = [...levels].sort((p, q) => p[0] - q[0]).map(([y, corners]) => {
          const outs = [...corners].map((corner) => Math.abs(Number(corner.split(",")[1])));
          return { y: y / 100, n: corners.size, out: Math.max(...outs), inn: Math.min(...outs) };
        });
        // Squared: every level is four corners, or two rings of four where a step or a cut is level; its top is one corner, a point.
        for (const ring of rings.slice(1, -1)) expect([4, 8], `${title} at ${ring.y}`).toContain(ring.n);
        expect(rings[rings.length - 1].n, title).toBe(1);
        // Four levels hold two rings, one standing inside the other: the foot's step, the band's foot and its top, and the collar's
        // foot, in that order up the stone.
        const double = rings.filter((ring) => ring.n === 8);
        expect(double, title).toHaveLength(4);
        for (const level of double) expect(level.out, `${title} at ${level.y}`).toBeGreaterThan(1.05 * level.inn);
        const [step, bandFoot, bandTop, collar] = double;
        steps.add(step.y);
        tops.add(rings[rings.length - 1].y);
        // The band is cut in, and narrow: across it the stele is as wide at its top as at its foot, and it is under a tenth of the
        // stele's height.
        expect(Math.abs(bandFoot.inn - bandTop.inn), title).toBeLessThan(0.05 * bandFoot.inn);
        expect(bandTop.y - bandFoot.y, title).toBeLessThan(0.1 * rings[rings.length - 1].y);
        // The collar stands out: the level over its foot is as wide as the foot's outer ring, wider than the shaft under it.
        const overCollar = rings[rings.indexOf(collar) + 1];
        expect(overCollar.n, title).toBe(4);
        expect(overCollar.inn, title).toBeGreaterThan(1.05 * collar.inn);
        // The cuts are paler than the stele's weathered faces, lighter than its own tone by more than its lighter grain is: there
        // is such a face in the band, and one in the cap over the collar.
        const own = new THREE.Color(toneOf(color, pieces[0]).hex), pale: number[] = [];
        for (let i = 0; i < position.count; i += 3) if (!weathered(color, i) && color.getX(i) > 1.4 * own.r) pale.push((position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3);
        expect(pale.some((y) => y > bandFoot.y && y < bandTop.y), title).toBe(true);
        expect(pale.some((y) => y > overCollar.y), title).toBe(true);
      }
    }
    // Every stele's step is at the one height, though the steles are of several: on a slope the ground comes up the foot and
    // never over the step (the slopes' test).
    expect(steps.size).toBe(1);
    expect(tops.size).toBeGreaterThan(3);
  });

  it("balances the boulder: a great round stone at rest on the top of a narrow one, about twice its breadth", () => {
    for (const phone of [false, true]) {
      for (const title of of(BOULDER)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(2);
        const [stand, boulder] = pieces;
        expect(grounded(stand)).toBe(true);
        // It rests a little way into the stand's top, and under a quarter of its own height.
        expect(stand.high - boulder.low, title).toBeGreaterThan(0);
        expect(stand.high - boulder.low, title).toBeLessThan(0.25 * (boulder.high - boulder.low));
        // The stand narrows as it rises, and the boulder is about twice as broad as the stand's top (1.9 to 2.6 times) and broader
        // than its foot.
        const foot = breadth(footOf(position, stand)), neck = breadth(across(position, stand, 0.8 * stand.high, stand.high));
        expect(neck, title).toBeLessThan(0.8 * foot);
        expect(breadth(boulder), title).toBeGreaterThan(1.7 * neck);
        expect(breadth(boulder), title).toBeGreaterThan(foot);
      }
    }
  });

  // Every show placed as main.js places it, on both tiers, with no second set: the maps do not hold where set 2 begins, and a stone
  // is the same wherever along the path its song falls. Each show is placed once for both tests below.
  type Stood = { g: { position: { x: number; y: number; z: number }; rotation: { y: number }; children: Part[] }; off: number };
  const path = buildPath(), line = buildWalkLine(path, 7);
  const place = (tracks: { title: string; duration: number }[], phone: boolean, block = false): Stood[] => {
    const made = makeBuilders(phone), landmarkU = layout(tracks, null, path);
    // The plain block that main builds for every such song.
    const plain = (g: { add(part: unknown): void }) => g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true }), 0, 2.25, 0));
    const landmarks = placeLandmarks(new THREE.Scene(), path, tracks, true, block ? { ...made, standingStone: plain } : made, landmarkU, line) as unknown as Stood["g"][];
    return landmarks.map((g, i) => { const point = path.at(landmarkU[i]); return { g, off: Math.hypot(g.position.x - point.x, g.position.z - point.z) }; });
  };
  const placings = new Map<string, Stood[]>();
  const placed = (show: string, tracks: { title: string; duration: number }[], phone: boolean) => {
    const key = `${phone}:${show}`;
    if (!placings.has(key)) placings.set(key, place(tracks, phone));
    return placings.get(key) as Stood[];
  };
  const everyStone = (visit: (stood: Stood, title: string, phone: boolean, where: string, block: () => Stood) => void) => {
    let stones = 0;
    for (const { show, tracks } of shows) for (const phone of [false, true]) {
      let blocks: Stood[] | null = null;
      placed(show, tracks, phone).forEach((stood, i) => {
        if (!falls(tracks[i].title)) return;
        stones += 1;
        visit(stood, tracks[i].title, phone, `${show}, song ${i}, "${tracks[i].title}"${phone ? " on a phone" : ""}`, () => (blocks ??= place(tracks, phone, true))[i]);
      });
    }
    return stones;
  };

  it("stands each stone where its song's title has it, and no further from its song's point than the plain block stood, in every show", () => {
    const stones = everyStone((stood, title, phone, where, block) => {
      // The stone placed is the title's own: path.js hands the standing stone the title.
      if (triangles(stood.g.children) !== stone(title, phone).faces) expect.fail(`${where}: not its title's stone`);
      if (stood.off > block().off + 0.001) expect.fail(`${where}: ${stood.off} m from its song's point, where the block stood ${block().off} m`);
    });
    // 426 such songs in the 38 maps, placed on both tiers.
    expect(stones).toBeGreaterThanOrEqual(2 * 426);
  });

  it("stands level on sloping ground with no foot in the air and nothing of it buried, in every show", () => {
    let steepest = 0, shallowest = Infinity;
    everyStone(({ g }, title, phone, where) => {
      const { position } = g.children[0].geometry.attributes, cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
      const laid = new Set(stone(title, phone).pieces.filter((piece) => !grounded(piece)).flatMap((piece) => piece.corners));
      for (let n = 0; n < position.count; n++) {
        const x = position.getX(n), y = position.getY(n), z = position.getZ(n);
        // The ground under the corner, against the stone's own: the landmark is turned about the vertical and stands level.
        const ground = height(g.position.x + x * cos + z * sin, g.position.z - x * sin + z * cos) - g.position.y;
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
    // The test has seen real slopes: somewhere the ground stands half a metre over or under a stone's own within its outline, and
    // the shallowest foot is still most of a metre down.
    expect(steepest).toBeGreaterThan(0.5);
    expect(shallowest).toBeGreaterThan(0.5);
    expect(shallowest).toBeLessThan(1.4);
  });
});
