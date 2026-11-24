import { readFileSync } from "fs";
import { join } from "path";
// @ts-expect-error -- three ships no types; here it loads from the three devDependency, as the world's modules load it
import { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrived, CAMERA_WALKS, EASE_MS, missed, POLL_MS, press, PRESS_MS, readWorld, RECORD_MS, RECORDINGS, REST_FRAMES, REST_MS, STAGE_EDGE, step, WORLD_MS, worldStarted } from "../../.github/screenshots/recordings.mjs";
import { AWAKE, RIDE, SETTLED } from "../../.github/screenshots/ride.mjs";
import { planFiles } from "../../.github/screenshots/shards.mjs";
import { STAGE, STAGE_REACH } from "../../public/world/ground.js";
import { makeBuilders } from "../../public/world/landmarks.js";
import { buildPath, buildWalkLine, layout, placeLandmarks } from "../../public/world/path.js";
import { RIG_EASE_S } from "../../public/world/pose.js";
import { watchIdle } from "../../src/components/world/ride";

// The shoot's recordings (.github/screenshots/recordings.mjs): the list, and the steps one takes, taken here with a stand-in for
// the page. The class these hold: a step that depends on the page's state, on a renderer several times slower than a visitor's,
// must fail the run when it misses, and not give a green run and a recording of nothing.

const ROOT = join(__dirname, "../..");
type Walker = { x: number; z: number; heading: number; pitch: number };
type World = { walker: Walker; frames: number; mode: string; screen: number[] | null; ride?: { lean: number; yaw: number } | null };
type Until = { near?: number[]; turned?: number; past?: string; lean?: number; rest?: number };
type Step = [string | null, number, Until?];
type Recording = { device: string; name: string; path?: string; click?: string; waitFor?: string; keys?: Step[]; stick?: [string, number][]; recordMs?: number };
const recordings = RECORDINGS as Recording[];
const take = step as unknown as (page: unknown, step: Step, how: { file: string; n: number; now: () => number; worldMs?: number }) => Promise<{ ms: number; failure: string | null }>;

// A stand-in for the page, with a clock of its own that only a wait moves: `world` says what the page's world tells at a time
// (null before it has started), and the keys it is given are kept with the times they went down and up.
function standIn(world: (t: number) => World | null) {
  let t = 0;
  const keys: string[] = [];
  const page = {
    evaluate: async () => world(t),
    waitForTimeout: async (ms: number) => { t += ms; },
    keyboard: { down: async (key: string) => { keys.push(`${key} down at ${t}`); }, up: async (key: string) => { keys.push(`${key} up at ${t}`); } },
  };
  return { page, keys, now: () => t };
}
const at = (x: number, z: number, heading = 0, frames = 0, screen: number[] | null = [0.5, 0.6], mode = "walk"): World => ({ walker: { x, z, heading, pitch: 0 }, frames, mode, screen });
// The same in a ride, its camera `lean` of the way from the rig that walks with the bears to the crane: "follow" awake, "drift" settled.
const riding = (lean: number, frames: number, mode = lean > 0 ? "drift" : "follow"): World => ({ ...at(0, 104, 1.1, frames, [0.5, 0.5], mode), ride: { lean, yaw: 0 } });
// A runner that draws a frame of the world every `frameMs`: how many it has drawn by a time.
const drawn = (t: number, frameMs: number) => Math.floor(t / frameMs);

