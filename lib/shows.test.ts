import { describe, expect, it } from "vitest";
import {
  parseEventTitle,
  resolveShow,
  formatShowDate,
  sortPast,
  type BandsintownEvent,
} from "./shows";

const baseEvent: BandsintownEvent = {
  id: "107876687",
  datetime: "2026-10-02T19:30:00",
  title: "St. Pölten, Freiraum // Album Präsentation",
  url: "https://www.bandsintown.com/e/107876687?app_id=x",
  free: false,
  venue: { name: "St. Pölten, Freiraum // Album Präsentation", city: "Sankt Pölten", country: "Austria" },
  offers: [],
};

describe("parseEventTitle", () => {
  it("zerlegt 'Stadt, Venue // Untertitel'", () => {
    expect(parseEventTitle("St. Pölten, Freiraum // Album Präsentation")).toEqual({
      city: "St. Pölten",
      venue: "Freiraum",
      subtitle: "Album Präsentation",
    });
  });
  it("kommt mit Anführungszeichen und Bindestrichen im Venue klar", () => {
    expect(parseEventTitle('Graz, Postgarage - "Spotted" // Album Präsentation')).toEqual({
      city: "Graz",
      venue: 'Postgarage - "Spotted"',
      subtitle: "Album Präsentation",
    });
  });
  it("ohne '//' bleibt Untertitel leer, ohne Komma wird alles Venue", () => {
    expect(parseEventTitle("Wien, The Loft")).toEqual({ city: "Wien", venue: "The Loft", subtitle: "" });
    expect(parseEventTitle("Szene Wien")).toEqual({ city: "", venue: "Szene Wien", subtitle: "" });
    expect(parseEventTitle(undefined)).toEqual({ city: "", venue: "", subtitle: "" });
  });
});

describe("formatShowDate", () => {
  it("deutsch: Wochentag kurz + TT.MM.JJJJ", () => {
    expect(formatShowDate("2026-10-02T19:30:00", "de")).toBe("Fr, 02.10.2026");
  });
  it("englisch: Wochentag + Monat + Tag + Jahr", () => {
    expect(formatShowDate("2026-10-02T19:30:00", "en")).toBe("Fri, Oct 2, 2026");
  });
});

describe("resolveShow", () => {
  it("ohne Override und ohne Offer: kein Ticketlink, aber RSVP + Event-URL", () => {
    const s = resolveShow(baseEvent, "de", {});
    expect(s.ticketUrl).toBeNull();
    expect(s.rsvpUrl).toContain("/e/107876687");
    expect(s.rsvpUrl).toContain("trigger=rsvp_going");
    expect(s.venue).toBe("Freiraum");
    expect(s.city).toBe("St. Pölten");
  });

  it("Bandsintown-Offer wird genutzt, wenn kein Override", () => {
    const ev = { ...baseEvent, offers: [{ type: "Presale", status: "available", url: "https://www.bandsintown.com/t/1" }] };
    const s = resolveShow(ev, "de", {});
    expect(s.ticketUrl).toBe("https://www.bandsintown.com/t/1");
    expect(s.ticketSource).toBe("bandsintown");
  });

  it("Override schlägt Offer; interne Pfade bekommen den Locale-Prefix", () => {
    const ev = { ...baseEvent, offers: [{ type: "Presale", status: "available", url: "https://www.bandsintown.com/t/1" }] };
    const s = resolveShow(ev, "en", { "107876687": { tickets: "/tickets" } });
    expect(s.ticketUrl).toBe("/en/tickets");
    expect(s.ticketSource).toBe("override");
    expect(s.external).toBe(false);
  });

  it("Override korrigiert Venue/Stadt und liefert lokalisierte Notiz", () => {
    const s = resolveShow(baseEvent, "de", {
      "107876687": { tickets: "https://close2fan.com/x", venue: "Freiraum", city: "St. Pölten", note: { de: "mit Roman James", en: "with Roman James" } },
    });
    expect(s.ticketUrl).toBe("https://close2fan.com/x");
    expect(s.external).toBe(true);
    expect(s.note).toBe("mit Roman James");
    expect(resolveShow(baseEvent, "en", { "107876687": { note: { de: "a", en: "b" } } }).note).toBe("b");
  });

  it("Offer mit Status != available zählt nicht als Ticketlink", () => {
    const ev = { ...baseEvent, offers: [{ type: "Tickets", status: "sold_out", url: "https://x" }] };
    expect(resolveShow(ev, "de", {}).ticketUrl).toBeNull();
  });

  it("leerer Titel (alte Events): venue.name + venue.city direkt, nicht zerlegen", () => {
    const ev = { ...baseEvent, title: "", venue: { name: "Now. // Hafenstadt, Klagenfurt", city: "Klagenfurt am Wörthersee" } };
    const s = resolveShow(ev, "de", {});
    expect(s.venue).toBe("Now. // Hafenstadt, Klagenfurt");
    expect(s.city).toBe("Klagenfurt am Wörthersee");
    expect(s.subtitle).toBe("");
  });

  it("free-Flag wird durchgereicht", () => {
    expect(resolveShow({ ...baseEvent, free: true }, "de", {}).isFree).toBe(true);
  });
});

describe("sortPast", () => {
  it("filtert Fremd-Events vor 2024, sortiert neueste zuerst, begrenzt", () => {
    const mk = (id: string, d: string) => ({ ...baseEvent, id, datetime: d });
    const out = sortPast([mk("a", "2018-02-07T20:00:00"), mk("b", "2024-10-10T20:00:00"), mk("c", "2025-11-04T20:00:00")], 5);
    expect(out.map((e) => e.id)).toEqual(["c", "b"]);
    expect(sortPast([mk("b", "2024-10-10T20:00:00"), mk("c", "2025-11-04T20:00:00")], 1).map((e) => e.id)).toEqual(["c"]);
  });
});
