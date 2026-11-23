import { Fragment, type CSSProperties, type ReactNode } from "react";
import { formatDuration } from "@/lib/format";

interface Props {
  /** A settled ride (ride.ts) shows the big title, the line and the seek band only. */
  settled: boolean;
  title: string;
  index: number;
  count: number;
  /** "Set 1", "Set 2", "Encore", or null for a one-list show. */
  set: string | null;
  position: number;
  duration: number;
  /** A sentence that stands in for the position line: "Starting…", "Reconnecting…", "Resumed at 9 of 19", "Show over · July 4, 1986". */
  status: string | null;
  /** The track could not play after its retries. */
  failed: boolean;
  archiveUrl: string;
  /** The button shows Pause. */
  playing: boolean;
  onPrevious: () => void;
  onPlay: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  /** Try again on a failed track: it loads again from where it stopped, with its reloads to come. */
  onRetry: () => void;
  /** Whether Details is open, which the player keeps: a ride that settles takes the controls away, and waking brings them back as they were. */
  detailsOpen: boolean;
  onDetails: (open: boolean) => void;
  /** What Details holds. */
  children?: ReactNode;
}

const PREVIOUS = "M6 5h2v14H6zM20 5v14L9 12z";
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";
const NEXT = "M16 5h2v14h-2zM4 5v14l11-7z";

/** A time on the now-plate: formatDuration's m:ss, and 0:00 where it gives nothing. */
const clock = (s: number) => formatDuration(s) || "0:00";

/**
 * A pointer's seek gives the keys back to the world. A press on the slider focuses it, as on any control, and from then on its keys
 * are its own, so the walk's keys did nothing until a click on the island. Once the pointer that pressed it lifts, or is cancelled,
 * the world takes focus again, if focus is still where the press left it: on the slider, or on the page where a browser focuses
 * nothing for a press. A seek by keyboard never comes here, so the arrows go on moving the slider. Only a mouse and a pen are
 * answered: a touch walks by its stick, not by keys, and a press that names no pointer, or one this page does not know, as a
 * synthesised press may, keeps its place on the slider. The still, which has no world to walk, is not focusable and keeps focus
 * where it is.
 */
export function focusWorldOnRelease(press: { pointerId: number; pointerType: string; currentTarget: unknown }): void {
  if (press.pointerType !== "mouse" && press.pointerType !== "pen") return;
  const { pointerId, currentTarget: slider } = press;
  const release = (lift: Event) => {
    if ((lift as PointerEvent).pointerId !== pointerId) return;
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    const world = document.getElementById("world"), focused = document.activeElement;
    if (world && world.tabIndex >= 0 && (focused === slider || focused === document.body || focused === null)) world.focus({ preventScroll: true });
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}

export function Transport({
  settled,
  title,
  index,
  count,
  set,
  position,
  duration,
  status,
  failed,
  archiveUrl,
  playing,
  onPrevious,
  onPlay,
  onNext,
  onSeek,
  onRetry,
  detailsOpen,
  onDetails,
  children,
}: Props) {
  const max = Math.max(1, Math.round(duration));
  const value = Math.min(Math.max(0, Math.floor(position)), max);
  const line = status ?? <>{set && `${set} · `}{index + 1} of {count} · <span data-mask="time">{clock(position)} / {clock(duration)}</span></>;
  /* The fill reaches the position, --p. At 0 the stylesheet's own 0% holds, so the first render writes no style attribute, which the
     Content-Security-Policy refuses; a later position goes through the element's style object, which it allows. */
  const seek = (
    <input
      type="range"
      data-action="seek"
      aria-label="Seek"
      aria-valuetext={`${clock(position)} of ${clock(duration)}`}
      min={0}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onSeek(Number(e.currentTarget.value))}
      onPointerDown={settled ? undefined : focusWorldOnRelease}
      className="seek w-full"
      style={value ? ({ "--p": `${(value / max) * 100}%` } as CSSProperties) : undefined}
    />
  );
  const liveTitle = (
    <>
      <span className="sr-only">Now playing: </span>
      {title}
      <span className="sr-only">, {index + 1} of {count}</span>
    </>
  );

  /* The slider is the same element in both looks, the second of two children here whichever the first is, so a ride that settles or
     wakes leaves it its focus and a press that has hold of it. */
  if (settled) {
    return (
      <>
        <Fragment key="settled">
          <p className="text-[40px] leading-[48px] font-medium text-ink" aria-live="polite">
            {liveTitle}
          </p>
          <p className="text-[24px] leading-8 font-mono text-muted mt-1">{line}</p>
        </Fragment>
        {seek}
      </>
    );
  }

  return (
    <>
      <Fragment key="awake">
      <p className="t-tag text-muted">{line}</p>
      <p className="t-now text-ink mt-1" aria-live="polite">
        {liveTitle}
      </p>
      {failed && (
        <div className="mt-2">
          <p className="t-row text-ink">Could not play this track.</p>
          <div className="flex items-center gap-4">
            <button type="button" data-action="retry" onClick={onRetry} className="t-row text-ink underline hover:text-accent inline-flex items-center min-h-11">
              Try again
            </button>
            <a href={archiveUrl} target="_blank" rel="noopener noreferrer" className="t-row text-muted underline hover:text-ink inline-flex items-center min-h-11">
              Open on archive.org ↗
            </a>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          data-action="prev"
          aria-label="Previous track"
          onClick={onPrevious}
          className="w-11 h-11 text-ink flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d={PREVIOUS} />
          </svg>
        </button>
        <button
          type="button"
          data-action="play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onPlay}
          className="w-12 h-12 rounded-full bg-accent text-page flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d={playing ? PAUSE : PLAY} />
          </svg>
        </button>
        <button
          type="button"
          data-action="next"
          aria-label="Next track"
          onClick={onNext}
          className="w-11 h-11 text-ink flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d={NEXT} />
          </svg>
        </button>
        <details className="ml-2" open={detailsOpen} onToggle={(e) => onDetails(e.currentTarget.open)}>
          <summary data-action="details" className="t-row text-muted cursor-pointer py-3">Details</summary>
          {children}
        </details>
      </div>
      </Fragment>
      {seek}
    </>
  );
}
