import { describe, expect, it } from "vitest";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import * as THREE from "three";
import {
  BAND_AMBER, BAND_BLUR, BAND_CORE, BAND_FRAY, BAND_GLOW, BAND_HELD, BAND_LAY, BAND_REACH, BAND_TONE, bandAt,
  BOLT, BOLT_HALF, buildIsland, FEATHER, grained, landColour, offTracks, PATCH_FROM, PATCH_TO, pixelAngle, RING, SHORE, surfaceOf, takesPool, TRACK, tracksAt, TREAD,
  troddenAt, WEAR, WEAR_FEATHER, WEAR_GROW, wearAt, WORN,
} from "../../../public/world/island.js";
import { BAND_RANGE, BAND_SIDE, bandAway, bandMask, buildPath, layout } from "../../../public/world/path.js";
import { CAVES, height, STAGE } from "../../../public/world/ground.js";
import { fromStage, offAxis, onCrowdGround, seats, SPANS, WALKS } from "../../../public/world/seats.js";
import { lookAt, newLook } from "../../../public/world/night.js";

// A number as the shader's text has it, to four places. island.js writes its own with a helper of its own (`f`), which is not
// imported here, on purpose: were the shader's numbers written to other places, the lines pinned below would say so.
const n = (v: number) => v.toFixed(4);
// GLSL's smoothstep. island.js eases with one of its own (`ease`), which is not imported here either, on purpose: the tests that
// hold the island's numbers to this one are a check of that one.
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
// What glslToJs will not take, each of which would run here and mean something else on a GPU, or nothing:
// - a whole number written without its point: GLSL ES makes no float of an int and does not compile, and JavaScript divides two of
//   them as floats;
// - a smoothstep whose edges, written as numbers, are not in order: GLSL leaves it undefined, and here it would ramp the other way;
// - a vector held in a variable of the text's own, or a function that answers one: a vector is a plain pair here, with no sums;
// - a function called above where it is declared: JavaScript finds it all the same, and GLSL does not compile.
// What it cannot see, and so takes and gets wrong: a sum on a vector it is handed whole (p * 2.0 is no number here), a smoothstep
// whose edges are not plain numbers, and anything of ints, loops, matrices or structs. The text it is given has none of these.
const glslFaults = (text: string) => {
  const faults: string[] = [], code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Numbers with a point or an exponent are floats; a whole number left standing by itself is an int.
  const whole = code.replace(/(?<![\w.])(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?|(?<![\w.])\d+[eE][-+]?\d+/g, "F").match(/(?<![\w.])\d+(?![\w.])/g);
  if (whole) faults.push(`a whole number written without its point: ${whole.join(", ")}`);
  for (const [call, from, to] of code.matchAll(/\bsmoothstep\(\s*(\(?\s*-?(?:\d+\.?\d*|\.\d+)\s*\)?)\s*,\s*(\(?\s*-?(?:\d+\.?\d*|\.\d+)\s*\)?)\s*,/g)) {
    const [a, b] = [from, to].map((edge) => Number(edge.replace(/[()\s]/g, "")));
    if (!(a < b)) faults.push(`a smoothstep whose edges are not in order: ${call}`);
  }
  const held = code.replace(/\bfloat \w+\([^)]*\)\s*\{/g, "").match(/\b[ibu]?vec[234]\s+\w+/g);
  if (held) faults.push(`a vec of the text's own: ${held.join(", ")}`);
  for (const declared of code.matchAll(/\bfloat (\w+)\(/g)) {
    if (code.search(new RegExp(`\\b${declared[1]}\\(`)) < declared.index + "float ".length) faults.push(`${declared[1]} called before it is declared`);
  }
  return faults;
};
// The ground's shader text as JavaScript, so that it runs here as it stands and no number of the shader's is written a second
// time in a test: a GLSL float is a number, a function of floats and vec2s a function, and a uniform is what the test hands in.
// Text it cannot translate faithfully (glslFaults) it refuses.
const glslToJs = (text: string) => {
  const code = text.replace(/^uniform [^\n]*\n/gm, ""), faults = glslFaults(code);
  if (faults.length) throw new Error(`glslToJs cannot run this GLSL as a GPU would: ${faults.join("; ")}`);
  return code.replace(/\bfloat (\w+)\(([^)]*)\)\s*\{/g, (_: string, name: string, args: string) => `function ${name}(${args.replace(/\b(float|vec2) /g, "")}) {`)
    .replace(/\bfloat /g, "let ");
};
// The GLSL built-ins the ground's functions use: Math's own, a vec2 as a pair and a vec3 as a triple, and mix as a float's.
const BUILT_INS = `const { abs, min, max, sin, cos, sqrt, sign } = Math, atan = Math.atan2;
  const clamp = (v, a, b) => min(max(v, a), b), mix = (a, b, t) => a + (b - a) * t, vec2 = (x, y) => ({ x, y }), vec3 = (x, y, z) => ({ x, y, z });`;
// Runs GLSL text and then `body`, JavaScript that returns what the test asks of it. `given` holds what the text reads that is
// not its own, by name: a uniform, a sampler's reading.
const runGlsl = <T>(glsl: string, body: string, given: Record<string, unknown> = {}): T =>
  new Function("smoothstep", ...Object.keys(given), `${BUILT_INS}\n${glslToJs(glsl)}\n${body}`)(smoothstep, ...Object.values(given)) as T;

describe("the tests' own reading of the ground's shader", () => {
  it("runs GLSL of floats as it stands, and refuses what would run here and mean something else on a GPU", () => {
    // Two functions of floats, the second calling the first, with a smoothstep, a number with an exponent and a vec2 handed in.
    const glsl = "float twice(float x) { return x * 2.0; }\nfloat eased(vec2 p, float x) { return smoothstep(-1.0, 3.0, twice(x)) + 1e-3 + p.y; }";
    expect(runGlsl<number>(glsl, "return eased(vec2(0.0, 0.25), 0.5);")).toBeCloseTo(smoothstep(-1, 3, 1) + 0.001 + 0.25, 12);
    const refused = (text: string) => { try { glslToJs(text); return null; } catch (error) { return (error as Error).message; } };
    expect(refused(glsl)).toBeNull();
    // A whole number without its point: GLSL ES does not compile 2 * x, and x / 2 of two ints would not be a half.
    expect(refused("float half(float x) { return x / 2; }")).toMatch(/whole number written without its point: 2$/);
    expect(refused("float f(float x) { return 2 * x + 1.5 - 1e-6; }")).toMatch(/whole number written without its point: 2$/);
    // A smoothstep from a higher edge to a lower, or between two the same: undefined on a GPU, a ramp the other way here.
    expect(refused("float f(float x) { return smoothstep(0.6, 0.2, x); }")).toMatch(/smoothstep whose edges are not in order/);
    expect(refused("float f(float x) { return 1.0 - smoothstep((-0.5), -1.5, x); }")).toMatch(/smoothstep whose edges are not in order/);
    expect(refused("float f(float x) { return smoothstep(1.0, 1.0, x); }")).toMatch(/smoothstep whose edges are not in order/);
    expect(refused("float f(float x) { return smoothstep(-2.0000, 2.0000, x) + smoothstep((-1.5), -0.5, x); }")).toBeNull();
    // A vector of the text's own, which has no sums here.
    expect(refused("float f(vec2 p, vec2 a) { vec2 ab = a - p; return ab.x; }")).toMatch(/a vec of the text's own: vec2 ab$/);
    expect(refused("vec3 tint(float x) { return vec3(x, x, x); }")).toMatch(/a vec of the text's own: vec3 tint$/);
    expect(refused("float f(vec2 p) { return texture2D(uMask, vec2(p.x, p.y)).r; }")).toBeNull();
    // A function called above its own declaration, which JavaScript would find and GLSL would not.
    expect(refused("float outer(float x) { return inner(x); }\nfloat inner(float x) { return x; }")).toMatch(/inner called before it is declared$/);
    // Every fault of a text is named.
    expect(refused("float f(float x) { vec2 q = vec2(x, 2); return smoothstep(3.0, 1.0, q.x); }")).toMatch(/whole number.*smoothstep.*a vec of the text's own/);
  });
});

describe("takesPool", () => {
  it("adds the stage's glow to three's Lambert shader as the pinned version writes it: its place from the vertex shader, its light in the fragment shader", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    // Each line the edit hangs on is in the shader once. A three upgrade that renames one would leave the ground without its glow.
    for (const [source, anchor] of [[vertexShader, "#include <common>"], [vertexShader, "#include <project_vertex>"], [fragmentShader, "#include <common>"], [fragmentShader, "#include <lights_fragment_end>"]]) {
      expect(source.split(anchor)).toHaveLength(2);
    }
    const uPool = { value: new THREE.Color(0xff7a30) };
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    takesPool(new THREE.MeshLambertMaterial(), uPool).onBeforeCompile(shader);
    expect(shader.uniforms.uPool).toBe(uPool);
    expect(shader.vertexShader).toContain("varying vec3 vPoolAt;");
    expect(shader.vertexShader).toContain("vPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    // An instanced mesh's point stands where its instance puts it: without this every tuft and stone took the glow as if it stood
    // at the island's middle, out of the glow's reach.
    expect(shader.vertexShader).toMatch(/#ifdef USE_INSTANCING\s+vPoolAt = \(modelMatrix \* instanceMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;\s+#else/);
    expect(shader.fragmentShader).toContain("uniform vec3 uPool;");
    expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit");
  });
});

describe("grained", () => {
  it("adds the land's grain to three's Lambert shader as the pinned version writes it, on top of the stage's glow, and its relief only where asked", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    for (const anchor of ["#include <color_fragment>", "#include <normal_fragment_begin>"]) expect(fragmentShader.split(anchor)).toHaveLength(2);
    const compiled = (relief: boolean) => {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
      grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), relief).onBeforeCompile(shader);
      return shader;
    };
    const flat = compiled(false), tilted = compiled(true);
    for (const shader of [flat, tilted]) {
      expect(shader.uniforms.uPool).toBeDefined();
      expect(shader.fragmentShader).toContain("float grain(vec2 p)");
      expect(shader.fragmentShader).toContain("diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - 0.5)");
      // Each size of grain goes as its cells near what a pixel takes in of the ground, so none dithers where the land is seen
      // edge-on: in full to a quarter of a cell a pixel, gone by six tenths.
      expect(shader.fragmentShader).toContain("uniform float uPixel;");
      expect(shader.fragmentShader).toContain("float covers = length(vViewPosition) * uPixel / max(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.02);");
      // And never less than the drawn face's own reach, read from pixel to pixel, where the land bends sharply.
      expect(shader.fragmentShader).toContain("covers = max(covers, sqrt(max(dot(acrossGround, acrossGround), dot(downGround, downGround))));");
      // Left alone, a pixel spans what one does on a desktop's frame: 900 px tall, a 60 degree view.
      expect((shader.uniforms.uPixel as { value: number }).value).toBeCloseTo((2 * Math.tan(Math.PI / 6)) / 900, 9);
      expect(shader.fragmentShader).toContain("float coarseShown = 1.0 - smoothstep(0.2500, 0.6000, covers * 0.9000);");
      expect(shader.fragmentShader).toContain("* (1.0 - smoothstep(0.2500, 0.6000, covers * 5.3000));");
      expect(shader.fragmentShader).toContain("if (coarseShown > 0.0) tussocks = mix(0.5, grain(vPoolAt.xz * 0.9000 + 17.0), coarseShown);");
      // A grain a pixel cannot hold stands at a half, the even grain, which shades nothing; the worn earth's patches and a lit
      // band's edge, which go by the tussock grain, are even there too.
      expect(shader.fragmentShader).toContain("float tussocks = 0.5, blades = 0.5;");
      expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse += uPool");
    }
    // The relief leans the normal by the grain's own change from pixel to pixel, and takes no more of the grain to do it.
    expect(tilted.fragmentShader).toContain("normal = normalize(max(abs(det), 1e-12) * normal - grad);");
    expect(flat.fragmentShader).not.toContain("dFdx(high)");
    expect(tilted.fragmentShader.split("grain(vPoolAt.xz").length).toBe(flat.fragmentShader.split("grain(vPoolAt.xz").length);
  });
});

describe("the land's colour", () => {
  const hex = (x: number, y: number, z: number, ny: number) => landColour(x, y, z, ny, new THREE.Color());
  const luma = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  it("is turf on the hill's gentle ground: green before it is anything else", () => {
    const turf = hex(20, height(20, -40), -40, 0.98);
    expect(turf.g).toBeGreaterThan(turf.r);
    expect(turf.g).toBeGreaterThan(turf.b);
  });

  it("turns to bare stone as the slope steepens past 28 degrees, all stone by 42, and to dark in the caves' bowls", () => {
    const turf = hex(20, 12, -40, Math.cos((20 * Math.PI) / 180)), stone = hex(20, 12, -40, Math.cos((45 * Math.PI) / 180));
    const between = hex(20, 12, -40, Math.cos((35 * Math.PI) / 180));
    // Stone is grey: its green stands little over its blue, where turf's stands well over.
    expect(stone.g - stone.b).toBeLessThan(0.15 * stone.g);
    expect(turf.g - turf.b).toBeGreaterThan(0.25 * turf.g);
    expect(between.b).toBeGreaterThan(turf.b);
    expect(between.b).toBeLessThan(stone.b);
    const [cx, cz] = CAVES[0];
    expect(luma(hex(cx, height(cx, cz), cz, 1))).toBeLessThan(0.5 * luma(turf));
  });

  it("is sand past the ring road, paler than the turf above it and darker where the sea wets it", () => {
    const dry = hex(SHORE + 3, 2, 0, 1), wet = hex(SHORE + 3, 0.1, 0, 1), turf = hex(RING - 12, 2.5, 0, 1);
    expect(luma(dry)).toBeGreaterThan(luma(turf));
    expect(luma(wet)).toBeLessThan(luma(dry));
  });
});

describe("the ground as its mesh draws it", () => {
  it("is the island's own height at every point of the mesh's grid, and flat across each half of a cell between them", () => {
    const grid = 52, cell = 260 / grid, surface = surfaceOf(grid);
    for (const [ix, iz] of [[0, 0], [10, 31], [26, 26], [51, 7]]) {
      const x = ix * cell - 130, z = iz * cell - 130;
      expect(surface(x, z)).toBeCloseTo(height(x, z), 9);
      // Halfway along the cell's diagonal, and at the middle of each of its two triangles.
      const a = height(x, z), b = height(x, z + cell), c = height(x + cell, z + cell), d = height(x + cell, z);
      expect(surface(x + cell / 2, z + cell / 2)).toBeCloseTo((b + d) / 2, 9);
      expect(surface(x + cell / 3, z + cell / 3)).toBeCloseTo((a + b + d) / 3, 9);
      expect(surface(x + (2 * cell) / 3, z + (2 * cell) / 3)).toBeCloseTo((b + c + d) / 3, 9);
    }
  });

  it("matches the ground buildIsland builds, triangle by triangle", () => {
    const scene = new THREE.Scene(), grid = 20;
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, grid, false);
    const ground = scene.children.find((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } } }) => o.isMesh && o.geometry.attributes.position.count === (grid + 1) ** 2);
    const position = ground.geometry.attributes.position, index = ground.geometry.index, surface = surfaceOf(grid);
    const corner = new THREE.Vector3(), middle = new THREE.Vector3();
    for (let t = 0; t < index.count; t += 3) {
      middle.set(0, 0, 0);
      for (let k = 0; k < 3; k++) middle.addScaledVector(corner.fromBufferAttribute(position, index.getX(t + k)), 1 / 3);
      expect(surface(middle.x, middle.z)).toBeCloseTo(middle.y, 4);
    }
  });
});

