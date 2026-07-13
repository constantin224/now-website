# Ticket-Börse (inverses Dynamic Pricing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inverses Dynamic Pricing für das Now.-Konzert Wien 17.10.2026 — Shopify-Preis reagiert live auf (fehlende) Nachfrage, plus Ticketmaster-Parodie-Seite `/tickets` auf now-music.at.

**Architecture:** Pure Preis-Engine (`lib/ticker/engine.ts`) + Shopify-Admin-Client (`lib/ticker/shopify-admin.ts`); zwei API-Routen (Webhook `orders/create` = sofortiger Preis-Sprung, stündlicher Vercel-Cron = Drift). Zustand/Historie als JSON-Metafield am Shopify-Produkt, keine DB. Seite = Server Component, on-demand revalidiert.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind 4, Vitest (neu), Shopify Admin GraphQL API (Client-Credentials-Grant).

**Spec:** `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` — bei Detailfragen dort nachschlagen (v.a. Abschnitt „Design-Vorbilder", Screenshots in `docs/design-refs/`).

## Global Constraints

- Preisregeln exakt: Verkauf **+2,00 €/Ticket**; Gnadenfrist **24 h**; Drift **−0,5 %/h** (Faktor 0,995); Boden **1,50 €**; Deckel **50,00 €**; Shop-Preis auf **0,10 €** gerundet, interner Kurs exakt.
- Zielprodukt: Produkt `gid://shopify/Product/15354134921547`, Variante `gid://shopify/ProductVariant/55861172863307`, Store `03e6c1.myshopify.com`.
- Webhook-Payload NIE inhaltlich auswerten (PII, Basic-Plan) — nur HMAC prüfen, Verkäufe IMMER aus `inventoryQuantity` ableiten.
- **EVEY-REGEL:** Produkt wird von der App „Evey Events & Tickets" verwaltet (Spec-Abschnitt „Evey-Constraint"). Writes NUR auf das Preis-Feld der bestehenden Variante + Metafield `ticker.state`. NIEMALS Titel/Optionen/Inventar/Varianten-Struktur/`evey.*`-Metafelder ändern. Externe Inventar-Erhöhungen (Storno) → Rebaseline ohne Preisänderung.
- **DRIFT-KADENZ:** Drift wird pro `tick()`-Aufruf EINMAL angewendet und darf NUR vom stündlichen Cron kommen (`allowDrift: true`). Der Webhook ruft `tick(state, inv, now, { allowDrift: false })` — er feuert bei JEDER Shop-Bestellung (auch CDs/Shirts) und darf nie zusätzliche Drift-Schritte auslösen. Verpasster Cron-Lauf = ein Drift-Schritt weniger (bewusst akzeptiert, kein Nachholen).
- Secrets NIE in Dateien/Repo/Logs. Env-Vars nur in Vercel (setzt Constantin). Lokale Tests mocken `fetch`.
- Alle UI-Texte über `messages/de.json` + `messages/en.json` (i18n-Pflicht), Ton: todernste Ticketmaster-Parodie, nie zwinkern.
- Design-Hausregeln aus `CLAUDE.md`: Effekte nur Desktop ≥768px, Mobile statisch, Text-Opacity ≥35 %, `prefers-reduced-motion` respektieren.
- **Optik = Now.-Designsprache, NICHT Ticketing-Portal-Optik.** Vorbilder (docs/design-refs/) liefern nur Muster/Tropen; UI-Tasks (8/9/10) MÜSSEN vor dem Bauen bestehende Seiten lesen (`app/[locale]/page.tsx`, `shows/page.tsx`, `globals.css`, `components/navigation.tsx`) und deren Typo/Farben/Abstände/Komponenten-Idiome exakt übernehmen. Beispiel-Snippets in diesem Plan sind funktionale Skizzen — Klassen an den Bestand anpassen.
- Deploy NUR manuell via Skill `tonherd-web-deploy` — `git push` deployt nicht.
- Code-Kommentare auf Deutsch.

## File Structure

```
lib/ticker/config.ts            # alle Parameter + GIDs (eine Wahrheitsquelle)
lib/ticker/engine.ts            # pure Preis-Engine (kein I/O)
lib/ticker/engine.test.ts       # Vitest Unit-Tests
lib/ticker/hmac.ts              # Webhook-HMAC-Verify (pure)
lib/ticker/hmac.test.ts
lib/ticker/shopify-admin.ts     # Admin-API: Token, read/write Ticker
app/api/ticker/tick/route.ts    # stündlicher Cron (Drift + Selbstheilung)
app/api/ticker/webhook/route.ts # orders/create → sofortiger Sprung
app/[locale]/tickets/page.tsx   # Parodie-Seite (Server Component)
components/ticker/price-chart.tsx   # Inline-SVG-Chart (Server)
components/ticker/queue-gate.tsx    # Fake-Warteschlange (Client)
components/ticker/countdown.tsx     # Countdown (Client)
components/ticker/hall-plan.tsx     # Saalplan-Parodie (Server, statisches SVG)
messages/de.json / en.json      # Namespace "tickets"
vercel.json                     # + stündlicher Cron
```

---

### Task 1: Vitest-Setup + Ticker-Config

**Files:**
- Modify: `package.json` (devDependency + test-Script)
- Create: `lib/ticker/config.ts`

**Interfaces:**
- Produces: `TICKER_CONFIG` (Konstanten-Objekt, von Engine/Routen/Page konsumiert), `npm test` läuft.

- [ ] **Step 1: Vitest installieren**

```bash
cd /Users/constantinkaiser/claude-projects/now-website && npm install -D vitest
```

- [ ] **Step 2: test-Script in package.json ergänzen**

