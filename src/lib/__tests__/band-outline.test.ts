import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SIX } from "../../../public/world/band.js";
import { FACING, FIRST_EYE, height, SHELF_Y, STAGE } from "../../../public/world/ground.js";
import { lineupOn } from "../../../public/world/lineup.js";
import { budgetFor } from "../../../public/world/quality.js";
import { PANEL } from "../../../public/world/stage.js";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { type Built, type Camera, CAMERAS, DUSK, draw, filmOf, FLASH_CAMERAS, flickerOf, lens, liftShown, NIGHT, outlineChecks, PHASES, pieces, pixelOf, playing, POSES, RUNGS, specks, STAND_PART, standsBefore } from "./band-outline";

// The band's outlines as the shoot's devices draw them (band-outline.ts): the cameras the checks draw from, held to the shoot's poses,
// and the six of 1979 to 1990 and of 1992 to 1995 (lineup.js), as the shoot's fixed day shows them, held to the checks every line-up
// keeps. The first test holds each camera to its pose, so a pose that moved fails here before it leaves the checks measuring another
// view.

beforeAll(() => {
  // quality.js reads the device's pixel ratio for a desktop's budget.
  vi.stubGlobal("window", { devicePixelRatio: 1 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the outlines' cameras", () => {
  it("is drawn from the shoot's own cameras: each looks along its pose's heading, a first-person one from its pose's eye, and a phone's canvas fills its screen", () => {
    for (const cam of [...CAMERAS, ...FLASH_CAMERAS]) {
      const pose = POSES[cam.pose], level = Math.hypot(cam.look[0], cam.look[2]);
      expect([cam.name, Math.abs(Math.atan2(-cam.look[0] / level, -cam.look[2] / level) - pose.heading) < 0.005]).toEqual([cam.name, true]);
      // The third person's camera stands behind its bear, on the line the bear looks along; the first person's at the eye.
      const back = { x: pose.x - cam.at[0], z: pose.z - cam.at[2] };
      expect([cam.name, Math.abs(back.x * cam.look[2] - back.z * cam.look[0]) / level < 0.05]).toEqual([cam.name, true]);
      if (cam.pose.startsWith("band")) {
        expect([cam.name, Math.hypot(back.x, back.z) < 0.01, Math.abs(cam.at[1] - height(pose.x, pose.z) - FIRST_EYE) < 0.01, Math.abs(Math.asin(cam.look[1]) - pose.pitch) < 0.001]).toEqual([cam.name, true, true, true]);
      }
      const device = cam.name.split(" ")[0], budget = budgetFor(device === "desktop" ? "desktop" : "phone");
      expect([cam.name, cam.fov]).toEqual([cam.name, budget.fov]);
      if (device !== "desktop") {
        const wide = device === "phone" ? 390 : 360;
        expect([cam.name, cam.cols, cam.screen]).toEqual([cam.name, Math.round(wide * budget.scale), (wide * 2) / cam.cols]);
      }
    }
  });
});

// The film the checks read (band-outline.ts filmOf) draws only what moved since the frame before and looks only at what that reached.
// This holds it to drawing each frame whole, as `draw` does, and counting as `specks` and `pieces` do: with the six as built, not
// fitted to the canvas, so that their parts come apart: from the path on a desktop drawn at a quarter of its pixels each way, from
// the band pose and the back of the crowd on a phone, and from there at the phone's lowest rung, through the first quarter of a
// second, at three places of the grid; and from a camera so small that they meet.
describe("the outlines' film", () => {
  it("finds frame by frame what drawing each frame whole finds: the same specks, the same counts of them, the same pieces with no trunk, the same stands that stand whole and the same pieces that hold two players' trunks", () => {
    const roles = ["lead", "rhythm", "bass", "drums", "drums", "keys"], n = roles.length, seconds = 0.25, places = [[0, 0], [0.5, 0.25], [0.75, 0.75]];
    const label = (bits: number) => [...roles.map((_, k) => k).filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << n) ? ["monitor"] : [])].join(" and ");
    const path = CAMERAS.find((c) => c.name === "desktop path")!, small = { ...path, name: "desktop path at a quarter", cols: path.cols / 4, rows: path.rows / 4 };
    const [band, crowd, low] = ["phone band", "phone crowd", "phone crowd at rung 3"].map((name) => [...CAMERAS, ...RUNGS].find((c) => c.name === name)!);
    // Where the band is a pixel or two a player, so that they meet: the back of the crowd on a phone at a sixth of its lowest rung's
    // pixels each way, taken as a rung and as not.
    const least = { ...low, name: "phone crowd at rung 9", cols: Math.round(low.cols / 6), rows: Math.round(low.rows / 6) }, tiny = { ...least, name: "phone crowd at a sixth of rung 3" };
    const cams = [small, tiny, band, crowd, low, least];
    const film = filmOf(roles, label, cams, { rate: () => 60, seconds, fit: () => 0 }), played = playing(roles, 0);
    const found = { specks: [] as string[], counts: [] as string[], apart: new Set<string>(), alone: new Set<string>(), standing: new Set<string>(), joined: new Set<string>(), touched: new Set<string>() }, got = { counts: [] as string[] };
    for (let f = 0; f <= seconds * 60; f++) {
      played.to(f);
      const tris = Array.from({ length: played.n }, (_, t) => ({ at: [0, 1, 2].map((c) => new THREE.Vector3(...played.world.slice(t * 9 + c * 3, t * 9 + c * 3 + 3))), owner: played.owner[t], trunk: played.trunk[t] === 1, crash: ["", "cymbal", "pole"][played.crash[t]], bone: "", colour: [0, 0, 0], stand: played.stand[t] > 0, reach: played.stand[t] === 2 }));
      const at = `${(f / 60).toFixed(3)} s`;
      for (const cam of cams) for (const [dx, dy] of places) {
        const phone = cam.name.startsWith("phone"), rung = cam.name.includes(" at rung ");
        if (!phone) { const k = specks(tris, cam, dx, dy); if (k) found.specks.push(`${cam.name} at ${at}, ${dx},${dy}, at night and at dusk: ${k}`); }
        for (const tone of [NIGHT, DUSK]) {
          if (cam.name === "phone band") { const k = specks(tris, cam, dx, dy, tone); if (k) found.specks.push(`${cam.name} at ${at}, ${dx},${dy}, panel ${tone.panel}: ${k}`); }
          if (cam.name === "phone crowd") {
            const place = PHASES.findIndex(([a, b]) => a === dx && b === dy);
            found.counts.push(`${at} ${dx},${dy} ${tone.panel}: ${specks(tris, cam, dx, dy, tone)}`);
            got.counts.push(`${at} ${dx},${dy} ${tone.panel}: ${film.counts.get(`${cam.name} ${tone.panel}`)![f * PHASES.length + place]}`);
          }
        }
        const { W, H, mask, trunks, crashes, solid, stands, standing: still } = draw(tris, cam, dx, dy);
        // Two players meet in a piece of everything but the stands.
        for (const piece of pieces(W, H, (o) => solid[o] !== 0)) {
          let trunk = 0;
          for (const o of piece) trunk |= trunks[o];
          const whose = roles.map((_, k) => k).filter((k) => trunk & (1 << k));
          if (dx === 0 && dy === 0 && whose.length > 1 && rung) for (let a = 0; a + 1 < whose.length; a++) found.touched.add(`rung ${cam.name.slice(-1)}: ${whose[a]} and ${whose[a + 1]}`);
          else if (dx === 0 && dy === 0 && whose.length > 1) found.joined.add(`${cam.name} at ${at}: ${whose.join(" and ")}`);
        }
        const standing = roles.map((_, k) => still.reduce((sum, b) => sum + ((b >> k) & 1), 0));
        for (const piece of pieces(W, H, (o) => mask[o] !== 0)) {
          let trunk = 0, owners = 0, kit = 0;
          for (const o of piece) { trunk |= trunks[o]; owners |= mask[o]; kit |= crashes[o]; }
          if (trunk) continue;
          const held = roles.map((_, k) => piece.filter((o) => (still[o] >> k) & 1).length);
          if (piece.every((o) => stands[o] && !solid[o]) && held.some((got) => got > 0) && held.every((got, k) => got === 0 || got === standing[k])) {
            if (dx === 0 && dy === 0) found.standing.add(`${cam.name}: ${label(owners)}`);
            continue;
          }
          const crash = piece.every((o) => crashes[o]);
          if (dx === 0 && dy === 0 && !rung) found.alone.add(`${label(owners)}${crash ? " crash" : ""}`);
          if (phone && owners !== 1 << n && !(kit === 3 && crash)) found.apart.add(`${cam.name} at ${at}, ${dx},${dy}: ${label(owners)}${kit ? ` (${["", "cymbal", "pole", "cymbal and pole"][kit]})` : ""}`);
        }
      }
    }
    const atPlaces = (line: string) => places.some(([dx, dy]) => line.includes(`, ${dx},${dy},`) || line.includes(`, ${dx},${dy}:`));
    // As built, the six come apart in every one of these ways; and they meet, at a rung and not.
    expect([found.specks.length > 0, found.counts.some((line) => !line.endsWith(": 0")), found.apart.size > 0, found.joined.size > 0, found.touched.size > 0]).toEqual([true, true, true, true, true]);
    expect(film.specks.filter(atPlaces).sort()).toEqual(found.specks.sort());
    expect(got.counts).toEqual(found.counts);
    // The film tells of a piece with no trunk in the frame it comes, or changes, in; drawn whole, in every frame it stands.
    const apart = [...film.apart].filter(atPlaces), timeless = (line: string) => line.replace(/ at [\d.]+ s,/, ",");
    expect(apart.filter((line) => !found.apart.has(line))).toEqual([]);
    expect([...new Set([...found.apart].map(timeless))].sort()).toEqual([...new Set(apart.map(timeless))].sort());
    expect([...film.alone].sort()).toEqual([...found.alone].sort());
    expect([...film.standing].sort()).toEqual([...found.standing].sort());
    // So too a piece that holds two players' trunks, but at a rung, where the pairs that meet are told.
    expect(film.joined.filter((line) => !found.joined.has(line))).toEqual([]);
    expect([...new Set([...found.joined].map((line) => line.replace(/ at [\d.]+ s:/, ":")))].sort()).toEqual([...new Set(film.joined.map((line) => line.replace(/ at [\d.]+ s:/, ":")))].sort());
    expect([...film.touched].sort()).toEqual([...found.touched].sort());
  }, 60_000);
});

