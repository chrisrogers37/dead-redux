import { ImageResponse } from "next/og";
import { getDailyPicksRange, getLaunchDate } from "@/lib/archive";
import { getTodayDateStr } from "@/lib/daily-show";

export const runtime = "edge";

export const alt = "Dead Redux — Archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const today = getTodayDateStr();
  const launch = getLaunchDate();
  const count = today >= launch
    ? getDailyPicksRange(launch, today).length
    : 0;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#0D0D0F",
          color: "#F5E6C8",
          padding: "60px",
          position: "relative",
        }}
      >
        {/* Subtle background gradient */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(26,58,107,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(212,42,42,0.12) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Top: Site name */}
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#D4A843",
            marginBottom: 20,
            display: "flex",
          }}
        >
          Dead Redux
        </div>

        {/* Lightning bolt divider */}
        <div
          style={{
            width: 200,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, #D42A2A, #F5E6C8, #1A3A6B, transparent)",
            marginBottom: 40,
            display: "flex",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontFamily: "serif",
            textAlign: "center",
            lineHeight: 1.2,
            display: "flex",
          }}
        >
          Archive
        </div>

        {/* Show count */}
        <div
          style={{
            fontSize: 28,
            color: "#E8DCC8",
            opacity: 0.7,
            marginTop: 20,
            display: "flex",
          }}
        >
          {count} show{count !== 1 ? "s" : ""} featured
        </div>

        {/* Bottom: CTA */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 18,
            color: "#E8DCC8",
            opacity: 0.4,
            display: "flex",
          }}
        >
          A new Grateful Dead show every day
        </div>
      </div>
    ),
    { ...size }
  );
}
