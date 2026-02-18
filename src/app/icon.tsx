import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0D0F",
          borderRadius: "6px",
        }}
      >
        {/* Simplified SYF — circle with lightning bolt */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer circle */}
          <circle cx="100" cy="100" r="90" stroke="#F5E6C8" strokeWidth="8" />
          {/* Lightning bolt */}
          <path
            d="M100 10 L115 90 L85 90 L100 190"
            stroke="#D42A2A"
            strokeWidth="8"
            fill="none"
          />
          {/* Left half fill */}
          <path
            d="M100 10 A90 90 0 0 0 100 190 L85 90 L115 90 Z"
            fill="#1A3A6B"
            opacity="0.6"
          />
          {/* Right half fill */}
          <path
            d="M100 10 A90 90 0 0 1 100 190 L85 90 L115 90 Z"
            fill="#D42A2A"
            opacity="0.6"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
