import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { BAND_POSE, BAND_POSE_PHONE } from "../../../.github/screenshots/band.mjs";
import { buildBand, STAGING } from "../../../public/world/band.js";
import { FACING, SHELF_Y, STAGE, TEST_POSES } from "../../../public/world/ground.js";
import { lineupOn } from "../../../public/world/lineup.js";
import { budgetFor, stepDown } from "../../../public/world/quality.js";
import { buildStage, FLOOR, PANEL } from "../../../public/world/stage.js";

// The band as the shoot's devices show it (band.js), for each line-up it stands as (lineup.js): nothing in the world is antialiased,
// so a part of a player is drawn a whole pixel at a time, black where the pixel's middle is inside one of its triangles. A phone
// draws its canvas at 0.85 of its pixels (quality.js) and its browser scales that up to the screen, mixing the four pixels round each
// of the screen's (bilinear). The screenshot review reads a pixel as near-black where it is under 60 of 255, and a piece of near-black
// of 12 px or less, 8-connected, as a speck: a part that came apart from its player. In the shoot's frames the band is 11 on the
// canvas, the light panel behind it 150 to 166 and the floor 40 to 74 at night, so a screen pixel of the band reads near-black where
// it is two thirds band or more over the panel, and a quarter or more over the floor.
//
// Here the band stands where stage.js builds it and is drawn from the shoot's own cameras at the stage's poses, at 16 places of the
// pixel grid under it (a quarter of a pixel apart each way), at rest and through a bar of playing, with what main.js fits to the
// canvas fitted to each camera's (band.js `fit`). band-outline.test.ts holds the cameras to their poses, and the six to these rules;
// each other band-outline-*.test.ts holds a line-up of its own, so that vitest draws them side by side.

type Vec = { x: number; y: number; z: number };
export type Camera = { name: string; pose: string; at: number[]; look: number[]; fov: number; aspect: number; cols: number; rows: number; screen: number };

// The cameras, read from main.js's camera in Chromium at each ?pose= the shoot takes the stage from (.github/screenshots): where it
// stands, the way it looks, its field of view and aspect, and its canvas in pixels; and `screen`, the scale from the canvas to the
// screen, which is 1 on a desktop and on a phone its device pixels over the canvas's: 780 / 332 on a phone 390 wide, 720 / 306 on
// one 360 wide.
export const CAMERAS: Camera[] = [
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
export const FLASH_CAMERAS: Camera[] = [
  { name: "phone stage", pose: "stage", at: [34.634, 24.776, -30.111], look: [0.6872, -0.41303, -0.59763], fov: 75, aspect: 0.46209, cols: 332, rows: 717, screen: 780 / 332 },
];
// The canvas's pixel, in rad of the view's height at its middle, which main.js fits the band to (band.js `fit`).
const pixelOf = (cam: Camera) => (2 * Math.tan((cam.fov * Math.PI) / 360)) / cam.rows;
// A phone's cameras at each render scale its quality steps down through (quality.js stepDown), to half its pixels from rung 3 on,
// where the crashes stood alone in the air without their poles from the back of the crowd: the same view on a smaller canvas, which
// the browser scales up the more.
const LADDER: number[] = [];
for (let q = budgetFor("phone"); q && !LADDER.includes(q.scale); q = stepDown(q)) LADDER.push(q.scale);
export const RUNGS: Camera[] = LADDER.slice(1).flatMap((scale, k) => [...CAMERAS.filter((c) => c.name.startsWith("phone")), ...FLASH_CAMERAS].map((c) => {
  const [wide, high] = c.name.startsWith("phone-360") ? [360, 740] : [390, 844], cols = Math.round(wide * scale);
  return { ...c, name: `${c.name} at rung ${k + 1}`, cols, rows: Math.round(high * scale), screen: (wide * 2) / cols };
}));
// The band's poses, first person, as the walk's own view has them (main.js placeWalker), and the named test poses (ground.js).
export const POSES: Record<string, { x: number; z: number; heading: number; pitch: number }> = { ...TEST_POSES, band: BAND_POSE, "band phone": BAND_POSE_PHONE };

// The band on the stage as the line-up `roles` (lineup.js), fitted to a canvas whose pixel is `perPx` rad (none, as built), played
// `seconds` at 96 a minute from its rest, and each of its triangles in the world: its three corners, the player it is of (as many
// as the players for the monitors, which are no one's), whether it is of a player's trunk (the body and the head, and an organ's or
// a piano's player's body, which stands still among the still parts), whether it is of a drummer's cymbal or pole ("cymbal" or
// "pole", else ""), and the name of the bone it is of ("" for none).
type Tri = { at: Vec[]; owner: number; trunk: boolean; crash: string; bone: string };
type Player = { plays: string; role: string; body: { geometry?: { getAttribute(name: string): { count: number } }; matrixWorld: unknown } };
function band(roles: string[], seconds: number, perPx = 0) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR, roles), monitors = built.players.length;
  built.fit(perPx);
  let beats = 0;
  for (let frame = 1; frame <= Math.round(seconds * 60); frame++) built.move(1 / 60, frame / 60, (beats += 96 / 3600), true);
  stage.updateMatrixWorld(true);
  const tris: Tri[] = [];
  const push = (corner: { count: number }, m: unknown, owner: number, trunk: boolean, crash = "", bone = "", from = 0, count = corner.count) => {
    for (let i = from; i < from + count; i += 3) tris.push({ at: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(corner, i + k).applyMatrix4(m)), owner, trunk, crash, bone });
  };
  const still = built.still.geometry.getAttribute("position");
  for (const part of built.still.userData.parts) push(still, built.still.matrixWorld, part.by ?? monitors, part.of === "head" || part.of === "body", part.of === "kit" && ["cymbal", "pole"].includes(part.as) ? part.as : "", "", part.from, part.count);
  built.players.forEach((p: Player, k: number) => { if (p.body.geometry) push(p.body.geometry.getAttribute("position"), p.body.matrixWorld, k, true); });
  const limb = built.limbs.geometry.getAttribute("position"), m = new THREE.Matrix4();
  built.bones.forEach((bone: { of: number; name: string }, k: number) => {
    built.limbs.getMatrixAt(k, m);
    push(limb, m.clone().premultiply(stage.matrixWorld), bone.of, false, "", bone.name);
  });
  return tris;
}

