"use client";

import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import {
  ProductVariantSelector,
  type ProductVariantOption,
} from "@/components/storefront/product-variant-selector";

export type BuyerCatalogVariant = ProductVariantOption;

type Props = {
  productId: string;
  vendorId: string;
  name: string;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  productType: "physical" | "digital";
  maxQuantity: number | null;
  disabled?: boolean;
  variants: BuyerCatalogVariant[];
  /** Notify parent (e.g. gallery) when the selected option changes. */
  onVariantChange?: (variant: BuyerCatalogVariant | null) => void;
};

export function ProductPurchasePanel({
  productId,
  vendorId,
  name,
  basePrice,
  currency,
  imageUrl,
  productType,
  maxQuantity,
  disabled = false,
  variants,
  onVariantChange,
}: Props) {
  const [selectedId, setSelectedId] = useState(
    variants[0]?.externalVariantId ?? "",
  );

  const selected = useMemo(
    () =>
      variants.find((variant) => variant.externalVariantId === selectedId) ??
      variants[0] ??
      null,
    [variants, selectedId],
  );

  function selectVariant(variantId: string) {
    setSelectedId(variantId);
    const next =
      variants.find((variant) => variant.externalVariantId === variantId) ??
      null;
    onVariantChange?.(next);
  }

  const displayName = selected ? `${name} — ${selected.label}` : name;
  const displayImage = selected?.imageUrl || imageUrl;
  const variantStock =
    selected?.stockQuantity != null && Number.isFinite(selected.stockQuantity)
      ? selected.stockQuantity
      : null;
  const effectiveMax =
    variantStock != null
      ? maxQuantity != null
        ? Math.min(maxQuantity, variantStock)
        : variantStock
      : maxQuantity;
  const outOfStock =
    disabled ||
    (effectiveMax != null && Number.isFinite(effectiveMax) && effectiveMax <= 0);

  if (variants.length === 0) {
    return (
      <AddToCartButton
        productId={productId}
        vendorId={vendorId}
        name={name}
        price={basePrice}
        currency={currency}
        imageUrl={imageUrl}
        productType={productType}
        maxQuantity={maxQuantity}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ProductVariantSelector
        variants={variants}
        value={selected?.externalVariantId ?? ""}
        onChange={selectVariant}
      />

      <AddToCartButton
        productId={productId}
        vendorId={vendorId}
        name={displayName}
        price={basePrice}
        currency={currency}
        imageUrl={displayImage}
        productType={productType}
        maxQuantity={effectiveMax}
        disabled={outOfStock || !selected}
        variantId={selected?.externalVariantId ?? null}
        variantSku={selected?.externalSku ?? null}
        variantLabel={selected?.label ?? null}
      />
    </div>
  );
}
