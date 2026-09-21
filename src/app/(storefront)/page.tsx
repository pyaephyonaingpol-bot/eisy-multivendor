import Link from "next/link";
import {
  HomePromoBanner,
  type PromoBannerSlide,
} from "@/components/storefront/home-promo-banner";
import { FeaturedProductRail } from "@/components/storefront/featured-product-rail";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

/**
 * Buyer Portal (Marketplace) — primary landing page for `/`.
 */
export default async function StorefrontHomePage() {
  const products = await listPublicProducts(12);
  const newest = products[0] ?? null;
  const newestImage =
    newest?.images?.find((url) => Boolean(url)) ??
    newest?.images?.[0] ??
    null;

  const slides: PromoBannerSlide[] = [
    {
      id: "promo-usdt",
      eyebrow: "Promotion",
      title: "Shop the catalog. Pay with USDT.",
      description:
        "Discover new arrivals from trusted vendors and checkout securely in USDT.",
      ctaLabel: "Shop now",
      ctaHref: "/products",
      accent: "emerald",
      imageUrl: products[1]?.images?.[0] ?? newestImage,
    },
    {
      id: "new-products",
      eyebrow: "New products",
      title: newest ? `Just in: ${newest.name}` : "Fresh listings, ready to ship",
      description: newest
        ? "Browse the latest products added to the marketplace."
        : "New products appear here as soon as vendors publish them.",
      ctaLabel: newest ? "View product" : "Browse shop",
      ctaHref: newest ? `/products/${newest.id}` : "/products",
      accent: "sky",
      imageUrl: newestImage,
    },
    {
      id: "promo-checkout",
      eyebrow: "Buyer offer",
      title: "Fast, focused USDT checkout",
      description:
        "Fill your cart, pay from your wallet, and track orders in one place.",
      ctaLabel: "Go to cart",
      ctaHref: "/cart",
      accent: "amber",
      imageUrl: products[2]?.images?.[0] ?? newestImage,
    },
  ];

  return (
    <div className="pb-2">
      {/* Full-bleed hero breaks out of the storefront content column */}
      <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 -mt-6 sm:-mt-10">
        <HomePromoBanner slides={slides} brandName="Eisy Marketplace" />
      </div>

      <section className="mt-12 space-y-7 sm:mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--market-accent)]">
              Catalog
            </p>
            <h2 className="font-display text-3xl font-medium tracking-tight text-[var(--market-ink)] sm:text-4xl">
              New &amp; featured
            </h2>
            <p className="max-w-md text-sm text-[var(--market-muted)] sm:text-base">
              Hand-picked listings for buyers · prices in USDT
            </p>
          </div>
          <Link
            href="/products"
            className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--market-ink)] underline decoration-[var(--market-line)] underline-offset-4 transition hover:decoration-[var(--market-accent)]"
          >
            View all products
          </Link>
        </div>

        <FeaturedProductRail products={products} />
        <div className="hidden sm:block">
          <ProductGrid products={products} />
        </div>
      </section>
    </div>
  );
}
