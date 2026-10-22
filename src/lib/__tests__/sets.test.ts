import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseSource, pickBestSource, type RelistenSource } from "../relisten";
import { deriveSets, segueOut } from "../sets";
import type { Source } from "../types";

// Relisten's answer for /years/1986/1986-07-04 as it came: the show with its fifteen sources.
const sample = JSON.parse(
  readFileSync(new URL("./fixtures/relisten-1986-07-04.json", import.meta.url), "utf8")
) as { sources: RelistenSource[] };

// A source with the given notes and one set, named "Set", of tracks titled as given.
function source(description: string | null, titles: string[], taperNotes: string | null = null): Source {
  return {
    id: 1,
    uuid: "uuid-source",
    upstreamIdentifier: "source",
    isSoundboard: true,
    isRemaster: false,
    avgRating: 8,
    avgRatingWeighted: 8,
    duration: titles.length * 300,
    numReviews: 1,
    flacType: "Flac16Bit",
    description,
    taperNotes,
    source: null,
    taper: null,
    lineage: null,
    transferrer: null,
    unlabeled: false,
    sets: [
      {
        name: "Set",
        tracks: titles.map((title, i) => ({
          title,
          duration: 300,
          trackPosition: i + 1,
          mp3Url: `https://archive.org/download/source/${i + 1}.mp3`,
          flacUrl: null,
        })),
      },
    ],
  };
}

// Ten tracks. A set 2 opener can name Bertha (3) to Drums (7); an encore opener can name Wharf Rat (6) to U.S. Blues (9).
const TITLES = [
  "Tuning",
  "Jack Straw",
  "Deal",
  "Bertha",
  "Shakedown Street",
  "Estimated Prophet",
  "Wharf Rat",
  "Drums",
  "Space",
  "U.S. Blues",
];

describe("deriveSets", () => {
  it("finds set 2 and the encore of the page's source of 1986-07-04", () => {
    const best = pickBestSource(sample.sources.map(parseSource));
    expect(best?.upstreamIdentifier).toBe("gd1986-07-04.sbd.miller.118659.flac16");
    expect(best && deriveSets(best)).toEqual({ set2Start: 7, encoreStart: 18 });
  });

  it("finds no set 2 in a partial source whose opener is its second track", () => {
    const partial = source("Set 1\nA, B\nSet 2\nShakedown Street > Estimated Prophet", [
      "Tuning",
      "Shakedown Street",
      "Estimated Prophet",
      "Eyes Of The World",
      "Drums",
      "Space",
      "Wharf Rat",
    ]);
    expect(deriveSets(partial).set2Start).toBeNull();
  });

  it("finds no set 2 when the opener is not in the list, though the next song is", () => {
    expect(deriveSets(source("Set 2: Beer Barrel Polka > Shakedown Street", TITLES)).set2Start).toBeNull();
  });

  it("leaves at least three tracks in each set", () => {
    const opens = (opener: string) => deriveSets(source(`Set 2: ${opener}`, TITLES)).set2Start;
    expect(opens("Deal")).toBeNull(); // index 2
    expect(opens("Bertha")).toBe(3);
    expect(opens("Drums")).toBe(7); // index N - 3
    expect(opens("Space")).toBeNull(); // index N - 2
  });

  it("matches songs across '&' and 'And', a leading 'The', case and punctuation", () => {
    const opens = (opener: string, title: string) => {
      const titles = TITLES.map((t, i) => (i === 4 ? title : t));
      return deriveSets(source(`Set 2: ${opener}`, titles)).set2Start;
    };
    expect(opens("Samson & Delilah*", "Samson And Delilah")).toBe(4);
    expect(opens("The Wheel", "Wheel ->")).toBe(4);
    expect(opens("UNCLE JOHN'S BAND", "Uncle Johns Band")).toBe(4);
    expect(opens("Cold Rain & Snow", "Cold Rain & Snow > Fire On The Mountain >")).toBe(4);
  });

  it("reads 'Second Set', 'Set II' and 'Set 2:' with the opener after the colon", () => {
    expect(deriveSets(source("Second Set: Shakedown Street", TITLES)).set2Start).toBe(4);
    expect(deriveSets(source("Set II: Shakedown Street", TITLES)).set2Start).toBe(4);
    expect(deriveSets(source("Set 2: Shakedown Street", TITLES)).set2Start).toBe(4);
  });

  it("stops looking for set 2 at an encore line", () => {
    expect(deriveSets(source("Set 2: Shakedown Street", TITLES)).set2Start).toBe(4);
    expect(deriveSets(source("Encore: U.S. Blues\nSet 2: Shakedown Street", TITLES)).set2Start).toBeNull();
    // The description is read before the taper notes.
    expect(deriveSets(source("Encore: U.S. Blues", TITLES, "Set 2: Shakedown Street")).set2Start).toBeNull();
  });

  it("finds no set 2 when the notes end on the set 2 line", () => {
    expect(deriveSets(source("Set 1\nJack Straw, Deal\nSet 2", TITLES)).set2Start).toBeNull();
  });

  it("reads the taper notes after the description", () => {
    expect(deriveSets(source("Jack Straw, Deal", TITLES, "Set 2: Shakedown Street")).set2Start).toBe(4);
    expect(deriveSets(source("Jack Straw, Deal", TITLES, "Encore: U.S. Blues")).encoreStart).toBe(9);
  });

  it("finds an encore line's song after its colon or on the next line", () => {
    expect(deriveSets(source("Encore: U.S. Blues", TITLES)).encoreStart).toBe(9);
    expect(deriveSets(source("Encore:\nU.S. Blues", TITLES)).encoreStart).toBe(9);
  });

  it("finds an encore marked inside a song list", () => {
    const notes = "Jack Straw, Deal, Turn On Your Love Light, E: U.S. Blues";
    expect(deriveSets(source(notes, TITLES)).encoreStart).toBe(9);
  });

  it("finds an encore from a track titled as one when the notes name none", () => {
    const titles = [...TITLES.slice(0, 9), "Encore: U.S. Blues"];
    expect(deriveSets(source(null, titles)).encoreStart).toBe(9);
  });

  it("finds no encore when its song is not among the last four tracks", () => {
    expect(deriveSets(source("Encore: Wharf Rat", TITLES)).encoreStart).toBe(6);
    expect(deriveSets(source("Encore: Estimated Prophet", TITLES)).encoreStart).toBeNull();
    expect(deriveSets(source("Encore: Deal", TITLES)).encoreStart).toBeNull();
  });
});

describe("segueOut", () => {
  it("is true for a title that ends in a segue, with or without a mark after it", () => {
    expect(segueOut("The Wheel -> *")).toBe(true);
    expect(segueOut("Drums...> (Tape Flip)")).toBe(true);
    expect(segueOut("Samson And Delilah> *")).toBe(true);
    expect(segueOut("Cold Rain And Snow ->")).toBe(true);
    expect(segueOut("Cold Rain & Snow > Fire On The Mountain >")).toBe(true);
  });

  it("is false for a title that does not end in a segue", () => {
    expect(segueOut("Samson And Delilah")).toBe(false);
    expect(segueOut("U.S. Blues")).toBe(false);
    expect(segueOut("Drums")).toBe(false);
    // A mark inside a title holding two songs is not a segue out of it.
    expect(segueOut("Drums > Space")).toBe(false);
  });
});
