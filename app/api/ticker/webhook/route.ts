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
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!secret || !verifyShopifyHmac(rawBody, hmac, secret)) {
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

  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return await handleOrder(order.id, order.tickets, order.isTest);
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
  if (!inventoryTracked) {
    return NextResponse.json({ ok: true, note: "Bestandsverfolgung aus — Börse pausiert" });
  }

  // Shopify stellt Webhooks MINDESTENS einmal zu — dieselbe Bestellung kommt
  // im Normalbetrieb mehrfach an. Ohne diese Sperre zählte sie erneut, solange
  // der Bestand noch nicht fortgeschrieben ist: 5 Tickets → 10 → 15.
  if (hasSeenOrder(state, orderId)) {
    return NextResponse.json({
      ok: true,
      ignoriert: "Bestellung bereits verarbeitet",
      price: shopPrice(priceOf(state)),
    });
  }

  // ---- Testbestellung ----
  // Sie darf den Kurs nicht bewegen — aber sie SENKT den Bestand wie jede echte
  // Bestellung. Sie einfach zu ignorieren genügte deshalb nicht: Der nächste Cron
  // hätte den Bestandsrückgang gesehen und sie doch als Verkauf gezählt.
  // Stattdessen werden ihre Tickets dauerhaft aus der Rechnung genommen.
  if (isTest) {
    const neutralisiert = ignoreTestTickets(state, orderId, tickets);
    await writeTicker(prepareForWrite(neutralisiert, now), currentPriceEuro, compareDigest);
    return NextResponse.json({
      ok: true,
      ignoriert: "Testbestellung",
      tickets,
      hinweis: "Bestands-Effekt neutralisiert — der Kurs bleibt unberührt",
    });
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
  // allowDrift: false — der Webhook darf den Drift-Anker nicht verschieben,
  // sonst löschte jeder Verkauf die seit dem letzten Cron aufgelaufene Flaute.
  const next = tick(state, effectiveInventory, now, {
    allowDrift: false,
    trustedSales: tickets,
  });

  const gemerkt = rememberOrder(next, orderId);
  await writeTicker(
    prepareForWrite(gemerkt, now),
    currentPriceEuro, // der LIVE-Preis, nicht der abgeleitete
    compareDigest
  );
  revalidatePath("/de/tickets");
  revalidatePath("/en/tickets");

  return NextResponse.json({
    ok: true,
    tickets,
    price: shopPrice(priceOf(gemerkt)),
  });
}
