import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Statische Dateien, API-Routes und Next.js-Interna überspringen
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // Dateien wie .jpg, .mp4, etc.
  ) {
    return;
  }

  // Prüfen ob Pfad bereits eine Locale hat
  const hasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (hasLocale) return;

  // Auf Default-Locale weiterleiten
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