describe("the tracks", () => {
  const round = (RING + SHORE) / 2, half = (SHORE - RING) / 2;

  it("are packed earth on the ring road and along the lightning path, land beyond them, and between the two across FEATHER m at each edge", () => {
    expect(tracksAt(round, 0)).toBe(1);
    expect(tracksAt(0, -(RING + 0.5))).toBe(1);
    expect(tracksAt(RING - FEATHER - 0.1, 0)).toBe(0);
    expect(tracksAt(SHORE + FEATHER + 0.1, 0)).toBe(0);
    const edge = tracksAt(RING - FEATHER / 2, 0);
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(0.7);
    // Across the lightning path from the middle of its second stroke.
    const [ax, az] = BOLT[1], [bx, bz] = BOLT[2], mx = (ax + bx) / 2, mz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    expect(tracksAt(mx, mz)).toBe(1);
    expect(tracksAt(mx + nx * (BOLT_HALF - 0.1), mz + nz * (BOLT_HALF - 0.1))).toBe(1);
    expect(tracksAt(mx + nx * (BOLT_HALF + FEATHER + 0.1), mz + nz * (BOLT_HALF + FEATHER + 0.1))).toBe(0);
    // Every corner of the lightning is on it, and the hill's open turf is not.
    for (const [x, z] of BOLT) expect(tracksAt(x, z)).toBe(1);
    expect(tracksAt(40, 40)).toBe(0);
    expect(half).toBe(3);
  });

  it("are drawn in the ground's own shader with the same numbers, so they lie on the ground wherever it goes and cost no mesh", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, true).onBeforeCompile(shader);
    const earth = new THREE.Color(TRACK);
    expect(shader.fragmentShader).toContain(`float ring = 1.0 - smoothstep(${half.toFixed(4)}, ${(half + FEATHER).toFixed(4)}, abs(length(p) - ${round.toFixed(4)}));`);
    expect(shader.fragmentShader).toContain(`return max(ring, 1.0 - smoothstep(${BOLT_HALF.toFixed(4)}, ${(BOLT_HALF + FEATHER).toFixed(4)}, bolt));`);
    for (const [x, z] of BOLT) expect(shader.fragmentShader).toContain(`vec2(${x.toFixed(4)}, ${z.toFixed(4)})`);
    expect(shader.fragmentShader).toContain(`diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${earth.r.toFixed(4)}, ${earth.g.toFixed(4)}, ${earth.b.toFixed(4)}), tracks(vPoolAt.xz));`);
    // A material that is not the ground's wears the grain without them.
    const plain = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false).onBeforeCompile(plain);
    expect(plain.fragmentShader).not.toContain("tracks(");
  });

  it("are reckoned in the shader as tracksAt reckons them: the whole of its GLSL is as written here, and the same sums in JS agree with tracksAt all over the island", () => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, true).onBeforeCompile(shader);
    const v2 = ([x, z]: number[]) => `vec2(${n(x)}, ${n(z)})`, squash = (text: string) => text.replace(/\s+/g, " ");
    // The shader's two functions, whole. A change to either fails here, and is then made to the sums below as well.
    expect(squash(shader.fragmentShader)).toContain(squash(`
      float fromLine(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return distance(p, a + clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0) * ab); }
      float tracks(vec2 p) {
        float ring = 1.0 - smoothstep(${n(half)}, ${n(half + FEATHER)}, abs(length(p) - ${n(round)}));
        float bolt = min(min(fromLine(p, ${v2(BOLT[0])}, ${v2(BOLT[1])}), fromLine(p, ${v2(BOLT[1])}, ${v2(BOLT[2])})), fromLine(p, ${v2(BOLT[2])}, ${v2(BOLT[3])}));
        return max(ring, 1.0 - smoothstep(${n(BOLT_HALF)}, ${n(BOLT_HALF + FEATHER)}, bolt));
      }`));
    // The same, line for line, with the numbers as the shader's text rounds them.
    const r = (v: number) => Number(n(v)), clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
    const fromLine = (px: number, pz: number, [ax, az]: number[], [bx, bz]: number[]) => {
      const abx = r(bx) - r(ax), abz = r(bz) - r(az), t = clamp(((px - r(ax)) * abx + (pz - r(az)) * abz) / Math.max(abx * abx + abz * abz, 1e-6), 0, 1);
      return Math.hypot(px - r(ax) - t * abx, pz - r(az) - t * abz);
    };
    const tracks = (px: number, pz: number) => {
      const ring = 1 - smoothstep(r(half), r(half + FEATHER), Math.abs(Math.hypot(px, pz) - r(round)));
      const bolt = Math.min(Math.min(fromLine(px, pz, BOLT[0], BOLT[1]), fromLine(px, pz, BOLT[1], BOLT[2])), fromLine(px, pz, BOLT[2], BOLT[3]));
      return Math.max(ring, 1 - smoothstep(r(BOLT_HALF), r(BOLT_HALF + FEATHER), bolt));
    };
    const points: number[][] = [];
    // All over the island, every 1.3 m; round both edges of the ring road; and about each corner of the lightning, its ends too.
    for (let x = -125; x <= 125; x += 1.3) for (let z = -125; z <= 125; z += 1.3) points.push([x, z]);
    for (let k = 0; k < 720; k++) for (const far of [RING - FEATHER, RING - FEATHER / 2, RING, SHORE, SHORE + FEATHER / 2, SHORE + FEATHER]) points.push([far * Math.cos(k / 114.6), far * Math.sin(k / 114.6)]);
    for (const [x, z] of BOLT) for (let k = 0; k < 360; k++) for (const far of [0.3, BOLT_HALF, BOLT_HALF + FEATHER / 2, BOLT_HALF + FEATHER]) points.push([x + far * Math.cos(k / 57.3), z + far * Math.sin(k / 57.3)]);
    let onTrack = 0, between = 0;
    for (const [x, z] of points) {
      const here = tracksAt(x, z);
      expect(Math.abs(tracks(x, z) - here)).toBeLessThan(1e-4);
      if (here === 1) onTrack += 1;
      else if (here > 0) between += 1;
    }
    // The points do try the tracks, their edges and the land.
    expect(onTrack).toBeGreaterThan(2000);
    expect(between).toBeGreaterThan(2000);
    expect(points.length - onTrack - between).toBeGreaterThan(20000);
  });
});

