import { after } from "next/server";
import { TICKER_CONFIG as C } from "./config";

/**
 * Kauf-Nachlauf: Nach jeder echten Ticket-Bestellung zieht der Webhook — NACH
 * seiner Antwort an Shopify — die Kette selbst nach, die vorher QStash mit
 * drei verzögerten Messages angestoßen hat:
 *
 *   1. Ledger-Pass des Ticket-Systems MIT Bestell-ID (`/api/cron?order=<id>`):
 *      zieht genau diese Bestellung per ID nach (kein gedrosselter Voll-Abgleich,
 *      kein nachhinkender Suchindex — siehe tonherd-tickets, CronPassOptionen).
 *   2. Börsen-Tick (`/api/ticker/tick`): liest die neue Verkaufszahl, schreibt
 *      den Preis.
 *
 * WARUM OHNE QSTASH (02.09. abends): QStash-Free-Limit 1000 Messages/Tag, davon
 * ~672 durch die drei Schedules (Börse alle 5 min, Tickets alle 5 min, Sync alle 15 min) — bei drei
 * Turbo-Messages pro Kauf blieben ~109 Käufe/Tag Luft. Und die künstlichen
 * Verzögerungen (+10 s / +75 s / +180 s) waren nur nötig, damit die Messages
 * sauber hintereinander liegen. Hier läuft die Kette sequenziell: Preis
 * ~10–15 s nach dem Kauf statt ~90 s, null QStash-Messages.
 *
 * WIE: `after()` (Next.js ≥ 15.1, auf Vercel via waitUntil) — die Funktion
 * antwortet Shopify sofort (dessen ~5-s-Fenster ist damit nie in Gefahr) und
 * arbeitet danach weiter, bis `maxDuration` der Route (60 s) greift. Die Kette
 * braucht im Normalfall 10–15 s, im schlimmsten Fall (alle Timeouts) ~44 s.
 *
 * BEWUSST NUR EIN BESCHLEUNIGER, NIE EIN TRAGWERK (wie der Turbo davor):
 *  - Der Webhook bucht weiterhin NICHTS (Audit-Blocker 21). Beide Aufrufe sind
 *    idempotente Cron-Pfade; doppelt (Shopify stellt mindestens einmal zu) ist
 *    wirkungslos.
 *  - Jeder Fehler ist folgenlos und wird nur geloggt: Der 5-min-Cron beider
 *    Systeme bleibt der Fallback — schlimmstenfalls so langsam wie vor dem Turbo.
 *  - Kein Retry über den Cron hinaus: Nach der Antwort gibt es niemanden mehr,
 *    der wiederholen könnte (QStash hätte 1× wiederholt). Bewusst in Kauf
 *    genommen — der Cron IST der Retry.
 *
 * ZAHLUNGSSTATUS: `orders/create` feuert beim Anlegen der Bestellung. Karte und
 * Shop Pay sind da schon „paid", PayPal manchmal erst Sekunden später — eine
 * „pending" Bestellung zählt das Ledger nicht (entitlementsForOrder). Deshalb
 * ein kurzer Vorlauf VOR dem ersten Ledger-Pass und EIN zweiter Versuch, wenn
 * der erste die Bestellung nicht BESTÄTIGT. Bestätigung = `turboOrdersMitTicket`
 * enthält `<pid>/<orderId>` (die Bestellung trägt jetzt ≥1 gültiges Ticket).
 * NICHT `turboOrders`: Das meldet auch einen Grabstein als „erledigt" — genau
 * das, was eine noch „pending" Zahlung erzeugt (Codex-Review 02.09.). Danach
 * übernimmt die 10-min-Reconciliation des Ticket-Systems (sie holt alles nach,
 * was sich seither geändert hat, auch das spätere „paid").
 */
export interface NachlaufErgebnis {
  /** erledigt = Ticket-System hat die Bestellung angewendet (oder sie war schon aktuell) */
  ledger: "erledigt" | "nicht_bestaetigt" | "fehler" | "uebersprungen";
  ledgerVersuche: number;
  tick: "ok" | "fehler" | "uebersprungen";
  dauerMs: number;
}

export interface NachlaufOptionen {
  /** Wartezeit vor dem ersten Ledger-Pass (Zahlungsstatus setzen lassen). */
  vorlaufMs?: number;
  /** Wartezeit vor dem zweiten Ledger-Versuch. */
  wiederholungMs?: number;
}

const schlafen = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Die Kette selbst — pur, wirft NIE (jeder Ausgang landet im Ergebnis + Log).
 * Exportiert, damit sie ohne Request-Kontext testbar ist.
 */