describe("the recordings of the walk's camera", () => {
  const camera = recordings.filter(({ name }) => name.startsWith("camera-"));
  const of = (device: string, name: string) => camera.find((r) => r.device === device && r.name === name)!;

  it("are four: the stage's and the tower's, on a desktop and on a phone, and the plan names each one's file", () => {
    expect(camera.map(({ device, name }) => `${device} ${name}`)).toEqual(["desktop camera-stage", "desktop camera-tower", "phone camera-stage", "phone camera-tower"]);
    const { recordings: files } = planFiles({ pages: [], recordings: RECORDINGS, assets: [] }) as { recordings: string[] };
    for (const file of ["desktop-camera-stage.webm", "desktop-camera-tower.webm", "phone-camera-stage.webm", "phone-camera-tower.webm"]) expect(files, file).toContain(file);
    expect((CAMERA_WALKS as unknown[][]).map(([name]) => name)).toEqual(["camera-stage", "camera-tower"]);
  });

  it("start each from its own place on the fixed day, with the scene clicked first so that the show starts and the keys reach the world", () => {
    for (const device of ["desktop", "phone"]) {
      expect(of(device, "camera-stage")).toMatchObject({ path: "/2026-10-20?pose=61.12,-53.12,-0.855,0", click: "canvas" });
      expect(of(device, "camera-tower")).toMatchObject({ path: "/2026-10-20?pose=81.66,54.33,2.524,0", click: "canvas" });
      // Neither names a state to wait for after the click, a stick, or a length of its own: its steps are its length.
      for (const name of ["camera-stage", "camera-tower"]) expect(Object.keys(of(device, name)).sort(), `${device} ${name}`).toEqual(["click", "device", "keys", "name", "path"]);
    }
  });

  // A pose as its page's path gives it: where the visitor stands, and the unit way it faces (a heading h walks along (-sin h, -cos h)).
  const poseOf = (path: string) => {
    const [x, z, heading, pitch] = path.split("pose=")[1].split(",").map(Number);
    return { x, z, heading, pitch, way: [-Math.sin(heading), -Math.cos(heading)] };
  };

  it("walk the stage's bear from 5 m short of the platform's edge to the edge, turn it round and stand it until the camera has rested", () => {
    const { keys, path } = of("desktop", "camera-stage"), pose = poseOf(path!), [walk, turn, stand] = keys!;
    expect(of("phone", "camera-stage").keys).toEqual(keys);
    // The pose: on the stage's side of the slope, 5 m outside the walk's limit there, looking level and facing the stage's middle.
    const out = Math.hypot(pose.x - STAGE[0], pose.z - STAGE[1]);
    expect(out).toBeCloseTo(STAGE_REACH + 5, 1);
    expect([(STAGE[0] - pose.x) / out, (STAGE[1] - pose.z) / out]).toEqual([expect.closeTo(pose.way[0], 2), expect.closeTo(pose.way[1], 2)]);
    expect(pose.pitch).toBe(0);
    // The walk ends at the platform's edge, where the walk's limit stops a walker: the world's own place and reach.
    expect(STAGE_EDGE).toEqual([STAGE[0], STAGE[1], STAGE_REACH + 0.1]);
    expect(walk).toEqual(["ArrowUp", 30_000, { near: STAGE_EDGE }]);
    // The turn is half a turn, which puts the bear's back to the stage and the boom on it.
    expect(turn).toEqual(["ArrowLeft", 80_000, { turned: Math.PI }]);
    // The stand holds no key and ends when the camera has rested, with three minutes for it at the most.
    expect(stand).toEqual([null, 180_000, { rest: REST_FRAMES }]);
  });

  it("walk the tower's bear from 14 m short of the Lovelight tower past it, 2.5 m from its middle, to 7 m beyond, and stand it until the camera has rested", () => {
    const { keys, path } = of("desktop", "camera-tower"), pose = poseOf(path!), [walk, stand] = keys!;
    expect(of("phone", "camera-tower").keys).toEqual(keys);
    expect(keys).toHaveLength(2);
    // The fixed day's tower, where main.js stands it: 1986-07-04, its second set from track 7.
    const tracks = (JSON.parse(readFileSync(join(ROOT, "public/maps/1986-07-04.json"), "utf8")) as { tracks: { title: string; playingDuration: number }[] }).tracks.map((t) => ({ title: t.title, duration: t.playingDuration }));
    const trail = buildPath(), marks = placeLandmarks(new Scene(), trail, tracks, true, makeBuilders(false), layout(tracks, 7, trail), buildWalkLine(trail, 7)) as { position: { x: number; z: number } }[];
    const tower = marks[tracks.findIndex((t) => /Lovelight/.test(t.title))].position;
    // Along the pose's way, the tower's middle is 14 m on and 2.5 m to one side: the bear passes it, and its box comes into the boom's way.
    const along = (tower.x - pose.x) * pose.way[0] + (tower.z - pose.z) * pose.way[1], aside = Math.abs((tower.x - pose.x) * pose.way[1] - (tower.z - pose.z) * pose.way[0]);
    expect(along).toBeGreaterThan(13.5);
    expect(along).toBeLessThan(14.5);
    expect(aside).toBeGreaterThan(2.3);
    expect(aside).toBeLessThan(2.8);
    // The walk's end is on that way, 7 m past the tower, and the bear has come to it within a metre.
    const [key, ms, until] = walk, [x, z, r] = until!.near!;
    expect([key, ms, r]).toEqual(["ArrowUp", 80_000, 1]);
    const on = (x - pose.x) * pose.way[0] + (z - pose.z) * pose.way[1], off = Math.abs((x - pose.x) * pose.way[1] - (z - pose.z) * pose.way[0]);
    expect(on - along).toBeGreaterThan(6.5);
    expect(on - along).toBeLessThan(7.5);
    expect(off).toBeLessThan(0.1);
    expect(stand).toEqual([null, 180_000, { rest: REST_FRAMES }]);
  });

  it("give each step that waits two seconds for each frame of the world it needs, where CI's slowest in the logs is 0.78 s", () => {
    // 9 frames to the edge at 0.6 m a frame, 39 for half a turn at 0.08 rad, 35 past the tower, and 60 for the camera's rest and
    // the frames that show it (the walk's own tests give it three seconds of the world's time).
    const [edge, turn, rest] = of("desktop", "camera-stage").keys!, [past] = of("desktop", "camera-tower").keys!;
    expect(edge[1]).toBeGreaterThanOrEqual(Math.ceil(5 / 0.6) * 2000);
    expect(turn[1]).toBeGreaterThanOrEqual(Math.ceil(Math.PI / 0.08) * 2000);
    expect(past[1]).toBeGreaterThanOrEqual(Math.ceil(21 / 0.6) * 2000);
    expect(rest[1]).toBeGreaterThanOrEqual((60 + REST_FRAMES) * 2000);
    expect([REST_FRAMES, REST_MS, POLL_MS, WORLD_MS, PRESS_MS, RECORD_MS]).toEqual([12, 1000, 50, 30_000, 15_000, 10_000]);
  });
});

