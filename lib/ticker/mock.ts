import { initState, priceOf, shopPrice, tick, type TickerState } from "./engine";

// Dev-Mock für Design-Arbeit: simuliert 3 Wochen Börsen-Verlauf mit der
// ECHTEN Engine (Verkäufe + Drift), damit die Seite realistisch rendert.
// Aktiv nur mit TICKER_MOCK=1 — niemals in Produktion setzen.
export function mockTicker(now: Date = new Date()): {
  state: TickerState;
  currentPriceEuro: number;
  currentInventory: number;
  inventoryTracked: boolean;
  compareDigest: string | null;
} {
  const H = 3_600_000;
  const start = new Date(now.getTime() - 21 * 24 * H);
  let inventory = 250;
  let state = initState(22, inventory, start);

  // Verkaufs-Fahrplan (Stunde nach Start): Woche 1 kauft die Community den Preis
  // runter, Woche 2 Flaute (Kurs kriecht hoch), Woche 3 Endspurt. So zeigt die
  // Preview beide Richtungen, statt am Deckel oder Boden zu kleben.
  const sales = new Set([
    6, 20, 30, 45, 60, 70, 95, 110, 140, 155, // Woche 1: 10 Käufe → Kurs fällt
    300, 340, // Woche 2: fast Flaute → Kurs steigt wieder
    380, 400, 420, 440, 460, 470, 480, 495, // Woche 3: Endspurt
  ]);

  for (let h = 1; h <= 21 * 24; h++) {
    if (sales.has(h)) inventory -= 1;
    state = tick(state, inventory, new Date(start.getTime() + h * H));
  }

  return {
    state,
    // Der Shop-Preis ist immer der gerundete — so sieht die Preview genau das,
    // was ein Kunde im Checkout zahlen würde.
    currentPriceEuro: shopPrice(priceOf(state, now)),
    currentInventory: inventory,
    inventoryTracked: true,
    compareDigest: null,
  };
}
