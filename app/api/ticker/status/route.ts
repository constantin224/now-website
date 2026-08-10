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
import {
  ticketQuelleKonfiguriert,
  ticketVerkaufszahl,
} from "@/lib/ticker/tickets-quelle";

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
 *         Hebel, Quelle falsch konfiguriert oder tot, Preis-Divergenz,
 *         Bestandsverfolgung aus).
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

  // Läuft die Börse auf dem Ticket-System, wird die Quelle hier MITGEPRÜFT
  // (read-only): Eine tote Quelle hieße, der Tick driftet nur noch — mit
  // frischem Herzschlag, aber ohne dass Verkäufe je eingepreist werden. Die
  // Ampel darf dabei nicht grün bleiben. Nebeneffekt: liefert das echte
  // doorsUtc für den Beendet-Kurzschluss (gigDateIso ist nur die Rückfallebene).
  const ticketZahl =
    state.quelle === "tickets" && ticketQuelleKonfiguriert()
      ? await ticketVerkaufszahl()
      : null;

  // Nach der Türöffnung tickt nichts mehr — lastTickAt friert dann ein, und
  // das ist KEIN Ausfall.
  const schluss = new Date(ticketZahl?.doorsUtc ?? C.gigDateIso).getTime();
  if (now.getTime() >= schluss) {
    return NextResponse.json({ status: "beendet" });
  }

  const probleme: string[] = [];

  // 1. Herzschlag: QStash-Takt ist 5 Minuten — 30 Minuten ohne Tick sind
  //    6 verpasste Läufe, das ist ein stehender Cron, kein Schluckauf.
  const stundenSeitTick =
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000;
  if (stundenSeitTick > 0.5) {
    probleme.push(
      `Cron steht: letzter Tick vor ${(stundenSeitTick * 60).toFixed(0)} min (${state.lastTickAt})`
    );
  }

  // 2. Preis-Divergenz: Schreibt der Tick zwar den Zustand (Herzschlag frisch),
  //    scheitert aber dauerhaft am Preis-Write, sähen Kunden für immer den
  //    falschen Preis — und niemand merkte es. Eine frische Divergenz heilt
  //    der nächste Tick binnen 5 Minuten; bleibt sie, gehört sie gemeldet.
  //
  //    Geprüft wird ein FENSTER, kein Punkt: Der abgeleitete Kurs kriecht
  //    zwischen den Ticks weiter (+~4 Cent/h), und auch ein Webhook darf
  //    zwischen zwei Cron-Läufen einen Preis mit SEINER Request-Zeit
  //    geschrieben haben. Jeder legitime Write liegt also zwischen dem Kurs
  //    zum letzten Tick und dem Kurs zu jetzt (der Zeit-Anteil wächst
  //    monoton). Nur ein Shop-Preis AUSSERHALB dieses Fensters ist eine
  //    echte Divergenz — ein Punkt-Vergleich meldete bei jedem
  //    10-Cent-Rundungssprung einen Fehlalarm.
  const ankerZeit = new Date(state.lastTickAt);
  const preisAmAnker = shopPrice(priceOf(state, ankerZeit));
  const preisJetzt = shopPrice(priceOf(state, now));
  // Anker in der ZUKUNFT (Uhr-Skew; parseState toleriert bis 24 h): Das
  // Fenster darf dann NICHT über min/max aufgespannt werden — es würde alle
  // Zwischenwerte legitimieren, auch einen dauerhaft toten Preis-Write, und
  // der Herzschlag-Alarm schweigt bei negativem Abstand ebenfalls. Legitim
  // sind hier nur die beiden echten Schreib-Zeitpunkte selbst.
  const divergent =
    ankerZeit.getTime() > now.getTime()
      ? currentPriceEuro !== preisAmAnker && currentPriceEuro !== preisJetzt
      : currentPriceEuro < preisAmAnker || currentPriceEuro > preisJetzt;
  if (divergent) {
    probleme.push(
      `Preis-Divergenz: Shop verlangt ${currentPriceEuro} €, der Kurs sagt ${preisAmAnker}–${preisJetzt} €`
    );
  }

  // 3. Quelle und Anomalien — je nach Modus. Alles hier ist ein TROCKENLAUF:
  //    tick() ist eine pure Funktion, das Ergebnis wird verworfen.
  if (state.quelle === "tickets") {
    if (!ticketQuelleKonfiguriert()) {
      probleme.push(
        "Zustand läuft auf dem Ticket-System, aber TICKETS_BASE_URL/TICKETS_MONITOR_SECRET fehlen"
      );
    } else if (!ticketZahl) {
      probleme.push(
        "Ticket-System liefert keine Zahl (nicht erreichbar, nicht scharf oder Müll-Antwort) — " +
          "die Börse driftet nur, Verkäufe werden nicht eingepreist"
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
    price: preisJetzt,
    shopPrice: currentPriceEuro,
    soldCount: state.soldCount,
    quelle: state.quelle,
    lastTickAt: state.lastTickAt,
  });
}