// The flicker's count drawn whole, as it was counted before band-outline.ts's `flickerOf`: every frame's every triangle on the GPU's
// grid, every screen pixel over the band's box shaded, and every block read, from frames of the band's corners in the world.
function wholeFlicker(film: Float64Array[], cam: Camera, dx: number, dy: number) {
  const W = cam.cols, H = cam.rows, k = cam.screen, camera = lens(cam);
  const e = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const snap = (value: number) => Math.round(value * 256) / 256;
  const screen = (x: number, y: number, z: number) => {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    return [(((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2) * W + dx, ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2) * H + dy];
  };
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const p = new THREE.Vector3((sx * PANEL.w) / 2, PANEL.y - PANEL.h / 2 + sy * PANEL.h, PANEL.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACING);
    return screen(p.x + STAGE[0], p.y + SHELF_Y, p.z + STAGE[1]);
  });
  const lit = (x: number, y: number) => corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= 0; }) ||
    corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0; });
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const at of film) for (let i = 0; i < at.length; i += 3) { const [x, y] = screen(at[i], at[i + 1], at[i + 2]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bx = Math.max(0, Math.floor(x0) - 2), by = Math.max(0, Math.floor(y0) - 2), bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by;
  const sx = Math.ceil(bx * k), sy = Math.ceil(by * k), sw = Math.floor((bx + bw) * k) - sx - 1, sh = Math.floor((by + bh) * k) - sy - 1;
  const ground = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) ground[j * sw + i] = lit((sx + i + 0.5) / k, (sy + j + 0.5) / k) ? 0.3 : 0.05;
  const grids = [[0, 0], [1, 1], [1, 0], [0, 1]].map(([ox, oy]) => {
    const cols = Math.floor((sw - ox) / 2), rows = Math.floor((sh - oy) / 2), n = cols * rows;
    return { ox, oy, cols, rows, way: new Int8Array(n), turn: new Float32Array(n), low: new Float32Array(n).fill(1), high: new Float32Array(n), swings: Array.from({ length: n }, () => [] as number[]) };
  });
  let most = 0;
  film.forEach((at, f) => {
    const mask = new Uint8Array(bw * bh), p = new Float64Array((at.length / 3) * 2);
    for (let i = 0, j = 0; i < at.length; i += 3, j += 2) { const [x, y] = screen(at[i], at[i + 1], at[i + 2]); p[j] = snap(x); p[j + 1] = snap(y); }
    for (let t = 0; t < p.length; t += 6) {
      const ax = p[t], ay = p[t + 1], qx = p[t + 2], qy = p[t + 3], cx = p[t + 4], cy = p[t + 5];
      const area = (qx - ax) * (cy - ay) - (qy - ay) * (cx - ax);
      if (area === 0) continue;
      const minx = Math.max(bx, Math.ceil(Math.min(ax, qx, cx) - 0.5)), maxx = Math.min(bx + bw - 1, Math.floor(Math.max(ax, qx, cx) - 0.5));
      const miny = Math.max(by, Math.ceil(Math.min(ay, qy, cy) - 0.5)), maxy = Math.min(by + bh - 1, Math.floor(Math.max(ay, qy, cy) - 0.5));
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const mx = x + 0.5, my = y + 0.5;
        if (((qx - ax) * (my - ay) - (qy - ay) * (mx - ax)) / area < 0 || ((cx - qx) * (my - qy) - (cy - qy) * (mx - qx)) / area < 0 || ((ax - cx) * (my - cy) - (ay - cy) * (mx - cx)) / area < 0) continue;
        mask[(y - by) * bw + (x - bx)] = 1;
      }
    }
    const covered = (x: number, y: number) => (x < bx || y < by || x >= bx + bw || y >= by + bh ? 0 : mask[(y - by) * bw + (x - bx)]);
    const lum = new Float32Array(sw * sh);
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const u = (sx + i + 0.5) / k - 0.5, w = (sy + j + 0.5) / k - 0.5, u0 = Math.floor(u), v0 = Math.floor(w), fu = u - u0, fv = w - v0;
      const share = (1 - fu) * (1 - fv) * covered(u0, v0) + fu * (1 - fv) * covered(u0 + 1, v0) + (1 - fu) * fv * covered(u0, v0 + 1) + fu * fv * covered(u0 + 1, v0 + 1);
      lum[j * sw + i] = ground[j * sw + i] + (0.01 - ground[j * sw + i]) * share;
    }
    for (const g of grids) for (let b = 0; b < g.cols * g.rows; b++) {
      const X = (b % g.cols) * 2 + g.ox, Y = Math.floor(b / g.cols) * 2 + g.oy;
      const value = (lum[Y * sw + X] + lum[Y * sw + X + 1] + lum[(Y + 1) * sw + X] + lum[(Y + 1) * sw + X + 1]) / 4;
      let swing = 0;
      if (g.way[b] === 0) {
        g.low[b] = Math.min(g.low[b], value); g.high[b] = Math.max(g.high[b], value);
        swing = value - g.low[b] >= 0.1 ? 1 : g.high[b] - value >= 0.1 ? -1 : 0;
      } else if (g.way[b] === 1) { if (value > g.turn[b]) g.turn[b] = value; else if (g.turn[b] - value >= 0.1) swing = -1; }
      else if (value < g.turn[b]) g.turn[b] = value; else if (value - g.turn[b] >= 0.1) swing = 1;
      if (!swing) continue;
      g.way[b] = swing; g.turn[b] = value;
      const list = g.swings[b];
      list.push(f);
      let first = list.length - 1;
      while (first > 0 && f - list[first - 1] <= 60) first--;
      most = Math.max(most, list.length - first);
    }
  });
  return { most, swings: grids.flatMap((g) => g.swings.flatMap((list, b) => list.map((f) => `${g.ox},${g.oy} ${b} ${f}`))) };
}

