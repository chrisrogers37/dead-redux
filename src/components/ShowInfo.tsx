import { Fragment } from "react";
import type { Source } from "@/lib/types";
import { formatDuration, formatRating, notesToLines } from "@/lib/format";

interface ShowInfoProps {
  showDate: string;
  tourName: string | null;
  avgRating: number;
  source: Source | null;
}

export function ShowInfo({
  showDate,
  tourName,
  avgRating,
  source,
}: ShowInfoProps) {
  const relistenUrl = `https://relisten.net/grateful-dead/${showDate.replace(/-/g, "/")}`;

  // Compute total show duration from tracks
  const totalDuration = source
    ? source.sets.reduce(
        (total, set) =>
          total + set.tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
        0
      )
    : 0;

  const facts: [label: string, value: string | null | undefined][] = [
    ["Taper", source?.taper],
    ["Lineage", source?.lineage],
    ["Transferrer", source?.transferrer],
    ["Source", source?.source],
    ["Rating", avgRating > 0 ? `${formatRating(avgRating)} / 10` : null],
    ["Total time", formatDuration(totalDuration)],
    ["Tour", tourName],
  ];
  // A fact without a value gets no row.
  const rows = facts.filter(([, value]) => value);

  const notes = source?.description ? notesToLines(source.description) : [];

  return (
    <details className="group w-full">
      <summary
        data-action="details"
        className="mx-auto flex w-fit items-center justify-center gap-2 py-2 px-5 rounded-full text-sm
                   text-dead-bone/90 hover:text-dead-bone border border-dead-lavender/30 hover:border-dead-pink/40
                   hover:bg-dead-pink/5 transition-colors cursor-pointer [&::-webkit-details-marker]:hidden"
      >
        <span>Details</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </summary>

      <div className="mt-2 watercolor-card p-5 space-y-5">
        {/* Facts */}
        {rows.length > 0 && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-dead-bone/90">{label}</dt>
                <dd className="text-dead-bone wrap-anywhere">{value}</dd>
              </Fragment>
            ))}
          </dl>
        )}

        {/* Setlist */}
        {source && source.sets.length > 0 && (
          <div className="space-y-4">
            {source.sets.map((set, setIndex) => (
              <div key={setIndex}>
                {/* Set header */}
                {set.name && (
                  <h4 className="text-sm font-medium uppercase tracking-widest text-dead-bone/90 mb-2">
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
                      <span className="text-dead-bone/90">{track.title}</span>
                      {track.duration > 0 && (
                        <span className="text-dead-bone/90 text-sm ml-3 tabular-nums shrink-0">
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

        {/* Notes, as plain text lines */}
        {notes.length > 0 && (
          <div className="space-y-1">
            {notes.map((line, lineIndex) => (
              <p key={lineIndex} className="text-sm text-dead-bone/90">
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Relisten link */}
        <div className="text-center pt-2">
          <a
            href={relistenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-dead-bone/90 underline hover:text-dead-bone transition-colors"
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
    </details>
  );
}
