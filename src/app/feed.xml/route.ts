import { connection } from "next/server";
import { feedXml } from "@/lib/feeds";
import { getTodayDateStr } from "@/lib/site-day";

export async function GET() {
  // Today's pick joins the feed when the day begins, so it is built on every request.
  await connection();
  return new Response(feedXml(getTodayDateStr()), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
