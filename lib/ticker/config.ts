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

  // Preis = Startpreis × (1 + Kauf-Schub)^verkaufte × Drift^Stunden.
  // Kauf und Flaute wirken beide PROZENTUAL — dadurch ist die Wirkung eines
  // Kaufs immer gleich stark (nicht später entwertet), und ein Storno macht
  // exakt den Kauf rückgängig. +1 % ≈ +22 Cent bei 22 €.
  //
  // GLEICHGEWICHT: Kauf-Schub (1 %) × Verkäufe/Tag = Tages-Drift (1,43 %)
  // → bei ~1,4 Verkäufen/Tag (≈ halbe Halle bis zum Gig) steht der Kurs still.
  //   Weniger Nachfrage → Kurs fällt. Mehr → Kurs steigt Richtung Deckel.
  saleBumpPct: 0.01,

  // KEINE Gnadenfrist — und zwar nicht als Zahl 0, sondern gar nicht.
  // Sie ist zweimal zum Verhängnis geworden: Erst ließ sie bei ≥1 Verkauf/Tag
  // nie driften, danach fraß ihre Formel selbst bei Wert 0 noch rückwirkend
  // Flaute-Zeit, die vor dem Verkauf lag. Der Drift läuft jetzt ausschließlich
  // über die Zeit seit dem letzten Tick. Wer sie wieder einführen will, muss sie
  // als "Verkauf pausiert den Drift für die NÄCHSTEN n Stunden" bauen — nie
  // wieder als Klemme auf die Vergangenheit.

  // −0,06 %/h ≈ −1,4 %/Tag. Bei totaler Flaute erreicht der Kurs den Boden
  // erst kurz vor dem Gig (~100 Tage von 22 € auf 5 €), statt schon nach
  // 6 Wochen dort zu kleben. Drift ist ZEITBASIERT (siehe engine.ts) — die
  // Cron-Kadenz beeinflusst die Kurve nicht mehr.
  driftFactorPerHour: 0.9994,

  floorEuro: 5.0, // Boden — lächerlich niedrig, aber nicht gratis
  capEuro: 25.0, // Deckel — fair statt Konzern-Abzocke

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
  // durch und schösse den Kurs an den Deckel. 40 Tickets (16 % der Halle) ohne
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

  gigDateIso: "2026-10-17T19:00:00+02:00",
  shopProductUrl:
    "https://shop.tonherd.at/products/17-10-2026-now-album-prasentation",
} as const;
