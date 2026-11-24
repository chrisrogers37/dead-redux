import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { BAND_POSE, BAND_POSE_PHONE } from "../../../.github/screenshots/band.mjs";
import { buildBand } from "../../../public/world/band.js";
import { FACING, FIRST_EYE, height, SHELF_Y, STAGE, TEST_POSES } from "../../../public/world/ground.js";
import { budgetFor } from "../../../public/world/quality.js";
import { FLOOR, PANEL } from "../../../public/world/stage.js";

// The band as the shoot's devices show it (band.js): nothing in the world is antialiased, so a part of a player is drawn a whole pixel
// at a time, black where the pixel's middle is inside one of its triangles. A phone draws its canvas at 0.85 of its pixels
// (quality.js) and its browser scales that up to the screen, mixing the four pixels round each of the screen's (bilinear). The
// screenshot review reads a pixel of the band as near-black where it is 95 % band or more, and a piece of near-black of 12 px or
// less, 8-connected, as a speck: a part that came apart from its player.
//
// Here the band stands where stage.js builds it and is drawn from the shoot's own cameras at the stage's poses, at 16 places of the
// pixel grid under it (a quarter of a pixel apart each way), at rest and through a bar of playing.

type Vec = { x: number; y: number; z: number };
type Camera = { name: string; pose: string; at: number[]; look: number[]; fov: number; aspect: number; cols: number; rows: number; screen: number };

// The cameras, read from main.js's camera in Chromium at each ?pose= the shoot takes the stage from (.github/screenshots): where it
// stands, the way it looks, its field of view and aspect, and its canvas in pixels; and `screen`, the scale from the canvas to the
// screen, which is 1 on a desktop and on a phone its device pixels over the canvas's: 780 / 332 on a phone 390 wide, 720 / 306 on
// one 360 wide. The first test below holds each to its pose, so a pose that moved fails here before it leaves this test measuring
// another view.
const CAMERAS: Camera[] = [
  { name: "desktop stage", pose: "stage", at: [40.424, 20.072, -35.146], look: [0.70678, -0.35021, -0.61466], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "desktop slope", pose: "slope", at: [25.092, 30.937, -21.754], look: [0.68782, -0.41121, -0.59817], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "desktop path", pose: "path", at: [9.621, 35.661, -1.285], look: [0.84663, -0.22501, -0.48227], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "desktop crowd", pose: "crowd", at: [20.552, 33.988, -17.854], look: [0.68782, -0.41121, -0.59817], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "desktop among", pose: "among", at: [49.098, 19.954, -29.508], look: [0.52592, -0.41121, -0.74452], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "desktop band", pose: "band", at: [58.86, 6.961, -51.14], look: [0.75216, -0.07991, -0.65412], fov: 60, aspect: 1.6, cols: 1440, rows: 900, screen: 1 },
  { name: "phone crowd", pose: "crowd", at: [15.146, 39.435, -13.152], look: [0.56073, -0.66916, -0.48765], fov: 75, aspect: 0.46209, cols: 332, rows: 717, screen: 780 / 332 },
  { name: "phone band", pose: "band phone", at: [55.84, 8.231, -48.52], look: [0.75216, -0.07991, -0.65412], fov: 75, aspect: 0.46209, cols: 332, rows: 717, screen: 780 / 332 },
  { name: "phone-360 crowd", pose: "crowd", at: [15.146, 39.435, -13.152], look: [0.52328, -0.72047, -0.45508], fov: 75, aspect: 0.48649, cols: 306, rows: 629, screen: 720 / 306 },
];
// The flash counter's camera that the shoot has none of (scripts/flash): the phone's from the stage pose, third person, read from
// main.js's camera in Chromium at that job, 390 by 844 at a pixel ratio of 2 on the phone's tier.
const FLASH_CAMERAS: Camera[] = [
  { name: "phone stage", pose: "stage", at: [34.634, 24.776, -30.111], look: [0.6872, -0.41303, -0.59763], fov: 75, aspect: 0.46209, cols: 332, rows: 717, screen: 780 / 332 },
];
// The band's poses, first person, as the walk's own view has them (main.js placeWalker), and the named test poses (ground.js).
const POSES: Record<string, { x: number; z: number; heading: number; pitch: number }> = { ...TEST_POSES, band: BAND_POSE, "band phone": BAND_POSE_PHONE };