// The flicker's count (band-outline.ts flickerOf) puts on each canvas only what moved, draws the still parts once and shades again
// only the screen's pixels over a canvas pixel that changed. This holds it to drawing each frame whole: the six, played from rest
// four seconds at 150 a minute and a second and a half more at 91, from the stage pose and the back of the crowd on a phone, at two
// places of the grid.
describe("the flicker's count", () => {
  it("finds what drawing each frame whole finds: the same swings at the same blocks in the same frames, and the same most in a second", () => {
    const cams = [FLASH_CAMERAS[0], CAMERAS.find((c) => c.name === "phone crowd")!], offsets = [[0, 0], [0.25, 0.75]], lead = 4, seconds = 1.5;
    const counted = flickerOf(SIX, 150, lead, 91, seconds, cams, offsets);
    const played = playing(SIX, pixelOf(FLASH_CAMERAS[0]), 60, (frame) => (frame <= lead * 60 ? 150 : 91)), film: Float64Array[] = [];
    for (let f = 0; f < seconds * 60; f++) {
      played.to(lead * 60 + 1 + f);
      film.push(played.world.slice());
    }
    let swings = 0;
    cams.forEach((cam, c) => offsets.forEach(([dx, dy], o) => {
      const whole = wholeFlicker(film, cam, dx, dy);
      swings += whole.swings.length;
      expect([cam.name, dx, dy, counted[c][o].most, [...counted[c][o].swings].sort()]).toEqual([cam.name, dx, dy, whole.most, [...whole.swings].sort()]);
    }));
    // The six swing blocks in that second and a half.
    expect(swings).toBeGreaterThan(100);
  }, 60_000);
});

