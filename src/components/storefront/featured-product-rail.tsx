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
          const images = Array.isArray(product.images) ? product.images : [];
          const image =
            images.find((url) => typeof url === "string" && url.trim()) ?? null;
          const name = product.name?.trim() || "Untitled product";
          const price = Number(product.price);
          return (
            <li
              key={product.id}
              className="flex w-[74%] max-w-[17.5rem] shrink-0 snap-start"
            >
              <Link
                href={`/products/${product.id}`}
                className="flex h-full min-w-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--market-line)] bg-[var(--market-surface)]"
              >
                <div className="aspect-square w-full max-w-full shrink-0 overflow-hidden bg-[#ebe6dc]">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={name}
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--market-muted)]">
                      No image
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--market-ink)]">
                      {name}
                    </p>
                    {product.vendor?.status === "approved" && product.vendor ? (
                      <SoldByBadge vendor={product.vendor} as="text" />
                    ) : null}
                  </div>
                  <p className="break-words text-sm font-semibold text-[var(--market-ink)]">
                    {formatMoney(
                      Number.isFinite(price) ? price : 0,
                      MARKETPLACE_CURRENCY,
                    )}
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
