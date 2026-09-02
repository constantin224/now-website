import { describe, expect, it } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import {
  initState,
  nachtrag,
  NachtragError,
  parseState,
  prepareForWrite,
  priceOf,
  pruneHistory,
  shopPrice,
  tick,
  type HistoryPoint,
  type TickerState,
} from "./engine";
import live from "./fixtures/boerse-live-2026-09-02.json";

/**
 * Sättigung an Deckel und Boden (02.09.2026).
 *
 * Der Befund vom 31.08./02.09.: Der rohe Kurs `22 − Verkäufe + Tage` lief am
 * Deckel ungebremst weiter (Tag 18,7 → roh 31,7 €). Käufe senkten ihn zwar,
 * aber unsichtbar unter der Klemme — drei Kaufwellen am Deckel (26.08., 28.08.,
 * 01.09.) bewegten den sichtbaren Preis um exakt 0 €. Das widerspricht dem
 * Versprechen der Seite („dein Kauf macht's für alle billiger").
 *
 * Neu: Was an Deckel oder Boden verpufft, wird als `saettigungEuro`
 * abgezogen — der rohe Kurs bleibt EXAKT am Rand. Der nächste Kauf am Deckel
 * ist sofort 1 € tiefer sichtbar, die nächste Flaute am Boden sofort 1 €/Tag
 * höher. Constantins Vorgabe 02.09.: „Boden soll genauso funktionieren."
 */

const NOW = new Date("2026-07-13T12:00:00Z");
const H = 3_600_000;
const D = 24 * H;
const INV = 250;
const at = (h: number) => new Date(NOW.getTime() + h * H);
const KAUF = (n: number) => ({ advanceAnchor: false, trustedSales: n });

describe("Sättigung am Deckel — ein Kauf am Deckel ist sofort sichtbar", () => {
  it("initState startet im Sättigungsmodell (saettigungEuro 0)", () => {
    expect(initState(22, INV, NOW).saettigungEuro).toBe(0);
  });

  it("lange Flaute: der Überhang wird geschluckt, roh bleibt exakt am Deckel", () => {
    const s = tick(initState(22, INV, NOW), INV, at(10 * 24)); // roh 32 €
    expect(priceOf(s, at(10 * 24))).toBe(C.capEuro);
    // 32 − 25 = 7 € verpufft
    expect(s.saettigungEuro).toBeCloseTo(32 - C.capEuro, 6);
  });

  it("Kauf am Deckel senkt sofort um 1 € — auch wenn Kauf und Flaute im selben Tick landen", () => {
    const s = tick(initState(22, INV, NOW), INV - 1, at(10 * 24), { trustedSales: 1 });
    expect(priceOf(s, at(10 * 24))).toBeCloseTo(C.capEuro - 1, 6);
  });

  it("Kauf nach Tagen am Deckel: 25 → 24, nicht 25 → 25", () => {
    let s = tick(initState(22, INV, NOW), INV, at(10 * 24));
    s = tick(s, INV, at(15 * 24)); // weitere 5 Tage Flaute am Deckel
    expect(priceOf(s, at(15 * 24))).toBe(C.capEuro);
    s = tick(s, INV - 1, at(15 * 24 + 1 / 12), { trustedSales: 1 }); // 5 min später ein Kauf
    expect(shopPrice(priceOf(s, at(15 * 24 + 1 / 12)))).toBe(C.capEuro - 1);
  });

  it("Storno am Deckel verpufft — der nächste Kauf ist trotzdem sichtbar", () => {
    let s = tick(initState(22, INV, NOW), INV, at(10 * 24));
    s = tick(s, INV + 1, at(10 * 24 + 1 / 12)); // Alt-Storno: soldCount −1, roh 26
    expect(priceOf(s, at(10 * 24 + 1 / 12))).toBe(C.capEuro);
    s = tick(s, INV + 1, at(10 * 24 + 2 / 12)); // nächster Tick schluckt den Rest
    s = tick(s, INV, at(10 * 24 + 3 / 12), { trustedSales: 1 }); // Kauf
    expect(shopPrice(priceOf(s, at(10 * 24 + 3 / 12)))).toBe(C.capEuro - 1);
  });

  it("auch der Webhook-Pfad (advanceAnchor: false) schluckt den Überhang vor dem Kauf", () => {
    const s = tick(initState(22, INV, NOW), INV - 1, at(10 * 24), KAUF(1));
    expect(priceOf(s, at(10 * 24))).toBeCloseTo(C.capEuro - 1, 6);
    expect(s.lastTickAt).toBe(NOW.toISOString()); // Anker unangetastet
  });

  it("wiederholte Ticks am Deckel ändern nichts — der Zustand bleibt identisch", () => {
    const s1 = tick(initState(22, INV, NOW), INV, at(10 * 24));
    const s2 = tick(s1, INV, at(10 * 24));
    expect(s2).toBe(s1); // dieselbe Referenz → nichts geschrieben
  });
});

