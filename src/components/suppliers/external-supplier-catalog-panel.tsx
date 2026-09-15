"use client";

import { useActionState, useState, useTransition } from "react";
import {
  importExternalSupplierProductAction,
  type ExternalImportState,
} from "@/lib/suppliers/actions";
import type { ExternalCatalogProduct } from "@/lib/suppliers/types";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";

const initialState: ExternalImportState = null;

type Props = {
  providerKind: "cj_dropshipping" | "dsers";
  providerLabel: string;
};

export function ExternalSupplierCatalogPanel({
  providerKind,
  providerLabel,
}: Props) {
  const [query, setQuery] = useState("wireless earbuds");
  const [products, setProducts] = useState<ExternalCatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingSearch, startSearch] = useTransition();
  const [state, formAction, pendingImport] = useActionState(
    importExternalSupplierProductAction,
    initialState,
  );

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
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{providerLabel}</h2>
        <p className="text-sm text-zinc-600">
          Search the {providerLabel} catalog, set your sell price, and import.
          Paid orders auto-queue for supplier fulfillment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          className="min-w-[16rem] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pendingSearch}
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
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

      {products.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Run a search to load {providerLabel} products
          {process.env.NODE_ENV === "development"
            ? " (mock catalog when credentials are unset)."
            : "."}
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
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
                </p>
              </div>
              <form action={formAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="provider_kind" value={providerKind} />
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
                    defaultValue={Number((product.priceUsdt * 1.35).toFixed(2))}
                    className="mt-1 block w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={pendingImport}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
                >
                  {pendingImport ? "Importing…" : "Import"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
