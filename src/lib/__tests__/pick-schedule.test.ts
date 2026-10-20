import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import pickSchedule from "../../../data/pick-schedule.json";
import showCatalog from "../../../data/shows.json";
import { getArchivePicks } from "../archive";
import { getDailyShow } from "../daily-show";
import {
  addToRotation,
  firstRepeatIndex,
  placeNewShows,
  showDateFor,
  type PickSchedule,
} from "../pick-schedule";

const schedule: PickSchedule = pickSchedule;
const openingPicks: Record<string, string> = pickSchedule.openingPicks;
const { rotationStart, rotation, skipped } = pickSchedule;
const catalogDates = showCatalog.map((show) => show.date);
const featured = new Set(Object.values(openingPicks));
const firstRepeatDay = addDays(rotationStart, firstRepeatIndex(schedule));

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

describe("the pick schedule", () => {
  it("has an opening pick for every day the archive lists when the rotation starts", () => {
    const days = getArchivePicks(rotationStart).map((pick) => pick.featuredDate);
    expect(Object.keys(openingPicks)).toEqual(days.reverse());
  });

  it("keeps the opening picks as the site served them", () => {
    expect(sha256(openingPicks)).toBe(
      "fb88cb9005661bde683cb7cc3a1746add07b5c4475e494c88303914616d0659a"
    );
  });

  it("keeps the order of the rotation's first 1,825 shows", () => {
    expect(sha256(rotation.slice(0, 1825))).toBe(
      "fdb2a0ef606d23b568cc6cc37ac430b3a38c65232791cd86400e3ed9e4caf73b"
    );
  });

  it("keeps the order of the whole rotation", () => {
    // New shows go in at the first repeat, so a refresh that adds some changes
    // this pin and the first-repeat index, never the pin above.
    expect(sha256(rotation)).toBe(
      "1211c1ab2f4b2936c80b325f1e77587e5b3ef609c2dc9460e0d4aaeae18cbdcd"
    );
  });

  it("starts with the 1,825 shows no opening pick featured", () => {
    expect(firstRepeatIndex(schedule)).toBe(1825);
  });

  it("accounts for every catalog show once, in the rotation or skipped", () => {
    const scheduled = [...rotation, ...skipped.map((entry) => entry.show)];
    expect(scheduled.sort()).toEqual([...catalogDates].sort());
  });

  it("brings back a show the opening picks featured only after every other show", () => {
    const returning = rotation.slice(firstRepeatIndex(schedule));
    expect(returning.filter((show) => !featured.has(show))).toEqual([]);
  });

  it("has a recording for every show in the rotation", () => {
    const silent = new Set(
      showCatalog.filter((show) => show.sourceCount === 0).map((show) => show.date)
    );
    expect(rotation.filter((show) => silent.has(show))).toEqual([]);
  });

  it("gives every skipped show a reason", () => {
    expect(skipped.filter((entry) => entry.reason.trim() === "")).toEqual([]);
  });

  it("names only catalog shows among the opening picks", () => {
    const inCatalog = new Set(catalogDates);
    expect(Object.values(openingPicks).filter((show) => !inCatalog.has(show))).toEqual([]);
  });

  it("hands over to the rotation after the last opening pick and starts it over at the end", () => {
    const lastOpeningDay = addDays(rotationStart, -1);
    expect(getDailyShow(lastOpeningDay).date).toBe(openingPicks[lastOpeningDay]);
    expect(getDailyShow(rotationStart).date).toBe(rotation[0]);
    expect(getDailyShow(addDays(rotationStart, 1)).date).toBe(rotation[1]);
    expect(getDailyShow(addDays(rotationStart, rotation.length - 1)).date).toBe(
      rotation[rotation.length - 1]
    );
    expect(getDailyShow(addDays(rotationStart, rotation.length)).date).toBe(rotation[0]);
  });

  it("gives a date before launch one of the opening picks", () => {
    expect(Object.values(openingPicks)).toContain(getDailyShow("1999-12-31").date);
  });
});

describe("addToRotation", () => {
  it("adds a new show just before the first repeat and moves no date before it", () => {
    const next = addToRotation(schedule, ["2099-01-01"], "2026-10-20");
    expect(next.rotation).toHaveLength(rotation.length + 1);
    expect(showDateFor(next, firstRepeatDay)).toBe("2099-01-01");
    const moved: string[] = [];
    for (let day = "2026-01-01"; day < firstRepeatDay; day = addDays(day, 1)) {
      if (showDateFor(next, day) !== showDateFor(schedule, day)) moved.push(day);
    }
    expect(moved).toEqual([]);
  });

  it("keeps the shows the opening picks featured last, right after the new show", () => {
    const next = addToRotation(schedule, ["2099-01-01"], "2026-10-20");
    // Found here rather than with firstRepeatIndex, so a wrong firstRepeatIndex can't pass.
    const firstFeatured = next.rotation.findIndex((show) => featured.has(show));
    expect(next.rotation[firstFeatured - 1]).toBe("2099-01-01");
    expect(next.rotation.slice(firstFeatured).filter((show) => !featured.has(show))).toEqual([]);
  });

  it("refuses once the rotation has reached its first repeat", () => {
    expect(() => addToRotation(schedule, ["2099-01-01"], firstRepeatDay)).toThrow();
  });
});

describe("placeNewShows", () => {
  it("puts a show new to the catalog in the rotation, where addToRotation places it", () => {
    const { schedule: next, added } = placeNewShows(
      schedule,
      [...catalogDates, "2099-01-01"],
      "2026-10-20"
    );
    expect(added).toEqual(["2099-01-01"]);
    // addToRotation's tests show that this moves no date before the first repeat.
    expect(next).toEqual(addToRotation(schedule, added, "2026-10-20"));
  });

  it("leaves the schedule as it is when nothing is new, even after the first repeat", () => {
    const { schedule: next, added } = placeNewShows(schedule, catalogDates, firstRepeatDay);
    expect(added).toEqual([]);
    expect(next).toEqual(schedule);
  });
});
