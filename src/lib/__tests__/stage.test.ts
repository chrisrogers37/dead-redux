import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import showCatalog from "../../../data/shows.json";
import pickSchedule from "../../../data/pick-schedule.json";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { FACING, SHELF_Y, STAGE, STAGE_COLUMN } from "../../../public/world/ground.js";
import { eraOn, LINEUPS, lineupOn } from "../../../public/world/lineup.js";
import { buildStage, STAGES, stageOn } from "../../../public/world/stage.js";
import { CAMERAS, FLASH_CAMERAS, STAGE_PANEL, stageFrom, stagesOf } from "./band-outline";

// public/world/stage.js builds the stage of the show's era (STAGES), as band.js stands the band of its line-up (lineup.js): the roof
// on its two posts, the back wall and the PA stacks, which every date stood on before the table, and in 1974 the Wall of Sound.

type Row = [string, string, string];
const rows = STAGES as Row[];
const catalog = showCatalog.map((show) => show.date);
const picks = [...Object.values(pickSchedule.openingPicks), ...pickSchedule.rotation, ...pickSchedule.skipped.map((s) => s.show)];

type Obj = { isMesh?: boolean; isInstancedMesh?: boolean; isLight?: boolean; visible: boolean; material?: { type: string; vertexColors?: boolean; emissive?: { getHex(): number } }; geometry?: Geo; matrixWorld: unknown; children: Obj[]; traverse(f: (o: Obj) => void): void };
type Geo = { getAttribute(name: string): { count: number; array: Float32Array; getX(i: number): number; getY(i: number): number; getZ(i: number): number }; parameters?: unknown };

// The stage as main.js builds it for a show on `date` (none: as for a show with no date), in a scene of its own.
function stageFor(date?: string) {
  const scene = new THREE.Scene();
  const built = buildStage(scene, null, false, new THREE.MeshBasicMaterial(), { uC0: { value: null }, uC1: { value: null } }, date);
  scene.updateMatrixWorld(true);
  const stills: Obj[] = [];
  built.group.traverse((o: Obj) => { if (o.isMesh && o.material?.vertexColors) stills.push(o); });
  return { built, scene, stills, still: stills[0] };
}
// The still mesh's geometry as a digest: each corner's place, normal and colour, to five places.
function digest(date?: string) {
  const hash = createHash("sha256");
  for (const m of stageFor(date).stills) for (const name of ["position", "normal", "color"]) hash.update(Array.from(m.geometry!.getAttribute(name).array, (v) => v.toFixed(5)).join(",") + ";");
  return hash.digest("hex");
}
// The still mesh's corners in the stage's own frame (+z toward the crowd, y over the shelf).
function corners(still: Obj) {
  const at = still.geometry!.getAttribute("position"), v = new THREE.Vector3(), out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < at.count; i++) {
    v.set(at.getX(i), at.getY(i), at.getZ(i)).applyMatrix4(still.matrixWorld);
    const dx = v.x - STAGE[0], dz = v.z - STAGE[1];
    out.push({ x: dx * Math.cos(FACING) - dz * Math.sin(FACING), y: v.y - SHELF_Y, z: dx * Math.sin(FACING) + dz * Math.cos(FACING) });
  }
  return out;
}

// main's still mesh at 8a30778, before the table: the roof's stage, whatever the date.
const MAIN = "5f33a5ee18e6c0285f63f0e45af9d885fbc1a145b73c79677a99a72eec7744c2";
// A day of the Wall: 1974-07-19, Selland Arena, Fresno, the show of the shoot's 1974 day (.github/screenshots/stage.mjs).
const WALL_DAY = "1974-07-19";

