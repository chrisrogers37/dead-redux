import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { SHELVES, SHELVES_COOKIE as PAGE_COOKIE, SHELVES_STORAGE as PAGE_STORAGE } from "../../src/components/world/shelves";
import { jobUrl, launch, matrixJobs, parseJobs, readConfig, repoRoot, SHELVES_AWAY, SHELVES_COOKIE, SHELVES_STORAGE, tagOf, windowsFor } from "../flash/lib.mjs";
import { tables } from "../flash/table.mjs";
import windows from "../flash/windows.json";

// The flash counter's jobs, settings and table (scripts/flash). Importing lib.mjs here is itself a check: it runs no git, reads no
// environment and loads no browser until one of its functions is called, so it imports where there is none of them.

const DAY = "2026-10-20";
const WINDOWS = windows[DAY].windows;
type Job = ReturnType<typeof parseJobs>[number];
const job = (line: string): Job => {
  const jobs = parseJobs(line, WINDOWS);
  expect(jobs).toHaveLength(1);
  return jobs[0];
};

describe("parseJobs", () => {
  it("takes a variant and a window, and gives the rest its defaults: behind the crowd, 800 by 500 at 1, the whole frame, rung 0, both grids", () => {
    expect(job("branch Q")).toEqual({
      variant: "branch", window: "Q", pose: "crowd", view: { width: 800, height: 500 }, dpr: 1, tier: "", still: false, rung: 0, grids: [[0, 0], [1, 1]],
    });
  });

  it("takes every key, and a pose that is a name or four numbers, whose limits are the world's to keep", () => {
    expect(job("main S pose=12.5,-30,1.2,-0.1 view=390x844 dpr=2 tier=phone still=1 rung=3 grids=1,0+0,1")).toEqual({
      variant: "main", window: "S", pose: "12.5,-30,1.2,-0.1", view: { width: 390, height: 844 }, dpr: 2, tier: "phone", still: true, rung: 3, grids: [[1, 0], [0, 1]],
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
    ["a rung that is no whole number from 0 to 99", "main Q rung=1.5", "rung=1.5"],
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
      "main Q still=1", "main Q rung=1", "main Q rung=11", "main Q grids=0,0", "main Q grids=1,1", "main Q grids=1,0+0,1"];
    const tags = ["main Q", ...others].map((line) => tagOf(job(line)));
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags[0]).toBe("main_Q_crowd_800x500_x1_auto_whole_rung0_g00+11");
    // The defaults spelled out are the same job, and so the same file.
    expect(tagOf(job("main Q pose=crowd view=800x500 dpr=1 tier= still=0 rung=0 grids=0,0+1,1"))).toBe(tags[0]);
    expect(tagOf(job("branch S pose=12.5,-30,1.2,0.1 view=400x800 dpr=1.5 tier=phone still=1 rung=1"))).toBe("branch_S_12.5~-30~1.2~0.1_400x800_x1.5_phone_still_rung1_g00+11");
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

  it.each(["quick", "standard"])("gives each job of the %s set its own file and counts both grids in each", (name) => {
    const jobs = parsed(name);
    expect(new Set(jobs.map(tagOf)).size).toBe(jobs.length);
    for (const j of jobs) expect(j.grids).toEqual([[0, 0], [1, 1]]);
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

  it("is what windowsFor reads, which refuses a day with no windows", () => {
    expect(windowsFor(DAY)).toEqual(windows[DAY]);
    expect(() => windowsFor("2026-10-21")).toThrow("windows.json has no windows for 2026-10-21");
  });
});

describe("readConfig", () => {
  it("counts the fixed day at a local server, on the browser's own renderer, against origin/main, three jobs at a time, and keeps a job's result alone", () => {
    expect(readConfig({})).toEqual({
      siteUrl: "http://127.0.0.1:3000", day: DAY, outDir: join(tmpdir(), "dead-redux-flash"), gpu: "", worldDir: null, mainRef: "origin/main", parallel: 3, heat: false, stills: false,
    });
  });

  it("takes each setting from the environment", () => {
    const out = join(tmpdir(), "elsewhere"), world = join(tmpdir(), "checkout", "public", "world");
    expect(readConfig({ SITE_URL: "https://preview.test/", DAY: "2026-11-01", OUT_DIR: out, GPU: "metal", WORLD_DIR: world, MAIN_REF: "abc1234", PARALLEL: "1", HEAT: "1", STILLS: "1" })).toEqual({
      siteUrl: "https://preview.test", day: "2026-11-01", outDir: out, gpu: "metal", worldDir: world, mainRef: "abc1234", parallel: 1, heat: true, stills: true,
    });
  });

  it("keeps the heat maps and the stills, which are megabytes, only when HEAT and STILLS are 1", () => {
    for (const value of ["", "0", "true", "yes"]) expect(readConfig({ HEAT: value, STILLS: value })).toMatchObject({ heat: false, stills: false });
    expect(readConfig({ HEAT: "1" })).toMatchObject({ heat: true, stills: false });
    expect(readConfig({ STILLS: "1" })).toMatchObject({ heat: false, stills: true });
  });

  it("keeps a count's files out of the repo: an OUT_DIR in it, or the repo itself, is refused", () => {
    expect(() => readConfig({ OUT_DIR: join(repoRoot(), "scripts", "flash", "out") })).toThrow("is inside the repo");
    expect(() => readConfig({ OUT_DIR: repoRoot() })).toThrow("is inside the repo");
    // A folder beside the repo is outside it, though its path starts with the repo's.
    expect(readConfig({ OUT_DIR: `${repoRoot()}-flash` }).outDir).toBe(`${repoRoot()}-flash`);
  });

  it("refuses a day that is no date, and a count of jobs that is none", () => {
    expect(() => readConfig({ DAY: "today" })).toThrow("DAY=today");
    expect(() => readConfig({ PARALLEL: "0" })).toThrow("PARALLEL=0");
    expect(() => readConfig({ PARALLEL: "two" })).toThrow("PARALLEL=two");
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
  // A result as capture.mjs writes one, with what the table reads: `most` swings at the worst block of each grid, and `at5` blocks at 5
  // or more.
  const row = (line: string, counts: [number, number][], renderer = "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)") => {
    const j = job(line), phone = j.tier === "phone";
    const frame = { width: j.view.width * j.dpr, height: j.view.height * j.dpr };
    return {
      job: j, window: WINDOWS[j.window as keyof typeof WINDOWS], frame,
      world: { tier: phone ? "phone" : "desktop", renderer, bufferW: phone ? 332 : frame.width, bufferH: phone ? 717 : frame.height, head: "c27c328c6edad881146e743042bdbc6409f86fac" },
      errors: [] as string[], screenshotMatchesCanvas: { checked: 10, over2: 0 },
      results: j.grids.map((grid, k) => ({ grid, maxSwingsInASecond: counts[k][0], blocksAtLeast: { 5: counts[k][1] } })),
    };
  };
  const HEAD = [
    "| device and frame | rung | window | pose | pass | grid | main: most swings in any second, blocks at 5 or more | branch: most swings in any second, blocks at 5 or more |",
    "|---|---|---|---|---|---|---|---|",
  ];

  it("puts main's count beside the branch's for the same job, a row a grid", () => {
    const { markdown, warnings } = tables([row("branch S dpr=1.5 still=1", [[4, 0], [5, 1]]), row("main S dpr=1.5 still=1", [[4, 0], [6, 1]])]);
    expect(markdown.split("\n")).toEqual([
      ...HEAD,
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | even | 4, 0 | 4, 0 |",
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | moved 1 px right, 1 px down | 6, 1 | 5, 1 |",
    ]);
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

  it("warns when its rows come from two renderers, whose counts are not comparable, of page errors, and of screenshots that were not the frame just drawn", () => {
    const software = row("main S", [[5, 2], [6, 1]], "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)");
    const two = tables([row("branch S", [[5, 2], [5, 1]]), software]).warnings;
    expect(two).toHaveLength(1);
    expect(two[0]).toContain("the rows come from 2 renderers, and counts from different renderers are not comparable");
    expect(two[0]).toContain("SwiftShader");
    const bad = row("branch S", [[5, 2], [5, 1]]);
    bad.errors.push("pageerror: x");
    bad.screenshotMatchesCanvas.over2 = 3;
    expect(tables([bad]).warnings).toEqual(["1 page errors across the rows", "3 screenshots differ from the canvas by more than 2/255 at a checked point"]);
  });
});