// The canvas's pixels the band covers, from a camera, with the grid shifted `dx`, `dy` of a pixel: for each, the players whose parts
// cover it and the players whose trunks do, one bit a player and the next the monitors'; and whether a cymbal (1) or a pole (2) of a
// kit covers it.
function draw(tris: Tri[], cam: Camera, dx = 0, dy = 0) {
  const W = cam.cols, H = cam.rows, camera = lens(cam);
  const mask = new Uint16Array(W * H), trunks = new Uint16Array(W * H), crashes = new Uint8Array(W * H), q = new THREE.Vector3();
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
      if (crash) crashes[y * W + x] |= crash === "cymbal" ? 1 : 2;
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

// A camera as three has it.
export function lens(cam: Camera) {
  const camera = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.5, 900);
  camera.position.fromArray(cam.at);
  camera.lookAt(new THREE.Vector3().fromArray(cam.at).add(new THREE.Vector3().fromArray(cam.look)));
  camera.updateMatrixWorld(true);
  return camera;
}

// The light panel on a camera's canvas, with the grid shifted `dx`, `dy` of a pixel: whether a point of the canvas is inside it.
function panelOn(cam: Camera, dx = 0, dy = 0) {
  const camera = lens(cam), q = new THREE.Vector3();
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, sy]) => {
    q.set((sx * PANEL.w) / 2, PANEL.y - PANEL.h / 2 + sy * PANEL.h, PANEL.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACING).add(new THREE.Vector3(STAGE[0], SHELF_Y, STAGE[1])).project(camera);
    return [((q.x + 1) / 2) * cam.cols + dx, ((1 - q.y) / 2) * cam.rows + dy];
  });
  return (x: number, y: number) => corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= 0; }) ||
    corners.every(([ax, ay], i) => { const [bx, by] = corners[(i + 1) % 4]; return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0; });
}

// What the shoot's frames show, of 255: the band on the canvas, the light panel behind it and the floor, each as bright as it reads
// at its brightest in them at night, and at dusk and daybreak, when the panel and the floor are at their brightest; and under what
// a screen's pixel reads as near-black. A brighter panel and floor break a thin line sooner, where its pixels meet corner to corner.
const NIGHT = { band: 11, panel: 155, floor: 75, black: 60 }, DUSK = { ...NIGHT, panel: 200, floor: 120 };
type Shade = typeof NIGHT;

