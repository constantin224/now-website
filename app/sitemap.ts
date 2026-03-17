import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://now-music.at";
  const pages = ["", "/about", "/music", "/shows", "/press"];

  return locales.flatMap((locale) =>
    pages.map((page) => ({
      url: `${baseUrl}/${locale}${page}`,
      lastModified: new Date(),
      priority: page === "" ? 1 : page === "/about" || page === "/music" ? 0.8 : page === "/shows" ? 0.7 : 0.6,
    }))
  );
}
