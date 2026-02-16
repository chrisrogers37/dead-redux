import { describe, it, expect } from "vitest";
import {
  getDailyShow,
  isValidDateStr,
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

  it("returns the same show for the same date", () => {
    const show1 = getDailyShow("2026-02-16");
    const show2 = getDailyShow("2026-02-16");
    expect(show1.date).toBe(show2.date);
    expect(show1.venue).toBe(show2.venue);
  });

  it("returns different shows for different dates", () => {
    const show1 = getDailyShow("2026-02-16");
    const show2 = getDailyShow("2026-02-17");
    // Technically could collide, but extremely unlikely with 2000+ shows
    expect(show1.date).not.toBe(show2.date);
  });

  it("returns a show for any arbitrary date", () => {
    const show = getDailyShow("1999-12-31");
    expect(show).toHaveProperty("date");
    expect(show).toHaveProperty("venue");
  });
});

describe("isValidDateStr", () => {
  it("accepts valid date strings", () => {
    expect(isValidDateStr("2026-02-16")).toBe(true);
    expect(isValidDateStr("1977-05-08")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidDateStr("not-a-date")).toBe(false);
    expect(isValidDateStr("2026/02/16")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});

describe("getShowCount", () => {
  it("returns a reasonable number of shows", () => {
    const count = getShowCount();
    expect(count).toBeGreaterThan(2000);
    expect(count).toBeLessThan(3000);
  });
});
