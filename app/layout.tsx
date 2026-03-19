import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

// Font-Variablen exportieren fuer Locale-Layout
export const fontVariables = `${cormorant.variable} ${inter.variable}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
