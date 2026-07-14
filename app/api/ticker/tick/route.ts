import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import {
  bestandAusTicketZahl,
  bestandOhneAenderung,
  initState,
  InventoryAnomalyError,
  prepareForWrite,
  priceOf,
  rebaseline,
  shopPrice,
  tick,
  type TickerState,
} from "@/lib/ticker/engine";
import {
  ticketQuelleKonfiguriert,
  ticketVerkaufszahl,
} from "@/lib/ticker/tickets-quelle";
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
  const rebaselineRequested =
    request.nextUrl.searchParams.get("rebaseline") === "1";

  // Bei einem verlorenen Wettlauf (der Webhook war schneller) komplett neu lesen
  // und neu rechnen. Blind überschreiben würde dessen Verkauf löschen.
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return await runTick(startRequested, rebaselineRequested);
    } catch (err) {
      if (err instanceof TickerConflictError && versuch < 2) {
        console.warn("[ticker/tick] Zustand war veraltet — lese neu");
        continue;
      }
      // Der Bestand ergibt keinen Sinn (Reset? Admin-Korrektur? Ausverkauf?).
      // Aus dem Bestand allein ist das nicht zu unterscheiden — also NICHTS
      // schreiben. Der Preis bleibt stehen, kein Verkauf geht verloren, und
      // ein Mensch entscheidet mit `?rebaseline=1`.
      if (err instanceof InventoryAnomalyError) {
        console.error("[ticker/tick] BESTANDS-ANOMALIE:", err.message);
        return NextResponse.json(
          {
            status: "anomaly",
            message: err.message,
            ...err.details,
            hinweis:
              "Nichts geschrieben, Preis unverändert. War es eine Bestands-Korrektur? " +
              "Dann den Lauf einmal mit ?rebaseline=1 aufrufen — die Baseline zieht nach, " +
              "der Kurs bleibt. Waren es echte Verkäufe, erst die Webhooks reparieren.",
          },
          { status: 409 }
        );
      }
      console.error("[ticker/tick] fehlgeschlagen:", err);
      // 500 ist hier richtig: Vercel-Cron schaltet bei Fehlern NICHT ab, sondern
      // markiert den Lauf in der Oberfläche als fehlgeschlagen. Eine 200er-
      // Antwort mit "status: error" würde den Ausfall verstecken — und ein
      // stiller Dauerausfall ist das Schlimmste, was der Börse passieren kann.
      // (Achtung, falls je auf QStash o.ä. umgestellt wird: Solche Dienste
      // deaktivieren sich nach wiederholten 5xx. Dann muss das hier neu bewertet
      // werden.)
      // Der Preis bleibt in jedem Fall unverändert, und der nächste Lauf holt die
      // Zeit nach — der Drift ist zeitbasiert.
      return NextResponse.json(
        { status: "error", message: (err as Error).message },
        { status: 500 }
      );
    }
  }
  return NextResponse.json(
    { status: "error", message: "Zustand blieb nach 3 Versuchen umkämpft" },
    { status: 500 }
  );
}

