import type { MetadataRoute } from "next";

/*
 * The web app manifest: the site installs as Dead Redux, standalone from the home page, on the page colour, with the home-screen
 * icons at the two sizes a launcher asks for. The 512 px tile is listed as drawn and for a launcher's mask, which it fits.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dead Redux",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0B0D",
    theme_color: "#0B0B0D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
