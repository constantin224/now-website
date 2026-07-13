import { TICKER_CONFIG as C } from "./config";
import { priceOf, shopPrice, type TickerState } from "./engine";

const STORE = "03e6c1.myshopify.com";
const API_VERSION = "2026-04";

/**
 * Mock-Modus für lokale Design-Arbeit. Doppelt verriegelt: er lässt sich in
 * einem Produktions-Build gar nicht erst scharfschalten, damit ein versehentlich
 * gesetztes TICKER_MOCK in Vercel niemals Fantasie-Preise in den echten Shop
 * schreiben kann.
 */
const MOCK =
  process.env.NODE_ENV !== "production" && process.env.TICKER_MOCK === "1";

// Token-Cache (Client-Credentials-Token gilt 24 h)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_ADMIN_CLIENT_ID,
      client_secret: process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Shopify-Token fehlgeschlagen: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  // Ablauf aus der Antwort übernehmen (mit 5 min Sicherheitsabzug)
  const ttlMs = (json.expires_in ? json.expires_in - 300 : 23 * 3600) * 1000;
  cachedToken = { token: json.access_token, expiresAt: Date.now() + ttlMs };
  return json.access_token;
}

async function adminQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  retryOn401 = true
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://${STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  // Abgelaufenes/zurückgezogenes Token: Cache leeren und EINMAL neu versuchen.
  // Sonst würde eine warme Serverless-Instanz stundenlang mit totem Token laufen.
  if (res.status === 401 && retryOn401) {
    cachedToken = null;
    return adminQuery<T>(query, variables, false);
  }
  if (!res.ok) throw new Error(`Shopify-API ${res.status}`);
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// Aktuellen Börsen-Zustand lesen: Metafield + Live-Preis + Live-Inventar
export async function readTicker(): Promise<{
  state: TickerState | null;
  currentPriceEuro: number;
  currentInventory: number;
  inventoryTracked: boolean;
}> {
  if (MOCK) {
    const { mockTicker } = await import("./mock");
    return mockTicker();
  }

  const data = await adminQuery<{
    product: { metafield: { value: string } | null } | null;
    productVariant: {
      price: string;
      inventoryQuantity: number;
      inventoryItem: { tracked: boolean } | null;
    } | null;
  }>(
    `query TickerRead($productId: ID!, $variantId: ID!, $ns: String!, $key: String!) {
      product(id: $productId) { metafield(namespace: $ns, key: $key) { value } }
      productVariant(id: $variantId) {
        price
        inventoryQuantity
        inventoryItem { tracked }
      }
    }`,
    {
      productId: C.productGid,
      variantId: C.variantGid,
      ns: C.metafieldNamespace,
      key: C.metafieldKey,
    }
  );
  if (!data.productVariant) throw new Error("Ticket-Variante nicht gefunden");
  return {
    state: data.product?.metafield
      ? (JSON.parse(data.product.metafield.value) as TickerState)
      : null,
    currentPriceEuro: parseFloat(data.productVariant.price),
    currentInventory: data.productVariant.inventoryQuantity,
    inventoryTracked: data.productVariant.inventoryItem?.tracked ?? false,
  };
}

/**
 * Neuen Zustand schreiben.
 *
 * EVEY-REGEL: Angefasst werden ausschließlich das Preis-Feld der bestehenden
 * Variante und das eigene Metafield `ticker.state`. Niemals Titel, Optionen,
 * Inventar, Varianten-Struktur oder `evey.*`-Felder.
 *
 * @param previousShopPrice Der zuletzt geschriebene Shop-Preis. Stimmt er mit
 *   dem neuen überein, wird der Varianten-Preis gar nicht erst geschrieben —
 *   das spart pro Tag dutzende Schreibvorgänge am echten Produkt.
 */
export async function writeTicker(
  state: TickerState,
  previousShopPrice: number | null
): Promise<void> {
  const nextShopPrice = shopPrice(priceOf(state));

  if (MOCK) {
    console.warn(
      `[ticker] MOCK aktiv — kein Schreibvorgang (Preis wäre ${nextShopPrice} € gewesen)`
    );
    return;
  }

  const priceChanged = previousShopPrice === null || previousShopPrice !== nextShopPrice;

  // Metafield IMMER schreiben (der Zustand hat sich geändert), den Preis nur
  // bei echter Änderung.
  const data = await adminQuery<{
    metafieldsSet: { userErrors: { message: string }[] };
    productVariantsBulkUpdate?: { userErrors: { message: string }[] };
  }>(
    priceChanged
      ? `mutation TickerWrite($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { message } }
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { message }
          }
        }`
      : `mutation TickerWriteStateOnly($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { message } }
        }`,
    {
      ...(priceChanged
        ? {
            productId: C.productGid,
            variants: [
              { id: C.variantGid, price: nextShopPrice.toFixed(2) },
            ],
          }
        : {}),
      metafields: [
        {
          ownerId: C.productGid,
          namespace: C.metafieldNamespace,
          key: C.metafieldKey,
          type: "json",
          value: JSON.stringify(state),
        },
      ],
    }
  );

  const errs = [
    ...data.metafieldsSet.userErrors,
    ...(data.productVariantsBulkUpdate?.userErrors ?? []),
  ];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}
