import { describe, expect, it } from "vitest";
import { logText, summaryText } from "../job-text.mjs";
import { codeSpanText } from "./code-span";

describe("logText", () => {
  it("keeps a text with no line break and no ##[ as written", () => {
    for (const text of ["Scarlet Begonias > Fire on the Mountain", "gd77-05-08.sbd.hicks.4982.sbeok.shnf", "https://archive.org/download/x/y.mp3"]) {
      expect(logText(text)).toBe(text);
    }
  });

  it("writes each run of carriage returns and line feeds as one space, so the text is one line", () => {
    expect(logText("Song\n::error::x")).toBe("Song ::error::x");
    expect(logText("a\r\nb\rc\n\n\rd")).toBe("a b c d");
  });

  it("writes each ##[ as ## [", () => {
    expect(logText("Song ##[error]x")).toBe("Song ## [error]x");
    expect(logText("###[a]##[b]")).toBe("### [a]## [b]");
    expect(logText("##\n[error]x")).toBe("## [error]x");
  });

  it("keeps the start of the text as written, so a line the script logs on purpose as a command stays one", () => {
    expect(logText("::warning::1986-07-04: what the page plays could not be learned")).toBe(
      "::warning::1986-07-04: what the page plays could not be learned"
    );
  });

  it("writes a value that is not text as a template literal does", () => {
    for (const value of [null, undefined, 42, true]) expect(logText(value)).toBe(`${value}`);
  });
});

// Pieces of a summary's values: backticks in runs, spaces, line breaks, and Markdown that a code span shows as written.
const PIECES = ["`", "``", "```", " ", "a", "\n", "\r", "[a link](https://example.test)", "![an image](https://example.test/i.png)", "<b>", "&amp;", "*", "_", "\\", "#", "- "];

// 2,000 values of 1 to 12 pieces each, the same on every run: a linear congruential generator picks the pieces.
const VALUES = (() => {
  let seed = 1;
  const pick = (n: number) => Math.floor(((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * n);
  return Array.from({ length: 2_000 }, () => Array.from({ length: 1 + pick(12) }, () => PIECES[pick(PIECES.length)]).join(""));
})();

describe("summaryText", () => {
  it("shows a value with a backtick, a link, an image and HTML in it as written", () => {
    const value = "icon /x`y.png [a link](https://example.test) ![an image](https://example.test/i.png) <b>bold</b> &amp; *em*";
    expect(codeSpanText(summaryText(value))).toBe(value);
  });

  it("opens the span with one backtick more than the value's longest run of them", () => {
    expect(summaryText("a``b`c")).toBe("```a``b`c```");
    expect(codeSpanText(summaryText("a``b`c"))).toBe("a``b`c");
  });

  it("shows a backtick at either end of the value apart from the span's own", () => {
    expect(summaryText("`a`")).toBe("`` `a` ``");
    expect(codeSpanText(summaryText("`a`"))).toBe("`a`");
  });

  it("keeps the value's own spaces at its ends", () => {
    for (const value of [" a ", " a", "a ", "   "]) expect(codeSpanText(summaryText(value))).toBe(value);
  });

  it("shows a value with line breaks on one line, each run of them a space", () => {
    expect(summaryText("Song\n# A heading\r\n- an item")).toBe("`Song # A heading - an item`");
  });

  it("shows nothing for an empty value", () => {
    expect(summaryText("")).toBe("");
  });

  it("shows each generated value as written, on one line, each run of line breaks a space", () => {
    expect(VALUES.map((value) => codeSpanText(summaryText(value)))).toEqual(VALUES.map((value) => value.replace(/[\r\n]+/g, " ")));
  });
});
