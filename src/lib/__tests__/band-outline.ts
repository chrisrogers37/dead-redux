import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { BAND_POSE, BAND_POSE_PHONE } from "../../../.github/screenshots/band.mjs";
import { buildBand, STAGING, WARDROBES } from "../../../public/world/band.js";
import { lightAt, luminance, type LightUniforms } from "./band-light";
import { FACING, SHELF_Y, STAGE, TEST_POSES } from "../../../public/world/ground.js";
import { LINEUPS, lineupOn } from "../../../public/world/lineup.js";
import { budgetFor, stepDown } from "../../../public/world/quality.js";
import { buildStage, FLOOR, PANEL, STAGES } from "../../../public/world/stage.js";

// The band as the shoot's devices show it (band.js), for each line-up it stands as (lineup.js): nothing in the world is antialiased,
// so a part of a player is drawn a whole pixel at a time, where the pixel's middle is inside one of its triangles. A phone draws its
// canvas at 0.85 of its pixels (quality.js) and its browser scales that up to the screen, mixing the four pixels round each of the
// screen's (bilinear). The screenshot review reads a pixel as near-black where it is under 60 of 255, and a piece of near-black of
// 12 px or less, 8-connected, as a speck: a part that came apart from its player. The band is lit and in colour, and its darkest
// parts (a stand, a black guitar, a cymbal's pole, the shadow side of dark clothes) are 11 on the canvas, as dark as the black band
// before it was; any part may be one of them, so the outlines' film draws every part of the band at that darkest, the strictest
// case: a piece of the band that comes apart in it would come apart in any colour. The light panel behind it is 150 to 166 and the
// floor 40 to 74 at night, so a screen pixel of the band at its darkest reads near-black where it is two thirds band or more over
// the panel, and a quarter or more over the floor. How a lit player reads against the panel, by contrast in luminance along its
// outline, is outlineRead's.
//
// Here the band stands where stage.js builds it and is drawn from the shoot's own cameras at the stage's poses, at the shoot's own
// place of the pixel grid under it, or at 16 (a quarter of a pixel apart each way, FILM_PLACES), at rest and through a bar of
// playing, with what main.js fits to the canvas fitted to each camera's (band.js `fit`). band-outline.test.ts holds the cameras to their poses, and the six to these rules;
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
export const pixelOf = (cam: Camera) => (2 * Math.tan((cam.fov * Math.PI) / 360)) / cam.rows;
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
// And its colour: the mean of its corners' (linear), times its bone's where it is a limb's.
type Tri = { at: Vec[]; owner: number; trunk: boolean; crash: string; bone: string; colour: number[] };
type Player = { plays: string; role: string; body: { geometry?: { getAttribute(name: string): { count: number } }; matrixWorld: unknown } };
type Colours = { getX(i: number): number; getY(i: number): number; getZ(i: number): number };
function band(roles: string[], seconds: number, perPx = 0, date: string | null = null) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR, roles, date), monitors = built.players.length;
  built.fit(perPx);
  let beats = 0;
  for (let frame = 1; frame <= Math.round(seconds * 60); frame++) built.move(1 / 60, frame / 60, (beats += 96 / 3600), true);
  stage.updateMatrixWorld(true);
  const tris: Tri[] = [];
  const push = (geometry: { getAttribute(name: string): { count: number } }, m: unknown, owner: number, trunk: boolean, crash = "", bone = "", from = 0, count = geometry.getAttribute("position").count, tint = [1, 1, 1]) => {
    const corner = geometry.getAttribute("position"), colour = geometry.getAttribute("color") as unknown as Colours;
    for (let i = from; i < from + count; i += 3) {
      const mean = [0, 1, 2].map((a) => ([0, 1, 2].reduce((sum, k) => sum + [colour.getX, colour.getY, colour.getZ][a].call(colour, i + k), 0) / 3) * tint[a]);
      tris.push({ at: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(corner, i + k).applyMatrix4(m)), owner, trunk, crash, bone, colour: mean });
    }
  };
  for (const part of built.still.userData.parts) push(built.still.geometry, built.still.matrixWorld, part.by ?? monitors, part.of === "head" || part.of === "body", part.of === "kit" && ["cymbal", "pole"].includes(part.as) ? part.as : "", "", part.from, part.count);
  built.players.forEach((p: Player, k: number) => { if (p.body.geometry) push(p.body.geometry, p.body.matrixWorld, k, true); });
  const m = new THREE.Matrix4(), c = new THREE.Color();
  built.bones.forEach((bone: { of: number; name: string }, k: number) => {
    built.limbs.getMatrixAt(k, m);
    built.limbs.getColorAt(k, c);
    push(built.limbs.geometry, m.clone().premultiply(stage.matrixWorld), bone.of, false, "", bone.name, 0, undefined, [c.r, c.g, c.b]);
  });
  return { tris, built };
}

