import { describe, it, expect } from "vitest";
import { formatDuration, formatDate, formatRating, notesToLines, stripTrackNumber } from "../format";

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

  it("leaves a partial date as written", () => {
    expect(formatDate("1977-XX-XX")).toBe("1977-XX-XX");
  });
});

describe("stripTrackNumber", () => {
  it("drops a leading track number", () => {
    expect(stripTrackNumber("01 Tuning")).toBe("Tuning");
    expect(stripTrackNumber("1. Jack Straw")).toBe("Jack Straw");
    expect(stripTrackNumber("12 - Morning Dew")).toBe("Morning Dew");
  });

  it("leaves other titles as written", () => {
    expect(stripTrackNumber("Tuning")).toBe("Tuning");
    expect(stripTrackNumber("4th Of July")).toBe("4th Of July");
    expect(stripTrackNumber("1977 Jam")).toBe("1977 Jam");
  });
});

describe("notesToLines", () => {
  it("ends a line at each <br /> and drops other tags", () => {
    expect(
      notesToLines('<div class="set_info">Set 1</div><br />Jack Straw, <b>Deal</b><br/><br>Set 2')
    ).toEqual(["Set 1", "Jack Straw, Deal", "Set 2"]);
  });

  it("ends a line at each newline and leaves out blank lines", () => {
    expect(notesToLines("Set 1\n\nJack Straw, Deal\r\n")).toEqual(["Set 1", "Jack Straw, Deal"]);
  });
});

describe("formatRating", () => {
  it("rounds to one decimal", () => {
    expect(formatRating(9.570934)).toBe("9.6");
    expect(formatRating(8.0)).toBe("8.0");
  });
});
