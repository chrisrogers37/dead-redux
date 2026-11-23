import { afterEach, describe, expect, it, vi } from "vitest";
import { listenerAt } from "../../../public/world/audio.js";
import { BODY_REACH } from "../../../public/world/collide.js";
import { BOUND, STAGE, STAGE_COLUMN, STAGE_POSE, STAGE_REACH } from "../../../public/world/ground.js";
import { bindInput, REACH } from "../../../public/world/input.js";
import {
  BEAR_GAP,
  confine,
  DESCENT_S,
  enterMode,
  fits,
  keepSpot,
  modeRules,
  RIDES,
  slotAt,
  slotDistance,
  walkFrom,
  walkLimits as worldLimits,
} from "../../../public/world/modes.js";

const stage = { x: STAGE[0], z: STAGE[1] };

type Point = { x: number; z: number };
type Spot = Point & { heading: number };
type Walker = Spot & { pitch: number };
// The tests keep a walker to the world's own limits (walkLimits, public/world/modes.js), with the bears and the trees each one gives.
// A walk is handed the trees near a place and how far it keeps from one; here every tree is near, and the reach is a number of the
// tests' own, as the world's is the trees' (trees.js).
const TREE_REACH = 2.8;
// walkLimits, with the shape of the trees' look-up, which the world's plain module does not spell out.
const walkLimits = worldLimits as unknown as (bears: Point[], trees?: (x: number, z: number, r: number) => Point[], treeReach?: number) => {
  bound: number; stages: (Point & { r: number; top: number })[]; stageReach: number; trees(x: number, z: number, r: number): Point[]; treeReach: number; bears: Point[]; bearReach: number;
};
const limits = (bears: Point[] = [], trees: Point[] = []) => walkLimits(bears, () => trees, TREE_REACH);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const spotOf = (w: Spot): Spot => ({ x: w.x, z: w.z, heading: w.heading });

// Where the visitor's bear stood when a mode began: the stage pose, on the slope 34 m in front of the stage (public/world/ground.js).
const P: Spot = { x: STAGE_POSE.x, z: STAGE_POSE.z, heading: STAGE_POSE.heading };
// Its place in the bears' line, across the island from it.
const SLOT: Spot = { x: -40, z: 60, heading: 2.1 };

// What each mode does to the walker in its frames (public/world/main.js): attract and the ride's crane, drift, keep it in its place
// in the line, which moves as the bears walk on; follow leaves it standing and turns its heading and its look as the visitor looks
// around.
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
  const spot = keepSpot(walker, () => slot, limits());
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
    const spot = keepSpot(walker, () => SLOT, limits());
    // The descent and attract keep the walker in its place in the line, as main.js's frame does.
    MODES.attract(walker, SLOT);
    expect(spot.walk()).toBe("slot");
    expect(spotOf(walker)).toEqual(SLOT);
  });

  it("reads the bears where they stand when the walk begins: one that walked onto the spot moves the bear out of its reach", () => {
    const walker: Walker = { ...P, pitch: 0 };
    const bears: Point[] = [{ x: P.x + 40, z: P.z }];
    const spot = keepSpot(walker, () => SLOT, limits(bears));
    spot.stand();
    MODES.attract(walker, SLOT);
    bears[0].x = P.x + 1;
    bears[0].z = P.z;
    expect(spot.walk()).toBe("nearest");
    expect(distance(walker, bears[0])).toBeCloseTo(BODY_REACH, 9);
  });

  it("reads the limits' bears when a walk begins, so a bear dropped from them in place no longer holds the walk off", () => {
    const bears = [{ x: -20, z: 30 }, { x: 40, z: -10 }];
    const lim = limits(bears);
    const walker: Walker = { x: 40, z: -10.5, heading: 0, pitch: 0 };
    const spot = keepSpot(walker, () => SLOT, lim);
    spot.stand();
    // The second bear is gone from the array the limits hold, as a downgrade drops one.
    bears.length = 1;
    expect(spot.walk()).toBe("stood");
    expect(spotOf(walker)).toEqual({ x: 40, z: -10.5, heading: 0 });
  });
});

