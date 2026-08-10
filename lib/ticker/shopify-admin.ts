import { TICKER_CONFIG as C } from "./config";
import { parseState, priceOf, shopPrice, type TickerState } from "./engine";

const STORE = "03e6c1.myshopify.com";
const API_VERSION = "2026-04";

// Wie lange darf ein Shopify-Aufruf hängen? Deutlich unter dem Vercel-Limit,
// damit die Route sauber mit einer Fehlermeldung endet statt ins Plattform-
// Timeout zu laufen (dort gäbe es keine Logzeile, die den Ausfall erklärt).
const SHOPIFY_TIMEOUT_MS = 10_000;

/** Ein anderer Schreiber war schneller — der Zustand muss neu gelesen werden. */
export class TickerConflictError extends Error {
  constructor() {
    super("Börsen-Zustand wurde zwischenzeitlich von jemand anderem geändert");
    this.name = "TickerConflictError";
  }
}

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
    // Derselbe Timeout wie bei den GraphQL-Calls — das hier war der EINZIGE
    // Fetch ohne. Ein hängender Token-Endpunkt hätte die Route ins Plattform-
    // Timeout laufen lassen (keine Logzeile) und beim Webhook Shopifys
    // Retry-/Abo-Lösch-Mechanik getriggert.
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Shopify-Token fehlgeschlagen: ${res.status}`);
  const json = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  // Nicht ungeprüft cachen: Ein leerer/fehlender Token würde sonst 24 h lang
  // jeden Request mit 401 quittieren, ohne dass der Cache je geleert wird.
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("Shopify-Token-Antwort ohne access_token");
  }
  const expiresIn =
    typeof json.expires_in === "number" && json.expires_in > 300
      ? json.expires_in
      : null;
  // Ablauf aus der Antwort übernehmen (mit 5 min Sicherheitsabzug)
  const ttlMs = (expiresIn ? expiresIn - 300 : 23 * 3600) * 1000;
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
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
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

export interface TickerRead {
  state: TickerState | null;
  /** Der Preis, den der Shop JETZT verlangt. Die einzige Wahrheit für Kunden. */
  currentPriceEuro: number;
  currentInventory: number;
  inventoryTracked: boolean;
  /** Shopifys Prüfsumme des Metafields — Grundlage des Compare-and-Swap. */
  compareDigest: string | null;
}

// Aktuellen Börsen-Zustand lesen: Metafield + Live-Preis + Live-Inventar
export async function readTicker(): Promise<TickerRead> {
  if (MOCK) {
    const { mockTicker } = await import("./mock");
    return mockTicker();
  }

  const data = await adminQuery<{
    product: {
      metafield: { value: string; compareDigest: string } | null;
    } | null;
    productVariant: {
      price: string;
      inventoryQuantity: number;
      inventoryItem: { tracked: boolean } | null;
    } | null;
  }>(
    `query TickerRead($productId: ID!, $variantId: ID!, $ns: String!, $key: String!) {
      product(id: $productId) {
        metafield(namespace: $ns, key: $key) { value compareDigest }
      }
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
  const mf = data.product?.metafield ?? null;
  return {
    // parseState statt JSON.parse: Ein von Hand im Admin verbogener Zustand
    // darf nicht durch die Preis-Mathematik propagieren. Mit `now`, damit auch
    // ein Drift-Anker in der fernen Zukunft abgewiesen wird (Drift wäre still aus).
    state: mf ? parseState(mf.value, new Date()) : null,
    currentPriceEuro: parseFloat(data.productVariant.price),
    currentInventory: data.productVariant.inventoryQuantity,
    inventoryTracked: data.productVariant.inventoryItem?.tracked ?? false,
    compareDigest: mf?.compareDigest ?? null,
  };
}

/**
 * Neuen Zustand schreiben — in ZWEI getrennten Schritten, in dieser Reihenfolge:
 *
 *   1. Zustand ins Metafield, mit Compare-and-Swap (`compareDigest`).
 *   2. Nur bei erfolgreichem Schritt 1: den Preis der Variante.
 *
 * Die beiden dürfen NICHT in einer Mutation stehen. GraphQL führt alle
 * Top-Level-Felder aus: Bei einem CAS-Konflikt würde `metafieldsSet` scheitern,
 * der Preis-Schreibvorgang aber trotzdem laufen — und dann einen Preis setzen,
 * der aus einem überholten Zustand stammt.
 *
 * Warum CAS: Cron und Webhook schreiben dasselbe Metafield. Ohne Vergleich
 * überschreibt der Langsamere den Schnelleren blind (zwei gleichzeitige
 * Bestellungen → ein Verkauf verschwindet).
 *
 * EVEY-REGEL: Angefasst werden ausschließlich das Preis-Feld der bestehenden
 * Variante und das eigene Metafield `ticker.state`. Niemals Titel, Optionen,
 * Inventar, Varianten-Struktur oder `evey.*`-Felder.
 *
 * @param liveShopPrice Der Preis, den der Shop GERADE verlangt (aus readTicker).
 *   Nicht der aus dem Zustand abgeleitete! Nur so repariert sich eine Divergenz
 *   zwischen Shop und Zustand von selbst — etwa nachdem ein Preis-Schreibvorgang
 *   einmal fehlgeschlagen ist, während der Zustand schon geschrieben war.
 * @param compareDigest Prüfsumme aus readTicker. `null` = Metafield existiert
 *   noch nicht (Börsenstart) und darf nur angelegt werden, wenn es das immer
 *   noch nicht tut.
 * @throws TickerConflictError wenn jemand anderes zwischenzeitlich geschrieben hat
 */
