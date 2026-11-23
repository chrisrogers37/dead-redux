import { readdirSync, readFileSync } from "fs";
import { join } from "path";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { AS_TITLES, FIXED_DAY, FIXED_TITLES, nearPages, slug, standFailure, STONE_TITLES } from "../../.github/screenshots/near.mjs";
import schedule from "../../data/pick-schedule.json";
import { makeBuilders, STONE_KINDS, stoneKind } from "../../public/world/landmarks.js";
import { buildPath, buildWalkLine, layout, nearStand, placeLandmarks } from "../../public/world/path.js";
import { isDrums, isSpace } from "../../public/world/seats.js";
import { showDateFor } from "../../src/lib/pick-schedule";

// The builders' table (public/world/landmarks.js): a title's kind is the first row whose rule it meets, or none, the standing stone.
type Rule = { test(title: string): boolean; source?: string };
const { BUILDERS } = makeBuilders(false) as unknown as { BUILDERS: [Rule, unknown][] };
const kindOf = (title: string) => BUILDERS.findIndex(([rule]) => rule.test(title));
const nameOf = (kind: number) => (kind < 0 ? "the standing stone" : (BUILDERS[kind][0].source ?? (BUILDERS[kind][0].test as { name: string }).name));
// The fixed day's show as its map has it: its songs, and how long each plays.
const map = JSON.parse(readFileSync(join(__dirname, "../../public/maps/1986-07-04.json"), "utf8")) as { tracks: { title: string; playingDuration: number }[] };
const as = AS_TITLES as [number, string, string?][], stoneTitles = STONE_TITLES as [number, string][];
type Step = { near: number; title: string; shot: string };
type Page = { path: string; devices: string[]; ready?: string; whole: boolean; shots: string[]; steps: Step[] };
const [own, others, stones] = nearPages() as Page[];

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
    expect(FIXED_TITLES).toEqual(map.tracks.map((t) => t.title));
  });

  it("stands by every kind of landmark in the builders' table, and by a standing stone, each once", () => {
    const ownKinds = FIXED_TITLES.map(kindOf), asKinds = as.map(([, title]) => kindOf(title));
    // A new row in the table needs a title here.
    const missing = [-1, ...BUILDERS.map((_, kind) => kind)].filter((kind) => !ownKinds.includes(kind) && !asKinds.includes(kind)).map(nameOf);
    expect(missing).toEqual([]);
    // Each other kind is one the fixed day's show lacks, and is built once.
    expect(asKinds.filter((kind) => ownKinds.includes(kind)).map(nameOf)).toEqual([]);
    expect(new Set(asKinds).size).toBe(asKinds.length);
    expect(asKinds.map(nameOf)).toContain("ripple");
    expect(asKinds).toContain(-1);
  });

  it("stands by the eight kinds of standing stone, each once and in the kinds' own order, by songs from the maps that have no landmark of their own", () => {
    expect(STONE_KINDS).toBe(8);
    expect(stoneTitles.map(([, title]) => stoneKind(title))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Each is a song some show's map has, under this title, and one no row of the builders' table takes: a new row that takes one
    // of these needs another title here.
    const dir = join(__dirname, "../../public/maps");
    const inMaps = new Set(readdirSync(dir).filter((file) => file.endsWith(".json")).flatMap((file) => (JSON.parse(readFileSync(join(dir, file), "utf8")) as { tracks: { title: string }[] }).tracks.map((t) => t.title)));
    for (const [, title] of stoneTitles) {
      expect(inMaps.has(title), title).toBe(true);
      expect(nameOf(kindOf(title)), title).toBe("the standing stone");
    }
  });

  it("builds each other kind, and each stone, at a song's point of its own on its page: at neither cave's, where Drums and Space are pinned, nor the first song's, under its column of light", () => {
    for (const table of [as, stoneTitles]) {
      const indexes = table.map(([index]) => index);
      expect(new Set(indexes).size).toBe(indexes.length);
      for (const index of indexes) {
        expect(Number.isInteger(index) && index > 0 && index < FIXED_TITLES.length, `song ${index}`).toBe(true);
        expect(isDrums(FIXED_TITLES[index]) || isSpace(FIXED_TITLES[index]), `song ${index}`).toBe(false);
      }
    }
  });

  it("has a clear view of every landmark it shoots, on a desktop and a phone, from 14 m or as far as a long one asks", () => {
    // The world's own path, bears' line and landmarks for the fixed day (set 2 opens with song 7), as main.js builds them.
    const path = buildPath(), line = buildWalkLine(path, 7);
    const songs = map.tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
    const u = layout(songs, 7, path);
    const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    for (const phone of [false, true]) {
      const stands = (tracks: { title: string; duration: number }[], shot: number[]) => {
        const landmarks = placeLandmarks(new Scene(), path, tracks, true, makeBuilders(phone), u, line);
        return shot.map((k) => ({ k, stand: nearStand(path, u, landmarks, k)!, to: landmarks[k].position }));
      };
      const own = stands(songs, songs.map((_, k) => k));
      for (const { k, stand } of own) expect(stand.clear, `song ${k}${phone ? " on a phone" : ""}`).toBe(true);
      // The road's slab is 18 m long and reaches 9.2 m from its middle: the visitor stands 8 m back from that, not 14 m from the middle,
      // where its near end would be under the frame. No other landmark here is so long, and one, Touch Of Grey's, is seen from 11 m.
      const far = own.filter(({ stand, to }) => gap(stand, to) > 14.001).map(({ k, stand, to }) => [FIXED_TITLES[k], Math.round(gap(stand, to) * 10) / 10]);
      expect(far).toEqual([["Goin' Down The Road Feeling Bad ->", 17.2]]);
      expect(own.filter(({ stand, to }) => gap(stand, to) < 13.999).map(({ k }) => FIXED_TITLES[k])).toEqual(["Touch Of Grey"]);
      // Each page of landmarks built for other titles: the other kinds, and the stones.
      for (const table of [as, stoneTitles]) {
        const built = songs.map((t, k) => ({ ...t, title: table.find(([index]) => index === k)?.[1] ?? t.title }));
        const views = stands(built, table.map(([index]) => index));
        for (const { k, stand, to } of views) {
          const which = `song ${k} as "${built[k].title}"${phone ? " on a phone" : ""}`;
          expect(stand.clear, which).toBe(true);
          expect(gap(stand, to), which).toBeCloseTo(14, 6);
        }
        // The cairn's own still is the one on the climb: it is seen from below, a third of a radian up or more, where a stone's
        // lower side shows. The cairn is the fourth of the kinds.
        if (table === stoneTitles) expect(views[stoneTitles.findIndex(([, title]) => stoneKind(title) === 3)].stand.pitch, `the cairn${phone ? " on a phone" : ""}`).toBeGreaterThan(0.33);
      }
    }
  });

  it("shoots the fixed day's nineteen landmarks from one page", () => {
    expect(own.path).toBe("/2026-10-20?pose=near-0");
    expect(own.steps.map((s) => [s.near, s.title])).toEqual(FIXED_TITLES.map((title: string, index: number) => [index, title]));
    expect(own.steps[12]).toEqual({ near: 12, title: "Uncle John's Band ->", shot: "fixed-near-uncle-johns-band" });
  });

  it("shoots the other kinds from a second load, which builds each song's landmark for its other title", () => {
    // The titles are encoded: a space, an ampersand or a hash in one would not reach the page whole.
    expect(others.path).not.toMatch(/\s/);
    expect(others.path).toContain("as=5:Playin'%20In%20The%20Band&as=7:Truckin'&");
    const url = new URL(others.path, "https://example.test");
    expect(url.pathname).toBe("/2026-10-20");
    expect(url.searchParams.get("pose")).toBe(`near-${as[0][0]}`);
    expect(url.searchParams.getAll("as")).toEqual(as.map(([index, title]) => `${index}:${title}`));
    // A still's own name is the shoot's, not the page's: the hook is given the title alone.
    expect(url.searchParams.getAll("as").some((value) => value.includes("standing"))).toBe(false);
    expect(others.steps).toEqual(as.map(([index, title, name]) => ({ near: index, title, shot: `fixed-as-${name ?? slug(title)}` })));
    expect(others.steps.find((s) => s.title === "Ripple")?.shot).toBe("fixed-as-ripple");
    // The standing stone's still is named for what it shows, not for the song that happens to have no landmark of its own.
    const stone = others.steps.filter((s) => kindOf(s.title) < 0);
    expect(stone.map((s) => s.shot)).toEqual(["fixed-as-standing-stone"]);
  });

  it("shoots the eight stones from a third load, which builds eight songs' landmarks for the stones' titles", () => {
    expect(stones.path).not.toMatch(/\s/);
    const url = new URL(stones.path, "https://example.test");
    expect(url.pathname).toBe("/2026-10-20");
    expect(url.searchParams.get("pose")).toBe(`near-${stoneTitles[0][0]}`);
    expect(url.searchParams.getAll("as")).toEqual(stoneTitles.map(([index, title]) => `${index}:${title}`));
    expect(stones.steps).toEqual(stoneTitles.map(([index, title]) => ({ near: index, title, shot: `fixed-stone-${slug(title)}` })));
    expect(stones.steps[4]).toEqual({ near: 10, title: "Peggy-O", shot: "fixed-stone-peggy-o" });
  });

  it("shoots the three pages whole, on a desktop and a phone, and gives every still its own name: 80 in all", () => {
    for (const page of [own, others, stones]) {
      expect(page.whole, page.path).toBe(true);
      expect(page.devices, page.path).toEqual(["desktop", "phone"]);
      expect(page.shots, page.path).toEqual([]);
    }
    expect(nearPages()).toHaveLength(3);
    const files = [own, others, stones].flatMap((page) => page.devices.flatMap((device) => page.steps.map((s) => `${device}-${s.shot}.png`)));
    expect(new Set(files).size).toBe(files.length);
    expect(files).toHaveLength(2 * (19 + 13 + 8));
  });

  it("waits on every near page for the world to be ready before its first step", () => {
    // A step stands the visitor in the world: taken on a page still loading, it fails with "the page has no world". The shoot waits
    // for the state a page names (`ready`), as it does on its sweep page.
    const pages = nearPages() as Page[];
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.steps.length, page.path).toBeGreaterThan(0);
      expect(page.ready, page.path).toBe("#world[data-world='ready']");
    }
  });
});

