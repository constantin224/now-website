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

/** Antwort des Ticket-Systems (Repo tonherd-tickets, /api/verkaufszahl). */
let tickets: {
  scharf: boolean;
  gueltigeTickets?: number;
  doorsUtc?: string | null;
  /** Simuliert: Ticket-System nicht erreichbar */
  tot?: boolean;
};

function fakeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const body = String(init?.body ?? "");
  const json = (o: unknown) =>
    Promise.resolve(new Response(JSON.stringify(o), { status: 200 }));

  if (String(url).includes("/api/verkaufszahl")) {
    if (tickets.tot) return Promise.reject(new Error("Ticket-System nicht erreichbar"));
    return json(tickets);
  }

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
  // Standard: KEIN Ticket-System konfiguriert → die bestehenden Tests prüfen
  // weiterhin den Bestands-Notpfad.
  vi.stubEnv("TICKETS_BASE_URL", "");
  vi.stubEnv("TICKETS_MONITOR_SECRET", "");
  tickets = { scharf: false };
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

  it("der CRON zieht einen veralteten Preis wieder gerade", async () => {
    // Der Preis ist das einzige Feld ohne Compare-and-Swap — Shopify bietet dafür
    // keins. Der gefährliche Ablauf:
    //   A schreibt Zustand (1 Verkauf) … A stockt …
    //   B schreibt Zustand (2 Verkäufe) + Preis 22,40 €
    //   A schreibt jetzt erst seinen Preis: 22,20 €   ← veraltet, gewinnt aber
    // Der Abgleich nach dem Schreiben zieht das im Cron wieder gerade.
    let dazwischen = false;
    shop.onBeforePriceWrite = () => {
      if (dazwischen) return;
      dazwischen = true;
      // Ein anderer Schreiber war schneller: Zustand steht schon auf 2 Verkäufen
      shop.state = { ...shop.state!, soldCount: 2 };
      shop.inventory = 248;
      shop.digest = "neuer";
    };

    shop.inventory = 249; // der Cron sieht zunächst 1 Verkauf
    await getTick();

    // Der Preis muss zum AKTUELLEN Zustand (2 Verkäufe) passen, nicht zu dem,
    // den unser Lauf für richtig hielt (1 Verkauf).
    const soll = 22 * Math.pow(1.01, 2);
    expect(shop.variantPrice).toBeCloseTo(Math.round(soll * 10) / 10, 2);
    expect(shop.state!.soldCount).toBe(2);
  });

  it("der WEBHOOK spart sich den Abgleich — Shopify wartet nur ~5 s", async () => {
    // Bewusster Trade-off: Der Abgleich kostet einen weiteren Shopify-Roundtrip.
    // Bleibt die Webhook-Antwort zu lange aus, wiederholt Shopify die Zustellung
    // und LÖSCHT das Abo nach einigen Stunden — genau daran ist das
    // Schwesterprojekt (tonherd-tickets) aufgelaufen. Der Cron gleicht ab.
    await postWebhook(orderBody({ id: 21, tickets: 1 }));

    const reads = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (c) => String(c[1] && (c[1] as RequestInit).body).includes("query TickerRead")
    );
    expect(reads).toHaveLength(1); // EIN Read — nicht zwei
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

describe("Verkaufszahl aus dem Ticket-System statt aus dem Bestand", () => {
  // Die Börse rät nicht mehr. Sie fragt das Ticket-System (Repo tonherd-tickets),
  // das die gültigen Tickets aus den BESTELLUNGEN kennt (Stornos raus).

  beforeEach(() => {
    vi.stubEnv("TICKETS_BASE_URL", "https://tickets.test");
    vi.stubEnv("TICKETS_MONITOR_SECRET", "mon-geheim");
    tickets = { scharf: true, gueltigeTickets: 0, doorsUtc: "2026-10-17T17:00:00Z" };
  });

  it("beim Start werden Alt-Tickets als Baseline UND die Quelle eingefroren", async () => {
    // 24 Tickets aus der Evey-Zeit. Ohne Baseline läse die Börse sie als frische
    // Verkäufe und risse den Kurs sofort hoch — bestraft würde, wer FRÜH gekauft hat.
    shop.state = null;
    tickets.gueltigeTickets = 24;

    const r = await getTick("?start=1");
    expect(await r.json()).toMatchObject({ status: "started", quelle: "ticket-system" });
    expect(shop.state!.startTickets).toBe(24);
    expect(shop.state!.quelle).toBe("tickets");
    expect(shop.state!.soldCount).toBe(0);
    expect(shop.variantPrice).toBe(22); // Startpreis, kein Sprung
  });

  it("neue Verkäufe zählen ab der Baseline", async () => {
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 24 };
    tickets.gueltigeTickets = 27; // drei neue

    await getTick();
    expect(shop.state!.soldCount).toBe(3);
    expect(shop.variantPrice).toBeCloseTo(22 * Math.pow(1.01, 3), 1);
  });

  it("ein Storno senkt den Kurs — auch OHNE Rückbuchung ins Lager", async () => {
    // Das kann die Bestands-Quelle prinzipiell nicht: Ohne Restock bliebe das
    // Ticket dort für immer als verkauft gezählt. Das Ticket-System weiß es besser.
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 0, soldCount: 5 };
    shop.inventory = 250; // Bestand rührt sich NICHT
    tickets.gueltigeTickets = 4; // einer hat storniert

    await getTick();
    expect(shop.state!.soldCount).toBe(4);
    expect(shop.state!.history.at(-1)).toMatchObject({ event: "refund" });
  });

  it("der Cutoff (Bestand → 0 bei Türöffnung) löst KEINEN Ausverkauf aus", async () => {
    // Das Ticket-System nullt bei Türöffnung den Bestand. Früher hätte die Börse
    // das als 250 Verkäufe gelesen — Kurs am Deckel, beim eigenen Konzert.
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 0, soldCount: 10 };
    shop.inventory = 0; // Cutoff hat zugeschlagen
    tickets.gueltigeTickets = 10; // in Wahrheit: unverändert 10 Tickets

    await getTick();
    expect(shop.state!.soldCount).toBe(10); // kein Sprung auf 250
    // Der Kurs bleibt der von 10 Verkäufen (~24,30 €) — NICHT der Deckel.
    expect(shop.variantPrice).toBeLessThan(C.capEuro);
    expect(shop.variantPrice).toBeCloseTo(22 * Math.pow(1.01, 10), 0);
  });

  it("schweigt das Ticket-System, wird NUR gedriftet — kein Rückfall auf den Bestand", async () => {
    // Beide Quellen können auseinanderliegen. Ein stiller Quellenwechsel erzeugte
    // einen Preissprung aus dem Nichts.
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 0, soldCount: 5 };
    shop.inventory = 200; // Bestand behauptet 50 Verkäufe
    tickets.scharf = false; // Ticket-System hat (noch) keine Wahrheit

    const r = await getTick();
    expect((await r.json()).quelle).toMatch(/nur-drift/);
    expect(shop.state!.soldCount).toBe(5); // NICHT 50
  });

  it("nach Türöffnung ist die Börse zu", async () => {
    tickets.doorsUtc = new Date(Date.now() - 3_600_000).toISOString(); // Türen sind auf
    const r = await getTick();
    expect(await r.json()).toMatchObject({ status: "beendet" });
    expect(shop.stateWrites).toBe(0);
    expect(shop.priceWrites).toBe(0);
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

  it("ein Drift-Anker in der fernen Zukunft wird abgewiesen (Drift wäre still aus)", async () => {
    shop.state = { ...shop.state!, lastTickAt: "2126-01-01T00:00:00.000Z" };
    const r = await getTick();
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ status: "error" });
    expect(shop.stateWrites).toBe(0);
  });
});

