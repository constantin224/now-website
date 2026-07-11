import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { pruneHistory, tick } from "@/lib/ticker/engine";
import { verifyShopifyHmac } from "@/lib/ticker/hmac";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

// Shopify orders/create → sofortiger Preis-Check.
// Payload-Inhalt wird bewusst ignoriert (kein Kunden-PII am Basic-Plan) —
// Verkäufe werden aus dem Inventar abgeleitet, der Webhook ist nur Trigger.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!secret || !verifyShopifyHmac(rawBody, hmac, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { state, currentInventory } = await readTicker();
  if (!state) return NextResponse.json({ ok: true, note: "noch nicht initialisiert" });

  // allowDrift: false — Drift kommt NUR vom stündlichen Cron; dieser Webhook
  // feuert bei jeder Shop-Bestellung (auch Nicht-Ticket-Produkte)
  const next = tick(state, currentInventory, now, { allowDrift: false });
  if (next !== state) {
    await writeTicker({ ...next, history: pruneHistory(next.history, now) });
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({ ok: true });
}
