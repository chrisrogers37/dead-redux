import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHELVES, SHELVES_COOKIE as PAGE_COOKIE, SHELVES_STORAGE as PAGE_STORAGE } from "../../src/components/world/shelves";
import {
  installPlates, jobUrl, launch, mainSha, matrixJobs, openPage, parseJobs, readConfig, repoRoot, runFolder, SHELVES_AWAY, SHELVES_COOKIE, SHELVES_STORAGE, STEPPER, tagOf,
  windowsFor, worldError, worldFrom, worldHash,
} from "../flash/lib.mjs";
import { tables } from "../flash/table.mjs";
import windows from "../flash/windows.json";
import schedule from "../../data/pick-schedule.json";
import { showDateFor } from "../../src/lib/pick-schedule";

// The flash counter's jobs, settings, page and table (scripts/flash). Importing lib.mjs here is itself a check: it runs no git, reads no
// environment and loads no browser until one of its functions is called, so it imports where there is none of them.

const DAY = "2026-10-20";
const WINDOWS = windows[DAY].windows;
const WORLD = join(repoRoot(), "public", "world");
type Job = ReturnType<typeof parseJobs>[number];
const job = (line: string): Job => {
  const jobs = parseJobs(line, WINDOWS);
  expect(jobs).toHaveLength(1);
  return jobs[0];
};

describe("parseJobs", () => {
  it("takes a variant and a window, and gives the rest its defaults: behind the crowd, 800 by 500 at 1, the whole frame, rung 0, all four grids", () => {
    expect(job("branch Q")).toEqual({
      variant: "branch", window: "Q", pose: "crowd", view: { width: 800, height: 500 }, dpr: 1, tier: "", still: false, rung: 0, grids: [[0, 0], [1, 1], [1, 0], [0, 1]],
    });
  });

  it("takes every key, and a pose that is a name or four numbers, whose limits are the world's to keep", () => {
    expect(job("main S pose=12.5,-30,1.2,-0.1 view=390x844 dpr=2 tier=phone still=1 rung=99 grids=1,0+0,1")).toEqual({
      variant: "main", window: "S", pose: "12.5,-30,1.2,-0.1", view: { width: 390, height: 844 }, dpr: 2, tier: "phone", still: true, rung: 99, grids: [[1, 0], [0, 1]],
    });
    // A pitch past what the world's look allows is the world's to refuse (main.js), and a job that asks it stops when the page loads.
    for (const pose of ["home", "stage", "near-3", "1,2,3,0.9"]) expect(job(`branch A pose=${pose} tier=tv dpr=1.5`)).toMatchObject({ pose, tier: "tv", dpr: 1.5 });
  });

  it("reads one job a line, and nothing from a blank line or after a #", () => {
    const jobs = parseJobs("# the seeks\nmain S dpr=1.5   # on main\n\n  branch S dpr=1.5\n", WINDOWS);
    expect(jobs.map((j) => [j.variant, j.window, j.dpr])).toEqual([["main", "S", 1.5], ["branch", "S", 1.5]]);
  });

  it.each([
    ["an unknown variant", "preview Q", 'the variant is branch or main, not "preview"'],
    ["an unknown window", "main Z", 'no window "Z"'],
    ["no window", "main", 'no window ""'],
    ["an unknown key", "main Q camera=crowd", '"camera=crowd" is none of'],
    ["a word that is no key=value", "main Q still", '"still" is none of'],
    ["a key twice", "main Q still=1 still=0", "still= is there twice"],
    ["a rung that is no whole number", "main Q rung=1.5", "rung=1.5: a whole number from 0 to 99"],
    ["a rung of 100, past the 99 the world's own hook takes", "main Q rung=100", "rung=100: a whole number from 0 to 99"],
    ["a frame of an odd width", "main Q view=801x500", "the frame 801x500 (the view times dpr) is not whole 2x2 blocks"],
    ["a frame that a pixel ratio leaves between pixels", "main Q view=801x500 dpr=1.5", "is not whole 2x2 blocks"],
    ["a view that is no size", "main Q view=800", "view=800 is no viewport"],
    ["a pixel ratio of 0", "main Q dpr=0", "dpr=0 is no pixel ratio"],
    ["a tier the world does not have", "main Q tier=watch", "tier=watch"],
    ["a still that is neither 0 nor 1", "main Q still=yes", "still=yes"],
    ["a grid moved by 2", "main Q grids=0,0+2,0", "grids=0,0+2,0"],
    ["a grid twice", "main Q grids=1,1+1,1", "grids=1,1+1,1"],
    ["a pose of three numbers", "main Q pose=1,2,3", "pose=1,2,3 is no pose"],
    ["a pose with a word among its numbers", "main Q pose=1,2,x,0", "pose=1,2,x,0 is no pose"],
    ["a pose that is no name", "main Q pose=Crowd!", "pose=Crowd! is no pose"],
  ])("refuses %s, and says which line", (_what, line, message) => {
    expect(() => parseJobs(`branch Q\n${line}`, WINDOWS)).toThrow(`job line 2 ("${line}"): `);
    expect(() => parseJobs(line, WINDOWS)).toThrow(message);
  });
});

describe("jobUrl", () => {
  it("opens the day driven by its map, with the job's hooks and no others", () => {
    expect(jobUrl("http://127.0.0.1:3000", DAY, job("branch Q"))).toBe("http://127.0.0.1:3000/2026-10-20?drive=map&pose=crowd");
    expect(jobUrl("https://preview.test", DAY, job("main S pose=12.5,-30,1.2,0.1 view=390x844 dpr=2 tier=phone still=1 rung=2")))
      .toBe("https://preview.test/2026-10-20?drive=map&pose=12.5,-30,1.2,0.1&tier=phone&still=1&rung=2");
    // The page's own opening is no pose.
    expect(jobUrl("http://127.0.0.1:3000", DAY, job("branch Q pose=home"))).toBe("http://127.0.0.1:3000/2026-10-20?drive=map");
  });
});

describe("tagOf", () => {
  it("names a job's file by every field that tells it from another, in letters, figures and . _ + - ~ only", () => {
    const others = ["branch Q", "main S", "main Q pose=stage", "main Q pose=1,2,3,0.1", "main Q pose=1,2,3,-0.1", "main Q view=800x600", "main Q view=600x500", "main Q dpr=2", "main Q tier=phone", "main Q tier=tv",
      "main Q still=1", "main Q rung=1", "main Q rung=11", "main Q grids=0,0", "main Q grids=1,1", "main Q grids=0,0+1,1", "main Q grids=1,0+0,1"];
    const tags = ["main Q", ...others].map((line) => tagOf(job(line)));
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags[0]).toBe("main_Q_crowd_800x500_x1_auto_whole_rung0_g00+11+10+01");
    // The defaults spelled out are the same job, and so the same file.
    expect(tagOf(job("main Q pose=crowd view=800x500 dpr=1 tier= still=0 rung=0 grids=0,0+1,1+1,0+0,1"))).toBe(tags[0]);
    expect(tagOf(job("branch S pose=12.5,-30,1.2,0.1 view=400x800 dpr=1.5 tier=phone still=1 rung=1"))).toBe("branch_S_12.5~-30~1.2~0.1_400x800_x1.5_phone_still_rung1_g00+11+10+01");
  });
});

