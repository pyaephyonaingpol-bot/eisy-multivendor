"use client";

import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updateVendorProfile,
  type VendorActionState,
} from "@/lib/vendors/actions";
import type { Vendor } from "@/lib/types/database";

const initialState: VendorActionState = null;

function VendorProfileFormFields({ vendor }: { vendor: Vendor }) {
  const [state, formAction, pending] = useActionState(
    updateVendorProfile,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-zinc-950">
          Store details
        </legend>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Store name</span>
          <input
            name="store_name"
            defaultValue={vendor.store_name || vendor.name}
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="Public store name"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Store description</span>
          <textarea
            name="description"
            rows={4}
            defaultValue={vendor.description ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="Tell buyers what you sell and where you ship from"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-200 pt-6">
        <legend className="text-base font-semibold text-zinc-950">
          Contact information
        </legend>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Contact email</span>
          <input
            type="email"
            name="contact_email"
            defaultValue={vendor.contact_email ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="ops@yourstore.com"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Phone</span>
          <input
            name="contact_phone"
            type="tel"
            defaultValue={vendor.contact_phone ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="+95…"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Telegram</span>
          <input
            name="telegram_handle"
            defaultValue={vendor.telegram_handle ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="@yourhandle"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-200 pt-6">
        <legend className="text-base font-semibold text-zinc-950">
          Business registration
        </legend>
        <p className="text-sm text-zinc-600">
          Optional company details used for verification and payouts. Individuals
          can leave these blank and complete personal KYC instead.
        </p>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Legal business name</span>
          <input
            name="business_legal_name"
            defaultValue={vendor.business_legal_name ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="Registered company name"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Registration / tax number
          </span>
          <input
            name="business_registration_number"
            defaultValue={vendor.business_registration_number ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="DICA / tax ID / license number"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Business address</span>
          <textarea
            name="business_address"
            rows={3}
            defaultValue={vendor.business_address ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="Street, city, township"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Country</span>
          <input
            name="business_country"
            defaultValue={vendor.business_country ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="MM / Myanmar"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-200 pt-6">
        <legend className="text-base font-semibold text-zinc-950">
          USDT TRC-20 payout wallet
        </legend>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Payout address</span>
          <input
            name="usdt_payout_address"
            defaultValue={
              vendor.usdt_payout_address || vendor.usdt_deposit_address || ""
            }
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
            placeholder="T…"
          />
          <p className="text-xs text-zinc-500">
            Must be a TRON TRC-20 address starting with T. Admins use this for
            order payouts and withdrawal approvals.
          </p>
        </label>
      </fieldset>

      {state?.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save vendor profile"}
      </button>
    </form>
  );
}

export function VendorProfileForm({ vendor }: { vendor: Vendor }) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={8} />}>
      <VendorProfileFormFields vendor={vendor} />
    </ClientOnly>
  );
}
