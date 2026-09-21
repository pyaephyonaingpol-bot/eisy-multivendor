import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { PublicProductSummary } from "@/lib/products/queries";

export function ProductCard({ product }: { product: PublicProductSummary }) {
  const image = product.images[0] ?? null;
  const vendorApproved = product.vendor?.status === "approved";

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)] transition duration-300 hover:-translate-y-0.5 hover:border-[#d0c9bb] hover:shadow-[0_12px_28px_-18px_rgba(20,18,16,0.45)]"
    >
      <div className="aspect-[4/5] overflow-hidden bg-[#ebe6dc] sm:aspect-[4/3]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--market-muted)]">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <div className="space-y-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--market-ink)]">
            {product.name}
          </p>
          {vendorApproved && product.vendor ? (
            <SoldByBadge vendor={product.vendor} as="text" />
          ) : null}
        </div>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <p className="text-sm font-semibold tracking-tight text-[var(--market-ink)]">
            {formatMoney(Number(product.price), MARKETPLACE_CURRENCY)}
          </p>
          {product.compare_at_price != null ? (
            <p className="text-xs text-[var(--market-muted)] line-through">
              {formatMoney(Number(product.compare_at_price), MARKETPLACE_CURRENCY)}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: PublicProductSummary[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--market-line)] bg-[var(--market-surface)] px-6 py-16 text-center">
        <p className="font-display text-xl text-[var(--market-ink)]">
          No products available yet
        </p>
        <p className="mt-2 text-sm text-[var(--market-muted)]">
          Active products will appear here when listings go live.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
