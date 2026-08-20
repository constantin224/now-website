import type { Locale } from "@/lib/i18n";
import { showOverrides, type ShowOverride } from "@/data/show-tickets";

// Bandsintown Artist „Now." — Public-API ist nur lesend, app_id ist public by design.
export const BANDSINTOWN_ARTIST_ID = "3443904";
export const BANDSINTOWN_APP_ID = "1b7edb13c859c0b3491ebd6957a9326b";
const API = `https://rest.bandsintown.com/artists/id_${BANDSINTOWN_ARTIST_ID}/events`;

/** Artist-Seite mit Follow-Dialog („Track") — Besucher folgen der Band auf Bandsintown */
export const BANDSINTOWN_FOLLOW_URL = `https://www.bandsintown.com/a/${BANDSINTOWN_ARTIST_ID}-now.?came_from=267&app_id=${BANDSINTOWN_APP_ID}&trigger=track`;
export const BANDSINTOWN_ARTIST_URL = `https://www.bandsintown.com/a/${BANDSINTOWN_ARTIST_ID}-now.`;

export interface BandsintownOffer {
  type?: string;
  status?: string;
  url?: string;
}

export interface BandsintownEvent {
  id: string;
  title?: string;
  datetime: string;
  ends_at?: string;
  description?: string;
  url: string;
  free?: boolean;
  venue?: {
    name?: string;
    street_address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    latitude?: number | string;
    longitude?: number | string;
  };
  offers?: BandsintownOffer[];
  artist?: { image_url?: string };
}

/** Aufbereitete Show für die Anzeige */
export interface Show {
  id: string;
  datetime: string;
  dateLabel: string;
  venue: string;
  city: string;
  subtitle: string;
  note: string | null;
  ticketUrl: string | null;
  ticketSource: "override" | "bandsintown" | null;
  /** true = öffnet in neuem Tab (externer Ticketshop) */
  external: boolean;
  rsvpUrl: string;
  eventUrl: string;
  isFree: boolean;
}

/**
 * Bandsintown-Titel folgen bei Now. dem Muster „Stadt, Venue // Untertitel".
 * Bandsintown schreibt denselben String auch in venue.name — daher selbst zerlegen.
 */
export function parseEventTitle(title: string | undefined): { city: string; venue: string; subtitle: string } {
  if (!title) return { city: "", venue: "", subtitle: "" };
  const [head, ...rest] = title.split("//");
  const subtitle = rest.join("//").trim();
  const commaIdx = head.indexOf(",");
  if (commaIdx === -1) return { city: "", venue: head.trim(), subtitle };
  return {
    city: head.slice(0, commaIdx).trim(),
    venue: head.slice(commaIdx + 1).trim(),
    subtitle,
  };
}

/** Datum ohne Zeitzonen-Verschiebung: Bandsintown liefert lokale Zeit ohne Offset. */
export function formatShowDate(datetime: string, locale: Locale): string {
  const [y, m, d] = datetime.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (locale === "de") {
    const wd = new Intl.DateTimeFormat("de-AT", { weekday: "short", timeZone: "UTC" }).format(date).replace(".", "");
    return `${wd}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function firstAvailableOffer(offers: BandsintownOffer[] | undefined): string | null {
  const hit = offers?.find((o) => o.url && (o.status ?? "available").toLowerCase() === "available");
  return hit?.url ?? null;
}

function eventIdFromUrl(url: string): string | null {
  const m = url.match(/\/e\/(\d+)/);
  return m ? m[1] : null;
}

export function resolveShow(
  event: BandsintownEvent,
  locale: Locale,
  overrides: Record<string, ShowOverride> = showOverrides,
): Show {
  const id = String(event.id ?? eventIdFromUrl(event.url) ?? "");
  const ov = overrides[id] ?? {};
  // Upcoming-Events tragen den Namen im Titel („Stadt, Venue // Untertitel");
  // ältere Events haben leeren Titel und den Namen in venue.name → nicht zerlegen.
  const parsed = event.title
    ? parseEventTitle(event.title)
    : { city: event.venue?.city ?? "", venue: event.venue?.name ?? "", subtitle: "" };

  let ticketUrl: string | null = null;
  let ticketSource: Show["ticketSource"] = null;
  if (ov.tickets) {
    ticketUrl = ov.tickets.startsWith("/") ? `/${locale}${ov.tickets}` : ov.tickets;
    ticketSource = "override";
  } else {
    const offer = firstAvailableOffer(event.offers);
    if (offer) {
      ticketUrl = offer;
      ticketSource = "bandsintown";
    }
  }

  const eventUrl = `https://www.bandsintown.com/e/${id}?came_from=267&app_id=${BANDSINTOWN_APP_ID}`;

  return {
    id,
    datetime: event.datetime,
    dateLabel: formatShowDate(event.datetime, locale),
    venue: ov.venue || parsed.venue || event.venue?.name || "",
    city: ov.city || parsed.city || event.venue?.city || "",
    subtitle: parsed.subtitle,
    note: ov.note ? ov.note[locale] ?? ov.note.de : null,
    ticketUrl,
    ticketSource,
    external: !!ticketUrl && !ticketUrl.startsWith("/"),
    rsvpUrl: `${eventUrl}&trigger=rsvp_going`,
    eventUrl,
    isFree: !!event.free,
  };
}

async function fetchEvents(range: "upcoming" | "past"): Promise<BandsintownEvent[]> {
  try {
    const res = await fetch(`${API}?app_id=${BANDSINTOWN_APP_ID}&date=${range}`, {
      next: { revalidate: 3600 }, // 1 h Cache, zusätzlich täglicher Revalidate-Cron
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export interface ShowsResult {
  upcoming: BandsintownEvent[];
  past: BandsintownEvent[];
  /** true wenn die API gar nichts lieferte (Netzfehler) — Fallback-Hinweis zeigen */
  failed: boolean;
}

/** Erste Now.-Show war 2024 — ältere Einträge auf Bandsintown sind Fremd-Events (Namenskollision). */
export const PAST_SINCE = "2024-01-01";

export function sortPast(events: BandsintownEvent[], limit = 12): BandsintownEvent[] {
  return events
    .filter((e) => e.datetime >= PAST_SINCE)
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, limit);
}

export async function fetchShows(): Promise<ShowsResult> {
  const [upcoming, pastRaw] = await Promise.all([fetchEvents("upcoming"), fetchEvents("past")]);
  return { upcoming, past: sortPast(pastRaw), failed: upcoming.length === 0 && pastRaw.length === 0 };
}
