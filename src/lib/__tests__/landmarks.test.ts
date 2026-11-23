import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import { hull, outside, standClear } from "../../../public/world/collide.js";
import { height } from "../../../public/world/ground.js";
import { makeBuilders, mergeLandmarks, mergeStill, mesh, songKey, STONE_KINDS, stoneKind, titleHash } from "../../../public/world/landmarks.js";
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
// A mesh's separate pieces, lowest first: its corners joined wherever a face joins them, or two faces share a corner's place.
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
  return [...pieces.values()].sort((p, q) => p.low - q.low || p.x0 - q.x0);
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
  // The kinds in the order of a title's kind.
  const MENHIR = 0, SLAB = 1, SPLIT = 2, CAIRN = 3, TRILITHON = 4, PAIR = 5, STELE = 6, BOULDER = 7, KINDS = [0, 1, 2, 3, 4, 5, 6, 7];
  // Songs no show has played, forty of each kind, the first that a count to 4,000 finds. A title is its stone's every roll, so these
  // are as good a draw as the maps' own, and they never change. What is said of a kind's shape is said of these (`of`), each bar set
  // with room and tried on 3,000 of the kind: a new map, which comes every day, cannot turn such a test red by a roll. What holds of
  // every stone by the way it is built is held to the maps' titles too (EVERY).
  const UNPLAYED = KINDS.map((): string[] => []);
  for (let n = 0; n < 4000 && UNPLAYED.some((titles) => titles.length < 40); n++) {
    const title = `A Song No Show Has Played ${n}`, titles = UNPLAYED[stoneKind(title)];
    if (titles.length < 40) titles.push(title);
  }
  const of = (kind: number) => UNPLAYED[kind], EVERY = [...fallers, ...UNPLAYED.flat()];
  // The plain block the stones replace: 1.6 m across the path, 1.2 m along it, 4.5 m tall, and a foot's depth.
  const BLOCK = { x: 0.8, z: 0.6, top: 4.5 }, SUNK = -1.6;

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
  // A piece that comes down to the ground, and one that stands or lies on another.
  const grounded = (piece: Piece) => piece.low < 0.15;
  // The span across the path of a piece's corners between two heights, and its breadth and middle.
  type Span = { x0: number; x1: number };
  const across = (position: Corners, piece: Piece, from: number, to: number): Span => {
    const xs = piece.corners.filter((i) => position.getY(i) >= from && position.getY(i) <= to).map((i) => position.getX(i));
    return { x0: Math.min(...xs), x1: Math.max(...xs) };
  };
  const breadth = (span: Span) => span.x1 - span.x0, middle = (span: Span) => (span.x0 + span.x1) / 2;
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
  // A piece's faces, one at a time, as three points and what is reckoned from them: how much stone is in the piece, in cubic metres,
  // from its faces as they are wound (a piece built inside out gives less than nothing); its least face, in square metres; and
  // which way a face looks.
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
  // Where the upright line through (x, z) meets a piece's faces: the highest such place (`top`) or the lowest, or none.
  const meets = (position: Corners, piece: Piece, x: number, z: number, top: boolean) => {
    let best = top ? -Infinity : Infinity;
    for (let n = 0; n < piece.corners.length; n += 3) {
      face(position, piece.corners, n);
      const w0 = (b.x - x) * (c.z - z) - (c.x - x) * (b.z - z), w1 = (c.x - x) * (a.z - z) - (a.x - x) * (c.z - z), w2 = (a.x - x) * (b.z - z) - (b.x - x) * (a.z - z), w = w0 + w1 + w2;
      if (Math.abs(w) < 1e-12 || ((w0 < 0 || w1 < 0 || w2 < 0) && (w0 > 0 || w1 > 0 || w2 > 0))) continue;
      const y = (w0 * a.y + w1 * b.y + w2 * c.y) / w;
      best = top ? Math.max(best, y) : Math.min(best, y);
    }
    return best;
  };
  // How far a piece is into the one under it, where the two meet: straight under each corner of the upper one, how far the lower
  // one's top stands over that corner; and straight over each corner of the lower one, how far it stands over the upper one's
  // underside; and the most of all those. Nothing or less, and the upper one floats: the two do not touch anywhere.
  const into = (position: Corners, upper: Piece, lower: Piece) => {
    let most = -Infinity;
    for (const i of upper.corners) most = Math.max(most, meets(position, lower, position.getX(i), position.getZ(i), true) - position.getY(i));
    for (const i of lower.corners) most = Math.max(most, position.getY(i) - meets(position, upper, position.getX(i), position.getZ(i), false));
    return most;
  };
  // Where a piece is cut by the level `y`: its span across the path there, or null where it does not reach that height.
  const sliced = (position: Corners, piece: Piece, y: number): Span | null => {
    const xs: number[] = [];
    for (let n = 0; n < piece.corners.length; n += 3) {
      face(position, piece.corners, n);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) if ((p.y - y) * (q.y - y) < 0) xs.push(p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y));
    }
    return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs) } : null;
  };
  // A face's colour, as the tone it was painted from.
  const TONES = { grey: 0x7d7a74, pale: 0xa9a59c, bluestone: 0x6f7782, sandstone: 0x9a8c74 }, MOSS = 0x55663f, LICHEN = 0xa9a45c;
  const isTone = (color: Corners, i: number, hex: number) => { const tone = new THREE.Color(hex); return Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) < 1e-4; };
  const weathered = (color: Corners, i: number) => [...Object.values(TONES), MOSS, LICHEN].some((hex) => isTone(color, i, hex));
  // A piece's own tone: the commonest of the four on its corners.
  const toneOf = (color: Corners, piece: Piece) => Object.entries(TONES).map(([name, hex]) => ({ name, hex, n: piece.corners.filter((i) => isTone(color, i, hex)).length })).sort((p, q) => q.n - p.n)[0];

  // The world's own path and the bears' line, and the highest the ground stands over a landmark's own ground under the old block's
  // outline, wherever on the path the block would stand: at every quarter metre of the path, where standClear puts the block, the
  // ground under its outline and its inside every 0.2 m. A stone is inside that outline, so no show can put the ground higher against
  // one. It is 0.85 m; on the maps' own stands it is 0.75 m.
  const path = buildPath(), line = buildWalkLine(path, 7);
  let rise: number | null = null;
  const highestGround = () => {
    if (rise !== null) return rise;
    const pts: [number, number][] = [], outline = hull([[-BLOCK.x, -BLOCK.z], [BLOCK.x, -BLOCK.z], [BLOCK.x, BLOCK.z], [-BLOCK.x, BLOCK.z]]);
    for (let d = 0; d < line.length; d += 0.25) { const p = line.at(d); pts.push([p.x, p.z]); }
    rise = 0;
    for (let d = 0; d < path.curveLength; d += 0.25) {
      const u = d / path.curveLength, point = path.at(u), t = path.tangentAt(u), turn = Math.atan2(t.x, t.z), cos = Math.cos(turn), sin = Math.sin(turn);
      const s = standClear(point.x, point.z, turn, outline, pts), own = height(s.x, s.z);
      for (let x = -BLOCK.x; x <= BLOCK.x + 1e-9; x += 0.2) for (let z = -BLOCK.z; z <= BLOCK.z + 1e-9; z += 0.2) rise = Math.max(rise, height(s.x + x * cos + z * sin, s.z - x * sin + z * cos) - own);
    }
    return rise;
  };

  it("gives a song one name however its title is written: an accent, a capital, a leading \"the\", a dropped g and a segue mark change nothing", () => {
    // The three songs the maps write two ways, which had two stones each.
    for (const [one, other] of [["The Other One", "Other One>"], ["Throwing Stones", "Throwin' Stones >"], ["Promised Land", "The Promised Land"]]) {
      expect(songKey(one), one).toBe(songKey(other));
      expect(titleHash(one), one).toBe(titleHash(other));
      expect(falls(one) && falls(other), one).toBe(true);
    }
    expect(songKey("Se\u00f1or")).toBe("senor");
    expect(songKey("Sen\u0303or")).toBe("senor");
    expect(songKey("Deal ->")).toBe("deal");
    expect(songKey("Goin\u2019 Down The Road")).toBe("goingdowntheroad");
    // Only a leading "the", and only a g dropped at a word's end: these are other songs, or other words.
    expect(songKey("Them Belly Full")).toBe("thembellyfull");
    expect(songKey("On The Road Again")).toBe("ontheroadagain");
    expect(songKey("Ain't It Crazy")).toBe("aintitcrazy");
    expect(songKey("Rain")).toBe("rain");
    // A digit counts: a show's numbered pieces are different songs.
    expect(songKey("Seastones 3 - Track 4")).not.toBe(songKey("Seastones 3 - Track 5"));
    // A title with no letter or digit, or none at all, is the empty one's.
    expect(songKey("???")).toBe("");
    expect(titleHash(undefined)).toBe(titleHash(""));
  });

  it("gives no two different songs in the maps one name: titles that share a name are one song, word for word", () => {
    // A title as a reader would take it, worked out apart from the world's own rule: its words, accents and capitals aside, with a
    // leading "the" left out, run together, and "ing" read as "in" wherever it comes. Every title in every map, with a landmark of
    // its own or not.
    const words = (title: string) => {
      const all = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9'\u2019]+/).filter((word) => /[a-z0-9]/.test(word));
      return (all[0] === "the" ? all.slice(1) : all).join("").replace(/['\u2019]/g, "").replace(/ing/g, "in");
    };
    const named = new Map<string, Set<string>>();
    for (const { tracks } of shows) for (const { title } of tracks) named.set(songKey(title), (named.get(songKey(title)) ?? new Set()).add(words(title)));
    const mixed = [...named].filter(([, readings]) => readings.size > 1).map(([name, readings]) => `${name}: ${[...readings].join(", ")}`);
    expect(mixed).toEqual([]);
    // And the rule does join titles: fewer names than titles written with letters and digits alone, by a few.
    const spelt = new Set(shows.flatMap(({ tracks }) => tracks.map((t) => t.title.toLowerCase().replace(/[^a-z0-9]/g, ""))));
    expect(named.size).toBeLessThan(spelt.size);
    expect(named.size).toBeGreaterThan(0.9 * spelt.size);
  });

  it("gives a title its own number, and its kind from it", () => {
    expect(titleHash("Deal")).toBe(titleHash("deal"));
    expect(titleHash("Deal")).not.toBe(titleHash("Loser"));
    expect(STONE_KINDS).toBe(8);
    for (const title of [...fallers, ""]) {
      const h = titleHash(title), kind = stoneKind(title);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
      expect(kind).toBe(h % 8);
    }
  });

  it("spreads the songs over the eight kinds: each is used, none by more than a quarter of the songs, and the shows of eight such songs or more have five kinds each on the average", () => {
    // 179 songs under 240 titles in the 38 maps of 2026-11-22: 16 to 27 of a kind.
    const songs = new Map(fallers.map((title) => [songKey(title), stoneKind(title)]));
    expect(songs.size).toBeGreaterThanOrEqual(179);
    for (const kind of KINDS) {
      const n = [...songs.values()].filter((k) => k === kind).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(songs.size / 4);
      // And of 4,000 songs no show has played, forty are of each kind long before the count ends: the tests below have them.
      expect(UNPLAYED[kind], `kind ${kind}`).toHaveLength(40);
    }
    // A show's songs are few, and one show of eight may land on three kinds by a roll: so the bar is the mean over the shows, which
    // no one show can move far. It is 6.2 over the 31 such shows; a hash that clustered would give two or three.
    const kinds = shows.map(({ tracks }) => tracks.map((t) => t.title).filter(falls)).filter((titles) => titles.length >= 8).map((titles) => new Set(titles.map(stoneKind)).size);
    expect(kinds.length).toBeGreaterThanOrEqual(31);
    expect(kinds.reduce((sum, n) => sum + n, 0) / kinds.length).toBeGreaterThan(5);
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

  it("builds every stone as one still mesh whose pieces are closed, with their faces outward and none of no area, each standing 1.6 m into the ground or on another piece that does", () => {
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const { parts, position, pieces } = stone(title, phone), where = `"${title}"${phone ? " on a phone" : ""}`;
        // One mesh, which neither glows nor moves: a stone costs what the block did.
        expect(parts, where).toHaveLength(1);
        expect(parts[0].material.emissive.getHex(), where).toBe(0);
        // Closed, edge for edge, each edge used once each way: a piece with a face missing, or built of faces that do not meet, is
        // open, and two pieces that shared a corner would use an edge twice.
        expect(openEdges(position, true), where).toEqual([]);
        for (const piece of pieces) {
          // A piece that comes down to the ground goes on down 1.6 m: none ends where a slope's lower side would show under it.
          if (grounded(piece)) expect(piece.low, where).toBeCloseTo(SUNK, 5);
          // Any other stands or lies on the pieces under it and touches one of them: straight under some corner of it, or over
          // one of theirs, the two meet. One that floated would give less than nothing here; one sunk a hand deep, too much.
          else {
            const most = Math.max(...pieces.filter((under) => under.low < piece.low - 1e-6).map((under) => into(position, piece, under)));
            if (most < -1e-4 || most > 0.2) expect.fail(`${where}: a piece that begins ${piece.low} m up is ${most} m into what is under it`);
          }
          // Its faces look outward: there is stone in it, 0.02 cubic metres or more down to the least stone of a cairn.
          expect(volumeOf(position, piece), where).toBeGreaterThan(0.02);
          // And no face is a line or a point: a face folded to nothing would still be drawn. The least face of 48,000 stones is two
          // square centimetres, in a split stone; the bar is far under that.
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
    const made = KINDS.map((kind) => new Set(EVERY.filter((title) => stoneKind(title) === kind).map((title) => `${stone(title).faces}/${stone(title, true).faces}/${stone(title).pieces.length}`)));
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
      const shapes = new Set<string>(), tops = new Set<number>(), tones = new Set<string>(), turns = new Set<number>();
      for (const title of of(kind)) {
        const { position, color, pieces } = stone(title), all = pieces.flatMap((piece) => piece.corners);
        shapes.add([0, 17, 34, 51].map((i) => cornerKey(position, i)).join(";"));
        tops.add(Math.round(Math.max(...pieces.map((piece) => piece.high)) * 100));
        tones.add(toneOf(color, pieces[0]).name);
        // Which way it turns: the side of the block's middle that its highest corner stands on.
        turns.add(Math.sign(position.getX(tipOf(position, all))));
      }
      // Forty songs, forty shapes, or all but one or two; several heights among them, and all four tones.
      expect(shapes.size, `kind ${kind}`).toBeGreaterThanOrEqual(38);
      expect(tops.size, `kind ${kind}`).toBeGreaterThanOrEqual(4);
      expect(tones.size, `kind ${kind}`).toBe(4);
      // The cairn's top stone and the boulder stand over the middle; every other kind turns both ways.
      if (![CAIRN, BOULDER].includes(kind)) expect([...turns].sort(), `kind ${kind}`).toEqual([-1, 1]);
    }
  });

  it("paints a stone in its tone, with faces a shade darker and lighter, and moss and lichen in patches over its foot", () => {
    // Where a face's middle lies, to half a metre: the patches' own grain. The shares are of all the maps' stones' faces together:
    // one stone may be half overgrown by a roll, and a new map's must not turn this red.
    const seen = new Set<string>(), faced = new Set<string>(), overgrown = new Set<string>();
    let toned = 0, shaded = 0, grown = 0, all = 0;
    for (const title of fallers) {
      const { position, color, faces } = stone(title);
      all += faces;
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
        if (y < 0.3) expect.fail(`"${title}": ${growth} on a face ${y} m up`);
      }
    }
    // Of every face of every stone: about two in five are the stone's own tone, as many a shade of it, and one in six overgrown.
    expect(toned / all).toBeGreaterThan(0.3);
    expect(shaded / all).toBeGreaterThan(0.3);
    expect(grown / all).toBeGreaterThan(0.08);
    expect(grown / all).toBeLessThan(0.3);
    expect([...seen].sort()).toEqual(["bluestone", "grey", "lichen", "moss", "pale", "sandstone"]);
    // The patches lie where the title has them, not at the same places on every stone: on one stone or another something grows
    // nearly everywhere a face lies, where patches that every stone shared would cover a quarter of those places.
    expect(overgrown.size).toBeGreaterThan(0.8 * faced.size);
  });

  it("clears the ground: a split stone's root and a stele's step are at one height, over the highest ground the path can put under a stone, and a laid stone begins over it too", () => {
    // 0.85 m is the highest: on the steep climb, under the old block's far corner. A new map can put a stone anywhere on the path.
    const ground = highestGround();
    expect(ground).toBeGreaterThan(0.8);
    expect(ground).toBeLessThan(0.9);
    const roots = new Set<number>(), steps = new Set<number>();
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const { position, pieces } = stone(title, phone), kind = stoneKind(title);
        // The split stone's root: where its two halves begin, which is where its foot ends. To a tenth of a millimetre.
        if (kind === SPLIT) for (const y of [pieces[1].low, pieces[2].low, pieces[0].high]) roots.add(Math.round(y * 1e4) / 1e4);
        // The stele's step: its lowest level over the foot's ring.
        if (kind === STELE) steps.add(Math.round(Math.min(...pieces[0].corners.map((i) => position.getY(i)).filter((y) => y > SUNK + 1e-3)) * 1e4) / 1e4);
        // A piece that lies or stands on another begins over the ground, with a hand to spare.
        for (const piece of pieces) if (!grounded(piece) && piece.low < ground + 0.08) expect.fail(`"${title}"${phone ? " on a phone" : ""}: a piece begins ${piece.low} m up, where the ground can stand ${ground} m`);
      }
    }
    // One height for every split stone's root and every stele's step, whatever the stone's own height: a hand over the ground's.
    expect(roots.size).toBe(1);
    expect([...steps]).toEqual([...roots]);
    expect([...roots][0]).toBeGreaterThan(ground + 0.08);
    expect([...roots][0]).toBeLessThan(ground + 0.3);
  });

  it("settles every laid stone the one depth into what it is laid on, wherever on it it lands: a cairn's stones, a boulder, and a lintel in the upright it meets last", () => {
    // How far one is into the other where they meet, to a tenth of a millimetre. A stone set by the other's highest corner, or
    // moved to its place after it was let down, would lie at a different depth on every stone, or float.
    const depths = new Set<number>(), to = (depth: number) => depths.add(Math.round(depth * 1e4) / 1e4);
    for (const phone of [false, true]) {
      for (const title of of(CAIRN)) { const { position, pieces } = stone(title, phone); pieces.slice(1).forEach((piece, k) => to(into(position, piece, pieces[k]))); }
      for (const title of of(BOULDER)) { const { position, pieces } = stone(title, phone); to(into(position, pieces[1], pieces[0])); }
      for (const title of of(TRILITHON)) { const { position, pieces } = stone(title, phone); to(Math.min(into(position, pieces[2], pieces[0]), into(position, pieces[2], pieces[1]))); }
    }
    expect(depths.size).toBe(1);
    // Three centimetres or more, so it is seated; under a hand, so it is not sunk in.
    expect([...depths][0]).toBeGreaterThan(0.03);
    expect([...depths][0]).toBeLessThan(0.1);
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

  it("splits the split stone from its top to its root and no further: one stone at 0.9 m, a crack 4 cm wide or more at 1.2 m and a hand and a half at 2.5 m, the halves leaning apart with matching pale faces, one a little the shorter", () => {
    for (const phone of [false, true]) {
      for (const title of of(SPLIT)) {
        const { position, color, pieces } = stone(title, phone);
        // A foot, down to its own foot in the ground, and two halves that begin where it ends.
        expect(pieces, title).toHaveLength(3);
        const foot = pieces[0], [left, right] = pieces.slice(1).sort((p, q) => p.x0 - q.x0);
        expect(grounded(foot) && !grounded(left) && !grounded(right), title).toBe(true);
        // The halves stand on the foot's top ring, corner for corner: each corner of a half's own foot that is out at the stone's
        // side, not drawn back to the crack, is within a centimetre of a corner of the foot's top. So the stone's sides run on
        // from the foot into the halves with no step.
        const rim = foot.corners.filter((i) => position.getY(i) > foot.high - 1e-3).map((i) => [position.getX(i), position.getZ(i)]);
        for (const half of [left, right]) {
          const out = half.corners.filter((i) => position.getY(i) < half.low + 1e-3 && Math.abs(position.getX(i) - (half === left ? half.x1 : half.x0)) > 0.25);
          expect(out.length, title).toBeGreaterThan(3);
          for (const i of out) expect(Math.min(...rim.map(([x, z]) => Math.hypot(x - position.getX(i), z - position.getZ(i)))), title).toBeLessThan(0.01);
        }
        // The crack at a height: from the left half to the right across the level there, or none where the halves do not reach.
        const crack = (y: number) => { const l = sliced(position, left, y), r = sliced(position, right, y); return l && r ? { wide: r.x0 - l.x1, at: (r.x0 + l.x1) / 2, across: r.x1 - l.x0 } : null; };
        // Shut under the root: at 0.3, 0.6 and 0.9 m the stone is its foot alone, one solid, with no half there and no crack.
        for (const y of [0.3, 0.6, 0.9]) {
          expect(crack(y), `${title} at ${y} m`).toBeNull();
          expect(sliced(position, foot, y), `${title} at ${y} m`).not.toBeNull();
        }
        // Open over it, and opening as it rises: 4 cm or more at 1.2 m, and five times that at 2.5 m, where the sky shows through.
        const low = crack(1.2), high = crack(2.5);
        if (!low || !high) { expect.fail(`${title}: no halves at 1.2 m or at 2.5 m`); continue; }
        expect(low.wide, title).toBeGreaterThan(0.04);
        expect(low.wide, title).toBeLessThan(0.09);
        expect(high.wide, title).toBeGreaterThan(0.25);
        expect(high.wide, title).toBeLessThan(0.45);
        // The inner faces match: the crack's middle at 2.5 m stands over its middle at 1.2 m.
        expect(Math.abs(high.at - low.at), title).toBeLessThan(0.05);
        // The halves lean apart: over three quarters of the way up the shorter one they are together a sixth broader than the
        // foot they stand on is in the ground, or more.
        const shorter = Math.min(left.high, right.high);
        expect(across(position, right, 0.75 * shorter, 9).x1 - across(position, left, 0.75 * shorter, 9).x0, title).toBeGreaterThan(1.15 * breadth(footOf(position, foot)));
        // One half stands over the other by a little: more than a twentieth of the taller and less than a fifth, where the pair's
        // tall stone is twice its short one.
        const taller = Math.max(left.high, right.high);
        expect(Math.abs(left.high - right.high), title).toBeGreaterThan(0.05 * taller);
        expect(Math.abs(left.high - right.high), title).toBeLessThan(0.2 * taller);
        // Where the stone broke it is paler, and clean: each half's faces that look across the crack at the other are one tone,
        // lighter than the stone's own, with no grain and nothing growing on them. Its outer faces are of several tones.
        const own = new THREE.Color(toneOf(color, foot).hex);
        for (const [half, toward] of [[left, 1], [right, -1]] as const) {
          const broken = new Set<string>(), outer = new Set<string>();
          for (let n = 0; n < half.corners.length; n += 3) {
            face(position, half.corners, n);
            const mid = (a.y + b.y + c.y) / 3, looks = b.sub(a).cross(c.sub(a)).normalize().x * toward, i = half.corners[n];
            if (mid < 1.2) continue;
            (looks > 0.9 ? broken : looks < 0 ? outer : new Set<string>()).add(`${color.getX(i).toFixed(4)},${color.getY(i).toFixed(4)},${color.getZ(i).toFixed(4)}`);
            if (looks > 0.9 && color.getX(i) < 1.05 * own.r) expect.fail(`${title}: a broken face no paler than the stone`);
          }
          expect(broken.size, title).toBe(1);
          expect(outer.size, title).toBeGreaterThan(1);
        }
      }
    }
  });

  it("piles the cairn: a great stone in the ground and four or more on it, each resting in the one under where the two meet, smaller than it and laid to the other side of it", () => {
    for (const title of of(CAIRN)) {
      // A phone's pile has a stone fewer, and never more.
      expect(stone(title, true).pieces.length, title).toBeLessThanOrEqual(stone(title).pieces.length);
      for (const phone of [false, true]) {
        const { position, color, pieces } = stone(title, phone);
        expect(pieces.length, title).toBeGreaterThanOrEqual(5);
        expect(pieces.map(grounded)).toEqual([true, ...pieces.slice(1).map(() => false)]);
        const tones = new Set<string>();
        // Where a stone lies across the path: the mean of its corners.
        const lies = pieces.map((piece) => piece.corners.reduce((sum, i) => sum + position.getX(i), 0) / piece.corners.length);
        pieces.forEach((piece, k) => {
          for (const [name, hex] of Object.entries(TONES)) if (piece.corners.some((i) => isTone(color, i, hex))) tones.add(name);
          if (k === 0) return;
          const under = pieces[k - 1], rests = into(position, piece, under);
          // It rests in the one under it: where the two meet, one is 3 cm or more into the other, and under a hand. A stone set
          // by the other's highest corner alone would float over the rest of it.
          expect(rests, `${title}: stone ${k}`).toBeGreaterThan(0.03);
          expect(rests, `${title}: stone ${k}`).toBeLessThan(0.1);
          // Smaller than the one under, with less stone in it.
          expect(volumeOf(position, piece), `${title}: stone ${k}`).toBeLessThan(volumeOf(position, under));
          // And laid to the other side of the one under from where that one was laid: the pile leans this way and that.
          if (k > 1) expect((lies[k] - lies[k - 1]) * (lies[k - 1] - lies[k - 2]), `${title}: stone ${k}`).toBeLessThan(k > 2 ? -0.005 : 0);
        });
        // The pile is of stones of several tones: all four are there, though moss and shade may cover the least of them.
        expect(tones.size, title).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("builds the trilithon: two uprights with a doorway between them and a lintel that lies in the top of each, tilted as their tops are, and overhangs them before and behind", () => {
    for (const phone of [false, true]) {
      for (const title of of(TRILITHON)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(3);
        expect(pieces.map(grounded)).toEqual([true, true, false]);
        const [left, right] = pieces.slice(0, 2).sort((p, q) => p.x0 - q.x0), lintel = pieces[2];
        // The doorway: sky between the uprights all the way up, about as wide as an upright is broad.
        expect(right.x0 - left.x1, title).toBeGreaterThan(0.8 * Math.max(breadth(left), breadth(right)));
        // The lintel reaches over both uprights' middles, a thick stone a quarter as deep as it is long.
        expect(lintel.x0).toBeLessThan(middle(left));
        expect(lintel.x1).toBeGreaterThan(middle(right));
        for (const upright of [left, right]) {
          // It lies in the top of each upright: where the two meet, one is 3 cm or more into the other, and under a hand and a half.
          // On neither does it float, and neither's top is lost in it.
          expect(into(position, lintel, upright), title).toBeGreaterThan(0.03);
          expect(into(position, lintel, upright), title).toBeLessThan(0.14);
          // And it stands out past each, before it and behind.
          expect(lintel.z1, title).toBeGreaterThan(upright.z1);
          expect(lintel.z0, title).toBeLessThan(upright.z0);
        }
        // One upright is the taller, and it shows: the lintel's top over it is higher than over the other, by most of the difference.
        const over = (upright: Piece) => Math.max(...lintel.corners.filter((i) => Math.abs(position.getX(i) - middle(upright)) < 0.3).map((i) => position.getY(i)));
        const [tall, short] = left.high > right.high ? [left, right] : [right, left];
        expect(tall.high - short.high, title).toBeGreaterThan(0.1);
        expect(over(tall) - over(short), title).toBeGreaterThan(0.6 * (tall.high - short.high));
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

  it("works the stele: squared, on a foot a step wider, with a band cut round it, a collar and a pointed cap, its cuts paler", () => {
    const tops = new Set<number>();
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
        tops.add(rings[rings.length - 1].y);
        // Four levels hold two rings, one standing inside the other: the foot's step, the band's foot and its top, and the collar's
        // foot, in that order up the stone.
        const double = rings.filter((ring) => ring.n === 8);
        expect(double, title).toHaveLength(4);
        for (const level of double) expect(level.out, `${title} at ${level.y}`).toBeGreaterThan(1.05 * level.inn);
        const [, bandFoot, bandTop, collar] = double;
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
    // The steles are of several heights, though their step is at the one (the test of the ground).
    expect(tops.size).toBeGreaterThan(3);
  });

  it("balances the boulder: a great round stone at rest in the top of a narrow one, about twice its breadth", () => {
    for (const phone of [false, true]) {
      for (const title of of(BOULDER)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(2);
        const [stand, boulder] = pieces;
        expect(grounded(stand)).toBe(true);
        // It rests in the stand's top: where the two meet, one is 3 cm or more into the other, and under a hand.
        expect(into(position, boulder, stand), title).toBeGreaterThan(0.03);
        expect(into(position, boulder, stand), title).toBeLessThan(0.1);
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
    let n = 0;
    for (const { show, tracks } of shows) for (const phone of [false, true]) {
      let blocks: Stood[] | null = null;
      placed(show, tracks, phone).forEach((stood, i) => {
        if (!falls(tracks[i].title)) return;
        n += 1;
        visit(stood, tracks[i].title, phone, `${show}, song ${i}, "${tracks[i].title}"${phone ? " on a phone" : ""}`, () => (blocks ??= place(tracks, phone, true))[i]);
      });
    }
    return n;
  };

  it("stands each stone where its song's title has it, and no further from its song's point than the plain block stood, in every show", () => {
    const n = everyStone((stood, title, phone, where, block) => {
      // The stone placed is the title's own: path.js hands the standing stone the title.
      if (triangles(stood.g.children) !== stone(title, phone).faces) expect.fail(`${where}: not its title's stone`);
      if (stood.off > block().off + 0.001) expect.fail(`${where}: ${stood.off} m from its song's point, where the block stood ${block().off} m`);
    });
    // 426 such songs in the 38 maps, placed on both tiers.
    expect(n).toBeGreaterThanOrEqual(2 * 426);
  });

  it("stands level on sloping ground, in every show: no foot in the air, no laid stone buried, and the ground under a stele's step or a split stone's root never up to it", () => {
    let steepest = 0, shallowest = Infinity;
    const under = { step: 0, root: 0 };
    everyStone(({ g }, title, phone, where) => {
      const { position } = g.children[0].geometry.attributes, cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
      const { pieces } = stone(title, phone), kind = stoneKind(title), laid = new Set(pieces.filter((piece) => !grounded(piece)).flatMap((piece) => piece.corners));
      // A stele's step is its lowest level over its foot's ring; a split stone's root is where its halves begin.
      const step = kind === STELE ? Math.min(...pieces[0].corners.map((i) => position.getY(i)).filter((y) => y > SUNK + 1e-3)) : null, root = kind === SPLIT ? pieces[1].low : null;
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
        // No corner of a piece that lies or stands on another is in the ground.
        if (laid.has(n) && y <= ground) expect.fail(`${where}: a corner ${y} m up it lies ${ground - y} m in the ground`);
        // Under each corner of a stele's step, and of a split stone's root, the ground is under that corner: the step stays in
        // sight on the slope's upper side, and the crack ends in the air.
        if (step !== null && Math.abs(y - step) < 1e-3) { under.step = Math.max(under.step, ground); if (ground >= step) expect.fail(`${where}: the ground stands ${ground} m under its step, ${step} m up`); }
        if (root !== null && Math.abs(y - root) < 1e-3) { under.root = Math.max(under.root, ground); if (ground >= root) expect.fail(`${where}: the ground stands ${ground} m under its root, ${root} m up`); }
      }
    });
    // The test has seen real slopes: somewhere the ground stands half a metre over or under a stone's own within its outline, and
    // 0.4 m under a corner of a stele's step and of a split stone's root; the shallowest foot is still most of a metre down.
    expect(steepest).toBeGreaterThan(0.5);
    expect(under.step).toBeGreaterThan(0.3);
    expect(under.root).toBeGreaterThan(0.3);
    expect(shallowest).toBeGreaterThan(0.5);
    expect(shallowest).toBeLessThan(1.4);
  });
});

describe("the drum circle, the banner, Space's rim, the magnolia and the leaning stones", () => {
  // The five, by a title of each, and how far under its own ground each one's feet go.
  const FIVE = ["Drums", "Walkin' Blues", "Space", "Sugar Magnolia", "Good Lovin'"];
  const SUNK: Record<string, number> = { Drums: 3.2, "Walkin' Blues": 1.6, Space: 5, "Sugar Magnolia": 1.6, "Good Lovin'": 2 };
  // The plain shapes they replace, as main built them, each part [geometry, x, y, z, its turn about z].
  const PLAIN: Record<string, () => [unknown, number, number, number, number?][]> = {
    Drums: () => [[new THREE.CylinderGeometry(1.4, 1.4, 2, 10), -2, 1, 0], [new THREE.CylinderGeometry(1.1, 1.1, 3, 10), 0.6, 1.5, 1], [new THREE.CylinderGeometry(1.8, 1.8, 1.5, 10), 2.4, 0.75, -1]],
    "Walkin' Blues": () => [[new THREE.CylinderGeometry(0.15, 0.15, 12, 6), 0, 6, 0], [new THREE.BoxGeometry(3, 1.8, 0.05), 1.6, 11, 0]],
    Space: () => [[new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), 0, 0.15, 0]],
    "Sugar Magnolia": () => [[new THREE.IcosahedronGeometry(2, 0), 0, 1.6, 0], ...[[1.2, 2.6, 0.8], [-1.1, 2.4, 1], [0.2, 3.4, -0.6], [-0.9, 1.6, -1.4], [1.5, 1.4, -0.9]].map(([x, y, z]): [unknown, number, number, number] => [new THREE.SphereGeometry(0.35, 6, 4), x, y, z])],
    "Good Lovin'": () => [[new THREE.BoxGeometry(1, 6, 1), -1.6, 2.8, 0, -0.35], [new THREE.BoxGeometry(1, 6, 1), 1.6, 2.8, 0, 0.35]],
  };
  // A mesh's corners in its landmark's frame, face by face: three to a face.
  const cornersOf = (part: unknown) => {
    const m = part as { updateMatrix(): void; matrix: unknown; geometry: { index: unknown; toNonIndexed(): { attributes: { position: Corners } }; attributes: { position: Corners } } }, v = new THREE.Vector3();
    const { position } = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry).attributes;
    m.updateMatrix();
    return Array.from({ length: position.count }, (_, i): [number, number, number] => { v.fromBufferAttribute(position, i).applyMatrix4(m.matrix); return [v.x, v.y, v.z]; });
  };
  // What a landmark may not pass: the plain shape's outline seen from above (path.js stands a landmark by its outline), and its top.
  // Space's rim alone stands over its plain shape, a disc that lay flat: 0.8 m, and no higher.
  type Plain = { corners: [number, number, number][]; outline: number[][]; top: number };
  const plains = new Map<string, Plain>();
  const plain = (title: string) => {
    if (!plains.has(title)) {
      const corners = PLAIN[title]().flatMap(([geo, x, y, z, turn = 0]) => { const part = mesh(geo, new THREE.MeshBasicMaterial(), x, y, z); part.rotation.z = turn; return cornersOf(part); });
      plains.set(title, { corners, outline: hull(corners.map(([x, , z]) => [x, z])), top: title === "Space" ? 0.8 : Math.max(...corners.map(([, y]) => y)) });
    }
    return plains.get(title) as Plain;
  };
  // A landmark on a tier, built once for every test that reads it: its still mesh and that mesh's pieces, every part's corners, and
  // its own outline seen from above.
  type Built = { parts: Part[]; moving: unknown[]; still: Part; position: Corners; color: Corners; pieces: Piece[]; corners: [number, number, number][]; outline: number[][] };
  const builds = new Map<string, Built>();
  const built = (title: string, phone = false) => {
    const key = `${phone}:${title}`;
    if (!builds.has(key)) {
      const { parts, moving } = landmark(title, phone), still = parts.find((c) => (c.material as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial) as Part, { position, color } = still.geometry.attributes;
      const corners = parts.flatMap(cornersOf);
      builds.set(key, { parts, moving, still, position, color, pieces: piecesOf(position), corners, outline: hull(corners.map(([x, , z]) => [x, z])) });
    }
    return builds.get(key) as Built;
  };
  const tiers = (visit: (b: Built, title: string, phone: boolean, where: string) => void) => { for (const phone of [false, true]) for (const title of FIVE) visit(built(title, phone), title, phone, `${title}${phone ? " on a phone" : ""}`); };
  // The colours the tests know parts by.
  const SKIN = 0xd9c9a0, STRING = 0xcfc8b4, IRON = 0x55595c, DARK_TIMBER = 0x4a3520, TIMBER = 0x6b4e2e, OXBLOOD = 0x8a3d2b, HONEY = 0xa3733f, BEATER = 0x8f6c3e, LEATHER = 0x8a5a34, BRASS = 0xb08a3c;
  const BLUE = 0x5c86e0, PALE_BLUE = 0xdce8fa, BARK = 0x6a5a4a, LEAVES = [0x6da564, 0x8cc47e, 0x538550], PETALS = [0xf6eee2, 0xf2c6d1, 0xd9879f];
  const tinted = (color: Corners, i: number, hexes: number[]) => hexes.some((hex) => { const c = new THREE.Color(hex); return Math.abs(color.getX(i) - c.r) + Math.abs(color.getY(i) - c.g) + Math.abs(color.getZ(i) - c.b) < 1e-4; });
  // The pieces in one of some colours, by a piece's first corner.
  const of = ({ color, pieces }: Built, ...hexes: number[]) => pieces.filter((piece) => tinted(color, piece.corners[0], hexes));
  const point = (position: Corners, i: number): [number, number, number] => [position.getX(i), position.getY(i), position.getZ(i)];
  // Where the line from `from` along `way` meets a piece's faces, as distances along it, nearest first; each face it passes
  // through is met once, from either side.
  const [a, b, c, e1, e2, p, q, s] = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
  const meetings = (position: Corners, piece: Piece, from: [number, number, number], way: [number, number, number]) => {
    const hits: number[] = [], o = new THREE.Vector3(...from), d = new THREE.Vector3(...way);
    for (let n = 0; n < piece.corners.length; n += 3) {
      a.fromBufferAttribute(position, piece.corners[n]); b.fromBufferAttribute(position, piece.corners[n + 1]); c.fromBufferAttribute(position, piece.corners[n + 2]);
      e1.subVectors(b, a); e2.subVectors(c, a); p.crossVectors(d, e2);
      const det = e1.dot(p);
      if (Math.abs(det) < 1e-12) continue;
      s.subVectors(o, a);
      const u = s.dot(p) / det;
      q.crossVectors(s, e1);
      const v = d.dot(q) / det, t = e2.dot(q) / det;
      if (u >= 0 && v >= 0 && u + v <= 1 && t > 0) hits.push(t);
    }
    return hits.sort((x, y) => x - y);
  };
  // Whether a place is inside a closed piece: a line from it leaves through an odd number of faces. The line's way is one no face
  // of these shapes lies along.
  const within = (position: Corners, piece: Piece, at: [number, number, number]) => meetings(position, piece, at, [0.3141, 0.8273, 0.4657]).length % 2 === 1;

  // The world's own path and the bears' line, and where a landmark with an outline stands along the path: at each half metre of it,
  // the place standClear gives it, its turn, its own ground's height, and how far that is from the path's point.
  const path = buildPath(), line = buildWalkLine(path, 7), linePoints: [number, number][] = [];
  for (let d = 0; d < line.length; d += 0.25) { const at = line.at(d); linePoints.push([at.x, at.z]); }
  type Stand = { x: number; z: number; cos: number; sin: number; own: number; off: number };
  const standAt = (u: number, outline: number[][]): Stand => {
    const at = path.at(u), t = path.tangentAt(u), turn = Math.atan2(t.x, t.z), stood = standClear(at.x, at.z, turn, outline, linePoints);
    return { x: stood.x, z: stood.z, cos: Math.cos(turn), sin: Math.sin(turn), own: height(stood.x, stood.z), off: Math.hypot(stood.x - at.x, stood.z - at.z) };
  };
  // The whole path as places for one of the five: where it stands, by its own outline, at every second metre.
  const sweeps = new Map<string, Stand[]>();
  const along = (title: string, phone = false) => {
    const key = `${phone}:${title}`;
    if (!sweeps.has(key)) {
      const stands: Stand[] = [], { outline } = built(title, phone);
      for (let d = 0; d < path.curveLength; d += 2) stands.push(standAt(d / path.curveLength, outline));
      sweeps.set(key, stands);
    }
    return sweeps.get(key) as Stand[];
  };
  // How high the ground under a place of a landmark's own frame stands over the landmark's own ground: it stands level, turned
  // about the vertical.
  const groundAt = (stand: Stand, x: number, z: number) => height(stand.x + x * stand.cos + z * stand.sin, stand.z - x * stand.sin + z * stand.cos) - stand.own;

  it("are each one still mesh that neither glows nor moves, and Space main's own black disc besides", () => {
    tiers(({ parts, moving, still }, title, phone, where) => {
      // One draw call, as the plain shape cost, and Space's two: a part that glowed or moved would stay out of the path's one mesh.
      expect(parts, where).toHaveLength(title === "Space" ? 2 : 1);
      expect(parts.every((part) => part.isMesh), where).toBe(true);
      expect(still.material.emissive.getHex(), where).toBe(0);
      expect(moving, where).toHaveLength(0);
      if (title !== "Space") return;
      // The disc is main's, bit for bit: 24 sides, 5 m, lying level 0.15 m over the landmark's ground, unlit black.
      const disc = parts.find((part) => part !== still) as unknown as { position: { x: number; y: number; z: number }; material: { isMeshBasicMaterial?: boolean; color: { getHex(): number } }; geometry: { attributes: { position: { array: Float32Array } } } };
      expect(disc.material.isMeshBasicMaterial, where).toBe(true);
      expect(disc.material.color.getHex(), where).toBe(0x000000);
      expect([disc.position.x, disc.position.y, disc.position.z], where).toEqual([0, 0.15, 0]);
      expect([...disc.geometry.attributes.position.array], where).toEqual([...new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2).attributes.position.array]);
    });
  });

  it("keep inside the outline of the plain shapes they replace, seen from above, and under their tops", () => {
    tiers(({ corners }, title, phone, where) => {
      const old = plain(title);
      // No corner passes the plain shape's outline: a landmark that reached further, or was only rounder inside the same reach,
      // would be stood further off its song's point where the bears' line passes close (path.js). And none stands over its top.
      let out = -Infinity, top = -Infinity;
      for (const [x, y, z] of corners) { out = Math.max(out, outside(old.outline, x, z)); top = Math.max(top, y); }
      if (out > 1e-9 || top > old.top + 1e-9) expect.fail(`${where}: ${out} m outside the plain shape's outline, ${top} m up where it may stand ${old.top}`);
    });
  });

  it("hold as much of the walker's view as the plain shapes did: seen from 14 m back along the path, none shrinks inside its outline", () => {
    // A shape's silhouette as a near still sees it: the walker comes at a landmark along its own z, since it is turned to the path,
    // so the eye is 14 m back along -z and 3.2 m over the landmark's ground, on level ground, with what is under the ground left
    // out. Each face is drawn into a grid of 4 cm cells, measured at the landmark's own distance; the count of cells is its area.
    const BACK = 14, EYE = 3.2, CELL = 0.04, SIDE = 350, LEFT = -7, FOOT = -1;
    const seen = ([x, y, z]: number[]) => [(x * BACK) / (z + BACK), EYE + ((y - EYE) * BACK) / (z + BACK)];
    const silhouette = (corners: [number, number, number][]) => {
      const grid = new Uint8Array(SIDE * SIDE);
      for (let n = 0; n < corners.length; n += 3) {
        // The face's part over the ground, then fanned into triangles.
        const over: number[][] = [];
        for (let k = 0; k < 3; k++) {
          const a = corners[n + k], b = corners[n + ((k + 1) % 3)];
          if (a[1] >= 0) over.push(a);
          if (a[1] >= 0 !== b[1] >= 0) { const t = a[1] / (a[1] - b[1]); over.push([a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t]); }
        }
        const flat = over.map(seen);
        for (let k = 1; k + 1 < flat.length; k++) {
          const [a, b, c] = [flat[0], flat[k], flat[k + 1]], area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
          if (Math.abs(area) < 1e-12) continue;
          const cell = (v: number, from: number) => Math.max(0, Math.min(SIDE - 1, Math.floor((v - from) / CELL)));
          for (let j = cell(Math.min(a[1], b[1], c[1]), FOOT); j <= cell(Math.max(a[1], b[1], c[1]), FOOT); j++) for (let i = cell(Math.min(a[0], b[0], c[0]), LEFT); i <= cell(Math.max(a[0], b[0], c[0]), LEFT); i++) {
            const x = LEFT + (i + 0.5) * CELL, y = FOOT + (j + 0.5) * CELL;
            const w0 = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area, w1 = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) grid[j * SIDE + i] = 1;
          }
        }
      }
      return grid.reduce((sum, cell) => sum + cell, 0) * CELL * CELL;
    };
    // The least each may hold of its plain shape's silhouette. The banner and Space's rim hold more than theirs did, and the
    // leaning stones as much. The drums hold nine tenths: the goblet's waist and the barrel's narrow foot are what make them drums.
    // The magnolia holds three quarters and more: its crown is the plain bush's, and its trunk shows under it, where the bush
    // sat on the ground.
    const LEAST: Record<string, number> = { Drums: 0.9, "Walkin' Blues": 1.5, Space: 1.1, "Sugar Magnolia": 0.76, "Good Lovin'": 1 };
    // The plain shapes are what the stills showed: the drums nearly 20 square metres of the view, the magnolia's bush 10.
    expect(silhouette(plain("Drums").corners)).toBeGreaterThan(19);
    expect(silhouette(plain("Sugar Magnolia").corners)).toBeGreaterThan(9.5);
    tiers(({ corners }, title, phone, where) => {
      const share = silhouette(corners) / silhouette(plain(title).corners);
      if (share < LEAST[title]) expect.fail(`${where}: ${share} of the plain shape's silhouette, where it should hold ${LEAST[title]}`);
    });
  });

  it("stand at their songs' points in the pinned shows, on a desktop and on a phone alike", () => {
    // 1986-07-04 (set 2 from track 7) has Drums, Space, a Lovin' and a blues; 1987-12-28 (set 2 from track 9), Drums, Space, two
    // blues and two of the magnolia's songs. Main stands every one of them on its song's point.
    for (const [show, set2Start, songs] of [["1986-07-04", 7, [13, 14, 15, 18]], ["1987-12-28", 9, [3, 7, 13, 15, 16, 21]]] as const) {
      const map = JSON.parse(readFileSync(new URL(`../../../public/maps/${show}.json`, import.meta.url), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
      const tracks = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration })), landmarkU = layout(tracks, set2Start, path);
      const [desktop, phone] = [false, true].map((tier) => placeLandmarks(new THREE.Scene(), path, tracks, true, makeBuilders(tier), landmarkU, line) as { position: { x: number; z: number } }[]);
      const rules = builders(false).table, five = FIVE.map((title) => rules.find(([re]) => re.test(title)));
      for (const i of songs) {
        // The song is one of the five's.
        expect(five, `${show}, song ${i}, "${tracks[i].title}"`).toContain(rules.find(([re]) => re.test(tracks[i].title)));
        const at = path.at(landmarkU[i]);
        for (const stood of [desktop, phone]) expect(Math.hypot(stood[i].position.x - at.x, stood[i].position.z - at.z), `${show}, song ${i}`).toBeLessThanOrEqual(0.001);
      }
    }
  });

  it("go into the ground as far as it can fall away under them: each piece that comes down to the ground goes on down to its landmark's depth, and no foot shows on any slope of the path", () => {
    tiers(({ position, pieces }, title, phone, where) => {
      // A piece that comes down to the ground goes on down: none ends between the ground and the landmark's depth, where a slope's
      // lower side would show daylight under it. Every other piece begins well over the ground.
      for (const piece of pieces) {
        if (piece.low < 0.25) expect(piece.low, where).toBeCloseTo(-SUNK[title], 5);
      }
      expect(pieces.some((piece) => piece.low < 0.25), where).toBe(true);
      // And that depth is enough anywhere on the path: under every corner of a foot, the ground is 0.2 m or more over it.
      const feet = [...new Set(Array.from({ length: position.count }, (_, i) => i).filter((i) => position.getY(i) < -SUNK[title] + 1e-3).map((i) => `${position.getX(i)},${position.getZ(i)}`))].map((corner) => corner.split(",").map(Number));
      expect(feet.length, where).toBeGreaterThan(4);
      let shallowest = Infinity;
      for (const stand of along(title, phone)) for (const [x, z] of feet) shallowest = Math.min(shallowest, groundAt(stand, x, z) + SUNK[title]);
      if (shallowest < 0.2) expect.fail(`${where}: a foot ${shallowest} m under the ground beneath it, at the path's steepest`);
      // No deeper than it need be by more than a metre and a half: the depth is the slope's, not a guess.
      expect(shallowest, where).toBeLessThan(1.7);
    });
  });

  it("build the same on every visit, corner for corner and colour for colour", () => {
    tiers(({ position, color }, title, phone, where) => {
      const again = landmark(title, phone).parts.find((c) => (c.material as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial) as Part;
      expect(again.geometry.attributes.position.count, where).toBe(position.count);
      for (let i = 0; i < position.count; i++) {
        if (cornerKey(again.geometry.attributes.position, i) !== cornerKey(position, i) || cornerKey(again.geometry.attributes.color, i) !== cornerKey(color, i)) expect.fail(`${where}: corner ${i} differs on a second build`);
      }
    });
  });

  it("cost at most 2,000 triangles each on a desktop and 1,300 on a phone, a phone's no more than a desktop's, and under 4,600 and 3,300 between them", () => {
    const cost = (title: string, phone: boolean) => triangles(built(title, phone).parts);
    for (const title of FIVE) {
      expect(cost(title, false), title).toBeLessThanOrEqual(2000);
      expect(cost(title, true), title).toBeLessThanOrEqual(1300);
      expect(cost(title, true), title).toBeLessThanOrEqual(cost(title, false));
      // And each is built of many parts: over a hundred triangles, on a phone too.
      expect(cost(title, true), title).toBeGreaterThan(100);
    }
    expect(FIVE.reduce((sum, title) => sum + cost(title, false), 0)).toBeLessThan(4600);
    expect(FIVE.reduce((sum, title) => sum + cost(title, true), 0)).toBeLessThan(3300);
  });

  // The three drums: where each stands, how high its head is, its shell's radius at its rim, and its wood.
  const DRUMS = [{ name: "bass", x: 2.4, z: -1, tall: 1.85, rim: 1.62, wood: OXBLOOD }, { name: "goblet", x: 0.6, z: 1, tall: 2.98, rim: 0.92, wood: HONEY }, { name: "barrel", x: -2, z: 0, tall: 2.45, rim: 1.12, wood: TIMBER }];
  const HEAD = 0.16, HOOP = 0.14;
  const about = (piece: Piece, { x, z }: { x: number; z: number }) => Math.abs((piece.x0 + piece.x1) / 2 - x) < 0.06 && Math.abs((piece.z0 + piece.z1) / 2 - z) < 0.06;
  const reachFrom = (position: Corners, corners: number[], { x, z }: { x: number; z: number }) => Math.max(...corners.map((i) => Math.hypot(position.getX(i) - x, position.getZ(i) - z)));

  it("builds each drum whole: a shell that goes up into its head, the skin's edge turned down over the rim, and the hoop under it", () => {
    for (const phone of [false, true]) {
      const drums = built("Drums", phone), { position, pieces } = drums, heads = of(drums, SKIN);
      expect(heads).toHaveLength(3);
      for (const drum of DRUMS) {
        const where = `the ${drum.name} drum${phone ? " on a phone" : ""}`;
        // The head: 0.16 m of skin from its top down, 4 cm wider than the shell all round.
        const head = heads.find((piece) => about(piece, drum)) as Piece;
        expect(head.high, where).toBeCloseTo(drum.tall, 5);
        expect(head.low, where).toBeCloseTo(drum.tall - HEAD, 5);
        expect(reachFrom(position, head.corners, drum), where).toBeCloseTo(drum.rim + 0.04, 4);
        // The shell goes 3.2 m under and up to the head's top, inside the skin's edge: a head set over the shell's rim would
        // show a gap under the skin, and one set lower would let the rim through.
        const shell = of(drums, drum.wood).find((piece) => about(piece, drum) && piece.low < -3) as Piece;
        expect(shell.high, where).toBeCloseTo(drum.tall, 5);
        expect(reachFrom(position, shell.corners.filter((i) => position.getY(i) > drum.tall - 1e-3), drum), where).toBeCloseTo(drum.rim, 4);
        // The hoop: straight under the head, and wider than it.
        const hoop = pieces.find((piece) => about(piece, drum) && Math.abs(piece.high - (drum.tall - HEAD)) < 1e-4 && piece !== head) as Piece;
        expect(hoop.low, where).toBeCloseTo(drum.tall - HEAD - HOOP, 5);
        expect(reachFrom(position, hoop.corners, drum), where).toBeCloseTo(drum.rim + 0.09, 4);
      }
    }
  });

  it("laces the bass drum from hoop to hoop and the goblet round its bowl, each length of rope lying on the shell and clear of it, and draws the barrel's head down with rods", () => {
    // How far out a shell of `sides` flat sides stands toward a place, where its corners stand `r` out.
    const flat = (r: number, sides: number, dx: number, dz: number) => { const step = (2 * Math.PI) / sides, turn = Math.atan2(dx, dz); return (r * Math.cos(step / 2)) / Math.cos((((turn % step) + step) % step) - step / 2); };
    for (const phone of [false, true]) {
      const drums = built("Drums", phone), { position } = drums, sides = phone ? 8 : 12, ropes = of(drums, STRING), [bass, goblet, barrel] = DRUMS;
      // The bass drum's rope, sixteen lengths in eight V's, from its low hoop's top to its upper hoop's foot.
      const round = ropes.filter((rope) => rope.high < bass.tall), bowl = ropes.filter((rope) => rope.low > bass.tall - HEAD - HOOP);
      expect(round).toHaveLength(16);
      expect(bowl).toHaveLength(phone ? 8 : 12);
      expect(Math.max(...round.map((rope) => rope.high))).toBeLessThan(Math.min(...bowl.map((rope) => rope.low)));
      expect(round.length + bowl.length).toBe(ropes.length);
      const middle = (rope: Piece) => [0, 1, 2].map((axis) => rope.corners.reduce((sum, i) => sum + point(position, i)[axis], 0) / rope.corners.length);
      for (const rope of round) {
        expect(Math.abs(rope.low - 0.44)).toBeLessThan(0.03);
        expect(Math.abs(rope.high - (bass.tall - HEAD - HOOP))).toBeLessThan(0.03);
        // Its middle is outside the shell's flat there: a rope strung from corner to corner of a round drum cuts through it.
        const [x, , z] = middle(rope), out = Math.hypot(x - bass.x, z - bass.z) - flat(bass.rim, sides, x - bass.x, z - bass.z);
        if (out < 0.03 || out > 0.16) expect.fail(`a rope of the bass drum${phone ? " on a phone" : ""}: its middle ${out} m outside the shell`);
      }
      // The goblet's, from the ring at its bowl's foot to its hoop's foot, along the bowl, which is straight between them.
      for (const rope of bowl) {
        expect(Math.abs(rope.low - 1.71)).toBeLessThan(0.03);
        expect(Math.abs(rope.high - (goblet.tall - HEAD - HOOP))).toBeLessThan(0.03);
        const [x, y, z] = middle(rope), shell = 0.7 + ((y - 1.66) * (0.94 - 0.7)) / (2.72 - 1.66), out = Math.hypot(x - goblet.x, z - goblet.z) - flat(shell, sides, x - goblet.x, z - goblet.z);
        if (out < 0.03 || out > 0.16) expect.fail(`a rope of the goblet drum${phone ? " on a phone" : ""}: its middle ${out} m outside the bowl`);
      }
      // The barrel's rods: thin iron from its upper band, 1.53 to 1.63 m up, into its hoop.
      const rods = of(drums, IRON).filter((piece) => piece.x1 - piece.x0 < 0.2 && piece.z1 - piece.z0 < 0.2);
      expect(rods).toHaveLength(phone ? 4 : 6);
      for (const rod of rods) {
        expect(rod.low).toBeGreaterThan(1.53);
        expect(rod.low).toBeLessThan(1.63);
        expect(rod.high).toBeGreaterThan(barrel.tall - HEAD - HOOP);
        expect(rod.high).toBeLessThan(barrel.tall - HEAD);
      }
    }
  });

  it("lays the two beaters on the bass drum's head: each stick and each padded end rests on the skin, a centimetre or two into it", () => {
    for (const phone of [false, true]) {
      const drums = built("Drums", phone), { position } = drums, bass = DRUMS[0], laid = [...of(drums, BEATER), ...of(drums, LEATHER)];
      expect(of(drums, BEATER)).toHaveLength(2);
      expect(of(drums, LEATHER)).toHaveLength(2);
      for (const piece of laid) {
        // On the head, not past its edge; and straight under its lowest corner is the skin, which is level: 0.5 to 3 cm over it.
        expect(reachFrom(position, piece.corners, bass)).toBeLessThan(bass.rim);
        const into = bass.tall - piece.low;
        if (into < 0.005 || into > 0.03) expect.fail(`a beater${phone ? " on a phone" : ""}: ${into} m into the head`);
      }
    }
  });

  it("stands the drums level on a slope: each drum's hoop is over the ground at the left cave, where Drums is pinned, and the goblet's and the barrel's anywhere on the path", () => {
    const [bass, goblet, barrel] = DRUMS;
    // The highest ground under a drum's own place, over the landmark's own ground.
    const under = (stand: Stand, drum: (typeof DRUMS)[number]) => {
      let most = -Infinity;
      for (let k = 0; k < 24; k++) for (const share of [0.5, 1]) most = Math.max(most, groundAt(stand, drum.x + share * (drum.rim + 0.09) * Math.cos((k * Math.PI) / 12), drum.z + share * (drum.rim + 0.09) * Math.sin((k * Math.PI) / 12)));
      return most;
    };
    const hoopFoot = (drum: (typeof DRUMS)[number]) => drum.tall - HEAD - HOOP;
    // The left cave is loop point 13: the drums stand on its own point, where the ground climbs a metre under the bass drum.
    const cave = standAt(path.pointU(13), built("Drums").outline);
    expect(cave.off).toBe(0);
    for (const drum of DRUMS) expect(under(cave, drum), drum.name).toBeLessThan(hoopFoot(drum) - 0.05);
    expect(under(cave, bass)).toBeGreaterThan(0.9);
    // Anywhere on the path: the goblet's hoop and the barrel's clear the ground. The bass drum's, 1.55 m up, cannot everywhere:
    // the ground stands over it along a twentieth of the path or so, where no show has yet stood the drums.
    const stands = along("Drums");
    for (const stand of stands) for (const drum of [goblet, barrel]) if (under(stand, drum) >= hoopFoot(drum)) expect.fail(`the ${drum.name} drum: the ground stands ${under(stand, drum)} m under it, over its hoop's foot`);
    const lost = stands.filter((stand) => under(stand, bass) >= hoopFoot(bass)).length / stands.length;
    expect(lost).toBeGreaterThan(0.02);
    expect(lost).toBeLessThan(0.08);
  });

  it("hangs the banner from the yard, the yard from the pole, and the cord and the halyard between them", () => {
    for (const phone of [false, true]) {
      const pole = built("Walkin' Blues", phone), { position } = pole, where = phone ? "on a phone" : "on a desktop";
      const [banner] = of(pole, BLUE, PALE_BLUE), [yard] = of(pole, DARK_TIMBER), post = pole.pieces[0], cords = of(pole, STRING).sort((x, y) => x.low - y.low);
      expect(of(pole, BLUE, PALE_BLUE), where).toHaveLength(1);
      expect(cords, where).toHaveLength(2);
      // How far out the pole's flat faces stand at a height: its corners' reach at the rings under and over it, taken across,
      // less what a flat of its sides loses.
      const rings = [...new Map(post.corners.map((i) => [Math.round(position.getY(i) * 1e4), [position.getY(i), Math.hypot(position.getX(i), position.getZ(i))]])).values()].sort((x, y) => x[0] - y[0]);
      const girth = (y: number) => { const n = rings.findIndex(([at]) => at > y), [y0, r0] = rings[n - 1], [y1, r1] = rings[n]; return (r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)) * Math.cos(Math.PI / (phone ? 6 : 8)); };
      // The pole goes into the ground and stands under 12 m, clear of a phone's title plate.
      expect(post.low, where).toBeCloseTo(-1.6, 5);
      expect(post.high, where).toBeLessThanOrEqual(12);
      expect(post.high, where).toBeGreaterThan(11.5);
      // The yard begins inside the pole, and the banner hangs from its underside, no wider than it: a banner set lower hangs from
      // nothing.
      expect(yard.x0, where).toBeLessThan(girth((yard.low + yard.high) / 2));
      expect(yard.high, where).toBeGreaterThan(11.2);
      expect(banner.high, where).toBeCloseTo(yard.low, 5);
      expect(banner.x0, where).toBeGreaterThanOrEqual(yard.x0);
      expect(banner.x1, where).toBeLessThanOrEqual(yard.x1);
      // It is cloth, its broad face to the walker: 5 cm through, 2.75 m wide and 5.2 m long to its two tails' tips, which end
      // over a bear's head.
      expect(banner.z1 - banner.z0, where).toBeLessThanOrEqual(0.05 + 1e-6);
      expect(banner.x1 - banner.x0, where).toBeGreaterThan(2.7);
      expect(banner.high - banner.low, where).toBeGreaterThan(5);
      expect(banner.low, where).toBeGreaterThan(5);
      // Its bands are the banner's own cloth, two pale ones between three blue: each face is one or the other, and no part of it
      // stands proud of the cloth.
      const pale = banner.corners.filter((i) => tinted(pole.color, i, [PALE_BLUE]));
      expect(pale.length / 3, where).toBe(24);
      expect(new Set(pale.map((i) => Math.round(position.getY(i) * 1e3) / 1e3)).size, where).toBe(4);
      // The halyard hangs from the yard's underside down to the cleat, which is set into the pole; the lift cord runs from the
      // pole's middle to the yard's top.
      const [halyard, lift] = cords, cleat = of(pole, BRASS).find((piece) => piece.high < 2 && piece.x1 - piece.x0 < 0.2) as Piece;
      expect(halyard.high, where).toBeCloseTo(yard.low, 5);
      expect(halyard.low, where).toBeGreaterThan(cleat.low);
      expect(halyard.low, where).toBeLessThan(cleat.high);
      expect(cleat.x0, where).toBeLessThan(girth(1.4));
      expect(lift.x0, where).toBeLessThan(girth(11.5));
      expect(lift.high, where).toBeGreaterThan(yard.high + 0.3);
      expect(Math.abs(lift.low - yard.high), where).toBeLessThan(0.04);
    }
  });

  it("builds Space's wall on the disc's own corners, bit for bit, from the stones' shoulders to under the disc, so none of the disc shows past it", () => {
    for (const phone of [false, true]) {
      const { position } = built("Space", phone), disc = new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2).attributes.position as Corners;
      // Each of the disc's 24 corners has the wall's corner at its very place at the shoulder, 0.3 m up, and 0.1 m up, under the
      // disc: a wall a hair inside the disc's edge leaves a black line round it, seen from down the hill.
      for (let k = 1; k <= 24; k++) {
        for (const y of [0.3, 0.1]) {
          let there = false;
          for (let i = 0; i < position.count && !there; i++) there = position.getX(i) === disc.getX(k) && position.getZ(i) === disc.getZ(k) && Math.abs(position.getY(i) - y) < 1e-6;
          if (!there) expect.fail(`no corner of the wall at the disc's corner ${k}, ${y} m up${phone ? ", on a phone" : ""}`);
        }
      }
    }
  });

  it("leaves no way in under Space's disc, and stands a stone over it all round, none over 0.8 m", () => {
    for (const phone of [false, true]) {
      const { position, pieces } = built("Space", phone);
      // The rim is one piece: the wall, and the stones that share its shoulder.
      expect(pieces).toHaveLength(1);
      let highest = -Infinity, lowest = Infinity;
      for (let turn = 0; turn < 360; turn += 1.5) {
        const cos = Math.cos((turn * Math.PI) / 180), sin = Math.sin((turn * Math.PI) / 180);
        // A level line from 6 m out toward the middle, at any height from the wall's foot to its shoulder, meets the wall within
        // 0.3 m of the disc's edge, which is 4.96 to 5 m out: a gap between two stones, or a face left out, lets it through.
        for (const y of [-4.9, -4, -3, -2.2, -1.5, -0.8, -0.2, 0.08, 0.14, 0.2, 0.28]) {
          const [first] = meetings(position, pieces[0], [6 * cos, y, 6 * sin], [-cos, 0, -sin]);
          if (!(first < 6 - 4.65)) expect.fail(`a way in under the disc, ${turn} degrees round and ${y} m up${phone ? ", on a phone" : ""}: the wall is met ${first} m along`);
        }
        // Straight down onto the rim, 4.6 m out: a stone's head, over the disc and no higher than 0.8 m.
        const [down] = meetings(position, pieces[0], [4.6 * cos, 3, 4.6 * sin], [0, -1, 0]);
        highest = Math.max(highest, 3 - down); lowest = Math.min(lowest, 3 - down);
      }
      expect(lowest).toBeGreaterThan(0.15 + 0.02);
      expect(highest).toBeLessThanOrEqual(0.8);
      // The stones are unequal: some heads over 0.6 m, and clefts between them under 0.35 m.
      expect(highest).toBeGreaterThan(0.6);
      expect(lowest).toBeLessThan(0.35);
    }
  });

  it("holds Space's disc on the right cave's slope: the wall's foot is far under the ground where it falls away, and the hill's side of the disc lies in the hill as main's does", () => {
    const { position, outline } = built("Space"), cave = standAt(path.pointU(14), outline);
    // Space is pinned to loop point 14, the right cave, and stands on its point.
    expect(cave.off).toBe(0);
    // Round the disc's edge there, the ground against the disc, which lies 0.15 m over the landmark's own ground.
    let over = -Infinity, under = Infinity;
    for (let turn = 0; turn < 360; turn += 2) { const ground = groundAt(cave, 4.96 * Math.cos((turn * Math.PI) / 180), 4.96 * Math.sin((turn * Math.PI) / 180)) - 0.15; over = Math.max(over, ground); under = Math.min(under, ground); }
    // On the hill's side the ground stands 3 m over the disc's edge: a level disc 10 m across lies in this slope, here as on main,
    // and nothing in a landmark can lift it out. On the other side the ground falls 2.2 m under the edge, and there the wall holds
    // it: its foot is 2.5 m or more under the ground beneath it.
    expect(over).toBeGreaterThan(2.8);
    expect(over).toBeLessThan(3.3);
    expect(under).toBeLessThan(-2);
    expect(under).toBeGreaterThan(-2.4);
    let shallowest = Infinity;
    for (let i = 0; i < position.count; i++) if (position.getY(i) < -5 + 1e-3) shallowest = Math.min(shallowest, groundAt(cave, position.getX(i), position.getZ(i)) + 5);
    expect(shallowest).toBeGreaterThan(2.5);
  });

  it("grows the magnolia whole: a trunk up into a crown of leaf clumps as broad and as low as the plain bush was, and each blossom's foot in the leaves with its tip out of them", () => {
    for (const phone of [false, true]) {
      const tree = built("Sugar Magnolia", phone), { position } = tree, where = phone ? "on a phone" : "on a desktop";
      const clumps = of(tree, ...LEAVES), buds = of(tree, ...PETALS), bark = of(tree, BARK);
      // Sixteen clumps round a dark heart, and a blossom on each; a phone's, eleven, and twelve blossoms.
      expect(clumps, where).toHaveLength(phone ? 12 : 17);
      expect(buds, where).toHaveLength(phone ? 12 : 16);
      const inLeaves = (at: [number, number, number]) => clumps.filter((clump) => within(position, clump, at)).length;
      // The trunk goes 1.6 m under, shows under the crown, and ends inside it.
      expect(bark, where).toHaveLength(1);
      expect(bark[0].low, where).toBeCloseTo(-1.6, 5);
      expect(inLeaves([0, bark[0].high - 0.01, 0]), where).toBeGreaterThan(0);
      const lowest = Math.min(...clumps.map((clump) => clump.low));
      expect(lowest, where).toBeGreaterThan(0.3);
      expect(inLeaves([0, lowest - 0.05, 0]), where).toBe(0);
      // The crown holds the plain bush's frame: 3.2 m or more across the path, from 0.6 m over the ground or lower to 3.2 m or
      // higher. A crown drawn in to a ball on a tall stem shows the walker half of what the bush did.
      expect(Math.max(...clumps.map((clump) => clump.x1)) - Math.min(...clumps.map((clump) => clump.x0)), where).toBeGreaterThan(3.2);
      expect(lowest, where).toBeLessThan(0.6);
      expect(Math.max(...clumps.map((clump) => clump.high)), where).toBeGreaterThan(3.2);
      for (const bud of buds) {
        // A bud's two ends are its two corners furthest apart: its foot, where its petals begin, and its tip. Its foot is inside
        // a clump, and its tip outside every clump: a blossom set off the leaves hangs in the air, and one sunk in them is lost.
        let ends: [number, number] = [bud.corners[0], bud.corners[0]], far = 0;
        const own = [...new Map(bud.corners.map((i) => [cornerKey(position, i), i])).values()];
        for (const i of own) for (const j of own) { const gap = Math.hypot(...point(position, i).map((v, axis) => v - point(position, j)[axis])); if (gap > far) { far = gap; ends = [i, j]; } }
        const inside = ends.map((i) => inLeaves(point(position, i)) > 0);
        if (inside.filter(Boolean).length !== 1) expect.fail(`a blossom of the magnolia ${where}: its ends ${ends.map((i) => point(position, i))} are ${inside} in the leaves`);
        // It is a great blossom, half a metre long or so, pale over a blush foot.
        expect(far, where).toBeGreaterThan(0.38);
        expect(far, where).toBeLessThan(0.75);
        expect(bud.corners.some((i) => tinted(tree.color, i, [PETALS[2]])) && bud.corners.some((i) => tinted(tree.color, i, [PETALS[0]])), where).toBe(true);
      }
    }
  });

  it("leans the two stones on each other: the lesser is brought in to the taller until they touch, and 5 cm further, high up, with the sky between them below", () => {
    for (const phone of [false, true]) {
      const stones = built("Good Lovin'", phone), { position, pieces } = stones, where = phone ? "on a phone" : "on a desktop";
      expect(pieces, where).toHaveLength(2);
      const [taller, other] = pieces;
      expect(taller.high, where).toBeGreaterThan(other.high + 0.3);
      // Where the level line through (y, z) along x meets a piece: the furthest it reaches that way, or the least.
      const reach = (piece: Piece, y: number, z: number, most: boolean) => {
        const hits = meetings(position, piece, [-10, y, z], [1, 0, 0]).map((t) => t - 10);
        return hits.length ? (most ? Math.max(...hits) : Math.min(...hits)) : most ? -Infinity : Infinity;
      };
      // How far apart they stand, side by side: under each corner of one, along x, to the other's face; the least of those, and
      // where. Nothing, and they only touch at a point; more, and they stand apart; much less, and one is sunk in the other.
      let apart = Infinity, at = 0;
      for (const i of other.corners) { const [x, y, z] = point(position, i), gap = x - reach(taller, y, z, true); if (gap < apart) { apart = gap; at = y; } }
      for (const i of taller.corners) { const [x, y, z] = point(position, i), gap = reach(other, y, z, false) - x; if (gap < apart) { apart = gap; at = y; } }
      expect(apart, where).toBeCloseTo(-0.05, 3);
      // They meet at the lesser one's head, well over a bear.
      expect(at, where).toBeGreaterThan(3.5);
      // Below, they stand apart with the sky between: 1.5 m of it a metre up, and 0.6 m still at 2.5 m.
      const span = (piece: Piece, y: number) => {
        const xs: number[] = [];
        for (let n = 0; n < piece.corners.length; n += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
          const [x0, y0] = point(position, piece.corners[n + i]), [x1, y1] = point(position, piece.corners[n + j]);
          if ((y0 - y) * (y1 - y) < 0) xs.push(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
        }
        return { x0: Math.min(...xs), x1: Math.max(...xs) };
      };
      expect(span(other, 1).x0 - span(taller, 1).x1, where).toBeGreaterThan(1.5);
      expect(span(other, 2.5).x0 - span(taller, 2.5).x1, where).toBeGreaterThan(0.6);
      // Each leans in, as the plain blocks did: its middle is a metre or more nearer the other at 4 m than at half a metre. And
      // each is a slab with its broad face to the walker: 1.3 m or more across the path at 2 m, where a block was a metre.
      const middle = (piece: Piece, y: number) => (span(piece, y).x0 + span(piece, y).x1) / 2;
      expect(middle(taller, 4) - middle(taller, 0.5), where).toBeGreaterThan(1);
      expect(middle(other, 0.5) - middle(other, 4), where).toBeGreaterThan(1);
      for (const piece of pieces) expect(span(piece, 2).x1 - span(piece, 2).x0, where).toBeGreaterThan(1.3);
    }
  });
});
