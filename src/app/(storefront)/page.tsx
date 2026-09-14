import Link from "next/link";
import { HomeHeroCtas } from "@/components/storefront/home-hero-ctas";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

export default async function StorefrontHomePage() {
  const products = await listPublicProducts(12);

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 px-6 py-12 sm:px-10">
        <div className="relative z-10 max-w-2xl space-y-5">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-800/80">
            Customer storefront
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Shop independent vendors in USDT
          </h1>
          <p className="text-lg text-zinc-600">
            Browse live catalog products from approved sellers. Checkout settles in USDT —
            vendors can still withdraw earnings in MMK from their wallet.
          </p>
          <HomeHeroCtas />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Featured products</h2>
            <p className="text-sm text-zinc-500">
              Loaded from Supabase · active products from approved vendors
            </p>
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-zinc-950 underline underline-offset-4"
          >
            View all products
          </Link>
        </div>
        <ProductGrid products={products} />
      </section>
    </div>
  );
}