// The specks a device shows: the band drawn on the canvas over the panel or the floor, scaled to the screen as its browser scales it,
// and the near-black pieces of 12 px or less there.
function specks(tris: Tri[], cam: Camera, dx: number, dy: number, tone: Shade = NIGHT) {
  const { W, H, mask, box } = draw(tris, cam, dx, dy), k = cam.screen, lit = panelOn(cam, dx, dy);
  const shade = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] ? tone.band : lit(x + 0.5, y + 0.5) ? tone.panel : tone.floor);
  const sx0 = Math.floor((box.x0 - 1) * k), sy0 = Math.floor((box.y0 - 1) * k), sW = Math.ceil((box.x1 + 2) * k) - sx0, sH = Math.ceil((box.y1 + 2) * k) - sy0;
  const dark = new Uint8Array(sW * sH);
  for (let j = 0; j < sH; j++) for (let i = 0; i < sW; i++) {
    const u = (sx0 + i + 0.5) / k - 0.5, v = (sy0 + j + 0.5) / k - 0.5, u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
    const value = (1 - fu) * (1 - fv) * shade(u0, v0) + fu * (1 - fv) * shade(u0 + 1, v0) + (1 - fu) * fv * shade(u0, v0 + 1) + fu * fv * shade(u0 + 1, v0 + 1);
    if (value < tone.black) dark[j * sW + i] = 1;
  }
  return pieces(sW, sH, (o) => dark[o] === 1).filter((piece) => piece.length <= 12).length;
}

// The stage's own parts as stage.js builds them, as triangles in the world, each with what it shows as: the stage's black, as dark as
// the band (the roof, the back wall and the PA stacks), the light panel, or the rest of what stands between a camera and what is
// behind it (the platform and the posts).
function stageParts() {
  const scene = new THREE.Scene();
  const built = buildStage(scene, null, false, new THREE.MeshBasicMaterial(), { uC0: { value: null }, uC1: { value: null } });
  scene.updateMatrixWorld(true);
  const out: { at: Vec[]; shows: number }[] = [];
  type Part = { isMesh?: boolean; matrixWorld: unknown; geometry: { index: unknown; toNonIndexed(): Part["geometry"]; getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } | undefined } };
  const push = (o: Part, shows: (i: number) => number) => {
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, corner = geometry.getAttribute("position")!;
    for (let i = 0; i < corner.count; i += 3) out.push({ at: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(corner, i + k).applyMatrix4(o.matrixWorld)), shows: shows(i) });
  };
  // The stage's still parts are one mesh, coloured by its vertices (landmarks.js mergeStill); its black is the darkest of them.
  built.group.traverse((o: Part) => {
    const colour = o.isMesh ? o.geometry.getAttribute("color") : undefined;
    if (colour) push(o, (i) => (Math.max(colour.getX(i), colour.getY(i), colour.getZ(i)) < 0.05 ? STAGE_BLACK : STAGE_ELSE));
  });
  push(built.panel, () => STAGE_PANEL);
  return out;
}
// The band and the stage drawn together from a camera, nearest first: for each pixel of the canvas, the player whose part shows there
// (as many as the players for the monitors), or NONE, or what of the stage shows there (STAGE_BLACK, STAGE_PANEL or STAGE_ELSE);
// and, where the band shows, its triangle.
const NONE = -1, STAGE_BLACK = -2, STAGE_PANEL = -3, STAGE_ELSE = -4;
let STAGE_PARTS: { at: Vec[]; shows: number }[] | null = null;
function drawWithStage(tris: Tri[], cam: Camera) {
  STAGE_PARTS ??= stageParts();
  const W = cam.cols, H = cam.rows, e = new THREE.Matrix4().multiplyMatrices(lens(cam).projectionMatrix, lens(cam).matrixWorldInverse).elements;
  const depth = new Float32Array(W * H).fill(Infinity), shows = new Int8Array(W * H).fill(NONE), whose: (Tri | null)[] = new Array(W * H).fill(null);
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const fill = (at: Vec[], tag: number, tri: Tri | null) => {
    for (let k = 0; k < 3; k++) {
      const v = at[k], w = e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15];
      if (w <= 0.5) return;
      p[k][0] = (((e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) / w + 1) / 2) * W;
      p[k][1] = ((1 - (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) / w) / 2) * H;
      p[k][2] = 1 / w;
    }
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
    if (area === 0) return;
    const minx = Math.max(0, Math.ceil(Math.min(p[0][0], p[1][0], p[2][0]) - 0.5)), maxx = Math.min(W - 1, Math.floor(Math.max(p[0][0], p[1][0], p[2][0]) - 0.5));
    const miny = Math.max(0, Math.ceil(Math.min(p[0][1], p[1][1], p[2][1]) - 0.5)), maxy = Math.min(H - 1, Math.floor(Math.max(p[0][1], p[1][1], p[2][1]) - 0.5));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const l0 = ((p[2][0] - p[1][0]) * (qy - p[1][1]) - (p[2][1] - p[1][1]) * (qx - p[1][0])) / area;
      const l1 = ((p[0][0] - p[2][0]) * (qy - p[2][1]) - (p[0][1] - p[2][1]) * (qx - p[2][0])) / area;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const d = 1 / (l0 * p[0][2] + l1 * p[1][2] + l2 * p[2][2]), o = y * W + x;
      if (d < depth[o]) { depth[o] = d; shows[o] = tag; whose[o] = tri; }
    }
  };
  for (const t of STAGE_PARTS) fill(t.at, t.shows, null);
  for (const t of tris) fill(t.at, t.owner, t);
  return { W, H, shows, whose };
}

