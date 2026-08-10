import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import {
  hasSeenOrder,
  MAX_SOLD_ABS,
  ignoreTestTickets,
  initState,
  InventoryAnomalyError,
  parseState,
  prepareForWrite,
  priceOf,
  pruneHistory,
  rebaseline,
  rememberOrder,
  shopPrice,
  tick,
} from "./engine";

const NOW = new Date("2026-07-13T12:00:00Z");
const H = 3_600_000; // eine Stunde in ms
const INV = 250; // Start-Inventar
const at = (h: number) => new Date(NOW.getTime() + h * H);

// Der Webhook-Pfad: signierte Bestellung, ohne Zeit-Anker-Verschiebung. So
// prüft man die Wirkung eines Kaufs isoliert vom Betriebs-Anker lastTickAt.
const WEBHOOK = { advanceAnchor: false, trustedSales: 50 } as const;
// Um wie viel Euro der Kurs allein durch h Stunden Flaute GESTIEGEN ist.
const rise = (h: number) => (C.riseEuroPerDay * h) / 24;

describe("initState", () => {
  it("friert Startpreis, Inventar-Baseline und Start-Zeitpunkt ein", () => {
    const s = initState(22, INV, NOW);
    expect(priceOf(s, NOW)).toBe(22);
    expect(s.startPrice).toBe(22);
    expect(s.startInventory).toBe(INV);
    expect(s.soldCount).toBe(0);
    expect(s.startAtIso).toBe(NOW.toISOString());
    expect(s.history).toEqual([{ t: NOW.toISOString(), price: 22, event: "init" }]);
  });
});

describe("Verkäufe", () => {
  it("senkt den Preis um saleDropEuro pro verkauftem Ticket", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 3, NOW, WEBHOOK); // 3 verkauft
    expect(priceOf(s1, NOW)).toBe(22 - 3 * C.saleDropEuro);
    expect(s1.soldCount).toBe(3);
    expect(s1.history.at(-1)).toMatchObject({ event: "sale" });
  });

  it("klemmt am Boden — Verkäufe werden dort weiter gezählt UND protokolliert", () => {
    const s0 = initState(22, INV, NOW);
    // 16 Verkäufe drücken den rohen Wert (6 €) unter den Boden
    const s1 = tick(s0, INV - 16, NOW, { advanceAnchor: false, trustedSales: 16 });
    expect(priceOf(s1, NOW)).toBe(C.floorEuro);

    const s2 = tick(s1, INV - 21, NOW, { advanceAnchor: false, trustedSales: 5 });
    expect(priceOf(s2, NOW)).toBe(C.floorEuro);
    expect(s2.soldCount).toBe(21);
    // Der Punkt MUSS geschrieben werden, obwohl der Preis gleich bleibt —
    // sonst meldet die Seite "heute 0 verkauft", während fünf Tickets weggingen.
    expect(s2.history.at(-1)).toMatchObject({ event: "sale", qty: 5 });
  });

  it("mutiert den alten State nicht", () => {
    const s0 = initState(22, INV, NOW);
    tick(s0, INV - 1, at(1));
    expect(priceOf(s0, NOW)).toBe(22);
    expect(s0.history).toHaveLength(1);
  });
});

describe("Storno — KEINE Preis-Ratsche (Angriffsszenario)", () => {
  it("Storno hebt den Preis exakt so weit, wie der Kauf ihn gesenkt hat", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, NOW, WEBHOOK); // Kauf
    expect(priceOf(s1, NOW)).toBe(22 - C.saleDropEuro);
    const s2 = tick(s1, INV, NOW, WEBHOOK); // Storno mit Restock
    expect(priceOf(s2, NOW)).toBe(22);
    expect(s2.soldCount).toBe(0);
    expect(s2.history.at(-1)).toMatchObject({ event: "refund" });
  });

  it("Kauf/Storno-Zyklen können den Preis NICHT zum Boden pumpen", () => {
    // Der Angriff, der die Ur-Engine (akkumulierter Preis) ruiniert hätte:
    // Zyklen dürfen den Kurs nicht billiger machen als die echte Lage.
    let s = initState(22, INV, NOW);
    for (let i = 0; i < 20; i++) {
      s = tick(s, INV - 1, at(i * 2 + 1)); // kaufen
      s = tick(s, INV, at(i * 2 + 2)); // stornieren
    }
    // Netto null Verkäufe → es bleibt exakt der Zeit-Anteil
    expect(priceOf(s, at(40))).toBe(22 + rise(40));
    expect(s.soldCount).toBe(0);
  });

});