describe("the recordings of the ride", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const ride = recordings.filter(({ name }) => /^ride(-|$)/.test(name));
  const of = (device: string, name: string) => ride.find((r) => r.device === device && r.name === name)!;
  const ONCE_READY = `#world[data-world='ready'] ~ div ${RIDE}`, PRESSED = `${RIDE}[aria-pressed='true']`;
  // The ride's camera eases between its rigs over RIG_EASE_S of the world's time, and a frame is at most 50 ms of it.
  const EASE_FRAMES = RIG_EASE_S / 0.05;

  it("are five, under the names the pull request's table gives: the ride on the TV, with the bears on a desktop, on a straight stretch and on a phone, and one that settles and wakes", () => {
    expect(ride.map(({ device, name }) => `${device}-${name}.webm`)).toEqual(["tv-ride.webm", "desktop-ride.webm", "desktop-ride-straight.webm", "phone-ride.webm", "desktop-ride-settle-wake.webm"]);
    // Each starts the ride by its one button, and its press must bring the ride's state; none names its own length, so its steps
    // are its length, or RECORD_MS where it has none.
    for (const r of ride) {
      const where = `${r.device}-${r.name}`;
      expect(r.click!.endsWith(RIDE), where).toBe(true);
      expect([AWAKE, SETTLED, PRESSED], where).toContain(r.waitFor);
      expect(r.recordMs, where).toBeUndefined();
    }
  });

  it("keep a ride that is not about settling awake through its recording six times over, and wait for nothing once its button is pressed", () => {
    for (const [device, name, path] of [["desktop", "ride", "/2026-10-20?idle=60"], ["desktop", "ride-straight", "/2026-10-20?at=3&t=42&idle=60"], ["phone", "ride", "/2026-10-20?idle=60"]]) {
      expect(of(device, name), `${device}-${name}`).toEqual({ device, name, path, click: ONCE_READY, waitFor: PRESSED });
    }
    // Ten seconds of recording under a wait of a minute.
    expect(RECORD_MS * 6).toBe(60_000);
  });

  it("stand the TV's until the camera is on the crane, the page's two seconds and the ease's frames at two seconds a frame, and then three seconds there", () => {
    expect(of("tv", "ride")).toEqual({ device: "tv", name: "ride", path: "/?idle=2", click: RIDE, waitFor: AWAKE, keys: [[null, 2_000 + EASE_FRAMES * 2000, { lean: 1 }], [null, 3_000]] });
    expect(EASE_FRAMES).toBe(60);
    expect(EASE_MS).toBe(EASE_FRAMES * 2000);
  });

  it("show the camera's way out and back whole in the one that settles and wakes: it stands until the camera is on the crane, a look wakes the page, and Shift, held until the camera is back with the bears, keeps the page awake under a wait of three seconds and gives the world no control", () => {
    const settles = of("desktop", "ride-settle-wake");
    expect(settles).toEqual({
      device: "desktop", name: "ride-settle-wake", path: "/2026-10-20?idle=3", click: ONCE_READY, waitFor: SETTLED,
      keys: [[null, EASE_FRAMES * 2000, { lean: 1 }], ["ArrowLeft", 600], ["ShiftLeft", EASE_FRAMES * 2000, { lean: 0 }], [null, 2_000]],
    });
    // The last stand is under the page's wait, so the recording ends with the camera at the bears and the page awake.
    const [, [lookKey, lookMs], [holdKey, holdMs], [, standMs]] = settles.keys!, look = lookKey!, hold = holdKey!;
    expect(standMs).toBeLessThan(3000);
    // By the page's own watch, with the page's wait of three seconds: left alone after the look, it settles again in three; with
    // Shift held it never does, however long the hold may last, and settles three seconds after Shift is let go.
    vi.useFakeTimers();
    const idle = 3000;
    for (const held of [false, true]) {
      const win = new EventTarget(), told: boolean[] = [];
      const send = (type: string, code: string, key: string) => win.dispatchEvent(Object.assign(new Event(type), { code, key }));
      const stop = watchIdle(win, { ms: idle, settled: true, onChange: (settled) => told.push(settled) });
      send("keydown", look, look);
      vi.advanceTimersByTime(lookMs);
      send("keyup", look, look);
      if (held) send("keydown", hold, "Shift");
      vi.advanceTimersByTime(holdMs);
      expect(told, String(held)).toEqual(held ? [false] : [false, true]);
      if (held) {
        send("keyup", hold, "Shift");
        vi.advanceTimersByTime(standMs);
        expect(told).toEqual([false]);
        vi.advanceTimersByTime(idle - standMs - 1);
        expect(told).toEqual([false]);
        vi.advanceTimersByTime(1);
        expect(told).toEqual([false, true]);
      }
      stop();
    }
    // Shift is the run of a walk, which alone is no control of the world's: it starts no walk and turns no look (input.js).
    const input = readFileSync(join(ROOT, "public/world/input.js"), "utf8");
    expect(input).toContain('ShiftLeft: "run"');
    expect(input).toContain('if (k !== "run") userInput(k);');
  });

  it("name the ride's button and its looks by ride.mjs's names, as its stills do, and not by their own", () => {
    const list = readFileSync(join(ROOT, ".github/screenshots/recordings.mjs"), "utf8");
    expect(list).toContain('import { AWAKE, RIDE, SETTLED } from "./ride.mjs";');
    expect(list).not.toMatch(/data-action='ride'\]|data-ride=/);
  });
});

