import { ImageResponse } from "next/og";
import { getArchivePicks } from "@/lib/archive";
import { ShareCard } from "@/lib/share-card";

export const runtime = "edge";

export const alt = "Dead Redux — Archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const count = getArchivePicks().length;

  return new ImageResponse(
    (
      <ShareCard
        eyebrow="Archive"
        headline={`${count} show${count !== 1 ? "s" : ""} featured`}
        footer="Dead Redux · A new Grateful Dead show every day"
      />
    ),
    { ...size }
  );
}
