import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SIX } from "../../../public/world/band.js";
import { FACING, FIRST_EYE, height, SHELF_Y, STAGE } from "../../../public/world/ground.js";
import { budgetFor } from "../../../public/world/quality.js";
import { PANEL } from "../../../public/world/stage.js";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { type Camera, CAMERAS, DUSK, draw, filmOf, FLASH_CAMERAS, flickerOf, lens, NIGHT, outlineChecks, PHASES, pieces, pixelOf, playing, POSES, RUNGS, specks } from "./band-outline";

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
  it("finds frame by frame what drawing each frame whole finds: the same specks, the same counts of them, the same pieces with no trunk and the same that hold two players' trunks", () => {
    const roles = ["lead", "rhythm", "bass", "drums", "drums", "keys"], n = roles.length, seconds = 0.25, places = [[0, 0], [0.5, 0.25], [0.75, 0.75]];
    const label = (bits: number) => [...roles.map((_, k) => k).filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << n) ? ["monitor"] : [])].join(" and ");
    const path = CAMERAS.find((c) => c.name === "desktop path")!, small = { ...path, name: "desktop path at a quarter", cols: path.cols / 4, rows: path.rows / 4 };
    const [band, crowd, low] = ["phone band", "phone crowd", "phone crowd at rung 3"].map((name) => [...CAMERAS, ...RUNGS].find((c) => c.name === name)!);
    // Where the band is a pixel or two a player, so that they meet: the back of the crowd on a phone at a sixth of its lowest rung's
    // pixels each way, taken as a rung and as not.
    const least = { ...low, name: "phone crowd at rung 9", cols: Math.round(low.cols / 6), rows: Math.round(low.rows / 6) }, tiny = { ...least, name: "phone crowd at a sixth of rung 3" };
    const cams = [small, tiny, band, crowd, low, least];
    const film = filmOf(roles, label, cams, { rate: () => 60, seconds, fit: () => 0 }), played = playing(roles, 0);
    const found = { specks: [] as string[], counts: [] as string[], apart: new Set<string>(), alone: new Set<string>(), joined: new Set<string>(), touched: new Set<string>() }, got = { counts: [] as string[] };
    for (let f = 0; f <= seconds * 60; f++) {
      played.to(f);
      const tris = Array.from({ length: played.n }, (_, t) => ({ at: [0, 1, 2].map((c) => new THREE.Vector3(...played.world.slice(t * 9 + c * 3, t * 9 + c * 3 + 3))), owner: played.owner[t], trunk: played.trunk[t] === 1, crash: ["", "cymbal", "pole"][played.crash[t]], bone: "", colour: [0, 0, 0] }));
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
        const { W, H, mask, trunks, crashes } = draw(tris, cam, dx, dy);
        for (const piece of pieces(W, H, (o) => mask[o] !== 0)) {
          let trunk = 0, owners = 0, kit = 0;
          for (const o of piece) { trunk |= trunks[o]; owners |= mask[o]; kit |= crashes[o]; }
          const whose = roles.map((_, k) => k).filter((k) => trunk & (1 << k));
          if (dx === 0 && dy === 0 && whose.length > 1 && rung) for (let a = 0; a + 1 < whose.length; a++) found.touched.add(`rung ${cam.name.slice(-1)}: ${whose[a]} and ${whose[a + 1]}`);
          else if (dx === 0 && dy === 0 && whose.length > 1) found.joined.add(`${cam.name} at ${at}: ${whose.join(" and ")}`);
          if (trunk) continue;
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

outlineChecks("the six of 1979–90 and 1992–95", "1986-07-04", { touch: ["rung 3: 2 and 3"], apart: ["3 crash"] });
