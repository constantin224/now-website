import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Navigation from "@/components/navigation";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Now. — Pop Rock aus Wien",
  description:
    "Now. ist eine Pop-Rock-Band aus Wien. Erdige Songs, ehrliche Texte, live auf der Bühne zuhause.",
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
      </body>
    </html>
  );
}