describe("Bestands-Manipulation — kein Preissprung", () => {
  // Ein unerklärlicher Sprung wird NICHT stillschweigend zur neuen Baseline
  // erklärt (das verlor entweder echte Verkäufe oder ließ die Börse mit einer
  // erfundenen Basis weiterlaufen). Er hält an und meldet sich.

  it("Aufstockung (Kollege legt Tickets nach) bewegt den Preis nicht", () => {
    const s0 = initState(22, 176, NOW);
    expect(() => tick(s0, 250, at(1))).toThrow(InventoryAnomalyError);
    // nach bewusster Auflösung zählt ein echter Verkauf wieder korrekt
    const gezogen = rebaseline(s0, 250, at(1));
    const s2 = tick(gezogen, 249, at(2));
    expect(priceOf(s2, at(2))).toBe(22 + rise(2) - C.saleDropEuro);
    expect(s2.soldCount).toBe(1);
  });

  it("Admin senkt den Bestand massiv → KEIN Preissprung", () => {
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 200, at(1))).toThrow(InventoryAnomalyError); // 50 auf einmal
  });

  it("Bestands-Tracking aus (inventoryQuantity = 0) → kein Boden-Sturz", () => {
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 0, at(1))).toThrow(InventoryAnomalyError);
  });
});

describe("Zeit-Anstieg — zeitbasiert und idempotent", () => {
  it("steigt nach verstrichener ZEIT, nicht pro Aufruf", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(10)); // 10 Stunden vergangen
    expect(priceOf(s1, at(10))).toBeCloseTo(22 + rise(10), 10);
  });

  it("Hammering: 200 Aufrufe in derselben Sekunde heben den Preis NICHT", () => {
    // Angriff mit geleaktem CRON_SECRET: Aufruf-Zahl darf den Kurs nicht bewegen
    let s = initState(22, INV, NOW);
    for (let i = 0; i < 200; i++) s = tick(s, INV, at(1));
    expect(priceOf(s, at(1))).toBeCloseTo(22 + rise(1), 10);
  });

  it("Cron-Kadenz egal: 1×/Tag ergibt denselben Kurs wie stündlich", () => {
    let hourly = initState(22, INV, NOW);
    for (let h = 1; h <= 30 * 24; h++) hourly = tick(hourly, INV, at(h));
    let daily = initState(22, INV, NOW);
    for (let d = 1; d <= 30; d++) daily = tick(daily, INV, at(d * 24));
    expect(priceOf(hourly, at(30 * 24))).toBeCloseTo(priceOf(daily, at(30 * 24)), 10);
  });

  it("verpasste Cron-Läufe kosten nichts — die Zeit ist abgeleitet", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(1));
    const s2 = tick(s1, INV, at(50)); // 49 h Ausfall
    expect(priceOf(s2, at(50))).toBeCloseTo(22 + rise(50), 10);
  });

  it("rückwärts springende Uhr verschiebt den Anker nicht", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(10));
    const s2 = tick(s1, INV, at(5)); // Uhr springt zurück
    expect(s2.lastTickAt).toBe(s1.lastTickAt);
    // und nach dem Wieder-Vorlauf zählt die Zeit exakt einfach, nicht doppelt
    const s3 = tick(s2, INV, at(10));
    expect(priceOf(s3, at(10))).toBeCloseTo(22 + rise(10), 10);
  });

  it("stoppt exakt am Deckel und schreibt dort keine Punkte mehr", () => {
    let s = initState(22, INV, NOW);
    s = tick(s, INV, at(10000)); // sehr lange Flaute
    expect(priceOf(s, at(10000))).toBe(C.capEuro);
    const before = s.history.length;
    s = tick(s, INV, at(11000));
    expect(priceOf(s, at(11000))).toBe(C.capEuro);
    expect(s.history.length).toBe(before);
  });

  it("Webhook (advanceAnchor: false) verschiebt den Anker nie, verarbeitet aber Verkäufe", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(48), { advanceAnchor: false });
    expect(s1.lastTickAt).toBe(s0.lastTickAt); // Anker unberührt
    expect(s1.history).toHaveLength(1); // kein Drift-Punkt
    const s2 = tick(s0, INV - 1, at(48), { advanceAnchor: false });
    expect(s2.soldCount).toBe(1); // Kauf zählt
    // Der PREIS enthält die Zeit trotzdem — er ist aus startAtIso abgeleitet
    expect(priceOf(s2, at(48))).toBeCloseTo(22 + rise(48) - C.saleDropEuro, 10);
  });
});

