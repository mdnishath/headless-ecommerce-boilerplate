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