// The canvas's pixels the band covers, from a camera, with the grid shifted `dx`, `dy` of a pixel: for each, the players whose parts
// cover it and the players whose trunks do, one bit a player and the next the monitors'; and whether a cymbal (1) or a pole (2) of a
// kit covers it.
export function draw(tris: Tri[], cam: Camera, dx = 0, dy = 0) {
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
export function pieces(W: number, H: number, on: (o: number) => boolean) {
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

// What the shoot's frames show, of 255: the band at its darkest on the canvas, the light panel behind it and the floor, each as
// bright as it reads at its brightest in them at night, and at dusk and daybreak, when the panel and the floor are at their
// brightest; and under what a screen's pixel reads as near-black. A brighter panel and floor break a thin line sooner, where its
// pixels meet corner to corner.
export const NIGHT = { band: 11, panel: 155, floor: 75, black: 60 }, DUSK = { ...NIGHT, panel: 200, floor: 120 };
type Shade = typeof NIGHT;

// The specks a device shows: the band drawn on the canvas over the panel or the floor, scaled to the screen as its browser scales it,
// and the near-black pieces of 12 px or less there.
export function specks(tris: Tri[], cam: Camera, dx: number, dy: number, tone: Shade = NIGHT) {
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

// The film the outlines' tests read: every frame of the band played from rest at 96 a minute, through its EASE and on through a
// whole bar of eight counts, 0 to 5.8 s, after which it moves as it moved (band.js), each camera's canvas at each of the places of
// the grid it is given (`places`). It plays at RATE frames a second: at 240 for the screens of a phone from the back of the crowd and from the band
// pose, where a phone stretches its canvas over its screen and a pixel alone at a corner of an outline shows as a speck; at 60 for
// every other camera, the desktops', the phone's at the stage pose and at every rung, where what is counted is the canvas's own
// pieces. A speck that shows for 1/240 s, or for 1/60 s, is in a frame of the film, at the places of the grid it shows at. Played
// at 960 a second, from every camera and in every line-up, the band showed no speck, no piece apart and no two players meeting that
// the film does not; played at 60 for the phone's screens too, the film missed two specks: a pixel of the bass's outline, edge-on
// from the band pose, alone for 6 ms in two sevens, and a drummer's left wrist from the back of the crowd for 3 ms, which 960 found
// and 240 did not (both since fitted: band.js).
//
// Each frame is drawn as `draw` draws it, pixel for pixel, but in two parts: what stands still once, and what moves (the bodies that
// move and every bone) each frame. Between two frames only the pixels where what moves has changed can change, and a piece of black
// or a speck that holds none of them, nor any pixel beside one, is as it was the frame before; so each frame looks only at the
// pieces that reach those pixels, after looking at every piece of the first frame (the film's own test holds it to `draw`, `specks`
// and `pieces`, frame by frame). What it finds:
//   - `specks`: each near-black speck of 12 px or less on a desktop and from the band pose on a phone, at night and at dusk. A
//     desktop's canvas is its screen, pixel for pixel, and neither the panel nor the floor is near-black at either, so there a speck
//     is a piece of the band's own black of 12 px or less;
//   - `counts` and `own`: the specks from the back of the crowd on a phone, at night and at dusk, a count for each frame and place;
//     and each frame in which one shows at the shoot's own place of the grid (0, 0);
//   - `alone`: the pieces of black that hold no player's trunk at the shoot's own place, from every camera but a rung;
//   - `apart`: the pieces of black with no trunk from every phone's camera and rung at every place, but a monitor and a crash on its
//     pole;
//   - `joined` and `touched`: the pieces of black that hold two players' trunks or more at the shoot's own place: from every camera
//     but a rung, each with its frame; and at a rung, the players each holds, two at a time in turn from the crowd's left.
type Film = { specks: string[]; counts: Map<string, number[]>; own: Map<string, string[]>; alone: Set<string>; apart: Set<string>; joined: string[]; touched: Set<string> };
const SCREENS = ["phone band", "phone crowd", "phone-360 crowd"];
const RATE = (cam: Camera) => (CAMERAS.includes(cam) && SCREENS.includes(cam.name) ? 240 : 60);
type Box = { x0: number; y0: number; x1: number; y1: number };

// The band played from rest at 96 a minute in `steps` frames a second, or at `tempo(frame)` a minute in each frame, fitted to a canvas
// whose pixel is `perPx` rad, as `band` plays it at 60: its triangles' corners in the world (`world`, nine numbers a triangle, in `band`'s order), the still parts' from
// the first, and `to(frame)`, which plays it on to that frame and lays the corners of what moves, from triangle `still` on.
export function playing(roles: string[], perPx: number, steps = 60, tempo: (frame: number) => number = () => 96) {
  const stage = new THREE.Group();
  stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  stage.rotation.y = FACING;
  const built = buildBand(stage, FLOOR, roles), monitors = built.players.length;
  built.fit(perPx);
  stage.updateMatrixWorld(true);
  const corners = built.still.geometry.getAttribute("position"), limb = built.limbs.geometry.getAttribute("position");
  const bodies = (built.players as Player[]).flatMap((p, k) => (p.body.geometry ? [{ p, k, corner: p.body.geometry.getAttribute("position") as unknown as { count: number; array: Float32Array } }] : []));
  const parts = built.still.userData.parts as { of: string; as: string; by: number | null; from: number; count: number }[];
  const n = (parts.reduce((sum, part) => sum + part.count, 0) + bodies.reduce((sum, b) => sum + b.corner.count, 0) + built.bones.length * limb.count) / 3;
  const owner = new Uint8Array(n), trunk = new Uint8Array(n), crash = new Uint8Array(n), world = new Float64Array(n * 9);
  // Each corner as Vector3.applyMatrix4 puts it.
  const lay = (array: ArrayLike<number>, from: number, count: number, e: number[], at: number) => {
    for (let i = 0; i < count; i++) {
      const x = array[(from + i) * 3], y = array[(from + i) * 3 + 1], z = array[(from + i) * 3 + 2], w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      world[(at + i) * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      world[(at + i) * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      world[(at + i) * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    }
  };
  let at = 0;
  for (const part of parts) {
    lay(corners.array, part.from, part.count, built.still.matrixWorld.elements, at);
    for (let t = at / 3; t < (at + part.count) / 3; t++) {
      owner[t] = part.by ?? monitors;
      trunk[t] = part.of === "head" || part.of === "body" ? 1 : 0;
      crash[t] = part.of === "kit" && part.as === "cymbal" ? 1 : part.of === "kit" && part.as === "pole" ? 2 : 0;
    }
    at += part.count;
  }
  // What moves, a body or a bone at a time: each group's first triangle, and after the last the end.
  const still = at / 3, groups = [still];
  for (const { k, corner } of bodies) { for (let t = at / 3; t < (at + corner.count) / 3; t++) { owner[t] = k; trunk[t] = 1; } at += corner.count; groups.push(at / 3); }
  built.bones.forEach((bone: { of: number }) => { for (let t = at / 3; t < (at + limb.count) / 3; t++) owner[t] = bone.of; at += limb.count; groups.push(at / 3); });
  // Each group's matrix as it was last laid, and whether it changed then (`moved`): a group's corners are its matrix's, so a group
  // whose matrix stands as it did stands where it did, and is not laid again.
  const m = new THREE.Matrix4(), many = groups.length - 1, was = new Float64Array(many * 16).fill(NaN), moved = new Uint8Array(many);
  const laid = (g: number, e: number[]) => {
    let same = true;
    for (let k = 0; k < 16; k++) if (was[g * 16 + k] !== e[k]) { same = false; was[g * 16 + k] = e[k]; }
    moved[g] = same ? 0 : 1;
    return !same;
  };
  let frame = 0, beats = 0;
  const to = (f: number) => {
    while (frame < f) { frame++; built.move(1 / steps, frame / steps, (beats += tempo(frame) / (60 * steps)), true); }
    stage.updateMatrixWorld(true);
    let i = still * 3, g = 0;
    for (const { p, corner } of bodies) {
      const e = (p.body.matrixWorld as { elements: number[] }).elements;
      if (laid(g++, e)) lay(corner.array, 0, corner.count, e, i);
      i += corner.count;
    }
    for (let k = 0; k < built.bones.length; k++) {
      built.limbs.getMatrixAt(k, m);
      const e = m.premultiply(stage.matrixWorld).elements;
      if (laid(g++, e)) lay(limb.array, 0, limb.count, e, i);
      i += limb.count;
    }
  };
  return { n, still, groups, world, owner, trunk, crash, to, moved };
}

// Where each group of what moves reaches in the world, as a box (six numbers a group: the least x, y and z, then the most), played
// from rest at `steps` frames a second through `frames` frames with every fitted part as stout as it can be (`fit` at a pixel of a
// whole rad), which holds every part as any canvas fits it: a fitted bone is a bar about its own axis, a neck's tip widens across
// its strings and a stand about its upright, each the more the coarser the pixel. Made once a line-up and a rate.
const REACHES = new Map<string, Float64Array>();
function reachOf(roles: string[], steps: number, frames: number) {
  const key = `${roles.join(" ")} ${steps} ${frames}`, made = REACHES.get(key);
  if (made) return made;
  const played = playing(roles, 1, steps), groups = played.groups, many = groups.length - 1, reach = new Float64Array(many * 6).fill(Infinity);
  for (let g = 0; g < many; g++) reach.fill(-Infinity, g * 6 + 3, g * 6 + 6);
  for (let f = 0; f < frames; f++) {
    played.to(f);
    for (let g = 0; g < many; g++) {
      if (!played.moved[g]) continue;
      for (let i = groups[g] * 9; i < groups[g + 1] * 9; i++) {
        const a = i % 3, v = played.world[i];
        if (v < reach[g * 6 + a]) reach[g * 6 + a] = v;
        if (v > reach[g * 6 + 3 + a]) reach[g * 6 + 3 + a] = v;
      }
    }
  }
  REACHES.set(key, reach);
  return reach;
}

// Each corner of `world` from `from` to `to` on a camera's canvas, unshifted, as `draw` puts it (Vector3.project, then the canvas).
function projector(cam: Camera) {
  const camera = lens(cam), v = camera.matrixWorldInverse.elements as number[], p = camera.projectionMatrix.elements as number[], W = cam.cols, H = cam.rows;
  return (world: Float64Array, from: number, to: number, xy: Float64Array) => {
    for (let i = from; i < to; i++) {
      const x = world[i * 3], y = world[i * 3 + 1], z = world[i * 3 + 2], w = 1 / (v[3] * x + v[7] * y + v[11] * z + v[15]);
      const X = (v[0] * x + v[4] * y + v[8] * z + v[12]) * w, Y = (v[1] * x + v[5] * y + v[9] * z + v[13]) * w, Z = (v[2] * x + v[6] * y + v[10] * z + v[14]) * w;
      const u = 1 / (p[3] * X + p[7] * Y + p[11] * Z + p[15]);
      xy[i * 2] = (((p[0] * X + p[4] * Y + p[8] * Z + p[12]) * u + 1) / 2) * W;
      xy[i * 2 + 1] = ((1 - (p[1] * X + p[5] * Y + p[9] * Z + p[13]) * u) / 2) * H;
    }
  };
}

// Triangles `from` to `to` of a camera's corners (`xy`) drawn as `draw` draws them, the grid shifted `dx`, `dy`, into a window of the
// canvas (x0, y0, w by h, which holds every pixel they can cover), within `clip`: the players' bits, the trunks' and a kit's, as
// `draw` has them. A pixel's middle is inside where each edge's value, by its sign over the area's, is not below 0, as `draw` finds
// it, with no division. Along each row, a pixel whose middle is further than NEAR px from where every edge crosses the row, as
// worked out, is inside or out as that says, and only those nearer are tried as `draw` tries them: the edge's value there is at
// least NEAR times its slope, so long as the slope is over STEEP, many times what rounding can move it; along a row that an edge
// crosses less steeply than that, every pixel is tried.
const NEAR = 1e-4, STEEP = 1e-3;
function drawInto(xy: Float64Array, kinds: { owner: Uint8Array; trunk: Uint8Array; crash: Uint8Array }, from: number, to: number, dx: number, dy: number, cam: Camera,
  win: { x0: number; y0: number; w: number; h: number }, mask: Uint16Array, trunks: Uint16Array, crashes: Uint8Array | null, clip: Box = { x0: 0, y0: 0, x1: cam.cols - 1, y1: cam.rows - 1 }) {
  for (let t = from; t < to; t++) {
    const o = t * 6, ax = xy[o] + dx, ay = xy[o + 1] + dy, bx = xy[o + 2] + dx, by = xy[o + 3] + dy, cx = xy[o + 4] + dx, cy = xy[o + 5] + dy;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) continue;
    const minx = Math.max(clip.x0, Math.ceil(Math.min(ax, bx, cx) - 0.5)), maxx = Math.min(clip.x1, Math.floor(Math.max(ax, bx, cx) - 0.5));
    const miny = Math.max(clip.y0, Math.ceil(Math.min(ay, by, cy) - 0.5)), maxy = Math.min(clip.y1, Math.floor(Math.max(ay, by, cy) - 0.5));
    if (minx > maxx || miny > maxy) continue;
    const bit = 1 << kinds.owner[t], isTrunk = kinds.trunk[t], kit = crashes ? kinds.crash[t] : 0, sign = area > 0 ? 1 : -1;
    const abx = bx - ax, aby = by - ay, bcx = cx - bx, bcy = cy - by, cax = ax - cx, cay = ay - cy;
    // Each edge, row by row: where it crosses the row, less half a pixel, and which way its inside lies (1 toward lower x, -1 higher,
    // 0 for an edge along the row, NaN for one shallower than STEEP, along which every pixel is tried).
    const way = (slope: number) => (slope === 0 ? 0 : Math.abs(slope) < STEEP ? NaN : Math.sign(slope * sign));
    const way1 = way(aby), way2 = way(bcy), way3 = way(cay), shallow = Number.isNaN(way1 + way2 + way3);
    const step1 = aby ? abx / aby : 0, step2 = bcy ? bcx / bcy : 0, step3 = cay ? cax / cay : 0;
    for (let y = miny; y <= maxy; y++) {
      const qy = y + 0.5, ea = abx * (qy - ay), eb = bcx * (qy - by), ec = cax * (qy - cy);
      // The pixels that may be inside (lo to hi), and those that surely are (sureLo to sureHi).
      let lo = minx, hi = maxx, sureLo = minx, sureHi = maxx;
      if (way1 === 0) { if (ea * sign < 0) continue; } else if (way1 === way1) { const cross = ax + step1 * (qy - ay) - 0.5; if (way1 > 0) { hi = Math.min(hi, Math.floor(cross + NEAR)); sureHi = Math.min(sureHi, Math.floor(cross - NEAR)); } else { lo = Math.max(lo, Math.ceil(cross - NEAR)); sureLo = Math.max(sureLo, Math.ceil(cross + NEAR)); } }
      if (way2 === 0) { if (eb * sign < 0) continue; } else if (way2 === way2) { const cross = bx + step2 * (qy - by) - 0.5; if (way2 > 0) { hi = Math.min(hi, Math.floor(cross + NEAR)); sureHi = Math.min(sureHi, Math.floor(cross - NEAR)); } else { lo = Math.max(lo, Math.ceil(cross - NEAR)); sureLo = Math.max(sureLo, Math.ceil(cross + NEAR)); } }
      if (way3 === 0) { if (ec * sign < 0) continue; } else if (way3 === way3) { const cross = cx + step3 * (qy - cy) - 0.5; if (way3 > 0) { hi = Math.min(hi, Math.floor(cross + NEAR)); sureHi = Math.min(sureHi, Math.floor(cross - NEAR)); } else { lo = Math.max(lo, Math.ceil(cross - NEAR)); sureLo = Math.max(sureLo, Math.ceil(cross + NEAR)); } }
      if (shallow) sureHi = sureLo - 1;
      const row = (y - win.y0) * win.w - win.x0;
      for (let x = lo; x <= hi; x++) {
        if (x < sureLo || x > sureHi) {
          const qx = x + 0.5;
          if ((ea - aby * (qx - ax)) * sign < 0 || (eb - bcy * (qx - bx)) * sign < 0 || (ec - cay * (qx - cx)) * sign < 0) continue;
        }
        const i = row + x;
        mask[i] |= bit;
        if (isTrunk) trunks[i] |= bit;
        if (kit) crashes![i] |= kit;
      }
    }
  }
}

const SPECK = 12;
// Visits: a pixel marked since a search began has been reached in it; and a stack to search with.
type Marks = { at: Int32Array; n: number; stack: Int32Array };
const marksFor = (size: number): Marks => ({ at: new Int32Array(size), n: 0, stack: new Int32Array(size) });
// The 8-connected pieces of what `on` marks in a w-by-h grid that reach a pixel of `seeds` or one beside it (or, with no `near`,
// that hold a pixel of `seeds`): with `trunks`, each with
// no pixel of a trunk, told to `whole` with its pixels (`stack`, to `count`); without, the count of those of SPECK px or less. Each is
// followed until it is known to hold a trunk, or to be over SPECK px; one that reaches a piece left so is left so too.
function piecesNear(w: number, h: number, on: Uint8Array, seeds: ArrayLike<number>, marks: Marks, trunks: Uint16Array[] | null = null, whole: (stack: Int32Array, count: number) => void = () => {}, near = true) {
  const since = marks.n + 1, at = marks.at, stack = marks.stack, [mine, theirs] = trunks ?? [], reach = near ? 1 : 0;
  let found = 0;
  for (let n = 0; n < seeds.length; n++) {
    const c = seeds[n], cx = c % w, cy = (c - cx) / w;
    for (let Y = Math.max(0, cy - reach); Y <= Math.min(h - 1, cy + reach); Y++) for (let X = Math.max(0, cx - reach); X <= Math.min(w - 1, cx + reach); X++) {
      const s = Y * w + X;
      if (at[s] >= since || on[s] === 0) continue;
      const me = ++marks.n;
      let top = 0, count = 1, done = false;
      stack[0] = s;
      at[s] = me;
      while (top < count && !done) {
        const o = stack[top++];
        if (trunks ? (mine[o] | theirs[o]) !== 0 : count > SPECK) { done = true; break; }
        const x = o % w, y = (o - x) / w;
        for (let v = Math.max(0, y - 1); v <= Math.min(h - 1, y + 1) && !done; v++) for (let u = Math.max(0, x - 1); u <= Math.min(w - 1, x + 1); u++) {
          const q = v * w + u;
          if (at[q] === me || on[q] === 0) continue;
          if (at[q] >= since) { done = true; break; }
          at[q] = me;
          stack[count++] = q;
        }
      }
      if (done) continue;
      if (trunks) whole(stack, count);
      else if (count <= SPECK) found++;
    }
  }
  return found;
}

// The 8-connected pieces of what `on` marks in a w-by-h grid that hold a pixel of `seeds`, each followed whole: the players whose
// trunks it holds (`trunks`, a bit a player), told to `held` where there are two or more.
function heldTogether(w: number, h: number, on: Uint8Array, seeds: ArrayLike<number>, marks: Marks, [mine, theirs]: Uint16Array[], held: (bits: number) => void) {
  const since = marks.n + 1, at = marks.at, stack = marks.stack;
  for (let n = 0; n < seeds.length; n++) {
    const s = seeds[n];
    if (at[s] >= since || on[s] === 0) continue;
    const me = ++marks.n;
    let top = 0, count = 1, bits = 0;
    stack[0] = s;
    at[s] = me;
    while (top < count) {
      const o = stack[top++], x = o % w, y = (o - x) / w;
      bits |= mine[o] | theirs[o];
      for (let v = Math.max(0, y - 1); v <= Math.min(h - 1, y + 1); v++) for (let u = Math.max(0, x - 1); u <= Math.min(w - 1, x + 1); u++) {
        const q = v * w + u;
        if (at[q] >= since || on[q] === 0) continue;
        at[q] = me;
        stack[count++] = q;
      }
    }
    if (bits & (bits - 1)) held(bits);
  }
}

// The film, for the line-up `roles`, from each of `cams`; `label` names a piece by the players and monitors it is of. The cameras
// whose canvases have one pixel and that play at one rate (`rate`) are played as one band, which is fitted to it (`fit`, as main.js
// fits it unless the test says).
export function filmOf(roles: string[], label: (bits: number) => string, cams: Camera[], { rate = RATE, seconds = 5.8, fit = pixelOf, places = (_: Camera) => PHASES } = {}): Film {
  const monitor = 1 << roles.length, players = roles.map((_, k) => k);
  const film: Film = { specks: [], counts: new Map(), own: new Map(), alone: new Set(), apart: new Set(), joined: [], touched: new Set() };
  const fitted = new Map<string, Camera[]>();
  for (const cam of cams) fitted.set(`${fit(cam)} ${rate(cam)}`, [...(fitted.get(`${fit(cam)} ${rate(cam)}`) ?? []), cam]);
  for (const group of fitted.values()) {
    const perPx = fit(group[0]), steps = rate(group[0]), frames = Math.round(seconds * steps) + 1;
    const at = (f: number) => `${(f / steps).toFixed(3)} s`;
    const played = playing(roles, perPx, steps), groups = played.groups, many = groups.length - 1, moved = played.moved;
    // Where each group of what moves reaches in the world over the film (reachOf).
    const reach = reachOf(roles, steps, frames);
    const views = group.map((cam) => {
      const step = / at rung (\d)$/.exec(cam.name)?.[1], rung = !!step, phone = cam.name.startsWith("phone"), shot = CAMERAS.includes(cam);
      const band = shot && cam.name === "phone band", crowd = shot && phone && cam.name.endsWith("crowd"), screen = band || crowd, k = cam.screen, project = projector(cam);
      // The window of the canvas the band can cover, from every place of the grid, and two pixels round it: round the still parts and
      // the corners of each moving group's box on the canvas.
      const xy = new Float64Array(played.n * 6), corners = new Float64Array(many * 8 * 3), seen = new Float64Array(many * 16);
      for (let g = 0; g < many; g++) for (let c = 0; c < 8; c++) for (let a = 0; a < 3; a++) corners[(g * 8 + c) * 3 + a] = reach[g * 6 + ((c >> a) & 1 ? 3 : 0) + a];
      project(corners, 0, many * 8, seen);
      project(played.world, 0, played.still * 3, xy);
      let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
      for (const [from, to] of [[seen, many * 8], [xy, played.still * 3]] as const) for (let c = 0; c < to; c++) { lx = Math.min(lx, from[c * 2]); hx = Math.max(hx, from[c * 2]); ly = Math.min(ly, from[c * 2 + 1]); hy = Math.max(hy, from[c * 2 + 1]); }
      const bx0 = Math.max(0, Math.ceil(lx - 0.5)), by0 = Math.max(0, Math.ceil(ly - 0.5)), bx1 = Math.min(cam.cols - 1, Math.floor(hx + 0.25)), by1 = Math.min(cam.rows - 1, Math.floor(hy + 0.25));
      const win = { x0: bx0 - 2, y0: by0 - 2, w: bx1 - bx0 + 5, h: by1 - by0 + 5 }, size = win.w * win.h, W = win.w;
      // The screen's pixels over it, as `specks` takes them: each column's (row's) place on the canvas, the window's column (row) of
      // the first of its four canvas pixels, and for each column (row) of the window the screen's columns (rows) whose four start at
      // it.
      const sx0 = Math.floor((bx0 - 1) * k), sy0 = Math.floor((by0 - 1) * k), sW = screen ? Math.ceil((bx1 + 2) * k) - sx0 : 0, sH = screen ? Math.ceil((by1 + 2) * k) - sy0 : 0;
      const us = Float64Array.from({ length: sW }, (_, i) => (sx0 + i + 0.5) / k - 0.5), vs = Float64Array.from({ length: sH }, (_, j) => (sy0 + j + 0.5) / k - 0.5);
      const colOf = Int32Array.from(us, (u) => Math.floor(u) - win.x0), rowOf = Int32Array.from(vs, (v) => (Math.floor(v) - win.y0) * W);
      const spans = (place: Float64Array, from: number, count: number) => {
        const first = new Int32Array(count).fill(-1), last = new Int32Array(count).fill(-2);
        place.forEach((u, i) => { const c = Math.floor(u) - from; if (c >= 0 && c < count) { if (first[c] < 0) first[c] = i; last[c] = i; } });
        return { first, last };
      };
      const cols = spans(us, win.x0, win.w), rows = spans(vs, win.y0, win.h);
      const marks = marksFor(size), smarks = marksFor(sW * sH);
      const whole = { x0: win.x0, y0: win.y0, x1: win.x0 + win.w - 1, y1: win.y0 + win.h - 1 };
      const tracks = places(cam).map(([dx, dy]) => {
        const still = { mask: new Uint16Array(size), trunks: new Uint16Array(size), crashes: new Uint8Array(size) }, lit = new Uint8Array(screen ? size : 0);
        drawInto(xy, played, 0, played.still, dx, dy, cam, win, still.mask, still.trunks, still.crashes);
        if (screen) { const panel = panelOn(cam, dx, dy); for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) lit[j * W + i] = panel(win.x0 + i + 0.5, win.y0 + j + 0.5) ? 1 : 0; }
        return { dx, dy, home: dx === 0 && dy === 0, still, lit, on: new Uint8Array(size), masks: [new Uint16Array(size), new Uint16Array(size)], trunks: [new Uint16Array(size), new Uint16Array(size)], now: 0,
          rects: [whole] as Box[], dark: screen ? [new Uint8Array(sW * sH), new Uint8Array(sW * sH)] : [], specks: [0, 0] };
      });
      const all = Int32Array.from({ length: size }, (_, i) => i);
      // Each group's box on the canvas, unshifted, this frame and the last.
      const boxes = [new Float64Array(many * 4), new Float64Array(many * 4)], pixels = [new Int32Array(many * 4), new Int32Array(many * 4)];
      return (f: number) => {
        // What moved, on the canvas, and its box; what did not stands as it stood.
        const box = boxes[f % 2], before = boxes[1 - (f % 2)];
        for (let g = 0; g < many; g++) {
          if (!moved[g]) { box.set(before.subarray(g * 4, g * 4 + 4), g * 4); continue; }
          project(played.world, groups[g] * 3, groups[g + 1] * 3, xy);
          let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
          for (let i = groups[g] * 6; i < groups[g + 1] * 6; i += 2) {
            const x = xy[i], y = xy[i + 1];
            if (x < lx) lx = x;
            if (x > hx) hx = x;
            if (y < ly) ly = y;
            if (y > hy) hy = y;
          }
          box[g * 4] = lx; box[g * 4 + 1] = ly; box[g * 4 + 2] = hx; box[g * 4 + 3] = hy;
          // Every pixel it can cover, from any place of the grid, is in the window (reachOf).
          if (Math.max(0, Math.ceil(lx - 0.5)) < win.x0 || Math.max(0, Math.ceil(ly - 0.5)) < win.y0 || Math.min(cam.cols - 1, Math.floor(hx + 0.25)) > win.x0 + win.w - 1 || Math.min(cam.rows - 1, Math.floor(hy + 0.25)) > win.y0 + win.h - 1) {
            throw new Error(`band-outline.ts: a moving part reaches past the film's window from ${cam.name} at ${at(f)}`);
          }
        }
        for (const track of tracks) {
          const { dx, dy, home, still, on } = track, was = track.now, next = 1 - was;
          const mask = track.masks[next], trunks = track.trunks[next], old = track.masks[was], oldTrunks = track.trunks[was];
          // The pixels each group can cover at this place of the grid, this frame and the last.
          const at0 = pixels[f % 2], at1 = pixels[1 - (f % 2)];
          for (const [b, p] of [[box, at0], [before, at1]] as const) for (let g = 0; g < many; g++) {
            p[g * 4] = Math.max(0, Math.ceil(b[g * 4] + dx - 0.5)); p[g * 4 + 1] = Math.max(0, Math.ceil(b[g * 4 + 1] + dy - 0.5));
            p[g * 4 + 2] = Math.min(cam.cols - 1, Math.floor(b[g * 4 + 2] + dx - 0.5)); p[g * 4 + 3] = Math.min(cam.rows - 1, Math.floor(b[g * 4 + 3] + dy - 0.5));
          }
          // The pixels that changed, in the window: all of them in the first frame; after it, those where what moved stood or stands,
          // drawn again in as few boxes as cover them, apart. The drawing from two frames back is first brought up to the last frame's,
          // which differs from it only in the boxes drawn then.
          let changed: ArrayLike<number> = all;
          const rects: Box[] = [];
          if (f === 0) { drawInto(xy, played, played.still, played.n, dx, dy, cam, win, mask, trunks, null); rects.push(whole); }
          else {
            for (const r of track.rects) for (let y = r.y0; y <= r.y1; y++) {
              const from = (y - win.y0) * W + r.x0 - win.x0, to = from + r.x1 - r.x0 + 1;
              mask.set(old.subarray(from, to), from);
              trunks.set(oldTrunks.subarray(from, to), from);
            }
            for (let g = 0; g < many; g++) {
              if (!moved[g]) continue;
              let r: Box | null = null;
              for (const p of [at0, at1]) if (p[g * 4] <= p[g * 4 + 2] && p[g * 4 + 1] <= p[g * 4 + 3]) r = r ? { x0: Math.min(r.x0, p[g * 4]), y0: Math.min(r.y0, p[g * 4 + 1]), x1: Math.max(r.x1, p[g * 4 + 2]), y1: Math.max(r.y1, p[g * 4 + 3]) } : { x0: p[g * 4], y0: p[g * 4 + 1], x1: p[g * 4 + 2], y1: p[g * 4 + 3] };
              if (!r) continue;
              for (let i = 0; i < rects.length;) {
                const q = rects[i];
                if (q.x0 > r.x1 || q.x1 < r.x0 || q.y0 > r.y1 || q.y1 < r.y0) { i++; continue; }
                r = { x0: Math.min(r.x0, q.x0), y0: Math.min(r.y0, q.y0), x1: Math.max(r.x1, q.x1), y1: Math.max(r.y1, q.y1) };
                rects.splice(i, 1);
                i = 0;
              }
              rects.push(r);
            }
            const list: number[] = [];
            for (const r of rects) {
              for (let y = r.y0; y <= r.y1; y++) { const from = (y - win.y0) * W + r.x0 - win.x0, to = from + r.x1 - r.x0 + 1; mask.fill(0, from, to); trunks.fill(0, from, to); }
              for (let g = 0; g < many; g++) {
                if (at0[g * 4] > r.x1 || at0[g * 4 + 2] < r.x0 || at0[g * 4 + 1] > r.y1 || at0[g * 4 + 3] < r.y0) continue;
                drawInto(xy, played, groups[g], groups[g + 1], dx, dy, cam, win, mask, trunks, null, r);
              }
              for (let y = r.y0; y <= r.y1; y++) for (let i = (y - win.y0) * W + r.x0 - win.x0, to = i + r.x1 - r.x0; i <= to; i++) {
                const s = still.mask[i], t = still.trunks[i];
                if ((s | mask[i]) !== (s | old[i]) || (t | trunks[i]) !== (t | oldTrunks[i])) list.push(i);
              }
            }
            changed = list;
          }
          track.rects = rects;
          track.now = next;
          if (changed.length) {
            // On a desktop the specks, counted on as they come and go: those that reached a changed pixel or one beside it before, and
            // those that do now.
            const gone = !phone && f > 0 ? piecesNear(W, win.h, on, changed, marks) : 0;
            for (let n = 0; n < changed.length; n++) { const i = changed[n]; on[i] = (still.mask[i] | mask[i]) !== 0 ? 1 : 0; }
            const near = f > 0;
            if (!phone) track.specks[0] += piecesNear(W, win.h, on, changed, marks, null, undefined, near) - gone;
            // The pieces with no trunk, on a phone and at the shoot's own place of the grid.
            if (phone || home) {
              piecesNear(W, win.h, on, changed, marks, [still.trunks, trunks], (stack, count) => {
                let owners = 0, kit = 0, crash = true;
                for (let n = 0; n < count; n++) { const o = stack[n]; owners |= still.mask[o] | mask[o]; kit |= still.crashes[o]; if (!still.crashes[o]) crash = false; }
                if (home && !rung) film.alone.add(`${label(owners)}${crash ? " crash" : ""}`);
                if (phone && owners !== monitor && !(kit === 3 && crash)) film.apart.add(`${cam.name} at ${at(f)}, ${dx},${dy}: ${label(owners)}${kit ? ` (${["", "cymbal", "pole", "cymbal and pole"][kit]})` : ""}`);
              }, near);
            }
            // The pieces that hold two players' trunks or more, at the shoot's own place of the grid: what the changed pixels are of
            // now, for a piece can only come to hold another's trunk where it gains a pixel or a trunk's pixel.
            if (home) heldTogether(W, win.h, on, changed, marks, [still.trunks, trunks], (bits) => {
              const whose = players.filter((k) => bits & (1 << k));
              if (step) for (let a = 0; a + 1 < whose.length; a++) film.touched.add(`rung ${step}: ${whose[a]} and ${whose[a + 1]}`);
              else film.joined.push(`${cam.name} at ${at(f)}: ${whose.join(" and ")}`);
            });
            // On a phone's screen, what of it the changed pixels reach, drawn again at night and at dusk, as `specks` mixes the four
            // canvas pixels round each; and its specks counted on.
            if (screen) {
              const reached: number[] = [], me = ++smarks.n, lit = track.lit;
              if (!near) for (let s = 0; s < sW * sH; s++) reached.push(s);
              else for (let n = 0; n < changed.length; n++) {
                const c = changed[n], cx = c % W, cy = (c - cx) / W;
                for (let row = Math.max(0, cy - 1); row <= cy; row++) for (let j = rows.first[row]; j >= 0 && j <= rows.last[row]; j++) {
                  for (let col = Math.max(0, cx - 1); col <= cx; col++) for (let i = cols.first[col]; i >= 0 && i <= cols.last[col]; i++) {
                    const s = j * sW + i;
                    if (smarks.at[s] !== me) { smarks.at[s] = me; reached.push(s); }
                  }
                }
              }
              for (let t = 0; t < 2; t++) {
                const tone = t ? DUSK : NIGHT, dark = track.dark[t], plain = tone.band < tone.black && Math.min(tone.panel, tone.floor) > tone.black;
                const turned: number[] = [], now: number[] = [];
                for (const s of reached) {
                  const i = s % sW, j = (s - i) / sW, a = rowOf[j] + colOf[i], b = a + 1, c = a + W, d = c + 1, many = on[a] + on[b] + on[c] + on[d];
                  let value: number;
                  if (plain && (many === 0 || many === 4)) value = many === 4 ? 1 : 0;
                  else {
                    const u = us[i], v = vs[j], fu = u - Math.floor(u), fv = v - Math.floor(v);
                    const sa = on[a] ? tone.band : lit[a] ? tone.panel : tone.floor, sb = on[b] ? tone.band : lit[b] ? tone.panel : tone.floor;
                    const sc = on[c] ? tone.band : lit[c] ? tone.panel : tone.floor, sd = on[d] ? tone.band : lit[d] ? tone.panel : tone.floor;
                    value = (1 - fu) * (1 - fv) * sa + fu * (1 - fv) * sb + (1 - fu) * fv * sc + fu * fv * sd < tone.black ? 1 : 0;
                  }
                  if (value !== dark[s]) { turned.push(s); now.push(value); }
                }
                if (!turned.length) continue;
                const gone = near ? piecesNear(sW, sH, dark, turned, smarks) : 0;
                turned.forEach((s, n) => { dark[s] = now[n]; });
                track.specks[t] += piecesNear(sW, sH, dark, turned, smarks, null, undefined, near) - gone;
              }
            }
          }
          // What is to be told of this frame.
          if (!phone && track.specks[0]) film.specks.push(`${cam.name} at ${at(f)}, ${dx},${dy}, at night and at dusk: ${track.specks[0]}`);
          for (let t = 0; t < 2; t++) {
            const tone = t ? DUSK : NIGHT;
            if (band && track.specks[t]) film.specks.push(`${cam.name} at ${at(f)}, ${dx},${dy}, panel ${tone.panel}: ${track.specks[t]}`);
            if (!crowd) continue;
            const key = `${cam.name} ${tone.panel}`;
            if (!film.counts.has(key)) { film.counts.set(key, []); film.own.set(key, []); }
            film.counts.get(key)!.push(track.specks[t]);
            if (home && track.specks[t]) film.own.get(key)!.push(`${at(f)}: ${track.specks[t]}`);
          }
        }
      };
    });
    for (let f = 0; f < frames; f++) {
      // Which groups have moved in the world since the last frame (`moved`).
      played.to(f);
      for (const view of views) view(f);
    }
  }
  return film;
}

// The stage's own parts as stage.js builds them for a show on `day` (its stage of STAGES; with none, the roof's), as triangles in the
// world, each with what it shows as: the stage's black, as dark as the band (the roof, the back wall and the PA stacks; the Wall
// of Sound's cabinets and its bridge; or the arena's roof, its flown PA, its side-fills and its amplifiers' frames), the light panel,
// or the rest of what stands between a camera and what is behind it (the platform, the posts, and the arena's truss, towers and
// grilles).
function stageParts(day?: string) {
  const scene = new THREE.Scene();
  const built = buildStage(scene, null, false, new THREE.MeshBasicMaterial(), { uC0: { value: null }, uC1: { value: null } }, day);
  scene.updateMatrixWorld(true);
  const out: { at: Vec[]; shows: number }[] = [];
  type Part = { isMesh?: boolean; matrixWorld: unknown; geometry: { index: unknown; toNonIndexed(): Part["geometry"]; getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } | undefined } };
  const push = (o: Part, shows: (i: number) => number) => {
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, corner = geometry.getAttribute("position")!;
    for (let i = 0; i < corner.count; i += 3) out.push({ at: [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(corner, i + k).applyMatrix4(o.matrixWorld)), shows: shows(i) });
  };
  // The stage's still parts are one mesh, coloured by its vertices (landmarks.js mergeStill); its black is the darkest of them. The
  // band, coloured by its vertices too, is drawn on its own (band.js's material).
  built.group.traverse((o: Part & { material?: unknown }) => {
    const colour = o.isMesh && o.material !== built.band.material ? o.geometry.getAttribute("color") : undefined;
    if (colour) push(o, (i) => (Math.max(colour.getX(i), colour.getY(i), colour.getZ(i)) < 0.05 ? STAGE_BLACK : STAGE_ELSE));
  });
  push(built.panel, () => STAGE_PANEL);
  return out;
}
// The band and the stage drawn together from a camera, nearest first: for each pixel of the canvas, the player whose part shows there
// (as many as the players for the monitors), or NONE, or what of the stage shows there (STAGE_BLACK, STAGE_PANEL or STAGE_ELSE);
// and, where the band shows, its triangle.
export const NONE = -1, STAGE_BLACK = -2, STAGE_PANEL = -3, STAGE_ELSE = -4;
const STAGE_PARTS = new Map<string, { at: Vec[]; shows: number }[]>();
// A triangle drawn from a camera (`e`, its projection and view, on a canvas W by H) with depth, within a window of the canvas (x0, y0,
// w by h, in which `depth` and `shows` are): where it is nearer than what is drawn, it shows as `tag`, and `whose` is told the pixel.
type Depth = { x0: number; y0: number; w: number; h: number; depth: Float32Array; shows: Int8Array };
const corner = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
function fillDeep(e: number[], W: number, H: number, into: Depth, a: Vec, b: Vec, c: Vec, tag: number, whose: (o: number) => void = () => {}) {
  const p = corner, { x0, y0, w: ww, h: wh, depth, shows } = into;
  for (let k = 0; k < 3; k++) {
    const v = k === 0 ? a : k === 1 ? b : c, w = e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15];
    if (w <= 0.5) return;
    p[k][0] = (((e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) / w + 1) / 2) * W;
    p[k][1] = ((1 - (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) / w) / 2) * H;
    p[k][2] = 1 / w;
  }
  const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
  if (area === 0) return;
  const minx = Math.max(x0, Math.ceil(Math.min(p[0][0], p[1][0], p[2][0]) - 0.5)), maxx = Math.min(x0 + ww - 1, Math.floor(Math.max(p[0][0], p[1][0], p[2][0]) - 0.5));
  const miny = Math.max(y0, Math.ceil(Math.min(p[0][1], p[1][1], p[2][1]) - 0.5)), maxy = Math.min(y0 + wh - 1, Math.floor(Math.max(p[0][1], p[1][1], p[2][1]) - 0.5));
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const qx = x + 0.5, qy = y + 0.5;
    const l0 = ((p[2][0] - p[1][0]) * (qy - p[1][1]) - (p[2][1] - p[1][1]) * (qx - p[1][0])) / area;
    const l1 = ((p[0][0] - p[2][0]) * (qy - p[2][1]) - (p[0][1] - p[2][1]) * (qx - p[2][0])) / area;
    const l2 = 1 - l0 - l1;
    if (l0 < 0 || l1 < 0 || l2 < 0) continue;
    const d = 1 / (l0 * p[0][2] + l1 * p[1][2] + l2 * p[2][2]), o = (y - y0) * ww + (x - x0);
    if (d < depth[o]) { depth[o] = d; shows[o] = tag; whose(o); }
  }
}
const viewOf = (cam: Camera) => new THREE.Matrix4().multiplyMatrices(lens(cam).projectionMatrix, lens(cam).matrixWorldInverse).elements as number[];
// The stage of a show on `day` alone from a camera, over its whole canvas, drawn once a camera and a stage: for each pixel, what of
// the stage shows there (STAGE_BLACK, STAGE_PANEL, STAGE_ELSE, or NONE), and its depth.
const STAGE_DRAWN = new Map<string, Depth>();
export function stageFrom(cam: Camera, day?: string) {
  const key = `${JSON.stringify(cam)} ${day}`, drawn = STAGE_DRAWN.get(key);
  if (drawn) return drawn;
  const parts = STAGE_PARTS.get(`${day}`) ?? stageParts(day);
  STAGE_PARTS.set(`${day}`, parts);
  const W = cam.cols, H = cam.rows, e = viewOf(cam), into = { x0: 0, y0: 0, w: W, h: H, depth: new Float32Array(W * H).fill(Infinity), shows: new Int8Array(W * H).fill(NONE) };
  for (const t of parts) fillDeep(e, W, H, into, t.at[0], t.at[1], t.at[2], t.shows);
  STAGE_DRAWN.set(key, into);
  return into;
}
function drawWithStage(tris: Tri[], cam: Camera, day?: string) {
  const W = cam.cols, H = cam.rows, e = viewOf(cam), stage = stageFrom(cam, day), whose: (Tri | null)[] = new Array(W * H).fill(null);
  const into = { ...stage, depth: stage.depth.slice(), shows: stage.shows.slice() };
  for (const t of tris) fillDeep(e, W, H, into, t.at[0], t.at[1], t.at[2], t.owner, (o) => { whose[o] = t; });
  return { W, H, shows: into.shows, whose };
}
// How a lit player reads against the panel: by the contrast in luminance along its outline. The band is lit by its own light
// (band.js LIGHT) in its clothes' colours (dressOf), and its parts range from as dark as the stage's black (a stand, a black guitar)
// to as light as the panel (a white shirt, a drum's head); what keeps a player from running into the panel is the edge where the two
// meet. Contrast is WCAG's ratio, (L1 + 0.05) / (L2 + 0.05), the lighter's relative luminance over the darker's (each 0 to 1).
// A player's outline is its pixels that have the panel beside them (4-connected, the stage drawn as drawWithStage draws it), each as
// lit as its triangle's face, turned to the eye, takes the band's light (LIGHT itself, run from its text: band-light.ts) in its
// colour, at the night's darkest or at dusk (band.js `light`), against PANEL_LEAST: the panel as dim as the shoot's band still shows
// it behind the band, which is not as dim as the panel goes (below). Two measures of it, from every camera of the shoot:
//   - a pixel of the outline reads where it stands 3:1 from the panel (READS), WCAG's guideline for what identifies a graphic
//     (1.4.11, non-text contrast);
//   - a pixel stands apart from the panel where it stands √3:1 from it (STANDS), half of 3:1 on luminance's log scale, and more than
//     the panel's own light varies behind the band (its 99th percentile over its 1st, 1.33:1 at night and 1.58:1 at dusk, in the
//     fixed day's band still on a desktop): no pixel so far from the panel's least can be taken for a part of the panel.
// What share must: a quarter of the band's whole outline reads (BAND_READS), and a third of each player's stands apart
// (PLAYER_STANDS), where it has SPECK px of outline or more against the panel. These two are a guard against the band getting worse,
// set just under its worst today, and nothing else sets them: the least of the band's whole outline that reads, from any camera, at
// night or at dusk, in any line-up, dressed for any era it played in, is 0.256 (the five of 1965 to 1967 in the late sixties'
// clothes, from the back of the crowd on a phone at dusk; the six of 1971 there 0.261, which with its microphones' stands in the
// kit's chrome read 0.244, and with pale shells on its kits too 0.206: band.js STUFF.steel and ERA_CLOTHES); and the least of a
// player's outline that stands apart 0.385 (the singer of 1975 to 1978, 13 px of outline from the back of the crowd on a desktop
// at dusk). A lit body is mostly darker than the panel, and reads by that. The black band before it read whole against
// PANEL_LEAST, 4.1:1.
//
// PANEL_LEAST is the dimmest pixel behind the band in the fixed day's band still on a desktop, 0.172 at night (in Drums) and 0.178 at
// dusk. The panel goes dimmer. Its light (sky.js liquid) is the set's two colours, mixed by the field, and toward the first's dark
// veins by up to 0.6; it is dimmest in set 2's, magenta and teal, at 0.128 where the field is all magenta and all vein (0.132 the least
// found at 10.8 million points of the panel's lower half, behind the band, through the show's energies and the tiers' octaves). And its
// gain moves with the music (audio.js mappings `panel`), to 0.6 in a quiet passage: 2.7 % of the 45 maps' time is under 0.05 loud. So
// the panel's least is 0.077 (0.079 found), in a quiet passage of set 2. The hour does not light it, and the fog takes 1.4 % of it at
// the most (the path's camera, 97 m from it; fog from 80 m). Against that the band reads nowhere and stands apart by 0.067 at the
// least; at 0.132, the field's least at full gain, it reads by 0.083 and stands apart by 0.231. Nothing darker than a panel of 0.10 or
// less stands 3:1 from it, not even the black band (2.4:1 at 0.079): there only a part lit to 0.34 or more would.
export const PANEL_LEAST = 0.17, READS = 3, STANDS = Math.sqrt(3), BAND_READS = 1 / 4, PLAYER_STANDS = 1 / 3;
export const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// The luminance of a triangle lit by the band's light (`u`, its uniforms) seen through `camera`: LIGHT itself, run on the triangle's
// middle and its face's normal turned to the eye (band-light.ts), in the triangle's colour.
export function litOf(t: Tri, camera: { position: Vec; matrixWorldInverse: { elements: number[] } }, u: LightUniforms) {
  const [a, b, c] = t.at, mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (n.dot(new THREE.Vector3().copy(camera.position).sub(mid)) < 0) n.negate();
  return luminance(lightAt(camera.matrixWorldInverse, mid, n, t.colour, u));
}
// Each player's outline against the panel from a camera, on the stage of a show on `day`, the band dressed for it, at rest and fitted
// to the camera's canvas, lit for a night `dark` dark (night.js, 0 to 1), against a panel `least` in luminance: for each player from
// the crowd's left, how many pixels of its outline there are (`edge`), how many read (`reads`) and how many stand apart (`stands`).
export function outlineRead(roles: string[], cam: Camera, day: string | undefined, darks: number[], least = PANEL_LEAST) {
  const { tris, built } = band(roles, 0, pixelOf(cam), day ?? null), players = roles.length;
  const drawn = drawWithStage(tris, cam, day), { W, H, shows, whose } = drawn, camera = lens(cam);
  return darks.map((dark) => {
    built.light(dark);
    const lum = new Map(tris.map((t) => [t, litOf(t, camera, built.uniforms)]));
    const out = Array.from({ length: players }, () => ({ edge: 0, reads: 0, stands: 0 }));
    for (let o = 0; o < W * H; o++) {
      const k = shows[o];
      if (k < 0 || k >= players) continue;
      const x = o % W, y = (o - x) / W;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && shows[(y + dy) * W + x + dx] === STAGE_PANEL)) continue;
      out[k].edge++;
      const ratio = contrast(lum.get(whose[o]!)!, least);
      if (ratio >= READS) out[k].reads++;
      if (ratio >= STANDS) out[k].stands++;
    }
    return out;
  });
}