describe("the crowd's worn earth", () => {
  const at = fromStage as (far: number, off: number) => [number, number];
  const land = (tracked = true) => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, tracked).onBeforeCompile(shader);
    return shader.fragmentShader;
  };
  // The crowd's ground, from the seats' own spans of it: how near the stage it comes and how far it reaches, the span that comes
  // nearest and the widest one.
  const spans = SPANS as number[][], near = Math.min(...spans.map(([r0]) => r0)), far = Math.max(...spans.map(([, r1]) => r1));
  const front = spans.reduce((best, span) => (span[0] < best[0] ? span : best)), widest = spans.reduce((best, span) => (span[2] > best[2] ? span : best));
  // All over the island, every 1.3 m, and 720 points round each span's rim: along its two rings and its two sides, on them and 1
  // and 2 m to either side.
  const points: number[][] = [];
  for (let x = -125; x <= 125; x += 1.3) for (let z = -125; z <= 125; z += 1.3) points.push([x, z]);
  for (const [r0, r1, a1] of spans) {
    for (let k = 0; k < 180; k++) {
      const off = -1.2 + (2.4 * k) / 179, out = r0 - 3 + ((r1 - r0 + 6) * k) / 179, d = (k % 5) - 2;
      points.push(at(r0 + d, off), at(r1 + d, off), at(out, a1 + d / out), at(out, -a1 - d / out));
    }
  }
  // The first few of a list of points, for a failure to name.
  const some = (list: number[][]) => list.slice(0, 5).map(([x, z]) => `${x.toFixed(2)}, ${z.toFixed(2)}`);

  it("is reckoned in the shader as wearAt reckons it: the shader's own text, run as it stands, agrees with it all over the island, whatever the grain", () => {
    const fragment = land();
    // The shader's three functions, from its text, made to run here (runGlsl). So no number of the shader's is written a second
    // time here, and a change to either side that the other does not follow fails.
    const from = fragment.indexOf("float trodden("), to = fragment.indexOf("\n}", fragment.indexOf("float worn(")) + 2;
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const worn = runGlsl<(x: number, z: number, tussocks: number) => number>(fragment.slice(from, to), "return (x, z, tussocks) => worn({ x, y: z }, tussocks);");
    let inside = 0, feather = 0, apart = 0;
    for (const [x, z] of points) {
      for (const tussocks of [0, 0.5, 1]) apart = Math.max(apart, Math.abs(worn(x, z, tussocks) - wearAt(x, z, tussocks)));
      const here = troddenAt(x, z);
      if (here === 1) inside += 1;
      else if (here > 0) feather += 1;
    }
    // The shader's numbers are written to four places, which moves a span's side by a few millimetres.
    expect(apart).toBeLessThan(5e-3);
    // The points do try the crowd's ground, its feather and the land beyond.
    expect(inside).toBeGreaterThan(1000);
    expect(feather).toBeGreaterThan(1000);
    expect(points.length - inside - feather).toBeGreaterThan(20000);
    // A line of the shader to each span of the crowd's ground, and each walk in it, from the seats' own numbers.
    for (const [r0, r1, a1] of spans) expect(fragment).toContain(`edge = max(edge, min(min(r - ${n(r0)}, ${n(r1)} - r), (${n(a1)} - off) * r));`);
    for (const walk of WALKS as number[]) expect(fragment).toContain(`abs(r - ${n(walk)})`);
  });

  it("lies on the crowd's ground, whole across it, and comes in across 4 m at its rim, inside the band where no tuft grows, and on no track", () => {
    const outOfRange: number[][] = [], pastTheFeather: number[][] = [], amongTufts: number[][] = [], onTrack: number[][] = [], pastReach: number[][] = [];
    let deep = 0, leastDeep = 1;
    for (const [x, z] of points) {
      const here = troddenAt(x, z);
      if (!(here >= 0 && here <= 1)) outOfRange.push([x, z]);
      if (here > 0) {
        // No further out than 2 m past the ground's rim, which is inside the 4.5 m the tufts keep off: a feather that left the band
        // would lay earth under the tufts.
        if (!onCrowdGround(x, z, WEAR_GROW)) pastTheFeather.push([x, z]);
        if (!onCrowdGround(x, z, 4.5)) amongTufts.push([x, z]);
        if (tracksAt(x, z) !== 0) onTrack.push([x, z]);
      }
      // And nothing outside the reach the shader stops reckoning at: 2 m inside the nearest ring to 2 m past the furthest.
      const { r } = offAxis(x, z);
      if ((r <= near - WEAR_GROW || r >= far + WEAR_GROW) && here !== 0) pastReach.push([x, z]);
      // The earth is whole across the crowd's ground: every point with 2 m of that ground all round it is worn through, but for a
      // corner where a wing ends, which is reckoned a little short. Reckoned a section at a time, the ground was half worn along
      // the line where one ring of sections ends and the next begins, a green ring round the hill.
      if (!onCrowdGround(x, z)) continue;
      if (!Array.from({ length: 32 }, (_, k) => onCrowdGround(x + 2.05 * Math.cos((k * Math.PI) / 16), z + 2.05 * Math.sin((k * Math.PI) / 16))).every(Boolean)) continue;
      leastDeep = Math.min(leastDeep, here);
      deep += 1;
    }
    expect(some(outOfRange)).toEqual([]);
    expect(some(pastTheFeather)).toEqual([]);
    expect(some(amongTufts)).toEqual([]);
    expect(some(onTrack)).toEqual([]);
    expect(some(pastReach)).toEqual([]);
    expect(deep).toBeGreaterThan(1000);
    expect(leastDeep).toBeGreaterThan(0.94);
    // Across the rim: half worn on it, worn through 2 m inside it and not at all 2 m outside, at the front, at the back and at the
    // side of the widest span.
    const inward = WEAR_FEATHER - WEAR_GROW + 0.01, outward = WEAR_GROW + 0.01, middle = (widest[0] + widest[1]) / 2;
    for (const [on, within, without] of [
      [at(near, 0), at(near + inward, 0), at(near - outward, 0)],
      [at(far, 0), at(far - inward, 0), at(far + outward, 0)],
      [at(middle, widest[2]), at(middle, widest[2] - inward / middle), at(middle, widest[2] + outward / middle)],
    ]) {
      expect(troddenAt(...on)).toBeCloseTo(0.5, 6);
      expect(troddenAt(...within)).toBe(1);
      expect(troddenAt(...without)).toBe(0);
    }
    // All the way up the span that comes nearest the stage, on its axis and to either side of it.
    for (let out = front[0] + inward + 0.1; out <= front[1] - inward - 0.1; out += 0.25) for (const off of [0, 0.4 * front[2], -0.7 * front[2]]) expect(troddenAt(...at(out, off))).toBe(1);
    // The stage itself, the hill behind the crowd and the far side of the island are not worn.
    expect(troddenAt(STAGE[0], STAGE[1])).toBe(0);
    expect(troddenAt(...at(far + 6, 0))).toBe(0);
    expect(troddenAt(0, 60)).toBe(0);
  });

  it("is drawn in the ground's own shader where the turf is thin, by how hard the ground is trodden, under the grain, and on no other material", () => {
    const fragment = land(), worn = new THREE.Color(WORN);
    // Keyed to the tussock grain as the shader holds it, which fades to a half where a pixel cannot hold it; never to a grain of its
    // own, which would dither there.
    const laid = `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${n(worn.r)}, ${n(worn.g)}, ${n(worn.b)}), worn(vPoolAt.xz, tussocks));`;
    expect(fragment).toContain(laid);
    expect(fragment).toContain(`return inside * (1.0 - smoothstep(${n(PATCH_FROM)}, ${n(PATCH_TO)}, tussocks + 0.5 - tread(p, r, along, aside))) * ${n(WEAR)};`);
    // Two calls of the grain and no more, the tussocks' and the blades': the earth reads the first and makes none.
    expect(fragment.split("grain(vPoolAt.xz").length).toBe(3);
    expect(fragment.split("grain(vPoolAt.xz").length).toBe(land(false).split("grain(vPoolAt.xz").length);
    // The earth is laid after the tussocks are reckoned and before the grain's own line, so the grain lies on it as on the turf and
    // the tracks.
    expect(fragment.indexOf(laid)).toBeGreaterThan(fragment.indexOf("if (coarseShown > 0.0) tussocks = mix(0.5, grain(vPoolAt.xz * 0.9000 + 17.0), coarseShown);"));
    expect(fragment.indexOf("diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - 0.5) + 0.26 * (blades - 0.5) * fineShown;")).toBeGreaterThan(fragment.indexOf(laid));
    // The edges of a patch are no nearer than a fifth of the grain apart, so a patch's rim is soft.
    expect(PATCH_TO - PATCH_FROM).toBeGreaterThanOrEqual(0.2);
    // A material that is not the ground's wears the grain without it.
    const plain = land(false);
    for (const word of ["trodden(", "tread(", "worn("]) expect(plain).not.toContain(word);
  });

  // The measure is against the crowd's turf as a whole, its mean colour, under each light as a luma-weighted sum. Turf varies from
  // patch to patch by about a sixth, so against the darkest patch the earth is the brighter by up to a sixth; a review measured the
  // mean ratio at 0.9 to 0.97 with the lights reckoned as the renderer does, and 1.17 against the darkest turf in white light.
  it("is no brighter than the crowd's turf is on the whole, its mean, under any light of the show, so that figures dancing against it swing the frame no further than against turf", () => {
    // The turf's own colour, as the ground's vertices carry it, taken evenly over the whole of the crowd's ground.
    const turf = [0, 0, 0], here = new THREE.Color();
    let count = 0;
    for (let x = -125; x <= 125; x += 1.3) for (let z = -125; z <= 125; z += 1.3) {
      if (troddenAt(x, z) < 1) continue;
      const gx = height(x + 0.5, z) - height(x - 0.5, z), gz = height(x, z + 0.5) - height(x, z - 0.5);
      landColour(x, height(x, z), z, 1 / Math.sqrt(1 + gx * gx + gz * gz), here);
      turf[0] += here.r; turf[1] += here.g; turf[2] += here.b;
      count += 1;
    }
    expect(count).toBeGreaterThan(1000);
    const worn = new THREE.Color(WORN), bare = [worn.r, worn.g, worn.b].map((v, k) => WEAR * v + ((1 - WEAR) * turf[k]) / count);
    const lit = (rgb: number[], light: number[]) => 0.2126 * rgb[0] * light[0] + 0.7152 * rgb[1] * light[1] + 0.0722 * rgb[2] * light[2];
    // The lights: white; the stage's glow, as the island hands it to a material; and the sky's key and ambient light at dusk, at
    // the set break, in deep night, at first light and at daybreak (night.js).
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const island = buildIsland(scene, 20, true), shader = { uniforms: {} as Record<string, { value: { r: number; g: number; b: number } }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    island.lit(new THREE.MeshLambertMaterial()).onBeforeCompile(shader);
    island.shade(lookAt(1, newLook()));
    const glow = shader.uniforms.uPool.value, lights: [string, number[]][] = [["white", [1, 1, 1]], ["the stage's glow", [glow.r, glow.g, glow.b]]];
    expect(glow.r).toBeGreaterThan(0);
    for (const hour of [0, 0.6, 1, 1.7, 2]) {
      const look = lookAt(hour, newLook());
      lights.push([`the key light at hour ${hour}`, [...look.key]], [`the ambient light at hour ${hour}`, [...look.ambient]]);
    }
    // Paler earth reads well and costs flashes: an earth a quarter brighter than the turf was counted with scripts/flash, and through
    // the seeks, the whole frame from behind the crowd, the blocks at 5 swings or more in a second went from 1,048 to 1,370. The
    // stage's glow is nearly all red, and a brown is redder than turf, so it is the light that holds the earth darkest.
    const brighter = lights.map(([name, light]) => [name, lit(bare, light) / lit(turf.map((v) => v / count), light)] as const).filter(([, by]) => by > 1.02);
    expect(brighter).toEqual([]);
    // And not so dark that a figure is lost on it: no less than four fifths of the turf's brightness by daylight.
    expect(lit(bare, [1, 1, 1]) / lit(turf.map((v) => v / count), [1, 1, 1])).toBeGreaterThan(0.8);
  });

  it("is worn as it is trodden: bare along the aisle and the walks between the rings, barest where they dance, thinner up the hill and out at the wings, and never past WEAR", () => {
    const walks = WALKS as number[], [aisleIn, aisleOut] = TREAD.aisle as number[];
    // What a pixel that cannot hold the grain shows (tussocks at a half), which is what the hill shows from its far side. The aisle
    // the seats leave up the stage's axis is bare from the front rows to the last, and so is each walk, to either side.
    for (let out = near + 2.5; out <= far - 2; out += 0.5) for (const aside of [0, aisleIn - 0.2]) expect(wearAt(...at(out, aside / out))).toBeCloseTo(WEAR, 6);
    for (const off of [-0.8, -0.5, -0.2, 0.2, 0.5, 0.8]) for (const walk of walks) expect(wearAt(...at(walk, off * front[2]))).toBeCloseTo(WEAR, 6);
    // The mean over a patch of the crowd's ground, clear of the aisle and the walks: the rings between the stage, the walks and
    // the back, 3 m and more from each.
    const mean = (r0: number, r1: number, a0: number, a1: number, tussocks = 0.5) => {
      let sum = 0, count = 0;
      for (let out = r0; out <= r1; out += 0.5) for (let off = a0; off <= a1; off += 0.02) for (const side of [1, -1]) { sum += wearAt(...at(out, side * off), tussocks); count += 1; }
      return sum / count;
    };
    const rings = [near + 0.5, ...walks, far].map((edge, k, edges) => [edges[Math.max(k - 1, 0)] + 3, edge - 3]).slice(1), last = rings[rings.length - 1];
    expect(rings.length).toBeGreaterThanOrEqual(2);
    const means = rings.map(([r0, r1]) => mean(r0, r1, 0.25, 0.6));
    // Front rows swapped with the back, or a hill worn alike all over (the flat patch this is not), would fail here.
    expect(means[0]).toBeGreaterThan(0.8 * WEAR);
    for (let k = 1; k < means.length; k++) expect(means[k]).toBeLessThan(means[k - 1] - 0.1);
    expect(means[means.length - 1]).toBeGreaterThan(0.1 * WEAR);
    // Out at a wing, by the side of the widest span, the ground is thinner worn than in the middle of the same ring.
    const ring = rings.find(([r0, r1]) => r0 >= widest[0] && r1 <= widest[1] && r0 > rings[0][0]) ?? rings[0];
    expect(mean(ring[0], ring[1], widest[2] - 0.1, widest[2] - 0.06)).toBeLessThan(mean(ring[0], ring[1], 0.25, 0.6) - 0.2);
    // Broad patches: among the sitters some ground is bare and some is turf, a few metres apart.
    const sitters: number[] = [];
    for (let out = last[0]; out <= last[1]; out += 0.5) for (let off = 0.25; off <= 0.8; off += 0.02) sitters.push(wearAt(...at(out, off)), wearAt(...at(out, -off)));
    expect(Math.max(...sitters)).toBeGreaterThan(0.8 * WEAR);
    expect(Math.min(...sitters)).toBeLessThan(0.1 * WEAR);
    // Near the eye, where the grain shows: its hollows are bare all over the crowd's ground, and its tussocks stay turf, but on the
    // aisle and the walks.
    expect(mean(rings[0][0], last[1], 0.25, 0.6, 0)).toBeGreaterThan(0.95 * WEAR);
    expect(mean(rings[0][0], rings[0][1], 0.25, 0.6, 1)).toBeLessThan(0.05 * WEAR);
    expect(wearAt(...at((rings[1][0] + rings[1][1]) / 2, 0), 1)).toBeGreaterThan(0.5 * WEAR);
    // Left unsaid, the grain is the even one, a half, as a pixel that cannot hold it has it: among the sitters, where the grain
    // tells turf from earth, that is neither the hollows' wear nor the tussocks'.
    const among = at((last[0] + last[1]) / 2, 0.5);
    expect(wearAt(...among)).toBe(wearAt(...among, 0.5));
    expect(wearAt(...among, 0)).toBeGreaterThan(wearAt(...among, 0.5));
    expect(wearAt(...among, 0.5)).toBeGreaterThan(wearAt(...among, 1));
    // Never more than WEAR, never less than none, and none where the ground is not the crowd's, whatever the grain.
    let least = Infinity, most = -Infinity;
    const offTheGround: number[][] = [];
    for (const [x, z] of points) for (const tussocks of [0, 0.5, 1]) {
      const here = wearAt(x, z, tussocks);
      least = Math.min(least, here);
      most = Math.max(most, here);
      if (troddenAt(x, z) === 0 && here !== 0) offTheGround.push([x, z]);
    }
    expect(least).toBe(0);
    expect(most).toBeCloseTo(WEAR, 12);
    expect(some(offTheGround)).toEqual([]);
    // The aisle is the one the seats leave: every seat stands clear of its worn middle.
    for (const seat of seats({ path: [], line: [], landmarks: [] }) as { x: number; z: number }[]) expect(offAxis(seat.x, seat.z).aside).toBeGreaterThanOrEqual(aisleOut - 0.2);
  });
});

