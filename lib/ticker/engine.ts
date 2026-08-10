import { TICKER_CONFIG as C } from "./config";

export type TickerEvent = "init" | "sale" | "drift" | "refund" | "rebaseline";

/**
 * Woher die Verkaufszahl dieser Börse stammt — beim Start EINGEFROREN.
 *
 * "tickets"  = Bestell-Ledger des Ticket-Systems (tonherd-tickets)
 * "bestand"  = Shopifys inventoryQuantity (Notpfad, mit allen Klemmen)
 *
 * Die Quelle steht im Zustand, nicht in den Env-Variablen: Ein nachträglich
 * gesetztes (oder entferntes) TICKETS_BASE_URL darf die Wahrheitsquelle NICHT
 * still wechseln. Beim Wechsel bestand→tickets würden alle Alt-Tickets als
 * frische Verkäufe gelesen (Kurs stürzte an den Boden); beim Wechsel tickets→bestand
 * übernähme ein womöglich längst divergenter Bestand (Storno ohne Rückbuchung
 * senkt ihn nie). Wechsel nur explizit: Börse neu starten.
 */
export type VerkaufsQuelle = "tickets" | "bestand";

/**
 * Obergrenze für |soldCount| bzw. |totalSold| — geteilt zwischen parseState
 * (liest) und applyInventory (schreibt). Wären die beiden Grenzen verschieden,
 * könnte die Engine einen Zustand erzeugen, den ihr eigenes parseState beim
 * nächsten Lesen ablehnt — die Börse fröre an ihrer eigenen Prüfung ein.
 * (Im linearen Modell gibt es keinen Zahlen-Overflow mehr; die Grenze bleibt
 * als Absurditäts- und Repräsentierbarkeits-Schranke — ein Klub hat 250 Plätze.)
 */
export const MAX_SOLD_ABS = 10_000;

export interface HistoryPoint {
  t: string; // ISO-Zeitstempel
  price: number; // interner Kurs (gerundet auf 4 Stellen)
  event: TickerEvent;
  qty?: number; // wie viele Tickets dieses Ereignis umfasst (nur bei sale/refund)
}

/**
 * Der Preis wird NICHT gespeichert, sondern IMMER aus Zustand + Zeit ABGELEITET:
 *
 *     Preis = clamp( Startpreis − saleDropEuro × verkaufte + riseEuroPerDay × TageSeitStart )
 *
 * Das ist der Kern der Robustheit: Weil `soldCount` absolut aus der
 * Wahrheitsquelle stammt und der Preis eine reine Funktion davon ist, kann der
 * Kurs nicht "ratschen". Ein Storno hebt den Preis exakt so weit, wie der Kauf
 * ihn gesenkt hat. Ein verlorener Schreibvorgang heilt beim nächsten Tick von
 * selbst.
 */
export interface TickerState {
  startPrice: number; // Startpreis beim Börsenstart (eingefroren)
  startInventory: number; // Bestands-Baseline (Notpfad, wenn das Ticket-System schweigt)
  /**
   * Wie viele gültige Tickets es beim Börsenstart schon gab (Quelle: Ticket-System).
   *
   * Für den Gig am 17.10. sind das die Alt-Bestellungen aus der Evey-Zeit. Ohne diese
   * Baseline würde die Börse sie beim Start als frische Verkäufe lesen und den Kurs
   * sofort Richtung Boden stürzen — sie verschenkte Community-Rabatt für Käufe,
   * die vor ihr lagen.
   */
  startTickets: number;
  /** Woher die Verkaufszahl stammt — beim Start eingefroren, nie still gewechselt. */
  quelle: VerkaufsQuelle;
  /**
   * Verkaufte Tickets seit Börsenstart. DARF NEGATIV WERDEN: Storniert ein
   * Alt-Käufer (Ticket von VOR dem Börsenstart), fällt die gültige Ticketzahl
   * unter die Baseline — der Kurs steigt dann über den Startpreis (weniger
   * verkaufte Tickets = weniger Community-Rabatt). Das ist gewollt und
   * symmetrisch: Der nächste Verkauf senkt ihn exakt wieder zurück. Früher warf
   * dieser Fall eine Anomalie und fror die Börse dauerhaft ein (409 bei jedem
   * Cron-Lauf).
   */
  soldCount: number;
  ignoredTickets: number; // Tickets aus Testbestellungen — bewegen den Kurs nicht
  /**
   * Börsenstart — Anker des ZEIT-Anteils: riseEuroPerDay × Tage seit diesem
   * Zeitpunkt. ABGELEITET statt akkumuliert (der frühere driftMultiplier
   * entfiel ersatzlos): Uhr-Rücksprünge heilen sich selbst, und es gibt keinen
   * Akkumulator, den ein anderer Code-Pfad versehentlich überspringen könnte.
   */
  startAtIso: string;
  lastSaleAt: string; // ISO — nur Information
  lastTickAt: string; // ISO — Betriebs-Anker: Ampel-Herzschlag + Zeitfenster der Verkaufsgrenze
  recentOrders: string[]; // bereits verarbeitete Bestellungen (Doppel-Webhooks)
  history: HistoryPoint[];
}