// Who of the band comes within `reach` pixels of the stage's black from a camera: the band drawn with the stage of a show on `day`,
// as drawWithStage draws them, its corners `world` (nine numbers a triangle) and each triangle's `owner`, over the band's box on the
// canvas and a pixel more than `reach` round it, which holds every pixel it can cover and those round each.
function nearBlack(world: Float64Array, owner: Uint8Array, cam: Camera, day?: string, reach = 2) {
  const W = cam.cols, H = cam.rows, e = viewOf(cam), stage = stageFrom(cam, day), n = owner.length;
  const at = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (let i = 0; i < n * 3; i++) {
    const x = world[i * 3], y = world[i * 3 + 1], z = world[i * 3 + 2], w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 0.5) continue;
    const u = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2) * W, v = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2) * H;
    lx = Math.min(lx, u); hx = Math.max(hx, u); ly = Math.min(ly, v); hy = Math.max(hy, v);
  }
  const near = new Set<number>();
  if (!(lx <= hx)) return near;
  const x0 = Math.max(0, Math.floor(lx) - reach - 1), y0 = Math.max(0, Math.floor(ly) - reach - 1), x1 = Math.min(W - 1, Math.ceil(hx) + reach + 1), y1 = Math.min(H - 1, Math.ceil(hy) + reach + 1);
  if (x0 > x1 || y0 > y1) return near;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, into = { x0, y0, w, h, depth: new Float32Array(w * h), shows: new Int8Array(w * h) };
  for (let y = 0; y < h; y++) { into.depth.set(stage.depth.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w); into.shows.set(stage.shows.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w); }
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) at[k].set(world[t * 9 + k * 3], world[t * 9 + k * 3 + 1], world[t * 9 + k * 3 + 2]);
    fillDeep(e, W, H, into, at[0], at[1], at[2], owner[t]);
  }
  for (let o = 0; o < w * h; o++) {
    if (into.shows[o] < 0) continue;
    const x = o % w, y = (o - x) / w;
    for (let Y = Math.max(0, y - reach); Y <= Math.min(h - 1, y + reach); Y++) for (let X = Math.max(0, x - reach); X <= Math.min(w - 1, x + reach); X++) {
      if (into.shows[Y * w + X] === STAGE_BLACK) near.add(into.shows[o]);
    }
  }
  return near;
}

