import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- three ships no types
import { Group, PerspectiveCamera, Vector3 } from "three";
import { BAND_AT, BAND_BACK_PHONE, BAND_POSE, BAND_POSE_PHONE, bandPath, bandPose } from "../../.github/screenshots/band.mjs";
import { FIXED_DAY, FIXED_TITLES } from "../../.github/screenshots/near.mjs";
import { buildBand } from "../../public/world/band.js";
import { BOUND, FACING, FIRST_EYE, height, SHELF_Y, STAGE, STAGE_REACH } from "../../public/world/ground.js";
import { budgetFor } from "../../public/world/quality.js";
import { onCrowdGround } from "../../public/world/seats.js";
import { FLOOR, PANEL } from "../../public/world/stage.js";

// The band's still (.github/screenshots/band.mjs) is taken from a pose given as four plain numbers. Here the stage stands where
// stage.js builds it, with the band band.js builds on it, and the view is the walk's own in first person (main.js placeWalker): from
// the pose, FIRST_EYE over the ground, along the heading, tilted by the pitch. A stage, a line-up or a pose that moved would leave the
// still showing something else, with nothing in the shoot to say so.

type Vec = { x: number; y: number; z: number };

// The stage's group as stage.js places it, and the band on its floor.
const stage = new Group();
stage.position.set(STAGE[0], SHELF_Y, STAGE[1]);
stage.rotation.y = FACING;
const band = buildBand(stage, FLOOR);
stage.updateMatrixWorld(true);

// The visitor's eye at a pose, and the way they look, which is the same from both: the phone's pose is the desktop's, further back.
type Pose = { x: number; z: number; heading: number; pitch: number };
const eyeAt = (pose: Pose) => new Vector3(pose.x, height(pose.x, pose.z) + FIRST_EYE, pose.z);
const forward = { x: -Math.sin(BAND_POSE.heading), z: -Math.cos(BAND_POSE.heading) };
// Out from the stage's centre along its axis, toward the hill, and across it.
const out = { x: Math.sin(FACING), z: Math.cos(FACING) };
const alongOf = (pose: Pose) => (pose.x - STAGE[0]) * out.x + (pose.z - STAGE[1]) * out.z;
const acrossOf = (pose: Pose) => (pose.x - STAGE[0]) * out.z - (pose.z - STAGE[1]) * out.x;
const POSES: [string, Pose][] = [["desktop", BAND_POSE], ["phone", BAND_POSE_PHONE]];

// Each player's body as it stands in the world, corner by corner (its trunk, head and instrument, and the arm that holds it), and where
// they stand on the floor.
type Body = { geometry: { getAttribute(name: string): { count: number } }; matrixWorld: unknown };
const bodies = band.players.map((p: { plays: string; body: Body; g: { position: Vec } }) => {
  const corner = p.body.geometry.getAttribute("position"), corners: Vec[] = [];
  for (let i = 0; i < corner.count; i++) corners.push(new Vector3().fromBufferAttribute(corner, i).applyMatrix4(p.body.matrixWorld));
  return { plays: p.plays, corners, feet: stage.localToWorld(new Vector3(p.g.position.x, p.g.position.y, p.g.position.z)) as Vec };
});
// Everything else of the band that stands still, corner by corner: the kits, the keyboards, the microphones, the monitors.
const things: Vec[] = [];
{
  const corner = band.still.geometry.getAttribute("position");
  for (let i = 0; i < corner.count; i++) things.push(new Vector3().fromBufferAttribute(corner, i).applyMatrix4(band.still.matrixWorld));
}

// A device's view from the pose: three's own camera, with the tier's field of view (quality.js) and the device's frame (shoot.mjs).
const DEVICES = { desktop: { tier: "desktop", width: 1440, height: 900, pose: bandPose("desktop") }, phone: { tier: "phone", width: 390, height: 844, pose: bandPose("phone") } };
function view({ tier, width, height: tall, pose }: { tier: string; width: number; height: number; pose: Pose }) {
  const camera = new PerspectiveCamera(budgetFor(tier).fov, width / tall, 0.5, 900), eye = eyeAt(pose);
  camera.position.copy(eye);
  const level = Math.cos(pose.pitch);
  camera.lookAt(eye.x + forward.x * level, eye.y + Math.sin(pose.pitch), eye.z + forward.z * level);
  camera.updateMatrixWorld(true);
  // A point of the world in the frame: x and y from -1 to 1 across it and up it, and whether it lies ahead.
  return (at: Vec) => {
    const seen = new Vector3(at.x, at.y, at.z).project(camera);
    return { x: seen.x, y: seen.y, ahead: seen.z < 1 };
  };
}

