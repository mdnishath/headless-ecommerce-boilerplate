import { wpFetch } from "@core/wordpress/client";
import type { Price } from "@core/commerce/price";

export type ProductImage = { sourceUrl: string; altText: string } | null;

export type ProductCardData = {
  databaseId: number;
  name: string;
  slug: string;
  type: string;
  image: ProductImage;
  prices: Price[];
};

export type ProductVariationData = {
  databaseId: number;
  name: string;
  prices: Price[];
};

export type ProductDetailData = ProductCardData & {
  description: string;
  variations: ProductVariationData[];
};

const CARD_FIELDS = `
  __typename
  databaseId
  name
  slug
  image { sourceUrl altText }
  prices { currency regular sale }
`;

const PRODUCTS_QUERY = `
  query Products($lang: String!, $first: Int!) {
    products(first: $first, where: { language: $lang }) {
      nodes { ${CARD_FIELDS} }
    }
  }
`;

const PRODUCT_QUERY = `
  query Product($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      ${CARD_FIELDS}
      description
      ... on VariableProduct {
        variations(first: 50) {
          nodes { databaseId name prices { currency regular sale } }
        }
      }
    }
  }
`;

type RawCard = {
  __typename: string;
  databaseId: number;
  name: string;
  slug: string;
  image: ProductImage;
  prices: Price[] | null;
};

function toCard(n: RawCard): ProductCardData {
  return {
    databaseId: n.databaseId,
    name: n.name,
    slug: n.slug,
    type: n.__typename,
    image: n.image,
    prices: n.prices ?? [],
  };
}

/** Catalog listing for a language. */
export async function getProducts(lang = "en", first = 24): Promise<ProductCardData[]> {
  const data = await wpFetch<{ products: { nodes: RawCard[] } }>(
    PRODUCTS_QUERY,
    { lang, first },
    ["products"],
  );
  return data.products.nodes.map(toCard);
}

/** Single product by slug, or null if not found. */
export async function getProductBySlug(slug: string): Promise<ProductDetailData | null> {
  const data = await wpFetch<{
    product:
      | (RawCard & {
          description: string | null;
          variations?: { nodes: ProductVariationData[] };
        })
      | null;
  }>(PRODUCT_QUERY, { slug }, [`product:${slug}`]);

  const p = data.product;
  if (!p) {
    return null;
  }
  return {
    ...toCard(p),
    description: p.description ?? "",
    variations: p.variations?.nodes ?? [],
  };
}
