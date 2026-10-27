import type { ShowDetails, Source, Set, Track } from "./types";
import { isPlaceholderTitle, stripTrackNumber, toPlainText } from "./format";

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

export interface RelistenSource {
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
  taper: string | null;
  lineage: string | null;
  transferrer: string | null;
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

/** What Relisten answered for a show date: the show, no record of it, or a failure to answer. */
export type ShowLookup =
  | { kind: "found"; details: ShowDetails }
  | { kind: "missing" }
  | { kind: "failed"; reason: string };

/** The whole look-up, both paths together, gets this long to answer; past it the page renders without a recording and says so. */
export const LOOKUP_BUDGET_MS = 6000;

/**
 * Look a show up on Relisten by date string, at the year's path and then at the show's own, within one time budget for both.
 *
 * @param dateStr - ISO date: "1977-05-08"
 * @param budgetMs - How long both paths together may take; LOOKUP_BUDGET_MS unless a test says otherwise.
 * @returns The show, from the first path that answers ok; "missing" when both answer 404, as Relisten does for a date it has no
 *   record of; or "failed" otherwise, naming each path that failed in the form the maps job logs a refusal in ("<url> answered 403
 *   (server cloudflare, cf-mitigated challenge)", "<url> could not be reached: <why>", or "<url> did not answer within 6000 ms",
 *   after which no other path is tried). A failure is logged once, here, for every caller.
 */
export async function lookUpShow(dateStr: string, budgetMs = LOOKUP_BUDGET_MS): Promise<ShowLookup> {
  const year = dateStr.split("-")[0];
  const failures: string[] = [];
  // One budget for both paths: the second gets what the first left.
  const signal = AbortSignal.timeout(budgetMs);
  for (const url of [`${API_BASE}/years/${year}/${dateStr}`, `${API_BASE}/shows/${dateStr}`]) {
    try {
      const res = await fetch(url, { signal, next: { revalidate: 86400 } }); // Cache for 24h
      if (res.ok) return { kind: "found", details: parseShowResponse(await res.json()) };
      if (res.status !== 404) failures.push(refusal(url, res));
    } catch (err) {
      if (signal.aborted) {
        failures.push(`${url} did not answer within ${budgetMs} ms`);
        break;
      }
      failures.push(`${url} could not be reached: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const lookup: ShowLookup = failures.length === 0 ? { kind: "missing" } : { kind: "failed", reason: failures.join("; ") };
  if (lookup.kind === "failed") console.error(`Relisten gave no answer for ${dateStr}: ${lookup.reason}`);
  return lookup;
}

/** An answer that is not ok, as the maps job logs one: the URL, the status, and the server and cf-mitigated mark when it has them. */
function refusal(url: string, res: Response): string {
  const server = res.headers.get("server");
  const mitigated = res.headers.get("cf-mitigated");
  const by = [server && `server ${server}`, mitigated && `cf-mitigated ${mitigated}`].filter(Boolean).join(", ");
  return `${url} answered ${res.status}${by ? ` (${by})` : ""}`;
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

export function parseSource(s: RelistenSource): Source {
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
    // These fields can hold HTML; the page shows them as plain text.
    source: s.source && toPlainText(s.source),
    taper: s.taper && toPlainText(s.taper),
    lineage: s.lineage && toPlainText(s.lineage),
    transferrer: s.transferrer && toPlainText(s.transferrer),
    unlabeled: isUnlabeled(s),
    sets: (s.sets ?? []).map(parseSet),
  };
}

function isUnlabeled(s: RelistenSource): boolean {
  const titles = (s.sets ?? []).flatMap((set) => (set.tracks ?? []).map((t) => t.title));
  return titles.filter(isPlaceholderTitle).length * 2 > titles.length;
}

function parseSet(s: RelistenSet): Set {
  return {
    name: s.name,
    tracks: (s.tracks ?? []).map(parseTrack),
  };
}

function parseTrack(t: RelistenTrack): Track {
  return {
    title: isPlaceholderTitle(t.title) ? `Track ${t.track_position}` : stripTrackNumber(t.title),
    duration: t.duration,
    trackPosition: t.track_position,
    mp3Url: t.mp3_url,
    flacUrl: t.flac_url,
  };
}

/**
 * Pick the best available source for a show.
 * Prefers: song titles > soundboard > highest weighted rating > most reviews. A source whose
 * titles are mostly placeholders comes after every labeled one, so the page can show a setlist.
 */
export function pickBestSource(sources: Source[]): Source | null {
  if (sources.length === 0) return null;

  const sorted = [...sources].sort((a, b) => {
    if (a.unlabeled !== b.unlabeled) return a.unlabeled ? 1 : -1;
    if (a.isSoundboard !== b.isSoundboard) return a.isSoundboard ? -1 : 1;
    if (a.avgRatingWeighted !== b.avgRatingWeighted)
      return b.avgRatingWeighted - a.avgRatingWeighted;
    return b.numReviews - a.numReviews;
  });

  return sorted[0];
}
