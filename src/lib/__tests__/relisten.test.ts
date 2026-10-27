import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../scripts/analyse-show.mjs";
import { lookUpShow, parseSource, pickBestSource, type RelistenSource } from "../relisten";
import type { Source } from "../types";

// Shaped like a source in Relisten's answer for /years/<year>/<date>. The real sources keep
// their identifier, soundboard flag, weighted rating, review count and track titles in order,
// cut to the tracks a test reads. Relisten gives these shows' sources one set, named "Set".
function source(
  upstreamIdentifier: string,
  isSoundboard: boolean,
  avgRatingWeighted: number,
  numReviews: number,
  titles: string[]
): RelistenSource {
  return {
    id: 1,
    uuid: `uuid-${upstreamIdentifier}`,
    upstream_identifier: upstreamIdentifier,
    is_soundboard: isSoundboard,
    is_remaster: false,
    avg_rating: avgRatingWeighted,
    avg_rating_weighted: avgRatingWeighted,
    duration: titles.length * 300,
    num_reviews: numReviews,
    flac_type: "Flac16Bit",
    description: null,
    taper_notes: null,
    source: null,
    taper: null,
    lineage: null,
    transferrer: null,
    sets: [
      {
        name: "Set",
        tracks: titles.map((title, i) => ({
          title,
          duration: 300,
          track_position: i + 1,
          mp3_url: `https://archive.org/download/${upstreamIdentifier}/${i + 1}.mp3`,
          flac_url: null,
        })),
      },
    ],
  };
}

function bestOf(...sources: RelistenSource[]): Source | null {
  return pickBestSource(sources.map(parseSource));
}

function titlesOf(src: Source | null): string[] {
  return src ? src.sets.flatMap((set) => set.tracks.map((track) => track.title)) : [];
}

