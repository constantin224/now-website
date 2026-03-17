import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

// Wird täglich via Vercel Cron aufgerufen
// Revalidiert alle Seiten → Deezer API wird neu abgefragt
export async function GET(request: NextRequest) {
  // Einfacher Schutz gegen unbefugte Aufrufe
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/[locale]", "layout");

  return NextResponse.json({
    revalidated: true,
    timestamp: new Date().toISOString(),
  });
}
