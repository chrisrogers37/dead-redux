import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PickSchedule } from "../../src/lib/pick-schedule";
import type { ShowSummary } from "../../src/lib/types";
import { refreshCatalog, type RefreshIO } from "../refresh-catalog";

const API = "https://api.relisten.net/api/v2/artists/grateful-dead";
const TODAY = "2026-10-20";

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

function relistenShow(date: string, sourceCount: number) {
  return {
    display_date: date,
    venue: { name: `Venue ${date}`, location: "City, ST" },
    avg_rating: 9,
    source_count: sourceCount,
    has_soundboard_source: false,
  };
}

const known: ShowSummary[] = [
  record("1977-05-08", 12),
  record("1977-05-09", 4),
  record("1981-08-06", 2),
  record("1981-08-07", 3),
  record("1990-03-29", 20),
];

const schedule: PickSchedule = {
  rotationStart: "2026-11-01",
  openingPicks: { "2026-10-31": "1990-03-29" },
  rotation: ["1977-05-08", "1977-05-09", "1981-08-06", "1981-08-07", "1990-03-29"],
  skipped: [],
};

const YEARS = [
  { year: "1977", show_count: 2 },
  { year: "1981", show_count: 2 },
  { year: "1990", show_count: 1 },
];

const HEALTHY: Record<string, unknown> = {
  "/years": YEARS,
  "/years/1977": { shows: [relistenShow("1977-05-08", 13), relistenShow("1977-05-09", 4)] },
  "/years/1981": { shows: [relistenShow("1981-08-07", 3), relistenShow("1981-08-08", 1)] },
  "/years/1990": { shows: [relistenShow("1990-03-29", 21)] },
};

const REFRESHED = [
  record("1977-05-08", 13),
  record("1977-05-09", 4),
  record("1981-08-06", 0),
  record("1981-08-07", 3),
  record("1981-08-08", 1),
  record("1990-03-29", 21),
];

const KEPT_1977 = [
  record("1977-05-08", 12),
  record("1977-05-09", 4),
  record("1981-08-06", 0),
  record("1981-08-07", 3),
  record("1981-08-08", 1),
  record("1990-03-29", 21),
];

/** An HTTP status to fail with, or a body to answer 200 with. */
type Answer = { status: number } | { body: unknown };

function count(requests: string[], path: string): number {
  return requests.filter((requested) => requested === path).length;
}