describe("Audit-Runde 4 — die Naht zur Ticket-Quelle", () => {
  // Runde 4 fand alle Fehler in der Kopplungs-Schicht (14./15.07.), die NACH
  // den ersten drei Audit-Runden entstand. Diese Tests sind das Netz darunter.

  beforeEach(() => {
    vi.stubEnv("TICKETS_BASE_URL", "https://tickets.test");
    vi.stubEnv("TICKETS_MONITOR_SECRET", "mon-geheim");
    tickets = { scharf: true, gueltigeTickets: 0, doorsUtc: "2026-10-17T17:00:00Z" };
  });

  it("?start=1 wird VERWEIGERT, wenn das Ticket-System konfiguriert ist, aber schweigt", async () => {
    // Sonst würde startTickets=0 eingefroren — und sobald das System antwortet,
    // zählten alle Alt-Tickets als frische Verkäufe (Kurs an den Deckel).
    shop.state = null;
    tickets = { scharf: true, tot: true };

    const r = await getTick("?start=1");
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ status: "start_verweigert" });
    expect(shop.state).toBeNull();
    expect(shop.stateWrites).toBe(0);
  });

  it("?start=1 wird auch verweigert, wenn das Event nicht scharf ist", async () => {
    shop.state = null;
    tickets = { scharf: false };
    const r = await getTick("?start=1");
    expect(r.status).toBe(503);
    expect(shop.state).toBeNull();
  });

  it("Storno eines ALT-Tickets senkt den Kurs, statt die Börse einzufrieren", async () => {
    // Früher: totalSold=-1 → InventoryAnomalyError → Dauer-409 bei jedem Cron,
    // und ?rebaseline=1 (zieht nur startInventory) konnte es nie auflösen.
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 50 };
    tickets.gueltigeTickets = 49; // ein Alt-Käufer hat storniert

    const r = await getTick();
    expect(r.status).toBe(200);
    expect(shop.state!.soldCount).toBe(-1);
    expect(shop.state!.history.at(-1)).toMatchObject({ event: "refund", qty: 1 });
    expect(shop.variantPrice).toBeLessThan(22);

    // und der nächste Verkauf hebt den Kurs exakt zurück — keine Ratsche
    tickets.gueltigeTickets = 50;
    await getTick();
    expect(shop.state!.soldCount).toBe(0);
  });

  it("ein nachträglich konfiguriertes Ticket-System kapert einen Bestands-Zustand NICHT", async () => {
    // shop.state stammt aus dem beforeEach → quelle "bestand". Die Envs zeigen
    // jetzt auf ein Ticket-System, das 50 Alt-Tickets kennt. Ein stiller Wechsel
    // würde sie alle als frische Verkäufe zählen.
    tickets.gueltigeTickets = 50;

    const r = await getTick();
    const json = await r.json();
    expect(json.quelle).toBe("bestand");
    expect(json.hinweis).toMatch(/nur explizit/);
    expect(shop.state!.soldCount).toBe(0); // NICHT 50
    expect(shop.variantPrice).toBeLessThanOrEqual(22);
  });

  it("Ticket-Zustand + entfernte Envs → lauter Fehler, KEIN stiller Wechsel auf den Bestand", async () => {
    shop.state = { ...shop.state!, quelle: "tickets", startTickets: 10, soldCount: 5 };
    shop.inventory = 200; // der Bestand ist längst divergent
    vi.stubEnv("TICKETS_BASE_URL", "");
    vi.stubEnv("TICKETS_MONITOR_SECRET", "");

    const r = await getTick();
    expect(r.status).toBe(500);
    expect(shop.state!.soldCount).toBe(5); // unangetastet
    expect(shop.stateWrites).toBe(0);
  });

  it("der Webhook bucht im Ticket-Modus KEINE Verkäufe (der Cron zieht nach)", async () => {
    // Sonst: Bestands-Mathe kann mehr als die Bestellmenge übernehmen, und
    // Cron + Webhook zählen dieselbe Bestellung vorübergehend doppelt.
    shop.state = { ...shop.state!, quelle: "tickets" };
    shop.inventory = 245; // Bestand ist aus fremden Gründen gefallen

    const r = await postWebhook(orderBody({ id: 41, tickets: 2 }));
    expect(await r.json()).toMatchObject({ ok: true, tickets: 2 });
    expect(shop.stateWrites).toBe(0); // kein Schreibvorgang
    expect(shop.state!.soldCount).toBe(0);
    expect(shop.variantPrice).toBe(22);
  });

  it("Testbestellungen werden auch im Ticket-Modus neutralisiert", async () => {
    // Das Ticket-System zählt Testbestellungen im Berechtigungs-Set mit —
    // ohne ignoredTickets würde der nächste Cron sie als Verkauf werten.
    shop.state = { ...shop.state!, quelle: "tickets" };
    await postWebhook(orderBody({ id: 42, tickets: 3, test: true }));
    expect(shop.state!.ignoredTickets).toBe(3);

    tickets.gueltigeTickets = 3; // die Testbestellung taucht im Ledger auf
    await getTick();
    expect(shop.state!.soldCount).toBe(0); // neutralisiert
    expect(shop.variantPrice).toBe(22);
  });

  it("unlesbares doorsUtc macht die ganze Antwort unbrauchbar → nur-drift", async () => {
    // Früher: now >= NaN ist immer false → der Türöffnungs-Stopp war STILL aus,
    // und weil der Wert nicht null war, griff auch der Config-Fallback nicht.
    shop.state = { ...shop.state!, quelle: "tickets" };
    tickets = { scharf: true, gueltigeTickets: 60, doorsUtc: "kaputt" };

    const r = await getTick();
    expect((await r.json()).quelle).toMatch(/nur-drift/);
    expect(shop.state!.soldCount).toBe(0); // die 60 wurden NICHT übernommen
  });

  it("eine absurde Ticket-Zahl wird abgewiesen → nur-drift statt eingefrorener Börse", async () => {
    // 1e20 hätte als soldCount geschrieben werden können — und parseState hätte
    // den selbst geschriebenen Zustand beim nächsten Lesen abgelehnt.
    shop.state = { ...shop.state!, quelle: "tickets" };
    tickets = { scharf: true, gueltigeTickets: 1e20 };

    const r = await getTick();
    expect((await r.json()).quelle).toMatch(/nur-drift/);
    expect(shop.state!.soldCount).toBe(0);
  });

  it('scharf als String "false" gilt NICHT als scharf', async () => {
    shop.state = { ...shop.state!, quelle: "tickets" };
    tickets = { scharf: "false" as unknown as boolean, gueltigeTickets: 60 };

    const r = await getTick();
    expect((await r.json()).quelle).toMatch(/nur-drift/);
    expect(shop.state!.soldCount).toBe(0);
  });

  it("?rebaseline=1 und ?reconcile=1 werden im Ticket-Modus abgewiesen", async () => {
    shop.state = { ...shop.state!, quelle: "tickets" };
    const r1 = await getTick("?rebaseline=1");
    expect(r1.status).toBe(400);
    expect(await r1.json()).toMatchObject({ status: "hebel_unnoetig" });
    const r2 = await getTick("?reconcile=1");
    expect(r2.status).toBe(400);
    expect(shop.stateWrites).toBe(0);
  });

  it("doorsUtc ohne Zeitzone macht die Antwort unbrauchbar (Server-Zeitzonen-Falle)", async () => {
    shop.state = { ...shop.state!, quelle: "tickets" };
    tickets = { scharf: true, gueltigeTickets: 60, doorsUtc: "2026-10-17T19:00:00" };
    const r = await getTick();
    expect((await r.json()).quelle).toMatch(/nur-drift/);
    expect(shop.state!.soldCount).toBe(0);
  });
});

