import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FIXED_DAY, FIXED_TITLES, NEAR_DATES, NEAR_FRAMES, nearPages, slug, standFailure } from "../../.github/screenshots/near.mjs";
import schedule from "../../data/pick-schedule.json";
import { makeBuilders } from "../../public/world/landmarks.js";
import { showDateFor } from "../../src/lib/pick-schedule";

// The builders' table (public/world/landmarks.js): a title's kind is the first row whose rule it meets, or none, the standing stone.
type Rule = { test(title: string): boolean; source?: string };
const { BUILDERS } = makeBuilders(false) as unknown as { BUILDERS: [Rule, unknown][] };
const kindOf = (title: string) => BUILDERS.findIndex(([rule]) => rule.test(title));
const nameOf = (kind: number) => (kind < 0 ? "the standing stone" : (BUILDERS[kind][0].source ?? (BUILDERS[kind][0].test as { name: string }).name));
// A show's songs as its map has them.
const titlesOf = (show: string): string[] =>
  (JSON.parse(readFileSync(join(__dirname, "../../public/maps", `${show}.json`), "utf8")) as { tracks: { title: string }[] }).tracks.map((t) => t.title);
type Step = { near: number; title: string; shot: string };
type Page = { path: string; devices: string[]; whole: boolean; shots: string[]; steps: Step[] };
const pages = nearPages() as Page[];
const dates = NEAR_DATES as [string, ...[number, string][]][];

describe("the near stills", () => {
  it("names a still by its song: lower case, no apostrophes, a hyphen for anything else", () => {
    expect(slug("Uncle John's Band ->")).toBe("uncle-johns-band");
    expect(slug("Goin' Down The Road Feeling Bad ->")).toBe("goin-down-the-road-feeling-bad");
    expect(slug("C C Rider")).toBe("c-c-rider");
    expect(slug("U.S. Blues")).toBe("u-s-blues");
    expect(slug("Terrapin Station >")).toBe("terrapin-station");
  });

  it("has the fixed day's songs as its show's map has them", () => {
    expect(showDateFor(schedule, FIXED_DAY)).toBe("1986-07-04");
    expect(FIXED_TITLES).toEqual(titlesOf("1986-07-04"));
  });

  it("has each dated song at the index, and with the title, its day's show has", () => {
    for (const [date, ...songs] of dates) {
      const titles = titlesOf(showDateFor(schedule, date));
      for (const [index, title] of songs) expect(titles[index], `${date}, song ${index}`).toBe(title);
    }
  });

  it("stands by every kind of landmark in the builders' table but Ripple's, and by a standing stone", () => {
    const shown = new Set([...FIXED_TITLES, ...dates.flatMap(([, ...songs]) => songs.map(([, title]) => title))].map(kindOf));
    // No show has a Ripple as of 2026-11-22. A new row in the table needs a still here.
    const ripple = kindOf("Ripple");
    expect(nameOf(ripple)).toBe("ripple");
    const missing = BUILDERS.map((_, kind) => kind).filter((kind) => kind !== ripple && !shown.has(kind)).map(nameOf);
    expect(missing).toEqual([]);
    expect(shown.has(-1)).toBe(true);
    expect(shown.has(ripple)).toBe(false);
  });

  it("shoots the fixed day's nineteen landmarks on a desktop and a phone, from one page", () => {
    const [fixed] = pages;
    expect(fixed.path).toBe("/2026-10-20?pose=near-0");
    expect(fixed.devices).toEqual(["desktop", "phone"]);
    expect(fixed.shots).toEqual([]);
    expect(fixed.steps.map((s) => [s.near, s.title])).toEqual(FIXED_TITLES.map((title: string, index: number) => [index, title]));
    expect(fixed.steps[12]).toEqual({ near: 12, title: "Uncle John's Band ->", shot: "fixed-near-uncle-johns-band" });
  });

  it("shoots each dated page on a desktop, opening beside its first song", () => {
    const dated = pages.slice(1);
    expect(dated).toHaveLength(dates.length);
    dates.forEach(([date, ...songs], k) => {
      expect(dated[k].path).toBe(`/${date}?pose=near-${songs[0][0]}`);
      expect(dated[k].devices).toEqual(["desktop"]);
      expect(dated[k].steps.map((s) => [s.near, s.title, s.shot])).toEqual(songs.map(([index, title]) => [index, title, `${date}-near-${slug(title)}`]));
    });
  });

  it("shoots every page whole: in first person with the shelves away", () => {
    for (const page of pages) expect(page.whole, page.path).toBe(true);
  });

  it("gives every still its own name, fifty in all", () => {
    const files = pages.flatMap((page) => page.devices.flatMap((device) => page.steps.map((s) => `${device}-${s.shot}.png`)));
    expect(new Set(files).size).toBe(files.length);
    expect(files).toHaveLength(2 * 19 + 12);
  });

  it("waits for more than the one frame that draws the cut", () => {
    expect(NEAR_FRAMES).toBeGreaterThanOrEqual(2);
  });
});

describe("standFailure", () => {
  const step = { near: 20, title: "Truckin" };

  it("passes a page that stands the visitor by the step's song, however the title is punctuated", () => {
    expect(standFailure({ index: 20, title: "Truckin" }, step)).toBeNull();
    expect(standFailure({ index: 20, title: "Truckin' ->" }, step)).toBeNull();
    expect(standFailure({ index: 0, title: "Terrapin Station ->" }, { near: 0, title: "Terrapin Station >" })).toBeNull();
  });

  it("fails a page with no near pose, as a production page would be", () => {
    expect(standFailure(null, step)).toBe('the page stands the visitor by no landmark, where song 20, "Truckin", was asked for');
  });

  it("fails a page that did not move to the step's song", () => {
    expect(standFailure({ index: 13, title: "Playin' In The Band" }, step)).toBe('the visitor stands by song 13, "Playin\' In The Band", not song 20, "Truckin"');
  });

  it("fails a page whose setlist has another song at the index", () => {
    expect(standFailure({ index: 20, title: "The Other One" }, step)).toBe('song 20 is "The Other One" on this page, where near.mjs has "Truckin"');
  });
});
