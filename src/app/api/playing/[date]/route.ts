import { NextResponse } from "next/server";
import { isCatalogShow, isValidDateStr } from "@/lib/daily-show";
import { flatten } from "@/lib/queue";
import { lookUpShow, pickBestSource } from "@/lib/relisten";

/**
 * The recording the site plays for a show, chosen as the page chooses it: the show date, the archive.org identifier, and each track's
 * title, duration and MP3, which is what the page sends every visitor. The maps workflow reads it, so a map comes from exactly what the
 * page serves. It answers only for the catalog's shows, the dates the pages ask Relisten about, and asks Relisten nothing for any other
 * date. Relisten's answer comes through lookUpShow, whose fetch is cached for a day and shared with the pages.
 *
 * A show Relisten has no record or no recording of gets 404. When Relisten fails to answer, the route answers 502 with the failure,
 * so a map run retries the show later instead of taking it for a missing one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDateStr(date)) return NextResponse.json({ error: "Not a show date" }, { status: 400 });
  if (!isCatalogShow(date)) return NextResponse.json({ error: "No show on this date" }, { status: 404 });
  const lookup = await lookUpShow(date);
  if (lookup.kind === "failed") return NextResponse.json({ error: lookup.reason }, { status: 502 });
  const playing = lookup.kind === "found" ? pickBestSource(lookup.details.sources) : null;
  if (!playing) return NextResponse.json({ error: "No recording of this show" }, { status: 404 });
  return NextResponse.json({
    show: date,
    identifier: playing.upstreamIdentifier,
    tracks: flatten(playing).map(({ title, duration, mp3Url }) => ({ title, duration, mp3Url })),
  });
}