describe("Kauf und Zeit sind unabhängige Summanden (Runde-2-Klasse strukturell tot)", () => {
  it("Cron verrechnet im selben Schritt Zeit UND Verkauf", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, at(24)); // 24 h später, dabei 1 verkauft
    expect(priceOf(s1, at(24))).toBeCloseTo(22 + rise(24) - C.saleDropEuro, 10);
  });

  it("Verkauf kann keine Flaute-Zeit löschen — der Zeit-Anteil hängt nur an startAtIso", () => {
    // Das alte Killer-Szenario: Cron 0 h, Verkauf (Webhook) bei 23 h, Cron bei
    // 24 h. Der Zeit-Anteil MUSS volle 24 h betragen, nicht bloß eine.
    const s0 = initState(22, INV, NOW);
    const verkauft = tick(s0, INV - 1, at(23), { advanceAnchor: false, trustedSales: 50 });
    expect(verkauft.lastTickAt).toBe(s0.lastTickAt); // Anker unberührt!

    const nachCron = tick(verkauft, INV - 1, at(24));
    expect(priceOf(nachCron, at(24))).toBeCloseTo(22 + rise(24) - C.saleDropEuro, 10);
  });

  it("Gleichgewicht: 1 Verkauf/Tag hält den Kurs exakt beim Start", () => {
    let s = initState(22, INV, NOW);
    let verkauft = 0;
    for (let d = 1; d <= 30; d++) {
      verkauft += 1;
      // Verkauf kurz vor dem Cron (Webhook), dann der Cron
      s = tick(s, INV - verkauft, at(d * 24 - 1), {
        advanceAnchor: false,
        trustedSales: 50,
      });
      s = tick(s, INV - verkauft, at(d * 24));
    }
    expect(s.soldCount).toBe(30);
    expect(priceOf(s, at(30 * 24))).toBeCloseTo(22, 10); // −30 € Käufe, +30 € Zeit
  });

  it("2 Verkäufe/Tag: die Community kauft den Kurs unter den Start", () => {
    let s = initState(22, INV, NOW);
    let verkauft = 0;
    for (let d = 1; d <= 10; d++) {
      verkauft += 2;
      s = tick(s, INV - verkauft, at(d * 24));
    }
    expect(s.soldCount).toBe(20);
    expect(priceOf(s, at(10 * 24))).toBeCloseTo(22 + rise(10 * 24) - 20, 10); // 12 €
  });
});

describe("Mengenkauf — signierter Webhook zählt voll", () => {
  it("Bestellung über 6 Tickets bewegt den Preis (trustedSales)", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 6, NOW, { advanceAnchor: false, trustedSales: 50 });
    expect(s1.soldCount).toBe(6);
    expect(priceOf(s1, NOW)).toBe(22 - 6 * C.saleDropEuro);
  });

  it("6 Verkäufe in einer Stunde sind auch für den Cron plausibel", () => {
    // Die Klemme wächst mit der Zeit (8/h). Sechs Käufe nach einer Ankündigung
    // sind normal — nur ein absurder Sprung ist verdächtig.
    const s0 = initState(22, INV, NOW);
    expect(tick(s0, INV - 6, at(1)).soldCount).toBe(6);
  });

  it("aber ein Sturz um 60 in einer Stunde hält an, statt zu raten", () => {
    const s0 = initState(22, INV, NOW);
    expect(() => tick(s0, INV - 60, at(1))).toThrow(InventoryAnomalyError);
  });

  it("auch mit trustedSales ist eine Aufstockung keine Verkaufszahl", () => {
    const s0 = initState(22, 100, NOW);
    expect(() =>
      tick(s0, 250, at(1), { advanceAnchor: false, trustedSales: 50 })
    ).toThrow(InventoryAnomalyError);
  });

  it("der Webhook glaubt der BESTELLMENGE — nicht jedem Bestandssprung", () => {
    // Die Falle: Eine Bestellung über 1 Ticket trifft ein, während gleichzeitig
    // der Bestand auf 0 zurückgesetzt wird. Ein pauschales "dem Webhook glauben
    // wir" hätte daraus 250 Verkäufe gemacht — Kurs sofort am Boden.
    const s0 = initState(22, 250, NOW);
    expect(() =>
      tick(s0, 0, at(1), { advanceAnchor: false, trustedSales: 1 })
    ).toThrow(InventoryAnomalyError);

    // Die bestätigte Menge selbst zählt aber voll, auch über der Zeit-Grenze:
    const s1 = tick(s0, 250 - 30, at(1), { advanceAnchor: false, trustedSales: 30 });
    expect(s1.soldCount).toBe(30);
  });
});

