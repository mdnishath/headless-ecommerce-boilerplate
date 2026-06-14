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