describe("the stage, by the show's date", () => {
  it("is the table, row by row: the roof's stage to the Wall's debut, the Wall of Sound to its last show, and the roof's stage after", () => {
    expect(rows).toEqual([
      ["1965-06-01", "1974-03-22", "roof"],
      ["1974-03-23", "1974-10-20", "wall"],
      ["1974-10-21", "1995-07-09", "roof"],
    ]);
  });

  it("runs from the line-up table's first day to the band's last show, each row starting the day after the one before it ends", () => {
    const next = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect([rows[0][0], rows.at(-1)![1]]).toEqual([LINEUPS[0][0], LINEUPS.at(-1)![1]]);
    for (let k = 1; k < rows.length; k++) expect([rows[k][0], rows[k][0] <= rows[k][1]]).toEqual([next(rows[k - 1][1]), true]);
  });

  it("reads a date as the line-up does, by one rule (lineup.js eraOn): every date of the catalog and the schedule takes the last row that starts on or before it, a date before them all the first, and one of unknown day its first day", () => {
    const rule = (table: unknown[][], date: string) => {
      const day = date.replace(/^(\d{4})-XX/, "$1-01").replace(/^(\d{4}-\d{2})-XX/, "$1-01");
      return [...table].reverse().find((row) => String(row[0]) <= day) ?? table[0];
    };
    for (const date of [...new Set([...catalog, ...picks]), "1950-01-01", "2026-11-26", "1974-XX-XX", "1974-03-XX"]) {
      expect([date, stageOn(date)]).toEqual([date, { from: rule(rows, date)[0], to: rule(rows, date)[1], stage: rule(rows, date)[2] }]);
      expect([date, eraOn(LINEUPS, date)]).toEqual([date, rule(LINEUPS, date)]);
      expect([date, lineupOn(date).roles]).toEqual([date, eraOn(LINEUPS, date)[2]]);
    }
  });

  it("stands the Wall of Sound on the catalog's shows from its debut to its last, the 37 from the Cow Palace on 1974-03-23 to Winterland on 1974-10-20, and the roof's stage on every other", () => {
    const wall = catalog.filter((date) => stageOn(date).stage === "wall").sort();
    expect([wall.length, wall[0], wall.at(-1)]).toEqual([37, "1974-03-23", "1974-10-20"]);
    const venue = (date: string) => showCatalog.find((show) => show.date === date)!.venue;
    expect([venue("1974-03-23"), venue("1974-10-20")]).toEqual(["Cow Palace", "Winterland Arena"]);
    expect(catalog.filter((date) => stageOn(date).stage !== "wall").every((date) => stageOn(date).stage === "roof")).toBe(true);
    // The catalog's dates either side: the Mars Hotel outtakes and the last show before, and a studio date after.
    const sorted = [...catalog].sort(), first = sorted.indexOf("1974-03-23"), last = sorted.indexOf("1974-10-20");
    expect([sorted[first - 1], sorted[first - 2], sorted[last + 1]]).toEqual(["1974-03-01", "1974-02-24", "1974-12-01"]);
    expect([venue("1974-03-01"), venue("1974-12-01")]).toEqual(["Mars Hotel Outtakes", "Studio"]);
  });

  // Nothing else moved: main's stage, corner for corner, on a date of each line-up's era but 1974's, either side of the Wall, and with
  // no date.
  it("builds every other date's stage as main built it: the still mesh's places, normals and colours, on a show of 1969, 1972, 1977, 1986 and 1993, the last before the Wall and the first after it, and with no date", () => {
    for (const date of [undefined, "1969-04-17", "1972-05-03", "1977-05-08", "1986-07-04", "1993-03-24", "1974-02-24", "1974-12-01"]) {
      expect([date, digest(date)]).toEqual([date, MAIN]);
    }
    // The line-ups of those dates are five of the table's, so each other era's band stands on main's stage.
    const eras = ["1969-04-17", "1972-05-03", "1977-05-08", "1986-07-04", "1993-03-24"].map((date) => lineupOn(date).from);
    expect(new Set(eras).size).toBe(5);
    for (const date of ["1974-03-23", WALL_DAY, "1974-10-20"]) expect([date, digest(date) === MAIN]).toEqual([date, false]);
  });

  it("stands the band of the show's line-up on the Wall: the six of 1972 to 1974 on its shows to 1974-10-19, and the seven of 1974 to 1979 on its last; and each of those line-ups stood on the roof's stage too (band-outline.ts stagesOf)", () => {
    const roles = (date: string) => stageFor(date).built.band.players.map((p: { role: string }) => p.role).sort();
    expect(roles(WALL_DAY)).toEqual([...(lineupOn("1974-10-19").roles as string[])].sort());
    expect(roles("1974-10-20")).toEqual([...(lineupOn("1977-05-08").roles as string[])].sort());
    expect(stagesOf(lineupOn(WALL_DAY).roles as string[])).toEqual([
      { stage: "roof", day: "1972-06-18", from: "1965-06-01", to: "1974-03-22" },
      { stage: "wall", day: "1974-03-23", from: "1974-03-23", to: "1974-10-20" },
    ]);
    expect(stagesOf(lineupOn("1977-05-08").roles as string[])).toEqual([
      { stage: "wall", day: "1974-10-20", from: "1974-03-23", to: "1974-10-20" },
      { stage: "roof", day: "1974-10-21", from: "1974-10-21", to: "1995-07-09" },
    ]);
    expect(stagesOf(lineupOn("1986-07-04").roles as string[]).map((s) => s.stage)).toEqual(["roof"]);
  });
});

