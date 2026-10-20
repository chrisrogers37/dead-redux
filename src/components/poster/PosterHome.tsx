"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShowSummary, Source, Track } from "@/lib/types";
import { Display } from "@/components/display/Display";
import type { DisplayParams } from "@/components/display/engine";
import { easeOut, energyOf, hexToRgb, hueAt, makeRandom, mixRgb, seedFromDate, showFraction, type Rgb } from "@/components/display/schedule";
import { StealYourFace } from "@/components/poster/StealYourFace";
import { DancingBears, BearCrossing } from "@/components/poster/DancingBears";
import { FALLBACK_LINEAGE, FALLBACK_TRACKS } from "./fallback-setlist";

interface Props { show: ShowSummary; featuredDate: string; bestSource: Source | null; tourName: string | null; }
type PlayState = "idle" | "playing" | "paused";

const LONG = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", LONG);
function clock(s: number): string {
  const n = Math.max(0, Math.floor(s)); const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : m}:${String(sec).padStart(2, "0")}`;
}

/* The two inks, their equal-luminance pair for the light, and the sheet. */
const ORANGE = hexToRgb("#F2A33A"), TEAL = hexToRgb("#34C4DC"), VIOLET = hexToRgb("#8C4BB8"), SHEET = hexToRgb("#1C1A34"), CREAM = hexToRgb("#F1E9D8");

/* What the print's schedule reads from the player on every frame. */
interface Live { index: number; playing: boolean; position: number; leanback: boolean; }

/* The schedule's own clock. It outlives the engine: the light comes up once and the drop clock keeps running when lean-back mounts its own canvas. */
interface Print {
  seed: number;
  rnd: () => number;
  nextDrop: number;
  dropAt: number;
  dropX: number;
  dropY: number;
  energy: number;
  second: Rgb;
  lastT: number;
  ramped: boolean;
}

function newPrint(seed: number): Print {
  return {
    seed,
    rnd: makeRandom(seed),
    nextDrop: 8.5, // the first drop lands at the end of the entrance
    dropAt: -99,
    dropX: 0.5,
    dropY: 0.5,
    energy: 0.5,
    second: TEAL,
    lastT: 0,
    ramped: false,
  };
}

/* The print's schedule: energy drives the boil of the warp; the registration drifts across each track. */
function stepPrint(st: Print, s: Live, tracks: Track[], t: number, p: DisplayParams): void {
  /* The light comes up once: if the engine restarts (lean-back mounts its own canvas), it is already up. */
  if (t < st.lastT) st.ramped = true;
  st.lastT = t;
  const target = energyOf(tracks, s.index);
  st.energy += (target - st.energy) * 0.004;
  const frac = showFraction(tracks, s.index, s.position);
  st.second = mixRgb(st.second, hueAt([TEAL, VIOLET, TEAL], frac), 0.004);
  p.c0 = ORANGE; p.c1 = st.second; p.c2 = CREAM; p.c3 = SHEET;
  p.energy = st.energy;
  p.shape = 0; p.reveal = 1; p.boil = 0; p.rotate = 0;
  const dur = Math.max(1, tracks[s.index].duration);
  p.reg = 1 + 3 * Math.min(1, s.position / dur); // 1 px at the start of a track, 4 px at its end
  p.alpha = st.ramped ? 0.85 : 0.85 * easeOut((t - 2) / 4); // the light comes up from 2 s to 6 s, once
  if (t >= st.nextDrop) {
    st.dropAt = t; st.dropX = 0.2 + st.rnd() * 0.6; st.dropY = 0.2 + st.rnd() * 0.6;
    st.nextDrop = t + 45 + st.rnd() * 25;
  }
  p.dropX = st.dropX; p.dropY = st.dropY; p.dropAge = t - st.dropAt;
}

interface TransportProps { big: boolean; state: PlayState; onPrev: () => void; onToggle: () => void; onNext: () => void; }

function Transport({ big, state, onPrev, onToggle, onNext }: TransportProps) {
  return (
    <div data-state={state} className="flex items-center justify-center gap-6">
      <button type="button" onClick={onPrev} aria-label="Previous track" className={`${big ? "w-[72px] h-[72px]" : "w-11 h-11"} text-cream flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" width={big ? 32 : 20} height={big ? 32 : 20} fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
      </button>
      <button type="button" data-action="play" onClick={onToggle} aria-label={state === "playing" ? "Pause" : "Play"} className={`${big ? "w-[112px] h-[112px]" : "w-16 h-16"} rounded-full bg-orange text-sheet flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" width={big ? 48 : 28} height={big ? 48 : 28} fill="currentColor" aria-hidden="true"><path d={state === "playing" ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
      </button>
      <button type="button" onClick={onNext} aria-label="Next track" className={`${big ? "w-[72px] h-[72px]" : "w-11 h-11"} text-cream flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" width={big ? 32 : 20} height={big ? 32 : 20} fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
      </button>
    </div>
  );
}