// The moments at which the tests see whether the band keeps clear of the stage's black: at rest, as the band is built (and as a
// visitor who asks for reduced motion sees it), and at four moments through a bar at 96 a minute: each stick at its top once, the
// strumming arms at both ends of their swings, the singer's sway at both ends, and the keys player's and the organ's player's hands
// at the tops of their lifts, the keys' left at 1.25 s and right at 2.5 s and the organ's the other way about (its left a frame short
// of the top). The pianist's lag puts its lift's top after 3 s, where none of these falls: the lift's test draws it there
// (liftShown). Drawn in every frame at 60 a second, from every camera and rung at the shoot's own place of the grid, no line-up came
// within two pixels of the stage's black. What comes apart, and where two players meet, the film finds in every frame (filmOf):
// looked for at these moments alone, a drummer's wrist from the back of the crowd on a phone was missed between them in seven
// line-ups of the ten, main's six among them, and the December 1971 pianist's lifted hand, a pixel at one of the 16 places from the
// crowd on a desktop; and so was the bass of the sevens of 1968-70 and 1990-92 meeting the first drummer at a phone's rungs.
const MOMENTS = [0, 0.6, 1.25, 1.9, 2.5];
export const PHASES = [0, 0.25, 0.5, 0.75].flatMap((dx) => [0, 0.25, 0.5, 0.75].map((dy) => [dx, dy]));

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