/**
 * Die Zahl des Ticket-Systems in den Bestand übersetzen, mit dem die Engine rechnet.
 *
 * Die Engine bildet `totalSold = startInventory − bestand − ignoredTickets`. Damit daraus
 * `gueltigeTickets − startTickets − ignoredTickets` wird, reicht ein Bestand von:
 *
 *     startInventory − gueltigeTickets + startTickets
 *
 * So bleibt die gesamte Engine-Logik unverändert; nur die WAHRHEITSQUELLE wechselt —
 * vom geratenen Bestand zum tatsächlichen Bestell-Ledger.
 */
export function bestandAusTicketZahl(state: TickerState, gueltigeTickets: number): number {
  return state.startInventory - gueltigeTickets + state.startTickets;
}

/**
 * Der Bestand, bei dem die Engine "keine Änderung" sieht — für Ticks, die NUR driften
 * sollen, weil gerade keine verlässliche Verkaufszahl vorliegt.
 */
export function bestandOhneAenderung(state: TickerState): number {
  return state.startInventory - state.soldCount - state.ignoredTickets;
}

const clamp = (p: number) => Math.min(C.capEuro, Math.max(C.floorEuro, p));

function parseQuelle(v: unknown): VerkaufsQuelle {
  if (v === undefined) return "bestand"; // Alt-Zustand von vor Runde 4
  if (v === "tickets" || v === "bestand") return v;
  throw new Error(`Börsen-Zustand: 'quelle' ist ungültig (${String(v)})`);
}

// History-Preise auf 4 Nachkommastellen kürzen. Ungerundet schreibt JSON
// "22.220000000000002" — 18 Zeichen statt 7. Über hunderte Punkte entscheidet
// das darüber, ob der Zustand ins Metafield passt.
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Der Preis als reine Funktion von Zustand UND Zeit. Die Zeit kommt — wie
 * überall in der Engine — von außen herein; es gibt keinen Akkumulator.
 *
 * Der NaN-Riegel bleibt Absicht: Käme je eine NaN durch (verbogener Zustand),
 * würde toFixed(2) daraus den String "NaN" machen — und den als Preis an
 * Shopify schicken. Lieber laut scheitern als still Unsinn verkaufen.
 */
export function priceOf(state: TickerState, now: Date): number {
  // Uhr vor dem Börsenstart (Rücksprung, verbogener Zustand): Zeit-Anteil 0,
  // nie negativ — sonst fiele der Kurs unter das, was die Verkäufe hergeben.
  const tage = Math.max(
    0,
    (now.getTime() - new Date(state.startAtIso).getTime()) / 86_400_000
  );
  const roh =
    state.startPrice - C.saleDropEuro * state.soldCount + C.riseEuroPerDay * tage;
  if (Number.isNaN(roh)) {
    throw new Error("Börsen-Zustand ergibt keinen Preis (NaN)");
  }
  return clamp(roh);
}

// Shop-Preis: geklemmt + auf 10 Cent gerundet (krumme Preise sind Absicht)
export function shopPrice(priceEuro: number): number {
  if (Number.isNaN(priceEuro)) {
    throw new Error("Preis ist NaN");
  }
  return Math.round(clamp(priceEuro) * 10) / 10;
}

