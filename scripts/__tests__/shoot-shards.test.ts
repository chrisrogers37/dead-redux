import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devicePages, onlyLooks, pageShard, planFailures, planFiles, shardPlan, SHARDS, SPLIT_DEVICE, stillFiles, writtenSince } from "../../.github/screenshots/shards.mjs";

const ROOT = join(__dirname, "../..");
const [ACTS, LOOKS, REST] = SHARDS as string[];

describe("onlyLooks", () => {
  // A page as the shoot's list has one, with the fields a case gives it.
  const page = (fields: object) => ({ path: "/2026-10-20", shots: ["fixed"], ...fields });
  const near = { near: 0, title: "Tuning", shot: "fixed-near-tuning" };

  it("takes a page that is only loaded and shot, whoever shoots it and whatever it waits for or checks in the answer", () => {
    for (const fields of [{}, { devices: ["desktop"] }, { ready: "#world[data-world='ready']" }, { status: 404 }, { end: "archive-end" }, { whole: true }, { shots: [], sweep: [0, 13] }]) {
      expect(onlyLooks(page(fields)), JSON.stringify(fields)).toBe(true);
    }
  });

  it("takes a page whose every step is a near step, which moves the visitor with an event and gives the page no input", () => {
    expect(onlyLooks(page({ whole: true, shots: [], steps: [near, { near: 1, title: "Jack Straw", shot: "fixed-near-jack-straw" }] }))).toBe(true);
  });

  it("sends a page with a step that clicks, focuses, presses or drags to the pages that act, a near step beside it or not", () => {
    // Such a step can start the show, which saves a place the next play step resumes from, or leave a shelf or the view changed.
    const acting = [
      { click: "[data-action='play']", shot: "fixed-playing" },
      { focus: "#world", press: "KeyV", shot: "fixed-reach-snout" },
      { press: "Tab", shot: "fixed-focus-1" },
      { drag: [353, -200], shot: "fixed-crowd-moon" },
      { ...near, click: "canvas" },
    ];
    for (const step of acting) {
      expect(onlyLooks(page({ steps: [step] })), JSON.stringify(step)).toBe(false);
      expect(onlyLooks(page({ steps: [near, step] })), JSON.stringify(step)).toBe(false);
    }
  });

  it("sends a page whose audio fails, and one that checks what an earlier page left in the HTML, to the pages that act", () => {
    // Neither needs a step of its own to depend on the page before it.
    expect(onlyLooks(page({ failAudio: true }))).toBe(false);
    expect(onlyLooks(page({ served: 'data-shelves="title,actions,player"' }))).toBe(false);
  });

  it("sends a page, and a step, that names something the split has not heard of to the pages that act", () => {
    // A new kind of page or step is shot with the pages that act until the split is told it only looks: there it finds what it would
    // in a whole shoot, whatever it does.
    expect(onlyLooks(page({ ride: true }))).toBe(false);
    expect(onlyLooks(page({ steps: [{ ...near, hold: 500 }] }))).toBe(false);
  });
});

// A small shoot, with every kind of page the split tells apart. The devices are shoot.mjs's own names, the desktop among them.
const home = { path: "/", shots: ["home-1", "home-2"], steps: [{ click: "[data-action='play']", shot: "home-playing", later: { ms: 8000, shot: "home-playing-8s" } }] };
const slope = { path: "/2026-10-20?pose=slope", devices: ["desktop"], shots: ["fixed-stage-slope"] };
const nearPage = { path: "/2026-10-20?pose=near-0", devices: ["desktop", "phone"], whole: true, shots: [], steps: [{ near: 0, title: "Tuning", shot: "fixed-near-tuning" }] };
const reach = { path: "/2026-10-20?pose=snout", devices: ["desktop", "phone"], shots: [], steps: [{ focus: "#world", press: "KeyV", shot: "fixed-reach-snout" }] };
const archive = { path: "/archive", devices: ["desktop", "tv"], shots: ["archive"], end: "archive-end" };
const sweep = { path: "/2026-10-20?pose=sweep", devices: ["desktop", "phone", "tv"], shots: [], sweep: [0, 13] };
const frame = { path: "/2026-10-20", devices: ["phone", "phone-landscape"], shots: [], steps: [{ click: "[data-shelf-tab='player']", shot: "fixed-shelf-frame" }] };
const failed = { path: "/2026-10-20", devices: ["desktop"], shots: [], failAudio: true, steps: [{ click: "[data-action='play']", shot: "fixed-track-failed" }] };
const lists = {
  devices: ["desktop", "phone", "tv", "phone-landscape"],
  byName: new Set(["phone-landscape"]),
  pages: [home, slope, nearPage, reach, archive, sweep, frame, failed],
  recordings: [{ device: "desktop", name: "home" }, { device: "tv", name: "ride", click: "[data-action='ride']" }],
  assets: ["/icon", "/2026-03-01/opengraph-image"],
};