describe("Doppel-Webhook (Shopify stellt mindestens einmal zu)", () => {
  it("merkt sich verarbeitete Bestellungen und vergisst die ältesten", () => {
    let s = initState(22, INV, NOW);
    expect(hasSeenOrder(s, "4711")).toBe(false);
    s = rememberOrder(s, "4711");
    expect(hasSeenOrder(s, "4711")).toBe(true);

    for (let i = 0; i < C.recentOrdersMax; i++) s = rememberOrder(s, `order-${i}`);
    expect(s.recentOrders).toHaveLength(C.recentOrdersMax);
    expect(hasSeenOrder(s, "4711")).toBe(false); // rausgerutscht, aber begrenzt
  });
});

describe("Verkäufe dürfen NIE verworfen werden (Codex-Runde 2)", () => {
  it("13 Verkäufe nach Webhook-Ausfall + Tagescron zählen ALLE", () => {
    // Der teuerste denkbare Fehler: Die feste 5er-Klemme hielt jeden normalen
    // Verkaufs-Stau für eine Bestands-Panne und verwarf ihn DAUERHAFT. Die
    // Börse hätte bei guter Nachfrage nie runtergezählt.
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 13, at(24)); // ein Tag, Webhooks tot, 13 verkauft
    expect(s1.soldCount).toBe(13);
    expect(s1.history.at(-1)).toMatchObject({ event: "sale", qty: 13 });
  });

  it("die Grenze wächst mit der Zeit, nicht mit den Aufrufen", () => {
    // In einer Stunde sind 13 Verkäufe verdächtig …
    const s0 = initState(22, INV, NOW);
    expect(() => tick(s0, INV - 13, at(1))).toThrow(InventoryAnomalyError);
    // … über einen Tag hinweg sind sie normal.
    expect(tick(s0, INV - 13, at(24)).soldCount).toBe(13);
  });
});

describe("Unerklärlicher Bestands-Sprung: HALTEN, nicht raten (Codex-Runde 3)", () => {
  it("72 h Cron-Ausfall + Bestands-Reset 250→0 zählt NICHT 250 Verkäufe", () => {
    // Ohne absolute Obergrenze hätte die zeitskalierte Grenze nach drei Tagen
    // 576 "Verkäufe" erlaubt — ein Reset wäre als Ausverkauf durchgegangen und
    // hätte den Kurs sofort auf den Boden gedrückt.
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 0, at(72))).toThrow(InventoryAnomalyError);
  });

  it("ein Reset schreibt NICHTS — kein Verkauf geht verloren, kein Preis springt", () => {
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 249, at(1)); // ein echter Verkauf
    expect(() => tick(s1, 0, at(2))).toThrow(InventoryAnomalyError);
    // s1 ist unverändert — der Verkauf lebt weiter
    expect(s1.soldCount).toBe(1);
  });

  it("auch eine Aufstockung hält an, statt sie stillschweigend zu schlucken", () => {
    const s0 = initState(22, 176, NOW);
    expect(() => tick(s0, 250, at(1))).toThrow(InventoryAnomalyError);
  });

  it("rebaseline() löst es auf: Baseline zieht nach, Kurs bleibt", () => {
    const s0 = initState(22, 250, NOW);
    const verkauft = tick(s0, 249, at(1)); // 1 verkauft, Kurs unten
    const kurs = priceOf(verkauft, at(2));

    // Kollege legt 50 Tickets nach → 299
    const gezogen = rebaseline(verkauft, 299, at(2));
    expect(priceOf(gezogen, at(2))).toBe(kurs); // Kurs unberührt
    expect(gezogen.soldCount).toBe(1); // Verkauf erhalten

    // und ab jetzt zählt wieder normal weiter
    const s3 = tick(gezogen, 298, at(3));
    expect(s3.soldCount).toBe(2);
  });
});