describe("Sättigung am Boden — Flaute nach der Kaufwelle hebt sofort", () => {
  it("Kaufwelle drückt roh unter den Boden: Boden — einen Tag später 9 €, nicht weiter Boden", () => {
    let s = tick(initState(22, INV, NOW), INV - 20, NOW, KAUF(20)); // roh 2 €
    expect(priceOf(s, NOW)).toBe(C.floorEuro);
    // Der Kauf-Tick sättigt selbst — 5 min später zählen schon 5 min Flaute (+0,35 Cent)
    s = tick(s, INV - 20, at(1 / 12));
    expect(priceOf(s, at(1 / 12))).toBeCloseTo(C.floorEuro + 1 / 288, 6);
    expect(priceOf(s, at(24))).toBeCloseTo(C.floorEuro + 1, 6);
  });

  it("Storno am Boden hebt sofort sichtbar", () => {
    let s = tick(initState(22, INV, NOW), INV - 20, NOW, KAUF(20));
    s = tick(s, INV - 20, at(1 / 12));
    s = tick(s, INV - 19, at(2 / 12)); // ein Storno
    expect(shopPrice(priceOf(s, at(2 / 12)))).toBe(C.floorEuro + 1);
  });

  it("Cron-Ausfall nach der Kaufwelle: die Zeit geht nicht verloren (Codex-Review Punkt 2)", () => {
    // Der Kauf-Tick sättigt selbst — ein Tag ohne Cron danach ist ein Tag Flaute, kein „zurück auf 8".
    let s = tick(initState(22, INV, NOW), INV - 20, NOW, KAUF(20)); // roh 2 € → Boden, sofort gesättigt
    expect(s.saettigungEuro).toBeCloseTo(2 - C.floorEuro, 9);
    s = tick(s, INV - 20, at(24)); // erster Tick erst einen Tag später
    expect(priceOf(s, at(24))).toBeCloseTo(C.floorEuro + 1, 9);
    // Spiegelbild am Deckel: Storno über den Deckel, dann ein Tag Cron-Ausfall, dann ein Kauf
    let d = tick(initState(22, INV, NOW), INV, at(10 * 24)); // am Deckel
    d = tick(d, INV + 1, at(10 * 24 + 1 / 12)); // Alt-Storno → roh 26 → sofort auf 25 gesättigt
    expect(d.saettigungEuro).toBeCloseTo(32 - C.capEuro + 1 + 1 / 288, 6);
    d = tick(d, INV, at(11 * 24), { trustedSales: 1 }); // ein Tag später ein Kauf
    expect(priceOf(d, at(11 * 24))).toBeCloseTo(C.capEuro - 1, 9);
  });
});

describe("Alt-Zustand ohne saettigungEuro: nichts ändert sich bis zum Nachtrag", () => {
  const legacy = (): TickerState => ({ ...initState(22, INV, NOW), saettigungEuro: null });

  it("parseState liest ein fehlendes Feld als null (Alt-Zustand), ein Feld als Zahl", () => {
    const ohne = JSON.parse(JSON.stringify(initState(22, INV, NOW)));
    delete ohne.saettigungEuro;
    expect(parseState(JSON.stringify(ohne)).saettigungEuro).toBeNull();
    expect(parseState(JSON.stringify({ ...ohne, saettigungEuro: null })).saettigungEuro).toBeNull();
    expect(parseState(JSON.stringify({ ...ohne, saettigungEuro: 6.4378 })).saettigungEuro).toBe(6.4378);
    expect(() => parseState(JSON.stringify({ ...ohne, saettigungEuro: "7" }))).toThrow(/saettigungEuro/);
  });

  it("der Alt-Zustand rechnet weiter wie bisher — Kauf am Deckel bleibt unsichtbar, Feld bleibt null", () => {
    let s = tick(legacy(), INV, at(10 * 24));
    expect(s.saettigungEuro).toBeNull();
    s = tick(s, INV - 1, at(10 * 24), { trustedSales: 1 });
    expect(priceOf(s, at(10 * 24))).toBe(C.capEuro); // roh 31 → Klemme
    expect(s.saettigungEuro).toBeNull();
  });
});

