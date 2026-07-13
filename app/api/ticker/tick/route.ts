import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { initState, priceOf, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import {
  readTicker,
  TickerConflictError,
  writeTicker,
} from "@/lib/ticker/shopify-admin";
import { authorizeCron, tickerEnabled } from "@/lib/ticker/guards";

export const dynamic = "force-dynamic";

/**
 * Stündlicher Cron: Drift anwenden + verpasste Verkäufe nachziehen.
 *
 * Drei Schutzschichten, bevor irgendetwas geschrieben wird:
 *  1. Bearer CRON_SECRET (zeitkonstant verglichen)
 *  2. TICKER_ENABLED — der Not-Aus. Ohne "1" passiert gar nichts.
 *  3. ?start=1 — die Börse startet NUR auf ausdrücklichen Wunsch. Ohne
 *     Metafield und ohne diesen Parameter bleibt der Shop-Preis unangetastet.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tickerEnabled()) {
    return NextResponse.json({ status: "disabled" });
  }

  const startRequested = request.nextUrl.searchParams.get("start") === "1";

  // Bei einem verlorenen Wettlauf (der Webhook war schneller) einmal komplett
  // neu lesen und neu rechnen. Blind überschreiben würde dessen Verkauf löschen.
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      return await runTick(startRequested);
    } catch (err) {
      if (err instanceof TickerConflictError && versuch === 0) {
        console.warn("[ticker/tick] Zustand war veraltet — lese neu");
        continue;
      }
      console.error("[ticker/tick] fehlgeschlagen:", err);
      // Bewusst 200: Ein Cron-Dienst, der 5xx sieht, kann sich abschalten. Der
      // Fehler steht in den Vercel-Logs, der Preis bleibt unverändert, und der
      // nächste Lauf holt die Zeit ohnehin nach (der Drift ist zeitbasiert).
      return NextResponse.json({
        status: "error",
        message: (err as Error).message,
      });
    }
  }
  // Unerreichbar — die Schleife kehrt immer zurück. TypeScript weiß das nicht.
  return NextResponse.json({ status: "error", message: "unerwartet" });
}

async function runTick(startRequested: boolean) {
  const now = new Date();
  const { state, currentPriceEuro, currentInventory, inventoryTracked, compareDigest } =
    await readTicker();

  if (!state && !startRequested) {
    return NextResponse.json({
      status: "not_started",
      hint: "Börse läuft noch nicht. Start mit ?start=1 — bis dahin bleibt der Shop-Preis unangetastet.",
      startPrice: C.startPriceEuro,
      currentPriceEuro,
      currentInventory,
      inventoryTracked,
    });
  }

  // Ohne Bestandsverfolgung liefert Shopify inventoryQuantity = 0 — die Engine
  // würde jeden Tick als Totalverkauf lesen. Das gilt beim Start UND im Betrieb:
  // Wird das Tracking später abgeschaltet, muss die Börse ebenfalls anhalten.
  if (!inventoryTracked) {
    return NextResponse.json({
      status: "paused",
      reason:
        "Bestandsverfolgung ist für die Ticket-Variante deaktiviert. Die Börse braucht sie, um Verkäufe zu erkennen — bis dahin bleibt der Preis stehen.",
    });
  }

  const next = state
    ? tick(state, currentInventory, now)
    : initState(C.startPriceEuro, currentInventory, now);

  if (!state || next !== state) {
    await writeTicker(
      { ...next, history: pruneHistory(next.history, now) },
      // Der LIVE-Preis aus dem Shop, nicht der aus dem Zustand abgeleitete.
      // Nur so wird eine Divergenz (Zustand geschrieben, Preis nicht) je repariert.
      currentPriceEuro,
      compareDigest
    );
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({
    status: state ? "ok" : "started",
    price: shopPrice(priceOf(next)),
    soldCount: next.soldCount,
    event: next.history.at(-1)?.event,
  });
}
