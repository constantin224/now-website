import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import { initState, priceOf, pruneHistory, shopPrice, tick } from "./engine";

const H = 3_600_000;
const START = new Date("2026-07-13T12:00:00Z");
const DAYS = 96; // bis zum Gig am 17.10.2026

/** Spielt die echten 96 Tage bis zum Gig mit stündlichem Cron durch. */
function simulate(salesPerDay: number) {
  let inv = 250;
  let s = initState(C.startPriceEuro, inv, START);
  let maxBytes = 0;
  const everyH = salesPerDay > 0 ? Math.max(1, Math.round(24 / salesPerDay)) : 0;

  for (let h = 1; h <= DAYS * 24; h++) {
    const now = new Date(START.getTime() + h * H);
    if (everyH && h % everyH === 0 && inv > 0) inv -= 1;
    s = tick(s, inv, now);
    s = { ...s, history: pruneHistory(s.history, now) };

    expect(priceOf(s)).toBeGreaterThanOrEqual(C.floorEuro);
    expect(priceOf(s)).toBeLessThanOrEqual(C.capEuro);
    maxBytes = Math.max(maxBytes, JSON.stringify(s).length);
  }
  return { price: shopPrice(priceOf(s)), sold: s.soldCount, maxBytes, state: s };
}

describe("Simulation: 96 Tage bis zum Gig", () => {
  it("totale Flaute: Kurs fällt, erreicht den Boden aber nicht zu früh", () => {
    const r = simulate(0);
    expect(r.price).toBeLessThan(C.startPriceEuro); // gefallen
    expect(r.price).toBeGreaterThan(C.floorEuro); // aber nicht seit Wochen am Boden
    expect(r.sold).toBe(0);
  });

  it("guter Verkauf: Kurs steigt, klebt aber nicht ab Tag 2 am Deckel", () => {
    const r = simulate(2);
    expect(r.price).toBeGreaterThan(C.startPriceEuro);
    // Der frühere Killer: nach 3 Verkäufen (=1,5 Tagen) permanent am Deckel.
    // Jetzt braucht es dafür mindestens 10 Netto-Verkäufe.
    const salesToCap = Math.log(C.capEuro / C.startPriceEuro) / Math.log(1 + C.saleBumpPct);
    expect(salesToCap).toBeGreaterThanOrEqual(10);
  });

  it("mittlerer Verkauf: Kurve lebt (weder Boden noch Deckel)", () => {
    const r = simulate(0.5);
    expect(r.price).toBeGreaterThan(C.floorEuro);
    expect(r.price).toBeLessThan(C.capEuro);
  });

  it("Metafield bleibt in JEDEM Szenario weit unter dem Shopify-Limit", () => {
    for (const rate of [0, 0.5, 1, 2, 3]) {
      const r = simulate(rate);
      expect(r.maxBytes).toBeLessThan(60_000); // Limit: 65.535
    }
  });
});
