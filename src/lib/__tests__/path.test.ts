import { describe, expect, it } from "vitest";
import { buildPath, layout } from "../../../public/world/path.js";

const { pointU } = buildPath();
// A show of twelve five-minute tracks: the titles given by index, and "Song i" at every other index.
const show = (titles: Record<number, string>) => Array.from({ length: 12 }, (_, i) => ({ title: titles[i] ?? `Song ${i}`, duration: 300 }));
// Where track i stands between pins (ia, ua) and (ib, ub): tracks as long as each other stand evenly spaced.
const between = (i: number, [ia, ua]: number[], [ib, ub]: number[]) => ua + ((i - ia) / (ib - ia)) * (ub - ua);

describe("layout", () => {
  it("pins Drums to the left cave, loop point 13, and Space to the right one, point 14", () => {
    const u = layout(show({ 5: "Drums", 9: "Space" }), null, { pointU });
    expect(u[5]).toBe(pointU(13));
    expect(u[9]).toBe(pointU(14));
  });

  it("pins set 2's opener to the summit, point 6, before the Drums pin", () => {
    const u = layout(show({ 5: "Drums", 9: "Space" }), 3, { pointU });
    expect([u[3], u[5], u[9]]).toEqual([pointU(6), pointU(13), pointU(14)]);
  });

  it("pins nothing to the left cave in a show with no Drums: the songs from set 2's opener to Space stand evenly between their pins", () => {
    const u = layout(show({ 9: "Space" }), 3, { pointU });
    expect(u).toHaveLength(13);
    for (let i = 3; i <= 9; i++) expect(u[i], `track ${i}`).toBeCloseTo(between(i, [3, pointU(6)], [9, pointU(14)]), 12);
  });

  it("leaves out a pin out of order, here Space before Drums: Drums keeps its pin, and Space stands between the pins round it", () => {
    const u = layout(show({ 5: "Space", 9: "Drums" }), null, { pointU });
    expect(u).toHaveLength(13);
    expect(u[9]).toBe(pointU(13));
    expect(u[5]).toBeCloseTo(between(5, [0, 0], [9, pointU(13)]), 12);
  });
});
