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