/* The places of the grid the outlines' film draws each line-up at: in CI the shoot's own, (0, 0), where its stills are drawn; and
   with BAND_FILM=all in the environment (`BAND_FILM=all npm run test:run`), all 16 (PHASES), which take about nine times as long, a
   quarter of a minute a line-up here. Every frame, every camera and both rates are the same at each. CI's Unit tests job ran 8.6
   min with all 16, against main's 2.7 to 3.6. */
const FILM_PLACES = process.env.BAND_FILM === "all" ? PHASES : [[0, 0]];
const FILM_AT = FILM_PLACES.length === 1 ? "at the shoot's own place of the pixel grid" : `at any of ${FILM_PLACES.length} places of the pixel grid`;

/* The stages a line-up stood on (stage.js STAGES): each stage that any row of lineup.js with its roles overlaps, once, named by the first
   day of the line-up on it, in date order. The six of 1972 to 1974 played on the roof's stage and on the Wall of Sound, and so did
   the seven of 1974 to 1979, whose first show was the Wall's last. */
export function stagesOf(roles: string[]) {
  const out: { stage: string; day: string; from: string; to: string }[] = [];
  for (const [from, to, its] of LINEUPS as [string, string, string[]][]) {
    if (its.join(" ") !== roles.join(" ")) continue;
    for (const [first, last, stage] of STAGES as [string, string, string][]) {
      if (first > to || last < from || out.some((s) => s.stage === stage)) continue;
      out.push({ stage, day: first > from ? first : from, from: first, to: last });
    }
  }
  return out;
}
/* The looks a line-up stood in (lineup.js, stage.js STAGES and band.js WARDROBES): each stage and era of clothes that any row of
   lineup.js with its roles overlaps, once, named by its first day, in date order. */
