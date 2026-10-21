import type { DailyPick } from "@/lib/archive";
import { formatDate, formatRating } from "@/lib/format";

interface TimelineProps {
  picks: DailyPick[];
}

export function Timeline({ picks }: TimelineProps) {
  if (picks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="t-body text-muted">No shows in the archive yet.</p>
        <p className="t-row text-muted mt-2">Check back tomorrow!</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Each row is a full page load, so the world module starts on the dated page. */}
      {picks.map((pick) => (
        <a
          key={pick.featuredDate}
          href={`/${pick.featuredDate}`}
          className="grid grid-cols-[8rem_1fr_auto] gap-x-4 py-3 px-4 -mx-4 rounded hover:bg-line"
        >
          {/* Featured date */}
          <time
            dateTime={pick.featuredDate}
            className="t-body text-ink tabular-nums"
          >
            {formatDate(pick.featuredDate)}
          </time>

          {/* Show info */}
          <div className="min-w-0">
            <p className="t-body text-ink">
              {pick.show.venue}
            </p>
            <p className="t-row text-muted">
              {pick.show.location} &middot; {formatDate(pick.show.date)}
            </p>
          </div>

          {/* Rating and soundboard badges */}
          <div className="flex items-baseline justify-end gap-3">
            {pick.show.avgRating > 0 && (
              <span className="t-row text-muted">
                {formatRating(pick.show.avgRating)}
              </span>
            )}
            {pick.show.hasSoundboard && (
              <span className="t-tag text-muted">
                SBD
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
