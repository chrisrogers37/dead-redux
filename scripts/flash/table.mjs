// The counts as a PR's text gives them, from the result files capture.mjs wrote into a run's folder, or several runs':
//
//   node scripts/flash/table.mjs [--mixed] <run's folder> [<run's folder> ...]
//
// The WCAG count: one row for each job, main's general and red flashes beside the branch's, and where a job counted the 2x2 blocks too
// (--blocks), their worst grid's count beside them. Then the 2x2 count, from results that have it, as every count before 2026-11-27
// was made: one row for each job and each grid. The tables go to stdout, what to know about them to stderr.
// Rows whose branch worlds differ, or whose main worlds do, are refused: they are of different code, and a table of them would set
// one PR's counts beside another's. --mixed prints them all the same, and says so.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { tagOf } from "./lib.mjs";

const WINDOWS = ["A", "B", "C", "Q", "D", "S"];
const device = (j) => `${j.world.tier}, ${j.job.dpr}×: ${j.frame.width}×${j.frame.height}` + (j.world.bufferW === j.frame.width ? "" : `, drawn at ${j.world.bufferW}×${j.world.bufferH}`);
const gridName = ([ox, oy]) => (ox || oy ? `moved ${ox} px right, ${oy} px down` : "even");
// A result's count on a grid: the most swings at one block in any second, and how many blocks reach 5.
const count = (j, grid) => {
  const r = (j.results ?? []).find((g) => g.grid.join() === grid);
  return r ? `${r.maxSwingsInASecond}, ${r.blocksAtLeast[5]}` : "–";
};
// Its 2x2 count at its worst grid, the one with the most swings at a block in a second: the old bar's number for the job.
const worstGrid = (j) => {
  const r = (j.results ?? []).reduce((a, b) => (!a || b.maxSwingsInASecond > a.maxSwingsInASecond ? b : a), null);
  return r ? `${r.maxSwingsInASecond}, ${r.blocksAtLeast[5]}` : "–";
};
// Its WCAG count: the most general flashes and the most red in any second in any field, and the largest share of a field that changed
// one way at once, general and red.
const pct = (r) => (r.largest ? `${Math.round(r.largest.share * 100)} %` : "0 %");
const flashes = (j) => (j.wcag ? `${j.wcag.general.flashes}, ${j.wcag.red.flashes} (${pct(j.wcag.general)}, ${pct(j.wcag.red)})` : "–");
// A variant's cell for a job: its result's count, by `said`. Where the rows hold more than one result of the job (two runs, which
// --mixed lets be of two worlds), every one, each named by its world's hash; two that say the same of the same world are said once.
const cellBy = (jobs, said) => {
  const all = [...new Set(jobs.map((j) => `${said(j)} (${j.world.hash.slice(0, 12)})`))];
  return jobs.length === 0 ? "–" : all.length === 1 ? said(jobs[0]) : all.join("; ");
};
const cell = (jobs, grid) => cellBy(jobs, (j) => count(j, grid));
// A world as a reader tells it from another: the start of its hash, and where it came from.
const worldName = (w) => `${w.hash.slice(0, 12)} (${w.from === "main" ? `main at ${w.commit.slice(0, 7)}` : w.from === "server" ? `the server's own, ${w.ref}` : `${w.ref}${w.commit ? ` at ${w.commit.slice(0, 7)}` : ""}${w.dirty ? ", changed since" : ""}`})`;

/**
 * The table of `rows`, capture.mjs's results, as Markdown, with the worlds it is of and what a reader must know before they compare its
 * numbers. It throws when the rows of a variant are of more than one world, unless `mixed` allows it.
 */
