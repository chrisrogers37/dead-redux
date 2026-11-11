// #128's moment (the fixed day's Jack Straw from 254 s, 10 s at 30 frames a second, ?drive=map) under main's frame equations: the rig's
// gather as main at eaf2181c writes it (the build-up as it acts) and as the fix writes it (falling no faster than 1/8 a second), from
// the play's start with the build-up and the weight at 0. usage: node moment_check.mjs <site-x>
import { readFileSync } from "node:fs";
const site = process.argv[2];
const { readMap, buildUp, mapDrive } = await import(`${site}/world/maps.js`);
const { mappings } = await import(`${site}/world/audio.js`);
const map = readMap(JSON.parse(readFileSync(`${site}/maps/1986-07-04.json`, "utf8")));
const track = map.tracks[1];
const toward = (v, t, s) => v + Math.max(-s, Math.min(s, t - v));
const dt = 1 / 30;
let build = 0, weight = 0, fix = 0, differ = 0, most = 0, peaks = track.peaks.map(([s]) => s);
for (let f = 0; f <= 300; f++) {
  const t = 254 + f * dt;
  weight = toward(weight, 1, dt / 0.8);
  build = toward(build, buildUp(track, t), dt / 0.8);
  const rise = mappings(mapDrive(track, t), weight, build).rise;
  const main = Math.fround(rise);
  fix = Math.fround(Math.max(rise, fix - dt / 8));
  if (main !== fix) differ++;
  most = Math.max(most, main);
}
console.log(JSON.stringify({ title: track.title, peaks, frames: 301, differ, gatherAtEnd: +fix.toFixed(4), mostGather: +most.toFixed(4) }));
