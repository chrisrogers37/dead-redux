import { describe, expect, it } from "vitest";
import { CRANE, cranePose, postPose, ridePose, RIG_EASE_S, rigShare } from "../../../public/world/pose.js";

// What public/world/main.js holds when it places the camera: five bears BEAR_GAP = 7 m apart on their line, the lead 100 m along it.
const GAP = 7;
const COUNT = 5;
const LEAD_D = 100;
// How far keepInView turns a third-person view down, when it turns it.
const TURN = 0.2;

type V = { x: number; y: number; z: number };
type Deps = {
  third: boolean;
  phone: boolean;
  bearD: number;
  count: number;
  gap: number;
  line: { at(d: number): V; tangentAt(d: number): V };
  height: (x: number, z: number) => number;
  keepInView: (from: V, look: V) => number;
};

// The ground slopes, as the island's does, so the eye is measured from the ground under the camera and not from under the lead bear.
const ground = (x: number, z: number) => 30 + 0.05 * x - 0.03 * z;
// The bears' line (public/world/path.js): from (3, -5) along (0.6, -0.8) for `bend` m, then along (-0.8, -0.6), on the ground, so a
// distance along it is metres.
const lineBent = (bend: number) => ({
  at(d: number): V {
    const on = Math.min(d, bend), past = d - on;
    const x = 3 + 0.6 * on - 0.8 * past, z = -5 - 0.8 * on - 0.6 * past;
    return { x, y: ground(x, z), z };
  },
  // The line's level unit tangent, which turns a quarter of a turn at the bend.
  tangentAt: (d: number): V => (d < bend ? { x: 0.6, y: 0, z: -0.8 } : { x: -0.8, y: 0, z: -0.6 }),
});
const straight = lineBent(Infinity);

// What the world is when the camera is placed: a desktop in third person, five bears. Each test changes what it is about.
const world = (changes: Partial<Deps> = {}): Deps => ({
  third: true, phone: false, bearD: LEAD_D, count: COUNT, gap: GAP, line: straight, height: ground, keepInView: () => 0, ...changes,
});
// keepInView, recording each view it is asked about and turning each down by `down` rad.
function turning(down: number) {
  const asked: { from: V; look: V }[] = [];
  return {
    asked,
    keepInView: (from: V, look: V) => {
      asked.push({ from: { ...from }, look: { ...look } });
      return down;
    },
  };
}

const distance = (a: V, b: V) => Math.hypot(a.x - b.x, a.z - b.z);
const elevation = (from: V, to: V) => Math.atan2(to.y - from.y, distance(from, to));
// The heading that faces from one point toward another: h faces along (-sin h, -cos h), so 0 faces -z (public/world/main.js).
const heading = (from: V, to: V) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
// The turn from heading b to heading a, within half a turn either way.
const apart = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const raised = (p: V, m: number): V => ({ ...p, y: p.y + m });
const expectNear = (p: V, q: V) => {
  expect(p.x).toBeCloseTo(q.x, 9);
  expect(p.y).toBeCloseTo(q.y, 9);
  expect(p.z).toBeCloseTo(q.z, 9);
};
// Where `p` stands in the frame of the chord from the visitor's bear `s` to the lead bear: how far behind `s` along it, and how far
// to its left (facing along the chord, with heading 0 facing -z, left is -x).
function inChord(p: V, s: V, lead: V) {
  const l = distance(s, lead), cx = (lead.x - s.x) / l, cz = (lead.z - s.z) / l;
  return { behind: -((p.x - s.x) * cx + (p.z - s.z) * cz), left: (p.x - s.x) * cz - (p.z - s.z) * cx };
}

// The third-person view on each device: how far behind the visitor's bear the camera stands, how far to its left, how high its eye is.
const VIEWS: [string, boolean, number, number, number][] = [
  ["a desktop or a TV", false, 16, 6, 10],
  ["a phone", true, 12, 3, 6.5],
];

