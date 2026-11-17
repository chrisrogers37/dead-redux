import { readdirSync, readFileSync } from "fs";

/** public/world/, the world's modules. */
export const WORLD = new URL("../../../public/world/", import.meta.url);

/**
 * The bare names the world's modules import three.js by: "three", and "three/addons/" and a path. In a page the import map resolves
 * them to the CDN; under vitest, the three devDependency does.
 *
 * @returns Each module in public/world/ that imports three.js, by file name, with the names it imports.
 */
export function threeImports(): Map<string, string[]> {
  const imports = new Map<string, string[]>();
  for (const file of readdirSync(WORLD).filter((name) => name.endsWith(".js"))) {
    const source = readFileSync(new URL(file, WORLD), "utf8");
    const names = [...source.matchAll(/\b(?:from|import)\s*\(?\s*["'](three(?:\/[^"']*)?)["']/g)].map(([, name]) => name);
    if (names.length > 0) imports.set(file, names);
  }
  return imports;
}
