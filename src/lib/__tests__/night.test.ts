import { describe, expect, it } from "vitest";
import { DAYBREAK, DEEP, FIRST_LIGHT, followHour, HOUR_RATE, lookAt, MOON, newLook, nightPlan, SET_BREAK } from "../../../public/world/night.js";

// The fixed day's show (1986-07-04), as the world reads it: set 2 from track 7, Drums and Space at 13 and 14, the encore track 18.
const FIXED = [
  ["Tuning", 98], ["Jack Straw", 386], ["Dupree's Diamond Blues", 461], ["C C Rider", 418], ["Tennessee Jed", 540], ["My Brother Esau", 258],
  ["Touch Of Grey", 333], ["Cold Rain And Snow ->", 368], ["Fire On The Mountain ->", 570], ["Samson And Delilah", 342], ["The Wheel ->", 283],
  ["I Need A Miracle ->", 213], ["Uncle John's Band ->", 450], ["Drums ->", 502], ["Space ->", 232], ["Gimme Some Lovin' ->", 313],
  ["Goin' Down The Road Feeling Bad ->", 307], ["Turn On Your Lovelight", 272], ["U.S. Blues", 287],
].map(([title, duration]) => ({ title: title as string, duration: duration as number }));
const startOf = (index: number) => FIXED.slice(0, index).reduce((sum, t) => sum + t.duration, 0);
const TOTAL = startOf(FIXED.length);

describe("nightPlan", () => {
  const night = nightPlan(FIXED, 7, 18);

  it("opens the show in the last light and ends it at daybreak", () => {
    expect(night.hourAt(0)).toBe(0);
    expect(night.hourAt(TOTAL)).toBe(DAYBREAK);
    expect(night.hourAt(TOTAL + 60)).toBe(DAYBREAK);
    expect(night.hourAt(-5)).toBe(0);
  });

  it("is past dusk where set 2 begins, at its deepest from Drums' first second to Space's last, and at first light where the encore begins", () => {
    expect(night.hourAt(startOf(7))).toBeCloseTo(SET_BREAK, 10);
    expect(night.hourAt(startOf(13))).toBeCloseTo(DEEP, 10);
    expect(night.hourAt(startOf(14) + 100)).toBe(DEEP);
    expect(night.hourAt(startOf(15))).toBeCloseTo(DEEP, 10);
    expect(night.hourAt(startOf(18))).toBeCloseTo(FIRST_LIGHT, 10);
  });

  it("never runs back as the show plays on", () => {
    let last = -1;
    for (let s = 0; s <= TOTAL; s += 7) {
      const hour = night.hourAt(s);
      expect(hour).toBeGreaterThanOrEqual(last);
      last = hour;
    }
  });

  it("runs straight between two marks", () => {
    const half = (startOf(7) + startOf(13)) / 2;
    expect(night.hourAt(half)).toBeCloseTo((SET_BREAK + DEEP) / 2, 10);
  });

  it("gives each track the hour halfway through it, so the encore stands between first light and daybreak", () => {
    expect(night.hourOf(0)).toBeCloseTo(night.hourAt(49), 10);
    expect(night.hourOf(13)).toBeCloseTo(DEEP, 10);
    expect(night.hourOf(14)).toBeCloseTo(DEEP, 10);
    expect(night.hourOf(18)).toBeCloseTo((FIRST_LIGHT + DAYBREAK) / 2, 10);
    expect(night.hourOf(1)).toBeCloseTo(night.hourAt(98 + 386 / 2), 10);
  });

  it("takes the break at 37 % of the tracks and the last track as the encore where the notes mark neither", () => {
    const unmarked = nightPlan(FIXED, null, null);
    expect(unmarked.hourAt(startOf(Math.floor(FIXED.length * 0.37)))).toBeCloseTo(SET_BREAK, 10);
    expect(unmarked.hourAt(startOf(13))).toBeCloseTo(DEEP, 10);
    expect(unmarked.hourAt(startOf(FIXED.length - 1))).toBeCloseTo(FIRST_LIGHT, 10);
  });

  it("is at its deepest 60 % of the way from set 2 to the encore in a show without Drums or Space", () => {
    const songs = FIXED.filter((t) => !/Drums|Space/.test(t.title));
    const plain = nightPlan(songs, 7, songs.length - 1);
    const start = (i: number) => songs.slice(0, i).reduce((sum, t) => sum + t.duration, 0);
    const deepest = start(7) + 0.6 * (start(songs.length - 1) - start(7));
    expect(plain.hourAt(deepest)).toBeCloseTo(DEEP, 10);
    expect(plain.hourAt(deepest - 60)).toBeLessThan(DEEP);
    expect(plain.hourAt(deepest + 60)).toBeGreaterThan(DEEP);
  });

  it("reads a Drums in set 1 as a song of the dusk, and holds the deep for set 2's alone", () => {
    const early = FIXED.map((t, i) => (i === 3 ? { ...t, title: "Drums" } : t));
    expect(nightPlan(early, 7, 18).hourAt(startOf(3))).toBeLessThan(SET_BREAK);
  });

  it("carries a one-track show from the last light to daybreak", () => {
    const one = nightPlan([{ title: "Dark Star", duration: 600 }], null, null);
    expect(one.hourAt(0)).toBe(0);
    expect(one.hourAt(600)).toBe(DAYBREAK);
    for (let s = 0, last = 0; s <= 600; s += 10) {
      expect(one.hourAt(s)).toBeGreaterThanOrEqual(last);
      last = one.hourAt(s);
    }
  });

  it("stays in the dark to the end of a show that ends in Space", () => {
    const tracks = [{ title: "Bertha", duration: 300 }, { title: "Drums", duration: 300 }, { title: "Space", duration: 300 }];
    const night = nightPlan(tracks, 1, null);
    expect(night.hourAt(300)).toBeCloseTo(SET_BREAK, 10);
    expect(night.hourAt(450)).toBeGreaterThan(SET_BREAK);
    expect(night.hourAt(900)).toBeLessThanOrEqual(DAYBREAK);
    expect(night.marks.every(([t], i, all) => i === 0 || t > all[i - 1][0])).toBe(true);
  });
});

