# Ticket-Börse: Community-Pricing (Richtungs-Umkehr) — Design

**Datum:** 2026-08-10 · **Status:** von Constantin freigegeben („go")
**Ersetzt das Preismodell aus** `2026-07-11-ticket-boerse-design.md` — alles andere (Architektur, Schutzschichten, Design-Regeln) gilt weiter.

## Idee

Community-Pricing statt Flaute-Rabatt: **Jedes verkaufte Ticket macht den Preis für die Nächsten billiger.** Wer kauft, schenkt dem Nächsten 1 €. Flaute macht den Preis teurer — Warten kostet. Die Parodie-Pointe dreht sich von „Kurs fällt bei Desinteresse" zu „die Community kauft den Preis runter".

Kommunizierbare Kernbotschaft (Symmetrie ist Absicht):

> Jedes Ticket: −1 €. Jeder Tag: +1 €. **Ein Ticket pro Tag hält den Preis.**

## Preismodell

```
Preis = clamp( 22 € − 1 € × verkaufteTickets + 1 € × TageSeitStart, 8 €, 30 € )
```

| Parameter | Wert | Name in `lib/ticker/config.ts` |
|---|---|---|
| Startpreis | 22,00 € (fix, nicht „was im Shop steht") | `startPriceEuro` |
| Kauf-Senkung | **−1,00 €** je verkauftem Ticket | `saleDropEuro` |
| Zeit-Anstieg | **+1,00 €/Tag**, kontinuierlich (~4,2 Cent/h) | `riseEuroPerDay` |
| Boden / Deckel | **8 € / 30 €** | `floorEuro` / `capEuro` |
| Shop-Preis | auf 10 Cent gerundet | `shopPrice()` |

`saleBumpPct` und `driftFactorPerHour` entfallen ersatzlos.

**Gleichgewicht bei 1 Verkauf/Tag.** Mehr → Kurs fällt Richtung Boden (Community gewinnt). Weniger → Kurs steigt Richtung Deckel. Gig 17.10. in ~68 Tagen, 250 Plätze, ~27 verkauft → Ausverkauf bräuchte ~3/Tag: gewinnbares Spiel mit echter Spannung. Bewusst verworfen: +2 €/Tag (Kurs klebte bei realistischem Tempo fast dauernd am Deckel — Botschaft kippte optisch ins Gegenteil) und +0,50 €/Tag (kaum Spannung).

## Warum additiv statt multiplikativ

1. **Botschaft:** „genau 1 €" ist kommunizierbar; „−4,5 %" nicht.
2. **Sicherheit:** Kauf- und Zeit-Anteil sind unabhängige Summanden. Der teuerste Fehler des Projekts (Runde-2-Blocker 6: „jeder Verkauf löschte den aufgelaufenen Drift") ist strukturell unmöglich — es gibt nichts zu löschen. Die Tick-Reihenfolge-Regel („erst Drift, dann Verkäufe") wird gegenstandslos.
3. **Storno-Symmetrie bleibt exakt:** Storno = +1 € zurück.

## Zeit-Anteil: abgeleitet, kein Akkumulator

Der Zeit-Anteil wird aus einem beim Start eingefrorenen Timestamp (`startAtIso` im State) **abgeleitet**: `riseEuroPerDay × (now − startAt) / 24 h`. Kein akkumulierender `driftMultiplier` mehr.

- Preis bleibt **abgeleitet, nie gespeichert** (zentrale Sicherheitseigenschaft, unverändert).
- Uhr-Rücksprung ist selbstheilend (kein Doppel-Drift möglich); `MIN_DRIFT`-Einfrier-Klasse entfällt.
- `lastTickAt` bleibt für Betriebszwecke (Ampel „Cron steht", zeitskalierte Verkaufsgrenze), bestimmt aber nicht mehr den Preis.

## Verhalten an den Rändern

- **Boden-Kleben ist Feature:** Nach einer Kaufwelle liegt der rohe Wert unter 8 € — der Kurs bleibt am Boden „festgenagelt", bis der Zeit-Anstieg aufgeholt hat. Gewollt (Community-Lesart), wird nicht geklemmt.
- **Negativer `soldCount`** (Alt-Storno unter Baseline, Runde-4-Fix 15): Kurs kann über 22 € steigen; Deckel 30 € klemmt. Semantik bleibt symmetrisch.
- **Baseline:** `startTickets` friert die ~27 Alt-Käufer ein — Kurs startet bei 22 €, Alt-Käufe senken nicht.
- **Türöffnung → `beendet`:** unverändert.

## Was NICHT angefasst wird

Alle Naht-Schutzschichten und Audit-Blocker-Fixes (Runden 1–4b) bleiben wörtlich bestehen: Quelle-im-State, Start-Gate, Anomalie-409 + `?rebaseline`/`?reconcile`, zeitskalierte Klemme + absolute Decke (beide Richtungen), Bestell-Dedup, CAS + Preis-Abgleich, `parseState`-Strenge, `prepareForWrite` (50 KB), Cron-nie-5xx, Betriebsampel, HMAC, Not-Aus `TICKER_ENABLED`, Evey-Regel. Ebenso unangetastet: `boerse-golive.sh`, QStash-Setup, Apps-Script-Wächter, `tonherd-tickets`.

## Seite & Copy (DE + EN)

- Erklär-Sektion umdrehen auf die Kernbotschaft (oben). Richtungs-Formulierungen überall drehen („fällt bei Flaute" → „steigt bei Flaute" usw.).
- Parodie-Sektionen (Live-Betrachter, Trust-Badges, Bewertungen, Countdown-Note) und Gebühren-Zeile („Wir verstehen es auch nicht.") bleiben.
- Hero (nur der Preis) und Chart (linear) unverändert.
- **Rechtliche Leitplanken unverändert:** nie als „Rabatt/Statt-Preis" bewerben; der Zeit-Anstieg ist echt, keine erfundene Knappheit.

## Bewusst akzeptierte Trade-offs

- **Frühkäufer-Regret:** Wer bei 22 € kauft und den Kurs später bei 8 € sieht, hat 14 € „verschenkt" — an die Community. Das Framing trägt das; bewusste Entscheidung.
- **Free-Rider-Anreiz:** Warten wird belohnt, wenn andere kaufen. Der Zeit-Anstieg ist das Gegengewicht. Diese Spannung ist der Witz, nicht ein Bug.

## Tests & Doku

- Engine-Tests auf neue Formel umstellen (config-basiert, wie bisher); Routen-Tests strukturgleich.
- Neue Fälle: Boden-Kleben (roher Wert < Boden, Zeit holt auf), negativer `soldCount` über Startpreis, Additiv-Symmetrie (Kauf+Storno = Ausgangspreis exakt), Zeit-Anteil aus `startAtIso` (Uhr-Rücksprung).
- `HANDOFF.md`-Preismodell-Sektion + Memory nachziehen.
- Nach der Implementierung: adversarialer Gegencheck (Codex) — Projektgesetz seit Runde 3.

## Status quo bei Umsetzung

Börse läuft noch nicht (10.08. verifiziert: Shop-Preis exakt 22,00 €, kein Kurs auf der Seite) → reine Code-Änderung, keine State-Migration. Deploy kommt mit `boerse-golive.sh`.
