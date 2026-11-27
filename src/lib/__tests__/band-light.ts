import { LIGHT } from "../../../public/world/band.js";

// The band's light (band.js LIGHT), run here from its own text: what the tests and the outline gates weigh is what the shader casts,
// and no copy of it. LIGHT is a few lines of GLSL of vec3s and floats: declarations (`vec3 a = …, b = …;`, `float …`) and one
// assignment, to `reflectedLight.directDiffuse`. Here they are read as GLSL reads them, each value a number or a vector (an array of
// its components) and the view a 4 × 4 matrix (three's elements, column by column): + - * / component by component, a float with
// a vector spread over it, a matrix times a vec4, a swizzle (`.xyz`, `.rgb`), and the built-ins the light calls. A declared type
// is held to its value, a whole number written without its point is refused, as GLSL ES refuses it, and so is any name the text
// neither declares nor is given.
type Value = number | number[] | { matrix: number[] };
type Run = (names: Map<string, Value>) => Value;

const TYPES: Record<string, number> = { float: 1, vec3: 3, vec4: 4 };
const lengthOf = (v: Value) => (typeof v === "number" ? 1 : Array.isArray(v) ? v.length : 16);
const asVector = (v: Value): number[] => {
  if (!Array.isArray(v)) throw new Error("LIGHT: a vector was wanted");
  return v;
};
function each(a: Value, b: Value, f: (x: number, y: number) => number): Value {
  if (typeof a === "number" && typeof b === "number") return f(a, b);
  if (typeof a === "number") return asVector(b).map((y) => f(a, y));
  if (typeof b === "number") return asVector(a).map((x) => f(x, b));
  const u = asVector(a), v = asVector(b);
  if (u.length !== v.length) throw new Error(`LIGHT: a vec${u.length} with a vec${v.length}`);
  return u.map((x, i) => f(x, v[i]));
}
function times(a: Value, b: Value): Value {
  if (typeof a === "object" && !Array.isArray(a)) {
    const v = asVector(b);
    if (v.length !== 4) throw new Error("LIGHT: a matrix times other than a vec4");
    return [0, 1, 2, 3].map((r) => [0, 1, 2, 3].reduce((sum, c) => sum + a.matrix[c * 4 + r] * v[c], 0));
  }
  return each(a, b, (x, y) => x * y);
}
const dot = (a: Value, b: Value) => {
  const u = asVector(a), v = asVector(b);
  if (u.length !== v.length) throw new Error("LIGHT: dot of two lengths");
  return u.reduce((sum, x, i) => sum + x * v[i], 0);
};
const BUILT_INS: Record<string, (...args: Value[]) => Value> = {
  normalize: (v) => { const n = Math.sqrt(dot(v, v)); return asVector(v).map((x) => x / n); },
  dot,
  length: (v) => Math.sqrt(dot(v, v)),
  max: (a, b) => each(a, b, Math.max),
  min: (a, b) => each(a, b, Math.min),
  clamp: (v, lo, hi) => each(each(v, lo, Math.max), hi, Math.min),
  pow: (a, b) => each(a, b, Math.pow),
  vec3: (...args) => { const out = args.flatMap((a) => (typeof a === "number" ? [a] : asVector(a))); if (out.length !== 3) throw new Error("LIGHT: vec3 of other than 3"); return out; },
  vec4: (...args) => { const out = args.flatMap((a) => (typeof a === "number" ? [a] : asVector(a))); if (out.length !== 4) throw new Error("LIGHT: vec4 of other than 4"); return out; },
};
const SWIZZLE = "xyzw", COLOUR = "rgba";
const swizzle = (v: Value, letters: string) => {
  const u = asVector(v), at = [...letters].map((c) => (SWIZZLE.includes(c) ? SWIZZLE.indexOf(c) : COLOUR.indexOf(c)));
  if (at.some((i) => i < 0 || i >= u.length)) throw new Error(`LIGHT: no .${letters} of a vec${u.length}`);
  return at.length === 1 ? u[at[0]] : at.map((i) => u[i]);
};