describe("the lit bands", () => {
  type Mask = { image: { data: Uint8Array; width: number; height: number } };
  type Bands = { map: { value: Mask }; glow: { value: number } };
  // The island's own path, and a show of twelve songs of which the fourth, the fifth and the tenth run into the next: bands down
  // from the summit and out of the right cave.
  const path = buildPath();
  const tracks = Array.from({ length: 12 }, (_, i) => ({ title: i === 5 ? "Drums" : i === 9 ? "Space" : `Song ${i}`, duration: 300, segueOut: i === 3 || i === 4 || i === 9 }));
  const u = layout(tracks, 3, path) as number[];
  const bandsOf = (size: number): Bands => ({ map: { value: bandMask(path, tracks, u, size) as Mask }, glow: { value: BAND_GLOW } });
  // The ground's shader: with bands, or as it is without. (To the type checker a parameter of the world's that is left null by
  // default takes nothing but null.)
  const land = (bands: Bands | null) => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    grained(takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() }), false, true, undefined, bands as never).onBeforeCompile(shader);
    return shader;
  };
  // The shader's own text for the bands, from the mask's uniform to the end of its last function.
  const text = (fragment: string) => fragment.slice(fragment.indexOf("uniform highp sampler2D uBands;"), fragment.indexOf("\n}", fragment.indexOf("float band(")) + 2);

  it("are whole within BAND_CORE m of their middle and gone by BAND_REACH, eased between, with an edge that stands further out where the turf is thin", () => {
    // As a pixel that takes in next to nothing sees it, on even grain: the eased step itself.
    for (let away = 0; away <= BAND_RANGE; away += 0.013) expect(Math.abs(bandAt(away) - (1 - smoothstep(BAND_CORE, BAND_REACH, away))), `${away.toFixed(3)} m from the middle`).toBeLessThan(1e-3);
    expect(bandAt(0)).toBeCloseTo(1, 12);
    expect(bandAt(BAND_CORE - BAND_HELD)).toBeCloseTo(1, 12);
    expect(bandAt((BAND_CORE + BAND_REACH) / 2)).toBeCloseTo(0.5, 6);
    expect(bandAt(BAND_REACH + BAND_HELD)).toBe(0);
    // Never brighter further out.
    for (let away = 0; away < BAND_RANGE; away += 0.01) expect(bandAt(away + 0.01)).toBeLessThanOrEqual(bandAt(away) + 1e-12);
    // No hard edge: the ease is over half a metre or more, and the band is whole across a metre or more. It is wider than the mesh
    // it replaces, which was 2 m across and whole to its edge: 3.4 m from rim to rim on even grain, and up to 3.9 m where the turf
    // is thin on both sides. Its reach is no less than 1.6 m.
    expect(BAND_REACH - BAND_CORE).toBeGreaterThanOrEqual(0.5);
    expect(BAND_CORE).toBeGreaterThanOrEqual(0.5);
    expect(BAND_REACH).toBeGreaterThanOrEqual(1.6);
    // The edge by the tussock grain: where the turf is thinnest the band reaches half of BAND_FRAY further, and where a tussock
    // stands thickest half of it less. A fray turned the other way would lay the band over the tussocks and leave the hollows turf.
    for (const away of [0, 0.4, 0.9, 1.3, 1.7, 2.1]) {
      expect(bandAt(away, 0, 0)).toBeCloseTo(bandAt(Math.abs(away - BAND_FRAY / 2)), 12);
      expect(bandAt(away, 0, 1)).toBeCloseTo(bandAt(away + BAND_FRAY / 2), 12);
    }
    expect(bandAt(BAND_REACH, 0, 0)).toBeGreaterThan(0.01);
    expect(bandAt(BAND_REACH - BAND_FRAY / 2 + BAND_HELD, 0, 1)).toBe(0);
    expect(BAND_FRAY).toBeGreaterThan(0);
    // The edge frays by less than the ease is wide, so it stays soft all along.
    expect(BAND_FRAY).toBeLessThan(BAND_REACH - BAND_CORE);
  });

  it("hold all of their light however much ground a pixel takes in: far off a band is wider and fainter, never a line that comes and goes, and ground the mask reads as off the bands is not lit at all", () => {
    // Across a band, the sum of how far each point is lit: BAND_CORE + BAND_REACH m of full light, whatever a pixel takes in.
    const across = (covers: number, tussocks = 0.5) => { let sum = 0; for (let s = -30 + 0.0025; s < 30; s += 0.005) sum += bandAt(Math.abs(s), covers, tussocks) * 0.005; return sum; };
    for (const covers of [0, 0.3, 1, 2.5, 5, BAND_BLUR]) expect(across(covers), `a pixel that takes in ${covers} m`).toBeCloseTo(BAND_CORE + BAND_REACH, 3);
    // A pixel that takes in 5 m of ground, on the band's middle, holds the whole band's light in its 5 m; and 3 m from the middle,
    // where a sharp eye sees no band, it still holds its share.
    expect(bandAt(0, 5)).toBeCloseTo((BAND_CORE + BAND_REACH) / 5, 9);
    expect(bandAt(3, 0)).toBe(0);
    expect(bandAt(3, 5)).toBeGreaterThan(0.1);
    // Up to a metre, which is what a walker's pixel takes in of the ground 60 m off, the band's middle is still whole.
    expect(bandAt(0, 1)).toBeCloseTo(1, 12);
    // A pixel takes in no less than BAND_HELD m and is reckoned to take in no more than BAND_BLUR.
    for (const away of [0, 1, 2, 4]) {
      expect(bandAt(away, 0)).toBe(bandAt(away, BAND_HELD));
      expect(bandAt(away, 1000)).toBe(bandAt(away, BAND_BLUR));
      expect(bandAt(away, Infinity)).toBe(bandAt(away, BAND_BLUR));
    }
  });

  it("reach no further from their middle than the mask measures: the reach, half the fray and half of what a far pixel takes in all lie inside the mask's range", () => {
    // path.js's mask holds distances out to BAND_RANGE m, and reads that for all the ground beyond. A look that reached past it
    // would be cut off where the mask stops saying how far the band is; and a pixel reckoned to take in more than the range leaves
    // would light the whole island a little.
    const furthest = BAND_REACH + BAND_FRAY / 2;
    expect(furthest).toBeLessThan(BAND_RANGE);
    expect(furthest + BAND_BLUR / 2).toBeLessThan(BAND_RANGE);
    expect(BAND_HELD).toBeLessThan(BAND_BLUR);
    // Said by what is drawn: ground the mask reads as BAND_RANGE m off is lit by exactly nothing, whatever a pixel takes in and
    // whatever the grain; and a band does reach its furthest edge, where the turf is thinnest, and no further.
    for (const covers of [0, 0.5, 3, BAND_BLUR, 1000]) for (const tussocks of [0, 0.5, 1]) expect(bandAt(BAND_RANGE, covers, tussocks), `a pixel that takes in ${covers} m, grain ${tussocks}`).toBe(0);
    expect(bandAt(furthest - 0.05, 0, 0)).toBeGreaterThan(0);
    expect(bandAt(furthest + BAND_HELD, 0, 0)).toBe(0);
  });

  it.each([512, 256])("are reckoned in the shader as bandAway and bandAt reckon them: the shader's own text, run as it stands on a mask %i texels a side, agrees with them all over the island", { timeout: 20000 }, (size) => {
    const bands = bandsOf(size), mask = bands.map.value, { fragmentShader: fragment } = land(bands);
    // The shader's three functions, from its text, made to run here as the worn earth's are (runGlsl). texture2D is the GPU's
    // linear filter over the mask's own bytes, the edge's texel past the edge, written here from what a filter is and not from
    // bandAway.
    expect(glslToJs(text(fragment))).toContain("function bandAway(p) {");
    expect(glslToJs(text(fragment))).toContain("function band(away, covers, tussocks) {");
    const texture2D = ({ image: { data, width } }: Mask, { x, y }: { x: number; y: number }) => {
      const s = x * width - 0.5, t = y * width - 0.5, i = Math.floor(s), j = Math.floor(t), a = s - i, b = t - j, hold = (k: number) => Math.min(Math.max(k, 0), width - 1);
      const byte = (ix: number, iy: number) => data[hold(iy) * width + hold(ix)] / 255;
      return { r: (1 - b) * ((1 - a) * byte(i, j) + a * byte(i + 1, j)) + b * ((1 - a) * byte(i, j + 1) + a * byte(i + 1, j + 1)) };
    };
    // And the shader's own lines for a pixel, from where it reads the mask to where it has laid the band: ground the mask reads as
    // off the bands is passed over, and the rest is lit as bandAt has it. The colour it lays is not reckoned here: a float's mix
    // stands in for a vec3's.
    const from = fragment.indexOf("float bandLit = 0.0, bandOff = bandAway(vPoolAt.xz);"), to = fragment.indexOf("\n        }", from) + 10;
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const pixel = fragment.slice(from, to);
    expect(pixel).toContain("bandLit = band(bandOff, covers, tussocks);");
    const run = runGlsl<{ away: (x: number, z: number) => number; lit: (x: number, z: number, covers: number, tussocks: number) => number }>(text(fragment),
      `return { away: (x, z) => bandAway({ x, y: z }), lit: (x, z, covers, tussocks) => { const vPoolAt = { xz: { x, y: z } }, diffuseColor = { rgb: 0 }; ${glslToJs(pixel)} return bandLit; } };`,
      { uBands: mask, texture2D });
    // All over the island, every 1.3 m; along each band, across it every quarter of a metre out to the mask's range; and past the
    // island's edge, where the mask reads its own edge.
    const points: number[][] = [];
    for (let x = -129; x <= 129; x += 1.3) for (let z = -129; z <= 129; z += 1.3) points.push([x, z]);
    for (const i of [3, 4, 9]) for (let k = 0; k <= 40; k++) {
      const at = u[i] + (k / 40) * (u[i + 1] - u[i]), p = path.at(at), t = path.tangentAt(at), l = Math.hypot(t.x, t.z);
      for (let off = -BAND_RANGE - 1; off <= BAND_RANGE + 1; off += 0.25) points.push([p.x + (t.z / l) * off, p.z - (t.x / l) * off]);
    }
    points.push([-140, 3], [150, -150], [0, 131]);
    let apart = 0, whole = 0, eased = 0, none = 0;
    for (const [x, z] of points) {
      expect(run.away(x, z)).toBeCloseTo(bandAway(mask, x, z), 9);
      for (const covers of [0, 0.3, 2, 20]) for (const tussocks of [0, 0.5, 1]) apart = Math.max(apart, Math.abs(run.lit(x, z, covers, tussocks) - bandAt(bandAway(mask, x, z), covers, tussocks)));
      const here = bandAt(bandAway(mask, x, z));
      if (here > 1 - 1e-9) whole += 1;
      else if (here > 0) eased += 1;
      else none += 1;
    }
    // The shader's numbers are written to four places, and the band's are round ones.
    expect(apart).toBeLessThan(1e-9);
    // The points do try the bands, their edges and the ground off them.
    expect(whole).toBeGreaterThan(400);
    expect(eased).toBeGreaterThan(400);
    expect(none).toBeGreaterThan(30000);
    // Past the island's edge there is no band, and no reading but the mask's own edge.
    expect(run.away(-140, 3)).toBe(BAND_RANGE);
    // The numbers are the island's and the path's own: the mask's side and range, the band's reach and its fray.
    expect(fragment).toContain(`float read = texture2D(uBands, vec2((p.x + ${n(BAND_SIDE / 2)}) / ${n(BAND_SIDE)}, (p.y + ${n(BAND_SIDE / 2)}) / ${n(BAND_SIDE)})).r;`);
    expect(fragment).toContain(`return (1.0 - read) * ${n(BAND_RANGE)};`);
    expect(fragment).toContain(`float a = abs(x), t = clamp((a - ${n(BAND_CORE)}) / ${n(BAND_REACH - BAND_CORE)}, 0.0, 1.0);`);
    expect(fragment).toContain(`float wide = max(${n(BAND_HELD)}, min(covers, ${n(BAND_BLUR)})), mid = away + ${n(BAND_FRAY)} * (tussocks - 0.5);`);
  });

  it("lie where the ground's mesh lies: the mask's square is the ground's own, and a band on the mask is drawn on the ground under it", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, 20, false);
    const ground = scene.children.find((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } } }) => o.isMesh && o.geometry.attributes.position.count === 21 ** 2);
    ground.geometry.computeBoundingBox();
    const { min, max } = ground.geometry.boundingBox;
    expect([min.x, max.x, min.z, max.z]).toEqual([-BAND_SIDE / 2, BAND_SIDE / 2, -BAND_SIDE / 2, BAND_SIDE / 2]);
    // The ground is not turned or moved: a point of its mesh is where the shader reads the mask for.
    expect(ground.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
  });

  it("are drawn in the ground's own shader, over the tracks and the worn earth and under the grain, with their own glow added, from one reading of the mask", () => {
    const bands = bandsOf(512), shader = land(bands), fragment = shader.fragmentShader;
    const tone = new THREE.Color(BAND_TONE), amber = new THREE.Color(BAND_AMBER);
    expect(shader.uniforms.uBands).toBe(bands.map);
    expect(shader.uniforms.uBandGlow).toBe(bands.glow);
    // The mask is read at the shader's own precision, whatever a sampler's is on the device.
    expect(fragment).toContain("uniform highp sampler2D uBands;");
    expect(fragment).toContain("uniform float uBandGlow;");
    const read = "float bandLit = 0.0, bandOff = bandAway(vPoolAt.xz);", near = `if (bandOff < ${n(BAND_RANGE)}) {`, lit = "bandLit = band(bandOff, covers, tussocks);";
    const laid = `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${n(tone.r)}, ${n(tone.g)}, ${n(tone.b)}), ${n(BAND_LAY)} * bandLit);`;
    const glows = `totalEmissiveRadiance += vec3(${n(amber.r)}, ${n(amber.g)}, ${n(amber.b)}) * uBandGlow * bandLit;`;
    for (const line of [read, near, lit, laid, glows]) expect(fragment.split(line)).toHaveLength(2);
    // One reading of the mask a pixel, and it is read where every pixel of the ground runs, before the branch that passes over the
    // ground off the bands: a reading inside a branch would have no slope to pick its filter by on some drivers. What the branch
    // holds reads no texture and takes no slope.
    expect(fragment.split("texture2D(uBands").length).toBe(2);
    expect(fragment.split("bandAway(").length).toBe(3);
    expect(fragment).toMatch(/float bandLit = 0\.0, bandOff = bandAway\(vPoolAt\.xz\);\s+if \(bandOff < [\d.]+\) \{\s+bandLit = band\(bandOff, covers, tussocks\);\s+diffuseColor\.rgb = mix\([^;]+;\s+\}/);
    expect(text(fragment)).not.toMatch(/dFd[xy]|fwidth/);
    expect(text(fragment).indexOf("texture2D(uBands")).toBeLessThan(text(fragment).indexOf("float bandArea("));
    // The band is laid once the pixel's reach and the tussock grain are known, after the tracks and the worn earth, and before the
    // grain's own line, so the grain lies on it as on the turf; and its glow is added where three sums what a surface gives off.
    const worn = fragment.indexOf("worn(vPoolAt.xz, tussocks));"), grain = fragment.indexOf("diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - 0.5) + 0.26 * (blades - 0.5) * fineShown;");
    expect(worn).toBeGreaterThan(fragment.indexOf("tracks(vPoolAt.xz));"));
    expect(fragment.indexOf(read)).toBeGreaterThan(worn);
    expect(fragment.indexOf(lit)).toBeGreaterThan(fragment.indexOf("covers = max(covers,"));
    expect(fragment.indexOf(lit)).toBeGreaterThan(fragment.indexOf("if (coarseShown > 0.0) tussocks ="));
    expect(fragment.indexOf(laid)).toBeGreaterThan(fragment.indexOf(lit));
    expect(grain).toBeGreaterThan(fragment.indexOf(laid));
    // three's Lambert shader, as the pinned version writes it, has the line the glow hangs on once, after the colour's and before
    // the lights are summed. A three upgrade that renames it would leave the bands without their glow.
    const plainLambert = THREE.ShaderLib.lambert.fragmentShader as string;
    expect(plainLambert.split("#include <emissivemap_fragment>")).toHaveLength(2);
    expect(plainLambert.indexOf("#include <emissivemap_fragment>")).toBeGreaterThan(plainLambert.indexOf("#include <color_fragment>"));
    expect(plainLambert.indexOf("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;")).toBeGreaterThan(plainLambert.indexOf("#include <emissivemap_fragment>"));
    expect(fragment.indexOf(glows)).toBeGreaterThan(fragment.indexOf("#include <emissivemap_fragment>"));
    expect(fragment.indexOf(glows)).toBeLessThan(fragment.indexOf("#include <lights_lambert_fragment>"));
    // The band reads against the turf. Its stone, laid as far as BAND_LAY, is half as bright again as the hill's turf in the same
    // light, and the glow is the rest of it: at dusk as bright as that turf in full white light, and in the deep of the night, when
    // main.js leaves it a third, still 0.03 of full white, which the screen shows as a fifth of its range, where the night's turf
    // is a twentieth.
    const luma = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const turf = landColour(20, height(20, -40), -40, 0.98, new THREE.Color());
    expect(luma(tone.clone().lerp(turf, 1 - BAND_LAY))).toBeGreaterThan(1.5 * luma(turf));
    expect(BAND_GLOW * luma(amber)).toBeGreaterThan(0.8 * luma(turf));
    expect(0.32 * BAND_GLOW * luma(amber)).toBeGreaterThan(0.03);
    // And the glow is no stronger than it was when its flashes were counted: a quarter of the amber 0xe8b04b. It is the one number
    // of a band's look that is light of its own, and the night's passing changes it, in seconds where a seek takes the night
    // through its hours. A stronger glow, by its strength or by its colour, is counted again with scripts/flash before it merges:
    // through the seeks (window S) from on a band (pose=path, and a pose that looks down one), on a desktop at 1.5 and the phone
    // tier, the light alone and the whole frame, on all four grids; and this bound is then moved to what was counted.
    expect(BAND_GLOW * luma(amber)).toBeLessThanOrEqual(0.25 * luma(new THREE.Color(0xe8b04b)) + 1e-12);
    expect(BAND_LAY).toBeLessThanOrEqual(1);
  });

  it("change nothing of the ground's shader but what they add: a ground handed no bands has the text of a ground never asked about them, and a ground with bands has every line of that, in order", () => {
    const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
    const compiled = (relief: boolean, bands?: Bands | null) => {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader, fragmentShader };
      const material = takesPool(new THREE.MeshLambertMaterial(), { value: new THREE.Color() });
      (bands === undefined ? grained(material, relief, true) : grained(material, relief, true, undefined, bands as never)).onBeforeCompile(shader);
      return shader;
    };
    for (const relief of [false, true]) {
      const before = compiled(relief), without = compiled(relief, null), banded = compiled(relief, bandsOf(256));
      // Handed no bands (null), against never asked (the argument left out): the same text, to the letter, and no uniform of
      // theirs. Neither is held to main's text of before the bands: the next change to the ground would break that for nothing.
      expect(without.fragmentShader).toBe(before.fragmentShader);
      expect(without.vertexShader).toBe(before.vertexShader);
      expect(Object.keys(without.uniforms).sort()).toEqual(Object.keys(before.uniforms).sort());
      for (const word of ["uBands", "uBandGlow", "bandLit", "bandAway(", "bandArea(", "band("]) expect(before.fragmentShader).not.toContain(word);
      // With bands: every line of the shader without them is still there, in its order, so the stage's glow, the grain, the tracks,
      // the worn earth and the relief are all as they were; and the vertex shader is untouched.
      expect(banded.vertexShader).toBe(before.vertexShader);
      const lines = banded.fragmentShader.split("\n");
      let from = 0;
      const lost: string[] = [];
      for (const line of before.fragmentShader.split("\n")) {
        const found = lines.indexOf(line, from);
        if (found < 0) lost.push(line);
        else from = found + 1;
      }
      expect(lost).toEqual([]);
      // What they add: their text before main, and in it a comment of three lines, the five that lay the band and the one that adds
      // its glow.
      const added = lines.length - before.fragmentShader.split("\n").length;
      expect(added).toBe(text(banded.fragmentShader).split("\n").length + 9);
      expect(Object.keys(banded.uniforms).sort()).toEqual([...Object.keys(before.uniforms), "uBandGlow", "uBands"].sort());
    }
  });

  it("are written as a strict GLSL ES compiler takes them: every number a float, no name a reserved word, and nothing divided by what could be nothing", () => {
    const fragment = land(bandsOf(256)).fragmentShader, from = fragment.indexOf("float bandLit =");
    const written = `${text(fragment)}\n${fragment.slice(from, fragment.indexOf("\n        }", from) + 10)}\n${fragment.slice(fragment.indexOf("totalEmissiveRadiance += vec3("), fragment.indexOf("* uBandGlow * bandLit;") + 22)}`;
    expect(written).toContain("if (bandOff < ");
    expect(written).toContain("float band(float away, float covers, float tussocks) {");
    expect(written).toContain("* uBandGlow * bandLit;");
    // A whole number written without its point is an int, and GLSL ES makes no float of it: 2 * x does not compile.
    expect(written.match(/(?<![\w.])\d+(?![\w.])/g)).toBeNull();
    expect(written.match(/\d\.\d/g)!.length).toBeGreaterThan(20);
    // The names the text declares, and the words GLSL ES 3.00 keeps for itself or for later (and `near` and `far`, which some
    // drivers' compilers keep too).
    const names = [...written.matchAll(/\b(?:float|vec2|vec3) (\w+)/g), ...written.matchAll(/, (\w+) = /g)].map(([, name]) => name);
    expect(names).toEqual(expect.arrayContaining(["bandAway", "bandArea", "band", "read", "a", "t", "wide", "mid", "bandLit", "bandOff"]));
    const kept = ["near", "far", "sample", "filter", "input", "output", "common", "partition", "active", "in", "out", "inout", "half", "fixed", "long", "short", "double", "unsigned", "superp", "resource", "patch", "this", "union", "enum", "class", "template", "using", "namespace", "cast", "inline", "noinline", "public", "static", "extern", "interface", "goto", "volatile", "asm", "packed", "flat", "smooth", "centroid", "layout", "precision", "lowp", "mediump", "highp", "invariant", "discard", "struct", "switch", "case", "default", "texture", "sampler", "image", "buffer", "shared", "coherent", "restrict", "readonly", "writeonly", "subroutine", "typedef", "sizeof"];
    expect(names.filter((name) => kept.includes(name))).toEqual([]);
    // Two divisions by a number of the shader's own, the mask's side and the ease's width, and one by the pixel's reach, which is
    // never under BAND_HELD.
    expect(Number(n(BAND_SIDE))).toBeGreaterThan(0);
    expect(Number(n(BAND_REACH - BAND_CORE))).toBeGreaterThan(0);
    expect(Number(n(BAND_HELD))).toBeGreaterThan(0);
    expect(written.split("/").length - 1).toBe(4);
    expect(written).toContain(`/ ${n(BAND_REACH - BAND_CORE)}, 0.0, 1.0);`);
    expect(written).toContain("/ wide;");
    expect(written.split(`/ ${n(BAND_SIDE)}`).length - 1).toBe(2);
    // No loop for a driver to refuse, and no smoothstep whose edges could come out of order.
    expect(written).not.toMatch(/\b(for|while|do|smoothstep)\b/);
  });

  it("are worn by the island's ground and by nothing else, with no mesh of their own, and no tuft grows in one", { timeout: 20000 }, () => {
    const loop = Array.from({ length: Math.ceil(path.curveLength / 2) }, (_, k) => { const p = path.at((2 * k) / path.curveLength); return [p.x, p.z]; });
    // Every song runs into the next: the whole path is a band.
    const all = tracks.map((t) => ({ ...t, segueOut: true })), mask = bandMask(path, all, layout(all, 3, path), 512) as Mask, bands = { map: { value: mask }, glow: { value: BAND_GLOW } };
    const built = (given: Bands | null) => {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const { flora } = buildIsland(scene, 64, false, loop, () => false, given as never);
      return { scene, flora, meshes: scene.children.filter((o: { isMesh?: boolean }) => o.isMesh) };
    };
    const banded = built(bands), bare = built(null);
    // The same meshes with bands as without: the ground, the sea, the tufts, the stones and the caves' two pools.
    expect(banded.meshes).toHaveLength(6);
    expect(bare.meshes).toHaveLength(6);
    const compile = (o: { material: { onBeforeCompile?: (shader: object) => void; isShaderMaterial?: boolean } }) => {
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      if (!o.material.isShaderMaterial) o.material.onBeforeCompile?.(shader);
      return shader;
    };
    const wearers = banded.meshes.filter((o: Parameters<typeof compile>[0]) => "uBands" in compile(o).uniforms);
    expect(wearers).toHaveLength(1);
    expect(wearers[0].geometry.attributes.position.count).toBe(65 ** 2);
    expect(compile(wearers[0]).uniforms.uBands).toBe(bands.map);
    expect(compile(wearers[0]).uniforms.uBandGlow).toBe(bands.glow);
    expect(bare.meshes.filter((o: Parameters<typeof compile>[0]) => "uBands" in compile(o).uniforms)).toHaveLength(0);
    // No tuft's root stands where a band is lit at all, even where the turf is thinnest and the band reaches furthest: the path
    // keeps its room clear of them, and the band's furthest edge is inside it.
    const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
    let nearest = Infinity;
    expect(banded.flora.tufts.count).toBeGreaterThan(1000);
    for (let i = 0; i < banded.flora.tufts.count; i++) {
      banded.flora.tufts.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix);
      const away = bandAway(mask, at.x, at.z);
      expect(bandAt(away, 0, 0)).toBe(0);
      nearest = Math.min(nearest, away);
    }
    // And tufts do grow beside a band: within a metre of where its light gives out.
    expect(nearest).toBeLessThan(BAND_REACH + BAND_FRAY / 2 + 1);
  });
});

