import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
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
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dead Redux",
    "theme-color": "#0D0D0F",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="bg-dead-ink text-dead-cream antialiased font-body">
        {children}
      </body>
    </html>
  );
}
