// Checks the maps the analyse job made before the publish job commits them: each file is named <show date>.json, is a regular
// file within MAX_MAP_BYTES, parses, passes checkMap and names its own show. If every map passes, all are written into DEST; if
// any fails, none is. Runs under plain node: it imports only Node's own modules and the map schema.
//
// Usage: node scripts/check-maps.mjs SRC DEST
import { lstat, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { checkMap, MAX_MAP_BYTES } from "../public/world/maps.js";

const NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;
// A map with more problems than this reports the first few and how many were left out.
const MAX_REPORTED = 5;

/** The bytes of a map file that passes every check, or the problems that fail it. */
async function checkFile(src, name) {
  const match = NAME.exec(name);
  if (!match) return { problems: ["not named <show date>.json"] };
  const path = join(src, name);
  const info = await lstat(path);
  if (!info.isFile()) return { problems: ["not a regular file"] };
  if (info.size > MAX_MAP_BYTES) return { problems: [`${info.size} bytes, over the limit of ${MAX_MAP_BYTES}`] };
  const bytes = await readFile(path);
  let map;
  try {
    map = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    return { problems: [`not JSON: ${err instanceof Error ? err.message : err}`] };
  }
  const problems = checkMap(map);
  if (problems.length > 0) return { problems };
  if (map.show !== match[1]) return { problems: [`names the show ${map.show}, not ${match[1]}`] };
  return { bytes };
}

/**
 * Checks every map in a directory and, only if all pass, writes them to another.
 *
 * @param src - The directory of maps to check.
 * @param dest - The directory the checked maps are written to, made if it is missing.
 * @param log - Called with a line for each map that passes.
 * @param error - Called with a line for each problem.
 * @returns The exit code: 1 when there is no map or any map fails, otherwise 0.
 */
export async function checkMaps(src, dest, log = console.log, error = console.error) {
  const names = (await readdir(src)).sort();
  if (names.length === 0) {
    error("No maps to publish");
    return 1;
  }
  const checked = [];
  let failed = false;
  for (const name of names) {
    const { bytes, problems } = await checkFile(src, name);
    if (bytes) {
      log(`${name}: schema valid, ${bytes.length} bytes (limit ${MAX_MAP_BYTES})`);
      checked.push({ name, bytes });
      continue;
    }
    failed = true;
    for (const problem of problems.slice(0, MAX_REPORTED)) error(`${name}: ${problem}`);
    if (problems.length > MAX_REPORTED) error(`${name}: and ${problems.length - MAX_REPORTED} more`);
  }
  if (failed) return 1;
  await mkdir(dest, { recursive: true });
  for (const { name, bytes } of checked) await writeFile(join(dest, name), bytes);
  return 0;
}

/**
 * Checks the maps in SRC and writes them to DEST when all pass.
 *
 * @param args - [SRC, DEST].
 * @returns The exit code: 2 unless given exactly those two, otherwise that of `checkMaps`.
 */
export async function main(args) {
  if (args.length !== 2) {
    console.error("Usage: node scripts/check-maps.mjs SRC DEST");
    return 2;
  }
  return checkMaps(args[0], args[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  );
}