describe("matrixJobs", () => {
  const parsed = (name: string) => parseJobs(matrixJobs(name).join("\n"), WINDOWS);
  const tags = (lines: string[]) => lines.map((line) => tagOf(job(line))).sort();

  it("has a quick set of 4: Space and the seeks from behind the crowd on a desktop at 1.5, the whole frame, on main and the branch", () => {
    expect(parsed("quick").map(tagOf).sort()).toEqual(tags(["main Q dpr=1.5", "branch Q dpr=1.5", "main S dpr=1.5", "branch S dpr=1.5"]));
  });

  it("has a standard set of 84: 80 at rung 0, and the seeks' light alone a rung down on both devices and both variants", () => {
    const jobs = parsed("standard"), level = jobs.filter((j) => j.rung === 0);
    expect(jobs).toHaveLength(84);
    expect(level).toHaveLength(80);
    // Half of the 80 on each side of every choice: the variant, the pose, the device and the pass; and a fifth in each window.
    for (const half of [(j: Job) => j.variant === "main", (j: Job) => j.pose === "stage", (j: Job) => j.tier === "phone", (j: Job) => j.still]) expect(level.filter(half)).toHaveLength(40);
    for (const window of ["A", "B", "Q", "D", "S"]) expect(level.filter((j) => j.window === window)).toHaveLength(16);
    expect(level.map(tagOf)).toContain(tagOf(job("main A pose=stage tier=phone view=390x844 dpr=2 still=1")));
    expect(level.map(tagOf)).toContain(tagOf(job("branch D dpr=1.5")));
    expect(jobs.filter((j) => j.rung !== 0).map(tagOf).sort()).toEqual(tags(["main", "branch"].flatMap((variant) =>
      [`${variant} S dpr=1.5 still=1 rung=1`, `${variant} S tier=phone view=390x844 dpr=2 still=1 rung=1`])));
  });

  it.each(["quick", "standard"])("gives each job of the %s set its own file and counts all four grids in each", (name) => {
    const jobs = parsed(name);
    expect(new Set(jobs.map(tagOf)).size).toBe(jobs.length);
    for (const j of jobs) expect(j.grids).toEqual([[0, 0], [1, 1], [1, 0], [0, 1]]);
  });

  it("has no other set", () => {
    expect(() => matrixJobs("full")).toThrow('no matrix "full"');
  });
});

describe("windows.json", () => {
  it("says whose show each day's windows are, and gives each window a track and a stretch of it that ends after it starts", () => {
    expect(Object.keys(windows)).toContain(DAY);
    for (const [day, { show, windows: all }] of Object.entries(windows)) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(show).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(all).length).toBeGreaterThan(0);
      for (const [key, w] of Object.entries(all) as [string, { name: string; track: number; from: number; to: number; cues?: number[][] }][]) {
        expect(w.name.length, key).toBeGreaterThan(0);
        expect(Number.isInteger(w.track) && w.track >= 0, key).toBe(true);
        // The count cues the show 12 s before a window, to let the world settle.
        expect(w.from, key).toBeGreaterThanOrEqual(12);
        expect(w.to, key).toBeGreaterThan(w.from);
        // A cue is [seconds into the window, track, position], inside the window and in order.
        const at = (w.cues ?? []).map(([s]) => s);
        expect([...at].sort((a, b) => a - b), key).toEqual(at);
        for (const s of at) expect(s > 0 && s < w.to - w.from, key).toBe(true);
      }
    }
  });

  it("names each day's own show, and in each window tracks of that show's map, each played inside its own length; and the three windows beside a landmark's light are of that landmark's song", () => {
    // A window is counted on its day's page, which plays the show the schedule gives that day, and the count stops where the
    // page plays another. A window whose track the show lacks, or that asks for a stretch past the track's end, would count
    // some other song or the gap after one.
    type Window = { track: number; from: number; to: number; cues?: number[][] };
    const titles: Record<string, string> = {};
    for (const [day, { show, windows: all }] of Object.entries(windows)) {
      expect(showDateFor(schedule, day), day).toBe(show);
      const { tracks } = JSON.parse(readFileSync(join(repoRoot(), "public", "maps", `${show}.json`), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
      for (const [key, w] of Object.entries(all) as [string, Window][]) {
        // The window's own track, up to its end or its first cue, and then each cue's track from its place to the next cue.
        const ends = [...(w.cues ?? []).map(([s]) => s), w.to - w.from], played: [number, number][] = [[w.track, w.from + ends[0]]];
        (w.cues ?? []).forEach(([s, track, position], k) => played.push([track, position + ends[k + 1] - s]));
        for (const [track, until] of played) {
          expect(Number.isInteger(track) && track >= 0 && track < tracks.length, `${day} ${key}`).toBe(true);
          expect(until, `${day} ${key}, track ${track}`).toBeLessThanOrEqual(tracks[track].playingDuration);
        }
        titles[`${day} ${key}`] = tracks[w.track].title;
      }
    }
    // The jobs that count beside a landmark stand the visitor by the song's own landmark (pose=near-K), so K is the window's
    // track: Lovelight's lighthouse, the miracle's light, the two eyes, the wheel, the fingerpost's lantern and the dew's drop.
    expect([titles["2026-10-20 L"], titles["2026-10-20 M"], titles["2026-11-25 E"]]).toEqual(["Turn On Your Lovelight", "I Need A Miracle ->", "Eyes Of The World ->"]);
    expect([titles["2026-10-20 W"], titles["2026-11-27 N"], titles["2026-11-24 P"]]).toEqual(["The Wheel ->", "One More Saturday Night", "Morning Dew"]);
    const [beside] = parseJobs("branch L pose=near-17 still=1", WINDOWS);
    expect([beside.pose, WINDOWS.L.track, jobUrl("http://127.0.0.1:3000", DAY, beside)]).toEqual(["near-17", 17, "http://127.0.0.1:3000/2026-10-20?drive=map&pose=near-17&still=1"]);
  });

  it("is what windowsFor reads, which refuses a day with no windows", () => {
    expect(windowsFor(DAY)).toEqual(windows[DAY]);
    expect(() => windowsFor("2026-10-21")).toThrow("windows.json has no windows for 2026-10-21");
  });
});

