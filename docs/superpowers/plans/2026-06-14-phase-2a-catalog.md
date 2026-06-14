# Phase 2a: Catalog Data Layer + Storefront Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the seeded WooCommerce catalog on the Next.js storefront — a server-side GraphQL client, typed product fetchers, a product-listing page (home) and a product-detail page — so `http://localhost:3000` shows real products with images and per-currency prices.

**Architecture:** Server Components fetch from the LocalWP GraphQL endpoint via a small `wpFetch` helper (ISR with cache tags). Typed fetchers live in `src/core/wordpress/`; price formatting in `src/core/commerce/`; presentational components in `src/components/product/`. Locale is hardcoded `en` and currency `USD` for this slice — the `[locale]` routing + currency negotiation are Phase 3. Codegen is deferred; fetchers are hand-typed for now.

**Tech Stack:** Next.js 15 RSC + `fetch` cache tags, `next/image`, `Intl.NumberFormat`, the headless-bridge `prices`/`language` GraphQL fields from Phase 1.

**Preconditions:** LocalWP `ecommerce-backend` running with the seeded catalog (Phase 1d). GraphQL at `http://ecommerce-backend.local/graphql`. The dev machine resolves `ecommerce-backend.local` (LocalWP hosts entry). Repo root `E:\Ecommerce Platform`.

---

### Task 1: GraphQL client + typed product fetchers + price helpers + env + image config

**Files:**
- Create: `src/core/wordpress/client.ts`, `src/core/wordpress/products.ts`, `src/core/commerce/price.ts`
- Modify: `next.config.ts` (image remotePatterns), `.env.example`
- Create: `.env.local` (gitignored — local endpoint)

- [ ] **Step 1: `src/core/wordpress/client.ts`** — server-only GraphQL fetch with cache tags

```ts
const ENDPOINT =
  process.env.WP_GRAPHQL_ENDPOINT ?? "http://ecommerce-backend.local/graphql";

type GraphQLError = { message: string };

/** Server-side GraphQL POST to WordPress with ISR cache tags. */
export async function wpFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  tags: string[] = [],
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { tags, revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`WP GraphQL HTTP ${res.status} at ${ENDPOINT}`);
  }
  const json = (await res.json()) as { data?: T; errors?: GraphQLError[] };
  if (json.errors?.length) {
    throw new Error(`WP GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("WP GraphQL: empty response");
  }
  return json.data;
}
```

- [ ] **Step 2: `src/core/commerce/price.ts`** — currency selection + formatting

```ts
export type Price = { currency: string; regular: string; sale: string };

/** Choose the price entry for a currency, falling back to the first available. */
export function pickPrice(prices: Price[], currency = "USD"): Price | null {
  return prices.find((p) => p.currency === currency) ?? prices[0] ?? null;
}

/** Format a decimal-string amount as localized currency. */
export function formatPrice(amount: string, currency = "USD", locale = "en-US"): string {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) {
    return "";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}
```

- [ ] **Step 3: `src/core/wordpress/products.ts`** — typed fetchers

```ts
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
```

- [ ] **Step 4: Add image remote pattern to `next.config.ts`**

The seeded product images live at `http://ecommerce-backend.local/wp-content/uploads/...`. Add an `images` key to the `nextConfig` object (alongside the existing `webpack` key — do NOT remove the webpack/white-label logic):

```ts
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "ecommerce-backend.local" },
    ],
  },
```

- [ ] **Step 5: Env**

Append to `.env.example`:
```
# WordPress GraphQL endpoint (server-side fetch target)
WP_GRAPHQL_ENDPOINT=http://ecommerce-backend.local/graphql
```
Create `.env.local` (gitignored by the existing `.env*` rule) with the same line so the running dev server picks it up:
```
WP_GRAPHQL_ENDPOINT=http://ecommerce-backend.local/graphql
```

- [ ] **Step 6: Verify the fetcher resolves real data**

```powershell
npm run typecheck
```
Expected: exit 0.

Then a runtime fetch check (Node, mirrors what the RSC will do):
```powershell
node -e "fetch('http://ecommerce-backend.local/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'{ products(first:3, where:{language:\"en\"}){ nodes { name prices { currency regular } } } }'})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.data.products.nodes)))"
```
Expected: prints 3 EN products with names + USD/EUR prices. (Proves the Node runtime resolves `ecommerce-backend.local` and the query shape is right.)

- [ ] **Step 7: Commit**

```powershell
git add src/core/wordpress src/core/commerce next.config.ts .env.example
git commit -m "feat(catalog): WP GraphQL client + typed product fetchers + price helpers"
```

---

### Task 2: Product components + listing page + detail page

**Files:**
- Create: `src/components/product/product-card.tsx`, `src/components/product/product-grid.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/product/[slug]/page.tsx`

- [ ] **Step 1: `src/components/product/product-card.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatPrice, pickPrice } from "@core/commerce/price";
import type { ProductCardData } from "@core/wordpress/products";

export function ProductCard({ product }: { product: ProductCardData }) {
  const price = pickPrice(product.prices);
  const sale = price?.sale ? price.sale : null;

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        {product.image?.sourceUrl ? (
          <Image
            src={product.image.sourceUrl}
            alt={product.image.altText || product.name}
            width={600}
            height={750}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>
      <h3 className="mt-2 text-sm font-medium">{product.name}</h3>
      {price ? (
        <p className="text-sm">
          {sale ? (
            <>
              <span className="mr-2 text-muted-foreground line-through">
                {formatPrice(price.regular, price.currency)}
              </span>
              <span className="font-semibold text-primary">
                {formatPrice(sale, price.currency)}
              </span>
            </>
          ) : (
            <span className="font-semibold">
              {formatPrice(price.regular, price.currency)}
            </span>
          )}
        </p>
      ) : null}
    </Link>
  );
}
```

