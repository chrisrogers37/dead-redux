// The shows the site features over the coming days, so the maps workflow knows which shows need a map next.
//
// Usage: node --import ./scripts/resolve-ts.mjs scripts/featured-on.mjs [--from YYYY-MM-DD] [--days N] [--limit N] [--maps DIR] [--site URL]
//
// Prints show dates one a line, in the order they are featured, once each, at most LIMIT: the shows with no map in DIR (the maps
// that exist, one <show date>.json each), and the shows whose map was made from another recording than the one the site's
// /api/playing route names now, since the page refuses such a map. What it reports about each day goes to stderr.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";
import { pathToFileURL } from "url";
import { getDailyShow, getTodayDateStr, isValidDateStr } from "../src/lib/daily-show";
import { HttpError, politeClient, SITE, siteOf } from "./analyse-show.mjs";

const USAGE =
  "Usage: node --import ./scripts/resolve-ts.mjs scripts/featured-on.mjs [--from YYYY-MM-DD] [--days N] [--limit N] [--maps DIR] [--site URL]";

// How long the site has to say what a page plays.
const REQUEST_TIMEOUT_MS = 60 * 1000;

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
 * The show dates of a window to map next, in window order, each once: those with no map, and those whose map was made from
 * another recording than the one the page plays now.
 *
 * @param window - What `featuredWindow` returned.
 * @param have - A Map from each show date that has a map to the recording the map was made from (its `playing`).
 * @param limit - The most show dates to return.
 * @param playingNow - async (show date) => the recording the page plays for it now, or null when that is not known, which leaves
 *   its map standing. Asked only about the shows that have a map, once each, and no more once `limit` are picked.
 */
export async function showsToMap(window, have, limit, playingNow) {
  const picked = [];
  for (const show of new Set(window.map((day) => day.show))) {
    if (picked.length >= limit) break;
    if (!have.has(show)) {
      picked.push(show);
    } else {
      const now = await playingNow(show);
      if (now !== null && now !== have.get(show)) picked.push(show);
    }
  }
  return picked;
}

/**
 * The recording each of some shows' maps was made from: a Map from show date to the map's `playing`, or "" for a map that names
 * none or does not parse, which no page plays. A show with no <show date>.json in the directory has no map.
 *
 * @param dir - The directory of maps.
 * @param shows - The show dates to look up.
 * @param io - { list (a directory's file names), read (a file's text) }.
 */
function mapsOf(dir, shows, io) {
  const names = new Set(io.list(dir));
  const have = new Map();
  for (const show of shows) {
    if (!names.has(`${show}.json`)) continue;
    const text = io.read(join(dir, `${show}.json`));
    let playing = null;
    try {
      playing = JSON.parse(text)?.playing;
    } catch {
      // A map that does not parse names no recording.
    }
    have.set(show, typeof playing === "string" ? playing : "");
  }
  return have;
}

const positiveInteger = (text) => (/^[1-9]\d*$/.test(text) ? Number(text) : null);

const nodeIO = {
  out: (line) => console.log(line),
  log: (line) => console.error(line),
  list: (dir) => readdirSync(dir),
  read: (file) => readFileSync(file, "utf8"),
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  sleep: (ms) => sleep(ms),
};

/**
 * Prints the show dates to map next, one a line.
 *
 * @param args - The command line's options.
 * @param io - { out (a show date), log (what is reported about each day), list (a directory's file names), read (a file's text),
 *   fetch, sleep }.
 * @returns The exit code: 2 for a bad option or a maps directory it cannot read, otherwise 0.
 */
export async function main(args, io = nodeIO) {
  const options = { "--from": null, "--days": "14", "--limit": "2", "--maps": null, "--site": SITE };
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
  const site = siteOf(options["--site"]);
  if (!isValidDateStr(from) || days === null || limit === null || site === null) {
    io.log(`--from needs a date, --days and --limit a positive whole number, --site an origin. ${USAGE}`);
    return 2;
  }
  const window = featuredWindow(from, days);
  let have = new Map();
  if (options["--maps"] !== null) {
    try {
      have = mapsOf(options["--maps"], window.map((day) => day.show), io);
    } catch (err) {
      io.log(`Cannot read the maps in ${options["--maps"]}: ${err instanceof Error ? err.message : err}`);
      return 2;
    }
  }
  for (const { featured, show } of window) io.log(`${featured} features ${show}${have.has(show) ? ", which has a map" : ""}`);
  const client = politeClient(io);
  // Once the site fails to answer, it is asked nothing more, and the maps not yet checked stand too.
  let unanswered = false;
  const playingNow = async (show) => {
    if (unanswered) return null;
    try {
      const { identifier } = (await client.request(`${site}/api/playing/${show}`, (res) => res.json())) ?? {};
      if (typeof identifier !== "string") throw new Error(`${site} names no recording`);
      io.log(
        identifier === have.get(show)
          ? `${show}: the page still plays ${identifier}`
          : `${show}: its map was made from ${have.get(show) || "no recording"}, and the page now plays ${identifier}`
      );
      return identifier;
    } catch (err) {
      const why = err instanceof Error ? err.message : err;
      if (err instanceof HttpError && err.status === 404) {
        io.log(`${show}: the page plays no recording of it, so its map stands: ${why}`);
        return null;
      }
      unanswered = true;
      io.log(`::warning::${show}: what the page plays could not be learned, so its map and those after it stand: ${why}`);
      return null;
    }
  };
  for (const show of await showsToMap(window, have, limit, playingNow)) io.out(show);
  return 0;
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
