import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import {
  hasSeenOrder,
  ignoreTestTickets,
  InventoryAnomalyError,
  prepareForWrite,
  priceOf,
  rememberOrder,
  shopPrice,
  tick,
} from "@/lib/ticker/engine";
import { tickerEnabled } from "@/lib/ticker/guards";
import { feuerTurboTicks } from "@/lib/ticker/turbo";
import { verifyShopifyHmac } from "@/lib/ticker/hmac";
import {
  readTicker,
  TickerConflictError,
  writeTicker,
} from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

interface OrderInfo {
  /** Shopifys Bestell-ID — der Schlüssel gegen Doppelzustellung. */
  id: string | null;
  /** Wie viele Tickets diese Bestellung enthält (0 = reine Merch-Bestellung). */
  tickets: number;
  /** Übungsbestellung im Shopify-Testmodus — darf den echten Kurs nicht bewegen. */
  isTest: boolean;
}

/**
 * Liest aus der Bestellung genau drei Dinge — und NICHTS sonst: die Bestell-ID,
 * die Ticket-Menge und ob es eine Testbestellung ist.
 *
 * Keine Kundendaten, keine Adressen, keine Zahlungsdaten werden angefasst,
 * gespeichert oder geloggt.
 *
 * Warum überhaupt der Payload: Wenn der Webhook eintrifft, hat Shopify das
 * Inventar oft noch nicht dekrementiert (eventually consistent, zusätzlich
 * mischt Evey mit). Ohne Payload-Auswertung würde der Preis-Sprung dann nicht
 * sofort feuern, sondern erst Stunden später beim Cron.
 */
