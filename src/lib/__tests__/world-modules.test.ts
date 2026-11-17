import { describe, expect, it } from "vitest";
import { threeImports } from "./world-imports";

// The world's modules that import three.js by its bare names, "three" and "three/addons/", but main.js, which reads its page as it
// loads, and which main.test.ts runs against stand-ins. In a page the import map resolves those names to the CDN; here they resolve to
// the three devDependency, the version the import map loads (import-map.test.ts holds the two together).
const MODULES = [...threeImports().keys()].filter((file) => file !== "main.js").map((file) => file.replace(/\.js$/, ""));

describe("the world's modules that import three.js", () => {
  it("load under vitest", async () => {
    // The nine that import it now at least, so a scan that misses any of them, or finds none, fails.
    expect(MODULES).toEqual(expect.arrayContaining(["avatar", "bears", "crowd", "island", "landmarks", "path", "rig", "sky", "stage"]));
    for (const name of MODULES) await import(`../../../public/world/${name}.js`);
  });
});
