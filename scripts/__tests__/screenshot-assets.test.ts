import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assetAction,
  assetFile,
  callsFailure,
  evaluateAcrossNavigation,
  nearFailure,
  readWalkCalls,
  routingFailure,
  saveAssets,
  sweepPeak,
  walkPoses,
} from "../../.github/screenshots/assets.mjs";
import { BOUND } from "../../public/world/ground.js";

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

describe("nearFailure", () => {
  it("fails a first-person frame with a bear nearer than the near plane, and names the depth", () => {
    expect(nearFailure({ bears: { near: 0.46, cover: 1 } })).toBe("a bear 0.46 m from the camera, inside its 0.5 m near plane");
  });

  it("passes a bear at the near plane and beyond it", () => {
    expect(nearFailure({ bears: { near: 0.5, cover: 1 } })).toBe(null);
    expect(nearFailure({ bears: { near: 1.45, cover: 0.4 } })).toBe(null);
  });

  it("passes a page without stats, a frame in third person, and a first-person frame with no bear in view", () => {
    expect(nearFailure(null)).toBe(null);
    expect(nearFailure({})).toBe(null);
    expect(nearFailure({ bears: null })).toBe(null);
    expect(nearFailure({ bears: { near: null, cover: 0 } })).toBe(null);
  });
});

/* A pose of the walk sweep, as the world:pose event carries it: where the bear stands and which way it looks. */
type Pose = { x: number; z: number; heading: number; pitch: number };

describe("walkPoses", () => {
  const spacing = 15;
  // How close two distances or two angles must be to count as equal.
  const near = 1e-9;
  // The sweep's poses with each place faced `headings` ways: one heading makes one pose for each place.
  const walk = (headings: number): Pose[] => walkPoses(spacing, headings);
  // A place's name: its x and z, which every pose standing there shares to the last bit.
  const placeKey = ({ x, z }: { x: number; z: number }) => `${x},${z}`;

  it("keeps every pose within BOUND of the island's centre", () => {
    const poses = walk(1);
    expect(poses.length).toBeGreaterThan(0);
    expect(Math.max(...poses.map(({ x, z }) => Math.hypot(x, z)))).toBeLessThanOrEqual(BOUND + near);
  });

  it("puts a place at each point of the spacing's square grid inside the walk, and at no other point off the ring", () => {
    const offRing = walk(1)
      .filter(({ x, z }) => Math.hypot(x, z) < BOUND - near)
      .map(placeKey);
    // Every grid point the walk reaches, found by trying a wider square than the walk needs.
    const reach = Math.ceil(BOUND / spacing) + 1;
    const grid: string[] = [];
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        if (Math.hypot(i * spacing, j * spacing) < BOUND) grid.push(placeKey({ x: i * spacing, z: j * spacing }));
      }
    }
    expect(offRing.sort()).toEqual(grid.sort());
    expect(offRing).toContain("0,0");
  });

  it("makes a place once where a grid point falls on the ring", () => {
    // A spacing of BOUND puts the grid point (0, BOUND) on the ring itself, where the ring's first place stands.
    const places = walkPoses(BOUND, 1).map(placeKey);
    expect(places).toContain(placeKey({ x: 0, z: BOUND }));
    expect(new Set(places).size).toBe(places.length);
  });

  it("rings the walk at BOUND with places no farther apart along it than the spacing, all the way round", () => {
    const angles = walk(1)
      .filter(({ x, z }) => Math.abs(Math.hypot(x, z) - BOUND) <= near)
      .map(({ x, z }) => Math.atan2(x, z))
      .sort((a, b) => a - b);
    expect(angles.length).toBeGreaterThan(0);
    // The gap from each place to the next one round the ring, the last place's reaching on past the full turn to the first.
    const gaps = angles.map((angle, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - angle);
    expect(Math.max(...gaps) * BOUND).toBeLessThanOrEqual(spacing + near);
  });

  it("faces each place evenly round in every heading, level, and makes no other pose", () => {
    const headings = 4;
    const poses = walk(headings);
    // The poses grouped by the place they stand at, in the order the places first appear.
    const places = new Map<string, Pose[]>();
    for (const pose of poses) {
      const here: Pose[] = places.get(placeKey(pose)) ?? [];
      here.push(pose);
      places.set(placeKey(pose), here);
    }
    // However the places are faced, they are the same places.
    expect(Array.from(places.keys())).toEqual(walk(1).map(placeKey));
    for (const here of Array.from(places.values())) {
      expect(here).toHaveLength(headings);
      for (let k = 0; k < headings; k++) {
        const heading = (k * 2 * Math.PI) / headings;
        expect(here.filter((pose) => Math.abs(pose.heading - heading) <= near)).toHaveLength(1);
      }
    }
    expect(new Set(poses.map(({ pitch }) => pitch))).toEqual(new Set([0]));
    expect(poses).toHaveLength(places.size * headings);
  });
});

