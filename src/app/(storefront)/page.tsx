import Link from "next/link";
import type { PromoBannerSlide } from "@/components/storefront/home-promo-banner";
import { FeaturedProductRail } from "@/components/storefront/featured-product-rail";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PromoStripCarousel } from "@/components/storefront/promo-strip-carousel";
import {
  QuickCategoryRail,
  type QuickCategory,
} from "@/components/storefront/quick-category-rail";
import { listActiveCategories } from "@/lib/categories/queries";
import { listPublicProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

/**
 * Buyer Marketplace landing — super-app feed:
 * quick categories, promo carousels, and product discovery.
 */
export default async function StorefrontHomePage() {
  const [products, categories] = await Promise.all([
    listPublicProducts(12),
    listActiveCategories(),
  ]);

  const newest = products[0] ?? null;
  const newestImage =
    newest?.images?.find((url) => Boolean(url)) ??
    newest?.images?.[0] ??
    null;

  const quickCategories: QuickCategory[] = categories.slice(0, 10).map((category, index) => ({
    id: category.id,
    name: category.name,
    href: `/products?category=${encodeURIComponent(category.slug || category.id)}`,
    tone: (["teal", "sand", "sky", "rose", "ink"] as const)[index % 5],
  }));

  const heroSlides: PromoBannerSlide[] = [
    {
      id: "promo-usdt",
      eyebrow: "Eisy Marketplace",
      title: "Shop everything. Pay with USDT.",
      description:
        "Fresh deals from trusted vendors — checkout securely in one wallet.",
      ctaLabel: "Shop now",
      ctaHref: "/products",
      accent: "emerald",
      imageUrl: products[1]?.images?.[0] ?? newestImage,
    },
    {
      id: "new-products",
      eyebrow: "New this week",
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
      eyebrow: "Buyer perk",
      title: "Fast USDT checkout",
      description:
        "Fill your cart, pay from your wallet, and track orders in one place.",
      ctaLabel: "Open cart",
      ctaHref: "/cart",
      accent: "amber",
      imageUrl: products[2]?.images?.[0] ?? newestImage,
    },
  ];

  const dealsSlides: PromoBannerSlide[] = [
    {
      id: "deals-flash",
      eyebrow: "Deals",
      title: "Today’s spotlight picks",
      description: "Limited offers curated for buyers — swipe for more.",
      ctaLabel: "See deals",
      ctaHref: "/products?deals=1",
      imageUrl: products[3]?.images?.[0] ?? newestImage,
    },
    {
      id: "deals-stores",
      eyebrow: "Stores",
      title: "Explore independent sellers",
      description: "Discover branded storefronts across the marketplace.",
      ctaLabel: "Browse stores",
      ctaHref: "/vendors",
      imageUrl: products[4]?.images?.[0] ?? products[0]?.images?.[0] ?? null,
    },
  ];

  return (
    <div className="space-y-7 sm:space-y-9">
      <QuickCategoryRail categories={quickCategories} />

      <PromoStripCarousel slides={heroSlides} />

      <PromoStripCarousel slides={dealsSlides} compact />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--market-accent)]">
              For you
            </p>
            <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--market-ink)] sm:text-3xl">
              New &amp; featured
            </h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-semibold text-[var(--market-accent)] hover:underline"
          >
            View all
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
