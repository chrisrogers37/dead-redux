import { describe, it } from "vitest";

// The world's modules other than main.js that import three.js by its bare names, "three" and "three/addons/". In a page the import map
// resolves those names to the CDN; here they resolve to the three devDependency, the version the import map loads (import-map.test.ts
// holds the two together). main.js reads its page as it loads, and main.test.ts runs it against stand-ins.
const MODULES = ["avatar", "bears", "crowd", "island", "landmarks", "path", "rig", "sky", "stage"];

describe("the world's modules that import three.js", () => {
  it("load under vitest", async () => {
    for (const name of MODULES) await import(`../../../public/world/${name}.js`);
  });
});
