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
 * gehoben hat. Ein verlorener Schreibvorgang heilt beim nächsten Tick von selbst.
 */
export interface TickerState {
  startPrice: number; // Startpreis beim Börsenstart (eingefroren)
  startInventory: number; // Inventar-Baseline für die Verkaufszählung
  soldCount: number; // verkaufte Tickets seit Börsenstart
  driftMultiplier: number; // kumulierter Flaute-Faktor (startet bei 1)
  lastSaleAt: string; // ISO — steuert die Gnadenfrist
  lastTickAt: string; // ISO — Anker für den ZEITBASIERTEN Drift
  recentOrders: string[]; // bereits verarbeitete Bestellungen (Doppel-Webhooks)
  history: HistoryPoint[];
}

const clamp = (p: number) => Math.min(C.capEuro, Math.max(C.floorEuro, p));

// History-Preise auf 4 Nachkommastellen kürzen. Ungerundet schreibt JSON
// "22.220000000000002" — 18 Zeichen statt 7. Über hunderte Punkte entscheidet
// das darüber, ob der Zustand ins Metafield passt.
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

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
    recentOrders: [],
    history: [{ t, price: round4(price), event: "init" }],
  };
}

/**
 * Der Zustand kommt als JSON aus einem Shopify-Metafield — also aus einer Quelle,
 * die auch von Hand im Admin editierbar ist. Ein einziger kaputter Wert (`NaN`,
 * ein Datum wie "morgen", ein fehlendes Feld) würde sonst durch die gesamte
 * Preis-Mathematik propagieren und am Ende als Preis "NaN" im Shop landen.
 *
 * Darum: Alles prüfen, bevor irgendetwas gerechnet wird. Ungültiger Zustand →
 * Ausnahme, kein Schreibvorgang. Die Börse steht dann still, statt Unsinn zu
 * verkaufen.
 */
export function parseState(raw: string): TickerState {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("Börsen-Zustand ist kein gültiges JSON");
  }
  if (!o || typeof o !== "object") throw new Error("Börsen-Zustand ist kein Objekt");
  const s = o as Record<string, unknown>;

  const num = (key: string, min: number, max: number): number => {
    const v = s[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      throw new Error(`Börsen-Zustand: '${key}' ist ungültig (${String(v)})`);
    }
    return v;
  };
  const iso = (key: string): string => {
    const v = s[key];
    if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
      throw new Error(`Börsen-Zustand: '${key}' ist kein gültiges Datum (${String(v)})`);
    }
    return v;
  };

  const history = Array.isArray(s.history) ? s.history : null;
  if (!history?.length) throw new Error("Börsen-Zustand: 'history' fehlt oder ist leer");
  const EVENTS: TickerEvent[] = ["init", "sale", "drift", "refund", "rebaseline"];
  const cleanHistory: HistoryPoint[] = history.map((p, i) => {
    const h = p as Record<string, unknown>;
    if (
      typeof h.t !== "string" ||
      Number.isNaN(new Date(h.t).getTime()) ||
      typeof h.price !== "number" ||
      !Number.isFinite(h.price) ||
      !EVENTS.includes(h.event as TickerEvent)
    ) {
      throw new Error(`Börsen-Zustand: History-Punkt ${i} ist ungültig`);
    }
    return { t: h.t, price: h.price, event: h.event as TickerEvent };
  });

  return {
    // Grenzen großzügig, aber endlich — sie fangen Tippfehler und Manipulation,
    // ohne legitime Zustände auszuschließen.
    startPrice: num("startPrice", 0.01, 10_000),
    startInventory: num("startInventory", -1_000_000, 1_000_000),
    soldCount: num("soldCount", 0, 1_000_000),
    driftMultiplier: num("driftMultiplier", 1e-9, 1e9),
    lastSaleAt: iso("lastSaleAt"),
    lastTickAt: iso("lastTickAt"),
    recentOrders: Array.isArray(s.recentOrders)
      ? s.recentOrders.filter((x): x is string => typeof x === "string")
      : [], // Feld kam später dazu — fehlt es, ist die Liste eben leer
    history: cleanHistory,
  };
}

