import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/* A disc split by the bolt into two halves; the bolt is a gap in the tile colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1A1613", borderRadius: 6 }}>
        <svg width="32" height="32" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="77" fill="#D4A843" />
          <path d="M100 23 A77 77 0 0 1 100 177 L86 106 L114 94 Z" fill="#D4607A" />
          <circle cx="100" cy="100" r="77" fill="none" stroke="#F3EADB" strokeWidth="6" />
          <path d="M100 23 L114 94 L86 106 L100 177" fill="none" stroke="#1A1613" strokeWidth="10" strokeLinecap="square" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
