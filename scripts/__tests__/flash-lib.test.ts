import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { jobUrl, launchArgs, matrixJobs, parseJobs, patched, PATCHES, readConfig, repoRoot, tagOf, windowsFor } from "../flash/lib.mjs";
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

describe("patched", () => {
  const SOURCE = "const a = 1;\nconst b = 2;\nconst c = 2;\n";

  it("puts its text in the place of an anchor that is in the module once", () => {
    expect(patched("x.js", SOURCE, [["const a = 1;", "const a = 9;"]])).toBe("const a = 9;\nconst b = 2;\nconst c = 2;\n");
    // Each patch in turn, the second on what the first left.
    expect(patched("x.js", SOURCE, [["const a = 1;", "const a = 9;"], ["a = 9;\nconst b", "a = 9, b"]])).toBe("const a = 9, b = 2;\nconst c = 2;\n");
  });

  it("refuses an anchor the module does not have, which a change to the world has moved: a patch never fails quietly", () => {
    expect(() => patched("x.js", SOURCE, [["const d = 4;", ""]])).toThrow('patch: "const d = 4;" is in x.js 0 times');
  });

  it("refuses an anchor that is in the module twice, where it could change the wrong place", () => {
    expect(() => patched("x.js", SOURCE, [[" = 2;", " = 3;"]])).toThrow('patch: " = 2;" is in x.js 2 times');
  });
});

describe("parseJobs", () => {
  it("takes a variant and a window, and gives the rest its defaults: behind the crowd, 800 by 500 at 1, the whole frame, rung 0, both grids", () => {
    expect(job("branch Q")).toEqual({
      variant: "branch", window: "Q", pose: "crowd", view: { width: 800, height: 500 }, dpr: 1, tier: "", still: false, rung: 0, grids: [[0, 0], [1, 1]], patch: "",
    });
  });

  it("takes every key", () => {
    expect(job("main S pose=12.5,-30,1.2,-0.1 view=390x844 dpr=2 tier=phone still=1 rung=3 grids=1,0+0,1 patch=glow")).toEqual({
      variant: "main", window: "S", pose: "12.5,-30,1.2,-0.1", view: { width: 390, height: 844 }, dpr: 2, tier: "phone", still: true, rung: 3, grids: [[1, 0], [0, 1]], patch: "glow",
    });
    expect(job("branch A pose=home dpr=1.5").pose).toBe("home");
    expect(job("branch A pose=near-3 tier=tv")).toMatchObject({ pose: "near-3", tier: "tv" });
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
    ["a rung that is no whole number", "main Q rung=1.5", "rung=1.5"],
    ["a rung under 0", "main Q rung=-1", "rung=-1"],
    ["a rung of three figures", "main Q rung=100", "rung=100"],
    ["a frame of an odd width", "main Q view=801x500", "the frame 801x500 (the view times dpr) is not whole 2x2 blocks"],
    ["a frame of an odd height", "main Q view=800x501", "is not whole 2x2 blocks"],
    ["a frame that a pixel ratio leaves between pixels", "main Q view=801x500 dpr=1.5", "is not whole 2x2 blocks"],
    ["a view that is no size", "main Q view=800", "view=800 is no viewport"],
    ["a pixel ratio of 0", "main Q dpr=0", "dpr=0 is no pixel ratio"],
    ["a pixel ratio that is no number", "main Q dpr=x", "dpr=x is no pixel ratio"],
    ["a tier the world does not have", "main Q tier=watch", "tier=watch"],
    ["a still that is neither 0 nor 1", "main Q still=yes", "still=yes"],
    ["a grid moved by 2", "main Q grids=0,0+2,0", "grids=0,0+2,0"],
    ["a grid twice", "main Q grids=1,1+1,1", "grids=1,1+1,1"],
    ["no grid", "main Q grids=", "grids="],
    ["a patch there is none of", "main Q patch=fog", 'no patch "fog"'],
    ["a pose of three numbers", "main Q pose=1,2,3", "pose=1,2,3 is no pose"],
    ["a pose pitched past the 0.8 rad the look allows, which the world would not take", "main Q pose=1,2,3,0.9", "pose=1,2,3,0.9 is no pose"],
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
  });

  it("asks for no pose for the page's own opening", () => {
    expect(jobUrl("http://127.0.0.1:3000", DAY, job("branch Q pose=home"))).toBe("http://127.0.0.1:3000/2026-10-20?drive=map");
  });
});

