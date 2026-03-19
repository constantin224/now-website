import { notFound } from "next/navigation";
import { isValidLocale, type Locale } from "@/lib/i18n";
import { fontVariables } from "@/app/layout";
import Navigation from "@/components/navigation";
import Footer from "@/components/footer";
import NewReleasePopup from "@/components/new-release-popup";
import { getLatestRelease } from "@/lib/deezer";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";

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

  const latestRelease = await getLatestRelease();

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <Navigation locale={locale as Locale} />
        <SmoothScrollProvider>
          <main>{children}</main>
        </SmoothScrollProvider>
        <Footer locale={locale as Locale} />
        {latestRelease && (
          <NewReleasePopup release={latestRelease} locale={locale} />
        )}
      </body>
    </html>
  );
}