export function initState(
  startPriceEuro: number,
  currentInventory: number,
  now: Date,
  /** Bereits verkaufte Tickets beim Start (aus dem Ticket-System). 0 im Bestands-Notpfad. */
  startTickets = 0,
  /** Wahrheitsquelle dieser Börse — wird eingefroren, nie still gewechselt. */
  quelle: VerkaufsQuelle = "bestand"
): TickerState {
  const t = now.toISOString();
  const price = clamp(startPriceEuro);
  return {
    startPrice: price,
    startInventory: currentInventory,
    startTickets,
    quelle,
    soldCount: 0,
    ignoredTickets: 0,
    startAtIso: t,
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
export function parseState(
  raw: string,
  /**
   * Wenn übergeben, werden `lastTickAt` und `startAtIso` gegen die Gegenwart
   * geprüft (mit 24 h Toleranz für Uhr-Schieflagen). Ein von Hand verbogener
   * Anker in der fernen Zukunft (Tippfehler "2626") würde sonst still die
   * Verkaufsgrenze verzerren bzw. den Zeit-Anteil dauerhaft auf 0 halten.
   */
  now?: Date
): TickerState {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("Börsen-Zustand ist kein gültiges JSON");
  }
  if (!o || typeof o !== "object") throw new Error("Börsen-Zustand ist kein Objekt");
  const s = o as Record<string, unknown>;

  const num = (key: string, min: number, max: number, ganz = false): number => {
    const v = s[key];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (ganz && !Number.isInteger(v))
    ) {
      throw new Error(`Börsen-Zustand: '${key}' ist ungültig (${String(v)})`);
    }
    return v;
  };
  const iso = (key: string): string => {
    const v = s[key];
    // Längenlimit: `new Date()` schluckt auch absurd lange Strings (führende
    // Leerzeichen, endlose Nachkommastellen). Ein solcher Wert wäre gültig UND
    // groß genug, um den Zustand über das Metafield-Limit zu treiben.
    if (
      typeof v !== "string" ||
      v.length > 40 ||
      Number.isNaN(new Date(v).getTime())
    ) {
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
      h.t.length > 40 ||
      Number.isNaN(new Date(h.t).getTime()) ||
      typeof h.price !== "number" ||
      !Number.isFinite(h.price) ||
      h.price <= 0 || // ein Kurs von 0 ergäbe auf der Seite eine Änderung von ∞ %
      !EVENTS.includes(h.event as TickerEvent)
    ) {
      throw new Error(`Börsen-Zustand: History-Punkt ${i} ist ungültig`);
    }
    // Nur bekannte Felder übernehmen — was sonst im JSON steht, fliegt raus und
    // kann den Zustand nicht aufblähen. Mengen sind ganze positive Zahlen.
    const qty =
      typeof h.qty === "number" && Number.isInteger(h.qty) && h.qty > 0
        ? h.qty
        : undefined;
    return { t: h.t, price: h.price, event: h.event as TickerEvent, ...(qty ? { qty } : {}) };
  });

  const lastTickAt = iso("lastTickAt");
  // Anker in der fernen Zukunft = verbogener Zustand, kein Uhr-Randfall.
  // 24 h Toleranz deckt jede reale Uhr-Schieflage (NTP, Zeitzonen-Verwirrung).
  if (now && new Date(lastTickAt).getTime() > now.getTime() + 24 * 3_600_000) {
    throw new Error(
      `Börsen-Zustand: 'lastTickAt' liegt in der Zukunft (${lastTickAt}) — die Verkaufsgrenze wäre still verzerrt`
    );
  }

  const startAtIso = iso("startAtIso");
  // Ein Start-Anker in der fernen Zukunft hielte den Zeit-Anteil dauerhaft
  // auf 0 (Math.max-Klemme in priceOf) — der Kurs könnte nie wieder steigen.
  // Verbogener Zustand, kein Uhr-Randfall: abweisen.
  if (now && new Date(startAtIso).getTime() > now.getTime() + 24 * 3_600_000) {
    throw new Error(
      `Börsen-Zustand: 'startAtIso' liegt in der Zukunft (${startAtIso}) — der Zeit-Anteil wäre dauerhaft 0`
    );
  }

  return {
    startPrice: num("startPrice", 0.01, 10_000),
    // Bestände und Verkaufszahlen sind ganze Zahlen. Bruchteile sind entweder
    // ein Fehler oder ein Manipulationsversuch.
    startInventory: num("startInventory", -1_000_000, 1_000_000, true),
    // Untergrenze negativ: Alt-Storno unter die Baseline ist ein legitimer
    // Zustand (siehe TickerState.soldCount). Obergrenze siehe MAX_SOLD_ABS.
    soldCount: num("soldCount", -MAX_SOLD_ABS, MAX_SOLD_ABS, true),
    startTickets:
      s.startTickets === undefined ? 0 : num("startTickets", 0, MAX_SOLD_ABS, true),
    // Fehlendes Feld = Zustand von VOR Runde 4 — die Börse ist bis dahin nie
    // gestartet worden, ein solcher Zustand kann also nur bestandsbasiert sein.
    // Ein VORHANDENES, aber ungültiges Feld (Tippfehler im Admin: "ticket",
    // null, …) wird dagegen ABGEWIESEN: Still auf "bestand" zu fallen wäre
    // exakt der stille Quellenwechsel, den das Feld verhindern soll.
    quelle: parseQuelle(s.quelle),
    ignoredTickets:
      s.ignoredTickets === undefined ? 0 : num("ignoredTickets", 0, MAX_SOLD_ABS, true),
    startAtIso,
    lastSaleAt: iso("lastSaleAt"),
    lastTickAt,
    // Bestell-IDs: nur Ziffernfolgen vernünftiger Länge, Anzahl begrenzt. Sonst
    // könnte ein manipuliertes Metafield den Zustand über das Shopify-Limit
    // treiben und die Börse einfrieren.
    recentOrders: (Array.isArray(s.recentOrders) ? s.recentOrders : [])
      .filter((x): x is string => typeof x === "string" && /^\d{1,25}$/.test(x))
      .slice(-C.recentOrdersMax),
    history: cleanHistory,
  };
}

