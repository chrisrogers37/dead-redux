import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const paths = process.argv.slice(2);
if (paths.length < 2 || paths.length > 3) {
  console.error("usage: node compare.mjs <a.png> <b.png> [diff.png]");
  process.exit(2);
}
const [pathA, pathB, diffPath] = paths;

// The compare reports by default; a change fails the run only when this switch is "true".
const enforce = process.env.RM_COMPARE_ENFORCE === "true";

// The third path, if any, is a file to write, so only the first two are read.
const [a, b] = [pathA, pathB].map((path) => PNG.sync.read(readFileSync(path)));
const sameSize = a.width === b.width && a.height === b.height;
const total = a.width * a.height;

let changed = 0;
let diffWritten = false;
if (sameSize) {
  const diff = diffPath ? new PNG({ width: a.width, height: a.height }) : null;
  // A still page must not change at all, so every differing pixel counts.
  changed = pixelmatch(a.data, b.data, diff?.data, a.width, a.height, {
    threshold: 0,
    includeAA: true,
  });
  // Only a change leaves a diff image behind.
  if (changed > 0 && diff) {
    writeFileSync(diffPath, PNG.sync.write(diff));
    diffWritten = true;
  }
}
const differs = !sameSize || changed > 0;
const finding = sameSize
  ? `changed ${changed} of ${total}`
  : `sizes differ: ${a.width}x${a.height} and ${b.width}x${b.height}`;
console.log(finding);
// Say which mode ran, so a passing run is not mistaken for an enforced one.
console.log(
  enforce
    ? "enforced"
    : 'report only: RM_COMPARE_ENFORCE is not "true", so a change does not fail the run'
);

// The job summary shows the result on the run's page, so nobody has to open the log.
if (process.env.GITHUB_STEP_SUMMARY) {
  const code = (path) => `\`${basename(path)}\``;
  const result = sameSize ? `${finding} pixels` : finding;
  const note = diffWritten ? ` The diff is ${code(diffPath)} in the artifact.` : "";
  const mode = enforce ? "enforced" : "report only";
  const line = `${code(pathA)} and ${code(pathB)}: ${result} (${mode}).${note}`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Reduced-motion compare\n\n${line}\n`);
}

process.exit(enforce && differs ? 1 : 0);