describe("readConfig", () => {
  it("counts the fixed day at a local server, on the browser's own renderer, against origin/main, two jobs at a time, and keeps a job's result alone", () => {
    expect(readConfig({})).toEqual({
      siteUrl: "http://127.0.0.1:3000", day: DAY, outDir: join(tmpdir(), "dead-redux-flash"), gpu: "", worldDir: null, mainRef: "origin/main", parallel: 2, heat: false, stills: false,
    });
  });

  it("takes each setting from the environment", () => {
    const out = join(tmpdir(), "elsewhere");
    expect(readConfig({ SITE_URL: "https://preview.test/", DAY: "2026-11-01", OUT_DIR: out, GPU: "metal", WORLD_DIR: WORLD, MAIN_REF: "abc1234", PARALLEL: "1", HEAT: "1", STILLS: "1" })).toEqual({
      siteUrl: "https://preview.test", day: "2026-11-01", outDir: out, gpu: "metal", worldDir: WORLD, mainRef: "abc1234", parallel: 1, heat: true, stills: true,
    });
  });

  it("keeps the heat maps and the stills, which are megabytes, only when HEAT and STILLS are 1", () => {
    for (const value of ["", "0", "true", "yes"]) expect(readConfig({ HEAT: value, STILLS: value })).toMatchObject({ heat: false, stills: false });
    expect(readConfig({ HEAT: "1" })).toMatchObject({ heat: true, stills: false });
    expect(readConfig({ STILLS: "1" })).toMatchObject({ heat: false, stills: true });
  });

  describe("keeps a count's files out of the repo", () => {
    const made: string[] = [];
    afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

    it("refuses an OUT_DIR in the repo, and the repo itself", () => {
      expect(() => readConfig({ OUT_DIR: join(repoRoot(), "scripts", "flash", "out") })).toThrow("is inside the repo");
      expect(() => readConfig({ OUT_DIR: repoRoot() })).toThrow("is inside the repo");
      // A folder beside the repo is outside it, though its path starts with the repo's.
      expect(readConfig({ OUT_DIR: `${repoRoot()}-flash` }).outDir).toBe(`${repoRoot()}-flash`);
    });

    it("refuses one that reaches the repo through a link, as a path through a Mac's /tmp does", () => {
      const dir = mkdtempSync(join(tmpdir(), "flash-link-"));
      made.push(dir);
      symlinkSync(repoRoot(), join(dir, "repo"));
      expect(() => readConfig({ OUT_DIR: join(dir, "repo", "out") })).toThrow("is inside the repo");
      expect(() => readConfig({ OUT_DIR: join(dir, "repo", "not", "made", "yet") })).toThrow("is inside the repo");
      expect(readConfig({ OUT_DIR: join(dir, "out", "not", "made", "yet") }).outDir).toBe(join(dir, "out", "not", "made", "yet"));
    });
  });

  it("refuses, before any browser starts, a setting that would fail every job late or count what was not meant", () => {
    // A renderer it has no flags for would count on the software renderer under another's name.
    for (const gpu of ["Metal", "METAL", "1", "vulkan"]) expect(() => readConfig({ GPU: gpu })).toThrow(`GPU=${gpu}: metal, or unset`);
    // An address without a scheme is no address the browser can open.
    for (const url of ["localhost:3000", "preview.test", "ftp://preview.test", "//preview.test"]) expect(() => readConfig({ SITE_URL: url })).toThrow(`SITE_URL=${url} is no address`);
    expect(readConfig({ SITE_URL: "http://localhost:3000" }).siteUrl).toBe("http://localhost:3000");
    expect(() => readConfig({ DAY: "today" })).toThrow("DAY=today");
    expect(() => readConfig({ PARALLEL: "0" })).toThrow("PARALLEL=0");
    expect(() => readConfig({ PARALLEL: "two" })).toThrow("PARALLEL=two");
  });

  it("refuses a WORLD_DIR that holds no main.js, and says where the world is when it is given a checkout's root", () => {
    expect(() => readConfig({ WORLD_DIR: join(tmpdir(), "no-such-checkout") })).toThrow("holds no main.js: it is a checkout's public/world");
    expect(() => readConfig({ WORLD_DIR: join(tmpdir(), "no-such-checkout") })).not.toThrow("did you mean");
    expect(() => readConfig({ WORLD_DIR: repoRoot() })).toThrow(`holds no main.js: it is a checkout's public/world; did you mean ${WORLD}`);
    expect(readConfig({ WORLD_DIR: WORLD }).worldDir).toBe(WORLD);
  });
});

describe("runFolder", () => {
  it("names a run's own folder by when it started and what it ran, so no run writes into another's", () => {
    const at = new Date("2026-11-22T16:45:10.250Z");
    expect(runFolder(at, "matrix", "quick")).toBe("20261122-164510-quick");
    expect(runFolder(at, "matrix", "standard")).toBe("20261122-164510-standard");
    expect(runFolder(at, "jobs", "/some/where/jobs.txt")).toBe("20261122-164510-jobs");
    expect(runFolder(at, "one", "main Q")).toBe("20261122-164510-one");
    expect(runFolder(new Date("2026-11-22T16:45:11Z"), "one", "main Q")).not.toBe(runFolder(at, "one", "main Q"));
  });
});

describe("launch", () => {
  // A browser that launches nothing and hands back what it was asked for.
  const chromium = { launch: (options: { args: string[] }) => options };

  it("asks for the Mac's GPU under GPU=metal, and otherwise for nothing, with a warning that the renderer is the browser's choice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(launch(chromium, "metal")).toEqual({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
    expect(warn).not.toHaveBeenCalled();
    expect(launch(chromium, "")).toEqual({ args: [] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("counts from different renderers are not comparable"));
    warn.mockRestore();
  });
});

