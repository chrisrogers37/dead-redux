import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assetAction,
  assetFile,
  callsFailure,
  evaluateAcrossNavigation,
  routingFailure,
  saveAssets,
} from "../../.github/screenshots/assets.mjs";

describe("assetAction", () => {
  it("saves a 200 and skips a 404, an image whose change has not landed yet", () => {
    expect(assetAction(200)).toBe("save");
    expect(assetAction(404)).toBe("skip");
  });

  it("fails on every other answer: an error the site should not give", () => {
    for (const status of [401, 403, 410, 500, 502, 503, 504]) expect(assetAction(status)).toBe("fail");
  });
});

describe("assetFile", () => {
  it("names each image the run saves as it always has", () => {
    expect(assetFile("/icon")).toBe("asset-icon.png");
    expect(assetFile("/icon-192.png")).toBe("asset-icon-192.png");
    expect(assetFile("/2026-03-01/opengraph-image")).toBe("asset-2026-03-01-opengraph-image.png");
  });
});

describe("callsFailure", () => {
  it("fails a frame over its tier's budget, and names the tier and the budget", () => {
    expect(callsFailure({ tier: "desktop", calls: 71 })).toBe("71 draw calls, over the desktop budget of 70");
    expect(callsFailure({ tier: "phone", calls: 46 })).toBe("46 draw calls, over the phone budget of 45");
    expect(callsFailure({ tier: "tv", calls: 61 })).toBe("61 draw calls, over the tv budget of 60");
  });

  it("passes a frame at its tier's budget", () => {
    expect(callsFailure({ tier: "desktop", calls: 70 })).toBe(null);
    expect(callsFailure({ tier: "phone", calls: 45 })).toBe(null);
    expect(callsFailure({ tier: "tv", calls: 60 })).toBe(null);
  });

  it("passes a page without stats, and a tier with no budget", () => {
    expect(callsFailure(null)).toBe(null);
    expect(callsFailure({ tier: "watch", calls: 500 })).toBe(null);
  });
});

describe("routingFailure", () => {
  /* A show playing on a ready world, with the routing a case names and no reason given for plain stereo. */
  const playing = (routing: string) => ({ state: "playing", world: "ready", routing, corsFallback: null });
  /* What the player records in window.__hill when an audio element fails its CORS load and falls back to plain stereo. */
  const corsFallback = { element: "show-audio-a", code: 4, message: "MEDIA_ELEMENT_ERROR: Format error" };

  it("fails a show playing on a ready world whose routing is still pending", () => {
    expect(routingFailure(playing("pending"))).toBe("playing, with routing pending and no corsFallback");
  });

  it("fails plain stereo that the player gives no reason for", () => {
    expect(routingFailure(playing("plain"))).toBe("playing, with routing plain and no corsFallback");
  });

  it("passes a show that sounds through the world", () => {
    expect(routingFailure(playing("webaudio"))).toBe(null);
  });

  it("passes plain stereo that the player names a reason for", () => {
    expect(routingFailure({ ...playing("plain"), corsFallback })).toBe(null);
  });

  it("passes a show that is not playing, and a world that is not ready, whatever the routing", () => {
    expect(routingFailure({ ...playing("pending"), state: "paused" })).toBe(null);
    expect(routingFailure({ ...playing("pending"), world: "loading" })).toBe(null);
  });
});

describe("evaluateAcrossNavigation", () => {
  // What Playwright throws when the page navigates while page.evaluate runs.
  const destroyed = () => new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation");
  // A stand-in page: each evaluate takes the next answer (an Error is thrown), and every call is recorded in order.
  const stand = (...answers: unknown[]) => {
    const calls: string[] = [];
    const page = {
      evaluate: async () => {
        calls.push("evaluate");
        const answer = answers.shift();
        if (answer instanceof Error) throw answer;
        return answer;
      },
      waitForLoadState: async (state: string) => {
        calls.push(`wait ${state}`);
      },
    };
    return { page, calls };
  };

  it("reads once when nothing navigates", async () => {
    const { page, calls } = stand("read");
    expect(await evaluateAcrossNavigation(page, () => null)).toBe("read");
    expect(calls).toEqual(["evaluate"]);
  });

  it("reads again once the new page has loaded when a navigation destroyed the first read, and says so", async () => {
    const { page, calls } = stand(destroyed(), "reread");
    const notes: string[] = [];
    expect(await evaluateAcrossNavigation(page, () => null, () => notes.push("reread"))).toBe("reread");
    expect(calls).toEqual(["evaluate", "wait load", "evaluate"]);
    expect(notes).toEqual(["reread"]);
  });

  it("fails on any other error, and on a second destroyed read", async () => {
    await expect(evaluateAcrossNavigation(stand(new Error("boom")).page, () => null)).rejects.toThrow("boom");
    await expect(evaluateAcrossNavigation(stand(destroyed(), destroyed()).page, () => null)).rejects.toThrow(
      "Execution context was destroyed",
    );
  });
});

describe("saveAssets", () => {
  /* A stand-in site: each path answers its status, and a 200 carries a few bytes to save. */
  const answers: Record<string, number> = { "/ok": 200, "/missing": 404, "/broken": 500, "/down": 503, "/locked": 401 };
  const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  let server: Server;
  let site: URL;
  let outDir: string;

  beforeEach(async () => {
    server = createServer((request, response) => {
      const status = answers[request.url ?? ""] ?? 404;
      response.writeHead(status, { "content-type": status === 200 ? "image/png" : "text/plain" });
      response.end(status === 200 ? body : `status ${status}`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    site = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    outDir = await mkdtemp(join(tmpdir(), "assets-"));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(outDir, { recursive: true, force: true });
  });

  it("saves a 200 byte for byte and passes a 404", async () => {
    const lines: string[] = [];
    const failed = await saveAssets(site, ["/ok", "/missing"], outDir, (line: string) => lines.push(line));
    expect(failed).toEqual([]);
    expect(await readdir(outDir)).toEqual(["asset-ok.png"]);
    expect(Buffer.compare(await readFile(join(outDir, "asset-ok.png")), body)).toBe(0);
    expect(lines).toEqual(["asset-ok.png  /ok", "/missing answered 404"]);
  });

  it("reports a server error, and every error in the list, after trying them all", async () => {
    const lines: string[] = [];
    const failed = await saveAssets(site, ["/broken", "/ok", "/down", "/locked", "/missing"], outDir, (line: string) => lines.push(line));
    expect(failed).toEqual(["/broken answered 500", "/down answered 503", "/locked answered 401"]);
    // The images after the first failure are still fetched and saved.
    expect(await readdir(outDir)).toEqual(["asset-ok.png"]);
    expect(lines).toContain("/broken answered 500, which fails the run");
  });
});