describe("devicePages", () => {
  const { pages, byName } = lists;

  it("gives a device the pages that name it and the pages that name no device, in the list's order", () => {
    expect(devicePages("desktop", pages, byName)).toEqual([home, slope, nearPage, reach, archive, sweep, failed]);
    expect(devicePages("phone", pages, byName)).toEqual([home, nearPage, reach, sweep, frame]);
  });

  it("gives the TV the home page and only the other pages that name it", () => {
    expect(devicePages("tv", [...pages, { path: "/2026-03-01", shots: ["2026-03-01"] }], byName)).toEqual([home, archive, sweep]);
  });

  it("gives a device that shoots by name only the pages that name it", () => {
    expect(devicePages("phone-landscape", pages, byName)).toEqual([frame]);
  });
});

describe("shardPlan", () => {
  it("does the whole shoot when no shard is named: every device's pages, every recording and every generated image", () => {
    expect(shardPlan(undefined, lists)).toEqual({
      pages: [
        ["desktop", [home, slope, nearPage, reach, archive, sweep, failed]],
        ["phone", [home, nearPage, reach, sweep, frame]],
        ["tv", [home, archive, sweep]],
        ["phone-landscape", [frame]],
      ],
      recordings: lists.recordings,
      assets: lists.assets,
    });
  });

  it("gives the desktop's pages that act to one shard, in the list's order, and nothing else", () => {
    // Out of order, or with one missing, a play step would resume from another page's place than it does in a whole shoot.
    expect(shardPlan(ACTS, lists)).toEqual({ pages: [["desktop", [home, reach, failed]]], recordings: [], assets: [] });
  });

  it("gives the desktop's pages that only look to another, in the list's order, and nothing else", () => {
    expect(shardPlan(LOOKS, lists)).toEqual({ pages: [["desktop", [slope, nearPage, archive, sweep]]], recordings: [], assets: [] });
  });

  it("gives every other device's pages to the rest, each device whole and in the list's order, with the recordings and the images", () => {
    expect(shardPlan(REST, lists)).toEqual({
      pages: [
        ["phone", [home, nearPage, reach, sweep, frame]],
        ["tv", [home, archive, sweep]],
        ["phone-landscape", [frame]],
      ],
      recordings: lists.recordings,
      assets: lists.assets,
    });
  });

  it("splits no device but the desktop, whatever its pages do", () => {
    expect(SPLIT_DEVICE).toBe("desktop");
    for (const page of lists.pages) {
      expect(pageShard("desktop", page)).toBe(onlyLooks(page) ? LOOKS : ACTS);
      for (const device of ["phone", "tv", "desktop-reduced", "phone-landscape"]) expect(pageShard(device, page)).toBe(REST);
    }
  });

  it("leaves out a device that shoots nothing in the shard, so the shoot opens no browser context for it", () => {
    const looking = { ...lists, pages: [slope, archive, sweep] };
    expect(shardPlan(ACTS, looking).pages).toEqual([]);
    expect(shardPlan(undefined, looking).pages.map(([device]: [string]) => device)).toEqual(["desktop", "phone", "tv"]);
  });

  it("refuses a name that is no shard's, the empty string too, and says which names are", () => {
    // A job whose SHARD came out empty, or misspelt, would otherwise do the whole shoot, or none of it, and pass.
    for (const name of ["nope", "", "Rest", "desktop", "desktop-acts ", "undefined"]) {
      expect(() => shardPlan(name, lists), JSON.stringify(name)).toThrow(`SHARD is "${name}", which is no shard of the shoot: it is one of desktop-acts, desktop-looks, rest, or unset for the whole shoot`);
    }
  });
});