describe("Testbestellungen bewegen den Kurs wirklich nicht", () => {
  it("ihr Bestands-Effekt wird herausgerechnet — auch vom Cron", () => {
    // Der Webhook allein zu ignorieren genügte NICHT: Die Testbestellung senkt
    // den Bestand wie jede echte, und der Cron hätte sie doch gezählt.
    const s0 = initState(22, 250, NOW);
    const s1 = ignoreTestTickets(s0, "test-1", 2); // Testkauf über 2 Tickets
    expect(s1.ignoredTickets).toBe(2);

    // Shopify schreibt den Bestand fort: 250 → 248
    const s2 = tick(s1, 248, at(1));
    expect(s2.soldCount).toBe(0); // KEIN Verkauf
    expect(priceOf(s2, at(1))).toBeCloseTo(22 + rise(1), 10); // nur Flaute

    // ein echter Kauf danach zählt ganz normal
    const s3 = tick(s2, 247, at(2));
    expect(s3.soldCount).toBe(1);
  });

  it("ignoreTestTickets faltet Überläufe auf — volle Neutralisierung, Zustand bleibt lesbar", () => {
    // An der Repräsentierbarkeits-Grenze (parseState lehnt ignoredTickets >
    // MAX_SOLD_ABS ab) wäre eine stille Klemme fatal: Teilneutralisierung +
    // Dedup = der Rest zählte dauerhaft als echte Verkäufe. Stattdessen
    // verlässt der Überlauf ignoredTickets UND startInventory gleichzeitig —
    // totalSold = startInventory − bestand − ignoredTickets ist davon
    // algebraisch unberührt.
    const basis = {
      ...initState(22, 20_500, NOW),
      ignoredTickets: MAX_SOLD_ABS - 1, // konsistenter Bestand: 20.500 − 9.999 = 10.501
    };
    const s = ignoreTestTickets(basis, "test-big", 2); // 1 drüber → Überlauf 1
    expect(s.ignoredTickets).toBe(MAX_SOLD_ABS);
    expect(s.startInventory).toBe(20_499); // −1 = der aufgefaltete Überlauf
    expect(hasSeenOrder(s, "test-big")).toBe(true);
    expect(() => parseState(JSON.stringify(s))).not.toThrow();

    // Die Neutralisierung ist VOLLSTÄNDIG: Shopify schreibt den Bestand um
    // die 2 Testtickets fort — der Cron sieht daraus null Verkäufe.
    const nachCron = tick(s, 10_501 - 2, at(1));
    expect(nachCron.soldCount).toBe(0);
    expect(priceOf(nachCron, at(1))).toBeCloseTo(22 + rise(1), 10);

    // unbrauchbare Mengen fliegen weiterhin sofort
    expect(() => ignoreTestTickets(s, "t-null", 0)).toThrow(/Menge/);
    expect(() => ignoreTestTickets(s, "t-frac", 1.5)).toThrow(/Menge/);
  });
});

describe("Zustand passt immer ins Metafield", () => {
  it("prepareForWrite hält den GESAMTEN Zustand unter dem Byte-Budget", () => {
    let s = initState(22, INV, NOW);
    for (let i = 0; i < 400; i++) s = rememberOrder(s, `60000000${i}`);
    s = {
      ...s,
      history: Array.from({ length: 4000 }, (_, i) => ({
        t: new Date(NOW.getTime() - i * H).toISOString(),
        price: 22.2222,
        event: "rebaseline" as const,
        qty: 3,
      })).reverse(),
    };
    const fertig = prepareForWrite(s, NOW);
    const bytes = new TextEncoder().encode(JSON.stringify(fertig)).length;
    expect(bytes).toBeLessThanOrEqual(C.metafieldMaxBytes);
    expect(fertig.history.length).toBeGreaterThan(1); // aber nicht leer geräumt
  });
});