export function looksOf(roles: string[]) {
  const out: { stage: string; era: string; day: string }[] = [];
  for (const [from, to, its] of LINEUPS as [string, string, string[]][]) {
    if (its.join(" ") !== roles.join(" ")) continue;
    for (const [sFrom, sTo, stage] of STAGES as [string, string, string][]) for (const [wFrom, wTo, era] of WARDROBES as [string, string, string][]) {
      const day = [from, sFrom, wFrom].sort().at(-1)!, last = [to, sTo, wTo].sort()[0];
      if (day <= last && !out.some((l) => l.stage === stage && l.era === era)) out.push({ stage, era, day });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1));
}
// How the tests name a stage, where a line-up stood on more than one, and its black.
const STAGE_NAMES: Record<string, string> = { roof: "the roof's stage", wall: "the Wall of Sound", arena: "the arena's stage" };
const STAGE_BLACKS: Record<string, string> = { roof: "the roof, the back wall or a PA stack", wall: "the Wall's cabinets or the rig's bridge over its front", arena: "the roof, the back wall, the flown PA, a side-fill or an amplifier's frame" };

/* The rules every line-up keeps, as a describe block of its own: `name` is how the tests name it, and `day` (YYYY-MM-DD) a date of its
   row of lineup.js, whose roles it is. What the band is held to against the stage, it is held to on every stage it stood on
   (stagesOf). */
