"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { DerivedSets, Track } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { nextIndex, prevIndex, setName } from "@/lib/queue";
import { Transport } from "./Transport";
import { keyBelongsToControl, lettersActive, useFirstMove } from "./useFirstMove";
import { updateMediaPosition, useMediaSession } from "./useMediaSession";
import { clearResume, readResume, useResume, type ResumePoint } from "./useResume";
import { useWakeLock } from "./useWakeLock";

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "stalled" | "error";
export type Routing = "pending" | "webaudio" | "plain";

/** Two elements: the idle one loads the next track ahead, so a track change is quick. False plays every track on one element by a src swap. */
const TWO_ELEMENTS = true;
/** The idle element starts loading the next track this long before the active one ends. */
const PRELOAD_LEAD_S = 30;
/** Waiting longer than this shows "Reconnecting…". */
const STALL_MS = 2000;
/** A failed track reloads after this pause, up to RETRIES times. */
const RETRY_MS = 2000;
const RETRIES = 3;
/** How long "Resumed at …" shows. */
const NOTE_MS = 4000;
/** J, L and the lock screen's skip buttons move this far. */
const SKIP_S = 10;
/** No Web Audio graph routes the elements: every element plays plain stereo. */
const ROUTING: Routing = "plain";
const MEDIA_EVENTS = ["loadedmetadata", "durationchange", "playing", "pause", "waiting", "stalled", "timeupdate", "seeked", "ended", "error"] as const;

declare global {
  interface Window {
    /** Render and playback stats the CI shoot script logs after every shot. */
    __hill?: Record<string, unknown>;
  }
}

/** Safari 17+ names the audio session; "playback" keeps the sound through the silent switch and in the background. */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

type Slot = 0 | 1;

/** What the player keeps between renders: which element plays and where the queue is. */
interface Engine {
  /** The element that plays. */
  active: Slot;
  /** The track the queue is on: the one the active element holds. */
  index: number;
  /** The track each element holds, or -1. */
  held: [number, number];
  /** Each element has fired loadedmetadata since its source was set, so its CORS check passed. */
  metadata: [boolean, boolean];
  /** The show has started (the first move happened). */
  joined: boolean;
  /** The event that started the show, so the keyboard handler does not act on it a second time. */
  joinEvent: Event | null;
  /** Playback should continue across reloads, track changes and the re-mount. */
  wantPlay: boolean;
  /** The last track ended. */
  over: boolean;
  /** The saved point, read when the page loads and used by the first move. */
  resume: ResumePoint | null;
  /** Where the active element starts after a re-mount. */
  restartAt: number;
  retries: number;
  stallTimer: number;
  retryTimer: number;
  noteTimer: number;
  /** performance.now() when the last track ended, until the next one plays; 0 when none is pending. */
  endedAt: number;
}

interface Props {
  tracks: Track[];
  sets: DerivedSets;
  featuredDate: string;
  showDate: string;
  venue: string;
  archiveUrl: string;
  /** Lean-back shows the big title, the line and the seek band only. */
  leanback: boolean;
  /** Where the first move starts, ahead of the saved point. */
  startAt?: ResumePoint | null;
  /** What Details holds. */
  children?: ReactNode;
}

const finiteOr = (n: number, fallback: number) => (Number.isFinite(n) && n > 0 ? n : fallback);
const relistenUrl = (date: string) => `https://relisten.net/grateful-dead/${date.replace(/-/g, "/")}`;