- [ ] **Step 2: `src/components/product/product-grid.tsx`**

```tsx
import { ProductCard } from "@/components/product/product-card";
import type { ProductCardData } from "@core/wordpress/products";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) {
    return <p className="text-muted-foreground">No products found.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.databaseId} product={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/app/page.tsx` with the listing page**

```tsx
import { activeClient } from "@/client";
import { ProductGrid } from "@/components/product/product-grid";
import { getProducts, type ProductCardData } from "@core/wordpress/products";

export const revalidate = 60;

export default async function Home() {
  // Build-resilient: if WordPress is unreachable (e.g. CI build with no
  // backend), render an empty catalog rather than failing the build. ISR
  // fills in real data once the endpoint is reachable.
  let products: ProductCardData[] = [];
  try {
    products = await getProducts("en", 24);
  } catch (err) {
    console.error("Catalog fetch failed (is WordPress running?):", err);
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">
        {activeClient.identity.name}
      </h1>
      <ProductGrid products={products} />
    </main>
  );
}
```

This keeps `npm run build` and `npm run verify:client-alias` green in CI (no WordPress): the page renders the client name (the alias-probe marker) + an empty grid at build, then ISR loads real products at runtime.

- [ ] **Step 4: Create `src/app/product/[slug]/page.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice, pickPrice } from "@core/commerce/price";
import { getProductBySlug } from "@core/wordpress/products";

export const revalidate = 60;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    notFound();
  }
  const price = pickPrice(product.prices);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Back to catalog
      </Link>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {product.image?.sourceUrl ? (
            <Image
              src={product.image.sourceUrl}
              alt={product.image.altText || product.name}
              width={600}
              height={750}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {price ? (
            <p className="mt-2 text-xl font-semibold">
              {price.sale ? (
                <>
                  <span className="mr-2 text-muted-foreground line-through">
                    {formatPrice(price.regular, price.currency)}
                  </span>
                  <span className="text-primary">
                    {formatPrice(price.sale, price.currency)}
                  </span>
                </>
              ) : (
                formatPrice(price.regular, price.currency)
              )}
            </p>
          ) : null}
          <div
            className="prose prose-sm mt-4 text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
          {product.variations.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Available options</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.variations.map((v) => {
                  const vp = pickPrice(v.prices);
                  return (
                    <li
                      key={v.databaseId}
                      className="rounded-md border px-3 py-1 text-sm"
                    >
                      {v.name}
                      {vp ? ` — ${formatPrice(vp.regular, vp.currency)}` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
```

Note: `description` from WooCommerce is trusted HTML authored in the WP admin; `dangerouslySetInnerHTML` is acceptable here because the content source is the store owner, not end users. (A sanitization pass can be added later if untrusted authors edit products.)

- [ ] **Step 5: Verify build + dev render**

```powershell
npm run lint
npm run typecheck
npm run build
```
Expected: all exit 0. (The home page is now dynamic/ISR; the build should fetch products at build time — the WP site must be running.)

Start dev and confirm real product names render:
```powershell
$dev = Start-Job { Set-Location "E:\Ecommerce Platform"; npm run dev }
Start-Sleep -Seconds 12
try {
  $html = (Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 20).Content
  $hits = @("Canvas Tote Bag","Classic Cotton T-Shirt","Premium Hoodie") | Where-Object { $html -match $_ }
  Write-Host "Home page product hits: $($hits -join ', ')"
  $pdp = (Invoke-WebRequest "http://localhost:3000/product/classic-cotton-t-shirt" -UseBasicParsing -TimeoutSec 20).Content
  Write-Host "PDP has variations heading: $($pdp -match 'Available options')"
} finally {
  Stop-Job $dev; Remove-Job $dev
}
```
Expected: the home page hits list the seeded product names; the PDP contains "Available options". (Slug may differ — if `classic-cotton-t-shirt` 404s, list slugs via `getProducts` output or WP-CLI `post list --post_type=product --field=post_name` and use a real one.)

- [ ] **Step 6: Commit**

```powershell
git add src/components/product src/app/page.tsx src/app/product
git commit -m "feat(catalog): product listing (home) + product detail pages rendering real data"
```

---

## Phase 2a Definition of Done

- `http://localhost:3000` renders a grid of the seeded products with images + USD prices (sale strikethrough on Graphic Print Tee).
- `http://localhost:3000/product/<slug>` renders the product detail with description, price, and (for variable products) the size options with prices.
- `npm run lint && npm run typecheck && npm run build` all green with the WP site running.
- Core/client boundaries respected (pages import `@core/*` fetchers + `@/client`; no `@client/*` value imports in core).

## Notes carried forward

- **Phase 3** adds `[locale]` routing, middleware locale/currency negotiation, the language switcher, and hreflang from the `translations` field — at which point `getProducts(lang)` is driven by the route and `pickPrice` by the negotiated currency.
- **Codegen** (typed operations from the live schema) is deferred; revisit when query count grows.
- **Cart/checkout** (Phases 4-5) add the "add to cart" action on the PDP.
- Images are served from `ecommerce-backend.local` (dev). Production swaps the endpoint + remote pattern via env/config.