async function runTick(startRequested: boolean, rebaselineRequested: boolean) {
  const now = new Date();
  const { state, currentPriceEuro, currentInventory, inventoryTracked, compareDigest } =
    await readTicker();

  // Die Verkaufszahl kommt, wenn möglich, aus dem Ticket-System (Bestell-Ledger)
  // statt aus dem Bestand. Siehe lib/ticker/tickets-quelle.ts.
  const ticketZahl = ticketQuelleKonfiguriert() ? await ticketVerkaufszahl() : null;

  if (!state && !startRequested) {
    return NextResponse.json({
      status: "not_started",
      hint: "Börse läuft noch nicht. Start mit ?start=1 — bis dahin bleibt der Shop-Preis unangetastet.",
      startPrice: C.startPriceEuro,
      currentPriceEuro,
      currentInventory,
      inventoryTracked,
      quelle: ticketZahl ? "ticket-system" : "bestand",
      gueltigeTickets: ticketZahl?.gueltigeTickets,
    });
  }

  // ---- Türöffnung: die Börse macht Schluss ----
  // Das Ticket-System nullt bei Türöffnung den Bestand und nimmt das Produkt aus
  // dem Shop (sein Verkaufs-Stopp). Liefe die Börse weiter, läse sie diesen
  // Bestandssturz — vor der Härtung hätte sie ihn als Ausverkauf gelesen und den
  // Kurs beim eigenen Konzert an den Deckel geschossen. Also: vorher aufhören.
  // Der Preis bleibt stehen, wo er war; verkauft wird ohnehin nicht mehr.
  const schluss = new Date(ticketZahl?.doorsUtc ?? C.gigDateIso).getTime();
  if (now.getTime() >= schluss) {
    return NextResponse.json({
      status: "beendet",
      reason: "Türöffnung erreicht — die Börse ist geschlossen, der Preis bleibt stehen.",
      price: state ? shopPrice(priceOf(state)) : currentPriceEuro,
    });
  }

  // Ohne Bestandsverfolgung liefert Shopify inventoryQuantity = 0 — die Engine
  // würde jeden Tick als Totalverkauf lesen. Das gilt beim Start UND im Betrieb.
  // Kommt die Zahl aus dem Ticket-System, ist uns der Bestand allerdings egal.
  if (!inventoryTracked && !ticketZahl) {
    return NextResponse.json({
      status: "paused",
      reason:
        "Bestandsverfolgung ist deaktiviert und das Ticket-System liefert keine Zahl. " +
        "Ohne eine verlässliche Verkaufszahl bleibt der Preis stehen.",
    });
  }

  // `?rebaseline=1`: Der Mensch bestätigt, dass der Bestands-Sprung eine
  // Korrektur war (Kollege hat Tickets nachgelegt, Admin hat berichtigt). Die
  // Baseline zieht nach, Verkaufszahl und Preis bleiben unberührt.
  if (state && rebaselineRequested) {
    const gezogen = rebaseline(state, currentInventory, now);
    await writeTicker(prepareForWrite(gezogen, now), currentPriceEuro, compareDigest);
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
    return NextResponse.json({
      status: "rebaselined",
      startInventory: gezogen.startInventory,
      soldCount: gezogen.soldCount,
      price: shopPrice(priceOf(gezogen)),
    });
  }

  let next: TickerState;
  let quelle: string;

  if (!state) {
    // Börsenstart. Die bereits verkauften Tickets werden als Baseline eingefroren —
    // die Alt-Bestellungen aus der Evey-Zeit dürfen den Kurs nicht hochreißen.
    next = initState(
      C.startPriceEuro,
      currentInventory,
      now,
      ticketZahl?.gueltigeTickets ?? 0
    );
    quelle = ticketZahl ? "ticket-system" : "bestand";
  } else if (ticketZahl) {
    // NORMALFALL: Die Verkaufszahl kommt aus dem Bestell-Ledger des Ticket-Systems.
    // Sie ist keine Schätzung, sondern gezählt — Stornos sind darin schon abgezogen.
    // Darum darf sie die Sicherheitsklemme überschreiten (`trustedSales`), die nur
    // dazu da war, geratene Bestandssprünge abzufangen.
    const bestand = bestandAusTicketZahl(state, ticketZahl.gueltigeTickets);
    const diff = Math.abs(
      ticketZahl.gueltigeTickets - state.startTickets - state.ignoredTickets - state.soldCount
    );
    next = tick(state, bestand, now, { trustedSales: diff });
    quelle = "ticket-system";
  } else if (ticketQuelleKonfiguriert()) {
    // Das Ticket-System ist die Quelle, schweigt aber gerade (nicht erreichbar, oder
    // Event nicht scharf). Dann NUR driften — nicht heimlich auf den Bestand
    // zurückfallen: Beide Quellen können auseinanderliegen (ein Storno ohne
    // Rückbuchung etwa senkt den Bestand nie), und ein stiller Quellenwechsel
    // erzeugte einen Preissprung aus dem Nichts.
    next = tick(state, bestandOhneAenderung(state), now);
    quelle = "nur-drift (Ticket-System schweigt)";
  } else {
    // Kein Ticket-System konfiguriert → alter Bestands-Modus, mit allen Klemmen.
    next = tick(state, currentInventory, now);
    quelle = "bestand";
  }

  // Auch wenn sich der Zustand nicht geändert hat: Weicht der Shop-Preis vom
  // abgeleiteten Kurs ab, muss er nachgezogen werden. Sonst bliebe eine
  // Divergenz (etwa nach einem fehlgeschlagenen Preis-Write oder einer
  // Preisänderung von Hand im Admin) für immer stehen.
  const sollPreis = shopPrice(priceOf(next));
  const preisWeichtAb = currentPriceEuro !== sollPreis;

  if (!state || next !== state || preisWeichtAb) {
    await writeTicker(
      prepareForWrite(next, now),
      // Der LIVE-Preis aus dem Shop, nicht der aus dem Zustand abgeleitete.
      currentPriceEuro,
      compareDigest
    );
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({
    status: state ? "ok" : "started",
    quelle,
    price: sollPreis,
    soldCount: next.soldCount,
    event: next.history.at(-1)?.event,
  });
}
