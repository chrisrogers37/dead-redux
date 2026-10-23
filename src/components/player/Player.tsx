"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { DerivedSets, Track } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { corsAfterError } from "@/lib/fallback";
import { nextIndex, prevIndex, setName } from "@/lib/queue";
import { Transport } from "./Transport";
import { keyBelongsToControl, lettersActive } from "./keys";
import { useEventListener } from "./useEventListener";
import { useFirstMove } from "./useFirstMove";
import { SKIP_S, updateMediaPosition, useMediaSession } from "./useMediaSession";
import { clearResume, fits, readResume, useResume, type ResumePoint } from "./useResume";
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
const MEDIA_EVENTS = ["loadedmetadata", "durationchange", "playing", "pause", "waiting", "stalled", "timeupdate", "seeked", "ended", "error"] as const;
/** The letter keys the player answers to: K plays and pauses, J and L seek, N and P change track. */
const PLAYER_LETTERS = new Set(["KeyK", "KeyJ", "KeyL", "KeyN", "KeyP"]);

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
  /** Playback should continue across reloads, track changes, a failed track and the re-mount. */
  wantPlay: boolean;
  /** The last track ended. */
  over: boolean;
  /** Where the active element starts after it re-mounts. */
  restartAt: number;
  /** The element each slot was set up with, so a re-mount of one leaves the other alone. */
  els: [HTMLAudioElement | null, HTMLAudioElement | null];
  /** Removes each element's listeners. */
  off: [(() => void) | null, (() => void) | null];
  retries: number;
  stallTimer: number;
  retryTimer: number;
  noteTimer: number;
  /** performance.now() when the last track ended, until the next one plays; 0 when none is pending. */
  endedAt: number;
}

