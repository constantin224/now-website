import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import { initState, type TickerState } from "./engine";

/**
 * Route-Tests gegen einen gefälschten Shopify-Server.
 *
 * Die vier teuersten Fehler dieses Projekts saßen NICHT in der Engine, sondern
 * an der Naht zur Außenwelt: doppelt zugestellte Webhooks, ein Preis-Write, der
 * still fehlschlug, gleichzeitige Schreiber. Reine Engine-Tests konnten davon
 * keinen einzigen finden — sie prüften eine Funktion, die nie mit Shopify redet.
 */

// --- gefälschter Shopify-Server ------------------------------------------

interface FakeShop {
  state: TickerState | null;
  variantPrice: number;
  inventory: number;
  tracked: boolean;
  digest: string;
  /** Preis-Writes scheitern lassen (simuliert den halb geglückten Schreibvorgang) */
  priceWriteFails: boolean;
  /** Vor dem nächsten State-Write dazwischenfunken (simuliert den Wettlauf) */
  onBeforeStateWrite?: () => void;
  /** Vor dem nächsten Preis-Write dazwischenfunken — der Preis hat KEIN CAS */
  onBeforePriceWrite?: () => void;
  stateWrites: number;
  priceWrites: number;
}

let shop: FakeShop;

function fakeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const body = String(init?.body ?? "");
  const json = (o: unknown) =>
    Promise.resolve(new Response(JSON.stringify(o), { status: 200 }));

  if (String(url).includes("access_token")) {
    return json({ access_token: "tok", expires_in: 86_400 });
  }

  const req = JSON.parse(body) as { query: string; variables: Record<string, unknown> };

  if (req.query.includes("query TickerRead")) {
    return json({
      data: {
        product: shop.state
          ? {
              metafield: {
                value: JSON.stringify(shop.state),
                compareDigest: shop.digest,
              },
            }
          : { metafield: null },
        productVariant: {
          price: shop.variantPrice.toFixed(2),
          inventoryQuantity: shop.inventory,
          inventoryItem: { tracked: shop.tracked },
        },
      },
    });
  }

  if (req.query.includes("mutation TickerWriteState")) {
    shop.onBeforeStateWrite?.();
    const mf = (req.variables.metafields as { value: string; compareDigest: string | null }[])[0];
    // Compare-and-Swap: Schreiben nur, wenn der Zustand seit dem Lesen unberührt ist.
    const erwartet = shop.state ? shop.digest : null;
    if (mf.compareDigest !== erwartet) {
      return json({
        data: {
          metafieldsSet: {
            userErrors: [{ code: "STALE_OBJECT", message: "veraltet" }],
          },
        },
      });
    }
    shop.state = JSON.parse(mf.value) as TickerState;
    shop.digest = `d${++shop.stateWrites}`; // jeder Write erzeugt eine neue Prüfsumme
    return json({ data: { metafieldsSet: { userErrors: [] } } });
  }

  if (req.query.includes("mutation TickerWritePrice")) {
    shop.onBeforePriceWrite?.();
    if (shop.priceWriteFails) {
      return json({
        data: {
          productVariantsBulkUpdate: {
            userErrors: [{ message: "Preis abgelehnt" }],
          },
        },
      });
    }
    const v = (req.variables.variants as { price: string }[])[0];
    shop.variantPrice = parseFloat(v.price);
    shop.priceWrites++;
    return json({ data: { productVariantsBulkUpdate: { userErrors: [] } } });
  }

  throw new Error(`unerwartete Anfrage: ${req.query.slice(0, 40)}`);
}

// --- Testaufbau -----------------------------------------------------------

const SECRET = "test-webhook-secret";
const CRON_SECRET = "test-cron-secret";
const VARIANT_ID = C.variantGid.split("/").pop();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

function orderBody(opts: { id: number; tickets: number; test?: boolean }) {
  return JSON.stringify({
    id: opts.id,
    test: opts.test ?? false,
    // Kundendaten sind im echten Payload enthalten — die Route darf sie ignorieren
    email: "fan@example.com",
    line_items: [
      { variant_id: Number(VARIANT_ID), quantity: opts.tickets },
      { variant_id: 999999, quantity: 1 }, // T-Shirt: darf nicht mitzählen
    ],
  });
}