function readOrder(rawBody: string): OrderInfo {
  try {
    const order = JSON.parse(rawBody) as {
      id?: number | string;
      test?: boolean;
      line_items?: { variant_id?: number | string; quantity?: number }[];
    };
    const variantId = C.variantGid.split("/").pop();
    // Nur eine echte Shopify-Bestell-ID akzeptieren (positive Ziffernfolge).
    // Alles andere taugt nicht als Schlüssel gegen Doppelzustellung.
    const id = order.id != null ? String(order.id) : "";

    // JEDE Position einzeln prüfen, nicht die Summe. Sonst hebt eine Position
    // mit −5 eine andere mit +10 teilweise auf, und aus zwei manipulierten
    // Zeilen wird eine plausible Menge. Erlaubt sind nur ganze positive Stückzahlen.
    const positionen = (order.line_items ?? []).filter(
      (li) => String(li.variant_id) === variantId
    );
    let tickets = 0;
    for (const li of positionen) {
      const q = Number(li.quantity);
      if (!Number.isInteger(q) || q <= 0 || q > 1000) return { id: null, tickets: 0, isTest: false };
      tickets += q;
    }
    // Auch die SUMME klemmen: Mehrere Positionen derselben Variante könnten
    // sonst zusammen eine absurde Menge ergeben (die Halle hat 250 Plätze).
    if (tickets > 1000) return { id: null, tickets: 0, isTest: false };

    return {
      id: /^\d{1,25}$/.test(id) && id !== "0" ? id : null,
      isTest: order.test === true,
      tickets,
    };
  } catch {
    return { id: null, tickets: 0, isTest: false }; // unlesbar → der Cron holt es nach
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  // Beide Client-Secrets der App akzeptieren (Rotation im Dev Dashboard):
  // Shopify signiert mit dem ÄLTESTEN nicht widerrufenen Secret — siehe
  // lib/ticker/hmac.ts. Ohne _ALT war der Webhook seit der Rotation 401.
  const secrets = [process.env.SHOPIFY_WEBHOOK_SECRET, process.env.SHOPIFY_WEBHOOK_SECRET_ALT]
    .filter((s): s is string => Boolean(s));
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (secrets.length === 0 || !verifyShopifyHmac(rawBody, hmac, secrets)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tickerEnabled()) {
    return NextResponse.json({ status: "disabled" });
  }

  const order = readOrder(rawBody);

  // Bestellungen ohne Ticket (Merch, CDs) gar nicht weiterverarbeiten — spart
  // zwei Shopify-Calls pro Bestellung.
  if (order.tickets === 0) {
    return NextResponse.json({ ok: true, tickets: 0 });
  }
  // Ohne brauchbare Bestell-ID ist keine Deduplizierung möglich → nicht anfassen.
  // Der Cron zieht den Verkauf ohnehin aus dem Bestand nach.
  if (!order.id) {
    return NextResponse.json({ ok: true, ignoriert: "Bestellung ohne gültige ID" });
  }

  // GESAMT-DEADLINE über der kompletten Verarbeitung: Shopify erwartet die
  // Antwort in ~5 s und löscht Abos nach anhaltenden Überschreitungen — aber
  // readTicker allein darf (kalter Token + hängende API) bis zu 20 s brauchen.
  // Läuft die Deadline ab, antworten wir mit Fallback: Verkäufe bekommen 200
  // (im Ticket-Modus bucht der Webhook ohnehin nichts, sonst zieht der Cron
  // nach — nichts geht verloren). TESTBESTELLUNGEN bekommen 500: Ihre
  // Neutralisierung darf im Bestands-Notpfad nicht verloren gehen (der Cron
  // zählte den Test-Bestandsabgang sonst als echten Verkauf) — der
  // Shopify-Retry gibt ihr eine neue Chance, und `recentOrders` verhindert
  // eine Doppel-Neutralisierung, falls der erste Lauf doch durchkam.
  const deadlineMs = Number(process.env.WEBHOOK_DEADLINE_MS ?? "4000");
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<NextResponse>((resolve) => {
    deadlineTimer = setTimeout(
      () =>
        resolve(
          order.isTest
            ? NextResponse.json({ error: "timeout — retry erwünscht" }, { status: 500 })
            : NextResponse.json({
                ok: true,
                status: "langsam",
                note: "Shopify antwortet träge — der Cron zieht den Verkauf nach",
              })
        ),
      deadlineMs
    );
  });
  try {
    return await Promise.race([
      verarbeiteBestellung(order.id, order.tickets, order.isTest),
      deadline,
    ]);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

async function verarbeiteBestellung(orderId: string, tickets: number, isTest: boolean) {
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return await handleOrder(orderId, tickets, isTest);
    } catch (err) {
      if (err instanceof TickerConflictError && versuch < 2) {
        console.warn("[ticker/webhook] Zustand war veraltet — lese neu");
        continue;
      }
      // Bestands-Anomalie: Der Cron muss das klären (ein Mensch entscheidet).
      // Hier NICHT mit 500 antworten — Shopify würde denselben Webhook sonst
      // immer wieder zustellen, ohne dass sich etwas ändern kann.
      if (err instanceof InventoryAnomalyError) {
        console.error("[ticker/webhook] BESTANDS-ANOMALIE:", err.message);
        return NextResponse.json({ ok: true, status: "anomaly", message: err.message });
      }
      console.error("[ticker/webhook] fehlgeschlagen:", err);
      // 500 → Shopify stellt erneut zu. Das ist sicher: Die Bestell-ID steht
      // dann bereits in `recentOrders` und wird nicht doppelt gezählt.
      return NextResponse.json({ error: "webhook failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "webhook failed" }, { status: 500 });
}

async function handleOrder(orderId: string, tickets: number, isTest: boolean) {
  const now = new Date();
  const { state, currentPriceEuro, currentInventory, inventoryTracked, compareDigest } =
    await readTicker();

  if (!state) {
    return NextResponse.json({ ok: true, note: "Börse noch nicht gestartet" });
  }

  // Shopify stellt Webhooks MINDESTENS einmal zu — dieselbe Bestellung kommt
  // im Normalbetrieb mehrfach an. Ohne diese Sperre zählte sie erneut, solange
  // der Bestand noch nicht fortgeschrieben ist: 5 Tickets → 10 → 15.
  if (hasSeenOrder(state, orderId)) {
    return NextResponse.json({
      ok: true,
      ignoriert: "Bestellung bereits verarbeitet",
      price: shopPrice(priceOf(state, now)),
    });
  }

  // ---- Testbestellung ----
  // Im TICKET-MODUS gibt es nichts zu neutralisieren: Das Bestell-Ledger des
  // Ticket-Systems schließt `test:true` seit 18.07. global aus — die
  // Testbestellung taucht in `gueltigeTickets` gar nicht erst auf. Würde der
  // Webhook hier trotzdem `ignoredTickets` erhöhen, zöge der nächste Cron die
  // Menge DOPPELT ab (soldCount = gueltige − start − ignored) und höbe den
  // Kurs fälschlich an. Kein Schreibvorgang nötig, idempotent.
  if (isTest && state.quelle === "tickets") {
    return NextResponse.json({
      ok: true,
      ignoriert: "Testbestellung",
      tickets,
      hinweis: "Ticket-Ledger zählt Testbestellungen nicht — nichts zu neutralisieren",
    });
  }

  // Im BESTANDS-Notpfad muss sie neutralisiert werden: Sie senkt den Bestand
  // wie jede echte Bestellung, und der Cron würde sie sonst als Verkauf zählen.
  // VOR dem Tracking-Check: Die Neutralisierung braucht den Bestand nicht.
  if (isTest) {
    // readOrder garantiert 1..1000 Tickets, Überläufe faltet die Engine
    // algebraisch auf. Werfen kann nur noch der startInventory-Unterlauf-Guard
    // (bräuchte >1 Mio Fake-Testtickets MIT gültigem HMAC-Secret) — der fällt
    // bewusst in den generischen 500-Pfad: fail-closed, nichts geschrieben;
    // die Bestands-Anomalie des nächsten Cron holt ohnehin einen Menschen.
    const neutralisiert = ignoreTestTickets(state, orderId, tickets);
    // mitAbgleich=false: Shopify erwartet die Webhook-Antwort in ~5 s, sonst löscht
    // es irgendwann das Abo. Jeder gesparte Roundtrip zählt. Der Cron gleicht ab.
    await writeTicker(
      prepareForWrite(neutralisiert, now),
      currentPriceEuro,
      compareDigest,
      now,
      false
    );
    return NextResponse.json({
      ok: true,
      ignoriert: "Testbestellung",
      tickets,
      hinweis: "Effekt neutralisiert — der Kurs bleibt unberührt",
    });
  }

  // ---- Ticket-Modus: der Webhook bucht KEINE Verkäufe mehr ----
  // Die Verkaufszahl kommt aus dem Bestell-Ledger des Ticket-Systems. Würde der
  // Webhook hier zusätzlich über den Bestand buchen, entstünden genau die
  // Fehler, die die Kopplung beseitigen sollte: Er kann mehr als die bestätigte
  // Bestellmenge übernehmen (wenn der Bestand aus anderen Gründen gefallen
  // ist), und Cron und Webhook zählten dieselbe Bestellung vorübergehend
  // doppelt. Der Webhook beschleunigte nur den Preissprung — darauf verzichten
  // wir; kein Schreibvorgang, idempotent.
  //
  // Verzögerung: Der Preissprung kommt mit dem nächsten Börsen-Cron. Der läuft
  // über QStash alle 5 Minuten (Vercel-Hobby-Crons können nur 1×/Tag; Anlage
  // siehe Handoff/Go-Live) — schlimmstenfalls also ~10 Minuten nach dem Kauf
  // (Ticket-System-Ledger 5 min + Börsen-Tick 5 min). Für die Parodie egal.
  if (state.quelle === "tickets") {
    // KAUF-TURBO: Der Webhook bucht weiterhin nichts (Blocker 21) — er bittet
    // die idempotenten Cron-Pfade per verzögerter QStash-Message um frühere
    // Läufe (Ledger +10 s, Börse +75 s/+180 s). Fehler sind folgenlos, der
    // 5-min-Cron bleibt der Fallback. Synchron, aber mit REQUEST-Budget:
    // Was readTicker (kalter Token: mehrere Sekunden möglich) schon
    // verbraucht hat, wird abgezogen — Shopifys ~5-s-Antwortfenster reißt nie.
    const budgetMs = 4_000 - (Date.now() - now.getTime());
    const turbo = await feuerTurboTicks(orderId, budgetMs);
    return NextResponse.json({
      ok: true,
      note: "Ticket-System ist die Quelle — Turbo-Ticks angestoßen, der Cron zieht den Verkauf nach",
      tickets,
      turbo,
    });
  }

  if (!inventoryTracked) {
    return NextResponse.json({ ok: true, note: "Bestandsverfolgung aus — Börse pausiert" });
  }

  // Der Bestand ist die Wahrheit, sobald Shopify ihn fortgeschrieben hat.
  // Hinkt er noch hinterher, reichen wir einen fiktiven Bestand ein, aus dem die
  // Engine genau `soldCount + tickets` ableitet. Ihre Formel lautet
  //   totalSold = startInventory − bestand − ignoredTickets,
  // also muss der fiktive Bestand `ignoredTickets` bereits enthalten — sonst
  // würden die Testtickets zweimal abgezogen.
  const soldByInventory =
    state.startInventory - currentInventory - state.ignoredTickets;
  const effectiveInventory =
    soldByInventory > state.soldCount
      ? currentInventory // Shopify hat den Bestand bereits fortgeschrieben
      : state.startInventory -
        state.ignoredTickets -
        (state.soldCount + tickets);

  // trustedSales: Der Payload ist HMAC-signiert und dedupliziert — GENAU diese
  // Menge darf die Klemme überschreiten. Eine 6er-Bestellung zählt damit voll,
  // ein Bestandssturz auf 0 aber nicht (er hält an und meldet sich).
  // advanceAnchor: false — der Webhook darf den lastTickAt-Anker nicht verschieben,
  // sonst schrumpfte das Zeitfenster der Verkaufsgrenze mit jeder Bestellung.
  const next = tick(state, effectiveInventory, now, {
    advanceAnchor: false,
    trustedSales: tickets,
  });

  const gemerkt = rememberOrder(next, orderId);
  await writeTicker(
    prepareForWrite(gemerkt, now),
    currentPriceEuro, // der LIVE-Preis, nicht der abgeleitete
    compareDigest,
    now,
    false // kein Abgleich-Roundtrip — Shopify wartet nur ~5 s (siehe writeTicker)
  );
  revalidatePath("/de/tickets");
  revalidatePath("/en/tickets");

  return NextResponse.json({
    ok: true,
    tickets,
    price: shopPrice(priceOf(gemerkt, now)),
  });
}
