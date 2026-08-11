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
 *  - Jeder Fehler hier ist folgenlos: Der 5-min-Cron bleibt der Fallback. Darum
 *    wird nie geworfen, nur gewarnt — und fehlende Envs heißen schlicht
 *    "Turbo nicht konfiguriert".
 *  - Harte Zeitgrenze pro Publish: Der Webhook muss Shopify in ~5 s
 *    antworten; die Publishes laufen parallel und kosten schlimmstenfalls
 *    TURBO_TIMEOUT_MS.
 */
const TURBO_TIMEOUT_MS = 2_500;

export async function feuerTurboTicks(): Promise<{
  gefeuert: number;
  uebersprungen: number;
}> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return { gefeuert: 0, uebersprungen: C.turboZiele.length };

  let gefeuert = 0;
  let uebersprungen = 0;

  const laeufe = C.turboZiele.map(async (ziel) => {
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
        },
        signal: AbortSignal.timeout(TURBO_TIMEOUT_MS),
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
