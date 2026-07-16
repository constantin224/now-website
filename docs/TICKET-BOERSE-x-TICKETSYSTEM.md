# Ticket-Börse × Ticket-System — wo sich die beiden berühren

**Zwei Systeme, ein Shopify-Produkt** (`15354134921547`, Gig 17.10.2026):

| System | Repo | Was es tut |
|---|---|---|
| **Ticket-Börse** | `now-website` | ändert den **Preis** der Variante (inverses Dynamic Pricing) |
| **Ticket-System** | `tonherd-tickets` | **Einlass**: QR, Scanner, Gästeliste, Verkaufs-Stopp bei Türöffnung |

Sie wissen voneinander — und müssen es auch, sonst treten sie sich gegenseitig auf die Füße. Dieses Dokument sagt, wo.

---

## 1. Die Börse rät nicht mehr — sie fragt

**Das war der teuerste Konstruktionsfehler der Börse:** Sie leitete ihre Verkaufszahl aus Shopifys `inventoryQuantity` ab. Der Bestand fällt aber auch aus Gründen, die keine Verkäufe sind — eine Admin-Korrektur, ein Evey-Sync, ein abgeschaltetes Tracking (liefert `0`!), und vor allem der **Cutoff des Ticket-Systems**, der bei Türöffnung den Bestand auf null setzt. Für die Börse sah jedes davon wie ein schlagartiger Ausverkauf aus.

Das Ticket-System rät nicht. `lib/entitlement.ts` ist die eine Regel:

```
cancelledAt gesetzt              → kein Ticket
Status ∉ {PAID, PARTIALLY_REFUNDED} → kein Ticket
sonst: ein Eintrag je Ticket
```

Das Ergebnis liegt fertig in Redis (`evt:{pid}:entitled`). **Die Börse holt sich diese Zahl** über `GET /api/verkaufszahl?pid=…` und rechnet damit statt mit dem Bestand.

### Was das löst

| Problem der Börse | Vorher | Jetzt |
|---|---|---|
| Bestands-Reset vs. Ausverkauf | nicht unterscheidbar → geraten | irrelevant, der Bestand zählt nicht mehr |
| Cutoff nullt den Bestand | sah aus wie 250 Verkäufe → Kurs am Deckel | die Zahl bleibt, wie sie ist |
| **Storno ohne Rückbuchung** | Ticket blieb **für immer** als verkauft gezählt | Ticket-System sieht den Storno, Kurs fällt |
| Doppelt zugestellte Webhooks | eigene Dedup-Liste nötig | das Ticket-System dedupliziert ohnehin |
| Testbestellungen | mussten einzeln neutralisiert werden | (weiterhin nötig, s.u.) |

### Wie es verdrahtet ist

`now-website`, zwei Umgebungsvariablen:

```
TICKETS_BASE_URL=https://tickets.tonherd.com
TICKETS_MONITOR_SECRET=<derselbe MONITOR_SECRET wie im Ticket-System>
```

⚠️ **Die kanonische Domain nehmen, nicht `*.vercel.app`.** Leitet Vercel die alte
Adresse auf die neue weiter, geht der `x-monitor-secret`-Header über den Redirect
womöglich verloren — die Börse bekäme dann ein 401 und fiele stillschweigend in den
Notpfad zurück. Ohne Slash am Ende (der Code hängt `/api/verkaufszahl` an).

`MONITOR_SECRET` ist **schreibrechtlos** (`lib/admin-auth.ts:statusAuthOk`) — damit kann die Börse weder scharfschalten noch Geräte anlegen. Sie bekommt Zahlen, sonst nichts.

**Ohne diese Variablen läuft die Börse im alten Bestands-Modus** (mit allen Klemmen und der Anomalie-Erkennung). Das ist der Notpfad, kein Dauerzustand.

**Die Quelle wird beim Börsenstart im Zustand EINGEFROREN** (`quelle: "tickets" | "bestand"`, seit Audit-Runde 4). Env-Änderungen wechseln sie nie still: Ein Bestands-Zustand bleibt beim Bestand (Hinweis in der Cron-Antwort), ein Ticket-Zustand ohne Envs schlägt laut mit `500` fehl. Wechsel nur explizit — Börse neu aufsetzen. Und `?start=1` wird **verweigert** (`503`), wenn die Envs gesetzt sind, das System aber gerade keine Zahl liefert — sonst würde `startTickets = 0` eingefroren und die Alt-Tickets zählten später als frische Verkäufe.