// At rest, as the band is built (and as a visitor who asks for reduced motion sees it), and at four moments through a bar at 96 a
// minute: each stick at its top once, the strumming arms and the singer's clapping hands at both ends of their swings, and the keys
// player's and the organ's player's hands at the tops of their lifts, the keys' left at 1.25 s and right at 2.5 s and the organ's the
// other way about (its left a frame short of the top). The pianist's lag puts its lift's top after 3 s, where none of these falls:
// the lift's test draws it there (liftShown), and the outlines' tests do not. Between these moments the outlines come apart where the
// tests do not look. Drawn every tenth of a second through 5 s from the back of the crowd on a phone, at the shoot's own place of the
// grid: a drummer's part through its stroke in five line-ups, the six among them, as main's six do at the same moments, and the
// organ's player's hand twice at dusk. Drawn at the pianist's top: its lifted hand in December 1971, a pixel at one of the 16 places
// from the crowd on a desktop.
const MOMENTS = [0, 0.6, 1.25, 1.9, 2.5];
const PHASES = [0, 0.25, 0.5, 0.75].flatMap((dx) => [0, 0.25, 0.5, 0.75].map((dy) => [dx, dy]));

// The least of a keyboard player that shows at the top of each lift, in the canvas's pixels, from the front of the crowd and the stage
// pose: the forearm and the hand against the panel, and the body below the shoulders' line, for each of the three keyboards'
// players. Measured as the six stand, the keys player's left lift and right: from the stage pose 33 and 32, and 103 and 70, on a
// desktop, and 13 and 14, and 15 and 9, on a phone; from the front of the crowd 174 and 165, and 437 and 424, on a desktop, and 71
// and 69, and 72 and 63, on a phone. The band before it lifted a hand 26 cm, over its trunk from the front, and with its organ as
// high as it stood (the lower keys at 0.9 m), the body showed 252 and 242 from the front of the crowd on a desktop, 70 and 52 from
// the stage pose, and 42 and 47 from the front on a phone. An organ's or a piano's player is held to as much as the least of it
// in any line-up, less a fifth, each at the tops of its own lifts (liftTops). Measured, the least of the organ's arm and body: 147
// and 355 from the front of the crowd and 28 and 68 from the stage pose on a desktop, and 60 and 53 and 11 and 9 from those on a
// phone; of the pianist's near arm, the one it lifts, and body: 124 and 338, 21 and 72, 54 and 85, and 7 and 19.
export type Least = Record<string, { arm: number; body: number }>;
export const LIFT_LEAST: Record<string, Least> = {
  keys: {
    "desktop stage": { arm: 25, body: 56 },
    "desktop band": { arm: 130, body: 340 },
    "phone band": { arm: 55, body: 50 },
    "phone stage": { arm: 10, body: 7 },
  },
  organ: {
    "desktop stage": { arm: 22, body: 54 },
    "desktop band": { arm: 117, body: 284 },
    "phone band": { arm: 48, body: 42 },
    "phone stage": { arm: 8, body: 7 },
  },
  piano: {
    "desktop stage": { arm: 16, body: 57 },
    "desktop band": { arm: 99, body: 270 },
    "phone band": { arm: 43, body: 68 },
    "phone stage": { arm: 5, body: 15 },
  },
};

/* What a line-up's test holds it to beyond the rules every line-up keeps: the keyboard players' lifts (LIFT_LEAST by default); and
   where two players' outlines meet as a phone steps down its rungs, each as "rung N: a and b" (players from the crowd's left, from
   0), which the test says plainly rather than forbids: at half a phone's pixels the band is a few pixels a player from the back of
   the crowd, and a kit meets the next; and which drummers' crashes stand apart from every outline, each as "N crash". */