interface Props {
  /** The queue, never empty: a show without a recording gets no player. */
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

export function Player({ tracks, sets, featuredDate, showDate, venue, archiveUrl, leanback, startAt, children }: Props) {
  const aRef = useRef<HTMLAudioElement>(null);
  const bRef = useRef<HTMLAudioElement>(null);
  const eng = useRef<Engine>({
    active: 0,
    index: 0,
    held: [-1, -1],
    metadata: [false, false],
    joined: false,
    wantPlay: false,
    over: false,
    restartAt: 0,
    els: [null, null],
    off: [null, null],
    retries: 0,
    stallTimer: 0,
    retryTimer: 0,
    noteTimer: 0,
    endedAt: 0,
  });
  const [view, setView] = useState({ index: 0, position: 0, duration: tracks[0].duration });
  const [state, setState] = useState<PlayerState>("idle");
  const [joined, setJoined] = useState(false);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Whether each element still loads with crossOrigin; one turns false when its load fails the CORS check, and only that element re-mounts. */
  const [cors, setCors] = useState<[boolean, boolean]>([true, true]);
  const [corsA, corsB] = cors;
  /** How each element sounds, as the world reports it (world:routing): through its graph, or plain stereo. One it has not reported is pending. */
  const [routes, setRoutes] = useState<ReadonlyMap<HTMLAudioElement, Routing>>(() => new Map());

  function slotEl(slot: Slot) {
    return slot === 0 ? aRef.current : bRef.current;
  }

  function activeEl() {
    return slotEl(eng.current.active);
  }

  function idleSlot(): Slot {
    return eng.current.active === 0 ? 1 : 0;
  }

  /** The active track's length: the element's once it knows it, else the catalogue's. */
  function durationOf(el: HTMLAudioElement) {
    return finiteOr(el.duration, tracks[eng.current.index].duration);
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

  function pause() {
    const el = activeEl();
    if (el && !el.paused) {
      eng.current.wantPlay = false;
      el.pause();
    }
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

  function clearStall() {
    const g = eng.current;
    window.clearTimeout(g.stallTimer);
    g.stallTimer = 0;
  }

  function clearRetry() {
    window.clearTimeout(eng.current.retryTimer);
  }

  /** Moves to a track and a position; keeps playing if it was playing, else only cues. */
  function goTo(index: number, seconds = 0) {
    const g = eng.current;
    const i = Math.min(Math.max(0, index), tracks.length - 1);
    clearRetry();
    g.retries = 0;
    g.over = false;
    setOver(false);
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

  /**
   * Starts the show, synchronously inside the activating event's handler: play() first, then player:start, whose listener in the world
   * creates and resumes the AudioContext under the same user activation. Nothing here awaits.
   */
  function join() {
    const g = eng.current;
    if (g.joined) return;
    g.joined = true;
    playbackSession();
    const at = startAt && fits(startAt, tracks.length) ? startAt : null;
    const from = at ?? readResume(featuredDate, tracks.length);
    if (from) goTo(from.index, from.seconds);
    play();
    document.dispatchEvent(new Event("player:start"));
    if (TWO_ELEMENTS) unlockIdle();
    setJoined(true);
    setState("loading");
    if (!at && from) showNote(`Resumed at ${from.index + 1} of ${tracks.length}`);
  }

  /** The play button, Space and K: the first press starts the show, then each press pauses or plays. */
  function toggle() {
    const g = eng.current;
    if (!g.joined) {
      join();
      return;
    }
    const el = activeEl();
    if (!el) return;
    if (g.over) {
      g.wantPlay = true;
      goTo(0);
      return;
    }
    if (state === "error") {
      g.wantPlay = true;
      g.held[g.active] = -1;
      goTo(g.index, el.currentTime);
      return;
    }
    if (el.paused) play();
    else pause();
  }

  function seekTo(seconds: number) {
    const el = activeEl();
    if (!el) return;
    const s = Math.min(Math.max(0, seconds), durationOf(el));
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

  /** Tells the world and the lock screen where playback is. */
  function announce(el: HTMLAudioElement) {
    const duration = durationOf(el);
    document.dispatchEvent(
      new CustomEvent("player:now", { detail: { index: eng.current.index, position: el.currentTime, duration, at: performance.now() } }),
    );
    updateMediaPosition(el.currentTime, duration);
  }

  /** Thirty seconds before the end, the idle element loads the next track in full. */
  function prepareNext(el: HTMLAudioElement) {
    if (!TWO_ELEMENTS) return;
    const g = eng.current;
    const next = nextIndex(g.index, tracks.length);
    if (next === null || durationOf(el) - el.currentTime > PRELOAD_LEAD_S) return;
    const slot = idleSlot();
    const idle = slotEl(slot);
    if (!idle || (g.held[slot] === next && idle.preload === "auto")) return;
    idle.preload = "auto";
    cue(slot, next, 0);
  }

  /** On ended: the next track plays at once, from the idle element when it holds it; the gap is logged for CI. */
  function advance() {
    const g = eng.current;
    const next = nextIndex(g.index, tracks.length);
    if (next === null) {
      finish();
      return;
    }
    g.endedAt = performance.now();
    const slot = idleSlot();
    if (TWO_ELEMENTS && slotEl(slot) && g.held[slot] === next) g.active = slot;
    else cue(g.active, next, 0);
    play();
    setIndex(next);
    showTrack(next, 0);
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

  /**
   * A failed track reloads from where it stopped, three times, then says it could not play. Playback stays wanted, so Next goes on
   * with the show.
   */
  function retry(el: HTMLAudioElement) {
    const g = eng.current;
    clearStall();
    if (g.retries >= RETRIES) {
      setState("error");
      return;
    }
    g.retries += 1;
    setState("stalled");
    const at = Math.floor(el.currentTime);
    const index = g.index;
    g.retryTimer = window.setTimeout(() => {
      if (el !== activeEl() || g.index !== index) return;
      el.src = `${tracks[index].mp3Url}#t=${at}`;
      if (g.wantPlay) play();
    }, RETRY_MS);
  }

  /**
   * With crossOrigin set, a hop that fails the CORS check fails the load outright, before metadata. An element routed into a Web Audio
   * graph sounds only through it, so the fallback never retries that element: it re-mounts it alone without crossOrigin. A failed
   * preload leaves the playing element untouched; a failed playing element picks up on the new one from where it was.
   */
  function fallBack(slot: Slot) {
    const g = eng.current;
    const el = slotEl(slot);
    /* The stats name the error that sent the element to plain stereo. */
    (window.__hill ??= {}).corsFallback = { element: el?.id ?? null, code: el?.error?.code ?? null, message: el?.error?.message ?? "" };
    if (slot === g.active) {
      g.restartAt = activeEl()?.currentTime ?? 0;
      clearStall();
      clearRetry();
    }
    // A functional update, so two failures before the next render both land.
    setCors((c) => corsAfterError(c, slot, false) ?? c);
  }

  const onMedia = useEffectEvent((slot: Slot, ev: Event) => {
    const el = slotEl(slot);
    if (!el) return;
    const g = eng.current;
    const isActive = slot === g.active;
    switch (ev.type) {
      case "loadedmetadata":
      case "durationchange":
        if (ev.type === "loadedmetadata") g.metadata[slot] = true;
        if (isActive) setView((v) => ({ ...v, duration: finiteOr(el.duration, v.duration) }));
        break;
      case "playing":
        if (!isActive) return;
        clearStall();
        g.retries = 0;
        if (g.endedAt) {
          (window.__hill ??= {}).lastGapMs = Math.round(performance.now() - g.endedAt);
          g.endedAt = 0;
        }
        announce(el);
        setState("playing");
        break;
      case "pause":
        if (!isActive || el.ended || g.over) return;
        g.wantPlay = false;
        announce(el);
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
        if (corsAfterError(cors, slot, g.metadata[slot])) {
          fallBack(slot);
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

  /** Sets up an element after it mounts: the world hears about it, and the active one is cued where the queue is. */
  const mount = useEffectEvent((slot: Slot, el: HTMLAudioElement) => {
    const g = eng.current;
    g.held[slot] = -1;
    g.metadata[slot] = false;
    document.dispatchEvent(new CustomEvent("player:element", { detail: { el, cors: cors[slot] } }));
    if (slot !== g.active) return;
    cue(slot, g.index, g.restartAt);
    if (g.wantPlay) play();
  });

  /* Each element gets its listeners when it mounts; a re-mount of one leaves the other, and whatever it is playing, alone. */
  useEffect(() => {
    const g = eng.current;
    ([0, 1] as const).forEach((slot) => {
      const el = slotEl(slot);
      if (!el || el === g.els[slot]) return;
      g.off[slot]?.();
      const listener = (ev: Event) => onMedia(slot, ev);
      for (const type of MEDIA_EVENTS) el.addEventListener(type, listener);
      g.off[slot] = () => {
        for (const type of MEDIA_EVENTS) el.removeEventListener(type, listener);
      };
      g.els[slot] = el;
      mount(slot, el);
    });
  }, [corsA, corsB]);

  /**
   * Keys on window while nothing text-like has focus: Space or K play and pause (the first press starts the show), J and L seek
   * 10 s, N and P change track. Letters act only while single-key shortcuts are on or the world has focus.
   */
  useEventListener<KeyboardEvent>("window", "keydown", (e) => {
    if (keyBelongsToControl(e)) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) toggle();
      return;
    }
    if (!PLAYER_LETTERS.has(e.code) || !lettersActive(e)) return;
    switch (e.code) {
      case "KeyJ":
        seekBy(-SKIP_S);
        break;
      case "KeyL":
        seekBy(SKIP_S);
        break;
      case "KeyK":
        if (!e.repeat) toggle();
        break;
      case "KeyN":
        if (!e.repeat) next();
        break;
      case "KeyP":
        if (!e.repeat) previous();
        break;
    }
  });

  useEventListener<CustomEvent<{ index: number }>>("document", "world:seek", (e) => {
    if (Number.isInteger(e.detail?.index)) goTo(e.detail.index);
  });

  /* Another control can start the show: a player:join dispatched synchronously inside its own activating handler joins, as the first move does. */
  useEventListener("document", "player:join", () => join());

  /* The world says how each element sounds. */
  useEventListener<CustomEvent<{ el: HTMLAudioElement; routing: Routing }>>("document", "world:routing", (e) => {
    const { el, routing } = e.detail;
    setRoutes((m) => (m.get(el) === routing ? m : new Map(m).set(el, routing)));
  });

  /* Tells the world and the HUD the state, and how the active element sounds: pending until the world reports it. A track change can make
     the other element the active one. */
  const publishState = useEffectEvent(() => {
    const el = activeEl();
    const routing = (el ? routes.get(el) : undefined) ?? "pending";
    document.dispatchEvent(new CustomEvent("player:state", { detail: { state, routing } }));
  });
  useEffect(() => {
    publishState();
  }, [state, routes, view.index]);

  useEffect(() => {
    const g = eng.current;
    return () => {
      g.off.forEach((f) => f?.());
      g.off = [null, null];
      g.els = [null, null];
      window.clearTimeout(g.stallTimer);
      window.clearTimeout(g.retryTimer);
      window.clearTimeout(g.noteTimer);
    };
  }, []);

  useFirstMove(() => join(), !joined);
  const playing = state === "playing";
  useWakeLock(playing || state === "stalled");
  useResume(featuredDate, playing, () => {
    const g = eng.current;
    const el = activeEl();
    return g.joined && !g.over && el ? { index: g.index, seconds: el.currentTime } : null;
  });
  useMediaSession(tracks[view.index].title, `${formatDate(showDate)} · ${venue}`, playing, {
    play: () => {
      if (!eng.current.joined || activeEl()?.paused) toggle();
    },
    pause,
    previous,
    next,
    seekTo,
    seekBy,
  });

  const status = note ?? (state === "loading" ? "Starting…" : state === "stalled" ? "Reconnecting…" : over ? `Show over · ${formatDate(showDate)}` : null);
  return (
    <>
      <audio id="show-audio-a" key={corsA ? "a-cors" : "a"} ref={aRef} preload="metadata" playsInline crossOrigin={corsA ? "anonymous" : undefined} />
      <audio id="show-audio-b" key={corsB ? "b-cors" : "b"} ref={bRef} preload="metadata" playsInline crossOrigin={corsB ? "anonymous" : undefined} />
      <Transport
        leanback={leanback}
        title={tracks[view.index].title}
        index={view.index}
        count={tracks.length}
        set={setName(view.index, sets)}
        position={view.position}
        duration={view.duration}
        status={status}
        failed={state === "error"}
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
