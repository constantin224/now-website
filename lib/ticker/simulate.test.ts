import { describe, expect, it } from "vitest";
import { TICKER_CONFIG } from "./config";
import { initState, pruneHistory, shopPrice, tick } from "./engine";

// Simuliert 3 Wochen Börse mit realistischem Kleine-Venue-Verlauf.
describe("Simulation: 3 Wochen Kleine-Venue-Realität", () => {
  it("Kurve bleibt in den Grenzen und reagiert plausibel", () => {
    const start = new Date("2026-08-01T12:00:00Z");
    let state = initState(22, 176, start);
    let inventory = 176;

    for (let h = 1; h <= 21 * 24; h++) {
      const now = new Date(start.getTime() + h * 3_600_000);
      // Woche 1: 1 Verkauf/Tag, danach totale Flaute
      if (h % 24 === 0 && h <= 7 * 24) inventory -= 1;
      state = tick(state, inventory, now);
      state = { ...state, history: pruneHistory(state.history, now) };

      expect(state.price).toBeGreaterThanOrEqual(TICKER_CONFIG.floorEuro);
      expect(state.price).toBeLessThanOrEqual(TICKER_CONFIG.capEuro);
      // Metafield-Budget: State muss klein bleiben
      expect(JSON.stringify(state).length).toBeLessThan(60_000);
    }

    // nach 2 Wochen Flaute muss der Kurs sichtbar unter dem Woche-1-Hoch liegen —
    // Erwartung formelbasiert aus der Config (robust gegen Re-Kalibrierung).
    // Peak ist der Deckel, sobald 22 € + 7 Verkäufe darüber hinausschießen.
    const driftHours = 13 * 24; // 14 Tage Flaute minus 24h Gnadenfrist
    const peak = Math.min(
      TICKER_CONFIG.capEuro,
      22 + 7 * TICKER_CONFIG.saleBumpEuro
    );
    const expected = peak * Math.pow(TICKER_CONFIG.driftFactorPerHour, driftHours);
    expect(state.price).toBeCloseTo(expected, 1);
    expect(state.price).toBeLessThan(peak);
    expect(state.soldCount).toBe(7);
  });
});
