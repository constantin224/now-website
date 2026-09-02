import crypto from "node:crypto";

// Shopify-Webhook-Signatur prüfen (X-Shopify-Hmac-Sha256, base64)
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  /**
   * Ein Secret — oder MEHRERE, von denen eines passen muss. Grund (Befund
   * 02.09.): Shopify signiert Webhooks mit dem ÄLTESTEN nicht widerrufenen
   * Client-Secret der App. Nach einer Rotation (zwei Secrets im Dev Dashboard)
   * signiert also weiter das alte, während der Token-Flow schon das neue
   * nimmt — genau daran scheiterte der Kauf-Turbo drei Wochen lang mit 401.
   * Beide zu akzeptieren macht die Route gegen den Rotationszustand immun.
   */
  secret: string | readonly string[]
): boolean {
  if (!hmacHeader) return false;
  const secrets = (typeof secret === "string" ? [secret] : secret).filter(Boolean);
  const b = Buffer.from(hmacHeader);
  return secrets.some((s) => {
    const digest = crypto.createHmac("sha256", s).update(rawBody, "utf8").digest("base64");
    const a = Buffer.from(digest);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