// The text as tokens, and a parser over them that makes each expression a function of the names in hand; run with the names it
// is given, it returns what it writes besides its own declarations.
export function compileGlsl(text: string) {
  const tokens: string[] = [];
  const re = /\s*(\d+\.\d*(?:e[+-]?\d+)?|\.\d+|\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|[-+*/=(),;.])/y;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    tokens.push(m[1]);
    at = re.lastIndex;
  }
  if (text.slice(at).trim()) throw new Error(`LIGHT: cannot read "${text.slice(at, at + 20).trim()}"`);
  let i = 0;
  const peek = () => tokens[i], take = (want?: string) => {
    const t = tokens[i++];
    if (want !== undefined && t !== want) throw new Error(`LIGHT: "${want}" wanted, "${t}" found`);
    return t;
  };
  const primary = (): Run => {
    const t = take();
    if (t === "(") { const inner = expression(); take(")"); return inner; }
    if (/^[\d.]/.test(t)) {
      if (!/[.e]/.test(t)) throw new Error(`LIGHT: a whole number written without its point: ${t}`);
      const v = Number(t);
      return () => v;
    }
    if (peek() === "(") {
      take("(");
      const args: Run[] = [];
      if (peek() !== ")") for (args.push(expression()); peek() === ","; take(","), args.push(expression()));
      take(")");
      const f = BUILT_INS[t];
      if (!f) throw new Error(`LIGHT: no built-in ${t}`);
      return (names) => f(...args.map((a) => a(names)));
    }
    return (names) => {
      if (!names.has(t)) throw new Error(`LIGHT: ${t} is neither declared nor given`);
      return names.get(t)!;
    };
  };
  const postfix = (): Run => {
    let run = primary();
    while (peek() === ".") {
      take(".");
      const letters = take(), from = run;
      run = (names) => swizzle(from(names), letters);
    }
    return run;
  };
  const unary = (): Run => {
    if (peek() === "-") { take("-"); const inner = unary(); return (names) => each(-1, inner(names), (x, y) => x * y); }
    return postfix();
  };
  const term = (): Run => {
    let run = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take(), a = run, b = unary();
      run = op === "*" ? (names) => times(a(names), b(names)) : (names) => each(a(names), b(names), (x, y) => x / y);
    }
    return run;
  };
  function expression(): Run {
    let run = term();
    while (peek() === "+" || peek() === "-") {
      const op = take(), a = run, b = term();
      run = op === "+" ? (names) => each(a(names), b(names), (x, y) => x + y) : (names) => each(a(names), b(names), (x, y) => x - y);
    }
    return run;
  }
  const statements: ((names: Map<string, Value>, out: Record<string, Value>) => void)[] = [];
  while (i < tokens.length) {
    const first = take();
    if (first in TYPES) {
      const size = TYPES[first];
      do {
        const name = take();
        take("=");
        const value = expression();
        statements.push((names) => {
          const v = value(names);
          if (lengthOf(v) !== size) throw new Error(`LIGHT: ${first} ${name} given a value of ${lengthOf(v)}`);
          names.set(name, v);
        });
      } while (peek() === "," && take(","));
    } else {
      let target = first;
      while (peek() === ".") target += take() + take();
      take("=");
      const value = expression();
      statements.push((names, out) => { out[target] = value(names); });
    }
    take(";");
  }
  return (given: Record<string, Value>) => {
    const names = new Map(Object.entries(given)), out: Record<string, Value> = {};
    for (const run of statements) run(names, out);
    return out;
  };
}
const RUN = compileGlsl(LIGHT);

export type LightIn = {
  // The view's matrix (three's elements); the face's normal and the way from it to the eye, each in the view's frame; its colour.
  viewMatrix: number[]; normal: number[]; vViewPosition: number[]; diffuseColor: number[];
  uKey: number[]; uFill: number[]; uRim: number[]; uKeyTo: number[]; uPanel: number[];
};
// What LIGHT writes, `reflectedLight.directDiffuse`, for what it reads; and nothing else may it write.
export function runLight(read: LightIn): number[] {
  const out = RUN({ ...read, viewMatrix: { matrix: read.viewMatrix }, diffuseColor: [...read.diffuseColor.slice(0, 3), 1] });
  const keys = Object.keys(out);
  if (keys.join() !== "reflectedLight.directDiffuse") throw new Error(`LIGHT writes ${keys.join(", ")}`);
  return asVector(out["reflectedLight.directDiffuse"]);
}

type Rgb = { r: number; g: number; b: number };
type Xyz = { x: number; y: number; z: number };
export type LightUniforms = { uFill: { value: Rgb }; uKey: { value: Rgb }; uRim: { value: Rgb }; uKeyTo: { value: Xyz }; uPanel: { value: Xyz } };
const rgb = (c: Rgb) => [c.r, c.g, c.b], xyz = (v: Xyz) => [v.x, v.y, v.z];
// What the band's light gives a point of a face seen through a camera's view (`view`, a THREE.Matrix4, the world to the eye's frame):
// the face at `at` in the world, its normal `normal` there, in `colour` (linear), with the material's uniforms `u`. Returns the
// light the face sends out, linear, as the shader writes it; the model's matrix is the world's own, as the band's triangles are here.
export function lightAt(view: { elements: number[] }, at: Xyz, normal: Xyz, colour: number[], u: LightUniforms) {
  const e = view.elements;
  const point = [0, 1, 2].map((r) => e[r] * at.x + e[4 + r] * at.y + e[8 + r] * at.z + e[12 + r]);
  const turned = [0, 1, 2].map((r) => e[r] * normal.x + e[4 + r] * normal.y + e[8 + r] * normal.z);
  const n = Math.hypot(...turned);
  return runLight({
    viewMatrix: e, normal: turned.map((v) => v / n), vViewPosition: point.map((v) => -v), diffuseColor: colour,
    uKey: rgb(u.uKey.value), uFill: rgb(u.uFill.value), uRim: rgb(u.uRim.value), uKeyTo: xyz(u.uKeyTo.value), uPanel: xyz(u.uPanel.value),
  });
}
export const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
