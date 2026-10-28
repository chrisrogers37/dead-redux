import type { ResumePoint } from "./useResume";

/** The player's own moves, as the join makes them. */
export interface JoinMoves {
  /** Moves to a track and a position (the player's goTo). */
  goTo(index: number, seconds: number): void;
  /** Cues the active track again from its start, so a source that failed before the join loads afresh. */
  recue(): void;
  /** Plays the active element. Its promise is caught, never awaited. */
  play(): void;
  /** Dispatches player:start, whose listener in the world creates and resumes the AudioContext. */
  start(): void;
}

/**
 * The join's first moves, synchronously inside the activating event's handler: the point it starts from (or, after a failure,
 * the active track cued again), then play(), then player:start, so that the AudioContext is made under the same user activation.
 * Nothing here awaits: a reordered or awaited play() silences a phone, while a desktop browser still plays.
 */
export function joinMoves(from: ResumePoint | null, failed: boolean, moves: JoinMoves): void {
  if (from) moves.goTo(from.index, from.seconds);
  else if (failed) moves.recue();
  moves.play();
  moves.start();
}
