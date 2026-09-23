"use client";

import { useActionState, useState, useTransition } from "react";
import {
  importExternalSupplierProductAction,
  type ExternalImportState,
} from "@/lib/suppliers/actions";
import {
  ONE_CLICK_IMPORT_MARKUP,
  type ExternalCatalogProduct,
} from "@/lib/suppliers/types";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import {
  SupplierProductPreviewModal,
  type PreviewQuotaHints,
} from "@/components/suppliers/supplier-product-preview-modal";

const initialState: ExternalImportState = null;

export type ImportQuotaHints = PreviewQuotaHints;

type Props = {
  providerKind: "cj_dropshipping" | "dsers" | "spocket" | "printful" | "printify";
  providerLabel: string;
  importDisabled?: boolean;
  quota?: ImportQuotaHints | null;
};

function defaultSellPrice(supplierCost: number) {
  return Number((supplierCost * ONE_CLICK_IMPORT_MARKUP).toFixed(2));
}

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

export function ExternalSupplierCatalogPanel({
  providerKind,
  providerLabel,
  importDisabled = false,
  quota = null,
}: Props) {
  const [query, setQuery] = useState("wireless earbuds");
  const [products, setProducts] = useState<ExternalCatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customPriceFor, setCustomPriceFor] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewSuccess, setPreviewSuccess] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [state, formAction, pendingImport] = useActionState(
    importExternalSupplierProductAction,
    initialState,
  );

  const atLimit = importDisabled || quota?.atImportLimit === true;
  const minActive = quota?.minActiveItems ?? 10;
  const maxImports = quota?.maxImportItems ?? 100;
  const belowMin = quota ? !quota.meetsMinimum : false;
  const previewQuota = quota ?? { ...fallbackQuota, atImportLimit: atLimit };
  const previewProduct =
    products.find((p) => p.externalProductId === previewId) ?? null;

  function runSearch() {
    setError(null);
    startSearch(async () => {
      try {
        const response = await fetch(
          `/api/suppliers/catalog?provider=${providerKind}&q=${encodeURIComponent(query)}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          products?: ExternalCatalogProduct[];
        };
        if (!response.ok || !payload.ok) {
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
    <section className="w-full max-w-full space-y-4 overflow-x-hidden rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{providerLabel}</h2>
        <p className="break-words text-sm text-zinc-600">
          Search the {providerLabel} catalog, open <strong>Preview</strong> to review
          images, variants, and description, then <strong>Import to Store</strong>.
          One-click listing uses a default{" "}
          {Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}% markup. Imports respect
          your max catalog cap ({maxImports}) and the {minActive}-item monthly fee
          floor.
        </p>
      </div>

      <div className="flex w-full max-w-full flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          className="w-full min-w-0 max-w-full flex-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-base sm:py-2"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pendingSearch}
          className="min-h-11 w-full shrink-0 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 sm:min-h-0 sm:w-auto"
        >
          {pendingSearch ? "Searching…" : "Search"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}
      {previewSuccess ? (
        <p className="text-sm text-emerald-700">{previewSuccess}</p>
      ) : null}
      {atLimit ? (
        <p className="text-sm text-amber-800">
          Import limit reached ({quota?.catalogItemCount ?? "—"}/{maxImports}).
          Archive unused listings or upgrade your plan before importing more.
        </p>
      ) : null}
      {belowMin && !atLimit ? (
        <p className="text-sm text-amber-800">
          You have {quota?.activeItemCount} active CJ import
          {(quota?.activeItemCount ?? 0) === 1 ? "" : "s"}. CJ Dropshipping is
          billed for at least {minActive} active CJ items (
          {minActive * (quota?.itemFeeUsdt ?? 1)} USDT/mo). Manual/custom
          products are exempt — keep importing CJ SKUs to clear the fee floor.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Run a search to load {providerLabel} products from the platform
          catalog
          {process.env.NODE_ENV === "development"
            ? " (mock data when platform API keys are unset)."
            : "."}
        </p>
      ) : (
        <ul className="grid w-full max-w-full grid-cols-1 gap-3">
          {products.map((product) => {
            const suggested = defaultSellPrice(product.priceUsdt);
            const showCustom = customPriceFor === product.externalProductId;
            return (
              <li
                key={product.externalProductId}
                className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-zinc-100"
              >
                <div className="flex min-w-0 gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-50 sm:h-24 sm:w-24">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-full w-full object-contain object-center p-1"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-zinc-400">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 break-words font-medium text-zinc-950">
                      {product.name}
                    </p>
                    <p className="break-all text-xs text-zinc-500">
                      ID {product.externalProductId}
                      {product.externalSku ? ` · SKU ${product.externalSku}` : ""}
                      {product.stockQuantity != null
                        ? ` · stock ${product.stockQuantity}`
                        : ""}
                      {product.variants?.length
                        ? ` · ${product.variants.length} variants`
                        : ""}
                    </p>
                    <p className="text-sm text-zinc-700">
                      Supplier cost{" "}
                      {formatMoney(product.priceUsdt, MARKETPLACE_CURRENCY)}
                      {" · "}
                      One-click lists at{" "}
                      {formatMoney(suggested, MARKETPLACE_CURRENCY)}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2 border-t border-zinc-100 p-3">
                  <div className="grid w-full max-w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPreviewId(product.externalProductId)}
                      className="min-h-11 w-full max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:min-h-0 sm:w-auto"
                    >
                      Preview
                    </button>
                    <form action={formAction} className="min-w-0 w-full sm:w-auto">
                      <input type="hidden" name="provider_kind" value={providerKind} />
                      <input
                        type="hidden"
                        name="external_product_id"
                        value={product.externalProductId}
                      />
                      <input type="hidden" name="region_code" value="GLOBAL" />
                      <input type="hidden" name="one_click" value="1" />
                      <button
                        type="submit"
                        disabled={pendingImport || atLimit}
                        className="min-h-11 w-full max-w-full rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:min-h-0"
                      >
                        {pendingImport ? "Importing…" : "Import to Store"}
                      </button>
                    </form>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setCustomPriceFor(
                        showCustom ? null : product.externalProductId,
                      )
                    }
                    className="text-left text-xs font-medium text-zinc-600 underline"
                  >
                    {showCustom ? "Hide custom price" : "Set custom price"}
                  </button>

                  {showCustom ? (
                    <form
                      action={formAction}
                      className="flex w-full max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                    >
                      <input
                        type="hidden"
                        name="provider_kind"
                        value={providerKind}
                      />
                      <input
                        type="hidden"
                        name="external_product_id"
                        value={product.externalProductId}
                      />
                      <input type="hidden" name="region_code" value="GLOBAL" />
                      <label className="min-w-0 flex-1 text-xs text-zinc-600">
                        Sell price (USDT)
                        <input
                          name="price"
                          type="number"
                          min={product.priceUsdt}
                          step="0.01"
                          defaultValue={suggested}
                          className="mt-1 block w-full max-w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm sm:max-w-[8rem]"
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pendingImport || atLimit}
                        className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 sm:min-h-0 sm:w-auto"
                      >
                        {pendingImport ? "Importing…" : "Import"}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewId ? (
        <SupplierProductPreviewModal
          open
          onClose={() => setPreviewId(null)}
          providerKind={providerKind}
          externalProductId={previewId}
          regionCode="GLOBAL"
          quota={previewQuota}
          seedProduct={previewProduct}
          onImported={({ productId, success }) => {
            setPreviewId(null);
            setPreviewSuccess(
              success ??
                `Imported via Preview into your store (product ${productId.slice(0, 8)}…). CJ imports count toward the ${minActive}-item CJ fee floor; manual/custom products do not.`,
            );
          }}
        />
      ) : null}
    </section>
  );
}