describe("planFiles", () => {
  it("names a page's stills in the order the shoot takes them: its shots, each step's and its later one, then the end", () => {
    expect(stillFiles("phone", home)).toEqual(["phone-home-1.png", "phone-home-2.png", "phone-home-playing.png", "phone-home-playing-8s.png"]);
    expect(stillFiles("tv", archive)).toEqual(["tv-archive.png", "tv-archive-end.png"]);
    expect(stillFiles("desktop", sweep)).toEqual([]);
  });

  it("lists a plan's pages with their stills, its recordings and its images as the files they are saved as", () => {
    expect(planFiles(shardPlan(REST, { ...lists, devices: ["desktop", "tv"] }))).toEqual({
      pages: [
        { device: "tv", path: "/", stills: ["tv-home-1.png", "tv-home-2.png", "tv-home-playing.png", "tv-home-playing-8s.png"] },
        { device: "tv", path: "/archive", stills: ["tv-archive.png", "tv-archive-end.png"] },
        { device: "tv", path: "/2026-10-20?pose=sweep", stills: [] },
      ],
      recordings: ["desktop-home.webm", "tv-ride.webm"],
      assets: ["asset-icon.png", "asset-2026-03-01-opengraph-image.png"],
    });
  });
});

describe("planFailures", () => {
  // The small shoot's files on a desktop and a TV, and a run that saved every one of them.
  const files = planFiles(shardPlan(undefined, { ...lists, devices: ["desktop", "tv"] }));
  const all: string[] = [...files.pages.flatMap((page: { stills: string[] }) => page.stills), ...files.recordings, ...files.assets];
  const without = (...gone: string[]) => all.filter((file) => !gone.includes(file));

  it("passes a run that saved its plan's files and no other", () => {
    expect(all).toHaveLength(20);
    expect(planFailures(files, all)).toEqual([]);
  });

  it("fails a run for each still its plan names that it did not save, and says whose page it is", () => {
    // A step whose control is absent logs a line and is skipped: without this the run passes with the still untaken.
    expect(planFailures(files, without("desktop-fixed-reach-snout.png", "tv-archive-end.png"))).toEqual([
      "desktop-fixed-reach-snout.png: the plan names this still, of desktop /2026-10-20?pose=snout, and it was not saved",
      "tv-archive-end.png: the plan names this still, of tv /archive, and it was not saved",
    ]);
  });

  it("fails a run for each recording its plan names that it did not save", () => {
    expect(planFailures(files, without("tv-ride.webm"))).toEqual(["tv-ride.webm: the plan names this recording, and it was not saved"]);
  });

  it("passes a run without a generated image: the site may answer one with a 404, which the shoot skips", () => {
    expect(planFailures(files, without("asset-icon.png", "asset-2026-03-01-opengraph-image.png"))).toEqual([]);
  });

  it("fails a run for each file it saved that its plan does not name", () => {
    // A shard that shot another's page, or a step whose still the plan's names leave out.
    expect(planFailures(files, ["phone-home-1.png", ...all, "desktop-fixed-ride.png"])).toEqual([
      "desktop-fixed-ride.png: saved, and the plan does not name it",
      "phone-home-1.png: saved, and the plan does not name it",
    ]);
    expect(planFailures(planFiles(shardPlan(LOOKS, lists)), all).length).toBeGreaterThan(0);
  });
});

