import { describe, expect, it } from "vitest";
import { listenerAt } from "../../../public/world/audio.js";
import { STAGE, STAGE_POSE } from "../../../public/world/ground.js";
import { fits, keepSpot, walkFrom } from "../../../public/world/modes.js";
import { enterMode, slotAt, slotDistance } from "../../../public/world/modes.js";

// What a walk's frame keeps the walker to (public/world/main.js): within 117 m of the island's centre (BOUND), 11 m from the stage's
// centre (STAGE_REACH, public/world/stage.js), and 3.9 m from each bear's when the walker is the visitor's bear (BODY_REACH).
const BOUND = 117;
const STAGE_REACH = 11;
const BODY_REACH = 3.9;
const stage = { x: STAGE[0], z: STAGE[1] };

type Point = { x: number; z: number };
type Spot = Point & { heading: number };
type Walker = Spot & { pitch: number };
const limits = (bears: Point[] = []) => ({ bound: BOUND, stage, stageReach: STAGE_REACH, bears, bearReach: BODY_REACH });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const spotOf = (w: Spot): Spot => ({ x: w.x, z: w.z, heading: w.heading });

// Where the visitor's bear stood when a mode began: the stage pose, on the slope 34 m in front of the stage (public/world/ground.js).
const P: Spot = { x: STAGE_POSE.x, z: STAGE_POSE.z, heading: STAGE_POSE.heading };
// Its place in the bears' line, across the island from it.
const SLOT: Spot = { x: -40, z: 60, heading: 2.1 };

// What each mode does to the walker in its frames (public/world/main.js): attract and lean-back's drift keep it in its place in the
// line, which moves as the bears walk on; follow leaves it standing and turns its heading and its look as the visitor looks around.
const MODES: Record<string, (walker: Walker, slot: Spot) => void> = {
  attract: (w, s) => Object.assign(w, s),
  drift: (w, s) => Object.assign(w, s),
  follow: (w) => {
    w.heading += 1.3;
    w.pitch = 0.4;
  },
};

// A walk at `start`, its frames recorded, then the modes in turn for three frames each while the bears walk on, then a walk again.
function leaveAndReturn(start: Spot, modes: string[]) {
  const walker: Walker = { ...start, pitch: 0 };
  let slot = SLOT;
  const spot = keepSpot(walker, () => slot, () => limits());
  spot.stand();
  for (const mode of modes) {
    for (let k = 0; k < 3; k++) {
      slot = { ...slot, x: slot.x + 2 };
      MODES[mode](walker, slot);
    }
  }
  return { from: spot.walk(), walker, spot };
}

describe("keepSpot", () => {
  for (const mode of Object.keys(MODES)) {
    it(`brings the bear back from ${mode} to where it stood, facing as it did`, () => {
      const { from, walker } = leaveAndReturn(P, [mode]);
      expect(from).toBe("stood");
      expect(spotOf(walker)).toEqual(P);
    });
  }

  it("brings the bear back through one mode after another to where it stood in the walk before them", () => {
    for (const modes of [["follow", "drift"], ["attract", "follow"], ["attract", "drift"], ["follow", "drift", "attract"]]) {
      const { from, walker } = leaveAndReturn(P, modes);
      expect(from).toBe("stood");
      expect(spotOf(walker)).toEqual(P);
    }
  });

  it("brings each walk back to its own last spot, not an earlier walk's", () => {
    const { walker, spot } = leaveAndReturn(P, ["follow"]);
    const Q = { x: P.x - 6, z: P.z + 4, heading: 0.3 };
    Object.assign(walker, Q);
    spot.stand();
    MODES.drift(walker, SLOT);
    expect(spot.walk()).toBe("stood");
    expect(spotOf(walker)).toEqual(Q);
  });

  it("starts the first walk after the descent in the line: there is no walk before it to go back to", () => {
    const walker: Walker = { x: 0, z: 0, heading: 0, pitch: 0 };
    const spot = keepSpot(walker, () => SLOT, () => limits());
    // The descent and attract keep the walker in its place in the line, as main.js's frame does.
    MODES.attract(walker, SLOT);
    expect(spot.walk()).toBe("slot");
    expect(spotOf(walker)).toEqual(SLOT);
  });

  it("reads the bears where they stand when the walk begins: one that walked onto the spot moves the bear out of its reach", () => {
    const walker: Walker = { ...P, pitch: 0 };
    let bears: Point[] = [];
    const spot = keepSpot(walker, () => SLOT, () => limits(bears));
    spot.stand();
    MODES.attract(walker, SLOT);
    bears = [{ x: P.x + 1, z: P.z }];
    expect(spot.walk()).toBe("nearest");
    expect(distance(walker, bears[0])).toBeCloseTo(BODY_REACH, 9);
  });
});

