import { useEffect, useEffectEvent } from "react";

/** What the lock screen, media keys and headsets can do. */
export interface MediaSessionControls {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seekTo: (seconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
}

/** J, L and the lock screen's skip buttons move this far. */
export const SKIP_S = 10;
const ACTIONS: MediaSessionAction[] = ["play", "pause", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward"];
const ARTWORK: MediaImage[] = [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }];

/** Sets or clears one action's handler; a browser that lacks the action throws, and the action is skipped. */
function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // this browser lacks the action
  }
}

/** Lock-screen and media-key controls: the track as metadata, the player's controls as action handlers, and whether it plays. */
export function useMediaSession(title: string | null, album: string, playing: boolean, controls: MediaSessionControls): void {
  const act = useEffectEvent((action: MediaSessionAction, details: MediaSessionActionDetails) => {
    switch (action) {
      case "play":
        controls.play();
        break;
      case "pause":
        controls.pause();
        break;
      case "previoustrack":
        controls.previous();
        break;
      case "nexttrack":
        controls.next();
        break;
      case "seekto":
        if (details.seekTime !== undefined) controls.seekTo(details.seekTime);
        break;
      case "seekbackward":
        controls.seekBy(-(details.seekOffset ?? SKIP_S));
        break;
      case "seekforward":
        controls.seekBy(details.seekOffset ?? SKIP_S);
        break;
    }
  });

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    for (const action of ACTIONS) setHandler(action, (details) => act(action, details));
    return () => {
      for (const action of ACTIONS) setHandler(action, null);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata =
      title === null ? null : new MediaMetadata({ title, artist: "Grateful Dead", album, artwork: ARTWORK });
  }, [title, album]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);
}

/** Tells the lock screen where playback is: called on each timeupdate and after seeks. */
export function updateMediaPosition(position: number, duration: number): void {
  if (!("mediaSession" in navigator) || !Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(Math.max(position, 0), duration) });
  } catch {
    // a state the browser rejects is dropped
  }
}
