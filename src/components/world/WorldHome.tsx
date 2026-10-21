"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ShowSummary, Source, Track } from "@/lib/types";
import { ShareButtons } from "@/components/ShareButtons";
import { ShowPlayer } from "@/components/ShowPlayer";

interface Props { show: ShowSummary; featuredDate: string; bestSource: Source | null; isToday: boolean; }

const LONG = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } as const;
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", LONG);
function clock(s: number): string {
  const n = Math.max(0, Math.floor(s)); const m = Math.floor(n / 60), sec = n % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000;
}

/* Whether the screen is phone-sized is read, not watched: turning a phone does not refold the player. */
function subscribe() { return () => {}; }

/* Appends the world's module script to the body. */
function appendWorldModule(): HTMLScriptElement {
  const s = document.createElement("script");
  s.id = "world-module";
  s.type = "module";
  s.src = "/world/world.js";
  document.body.appendChild(s);
  return s;
}

/* The page: the world's container, the HUD on plates, the hooks, the show as JSON for the world, and the module loader. */
export function WorldHome({ show, featuredDate, bestSource, isToday }: Props) {
  const tracks: Track[] = useMemo(() => bestSource?.sets.flatMap((s) => s.tracks) ?? [], [bestSource]);
  const data = useMemo(() => JSON.stringify({
    featuredDate,
    showDate: show.date,
    venue: show.venue,
    location: show.location,
    seed: seedFromDate(featuredDate),
    tracks: tracks.map((t) => ({ title: t.title, duration: t.duration })),
  }), [featuredDate, show, tracks]);

  const [leanback, setLeanback] = useState(false);
  const [now, setNow] = useState({ index: 0, position: 0 });
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 639px)").matches, () => false);

  /* Load the world once. A plain script element keeps the module out of the bundler. If the script errors,
     or the world is not ready within 10 s, the designed still shows instead. */
  useEffect(() => {
    const world = document.getElementById("world");
    const giveUp = () => { if (world && world.dataset.world !== "ready") world.dataset.world = "fallback"; };
    const timer = window.setTimeout(giveUp, 10000);
    const script = document.getElementById("world-module") ?? appendWorldModule();
    script.addEventListener("error", giveUp);
    return () => { window.clearTimeout(timer); script.removeEventListener("error", giveUp); };
  }, []);

  /* The world owns the show clock and reports it. */
  useEffect(() => {
    const onNow = (e: Event) => {
      const d = (e as CustomEvent<{ index: number; position: number }>).detail;
      setNow({ index: d.index, position: d.position });
    };
    document.addEventListener("world:now", onNow);
    return () => document.removeEventListener("world:now", onNow);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLeanback(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current: Track | undefined = tracks[Math.min(now.index, tracks.length - 1)];
  const relisten = `https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`;

  return (
    <main data-mode={leanback ? "leanback" : undefined} data-state="idle" className="world-page relative h-screen">
      <script type="application/json" id="world-data" dangerouslySetInnerHTML={{ __html: data.replace(/</g, "\\u003c") }} />
      <div id="world" data-world="loading" tabIndex={0} role="application"
        aria-label="The island. Click to take the controls, then use the arrow keys or W A S D to walk and turn." />
      <div className="world-fallback" aria-hidden="true">
        <div className="sky" /><div className="ring" /><div className="hill" /><div className="cave l" /><div className="cave r" /><div className="water" />
        <p className="hud plate t-body text-ink" style={{ left: 24, bottom: 24 }}>This world needs WebGL 2 · {longDate(show.date)} · {show.venue}</p>
      </div>

      {!leanback && (
        <>
          <div className="hud plate left-6 top-6 max-sm:left-3 max-sm:top-3">
            <p className="t-tag text-muted">Dead Redux</p>
            <p className="t-label text-accent mt-1">{isToday ? <>Today&rsquo;s show · {longDate(featuredDate)}</> : <>Featured {longDate(featuredDate)}</>}</p>
            <h1 className="t-date text-ink mt-2">{longDate(show.date)}</h1>
            <p className="t-body text-muted mt-1">{show.venue} · {show.location}</p>
          </div>
          <div className="hud right-6 top-6 max-sm:right-3 max-sm:top-3 flex gap-2 max-sm:flex-col max-sm:items-end">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
            <a href="/archive" className="plate t-row text-muted hover:text-ink h-11 flex items-center max-sm:hidden">Archive</a>
            <button type="button" data-action="lean-back" onClick={() => setLeanback(true)} aria-label="Lean back" className="plate t-body text-ink h-11 flex items-center">
              <span className="max-sm:hidden">Lean back</span>
              <svg className="sm:hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="1" /><path d="M8 21h8" /></svg>
            </button>
            <ShareButtons featuredDate={featuredDate} showDate={show.date} venue={show.venue} location={show.location} isToday={isToday} />
          </div>
        </>
      )}

      {/* The now-plate stays mounted in lean-back, hidden, so the player keeps playing. */}
      <div className={`hud plate left-6 bottom-6 max-sm:left-3 max-sm:bottom-[160px] max-sm:right-3 ${leanback ? "invisible" : ""}`}>
        {current && (
          <>
            <p className="t-tag text-muted">Now · {now.index + 1} of {tracks.length} · {clock(now.position)} / {clock(current.duration)}</p>
            <p className="t-now text-ink mt-1">{current.title}</p>
          </>
        )}
        {bestSource ? (
          <>
            {/* A phone starts with the player folded, so the island and the bears stay in view above the pad; larger screens start with it open. */}
            <details open={!phone} className="mt-3">
              <summary className="t-row text-muted cursor-pointer">Player</summary>
              <div className="mt-2 w-[420px] max-sm:w-auto"><ShowPlayer archiveId={bestSource.upstreamIdentifier} /></div>
            </details>
            <details className="mt-3">
              <summary data-action="details" className="t-row text-muted cursor-pointer">Details</summary>
              <p className="t-row text-ink mt-2 max-w-[420px]">
                {bestSource.source && <>{bestSource.source} · </>}{bestSource.numReviews} review{bestSource.numReviews === 1 ? "" : "s"}
              </p>
            </details>
          </>
        ) : (
          <>
            <p className="t-body text-ink">No recording for this show.</p>
            <a href={relisten} target="_blank" rel="noopener noreferrer" className="t-row text-muted underline hover:text-ink">Open on Relisten ↗</a>
          </>
        )}
      </div>

      {!leanback && (
        <>
          <p className="hud plate right-6 bottom-6 t-tag text-muted max-sm:hidden">Click the world, then arrows or WASD to roam</p>
          <div className="hud pad left-1/2 -translate-x-1/2 bottom-6 sm:hidden!" aria-label="Walk">
            <button type="button" data-pad="up" aria-label="Walk forward">↑</button>
            <button type="button" data-pad="left" aria-label="Turn left">←</button>
            <button type="button" data-pad="down" aria-label="Walk back">↓</button>
            <button type="button" data-pad="right" aria-label="Turn right">→</button>
          </div>
        </>
      )}

      {leanback && (
        <>
          <div className="hud plate left-16 bottom-12">
            <p className="text-[40px] leading-[48px] font-medium text-ink">{current?.title ?? show.venue}</p>
            <p className="text-[24px] leading-8 font-mono text-muted mt-1">
              {current ? <>{now.index + 1} of {tracks.length} · {clock(now.position)} / {clock(current.duration)}</> : longDate(show.date)}
            </p>
          </div>
          <button type="button" onClick={() => setLeanback(false)} className="hud plate right-16 top-12 text-[24px] leading-8 text-ink">Leave · Esc</button>
        </>
      )}
    </main>
  );
}
