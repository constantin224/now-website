# Ticket-Börse — Handoff / Stand 2026-07-13

**Für den nächsten Chat: DAS HIER ZUERST LESEN.** Danach `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` (Konzept) und `docs/superpowers/plans/2026-07-11-ticket-boerse.md` Task 12 (Go-Live-Checkliste).

---

## Was das ist

Die Band **Now.** parodiert das Dynamic Pricing der großen Ticketkonzerne — nur invers: Der Ticketpreis für das Konzert am **17.10.2026 (The Loft, Wien)** **fällt**, wenn niemand kauft, und **steigt** bei jedem Verkauf. Der Preis im Shopify-Shop ändert sich dabei wirklich; die Seite `/de/tickets` + `/en/tickets` zeigt Kurs, Chart und die Parodie (Fake-Warteschlange „Position 1 von 1", VIP-Packages, Saalplan mit einer Fläche).

## STATUS: fertig gebaut, **NICHT live**

- Alles committet auf `main`, letzter Commit `4a85a79`. **28/28 Tests grün**, Build sauber.
- Die Börse **läuft nicht**: In Shopify existiert kein `ticker.state`-Metafield, der Ticketpreis steht unverändert auf **22,00 €**.
- Selbst nach einem Deploy passiert nichts, bis jemand bewusst `?start=1` auslöst **und** `TICKER_ENABLED=1` gesetzt ist.
- **Go-Live wartet** auf Constantins eigene Evey-Ablösung (`project_tonherd_tickets`).

## Preismodell (nach dem Sicherheits-Audit vom 13.07.)

Der Preis wird **nie gespeichert, sondern immer neu abgeleitet** — das ist die zentrale Sicherheitseigenschaft:

    Preis = clamp( Startpreis × (1 + Kauf-Schub)^verkaufteTickets × Drift^Stunden )

| Parameter | Wert | wo |
|---|---|---|
| Startpreis | 22,00 € (fix, nicht „was im Shop steht") | `lib/ticker/config.ts` |
| Kauf-Schub | **+1 %** pro verkauftem Ticket | `saleBumpPct` |
| Flaute-Drift | **−0,06 %/Stunde** (≈ −1,4 %/Tag), **zeitbasiert** | `driftFactorPerHour` |
| Gnadenfrist | **keine** (0 h) | `graceHours` |
| Boden / Deckel | 5 € / 25 € | `floorEuro` / `capEuro` |
| Shop-Preis | auf 10 Cent gerundet | `shopPrice()` |

**Gleichgewicht bei ~1,4 Verkäufen/Tag.** Weniger → Kurs fällt (Flaute: ~5,50 € kurz vor dem Gig). Mehr → steigt Richtung Deckel.
**Bekannte, von Constantin akzeptierte Einschränkung:** Nur 13 % Luft nach oben → ab ~2 Verkäufen/Tag klebt der Kurs am 25-€-Deckel.

## Warum es so gebaut ist (die Audit-Blocker — NICHT rückbauen!)

Vier parallele Auditoren fanden am 13.07. schwere Fehler. Alle behoben:

1. **Preis wurde akkumuliert** → Kauf/Storno-Zyklen trieben ihn kostenlos an den Deckel (Ratsche); jeder normale Storno verzerrte ihn dauerhaft nach oben.
   → Jetzt **abgeleitet** (`priceOf(state)`). Storno macht den Kauf exakt rückgängig, Races heilen sich selbst, Doppel-Webhooks zählen nie doppelt.
2. **Drift zählte Aufrufe statt Zeit** → Vercel-Hobby-Cron (1×/Tag) hätte 24× zu langsam gedriftet; ein geleaktes `CRON_SECRET` hätte den Kurs per Hammering auf den Boden geprügelt.
   → Jetzt **zeitbasiert** (`lastTickAt`). Cron-Kadenz ist damit egal, wiederholte Aufrufe sind wirkungslos.
3. **24-h-Gnadenfrist** → bei ≥1 Verkauf/Tag wäre **nie** gedriftet worden; der Kurs hätte ab Tag 2 dauerhaft am Deckel geklebt (der Normalfall!).
   → Gnadenfrist entfernt.
4. **Inventar-Sprünge** (Admin-Korrektur, oder Bestandsverfolgung aus → liefert `0`) wurden als Massenverkauf gelesen → Preis sprang an den Deckel.
   → Klemme `maxSalesPerTick: 5`; darüber wandert nur die Baseline mit, der Preis bleibt.
5. **`TICKER_MOCK` las gemockt, schrieb aber echt** → hätte Fantasie-Preise in den echten Shop geschrieben.
   → Doppelt verriegelt: in Produktions-Builds wirkungslos, `writeTicker` ist dort ein No-Op.

## Schutzschichten

| Schutz | Wirkung |
|---|---|
| `TICKER_ENABLED` | **Not-Aus.** Ohne `"1"` tun beide Routen gar nichts (`{"status":"disabled"}`). Umlegbar in Vercel ohne Deploy. |
| `?start=1` | Die Börse startet nur auf ausdrücklichen Wunsch. Sonst: `{"status":"not_started"}`, Shop-Preis unangetastet. |
| `inventoryTracked`-Check | Start wird verweigert, wenn Shopify keine Bestände führt (sonst käme `0` = Totalverkauf). |
| HMAC + zeitkonstanter Bearer-Vergleich | beide Routen fail-closed (401) |
| Preis-Write nur bei echter Änderung | spart dutzende Schreibvorgänge/Tag am echten Produkt |
| History-Hartlimit (800 Punkte) | Metafield kann nicht überlaufen (das würde die Börse einfrieren) |

**EVEY-REGEL (bindend):** Geschrieben werden ausschließlich das **Preis-Feld** der Variante und das eigene Metafield `ticker.state`. NIEMALS Titel, Optionen, Inventar, Varianten-Struktur oder `evey.*`-Felder.

## Dateien

```
lib/ticker/config.ts         # ALLE Parameter — nur hier ändern, Tests sind config-basiert
lib/ticker/engine.ts         # pure Engine: priceOf(), initState(), tick(), pruneHistory()
lib/ticker/shopify-admin.ts  # readTicker/writeTicker (+ Mock-Riegel, 401-Retry)
lib/ticker/guards.ts         # tickerEnabled(), authorizeCron()
lib/ticker/hmac.ts           # Webhook-Signaturprüfung
lib/ticker/mock.ts           # Dev-Mock (nur mit TICKER_MOCK=1 + nicht-Prod)
app/api/ticker/tick/route.ts     # Cron: Drift + Selbstheilung + ?start=1
app/api/ticker/webhook/route.ts  # orders/create: liest NUR variant_id+quantity (PII-frei)
app/[locale]/tickets/page.tsx    # die Seite
components/ticker/*.tsx          # price-chart, price-hero, ticker-tape, countdown,
                                 # hall-plan, queue-gate, share-rate, tilt
```

## Preview (Design-Arbeit)

```bash
cd ~/claude-projects/now-website
TICKER_MOCK=1 npm run dev -- --port 3011
# → http://localhost:3011/de/tickets
```
Der Mock (`lib/ticker/mock.ts`) simuliert mit der echten Engine 3 Wochen Verlauf. **Er kann nichts kaputtmachen** — in Produktion ist er wirkungslos, und `writeTicker` schreibt dort nie.

⚠️ `.env.local` **nicht überschreiben** (enthält Storefront-Token für die Shop-Seite). Bei Verlust: `vercel env pull .env.local --environment=production`.

## Live verifiziert (13.07., alles bestanden)

GraphQL gegen echtes Schema 2026-04 validiert · Auth beider Routen dicht (401) · Webhook mit echtem Shopify-Payload: erkennt Tickets, ignoriert Merch, rührt Kundendaten nicht an · Not-Aus greift · Mock-Riegel blockiert Schreibvorgänge · Produktions-Riegel hält · Launch-Tag (1 Datenpunkt) rendert sauber · Preise auf der Seite überall identisch und korrekt gerundet.

## Offene Punkte

1. **Go-Live** — wartet auf die Evey-Ablösung. Checkliste: Plan Task 12 (inkl. **Notfall-Rollback**: erst `TICKER_ENABLED=0`, dann Metafield löschen, DANN Preis zurücksetzen — Preis allein zurückstellen reicht NICHT, der nächste Tick überschreibt ihn).
2. **`read_all_orders`-Scope** ist in `~/claude-projects/tonherd-shopify/shopify.app.toml` eingetragen, aber **noch nicht deployt**. Ohne ihn zeigt die Shopify-API nur die letzten **60 Tage** an Bestellungen — echte Verkaufszahlen sind dadurch nicht sichtbar (siehe Memory `reference_shopify_orders_60_tage_limit`). Aktivieren: `shopify app deploy --allow-updates` + App im Dev Dashboard neu installieren.
3. **Steuern:** Produkt liegt in der Kategorie „Concerts & Entertainment Events", Shopify Tax ist aktiv → 13 % (ermäßigt) kommen automatisch. Beweis liefert die Steuerzeile bei der Test-Bestellung.
4. **Rechtlich geklärt:** Dynamic Pricing ist legal (nicht personalisiert, Checkout-Preis bindend). Leitplanken: nie als „Rabatt"/Statt-Preis bewerben (30-Tage-Regel), keine erfundene Knappheit.
