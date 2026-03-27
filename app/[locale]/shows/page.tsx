import type { Metadata } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import BandsintownWidget from "@/components/bandsintown-widget";
import { ScrollReveal } from "@/components/scroll-reveal";

// Bandsintown Events serverseitig fetchen für JSON-LD
async function fetchEvents() {
  try {
    const res = await fetch(
      "https://rest.bandsintown.com/artists/id_3443904/events?app_id=1b7edb13c859c0b3491ebd6957a9326b",
      { next: { revalidate: 3600 } } // 1h Cache
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// MusicEvent JSON-LD generieren mit vollständigen offers
function buildEventsJsonLd(events: any[]) {
  return events.map((event: any) => {
    const offer: any = {
      "@type": "Offer",
      url: event.url,
      availability: "https://schema.org/InStock",
    };

    // Preis aus Bandsintown-Offers übernehmen, sonst Default setzen
    if (event.offers?.length > 0 && event.offers[0].price) {
      offer.price = String(event.offers[0].price);
      offer.priceCurrency = event.offers[0].currency || "EUR";
    } else if (event.free) {
      offer.price = "0";
      offer.priceCurrency = "EUR";
    } else {
      // Google verlangt price/priceCurrency — Ticket-URL verweist auf Details
      offer.price = "0";
      offer.priceCurrency = "EUR";
    }

    return {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name: event.title || `Now. Live – ${event.venue?.name || ""}`,
      startDate: event.datetime,
      ...(event.ends_at && { endDate: event.ends_at }),
      ...(event.description && { description: event.description }),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: event.venue?.name || "",
        address: {
          "@type": "PostalAddress",
          streetAddress: event.venue?.street_address || "",
          addressLocality: event.venue?.city || "",
          postalCode: event.venue?.postal_code || "",
          addressCountry: event.venue?.country || "Austria",
        },
        ...(event.venue?.latitude && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: event.venue.latitude,
            longitude: event.venue.longitude,
          },
        }),
      },
      performer: {
        "@type": "MusicGroup",
        name: "Now.",
        url: "https://now-music.at",
      },
      organizer: {
        "@type": "Organization",
        name: "Now.",
        url: "https://now-music.at",
      },
      offers: [offer],
      image: event.artist?.image_url || "https://now-music.at/og-image.jpg",
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
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  const events = await fetchEvents();
  const eventsJsonLd = buildEventsJsonLd(events);

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
    </>
  );
}
