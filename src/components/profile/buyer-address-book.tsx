"use client";

import { useActionState, useState } from "react";
import { BuyerCountrySelect } from "@/components/storefront/buyer-country-select";
import {
  deleteBuyerAddress,
  saveBuyerAddress,
  setDefaultBuyerAddress,
  type AddressActionState,
} from "@/lib/addresses/actions";
import { countryLabelForCode } from "@/lib/sourcing/countries";
import type { BuyerAddress } from "@/lib/types/database";

const initialState: AddressActionState = null;

const fieldClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950";

type BuyerAddressBookProps = {
  addresses: BuyerAddress[];
  defaultCountry?: string;
};

export function BuyerAddressBook({
  addresses,
  defaultCountry = "MM",
}: BuyerAddressBookProps) {
  const [saveState, saveAction, savePending] = useActionState(
    saveBuyerAddress,
    initialState,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDefaultBuyerAddress,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteBuyerAddress,
    initialState,
  );
  const [country, setCountry] = useState(defaultCountry);
  const [showForm, setShowForm] = useState(addresses.length === 0);

  const status = saveState ?? defaultState ?? deleteState;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Delivery addresses
          </h2>
          <p className="text-sm text-zinc-600">
            Save addresses and mark one as default so checkout pre-fills
            automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          {showForm ? "Hide form" : "Add address"}
        </button>
      </div>

      {status?.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {status.error}
        </p>
      ) : null}
      {status?.success ? (
        <p className="text-sm text-emerald-700">{status.success}</p>
      ) : null}

      {addresses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
          No saved delivery addresses yet. Add one and toggle{" "}
          <strong>Set as default</strong> for faster checkout.
        </p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-zinc-950">
                      {address.label || address.full_name}
                    </p>
                    {address.is_default ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-inset ring-emerald-200">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="text-zinc-700">{address.full_name}</p>
                  <p className="text-zinc-600">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                  </p>
                  <p className="text-zinc-600">
                    {address.city}
                    {address.region ? `, ${address.region}` : ""}
                    {address.postal_code ? ` ${address.postal_code}` : ""}
                  </p>
                  <p className="text-zinc-600">
                    {countryLabelForCode(address.country_code)} (
                    {address.country_code})
                    {address.phone ? ` · ${address.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!address.is_default ? (
                    <form action={defaultAction}>
                      <input type="hidden" name="address_id" value={address.id} />
                      <button
                        type="submit"
                        disabled={defaultPending}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-950 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        Set as default
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteAction}>
                    <input type="hidden" name="address_id" value={address.id} />
                    <button
                      type="submit"
                      disabled={deletePending}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form
          action={saveAction}
          className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-zinc-950">
            Add delivery address
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Label (optional)</span>
              <input
                name="label"
                placeholder="Home, Office…"
                className={fieldClassName}
              />
            </label>
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Full name</span>
              <input name="full_name" required className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Phone</span>
              <input name="phone" type="tel" className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Country</span>
              <BuyerCountrySelect
                name="country_code"
                value={country}
                onChange={setCountry}
                required
                className={fieldClassName}
              />
            </label>
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Address line 1</span>
              <input name="line1" required className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Address line 2</span>
              <input name="line2" className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">City</span>
              <input name="city" required className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">State / region</span>
              <input name="region" className={fieldClassName} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Postal code</span>
              <input name="postal_code" className={fieldClassName} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="is_default"
                value="1"
                defaultChecked={addresses.length === 0}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="font-medium text-zinc-800">
                Set as default delivery address
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={savePending}
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {savePending ? "Saving…" : "Save address"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
