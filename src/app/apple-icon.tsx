import { ImageResponse } from "next/og";
import { Tile } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/* The mark at the touch-icon size, on an opaque square tile. */
export default function AppleIcon() {
  return new ImageResponse(<Tile size={180} />, { ...size });
}