describe("Extremwerte ergeben nie einen NaN-Preis", () => {
  it("jahrelange Flaute: Kurs am Deckel, Zustand bleibt lesbar", () => {
    const s0 = initState(22, INV, NOW);
    const s = tick(s0, INV, at(24 * 365 * 5)); // fünf Jahre Flaute
    expect(priceOf(s, at(24 * 365 * 5))).toBe(C.capEuro);
    expect(() => parseState(JSON.stringify(s))).not.toThrow();
  });

  it("ein absurd hoher soldCount ergibt den Boden, keinen NaN", () => {
    const s = { ...initState(22, INV, NOW), soldCount: 90_000 };
    expect(priceOf(s, NOW)).toBe(C.floorEuro);
    expect(Number.isNaN(priceOf(s, NOW))).toBe(false);
  });
});

describe("Community-Pricing: additives Modell", () => {
  it("1 Verkauf senkt um exakt 1 €, Storno hebt exakt zurück", () => {
    let s = initState(22, INV, NOW);
    s = tick(s, INV - 1, NOW, { advanceAnchor: false, trustedSales: 1 });
    expect(priceOf(s, NOW)).toBe(21);
    s = tick(s, INV, NOW, { advanceAnchor: false });
    expect(priceOf(s, NOW)).toBe(22); // exakte Symmetrie
  });

  it("24 h Flaute heben um exakt 1 €", () => {
    const s = initState(22, INV, NOW);
    expect(priceOf(s, at(24))).toBe(23);
  });

  it("Boden klebt: Kaufwelle drückt roh unter den Boden, Zeit muss erst aufholen", () => {
    let s = initState(22, INV, NOW);
    s = tick(s, INV - 20, NOW, { advanceAnchor: false, trustedSales: 20 }); // roh 2 €
    expect(priceOf(s, NOW)).toBe(C.floorEuro);
    // 5 Tage später: roh 7 € — immer noch Boden
    expect(priceOf(s, at(5 * 24))).toBe(C.floorEuro);
    // 7 Tage später: roh 9 € — wieder über dem Boden
    expect(priceOf(s, at(7 * 24))).toBe(9);
  });

  it("negativer soldCount (Alt-Storno) hebt über den Startpreis, Deckel klemmt", () => {
    const s = { ...initState(22, INV, NOW), soldCount: -3 };
    expect(priceOf(s, NOW)).toBe(25);
    expect(priceOf({ ...s, soldCount: -20 }, NOW)).toBe(C.capEuro);
  });

  it("Uhr vor dem Start (now < startAtIso) → Zeit-Anteil 0, nie negativ", () => {
    const s = initState(22, INV, NOW);
    expect(priceOf(s, at(-48))).toBe(22);
  });
});

describe("parseState — kaputter Zustand darf NIE in den Shop", () => {
  const gut = () => JSON.stringify(initState(22, INV, NOW));

  it("liest einen gültigen Zustand", () => {
    const s = parseState(gut());
    expect(priceOf(s, NOW)).toBe(22);
    expect(s.recentOrders).toEqual([]);
  });

  it("wirft bei kaputtem JSON", () => {
    expect(() => parseState("{nope")).toThrow(/kein gültiges JSON/);
  });

  it("wirft bei NaN statt einen NaN-Preis zu schreiben", () => {
    const s = JSON.parse(gut());
    s.startPrice = null; // JSON.stringify(NaN) === "null"
    expect(() => parseState(JSON.stringify(s))).toThrow(/startPrice/);
  });

  it("wirft bei unlesbarem Datum (sonst wird die Zeit-Mathe NaN)", () => {
    const s = JSON.parse(gut());
    s.lastTickAt = "morgen";
    expect(() => parseState(JSON.stringify(s))).toThrow(/lastTickAt/);
  });

  it("wirft bei fehlender History", () => {
    const s = JSON.parse(gut());
    delete s.history;
    expect(() => parseState(JSON.stringify(s))).toThrow(/history/);
  });

  it("verträgt Zustände ohne recentOrders (Feld kam später dazu)", () => {
    const s = JSON.parse(gut());
    delete s.recentOrders;
    expect(parseState(JSON.stringify(s)).recentOrders).toEqual([]);
  });

  it("fehlendes startAtIso wird abgewiesen — ohne Anker gibt es keinen Preis", () => {
    const s = JSON.parse(gut());
    delete s.startAtIso;
    expect(() => parseState(JSON.stringify(s))).toThrow(/startAtIso/);
  });

  it("startAtIso in ferner Zukunft wird abgewiesen — der Kurs könnte nie steigen", () => {
    const s = JSON.parse(gut());
    s.startAtIso = "2100-01-01T00:00:00.000Z";
    expect(() => parseState(JSON.stringify(s), NOW)).toThrow(/startAtIso/);
    // ohne `now` (reine Struktur-Prüfung) bleibt das Verhalten wie bisher
    expect(() => parseState(JSON.stringify(s))).not.toThrow();
  });

  it("driftMultiplier-Altfeld im JSON wird stillschweigend verworfen", () => {
    const s = JSON.parse(gut());
    s.driftMultiplier = 0.5;
    const geparst = parseState(JSON.stringify(s), NOW);
    expect("driftMultiplier" in geparst).toBe(false);
    expect(priceOf(geparst, NOW)).toBe(22);
  });
});