In `package.json` unter `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Config-Modul schreiben**

`lib/ticker/config.ts`:

```ts
// Alle Stellschrauben der Ticket-Börse an einem Ort.
// Preise in Euro (brutto), Zeiten in Stunden.
export const TICKER_CONFIG = {
  // Zielprodukt: "17.10.2026 Now. // Wien" (Album-Präsentation)
  productGid: "gid://shopify/Product/15354134921547",
  variantGid: "gid://shopify/ProductVariant/55861172863307",
  metafieldNamespace: "ticker",
  metafieldKey: "state",

  saleBumpEuro: 2.0,        // Preis-Sprung pro verkauftem Ticket
  graceHours: 24,           // Gnadenfrist nach letztem Verkauf
  driftFactorPerHour: 0.995, // −0,5 % pro Stunde ohne Verkauf
  floorEuro: 1.5,           // bewusst lächerlicher Boden
  capEuro: 50.0,            // Deckel

  // Historie: letzte 7 Tage stündlich, älter nur alle 6 h (Metafield-Größenlimit)
  historyDenseDays: 7,
  historySparseHours: 6,

  gigDateIso: "2026-10-17T20:00:00+02:00",
  shopProductUrl:
    "https://shop.tonherd.at/products/17-10-2026-now-album-prasentation",
} as const;
```

- [ ] **Step 4: Verifizieren + Commit**

```bash
npm test 2>&1 | tail -2   # erwartet: "No test files found" o.ä. — OK, noch keine Tests
npx tsc --noEmit          # erwartet: keine Fehler
git add package.json package-lock.json lib/ticker/config.ts
git commit -m "feat(ticker): Vitest-Setup + Ticker-Config"
```

---

### Task 2: Preis-Engine — Init + Verkaufs-Sprung (TDD)

**Files:**
- Create: `lib/ticker/engine.ts`
- Create: `lib/ticker/engine.test.ts`

**Interfaces:**
- Consumes: `TICKER_CONFIG` aus Task 1.
- Produces:
  - `interface HistoryPoint { t: string; price: number; event: "init" | "sale" | "drift" }`
  - `interface TickerState { startInventory: number; soldCount: number; lastSaleAt: string; price: number; history: HistoryPoint[] }`
  - `initState(currentPriceEuro: number, currentInventory: number, now: Date): TickerState`
  - `tick(state: TickerState, currentInventory: number, now: Date): TickerState` (pure, gibt NEUES Objekt zurück)
  - `shopPrice(priceEuro: number): number` (Rundung 0,10 + Clamp)

- [ ] **Step 1: Failing Tests schreiben**

`lib/ticker/engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

```bash
npm test 2>&1 | tail -5
```
Erwartet: FAIL, `engine` existiert nicht.

- [ ] **Step 3: Engine implementieren (nur Init + Sale + shopPrice)**

`lib/ticker/engine.ts`:

```ts
import { TICKER_CONFIG as C } from "./config";

export type TickerEvent = "init" | "sale" | "drift";

export interface HistoryPoint {
  t: string; // ISO-Zeitstempel
  price: number; // interner Kurs (exakt)
  event: TickerEvent;
}

export interface TickerState {
  startInventory: number; // Inventar bei Börsen-Start (Baseline für Verkaufszählung)
  soldCount: number; // bisher gezählte Verkäufe
  lastSaleAt: string; // ISO — steuert Gnadenfrist
  price: number; // interner Kurs (ungerundet)
  history: HistoryPoint[];
}

const clamp = (p: number) => Math.min(C.capEuro, Math.max(C.floorEuro, p));

// Shop-Preis: geklemmt + auf 10 Cent gerundet (krumme Preise sind Absicht)
export function shopPrice(priceEuro: number): number {
  return Math.round(clamp(priceEuro) * 10) / 10;
}

export function initState(
  currentPriceEuro: number,
  currentInventory: number,
  now: Date
): TickerState {
  const t = now.toISOString();
  return {
    startInventory: currentInventory,
    soldCount: 0,
    lastSaleAt: t,
    price: clamp(currentPriceEuro),
    history: [{ t, price: clamp(currentPriceEuro), event: "init" }],
  };
}

// Ein Börsen-Schritt: erst Verkäufe verarbeiten, sonst Drift (Task 3).
// Pure Funktion — Zeit kommt IMMER von außen rein.
export function tick(
  state: TickerState,
  currentInventory: number,
  now: Date
): TickerState {
  const totalSold = state.startInventory - currentInventory;
  const newSales = totalSold - state.soldCount;

  if (newSales > 0) {
    const price = clamp(state.price + newSales * C.saleBumpEuro);
    return {
      ...state,
      price,
      soldCount: totalSold,
      lastSaleAt: now.toISOString(),
      history: [
        ...state.history,
        { t: now.toISOString(), price, event: "sale" },
      ],
    };
  }

  return state; // Drift folgt in Task 3
}
```

- [ ] **Step 4: Tests grün**

```bash
npm test 2>&1 | tail -5
```
Erwartet: PASS (alle).

- [ ] **Step 5: Commit**

```bash
git add lib/ticker/engine.ts lib/ticker/engine.test.ts
git commit -m "feat(ticker): Preis-Engine — Init, Verkaufs-Sprung, Shop-Rundung (TDD)"
```

---

### Task 3: Preis-Engine — Drift + Gnadenfrist (TDD)

**Files:**
- Modify: `lib/ticker/engine.ts` (tick-Funktion, Drift-Zweig)
- Modify: `lib/ticker/engine.test.ts`

**Interfaces:**
- Consumes/Produces: unverändert — `tick` bekommt den Drift-Zweig.

- [ ] **Step 1: Failing Tests ergänzen**

An `lib/ticker/engine.test.ts` anhängen:

```ts
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
```

- [ ] **Step 2: Rot verifizieren**

```bash
npm test 2>&1 | tail -5
```
Erwartet: FAIL (Drift-Tests).

- [ ] **Step 3: Drift-Zweig implementieren**

In `lib/ticker/engine.ts` das `return state; // Drift folgt in Task 3` ersetzen durch:

```ts
  // Rebaseline: Inventar extern erhöht (Storno/Evey-Korrektur) →
  // Zähler anpassen, Preis NICHT ändern, kein History-Punkt
  if (newSales < 0) {
    return { ...state, soldCount: totalSold };
  }

  // Drift: nur nach Ablauf der Gnadenfrist, exponentiell Richtung Boden
  const hoursSinceSale =
    (now.getTime() - new Date(state.lastSaleAt).getTime()) / 3_600_000;
  if (hoursSinceSale <= C.graceHours) return state;

  const price = clamp(state.price * C.driftFactorPerHour);
  if (price === state.price) return state; // am Boden angekommen — nichts zu tun

  return {
    ...state,
    price,
    history: [
      ...state.history,
      { t: now.toISOString(), price, event: "drift" },
    ],
  };
```

- [ ] **Step 4: Config-Korrektur Gig-Beginn**

In `lib/ticker/config.ts` den Wert `gigDateIso` ändern auf (laut Evey-Event: Beginn 19:00):

```ts
  gigDateIso: "2026-10-17T19:00:00+02:00",
```

- [ ] **Step 5: Grün verifizieren + Commit**

