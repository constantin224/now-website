// Ticket-Links + Korrekturen je Bandsintown-Event (Schlüssel = Bandsintown-Event-ID).
//
// Warum: Bandsintown liefert nur Ticket-Offers, die im Artist-Dashboard als
// „Ticket Link" eingetragen sind — das fehlt oft oder dauert bis 24 h. Diese Map
// schlägt den Bandsintown-Offer IMMER (Vorrang „override"), damit die Website
// unabhängig davon einen klaren Ticket-Button zeigt.
//
// Pflege: neues Konzert → Event-ID aus `bin/now-bandsintown-check` oder der
// Bandsintown-Event-URL (…/e/<ID>) holen, Zeile ergänzen. Interne Pfade (z.B.
// "/tickets") werden automatisch mit dem Locale-Prefix versehen.

export interface ShowOverride {
  /** Ticket-URL — extern (https://…) oder intern ("/tickets") */
  tickets?: string;
  /** Korrigierter Venue-Name (Bandsintown-Titel sind oft falsch/unsauber) */
  venue?: string;
  /** Korrigierte Stadt */
  city?: string;
  /** Zusatzzeile, lokalisiert (Support-Acts, Ausweichspielstätte …) */
  note?: { de: string; en: string };
}

export const showOverrides: Record<string, ShowOverride> = {
  // Fr 02.10.2026 — Freiraum St. Pölten (mit Roman James + Ivery), VVK 19 €
  "107876687": {
    tickets: "https://close2fan.com/de/now-roman-james-ivery-mf343n",
    venue: "Freiraum",
    city: "St. Pölten",
    note: { de: "mit Roman James & Ivery", en: "with Roman James & Ivery" },
  },
  // Fr 09.10.2026 — Livestage Innsbruck (eigenes Ticket-System)
  "107876709": {
    tickets: "https://shop.tonherd.com/products/09-10-26-now-innsbruck",
    venue: "Livestage",
    city: "Innsbruck",
  },
  // Sa 10.10.2026 — VZK Veranstaltungszentrum Klagenfurt, Doppelkonzert mit Dave McKendry, VVK 17 €
  "107876725": {
    tickets: "https://kartenzwicker.at/veranstaltungen/now-und-dave-mckendry-live-im-vzk.html",
    venue: "VZK – Veranstaltungszentrum",
    city: "Klagenfurt",
    note: { de: "Doppelkonzert mit Dave McKendry", en: "double bill with Dave McKendry" },
  },
  // Mi 14.10.2026 — Postgarage Graz, Reihe „Spotting" (Bandsintown sagt fälschlich „Spotted"), VVK 15 €
  "107876731": {
    tickets: "https://kupfticket.com/events/now",
    venue: "Postgarage",
    city: "Graz",
    note: { de: "Spotting presents: Now. // K.Cit", en: "Spotting presents: Now. // K.Cit" },
  },
  // Sa 17.10.2026 — The Loft Wien → eigene Ticket-Börse (Community-Pricing)
  "107876475": {
    tickets: "/tickets",
    venue: "The Loft",
    city: "Wien",
  },
  // Fr 27.11.2026 — Kulturhof Linz, Ausweichspielstätte Volkshaus Franckviertel (Sanierung), VVK 21 €
  "107876739": {
    tickets: "https://kupfticket.com/events/now-support",
    venue: "Volkshaus Franckviertel",
    city: "Linz",
    note: { de: "Kulturhof-Konzert im Ausweichquartier", en: "Kulturhof show at its interim venue" },
  },
};
