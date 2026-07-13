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

  // Keine Gnadenfrist: Der Drift läuft immer. Mit Gnadenfrist würde bei
  // ≥1 Verkauf/Tag NIE gedriftet — der Kurs klebte dauerhaft am Deckel.
  graceHours: 0,

  // −0,06 %/h ≈ −1,4 %/Tag. Bei totaler Flaute erreicht der Kurs den Boden
  // erst kurz vor dem Gig (~100 Tage von 22 € auf 5 €), statt schon nach
  // 6 Wochen dort zu kleben. Drift ist ZEITBASIERT (siehe engine.ts) — die
  // Cron-Kadenz beeinflusst die Kurve nicht mehr.
  driftFactorPerHour: 0.9994,

  floorEuro: 5.0, // Boden — lächerlich niedrig, aber nicht gratis
  capEuro: 25.0, // Deckel — fair statt Konzern-Abzocke

  // Sicherheitsklemme: Mehr als so viele "Verkäufe" in EINEM Tick sind real
  // unmöglich (Käufe feuern einzeln per Webhook). Ein größerer Inventar-Sturz
  // stammt aus einer Admin-Korrektur, einem Evey-Sync oder deaktiviertem
  // Bestands-Tracking (liefert 0!) — er darf den Preis NICHT bewegen.
  maxSalesPerTick: 5,

  // Historie: letzte 7 Tage vollständig, älter auf 6h-Raster; hartes Limit,
  // damit das Shopify-Metafield nie überläuft (das würde die Börse einfrieren)
  historyDenseDays: 7,
  historySparseHours: 6,
  historyMaxPoints: 800,

  gigDateIso: "2026-10-17T19:00:00+02:00",
  shopProductUrl:
    "https://shop.tonherd.at/products/17-10-2026-now-album-prasentation",
} as const;