describe("tagOf", () => {
  it("names a job's files by every field that tells it from another: two jobs that differ in one never share a result", () => {
    const base = "main Q pose=crowd view=800x500 dpr=1 tier= still=0 rung=0 grids=0,0+1,1 patch=";
    const others = ["branch Q", "main S", "main Q pose=stage", "main Q pose=1,2,3,0.1", "main Q pose=1,2,3,-0.1", "main Q view=800x600", "main Q view=600x500", "main Q dpr=2", "main Q tier=phone", "main Q tier=tv",
      "main Q still=1", "main Q rung=1", "main Q rung=11", "main Q grids=0,0", "main Q grids=1,1", "main Q grids=1,0+0,1", "main Q patch=glow", "main Q patch=still-before-hooks"];
    const tags = [base, ...others].map((line) => tagOf(job(line)));
    expect(new Set(tags).size).toBe(tags.length);
    // The defaults spelled out are the same job, and so the same files.
    expect(tagOf(job("main Q"))).toBe(tags[0]);
  });

  it("is safe as a file's name: letters, figures, and . _ + - ~ only", () => {
    expect(tagOf(job("main Q"))).toBe("main_Q_crowd_800x500_x1_auto_whole_rung0_g00+11");
    expect(tagOf(job("branch S pose=12.5,-30,1.2,0.1 view=400x800 dpr=1.5 tier=phone still=1 rung=1 patch=glow")))
      .toBe("branch_S_12.5~-30~1.2~0.1_400x800_x1.5_phone_still_rung1_g00+11_patch-glow");
  });
});

