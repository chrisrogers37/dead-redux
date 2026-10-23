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

  it("lists each show once, in the order they are featured", () => {
    expect(showsToMap(featured, new Set(), 10)).toEqual(["1977-05-08", "1977-05-09", "1981-08-06", "1990-03-29"]);
  });

  it("leaves out the shows that have a map", () => {
    expect(showsToMap(featured, new Set(["1977-05-08", "1981-08-06"]), 10)).toEqual(["1977-05-09", "1990-03-29"]);
  });

  it("stops at the limit", () => {
    expect(showsToMap(featured, new Set(), 2)).toEqual(["1977-05-08", "1977-05-09"]);
    expect(showsToMap(featured, new Set(["1977-05-08"]), 2)).toEqual(["1977-05-09", "1981-08-06"]);
  });

  it("lists nothing when every show has a map", () => {
    expect(showsToMap(featured, new Set(featured.map((day: { show: string }) => day.show)), 10)).toEqual([]);
  });
});

// A run's io: what it prints, what it says about each day, and the files it can read.
function fakeIO(files: Record<string, string> = {}) {
  const out: string[] = [];
  const log: string[] = [];
  const io = {
    out: (line: string) => {
      out.push(line);
    },
    log: (line: string) => {
      log.push(line);
    },
    read: (file: string) => {
      if (!(file in files)) throw new Error(`ENOENT: ${file}`);
      return files[file];
    },
  };
  return { io, out, log };
}

describe("main", () => {
  const ARGS = ["--from", "2026-10-20", "--days", "1", "--limit", "2"];

  it("prints the show to map and says which show each day features", () => {
    const f = fakeIO();
    expect(main(ARGS, f.io)).toBe(0);
    expect(f.out).toEqual(["1986-07-04"]);
    expect(f.log).toEqual(["2026-10-20 features 1986-07-04"]);
  });

  it("leaves out a show that has a map, and says so", () => {
    const f = fakeIO({ "have.txt": "1986-07-04\n" });
    expect(main([...ARGS, "--have", "have.txt"], f.io)).toBe(0);
    expect(f.out).toEqual([]);
    expect(f.log).toEqual(["2026-10-20 features 1986-07-04, which has a map"]);
  });

  it("reads a have file of one date a line, blank lines and spaces ignored", () => {
    const f = fakeIO({ "have.txt": "1977-05-08\r\n\n  1986-07-04  \n" });
    expect(main([...ARGS, "--have", "have.txt"], f.io)).toBe(0);
    expect(f.out).toEqual([]);
  });

  it("looks as many days ahead as asked and prints at most the limit", () => {
    const f = fakeIO();
    expect(main(["--from", "2026-10-20", "--days", "3", "--limit", "2"], f.io)).toBe(0);
    expect(f.log).toHaveLength(3);
    expect(f.out).toHaveLength(2);
    expect(f.out[0]).toBe("1986-07-04");
  });

  it("looks 14 days ahead for 2 shows from today, unless told otherwise", () => {
    const f = fakeIO();
    expect(main([], f.io)).toBe(0);
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
    { name: "an option it does not know", args: ["--max", "3"] },
    { name: "an option without a value", args: ["--days"] },
    { name: "a have file it cannot read", args: ["--have", "missing.txt"] },
  ])("refuses $name", ({ args }) => {
    const f = fakeIO();
    expect(main(args, f.io)).toBe(2);
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
