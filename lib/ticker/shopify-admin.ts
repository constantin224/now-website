import { TICKER_CONFIG as C } from "./config";
import { shopPrice, type TickerState } from "./engine";

const STORE = "03e6c1.myshopify.com";
const API_VERSION = "2026-04";

// Token-Cache: Client-Credentials-Token gilt 24 h, wir holen alle 23 h frisch
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
  const json = (await res.json()) as { access_token: string };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + 23 * 3_600_000,
  };
  return json.access_token;
}

async function adminQuery<T>(
  query: string,
  variables: Record<string, unknown>
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
}> {
  // Dev-Mock für Design-Arbeit (TICKER_MOCK=1) — niemals in Produktion setzen
  if (process.env.TICKER_MOCK === "1") {
    const { mockTicker } = await import("./mock");
    return mockTicker();
  }

  const data = await adminQuery<{
    product: { metafield: { value: string } | null } | null;
    productVariant: { price: string; inventoryQuantity: number } | null;
  }>(
    `query TickerRead($productId: ID!, $variantId: ID!, $ns: String!, $key: String!) {
      product(id: $productId) { metafield(namespace: $ns, key: $key) { value } }
      productVariant(id: $variantId) { price inventoryQuantity }
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
  };
}

// Neuen Zustand schreiben: Shop-Preis (gerundet) + Metafield (exakter State)
export async function writeTicker(state: TickerState): Promise<void> {
  // SCHUTZ: Im Mock-Modus wird NIE in den echten Shop geschrieben. Ohne diesen
  // Guard würde ein lokaler Tick mit TICKER_MOCK=1 Fantasie-Preise (aus
  // mock.ts) in den echten Shopify-Shop schreiben.
  if (process.env.TICKER_MOCK === "1") {
    console.warn(
      `[ticker] TICKER_MOCK=1 — Schreibvorgang übersprungen (Preis wäre ${shopPrice(state.price)} € gewesen)`
    );
    return;
  }

  const data = await adminQuery<{
    productVariantsBulkUpdate: { userErrors: { message: string }[] };
    metafieldsSet: { userErrors: { message: string }[] };
  }>(
    `mutation TickerWrite($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $metafields: [MetafieldsSetInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { message }
      }
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      productId: C.productGid,
      variants: [
        { id: C.variantGid, price: shopPrice(state.price).toFixed(2) },
      ],
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
    ...data.productVariantsBulkUpdate.userErrors,
    ...data.metafieldsSet.userErrors,
  ];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}
