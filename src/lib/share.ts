import { formatDate } from "./format";

/** The show a page shares, as the page knows it. */
export interface SharedShow {
  /** The day that featured the show: "2026-03-01" */
  featuredDate: string;
  /** The show's own date: "1992-06-29" */
  showDate: string;
  venue: string;
  location: string;
  /** Whether the featured day is today */
  isToday: boolean;
}

/**
 * What the Share button shares. The link is the featured day's own page, never the
 * show's date, so a link shared from the home page keeps opening the same show.
 */
export function shareContent({ featuredDate, showDate, venue, location, isToday }: SharedShow) {
  const url = `https://dead-redux.vercel.app/${featuredDate}`;
  const lead = isToday ? "Today's Dead show" : `Featured on ${formatDate(featuredDate)}`;
  const text = `${lead}: ${venue}, ${location} — ${showDate}`;
  return { url, text };
}
