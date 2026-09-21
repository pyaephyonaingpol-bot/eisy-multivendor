"use client";

import { useActionState, useEffect, useId, useMemo, useState, useTransition } from "react";
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
import { MARKETPLACE_CURRENCY, formatMoney } from "@/lib/money";

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

function suggestedSellPrice(costUsdt: number) {
  return Math.round(costUsdt * ONE_CLICK_IMPORT_MARKUP * 100) / 100;
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
  const [product, setProduct] = useState<ExternalCatalogProduct | null>(seedProduct);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!seedProduct);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ExternalProductVariant | null>(
    seedProduct?.variants?.[0] ?? null,
  );
  const [editName, setEditName] = useState(seedProduct?.name ?? "");
  const [editDescription, setEditDescription] = useState(seedProduct?.description ?? "");
  const [editPrice, setEditPrice] = useState(
    seedProduct
      ? String(suggestedSellPrice(seedProduct.variants?.[0]?.priceUsdt ?? seedProduct.priceUsdt))
      : "",
  );
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
    setLoadError(null);

    if (seedProduct && seedProduct.externalProductId === externalProductId) {
      setProduct(seedProduct);
      setEditName(seedProduct.name);
      setEditDescription(seedProduct.description ?? "");
      const firstVariant = seedProduct.variants?.[0] ?? null;
      setSelectedVariant(firstVariant);
      setEditPrice(
        String(suggestedSellPrice(firstVariant?.priceUsdt ?? seedProduct.priceUsdt)),
      );
      setLoading(false);
    } else {
      setProduct(null);
      setLoading(true);
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/suppliers/catalog/product?provider=${encodeURIComponent(providerKind)}&id=${encodeURIComponent(externalProductId)}`,
        );
        const data = (await res.json()) as {
          product?: ExternalCatalogProduct;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.product) {
          if (!seedProduct) {
            setLoadError(data.error ?? "Failed to load product details");
          }
          return;
        }
        const p = data.product;
        setProduct(p);
        setEditName(p.name);
        setEditDescription(p.description ?? "");
        const firstVariant = p.variants?.[0] ?? null;
        setSelectedVariant(firstVariant);
        setEditPrice(String(suggestedSellPrice(firstVariant?.priceUsdt ?? p.priceUsdt)));
      } catch {
        if (!cancelled && !seedProduct) setLoadError("Network error loading product");
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

  const images = useMemo(() => {
    if (!product) return [] as string[];
    const list = [product.imageUrl, ...(product.images ?? [])].filter(
      (src): src is string => Boolean(src),
    );
    return Array.from(new Set(list));
  }, [product]);

  const costUsdt = selectedVariant?.priceUsdt ?? product?.priceUsdt ?? 0;
  const parsedSell = Number(editPrice);
  const sellOk = Number.isFinite(parsedSell) && parsedSell > 0 && parsedSell >= costUsdt;
  const margin =
    sellOk && costUsdt > 0 ? Math.round(((parsedSell - costUsdt) / costUsdt) * 1000) / 10 : null;

  function applyVariant(v: ExternalProductVariant) {
    setSelectedVariant(v);
    setEditPrice(String(suggestedSellPrice(v.priceUsdt)));
    if (v.imageUrl) {
      const idx = images.indexOf(v.imageUrl);
      if (idx >= 0) setActiveImage(idx);
    }
  }

  function submitImport() {
    if (!product || quota.atImportLimit || !sellOk) return;
    const fd = new FormData();
    fd.set("provider_kind", providerKind);
    fd.set("external_product_id", product.externalProductId);
    fd.set("region_code", regionCode);
    fd.set("price", String(parsedSell));
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !importPending) onClose();
      }}
    >
      <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:max-h-[92vh] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Product preview · {providerKind === "cj_dropshipping" ? "CJ" : "DSers"}
            </p>
            <h2 id={titleId} className="truncate text-base font-semibold text-zinc-950 sm:text-lg">
              {product?.name ?? "Loading product…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importPending}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading && !product && (
            <p className="py-12 text-center text-sm text-zinc-500">
              Loading full product details…
            </p>
          )}
          {loadError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {loadError}
            </p>
          )}

          {product && (
            <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[activeImage] ?? product.imageUrl ?? ""}
                    alt={product.name}
                    className="aspect-square w-full object-cover"
                  />
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((src, i) => (
                      <button
                        key={`${src}-${i}`}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${
                          i === activeImage ? "border-emerald-700" : "border-zinc-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {(product.variants?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Variants
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.variants!.map((v) => {
                        const selected =
                          selectedVariant?.externalVariantId === v.externalVariantId;
                        return (
                          <button
                            key={v.externalVariantId}
                            type="button"
                            onClick={() => applyVariant(v)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                              selected
                                ? "border-emerald-700 bg-emerald-50 text-zinc-950"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-600"
                            }`}
                          >
                            <span className="block font-medium text-zinc-950">{v.label}</span>
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
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  <p>
                    Supplier cost:{" "}
                    <span className="font-semibold text-zinc-950">
                      {formatMoney(costUsdt, MARKETPLACE_CURRENCY)}
                    </span>
                    {selectedVariant ? ` · ${selectedVariant.label}` : null}
                  </p>
                  <p className="mt-1">
                    Ships from {product.warehouseCountry} · {product.shippingDaysMin ?? "—"}–
                    {product.shippingDaysMax ?? "—"} days · Stock{" "}
                    {selectedVariant?.stockQuantity != null
                      ? selectedVariant.stockQuantity
                      : product.stockQuantity != null
                        ? product.stockQuantity
                        : "unknown"}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-400">
                    {product.externalProductId}
                    {selectedVariant?.externalSku ? ` · ${selectedVariant.externalSku}` : null}
                  </p>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-zinc-600">Store title</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-zinc-600">
                    Description (review &amp; tweak before import)
                  </span>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={8}
                    className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-950 outline-none focus:border-emerald-700"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-zinc-600">
                    Your selling price ({MARKETPLACE_CURRENCY})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={costUsdt || 0.01}
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-36 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-700"
                    />
                    <button
                      type="button"
                      onClick={() => setEditPrice(String(suggestedSellPrice(costUsdt)))}
                      className="rounded-md border border-zinc-200 px-2.5 py-2 text-xs text-zinc-600 hover:bg-zinc-50"
                    >
                      Reset to +{Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}% markup
                    </button>
                  </div>
                  {margin != null && (
                    <p className="text-xs text-zinc-500">
                      Est. margin vs supplier:{" "}
                      <span className={margin >= 0 ? "text-emerald-700" : "text-red-700"}>
                        {margin >= 0 ? "+" : ""}
                        {margin}%
                      </span>
                    </p>
                  )}
                  {!sellOk && editPrice !== "" && (
                    <p className="text-xs text-red-700">
                      Sell price must be at least {formatMoney(costUsdt, MARKETPLACE_CURRENCY)}.
                    </p>
                  )}
                </label>

                <div
                  className={`rounded-lg border px-3 py-2.5 text-xs ${
                    quota.meetsMinimum
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  <p className="font-semibold">
                    Active catalog: {quota.activeItemCount}/{quota.minActiveItems} minimum
                  </p>
                  {!quota.meetsMinimum ? (
                    <p className="mt-1">
                      After this import you will have {quota.catalogItemCount + 1} listed item
                      {quota.catalogItemCount + 1 === 1 ? "" : "s"}. Keep building toward{" "}
                      {quota.minActiveItems} active products — the {quota.itemFeeUsdt} USDT / item /
                      month fee applies once you reach the floor (
                      {(quota.minActiveItems * quota.itemFeeUsdt).toFixed(0)} USDT/mo minimum).
                    </p>
                  ) : (
                    <p className="mt-1">
                      You meet the {quota.minActiveItems}-item floor. Import slots remaining:{" "}
                      {quota.remainingImportSlots} of {quota.maxImportItems}.
                    </p>
                  )}
                  {quota.atImportLimit && (
                    <p className="mt-1 font-medium text-red-800">
                      Import blocked — {quota.maxImportItems}-item catalog cap reached.
                    </p>
                  )}
                </div>

                {importState?.error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {importState.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {product && (
          <footer className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[11px] text-zinc-500">
              Import uses your edited title, description, price, and selected variant.
            </p>
            {!confirmOpen ? (
              <button
                type="button"
                disabled={quota.atImportLimit || !sellOk || importPending}
                onClick={() => setConfirmOpen(true)}
                className="rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Import to Store
              </button>
            ) : (
              <div className="flex w-full flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:max-w-md">
                <p className="text-xs text-zinc-950">
                  Confirm import of <strong>{editName.trim() || product.name}</strong> at{" "}
                  {formatMoney(parsedSell, MARKETPLACE_CURRENCY)}?
                </p>
                <p className="text-[11px] text-zinc-600">
                  Minimum catalog size: {quota.minActiveItems} active items (you have{" "}
                  {quota.activeItemCount} active / {quota.catalogItemCount} listed). Cap:{" "}
                  {quota.maxImportItems} imports.
                  {!quota.meetsMinimum
                    ? ` CJ import is allowed below ${quota.minActiveItems}; keep going to clear the CJ fee floor. Manual products are exempt.`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={importPending || quota.atImportLimit || !sellOk}
                    onClick={submitImport}
                    className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {importPending ? "Importing…" : "Confirm import"}
                  </button>
                  <button
                    type="button"
                    disabled={importPending}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
