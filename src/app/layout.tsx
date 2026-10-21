import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono } from "next/font/google";
import "./globals.css";

const grotesk = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-grotesk", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Dead Redux",
  description: "A new Grateful Dead show every day",
  metadataBase: new URL("https://dead-redux.vercel.app"),
  openGraph: { type: "website", siteName: "Dead Redux", title: "Dead Redux", description: "A new Grateful Dead show every day" },
  twitter: { card: "summary_large_image" },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dead Redux",
    "theme-color": "#0B0B0D",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <head>
        {/* Lets the world's modules import three.js and its addons by bare name. */}
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify({ imports: { three: "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/" } }) }} />
      </head>
      <body className="bg-page text-ink antialiased font-grotesk">{children}</body>
    </html>
  );
}