// The band on the stage, played `seconds` at 96 a minute from its rest, and each of its triangles in the world: its three corners, the
// player it is of (6 for the monitors, which are no one's), whether it is of a player's trunk (the body and the head), and whether it
// is of a drummer's cymbal or pole.
function band(seconds: number) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR);
  let beats = 0;
  for (let frame = 1; frame <= Math.round(seconds * 60); frame++) built.move(1 / 60, frame / 60, (beats += 96 / 3600), true);
  stage.updateMatrixWorld(true);
  const tris: { at: Vec[]; owner: number; trunk: boolean; crash: boolean }[] = [];
  const push = (corner: { count: number }, m: unknown, owner: number, trunk: boolean, crash = false, from = 0, count = corner.count) => {
    for (let i = from; i < from + count; i += 3) tris.push({ at: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(corner, i + k).applyMatrix4(m)), owner, trunk, crash });
  };
  const still = built.still.geometry.getAttribute("position");
  for (const part of built.still.userData.parts) push(still, built.still.matrixWorld, part.by ?? 6, part.of === "head", part.of === "kit" && ["cymbal", "pole"].includes(part.as), part.from, part.count);
  built.players.forEach((p: { body: { geometry: { getAttribute(name: string): { count: number } }; matrixWorld: unknown } }, k: number) => push(p.body.geometry.getAttribute("position"), p.body.matrixWorld, k, true));
  const limb = built.limbs.geometry.getAttribute("position"), m = new THREE.Matrix4();
  built.bones.forEach((bone: { of: number }, k: number) => {
    built.limbs.getMatrixAt(k, m);
    push(limb, m.clone().premultiply(stage.matrixWorld), bone.of, false);
  });
  return tris;
}

// The canvas's pixels the band covers, from a camera, with the grid shifted `dx`, `dy` of a pixel: for each, the players whose parts
// cover it and the players whose trunks do, one bit a player; and whether a cymbal or a pole of a kit covers it.
function draw(tris: ReturnType<typeof band>, cam: Camera, dx = 0, dy = 0) {
  const W = cam.cols, H = cam.rows, camera = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.5, 900);
  camera.position.fromArray(cam.at);
  camera.lookAt(new THREE.Vector3().fromArray(cam.at).add(new THREE.Vector3().fromArray(cam.look)));
  camera.updateMatrixWorld(true);
  const mask = new Uint8Array(W * H), trunks = new Uint8Array(W * H), crashes = new Uint8Array(W * H), q = new THREE.Vector3();
  const box = { x0: W, y0: H, x1: -1, y1: -1 };
  for (const { at, owner, trunk, crash } of tris) {
    const p = at.map((v) => { q.copy(v).project(camera); return [((q.x + 1) / 2) * W + dx, ((1 - q.y) / 2) * H + dy]; });
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
    if (area === 0) continue;
    const minx = Math.max(0, Math.ceil(Math.min(p[0][0], p[1][0], p[2][0]) - 0.5)), maxx = Math.min(W - 1, Math.floor(Math.max(p[0][0], p[1][0], p[2][0]) - 0.5));
    const miny = Math.max(0, Math.ceil(Math.min(p[0][1], p[1][1], p[2][1]) - 0.5)), maxy = Math.min(H - 1, Math.floor(Math.max(p[0][1], p[1][1], p[2][1]) - 0.5));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      if (((p[1][0] - p[0][0]) * (qy - p[0][1]) - (p[1][1] - p[0][1]) * (qx - p[0][0])) / area < 0) continue;
      if (((p[2][0] - p[1][0]) * (qy - p[1][1]) - (p[2][1] - p[1][1]) * (qx - p[1][0])) / area < 0) continue;
      if (((p[0][0] - p[2][0]) * (qy - p[2][1]) - (p[0][1] - p[2][1]) * (qx - p[2][0])) / area < 0) continue;
      mask[y * W + x] |= 1 << owner;
      if (trunk) trunks[y * W + x] |= 1 << owner;
      if (crash) crashes[y * W + x] = 1;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    }
  }
  return { W, H, mask, trunks, crashes, box };
}