export function Player({ tracks, sets, featuredDate, showDate, venue, archiveUrl, leanback, startAt, children }: Props) {
  const aRef = useRef<HTMLAudioElement>(null);
  const bRef = useRef<HTMLAudioElement>(null);
  const eng = useRef<Engine>({
    active: 0,
    index: 0,
    held: [-1, -1],
    metadata: [false, false],
    joined: false,
    joinEvent: null,
    wantPlay: false,
    over: false,
    resume: null,
    restartAt: 0,
    retries: 0,
    stallTimer: 0,
    retryTimer: 0,
    noteTimer: 0,
    endedAt: 0,
  });
  const [view, setView] = useState({ index: 0, position: 0, duration: tracks[0]?.duration ?? 0 });
  const [state, setState] = useState<PlayerState>(tracks.length ? "idle" : "error");
  const [joined, setJoined] = useState(false);
  const [over, setOver] = useState(false);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Bumped once, when a CORS failure re-mounts both elements without crossOrigin. */
  const [elementKey, setElementKey] = useState(0);
  const cors = elementKey === 0;

  function slotEl(slot: Slot) {
    return slot === 0 ? aRef.current : bRef.current;
  }

  function activeEl() {
    return slotEl(eng.current.active);
  }

  function idleSlot(): Slot {
    return eng.current.active === 0 ? 1 : 0;
  }

  /** Points an element at a track and a position; a different track sets its source. */
  function cue(slot: Slot, index: number, seconds: number) {
    const el = slotEl(slot);
    if (!el) return;
    const g = eng.current;
    if (g.held[slot] !== index) {
      el.src = tracks[index].mp3Url;
      g.held[slot] = index;
      g.metadata[slot] = false;
    }
    if (seconds > 0 || el.currentTime !== 0) el.currentTime = seconds;
  }

  /** A refusal without user activation shows as paused; an interrupted or unplayable play is followed by an element event that says what happened. */
  function refused(err: unknown) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      eng.current.wantPlay = false;
      setState("paused");
    }
  }

  /** Plays the active element. Its promise is caught, never awaited. */
  function play() {
    const el = activeEl();
    if (!el) return;
    eng.current.wantPlay = true;
    el.play().catch(refused);
  }

  /** Moves the queue to a track and tells the world. */
  function setIndex(index: number) {
    const g = eng.current;
    if (index === g.index) return;
    const from = g.index;
    g.index = index;
    document.dispatchEvent(new CustomEvent("player:track", { detail: { index, from } }));
  }

  function showTrack(index: number, position: number) {
    setView({ index, position, duration: tracks[index].duration });
  }

  function showNote(text: string) {
    const g = eng.current;
    window.clearTimeout(g.noteTimer);
    setNote(text);
    g.noteTimer = window.setTimeout(() => setNote(null), NOTE_MS);
  }

  function playbackSession() {
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = "playback";
  }

  /** Lets the idle element play later without a fresh gesture (iOS asks for one per element): it is played and paused inside the join. */
  function unlockIdle() {
    const g = eng.current;
    const next = nextIndex(g.index, tracks.length);
    const slot = idleSlot();
    const el = slotEl(slot);
    if (!el || next === null) return;
    cue(slot, next, 0);
    el.play().catch(() => {});
    el.pause();
  }

  /**
   * Starts the show, synchronously inside the activating event's handler: play() first, then player:start, whose listener in the world
   * creates and resumes the AudioContext under the same user activation. Nothing here awaits.
   */
  function join(e: Event | null) {
    const g = eng.current;
    if (g.joined || !tracks.length) return;
    g.joined = true;
    g.joinEvent = e;
    playbackSession();
    const at = startAt && Number.isInteger(startAt.index) && startAt.index >= 0 && startAt.index < tracks.length ? startAt : null;
    const from = at ?? g.resume;
    if (from) {
      cue(g.active, from.index, from.seconds);
      setIndex(from.index);
      showTrack(from.index, from.seconds);
    }
    play();
    document.dispatchEvent(new Event("player:start"));
    if (TWO_ELEMENTS) unlockIdle();
    setJoined(true);
    setState("loading");
    if (!at && g.resume) showNote(`Resumed at ${g.resume.index + 1} of ${tracks.length}`);
    g.resume = null;
  }

  /** Moves to a track and a position; keeps playing if it was playing, else only cues. */
  function goTo(index: number, seconds = 0) {
    if (!tracks.length) return;
    const g = eng.current;
    const i = Math.min(Math.max(0, index), tracks.length - 1);
    window.clearTimeout(g.retryTimer);
    g.retryTimer = 0;
    g.retries = 0;
    g.over = false;
    setOver(false);
    setFailed(false);
    cue(g.active, i, seconds);
    setIndex(i);
    showTrack(i, seconds);
    if (g.wantPlay) {
      setState("loading");
      play();
    }
  }

  /** The show is over: stop, forget the saved point, and say so. */
  function finish() {
    const g = eng.current;
    g.over = true;
    g.wantPlay = false;
    activeEl()?.pause();
    clearResume(featuredDate);
    setOver(true);
    setState("idle");
  }

  /** The play button, Space and K: the first press starts the show, then each press pauses or plays. */
  function toggle(e?: Event) {
    const g = eng.current;
    if (!g.joined) {
      join(e ?? null);
      return;
    }
    const el = activeEl();
    if (!el) return;
    if (g.over) {
      g.wantPlay = true;
      goTo(0);
      return;
    }
    if (failed) {
      g.wantPlay = true;
      g.held[g.active] = -1;
      goTo(g.index, el.currentTime);
      return;
    }
    if (el.paused) play();
    else {
      g.wantPlay = false;
      el.pause();
    }
  }

  function seekTo(seconds: number) {
    const el = activeEl();
    if (!el || !tracks.length) return;
    const g = eng.current;
    const s = Math.min(Math.max(0, seconds), finiteOr(el.duration, tracks[g.index].duration));
    el.currentTime = s;
    setView((v) => ({ ...v, position: s }));
  }

  function seekBy(delta: number) {
    const el = activeEl();
    if (el) seekTo(el.currentTime + delta);
  }

  function next() {
    const i = nextIndex(eng.current.index, tracks.length);
    if (i === null) finish();
    else goTo(i);
  }

  function previous() {
    goTo(prevIndex(eng.current.index, tracks.length, activeEl()?.currentTime ?? 0));
  }

  function pause() {
    const el = activeEl();
    if (el && !el.paused) {
      eng.current.wantPlay = false;
      el.pause();
    }
  }

  /** Tells the world and the lock screen where playback is. */
  function announce(el: HTMLAudioElement) {
    const g = eng.current;
    const duration = finiteOr(el.duration, tracks[g.index].duration);
    document.dispatchEvent(
      new CustomEvent("player:now", { detail: { index: g.index, position: el.currentTime, duration, at: performance.now() } }),
    );
    updateMediaPosition(el.currentTime, duration);
  }

  /** Thirty seconds before the end, the idle element loads the next track in full. */
  function prepareNext(el: HTMLAudioElement) {
    if (!TWO_ELEMENTS) return;
    const g = eng.current;
    const next = nextIndex(g.index, tracks.length);
    if (next === null || finiteOr(el.duration, tracks[g.index].duration) - el.currentTime > PRELOAD_LEAD_S) return;
    const slot = idleSlot();
    const idle = slotEl(slot);
    if (!idle || (g.held[slot] === next && idle.preload === "auto")) return;
    idle.preload = "auto";
    cue(slot, next, 0);
  }

  /** On ended: the next track plays at once, from the idle element when it holds it; the gap is logged for CI. */
  function advance() {
    const g = eng.current;
    g.endedAt = performance.now();
    const next = nextIndex(g.index, tracks.length);
    if (next === null) {
      g.endedAt = 0;
      finish();
      return;
    }
    const slot = idleSlot();
    const idle = slotEl(slot);
    if (TWO_ELEMENTS && idle && g.held[slot] === next) {
      idle.play().catch(refused);
      g.active = slot;
    } else {
      cue(g.active, next, 0);
      activeEl()?.play().catch(refused);
    }
    setIndex(next);
    showTrack(next, 0);
  }

  function clearStall() {
    const g = eng.current;
    window.clearTimeout(g.stallTimer);
    g.stallTimer = 0;
  }

  /** Waiting longer than 2 s shows Reconnecting… */
  function watchStall(el: HTMLAudioElement) {
    const g = eng.current;
    if (g.stallTimer) return;
    g.stallTimer = window.setTimeout(() => {
      g.stallTimer = 0;
      if (el === activeEl() && !el.paused && el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        setState((s) => (s === "playing" ? "stalled" : s));
      }
    }, STALL_MS);
  }

  /** A failed track reloads from where it stopped, three times, then says it could not play (Next still works). */
  function retry(el: HTMLAudioElement) {
    const g = eng.current;
    clearStall();
    if (g.retries >= RETRIES) {
      g.wantPlay = false;
      setFailed(true);
      setState("error");
      return;
    }
    g.retries += 1;
    setState("stalled");
    const at = Math.floor(el.currentTime);
    const index = g.index;
    g.retryTimer = window.setTimeout(() => {
      g.retryTimer = 0;
      if (el !== activeEl() || g.index !== index) return;
      el.src = `${tracks[index].mp3Url}#t=${at}`;
      if (g.wantPlay) el.play().catch(refused);
    }, RETRY_MS);
  }

  /**
   * With crossOrigin set, a hop that fails the CORS check fails the load outright, before metadata. An element routed into a Web Audio
   * graph sounds only through it, so the fallback never retries those elements: it re-mounts both without crossOrigin and carries on
   * from the same place.
   */
  function fallBack() {
    const g = eng.current;
    g.restartAt = activeEl()?.currentTime ?? 0;
    clearStall();
    window.clearTimeout(g.retryTimer);
    g.retryTimer = 0;
    setElementKey((k) => k + 1);
  }

  const onMedia = useEffectEvent((slot: Slot, ev: Event) => {
    const el = slotEl(slot);
    if (!el) return;
    const g = eng.current;
    const isActive = slot === g.active;
    switch (ev.type) {
      case "loadedmetadata":
        g.metadata[slot] = true;
        if (isActive) setView((v) => ({ ...v, duration: finiteOr(el.duration, v.duration) }));
        break;
      case "durationchange":
        if (isActive && Number.isFinite(el.duration) && el.duration > 0) setView((v) => ({ ...v, duration: el.duration }));
        break;
      case "playing":
        if (!isActive) return;
        clearStall();
        g.retries = 0;
        setFailed(false);
        if (g.endedAt) {
          (window.__hill ??= {}).lastGapMs = Math.round(performance.now() - g.endedAt);
          g.endedAt = 0;
        }
        setState("playing");
        break;
      case "pause":
        if (!isActive) return;
        if (el.ended || g.over) return;
        g.wantPlay = false;
        setState("paused");
        break;
      case "waiting":
      case "stalled":
        if (isActive) watchStall(el);
        break;
      case "timeupdate": {
        if (!isActive) return;
        const position = el.currentTime;
        setView((v) => ({ ...v, position }));
        announce(el);
        prepareNext(el);
        break;
      }
      case "seeked":
        if (isActive) announce(el);
        break;
      case "ended":
        if (isActive) advance();
        break;
      case "error":
        if (cors && !g.metadata[slot]) {
          fallBack();
          return;
        }
        if (!isActive) {
          g.held[slot] = -1;
          return;
        }
        retry(el);
        break;
    }
  });

  /** Sets the elements up after each mount: the saved point is read once, the world hears about each element, and the active one is cued where the queue is. */
  const begin = useEffectEvent(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const g = eng.current;
    if (cors) g.resume = readResume(featuredDate, tracks.length);
    for (const el of [a, b]) document.dispatchEvent(new CustomEvent("player:element", { detail: { el, cors } }));
    cue(g.active, g.index, g.restartAt);
    if (g.wantPlay) play();
  });

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const g = eng.current;
    g.active = 0;
    g.held = [-1, -1];
    g.metadata = [false, false];
    const off: (() => void)[] = [];
    ([a, b] as const).forEach((el, i) => {
      const slot = i as Slot;
      for (const type of MEDIA_EVENTS) {
        const listener = (ev: Event) => onMedia(slot, ev);
        el.addEventListener(type, listener);
        off.push(() => el.removeEventListener(type, listener));
      }
    });
    begin();
    return () => off.forEach((f) => f());
  }, [elementKey]);

  /** Keys on window while nothing text-like has focus: Space or K play and pause, J and L seek 10 s, N and P change track. Letters act only while single-key shortcuts are on or the world has focus. */
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!tracks.length || keyBelongsToControl(e)) return;
    if (e.code === "Space") e.preventDefault();
    if (e === eng.current.joinEvent) return;
    const letters = lettersActive(e);
    switch (e.code) {
      case "Space":
        if (!e.repeat) toggle(e);
        break;
      case "KeyK":
        if (letters && !e.repeat) toggle(e);
        break;
      case "KeyJ":
        if (letters) seekBy(-SKIP_S);
        break;
      case "KeyL":
        if (letters) seekBy(SKIP_S);
        break;
      case "KeyN":
        if (letters && !e.repeat) next();
        break;
      case "KeyP":
        if (letters && !e.repeat) previous();
        break;
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const onWorldSeek = useEffectEvent((e: Event) => {
    const { index } = (e as CustomEvent<{ index: number }>).detail;
    if (Number.isInteger(index)) goTo(index);
  });

  useEffect(() => {
    const listener = (e: Event) => onWorldSeek(e);
    document.addEventListener("world:seek", listener);
    return () => document.removeEventListener("world:seek", listener);
  }, []);

  useEffect(() => {
    document.dispatchEvent(new CustomEvent("player:state", { detail: { state, routing: ROUTING } }));
  }, [state]);

  useEffect(() => {
    const g = eng.current;
    return () => {
      window.clearTimeout(g.stallTimer);
      window.clearTimeout(g.retryTimer);
      window.clearTimeout(g.noteTimer);
    };
  }, []);

  useFirstMove((e) => join(e), !joined && tracks.length > 0);
  const playing = state === "playing";
  useWakeLock(playing || state === "stalled");
  useResume(featuredDate, playing, () => {
    const g = eng.current;
    const el = activeEl();
    return g.joined && !g.over && el ? { index: g.index, seconds: el.currentTime } : null;
  });
  useMediaSession(tracks[view.index]?.title ?? null, `${formatDate(showDate)} · ${venue}`, playing, {
    play: () => {
      if (!eng.current.joined || activeEl()?.paused) toggle();
    },
    pause,
    previous,
    next,
    seekTo,
    seekBy,
  });

  if (!tracks.length) {
    return (
      <>
        <p className="t-body text-ink">No recording for this show.</p>
        <a href={relistenUrl(showDate)} target="_blank" rel="noopener noreferrer" className="t-row text-muted underline hover:text-ink">Open on Relisten ↗</a>
      </>
    );
  }

  const status = note ?? (state === "loading" ? "Starting…" : state === "stalled" ? "Reconnecting…" : over ? `Show over · ${formatDate(showDate)}` : null);
  return (
    <>
      <audio id="show-audio-a" key={`a${elementKey}`} ref={aRef} preload="metadata" playsInline crossOrigin={cors ? "anonymous" : undefined} />
      <audio id="show-audio-b" key={`b${elementKey}`} ref={bRef} preload="metadata" playsInline crossOrigin={cors ? "anonymous" : undefined} />
      <Transport
        leanback={leanback}
        title={tracks[view.index].title}
        index={view.index}
        count={tracks.length}
        set={setName(view.index, sets)}
        position={view.position}
        duration={view.duration}
        status={status}
        failed={failed}
        archiveUrl={archiveUrl}
        playing={playing || state === "loading" || state === "stalled"}
        onPrevious={previous}
        onPlay={() => toggle()}
        onNext={next}
        onSeek={seekTo}
      >
        {children}
      </Transport>
    </>
  );
}
