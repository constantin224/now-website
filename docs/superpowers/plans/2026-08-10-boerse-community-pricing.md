# Community-Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preismodell der Ticket-Börse umkehren: jedes verkaufte Ticket −1 €, jeder Tag +1 € (kontinuierlich), Boden 8 €, Deckel 30 € — additiv statt multiplikativ, Zeit-Anteil aus `startAtIso` abgeleitet.

**Architecture:** Engine bleibt pure-function + abgeleiteter Preis; `driftMultiplier`-Akkumulator entfällt, `priceOf` bekommt `now` als Parameter (Zeit kommt von außen — bestehende Philosophie). Alle Naht-Schutzschichten (Klemmen, CAS, Anomalie-409, Quelle-im-State, Dedup) bleiben wörtlich unangetastet.

**Tech Stack:** Next.js App Router, TypeScript, Vitest (`npm test`), next-intl (`messages/de.json`/`en.json`).

**Spec:** `docs/superpowers/specs/2026-08-10-boerse-community-pricing-design.md`

## Global Constraints

- Formel: `Preis = clamp( startPrice − 1 € × soldCount + 1 € × TageSeitStart, 8, 30 )`, Shop-Rundung auf 10 Cent bleibt.
- Kernbotschaft (Copy): „Jedes Ticket: −1 €. Jeder Tag: +1 €. Ein Ticket pro Tag hält den Preis."
- NICHT anfassen: Klemmen-Logik (`erlaubteVerkaeufe`, `maxSalesPerTick/PerHour/Absolute`), Anomalie-409 + `?rebaseline`/`?reconcile`, Bestell-Dedup, CAS/`compareDigest`, `parseState`-Strenge (nur die Feld-Liste ändert sich), `prepareForWrite`, Quelle-im-State, Start-Gate, Türöffnungs-Stopp, HMAC, `TICKER_ENABLED`, Evey-Regel, `boerse-golive.sh`-Ablauf.
- Rechtlich: nie „Rabatt/Statt-Preis"-Formulierungen in der Copy.
- Kommentare Deutsch, bestehender Kommentar-Stil (erklärt WARUM, verweist auf Audit-Runden).
- Deploy NICHT in diesem Plan — kommt mit `boerse-golive.sh`.

---

### Task 1: Engine + Config + engine.test.ts

**Files:**
- Modify: `lib/ticker/config.ts`
- Modify: `lib/ticker/engine.ts`
- Test: `lib/ticker/engine.test.ts`

**Interfaces (Produces — alle späteren Tasks verlassen sich darauf):**
- `TickerState`: Feld `driftMultiplier: number` ENTFÄLLT, neues Pflichtfeld `startAtIso: string` (ISO, beim Start eingefroren). Rest unverändert.
- `priceOf(state: TickerState, now: Date): number` — **neuer zweiter Parameter, Pflicht.**
- `initState(startPriceEuro, currentInventory, now, startTickets?, quelle?)` — Signatur unverändert, setzt intern `startAtIso: now.toISOString()`.
- `tick(state, currentInventory, now, opts)` — Signatur unverändert. `opts.allowDrift: false` heißt jetzt nur noch: `lastTickAt`-Anker nicht verschieben, keinen Drift-History-Punkt schreiben. Der PREIS enthält die verstrichene Zeit immer (abgeleitet).
- Config: `saleDropEuro: 1.0`, `riseEuroPerDay: 1.0`, `floorEuro: 8.0`, `capEuro: 30.0`; `saleBumpPct` und `driftFactorPerHour` GELÖSCHT.
- `MIN_DRIFT` ENTFÄLLT (Konstante + Export weg).

- [ ] **Step 1: engine.test.ts umbauen — neue Modell-Tests schreiben, alte Preis-Mathe-Erwartungen umrechnen**

Bestehende Tests behalten ihre ABSICHT (parseState-Strenge, Klemme, Dedup, Anomalie, History-Pruning, prepareForWrite — alles bleibt); nur:
1. Fixtures: `driftMultiplier: 1` → `startAtIso: <ISO>` (gleicher Zeitpunkt wie `lastTickAt` der Fixture, sofern der Test nichts anderes braucht).
2. Preis-Erwartungen linear umrechnen (`22 × 1,01ⁿ` → `22 − n`; Drift-Erwartungen → `+ Tage`).
3. `priceOf(state)`-Aufrufe → `priceOf(state, now)`.

