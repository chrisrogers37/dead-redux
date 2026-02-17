import Link from "next/link";
import type { DailyPick } from "@/lib/archive";
import { formatDate, formatRating } from "@/lib/format";

interface TimelineProps {
  picks: DailyPick[];
}

export function Timeline({ picks }: TimelineProps) {
  if (picks.length === 0) {
    return (
      <div className="text-center py-16 text-dead-bone/40">
        <p>No shows in the archive yet.</p>
        <p className="text-sm mt-2">Check back tomorrow!</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {picks.map((pick) => (
        <Link
          key={pick.featuredDate}
          href={`/${pick.featuredDate}`}
          className="group flex items-baseline gap-4 py-3 px-4 -mx-4 rounded-lg
                     hover:bg-dead-cream/5 transition-colors"
        >
          {/* Featured date */}
          <time
            dateTime={pick.featuredDate}
            className="text-xs text-dead-bone/40 tabular-nums shrink-0 w-24"
          >
            {formatDate(pick.featuredDate)}
          </time>

          {/* Show info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-dead-cream/80 group-hover:text-dead-cream transition-colors truncate">
              {pick.show.venue}
            </p>
            <p className="text-xs text-dead-bone/40 truncate">
              {pick.show.location} &middot; {formatDate(pick.show.date)}
            </p>
          </div>

          {/* Rating badge */}
          {pick.show.avgRating > 0 && (
            <span className="text-xs text-dead-gold/50 tabular-nums shrink-0">
              {formatRating(pick.show.avgRating)}
            </span>
          )}

          {/* Soundboard badge */}
          {pick.show.hasSoundboard && (
            <span className="text-[10px] text-dead-gold/40 uppercase tracking-wider shrink-0">
              SBD
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