describe("the world a job counts", () => {
  it("has a hash of its modules as served, whatever order they came in", () => {
    const hash = worldHash([["main.js", "a"], ["rig.js", "b"]]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(worldHash([["rig.js", "b"], ["main.js", "a"]])).toBe(hash);
  });

  it("has another hash for a module changed by a byte, renamed, added, or with its text moved into the next", () => {
    const hash = worldHash([["main.js", "ab"], ["rig.js", "c"]]);
    for (const other of [
      [["main.js", "aB"], ["rig.js", "c"]],
      [["main.js", "ab"], ["rigs.js", "c"]],
      [["main.js", "ab"], ["rig.js", "c"], ["sky.js", ""]],
      [["main.js", "a"], ["rig.js", "bc"]],
      [["main.js", "ab"]],
    ]) expect(worldHash(other)).not.toBe(hash);
    // One module whose text spells out another's name and text is not the two modules.
    expect(worldHash([["main.js", "rig.jsc"]])).not.toBe(worldHash([["main.js", ""], ["rig.js", "c"]]));
    // Nor is it where the text holds the very byte that parts a name from its text, and so spells out the next module whole: each
    // text is taken by its length.
    expect(worldHash([["main.js", "a" + "rig.js\0" + "c"]])).not.toBe(worldHash([["main.js", "a"], ["rig.js", "c"]]));
  });

  describe("in a checkout", () => {
    const made: string[] = [];
    afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });
    // A checkout with one commit: a world of one module, and a page beside it.
    const checkout = () => {
      const dir = mkdtempSync(join(tmpdir(), "flash-checkout-"));
      made.push(dir);
      const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=flash", "-c", "user.email=flash@example.test", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      mkdirSync(join(dir, "public", "world"), { recursive: true });
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "public", "world", "main.js"), "export const world = 1;\n");
      writeFileSync(join(dir, "src", "page.tsx"), "export const page = 1;\n");
      git("init", "-q");
      git("add", ".");
      git("commit", "-q", "-m", "a world");
      return { dir, world: join(dir, "public", "world"), commit: git("rev-parse", "HEAD").trim() };
    };
    const from = (world: string) => worldFrom("branch", { siteUrl: "https://preview.test", mainRef: "origin/main", mainCommit: "", worldDir: world });

    it("says the world's folder has changed since its commit when a module in it is edited or added, and not when anything else in the checkout is", () => {
      const { dir, world, commit } = checkout();
      expect(from(world)).toEqual({ from: "WORLD_DIR", ref: world, commit, dirty: false });
      // The page round the world is no part of the world a job counts: the tree is dirty, and the world's folder is as committed.
      writeFileSync(join(dir, "src", "page.tsx"), "export const page = 2;\n");
      writeFileSync(join(dir, "notes.txt"), "not tracked\n");
      expect(from(world).dirty).toBe(false);
      writeFileSync(join(world, "rig.js"), "export const rig = 1;\n");
      expect(from(world).dirty).toBe(true);
      rmSync(join(world, "rig.js"));
      expect(from(world).dirty).toBe(false);
      writeFileSync(join(world, "main.js"), "export const world = 2;\n");
      expect(from(world).dirty).toBe(true);
    });
  });

  it("says where it came from: main's commit, a checkout's world with its commit and whether the folder has changed since, or the server", () => {
    const config = { siteUrl: "https://preview.test", mainRef: "origin/main", mainCommit: "c27c328c6edad881146e743042bdbc6409f86fac", worldDir: null as string | null };
    expect(worldFrom("main", { ...config, worldDir: WORLD })).toEqual({ from: "main", ref: "origin/main", commit: config.mainCommit, dirty: false });
    expect(worldFrom("branch", config)).toEqual({ from: "server", ref: "https://preview.test", commit: null, dirty: null });
    const checkout = worldFrom("branch", { ...config, worldDir: WORLD });
    expect(checkout).toMatchObject({ from: "WORLD_DIR", ref: WORLD });
    expect(checkout.commit).toBe(mainSha("HEAD"));
    expect(typeof checkout.dirty).toBe("boolean");
    // A folder in no checkout has a hash and no commit.
    expect(worldFrom("branch", { ...config, worldDir: tmpdir() })).toEqual({ from: "WORLD_DIR", ref: tmpdir(), commit: null, dirty: null });
  });

  it("resolves MAIN_REF to a commit, and says how to fetch one that names none", () => {
    expect(mainSha("HEAD")).toMatch(/^[0-9a-f]{40}$/);
    expect(() => mainSha("no-such-ref")).toThrow("MAIN_REF=no-such-ref names no commit in this repo");
    // A tree or a file is no commit.
    expect(() => mainSha("HEAD:public")).toThrow("names no commit");
  });
});

describe("the virtual clock (STEPPER)", () => {
  // A page as the stepper finds it: a clock that runs on whenever it is read, and animation frames the browser calls when it likes.
  const page = () => {
    let real = 5000.25, wall = 1_795_000_000_123;
    const browserFrames: (() => void)[] = [], errors: string[] = [];
    const performance = { now: () => (real += 7.3) };
    // The page's Date, of which the stepper takes over `now`: the wall's clock, which runs on too.
    const date = { now: () => (wall += 11) };
    const window = {
      requestAnimationFrame: (callback: () => void) => browserFrames.push(callback),
      cancelAnimationFrame: () => {},
    } as unknown as {
      requestAnimationFrame: (callback: (time: number) => void) => number;
      cancelAnimationFrame: (id: number) => void;
      __stepper: { step(k?: number): number; pump(): number; present<T>(after?: () => T): Promise<T | null>; queued(): number; steps(): number; now(): number };
    };
    new Function("window", "performance", "console", "Date", STEPPER)(window, performance, { error: (message: string) => errors.push(message) }, date);
    // The browser draws a frame: every real animation frame asked for so far is called.
    const draw = () => browserFrames.splice(0).map((callback) => callback()).length;
    return { window, performance, date, stepper: window.__stepper, browserFrames, errors, draw };
  };
  const FRAME = 1000 / 60;

  it("stands still until a step, and moves a sixtieth of a second a step: 60 steps are one second", () => {
    const { performance, stepper } = page();
    const start = performance.now();
    expect(performance.now()).toBe(start);
    expect(stepper.now()).toBe(start);
    expect(stepper.steps()).toBe(0);
    stepper.step();
    expect(performance.now() - start).toBeCloseTo(FRAME, 9);
    stepper.step(59);
    expect(stepper.steps()).toBe(60);
    // A clock at 30 frames a second, or at the browser's own pace, would stand elsewhere.
    expect(performance.now() - start).toBeCloseTo(1000, 9);
    expect(stepper.now()).toBe(performance.now());
  });

  it("moves Date.now with it, in whole milliseconds from the moment the page opened: a world that kept time by it would keep the same time", () => {
    const { date, stepper } = page();
    const opened = date.now();
    // The wall's clock ran on 11 ms at each reading, and the stepper read it once as the page opened: the day and the hour are the
    // real ones. Now it stands until a step.
    expect(opened).toBe(1_795_000_000_123 + 11);
    expect(date.now()).toBe(opened);
    stepper.step();
    expect(date.now()).toBe(opened + 16);
    stepper.step(2);
    expect(date.now()).toBe(opened + 50);
    stepper.step(57);
    expect(date.now()).toBe(opened + 1000);
    // A pump runs the frames waiting and moves neither clock.
    stepper.pump();
    expect(date.now()).toBe(opened + 1000);
  });

  it("runs a frame the page asked for at the next step and no sooner, once, with the clock's time, and never hands it to the browser", () => {
    const { window, performance, stepper, browserFrames } = page();
    const times: number[] = [];
    window.requestAnimationFrame((time) => times.push(time));
    expect(stepper.queued()).toBe(1);
    expect(browserFrames).toHaveLength(0);
    expect(times).toEqual([]);
    expect(stepper.step()).toBe(1);
    expect(times).toEqual([performance.now()]);
    expect(stepper.step()).toBe(0);
    expect(times).toHaveLength(1);
  });

  it("runs a loop that asks for its next frame once a step: a frame asked for within a frame waits for the next", () => {
    const { window, stepper } = page();
    const times: number[] = [];
    const loop = (time: number) => { times.push(time); window.requestAnimationFrame(loop); };
    window.requestAnimationFrame(loop);
    expect(stepper.step(5)).toBe(5);
    expect(times).toHaveLength(5);
    times.slice(1).forEach((time, k) => expect(time - times[k]).toBeCloseTo(FRAME, 9));
  });

  it("drops a frame that is cancelled, and runs the others", () => {
    const { window, stepper } = page();
    const ran: string[] = [];
    window.requestAnimationFrame(() => ran.push("first"));
    const second = window.requestAnimationFrame(() => ran.push("second"));
    window.requestAnimationFrame(() => ran.push("third"));
    window.cancelAnimationFrame(second);
    expect(stepper.step()).toBe(2);
    expect(ran).toEqual(["first", "third"]);
  });

  it("runs the frames waiting without moving the clock on a pump", () => {
    const { window, performance, stepper } = page();
    const start = performance.now();
    let ran = 0;
    window.requestAnimationFrame(() => { ran += 1; });
    expect(stepper.pump()).toBe(1);
    expect(ran).toBe(1);
    expect(performance.now()).toBe(start);
    expect(stepper.steps()).toBe(0);
  });

  it("presents one frame inside a frame of the browser's: the clock moves a sixtieth, the page's frame runs, then what was asked is read, and it answers two browser frames later", async () => {
    const { window, performance, stepper, draw } = page();
    const start = performance.now();
    const order: string[] = [];
    window.requestAnimationFrame((time) => order.push(`frame at ${(time - start).toFixed(3)}`));
    let answered: string | null = null;
    const presented = stepper.present(() => { order.push("read"); return "what was read"; }).then((value) => { answered = value; });
    // Nothing runs until the browser draws.
    expect(order).toEqual([]);
    expect(stepper.steps()).toBe(0);
    expect(draw()).toBe(1);
    // A present that ran the page's frame without moving the clock would leave the world where it was: nothing would swing.
    expect(stepper.steps()).toBe(1);
    expect(performance.now() - start).toBeCloseTo(FRAME, 9);
    expect(order).toEqual([`frame at ${FRAME.toFixed(3)}`, "read"]);
    await Promise.resolve();
    expect(answered).toBeNull();
    expect(draw()).toBe(1);
    await Promise.resolve();
    expect(answered).toBeNull();
    expect(draw()).toBe(1);
    await presented;
    expect(answered).toBe("what was read");
    // One frame, and no more, however many of the browser's it took.
    expect(stepper.steps()).toBe(1);
  });

  it("runs the rest of a frame's callbacks when one throws, and says so", () => {
    const { window, stepper, errors } = page();
    let ran = 0;
    window.requestAnimationFrame(() => { throw new Error("a frame fell over"); });
    window.requestAnimationFrame(() => { ran += 1; });
    expect(stepper.step()).toBe(2);
    expect(ran).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("stepper: Error: a frame fell over");
  });
});

