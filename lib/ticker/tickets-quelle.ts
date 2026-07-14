import { TICKER_CONFIG as C } from "./config";

/**
 * Die Verkaufszahl aus dem Ticket-System (Repo `tonherd-tickets`) holen.
 *
 * WARUM ÜBERHAUPT: Die Börse hat ihre Verkäufe bisher aus Shopifys Bestand
 * abgeleitet — also aus dem Bestand GERATEN. Daher stammen ihre schwersten
 * Probleme: Ein Bestands-Reset und ein Ausverkauf sehen identisch aus, ein
 * Storno ohne Rückbuchung bleibt für immer als Verkauf gezählt, und der Cutoff
 * des Ticket-Systems (das bei Türöffnung den Bestand auf null setzt) sähe wie
 * ein schlagartiger Ausverkauf aus.
 *
 * Das Ticket-System rät nicht: Es leitet aus den BESTELLUNGEN ab, wer ein
 * gültiges Ticket hat (Stornos raus, nur bezahlte) — und hält das Ergebnis
 * bereit. Diese Zahl ist die Wahrheit; der Bestand war immer nur ihr Schatten.
 */
export interface TicketZahl {
  gueltigeTickets: number;
  /** Türöffnung — ab da darf die Börse nicht mehr laufen (der Cutoff nullt den Bestand). */
  doorsUtc: string | null;
}

/** Konfiguriert? Ohne Basis-URL läuft die Börse im alten Bestands-Modus weiter. */
export function ticketQuelleKonfiguriert(): boolean {
  return Boolean(process.env.TICKETS_BASE_URL && process.env.TICKETS_MONITOR_SECRET);
}

/**
 * @returns die Zahl, oder `null` wenn das Ticket-System sie nicht liefern kann
 *   (nicht erreichbar, oder Event noch nicht scharfgeschaltet).
 *
 * Ein `null` ist KEINE Null: Der Aufrufer darf daraus niemals "nichts verkauft"
 * schließen — er lässt die Verkaufszahl dann unangetastet und driftet nur.
 */
export async function ticketVerkaufszahl(): Promise<TicketZahl | null> {
  const base = process.env.TICKETS_BASE_URL;
  const secret = process.env.TICKETS_MONITOR_SECRET;
  if (!base || !secret) return null;

  const pid = C.productGid.split("/").pop();
  try {
    const res = await fetch(`${base}/api/verkaufszahl?pid=${pid}`, {
      headers: { "x-monitor-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[ticker] Ticket-System antwortete ${res.status}`);
      return null;
    }
    const j = (await res.json()) as {
      scharf?: boolean;
      gueltigeTickets?: number;
      doorsUtc?: string | null;
    };
    // Nicht scharfgeschaltet → es GIBT dort keine Wahrheit. Nicht raten.
    if (!j.scharf) return null;
    if (!Number.isInteger(j.gueltigeTickets) || (j.gueltigeTickets as number) < 0) {
      console.warn("[ticker] Ticket-System lieferte keine brauchbare Zahl");
      return null;
    }
    return {
      gueltigeTickets: j.gueltigeTickets as number,
      doorsUtc: j.doorsUtc ?? null,
    };
  } catch (err) {
    console.warn("[ticker] Ticket-System nicht erreichbar:", (err as Error).message);
    return null;
  }
}
