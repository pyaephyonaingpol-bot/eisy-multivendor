import Link from "next/link";
import { SoldByBadge } from "@/components/storefront/sold-by-badge";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { PublicProductSummary } from "@/lib/products/queries";

type FeaturedProductRailProps = {
  products: PublicProductSummary[];
};

/**
 * Horizontal snap rail for phones; peeks the next card to invite swipe.
 * Desktop keeps the denser ProductGrid on the home page.
 */
export function FeaturedProductRail({ products }: FeaturedProductRailProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="relative -mx-4 sm:hidden">
      <ul className="mobile-scroll-x flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1">
        {products.map((product) => {
          const image = product.images[0] ?? null;
          return (
            <li
              key={product.id}
              className="w-[74%] max-w-[17.5rem] shrink-0 snap-start"
            >
              <Link
                href={`/products/${product.id}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)]"
              >
                <div className="aspect-[4/5] bg-[#ebe6dc]">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--market-muted)]">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-[var(--market-ink)]">
                    {product.name}
                  </p>
                  {product.vendor?.status === "approved" && product.vendor ? (
                    <SoldByBadge vendor={product.vendor} as="text" />
                  ) : null}
                  <p className="text-sm font-semibold text-[var(--market-ink)]">
                    {formatMoney(Number(product.price), MARKETPLACE_CURRENCY)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