describe("the world's clock", () => {
  // Where a module's text reads the machine's clock or sets a timer, as [line, what]. `new Date(value)` reads none: it makes a date of
  // the value it is given.
  const CLOCKS: [RegExp, string][] = [
    [/\bDate\s*\.\s*now\b/, "Date.now"],
    [/\bnew\s+Date\b(?!\s*\(\s*[^\s)])/, "new Date()"],
    [/\bsetTimeout\b/, "setTimeout"],
    [/\bsetInterval\b/, "setInterval"],
    [/\bperformance\s*\.\s*timeOrigin\b/, "performance.timeOrigin"],
    // The sound's own clock (an AudioContext's, a media element's) and work the browser fits in when it is idle.
    [/\bcurrentTime\b/, "currentTime"],
    [/\brequestIdleCallback\b/, "requestIdleCallback"],
  ];
  const wallClocks = (text: string) => text.split("\n").flatMap((line, k) => CLOCKS.filter(([pattern]) => pattern.test(line)).map(([, what]) => `line ${k + 1}: ${what}`));

  it("is the one the flash counter drives, in every module of public/world: none reads the wall's clock or sets a timer", () => {
    const found = readdirSync(WORLD).filter((name) => name.endsWith(".js")).flatMap((name) => wallClocks(readFileSync(join(WORLD, name), "utf8")).map((use) => `public/world/${name}, ${use}`));
    expect(found, "The flash counter's virtual clock is the animation clock: performance.now and requestAnimationFrame, with Date.now following it " +
      "under the counter only (on the site Date.now is the wall's clock, so the world keeps off it too). Timers, new Date(), performance.timeOrigin, " +
      "the sound's currentTime and idle callbacks keep the machine's time, so a world that moves by one of them is counted wrongly, and no check " +
      "of the counter's sees it: the review of #173 counted 18 swings where there were 6. Keep the world on performance.now and the frame's own " +
      "time, or extend STEPPER in scripts/flash/lib.mjs first, with a test.").toEqual([]);
  });

  it("is told from a wall clock by this test: each way of reading one is found, and making a date of a value is not", () => {
    expect(wallClocks("const t = Date.now();\nconst d = new Date();\nsetTimeout(tick, 16);\nconst id = window.setInterval(tick, 16);\nconst t0 = performance.timeOrigin;"))
      .toEqual(["line 1: Date.now", "line 2: new Date()", "line 3: setTimeout", "line 4: setInterval", "line 5: performance.timeOrigin"]);
    expect(wallClocks("const beat = context.currentTime * bpm;\nrequestIdleCallback(build);")).toEqual(["line 1: currentTime", "line 2: requestIdleCallback"]);
    expect(wallClocks("const now = Date . now ( );\nconst d = new Date;\nconst e = new Date( );\nconst f = new  Date().getTime();")).toEqual(["line 1: Date.now", "line 2: new Date()", "line 3: new Date()", "line 4: new Date()"]);
    // What the world may do: read the animation clock, and make a date of a value (maps.js checks a map's date so).
    expect(wallClocks("const t = performance.now();\nreturn !isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;\nconst d = new Date( 2026, 10, 22 );\nconst updated = map.date;")).toEqual([]);
  });
});