Neue Kern-Tests (zusätzlich, ans Ende von engine.test.ts):

```ts
describe("Community-Pricing: additives Modell", () => {
  const T0 = new Date("2026-08-10T12:00:00Z");
  const H = 3_600_000;

  it("1 Verkauf senkt um exakt 1 €, Storno hebt exakt zurück", () => {
    let s = initState(22, 250, T0);
    s = tick(s, 249, T0, { allowDrift: false, trustedSales: 1 });
    expect(priceOf(s, T0)).toBe(21);
    s = tick(s, 250, T0, { allowDrift: false });
    expect(priceOf(s, T0)).toBe(22); // exakte Symmetrie
  });

  it("24 h Flaute heben um exakt 1 €", () => {
    const s = initState(22, 250, T0);
    expect(priceOf(s, new Date(T0.getTime() + 24 * H))).toBe(23);
  });

  it("Kauf und Zeit sind unabhängige Summanden (kein Drift-Löschen möglich)", () => {
    let s = initState(22, 250, T0);
    // Verkauf nach 12 h über den Webhook-Pfad (allowDrift: false)
    s = tick(s, 249, new Date(T0.getTime() + 12 * H), { allowDrift: false, trustedSales: 1 });
    // Cron nach 24 h: Zeit-Anteil zählt VOLL ab Start, nicht ab dem Verkauf
    s = tick(s, 249, new Date(T0.getTime() + 24 * H));
    expect(priceOf(s, new Date(T0.getTime() + 24 * H))).toBe(22); // 22 − 1 + 1
  });

  it("Boden klebt: Kaufwelle drückt roh unter den Boden, Zeit muss erst aufholen", () => {
    let s = initState(22, 250, T0);
    s = tick(s, 230, T0, { allowDrift: false, trustedSales: 20 }); // roh 2 €
    expect(priceOf(s, T0)).toBe(8);
    // 5 Tage später: roh 7 € — immer noch Boden
    expect(priceOf(s, new Date(T0.getTime() + 5 * 24 * H))).toBe(8);
    // 7 Tage später: roh 9 € — wieder über dem Boden
    expect(priceOf(s, new Date(T0.getTime() + 7 * 24 * H))).toBe(9);
  });

  it("negativer soldCount (Alt-Storno) hebt über den Startpreis, Deckel klemmt", () => {
    const s = { ...initState(22, 250, T0), soldCount: -3 };
    expect(priceOf(s, T0)).toBe(25);
    expect(priceOf({ ...s, soldCount: -20 }, T0)).toBe(30); // Deckel
  });

  it("Uhr vor dem Start (now < startAtIso) → Zeit-Anteil 0, nie negativ", () => {
    const s = initState(22, 250, T0);
    expect(priceOf(s, new Date(T0.getTime() - 48 * H))).toBe(22);
  });

  it("parseState: fehlendes startAtIso wird abgewiesen", () => {
    const s = initState(22, 250, T0);
    const { startAtIso: _weg, ...ohne } = s as never as Record<string, unknown>;
    expect(() => parseState(JSON.stringify(ohne))).toThrow(/startAtIso/);
  });

  it("parseState: startAtIso in ferner Zukunft wird abgewiesen (Preis fröre sonst)", () => {
    const s = { ...initState(22, 250, T0), startAtIso: "2100-01-01T00:00:00Z" };
    expect(() => parseState(JSON.stringify(s), T0)).toThrow(/startAtIso/);
  });

  it("parseState: driftMultiplier-Altfeld im JSON wird stillschweigend verworfen", () => {
    const s = { ...initState(22, 250, T0), driftMultiplier: 0.5 };
    const geparst = parseState(JSON.stringify(s), T0);
    expect("driftMultiplier" in geparst).toBe(false);
    expect(priceOf(geparst, T0)).toBe(22);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen scheitern** (`npm test -- engine` → Compile-Fehler wegen `startAtIso`/`priceOf(now)`: erwartet.)

- [ ] **Step 3: `config.ts` umbauen**

`saleBumpPct`, `driftFactorPerHour` samt Kommentarblöcken löschen, ersetzen durch:

```ts
  // Preis = clamp( Startpreis − saleDropEuro × verkaufte + riseEuroPerDay × Tage ).
  // ADDITIV, nicht prozentual: "genau 1 €" ist die Botschaft der Seite —
  // jedes Ticket senkt exakt gleich stark, ein Storno hebt exakt zurück.
  // Nebengewinn: Kauf- und Zeit-Anteil sind unabhängige Summanden. Der teuerste
  // Fehler des Projekts (Runde 2: "jeder Verkauf löschte den aufgelaufenen
  // Drift") ist damit strukturell unmöglich — es gibt nichts zu löschen.
  //
  // GLEICHGEWICHT: 1 Verkauf/Tag hält den Kurs exakt still. Mehr → er fällt
  // Richtung Boden (die Community "kauft den Preis runter"), weniger → er
  // steigt Richtung Deckel. Korridor: 22 Netto-Verkäufe bis zum Boden,
  // 8 Flaute-Tage bis zum Deckel.
  saleDropEuro: 1.0,

  // +1 €/Tag, KONTINUIERLICH (~4,2 Cent/Stunde) — kein Mitternachts-Sprung,
  // der Chart tickt mit jedem 5-Minuten-Cron sichtbar weiter. Zeitbasiert
  // abgeleitet aus startAtIso (siehe engine.ts) — die Cron-Kadenz beeinflusst
  // die Kurve nicht.
  riseEuroPerDay: 1.0,

  floorEuro: 8.0, // Boden — lächerlich niedrig, aber nicht gratis
  capEuro: 30.0, // Deckel — Flaute macht teurer, aber nie Konzern-Abzocke
