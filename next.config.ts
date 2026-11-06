import type { NextConfig } from "next";

/** The browser features no page uses, which every page refuses. The four the player uses keep their default, the site's own pages:
 *  autoplay for its sound, web-share for the share sheet, clipboard-write for copying a link, and screen-wake-lock. */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "clipboard-read=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "gamepad=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Every response's headers. The Content-Security-Policy is a page's own, from src/proxy.ts, since its nonce is new on every request.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