beforeAll(() => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the band's still", () => {
  it("is taken from a pose main.js takes, on the fixed day, with the map driving the world, in Fire On The Mountain; a phone's from 4 m further back along the same line", () => {
    for (const [device, pose] of POSES) {
      const url = new URL(bandPath(device), "https://example.test");
      expect(url.pathname).toBe(`/${FIXED_DAY}`);
      // main.js's own pattern for ?pose=X,Z,HEADING,PITCH, and its limit on the pitch.
      const four = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(url.searchParams.get("pose") ?? "");
      expect(four?.slice(1).map(Number)).toEqual([pose.x, pose.z, pose.heading, pose.pitch]);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(0.8);
      expect([url.searchParams.get("drive"), url.searchParams.get("at"), url.searchParams.get("t")]).toEqual(["map", String(BAND_AT.index), String(BAND_AT.seconds)]);
    }
    expect(FIXED_TITLES[BAND_AT.index]).toBe("Fire On The Mountain ->");
    expect([bandPose("phone"), bandPose("phone-360"), bandPose("desktop")]).toEqual([BAND_POSE_PHONE, BAND_POSE_PHONE, BAND_POSE]);
    expect([BAND_POSE_PHONE.heading, BAND_POSE_PHONE.pitch]).toEqual([BAND_POSE.heading, BAND_POSE.pitch]);
    expect(alongOf(BAND_POSE_PHONE) - alongOf(BAND_POSE)).toBeCloseTo(BAND_BACK_PHONE, 1);
  });

  it("stands at the front of the crowd, in its aisle on the stage's axis, where the walk's limits move no one", () => {
    for (const [, pose] of POSES) {
      const along = alongOf(pose);
      // On the axis within the aisle's half-width less a figure's reach, on the crowd's ground, in its front section (seats.js).
      expect(Math.abs(acrossOf(pose))).toBeLessThan(1);
      expect(onCrowdGround(pose.x, pose.z)).toBe(true);
      expect(along).toBeGreaterThan(13.5);
      expect(along).toBeLessThan(28);
      // Clear of the stage's reach and inside the island's bound, each by a metre.
      expect(along).toBeGreaterThan(STAGE_REACH + 1);
      expect(Math.hypot(pose.x, pose.z)).toBeLessThan(BOUND - 1);
    }
  });

  it("faces the stage: its centre lies within a degree of straight ahead", () => {
    for (const [, pose] of POSES) {
      const to = { x: STAGE[0] - pose.x, z: STAGE[1] - pose.z }, far = Math.hypot(to.x, to.z);
      expect((forward.x * to.x + forward.z * to.z) / far).toBeGreaterThan(Math.cos(Math.PI / 180));
    }
  });

  it("holds all six players in the frame from head to foot, and their kits, keyboards and stands, with a tenth of the frame to spare at either side, on a desktop and on a phone", () => {
    expect(bodies.map((b: { plays: string }) => b.plays)).toEqual(["guitar", "bass", "drums", "drums", "guitar", "keys"]);
    for (const device of Object.values(DEVICES)) {
      const seen = view(device);
      for (const { plays, corners, feet } of bodies) {
        const out = [...corners, feet].map(seen).filter((at) => !at.ahead || Math.abs(at.x) > 0.9 || Math.abs(at.y) > 0.5);
        expect([device.tier, plays, out.length]).toEqual([device.tier, plays, 0]);
      }
      // The keyboard's end was the first thing a phone cut, from where the desktop stands.
      expect([device.tier, things.map(seen).filter((at) => !at.ahead || Math.abs(at.x) > 0.9 || Math.abs(at.y) > 0.5).length]).toEqual([device.tier, 0]);
    }
    expect(things.length).toBeGreaterThan(5000);
  });

  it("sees every player against the light panel: from the eye, each corner of a body from the hips up falls on it", () => {
    // The panel's plane in the stage's own frame: z = PANEL.z, facing the hill.
    const inStage = (at: Vec) => stage.worldToLocal(new Vector3(at.x, at.y, at.z));
    for (const [, pose] of POSES) for (const { plays, corners, feet } of bodies) {
      const from = inStage(eyeAt(pose));
      let checked = 0;
      const off: Vec[] = [];
      for (const corner of corners) {
        // Below the hips a player is seen against the floor.
        if (corner.y < feet.y + 1.7) continue;
        const at = inStage(corner);
        // Where the line from the eye through the corner meets the panel's plane.
        const t = (PANEL.z - from.z) / (at.z - from.z), hit = { x: from.x + (at.x - from.x) * t, y: from.y + (at.y - from.y) * t };
        checked += 1;
        if (!(t > 1 && Math.abs(hit.x) < PANEL.w / 2 && hit.y > PANEL.y - PANEL.h / 2 && hit.y < PANEL.y + PANEL.h / 2)) off.push(corner);
      }
      expect(checked).toBeGreaterThan(200);
      expect([plays, off.length]).toEqual([plays, 0]);
    }
  });
});
