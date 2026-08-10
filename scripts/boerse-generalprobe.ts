/**
 * Generalprobe der Ticket-Börse gegen das ECHTE Shopify — an einem Wegwerf-Testprodukt.
 *
 * Warum: Alle 119 Tests laufen gegen einen GEFÄLSCHTEN Shopify-Server, der CAS/compareDigest
 * so implementiert, wie wir GLAUBEN, dass Shopify sich verhält. Die teuersten Fehler dieses
 * Projekts saßen dreimal an genau dieser Naht. Hier wird real geprüft:
 *   1. Token-Flow (Client Credentials)
 *   2. Metafield anlegen (compareDigest: null)
 *   3. parseState-Roundtrip über Shopifys echte JSON-Normalisierung
 *   4. Preis-Write + Preis-Abgleich
 *   5. CAS: Schreiben mit VERALTETEM compareDigest → muss STALE_OBJECT/Conflict werfen
 *   6. CAS-Grenzfall: Schreiben mit compareDigest=null, obwohl das Metafield EXISTIERT
 *      (unsere Start-Pfad-Annahme: "null = es darf noch keines geben")
 *
 * Sicherheit: Läuft AUSSCHLIESSLICH gegen ein hier frisch angelegtes DRAFT-Produkt
 * (nie im Shop sichtbar), löscht es am Ende wieder. Das echte Gig-Produkt
 * 15354134921547 wird durch eine Guard-Prüfung hart ausgeschlossen.
 *
 * Aufruf (Secret NUR als Prozess-Env, nie in Datei/Ausgabe):
 *   cd ~/claude-projects/now-website && \
 *   SHOPIFY_ADMIN_CLIENT_ID=… SHOPIFY_ADMIN_CLIENT_SECRET=… \
 *   npx -y tsx ../_scratch/boerse-generalprobe.ts
 */
import { TICKER_CONFIG } from "../lib/ticker/config";
import {
  initState,
  priceOf,
  shopPrice,
  type TickerState,
} from "../lib/ticker/engine";
import {
  readTicker,
  TickerConflictError,
  writeTicker,
} from "../lib/ticker/shopify-admin";

const STORE = "03e6c1.myshopify.com";
const API_VERSION = "2026-04";
const ECHTES_GIG_PRODUKT = "15354134921547"; // NIEMALS anfassen

const ergebnisse: string[] = [];
function ok(name: string) {
  ergebnisse.push(`✅ ${name}`);
  console.log(`✅ ${name}`);
}
function fail(name: string, detail: string): never {
  ergebnisse.push(`❌ ${name} — ${detail}`);
  console.error(`❌ ${name} — ${detail}`);
  throw new Error(`Generalprobe gescheitert bei: ${name}`);
}

async function adminRaw<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_ADMIN_CLIENT_ID,
      client_secret: process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (!res.ok || json.errors?.length) {
    throw new Error(`API ${res.status}: ${JSON.stringify(json.errors ?? {}).slice(0, 400)}`);
  }
  return json.data;
}