describe("walkLimits", () => {
  it("holds the bears it is given, not a copy, and the trees' look-up and reach, with the stage's column and the world's reaches", () => {
    const bears = [{ x: -20, z: 30 }], trees = () => [{ x: 40, z: 60 }];
    expect(walkLimits(bears, trees, 3).bears).toBe(bears);
    expect(walkLimits(bears, trees, 3).trees).toBe(trees);
    expect(walkLimits(bears, trees, 3)).toEqual({ bound: BOUND, stages: [STAGE_COLUMN], stageReach: STAGE_REACH, trees, treeReach: 3, bears, bearReach: BODY_REACH });
    expect(walkLimits(bears).stages[0]).toBe(STAGE_COLUMN);
    // A world told of no trees has none anywhere.
    expect(walkLimits(bears).trees(40, 60, 3)).toEqual([]);
    expect(walkLimits(bears).treeReach).toBe(0);
    expect(fits({ x: 40, z: 60 }, walkLimits(bears))).toBe(true);
  });
});

describe("confine", () => {
  it("clamps a walker past the bound back onto it, on the same bearing", () => {
    const p: Spot = { x: -50, z: 120, heading: 1 };
    confine(p, limits());
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(BOUND, 9);
    expect(p.x / p.z).toBeCloseTo(-50 / 120, 9);
    expect(p.heading).toBe(1);
  });

  it("leaves a walker within the bound and clear of every reach where it stands", () => {
    // The first stands exactly on the bound.
    for (const p of [{ x: 0, z: BOUND, heading: 0.3 }, { x: -30, z: 20, heading: 2 }]) {
      const before = { ...p };
      confine(p, limits());
      expect(p).toEqual(before);
    }
  });

  it("gives the bears the last word: a walker the stage pushes into a bear's reach ends at the bear's", () => {
    // On the line from the stage's centre to the island's centre: a bear 1.5 m past the stage's reach, and a walker 3 m inside it.
    const norm = Math.hypot(stage.x, stage.z);
    const u = { x: -stage.x / norm, z: -stage.z / norm };
    const bear = { x: stage.x + u.x * (STAGE_REACH + 1.5), z: stage.z + u.z * (STAGE_REACH + 1.5) };
    const p: Spot = { x: stage.x + u.x * (STAGE_REACH - 3), z: stage.z + u.z * (STAGE_REACH - 3), heading: 0 };
    confine(p, limits([bear]));
    // The bear moved it last, back inside the stage's reach.
    expect(p.x).toBeCloseTo(stage.x + u.x * (STAGE_REACH + 1.5 - BODY_REACH), 9);
    expect(p.z).toBeCloseTo(stage.z + u.z * (STAGE_REACH + 1.5 - BODY_REACH), 9);
    expect(distance(p, stage)).toBeLessThan(STAGE_REACH);
  });

  it("moves a walker in a trunk's reach out onto it, on the line from the trunk's middle, and leaves one on the reach where it stands", () => {
    const tree = { x: -30, z: 40 };
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.1;
      const p: Spot = { x: tree.x + 1.1 * Math.cos(a), z: tree.z + 1.1 * Math.sin(a), heading: 0.4 };
      confine(p, limits([], [tree]));
      expect(p.x).toBeCloseTo(tree.x + TREE_REACH * Math.cos(a), 9);
      expect(p.z).toBeCloseTo(tree.z + TREE_REACH * Math.sin(a), 9);
      const on = { ...p };
      confine(p, limits([], [tree]));
      expect(p).toEqual(on);
    }
  });

  it("slides a held walk round a trunk: it never comes inside the reach, keeps to it while the trunk is in its way, and goes on past", () => {
    const tree = { x: 0, z: 0 }, lim = limits([], [tree]);
    // Walking along +x, a metre to one side of the trunk's middle, 0.2 m a frame as the walk's pace is.
    const p: Spot = { x: -8, z: 1, heading: -Math.PI / 2 };
    let touched = 0;
    for (let f = 0; f < 120; f++) {
      p.x += 0.2;
      confine(p, lim);
      expect(distance(p, tree)).toBeGreaterThanOrEqual(TREE_REACH - 1e-9);
      if (distance(p, tree) < TREE_REACH + 1e-9) touched += 1;
    }
    // It was held on the reach for a good many frames, went round on the side it came in on, and ended well past the trunk.
    expect(touched).toBeGreaterThan(10);
    expect(p.z).toBeGreaterThanOrEqual(1);
    expect(p.x).toBeGreaterThan(8);
  });

  it("asks for the trees near where the walker stands once the bound and the stage have moved it, within the trees' reach, and tries only those", () => {
    // A walker past the bound, on the bearing of a tree that stands just inside it: the clamp brings it into the tree's reach.
    const tree = { x: 0, z: BOUND - 1 }, asked: number[][] = [];
    const near = (x: number, z: number, r: number) => { asked.push([x, z, r]); return Math.hypot(x - tree.x, z - tree.z) < 10 ? [tree] : []; };
    const p: Spot = { x: 0, z: BOUND + 20, heading: 0 };
    confine(p, walkLimits([], near, TREE_REACH));
    // Asked once, where the clamp left it, on the bound.
    expect(asked).toEqual([[0, BOUND, TREE_REACH]]);
    expect(p.z).toBeCloseTo(tree.z + TREE_REACH, 9);
    // A tree the look-up does not hand over is not tried, wherever it stands: the look-up is the walk's only word on the trees.
    const far: Spot = { x: 50, z: 50, heading: 0 };
    confine(far, walkLimits([], () => [], TREE_REACH));
    expect(spotOf(far)).toEqual({ x: 50, z: 50, heading: 0 });
    // And after the stage has moved it: a walker 3 m inside the stage's reach is asked about where the stage put it, on its reach.
    asked.length = 0;
    const inStage: Spot = { x: stage.x + STAGE_REACH - 3, z: stage.z, heading: 0 };
    confine(inStage, walkLimits([], near, TREE_REACH));
    expect(asked).toEqual([[expect.closeTo(stage.x + STAGE_REACH, 9), expect.closeTo(stage.z, 9), TREE_REACH]]);
    // fits asks the same, where the walker would stand.
    asked.length = 0;
    expect(fits({ x: 1, z: BOUND - 2 }, walkLimits([], near, TREE_REACH))).toBe(false);
    expect(asked).toEqual([[1, BOUND - 2, TREE_REACH]]);
  });

  it("gives the bears the last word over a tree too: a walker in a trunk's reach and a bear's ends on the bear's", () => {
    // No tree stands this near the bears' line in the world (trees.js); the order holds all the same.
    const tree = { x: 10, z: 10 }, bear = { x: 10 + TREE_REACH + 1, z: 10 };
    const p: Spot = { x: 10.5, z: 10, heading: 0 };
    confine(p, limits([bear], [tree]));
    expect(distance(p, bear)).toBeCloseTo(BODY_REACH, 9);
    expect(distance(p, tree)).toBeLessThan(TREE_REACH);
    expect(fits(p, limits([bear], [tree]))).toBe(false);
    expect(fits(p, limits([bear]))).toBe(true);
  });

  it("steps a walker right on a bear's centre back against its heading", () => {
    const bear = { x: -20, z: 30 };
    const p: Spot = { ...bear, heading: 0.7 };
    confine(p, limits([bear]));
    expect(p.x).toBeCloseTo(bear.x + BODY_REACH * Math.sin(0.7), 9);
    expect(p.z).toBeCloseTo(bear.z + BODY_REACH * Math.cos(0.7), 9);
  });

  // A keep-out centred 1 m inside the bound, and a walker 20 m past the bound on the same bearing, clear of it: the clamp brings the
  // walker 1 m from the keep-out's centre, and the keep-out moves it out to its edge, past the bound. The world's own keep-outs lie
  // wholly inside the bound (BOUND, public/world/ground.js), where the clamp's place cannot show.
  const atBound = { x: 0, z: BOUND - 1 };
  const pastBound = (): Spot => ({ x: 0, z: BOUND + 20, heading: 0 });

  it("clamps before the stage keeps a walker out: one the clamp brings into the stage's reach ends at its edge, past the bound", () => {
    const p = pastBound();
    confine(p, { ...limits(), stages: [atBound] });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(atBound.z + STAGE_REACH, 9);
  });
});

