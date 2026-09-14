import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await listPublicProducts(48);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
        <p className="text-zinc-600">
          All prices are listed in USDT. Add items to your cart and pay from your USDT wallet.
        </p>
      </div>
      <ProductGrid products={products} />
    </section>
  );
}
