import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FIRST_EYE, height } from "../../../public/world/ground.js";
import { budgetFor } from "../../../public/world/quality.js";
import { CAMERAS, FLASH_CAMERAS, outlineChecks, POSES } from "./band-outline";

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

outlineChecks("the six of 1979–90 and 1992–95", "1986-07-04", { touch: ["rung 3: 2 and 3"], apart: ["3 crash"] });