async function postWebhook(body: string) {
  const { POST } = await import("@/app/api/ticker/webhook/route");
  const hmac = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  const req = new Request("https://now-music.at/api/ticker/webhook", {
    method: "POST",
    headers: { "x-shopify-hmac-sha256": hmac },
    body,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

async function getTick(query = "") {
  const { GET } = await import("@/app/api/ticker/tick/route");
  const { NextRequest } = await import("next/server");
  return GET(
    new NextRequest(`https://now-music.at/api/ticker/tick${query}`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
  );
}

beforeEach(() => {
  vi.stubEnv("TICKER_ENABLED", "1");
  vi.stubEnv("TICKER_MOCK", "");
  vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  shop = {
    state: initState(22, 250, new Date(Date.now() - 3_600_000)),
    variantPrice: 22,
    inventory: 250,
    tracked: true,
    digest: "d0",
    priceWriteFails: false,
    stateWrites: 0,
    priceWrites: 0,
  };
});

// --- die Tests ------------------------------------------------------------

describe("Webhook — Doppelzustellung", () => {
  it("dieselbe Bestellung zweimal zugestellt zählt NUR EINMAL", async () => {
    // Der teure Fall: Shopify hat das Inventar noch nicht fortgeschrieben, also
    // greift der Payload-Fallback. Ohne Dedup zählte er bei jeder Zustellung neu.
    const body = orderBody({ id: 4711, tickets: 5 });

    const r1 = await postWebhook(body);
    expect(await r1.json()).toMatchObject({ ok: true, tickets: 5 });
    expect(shop.state!.soldCount).toBe(5);
    const preis = shop.variantPrice;

    const r2 = await postWebhook(body); // identische erneute Zustellung
    expect(await r2.json()).toMatchObject({ ignoriert: "Bestellung bereits verarbeitet" });
    expect(shop.state!.soldCount).toBe(5); // NICHT 10
    expect(shop.variantPrice).toBe(preis);

    const r3 = await postWebhook(body);
    await r3.json();
    expect(shop.state!.soldCount).toBe(5); // auch beim dritten Mal nicht
  });

  it("zwei VERSCHIEDENE Bestellungen zählen beide", async () => {
    await postWebhook(orderBody({ id: 1, tickets: 1 }));
    await postWebhook(orderBody({ id: 2, tickets: 2 }));
    expect(shop.state!.soldCount).toBe(3);
  });
});

describe("Webhook — was NICHT zählen darf", () => {
  it("Testbestellung bewegt den Preis nicht — auch nicht über den Bestand", async () => {
    const r = await postWebhook(orderBody({ id: 5, tickets: 3, test: true }));
    expect(await r.json()).toMatchObject({ ignoriert: "Testbestellung" });
    expect(shop.state!.soldCount).toBe(0);
    expect(shop.variantPrice).toBe(22);
    expect(shop.state!.ignoredTickets).toBe(3);

    // Die entscheidende Hälfte: Shopify senkt den Bestand auch bei einer
    // Testbestellung. Der Cron darf sie trotzdem NICHT als Verkauf zählen.
    shop.inventory = 247;
    await getTick();
    expect(shop.state!.soldCount).toBe(0);
    expect(shop.variantPrice).toBe(22);
  });

  it("Bestellung mit negativer Menge kann den Kurs nicht drücken", async () => {
    const body = JSON.stringify({
      id: 77,
      line_items: [{ variant_id: Number(VARIANT_ID), quantity: -5 }],
    });
    const r = await postWebhook(body);
    expect(await r.json()).toMatchObject({ tickets: 0 });
    expect(shop.stateWrites).toBe(0);
  });

  it("reine Merch-Bestellung rührt die Börse nicht an", async () => {
    const body = JSON.stringify({
      id: 6,
      line_items: [{ variant_id: 999999, quantity: 2 }],
    });
    const r = await postWebhook(body);
    expect(await r.json()).toMatchObject({ tickets: 0 });
    expect(shop.stateWrites).toBe(0);
  });

  it("falsche Signatur → 401, kein Schreibvorgang", async () => {
    const { POST } = await import("@/app/api/ticker/webhook/route");
    const req = new Request("https://now-music.at/api/ticker/webhook", {
      method: "POST",
      headers: { "x-shopify-hmac-sha256": "ZmFsc2No" },
      body: orderBody({ id: 7, tickets: 1 }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await POST(req as any);
    expect(r.status).toBe(401);
    expect(shop.stateWrites).toBe(0);
  });

  it("Not-Aus (TICKER_ENABLED=0) → keine Wirkung trotz gültiger Signatur", async () => {
    vi.stubEnv("TICKER_ENABLED", "0");
    const r = await postWebhook(orderBody({ id: 8, tickets: 1 }));
    expect(await r.json()).toMatchObject({ status: "disabled" });
    expect(shop.stateWrites).toBe(0);
  });
});

describe("Mengenkauf", () => {
  it("Bestellung über 6 Tickets zählt voll (nicht als Inventar-Panne verworfen)", async () => {
    await postWebhook(orderBody({ id: 9, tickets: 6 }));
    expect(shop.state!.soldCount).toBe(6);
    expect(shop.variantPrice).toBeGreaterThan(22);
  });
});

describe("Wettlauf: Cron und Webhook schreiben gleichzeitig", () => {
  it("der Verlierer überschreibt den Gewinner NICHT, sondern rechnet neu", async () => {
    // Während der Cron schreiben will, schiebt ein Webhook einen Verkauf dazwischen.
    let dazwischen = false;
    shop.onBeforeStateWrite = () => {
      if (dazwischen) return;
      dazwischen = true;
      // fremder Schreibvorgang: Verkauf + neue Prüfsumme
      shop.state = { ...shop.state!, soldCount: 1 };
      shop.inventory = 249;
      shop.digest = "fremd";
    };

    const r = await getTick();
    expect(await r.json()).toMatchObject({ status: "ok" });
    // Der Verkauf des anderen Schreibers ist erhalten geblieben.
    expect(shop.state!.soldCount).toBe(1);
    expect(shop.variantPrice).toBeGreaterThan(22);
  });

  it("ein veralteter Schreiber kann den neueren PREIS nicht überschreiben", async () => {
    // Der Preis ist das einzige Feld ohne Compare-and-Swap — Shopify bietet dafür
    // keins. Der gefährliche Ablauf:
    //   A schreibt Zustand (1 Verkauf) … A stockt …
    //   B schreibt Zustand (2 Verkäufe) + Preis 22,40 €
    //   A schreibt jetzt erst seinen Preis: 22,20 €   ← veraltet, gewinnt aber
    // Der Abgleich nach dem Schreiben muss das wieder geradeziehen.
    let dazwischen = false;
    shop.onBeforePriceWrite = () => {
      if (dazwischen) return;
      dazwischen = true;
      // Ein anderer Schreiber war schneller: Zustand steht schon auf 2 Verkäufen
      shop.state = { ...shop.state!, soldCount: 2 };
      shop.inventory = 248;
      shop.digest = "neuer";
    };

    await postWebhook(orderBody({ id: 20, tickets: 1 }));

    // Der Preis muss zum AKTUELLEN Zustand (2 Verkäufe) passen, nicht zu dem,
    // den unser Lauf für richtig hielt (1 Verkauf).
    const soll = 22 * Math.pow(1.01, 2);
    expect(shop.variantPrice).toBeCloseTo(Math.round(soll * 10) / 10, 2);
    expect(shop.state!.soldCount).toBe(2);
  });
});

describe("Halb geglückter Schreibvorgang heilt sich selbst", () => {
  it("Preis-Write scheitert → der nächste Tick zieht den Shop-Preis nach", async () => {
    shop.priceWriteFails = true;
    await postWebhook(orderBody({ id: 10, tickets: 3 })); // wirft intern, gibt 500
    // Zustand geschrieben, Preis nicht — genau die gefürchtete Divergenz
    expect(shop.state!.soldCount).toBe(3);
    expect(shop.variantPrice).toBe(22);

    // Shopify schreibt das Inventar fort (das passiert real binnen Sekunden)
    shop.inventory = 247;

    // Nächster Cron-Lauf mit funktionierendem Preis-Write
    shop.priceWriteFails = false;
    await getTick();
    expect(shop.variantPrice).toBeGreaterThan(22); // repariert
  });
});

describe("Das Inventar ist und bleibt die Wahrheit", () => {
  it("bestätigt Shopify den Verkauf im Bestand nicht, wird er zurückgerollt", async () => {
    // Kein Bug, sondern die tragende Annahme des Systems — hier festgeschrieben,
    // damit sie niemand versehentlich bricht: soldCount wird aus dem Bestand
    // abgeleitet. Der Webhook darf nur VORGREIFEN (der Bestand hinkt Sekunden
    // hinterher), nicht widersprechen.
    //
    // FOLGE FÜR DEN GO-LIVE: Wenn Evey die Ticket-Bestände an Shopifys
    // Bestandsverfolgung vorbei führt, sinkt `inventoryQuantity` beim Kauf nie —
    // und der nächste Cron macht aus jedem Verkauf einen Storno. Vor dem Start
    // MUSS eine echte Testbestellung zeigen, dass der Bestand wirklich fällt.
    await postWebhook(orderBody({ id: 11, tickets: 2 }));
    expect(shop.state!.soldCount).toBe(2);

    shop.inventory = 250; // Bestand rührt sich NICHT
    await getTick();
    expect(shop.state!.soldCount).toBe(0); // Rückrollung
  });
});

describe("Cron — Betriebsverhalten", () => {
  it("startet NICHT ohne ?start=1", async () => {
    shop.state = null;
    const r = await getTick();
    expect(await r.json()).toMatchObject({ status: "not_started" });
    expect(shop.stateWrites).toBe(0);
    expect(shop.variantPrice).toBe(22);
  });

  it("startet mit ?start=1", async () => {
    shop.state = null;
    const r = await getTick("?start=1");
    expect(await r.json()).toMatchObject({ status: "started" });
    expect(shop.state).not.toBeNull();
  });

  it("pausiert, wenn die Bestandsverfolgung aus ist", async () => {
    shop.tracked = false;
    shop.inventory = 0; // genau das liefert Shopify dann
    const r = await getTick();
    expect(await r.json()).toMatchObject({ status: "paused" });
    expect(shop.stateWrites).toBe(0);
    expect(shop.variantPrice).toBe(22); // KEIN Sprung auf den Deckel
  });

  it("meldet einen Shopify-Ausfall als Fehler, statt ihn zu verstecken", async () => {
    // Vercel-Cron schaltet bei 5xx NICHT ab, sondern markiert den Lauf als
    // fehlgeschlagen. Eine 200er-Antwort würde einen Dauerausfall unsichtbar
    // machen — das Schlimmste, was der Börse passieren kann.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Shopify nicht erreichbar")))
    );
    const r = await getTick();
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ status: "error" });
    expect(shop.variantPrice).toBe(22); // Preis bleibt unangetastet
  });

  it("ohne Bearer-Secret → 401", async () => {
    const { GET } = await import("@/app/api/ticker/tick/route");
    const { NextRequest } = await import("next/server");
    const r = await GET(new NextRequest("https://now-music.at/api/ticker/tick"));
    expect(r.status).toBe(401);
    expect(shop.stateWrites).toBe(0);
  });
});

describe("Bestands-Anomalie: halten statt raten", () => {
  it("Bestands-Reset schreibt NICHTS und meldet sich mit 409", async () => {
    shop.inventory = 0; // Reset / Tracking-Panne — Tracking meldet weiter true
    const r = await getTick();
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ status: "anomaly" });
    expect(shop.stateWrites).toBe(0);
    expect(shop.priceWrites).toBe(0);
    expect(shop.variantPrice).toBe(22); // KEIN Sprung an den Deckel
  });

  it("?rebaseline=1 löst es bewusst auf — Kurs bleibt, Baseline zieht nach", async () => {
    shop.inventory = 300; // Kollege hat 50 Tickets nachgelegt
    expect((await getTick()).status).toBe(409); // erst mal: Stopp

    const r = await getTick("?rebaseline=1");
    expect(await r.json()).toMatchObject({ status: "rebaselined" });
    expect(shop.state!.startInventory).toBe(300);
    expect(shop.variantPrice).toBe(22); // Kurs unberührt

    // und ab jetzt zählt wieder normal
    shop.inventory = 299;
    await getTick();
    expect(shop.state!.soldCount).toBe(1);
  });

  it("der Webhook antwortet bei Anomalie NICHT mit 500 (kein Retry-Sturm)", async () => {
    shop.inventory = 0;
    const r = await postWebhook(orderBody({ id: 30, tickets: 1 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "anomaly" });
    expect(shop.variantPrice).toBe(22);
  });
});

describe("Kaputter Zustand im Metafield", () => {
  it("wird nie in einen Preis übersetzt", async () => {
    // Jemand hat das Metafield im Admin von Hand verbogen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shop.state = { ...shop.state!, driftMultiplier: null as any };
    const r = await getTick();
    expect(await r.json()).toMatchObject({ status: "error" });
    expect(shop.priceWrites).toBe(0); // kein "NaN" in den Shop
    expect(shop.variantPrice).toBe(22);
  });
});
