// The maps' peaks at main (site-x, eaf2181c): for each peak, the figures' tempo there (beat.js figuresTempo), whether the build-up falls
// from it to nothing (no next peak within BUILD_UP + 0.8 s), and the map's loudness around it. usage: node survey.mjs <site-x> <out.json>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const [site, out] = process.argv.slice(2);
const { checkMap, readMap, buildUp, envAt, BUILD_UP } = await import(`${site}/world/maps.js`);
const { figuresTempo } = await import(`${site}/world/beat.js`);
const peaks = [];
let tracks = 0, withPeak = 0, bad = 0;
for (const name of readdirSync(`${site}/maps`).filter((n) => n.endsWith(".json")).sort()) {
  const raw = JSON.parse(readFileSync(`${site}/maps/${name}`, "utf8"));
  if (checkMap(raw).length) { bad++; continue; }
  const map = readMap(raw);
  map.tracks.forEach((track, index) => {
    tracks++;
    if (track.peaks.length) withPeak++;
    track.peaks.forEach(([second, strength], k) => {
      const next = track.peaks[k + 1]?.[0] ?? null;
      const after = buildUp(track, second + 0.81);
      const loud = [];
      for (let t = second - 6; t <= second + 6; t += track.step) loud.push(+envAt(track, Math.max(0, t)).rms.toFixed(3));
      peaks.push({ show: raw.show, index, title: track.title, second, strength, tempo: figuresTempo(track, second), step: track.step,
        nextGap: next === null ? null : +(next - second).toFixed(1), toNothing: after === 0, after: +after.toFixed(3),
        loudAtPeak: +envAt(track, second).rms.toFixed(3), loudAfter: +envAt(track, second + 1).rms.toFixed(3), loud });
    });
  });
}
const byTempo = {};
for (const p of peaks) byTempo[p.tempo] = (byTempo[p.tempo] || 0) + 1;
const pick = (bpm) => peaks.filter((p) => p.tempo === bpm);
const summary = { maps: readdirSync(`${site}/maps`).length, bad, tracks, withPeak, peaks: peaks.length, BUILD_UP,
  fastest: Math.max(...peaks.map((p) => p.tempo ?? 0)), byTempo,
  at159: pick(159), at140: pick(140), at120: pick(120) };
writeFileSync(out, JSON.stringify({ summary, peaks }, null, 1));
console.log(JSON.stringify({ ...summary, at159: summary.at159.length, at140: summary.at140.length, at120: summary.at120.length }));
