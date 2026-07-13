import { TICKER_CONFIG as C } from "./config";

export type TickerEvent = "init" | "sale" | "drift" | "refund" | "rebaseline";

export interface HistoryPoint {
  t: string; // ISO-Zeitstempel
  price: number; // interner Kurs (exakt, ungerundet)
  event: TickerEvent;
}

/**
 * Der Preis wird NICHT gespeichert, sondern IMMER aus dem Zustand ABGELEITET:
 *
 *     Preis = clamp( Startpreis × (1 + Kauf-Schub)^verkaufte × driftMultiplier )
 *
 * Das ist der Kern der Robustheit: Weil `soldCount` absolut aus dem Shopify-
 * Inventar stammt und der Preis eine reine Funktion davon ist, kann der Kurs
 * nicht "ratschen". Ein Storno senkt den Preis exakt so weit, wie der Kauf ihn
 * gehoben hat. Ein doppelt gefeuerter Webhook rechnet dasselbe Ergebnis. Ein
 * verlorener Schreibvorgang heilt beim nächsten Tick von selbst.
 */
export interface TickerState {
  startPrice: number; // Startpreis beim Börsenstart (eingefroren)
  startInventory: number; // Inventar-Baseline für die Verkaufszählung
  soldCount: number; // verkaufte Tickets seit Börsenstart
  driftMultiplier: number; // kumulierter Flaute-Faktor (startet bei 1)
  lastSaleAt: string; // ISO — steuert die Gnadenfrist
  lastTickAt: string; // ISO — Anker für den ZEITBASIERTEN Drift
  history: HistoryPoint[];
}

const clamp = (p: number) => Math.min(C.capEuro, Math.max(C.floorEuro, p));

/** Der Preis als reine Funktion des Zustands. */
export function priceOf(state: TickerState): number {
  return clamp(
    state.startPrice *
      Math.pow(1 + C.saleBumpPct, state.soldCount) *
      state.driftMultiplier
  );
}

// Shop-Preis: geklemmt + auf 10 Cent gerundet (krumme Preise sind Absicht)
export function shopPrice(priceEuro: number): number {
  return Math.round(clamp(priceEuro) * 10) / 10;
}

export function initState(
  startPriceEuro: number,
  currentInventory: number,
  now: Date
): TickerState {
  const t = now.toISOString();
  const price = clamp(startPriceEuro);
  return {
    startPrice: price,
    startInventory: currentInventory,
    soldCount: 0,
    driftMultiplier: 1,
    lastSaleAt: t,
    lastTickAt: t,
    history: [{ t, price, event: "init" }],
  };
}

/**
 * Ein Börsen-Schritt. Pure Funktion — die Zeit kommt IMMER von außen rein.
 *
 * Der Drift ist ZEITBASIERT (nicht pro Aufruf): Er rechnet mit den tatsächlich
 * verstrichenen Stunden seit dem letzten Tick. Damit ist tick() zeit-idempotent —
 * ein doppelt gefeuerter Cron, ein ausgefallener Lauf oder eine gröbere
 * Cron-Kadenz (Vercel-Hobby: nur 1×/Tag) ergeben denselben Kurs wie stündliche
 * Läufe. Wiederholte Aufrufe können den Preis nicht künstlich nach unten prügeln.
 */
