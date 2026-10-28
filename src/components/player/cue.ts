/** The queue's place, as the player keeps it: the track it is on. */
export interface Queue {
  index: number;
}

/** Moves the queue to a track and, when the track changes, tells the world which, before its audio plays. */
export function cueQueue(queue: Queue, index: number, position: number): void {
  if (index === queue.index) return;
  const from = queue.index;
  queue.index = index;
  document.dispatchEvent(new CustomEvent("player:track", { detail: { index, from } }));
}
