// Lets plain Node run a script that imports the site's TypeScript modules, as the maps workflow does:
//   node --import ./scripts/resolve-ts.mjs scripts/analyse-show.mjs ...
// Node strips the types itself. These hooks add what the site's modules take from their bundler: an extensionless relative
// import finds its .ts file, a .ts file is an ES module, and a JSON import needs no import attribute.
import { readFileSync } from "fs";
import { registerHooks } from "module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      return { format: "module", source: `export default ${readFileSync(new URL(url), "utf8")};`, shortCircuit: true };
    }
    if (url.endsWith(".ts")) return nextLoad(url, { ...context, format: "module-typescript" });
    return nextLoad(url, context);
  },
});
