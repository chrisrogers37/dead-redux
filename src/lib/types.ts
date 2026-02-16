/**
 * Minimal show record stored in the static JSON catalog.
 * Kept lean — full details are fetched at render time from Relisten.
 */
export interface ShowSummary {
  /** ISO date string: "1977-05-08" */
  date: string;
  /** Venue name: "Barton Hall, Cornell University" */
  venue: string;
  /** Venue location: "Ithaca, NY, USA" */
  location: string;
  /** Average rating (0-10 scale) */
  avgRating: number;
  /** Number of available source recordings */
  sourceCount: number;
  /** Whether a soundboard recording exists */
  hasSoundboard: boolean;
}

/**
 * Full show details fetched from Relisten API at render time.
 */
export interface ShowDetails {
  date: string;
  displayDate: string;
  venue: {
    name: string;
    location: string;
  };
  tour: {
    name: string;
  } | null;
  sources: Source[];
  avgRating: number;
}

export interface Source {
  id: number;
  uuid: string;
  /** The Archive.org item identifier, e.g. "gd77-05-08.sbd.hicks.4982.sbeok.shnf" */
  upstreamIdentifier: string;
  isSoundboard: boolean;
  isRemaster: boolean;
  avgRating: number;
  avgRatingWeighted: number;
  duration: number;
  numReviews: number;
  flacType: string;
  description: string | null;
  taperNotes: string | null;
  source: string | null;
  sets: Set[];
}

export interface Set {
  name: string | null;
  tracks: Track[];
}

export interface Track {
  title: string;
  duration: number;
  trackPosition: number;
  mp3Url: string;
  flacUrl: string | null;
}
