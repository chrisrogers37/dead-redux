import { ImageResponse } from "next/og";
import { getDailyShow, isValidDateStr } from "@/lib/daily-show";
import { formatDate } from "@/lib/format";
import { ShareCard } from "@/lib/share-card";

export const runtime = "edge";

export const alt = "Dead Redux — Featured Grateful Dead Show";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  if (!isValidDateStr(date)) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#0D0D0F",
            color: "#F5E6C8",
            fontSize: 48,
            fontFamily: "serif",
          }}
        >
          Dead Redux
        </div>
      ),
      { ...size }
    );
  }

  const show = getDailyShow(date);

  return new ImageResponse(
    (
      <ShareCard
        eyebrow="Dead Redux"
        headline={show.venue}
        line={`${show.location} · ${formatDate(date)}`}
        footer="A new Grateful Dead show every day"
      />
    ),
    { ...size }
  );
}
