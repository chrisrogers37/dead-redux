import type { CSSProperties, ReactNode } from "react";
import { formatDuration } from "@/lib/format";

interface Props {
  /** Lean-back shows the big title, the line and the seek band only. */
  leanback: boolean;
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
  /** What Details holds. */
  children?: ReactNode;
}

const PREVIOUS = "M6 5h2v14H6zM20 5v14L9 12z";
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";
const NEXT = "M16 5h2v14h-2zM4 5v14l11-7z";

/** A time on the now-plate: formatDuration's m:ss, and 0:00 where it gives nothing. */
const clock = (s: number) => formatDuration(s) || "0:00";

export function Transport({
  leanback,
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
  children,
}: Props) {
  const max = Math.max(1, Math.round(duration));
  const value = Math.min(Math.max(0, Math.floor(position)), max);
  const line = status ?? <>{set && `${set} · `}{index + 1} of {count} · <span data-mask="time">{clock(position)} / {clock(duration)}</span></>;
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
      className="seek w-full"
      style={{ "--p": `${(value / max) * 100}%` } as CSSProperties}
    />
  );
  const liveTitle = (
    <>
      <span className="sr-only">Now playing: </span>
      {title}
      <span className="sr-only">, {index + 1} of {count}</span>
    </>
  );

  if (leanback) {
    return (
      <>
        <p className="text-[40px] leading-[48px] font-medium text-ink" aria-live="polite">
          {liveTitle}
        </p>
        <p className="text-[24px] leading-8 font-mono text-muted mt-1">{line}</p>
        {seek}
      </>
    );
  }

  return (
    <>
      <p className="t-tag text-muted">{line}</p>
      <p className="t-now text-ink mt-1" aria-live="polite">
        {liveTitle}
      </p>
      {failed && (
        <p className="t-row text-ink mt-2">
          Could not play this track. <a href={archiveUrl} target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">Open on archive.org ↗</a>
        </p>
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
        <details className="ml-2">
          <summary data-action="details" className="t-row text-muted cursor-pointer py-3">Details</summary>
          {children}
        </details>
      </div>
      {seek}
    </>
  );
}
