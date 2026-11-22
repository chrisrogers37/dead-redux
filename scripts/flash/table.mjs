// The counts as a PR's text gives them, from the result files capture.mjs wrote:
//
//   node scripts/flash/table.mjs <OUT_DIR>
//
// One row for each job and each grid, main's count beside the branch's. The table goes to stdout, what to know about it to stderr.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { tagOf } from "./lib.mjs";

const WINDOWS = ["A", "B", "C", "Q", "D", "S"];
const device = (j) => `${j.world.tier}, ${j.job.dpr}×: ${j.frame.width}×${j.frame.height}` + (j.world.bufferW === j.frame.width ? "" : `, drawn at ${j.world.bufferW}×${j.world.bufferH}`);
const gridName = ([ox, oy]) => (ox || oy ? `moved ${ox} px right, ${oy} px down` : "even");
// A result's count on a grid: the most swings at one block in any second, and how many blocks reach 5.
const cell = (j, grid) => {
  const r = j?.results.find((g) => g.grid.join() === grid);
  return r ? `${r.maxSwingsInASecond}, ${r.blocksAtLeast[5]}` : "–";
};

/** The table of `rows`, capture.mjs's results, as Markdown, and what a reader must know before they compare its numbers. */
export function tables(rows) {
  // A job's results on main and on the branch stand in one row: the group is the job without its variant.
  const groups = new Map();
  for (const j of rows) {
    const key = tagOf({ ...j.job, variant: "" });
    if (!groups.has(key)) groups.set(key, { main: null, branch: null });
    groups.get(key)[j.job.variant] = j;
  }
  // A desktop before a phone, a higher rung after a lower, the windows in the night's order, then the pose and the pass.
  const order = (g) => { const j = g.main ?? g.branch; return [j.world.tier === "desktop" ? 0 : 1, j.frame.width, j.job.rung, WINDOWS.indexOf(j.job.window), j.job.pose, j.job.still ? 1 : 0]; };
  const sorted = [...groups.values()].sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  });
  const out = [
    "| device and frame | rung | window | pose | pass | grid | main: most swings in any second, blocks at 5 or more | branch: most swings in any second, blocks at 5 or more |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const g of sorted) {
    const j = g.main ?? g.branch;
    for (const grid of j.job.grids) {
      out.push(`| ${device(j)} | ${j.job.rung} | ${j.job.window} (${j.window.name.split(":")[0]}) | ${j.job.pose} | ${j.job.still ? "light alone" : "whole frame"} | ${gridName(grid)} | ${cell(g.main, grid.join())} | ${cell(g.branch, grid.join())} |`);
    }
  }
  const warnings = [];
  const renderers = [...new Set(rows.map((j) => j.world.renderer))];
  if (renderers.length > 1) warnings.push(`the rows come from ${renderers.length} renderers, and counts from different renderers are not comparable: ${renderers.join("; ")}`);
  const errors = rows.reduce((a, j) => a + j.errors.length, 0);
  if (errors) warnings.push(`${errors} page errors across the rows`);
  const off = rows.reduce((a, j) => a + j.screenshotMatchesCanvas.over2, 0);
  if (off) warnings.push(`${off} screenshots differ from the canvas by more than 2/255 at a checked point`);
  return { markdown: out.join("\n"), warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/flash/table.mjs <OUT_DIR>");
    process.exit(2);
  }
  const rows = readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")));
  const { markdown, warnings } = tables(rows);
  console.log(markdown);
  const heads = [...new Set(rows.map((j) => `${j.job.variant} ${(j.world.head ?? "?").slice(0, 7)}`))];
  console.error(`${rows.length} runs; worlds: ${heads.join(", ")}; renderer: ${[...new Set(rows.map((j) => j.world.renderer))].join("; ")}; ` +
    `screenshots checked against the canvas: ${rows.reduce((a, j) => a + j.screenshotMatchesCanvas.checked, 0)}`);
  for (const w of warnings) console.error(`WARNING: ${w}`);
}
