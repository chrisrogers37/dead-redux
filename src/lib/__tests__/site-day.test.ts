import { describe, it, expect } from "vitest";
import { afterShow, getTodayDateStr, newDay, pastPickDay } from "../site-day";

describe("getTodayDateStr", () => {
  it("turns the day over at midnight Eastern, not UTC", () => {
    expect(getTodayDateStr(new Date("2026-10-20T03:59:59Z"))).toBe("2026-10-19");
    expect(getTodayDateStr(new Date("2026-10-20T04:00:00Z"))).toBe("2026-10-20");
  });

  it("follows daylight saving time when it starts", () => {
    // 2026-03-08 begins at midnight EST (05:00Z); 2026-03-09 at midnight EDT (04:00Z).
    expect(getTodayDateStr(new Date("2026-03-08T04:59:59Z"))).toBe("2026-03-07");
    expect(getTodayDateStr(new Date("2026-03-08T05:00:00Z"))).toBe("2026-03-08");
    expect(getTodayDateStr(new Date("2026-03-09T03:59:59Z"))).toBe("2026-03-08");
    expect(getTodayDateStr(new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09");
  });

  it("follows daylight saving time when it ends", () => {
    // Clocks fall back on 2026-11-01, so 2026-11-02 begins at midnight EST (05:00Z).
    expect(getTodayDateStr(new Date("2026-11-02T04:59:59Z"))).toBe("2026-11-01");
    expect(getTodayDateStr(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });
});

describe("newDay", () => {
  it("is null until midnight Eastern, then the new day", () => {
    expect(newDay("2026-10-19", new Date("2026-10-20T03:59:59Z"))).toBe(null);
    expect(newDay("2026-10-19", new Date("2026-10-20T04:00:00Z"))).toBe("2026-10-20");
  });

  it("turns at midnight on the nights the clocks change", () => {
    // Clocks spring forward on 2026-03-08: that day begins at 05:00Z, the next at 04:00Z.
    expect(newDay("2026-03-07", new Date("2026-03-08T04:59:59Z"))).toBe(null);
    expect(newDay("2026-03-07", new Date("2026-03-08T05:00:00Z"))).toBe("2026-03-08");
    expect(newDay("2026-03-08", new Date("2026-03-09T03:59:59Z"))).toBe(null);
    expect(newDay("2026-03-08", new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09");
    // Clocks fall back on 2026-11-01, so 2026-11-02 begins at 05:00Z.
    expect(newDay("2026-11-01", new Date("2026-11-02T04:59:59Z"))).toBe(null);
    expect(newDay("2026-11-01", new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });
});

describe("pastPickDay", () => {
  const launch = "2026-02-16";

  it("offers nothing on the launch day", () => {
    expect(pastPickDay(launch, launch, launch, 0.5)).toBe(null);
  });

  it("runs from launch through yesterday on today's page", () => {
    expect(pastPickDay(launch, "2026-02-17", "2026-02-17", 0)).toBe("2026-02-16");
    expect(pastPickDay(launch, "2026-02-26", "2026-02-26", 0)).toBe("2026-02-16");
    expect(pastPickDay(launch, "2026-02-26", "2026-02-26", 0.999)).toBe("2026-02-25");
    expect(pastPickDay(launch, "2026-02-26", "2026-02-26", 1)).toBe("2026-02-25");
  });

  it("never offers a dated page its own day, and reaches every other", () => {
    const days = Array.from({ length: 9 }, (_, i) => pastPickDay(launch, "2026-02-26", "2026-02-20", (i + 0.5) / 9));
    expect(days).toEqual([
      "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-21", "2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25",
    ]);
    // 0.45 falls on the page's own day in a range that kept it; the skip moves it on by one.
    expect(pastPickDay(launch, "2026-02-26", "2026-02-20", 0.45)).toBe("2026-02-21");
  });

  it("skips nothing for a page dated before launch or after today", () => {
    expect(pastPickDay(launch, "2026-02-18", "2025-12-31", 0.5)).toBe("2026-02-17");
    expect(pastPickDay(launch, "2026-02-18", "2025-12-31", 0)).toBe("2026-02-16");
    expect(pastPickDay(launch, "2026-02-18", "2026-12-25", 0)).toBe("2026-02-16");
  });
});

describe("afterShow", () => {
  it("plays the new day's show once the day has turned, ahead of any past pick", () => {
    expect(afterShow("2026-10-19", new Date("2026-10-20T04:00:00Z"), "2026-03-01")).toEqual({ kind: "day", day: "2026-10-20" });
  });

  it("offers the past pick while the day has not turned", () => {
    expect(afterShow("2026-10-19", new Date("2026-10-20T03:59:59Z"), "2026-03-01")).toEqual({ kind: "past", day: "2026-03-01" });
  });

  it("offers nothing with no past pick on a day that has not turned", () => {
    expect(afterShow("2026-10-19", new Date("2026-10-20T03:59:59Z"), null)).toBe(null);
  });
});