describe("readWalkCalls", () => {
  // Poses whose x the stand-in page below reads as their draw calls.
  const poses: Pose[] = [
    { x: 3, z: -4, heading: 0, pitch: 0 },
    { x: 7, z: 8, heading: 1.5, pitch: -0.2 },
    { x: 5, z: 0, heading: 3, pitch: 0.3 },
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* A stand-in page. Its window.__hill starts with a stale reading, and the animation frames asked for, counted from 1, are drawn or
     not as `draws` says: a drawn frame counts itself in __hill.frames and reads the draw calls of the pose last sent in a world:pose
     event, which here are that pose's x. Returns the events sent and a count of the frames asked for. */
  const stand = (draws: (frame: number) => boolean) => {
    const hill = { frames: 0, calls: -1 };
    const events: { type: string; detail: Pose }[] = [];
    let pending: Pose | undefined;
    let asked = 0;
    vi.stubGlobal("window", { __hill: hill });
    vi.stubGlobal("document", {
      dispatchEvent: (event: { type: string; detail: Pose }) => {
        events.push({ type: event.type, detail: event.detail });
        pending = event.detail;
        return true;
      },
    });
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      asked++;
      const frame = asked;
      queueMicrotask(() => {
        if (pending && draws(frame)) {
          hill.frames++;
          hill.calls = pending.x;
        }
        callback(0);
      });
      return frame;
    });
    return { events, framesAsked: () => asked };
  };

  it("sends a world:pose event for each pose, in order, and returns the calls each pose drew", async () => {
    const { events } = stand(() => true);
    expect(await readWalkCalls(poses)).toEqual([3, 7, 5]);
    expect(events).toEqual(poses.map((detail) => ({ type: "world:pose", detail })));
  });

  it("reads a pose's calls only from a frame the world drew after it, not the stale reading or an earlier pose's", async () => {
    // The world draws on every second animation frame, so the first frame after each pose draws nothing.
    stand((frame) => frame % 2 === 0);
    expect(await readWalkCalls(poses)).toEqual([3, 7, 5]);
  });

  it("fails, naming the pose, when 60 animation frames pass without the world drawing one", async () => {
    const stuck: Pose = { x: 12.5, z: -40, heading: 1.5, pitch: 0.3 };
    const { framesAsked } = stand(() => false);
    await expect(readWalkCalls([stuck])).rejects.toThrow(JSON.stringify(stuck));
    expect(framesAsked()).toBe(60);
  });
});

describe("sweepPeak", () => {
  const poses: Pose[] = Array.from({ length: 5 }, (_, x) => ({ x, z: 0, heading: 0, pitch: 0 }));

  it("returns the most draw calls a sweep read, and the pose that drew them", () => {
    expect(sweepPeak(poses, [58, 31, 44, 47, 12])).toEqual({ calls: 58, pose: poses[0] });
    expect(sweepPeak(poses, [31, 58, 44, 47, 12])).toEqual({ calls: 58, pose: poses[1] });
    expect(sweepPeak(poses, [31, 44, 47, 12, 58])).toEqual({ calls: 58, pose: poses[4] });
  });

  it("returns the first pose to draw the most when several tie", () => {
    expect(sweepPeak(poses, [20, 55, 40, 55, 12])).toEqual({ calls: 55, pose: poses[1] });
    expect(sweepPeak(poses, [55, 55, 55, 55, 55])).toEqual({ calls: 55, pose: poses[0] });
  });

  it("returns the only pose of a one-pose sweep", () => {
    expect(sweepPeak([poses[2]], [33])).toEqual({ calls: 33, pose: poses[2] });
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