export interface TickOptions {
  /**
   * Darf dieser Aufruf den `lastTickAt`-Anker verschieben und Drift-History-
   * Punkte schreiben? Nur der Cron darf das — der Webhook feuert bei JEDER
   * Bestellung (auch Merch) und würde sonst das Zeitfenster der
   * Verkaufsgrenze künstlich verkürzen.
   *
   * Der PREIS hängt an diesem Flag NICHT mehr: Er enthält die verstrichene
   * Zeit immer, weil er aus `startAtIso` abgeleitet ist. Ein Webhook-Write
   * kann keine Flaute-Zeit löschen — die Fehlerklasse aus Runde 2 existiert
   * strukturell nicht mehr.
   */
  allowDrift?: boolean;
  /**
   * Die von einem HMAC-signierten, deduplizierten Webhook BESTÄTIGTE Ticketmenge.
   *
   * Nur so viele Verkäufe dürfen die Klemme überschreiten — eine Bestellung über
   * 6 Tickets ist ein echter Großkauf, keine Bestands-Panne, und zählt voll.
   *
   * Bewusst eine ZAHL, kein Ja/Nein: Ein bloßes "dem Webhook glauben wir" hieße,
   * dass er auch einen Bestandssturz von 250 auf 0 als 250 Verkäufe schluckt —
   * bloß weil zufällig gleichzeitig eine Bestellung über ein Ticket eintraf.
   * Vertraut wird der Bestellmenge, nicht dem Bestandssprung.
   */
  trustedSales?: number;
}

/**
 * Ein Börsen-Schritt. Pure Funktion — die Zeit kommt IMMER von außen rein.
 *
 * Die frühere Reihenfolge-Regel ("erst Drift, dann Verkäufe") ist im additiven
 * Modell gegenstandslos: Zeit- und Kauf-Anteil sind unabhängige Summanden der
 * Preisformel, keiner kann den anderen löschen (Runde-2-Blocker 6 ist damit
 * strukturell unmöglich). applyZeit läuft weiterhin zuerst, weil es lastTickAt
 * setzt und applyInventory das unangetastet lassen soll.
 *
 * Der Zeit-Anteil ist ZEITBASIERT abgeleitet (aus startAtIso, nicht pro
 * Aufruf): tick() ist zeit-idempotent — ein doppelt gefeuerter Cron, ein
 * ausgefallener Lauf oder eine gröbere Cron-Kadenz ergeben denselben Kurs wie
 * stündliche Läufe. Wiederholte Aufrufe können den Preis nicht bewegen.
 */
