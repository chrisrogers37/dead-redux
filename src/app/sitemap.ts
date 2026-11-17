import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { sitemapEntries } from "@/lib/feeds";
import { getTodayDateStr } from "@/lib/site-day";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Each new day's page joins the sitemap when the day begins, so it is built on every request.
  await connection();
  return sitemapEntries(getTodayDateStr());
}
