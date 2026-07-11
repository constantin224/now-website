import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { initState, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

// Stündlicher Vercel-Cron: Drift anwenden + verpasste Verkäufe nachziehen.
// Erster Aufruf ohne Metafield initialisiert die Börse vom Live-Zustand.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { state, currentPriceEuro, currentInventory } = await readTicker();

  const next = state
    ? tick(state, currentInventory, now)
    : initState(currentPriceEuro, currentInventory, now);

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