describe("fits", () => {
  // The stage's column and a second one three reaches west of it. The world has one column, but a walk keeps out of each one `stages`
  // holds.
  const second = { ...STAGE_COLUMN, x: STAGE_COLUMN.x - 3 * STAGE_REACH };
  const twoColumns = { ...limits(), stages: [STAGE_COLUMN, second] };

  it("keeps a walker out of every trunk's reach, and lets it stand on one", () => {
    const trees = [{ x: -30, z: 40 }, { x: 20, z: 70 }], lim = limits([], trees);
    for (const tree of trees) {
      expect(fits({ x: tree.x + TREE_REACH - 0.01, z: tree.z }, lim)).toBe(false);
      expect(fits({ x: tree.x, z: tree.z - TREE_REACH + 0.01 }, lim)).toBe(false);
      expect(fits({ x: tree.x + TREE_REACH, z: tree.z }, lim)).toBe(true);
      expect(fits({ x: tree.x + TREE_REACH + 0.01, z: tree.z }, lim)).toBe(true);
    }
    // The same spot with no trees.
    expect(fits({ x: trees[0].x, z: trees[0].z }, limits())).toBe(true);
  });

  it("keeps a walker out of each column's reach, not only out of one's", () => {
    // Half a reach from one column's centre, on the side away from the other.
    expect(fits({ x: STAGE_COLUMN.x + STAGE_REACH / 2, z: STAGE_COLUMN.z }, twoColumns)).toBe(false);
    expect(fits({ x: second.x - STAGE_REACH / 2, z: second.z }, twoColumns)).toBe(false);
    // Midway between the two, a reach and a half from each.
    expect(fits({ x: STAGE_COLUMN.x - 1.5 * STAGE_REACH, z: STAGE_COLUMN.z }, twoColumns)).toBe(true);
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

  it("starts where confine moves a stand a walker may no longer take", () => {
    const stood = { x: -20, z: 30.5, heading: 0.2 };
    const bear = { x: -20, z: 30 };
    const at = { ...stood };
    confine(at, limits([bear]));
    expect(walkFrom(stood, SLOT, limits([bear]))).toEqual({ ...at, from: "nearest" });
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
      const spot = keepSpot(walker, () => SLOT, limits());
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
    expect(BEAR_GAP).toBe(7);
    expect(slotDistance(100, 5, BEAR_GAP)).toBe(65);
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
      expect(enterMode(mode, mode, spot)).toEqual({ changed: false, cut: false, rideEntered: false });
      expect(spot.walks).toBe(0);
    }
  });

  it("cuts to a walk that starts where the bear stood, or at the nearest spot a walker may stand, from every other mode", () => {
    for (const from of otherThan("walk")) {
      for (const start of ["stood", "nearest"] as const) {
        const spot = startingAt(start);
        expect(enterMode(from, "walk", spot)).toEqual({ changed: true, cut: true, rideEntered: false });
        expect(spot.walks).toBe(1);
      }
    }
  });

  it("does not cut to a walk that starts in the line, where the last camera already is", () => {
    for (const from of otherThan("walk")) {
      const spot = startingAt("slot");
      expect(enterMode(from, "walk", spot)).toEqual({ changed: true, cut: false, rideEntered: false });
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

  it("marks a ride entered from outside it, on either of its rigs, which frames the bears again, level; and neither the change from one rig to the other, where the look the visitor turned is kept, nor any other mode", () => {
    expect([...RIDES]).toEqual(["follow", "drift"]);
    for (const to of RIDES) {
      for (const from of EVERY_MODE.filter((mode) => !RIDES.has(mode))) {
        const spot = startingAt("stood");
        expect(enterMode(from, to, spot)).toEqual({ changed: true, cut: false, rideEntered: true });
        expect(spot.walks).toBe(0);
      }
    }
    // Between the rigs the camera eases and nothing is framed again: marked, the look would snap level as the crane took the view.
    expect(enterMode("follow", "drift", startingAt("stood"))).toEqual({ changed: true, cut: false, rideEntered: false });
    expect(enterMode("drift", "follow", startingAt("stood"))).toEqual({ changed: true, cut: false, rideEntered: false });
    for (const to of EVERY_MODE.filter((mode) => !RIDES.has(mode))) {
      for (const from of otherThan(to)) expect(enterMode(from, to, startingAt("stood")).rideEntered).toBe(false);
    }
  });

  it("with keepSpot itself, cuts to a walk once the bear has stood in one, and not to the first, which starts in the line", () => {
    const walker: Walker = { x: 0, z: 0, heading: 0, pitch: 0 };
    const spot = keepSpot(walker, () => SLOT, limits());
    // Nothing has stood in a walk yet, so the first walk starts in the line.
    expect(enterMode("attract", "walk", spot).cut).toBe(false);
    // The bear stands where a walker may; attract takes it back to the line, and the next walk starts where it stood.
    Object.assign(walker, P);
    spot.stand();
    MODES.attract(walker, SLOT);
    expect(enterMode("attract", "walk", spot).cut).toBe(true);
  });
});

// The frames these tests draw: each adds 50 ms of world time, the most one frame adds in public/world/main.js.
const FRAMES_PER_S = 20;

// modeRules as main.js holds them, with the mode it reads and a setMode that only enters the new one. `run` draws the frames of
// `seconds` of world time and calls `each` after every frame.
function rulesFrom(start: string) {
  // `entered` is each mode setMode was asked for, in order, the mode it already had among them.
  const world = { mode: start, frame: 0, entered: [] as string[] };
  const rules = modeRules(
    () => world.mode,
    (mode: string) => {
      world.entered.push(mode);
      world.mode = mode;
    },
  );
  const run = (seconds: number, each = () => {}) => {
    for (const end = world.frame + seconds * FRAMES_PER_S; world.frame < end; ) {
      world.frame += 1;
      rules.frame(world.frame / FRAMES_PER_S);
      each();
    }
  };
  return { world, rules, run };
}

// The page bindInput binds the controls on (public/world/input.js), played by stand-ins, since node has no DOM: the window and the
// document take listeners, and the document answers bindInput's two queries, <main> (none here) and the stick, 112 px across with its
// centre at (100, 700). `press` sends a key's keydown to the window; `touch` sends the stick a pointer event at an offset from its centre.
function bindWorld(userInput: (action: string) => void) {
  const stickEl = Object.assign(new EventTarget(), {
    dataset: {},
    style: { setProperty: () => {} },
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 44, top: 644, width: 112, height: 112 }),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLElement", class {});
  // The page's own events, which the world must not answer: the ride's keys are the page's (src/components/world/ride.ts).
  const said: string[] = [];
  const doc = Object.assign(new EventTarget(), {
    querySelector: (selector: string) => (selector === "[data-stick]" ? stickEl : null),
  });
  for (const type of ["player:join", "world:follow"]) doc.addEventListener(type, () => said.push(type));
  vi.stubGlobal("document", doc);
  // The world's own element, which takes a drag.
  const container = new EventTarget();
  const walker = { heading: 0, pitch: 0 };
  const input = bindInput(container, walker, userInput);
  const press = (code: string) => window.dispatchEvent(Object.assign(new Event("keydown"), { code, repeat: false }));
  const touch = (type: string, dx: number, dy: number) =>
    stickEl.dispatchEvent(Object.assign(new Event(type), { pointerId: 7, clientX: 100 + dx, clientY: 700 + dy }));
  // A press on the world at (x, y) px, and the same pointer moved there.
  const drag = (type: string, x: number, y: number) =>
    (type === "pointerdown" ? container : window).dispatchEvent(Object.assign(new Event(type), { pointerId: 3, clientX: x, clientY: y }));
  return { ...input, press, touch, drag, walker, said };
}

// The controls that only look around, and those that walk (bindInput's actions).
const LOOK_CONTROLS = ["left", "right", "lookUp", "lookDown", "drag"];
const WALK_CONTROLS = ["fwd", "back", "strafeL", "strafeR"];

describe("modeRules", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves a walk without a control where it is past 15 seconds, and the stage's sound with it", () => {
    const { world, rules, run } = rulesFrom("descent");
    run(DESCENT_S);
    expect(world.mode).toBe("attract");
    // A step after the descent starts a walk, with the visitor's bear at P; then nothing is pressed for a minute of world time.
    rules.input("fwd");
    expect(world.mode).toBe("walk");
    const walker: Walker = { ...P, pitch: 0 };
    // In third person the listener is the bear's head (listenerAt), which stands over the walker.
    const head = { x: P.x, y: 3.6, z: P.z };
    const camera = { position: { x: 0, y: 60, z: 0 } };
    // What each frame does to the bear: a walk with nothing held leaves it where it stands (main.js), and the bears' cameras walk it in
    // its place in the line (MODES).
    const frameDoes: typeof MODES = { ...MODES, walk: () => {} };
    run(60, () => {
      frameDoes[world.mode](walker, SLOT);
      head.x = walker.x;
      head.z = walker.z;
      expect(distance(listenerAt(true, head, camera), P)).toBe(0);
      expect(world.mode).toBe("walk");
    });
    expect(spotOf(walker)).toEqual(P);
  });

  it("walks on while the stick is held forward past 15 seconds: the push is one control, and no frame ends the walk", () => {
    const { world, rules, run } = rulesFrom("descent");
    run(DESCENT_S);
    const controls: string[] = [];
    const { stick, touch } = bindWorld((action) => {
      controls.push(action);
      rules.input(action);
    });
    touch("pointerdown", 0, -REACH);
    expect(controls).toEqual(["fwd"]);
    // main.js moves the walker forward in each frame of a walk while `stick.walk` holds; the thumb shifts on the stick meanwhile.
    run(60, () => {
      expect(world.mode).toBe("walk");
      expect(stick.walk).toBe(1);
      touch("pointermove", world.frame % 2, -REACH);
    });
    expect(controls).toEqual(["fwd"]);
    touch("pointerup", 0, -REACH);
    expect(stick).toEqual({ walk: 0, turn: 0 });
  });

  it("starts the ride with the bears as the page turns it on, from each mode it can be asked in, and ends it in a walk as the page turns it off", () => {
    for (const from of ["descent", "attract", "walk"]) {
      const { world, rules } = rulesFrom(from);
      rules.ride(true, false);
      expect(world.mode, from).toBe("follow");
      rules.ride(false, false);
      expect(world.mode, from).toBe("walk");
      // A page that never said "riding" and says it is not asks for nothing: the opening is left to play out.
      const quiet = rulesFrom(from);
      quiet.rules.ride(false, false);
      expect(quiet.world.entered).toEqual([]);
    }
  });

  it("starts the ride on the crane where the page is settled as it turns it on, as for a visitor carried over from the day before", () => {
    for (const from of ["descent", "walk"]) {
      const { world, rules } = rulesFrom(from);
      rules.ride(true, true);
      expect(world.entered, from).toEqual(["drift"]);
    }
  });

  it("goes to the crane as the page settles, and stays on it when the page wakes: a pointer that reaches for the page swings no view", () => {
    const { world, rules, run } = rulesFrom("walk");
    rules.ride(true, false);
    rules.ride(true, true);
    expect(world.mode).toBe("drift");
    // The page wakes, settles again and wakes, as a pointer comes and goes; a minute of frames passes. Nothing is asked of the camera.
    world.entered.length = 0;
    rules.ride(true, false);
    rules.ride(true, true);
    rules.ride(true, false);
    run(60);
    expect(world.entered).toEqual([]);
    expect(world.mode).toBe("drift");
  });

  it("keeps the ride through every control that only looks around, which brings the camera back from the crane to the rig it turns; the page's next settling sends it out again", () => {
    for (const look of LOOK_CONTROLS) {
      const { world, rules } = rulesFrom("walk");
      rules.ride(true, false);
      rules.input(look);
      expect(world.mode, look).toBe("follow");
      rules.ride(true, true);
      expect(world.mode, look).toBe("drift");
      rules.input(look);
      expect(world.mode, look).toBe("follow");
      // The page has not woken yet, and its word is read again as it stands, as when the player's state changes: the camera goes on
      // back, since the page settled before the look and has not settled since.
      rules.ride(true, true);
      expect(world.mode, look).toBe("follow");
      // The same control wakes the page; ten seconds on it settles again.
      rules.ride(true, false);
      rules.ride(true, true);
      expect(world.mode, look).toBe("drift");
    }
  });

  it("leaves the ride for a walk on every walking control, from the rig that walks with the bears and from the crane", () => {
    for (const step of WALK_CONTROLS) {
      for (const settled of [false, true]) {
        const { world, rules } = rulesFrom("walk");
        rules.ride(true, false);
        if (settled) rules.ride(true, true);
        expect(world.mode).toBe(settled ? "drift" : "follow");
        rules.input(step);
        expect(world.mode, `${step}, ${settled ? "settled" : "awake"}`).toBe("walk");
      }
    }
  });

  it("acts on the page's word as it changes, never while it stands: a page that still says riding after a step has left the ride does not start it again, nor does its settling", () => {
    const { world, rules } = rulesFrom("walk");
    rules.ride(true, false);
    rules.input("fwd");
    expect(world.mode).toBe("walk");
    // The page has not yet heard of the step: its word stands, is read again as the player's state changes, and it even settles.
    world.entered.length = 0;
    rules.ride(true, false);
    rules.ride(true, true);
    expect(world.entered).toEqual([]);
    // Then it catches up, and the next ride starts as any other.
    rules.ride(false, false);
    expect(world.entered).toEqual([]);
    rules.ride(true, false);
    expect(world.mode).toBe("follow");
  });

  it("ends the ride in a walk from either rig as the page turns it off", () => {
    for (const settled of [false, true]) {
      const { world, rules } = rulesFrom("attract");
      rules.ride(true, settled);
      rules.ride(false, false);
      expect(world.entered).toEqual([settled ? "drift" : "follow", "walk"]);
    }
  });

  it("hears a look key, the stick's turn and a drag on the world from the crane, and hears nothing of B or F, which are the page's", () => {
    const { world, rules } = rulesFrom("walk");
    const controls: string[] = [];
    const { press, touch, drag, walker, said } = bindWorld((action) => {
      controls.push(action);
      rules.input(action);
    });
    const settle = () => { rules.ride(true, false); rules.ride(true, true); expect(world.mode).toBe("drift"); };
    rules.ride(true, false);
    for (const code of ["KeyB", "KeyF", "Escape"]) press(code);
    expect(controls).toEqual([]);
    expect(said).toEqual([]);
    expect(world.mode).toBe("follow");
    settle();
    press("ArrowLeft");
    expect(world.mode).toBe("follow");
    settle();
    press("KeyT");
    expect(world.mode).toBe("follow");
    settle();
    touch("pointerdown", -REACH, 0);
    expect(world.mode).toBe("follow");
    touch("pointerup", -REACH, 0);
    settle();
    // A drag on the world starts from the crane as from anywhere: it turns the look by how far the pointer goes.
    walker.heading = 1;
    drag("pointerdown", 400, 300);
    expect(world.mode).toBe("follow");
    drag("pointermove", 300, 300);
    expect(walker.heading).toBeCloseTo(1.5, 9);
    expect(controls).toEqual(["left", "lookUp", "left", "drag", "drag"]);
    // And a step from the crane walks.
    settle();
    press("ArrowUp");
    expect(world.mode).toBe("walk");
  });

  it("still ends the descent with the bears at its length, and not before", () => {
    const { world, rules } = rulesFrom("descent");
    rules.frame(DESCENT_S - 1 / FRAMES_PER_S);
    expect(world.mode).toBe("descent");
    rules.frame(DESCENT_S);
    expect(world.mode).toBe("attract");
  });
});
