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

## Preis-Engine

### Regeln

| Ereignis | Wirkung |
|---|---|
| Ticket verkauft | **+2,00 € pro verkauftem Ticket**, sofort |
| 24 h Gnadenfrist nach letztem Verkauf | Preis stabil |
| Danach je Stunde ohne Verkauf | **−0,10 €** (−2,40 €/Tag Drift) |
| Boden | **5,00 €** |
| Deckel | **50,00 €** |
| Rundung | interner Kurs exakt im State; Shop-Preis auf 0,10 € gerundet (krumme Preise wie 23,40 € sind Teil der Dynamic-Pricing-Parodie) |

Kalibrierung auf kleine Venue: 1 Verkauf/Tag hält den Kurs ungefähr stabil; totale Flaute braucht ~8 Tage vom Startpreis bis zum Boden; jeder einzelne Käufer bewegt den Markt sichtbar. Alle Parameter liegen als Konstanten in einem Config-Modul und sind ohne Logik-Änderung justierbar.

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

## Tests

- Preis-Engine als pure Funktion (Zustand + Ereignis → neuer Zustand): Unit-Tests für Grenzen (Boden/Deckel), Gnadenfrist, Drift, Mehrfachverkauf, Rundung
- Webhook-Flow nach Go-Live mit Test-Bestellung verifizieren
- Deploy wie immer manuell via Skill `tonherd-web-deploy`

## Nicht-Ziele

- Kein zweiter Gig (Innsbruck) in V1 — System aber produkt-parametrisiert bauen, damit Erweiterung trivial ist
- Keine externe Datenbank, keine Shopify-App-Store-App
- Keine automatischen Social-Posts (evtl. später)
