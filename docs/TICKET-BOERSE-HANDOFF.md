# Ticket-Börse — Handoff

**Stand: 2026-07-15** · alles auf `main` · **84/84 Tests grün** · Build + tsc + Lint sauber
**Die Börse LÄUFT NICHT.** Der Ticketpreis steht unverändert auf 22,00 €.

> ## Für den nächsten Chat: DAS HIER ZUERST
>
> 1. **Dieses Dokument** — Status, Modell, was nicht rückgebaut werden darf.
> 2. **[`TICKET-BOERSE-x-TICKETSYSTEM.md`](TICKET-BOERSE-x-TICKETSYSTEM.md)** — die Kopplung mit dem Ticket-System (`tonherd-tickets`). Ohne das versteht man nicht, woher die Verkaufszahl kommt.
> 3. `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` — das Konzept (Design-Entscheidungen, Copy).
>
> **Nächster konkreter Schritt:** siehe [Go-Live](#go-live-die-reihenfolge-zählt) ganz unten. Er wartet auf die Evey-Ablösung.

---

## Was das ist

Die Band **Now.** parodiert das Dynamic Pricing der großen Ticketkonzerne — nur **invers**: Der Ticketpreis für das Konzert am **17.10.2026 (The Loft, Wien)** **fällt**, wenn niemand kauft, und **steigt** bei jedem Verkauf. Der Preis im Shopify-Shop ändert sich dabei wirklich.

Die Seite `/de/tickets` + `/en/tickets` zeigt den Kurs, den Chart und die Parodie: Fake-Warteschlange („Position 1 von 1"), VIP-Packages, Saalplan mit genau einer Fläche, Gebühren-Fußnote („Wir verstehen es auch nicht.").

**Der Witz trägt nur, wenn die Mechanik ernst ist.** Deshalb die drei Audit-Runden.

---

## Wo es steht

| | |
|---|---|
| Code | `main`, letzter Commit `e74c9b2` |
| Tests | 84/84 (Engine + Routen gegen einen gefälschten Shopify-Server) |
| In Shopify | **kein** `ticker.state`-Metafield, Preis unverändert **22,00 €** |
| Läuft | **nein** — und auch nach einem Deploy passiert nichts, bis jemand `?start=1` auslöst **und** `TICKER_ENABLED=1` gesetzt ist |
| Wartet auf | die Evey-Ablösung durch das eigene Ticket-System (`project_tonherd_tickets`) |

---

## Das Preismodell

Der Preis wird **nie gespeichert, sondern immer neu abgeleitet**. Das ist die zentrale Sicherheitseigenschaft — ein gespeicherter Preis könnte „ratschen" (sich durch Kauf/Storno-Zyklen hochschaukeln), ein abgeleiteter nicht:

```
Preis = clamp( Startpreis × (1 + Kauf-Schub)^verkaufteTickets × Drift^Stunden )
```

| Parameter | Wert | wo |
|---|---|---|
| Startpreis | 22,00 € (fix, **nicht** „was im Shop steht") | `lib/ticker/config.ts` |
| Kauf-Schub | **+1 %** je verkauftem Ticket | `saleBumpPct` |
| Flaute-Drift | **−0,06 %/Stunde** (≈ −1,4 %/Tag), **zeitbasiert** | `driftFactorPerHour` |
| Boden / Deckel | 5 € / 25 € | `floorEuro` / `capEuro` |
| Shop-Preis | auf 10 Cent gerundet | `shopPrice()` |
| Gnadenfrist | **gibt es nicht** (Parameter entfernt) | — |

**Gleichgewicht bei ~1,4 Verkäufen/Tag.** Weniger → der Kurs fällt. Mehr → er steigt Richtung Deckel.
**Von Constantin akzeptiert:** Nur 13 % Luft nach oben; ab ~2 Verkäufen/Tag klebt der Kurs am Deckel.

**Ein Tick rechnet IMMER in dieser Reihenfolge: erst Drift, dann Verkäufe.** Beide wirken unabhängig im selben Schritt. Wer den Verkaufs-Zweig je wieder vorzeitig zurückkehren lässt, baut den teuersten Fehler des Projekts nach (siehe Runde 2, Punkt 6).

---

## Woher die Verkaufszahl kommt — der wichtigste Umbau

**Früher:** aus Shopifys `inventoryQuantity` — also aus dem Bestand **geraten**. Daher stammten fast alle schweren Fehler.

**Jetzt:** aus dem **Ticket-System** (`tonherd-tickets`), das die gültigen Tickets aus den *Bestellungen* kennt (Stornos raus, nur bezahlte). Endpunkt `GET /api/verkaufszahl`, Nur-Lese-Token.

Das löst drei Dinge, die die Börse allein **nicht** lösen konnte:

1. **Bestands-Reset vs. Ausverkauf** — aus dem Bestand nicht unterscheidbar. Jetzt irrelevant.
2. **Der Cutoff des Ticket-Systems** nullt bei Türöffnung den Bestand. Für die Börse sah das wie ein schlagartiger Ausverkauf aus — der Kurs wäre beim eigenen Konzert an den Deckel gesprungen.
3. **Storno ohne Rückbuchung ins Lager** — das Ticket blieb **für immer** als verkauft gezählt, der Kurs fiel nie zurück.

**Die drei Betriebszustände** (steht in der Cron-Antwort als `quelle`):

| Lage | Was passiert | `quelle` |
|---|---|---|
| Ticket-System antwortet, Event scharf | rechnet mit der echten Zahl | `ticket-system` |
| Ticket-System schweigt / Event nicht scharf | **nur driften**, Verkaufszahl unangetastet | `nur-drift` |
| Nicht konfiguriert (`TICKETS_BASE_URL` fehlt) | alter Bestands-Notpfad, mit allen Klemmen | `bestand` |

**Warum bei Ausfall nicht auf den Bestand zurückfallen?** Beide Quellen können auseinanderliegen. Ein stiller Quellenwechsel erzeugte einen Preissprung aus dem Nichts. Lieber ein paar Stunden nur driften.

Details, Go-Live-Reihenfolge und ein offener Befund: **[`TICKET-BOERSE-x-TICKETSYSTEM.md`](TICKET-BOERSE-x-TICKETSYSTEM.md)**.

---

## ⚠️ Was NICHT rückgebaut werden darf

Drei Audit-Runden (Codex `gpt-5.6-sol` + `gpt-5.5`, adversarial). **In Runde 3 stellte sich heraus, dass zwei Fixes aus Runde 2 selbst neue Blocker waren.** Wer hier etwas „vereinfacht", baut mit hoher Wahrscheinlichkeit einen der folgenden Fehler nach.

### Runde 1 — die Engine
1. **Preis wurde akkumuliert** → Kauf/Storno-Zyklen trieben ihn kostenlos an den Deckel (Ratsche). → Preis ist jetzt **abgeleitet**.
2. **Drift zählte Aufrufe statt Zeit** → ein geleaktes `CRON_SECRET` hätte den Kurs per Hammering auf den Boden geprügelt. → **zeitbasiert**.
3. **24-h-Gnadenfrist** → bei ≥1 Verkauf/Tag wäre **nie** gedriftet worden. → entfernt.
4. **Bestands-Sprünge** als Massenverkauf gelesen. → Klemme (siehe Runde 3).
5. **`TICKER_MOCK` las gemockt, schrieb aber echt.** → doppelt verriegelt.

### Runde 2 — die Naht zur Außenwelt
*(Die 28 Engine-Tests sahen keinen dieser vier. Deshalb gibt es jetzt `routes.test.ts`.)*

6. **Jeder Verkauf löschte den aufgelaufenen Drift.** Der Verkaufs-Zweig kehrte sofort zurück und setzte dabei `lastTickAt`. Ein Verkauf um 23:00 ließ den Cron um 24:00 nur **eine statt vierundzwanzig** Stunden driften — bei einem Verkauf pro Tag klebte der Kurs binnen zwei Wochen am Deckel.
   Beim Fix kam heraus: Die **Gnadenfrist-Formel tat dasselbe nochmal** — sie klemmte den Drift auf `hoursSinceSale`, **auch bei Gnadenfrist null**. Ein Verkauf fraß rückwirkend Flaute-Zeit, die längst vor ihm lag.
7. **Doppelt zugestellte Webhooks zählten doppelt.** Shopify stellt *mindestens* einmal zu — Wiederholung ist Normalbetrieb. → Bestell-IDs in `recentOrders`.
8. **Website und Shop konnten dauerhaft auseinanderlaufen.** Der echte Variantenpreis wurde gelesen und **nie benutzt**. → `writeTicker` vergleicht gegen den Live-Preis.
9. **Kein Schutz gegen gleichzeitige Schreiber.** → Compare-and-Swap (`compareDigest`, Fehlercode `STALE_OBJECT`). **Zustand und Preis sind getrennte Requests** — in einer Mutation schreibt GraphQL den Preis auch dann, wenn der Zustands-Write am Konflikt scheitert.

### Runde 3 — die Fixes selbst waren kaputt
10. **Die feste 5er-Klemme verwarf echte Verkäufe DAUERHAFT.** Fielen die Webhooks aus oder lief der Cron nur täglich, sammelten sich normale Verkäufe an — die Engine hielt sie für eine Panne. Die Börse hätte bei guter Nachfrage **nie hochgezählt**. → Grenze wächst mit der Zeit (`maxSalesPerHour`).
11. **Und dieser Fix kippte ins Gegenteil.** Nach 72 h Cron-Ausfall wären 576 „Verkäufe" erlaubt gewesen — ein Bestands-Reset 250 → 0 wäre als Ausverkauf durchgegangen. → zusätzliche **absolute Decke** (`maxSalesAbsolute: 40`).
12. **`trustSales: true` ließ den Webhook jeden Bestandssprung schlucken.** Ein Reset auf 0 während einer 1-Ticket-Bestellung → 250 Verkäufe. → `trustedSales: number`: Vertraut wird der **bestätigten Bestellmenge**, nicht dem Sprung. *(Von einem eigenen Test gefunden.)*
13. **KEIN automatisches Rebaseline mehr.** Ein Reset (250→0) und ein Ausverkauf (250→0) sind aus dem Bestand **nicht unterscheidbar**. Die Börse rät nicht: unerklärlicher Sprung → **nichts wird geschrieben**, Preis bleibt, kein Verkauf geht verloren, **HTTP 409 `anomaly`**. Auflösung durch einen Menschen: **`?rebaseline=1`**.
14. **Testbestellungen bewegten den Kurs doch.** Der Webhook ignorierte sie — aber sie senken den Bestand wie jede echte Bestellung, und der Cron zählte sie. → Feld `ignoredTickets`.

Außerdem: Uhr-Rücksprung driftete doppelt; `driftMultiplier` konnte unter seine eigene Validierungsgrenze fallen und die Börse **einfrieren** (`MIN_DRIFT`); der Byte-Guard maß nur die History statt des ganzen Zustands (`prepareForWrite`); Verkäufe am Deckel erzeugten keinen History-Punkt (Seite meldete „heute 0 verkauft"); der Hero klemmte den Live-Preis an den Deckel und versprach damit einen Preis, den der Checkout nicht hält.

---

## Schutzschichten

| Schutz | Wirkung |
|---|---|
| `TICKER_ENABLED` | **Not-Aus.** Ohne `"1"` tun beide Routen gar nichts. Umlegbar in Vercel **ohne Deploy**. |
| `?start=1` | Die Börse startet nur auf ausdrücklichen Wunsch. Sonst: `not_started`, Shop-Preis unangetastet. |
| **Anomalie → 409, kein Schreibvorgang** | Unerklärliche Bestands-Sprünge werden nicht geraten. Auflösung nur per `?rebaseline=1`. |
| Verkaufsgrenze: zeitskaliert **+ absolute Decke** | normale Verkaufs-Staus zählen voll; ein Reset geht nie als Ausverkauf durch |
| Bestell-Dedup (`recentOrders`, 300) | dieselbe Bestellung zählt nie zweimal |
| Compare-and-Swap + Preis-Abgleich | gleichzeitige Schreiber überschreiben einander nicht |
| `parseState` | verbogenes Metafield-JSON wird abgewiesen, statt als `NaN`-Preis in den Shop zu laufen |
| `prepareForWrite` (50 KB) | misst den **ganzen** Zustand; scheitert notfalls laut, statt das Metafield zu sprengen |
| Türöffnung → `beendet` | die Börse macht Schluss, bevor der Cutoff des Ticket-Systems zuschlägt |
| Cron meldet Fehler mit 5xx | Vercel-Cron schaltet dabei **nicht** ab, markiert den Lauf aber als fehlgeschlagen. ⚠️ Bei Wechsel auf QStash neu bewerten — solche Dienste deaktivieren sich nach wiederholten 5xx. |
| HMAC + zeitkonstanter Bearer | beide Routen fail-closed (401) |
| Mock in Produktion wirkungslos | doppelt verriegelt |

**EVEY-REGEL (bindend):** Geschrieben werden ausschließlich das **Preis-Feld** der Variante und das eigene Metafield `ticker.state`. NIEMALS Titel, Optionen, Inventar, Varianten-Struktur oder `evey.*`-Felder.

---

## Bewusst akzeptierte Restrisiken

Ehrlichkeit statt Sicherheitsversprechen — das hier ist **nicht** gelöst, sondern abgewogen:

1. **Der Preis hat kein Compare-and-Swap.** Shopify bietet keins. Zwei Schreiber im selben Millisekunden-Fenster können theoretisch einen veralteten Preis hinterlassen. Der Abgleich nach dem Schreiben macht das Fenster sehr klein, der stündliche Cron zieht jede Abweichung nach. Maximaler Schaden: wenige Cent, unter einer Stunde. Die saubere Lösung (ein serialisierter Schreiber mit dauerhafter Queue) wäre Ticketmaster-Architektur für 250 Tickets.
2. **Ein echter Ausverkauf über 40 Tickets ohne einen einzigen Webhook** würde ebenfalls anhalten (409) und müsste von Hand aufgelöst werden. Die Alternative (raten) hat in beiden Richtungen Schaden angerichtet.
3. **Kein Monitoring.** Der Cron meldet Fehler mit 5xx und Anomalien mit 409 — das sieht nur, wer in die Vercel-Oberfläche schaut. Ein externer Prüfer wäre die naheliegende nächste Ausbaustufe. *(Das Ticket-System hat einen — als Vorbild: `monitoring/watcher/`.)*
4. **Bewusst NICHT gebaut:** durable Queue, einzelner Writer-Prozess, Order-Ledger, Umbau auf `orders/paid`.

---

## Dateien

```
lib/ticker/config.ts         # ALLE Parameter — nur hier ändern, Tests sind config-basiert
lib/ticker/engine.ts         # pure Engine: priceOf(), tick() [Drift DANN Verkäufe],
                             #   parseState(), prepareForWrite(), Dedup, Anomalie
lib/ticker/tickets-quelle.ts # holt die Verkaufszahl vom Ticket-System
lib/ticker/shopify-admin.ts  # readTicker/writeTicker: CAS, getrennte Requests, Preis-Abgleich
lib/ticker/guards.ts         # tickerEnabled(), authorizeCron()
lib/ticker/hmac.ts           # Webhook-Signaturprüfung
lib/ticker/mock.ts           # Dev-Mock (nur mit TICKER_MOCK=1 + nicht-Prod)
lib/ticker/engine.test.ts    # Engine-Verhalten
lib/ticker/routes.test.ts    # ROUTEN gegen gefälschten Shopify-Server — hier hängen die
                             #   Blocker aus Runde 2 und 3 als Netz
app/api/ticker/tick/route.ts     # Cron: Quelle wählen, Drift, ?start=1, ?rebaseline=1
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
Der Mock simuliert mit der echten Engine drei Wochen Verlauf. **Er kann nichts kaputtmachen** — in Produktion ist er wirkungslos.

⚠️ `.env.local` **nicht überschreiben** (enthält den Storefront-Token für die Shop-Seite). Bei Verlust: `vercel env pull .env.local --environment=production`.

---

## Die Design-Regeln (Constantins, hart erarbeitet)

- **Optik = Now.-Designsprache, NIE ein Ticketing-Portal-Klon.** Die Parodie lebt in der Copy und in den *Mustern*, nicht im Aussehen. („Die oeticket-Sachen sehen einfach nur komisch aus.")
- **Kein Finanz-UI als Vorbild** — eher schicke Artist-Sites. Es geht ums Fundament, nicht um die lustigen Spielereien.
- **Hero = nur der Preis** (Inter extralight, tickt beim Laden durch die echte Historie). Sofort klar, dass der Preis dynamisch ist.
- **Kein Börsen-Jargon.** „NOW.T", „der Markt", „Marktkapitalisierung" sind alle rausgeflogen.
- **Chart:** linear (kein Smoothing, das Werte erfindet), eine Trendfarbe, Crosshair-Tooltip mit Delta.
- **Humor darf treffen** — Ironie, schwarzer Humor, Sarkasmus. Die Gebühren-Zeile („Wir verstehen es auch nicht.") ist Constantins Liebling.
- Parallax/Scale/Fade nur Desktop, Mobile statisch (Projekt-Regel).

---

## Go-Live: die Reihenfolge zählt

**Blockiert, bis die Evey-Ablösung steht.** Dann in dieser Reihenfolge:

1. **Evey-Attendee-CSV exportieren.** Nach dem Entfernen der App sind die Daten weg.
2. **Ticket-System scharfschalten** (`/api/arm`). ☠️ Vorher **nicht** — der Cutoff würde das Produkt bei Türöffnung depublizieren und **Eveys Verkauf töten**.
3. **Bestands-Beweis** (nur noch für den Notpfad): Eine echte Testbestellung zeigt, ob Shopifys Bestand beim Kauf wirklich sinkt.
4. **Envs in Vercel setzen** (`now-website`):
   ```
   TICKER_ENABLED=1
   TICKETS_BASE_URL=https://tickets.tonherd.com     ← kanonische Domain, NIE *.vercel.app
   TICKETS_MONITOR_SECRET=<MONITOR_SECRET des Ticket-Systems>
   ```
5. **Deployen** (nur manuell, Skill `tonherd-web-deploy` — `git push` deployt **nicht**).
6. **Börse starten:** den Cron einmal mit `?start=1` aufrufen. Sie friert dabei die bereits verkauften Tickets als Baseline ein — die Alt-Käufer aus der Evey-Zeit reißen den Kurs **nicht** hoch. *(Wer früh gekauft hat, wird nicht bestraft. Wäre auch das Gegenteil der Idee.)*

### 🚨 Notfall-Rollback (Reihenfolge ist entscheidend)

```
1. TICKER_ENABLED=0            ← zuerst! (wirkt sofort, ohne Deploy)
2. Metafield ticker.state löschen
3. ERST DANN den Preis zurücksetzen
```
Den Preis allein zurückzustellen **reicht nicht** — der nächste Tick überschreibt ihn.

---

## Offen / als Nächstes

| | |
|---|---|
| 🔴 **Go-Live** | wartet auf die Evey-Ablösung (siehe oben) |
| 🟡 **Endpunkt mergen** | `tonherd-tickets`, Branch `feat/verkaufszahl-endpunkt` (2 Commits) — noch nicht gemergt |
| 🟡 **Umsatz-Report** | `tonherd-tickets/scripts/report.ts` rechnet `verkauft × aktueller Variantenpreis` → mit dynamischem Preis **sinnlos**. Bewusst nicht gefixt: Der Query ist auf Shopify-Kostenpunkte budgetiert, das gehört gemessen. |
| 🟢 **`read_all_orders`** | **erledigt** — gewährt über die gemeinsame App „Claude Code Admin". Die 60-Tage-Blende ist weg. |
| 🟢 **Rechtlich** | geklärt: Dynamic Pricing ist legal (nicht personalisiert, Checkout-Preis bindend). Leitplanken: nie als „Rabatt"/Statt-Preis bewerben (30-Tage-Regel), keine erfundene Knappheit. |
| 🟢 **Steuern** | 13 % (ermäßigt) kommen automatisch — Kategorie „Concerts & Entertainment Events" + Shopify Tax aktiv. |

---

## Die zwei Lehren dieses Projekts

1. **Die teuersten Fehler saßen nie im Code, sondern an der Naht zur Außenwelt.** Vier parallele Audit-Agenten, die nur die Engine prüften, fanden keinen der vier schwersten Fehler. Gefunden hat sie erst, wer gefragt hat: *Wie reagiert Shopify wirklich?* (Es stellt Webhooks mehrfach zu. Es kennt kein CAS für Preise. Sein Bestand fällt aus Gründen, die keine Verkäufe sind.)

2. **Fixes gehören genauso adversarial geprüft wie der Originalcode.** Zwei von fünf Fixes aus Runde 2 waren neue Blocker — einer davon hätte die Börse daran gehindert, bei guter Nachfrage überhaupt jemals hochzuzählen.
