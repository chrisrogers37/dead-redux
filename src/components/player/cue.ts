/** The queue's place, as the player keeps it: the track it is on. */
export interface Queue {
  index: number;
}

/**
 * Moves the queue to a track and tells the world where it is cued, before the audio plays: the track and the position in it, so the
 * bears wait at the cued point rather than at the track's start. A cue within the track the queue is on is told too.
 */
export function cueQueue(queue: Queue, index: number, position: number): void {
  queue.index = index;
  document.dispatchEvent(new CustomEvent("player:track", { detail: { index, position } }));
}
