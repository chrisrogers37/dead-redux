import { NextResponse } from "next/server";
import { isCatalogShow, isValidDateStr } from "@/lib/daily-show";
import { flatten } from "@/lib/queue";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";

/**
 * The recording the site plays for a show, chosen as the page chooses it: the show date, the archive.org identifier, and each track's
 * title, duration and MP3, which is what the page sends every visitor. The maps workflow reads it, so a map comes from exactly what the
 * page serves. It answers only for the catalog's shows, the dates the pages ask Relisten about, and asks Relisten nothing for any other
 * date. Relisten's answer comes through fetchShowDetails, which caches it for a day and shares it with the pages.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDateStr(date)) return NextResponse.json({ error: "Not a show date" }, { status: 400 });
  if (!isCatalogShow(date)) return NextResponse.json({ error: "No show on this date" }, { status: 404 });
  const details = await fetchShowDetails(date);
  const playing = details ? pickBestSource(details.sources) : null;
  if (!playing) return NextResponse.json({ error: "No recording of this show" }, { status: 404 });
  return NextResponse.json({
    show: date,
    identifier: playing.upstreamIdentifier,
    tracks: flatten(playing).map(({ title, duration, mp3Url }) => ({ title, duration, mp3Url })),
  });
}
