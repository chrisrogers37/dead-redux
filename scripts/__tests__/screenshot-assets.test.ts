import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assetAction, assetFile, saveAssets } from "../../.github/screenshots/assets.mjs";

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