// The 8-connected pieces of the pixels `on` marks in a W-by-H grid, each as the list of its pixels.
function pieces(W: number, H: number, on: (o: number) => boolean) {
  const seen = new Uint8Array(W * H), out: number[][] = [];
  for (let s = 0; s < W * H; s++) {
    if (!on(s) || seen[s]) continue;
    const got = [s];
    seen[s] = 1;
    for (let i = 0; i < got.length; i++) {
      const x = got[i] % W, y = (got[i] - x) / W;
      for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) {
        const X = x + ex, Y = y + ey, t = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && on(t) && !seen[t]) { seen[t] = 1; got.push(t); }
      }
    }
    out.push(got);
  }
  return out;
}

// The specks a device shows: the band drawn on the canvas, scaled to the screen as its browser scales it, and the near-black pieces
// of 12 px or less there.
function specks(tris: ReturnType<typeof band>, cam: Camera, dx: number, dy: number) {
  const { W, H, mask, box } = draw(tris, cam, dx, dy), k = cam.screen;
  const covered = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H || !mask[y * W + x] ? 0 : 1);
  const sx0 = Math.floor((box.x0 - 1) * k), sy0 = Math.floor((box.y0 - 1) * k), sW = Math.ceil((box.x1 + 2) * k) - sx0, sH = Math.ceil((box.y1 + 2) * k) - sy0;
  const dark = new Uint8Array(sW * sH);
  for (let j = 0; j < sH; j++) for (let i = 0; i < sW; i++) {
    const u = (sx0 + i + 0.5) / k - 0.5, v = (sy0 + j + 0.5) / k - 0.5, u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
    const share = (1 - fu) * (1 - fv) * covered(u0, v0) + fu * (1 - fv) * covered(u0 + 1, v0) + (1 - fu) * fv * covered(u0, v0 + 1) + fu * fv * covered(u0 + 1, v0 + 1);
    if (share >= 0.95) dark[j * sW + i] = 1;
  }
  return pieces(sW, sH, (o) => dark[o] === 1).filter((piece) => piece.length <= 12).length;
}

// At rest, as the band is built (and as a visitor who asks for reduced motion sees it), and at four moments through a bar at 96 a
// minute: each stick at its top once, the keys' hands and the strumming arms at both ends of their swings.
const MOMENTS = [0, 0.6, 1.25, 1.9, 2.5];
const PHASES = [0, 0.25, 0.5, 0.75].flatMap((dx) => [0, 0.25, 0.5, 0.75].map((dy) => [dx, dy]));
const drawn = MOMENTS.map((seconds) => band(seconds));

