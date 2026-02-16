import type { ShowDetails, Source, Set, Track } from "./types";

const API_BASE = "https://api.relisten.net/api/v2/artists/grateful-dead";

interface RelistenShowResponse {
  sources: RelistenSource[];
  display_date: string;
  date: string;
  venue: {
    name: string;
    location: string;
  } | null;
  tour: {
    name: string;
  } | null;
  avg_rating: number;
}

interface RelistenSource {
  id: number;
  uuid: string;
  upstream_identifier: string;
  is_soundboard: boolean;
  is_remaster: boolean;
  avg_rating: number;
  avg_rating_weighted: number;
  duration: number;
  num_reviews: number;
  flac_type: string;
  description: string | null;
  taper_notes: string | null;
  source: string | null;
  sets: RelistenSet[];
}

interface RelistenSet {
  name: string | null;
  tracks: RelistenTrack[];
}

interface RelistenTrack {
  title: string;
  duration: number;
  track_position: number;
  mp3_url: string;
  flac_url: string | null;
}

/**
 * Fetch full show details from Relisten by date string.
 *
 * @param dateStr - ISO date: "1977-05-08"
 * @returns ShowDetails or null if not found
 */
export async function fetchShowDetails(
  dateStr: string
): Promise<ShowDetails | null> {
  const year = dateStr.split("-")[0];
  const url = `${API_BASE}/years/${year}/${dateStr}`;

  const res = await fetch(url, { next: { revalidate: 86400 } }); // Cache for 24h

  if (!res.ok) {
    // Try alternate endpoint format
    const altUrl = `${API_BASE}/shows/${dateStr}`;
    const altRes = await fetch(altUrl, { next: { revalidate: 86400 } });
    if (!altRes.ok) return null;
    return parseShowResponse(await altRes.json());
  }

  return parseShowResponse(await res.json());
}

function parseShowResponse(data: RelistenShowResponse): ShowDetails {
  return {
    date: data.date,
    displayDate: data.display_date,
    venue: {
      name: data.venue?.name ?? "Unknown Venue",
      location: data.venue?.location ?? "Unknown Location",
    },
    tour: data.tour ? { name: data.tour.name } : null,
    sources: (data.sources ?? []).map(parseSource),
    avgRating: data.avg_rating ?? 0,
  };
}

function parseSource(s: RelistenSource): Source {
  return {
    id: s.id,
    uuid: s.uuid,
    upstreamIdentifier: s.upstream_identifier,
    isSoundboard: s.is_soundboard,
    isRemaster: s.is_remaster,
    avgRating: s.avg_rating,
    avgRatingWeighted: s.avg_rating_weighted,
    duration: s.duration,
    numReviews: s.num_reviews,
    flacType: s.flac_type,
    description: s.description,
    taperNotes: s.taper_notes,
    source: s.source,
    sets: (s.sets ?? []).map(parseSet),
  };
}

function parseSet(s: RelistenSet): Set {
  return {
    name: s.name,
    tracks: (s.tracks ?? []).map(parseTrack),
  };
}

function parseTrack(t: RelistenTrack): Track {
  return {
    title: t.title,
    duration: t.duration,
    trackPosition: t.track_position,
    mp3Url: t.mp3_url,
    flacUrl: t.flac_url,
  };
}

/**
 * Pick the best available source for a show.
 * Prefers: soundboard > highest weighted rating > most reviews.
 */
export function pickBestSource(sources: Source[]): Source | null {
  if (sources.length === 0) return null;

  const sorted = [...sources].sort((a, b) => {
    if (a.isSoundboard !== b.isSoundboard) return a.isSoundboard ? -1 : 1;
    if (a.avgRatingWeighted !== b.avgRatingWeighted)
      return b.avgRatingWeighted - a.avgRatingWeighted;
    return b.numReviews - a.numReviews;
  });

  return sorted[0];
}
