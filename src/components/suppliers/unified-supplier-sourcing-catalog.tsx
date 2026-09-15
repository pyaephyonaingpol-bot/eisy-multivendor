"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ONE_CLICK_IMPORT_MARKUP,
  MIN_IMPORT_STOCK_QUANTITY,
  meetsMinImportStock,
  supplierPlatformLabel,
  type ExternalCatalogProduct,
  type ExternalSupplierKind,
} from "@/lib/suppliers/types";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import {
  SupplierProductPreviewModal,
  type PreviewQuotaHints,
} from "@/components/suppliers/supplier-product-preview-modal";

export type ImportQuotaHints = PreviewQuotaHints;

export type SourcingRegionOption = {
  id: string;
  code: string;
  name: string;
};

type SourceTab = "all" | "dsers" | "cj_dropshipping" | "spocket" | "pod";
type DeliverySpeedFilter = "any" | "fast" | "local";

type Props = {
  regions: SourcingRegionOption[];
  importDisabled?: boolean;
  quota?: ImportQuotaHints | null;
};

const SOURCE_TABS: { id: SourceTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dsers", label: "DSers" },
  { id: "cj_dropshipping", label: "CJ Dropshipping" },
  { id: "spocket", label: "Spocket" },
  { id: "pod", label: "POD" },
];

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

export function UnifiedSupplierSourcingCatalog({
  regions,
  importDisabled = false,
  quota = null,
}: Props) {
  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [query, setQuery] = useState("wireless earbuds");
  const [regionCode, setRegionCode] = useState(
    regions.find((region) => region.code === "MM")?.code ??
      regions.find((region) => region.code === "GLOBAL")?.code ??
      regions[0]?.code ??
      "GLOBAL",
  );
  const [deliverySpeed, setDeliverySpeed] =
    useState<DeliverySpeedFilter>("any");
  const [products, setProducts] = useState<ExternalCatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<ExternalSupplierKind | null>(
    null,
  );
  const [previewSuccess, setPreviewSuccess] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();

  const atLimit = importDisabled || quota?.atImportLimit === true;
  const minActive = quota?.minActiveItems ?? 10;
  const previewQuota = quota ?? { ...fallbackQuota, atImportLimit: atLimit };

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      if (deliverySpeed === "fast" && !isFastDispatch(product)) return false;
      if (deliverySpeed === "local" && !isLocalWarehouse(product)) return false;
      return true;
    });
  }, [products, deliverySpeed]);

  const previewProduct =
    visibleProducts.find(
      (product) =>
        product.externalProductId === previewId &&
        (!previewKind || product.providerKind === previewKind),
    ) ?? null;

  function runSearch() {
    setError(null);
    setPreviewSuccess(null);
    startSearch(async () => {
      try {
        const params = new URLSearchParams({
          source: sourceTab,
          q: query,
          region: regionCode,
        });
        const response = await fetch(`/api/suppliers/catalog?${params}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          products?: ExternalCatalogProduct[];
        };
        if (!response.ok || payload.ok === false) {
          setError(payload.error ?? "Search failed.");
          setProducts([]);
          return;
        }
        setProducts(payload.products ?? []);
      } catch {
        setError("Could not reach supplier catalog API.");
        setProducts([]);
      }
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Multi-supplier product sourcing
        </h2>
        <p className="text-sm text-zinc-600">
          Filter DSers, CJ Dropshipping, Spocket, and POD (Printful / Printify)
          catalogs in one place. Imports require at least{" "}
          {MIN_IMPORT_STOCK_QUANTITY} units of supplier stock and respect your
          store&apos;s regional shipping filters.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Supplier source"
      >
        {SOURCE_TABS.map((tab) => {
          const active = sourceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSourceTab(tab.id)}
              className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3 text-sm text-sky-950 sm:px-4">
        <p className="font-semibold text-sky-900">Fast shipping strategies</p>
        <p className="mt-1 text-sky-900/90">
          Prefer regional warehouses (US / EU / SEA), filter for fast dispatch
          (≤7 days), and favor carriers such as DHL, FedEx, or ePacket when the
          supplier exposes them. Local-warehouse badges help you spot quicker
          lanes before import.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-zinc-600">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch();
            }}
            placeholder="Search products across suppliers"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Ship-to region
          <select
            value={regionCode}
            onChange={(event) => setRegionCode(event.target.value)}
            className="mt-1 block min-w-[10rem] rounded-lg border border-zinc-200 px-3 py-2.5 text-sm"
          >
            {regions.length === 0 ? (
              <option value="GLOBAL">GLOBAL</option>
            ) : (
              regions.map((region) => (
                <option key={region.id} value={region.code}>
                  {region.name} ({region.code})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Delivery speed
          <select
            value={deliverySpeed}
            onChange={(event) =>
              setDeliverySpeed(event.target.value as DeliverySpeedFilter)
            }
            className="mt-1 block min-w-[10rem] rounded-lg border border-zinc-200 px-3 py-2.5 text-sm"
          >
            <option value="any">Any speed</option>
            <option value="fast">Fast dispatch (≤7 days)</option>
            <option value="local">Local warehouse</option>
          </select>
        </label>
        <button
          type="button"
          onClick={runSearch}
          disabled={pendingSearch}
          className="min-h-11 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pendingSearch ? "Searching…" : "Search"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {previewSuccess ? (
        <p className="text-sm text-emerald-700">{previewSuccess}</p>
      ) : null}
      {atLimit ? (
        <p className="text-sm text-amber-800">
          Import limit reached. Archive listings or upgrade before importing
          more.
        </p>
      ) : null}

      {visibleProducts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Run a search to load supplier products
          {process.env.NODE_ENV === "development"
            ? " (mock catalogs when live API keys are unset)."
            : "."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const suggested = defaultSellPrice(product.priceUsdt);
            const stockOk = meetsMinImportStock(product.stockQuantity);
            const fast = isFastDispatch(product);
            const local = isLocalWarehouse(product);
            return (
              <li
                key={`${product.providerKind}:${product.externalProductId}`}
                className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-3"
              >
                <div className="flex gap-3">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-20 w-20 shrink-0 rounded-lg bg-zinc-100" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                        {sourceBadge(product.providerKind)}
                      </span>
                      {fast ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          Fast dispatch
                        </span>
                      ) : null}
                      {local ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          Local warehouse
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 font-medium text-zinc-950">
                      {product.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {product.warehouseCountry}
                      {product.shippingDaysMin != null &&
                      product.shippingDaysMax != null
                        ? ` · ${product.shippingDaysMin}–${product.shippingDaysMax} days`
                        : ""}
                      {product.stockQuantity != null
                        ? ` · stock ${product.stockQuantity}`
                        : ""}
                    </p>
                    <p className="text-sm text-zinc-700">
                      {formatMoney(product.priceUsdt, MARKETPLACE_CURRENCY)}
                      {" → "}
                      {formatMoney(suggested, MARKETPLACE_CURRENCY)}
                    </p>
                    {!stockOk ? (
                      <p className="text-xs text-amber-700">
                        Below {MIN_IMPORT_STOCK_QUANTITY}-unit stock minimum
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!stockOk || atLimit}
                  onClick={() => {
                    setPreviewId(product.externalProductId);
                    setPreviewKind(product.providerKind);
                  }}
                  className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Preview & import
                </button>
              </li>
            );
          })}
        </ul>
      )}

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
                `Imported into your store (product ${productId.slice(0, 8)}…). Keep building toward ${minActive} active items for the fee floor.`,
            );
          }}
        />
      ) : null}
    </section>
  );
}
