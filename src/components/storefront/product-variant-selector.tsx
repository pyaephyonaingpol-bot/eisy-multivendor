"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isAxisValueAvailable,
  matchVariantBySelection,
  parseVariantMatrix,
  selectionFromVariant,
  type CatalogVariantLike,
} from "@/lib/products/variant-options";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";

export type ProductVariantOption = CatalogVariantLike & {
  externalSku: string | null;
  priceUsdt: number | null;
  stockQuantity: number | null;
  imageUrl: string | null;
};

type ProductVariantSelectorProps = {
  variants: ProductVariantOption[];
  value: string;
  onChange: (variantId: string) => void;
  /** When true, show stock hints under the selected combo. */
  showStockHints?: boolean;
};

/**
 * Buyer-facing variant picker: Color / Size (or Option) chip rows derived from
 * catalog labels. Falls back to a single chip list when labels are unstructured.
 */
export function ProductVariantSelector({
  variants,
  value,
  onChange,
  showStockHints = true,
}: ProductVariantSelectorProps) {
  const matrix = useMemo(() => parseVariantMatrix(variants), [variants]);
  const { axes, partsByVariantId } = matrix;

  const [selection, setSelection] = useState<string[]>(() =>
    selectionFromVariant(partsByVariantId, value, axes.length),
  );

  // Keep local axis selection in sync when parent changes the variant id
  // (e.g. initial preferred SKU from import).
  useEffect(() => {
    setSelection(selectionFromVariant(partsByVariantId, value, axes.length));
  }, [value, partsByVariantId, axes.length]);

  const selectedVariant = useMemo(
    () => matchVariantBySelection(variants, partsByVariantId, selection),
    [variants, partsByVariantId, selection],
  );

  function pickAxisValue(axisIndex: number, nextValue: string) {
    const next = selection.slice();
    next[axisIndex] = nextValue;

    // Prefer an exact match for the full selection.
    let matched = matchVariantBySelection(variants, partsByVariantId, next);

    // If this combo does not exist, keep the clicked axis and fill the rest
    // from the first available variant that includes it.
    if (!matched) {
      matched =
        variants.find((variant) => {
          const parts = partsByVariantId[variant.externalVariantId];
          return parts?.[axisIndex] === nextValue;
        }) ?? null;
      if (matched) {
        const parts = partsByVariantId[matched.externalVariantId] ?? [];
        setSelection(parts.slice());
        onChange(matched.externalVariantId);
        return;
      }
    }

    setSelection(next);
    if (matched) {
      onChange(matched.externalVariantId);
    }
  }

  if (variants.length === 0 || axes.length === 0) {
    return null;
  }

  const stock =
    selectedVariant?.stockQuantity != null &&
    Number.isFinite(selectedVariant.stockQuantity)
      ? selectedVariant.stockQuantity
      : null;

  return (
    <div className="space-y-4" role="group" aria-label="Product options">
      {axes.map((axis, axisIndex) => (
        <div key={axis.id} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-zinc-800">
              {axis.name}
              {selection[axisIndex] ? (
                <span className="ml-2 font-normal text-zinc-500">
                  {selection[axisIndex]}
                </span>
              ) : null}
            </p>
            {axisIndex === 0 && variants.length > 1 ? (
              <p className="text-[11px] text-zinc-400">
                {variants.length} combinations
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((optionValue) => {
              const selected = selection[axisIndex] === optionValue;
              const available = isAxisValueAvailable(
                variants,
                partsByVariantId,
                selection,
                axisIndex,
                optionValue,
              );
              // Color swatch when the axis is Color and value is a plain color word.
              const swatch = axis.name === "Color" ? colorSwatch(optionValue) : null;

              return (
                <button
                  key={`${axis.id}:${optionValue}`}
                  type="button"
                  disabled={!available && !selected}
                  aria-pressed={selected}
                  onClick={() => pickAxisValue(axisIndex, optionValue)}
                  className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : available
                        ? "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
                        : "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300 line-through"
                  }`}
                >
                  {swatch ? (
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: swatch }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="break-words">{optionValue}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectedVariant ? (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <p>
            Selected:{" "}
            <span className="font-medium text-zinc-900">
              {selectedVariant.label}
            </span>
            {selectedVariant.externalSku
              ? ` · SKU ${selectedVariant.externalSku}`
              : null}
          </p>
          {showStockHints ? (
            <p className="mt-0.5">
              {stock == null
                ? "Stock confirmed at checkout"
                : stock > 0
                  ? `${stock} available for this option`
                  : "This option is out of stock"}
              {selectedVariant.priceUsdt != null
                ? ` · supplier ref ${formatMoney(selectedVariant.priceUsdt, MARKETPLACE_CURRENCY)}`
                : null}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-amber-700">
          Choose each option above to continue.
        </p>
      )}
    </div>
  );
}

/** Map common color names to CSS colors for small swatches. */
function colorSwatch(name: string): string | null {
  const key = name.trim().toLowerCase();
  const map: Record<string, string> = {
    black: "#111827",
    white: "#f8fafc",
    red: "#dc2626",
    blue: "#2563eb",
    green: "#16a34a",
    yellow: "#eab308",
    orange: "#ea580c",
    purple: "#9333ea",
    pink: "#ec4899",
    brown: "#92400e",
    grey: "#6b7280",
    gray: "#6b7280",
    beige: "#d6c6a8",
    navy: "#1e3a8a",
    gold: "#d4a017",
    silver: "#c0c0c0",
    cream: "#fffdd0",
    khaki: "#c3b091",
    maroon: "#7f1d1d",
    cyan: "#06b6d4",
    magenta: "#d946ef",
    ivory: "#fffff0",
    olive: "#6b8e23",
    teal: "#0d9488",
    coral: "#ff7f50",
    burgundy: "#800020",
  };
  return map[key] ?? null;
}
