import { ImageResponse } from "next/og";
import { Tile } from "@/lib/mark";

export const dynamic = "force-static";

const size = 192;

/* The 192 px home-screen icon the manifest lists: the mark on its tile, built once. */
export function GET() {
  return new ImageResponse(<Tile size={size} />, { width: size, height: size });
}
