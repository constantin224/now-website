// Album-Preorder „A Little Love" — feste Karte oben auf der Shop-Seite.
//
// Warum statisch: Das Shopify-Produkt ist (Stand 20.08.2026) nur auf dem
// Channel „Online Store" publiziert, nicht auf „Storefront-Test", über den
// die Website Produkte zieht. Damit der Link trotzdem sofort sichtbar ist,
// steht die Karte hier fest. Sobald das Produkt auch in der Collection
// erscheint, wird es im Raster dedupliziert (gleicher handle).

export const albumPreorder = {
  handle: "now-a-little-love-album-preorder",
  url: "https://shop.tonherd.com/products/now-a-little-love-album-preorder",
  title: "A Little Love",
  /** Veröffentlichung — ab diesem Tag wechselt die Karte von „Preorder" auf „Jetzt bestellen" */
  releaseDate: "2026-08-28",
  cover: "https://cdn.shopify.com/s/files/1/0673/0956/8314/files/a-little-love-album-cover.jpg?v=1786048764",
  formats: [
    { de: "Vinyl + Digital", en: "Vinyl + Digital", price: "30.00" },
    { de: "CD + Digital", en: "CD + Digital", price: "15.00" },
    { de: "Digital", en: "Digital", price: "10.00" },
  ],
} as const;

/** true solange der VÖ-Tag noch nicht erreicht ist (Vergleich in Europe/Vienna) */
export function isPreorderPhase(now: Date = new Date()): boolean {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(now); // YYYY-MM-DD
  return today < albumPreorder.releaseDate;
}