beforeAll(() => {
  // quality.js reads the device's pixel ratio for a desktop's budget.
  vi.stubGlobal("window", { devicePixelRatio: 1 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the band's outlines, as the shoot's devices draw them", () => {
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

  // Measured with the band as it is built, over these 80 frames: none on a desktop or from the front of the stage on a phone; from the
  // back of the crowd on a phone, 0.68 and 0.55 a frame on the 390- and the 360-wide phone, three at worst on each, and none in 41 and
  // 49 of the 80 frames. Over 288 frames (18 moments 0.3 s apart) it was 0.64 and 0.54 a frame there, four and three at worst, none in
  // 53 % and 60 % of them; main's band, before this one, 1.43 and 0.79, five and two at worst, none in 32 % and 41 %; the first build
  // of this one 8.2 and 6.1, twelve and nine at worst, and none on a desktop from the hill only one frame in four. A move that holds
  // at its ends (band.js MOVE) holds a part where it comes apart longer than one that eased through: with the moves eased, 0.59 and
  // 0.48 over the 288.
  it("comes apart nowhere on a desktop, nor on a phone at the front of the stage: no near-black speck of 12 px or less at any of 16 places of the pixel grid, at rest or through a bar", () => {
    const found: string[] = [];
    for (const cam of CAMERAS.filter((c) => !c.name.endsWith("crowd") || c.name.startsWith("desktop"))) {
      drawn.forEach((tris, t) => PHASES.forEach(([dx, dy]) => { const n = specks(tris, cam, dx, dy); if (n) found.push(`${cam.name} at ${MOMENTS[t]} s, ${dx},${dy}: ${n}`); }));
    }
    expect(found).toEqual([]);
  }, 120_000);

  it("comes apart little on a phone from the back of the crowd: under 0.8 specks a frame, at most four in any, and none in two frames in five or more", () => {
    for (const cam of CAMERAS.filter((c) => c.name.startsWith("phone") && c.name.endsWith("crowd"))) {
      const counts = drawn.flatMap((tris) => PHASES.map(([dx, dy]) => specks(tris, cam, dx, dy)));
      const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
      expect([cam.name, mean < 0.8, Math.max(...counts) <= 4, counts.filter((n) => n === 0).length >= (2 * counts.length) / 5]).toEqual([cam.name, true, true, true]);
    }
  }, 60_000);

  it("keeps each player an outline of their own from every pose, at rest and through a bar: no piece of black holds two players' trunks, and none holds no trunk but a crash on its pole", () => {
    const merged: string[] = [], apart: string[] = [];
    for (const cam of CAMERAS) {
      drawn.forEach((tris, t) => {
        const { W, H, mask, trunks, crashes } = draw(tris, cam);
        for (const piece of pieces(W, H, (o) => mask[o] !== 0)) {
          let trunk = 0, owners = 0;
          for (const o of piece) { trunk |= trunks[o]; owners |= mask[o]; }
          const players = [0, 1, 2, 3, 4, 5].filter((k) => trunk & (1 << k));
          if (players.length > 1) merged.push(`${cam.name} at ${MOMENTS[t]} s: ${players.join(" and ")}`);
          if (players.length === 0) apart.push(`${[0, 1, 2, 3, 4, 5, 6].filter((k) => owners & (1 << k)).join(" and ")}${piece.every((o) => crashes[o]) ? " crash" : ""}`);
        }
      });
    }
    expect(merged).toEqual([]);
    // What stands apart is the second drummer's crash, which stands out past its kit on the drummer's left, clear of every outline, so
    // that it reads as a cymbal (the first's stands on its kit's floor tom), and a monitor at the stage's lip, which is no one's.
    expect([...new Set(apart)].sort()).toEqual(["3 crash", "6"]);
  }, 60_000);
});

// The band's own flicker (CLAUDE.md, "Motion and flashes"), as a GPU draws it: with no antialiasing, and each corner of a triangle put
// on a grid of 1/256 of a pixel before it is drawn, as a GPU's rasterizer puts it. So an edge that creeps over a pixel's middle crosses
// it to and fro as its corners step: drawn so, the band before its moves went at an even pace flips the pixel under the keys player's
// arm 16 times in a second from the phone's stage pose, frame for frame as the flash counter counted it there. The screen is read as
// the counter reads it (scripts/flash/analyse.mjs): a block of 2x2 of the screen's pixels, the mean of their luminance, and a swing a
// change of 0.1 from the block's last turn. The band's black is 0.01, the light panel behind it 0.3, as bright as it reads in the
// counter's traces, and anything else 0.05. Only the phone's tier is read: a desktop draws a pixel to a pixel, and one pixel of a
// 2x2 block that flips changes its luminance by 0.07 at the most.
type Frame = Float64Array;
// The band's triangles' corners in the world, frame by frame: played from rest at `bpm` for `lead` seconds unrecorded, then each frame
// of `seconds` more, at `then` a minute.
function frames(bpm: number, lead: number, then: number, seconds: number) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR), m = new THREE.Matrix4(), v = new THREE.Vector3(), out: Frame[] = [];
  let beats = 0, frame = 0;
  const step = (rate: number) => built.move(1 / 60, ++frame / 60, (beats += rate / 3600), true);
  for (let i = 0; i < lead * 60; i++) step(bpm);
  for (let i = 0; i < seconds * 60; i++) {
    step(then);
    stage.updateMatrixWorld(true);
    const at: number[] = [];
    const push = (corner: { count: number }, mw: unknown, from = 0, count = corner.count) => { for (let k = from; k < from + count; k++) { v.fromBufferAttribute(corner, k).applyMatrix4(mw); at.push(v.x, v.y, v.z); } };
    const still = built.still.geometry.getAttribute("position");
    for (const part of built.still.userData.parts) push(still, built.still.matrixWorld, part.from, part.count);
    for (const p of built.players) push(p.body.geometry.getAttribute("position"), p.body.matrixWorld);
    const limb = built.limbs.geometry.getAttribute("position");
    built.bones.forEach((_: unknown, k: number) => { built.limbs.getMatrixAt(k, m); push(limb, m.clone().premultiply(stage.matrixWorld)); });
    out.push(Float64Array.from(at));
  }
  return out;
}