describe("walkFrom", () => {
  it("goes back to where the bear stood while a walker may stand there", () => {
    expect(walkFrom(P, SLOT, limits())).toEqual({ ...P, from: "stood" });
  });

  it("starts in the line when there is no spot to go back to", () => {
    expect(walkFrom(null, SLOT, limits())).toEqual({ ...SLOT, from: "slot" });
  });

  it("where a bear now stands, goes to the nearest spot out of its reach, on the line from the bear, facing as it did", () => {
    const bear = { x: P.x - 1.2, z: P.z + 0.9 };
    const s = walkFrom(P, SLOT, limits([bear]));
    expect(s.from).toBe("nearest");
    expect(distance(s, bear)).toBeCloseTo(BODY_REACH, 9);
    expect((s.x - bear.x) / BODY_REACH).toBeCloseTo((P.x - bear.x) / 1.5, 9);
    expect((s.z - bear.z) / BODY_REACH).toBeCloseTo((P.z - bear.z) / 1.5, 9);
    expect(s.heading).toBe(P.heading);
    expect(fits(s, limits([bear]))).toBe(true);
  });

  it("where two bears' reaches now overlap it, goes to where their edges cross on its side, out of both", () => {
    const bears = [{ x: P.x - 3, z: P.z }, { x: P.x + 3, z: P.z }];
    const s = walkFrom({ ...P, z: P.z + 0.5 }, SLOT, limits(bears));
    expect(s.from).toBe("nearest");
    expect(s.x).toBeCloseTo(P.x, 9);
    expect(s.z).toBeCloseTo(P.z + Math.sqrt(BODY_REACH ** 2 - 9), 9);
    expect(fits(s, limits(bears))).toBe(true);
  });

  it("inside the stage's reach, goes out to its edge on the line from its centre", () => {
    const s = walkFrom({ x: stage.x + 3, z: stage.z + 4, heading: 0.5 }, SLOT, limits());
    expect(s.from).toBe("nearest");
    expect(s.x).toBeCloseTo(stage.x + (3 * STAGE_REACH) / 5, 9);
    expect(s.z).toBeCloseTo(stage.z + (4 * STAGE_REACH) / 5, 9);
    expect(s.heading).toBe(0.5);
  });

  it("beyond the walk's bound, comes back to it on the same bearing from the island's centre", () => {
    const s = walkFrom({ x: -50, z: 120, heading: 1 }, SLOT, limits());
    expect(s.from).toBe("nearest");
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(BOUND, 9);
    expect(s.x / s.z).toBeCloseTo(-50 / 120, 9);
  });

  it("starts in the line where no spot near it holds a walker", () => {
    // Inside the stage's reach, with a bear just past its edge on the line out: the stage's edge lies inside the bear's reach, and the
    // edge of the bear's lies back inside the stage's.
    const bear = { x: stage.x + 12.5, z: stage.z };
    expect(walkFrom({ x: stage.x + 5, z: stage.z, heading: 0 }, SLOT, limits([bear]))).toEqual({ ...SLOT, from: "slot" });
  });
});

describe("the sound's listener", () => {
  // In third person the listener is the visitor's bear's head (listenerAt), the very point the bear moves. The bear stands where the
  // walker does in a walk, and in its place in the line under every other camera (public/world/main.js); this stand-in moves the head
  // over it, as avatar.js does.
  const camera = { position: { x: 0, y: 60, z: 0 } };
  const head = { x: 0, y: 3.6, z: 0 };
  const stepTo = (s: Point) => {
    head.x = s.x;
    head.z = s.z;
  };

  it("stays on the bear's head in every mode and after every exit, so it comes back with the bear", () => {
    for (const mode of Object.keys(MODES)) {
      const walker: Walker = { ...P, pitch: 0 };
      const spot = keepSpot(walker, () => SLOT, () => limits());
      stepTo(walker);
      spot.stand();
      MODES[mode](walker, SLOT);
      stepTo(SLOT);
      expect(listenerAt(true, head, camera)).toBe(head);
      expect(distance(head, SLOT)).toBe(0);
      spot.walk();
      stepTo(walker);
      expect(listenerAt(true, head, camera)).toBe(head);
      expect(distance(head, P)).toBe(0);
    }
  });
});

