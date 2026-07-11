// Alle Stellschrauben der Ticket-Börse an einem Ort.
// Preise in Euro (brutto), Zeiten in Stunden.
export const TICKER_CONFIG = {
  // Zielprodukt: "17.10.2026 Now. // Wien" (Album-Präsentation)
  productGid: "gid://shopify/Product/15354134921547",
  variantGid: "gid://shopify/ProductVariant/55861172863307",
  metafieldNamespace: "ticker",
  metafieldKey: "state",

  saleBumpEuro: 2.0,        // Preis-Sprung pro verkauftem Ticket
  graceHours: 24,           // Gnadenfrist nach letztem Verkauf
  // −0,15 %/h ≈ −3,5 %/Tag: kalibriert auf ~98 Tage bis zum Gig und 176 Tickets.
  // Totale Flaute erreicht den Boden erst kurz vorm Gig (statt nach 3 Wochen);
  // ~1 Verkauf alle 3 Tage hält den Kurs stabil.
  driftFactorPerHour: 0.9985,
  floorEuro: 1.5,           // bewusst lächerlicher Boden
  capEuro: 50.0,            // Deckel

  // Historie: letzte 7 Tage stündlich, älter nur alle 6 h (Metafield-Größenlimit)
  historyDenseDays: 7,
  historySparseHours: 6,

  gigDateIso: "2026-10-17T19:00:00+02:00",
  shopProductUrl:
    "https://shop.tonherd.at/products/17-10-2026-now-album-prasentation",
} as const;