```bash
npm test 2>&1 | tail -5   # erwartet: PASS
git add lib/ticker/engine.ts lib/ticker/engine.test.ts lib/ticker/config.ts
git commit -m "feat(ticker): Drift + Gnadenfrist + Storno-Rebaseline (TDD)"
```

---

### Task 4: Preis-Engine — History-Pruning (TDD)

**Files:**
- Modify: `lib/ticker/engine.ts`
- Modify: `lib/ticker/engine.test.ts`

**Interfaces:**
- Produces: `pruneHistory(history: HistoryPoint[], now: Date): HistoryPoint[]` — wird von den API-Routen vor dem Schreiben aufgerufen (Metafield-Limit ~64 KB).

- [ ] **Step 1: Failing Tests ergänzen**

An `lib/ticker/engine.test.ts` anhängen:

```ts
import { pruneHistory } from "./engine";

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
```

- [ ] **Step 2: Rot verifizieren**

```bash
npm test 2>&1 | tail -5
```
Erwartet: FAIL, `pruneHistory` fehlt.

- [ ] **Step 3: Implementieren**

An `lib/ticker/engine.ts` anhängen:

```ts
// Historie kompakt halten: init/sale bleiben immer, alte Drift-Punkte
// werden auf ein 6h-Raster ausgedünnt (Metafield-Größenlimit).
export function pruneHistory(
  history: HistoryPoint[],
  now: Date
): HistoryPoint[] {
  const denseCutoff = now.getTime() - C.historyDenseDays * 24 * 3_600_000;
  const rasterMs = C.historySparseHours * 3_600_000;
  let lastKeptSlot = -Infinity;

  return history.filter((p) => {
    if (p.event !== "drift") return true;
    const t = new Date(p.t).getTime();
    if (t >= denseCutoff) return true;
    const slot = Math.floor(t / rasterMs);
    if (slot === lastKeptSlot) return false;
    lastKeptSlot = slot;
    return true;
  });
}
```

- [ ] **Step 4: Grün verifizieren + Commit**

```bash
npm test 2>&1 | tail -5   # erwartet: PASS
git add lib/ticker/engine.ts lib/ticker/engine.test.ts
git commit -m "feat(ticker): History-Pruning gegen Metafield-Limit (TDD)"
```

---

### Task 5: HMAC-Verify + Shopify-Admin-Client

**Files:**
- Create: `lib/ticker/hmac.ts`
- Create: `lib/ticker/hmac.test.ts`
- Create: `lib/ticker/shopify-admin.ts`

**Interfaces:**
- Consumes: `TICKER_CONFIG`, `TickerState`.
- Produces:
  - `verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean`
  - `readTicker(): Promise<{ state: TickerState | null; currentPriceEuro: number; currentInventory: number }>`
  - `writeTicker(state: TickerState): Promise<void>` (setzt Variant-Preis = `shopPrice(state.price)` + Metafield)
- Env-Vars (nur Vercel, nie im Repo): `SHOPIFY_ADMIN_CLIENT_ID`, `SHOPIFY_ADMIN_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `CRON_SECRET` (existiert schon für /api/revalidate).

- [ ] **Step 1: HMAC-Tests schreiben (failing)**

`lib/ticker/hmac.test.ts`:

```ts
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyHmac } from "./hmac";