// The outlines' rules for a stand (band-outline.ts filmOf), each half held on the six as built with one part moved: a stand, its base
// and its boom may cross another player, but no two players' own parts meet; and a stand is never a speck, but joined to a player
// or standing whole on its base. Drawn from the front of the crowd and from among it on a desktop, and from the back of the crowd
// on a phone, in the first frames of the film.
describe("the outlines' rules for a stand", () => {
  type Part = { of: string; by: number | null; from: number; count: number };
  const roles = SIX, n = roles.length, seconds = 0.05, places = () => [[0, 0]];
  const label = (bits: number) => [...roles.map((_, k) => k).filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << n) ? ["monitor"] : [])].join(" and ");
  const cams = ["desktop band", "desktop among", "phone crowd"].map((name) => CAMERAS.find((c) => c.name === name)!);
  const film = (alter: ((built: Built) => void) | null, standsJoin = false) => filmOf(roles, label, cams, { rate: () => 60, seconds, places, alter, standsJoin });
  // The corners of player `k`'s still parts of a kind, in the band's frame, and their middle across the floor.
  const cornersOf = (built: Built, k: number, of: string) => {
    const at = built.still.geometry.getAttribute("position"), out: number[] = [];
    for (const part of built.still.userData.parts as Part[]) if (part.by === k && part.of === of) for (let i = part.from; i < part.from + part.count; i++) out.push(i);
    return { at, out, x: out.reduce((sum, i) => sum + at.getX(i), 0) / out.length, z: out.reduce((sum, i) => sum + at.getZ(i), 0) / out.length };
  };
  // Player `k`'s still parts of a kind sheared toward player `to`: each corner moved toward `to`'s head as far as it stands out from
  // `k`'s own head across the floor, so what is at the head stays there and what stands furthest out lands on `to`'s.
  const shear = (k: number, of: string, to: number) => (built: Built) => {
    const mine = cornersOf(built, k, "head"), theirs = cornersOf(built, to, "head"), part = cornersOf(built, k, of), { at, out } = part;
    const reach = Math.max(...out.map((i) => Math.abs(at.getX(i) - mine.x)));
    for (const i of out) {
      const share = Math.abs(at.getX(i) - mine.x) / reach;
      at.setXYZ(i, at.getX(i) + share * (theirs.x - part.x), at.getY(i), at.getZ(i) + share * (theirs.z - part.z));
    }
  };
  // The players as STAGING stands them, from the crowd's left: the lead (0), whose stand stands on its left, toward the bass (1); the
  // drummers (2, 3), the rhythm (4) and the keys (5), whose keyboard reaches toward the rhythm.
  it("lets a stand cross another player's outline: the lead's stand drawn out over the bass joins their outlines as the rules had it before, and joins no one now", () => {
    const over = shear(0, STAND_PART, 1);
    expect(film(over, true).joined.some((line) => line.endsWith(": 0 and 1"))).toBe(true);
    const now = film(over);
    expect([now.joined, [...now.alone].filter((piece) => !["monitor", "3 crash"].includes(piece)), [...now.apart]]).toEqual([[], [], []]);
  }, 60_000);

  it("keeps two players' own parts apart: the keys' keyboard drawn out over the rhythm joins their outlines", () => {
    const joined = film(shear(5, "keyboard", 4)).joined;
    expect(joined.some((line) => line.endsWith(": 4 and 5"))).toBe(true);
  }, 60_000);

  // The keys' microphone's stand and base set out along the stage's line from them till their nearest corner stands a metre past the
  // furthest of the rest of their still parts, their keyboard, and its boom and head drawn away under the floor: the film asks of a
  // stand that stands apart that its stand and base stand whole, and lets its boom and head be, which reach to its player's mouth
  // and may meet the head apart from it (filmOf). It stands whole on its base, apart, and is let be; with its stand a twentieth as
  // stout, unfitted, it comes apart into pieces of a stand, and is not.
  const away = (thin: number) => (built: Built) => {
    const { at, out } = cornersOf(built, 5, STAND_PART), parts = built.still.userData.parts as Part[], pole = parts.find((part) => part.by === 5 && part.of === STAND_PART)!;
    let x = 0, z = 0;
    for (let i = pole.from; i < pole.from + pole.count; i++) { x += at.getX(i) / pole.count; z += at.getZ(i) / pole.count; }
    for (let i = pole.from; i < pole.from + pole.count; i++) at.setXYZ(i, x + (at.getX(i) - x) * thin, at.getY(i), z + (at.getZ(i) - z) * thin);
    let edge = -Infinity, near = Infinity;
    for (const part of parts) if (part.by === 5 && part.of !== STAND_PART) for (let i = part.from; i < part.from + part.count; i++) edge = Math.max(edge, at.getX(i));
    for (const i of out) near = Math.min(near, at.getX(i));
    for (const i of out) at.setX(i, at.getX(i) + edge + 1 - near);
    // Its head and its boom (band.js `microphone`: the stand, the head, the boom and the base).
    parts.filter((part) => part.by === 5 && part.of === STAND_PART).slice(1, 3).forEach((part) => { for (let i = part.from; i < part.from + part.count; i++) at.setXYZ(i, 0, -100, 0); });
  };
  it("never leaves a stand as a speck: one that stands whole on its base apart from its player is let be, and one that comes apart is not", () => {
    const whole = film(away(1));
    expect([[...whole.standing].sort(), [...whole.alone].filter((piece) => !["monitor", "3 crash"].includes(piece)), [...whole.apart], whole.specks]).toEqual([cams.map((cam) => `${cam.name}: 5`).sort(), [], [], []]);
    const broken = film(away(0.05));
    expect([broken.standing.size, [...broken.alone].includes("5"), [...broken.apart].some((piece) => piece.endsWith(": 5"))]).toEqual([0, true, true]);
  }, 60_000);

  // What shows of a keyboard player's lift is counted with the stands left out (band-outline.ts `shown`): from the front, the keys
  // player's own stand, beside them, stands behind the right hand at the top of its lift, and with the stands counted the arm showed
  // less against the panel. So with every stand drawn away, each corner of it far under the floor, the keys player shows as much.
  it("lets a stand stand behind a keyboard player's lifted hand: with every stand drawn away, the keys player's lifts show as much", () => {
    const gone = (built: Built) => {
      const at = built.still.geometry.getAttribute("position");
      for (const part of built.still.userData.parts as Part[]) if (part.of === STAND_PART) for (let i = part.from; i < part.from + part.count; i++) at.setXYZ(i, 0, -100, 0);
    };
    expect(liftShown(roles, 5)).toEqual(liftShown(roles, 5, undefined, gone));
  }, 60_000);
});

