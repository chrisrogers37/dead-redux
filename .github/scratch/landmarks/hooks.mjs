// Same-thread module hooks for running the world's modules in plain Node with the REAL three build:
//   "three"             -> <three>/build/<file>      (the file the site loads from the CDN, same bytes)
//   "three/addons/..."  -> <three>/examples/jsm/...
//   every .js under a tree root is loaded as an ES module (the trees carry no "type": "module")
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export function installHooks({ threeDir, threeFile, treeRoots }) {
  const THREE_URL = pathToFileURL(join(threeDir, "build", threeFile)).href;
  const ADDONS = pathToFileURL(join(threeDir, "examples", "jsm")).href + "/";
  const roots = treeRoots.map((r) => pathToFileURL(r).href.replace(/\/?$/, "/"));
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "three") return { url: THREE_URL, shortCircuit: true };
      if (specifier.startsWith("three/addons/")) return { url: ADDONS + specifier.slice("three/addons/".length), shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.endsWith(".js") && roots.some((r) => url.startsWith(r))) return nextLoad(url, { ...context, format: "module" });
      return nextLoad(url, context);
    },
  });
  return THREE_URL;
}
