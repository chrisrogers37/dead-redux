import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
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
  twitter: { card: "summary_large_image" },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dead Redux",
    "theme-color": "#1A1613",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body className="bg-page text-ink antialiased font-mono">{children}</body>
    </html>
  );
}
