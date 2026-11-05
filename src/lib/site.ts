import type { Metadata } from "next";

/** The site's address, which every absolute link it gives starts with: the canonical tags, the share link, the sitemap and the feed. */
export const SITE_URL = "https://dead-redux.vercel.app";

/** What the site is, in a line: its description and its feed's. */
export const SITE_DESCRIPTION = "A new Grateful Dead show every day";

/** The path of the feed of daily picks. */
export const FEED_PATH = "/feed.xml";

/**
 * A page's alternates: its canonical address, which a search engine files the page under whatever query string reached it, and the
 * feed, which a feed reader finds from any page.
 *
 * @param path - The page's path: "/2026-10-20".
 */
export function alternatesFor(path: string): Metadata["alternates"] {
  return { canonical: path, types: { "application/rss+xml": FEED_PATH } };
}