export async function writeTicker(
  state: TickerState,
  liveShopPrice: number | null,
  compareDigest: string | null,
  /** Request-Zeit des Aufrufers — der Preis ist aus Zustand + Zeit abgeleitet. */
  now: Date,
  /**
   * Nach dem Preis-Write noch einmal nachsehen, ob der Zustand inzwischen ein
   * anderer ist (Schritt 3 unten).
   *
   * Der WEBHOOK schaltet das ab. Grund: Shopify erwartet eine Antwort in etwa
   * fünf Sekunden — bleibt sie aus, wiederholt es die Zustellung und **löscht
   * das Abo nach einigen Stunden**. Genau daran ist das Schwesterprojekt
   * (tonherd-tickets) schon aufgelaufen; dort sind die Webhooks deshalb gesperrt.
   * Jeder Shopify-Roundtrip zählt also. Der nächste Cron-Lauf (alle 5 Minuten)
   * macht den Abgleich ohnehin — ein paar Minuten später, aber sicher.
   */
  mitAbgleich = true
): Promise<void> {
  const nextShopPrice = shopPrice(priceOf(state, now));

  if (MOCK) {
    console.warn(
      `[ticker] MOCK aktiv — kein Schreibvorgang (Preis wäre ${nextShopPrice} € gewesen)`
    );
    return;
  }

  // Schritt 1: Zustand — nur, wenn ihn seit dem Lesen niemand verändert hat.
  const stateRes = await adminQuery<{
    metafieldsSet: { userErrors: { code: string | null; message: string }[] };
  }>(
    `mutation TickerWriteState($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { code message } }
    }`,
    {
      metafields: [
        {
          ownerId: C.productGid,
          namespace: C.metafieldNamespace,
          key: C.metafieldKey,
          type: "json",
          value: JSON.stringify(state),
          compareDigest, // null = "es darf noch keines geben"
        },
      ],
    }
  );

  const stateErrs = stateRes.metafieldsSet.userErrors;
  if (stateErrs.length) {
    // STALE_OBJECT = "das Metafield wurde geändert, seit du es gelesen hast",
    // also der verlorene Wettlauf. Der Aufrufer liest neu und rechnet neu — er
    // darf NICHT einfach überschreiben.
    if (stateErrs.some((e) => e.code === "STALE_OBJECT")) {
      throw new TickerConflictError();
    }
    throw new Error(stateErrs.map((e) => e.message).join("; "));
  }

  // Schritt 2: Preis — nur wenn der Shop wirklich einen anderen verlangt.
  // Verglichen wird gegen den LIVE-Preis, nicht gegen den zuletzt berechneten:
  // Sonst bliebe eine Divergenz für immer bestehen (der Vergleich sähe seinen
  // eigenen Wunschwert und fände nie einen Unterschied).
  if (liveShopPrice !== null && liveShopPrice === nextShopPrice) return;

  await schreibePreis(nextShopPrice);

  if (!mitAbgleich) return; // Webhook-Pfad: kein weiterer Roundtrip (siehe oben)

  // Schritt 3: Abgleich. Der Preis ist das einzige Feld OHNE Compare-and-Swap —
  // Shopify bietet dafür keins. Damit ist folgender Wettlauf möglich:
  //
  //   A schreibt Zustand (1 Verkauf) … A stockt …
  //   B schreibt Zustand (2 Verkäufe) und Preis 22,40 €
  //   A schreibt jetzt erst SEINEN Preis: 22,20 €   ← veraltet, gewinnt aber
  //
  // Ergebnis: Der Zustand kennt zwei Verkäufe, der Checkout verlangt den Preis
  // von einem. Deshalb nach dem Schreiben nachsehen, ob der Zustand inzwischen
  // ein anderer ist — und den Preis dann auf den JETZT gültigen nachziehen.
  const danach = await readTicker();
  if (!danach.state) return;
  // FRISCHE Zeit, nicht das Request-`now` von oben: Zwischen Schreiben und
  // Abgleich kann ein anderer Schreiber einen ZEITLICH neueren Preis gesetzt
  // haben. Mit der alten Zeit gerechnet, würde der Abgleich dessen korrekten
  // Preis wieder zurückdrehen — er soll den JETZT gültigen durchsetzen.
  const sollPreis = shopPrice(priceOf(danach.state, new Date()));
  if (danach.currentPriceEuro !== sollPreis) {
    console.warn(
      `[ticker] Preis-Abgleich: Shop ${danach.currentPriceEuro} € → ${sollPreis} €`
    );
    await schreibePreis(sollPreis);
  }
}

async function schreibePreis(preis: number): Promise<void> {
  const res = await adminQuery<{
    productVariantsBulkUpdate: { userErrors: { message: string }[] };
  }>(
    `mutation TickerWritePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { message }
      }
    }`,
    {
      productId: C.productGid,
      variants: [{ id: C.variantGid, price: preis.toFixed(2) }],
    }
  );
  const errs = res.productVariantsBulkUpdate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}
