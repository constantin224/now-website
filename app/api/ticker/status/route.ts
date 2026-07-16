import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import {
  InventoryAnomalyError,
  priceOf,
  shopPrice,
  tick,
} from "@/lib/ticker/engine";
import { authorizeMonitor, tickerEnabled } from "@/lib/ticker/guards";
import { readTicker } from "@/lib/ticker/shopify-admin";
import { ticketQuelleKonfiguriert } from "@/lib/ticker/tickets-quelle";

export const dynamic = "force-dynamic";

/**
 * Betriebsampel für den externen Wächter — NUR LESEN, schreibt nie.
 *
 * Warum es sie gibt: Der Tick-Cron läuft über QStash und antwortet dem
 * Scheduler bewusst NIE mit 5xx (ein Fehlercode kauft dort nichts — der
 * nächste 5-Minuten-Lauf ist ohnehin der Retry — und riskiert Retry-Stürme
 * bzw. dass sich ein Trigger-Dienst selbst abschaltet). Damit kann sich der
 * Cron nicht mehr selbst melden. DIESE Route ist das Sprachrohr: Ein
 * unabhängiger Wächter (Google Apps Script, siehe monitoring/ im
 * Ticket-System) fragt sie alle 5 Minuten ab und mailt bei allem außer 200.
 *
 * Ampel-Logik:
 *   200 — alles gut, ODER bewusst aus (disabled / not_started / beendet).
 *         Vor dem Go-Live und nach der Türöffnung gibt es nichts zu alarmieren.
 *   503 — ein Mensch muss handeln (Cron steht, Anomalie wartet auf einen
 *         Hebel, Quelle falsch konfiguriert, Bestandsverfolgung aus).
 *   500 — nicht einmal lesen geht (Shopify weg, Zustand unlesbar).
 */
export async function GET(request: NextRequest) {
  if (!authorizeMonitor(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tickerEnabled()) {
    return NextResponse.json({ status: "disabled" });
  }

  let read;
  try {
    read = await readTicker();
  } catch (err) {
    return NextResponse.json(
      {
        status: "lese_fehler",
        probleme: [`Börsen-Zustand nicht lesbar: ${(err as Error).message}`],
      },
      { status: 500 }
    );
  }
  const { state, currentPriceEuro, currentInventory, inventoryTracked } = read;

  if (!state) {
    return NextResponse.json({ status: "not_started" });
  }

  const now = new Date();

  // Nach der Türöffnung tickt nichts mehr — lastTickAt friert dann ein, und
  // das ist KEIN Ausfall. (gigDateIso ist die obere Schranke; die echte
  // doorsUtc liegt höchstens davor, und die 3-h-Schwelle unten überbrückt
  // die Lücke zwischen Türöffnung und Konzertbeginn.)
  if (now.getTime() >= new Date(C.gigDateIso).getTime()) {
    return NextResponse.json({ status: "beendet" });
  }

  const probleme: string[] = [];

  // 1. Herzschlag: Der QStash-Takt ist 5 Minuten. 3 Stunden ohne Tick sind
  //    ~36 verpasste Läufe — das ist ein stehender Cron, kein Schluckauf.
  const stundenSeitTick =
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000;
  if (stundenSeitTick > 3) {
    probleme.push(
      `Cron steht: letzter Tick vor ${stundenSeitTick.toFixed(1)} h (${state.lastTickAt})`
    );
  }

  // 2. Quelle und Anomalien — je nach Modus. Alles hier ist ein TROCKENLAUF:
  //    tick() ist eine pure Funktion, das Ergebnis wird verworfen.
  if (state.quelle === "tickets") {
    if (!ticketQuelleKonfiguriert()) {
      probleme.push(
        "Zustand läuft auf dem Ticket-System, aber TICKETS_BASE_URL/TICKETS_MONITOR_SECRET fehlen"
      );
    }
  } else {
    if (!inventoryTracked) {
      probleme.push("Bestandsverfolgung deaktiviert — die Börse pausiert dauerhaft");
    } else {
      try {
        tick(state, currentInventory, now); // Ergebnis verworfen — nur die Anomalie-Prüfung zählt
      } catch (err) {
        if (err instanceof InventoryAnomalyError) {
          probleme.push(`Bestands-Anomalie wartet auf ?rebaseline/?reconcile: ${err.message}`);
        } else {
          probleme.push(`Trockenlauf fehlgeschlagen: ${(err as Error).message}`);
        }
      }
    }
  }

  if (probleme.length) {
    return NextResponse.json({ status: "rot", probleme }, { status: 503 });
  }
  return NextResponse.json({
    status: "ok",
    price: shopPrice(priceOf(state)),
    shopPrice: currentPriceEuro,
    soldCount: state.soldCount,
    quelle: state.quelle,
    lastTickAt: state.lastTickAt,
  });
}
