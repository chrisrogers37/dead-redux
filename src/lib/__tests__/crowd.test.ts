import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import * as THREE from "three";
import { buildCrowd, partingOptions } from "../../../public/world/crowd.js";
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

// Each figure's scale, as its matrix scales it, and the figure's own height. buildCrowd stands its figures PERSON tall, some a
// little shorter and some a little taller: at the scale halfway between the shortest's and the tallest's.
const matrix = new THREE.Matrix4(), size = new THREE.Vector3(), scales: number[] = [];
for (let i = 0; i < crowd.count; i++) {
  crowd.mesh.getMatrixAt(i, matrix);
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
});
