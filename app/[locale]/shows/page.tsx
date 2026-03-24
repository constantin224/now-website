import type { Metadata } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import BandsintownWidget from "@/components/bandsintown-widget";
import { ScrollReveal } from "@/components/scroll-reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.shows.title,
    description: t.shows.description,
    ...localeMetadata(locale as Locale, "/shows"),
  };
}

export default async function ShowsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
      <div className="max-w-4xl mx-auto">
        {/* H1 — visuell als Section Label */}
        <h1 className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
          {t.shows.title}
        </h1>

        {/* Bandsintown Widget — automatisch synchronisiert */}
        <ScrollReveal className="min-h-[200px]">
          <BandsintownWidget />
        </ScrollReveal>

        {/* Booking CTA */}
        <ScrollReveal className="text-center mt-[var(--spacing-block)] pt-12">
          <p className="text-sand/40 text-sm">
            {t.shows.booking_label}{" "}
            <a
              href="mailto:andreas@oton-agentur.at"
              className="text-terracotta hover:text-terracotta/80 transition-colors"
            >
              andreas@oton-agentur.at
            </a>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