export function outlineChecks(name: string, day: string, bars: Bars = {}) {
  const roles = lineupOn(day).roles as string[];
  const stages = stagesOf(roles), on = (s: { stage: string }) => (stages.length > 1 ? `, on ${STAGE_NAMES[s.stage] ?? s.stage}` : "");
  const lift = { ...LIFT_LEAST, ...bars.lift };
  // The players as the band numbers them, from the crowd's left (band.js STAGING), which is not the order of the table's row.
  const order = STAGING[roles.join(" ") as keyof typeof STAGING].players.map(([role]) => String(role));
  const n = roles.length, monitors = n;
  const players = Array.from({ length: n }, (_, k) => k);
  const label = (bits: number) => [...players.filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << monitors) ? ["monitor"] : [])].join(" and ");
  // The film of the line-up from every camera and rung (filmOf), made once, at FILM_PLACES.
  let made: Film | null = null;
  const film = () => (made ??= filmOf(roles, label, [...CAMERAS, ...FLASH_CAMERAS, ...RUNGS], { places: () => FILM_PLACES }));

  describe(`${name}: the band's outlines, as the shoot's devices draw them`, () => {
    beforeAll(() => {
      // quality.js reads the device's pixel ratio for a desktop's budget.
      vi.stubGlobal("window", { devicePixelRatio: 1 });
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    // Measured with the six as they stand, in every frame of the film: none on a desktop or from the band pose on a phone, at night or
    // at dusk. From the back of the crowd on a phone, on the 390- and the 360-wide phone: none at night; at dusk 0.12 and under 0.001
    // a frame, one at worst, and none in 88 % and in all but a few of the frames; and never at the shoot's own place of the grid
    // (0, 0), where CI's stills are drawn. In the other line-ups, 0.004 a frame at night at the most and 0.17 at dusk. Drawn at five
    // moments of a bar alone (MOMENTS), as the tests drew it before the film: with heads 6 to 12 cm long and the bass's neck 4 cm
    // longer, and not fitted to the canvas, at night 0.42 and 0.61 a frame, and at that place the second guitar's head in four
    // moments of five, as CI's stills showed it, and at dusk the bass's in three; with dc68304's necks, which reached further and
    // whose crashes' poles were not fitted to the canvas, 4.46 and 3.58 a frame at night, six at worst, and in every frame. A move
    // that holds at its ends (band.js MOVE) holds a part where it comes apart longer than one that eased through.
    it(`comes apart nowhere on a desktop, nor on a phone at the front of the stage: no near-black speck of 12 px or less in any frame from rest through a bar, ${FILM_AT}`, () => {
      expect(film().specks).toEqual([]);
    }, 120_000);

    it("comes apart little on a phone from the back of the crowd: at night under 0.3 specks a frame, at most one in any and none in three frames in four, at dusk under 0.6, at most two and none in three in five, and none at the shoot's own place of the grid in any frame", () => {
      const limits = [{ shade: NIGHT, mean: 0.3, most: 1, none: 3 / 4 }, { shade: DUSK, mean: 0.6, most: 2, none: 3 / 5 }];
      for (const cam of CAMERAS.filter((c) => c.name.startsWith("phone") && c.name.endsWith("crowd"))) {
        for (const bar of limits) {
          const counts = film().counts.get(`${cam.name} ${bar.shade.panel}`)!, own = film().own.get(`${cam.name} ${bar.shade.panel}`)!;
          const mean = counts.reduce((sum, k) => sum + k, 0) / counts.length;
          const seen = [cam.name, bar.shade.panel, mean < bar.mean, Math.max(...counts) <= bar.most, counts.filter((k) => k === 0).length >= bar.none * counts.length, own];
          expect(seen).toEqual([cam.name, bar.shade.panel, true, true, true, []]);
        }
      }
    }, 120_000);

    // And at every rung a phone steps down to, where #184's review found a player's head 6 px from the keys player's lifted hand at rung
    // 2: there two outlines may meet only where the line-up's test says so (`touch`).
    it("keeps each player an outline of their own from every pose, at rest and through a bar, and meets another at a phone's lower rungs only where it says: in no frame does a piece of black hold two players' trunks, or hold no trunk but a crash on its pole", () => {
      expect(film().joined).toEqual([]);
      expect([...film().touched].sort()).toEqual([...(bars.touch ?? [])].sort());
      // What stands apart is a drummer's crash on its pole, which stands out past its kit on the drummer's left, clear of every outline,
      // so that it reads as a cymbal, and a monitor at the stage's lip, which is no one's: which crashes, the line-up's test says
      // (`apart`). With the six it is the second drummer's; the first's stands on its kit's floor tom.
      expect((bars.apart ?? []).every((piece) => order[Number(piece.split(" ")[0])] === "drums" && piece.endsWith(" crash"))).toBe(true);
      expect([...film().alone].sort()).toEqual([...(bars.apart ?? []), "monitor"].sort());
    }, 120_000);

    // Measured with the six as they stand: four pixels at the closest, from among the crowd on a desktop (the first guitar, by the left
    // PA stack) and from the back of the crowd at half a phone's pixels (the keys player, by the right of the back wall). In the band
    // before it the keys' cabinet ran into the back wall's black from the front of the crowd.
    for (const stage of stages) {
      it(`keeps the band clear of the stage's own black from every camera and at every rung of a phone's${on(stage)}: two pixels of something else at the least between any part of the band and ${STAGE_BLACKS[stage.stage]}`, () => {
        // The band at MOMENTS, fitted to each canvas as main.js fits it: played once a canvas's pixel, from every camera that has it.
        const near = new Set<string>(), cams = [...CAMERAS, ...FLASH_CAMERAS, ...RUNGS];
        for (const perPx of new Set(cams.map(pixelOf))) {
          const played = playing(roles, perPx);
          for (const seconds of MOMENTS) {
            played.to(Math.round(seconds * 60));
            for (const cam of cams.filter((c) => pixelOf(c) === perPx)) for (const k of nearBlack(played.world, played.owner, cam, stage.day)) near.add(`${cam.name} at ${seconds} s: ${k === monitors ? "monitor" : k}`);
          }
        }
        expect([...near]).toEqual([]);
      }, 120_000);
    }

    // Lit and in colour, a player reads against the panel by contrast in luminance along its outline (outlineRead), in every look the
    // line-up stood in: on each stage and in each era's clothes.
    for (const look of looksOf(roles)) {
      it(`reads against the panel, lit, from every camera at night and at dusk, ${look.era}${stages.length > 1 ? ` on ${STAGE_NAMES[look.stage] ?? look.stage}` : ""}: a quarter of the band's outline 3:1 from the panel's least, and a third of each player's √3:1`, () => {
        const found: string[] = [];
        for (const cam of [...CAMERAS, ...FLASH_CAMERAS]) {
          outlineRead(roles, cam, look.day, [1, 0]).forEach((seen, t) => {
            const when = `${cam.name} ${t ? "at dusk" : "at night"}`, edge = seen.reduce((sum, p) => sum + p.edge, 0), reads = seen.reduce((sum, p) => sum + p.reads, 0);
            if (reads < BAND_READS * edge) found.push(`${when}: the band ${(reads / edge).toFixed(2)}`);
            seen.forEach((p, k) => { if (p.edge >= SPECK && p.stands < PLAYER_STANDS * p.edge) found.push(`${when}: ${k} ${(p.stands / p.edge).toFixed(2)}`); });
          });
        }
        expect(found).toEqual([]);
      }, 120_000);
    }

    // CI's phone at rung 5, half its pixels, from the back of the crowd at daybreak: each crash stood alone in the air, its pole under
    // half a pixel (band.js `fit`).
    it("keeps every part on its player at every rung a phone steps down to, from every pose: in no frame does a piece of black hold no trunk but a monitor, or a crash on its pole", () => {
      expect([...film().apart]).toEqual([]);
    }, 120_000);

    // Every keyboard player of the line-up is held to its role's least (LIFT_LEAST): the keys, the organ and the piano.
    const keyboards = order.map((role, k) => [role, k] as const).filter(([role]) => KEYBOARDS.includes(role));
    for (const [role, at] of keyboards) for (const stage of stages) {
      it(`shows the ${role} player playing from the front of the crowd and from the stage pose, on a desktop and on a phone${on(stage)}: at the top of each lift the forearm and the hand stand against the panel, and the body shows from below the shoulders`, () => {
        const shows = liftShown(roles, at, stage.day);
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
      const cams = [FLASH_CAMERAS[0], ...CAMERAS.filter((c) => c.name === "phone crowd")], offsets = [[0, 0], [0.5, 0.5], [0.25, 0.75], [0.75, 0.25]];
      for (const [count, [bpm, lead, then, seconds]] of [["96", [96, 4, 96, 3]], ["91 after 150", [150, 4, 91, 6]]] as [string, number[]][]) {
        const counted = flickerOf(roles, bpm, lead, then, seconds, cams, offsets);
        cams.forEach((cam, c) => offsets.forEach(([dx, dy], o) => { if (counted[c][o].most > 5) found.push(`${cam.name} at ${count}, ${dx},${dy}: ${counted[c][o].most}`); }));
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
// and on a phone (`shown`), fitted to each camera's canvas, on the stage of a show on `day`.
export function liftShown(roles: string[], at: number, day?: string) {
  return liftTops(roles, at).map(({ side, seconds }) => ({
    side,
    at: [...CAMERAS.filter((c) => c.pose.startsWith("band") || c.pose === "stage"), ...FLASH_CAMERAS].map((cam) => ({ cam: cam.name, ...shown(band(roles, seconds, pixelOf(cam)).tris, cam, at, side, day) })),
  }));
}

// How much of player `at` shows at a moment from a camera, in the canvas's pixels: `arm`, the `side` forearm and hand where, without
// that arm, the panel shows; and `body`, the trunk where it shows below the shoulders' line, which is the upper arms' tops.
function shown(tris: Tri[], cam: Camera, at: number, side: string, day?: string) {
  const reach = new RegExp(`^${side} (upper arm|forearm|hand)$`);
  const full = drawWithStage(tris, cam, day), bare = drawWithStage(tris.filter((x) => !(x.owner === at && reach.test(x.bone))), cam, day);
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
// change of 0.1 from the block's last turn. The band at its darkest is 0.01 (the strictest case, as the film's), the light panel behind it 0.3, as bright as it reads in the
// counter's traces, and anything else 0.05. Only the phone's tier is read: a desktop draws a pixel to a pixel, and one pixel of a
// 2x2 block that flips changes its luminance by 0.07 at the most.

// Each corner of `world` from `from` to `to` on a camera's canvas, unshifted, as the flicker's GPU puts it (`e`, the camera's
// projection and view, on a canvas W by H).
function onCanvas(e: number[], W: number, H: number, world: Float64Array, from: number, to: number, uv: Float64Array) {
  for (let i = from; i < to; i++) {
    const x = world[i * 3], y = world[i * 3 + 1], z = world[i * 3 + 2], w = e[3] * x + e[7] * y + e[11] * z + e[15];
    uv[i * 2] = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) / 2) * W;
    uv[i * 2 + 1] = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) / 2) * H;
  }
}
// Where a screen's pixels read the canvas, along one way: from screen pixel `s0`, `count` of them, at `k` screen pixels a canvas
// pixel, over the box's canvas pixels from `b0`, `bn` of them. For each screen pixel, the two canvas pixels it mixes (`at`, from the
// box's first, or -1 outside it) and the share of the second (`part`); and for each canvas pixel, the first and the last screen
// pixel that read it (`lo`, `hi`).
function readsOf(s0: number, count: number, b0: number, bn: number, k: number) {
  const at = new Int32Array(count * 2), part = new Float64Array(count), lo = new Int32Array(bn).fill(count), hi = new Int32Array(bn).fill(-1);
  for (let i = 0; i < count; i++) {
    const u = (s0 + i + 0.5) / k - 0.5, u0 = Math.floor(u);
    part[i] = u - u0;
    for (let q = 0; q < 2; q++) {
      const x = u0 + q - b0, inside = x >= 0 && x < bn;
      at[i * 2 + q] = inside ? x : -1;
      if (inside) { if (i < lo[x]) lo[x] = i; if (i > hi[x]) hi[x] = i; }
    }
  }
  return { at, part, lo, hi };
}
type Reads = ReturnType<typeof readsOf>;
type Grid = { ox: number; oy: number; cols: number; rows: number; way: Int8Array; turn: Float32Array; low: Float32Array; high: Float32Array; swings: number[][]; stamp: Int32Array; dirty: Int32Array; many: number };
type Glow = { dx: number; dy: number; bx: number; by: number; bw: number; bh: number; sw: number; sh: number; ground: Float32Array; lum: Float32Array;
  mask: Uint8Array; bare: Uint8Array; over: Uint16Array; touch: Int32Array; touched: Int32Array; many: number; xy: Float64Array; across: Reads; down: Reads; stamp: Int32Array;
  dirty: Int32Array; grids: Grid[]; most: number };
// The screen of camera `cam` with the grid shifted `dx`, `dy`, over the band's box on its canvas (`lo` and `hi`, unshifted): the
// box's pixels and the screen's over it, the light panel's and the floor's luminance there, and the counter's blocks.
function glowOf(cam: Camera, e: number[], lo: number[], hi: number[], dx: number, dy: number, n: number): Glow {
  const W = cam.cols, H = cam.rows, k = cam.screen;
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
  // The band's box on the canvas over all the frames, and the screen's pixels over it: a sum rounds the same way whatever it is added
  // to, so the least of the corners shifted is the least of them shifted.
  const x0 = Math.min(W, lo[0] + dx), x1 = Math.max(0, hi[0] + dx), y0 = Math.min(H, lo[1] + dy), y1 = Math.max(0, hi[1] + dy);
  const bx = Math.max(0, Math.floor(x0) - 2), by = Math.max(0, Math.floor(y0) - 2), bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by;
  const sx = Math.ceil(bx * k), sy = Math.ceil(by * k), sw = Math.floor((bx + bw) * k) - sx - 1, sh = Math.floor((by + bh) * k) - sy - 1;
  const ground = new Float32Array(sw * sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) ground[j * sw + i] = lit((sx + i + 0.5) / k, (sy + j + 0.5) / k) ? 0.3 : 0.05;
  // Each grid's blocks: the counter's turning state, and the frames of its swings.
  const grids = [[0, 0], [1, 1], [1, 0], [0, 1]].map(([ox, oy]) => {
    const cols = Math.floor((sw - ox) / 2), rows = Math.floor((sh - oy) / 2), blocks = cols * rows;
    return { ox, oy, cols, rows, way: new Int8Array(blocks), turn: new Float32Array(blocks), low: new Float32Array(blocks).fill(1), high: new Float32Array(blocks),
      swings: Array.from({ length: blocks }, () => [] as number[]), stamp: new Int32Array(blocks).fill(-1), dirty: new Int32Array(blocks), many: 0 };
  });
  return { dx, dy, bx, by, bw, bh, sw, sh, ground, lum: new Float32Array(sw * sh), mask: new Uint8Array(bw * bh), bare: new Uint8Array(bw * bh), over: new Uint16Array(bw * bh),
    touch: new Int32Array(bw * bh).fill(-1), touched: new Int32Array(bw * bh), many: 0,
    xy: new Float64Array(n * 6), across: readsOf(sx, sw, bx, bw, k), down: readsOf(sy, sh, by, bh, k), stamp: new Int32Array(sw * sh).fill(-1), dirty: new Int32Array(sw * sh), grids, most: 0 };
}
// Triangles `from` to `to` of a glow's corners on the grid (`xy`) drawn as the GPU draws them, over the box's pixels: into `bare`,
// the still parts, or with `by` 1 or -1 into `over`, how many triangles of what moves cover each pixel, each pixel it reaches told
// once a frame (`touched`). A triangle drawn again from the same corners covers the same pixels, so taken off so it leaves them as
// they were.
function cover(glow: Glow, from: number, to: number, by: number, f: number) {
  const { xy, bx, by: top, bw, bh, bare, over, touch, touched } = glow;
  for (let t = from * 6; t < to * 6; t += 6) {
    const ax = xy[t], ay = xy[t + 1], qx = xy[t + 2], qy = xy[t + 3], cx = xy[t + 4], cy = xy[t + 5];
    const area = (qx - ax) * (cy - ay) - (qy - ay) * (cx - ax);
    if (area === 0) continue;
    const minx = Math.max(bx, Math.ceil(Math.min(ax, qx, cx) - 0.5)), maxx = Math.min(bx + bw - 1, Math.floor(Math.max(ax, qx, cx) - 0.5));
    const miny = Math.max(top, Math.ceil(Math.min(ay, qy, cy) - 0.5)), maxy = Math.min(top + bh - 1, Math.floor(Math.max(ay, qy, cy) - 0.5));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const mx = x + 0.5, my = y + 0.5;
      if (((qx - ax) * (my - ay) - (qy - ay) * (mx - ax)) / area < 0 || ((cx - qx) * (my - qy) - (cy - qy) * (mx - qx)) / area < 0 || ((ax - cx) * (my - cy) - (ay - cy) * (mx - cx)) / area < 0) continue;
      const o = (y - top) * bw + (x - bx);
      if (by === 0) { bare[o] = 1; continue; }
      over[o] += by;
      if (touch[o] !== f) { touch[o] = f; touched[glow.many++] = o; }
    }
  }
}
// A canvas pixel's mask, 0 outside the box.
const masked = (glow: Glow, x: number, y: number) => (x < 0 || y < 0 ? 0 : glow.mask[y * glow.bw + x]);
// Frame `f` on a glow's screen, its mask drawn: each screen pixel that reads a canvas pixel that changed is shaded again, and each
// block that holds one is read, as the counter reads it. A block none of whose pixels changed reads as it did, and the counter
// reading the same again turns nothing.
function glowFrame(glow: Glow, f: number) {
  const { mask, bare, over, touched, bw, sw, sh, lum, ground, across, down, stamp, dirty, grids } = glow;
  let many = 0, changed = 0;
  // The canvas's pixels that what moved reached, and of them those whose mask changed, put first in `touched`.
  for (let d = 0; d < glow.many; d++) {
    const o = touched[d], on = bare[o] || over[o] > 0 ? 1 : 0;
    if (on !== mask[o] || f === 0) { mask[o] = on; touched[changed++] = o; }
  }
  glow.many = 0;
  if (f === 0) {
    for (let o = 0; o < mask.length; o++) mask[o] = bare[o] || over[o] > 0 ? 1 : 0;
    for (let s = 0; s < sw * sh; s++) dirty[many++] = s;
  } else for (let d = 0; d < changed; d++) {
    const o = touched[d], x = o % bw, y = (o - x) / bw;
    for (let j = down.lo[y]; j <= down.hi[y]; j++) for (let i = across.lo[x]; i <= across.hi[x]; i++) {
      const s = j * sw + i;
      if (stamp[s] !== f) { stamp[s] = f; dirty[many++] = s; }
    }
  }
  for (const g of grids) g.many = 0;
  for (let d = 0; d < many; d++) {
    const s = dirty[d], i = s % sw, j = (s - i) / sw;
    const a = across.at[i * 2], b = across.at[i * 2 + 1], p = down.at[j * 2], q = down.at[j * 2 + 1], fu = across.part[i], fv = down.part[j];
    const share = (1 - fu) * (1 - fv) * masked(glow, a, p) + fu * (1 - fv) * masked(glow, b, p) + (1 - fu) * fv * masked(glow, a, q) + fu * fv * masked(glow, b, q);
    lum[s] = ground[s] + (0.01 - ground[s]) * share;
    for (const g of grids) {
      const X = i - g.ox, Y = j - g.oy;
      if (X < 0 || Y < 0) continue;
      const bi = X >> 1, bj = Y >> 1;
      if (bi >= g.cols || bj >= g.rows) continue;
      const block = bj * g.cols + bi;
      if (g.stamp[block] !== f) { g.stamp[block] = f; g.dirty[g.many++] = block; }
    }
  }
  for (const g of grids) for (let d = 0; d < g.many; d++) {
    const b = g.dirty[d], X = (b % g.cols) * 2 + g.ox, Y = Math.floor(b / g.cols) * 2 + g.oy;
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
    glow.most = Math.max(glow.most, list.length - first);
  }
}
// A corner put on the GPU's grid, of 1/256 of a pixel.
const snap = (value: number) => Math.round(value * 256) / 256;
// The most swings in any second at any block of each camera's screen, with the pixel grid shifted by each of `offsets` ([camera]
// [offset]), and the swings: the band played from rest at `bpm` for `lead` seconds unrecorded, then each frame of `seconds` more at `then` a minute,
// fitted to a phone's canvas at its own scale. The band is played twice (`playing`), once for its box on each canvas over the frames
// and once to draw them; what moves is put on each canvas only in the frames it moves, the still parts are drawn once, and only the
// screen's pixels over a canvas pixel that changed are shaded again. So each count is the one that drawing every frame whole finds
// (band-outline.test.ts holds it to that).
// The work is done in plain functions: in one closure over another, V8 on Node 25 gave one of the counts as another number in about
// one run in five.
export function flickerOf(roles: string[], bpm: number, lead: number, then: number, seconds: number, cams: Camera[], offsets: number[][]) {
  const tempo = (frame: number) => (frame <= lead * 60 ? bpm : then), from = lead * 60 + 1, count = seconds * 60, perPx = pixelOf(FLASH_CAMERAS[0]);
  const lenses = cams.map((cam) => { const camera = lens(cam); return new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements as number[]; });
  // The band's box on each canvas over the frames, unshifted: the still parts' corners once, and those of each group that moved.
  const pre = playing(roles, perPx, 60, tempo), groups = pre.groups, many = groups.length - 1, n = pre.n, still = pre.still;
  const uvs = cams.map(() => new Float64Array(n * 6)), lo = cams.map(() => [Infinity, Infinity]), hi = cams.map(() => [-Infinity, -Infinity]);
  const spread = (c: number, a: number, b: number) => {
    const uv = uvs[c], l = lo[c], h = hi[c];
    for (let i = a; i < b; i++) {
      const u = uv[i * 2], v = uv[i * 2 + 1];
      if (u < l[0]) l[0] = u;
      if (u > h[0]) h[0] = u;
      if (v < l[1]) l[1] = v;
      if (v > h[1]) h[1] = v;
    }
  };
  for (let f = 0; f < count; f++) {
    pre.to(from + f);
    for (let c = 0; c < cams.length; c++) {
      if (f === 0) { onCanvas(lenses[c], cams[c].cols, cams[c].rows, pre.world, 0, n * 3, uvs[c]); spread(c, 0, n * 3); continue; }
      for (let g = 0; g < many; g++) if (pre.moved[g]) { onCanvas(lenses[c], cams[c].cols, cams[c].rows, pre.world, groups[g] * 3, groups[g + 1] * 3, uvs[c]); spread(c, groups[g] * 3, groups[g + 1] * 3); }
    }
  }
  const played = playing(roles, perPx, 60, tempo), glows = cams.map((cam, c) => offsets.map(([dx, dy]) => glowOf(cam, lenses[c], lo[c], hi[c], dx, dy, n)));
  for (let f = 0; f < count; f++) {
    played.to(from + f);
    for (let c = 0; c < cams.length; c++) {
      const uv = uvs[c];
      if (f === 0) onCanvas(lenses[c], cams[c].cols, cams[c].rows, played.world, 0, n * 3, uv);
      else for (let g = 0; g < many; g++) if (played.moved[g]) onCanvas(lenses[c], cams[c].cols, cams[c].rows, played.world, groups[g] * 3, groups[g + 1] * 3, uv);
      for (const glow of glows[c]) {
        // The corners on the grid, and what they cover: the still parts' once, and then each group that moved taken off where it was
        // and drawn where it is.
        const xy = glow.xy;
        if (f === 0) {
          for (let i = 0; i < n * 3; i++) { xy[i * 2] = snap(uv[i * 2] + glow.dx); xy[i * 2 + 1] = snap(uv[i * 2 + 1] + glow.dy); }
          cover(glow, 0, still, 0, f);
          cover(glow, still, n, 1, f);
        } else for (let g = 0; g < many; g++) {
          if (!played.moved[g]) continue;
          cover(glow, groups[g], groups[g + 1], -1, f);
          for (let i = groups[g] * 3; i < groups[g + 1] * 3; i++) { xy[i * 2] = snap(uv[i * 2] + glow.dx); xy[i * 2 + 1] = snap(uv[i * 2 + 1] + glow.dy); }
          cover(glow, groups[g], groups[g + 1], 1, f);
        }
        glowFrame(glow, f);
      }
    }
  }
  // And each swing, as "grid block frame", the grid as its corner's place in the screen's first 2x2.
  return glows.map((row) => row.map((glow) => ({ most: glow.most, swings: glow.grids.flatMap((g) => g.swings.flatMap((list, b) => list.map((f) => `${g.ox},${g.oy} ${b} ${f}`))) })));
}
