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
 * Cron (QStash, alle 5 Minuten): Drift anwenden + verpasste Verkäufe nachziehen.
 * Vercel-Hobby-Crons laufen nur 1×/Tag — deshalb QStash, wie im Ticket-System
 * (Anlage siehe Handoff/Go-Live; Vorbild tonherd-tickets/docs/RUNBOOK.md).
 *
 * Drei Schutzschichten, bevor irgendetwas geschrieben wird:
 *  1. Bearer CRON_SECRET (zeitkonstant verglichen; QStash liefert ihn über
 *     Upstash-Forward-Authorization)
 *  2. TICKER_ENABLED — der Not-Aus. Ohne "1" passiert gar nichts.
 *  3. ?start=1 — die Börse startet NUR auf ausdrücklichen Wunsch. Ohne
 *     Metafield und ohne diesen Parameter bleibt der Shop-Preis unangetastet.
 *
 * ANTWORT-POLITIK (Lehre aus dem Ticket-System, dessen Runbook §"nie 5xx"):
 * Ein NACKTER Lauf (der Scheduler) bekommt IMMER 200 — auch bei Fehlern und
 * Anomalien steht das Ergebnis nur im Body (`status`). Ein Fehlercode kauft
 * beim 5-Minuten-Takt nichts (der nächste Lauf ist ohnehin der Retry) und
 * riskiert Retry-Stürme bzw. Trigger-Dienste, die sich nach Fehlerserien
 * selbst abschalten — dann bliebe die Börse auch NACH der Heilung tot.
 * Alarmiert wird stattdessen über /api/ticker/status + externen Wächter.
 * Nur die MENSCHLICHEN Hebel (?start / ?rebaseline / ?reconcile) behalten
 * sprechende HTTP-Codes — da sitzt jemand mit curl davor.
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

  // ?reconcile=<sprünge> — der Operator bestätigt GENAU den Sprung, den der
  // 409 gemeldet hat (signiert, z. B. -10). Ein bloßes "ja" wäre gefährlich:
  // Zwischen Sehen und Bestätigen kann sich der Bestand weiterbewegen, und
  // bestätigt würde dann ungefragt der NEUE Sprung. Weicht der Wert ab → 409.
  const reconcileRaw = request.nextUrl.searchParams.get("reconcile");
  let reconcileSprung: number | null = null;
  if (reconcileRaw !== null) {
    if (!/^-?\d{1,5}$/.test(reconcileRaw)) {
      return NextResponse.json(
        {
          status: "reconcile_ungueltig",
          hint: "?reconcile erwartet den gemeldeten Sprung als ganze Zahl, z. B. ?reconcile=-10",
        },
        { status: 400 }
      );
    }
    reconcileSprung = parseInt(reconcileRaw, 10);
  }
  if (rebaselineRequested && reconcileSprung !== null) {
    return NextResponse.json(
      {
        status: "hebel_konflikt",
        hint: "rebaseline und reconcile schließen einander aus — entweder Korrektur ODER echter Sprung.",
      },
      { status: 400 }
    );
  }

  // Nackter Scheduler-Lauf oder menschlicher Hebel? Entscheidet über die
  // HTTP-Codes im Fehlerfall (siehe Antwort-Politik oben).
  const manuell =
    startRequested || rebaselineRequested || reconcileSprung !== null;

  // Bei einem verlorenen Wettlauf (der Webhook war schneller) komplett neu lesen
  // und neu rechnen. Blind überschreiben würde dessen Verkauf löschen.
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return await runTick(startRequested, rebaselineRequested, reconcileSprung);
    } catch (err) {
      if (err instanceof TickerConflictError && versuch < 2) {
        console.warn("[ticker/tick] Zustand war veraltet — lese neu");
        continue;
      }
      // Dritter Konflikt in Folge: aufgeben und ehrlich benennen. (Vorher
      // fiel dieser Fall in den generischen Fehlerpfad — die eigens
      // vorgesehene Meldung nach der Schleife war unerreichbar.)
      if (err instanceof TickerConflictError) {
        return NextResponse.json(
          { status: "error", message: "Zustand blieb nach 3 Versuchen umkämpft" },
          { status: manuell ? 500 : 200 }
        );
      }
      // Der Bestand ergibt keinen Sinn (Reset? Admin-Korrektur? Ausverkauf?).
      // Aus dem Bestand allein ist das nicht zu unterscheiden — also NICHTS
      // schreiben. Der Preis bleibt stehen, kein Verkauf geht verloren, und
      // ein Mensch entscheidet über die Hebel im `hinweis`.
      if (err instanceof InventoryAnomalyError) {
        console.error("[ticker/tick] BESTANDS-ANOMALIE:", err.message);
        return NextResponse.json(
          {
            status: "anomaly",
            message: err.message,
            ...err.details,
            hinweis:
              "Nichts geschrieben, Preis unverändert. War es eine Bestands-Korrektur " +
              "(Tickets nachgelegt, Admin-Berichtigung)? Dann ?rebaseline=1 — die Baseline " +
              "zieht nach, der Kurs bleibt. Waren es ECHTE Verkäufe oder echte Stornos " +
              "(z. B. ein Refund-Batch)? Dann ?reconcile=<spruenge> mit GENAU dem oben " +
              "gemeldeten Wert — der Sprung wird als echt übernommen und bewegt den Kurs.",
          },
          // Scheduler: 200, sonst Retry-Sturm/Selbstabschaltung. Mensch: 409.
          // Der Wächter sieht die Anomalie über /api/ticker/status (503).
          { status: manuell ? 409 : 200 }
        );
      }
      console.error("[ticker/tick] fehlgeschlagen:", err);
      // Der Preis bleibt in jedem Fall unverändert, und der nächste Lauf holt
      // die Zeit nach — der Drift ist zeitbasiert. Dem SCHEDULER trotzdem 200
      // geben (Antwort-Politik oben); der Ausfall ist nicht versteckt, sondern
      // wandert über /api/ticker/status + Wächter in eine Alarm-Mail.
      return NextResponse.json(
        { status: "error", message: (err as Error).message },
        { status: manuell ? 500 : 200 }
      );
    }
  }
  return NextResponse.json(
    { status: "error", message: "Zustand blieb nach 3 Versuchen umkämpft" },
    { status: manuell ? 500 : 200 }
  );
}