```

`startPriceEuro: 22.0` und alles andere bleibt. Im Kopf-Kommentar der Datei nichts nötig.

- [ ] **Step 4: `engine.ts` umbauen**

4a. `TickerState`: `driftMultiplier`-Feld + Kommentar raus; dafür (nach `soldCount`/`ignoredTickets`-Block, vor `lastSaleAt`):

```ts
  /**
   * Börsenstart — Anker des ZEIT-Anteils: riseEuroPerDay × Tage seit diesem
   * Zeitpunkt. ABGELEITET statt akkumuliert (der frühere driftMultiplier
   * entfiel ersatzlos): Uhr-Rücksprünge heilen sich selbst, und es gibt keinen
   * Akkumulator, den ein anderer Code-Pfad versehentlich überspringen könnte.
   */
  startAtIso: string;
```

Doc-Kommentar über `TickerState` (Formel) ersetzen:

```
Preis = clamp( Startpreis − saleDropEuro × verkaufte + riseEuroPerDay × TageSeitStart )
```

4b. `MIN_DRIFT`-Konstante + Kommentar löschen. `MAX_SOLD_ABS`-Kommentar: den `1,01^n`-Overflow-Satz ersetzen durch „(im linearen Modell gibt es keinen Overflow mehr; die Grenze bleibt als Absurditäts- und Repräsentierbarkeits-Schranke — ein Klub hat 250 Plätze)".

4c. `priceOf` ersetzen:

```ts
/**
 * Der Preis als reine Funktion von Zustand UND Zeit. Die Zeit kommt — wie
 * überall in der Engine — von außen herein; es gibt keinen Akkumulator.
 *
 * Der NaN-Riegel bleibt Absicht: Käme je eine NaN durch (verbogener Zustand),
 * würde toFixed(2) daraus den String "NaN" machen — und den als Preis an
 * Shopify schicken. Lieber laut scheitern als still Unsinn verkaufen.
 */
export function priceOf(state: TickerState, now: Date): number {
  // Uhr vor dem Börsenstart (Rücksprung, verbogener Zustand): Zeit-Anteil 0,
  // nie negativ — sonst fiele der Kurs unter das, was die Verkäufe hergeben.
  const tage = Math.max(
    0,
    (now.getTime() - new Date(state.startAtIso).getTime()) / 86_400_000
  );
  const roh =
    state.startPrice - C.saleDropEuro * state.soldCount + C.riseEuroPerDay * tage;
  if (Number.isNaN(roh)) {
    throw new Error("Börsen-Zustand ergibt keinen Preis (NaN)");
  }
  return clamp(roh);
}
```

4d. `initState`: `driftMultiplier: 1,` → `startAtIso: t,`.

4e. `applyDrift` → umbenennen in `applyZeit`, Körper ersetzen (der lange Gnadenfrist-Kommentar entfällt; der Uhr-Rücksprung-Kommentar bleibt sinngemäß):

```ts
/**
 * Schritt 1: den Zeit-Anker nachziehen. Setzt als Einziger `lastTickAt`.
 *
 * Der PREIS hängt nicht mehr an diesem Anker (er ist aus startAtIso
 * abgeleitet) — `lastTickAt` bleibt für den Betrieb: die Ampel misst daran
 * "Cron steht", die zeitskalierte Verkaufsgrenze ihr Zeitfenster. Ein
 * History-Punkt entsteht nur, wenn sich der Kurs seit dem letzten Punkt
 * bewegt hat (am Boden/Deckel entstünde sonst stündlich ein toter Punkt).
 */
