import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Navigation from "@/components/navigation";
import Footer from "@/components/footer";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={cormorant.variable}>
      <body>
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
