import { describe, it, expect } from "vitest";
import {
  archiveMonths,
  getArchivePicks,
  getDailyPick,
  getDailyPicksRange,
  getLaunchDate,
} from "../archive";
import { getTodayDateStr } from "../site-day";

describe("getDailyPick", () => {
  it("returns a pick with featured date and show", () => {
    const pick = getDailyPick("2026-02-16");
    expect(pick.featuredDate).toBe("2026-02-16");
    expect(pick.show).toHaveProperty("date");
    expect(pick.show).toHaveProperty("venue");
  });

  it("returns consistent results for the same date", () => {
    const pick1 = getDailyPick("2026-02-16");
    const pick2 = getDailyPick("2026-02-16");
    expect(pick1.show.date).toBe(pick2.show.date);
  });
});

describe("getDailyPicksRange", () => {
  it("returns picks in reverse chronological order", () => {
    const picks = getDailyPicksRange("2026-02-14", "2026-02-16");
    expect(picks).toHaveLength(3);
    expect(picks[0].featuredDate).toBe("2026-02-16");
    expect(picks[1].featuredDate).toBe("2026-02-15");
    expect(picks[2].featuredDate).toBe("2026-02-14");
  });

  it("returns single pick for same start and end", () => {
    const picks = getDailyPicksRange("2026-02-16", "2026-02-16");
    expect(picks).toHaveLength(1);
  });

  it("returns empty array if start is after end", () => {
    const picks = getDailyPicksRange("2026-02-17", "2026-02-16");
    expect(picks).toHaveLength(0);
  });
});

describe("getLaunchDate", () => {
  it("returns a valid date string", () => {
    const date = getLaunchDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getArchivePicks", () => {
  it("runs from launch through yesterday, newest first", () => {
    const picks = getArchivePicks("2026-10-20");
    expect(picks[0].featuredDate).toBe("2026-10-19");
    expect(picks[picks.length - 1].featuredDate).toBe(getLaunchDate());
    expect(picks).toHaveLength(246);
  });

  it("is empty until the launch day is over", () => {
    expect(getArchivePicks(getLaunchDate())).toHaveLength(0);
  });

  it("gains a day at midnight Eastern", () => {
    const before = getArchivePicks(getTodayDateStr(new Date("2026-10-20T03:59:59Z")));
    const after = getArchivePicks(getTodayDateStr(new Date("2026-10-20T04:00:00Z")));
    expect(before[0].featuredDate).toBe("2026-10-18");
    expect(after[0].featuredDate).toBe("2026-10-19");
    expect(after).toHaveLength(before.length + 1);
  });
});

describe("archiveMonths", () => {
  it("groups the picks by featured month, newest first", () => {
    const months = archiveMonths(getArchivePicks("2026-10-20"));
    expect(months.map((month) => month.key)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
      "2026-02",
    ]);
    expect(months.map((month) => month.picks.length)).toEqual([19, 30, 31, 31, 30, 31, 30, 31, 13]);
    expect(months[0].picks[0].featuredDate).toBe("2026-10-19");
    const launchMonth = months[months.length - 1];
    expect(launchMonth.picks[launchMonth.picks.length - 1].featuredDate).toBe(getLaunchDate());
  });

  it("opens the month just closed on the first of a month, and a one-day month on the second", () => {
    const first = archiveMonths(getArchivePicks("2026-11-01"));
    expect(first[0].key).toBe("2026-10");
    expect(first[0].picks).toHaveLength(31);

    const second = archiveMonths(getArchivePicks("2026-11-02"));
    expect(second[0].key).toBe("2026-11");
    expect(second[0].picks.map((pick) => pick.featuredDate)).toEqual(["2026-11-01"]);
    expect(second[1].key).toBe("2026-10");
    expect(second[1].picks).toHaveLength(31);
  });

  it("has no months with no picks", () => {
    expect(archiveMonths([])).toEqual([]);
  });
});
