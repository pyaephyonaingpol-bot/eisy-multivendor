import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { PublicProductSummary } from "@/lib/products/queries";

export function ProductCard({ product }: { product: PublicProductSummary }) {
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images.find((url) => typeof url === "string" && url.trim()) ?? null;
  const vendorApproved = product.vendor?.status === "approved";
  const name = product.name?.trim() || "Untitled product";
  const price = Number(product.price);

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)] transition duration-300 hover:-translate-y-0.5 hover:border-[#d0c9bb] hover:shadow-[0_12px_28px_-18px_rgba(20,18,16,0.45)]"
    >
      {/* Fixed square image plane — fills card width on mobile */}
      <div className="aspect-square w-full max-w-full shrink-0 overflow-hidden bg-[#ebe6dc]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--market-muted)]">
            No image
          </div>
        )}
      </div>

      {/* Equal-height body: title block on top, price pinned to bottom */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-2 p-3 sm:p-3.5">
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-[var(--market-ink)]">
            {name}
          </p>
          {vendorApproved && product.vendor ? (
            <SoldByBadge vendor={product.vendor} as="text" />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="break-words text-sm font-semibold tracking-tight text-[var(--market-ink)]">
            {formatMoney(
              Number.isFinite(price) ? price : 0,
              MARKETPLACE_CURRENCY,
            )}
          </p>
          {product.compare_at_price != null ? (
            <p className="break-words text-xs text-[var(--market-muted)] line-through">
              {formatMoney(
                Number(product.compare_at_price),
                MARKETPLACE_CURRENCY,
              )}
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
        <p className="mt-2 break-words text-sm text-[var(--market-muted)]">
          Active products will appear here when listings go live.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid w-full min-w-0 grid-cols-2 items-stretch gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex min-w-0">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