export function tick(
  state: TickerState,
  currentInventory: number,
  now: Date,
  opts: { allowDrift: boolean } = { allowDrift: true }
): TickerState {
  const nowIso = now.toISOString();
  const priceBefore = priceOf(state);
  const totalSold = state.startInventory - currentInventory;
  const newSales = totalSold - state.soldCount;

  // ---- 1. Unplausible Inventar-Sprünge: NICHT als Verkäufe werten ----
  // Ein Sturz um viele Stück auf einmal kommt nicht von Käufen (die feuern
  // einzeln per Webhook), sondern von Admin-Korrekturen, Evey-Syncs oder einem
  // deaktivierten Bestands-Tracking (liefert 0!). Ebenso jede Aufstockung.
  // In beiden Fällen wandert die Baseline mit: soldCount und Preis bleiben.
  if (newSales > C.maxSalesPerTick || totalSold < 0) {
    return {
      ...state,
      startInventory: currentInventory + state.soldCount,
      lastTickAt: nowIso,
      history: [
        ...state.history,
        { t: nowIso, price: priceBefore, event: "rebaseline" },
      ],
    };
  }

  // ---- 2. Verkäufe (und Stornos innerhalb der Baseline) ----
  if (newSales !== 0) {
    const next: TickerState = {
      ...state,
      soldCount: totalSold,
      lastTickAt: nowIso,
      // Nur echte Verkäufe erneuern die Gnadenfrist — ein Storno darf den
      // Drift nicht künstlich hinauszögern.
      lastSaleAt: newSales > 0 ? nowIso : state.lastSaleAt,
    };
    const price = priceOf(next);
    return {
      ...next,
      history:
        price === priceBefore
          ? next.history // am Deckel/Boden: kein neuer Punkt
          : [
              ...next.history,
              { t: nowIso, price, event: newSales > 0 ? "sale" : "refund" },
            ],
    };
  }

  // ---- 3. Drift ----
  // Nur der Cron driftet. Der Webhook feuert bei JEDER Shop-Bestellung (auch
  // Merch) und darf keine zusätzlichen Drift-Schritte auslösen.
  if (!opts.allowDrift) return state;

  const hoursSinceSale =
    (now.getTime() - new Date(state.lastSaleAt).getTime()) / 3_600_000;
  const hoursSinceTick =
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000;

  // Nur die Zeit driften, die (a) seit dem letzten Tick verging UND (b) nach
  // Ablauf der Gnadenfrist liegt. Rückwärts laufende Uhren → 0 (nie negativ).
  const driftHours = Math.max(
    0,
    Math.min(hoursSinceTick, hoursSinceSale - C.graceHours)
  );
  if (driftHours <= 0) {
    return state.lastTickAt === nowIso
      ? state
      : { ...state, lastTickAt: nowIso };
  }

  const next: TickerState = {
    ...state,
    driftMultiplier:
      state.driftMultiplier * Math.pow(C.driftFactorPerHour, driftHours),
    lastTickAt: nowIso,
  };
  const price = priceOf(next);
  if (price === priceBefore) {
    return next; // am Boden angekommen — kein neuer History-Punkt
  }
  return {
    ...next,
    history: [...next.history, { t: nowIso, price, event: "drift" }],
  };
}

/**
 * Historie kompakt halten (Shopify-Metafield-Limit).
 * init/sale/refund/rebaseline bleiben in den letzten `historyDenseDays`; ältere
 * Punkte werden auf ein 6h-Raster ausgedünnt. Zusätzlich hartes Kappen auf
 * `historyMaxPoints` — auch bei pathologischem Verlauf sprengt der Zustand nie
 * das Limit (ein Schreibfehler würde die Börse einfrieren).
 */
export function pruneHistory(
  history: HistoryPoint[],
  now: Date
): HistoryPoint[] {
  const denseCutoff = now.getTime() - C.historyDenseDays * 24 * 3_600_000;
  const rasterMs = C.historySparseHours * 3_600_000;
  let lastKeptSlot = -Infinity;

  const pruned = history.filter((p, i) => {
    if (i === 0) return true; // Startpunkt bleibt immer
    const t = new Date(p.t).getTime();
    if (t >= denseCutoff) return true; // junge Punkte bleiben vollständig
    const slot = Math.floor(t / rasterMs);
    if (slot === lastKeptSlot) return false;
    lastKeptSlot = slot;
    return true;
  });

  if (pruned.length <= C.historyMaxPoints) return pruned;
  // Hartes Limit: Startpunkt + die jüngsten Punkte behalten
  return [pruned[0], ...pruned.slice(-(C.historyMaxPoints - 1))];
}
