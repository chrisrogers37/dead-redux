import { ImageResponse } from "next/og";
import { getDailyShow } from "@/lib/daily-show";
import { getTodayDateStr } from "@/lib/site-day";
import { formatDate } from "@/lib/format";
import { ShareCard } from "@/lib/share-card";

export const runtime = "edge";

export const alt = "Dead Redux — Today's Grateful Dead Show";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const today = getTodayDateStr();
  const show = getDailyShow(today);

  return new ImageResponse(
    (
      <ShareCard
        eyebrow={`Today’s show · ${formatDate(today)}`}
        headline={formatDate(show.date)}
        line={`${show.venue} · ${show.location}`}
        footer="Dead Redux · A new Grateful Dead show every day"
      />
    ),
    { ...size }
  );
}