describe("Audit-Runde 4b — ?reconcile=<sprünge>: echte Sprünge bestätigen (Bestands-Modus)", () => {
  it("ein Refund-Batch hält erst an — und ?reconcile=-10 übernimmt ihn in den Kurs", async () => {
    // 10 Bestellungen storniert + zurückgebucht, in EINER Stunde. Die Klemme
    // (8/h) hält korrekt an. ?rebaseline=1 wäre hier FALSCH — es löschte die
    // Stornos lautlos aus Kurs und Statistik. ?reconcile bestätigt sie.
    shop.state = { ...shop.state!, soldCount: 10 };
    shop.inventory = 250; // alle 10 zurückgebucht → Sprung um −10

    const anomalie = await getTick();
    expect(anomalie.status).toBe(409); // erst mal: Stopp
    expect((await anomalie.json()).spruenge).toBe(-10); // der zu bestätigende Wert

    const r = await getTick("?reconcile=-10");
    expect(await r.json()).toMatchObject({ status: "reconciled", soldCount: 0 });
    expect(shop.state!.soldCount).toBe(0);
    expect(shop.state!.history.at(-1)).toMatchObject({ event: "refund", qty: 10 });
  });

  it("auch ein bestätigter Massen-VERKAUF geht über ?reconcile", async () => {
    shop.inventory = 200; // 50 auf einmal — normal ein 409
    expect((await getTick()).status).toBe(409);

    const r = await getTick("?reconcile=50");
    expect(await r.json()).toMatchObject({ status: "reconciled", soldCount: 50 });
    expect(shop.variantPrice).toBe(C.capEuro); // 50 Verkäufe → Deckel
  });

  it("bestätigt wird eine ZAHL, kein Zeitpunkt — bewegter Bestand → erneut 409", async () => {
    // Zwischen Sehen (409 meldet −10) und Bestätigen hat sich der Bestand
    // weiterbewegt. Der Hebel darf NICHT den neuen Sprung schlucken.
    shop.state = { ...shop.state!, soldCount: 10 };
    shop.inventory = 250;
    expect((await getTick()).status).toBe(409); // meldet −10

    shop.inventory = 210; // inzwischen: Sprung wäre +30
    const r = await getTick("?reconcile=-10");
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ status: "reconcile_abgelehnt", gefunden: 30 });
    expect(shop.state!.soldCount).toBe(10); // nichts geschrieben
  });

  it("rebaseline und reconcile gleichzeitig → 400", async () => {
    const r = await getTick("?rebaseline=1&reconcile=-10");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ status: "hebel_konflikt" });
    expect(shop.stateWrites).toBe(0);
  });
});
