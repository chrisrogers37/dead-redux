import { readdirSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { importMap } from "../import-map";

// The world's modules, which import three.js and its addons by bare name through the import map.
const WORLD = new URL("../../../public/world/", import.meta.url);
// package.json, whose devDependencies give the tests three.js.
const PACKAGE = new URL("../../../package.json", import.meta.url);

// The URL the import map gives a bare specifier, as a browser resolves it: the specifier's own entry, or else the longest entry
// ending in "/" that the specifier starts with.
function resolve(specifier: string): string {
  const { imports } = importMap;
  if (Object.hasOwn(imports, specifier)) return imports[specifier];
  const prefix = Object.keys(imports)
    .filter((key) => key.endsWith("/") && specifier.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix === undefined) throw new Error(`the import map does not resolve ${specifier}`);
  return imports[prefix] + specifier.slice(prefix.length);
}

describe("importMap", () => {
  it("pins each file the world loads from the CDN, and no other", () => {
    const specifiers = new Set<string>();
    for (const file of readdirSync(WORLD).filter((name) => name.endsWith(".js"))) {
      const source = readFileSync(new URL(file, WORLD), "utf8");
      for (const [, specifier] of source.matchAll(/\b(?:from|import)\s*\(?\s*["'](three(?:\/[^"']*)?)["']/g)) specifiers.add(specifier);
    }
    const loaded = new Set([...specifiers].map(resolve));
    // three.module.min.js imports three.core.min.js from beside it.
    loaded.add(new URL("three.core.min.js", resolve("three")).href);
    expect(Object.keys(importMap.integrity).sort()).toEqual([...loaded].sort());
  });

  it("pins each file to a sha384 digest", () => {
    for (const [url, digest] of Object.entries(importMap.integrity)) expect(digest, url).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });

  it("loads three.js at the exact version package.json installs for the tests", () => {
    const version = JSON.parse(readFileSync(PACKAGE, "utf8")).devDependencies.three;
    for (const url of [...Object.values(importMap.imports), ...Object.keys(importMap.integrity)]) expect(url, url).toContain(`three@${version}/`);
  });
});
