import { describe, expect, it } from "vitest";
import { getLaunchDate } from "../archive";
import { FEED_DAYS, feedXml, sitemapEntries } from "../feeds";

const SITE = "https://dead-redux.vercel.app";

// The site day archive.test.ts uses, passed in so that no test reads the clock.
const TODAY = "2026-10-20";

const urls = (today: string) => sitemapEntries(today).map((entry) => entry.url);

describe("sitemapEntries", () => {
  it("lists the home page and the archive first", () => {
    expect(urls(TODAY).slice(0, 2)).toEqual([`${SITE}/`, `${SITE}/archive`]);
  });

  it("lists each month at its own page but the newest, which is /archive's", () => {
    const months = urls(TODAY).filter((url) => url.startsWith(`${SITE}/archive/`));
    const keys = ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"];
    expect(months).toEqual(keys.map((key) => `${SITE}/archive/${key}`));
  });

  it("lists each featured day's page from launch through today", () => {
    const days = urls(TODAY).filter((url) => /\/\d{4}-\d{2}-\d{2}$/.test(url));
    // The archive's 246 days and today.
    expect(days).toHaveLength(247);
    expect(days[0]).toBe(`${SITE}/2026-10-20`);
    expect(days[days.length - 1]).toBe(`${SITE}/${getLaunchDate()}`);
  });

  it("lists every page once, and nothing else", () => {
    const all = urls(TODAY);
    expect(all).toHaveLength(1 + 1 + 8 + 247);
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists the month just closed as /archive on the first of a month, and at its own page from the second", () => {
    const first = urls("2026-11-01");
    expect(first).not.toContain(`${SITE}/archive/2026-10`);
    expect(first).toContain(`${SITE}/2026-11-01`);
    const second = urls("2026-11-02");
    expect(second).toContain(`${SITE}/archive/2026-10`);
    expect(second).not.toContain(`${SITE}/archive/2026-11`);
  });

  it("lists the archive on launch day, before it has a month", () => {
    expect(urls(getLaunchDate())).toEqual([`${SITE}/`, `${SITE}/archive`, `${SITE}/${getLaunchDate()}`]);
  });
});

describe("feedXml", () => {
  const xml = feedXml(TODAY);
  const items = xml.match(/<item>.*?<\/item>/g) ?? [];

  it("is an RSS channel for the site that names its own address", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(xml).toContain("<title>Dead Redux</title>");
    expect(xml).toContain(`<link>${SITE}/</link>`);
    expect(xml).toContain("<description>A new Grateful Dead show every day</description>");
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>`);
    expect(xml.endsWith("</channel>\n</rss>")).toBe(true);
  });

  it("carries the newest month of daily picks, today's first", () => {
    expect(items).toHaveLength(FEED_DAYS);
    const links = items.map((item) => item.match(/<link>(.*?)<\/link>/)?.[1]);
    expect(links.slice(0, 2)).toEqual([`${SITE}/2026-10-20`, `${SITE}/2026-10-19`]);
    expect(links[FEED_DAYS - 1]).toBe(`${SITE}/2026-09-21`);
  });

  it("links each pick to its day's page, under that page's title and description, dated when its day began", () => {
    expect(items[0]).toBe(
      "<item>" +
        "<title>Rich Stadium — 1986-07-04</title>" +
        `<link>${SITE}/2026-10-20</link>` +
        `<guid isPermaLink="true">${SITE}/2026-10-20</guid>` +
        "<pubDate>Tue, 20 Oct 2026 04:00:00 GMT</pubDate>" +
        "<description>Featured on October 20, 2026: Rich Stadium, Buffalo, NY, USA, July 4, 1986</description>" +
        "</item>"
    );
  });

  it("escapes an ampersand in a venue's name", () => {
    // 2026-06-10 featured 1971-04-10, at East Hall, Franklin & Marshall College.
    const june = feedXml("2026-06-20");
    expect(june).toContain("<title>East Hall Franklin &amp; Marshall Col. — 1971-04-10</title>");
    expect(june).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });

  it("carries every pick since launch while there are fewer than a month of them", () => {
    expect(feedXml(getLaunchDate()).match(/<item>/g)).toHaveLength(1);
  });
});