export interface TickOptions {
  /**
   * Darf dieser Aufruf die verstrichene Zeit verdriften? Nur der Cron darf das.
   * Der Webhook feuert bei JEDER Bestellung (auch Merch) und würde sonst
   * zusätzliche Drift-Schritte auslösen.
   *
   * WICHTIG: Ein Aufruf mit `allowDrift: false` verschiebt `lastTickAt` NICHT.
   * Täte er es, würde jeder Verkauf die seit dem letzten Cron aufgelaufene
   * Flaute-Zeit löschen — der Kurs stiege dann dauerhaft zu schnell.
   */
  allowDrift?: boolean;
  /**
   * Kommt die Verkaufszahl aus einer vertrauenswürdigen Quelle (HMAC-signierter,
   * deduplizierter Webhook mit echter Bestellmenge)? Dann greift die
   * `maxSalesPerTick`-Klemme nicht: Eine Bestellung über 6 Tickets ist ein
   * echter Großkauf, keine Inventar-Panne, und muss voll zählen.
   */
  trustSales?: boolean;
}

/**
 * Ein Börsen-Schritt. Pure Funktion — die Zeit kommt IMMER von außen rein.
 *
 * Reihenfolge ist bedeutungstragend: ERST driften, DANN das Inventar verrechnen.
 * Beide Wirkungen treffen denselben Tick unabhängig voneinander. Würde ein
 * Verkauf den Drift-Zweig überspringen (so war es ursprünglich gebaut), ginge
 * die bis dahin verstrichene Flaute-Zeit verloren — bei einem Verkauf pro Tag
 * und einem täglichen Cron würde faktisch nie gedriftet und der Kurs klebte
 * binnen zwei Wochen am Deckel.
 *
 * Der Drift ist ZEITBASIERT (nicht pro Aufruf): Er rechnet mit den tatsächlich
 * verstrichenen Stunden seit `lastTickAt`. Damit ist tick() zeit-idempotent —
 * ein doppelt gefeuerter Cron, ein ausgefallener Lauf oder eine gröbere
 * Cron-Kadenz (Vercel-Hobby: nur 1×/Tag) ergeben denselben Kurs wie stündliche
 * Läufe. Wiederholte Aufrufe können den Preis nicht künstlich nach unten prügeln.
 */
export function tick(
  state: TickerState,
  currentInventory: number,
  now: Date,
  opts: TickOptions = {}
): TickerState {
  const allowDrift = opts.allowDrift ?? true;
  const trustSales = opts.trustSales ?? false;

  const drifted = allowDrift ? applyDrift(state, now) : state;
  return applyInventory(drifted, currentInventory, now, trustSales);
}

/** Schritt 1: die verstrichene Zeit verrechnen. Setzt als Einziger `lastTickAt`. */
function applyDrift(state: TickerState, now: Date): TickerState {
  const nowIso = now.toISOString();
  const priceBefore = priceOf(state);

  // Gedriftet wird exakt die Zeit seit dem letzten Tick — nicht mehr, nicht
  // weniger. Rückwärts laufende Uhren → 0 (nie negativ).
  //
  // Früher wurde hier zusätzlich auf `hoursSinceSale` geklemmt (Rest der
  // Gnadenfrist). Das war ein Fehler, und zwar auch bei einer Gnadenfrist von
  // NULL: Ein Verkauf um 23:00 machte `hoursSinceSale` beim Cron um 24:00 zu
  // 1 — gedriftet wurde dann eine Stunde statt vierundzwanzig. Der Verkauf
  // löschte also rückwirkend Flaute-Zeit, die längst VOR ihm lag. Genau das
  // trieb den Kurs binnen zwei Wochen an den Deckel.
  //
  // `lastSaleAt` bleibt im Zustand — aber nur noch als Information, nie wieder
  // als Bremse für den Drift.
  const driftHours = Math.max(
    0,
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000
  );
  if (driftHours <= 0) {
    return state.lastTickAt === nowIso ? state : { ...state, lastTickAt: nowIso };
  }

  const next: TickerState = {
    ...state,
    driftMultiplier:
      state.driftMultiplier * Math.pow(C.driftFactorPerHour, driftHours),
    lastTickAt: nowIso,
  };
  const price = priceOf(next);
  if (price === priceBefore) return next; // am Boden angekommen — kein Punkt

  return {
    ...next,
    history: [...next.history, { t: nowIso, price: round4(price), event: "drift" }],
  };
}

