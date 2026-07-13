import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * NOT-AUS. Ist TICKER_ENABLED nicht exakt "1", tut die Börse gar nichts —
 * kein Drift, kein Preis-Sprung, kein Schreibvorgang. Umlegbar in Vercel ohne
 * Deploy, ohne Shopify-Mutation. Der Rollback-Hebel im Notfall.
 */
export function tickerEnabled(): boolean {
  return process.env.TICKER_ENABLED === "1";
}

/** Bearer-Token gegen CRON_SECRET — zeitkonstant, fail-closed. */
export function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
