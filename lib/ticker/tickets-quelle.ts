import { TICKER_CONFIG as C } from "./config";
import { MAX_SOLD_ABS } from "./engine";

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
      scharf?: unknown;
      gueltigeTickets?: unknown;
      doorsUtc?: unknown;
    };
    // Die Antwort wird STRIKT geprüft — eine halb brauchbare Antwort ist
    // gefährlicher als gar keine (der Aufrufer driftet dann nur, das ist sicher):
    //
    // scharf: exakt `true`. Ein "false" als STRING wäre truthy und ließe ein
    // nicht scharfes Event als Wahrheitsquelle durchgehen.
    if (j.scharf !== true) return null;
    // gueltigeTickets: sichere ganze Zahl in den Grenzen, die auch parseState
    // akzeptiert. 10001 (oder 1e20) würde sonst als soldCount geschrieben —
    // und parseState lehnte den selbst geschriebenen Zustand beim nächsten
    // Lesen ab: Börse eingefroren bis zur Metafield-Handreparatur.
    if (
      !Number.isSafeInteger(j.gueltigeTickets) ||
      (j.gueltigeTickets as number) < 0 ||
      (j.gueltigeTickets as number) > MAX_SOLD_ABS
    ) {
      console.warn("[ticker] Ticket-System lieferte keine brauchbare Zahl");
      return null;
    }
    // doorsUtc: null oder ein Zeitpunkt in RFC-3339 MIT explizitem Z/Offset.
    // Ein kaputter String ergäbe beim Türöffnungs-Check `now >= NaN` = immer
    // false — der Stopp wäre STILL aus, und weil der Wert nicht null ist,
    // griffe auch der Config-Fallback nicht. Ein Zeitpunkt OHNE Zeitzone würde
    // in der Server-Zeitzone interpretiert — der Abschaltmoment hinge dann von
    // der Deploy-Umgebung ab. Wer hier Müll liefert, dessen ganzer Antwort
    // trauen wir nicht.
    const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
    let doorsUtc: string | null = null;
    if (j.doorsUtc !== null && j.doorsUtc !== undefined) {
      if (
        typeof j.doorsUtc !== "string" ||
        j.doorsUtc.length > 40 ||
        !RFC3339.test(j.doorsUtc) ||
        Number.isNaN(new Date(j.doorsUtc).getTime())
      ) {
        console.warn("[ticker] Ticket-System lieferte ein unlesbares doorsUtc");
        return null;
      }
      doorsUtc = j.doorsUtc;
    }
    return { gueltigeTickets: j.gueltigeTickets as number, doorsUtc };
  } catch (err) {
    console.warn("[ticker] Ticket-System nicht erreichbar:", (err as Error).message);
    return null;
  }
}
