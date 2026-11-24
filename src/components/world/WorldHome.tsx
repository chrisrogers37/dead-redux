"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DerivedSets, ShowSummary, Source, Track } from "@/lib/types";
import { formatDate, formatDuration, formatRating } from "@/lib/format";
import { flatten } from "@/lib/queue";
import { deriveSets } from "@/lib/sets";
import { ShareButtons } from "@/components/ShareButtons";
import { Player, type PlayerState, type Routing } from "@/components/player/Player";
import { keyBelongsToControl, lettersActive, setSingleKey, singleKeyOn, subscribeSingleKey } from "@/components/player/keys";
import { useEventListener } from "@/components/player/useEventListener";
import { worldData } from "./data";
import { firstPersonOn, setFirstPerson, subscribeView } from "./view";
import { isAway, matchShelvesCookie, setShelf, shelvesAway, subscribeShelves, type Shelf } from "./shelves";
import { NoRecording } from "./NoRecording";
import { soundLabel } from "@/lib/sound";
import { createRide, eachSecond, idleMs, RIDE_NAME, sleepLabel, sleepLeft, sleepUnitMs, type Ride } from "./ride";
import { NextChip, useNextShow, type PastPick } from "./NextShow";

interface Props { show: ShowSummary; featuredDate: string; today: string; renderedAt: number; pastPick: PastPick | null; bestSource: Source | null; isToday: boolean; tourName: string | null; testHooks: boolean; lookupFailed: boolean; shelves: string; }

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

interface DetailsProps { source: Source; show: ShowSummary; tracks: Track[]; tourName: string | null; routing: Routing; world: string; archiveUrl: string; singleKey: boolean; first: boolean; }

/**
 * What Details holds: the source, the recording's facts, how the sound plays, the single-key and view switches and the archive links.
 * It opens as a panel above the now-plate's stack (it is positioned against the stack, the shelf's body, so it hangs from the plate's
 * edge and not from the shelf's tab beside it), so the plate keeps its size and the bears stay in view while it is shut.
 */
function DetailsPanel({ source, show, tracks, tourName, routing, world, archiveUrl, singleKey, first }: DetailsProps) {
  /* The panel fits between the now-plate's stack and the top plates above it, at every width, so it never slides under them. Only the
     plates it would run into count: on a phone both, on a wider screen the top-right row. A plate's tab counts with it, wherever it
     hangs, and of a plate put away on its shelf only the tab is left to count. The top plates change size too, as when a ride adds
     its row to them, so the panel is fitted again whenever one does. */
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const wrapper = el?.closest(".hud");
    if (!el || !wrapper) return;
    const fit = () => {
      const { left, right } = el.getBoundingClientRect();
      const above = Array.from(document.querySelectorAll("[data-hud='top'][data-shelf='out'], [data-hud='top']:not([data-shelf]), [data-hud='top'] > [data-shelf-tab]"), (n) => n.getBoundingClientRect())
        .filter((r) => r.left < right && r.right > left);
      const hud = Math.max(0, ...above.map((r) => r.bottom));
      el.style.maxHeight = `${Math.max(0, Math.floor(wrapper.getBoundingClientRect().top - 8 - (hud + 8)))}px`;
    };
    fit();
    const details = el.closest("details");
    details?.addEventListener("toggle", fit);
    window.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    observer.observe(wrapper);
    for (const top of document.querySelectorAll("[data-hud='top']")) observer.observe(top);
    return () => { details?.removeEventListener("toggle", fit); window.removeEventListener("resize", fit); observer.disconnect(); };
  }, []);
  const reviews = `${source.numReviews} review${source.numReviews === 1 ? "" : "s"}`;
  const facts: [label: string, value: string | null | undefined][] = [
    ["Taper", source.taper],
    ["Lineage", source.lineage],
    ["Transferrer", source.transferrer],
    ["Source", source.source],
    ["Rating", show.avgRating > 0 ? `${formatRating(show.avgRating)} / 10 · ${reviews}` : reviews],
    ["Total time", formatDuration(tracks.reduce((sum, t) => sum + (t.duration || 0), 0))],
    ["Tour", tourName],
  ];
  return (
    <div ref={ref} className="plate absolute right-0 bottom-full mb-2 w-[420px] max-sm:left-0 max-sm:w-auto overflow-y-auto space-y-3">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 t-row">
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink wrap-anywhere">{value}</dd>
          </Fragment>
        ))}
        <dt className="text-muted">Sound</dt>
        <dd className="text-ink">{soundLabel(routing, world)}</dd>
      </dl>
      {/* Single-key shortcuts (off leaves the letter keys to the world while it has focus). */}
      <button type="button" role="switch" aria-checked={singleKey} onClick={() => setSingleKey(!singleKey)} className="t-row text-ink underline hover:text-accent inline-flex items-center min-h-11">
        Single-key shortcuts: {singleKey ? "on" : "off"}
      </button>
      {/* The view: the visitor's bear seen from behind (off), or the walk through its eyes (on); V toggles it too. The still has no view. */}
      {world !== "fallback" && (
        <button type="button" role="switch" aria-checked={first} data-action="view" onClick={() => setFirstPerson(!first)} className="t-row text-ink underline hover:text-accent flex w-fit items-center min-h-11">
          First-person view: {first ? "on" : "off"}
        </button>
      )}
      {/* The two links grow into the 12 px between the panel's rows (space-y-3), which the same negative margin gives back: each is at
          least 44 px tall, and nothing around it moves. */}
      <p className="t-row">
        <a href="https://archive.org/details/GratefulDead" target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink inline-flex py-3 -my-3">
          Recordings stream from the Live Music Archive under the band&rsquo;s non-commercial trading policy
        </a>
      </p>
      <p className="t-row">
        <a href={archiveUrl} target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink inline-flex py-3 -my-3">Open on archive.org ↗</a>
      </p>
    </div>
  );
}

