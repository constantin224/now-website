# Ticket-Börse — Handoff

**Stand: 2026-09-02 früh** · alles auf `main` + gepusht · 186/186 Tests, Build/tsc/Lint grün · **seit 02.09.: Sättigung an Deckel+Boden, Kauf-Stufen im Chart, Kauf-Turbo erstmals wirklich aktiv** (§Sättigung, §Kauf-Turbo Befund) · **Preismodell seit 10.08.: Community-Pricing** (Spec: `docs/superpowers/specs/2026-08-10-boerse-community-pricing-design.md`)

> ## 🚀 DIE BÖRSE IST LIVE (seit 11.08. ~14:09)
>
> - Go-Live via `./scripts/boerse-golive.sh` (67 s, alle 9 Schritte sauber): Baseline **28 Alt-Tickets**, `quelle: tickets`, Start 22,00 €, QStash-Schedule `scd_69AA2q822WkqRKTdpZsHWFECP7ge` (*/5).
> - **Erster echter Kauf real bewiesen** (11.08. mittags): 22,00 → 21,00 € in 8 min, sale-Punkt im Chart, Shopify + Seite synchron. Ein Storno höbe exakt zurück.
> - **Wächter aktiv** (Apps-Script „Tonherd Tickets Waechter", Property `BOERSE_MONITOR_SECRET` gesetzt, `pruefe` still) — mailt an system@tonherd.com bei allem außer Grün. `TICKER_EXPECTED_RUNNING=1`: „disabled" ist seit dem Go-Live eine Alarm-Lage, kein Ruhezustand.
> - ⚠️ **02.09.: Der Turbo war vom 11.08. bis 02.09. TOT** (Webhook 401 — Shopify signiert mit dem ältesten Client-Secret, wir prüften nur das neue; der „Beweis" vom 11.08. war der Cron). Seit 02.09. 08:03 real belegt (§Kauf-Turbo Befund). Ursprünglicher Eintrag:
> - **Kauf-Turbo LIVE** (11.08. ~22:40, Shopify-Abo `gid://shopify/WebhookSubscription/2492050014539` via `scripts/boerse-turbo-setup.sh`): echte Käufe werden in **~90 s** eingepreist (§Kauf-Turbo). Fallback bleibt der */5-Cron.
> - Chart zoomt seit 11.08. auf die Daten (Boden-Linie erscheint erst bei Annäherung); Hero-Reduced-Motion-Fallback = Crowd-Foto.
> - Not-Aus-Reihenfolge unverändert (§Notfall-Rollback); der Ampel-Alarm beim bewussten Not-Aus ist gewollt.
>
> ## Für den nächsten Chat: DAS HIER ZUERST
>
> 1. **Dieses Dokument** — Status, Modell, was nicht rückgebaut werden darf.
> 2. **[`TICKET-BOERSE-x-TICKETSYSTEM.md`](TICKET-BOERSE-x-TICKETSYSTEM.md)** — die Kopplung mit dem Ticket-System (`tonherd-tickets`). Ohne das versteht man nicht, woher die Verkaufszahl kommt.
> 3. `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` — das Konzept (Design-Entscheidungen, Copy).

---

## Was das ist

Die Band **Now.** parodiert das Dynamic Pricing der großen Ticketkonzerne — als **Community-Pricing**: Jedes verkaufte Ticket macht den Preis für das Konzert am **17.10.2026 (The Loft, Wien)** für alle Nächsten **1 € billiger**; die Zeit hebt ihn kontinuierlich um **1 €/Tag** (Verkäufe ziehen davon ab — ein Ticket pro Tag hält den Kurs). Wer kauft, schenkt den Nächsten etwas. Der Preis im Shopify-Shop ändert sich dabei wirklich.

Die Seite `/de/tickets` + `/en/tickets` zeigt den Kurs, den Chart und die Parodie: Fake-Warteschlange („Position 1 von 1"), VIP-Packages, Saalplan mit genau einer Fläche, Gebühren-Fußnote („Wir verstehen es auch nicht.").

**Der Witz trägt nur, wenn die Mechanik ernst ist.** Deshalb die drei Audit-Runden.

---

## Wo es steht

| | |
|---|---|
| Code | `main`, gepusht |
| Tests | 140/140 (Engine + Routen gegen gefälschten Shopify-Server + 96-Tage-Simulation + Turbo) · Naht real bewiesen: Generalprobe 16.07. + Live-Kauf 11.08. |
| In Shopify | `ticker.state`-Metafield LIVE, Preis dynamisch (Start 22,00 €) · Webhook-Abo orders/create aktiv |
| Läuft | **JA, seit 11.08.** — Kette real bewiesen (Kauf → 21,00 €, Chart, Wächter) |
| Betrieb | QStash */5 + Kauf-Turbo (~90 s) · Ampel `/api/ticker/status` · Wächter-Mail an system@tonherd.com |

---

## Das Preismodell

Der Preis wird **nie gespeichert, sondern immer neu abgeleitet** — aus Zustand UND Zeit. Das ist die zentrale Sicherheitseigenschaft — ein gespeicherter Preis könnte „ratschen", ein abgeleiteter nicht:

```
Preis = clamp( Startpreis − 1 € × verkaufteTickets + 1 € × TageSeitStart, 8 €, 30 € )
```

| Parameter | Wert | wo |
|---|---|---|
| Startpreis | 22,00 € (fix, **nicht** „was im Shop steht") | `lib/ticker/config.ts` |
| Kauf-Senkung | **−1,00 €** je verkauftem Ticket | `saleDropEuro` |
| Zeit-Anstieg | **+1,00 €/Tag**, kontinuierlich (~4,2 Cent/h), abgeleitet aus `startAtIso` | `riseEuroPerDay` |
| Boden / Deckel | 8 € / 30 € | `floorEuro` / `capEuro` |
| Shop-Preis | auf 10 Cent gerundet | `shopPrice()` |
| Gnadenfrist | **gibt es nicht** (Parameter entfernt) | — |

**Gleichgewicht bei exakt 1 Verkauf/Tag** („Ein Ticket pro Tag hält den Kurs"). Mehr → die Community kauft den Preis Richtung Boden. Weniger → er steigt Richtung Deckel. Vom Start: 14 Netto-Verkäufe bis zum Boden, 8 Flaute-Tage bis zum Deckel (der Zeit-Anteil verschiebt die Distanz laufend).

**ADDITIV statt multiplikativ (seit 10.08.):** Kauf- und Zeit-Anteil sind unabhängige Summanden — die alte Reihenfolge-Regel („erst Drift, dann Verkäufe") ist gegenstandslos, und die teuerste Fehlerklasse des Projekts (Runde 2, Punkt 6: „Verkauf löschte den aufgelaufenen Drift") ist strukturell unmöglich. Der Zeit-Anteil hängt an `startAtIso` im Zustand (kein Akkumulator; der frühere `driftMultiplier` samt `MIN_DRIFT` entfiel ersatzlos — Uhr-Rücksprünge heilen sich selbst). `lastTickAt` bleibt als Betriebs-Anker: Ampel-Herzschlag + Zeitfenster der Verkaufsgrenze, **nicht** mehr preisrelevant. `priceOf(state, now)` braucht deshalb die Zeit als Parameter; `writeTicker(…, now)` reicht sie durch.

**Zwei bewusste Verhaltensfolgen:** (1) **Boden-Kleben ist Feature** — nach einer Kaufwelle liegt der rohe Wert unter 8 €, der Kurs bleibt „festgenagelt", bis der Zeit-Anstieg aufgeholt hat. (2) **Alt-Storno unter die Baseline hebt den Kurs über 22 €** (weniger Community-Rabatt), Deckel klemmt. Die Ampel prüft die Preis-Divergenz zum Zeitpunkt des **letzten Ticks** — der abgeleitete Kurs kriecht zwischen den Ticks weiter, gegen `now` gäbe es bei jedem 10-Cent-Rundungssprung einen Fehlalarm.

---

## Woher die Verkaufszahl kommt — der wichtigste Umbau

**Früher:** aus Shopifys `inventoryQuantity` — also aus dem Bestand **geraten**. Daher stammten fast alle schweren Fehler.

**Jetzt:** aus dem **Ticket-System** (`tonherd-tickets`), das die gültigen Tickets aus den *Bestellungen* kennt (Stornos raus, nur bezahlte). Endpunkt `GET /api/verkaufszahl`, Nur-Lese-Token.

Das löst drei Dinge, die die Börse allein **nicht** lösen konnte:

1. **Bestands-Reset vs. Ausverkauf** — aus dem Bestand nicht unterscheidbar. Jetzt irrelevant.
2. **Der Cutoff des Ticket-Systems** nullt bei Türöffnung den Bestand. Für die Börse sah das wie ein schlagartiger Ausverkauf aus — der Kurs wäre beim eigenen Konzert an eine Preisgrenze gesprungen (im heutigen Modell: 250 „Verkäufe" → Boden).
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
14. **Testbestellungen bewegten den Kurs doch.** Der Webhook ignorierte sie — aber sie senken den Bestand wie jede echte Bestellung, und der Cron zählte sie. → Feld `ignoredTickets`. *(Stand heute: NUR noch für den Bestands-Notpfad — das Ticket-Ledger zählt Tests seit 18.07. gar nicht mit, der Webhook bucht im Ticket-Modus deshalb auch keine `ignoredTickets` mehr; siehe „Testbestellungen" unter Offen/Erledigt.)*

Außerdem: Uhr-Rücksprung driftete doppelt; `driftMultiplier` konnte unter seine eigene Validierungsgrenze fallen und die Börse **einfrieren** (`MIN_DRIFT`); der Byte-Guard maß nur die History statt des ganzen Zustands (`prepareForWrite`); Verkäufe am Deckel erzeugten keinen History-Punkt (Seite meldete „heute 0 verkauft") — *im heutigen Modell ist die entsprechende Grenze der Boden*; der Hero klemmte den Live-Preis an die Grenze und versprach damit einen Preis, den der Checkout nicht hält. *(driftMultiplier/MIN_DRIFT gibt es seit dem Additiv-Umbau vom 10.08. nicht mehr — die Einfrier-Klasse ist mit dem Akkumulator verschwunden.)*

### Runde 4 — die Kopplungs-Schicht (16.07., Fable + Codex-Gegencheck)

*Alle neun Befunde saßen in der Ticket-System-Kopplung vom 14./15.07. — also in Code, der NACH Runde 3 entstand. Der Engine-Kern hielt. Zum dritten Mal dasselbe Muster: Neuer Code an der Außennaht braucht eine eigene Audit-Runde.*

15. **Ein Alt-Ticket-Storno fror die Börse dauerhaft ein.** Im Ticket-Modus ist `totalSold = gueltigeTickets − startTickets − ignoredTickets` — von `startInventory` **algebraisch unabhängig**. Stornierte ein Evey-Alt-Käufer, bevor genug Neuverkäufe da waren, wurde `totalSold` negativ → Anomalie → Dauer-409, nicht einmal der Drift wurde geschrieben. Und `?rebaseline=1` (zieht nur `startInventory` nach) konnte es **nie** auflösen. → `soldCount` darf jetzt **negativ** werden — gewollt und symmetrisch; Rebaseline gibt es nur noch im Bestands-Modus (`400` im Ticket-Modus). *(Richtung seit 10.08.: Ein Storno unter die Baseline HEBT den Kurs über den Startpreis — weniger Community-Rabatt; der nächste Verkauf senkt ihn exakt zurück.)*
16. **`?start=1` bei schweigendem Ticket-System setzte eine falsche, irreversible Baseline.** `startTickets` wurde als 0 eingefroren; kam das System später online, zählten ALLE Alt-Tickets als frische Verkäufe (`trustedSales` ließ es durch) — der Kurs wäre schlagartig verfälscht (damals an den Deckel; im heutigen Modell stürzte er an den Boden und verschenkte Rabatt für Käufe von vor dem Start). Ein Timeout im Start-Moment genügte. → **Start-Gate**: konfiguriert + keine Antwort = `503 start_verweigert`.
17. **Ein Env-Wechsel kaperte die Wahrheitsquelle still.** `TICKETS_BASE_URL` nachträglich setzen → Bestands-Zustand las plötzlich das Ticket-Ledger (Alt-Tickets = frische Verkäufe); Envs entfernen → Ticket-Zustand fiel still auf den womöglich divergenten Bestand. → Die Quelle steht jetzt **im Zustand** (`quelle: "tickets" | "bestand"`, beim Start eingefroren). Bestands-Zustand + konfigurierte Envs → Hinweis, kein Wechsel. Ticket-Zustand + fehlende Envs → lauter `500`. Wechsel nur explizit: Börse neu aufsetzen.
18. **Eine absurde Ticket-Zahl konnte einen unlesbaren Zustand schreiben.** `gueltigeTickets: 10001` (oder `1e20`) passierte den `isInteger`-Check, wurde als `soldCount` geschrieben — und `parseState` lehnte den **selbst geschriebenen** Zustand beim nächsten Lesen ab (Grenze 10.000): Börse eingefroren bis zur Metafield-Handreparatur. → `isSafeInteger` + Obergrenze `MAX_SOLD_ABS` (geteilt zwischen Lesen und Schreiben); zusätzlich hält `applyInventory` an, bevor es einen nicht-repräsentierbaren `totalSold` schreibt.
19. **Aufstockung wurde als Massen-Storno verbucht.** Die Klemme prüfte nur die Verkaufs-Richtung: +50 Bestand bei ≥50 Verkäufen = 50 „Refunds", Kurssturz — der Code-Kommentar behauptete das Gegenteil. → Klemme gilt jetzt in **beide** Richtungen (`|newSales| > erlaubt`); kleine Bewegungen nach oben bleiben Stornos (von einem Storno mit Rückbuchung nicht unterscheidbar).
20. **Unlesbares `doorsUtc` schaltete den Türöffnungs-Stopp still ab.** `now >= NaN` ist immer `false` — und weil der Wert nicht `null` war, griff auch der `gigDateIso`-Fallback nicht. `scharf: "false"` (String) galt als scharf. → Antwort wird **strikt** validiert; Müll macht die ganze Antwort unbrauchbar (= nur-drift).
21. **Der Webhook unterlief im Ticket-Modus die kanonische Quelle.** Er buchte weiter über die Bestands-Mathe: konnte mehr als die bestätigte Bestellmenge übernehmen, und Cron + Webhook zählten dieselbe Bestellung vorübergehend doppelt (Fake-Refund-Zacken im Chart). → Im Ticket-Modus bucht der Webhook **keine Verkäufe** mehr; Testbestellungen werden weiterhin neutralisiert — in **beiden** Modi, denn das Ticket-System zählt sie im Berechtigungs-Set mit. ⚠️ **Bewusster Trade-off:** Der Preissprung kommt damit erst mit dem nächsten **Börsen-Cron (QStash, alle 5 Minuten)** — schlimmstenfalls ~10 Minuten nach dem Kauf (Ledger-Cron 5 min + Börsen-Tick 5 min). Für die Parodie egal.
22. **`getAccessToken` war der einzige Fetch ohne Timeout.** Ein hängender OAuth-Endpunkt → Plattform-Timeout ohne Logzeile, beim Webhook Retry-/Abo-Lösch-Risiko. → `AbortSignal.timeout` + Antwort-Validierung vor dem Cachen.
23. **Ein `lastTickAt` in der Zukunft deaktivierte den Drift für immer.** `parseState` akzeptierte jedes gültige Datum; `applyDrift` las die negative Zeit dauerhaft als Uhr-Rücksprung. → `parseState(raw, now)` weist Anker >24 h in der Zukunft ab.

Im Bestands-Notpfad bewusst geblieben (Restrisiko): Zählt der Cron einen Verkauf, bevor dessen verspäteter Webhook eintrifft, wird die Bestellung vorübergehend doppelt gezählt — der nächste Cron korrigiert binnen einer Stunde. Im Ticket-Modus (Normalfall) existiert der Pfad nicht mehr.

**Runde 4b — der Gegencheck AUF die Fixes** (Projektgesetz seit Runde 3) fand vier weitere Punkte, drei davon sofort gefixt:

- **Ungültiges `quelle`-Feld** (Admin-Tippfehler "ticket") wurde still als "bestand" gelesen — derselbe stille Quellenwechsel, den das Feld verhindern soll. → vorhandenes, aber ungültiges Feld wird jetzt **abgewiesen**; nur ein FEHLENDES Feld fällt auf "bestand" (korrekt: die Börse ist vor Runde 4 nie gestartet, Alt-Zustände können nur bestandsbasiert sein).
- **Echte Massen-Stornos im Bestands-Modus hatten keinen korrekten Auflösungsweg:** Die (neue) symmetrische Klemme hält einen Refund-Batch >8/h korrekt an — aber `?rebaseline=1` hätte die echten Stornos lautlos aus Kurs und Statistik gelöscht. → **Zweiter Hebel `?reconcile=<sprünge>`**: „der Sprung war echt" — er wird über den normalen tick()-Pfad übernommen und bewegt den Kurs. Bestätigt wird der **konkrete Wert aus der 409-Meldung** (z. B. `?reconcile=-10`), kein bloßes Ja: Hat sich der Bestand zwischen Sehen und Bestätigen weiterbewegt, hält der Hebel erneut an, statt ungefragt den neuen Sprung zu schlucken *(Befund aus dem Gegencheck auf den Gegencheck — Runde 4c, wenn man so will)*. Rebaseline und Reconcile schließen einander aus. Der 409-Hinweis erklärt beide Hebel.
- **`doorsUtc` ohne Zeitzone** wäre in der Server-Zeitzone interpretiert worden (Abschaltmoment umgebungsabhängig). → RFC-3339 mit explizitem Z/Offset erzwungen.
- 🟢 **ERLEDIGT (Ledger 18.07. + Webhook 10.08.):** Der `/api/verkaufszahl`-Endpunkt zählt Testbestellungen **gar nicht erst mit** (`entitlementsForOrder` schließt `test:true` global aus) — und seit 10.08. erhöht der Webhook im Ticket-Modus auch keine `ignoredTickets` mehr (sonst hätte der Cron die Testmenge DOPPELT abgezogen und den Kurs fälschlich gehoben). **Die Regel heute: Ticket-Modus ignoriert Tests vollständig; `ignoredTickets` existiert nur noch für den Bestands-Notpfad** (dort mit MAX_SOLD_ABS-Klemme).

---

## Sättigung an Deckel und Boden (seit 02.09.)

**Befund (31.08./02.09.):** Der rohe Kurs `22 − Verkäufe + Tage` lief am Deckel ungebremst weiter — 02.09. früh: Tag 18,7, 9 Verkäufe → roh 31,7 €, sichtbar 25 €. Käufe senkten roh, aber unsichtbar unter der Klemme: drei Kaufwellen am Deckel (26.08. 1×, 28.08. 2×, 01.09. 2×) bewegten den sichtbaren Preis um 0 €. Constantin meldete es am 02.09. („Käufe hatten keine Auswirkung"). Widerspricht dem Versprechen der Seite. Spiegelbild am Boden („Boden-Kleben") war bisher als Feature deklariert — Constantin 02.09.: **„Boden soll genauso funktionieren."**

**Modell (engine.ts):** State-Feld `saettigungEuro` (Euro, vorzeichenbehaftet). `priceOf = clamp(22 − Verkäufe + Tage − saettigungEuro)`. `applySaettigung` läuft in `tick()` als Schritt 0 — VOR den Verkäufen desselben Ticks (sonst schluckte sie den Kauf mit) und auch im Webhook-Pfad (rührt `lastTickAt` nicht an): Liegt roh über dem Deckel/unter dem Boden, wandert der Überschuss ins Feld, roh steht danach exakt am Rand. Folge: Kauf am Deckel = sofort 24 €, Flaute am Boden = sofort +1 €/Tag. Zwischen zwei Ticks darf roh den Rand um die angelaufenen Cent überschreiten (≤ 0,35 Cent bei */5) — `clamp` deckt das, der nächste Tick holt es zurück. Drift bleibt 1 €/Tag (Constantin 02.09., Alternativen +1 €/Woche, +0,25 €/Tag, 0 wurden abgelehnt).

**Alt-Zustand (`saettigungEuro: null`):** Ein Metafield ohne das Feld rechnet weiter wie vor dem 02.09. — bewusst KEIN Auto-Umstieg. Grund: Der Nachtrag liest die alten Preise als Zeugen des Verkaufsstands, das geht nur, solange kein Punkt schon im neuen Modell geschrieben wurde. Die Ampel meldet `nachtragOffen: true` (kein Alarm).

**Hebel `?nachtrag=1`** (Bearer `CRON_SECRET`, wie die anderen Hebel; beide Modi): hebt den Alt-Zustand einmalig ins neue Modell und rechnet die Historie nach, als hätte die Sättigung immer gegolten — (1) Verkaufsstand je Punkt rekonstruieren (innerhalb der Spanne exakt aus dem alten Preis, am Rand aus `qty` der sale/refund-Punkte; fängt auch Alt-Verkäufe, deren Punkte geopfert wurden), (2) Zeit von vorn abspielen: Rampe bis zum Deckel mit Knickpunkt, Käufe als Stufen, Sättigung an beiden Rändern, (3) `saettigungEuro` so setzen, dass `priceOf` jetzt den abgespielten Kurs ergibt. Vor der ersten Sättigung bleibt jeder Punkt unverändert. Der Hebel hat KEINEN eigenen Schreibpfad: Er hebt den Zustand und lässt den normalen Tick darauf weiterlaufen — Quellenabgleich im selben Request (ein Kauf seit dem letzten Tick zählt sofort), Preis-Write, Drift-Endpunkt per 10-Cent-Regel. Antwort `200 nachgetragen` (+ `saettigungEuro`, `punkte`). Geht die Historie nicht auf → `409 nachtrag_unklar`, nichts geschrieben. **Wiederholung ist erwünscht und idempotent:** bereits gehobener Zustand → `200 bereits_nachgetragen`, der normale Tick repariert dabei einen zuvor gescheiterten Preis-Write (Teilfehler „Zustand geschrieben, Preis nicht"). Bestands-Anomalie beim Heben → 409 wie sonst, nichts Halbes geschrieben; erst Anomalie auflösen, dann erneut heben. Live-Historie vom 02.09. liegt als Fixture unter `lib/ticker/fixtures/` — der Test rechnet exakt den Live-Fall (Deckel erreicht 21.08. 11:04, Stufen 24/23/23, Kurs 02.09. 05:00 = 23,31 €).

**Chart = Tagesansicht (02.09., Commit `e7b0f7d`, Constantin: „nicht genau mit Uhrzeit, sondern immer Tag und Ticketkauf"):** `lib/ticker/chart-days.ts` macht aus der Uhrzeit-Historie einen Punkt pro Kalendertag (Europe/Vienna): Kurs am Tagesende VON DER LINIE ABGELESEN (linear zwischen Punkten, Stufe bei `von` — exakt, keine Schätzung), heute = Live-Kurs; Tickets pro Tag = Käufe − Stornos. Chart: Tage gleich breit, Datums-Achse (~5 Stützen + „Heute"), grüne Ticketzahl unter Kauf-Tagen, Tooltip „Mi, 2.9. · 4 Tickets · 19,40 €" mit Delta zum Vortag. Die Uhrzeit-Historie im Zustand bleibt unverändert (nur Darstellung). Tests: `chart-days.test.ts` (Wien-Tagesgrenze inkl. Winterzeit, Rampen-Interpolation, Plateau vor Kauf, Ticket-Summen, Live-Fixture).

**Chart-Stufen (`von`):** sale/refund-Punkte tragen jetzt den Kurs unmittelbar davor. Der Chart zieht die Linie im Kauf-Moment senkrecht (am Deckel lag der letzte Punkt sonst tagelang zurück → schleichende Schräge) und rechnet das Tooltip-Delta gegen `von`.

**Byte-Budget, zweiter Befund:** Die Historie hatte am 02.09. nur 12 Punkte, 14.–19.08. fehlten komplett. Ursache: `applyZeit` schrieb bei JEDER 4-Stellen-Änderung einen Drift-Punkt (288/Tag) → das 50-KB-Budget opferte laufend die ältesten Punkte — samt der Käufe. Seit 02.09.: Drift-Punkt nur bei 10-Cent-Bewegung des Shop-Preises (10 Punkte pro Euro Rampe, Linie bleibt gerade); `pruneHistory` dünnt nur noch Drift aus (Ereignisse bleiben), `kappen`/`prepareForWrite` opfern Drift vor Ereignissen. Ein Kauf fällt damit nicht mehr aus dem Chart, solange die Historie unter 500 Punkten/50 KB bleibt.

**Codex-Review 02.09. (2 Runden, 6 Befunde, alle eingearbeitet):** (1) Rekonstruktion bei verlorenen Verkaufspunkten ist unterbestimmt — für den einzigen Alt-Zustand extern belegt (Deckel 30 € bis 18.08. 13:30, damals 3 Verkäufe bei 23 €); Restunsicherheit beim 4. Verkauf 20.08. ≤ 4 Cent / Knickpunkt ≤ 56 min, im Shopraster ohne Wirkung. (2) Sättigung läuft VOR und NACH den Verkäufen eines Ticks — sonst fraß ein Cron-Ausfall nach einer Kaufwelle die angelaufene Zeit. (3–5) Durchfall in den normalen Tick statt eigenem Schreibpfad (siehe oben). (6) Chart-Hover: bei gleichem x gewinnt das Ereignis vor dem Drift-Punkt.

**Nicht rückgebaut werden darf:** Reihenfolge Sättigung → Zeit → Verkäufe → Sättigung; `null`-Semantik des Alt-Zustands; Ereignis-Schutz im Pruning; Hebel ohne eigenen Schreibpfad.

## Kauf-Turbo (seit 11.08. abends)

> **🚨 BEFUND 02.09.: Der Turbo hat NIE gefeuert.** Vercel-Log: jeder Shopify-Aufruf von `/api/ticker/webhook` endet mit **401** (Retry-Muster 04:51/04:52/04:54/04:59/05:21 = Shopify-Wiederholungen), QStash-Log enthält in keinem Bestell-Fenster (26.08., 28.08., 01.09., 02.09.) eine Turbo-Message, Verzug Bestellung→Sale-Event real 7–14 min (Ledger-Cron + Börsen-Cron in Serie). Der „Beweis" vom 11.08. (Testkauf 22→21 € in 8 min) war der Cron, nicht der Turbo. **Ursache eingegrenzt:** Selbstsignierter POST mit dem Vercel-Secret → 200, falsches Secret → 401 ⇒ Route und Env sind korrekt, aber Shopify signiert mit einem ANDEREN Secret als `SHOPIFY_WEBHOOK_SECRET` (= Client-Secret `shpss_…`, identisch in now-website, tonherd-tickets und Keychain; der Token-Flow akzeptiert es weiter). Verdacht: zweites/rotiertes Client-Secret der Dev-Dashboard-App „Claude Code Admin" (Shopify signiert Webhooks mit dem aktuellen Secret, alte bleiben für Auth gültig). **Aufgeklärt (02.09., Dev Dashboard via Chrome):** Die App „Claude Code Admin" hat seit 9. Juni 2026 ZWEI Client-Secrets („Alt" 22:34, „Neu" 22:56). Keychain, now-website und tonherd-tickets halten „Neu" (Token-Flow läuft). Shopify-Doku: *„Shopify signs webhooks with your app's oldest unrevoked client secret"* → Webhooks sind mit „Alt" signiert → 401. **Fix (Commit `3796b75`):** `verifyShopifyHmac` nimmt eine Liste, die Route prüft `SHOPIFY_WEBHOOK_SECRET` UND `SHOPIFY_WEBHOOK_SECRET_ALT` (Vercel production, Wert = „Alt", per Kopieren-Button → Zwischenablage → `vercel env add`, nie im Chat). Immun gegen den Rotationszustand: heute signiert „Alt", nach einem Widerruf „Neu". **Live bewiesen 02.09. 08:03 MESZ:** Shopify wiederholte die Zustellung von Bestellung #1423 (Retry-Kette seit 07:33) → auf dem neuen Deploy `POST /api/ticker/webhook 200` → QStash 06:03:44 UTC drei Turbo-Messages → Ledger-Pass 06:03:55 (200), Börsen-Tick 06:05:00 (200), 06:06:46 (200). Delays 10/75/180 s stimmen. Kauf war bereits per Cron gebucht → Ticks idempotent, nichts doppelt. Selbstsignierter Test nach Deploy: ALT → 200, NEU → 200, falsch → 401. **Aufräumen (Constantin, irreversibel):** „Alt" im Dev Dashboard widerrufen, sobald sicher ist, dass nichts anderes damit authentifiziert (lokal nichts gefunden); danach `SHOPIFY_WEBHOOK_SECRET_ALT` entfernen.

Der Webhook (Shopify-Abo `orders/create` → `/api/ticker/webhook`, angelegt
via `scripts/boerse-turbo-setup.sh`) publiziert bei jeder ECHTEN
Ticket-Bestellung im Ticket-Modus drei **verzögerte QStash-Messages**:
Ledger-Pass des Ticket-Systems +10 s, Börsen-Tick +75 s und +180 s (Netz).
**Preis ~90 s nach Kauf statt bis zu 10 min** — ohne die Cron-Grundlast
anzuheben (~3 Messages pro Verkauf, QStash bleibt Free).

Leitplanken (`lib/ticker/turbo.ts` + Webhook):
- **Nur Beschleuniger, nie Tragwerk**: Der Webhook bucht weiterhin NICHTS
  (Blocker 21); er bittet die idempotenten Cron-Pfade um frühere Läufe. Der
  5-min-Cron bleibt der Fallback — fällt der Turbo aus, wird alles nur
  wieder so langsam wie vorher.
- **Antwort-Budget**: Gesamt-Deadline `WEBHOOK_DEADLINE_MS` (4 s) über der
  kompletten Verarbeitung — readTicker kann mit kaltem Token sonst allein
  Shopifys ~5-s-Fenster reißen (Abo-Lösch-Mechanik!). Bei Ablauf: Verkäufe
  200 + Fallback-Hinweis, TESTbestellungen 500 (Retry rettet die
  Neutralisierung im Bestands-Notpfad; recentOrders verhindert Doppelung).
- **`Upstash-Deduplication-Id` = `turbo-<orderId>-<zielIndex>`** —
  Shopify-Doppelzustellungen verstärken nichts, QStash verwirft Dubletten.
- Envs: `QSTASH_TOKEN`, `TICKETS_CRON_SECRET` (CRON_SECRET des
  Ticket-Systems), `SHOPIFY_WEBHOOK_SECRET` (= Client-Secret der Admin-App —
  Shopify signiert per API angelegte Abos damit). Fehlen sie: Turbo
  schlicht aus, kein Fehler.

---

## Schutzschichten

| Schutz | Wirkung |
|---|---|
| `TICKER_ENABLED` | **Not-Aus.** Ohne `"1"` tun beide Routen gar nichts. Umlegbar in Vercel **ohne Deploy**. |
| `?start=1` | Die Börse startet nur auf ausdrücklichen Wunsch. Sonst: `not_started`, Shop-Preis unangetastet. |
| **Start-Gate** | Ticket-System konfiguriert, aber keine Antwort → `503 start_verweigert` (sonst würde eine falsche Alt-Ticket-Baseline eingefroren). |
| **Quelle im Zustand eingefroren** | `quelle: "tickets" \| "bestand"` — Env-Änderungen wechseln die Wahrheitsquelle NIE still. Wechsel = Börse neu aufsetzen. |
| **Anomalie → 409, kein Schreibvorgang** | Unerklärliche Bestands-Sprünge werden nicht geraten (nur Bestands-Modus). Auflösung durch einen Menschen: `?rebaseline=1` („war eine Korrektur" — Baseline zieht nach, Kurs bleibt) oder `?reconcile=<sprünge>` („war echt" — GENAU der gemeldete Wert; der Sprung bewegt den Kurs, bei zwischenzeitlich bewegtem Bestand erneut 409). |
| Verkaufsgrenze: zeitskaliert **+ absolute Decke**, in **beide Richtungen** | normale Verkaufs-Staus zählen voll; weder ein Reset (Ausverkauf) noch eine Aufstockung (Massen-Storno) geht als echt durch |
| Strikte Ticket-Antwort-Validierung | `scharf === true`, `gueltigeTickets` sichere ganze Zahl ≤ 10.000, `doorsUtc` null oder echtes Datum — sonst gilt die ganze Antwort als unbrauchbar (nur-drift) |
| Bestell-Dedup (`recentOrders`, 300) | dieselbe Bestellung zählt nie zweimal |
| Compare-and-Swap + Preis-Abgleich | gleichzeitige Schreiber überschreiben einander nicht |
| `parseState` | verbogenes Metafield-JSON wird abgewiesen, statt als `NaN`-Preis in den Shop zu laufen |
| `prepareForWrite` (50 KB) | misst den **ganzen** Zustand; scheitert notfalls laut, statt das Metafield zu sprengen |
| Türöffnung → `beendet` | die Börse macht Schluss, bevor der Cutoff des Ticket-Systems zuschlägt |
| **Cron nie 5xx an den Scheduler** | Nackte Läufe antworten IMMER 200, das Ergebnis steht im Body (`status`). Beim 5-Minuten-Takt ist der nächste Lauf ohnehin der Retry; ein 5xx riskiert Retry-Stürme bzw. Trigger, die sich selbst abschalten (Lehre aus dem Ticket-System-Runbook). Menschliche Hebel (`?start/?rebaseline/?reconcile`) behalten sprechende Codes. |
| **Betriebsampel `/api/ticker/status`** + externer Wächter | Nur-Lese-Route (eigenes `MONITOR_SECRET`, `x-monitor-secret`): 200 = gut/bewusst aus, 503 = Mensch muss handeln (Cron steht **>30 min**, Anomalie wartet, Quelle falsch konfiguriert, Tracking aus, Preis außerhalb des legitimen Fensters, Uhr-Anomalie — und seit 10.08.: `TICKER_ENABLED` aus, obwohl `TICKER_EXPECTED_RUNNING=1`), 500 = Lesen unmöglich. Der Apps-Script-Wächter des Ticket-Systems prüft sie mit (siehe `tonherd-tickets/monitoring/watcher/`). |
| HMAC + zeitkonstanter Bearer/Monitor-Header | alle Routen fail-closed (401) |
| Mock in Produktion wirkungslos | doppelt verriegelt |

**EVEY-REGEL (bindend):** Geschrieben werden ausschließlich das **Preis-Feld** der Variante und das eigene Metafield `ticker.state`. NIEMALS Titel, Optionen, Inventar, Varianten-Struktur oder `evey.*`-Felder.

---

## Bewusst akzeptierte Restrisiken

Ehrlichkeit statt Sicherheitsversprechen — das hier ist **nicht** gelöst, sondern abgewogen:

1. **Der Preis hat kein Compare-and-Swap.** Shopify bietet keins. Zwei Schreiber im selben Millisekunden-Fenster können theoretisch einen veralteten Preis hinterlassen. Der Abgleich nach dem Schreiben macht das Fenster sehr klein, der 5-Minuten-Cron zieht jede Abweichung nach. Maximaler Schaden: wenige Cent, wenige Minuten. Die saubere Lösung (ein serialisierter Schreiber mit dauerhafter Queue) wäre Ticketmaster-Architektur für 250 Tickets.
2. **Ein echter Ausverkauf über 40 Tickets ohne einen einzigen Webhook** würde ebenfalls anhalten (409) und müsste von Hand aufgelöst werden. Die Alternative (raten) hat in beiden Richtungen Schaden angerichtet.
3. ~~Kein Monitoring.~~ **Erledigt (16.07.):** Betriebsampel `/api/ticker/status` + Anschluss an den bestehenden Apps-Script-Wächter des Ticket-Systems (mailt bei Zustandswechsel an system@tonherd.com). Aktivierung = Go-Live-Schritt (Env `MONITOR_SECRET` + Script-Property, siehe unten).
4. **Bewusst NICHT gebaut:** durable Queue, einzelner Writer-Prozess, Order-Ledger, Umbau auf `orders/paid`.

---

## Dateien

```
lib/ticker/config.ts         # ALLE Parameter — nur hier ändern, Tests sind config-basiert
lib/ticker/engine.ts         # pure Engine: priceOf(state, now), tick() [Anker/History + absolute Verkaufszahl],
                             #   parseState(), prepareForWrite(), Dedup, Anomalie
lib/ticker/tickets-quelle.ts # holt die Verkaufszahl vom Ticket-System
lib/ticker/shopify-admin.ts  # readTicker/writeTicker: CAS, getrennte Requests, Preis-Abgleich
lib/ticker/guards.ts         # tickerEnabled(), authorizeCron()
lib/ticker/hmac.ts           # Webhook-Signaturprüfung
lib/ticker/mock.ts           # Dev-Mock (nur mit TICKER_MOCK=1 + nicht-Prod)
lib/ticker/engine.test.ts    # Engine-Verhalten
lib/ticker/saettigung.test.ts # Sättigung Deckel/Boden, nachtrag (gegen die Live-Historie), von, Pruning
lib/ticker/fixtures/         # echte Live-Zustände als Test-Fixtures
lib/ticker/routes.test.ts    # ROUTEN gegen gefälschten Shopify-Server — hier hängen die
                             #   Blocker aus Runde 2 und 3 als Netz
app/api/ticker/tick/route.ts     # Cron (QStash): Quelle wählen, Drift, ?start=1,
                                 #   ?rebaseline=1, ?reconcile=<sprünge>, ?nachtrag=1; nie 5xx an den Scheduler
app/api/ticker/status/route.ts   # Betriebsampel für den externen Wächter (nur lesen)
app/api/ticker/webhook/route.ts  # orders/create: liest NUR Bestell-ID, Menge, Testflag
app/[locale]/tickets/page.tsx    # die Seite (zeigt den LIVE-Shop-Preis)
lib/ticker/chart-days.ts     # Tagesansicht für den Chart (Tagesende-Kurs, Tickets/Tag)
components/ticker/*.tsx          # price-chart (Tagesansicht), price-hero, ticker-tape, countdown,
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

0. **Generalprobe gegen das ECHTE Shopify** — ✅ **BESTANDEN (16.07.2026, Constantin).**
   Script: `scripts/boerse-generalprobe.ts` — legt ein Wegwerf-DRAFT-Produkt an, fährt den echten
   readTicker/writeTicker-Zyklus und löscht es wieder. Real bestätigt:
   Token-Flow · Metafield-Anlage (`compareDigest: null`) · parseState-Roundtrip über Shopifys
   echte JSON-Rückgabe · Preis-Write + Update (22,00 → 22,40 €) · **CAS: veralteter
   `compareDigest` → `STALE_OBJECT`, Zustand unberührt** (die Kern-Annahme des Systems) ·
   **Bonus: `compareDigest: null` bei existierendem Metafield → ebenfalls Conflict** — der
   Start-Pfad ist damit sogar gegen das Race "Webhook legt das Metafield zwischen Lesen und
   Start-Write an" geschützt (war bisher nur eine Annahme).
   Vor dem Go-Live gern noch einmal laufen lassen (Credentials ändern sich evtl.):
   ```bash
   cd ~/claude-projects/now-website && \
   SHOPIFY_ADMIN_CLIENT_ID=aec9c6c4f780fd9d0a082bd97e501392 \
   SHOPIFY_ADMIN_CLIENT_SECRET=$(security find-generic-password -a shopify -s tonherd-shopify-client-secret -w) \
   npx -y tsx scripts/boerse-generalprobe.ts
   ```
1. **Evey-Attendee-CSV exportieren.** Nach dem Entfernen der App sind die Daten weg.
2. **Ticket-System scharfschalten** (`/api/arm`). ☠️ Vorher **nicht** — der Cutoff würde das Produkt bei Türöffnung depublizieren und **Eveys Verkauf töten**.
3. **Bestands-Beweis** (nur noch für den Notpfad): Eine echte Testbestellung zeigt, ob Shopifys Bestand beim Kauf wirklich sinkt.
4. **Envs in Vercel setzen** (`now-website`):
   ```
   TICKER_ENABLED=1
   TICKER_EXPECTED_RUNNING=1                        ← ab Go-Live: „disabled" = Alarm statt Ruhe
   TICKETS_BASE_URL=https://tickets.tonherd.com     ← kanonische Domain, NIE *.vercel.app
   TICKETS_MONITOR_SECRET=<MONITOR_SECRET des Ticket-Systems>
   MONITOR_SECRET=<neues Nur-Lese-Secret für /api/ticker/status>
   SHOPIFY_ADMIN_CLIENT_ID=aec9c6c4f780fd9d0a082bd97e501392
   SHOPIFY_ADMIN_CLIENT_SECRET=<Schlüsselbund: tonherd-shopify-client-secret>
   ```
   ⚠️ Die beiden Shopify-Admin-Variablen **fehlten in Vercel komplett** (Fund 16.07.) — ohne sie kann
   die Börse gar nicht mit Shopify reden. Keine Audit-Runde sah das: Alle Tests mocken `fetch`.
   Genau dafür gibt es jetzt die **Generalprobe** (Schritt 0 unten).
5. **Deployen** (nur manuell, Skill `tonherd-web-deploy` — `git push` deployt **nicht**).
6. **QStash-Schedule anlegen** — es gibt KEINEN Vercel-Cron für den Tick (Hobby-Crons laufen nur 1×/Tag; deshalb steht in `vercel.json` auch keiner). Genau wie beim Ticket-System (`tonherd-tickets/docs/RUNBOOK.md`, Token im Schlüsselbund `tonherd-tickets-qstash-token`):
   ```bash
   Q=$(security find-generic-password -a qstash -s tonherd-tickets-qstash-token -w)
   curl -s -X POST "https://qstash-eu-central-1.upstash.io/v2/schedules/https://now-music.at/api/ticker/tick" \
     -H "Authorization: Bearer $Q" \
     -H "Upstash-Cron: */5 * * * *" \
     -H "Upstash-Method: GET" \
     -H "Upstash-Retries: 1" \
     -H "Upstash-Forward-Authorization: Bearer <CRON_SECRET>"
   ```
   ⚠️ `Upstash-Method: GET` ist zwingend (sonst POST → 405 bei jedem Lauf). Alle drei Schedules zusammen (Ticket-Cron */5 + Sync */15 + Börse */5): 672 Läufe/Tag = 67 % des QStash-Free-Limits (1000/Tag). *(Stand 06.08. — die alte Zahl 576 stammte von vor dem Sync-Cron.)*
7. **Wächter scharfschalten:** Im Apps-Script „Tonherd Tickets Waechter" (Konto info@tonherd.com) den aktualisierten `Code.gs` einspielen (prüft jetzt BEIDE Ampeln) und Script-Property `BOERSE_MONITOR_SECRET` = Wert aus Schritt 4 setzen. Einmal `pruefe` laufen lassen.
8. **Börse starten:** den Tick einmal mit `?start=1` aufrufen. Sie friert dabei die bereits verkauften Tickets als Baseline ein — die Alt-Käufer aus der Evey-Zeit reißen den Kurs **nicht** hoch. *(Wer früh gekauft hat, wird nicht bestraft. Wäre auch das Gegenteil der Idee.)* Liefert das Ticket-System gerade keine Zahl, verweigert der Start mit 503 — erst Schritt „Ticket-System scharfschalten" prüfen.

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
| 🟡 **Altes Client-Secret widerrufen** | 02.09.: App „Claude Code Admin" hat zwei Secrets; Webhook prüft beide (`SHOPIFY_WEBHOOK_SECRET_ALT`). Widerruf von „Alt" im Dev Dashboard = Constantin, irreversibel, nur wenn nichts anderes damit authentifiziert (lokal nichts gefunden). Danach `_ALT`-Env entfernen. Ohne Widerruf läuft alles. |
| 🟡 **Erster Kauf mit 90-s-Sprung** | Mechanik am 02.09. per Shopify-Retry belegt (200 → 3 QStash-Messages → Ticks). Beim nächsten frischen Kauf: Vercel-Log 200, QStash-Messages, Sale-Event ≈ 90 s nach Bestellzeit — dann Haken dran. |
| 🟡 **Reel-Skript v4** | `tonherd-instagram/analysis/reel-skript-ticket-boerse.md` (31.08.) erwähnt evtl. den Deckel-Überhang — gegenlesen, Mechanik ist jetzt wie versprochen. |
| 🟢 **Go-Live** | **vorbereitet (06.08.)** — Evey-Ablösung ist durch (27.07.); Ausführung = `./scripts/boerse-golive.sh` + Apps-Script-Property. ⚠️ Schritt „Ticket-System scharfschalten" heißt heute konkret: **Wien manuell armen** — das Auto-Arming des Ticket-Systems (seit 18.07., `lib/veranstalter-sync.ts`) greift erst doors−12h; bis dahin liefert `/api/verkaufszahl` `scharf:false`, der Start würde 503 verweigern. Das Script erledigt das. |
| 🟢 **Testbestellungen im Ledger** | **erledigt (18.07.)** — `entitlementsForOrder` schließt `test:true` global aus; `ignoredTickets` im Ticket-Modus obsolet. |
| 🟢 **Endpunkt mergen** | **erledigt (18.07.)** — `/api/verkaufszahl` ist gemergt + live (Codex fand beim Merge 2 Bugs: `used` ist HASH → hlen; `__leer__`-Sentinel zählte mit). |
| 🟡 **Umsatz-Report** | `tonherd-tickets/scripts/report.ts` rechnet `verkauft × aktueller Variantenpreis` → mit dynamischem Preis **sinnlos**. Bewusst nicht gefixt: Der Query ist auf Shopify-Kostenpunkte budgetiert, das gehört gemessen. |
| 🟢 **`read_all_orders`** | **erledigt** — gewährt über die gemeinsame App „Claude Code Admin". Die 60-Tage-Blende ist weg. |
| 🟢 **Rechtlich** | geklärt: Dynamic Pricing ist legal (nicht personalisiert, Checkout-Preis bindend). Leitplanken: nie als „Rabatt"/Statt-Preis bewerben (30-Tage-Regel), keine erfundene Knappheit. |
| 🟢 **Steuern** | 13 % (ermäßigt) kommen automatisch — Kategorie „Concerts & Entertainment Events" + Shopify Tax aktiv. |

---

## Die zwei Lehren dieses Projekts

1. **Die teuersten Fehler saßen nie im Code, sondern an der Naht zur Außenwelt.** Vier parallele Audit-Agenten, die nur die Engine prüften, fanden keinen der vier schwersten Fehler. Gefunden hat sie erst, wer gefragt hat: *Wie reagiert Shopify wirklich?* (Es stellt Webhooks mehrfach zu. Es kennt kein CAS für Preise. Sein Bestand fällt aus Gründen, die keine Verkäufe sind.)

2. **Fixes gehören genauso adversarial geprüft wie der Originalcode.** Zwei von fünf Fixes aus Runde 2 waren neue Blocker — einer davon hätte die Börse daran gehindert, bei guter Nachfrage überhaupt jemals hochzuzählen.