describe("the plates the page draws (installPlates)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  type Box = { x: number; y: number; width: number; height: number };
  // A plate as the page has it: its box, its text, and whether the browser says it is seen, asked the way the count asks.
  const plate = (box: Box, text: string, seen = true) => ({
    getBoundingClientRect: () => box,
    innerText: text,
    checkVisibility: (how: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => seen && how.checkOpacity === true && how.checkVisibilityCSS === true,
  });
  const read = (plates: ReturnType<typeof plate>[]) => {
    const window = {} as { __plates: () => { x: number; y: number; w: number; h: number; text: string }[] };
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", { querySelectorAll: (selector: string) => (selector === ".plate" ? plates : []) });
    installPlates();
    return window.__plates();
  };

  it("gives each drawn plate's box in CSS px and the start of its text on one line", () => {
    expect(read([plate({ x: 24.5, y: 24, width: 300.25, height: 64 }, "  Dead\n Redux \t 1986-07-04 "), plate({ x: 0, y: 400, width: 800, height: 100 }, "x".repeat(80))])).toEqual([
      { x: 24.5, y: 24, w: 300.25, h: 64, text: "Dead Redux 1986-07-04" },
      { x: 0, y: 400, w: 800, h: 100, text: "x".repeat(50) },
    ]);
  });

  it("leaves out a plate the page does not draw: one hidden or faded out, and one with no width or no height", () => {
    // A plate that is on the page and not seen covers nothing, and masking it would leave part of the world uncounted; one that is
    // seen and taken for hidden would be counted as the world.
    const box = { x: 10, y: 10, width: 100, height: 40 };
    expect(read([plate(box, "hidden", false), plate({ ...box, width: 0 }, "no width"), plate({ ...box, height: 0 }, "no height"), plate(box, "drawn")]).map((p) => p.text)).toEqual(["drawn"]);
  });
});

