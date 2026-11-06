import type { NextConfig } from "next";

/** The browser features a page may use: the player's sound, the share sheet, copying a link and keeping the screen awake. It refuses
 *  the rest. */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=(self)",
  "bluetooth=()",
  "browsing-topics=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "gamepad=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "idle-detection=()",
  "local-fonts=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=(self)",
  "serial=()",
  "usb=()",
  "web-share=(self)",
  "window-management=()",
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
