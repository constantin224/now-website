# NOW.-Ticket-Börse — Inverses Dynamic Pricing (Design)

**Datum:** 2026-07-11
**Projekt:** now-website (now-music.at, Next.js App Router, Vercel)
**Status:** Design von Constantin freigegeben

## Idee

Große Acts nutzen Dynamic Pricing, um bei hoher Nachfrage Preise zu treiben. Now. dreht das um: kleine Band, kleine Venue, wenig Nachfrage — der Ticketpreis reagiert ehrlich auf den (kaum vorhandenen) Markt. Die Seite karikiert dabei die großen Ticketanbieter: Arena-Tour-Ästhetik in vollem Ernst, der Witz entsteht aus der Fallhöhe zur Club-Realität. Nie zwinkern, nie „lol".

## Zielprodukt

- **Gig:** „17.10.2026 Now. // Wien" (Album-Präsentation)
- Shopify-Produkt: `gid://shopify/Product/15354134921547`
- Variante „General Admission": `gid://shopify/ProductVariant/55861172863307`
- Ausgangslage bei Projektstart: 22,00 € Brutto, 176 Stück Inventar
- Store: `03e6c1.myshopify.com` (shop.tonherd.at), Plan Basic

## Evey-Constraint (KRITISCH, entdeckt 2026-07-11)