describe("followHour", () => {
  it("keeps to an hour that moves as slowly as the show plays", () => {
    let hour = 0.5, target = 0.5;
    for (let i = 0; i < 600; i++) {
      target += 0.0003 / 60;
      hour = followHour(hour, target, 1 / 60);
    }
    expect(target - hour).toBeLessThan(0.001);
  });

  it("passes through the hours between after a seek, never faster than HOUR_RATE, and lands within eight seconds", () => {
    let hour = 0;
    const seen: number[] = [];
    for (let i = 0; i < 8 * 60; i++) {
      const next = followHour(hour, DAYBREAK, 1 / 60);
      expect(next - hour).toBeLessThanOrEqual(HOUR_RATE / 60 + 1e-12);
      expect(next).toBeGreaterThanOrEqual(hour);
      hour = next;
      seen.push(hour);
    }
    expect(seen.some((h) => Math.abs(h - DEEP) < 0.01)).toBe(true);
    expect(DAYBREAK - hour).toBeLessThan(0.01);
  });

  it("reaches the same hour whatever the frame rate", () => {
    const run = (dt: number) => {
      let hour = 0;
      for (let t = 0; t < 3 - 1e-9; t += dt) hour = followHour(hour, DEEP, dt);
      return hour;
    };
    expect(run(1 / 20)).toBeCloseTo(run(1 / 100), 2);
  });

  it("never overshoots, even on a frame a second long", () => {
    expect(followHour(0.9, 1, 1)).toBeLessThanOrEqual(1);
    expect(followHour(1.1, 1, 1)).toBeGreaterThanOrEqual(1);
  });
});

