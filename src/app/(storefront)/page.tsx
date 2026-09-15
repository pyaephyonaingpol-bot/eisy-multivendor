import Link from "next/link";
import {
  HomePromoBanner,
  type PromoBannerSlide,
} from "@/components/storefront/home-promo-banner";
import { FeaturedProductRail } from "@/components/storefront/featured-product-rail";
import { ProductGrid } from "@/components/storefront/product-grid";
import { listPublicProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

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
        "Discover new arrivals and limited offers. Add to cart and checkout securely in USDT — no seller tools in your way.",
      ctaLabel: "Shop promotions",
      ctaHref: "/products",
      accent: "emerald",
      imageUrl: products[1]?.images?.[0] ?? newestImage,
    },
    {
      id: "new-products",
      eyebrow: "New products",
      title: newest
        ? `Just in: ${newest.name}`
        : "Fresh listings for buyers",
      description: newest
        ? "Browse the latest products added to the marketplace. Checkout settles in USDT."
        : "New products appear here as soon as they go live. Checkout settles in USDT.",
      ctaLabel: newest ? "View product" : "Browse shop",
      ctaHref: newest ? `/products/${newest.id}` : "/products",
      accent: "sky",
      imageUrl: newestImage,
    },
    {
      id: "promo-checkout",
      eyebrow: "Buyer offer",
      title: "Fast USDT checkout",
      description:
        "Keep shopping focused: browse stores, fill your cart, and pay from your platform wallet in USDT.",
      ctaLabel: "Go to cart",
      ctaHref: "/cart",
      accent: "amber",
      imageUrl: products[2]?.images?.[0] ?? newestImage,
    },
  ];

  return (
    <div className="space-y-12">
      <HomePromoBanner slides={slides} />

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">New &amp; featured</h2>
            <p className="text-sm text-zinc-500">
              Latest products for buyers · checkout in USDT
            </p>
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-zinc-950 underline underline-offset-4"
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
