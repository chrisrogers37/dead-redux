import { describe, it, expect } from "vitest";
import { isShowDate } from "../../../public/world/maps.js";
import {
  getDailyShow,
  isValidDateStr,
  isCatalogShow,
  getShowCount,
} from "../daily-show";

describe("getDailyShow", () => {
  it("returns a show with expected fields", () => {
    const show = getDailyShow("2026-02-16");
    expect(show).toHaveProperty("date");
    expect(show).toHaveProperty("venue");
    expect(show).toHaveProperty("location");
    expect(show.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a show for any arbitrary date", () => {
    const show = getDailyShow("1999-12-31");
    expect(show).toHaveProperty("date");
    expect(show).toHaveProperty("venue");
  });

  it("keeps the show the site featured on each day", () => {
    expect(getDailyShow("2026-02-16").date).toBe("1970-03-07"); // Santa Monica Civic Auditorium
    expect(getDailyShow("2026-03-01").date).toBe("1992-06-29"); // Deer Creek Music Center
    expect(getDailyShow("2026-10-19").date).toBe("1987-03-27"); // Hartford Civic Center
    expect(getDailyShow("2026-10-20").date).toBe("1986-07-04"); // Rich Stadium
  });
});

// The date rule exists twice: the site's isValidDateStr and the world's isShowDate
// (public/world/maps.js), which do not import each other. One table holds both to it,
// a day its month does not have included, which Date.parse would roll into the next month.
const DATE_RULES: { name: string; rule: (value: string) => boolean }[] = [
  { name: "isValidDateStr", rule: isValidDateStr },
  { name: "isShowDate", rule: isShowDate },
];

describe.each(DATE_RULES)("the date rule, as $name holds it", ({ rule }) => {
  it.each<[string, boolean]>([
    ["1977-05-08", true],
    ["2026-02-16", true],
    ["1988-02-29", true],
    ["2000-02-29", true],
    ["1986-02-29", false],
    ["1986-02-30", false],
    ["1986-04-31", false],
    ["1900-02-29", false],
    ["1986-13-01", false],
    ["1986-00-10", false],
    ["not-a-date", false],
    ["2026/02/16", false],
    ["", false],
  ])("judges %j %s", (date, accepted) => {
    expect(rule(date)).toBe(accepted);
  });

  it("refuses an expanded year, which Date.parse reads back as itself", () => {
    expect(new Date(Date.parse("+010000-01")).toISOString().slice(0, 10)).toBe("+010000-01");
    expect(rule("+010000-01")).toBe(false);
    expect(rule("-000001-01")).toBe(false);
  });

  // Each zone's offset on the date, so a zone that did not take is a failure, not a pass.
  it.each<[string, number]>([
    ["America/Los_Angeles", 480],
    ["Pacific/Pago_Pago", 660],
    ["Asia/Kolkata", -330],
  ])("reads the date in UTC, so it holds in %s", (zone, offset) => {
    const saved = process.env.TZ;
    process.env.TZ = zone;
    try {
      expect(new Date(Date.parse("1988-02-29")).getTimezoneOffset()).toBe(offset);
      expect(rule("1988-02-29")).toBe(true);
      expect(rule("1986-02-30")).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe("isCatalogShow", () => {
  it("accepts the date of a show in the catalog", () => {
    expect(isCatalogShow("1986-07-04")).toBe(true);
  });

  it("rejects a date with no show in the catalog, and a show date not written YYYY-MM-DD", () => {
    expect(isCatalogShow("1986-07-05")).toBe(false);
    expect(isCatalogShow("2001-01-01")).toBe(false);
    expect(isCatalogShow("1986-7-4")).toBe(false);
  });
});

describe("getShowCount", () => {
  it("returns a reasonable number of shows", () => {
    const count = getShowCount();
    expect(count).toBeGreaterThan(2000);
    expect(count).toBeLessThan(3000);
  });
});
