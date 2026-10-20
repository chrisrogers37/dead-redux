"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShowSummary, Source, Track } from "@/lib/types";
import { Display } from "@/components/display/Display";
import type { DisplayParams } from "@/components/display/engine";
import { easeOut, energyOf, hexToRgb, hueAt, makeRandom, mixRgb, seedFromDate, showFraction, type Rgb } from "@/components/display/schedule";
import { StealYourFace } from "@/components/liner/StealYourFace";
import { Bear, DancingBears } from "@/components/liner/DancingBears";
import { FALLBACK_LINEAGE, FALLBACK_TRACKS } from "./fallback-setlist";

interface Props {
  show: ShowSummary;
  featuredDate: string;
  bestSource: Source | null;
  tourName: string | null;
}

type PlayState = "idle" | "playing" | "paused";

const LONG = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", LONG);
}
function clock(s: number): string {
  const n = Math.max(0, Math.floor(s));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/* The lamp's three hues, one per third of the show, and their darker siblings. */
const GOLD = hexToRgb("#D4A056"), ROSE = hexToRgb("#D4607A"), LAVENDER = hexToRgb("#9A80C0");
const PAGE = hexToRgb("#1A1613");

/* Where the player stands, as the lamp reads it each frame. */
interface Live {
  index: number;
  playing: boolean;
  position: number;
  leanback: boolean;
}

/* What the lamp carries from frame to frame: the blended energy and hue, the centre's drift and the drop clock. */
interface LampState {
  seed: number;
  tracks: Track[];
  rnd: () => number;
  nextDrop: number;
  dropAt: number;
  dropX: number;
  dropY: number;
  energy: number;
  hue: Rgb;
  centre: number;
  lastT: number;
  ramped: boolean;
}

function newLamp(seed: number, tracks: Track[]): LampState {
  const rnd = makeRandom(seed);
  return {
    seed,
    tracks,
    rnd,
    nextDrop: 60 + rnd() * 30,
    dropAt: -99,
    dropX: 0.5,
    dropY: 0.5,
    energy: 0.5,
    hue: GOLD,
    centre: 0,
    lastT: 0,
    ramped: false,
  };
}

export function LinerNotesHome({ show, featuredDate, bestSource, tourName }: Props) {
  const tracks: Track[] = useMemo(() => {
    const all = bestSource?.sets.flatMap((s) => s.tracks) ?? [];
    return all.length > 0 ? all : FALLBACK_TRACKS;
  }, [bestSource]);
  const lineage = bestSource?.source ?? FALLBACK_LINEAGE;
  const total = tracks.reduce((a, t) => a + t.duration, 0);
  const split = Math.floor(tracks.length * 0.37); // first column: the first set's share of a two-set show

  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PlayState>("idle");
  const [position, setPosition] = useState(0);
  const [leanback, setLeanback] = useState(false);
  const [idle, setIdle] = useState(0);
  const [walking, setWalking] = useState(false);
  const [paradeKey, setParadeKey] = useState(0);
  const startedAt = useRef(0);
  const live = useRef<Live>({ index: 0, playing: false, position: 0, leanback: false });
  const lamp = useRef<LampState | null>(null);

  /* The lamp and the clock read the player's place from a ref, so a new track or a second of play never restarts them. */
  useEffect(() => {
    live.current = { index, playing: state === "playing", position, leanback };
  }, [index, state, position, leanback]);

  const goTo = useCallback((i: number) => {
    setIndex(i);
    setPosition(0);
    startedAt.current = performance.now();
    setWalking(true);
    window.setTimeout(() => setWalking(false), 1000);
    setParadeKey((k) => k + 1);
  }, []);

  /* The mock clock: position advances in real time while playing; no audio. */
  useEffect(() => {
    if (state !== "playing") return;
    startedAt.current = performance.now() - live.current.position * 1000;
    const id = window.setInterval(() => {
      const p = (performance.now() - startedAt.current) / 1000;
      if (p >= tracks[index].duration) {
        if (index < tracks.length - 1) goTo(index + 1); else setState("paused");
      } else setPosition(p);
    }, 250);
    return () => window.clearInterval(id);
  }, [state, index, tracks, goTo]);

  /* Lean-back idle: 8 s dims the controls, 60 s leaves only the date, the title and the light. */
  useEffect(() => {
    if (!leanback) return;
    let t8 = 0;
    let t60 = 0;
    const schedule = () => {
      window.clearTimeout(t8); window.clearTimeout(t60);
      t8 = window.setTimeout(() => setIdle(1), 8000);
      t60 = window.setTimeout(() => setIdle(2), 60000);
    };
    const onInput = () => { setIdle(0); schedule(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLeanback(false); onInput(); };
    schedule();
    window.addEventListener("pointermove", onInput);
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t8); window.clearTimeout(t60);
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onKey);
    };
  }, [leanback]);

  /* The lamp's schedule. */
  const seed = seedFromDate(featuredDate);
  const update = useCallback((t: number, p: DisplayParams) => {
    const s = live.current;
    let st = lamp.current;
    if (st === null || st.seed !== seed || st.tracks !== tracks) {
      st = newLamp(seed, tracks);
      lamp.current = st;
    }
    const cap = s.leanback ? 0.55 : 0.25;
    /* The warm-up happens once: if the engine restarts (the clock goes back to 0), the lamp is already warm. */
    if (t < st.lastT) st.ramped = true;
    st.lastT = t;
    const target = energyOf(tracks, s.index);
    st.energy += (target - st.energy) * 0.004; // an 8-second blend at 30 fps
    const frac = showFraction(tracks, s.index, s.position);
    const h = hueAt([GOLD, ROSE, LAVENDER], frac);
    st.hue = mixRgb(st.hue, h, 0.004);
    p.c0 = st.hue;
    p.c1 = mixRgb(st.hue, PAGE, 0.45);
    p.c2 = mixRgb(st.hue, PAGE, 0.7);
    p.c3 = PAGE;
    p.energy = st.energy;
    p.shape = s.leanback ? 0 : 2;
    p.reveal = 1;
    p.reg = 0;
    p.boil = 0;
    p.rotate = 0;
    /* The lamp drifts to a new centre each track: a slow spiral, one point per track. */
    const want = (s.index % 19) * 0.33;
    st.centre += (want - st.centre) * 0.004;
    p.rotate = st.centre;
    /* Entrance: the lamp warms over 6 s, then breathes ±0.04 on a 12-s period. */
    const warm = st.ramped ? 1 : easeOut(t / 6);
    p.alpha = cap * warm + 0.04 * Math.sin((t / 12) * Math.PI * 2) * warm;
    if (t >= st.nextDrop) {
      st.dropAt = t; st.dropX = 0.3 + st.rnd() * 0.4; st.dropY = 0.3 + st.rnd() * 0.4;
      st.nextDrop = t + 60 + st.rnd() * 30;
    }
    p.dropX = st.dropX; p.dropY = st.dropY; p.dropAge = t - st.dropAt;
  }, [seed, tracks]);

  const current = tracks[index];
  const togglePlay = () => setState((s) => (s === "playing" ? "paused" : "playing"));
  const prev = () => goTo(Math.max(0, index - 1));
  const next = () => goTo(Math.min(tracks.length - 1, index + 1));
  const enterLeanback = () => { setIdle(0); setLeanback(true); };
  const leaveLeanback = () => { setLeanback(false); setIdle(0); };

  return (
    <main data-mode={leanback ? "leanback" : undefined} className="relative min-h-screen overflow-hidden">
      {/* The lamp: a disc behind the headline on the page, the whole screen in lean-back. */}
      <div className={leanback ? "fixed inset-0 z-0" : "absolute z-0 w-[720px] h-[720px] max-sm:w-[480px] max-sm:h-[480px] left-1/2 -translate-x-1/2 top-[-60px] max-sm:top-[-60px]"}>
        <Display seed={seed} disc={false} internalWidth={320} update={update} className="w-full h-full" />
      </div>

      {!leanback && (
        <div className="relative z-10 mx-auto w-full max-w-[880px] px-4 pb-16">
          <header className="flex items-center justify-between pt-8">
            <span className="t-eyebrow text-muted">Dead Redux</span>
            <Link href="/archive" prefetch={false} className="t-meta text-muted hover:text-ink">Archive</Link>
          </header>

          <section className="pt-16 max-sm:pt-10">
            <p className="t-eyebrow text-accent rise" style={{ "--i": 0 } as React.CSSProperties}>Today&rsquo;s show · {longDate(featuredDate)}</p>
            <h1 className="t-date text-ink mt-2 rise" style={{ "--i": 1 } as React.CSSProperties}>{longDate(show.date)}</h1>
            <h2 className="t-venue text-ink mt-4 rise" style={{ "--i": 2 } as React.CSSProperties}>{show.venue}</h2>
            <p className="t-body text-muted mt-1 rise" style={{ "--i": 3 } as React.CSSProperties}>
              {show.location}{tourName && tourName !== "Not Part of a Tour" ? ` · ${tourName}` : ""}
            </p>
          </section>

          {/* Transport. */}
          <div data-state={state} className="mt-8 flex items-center gap-4 max-sm:justify-center rise" style={{ "--i": 10 } as React.CSSProperties}>
            <button type="button" onClick={prev} aria-label="Previous track" className="w-11 h-11 text-ink">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
            </button>
            <button type="button" data-action="play" onClick={togglePlay} aria-label={state === "playing" ? "Pause" : "Play"} className="w-14 h-14 rounded-full bg-accent text-page flex items-center justify-center">
              {state === "playing" ? (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button type="button" onClick={next} aria-label="Next track" className="w-11 h-11 text-ink">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
            </button>
            <span className="t-meta text-muted ml-2 max-sm:hidden">{clock(position)} / {clock(total)}</span>
            <button type="button" data-action="lean-back" onClick={enterLeanback} className="ml-auto h-11 px-4 t-body text-ink border border-line rounded max-sm:ml-0">
              Lean back
            </button>
          </div>
          <p className="t-meta text-muted mt-2 text-center sm:hidden">{clock(position)} / {clock(total)}</p>

          {/* The card: the setlist is the artwork. */}
          <section className="relative mt-10 border border-line p-6 max-sm:p-4">
            <StealYourFace className="absolute left-1/2 top-24 -translate-x-1/2 w-[420px] h-[420px] max-sm:w-[260px] max-sm:h-[260px] text-ink opacity-[0.08]" />
            <div className="relative grid grid-cols-2 gap-x-8 max-sm:grid-cols-1">
              {[tracks.slice(0, split), tracks.slice(split)].map((col, c) => (
                <ol key={c} className="relative">
                  {c === 1 && <li className="t-tag text-muted h-8 flex items-center sm:hidden">Set 2</li>}
                  {col.map((tr, j) => {
                    const i = c === 0 ? j : split + j;
                    const isCurrent = i === index;
                    return (
                      <li key={i} className="ruled" style={{ "--i": i } as React.CSSProperties}>
                        <button type="button" onClick={() => goTo(i)} aria-current={isCurrent ? "true" : undefined}
                          className={`relative w-full h-8 max-sm:h-11 flex items-center gap-3 text-left ${isCurrent ? "text-ink" : "text-ink"}`}>
                          {isCurrent && <span className="absolute -left-6 max-sm:-left-4 top-0 bottom-0 w-[3px] bg-accent" aria-hidden="true" />}
                          <span className="w-8 t-tag text-muted">{isCurrent ? "" : String(i + 1).padStart(2, "0")}</span>
                          <span className="t-body flex-1 truncate max-sm:whitespace-normal max-sm:line-clamp-2 max-sm:text-[14px] max-sm:leading-5">{tr.title}</span>
                          <span className="t-meta text-muted">{clock(tr.duration)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ))}
              {/* The bear stands in the current row's number column; it walks in at 7 s and walks to the next row at a track change. */}
              <Bear color="#D4A843" size={24} className={`absolute entering ${walking ? "walking" : ""}`}
                style={{ left: index < split ? 0 : "calc(50% + 16px)", top: (index < split ? index : index - split) * 32 + 2 }} />
            </div>
            <p className="t-tag text-muted mt-6 normal-case tracking-normal">
              {lineage}{bestSource ? ` · ${bestSource.numReviews} reviews · ${bestSource.avgRating.toFixed(1)}` : ""}
            </p>
            {bestSource && (
              <a href={`https://archive.org/details/${bestSource.upstreamIdentifier}`} target="_blank" rel="noopener noreferrer" className="t-meta text-muted underline mt-2 inline-block">
                Open on archive.org ↗
              </a>
            )}
          </section>

          <details className="mt-6">
            <summary data-action="details" className="t-meta text-muted cursor-pointer">Details</summary>
            <p className="t-body text-ink mt-2">
              {bestSource?.description ? bestSource.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "No notes for this source."}
            </p>
          </details>

          <footer className="mt-10 t-meta text-muted flex flex-wrap gap-x-6 gap-y-2">
            <a href="https://relisten.net/grateful-dead" target="_blank" rel="noopener noreferrer" className="hover:text-ink">Relisten</a>
            <a href="https://archive.org/details/GratefulDead" target="_blank" rel="noopener noreferrer" className="hover:text-ink">Archive.org</a>
            <Link href="/archive" prefetch={false} className="hover:text-ink">Past shows</Link>
          </footer>
        </div>
      )}

      {leanback && (
        <section data-idle={idle || undefined} className="fixed inset-0 z-10 flex flex-col items-center justify-center pb-16 text-ink">
          <StealYourFace className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vmin] h-[60vmin] text-ink opacity-10" />
          <button type="button" onClick={leaveLeanback} className="fades absolute top-6 right-8 text-[24px] leading-8 font-mono">Leave · Esc</button>
          <p className="t-eyebrow text-[24px] leading-8 fades-late">Today&rsquo;s show · {longDate(featuredDate)}</p>
          <h1 className="t-date text-[120px] leading-[120px] mt-2">{longDate(show.date)}</h1>
          <p className="text-[32px] leading-10 font-serif mt-2 fades-late">{show.venue} · {show.location}</p>
          <p className="text-[48px] leading-[56px] font-mono font-medium mt-8">{current.title}</p>
          {/* The queue: five titles centred on now; dimmed titles sit on page-coloured chips. */}
          <ol className="mt-4 flex gap-6 fades-late">
            {[-2, -1, 0, 1, 2].map((d) => {
              const i = index + d;
              const tr = tracks[i];
              return (
                <li key={d} className={`text-[24px] leading-8 font-mono px-2 py-1 rounded bg-page ${d === 0 ? "" : "opacity-60"} ${tr ? "" : "invisible"}`}>
                  {tr ? tr.title : "\u00a0"}
                </li>
              );
            })}
          </ol>
          <div data-state={state} className="fades mt-10 flex items-center gap-10">
            <button type="button" onClick={prev} aria-label="Previous track" className="w-[72px] h-[72px] rounded-full bg-page flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
            </button>
            <button type="button" data-action="play" onClick={togglePlay} aria-label={state === "playing" ? "Pause" : "Play"} className="w-[112px] h-[112px] rounded-full bg-accent text-page flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true"><path d={state === "playing" ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
            </button>
            <button type="button" onClick={next} aria-label="Next track" className="w-[72px] h-[72px] rounded-full bg-page flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
            </button>
          </div>
          <div className="fades mt-6 w-[960px] max-w-[calc(100vw-32px)] h-10 flex items-center gap-4 font-mono text-[24px] leading-8">
            <span>{clock(position)}</span>
            <div className="flex-1 h-2 bg-row rounded"><div className="h-2 bg-accent rounded" style={{ width: `${(100 * position) / Math.max(1, current.duration)}%` }} /></div>
            <span>{clock(current.duration)}</span>
          </div>
          <DancingBears runKey={paradeKey} seconds={68} />
        </section>
      )}
    </main>
  );
}
