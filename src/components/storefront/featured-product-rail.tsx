import Link from "next/link";
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
              className="w-[72%] max-w-[18rem] shrink-0 snap-start"
            >
              <Link
                href={`/products/${product.id}`}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white"
              >
                <div className="aspect-[4/3] bg-zinc-100">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-zinc-950">
                    {product.name}
                  </p>
                  <p className="text-sm font-medium text-zinc-950">
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
