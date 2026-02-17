import { describe, it, expect } from "vitest";
import { formatDuration, formatDate, formatRating } from "../format";

describe("formatDuration", () => {
  it("formats seconds to mm:ss", () => {
    expect(formatDuration(342)).toBe("5:42");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(5)).toBe("0:05");
  });

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("handles zero/invalid", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-1)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats ISO date to readable string", () => {
    expect(formatDate("1977-05-08")).toBe("May 8, 1977");
    expect(formatDate("1995-07-09")).toBe("July 9, 1995");
  });
});

describe("formatRating", () => {
  it("rounds to one decimal", () => {
    expect(formatRating(9.570934)).toBe("9.6");
    expect(formatRating(8.0)).toBe("8.0");
  });
});
