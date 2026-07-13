import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import {
  hasSeenOrder,
  priceOf,
  pruneHistory,
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
    return {
      id: order.id != null ? String(order.id) : null,
      isTest: order.test === true,
      tickets: (order.line_items ?? [])
        .filter((li) => String(li.variant_id) === variantId)
        .reduce((sum, li) => sum + (Number(li.quantity) || 0), 0),
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
  // Testbestellungen bewegen den öffentlichen Kurs nicht. Sonst könnte man die
  // Börse nicht proben, ohne den echten Ticketpreis zu verstellen.
  if (order.isTest) {
    return NextResponse.json({ ok: true, ignoriert: "Testbestellung" });
  }
  // Ohne Bestell-ID ist keine Deduplizierung möglich → nicht anfassen. Der Cron
  // zieht den Verkauf ohnehin aus dem Inventar nach.
  if (!order.id) {
    return NextResponse.json({ ok: true, ignoriert: "Bestellung ohne ID" });
  }

  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      return await handleOrder(order.id, order.tickets);
    } catch (err) {
      if (err instanceof TickerConflictError && versuch === 0) {
        console.warn("[ticker/webhook] Zustand war veraltet — lese neu");
        continue;
      }
      console.error("[ticker/webhook] fehlgeschlagen:", err);
      // 500 → Shopify stellt erneut zu. Das ist hier sicher: Die Bestell-ID
      // steht dann bereits in `recentOrders` und wird nicht doppelt gezählt.
      return NextResponse.json({ error: "webhook failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "webhook failed" }, { status: 500 });
}

async function handleOrder(orderId: string, tickets: number) {
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
  // das Inventar noch nicht fortgeschrieben ist: 5 Tickets → 10 → 15.
  if (hasSeenOrder(state, orderId)) {
    return NextResponse.json({
      ok: true,
      ignoriert: "Bestellung bereits verarbeitet",
      price: shopPrice(priceOf(state)),
    });
  }

  // Das Inventar ist die Wahrheit, sobald Shopify es fortgeschrieben hat.
  // Hinkt es noch hinterher, rechnen wir ersatzweise mit der Bestellmenge.
  const soldByInventory = state.startInventory - currentInventory;
  const effectiveInventory =
    soldByInventory > state.soldCount
      ? currentInventory // Shopify hat das Inventar bereits fortgeschrieben
      : state.startInventory - (state.soldCount + tickets);

  // trustSales: Der Payload ist HMAC-signiert und dedupliziert — eine Bestellung
  // über 6 Tickets ist ein echter Großkauf, keine Inventar-Panne, und zählt voll.
  // allowDrift: false — der Webhook darf den Drift-Anker nicht verschieben,
  // sonst löschte jeder Verkauf die seit dem letzten Cron aufgelaufene Flaute.
  const next = tick(state, effectiveInventory, now, {
    allowDrift: false,
    trustSales: true,
  });

  const gemerkt = rememberOrder(next, orderId);
  await writeTicker(
    { ...gemerkt, history: pruneHistory(gemerkt.history, now) },
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