describe("the Wall of Sound", () => {
  it("stands inside the stage's column, which the walk, the camera and the crowd keep out of (ground.js STAGE_COLUMN): its furthest corner 10.85 m from the stage's centre, under the 10.95 the PA stacks' 10.91 took, and its top the roof's", () => {
    const at = corners(stageFor(WALL_DAY).still);
    const far = Math.max(...at.map((p) => Math.hypot(p.x, p.z))), top = Math.max(...at.map((p) => p.y));
    expect([far < STAGE_COLUMN.r, Math.round(far * 100) / 100]).toEqual([true, 10.85]);
    // The geometry is in 32-bit floats.
    expect([top <= STAGE_COLUMN.top - SHELF_Y + 1e-6, top]).toEqual([true, expect.closeTo(STAGE_COLUMN.top - SHELF_Y, 5)]);
    // The roof's stage, as main has it: the stacks' outer corners and the roof's top.
    const roof = corners(stageFor().still);
    expect([Math.round(Math.max(...roof.map((p) => Math.hypot(p.x, p.z))) * 100) / 100, Math.max(...roof.map((p) => p.y))]).toEqual([10.91, expect.closeTo(STAGE_COLUMN.top - SHELF_Y, 5)]);
  });

  it("stands behind the band, with no PA stack at either side and no roof behind the rig's bridge: nothing under the roof's height outside the platform's foot stands forward of 2.5 m behind its middle, and nothing over the band but the bridge, the roof's front 2.5 m", () => {
    const at = corners(stageFor(WALL_DAY).still);
    // The platform's foot is 9.5 m out (stage.js), its corners there to the float's last place. Over it at the roof's height, 7.95 m up
    // and more, the bridge's ends reach out as the roof's corners do.
    expect(at.filter((p) => Math.hypot(p.x, p.z) > 9.5 + 1e-6 && p.z > -2.5 && p.y < 7.9)).toEqual([]);
    // Over the band, where the roof stood, the sky: looking straight down on the floor between the bridge and the wall, the first thing
    // met is the floor, where on the roof's stage it is the roof; over the bridge's 2.5 m, it is the bridge's top, the roof's height.
    const down = (date: string | undefined, x: number, z: number) => {
      const { built, still } = stageFor(date), ray = new THREE.Raycaster();
      ray.set(new THREE.Vector3(x, 30, z).applyMatrix4(built.group.matrixWorld), new THREE.Vector3(0, -1, 0));
      return 30 - ray.intersectObject(still)[0].distance;
    };
    for (let x = -7; x <= 7; x += 1) for (let z = -3.5; z <= 3.5; z += 1) {
      expect([x, z, down(WALL_DAY, x, z)]).toEqual([x, z, expect.closeTo(z < 2 ? 1.2 : 8.45, 5)]);
      expect([x, z, down(undefined, x, z)]).toEqual([x, z, expect.closeTo(8.45, 5)]);
    }
    // The roof's stage has its stacks, as main has.
    const roof = corners(stageFor().still);
    expect(roof.filter((p) => Math.hypot(p.x, p.z) > 9.5 + 1e-6 && p.z > -2.5 && p.y < 7.9).length).toBeGreaterThan(0);
  });

  it("hangs every lamp of the rig under the roof's front edge, as the roof's stage does: straight over each, within 0.1 m, is the underside of the still mesh", () => {
    for (const date of [undefined, WALL_DAY]) {
      const { built, still } = stageFor(date), rig = built.rig.mesh, m = new THREE.Matrix4(), ray = new THREE.Raycaster();
      const lamps = Array.from({ length: rig.count }, (_, k) => { rig.getMatrixAt(k, m); return new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(built.group.matrixWorld); });
      expect(lamps).toHaveLength(8);
      for (const lamp of lamps) {
        ray.set(lamp, new THREE.Vector3(0, 1, 0));
        const hit = ray.intersectObject(still)[0];
        expect([date, hit !== undefined && hit.distance < 0.1]).toEqual([date, true]);
      }
    }
  });

  // The panel's light show and the band's outlines against it are what the flash bar and the outlines' gates were measured on: the Wall
  // stands round the panel, and no part of it in front of what the roof's stage shows of it.
  it("shows exactly the light panel that the roof's stage shows, from every camera of the shoot: the rig's bridge, the roof's front, hides the panel's top from the hill as the roof does, so no strip of it shows over the bridge, and no corner of it past the bridge's end", () => {
    for (const cam of [...CAMERAS, ...FLASH_CAMERAS]) {
      const roof = stageFrom(cam).shows, wall = stageFrom(cam, WALL_DAY).shows;
      let hidden = 0, roofs = 0, more = 0;
      for (let o = 0; o < roof.length; o++) {
        if (roof[o] === STAGE_PANEL) roofs++;
        if (roof[o] === STAGE_PANEL && wall[o] !== STAGE_PANEL) hidden++;
        if (wall[o] === STAGE_PANEL && roof[o] !== STAGE_PANEL) more++;
      }
      // Over a beam half a metre deep, 13 to 30 % more showed from the hill, as a strip along the panel's top; over a bridge 16.6 m wide,
      // a column of 6 pixels by the right tower from among the people, where the panel's top corner showed past the bridge's end.
      expect([cam.name, roofs > 0, hidden, more]).toEqual([cam.name, true, 0, 0]);
    }
  }, 60_000);

  // The Wall reads as the Wall by its skyline, stepped up to the middle, and by cabinets that can be counted: seams a shade lighter
  // between them and speakers a shade darker on their faces. Read here by rays toward the Wall, as the crowd faces it.
  it("stacks cabinets that can be counted, stepped up to a cluster in the middle: up each column's front a ray meets each cabinet's dark middle, framed by the seam's shade, and then the sky, and on each cabinet two speakers in the speaker's shade", () => {
    const { built, still } = stageFor(WALL_DAY), colour = still.geometry!.getAttribute("color"), ray = new THREE.Raycaster();
    const key = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toFixed(5)).join(" ");
    const shade: Record<string, string> = {};
    for (const [name, hex] of [["dark", 0x1a1816], ["seam", 0x2e2a26], ["speaker", 0x0b0a09]] as const) { const c = new THREE.Color(hex); shade[key(c.r, c.g, c.b)] = name; }
    // What a ray from `back` m in front of the point (x, y, z) of the stage's frame, toward it along (dx, dz), meets first within
    // 0.1 m past it: from a centimetre out, a cabinet's face; from further, a speaker. A triangle is read by its first corner's colour:
    // the face's frame by its edge, the seam's shade, and its middle by the dark.
    const meets = (x: number, y: number, z: number, dx: number, dz: number, back = 0.01) => {
      const from = new THREE.Vector3(x + back * dx, y, z + back * dz).applyMatrix4(built.group.matrixWorld);
      ray.set(from, new THREE.Vector3(-dx, 0, -dz).transformDirection(built.group.matrixWorld));
      ray.far = back + 0.1;
      const hit = ray.intersectObject(still)[0] as unknown as { face: { a: number } } | undefined;
      return hit ? shade[key(colour.getX(hit.face.a), colour.getY(hit.face.a), colour.getZ(hit.face.a))] ?? "other" : "sky";
    };
    // Up a column's front from y0, 1 cm a step: the runs of what the rays meet, as [what, from, to].
    const runs = (x: number, z: number, dx: number, dz: number, y0: number) => {
      const out: [string, number, number][] = [];
      for (let y = y0 + 0.005; y < 9.5; y += 0.01) {
        const what = meets(x, y, z, dx, dz);
        if (out.at(-1)?.[0] === what) out.at(-1)![2] = y; else out.push([what, y, y]);
      }
      return out;
    };
    // A column read: its cabinets, each a run of the dark framed by the seam's shade, one run of it between each two, then the sky; and
    // its top.
    const read = (r: [string, number, number][]) => {
      expect(r.at(-1)![0]).toBe("sky");
      const body = r.slice(0, -1);
      body.forEach(([what], k) => expect(what).toBe(k % 2 === 0 ? "seam" : "dark"));
      expect(body.length % 2).toBe(1);
      return { cabinets: (body.length - 1) / 2, top: Math.round(body.at(-1)![2] * 100) / 100 };
    };
    // Above the panel: the twenty columns, 0.805 m apart, their fronts 4.1 m behind the stage's middle (stage.js TOP_ROWS and the rest),
    // read up their middles from just over the panel's top.
    const top = Array.from({ length: 20 }, (_, c) => read(runs(0.805 * (c - 9.5), -4.1 - 0.001, 0, 1, 6.25)));
    expect(top.map((t) => t.cabinets)).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2]);
    // The skyline steps up from each side to the middle, by four heights, and the middle reaches the stage column's top.
    const tops = top.map((t) => t.top);
    expect([...new Set(tops)].length).toBe(4);
    expect(tops).toEqual([...tops].reverse());
    for (let c = 1; c < 10; c++) expect(tops[c]).toBeGreaterThanOrEqual(tops[c - 1]);
    expect(Math.max(...tops)).toBeCloseTo(STAGE_COLUMN.top - SHELF_Y, 1);
    // On each cabinet's front, a quarter of its width either side of its middle and at its half height, a speaker.
    top.forEach((t, c) => { for (let k = 0; k < t.cabinets; k++) for (const i of [-1, 1]) expect([c, k, i, meets(0.805 * (c - 9.5) + (i * 0.805) / 4, 6.25 + 0.44 * (k + 0.5), -4.1, 0, 1, 0.5)]).toEqual([c, k, i, "speaker"]); });
    // At each end, the bass's two columns, 1.1 m wide, from the panel's edge 8.05 m out, turned 0.61 rad toward the crowd: the inner as
    // high as the top's outer columns and the outer a cabinet lower, so the skyline steps down at the ends too.
    for (const side of [-1, 1]) {
      const turn = -side * 0.61, dx = Math.sin(turn), dz = Math.cos(turn);
      const ends = [0, 1].map((c) => {
        const along = side * 1.1 * (c + 0.5);
        return read(runs(side * 8.05 + along * Math.cos(turn), -4.1 - along * Math.sin(turn), dx, dz, 0));
      });
      expect([side, ends.map((e) => e.cabinets)]).toEqual([side, [9, 8]]);
      expect([ends[0].top, ends[1].top < ends[0].top - 0.5]).toEqual([expect.closeTo(tops[0], 1), true]);
    }
  }, 60_000);

  // Nothing lit is new on the Wall: what is lit is the roof's stage's own, and the Wall is the stage's dark. What it changes is what
  // the lit parts are seen against, and the stage light no longer falls on a roof's underside; so its light was counted by render
  // (scripts/flash) against the roof's stage with the same band: in Drums its worst blocks read as the roof's, at the same place and frames.
  it("changes nothing lit: the panel, the stage light and the rig are the roof's stage's, and the Wall's still parts are the stage's own dark, wood and stone and two shades of the dark, the seams' a shade lighter and the speakers' a shade darker, all of them black to the outline gates, in the one still mesh, which glows nowhere", () => {
    // The roof's stage on the last show before the Wall, whose line-up is the Wall's day's.
    const roof = stageFor("1974-02-24"), wall = stageFor(WALL_DAY);
    expect(lineupOn("1974-02-24").roles).toEqual(lineupOn(WALL_DAY).roles);
    for (const key of ["position", "rotation", "scale"] as const) {
      expect(wall.built.panel[key].toArray()).toEqual(roof.built.panel[key].toArray());
      expect(wall.built.light[key].toArray()).toEqual(roof.built.light[key].toArray());
      expect(wall.built.rig.mesh[key].toArray()).toEqual(roof.built.rig.mesh[key].toArray());
    }
    expect(wall.built.panel.geometry.parameters).toEqual(roof.built.panel.geometry.parameters);
    expect([wall.built.light.color.getHex(), wall.built.light.intensity, wall.built.light.distance, wall.built.light.decay]).toEqual([roof.built.light.color.getHex(), roof.built.light.intensity, roof.built.light.distance, roof.built.light.decay]);
    expect(Array.from(wall.built.rig.mesh.instanceMatrix.array)).toEqual(Array.from(roof.built.rig.mesh.instanceMatrix.array));
    expect([wall.built.rig.mesh.material.vertexShader, wall.built.rig.mesh.material.fragmentShader]).toEqual([roof.built.rig.mesh.material.vertexShader, roof.built.rig.mesh.material.fragmentShader]);
    // One still mesh each, Lambert and glowing nowhere, in the colours of the roof's stage's own still parts and two more: the seams
    // between cabinets a shade lighter than the stage's dark and the speakers a shade darker, each with no channel at 0.05 or over, so
    // that the outline gates draw them as the stage's black (band-outline.ts), as they draw the dark.
    const colours = (still: Obj) => {
      const c = still.geometry!.getAttribute("color"), out = new Set<string>();
      for (let i = 0; i < c.count; i++) out.add([c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(5)).join(" "));
      return out;
    };
    expect([wall.stills.length, roof.stills.length]).toEqual([1, 1]);
    expect([wall.still.material!.type, wall.still.material!.emissive!.getHex()]).toEqual(["MeshLambertMaterial", 0]);
    const key = (c: THREE.Color) => [c.r, c.g, c.b].map((v) => v.toFixed(5)).join(" ");
    const [dark, seam, speaker] = [0x1a1816, 0x2e2a26, 0x0b0a09].map((hex) => new THREE.Color(hex));
    const roofs = colours(roof.still);
    expect(roofs.has(key(dark))).toBe(true);
    expect([...colours(wall.still)].filter((c) => !roofs.has(c)).sort()).toEqual([key(seam), key(speaker)].sort());
    expect([Math.max(seam.r, seam.g, seam.b) < 0.05, seam.r > dark.r, speaker.r < dark.r]).toEqual([true, true, true]);
    // And nothing else of the stage's group is new: the same meshes and lights, by kind and material, in the same order.
    const kinds = (built: { group: Obj }) => {
      const out: string[] = [];
      built.group.traverse((o: Obj) => { if (o.isMesh || o.isLight) out.push(`${o.isInstancedMesh ? "instanced " : ""}${o.isLight ? "light" : o.material!.type}`); });
      return out;
    };
    expect(kinds(wall.built)).toEqual(kinds(roof.built));
  });

  // The stage's draw calls are those of the roof's stage (the still mesh is one, merged by landmarks.js mergeStill): what it adds is
  // triangles, on every tier alike, the stage being built the same on each.
  it("costs no draw call, and 2,864 triangles more than the roof's stage: the still mesh is one, of 3,000 triangles to the roof's 136, of which 1,600 are the speakers' discs and 1,000 the cabinets' faces, of 100 cabinets", () => {
    const triangles = (date?: string) => stageFor(date).still.geometry!.getAttribute("position").count / 3;
    expect([triangles(), triangles(WALL_DAY)]).toEqual([136, 3000]);
  });
});
