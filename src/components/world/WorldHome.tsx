"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DerivedSets, ShowSummary, Source, Track } from "@/lib/types";
import { formatDate, formatDuration, formatRating } from "@/lib/format";
import { flatten } from "@/lib/queue";
import { deriveSets, segueOut } from "@/lib/sets";
import { ShareButtons } from "@/components/ShareButtons";
import { Player, type PlayerState, type Routing } from "@/components/player/Player";
import { keyBelongsToControl, lettersActive, setSingleKey, singleKeyOn, subscribeSingleKey } from "@/components/player/keys";
import { useEventListener } from "@/components/player/useEventListener";
import { firstPersonOn, setFirstPerson, subscribeView } from "./view";

interface Props { show: ShowSummary; featuredDate: string; bestSource: Source | null; isToday: boolean; tourName: string | null; testHooks: boolean; }

function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000;
}

/* A value read once, not watched. */
function subscribe() { return () => {}; }

/* Appends the world's module script to the body. */
function appendWorldModule(): HTMLScriptElement {
  const s = document.createElement("script");
  s.id = "world-module";
  s.type = "module";
  s.src = "/world/main.js";
  document.body.appendChild(s);
  return s;
}

/** A show without a recording is one list. */
const NO_SETS: DerivedSets = { set2Start: null, encoreStart: null };

/* The world module writes its state on #world (loading, ready or fallback) and, by the time it is ready, its quality tier. */
function subscribeWorld(onChange: () => void) {
  const el = document.getElementById("world");
  if (!el) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(el, { attributes: true, attributeFilter: ["data-world"] });
  return () => observer.disconnect();
}
const worldState = () => document.getElementById("world")?.dataset.world ?? "loading";
const worldTier = () => document.getElementById("world")?.dataset.tier ?? null;

interface DetailsProps { source: Source; show: ShowSummary; tracks: Track[]; tourName: string | null; routing: Routing; archiveUrl: string; singleKey: boolean; first: boolean; }

/**
 * What Details holds: the source, the recording's facts, how the sound plays, the single-key and view switches and the archive links.
 * It opens as a panel above the now-plate's stack (it is positioned against the fixed wrapper), so the plate keeps its size and the
 * bears stay in view while it is shut.
 */
function DetailsPanel({ source, show, tracks, tourName, routing, archiveUrl, singleKey, first }: DetailsProps) {
  /* On a phone the panel fits between the top HUD and the now-plate, so it never slides under the icon column. */
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const wrapper = el?.closest(".hud");
    if (!el || !wrapper) return;
    const fit = () => {
      if (!window.matchMedia("(max-width: 639px)").matches) { el.style.maxHeight = ""; return; }
      const hud = Math.max(0, ...Array.from(document.querySelectorAll("[data-hud='top']"), (n) => n.getBoundingClientRect().bottom));
      el.style.maxHeight = `${Math.max(0, Math.floor(wrapper.getBoundingClientRect().top - 8 - (hud + 8)))}px`;
    };
    fit();
    const details = el.closest("details");
    details?.addEventListener("toggle", fit);
    window.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    observer.observe(wrapper);
    return () => { details?.removeEventListener("toggle", fit); window.removeEventListener("resize", fit); observer.disconnect(); };
  }, []);
  const facts: [label: string, value: string | null | undefined][] = [
    ["Taper", source.taper],
    ["Lineage", source.lineage],
    ["Transferrer", source.transferrer],
    ["Source", source.source],
    ["Rating", show.avgRating > 0 ? `${formatRating(show.avgRating)} / 10` : null],
    ["Total time", formatDuration(tracks.reduce((sum, t) => sum + (t.duration || 0), 0))],
    ["Tour", tourName],
  ];
  return (
    <div ref={ref} className="plate absolute right-0 bottom-full mb-2 w-[420px] max-sm:left-0 max-sm:w-auto max-h-[45vh] overflow-y-auto space-y-3">
      <p className="t-row text-ink">
        {source.source && <>{source.source} · </>}{source.numReviews} review{source.numReviews === 1 ? "" : "s"}
      </p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 t-row">
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink wrap-anywhere">{value}</dd>
          </Fragment>
        ))}
        <dt className="text-muted">Sound</dt>
        <dd className="text-ink">{routing === "webaudio" ? "through the world" : "plain stereo"}</dd>
      </dl>
      {/* Single-key shortcuts (off leaves the letter keys to the world while it has focus). */}
      <button type="button" role="switch" aria-checked={singleKey} onClick={() => setSingleKey(!singleKey)} className="t-row text-ink underline hover:text-accent inline-flex items-center min-h-11">
        Single-key shortcuts: {singleKey ? "on" : "off"}
      </button>
      {/* The view: the visitor's bear seen from behind (off), or the walk through its eyes (on); V toggles it too. */}
      <button type="button" role="switch" aria-checked={first} data-action="view" onClick={() => setFirstPerson(!first)} className="t-row text-ink underline hover:text-accent flex w-fit items-center min-h-11">
        First-person view: {first ? "on" : "off"}
      </button>
      <p className="t-row">
        <a href="https://archive.org/details/GratefulDead" target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">
          Recordings stream from the Live Music Archive under the band&rsquo;s non-commercial trading policy
        </a>
      </p>
      <p className="t-row">
        <a href={archiveUrl} target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">Open on archive.org ↗</a>
      </p>
    </div>
  );
}