export function PosterHome({ show, featuredDate, bestSource, tourName }: Props) {
  const tracks: Track[] = useMemo(() => {
    const all = bestSource?.sets.flatMap((s) => s.tracks) ?? [];
    return all.length > 0 ? all : FALLBACK_TRACKS;
  }, [bestSource]);
  const lineage = bestSource?.source ?? FALLBACK_LINEAGE;
  const total = tracks.reduce((a, t) => a + t.duration, 0);
  const split = Math.floor(tracks.length * 0.37);
  const [dayPart, yearPart] = longDate(show.date).toUpperCase().split(", "); // "JULY 4" and "1986"

  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PlayState>("idle");
  const [position, setPosition] = useState(0);
  const [leanback, setLeanback] = useState(false);
  const [idle, setIdle] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const startedAt = useRef(0);
  const live = useRef<Live>({ index: 0, playing: false, position: 0, leanback: false });
  const printRef = useRef<Print | null>(null);

  /* The schedule reads the player through a ref; it is brought up to date after each render. */
  useEffect(() => {
    live.current = { index, playing: state === "playing", position, leanback };
  }, [index, state, position, leanback]);

  const goTo = useCallback((i: number) => {
    setIndex(i); setPosition(0); startedAt.current = performance.now(); setStepKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (state !== "playing") return;
    startedAt.current = performance.now() - live.current.position * 1000;
    const id = window.setInterval(() => {
      const p = (performance.now() - startedAt.current) / 1000;
      if (p >= tracks[index].duration) { if (index < tracks.length - 1) goTo(index + 1); else setState("paused"); }
      else setPosition(p);
    }, 250);
    return () => window.clearInterval(id);
  }, [state, index, tracks, goTo]);

  useEffect(() => {
    if (!leanback) return;
    let t8 = 0;
    const arm = () => { setIdle(0); window.clearTimeout(t8); t8 = window.setTimeout(() => setIdle(1), 8000); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLeanback(false); arm(); };
    t8 = window.setTimeout(() => setIdle(1), 8000);
    window.addEventListener("pointermove", arm); window.addEventListener("pointerdown", arm); window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t8); window.removeEventListener("pointermove", arm); window.removeEventListener("pointerdown", arm); window.removeEventListener("keydown", onKey); };
  }, [leanback]);

  const seed = seedFromDate(featuredDate);
  const update = useCallback((t: number, p: DisplayParams) => {
    let st = printRef.current;
    if (st === null || st.seed !== seed) {
      st = newPrint(seed);
      printRef.current = st;
    }
    stepPrint(st, live.current, tracks, t, p);
  }, [seed, tracks]);

  const current = tracks[index];
  const togglePlay = () => setState((s) => (s === "playing" ? "paused" : "playing"));
  const prev = () => goTo(Math.max(0, index - 1));
  const next = () => goTo(Math.min(tracks.length - 1, index + 1));

  return (
    <main data-mode={leanback ? "leanback" : undefined} className="relative min-h-screen">
      {!leanback && (
        <div className="sheet relative mx-auto my-6 max-sm:my-3 w-[880px] max-w-[calc(100vw-24px)] overflow-hidden">
          {/* The light is the paper: one canvas behind the bands; the bands are opaque, the fields are not. */}
          <div className="absolute inset-0 z-0">
            <Display seed={seed} disc={false} internalWidth={320} update={update} className="w-full h-full" />
          </div>
          <div className="relative z-10">
            {/* Band 1 */}
            <div className="bg-band h-12 max-sm:h-10 flex items-center justify-between px-10 max-sm:px-5 pass-2">
              <span className="t-bill text-cream">Dead Redux presents</span>
              <Link href="/archive" prefetch={false} className="t-bill text-cream hover:text-orange">Archive</Link>
            </div>
            {/* Field 1: the emblem printed in the light */}
            <div className="relative h-28 max-sm:h-20 flex items-center justify-center">
              <StealYourFace className="w-40 h-40 max-sm:w-24 max-sm:h-24" />
            </div>
            {/* Band 2: the headline, sheet-coloured on the orange ink */}
            <div className="bg-orange text-sheet px-6 py-6 text-center pass-1">
              <h1 className="t-head"><span className="block">{dayPart}</span><span className="block">{yearPart}</span></h1>
              <p className="t-venue mt-4">{show.venue} · {show.location.replace(", USA", "")}</p>
              <p className="sr-only">Today&rsquo;s show, {longDate(featuredDate)}{tourName && tourName !== "Not Part of a Tour" ? `, ${tourName}` : ""}</p>
            </div>
            {/* Band 3: the transport */}
            <div className="bg-band h-20 flex items-center justify-between px-10 max-sm:px-5 pass-2">
              <span className="t-meta text-cream max-sm:hidden">{clock(position)} / {clock(total)}</span>
              <Transport big={false} state={state} onPrev={prev} onToggle={togglePlay} onNext={next} />
              <button type="button" data-action="lean-back" onClick={() => { setIdle(0); setLeanback(true); }} className="t-bill h-11 px-4 border border-line text-cream">Lean back</button>
            </div>
            {/* Field 2: the bear border */}
            <div className="relative h-28 max-sm:h-20">
              <DancingBears count={12} size={28} stepKey={stepKey} />
            </div>
            {/* Band 4: the small print */}
            <div className="bg-sheet px-10 max-sm:px-5 pt-8 pb-10 pass-2">
              <div className="grid grid-cols-2 gap-x-10 max-sm:grid-cols-1">
                {[tracks.slice(0, split), tracks.slice(split)].map((col, c) => (
                  <ol key={c}>
                    <li className="t-tag text-muted h-8 flex items-center">{c === 0 ? "Set one" : "Set two · encore"}</li>
                    {col.map((tr, j) => {
                      const i = c === 0 ? j : split + j; const cur = i === index;
                      return (
                        <li key={i}>
                          <button type="button" onClick={() => goTo(i)} aria-current={cur ? "true" : undefined}
                            className={`relative w-full h-8 max-sm:h-11 flex items-center gap-3 text-left ${cur ? "text-orange" : "text-cream"}`}>
                            {cur && <span className="absolute -left-4 top-0 bottom-0 w-[3px] bg-orange" aria-hidden="true" />}
                            <span className="w-7 t-meta text-muted">{i + 1}</span>
                            <span className="t-print flex-1 truncate">{tr.title}</span>
                            <span className="t-meta text-muted">{clock(tr.duration)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ))}
              </div>
              <p className="t-tag text-muted mt-8">Liquid light by Dead Redux · Source {lineage}</p>
              <details className="mt-4">
                <summary data-action="details" className="t-meta text-cream cursor-pointer">Details</summary>
                <p className="t-print text-cream mt-2">{bestSource?.description ? bestSource.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "No notes for this source."}</p>
              </details>
              <footer className="mt-6 t-meta text-muted flex flex-wrap gap-x-6 gap-y-2">
                {bestSource && <a href={`https://archive.org/details/${bestSource.upstreamIdentifier}`} target="_blank" rel="noopener noreferrer" className="hover:text-cream">Open on archive.org ↗</a>}
                <a href="https://relisten.net/grateful-dead" target="_blank" rel="noopener noreferrer" className="hover:text-cream">Relisten</a>
                <Link href="/archive" prefetch={false} className="hover:text-cream">Past shows</Link>
              </footer>
            </div>
          </div>
        </div>
      )}

      {leanback && (
        <section data-idle={idle || undefined} className="fixed inset-0 z-10 bg-sheet">
          <div className="absolute inset-0 z-0">
            <Display seed={seed} disc={false} internalWidth={320} update={update} className="w-full h-full" />
          </div>
          {/* Band 2 at the top */}
          <div className="band-top absolute top-0 left-0 right-0 h-[200px] bg-orange text-sheet flex flex-col items-center justify-center z-10">
            <p className="t-bill">Today&rsquo;s show · {longDate(featuredDate)}</p>
            <h1 className="t-head text-[96px] leading-[96px] mt-2">{dayPart}, {yearPart} · {show.venue}</h1>
          </div>
          {/* Band 3 at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-[160px] bg-band z-10 flex items-center justify-between px-16">
            <BearCrossing runKey={stepKey} size={28} />
            <div>
              <p className="text-[48px] leading-[56px] font-head text-cream" style={{ fontVariationSettings: '"opsz" 48, "SOFT" 50' }}>{current.title}</p>
              <p className="t-meta text-cream text-[24px] leading-8 mt-1">{index + 1} of {tracks.length} · {clock(position)} / {clock(current.duration)}</p>
            </div>
            <div className="fades"><Transport big={true} state={state} onPrev={prev} onToggle={togglePlay} onNext={next} /></div>
            <button type="button" onClick={() => setLeanback(false)} className="fades t-bill text-[24px] leading-8 text-cream">Leave · Esc</button>
          </div>
        </section>
      )}
    </main>
  );
}