function applyZeit(state: TickerState, now: Date): TickerState {
  const driftHours =
    (now.getTime() - new Date(state.lastTickAt).getTime()) / 3_600_000;
  // Läuft die Uhr rückwärts, bleibt der Anker, wo er ist — ihn zurückzusetzen
  // würde das Klemmen-Zeitfenster künstlich aufblähen.
  if (driftHours <= 0) return state;

  const next: TickerState = { ...state, lastTickAt: now.toISOString() };
  const price = round4(priceOf(next, now));
  const letzter = next.history[next.history.length - 1];
  if (price === letzter.price) return next; // nichts bewegt — kein Punkt

  return {
    ...next,
    history: [...next.history, { t: next.lastTickAt, price, event: "drift" }],
  };
}
```

4f. `tick()`: Aufruf `applyDrift(state, now)` → `applyZeit(state, now)`. Den Doc-Kommentar über `tick()` kürzen: Der Absatz „Reihenfolge ist bedeutungstragend: ERST driften, DANN…" wird ersetzt durch:

```
 * Die frühere Reihenfolge-Regel ("erst Drift, dann Verkäufe") ist im additiven
 * Modell gegenstandslos: Zeit- und Kauf-Anteil sind unabhängige Summanden der
 * Preisformel, keiner kann den anderen löschen (Runde-2-Blocker 6 ist damit
 * strukturell unmöglich). applyZeit läuft weiterhin zuerst, weil es lastTickAt
 * setzt und applyInventory das unangetastet lassen soll.
```

Der Absatz „Der Drift ist ZEITBASIERT (nicht pro Aufruf)…" bleibt sinngemäß (zeit-idempotent gilt weiter — jetzt trivial, weil abgeleitet).

4g. `TickOptions.allowDrift`-Kommentar anpassen: nicht mehr „darf die verstrichene Zeit verdriften", sondern „darf den `lastTickAt`-Anker verschieben und Drift-History-Punkte schreiben (nur der Cron). Der Preis enthält die verstrichene Zeit IMMER — er ist aus `startAtIso` abgeleitet; ein Webhook-Write kann keine Flaute-Zeit mehr löschen."

4h. `applyInventory`: `const price = priceOf(next);` → `priceOf(next, now)`. Sonst NICHTS ändern (Klemme, Anomalie, History-Punkt-Logik bleiben wörtlich).

4i. `rebaseline`: `price: round4(priceOf(state))` → `round4(priceOf(state, now))`.

4j. `parseState`:
- `driftMultiplier: num("driftMultiplier", MIN_DRIFT, 1),` samt Kommentar löschen.
- Nach dem `lastTickAt`-Zukunfts-Check analog für `startAtIso` (Pflichtfeld — `iso()` wirft bei fehlendem Feld):

```ts
  const startAtIso = iso("startAtIso");
  // Ein Start-Anker in der fernen Zukunft hielte den Zeit-Anteil dauerhaft
  // auf 0 (Math.max-Klemme) — der Kurs könnte nie wieder steigen. Verbogener
  // Zustand, kein Uhr-Randfall: abweisen.
  if (now && new Date(startAtIso).getTime() > now.getTime() + 24 * 3_600_000) {
    throw new Error(
      `Börsen-Zustand: 'startAtIso' liegt in der Zukunft (${startAtIso})`
    );
  }
