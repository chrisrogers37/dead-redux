import { execFileSync, spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, describe, expect, it } from "vitest";

// This commit's copy of the check. CI runs the copy on a pull request's base, so a change to the check is tried here before it applies.
const CHECK = join(__dirname, "../maps-scope.sh");

// The Maps workflow's commits are the bot's. A person's are anyone's: the check never reads either.
const BOT = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";
const PERSON = "Someone <someone@example.test>";

// git as a throwaway repository sees it: none of the machine's or the user's configuration, and no GIT_ variable from outside, which
// could point it at another repository. Its commits are committed by the bot, and authored by it unless a commit names another author.
const ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
};

const HEADING = "Commits from maps may only add or change maps (public/maps/YYYY-MM-DD.json), with one parent each. These do not:";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// What a commit changes: files to write, null for each to delete, or a change made in the tree by hand.
type Change = Record<string, string | null> | ((dir: string) => void);

// A throwaway repository: main with a page, the check and a map; maps off it with a new map and a map made again from another
// recording; then main moved on by a pull request of its own.
function site() {
  const dir = mkdtempSync(join(tmpdir(), "maps-scope-"));
  made.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env: ENV, encoding: "utf8" }).trim();
  // Makes the change and commits everything in the tree.
  const commit = (message: string, change: Change = {}, author = BOT) => {
    if (typeof change === "function") {
      change(dir);
    } else {
      for (const [path, text] of Object.entries(change)) {
        if (text === null) {
          rmSync(join(dir, path));
        } else {
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), text);
        }
      }
    }
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "--author", author, "-m", message);
    return git("rev-parse", "HEAD");
  };
  // The check on a pull request into main.
  const check = (head: string, maps = "refs/heads/maps") => {
    const run = spawnSync("bash", [CHECK, "main", head, maps], { cwd: dir, env: ENV, encoding: "utf8" });
    return { status: run.status, out: run.stdout, err: run.stderr };
  };
  git("init", "-q", "-b", "main");
  commit("site", { "src/app/page.tsx": "page 1\n", "scripts/maps-scope.sh": "the check\n", "public/maps/1977-05-08.json": "{\"v\":1}\n" }, PERSON);
  git("checkout", "-q", "-b", "maps");
  commit("maps: add 1972-08-27", { "public/maps/1972-08-27.json": "{}\n" });
  commit("maps: add 1977-05-08", { "public/maps/1977-05-08.json": "{\"v\":2}\n" });
  git("checkout", "-q", "main");
  commit("world: a change", { "src/app/page.tsx": "page 2\n" }, PERSON);
  return {
    dir,
    git,
    commit,
    check,
    // One more commit on maps; the tree is left at main.
    onMaps(message: string, change: Change = {}, author = BOT) {
      git("checkout", "-q", "maps");
      const sha = commit(message, change, author);
      git("checkout", "-q", "main");
      return sha;
    },
    // A pull request of its own, off main.
    feature(files: Record<string, string | null>, author = PERSON) {
      git("checkout", "-q", "-b", "feature", "main");
      const sha = commit("player: a change", files, author);
      git("checkout", "-q", "main");
      return sha;
    },
    // The weekly pull request: a branch off main that merges maps with a merge commit.
    weekly() {
      git("checkout", "-q", "-b", "weekly", "main");
      git("merge", "-q", "--no-ff", "-m", "maps: add the maps of 2 shows", "maps");
      const sha = git("rev-parse", "HEAD");
      git("checkout", "-q", "main");
      return sha;
    },
  };
}

