import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildCrowd, partingOptions } from "../../../public/world/crowd.js";
import { FACING, height, STAGE, STAGE_COLUMN } from "../../../public/world/ground.js";
import { buildPath, buildWalkLine } from "../../../public/world/path.js";
import { keepOuts, PERSON } from "../../../public/world/seats.js";

// buildCrowd builds the crowd here from the world's own modules and three, on the world's path and the bears' line 7 m to its left as
// main.js lays them, with two landmarks of the test's own in the front rows, at every seat on the hill. seats.js runs as it is, and
// pass-through mocks keep what buildCrowd hands seats() and parting().

type Around = { path: number[][]; line: number[][]; landmarks: number[][] };
const kept = vi.hoisted(() => ({ around: [] as Around[], options: [] as Record<string, unknown>[] }));

vi.mock("../../../public/world/seats.js", async (original) => {
  const seats = await original<{
    seats: (around: Around) => unknown;
    parting: (placed: unknown[], options: Record<string, unknown>) => unknown;
  }>();
  return {
    ...seats,
    seats: (around: Around) => {
      kept.around.push(around);
      return seats.seats(around);
    },
    parting: (placed: unknown[], options: Record<string, unknown>) => {
      kept.options.push(options);
      return seats.parting(placed, options);
    },
  };
});

// Out from the stage's centre along its axis, and across it.
const ux = Math.sin(FACING), uz = Math.cos(FACING), nx = uz, nz = -ux;

// The landmarks: 6 m cubes standing on the hill 24 m out from the stage's centre, 7 m to either side of its axis.
const SIDE = 6, landmarkAt = [-7, 7].map((b) => [STAGE[0] + 24 * ux + b * nx, STAGE[1] + 24 * uz + b * nz]);
const landmarks = landmarkAt.map(([x, z]) => {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(SIDE, SIDE, SIDE));
  cube.position.set(x, height(x, z) + SIDE / 2, z);
  return cube;
});

const path = buildPath();
const crowd = buildCrowd(new THREE.Scene(), { count: Infinity, path, line: buildWalkLine(path, 7), landmarks });

// Each figure's seat and scale, as its matrix places and scales it, and the figure's own height. buildCrowd stands its figures PERSON
// tall, some a little shorter and some a little taller: at the scale halfway between the shortest's and the tallest's.
const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), size = new THREE.Vector3();
const seats: [number, number][] = [], scales: number[] = [];
for (let i = 0; i < crowd.count; i++) {
  crowd.mesh.getMatrixAt(i, matrix);
  at.setFromMatrixPosition(matrix);
  seats.push([at.x, at.z]);
  scales.push(size.setFromMatrixScale(matrix).y);
}
const scale = (Math.min(...scales) + Math.max(...scales)) / 2;
const figure = new THREE.Box3().setFromBufferAttribute(crowd.mesh.geometry.getAttribute("position"));
const own: Record<string, number> = partingOptions(scale);
// Where the parting has stepped each figure from its seat, [dx, dy, dz, stillness] each.
const offset: Float32Array = crowd.mesh.geometry.getAttribute("aPart").array;

// Walks the visitor `frames` frames from `[x, z]` along `[wx, wz]`, a unit vector, at 12 m/s: 0.2 m a frame of 1/60 s, held as main.js
// holds the walker (the crowd's hold before the step, its part after it), their bear's head 0.8 m ahead of its feet (avatar.js). After
// each frame, `each(i)` for each figure.
function walk([x, z]: number[], [wx, wz]: number[], frames: number, each: (i: number) => void) {
  const walker = { x, z, heading: Math.atan2(-wx, -wz) };
  const visitor = () => {
    const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading);
    return { feet: { x: walker.x, z: walker.z }, head: { x: walker.x + 0.8 * fx, z: walker.z + 0.8 * fz } };
  };
  crowd.part(0, visitor().feet, visitor().head, false);
  for (let f = 0; f < frames; f++) {
    walker.x -= Math.sin(walker.heading) * 0.2;
    walker.z -= Math.cos(walker.heading) * 0.2;
    crowd.hold(walker);
    const v = visitor();
    crowd.part(1 / 60, v.feet, v.head, false);
    for (let i = 0; i < crowd.count; i++) each(i);
  }
}