describe("Stufen im Chart: Sale-/Refund-Punkte tragen den Preis davor (von)", () => {
  it("ein Kauf schreibt den Preis unmittelbar vor dem Kauf mit", () => {
    const s = tick(initState(22, INV, NOW), INV - 2, at(12), KAUF(2));
    expect(s.history.at(-1)).toMatchObject({ event: "sale", qty: 2, von: 22.5, price: 20.5 });
  });

  it("parseState behält von und wirft unbrauchbare Werte still weg", () => {
    const s = tick(initState(22, INV, NOW), INV - 1, NOW, KAUF(1));
    const roundtrip = parseState(JSON.stringify(s));
    expect(roundtrip.history.at(-1)?.von).toBe(22);
    const kaputt = JSON.parse(JSON.stringify(s));
    kaputt.history[1].von = "22";
    expect(parseState(JSON.stringify(kaputt)).history[1].von).toBeUndefined();
  });
});

describe("nachtrag — die Historie unter dem Sättigungsmodell nachrechnen", () => {
  const liveState = () => parseState(JSON.stringify(live));
  const JETZT = new Date("2026-09-02T05:00:00Z");

  it("Live-Zustand 02.09.: alle drei Deckel-Käufe werden Stufen, Kurs heute ≈ 23,31 €", () => {
    const s = liveState();
    expect(s.saettigungEuro).toBeNull(); // der echte Alt-Zustand
    const n = nachtrag(s, JETZT);

    // Kauf 01.09. 21:35 (2 Tickets) → 23 €, seither 7,42 h Flaute → 23,31 €
    const seit = (JETZT.getTime() - new Date("2026-09-01T21:35:00.732Z").getTime()) / D;
    expect(priceOf(n, JETZT)).toBeCloseTo(23 + seit * C.riseEuroPerDay, 4);
    expect(shopPrice(priceOf(n, JETZT))).toBe(23.3);

    const punkt = (t: string) => n.history.find((p) => p.t === t)!;
    expect(punkt("2026-08-26T12:50:00.331Z")).toMatchObject({ event: "sale", qty: 1, von: 25, price: 24 });
    expect(punkt("2026-08-28T21:25:00.414Z")).toMatchObject({ event: "sale", qty: 2, von: 25, price: 23 });
    expect(punkt("2026-09-01T21:35:00.732Z")).toMatchObject({ event: "sale", qty: 2, von: 25, price: 23 });

    // Rampe zurück zum Deckel: nach dem 1er-Kauf genau einen Tag später wieder 25
    const rampe = n.history.find(
      (p) => p.event === "drift" && p.t > "2026-08-26T12:50" && p.t < "2026-08-28T21:25"
    );
    expect(rampe).toBeDefined();
    expect(rampe!.price).toBe(C.capEuro);
    expect(Math.abs(new Date(rampe!.t).getTime() - new Date("2026-08-27T12:50:00.331Z").getTime())).toBeLessThan(2000);

    // Vor dem Deckel bleibt alles, wie es war
    expect(n.history.slice(0, 9)).toEqual(s.history.slice(0, 9));
    // Historie bleibt chronologisch, Zustand bleibt lesbar
    const ts = n.history.map((p) => new Date(p.t).getTime());
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(() => parseState(JSON.stringify(n), JETZT)).not.toThrow();
    expect(n.soldCount).toBe(s.soldCount);
    expect(n.lastTickAt).toBe(s.lastTickAt);
  });

  it("nach dem Nachtrag ist ein Kauf am Deckel sofort sichtbar", () => {
    const n = nachtrag(liveState(), JETZT);
    // 2 Tage später wäre der Kurs wieder am Deckel …
    const spaeter = new Date(JETZT.getTime() + 2 * D);
    let s = tick(n, 250 - 9, spaeter); // Bestand passend zu soldCount 9 (startInventory 250)
    expect(priceOf(s, spaeter)).toBe(C.capEuro);
    // … und der nächste Kauf senkt sichtbar
    s = tick(s, 250 - 10, spaeter, { trustedSales: 1 });
    expect(priceOf(s, spaeter)).toBe(C.capEuro - 1);
  });

  it("zweiter Nachtrag wird verweigert (Zustand läuft schon im Sättigungsmodell)", () => {
    const n = nachtrag(liveState(), JETZT);
    expect(() => nachtrag(n, JETZT)).toThrow(NachtragError);
    try {
      nachtrag(n, JETZT);
    } catch (e) {
      expect((e as NachtragError).code).toBe("bereits");
    }
  });

  it("verweigert, wenn die Verkaufs-Historie nicht zum Verkaufsstand passt", () => {
    const s = liveState();
    const ohne = { ...s, history: s.history.filter((p) => p.t !== "2026-08-28T21:25:00.414Z") };
    expect(() => nachtrag(ohne, JETZT)).toThrow(/geht nicht auf/);
  });

  it("nie gesättigte Börse: Historie bleibt identisch, saettigungEuro wird 0", () => {
    // Alt-Modell simulieren (saettigungEuro null = altes Verhalten)
    let s: TickerState = { ...initState(22, INV, NOW), saettigungEuro: null };
    for (let h = 1; h <= 48; h++) {
      const verkauft = h >= 10 ? (h >= 30 ? 2 : 1) : 0;
      s = tick(s, INV - verkauft, at(h), { trustedSales: 1 });
    }
    const n = nachtrag(s, at(48));
    expect(n.saettigungEuro).toBeCloseTo(0, 9);
    expect(n.history.map((p) => p.price)).toEqual(s.history.map((p) => p.price));
    expect(n.history.filter((p) => p.event === "sale").every((p) => typeof p.von === "number")).toBe(true);
  });

  it("weggeprunte Alt-Verkäufe werden aus dem Preis rekonstruiert", () => {
    let s: TickerState = { ...initState(22, INV, NOW), saettigungEuro: null };
    for (let h = 1; h <= 48; h++) {
      const verkauft = h >= 10 ? (h >= 30 ? 2 : 1) : 0;
      s = tick(s, INV - verkauft, at(h), { trustedSales: 1 });
    }
    // Der erste Sale-Punkt ist weg (6h-Raster hat ihn geopfert) — die Preise
    // der Punkte danach verraten den Verkaufsstand trotzdem.
    const ersterSale = s.history.findIndex((p) => p.event === "sale");
    const gekuerzt = { ...s, history: s.history.filter((_, i) => i !== ersterSale) };
    const n = nachtrag(gekuerzt, at(48));
    expect(n.saettigungEuro).toBeCloseTo(0, 9);
    expect(priceOf(n, at(48))).toBeCloseTo(priceOf(s, at(48)), 9);
  });
});

