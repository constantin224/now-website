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
  let ende = START;
  let capAbStunde: number | null = null; // erste Stunde, in der der Kurs am Deckel steht
  const everyH = salesPerDay > 0 ? Math.max(1, Math.round(24 / salesPerDay)) : 0;

  for (let h = 1; h <= DAYS * 24; h++) {
    const now = new Date(START.getTime() + h * H);
    ende = now;
    if (everyH && h % everyH === 0 && inv > 0) inv -= 1;
    s = tick(s, inv, now);
    s = { ...s, history: pruneHistory(s.history, now) };

    const p = priceOf(s, now);
    expect(p).toBeGreaterThanOrEqual(C.floorEuro);
    expect(p).toBeLessThanOrEqual(C.capEuro);
    if (capAbStunde === null && p === C.capEuro) capAbStunde = h;
    maxBytes = Math.max(maxBytes, JSON.stringify(s).length);
  }
  return {
    price: shopPrice(priceOf(s, ende)),
    sold: s.soldCount,
    maxBytes,
    capAbStunde,
    state: s,
  };
}

describe("Simulation: 96 Tage bis zum Gig", () => {
  it("totale Flaute: Kurs steigt, erreicht den Deckel aber nicht sofort", () => {
    const r = simulate(0);
    expect(r.price).toBe(C.capEuro); // 96 Tage Flaute → Deckel, klar
    expect(r.sold).toBe(0);
    // Gemessen an der SIMULATION, nicht an der Config-Arithmetik: Eine Engine,
    // die schon am ersten Tick auf den Deckel spränge, muss hier scheitern.
    // Erwartete Dauer aus der Config abgeleitet, damit der Test eine
    // Deckel-Änderung überlebt (Distanz ÷ Anstieg pro Tag).
    const flauteTageBisDeckel = (C.capEuro - C.startPriceEuro) / C.riseEuroPerDay;
    expect(r.capAbStunde).not.toBeNull();
    expect(r.capAbStunde!).toBeGreaterThanOrEqual(flauteTageBisDeckel * 24);
  });

  it("Gleichgewicht: 1 Verkauf/Tag hält den Kurs beim Start ±1 €", () => {
    const r = simulate(1);
    expect(r.price).toBeGreaterThan(C.startPriceEuro - 1.5);
    expect(r.price).toBeLessThan(C.startPriceEuro + 1.5);
  });

  it("guter Verkauf (2/Tag): die Community kauft den Preis auf den Boden", () => {
    const r = simulate(2);
    expect(r.price).toBe(C.floorEuro);
    expect(r.sold).toBeGreaterThan(100);
  });

  it("Metafield bleibt in JEDEM Szenario weit unter dem Shopify-Limit", () => {
    for (const rate of [0, 0.5, 1, 2, 3]) {
      const r = simulate(rate);
      expect(r.maxBytes).toBeLessThan(60_000); // Limit: 65.535
    }
  });
});