export function tick(
  state: TickerState,
  currentInventory: number,
  now: Date,
  opts: TickOptions = {}
): TickerState {
  const allowDrift = opts.allowDrift ?? true;
  const trustedSales = opts.trustedSales ?? 0;

  // Die verstrichene Zeit MUSS vor dem Anker-Nachziehen gemessen werden: `applyZeit` setzt
  // `lastTickAt` auf jetzt, danach wäre der Abstand immer null — und die
  // zeitskalierte Verkaufsgrenze fiele auf ihren Sockel zurück.
  const stundenSeitTick = Math.max(
    0,
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000
  );

  const mitZeit = allowDrift ? applyZeit(state, now) : state;
  return applyInventory(mitZeit, currentInventory, now, trustedSales, stundenSeitTick);
}

/**
 * Schritt 1: den Zeit-Anker nachziehen. Setzt als Einziger `lastTickAt`.
 *
 * Der PREIS hängt nicht mehr an diesem Anker (er ist aus startAtIso
 * abgeleitet) — `lastTickAt` bleibt für den Betrieb: die Ampel misst daran
 * "Cron steht", die zeitskalierte Verkaufsgrenze ihr Zeitfenster. Ein
 * History-Punkt entsteht nur, wenn sich der Kurs seit dem letzten Punkt
 * bewegt hat (am Boden/Deckel entstünde sonst alle fünf Minuten ein toter
 * Punkt).
 */
function applyZeit(state: TickerState, now: Date): TickerState {
  const driftHours =
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000;

  // Läuft die Uhr rückwärts (Zeitumstellung, NTP-Korrektur, Zustand aus der
  // Zukunft), bleibt der Anker, wo er ist — ihn zurückzusetzen würde das
  // Zeitfenster der Verkaufsgrenze künstlich aufblähen.
  if (driftHours <= 0) return state;

  const next: TickerState = { ...state, lastTickAt: now.toISOString() };
  const price = round4(priceOf(next, now));
  const letzter = next.history[next.history.length - 1];
  if (price === letzter.price) return next; // nichts bewegt — kein Punkt

  return {
    ...next,
    history: [...next.history, { t: next.lastTickAt, price, event: "drift" }],
  };
}

/** Der Bestand ergibt keinen Sinn — nichts schreiben, laut melden, Mensch fragen. */
export class InventoryAnomalyError extends Error {
  constructor(
    readonly details: {
      erwartet: number;
      gefunden: number;
      spruenge: number;
      erlaubt: number;
    }
  ) {
    super(
      `Bestands-Sprung unplausibel: ${details.spruenge} Verkäufe auf einmal ` +
        `(erlaubt: ${details.erlaubt}). Bestand ${details.gefunden}, erwartet ~${details.erwartet}.`
    );
    this.name = "InventoryAnomalyError";
  }
}

/**
 * Wie viele Verkäufe darf EIN Cron-Lauf höchstens aus dem Bestand ableiten?
 *
 * Zwei Grenzen, und beide sind nötig:
 *
 * Die Zeit-Komponente: Eine feste Zahl war eine Falle. Fallen die Webhooks aus
 * (bei Shopify durchaus üblich) oder läuft der Cron nur täglich, sammeln sich
 * ganz normale Verkäufe an — und die Engine hielt sie für eine Panne. Was in
 * einer Stunde unmöglich ist, ist über einen Tag hinweg alltäglich.
 *
 * Die absolute Obergrenze: Ohne sie kippt es ins Gegenteil. Nach drei Tagen
 * Cron-Ausfall wären 576 Verkäufe "erlaubt" — ein Bestands-Reset von 250 auf 0
 * ginge dann als Ausverkauf durch und drückte den Kurs auf den Boden. Deshalb
 * gilt zusätzlich: Mehr als `maxSalesAbsolute` ohne Webhook-Bestätigung glaubt
 * die Börse NIEMANDEM, egal wie viel Zeit vergangen ist.
 */
