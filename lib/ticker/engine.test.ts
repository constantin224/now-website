import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import { initState, priceOf, pruneHistory, shopPrice, tick } from "./engine";

const NOW = new Date("2026-07-13T12:00:00Z");
const H = 3_600_000; // eine Stunde in ms
const INV = 250; // Start-Inventar
const at = (h: number) => new Date(NOW.getTime() + h * H);

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
    const s1 = tick(s0, INV - 3, at(1)); // 3 verkauft
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
    const s0 = initState(22, INV, NOW);
    const s1 = tick(s0, INV - 1, at(1)); // Kauf
    expect(priceOf(s1)).toBeCloseTo(22 * (1 + C.saleBumpPct), 10);
    const s2 = tick(s1, INV, at(2)); // Storno mit Restock
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

describe("Inventar-Manipulation — Preis bleibt unangetastet", () => {
  it("Aufstockung (Kollege legt Tickets nach) bewegt den Preis nicht", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 250, at(1)); // 176 → 250
    expect(priceOf(s1)).toBe(22);
    expect(s1.soldCount).toBe(0);
    // danach zählt ein echter Verkauf wieder korrekt
    const s2 = tick(s1, 249, at(2));
    expect(s2.soldCount).toBe(1);
    expect(priceOf(s2)).toBeCloseTo(22 * (1 + C.saleBumpPct), 10);
  });

  it("Admin senkt Inventar massiv → KEIN Preissprung (Klemme)", () => {
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 200, at(1)); // 50 auf einmal weg = Korrektur, kein Kauf
    expect(priceOf(s1)).toBe(22); // vorher: Sprung auf den Deckel!
    expect(s1.history.at(-1)).toMatchObject({ event: "rebaseline" });
    // echte Verkäufe danach zählen wieder
    const s2 = tick(s1, 199, at(2));
    expect(priceOf(s2)).toBeCloseTo(22 * (1 + C.saleBumpPct), 10);
  });

  it("Bestands-Tracking aus (inventoryQuantity = 0) → kein Deckel-Sprung", () => {
    const s0 = initState(22, 250, NOW);
    const s1 = tick(s0, 0, at(1)); // Tracking aus → API liefert 0
    expect(priceOf(s1)).toBe(22);
    const s2 = tick(s1, 250, at(2)); // Tracking wieder an
    expect(priceOf(s2)).toBe(22);
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
    expect(JSON.stringify(pruned).length).toBeLessThan(60_000);
  });
});
