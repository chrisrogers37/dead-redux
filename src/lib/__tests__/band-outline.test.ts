import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FIRST_EYE, height } from "../../../public/world/ground.js";
import { budgetFor } from "../../../public/world/quality.js";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { CAMERAS, DUSK, draw, filmOf, FLASH_CAMERAS, NIGHT, outlineChecks, PHASES, pieces, playing, POSES, RUNGS, specks } from "./band-outline";

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
// second, at three places of the grid.
describe("the outlines' film", () => {
  it("finds frame by frame what drawing each frame whole finds: the same specks, the same counts of them and the same pieces with no trunk", () => {
    const roles = ["lead", "rhythm", "bass", "drums", "drums", "keys"], n = roles.length, seconds = 0.25, places = [[0, 0], [0.5, 0.25], [0.75, 0.75]];
    const label = (bits: number) => [...roles.map((_, k) => k).filter((k) => bits & (1 << k)).map(String), ...(bits & (1 << n) ? ["monitor"] : [])].join(" and ");
    const path = CAMERAS.find((c) => c.name === "desktop path")!, small = { ...path, name: "desktop path at a quarter", cols: path.cols / 4, rows: path.rows / 4 };
    const cams = [small, ...["phone band", "phone crowd", "phone crowd at rung 3"].map((name) => [...CAMERAS, ...RUNGS].find((c) => c.name === name)!)];
    const film = filmOf(roles, label, cams, { rate: () => 60, seconds, fit: () => 0 }), played = playing(roles, 0);
    const found = { specks: [] as string[], counts: [] as string[], apart: new Set<string>(), alone: new Set<string>() }, got = { counts: [] as string[] };
    for (let f = 0; f <= seconds * 60; f++) {
      played.to(f);
      const tris = Array.from({ length: played.n }, (_, t) => ({ at: [0, 1, 2].map((c) => new THREE.Vector3(...played.world.slice(t * 9 + c * 3, t * 9 + c * 3 + 3))), owner: played.owner[t], trunk: played.trunk[t] === 1, crash: ["", "cymbal", "pole"][played.crash[t]], bone: "" }));
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
          if (trunk) continue;
          const crash = piece.every((o) => crashes[o]);
          if (dx === 0 && dy === 0 && !rung) found.alone.add(`${label(owners)}${crash ? " crash" : ""}`);
          if (phone && owners !== 1 << n && !(kit === 3 && crash)) found.apart.add(`${cam.name} at ${at}, ${dx},${dy}: ${label(owners)}${kit ? ` (${["", "cymbal", "pole", "cymbal and pole"][kit]})` : ""}`);
        }
      }
    }
    const atPlaces = (line: string) => places.some(([dx, dy]) => line.includes(`, ${dx},${dy},`) || line.includes(`, ${dx},${dy}:`));
    // As built, the six come apart in every one of these ways.
    expect([found.specks.length > 0, found.counts.some((line) => !line.endsWith(": 0")), found.apart.size > 0]).toEqual([true, true, true]);
    expect(film.specks.filter(atPlaces).sort()).toEqual(found.specks.sort());
    expect(got.counts).toEqual(found.counts);
    // The film tells of a piece with no trunk in the frame it comes, or changes, in; drawn whole, in every frame it stands.
    const apart = [...film.apart].filter(atPlaces), timeless = (line: string) => line.replace(/ at [\d.]+ s,/, ",");
    expect(apart.filter((line) => !found.apart.has(line))).toEqual([]);
    expect([...new Set([...found.apart].map(timeless))].sort()).toEqual([...new Set(apart.map(timeless))].sort());
    expect([...film.alone].sort()).toEqual([...found.alone].sort());
  }, 60_000);
});

outlineChecks("the six of 1979–90 and 1992–95", "1986-07-04", { touch: ["rung 3: 2 and 3"], apart: ["3 crash"] });