async function main() {
  if (!process.env.SHOPIFY_ADMIN_CLIENT_ID || !process.env.SHOPIFY_ADMIN_CLIENT_SECRET) {
    throw new Error("SHOPIFY_ADMIN_CLIENT_ID/SECRET fehlen in der Umgebung");
  }
  if (process.env.TICKER_MOCK === "1") throw new Error("TICKER_MOCK ist gesetzt — abbrechen");

  // ---- Testprodukt anlegen (DRAFT — taucht nie im Shop auf) ----
  // productGid VOR dem try deklariert: Auch wenn zwischen Anlage und dem
  // inneren Ablauf etwas wirft (Guard, fehlende Variante, Config-Umbiegen),
  // greift das finally und räumt das bereits angelegte Produkt weg.
  let productGid: string | null = null;

  try {
    const created = await adminRaw<{
      productCreate: {
        product: { id: string; variants: { nodes: { id: string; price: string }[] } } | null;
        userErrors: { message: string }[];
      };
    }>(
      `mutation Probe($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id variants(first: 1) { nodes { id price } } }
          userErrors { message }
        }
      }`,
      { product: { title: "ZZZ Ticker-Generalprobe — bitte löschen", status: "DRAFT" } }
    );
    if (created.productCreate.userErrors.length || !created.productCreate.product) {
      throw new Error(`productCreate: ${JSON.stringify(created.productCreate.userErrors)}`);
    }
    productGid = created.productCreate.product.id;
    const variantGid = created.productCreate.product.variants.nodes[0]?.id;
    if (!variantGid) throw new Error("Testprodukt hat keine Default-Variante");
    if (productGid.includes(ECHTES_GIG_PRODUKT) || variantGid.includes(ECHTES_GIG_PRODUKT)) {
      throw new Error("GUARD: echtes Gig-Produkt — niemals!");
    }
    console.log(`Testprodukt angelegt: ${productGid} (DRAFT)`);

    // TICKER_CONFIG zur Laufzeit auf das Testprodukt biegen — damit laufen
    // readTicker/writeTicker EXAKT im Produktions-Codepfad, nur gegen das Wegwerf-Ziel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(TICKER_CONFIG as any, { productGid, variantGid });
    // ---- 1+2: Erst-Lesen + Metafield-Anlage über den echten Pfad ----
    const leer = await readTicker();
    if (leer.state !== null) fail("Erst-Lesen", "state sollte null sein");
    if (leer.compareDigest !== null) fail("Erst-Lesen", "compareDigest sollte null sein");
    ok(`Token-Flow + TickerRead (Preis ${leer.currentPriceEuro} €, tracked=${leer.inventoryTracked})`);

    const start: TickerState = initState(22, leer.currentInventory, new Date(), 0, "bestand");
    await writeTicker(start, leer.currentPriceEuro, null, new Date()); // null = "darf noch keines geben"
    ok("Metafield angelegt + Startpreis geschrieben (compareDigest: null)");

    // ---- 3: parseState-Roundtrip über Shopifys echte JSON-Rückgabe ----
    const gelesen = await readTicker();
    if (!gelesen.state) fail("Roundtrip", "Metafield nicht wieder lesbar");
    if (gelesen.state.quelle !== "bestand" || gelesen.state.soldCount !== 0) {
      fail("Roundtrip", `Zustand verbogen: ${JSON.stringify(gelesen.state).slice(0, 200)}`);
    }
    if (!gelesen.compareDigest) fail("Roundtrip", "kein compareDigest von Shopify");
    if (gelesen.currentPriceEuro !== 22) {
      fail("Preis-Write", `Shop-Preis ist ${gelesen.currentPriceEuro}, erwartet 22`);
    }
    ok(`parseState-Roundtrip + Preis 22,00 € bestätigt (digest ${gelesen.compareDigest.slice(0, 12)}…)`);

    // ---- 4: Zustands-Update + Preis-Abgleich über den echten Pfad ----
    const zweiVerkäufe: TickerState = { ...gelesen.state, soldCount: 2 };
    await writeTicker(zweiVerkäufe, gelesen.currentPriceEuro, gelesen.compareDigest, new Date());
    const nach = await readTicker();
    // 22 − 2 → 20,00 (der Zeit-Anteil im Sekundenbereich verschwindet in der 10-Cent-Rundung)
    const soll = shopPrice(priceOf(zweiVerkäufe, new Date()));
    if (nach.currentPriceEuro !== soll) {
      fail("Preis-Update", `Shop ${nach.currentPriceEuro} ≠ erwartet ${soll}`);
    }
    if (nach.state?.soldCount !== 2) fail("Zustands-Update", "soldCount nicht 2");
    ok(`CAS-Write + Preis-Update (${soll} €) bestätigt`);

    // ---- 5: DER kritische Test — veralteter compareDigest muss abgewiesen werden ----
    let conflictGeworfen = false;
    try {
      await writeTicker({ ...nach.state!, soldCount: 5 }, nach.currentPriceEuro, gelesen.compareDigest, new Date()); // ALTER digest
    } catch (e) {
      if (e instanceof TickerConflictError) conflictGeworfen = true;
      else fail("CAS-Konflikt", `unerwarteter Fehler: ${(e as Error).message}`);
    }
    if (!conflictGeworfen) fail("CAS-Konflikt", "Shopify hat den veralteten Digest NICHT abgewiesen (kein STALE_OBJECT)");
    const unberührt = await readTicker();
    if (unberührt.state?.soldCount !== 2) fail("CAS-Konflikt", "Zustand wurde trotz Konflikt überschrieben!");
    ok("CAS: veralteter compareDigest → STALE_OBJECT, Zustand unberührt (Kern-Annahme REAL bestätigt)");

    // ---- 6: Grenzfall — compareDigest null, obwohl das Metafield existiert ----
    // Unsere Start-Pfad-Annahme: null heißt "es darf noch keines geben".
    let nullVerhalten: string;
    try {
      await writeTicker({ ...unberührt.state!, soldCount: 9 }, unberührt.currentPriceEuro, null, new Date());
      const danach = await readTicker();
      nullVerhalten = danach.state?.soldCount === 9
        ? "ÜBERSCHREIBT (kein Schutz!)"
        : "ignoriert";
    } catch (e) {
      nullVerhalten = e instanceof TickerConflictError ? "Conflict (Schutz greift)" : `Fehler: ${(e as Error).message.slice(0, 120)}`;
    }
    console.log(`ℹ️  compareDigest=null bei existierendem Metafield → ${nullVerhalten}`);
    ergebnisse.push(`ℹ️ null-Digest-Verhalten: ${nullVerhalten}`);
  } finally {
    // ---- Aufräumen: Testprodukt löschen (nur wenn es angelegt wurde) ----
    if (productGid) {
      const del = await adminRaw<{ productDelete: { deletedProductId: string | null; userErrors: { message: string }[] } }>(
        `mutation Weg($input: ProductDeleteInput!) {
          productDelete(input: $input) { deletedProductId userErrors { message } }
        }`,
        { input: { id: productGid } }
      );
      console.log(
        del.productDelete.deletedProductId
          ? `🧹 Testprodukt gelöscht (${del.productDelete.deletedProductId})`
          : `⚠️ Löschen fehlgeschlagen: ${JSON.stringify(del.productDelete.userErrors)} — von Hand löschen: ${productGid}`
      );
    }
  }

  console.log("\n=== GENERALPROBE ===");
  for (const z of ergebnisse) console.log(z);
}

main().catch((e) => {
  console.error("ABBRUCH:", (e as Error).message);
  process.exit(1);
});
