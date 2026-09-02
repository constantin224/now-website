import type { HistoryPoint } from "./engine";

/**
 * Tagesansicht für den Chart (02.09.): ein Punkt pro Kalendertag in Wien,
 * Kurs am Tagesende, Tickets pro Tag. Constantin: „nicht genau mit Uhrzeit,
 * sondern immer Tag und Ticketkauf — 6 Käufe an einem Tag und dann der Kurs
 * so ca." Die Uhrzeit-Historie bleibt die Wahrheit im Zustand; hier wird nur
 * anders GEZEIGT.
 *
 * Der Tagesende-Kurs wird nicht geschätzt, sondern von der Linie abgelesen:
 * Zwischen zwei Punkten läuft der Kurs linear (Drift), an einem Kauf springt
 * er senkrecht (`von` → `price`). Auswerten am letzten Augenblick des Tages
 * ergibt Rampen und Plateaus exakt. Heute = der Live-Kurs.
 */

export interface DayPoint {
  key: string; // "2026-09-02" — Kalendertag in Wien
  price: number; // Kurs am Tagesende (heute: aktueller Kurs)
  tickets: number; // netto verkaufte Tickets an diesem Tag (Käufe − Stornos), nie negativ
  heute: boolean;
}

const TZ = "Europe/Vienna";

/** Kalendertag "YYYY-MM-DD" eines Zeitpunkts in Wien. */
export function dayKey(t: string | number | Date, timeZone = TZ): string {
  const d = t instanceof Date ? t : new Date(t);
  // en-CA formatiert als YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function keyParts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

function nextDayKey(key: string): string {
  const [y, m, d] = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Letzter Augenblick des Kalendertags `key` in Wien, als Zeitstempel.
 * Wien liegt bei UTC+1 oder UTC+2 — beide Kandidaten prüfen, statt
 * Sommerzeit-Regeln nachzubauen.
 */
function dayEndMs(key: string, timeZone: string): number {
  const [y, m, d] = keyParts(key);
  const naechsterMitternachtUtc = Date.UTC(y, m - 1, d + 1);
  for (const offsetH of [2, 1, 0, 3, -1]) {
    const t = naechsterMitternachtUtc - offsetH * 3_600_000;
    if (dayKey(t - 1, timeZone) === key && dayKey(t, timeZone) !== key) return t - 1;
  }
  return naechsterMitternachtUtc - 1; // sollte nie eintreten
}

/** Kurs zu einem Zeitpunkt, von der Linie abgelesen (linear, Stufen bei `von`). */
function priceAt(history: HistoryPoint[], tMs: number): number {
  // Stützstellen der Linie: Kauf/Storno-Punkte liefern zwei (t, von) und (t, price)
  const stuetzen: { t: number; p: number }[] = [];
  for (const h of history) {
    const t = new Date(h.t).getTime();
    if (h.von !== undefined && h.von !== h.price) stuetzen.push({ t, p: h.von });
    stuetzen.push({ t, p: h.price });
  }
  if (tMs <= stuetzen[0].t) return stuetzen[0].p;
  for (let i = 1; i < stuetzen.length; i++) {
    const a = stuetzen[i - 1];
    const b = stuetzen[i];
    if (tMs <= b.t) {
      if (b.t === a.t) return b.p;
      return a.p + ((b.p - a.p) * (tMs - a.t)) / (b.t - a.t);
    }
  }
  return stuetzen[stuetzen.length - 1].p;
}

export function aggregateDays(
  history: HistoryPoint[],
  nowIso: string,
  currentPrice: number,
  timeZone = TZ
): DayPoint[] {
  if (!history.length) return [];
  const ticketsByDay = new Map<string, number>();
  for (const h of history) {
    if (h.event !== "sale" && h.event !== "refund") continue;
    const k = dayKey(h.t, timeZone);
    const menge = (h.qty ?? 1) * (h.event === "sale" ? 1 : -1);
    ticketsByDay.set(k, (ticketsByDay.get(k) ?? 0) + menge);
  }

  const heute = dayKey(nowIso, timeZone);
  const nowMs = new Date(nowIso).getTime();
  const out: DayPoint[] = [];
  for (let k = dayKey(history[0].t, timeZone), i = 0; i < 400; k = nextDayKey(k), i++) {
    const istHeute = k >= heute; // `>=`: Historie aus der Zukunft (Uhr-Skew) endet trotzdem heute
    const price = istHeute
      ? Number.isFinite(currentPrice) && currentPrice > 0
        ? currentPrice
        : priceAt(history, nowMs)
      : priceAt(history, dayEndMs(k, timeZone));
    out.push({
      key: istHeute ? heute : k,
      price,
      tickets: Math.max(0, ticketsByDay.get(k) ?? 0),
      heute: istHeute,
    });
    if (istHeute) break;
  }
  return out;
}

/** "14.8." (de) bzw. "14/08" (en); mit `weekday` zusätzlich der Wochentag („Mi, 2.9."). */
export function formatDay(key: string, locale: string, weekday = false): string {
  const [y, m, d] = keyParts(key);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-AT", {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    ...(weekday ? { weekday: "short" } : {}),
  }).format(date);
}