describe("writtenSince", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shards-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("names the files written at or after a moment, and neither an older file nor a folder", async () => {
    // A folder used before holds an earlier run's stills, and the MP4s and diffs made from them: none is this run's, and an old
    // still must not stand in for one this run did not take.
    const since = Date.UTC(2026, 10, 23, 12, 0, 0);
    const at = (ms: number) => new Date(since + ms);
    for (const [name, ms] of [["tv-home-2.png", 5000], ["desktop-home-1.png", 0], ["desktop-home.mp4", -1000], ["phone-home-1.png", -60_000]] as [string, number][]) {
      await writeFile(join(dir, name), "x");
      await utimes(join(dir, name), at(ms), at(ms));
    }
    await mkdir(join(dir, "videos"));
    await utimes(join(dir, "videos"), at(5000), at(5000));
    expect((await writtenSince(dir, since)).sort()).toEqual(["desktop-home-1.png", "tv-home-2.png"]);
    expect((await writtenSince(dir, 0)).sort()).toEqual(["desktop-home-1.png", "desktop-home.mp4", "phone-home-1.png", "tv-home-2.png"]);
  });
});

// What SHOOT_PLAN=1 prints: the part of the shoot a process does, as the files it saves.
type Files = { shard: string | null; pages: { device: string; path: string; stills: string[] }[]; recordings: string[]; assets: string[] };

// Runs the shoot's script on plain Node, as the workflow does, with the variables given and no shard, site or plan of this process's.
const runShoot = (variables: Record<string, string>) => {
  const env = { ...process.env, ...variables };
  for (const name of ["SHARD", "SITE_URL", "SHOOT_PLAN"]) if (!(name in variables)) delete env[name];
  return spawnSync(process.execPath, [".github/screenshots/shoot.mjs"], { cwd: ROOT, env, encoding: "utf8" });
};

// The script's own plan for a shard, or for the whole shoot: its real pages, recordings and images.
const plans = new Map<string | undefined, Files>();
const planOf = (shard?: string): Files => {
  if (!plans.has(shard)) {
    const run = runShoot(shard === undefined ? { SHOOT_PLAN: "1" } : { SHOOT_PLAN: "1", SHARD: shard });
    expect(run.status, run.stderr).toBe(0);
    plans.set(shard, JSON.parse(run.stdout) as Files);
  }
  return plans.get(shard)!;
};
const pageKey = ({ device, path, stills }: Files["pages"][number]) => `${device} ${path} ${stills.join(",")}`;
const filesOf = ({ pages, recordings, assets }: Files) => [...pages.flatMap((page) => page.stills), ...recordings, ...assets];
// The page of a plan that takes a still, as its place in the plan's order; -1 when the plan does not take it.
const pageTaking = (plan: Files, still: string) => plan.pages.findIndex((page) => page.stills.includes(still));

