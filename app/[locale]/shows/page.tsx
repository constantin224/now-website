import type { Metadata } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { fetchShows, resolveShow, type BandsintownEvent } from "@/lib/shows";
import { ShowList } from "@/components/show-list";
import { ScrollReveal } from "@/components/scroll-reveal";

const SITE = "https://now-music.at";

// MusicEvent JSON-LD — Offer-URL zeigt auf den echten Ticketshop (Override > Bandsintown)
function buildEventsJsonLd(events: BandsintownEvent[], locale: Locale) {
  return events.map((event) => {
    const show = resolveShow(event, locale);
    const offerUrl = show.ticketUrl
      ? show.ticketUrl.startsWith("/")
        ? `${SITE}${show.ticketUrl}`
        : show.ticketUrl
      : show.eventUrl;

    return {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name: event.title || `Now. Live – ${show.venue}`,
      startDate: event.datetime,
      ...(event.ends_at && { endDate: event.ends_at }),
      ...(event.description && { description: event.description }),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: show.venue || event.venue?.name || "",
        address: {
          "@type": "PostalAddress",
          streetAddress: event.venue?.street_address || "",
          addressLocality: show.city || event.venue?.city || "",
          postalCode: event.venue?.postal_code || "",
          addressCountry: event.venue?.country || "Austria",
        },
        ...(event.venue?.latitude && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: Number(event.venue.latitude),
            longitude: Number(event.venue.longitude),
          },
        }),
      },
      performer: { "@type": "MusicGroup", name: "Now.", url: SITE },
      organizer: { "@type": "Organization", name: "Now.", url: SITE },
      offers: [
        {
          "@type": "Offer",
          url: offerUrl,
          availability: show.ticketUrl
            ? "https://schema.org/InStock"
            : "https://schema.org/PreOrder",
          // Google verlangt price/priceCurrency; 0 = kein fixer Preis bekannt
          price: "0",
          priceCurrency: "EUR",
        },
      ],
      image: event.artist?.image_url || `${SITE}/og-image.jpg`,
    };
  });
}

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
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = getMessages(locale);
  const { upcoming, past, failed } = await fetchShows();
  const eventsJsonLd = buildEventsJsonLd(upcoming, locale);

  return (
    <>
      {/* Strukturierte Daten für Google — serverseitig gerendert */}
      {eventsJsonLd.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
        />
      )}
      <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
        <div className="max-w-4xl mx-auto">
          {/* H1 — visuell als Section Label */}
          <h1 className="font-heading font-light text-terracotta uppercase tracking-[0.2em] text-2xl md:text-3xl text-center mb-12">
            {t.shows.title}
          </h1>

          {/* Hinweis-Banner zur Ticket-Börse — dezent, aber auffindbar */}
          <a
            href={`/${locale}/tickets`}
            className="block border border-line rounded-lg px-5 py-3 text-sm text-sand/70 hover:text-terracotta hover:border-terracotta/30 transition-colors mb-10"
          >
            {t.shows.tickerBanner}
          </a>

          {/* Show-Liste — Bandsintown-Daten, eigenes Rendering */}
          <ScrollReveal className="min-h-[200px]">
            <ShowList upcoming={upcoming} past={past} failed={failed} locale={locale} />
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
    </>
  );
}
