import { AuthHeaderButton } from "@/components/auth/auth-header-button";
import { ProductGrid } from "@/components/storefront/product-grid";
import { getSessionProfile } from "@/lib/auth/session";
import { listActiveCategories } from "@/lib/categories/queries";
import { listPublicProducts } from "@/lib/products/queries";
import { DEFAULT_BUYER_COUNTRY } from "@/lib/sourcing/constants";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{ q?: string; category?: string; deals?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const query = String(params.q ?? "").trim().toLowerCase();
  const categorySlug = String(params.category ?? "").trim().toLowerCase();
  const dealsOnly = params.deals === "1" || params.deals === "true";

  const [session, products, sourcing, categories] = await Promise.all([
    getSessionProfile(),
    listPublicProducts(48),
    getBuyerSourcingContext(),
    listActiveCategories(),
  ]);

  const category = categorySlug
    ? categories.find(
        (row) =>
          row.slug?.toLowerCase() === categorySlug ||
          row.id.toLowerCase() === categorySlug,
      )
    : null;

  let filtered = products;
  if (category) {
    filtered = filtered.filter((product) => product.category_id === category.id);
  }
  if (query) {
    filtered = filtered.filter((product) => {
      const haystack = `${product.name} ${product.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if (dealsOnly) {
    filtered = filtered.filter((product) => product.compare_at_price != null);
    if (filtered.length === 0) {
      // Fall back to newest catalog so Deals tab is never an empty dead-end.
      filtered = products;
    }
  }

  const title = dealsOnly
    ? "Deals"
    : category
      ? category.name
      : query
        ? `Results for “${params.q}”`
        : "Categories & shop";

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--market-ink)]">
          {title}
        </h1>
        {session ? (
          <p className="text-sm text-[var(--market-muted)]">
            Showing items that ship to{" "}
            <strong className="text-[var(--market-ink)]">{sourcing.regionName}</strong>{" "}
            ({sourcing.countryCode}). Prices in USDT.
          </p>
        ) : (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <p>
              Browsing the default catalog for{" "}
              <strong>
                {sourcing.regionName} ({DEFAULT_BUYER_COUNTRY})
              </strong>
              . Sign in to set your delivery address.
            </p>
            <AuthHeaderButton label="Sign in" />
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--market-line)] bg-[var(--market-surface)] px-6 py-12 text-center text-sm text-[var(--market-muted)]">
          No products matched{query ? ` “${params.q}”` : ""}. Try another search
          or browse all products.
        </p>
      ) : (
        <ProductGrid products={filtered} />
      )}
    </section>
  );
}