describe("postPose", () => {
  const lead = straight.at(LEAD_D);
  // The visitor's bear: a sixth bear, one gap behind the last bear shown.
  const visitor = (count = COUNT) => straight.at(LEAD_D - count * GAP);

  it("stands in first person on the line 6 m behind the last bear, its eye 6.5 m over the ground", () => {
    const { pos } = postPose(world({ third: false }), 0, 0);
    // The last of the five stands four gaps behind the lead; the camera stands past it, away from the lead.
    expect(distance(pos, straight.at(LEAD_D - (COUNT - 1) * GAP))).toBeCloseTo(6, 9);
    expect(distance(pos, lead)).toBeCloseTo((COUNT - 1) * GAP + 6, 9);
    expect(pos.y - ground(pos.x, pos.z)).toBeCloseTo(6.5, 9);
  });

  it("looks in first person 2 m over the lead bear, and does not ask keepInView", () => {
    const { asked, keepInView } = turning(TURN);
    const { look } = postPose(world({ third: false, keepInView }), 0, 0);
    expectNear(look, raised(lead, 2));
    expect(asked).toEqual([]);
  });

  it("stands the same on a phone as on a desktop in first person", () => {
    expect(postPose(world({ third: false, phone: true }), 0.3, 0.1)).toEqual(postPose(world({ third: false }), 0.3, 0.1));
  });

  for (const [device, phone, back, side, eye] of VIEWS) {
    it(`stands in third person ${back} m behind the visitor's bear, ${side} m to its left, the eye ${eye} m up, on ${device}`, () => {
      const { pos } = postPose(world({ phone }), 0, 0);
      const at = inChord(pos, visitor(), lead);
      expect(at.behind).toBeCloseTo(back, 9);
      expect(at.left).toBeCloseTo(side, 9);
      expect(pos.y - ground(pos.x, pos.z)).toBeCloseTo(eye, 9);
    });
  }

  it("stands along the chord from the visitor's bear to the lead bear, not along the line, where the line bends between them", () => {
    // The corner is 80 m along: the visitor's bear, at 65 m, is before it, and the lead bear, at 100 m, past it.
    const bent = lineBent(80);
    const s = bent.at(LEAD_D - COUNT * GAP), bentLead = bent.at(LEAD_D);
    expect(distance(s, bentLead)).toBeCloseTo(25, 9);
    const at = inChord(postPose(world({ line: bent }), 0, 0).pos, s, bentLead);
    expect(at.behind).toBeCloseTo(16, 9);
    expect(at.left).toBeCloseTo(6, 9);
  });

  it("looks in third person 5.6 m over the lead bear, less the turn keepInView asks for", () => {
    for (const down of [0, TURN, 0.45]) {
      const { pos, look } = postPose(world({ keepInView: () => down }), 0, 0);
      // As far off as the lead bear, along the same bearing, and as high as 5.6 m over it less the turn.
      expect(distance(pos, look)).toBeCloseTo(distance(pos, lead), 9);
      expect(apart(heading(pos, look), heading(pos, lead))).toBeCloseTo(0, 9);
      expect(elevation(pos, look)).toBeCloseTo(elevation(pos, raised(lead, 5.6)) - down, 9);
    }
    expectNear(postPose(world(), 0, 0).look, raised(lead, 5.6));
  });

  it("asks keepInView only in third person, about the view from the camera toward the point 5.6 m over the lead bear", () => {
    const third = turning(TURN), first = turning(TURN);
    // The yaw and the pitch turn the look after keepInView has been asked, which is about the aim itself.
    const { pos } = postPose(world({ keepInView: third.keepInView }), 0.3, 0.2);
    postPose(world({ third: false, keepInView: first.keepInView }), 0.3, 0.2);
    expect(first.asked).toEqual([]);
    expect(third.asked).toHaveLength(1);
    expect(third.asked[0].from).toEqual(pos);
    expectNear(third.asked[0].look, raised(lead, 5.6));
  });

  it("turns the look from the aim by the yaw in heading and the pitch in elevation, and leaves the camera where it stands", () => {
    for (const third of [false, true]) {
      const still = postPose(world({ third, keepInView: () => TURN }), 0, 0);
      const turned = postPose(world({ third, keepInView: () => TURN }), 0.4, 0.1);
      expect(turned.pos).toEqual(still.pos);
      expect(apart(heading(turned.pos, turned.look), heading(still.pos, still.look))).toBeCloseTo(0.4, 9);
      expect(elevation(turned.pos, turned.look)).toBeCloseTo(elevation(still.pos, still.look) + 0.1, 9);
      expect(distance(turned.pos, turned.look)).toBeCloseTo(distance(still.pos, still.look), 9);
    }
  });

  it("clamps the look's elevation to 1.3 rad either way", () => {
    for (const third of [false, true]) {
      const up = postPose(world({ third }), 0, 5), down = postPose(world({ third }), 0, -5);
      expect(elevation(up.pos, up.look)).toBeCloseTo(1.3, 9);
      expect(elevation(down.pos, down.look)).toBeCloseTo(-1.3, 9);
    }
  });

  it("stands up the line with the bears shown when a downgrade drops some", () => {
    // The last of three stands two gaps behind the lead; in first person the camera stands 6 m past it.
    expect(distance(postPose(world({ third: false, count: 3 }), 0, 0).pos, lead)).toBeCloseTo((3 - 1) * GAP + 6, 9);
    // In third person the visitor's bear, one gap behind the last bear shown, moves up the line too, and the camera with it.
    const at = inChord(postPose(world({ count: 3 }), 0, 0).pos, visitor(3), lead);
    expect(at.behind).toBeCloseTo(16, 9);
    expect(at.left).toBeCloseTo(6, 9);
  });
});