Das Ticket-Produkt wird von der Shopify-App **Evey Events & Tickets** verwaltet (Metafield `evey.event`, Event-ID 226105, Venue „The Loft", Beginn 17.10.2026 **19:00**, 24 Tickets bereits verkauft). Evey hat keine öffentliche API. Befunde:

- Evey speichert **keinen Preis** — `ticket_types` referenziert nur `variant_id`; Preis lebt allein auf der Shopify-Variante, Checkout/Abrechnung macht Shopify. Preis-Updates per Admin API kollidieren daher nicht mit Eveys Datenmodell.
- Evey-Doku warnt generisch vor direktem Varianten-Editieren in Shopify (Sync-Risiko) — kritisch ist das Zerreißen der `variant_id`-Verknüpfung (Varianten anlegen/löschen/umbenennen), nicht das Preis-Feld.

**Verbindliche Schutzregeln:**
1. Writes ausschließlich auf das **Preis-Feld** der bestehenden Variante (`productVariantsBulkUpdate` mit `{id, price}`) + eigenes Metafield `ticker.state`. NIEMALS Titel, Optionen, Inventar, Varianten-Struktur oder `evey.*`-Metafelder anfassen.
2. **Rebaseline bei Stornos:** wird das Inventar extern erhöht (Storno/Evey-Korrektur), passt die Engine `soldCount` nach unten an (ohne Preisänderung) — sonst verschluckt der nächste echte Verkauf den Preis-Sprung.
3. **Evey-Kompatibilitäts-Gate vor Go-Live** (vor Cron-/Webhook-Aktivierung): Preis per API um 0,10 € ändern → Evey-Dashboard prüfen (neuer Preis sichtbar, Event intakt) → Test-Bestellung → gültiges Evey-Ticket (QR) kommt an → zurücksetzen. Erst bei Bestehen geht das System live. Fällt das Gate: Plan B = Preisänderung via Playwright durch das Evey-Admin-UI (lokaler Runner), Architektur sonst unverändert.

## Preis-Engine

### Regeln

| Ereignis | Wirkung |
|---|---|
| Ticket verkauft | **+2,00 € pro verkauftem Ticket**, sofort |
| 24 h Gnadenfrist nach letztem Verkauf | Preis stabil |
| Danach je Stunde ohne Verkauf | **−0,5 % vom aktuellen Kurs** (exponentieller Drift) |
| Boden | **1,50 €** — bewusst lächerlich; Drift wird nach unten automatisch immer langsamer und kriecht asymptotisch dorthin |
| Deckel | **50,00 €** |
| Rundung | interner Kurs exakt im State; Shop-Preis auf 0,10 € gerundet (krumme Preise wie 23,40 € sind Teil der Dynamic-Pricing-Parodie) |

Kalibrierung auf kleine Venue (Drift −0,5 %/h ≈ −11 %/Tag): bei totaler Flaute fällt der Kurs von 22 € in ~1 Woche auf 10 €, in ~2 Wochen auf 5 €, und braucht insgesamt ~3 Wochen bis zum 1,50-€-Boden — der Sinkflug wird unten von selbst quälend langsam (letzter Halb-Euro dauert Tage). Ein einzelner Verkauf (+2 €) wirft den Kurs sichtbar zurück; ~1 Verkauf/Tag hält ihn im oberen Bereich stabil. Alle Parameter liegen als Konstanten in einem Config-Modul und sind ohne Logik-Änderung justierbar.

### Verkaufszählung (PII-frei)

Verkäufe werden **nicht** aus Webhook-Payloads gezählt, sondern aus Shopify-Inventar abgeleitet: `verkauft = Start-Inventar − aktuelles inventoryQuantity` der Variante. Der Webhook dient nur als Trigger. Umgeht die Kundendaten-Beschränkung des Basic-Plans komplett und ist idempotent (Doppel-Webhooks harmlos).

### Zustand

Lebt in Shopify selbst — Metafield am Produkt, Namespace/Key `ticker.state`, Typ JSON:

```json
{
  "startInventory": 176,
  "lastSaleAt": "2026-07-11T12:00:00Z",
  "soldCount": 0,
  "history": [
    { "t": "2026-07-11T12:00:00Z", "price": 22.0, "event": "init" }
  ]
}
```

`event` ∈ `init | sale | drift`. Keine externe Datenbank.

## Architektur (alles in now-website)

### API-Routen

1. **`/api/ticker/webhook`** — Ziel des Shopify-Webhooks `orders/create`.
   - HMAC-Signatur prüfen (`SHOPIFY_WEBHOOK_SECRET`), Payload-Inhalt ignorieren
   - Inventar frisch lesen → neue Verkäufe erkennen → Preis rauf → Variant-Preis via `productVariantsBulkUpdate` + Metafield updaten → Ticket-Seite revalidieren
   - Reaktion in Sekunden nach Kauf
2. **`/api/ticker/tick`** — Vercel-Cron **stündlich** (`vercel.json`, zusätzlich zum bestehenden Revalidate-Cron).
   - Auth: `CRON_SECRET` (Vercel-Authorization-Header)
   - Liest Inventar ebenfalls frisch → verpasste Verkäufe werden hier nachgeholt (selbstheilend), sonst Drift-Regel anwenden

### Shopify-Anbindung

- Admin-API-Token per Client-Credentials-Grant, pro Aufruf frisch (24-h-Token), wie `bin/shopify-admin-api.sh`
- Webhook-Registrierung einmalig via `webhookSubscriptionCreate` auf `https://now-music.at/api/ticker/webhook`
- Env-Vars auf Vercel (server-seitig): `SHOPIFY_ADMIN_CLIENT_ID`, `SHOPIFY_ADMIN_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `CRON_SECRET`. Secrets niemals ins Repo.

### Fehlerfälle

- Webhook verpasst → stündlicher Tick korrigiert aus Inventar
- Shopify/Vercel down → Preis bleibt stehen, nichts bricht
- Doppel-Webhook → idempotent (Zählung aus Inventar)
- History-Wachstum: bei stündlichen Einträgen über Monate unkritisch (< 5.000 Punkte), Metafield-Limit weit entfernt

## Ticket-Seite `/[locale]/tickets` (DE/EN)

Ticketmaster-Karikatur, todernst gespielt:

- **Arena-Ästhetik**: fette Zahlen, „OFFIZIELLE TICKET-PLATTFORM der NOW. World Tour 2026 (1 Termin)"
- **Live-Kurs** groß, Tagesänderung ±% (grün/rot)
- **Nachfrage-Badge** aus echten Daten: „⚡ ERHÖHTE NACHFRAGE — 2 Tickets in den letzten 24 Stunden"
- **Fake-Warteschlange**: „Tickets sichern" → „Du bist Position 1 von 1 in der Warteschlange" → 3 s Spinner → Shopify-Checkout
- **Gebühren-Parodie**: „Servicegebühr 0 €. Bearbeitungsgebühr 0 €. Dynamische-Preis-Gebühr 0 €. Wir verstehen es auch nicht."
- **Preis-Chart** (leichtes Inline-SVG, kein Chart-Framework): „Preisentwicklung — 100 % transparent, im Gegensatz zu den anderen", mit Allzeithoch/Allzeittief
- **Analysten-Kommentare**: Bandmitglieder mit Foto, regelbasierte todernste Markteinschätzungen
- Shows-Seite bekommt Badge/Link zur Ticket-Seite
- Hausregeln gelten: Effekte nur Desktop ≥768px, Mobile statisch, Text-Opacity ≥35 %
- Textfeinschliff gemeinsam mit Constantin beim Bauen

Datenfluss Seite: Server Component liest Metafield (Admin API) + rendert; Revalidierung durch Webhook/Tick via `revalidatePath`.

## Design-Vorbilder (gefetcht 2026-07-11, Screenshots in `docs/design-refs/`)

**Wichtigstes Design-Prinzip (Constantin, 2026-07-11):** Die Vorbilder liefern NUR die Muster und Tropen (Knappheits-Badges, Warteschlange, Saalplan, VIP-Packages, Gebühren-Fußnoten, Countdown) — NICHT die Optik. Optisch bleibt die Seite 100 % in der Now.-Designsprache der bestehenden Website (dunkel, elegant, bestehende Typo/Farben/Abstände wie auf den anderen Seiten). Die oeticket/Ticketmaster-Ästhetik selbst ist explizit unerwünscht („sieht einfach nur komisch aus"). Der Witz: Konzern-Tropen, aber schöner ausgeführt als beim Konzern.

Karikatur-Ziel: oeticket (Eventim-Plattform, AT-Marktführer) + Ticketmaster AT. Muster, die die Seite todernst nachbauen soll:

**oeticket-Eventseite** (`oeticket-event-toten-hosen.jpeg`):
- Dunkler Hero mit Tour-Key-Art, Sterne-Rating (★★★★★ 4,8), „Tickets ab € 80,90*" mit Sternchen
- Datums-Karte: Datum-Kachel links, Venue, blauer „Weiter"-CTA rechts
- „VIP Packages"-Aufklapper: „VIP - Sitzplatz ab € 302,00*"
- „Ticketalarm – kein Event mehr verpassen!" E-Mail-Capture
- „Fan-Report": Bewertungen/Rezensionen mit Sternen
- Trust-Icons-Reihe („Ihre Vorteile": Sicherheit, Originaltickets vom Marktführer, schnelle Lieferung)
- Fußnote: „*Angezeigte Preise inkl. gesetzl. USt., Servicegebühr von max. € 3,00, 1,50 Internationaler Sales Fee…"

**Ticketmaster-Künstlerseite** (`tm-helene-fischer.jpeg`):
- Rote Knappheits-Badges: „WENIGE ODER KEINE TICKETS VERFÜGBAR"
- VIP-Karussell mit goldener „VIP bei ticketmaster"-Typo, Package-Namen in Anführungszeichen („GENAU DIESES GEFÜHL" BACKSTAGE-TOUR PACKAGE, GOLDEN CIRCLE PACKAGE)
- Countdown-Timer (Tage/Std/Min/Sek) am Seitenende vor schwarzem Live-Foto-Collage-Band
- Event-Listen-Rows: Datums-Kachel + Venue + blauer „Tickets"-Button
- FAQ-Akkordeon, „Fans besuchten auch"-Grid

**Ticketmaster-Kaufseite** (`tm-kaleo-kaufseite.jpeg`):
- Saalplan-SVG: graue „BÜHNE", blaue Flächen „STEHPARKETT"/Galerien, Zoom-Controls, Legende Standard (blau) / VIP (gold)
- Tabs „Saalplan anzeigen" / „Beste verfügbare Plätze", Filter-Dropdowns „Alle Preise" / „Alle Ticket-Arten"
- Info-Leiste: „Wichtige Infos: Im Ticketpreis ist eine Buchungsgebühr von 2,50 € enthalten. Presented by Live Nation"
- Leerer Warenkorb-Zustand: „Tickets im Saalplan auswählen — Ihre Auswahl wird hier hinzugefügt"

**Ticketmaster ausverkauft** (`tm-event-kaufseite.jpeg`):
- Gelber Warnbalken „Dieses Event findet in weniger als 24 Stunden statt — Online sind keine Tickets mehr verfügbar…"

Parodie-Übersetzungen für Now. (Auswahl, Feinschliff beim Bauen): Saalplan mit einer einzigen Fläche „STEHPARKETT (alle)", Sterne-Rating von 3 Bewertungen (die Band), „VIP Package: Bier mit der Band ab € 302,00*" o.ä., Trust-Icons („Originaltickets direkt von der Band, weil es sonst niemand verkauft"), Sternchen-Fußnote die erklärt dass es keine Gebühren gibt, Countdown bis zum Gig, Knappheits-Badge invertiert („VIELE TICKETS VERFÜGBAR. WIRKLICH VIELE.").

## Tests

- Preis-Engine als pure Funktion (Zustand + Ereignis → neuer Zustand): Unit-Tests für Grenzen (Boden/Deckel), Gnadenfrist, Drift, Mehrfachverkauf, Rundung
- Webhook-Flow nach Go-Live mit Test-Bestellung verifizieren
- Deploy wie immer manuell via Skill `tonherd-web-deploy`

## Nicht-Ziele

- Kein zweiter Gig (Innsbruck) in V1 — System aber produkt-parametrisiert bauen, damit Erweiterung trivial ist
- Keine externe Datenbank, keine Shopify-App-Store-App
- Keine automatischen Social-Posts (evtl. später)
