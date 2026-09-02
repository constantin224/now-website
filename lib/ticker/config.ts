// Alle Stellschrauben der Ticket-Börse an einem Ort.
// Preise in Euro (brutto), Zeiten in Stunden.
export const TICKER_CONFIG = {
  // Zielprodukt: "17.10.2026 Now. // Wien" (Album-Präsentation)
  productGid: "gid://shopify/Product/15354134921547",
  variantGid: "gid://shopify/ProductVariant/55861172863307",
  metafieldNamespace: "ticker",
  metafieldKey: "state",

  // Startpreis der Börse — bewusst fix, nicht "was gerade im Shop steht".
  // Wird nur beim allerersten Tick verwendet (Init), danach nie wieder.
  startPriceEuro: 22.0,

  // Preis = clamp( Startpreis − saleDropEuro × verkaufte + riseEuroPerDay × Tage ).
  // ADDITIV, nicht prozentual: "genau 1 €" ist die Botschaft der Seite —
  // jedes Ticket senkt exakt gleich stark, ein Storno hebt exakt zurück.
  // Nebengewinn: Kauf- und Zeit-Anteil sind unabhängige Summanden. Der teuerste
  // Fehler des Projekts (Runde 2: "jeder Verkauf löschte den aufgelaufenen
  // Drift") ist damit strukturell unmöglich — es gibt nichts zu löschen.
  //
  // GLEICHGEWICHT: 1 Verkauf/Tag hält den Kurs exakt still. Mehr → er fällt
  // Richtung Boden (die Community "kauft den Preis runter"), weniger → er
  // steigt Richtung Deckel. Vom START: 14 Netto-Verkäufe bis zum Boden und
  // 3 Flaute-Tage bis zum Deckel (vom Deckel aus wären es maximal 17 bis
  // zum Boden — der Zeit-Anteil verschiebt die Distanz laufend).
  saleDropEuro: 1.0,

  // KEINE Gnadenfrist — und zwar nicht als Zahl 0, sondern gar nicht.
  // Sie ist zweimal zum Verhängnis geworden (siehe HANDOFF, Runde 2). Im
  // additiven Modell wäre sie ohnehin ein Fremdkörper: Der Zeit-Anteil hängt
  // ausschließlich an startAtIso, kein Ereignis kann ihn pausieren.

  // +1 €/Tag, KONTINUIERLICH (~4,2 Cent/Stunde) — kein Mitternachts-Sprung.
  // Der Zeit-Anteil ist aus startAtIso ABGELEITET (siehe engine.ts) — die
  // Cron-Kadenz beeinflusst die Kurve nicht. Chart-Punkte entstehen nur bei
  // einer 10-Cent-Bewegung des Shop-Preises (Byte-Budget, siehe applyZeit).
  //
  // SÄTTIGUNG (02.09.): An Deckel und Boden verpufft der Überschuss (Feld
  // `saettigungEuro` im Zustand) — der rohe Kurs bleibt exakt am Rand. Sonst
  // lief er am Deckel tagelang weiter hoch, und Käufe am Deckel bewegten den
  // sichtbaren Preis um 0 € (Befund 31.08./02.09., drei Kaufwellen unsichtbar).
  riseEuroPerDay: 1.0,

  floorEuro: 8.0, // Boden — lächerlich niedrig, aber nicht gratis
  // Deckel — Flaute macht teurer, aber nie Konzern-Abzocke. 18.08. von 30 auf
  // 25 gesenkt: Der Kurs kletterte real Richtung 30, das strafte statt zu
  // spielen — die Börse soll Tickets GÜNSTIGER machen, nicht teurer.
  capEuro: 25.0,

  // Sicherheitsklemme gegen Inventar-Pannen — gilt NUR für den Cron, der
  // Verkäufe aus dem Bestand ableitet. Ein absurder Sturz kommt dort nicht von
  // Käufen, sondern aus einer Admin-Korrektur, einem Evey-Sync oder
  // deaktiviertem Bestands-Tracking (liefert 0!).
  //
  // Die Grenze WÄCHST MIT DER ZEIT (siehe `erlaubteVerkaeufe` in engine.ts):
  // `maxSalesPerTick` ist der Sockel, `maxSalesPerHour` die Steigung. Eine feste
  // Grenze war eine Falle — fallen die Webhooks aus oder läuft der Cron nur
  // täglich, sammeln sich ganz normale Verkäufe an, und die Engine hätte sie als
  // "Panne" verworfen. Die Börse hätte bei guter Nachfrage nie hochgezählt.
  //
  // 8/Stunde deckt jeden realistischen Ansturm ab. `maxSalesAbsolute` ist die
  // harte Decke darüber: Ohne sie wären nach drei Tagen Cron-Ausfall 576
  // "Verkäufe" erlaubt — ein Bestands-Reset von 250 auf 0 ginge als Ausverkauf
  // durch und drückte den Kurs auf den Boden. 40 Tickets (16 % der Halle) ohne
  // eine einzige Webhook-Bestätigung glaubt die Börse niemandem; darüber hält
  // sie an und fragt (siehe `InventoryAnomalyError`).
  maxSalesPerTick: 5,
  maxSalesPerHour: 8,
  maxSalesAbsolute: 40,

  // Der Webhook ist von der Klemme ausgenommen: HMAC-signiert, kennt die echte
  // Bestellmenge, wird dedupliziert — eine 6er-Bestellung zählt dort voll.

  // Bereits verarbeitete Bestellungen (gegen Shopifys Doppelzustellung).
  // Shopify stellt Webhooks mindestens einmal zu — Wiederholungen sind Normal-
  // betrieb, kein Randfall. 300 > die Zahl aller je möglichen Bestellungen für
  // diesen Gig (250 Plätze), also kann eine Bestellung nie aus dem Gedächtnis
  // fallen und dadurch bei einem späten Retry doppelt zählen.
  recentOrdersMax: 300,

  // Historie: letzte 7 Tage vollständig, älter auf 6h-Raster; hartes Limit,
  // damit das Shopify-Metafield nie überläuft (das würde die Börse einfrieren)
  historyDenseDays: 7,
  historySparseHours: 6,
  historyMaxPoints: 500,

  // Shopify-Metafields fassen 65.535 Byte. Wir schreiben nie über dieses
  // Budget hinaus — die Historie wird notfalls weiter ausgedünnt. Der Abstand
  // ist Absicht: Ein voll gelaufenes Metafield würde die Börse einfrieren.
  metafieldMaxBytes: 50_000,

  // ---- Kauf-Nachlauf (seit 02.09. abends, ersetzt den QStash-Turbo) ----
  // Der Webhook antwortet Shopify sofort und zieht DANACH (Next.js `after()`,
  // auf Vercel via waitUntil) die Kette selbst nach: Ledger-Pass des
  // Ticket-Systems MIT Bestell-ID (`?order=<id>` — zieht genau diese Bestellung
  // per ID nach, kein gedrosselter Voll-Abgleich, kein Suchindex), dann der
  // Börsen-Tick. Preis ~10–15 s nach dem Kauf, NULL QStash-Messages (das
  // Free-Limit von 1000/Tag gehört damit allein den drei Schedules).
  // Ziele = DIESELBEN URLs wie die QStash-Schedules (bewährt; kanonische
  // Domains — über einen Redirect ginge der Authorization-Header verloren).
  // Der 5-min-Cron beider Systeme bleibt der Fallback; siehe lib/ticker/nachlauf.ts.
  nachlauf: {
    ledgerUrl: "https://tonherd-tickets.vercel.app/api/cron",
    tickUrl: "https://now-music.at/api/ticker/tick",
    // Vorlauf vor dem ersten Ledger-Pass: `orders/create` feuert beim Anlegen —
    // Karte/Shop Pay sind da schon „paid", PayPal manchmal erst Sekunden später.
    vorlaufMs: 5_000,
    // Zweiter Ledger-Versuch, wenn der erste die Bestellung nicht bestätigt.
    wiederholungMs: 8_000,
    ledgerTimeoutMs: 8_000,
    tickTimeoutMs: 15_000,
    // Summe im schlimmsten Fall: 5 + 8 + 8 + 8 + 15 = 44 s < maxDuration 60 s der Webhook-Route.
  },

  gigDateIso: "2026-10-17T19:00:00+02:00",
  shopProductUrl:
    "https://shop.tonherd.at/products/17-10-2026-now-album-prasentation",
} as const;