// The most swings in any second at any block of a camera's screen, through the frames, with the pixel grid shifted `dx`, `dy`.
function flicker(film: Frame[], cam: Camera, dx: number, dy: number) {
  const W = cam.cols, H = cam.rows, k = cam.screen, camera = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.5, 900);
  camera.position.fromArray(cam.at);
  camera.lookAt(new THREE.Vector3().fromArray(cam.at).add(new THREE.Vector3().fromArray(cam.look)));
  camera.updateMatrixWorld(true);
  const e = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const snap = (value: number) => Math.round(value * 256) / 256;
  const screen = (x: number, y: number, z: number) => {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    return [(((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2) * W + dx, ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2) * H + dy];
  };
  // The light panel's corners on the canvas.
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const p = new THREE.Vector3((sx * PANEL.w) / 2, PANEL.y - PANEL.h / 2 + sy * PANEL.h, PANEL.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACING);
    return screen(p.x + STAGE[0], p.y + SHELF_Y, p.z + STAGE[1]);
  });
  const lit = (x: number, y: number) => corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= 0; }) ||
    corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0; });
  // The band's box on the canvas over all the frames, and the screen's pixels over it.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const at of film) for (let i = 0; i < at.length; i += 3) { const [x, y] = screen(at[i], at[i + 1], at[i + 2]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bx = Math.max(0, Math.floor(x0) - 2), by = Math.max(0, Math.floor(y0) - 2), bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by;
  const sx = Math.ceil(bx * k), sy = Math.ceil(by * k), sw = Math.floor((bx + bw) * k) - sx - 1, sh = Math.floor((by + bh) * k) - sy - 1;
  const ground = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) ground[j * sw + i] = lit((sx + i + 0.5) / k, (sy + j + 0.5) / k) ? 0.3 : 0.05;
  // Each grid's blocks: the counter's turning state, and the frames of its swings.
  const grids = [[0, 0], [1, 1], [1, 0], [0, 1]].map(([ox, oy]) => {
    const cols = Math.floor((sw - ox) / 2), rows = Math.floor((sh - oy) / 2), n = cols * rows;
    return { ox, oy, cols, rows, way: new Int8Array(n), turn: new Float32Array(n), low: new Float32Array(n).fill(1), high: new Float32Array(n), swings: Array.from({ length: n }, () => [] as number[]) };
  });
  let most = 0;
  film.forEach((at, f) => {
    const mask = new Uint8Array(bw * bh), p = new Float64Array(at.length / 3 * 2);
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
  return most;
}

describe("the band's own flicker, as a GPU draws it", () => {
  // Measured with the band as it is built: four at the most, at 96 a minute and at the slowest count, over these cameras and grids.
  // With its moves eased to a stop and away again, 10 and 22; as the screenshot review saw it, 4 and 6.
  it("swings no block of a phone's screen more than five times in a second, from the stage pose and the back of the crowd, at 96 a minute and at the slowest count", () => {
    const found: string[] = [];
    // At 96 a minute the count is the beat, 1.6 a second; at 91 after 150 the count keeps half time, 0.76 a second, as slow as it
    // runs: its moves are slowest there, and an edge longest over a pixel's middle.
    for (const [name, film] of [["96", frames(96, 4, 96, 3)], ["91 after 150", frames(150, 4, 91, 6)]] as [string, Frame[]][]) {
      for (const cam of [FLASH_CAMERAS[0], ...CAMERAS.filter((c) => c.name === "phone crowd")]) {
        for (const [dx, dy] of [[0, 0], [0.5, 0.5], [0.25, 0.75], [0.75, 0.25]]) {
          const most = flicker(film, cam, dx, dy);
          if (most > 5) found.push(`${cam.name} at ${name}, ${dx},${dy}: ${most}`);
        }
      }
    }
    expect(found).toEqual([]);
  }, 120_000);
});