**Die Antwort wird strikt validiert:** `scharf === true`, `gueltigeTickets` als sichere ganze Zahl ≤ 10.000, `doorsUtc` null oder echtes Datum. Wer hier Müll liefert, dessen ganze Antwort gilt als unbrauchbar → nur-drift. (Vorher: ein kaputtes `doorsUtc` schaltete den Türöffnungs-Stopp still ab, und `gueltigeTickets: 1e20` hätte einen Zustand geschrieben, den `parseState` selbst nicht mehr liest.)

**Stornos unter die Alt-Ticket-Baseline sind ein Normalfall:** Storniert ein Evey-Alt-Käufer, fällt `soldCount` unter 0 und der Kurs unter den Startpreis — gewollt, symmetrisch, kein Fehler. (Vorher: Dauer-409, Börse eingefroren, `?rebaseline=1` wirkungslos.)

### Die drei Zustände

| Lage | Was die Börse tut | `quelle` in der Antwort |
|---|---|---|
| Ticket-System antwortet, Event **scharf** | rechnet mit der echten Zahl | `ticket-system` |
| Ticket-System antwortet **nicht** / Event nicht scharf | **nur driften** — Verkaufszahl bleibt unangetastet | `nur-drift` |
| Ticket-System nicht konfiguriert | alter Bestands-Modus | `bestand` |

**Warum bei Ausfall nicht einfach auf den Bestand zurückfallen?** Weil beide Quellen auseinanderliegen können (ein Storno ohne Rückbuchung senkt den Bestand nie). Ein stiller Quellenwechsel erzeugte einen Preissprung aus dem Nichts. Lieber ein paar Stunden nur driften.

---

## 2. Türöffnung: die Börse macht Schluss

Der **Cutoff** (`lib/cutoff.ts` → `unpublishAndZeroInventory`) nullt bei Türöffnung den Bestand und nimmt das Produkt aus dem Shop.

Die Börse hört **vorher** von selbst auf (`status: "beendet"`). Sie nimmt dafür `doorsUtc` aus der Antwort des Ticket-Systems; fehlt die, gilt `gigDateIso` aus ihrer Config. Danach bleibt der Preis stehen, wo er war.

Ohne diesen Stopp: Dauer-Alarm im Cron — und **vor der Härtung vom 14.07.** wäre der Kurs beim eigenen Konzert an den Deckel gesprungen, während die Leute in der Schlange stehen.

---

## 3. Die Webhook-Falle — sie gilt für beide

Das Ticket-System hat seine Webhooks **gesperrt** (`scripts/webhooks-setup.ts` bricht ab). Grund: Der Endpunkt verarbeitete Bestellungen synchron, Shopify erwartet Antwort in ~5 s, wiederholt sonst ~8× über ~4 h — und **löscht dann das Abo**. Man hätte Webhooks registriert, sie liefen scheinbar, und wären bis zum Abend still wieder weg.

**Der Webhook der Börse lief in dieselbe Falle.** Er macht mehrere Shopify-Roundtrips hintereinander. Deshalb:

- Der **Preis-Abgleich** (ein zusätzlicher Roundtrip) ist im Webhook-Pfad **abgeschaltet** (`writeTicker(..., mitAbgleich = false)`). Der nächste Cron-Lauf (alle 5 Minuten) macht ihn.
- **Im Ticket-Modus bucht der Webhook seit Runde 4 gar keine Verkäufe mehr** (kein Schreibvorgang, sofortige Antwort). Seine Bestands-Mathe konnte mehr als die bestätigte Bestellmenge übernehmen, und Cron + Webhook zählten dieselbe Bestellung vorübergehend doppelt. Der Ledger-Cron des Ticket-Systems (alle 5 min) macht den Preissprung nur unwesentlich später. Einzige verbleibende Webhook-Aufgabe im Ticket-Modus: **Testbestellungen neutralisieren** (`ignoredTickets`).
- Im Bestands-Notpfad bucht er weiterhin (dort ist er die einzige dedup-geschützte Quelle).

**Wenn du je den Börsen-Webhook registrierst:** vorher die Laufzeit messen. Über ~3 s → auf „vormerken und sofort 200 antworten" umbauen, so wie es für das Ticket-System geplant ist.

---

## 4. Offener Befund: der Umsatz-Report wird durch die Börse falsch

`tonherd-tickets/scripts/report.ts:39`:

```js
const price = Number(totals.product.variants.nodes[0]?.price ?? 0);
gross = Math.round(sold * price * 100) / 100;
```

