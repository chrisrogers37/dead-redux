import { describe, it, expect } from "vitest";
import { mergeCatalog } from "../catalog";
import type { ShowSummary } from "../types";

function record(date: string, sourceCount: number): ShowSummary {
  return {
    date,
    venue: `Venue ${date}`,
    location: "City, ST",
    avgRating: 9,
    sourceCount,
    hasSoundboard: false,
  };
}

describe("mergeCatalog", () => {
  const known = [
    record("1977-05-08", 12),
    record("1977-XX-XX", 1),
    record("1981-08-06", 1),
    record("1990-03-29", 20),
  ];
  // The 1977 fetch failed; 1981 and 1990 loaded, and 1981-08-06 was not among them.
  const fetched = [record("1990-03-29", 21), record("1981-08-07", 3)];
  const { catalog, delisted, unrefreshed } = mergeCatalog(known, fetched, ["1981", "1990"]);

  it("keeps a year that wasn't refreshed exactly as the catalog has it, and reports it", () => {
    expect(catalog.filter((show) => show.date.startsWith("1977"))).toEqual(known.slice(0, 2));
    expect(unrefreshed).toEqual(["1977"]);
  });

  it("keeps a show Relisten no longer lists, with no recordings left", () => {
    expect(catalog.find((show) => show.date === "1981-08-06")).toEqual({
      ...known[2],
      sourceCount: 0,
    });
    expect(delisted).toEqual(["1981-08-06"]);
  });

  it("takes the fetched record and sorts the catalog by date", () => {
    expect(catalog.find((show) => show.date === "1990-03-29")).toEqual(fetched[0]);
    expect(catalog.map((show) => show.date)).toEqual([
      "1977-05-08",
      "1977-XX-XX",
      "1981-08-06",
      "1981-08-07",
      "1990-03-29",
    ]);
  });

  it("zeroes every show Relisten no longer lists, whatever its count, in catalog order", () => {
    const known = [
      record("1969-02-27", 7),
      record("1969-02-28", 1),
      record("1972-05-04", 3),
      record("1972-05-11", 2),
      record("1972-05-26", 5),
    ];
    // Both years loaded; Relisten answered out of date order and left three shows out.
    const fetched = [record("1972-05-26", 6), record("1969-02-28", 2)];
    const { catalog, delisted, unrefreshed } = mergeCatalog(known, fetched, ["1969", "1972"]);
    expect(delisted).toEqual(["1969-02-27", "1972-05-04", "1972-05-11"]);
    expect(catalog).toEqual([
      { ...known[0], sourceCount: 0 },
      fetched[1],
      { ...known[2], sourceCount: 0 },
      { ...known[3], sourceCount: 0 },
      fetched[0],
    ]);
    expect(unrefreshed).toEqual([]);
  });

  it("keeps every show when no year was refreshed", () => {
    const empty = mergeCatalog(known, [], []);
    expect(empty.catalog).toEqual(known);
    expect(empty.delisted).toEqual([]);
    expect(empty.unrefreshed).toEqual(["1977", "1981", "1990"]);
  });
});
