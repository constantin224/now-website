import { describe, expect, it } from "vitest";
import { initState, shopPrice, tick } from "./engine";

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
    expect(s1.price).toBe(28);
    expect(s1.soldCount).toBe(3);
    expect(s1.lastSaleAt).toBe(new Date(NOW.getTime() + H).toISOString());
    expect(s1.history.at(-1)).toMatchObject({ price: 28, event: "sale" });
  });

  it("deckelt bei 50 €", () => {
    const s0 = initState(48, 176, NOW);
    const s1 = tick(s0, 170, NOW); // 6 verkauft → +12 → Deckel
    expect(s1.price).toBe(50);
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
    expect(shopPrice(0.8)).toBe(1.5);
    expect(shopPrice(77)).toBe(50);
  });
});