describe("the maps scope check", () => {
  it("passes a pull request that brings no commit from maps", () => {
    const repo = site();
    expect(repo.check(repo.feature({ "src/app/page.tsx": "page 3\n" }))).toEqual({ status: 0, out: "No commit comes from maps.\n", err: "" });
  });

  it("passes a pull request from maps whose commits only add or change maps", () => {
    const repo = site();
    expect(repo.check(repo.git("rev-parse", "maps"))).toEqual({ status: 0, out: "Commits from maps: 2. Each only adds or changes maps.\n", err: "" });
  });

  it("passes the weekly pull request, whose merge brings maps' new commits", () => {
    const repo = site();
    expect(repo.check(repo.weekly())).toEqual({ status: 0, out: "Commits from maps: 2. Each only adds or changes maps.\n", err: "" });
  });

  it("passes when there is no maps branch, and says so", () => {
    const repo = site();
    const head = repo.weekly();
    repo.git("branch", "-q", "-D", "maps");
    expect(repo.check(head)).toEqual({
      status: 0,
      out: "There is no maps branch at refs/heads/maps, so no commit comes from it.\n",
      err: "",
    });
  });

  describe("with a stray path on maps", () => {
    it("fails a pull request from maps, listing the commit and the path", () => {
      const repo = site();
      const stray = repo.onMaps("maps: add 1990-03-29", { "public/maps/1990-03-29.json": "{}\n", "src/app/page.tsx": "page 4\n" });
      expect(repo.check(stray)).toEqual({ status: 1, out: `${HEADING}\n  ${stray} changes src/app/page.tsx\n`, err: "" });
    });

    it("fails the weekly pull request that brings it among maps", () => {
      const repo = site();
      const stray = repo.onMaps("maps: add 1990-03-29", { "public/maps/1990-03-29.html": "<p>a page</p>\n" });
      repo.onMaps("maps: add 1991-06-14", { "public/maps/1991-06-14.json": "{}\n" });
      expect(repo.check(repo.weekly())).toEqual({ status: 1, out: `${HEADING}\n  ${stray} adds public/maps/1990-03-29.html\n`, err: "" });
    });

    it("passes a pull request that does not bring it", () => {
      const repo = site();
      repo.onMaps("maps: add 1990-03-29", { "src/app/page.tsx": "page 4\n" });
      expect(repo.check(repo.feature({ "src/app/page.tsx": "page 3\n" }))).toEqual({ status: 0, out: "No commit comes from maps.\n", err: "" });
    });
  });

  // Each stray change, made by one more commit on maps, which a pull request from maps brings.
  it.each<[string, Change, string]>([
    ["adding a file outside public/maps", { "src/app/other.ts": "x\n" }, "adds src/app/other.ts"],
    ["changing the check itself", { "scripts/maps-scope.sh": "exit 0\n" }, "changes scripts/maps-scope.sh"],
    ["adding a file to public/maps named as no map is", { "public/maps/1977-5-8.json": "{}\n" }, "adds public/maps/1977-5-8.json"],
    ["adding a file named as a map with more after it", { "public/maps/1977-05-09.json.html": "<p>\n" }, "adds public/maps/1977-05-09.json.html"],
    ["adding a map's path inside another folder", { "src/public/maps/1977-05-09.json": "{}\n" }, "adds src/public/maps/1977-05-09.json"],
    ["adding a map in a folder", { "public/maps/1977/05-08.json": "{}\n" }, "adds public/maps/1977/05-08.json"],
    ["deleting a map", { "public/maps/1977-05-08.json": null }, "deletes public/maps/1977-05-08.json"],
    [
      "renaming a map, which deletes it and adds another",
      { "public/maps/1977-05-08.json": null, "public/maps/1977-05-09.json": "{\"v\":2}\n" },
      "deletes public/maps/1977-05-08.json",
    ],
    [
      "adding a map that is a link",
      (dir) => symlinkSync("../../src/app/page.tsx", join(dir, "public/maps/1990-03-29.json")),
      "adds public/maps/1990-03-29.json, as mode 120000",
    ],
    ["making a map executable", (dir) => chmodSync(join(dir, "public/maps/1977-05-08.json"), 0o755), "changes public/maps/1977-05-08.json, as mode 100755"],
  ])("fails a commit from maps %s", (_, change, listed) => {
    const repo = site();
    const stray = repo.onMaps("maps: add 1990-03-29", change);
    expect(repo.check(stray)).toEqual({ status: 1, out: `${HEADING}\n  ${stray} ${listed}\n`, err: "" });
  });

  it("fails a merge on maps' side, which it lists without reading what the merge brings", () => {
    const repo = site();
    repo.git("checkout", "-q", "maps");
    repo.git("merge", "-q", "--no-ff", "-m", "Merge main into maps", "main");
    const merge = repo.git("rev-parse", "HEAD");
    repo.git("checkout", "-q", "main");
    expect(repo.check(repo.weekly())).toEqual({ status: 1, out: `${HEADING}\n  ${merge} has 2 parents\n`, err: "" });
  });

  it("fails a commit from maps with no parent, and passes a pull request that shares no history with such a branch", () => {
    const repo = site();
    repo.git("checkout", "-q", "--orphan", "maps-anew");
    const root = repo.commit("maps: add 1990-03-29", { "public/maps/1990-03-29.json": "{}\n" });
    repo.git("checkout", "-q", "main");
    repo.git("branch", "-q", "-D", "maps");
    repo.git("branch", "-q", "-m", "maps-anew", "maps");
    expect(repo.check(root)).toEqual({ status: 1, out: `${HEADING}\n  ${root} has 0 parents\n`, err: "" });
    expect(repo.check(repo.feature({ "src/app/page.tsx": "page 3\n" }))).toEqual({ status: 0, out: "No commit comes from maps.\n", err: "" });
  });

  it("knows a commit from maps by where it is, not by its author", () => {
    const repo = site();
    // A person's commit on maps is from maps.
    const stray = repo.onMaps("maps: add 1990-03-29", { "src/app/other.ts": "x\n" }, PERSON);
    expect(repo.check(repo.weekly())).toEqual({ status: 1, out: `${HEADING}\n  ${stray} adds src/app/other.ts\n`, err: "" });
    // The bot's commit off main is not.
    expect(repo.check(repo.feature({ "src/app/page.tsx": "page 3\n" }, BOT))).toEqual({ status: 0, out: "No commit comes from maps.\n", err: "" });
  });

  it("fails, with nothing checked, for a head that is not a commit", () => {
    const repo = site();
    expect(repo.check("no-such-commit")).toEqual({ status: 2, out: "", err: "Not a commit: no-such-commit\n" });
  });
});
