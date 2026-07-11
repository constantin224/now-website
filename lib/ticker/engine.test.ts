import { describe, expect, it } from "vitest";
import { TICKER_CONFIG } from "./config";
import { initState, shopPrice, tick, pruneHistory } from "./engine";

const NOW = new Date("2026-07-11T12:00:00Z");
const H = 3_600_000; // eine Stunde in ms

describe("initState", () => {
  it("übernimmt Preis + Inventar und schreibt init-Punkt", () => {
    const s = initState(22, 176, NOW);
    expect(s.price).toBe(22);
    expect(s.startInventory).toBe(176);
    expect(s.soldCount).toBe(0);
    expect(s.lastSaleAt).toBe(NOW.toISOString());
    expect(s.history).toEqual([
      { t: NOW.toISOString(), price: 22, event: "init" },
    ]);
  });
});

describe("tick — Verkäufe", () => {
  it("hebt Preis um 2 € pro neu verkauftem Ticket", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 173, new Date(NOW.getTime() + H)); // 3 verkauft
    expect(s1.price).toBe(22 + 3 * TICKER_CONFIG.saleBumpEuro);
    expect(s1.soldCount).toBe(3);
    expect(s1.lastSaleAt).toBe(new Date(NOW.getTime() + H).toISOString());
    expect(s1.history.at(-1)).toMatchObject({ price: 22 + 3 * TICKER_CONFIG.saleBumpEuro, event: "sale" });
  });

  it("deckelt am konfigurierten Deckel", () => {
    const s0 = initState(TICKER_CONFIG.capEuro - 2, 176, NOW);
    const s1 = tick(s0, 170, NOW); // 6 verkauft → +12 → Deckel
    expect(s1.price).toBe(TICKER_CONFIG.capEuro);
  });

  it("mutiert den alten State nicht", () => {
    const s0 = initState(22, 176, NOW);
    tick(s0, 173, NOW);
    expect(s0.price).toBe(22);
    expect(s0.history).toHaveLength(1);
  });
});

describe("shopPrice", () => {
  it("rundet auf 10 Cent", () => {
    expect(shopPrice(21.9412)).toBe(21.9);
    expect(shopPrice(21.96)).toBe(22);
  });
  it("klemmt auf Boden und Deckel", () => {
    expect(shopPrice(0.8)).toBe(TICKER_CONFIG.floorEuro);
    expect(shopPrice(777)).toBe(TICKER_CONFIG.capEuro);
  });
});

describe("tick — Drift", () => {
  it("kein Drift innerhalb der 24h-Gnadenfrist", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 176, new Date(NOW.getTime() + 23 * H));
    expect(s1.price).toBe(22);
    expect(s1.history).toHaveLength(1); // kein neuer Punkt
  });

  it("nach Gnadenfrist: −0,5 % pro Tick", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 176, new Date(NOW.getTime() + 25 * H));
    expect(s1.price).toBeCloseTo(22 * TICKER_CONFIG.driftFactorPerHour, 10);
    expect(s1.history.at(-1)).toMatchObject({ event: "drift" });
  });

  it("Drift wird unten immer langsamer und stoppt am Boden", () => {
    let s = initState(TICKER_CONFIG.floorEuro + 0.01, 176, NOW);
    let t = NOW.getTime() + 25 * H;
    for (let i = 0; i < 10; i++) {
      s = tick(s, 176, new Date(t));
      t += H;
    }
    expect(s.price).toBe(TICKER_CONFIG.floorEuro); // geklemmt, nie darunter
  });

  it("Verkauf gewinnt gegen Drift im selben Tick", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 175, new Date(NOW.getTime() + 48 * H));
    expect(s1.price).toBe(22 + TICKER_CONFIG.saleBumpEuro); // +Bump, KEIN Drift zusätzlich
    expect(s1.history.at(-1)).toMatchObject({ event: "sale" });
  });

  it("Drift am Boden erzeugt keine neuen History-Punkte", () => {
    const s0 = { ...initState(TICKER_CONFIG.floorEuro, 176, NOW) };
    const s1 = tick(s0, 176, new Date(NOW.getTime() + 30 * H));
    expect(s1.history).toHaveLength(1); // Preis unverändert → kein Punkt
  });
});

describe("tick — Rebaseline bei Storno (Evey-Regel)", () => {
  it("Inventar-Erhöhung senkt soldCount, ändert Preis nicht", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 174, NOW); // 2 verkauft → 26 €
    const s2 = tick(s1, 175, new Date(NOW.getTime() + H)); // 1 Storno
    expect(s2.soldCount).toBe(1);
    expect(s2.price).toBe(22 + 2 * TICKER_CONFIG.saleBumpEuro); // Preis bleibt
    expect(s2.history).toHaveLength(s1.history.length); // kein neuer Punkt
    // Folgeverkauf wird wieder korrekt erkannt:
    const s3 = tick(s2, 174, new Date(NOW.getTime() + 2 * H));
    expect(s3.price).toBe(22 + 3 * TICKER_CONFIG.saleBumpEuro);
    expect(s3.soldCount).toBe(2);
  });
});

describe("tick — allowDrift-Flag", () => {
  it("allowDrift: false unterdrückt Drift (Webhook-Schutz)", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 176, new Date(NOW.getTime() + 48 * H), { allowDrift: false });
    expect(s1).toBe(s0); // identisches Objekt, kein Drift
  });

  it("allowDrift: false lässt Verkäufe + Rebaseline trotzdem durch", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 175, NOW, { allowDrift: false });
    expect(s1.price).toBe(22 + TICKER_CONFIG.saleBumpEuro);
  });
});

describe("pruneHistory", () => {
  const D = 24 * H;

  it("behält init- und sale-Punkte immer", () => {
    const old = new Date(NOW.getTime() - 30 * D).toISOString();
    const hist = [
      { t: old, price: 22, event: "init" as const },
      { t: old, price: 24, event: "sale" as const },
    ];
    expect(pruneHistory(hist, NOW)).toHaveLength(2);
  });

  it("dünnt drift-Punkte älter als 7 Tage auf 6h-Raster aus", () => {
    // 24 stündliche Drift-Punkte, alle 10 Tage alt → nur jeder 6. bleibt
    const base = NOW.getTime() - 10 * D;
    const hist = Array.from({ length: 24 }, (_, i) => ({
      t: new Date(base + i * H).toISOString(),
      price: 20 - i * 0.1,
      event: "drift" as const,
    }));
    const pruned = pruneHistory(hist, NOW);
    expect(pruned.length).toBe(4); // 24h / 6h-Raster
  });

  it("lässt junge drift-Punkte (< 7 Tage) unangetastet", () => {
    const base = NOW.getTime() - 2 * D;
    const hist = Array.from({ length: 24 }, (_, i) => ({
      t: new Date(base + i * H).toISOString(),
      price: 20,
      event: "drift" as const,
    }));
    expect(pruneHistory(hist, NOW)).toHaveLength(24);
  });
});
