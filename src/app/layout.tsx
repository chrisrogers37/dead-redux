import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { PsychedelicClouds } from "@/components/PsychedelicClouds";
import { PastelRainbow } from "@/components/PastelRainbow";
import "./globals.css";

const displayFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dead Redux",
  description: "A new Grateful Dead show every day",
  metadataBase: new URL("https://dead-redux.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Dead Redux",
    title: "Dead Redux",
    description: "A new Grateful Dead show every day",
  },
  twitter: {
    card: "summary_large_image",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Dead Redux",
    "theme-color": "#FFF8F0",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="bg-dead-ink text-dead-bone antialiased font-body">
        {/* Background rainbow — large, behind everything */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 opacity-30 pointer-events-none" aria-hidden="true">
          <PastelRainbow size="large" />
        </div>
        <PsychedelicClouds />
        {children}
      </body>
    </html>
  );
}
