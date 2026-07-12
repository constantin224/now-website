import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { initState, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

// Stündlicher Vercel-Cron: Drift anwenden + verpasste Verkäufe nachziehen.
//
// START-SCHUTZ: Solange kein ticker.state-Metafield existiert, läuft die Börse
// NICHT. Der Cron rührt den Shop-Preis dann nicht an, sondern meldet nur
// "not_started". Gestartet wird die Börse ausschließlich per ?start=1 —
// ein bewusster, einmaliger Handgriff von Constantin.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { state, currentInventory } = await readTicker();
  const startRequested = request.nextUrl.searchParams.get("start") === "1";

  if (!state && !startRequested) {
    return NextResponse.json({
      status: "not_started",
      hint: "Börse läuft noch nicht. Start mit ?start=1 — der Shop-Preis bleibt bis dahin unangetastet.",
      startPrice: C.startPriceEuro,
    });
  }

  // Init immer vom fixen Startpreis aus der Config (nicht vom Live-Shop-Preis)
  const next = state
    ? tick(state, currentInventory, now)
    : initState(C.startPriceEuro, currentInventory, now);

  if (!state || next !== state) {
    await writeTicker({ ...next, history: pruneHistory(next.history, now) });
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({
    price: shopPrice(next.price),
    soldCount: next.soldCount,
    event: next.history.at(-1)?.event,
  });
}
