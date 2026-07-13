import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import {
  hasSeenOrder,
  initState,
  parseState,
  priceOf,
  pruneHistory,
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
const WEBHOOK = { allowDrift: false, trustSales: true } as const;
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

  it("deckelt am Cap und schreibt dort keine leeren History-Punkte mehr", () => {
    // Verkäufe kommen einzeln (Webhook pro Bestellung) — bis über den Deckel
    let s = initState(22, INV, NOW);
    const toCap =
      Math.ceil(Math.log(C.capEuro / 22) / Math.log(1 + C.saleBumpPct)) + 3;
    for (let i = 1; i <= toCap; i++) s = tick(s, INV - i, at(i));
    expect(priceOf(s)).toBe(C.capEuro);

    const before = s.history.length;
    const s2 = tick(s, INV - toCap - 1, at(toCap + 1)); // Verkauf am Deckel
    expect(priceOf(s2)).toBe(C.capEuro);
    expect(s2.history.length).toBe(before); // kein flacher Punkt
    expect(s2.soldCount).toBe(toCap + 1); // gezählt wird trotzdem
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

describe("Inventar-Manipulation — kein Preissprung", () => {
  // Der Cron driftet in jedem Lauf die verstrichene Zeit. Die Anomalie selbst
  // darf den Kurs aber NICHT bewegen: soldCount bleibt, der Preis folgt allein
  // der Flaute. Geprüft wird also gegen den reinen Drift-Wert — nicht gegen
  // Stillstand (das würde den alten Bug wieder einzementieren).

  it("Aufstockung (Kollege legt Tickets nach) bewegt den Preis nicht", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 250, at(1)); // 176 → 250
    expect(s1.soldCount).toBe(0);
    expect(priceOf(s1)).toBeCloseTo(22 * drift(1), 10);
    // danach zählt ein echter Verkauf wieder korrekt
    const s2 = tick(s1, 249, at(2));
    expect(s2.soldCount).toBe(1);
    expect(priceOf(s2)).toBeCloseTo(22 * drift(2) * (1 + C.saleBumpPct), 10);
  });

  it("Admin senkt Inventar massiv → KEIN Preissprung (Klemme)", () => {
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 200, at(1)); // 50 auf einmal weg = Korrektur, kein Kauf
    expect(s1.soldCount).toBe(0);
    expect(priceOf(s1)).toBeCloseTo(22 * drift(1), 10); // vorher: Sprung auf den Deckel!
    expect(s1.history.at(-1)).toMatchObject({ event: "rebaseline" });
    // echte Verkäufe danach zählen wieder
    const s2 = tick(s1, 199, at(2));
    expect(priceOf(s2)).toBeCloseTo(22 * drift(2) * (1 + C.saleBumpPct), 10);
  });

  it("Bestands-Tracking aus (inventoryQuantity = 0) → kein Deckel-Sprung", () => {
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 0, at(1)); // Tracking aus → API liefert 0
    expect(s1.soldCount).toBe(0);
    expect(priceOf(s1)).toBeCloseTo(22 * drift(1), 10);
    const s2 = tick(s1, 250, at(2)); // Tracking wieder an
    expect(s2.soldCount).toBe(0);
    expect(priceOf(s2)).toBeCloseTo(22 * drift(2), 10);
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
    const verkauft = tick(s0, INV - 1, at(23), { allowDrift: false, trustSales: true });
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
        trustSales: true,
      });
      s = tick(s, INV - verkauft, at(d * 24));
    }
    expect(s.soldCount).toBe(30);
    expect(priceOf(s)).toBeLessThan(22);
    expect(priceOf(s)).toBeGreaterThan(C.floorEuro);
  });
});

describe("Mengenkauf — signierter Webhook zählt voll", () => {
  it("Bestellung über 6 Tickets bewegt den Preis (trustSales)", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 6, at(1), { allowDrift: false, trustSales: true });
    expect(s1.soldCount).toBe(6);
    expect(priceOf(s1)).toBeCloseTo(22 * Math.pow(1 + C.saleBumpPct, 6), 10);
  });

  it("aber der Cron bleibt misstrauisch: Inventar-Sturz um 6 ist eine Korrektur", () => {
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 6, at(1)); // ohne trustSales
    expect(s1.soldCount).toBe(0);
    expect(s1.history.at(-1)).toMatchObject({ event: "rebaseline" });
  });

  it("auch mit trustSales ist eine Aufstockung keine Verkaufszahl", () => {
    const s0 = initState(22, 100, NOW);
    const s1 = tick(s0, 250, at(1), { allowDrift: false, trustSales: true });
    expect(s1.soldCount).toBe(0);
    expect(priceOf(s1)).toBe(22);
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
