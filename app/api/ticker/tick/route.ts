import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { initState, priceOf, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";
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

  try {
    const now = new Date();
    const { state, currentInventory, inventoryTracked } = await readTicker();
    const startRequested = request.nextUrl.searchParams.get("start") === "1";

    if (!state && !startRequested) {
      return NextResponse.json({
        status: "not_started",
        hint: "Börse läuft noch nicht. Start mit ?start=1 — bis dahin bleibt der Shop-Preis unangetastet.",
        startPrice: C.startPriceEuro,
        currentInventory,
        inventoryTracked,
      });
    }

    // Ohne Bestandsverfolgung liefert Shopify inventoryQuantity = 0 — die
    // Engine würde jeden Tick als Totalverkauf lesen. Lieber gar nicht starten.
    if (!state && !inventoryTracked) {
      return NextResponse.json(
        {
          status: "refused",
          reason:
            "Bestandsverfolgung ist für die Ticket-Variante deaktiviert. Die Börse braucht sie, um Verkäufe zu erkennen.",
        },
        { status: 409 }
      );
    }

    const next = state
      ? tick(state, currentInventory, now)
      : initState(C.startPriceEuro, currentInventory, now);

    if (!state || next !== state) {
      await writeTicker(
        { ...next, history: pruneHistory(next.history, now) },
        state ? shopPrice(priceOf(state)) : null
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
  } catch (err) {
    // Sichtbar in den Vercel-Logs — ein stiller Dauerausfall wäre schlimmer
    // als ein lauter Fehler (der Preis bleibt in beiden Fällen unverändert).
    console.error("[ticker/tick] fehlgeschlagen:", err);
    return NextResponse.json(
      { error: "tick failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}
