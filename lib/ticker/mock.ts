import { initState, tick, type TickerState } from "./engine";

// Dev-Mock für Design-Arbeit: simuliert 3 Wochen Börsen-Verlauf mit der
// ECHTEN Engine (Verkäufe + Drift), damit die Seite realistisch rendert.
// Aktiv nur mit TICKER_MOCK=1 — niemals in Produktion setzen.
export function mockTicker(now: Date = new Date()): {
  state: TickerState;
  currentPriceEuro: number;
  currentInventory: number;
} {
  const H = 3_600_000;
  const start = new Date(now.getTime() - 21 * 24 * H);
  let inventory = 176;
  let state = initState(22, inventory, start);

  // Verkaufs-Fahrplan (Stunde nach Start): Woche 1 gut, dann Flaute, zuletzt 2 Nachzügler
  const sales = new Set([20, 45, 70, 95, 140, 300, 460, 470]);

  for (let h = 1; h <= 21 * 24; h++) {
    if (sales.has(h)) inventory -= 1;
    state = tick(state, inventory, new Date(start.getTime() + h * H));
  }

  return { state, currentPriceEuro: state.price, currentInventory: inventory };
}
