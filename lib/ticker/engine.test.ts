import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import {
  hasSeenOrder,
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

// Der Webhook-Pfad: signierte Bestellung, kein Drift. So prüft man die Wirkung
// eines Kaufs isoliert — über den Cron-Pfad käme immer die Flaute-Zeit dazu.
const WEBHOOK = { allowDrift: false, trustedSales: 50 } as const;
// Wie stark der Kurs allein durch Flaute gefallen ist (Cron-Pfad, h Stunden).
const drift = (h: number) => Math.pow(C.driftFactorPerHour, h);

describe("initState", () => {
  it("friert Startpreis und Inventar-Baseline ein", () => {
    const s = initState(22, INV, NOW);
    expect(priceOf(s)).toBe(22);
    expect(s.startPrice).toBe(22);
    expect(s.startInventory).toBe(INV);
    expect(s.soldCount).toBe(0);
    expect(s.driftMultiplier).toBe(1);
    expect(s.history).toEqual([{ t: NOW.toISOString(), price: 22, event: "init" }]);
  });
});

describe("Verkäufe", () => {
  it("hebt den Preis um den Bump pro verkauftem Ticket", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 3, at(1), WEBHOOK); // 3 verkauft
    expect(priceOf(s1)).toBeCloseTo(22 * Math.pow(1 + C.saleBumpPct, 3), 10);
    expect(s1.soldCount).toBe(3);
    expect(s1.history.at(-1)).toMatchObject({ event: "sale" });
  });

  it("deckelt am Cap — Verkäufe werden dort weiter gezählt UND protokolliert", () => {
    // Verkäufe kommen einzeln (Webhook pro Bestellung) — bis über den Deckel
    let s = initState(22, INV, NOW);
    const toCap =
      Math.ceil(Math.log(C.capEuro / 22) / Math.log(1 + C.saleBumpPct)) + 3;
    for (let i = 1; i <= toCap; i++) s = tick(s, INV - i, at(i), WEBHOOK);
    expect(priceOf(s)).toBe(C.capEuro);

    const s2 = tick(s, INV - toCap - 5, at(toCap + 1), WEBHOOK); // 5 Tickets am Deckel
    expect(priceOf(s2)).toBe(C.capEuro);
    expect(s2.soldCount).toBe(toCap + 5);
    // Der Punkt MUSS geschrieben werden, obwohl der Preis gleich bleibt —
    // sonst meldet die Seite "heute 0 verkauft", während fünf Tickets weggingen.
    expect(s2.history.at(-1)).toMatchObject({ event: "sale", qty: 5 });
  });

  it("mutiert den alten State nicht", () => {
    const s0 = initState(22, INV, NOW);
    tick(s0, INV - 1, at(1));
    expect(priceOf(s0)).toBe(22);
    expect(s0.history).toHaveLength(1);
  });
});

describe("Storno — KEINE Preis-Ratsche (Angriffsszenario)", () => {
  it("Storno senkt den Preis exakt so weit, wie der Kauf ihn gehoben hat", () => {
    // Ohne Drift geprüft: Der Storno muss den Kauf EXAKT aufheben.
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, at(1), WEBHOOK); // Kauf
    expect(priceOf(s1)).toBeCloseTo(22 * (1 + C.saleBumpPct), 10);
    const s2 = tick(s1, INV, at(2), WEBHOOK); // Storno mit Restock
    expect(priceOf(s2)).toBeCloseTo(22, 10);
    expect(s2.soldCount).toBe(0);
    expect(s2.history.at(-1)).toMatchObject({ event: "refund" });
  });

  it("Kauf/Storno-Zyklen können den Preis NICHT zum Deckel pumpen", () => {
    // Der Angriff, der die alte Engine in 3 Zyklen an den Deckel getrieben hat
    let s = initState(22, INV, NOW);
    for (let i = 0; i < 20; i++) {
      s = tick(s, INV - 1, at(i * 2 + 1)); // kaufen
      s = tick(s, INV, at(i * 2 + 2)); // stornieren
    }
    expect(priceOf(s)).toBeLessThanOrEqual(22); // nie höher als der Start
    expect(s.soldCount).toBe(0);
  });

  it("Storno verlängert die Gnadenfrist nicht", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, at(1));
    const s2 = tick(s1, INV, at(2)); // Storno
    expect(s2.lastSaleAt).toBe(s1.lastSaleAt); // NICHT auf "jetzt" gesetzt
  });
});

