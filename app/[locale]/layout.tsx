import { notFound } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import { isValidLocale, type Locale } from "@/lib/i18n";
import Navigation from "@/components/navigation";
import Footer from "@/components/footer";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-heading",
  display: "swap",
});

export function generateStaticParams() {
  return [{ locale: "de" }, { locale: "en" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return (
    <html lang={locale} className={cormorant.variable}>
      <body>
        <Navigation locale={locale as Locale} />
        <main>{children}</main>
        <Footer locale={locale as Locale} />
      </body>
    </html>
  );
}
