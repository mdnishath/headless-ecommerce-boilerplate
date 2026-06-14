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
