"use client";

import { useActionState } from "react";
import {
  deleteProductSupplierRouteAction,
  ensureRecommendedSupplierRoutesAction,
  upsertProductSupplierRouteAction,
  type SupplierRouteFormState,
} from "@/lib/sourcing/actions";
import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import { isSourcingRegionUuid } from "@/lib/sourcing/constants";
import type {
  ProductSupplierRoute,
  SourcingRegion,
  SupplierProvider,
} from "@/lib/types/database";

const initialState: SupplierRouteFormState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950";

type RouteRow = ProductSupplierRoute & {
  region: Pick<SourcingRegion, "id" | "code" | "name"> | null;
  provider: Pick<SupplierProvider, "id" | "slug" | "name" | "kind"> | null;
};

type SupplierRoutesManagerProps = {
  productId: string;
  productName: string;
  routes: RouteRow[];
  regions: SourcingRegion[];
  providers: SupplierProvider[];
  isDropshipListing?: boolean;
};

export function SupplierRoutesManager({
  productId,
  productName,
  routes,
  regions,
  providers,
  isDropshipListing = false,
}: SupplierRoutesManagerProps) {
  // Only persisted uuids can be written to product_supplier_routes.region_id.
  const selectableRegions = regions.filter((region) =>
    isSourcingRegionUuid(region.id),
  );
  const [upsertState, upsertAction, upsertPending] = useActionState(
    upsertProductSupplierRouteAction,
    initialState,
  );
  const [seedState, seedAction, seedPending] = useActionState(
    ensureRecommendedSupplierRoutesAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProductSupplierRouteAction,
    initialState,
  );

  if (isDropshipListing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This is a dropship listing. Regional supplier routes are configured on the
        source catalog product and applied automatically at checkout for every
        importer.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Regional supplier routes
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600">
            Match buyer regions to CJ Dropshipping, DSers, Print-on-Demand, or
            internal fulfillment for <strong>{productName}</strong>. Lower priority
            wins when multiple providers cover the same region.
          </p>
        </div>
        <form action={seedAction}>
          <input type="hidden" name="product_id" value={productId} />
          <button
            type="submit"
            disabled={seedPending}
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {seedPending ? "Applying…" : "Apply recommended routes"}
          </button>
        </form>
      </div>

      {seedState?.error || upsertState?.error || deleteState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {seedState?.error ?? upsertState?.error ?? deleteState?.error}
        </p>
      ) : null}
      {seedState?.success || upsertState?.success || deleteState?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {seedState?.success ?? upsertState?.success ?? deleteState?.success}
        </p>
      ) : null}

      {routes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-600">
          No regional routes yet. Apply recommended CJ / DSers / POD / internal
          mappings, or add a custom route below.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {routes.map((route) => (
            <li
              key={route.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="space-y-1">
                <p className="font-medium text-zinc-950">
                  {route.region?.name ?? "Region"} →{" "}
                  {route.provider?.name ?? "Provider"}
                </p>
                <p className="text-zinc-500">
                  Warehouse {route.warehouse_country}
                  {route.shipping_days_min != null || route.shipping_days_max != null
                    ? ` · ${route.shipping_days_min ?? "?"}–${route.shipping_days_max ?? "?"} days`
                    : ""}
                  {" · "}
                  {formatMoney(Number(route.shipping_cost_usdt), MARKETPLACE_CURRENCY)}{" "}
                  shipping · priority {route.priority}
                  {!route.is_active ? " · inactive" : ""}
                </p>
                {route.external_sku ? (
                  <p className="text-xs text-zinc-400">SKU {route.external_sku}</p>
                ) : null}
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="route_id" value={route.id} />
                <input type="hidden" name="product_id" value={productId} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={upsertAction}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5"
      >
        <h3 className="text-sm font-semibold text-zinc-950">Add / update route</h3>
        <input type="hidden" name="product_id" value={productId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="region_id" className="text-sm font-medium text-zinc-700">
              Buyer region
            </label>
            <select
              id="region_id"
              name="region_id"
              required
              className={fieldClassName}
              defaultValue={selectableRegions[0]?.id}
              disabled={selectableRegions.length === 0}
            >
              {selectableRegions.length === 0 ? (
                <option value="">No saved regions available</option>
              ) : null}
              {selectableRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name} ({region.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="provider_id" className="text-sm font-medium text-zinc-700">
              Supplier provider
            </label>
            <select
              id="provider_id"
              name="provider_id"
              required
              className={fieldClassName}
              defaultValue={providers[0]?.id}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="warehouse_country"
              className="text-sm font-medium text-zinc-700"
            >
              Warehouse country
            </label>
            <input
              id="warehouse_country"
              name="warehouse_country"
              defaultValue="CN"
              maxLength={2}
              required
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="external_sku" className="text-sm font-medium text-zinc-700">
              External SKU
            </label>
            <input
              id="external_sku"
              name="external_sku"
              placeholder="Optional CJ / DSers / POD SKU"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="shipping_cost_usdt"
              className="text-sm font-medium text-zinc-700"
            >
              Shipping cost (USDT)
            </label>
            <input
              id="shipping_cost_usdt"
              name="shipping_cost_usdt"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="priority" className="text-sm font-medium text-zinc-700">
              Priority (lower = preferred)
            </label>
            <input
              id="priority"
              name="priority"
              type="number"
              defaultValue="50"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="shipping_days_min"
              className="text-sm font-medium text-zinc-700"
            >
              Min days
            </label>
            <input
              id="shipping_days_min"
              name="shipping_days_min"
              type="number"
              min="0"
              defaultValue="5"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="shipping_days_max"
              className="text-sm font-medium text-zinc-700"
            >
              Max days
            </label>
            <input
              id="shipping_days_max"
              name="shipping_days_max"
              type="number"
              min="0"
              defaultValue="14"
              className={fieldClassName}
            />
          </div>
        </div>
        <input type="hidden" name="is_active" value="true" />
        <button
          type="submit"
          disabled={upsertPending || regions.length === 0 || providers.length === 0}
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {upsertPending ? "Saving…" : "Save route"}
        </button>
      </form>
    </div>
  );
}
