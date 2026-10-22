// The shows the site features over the coming days, so the maps workflow knows which shows need a map next.
//
// Usage: npx tsx scripts/featured-on.mjs [--from YYYY-MM-DD] [--days N] [--limit N] [--have FILE]
//
// Prints show dates one a line, in the order they are featured, once each, leaving out those listed in FILE (one show date a
// line: the maps that exist), at most LIMIT. What it reports about each day goes to stderr.
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { getDailyShow, getTodayDateStr, isValidDateStr } from "../src/lib/daily-show";

const USAGE = "Usage: npx tsx scripts/featured-on.mjs [--from YYYY-MM-DD] [--days N] [--limit N] [--have FILE]";

/**
 * The date `days` after an ISO date (before it when negative), by calendar days.
 *
 * @param date - "YYYY-MM-DD".
 */
export function addDays(date, days) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * The show the site features on each of `days` days from a date.
 *
 * @param from - The first featured date, "YYYY-MM-DD".
 * @param showOn - The show date a featured date features.
 * @returns [{ featured, show }] in date order.
 */
export function featuredWindow(from, days, showOn = (date) => getDailyShow(date).date) {
  return Array.from({ length: days }, (_, k) => {
    const featured = addDays(from, k);
    return { featured, show: showOn(featured) };
  });
}

/**
 * The show dates of a window that have no map, in window order, each once.
 *
 * @param window - What `featuredWindow` returned.
 * @param have - A Set of the show dates that have a map.
 * @param limit - The most show dates to return.
 */
export function showsToMap(window, have, limit) {
  const picked = [];
  for (const { show } of window) {
    if (picked.length >= limit) break;
    if (!have.has(show) && !picked.includes(show)) picked.push(show);
  }
  return picked;
}

const positiveInteger = (text) => (/^[1-9]\d*$/.test(text) ? Number(text) : null);

/**
 * Prints the show dates to map next, one a line.
 *
 * @param args - The command line's options.
 * @param io - { out (a show date), log (what is reported about each day), read (a file's text) }.
 * @returns The exit code: 2 for a bad option, otherwise 0.
 */
export function main(
  args,
  io = {
    out: (line) => console.log(line),
    log: (line) => console.error(line),
    read: (file) => readFileSync(file, "utf8"),
  }
) {
  const options = { "--from": null, "--days": "14", "--limit": "2", "--have": null };
  for (let i = 0; i < args.length; i += 2) {
    if (!Object.hasOwn(options, args[i])) {
      io.log(`Unknown option ${args[i]}. ${USAGE}`);
      return 2;
    }
    if (args[i + 1] === undefined) {
      io.log(`${args[i]} needs a value. ${USAGE}`);
      return 2;
    }
    options[args[i]] = args[i + 1];
  }
  const from = options["--from"] ?? getTodayDateStr();
  const days = positiveInteger(options["--days"]);
  const limit = positiveInteger(options["--limit"]);
  if (!isValidDateStr(from) || days === null || limit === null) {
    io.log(`--from needs a date, --days and --limit a positive whole number. ${USAGE}`);
    return 2;
  }
  let have = new Set();
  if (options["--have"] !== null) {
    try {
      have = new Set(io.read(options["--have"]).split("\n").map((line) => line.trim()).filter(Boolean));
    } catch (err) {
      io.log(`Cannot read ${options["--have"]}: ${err instanceof Error ? err.message : err}`);
      return 2;
    }
  }
  const window = featuredWindow(from, days);
  for (const { featured, show } of window) io.log(`${featured} features ${show}${have.has(show) ? ", which has a map" : ""}`);
  for (const show of showsToMap(window, have, limit)) io.out(show);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
