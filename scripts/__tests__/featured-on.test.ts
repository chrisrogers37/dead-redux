import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { addDays, featuredWindow, main, showsToMap } from "../featured-on.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("addDays", () => {
  it("adds calendar days across a year end", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("adds calendar days across a month end", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-20", 14)).toBe("2026-11-03");
  });

  it("knows a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("adds no days", () => {
    expect(addDays("2026-10-20", 0)).toBe("2026-10-20");
  });
});

// A schedule of five days in which one show comes back on the third.
const SCHEDULE: Record<string, string> = {
  "2026-10-01": "1977-05-08",
  "2026-10-02": "1977-05-09",
  "2026-10-03": "1977-05-08",
  "2026-10-04": "1981-08-06",
  "2026-10-05": "1990-03-29",
};
const showOn = (date: string) => SCHEDULE[date];

describe("featuredWindow", () => {
  it("lists the show of each of the days from a date", () => {
    expect(featuredWindow("2026-10-01", 3, showOn)).toEqual([
      { featured: "2026-10-01", show: "1977-05-08" },
      { featured: "2026-10-02", show: "1977-05-09" },
      { featured: "2026-10-03", show: "1977-05-08" },
    ]);
  });

  it("lists nothing for no days", () => {
    expect(featuredWindow("2026-10-01", 0, showOn)).toEqual([]);
  });

  it("is the site's own schedule by default", () => {
    expect(featuredWindow("2026-10-20", 1)).toEqual([{ featured: "2026-10-20", show: "1986-07-04" }]);
  });
});

describe("showsToMap", () => {
  const featured = featuredWindow("2026-10-01", 5, showOn);

  // The recording each map was made from, by show date.
  const SBD = new Map([
    ["1977-05-08", "gd77-05-08.sbd"],
    ["1981-08-06", "gd81-08-06.sbd"],
  ]);
  // The page plays what each map was made from: the answer when nothing has changed. `asked` lists the shows asked about.
  function asMapped(have: Map<string, string>) {
    const asked: string[] = [];
    const playingNow = async (show: string) => {
      asked.push(show);
      return have.get(show) ?? null;
    };
    return Object.assign(playingNow, { asked });
  }

  it("lists each show once, in the order they are featured", async () => {
    expect(await showsToMap(featured, new Map(), 10, asMapped(new Map()))).toEqual([
      "1977-05-08",
      "1977-05-09",
      "1981-08-06",
      "1990-03-29",
    ]);
  });

  it("leaves out the shows whose map is of the recording the page plays, asking about each mapped show once", async () => {
    const playing = asMapped(SBD);
    expect(await showsToMap(featured, SBD, 10, playing)).toEqual(["1977-05-09", "1990-03-29"]);
    expect(playing.asked).toEqual(["1977-05-08", "1981-08-06"]);
  });

  it("stops at the limit", async () => {
    expect(await showsToMap(featured, new Map(), 2, asMapped(new Map()))).toEqual(["1977-05-08", "1977-05-09"]);
    const one = new Map([["1977-05-08", "gd77-05-08.sbd"]]);
    expect(await showsToMap(featured, one, 2, asMapped(one))).toEqual(["1977-05-09", "1981-08-06"]);
  });

  it("lists nothing when every show's map is of the recording the page plays", async () => {
    const all = new Map(featured.map((day: { show: string }): [string, string] => [day.show, `gd${day.show}.sbd`]));
    expect(await showsToMap(featured, all, 10, asMapped(all))).toEqual([]);
  });

  it("maps a show again when the page plays another recording than its map was made from", async () => {
    const playing = async (show: string) => (show === "1977-05-08" ? "gd77-05-08.aud" : (SBD.get(show) ?? null));
    expect(await showsToMap(featured, SBD, 10, playing)).toEqual(["1977-05-08", "1977-05-09", "1990-03-29"]);
  });

  it("counts a map that names no recording as made from another", async () => {
    const unnamed = new Map([["1977-05-08", ""]]);
    expect(await showsToMap(featured, unnamed, 1, async () => "gd77-05-08.sbd")).toEqual(["1977-05-08"]);
  });

  it("keeps a map when what the page plays cannot be learned", async () => {
    expect(await showsToMap(featured, SBD, 1, async () => null)).toEqual(["1977-05-09"]);
  });

  it("asks nothing more once the limit is picked", async () => {
    const later = new Map([["1981-08-06", "gd81-08-06.sbd"]]);
    const playing = asMapped(later);
    expect(await showsToMap(featured, later, 2, playing)).toEqual(["1977-05-08", "1977-05-09"]);
    expect(playing.asked).toEqual([]);
  });
});

