import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";

// The world's shaders are GLSL in the world's own strings: whole programs (sky.js), and the lines that onBeforeCompile adds to
// three's own (crowd.js, rig.js and the rest). The unit tests run some of them as JavaScript, where `out` is a name like any other;
// in GLSL ES 3.00 it is a storage qualifier, and a skirt's `float ... out = ...` passed every test and stopped the crowd's shader
// compiling in every browser. So every string and template literal of every module in public/world that holds GLSL, each `${}` in
// it read as a number and its comments left out, against the words GLSL ES 3.00 keeps for itself (its sections 3.6 and 3.8).
const WORLD = new URL("../../../public/world/", import.meta.url);

// The language's own keywords, which no name may be.
const KEYWORDS = ("const uniform layout centroid flat smooth break continue do for while switch case default if else in out inout float int " +
  "void bool true false invariant discard return mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 " +
  "vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D sampler3D samplerCube " +
  "sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow isampler2D isampler3D isamplerCube isampler2DArray usampler2D " +
  "usampler3D usamplerCube usampler2DArray struct").split(" ");
// The words it reserves for later, which no shader may use at all. Three defines `attribute` and `varying` for its own chunks.
const FUTURE = ("coherent volatile restrict readonly writeonly resource atomic_uint noperspective patch sample subroutine common partition " +
  "active asm class union enum typedef template this goto inline noinline public static extern external interface long short double " +
  "half fixed unsigned superp input output hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 fvec2 fvec3 fvec4 sampler3DRect filter image1D image2D " +
  "image3D imageCube iimage1D iimage2D iimage3D iimageCube uimage1D uimage2D uimage3D uimageCube image1DArray image2DArray " +
  "iimage1DArray iimage2DArray uimage1DArray uimage2DArray image1DShadow image2DShadow image1DArrayShadow image2DArrayShadow " +
  "imageBuffer iimageBuffer uimageBuffer sampler1D sampler1DShadow sampler1DArray sampler1DArrayShadow isampler1D isampler1DArray " +
  "usampler1D usampler1DArray sampler2DRect sampler2DRectShadow isampler2DRect usampler2DRect samplerBuffer isamplerBuffer " +
  "usamplerBuffer sampler2DMS isampler2DMS usampler2DMS sampler2DMSArray isampler2DMSArray usampler2DMSArray sizeof cast namespace " +
  "using").split(" ");
const TYPES = "float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?|sampler2D|samplerCube|sampler3D";

// Each string and template literal of a module's source, a `${}` in a template read as 1.0, and the JavaScript's comments skipped.
function literals(source: string): string[] {
  const found: string[] = [];
  let i = 0;
  const template = (): string => {
    let text = "";
    while (i < source.length) {
      const c = source[i];
      if (c === "\\") { text += source.slice(i, i + 2); i += 2; }
      else if (c === "`") { i += 1; return text; }
      else if (c === "$" && source[i + 1] === "{") { i += 2; code(true); text += " 1.0 "; }
      else { text += c; i += 1; }
    }
    return text;
  };
  const code = (inside: boolean) => {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === "/" && source[i + 1] === "*") i = source.indexOf("*/", i + 2) + 2;
      else if (c === "/" && source[i + 1] === "/") i = source.includes("\n", i) ? source.indexOf("\n", i) : source.length;
      else if (c === "'" || c === '"') {
        let text = "";
        for (i += 1; i < source.length && source[i] !== c; i += 1) text += source[i] === "\\" ? source[++i] : source[i];
        i += 1;
        found.push(text);
      } else if (c === "`") { i += 1; found.push(template()); }
      else {
        if (c === "{") depth += 1;
        if (c === "}" && inside && depth-- === 0) { i += 1; return; }
        i += 1;
      }
    }
  };
  code(false);
  return found;
}

// The names a piece of GLSL declares: after each type, a variable, a parameter or a function, and each further variable a comma
// adds to the same declaration, a name followed by `=`, `,`, `;`, `[` or `)` (where a comma in a function's parameters is followed by a
// qualifier or a type, and another name).
function declared(glsl: string): string[] {
  const names: string[] = [];
  const each = new RegExp(`\\b(?:${TYPES})\\s+([A-Za-z_]\\w*)`, "g");
  for (let m = each.exec(glsl); m; m = each.exec(glsl)) {
    names.push(m[1]);
    if (/^\s*\(/.test(glsl.slice(each.lastIndex))) continue;
    for (let i = each.lastIndex, depth = 0; i < glsl.length; i += 1) {
      const c = glsl[i];
      if ("([{".includes(c)) depth += 1;
      else if (")]}".includes(c)) { if (depth === 0) break; depth -= 1; }
      else if (c === ";" && depth === 0) break;
      else if (c === "," && depth === 0) {
        const next = /^\s*([A-Za-z_]\w*)\s*[=,;[)]/.exec(glsl.slice(i + 1));
        if (next) names.push(next[1]);
      }
    }
  }
  return names;
}

const isGlsl = (text: string) => new RegExp(`\\b(?:${TYPES})\\s+[A-Za-z_]\\w*\\s*[=;,()]|gl_Position|gl_FragColor|#include <`).test(text);
const shaders = readdirSync(WORLD).filter((name) => name.endsWith(".js")).flatMap((name) =>
  literals(readFileSync(new URL(name, WORLD), "utf8")).filter(isGlsl)
    .map((text) => ({ name, glsl: text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ").replace(/#include <\w+>/g, " ") })));

describe("the world's shaders", () => {
  it("name nothing with a word GLSL keeps for itself, and use none it reserves, in every module's GLSL", () => {
    // Every module that draws with a shader of its own or adds to three's is read.
    expect([...new Set(shaders.map((s) => s.name))].sort()).toEqual(["band.js", "bears.js", "crowd.js", "flora.js", "island.js", "landmarks.js", "rig.js", "sky.js"]);
    const names = shaders.flatMap(({ name, glsl }) => declared(glsl).map((word) => ({ name, word })));
    expect(names.length).toBeGreaterThan(300);
    const bad = [...names.filter(({ word }) => KEYWORDS.includes(word) || FUTURE.includes(word) || word.startsWith("gl_") || word.includes("__")),
      ...shaders.flatMap(({ name, glsl }) => (glsl.match(/[A-Za-z_]\w*/g) ?? []).filter((word) => FUTURE.includes(word)).map((word) => ({ name, word })))];
    expect(bad).toEqual([]);
  });

  it("would have stopped the skirt's `out`, and reads a declaration's every name", () => {
    expect(declared("float flare = 0.62 + 0.38 * (1.0 - hem) / 0.907, out = sqrt(x * x + z * z) * flare * swirl;")).toEqual(["flare", "out"]);
    expect(declared("float f(float a, highp vec3 b, out float c) { return a; }\nvec2 p = vec2(1.0, 2.0), q;")).toEqual(["f", "a", "b", "c", "p", "q"]);
    expect(literals("const s = `float a = ${f(x, `b`)}, b;`; // `not this`\nconst t = 'vec3 c;';")).toEqual(["b", "float a =  1.0 , b;", "vec3 c;"]);
  });
});