export async function nachlaufNachKauf(
  orderId: string,
  opts: NachlaufOptionen = {}
): Promise<NachlaufErgebnis> {
  const start = Date.now();
  const vorlaufMs = opts.vorlaufMs ?? C.nachlauf.vorlaufMs;
  const wiederholungMs = opts.wiederholungMs ?? C.nachlauf.wiederholungMs;
  const ticketsSecret = process.env.TICKETS_CRON_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const pid = C.productGid.split("/").pop();
  const erwartet = `${pid}/${orderId}`;

  let ledger: NachlaufErgebnis["ledger"] = "uebersprungen";
  let ledgerVersuche = 0;

  if (ticketsSecret) {
    await schlafen(vorlaufMs);
    for (let versuch = 1; versuch <= 2; versuch++) {
      ledgerVersuche = versuch;
      try {
        const res = await fetch(
          `${C.nachlauf.ledgerUrl}?order=${encodeURIComponent(orderId)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${ticketsSecret}` },
            cache: "no-store",
            signal: AbortSignal.timeout(C.nachlauf.ledgerTimeoutMs),
          }
        );
        if (!res.ok) {
          ledger = "fehler";
          console.warn(`[ticker/nachlauf] Ledger-Pass ${res.status} (Versuch ${versuch})`);
        } else {
          const j = (await res.json()) as { turboOrdersMitTicket?: unknown; errors?: unknown };
          const erledigt =
            Array.isArray(j.turboOrdersMitTicket) && j.turboOrdersMitTicket.includes(erwartet);
          ledger = erledigt ? "erledigt" : "nicht_bestaetigt";
          if (!erledigt) {
            console.warn(
              `[ticker/nachlauf] Ledger-Pass ohne Bestätigung für ${erwartet} (Versuch ${versuch})`,
              Array.isArray(j.errors) ? j.errors.slice(0, 3) : ""
            );
          }
        }
      } catch (err) {
        ledger = "fehler";
        console.warn(`[ticker/nachlauf] Ledger-Pass fehlgeschlagen (Versuch ${versuch}):`, (err as Error).message);
      }
      if (ledger === "erledigt") break;
      if (versuch === 1) await schlafen(wiederholungMs);
    }
  } else {
    console.warn("[ticker/nachlauf] TICKETS_CRON_SECRET fehlt — Ledger-Pass übersprungen, Cron übernimmt");
  }

  let tick: NachlaufErgebnis["tick"] = "uebersprungen";
  if (cronSecret) {
    try {
      const res = await fetch(C.nachlauf.tickUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${cronSecret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(C.nachlauf.tickTimeoutMs),
      });
      tick = res.ok ? "ok" : "fehler";
      if (!res.ok) console.warn(`[ticker/nachlauf] Börsen-Tick ${res.status}`);
    } catch (err) {
      tick = "fehler";
      console.warn("[ticker/nachlauf] Börsen-Tick fehlgeschlagen:", (err as Error).message);
    }
  } else {
    console.warn("[ticker/nachlauf] CRON_SECRET fehlt — Börsen-Tick übersprungen, Cron übernimmt");
  }

  const ergebnis: NachlaufErgebnis = { ledger, ledgerVersuche, tick, dauerMs: Date.now() - start };
  console.log(`[ticker/nachlauf] Bestellung ${orderId}: ${JSON.stringify(ergebnis)}`);
  return ergebnis;
}

/**
 * Den Nachlauf für NACH der Antwort einplanen. Muss innerhalb des Requests
 * aufgerufen werden (Request-Kontext). Wirft nie: Gelingt das Einplanen nicht
 * (kein Request-Kontext, z.B. Unit-Test ohne Mock), wird nur gewarnt — der
 * Cron übernimmt.
 */
export function planeNachlauf(orderId: string): "geplant" | "nicht_geplant" {
  // Nur Production: Die Ziel-URLs sind die produktiven Endpunkte. Ein Preview-
  // Deploy mit Produktions-Secrets würde sonst den echten Ledger/Tick anstoßen
  // (Codex-Review 02.09.). Lokal (VERCEL_ENV leer) bleibt es erlaubt.
  const env = process.env.VERCEL_ENV;
  if (env && env !== "production") {
    console.warn(`[ticker/nachlauf] ${env}-Deploy — Nachlauf nicht eingeplant, Cron übernimmt`);
    return "nicht_geplant";
  }
  try {
    after(() => nachlaufNachKauf(orderId));
    return "geplant";
  } catch (err) {
    console.warn("[ticker/nachlauf] Einplanen fehlgeschlagen — Cron übernimmt:", (err as Error).message);
    return "nicht_geplant";
  }
}