// What a microphone stands before (band-outline.ts `standsBefore`), with the six's microphones moved where they stood or might: each
// part of a microphone moved in its player's own frame, the stand and its base to the foot given, the stand's top to the height
// given, and the boom from there to the microphone where it is; or the microphone's head lifted. Each is found from where it shows
// most: the front of the crowd on a desktop, or among the crowd. The six, as SIX numbers them: the lead 0, the bass 1, the
// drummers 2 and 3, the rhythm 4 and the keys 5.
describe("what a microphone stands before", () => {
  type Part = { of: string; by: number | null; from: number; count: number };
  type Vec = { x: number; y: number; z: number };
  const restand = (k: number, foot: [number, number], high: number) => (built: Built) => {
    const at = built.still.geometry.getAttribute("position"), g = built.players[k].g.matrix, back = g.clone().invert();
    const [stand, , boom, base] = (built.still.userData.parts as Part[]).filter((part) => part.by === k && part.of === STAND_PART);
    const corners = (run: Part) => Array.from({ length: run.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(at, run.from + i).applyMatrix4(back));
    const pole = corners(stand), arm = corners(boom), low = corners(base), mean = (vs: Vec[], axis: "x" | "z") => vs.reduce((sum, v) => sum + v[axis], 0) / vs.length;
    const top = new THREE.Vector3(mean(pole, "x"), Math.max(...pole.map((v) => v.y)), mean(pole, "z"));
    const to = new THREE.Vector3(foot[0], high, foot[1]), shift = new THREE.Vector3(foot[0] - top.x, 0, foot[1] - top.z);
    // The boom's far end: the ring of its corners furthest from the stand's top. Each corner of it moves with the top as far as it
    // stands from that end, so the end stays at the microphone.
    const far = Math.max(...arm.map((v) => v.distanceTo(top))), ring = arm.filter((v) => v.distanceTo(top) > far - 0.03);
    const end = ring.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(ring.length), along = end.clone().sub(top);
    const put = (run: Part, vs: Vec[]) => vs.forEach((v, i) => { const w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(g); at.setXYZ(run.from + i, w.x, w.y, w.z); });
    put(stand, pole.map((v) => new THREE.Vector3(v.x + shift.x, (v.y * high) / top.y, v.z + shift.z)));
    put(base, low.map((v) => v.clone().add(shift)));
    put(boom, arm.map((v) => v.clone().addScaledVector(to.clone().sub(top), 1 - Math.min(1, Math.max(0, v.clone().sub(top).dot(along) / along.lengthSq())))));
  };
  const lift = (k: number, by: number) => (built: Built) => {
    const at = built.still.geometry.getAttribute("position"), g = built.players[k].g.matrix, back = g.clone().invert();
    const head = (built.still.userData.parts as Part[]).filter((part) => part.by === k && part.of === STAND_PART)[1];
    for (let i = head.from; i < head.from + head.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(at, i).applyMatrix4(back); v.y += by; v.applyMatrix4(g); at.setXYZ(i, v.x, v.y, v.z); }
  };
  const all = (...alters: ((built: Built) => void)[]) => (built: Built) => alters.forEach((alter) => alter(built));
  // What is found, each kind once, from one camera.
  const finds = (camera: string, alter: ((built: Built) => void) | null) =>
    [...new Set(standsBefore(SIX, CAMERAS.filter((c) => c.name === camera), { alter }).map((line) => line.slice(line.indexOf(": ") + 2, line.lastIndexOf(": "))))].sort();
  it("finds nothing of the six as they stand, and the same with a microphone moved to where it stands", () => {
    expect([finds("desktop band", null), finds("desktop band", restand(1, [-0.385, -0.04], 1.2))]).toEqual([[], []]);
  }, 60_000);
  // Where the guitarists' and the bass's microphones stood before: their stands 52 cm out on the side they fret on and 10 cm back,
  // the tops at the mouth's height, 1.6, as the keys' was. Each boom was a level bar over the face from the front of the crowd: its
  // player's neck crossed it, the rhythm's stand stood before the keys, and the keys' boom lay across the rhythm's guitar. (On the
  // side they strum on, a level boom at 1.6 stands before no head above the mouth, and lies across no instrument: band.test.ts holds
  // each boom to its rise.)
  it("finds the booms where they stood, level with the face: across each guitar's neck, and the rhythm's stand and the keys' boom before each other's instruments", () => {
    const keys = (built: Built) => restand(5, [(built.players[5].g.position.x > 0 ? -1 : 1) * 0.52, -0.1], 1.6)(built);
    expect(finds("desktop band", all(restand(0, [0.52, -0.1], 1.6), restand(1, [0.52, -0.1], 1.6), restand(4, [0.52, -0.1], 1.6), keys))).toEqual(
      ["0's boom across its own instrument", "1's boom across its own instrument", "4's boom across its own instrument", "4's stand before 5's instrument", "5's boom across 4's instrument"]);
  }, 60_000);
  it("finds a boom that rises to the mouth on the side a guitarist frets on: across the neck, which rises there", () => {
    expect(finds("desktop band", all(restand(0, [0.371, -0.04], 1.2), restand(1, [0.385, -0.04], 1.2), restand(4, [0.397, -0.04], 1.2)))).toEqual(
      ["0's boom across its own instrument", "1's boom across its own instrument", "4's boom across its own instrument", "4's stand before 5's instrument"]);
  }, 60_000);
  it("finds a microphone that reaches into its neighbour: the keys' boom across the rhythm's guitar, and the rhythm's stand before the second drummer's kit", () => {
    expect([finds("desktop band", restand(5, [-1, -0.1], 1.3)), finds("desktop among", restand(4, [-0.8, -0.04], 1.2))]).toEqual([["5's boom across 4's instrument"], ["4's stand before 3's instrument"]]);
  }, 60_000);
  it("finds a microphone's head lifted 10 cm before the face over its player's mouth", () => {
    expect(finds("desktop band", lift(1, 0.1))).toEqual(["1's microphone's head before its own head above the mouth"]);
  }, 60_000);
  // The outlines' film looks again, frame by frame, wherever what moved changed what is solid there, under a stand too (filmOf). The
  // seven of 1968–70's rhythm guitarist and keys player, 5 and 6 as STAGING numbers them, meet at a phone's second and third rungs
  // (band-outline-1968.test.ts). With the keys' stand as it stood before, its top at the mouth's height, it stood over where they
  // meet, and a film that looked again only where what moved changed what was drawn, a stand's pixels and all, did not see it.
  it("finds two players who meet under a stand: the seven of 1968–70's rhythm and keys, with the keys' stand where it stood, its top at the mouth", () => {
    const roles = lineupOn("1969-04-17").roles as string[], n = roles.length;
    const label = (bits: number) => [...roles.map((_, k) => k).filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << n) ? ["monitor"] : [])].join(" and ");
    const film = filmOf(roles, label, RUNGS, { places: () => [[0, 0]], alter: restand(6, [-0.52, -0.1], 1.6) });
    expect([...film.touched].filter((line) => line.endsWith(": 5 and 6")).sort()).toEqual(["rung 2: 5 and 6", "rung 3: 5 and 6"]);
  }, 60_000);
});

outlineChecks("the six of 1979–90 and 1992–95", "1986-07-04", { touch: ["rung 3: 2 and 3"], apart: ["3 crash"] });
