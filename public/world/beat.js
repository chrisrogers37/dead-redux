/* eslint-disable */
import { tempoAround } from "./maps.js";

/* The stage's figures' beat: the tempo they play at and their phase, counted in beats. Where the show's map gives a tempo they take it,
   folded into their range, and the live sound's onsets (audio.js) pull their phase onto the music's beat; otherwise they keep
   FIGURES_BPM, free-running. */

/* The figures' tempo where the map gives none. */
export const FIGURES_BPM = 96;
/* The figures' range, from its floor up to its top, which it does not include: one octave, so a tempo folds into it one way only. */
const FIGURES_FLOOR = 80;
const FIGURES_TOP = 160;

/* A map's tempo reading folded into the figures' range. The analysis can read a beat at half or double its speed (maps.js), so a
   reading under the floor doubles and one at the top or over it halves. A map's readings run 60 to 200, which one step folds into
   80 to 159. No tempo (null) stays none. */
export function foldTempo(bpm) {
  if (bpm === null) return null;
  return bpm < FIGURES_FLOOR ? bpm * 2 : bpm >= FIGURES_TOP ? bpm / 2 : bpm;
}

/* How many tempo windows on each side of a time's own the figures' tempo reads: 9 windows, 90 s, so a reading that one window or a few
   take at another multiple of the beat is outvoted. */
const SPREAD = 4;

/* The figures' tempo t seconds into a track of the map: the median of the readings, each folded, of the window t falls in and SPREAD
   windows each side of it, within the track (the lower of the middle two, so it is always one of the readings); null where none of
   them has a tempo. */
export function figuresTempo(track, t) {
  const bpms = tempoAround(track, t, SPREAD).map(foldTempo).sort((a, b) => a - b);
  return bpms.length > 0 ? bpms[(bpms.length - 1) >> 1] : null;
}

/* An onset pulls the phase only when it falls within this much of a beat, in beats, either way; one farther off falls between beats. */
const LOCK = 0.25;
/* The share of an onset's phase error the beat takes up, and the seconds it takes it over, so the figures never jump. */
const PULL = 0.5;
const PULL_S = 0.2;

/* One frame of the figures' beat, from the last: `beats` is their phase, `pull` the correction still to take up, and `locks` how many
   onsets have pulled it. The phase advances by the tempo over the frame's dt seconds. `ago` is the seconds since an onset this frame
   brought (null for none): one that falls within LOCK of a beat, once the pull still to come is in, adds PULL of its error to the pull. */
export function beatStep({ beats, pull, locks }, dt, bpm, ago) {
  const rate = bpm / 60;
  if (ago !== null) {
    const at = beats + pull - ago * rate;
    const error = at - Math.round(at);
    if (Math.abs(error) < LOCK) {
      pull -= error * PULL;
      locks += 1;
    }
  }
  const take = pull * Math.min(1, dt / PULL_S);
  return { beats: beats + dt * rate + take, pull: pull - take, locks };
}
