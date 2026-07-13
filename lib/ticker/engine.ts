import { TICKER_CONFIG as C } from "./config";

export type TickerEvent = "init" | "sale" | "drift";

export interface HistoryPoint {
  t: string; // ISO-Zeitstempel
  price: number; // interner Kurs (exakt)
  event: TickerEvent;
}

export interface TickerState {
  startInventory: number; // Inventar bei Börsen-Start (Baseline für Verkaufszählung)
  soldCount: number; // bisher gezählte Verkäufe
  lastSaleAt: string; // ISO — steuert Gnadenfrist
  price: number; // interner Kurs (ungerundet)
  history: HistoryPoint[];
}

const clamp = (p: number) => Math.min(C.capEuro, Math.max(C.floorEuro, p));

// Shop-Preis: geklemmt + auf 10 Cent gerundet (krumme Preise sind Absicht)
export function shopPrice(priceEuro: number): number {
  return Math.round(clamp(priceEuro) * 10) / 10;
}

export function initState(
  currentPriceEuro: number,
  currentInventory: number,
  now: Date
): TickerState {
  const t = now.toISOString();
  return {
    startInventory: currentInventory,
    soldCount: 0,
    lastSaleAt: t,
    price: clamp(currentPriceEuro),
    history: [{ t, price: clamp(currentPriceEuro), event: "init" }],
  };
}

// Ein Börsen-Schritt: erst Verkäufe verarbeiten, sonst Drift (Task 3).
// Pure Funktion — Zeit kommt IMMER von außen rein.
export function tick(
  state: TickerState,
  currentInventory: number,
  now: Date,
  opts: { allowDrift: boolean } = { allowDrift: true }
): TickerState {
  const totalSold = state.startInventory - currentInventory;
  const newSales = totalSold - state.soldCount;

  if (newSales > 0) {
    const price = clamp(state.price + newSales * C.saleBumpEuro);
    return {
      ...state,
      price,
      soldCount: totalSold,
      lastSaleAt: now.toISOString(),
      history: [
        ...state.history,
        { t: now.toISOString(), price, event: "sale" },
      ],
    };
  }

  // Inventar extern erhöht — Preis bleibt IMMER unangetastet, kein History-Punkt.
  // Zwei Fälle:
  //  a) Storno/Korrektur (Inventar bleibt unter der Baseline): Zähler zurücknehmen.
  //  b) Aufstockung über die Baseline hinaus (jemand legt Tickets nach): die
  //     Baseline wandert mit, damit spätere echte Verkäufe wieder zählen.
  if (newSales < 0) {
    if (totalSold >= 0) {
      return { ...state, soldCount: totalSold };
    }
    return {
      ...state,
      startInventory: currentInventory + state.soldCount,
      // soldCount bleibt: bereits verkaufte Tickets verschwinden nicht
    };
  }

  // Drift: nur nach Ablauf der Gnadenfrist, exponentiell Richtung Boden
  // Drift nur vom stündlichen Cron (allowDrift) — Webhooks feuern bei jeder
  // Shop-Bestellung und dürfen keine zusätzlichen Drift-Schritte auslösen
  if (!opts.allowDrift) return state;

  const hoursSinceSale =
    (now.getTime() - new Date(state.lastSaleAt).getTime()) / 3_600_000;
  if (hoursSinceSale <= C.graceHours) return state;

  const price = clamp(state.price * C.driftFactorPerHour);
  if (price === state.price) return state; // am Boden angekommen — nichts zu tun

  return {
    ...state,
    price,
    history: [
      ...state.history,
      { t: now.toISOString(), price, event: "drift" },
    ],
  };
}

// Historie kompakt halten: init/sale bleiben immer, alte Drift-Punkte
// werden auf ein 6h-Raster ausgedünnt (Metafield-Größenlimit).
export function pruneHistory(
  history: HistoryPoint[],
  now: Date
): HistoryPoint[] {
  const denseCutoff = now.getTime() - C.historyDenseDays * 24 * 3_600_000;
  const rasterMs = C.historySparseHours * 3_600_000;
  let lastKeptSlot = -Infinity;

  return history.filter((p) => {
    if (p.event !== "drift") return true;
    const t = new Date(p.t).getTime();
    if (t >= denseCutoff) return true;
    const slot = Math.floor(t / rasterMs);
    if (slot === lastKeptSlot) return false;
    lastKeptSlot = slot;
    return true;
  });
}
