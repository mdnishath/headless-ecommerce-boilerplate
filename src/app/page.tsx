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
