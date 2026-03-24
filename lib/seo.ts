import type { Metadata } from "next";
import type { Locale } from "./i18n";

const baseUrl = "https://now-music.at";

// Gemeinsame Metadata-Felder für alle Seiten (hreflang, OG-Locale)
export function localeMetadata(locale: Locale, path: string): Partial<Metadata> {
  return {
    alternates: {
      canonical: `${baseUrl}/${locale}${path}`,
      languages: {
        de: `${baseUrl}/de${path}`,
        en: `${baseUrl}/en${path}`,
        "x-default": `${baseUrl}/de${path}`,
      },
    },
    openGraph: {
      locale: locale === "de" ? "de_AT" : "en_US",
      url: `${baseUrl}/${locale}${path}`,
    },
  };
}