type Bars = { lift?: Record<string, Least>; touch?: string[]; apart?: string[] };

/* The rules every line-up keeps, as a describe block of its own: `name` is how the tests name it, and `day` (YYYY-MM-DD) a date of its
   row of lineup.js, whose roles it is. */
export function outlineChecks(name: string, day: string, bars: Bars = {}) {
  const roles = lineupOn(day).roles as string[];
  const lift = { ...LIFT_LEAST, ...bars.lift };
  // The players as the band numbers them, from the crowd's left (band.js STAGING), which is not the order of the table's row.
  const order = STAGING[roles.join(" ") as keyof typeof STAGING].players.map(([role]) => String(role));
  const n = roles.length, monitors = n;
  const players = Array.from({ length: n }, (_, k) => k);
  const label = (bits: number) => [...players.filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << monitors) ? ["monitor"] : [])].join(" and ");
  // The band at MOMENTS, fitted to a camera's canvas as main.js fits it, made once a canvas.
  const films = new Map<number, Tri[][]>();
  const drawn = (cam: Camera) => {
    const perPx = pixelOf(cam);
    if (!films.has(perPx)) films.set(perPx, MOMENTS.map((seconds) => band(roles, seconds, perPx)));
    return films.get(perPx)!;
  };

  describe(`${name}: the band's outlines, as the shoot's devices draw them`, () => {
    beforeAll(() => {
      // quality.js reads the device's pixel ratio for a desktop's budget.
      vi.stubGlobal("window", { devicePixelRatio: 1 });
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    // Measured with the six as they stand: none on a desktop or from the front of the stage on a phone, at night or at dusk. From the
    // back of the crowd on a phone, on the 390- and the 360-wide phone: at night 0.10 and 0.17 a frame, one at worst, and none in 72
    // and 66 of the 80 frames, the tip of the first guitar's neck; at dusk 0.47 and 0.30, two at worst, and none in 49 and 58, the
    // bass's and the first guitar's necks and the bass's fretting hand; and never at the shoot's own place of the grid (0, 0), where
    // CI's stills are drawn. With heads 6 to 12 cm long and the bass's neck 4 cm longer, and not fitted to the canvas, at night 0.42
    // and 0.61 a frame, and at that place the second guitar's head in four moments of five, as CI's stills showed it, and at dusk
    // the bass's in three; with dc68304's necks, which reached further and whose crashes' poles were not fitted to the canvas, 4.46
    // and 3.58 a frame at night, six at worst, and in every frame. A move that holds at its ends (band.js MOVE) holds a part where it
    // comes apart longer than one that eased through.
    it("comes apart nowhere on a desktop, nor on a phone at the front of the stage: no near-black speck of 12 px or less at any of 16 places of the pixel grid, at rest or through a bar", () => {
      const found: string[] = [];
      for (const cam of CAMERAS.filter((c) => !c.name.endsWith("crowd") || c.name.startsWith("desktop"))) {
        for (const shade of [NIGHT, DUSK]) {
          drawn(cam).forEach((tris, t) => PHASES.forEach(([dx, dy]) => { const k = specks(tris, cam, dx, dy, shade); if (k) found.push(`${cam.name} at ${MOMENTS[t]} s, ${dx},${dy}, panel ${shade.panel}: ${k}`); }));
        }
      }
      expect(found).toEqual([]);
    }, 120_000);

    it("comes apart little on a phone from the back of the crowd: at night under 0.3 specks a frame, at most one in any and none in three frames in four, at dusk under 0.6, at most two and none in three in five, and none at the shoot's own place of the grid", () => {
      const limits = [{ shade: NIGHT, mean: 0.3, most: 1, none: 3 / 4 }, { shade: DUSK, mean: 0.6, most: 2, none: 3 / 5 }];
      for (const cam of CAMERAS.filter((c) => c.name.startsWith("phone") && c.name.endsWith("crowd"))) {
        for (const bar of limits) {
          const counts = drawn(cam).flatMap((tris) => PHASES.map(([dx, dy]) => specks(tris, cam, dx, dy, bar.shade)));
          const mean = counts.reduce((sum, k) => sum + k, 0) / counts.length;
          const own = drawn(cam).map((tris) => specks(tris, cam, 0, 0, bar.shade));
          const seen = [cam.name, bar.shade.panel, mean < bar.mean, Math.max(...counts) <= bar.most, counts.filter((k) => k === 0).length >= bar.none * counts.length, own];
          expect(seen).toEqual([cam.name, bar.shade.panel, true, true, true, own.map(() => 0)]);
        }
      }
    }, 120_000);

    // And at every rung a phone steps down to, where #184's review found a player's head 6 px from the keys player's lifted hand at rung
    // 2: there two outlines may meet only where the line-up's test says so (`touch`).
    it("keeps each player an outline of their own from every pose, at rest and through a bar, and meets another at a phone's lower rungs only where it says: no piece of black holds two players' trunks, and none holds no trunk but a crash on its pole", () => {
      const merged: string[] = [], apart: string[] = [], touched = new Set<string>();
      for (const cam of [...CAMERAS, ...FLASH_CAMERAS, ...RUNGS]) {
        const rung = / at rung (\d)$/.exec(cam.name)?.[1];
        drawn(cam).forEach((tris, t) => {
          const { W, H, mask, trunks, crashes } = draw(tris, cam);
          for (const piece of pieces(W, H, (o) => mask[o] !== 0)) {
            let trunk = 0, owners = 0;
            for (const o of piece) { trunk |= trunks[o]; owners |= mask[o]; }
            const whose = players.filter((k) => trunk & (1 << k));
            if (whose.length > 1 && rung) for (let a = 0; a + 1 < whose.length; a++) touched.add(`rung ${rung}: ${whose[a]} and ${whose[a + 1]}`);
            else if (whose.length > 1) merged.push(`${cam.name} at ${MOMENTS[t]} s: ${whose.join(" and ")}`);
            if (whose.length === 0 && !rung) apart.push(`${label(owners)}${piece.every((o) => crashes[o]) ? " crash" : ""}`);
          }
        });
      }
      expect(merged).toEqual([]);
      expect([...touched].sort()).toEqual([...(bars.touch ?? [])].sort());
      // What stands apart is a drummer's crash on its pole, which stands out past its kit on the drummer's left, clear of every outline,
      // so that it reads as a cymbal, and a monitor at the stage's lip, which is no one's: which crashes, the line-up's test says
      // (`apart`). With the six it is the second drummer's; the first's stands on its kit's floor tom.
      expect((bars.apart ?? []).every((piece) => order[Number(piece.split(" ")[0])] === "drums" && piece.endsWith(" crash"))).toBe(true);
      expect([...new Set(apart)].sort()).toEqual([...(bars.apart ?? []), "monitor"].sort());
    }, 120_000);

    // Measured with the six as they stand: four pixels at the closest, from among the crowd on a desktop (the first guitar, by the left
    // PA stack) and from the back of the crowd at half a phone's pixels (the keys player, by the right of the back wall). In the band
    // before it the keys' cabinet ran into the back wall's black from the front of the crowd.
    it("keeps the band clear of the stage's own black from every camera and at every rung of a phone's: two pixels of something else at the least between any part of the band and the roof, the back wall or a PA stack", () => {
      const near = new Set<string>();
      for (const cam of [...CAMERAS, ...FLASH_CAMERAS, ...RUNGS]) {
        drawn(cam).forEach((tris, t) => {
          const { W, H, shows } = drawWithStage(tris, cam);
          for (let o = 0; o < W * H; o++) {
            if (shows[o] < 0) continue;
            const x = o % W, y = (o - x) / W;
            for (let Y = Math.max(0, y - 2); Y <= Math.min(H - 1, y + 2); Y++) for (let X = Math.max(0, x - 2); X <= Math.min(W - 1, x + 2); X++) {
              if (shows[Y * W + X] === STAGE_BLACK) near.add(`${cam.name} at ${MOMENTS[t]} s: ${shows[o] === monitors ? "monitor" : shows[o]}`);
            }
          }
        });
      }
      expect([...near]).toEqual([]);
    }, 120_000);

    // CI's phone at rung 5, half its pixels, from the back of the crowd at daybreak: each crash stood alone in the air, its pole under
    // half a pixel (band.js `fit`).
    it("keeps every part on its player at every rung a phone steps down to, from every pose: no piece of black holds no trunk but a monitor, or a crash on its pole", () => {
      const apart = new Set<string>();
      for (const cam of [...CAMERAS.filter((c) => c.name.startsWith("phone")), ...FLASH_CAMERAS, ...RUNGS]) {
        drawn(cam).forEach((tris, t) => PHASES.forEach(([dx, dy]) => {
          const { W, H, mask, trunks, crashes } = draw(tris, cam, dx, dy);
          for (const piece of pieces(W, H, (o) => mask[o] !== 0)) {
            let trunk = 0, owners = 0, kit = 0;
            for (const o of piece) { trunk |= trunks[o]; owners |= mask[o]; kit |= crashes[o]; }
            if (trunk || owners === 1 << monitors) continue;
            // A crash on its pole: its cymbal and its pole, and nothing else.
            if (kit === 3 && piece.every((o) => crashes[o])) continue;
            apart.add(`${cam.name} at ${MOMENTS[t]} s: ${label(owners)}${kit ? ` (${["", "cymbal", "pole", "cymbal and pole"][kit]})` : ""}`);
          }
        }));
      }
      expect([...apart]).toEqual([]);
    }, 120_000);

    // Every keyboard player of the line-up is held to its role's least (LIFT_LEAST): the keys, the organ and the piano.
    const keyboards = order.map((role, k) => [role, k] as const).filter(([role]) => KEYBOARDS.includes(role));
    for (const [role, at] of keyboards) {
      it(`shows the ${role} player playing from the front of the crowd and from the stage pose, on a desktop and on a phone: at the top of each lift the forearm and the hand stand against the panel, and the body shows from below the shoulders`, () => {
        const shows = liftShown(roles, at);
        // Both hands lift, but at the piano only the one nearer the crowd (band.js).
        expect(shows.map(({ side }) => side)).toEqual(role === "piano" ? ["left"] : ["left", "right"]);
        for (const { cam, side, arm, body } of shows.flatMap(({ side, at: seen }) => seen.map((m) => ({ side, ...m })))) {
          const least = lift[role][cam];
          expect([cam, side, arm >= least.arm, body >= least.body]).toEqual([cam, side, true, true]);
        }
      }, 60_000);
    }
  });

  describe(`${name}: the band's own flicker, as a GPU draws it`, () => {
    // Measured with the six as they stand: five at the most, at 96 a minute and at the slowest count, over these cameras and grids;
    // with the keys' hands lifting a quarter of the way, four. With its moves eased to a stop and away again, 10 and 22; as the
    // screenshot review saw it, 4 and 6.
    it("swings no block of a phone's screen more than five times in a second, from the stage pose and the back of the crowd, at 96 a minute and at the slowest count", () => {
      const found: string[] = [];
      // At 96 a minute the count is the beat, 1.6 a second; at 91 after 150 the count keeps half time, 0.76 a second, as slow as it
      // runs: its moves are slowest there, and an edge longest over a pixel's middle.
      for (const [count, film] of [["96", frames(roles, 96, 4, 96, 3)], ["91 after 150", frames(roles, 150, 4, 91, 6)]] as [string, Frame[]][]) {
        for (const cam of [FLASH_CAMERAS[0], ...CAMERAS.filter((c) => c.name === "phone crowd")]) {
          for (const [dx, dy] of [[0, 0], [0.5, 0.5], [0.25, 0.75], [0.75, 0.25]]) {
            const most = flicker(film, cam, dx, dy);
            if (most > 5) found.push(`${cam.name} at ${count}, ${dx},${dy}: ${most}`);
          }
        }
      }
      expect(found).toEqual([]);
    }, 120_000);
  });
}

// The roles that play a keyboard and lift a hand off it (band.js keyboardist).
const KEYBOARDS = ["keys", "organ", "piano"];
// The moments at which each hand of keyboard player `at` stands at the top of its lift, played from rest at 96 a minute as `band`
// plays: for each hand that lifts, the middle frame of its first hold at its highest. Each player lifts at its own lag of the count
// (band.js DEAL), so no one moment is the top of every keyboard player's lift.
function liftTops(roles: string[], at: number) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR, roles), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const hands = ["left", "right"].map((side) => ({ side, k: built.bones.findIndex((b: { of: number; name: string }) => b.of === at && b.name === `${side} hand`), ys: [] as number[] }));
  let beats = 0;
  // Eight seconds at 96 a minute: 12.8 counts, more than a lift's eight.
  for (let frame = 1; frame <= 8 * 60; frame++) {
    built.move(1 / 60, frame / 60, (beats += 96 / 3600), true);
    for (const hand of hands) {
      built.limbs.getMatrixAt(hand.k, m);
      hand.ys.push(v.setFromMatrixPosition(m).y);
    }
  }
  return hands.flatMap(({ side, ys }) => {
    const top = Math.max(...ys);
    // A hand that lifts rises a metre or so; one that stays on its keys does not move.
    if (top - Math.min(...ys) < 0.3) return [];
    const from = ys.findIndex((y) => y > top - 1e-4);
    let to = from;
    while (to + 1 < ys.length && ys[to + 1] > top - 1e-4) to++;
    return [{ side, seconds: (Math.round((from + to) / 2) + 1) / 60 }];
  });
}
// How much of keyboard player `at` shows at the top of each of its lifts, from the front of the crowd and the stage pose, on a desktop
// and on a phone (`shown`), fitted to each camera's canvas.
export function liftShown(roles: string[], at: number) {
  return liftTops(roles, at).map(({ side, seconds }) => ({
    side,
    at: [...CAMERAS.filter((c) => c.pose.startsWith("band") || c.pose === "stage"), ...FLASH_CAMERAS].map((cam) => ({ cam: cam.name, ...shown(band(roles, seconds, pixelOf(cam)), cam, at, side) })),
  }));
}

