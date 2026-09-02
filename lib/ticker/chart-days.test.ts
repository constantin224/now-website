import { describe, expect, it } from "vitest";
import { aggregateDays, dayKey, formatDay } from "./chart-days";
import { nachtrag, parseState, type HistoryPoint } from "./engine";
import live from "./fixtures/boerse-live-2026-09-02.json";

/**
 * Tagesansicht des Charts (Constantin 02.09.: „nicht genau mit Uhrzeit, sondern
 * immer Tag und Ticketkauf — 6 Käufe an einem Tag und dann der Kurs so ca.").
 * Ein Punkt pro Kalendertag (Wien), Kurs am Tagesende, Tickets pro Tag.
 */

const pt = (t: string, price: number, extra: Partial<HistoryPoint> = {}): HistoryPoint => ({
  t,
  price,
  event: "drift",
  ...extra,
});

describe("dayKey — Kalendertag in Wien, nicht UTC", () => {
  it("22:30 UTC am 1.9. ist in Wien schon der 2.9.", () => {
    expect(dayKey("2026-09-01T22:30:00Z")).toBe("2026-09-02");
    expect(dayKey("2026-09-01T21:30:00Z")).toBe("2026-09-01");
  });
  it("Winterzeit: 23:30 UTC am 1.12. ist der 2.12.", () => {
    expect(dayKey("2026-12-01T23:30:00Z")).toBe("2026-12-02");
    expect(dayKey("2026-12-01T22:30:00Z")).toBe("2026-12-01");
  });
});

describe("aggregateDays", () => {
  const start = "2026-08-14T11:04:20.169Z";

  it("ein Punkt pro Tag von Handelsstart bis heute, heute = aktueller Kurs", () => {
    const days = aggregateDays([pt(start, 22, { event: "init" })], "2026-08-17T09:00:00Z", 24.9);
    expect(days.map((d) => d.key)).toEqual(["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"]);
    expect(days.at(-1)).toMatchObject({ key: "2026-08-17", heute: true, price: 24.9 });
    expect(days.slice(0, -1).every((d) => !d.heute)).toBe(true);
  });

  it("Tagesende-Kurs liegt AUF der Linie: Rampen werden interpoliert, Plateaus bleiben flach", () => {
    // 14.8. 12:00Z Kurs 22 → 16.8. 12:00Z Kurs 24 (lineare Rampe, 1 €/Tag)
    const hist = [pt("2026-08-14T12:00:00Z", 22, { event: "init" }), pt("2026-08-16T12:00:00Z", 24)];
    const days = aggregateDays(hist, "2026-08-16T15:00:00Z", 24.1);
    // Tagesende 14.8. (21:59:59Z): 10 h von 48 h → 22,42
    expect(days[0].price).toBeCloseTo(22 + (10 / 48) * 2, 2);
    // Tagesende 15.8.: 34 h → 23,42
    expect(days[1].price).toBeCloseTo(22 + (34 / 48) * 2, 2);
    expect(days[2].price).toBe(24.1); // heute: Live-Kurs
  });

  it("Kauf-Stufe (von): der Plateau-Tag davor bleibt beim alten Kurs, der Kauf-Tag springt", () => {
    const hist = [
      pt("2026-08-20T10:00:00Z", 25, { event: "init" }),
      pt("2026-08-23T10:00:00Z", 23, { event: "sale", qty: 2, von: 25 }),
    ];
    const days = aggregateDays(hist, "2026-08-23T12:00:00Z", 23.1);
    expect(days.find((d) => d.key === "2026-08-21")!.price).toBe(25); // Plateau, keine Schräge
    expect(days.find((d) => d.key === "2026-08-22")!.price).toBe(25);
    expect(days.find((d) => d.key === "2026-08-23")).toMatchObject({ tickets: 2, price: 23.1 });
  });

  it("Tickets pro Tag: Mengen summiert, Storno abgezogen, nie negativ", () => {
    const hist = [
      pt("2026-08-14T08:00:00Z", 22, { event: "init" }),
      pt("2026-08-14T10:00:00Z", 21, { event: "sale", qty: 1, von: 22 }),
      pt("2026-08-14T15:00:00Z", 16, { event: "sale", qty: 5, von: 21 }),
      pt("2026-08-15T10:00:00Z", 17, { event: "refund", qty: 1, von: 16 }),
      pt("2026-08-16T10:00:00Z", 15, { event: "sale", von: 16 }), // ohne qty = 1 Ticket
    ];
    const days = aggregateDays(hist, "2026-08-16T12:00:00Z", 15);
    expect(days.map((d) => d.tickets)).toEqual([6, 0, 1]);
  });

  it("Live-Historie 02.09. (nachgerechnet): 20 Tage, Käufe an 3 Tagen, Kurs plausibel", () => {
    const jetzt = "2026-09-02T05:00:00Z";
    const s = nachtrag(parseState(JSON.stringify(live)), new Date(jetzt));
    const days = aggregateDays(s.history, jetzt, 23.3);
    expect(days).toHaveLength(20);
    // Tag 1 endet nicht bei 22,00: bis Mitternacht läuft schon die Rampe (+~0,2 €)
    expect(days[0].key).toBe("2026-08-14");
    expect(days[0].price).toBeGreaterThan(22);
    expect(days[0].price).toBeLessThan(22.5);
    const by = Object.fromEntries(days.map((d) => [d.key, d]));
    expect(by["2026-08-26"].tickets).toBe(1);
    expect(by["2026-08-28"].tickets).toBe(2);
    expect(by["2026-09-01"].tickets).toBe(2);
    expect(by["2026-08-31"].price).toBe(25); // Plateau am Deckel
    expect(by["2026-08-29"].price).toBeGreaterThan(23.5); // mitten in der Rampe 23 → 25
    expect(by["2026-08-29"].price).toBeLessThan(24.5);
    expect(by["2026-09-02"]).toMatchObject({ heute: true, price: 23.3, tickets: 0 });
    expect(days.reduce((n, d) => n + d.tickets, 0)).toBe(5);
  });

  it("Historie aus der Zukunft (Uhr-Skew) endet trotzdem heute", () => {
    const hist = [pt("2026-08-14T12:00:00Z", 22, { event: "init" }), pt("2026-08-20T12:00:00Z", 24)];
    const days = aggregateDays(hist, "2026-08-16T12:00:00Z", 22.5);
    expect(days.at(-1)!.key).toBe("2026-08-16");
  });
});

describe("formatDay", () => {
  it("deutsch kurz, englisch kurz", () => {
    expect(formatDay("2026-08-14", "de")).toBe("14.8.");
    expect(formatDay("2026-08-14", "en")).toBe("14/08");
    expect(formatDay("2026-09-02", "de", true)).toMatch(/^Mi\.?,? 2\.9\.$/);
  });
});