Verkaufte Tickets **×** dem *aktuellen* Variantenpreis. Mit dynamischen Preisen hat jeder Käufer einen anderen Preis gezahlt — irgendwo zwischen 5 € und 25 €. Der Report multipliziert alle mit dem Preis vom Abrufzeitpunkt. Das Ergebnis ist beliebig.

Der Handoff des Ticket-Systems kennt das Problem bereits für zwei Preisstufen („bei >1 Preisstufe Umsatz manuell aus Shopify"). Mit der Börse wird aus einer Ungenauigkeit eine sinnlose Zahl.

**Nicht gefixt, bewusst.** Der richtige Fix wäre, den Umsatz aus den `lineItems` der Bestellungen zu summieren (Preis zum Kaufzeitpunkt) statt aus der Variante. Dafür bräuchte der Query ein Geldfeld — und `listOrdersByProduct` ist **auf Shopify-Kostenpunkte budgetiert** (Kommentar in `lib/shopify.ts`: „jeder lineItem-Node kostet 3", die Paginierung ist darauf abgestimmt). Ein zusätzliches Feld verschiebt diese Rechnung; verschätzt man sich, läuft der Cron in die Drosselung. Das gehört gemessen, nicht geraten.

---

## 5. Geteilte Shopify-App

Beide Systeme benutzen dieselbe App **„Claude Code Admin"** (`aec9c6c4f780fd9d0a082bd97e501392`, Repo `tonherd-shopify`).

- **`read_all_orders` ist gewährt** (App-Version `claude-code-admin-4`). Damit ist die 60-Tage-Blende weg — auch für die Börse. Der frühere offene Punkt in ihrem Handoff ist erledigt.
- **Das Ratenlimit teilen sie sich** (Shopify drosselt pro App: 50 Kostenpunkte/Sekunde). Beide Crons laufen alle 5 Minuten (jeweils QStash — Vercel-Hobby kann nur 1×/Tag), am Eventabend kommen die Scans dazu. Bisher unkritisch — aber ein Grund mehr, warum die Börse am Eventtag schweigt (siehe 2).

---

## 6. Reihenfolge beim Go-Live

1. **Evey-Attendee-CSV exportieren.** Nach dem Entfernen der App sind die Daten weg.
2. **Ticket-System scharfschalten** (`/api/arm`) — erst wenn Evey durch ist. ☠️ Vorher **nicht**: Der Cutoff würde das Produkt bei Türöffnung depublizieren und Eveys Verkauf töten.
3. **Bestands-Beweis**: Eine echte Testbestellung zeigt, dass Shopifys Bestand beim Kauf wirklich sinkt. *(Nur noch für den Notpfad relevant — die Börse rechnet jetzt mit der Ticket-Zahl. Trotzdem prüfen: Der Notpfad ist die Rückfallebene.)*
4. **Börse starten** (`?start=1`). Sie friert dabei die bereits verkauften Tickets als Baseline ein — die Alt-Käufer aus der Evey-Zeit reißen den Kurs also **nicht** hoch. Wer früh gekauft hat, wird nicht bestraft.

---

## 7. Testbestellungen — weiterhin ein Sonderfall

Eine Shopify-Testbestellung ist für beide Systeme eine normale, bezahlte Bestellung: Sie senkt den Bestand **und** landet im Berechtigungs-Set. Die Börse rechnet sie über `ignoredTickets` heraus (der Webhook erkennt `test: true`).

**Vorsicht:** Kommt eine Testbestellung *ohne* Webhook durch (Webhook nicht registriert), sieht die Börse sie nur über die Ticket-Zahl — und zählt sie als Verkauf. Für die Generalprobe deshalb entweder den Not-Aus setzen (`TICKER_ENABLED=0`) oder das separate Testprodukt benutzen, wie es das Ticket-System ohnehin tut.

**Und die Lifecycle-Falle (Runde 4b, 🔴 offen):** Wird eine neutralisierte Testbestellung später **storniert**, verschwindet sie aus dem Ledger — `ignoredTickets` in der Börse bleibt aber erhöht. Der Kurs wäre dann **dauerhaft** um die Testmenge zu niedrig; es gibt kein Gegenereignis (nur `orders/create`). Der richtige Fix liegt im Ticket-System: `/api/verkaufszahl` (Branch `feat/verkaufszahl-endpunkt`) soll Testbestellungen **gar nicht erst mitzählen** — danach braucht der Ticket-Modus `ignoredTickets` nicht mehr. Bis dahin gilt die Generalproben-Regel oben umso mehr.