describe("openPage", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  // A browser that opens nothing and keeps what it was asked: the context's options, its cookies and init scripts, and what the page
  // listens for and routes.
  type Handler = (event: unknown) => void;
  type Route = { request: () => { url: () => string }; fulfill: (answer: { status: number; body: string }) => { status: number; body: string } };
  const browser = () => {
    const asked = { options: {} as Record<string, unknown>, cookies: [] as Record<string, string>[], scripts: [] as [unknown, unknown][], on: {} as Record<string, Handler>, routes: [] as [(url: URL) => boolean, (route: Route) => unknown][] };
    const page = { on: (event: string, handler: Handler) => { asked.on[event] = handler; }, route: async (matches: (url: URL) => boolean, handler: (route: Route) => unknown) => { asked.routes.push([matches, handler]); } };
    const context = { addCookies: async (cookies: Record<string, string>[]) => { asked.cookies.push(...cookies); }, addInitScript: async (script: unknown, arg?: unknown) => { asked.scripts.push([script, arg]); }, newPage: async () => page };
    return { asked, browser: { newContext: async (options: Record<string, unknown>) => { asked.options = options; return context; } } };
  };
  const SITE = "https://preview.test";
  // A run that counts the server's own world.
  const SERVER = { siteUrl: SITE, mainCommit: null, worldDir: null as string | null };

  it("opens the job's frame: its viewport and pixel ratio, with a phone's touch for the phone's tier only", async () => {
    const desktop = browser(), phone = browser();
    await openPage(desktop.browser, job("branch Q dpr=1.5"), SERVER);
    expect(desktop.asked.options).toEqual({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1.5 });
    await openPage(phone.browser, job("branch Q tier=phone view=390x844 dpr=2"), SERVER);
    expect(phone.asked.options).toEqual({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  });

  it("puts the HUD's three shelves away, by the page's cookie for the server and its storage key for the page's script", async () => {
    // Without them the panels stand in the frame, and a count is of the world less a third of it.
    const { asked, browser: fake } = browser();
    await openPage(fake, job("branch Q"), SERVER);
    expect(asked.cookies).toEqual([{ name: PAGE_COOKIE, value: SHELVES.join(","), url: SITE }]);
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", { setItem: (key: string, value: string) => stored.set(key, value) });
    for (const [script, arg] of asked.scripts) if (typeof script === "function" && arg !== undefined) script(arg);
    expect([...stored]).toEqual([[PAGE_STORAGE, SHELVES.join(",")]]);
  });

  it("installs the virtual clock and the plate reader before the page's own scripts", async () => {
    const { asked, browser: fake } = browser();
    await openPage(fake, job("branch Q"), SERVER);
    expect(asked.scripts.map(([script]) => script)).toContain(STEPPER);
    expect(asked.scripts.map(([script]) => script)).toContain(installPlates);
  });

  it("gathers every world module the page is served, by name, and the page's errors but for the archive's", async () => {
    const { asked, browser: fake } = browser();
    const { modules, errors } = await openPage(fake, job("branch Q"), SERVER);
    const response = (path: string, status: number, text: string) => asked.on.response({ url: () => SITE + path, status: () => status, text: async () => text });
    response("/world/main.js", 200, "main");
    response("/world/rig.js?v=2", 200, "rig");
    response("/world/gone.js", 404, "not found");
    response("/world/deep/x.js", 200, "elsewhere");
    response("/maps/1986-07-04.json", 200, "{}");
    response("/_next/static/world/main.js", 200, "the page's own");
    expect(await Promise.all(modules.values())).toEqual([["main.js", "main"], ["rig.js", "rig"]]);
    asked.on.pageerror({ message: "boom" });
    asked.on.console({ type: () => "error", text: () => "Failed to load resource: https://archive.org/x.mp3" });
    asked.on.console({ type: () => "error", text: () => "the world fell over" });
    asked.on.console({ type: () => "log", text: () => "a note" });
    expect(errors).toEqual(["pageerror: boom", "console.error: the world fell over"]);
  });

  it("runs on a Vercel preview: the policy's refusal of Vercel's toolbar does not stop a count, and a refusal of anything else does", async () => {
    // A preview's build loads the toolbar on every page and the policy refuses it, so a count that stopped on it could not run on a
    // preview at all. The first message is word for word what the harness's Chromium wrote on a preview on 2026-11-24.
    const policy = `the following Content Security Policy directive: "script-src 'self' 'nonce-abc' https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js"`;
    const toolbar = [
      `Loading the script 'https://vercel.live/_next-live/feedback/feedback.js' violates ${policy}. The action has been blocked.`,
      `Refused to load the script 'https://vercel.live/_next-live/feedback/feedback.js' because it violates ${policy}.`,
      `Framing 'https://vercel.live/' violates the following Content Security Policy directive: "frame-src 'none'".`,
    ];
    const site = [
      `Loading the script 'https://example.com/x.js' violates ${policy}. The action has been blocked.`,
      `Refused to load the script 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.min.js' because it violates ${policy}.`,
      `Loading the script 'https://vercel.live.example.com/x.js' violates ${policy}.`,
      `Loading the script 'https://example.com/x.js', sent on to 'https://vercel.live/x.js' violates ${policy}.`,
      "Failed to fetch 'https://vercel.live/x': see 'Content Security Policy'",
      "Loading the script 'https://vercel.live/x.js' violates nothing at all",
      "Uncaught TypeError: cannot read 'https://vercel.live/' of undefined",
      "the world fell over",
    ];
    expect(toolbar.map(worldError)).toEqual([false, false, false]);
    // And what passed before still passes: the archive's audio, an aborted request and the favicon.
    expect(["Failed to load resource: https://archive.org/x.mp3", "net::ERR_ABORTED https://preview.test/x", "Failed to load resource: https://preview.test/favicon.ico"].map(worldError)).toEqual([false, false, false]);
    expect(site.map(worldError)).toEqual(site.map(() => true));
    const { asked, browser: fake } = browser();
    const { errors } = await openPage(fake, job("branch Q"), SERVER);
    for (const text of [...toolbar, ...site]) asked.on.console({ type: () => "error", text: () => text });
    expect(errors).toEqual(site.map((text) => `console.error: ${text.slice(0, 300)}`));
  });

  it("leaves the server's own world alone, and serves a checkout's public/world in its place: its modules, and a 404 for one it lacks", async () => {
    const own = browser();
    await openPage(own.browser, job("branch Q"), SERVER);
    expect(own.asked.routes).toEqual([]);
    const { asked, browser: fake } = browser();
    await openPage(fake, job("branch Q"), { ...SERVER, worldDir: WORLD });
    expect(asked.routes).toHaveLength(1);
    const [matches, serve] = asked.routes[0];
    expect(["/world/main.js", "/world/deep/x.js", "/maps/x.json", "/world/main.css"].map((path) => matches(new URL(SITE + path)))).toEqual([true, false, false, false]);
    const ask = (path: string) => serve({ request: () => ({ url: () => SITE + path }), fulfill: (answer) => answer }) as { status: number; body: string };
    expect(ask("/world/main.js")).toMatchObject({ status: 200, body: readFileSync(join(WORLD, "main.js"), "utf8") });
    expect(ask("/world/no-such-module.js")).toMatchObject({ status: 404, body: "not in WORLD_DIR" });
  });
});

describe("the shelves", () => {
  it("are put away by the page's own cookie and storage key, all three by the page's names for them", () => {
    // The count hides the HUD by these. A name that changed in shelves.ts and not in lib.mjs would leave the HUD out, in the frame
    // that is counted.
    expect(SHELVES_COOKIE).toBe(PAGE_COOKIE);
    expect(SHELVES_STORAGE).toBe(PAGE_STORAGE);
    expect(SHELVES_AWAY).toBe(SHELVES.join(","));
  });
});

describe("tables", () => {
  const METAL = "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)";
  const MAIN = { hash: "a".repeat(64), from: "main", ref: "origin/main", commit: "c27c328c6edad881146e743042bdbc6409f86fac", dirty: false };
  const BRANCH = { hash: "b".repeat(64), from: "WORLD_DIR", ref: "/checkout/public/world", commit: "d774c43000000000000000000000000000000000", dirty: false };
  // A result as capture.mjs writes one, with what the table reads: `most` swings at the worst block of each grid, and `at5` blocks at 5
  // or more. `counts` has a pair for each grid of the line's job: the four, unless the line names fewer.
  const row = (line: string, counts: [number, number][], world: Partial<typeof MAIN & { renderer: string }> = {}) => {
    const j = job(line), phone = j.tier === "phone";
    const frame = { width: j.view.width * j.dpr, height: j.view.height * j.dpr };
    return {
      tag: tagOf(j), job: j, window: WINDOWS[j.window as keyof typeof WINDOWS], frame,
      world: { ...(j.variant === "main" ? MAIN : BRANCH), tier: phone ? "phone" : "desktop", renderer: METAL, bufferW: phone ? 332 : frame.width, bufferH: phone ? 717 : frame.height, ...world },
      canvasCheck: phone ? { checked: 0, unchecked: 10, worst: 0 } : { checked: 10, unchecked: 0, worst: 0 },
      results: j.grids.map((grid, k) => ({ grid, maxSwingsInASecond: counts[k][0], blocksAtLeast: { 5: counts[k][1] } })),
    };
  };
  const HEAD = [
    "| device and frame | rung | window | pose | pass | grid | main: most swings in any second, blocks at 5 or more | branch: most swings in any second, blocks at 5 or more |",
    "|---|---|---|---|---|---|---|---|",
  ];

  it("puts main's count beside the branch's for the same job, a row a grid, and names the two worlds", () => {
    // No grid is named, so each job has the four, in the order a job counts them.
    const { markdown, worlds, warnings } = tables([row("branch S dpr=1.5 still=1", [[4, 0], [5, 1], [4, 0], [3, 0]]), row("main S dpr=1.5 still=1", [[4, 0], [6, 1], [4, 0], [4, 2]])]);
    expect(markdown.split("\n")).toEqual([
      ...HEAD,
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | even | 4, 0 | 4, 0 |",
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | moved 1 px right, 1 px down | 6, 1 | 5, 1 |",
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | moved 1 px right, 0 px down | 4, 0 | 4, 0 |",
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | moved 0 px right, 1 px down | 4, 2 | 3, 0 |",
    ]);
    expect(worlds).toEqual(["main: aaaaaaaaaaaa (main at c27c328)", "branch: bbbbbbbbbbbb (/checkout/public/world at d774c43)"]);
    expect(warnings).toEqual([]);
  });

  it("sets a desktop before a phone, a rung after the one above it and the windows in the night's order, and leaves a dash where a variant was not run", () => {
    const { markdown } = tables([
      row("branch S tier=phone view=390x844 dpr=2 grids=0,0", [[3, 0]]),
      row("main S dpr=1.5 still=1 rung=1 grids=0,0", [[4, 0]]),
      row("main Q dpr=1.5 pose=stage grids=0,0", [[2, 0]]),
      row("branch A dpr=1.5 rung=1 grids=0,0", [[5, 1]]),
      row("branch A dpr=1.5 grids=0,0", [[1, 0]]),
    ]);
    expect(markdown.split("\n").slice(2)).toEqual([
      "| desktop, 1.5×: 1200×750 | 0 | A (Fire On The Mountain) | crowd | whole frame | even | – | 1, 0 |",
      "| desktop, 1.5×: 1200×750 | 0 | Q (Space) | stage | whole frame | even | 2, 0 | – |",
      "| desktop, 1.5×: 1200×750 | 1 | A (Fire On The Mountain) | crowd | whole frame | even | – | 5, 1 |",
      "| desktop, 1.5×: 1200×750 | 1 | S (Seeks through the night) | crowd | light alone | even | 4, 0 | – |",
      "| phone, 2×: 780×1688, drawn at 332×717 | 0 | S (Seeks through the night) | crowd | whole frame | even | – | 3, 0 |",
    ]);
  });

  it("refuses rows whose branch worlds differ, or whose main worlds do, and names each world and its jobs", () => {
    // One PR's quick set read with another's standard set would print the other's counts as this branch's.
    const other = { hash: "c".repeat(64), ref: "/another/public/world", commit: "e145cb0000000000000000000000000000000000", dirty: true };
    const mixed = [row("branch S grids=0,0+1,1", [[5, 2], [5, 1]]), row("branch Q grids=0,0+1,1", [[2, 0], [2, 0]], other), row("main S grids=0,0+1,1", [[5, 2], [6, 1]])];
    expect(() => tables(mixed)).toThrow("the branch rows are of 2 worlds, and one table would set counts of different code side by side: " +
      "bbbbbbbbbbbb (/checkout/public/world at d774c43): branch_S_crowd_800x500_x1_auto_whole_rung0_g00+11; " +
      "cccccccccccc (/another/public/world at e145cb0, changed since): branch_Q_crowd_800x500_x1_auto_whole_rung0_g00+11");
    expect(() => tables([row("main S grids=0,0+1,1", [[5, 2], [6, 1]]), row("main Q grids=0,0+1,1", [[2, 0], [2, 0]], { hash: "d".repeat(64), commit: "f20c256000000000000000000000000000000000" })])).toThrow("the main rows are of 2 worlds");
    // A checkout that was changed between two runs is two worlds, though its commit is one: the hash tells them, not the commit.
    expect(() => tables([row("branch S grids=0,0+1,1", [[5, 2], [5, 1]]), row("branch Q grids=0,0+1,1", [[2, 0], [2, 0]], { hash: "c".repeat(64), dirty: true })])).toThrow("the branch rows are of 2 worlds");
    // And the same modules are one world, whatever commit or folder they were read from.
    expect(tables([row("branch S grids=0,0+1,1", [[5, 2], [5, 1]]), row("branch Q grids=0,0+1,1", [[2, 0], [2, 0]], { ref: "/another/public/world", commit: "e145cb0000000000000000000000000000000000" })]).worlds).toHaveLength(1);
    // Told to, it prints them, and says what it has mixed.
    const { markdown, worlds, warnings } = tables(mixed, { mixed: true });
    expect(markdown.split("\n")).toHaveLength(2 + 4);
    expect(worlds).toHaveLength(3);
    expect(warnings).toEqual([expect.stringContaining("the branch rows are of 2 worlds: bbbbbbbbbbbb")]);
  });

  it("prints every result of a job when told to mix, each by its world's hash, and drops none", () => {
    // Two runs of the seeks on the branch, of two worlds, and one on main: the branch's cell holds both counts.
    const other = { hash: "c".repeat(64), ref: "/another/public/world" };
    const { markdown } = tables([row("branch S grids=0,0", [[6, 14]]), row("branch S grids=0,0", [[18, 116]], other), row("main S grids=0,0", [[6, 14]])], { mixed: true });
    expect(markdown.split("\n").slice(2)).toEqual([
      "| desktop, 1×: 800×500 | 0 | S (Seeks through the night) | crowd | whole frame | even | 6, 14 | 6, 14 (bbbbbbbbbbbb); 18, 116 (cccccccccccc) |",
    ]);
    // The same job run twice on one world says its count once where the two agree, and both where they do not.
    expect(tables([row("branch S grids=0,0", [[6, 14]]), row("branch S grids=0,0", [[6, 14]])]).markdown.split("\n")[2]).toContain("| – | 6, 14 |");
    expect(tables([row("branch S grids=0,0", [[6, 14]]), row("branch S grids=0,0", [[7, 14]])]).markdown.split("\n")[2]).toContain("| – | 6, 14 (bbbbbbbbbbbb); 7, 14 (bbbbbbbbbbbb) |");
  });

  it("refuses a result that does not say which world it counted, as an earlier counter's does not", () => {
    const old = { ...row("branch Q grids=0,0+1,1", [[2, 0], [2, 0]]), world: { tier: "desktop", renderer: METAL } };
    expect(() => tables([row("branch S grids=0,0+1,1", [[5, 2], [5, 1]]), old as unknown as ReturnType<typeof row>])).toThrow(
      "1 of 2 results do not say which world they counted: they are of an earlier flash counter (branch_Q_crowd_800x500_x1_auto_whole_rung0_g00+11)");
  });

  it("tells a server's own world, and a folder in no checkout, by their hashes alone", () => {
    const { worlds } = tables([
      row("branch S grids=0,0+1,1", [[5, 2], [5, 1]], { from: "server", ref: "https://preview.test", commit: null as unknown as string, dirty: null as unknown as boolean }),
      row("main S grids=0,0+1,1", [[5, 2], [5, 1]]),
    ]);
    expect(worlds).toEqual(["main: aaaaaaaaaaaa (main at c27c328)", "branch: bbbbbbbbbbbb (the server's own, https://preview.test)"]);
    expect(tables([row("branch S grids=0,0+1,1", [[5, 2], [5, 1]], { commit: null as unknown as string })]).worlds).toEqual(["branch: bbbbbbbbbbbb (/checkout/public/world)"]);
  });

  it("warns when its rows come from two renderers, whose counts are not comparable", () => {
    const { warnings } = tables([row("branch S grids=0,0+1,1", [[5, 2], [5, 1]]), row("main S grids=0,0+1,1", [[5, 2], [6, 1]], { renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)" })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("the rows come from 2 renderers, and counts from different renderers are not comparable");
    expect(warnings[0]).toContain("SwiftShader");
  });

  it("warns of the jobs whose frames nothing checked against the canvas, by name: one frame unchecked is enough", () => {
    const { warnings } = tables([row("branch S dpr=1.5 grids=0,0+1,1", [[5, 2], [5, 1]]), row("branch S tier=phone view=390x844 dpr=2 grids=0,0+1,1", [[5, 2], [5, 1]])]);
    expect(warnings).toEqual(["1 of 2 jobs have frames that were not checked against the canvas (the world draws them at another size than the screen's): branch_S_crowd_390x844_x2_phone_whole_rung0_g00+11"]);
    const one = row("branch Q dpr=1.5 grids=0,0+1,1", [[2, 0], [2, 0]]);
    one.canvasCheck = { checked: 780, unchecked: 1, worst: 0 };
    expect(tables([one]).warnings).toEqual([expect.stringContaining("1 of 1 jobs have frames that were not checked against the canvas")]);
  });

  it("warns of the jobs that could not check their pose stood still, by name: a world from before it said where the visitor stands", () => {
    const held = row("branch S dpr=1.5 grids=0,0+1,1", [[5, 2], [5, 1]]), unheld = { ...row("main S dpr=1.5 grids=0,0+1,1", [[5, 2], [5, 1]]), poseHeld: false }, opening = { ...row("branch Q dpr=1.5 pose=home grids=0,0+1,1", [[2, 0], [2, 0]]), poseHeld: null };
    expect(tables([{ ...held, poseHeld: true }, opening]).warnings).toEqual([]);
    expect(tables([{ ...held, poseHeld: true }, unheld, opening]).warnings).toEqual([
      "1 of 3 jobs could not check that the visitor stood still at their pose (their world is from before window.__hill.walker): main_S_crowd_800x500_x1.5_auto_whole_rung0_g00+11",
    ]);
  });
});