describe("Bestands-Manipulation — kein Preissprung", () => {
  // Ein unerklärlicher Sprung wird NICHT mehr stillschweigend zur neuen Baseline
  // erklärt (das verlor entweder echte Verkäufe oder ließ die Börse mit einer
  // erfundenen Basis weiterlaufen). Er hält an und meldet sich.

  it("Aufstockung (Kollege legt Tickets nach) bewegt den Preis nicht", () => {
    const s0 = initState(22, 176, NOW);
    expect(() => tick(s0, 250, at(1))).toThrow(InventoryAnomalyError);
    // nach bewusster Auflösung zählt ein echter Verkauf wieder korrekt
    const gezogen = rebaseline(s0, 250, at(1));
    const s2 = tick(gezogen, 249, at(2));
    expect(s2.soldCount).toBe(1);
    expect(priceOf(s2)).toBeCloseTo(22 * drift(2) * (1 + C.saleBumpPct), 10);
  });

  it("Admin senkt den Bestand massiv → KEIN Preissprung", () => {
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 200, at(1))).toThrow(InventoryAnomalyError); // 50 auf einmal
  });

  it("Bestands-Tracking aus (inventoryQuantity = 0) → kein Deckel-Sprung", () => {
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 0, at(1))).toThrow(InventoryAnomalyError);
  });
});

describe("Drift — zeitbasiert und idempotent", () => {
  it("driftet nach verstrichener ZEIT, nicht pro Aufruf", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(10)); // 10 Stunden vergangen
    expect(priceOf(s1)).toBeCloseTo(22 * Math.pow(C.driftFactorPerHour, 10), 8);
  });

  it("Hammering: 200 Aufrufe in derselben Sekunde senken den Preis NICHT", () => {
    // Angriff mit geleaktem CRON_SECRET gegen die alte Engine: Preis auf Boden
    let s = initState(22, INV, NOW);
    for (let i = 0; i < 200; i++) s = tick(s, INV, at(1));
    expect(priceOf(s)).toBeCloseTo(22 * Math.pow(C.driftFactorPerHour, 1), 8);
  });

  it("Cron-Kadenz egal: 1×/Tag ergibt denselben Kurs wie stündlich", () => {
    let hourly = initState(22, INV, NOW);
    for (let h = 1; h <= 30 * 24; h++) hourly = tick(hourly, INV, at(h));
    let daily = initState(22, INV, NOW);
    for (let d = 1; d <= 30; d++) daily = tick(daily, INV, at(d * 24));
    expect(priceOf(hourly)).toBeCloseTo(priceOf(daily), 6);
  });

  it("verpasste Cron-Läufe werden nachgeholt", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(1));
    const s2 = tick(s1, INV, at(50)); // 49 h Ausfall
    expect(priceOf(s2)).toBeCloseTo(22 * Math.pow(C.driftFactorPerHour, 50), 8);
  });

  it("rückwärts springende Uhr senkt den Preis nicht", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(10));
    const s2 = tick(s1, INV, at(5)); // Uhr springt zurück
    expect(priceOf(s2)).toBeCloseTo(priceOf(s1), 10);
  });

  it("stoppt exakt am Boden und schreibt dort keine Punkte mehr", () => {
    let s = initState(22, INV, NOW);
    s = tick(s, INV, at(10000)); // sehr lange Flaute
    expect(priceOf(s)).toBe(C.floorEuro);
    const before = s.history.length;
    s = tick(s, INV, at(11000));
    expect(priceOf(s)).toBe(C.floorEuro);
    expect(s.history.length).toBe(before);
  });

  it("Webhook (allowDrift: false) driftet nie, verarbeitet aber Verkäufe", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(48), { allowDrift: false });
    expect(priceOf(s1)).toBe(22); // kein Drift
    const s2 = tick(s0, INV - 1, at(48), { allowDrift: false });
    expect(priceOf(s2)).toBeCloseTo(22 * (1 + C.saleBumpPct), 10); // Kauf zählt
  });
});

