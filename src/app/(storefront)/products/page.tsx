import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProducts } from "@/lib/products/queries";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, sourcing] = await Promise.all([
    listPublicProducts(48),
    getBuyerSourcingContext(),
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
        <p className="text-zinc-600">
          Showing items that ship to <strong>{sourcing.regionName}</strong> (
          {sourcing.countryCode}). Change your country in the header to update
          this catalog. Prices are in USDT.
        </p>
      </div>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-600">
          No products are available for {sourcing.regionName} right now. Try
          another shipping country or check back later.
        </p>
      ) : (
        <ProductGrid products={products} />
      )}
    </section>
  );
}
