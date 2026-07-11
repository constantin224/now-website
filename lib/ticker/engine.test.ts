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
    expect(s1.price).toBeCloseTo(22 * 0.995, 10);
    expect(s1.history.at(-1)).toMatchObject({ event: "drift" });
  });

  it("Drift wird unten immer langsamer und stoppt am Boden 1,50 €", () => {
    let s = initState(1.51, 176, NOW);
    let t = NOW.getTime() + 25 * H;
    for (let i = 0; i < 10; i++) {
      s = tick(s, 176, new Date(t));
      t += H;
    }
    expect(s.price).toBe(1.5); // geklemmt, nie darunter
  });

  it("Verkauf gewinnt gegen Drift im selben Tick", () => {
    const s0 = initState(22, 176, NOW);
    const s1 = tick(s0, 175, new Date(NOW.getTime() + 48 * H));
    expect(s1.price).toBe(24); // +2, KEIN Drift zusätzlich
    expect(s1.history.at(-1)).toMatchObject({ event: "sale" });
  });

  it("Drift am Boden erzeugt keine neuen History-Punkte", () => {
    const s0 = { ...initState(1.5, 176, NOW) };
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
    expect(s2.price).toBe(26); // Preis bleibt
    expect(s2.history).toHaveLength(s1.history.length); // kein neuer Punkt
    // Folgeverkauf wird wieder korrekt erkannt:
    const s3 = tick(s2, 174, new Date(NOW.getTime() + 2 * H));
    expect(s3.price).toBe(28);
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
    expect(s1.price).toBe(24);
  });
});
