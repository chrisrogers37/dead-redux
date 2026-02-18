"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";
import { formatDuration, formatRating } from "@/lib/format";

interface ShowInfoProps {
  showDate: string;
  venue: string;
  location: string;
  tourName: string | null;
  avgRating: number;
  source: Source | null;
}

export function ShowInfo({
  showDate,
  venue,
  location,
  tourName,
  avgRating,
  source,
}: ShowInfoProps) {
  const [expanded, setExpanded] = useState(false);

  const relistenUrl = `https://relisten.net/grateful-dead/${showDate.replace(/-/g, "/")}`;

  // Compute total show duration from tracks
  const totalDuration = source
    ? source.sets.reduce(
        (total, set) =>
          total + set.tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
        0
      )
    : 0;

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mx-auto flex items-center justify-center gap-2 py-2 px-5 rounded-full text-xs
                   text-dead-bone/50 hover:text-dead-bone/80 border border-dead-bone/10 hover:border-dead-bone/20
                   transition-colors cursor-pointer"
        aria-expanded={expanded}
        aria-controls="show-info-panel"
      >
        <span>{expanded ? "Hide" : "Show"} Details</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {/* Expandable panel */}
      {expanded && (
        <div
          id="show-info-panel"
          className="mt-2 rounded-xl border border-dead-cream/10 bg-dead-charcoal/30 p-5 space-y-5"
        >
          {/* Quick stats row */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-dead-bone/60">
            {avgRating > 0 && (
              <span>
                <span className="text-dead-gold">{formatRating(avgRating)}</span>/10 rating
              </span>
            )}
            {totalDuration > 0 && (
              <span>{formatDuration(totalDuration)} total</span>
            )}
            {tourName && <span>{tourName}</span>}
            {source?.isSoundboard && (
              <span className="text-dead-gold">Soundboard</span>
            )}
          </div>

          {/* Setlist */}
          {source && source.sets.length > 0 && (
            <div className="space-y-4">
              {source.sets.map((set, setIndex) => (
                <div key={setIndex}>
                  {/* Set header */}
                  {set.name && (
                    <h4 className="text-xs font-medium uppercase tracking-widest text-dead-bone/40 mb-2">
                      {set.name}
                    </h4>
                  )}

                  {/* Tracks */}
                  <ol className="space-y-1">
                    {set.tracks.map((track, trackIndex) => (
                      <li
                        key={trackIndex}
                        className="flex items-baseline justify-between text-sm"
                      >
                        <span className="text-dead-cream/80">{track.title}</span>
                        {track.duration > 0 && (
                          <span className="text-dead-bone/40 text-xs ml-3 tabular-nums shrink-0">
                            {formatDuration(track.duration)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* Source info */}
          {source?.description && (
            <div className="text-xs text-dead-bone/40 leading-relaxed">
              <p className="font-medium text-dead-bone/50 mb-1">Source</p>
              <p className="whitespace-pre-line">{source.description}</p>
            </div>
          )}

          {/* Relisten link */}
          <div className="text-center pt-2">
            <a
              href={relistenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-dead-gold/60 hover:text-dead-gold transition-colors"
            >
              View on Relisten
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