describe("pickBestSource", () => {
  it("returns null when there is no source", () => {
    expect(pickBestSource([])).toBe(null);
  });

  it("prefers a soundboard, then the higher weighted rating, then more reviews", () => {
    const best = bestOf(
      source("aud", false, 9.5, 40, ["Bertha"]),
      source("sbd-lower-rating", true, 7.5, 50, ["Bertha"]),
      source("sbd-fewer-reviews", true, 8, 3, ["Bertha"]),
      source("sbd-more-reviews", true, 8, 10, ["Bertha"])
    );
    expect(best?.upstreamIdentifier).toBe("sbd-more-reviews");
  });

  it("passes over a soundboard whose titles are all file names (1969-04-26)", () => {
    const parsed = [
      source("gd69-04-26.sbd.yerys.71.sbeok.shnf", true, 7.956515312194824, 20, [
        "4-26-69d1t01.mp3",
        "4-26-69d1t02.mp3",
        "4-26-69d1t03.mp3",
      ]),
      source("gd1969-04-26.sbd.gmb.96449.flac16", true, 7.897029876708984, 6, [
        "Intro",
        "Dupree's Diamond Blues",
        "Mountains Of The Moon >",
      ]),
      source("gd1969-04-26.sbd.miller.97393.sbeok.flac16", true, 7.794297695159912, 9, [
        "Introduction",
        "Dupree's Diamond Blues",
        "Mountains Of The Moon ->",
      ]),
      source("gd1969-04-26.sbd.unknown.13390.shnf", true, 7.405416965484619, 1, [
        "Dupree's Diamond Blues",
        "Mountains On The Moon ->",
        "China Cat Sunflower ->",
      ]),
    ].map(parseSource);
    expect(parsed.map((s) => s.unlabeled)).toEqual([true, false, false, false]);
    const best = pickBestSource(parsed);
    expect(best?.upstreamIdentifier).toBe("gd1969-04-26.sbd.gmb.96449.flac16");
    expect(titlesOf(best)).toEqual(["Intro", "Dupree's Diamond Blues", "Mountains Of The Moon >"]);
  });

  it("passes over a soundboard whose titles are all bare track numbers (1975-06-05)", () => {
    const best = bestOf(
      source("gd75-06-05.sbd.backus.14292.sbeok.shnf", true, 5.693700790405273, 12, [
        "Track 1",
        "Track 2",
        "Track 3",
        "Track 4",
      ]),
      source("gd75-06-05.sbd.hanno.21936.sbeok.shnf", true, 5.061183452606201, 4, [
        "Blues Jam",
        "Crazy Fingers intro (mostly Garcia)",
        "Crazy Fingers intro (mostly Weir)",
        "Crazy Fingers intro",
      ])
    );
    expect(best?.upstreamIdentifier).toBe("gd75-06-05.sbd.hanno.21936.sbeok.shnf");
  });

  it("keeps a titled source with one file-name track, and numbers that track (1972-09-10)", () => {
    const best = bestOf(
      source("gd72-09-10.sbd.patched.greenberg-powell.22793.sbeok.shnf", true, 8.801350593566895, 18, [
        "Bertha",
        "Greatest Story Ever Told",
        "Mississippi Half-Step Uptown Toodleloo",
        "Black Throated Wind",
        "Bird Song",
        "Crowd",
        "Promised Land",
        "Deal",
        "El Paso",
        "Sugaree",
        "Playin in the Band",
        "Casey Jones",
        "He's Gone",
        "Truckin'",
        "Ramble on Rose",
        "Beat It On Down the Line",
        "Black Peter",
        "Crowd",
        "Dark Star",
        "Drums",
        "Dark Star",
        "Jack Straw",
        "Sing Me Back Home",
        "Sugar Magnolia",
        "One More Saturday Night",
        "gd72_09_10.sbdsbdpatch_d3_t09.mp3",
      ]),
      source("gd1972-09-10.163863.sbd.miller.gems.flac16", true, 8.783821105957031, 3, [
        "Bertha",
        "tuning",
        "Greatest Story Ever Told",
      ])
    );
    expect(best?.upstreamIdentifier).toBe("gd72-09-10.sbd.patched.greenberg-powell.22793.sbeok.shnf");
    const titles = titlesOf(best);
    expect(titles.length).toBe(26);
    expect(titles[8]).toBe("El Paso");
    expect(titles[25]).toBe("Track 26");
  });

  it("numbers every track when the only source's titles are all file names (1984 studio material)", () => {
    const best = bestOf(
      source("gd84-xx-xx.sbd.samaritano.16613.sbeok.shnf", true, 7.261849403381348, 15, [
        "gd1984-02-21t01.mp3",
        "gd1984-02-25t02.mp3",
        "gd1984-02-25t03.mp3",
        "gd1984-12-18t04.mp3",
        "gd1984-12-18t05.mp3",
        "gd1984-12-18t06.mp3",
      ])
    );
    expect(best?.upstreamIdentifier).toBe("gd84-xx-xx.sbd.samaritano.16613.sbeok.shnf");
    expect(titlesOf(best)).toEqual(["Track 1", "Track 2", "Track 3", "Track 4", "Track 5", "Track 6"]);
  });

  it("counts a source as unlabeled only when more than half its titles are placeholders", () => {
    const titled = source("titled", true, 8, 5, ["Bertha", "Deal", "El Paso", "Sugaree"]);
    const half = source("half", true, 9, 5, ["Bertha", "gd72-09-10t02.mp3", "El Paso", "gd72-09-10t04.mp3"]);
    const most = source("most", true, 9, 5, ["Bertha", "gd72-09-10t02.mp3", "gd72-09-10t03.mp3", "gd72-09-10t04.mp3"]);
    expect(bestOf(half, titled)?.upstreamIdentifier).toBe("half");
    expect(bestOf(most, titled)?.upstreamIdentifier).toBe("titled");
  });

  it("counts a source with no tracks as labeled, so it ranks ahead of placeholders whatever their ratings", () => {
    const placeholders = source("placeholders", true, 9.9, 99, ["gd72-09-10t01.mp3", "gd72-09-10t02.mp3"]);
    const empty = source("empty", false, 1, 0, []);
    expect(bestOf(placeholders, empty)?.upstreamIdentifier).toBe("empty");
  });

  it("counts a source of blank titles as labeled, and prints its titles blank", () => {
    const placeholders = source("placeholders", true, 9.9, 99, ["gd72-09-10t01.mp3", "gd72-09-10t02.mp3"]);
    const blank = source("blank", false, 1, 0, ["", ""]);
    const best = bestOf(placeholders, blank);
    expect(best?.upstreamIdentifier).toBe("blank");
    expect(titlesOf(best)).toEqual(["", ""]);
  });

  it("counts the titles of every set, not only the first", () => {
    const twoSets = source("two-sets", true, 9, 5, ["Bertha", "Deal"]);
    const placeholders = source("two-sets", true, 9, 5, ["gd72-09-10t03.mp3", "gd72-09-10t04.mp3", "gd72-09-10t05.mp3"]);
    twoSets.sets.push({ ...placeholders.sets[0], name: "Set 2" });
    const titled = source("titled", true, 8, 5, ["Bertha", "Deal", "El Paso"]);
    expect(bestOf(twoSets, titled)?.upstreamIdentifier).toBe("titled");
  });

  it("ranks a soundboard with file-name titles after a titled audience recording", () => {
    const best = bestOf(
      source("sbd-file-names", true, 9.5, 30, ["gd72-09-10t01.mp3", "gd72-09-10t02.mp3"]),
      source("aud-titled", false, 7, 2, ["Bertha", "Deal"])
    );
    expect(best?.upstreamIdentifier).toBe("aud-titled");
  });
});