describe("verifyShopifyHmac", () => {
  const secret = "test-secret";
  const body = '{"id":123}';
  const valid = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  it("akzeptiert gültige Signatur", () => {
    expect(verifyShopifyHmac(body, valid, secret)).toBe(true);
  });
  it("lehnt falsche Signatur ab", () => {
    expect(verifyShopifyHmac(body, valid, "anderes-secret")).toBe(false);
    expect(verifyShopifyHmac(body + "x", valid, secret)).toBe(false);
  });
  it("lehnt fehlenden Header ab", () => {
    expect(verifyShopifyHmac(body, null, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Rot verifizieren**

```bash
npm test 2>&1 | tail -5
```
Erwartet: FAIL, `hmac` fehlt.

- [ ] **Step 3: HMAC implementieren**

`lib/ticker/hmac.ts`:

```ts
import crypto from "node:crypto";

// Shopify-Webhook-Signatur prüfen (X-Shopify-Hmac-Sha256, base64)
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Grün verifizieren**

```bash
npm test 2>&1 | tail -5
```
Erwartet: PASS.

- [ ] **Step 5: Admin-Client schreiben**

`lib/ticker/shopify-admin.ts`:

```ts
import { TICKER_CONFIG as C } from "./config";
import { shopPrice, type TickerState } from "./engine";

const STORE = "03e6c1.myshopify.com";
const API_VERSION = "2026-04";

// Token-Cache: Client-Credentials-Token gilt 24 h, wir holen alle 23 h frisch
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_ADMIN_CLIENT_ID,
      client_secret: process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Shopify-Token fehlgeschlagen: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + 23 * 3_600_000,
  };
  return json.access_token;
}

async function adminQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://${STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) throw new Error(`Shopify-API ${res.status}`);
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// Aktuellen Börsen-Zustand lesen: Metafield + Live-Preis + Live-Inventar
export async function readTicker(): Promise<{
  state: TickerState | null;
  currentPriceEuro: number;
  currentInventory: number;
}> {
  const data = await adminQuery<{
    product: { metafield: { value: string } | null } | null;
    productVariant: { price: string; inventoryQuantity: number } | null;
  }>(
    `query TickerRead($productId: ID!, $variantId: ID!, $ns: String!, $key: String!) {
      product(id: $productId) { metafield(namespace: $ns, key: $key) { value } }
      productVariant(id: $variantId) { price inventoryQuantity }
    }`,
    {
      productId: C.productGid,
      variantId: C.variantGid,
      ns: C.metafieldNamespace,
      key: C.metafieldKey,
    }
  );
  if (!data.productVariant) throw new Error("Ticket-Variante nicht gefunden");
  return {
    state: data.product?.metafield
      ? (JSON.parse(data.product.metafield.value) as TickerState)
      : null,
    currentPriceEuro: parseFloat(data.productVariant.price),
    currentInventory: data.productVariant.inventoryQuantity,
  };
}

// Neuen Zustand schreiben: Shop-Preis (gerundet) + Metafield (exakter State)
export async function writeTicker(state: TickerState): Promise<void> {
  const data = await adminQuery<{
    productVariantsBulkUpdate: { userErrors: { message: string }[] };
    metafieldsSet: { userErrors: { message: string }[] };
  }>(
    `mutation TickerWrite($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $metafields: [MetafieldsSetInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { message }
      }
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      productId: C.productGid,
      variants: [
        { id: C.variantGid, price: shopPrice(state.price).toFixed(2) },
      ],
      metafields: [
        {
          ownerId: C.productGid,
          namespace: C.metafieldNamespace,
          key: C.metafieldKey,
          type: "json",
          value: JSON.stringify(state),
        },
      ],
    }
  );
  const errs = [
    ...data.productVariantsBulkUpdate.userErrors,
    ...data.metafieldsSet.userErrors,
  ];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}
```

- [ ] **Step 6: GraphQL gegen Shopify-Schema validieren**

Mit dem Shopify-Dev-MCP-Tool `validate_graphql_codeblocks` beide Operationen (TickerRead-Query, TickerWrite-Mutation) prüfen. Erwartet: beide valid. Falls invalid: Felder laut Fehlermeldung korrigieren (Schema-Version 2026-04).

- [ ] **Step 7: Typecheck + Commit**

```bash
npx tsc --noEmit   # erwartet: keine Fehler
git add lib/ticker/hmac.ts lib/ticker/hmac.test.ts lib/ticker/shopify-admin.ts
git commit -m "feat(ticker): HMAC-Verify (TDD) + Shopify-Admin-Client"
```

---

### Task 6: Cron-Route `/api/ticker/tick` + vercel.json

**Files:**
- Create: `app/api/ticker/tick/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `readTicker`, `writeTicker`, `initState`, `tick`, `pruneHistory`.
- Produces: `GET /api/ticker/tick` (Bearer `CRON_SECRET`) — initialisiert die Börse beim ersten Aufruf, danach Drift/Selbstheilung. Antwort-JSON `{ price, soldCount, event }`.

- [ ] **Step 1: Route schreiben**

`app/api/ticker/tick/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { initState, pruneHistory, shopPrice, tick } from "@/lib/ticker/engine";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

// Stündlicher Vercel-Cron: Drift anwenden + verpasste Verkäufe nachziehen.
// Erster Aufruf ohne Metafield initialisiert die Börse vom Live-Zustand.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { state, currentPriceEuro, currentInventory } = await readTicker();

  const next = state
    ? tick(state, currentInventory, now)
    : initState(currentPriceEuro, currentInventory, now);

  if (!state || next !== state) {
    await writeTicker({ ...next, history: pruneHistory(next.history, now) });
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({
    price: shopPrice(next.price),
    soldCount: next.soldCount,
    event: next.history.at(-1)?.event,
  });
}
```

- [ ] **Step 2: Cron in vercel.json ergänzen**

`vercel.json` komplett ersetzen durch:

```json
{
  "crons": [
    {
      "path": "/api/revalidate",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/ticker/tick",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Verifizieren + Commit**

```bash
npx tsc --noEmit && npm test 2>&1 | tail -3   # erwartet: sauber + PASS
git add app/api/ticker/tick/route.ts vercel.json
git commit -m "feat(ticker): stündliche Cron-Route mit Init + Selbstheilung"
```

---

### Task 7: Webhook-Route `/api/ticker/webhook`

**Files:**
- Create: `app/api/ticker/webhook/route.ts`

**Interfaces:**
- Consumes: `verifyShopifyHmac`, `readTicker`, `writeTicker`, `tick`, `pruneHistory`.
- Produces: `POST /api/ticker/webhook` — von Shopify `orders/create` aufgerufen; Payload wird NICHT ausgewertet (nur HMAC), Zustand kommt komplett aus `readTicker`.

- [ ] **Step 1: Route schreiben**

`app/api/ticker/webhook/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { pruneHistory, tick } from "@/lib/ticker/engine";
import { verifyShopifyHmac } from "@/lib/ticker/hmac";
import { readTicker, writeTicker } from "@/lib/ticker/shopify-admin";

export const dynamic = "force-dynamic";

// Shopify orders/create → sofortiger Preis-Check.
// Payload-Inhalt wird bewusst ignoriert (kein Kunden-PII am Basic-Plan) —
// Verkäufe werden aus dem Inventar abgeleitet, der Webhook ist nur Trigger.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!secret || !verifyShopifyHmac(rawBody, hmac, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { state, currentInventory } = await readTicker();
  if (!state) return NextResponse.json({ ok: true, note: "noch nicht initialisiert" });

  // allowDrift: false — Drift kommt NUR vom stündlichen Cron; dieser Webhook
  // feuert bei jeder Shop-Bestellung (auch Nicht-Ticket-Produkte)
  const next = tick(state, currentInventory, now, { allowDrift: false });
  if (next !== state) {
    await writeTicker({ ...next, history: pruneHistory(next.history, now) });
    revalidatePath("/de/tickets");
    revalidatePath("/en/tickets");
  }

  return NextResponse.json({ ok: true });
}
```

Hinweis: Bestellungen anderer Produkte lösen den Webhook auch aus — harmlos, `tick` sieht dann keine neuen Ticket-Verkäufe und tut nichts (kein Drift im Sale-Zweig, Gnadenfrist-Check greift nur bei `newSales <= 0` und ändert bei frischem `lastSaleAt` nichts).

- [ ] **Step 2: Verifizieren + Commit**

```bash
npx tsc --noEmit && npm test 2>&1 | tail -3   # erwartet: sauber + PASS
git add app/api/ticker/webhook/route.ts
git commit -m "feat(ticker): orders/create-Webhook — HMAC-verifiziert, PII-frei"
```

---

### Task 8: i18n-Texte + Seite `/[locale]/tickets` (Kurs + Chart)

**Files:**
- Modify: `messages/de.json`, `messages/en.json` (Namespace `tickets`)
- Create: `components/ticker/price-chart.tsx`
- Create: `app/[locale]/tickets/page.tsx`

**Interfaces:**
- Consumes: `readTicker`, `shopPrice`, `TickerState`, `getMessages(locale)`.
- Produces: Seite rendert Kurs, Tagesänderung, Chart, Nachfrage-Badge. Parodie-Komponenten (Task 9) werden hier später eingehängt.
- Copy-Regel: todernst, Ticketmaster-Duktus; Feinschliff mit Constantin nach Task 10.

- [ ] **Step 1: Messages ergänzen**

In `messages/de.json` als neuer Top-Level-Key (Entwurf — Feinschliff später):

```json
"tickets": {
  "metaTitle": "Tickets — Offizielle Ticket-Plattform | Now.",
  "platformLabel": "OFFIZIELLE TICKET-PLATTFORM DER NOW. WORLD TOUR 2026 (1 TERMIN)",
  "eventTitle": "17.10.2026 — Now. // Wien",
  "eventSubtitle": "Album-Präsentation",
  "currentPrice": "Aktueller Marktpreis",
  "dayChange": "24h-Veränderung",
  "chartTitle": "Preisentwicklung — 100 % transparent. Im Gegensatz zu den anderen.",
  "allTimeHigh": "Allzeithoch",
  "allTimeLow": "Allzeittief",
  "demandBadge": {
    "high": "⚡ ERHÖHTE NACHFRAGE — {count} Tickets in den letzten 24 Stunden",
    "some": "NACHFRAGE REGISTRIERT — {count} Ticket(s) in den letzten 24 Stunden",
    "none": "VIELE TICKETS VERFÜGBAR. WIRKLICH VIELE."
  },
  "howItWorks": "So funktioniert unser Dynamic Pricing: Kauft jemand ein Ticket, steigt der Preis. Kauft niemand eines, fällt er. Das ist alles. Wir hätten es auch komplizierter erklären können.",
  "buyCta": "Tickets sichern",
  "fees": "Servicegebühr: 0 €. Bearbeitungsgebühr: 0 €. Dynamische-Preis-Gebühr: 0 €. Wir verstehen es auch nicht.",
  "disclaimer": "* Angezeigter Preis inkl. gesetzl. USt. und exkl. sämtlicher Gebühren, die wir nicht erheben."
},
```

In `messages/en.json` gleiche Struktur, englisch (gleicher Ton):

```json
"tickets": {
  "metaTitle": "Tickets — Official Ticket Platform | Now.",
  "platformLabel": "OFFICIAL TICKET PLATFORM OF THE NOW. WORLD TOUR 2026 (1 DATE)",
  "eventTitle": "17.10.2026 — Now. // Vienna",
  "eventSubtitle": "Album Release Show",
  "currentPrice": "Current market price",
  "dayChange": "24h change",
  "chartTitle": "Price history — 100% transparent. Unlike the others.",
  "allTimeHigh": "All-time high",
  "allTimeLow": "All-time low",
  "demandBadge": {
    "high": "⚡ HIGH DEMAND — {count} tickets in the last 24 hours",
    "some": "DEMAND DETECTED — {count} ticket(s) in the last 24 hours",
    "none": "PLENTY OF TICKETS AVAILABLE. GENUINELY PLENTY."
  },
  "howItWorks": "How our dynamic pricing works: if someone buys a ticket, the price goes up. If nobody does, it goes down. That's it. We could have made it sound more complicated.",
  "buyCta": "Secure tickets",
  "fees": "Service fee: €0. Handling fee: €0. Dynamic pricing fee: €0. We don't understand it either.",
  "disclaimer": "* Price includes VAT and excludes all the fees we don't charge."
},
```

- [ ] **Step 2: Chart-Komponente schreiben**

`components/ticker/price-chart.tsx` (Server Component, Inline-SVG, kein Framework):

```tsx
import type { HistoryPoint } from "@/lib/ticker/engine";

interface Props {
  history: HistoryPoint[];
  floorEuro: number;
  capEuro: number;
}

// Börsen-Chart als pures SVG: Linie + Fläche, grün/rot nach Gesamttrend.
// Server-gerendert — kein JS auf dem Client.
export function PriceChart({ history, floorEuro, capEuro }: Props) {
  if (history.length < 2) return null;

  const W = 800;
  const HG = 280;
  const PAD = 8;
  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(max - min, 0.5); // nie durch 0 teilen
  const t0 = new Date(history[0].t).getTime();
  const t1 = new Date(history[history.length - 1].t).getTime();
  const tSpan = Math.max(t1 - t0, 1);

  const pts = history.map((p) => {
    const x = PAD + ((new Date(p.t).getTime() - t0) / tSpan) * (W - 2 * PAD);
    const y = PAD + (1 - (p.price - min) / span) * (HG - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const rising = prices[prices.length - 1] >= prices[0];
  const color = rising ? "#22c55e" : "#ef4444";

  return (
    <svg
      viewBox={`0 0 ${W} ${HG}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Preisverlauf von €${min.toFixed(2)} bis €${max.toFixed(2)}`}
    >
      <polygon
        points={`${PAD},${HG - PAD} ${pts.join(" ")} ${W - PAD},${HG - PAD}`}
        fill={color}
        opacity={0.12}
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Seite schreiben**

`app/[locale]/tickets/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getMessages, isValidLocale, type Locale } from "@/lib/i18n";
import { TICKER_CONFIG as C } from "@/lib/ticker/config";
import { shopPrice, type TickerState } from "@/lib/ticker/engine";
import { readTicker } from "@/lib/ticker/shopify-admin";
import { PriceChart } from "@/components/ticker/price-chart";

export const revalidate = 3600; // Fallback — Webhook/Tick revalidieren on-demand

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? locale : "de");
  return { title: m.tickets.metaTitle };
}

// Verkäufe der letzten 24 h aus der Historie zählen (für Nachfrage-Badge)
function salesLast24h(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  return state.history.filter(
    (p) => p.event === "sale" && new Date(p.t).getTime() >= cutoff
  ).length;
}

// 24h-Veränderung in Prozent (für die grün/rote Kennzahl)
function dayChangePct(state: TickerState, now: Date): number {
  const cutoff = now.getTime() - 24 * 3_600_000;
  const before = [...state.history]
    .reverse()
    .find((p) => new Date(p.t).getTime() < cutoff);
  const ref = before?.price ?? state.history[0].price;
  return ((state.price - ref) / ref) * 100;
}

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getMessages(isValidLocale(locale) ? (locale as Locale) : "de");
  const t = m.tickets;

  const now = new Date();
  const { state } = await readTicker().catch(() => ({ state: null }));

  // Börse noch nicht initialisiert → nüchterner Fallback mit Shop-Link
  if (!state) {
    return (
      <main className="min-h-screen pt-32 px-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold">{t.eventTitle}</h1>
        <a href={C.shopProductUrl} className="underline mt-6 inline-block">
          {t.buyCta}
        </a>
      </main>
    );
  }

  const price = shopPrice(state.price);
  const change = dayChangePct(state, now);
  const sales24 = salesLast24h(state, now);
  const prices = state.history.map((p) => p.price);
  const ath = Math.max(...prices);
  const atl = Math.min(...prices);
  const badge =
    sales24 >= 3
      ? t.demandBadge.high.replace("{count}", String(sales24))
      : sales24 >= 1
        ? t.demandBadge.some.replace("{count}", String(sales24))
        : t.demandBadge.none;

  return (
    <main className="min-h-screen pt-32 pb-24 px-6 max-w-4xl mx-auto">
      <p className="text-xs tracking-[0.2em] opacity-50">{t.platformLabel}</p>
      <h1 className="text-4xl md:text-6xl font-bold mt-4">{t.eventTitle}</h1>
      <p className="opacity-60 mt-1">{t.eventSubtitle}</p>

      <div className="mt-10 text-sm font-semibold tracking-wide border border-current/20 rounded px-4 py-2 inline-block">
        {badge}
      </div>

      <section className="mt-12">
        <p className="text-sm opacity-50">{t.currentPrice}</p>
        <div className="flex items-end gap-6">
          <span className="text-7xl md:text-8xl font-bold tabular-nums">
            €{price.toFixed(2).replace(".", ",")}
          </span>
          <span
            className={`text-2xl font-semibold tabular-nums ${
              change >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        </div>
        <p className="text-xs opacity-40 mt-2">{t.dayChange}</p>
      </section>

      <section className="mt-16">
        <h2 className="text-lg font-semibold mb-4">{t.chartTitle}</h2>
        <PriceChart
          history={state.history}
          floorEuro={C.floorEuro}
          capEuro={C.capEuro}
        />
        <div className="flex gap-8 mt-3 text-sm opacity-60 tabular-nums">
          <span>
            {t.allTimeHigh}: €{ath.toFixed(2).replace(".", ",")}
          </span>
          <span>
            {t.allTimeLow}: €{atl.toFixed(2).replace(".", ",")}
          </span>
        </div>
      </section>

      <p className="mt-16 max-w-xl opacity-60">{t.howItWorks}</p>

      <section className="mt-12">
        <a
          href={C.shopProductUrl}
          className="inline-block bg-white text-black font-bold px-10 py-4 rounded"
        >
          {t.buyCta}
        </a>
        <p className="text-sm opacity-50 mt-4">{t.fees}</p>
        <p className="text-xs opacity-35 mt-2">{t.disclaimer}</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Build-Verifikation + Commit**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```
Erwartet: Build erfolgreich (Seite erscheint in der Route-Liste als `/[locale]/tickets`).

```bash
git add messages/de.json messages/en.json components/ticker/price-chart.tsx "app/[locale]/tickets/page.tsx"
git commit -m "feat(ticker): /tickets-Seite — Kurs, 24h-Änderung, Chart, Nachfrage-Badge"
```

---

### Task 9: Parodie-Komponenten — Warteschlange, Countdown, Saalplan

**Files:**
- Create: `components/ticker/queue-gate.tsx`
- Create: `components/ticker/countdown.tsx`
- Create: `components/ticker/hall-plan.tsx`
- Modify: `app/[locale]/tickets/page.tsx` (Komponenten einhängen)
- Modify: `messages/de.json`, `messages/en.json` (Texte ergänzen)

**Interfaces:**
- Consumes: `TICKER_CONFIG.gigDateIso`, `TICKER_CONFIG.shopProductUrl`, messages.
- Produces: `<QueueGate href label queueText />` ersetzt den Buy-Link; `<Countdown targetIso labels />`; `<HallPlan labels />`.

- [ ] **Step 1: Messages ergänzen**

In `messages/de.json` im `tickets`-Objekt zusätzlich:

```json
"queue": {
  "position": "Du bist Position 1 von 1 in der Warteschlange.",
  "waiting": "Geschätzte Wartezeit: keine.",
  "proceeding": "Du wirst zum Ticketkauf weitergeleitet …"
},
"countdown": {
  "title": "NOW. LIVE IN WIEN — IN",
  "days": "Tage", "hours": "Std", "minutes": "Min", "seconds": "Sek"
},
"hallPlan": {
  "title": "Saalplan",
  "stage": "BÜHNE",
  "standing": "STEHPARKETT (alle)",
  "legendStandard": "Standard",
  "legendVip": "VIP (gibt es nicht)",
  "note": "Beste Plätze: alle. Schlechteste Plätze: keine."
}
```

In `messages/en.json` analog:

```json
"queue": {
  "position": "You are position 1 of 1 in the queue.",
  "waiting": "Estimated waiting time: none.",
  "proceeding": "Redirecting you to checkout …"
},
"countdown": {
  "title": "NOW. LIVE IN VIENNA — IN",
  "days": "Days", "hours": "Hrs", "minutes": "Min", "seconds": "Sec"
},
"hallPlan": {
  "title": "Venue map",
  "stage": "STAGE",
  "standing": "GENERAL ADMISSION (everyone)",
  "legendStandard": "Standard",
  "legendVip": "VIP (does not exist)",
  "note": "Best spots: all of them. Worst spots: none."
}
```

- [ ] **Step 2: QueueGate schreiben**

`components/ticker/queue-gate.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Props {
  href: string;
  label: string;
  queue: { position: string; waiting: string; proceeding: string };
}

// Fake-Warteschlange: 3 Sekunden todernster Spinner, dann Checkout.
export function QueueGate({ href, label, queue }: Props) {
  const [phase, setPhase] = useState<"idle" | "queueing">("idle");

  function start() {
    setPhase("queueing");
    setTimeout(() => {
      window.location.href = href;
    }, 3000);
  }

  if (phase === "queueing") {
    return (
      <div
        className="border border-current/20 rounded p-6 max-w-md"
        role="status"
        aria-live="polite"
      >
        <div className="h-1 bg-current/10 rounded overflow-hidden mb-4">
          <div className="h-full w-1/3 bg-green-500 animate-pulse" />
        </div>
        <p className="font-semibold">{queue.position}</p>
        <p className="text-sm opacity-60 mt-1">{queue.waiting}</p>
        <p className="text-sm opacity-60 mt-1">{queue.proceeding}</p>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      className="inline-block bg-white text-black font-bold px-10 py-4 rounded cursor-pointer"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Countdown schreiben**

`components/ticker/countdown.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface Props {
  targetIso: string;
  labels: { title: string; days: string; hours: string; minutes: string; seconds: string };
}

// Sekunden-Countdown bis zum Gig — Ticketmaster-Stil, vier Kacheln.
export function Countdown({ targetIso, labels }: Props) {
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const update = () => setMsLeft(Math.max(0, target - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (msLeft === null) return null; // erst nach Hydration rendern (kein SSR-Mismatch)

  const s = Math.floor(msLeft / 1000);
  const units = [
    [Math.floor(s / 86400), labels.days],
    [Math.floor((s % 86400) / 3600), labels.hours],
    [Math.floor((s % 3600) / 60), labels.minutes],
    [s % 60, labels.seconds],
  ] as const;

  return (
    <div>
      <p className="text-xs tracking-[0.2em] opacity-50 mb-3">{labels.title}</p>
      <div className="flex gap-3">
        {units.map(([value, label]) => (
          <div key={label} className="border border-current/20 rounded px-4 py-3 text-center min-w-18">
            <div className="text-3xl font-bold tabular-nums">
              {String(value).padStart(2, "0")}
            </div>
            <div className="text-xs opacity-50 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Saalplan schreiben**

`components/ticker/hall-plan.tsx`:

```tsx
interface Props {
  labels: {
    title: string;
    stage: string;
    standing: string;
    legendStandard: string;
    legendVip: string;
    note: string;
  };
}

// Saalplan-Parodie: exakt EINE Fläche. Nachbau der Ticketmaster-Saalplan-Optik.
export function HallPlan({ labels }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">{labels.title}</h2>
      <svg viewBox="0 0 400 260" className="w-full max-w-lg h-auto" role="img" aria-label={labels.title}>
        <rect x="120" y="16" width="160" height="36" rx="4" fill="currentColor" opacity="0.25" />
        <text x="200" y="40" textAnchor="middle" fill="currentColor" opacity="0.7" fontSize="16" fontWeight="bold">
          {labels.stage}
        </text>
        <polygon points="60,80 340,80 360,230 40,230" fill="#3b82f6" opacity="0.85" />
        <text x="200" y="165" textAnchor="middle" fill="white" fontSize="15" fontWeight="bold">
          {labels.standing}
        </text>
      </svg>
      <div className="flex gap-6 mt-3 text-sm opacity-60">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> {labels.legendStandard}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> {labels.legendVip}
        </span>
      </div>
      <p className="text-sm opacity-50 mt-2">{labels.note}</p>
    </section>
  );
}
```

- [ ] **Step 5: In die Seite einhängen**

In `app/[locale]/tickets/page.tsx`:

Imports ergänzen:

```tsx
import { Countdown } from "@/components/ticker/countdown";
import { HallPlan } from "@/components/ticker/hall-plan";
import { QueueGate } from "@/components/ticker/queue-gate";
```

Den `<a href={C.shopProductUrl} …>{t.buyCta}</a>`-Block in der Buy-Section ersetzen durch:

```tsx
<QueueGate href={C.shopProductUrl} label={t.buyCta} queue={t.queue} />
```

Nach der Chart-Section einfügen:

```tsx
<div className="mt-16">
  <HallPlan labels={t.hallPlan} />
</div>

<div className="mt-16">
  <Countdown targetIso={C.gigDateIso} labels={t.countdown} />
</div>
```

- [ ] **Step 6: Build + Commit**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5   # erwartet: erfolgreich
git add components/ticker messages "app/[locale]/tickets/page.tsx"
git commit -m "feat(ticker): Warteschlangen-Gag, Countdown, Saalplan-Parodie"
```

---

### Task 10: Navigation + Shows-Badge

**Files:**
- Modify: `components/navigation.tsx` (Link „Tickets" ergänzen — bestehendes Nav-Items-Muster in der Datei ansehen und exakt nachziehen)
- Modify: `app/[locale]/shows/page.tsx` (Hinweis-Banner über dem Bandsintown-Widget)
- Modify: `messages/de.json`, `messages/en.json`

**Interfaces:**
- Consumes: bestehende Nav-/Shows-Strukturen (beim Implementieren zuerst lesen).
- Produces: Nav-Eintrag `/{locale}/tickets`; Shows-Banner verlinkt auf die Ticket-Seite.

- [ ] **Step 1: Messages ergänzen**

`messages/de.json` → im `nav`-Objekt: `"tickets": "Tickets"`. Im `shows`-Objekt: `"tickerBanner": "Wien 17.10.: Ticketpreis wird live vom Markt bestimmt — aktueller Kurs auf der Ticket-Börse →"`.
`messages/en.json` → `"tickets": "Tickets"`; `"tickerBanner": "Vienna Oct 17: ticket price is set live by the market — see the current rate →"`.

- [ ] **Step 2: Navigation erweitern**

`components/navigation.tsx` lesen, das bestehende Links-Array um den Eintrag für `tickets` ergänzen (gleiches Muster wie `shows`/`music`, Ziel `/{locale}/tickets`, Label `m.nav.tickets`).

- [ ] **Step 3: Shows-Banner einfügen**

In `app/[locale]/shows/page.tsx` über dem Bandsintown-Widget:

```tsx
<a
  href={`/${locale}/tickets`}
  className="block border border-current/20 rounded px-4 py-3 text-sm font-semibold mb-8 hover:opacity-80"
>
  {messages.shows.tickerBanner}
</a>
```

(Variablennamen an die real vorhandenen in der Datei anpassen — zuerst lesen.)

- [ ] **Step 4: Build + Commit**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5   # erwartet: erfolgreich
git add components/navigation.tsx "app/[locale]/shows/page.tsx" messages
git commit -m "feat(ticker): Nav-Link + Shows-Banner zur Ticket-Börse"
```

---

### Task 11: Lokale End-to-End-Probe (mit gemocktem Shopify)

**Files:**
- Create: `lib/ticker/simulate.test.ts` (Szenario-Test über die Engine)

**Interfaces:**
- Consumes: komplette Engine.
- Produces: Vertrauen, dass die Kurve über Wochen plausibel läuft.

- [ ] **Step 1: Szenario-Test schreiben**

`lib/ticker/simulate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initState, pruneHistory, shopPrice, tick } from "./engine";

// Simuliert 3 Wochen Börse mit realistischem Kleine-Venue-Verlauf.
describe("Simulation: 3 Wochen Kleine-Venue-Realität", () => {
  it("Kurve bleibt in den Grenzen und reagiert plausibel", () => {
    const start = new Date("2026-08-01T12:00:00Z");
    let state = initState(22, 176, start);
    let inventory = 176;

    for (let h = 1; h <= 21 * 24; h++) {
      const now = new Date(start.getTime() + h * 3_600_000);
      // Woche 1: 1 Verkauf/Tag, danach totale Flaute
      if (h % 24 === 0 && h <= 7 * 24) inventory -= 1;
      state = tick(state, inventory, now);
      state = { ...state, history: pruneHistory(state.history, now) };

      expect(state.price).toBeGreaterThanOrEqual(1.5);
      expect(state.price).toBeLessThanOrEqual(50);
      // Metafield-Budget: State muss klein bleiben
      expect(JSON.stringify(state).length).toBeLessThan(60_000);
    }

    // nach 2 Wochen Flaute muss der Kurs deutlich gefallen sein
    expect(shopPrice(state.price)).toBeLessThan(15);
    expect(state.soldCount).toBe(7);
  });
});
```

- [ ] **Step 2: Laufen lassen + Commit**

```bash
npm test 2>&1 | tail -5   # erwartet: PASS
git add lib/ticker/simulate.test.ts
git commit -m "test(ticker): 3-Wochen-Szenario-Simulation"
```

---

### Task 12: Go-Live-Checkliste (manuell, mit Constantin)

**Files:** keine Code-Änderungen — Ablauf-Checkliste. Stand nach dem Sicherheits-Audit vom 2026-07-13.

**Aktuelle Parameter (lib/ticker/config.ts):** Start 22 €, Boden 5 €, Deckel 25 €,
+1 % pro verkauftem Ticket, −0,06 %/h Flaute-Drift (≈ −1,4 %/Tag), keine Gnadenfrist.
Gleichgewicht bei ~1,4 Verkäufen/Tag.

- [ ] **Step 0 — Inventar einfrieren.** Der Startwert wird zur Baseline für die
      gesamte Verkaufszählung. Erst starten, wenn niemand mehr am Produkt
      schraubt (Kollege hat zuletzt auf 250 aufgestockt).

- [ ] **Step 1 — Evey-Kompatibilitäts-Gate** (unverändert): Preis testweise per API
      um 0,10 € ändern → Evey-Dashboard prüfen (Event intakt, Ticket-Type zeigt
      neuen Preis) → Test-Bestellung → gültiges QR-Ticket kommt an → **Steuerzeile
      prüfen: 13 % (ermäßigt), nicht 20 %** → Preis zurück auf 22,00 €.
      Fällt irgendetwas durch: STOPP.

- [ ] **Step 2 — Vercel-Env-Vars** setzen:
      `SHOPIFY_ADMIN_CLIENT_ID`, `SHOPIFY_ADMIN_CLIENT_SECRET` (aus dem Schlüsselbund),
      `SHOPIFY_WEBHOOK_SECRET`, `CRON_SECRET` (existiert bereits),
      **`TICKER_ENABLED=1`** (der Not-Aus — ohne diesen Wert tut die Börse nichts).
      **Prüfen, dass `TICKER_MOCK` in KEINER Environment gesetzt ist.**

- [ ] **Step 3 — Deploy** via Skill `tonherd-web-deploy` (manuell, nie `git push`).
      Reihenfolge ist unkritisch: Ohne Env-Vars antworten die Routen 401/500 und
      fassen den Shop-Preis nicht an.

- [ ] **Step 4 — Vorher-Check (ändert nichts):**
      ```bash
      curl -s -H "Authorization: Bearer $CRON_SECRET" https://now-music.at/api/ticker/tick
      # erwartet: {"status":"not_started", ..., "inventoryTracked":true}
      ```
      Zeigt die Antwort `inventoryTracked:false` → **NICHT starten** (die Börse
      könnte Verkäufe nicht erkennen; Bestandsverfolgung im Shopify-Admin einschalten).

- [ ] **Step 5 — Webhook registrieren:**
      ```bash
      ~/claude-projects/bin/shopify-admin-api.sh 'mutation {
        webhookSubscriptionCreate(
          topic: ORDERS_CREATE
          webhookSubscription: { callbackUrl: "https://now-music.at/api/ticker/webhook", format: JSON }
        ) { webhookSubscription { id } userErrors { field message } }
      }'
      ```
      Signing-Secret = Client Secret der App (verifizieren, dann als
      `SHOPIFY_WEBHOOK_SECRET` setzen und neu deployen).

- [ ] **Step 6 — BÖRSE STARTEN** (der bewusste Handgriff):
      ```bash
      curl -s -H "Authorization: Bearer $CRON_SECRET" "https://now-music.at/api/ticker/tick?start=1"
      # erwartet: {"status":"started","price":22,"soldCount":0,"event":"init"}
      ```

- [ ] **Step 7 — E2E-Test:** Ein Ticket kaufen. Erwartung: Shop-Preis binnen Sekunden
      **22,20 €** (+1 %), Kurve auf /de/tickets zeigt einen Kauf-Punkt.

- [ ] **Step 8 — Cron beobachten:** Nach der nächsten vollen Stunde Vercel-Logs prüfen
      (`/api/ticker/tick` → 200). Die Cron-Kadenz ist unkritisch geworden (der Drift
      rechnet mit echter Zeit) — auf dem Hobby-Plan reicht 1×/Tag, die Kurve stimmt
      trotzdem, nur die Chart-Auflösung ist gröber.

- [ ] **Step 9 — Uptime-Check** (z. B. cron-job.org) auf die Tick-Route, damit ein
      stiller Dauerausfall auffällt.

---

## NOTFALL-ROLLBACK (Reihenfolge zwingend!)

Der naheliegende Weg — Preis im Shopify-Admin manuell zurücksetzen — **funktioniert
nicht**: Der nächste Tick überschreibt ihn wieder aus dem gespeicherten Zustand.

1. **Not-Aus:** In Vercel `TICKER_ENABLED` auf `0` setzen (Redeploy nicht nötig,
   Env-Änderung reicht bei der nächsten Invocation). Ab jetzt schreibt nichts mehr.
2. **Zustand löschen:**
   ```bash
   ~/claude-projects/bin/shopify-admin-api.sh 'mutation {
     metafieldsDelete(metafields: [{ ownerId: "gid://shopify/Product/15354134921547", namespace: "ticker", key: "state" }]) {
       userErrors { field message }
     }
   }'
   ```
3. **Erst jetzt** den Preis im Shopify-Admin auf 22,00 € zurückstellen.
4. Optional: Webhook-Subscription löschen (`webhookSubscriptionDelete`).
