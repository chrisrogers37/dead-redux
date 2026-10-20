import { ImageResponse } from "next/og";
import { getDailyShow, getTodayDateStr } from "@/lib/daily-show";
import { formatDate } from "@/lib/format";
import { ShareCard } from "@/lib/share-card";

export const runtime = "edge";

export const alt = "Dead Redux — Today's Grateful Dead Show";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const show = getDailyShow(getTodayDateStr());

  return new ImageResponse(
    (
      <ShareCard
        eyebrow="Dead Redux"
        headline={show.venue}
        line={`${show.location} · ${formatDate(show.date)}`}
        footer="A new Grateful Dead show every day"
      />
    ),
    { ...size }
  );
}