describe("the sea", () => {
  it("is one mesh on its own shader, which takes the fog, and draws each look at the time it is given", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const { shade } = buildIsland(scene, 20, true);
    const seas = scene.children.filter((o: { isMesh?: boolean; material?: { isShaderMaterial?: boolean } }) => o.isMesh && o.material?.isShaderMaterial);
    expect(seas).toHaveLength(1);
    const { material } = seas[0];
    expect(material.fog).toBe(true);
    const look = lookAt(1, newLook());
    shade(look, 12.5);
    expect(material.uniforms.uTide.value).toBe(12.5);
    expect(material.uniforms.uSea.value.toArray()).toEqual([...look.sea]);
    // A caller that gives no time gets still water.
    shade(look);
    expect(material.uniforms.uTide.value).toBe(0);
  });

  it("laps the island's own shore: its depth is written from the ground's slope past the ring road", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, 20, true);
    const { fragmentShader } = scene.children.find((o: { isMesh?: boolean; material?: { isShaderMaterial?: boolean } }) => o.isMesh && o.material?.isShaderMaterial).material;
    // ground.js's slope past 118 m: 2.5 + 0.6 sin(0.3 x) cos(0.27 z) - 0.55 (d - 118). The shader's depth is its negative.
    expect(fragmentShader).toContain("float depth = (r - 118.0) * 0.55 - 2.5 - 0.6 * sin(vAt.x * 0.3) * cos(vAt.y * 0.27)");
    for (const [x, z] of [[121, 0], [0, -124], [90, 85]]) {
      const d = Math.hypot(x, z);
      expect(-((d - 118) * 0.55 - 2.5 - 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27))).toBeCloseTo(height(x, z), 9);
    }
  });
});

