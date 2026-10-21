import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/* The favicon's disc and bolt at the touch-icon size, on an opaque square tile. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D" }}>
        <svg width="180" height="180" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="77" fill="#E8B04B" />
          <path d="M100 23 A77 77 0 0 1 100 177 L86 106 L114 94 Z" fill="#D6508A" />
          <circle cx="100" cy="100" r="77" fill="none" stroke="#ECEAE4" strokeWidth="6" />
          <path d="M100 23 L114 94 L86 106 L100 177" fill="none" stroke="#0B0B0D" strokeWidth="10" strokeLinecap="square" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