describe("Audit-Runde 4 — Alt-Storno unter die Baseline (Ticket-Modus)", () => {
  // Ein negativer soldCount ist ein legitimer Zustand: weniger gültige Tickets
  // als beim Start = Kurs ÜBER dem Startniveau (weniger Community-Rabatt).
  it("hebt den Kurs, statt die Börse einzufrieren", () => {
    const s0 = initState(22, INV, NOW, 50, "tickets");
    // Ticket-System meldet 49 gültige Tickets (ein Alt-Käufer stornierte)
    const bestand = INV - 49 + 50; // bestandAusTicketZahl
    const s1 = tick(s0, bestand, NOW, { advanceAnchor: false, trustedSales: 1 });
    expect(s1.soldCount).toBe(-1);
    expect(priceOf(s1, NOW)).toBe(22 + C.saleDropEuro);
    expect(s1.history.at(-1)).toMatchObject({ event: "refund", qty: 1 });
  });

  it("der nächste Verkauf senkt den Kurs exakt zurück — Symmetrie über die Baseline", () => {
    const s0 = initState(22, INV, NOW, 50, "tickets");
    const s1 = tick(s0, INV - 49 + 50, NOW, { advanceAnchor: false, trustedSales: 1 });
    const s2 = tick(s1, INV - 50 + 50, NOW, { advanceAnchor: false, trustedSales: 1 });
    expect(s2.soldCount).toBe(0);
    expect(priceOf(s2, NOW)).toBe(22);
  });
});

describe("Audit-Runde 4 — Aufstockung ist keine Massen-Rückbuchung", () => {
  it("+50 Bestand bei 60 Verkäufen hält an, statt den Kurs zu reißen", () => {
    // Die Klemme prüft BEIDE Richtungen: Dieser Sprung wäre sonst als 50
    // Stornos verbucht worden — der Kurs wäre um 50 € gestiegen (Deckel),
    // obwohl nur ein Kollege Tickets nachgelegt hatte.
    const s = { ...initState(22, 250, NOW), soldCount: 60 };
    expect(() => tick(s, 240, at(1))).toThrow(InventoryAnomalyError);
  });

  it("kleine Rückbuchungen über die Baseline hinaus zählen weiterhin als Storno", () => {
    // Ein Storno MIT Rückbuchung sieht im Bestand genauso aus wie eine kleine
    // Aufstockung — nicht unterscheidbar. Kleine Bewegungen bleiben Stornos.
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 252, at(1), { advanceAnchor: false });
    expect(s1.soldCount).toBe(-2);
    expect(s1.history.at(-1)).toMatchObject({ event: "refund", qty: 2 });
  });
});

describe("Audit-Runde 4 — die Engine schreibt nur, was parseState wieder liest", () => {
  it("ein totalSold jenseits der parseState-Grenze hält an (sonst fröre die Börse ein)", () => {
    // Wäre die Schreibgrenze lockerer als die Lesegrenze, schriebe die Engine
    // einen Zustand, den ihr eigenes parseState beim nächsten Tick ablehnt.
    const s = { ...initState(22, 250, NOW), soldCount: 9_990 };
    expect(() =>
      tick(s, 250 - 10_010, at(1), { advanceAnchor: false, trustedSales: 20 })
    ).toThrow(InventoryAnomalyError);
  });
});