/** Schritt 2: Verkäufe und Stornos aus dem Inventar ableiten. Rührt `lastTickAt` nicht an. */
function applyInventory(
  state: TickerState,
  currentInventory: number,
  now: Date,
  trustSales: boolean
): TickerState {
  const nowIso = now.toISOString();
  const priceBefore = priceOf(state);
  const totalSold = state.startInventory - currentInventory;
  const newSales = totalSold - state.soldCount;

  if (newSales === 0) return state;

  // ---- Unplausible Inventar-Sprünge: NICHT als Verkäufe werten ----
  // Ein Sturz um viele Stück auf einmal stammt (im Cron-Pfad) nicht von Käufen,
  // sondern von Admin-Korrekturen, Evey-Syncs oder deaktiviertem Bestands-
  // Tracking (liefert 0!). Ebenso jede Aufstockung. In beiden Fällen wandert
  // die Baseline mit: soldCount und Preis bleiben, wo sie sind.
  const implausible = trustSales
    ? totalSold < 0 // dem signierten Webhook glauben wir die Menge; nur Aufstockung ist Unsinn
    : newSales > C.maxSalesPerTick || totalSold < 0;

  if (implausible) {
    return {
      ...state,
      startInventory: currentInventory + state.soldCount,
      history: [
        ...state.history,
        { t: nowIso, price: round4(priceBefore), event: "rebaseline" },
      ],
    };
  }

  const next: TickerState = {
    ...state,
    soldCount: totalSold,
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
            {
              t: nowIso,
              price: round4(price),
              event: newSales > 0 ? "sale" : "refund",
            },
          ],
  };
}

/** Eine Bestellung als verarbeitet vormerken (gegen Shopifys Doppelzustellung). */
export function rememberOrder(state: TickerState, orderId: string): TickerState {
  return {
    ...state,
    recentOrders: [...state.recentOrders, orderId].slice(-C.recentOrdersMax),
  };
}

export function hasSeenOrder(state: TickerState, orderId: string): boolean {
  return state.recentOrders.includes(orderId);
}

/**
 * Historie kompakt halten (Shopify-Metafield-Limit).
 * init/sale/refund/rebaseline bleiben in den letzten `historyDenseDays`; ältere
 * Punkte werden auf ein 6h-Raster ausgedünnt, dann hart auf `historyMaxPoints`
 * gekappt.
 *
 * Das allein reicht aber nicht: Das Metafield-Limit ist in BYTE bemessen, nicht
 * in Punkten. Darum am Ende gegen das echte Byte-Budget prüfen und notfalls
 * weiter ausdünnen. Ein übergelaufenes Metafield würde die Börse einfrieren.
 */
export function pruneHistory(history: HistoryPoint[], now: Date): HistoryPoint[] {
  const denseCutoff = now.getTime() - C.historyDenseDays * 24 * 3_600_000;
  const rasterMs = C.historySparseHours * 3_600_000;
  let lastKeptSlot = -Infinity;

  let pruned = history.filter((p, i) => {
    if (i === 0) return true; // Startpunkt bleibt immer
    const t = new Date(p.t).getTime();
    if (t >= denseCutoff) return true; // junge Punkte bleiben vollständig
    const slot = Math.floor(t / rasterMs);
    if (slot === lastKeptSlot) return false;
    lastKeptSlot = slot;
    return true;
  });

  if (pruned.length > C.historyMaxPoints) {
    pruned = [pruned[0], ...pruned.slice(-(C.historyMaxPoints - 1))];
  }

  // Byte-Budget: notfalls die ältesten Punkte fallen lassen (der Startpunkt
  // bleibt — er ist der Nullpunkt des Charts).
  const bytes = (h: HistoryPoint[]) => new TextEncoder().encode(JSON.stringify(h)).length;
  while (pruned.length > 2 && bytes(pruned) > C.metafieldMaxBytes) {
    pruned = [pruned[0], ...pruned.slice(2)];
  }
  return pruned;
}
