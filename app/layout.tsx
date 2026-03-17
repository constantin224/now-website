import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Now. — Pop Rock aus Wien", template: "%s | Now." },
  description:
    "Now. ist eine Pop-Rock-Band aus Wien. Erdige Songs, ehrliche Texte, live auf der Bühne zuhause.",
  openGraph: {
    type: "website",
    locale: "de_AT",
    url: "https://now-music.at",
    siteName: "Now.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
};

// Font-Variable exportieren für Locale-Layout
export const fontVariable = cormorant.variable;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