// A run's io: what it prints and what it says, the maps directories it can read ({ dir: { name: text } }), and the site it asks,
// whose /api/playing/<show date> answers with `playing[show date]`: the identifier of the recording the page plays, or the HTTP
// status of a failure. Every URL asked is in `asked`, and every file read in `reads`.
function fakeIO(dirs: Record<string, Record<string, string>> = {}, playing: Record<string, string | number> = {}) {
  const out: string[] = [];
  const log: string[] = [];
  const asked: string[] = [];
  const reads: string[] = [];
  const io = {
    out: (line: string) => {
      out.push(line);
    },
    log: (line: string) => {
      log.push(line);
    },
    list: (dir: string) => {
      if (!(dir in dirs)) throw new Error(`ENOENT: ${dir}`);
      return Object.keys(dirs[dir]);
    },
    read: (file: string) => {
      reads.push(file);
      const cut = file.lastIndexOf("/");
      const text = dirs[file.slice(0, cut)]?.[file.slice(cut + 1)];
      if (text === undefined) throw new Error(`ENOENT: ${file}`);
      return text;
    },
    fetch: async (url: string) => {
      asked.push(url);
      const answer = playing[url.slice(url.lastIndexOf("/") + 1)] ?? 404;
      return typeof answer === "string"
        ? new Response(JSON.stringify({ identifier: answer }), { headers: { "content-type": "application/json" } })
        : new Response(null, { status: answer });
    },
    sleep: async () => {},
  };
  return { io, out, log, asked, reads };
}

// A map's file, as far as the pick reads it.
const mapOf = (playing: string) => JSON.stringify({ playing });

