import { ImageResponse } from "next/og";
import { Tile } from "@/lib/mark";

export const dynamic = "force-static";

const size = 512;

/* The 512 px home-screen icon the manifest lists, as drawn and under a launcher's mask: the mark on its tile, built once. */
export function GET() {
  return new ImageResponse(<Tile size={size} />, { width: size, height: size });
}
