import type { Metadata } from "next";
import Image from "next/image";
import { getMessages, type Locale } from "@/lib/i18n";
import { localeMetadata } from "@/lib/seo";
import { getNowProducts, formatPrice, type ShopifyProduct } from "@/lib/shopify";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ShoppingBag } from "lucide-react";

// Seite wird stündlich automatisch aktualisiert (ISR)
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  return {
    title: t.shop.title,
    description: t.shop.description,
    ...localeMetadata(locale as Locale, "/shop"),
  };
}

// Varianten-Label kürzen ("Default Title" ausblenden)
function variantLabel(variant: ShopifyProduct["variants"][number]): string | null {
  if (variant.title === "Default Title") return null;
  return variant.title;
}

// Preis-Anzeige: einzeln oder "ab €X"
function PriceDisplay({ product, locale }: { product: ShopifyProduct; locale: string }) {
  const min = product.priceRange.minVariantPrice;
  const max = product.priceRange.maxVariantPrice;
  const hasRange = min.amount !== max.amount;

  return (
    <span className="text-terracotta text-sm tracking-wide">
      {hasRange && (locale === "de" ? "ab " : "from ")}
      {formatPrice(min.amount, min.currencyCode)}
    </span>
  );
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getMessages(locale as Locale);
  const products = await getNowProducts();

  return (
    <section className="pt-28 md:pt-36 pb-[var(--spacing-section)] px-6">
      <div className="max-w-5xl mx-auto">
        {/* Überschrift */}
        <h1 className="font-heading font-light text-terracotta uppercase tracking-[0.2em] text-2xl md:text-3xl text-center mb-16">
          {t.shop.title}
        </h1>

        {products.length === 0 ? (
          <p className="text-sand/45 text-center">{t.shop.empty}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-10">
            {products.map((product) => (
              <ScrollReveal key={product.id}>
                <a
                  href={product.onlineStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  {/* Produktbild */}
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-4 shadow-lg shadow-black/30 bg-bg-card">
                    {product.images[0] ? (
                      <Image
                        src={product.images[0].url}
                        alt={product.images[0].altText || product.title}
                        fill
                        sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, 300px"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sand/20">
                        <ShoppingBag size={48} />
                      </div>
                    )}
                    {/* Hover-Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] uppercase tracking-[2px] bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">
                        {t.shop.view}
                      </span>
                    </div>
                  </div>

                  {/* Produktinfo */}
                  <h2 className="text-sand/80 text-sm font-medium group-hover:text-sand transition-colors leading-snug mb-1">
                    {product.title}
                  </h2>

                  {/* Varianten (Größen etc.) */}
                  {product.variants.length > 1 && (
                    <p className="text-sand/30 text-[10px] tracking-wide mb-1.5">
                      {product.variants
                        .map((v) => variantLabel(v))
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  {/* Preis */}
                  <PriceDisplay product={product} locale={locale} />
                </a>
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* Hinweis: Checkout über Shopify */}
        <ScrollReveal>
          <p className="text-sand/30 text-[10px] tracking-[2px] uppercase text-center mt-16">
            {t.shop.checkout_hint}
          </p>
        </ScrollReveal>
      </div>

      {/* JSON-LD Product Schema */}
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "Now. — Shop",
              itemListElement: products.map((product, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: {
                  "@type": "Product",
                  name: product.title,
                  image: product.images[0]?.url,
                  url: product.onlineStoreUrl,
                  brand: { "@type": "Organization", name: "Now." },
                  offers: {
                    "@type": "AggregateOffer",
                    lowPrice: product.priceRange.minVariantPrice.amount,
                    highPrice: product.priceRange.maxVariantPrice.amount,
                    priceCurrency: product.priceRange.minVariantPrice.currencyCode,
                    availability: product.variants.some((v) => v.availableForSale)
                      ? "https://schema.org/InStock"
                      : "https://schema.org/OutOfStock",
                  },
                },
              })),
            }),
          }}
        />
      )}
    </section>
  );
}