```

und im Rückgabe-Objekt `startAtIso,` ergänzen.

- [ ] **Step 5: `npm test -- engine` laufen lassen** — engine.test.ts muss grün sein (routes/simulate scheitern noch, das ist Task 2/3).

- [ ] **Step 6: Commit** — `feat(ticker): Community-Pricing-Engine — additiv, −1 €/Ticket, +1 €/Tag, 8–30 €`

---

### Task 2: Aufrufer + routes.test.ts

**Files:**
- Modify: `lib/ticker/shopify-admin.ts` (Zeilen ~201, ~264 + Signaturen)
- Modify: `app/api/ticker/tick/route.ts` (Zeilen ~225, ~306, ~339, ~397)
- Modify: `app/api/ticker/webhook/route.ts` (Zeilen ~144, ~236)
- Modify: `app/api/ticker/status/route.ts` (Zeile ~98)
- Modify: `app/[locale]/tickets/page.tsx` (Zeile ~111)
- Modify: `lib/ticker/mock.ts` (Zeile ~30)
- Test: `lib/ticker/routes.test.ts`

**Interfaces:**
- Consumes: `priceOf(state, now)`, `TickerState.startAtIso` aus Task 1.
- Produces: `writeTicker(state, currentPriceEuro, compareDigest, now: Date)` — neuer vierter Pflicht-Parameter (statt intern `new Date()` zu ziehen: die Routen HABEN bereits ein `now`, und die Engine-Philosophie ist „Zeit kommt von außen").

- [ ] **Step 1: Alle `priceOf(x)`-Aufrufe um `now` ergänzen.** In jeder Route existiert bereits eine `now`-/`new Date()`-Instanz pro Request — dieselbe durchreichen, KEINE neuen `new Date()` pro Aufruf streuen (sonst minimal divergierende Preise im selben Request). `page.tsx`: ein `const now = new Date()` im Server-Render. `mock.ts`: das `now`-Argument von `mockTicker` verwenden.
- [ ] **Step 2: `writeTicker` (+ ggf. die Verifikations-Funktion bei Zeile ~264) um `now: Date` erweitern**, alle Aufrufer (tick/webhook-Route, Task-5-Script folgt) anpassen.
- [ ] **Step 3: `routes.test.ts` umstellen:** Fixtures `driftMultiplier: 1` → `startAtIso`, Preis-Erwartungen linear (`22,22` → `21` usw. — jede Erwartung aus der neuen Formel neu herleiten, nicht „ungefähr anpassen"). Test-ABSICHTEN (Start-Gate, Anomalie, Rebaseline/Reconcile, Quelle-Wechsel, Webhook-Dedup, 5xx-Verbot …) bleiben vollständig erhalten — es darf kein Test GELÖSCHT werden, nur Zahlen/Felder.
- [ ] **Step 4: `npm test -- routes` → grün.**
- [ ] **Step 5: Commit** — `feat(ticker): Aufrufer auf priceOf(state, now) + startAtIso umgestellt`

---

### Task 3: simulate.test.ts — neue Szenarien

**Files:**
- Test: `lib/ticker/simulate.test.ts`

**Interfaces:** Consumes Task 1. Die `simulate(salesPerDay)`-Helferin bleibt, nur `priceOf(s)` → `priceOf(s, now)`.

- [ ] **Step 1: Szenarien auf das neue Modell drehen** (96 Tage, stündlicher Cron):

```ts
describe("Simulation: 96 Tage bis zum Gig", () => {
  it("totale Flaute: Kurs steigt, erreicht den Deckel nicht vor Tag 8", () => {
    const r = simulate(0);
    expect(r.price).toBe(C.capEuro); // 96 Tage Flaute → Deckel, klar
    expect(r.sold).toBe(0);
    // Deckel-Erreichen: (30 − 22) / 1 €/Tag = 8 Tage — nie früher
    expect(C.capEuro - C.startPriceEuro).toBeGreaterThanOrEqual(8);
  });

  it("Gleichgewicht: 1 Verkauf/Tag hält den Kurs beim Start ±1 €", () => {
    const r = simulate(1);
    expect(r.price).toBeGreaterThan(C.startPriceEuro - 1.5);
    expect(r.price).toBeLessThan(C.startPriceEuro + 1.5);
  });

  it("guter Verkauf (2/Tag): Community kauft den Preis auf den Boden", () => {
    const r = simulate(2);
    expect(r.price).toBe(C.floorEuro);
    expect(r.sold).toBeGreaterThan(100);
  });

  it("Metafield bleibt in JEDEM Szenario weit unter dem Shopify-Limit", () => {
    for (const rate of [0, 0.5, 1, 2, 3]) {
      const r = simulate(rate);
      expect(r.maxBytes).toBeLessThan(60_000);
    }
  });
});
```

- [ ] **Step 2: `npm test -- simulate` → grün.**
- [ ] **Step 3: Commit** — `test(ticker): Simulation auf Community-Pricing-Szenarien`

---

### Task 4: Copy DE + EN

**Files:**
- Modify: `messages/de.json` (Namespace `tickets`)
- Modify: `messages/en.json` (Namespace `tickets`)
- Prüfen (nur lesen, ggf. anpassen): `components/ticker/price-hero.tsx`, `price-chart.tsx`, `ticker-tape.tsx` — ob irgendwo Richtungs-LOGIK steckt (z. B. „steigend = rot"-Färbung mit fester Bedeutung). Chart-Trendfarbe ist EINE Farbe (Design-Regel) — vermutlich nichts zu tun, aber verifizieren.

**Interfaces:** keine Code-Schnittstellen; Boden/Deckel in `tape.floor`/`tape.cap`/`chart.floor` kommen als `{price}`-Parameter aus der Config — aktualisieren sich selbst.

- [ ] **Step 1: DE-Strings drehen** (nur diese Keys, Rest bleibt):

| Key | Neu |
|---|---|
| `howItWorks` | `Jedes verkaufte Ticket senkt den Preis um 1 € — für alle, die nach dir kaufen. Jeder Tag ohne Verkauf hebt ihn um 1 €. Ein Ticket pro Tag hält den Kurs. Kauft ihr schneller, wird's für alle billiger.` |
| `chartHeadline` | `Kauft wer, fällt er. Kauft niemand, steigt er.` |
| `nextDrop` | `Der Preis fällt nur, wenn jemand kauft. Sonst steigt er — 1 € pro Tag, schleichend.` |
| `reviews.items[0].quote` | `Hab gekauft, für alle nach mir wurde's billiger. Gern geschehen.` |