function erlaubteVerkaeufe(stundenSeitTick: number): number {
  return Math.min(
    C.maxSalesAbsolute,
    Math.max(C.maxSalesPerTick, Math.ceil(stundenSeitTick * C.maxSalesPerHour))
  );
}

/** Schritt 2: Verkäufe und Stornos aus dem Inventar ableiten. Rührt `lastTickAt` nicht an. */
function applyInventory(
  state: TickerState,
  currentInventory: number,
  now: Date,
  trustedSales: number,
  stundenSeitTick: number
): TickerState {
  const nowIso = now.toISOString();
  // `ignoredTickets` sind Tickets aus Testbestellungen: Sie haben den Bestand
  // gesenkt, dürfen den Kurs aber nicht bewegen. Also hier wieder herausrechnen.
  const totalSold =
    state.startInventory - currentInventory - state.ignoredTickets;
  const newSales = totalSold - state.soldCount;

  if (newSales === 0) return state;

  // ---- Unplausible Bestands-Sprünge: NICHT als Verkäufe werten ----
  // Die Klemme gilt in BEIDE Richtungen. Ein absurder Sturz stammt nicht von
  // Käufen, sondern von einer Admin-Korrektur, einem Evey-Sync oder
  // deaktiviertem Bestands-Tracking (liefert 0!) — und eine absurde
  // AUFSTOCKUNG ist keine Massen-Rückbuchung, sondern ein nachgelegtes
  // Kontingent. (Früher prüfte der Code nur die Verkaufs-Richtung: +50 Bestand
  // bei 60 Verkäufen wurde als 50 Stornos verbucht und stürzte den Kurs.)
  // Kleine Bewegungen nach oben bleiben erlaubt — ein Storno MIT Rückbuchung
  // sieht genau so aus, und die beiden sind aus dem Bestand nicht zu
  // unterscheiden.
  //
  // Die Grenze ist das Großzügigere aus: was die verstrichene Zeit hergibt, und
  // was die vertrauenswürdige Quelle ausdrücklich bestätigt hat (signierter
  // Webhook bzw. Bestell-Ledger des Ticket-Systems). Eine 6er-Bestellung zählt
  // damit voll — ein Bestandssturz von 250 auf 0 aber NICHT, bloß weil
  // zufällig gleichzeitig eine Bestellung eintraf.
  //
  // Die MAX_SOLD_ABS-Schranke ist die Repräsentierbarkeits-Grenze: Was darüber
  // liegt, würde parseState beim NÄCHSTEN Lesen ablehnen — die Börse schriebe
  // einen Zustand, den sie selbst nicht mehr lesen kann, und fröre ein.
  const erlaubt = Math.max(erlaubteVerkaeufe(stundenSeitTick), trustedSales);
  const implausible =
    Math.abs(newSales) > erlaubt || Math.abs(totalSold) > MAX_SOLD_ABS;

  if (implausible) {
    // FRÜHER wurde hier still die Baseline nachgezogen. Das war in beide
    // Richtungen falsch: Waren es echte Verkäufe, verschwanden sie DAUERHAFT.
    // War es ein Bestands-Reset, lief die Börse mit einer erfundenen Baseline
    // weiter. Beides ohne jede Spur.
    //
    // Ein Bestands-Reset (250 → 0) und ein Ausverkauf (250 → 0) sind aus dem
    // Bestand allein NICHT unterscheidbar. Also raten wir nicht: Es wird nichts
    // geschrieben, der Preis bleibt, wo er ist, und der Lauf meldet sich laut.
    // Ein Mensch entscheidet — über `?rebaseline=1`, wenn die Baseline wirklich
    // nachziehen soll.
    throw new InventoryAnomalyError({
      erwartet: state.startInventory - state.soldCount - state.ignoredTickets,
      gefunden: currentInventory,
      spruenge: newSales,
      erlaubt,
    });
  }

  const next: TickerState = {
    ...state,
    soldCount: totalSold,
    lastSaleAt: newSales > 0 ? nowIso : state.lastSaleAt,
  };
  const price = priceOf(next, now);
  return {
    ...next,
    // Verkäufe und Stornos bekommen IMMER einen Punkt — auch am Deckel, wo sich
    // der Preis nicht mehr rührt. Sonst zählte die Seite "heute 0 verkauft",
    // während in Wahrheit zehn Tickets weggingen. (Drift-Punkte bleiben
    // unterdrückt, wenn sich nichts bewegt — die gäbe es sonst stündlich.)
    history: [
      ...next.history,
      {
        t: nowIso,
        price: round4(price),
        event: newSales > 0 ? "sale" : "refund",
        // Die MENGE mitschreiben — sonst zählt die Seite "1 verkauft",
        // wenn jemand sechs Tickets in einer Bestellung nimmt.
        qty: Math.abs(newSales),
      },
    ],
  };
}