// How much of player `at` shows at a moment from a camera, in the canvas's pixels: `arm`, the `side` forearm and hand where, without
// that arm, the panel shows; and `body`, the trunk where it shows below the shoulders' line, which is the upper arms' tops.
function shown(tris: Tri[], cam: Camera, at: number, side: string) {
  const reach = new RegExp(`^${side} (upper arm|forearm|hand)$`);
  const full = drawWithStage(tris, cam), bare = drawWithStage(tris.filter((x) => !(x.owner === at && reach.test(x.bone))), cam);
  let arm = 0;
  for (let o = 0; o < full.W * full.H; o++) {
    const tri = full.whose[o];
    if (tri && tri.owner === at && (tri.bone === `${side} forearm` || tri.bone === `${side} hand`) && bare.shows[o] === STAGE_PANEL) arm++;
  }
  const tops = tris.filter((x) => x.owner === at && / upper arm$/.test(x.bone)).flatMap((x) => x.at.map((v) => new THREE.Vector3().copy(v).project(lens(cam)).y));
  const shoulders = ((1 - Math.max(...tops)) / 2) * full.H + 0.15 * (((Math.max(...tops) - Math.min(...tops)) / 2) * full.H);
  let body = 0;
  for (let o = 0; o < full.W * full.H; o++) { const tri = full.whose[o]; if (tri && tri.owner === at && tri.trunk && Math.floor(o / full.W) > shoulders) body++; }
  return { arm, body };
}

