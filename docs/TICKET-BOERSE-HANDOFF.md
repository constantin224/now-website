# Ticket-Börse — Handoff / Stand 2026-07-13

**Für den nächsten Chat: DAS HIER ZUERST LESEN.** Danach `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` (Konzept) und `docs/superpowers/plans/2026-07-11-ticket-boerse.md` Task 12 (Go-Live-Checkliste).

---

## Was das ist

Die Band **Now.** parodiert das Dynamic Pricing der großen Ticketkonzerne — nur invers: Der Ticketpreis für das Konzert am **17.10.2026 (The Loft, Wien)** **fällt**, wenn niemand kauft, und **steigt** bei jedem Verkauf. Der Preis im Shopify-Shop ändert sich dabei wirklich; die Seite `/de/tickets` + `/en/tickets` zeigt Kurs, Chart und die Parodie (Fake-Warteschlange „Position 1 von 1", VIP-Packages, Saalplan mit einer Fläche).

## STATUS: fertig gebaut, **NICHT live**

- Alles committet auf `main`. **59/59 Tests grün**, Build sauber.
- Die Börse **läuft nicht**: In Shopify existiert kein `ticker.state`-Metafield, der Ticketpreis steht unverändert auf **22,00 €**.
- Selbst nach einem Deploy passiert nichts, bis jemand bewusst `?start=1` auslöst **und** `TICKER_ENABLED=1` gesetzt ist.
- **Go-Live wartet** auf Constantins eigene Evey-Ablösung (`project_tonherd_tickets`).
- **Zweiter Audit (Codex gpt-5.6-sol + gpt-5.5, 14.07.)** hat vier weitere Blocker gefunden — alle behoben, siehe unten. Die Engine-Tests allein hatten keinen davon gesehen: Sie saßen an der Naht zur Außenwelt. Deshalb gibt es jetzt `lib/ticker/routes.test.ts` (Routen gegen einen gefälschten Shopify-Server).

## Preismodell (nach dem Sicherheits-Audit vom 13.07.)

Der Preis wird **nie gespeichert, sondern immer neu abgeleitet** — das ist die zentrale Sicherheitseigenschaft:

    Preis = clamp( Startpreis × (1 + Kauf-Schub)^verkaufteTickets × Drift^Stunden )

| Parameter | Wert | wo |
|---|---|---|
| Startpreis | 22,00 € (fix, nicht „was im Shop steht") | `lib/ticker/config.ts` |
| Kauf-Schub | **+1 %** pro verkauftem Ticket | `saleBumpPct` |
| Flaute-Drift | **−0,06 %/Stunde** (≈ −1,4 %/Tag), **zeitbasiert** | `driftFactorPerHour` |
| Gnadenfrist | **gibt es nicht mehr** (Parameter entfernt) | — |
| Boden / Deckel | 5 € / 25 € | `floorEuro` / `capEuro` |
| Shop-Preis | auf 10 Cent gerundet | `shopPrice()` |

**Ein Tick rechnet immer in dieser Reihenfolge: erst Drift, dann Inventar.** Beide wirken unabhängig auf denselben Schritt. Wer den Verkaufs-Zweig je wieder vorzeitig zurückkehren lässt, baut den teuersten Fehler des Projekts nach (siehe unten, Punkt 6).

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

### Zweiter Audit (Codex, 14.07.) — nochmal vier Blocker

Der erste Audit prüfte nur die Engine. Die folgenden Fehler saßen alle **an der Naht zur Außenwelt** — und keiner davon wurde von den 28 Engine-Tests gesehen:

6. **Jeder Verkauf löschte den aufgelaufenen Drift.** Der Verkaufs-Zweig kehrte sofort zurück und setzte dabei `lastTickAt` — die verstrichene Flaute-Zeit war damit weg. Ein Verkauf um 23:00 ließ den Cron um 24:00 nur EINE statt vierundzwanzig Stunden driften. Bei einem Verkauf pro Tag klebte der Kurs binnen zwei Wochen am Deckel.
   Beim Fix kam heraus, dass die **Gnadenfrist-Formel dasselbe nochmal tat**: Sie klemmte den Drift auf `hoursSinceSale` — auch bei Gnadenfrist NULL. Ein Verkauf fraß so rückwirkend Flaute-Zeit, die längst vor ihm lag.
   → Drift und Inventar werden jetzt nacheinander im selben Tick verrechnet. Der Webhook verschiebt `lastTickAt` nicht mehr. Die Gnadenfrist ist **ganz raus**.

7. **Doppelt zugestellte Webhooks zählten doppelt.** Der Code behauptete im Kommentar das Gegenteil. Shopify stellt Webhooks *mindestens* einmal zu — Wiederholung ist Normalbetrieb. Solange das Inventar noch nicht fortgeschrieben war, griff bei jeder Zustellung erneut der Payload-Fallback: 5 Tickets → 23,10 € → 24,30 € → 25,00 €.
   → Bestell-IDs werden im Zustand gemerkt (`recentOrders`, letzte 60). Dieselbe Bestellung zählt nie zweimal.

8. **Website und Shop konnten dauerhaft auseinanderlaufen.** `readTicker` las den echten Variantenpreis — und **niemand benutzte ihn**. Verglichen wurde der aus dem Zustand abgeleitete Preis mit sich selbst. Schlug also der Preis-Schreibvorgang einmal fehl, während der Zustand schon geschrieben war, wurde das **nie wieder repariert**.
   → `writeTicker` bekommt jetzt den Live-Preis. Die Divergenz heilt beim nächsten Tick. Die Seite zeigt ohnehin nur noch den Preis, den der Shop wirklich verlangt.

9. **Kein Schutz gegen gleichzeitige Schreiber.** Cron und Webhook überschrieben dasselbe Metafield blind; zwei parallele Bestellungen → ein Verkauf verschwand.
   → Compare-and-Swap über `compareDigest`. Bei Konflikt (`STALE_OBJECT`) wird neu gelesen und neu gerechnet. **Zustand und Preis sind zwei getrennte Requests** — in einer Mutation hätte GraphQL den Preis auch dann geschrieben, wenn der Zustands-Write am Konflikt scheiterte.

Kleiner, ebenfalls behoben: kaputtes Metafield-JSON wird jetzt validiert (`parseState`), statt als `NaN` in den Shop zu laufen; die History speichert gerundete Preise; ein Mengenkauf über 5 Tickets zählt im signierten Webhook voll.

### Dritter Audit (Codex, 14.07.) — die Härtung selbst hatte Löcher

Der zweite Fix-Durchgang wurde erneut adversarial geprüft. Ergebnis: **zwei meiner eigenen Fixes waren neue Fehler**, dazu mehrere Lücken.

10. **Die feste 5er-Klemme verwarf echte Verkäufe DAUERHAFT.** Fielen die Webhooks aus (bei Shopify realistisch) oder lief der Cron nur täglich, sammelten sich normale Verkäufe an — und die Engine hielt sie für eine Bestands-Panne. Die Börse hätte bei guter Nachfrage nie hochgezählt.
    → Grenze wächst jetzt mit der Zeit (`maxSalesPerHour`).

11. **Der Zeit-Fix kippte ins Gegenteil.** Nach 72 h Cron-Ausfall wären 576 „Verkäufe" erlaubt gewesen — ein Bestands-Reset von 250 auf 0 wäre als Ausverkauf durchgegangen und hätte den Kurs an den Deckel geschossen. Ein zweiter Blocker, eingebaut beim Beheben des ersten.
    → Zusätzliche absolute Decke (`maxSalesAbsolute: 40`).

12. **Der Webhook schluckte jeden Bestandssprung**, sobald irgendeine Bestellung eintraf (`trustSales: true`). Ein Reset auf 0 während einer 1-Ticket-Bestellung → 250 Verkäufe.
    → Vertraut wird jetzt der **bestätigten Bestellmenge** (`trustedSales: number`), nicht dem Bestandssprung.

13. **Kein automatisches Rebaseline mehr.** Ein Reset (250 → 0) und ein Ausverkauf (250 → 0) sind aus dem Bestand allein **nicht unterscheidbar**. Die Börse rät nicht mehr: Bei einem unerklärlichen Sprung wird **nichts geschrieben**, der Preis bleibt stehen, kein Verkauf geht verloren, und der Lauf meldet sich mit **HTTP 409 `anomaly`**.
    Auflösung durch einen Menschen: **`?rebaseline=1`** zieht die Baseline bewusst nach (Kurs und Verkaufszahl bleiben unberührt) — für Admin-Korrekturen und Aufstockungen.

14. **Testbestellungen bewegten den Kurs doch.** Der Webhook ignorierte sie, aber sie **senken den Bestand wie jede echte Bestellung** — der nächste Cron zählte sie als Verkauf. Die frühere Behauptung in diesem Dokument war schlicht falsch.
    → Neues Zustandsfeld `ignoredTickets` rechnet sie dauerhaft heraus.

Außerdem: Uhr-Rücksprung driftete doppelt (Anker wird nicht mehr zurückgesetzt); der Drift-Faktor konnte unter seine eigene Validierungsgrenze fallen und die Börse **einfrieren** (`MIN_DRIFT`); der Byte-Guard maß nur die History statt des ganzen Zustands (`prepareForWrite`); Verkäufe am Deckel erzeugten keinen History-Punkt, sodass die Seite „heute 0 verkauft" meldete, während zehn Tickets weggingen; der Hero klemmte den Live-Preis an den Deckel und hätte damit einen Preis versprochen, den der Checkout nicht hält.

## Schutzschichten

| Schutz | Wirkung |
|---|---|
| `TICKER_ENABLED` | **Not-Aus.** Ohne `"1"` tun beide Routen gar nichts (`{"status":"disabled"}`). Umlegbar in Vercel ohne Deploy. |
| `?start=1` | Die Börse startet nur auf ausdrücklichen Wunsch. Sonst: `{"status":"not_started"}`, Shop-Preis unangetastet. |
| `inventoryTracked`-Check | Börse pausiert, wenn Shopify keine Bestände führt (sonst käme `0` = Totalverkauf). Gilt bei jedem Lauf, nicht nur beim Start. |
| HMAC + zeitkonstanter Bearer-Vergleich | beide Routen fail-closed (401) |
| Bestell-Dedup (`recentOrders`) | dieselbe Bestellung zählt nie zweimal — Shopify stellt Webhooks mehrfach zu |
| Compare-and-Swap (`compareDigest`) | gleichzeitige Schreiber überschreiben einander nicht; bei Konflikt wird neu gerechnet |
| `parseState` | kaputtes/verbogenes Metafield-JSON wird abgewiesen, statt als `NaN`-Preis in den Shop zu laufen |
| Preis-Write nur bei echter Änderung | verglichen wird gegen den **Live**-Preis → eine Divergenz heilt sich selbst |
| Preis-Abgleich nach dem Schreiben | ein langsamer Schreiber kann keinen veralteten Preis hinterlassen (der Preis hat kein CAS) |
| **Bestands-Anomalie → HTTP 409, kein Schreibvorgang** | unerklärliche Sprünge werden nicht geraten. Preis bleibt, Verkäufe bleiben. Auflösung nur per `?rebaseline=1` |
| Verkaufsgrenze: zeitskaliert **+ absolute Decke** | normale Verkaufs-Staus zählen voll; ein Bestands-Reset geht nie als Ausverkauf durch |
| Cron meldet Fehler mit 5xx | Vercel-Cron schaltet dabei **nicht** ab, markiert den Lauf aber als fehlgeschlagen. Eine 200er-Antwort würde einen Dauerausfall verstecken. ⚠️ Bei Wechsel auf QStash o.ä. neu bewerten — solche Dienste deaktivieren sich nach wiederholten 5xx |
| `prepareForWrite` (50 KB) | misst den **ganzen** Zustand, nicht nur die History; scheitert notfalls laut, statt das Metafield zu sprengen |

**EVEY-REGEL (bindend):** Geschrieben werden ausschließlich das **Preis-Feld** der Variante und das eigene Metafield `ticker.state`. NIEMALS Titel, Optionen, Inventar, Varianten-Struktur oder `evey.*`-Felder.

## Dateien

```
lib/ticker/config.ts         # ALLE Parameter — nur hier ändern, Tests sind config-basiert
lib/ticker/engine.ts         # pure Engine: priceOf(), tick() [Drift DANN Inventar],
                             #   parseState(), pruneHistory(), Bestell-Dedup
lib/ticker/shopify-admin.ts  # readTicker/writeTicker: Compare-and-Swap, getrennte
                             #   Requests für Zustand und Preis, Timeout, Mock-Riegel
lib/ticker/guards.ts         # tickerEnabled(), authorizeCron()
lib/ticker/hmac.ts           # Webhook-Signaturprüfung
lib/ticker/mock.ts           # Dev-Mock (nur mit TICKER_MOCK=1 + nicht-Prod)
lib/ticker/engine.test.ts    # Engine-Verhalten
lib/ticker/routes.test.ts    # ROUTEN gegen gefälschten Shopify-Server — hier hängen
                             #   die vier Blocker des zweiten Audits als Netz
app/api/ticker/tick/route.ts     # Cron: Drift + Selbstheilung + ?start=1, nie 5xx
app/api/ticker/webhook/route.ts  # orders/create: liest NUR Bestell-ID, Menge, Testflag
app/[locale]/tickets/page.tsx    # die Seite (zeigt den LIVE-Shop-Preis)
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

## Bewusst akzeptierte Restrisiken

Ehrlichkeit statt Sicherheitsversprechen — das hier ist **nicht** gelöst, sondern abgewogen:

1. **Der Preis hat kein Compare-and-Swap.** Shopify bietet dafür keins. Zwei Schreiber im selben Millisekunden-Fenster können theoretisch einen veralteten Preis hinterlassen. Der Abgleich nach dem Schreiben macht das Fenster sehr klein, und der stündliche Cron zieht jede Abweichung nach. Maximaler Schaden: wenige Cent für weniger als eine Stunde. Für eine Band mit ~1 Verkauf/Tag ist das vertretbar; die saubere Lösung (ein einzelner serialisierter Schreiber mit dauerhafter Queue) wäre Ticketmaster-Architektur für 250 Tickets.

2. **Reset und Ausverkauf sind aus dem Bestand nicht unterscheidbar.** Deshalb rät die Börse nicht mehr, sondern hält an (409) und fragt. Ein echter Ausverkauf über 40 Tickets ohne einen einzigen Webhook würde also ebenfalls anhalten — er müsste dann von Hand aufgelöst werden. Die Alternative (raten) hat in beiden Richtungen Schaden angerichtet.

3. **Ein Storno ohne Restock senkt den Kurs nicht.** Die Börse rechnet über den Bestand; wird beim Stornieren nicht zurückgebucht, bleibt das Ticket als verkauft gezählt.

4. **Es gibt kein Monitoring.** Der Cron meldet Fehler mit 5xx und Anomalien mit 409 — das sieht aber nur, wer in die Vercel-Oberfläche schaut. Ein externer Prüfer, der die Cron-Antwort überwacht, ist die naheliegende nächste Ausbaustufe.

## ⚠️ Die eine Annahme, die alles trägt

**Shopifys `inventoryQuantity` MUSS beim Ticketkauf sinken.** Daraus leitet die Börse `soldCount` ab; der Webhook darf dem nur *vorgreifen* (der Bestand hinkt Sekunden hinterher), nicht widersprechen.

Führt Evey die Ticket-Kontingente an Shopifys Bestandsverfolgung vorbei, sinkt der Bestand beim Kauf nie — und der nächste Cron macht aus **jedem Verkauf einen Storno**. Der Kurs würde hochspringen und wieder zurückfallen.

**Vor dem Start ist das mit einer echten Testbestellung zu beweisen** (Testbestellungen bewegen den Kurs nicht mehr, das ist gefahrlos): Bestand vorher notieren, kaufen, Bestand nachher prüfen. Fällt er nicht, darf die Börse nicht starten. Festgeschrieben in `routes.test.ts` → „Das Inventar ist und bleibt die Wahrheit".

Der `inventoryTracked`-Check greift bereits: Ist die Bestandsverfolgung ganz aus, pausiert die Börse von selbst — jetzt nicht nur beim Start, sondern in jedem Lauf.

## Offene Punkte

1. **Go-Live** — wartet auf die Evey-Ablösung. Checkliste: Plan Task 12 (inkl. **Notfall-Rollback**: erst `TICKER_ENABLED=0`, dann Metafield löschen, DANN Preis zurücksetzen — Preis allein zurückstellen reicht NICHT, der nächste Tick überschreibt ihn). **Neu und verpflichtend: der Bestands-Beweis oben.**
2. **`read_all_orders`-Scope** ist in `~/claude-projects/tonherd-shopify/shopify.app.toml` eingetragen, aber **noch nicht deployt**. Ohne ihn zeigt die Shopify-API nur die letzten **60 Tage** an Bestellungen — echte Verkaufszahlen sind dadurch nicht sichtbar (siehe Memory `reference_shopify_orders_60_tage_limit`). Aktivieren: `shopify app deploy --allow-updates` + App im Dev Dashboard neu installieren.
3. **Steuern:** Produkt liegt in der Kategorie „Concerts & Entertainment Events", Shopify Tax ist aktiv → 13 % (ermäßigt) kommen automatisch. Beweis liefert die Steuerzeile bei der Test-Bestellung.
4. **Rechtlich geklärt:** Dynamic Pricing ist legal (nicht personalisiert, Checkout-Preis bindend). Leitplanken: nie als „Rabatt"/Statt-Preis bewerben (30-Tage-Regel), keine erfundene Knappheit.