describe("buildIsland", () => {
  it("draws the ground, the sea and what stands on the land, with a pool for each cave and no mesh for the tracks", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    const { caves } = buildIsland(scene, 20, true);
    const meshes = scene.children.filter((o: { isMesh?: boolean }) => o.isMesh);
    expect(caves).toHaveLength(2);
    // The ground, with its tracks in its own shader, the sea, the tufts and the stones (flora.js), and the two caves' pools, which stay
    // hidden until their songs.
    expect(meshes).toHaveLength(6);
    expect(meshes.filter((o: { visible: boolean }) => o.visible)).toHaveLength(4);
    expect(meshes.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh)).toHaveLength(2);
  });
  it("tells the ground's grain what a pixel of the frame takes in, by the camera's view and the frame's height, as each frame is drawn", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 100, 400);
    buildIsland(scene, 20, false);
    const ground = scene.children.find((o: { isMesh?: boolean; geometry: { attributes: { position: { count: number } } } }) => o.isMesh && o.geometry.attributes.position.count === 21 ** 2);
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    ground.material.onBeforeCompile(shader);
    const frame = (fov: number, tall: number) => { ground.onBeforeRender({ getDrawingBufferSize: (size: { set(x: number, y: number): unknown }) => size.set(2 * tall, tall) }, scene, { fov }); return shader.uniforms.uPixel.value; };
    // A desktop's frame; the same at half the render scale, where a pixel takes in twice the ground; and a phone's wider view.
    expect(frame(60, 900)).toBeCloseTo(0.001283, 6);
    expect(frame(60, 450)).toBeCloseTo(2 * 0.001283, 6);
    expect(frame(75, 717)).toBeCloseTo(pixelAngle({ fov: 75 }, 717), 12);
    expect(frame(75, 717)).toBeCloseTo((2 * Math.tan((75 * Math.PI) / 360)) / 717, 12);
    // From 3 m up, a desktop's pixel at 22 m takes in 0.21 m of level ground, more than a blade's cell of 0.19 m: the blades are gone
    // there (0.6 of a cell is their end), where by distance alone they were drawn in full.
    const covers = (far: number, up: number, pixel: number) => (Math.hypot(far, up) * pixel) / (up / Math.hypot(far, up));
    expect(covers(22, 3, frame(60, 900)) * 5.3).toBeGreaterThan(0.6);
    expect(covers(5, 3, frame(60, 900)) * 5.3).toBeLessThan(0.25);
  });
});

