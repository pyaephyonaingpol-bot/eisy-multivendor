"use client";

import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updateVendorShippingRegions,
  type VendorActionState,
} from "@/lib/vendors/actions";
import type { SourcingRegion, Vendor } from "@/lib/types/database";

const initialState: VendorActionState = null;

type ShippingRegionsFormProps = {
  vendor: Vendor;
  regions: SourcingRegion[];
};

function ShippingRegionsFormFields({ vendor, regions }: ShippingRegionsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateVendorShippingRegions,
    initialState,
  );
  const selected = new Set(vendor.ships_to_region_ids ?? []);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <p className="text-sm text-zinc-600">
        Choose the regions your store can ship to. Leave all unchecked to ship
        worldwide. Buyers outside your selection will not see your products.
      </p>

      {regions.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No sourcing regions are available yet. Ask an admin to seed regions,
          or leave this blank for worldwide shipping.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">
            Ships to regions
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {regions.map((region) => (
              <label
                key={region.id}
                className="flex items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:border-zinc-300"
              >
                <input
                  type="checkbox"
                  name="ships_to_region_ids"
                  value={region.id}
                  defaultChecked={selected.has(region.id)}
                  className="mt-0.5 rounded border-zinc-300"
                />
                <span>
                  <span className="font-medium text-zinc-900">{region.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {region.code}
                    {region.country_codes?.length
                      ? ` · ${region.country_codes.join(", ")}`
                      : region.code === "GLOBAL"
                        ? " · Rest of world"
                        : null}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state?.error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || regions.length === 0}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save shipping regions"}
      </button>
    </form>
  );
}

export function ShippingRegionsForm({ vendor, regions }: ShippingRegionsFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton />}>
      <ShippingRegionsFormFields vendor={vendor} regions={regions} />
    </ClientOnly>
  );
}
