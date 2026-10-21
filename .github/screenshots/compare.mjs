import { readFileSync } from "fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error("usage: node compare.mjs <a.png> <b.png>");
  process.exit(2);
}

const [a, b] = paths.map((path) => PNG.sync.read(readFileSync(path)));
if (a.width !== b.width || a.height !== b.height) {
  console.log(`sizes differ: ${a.width}x${a.height} and ${b.width}x${b.height}`);
  process.exit(1);
}

const total = a.width * a.height;
// A still page must not change at all, so every differing pixel counts.
const changed = pixelmatch(a.data, b.data, null, a.width, a.height, {
  threshold: 0,
  includeAA: true,
});
console.log(`changed ${changed} of ${total}`);
process.exit(changed > 0 ? 1 : 0);
