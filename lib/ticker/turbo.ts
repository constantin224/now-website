import { TICKER_CONFIG as C } from "./config";

/**
 * Kauf-Turbo: verzögerte Einzel-Messages an QStash, damit ein echter Kauf
 * nicht auf den nächsten 5-Minuten-Cron warten muss (~90 s statt bis 10 min).
 *
 * BEWUSST NUR EIN BESCHLEUNIGER, NIE EIN TRAGWERK:
 *  - Der Webhook bucht weiterhin NICHTS (Audit-Blocker 21 bleibt) — er bittet
 *    nur die ohnehin existierenden, idempotenten Cron-Pfade um einen früheren
 *    Lauf. Doppelt gefeuerte Ticks sind per Design wirkungslos (zeitbasiert,
 *    Dedup, CAS — der Hammering-Test beweist es).
 *  - Jeder Fehler hier ist folgenlos: Der 5-min-Cron bleibt der Fallback.
 *    Darum wird nie geworfen, nur gewarnt — und fehlende Envs heißen schlicht
 *    "Turbo nicht konfiguriert".
 *  - ANTWORT-BUDGET: Shopify erwartet die Webhook-Antwort in ~5 s und löscht
 *    Abos nach anhaltenden Überschreitungen. Der Aufrufer übergibt deshalb
 *    das RESTBUDGET des Requests (schon verbrauchte Shopify-Lesezeit
 *    abgezogen) — ist es aufgebraucht, wird komplett übersprungen. Der Cron
 *    holt den Sprung dann eben in ≤5 min.
 *  - Doppelzustellungen (Shopify liefert mindestens einmal) verstärken nichts:
 *    Jede Message trägt eine Deduplication-Id aus der Bestell-ID — QStash
 *    verwirft Wiederholungen selbst.
 */
const TURBO_TIMEOUT_MS = 2_500;
const MIN_BUDGET_MS = 300;

export async function feuerTurboTicks(
  orderId: string,
  budgetMs: number
): Promise<{ gefeuert: number; uebersprungen: number }> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return { gefeuert: 0, uebersprungen: C.turboZiele.length };

  const timeoutMs = Math.min(TURBO_TIMEOUT_MS, budgetMs);
  if (timeoutMs < MIN_BUDGET_MS) {
    console.warn(
      `[ticker/turbo] Antwort-Budget aufgebraucht (${budgetMs} ms) — Turbo übersprungen, Cron übernimmt`
    );
    return { gefeuert: 0, uebersprungen: C.turboZiele.length };
  }

  let gefeuert = 0;
  let uebersprungen = 0;

  const laeufe = C.turboZiele.map(async (ziel, i) => {
    const secret = process.env[ziel.secretEnv];
    if (!secret) {
      uebersprungen++;
      return;
    }
    try {
      const res = await fetch(`${C.qstashPublishBase}/${ziel.url}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Upstash-Delay": ziel.delay,
          "Upstash-Method": "GET",
          "Upstash-Retries": "1",
          "Upstash-Forward-Authorization": `Bearer ${secret}`,
          // Pro Bestellung UND Ziel eindeutig — dieselbe Bestell-ID erneut
          // zugestellt erzeugt dieselben IDs, QStash verwirft die Dubletten.
          "Upstash-Deduplication-Id": `turbo-${orderId}-${i}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) gefeuert++;
      else {
        uebersprungen++;
        console.warn(`[ticker/turbo] QStash ${res.status} für ${ziel.url}`);
      }
    } catch (err) {
      uebersprungen++;
      console.warn(`[ticker/turbo] Publish fehlgeschlagen (${ziel.url}):`, (err as Error).message);
    }
  });

  await Promise.allSettled(laeufe);
  return { gefeuert, uebersprungen };
}