describe("the shoot's shards, by the script's own lists", () => {
  it("does the whole shoot with SHARD unset: every device, the recordings and the generated images", () => {
    const whole = planOf();
    expect(whole.shard).toBeNull();
    expect([...new Set(whole.pages.map((page) => page.device))]).toEqual(["desktop", "phone", "tv", "desktop-reduced", "phone-360", "phone-landscape", "desktop-nowebgl", "phone-nowebgl"]);
    expect(whole.pages[0]).toMatchObject({ device: "desktop", path: "/" });
    expect(whole.pages[0].stills.slice(0, 2)).toEqual(["desktop-home-1.png", "desktop-home-2.png"]);
    for (const file of ["desktop-fixed-near-tuning.png", "phone-fixed-crowd-rise-8s.png", "tv-archive-2026-09-end.png", "desktop-reduced-fixed-focus-12.png", "phone-nowebgl-fixed-playing.png", "tv-ride.webm", "desktop-camera-stage.webm", "phone-camera-tower.webm", "desktop-band.webm", "asset-icon.png"]) {
      expect(filesOf(whole), file).toContain(file);
    }
  });

  it("names each shard in what it prints", () => {
    for (const shard of SHARDS) expect(planOf(shard).shard).toBe(shard);
  });

  it("shoots every page of every device, every recording and every generated image in exactly one shard, and nothing else in any", () => {
    const whole = planOf(), parts = SHARDS.map((shard: string) => planOf(shard));
    // No two of the whole shoot's pages are alike, so "exactly one" can be read off their names.
    const keys = whole.pages.map(pageKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(100);
    expect(parts.flatMap((part) => part.pages.map(pageKey)).sort()).toEqual([...keys].sort());
    expect(whole.recordings.length).toBeGreaterThan(0);
    expect(parts.flatMap((part) => part.recordings).sort()).toEqual([...whole.recordings].sort());
    expect(whole.assets.length).toBeGreaterThan(0);
    expect(parts.flatMap((part) => part.assets).sort()).toEqual([...whole.assets].sort());
  });

  it("saves the same files in the three shards as in the whole shoot, each under one name and once", () => {
    // What the screenshot review reads: the three artifacts together hold what the one artifact held.
    const files = filesOf(planOf());
    expect(new Set(files).size).toBe(files.length);
    expect(SHARDS.flatMap((shard: string) => filesOf(planOf(shard))).sort()).toEqual([...files].sort());
  });

  it("shoots each shard's pages in the whole shoot's order", () => {
    const keys = planOf().pages.map(pageKey);
    for (const shard of SHARDS) {
      const mine = planOf(shard).pages.map(pageKey);
      expect(mine, shard).toEqual(keys.filter((key) => mine.includes(key)));
    }
  });

  it("shoots every device but the desktop whole in `rest`, with the recordings and the images, and only the desktop in the other two", () => {
    const whole = planOf(), rest = planOf(REST);
    expect(rest.pages).toEqual(whole.pages.filter((page) => page.device !== SPLIT_DEVICE));
    expect(rest.recordings).toEqual(whole.recordings);
    expect(rest.assets).toEqual(whole.assets);
    for (const shard of [ACTS, LOOKS]) {
      const part = planOf(shard);
      expect(part.pages.length, shard).toBeGreaterThan(0);
      expect(new Set(part.pages.map((page) => page.device)), shard).toEqual(new Set([SPLIT_DEVICE]));
      expect([part.recordings, part.assets], shard).toEqual([[], []]);
    }
  });

  // The desktop's stills that depend on a page shot before theirs, as [the still, a still of the page it depends on, why], read from
  // the one-job runs' logs of 2026-11-23: a state line names the track and the place a play step joined at.
  const NEEDS = [
    ["desktop-fixed-stage-playing.png", "desktop-fixed-space.png", "the stage's play step names no ?at=, and resumes in Space, where the page before it joined the show"],
    ["desktop-fixed-newday-playing.png", "desktop-fixed-crowd-space-20s.png", "the new day's play step resumes in Space too, where the crowd's page stopped"],
    ["desktop-fixed-newday-tapped.png", "desktop-playing.png", "today's page, loaded by the chip, resumes today's show where the home page stopped"],
    ["desktop-fixed-turned.png", "desktop-fixed-newday-tapped.png", "today's page, loaded as the show ends, resumes where its last load stopped"],
    ["desktop-fixed-sleep-playing.png", "desktop-fixed-end.png", "the sleep timer's play step starts at the show's top, the show's end having forgotten the place"],
    ["desktop-fixed-track-failed.png", "desktop-fixed-slept.png", "the track that fails is joined where the sleep timer's page stopped"],
    ["desktop-fixed-shelves-stored.png", "desktop-fixed-shelf-player-away.png", "the HTML arrives with the shelves away because the page before put them away"],
  ];

  it("keeps each desktop page that depends on an earlier one in that page's shard, after it, with the same pages that act between them", () => {
    const whole = planOf(), acts = planOf(ACTS), looks = planOf(LOOKS);
    for (const [still, earlier, why] of NEEDS) {
      // A still that was renamed, or that the shoot no longer takes, is not a failure of the split: the list above is out of date.
      for (const name of [still, earlier]) {
        const fix = `${name} is no still of the shoot now. If it was renamed, give NEEDS, in this test, its new name and keep the pair: ${why}. If the shoot no longer takes it, name another still of the same page, or drop the pair if the dependency is gone.`;
        expect(pageTaking(whole, name), fix).toBeGreaterThanOrEqual(0);
      }
      const [after, before] = [pageTaking(acts, still), pageTaking(acts, earlier)];
      expect(before, `${earlier}: ${why}`).toBeGreaterThanOrEqual(0);
      expect(after, `${still}: ${why}`).toBeGreaterThan(before);
      // The pages between the two in the whole shoot are between them here, bar the ones that only look.
      const between = whole.pages.slice(pageTaking(whole, earlier) + 1, pageTaking(whole, still)).map(pageKey);
      const looking = looks.pages.map(pageKey);
      expect(acts.pages.slice(before + 1, after).map(pageKey), why).toEqual(between.filter((key) => !looking.includes(key)));
    }
    // The shelves' two pages stand next to each other: a page between them would be shot with the shelves away.
    expect(pageTaking(acts, "desktop-fixed-shelves-stored.png")).toBe(pageTaking(acts, "desktop-fixed-shelf-player-away.png") + 1);
  });

  it("shoots the pages that only look apart from those: the stills from a pose, the near stills, the archive and the sweep", () => {
    const looks = planOf(LOOKS);
    for (const still of ["desktop-fixed-stage-slope.png", "desktop-fixed-crowd.png", "desktop-fixed-grove-pines.png", "desktop-fixed-near-tuning.png", "desktop-fixed-stone-cassidy.png", "desktop-archive.png", "desktop-2026-05-10.png"]) {
      expect(pageTaking(looks, still), still).toBeGreaterThanOrEqual(0);
    }
    expect(looks.pages.filter((page) => page.path.includes("pose=sweep") && page.stills.length === 0)).toHaveLength(1);
    for (const [still, earlier] of NEEDS) expect([pageTaking(looks, still), pageTaking(looks, earlier)], still).toEqual([-1, -1]);
  });

  it("stops at a name that is no shard's with a message that says so, before it asks for a site", () => {
    for (const name of ["nope", ""]) {
      const run = runShoot({ SHARD: name });
      expect(run.status, name).toBe(1);
      expect(run.stderr, name).toContain(`SHARD is "${name}", which is no shard of the shoot: it is one of desktop-acts, desktop-looks, rest, or unset for the whole shoot`);
      expect(run.stderr, name).not.toContain("Invalid URL");
      expect(run.stdout, name).toBe("");
    }
  });

  it("shoots what its plan lists, and loops over no list of its own", () => {
    // The loops are the script's, where a merge with another change to it could put a list back: every shard would then shoot or
    // record everything, and pass.
    const script = readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8");
    expect(script).toContain("for (const [device, pages] of plan.pages) {");
    expect(script).toContain("of plan.recordings) {");
    expect(script).toContain("saveAssets(site, plan.assets, outDir)");
    expect(script).not.toMatch(/of Object\.entries\(DEVICES\)|of RECORDINGS\b|PAGES\.filter|saveAssets\(site, ASSETS/);
  });

  it("fails a run whose saved files are not its plan's, by the files written since it began", () => {
    // The check is the script's last word before it prints its failures: left out, or made before the images are saved, a shard that
    // lost a still to a skipped step would pass.
    const script = readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8");
    const began = script.indexOf("const began = Math.floor(Date.now() / 1000) * 1000;");
    const check = script.indexOf("failures.push(...planFailures(planFiles(plan), await writtenSince(outDir, began), perFile.untaken));");
    expect(began).toBeGreaterThan(0);
    // It began before any browser was launched, so before any file was saved.
    expect(script.indexOf("chromium.launch(")).toBeGreaterThan(began);
    expect(check).toBeGreaterThan(script.indexOf("saveAssets(site, plan.assets, outDir)"));
    expect(script.indexOf("for (const failure of failures) console.log(`failure ${failure}`);")).toBeGreaterThan(check);
  });

  it("launches the browser without WebGL only where its plan has a page for one, and closes it only if it did", () => {
    const script = readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8");
    expect(script).toContain("const noWebGL = plan.pages.some(([device]) => NO_WEBGL.has(device)) ? await chromium.launch({");
    expect(script).toContain("await noWebGL?.close();");
    // And the two desktop shards have none, while the rest has both.
    const webglOff = (shard: string) => planOf(shard).pages.filter((page) => page.device.endsWith("-nowebgl")).length;
    expect([webglOff(ACTS), webglOff(LOOKS), webglOff(REST)]).toEqual([0, 0, 2]);
  });

  it("loads the browser's package only once it has a site to shoot, so its plan prints where the package is not installed", () => {
    // The unit tests' job installs the repo's packages and not the shoot's: with the package imported at the script's top, every
    // test here that reads the script's plan would fail there, and pass on a machine that has run the shoot.
    const script = readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8");
    expect(script).not.toMatch(/^import\b.*\bfrom "playwright";?$/m);
    expect(script.indexOf('await import("playwright")')).toBeGreaterThan(script.indexOf("process.exit(0)"));
    expect(script.indexOf("process.exit(0)")).toBeGreaterThan(0);
  });
});

describe("the Screenshots workflow's shards", () => {
  // The workflow without its comments, and the shoot job's steps, each from its "- " to the next one's.
  const workflow = readFileSync(join(ROOT, ".github/workflows/screenshots.yml"), "utf8").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  const steps = workflow.slice(workflow.indexOf("\n    steps:\n")).split("\n      - ").slice(1);
  // The one step a pattern matches, and the shard its `if` holds it to, or undefined when it runs in every shard.
  const stepWith = (pattern: RegExp) => {
    const found = steps.filter((step) => pattern.test(step));
    expect(found, String(pattern)).toHaveLength(1);
    return found[0];
  };
  const shardOf = (step: string) => /^\s*if: .*\bmatrix\.shard == '([^']*)'/m.exec(step)?.[1];
  // The shard that records, by the script's own plan: the only one.
  const recording = () => {
    const found = SHARDS.filter((shard: string) => planOf(shard).recordings.length > 0);
    expect(found).toHaveLength(1);
    return found[0];
  };

  it("lets each job read the repo's contents and nothing else, with no cache and no secrets, each set once for the whole workflow", () => {
    // The next line that is not blank starts a key of its own: a permission after a blank line is still one.
    expect(workflow).toMatch(/^permissions:\n  contents: read\n+(?=\S)/m);
    expect(workflow).toMatch(/^cache-mode: none$/m);
    // A job that set either of its own would run with that instead, its key quoted or not.
    expect(workflow).not.toMatch(/^ +["']?(permissions|cache-mode)["']?:/m);
    expect(workflow).not.toMatch(/\bsecrets\b/);
  });

  it("runs a job for each shard the shoot knows, and no other, none stopping another", () => {
    const matrix = /^      matrix:\n        shard: \[(.*)\]$/m.exec(workflow)?.[1].split(", ");
    expect(matrix).toEqual(SHARDS);
    expect(workflow).toMatch(/^    strategy:\n      fail-fast: false\n      matrix:/m);
  });

  it("hands each job its shard's name as SHARD", () => {
    expect(workflow).toMatch(/^    env:\n      SHARD: \$\{\{ matrix\.shard \}\}$/m);
  });

  it("names a shard the shoot knows wherever a step is held to one", () => {
    // A step held to a misspelt shard would run in no job, and whatever it checks would pass unchecked.
    const named = [...workflow.matchAll(/matrix\.shard\s*[!=]=\s*'([^']*)'/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(SHARDS, name).toContain(name);
    // And the matrix's shard is read nowhere else but for SHARD and the artifact's name.
    expect(workflow.match(/matrix\.shard/g)).toHaveLength(named.length + 2);
  });

  it("shoots, and checks the CDN's files, in every shard", () => {
    expect(shardOf(stepWith(/run: node shoot\.mjs$/m))).toBeUndefined();
    expect(shardOf(stepWith(/name: Check the CDN files' sha384$/m))).toBeUndefined();
  });

  it("compares the reduced-motion stills in the shard that takes them", () => {
    const compare = stepWith(/name: Compare the reduced-motion stills$/m);
    const pages = /for page in ([a-z0-9 -]+); do/.exec(compare)?.[1].split(" ") ?? [];
    expect(pages).toEqual(["home", "fixed-crowd"]);
    const shard = shardOf(compare);
    expect(shard).toBeDefined();
    const taken = planOf(shard).pages.flatMap((page) => page.stills);
    for (const page of pages) for (const n of [1, 2]) {
      expect(compare).toContain(`"$OUT_DIR/desktop-reduced-$page-${n}.png"`);
      expect(taken, `${shard} takes desktop-reduced-${page}-${n}.png`).toContain(`desktop-reduced-${page}-${n}.png`);
    }
  });

  it("fetches ffmpeg, checks it and converts the recordings in the shard that records, and runs no install script in the others", () => {
    const records = recording();
    expect(shardOf(stepWith(/run: npm ci$/m))).toBe(records);
    expect(shardOf(stepWith(/name: Check ffmpeg's sha256$/m))).toBe(records);
    expect(shardOf(stepWith(/name: Convert recordings to MP4$/m))).toBe(records);
    // Every other shard installs too, without the script, and no other step is held to "every shard but one".
    const others = stepWith(/run: npm ci --ignore-scripts$/m);
    expect(others).toMatch(new RegExp(`^if: matrix\\.shard != '${records}'\\n`));
    expect(steps.filter((step) => /matrix\.shard\s*!=/.test(step))).toEqual([others]);
  });

  it("checks the install in one shard, after a failed compare too", () => {
    const install = stepWith(/name: Check the install$/m);
    expect(SHARDS).toContain(shardOf(install));
    expect(install).toMatch(/^\s*if: matrix\.shard == '[^']*' && \(success\(\) \|\| steps\.compare\.outcome == 'failure'\)$/m);
  });

  it("gives each step that another reads by its id that id", () => {
    // The upload after a failed shoot and the artifact's name read steps.shoot, the install check and the upload read
    // steps.compare and steps.install, and the shoot and the install check read the preview's URL from steps.preview: a step
    // without its id reads as empty there, and nothing fails.
    expect(stepWith(/run: node shoot\.mjs$/m)).toMatch(/^\s*id: shoot$/m);
    expect(stepWith(/name: Compare the reduced-motion stills$/m)).toMatch(/^\s*id: compare$/m);
    expect(stepWith(/name: Check the install$/m)).toMatch(/^\s*id: install$/m);
    expect(stepWith(/name: Wait for the preview's URL$/m)).toMatch(/^\s*id: preview$/m);
    const read = [...new Set([...workflow.matchAll(/\bsteps\.([\w-]+)\./g)].map((match) => match[1]))].sort();
    expect(read).toEqual(["compare", "install", "preview", "shoot"]);
    const ids = steps.flatMap((step) => [...step.matchAll(/^\s*id: (\S+)$/gm)].map((match) => match[1])).sort();
    expect(ids).toEqual(read);
  });

  it("shoots into the folder it converts in, compares in and uploads", () => {
    // Each step names the folder itself: one that named another would convert, compare or upload nothing of the shoot's.
    const folder = "${{ runner.temp }}/screenshots";
    expect(/^\s*OUT_DIR: (.*)$/m.exec(stepWith(/run: node shoot\.mjs$/m))?.[1]).toBe(folder);
    expect(/^\s*working-directory: (.*)$/m.exec(stepWith(/name: Convert recordings to MP4$/m))?.[1]).toBe(folder);
    expect(/^\s*OUT_DIR: (.*)$/m.exec(stepWith(/name: Compare the reduced-motion stills$/m))?.[1]).toBe(folder);
    expect(/^\s*path: (.*)$/m.exec(stepWith(/uses: actions\/upload-artifact@/))?.[1]).toBe(folder);
  });

  it("uploads each shard's files as an artifact of its own, after a failed shoot, compare or install check too", () => {
    const upload = stepWith(/uses: actions\/upload-artifact@/);
    // Named for the site and the commit shot: a pull request's run has the merge with main as its github.sha, so its head comes first.
    expect(upload).toMatch(/^\s*name: screenshots-\$\{\{ steps\.shoot\.outputs\.host \}\}-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}-\$\{\{ matrix\.shard \}\}$/m);
    expect(upload).toMatch(/^\s*if: success\(\) \|\| steps\.shoot\.outcome == 'failure' \|\| steps\.compare\.outcome == 'failure' \|\| steps\.install\.outcome == 'failure'$/m);
    expect(shardOf(upload)).toBeUndefined();
    // A shard that failed after it uploaded is run again on its own, and uploads under the same name.
    expect(upload).toMatch(/^\s*overwrite: true$/m);
  });
});