describe("lookUpShow", () => {
  const API = "https://api.relisten.net/api/v2/artists/grateful-dead";
  const YEAR = `${API}/years/1986/1986-07-04`;
  const SHOW = `${API}/shows/1986-07-04`;
  const realFetch = globalThis.fetch;
  let requested: string[];
  let signals: (AbortSignal | null | undefined)[];
  // Relisten, played by a stand-in for fetch that answers each path with `answer` and records each request's URL and signal.
  const relisten = (answer: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requested.push(url);
      signals.push(init?.signal);
      return answer(url, init);
    }) as typeof fetch;
  };
  // A path that never answers, as fetch does with a signal: it rejects with the signal's reason once the signal aborts, at once if it
  // already has, and otherwise never settles.
  const hang = (init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });

  beforeEach(() => {
    requested = [];
    signals = [];
    // A failed look-up logs one line; the cases here keep the run quiet.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("is missing only when both paths answer 404", async () => {
    relisten(() => new Response(null, { status: 404 }));
    expect(await lookUpShow("1986-07-04")).toEqual({ kind: "missing" });
  });

  it("fails when either path answers anything else, naming each path that failed", async () => {
    relisten((url) => new Response(null, { status: url === YEAR ? 503 : 404 }));
    expect(await lookUpShow("1986-07-04")).toEqual({ kind: "failed", reason: `${YEAR} answered 503` });
    relisten(() => {
      throw new TypeError("fetch failed");
    });
    expect(await lookUpShow("1986-07-04")).toEqual({
      kind: "failed",
      reason: `${YEAR} could not be reached: fetch failed; ${SHOW} could not be reached: fetch failed`,
    });
  });

  it("cleans what it parses: the four short facts as plain text, and a leading track number off a title", async () => {
    const answered = source("cleaned", true, 9, 5, ["01 Bertha", "02. Deal", "Dark Star.mp3"]);
    answered.source = "<b>SBD</b> &gt; DAT";
    answered.taper = "Rob&nbsp;Bertrando";
    answered.lineage = "DAT &gt; CD &gt; FLAC";
    answered.transferrer = "&lt;unknown&gt;";
    const show = { date: "1986-07-04", display_date: "1986-07-04", venue: null, tour: null, sources: [answered], avg_rating: 9 };
    relisten(() => new Response(JSON.stringify(show)));
    const result = await lookUpShow("1986-07-04");
    if (result.kind !== "found") throw new Error(`expected the show, got ${result.kind}`);
    const [parsed] = result.details.sources;
    expect(parsed).toMatchObject({
      source: "SBD > DAT",
      taper: "Rob Bertrando",
      lineage: "DAT > CD > FLAC",
      transferrer: "<unknown>",
    });
    expect(titlesOf(parsed)).toEqual(["Bertha", "Deal", "Track 3"]);
  });

  it("names a refusal as the maps job names one", async () => {
    relisten(() => new Response(null, { status: 403, headers: { server: "cloudflare", "cf-mitigated": "challenge" } }));
    const job = (url: string) => new HttpError(url, 403, "cloudflare", "challenge").message;
    expect(await lookUpShow("1986-07-04")).toEqual({ kind: "failed", reason: `${job(YEAR)}; ${job(SHOW)}` });
  });

  it("gives up on a path that never answers once the budget is spent, and asks no other", async () => {
    relisten((_url, init) => hang(init));
    expect(await lookUpShow("1986-07-04", 20)).toEqual({ kind: "failed", reason: `${YEAR} did not answer within 20 ms` });
    expect(requested).toEqual([YEAR]);
  });

  it("spends one budget across both paths", async () => {
    relisten((url, init) => (url === YEAR ? new Response(null, { status: 503 }) : hang(init)));
    expect(await lookUpShow("1986-07-04", 20)).toEqual({
      kind: "failed",
      reason: `${YEAR} answered 503; ${SHOW} did not answer within 20 ms`,
    });
    // The second path gets what the first left: both requests carry the one signal.
    expect(signals[0]).toBe(signals[1]);
  });

  it("logs one line when it fails, and none when the show is missing or found", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    relisten(() => new Response(null, { status: 503 }));
    await lookUpShow("1986-07-04");
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(`Relisten gave no answer for 1986-07-04: ${YEAR} answered 503; ${SHOW} answered 503`);
    relisten(() => new Response(null, { status: 404 }));
    expect((await lookUpShow("1986-07-04")).kind).toBe("missing");
    expect(error).toHaveBeenCalledTimes(1);
    const answered = source("cleaned", true, 9, 5, ["Bertha"]);
    const show = { date: "1986-07-04", display_date: "1986-07-04", venue: null, tour: null, sources: [answered], avg_rating: 9 };
    relisten(() => new Response(JSON.stringify(show)));
    expect((await lookUpShow("1986-07-04")).kind).toBe("found");
    expect(error).toHaveBeenCalledTimes(1);
  });
});
