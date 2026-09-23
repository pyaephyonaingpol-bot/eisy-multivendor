"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  importExternalSupplierProductAction,
  type ExternalImportState,
} from "@/lib/suppliers/actions";
import type {
  ExternalCatalogProduct,
  ExternalProductVariant,
  ExternalSupplierKind,
} from "@/lib/suppliers/types";
import { ONE_CLICK_IMPORT_MARKUP } from "@/lib/suppliers/types";
import { normalizeClientCatalogProduct } from "@/lib/suppliers/client-catalog";
import { MARKETPLACE_CURRENCY, formatMoney } from "@/lib/money";
import { lockBodyScroll } from "@/lib/dom/lock-body-scroll";

export type PreviewQuotaHints = {
  minActiveItems: number;
  maxImportItems: number;
  catalogItemCount: number;
  activeItemCount: number;
  remainingImportSlots: number;
  itemFeeUsdt: number;
  atImportLimit: boolean;
  meetsMinimum: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  providerKind: ExternalSupplierKind;
  externalProductId: string;
  regionCode?: string;
  quota: PreviewQuotaHints;
  seedProduct?: ExternalCatalogProduct | null;
  onImported?: (result: { productId: string; success?: string }) => void;
};

const initialImportState: ExternalImportState = {};

/** Fixed thumbnail strip height so the layout does not jump when galleries load. */
const THUMB_STRIP_CLASS = "flex h-14 max-w-full gap-2 overflow-x-auto";

function suggestedSellPrice(costUsdt: number) {
  return Math.round(costUsdt * ONE_CLICK_IMPORT_MARKUP * 100) / 100;
}

function suggestedComparePrice(
  sellPrice: number,
  remoteCompare: number | null | undefined,
) {
  if (remoteCompare != null && Number.isFinite(remoteCompare) && remoteCompare > sellPrice) {
    return Math.round(remoteCompare * 100) / 100;
  }
  return Math.round(sellPrice * 1.25 * 100) / 100;
}

/** Shared product photo frame — contain (no crop/stretch) inside a fixed aspect box. */
const PRODUCT_IMAGE_FRAME =
  "relative aspect-square w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50";
const PRODUCT_IMAGE_CLASS =
  "absolute inset-0 h-full w-full object-contain object-center p-2";