function fakeRelisten(overrides: Record<string, Answer[]> = {}) {
  const requests: string[] = [];
  const pauses: number[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const io: RefreshIO = {
    fetch: async (url) => {
      const path = url.slice(url.indexOf("/years"));
      const nth = count(requests, path);
      requests.push(path);
      const scripted = overrides[path];
      let answer: Answer = { status: 404 };
      if (scripted) {
        answer = scripted[Math.min(nth, scripted.length - 1)];
      } else if (path in HEALTHY) {
        answer = { body: HEALTHY[path] };
      }
      if ("status" in answer) {
        return new Response("unavailable", {
          status: answer.status,
          statusText: answer.status === 503 ? "Service Unavailable" : "Not Found",
        });
      }
      return new Response(JSON.stringify(answer.body), { status: 200 });
    },
    sleep: async (ms) => {
      pauses.push(ms);
    },
    log: (message) => {
      out.push(message);
    },
    error: (message) => {
      err.push(message);
    },
  };
  return { io, requests, pauses, out, err };
}

describe("refreshCatalog", () => {
  let dir: string;
  let showsText: string;
  let scheduleText: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "refresh-catalog-"));
    showsText = JSON.stringify(known, null, 2);
    scheduleText = JSON.stringify(schedule, null, 2) + "\n";
    writeFileSync(join(dir, "shows.json"), showsText);
    writeFileSync(join(dir, "pick-schedule.json"), scheduleText);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function readCatalog(): ShowSummary[] {
    return JSON.parse(readFileSync(join(dir, "shows.json"), "utf8"));
  }

  function readSchedule(): PickSchedule {
    return JSON.parse(readFileSync(join(dir, "pick-schedule.json"), "utf8"));
  }

  it("refreshes every year, places new shows and exits 0", async () => {
    const f = fakeRelisten();
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(0);
    expect(readCatalog()).toEqual(REFRESHED);
    expect(readSchedule().rotation).toEqual([
      "1977-05-08",
      "1977-05-09",
      "1981-08-06",
      "1981-08-07",
      "1981-08-08",
      "1990-03-29",
    ]);
    expect(f.requests).toEqual(["/years", "/years/1977", "/years/1981", "/years/1990"]);
    expect(f.err).toEqual([]);
  });

  it("retries a failed request with a growing pause", async () => {
    const f = fakeRelisten({
      "/years/1981": [{ status: 503 }, { status: 503 }, { body: HEALTHY["/years/1981"] }],
    });
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(0);
    expect(count(f.requests, "/years/1981")).toBe(3);
    expect(f.pauses).toEqual([200, 1000, 2000, 200, 200]);
    expect(f.out).toContain(`  503 Service Unavailable; retrying ${API}/years/1981`);
    expect(readCatalog()).toEqual(REFRESHED);
    expect(f.err).toEqual([]);
  });

  it("keeps a year that fails every attempt, writes the rest and exits 1 naming it", async () => {
    const f = fakeRelisten({ "/years/1977": [{ status: 503 }] });
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(1);
    expect(count(f.requests, "/years/1977")).toBe(3);
    expect(readCatalog()).toEqual(KEPT_1977);
    expect(readSchedule().rotation).toContain("1981-08-08");
    expect(f.err).toEqual([
      `  Failed to fetch ${API}/years/1977: 503 Service Unavailable`,
      "\nThese years failed to load, so their shows were kept as they were: 1977",
    ]);
  });

  it.each([
    {
      name: "an empty answer",
      count: 2,
      shows: [],
      reason: "answered with no shows",
    },
    {
      name: "an answer missing a show",
      count: 2,
      shows: [relistenShow("1977-05-08", 13)],
      reason: "answered 1 show(s) where the year list reports 2",
    },
    {
      name: "an answer with an extra show",
      count: 2,
      shows: [
        relistenShow("1977-05-08", 13),
        relistenShow("1977-05-09", 4),
        relistenShow("1977-05-10", 1),
      ],
      reason: "answered 3 show(s) where the year list reports 2",
    },
    {
      name: "an empty answer the year list agrees with",
      count: 0,
      shows: [],
      reason: "answered with no shows",
    },
  ])("counts $name as a failed year", async (c) => {
    const f = fakeRelisten({
      "/years": [{ body: [{ year: "1977", show_count: c.count }, YEARS[1], YEARS[2]] }],
      "/years/1977": [{ body: { shows: c.shows } }],
    });
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(1);
    expect(count(f.requests, "/years/1977")).toBe(3);
    expect(readCatalog()).toEqual(KEPT_1977);
    expect(f.err).toEqual([
      `  Failed to fetch ${API}/years/1977: ${c.reason}`,
      "\nThese years failed to load, so their shows were kept as they were: 1977",
    ]);
  });

  it("keeps every show when the year list is empty, and exits 1 naming each year", async () => {
    const f = fakeRelisten({ "/years": [{ body: [] }] });
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(1);
    expect(f.requests).toEqual(["/years"]);
    expect(readCatalog()).toEqual(known);
    expect(readFileSync(join(dir, "pick-schedule.json"), "utf8")).toBe(scheduleText);
    expect(f.err).toEqual([
      "  1977 is in the catalog but not in Relisten's year list",
      "  1981 is in the catalog but not in Relisten's year list",
      "  1990 is in the catalog but not in Relisten's year list",
      "\nThese years failed to load, so their shows were kept as they were: 1977, 1981, 1990",
    ]);
  });

  it("keeps a year the year list leaves out", async () => {
    const f = fakeRelisten({ "/years": [{ body: [YEARS[0], YEARS[2]] }] });
    const code = await refreshCatalog(dir, TODAY, f.io);
    expect(code).toBe(1);
    expect(count(f.requests, "/years/1981")).toBe(0);
    expect(readCatalog()).toEqual([
      record("1977-05-08", 13),
      record("1977-05-09", 4),
      record("1981-08-06", 2),
      record("1981-08-07", 3),
      record("1990-03-29", 21),
    ]);
    expect(f.err).toEqual([
      "  1981 is in the catalog but not in Relisten's year list",
      "\nThese years failed to load, so their shows were kept as they were: 1981",
    ]);
  });

  it("stops before writing anything when the year list can't be fetched", async () => {
    const f = fakeRelisten({ "/years": [{ status: 503 }] });
    await expect(refreshCatalog(dir, TODAY, f.io)).rejects.toThrow(
      `Failed to fetch ${API}/years: 503 Service Unavailable`
    );
    expect(f.requests).toEqual(["/years", "/years", "/years"]);
    expect(readFileSync(join(dir, "shows.json"), "utf8")).toBe(showsText);
    expect(readFileSync(join(dir, "pick-schedule.json"), "utf8")).toBe(scheduleText);
  });
});