/**
 * Die Baseline bewusst auf den aktuellen Bestand ziehen — nach einer
 * Admin-Korrektur oder einer Aufstockung. Verkaufszahl und Preis bleiben, wo
 * sie sind. Nur auf ausdrückliche Anweisung (`?rebaseline=1`), nie automatisch.
 */
export function rebaseline(
  state: TickerState,
  currentInventory: number,
  now: Date
): TickerState {
  return {
    ...state,
    startInventory: currentInventory + state.soldCount + state.ignoredTickets,
    history: [
      ...state.history,
      { t: now.toISOString(), price: round4(priceOf(state, now)), event: "rebaseline" },
    ],
  };
}

/** Tickets einer Testbestellung: senken den Bestand, dürfen den Kurs nicht bewegen. */
export function ignoreTestTickets(
  state: TickerState,
  orderId: string,
  tickets: number
): TickerState {
  return rememberOrder(
    { ...state, ignoredTickets: state.ignoredTickets + tickets },
    orderId
  );
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
  return pruned;
}

const byteLength = (o: unknown) =>
  new TextEncoder().encode(JSON.stringify(o)).length;

/**
 * Den Zustand schreibfertig machen: Historie ausdünnen UND sicherstellen, dass
 * der GESAMTE serialisierte Zustand ins Shopify-Metafield passt.
 *
 * Der frühere Guard maß nur die Historie. Das genügt nicht: Ins Metafield geht
 * der ganze Zustand, samt Bestell-IDs und allem anderen. Läuft er über, schlägt
 * jeder weitere Schreibvorgang fehl — die Börse friert ein, und zwar dauerhaft,
 * weil auch der reparierende Tick nicht mehr schreiben kann.
 *
 * Reicht das Ausdünnen nicht, wird die Historie notfalls bis auf Startpunkt und
 * jüngsten Punkt eingedampft. Ein magerer Chart ist verkraftbar; eine
 * eingefrorene Börse nicht.
 */
export function prepareForWrite(state: TickerState, now: Date): TickerState {
  let s: TickerState = { ...state, history: pruneHistory(state.history, now) };
  if (byteLength(s) <= C.metafieldMaxBytes) return s;

  // Stufe 1: älteste History-Punkte opfern (der Startpunkt bleibt — Nullpunkt
  // des Charts). Ein magerer Chart ist verkraftbar.
  while (byteLength(s) > C.metafieldMaxBytes && s.history.length > 2) {
    s = { ...s, history: [s.history[0], ...s.history.slice(2)] };
  }
  // Stufe 2: Bestell-IDs kürzen. Erst hier, denn sie schützen vor
  // Doppelzählung — sie zu opfern ist teurer als ein kurzer Chart.
  while (byteLength(s) > C.metafieldMaxBytes && s.recentOrders.length > 20) {
    s = { ...s, recentOrders: s.recentOrders.slice(-20) };
  }
  // Stufe 3: Notbremse. Passt der Zustand immer noch nicht, ist etwas
  // grundsätzlich faul — lieber laut scheitern als ein Metafield sprengen, das
  // die Börse anschließend dauerhaft einfriert (auch der reparierende Tick
  // könnte dann nicht mehr schreiben).
  if (byteLength(s) > C.metafieldMaxBytes) {
    throw new Error(
      `Börsen-Zustand passt nicht ins Metafield (${byteLength(s)} Byte)`
    );
  }
  return s;
}
