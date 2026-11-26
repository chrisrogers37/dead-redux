import { describe, expect, it } from "vitest";
import pickSchedule from "../../../data/pick-schedule.json";
import showCatalog from "../../../data/shows.json";
import { STAGING } from "../../../public/world/band.js";
import { LINEUPS, lineupOn, ROLES } from "../../../public/world/lineup.js";

// public/world/lineup.js: the band's line-up on the night of a show, by its date, as Wikipedia's "List of Grateful Dead members" has
// the band's members (the table's comments cite it, and the leans where the page gives a month or disagrees with itself).

type Row = [string, string, string[]];
const rows = LINEUPS as Row[];
const catalog = showCatalog.map((show) => show.date);
const picks = [...Object.values(pickSchedule.openingPicks), ...pickSchedule.rotation, ...pickSchedule.skipped.map((s) => s.show)];

// The roles, as the table writes them.
const five = ["lead", "rhythm", "bass", "drums"];
const twoDrums = [...five, "drums"];

describe("the line-ups, by date", () => {
  it("is the table, row by row: each line-up's first and last day and its roles", () => {
    expect(rows).toEqual([
      ["1965-06-01", "1967-09-28", [...five, "organ"]],
      ["1967-09-29", "1968-11-22", [...twoDrums, "organ"]],
      ["1968-11-23", "1970-01-30", [...twoDrums, "organ", "keys"]],
      ["1970-01-31", "1971-02-18", [...twoDrums, "organ"]],
      ["1971-02-19", "1971-08-31", [...five, "organ"]],
      ["1971-09-01", "1971-11-30", [...five, "piano"]],
      ["1971-12-01", "1971-12-30", [...five, "organ", "piano"]],
      ["1971-12-31", "1972-06-17", [...five, "organ", "piano", "voice"]],
      ["1972-06-18", "1973-10-31", [...five, "piano", "voice"]],
      ["1973-11-01", "1973-12-31", [...five, "piano"]],
      ["1974-01-01", "1974-10-19", [...five, "piano", "voice"]],
      ["1974-10-20", "1979-02-17", [...twoDrums, "piano", "voice"]],
      ["1979-04-22", "1990-07-23", [...twoDrums, "keys"]],
      ["1990-09-07", "1992-03-24", [...twoDrums, "keys", "piano"]],
      ["1992-03-25", "1995-07-09", [...twoDrums, "keys"]],
    ]);
  });

  it("keeps its rows in date order, none overlapping: each starts after the last ends, and ends on or after it starts", () => {
    for (const [k, [from, to]] of rows.entries()) {
      expect([from, /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to), from <= to]).toEqual([from, true, true]);
      if (k > 0) expect([from, rows[k - 1][1] < from]).toEqual([from, true]);
    }
  });

  it("makes each line-up five to seven players in the table's roles and in its order: the two guitars and the bass, one or two drummers, and a keyboard at the least", () => {
    for (const [from, , roles] of rows) {
      const drummers = roles.filter((role) => role === "drums").length;
      expect([from, roles.slice(0, 4), drummers === 1 || drummers === 2, roles.length >= 5 && roles.length <= 7]).toEqual([from, five, true, true]);
      expect([from, roles.every((role) => ROLES.includes(role)), [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b))]).toEqual([from, true, roles]);
      expect([from, roles.some((role) => ["organ", "keys", "piano"].includes(role)), new Set(roles).size + drummers - 1]).toEqual([from, true, roles.length]);
    }
  });

  it("gives these shows their line-ups", () => {
    const at = (date: string) => lineupOn(date).roles;
    // The seven of 1968-70, with the organ and the second keyboard.
    expect(at("1969-04-17")).toEqual([...twoDrums, "organ", "keys"]);
    // The autumn of 1971: one drummer, and the piano in the organ's place.
    expect(at("1971-10-19")).toEqual([...five, "piano"]);
    // The spring of 1972: the organ, the piano and the singer.
    expect(at("1972-05-26")).toEqual([...five, "organ", "piano", "voice"]);
    // The end of 1973: the piano, and no singer.
    expect(at("1973-11-30")).toEqual([...five, "piano"]);
    // The summer of 1974: one drummer, the piano and the singer.
    expect(at("1974-06-16")).toEqual([...five, "piano", "voice"]);
    // The shoot's fixed day's show: the six.
    expect(at("1986-07-04")).toEqual([...twoDrums, "keys"]);
    // A show of the catalog's in 1991, with the piano beside the keys.
    expect(catalog).toContain("1991-06-17");
    expect(at("1991-06-17")).toEqual([...twoDrums, "keys", "piano"]);
    // The band's last show.
    expect(at("1995-07-09")).toEqual([...twoDrums, "keys"]);
  });

  it("gives a date in no row the row before it, a date before the first row the first, and reads an unknown month or day as the first it could be", () => {
    // Between Keith and Donna Godchaux's last show and Brent Mydland's first, and between Mydland's last and Vince Welnick's first.
    expect(lineupOn("1979-03-01")).toEqual({ from: "1974-10-20", to: "1979-02-17", roles: [...twoDrums, "piano", "voice"] });
    expect(lineupOn("1990-08-28").from).toBe("1979-04-22");
    expect(lineupOn("1965-01-01").from).toBe("1965-06-01");
    expect(lineupOn("1999-01-01").from).toBe("1992-03-25");
    // 1973-XX-XX is read as 1973-01-01, 1968-05-XX as 1968-05-01.
    expect(lineupOn("1973-XX-XX").from).toBe("1972-06-18");
    expect(lineupOn("1968-05-XX").from).toBe("1967-09-29");
    expect(lineupOn("1966-XX-XX").from).toBe("1965-06-01");
  });

  it("maps every show of the catalog and every date the pick schedule features to exactly one line-up: the row that holds it, or for the catalog's two dates between line-ups, the row before", () => {
    const between: string[] = [];
    for (const date of new Set([...catalog, ...picks])) {
      const day = date.replace(/^(\d{4})-XX/, "$1-01").replace(/^(\d{4}-\d{2})-XX/, "$1-01");
      const holding = rows.filter(([from, to]) => from <= day && day <= to);
      const got = lineupOn(date), row = rows.find(([from]) => from === got.from)!;
      expect([date, holding.length <= 1, got.to, got.roles]).toEqual([date, true, row[1], row[2]]);
      if (holding.length === 1) expect([date, got.from]).toEqual([date, holding[0][0]]);
      else {
        between.push(date);
        expect([date, got.from]).toEqual([date, rows.filter(([from]) => from <= day).at(-1)![0]]);
      }
    }
    // Two dates at Club Front, the band's rehearsal hall: one in the weeks before Mydland's first show, one before Welnick's.
    expect(between.sort()).toEqual(["1979-04-16", "1990-08-28"]);
  });

  it("has the band stand every line-up of the table on the stage, and no other (band.js STAGING)", () => {
    expect(Object.keys(STAGING).sort()).toEqual([...new Set(rows.map(([, , roles]) => roles.join(" ")))].sort());
  });
});