const PRODUCT_THUMB_CLASS =
  "h-full w-full object-contain object-center p-0.5";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-200/80 ${className}`}
      aria-hidden
    />
  );
}

export function SupplierProductPreviewModal({
  open,
  onClose,
  providerKind,
  externalProductId,
  regionCode = "GLOBAL",
  quota,
  seedProduct = null,
  onImported,
}: Props) {
  const titleId = useId();
  const [product, setProduct] = useState<ExternalCatalogProduct | null>(
    seedProduct,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!seedProduct);
  const [activeImage, setActiveImage] = useState(0);
  const [imageReady, setImageReady] = useState(false);
  const [selectedVariant, setSelectedVariant] =
    useState<ExternalProductVariant | null>(seedProduct?.variants?.[0] ?? null);
  const [editName, setEditName] = useState(seedProduct?.name ?? "");
  const [editDescription, setEditDescription] = useState(
    seedProduct?.description ?? "",
  );
  const [editPrice, setEditPrice] = useState(
    seedProduct
      ? String(
          suggestedSellPrice(
            seedProduct.variants?.[0]?.priceUsdt ?? seedProduct.priceUsdt,
          ),
        )
      : "",
  );
  const [editComparePrice, setEditComparePrice] = useState(() => {
    if (!seedProduct) return "";
    const sell = suggestedSellPrice(
      seedProduct.variants?.[0]?.priceUsdt ?? seedProduct.priceUsdt,
    );
    return String(suggestedComparePrice(sell, seedProduct.compareAtPriceUsdt));
  });
  /** New imports default to no strikethrough price; toggle on when needed. */
  const [showComparePrice, setShowComparePrice] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const [importState, formAction, importPending] = useActionState(
    importExternalSupplierProductAction,
    initialImportState,
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setConfirmOpen(false);
    setActiveImage(0);
    setImageReady(false);
    setLoadError(null);
    // New listing import: compare-at off until the vendor enables it.
    setShowComparePrice(false);

    if (seedProduct && seedProduct.externalProductId === externalProductId) {
      setProduct(seedProduct);
      setEditName(seedProduct.name);
      setEditDescription(seedProduct.description ?? "");
      const firstVariant = seedProduct.variants?.[0] ?? null;
      setSelectedVariant(firstVariant);
      const sell = suggestedSellPrice(
        firstVariant?.priceUsdt ?? seedProduct.priceUsdt,
      );
      setEditPrice(String(sell));
      setEditComparePrice(
        String(suggestedComparePrice(sell, seedProduct.compareAtPriceUsdt)),
      );
      setLoading(false);
    } else {
      setProduct(null);
      setEditName("");
      setEditDescription("");
      setEditPrice("");
      setEditComparePrice("");
      setSelectedVariant(null);
      setLoading(true);
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/suppliers/catalog/product?provider=${encodeURIComponent(providerKind)}&id=${encodeURIComponent(externalProductId)}`,
        );
        const data = (await res.json()) as {
          product?: ExternalCatalogProduct;
          data?: { product?: ExternalCatalogProduct };
          error?: string;
        };
        if (cancelled) return;
        const rawProduct = data.product ?? data.data?.product;
        const normalized = normalizeClientCatalogProduct(rawProduct);
        if (!res.ok || !normalized) {
          if (!seedProduct) {
            setLoadError(data.error ?? "Failed to load product details");
          }
          return;
        }
        const p = normalized;
        setProduct(p);
        setEditName(p.name);
        setEditDescription(p.description ?? "");
        const variants = p.variants ?? [];
        setSelectedVariant((prev) => {
          const preferred =
            (prev &&
              variants.find(
                (variant) =>
                  variant.externalVariantId === prev.externalVariantId,
              )) ||
            variants.find(
              (variant) => variant.externalVariantId === p.externalVariantId,
            ) ||
            variants[0] ||
            null;
          const sell = suggestedSellPrice(preferred?.priceUsdt ?? p.priceUsdt);
          setEditPrice(String(sell));
          setEditComparePrice(
            String(suggestedComparePrice(sell, p.compareAtPriceUsdt)),
          );
          return preferred;
        });
        setActiveImage(0);
        setImageReady(false);
      } catch {
        if (!cancelled && !seedProduct) {
          setLoadError("Network error loading product");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, providerKind, externalProductId, seedProduct]);

  useEffect(() => {
    if (importState?.success && importState.productId) {
      onImported?.({
        productId: importState.productId,
        success: importState.success,
      });
      onClose();
    }
  }, [importState?.success, importState?.productId, onImported, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const images = useMemo(() => {
    if (!product) return [] as string[];
    const list = [product.imageUrl, ...(product.images ?? [])].filter(
      (src): src is string => Boolean(src),
    );
    return Array.from(new Set(list));
  }, [product]);

  const heroSrc = images[activeImage] ?? product?.imageUrl ?? "";

  useEffect(() => {
    setImageReady(false);
  }, [heroSrc]);

  const costUsdt = selectedVariant?.priceUsdt ?? product?.priceUsdt ?? 0;
  const parsedSell = Number(editPrice);
  const parsedCompare = Number(editComparePrice);
  const sellOk =
    Number.isFinite(parsedSell) && parsedSell > 0 && parsedSell >= costUsdt;
  const compareOk =
    !showComparePrice ||
    editComparePrice.trim() === "" ||
    (Number.isFinite(parsedCompare) &&
      parsedCompare > 0 &&
      parsedCompare > parsedSell);
  const margin =
    sellOk && costUsdt > 0
      ? Math.round(((parsedSell - costUsdt) / costUsdt) * 1000) / 10
      : null;
  const showSkeleton = loading && !product;
  const canImport =
    Boolean(product) && !loading && sellOk && compareOk && !quota.atImportLimit;

  function applyVariant(v: ExternalProductVariant) {
    setSelectedVariant(v);
    const sell = suggestedSellPrice(v.priceUsdt);
    setEditPrice(String(sell));
    if (showComparePrice) {
      setEditComparePrice(
        String(suggestedComparePrice(sell, product?.compareAtPriceUsdt)),
      );
    }
    if (v.imageUrl) {
      const idx = images.indexOf(v.imageUrl);
      if (idx >= 0) {
        setActiveImage(idx);
        setImageReady(false);
      }
    }
  }

  function submitImport() {
    if (!product || quota.atImportLimit || !sellOk || !compareOk) return;
    const fd = new FormData();
    fd.set("provider_kind", providerKind);
    fd.set("external_product_id", product.externalProductId);
    fd.set("region_code", regionCode);
    fd.set("price", String(parsedSell));
    if (showComparePrice && editComparePrice.trim() !== "" && compareOk) {
      fd.set("compare_at_price", String(parsedCompare));
    } else {
      fd.set("disable_compare_at", "1");
    }
    fd.set("name", editName.trim() || product.name);
    fd.set("description", editDescription.trim() || product.description || "");
    if (selectedVariant) {
      fd.set("external_variant_id", selectedVariant.externalVariantId);
      if (selectedVariant.externalSku) {
        fd.set("external_sku", selectedVariant.externalSku);
      }
    }
    startTransition(() => {
      formAction(fd);
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] box-border flex w-full max-w-full items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget && !importPending) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl sm:max-h-[90vh]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-3 py-3 sm:px-5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Product preview ·{" "}
              {providerKind === "cj_dropshipping" ? "CJ" : "DSers"}
            </p>
            <h2
              id={titleId}
              className="truncate text-base font-semibold leading-7 text-zinc-950 sm:text-lg"
            >
              {product?.name ?? (loading ? "Loading product…" : "Product preview")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importPending}
            className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          {loadError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {loadError}
            </p>
          ) : null}

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <div className={PRODUCT_IMAGE_FRAME}>
                {!imageReady || !heroSrc ? (
                  <div className="absolute inset-0 animate-pulse bg-zinc-200/80" />
                ) : null}
                {heroSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={heroSrc}
                    src={heroSrc}
                    alt={product?.name ?? ""}
                    onLoad={() => setImageReady(true)}
                    onError={() => setImageReady(true)}
                    className={`${PRODUCT_IMAGE_CLASS} transition-opacity duration-200 ${
                      imageReady ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ) : null}
                {showSkeleton ? (
                  <span className="sr-only">Loading product image</span>
                ) : null}
              </div>

              <div className={THUMB_STRIP_CLASS} aria-hidden={images.length <= 1}>
                {images.length > 1
                  ? images.map((src, i) => (
                      <button
                        key={`${src}-${i}`}
                        type="button"
                        onClick={() => {
                          setActiveImage(i);
                          setImageReady(false);
                        }}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-zinc-50 ${
                          i === activeImage
                            ? "border-emerald-700"
                            : "border-zinc-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className={PRODUCT_THUMB_CLASS}
                        />
                      </button>
                    ))
                  : showSkeleton
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonBlock
                          key={`thumb-skel-${i}`}
                          className="h-14 w-14 shrink-0 rounded-md"
                        />
                      ))
                    : (
                        <div className="h-14 w-14 shrink-0 rounded-md border border-dashed border-zinc-200 bg-zinc-50" />
                      )}
              </div>

              <div className="min-h-[5.5rem] space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Variants
                  </p>
                  {!showSkeleton && (product?.variants?.length ?? 0) > 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      {product!.variants!.length} option
                      {product!.variants!.length === 1 ? "" : "s"} · all
                      imported together
                    </p>
                  ) : null}
                </div>
                {showSkeleton ? (
                  <div className="flex flex-wrap gap-2">
                    <SkeletonBlock className="h-12 w-28" />
                    <SkeletonBlock className="h-12 w-32" />
                    <SkeletonBlock className="h-12 w-24" />
                  </div>
                ) : (product?.variants?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-600">
                      Import keeps every color/size under this one product.
                      Choose the default option buyers see first:
                    </p>
                    <label className="block space-y-1">
                      <span className="sr-only">Select default color / size</span>
                      <select
                        value={selectedVariant?.externalVariantId ?? ""}
                        onChange={(event) => {
                          const next = product!.variants!.find(
                            (variant) =>
                              variant.externalVariantId === event.target.value,
                          );
                          if (next) applyVariant(next);
                        }}
                        className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                      >
                        {product!.variants!.map((variant) => (
                          <option
                            key={variant.externalVariantId}
                            value={variant.externalVariantId}
                          >
                            {variant.label}
                            {" · "}
                            {formatMoney(variant.priceUsdt, MARKETPLACE_CURRENCY)}
                            {variant.stockQuantity != null
                              ? ` · ${variant.stockQuantity} in stock`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {product!.variants!.map((v) => {
                        const selected =
                          selectedVariant?.externalVariantId ===
                          v.externalVariantId;
                        return (
                          <button
                            key={v.externalVariantId}
                            type="button"
                            onClick={() => applyVariant(v)}
                            className={`min-h-12 max-w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                              selected
                                ? "border-emerald-700 bg-emerald-50 text-zinc-950"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-600"
                            }`}
                          >
                            <span className="block break-words font-medium text-zinc-950">
                              {v.label}
                            </span>
                            <span className="text-zinc-500">
                              {formatMoney(v.priceUsdt, MARKETPLACE_CURRENCY)}
                              {v.stockQuantity != null
                                ? ` · ${v.stockQuantity} in stock`
                                : " · stock unknown"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {product ? "No variant options for this listing." : "—"}
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="min-h-[4.75rem] rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                {showSkeleton ? (
                  <div className="space-y-2 py-0.5">
                    <SkeletonBlock className="h-3 w-2/3" />
                    <SkeletonBlock className="h-3 w-5/6" />
                    <SkeletonBlock className="h-3 w-1/2" />
                  </div>
                ) : (
                  <>
                    <p>
                      Supplier cost:{" "}
                      <span className="font-semibold text-zinc-950">
                        {formatMoney(costUsdt, MARKETPLACE_CURRENCY)}
                      </span>
                      {selectedVariant ? ` · ${selectedVariant.label}` : null}
                    </p>
                    <p className="mt-1">
                      Ships from {product?.warehouseCountry ?? "—"} ·{" "}
                      {product?.shippingDaysMin ?? "—"}–
                      {product?.shippingDaysMax ?? "—"} days · Stock{" "}
                      {selectedVariant?.stockQuantity != null
                        ? selectedVariant.stockQuantity
                        : product?.stockQuantity != null
                          ? product.stockQuantity
                          : "unknown"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-zinc-400">
                      {product?.externalProductId ?? externalProductId}
                      {selectedVariant?.externalSku
                        ? ` · ${selectedVariant.externalSku}`
                        : null}
                    </p>
                  </>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-zinc-600">
                  Store title
                </span>
                {showSkeleton ? (
                  <SkeletonBlock className="h-10 w-full" />
                ) : (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                  />
                )}
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-zinc-600">
                  Description (review &amp; tweak before import)
                </span>
                {showSkeleton ? (
                  <SkeletonBlock className="h-48 w-full" />
                ) : (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={8}
                    className="h-48 w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-950 outline-none focus:border-emerald-700"
                  />
                )}
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-h-[5.5rem] space-y-1">
                  <span className="text-xs font-medium text-zinc-600">
                    Selling price ({MARKETPLACE_CURRENCY})
                  </span>
                  {showSkeleton ? (
                    <SkeletonBlock className="h-10 w-full" />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={costUsdt || 0.01}
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => {
                            const next = e.target.value;
                            setEditPrice(next);
                            if (!showComparePrice) return;
                            const sell = Number(next);
                            if (
                              Number.isFinite(sell) &&
                              sell > 0 &&
                              (editComparePrice.trim() === "" ||
                                Number(editComparePrice) <= sell)
                            ) {
                              setEditComparePrice(
                                String(
                                  suggestedComparePrice(
                                    sell,
                                    product?.compareAtPriceUsdt,
                                  ),
                                ),
                              );
                            }
                          }}
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const sell = suggestedSellPrice(costUsdt);
                          setEditPrice(String(sell));
                          if (showComparePrice) {
                            setEditComparePrice(
                              String(
                                suggestedComparePrice(
                                  sell,
                                  product?.compareAtPriceUsdt,
                                ),
                              ),
                            );
                          }
                        }}
                        className="h-8 rounded-md border border-zinc-200 px-2.5 text-[11px] text-zinc-600 hover:bg-zinc-50"
                      >
                        Reset to +
                        {Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}%
                        markup
                      </button>
                      <p className="min-h-4 text-xs text-zinc-500">
                        {margin != null ? (
                          <>
                            Est. margin vs supplier:{" "}
                            <span
                              className={
                                margin >= 0
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }
                            >
                              {margin >= 0 ? "+" : ""}
                              {margin}%
                            </span>
                          </>
                        ) : !sellOk && editPrice !== "" ? (
                          <span className="text-red-700">
                            Sell price must be at least{" "}
                            {formatMoney(costUsdt, MARKETPLACE_CURRENCY)}.
                          </span>
                        ) : (
                          "\u00a0"
                        )}
                      </p>
                    </>
                  )}
                </label>

                <div className="block min-h-[5.5rem] space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-600">
                      Compare price ({MARKETPLACE_CURRENCY})
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                      <input
                        type="checkbox"
                        checked={showComparePrice}
                        disabled={showSkeleton}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setShowComparePrice(enabled);
                          if (enabled) {
                            const sell = Number.isFinite(parsedSell)
                              ? parsedSell
                              : suggestedSellPrice(costUsdt);
                            setEditComparePrice(
                              String(
                                suggestedComparePrice(
                                  sell,
                                  product?.compareAtPriceUsdt,
                                ),
                              ),
                            );
                          } else {
                            setEditComparePrice("");
                          }
                        }}
                        className="h-3.5 w-3.5 accent-emerald-700"
                      />
                      Show for this listing
                    </label>
                  </div>
                  {showSkeleton ? (
                    <SkeletonBlock className="h-10 w-full" />
                  ) : showComparePrice ? (
                    <>
                      <input
                        type="number"
                        min={sellOk ? parsedSell + 0.01 : 0.01}
                        step="0.01"
                        value={editComparePrice}
                        onChange={(e) => setEditComparePrice(e.target.value)}
                        placeholder="Optional strikethrough"
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                      />
                      <p className="min-h-4 text-xs text-zinc-500">
                        {!compareOk && editComparePrice.trim() !== "" ? (
                          <span className="text-red-700">
                            Compare price must be higher than selling price.
                          </span>
                        ) : (
                          "Shown as the crossed-out list price on your store."
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                      Hidden for new items — enable only if you want a
                      strikethrough “was” price on the storefront.
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`min-h-[5.5rem] rounded-lg border px-3 py-2.5 text-xs ${
                  quota.meetsMinimum
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <p className="font-semibold">
                  Active catalog: {quota.activeItemCount}/
                  {quota.minActiveItems} minimum
                </p>
                {!quota.meetsMinimum ? (
                  <p className="mt-1">
                    After this import you will have {quota.catalogItemCount + 1}{" "}
                    listed item
                    {quota.catalogItemCount + 1 === 1 ? "" : "s"}. Keep building
                    toward {quota.minActiveItems} active products — the{" "}
                    {quota.itemFeeUsdt} USDT / item / month fee applies once you
                    reach the floor (
                    {(quota.minActiveItems * quota.itemFeeUsdt).toFixed(0)}{" "}
                    USDT/mo minimum).
                  </p>
                ) : (
                  <p className="mt-1">
                    You meet the {quota.minActiveItems}-item floor. Import slots
                    remaining: {quota.remainingImportSlots} of{" "}
                    {quota.maxImportItems}.
                  </p>
                )}
                {quota.atImportLimit && (
                  <p className="mt-1 font-medium text-red-800">
                    Import blocked — {quota.maxImportItems}-item catalog cap
                    reached.
                  </p>
                )}
              </div>

              <div className="min-h-[2.5rem]">
                {importState?.error ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {importState.error}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col justify-center gap-2 border-t border-zinc-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="break-words text-[11px] text-zinc-500">
            {confirmOpen
              ? "Confirm the import details below."
              : "Import saves every color/size under one product. Your selection is only the default option."}
          </p>
          {!confirmOpen ? (
            <button
              type="button"
              disabled={!canImport || importPending}
              onClick={() => setConfirmOpen(true)}
              className="min-h-11 w-full shrink-0 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:min-h-0 sm:w-auto"
            >
              {loading && !product ? "Loading…" : "Import to Store"}
            </button>
          ) : (
            <div className="flex w-full min-w-0 max-w-full flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:max-w-md">
              <p className="break-words text-xs text-zinc-950">
                Confirm import of{" "}
                <strong>{editName.trim() || product?.name}</strong> at{" "}
                {formatMoney(parsedSell, MARKETPLACE_CURRENCY)}
                {editComparePrice.trim() !== "" && compareOk
                  ? ` (compare ${formatMoney(parsedCompare, MARKETPLACE_CURRENCY)})`
                  : ""}
                {(product?.variants?.length ?? 0) > 1
                  ? ` with all ${product!.variants!.length} color/size options`
                  : ""}
                ?
              </p>
              <p className="break-words text-[11px] text-zinc-600">
                Minimum catalog size: {quota.minActiveItems} active items (you
                have {quota.activeItemCount} active / {quota.catalogItemCount}{" "}
                listed). Cap: {quota.maxImportItems} imports.
                {!quota.meetsMinimum
                  ? ` CJ import is allowed below ${quota.minActiveItems}; keep going to clear the CJ fee floor. Manual products are exempt.`
                  : ""}
              </p>
              <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  disabled={importPending || !canImport}
                  onClick={submitImport}
                  className="min-h-11 w-full rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:min-h-0 sm:w-auto"
                >
                  {importPending ? "Importing…" : "Confirm import"}
                </button>
                <button
                  type="button"
                  disabled={importPending}
                  onClick={() => setConfirmOpen(false)}
                  className="min-h-11 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 sm:min-h-0 sm:w-auto"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