describe("Verkauf frisst den Drift NICHT (Codex-Audit)", () => {
  it("Cron verrechnet im selben Schritt Drift UND Verkauf", () => {
    // Alter Fehler: Der Verkaufs-Zweig kehrte sofort zurück und setzte
    // lastTickAt — die verstrichene Zeit war damit gelöscht.
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, at(24)); // 24 h später, dabei 1 verkauft
    const erwartet = 22 * Math.pow(C.driftFactorPerHour, 24) * (1 + C.saleBumpPct);
    expect(priceOf(s1)).toBeCloseTo(erwartet, 8);
  });

  it("Webhook verschiebt den Drift-Anker nicht — der Cron holt die Zeit nach", () => {
    // Das eigentliche Killer-Szenario: Cron 0 h, Verkauf (Webhook) bei 23 h,
    // Cron bei 24 h. Es MÜSSEN 24 h gedriftet werden, nicht bloß eine.
    const s0 = initState(22, INV, NOW);
    const verkauft = tick(s0, INV - 1, at(23), { allowDrift: false, trustedSales: 50 });
    expect(verkauft.lastTickAt).toBe(s0.lastTickAt); // Anker unberührt!

    const nachCron = tick(verkauft, INV - 1, at(24));
    const erwartet = 22 * Math.pow(C.driftFactorPerHour, 24) * (1 + C.saleBumpPct);
    expect(priceOf(nachCron)).toBeCloseTo(erwartet, 8);
  });

  it("täglicher Verkauf + täglicher Cron treibt den Kurs NICHT an den Deckel", () => {
    // Der teuerste Fall: Vor dem Fix klebte der Kurs nach ~2 Wochen bei 25 €.
    // Ein Verkauf pro Tag liegt UNTER der Gleichgewichtsrate (~1,4/Tag),
    // der Kurs muss also langsam FALLEN.
    let s = initState(22, INV, NOW);
    let verkauft = 0;
    for (let d = 1; d <= 30; d++) {
      verkauft += 1;
      // Verkauf kurz vor dem Cron (Webhook), dann der Cron
      s = tick(s, INV - verkauft, at(d * 24 - 1), {
        allowDrift: false,
        trustedSales: 50,
      });
      s = tick(s, INV - verkauft, at(d * 24));
    }
    expect(s.soldCount).toBe(30);
    expect(priceOf(s)).toBeLessThan(22);
    expect(priceOf(s)).toBeGreaterThan(C.floorEuro);
  });
});

describe("Mengenkauf — signierter Webhook zählt voll", () => {
  it("Bestellung über 6 Tickets bewegt den Preis (trustedSales)", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 6, at(1), { allowDrift: false, trustedSales: 50 });
    expect(s1.soldCount).toBe(6);
    expect(priceOf(s1)).toBeCloseTo(22 * Math.pow(1 + C.saleBumpPct, 6), 10);
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
      tick(s0, 250, at(1), { allowDrift: false, trustedSales: 50 })
    ).toThrow(InventoryAnomalyError);
  });

  it("der Webhook glaubt der BESTELLMENGE — nicht jedem Bestandssprung", () => {
    // Die Falle: Eine Bestellung über 1 Ticket trifft ein, während gleichzeitig
    // der Bestand auf 0 zurückgesetzt wird. Ein pauschales "dem Webhook glauben
    // wir" hätte daraus 250 Verkäufe gemacht — Kurs sofort am Deckel.
    const s0 = initState(22, 250, NOW);
    expect(() =>
      tick(s0, 0, at(1), { allowDrift: false, trustedSales: 1 })
    ).toThrow(InventoryAnomalyError);

    // Die bestätigte Menge selbst zählt aber voll, auch über der Zeit-Grenze:
    const s1 = tick(s0, 250 - 30, at(1), { allowDrift: false, trustedSales: 30 });
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
    // Börse hätte bei guter Nachfrage nie hochgezählt.
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
    // Genau der Fall, den Codex als gefährlichsten fehlenden Test benannt hat.
    // Ohne absolute Obergrenze hätte die zeitskalierte Grenze nach drei Tagen
    // 576 "Verkäufe" erlaubt — ein Reset wäre als Ausverkauf durchgegangen und
    // hätte den Kurs sofort an den Deckel geschossen.
    const s0 = initState(22, 250, NOW);
    expect(() => tick(s0, 0, at(72))).toThrow(InventoryAnomalyError);
  });

  it("ein Reset schreibt NICHTS — kein Verkauf geht verloren, kein Preis springt", () => {
    // Früher wurde still die Baseline nachgezogen: Waren es echte Verkäufe,
    // waren sie DAUERHAFT weg. Jetzt bleibt der Zustand unangetastet.
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
    const verkauft = tick(s0, 249, at(1)); // 1 verkauft, Kurs oben
    const kurs = priceOf(verkauft);

    // Kollege legt 50 Tickets nach → 299
    const gezogen = rebaseline(verkauft, 299, at(2));
    expect(priceOf(gezogen)).toBe(kurs); // Kurs unberührt
    expect(gezogen.soldCount).toBe(1); // Verkauf erhalten

    // und ab jetzt zählt wieder normal weiter
    const s3 = tick(gezogen, 298, at(3));
    expect(s3.soldCount).toBe(2);
  });
});

