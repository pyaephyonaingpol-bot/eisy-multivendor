"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useI18n } from "@/components/i18n/language-provider";
import { SupplierSourceTabs } from "@/components/suppliers/supplier-source-tabs";
import {
  SupplierProductPreviewModal,
  type PreviewQuotaHints,
} from "@/components/suppliers/supplier-product-preview-modal";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import {
  PRIMARY_SUPPLIER_KIND,
} from "@/lib/suppliers/availability";
import {
  kindsForSourceTab,
  type SupplierSourceTab,
} from "@/lib/suppliers";
import { bulkImportExternalSupplierProductsAction } from "@/lib/suppliers/actions";
import { MAX_BULK_IMPORT_ITEMS } from "@/lib/suppliers/types";
import { DEFAULT_CJ_SOURCING_REGION } from "@/lib/sourcing/constants";
import {
  ONE_CLICK_IMPORT_MARKUP,
  MIN_IMPORT_STOCK_QUANTITY,
  meetsMinImportStock,
  supplierPlatformLabel,
  type ExternalCatalogProduct,
  type ExternalSupplierKind,
} from "@/lib/suppliers/types";

export type ImportQuotaHints = PreviewQuotaHints;

export type SourcingRegionOption = {
  id: string;
  code: string;
  name: string;
  is_default?: boolean;
};

type DeliverySpeedFilter = "any" | "fast" | "local";

type Props = {
  regions: SourcingRegionOption[];
  importDisabled?: boolean;
  quota?: ImportQuotaHints | null;
};

const fallbackQuota: PreviewQuotaHints = {
  minActiveItems: 10,
  maxImportItems: 100,
  catalogItemCount: 0,
  activeItemCount: 0,
  remainingImportSlots: 100,
  itemFeeUsdt: 1,
  atImportLimit: false,
  meetsMinimum: false,
};

function defaultSellPrice(supplierCost: number) {
  return Number((supplierCost * ONE_CLICK_IMPORT_MARKUP).toFixed(2));
}

function isFastDispatch(product: ExternalCatalogProduct) {
  return product.shippingDaysMax != null && product.shippingDaysMax <= 7;
}

function isLocalWarehouse(product: ExternalCatalogProduct) {
  return ["US", "EU", "GB", "DE", "FR", "MM", "TH", "SG"].includes(
    product.warehouseCountry.toUpperCase(),
  );
}

function sourceBadge(kind: ExternalSupplierKind) {
  if (kind === "printful" || kind === "printify") return "POD";
  return supplierPlatformLabel(kind);
}

function catalogItemKey(product: ExternalCatalogProduct) {
  return `${product.providerKind}:${product.externalProductId}`;
}

function matchesSourceTab(
  product: ExternalCatalogProduct,
  tab: SupplierSourceTab,
) {
  if (tab === "all") return true;
  return kindsForSourceTab(tab).includes(product.providerKind);
}