// The bears' line (public/world/path.js) as slotAt reads it, its tangent turning with the distance.
const curving = {
  at: (d: number) => ({ x: 10 + d, y: 4, z: -20 + d / 2 }),
  tangentAt: (d: number) => ({ x: Math.cos(d), y: 0, z: Math.sin(d) }),
};

describe("slotDistance", () => {
  it("stands the visitor's bear one gap behind the last bear shown: as many gaps behind the lead as there are bears shown", () => {
    // Five bears 7 m apart, the lead 100 m along: the last stands at 72 m and the visitor's bear at 65 m.
    expect(slotDistance(100, 5, 7)).toBe(65);
  });

  it("moves up the line with the rest when a downgrade drops bears", () => {
    expect(slotDistance(100, 3, 7)).toBe(79);
    expect(slotDistance(100, 1, 7)).toBe(93);
  });
});

describe("slotAt", () => {
  it("is the line's point at the distance, its x and z, and a heading", () => {
    const slot = slotAt(curving, 12.5);
    expect(Object.keys(slot).sort()).toEqual(["heading", "x", "z"]);
    expect(slot.x).toBe(22.5);
    expect(slot.z).toBe(-13.75);
  });

  it("faces along the line's tangent at that same distance, at every bearing: a heading h walks along (-sin h, -cos h)", () => {
    for (let k = 0; k < 16; k++) {
      const d = (k * Math.PI) / 8;
      const { heading } = slotAt(curving, d);
      expect(-Math.sin(heading)).toBeCloseTo(Math.cos(d), 9);
      expect(-Math.cos(heading)).toBeCloseTo(Math.sin(d), 9);
    }
  });
});

// The modes the camera takes (public/world/main.js).
const EVERY_MODE = ["descent", "attract", "follow", "walk", "drift"];
const otherThan = (mode: string) => EVERY_MODE.filter((m) => m !== mode);
// keepSpot's walk() as setMode meets it, recording each time a walk asks where it starts: it says it starts `from`.
const startingAt = (from: "stood" | "nearest" | "slot") => ({
  walks: 0,
  walk() {
    this.walks += 1;
    return from;
  },
});

describe("enterMode", () => {
  it("changes nothing where the mode is the same, and does not ask where a walk starts", () => {
    for (const mode of EVERY_MODE) {
      const spot = startingAt("nearest");
      expect(enterMode(mode, mode, spot)).toEqual({ changed: false, cut: false, followEntered: false });
      expect(spot.walks).toBe(0);
    }
  });

  it("cuts to a walk that starts where the bear stood, or at the nearest spot a walker may stand, from every other mode", () => {
    for (const from of otherThan("walk")) {
      for (const start of ["stood", "nearest"] as const) {
        const spot = startingAt(start);
        expect(enterMode(from, "walk", spot)).toEqual({ changed: true, cut: true, followEntered: false });
        expect(spot.walks).toBe(1);
      }
    }
  });

  it("does not cut to a walk that starts in the line, where the last camera already is", () => {
    for (const from of otherThan("walk")) {
      const spot = startingAt("slot");
      expect(enterMode(from, "walk", spot)).toEqual({ changed: true, cut: false, followEntered: false });
      expect(spot.walks).toBe(1);
    }
  });

  it("never cuts to another mode, whatever a walk would have said", () => {
    for (const to of otherThan("walk")) {
      for (const from of otherThan(to)) {
        const spot = startingAt("nearest");
        expect(enterMode(from, to, spot).cut).toBe(false);
        expect(spot.walks).toBe(0);
      }
    }
  });

  it("marks entering follow, which frames the bears again, level, and no other mode", () => {
    for (const from of otherThan("follow")) {
      const spot = startingAt("stood");
      expect(enterMode(from, "follow", spot)).toEqual({ changed: true, cut: false, followEntered: true });
      expect(spot.walks).toBe(0);
    }
    for (const to of otherThan("follow")) {
      for (const from of otherThan(to)) expect(enterMode(from, to, startingAt("stood")).followEntered).toBe(false);
    }
  });

  it("with keepSpot itself, cuts to a walk once the bear has stood in one, and not to the first, which starts in the line", () => {
    const walker: Walker = { x: 0, z: 0, heading: 0, pitch: 0 };
    const spot = keepSpot(walker, () => SLOT, () => limits());
    // Nothing has stood in a walk yet, so the first walk starts in the line.
    expect(enterMode("attract", "walk", spot).cut).toBe(false);
    // The bear stands where a walker may; attract takes it back to the line, and the next walk starts where it stood.
    Object.assign(walker, P);
    spot.stand();
    MODES.attract(walker, SLOT);
    expect(enterMode("attract", "walk", spot).cut).toBe(true);
  });
});
