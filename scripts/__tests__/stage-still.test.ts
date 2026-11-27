import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import pickSchedule from "../../data/pick-schedule.json";
import showCatalog from "../../data/shows.json";
import { bandPose } from "../../.github/screenshots/band.mjs";
import { stagePages, WALL_DAYS } from "../../.github/screenshots/stage.mjs";
import { lineupOn } from "../../public/world/lineup.js";
import { stageOn } from "../../public/world/stage.js";
import { showDateFor } from "../../src/lib/pick-schedule";

// The stage's stills on a day of the Wall of Sound (.github/screenshots/stage.mjs): the day's show must stand on the Wall, and the shoot
// must take them, or the screenshot review reads 1974's stage nowhere.

const ROOT = join(__dirname, "..", "..");
const venue = (show: string) => showCatalog.find((s) => s.date === show)!;
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

describe("the Wall of Sound's stills", () => {
  it("is taken on 2027-06-13, whose show, 1974-07-19 at Selland Arena in Fresno, stands on the Wall with the six of 1972 to 1974", () => {
    expect(WALL_DAYS).toEqual([{ day: "2027-06-13", show: "1974-07-19", shot: "1974-07-19-wall" }]);
    for (const { day, show } of WALL_DAYS) {
      expect([day, showDateFor(pickSchedule, day)]).toEqual([day, show]);
      expect([show, stageOn(show).stage, venue(show).venue]).toEqual([show, "wall", "Selland Arena"]);
    }
    expect(lineupOn("1974-07-19").roles).toEqual(["lead", "rhythm", "bass", "drums", "piano", "voice"]);
  });

  it("is the schedule's first day from its rotation's start whose show stands on the Wall in North America: the one before it is of the European tour", () => {
    const wall: string[] = [];
    for (let day = pickSchedule.rotationStart; day <= "2027-06-13"; day = dayAfter(day)) if (stageOn(showDateFor(pickSchedule, day)).stage === "wall") wall.push(day);
    expect(wall.map((day) => [day, venue(showDateFor(pickSchedule, day)).location])).toEqual([
      ["2027-02-16", "Dijon, France"],
      ["2027-06-13", "Fresno, CA, USA"],
    ]);
  });

  it("shoots the stage from the back of the crowd, from among it and from the front, where the band's stills stand, on a desktop and on a phone, and the shoot's plan takes each", () => {
    expect(stagePages()).toEqual([
      { path: "/2027-06-13?pose=crowd", devices: ["desktop", "phone"], shots: ["1974-07-19-wall-crowd"] },
      { path: "/2027-06-13?pose=among", devices: ["desktop", "phone"], shots: ["1974-07-19-wall-among"] },
      ...["desktop", "phone"].map((device) => {
        const { x, z, heading, pitch } = bandPose(device);
        return { path: `/2027-06-13?pose=${x},${z},${heading},${pitch}`, devices: [device], whole: true, shots: ["1974-07-19-wall-front"] };
      }),
    ]);
    const env: NodeJS.ProcessEnv = { ...process.env, SHOOT_PLAN: "1" };
    for (const name of ["SHARD", "SITE_URL"]) delete env[name];
    const run = spawnSync(process.execPath, [".github/screenshots/shoot.mjs"], { cwd: ROOT, env, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const stills = (JSON.parse(run.stdout) as { pages: { stills: string[] }[] }).pages.flatMap((page) => page.stills);
    for (const device of ["desktop", "phone"]) for (const shot of ["crowd", "among", "front"]) {
      expect(stills.filter((still) => still === `${device}-1974-07-19-wall-${shot}.png`)).toHaveLength(1);
    }
    expect(stills.filter((still) => still.includes("-wall-"))).toHaveLength(6);
    expect(readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8")).toContain("...stagePages(),");
  });
});