describe("cranePose", () => {
  // The visitor's bear, five gaps behind the lead; the crane hangs behind it.
  const slot = LEAD_D - COUNT * GAP;
  // How far a point stands along the straight line from where it starts, and how far to its side.
  const alongLine = (p: V) => (p.x - 3) * 0.6 + (p.z + 5) * -0.8;
  const beside = (p: V) => (p.x - 3) * 0.8 + (p.z + 5) * 0.6;

  it("hangs CRANE.back m behind the visitor's bear along the line, 9 m over the ground under it, and looks at the line CRANE.ahead m on, 8 m over it", () => {
    for (const elapsed of [0, 4, 7.5, 19, 30]) {
      const { pos, look } = cranePose(world(), elapsed);
      expect(alongLine(pos)).toBeCloseTo(slot - CRANE.back, 9);
      expect(pos.y - ground(pos.x, pos.z)).toBeCloseTo(9, 9);
      expectNear(look, raised(straight.at(slot - CRANE.back + CRANE.ahead), 8));
    }
    expect(CRANE).toEqual({ back: 14, sway: 2, ahead: 28 });
  });

  it("sways CRANE.sway m to either side of the line and back once in 30 s, on the line at the start", () => {
    const side = (elapsed: number) => beside(cranePose(world(), elapsed).pos);
    expect(side(0)).toBeCloseTo(0, 9);
    expect(Math.abs(side(7.5))).toBeCloseTo(CRANE.sway, 9);
    expect(side(15)).toBeCloseTo(0, 9);
    expect(side(22.5)).toBeCloseTo(-side(7.5), 9);
    expect(side(34)).toBeCloseTo(side(4), 9);
    for (let t = 0; t < 30; t += 0.5) expect(Math.abs(side(t))).toBeLessThanOrEqual(CRANE.sway + 1e-9);
  });

  it("goes up the line with the bears shown when a downgrade drops some, as the visitor's bear does", () => {
    expect(alongLine(cranePose(world({ count: 3 }), 0).pos)).toBeCloseTo(LEAD_D - 3 * GAP - CRANE.back, 9);
  });

  it("sways square to the line where it hangs, not to the line where the bears are", () => {
    // The bend is at 60 m, past the crane at 51 m and short of the visitor's bear at 65 m: the sway is across the first stretch.
    const at = cranePose(world({ line: lineBent(60) }), 7.5).pos;
    expect(alongLine(at)).toBeCloseTo(slot - CRANE.back, 9);
    expect(Math.abs(beside(at))).toBeCloseTo(CRANE.sway, 9);
  });
});

describe("ridePose", () => {
  const post = { pos: { x: 0, y: 10, z: 0 }, look: { x: 0, y: 5, z: -30 } };
  const crane = { pos: { x: 6, y: 9, z: 2 }, look: { x: 8, y: 8, z: -40 } };

  it("is the rig that walks with the bears before the camera sets off and the crane once it has arrived, each as it was handed over", () => {
    expect(ridePose(post, crane, 0)).toBe(post);
    expect(ridePose(post, crane, 1)).toBe(crane);
    expect(ridePose(post, crane, -0.2)).toBe(post);
    expect(ridePose(post, crane, 1.2)).toBe(crane);
  });

  it("stands on the straight line between the two, and looks as far along the line between their looks, by rigShare of the time passed", () => {
    for (const lean of [0.1, 0.25, 0.5, 0.8]) {
      const k = rigShare(lean), { pos, look } = ridePose(post, crane, lean);
      expectNear(pos, { x: 6 * k, y: 10 - k, z: 2 * k });
      expectNear(look, { x: 8 * k, y: 5 + 3 * k, z: -30 - 10 * k });
    }
    // Half-way in time is half-way there.
    expectNear(ridePose(post, crane, 0.5).pos, { x: 3, y: 9.5, z: 1 });
  });

  it("sets off and arrives at rest, never turns back on the way, and takes RIG_EASE_S seconds", () => {
    expect(rigShare(0)).toBe(0);
    expect(rigShare(1)).toBe(1);
    // A thousandth of the time from either end it has gone three millionths of the way: a straight ramp would have gone a thousandth.
    expect(rigShare(0.001)).toBeLessThan(4e-6);
    expect(1 - rigShare(0.999)).toBeLessThan(4e-6);
    // Fastest half-way, at one and a half times a straight ramp's pace.
    expect((rigShare(0.501) - rigShare(0.499)) / 0.002).toBeCloseTo(1.5, 5);
    for (let k = 1; k <= 100; k++) {
      expect(rigShare(k / 100)).toBeGreaterThan(rigShare((k - 1) / 100));
      expect(rigShare(k / 100) + rigShare(1 - k / 100)).toBeCloseTo(1, 12);
    }
    expect(RIG_EASE_S).toBe(3);
  });
});
