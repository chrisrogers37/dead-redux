import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatDate,
  formatMonthDay,
  formatRating,
  isPlaceholderTitle,
  notesToLines,
  stripTrackNumber,
  toPlainText,
} from "../format";

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
    expect(stripTrackNumber("01-Little Red Rooster")).toBe("Little Red Rooster");
    expect(stripTrackNumber("05 - 900,000 Tons of Steel")).toBe("900,000 Tons of Steel");
    expect(stripTrackNumber("101 Jack Straw")).toBe("Jack Straw");
    expect(stripTrackNumber("8) Beat It On Down the Line")).toBe("Beat It On Down the Line");
    expect(stripTrackNumber("12- Morning Dew")).toBe("Morning Dew");
    expect(stripTrackNumber("12 -Tuning")).toBe("Tuning");
    expect(stripTrackNumber("18 (I Can't Get No) Satisfaction")).toBe("(I Can't Get No) Satisfaction");
  });

  it("leaves other titles as written", () => {
    expect(stripTrackNumber("Tuning")).toBe("Tuning");
    expect(stripTrackNumber("4th Of July")).toBe("4th Of July");
    expect(stripTrackNumber("1977 Jam")).toBe("1977 Jam");
    expect(stripTrackNumber("900,000 Tons of Steel")).toBe("900,000 Tons of Steel");
    expect(stripTrackNumber("4-26-69d1t01.mp3")).toBe("4-26-69d1t01.mp3");
    expect(stripTrackNumber("1.5 Hours")).toBe("1.5 Hours");
  });
});

describe("isPlaceholderTitle", () => {
  it("recognizes an audio file's name", () => {
    expect(isPlaceholderTitle("4-26-69d1t01.mp3")).toBe(true);
    expect(isPlaceholderTitle("gd72_09_10.sbdsbdpatch_d3_t09.mp3")).toBe(true);
    expect(isPlaceholderTitle("gd1984-02-21t01.mp3")).toBe(true);
    expect(isPlaceholderTitle("gd1985-06-30s1t01.flac")).toBe(true);
    expect(isPlaceholderTitle("gd77-05-08d2t03.shn")).toBe(true);
    expect(isPlaceholderTitle("GD77-05-08D2T03.MP3")).toBe(true);
    expect(isPlaceholderTitle("4-26-69d1t01.mp3 ")).toBe(true);
  });

  it("recognizes a bare track number", () => {
    expect(isPlaceholderTitle("Track 1")).toBe(true);
    expect(isPlaceholderTitle("Track 43")).toBe(true);
    expect(isPlaceholderTitle("track 07")).toBe(true);
  });

  it("leaves song titles alone, including ones written with dots", () => {
    expect(isPlaceholderTitle("Dupree's Diamond Blues")).toBe(false);
    expect(isPlaceholderTitle("Mountains Of The Moon >")).toBe(false);
    expect(isPlaceholderTitle("C.C.Rider")).toBe(false);
    expect(isPlaceholderTitle("U.S.Blues")).toBe(false);
    expect(isPlaceholderTitle("Johnny B.Goode")).toBe(false);
    expect(isPlaceholderTitle("St. Stephen")).toBe(false);
    expect(isPlaceholderTitle("mp3")).toBe(false);
    expect(isPlaceholderTitle("Track")).toBe(false);
    expect(isPlaceholderTitle("Tracks Of My Tears")).toBe(false);
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

  it("ends a line at a <br> with attributes or in capitals", () => {
    expect(notesToLines('Set 1<br style="color:red" />Jack')).toEqual(["Set 1", "Jack"]);
    expect(notesToLines("Set 1<BR>Jack Straw")).toEqual(["Set 1", "Jack Straw"]);
  });

  it("decodes entities in each line", () => {
    expect(notesToLines("Me &amp; My Uncle-&gt; Big River<br />E: U.S. Blues")).toEqual([
      "Me & My Uncle-> Big River",
      "E: U.S. Blues",
    ]);
  });
});

describe("toPlainText", () => {
  it("drops tags and decodes entities", () => {
    expect(toPlainText("<b>flac16</b> SBD&gt; Master")).toBe("flac16 SBD> Master");
    expect(toPlainText("Me &amp; My Uncle-&gt; Big River")).toBe("Me & My Uncle-> Big River");
    expect(toPlainText("&quot;Dark Star&quot; &#39;72 &#x26; more")).toBe("\"Dark Star\" '72 & more");
  });

  it("drops tags before decoding, so an encoded bracket stays as text", () => {
    expect(toPlainText("Master &lt;- Reel &gt; DAT")).toBe("Master <- Reel > DAT");
  });

  it("keeps a bracket that does not start a tag", () => {
    const text = "standard stereo configuration< (mic stand at approx. 7.5' height) > Sony TC-D5M";
    expect(toPlainText(text)).toBe(text);
  });

  it("collapses whitespace, &nbsp; included", () => {
    expect(toPlainText("  SBD&nbsp;&gt;\n  DAT  ")).toBe("SBD > DAT");
  });
});

describe("formatRating", () => {
  it("rounds to one decimal", () => {
    expect(formatRating(9.570934)).toBe("9.6");
    expect(formatRating(8.0)).toBe("8.0");
  });
});

describe("formatMonthDay", () => {
  it("gives the month and day", () => {
    expect(formatMonthDay("2026-10-27")).toBe("October 27");
    expect(formatMonthDay("1977-05-08")).toBe("May 8");
  });

  it("leaves a partial date as written", () => {
    expect(formatMonthDay("1977-XX-XX")).toBe("1977-XX-XX");
  });
});
