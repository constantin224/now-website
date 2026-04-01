import { createStorefrontApiClient } from "@shopify/storefront-api-client";

const client = createStorefrontApiClient({
  storeDomain: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!,
  apiVersion: "2026-04",
  publicAccessToken: process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!,
});

const COLLECTION_ID = `gid://shopify/Collection/${process.env.SHOPIFY_COLLECTION_NOW_ID?.trim()}`;

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  images: { url: string; altText: string | null }[];
  variants: {
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    availableForSale: boolean;
  }[];
  onlineStoreUrl: string;
}

// Now.-Collection aus Shopify laden
export async function getNowProducts(): Promise<ShopifyProduct[]> {
  const { data, errors } = await client.request(`
    query NowCollection($collectionId: ID!) {
      collection(id: $collectionId) {
        products(first: 20) {
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              images(first: 4) {
                edges {
                  node { url altText }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price { amount currencyCode }
                    availableForSale
                  }
                }
              }
              onlineStoreUrl
            }
          }
        }
      }
    }
  `, {
    variables: { collectionId: COLLECTION_ID },
  });

  if (errors?.graphQLErrors?.length) {
    console.error("Shopify API Fehler:", errors.graphQLErrors);
    return [];
  }

  interface ProductEdge {
    node: Omit<ShopifyProduct, "images" | "variants"> & {
      images: { edges: { node: ShopifyProduct["images"][number] }[] };
      variants: { edges: { node: ShopifyProduct["variants"][number] }[] };
    };
  }

  const products: ProductEdge[] = data?.collection?.products?.edges || [];
  return products.map((edge) => ({
    ...edge.node,
    images: edge.node.images.edges.map((e) => e.node),
    variants: edge.node.variants.edges.map((e) => e.node),
  }));
}

// Preis formatieren (z.B. "15.0" -> "€15,00")
export function formatPrice(amount: string, currencyCode: string = "EUR"): string {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: currencyCode,
  }).format(parseFloat(amount));
}
