import { describe, expect, it } from "vitest";
import { worldData } from "../../components/world/data";
import type { DerivedSets, ShowSummary, Source } from "../types";

// The best source's archive identifier, its id and its uuid are three different values, so a field read in place of the identifier shows.
const IDENTIFIER = "gd77-05-08.sbd.hicks.4982.sbeok.shnf";
const FEATURED = "2026-02-16";

const show: ShowSummary = {
  date: "1977-05-08",
  venue: "Barton Hall, Cornell University",
  location: "Ithaca, NY, USA",
  avgRating: 9,
  sourceCount: 1,
  hasSoundboard: true,
};

const source: Source = {
  id: 7,
  uuid: "uuid-of-the-source",
  upstreamIdentifier: IDENTIFIER,
  isSoundboard: true,
  isRemaster: false,
  avgRating: 8,
  avgRatingWeighted: 8,
  duration: 0,
  numReviews: 1,
  flacType: "Flac16Bit",
  description: null,
  taperNotes: null,
  source: null,
  taper: null,
  lineage: null,
  transferrer: null,
  unlabeled: false,
  sets: [],
};

const NO_SETS: DerivedSets = { set2Start: null, encoreStart: null };

describe("worldData", () => {
  it("names the show's map by the best source's archive identifier, not by its id or uuid", () => {
    expect(worldData(FEATURED, show, source, [], NO_SETS).identifier).toBe(IDENTIFIER);
  });

  it("has no identifier, null, for a show with no recording", () => {
    expect(worldData(FEATURED, show, null, [], NO_SETS).identifier).toBeNull();
  });
});
