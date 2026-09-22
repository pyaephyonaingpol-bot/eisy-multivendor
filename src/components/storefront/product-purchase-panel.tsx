"use client";

import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";

export type BuyerCatalogVariant = {
  externalVariantId: string;
  externalSku: string | null;
  label: string;
  priceUsdt: number | null;
  stockQuantity: number | null;
  imageUrl: string | null;
};

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
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Color / size
          <span className="ml-1 font-normal text-zinc-500">
            ({variants.length} options)
          </span>
        </span>
        <select
          value={selected?.externalVariantId ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950"
        >
          {variants.map((variant) => (
            <option
              key={variant.externalVariantId}
              value={variant.externalVariantId}
            >
              {variant.label}
              {variant.priceUsdt != null
                ? ` · ${formatMoney(variant.priceUsdt, MARKETPLACE_CURRENCY)} cost ref`
                : ""}
              {variant.stockQuantity != null
                ? ` · ${variant.stockQuantity} avail`
                : ""}
            </option>
          ))}
        </select>
        {selected ? (
          <p className="text-xs text-zinc-500">
            Selected:{" "}
            <span className="font-medium text-zinc-800">{selected.label}</span>
            {selected.externalSku ? ` · SKU ${selected.externalSku}` : null}
          </p>
        ) : null}
      </label>

      <AddToCartButton
        productId={productId}
        vendorId={vendorId}
        name={displayName}
        price={basePrice}
        currency={currency}
        imageUrl={displayImage}
        productType={productType}
        maxQuantity={effectiveMax}
        disabled={outOfStock}
        variantId={selected?.externalVariantId ?? null}
        variantSku={selected?.externalSku ?? null}
        variantLabel={selected?.label ?? null}
      />
    </div>
  );
}
