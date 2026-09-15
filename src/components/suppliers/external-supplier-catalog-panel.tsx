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

const initialState: ExternalImportState = null;

export type ImportQuotaHints = {
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
  providerKind: "cj_dropshipping" | "dsers";
  providerLabel: string;
  importDisabled?: boolean;
  quota?: ImportQuotaHints | null;
};

function defaultSellPrice(supplierCost: number) {
  return Number((supplierCost * ONE_CLICK_IMPORT_MARKUP).toFixed(2));
}

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
  const [pendingSearch, startSearch] = useTransition();
  const [state, formAction, pendingImport] = useActionState(
    importExternalSupplierProductAction,
    initialState,
  );

  const atLimit = importDisabled || quota?.atImportLimit === true;
  const minActive = quota?.minActiveItems ?? 10;
  const maxImports = quota?.maxImportItems ?? 100;
  const belowMin = quota ? !quota.meetsMinimum : false;

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
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{providerLabel}</h2>
        <p className="text-sm text-zinc-600">
          Search the {providerLabel} catalog and use{" "}
          <strong>Import to Store</strong> for one-click listing (default{" "}
          {Math.round((ONE_CLICK_IMPORT_MARKUP - 1) * 100)}% markup). Imports
          respect your max catalog cap ({maxImports}) and the {minActive}-item
          monthly fee floor.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          className="w-full min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm sm:py-2"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pendingSearch}
          className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 sm:min-h-0 sm:w-auto"
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
      {atLimit ? (
        <p className="text-sm text-amber-800">
          Import limit reached ({quota?.catalogItemCount ?? "—"}/{maxImports}).
          Archive unused listings or upgrade your plan before importing more.
        </p>
      ) : null}
      {belowMin && !atLimit ? (
        <p className="text-sm text-amber-800">
          You have {quota?.activeItemCount} active item
          {(quota?.activeItemCount ?? 0) === 1 ? "" : "s"}. Dropshippers are
          billed for at least {minActive} active items (
          {minActive * (quota?.itemFeeUsdt ?? 1)} USDT/mo). Keep one-click
          importing to reach the fee floor.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Run a search to load {providerLabel} products
          {process.env.NODE_ENV === "development"
            ? " (mock catalog when credentials are unset)."
            : "."}
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => {
            const suggested = defaultSellPrice(product.priceUsdt);
            const showCustom = customPriceFor === product.externalProductId;
            return (
              <li
                key={product.externalProductId}
                className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-3 sm:flex-row sm:items-end sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">{product.name}</p>
                  <p className="text-xs text-zinc-500">
                    ID {product.externalProductId}
                    {product.externalSku ? ` · SKU ${product.externalSku}` : ""}
                    {product.stockQuantity != null
                      ? ` · stock ${product.stockQuantity}`
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

                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <form
                    action={formAction}
                    className="flex flex-wrap items-end gap-2"
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
                    <input type="hidden" name="one_click" value="1" />
                    <input type="hidden" name="price" value={String(suggested)} />
                    <button
                      type="submit"
                      disabled={pendingImport || atLimit}
                      className="min-h-11 w-full rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:min-h-0 sm:w-auto"
                    >
                      {pendingImport
                        ? "Importing…"
                        : belowMin
                          ? `Import to Store (${(quota?.activeItemCount ?? 0) + 1}/${minActive})`
                          : quota
                            ? `Import to Store (${(quota.catalogItemCount ?? 0) + 1}/${maxImports})`
                            : "Import to Store"}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() =>
                      setCustomPriceFor(
                        showCustom ? null : product.externalProductId,
                      )
                    }
                    className="text-left text-xs font-medium text-zinc-600 underline sm:text-right"
                  >
                    {showCustom ? "Hide custom price" : "Set custom price"}
                  </button>

                  {showCustom ? (
                    <form
                      action={formAction}
                      className="flex flex-wrap items-end gap-2"
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
                      <label className="text-xs text-zinc-600">
                        Sell price (USDT)
                        <input
                          name="price"
                          type="number"
                          min={product.priceUsdt}
                          step="0.01"
                          defaultValue={suggested}
                          className="mt-1 block w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pendingImport || atLimit}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
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
    </section>
  );
}