describe("offTracks", () => {
  it("is false on the ring road and the lightning path and within the room asked of either, and true on the turf between", () => {
    expect(offTracks(RING + 3, 0, 1)).toBe(false);
    expect(offTracks(0, RING - 0.5, 1)).toBe(false);
    expect(offTracks(RING - 1.5, 0, 1)).toBe(true);
    const [ax, az] = BOLT[1], [bx, bz] = BOLT[2], mx = (ax + bx) / 2, mz = (az + bz) / 2;
    expect(offTracks(mx, mz, 1)).toBe(false);
    // Across the path from its middle: just inside its reach and the room, and just past them.
    const len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    expect(offTracks(mx + nx * (BOLT_HALF + 0.9), mz + nz * (BOLT_HALF + 0.9), 1)).toBe(false);
    expect(offTracks(mx + nx * (BOLT_HALF + 1.1), mz + nz * (BOLT_HALF + 1.1), 1)).toBe(true);
    expect(offTracks(BOLT[0][0], BOLT[0][1], 0)).toBe(false);
  });
});

describe("what stands on the land", () => {
  it("stands on the ground as its mesh draws it, on every tier's grid, off the tracks and off the setlist's path", () => {
    for (const [grid, phone] of [[80, false], [64, false], [52, true]] as const) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const loop = Array.from({ length: 60 }, (_, k) => [-40 + k * 1.5, 30]);
      const { flora } = buildIsland(scene, grid, phone, loop);
      const surface = surfaceOf(grid), matrix = new THREE.Matrix4(), at = new THREE.Vector3();
      expect(flora.tufts.count).toBeGreaterThan(1000);
      let nearest = Infinity;
      for (let i = 0; i < flora.tufts.count; i++) {
        flora.tufts.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        // A tuft's root is a few centimetres under the drawn ground, never over it.
        expect(at.y - surface(at.x, at.z)).toBeCloseTo(-0.03, 4);
        expect(tracksAt(at.x, at.z)).toBe(0);
        // None on the crowd's ground or within 4.5 m of it, where a figure would stand in it, or step into it for the visitor.
        expect(onCrowdGround(at.x, at.z, 4.5)).toBe(false);
        const fromLoop = Math.min(...loop.map(([x, z]) => Math.hypot(at.x - x, at.z - z)));
        expect(fromLoop).toBeGreaterThanOrEqual(2.2);
        nearest = Math.min(nearest, fromLoop);
      }
      // The path clears its own 2.2 m and no more: a tuft stands within a metre of that.
      expect(nearest).toBeLessThan(3.2);
      // No firefly flies over the crowd either: each is over a tuft.
      const flies = flora.flies.geometry.getAttribute("position");
      for (let i = 0; i < flies.count; i++) expect(onCrowdGround(flies.getX(i), flies.getZ(i), 4.5)).toBe(false);
      let among = 0;
      for (let i = 0; i < flora.stones.count; i++) {
        flora.stones.getMatrixAt(i, matrix);
        at.setFromMatrixPosition(matrix);
        if (onCrowdGround(at.x, at.z)) among += 1;
        expect(at.y - surface(at.x, at.z)).toBeGreaterThanOrEqual(0);
        expect(at.y - surface(at.x, at.z)).toBeLessThan(0.2);
      }
      // Stones lie on the crowd's ground as anywhere.
      expect(among).toBeGreaterThan(0);
    }
  });

  it("keeps every firefly over the drawn ground through the whole of its wander, on every tier's grid, so none sinks into a hillside and goes out", () => {
    for (const [grid, phone, count] of [[80, false, 1120], [64, false, 896], [52, true, 416]] as const) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 100, 400);
      const { flora } = buildIsland(scene, grid, phone);
      const surface = surfaceOf(grid), geo = flora.flies.geometry, at = geo.getAttribute("position"), seed = geo.getAttribute("aSeed"), lie = geo.getAttribute("aLie");
      expect(at.count).toBe(count);
      // The wander as the shader writes it, which the sums below repeat.
      const { vertexShader } = flora.flies.material;
      expect(vertexShader).toContain("vec3 roam = 1.6000 * vec3(sin(uTime * (0.21 + 0.2 * aSeed.x) + 6.2832 * aSeed.y), 0.4500 * sin(uTime * (0.33 + 0.2 * aSeed.z) + 6.2832 * aSeed.w),");
      expect(vertexShader).toContain("cos(uTime * (0.17 + 0.2 * aSeed.y) + 6.2832 * aSeed.x));");
      expect(vertexShader).toContain("roam.y += dot(aLie, roam.xz);");
      expect(vertexShader).toContain("vec4 seen = modelViewMatrix * vec4(position + roam, 1.0);");
      let least = Infinity, most = -Infinity;
      for (let i = 0; i < at.count; i++) {
        const sx = seed.getX(i), sy = seed.getY(i), sz = seed.getZ(i), sw = seed.getW(i);
        // Ten minutes of it, four times a second.
        for (let t = 0; t < 600; t += 0.25) {
          const x = 1.6 * Math.sin(t * (0.21 + 0.2 * sx) + 6.2832 * sy), z = 1.6 * Math.cos(t * (0.17 + 0.2 * sy) + 6.2832 * sx);
          const y = 1.6 * 0.45 * Math.sin(t * (0.33 + 0.2 * sz) + 6.2832 * sw) + lie.getX(i) * x + lie.getY(i) * z;
          const over = at.getY(i) + y - surface(at.getX(i) + x, at.getZ(i) + z);
          least = Math.min(least, over);
          most = Math.max(most, over);
        }
      }
      // Never nearer the ground than 0.3 m (it is built to clear 0.4 m at the places it reads), and never higher than a tree's lower boughs.
      expect(least).toBeGreaterThan(0.3);
      expect(most).toBeLessThan(4);
    }
  });
});
