"use client";

import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  updateVendorContactProfile,
  type VendorActionState,
} from "@/lib/vendors/actions";
import type { Vendor } from "@/lib/types/database";

const initialState: VendorActionState = null;

function VendorContactFormFields({ vendor }: { vendor: Vendor }) {
  const [state, formAction, pending] = useActionState(
    updateVendorContactProfile,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Store name</span>
        <input
          name="store_name"
          defaultValue={vendor.store_name || vendor.name}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          placeholder="Public store name"
        />
      </label>
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
        <span className="font-medium text-zinc-700">Telegram</span>
        <input
          name="telegram_handle"
          defaultValue={vendor.telegram_handle ?? ""}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          placeholder="@yourhandle"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">
          USDT TRC-20 payout wallet
        </span>
        <input
          name="usdt_payout_address"
          defaultValue={
            vendor.usdt_payout_address || vendor.usdt_deposit_address || ""
          }
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
          placeholder="T…"
        />
        <p className="text-xs text-zinc-500">
          Admins use this address when reviewing orders and approving
          withdrawals.
        </p>
      </label>

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
        className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save contact details"}
      </button>
    </form>
  );
}

export function VendorContactForm({ vendor }: { vendor: Vendor }) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={4} />}>
      <VendorContactFormFields vendor={vendor} />
    </ClientOnly>
  );
}
