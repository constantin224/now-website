import type { Metadata } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
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
    <section className="pt-[var(--spacing-section-lg)] pb-[var(--spacing-section)] px-6">
      <div className="max-w-4xl mx-auto">
        {/* Section Label */}
        <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
          {t.shows.title}
        </p>

        {/* Bandsintown Widget — automatisch synchronisiert */}
        <ScrollReveal className="min-h-[200px]">
          <BandsintownWidget />
        </ScrollReveal>

        {/* Booking CTA */}
        <ScrollReveal className="text-center mt-[var(--spacing-block)] pt-12 border-t border-line">
          <p className="text-sand/40 text-sm">
            {t.shows.booking_label}{" "}
            <a
              href={`mailto:${t.shows.booking_email}`}
              className="text-terracotta hover:text-terracotta/80 transition-colors"
            >
              {t.shows.booking_email}
            </a>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
