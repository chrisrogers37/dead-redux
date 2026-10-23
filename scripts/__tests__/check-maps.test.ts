import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_MAP_BYTES } from "../../public/world/maps.js";
import { checkMaps, main } from "../check-maps.mjs";

// A valid map of 1986-07-04, as the analysis writes one: the fixture of the map schema's tests.
const fixtureText = readFileSync(new URL("../../src/lib/__tests__/fixtures/map-tiny.json", import.meta.url), "utf8");
const fixture = JSON.parse(fixtureText);

describe("checkMaps", () => {
  let root: string;
  let src: string;
  let dest: string;
  let logged: string[];
  let errors: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "check-maps-"));
    src = join(root, "incoming");
    dest = join(root, "public", "maps");
    mkdirSync(src);
    logged = [];
    errors = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const put = (name: string, text: string) => writeFileSync(join(src, name), text);
  const check = () =>
    checkMaps(
      src,
      dest,
      (line: string) => {
        logged.push(line);
      },
      (line: string) => {
        errors.push(line);
      }
    );

  it("writes a valid map to the destination byte for byte, and says it passed", async () => {
    put("1986-07-04.json", fixtureText);
    expect(await check()).toBe(0);
    expect(readFileSync(join(dest, "1986-07-04.json")).equals(readFileSync(join(src, "1986-07-04.json")))).toBe(true);
    expect(logged).toEqual([`1986-07-04.json: schema valid, ${Buffer.byteLength(fixtureText)} bytes (limit 40960)`]);
    expect(errors).toEqual([]);
  });

  it("writes every map when all pass, and keeps what the destination already holds", async () => {
    put("1986-07-04.json", fixtureText);
    put("1987-03-27.json", JSON.stringify({ ...fixture, show: "1987-03-27" }));
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "1977-05-08.json"), "an earlier map");
    expect(await check()).toBe(0);
    expect(readdirSync(dest)).toEqual(["1977-05-08.json", "1986-07-04.json", "1987-03-27.json"]);
    expect(readFileSync(join(dest, "1977-05-08.json"), "utf8")).toBe("an earlier map");
    expect(logged).toHaveLength(2);
  });

  it("refuses a file not named for a show date", async () => {
    put("x.json", fixtureText);
    expect(await check()).toBe(1);
    expect(errors).toEqual(["x.json: not named <show date>.json"]);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a map that names another show than its file does", async () => {
    put("1990-01-01.json", fixtureText);
    expect(await check()).toBe(1);
    expect(errors).toEqual(["1990-01-01.json: names the show 1986-07-04, not 1990-01-01"]);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a file over the size limit, however valid its map", async () => {
    put("1986-07-04.json", fixtureText + " ".repeat(MAX_MAP_BYTES));
    expect(await check()).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^1986-07-04\.json: \d+ bytes, over the limit of 40960$/);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a file that is not JSON", async () => {
    put("1986-07-04.json", "{ not json");
    expect(await check()).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^1986-07-04\.json: not JSON: /);
  });

  it("refuses a map that fails its schema, naming the problem", async () => {
    put("1986-07-04.json", JSON.stringify({ ...fixture, v: 2 }));
    expect(await check()).toBe(1);
    expect(errors).toEqual(["1986-07-04.json: v is 2, not 1"]);
    expect(existsSync(dest)).toBe(false);
  });

  it("reports the first five problems of a map and how many it leaves out", async () => {
    put("1986-07-04.json", JSON.stringify({ ...fixture, v: 2, step: 3, show: "1986-7-4", a: 1, b: 2, c: 3 }));
    expect(await check()).toBe(1);
    expect(errors).toHaveLength(6);
    expect(errors[5]).toBe("1986-07-04.json: and 1 more");
  });

  it("finds nothing to publish in an empty directory", async () => {
    expect(await check()).toBe(1);
    expect(errors).toEqual(["No maps to publish"]);
    expect(existsSync(dest)).toBe(false);
  });

  it("writes nothing when one map of two fails", async () => {
    put("1986-07-04.json", fixtureText);
    put("1987-03-27.json", fixtureText);
    expect(await check()).toBe(1);
    expect(errors).toEqual(["1987-03-27.json: names the show 1986-07-04, not 1987-03-27"]);
    // The good one is checked and reported, but not written.
    expect(logged).toHaveLength(1);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a symbolic link, though it leads to a valid map", async () => {
    writeFileSync(join(root, "elsewhere.json"), fixtureText);
    symlinkSync(join(root, "elsewhere.json"), join(src, "1986-07-04.json"));
    expect(await check()).toBe(1);
    expect(errors).toEqual(["1986-07-04.json: not a regular file"]);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a directory named like a map", async () => {
    mkdirSync(join(src, "1986-07-04.json"));
    expect(await check()).toBe(1);
    expect(errors).toEqual(["1986-07-04.json: not a regular file"]);
  });
});

describe("main", () => {
  let root: string;
  const realLog = console.log;
  const realError = console.error;
  let lines: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "check-maps-main-"));
    lines = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
    console.error = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.log = realLog;
    console.error = realError;
    rmSync(root, { recursive: true, force: true });
  });

  it("wants exactly a source and a destination", async () => {
    expect(await main([])).toBe(2);
    expect(await main([root])).toBe(2);
    expect(await main([root, join(root, "dest"), "more"])).toBe(2);
    expect(lines).toEqual(Array.from({ length: 3 }, () => "Usage: node scripts/check-maps.mjs SRC DEST"));
  });

  it("checks the maps in the source and writes them to the destination", async () => {
    mkdirSync(join(root, "incoming"));
    writeFileSync(join(root, "incoming", "1986-07-04.json"), fixtureText);
    expect(await main([join(root, "incoming"), join(root, "public", "maps")])).toBe(0);
    expect(readFileSync(join(root, "public", "maps", "1986-07-04.json"), "utf8")).toBe(fixtureText);
    expect(lines).toHaveLength(1);
  });

  it("starts on plain Node with no hook, as the publish job runs it", () => {
    const cwd = fileURLToPath(new URL("../..", import.meta.url));
    const run = spawnSync(process.execPath, ["scripts/check-maps.mjs"], { cwd, encoding: "utf8" });
    // Node may add its own warnings to stderr; the usage line shows the schema loaded.
    expect(run.stderr).toContain("Usage: node scripts/check-maps.mjs SRC DEST\n");
    expect(run.status).toBe(2);
  });
});