describe("every recording's steps", () => {
  it("are a key or none, a time, and at most one thing waited for, of the five a step knows", () => {
    for (const { device, name, keys } of recordings) for (const [n, [key, ms, until]] of (keys ?? []).entries()) {
      const where = `${device}-${name}, step ${n + 1}`;
      expect(key === null || /^(Arrow(Up|Down|Left|Right)|Key[A-Z]|Escape|ShiftLeft)$/.test(key), where).toBe(true);
      expect(ms, where).toBeGreaterThan(0);
      if (until !== undefined) {
        expect(Object.keys(until), where).toHaveLength(1);
        expect(["near", "turned", "past", "lean", "rest"], where).toContain(Object.keys(until)[0]);
        // The ride's camera is waited for at either end of its way, which the world's count of it reaches exactly.
        if (until.lean !== undefined) expect([0, 1], where).toContain(until.lean);
      }
    }
  });

  it("wait on the world wherever the recording is of the bear or the camera getting somewhere: the stage's walk to the platform's edge, the descent's landing, and the ride's camera on its way to the crane and back", () => {
    // The stage's recording held its key 25 s and left the bear 2 to 5 m short of the edge in seven of nineteen runs' logs; the
    // descent ran a fixed 75 s, which a slower runner's 120 frames do not fit in.
    const named = (name: string) => recordings.find((r) => r.device === "desktop" && r.name === name)!;
    expect(named("stage")).toEqual({ device: "desktop", name: "stage", path: "/2026-10-20?pose=stage", click: "canvas", keys: [["ArrowUp", 80_000, { near: STAGE_EDGE }], [null, 3_000]] });
    expect(named("descent")).toEqual({ device: "desktop", name: "descent", path: "/2026-10-20", keys: [[null, 240_000, { past: "descent" }], [null, 5_000]] });
    // The rest hold their keys for a time and wait for nothing: the roam goes nowhere in particular, and the modes' steps are
    // each there for a line of the log.
    const waits = recordings.filter(({ keys }) => (keys ?? []).some(([, , until]) => until !== undefined)).map(({ device, name }) => `${device}-${name}`);
    expect(waits).toEqual(["tv-ride", "desktop-descent", "desktop-ride-settle-wake", "desktop-stage", "desktop-camera-stage", "desktop-camera-tower", "phone-camera-stage", "phone-camera-tower"]);
    // And every recording that presses a control for a state names the state.
    expect(recordings.filter(({ waitFor }) => waitFor).map(({ device, name }) => `${device}-${name}`)).toEqual(["tv-ride", "desktop-ride", "desktop-ride-straight", "phone-ride", "desktop-ride-settle-wake"]);
  });
});