// The band's own flicker (CLAUDE.md, "Motion and flashes"), as a GPU draws it: with no antialiasing, and each corner of a triangle put
// on a grid of 1/256 of a pixel before it is drawn, as a GPU's rasterizer puts it. So an edge that creeps over a pixel's middle crosses
// it to and fro as its corners step: drawn so, the band before its moves went at an even pace flips the pixel under the keys player's
// arm 16 times in a second from the phone's stage pose, frame for frame as the flash counter counted it there. The screen is read as
// the counter reads it (scripts/flash/analyse.mjs): a block of 2x2 of the screen's pixels, the mean of their luminance, and a swing a
// change of 0.1 from the block's last turn. The band's black is 0.01, the light panel behind it 0.3, as bright as it reads in the
// counter's traces, and anything else 0.05. Only the phone's tier is read: a desktop draws a pixel to a pixel, and one pixel of a
// 2x2 block that flips changes its luminance by 0.07 at the most.
type Frame = Float64Array;
// The band's triangles' corners in the world, frame by frame, fitted to a phone's canvas at its own scale: played from rest at `bpm` for
// `lead` seconds unrecorded, then each frame of `seconds` more, at `then` a minute.
function frames(roles: string[], bpm: number, lead: number, then: number, seconds: number) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR, roles), m = new THREE.Matrix4(), v = new THREE.Vector3(), out: Frame[] = [];
  built.fit(pixelOf(FLASH_CAMERAS[0]));
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
    for (const p of built.players as Player[]) if (p.body.geometry) push(p.body.geometry.getAttribute("position"), p.body.matrixWorld);
    const limb = built.limbs.geometry.getAttribute("position");
    built.bones.forEach((_: unknown, k: number) => { built.limbs.getMatrixAt(k, m); push(limb, m.clone().premultiply(stage.matrixWorld)); });
    out.push(Float64Array.from(at));
  }
  return out;
}

// The most swings in any second at any block of a camera's screen, through the frames, with the pixel grid shifted `dx`, `dy`.
function flicker(film: Frame[], cam: Camera, dx: number, dy: number) {
  const W = cam.cols, H = cam.rows, k = cam.screen, camera = lens(cam);
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