/* The id of a shelf's body, which its tab names as what it controls. */
const shelfId = (shelf: Shelf) => `shelf-${shelf}`;

/* A shelf's tab: it stays at its edge of the screen, puts its shelf away past that edge and brings it back. The chevron points the
   way the shelf will go (the stylesheet turns it). Its label names the shelf and never changes: aria-expanded says whether the shelf
   is out, so a reader hears the state once. */
function ShelfTab({ shelf, side, label, away, className = "" }: { shelf: Shelf; side: "left" | "right"; label: string; away: boolean; className?: string }) {
  return (
    <button type="button" data-action="shelf" data-shelf-tab={shelf} data-side={side} aria-expanded={!away} aria-controls={shelfId(shelf)} aria-label={label}
      onClick={() => setShelf(shelf, !away)} className={`plate shelf-tab h-11 w-11 shrink-0 flex items-center justify-center text-muted hover:text-ink ${className}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
    </button>
  );
}

/* A plate that is a button with a line of text, and a row of them, which on a phone is a column at the screen's right edge. */
const PLATE_BUTTON = "plate t-body text-ink h-11 flex items-center";
const PLATE_ROW = "flex gap-2 max-sm:flex-col max-sm:items-end";

/* The ride's own two buttons, on the page for as long as the visitor rides: the sleep timer, which reads the time left, and Leave.
   Awake they are a row under the page's buttons. Settled they are the settled look's top-right corner, in its larger type, side by
   side, or stacked on a phone as the top icons are, so a settled visitor reaches both without waking the page. The timer is the
   ride's (ride.ts), not theirs, so it runs on through both looks. The time left is read from the clock once a second while the
   timer runs. */
const CORNER_BUTTON = "plate text-[24px] leading-8 text-ink";
function RideRow({ ride, sleepEndsAt, unit, settled }: { ride: Ride; sleepEndsAt: number | null; unit: number; settled: boolean }) {
  const left = useSyncExternalStore(sleepEndsAt === null ? subscribe : eachSecond, () => sleepLeft(sleepEndsAt, unit, Date.now()), () => null);
  const button = settled ? CORNER_BUTTON : `${PLATE_BUTTON} whitespace-nowrap`;
  return (
    <div className={settled ? `hud right-16 top-12 ${PLATE_ROW}` : PLATE_ROW}>
      <button type="button" data-action="sleep" onClick={ride.pressSleep} className={button}>{sleepLabel(left, unit)}</button>
      <button type="button" data-action="leave" onClick={ride.leave} className={button}>Leave · Esc</button>
    </div>
  );
}

/* The page: the world's container, the HUD on plates, the hooks, the show as JSON for the world, and the module loader. */
export function WorldHome({ show, featuredDate, today, renderedAt, pastPick, bestSource, isToday, tourName, testHooks, lookupFailed, shelves }: Props) {
  const tracks = useMemo(() => flatten(bestSource), [bestSource]);
  const sets = useMemo(() => (bestSource ? deriveSets(bestSource) : NO_SETS), [bestSource]);
  const data = useMemo(() => JSON.stringify(worldData(featuredDate, show, bestSource, tracks, sets)), [featuredDate, show, bestSource, tracks, sets]);

  /* The ride (ride.ts): whether the visitor rides with the bears, whether the page has settled since they last touched it, and when
     the ride's sleep timer ends. */
  const [ride] = useState(createRide);
  const { riding, settled, sleepEndsAt } = useSyncExternalStore(ride.subscribe, ride.state, ride.state);
  /* The last track has ended, as the player reports it. */
  const [over, setOver] = useState(false);
  /* The player's state, mirrored onto <main>. A show without a recording has no player and stays "error", its sound plain; the player
     starts "idle", its sound pending, and announces its first state before this component's listener exists. */
  const [playerState, setPlayerState] = useState<PlayerState>(tracks.length ? "idle" : "error");
  const [routing, setRouting] = useState<Routing>(tracks.length ? "pending" : "plain");
  const [joined, setJoined] = useState(false);
  const tier = useSyncExternalStore(subscribeWorld, worldTier, () => null);
  const worldStatus = useSyncExternalStore(subscribeWorld, worldState, () => "loading");
  /* The still: no world loaded, so nothing that walks or looks is shown. */
  const fallback = worldStatus === "fallback";
  /* The single-key setting, mirrored onto <main> for the world module's keys. */
  const singleKey = useSyncExternalStore(subscribeSingleKey, singleKeyOn, () => true);
  /* The view setting, mirrored onto <main> for the world module. */
  const first = useSyncExternalStore(subscribeView, firstPersonOn, () => false);
  /* The shelves put away (shelves.ts), mirrored onto <main>: on a phone the world's camera frames the visitor's bear above the
     now-plate only while the plate is out. The server renders the ones the request's cookie names (`shelves`), so a shelf put away is
     away in the page's first paint and never slides off after it; where this browser's storage says otherwise, storage wins and the
     cookie is rewritten to match. */
  const away = useSyncExternalStore(subscribeShelves, shelvesAway, () => shelves);
  useEffect(() => matchShelvesCookie(shelves), [shelves]);
  const titleAway = isAway(away, "title"), actionsAway = isAway(away, "actions"), playerAway = isAway(away, "player");
  /* Test hooks, on preview deployments only, where the server marks <main data-test-hooks="1">: ?at=<track>&t=<seconds> is where the
     first move starts, ?stats=1 shows window.__hill in the legend plate, ?day=<YYYY-MM-DD> is the site's day the day watcher reads in
     place of the clock, ?sleep=seconds makes the sleep timer count seconds, ?idle=<seconds> is how long a ride waits to settle. */
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const hooks = testHooks ? new URLSearchParams(search) : null;
  const at = hooks?.get("at");
  const startAt = at ? { index: Number(at), seconds: Number(hooks?.get("t")) || 0 } : null;
  const showStats = hooks?.get("stats") === "1";
  const day = hooks?.get("day");
  const fakeAt = day ? Date.parse(`${day}T12:00:00Z`) : NaN;
  const fakeNow = Number.isNaN(fakeAt) ? null : fakeAt;
  const sleepUnit = sleepUnitMs(testHooks, search);
  const idle = idleMs(testHooks, search);
  /* The ride listens to the page for as long as the page is up; and each time the page is drawn in its other look, the control that
     had focus as the look changed has it back where that look shows it. */
  useEffect(() => ride.start({ idleMs: idle, unitMs: sleepUnit }), [ride, idle, sleepUnit]);
  useEffect(() => ride.refocus(), [ride, settled]);
  /* The next show: the new day's once the site's day has turned, or a past pick once this show is over. */
  const next = useNextShow({ today, renderedAt, pastPick, fakeNow, riding, sleepEndsAt, over, onCarry: ride.arrive });
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
  useEventListener<CustomEvent<{ state: PlayerState; routing: Routing; over: boolean }>>("document", "player:state", (e) => {
    setPlayerState(e.detail.state);
    setRouting(e.detail.routing);
    setOver(e.detail.over);
  });
  useEventListener("document", "player:start", () => setJoined(true));

  useEffect(() => {
    if (!showStats) return;
    const timer = window.setInterval(() => setStats(JSON.stringify(window.__hill ?? null)), 1000);
    return () => window.clearInterval(timer);
  }, [showStats]);

  /* V turns the view. The ride's own keys, B, F and Escape, are the ride's (ride.ts). */
  useEventListener<KeyboardEvent>("window", "keydown", (e) => {
    if (e.code === "KeyV" && !e.repeat && !keyBelongsToControl(e) && lettersActive(e)) setFirstPerson(!first);
  });

  const hinting = !joined && tracks.length > 0;
  const hint = worldStatus === "loading" ? "Loading the island…" : worldStatus === "fallback" ? "Press play to start the show"
    : tier === "phone" ? "Touch to start the show" : tier === "tv" ? "Press a key to start the show" : "Move to start the show";
  const archiveUrl = bestSource ? `https://archive.org/details/${bestSource.upstreamIdentifier}` : "";
  const relisten = `https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`;

  return (
    <main data-ride={riding ? (settled ? "settled" : "awake") : undefined} data-state={playerState} data-routing={routing} data-joined={joined ? "true" : undefined} data-single-key={singleKey ? "on" : "off"} data-view={first ? "first" : "third"} data-shelves={away || undefined} data-test-hooks={testHooks ? "1" : undefined} className="world-page relative h-screen">
      <script type="application/json" id="world-data" dangerouslySetInnerHTML={{ __html: data.replace(/</g, "\\u003c") }} />
      <div id="world" data-world="loading" tabIndex={fallback ? undefined : 0} role="application" aria-hidden={fallback || undefined}
        aria-label="The island. Walk and turn with the arrow keys or W A S D, and look up and down with T and G; the first move starts the show." />
      <div className="world-fallback" aria-hidden="true">
        <div className="sky" /><div className="ring" /><div className="hill" /><div className="cave l" /><div className="cave r" /><div className="water" />
      </div>

      {/* A ride that has settled strips the HUD to the title, the line and the seek slider, below, and its corner, at the end. */}
      {!settled && (
        <>
          {/* The title plate and, once the site's day has turned, the chip under it, in one column. On a phone the column ends 8 px
              before the icon column (which starts 64 px from the right edge), so its lines wrap before the column. */}
          <div data-hud="top" data-shelf={titleAway ? "in" : "out"} data-side="left" className="hud shelf left-6 top-6 max-sm:left-3 max-sm:top-3 max-sm:right-[72px] flex items-start gap-2">
            <ShelfTab shelf="title" side="left" label="The show's title" away={titleAway} />
            <div id={shelfId("title")} className="shelf-body min-w-0 max-sm:flex-1 flex flex-col items-start max-sm:items-stretch gap-2">
            <div className="plate">
              <p className="t-tag text-muted">Dead Redux</p>
              <p className="t-label text-accent mt-1">{isToday ? <>Today&rsquo;s show · {formatDate(featuredDate)}</> : <>Featured {formatDate(featuredDate)}</>}</p>
              <h1 className="t-date text-ink mt-2">{formatDate(show.date)}</h1>
              <p className="t-body text-muted mt-1">{show.venue} · {show.location}</p>
              {fallback && <p className="t-row text-muted mt-2">This world needs WebGL 2</p>}
            </div>
            {next?.kind === "day" && <NextChip next={next} settled={false} />}
            </div>
          </div>
          {/* Above the now-plate's stack, so an open Details panel never covers these controls on a short screen. The shelf's tab comes
              after the buttons, as it stands on a desktop, at the row's right end, so Tab reaches them in the order the screen shows; on
              a phone it stands first, at the top of the column. While the visitor rides, the ride's own two buttons stand in a row
              under the page's, on the same shelf. */}
          <div data-hud="top" data-shelf={actionsAway ? "in" : "out"} data-side="right" className={`hud shelf right-6 top-6 max-sm:right-3 max-sm:top-3 ${PLATE_ROW} z-20!`}>
            <div id={shelfId("actions")} className="shelf-body flex flex-col items-end gap-2">
            <div className={PLATE_ROW}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
            <a href="/archive" aria-label="Archive" className="plate t-row text-muted hover:text-ink h-11 flex items-center">
              <span className="max-sm:hidden">Archive</span>
              <svg className="sm:hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
            </a>
            {/* The ride's one control, pressed while the visitor rides: it starts the show (nothing once it has) and the ride, or
                ends the ride. The still has it too: there it is the page's half of the ride. */}
            <button type="button" data-action="ride" aria-pressed={riding} aria-label={RIDE_NAME} title={RIDE_NAME} onClick={ride.toggle}
              className={`${PLATE_BUTTON} gap-2 aria-pressed:shadow-[inset_0_0_0_2px_var(--accent)]`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="15" r="4" /><circle cx="6" cy="9" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="18" cy="9" r="1.5" /></svg>
              <span className="max-sm:hidden">{RIDE_NAME}</span>
            </button>
            <ShareButtons featuredDate={featuredDate} showDate={show.date} venue={show.venue} location={show.location} isToday={isToday} />
            </div>
            {riding && <RideRow ride={ride} sleepEndsAt={sleepEndsAt} unit={sleepUnit} settled={false} />}
            </div>
            <ShelfTab shelf="actions" side="right" label="The page's buttons" away={actionsAway} className="max-sm:order-first" />
          </div>
        </>
      )}

      {/* The hint waits for the first move: bottom-centre on a desktop, above the stick on a phone. The world finds it by data-hint
          (public/world/main.js). */}
      {hinting && (
        <p role="status" data-hint="" className="hud plate t-row text-ink left-1/2 -translate-x-1/2 bottom-6 max-sm:bottom-[152px] whitespace-nowrap">{hint}</p>
      )}

      {/* Bottom-right on a desktop, so the bears at the trailhead stay in view; full width above the stick on a phone, a plate higher
          while the hint shows. The wrapper and the plate stay mounted in every mode, so the player keeps playing; its shelf's tab stands
          at the corner beside it. */}
      <div data-shelf={!settled && playerAway ? "in" : "out"} data-side="right"
        className={settled ? "hud left-16 bottom-12" : `hud shelf right-6 bottom-6 flex items-end gap-2 max-sm:left-3 max-sm:right-3 ${hinting ? "max-sm:bottom-[212px]" : "max-sm:bottom-[160px]"}`}>
        {/* The stack itself, which the shelf puts away; it stays mounted there, so the show plays on. The Details panel is positioned
            against it, at rest and while it slides alike. */}
        <div id={settled ? undefined : shelfId("player")} className={settled ? "flex flex-col items-start gap-2" : "shelf-body relative min-w-0 max-sm:flex-1 flex flex-col items-end gap-2 max-sm:items-stretch"}>
        {!settled && !fallback && (
          <div className={`plate t-tag text-muted ${stats ? "" : "max-sm:hidden"}`}>
            <p className="max-sm:hidden">Arrows or WASD to roam, drag to look</p>
            <p className="max-sm:hidden">B or F: {RIDE_NAME}</p>
            {stats && <p className="text-[13px] leading-4 font-mono normal-case tracking-normal mt-1 max-w-[360px] wrap-anywhere">{stats}</p>}
          </div>
        )}
        {/* The past pick above the now-plate; once the ride has settled, the new day too, above the title. */}
        {next && (next.kind === "past" || settled) && <NextChip next={next} settled={settled} />}
        <div className={settled ? "plate" : "plate w-[360px] max-sm:w-auto"}>
          {bestSource && tracks.length > 0 ? (
            <Player tracks={tracks} sets={sets} featuredDate={featuredDate} showDate={show.date} venue={show.venue} archiveUrl={archiveUrl} settled={settled} startAt={startAt}>
              <DetailsPanel source={bestSource} show={show} tracks={tracks} tourName={tourName} routing={routing} world={worldStatus} archiveUrl={archiveUrl} singleKey={singleKey} first={first} />
            </Player>
          ) : (
            <NoRecording failed={lookupFailed} relisten={relisten} />
          )}
        </div>
        </div>
        {!settled && <ShelfTab shelf="player" side="right" label="The player" away={playerAway} />}
      </div>

      {/* The stick: a thumb on it walks and turns (public/world/input.js). It stays mounted in a settled ride and in the still, only
          hidden: the world binds it once, when it loads. */}
      <div data-stick="" role="application" aria-label="Walk: slide up or down to walk, left or right to turn"
        className={`hud stick left-1/2 -translate-x-1/2 bottom-6 sm:hidden! ${settled || fallback ? "hidden!" : ""}`}>
        <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true">
          <path data-dir="fwd" d="M50 21 56 15 62 21" />
          <path data-dir="back" d="M50 91 56 97 62 91" />
          <path data-dir="left" d="M21 50 15 56 21 62" />
          <path data-dir="right" d="M91 50 97 56 91 62" />
        </svg>
        <span className="knob" />
      </div>

      {/* The settled look's corner: the sleep timer and Leave. */}
      {settled && <RideRow ride={ride} sleepEndsAt={sleepEndsAt} unit={sleepUnit} settled />}
    </main>
  );
}
