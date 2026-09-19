import { AuthHeaderButton } from "@/components/auth/auth-header-button";
import { ProductGrid } from "@/components/storefront/product-grid";
import { getSessionProfile } from "@/lib/auth/session";
import { listPublicProducts } from "@/lib/products/queries";
import { DEFAULT_BUYER_COUNTRY } from "@/lib/sourcing/constants";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [session, products, sourcing] = await Promise.all([
    getSessionProfile(),
    listPublicProducts(48),
    getBuyerSourcingContext(),
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
        {session ? (
          <p className="text-zinc-600">
            Showing items that ship to{" "}
            <strong>{sourcing.regionName}</strong> ({sourcing.countryCode})
            {sourcing.fromProfile
              ? " based on your profile shipping country"
              : " (default region — add a preferred country on your profile for a personal catalog)"}
            . Prices are in USDT.
          </p>
        ) : (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <p>
              You are browsing the default catalog for{" "}
              <strong>
                {sourcing.regionName} ({DEFAULT_BUYER_COUNTRY})
              </strong>
              . Sign in to filter products by the country on your profile.
            </p>
            <AuthHeaderButton label="Sign in to set region" />
          </div>
        )}
      </div>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-600">
          No products are available for {sourcing.regionName} right now
          {session
            ? ". Update your profile shipping country or check back later."
            : ". Sign in for your region, or check back later."}
        </p>
      ) : (
        <ProductGrid products={products} />
      )}
    </section>
  );
}