export function UnifiedSupplierSourcingCatalog({
  regions,
  importDisabled = false,
  quota = null,
}: Props) {
  const { t } = useI18n();
  const [isMounted, setIsMounted] = useState(false);
  const [sourceTab, setSourceTab] = useState<SupplierSourceTab>(
    PRIMARY_SUPPLIER_KIND,
  );
  // Empty until mount so SSR HTML matches the first client paint (avoids
  // autofill / extension mutations on the search input).
  const [query, setQuery] = useState("");
  const [regionCode, setRegionCode] = useState(DEFAULT_CJ_SOURCING_REGION);
  const [deliverySpeed, setDeliverySpeed] =
    useState<DeliverySpeedFilter>("any");
  /** Full multi-source result set — tabs filter this client-side for instant toggles. */
  const [catalog, setCatalog] = useState<ExternalCatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<ExternalSupplierKind | null>(
    null,
  );
  const [previewSuccess, setPreviewSuccess] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [pendingMore, startLoadMore] = useTransition();
  const [pendingBulk, startBulkImport] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [relatedCategories, setRelatedCategories] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkIncludeCompare, setBulkIncludeCompare] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    setQuery("wireless earbuds");
    setRegionCode(
      regions.find((region) => region.code === DEFAULT_CJ_SOURCING_REGION)
        ?.code ??
        regions.find((region) => region.code === "GLOBAL")?.code ??
        regions.find((region) => region.is_default)?.code ??
        regions[0]?.code ??
        DEFAULT_CJ_SOURCING_REGION,
    );
    // Initial region snapshot only — later prop changes should not wipe the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const atLimit = importDisabled || quota?.atImportLimit === true;
  const minActive = quota?.minActiveItems ?? 10;
  const previewQuota = quota ?? { ...fallbackQuota, atImportLimit: atLimit };

  const tabCounts = useMemo(() => {
    const counts: Partial<Record<SupplierSourceTab, number>> = {
      all: catalog.length,
      dsers: 0,
      cj_dropshipping: 0,
      spocket: 0,
      pod: 0,
    };
    for (const product of catalog) {
      if (product.providerKind === "dsers") {
        counts.dsers = (counts.dsers ?? 0) + 1;
      } else if (product.providerKind === "cj_dropshipping") {
        counts.cj_dropshipping = (counts.cj_dropshipping ?? 0) + 1;
      } else if (product.providerKind === "spocket") {
        counts.spocket = (counts.spocket ?? 0) + 1;
      } else if (
        product.providerKind === "printful" ||
        product.providerKind === "printify"
      ) {
        counts.pod = (counts.pod ?? 0) + 1;
      }
    }
    return counts;
  }, [catalog]);

  const visibleProducts = useMemo(() => {
    return catalog.filter((product) => {
      if (!matchesSourceTab(product, sourceTab)) return false;
      if (deliverySpeed === "fast" && !isFastDispatch(product)) return false;
      if (deliverySpeed === "local" && !isLocalWarehouse(product)) return false;
      return true;
    });
  }, [catalog, sourceTab, deliverySpeed]);

  const selectableVisible = useMemo(
    () =>
      visibleProducts.filter(
        (product) => meetsMinImportStock(product.stockQuantity) && !atLimit,
      ),
    [visibleProducts, atLimit],
  );

  const selectedProducts = useMemo(() => {
    return visibleProducts.filter((product) =>
      selectedKeys.has(catalogItemKey(product)),
    );
  }, [visibleProducts, selectedKeys]);

  const selectedEligible = useMemo(
    () =>
      selectedProducts.filter((product) =>
        meetsMinImportStock(product.stockQuantity),
      ),
    [selectedProducts],
  );

  const allVisibleSelected =
    selectableVisible.length > 0 &&
    selectableVisible.every((product) =>
      selectedKeys.has(catalogItemKey(product)),
    );

  function toggleSelected(product: ExternalCatalogProduct) {
    const key = catalogItemKey(product);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < MAX_BULK_IMPORT_ITEMS) {
        next.add(key);
      }
      return next;
    });
    setBulkError(null);
  }

  function selectAllVisible() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const product of selectableVisible) {
        if (next.size >= MAX_BULK_IMPORT_ITEMS) break;
        next.add(catalogItemKey(product));
      }
      return next;
    });
    setBulkError(null);
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setBulkError(null);
  }

  function runBulkImport() {
    if (atLimit || selectedEligible.length === 0) {
      setBulkError(t("sourcing.bulkNoneEligible"));
      return;
    }
    const items = selectedEligible
      .slice(0, MAX_BULK_IMPORT_ITEMS)
      .map((product) => ({
        providerKind: product.providerKind,
        externalProductId: product.externalProductId,
      }));

    startBulkImport(async () => {
      setBulkError(null);
      setPreviewSuccess(null);
      const result = await bulkImportExternalSupplierProductsAction({
        items,
        regionCode,
        includeComparePrice: bulkIncludeCompare,
      });
      if (result.error && result.imported === 0) {
        setBulkError(result.error);
        return;
      }
      const message =
        result.failed.length === 0
          ? t("sourcing.bulkImportSuccess", {
              ok: result.imported,
              total: items.length,
            })
          : t("sourcing.bulkImportPartial", {
              ok: result.imported,
              total: items.length,
              failed: result.failed.length,
            });
      setPreviewSuccess(result.success ?? message);
      if (result.imported > 0) {
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          for (const item of items) {
            // Keep failed ids selected so the vendor can retry.
            const failedIds = new Set(
              result.failed.map((row) => row.externalProductId),
            );
            if (!failedIds.has(item.externalProductId)) {
              next.delete(`${item.providerKind}:${item.externalProductId}`);
            }
          }
          return next;
        });
      }
      if (result.failed.length > 0 && result.imported === 0) {
        setBulkError(result.failed[0]?.error ?? result.error ?? null);
      }
    });
  }

  const previewProduct =
    visibleProducts.find(
      (product) =>
        product.externalProductId === previewId &&
        (!previewKind || product.providerKind === previewKind),
    ) ?? null;

  function mergeCatalog(
    existing: ExternalCatalogProduct[],
    incoming: ExternalCatalogProduct[],
  ) {
    const seen = new Set(
      existing.map(
        (product) => `${product.providerKind}:${product.externalProductId}`,
      ),
    );
    const merged = [...existing];
    for (const product of incoming) {
      const key = `${product.providerKind}:${product.externalProductId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(product);
    }
    return merged;
  }

  function runSearch(
    nextPage = 1,
    append = false,
    overrides?: { categoryId?: string | null },
  ) {
    setError(null);
    setBulkError(null);
    if (!append) {
      setPreviewSuccess(null);
      setSelectedKeys(new Set());
    }
    const activeCategoryId =
      overrides && "categoryId" in overrides
        ? overrides.categoryId
        : categoryId;
    const run = append ? startLoadMore : startSearch;
    run(async () => {
      try {
        // CJ-only catalog while other suppliers are Coming Soon.
        const params = new URLSearchParams({
          source: PRIMARY_SUPPLIER_KIND,
          q: query,
          region: regionCode,
          page: String(nextPage),
        });
        if (activeCategoryId) {
          params.set("categoryId", activeCategoryId);
        }
        const response = await fetch(`/api/suppliers/catalog?${params}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          products?: ExternalCatalogProduct[];
          usedMock?: boolean;
          catalogMode?: "mock" | "live";
          hasMore?: boolean;
          page?: number;
          total?: number | null;
          relatedCategories?: { id: string; name: string }[];
        };
        if (!response.ok || payload.ok === false) {
          setError(payload.error ?? t("sourcing.searchFailed"));
          if (!append) {
            setCatalog([]);
            setUsedMock(false);
            setHasMore(false);
            setPage(1);
            setTotalMatches(null);
            setRelatedCategories([]);
          }
          setHasSearched(true);
          return;
        }
        const products = payload.products ?? [];
        setCatalog((prev) => (append ? mergeCatalog(prev, products) : products));
        setUsedMock(
          payload.usedMock === true ||
            payload.catalogMode === "mock" ||
            products.some(
              (product) =>
                (product as { isMock?: boolean }).isMock === true ||
                String(product.externalProductId ?? "").includes("-MOCK-"),
            ),
        );
        setPage(payload.page ?? nextPage);
        setHasMore(payload.hasMore === true);
        if (!append) {
          setTotalMatches(
            typeof payload.total === "number" ? payload.total : null,
          );
          setRelatedCategories(payload.relatedCategories ?? []);
        }
        setHasSearched(true);
      } catch {
        setError(t("sourcing.catalogUnreachable"));
        if (!append) {
          setCatalog([]);
          setUsedMock(false);
          setHasMore(false);
          setPage(1);
          setTotalMatches(null);
          setRelatedCategories([]);
        }
        setHasSearched(true);
      }
    });
  }

  function loadMore() {
    if (!hasMore || pendingSearch || pendingMore) return;
    runSearch(page + 1, true);
  }

  function selectCategory(nextCategoryId: string | null) {
    setCategoryId(nextCategoryId);
    setPreviewId(null);
    setPreviewKind(null);
    runSearch(1, false, { categoryId: nextCategoryId });
  }

  // Seed catalog once after client defaults are applied (hydration-safe).
  useEffect(() => {
    if (!isMounted || seededRef.current || !query) return;
    seededRef.current = true;
    runSearch(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot post-mount seed
  }, [isMounted, query, regionCode]);

  return (
    <section className="w-full max-w-full space-y-5 overflow-x-hidden rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("sourcing.catalogTitle")}
        </h2>
        <p className="text-sm text-zinc-600">{t("sourcing.catalogSubtitle")}</p>
      </div>

      {usedMock ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 sm:px-4">
          {t("sourcing.mockCatalogBanner")}
        </div>
      ) : null}

      <SupplierSourceTabs
        value={sourceTab}
        onChange={(tab) => {
          setSourceTab(tab);
          setPreviewId(null);
          setPreviewKind(null);
        }}
        t={t}
        counts={hasSearched ? tabCounts : undefined}
      />

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3 text-sm text-sky-950 sm:px-4">
        <p className="font-semibold text-sky-900">
          {t("sourcing.fastStrategiesTitle")}
        </p>
        <p className="mt-1 break-words text-sky-900/90">
          {t("sourcing.fastStrategiesBody")}
        </p>
      </div>

      <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] lg:items-end">
        <label className="min-w-0 text-xs font-medium text-zinc-600 sm:col-span-2 lg:col-span-1">
          {t("sourcing.search")}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setCategoryId(null);
                runSearch(1, false, { categoryId: null });
              }
            }}
            placeholder={t("sourcing.searchPlaceholder")}
            disabled={!isMounted}
            suppressHydrationWarning
            className="mt-1 w-full max-w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-base disabled:opacity-60"
          />
        </label>
        <label className="min-w-0 text-xs font-medium text-zinc-600">
          {t("sourcing.shipToRegion")}
          <select
            value={regionCode}
            onChange={(event) => setRegionCode(event.target.value)}
            disabled={!isMounted}
            suppressHydrationWarning
            className="mt-1 block w-full max-w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-base disabled:opacity-60"
          >
            {regions.length === 0 ? (
              <option value={DEFAULT_CJ_SOURCING_REGION}>
                {DEFAULT_CJ_SOURCING_REGION}
              </option>
            ) : (
              regions.map((region) => (
                <option key={region.id} value={region.code}>
                  {region.name} ({region.code})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="min-w-0 text-xs font-medium text-zinc-600">
          {t("sourcing.deliverySpeed")}
          <select
            value={deliverySpeed}
            onChange={(event) =>
              setDeliverySpeed(event.target.value as DeliverySpeedFilter)
            }
            disabled={!isMounted}
            suppressHydrationWarning
            className="mt-1 block w-full max-w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-base disabled:opacity-60"
          >
            <option value="any">{t("sourcing.anySpeed")}</option>
            <option value="fast">{t("sourcing.fastDispatchFilter")}</option>
            <option value="local">{t("sourcing.localWarehouse")}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setCategoryId(null);
            runSearch(1, false, { categoryId: null });
          }}
          disabled={!isMounted || pendingSearch}
          className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 sm:col-span-2 lg:col-span-1 lg:w-auto"
        >
          {pendingSearch ? t("sourcing.searching") : t("sourcing.searchButton")}
        </button>
      </div>

      {relatedCategories.length > 0 || categoryId ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-600">
            {t("sourcing.relatedCategories")}
          </p>
          <div className="flex max-w-full flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectCategory(null)}
              disabled={pendingSearch || pendingMore}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                !categoryId
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {t("sourcing.allCategories")}
            </button>
            {relatedCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                disabled={pendingSearch || pendingMore}
                className={`max-w-full truncate rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  categoryId === category.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {previewSuccess ? (
        <p className="text-sm text-emerald-700">{previewSuccess}</p>
      ) : null}
      {bulkError ? (
        <p className="text-sm text-red-600" role="alert">
          {bulkError}
        </p>
      ) : null}
      {atLimit ? (
        <p className="text-sm text-amber-800">
          {t("sourcing.importLimitReached")}
        </p>
      ) : null}

      {visibleProducts.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-600">{t("sourcing.bulkSelectHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={allVisibleSelected ? clearSelection : selectAllVisible}
              disabled={atLimit || selectableVisible.length === 0 || pendingBulk}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {allVisibleSelected
                ? t("sourcing.bulkClear")
                : t("sourcing.bulkSelectAll")}
            </button>
            <span className="text-xs text-zinc-500">
              {t("sourcing.bulkMaxHint", { max: MAX_BULK_IMPORT_ITEMS })}
            </span>
          </div>
        </div>
      ) : null}

      {visibleProducts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {process.env.NODE_ENV === "development"
            ? t("sourcing.emptySearchDev")
            : t("sourcing.emptySearch")}
        </p>
      ) : (
        <ul className="grid w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const suggested = defaultSellPrice(product.priceUsdt);
            const stockOk = meetsMinImportStock(product.stockQuantity);
            const fast = isFastDispatch(product);
            const local = isLocalWarehouse(product);
            const itemKey = catalogItemKey(product);
            const isSelected = selectedKeys.has(itemKey);
            const selectionFull =
              !isSelected && selectedKeys.size >= MAX_BULK_IMPORT_ITEMS;
            return (
              <li
                key={itemKey}
                className={`flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border ${
                  isSelected
                    ? "border-emerald-600 ring-1 ring-emerald-600/30"
                    : "border-zinc-100"
                }`}
              >
                <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden bg-zinc-50 sm:aspect-square">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-full w-full object-contain object-center p-2"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                      No image
                    </div>
                  )}
                  <label
                    className={`absolute left-2 top-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm ${
                      isSelected
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-zinc-200 bg-white/95 text-zinc-700"
                    } ${!stockOk || atLimit || selectionFull ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!stockOk || atLimit || selectionFull || pendingBulk}
                      onChange={() => toggleSelected(product)}
                      className="h-3.5 w-3.5 accent-emerald-700"
                    />
                    {t("sourcing.bulkSelect")}
                  </label>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                        {sourceBadge(product.providerKind)}
                      </span>
                      {fast ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          {t("sourcing.fastDispatch")}
                        </span>
                      ) : null}
                      {local ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          {t("sourcing.localWarehouse")}
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 break-words font-medium text-zinc-950">
                      {product.name}
                    </p>
                    <p className="break-words text-xs text-zinc-500">
                      {product.warehouseCountry}
                      {product.shippingDaysMin != null &&
                      product.shippingDaysMax != null
                        ? ` · ${t("sourcing.daysRange", {
                            min: product.shippingDaysMin,
                            max: product.shippingDaysMax,
                          })}`
                        : ""}
                      {product.stockQuantity != null
                        ? ` · ${t("sourcing.stockLabel", {
                            qty: product.stockQuantity,
                          })}`
                        : ""}
                    </p>
                    <p className="text-sm text-zinc-700">
                      {formatMoney(product.priceUsdt, MARKETPLACE_CURRENCY)}
                      {" → "}
                      {formatMoney(suggested, MARKETPLACE_CURRENCY)}
                    </p>
                    {!stockOk ? (
                      <p className="text-xs text-amber-700">
                        {t("sourcing.stockBelowMin", {
                          min: MIN_IMPORT_STOCK_QUANTITY,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!stockOk || atLimit}
                    onClick={() => {
                      setPreviewId(product.externalProductId);
                      setPreviewKind(product.providerKind);
                    }}
                    className="mt-auto min-h-11 w-full max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {t("sourcing.previewImport")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedKeys.size > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-zinc-950">
                {t("sourcing.bulkSelected", { count: selectedKeys.size })}
                {selectedEligible.length !== selectedKeys.size
                  ? ` · ${selectedEligible.length} ready`
                  : ""}
              </p>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={bulkIncludeCompare}
                  onChange={(e) => setBulkIncludeCompare(e.target.checked)}
                  disabled={pendingBulk}
                  className="h-3.5 w-3.5 accent-emerald-700"
                />
                {t("sourcing.bulkIncludeCompare")}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearSelection}
                disabled={pendingBulk}
                className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t("sourcing.bulkClear")}
              </button>
              <button
                type="button"
                onClick={runBulkImport}
                disabled={
                  pendingBulk || atLimit || selectedEligible.length === 0
                }
                className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pendingBulk
                  ? t("sourcing.bulkImporting")
                  : t("sourcing.bulkImportSelected")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hasSearched && hasMore ? (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-xs text-zinc-500">
            {totalMatches != null && totalMatches > catalog.length
              ? t("sourcing.showingCountOfTotal", {
                  count: catalog.length,
                  total: totalMatches,
                })
              : t("sourcing.showingCount", { count: catalog.length })}
          </p>
          <button
            type="button"
            onClick={loadMore}
            disabled={pendingMore || pendingSearch}
            className="min-h-11 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pendingMore ? t("sourcing.loadingMore") : t("sourcing.loadMore")}
          </button>
        </div>
      ) : hasSearched && catalog.length > 0 ? (
        <p className="pt-1 text-center text-xs text-zinc-500">
          {totalMatches != null && totalMatches > catalog.length
            ? t("sourcing.showingCountOfTotal", {
                count: catalog.length,
                total: totalMatches,
              })
            : t("sourcing.showingCount", { count: catalog.length })}
        </p>
      ) : null}

      {previewId && previewKind ? (
        <SupplierProductPreviewModal
          open
          onClose={() => {
            setPreviewId(null);
            setPreviewKind(null);
          }}
          providerKind={previewKind}
          externalProductId={previewId}
          regionCode={regionCode}
          quota={previewQuota}
          seedProduct={previewProduct}
          onImported={({ productId, success }) => {
            setPreviewId(null);
            setPreviewKind(null);
            setPreviewSuccess(
              success ??
                t("sourcing.importSuccess", {
                  id: productId.slice(0, 8),
                  min: minActive,
                }),
            );
          }}
        />
      ) : null}
    </section>
  );
}
