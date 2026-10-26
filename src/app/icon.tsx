import { ImageResponse } from "next/og";
import { Mark } from "@/lib/mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/* The mark at the favicon size, on a rounded tile of the page colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", borderRadius: 6 }}>
        <Mark size={32} />
      </div>
    ),
    { ...size }
  );
}
