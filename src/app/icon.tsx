import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/* A disc split by the bolt into two halves; the bolt is a gap in the tile colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1C1A34", borderRadius: 6 }}>
        <svg width="32" height="32" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="77" fill="#F2A33A" />
          <path d="M100 23 A77 77 0 0 1 100 177 L86 106 L114 94 Z" fill="#3C8FE0" />
          <circle cx="100" cy="100" r="77" fill="none" stroke="#F1E9D8" strokeWidth="6" />
          <path d="M100 23 L114 94 L86 106 L100 177" fill="none" stroke="#1C1A34" strokeWidth="10" strokeLinecap="square" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