describe("Audit-Runde 4 — parseState (Quelle & Anker)", () => {
  const gut = () => JSON.stringify(initState(22, INV, NOW));

  it("negativer soldCount ist ein gültiger Zustand (Alt-Storno)", () => {
    const s = JSON.parse(gut());
    s.soldCount = -3;
    expect(parseState(JSON.stringify(s)).soldCount).toBe(-3);
  });

  it("lastTickAt in der fernen Zukunft wird abgewiesen — die Klemme wäre still verzerrt", () => {
    const s = JSON.parse(gut());
    s.lastTickAt = "2126-01-01T00:00:00.000Z";
    expect(() => parseState(JSON.stringify(s), NOW)).toThrow(/Zukunft/);
    // ohne `now` (reine Struktur-Prüfung) bleibt das Verhalten wie bisher
    expect(() => parseState(JSON.stringify(s))).not.toThrow();
  });

  it("Zustände ohne quelle-Feld gelten als bestandsbasiert (vor der Kopplung)", () => {
    const s = JSON.parse(gut());
    delete s.quelle;
    expect(parseState(JSON.stringify(s)).quelle).toBe("bestand");
  });

  it("ein VORHANDENES, aber ungültiges quelle-Feld wird abgewiesen", () => {
    // Ein Admin-Tippfehler ("ticket", null) darf NICHT still als "bestand"
    // gelesen werden — das wäre genau der stille Quellenwechsel, den das Feld
    // verhindern soll.
    const s = JSON.parse(gut());
    s.quelle = "ticket";
    expect(() => parseState(JSON.stringify(s))).toThrow(/quelle/);
    s.quelle = null;
    expect(() => parseState(JSON.stringify(s))).toThrow(/quelle/);
  });

  it("die eingefrorene Ticket-Quelle bleibt erhalten", () => {
    const s = JSON.parse(JSON.stringify(initState(22, INV, NOW, 24, "tickets")));
    expect(parseState(JSON.stringify(s)).quelle).toBe("tickets");
  });
});

describe("shopPrice", () => {
  it("rundet auf 10 Cent und klemmt an den Grenzen", () => {
    expect(shopPrice(21.9412)).toBe(21.9);
    expect(shopPrice(21.96)).toBe(22);
    expect(shopPrice(0.8)).toBe(C.floorEuro);
    expect(shopPrice(999)).toBe(C.capEuro);
  });
});

describe("pruneHistory", () => {
  const D = 24 * H;

  it("behält junge Punkte vollständig", () => {
    const hist = Array.from({ length: 24 }, (_, i) => ({
      t: new Date(NOW.getTime() - 2 * D + i * H).toISOString(),
      price: 20,
      event: "drift" as const,
    }));
    expect(pruneHistory(hist, NOW)).toHaveLength(24);
  });

  it("dünnt alte Punkte auf das 6h-Raster aus", () => {
    const base = NOW.getTime() - 10 * D;
    const hist = Array.from({ length: 24 }, (_, i) => ({
      t: new Date(base + i * H).toISOString(),
      price: 20,
      event: "drift" as const,
    }));
    expect(pruneHistory(hist, NOW).length).toBeLessThanOrEqual(5);
  });

  it("kappt hart bei historyMaxPoints (Metafield-Schutz)", () => {
    const hist = Array.from({ length: 3000 }, (_, i) => ({
      t: new Date(NOW.getTime() - 3000 * H + i * H).toISOString(),
      price: 20,
      event: "sale" as const, // sale-Punkte wurden früher NIE geprunt
    }));
    const pruned = pruneHistory(hist, NOW);
    expect(pruned.length).toBeLessThanOrEqual(C.historyMaxPoints);
  });

  it("hält das BYTE-Budget ein — auch im schlimmsten Fall", () => {
    // Das Metafield-Limit ist in Byte bemessen, nicht in Punkten.
    const hist = Array.from({ length: 3000 }, (_, i) => ({
      t: new Date(NOW.getTime() - i * H).toISOString(),
      price: 22.220000000000002, // ungerundet = teuerste Schreibweise
      event: "rebaseline" as const, // längster Event-Name
    })).reverse();
    const bytes = new TextEncoder().encode(JSON.stringify(pruneHistory(hist, NOW))).length;
    expect(bytes).toBeLessThanOrEqual(C.metafieldMaxBytes);
  });

  it("die Engine schreibt gerundete Preise in die History", () => {
    const s = tick(initState(22, INV, NOW), INV - 1, at(1));
    const p = s.history.at(-1)!.price;
    expect(String(p).length).toBeLessThanOrEqual(8); // nicht 22.220000000000002
  });
});