describe("a step", () => {
  const FILE = "desktop-camera-stage.webm";

  it("holds a key with nothing to wait for its whole time, and reads nothing of the world", async () => {
    let reads = 0;
    const { page, keys, now } = standIn(() => { reads += 1; return null; });
    expect(await take(page, ["KeyB", 3000], { file: FILE, n: 1, now })).toEqual({ ms: 3000, failure: null });
    expect(keys).toEqual(["KeyB down at 0", "KeyB up at 3000"]);
    expect(reads).toBe(0);
    // With no key the bear stands, and nothing is pressed.
    const stood = standIn(() => null);
    expect(await take(stood.page, [null, 5000], { file: FILE, n: 2, now: stood.now })).toEqual({ ms: 5000, failure: null });
    expect(stood.keys).toEqual([]);
  });

  it("holds a key until the visitor is near a place, on a slow runner and on a fast one, and lets it go then", async () => {
    // The bear walks 0.6 m a frame from 5 m short of the edge: there on its ninth frame.
    for (const frameMs of [16, 500, 1500]) {
      const walk = (t: number) => at(STAGE[0] - (STAGE_REACH + Math.max(0, 5 - 0.6 * drawn(t, frameMs))), STAGE[1], 0, drawn(t, frameMs));
      const { page, keys, now } = standIn(walk), took = await take(page, ["ArrowUp", 30_000, { near: STAGE_EDGE }], { file: FILE, n: 1, now });
      expect(took.failure, `${frameMs} ms a frame`).toBeNull();
      // It ends within a poll of the frame that brought the bear there, however long that frame took to come.
      expect(took.ms, `${frameMs} ms a frame`).toBeGreaterThanOrEqual(9 * frameMs);
      expect(took.ms, `${frameMs} ms a frame`).toBeLessThan(9 * frameMs + POLL_MS);
      expect(keys, `${frameMs} ms a frame`).toEqual(["ArrowUp down at 0", `ArrowUp up at ${took.ms}`]);
    }
    // A bear a hand outside the place's reach is not there yet; one a hand inside it is.
    expect(arrived({ near: [0, 0, 11.1] }, at(11.2, 0), at(0, 0), {}, 0)).toBe(false);
    expect(arrived({ near: [0, 0, 11.1] }, at(0, -11), at(0, 0), {}, 0)).toBe(true);
  });

  it("fails when the visitor never comes near the place, in one line that says which recording and step, where the bear stood and where it should have been", async () => {
    // The bear stops 3 m short of the edge, as a hold cut off by the clock used to leave it, or because nothing took the key.
    const stuck = (t: number) => at(61.12 + Math.min(1.5, t / 1000), -53.12, -0.855, drawn(t, 800));
    const { page, keys, now } = standIn(stuck), took = await take(page, ["ArrowUp", 30_000, { near: STAGE_EDGE }], { file: FILE, n: 1, now });
    expect(took.failure).toBe(`${FILE}: step 1, ArrowUp, took its whole 30000 ms and the visitor had not come within 11.1 m of 73.2, -63.6: it stood at 62.62, -53.12 heading -0.855, 14.9 m from there`);
    expect(took.ms).toBe(30_000);
    // The key is let go all the same, so the next step starts from no key held.
    expect(keys).toEqual(["ArrowUp down at 0", "ArrowUp up at 30000"]);
  });

  it("holds a key until the visitor has turned so far from where the step began, either way, and fails when it has not", async () => {
    for (const way of [1, -1]) {
      const turning = (t: number) => at(64.886, -56.398, -0.855 + way * 0.08 * drawn(t, 500), drawn(t, 500));
      const { page, keys, now } = standIn(turning), took = await take(page, [way > 0 ? "ArrowLeft" : "ArrowRight", 80_000, { turned: Math.PI }], { file: FILE, n: 2, now });
      // Half a turn at 0.08 rad a frame is its fortieth frame.
      expect(took).toEqual({ ms: 40 * 500, failure: null });
      expect(keys).toHaveLength(2);
    }
    // A bear that turns a quarter of the way and stops.
    const short = standIn((t) => at(64.886, -56.398, -0.855 + Math.min(0.8, 0.08 * drawn(t, 500)), drawn(t, 500)));
    const took = await take(short.page, ["ArrowLeft", 80_000, { turned: Math.PI }], { file: FILE, n: 2, now: short.now });
    expect(took.failure).toBe(`${FILE}: step 2, ArrowLeft, took its whole 80000 ms and the visitor had not turned 3.14 rad: it stood at 64.886, -56.398 heading -0.055, 0.80 rad from the heading -0.855 it began at`);
    expect(short.keys).toEqual(["ArrowLeft down at 0", "ArrowLeft up at 80000"]);
  });

  it("stands until the world has left a mode, and fails when it has not: the opening's descent, which lands after 120 frames", async () => {
    const descent = (frameMs: number) => (t: number) => at(0, 104, 1.1, drawn(t, frameMs), [0.5, 0.5], drawn(t, frameMs) < 120 ? "descent" : "attract");
    const landed = standIn(descent(780));
    expect(await take(landed.page, [null, 240_000, { past: "descent" }], { file: "desktop-descent.webm", n: 1, now: landed.now })).toEqual({ ms: 120 * 780, failure: null });
    expect(landed.keys).toEqual([]);
    // A runner too slow for it, or a world that never lands.
    const slow = standIn(descent(2500)), took = await take(slow.page, [null, 240_000, { past: "descent" }], { file: "desktop-descent.webm", n: 1, now: slow.now });
    expect(took.failure).toBe("desktop-descent.webm: step 1, standing, took its whole 240000 ms and the world had not left its descent: its mode was descent, 96 frames on, and it stood at 0, 104 heading 1.1");
  });

  it("stands until the ride's camera is on the crane, or holds a key until it is back with the bears, by the world's own count of its way, and fails when it does not come", async () => {
    // The page settles two seconds in, and the camera then eases out over 60 frames, a sixtieth of the way a frame.
    const FILE = "desktop-ride-settle-wake.webm";
    const out = (frameMs: number) => (t: number) => { const f = drawn(t, frameMs), lean = t < 2000 ? 0 : Math.min(1, Math.round((1000 * (f - drawn(2000, frameMs))) / 60) / 1000); return riding(lean, f, t < 2000 ? "follow" : "drift"); };
    for (const frameMs of [16, 780]) {
      const { page, keys, now } = standIn(out(frameMs)), took = await take(page, [null, 122_000, { lean: 1 }], { file: FILE, n: 1, now });
      expect(took.failure, `${frameMs} ms a frame`).toBeNull();
      expect(took.ms, `${frameMs} ms a frame`).toBeGreaterThanOrEqual(2000 + 59 * frameMs);
      expect(took.ms, `${frameMs} ms a frame`).toBeLessThan(2000 + 61 * frameMs + POLL_MS);
      expect(keys).toEqual([]);
    }
    // On the way back Shift is held until the camera is with the bears, and let go then.
    const back = (t: number) => { const f = drawn(t, 500); return riding(Math.max(0, Math.round(1000 * (1 - f / 60)) / 1000), f, "follow"); };
    const home = standIn(back), returned = await take(home.page, ["ShiftLeft", 120_000, { lean: 0 }], { file: FILE, n: 3, now: home.now });
    expect(returned).toEqual({ ms: 60 * 500, failure: null });
    expect(home.keys).toEqual(["ShiftLeft down at 0", "ShiftLeft up at 30000"]);
    // A camera that stops short of the crane, as one would where the page never settled; and a world that left the ride, whose
    // camera is on neither rig.
    const short = standIn((t) => riding(0.6, drawn(t, 780))), stuck = await take(short.page, [null, 120_000, { lean: 1 }], { file: FILE, n: 1, now: short.now });
    expect(stuck.failure).toMatch(/^desktop-ride-settle-wake\.webm: step 1, standing, took its whole 120000 ms and the ride's camera had not come to the crane: it had gone 0\.6 of the way to the crane, \d+ frames on, and it stood at 0, 104 heading 1\.1$/);
    const left = standIn((t) => at(0, 104, 1.1, drawn(t, 500))), gone = await take(left.page, ["ShiftLeft", 120_000, { lean: 0 }], { file: FILE, n: 3, now: left.now });
    expect(gone.failure).toContain("the ride's camera had not come back to the bears: the world was in no ride, its mode walk");
    expect(left.keys).toEqual(["ShiftLeft down at 0", "ShiftLeft up at 120000"]);
    // A world out of a ride has no ride's camera at either end: neither is come to.
    expect(arrived({ lean: 0 }, { ...at(0, 0), ride: null }, at(0, 0), {}, 0)).toBe(false);
    expect(arrived({ lean: 0 }, at(0, 0), at(0, 0), {}, 0)).toBe(false);
    expect(arrived({ lean: 1 }, riding(0.999, 1), at(0, 0), {}, 0)).toBe(false);
    expect(arrived({ lean: 1 }, riding(1, 1), at(0, 0), {}, 0)).toBe(true);
  });

  // The camera's rest, as the page lets a step see it: the bear standing where it stood, and its head where it was in the frame.
  describe("that stands until the camera has rested", () => {
    // A camera that moves for `moving` frames after the bear stops, the head sliding down the frame, and is then still.
    const settling = (moving: number, frameMs: number) => (t: number) => { const f = drawn(t, frameMs); return at(64.886, -56.398, 2.292, f, [0.5, 0.6 + 0.002 * Math.min(f, moving)]); };

    it("ends once the picture has been still for REST_FRAMES frames of the world and REST_MS of the clock, whichever is longer", async () => {
      // On CI's desktop, 780 ms a frame: 25 frames of the camera's way, then twelve still ones, which take longer than a second.
      const slow = standIn(settling(25, 780)), rested = await take(slow.page, [null, 180_000, { rest: REST_FRAMES }], { file: FILE, n: 3, now: slow.now });
      expect(rested.failure).toBeNull();
      expect(rested.ms).toBeGreaterThanOrEqual((25 + REST_FRAMES) * 780);
      expect(rested.ms).toBeLessThan((25 + REST_FRAMES) * 780 + POLL_MS);
      // On a visitor's machine, 16 ms a frame: twelve frames are a fifth of a second, so the second is the longer.
      const fast = standIn(settling(75, 16)), took = await take(fast.page, [null, 180_000, { rest: REST_FRAMES }], { file: FILE, n: 3, now: fast.now });
      expect(took.failure).toBeNull();
      expect(took.ms).toBeGreaterThanOrEqual(75 * 16 + REST_MS);
      expect(took.ms).toBeLessThan(75 * 16 + REST_MS + 2 * POLL_MS);
      expect(slow.keys.concat(fast.keys)).toEqual([]);
    });

    it("starts its count again whenever the head moves in the frame or the bear does: a camera that rests, moves on and rests is at rest only the second time", async () => {
      // Still for ten frames; then the boom's goal leaps and the camera goes on for twenty; then still.
      const twice = (t: number) => { const f = drawn(t, 500); return at(64.886, -56.398, 2.292, f, [0.5, 0.6 + 0.002 * Math.max(0, Math.min(f - 10, 20))]); };
      const { page, now } = standIn(twice);
      expect((await take(page, [null, 180_000, { rest: REST_FRAMES }], { file: FILE, n: 3, now })).ms).toBe((30 + REST_FRAMES) * 500);
      // The bear itself still moving is no rest either, though its head keeps its place in the frame.
      const seen = {};
      expect(arrived({ rest: 2 }, at(1, 1, 0, 0), at(1, 1), seen, 0)).toBe(false);
      expect(arrived({ rest: 2 }, at(1, 1, 0, 5), at(1, 1), seen, 2000)).toBe(true);
      expect(arrived({ rest: 2 }, at(1.01, 1, 0, 9), at(1, 1), seen, 4000)).toBe(false);
      // Frames enough and too little of the clock, or the clock and too few frames: neither is rest.
      expect(arrived({ rest: 2 }, at(1.01, 1, 0, 30), at(1, 1), seen, 4000 + REST_MS - 1)).toBe(false);
      expect(arrived({ rest: 2 }, at(1.01, 1, 0, 10), at(1, 1), seen, 9000)).toBe(false);
      expect(arrived({ rest: 2 }, at(1.01, 1, 0, 11), at(1, 1), seen, 9000)).toBe(true);
    });

    it("fails when the camera never rests, as the first mend's swung between two places for ever, and says where the head was and how long it had been still", async () => {
      // The head swaps between two places in the frame, a frame each.
      const swinging = (t: number) => { const f = drawn(t, 780); return at(64.886, -56.398, 2.292, f, [0.5, f % 2 ? 0.71 : 0.74]); };
      const { page, keys, now } = standIn(swinging), took = await take(page, [null, 180_000, { rest: REST_FRAMES }], { file: FILE, n: 3, now });
      expect(took.ms).toBe(180_000);
      expect(took.failure).toMatch(/^desktop-camera-stage\.webm: step 3, standing, took its whole 180000 ms and the camera had not come to rest: the bear's head, at 0\.5, 0\.7[14] of the frame, had kept its place for [01] frames of the 12 it must; it stood at 64\.886, -56\.398 heading 2\.292$/);
      expect(keys).toEqual([]);
      // A page that does not say where the head lands, as in first person, never rests either.
      const blind = standIn((t) => at(64.886, -56.398, 2.292, drawn(t, 500), null));
      expect((await take(blind.page, [null, 20_000, { rest: REST_FRAMES }], { file: FILE, n: 3, now: blind.now })).failure).toContain("the page did not say where the bear's head lands in the frame");
    });
  });

  it("waits for the world to start before its key goes down, and fails without pressing anything when the world never starts", async () => {
    // The world starts four seconds after the page loaded: the key goes down then, and not into a page that would lose it.
    const late = standIn((t) => (t < 4000 ? null : at(STAGE[0] - STAGE_REACH, STAGE[1], 0, drawn(t, 500))));
    const took = await take(late.page, ["ArrowUp", 30_000, { near: STAGE_EDGE }], { file: FILE, n: 1, now: late.now });
    expect(took).toEqual({ ms: 0, failure: null });
    expect(late.keys).toEqual(["ArrowUp down at 4000", "ArrowUp up at 4000"]);
    expect(await (worldStarted as unknown as (page: unknown, ms: number, now: () => number) => Promise<World | null>)(standIn(() => null).page, 600, (() => { let t = 0; return () => (t += 100); })())).toBeNull();
    const never = standIn(() => null), lost = await take(never.page, ["ArrowUp", 30_000, { near: STAGE_EDGE }], { file: FILE, n: 1, now: never.now });
    expect(lost).toEqual({ ms: 0, failure: `${FILE}: step 1, ArrowUp, was not taken: the world had not said where the visitor stands ${WORLD_MS} ms after the page loaded` });
    expect(never.keys).toEqual([]);
    expect(never.now()).toBeGreaterThanOrEqual(WORLD_MS);
  });

  it("reads the world as the page tells it: where the visitor stands, the frames drawn, the mode, where the bear's head lands in the frame and how far a ride's camera has gone to the crane, or nothing before the world has started", async () => {
    const hill = { walker: { x: 1, z: 2, heading: 3, pitch: 0 }, frames: 7, mode: "walk", avatar: { view: "third", screen: [0.5, 0.62] }, ride: null, calls: 22 };
    // The page's own function, run here against a window of this test's making.
    const run = (window: unknown) => (readWorld as unknown as (page: unknown) => Promise<World | null>)({ evaluate: async (read: () => unknown) => new Function("window", `return (${read})()`)(window) });
    expect(await run({ __hill: hill })).toEqual({ walker: hill.walker, frames: 7, mode: "walk", screen: [0.5, 0.62], ride: null });
    // In a ride, how far its camera has gone to the crane.
    expect(await run({ __hill: { ...hill, mode: "drift", ride: { lean: 0.4, yaw: 0 } } })).toMatchObject({ mode: "drift", ride: { lean: 0.4, yaw: 0 } });
    expect(await run({ __hill: { ...hill, avatar: { view: "first", screen: null } } })).toMatchObject({ screen: null });
    expect(await run({})).toBeNull();
    expect(await run({ __hill: { placeMs: 12 } })).toBeNull();
  });

  it("says of each wait that ran out what had not come", () => {
    const start = at(0, 0, 1, 10), now = at(3, 4, 1.5, 40, [0.25, 0.75], "descent");
    expect(missed({ near: [0, 0, 2] }, now, start, {})).toBe("the visitor had not come within 2 m of 0, 0: it stood at 3, 4 heading 1.5, 5.0 m from there");
    expect(missed({ turned: 2 }, now, start, {})).toBe("the visitor had not turned 2.00 rad: it stood at 3, 4 heading 1.5, 0.50 rad from the heading 1 it began at");
    expect(missed({ past: "descent" }, now, start, {})).toBe("the world had not left its descent: its mode was descent, 30 frames on, and it stood at 3, 4 heading 1.5");
    expect(missed({ lean: 1 }, { ...now, ride: { lean: 0.6, yaw: 0 } }, start, {})).toBe("the ride's camera had not come to the crane: it had gone 0.6 of the way to the crane, 30 frames on, and it stood at 3, 4 heading 1.5");
    expect(missed({ lean: 0 }, { ...now, mode: "walk", ride: null }, start, {})).toBe("the ride's camera had not come back to the bears: the world was in no ride, its mode walk, 30 frames on, and it stood at 3, 4 heading 1.5");
    expect(missed({ rest: 12 }, now, start, { frame: 33 })).toBe("the camera had not come to rest: the bear's head, at 0.25, 0.75 of the frame, had kept its place for 7 frames of the 12 it must; it stood at 3, 4 heading 1.5");
  });
});

describe("a recording's control", () => {
  // A stand-in page whose selectors come or do not: those in `there` appear, and the clicks are kept.
  const pageWith = (there: string[]) => {
    const clicked: string[] = [], asked: [string, number][] = [];
    return { clicked, asked, page: { waitForSelector: async (selector: string, { timeout }: { timeout: number }) => { asked.push([selector, timeout]); if (!there.includes(selector)) throw new Error("timeout"); }, click: async (selector: string) => { clicked.push(selector); } } };
  };
  const pressed = press as unknown as (page: unknown, click: string, waitFor: string | undefined, file: string) => Promise<{ found: boolean; failure: string | null }>;
  const BUTTON = RIDE, ON = `${RIDE}[aria-pressed='true']`;

  it("is pressed once it appears, and the state it names must come: a recording of a control that did nothing fails the run", async () => {
    const works = pageWith([BUTTON, ON]);
    expect(await pressed(works.page, BUTTON, ON, "desktop-ride.webm")).toEqual({ found: true, failure: null });
    expect(works.clicked).toEqual([BUTTON]);
    expect(works.asked).toEqual([[BUTTON, PRESS_MS], [ON, PRESS_MS]]);
    const dead = pageWith([BUTTON]);
    expect(await pressed(dead.page, BUTTON, ON, "desktop-ride.webm")).toEqual({ found: true, failure: `desktop-ride.webm: ${BUTTON} was pressed and ${ON} had not come 15000 ms later` });
    expect(dead.clicked).toEqual([BUTTON]);
    // A control that names no state is pressed and no more.
    expect(await pressed(pageWith(["canvas"]).page, "canvas", undefined, "desktop-roam.webm")).toEqual({ found: true, failure: null });
  });

  it("is not pressed where it never appears: the recording is skipped, and the run fails for the file its plan names and it did not save", async () => {
    const none = pageWith([]);
    expect(await pressed(none.page, BUTTON, ON, "desktop-ride.webm")).toEqual({ found: false, failure: null });
    expect(none.clicked).toEqual([]);
  });
});

describe("the shoot's script", () => {
  const script = readFileSync(join(ROOT, ".github/screenshots/shoot.mjs"), "utf8");
  const loop = script.slice(script.indexOf("of plan.recordings) {"), script.indexOf("// The job summary shows the sweep's peaks"));

  it("takes every recording's steps and its control through recordings.mjs, and fails the run for each that failed", () => {
    expect(loop.length).toBeGreaterThan(1500);
    expect(loop).toContain("const pressed = await press(page, click, waitFor, file);");
    expect(loop).toContain("if (pressed.failure) failures.push(pressed.failure);");
    expect(loop).toContain("const taken = await step(page, [key, ms, until], { file, n: n + 1 });");
    expect(loop).toContain("if (taken.failure) failures.push(taken.failure);");
    // A world that never started takes no key and no push of the stick.
    expect(loop).toContain("if ((keys || stick) && (await worldStarted(page)) === null) {\n      failures.push(`${file}: the world had not said where the visitor stands ${WORLD_MS} ms after the page loaded, so its keys went to nothing`);");
    // Nothing in a recording is logged as missed and then recorded as if it had not been.
    expect(loop).not.toMatch(/recording anyway|waitFor timed out|keyboard\.(down|up)\(/);
    // A control that is not there at all, the button or the stick, skips the recording, and fails the run in one line that says
    // why, which the plan's check does not repeat for the file that was not saved (perFile, ride.mjs's fileFailures).
    expect(loop.match(/console\.log\(`\$\{file\}: [^`]*absent`\);\n\s+perFile\.fail\(file, [^\n]*absent, so nothing was recorded[^\n]*, false\);\n\s+await context\.close\(\);\n\s+continue/g)).toHaveLength(2);
    expect(script).toContain("failures.push(...planFailures(planFiles(plan), await writtenSince(outDir, began), perFile.untaken));");
  });

  it("has its list of recordings from recordings.mjs, and none of its own", () => {
    expect(script).toContain('import { EASE_MS, press, RECORD_MS, RECORDINGS, step, WORLD_MS, worldStarted } from "./recordings.mjs";');
    expect(script).not.toMatch(/const (RECORDINGS|CAMERA_WALKS|RECORD_MS) =/);
    expect(script).toContain("recordings: RECORDINGS,");
  });
});