Bewusst UNVERÄNDERT (geprüft, tragen weiter oder werden besser): `heroTagline` („nur in die andere Richtung" — stimmt jetzt erst recht), `reviews.items[2]` („Preis ist gefallen, nachdem ich gekauft hab." / „verständlicherweise" — ist jetzt exakt die Mechanik, 1-Stern-Beschwerde über das Feature), `fees`, `ctaPriceNote` („in beide Richtungen"), `howItWorksTitle`, `closingLine`, `vip`, `trust`, `demandBadge`.

- [ ] **Step 2: EN spiegeln:**

| Key | Neu |
|---|---|
| `howItWorks` | `Every ticket sold cuts the price by €1 — for everyone buying after you. Every day without a sale raises it by €1. One ticket a day holds the line. Buy faster and it gets cheaper for everyone.` |
| `chartHeadline` | `Somebody buys, it falls. Nobody buys, it rises.` |
| `nextDrop` | `The price only drops when somebody buys. Otherwise it climbs — €1 a day, slowly.` |
| `reviews.items[0].quote` | `Bought one, made it cheaper for everyone after me. You're welcome.` |

Zusätzlich in en.json JEDEN `tickets`-Key gegen die DE-Fassung querlesen — weitere Richtungs-Formulierungen (z. B. „lifts/lowers" in `howItWorks` alt) dürfen nicht überleben.

- [ ] **Step 3: Preview ansehen:** `TICKER_MOCK=1 npm run dev -- --port 3011` → `http://localhost:3011/de/tickets` + `/en/tickets` — Copy im Kontext lesen (Mock nutzt die echte neue Engine; Kurve muss jetzt bei Flaute STEIGEN und bei den Mock-Verkäufen fallen). ⚠️ `.env.local` nicht anfassen.
- [ ] **Step 4: Commit** — `copy(tickets): Richtung gedreht — Community kauft den Preis runter (DE+EN)`

---

### Task 5: Scripts

**Files:**
- Modify: `scripts/boerse-generalprobe.ts` (Zeilen ~124–149 + alle `priceOf`/`writeTicker`-Aufrufe)
- Prüfen: `scripts/boerse-golive.sh` (grep nach Modell-Annahmen: `22`, `25`, `5 €`, `Drift`, `%`)

**Interfaces:** Consumes `priceOf(state, now)`, `writeTicker(…, now)` aus Task 1/2.

- [ ] **Step 1: Generalprobe anpassen:** `priceOf(zweiVerkäufe)` → `priceOf(zweiVerkäufe, new Date())`; Kommentar `// 22 × 1,01² → 22,40` → `// 22 − 2 → 20,00 (Zeit-Anteil im Sekundenbereich, verschwindet in der 10-Cent-Rundung)`; `writeTicker`-Aufrufe um `new Date()` ergänzen. Der Test „Preis-Update" erwartet dann 20,00 € statt 22,40 €.
- [ ] **Step 2: `boerse-golive.sh` greppen** — das Script orchestriert Envs/Deploy/Arm/QStash und sollte modellfrei sein. Findet der Grep doch Preis-/Modell-Annahmen (z. B. eine Verifikation „Preis == 22"), anpassen.
- [ ] **Step 3: `npx tsc --noEmit` → 0 Fehler** (Generalprobe läuft gegen echtes Shopify — NICHT ausführen, nur kompilieren; der echte Lauf gehört Constantin vor dem Go-Live).
- [ ] **Step 4: Commit** — `ops(ticker): Generalprobe auf additives Modell`

---

### Task 6: Doku

**Files:**
- Modify: `docs/TICKET-BOERSE-HANDOFF.md` (Sektion „Das Preismodell" + Stand-Zeile + verstreute Modell-Zahlen)
- Prüfen: `docs/TICKET-BOERSE-x-TICKETSYSTEM.md` (grep nach `1 %`, `Drift`, `25 €`, `5 €`)
- Modify: Memory `project_now_ticket_boerse.md` (Preismodell-Absatz + „Je früher das Go, desto mehr Zeit zum Fallen"-Zeile — die Logik hat sich GEDREHT: je früher das Go, desto mehr Zeit hat die Community; Flaute macht jetzt teurer)

- [ ] **Step 1: HANDOFF „Das Preismodell" neu schreiben:** Formel, Parametertabelle (`saleDropEuro` 1 € / `riseEuroPerDay` 1 € / Boden 8 / Deckel 30), Gleichgewichts-Absatz („1 Verkauf/Tag hält den Kurs; Korridor 22 Verkäufe bzw. 8 Flaute-Tage"), und den Fett-Absatz „Ein Tick rechnet IMMER erst Drift, DANN Verkäufe" ersetzen durch den Additiv-Hinweis (Reihenfolge gegenstandslos, Runde-2-Blocker strukturell unmöglich, `lastTickAt` nur noch Betriebs-Anker). Stand-Zeile auf 2026-08-10 + Verweis auf die neue Spec.
- [ ] **Step 2: Restliche Modell-Zahlen im HANDOFF greppen** (`1 %`, `−0,06`, `25 €`, `5 €`, `1,4`, `driftMultiplier`, `MIN_DRIFT`) und die betroffenen Sätze anpassen — Audit-Runden-HISTORIE (Runde 1–4b) bleibt als Geschichte stehen, nur gegenwartsbezogene Aussagen ändern.
- [ ] **Step 3: Commit** — `docs(ticker): Handoff auf Community-Pricing`

---

### Task 7: Gesamt-Verifikation

- [ ] **Step 1:** `npm test` — ALLE Suites grün (vorher 123 Tests; neue Zahl notieren).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 3:** `npm run lint` → 0 Fehler.
- [ ] **Step 4:** `npm run build` → sauber.
- [ ] **Step 5:** Laufzeiten notieren (Hausregel: gemessene Zeiten in den Bericht).

---

### Task 8: Adversarialer Gegencheck (Projektgesetz seit Runde 3)

- [ ] **Step 1:** Codex (`mcp__codex__codex`) auf den Gesamt-Diff ansetzen — Auftrag: Preismodell-Umbau adversarial prüfen, Schwerpunkt (a) Formel-/Klemm-Randfälle (negative soldCount × Deckel, Boden-Kleben, Uhr-Sprünge, startAtIso-Validierung), (b) hat der Umbau einen der 14 dokumentierten Blocker-Fixes angekratzt, (c) `now`-Durchreichung konsistent (kein Request mit zwei Uhrzeiten).
- [ ] **Step 2:** Befunde fixen.
- [ ] **Step 3:** RE-Review der Fixes (Hausregel: nie selbst abnicken).
- [ ] **Step 4:** Commit — `harden(ticker): Gegencheck-Befunde`

---

## Self-Review (erledigt)

- Spec-Abdeckung: Formel/Parameter (T1), abgeleiteter Zeit-Anteil (T1), Ränder (T1 Tests), Aufrufer (T2), Copy (T4), Scripts (T5), Doku+Memory (T6), Gegencheck (T8). ✓
- Platzhalter: keine. Typ-Konsistenz: `priceOf(state, now)` + `startAtIso` in allen Tasks gleich benannt. ✓
- Deploy bewusst außerhalb (golive-Script). ✓