describe("the crowd, as buildCrowd builds it", () => {
  it("parts its figures with the options for their own size, PERSON tall as it stands them", () => {
    expect((figure.max.y - figure.min.y) * scale).toBeCloseTo(PERSON, 4);
    expect(kept.options).toHaveLength(1);
    const options = kept.options[0];
    expect(Object.keys(options).sort()).toEqual([...Object.keys(own), "keeps"].sort());
    const off = Object.keys(own).filter((name) => !(Math.abs((options[name] as number) - own[name]) < 1e-5));
    expect(off.map((name) => `${name}: ${options[name]}, for ${own[name]}`)).toEqual([]);
  });

  it("keeps its figures' hands clear of the stage's solids as they make room for a walk across the front rows", () => {
    // Across the front rows, 15 m from the stage's centre at the nearest. No figure's hands reach farther than `wide` from its axis
    // (partingOptions, for figures its size), so each figure, at its seat or stepped aside, stands that far past the stage's solids
    // (STAGE_COLUMN) from the stage's centre.
    const clear = STAGE_COLUMN.r + own.wide;
    let moved = 0, nearest = Infinity;
    walk([STAGE[0] + 15 * ux - 20 * nx, STAGE[1] + 15 * uz - 20 * nz], [nx, nz], 200, (i) => {
      if (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0) moved += 1;
      nearest = Math.min(nearest, Math.hypot(seats[i][0] + offset[4 * i] - STAGE[0], seats[i][1] + offset[4 * i + 2] - STAGE[1]));
    });
    expect(moved).toBeGreaterThan(0);
    expect(nearest).toBeGreaterThanOrEqual(clear - 1e-3);
  });

  it("keeps its figures clear of what their seats keep clear of as they make room: the path, the bears' line and each landmark's circle", () => {
    // What the seats keep clear of (keepOuts, each [x, z, distance]): the points of the path and of the bears' line that buildCrowd
    // hands seats(), and a circle round each landmark's bounds, which for a cube runs through its corners.
    const { path: onPath, line: onLine } = kept.around[0];
    const keeps = {
      path: keepOuts({ path: onPath, line: [], landmarks: [] }),
      line: keepOuts({ path: [], line: onLine, landmarks: [] }),
      landmarks: keepOuts({ path: [], line: [], landmarks: landmarkAt.map(([x, z]) => [x, z, Math.hypot(SIDE, SIDE) / 2]) }),
    };
    // How far past each the figures stand at the nearest, at their seats or stepped aside.
    const past: Record<string, number> = { path: Infinity, line: Infinity, landmarks: Infinity };
    let moved = 0;
    const check = (i: number) => {
      const x = seats[i][0] + offset[4 * i], z = seats[i][1] + offset[4 * i + 2];
      if (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0) moved += 1;
      for (const [name, list] of Object.entries(keeps))
        for (const [kx, kz, d] of list) past[name] = Math.min(past[name], Math.hypot(x - kx, z - kz) - d);
    };
    // Back across the front rows, 15 m from the stage's centre at the nearest, past the landmarks.
    walk([STAGE[0] + 15 * ux + 20 * nx, STAGE[1] + 15 * uz + 20 * nz], [-nx, -nz], 200, check);
    // Past the figure nearest the line's keep, 1 m from its seat on the side away from the line, square to the way from it to the line's
    // nearest kept point, with the line on the walker's left.
    let nearest = { gap: Infinity, i: 0, k: [0, 0, 0] };
    for (const k of keeps.line)
      seats.forEach(([x, z], i) => {
        const gap = Math.hypot(x - k[0], z - k[1]) - k[2];
        if (gap < nearest.gap) nearest = { gap, i, k };
      });
    const [sx, sz] = seats[nearest.i], to = Math.hypot(nearest.k[0] - sx, nearest.k[1] - sz);
    const dx = (nearest.k[0] - sx) / to, dz = (nearest.k[1] - sz) / to;
    walk([sx - dx + 20 * dz, sz - dz - 20 * dx], [-dz, dx], 200, check);
    expect(moved).toBeGreaterThan(0);
    const inside = Object.entries(past).filter(([, d]) => d < -1e-3);
    expect(inside.map(([name, d]) => `${name}: ${(-d).toFixed(3)} m inside`)).toEqual([]);
  });
});