describe("matrixJobs", () => {
  const parsed = (name: string) => parseJobs(matrixJobs(name).join("\n"), WINDOWS);
  // How many of `jobs` have each value of a field.
  const tally = (jobs: Job[], field: (j: Job) => string) => {
    const counts: Record<string, number> = {};
    for (const j of jobs) counts[field(j)] = (counts[field(j)] ?? 0) + 1;
    return counts;
  };
  const device = (j: Job) => `${j.tier || "desktop"} ${j.view.width}x${j.view.height} at ${j.dpr}`;

  it("has a quick set of 4: Space and the seeks from behind the crowd on a desktop at 1.5, the whole frame, on main and the branch", () => {
    const jobs = parsed("quick");
    expect(jobs).toHaveLength(4);
    expect(tally(jobs, (j) => `${j.variant} ${j.window}`)).toEqual({ "main Q": 1, "branch Q": 1, "main S": 1, "branch S": 1 });
    for (const j of jobs) expect(j).toMatchObject({ pose: "crowd", view: { width: 800, height: 500 }, dpr: 1.5, tier: "", still: false, rung: 0, grids: [[0, 0], [1, 1]] });
  });

  it("has a standard set of 84: five windows, two poses, a desktop and a phone, the whole frame and the light alone, and the seeks a rung down", () => {
    const jobs = parsed("standard");
    expect(jobs).toHaveLength(84);
    const level = jobs.filter((j) => j.rung === 0), down = jobs.filter((j) => j.rung !== 0);
    expect(level).toHaveLength(80);
    expect(tally(level, (j) => j.window)).toEqual({ A: 16, B: 16, Q: 16, D: 16, S: 16 });
    expect(tally(level, (j) => j.pose)).toEqual({ crowd: 40, stage: 40 });
    expect(tally(level, device)).toEqual({ "desktop 800x500 at 1.5": 40, "phone 390x844 at 2": 40 });
    expect(tally(level, (j) => (j.still ? "light alone" : "whole frame"))).toEqual({ "light alone": 40, "whole frame": 40 });
    expect(tally(level, (j) => j.variant)).toEqual({ main: 40, branch: 40 });
    // The rung down: the seeks' light alone from behind the crowd, on both devices and both variants.
    expect(down).toHaveLength(4);
    for (const j of down) expect(j).toMatchObject({ window: "S", pose: "crowd", still: true, rung: 1 });
    expect(tally(down, (j) => `${j.variant} ${device(j)}`)).toEqual({ "main desktop 800x500 at 1.5": 1, "branch desktop 800x500 at 1.5": 1, "main phone 390x844 at 2": 1, "branch phone 390x844 at 2": 1 });
  });

  it.each(["quick", "standard"])("gives each job of the %s set its own files, counts both grids in each, and patches none", (name) => {
    const jobs = parsed(name);
    expect(new Set(jobs.map(tagOf)).size).toBe(jobs.length);
    for (const j of jobs) {
      expect(j.grids).toEqual([[0, 0], [1, 1]]);
      // A patch is an experiment: a count with one is not comparable with one without.
      expect(j.patch).toBe("");
      expect(Object.keys(WINDOWS)).toContain(j.window);
    }
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
  it("counts the fixed day at a local server, on the browser's own renderer, against origin/main, three jobs at a time, and keeps no stills", () => {
    expect(readConfig({})).toEqual({
      siteUrl: "http://127.0.0.1:3000", day: DAY, outDir: join(tmpdir(), "dead-redux-flash"), gpu: "", worldDir: null, mainRef: "origin/main", parallel: 3, stills: false,
    });
    // A run's stills are most of what it writes to the disk: STILLS=0 keeps none, as leaving it out does.
    expect(readConfig({ STILLS: "0" }).stills).toBe(false);
    expect(readConfig({ STILLS: "" }).stills).toBe(false);
  });

  it("takes each setting from the environment", () => {
    const out = join(tmpdir(), "elsewhere"), world = join(tmpdir(), "checkout", "public", "world");
    expect(readConfig({ SITE_URL: "https://preview.test/", DAY: "2026-11-01", OUT_DIR: out, GPU: "metal", WORLD_DIR: world, MAIN_REF: "abc1234", PARALLEL: "1", STILLS: "1" })).toEqual({
      siteUrl: "https://preview.test", day: "2026-11-01", outDir: out, gpu: "metal", worldDir: world, mainRef: "abc1234", parallel: 1, stills: true,
    });
  });

  it("keeps a count's files out of the repo: an OUT_DIR in it, or the repo itself, is refused", () => {
    expect(() => readConfig({ OUT_DIR: join(repoRoot(), "scripts", "flash", "out") })).toThrow("is inside the repo");
    expect(() => readConfig({ OUT_DIR: repoRoot() })).toThrow("is inside the repo");
    // A folder beside the repo is outside it, though its path starts with the repo's.
    expect(readConfig({ OUT_DIR: `${repoRoot()}-flash` }).outDir).toBe(`${repoRoot()}-flash`);
  });

  it("refuses a renderer it has no flags for, a day that is no date, a count of jobs that is none, and a STILLS that is neither 0 nor 1", () => {
    expect(() => readConfig({ STILLS: "yes" })).toThrow("STILLS=yes");
    expect(() => readConfig({ GPU: "1" })).toThrow("GPU=1");
    expect(() => readConfig({ DAY: "today" })).toThrow("DAY=today");
    expect(() => readConfig({ PARALLEL: "0" })).toThrow("PARALLEL=0");
    expect(() => readConfig({ PARALLEL: "two" })).toThrow("PARALLEL=two");
  });
});

describe("launchArgs", () => {
  it("asks for the Mac's GPU under GPU=metal, and for nothing otherwise", () => {
    expect(launchArgs("metal")).toEqual(["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]);
    expect(launchArgs("")).toEqual([]);
  });
});

describe("PATCHES", () => {
  it("names each patch's module by its file in the world, with every change an anchor and its replacement", () => {
    for (const [name, files] of Object.entries(PATCHES) as [string, Record<string, string[][]>][]) {
      for (const [file, edits] of Object.entries(files)) {
        expect(file, name).toMatch(/^[a-z-]+\.js$/);
        expect(edits.length, name).toBeGreaterThan(0);
        for (const edit of edits) {
          expect(edit, name).toHaveLength(2);
          expect(edit[0], name).not.toBe(edit[1]);
        }
      }
    }
  });
});

describe("tables", () => {
  // A result as capture.mjs writes one, with what the table reads: `most` swings at the worst block of each grid, and `at5` blocks at 5
  // or more.
  const row = (line: string, counts: [number, number][], renderer = "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)") => {
    const j = job(line), phone = j.tier === "phone";
    const frame = { width: j.view.width * j.dpr, height: j.view.height * j.dpr };
    return {
      job: j, variant: j.variant, window: j.window, name: WINDOWS[j.window as keyof typeof WINDOWS].name, rung: j.rung, patch: j.patch || null, gpu: "metal",
      devicePixelRatio: j.dpr, frame, loaded: { tier: phone ? "phone" : "desktop", renderer, canvas: { bufferW: phone ? 663 : frame.width, bufferH: phone ? 1435 : frame.height } },
      errors: [] as string[], screenshotMatchesCanvas: { checked: 10, over2: 0 },
      results: j.grids.map((grid, k) => ({ grid, maxSwingsInASecond: counts[k][0], blocksAtLeast: { 5: counts[k][1] } })),
    };
  };
  const HEAD = [
    "| device and frame | rung | window | pose | pass | grid | main: most swings in any second, blocks at 5 or more | branch: most swings in any second, blocks at 5 or more |",
    "|---|---|---|---|---|---|---|---|",
  ];

  it("puts main's count beside the branch's for the same job, a row a grid", () => {
    const { markdown, warnings } = tables([row("branch S dpr=1.5 still=1", [[5, 2], [5, 1]]), row("main S dpr=1.5 still=1", [[5, 2], [6, 1]])]);
    expect(markdown.split("\n")).toEqual([
      ...HEAD,
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | even | 5, 2 | 5, 2 |",
      "| desktop, 1.5×: 1200×750 | 0 | S (Seeks through the night) | crowd | light alone | moved 1 px right, 1 px down | 6, 1 | 5, 1 |",
    ]);
    expect(warnings).toEqual([]);
  });

  it("sets a desktop before a phone, a rung after the one above it and the windows in the night's order, and leaves a dash where a variant was not run", () => {
    const { markdown } = tables([
      row("branch S tier=phone view=390x844 dpr=2 grids=0,0", [[3, 0]]),
      row("main S dpr=1.5 still=1 rung=1 grids=0,0", [[4, 0]]),
      row("main Q dpr=1.5 pose=stage grids=0,0 patch=glow", [[2, 0]]),
      row("branch A dpr=1.5 grids=0,0", [[1, 0]]),
    ]);
    expect(markdown.split("\n").slice(2)).toEqual([
      "| desktop, 1.5×: 1200×750 | 0 | A (Fire On The Mountain) | crowd | whole frame | even | – | 1, 0 |",
      "| desktop, 1.5×: 1200×750 | 0 | Q (Space) | stage | whole frame, patch glow | even | 2, 0 | – |",
      "| desktop, 1.5×: 1200×750 | 1 | S (Seeks through the night) | crowd | light alone | even | 4, 0 | – |",
      "| phone, 2×: 780×1688, drawn at 663×1435 | 0 | S (Seeks through the night) | crowd | whole frame | even | – | 3, 0 |",
    ]);
  });

  it("warns when its rows come from two renderers, whose counts are not comparable", () => {
    const { warnings } = tables([row("branch S", [[5, 2], [5, 1]]), row("main S", [[5, 2], [6, 1]], "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)")]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("the rows come from 2 renderers, and counts from different renderers are not comparable");
    expect(warnings[0]).toContain("SwiftShader");
  });

  it("warns of page errors, and of screenshots that did not show the frame just drawn", () => {
    const bad = row("branch S", [[5, 2], [5, 1]]);
    bad.errors.push("pageerror: x");
    bad.screenshotMatchesCanvas.over2 = 3;
    expect(tables([bad]).warnings).toEqual(["1 page errors across the rows", "3 screenshots differ from the canvas by more than 2/255 at a checked point"]);
  });
});
