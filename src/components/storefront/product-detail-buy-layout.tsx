"use client";

import { useState, type ReactNode } from "react";
import {
  ProductPurchasePanel,
  type BuyerCatalogVariant,
} from "@/components/storefront/product-purchase-panel";

type ProductDetailBuyLayoutProps = {
  productId: string;
  vendorId: string;
  name: string;
  basePrice: number;
  currency: string;
  images: string[];
  productType: "physical" | "digital";
  maxQuantity: number | null;
  disabled?: boolean;
  variants: BuyerCatalogVariant[];
  /** Title, price, description, shipping — rendered above the variant selector. */
  children: ReactNode;
};

/**
 * PDP gallery + purchase column. Variant selection can swap the hero image
 * when a color/size option includes its own photo.
 */
export function ProductDetailBuyLayout({
  productId,
  vendorId,
  name,
  basePrice,
  currency,
  images,
  productType,
  maxQuantity,
  disabled = false,
  variants,
  children,
}: ProductDetailBuyLayoutProps) {
  const fallbackHero = images[0] ?? null;
  const [heroUrl, setHeroUrl] = useState<string | null>(fallbackHero);
  const [activeIndex, setActiveIndex] = useState(0);

  const gallery = images.length > 0 ? images : heroUrl ? [heroUrl] : [];
  const displayHero =
    heroUrl && gallery.includes(heroUrl)
      ? heroUrl
      : heroUrl && !gallery.includes(heroUrl)
        ? heroUrl
        : (gallery[activeIndex] ?? fallbackHero);

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
          {displayHero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayHero}
              alt={name}
              className="h-full w-full object-contain object-center p-3"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              No image
            </div>
          )}
        </div>
        {gallery.length > 1 ? (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {gallery.slice(0, 8).map((url, index) => (
              <li key={`${url}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    setHeroUrl(url);
                  }}
                  className={`aspect-square w-full overflow-hidden rounded-lg border bg-zinc-50 ${
                    displayHero === url
                      ? "border-zinc-950 ring-1 ring-zinc-950"
                      : "border-zinc-200"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-contain object-center p-1"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {children}
        <ProductPurchasePanel
          productId={productId}
          vendorId={vendorId}
          name={name}
          basePrice={basePrice}
          currency={currency}
          imageUrl={displayHero}
          productType={productType}
          maxQuantity={maxQuantity}
          disabled={disabled}
          variants={variants}
          onVariantChange={(variant) => {
            if (variant?.imageUrl) {
              setHeroUrl(variant.imageUrl);
              const idx = gallery.indexOf(variant.imageUrl);
              if (idx >= 0) setActiveIndex(idx);
            }
          }}
        />
      </div>
    </div>
  );
}
