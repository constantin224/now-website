import type { Metadata } from "next";
import { getUpcomingShows, getPastShows, formatShowDate } from "@/lib/shows";

export const metadata: Metadata = {
  title: "Shows",
};

export default function ShowsPage() {
  const upcoming = getUpcomingShows();
  const past = getPastShows();

  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Section Label */}
        <p className="text-terracotta uppercase tracking-[4px] text-[11px] text-center mb-12">
          Shows
        </p>

        {/* Upcoming Shows */}
        {upcoming.length > 0 ? (
          <div className="mb-16">
            <p className="text-terracotta uppercase tracking-[4px] text-[11px] mb-6">
              Upcoming Shows
            </p>
            <div>
              {upcoming.map((show) => (
                <div
                  key={`${show.date}-${show.venue}`}
                  className="flex justify-between items-center py-4 border-b border-line"
                >
                  <div className="flex items-center gap-6">
                    <span className="w-20 text-sm tracking-wider text-sand/70">
                      {formatShowDate(show.date)}
                    </span>
                    <span className="text-sand/80">{show.venue}</span>
                    <span className="text-sand/50 text-sm">{show.city}</span>
                  </div>
                  {show.ticketUrl ? (
                    <a
                      href={show.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[8px] tracking-[2px] uppercase px-3 py-1 rounded-full hover:bg-terracotta/20 transition-colors"
                    >
                      Tickets
                    </a>
                  ) : (
                    <span className="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[8px] tracking-[2px] uppercase px-3 py-1 rounded-full">
                      Free Entry
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Booking CTA wenn keine Upcoming Shows */
          <div className="text-center mb-16 py-12">
            <p className="text-sand/50 mb-2">Keine Shows geplant.</p>
            <p className="text-sand/50">
              Für Booking-Anfragen:{" "}
              <a
                href="mailto:booking@now-music.at"
                className="text-terracotta hover:text-terracotta/80 transition-colors"
              >
                booking@now-music.at
              </a>
            </p>
          </div>
        )}

        {/* Past Shows */}
        {past.length > 0 && (
          <div>
            <p className="text-sand-38 uppercase tracking-[4px] text-[11px] mb-6">
              Past Shows
            </p>
            <div>
              {past.map((show) => (
                <div
                  key={`${show.date}-${show.venue}`}
                  className="flex justify-between items-center py-4 border-b border-line"
                >
                  <div className="flex items-center gap-6">
                    <span className="w-20 text-sm tracking-wider text-sand/40">
                      {formatShowDate(show.date)}
                    </span>
                    <span className="text-sand/45">{show.venue}</span>
                    <span className="text-sand/35 text-sm">{show.city}</span>
                  </div>
                  <span className="bg-sand/5 text-sand-38 border border-sand/8 text-[8px] tracking-[2px] uppercase px-3 py-1 rounded-full">
                    Played
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking CTA auch wenn Shows vorhanden */}
        {(upcoming.length > 0 || past.length > 0) && (
          <div className="text-center mt-16 pt-12 border-t border-line">
            <p className="text-sand/40 text-sm">
              Booking:{" "}
              <a
                href="mailto:booking@now-music.at"
                className="text-terracotta hover:text-terracotta/80 transition-colors"
              >
                booking@now-music.at
              </a>
            </p>
          </div>
        )}

        {/* JSON-LD Event Schema für Upcoming Shows */}
        {upcoming.map((show) => (
          <script
            key={`schema-${show.date}-${show.venue}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "MusicEvent",
                name: `Now. live @ ${show.venue}`,
                startDate: show.date,
                location: {
                  "@type": "Place",
                  name: show.venue,
                  address: {
                    "@type": "PostalAddress",
                    addressLocality: show.city,
                  },
                },
                performer: {
                  "@type": "MusicGroup",
                  name: "Now.",
                },
                ...(show.ticketUrl && {
                  offers: {
                    "@type": "Offer",
                    url: show.ticketUrl,
                  },
                }),
              }),
            }}
          />
        ))}
      </div>
    </section>
  );
}
