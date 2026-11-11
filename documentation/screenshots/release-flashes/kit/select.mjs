// For each peak at the figures' tempos 158 (the fastest any peak reads; it stands in for 159), 140 and 120, main's frame equations at
// 30 frames a second from 25 s before the peak: the build-up toward buildUp at most 1.25 a second (main.js toward), the map's loudness
// through audio.js mappings (weight 1, as when the map drives), and the swing eased toward the dance with a 0.8 s time constant. Picks,
// per tempo, of the peaks where the rig is lit and not lifted, the one whose swing is widest while the beams open (0 to 1.8 s after the peak). usage: node select.mjs <site-x> <survey.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
const [site, surveyPath, out] = process.argv.slice(2);
const { readMap, buildUp, mapDrive } = await import(`${site}/world/maps.js`);
const { mappings } = await import(`${site}/world/audio.js`);
const { crowdPlan } = await import(`${site}/world/seats.js`);
const { peaks } = JSON.parse(readFileSync(surveyPath, "utf8"));
const maps = {};
const raws = {};
const rawOf = (show) => (raws[show] ??= JSON.parse(readFileSync(`${site}/maps/${show}.json`, "utf8")));
const trackOf = (show, index) => (maps[show] ??= readMap(rawOf(show))).tracks[index];
/* Where the crowd dances and does not sit (seats.js crowdPlan, set 2's start unknown: that moves only the set break, which is no song),
   the rig is lit with its beams at rest, not lifted as in Space. */
const lit = (show, index) => { const plan = crowdPlan(rawOf(show).tracks.map((t) => ({ title: t.title, duration: t.playingDuration })), null)[index];
  return plan.dance && !plan.sit; };
const toward = (value, target, step) => value + Math.max(-step, Math.min(step, target - value));
const dt = 1 / 30, k = 1 - Math.exp(-dt / 0.8);
function path(track, peak) {
  let build = 0, swing = 0.4 + 1.2 * mapDrive(track, peak - 25).loud;
  const rows = [];
  for (let f = -25 * 30; f <= 1.8 * 30 + 1e-9; f++) {
    const t = peak + f * dt;
    const drive = mapDrive(track, t);
    build = toward(build, buildUp(track, t), dt / 0.8);
    const l2 = mappings(drive, 1, build);
    swing += (l2.dance - swing) * k;
    if (f >= -3 * 30) rows.push({ f, t: +(f * dt).toFixed(3), loud: drive.loud, rise: l2.rise, swing });
  }
  return rows;
}
const result = {};
for (const [label, bpm] of [["159", 158], ["140", 140], ["120", 120]]) {
  const atTempo = peaks.filter((p) => p.tempo === bpm), dark = atTempo.filter((p) => !lit(p.show, p.index));
  const scored = atTempo.filter((p) => lit(p.show, p.index)).map((p) => {
    const rows = path(trackOf(p.show, p.index), p.second);
    const rel = rows.filter((r) => r.f >= 0);
    const near = rows.filter((r) => r.f >= -30);
    return { ...p, loud: undefined, swingAtPeak: +rows.find((r) => r.f === 0).swing.toFixed(4),
      riseAtPeak: +rows.find((r) => r.f === 0).rise.toFixed(4), riseAt08: +rows.find((r) => r.f === 24).rise.toFixed(4),
      swingMaxOpen: +Math.max(...rel.map((r) => r.swing)).toFixed(4), swingMinOpen: +Math.min(...rel.map((r) => r.swing)).toFixed(4),
      swingSpanNear: +(Math.max(...near.map((r) => r.swing)) - Math.min(...near.map((r) => r.swing))).toFixed(4) };
  }).sort((a, b) => b.swingMaxOpen - a.swingMaxOpen || b.swingSpanNear - a.swingSpanNear);
  result[label] = { mapTempo: bpm, candidates: scored.length, leftOut: dark.map((p) => `${p.show} ${p.index} ${p.title} ${p.second}`), picked: scored[0], range: { swingMaxOpen: [scored.at(-1).swingMaxOpen, scored[0].swingMaxOpen] },
    widestChange: [...scored].sort((a, b) => b.swingSpanNear - a.swingSpanNear)[0], all: scored };
}
writeFileSync(out, JSON.stringify(result, null, 1));
for (const [label, r] of Object.entries(result)) {
  const p = r.picked, w = r.widestChange;
  console.log(label, `(${r.candidates} peaks at ${r.mapTempo}, left out ${r.leftOut.length}: ${r.leftOut.join("; ")})`, "picked:", p.show, p.index, p.title, p.second, "swing at peak", p.swingAtPeak,
    "widest opening", p.swingMaxOpen, "rise at peak", p.riseAtPeak, "at 0.8 s", p.riseAt08, "| widest change:", w.show, w.index, w.title, w.second, w.swingSpanNear);
}