export function tables(rows, { mixed = false } = {}) {
  const warnings = [], worlds = [];
  // A result with no hash of its world is an earlier counter's: nothing says which code it counted.
  const nameless = rows.filter((j) => !j.world?.hash);
  if (nameless.length) throw new Error(`${nameless.length} of ${rows.length} results do not say which world they counted: they are of an earlier flash counter (${nameless.map((j) => j.tag ?? "untagged").join(", ")})`);
  for (const variant of ["main", "branch"]) {
    const of = new Map();
    for (const j of rows.filter((row) => row.job.variant === variant)) of.set(j.world.hash, [...(of.get(j.world.hash) ?? []), j]);
    worlds.push(...[...of.values()].map((jobs) => `${variant}: ${worldName(jobs[0].world)}`));
    if (of.size < 2) continue;
    const which = [...of.values()].map((jobs) => `${worldName(jobs[0].world)}: ${jobs.map((j) => j.tag).join(", ")}`).join("; ");
    if (!mixed) throw new Error(`the ${variant} rows are of ${of.size} worlds, and one table would set counts of different code side by side: ${which}`);
    warnings.push(`the ${variant} rows are of ${of.size} worlds: ${which}`);
  }
  // A job's results on main and on the branch stand in one row: the group is the job without its variant.
  const groups = new Map();
  for (const j of rows) {
    const key = tagOf({ ...j.job, variant: "" });
    if (!groups.has(key)) groups.set(key, { main: [], branch: [] });
    groups.get(key)[j.job.variant].push(j);
  }
  // A desktop before a phone, a higher rung after a lower, the windows in the night's order, then the pose and the pass.
  const order = (g) => { const j = g.main[0] ?? g.branch[0]; return [j.world.tier === "desktop" ? 0 : 1, j.frame.width, j.job.rung, WINDOWS.indexOf(j.job.window), j.job.pose, j.job.still ? 1 : 0]; };
  const sorted = [...groups.values()].sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  });
  const out = [], of = (g) => [...g.main, ...g.branch];
  const what = (j) => `| ${device(j)} | ${j.job.rung} | ${j.job.window} (${j.window.name.split(":")[0]}) | ${j.job.pose} | ${j.job.still ? "light alone" : "whole frame"} |`;
  // The WCAG count, with the 2x2 count's worst grid beside it where the rows have both.
  const counted = sorted.filter((g) => of(g).some((j) => j.wcag)), both = counted.some((g) => of(g).some((j) => j.results?.length));
  if (counted.length) {
    out.push(
      "| device and frame | rung | window | pose | pass | 10° field, px | main: general, red flashes in any second (largest share of a field changing at once) | branch: general, red flashes in any second (largest share of a field changing at once) |" +
        (both ? " main, 2×2 blocks: most swings in any second, blocks at 5 or more, worst grid | branch, 2×2 blocks: most swings in any second, blocks at 5 or more, worst grid |" : ""),
      `|---|---|---|---|---|---|---|---|${both ? "---|---|" : ""}`,
    );
    for (const g of counted) {
      const j = of(g).find((k) => k.wcag);
      out.push(`${what(j)} ${j.wcag.field.width}×${j.wcag.field.height} | ${cellBy(g.main, flashes)} | ${cellBy(g.branch, flashes)} |` + (both ? ` ${cellBy(g.main, worstGrid)} | ${cellBy(g.branch, worstGrid)} |` : ""));
    }
  }
  // The 2x2 count, a row a grid, from the results that have it.
  const blocks = sorted.filter((g) => of(g).some((j) => j.results?.length));
  if (blocks.length) {
    if (out.length) out.push("");
    out.push(
      "| device and frame | rung | window | pose | pass | grid | main: most swings in any second, blocks at 5 or more | branch: most swings in any second, blocks at 5 or more |",
      "|---|---|---|---|---|---|---|---|",
    );
    for (const g of blocks) {
      const j = g.main[0] ?? g.branch[0];
      for (const grid of j.job.grids) out.push(`${what(j)} ${gridName(grid)} | ${cell(g.main, grid.join())} | ${cell(g.branch, grid.join())} |`);
    }
  }
  const renderers = [...new Set(rows.map((j) => j.world.renderer))];
  if (renderers.length > 1) warnings.push(`the rows come from ${renderers.length} renderers, and counts from different renderers are not comparable: ${renderers.join("; ")}`);
  // A job whose frames could not be checked against the canvas finishes all the same: its count is of screenshots nothing vouches for.
  const unchecked = rows.filter((j) => j.canvasCheck.unchecked > 0);
  if (unchecked.length) warnings.push(`${unchecked.length} of ${rows.length} jobs have frames that were not checked against the canvas (the world draws them at another size than the screen's): ${unchecked.map((j) => j.tag).join(", ")}`);
  // Nor does a job whose world could not say where the visitor stood show that its pose stood still.
  const unheld = rows.filter((j) => j.poseHeld === false);
  if (unheld.length) warnings.push(`${unheld.length} of ${rows.length} jobs could not check that the visitor stood still at their pose (their world is from before window.__hill.walker): ${unheld.map((j) => j.tag).join(", ")}`);
  return { markdown: out.join("\n"), worlds, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), dirs = args.filter((arg) => arg !== "--mixed");
  if (!dirs.length) {
    console.error("usage: node scripts/flash/table.mjs [--mixed] <run's folder> [<run's folder> ...]");
    process.exit(2);
  }
  const rows = dirs.flatMap((dir) => readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(readFileSync(join(dir, n), "utf8"))));
  try {
    const { markdown, worlds, warnings } = tables(rows, { mixed: args.includes("--mixed") });
    console.log(markdown);
    console.error(`${rows.length} jobs; ${worlds.join("; ")}; renderer: ${[...new Set(rows.map((j) => j.world.renderer))].join("; ")}`);
    for (const w of warnings) console.error(`WARNING: ${w}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