describe("main", () => {
  const ARGS = ["--from", "2026-10-20", "--days", "1", "--limit", "2"];
  const MAPPED = { maps: { "1986-07-04.json": mapOf("gd86-07-04.sbd") } };

  it("prints the show to map and says which show each day features", async () => {
    const f = fakeIO();
    expect(await main(ARGS, f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
    expect(f.log).toEqual(["2026-10-20 features 1986-07-04"]);
    expect(f.asked).toEqual([]);
  });

  it("leaves out a show whose map is of the recording the page plays, and says so", async () => {
    const f = fakeIO(MAPPED, { "1986-07-04": "gd86-07-04.sbd" });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual([]);
    expect(f.log).toEqual([
      "2026-10-20 features 1986-07-04, which has a map",
      "1986-07-04: the page still plays gd86-07-04.sbd",
    ]);
  });

  it("maps a show again when the page plays another recording than its map was made from, and says so", async () => {
    const f = fakeIO(MAPPED, { "1986-07-04": "gd86-07-04.aud" });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
    expect(f.log).toContain("1986-07-04: its map was made from gd86-07-04.sbd, and the page now plays gd86-07-04.aud");
  });

  it("asks production's /api/playing route, or the site it is given", async () => {
    const production = fakeIO(MAPPED, { "1986-07-04": "gd86-07-04.sbd" });
    await main([...ARGS, "--maps", "maps"], production.io);
    expect(production.asked).toEqual(["https://dead-redux.vercel.app/api/playing/1986-07-04"]);
    const preview = fakeIO(MAPPED, { "1986-07-04": "gd86-07-04.sbd" });
    await main([...ARGS, "--maps", "maps", "--site", "https://preview.example.test/"], preview.io);
    expect(preview.asked).toEqual(["https://preview.example.test/api/playing/1986-07-04"]);
  });

  it("keeps a map when the site says the page plays no recording of the show", async () => {
    const f = fakeIO(MAPPED, { "1986-07-04": 404 });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual([]);
    expect(f.log).toContain(
      "1986-07-04: the page plays no recording of it, so its map stands: https://dead-redux.vercel.app/api/playing/1986-07-04 answered 404"
    );
  });

  it("stops asking once the site fails, and keeps every map not yet checked, with a warning", async () => {
    // 2026-10-19 features 1987-03-27, and 2026-10-20 1986-07-04.
    const maps = { maps: { "1987-03-27.json": mapOf("gd87-03-27.sbd"), "1986-07-04.json": mapOf("gd86-07-04.sbd") } };
    const f = fakeIO(maps, { "1987-03-27": 503, "1986-07-04": "gd86-07-04.aud" });
    expect(await main(["--from", "2026-10-19", "--days", "2", "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual([]);
    // Three tries at the first show, retried as every request is, and none at the second.
    expect(f.asked).toEqual(Array(3).fill("https://dead-redux.vercel.app/api/playing/1987-03-27"));
    expect(f.log).toContain(
      "::warning::1987-03-27: what the page plays could not be learned, so its map and those after it stand: https://dead-redux.vercel.app/api/playing/1987-03-27 answered 503"
    );
  });

  it("reads only the maps of the shows in the window", async () => {
    const f = fakeIO({ maps: { ...MAPPED.maps, "1977-05-08.json": mapOf("gd77-05-08.sbd") } }, { "1986-07-04": "gd86-07-04.sbd" });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.reads).toEqual(["maps/1986-07-04.json"]);
  });

  it("reads only the maps directory's <show date>.json files, and maps again a show whose map names no recording", async () => {
    const f = fakeIO({ maps: { "1986-07-04.json": "{}", "README.md": "not a map" } }, { "1986-07-04": "gd86-07-04.sbd" });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
  });

  it("maps again a show whose map does not parse, rather than stopping the run", async () => {
    const f = fakeIO({ maps: { "1986-07-04.json": "not json" } }, { "1986-07-04": "gd86-07-04.sbd" });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
  });

  it("reads an empty maps directory as no maps", async () => {
    const f = fakeIO({ maps: {} });
    expect(await main([...ARGS, "--maps", "maps"], f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
    expect(f.asked).toEqual([]);
  });

  it("looks as many days ahead as asked and prints at most the limit", async () => {
    const f = fakeIO();
    expect(await main(["--from", "2026-10-20", "--days", "3", "--limit", "2"], f.io)).toBe(0);
    expect(f.log).toHaveLength(3);
    expect(f.out).toHaveLength(2);
    expect(f.out[0]).toBe("1986-07-04");
  });

  it("looks 14 days ahead for 2 shows from today, unless told otherwise", async () => {
    const f = fakeIO();
    expect(await main([], f.io)).toBe(0);
    expect(f.log).toHaveLength(14);
    expect(f.out).toHaveLength(2);
  });

  it.each([
    { name: "no days", args: ["--days", "0"] },
    { name: "days that are not a number", args: ["--days", "x"] },
    { name: "a fractional number of days", args: ["--days", "1.5"] },
    { name: "a limit that is not a number", args: ["--limit", "x"] },
    { name: "a limit of 0", args: ["--limit", "0"] },
    { name: "a negative limit", args: ["--limit", "-1"] },
    { name: "a start that is not a date", args: ["--from", "tomorrow"] },
    { name: "a start that is not on the calendar", args: ["--from", "2026-13-45"] },
    { name: "a start its month does not have", args: ["--from", "1986-02-30"] },
    { name: "a site that is not an origin", args: ["--site", "https://example.test/maps"] },
    { name: "an option it does not know", args: ["--max", "3"] },
    { name: "an option without a value", args: ["--days"] },
    { name: "a maps directory it cannot read", args: ["--maps", "missing"] },
  ])("refuses $name", async ({ args }) => {
    const f = fakeIO();
    expect(await main(args, f.io)).toBe(2);
    expect(f.out).toEqual([]);
    expect(f.log).toHaveLength(1);
  });

  it("runs as the maps workflow runs it: plain Node with scripts/resolve-ts.mjs", () => {
    const args = ["--import", "./scripts/resolve-ts.mjs", "scripts/featured-on.mjs", "--from", "2026-10-20", "--days", "1"];
    const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    // Node may add its own warnings to stderr; the script's line is the one that matters.
    expect(run.stderr).toContain("2026-10-20 features 1986-07-04\n");
    expect(run.stdout).toBe("1986-07-04\n");
    expect(run.status).toBe(0);
  });
});
