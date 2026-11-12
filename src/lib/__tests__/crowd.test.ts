import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildCrowd, partingOptions } from "../../../public/world/crowd.js";
import { FACING, STAGE, STAGE_COLUMN } from "../../../public/world/ground.js";
import { buildPath, buildWalkLine } from "../../../public/world/path.js";
import { PERSON } from "../../../public/world/seats.js";

// buildCrowd builds the crowd here from the world's own modules and three, on the world's path and the bears' line 7 m to its left as
// main.js lays them, with no landmarks, at every seat on the hill. seats.js runs as it is, and a pass-through mock keeps what buildCrowd
// hands parting().

const kept = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));

vi.mock("../../../public/world/seats.js", async (original) => {
  const seats = await original<{ parting: (placed: unknown[], options: Record<string, unknown>) => unknown }>();
  return {
    ...seats,
    parting: (placed: unknown[], options: Record<string, unknown>) => {
      kept.options.push(options);
      return seats.parting(placed, options);
    },
  };
});

const path = buildPath();
const crowd = buildCrowd(new THREE.Scene(), { count: Infinity, path, line: buildWalkLine(path, 7), landmarks: [] });

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
    // Across the front rows, 15 m from the stage's centre at the nearest, at 12 m/s, the walker held as main.js holds it. No figure's
    // hands reach farther than `wide` from its axis (partingOptions, for figures its size), so each figure, at its seat or stepped aside,
    // stands that far past the stage's solids (STAGE_COLUMN) from the stage's centre.
    const clear = STAGE_COLUMN.r + own.wide, offset: Float32Array = crowd.mesh.geometry.getAttribute("aPart").array;
    const ux = Math.sin(FACING), uz = Math.cos(FACING), nx = uz, nz = -ux;
    const walker = { x: STAGE[0] + 15 * ux - 20 * nx, z: STAGE[1] + 15 * uz - 20 * nz, heading: Math.atan2(-nx, -nz) };
    const visitor = () => {
      const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading);
      return { feet: { x: walker.x, z: walker.z }, head: { x: walker.x + 0.8 * fx, z: walker.z + 0.8 * fz } };
    };
    crowd.part(0, visitor().feet, visitor().head, false);
    let moved = 0, nearest = Infinity;
    for (let f = 0; f < 200; f++) {
      walker.x -= Math.sin(walker.heading) * 0.2;
      walker.z -= Math.cos(walker.heading) * 0.2;
      crowd.hold(walker);
      const v = visitor();
      crowd.part(1 / 60, v.feet, v.head, false);
      for (let i = 0; i < crowd.count; i++) {
        if (offset[4 * i] !== 0 || offset[4 * i + 2] !== 0) moved += 1;
        nearest = Math.min(nearest, Math.hypot(seats[i][0] + offset[4 * i] - STAGE[0], seats[i][1] + offset[4 * i + 2] - STAGE[1]));
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(nearest).toBeGreaterThanOrEqual(clear - 1e-3);
  });
});
