import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { priceOf, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import { tickerEnabled } from "@/lib/ticker/guards";
import { verifyShopifyHmac } from "@/lib/ticker/hmac";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

/**
 * Zählt die Ticket-Positionen einer Bestellung — und NICHTS sonst.
 *
 * Aus dem Payload wird ausschließlich `line_items[].variant_id` und `quantity`
 * gelesen. Keine Kundendaten, keine Adressen, keine Zahlungsdaten werden
 * angefasst, gespeichert oder geloggt.
 *
 * Warum überhaupt der Payload: Wenn der Webhook eintrifft, hat Shopify das
 * Inventar oft noch nicht dekrementiert (eventually consistent, zusätzlich
 * mischt Evey mit). Ohne Payload-Auswertung würde der Preis-Sprung dann nicht
 * sofort feuern, sondern erst Stunden später beim Cron.
 */
function countTicketsInOrder(rawBody: string): number {
  try {
    const order = JSON.parse(rawBody) as {
      line_items?: { variant_id?: number | string; quantity?: number }[];
    };
    const variantId = C.variantGid.split("/").pop();
    return (order.line_items ?? [])
      .filter((li) => String(li.variant_id) === variantId)
      .reduce((sum, li) => sum + (Number(li.quantity) || 0), 0);
  } catch {
    return 0; // unlesbarer Payload → der Cron holt den Verkauf nach
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

  try {
    // Bestellungen ohne Ticket (Merch, CDs) gar nicht weiterverarbeiten —
    // spart zwei Shopify-Calls pro Bestellung.
    const ticketsInOrder = countTicketsInOrder(rawBody);
    if (ticketsInOrder === 0) {
      return NextResponse.json({ ok: true, tickets: 0 });
    }

    const now = new Date();
    const { state, currentInventory } = await readTicker();
    if (!state) {
      return NextResponse.json({ ok: true, note: "Börse noch nicht gestartet" });
    }

    // Das Inventar ist die Wahrheit, sobald Shopify es fortgeschrieben hat.
    // Hinkt es noch hinterher, rechnen wir ersatzweise mit dem Payload-Wert.
    // Beide Wege führen zum selben Kurs, weil soldCount absolut aus der
    // Baseline folgt — ein doppelt zugestellter Webhook zählt daher nie doppelt.
    const soldByInventory = state.startInventory - currentInventory;
    const effectiveInventory =
      soldByInventory > state.soldCount
        ? currentInventory // Shopify hat das Inventar bereits fortgeschrieben
        : state.startInventory - (state.soldCount + ticketsInOrder);

    const priceBefore = shopPrice(priceOf(state));
    const next = tick(state, effectiveInventory, now, { allowDrift: false });

    if (next !== state) {
      await writeTicker(
        { ...next, history: pruneHistory(next.history, now) },
        priceBefore
      );
      revalidatePath("/de/tickets");
      revalidatePath("/en/tickets");
    }

    return NextResponse.json({
      ok: true,
      tickets: ticketsInOrder,
      price: shopPrice(priceOf(next)),
    });
  } catch (err) {
    console.error("[ticker/webhook] fehlgeschlagen:", err);
    // 500 → Shopify stellt erneut zu; die Verarbeitung ist idempotent.
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}
