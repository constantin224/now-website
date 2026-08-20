import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";
import {
  BANDSINTOWN_ARTIST_URL,
  BANDSINTOWN_FOLLOW_URL,
  resolveShow,
  type BandsintownEvent,
  type Show,
} from "@/lib/shows";

// Eigene Show-Liste statt Bandsintown-Widget: gleiche Daten (REST-API),
// aber klarer Ticket-Button, deutsche Labels und keine 15-s-Restyle-Hacks.
// Server-Component — kein JS beim Besucher nötig.

const pill =
  "inline-flex items-center justify-center rounded-full text-[10px] tracking-[2px] uppercase transition-colors";

function TicketButton({ show, label, soon }: { show: Show; label: string; soon: string }) {
  if (!show.ticketUrl) {
    return (
      <span
        className={`${pill} border border-line text-sand/40 px-5 py-2.5 cursor-default`}
        aria-disabled="true"
      >
        {soon}
      </span>
    );
  }
  const extern = show.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <a
      href={show.ticketUrl}
      {...extern}
      className={`${pill} bg-terracotta text-bg-base font-semibold px-6 py-2.5 hover:bg-terracotta/85 min-w-[150px]`}
    >
      {label} →
    </a>
  );
}

function ShowRow({ show, t, past }: { show: Show; t: ReturnType<typeof getMessages>["shows"]; past?: boolean }) {
  return (
    <li className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6 border-b border-line py-5">
      <div className="flex-1 min-w-0">
        <p className={`text-sm tracking-[0.05em] ${past ? "text-sand/50" : "text-sand/80"}`}>
          <time dateTime={show.datetime}>{show.dateLabel}</time>
        </p>
        <p className={`mt-1 text-base ${past ? "text-sand/50" : "text-terracotta"}`}>
          {show.venue}
          {show.city && <span className="text-sand/50"> · {show.city}</span>}
        </p>
        {(show.note || show.subtitle) && !past && (
          <p className="mt-0.5 text-sm text-sand/50">{show.note ?? show.subtitle}</p>
        )}
      </div>

      {!past && (
        <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-2 shrink-0">
          {show.isFree ? (
            <span className={`${pill} border border-terracotta/30 text-terracotta px-5 py-2.5`}>{t.free_entry}</span>
          ) : (
            <TicketButton show={show} label={t.tickets} soon={t.tickets_soon} />
          )}
          <a
            href={show.rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] tracking-[2px] uppercase text-sand/50 hover:text-terracotta"
          >
            {t.rsvp}
          </a>
        </div>
      )}
    </li>
  );
}

export function ShowList({
  upcoming,
  past,
  failed,
  locale,
}: {
  upcoming: BandsintownEvent[];
  past: BandsintownEvent[];
  failed: boolean;
  locale: Locale;
}) {
  const t = getMessages(locale).shows;
  const upcomingShows = upcoming.map((e) => resolveShow(e, locale));
  const pastShows = past.map((e) => resolveShow(e, locale));

  return (
    <div>
      <h2 className="font-body text-sand/80 text-sm font-semibold tracking-[0.05em] border-b border-line pb-3">
        {t.upcoming}
      </h2>

      {failed ? (
        <p className="py-10 text-center text-sm text-sand/50">
          {t.load_error}{" "}
          <a href={BANDSINTOWN_ARTIST_URL} target="_blank" rel="noopener noreferrer" className="text-terracotta">
            Bandsintown →
          </a>
        </p>
      ) : upcomingShows.length === 0 ? (
        <p className="py-10 text-center text-sm text-sand/50">{t.no_shows}</p>
      ) : (
        <ul>
          {upcomingShows.map((s) => (
            <ShowRow key={s.id} show={s} t={t} />
          ))}
        </ul>
      )}

      {/* Bandsintown folgen — Besucher bekommen Benachrichtigungen zu neuen Shows */}
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <a
          href={BANDSINTOWN_FOLLOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${pill} border border-terracotta/30 text-terracotta bg-terracotta/10 hover:bg-terracotta/20 px-6 py-3`}
        >
          {t.follow}
        </a>
        <p className="text-xs text-sand/40 max-w-sm">{t.follow_hint}</p>
      </div>

      {pastShows.length > 0 && (
        <details className="mt-12 group">
          <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sand/50 hover:text-terracotta text-sm tracking-[0.05em] select-none">
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 2l4 4-4 4" />
            </svg>
            {t.past}
          </summary>
          <ul className="mt-4">
            {pastShows.map((s) => (
              <ShowRow key={s.id} show={s} t={t} past />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
