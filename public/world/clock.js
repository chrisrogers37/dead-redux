/* eslint-disable */

/* The show clock the world runs on: the player's last report of a track and a position in it, and when it came. While the show
   plays, the world runs on from it (main.js). */

/* The clock a cue from the player sets (player:track): its track, kept within the show, at the position it is cued to, from `now`.
   The bears stand at the track's start until the first report. */
export function cueClock(cue, tracks, now) {
  const index = Math.max(0, Math.min(tracks.length - 1, cue.index));
  return { index, position: 0, duration: tracks[index].duration, at: now };
}
