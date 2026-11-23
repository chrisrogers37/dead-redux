import { beforeAll, describe, expect, it } from "vitest";
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
// Whether a corner is painted a tone, to a rounding. A tone's colour is worked out once.
const colours = new Map<number, THREE.Color>(), colourOf = (hex: number) => colours.get(hex) ?? (colours.set(hex, new THREE.Color(hex)).get(hex) as THREE.Color);
const isTone = (color: Corners, i: number, hex: number) => { const tone = colourOf(hex); return Math.abs(color.getX(i) - tone.r) + Math.abs(color.getY(i) - tone.g) + Math.abs(color.getZ(i) - tone.b) < 1e-4; };
// A span across the path.
type Span = { x0: number; x1: number };
// A piece's faces, one at a time, as three points.
const [a, b, c] = [0, 1, 2].map(() => new THREE.Vector3());
const face = (position: Corners, corners: number[], n: number) => { a.fromBufferAttribute(position, corners[n]); b.fromBufferAttribute(position, corners[n + 1]); c.fromBufferAttribute(position, corners[n + 2]); };
// Where a piece is cut by the level `y`: its span across the path there (or along it, "z"), or null where it does not reach that
// height.
const sliced = (position: Corners, piece: Piece, y: number, along: "x" | "z" = "x"): Span | null => {
  const xs: number[] = [];
  for (let n = 0; n < piece.corners.length; n += 3) {
    face(position, piece.corners, n);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) if ((p.y - y) * (q.y - y) < 0) xs.push(p[along] + ((q[along] - p[along]) * (y - p.y)) / (q.y - p.y));
  }
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs) } : null;
};
// A foot's ring: the places [x, z] of the corners at a depth or under it, each once.
const footRing = (position: Corners, corners: number[], depth: number) => [...new Set(corners.filter((i) => position.getY(i) < depth + 1e-3).map((i) => `${position.getX(i)},${position.getZ(i)}`))].map((corner) => corner.split(",").map(Number));
// Every show's songs as its map has them, and one show's.
const shows = readdirSync(new URL("../../../public/maps", import.meta.url)).filter((file) => file.endsWith(".json")).sort().map((file) => {
  const map = JSON.parse(readFileSync(new URL(`../../../public/maps/${file}`, import.meta.url), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
  return { show: file.slice(0, -5), tracks: map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration })) };
});
const tracksOf = (show: string) => (shows.find((one) => one.show === show) as (typeof shows)[number]).tracks;
// The world's own path and the bears' line, a point every quarter metre; and where a landmark with an outline stands at a place
// along the path: the spot standClear gives it, its turn, its own ground's height, and how far that is from the path's point.
const path = buildPath(), line = buildWalkLine(path, 7), linePoints: [number, number][] = [];
for (let d = 0; d < line.length; d += 0.25) { const at = line.at(d); linePoints.push([at.x, at.z]); }
type Stand = { x: number; z: number; cos: number; sin: number; own: number; off: number };
const standAt = (u: number, outline: number[][]): Stand => {
  const at = path.at(u), t = path.tangentAt(u), turn = Math.atan2(t.x, t.z), stood = standClear(at.x, at.z, turn, outline, linePoints);
  return { x: stood.x, z: stood.z, cos: Math.cos(turn), sin: Math.sin(turn), own: height(stood.x, stood.z), off: Math.hypot(stood.x - at.x, stood.z - at.z) };
};
// How high the ground under a place of a landmark's own frame stands over the landmark's own ground: it stands level, turned
// about the vertical.
const groundAt = (stand: Stand, x: number, z: number) => height(stand.x + x * stand.cos + z * stand.sin, stand.z - x * stand.sin + z * stand.cos) - stand.own;
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
    const { position, color } = part.geometry.attributes;
    let n = 0, low = Infinity, high = -Infinity;
    for (let i = 0; i < position.count; i += 3) {
      if (!isTone(color, i, hex)) continue;
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
    const tracks = tracksOf("1986-07-04"), landmarkU = layout(tracks, 7, path);
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
  // The titles no rule matches: those get a standing stone.
  const tiers = [builders(false), builders(true)], falls = (title: string) => !tiers[0].table.some(([re]) => re.test(title));
  const fallers = [...new Set(shows.flatMap(({ tracks }) => tracks.map((t) => t.title).filter(falls)))];
  // The kinds in the order of a title's kind.
  const MENHIR = 0, HOLED = 1, SPLIT = 2, CAIRN = 3, TRILITHON = 4, PAIR = 5, STELE = 6, ROCK = 7, KINDS = [0, 1, 2, 3, 4, 5, 6, 7];
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
  const across = (position: Corners, piece: Piece, from: number, to: number): Span => {
    const xs = piece.corners.filter((i) => position.getY(i) >= from && position.getY(i) <= to).map((i) => position.getX(i));
    return { x0: Math.min(...xs), x1: Math.max(...xs) };
  };
  const breadth = (span: Span) => span.x1 - span.x0, middle = (span: Span) => (span.x0 + span.x1) / 2;
  // A piece's foot: the ring of corners 1.6 m under the ground. Its middle is the middle of the piece's own ground.
  const footOf = (position: Corners, piece: Piece) => across(position, piece, -2, -1.5);
  // The highest corner among some.
  const tipOf = (position: Corners, corners: number[]) => corners.reduce((best, i) => (position.getY(i) > position.getY(best) ? i : best));
  // What is reckoned from a piece's faces: how much stone is in the piece, in cubic metres, from its faces as they are wound (a
  // piece built inside out gives less than nothing); its least face, in square metres; and which way a face looks.
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
  // What a stone of each tone may wear, worked out here as the world works it out: its own tone, a shade darker and a shade lighter,
  // a paler one where it is freshly broken or cut, and its own under moss and under lichen. And the plain block's own grey.
  const TONES: Record<string, number> = { grey: 0x969289, pale: 0xe6dfcf, bluestone: 0xa8bad2, sandstone: 0xcea670 }, BLOCK_GREY = 0x8e8a82, MOSSY = 0xa0b08c, LICHEN = 0xccb464;
  const channels = (hex: number) => [16, 8, 0].map((bit) => (hex >> bit) & 255), hexOf = (rgb: number[]) => rgb.reduce((sum, v) => sum * 256 + Math.min(255, Math.round(v)), 0);
  const shadeOf = (hex: number, k: number) => hexOf(channels(hex).map((v) => v * k)), blendOf = (hex: number, other: number, share: number) => hexOf(channels(hex).map((v, k) => v * (1 - share) + channels(other)[k] * share));
  const luma = (hex: number) => { const [r, g, b] = channels(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  type Wear = { own: number; dark: number; light: number; fresh: number; moss: number; lichen: number };
  const WEAR: Record<string, Wear> = Object.fromEntries(Object.entries(TONES).map(([name, hex]) => [name, { own: hex, dark: shadeOf(hex, 0.95), light: shadeOf(hex, 1.06), fresh: shadeOf(hex, 1.15), moss: blendOf(hex, MOSSY, 0.55), lichen: blendOf(hex, LICHEN, 0.55) }]));
  // What a face wears, of a tone's six; and a piece's own tone: the one whose six clothe the most of its corners.
  const wornOf = (color: Corners, i: number, tone: string) => Object.entries(WEAR[tone]).find(([, hex]) => isTone(color, i, hex))?.[0] ?? null;
  const toneOf = (color: Corners, piece: Piece) => Object.keys(TONES).map((name) => ({ name, hex: TONES[name], n: piece.corners.filter((i) => wornOf(color, i, name) !== null).length })).sort((p, q) => q.n - p.n)[0];
  // A face's colour, to tell two faces' apart.
  const colourKey = (color: Corners, i: number) => `${color.getX(i).toFixed(4)},${color.getY(i).toFixed(4)},${color.getZ(i).toFixed(4)}`;

  // How much of the view a stone holds, seen along the path from 14 m short of it with the eye 1.7 m up: every face over the level
  // ground is thrown from the eye onto the upright plane through the stone's middle, and what the faces cover there is counted on a
  // 2 cm grid: its area in square metres, and how wide and how high it stands. The plain block covers 7.78 m2 so. `turned` looks at
  // it from that far round to one side instead, in radians.
  const EYE = 1.7, BACK = 14, CELL = 0.02, WIDE = 130, HIGH = 250;
  const seen = (position: Corners, turned = 0) => {
    const grid = new Uint8Array(WIDE * HIGH);
    const thrown = ([x, y, z]: number[]) => { const k = BACK / (BACK + z); return [x * k, EYE + (y - EYE) * k]; }, cos = Math.cos(turned), sin = Math.sin(turned);
    const fill = (p: number[], q: number[], r: number[]) => {
      const d = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
      if (Math.abs(d) < 1e-12) return;
      const x0 = Math.max(0, Math.floor((Math.min(p[0], q[0], r[0]) + 1.3) / CELL)), x1 = Math.min(WIDE - 1, Math.ceil((Math.max(p[0], q[0], r[0]) + 1.3) / CELL));
      const y0 = Math.max(0, Math.floor(Math.min(p[1], q[1], r[1]) / CELL)), y1 = Math.min(HIGH - 1, Math.ceil(Math.max(p[1], q[1], r[1]) / CELL));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const px = (i + 0.5) * CELL - 1.3, py = (j + 0.5) * CELL;
        const u = ((q[0] - p[0]) * (py - p[1]) - (px - p[0]) * (q[1] - p[1])) / d, v = ((px - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (py - p[1])) / d;
        if (u >= 0 && v >= 0 && u + v <= 1) grid[j * WIDE + i] = 1;
      }
    };
    for (let n = 0; n < position.count; n += 3) {
      // The face over the ground: cut at the ground's level.
      const tri = [0, 1, 2].map((k) => [position.getX(n + k) * cos - position.getZ(n + k) * sin, position.getY(n + k), position.getX(n + k) * sin + position.getZ(n + k) * cos]), over: number[][] = [];
      tri.forEach((p, k) => {
        const q = tri[(k + 1) % 3];
        if (p[1] >= 0) over.push(p);
        if (p[1] >= 0 !== q[1] >= 0) { const t = p[1] / (p[1] - q[1]); over.push([p[0] + t * (q[0] - p[0]), 0, p[2] + t * (q[2] - p[2])]); }
      });
      const flat = over.map(thrown);
      for (let k = 1; k + 1 < flat.length; k++) fill(flat[0], flat[k], flat[k + 1]);
    }
    let n = 0, left = WIDE, right = 0, top = 0;
    for (let j = 0; j < HIGH; j++) for (let i = 0; i < WIDE; i++) if (grid[j * WIDE + i]) { n += 1; left = Math.min(left, i); right = Math.max(right, i); top = Math.max(top, j); }
    return { area: n * CELL * CELL, wide: (right - left + 1) * CELL, high: (top + 1) * CELL };
  };
  // How many of a piece's faces the line along the path through (x, y) passes through: none where the sky shows through the piece.
  const passed = (position: Corners, piece: Piece, x: number, y: number) => {
    let n = 0;
    for (let k = 0; k < piece.corners.length; k += 3) {
      face(position, piece.corners, k);
      const w0 = (b.x - x) * (c.y - y) - (c.x - x) * (b.y - y), w1 = (c.x - x) * (a.y - y) - (a.x - x) * (c.y - y), w2 = (a.x - x) * (b.y - y) - (b.x - x) * (a.y - y);
      if (Math.abs(w0 + w1 + w2) > 1e-9 && !((w0 < 0 || w1 < 0 || w2 < 0) && (w0 > 0 || w1 > 0 || w2 > 0))) n += 1;
    }
    return n;
  };
  // Where a piece's near face stands at (x, y): the least z at which the line along the path through there meets a face of it.
  const nearFace = (position: Corners, piece: Piece, x: number, y: number) => {
    let least = Infinity;
    for (let k = 0; k < piece.corners.length; k += 3) {
      face(position, piece.corners, k);
      const w0 = (b.x - x) * (c.y - y) - (c.x - x) * (b.y - y), w1 = (c.x - x) * (a.y - y) - (a.x - x) * (c.y - y), w2 = (a.x - x) * (b.y - y) - (b.x - x) * (a.y - y), w = w0 + w1 + w2;
      if (Math.abs(w) > 1e-9 && !((w0 < 0 || w1 < 0 || w2 < 0) && (w0 > 0 || w1 > 0 || w2 > 0))) least = Math.min(least, (w0 * a.z + w1 * b.z + w2 * c.z) / w);
    }
    return least;
  };
  // A piece's top: its corners within `deep` of its highest, and the one of them furthest to each side across the path.
  const topOf = (position: Corners, piece: Piece, deep: number) => {
    const corners = piece.corners.filter((i) => position.getY(i) > piece.high - deep);
    const by = (sign: number) => corners.reduce((best, i) => (sign * position.getX(i) > sign * position.getX(best) ? i : best));
    return { span: across(position, piece, piece.high - deep, piece.high), left: by(-1), right: by(1) };
  };

  // The highest the ground stands over a landmark's own ground under the old block's outline, wherever on the path the block would
  // stand: at every quarter metre of the path, where standClear puts the block, the ground under its outline and its inside every
  // 0.2 m. A stone is inside that outline, so no show can put the ground higher against one. It is 0.85 m; on the maps' own stands
  // it is 0.75 m.
  let rise: number | null = null;
  const highestGround = () => {
    if (rise !== null) return rise;
    const outline = hull([[-BLOCK.x, -BLOCK.z], [BLOCK.x, -BLOCK.z], [BLOCK.x, BLOCK.z], [-BLOCK.x, BLOCK.z]]);
    rise = 0;
    for (let d = 0; d < path.curveLength; d += 0.25) {
      const stand = standAt(d / path.curveLength, outline);
      for (let x = -BLOCK.x; x <= BLOCK.x + 1e-9; x += 0.2) for (let z = -BLOCK.z; z <= BLOCK.z + 1e-9; z += 0.2) rise = Math.max(rise, groundAt(stand, x, z));
    }
    return rise;
  };

  // How sharply a stone's faces meet: the least dot of the ways two faces that share an edge look. Two faces that lie one over the
  // other, the stone's skin folded there, give -1; the sharpest true edge of any kind, where a split stone's crack meets its side,
  // gives -0.8.
  const sharpest = (position: Corners) => {
    const ids = new Map<string, number>(), looks: THREE.Vector3[] = [], at = new Map<number, number[]>();
    let least = 1;
    for (let n = 0; n < position.count; n += 3) {
      a.fromBufferAttribute(position, n); b.fromBufferAttribute(position, n + 1); c.fromBufferAttribute(position, n + 2);
      const look = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const corners = [0, 1, 2].map((k) => { const key = cornerKey(position, n + k); if (!ids.has(key)) ids.set(key, ids.size); return ids.get(key) as number; });
      for (let k = 0; k < 3; k++) {
        const p = corners[k], q = corners[(k + 1) % 3], edge = Math.min(p, q) * 4096 + Math.max(p, q), there = at.get(edge) ?? [];
        for (const other of there) least = Math.min(least, looks[other].dot(look));
        at.set(edge, [...there, looks.length]);
      }
      looks.push(look);
    }
    return least;
  };

  // Every stone the tests read is built here, once, on both tiers; every show is placed, with its stones and with the plain block in
  // their places; and the highest ground is reckoned. So no test's own time is the building's or the placing's, and a busy machine
  // has no reason to time one out. The four tests that still take a third of a second or more on a quiet machine say how long they
  // may take.
  beforeAll(() => {
    for (const phone of [false, true]) for (const title of EVERY) stone(title, phone);
    for (const { show, tracks } of shows) for (const phone of [false, true]) for (const block of [false, true]) placed(show, tracks, phone, block);
    highestGround();
  }, 120000);
  const SLOW = { timeout: 20000 };

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

  it("builds every stone as one still mesh whose pieces are closed, with their faces outward and none of no area, each standing 1.6 m into the ground or on another piece that does", SLOW, () => {
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

  it("folds no stone's skin over itself, of any kind, on a desktop or a phone: no two faces that share an edge look opposite ways, and each face of a holed stone's two broad sides looks out", SLOW, () => {
    // A closed piece whose every edge is used once each way, with stone in it, has no face wound against its neighbours; but its
    // skin can still cross itself, a face laid back over the next, and neither of those tests sees that. This one does, over the
    // maps' songs and the first 2,000 that no show has played, 250 of a kind, on both tiers.
    const titles = [...fallers, ...Array.from({ length: 2000 }, (_, n) => `A Song No Show Has Played ${n}`)], least = KINDS.map(() => 1);
    for (const phone of [false, true]) {
      for (const title of titles) {
        const position = stones.has(`${phone}:${title}`) ? stone(title, phone).position : build(title, phone)[0].geometry.attributes.position;
        const kind = stoneKind(title), dot = sharpest(position), where = `"${title}"${phone ? " on a phone" : ""}`;
        least[kind] = Math.min(least[kind], dot);
        if (dot < -0.9) expect.fail(`${where}: two faces that share an edge look opposite ways (${dot})`);
        // A holed stone's broad sides are many faces laid round the hole, and a fold there may be a gentle one. So each face whose
        // corners are all on the near side must look back along the path, and each on the far side on along it.
        if (kind !== HOLED) continue;
        for (let n = 0; n < position.count; n += 3) {
          a.fromBufferAttribute(position, n); b.fromBufferAttribute(position, n + 1); c.fromBufferAttribute(position, n + 2);
          if (a.z * b.z <= 0 || b.z * c.z <= 0) continue;
          const side = Math.sign(a.z), out = b.sub(a).cross(c.sub(a)).normalize().z * side;
          if (out < 0.1) expect.fail(`${where}: a face of its ${side < 0 ? "near" : "far"} side looks ${out} of the way out`);
        }
      }
    }
    // The test has seen sharp edges that are no fold: a split stone's are under -0.4 somewhere; and a holed stone's faces meet far
    // more gently than a fold, over -0.5 everywhere.
    expect(least[SPLIT]).toBeLessThan(-0.4);
    expect(least[HOLED]).toBeGreaterThan(-0.5);
  });

  it("costs at most 240 triangles a stone on a desktop and 150 on a phone, a phone's no more than a desktop's, and each kind what it is said to cost", () => {
    // A kind's triangles on a desktop and on a phone, in the order of the kinds: every title's stone of a kind costs the same.
    const COST = [[162, 98], [208, 132], [208, 132], [156, 150], [180, 100], [184, 110], [144, 120], [164, 124]];
    for (const [desktop, phone] of COST) expect(desktop <= 240 && phone <= 150 && phone <= desktop && phone >= 40, `${desktop}, ${phone}`).toBe(true);
    for (const title of EVERY) {
      const cost = [stone(title).faces, stone(title, true).faces];
      if (cost.join() !== COST[stoneKind(title)].join()) expect.fail(`"${title}": ${cost[0]} triangles on a desktop, ${cost[1]} on a phone`);
    }
  });

  it("holds the frame the block held: seen along the path from 14 m a menhir, a holed stone, a stele and a rock on a rock each cover three quarters of what the block covered, and a pair, a split stone, a cairn and a trilithon stand as wide and as tall with the sky in them; and from 60 degrees to one side the four still cover half", SLOW, () => {
    // The plain block itself, by the same count.
    const block = seen(new THREE.BoxGeometry(1.6, 4.5 + 1.6, 1.2).translate(0, (4.5 - 1.6) / 2, 0).toNonIndexed().attributes.position as unknown as Corners);
    expect(block.area).toBeGreaterThan(7.7);
    expect(block.area).toBeLessThan(7.86);
    // And from 60 degrees to one side, where the bears' line and the path's bends put a visitor: the block turned as far covers
    // 8.5 m2, and a stone is held to a lower bar there, since each is a slab or a pile with its broad side to the path. Half for
    // the four (the holed stone, 0.6 m thick, is the least of them at 0.54); 0.45 for a pair, a split stone and a trilithon; 0.3
    // for a cairn.
    const SIDE = Math.PI / 3, aside = seen(new THREE.BoxGeometry(1.6, 4.5 + 1.6, 1.2).translate(0, (4.5 - 1.6) / 2, 0).toNonIndexed().attributes.position as unknown as Corners, SIDE);
    expect(aside.area).toBeGreaterThan(8.3);
    expect(aside.area).toBeLessThan(8.7);
    const least = KINDS.map(() => 1), OPEN = [PAIR, SPLIT, CAIRN, TRILITHON];
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const kind = stoneKind(title), view = seen(stone(title, phone).position), share = view.area / block.area, where = `"${title}"${phone ? " on a phone" : ""}`;
        least[kind] = Math.min(least[kind], share);
        const fromSide = seen(stone(title, phone).position, SIDE).area / aside.area;
        if (fromSide < (kind === CAIRN ? 0.3 : OPEN.includes(kind) ? 0.45 : 0.5)) expect.fail(`${where}: covers ${fromSide} of the block's view from 60 degrees to one side`);
        // The four whose gaps are the point: the sky shows in them, so they cover less (a pair two thirds, since one of its two
        // stones is the shorter by a quarter), and they stand as wide and as tall.
        if (OPEN.includes(kind)) {
          if (share < 0.4 || share > 0.75 || view.wide < 1.25 || view.high < 3.85) expect.fail(`${where}: covers ${share} of the block's view, ${view.wide} m wide and ${view.high} m high`);
        } else if (share < 0.75 || share > 1) expect.fail(`${where}: covers ${share} of the block's view`);
      }
    }
    // The least of each kind over the maps' songs and the unplayed: the four are close over the bar, with little to spare, since the
    // block allows no stone more than 1.6 m of breadth.
    for (const kind of [MENHIR, HOLED, STELE, ROCK]) expect(least[kind], `kind ${kind}`).toBeLessThan(0.85);
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
      // (A stele is the block's own grey, whatever its song: its own test has that.)
      if (kind !== STELE) expect(tones.size, `kind ${kind}`).toBe(4);
      // The cairn's top stone stands over the middle, and a stele's top is level (its own test has which way it leans); every other
      // kind turns both ways.
      if (![CAIRN, STELE].includes(kind)) expect([...turns].sort(), `kind ${kind}`).toEqual([-1, 1]);
    }
  });

  it("clothes a stone in its tone, a face here and there a shade darker or lighter, and lets moss and lichen grow only as pale patches on its small faces, over its foot", () => {
    // The shares are of all the maps' stones' faces together: one stone may be more overgrown by a roll, and a new map's must not
    // turn this red.
    const tones = new Set<string>(), growths = new Set<string>();
    let own = 0, shaded = 0, grown = 0, all = 0;
    for (const title of fallers) {
      const { position, color, pieces } = stone(title);
      // A stele is worked and weathered: every face of it is the plain block's own grey, the darkest a stone may be.
      if (stoneKind(title) === STELE) {
        for (let i = 0; i < position.count; i += 3) if (!isTone(color, i, BLOCK_GREY)) expect.fail(`"${title}": a stele's face that is not the block's grey`);
        continue;
      }
      for (const piece of pieces) {
        const tone = toneOf(color, piece).name;
        tones.add(tone);
        for (let n = 0; n < piece.corners.length; n += 3) {
          // Every face wears one of its stone's six: no face is of another stone's tone, or of none.
          const worn = wornOf(color, piece.corners[n], tone);
          if (worn === null) { expect.fail(`"${title}": a face that is none of its stone's tones`); continue; }
          all += 1;
          if (worn === "own") own += 1;
          if (worn === "dark" || worn === "light") shaded += 1;
          if (worn !== "moss" && worn !== "lichen") continue;
          growths.add(worn);
          grown += 1;
          // Something grows only on a small face, a sixth of a square metre at the most, whose middle is over the foot.
          face(position, piece.corners, n);
          const y = (a.y + b.y + c.y) / 3, area = b.sub(a).cross(c.sub(a)).length() / 2;
          if (y < 0.3 || area > 0.16) expect.fail(`"${title}": ${worn} on a face of ${area} m2, ${y} m up`);
        }
      }
    }
    // Of every face of every stone: over two in five are the stone's own tone, a third a shade of it, and about one in fourteen
    // overgrown: a scatter, not a coat.
    expect(own / all).toBeGreaterThan(0.4);
    expect(shaded / all).toBeGreaterThan(0.25);
    expect(grown / all).toBeGreaterThan(0.03);
    expect(grown / all).toBeLessThan(0.12);
    expect([...tones].sort()).toEqual(["bluestone", "grey", "pale", "sandstone"]);
    expect([...growths].sort()).toEqual(["lichen", "moss"]);
    // No stone is darker than the block was: every tone a stone may wear, its darker grain and what grows on it too, is as light
    // as the block's grey, and as red, which is most of what the dusk's light shows.
    for (const [name, wear] of Object.entries(WEAR)) {
      for (const [worn, hex] of Object.entries(wear)) {
        expect(luma(hex), `${name}, ${worn}`).toBeGreaterThanOrEqual(luma(BLOCK_GREY));
        expect(channels(hex)[0], `${name}, ${worn}`).toBeGreaterThanOrEqual(channels(BLOCK_GREY)[0]);
      }
      // What grows is pale: lighter than the block, and no darker than four fifths of the stone it grows on.
      for (const hex of [wear.moss, wear.lichen]) expect(luma(hex), name).toBeGreaterThan(0.8 * luma(wear.own));
    }
    // And the four tones are four in a red light: their reds stand 15 or more apart, of 255.
    const reds = Object.values(TONES).map((hex) => channels(hex)[0]).sort((p, q) => p - q);
    for (let k = 1; k < reds.length; k++) expect(reds[k] - reds[k - 1]).toBeGreaterThanOrEqual(15);
    // The patches lie where the title has them: of a cairn's forty, which are small faces all over, nearly every one is overgrown
    // in its own places.
    const patches = new Set(of(CAIRN).map((title) => {
      const { color, pieces } = stone(title);
      return pieces.flatMap((piece) => { const tone = toneOf(color, piece).name; return piece.corners.filter((i, n) => n % 3 === 0 && ["moss", "lichen"].includes(wornOf(color, i, tone) ?? "")).map((i) => i / 3); }).join(",");
    }));
    expect(patches.size).toBeGreaterThanOrEqual(36);
  });

  it("clears the ground: a split stone's root is at one height, over the highest ground the path can put under a stone, and a laid stone, a holed stone's hole and a stele's band begin over it too", () => {
    // 0.85 m is the highest: on the steep climb, under the old block's far corner. A new map can put a stone anywhere on the path.
    const ground = highestGround();
    expect(ground).toBeGreaterThan(0.8);
    expect(ground).toBeLessThan(0.9);
    const roots = new Set<number>();
    for (const phone of [false, true]) {
      for (const title of EVERY) {
        const { pieces } = stone(title, phone), kind = stoneKind(title);
        // The split stone's root: where its two halves begin, which is where its foot ends. To a tenth of a millimetre.
        if (kind === SPLIT) for (const y of [pieces[1].low, pieces[2].low, pieces[0].high]) roots.add(Math.round(y * 1e4) / 1e4);
        // A piece that lies or stands on another begins over the ground, with a hand to spare.
        for (const piece of pieces) if (!grounded(piece) && piece.low < ground + 0.08) expect.fail(`"${title}"${phone ? " on a phone" : ""}: a piece begins ${piece.low} m up, where the ground can stand ${ground} m`);
      }
    }
    // One height for every split stone's root, whatever the stone's own height: a hand over the ground's. (The hole and the band
    // are held over it in their own kinds' tests: both begin over 2 m up.)
    expect(roots.size).toBe(1);
    expect([...roots][0]).toBeGreaterThan(ground + 0.08);
    expect([...roots][0]).toBeLessThan(ground + 0.3);
  });

  it("settles every laid stone the one depth into what it is laid on, wherever on it it lands: a cairn's stones, a rock on a rock, and a lintel in the upright it meets last", () => {
    // How far one is into the other where they meet, to a tenth of a millimetre. A stone set by the other's highest corner, or
    // moved to its place after it was let down, would lie at a different depth on every stone, or float.
    const depths = new Set<number>(), to = (depth: number) => depths.add(Math.round(depth * 1e4) / 1e4);
    for (const phone of [false, true]) {
      for (const title of of(CAIRN)) { const { position, pieces } = stone(title, phone); pieces.slice(1).forEach((piece, k) => to(into(position, piece, pieces[k]))); }
      for (const title of of(ROCK)) { const { position, pieces } = stone(title, phone); to(into(position, pieces[1], pieces[0])); }
      for (const title of of(TRILITHON)) { const { position, pieces } = stone(title, phone); to(Math.min(into(position, pieces[2], pieces[0]), into(position, pieces[2], pieces[1]))); }
    }
    expect(depths.size).toBe(1);
    // Three centimetres or more, so it is seated; under a hand, so it is not sunk in.
    expect([...depths][0]).toBeGreaterThan(0.03);
    expect([...depths][0]).toBeLessThan(0.1);
  });

  it("stands a menhir the full height and breadth of the block: broad to its shoulder, then drawn in to a point that stands off to one side, taller than any other stone and half as broad again as the pair's broad one", () => {
    // The tallest stone of each kind, over the unplayed.
    const tallest = KINDS.map((kind) => Math.max(...of(kind).map((title) => Math.max(...stone(title).pieces.map((piece) => piece.high)))));
    for (const kind of KINDS) if (kind !== MENHIR) expect(tallest[kind], `kind ${kind}`).toBeLessThan(tallest[MENHIR]);
    expect(tallest[MENHIR]).toBeGreaterThan(4.49);
    const elder = Math.max(...of(PAIR).map((title) => Math.max(...stone(title).pieces.map((piece) => piece.x1 - piece.x0))));
    for (const phone of [false, true]) {
      for (const title of of(MENHIR)) {
        const { position, pieces } = stone(title, phone), [piece, ...more] = pieces;
        expect(more, title).toHaveLength(0);
        // Most of the block's 1.6 m across at its belly and still at 3 m up, and most of its 4.5 m tall.
        const belly = breadth(across(position, piece, 0.2, 2)), shoulder = breadth(sliced(position, piece, 3) as Span);
        expect(belly, title).toBeGreaterThan(1.4);
        expect(shoulder, title).toBeGreaterThan(0.9 * belly);
        expect(piece.high, title).toBeGreaterThan(4.35);
        // Then a point: its top fourteenth is under half as broad as the belly, and its highest corner is one corner, which stands
        // to one side of the middle of its foot by an eighth of the belly or more.
        expect(breadth(across(position, piece, 0.93 * piece.high, piece.high)), title).toBeLessThan(0.55 * belly);
        expect(Math.abs(position.getX(tipOf(position, piece.corners)) - middle(footOf(position, piece))), title).toBeGreaterThan(belly / 8);
        expect(new Set(piece.corners.filter((i) => position.getY(i) > piece.high - 0.1).map((i) => cornerKey(position, i))).size, title).toBe(1);
        // No twin of the pair's broad stone: half as broad again as the broadest of those.
        expect(belly, title).toBeGreaterThan(1.4 * elder);
      }
    }
  });

  it("pierces the holed stone: a broad rough slab with a round hole clean through it, well over the ground, a hand's lean, and a top broken off unevenly, one shoulder gone, paler where it broke", SLOW, () => {
    for (const phone of [false, true]) {
      for (const title of of(HOLED)) {
        const { position, color, pieces } = stone(title, phone), [piece, ...more] = pieces;
        expect(more, title).toHaveLength(0);
        // A slab: most of the block's breadth at its foot, and over twice as broad as it is deep.
        const foot = footOf(position, piece);
        expect(breadth(foot), title).toBeGreaterThan(1.4);
        expect(breadth(foot), title).toBeGreaterThan(2 * (piece.z1 - piece.z0));
        // The hole: where the line along the path passes through no face of the slab, with the slab on both sides at that height.
        // Counted on a 2 cm grid from 2 m up to 3.7 m, which is under the lowest of its top.
        const cells: number[][] = [];
        for (let y = 2.01; y < 3.7; y += 0.02) {
          const row: number[] = [];
          for (let x = -0.79; x < 0.8; x += 0.02) row.push(passed(position, piece, x, y));
          const first = row.findIndex((n) => n > 0), last = row.length - 1 - [...row].reverse().findIndex((n) => n > 0);
          row.forEach((n, k) => { if (n === 0 && first >= 0 && k > first && k < last) cells.push([-0.79 + 0.02 * k, y]); });
        }
        const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y), wide = Math.max(...xs) - Math.min(...xs) + 0.02, high = Math.max(...ys) - Math.min(...ys) + 0.02;
        const centre = [xs.reduce((sum, x) => sum + x, 0) / xs.length, ys.reduce((sum, y) => sum + y, 0) / ys.length];
        // A third of a square metre of sky, as wide as it is high to a hand: round, and big enough to tell at 60 m.
        expect(cells.length * 0.0004, title).toBeGreaterThan(0.26);
        expect(cells.length * 0.0004, title).toBeLessThan(0.42);
        expect(wide, title).toBeGreaterThan(0.55);
        expect(wide, title).toBeLessThan(0.78);
        expect(Math.abs(wide - high), title).toBeLessThan(0.12);
        expect(cells.length * 0.0004, title).toBeGreaterThan(0.62 * wide * high);
        // It begins over 2.3 m up, far over any ground, in the stone's upper half, with a jamb of 25 cm or more to each side.
        expect(Math.min(...ys), title).toBeGreaterThan(2.3);
        expect(centre[1], title).toBeGreaterThan(0.6 * piece.high);
        const level = sliced(position, piece, centre[1]) as Span;
        expect(Math.min(...xs) - level.x0, title).toBeGreaterThan(0.25);
        expect(level.x1 - Math.max(...xs), title).toBeGreaterThan(0.25);
        // The top is broken off unevenly: its edge's corners, over 3.7 m, are of four heights or more, half a metre between the
        // highest and the lowest, and one shoulder stands 20 cm or more over the other.
        const edge = [...new Set(piece.corners.filter((i) => position.getY(i) > 3.7).map((i) => `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(2)}`))].map((corner) => corner.split(",").map(Number));
        const heights = edge.map(([, y]) => y), shoulder = (side: number) => Math.max(...edge.filter(([x]) => side * x > 0.55).map(([, y]) => y));
        expect(new Set(heights).size, title).toBeGreaterThanOrEqual(4);
        expect(Math.max(...heights) - Math.min(...heights), title).toBeGreaterThan(0.3);
        expect(Math.abs(shoulder(1) - shoulder(-1)), title).toBeGreaterThan(0.2);
        // It leans to its high shoulder's side, a hand in its height: the hole's middle stands 2 to 8 cm that side of its foot's.
        const high_side = Math.sign(shoulder(1) - shoulder(-1));
        expect((centre[0] - middle(foot)) * high_side, title).toBeGreaterThan(0.02);
        expect((centre[0] - middle(foot)) * high_side, title).toBeLessThan(0.08);
        // Its faces are rough: its near face's corners stand a hand apart along the path. It is worn thin round the hole, under
        // 20 cm from its middle plane, and thicker than 22 cm from it somewhere else.
        const near = piece.corners.filter((i) => position.getZ(i) < 0 && position.getY(i) > 0.3).map((i) => position.getZ(i));
        expect(Math.max(...near) - Math.min(...near), title).toBeGreaterThan(0.08);
        // And no two of them stand alike: a dozen depths or more, to the millimetre, where a slab of flat faces has three.
        expect(new Set(near.map((z) => z.toFixed(3))).size, title).toBeGreaterThanOrEqual(12);
        const rim = piece.corners.filter((i) => Math.hypot(position.getX(i) - centre[0], position.getY(i) - centre[1]) < 0.4);
        expect(rim.length, title).toBeGreaterThan(0);
        expect(Math.max(...rim.map((i) => Math.abs(position.getZ(i)))), title).toBeLessThan(0.2);
        expect(Math.max(-piece.z0, piece.z1), title).toBeGreaterThan(0.22);
        // Where the top broke it is paler and bare: every face of its edge that looks up from over 3.7 m is the one fresh tone.
        // Its broad faces up there are weathered, as the rest of it is: none that looks along the path is fresh.
        const fresh = WEAR[toneOf(color, piece).name].fresh, broken: boolean[] = [], broad: boolean[] = [];
        for (let n = 0; n < piece.corners.length; n += 3) {
          face(position, piece.corners, n);
          const mid = (a.y + b.y + c.y) / 3, looks = b.sub(a).cross(c.sub(a)).normalize();
          if (mid > 3.7 && looks.y > 0.7) broken.push(isTone(color, piece.corners[n], fresh));
          if (mid > 3.7 && Math.abs(looks.z) > 0.7) broad.push(isTone(color, piece.corners[n], fresh));
        }
        expect(broken.length, title).toBeGreaterThanOrEqual(4);
        expect(broken.every(Boolean), title).toBe(true);
        expect(broad.length, title).toBeGreaterThanOrEqual(4);
        expect(broad.some(Boolean), title).toBe(false);
      }
    }
  });

  it("splits the split stone from its top to its root and no further: one stone at 0.9 m, a crack 2 cm wide or more at 1.2 m and a hand and a half at 2.5 m, the halves leaning apart with matching pale faces, one the shorter, each top snapped off aslant", () => {
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
        // Open over it, and opening as it rises: 2 cm or more at 1.2 m, and five times that at 2.5 m, where the sky shows through.
        const low = crack(1.2), high = crack(2.5);
        if (!low || !high) { expect.fail(`${title}: no halves at 1.2 m or at 2.5 m`); continue; }
        expect(low.wide, title).toBeGreaterThan(0.02);
        expect(low.wide, title).toBeLessThan(0.06);
        expect(high.wide, title).toBeGreaterThan(0.14);
        expect(high.wide, title).toBeLessThan(0.26);
        // The inner faces match: the crack's middle at 2.5 m stands over its middle at 1.2 m.
        expect(Math.abs(high.at - low.at), title).toBeLessThan(0.05);
        // The halves stand as wide as the block allows: over three quarters of the way up the shorter one they are together most
        // of its 1.6 m.
        const shorter = Math.min(left.high, right.high);
        expect(across(position, right, 0.75 * shorter, 9).x1 - across(position, left, 0.75 * shorter, 9).x0, title).toBeGreaterThan(1.35);
        // One half stands over the other: by more than a twelfth of the taller and less than a quarter.
        const taller = Math.max(left.high, right.high);
        expect(taller, title).toBeGreaterThan(4.2);
        expect(Math.abs(left.high - right.high), title).toBeGreaterThan(0.08 * taller);
        expect(Math.abs(left.high - right.high), title).toBeLessThan(0.25 * taller);
        // Each top is snapped off, not drawn to a point: its top 36 cm, which is its top ring, is 35 cm broad or more, and aslant, one side of it 5 cm or
        // more over the other, and both halves' the same way, as one break across the stone.
        const tops = [left, right].map((half) => topOf(position, half, 0.36)), falls = tops.map((top) => position.getY(top.right) - position.getY(top.left));
        for (const top of tops) expect(breadth(top.span), title).toBeGreaterThan(0.35);
        // Each top closes on a corner inside its half, a hand or more from the crack: the one corner that all the faces of the
        // top share. Left on the crack's own line it could fall on a corner drawn back there, and fold a face to nothing. And it
        // lies in the slant of its top, no higher than the top's high side and no lower than its low one, to 2 cm.
        for (const half of [left, right]) {
          let shared: string[] | null = null;
          for (let n = 0; n < half.corners.length; n += 3) {
            face(position, half.corners, n);
            if (Math.min(a.y, b.y, c.y) < half.high - 0.36 || b.clone().sub(a).cross(c.clone().sub(a)).normalize().y < 0.5) continue;
            const keys = [0, 1, 2].map((k) => cornerKey(position, half.corners[n + k]));
            shared = shared === null ? keys : shared.filter((key) => keys.includes(key));
          }
          expect(shared, title).toHaveLength(1);
          const [hubX, hubY] = (shared as string[])[0].split(",").map(Number), top = topOf(position, half, 0.36), ends = [position.getY(top.left), position.getY(top.right)];
          expect(Math.abs(hubX - (half === left ? top.span.x1 : top.span.x0)), title).toBeGreaterThan(0.1);
          expect(hubY, title).toBeGreaterThan(Math.min(...ends) - 0.02);
          expect(hubY, title).toBeLessThan(Math.max(...ends) + 0.02);
        }
        for (const fall of falls) expect(Math.abs(fall), title).toBeGreaterThan(0.05);
        expect(falls[0] * falls[1], title).toBeGreaterThan(0);
        // Where the stone broke it is paler, and clean: each half's faces that look across the crack at the other are one tone,
        // lighter than the stone's own, with no grain and nothing growing on them. Its outer faces are of several tones.
        const own = new THREE.Color(toneOf(color, foot).hex);
        for (const [half, toward] of [[left, 1], [right, -1]] as const) {
          const broken = new Set<string>(), outer = new Set<string>();
          for (let n = 0; n < half.corners.length; n += 3) {
            face(position, half.corners, n);
            const mid = (a.y + b.y + c.y) / 3, looks = b.sub(a).cross(c.sub(a)).normalize().x * toward, i = half.corners[n];
            if (mid < 1.2) continue;
            (looks > 0.9 ? broken : looks < 0 ? outer : new Set<string>()).add(colourKey(color, i));
            if (looks > 0.9 && color.getX(i) < 1.05 * own.r) expect.fail(`${title}: a broken face no paler than the stone`);
          }
          expect(broken.size, title).toBe(1);
          expect(outer.size, title).toBeGreaterThan(1);
        }
      }
    }
  });

  it("piles the cairn: a great stone in the ground and six on it, on a phone too, each resting in the one under where the two meet, smaller than it and laid to the other side of it", () => {
    for (const title of of(CAIRN)) {
      // A phone's pile is as many stones as a desktop's.
      expect(stone(title, true).pieces.length, title).toBe(stone(title).pieces.length);
      for (const phone of [false, true]) {
        const { position, color, pieces } = stone(title, phone);
        expect(pieces.length, title).toBe(7);
        expect(pieces.map(grounded)).toEqual([true, ...pieces.slice(1).map(() => false)]);
        const tones = new Set<string>();
        // Where a stone lies across the path: the mean of its corners.
        const lies = pieces.map((piece) => piece.corners.reduce((sum, i) => sum + position.getX(i), 0) / piece.corners.length);
        pieces.forEach((piece, k) => {
          tones.add(toneOf(color, piece).name);
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
        // The pile is of stones of all four tones.
        expect(tones.size, title).toBe(4);
      }
    }
  });

  it("turns no stone of a cairn by its song's title: the first laid of every pile lies the same way round, and so the second, to the sixth", () => {
    // A laid stone is a boulder of twelve corners, six pairs across its middle, and its roughness moves each corner only in or out
    // along its own line through the middle. So the way each pair's line runs, seen from above, is the way the stone is turned,
    // whatever its roughness, its height and where it is laid; and it is the same for every title's pile.
    const ways = (position: Corners, piece: Piece) => {
      const corners = [...new Map(piece.corners.map((i) => [cornerKey(position, i), new THREE.Vector3().fromBufferAttribute(position as unknown as THREE.BufferAttribute, i)])).values()];
      const mid = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(corners.length), from = corners.map((corner) => corner.clone().sub(mid).normalize());
      // Each corner's pair is the one most nearly opposite it across the middle.
      const pair = from.map((dir) => from.reduce((best, other, k) => (other.dot(dir) < from[best].dot(dir) ? k : best), 0));
      return corners.flatMap((corner, i) => (i < pair[i] ? [(Math.atan2(corners[pair[i]].x - corner.x, corners[pair[i]].z - corner.z) + Math.PI) % Math.PI] : []));
    };
    const apart = (p: number, q: number) => Math.min(Math.abs(p - q), Math.PI - Math.abs(p - q));
    for (const phone of [false, true]) {
      const first: number[][] = [];
      for (const title of of(CAIRN)) {
        const { position, pieces } = stone(title, phone);
        pieces.slice(1).forEach((piece, k) => {
          const lies = ways(position, piece);
          expect(lies, title).toHaveLength(6);
          first[k] ??= lies;
          // Each of its six lines runs as one of the first pile's k-th stone's does, to a thousandth of a radian.
          for (const way of lies) expect(Math.min(...first[k].map((other) => apart(way, other))), `${title}: stone ${k + 1}`).toBeLessThan(1e-3);
        });
      }
      expect(first).toHaveLength(6);
    }
  });

  it("builds the trilithon: two thick uprights, drawn in as they rise, with a doorway open between them from the ground up, and a heavy lintel that lies in the top of each, tilted as their tops are, and overhangs them before and behind", () => {
    let drawnIn = 0, squat = 0;
    for (const phone of [false, true]) {
      for (const title of of(TRILITHON)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(3);
        expect(pieces.map(grounded)).toEqual([true, true, false]);
        const [left, right] = pieces.slice(0, 2).sort((p, q) => p.x0 - q.x0), lintel = pieces[2];
        // The doorway: sky between the uprights at every height, a quarter of a metre or more and under 0.7 m. By their numbers it
        // is never under 0.31 m.
        for (let y = 0.15; y < Math.min(left.high, right.high) - 0.1; y += 0.15) {
          const door = (sliced(position, right, y) as Span).x0 - (sliced(position, left, y) as Span).x1;
          if (door < 0.25 || door > 0.7) expect.fail(`${title}: a doorway ${door} m wide at ${y} m`);
        }
        // The uprights are megaliths, not posts: each half a metre broad or more, the broader over 0.55 m, and each over 0.75 m
        // deep along the path. (That the shorter is the broader, and that they are drawn in as they rise, is counted below.)
        const [slimmer, broader] = [left, right].sort((p, q) => breadth(p) - breadth(q));
        expect(breadth(slimmer), title).toBeGreaterThan(0.5);
        expect(breadth(broader), title).toBeGreaterThan(0.55);
        if (broader.high < slimmer.high) squat += 1;
        for (const upright of [left, right]) {
          expect(upright.z1 - upright.z0, title).toBeGreaterThan(0.75);
          if (breadth(topOf(position, upright, 0.3).span) < breadth(upright) - 0.05) drawnIn += 1;
        }
        // The lintel is heavy: over half a metre thick at its middle, and the whole stands 4 m or more.
        expect(lintel.high - meets(position, lintel, middle(lintel), 0, false), title).toBeGreaterThan(0.55);
        expect(lintel.high, title).toBeGreaterThan(4);
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
        // One upright is the taller, and it shows: the lintel's top over it is higher than over the other, by 2 cm or more. (A rough
        // lintel's own corners stand a hand up or down, so no more is held of each stone.)
        const over = (upright: Piece) => Math.max(...lintel.corners.filter((i) => Math.abs(position.getX(i) - middle(upright)) < 0.3).map((i) => position.getY(i)));
        const [tall, short] = left.high > right.high ? [left, right] : [right, left];
        expect(tall.high - short.high, title).toBeGreaterThan(0.1);
        expect(over(tall) - over(short), title).toBeGreaterThan(0.02);
      }
    }
    // Drawn in as they rise: of the 160 uprights, on both tiers, three in four or more are 5 cm narrower over their top 30 cm
    // than at their broadest. One by one a roll could make an upright's top as broad as its foot. And of the 80 trilithons, in
    // three in four or more the shorter upright is the broader by its corners.
    expect(drawnIn).toBeGreaterThan(120);
    expect(squat).toBeGreaterThan(60);
  });

  it("stands the pair a hand apart from the ground up: a tall broad stone whose top is broken off aslant, and a short slim one beside it, under three quarters of its height, whose top is blunt", () => {
    let drawnIn = 0;
    for (const phone of [false, true]) {
      for (const title of of(PAIR)) {
        const { position, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(2);
        expect(pieces.every(grounded)).toBe(true);
        const [left, right] = [...pieces].sort((p, q) => p.x0 - q.x0), [slim, broad] = [...pieces].sort((p, q) => breadth(p) - breadth(q));
        // A tall stone and a short one, told apart at a glance: the slim one is the shorter, between three fifths and three
        // quarters of the broad one's height, and the broad one a third broader or more.
        expect(broad.high, title).toBeGreaterThan(4.2);
        expect(slim.high, title).toBeGreaterThan(0.6 * broad.high);
        expect(slim.high, title).toBeLessThan(0.76 * broad.high);
        expect(breadth(broad), title).toBeGreaterThan(1.35 * breadth(slim));
        // They stand apart from the ground to the short one's shoulder: sky between them at every height, 3 to 30 cm of it. By
        // their numbers they come no nearer than 3.4 cm.
        for (let y = 0.15; y < slim.high - 0.25; y += 0.15) {
          const gap = (sliced(position, right, y) as Span).x0 - (sliced(position, left, y) as Span).x1;
          expect(gap, `${title} at ${y} m`).toBeGreaterThan(0.03);
          expect(gap, `${title} at ${y} m`).toBeLessThan(0.3);
        }
        // The broad one is no board: full at its belly and drawn in as it rises (counted below).
        const belly = breadth(sliced(position, broad, 1) as Span);
        if (breadth(sliced(position, broad, 3.6) as Span) < 0.95 * belly) drawnIn += 1;
        // Its top is broken off aslant, not drawn to a point: its top half metre is three fifths as broad as its belly or more, and
        // one side of it stands 20 cm or more over the other.
        const top = topOf(position, broad, 0.5);
        expect(breadth(top.span), title).toBeGreaterThan(0.6 * belly);
        expect(Math.abs(position.getY(top.right) - position.getY(top.left)), title).toBeGreaterThan(0.2);
        // The slim one's is blunt: its top 20 cm is three fifths as broad as its belly or more, and level to a hand.
        const blunt = topOf(position, slim, 0.2);
        expect(breadth(blunt.span), title).toBeGreaterThan(0.6 * breadth(across(position, slim, 0.2, 2)));
        expect(Math.abs(position.getY(blunt.right) - position.getY(blunt.left)), title).toBeLessThan(0.1);
      }
    }
    // Of the 80 broad stones, on both tiers, three in four or more are a twentieth narrower 3.6 m up than 1 m up.
    expect(drawnIn).toBeGreaterThan(60);
  });

  it("works the stele: an upright slab, broad and under half as thick, with no neck and no dome (nowhere wider than it was below, its top level and one top corner square, the other broken off), a panel cut in its near face, its edges chipped, its faces flat, and the block's own grey all over", () => {
    const tops = new Set<number>();
    for (const phone of [false, true]) {
      for (const title of of(STELE)) {
        const { position, color, pieces } = stone(title, phone), [piece] = pieces;
        expect(pieces, title).toHaveLength(1);
        tops.add(Math.round(piece.high * 1000));
        // A slab: most of the block's breadth at the ground, 0.45 m thick or more and under half as thick as it is broad, and
        // most of the block's height.
        const wide = (y: number) => sliced(position, piece, y) as Span, thick = (y: number) => breadth(sliced(position, piece, y, "z") as Span), ground = wide(0.05);
        expect(breadth(ground), title).toBeGreaterThan(1.4);
        expect(thick(0.05), title).toBeGreaterThan(0.45);
        expect(thick(0.05), title).toBeLessThan(0.45 * breadth(ground));
        expect(piece.high, title).toBeGreaterThan(4.2);
        // No neck: cut level every 10 cm from the ground to its top, it is nowhere broader across the path, or thicker along it,
        // than at any level under that one. A band, a collar or a head on a shaft is narrower and then wider again.
        let narrowest = breadth(ground), thinnest = thick(0.05);
        for (let y = 0.15; y < piece.high - 0.005; y += 0.1) {
          const across = breadth(wide(y)), along = thick(y);
          if (across > narrowest + 1e-3 || along > thinnest + 1e-3) expect.fail(`${title}: ${across} m across and ${along} m thick at ${y} m, where it was ${narrowest} and ${thinnest} below`);
          narrowest = Math.min(narrowest, across);
          thinnest = Math.min(thinnest, along);
        }
        // No dome: a dome draws in on both sides and comes to little at its top. So, 1 cm under its highest point the slab is
        // still half as broad as at the ground (its top is level); and of its two sides, from 0.9 m under the top to that 1 cm,
        // one draws in under 3 cm (that corner is square) and the other 35 to 55 cm (that one is broken off).
        const under = wide(piece.high - 0.01), below = wide(piece.high - 0.9), drawn = [under.x0 - below.x0, below.x1 - under.x1];
        expect(breadth(under), title).toBeGreaterThan(0.5 * breadth(ground));
        expect(Math.min(...drawn), title).toBeLessThan(0.03);
        expect(Math.max(...drawn), title).toBeGreaterThan(0.35);
        expect(Math.max(...drawn), title).toBeLessThan(0.55);
        // It leans a little, to the side its corner is broken from: under the break its middle stands 1 to 5 cm that side of
        // its middle at the ground.
        const lean = (middle(below) - middle(ground)) * (drawn[1] > drawn[0] ? 1 : -1);
        expect(lean, title).toBeGreaterThan(0.01);
        expect(lean, title).toBeLessThan(0.05);
        // The panel: where the near face stands back 5 cm or more from where it stands 15 cm in from the slab's edge at that
        // height. Down the slab's middle it begins over 1.3 m up, clear of any ground, runs 1.5 m or more, and ends 0.6 m or more
        // under the top.
        const cutAt = (x: number, y: number) => nearFace(position, piece, x, y) - nearFace(position, piece, wide(y).x0 + 0.15, y), rows: number[] = [];
        for (let y = 1; y < piece.high - 0.3; y += 0.05) if (cutAt(middle(wide(y)), y) > 0.05) rows.push(y);
        expect(rows.length, title).toBeGreaterThan(0);
        expect(rows[0], title).toBeGreaterThan(1.3);
        expect(rows[rows.length - 1] - rows[0], title).toBeGreaterThan(1.5);
        expect(rows[rows.length - 1], title).toBeLessThan(piece.high - 0.6);
        // Over the panel the near face is worn back, one flat facet at a slight angle: 5 cm under the top it stands 10 to 20 cm
        // further back than at the panel's head.
        const worn = nearFace(position, piece, wide(piece.high - 0.05).x0 + 0.15, piece.high - 0.05) - nearFace(position, piece, wide(rows[rows.length - 1]).x0 + 0.15, rows[rows.length - 1]);
        expect(worn, title).toBeGreaterThan(0.1);
        expect(worn, title).toBeLessThan(0.2);
        // At its mid-height it is a hand deep, 0.6 to 1.05 m across, and no band: 15 cm in from each side of the slab, past its
        // chipped edges, the face stands whole, and for 3 cm or more inward of that.
        const mid = (rows[0] + rows[rows.length - 1]) / 2, span = wide(mid), cells: number[] = [];
        for (let x = span.x0 + 0.15; x < span.x1 - 0.15; x += 0.01) if (cutAt(x, mid) > 0.05) cells.push(x);
        expect(Math.abs(cutAt(span.x1 - 0.15, mid)), title).toBeLessThan(0.005);
        expect(cutAt(middle(span), mid), title).toBeGreaterThan(0.06);
        expect(cutAt(middle(span), mid), title).toBeLessThan(0.12);
        expect(cells[cells.length - 1] - cells[0], title).toBeGreaterThan(0.6);
        expect(cells[cells.length - 1] - cells[0], title).toBeLessThan(1.05);
        expect(cells[0] - span.x0, title).toBeGreaterThan(0.18);
        expect(span.x1 - cells[cells.length - 1], title).toBeGreaterThan(0.18);
        // Its near edges are chipped: at each of its six levels the near face ends 2 to 14 cm short of the slab's side, on each
        // side; and by a different share of the slab's half-thickness there, to a ten-thousandth, at three of the levels or more.
        const levels = new Map<number, number[][]>();
        for (const i of piece.corners) { const y = Math.round(position.getY(i) * 1000); levels.set(y, [...(levels.get(y) ?? []), [position.getX(i), position.getZ(i)]]); }
        const chips = [...levels.values()].map((corners) => {
          const front = Math.min(...corners.map(([, z]) => z)), xs = corners.map(([x]) => x), near = corners.filter(([, z]) => z < front + 1e-4).map(([x]) => x);
          return [Math.min(...near) - Math.min(...xs), Math.max(...xs) - Math.max(...near), Math.max(...corners.map(([, z]) => z))];
        });
        expect(chips, title).toHaveLength(6);
        for (const chip of chips.flatMap(([one, other]) => [one, other])) { expect(chip, title).toBeGreaterThan(0.02); expect(chip, title).toBeLessThan(0.14); }
        expect(new Set(chips.map(([chip, , half]) => (chip / half).toFixed(4))).size, title).toBeGreaterThanOrEqual(3);
        // Its faces: which way each looks, and its three edges; and the faces at each edge.
        const faces: { n: number; normal: THREE.Vector3; edges: string[] }[] = [], at = new Map<string, number[]>();
        for (let n = 0; n < piece.corners.length; n += 3) {
          face(position, piece.corners, n);
          const keys = [0, 1, 2].map((k) => cornerKey(position, piece.corners[n + k])), edges = [0, 1, 2].map((k) => [keys[k], keys[(k + 1) % 3]].sort().join("|"));
          for (const edge of edges) at.set(edge, [...(at.get(edge) ?? []), faces.length]);
          faces.push({ n, edges, normal: b.clone().sub(a).cross(c.clone().sub(a)).normalize() });
        }
        let flat = 0;
        for (const one of faces) {
          // It is the plain block's own grey all over, whatever its song's tone: no face of it is paler, and none darker.
          expect(isTone(color, piece.corners[one.n], BLOCK_GREY), title).toBe(true);
          // A face that looks straight across the path or along it is flat from edge to edge, with no crease in it: of the faces
          // at its edges, one or more look exactly the same way, and every other meets it at 8 degrees or more.
          if (Math.abs(one.normal.y) > 0.2 || Math.max(Math.abs(one.normal.x), Math.abs(one.normal.z)) < 0.98) continue;
          const dots = one.edges.flatMap((edge) => at.get(edge) as number[]).filter((k) => faces[k] !== one).map((k) => faces[k].normal.dot(one.normal));
          expect(dots.filter((dot) => dot > 0.99999).length, title).toBeGreaterThanOrEqual(1);
          expect(dots.filter((dot) => dot <= 0.99999 && dot > 0.99), title).toEqual([]);
          flat += 1;
        }
        // Its two broad faces, the panel's floor and its two sides: 40 such triangles or more.
        expect(flat, title).toBeGreaterThanOrEqual(40);
      }
    }
    // The steles are of several heights.
    expect(tops.size).toBeGreaterThan(3);
  });

  it("lays the rock on a rock: a great uneven boulder, cut away under one shoulder and its top aslant, at rest and tilted on a squat stone of another tone whose top slopes", () => {
    for (const phone of [false, true]) {
      for (const title of of(ROCK)) {
        const { position, color, pieces } = stone(title, phone);
        expect(pieces, title).toHaveLength(2);
        const [under, boulder] = pieces;
        expect(grounded(under) && !grounded(boulder), title).toBe(true);
        // It rests in the stone under it: where the two meet, one is 3 cm or more into the other, and under a hand.
        expect(into(position, boulder, under), title).toBeGreaterThan(0.03);
        expect(into(position, boulder, under), title).toBeLessThan(0.1);
        // The stone under it is squat and broad: most of the block's breadth, under 1.5 m out of the ground, and of another tone.
        expect(breadth(footOf(position, under)), title).toBeGreaterThan(1.35);
        expect(under.high, title).toBeLessThan(1.5);
        expect(toneOf(color, under).name, title).not.toBe(toneOf(color, boulder).name);
        // The boulder is the greater by far: most of the block's breadth at its belly, and twice as tall as the stone under it
        // stands out of the ground.
        const tall = boulder.high - boulder.low, belly = breadth(across(position, boulder, boulder.low + 0.3 * tall, boulder.low + 0.7 * tall));
        expect(belly, title).toBeGreaterThan(1.4);
        expect(tall, title).toBeGreaterThan(2 * under.high);
        // Uneven, and no egg: it is cut away under one shoulder, so its lowest 25 cm is under three quarters of its belly and
        // stands 6 cm or more to one side of the belly's middle; and it is still broad near its top, whose last 40 cm is over
        // two thirds of the belly.
        const base = across(position, boulder, boulder.low, boulder.low + 0.25), crown = topOf(position, boulder, 0.4);
        expect(breadth(base), title).toBeLessThan(0.75 * belly);
        expect(Math.abs(middle(base) - middle(across(position, boulder, boulder.low + 0.3 * tall, boulder.low + 0.7 * tall))), title).toBeGreaterThan(0.06);
        expect(breadth(crown.span), title).toBeGreaterThan(0.67 * belly);
        // Its top is aslant: 30 cm to one side of its middle it stands 8 cm or more over where it stands 30 cm to the other.
        const over = (x: number) => meets(position, boulder, middle(crown.span) + x, 0, true);
        expect(Math.abs(over(0.3) - over(-0.3)), title).toBeGreaterThan(0.08);
        // It lies tilted: the top of the stone under it slopes, 10 cm or more from side to side, and the boulder's underside
        // slopes the same way.
        const seat = topOf(position, under, 0.4);
        const slope = position.getY(seat.right) - position.getY(seat.left), underside = boulder.corners.filter((i) => position.getY(i) < boulder.low + 0.25);
        const end = (sign: number) => underside.reduce((best, i) => (sign * position.getX(i) > sign * position.getX(best) ? i : best));
        expect(Math.abs(slope), title).toBeGreaterThan(0.1);
        expect((position.getY(end(1)) - position.getY(end(-1))) * slope, title).toBeGreaterThan(0);
      }
    }
  });

  // Every show placed as main.js places it, on both tiers, with no second set: the maps do not hold where set 2 begins, and a stone
  // is the same wherever along the path its song falls. Each show is placed once, before the tests (the hook above), with its
  // stones and again with the plain block in their places.
  type Stood = { g: { position: { x: number; y: number; z: number }; rotation: { y: number }; children: Part[] }; off: number };
  const place = (tracks: { title: string; duration: number }[], phone: boolean, block = false): Stood[] => {
    const made = makeBuilders(phone), landmarkU = layout(tracks, null, path);
    // The plain block that main builds for every such song.
    const plain = (g: { add(part: unknown): void }) => g.add(mesh(new THREE.BoxGeometry(1.6, 4.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true }), 0, 2.25, 0));
    const landmarks = placeLandmarks(new THREE.Scene(), path, tracks, true, block ? { ...made, standingStone: plain } : made, landmarkU, line) as unknown as Stood["g"][];
    return landmarks.map((g, i) => { const point = path.at(landmarkU[i]); return { g, off: Math.hypot(g.position.x - point.x, g.position.z - point.z) }; });
  };
  const placings = new Map<string, Stood[]>();
  const placed = (show: string, tracks: { title: string; duration: number }[], phone: boolean, block = false) => {
    const key = `${phone}:${block}:${show}`;
    if (!placings.has(key)) placings.set(key, place(tracks, phone, block));
    return placings.get(key) as Stood[];
  };
  const everyStone = (visit: (stood: Stood, title: string, phone: boolean, where: string, block: () => Stood) => void) => {
    let n = 0;
    for (const { show, tracks } of shows) for (const phone of [false, true]) {
      placed(show, tracks, phone).forEach((stood, i) => {
        if (!falls(tracks[i].title)) return;
        n += 1;
        visit(stood, tracks[i].title, phone, `${show}, song ${i}, "${tracks[i].title}"${phone ? " on a phone" : ""}`, () => placed(show, tracks, phone, true)[i]);
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

  it("stands level on sloping ground, in every show: no foot in the air, no laid stone buried, and the ground under a split stone's root never up to it", () => {
    let steepest = 0, shallowest = Infinity;
    const under = { root: 0 };
    everyStone(({ g }, title, phone, where) => {
      const { position } = g.children[0].geometry.attributes, cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
      const { pieces } = stone(title, phone), kind = stoneKind(title), laid = new Set(pieces.filter((piece) => !grounded(piece)).flatMap((piece) => piece.corners));
      // A split stone's root is where its halves begin.
      const root = kind === SPLIT ? pieces[1].low : null;
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
        // Under each corner of a split stone's root the ground is under that corner: the crack ends in the air.
        if (root !== null && Math.abs(y - root) < 1e-3) { under.root = Math.max(under.root, ground); if (ground >= root) expect.fail(`${where}: the ground stands ${ground} m under its root, ${root} m up`); }
      }
    });
    // The test has seen real slopes: somewhere the ground stands half a metre over or under a stone's own within its outline, and
    // 0.4 m under a corner of a split stone's root; the shallowest foot is still most of a metre down.
    expect(steepest).toBeGreaterThan(0.5);
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
  // What a landmark may not pass: the plain shape's outline seen from above (path.js stands a landmark by its outline), and its
  // top, with what it may stand over that: nothing, but Space's rim, which stands round a disc that lay flat 0.15 m up, to 0.8 m.
  const OVER: Record<string, number> = { Drums: 0, "Walkin' Blues": 0, Space: 0.65, "Sugar Magnolia": 0, "Good Lovin'": 0 };
  type Plain = { corners: [number, number, number][]; outline: number[][]; top: number };
  const plains = new Map<string, Plain>();
  const plain = (title: string) => {
    if (!plains.has(title)) {
      const corners = PLAIN[title]().flatMap(([geo, x, y, z, turn = 0]) => { const part = mesh(geo, new THREE.MeshBasicMaterial(), x, y, z); part.rotation.z = turn; return cornersOf(part); });
      plains.set(title, { corners, outline: hull(corners.map(([x, , z]) => [x, z])), top: Math.max(...corners.map(([, y]) => y)) + OVER[title] });
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
  // The pieces in one of some colours, by a piece's first corner.
  const of = ({ color, pieces }: Built, ...hexes: number[]) => pieces.filter((piece) => hexes.some((hex) => isTone(color, piece.corners[0], hex)));
  const point = (position: Corners, i: number): [number, number, number] => [position.getX(i), position.getY(i), position.getZ(i)];
  // Where the line from `from` along `way` meets a piece's faces, nearest first: how far along it, and whether the face looks back
  // along the line (`front`: it is met from its outside). Each face it passes through is met once, from either side.
  const [e1, e2, p, q, s] = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
  const met = (position: Corners, piece: Piece, from: [number, number, number], way: [number, number, number]) => {
    const hits: { along: number; front: boolean }[] = [], o = new THREE.Vector3(...from), d = new THREE.Vector3(...way);
    for (let n = 0; n < piece.corners.length; n += 3) {
      face(position, piece.corners, n);
      e1.subVectors(b, a); e2.subVectors(c, a); p.crossVectors(d, e2);
      const det = e1.dot(p);
      if (Math.abs(det) < 1e-12) continue;
      s.subVectors(o, a);
      const u = s.dot(p) / det;
      q.crossVectors(s, e1);
      const v = d.dot(q) / det, t = e2.dot(q) / det;
      if (u >= 0 && v >= 0 && u + v <= 1 && t > 0) hits.push({ along: t, front: det > 0 });
    }
    return hits.sort((x, y) => x.along - y.along);
  };
  const meetings = (position: Corners, piece: Piece, from: [number, number, number], way: [number, number, number]) => met(position, piece, from, way).map((hit) => hit.along);
  // Whether a place is inside a closed piece: a line from it leaves through an odd number of faces. The line's way is one no face
  // of these shapes lies along.
  const within = (position: Corners, piece: Piece, at: [number, number, number]) => meetings(position, piece, at, [0.3141, 0.8273, 0.4657]).length % 2 === 1;

  // The whole path as places for one of the five: where it stands, by its own outline, at every second metre. Two that share an
  // outline, as Space does on a desktop and a phone, share the sweep.
  const sweeps = new Map<string, Stand[]>();
  const along = (title: string, phone = false) => {
    const { outline } = built(title, phone), key = JSON.stringify(outline);
    if (!sweeps.has(key)) {
      const stands: Stand[] = [];
      for (let d = 0; d < path.curveLength; d += 2) stands.push(standAt(d / path.curveLength, outline));
      sweeps.set(key, stands);
    }
    return sweeps.get(key) as Stand[];
  };

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
      const tracks = tracksOf(show), landmarkU = layout(tracks, set2Start, path);
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

  // This test stands nine outlines at every second metre of the path, some two seconds of standClear: it has 20 s, not the usual 5.
  it("go into the ground as far as it can fall away under them: each piece that comes down to the ground goes on down to its landmark's depth, and no foot shows on any slope of the path", { timeout: 20000 }, () => {
    tiers(({ position, pieces }, title, phone, where) => {
      // A piece that comes down to the ground goes on down: none ends between the ground and the landmark's depth, where a slope's
      // lower side would show daylight under it. Every other piece begins well over the ground.
      for (const piece of pieces) {
        if (piece.low < 0.25) expect(piece.low, where).toBeCloseTo(-SUNK[title], 5);
      }
      expect(pieces.some((piece) => piece.low < 0.25), where).toBe(true);
      // And that depth is enough anywhere on the path: under every corner of a foot, the ground is 0.2 m or more over it.
      const feet = footRing(position, pieces.flatMap((piece) => piece.corners), -SUNK[title]);
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

  // The three drums: where each stands, how high its head is, its shell's radius at its rim, its wood, and how far out its widest
  // part stands (the bass drum's hoops, the goblet's rope at its hoop, the barrel's rods).
  const DRUMS = [{ name: "bass", x: 2.4, z: -1, tall: 1.85, rim: 1.62, wood: OXBLOOD, wide: 1.71 }, { name: "goblet", x: 0.6, z: 1, tall: 2.98, rim: 0.92, wood: HONEY, wide: 1.02 }, { name: "barrel", x: -2, z: 0, tall: 2.45, rim: 1.12, wood: TIMBER, wide: 1.32 }];
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
      // Each rope is one length of a zigzag: the lengths meet end to end, so there are half as many places at the upper hoop as
      // lengths, and as many at the lower. Lengths that all slanted one way would have an end each.
      const ends = (lengths: Piece[], upper: boolean) => new Set(lengths.map((rope) => {
        const end = rope.corners.slice().sort((i, j) => (position.getY(j) - position.getY(i)) * (upper ? 1 : -1)).slice(0, rope.corners.length / 2);
        return [0, 2].map((axis) => Math.round((end.reduce((sum, i) => sum + point(position, i)[axis], 0) / end.length) * 20)).join(",");
      })).size;
      for (const lengths of [round, bowl]) for (const upper of [true, false]) expect(ends(lengths, upper)).toBe(lengths.length / 2);
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

  it("fits each drum's rings to it: the bass drum's lower hoop and the goblet's ring at their ropes' lower ends, and the barrel's bands and rods proud of its staves", () => {
    for (const phone of [false, true]) {
      const drums = built("Drums", phone), { position } = drums, [bass, goblet, barrel] = DRUMS, where = phone ? "on a phone" : "on a desktop";
      const iron = of(drums, IRON), ropes = of(drums, STRING), round = ropes.filter((rope) => rope.high < bass.tall), bowl = ropes.filter((rope) => rope.low > bass.tall - HEAD - HOOP);
      // How far out from a drum's middle line a piece's corners stand, the least and the most; and where a rope or a rod ends, the
      // middle of its lower corners or its upper: how far out, and how high.
      const out = (piece: Piece, drum: { x: number; z: number }) => { const all = piece.corners.map((i) => Math.hypot(position.getX(i) - drum.x, position.getZ(i) - drum.z)); return { least: Math.min(...all), most: Math.max(...all) }; };
      const end = (piece: Piece, drum: { x: number; z: number }, upper: boolean) => {
        const half = piece.corners.slice().sort((i, j) => (position.getY(j) - position.getY(i)) * (upper ? 1 : -1)).slice(0, piece.corners.length / 2), mean = (axis: number) => half.reduce((sum, i) => sum + point(position, i)[axis], 0) / half.length;
        return { out: Math.hypot(mean(0) - drum.x, mean(2) - drum.z), y: mean(1) };
      };
      // The iron: the goblet's hoop and the ring at its bowl's foot, and the barrel's hoop, its two bands and its rods. A ring left
      // out leaves a rope's ends on bare wood.
      expect(iron, where).toHaveLength(2 + 3 + (phone ? 4 : 6));
      // The bass drum's lower hoop, of timber, near its foot: the rope's lower ends are at its top, inside its corners. A hoop set
      // lower leaves them in the air.
      const hoop = of(drums, DARK_TIMBER).find((piece) => about(piece, bass) && piece.high < 1) as Piece;
      expect(out(hoop, bass).most, where).toBeCloseTo(bass.wide, 4);
      for (const rope of round) {
        const foot = end(rope, bass, false);
        if (Math.abs(foot.y - hoop.high) > 0.01 || foot.out > out(hoop, bass).most || foot.out < bass.rim) expect.fail(`a rope of the bass drum ${where} ends ${foot.out} m out and ${foot.y} m up, where its lower hoop's top is ${hoop.high} m up`);
      }
      // The goblet's ring, of iron, round the foot of its bowl: the rope's lower ends are at its top, inside its corners.
      const ring = iron.find((piece) => about(piece, goblet) && piece.high < 2) as Piece;
      for (const rope of bowl) {
        const foot = end(rope, goblet, false);
        if (Math.abs(foot.y - ring.high) > 0.01 || foot.out > out(ring, goblet).most) expect.fail(`a rope of the goblet drum ${where} ends ${foot.out} m out and ${foot.y} m up, where its ring's top is ${ring.high} m up and ${out(ring, goblet).most} m out`);
      }
      // The barrel's staves, ring by ring: how far out their corners stand at a height.
      const staves = of(drums, barrel.wood).find((piece) => about(piece, barrel) && piece.low < -3) as Piece;
      const rings = [...new Map(staves.corners.map((i) => [Math.round(position.getY(i) * 1e4), [position.getY(i), Math.hypot(position.getX(i) - barrel.x, position.getZ(i) - barrel.z)]])).values()].sort((p, q) => p[0] - q[0]);
      const stavesAt = (y: number) => { const n = rings.findIndex(([at]) => at > y), [y0, r0] = rings[n - 1], [y1, r1] = rings[n]; return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); };
      // Its two bands stand a centimetre or more proud of the staves, corner over corner: a band drawn in is lost inside them.
      const bands = iron.filter((piece) => about(piece, barrel) && piece.high < barrel.tall - HEAD - HOOP && piece.x1 - piece.x0 > 1);
      expect(bands, where).toHaveLength(2);
      for (const band of bands) {
        const proud = out(band, barrel).least - stavesAt((band.low + band.high) / 2);
        if (proud < 0.01 || proud > 0.06) expect.fail(`a band of the barrel drum ${where} stands ${proud} m proud of its staves`);
      }
      // And its rods stand outside the staves at their feet, which are within the upper band's height, and outside the hoop's
      // face at their heads: a rod's foot drawn in is inside the barrel.
      const upper = bands.reduce((p, q) => (p.low > q.low ? p : q));
      for (const rod of iron.filter((piece) => piece.x1 - piece.x0 < 0.2 && piece.z1 - piece.z0 < 0.2)) {
        const foot = end(rod, barrel, false), head = end(rod, barrel, true);
        if (foot.out - stavesAt(foot.y) < 0.01 || foot.out - stavesAt(foot.y) > 0.08 || foot.y < upper.low || foot.y > upper.high + 0.03) expect.fail(`a rod of the barrel drum ${where}: its foot ${foot.out - stavesAt(foot.y)} m outside the staves, ${foot.y} m up`);
        if (head.out < barrel.rim + 0.09 || head.out > barrel.rim + 0.15) expect.fail(`a rod of the barrel drum ${where}: its head ${head.out} m out, where the hoop's corners stand ${barrel.rim + 0.09} m`);
      }
    }
  });

  it("stands the drums level on a slope: each drum's hoop is over the ground at the left cave, where Drums is pinned, and the goblet's and the barrel's anywhere on the path", () => {
    const [bass, goblet, barrel] = DRUMS;
    // The highest ground under a drum, out to its widest part, over the landmark's own ground.
    const under = (stand: Stand, drum: (typeof DRUMS)[number]) => {
      let most = -Infinity;
      for (let k = 0; k < 72; k++) for (const share of [0.5, 1]) most = Math.max(most, groundAt(stand, drum.x + share * drum.wide * Math.cos((k * Math.PI) / 36), drum.z + share * drum.wide * Math.sin((k * Math.PI) / 36)));
      return most;
    };
    const hoopFoot = (drum: (typeof DRUMS)[number]) => drum.tall - HEAD - HOOP;
    // The left cave is loop point 13: the drums stand on its own point, where the ground climbs a metre under the bass drum.
    const { outline } = built("Drums"), cave = standAt(path.pointU(13), outline);
    expect(cave.off).toBe(0);
    for (const drum of DRUMS) expect(under(cave, drum), drum.name).toBeLessThan(hoopFoot(drum) - 0.05);
    expect(under(cave, bass)).toBeGreaterThan(0.9);
    // Anywhere on the path: the highest ground under a drum, found at every second metre and then to a tenth of a metre round
    // the worst of those.
    const stands = along("Drums");
    const highest = (drum: (typeof DRUMS)[number]) => {
      const worst = stands.reduce((best, stand, n) => (under(stand, drum) > under(stands[best], drum) ? n : best), 0);
      let most = -Infinity;
      for (let d = 2 * worst - 2; d <= 2 * worst + 2; d += 0.1) most = Math.max(most, under(standAt(d / path.curveLength, outline), drum));
      return most;
    };
    // Under the goblet it stands 2.64 m at the most, and the goblet's hoop begins 2.68 m up: 4 cm clear, at the one steepest
    // place. Under the barrel, 1.6 m, and its hoop begins 2.15 m up.
    expect(highest(goblet)).toBeGreaterThan(2.6);
    expect(highest(goblet)).toBeLessThan(hoopFoot(goblet) - 0.03);
    expect(highest(barrel)).toBeGreaterThan(1.55);
    expect(highest(barrel)).toBeLessThan(hoopFoot(barrel) - 0.5);
    // The bass drum's hoop, 1.55 m up, does not clear the ground everywhere, and this test does not ask it to: the ground stands
    // over it along some 7 % of the path, where no show has yet stood the drums. It asks only that this grows no worse; a bass
    // drum that cleared the whole path would pass it.
    expect(stands.filter((stand) => under(stand, bass) >= hoopFoot(bass)).length / stands.length).toBeLessThan(0.08);
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
      // The pole goes into the ground and stands under 12 m, clear of a phone's title plate. Its finial stands on its own last
      // ring, corner for corner, so the two are one piece to the finial's tip: a finial set higher would hang over the pole.
      expect(post.low, where).toBeCloseTo(-1.6, 5);
      expect(post.high, where).toBeLessThanOrEqual(12);
      expect(post.high, where).toBeGreaterThan(11.9);
      expect(post.corners.some((i) => isTone(pole.color, i, BRASS)), where).toBe(true);
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
      const pale = banner.corners.filter((i) => isTone(pole.color, i, PALE_BLUE));
      expect(pale.length / 3, where).toBe(24);
      expect(new Set(pale.map((i) => Math.round(position.getY(i) * 1e3) / 1e3)).size, where).toBe(4);
      // The halyard hangs from the yard's underside down to the cleat, which is set into the pole; the lift cord runs from the
      // pole's middle to the yard's top.
      const [halyard, lift] = cords, cleat = of(pole, BRASS).find((piece) => piece.high < 2 && piece.x1 - piece.x0 < 0.2) as Piece;
      expect(halyard.high, where).toBeCloseTo(yard.low, 5);
      expect(halyard.low, where).toBeGreaterThan(cleat.low);
      expect(halyard.low, where).toBeLessThan(cleat.high);
      // It hangs clear of the pole, whose collars stand 0.125 m out, and short of the banner's near edge: not through the cloth.
      expect(halyard.x0, where).toBeGreaterThan(0.125);
      expect(halyard.x1, where).toBeLessThan(banner.x0);
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
          const [first] = met(position, pieces[0], [6 * cos, y, 6 * sin], [-cos, 0, -sin]);
          if (!(first?.along < 6 - 4.65)) expect.fail(`a way in under the disc, ${turn} degrees round and ${y} m up${phone ? ", on a phone" : ""}: the wall is met ${first?.along} m along`);
          // And the face met looks outward: one wound inside out is not drawn, and the wall would be no wall.
          if (!first.front) expect.fail(`the wall's face ${turn} degrees round and ${y} m up${phone ? ", on a phone" : ""} looks inward`);
        }
        // Straight down onto the rim, 4.6 m out: a stone's head, over the disc and no higher than 0.8 m.
        const [down] = met(position, pieces[0], [4.6 * cos, 3, 4.6 * sin], [0, -1, 0]);
        if (!down?.front) expect.fail(`no stone's head looks up ${turn} degrees round the rim${phone ? ", on a phone" : ""}`);
        highest = Math.max(highest, 3 - down.along); lowest = Math.min(lowest, 3 - down.along);
        // And a level line from the disc's middle, a centimetre over the disc, meets a stone's inner face from its outside, well
        // inside the disc's edge: the stones' inner feet are under the disc. Were they over it, the line would pass under a
        // stone's face and into the stone.
        const [inner] = met(position, pieces[0], [0, 0.16, 0], [cos, 0, sin]);
        if (!inner?.front || inner.along > 4.7) expect.fail(`a gap into a stone of the rim over the disc, ${turn} degrees round${phone ? ", on a phone" : ""}: ${inner?.along} m out`);
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
        // Its petals are pale and flushed by turns over a blush foot: every face one of the three, and each of the three there.
        expect(bud.corners.every((i) => PETALS.some((hex) => isTone(tree.color, i, hex))), where).toBe(true);
        for (const hex of PETALS) expect(bud.corners.some((i) => isTone(tree.color, i, hex)), where).toBe(true);
        // And most of it shows: six tenths of its faces or more have their middles outside every clump. A bud that stands under
        // another clump's leaves is mostly inside them.
        const faces = bud.corners.filter((_, k) => k % 3 === 0), middle = (i: number) => [0, 1, 2].map((axis) => (point(position, i)[axis] + point(position, i + 1)[axis] + point(position, i + 2)[axis]) / 3) as [number, number, number];
        const shown = faces.filter((i) => inLeaves(middle(i)) === 0).length / faces.length;
        if (shown < 0.6) expect.fail(`a blossom of the magnolia ${where}, its tip at ${point(position, ends[inside[0] ? 1 : 0])}, shows ${shown} of its faces`);
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
      const span = (piece: Piece, y: number) => sliced(position, piece, y) as Span;
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

  it("grows on each leaning stone in one blotch, low on the walker's side, a shade under the stone's own tone: no face of it stands out bright", () => {
    // Each stone's own tone, with the shade darker and the shade lighter of its grain, and the two tones of what grows on it. A
    // face is one of those five and nothing else: these do not wear a standing stone's moss and lichen, a face here and one there,
    // which on faces this large were the brightest faces on a slab, and read as stray triangles.
    const STONES = [{ tone: 0xa9a59c, grain: [0x918e86, 0xbab6ac], grown: [0x8fa37c, 0x86986f] }, { tone: 0x9a8c74, grain: [0x847864, 0xa99a80], grown: [0x8c8e68, 0x7e825e] }];
    // How bright a face is painted: its colour's relative luminance.
    const bright = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (const phone of [false, true]) {
      const { position, color, pieces } = built("Good Lovin'", phone);
      pieces.forEach((piece, n) => {
        const { tone, grain, grown } = STONES[n], where = `the ${n ? "lesser" : "taller"} stone${phone ? " on a phone" : ""}`;
        // Its faces, each by its first corner: the grown ones and the bare ones.
        const faces = piece.corners.filter((_, k) => k % 3 === 0), isGrown = (i: number) => grown.some((hex) => isTone(color, i, hex));
        const growth = faces.filter(isGrown), bare = faces.filter((i) => !isGrown(i));
        expect(bare.every((i) => [tone, ...grain].some((hex) => isTone(color, i, hex))), where).toBe(true);
        // A blotch: four faces or more, and under a fifth of the stone.
        expect(growth.length, where).toBeGreaterThanOrEqual(4);
        expect(growth.length, where).toBeLessThan(faces.length / 5);
        // One blotch: from its first face, every other is reached through grown faces that share an edge. A face of growth on its
        // own, or a second patch elsewhere, is not.
        const edges = (i: number) => [0, 1, 2].map((k) => [cornerKey(position, i + k), cornerKey(position, i + ((k + 1) % 3))].sort().join(">"));
        const reached = new Set([growth[0]]);
        for (const i of reached) for (const j of growth) if (!reached.has(j) && edges(i).some((edge) => edges(j).includes(edge))) reached.add(j);
        expect(reached.size, where).toBe(growth.length);
        // Low on the walker's side: every grown face's middle is under 3 m and on the stone's -z half.
        for (const i of growth) {
          const middle = [1, 2].map((axis) => (point(position, i)[axis] + point(position, i + 1)[axis] + point(position, i + 2)[axis]) / 3);
          if (middle[0] > 3 || middle[1] > 0) expect.fail(`${where}: a grown face ${middle[0]} m up, ${middle[1]} m along the path from the stone's middle`);
        }
        // A shade under the stone's own tone, and no darker than the darkest of its bare faces: so the brightest faces on the
        // slab are bare stone, and what grows on it is a small step from the stone's own face.
        const own = new THREE.Color(tone), ownBright = bright(own.r, own.g, own.b), bareBright = bare.map((i) => bright(color.getX(i), color.getY(i), color.getZ(i)));
        expect(Math.max(...bareBright), where).toBeGreaterThan(ownBright);
        for (const i of growth) {
          const grownBright = bright(color.getX(i), color.getY(i), color.getZ(i));
          if (grownBright >= ownBright || grownBright < Math.min(...bareBright)) expect.fail(`${where}: a grown face ${grownBright} bright, where the stone's own tone is ${ownBright} and its darkest face ${Math.min(...bareBright)}`);
        }
      });
    }
  });
});