describe("Uhr-Rücksprung rechnet Drift nicht doppelt", () => {
  it("nach Rücksprung und erneutem Vorlauf wird die Zeit nur EINMAL gedriftet", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV, at(10)); // 10 h gedriftet
    const s2 = tick(s1, INV, at(5)); // Uhr springt zurück — Anker darf NICHT mit
    expect(s2.lastTickAt).toBe(s1.lastTickAt);

    const s3 = tick(s2, INV, at(10)); // Uhr wieder bei 10 h
    // Immer noch exakt 10 h Drift — nicht 15.
    expect(priceOf(s3)).toBeCloseTo(22 * drift(10), 10);
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
    expect(priceOf(s2)).toBeCloseTo(22 * drift(1), 10); // nur Flaute

    // ein echter Kauf danach zählt ganz normal
    const s3 = tick(s2, 247, at(2));
    expect(s3.soldCount).toBe(1);
  });
});

describe("Zustand passt immer ins Metafield", () => {
  it("prepareForWrite hält den GESAMTEN Zustand unter dem Byte-Budget", () => {
    // Der alte Guard maß nur die Historie — geschrieben wird aber der ganze
    // Zustand samt Bestell-IDs. Läuft er über, friert die Börse dauerhaft ein.
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
  it("der Drift-Faktor fällt nie unter seine eigene Gültigkeitsgrenze", () => {
    // Sonst lehnt parseState den selbst erzeugten Zustand ab → Börse eingefroren
    const s0 = initState(22, INV, NOW);
    const s = tick(s0, INV, at(24 * 365 * 5)); // fünf Jahre Flaute
    expect(priceOf(s)).toBe(C.floorEuro);
    expect(() => parseState(JSON.stringify(s))).not.toThrow();
  });

  it("ein absurd hoher soldCount ergibt den Deckel, keinen NaN", () => {
    const s = { ...initState(22, INV, NOW), soldCount: 90_000 };
    expect(priceOf(s)).toBe(C.capEuro); // Infinity → geklemmt
    expect(Number.isNaN(priceOf(s))).toBe(false);
  });
});

describe("parseState — kaputter Zustand darf NIE in den Shop", () => {
  const gut = () => JSON.stringify(initState(22, INV, NOW));

  it("liest einen gültigen Zustand", () => {
    const s = parseState(gut());
    expect(priceOf(s)).toBe(22);
    expect(s.recentOrders).toEqual([]);
  });

  it("wirft bei kaputtem JSON", () => {
    expect(() => parseState("{nope")).toThrow(/kein gültiges JSON/);
  });

  it("wirft bei NaN/Infinity statt einen NaN-Preis zu schreiben", () => {
    const s = JSON.parse(gut());
    s.driftMultiplier = null; // JSON.stringify(NaN) === "null"
    expect(() => parseState(JSON.stringify(s))).toThrow(/driftMultiplier/);
  });

  it("wirft bei unlesbarem Datum (sonst wird die Drift-Mathe NaN)", () => {
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
});

describe("Audit-Runde 4 — Alt-Storno unter die Baseline (Ticket-Modus)", () => {
  // Früher warf dieser Fall eine InventoryAnomalyError und fror die Börse
  // dauerhaft ein (409 bei jedem Cron, rebaseline wirkungslos). Jetzt ist ein
  // negativer soldCount ein legitimer Zustand: weniger gültige Tickets als beim
  // Start = Kurs unter dem Startniveau.
  it("senkt den Kurs, statt die Börse einzufrieren", () => {
    const s0 = initState(22, INV, NOW, 50, "tickets");
    // Ticket-System meldet 49 gültige Tickets (ein Alt-Käufer stornierte)
    const bestand = INV - 49 + 50; // bestandAusTicketZahl
    const s1 = tick(s0, bestand, at(1), { allowDrift: false, trustedSales: 1 });
    expect(s1.soldCount).toBe(-1);
    expect(priceOf(s1)).toBeCloseTo(22 / (1 + C.saleBumpPct), 10);
    expect(s1.history.at(-1)).toMatchObject({ event: "refund", qty: 1 });
  });

  it("der nächste Verkauf hebt den Kurs exakt zurück — Symmetrie über die Baseline", () => {
    const s0 = initState(22, INV, NOW, 50, "tickets");
    const s1 = tick(s0, INV - 49 + 50, at(1), { allowDrift: false, trustedSales: 1 });
    const s2 = tick(s1, INV - 50 + 50, at(2), { allowDrift: false, trustedSales: 1 });
    expect(s2.soldCount).toBe(0);
    expect(priceOf(s2)).toBeCloseTo(22, 10);
  });
});

describe("Audit-Runde 4 — Aufstockung ist keine Massen-Rückbuchung", () => {
  it("+50 Bestand bei 60 Verkäufen hält an, statt den Kurs zu stürzen", () => {
    // Früher prüfte die Klemme nur die Verkaufs-Richtung: Dieser Sprung wurde
    // als 50 Stornos verbucht — der Kurs stürzte, obwohl nur ein Kollege
    // Tickets nachgelegt hatte.
    const s = { ...initState(22, 250, NOW), soldCount: 60 };
    expect(() => tick(s, 240, at(1))).toThrow(InventoryAnomalyError);
  });

  it("kleine Rückbuchungen über die Baseline hinaus zählen weiterhin als Storno", () => {
    // Ein Storno MIT Rückbuchung sieht im Bestand genauso aus wie eine kleine
    // Aufstockung — nicht unterscheidbar. Kleine Bewegungen bleiben Stornos.
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 252, at(1), { allowDrift: false });
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
      tick(s, 250 - 10_010, at(1), { allowDrift: false, trustedSales: 20 })
    ).toThrow(InventoryAnomalyError);
  });
});

describe("Audit-Runde 4 — parseState", () => {
  const gut = () => JSON.stringify(initState(22, INV, NOW));

  it("negativer soldCount ist ein gültiger Zustand (Alt-Storno)", () => {
    const s = JSON.parse(gut());
    s.soldCount = -3;
    expect(parseState(JSON.stringify(s)).soldCount).toBe(-3);
  });

  it("lastTickAt in der fernen Zukunft wird abgewiesen — der Drift wäre still aus", () => {
    // applyDrift läse dauerhaft eine "rückwärts laufende Uhr" und driftete nie
    // wieder. Ein Tippfehler (Jahr 2126) hätte die Börse lautlos eingefroren.
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
    // Das Metafield-Limit ist in Byte bemessen, nicht in Punkten. Der alte Test
    // maß nur die Punktzahl und benutzte kurze Werte ("sale", Preis 20) — mit
    // langen Events und ungerundeten Preisen lag der echte Zustand knapp unter
    // dem Shopify-Limit von 65.535 Byte.
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
