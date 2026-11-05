import type { MetadataRoute } from "next";
import { archiveMonths, getArchivePicks, getDailyPicksRange, getLaunchDate, monthPath } from "./archive";
import { describeDay } from "./daily-show";
import { FEED_PATH, SITE_DESCRIPTION, SITE_URL } from "./site";
import { dayStart } from "./site-day";

/** How many of the newest daily picks the feed carries, today's included: a month of them. */
export const FEED_DAYS = 30;

/** Text made safe to stand in XML. */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The sitemap on the site day `today`: the home page, the archive, each month and each featured day's page from launch through
 * today, every page once, at its canonical address. The newest month's is /archive, which shows it open.
 */
export function sitemapEntries(today: string): MetadataRoute.Sitemap {
  const months = archiveMonths(getArchivePicks(today));
  const archive = new Set(["/archive", ...months.map((month) => monthPath(months, month.key))]);
  const days = getDailyPicksRange(getLaunchDate(), today).map((pick) => `/${pick.featuredDate}`);
  return ["/", ...archive, ...days].map((path) => ({ url: `${SITE_URL}${path}` }));
}

/**
 * The feed on the site day `today`, as RSS: the newest daily picks, today's first, each a link to its day's page under the title and
 * description that page gives, dated the moment its day began.
 */
export function feedXml(today: string): string {
  const items = getDailyPicksRange(getLaunchDate(), today)
    .slice(0, FEED_DAYS)
    .map(({ featuredDate }) => {
      const { title, description } = describeDay(featuredDate);
      const link = `${SITE_URL}/${featuredDate}`;
      return [
        "<item>",
        `<title>${escapeXml(title)}</title>`,
        `<link>${link}</link>`,
        `<guid isPermaLink="true">${link}</guid>`,
        `<pubDate>${dayStart(featuredDate).toUTCString()}</pubDate>`,
        `<description>${escapeXml(description)}</description>`,
        "</item>",
      ].join("");
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Dead Redux</title>",
    `<link>${SITE_URL}/</link>`,
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    "<language>en</language>",
    `<atom:link href="${SITE_URL}${FEED_PATH}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