/* The page: the world's container, the HUD on plates, the hooks, the show as JSON for the world, and the module loader. */
export function WorldHome({ show, featuredDate, bestSource, isToday, tourName, testHooks }: Props) {
  const tracks = useMemo(() => flatten(bestSource), [bestSource]);
  const sets = useMemo(() => (bestSource ? deriveSets(bestSource) : NO_SETS), [bestSource]);
  const data = useMemo(() => JSON.stringify({
    featuredDate,
    showDate: show.date,
    identifier: bestSource?.upstreamIdentifier ?? null,
    venue: show.venue,
    location: show.location,
    seed: seedFromDate(featuredDate),
    set2Start: sets.set2Start,
    encoreStart: sets.encoreStart,
    tracks: tracks.map((t) => ({ title: t.title, duration: t.duration, segueOut: segueOut(t.title) })),
  }), [featuredDate, show, bestSource, tracks, sets]);

  const [leanback, setLeanback] = useState(false);
  const [follow, setFollow] = useState(false);
  /* The player's state, mirrored onto <main>. A show without a recording has no player and stays "error", its sound plain; the player
     starts "idle", its sound pending, and announces its first state before this component's listener exists. */
  const [playerState, setPlayerState] = useState<PlayerState>(tracks.length ? "idle" : "error");
  const [routing, setRouting] = useState<Routing>(tracks.length ? "pending" : "plain");
  const [joined, setJoined] = useState(false);
  const tier = useSyncExternalStore(subscribeWorld, worldTier, () => null);
  const worldStatus = useSyncExternalStore(subscribeWorld, worldState, () => "loading");
  /* The single-key setting, mirrored onto <main> for the world module's keys. */
  const singleKey = useSyncExternalStore(subscribeSingleKey, singleKeyOn, () => true);
  /* The view setting, mirrored onto <main> for the world module. */
  const first = useSyncExternalStore(subscribeView, firstPersonOn, () => false);
  /* Test hooks, on preview deployments only, where the server marks <main data-test-hooks="1">: ?at=<track>&t=<seconds> is where the
     first move starts, ?stats=1 shows window.__hill in the legend plate. */
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const hooks = testHooks ? new URLSearchParams(search) : null;
  const at = hooks?.get("at");
  const startAt = at ? { index: Number(at), seconds: Number(hooks?.get("t")) || 0 } : null;
  const showStats = hooks?.get("stats") === "1";
  const [stats, setStats] = useState<string | null>(null);

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

  /* The player reports its state and the first move. */
  useEventListener<CustomEvent<{ state: PlayerState; routing: Routing }>>("document", "player:state", (e) => {
    setPlayerState(e.detail.state);
    setRouting(e.detail.routing);
  });
  useEventListener("document", "player:start", () => setJoined(true));

  /* The world reports its camera mode; the follow button reads pressed while the camera walks with the bears. */
  useEventListener<CustomEvent<{ mode: string }>>("document", "world:mode", (e) => setFollow(e.detail.mode === "follow"));

  useEffect(() => {
    if (!showStats) return;
    const timer = window.setInterval(() => setStats(JSON.stringify(window.__hill ?? null)), 1000);
    return () => window.clearInterval(timer);
  }, [showStats]);

  useEventListener<KeyboardEvent>("window", "keydown", (e) => {
    if (e.key === "Escape") setLeanback(false);
    else if (e.code === "KeyF" && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) setLeanback((v) => !v);
    else if (e.code === "KeyV" && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) setFirstPerson(!first);
  });

  const hinting = !joined && tracks.length > 0;
  const hint = worldStatus === "loading" ? "Loading the island…" : worldStatus === "fallback" ? "Press play to start the show"
    : tier === "phone" ? "Touch to start the show" : tier === "tv" ? "Press a key to start the show" : "Move to start the show";
  const archiveUrl = bestSource ? `https://archive.org/details/${bestSource.upstreamIdentifier}` : "";
  const relisten = `https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`;

  return (
    <main data-mode={leanback ? "leanback" : undefined} data-state={playerState} data-routing={routing} data-joined={joined ? "true" : undefined} data-single-key={singleKey ? "on" : "off"} data-view={first ? "first" : "third"} data-test-hooks={testHooks ? "1" : undefined} className="world-page relative h-screen">
      <script type="application/json" id="world-data" dangerouslySetInnerHTML={{ __html: data.replace(/</g, "\\u003c") }} />
      <div id="world" data-world="loading" tabIndex={0} role="application"
        aria-label="The island. Walk and turn with the arrow keys or W A S D, and look up and down with T and G; the first move starts the show." />
      <div className="world-fallback" aria-hidden="true">
        <div className="sky" /><div className="ring" /><div className="hill" /><div className="cave l" /><div className="cave r" /><div className="water" />
        <p className="hud plate t-body text-ink" style={{ left: 24, bottom: 24 }}>This world needs WebGL 2 · {formatDate(show.date)} · {show.venue}</p>
      </div>

      {!leanback && (
        <>
          {/* On a phone the plate ends 8 px before the icon column (which starts 64 px from the right edge), so its lines wrap before the column. */}
          <div data-hud="top" className="hud plate left-6 top-6 max-sm:left-3 max-sm:top-3 max-sm:right-[72px]">
            <p className="t-tag text-muted">Dead Redux</p>
            <p className="t-label text-accent mt-1">{isToday ? <>Today&rsquo;s show · {formatDate(featuredDate)}</> : <>Featured {formatDate(featuredDate)}</>}</p>
            <h1 className="t-date text-ink mt-2">{formatDate(show.date)}</h1>
            <p className="t-body text-muted mt-1">{show.venue} · {show.location}</p>
          </div>
          {/* Above the now-plate's stack, so an open Details panel never covers these controls on a short screen. */}
          <div data-hud="top" className="hud right-6 top-6 max-sm:right-3 max-sm:top-3 flex gap-2 max-sm:flex-col max-sm:items-end z-20!">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
            <a href="/archive" aria-label="Archive" className="plate t-row text-muted hover:text-ink h-11 flex items-center">
              <span className="max-sm:hidden">Archive</span>
              <svg className="sm:hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
            </a>
            {/* Asks the player to start the show (nothing once it has), then puts the camera behind the bears. */}
            <button type="button" data-action="follow" aria-pressed={follow} aria-label="Walk with the bears"
              onClick={() => { document.dispatchEvent(new Event("player:join")); document.dispatchEvent(new Event("world:follow")); }}
              className="plate t-body text-ink h-11 flex items-center aria-pressed:shadow-[inset_0_0_0_2px_var(--accent)]">
              <span className="max-sm:hidden">Walk with the bears</span>
              <svg className="sm:hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="15" r="4" /><circle cx="6" cy="9" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="18" cy="9" r="1.5" /></svg>
            </button>
            <button type="button" data-action="lean-back" onClick={() => setLeanback(true)} aria-label="Lean back" className="plate t-body text-ink h-11 flex items-center">
              <span className="max-sm:hidden">Lean back</span>
              <svg className="sm:hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="1" /><path d="M8 21h8" /></svg>
            </button>
            <ShareButtons featuredDate={featuredDate} showDate={show.date} venue={show.venue} location={show.location} isToday={isToday} />
          </div>
        </>
      )}

      {/* The hint waits for the first move: bottom-centre on a desktop, above the pad on a phone. */}
      {hinting && (
        <p role="status" className="hud plate t-row text-ink left-1/2 -translate-x-1/2 bottom-6 max-sm:bottom-[152px] whitespace-nowrap">{hint}</p>
      )}

      {/* Bottom-right on a desktop, so the bears at the trailhead stay in view; full width above the pad on a phone, a plate higher
          while the hint shows. The wrapper and the plate stay mounted in every mode, so the player keeps playing. */}
      <div className={leanback ? "hud left-16 bottom-12" : `hud right-6 bottom-6 flex flex-col items-end gap-2 max-sm:left-3 max-sm:right-3 max-sm:items-stretch ${hinting ? "max-sm:bottom-[212px]" : "max-sm:bottom-[160px]"}`}>
        {!leanback && (
          <div className={`plate t-tag text-muted ${stats ? "" : "max-sm:hidden"}`}>
            <p className="max-sm:hidden">Arrows or WASD to roam, drag to look</p>
            {stats && <p className="text-[13px] leading-4 font-mono normal-case tracking-normal mt-1 max-w-[360px] wrap-anywhere">{stats}</p>}
          </div>
        )}
        <div className={leanback ? "plate" : "plate w-[360px] max-sm:w-auto"}>
          {bestSource && tracks.length > 0 ? (
            <Player tracks={tracks} sets={sets} featuredDate={featuredDate} showDate={show.date} venue={show.venue} archiveUrl={archiveUrl} leanback={leanback} startAt={startAt}>
              <DetailsPanel source={bestSource} show={show} tracks={tracks} tourName={tourName} routing={routing} archiveUrl={archiveUrl} singleKey={singleKey} first={first} />
            </Player>
          ) : (
            <>
              <p className="t-body text-ink">No recording for this show.</p>
              <a href={relisten} target="_blank" rel="noopener noreferrer" className="t-row text-muted underline hover:text-ink">Open on Relisten ↗</a>
            </>
          )}
        </div>
      </div>

      {/* The pad stays mounted in lean-back, only hidden: the world binds its buttons once, when it loads. */}
      <div className={`hud pad left-1/2 -translate-x-1/2 bottom-6 sm:hidden! ${leanback ? "hidden!" : ""}`} aria-label="Walk">
        <button type="button" data-pad="up" aria-label="Walk forward">↑</button>
        <button type="button" data-pad="left" aria-label="Turn left">←</button>
        <button type="button" data-pad="down" aria-label="Walk back">↓</button>
        <button type="button" data-pad="right" aria-label="Turn right">→</button>
      </div>

      {leanback && (
        <button type="button" onClick={() => setLeanback(false)} className="hud plate right-16 top-12 text-[24px] leading-8 text-ink">Leave · Esc</button>
      )}
    </main>
  );
}