async function runTick(
  startRequested: boolean,
  rebaselineRequested: boolean,
  reconcileSprung: number | null
) {
  // Menschlicher Hebel? Dann ehrliche HTTP-Codes statt Scheduler-200
  // (siehe Antwort-Politik am GET-Handler).
  const manuell = startRequested || rebaselineRequested || reconcileSprung !== null;
  const now = new Date();
  const { state, currentPriceEuro, currentInventory, inventoryTracked, compareDigest } =
    await readTicker();

  // Die Verkaufszahl kommt, wenn möglich, aus dem Ticket-System (Bestell-Ledger)
  // statt aus dem Bestand. Siehe lib/ticker/tickets-quelle.ts.
  const ticketZahl = ticketQuelleKonfiguriert() ? await ticketVerkaufszahl() : null;

  if (!state && !startRequested) {
    // Hebel ohne Zustand: dem Operator ehrlich sagen, dass es nichts zu
    // hebeln gibt — nicht mit not_started/200 abspeisen.
    if (rebaselineRequested || reconcileSprung !== null) {
      return NextResponse.json(
        {
          status: "hebel_ohne_zustand",
          hint: "Die Börse läuft noch nicht — es gibt keinen Zustand, auf den rebaseline/reconcile wirken könnte.",
        },
        { status: 400 }
      );
    }
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

  // ---- Start-Gate: kein Start mit halber Wahrheit ----
  // Ist das Ticket-System konfiguriert, antwortet aber gerade nicht (nicht
  // erreichbar, nicht scharf, Müll-Antwort), dann würde `startTickets = 0`
  // eingefroren. Sobald das System später antwortet, zählten ALLE Alt-Tickets
  // als frische Verkäufe — Kurs stürzte an den Boden, die Börse verschenkte
  // Rabatt für Käufe, die vor ihr lagen. Ein einziger Timeout im Start-Moment
  // genügt dafür. Also: verweigern.
  if (!state && startRequested && ticketQuelleKonfiguriert() && !ticketZahl) {
    return NextResponse.json(
      {
        status: "start_verweigert",
        hint:
          "Das Ticket-System ist konfiguriert, liefert aber gerade keine Zahl " +
          "(nicht erreichbar oder Event nicht scharf). Ohne die Alt-Ticket-Baseline " +
          "darf die Börse nicht starten. Erst das Ticket-System scharfschalten, dann ?start=1.",
      },
      { status: 503 }
    );
  }

  // ---- Türöffnung: die Börse macht Schluss ----
  // Das Ticket-System nullt bei Türöffnung den Bestand und nimmt das Produkt aus
  // dem Shop (sein Verkaufs-Stopp). Liefe die Börse weiter, läse sie diesen
  // Bestandssturz — vor der Härtung hätte sie ihn als Ausverkauf gelesen und den
  // Kurs beim eigenen Konzert auf den Boden gedrückt. Also: vorher aufhören.
  // Der Preis bleibt stehen, wo er war; verkauft wird ohnehin nicht mehr.
  const schluss = new Date(ticketZahl?.doorsUtc ?? C.gigDateIso).getTime();
  if (now.getTime() >= schluss) {
    return NextResponse.json({
      status: "beendet",
      reason: "Türöffnung erreicht — die Börse ist geschlossen, der Preis bleibt stehen.",
      price: state ? shopPrice(priceOf(state, now)) : currentPriceEuro,
    });
  }

  // Welche Quelle GILT: die im Zustand eingefrorene — nicht die, die die
  // Env-Variablen gerade nahelegen. Ein nachträglich gesetztes TICKETS_BASE_URL
  // darf einen bestandsbasierten Zustand NICHT still auf das Ticket-System
  // umstellen (alle Alt-Tickets würden als frische Verkäufe den Kurs stürzen) — und
  // entfernte Envs dürfen einen Ticket-Zustand nicht still auf den womöglich
  // divergenten Bestand kippen. Wechsel nur explizit: Börse neu starten.
  const aktiveQuelleIstTickets = state
    ? state.quelle === "tickets"
    : Boolean(ticketZahl);

  if (state?.quelle === "tickets" && !ticketQuelleKonfiguriert()) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Der Börsen-Zustand hat das Ticket-System als Quelle, aber TICKETS_BASE_URL/" +
          "TICKETS_MONITOR_SECRET fehlen. Envs wiederherstellen — oder die Börse bewusst " +
          "neu aufsetzen. Es wird NICHT still auf den Bestand gewechselt.",
      },
      // Scheduler: 200 (Antwort-Politik); der Wächter alarmiert über /status.
      { status: manuell ? 500 : 200 }
    );
  }

  // Ohne Bestandsverfolgung liefert Shopify inventoryQuantity = 0 — die Engine
  // würde jeden Tick als Totalverkauf lesen. Das gilt beim Start UND im Betrieb.
  // Läuft die Börse auf dem Ticket-System, ist uns der Bestand egal.
  if (!inventoryTracked && !aktiveQuelleIstTickets) {
    return NextResponse.json(
      {
        status: "paused",
        reason:
          "Bestandsverfolgung ist deaktiviert und die Börse läuft auf der Bestands-Quelle. " +
          "Ohne eine verlässliche Verkaufszahl bleibt der Preis stehen.",
      },
      // Für den Scheduler ist das ein ruhiger Dauerzustand (200, die Ampel
      // meldet ihn) — ein Mensch mit Hebel soll aber sehen, dass er wirkungslos war.
      { status: manuell ? 503 : 200 }
    );
  }

  // ---- Die zwei menschlichen Hebel für Bestands-Anomalien (409) ----
  // Ein Reset, eine Aufstockung, ein Ausverkauf und ein Refund-Batch sind aus
  // dem Bestand allein NICHT unterscheidbar — deshalb entscheidet ein Mensch,
  // WAS der Sprung war, und die beiden Hebel tun Verschiedenes:
  //
  //   ?rebaseline=1 → "War eine KORREKTUR" (Tickets nachgelegt, Admin hat
  //     berichtigt): Die Baseline zieht nach, Verkaufszahl und Preis bleiben.
  //   ?reconcile=<sprünge> → "War ECHT" (echte Verkäufe oder echte Stornos,
  //     etwa ein Refund-Batch nach einer Absage): Der Sprung wird übernommen
  //     und bewegt den Kurs. Rebaseline wäre hier falsch — es löschte die
  //     echten Stornos lautlos aus Kurs und Statistik.
  //
  // Beide NUR im Bestands-Modus: Im Ticket-Modus kommt die Zahl aus dem
  // Bestell-Ledger, dort entstehen keine Anomalien (das Ledger wird in beide
  // Richtungen geglaubt) und es gibt nichts aufzulösen.
  if (state && (rebaselineRequested || reconcileSprung !== null)) {
    if (state.quelle === "tickets") {
      return NextResponse.json(
        {
          status: "hebel_unnoetig",
          hint:
            "Diese Börse läuft auf dem Ticket-System — die Verkaufszahl kommt aus dem " +
            "Bestell-Ledger, Bestands-Anomalien gibt es hier nicht aufzulösen.",
        },
        { status: 400 }
      );
    }
    if (rebaselineRequested) {
      const gezogen = rebaseline(state, currentInventory, now);
      await writeTicker(prepareForWrite(gezogen, now), currentPriceEuro, compareDigest, now);
      revalidatePath("/de/tickets");
      revalidatePath("/en/tickets");
      return NextResponse.json({
        status: "rebaselined",
        startInventory: gezogen.startInventory,
        soldCount: gezogen.soldCount,
        price: shopPrice(priceOf(gezogen, now)),
      });
    }
    // reconcile: exakt den BESTÄTIGTEN Sprung übernehmen — über den normalen
    // tick()-Pfad, damit Drift, History-Punkt (sale/refund samt Menge) und die
    // Repräsentierbarkeits-Grenze ganz normal gelten. Hat sich der Bestand
    // zwischen Sehen (409) und Bestätigen weiterbewegt, wird NICHT der neue
    // Sprung geschluckt, sondern erneut angehalten — der Operator bestätigt
    // Zahlen, keine Zeitpunkte.
    const aktuellerSprung =
      state.startInventory - currentInventory - state.ignoredTickets - state.soldCount;
    if (aktuellerSprung !== reconcileSprung) {
      return NextResponse.json(
        {
          status: "reconcile_abgelehnt",
          bestaetigt: reconcileSprung,
          gefunden: aktuellerSprung,
          hint:
            "Der Bestand hat sich seit der Meldung bewegt. Neu prüfen und mit " +
            `?reconcile=${aktuellerSprung} bestätigen, wenn auch DIESER Sprung echt ist.`,
        },
        { status: 409 }
      );
    }
    const uebernommen = tick(state, currentInventory, now, {
      trustedSales: Math.abs(aktuellerSprung),
    });
    await writeTicker(prepareForWrite(uebernommen, now), currentPriceEuro, compareDigest, now);
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
    return NextResponse.json({
      status: "reconciled",
      soldCount: uebernommen.soldCount,
      price: shopPrice(priceOf(uebernommen, now)),
    });
  }

  let next: TickerState;
  let quelle: string;
  let hinweis: string | undefined;

  if (!state) {
    // Börsenstart. Die bereits verkauften Tickets werden als Baseline eingefroren —
    // die Alt-Bestellungen aus der Evey-Zeit dürfen den Kurs nicht stürzen.
    // Die Quelle wird MIT eingefroren (das Start-Gate oben garantiert: wenn das
    // Ticket-System konfiguriert ist, ist ticketZahl hier vorhanden).
    next = initState(
      C.startPriceEuro,
      currentInventory,
      now,
      ticketZahl?.gueltigeTickets ?? 0,
      ticketZahl ? "tickets" : "bestand"
    );
    quelle = ticketZahl ? "ticket-system" : "bestand";
  } else if (state.quelle === "tickets" && ticketZahl) {
    // NORMALFALL: Die Verkaufszahl kommt aus dem Bestell-Ledger des Ticket-Systems.
    // Sie ist keine Schätzung, sondern gezählt — Stornos sind darin schon abgezogen.
    // Darum darf sie die Sicherheitsklemme in BEIDE Richtungen überschreiten
    // (`trustedSales` = Betrag der Änderung): Auch ein Storno unter die
    // Alt-Ticket-Baseline ist dort eine gezählte Wahrheit und senkt den Kurs.
    const bestand = bestandAusTicketZahl(state, ticketZahl.gueltigeTickets);
    const diff = Math.abs(
      ticketZahl.gueltigeTickets - state.startTickets - state.ignoredTickets - state.soldCount
    );
    next = tick(state, bestand, now, { trustedSales: diff });
    quelle = "ticket-system";
  } else if (state.quelle === "tickets") {
    // Das Ticket-System ist die Quelle, schweigt aber gerade (nicht erreichbar,
    // nicht scharf, oder die Antwort war Müll). Dann NUR driften — nicht heimlich
    // auf den Bestand zurückfallen: Beide Quellen können auseinanderliegen (ein
    // Storno ohne Rückbuchung etwa senkt den Bestand nie), und ein stiller
    // Quellenwechsel erzeugte einen Preissprung aus dem Nichts.
    next = tick(state, bestandOhneAenderung(state), now);
    quelle = "nur-drift (Ticket-System schweigt)";
  } else {
    // Zustand läuft auf der Bestands-Quelle → Bestands-Modus, mit allen Klemmen.
    // Auch dann, wenn die Envs inzwischen ein Ticket-System kennen (kein
    // stiller Wechsel — siehe oben).
    next = tick(state, currentInventory, now);
    quelle = "bestand";
    if (ticketQuelleKonfiguriert()) {
      hinweis =
        "Ticket-System ist konfiguriert, aber dieser Börsen-Zustand wurde auf der " +
        "Bestands-Quelle gestartet. Wechsel nur explizit (Börse neu aufsetzen).";
    }
  }

  // Auch wenn sich der Zustand nicht geändert hat: Weicht der Shop-Preis vom
  // abgeleiteten Kurs ab, muss er nachgezogen werden. Sonst bliebe eine
  // Divergenz (etwa nach einem fehlgeschlagenen Preis-Write oder einer
  // Preisänderung von Hand im Admin) für immer stehen.
  const sollPreis = shopPrice(priceOf(next, now));
  const preisWeichtAb = currentPriceEuro !== sollPreis;

  if (!state || next !== state || preisWeichtAb) {
    await writeTicker(
      prepareForWrite(next, now),
      // Der LIVE-Preis aus dem Shop, nicht der aus dem Zustand abgeleitete.
      currentPriceEuro,
      compareDigest,
      now
    );
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({
    status: state ? "ok" : "started",
    quelle,
    ...(hinweis ? { hinweis } : {}),
    price: sollPreis,
    soldCount: next.soldCount,
    event: next.history.at(-1)?.event,
  });
}