describe("standFailure", () => {
  const step = { near: 7, title: "Truckin'" };

  it("passes a page that stands the visitor by the step's song with a clear view, however the title is punctuated", () => {
    expect(standFailure({ index: 7, title: "Truckin'", clear: true }, step)).toBeNull();
    expect(standFailure({ index: 7, title: "Truckin ->", clear: true }, step)).toBeNull();
    expect(standFailure({ index: 0, title: "Terrapin Station ->", clear: true }, { near: 0, title: "Terrapin Station >" })).toBeNull();
  });

  it("fails a page with no near pose, as a production page would be", () => {
    expect(standFailure(null, step)).toBe('the page stands the visitor by no landmark, where song 7, "Truckin\'", was asked for');
  });

  it("fails a page that did not move to the step's song", () => {
    expect(standFailure({ index: 5, title: "Truckin'", clear: true }, step)).toBe('the visitor stands by song 5, "Truckin\'", not song 7, "Truckin\'"');
  });

  it("fails a page whose landmark is built for another title, even one that starts the same", () => {
    expect(standFailure({ index: 7, title: "The Other One", clear: true }, step)).toBe('song 7\'s landmark is built for "The Other One" on this page, where near.mjs has "Truckin\'"');
    expect(standFailure({ index: 7, title: "Truckin' Up To Buffalo", clear: true }, step)).not.toBeNull();
    expect(standFailure({ index: 7, title: "Truck", clear: true }, step)).not.toBeNull();
  });

  it("fails a still with another landmark in the view, or one that does not say its view is clear", () => {
    const blocked = 'another landmark stands in the view of song 7\'s, "Truckin\'"';
    expect(standFailure({ index: 7, title: "Truckin'", clear: false }, step)).toBe(blocked);
    expect(standFailure({ index: 7, title: "Truckin'" }, step)).toBe(blocked);
  });
});