describe("lookAt", () => {
  // A colour's brightness as the eye weighs it.
  const luma = ([r, g, b]: Float32Array | number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const at = (hour: number) => lookAt(hour, newLook());

  it("is darkest in the deep of the night: the least light from the sky, the darkest sky, every star out", () => {
    const deep = at(DEEP);
    for (const hour of [0, 0.3, SET_BREAK, 1.4, FIRST_LIGHT, DAYBREAK]) {
      const look = at(hour);
      expect(look.ambientGain).toBeGreaterThan(deep.ambientGain);
      expect(luma(look.zenith)).toBeGreaterThan(luma(deep.zenith));
      expect(look.stars).toBeLessThan(deep.stars);
      expect(look.dark).toBeLessThan(deep.dark);
    }
    expect(deep.stars).toBe(1);
    expect(deep.dark).toBe(1);
  });

  it("makes the stage the light of the deep night: its own light and its glow on the ground and the sea are fullest there", () => {
    const deep = at(DEEP);
    for (const hour of [0, 0.5, 1.4, FIRST_LIGHT, DAYBREAK]) {
      const look = at(hour);
      expect(look.stageLift).toBeLessThan(deep.stageLift);
      expect(look.shine).toBeLessThan(deep.shine);
    }
    expect(at(0).stageLift).toBe(0);
  });

  it("shows the rig's beams in full from dusk through the night, and lets the daylight wash them out toward daybreak", () => {
    for (const hour of [0, 0.5, DEEP, 1.4]) expect(at(hour).beams).toBe(1);
    expect(at(FIRST_LIGHT).beams).toBeLessThan(1);
    expect(at(DAYBREAK).beams).toBeLessThan(at(FIRST_LIGHT).beams);
    expect(at(DAYBREAK).beams).toBeGreaterThan(0.3);
  });

  it("brings the moon out for the night and takes it in before the sun: full in the deep, gone at dusk and at daybreak", () => {
    expect(at(0).moon).toBe(0);
    expect(at(DEEP).moon).toBe(1);
    expect(at(DAYBREAK).moon).toBe(0);
    expect(at(DEEP).keyTo[0]).toBeCloseTo(MOON[0], 6);
    expect(at(DEEP).keyTo[1]).toBeCloseTo(MOON[1], 6);
    // The moon stands in the south-east (+x, +z), well above the horizon.
    expect(MOON[0]).toBeGreaterThan(0);
    expect(MOON[2]).toBeGreaterThan(0);
    expect(MOON[1]).toBeGreaterThan(0.3);
  });

  it("brings the land back at first light: more light from the sky than at any hour of set 2, and more again by daybreak", () => {
    expect(at(FIRST_LIGHT).ambientGain).toBeGreaterThan(at(SET_BREAK).ambientGain);
    expect(at(FIRST_LIGHT).ambientGain).toBeGreaterThan(2 * at(DEEP).ambientGain);
    expect(at(DAYBREAK).ambientGain).toBeGreaterThan(at(FIRST_LIGHT).ambientGain);
  });

  it("glows where the sun set through the dusk and where it will rise before dawn, with no glow in the deep", () => {
    const west = at(0).glowTo, east = at(FIRST_LIGHT).glowTo;
    // North is -z and east +x: the sun sets in the north-west and rises in the north-east.
    expect(west[0]).toBeLessThan(0);
    expect(west[1]).toBeLessThan(0);
    expect(east[0]).toBeGreaterThan(0);
    expect(east[1]).toBeLessThan(0);
    expect(luma(at(DEEP).glow)).toBe(0);
    expect(at(0.8).glowTo[0]).toBeCloseTo(west[0], 5);
    expect(at(1.2).glowTo[0]).toBeCloseTo(east[0], 5);
  });

  it("keeps the sun under the horizon until daybreak", () => {
    for (const hour of [0, 0.5, DEEP, 1.4, FIRST_LIGHT, 1.9]) expect(at(hour).disc).toBeLessThan(0);
    expect(at(DAYBREAK).disc).toBeGreaterThan(0);
  });

  it("gives directions of length 1 at every hour, the key light always above the horizon", () => {
    for (let hour = 0; hour <= DAYBREAK; hour += 0.05) {
      const look = at(hour);
      expect(Math.hypot(...look.glowTo)).toBeCloseTo(1, 5);
      expect(Math.hypot(...look.keyTo)).toBeCloseTo(1, 5);
      expect(look.keyTo[1]).toBeGreaterThan(0.1);
    }
  });

  it("changes without a step from one hour to the next", () => {
    let last = at(0);
    for (let hour = 0.01; hour <= DAYBREAK; hour += 0.01) {
      const look = at(hour);
      expect(Math.abs(look.ambientGain - last.ambientGain)).toBeLessThan(0.03);
      expect(Math.abs(luma(look.zenith) - luma(last.zenith))).toBeLessThan(0.02);
      expect(Math.abs(luma(look.haze) - luma(last.haze))).toBeLessThan(0.03);
      last = look;
    }
  });

  it("writes into the look it is given and holds the hour within the night", () => {
    const look = newLook();
    expect(lookAt(DEEP, look)).toBe(look);
    expect(lookAt(-1, look).hour).toBe(0);
    expect(lookAt(9, look).hour).toBe(DAYBREAK);
  });
});
