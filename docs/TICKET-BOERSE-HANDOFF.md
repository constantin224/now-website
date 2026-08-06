# Ticket-Börse — Handoff

**Stand: 2026-08-06** · alles auf `main` · **123/123 Tests grün** · Build + tsc sauber
**Die Börse LÄUFT NOCH NICHT — aber der Go-Live ist fertig vorbereitet.** Der Ticketpreis steht unverändert auf 22,00 € (live verifiziert 06.08.).

> ## GO-LIVE = EIN SCRIPT: `./scripts/boerse-golive.sh`
>
> Vorbereitet am 06.08. (Details unten in der Go-Live-Sektion, Erledigtes abgehakt):
> - Evey-Ablösung ist DURCH (27.07.), Wien 17.10. verkauft übers eigene Ticket-System — der alte Blocker ist weg.
> - 3 von 6 Vercel-Envs gesetzt (`TICKER_ENABLED`, `TICKETS_BASE_URL`, `SHOPIFY_ADMIN_CLIENT_ID`); die 3 Secret-Envs setzt das Script (der Permission-Classifier blockt Keychain→Vercel-Pipes für Claude).
> - Neues Nur-Lese-Secret im Schlüsselbund: `now-boerse-monitor-secret` (für `/api/ticker/status` + Apps-Script-Wächter).
> - 4 neue Parodie-Sektionen committet (Live-Betrachter, Trust-Badges, Bewertungen-Parodie, Countdown-Note) — Codex-reviewt.
> - ⚠️ **Wien MUSS vor dem Start manuell gearmt werden** (macht das Script): Auto-Arming des Ticket-Systems greift erst doors−12h (17.10. früh). Bis dahin liefert `/api/verkaufszahl` `scharf:false` → `?start=1` würde 503 verweigern, und die Börse bliebe im nur-drift-Modus (Verkäufe bewegten den Kurs nie).
> - Nach dem Script bleibt EIN Handgriff: Apps-Script-Property `BOERSE_MONITOR_SECRET` setzen (Anleitung druckt das Script am Ende).
>
> ## Für den nächsten Chat: DAS HIER ZUERST
>
> 1. **Dieses Dokument** — Status, Modell, was nicht rückgebaut werden darf.
> 2. **[`TICKET-BOERSE-x-TICKETSYSTEM.md`](TICKET-BOERSE-x-TICKETSYSTEM.md)** — die Kopplung mit dem Ticket-System (`tonherd-tickets`). Ohne das versteht man nicht, woher die Verkaufszahl kommt.
> 3. `docs/superpowers/specs/2026-07-11-ticket-boerse-design.md` — das Konzept (Design-Entscheidungen, Copy).

---

## Was das ist

Die Band **Now.** parodiert das Dynamic Pricing der großen Ticketkonzerne — nur **invers**: Der Ticketpreis für das Konzert am **17.10.2026 (The Loft, Wien)** **fällt**, wenn niemand kauft, und **steigt** bei jedem Verkauf. Der Preis im Shopify-Shop ändert sich dabei wirklich.

Die Seite `/de/tickets` + `/en/tickets` zeigt den Kurs, den Chart und die Parodie: Fake-Warteschlange („Position 1 von 1"), VIP-Packages, Saalplan mit genau einer Fläche, Gebühren-Fußnote („Wir verstehen es auch nicht.").

**Der Witz trägt nur, wenn die Mechanik ernst ist.** Deshalb die drei Audit-Runden.

---

## Wo es steht

| | |
|---|---|
| Code | `main` |
| Tests | 119/119 (Engine + Routen gegen einen gefälschten Shopify-Server) · Naht real verifiziert: Generalprobe 16.07. BESTANDEN (siehe Go-Live Schritt 0) |
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

### Runde 4 — die Kopplungs-Schicht (16.07., Fable + Codex-Gegencheck)

*Alle neun Befunde saßen in der Ticket-System-Kopplung vom 14./15.07. — also in Code, der NACH Runde 3 entstand. Der Engine-Kern hielt. Zum dritten Mal dasselbe Muster: Neuer Code an der Außennaht braucht eine eigene Audit-Runde.*

15. **Ein Alt-Ticket-Storno fror die Börse dauerhaft ein.** Im Ticket-Modus ist `totalSold = gueltigeTickets − startTickets − ignoredTickets` — von `startInventory` **algebraisch unabhängig**. Stornierte ein Evey-Alt-Käufer, bevor genug Neuverkäufe da waren, wurde `totalSold` negativ → Anomalie → Dauer-409, nicht einmal der Drift wurde geschrieben. Und `?rebaseline=1` (zieht nur `startInventory` nach) konnte es **nie** auflösen. → `soldCount` darf jetzt **negativ** werden: Ein Storno unter die Baseline senkt den Kurs unter den Startpreis — gewollt und symmetrisch (der nächste Verkauf hebt ihn exakt zurück). Rebaseline gibt es nur noch im Bestands-Modus (`400` im Ticket-Modus).
16. **`?start=1` bei schweigendem Ticket-System setzte eine falsche, irreversible Baseline.** `startTickets` wurde als 0 eingefroren; kam das System später online, zählten ALLE Alt-Tickets als frische Verkäufe (`trustedSales` ließ es durch) — Kurs an den Deckel, bestraft wäre, wer früh gekauft hat. Ein Timeout im Start-Moment genügte. → **Start-Gate**: konfiguriert + keine Antwort = `503 start_verweigert`.
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
- 🔴 **OFFEN (gehört ins Ticket-System, nicht hierher):** Wird eine **neutralisierte Testbestellung später storniert**, fällt sie aus dem Ledger, aber `ignoredTickets` bleibt erhöht → der Kurs wäre **dauerhaft** um die Testmenge zu niedrig. Richtiger Fix: Der `/api/verkaufszahl`-Endpunkt (`tonherd-tickets`, Branch `feat/verkaufszahl-endpunkt`, ungemergt) soll **Testbestellungen gar nicht erst mitzählen** — dann braucht der Ticket-Modus `ignoredTickets` überhaupt nicht mehr. Bis dahin: Generalprobe nur mit Not-Aus oder Testprodukt (stand ohnehin schon in der Kopplungs-Doku).

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
| **Betriebsampel `/api/ticker/status`** + externer Wächter | Nur-Lese-Route (eigenes `MONITOR_SECRET`, `x-monitor-secret`): 200 = gut/bewusst aus, 503 = Mensch muss handeln (Cron steht >3 h, Anomalie wartet, Quelle falsch konfiguriert, Tracking aus), 500 = Lesen unmöglich. Der Apps-Script-Wächter des Ticket-Systems prüft sie mit (siehe `tonherd-tickets/monitoring/watcher/`). |
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
app/api/ticker/tick/route.ts     # Cron (QStash): Quelle wählen, Drift, ?start=1,
                                 #   ?rebaseline=1, ?reconcile=<sprünge>; nie 5xx an den Scheduler
app/api/ticker/status/route.ts   # Betriebsampel für den externen Wächter (nur lesen)
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