describe("Historie: Ereignisse überleben, Drift bleibt sparsam", () => {
  it("Drift-Punkt nur, wenn sich der SHOP-Preis (10-Cent-Raster) bewegt hat", () => {
    let s = initState(22, INV, NOW);
    s = tick(s, INV, at(1 / 12)); // 5 min → +0,35 Cent → kein Punkt
    expect(s.history).toHaveLength(1);
    s = tick(s, INV, at(3)); // 3 h → +12,5 Cent → 22,1 → Punkt
    expect(s.history).toHaveLength(2);
    expect(s.history[1].event).toBe("drift");
  });

  it("alte Sale-Punkte überleben das 6h-Raster, Drift daneben wird ausgedünnt", () => {
    const alt = NOW.getTime() - 10 * D;
    const hist: HistoryPoint[] = [
      { t: new Date(alt).toISOString(), price: 22, event: "init" },
      { t: new Date(alt + 1 * H).toISOString(), price: 22.05, event: "drift" },
      { t: new Date(alt + 2 * H).toISOString(), price: 21.08, event: "sale", qty: 1, von: 22.08 },
      { t: new Date(alt + 3 * H).toISOString(), price: 21.12, event: "drift" },
      { t: new Date(alt + 4 * H).toISOString(), price: 20.16, event: "sale", qty: 1, von: 21.16 },
      { t: new Date(alt + 5 * H).toISOString(), price: 20.2, event: "drift" },
    ];
    const pruned = pruneHistory(hist, NOW);
    expect(pruned.filter((p) => p.event === "sale")).toHaveLength(2);
    expect(pruned.filter((p) => p.event === "drift")).toHaveLength(1);
  });

  it("prepareForWrite opfert alte Drift-Punkte, bevor ein einziger Verkauf fällt", () => {
    // 100 Verkäufe zwischen 1500 jungen Drift-Punkten — weit über Byte-Budget UND Punktelimit
    const hist: HistoryPoint[] = [{ t: at(-200).toISOString(), price: 22, event: "init" }];
    for (let i = 1; i <= 1600; i++) {
      const t = new Date(NOW.getTime() - 100 * H + i * (100 * H) / 1600).toISOString();
      hist.push(
        i % 16 === 0
          ? { t, price: 20.1234, event: "sale", qty: 1, von: 21.1234 }
          : { t, price: 21.1234, event: "drift" }
      );
    }
    const s: TickerState = { ...initState(22, INV, at(-200)), history: hist };
    const fertig = prepareForWrite(s, NOW);
    expect(fertig.history.filter((p) => p.event === "sale")).toHaveLength(100);
    expect(fertig.history.length).toBeLessThanOrEqual(C.historyMaxPoints);
    expect(new TextEncoder().encode(JSON.stringify(fertig)).length).toBeLessThanOrEqual(C.metafieldMaxBytes);
    expect(fertig.history[0].event).toBe("init");
  });
});
