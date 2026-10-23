import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/playing/[date]/route";
import { flatten } from "../queue";
import { parseSource, pickBestSource, type RelistenSource } from "../relisten";

// Relisten's answer for /years/1986/1986-07-04 as it came: the show with its fifteen sources.
const sampleText = readFileSync(new URL("./fixtures/relisten-1986-07-04.json", import.meta.url), "utf8");
const sample = JSON.parse(sampleText) as { sources: RelistenSource[] };

const API = "https://api.relisten.net/api/v2/artists/grateful-dead";
const realFetch = globalThis.fetch;
let requested: string[];

// Relisten, played by a stand-in for fetch: every request is recorded and answered by `answer`. No request leaves the test.
function relisten(answer: (url: string) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return answer(url);
  }) as typeof fetch;
}

const call = (date: string) => GET(new Request(`http://localhost/api/playing/${date}`), { params: Promise.resolve({ date }) });

beforeEach(() => {
  requested = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET /api/playing/<show date>", () => {
  it("answers with the recording the page plays, and nothing else", async () => {
    relisten(() => new Response(sampleText, { status: 200, headers: { "content-type": "application/json" } }));
    const res = await call("1986-07-04");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["identifier", "show", "tracks"]);
    expect(body.show).toBe("1986-07-04");
    // The page's choice among the fifteen sources: a soundboard first, then the higher weighted rating.
    expect(body.identifier).toBe("gd1986-07-04.sbd.miller.118659.flac16");
    expect(body.tracks).toHaveLength(19);
    for (const track of body.tracks) expect(Object.keys(track).sort()).toEqual(["duration", "mp3Url", "title"]);
    const playing = pickBestSource(sample.sources.map(parseSource));
    expect(body.tracks).toEqual(flatten(playing).map(({ title, duration, mp3Url }) => ({ title, duration, mp3Url })));
    expect(requested).toEqual([`${API}/years/1986/1986-07-04`]);
  });

  it("answers 400 to a path that is not a date, without asking Relisten", async () => {
    relisten(() => new Response(sampleText, { status: 200 }));
    for (const date of ["1986-7-4", "tomorrow", "1986-13-45"]) {
      const res = await call(date);
      expect(res.status, date).toBe(400);
      expect(await res.json(), date).toEqual({ error: "Not a show date" });
    }
    expect(requested).toEqual([]);
  });

  it("answers 404 for a day Relisten has no show for", async () => {
    relisten(() => new Response("Not found", { status: 404 }));
    const res = await call("1986-07-05");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No recording of this show" });
    // As the page does: the year's path first, then the show's own.
    expect(requested).toEqual([`${API}/years/1986/1986-07-05`, `${API}/shows/1986-07-05`]);
  });

  it("answers 404 for a show with no recording", async () => {
    relisten(() => new Response(JSON.stringify({ ...JSON.parse(sampleText), sources: [] }), { status: 200 }));
    const res = await call("1986-07-04");
    expect(res.status).toBe(404);
  });
});
