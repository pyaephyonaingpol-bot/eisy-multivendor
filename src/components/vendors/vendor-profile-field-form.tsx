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

type Field = "email" | "phone" | "address";

function ProfileFieldFormInner({
  vendor,
  field,
}: {
  vendor: Vendor;
  field: Field;
}) {
  const [state, formAction, pending] = useActionState(
    updateVendorProfile,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {/* Preserve other profile values so partial updates don't wipe them. */}
      <input type="hidden" name="store_name" value={vendor.store_name || vendor.name} />
      <input type="hidden" name="description" value={vendor.description ?? ""} />
      <input type="hidden" name="telegram_handle" value={vendor.telegram_handle ?? ""} />
      <input
        type="hidden"
        name="business_legal_name"
        value={vendor.business_legal_name ?? ""}
      />
      <input
        type="hidden"
        name="business_registration_number"
        value={vendor.business_registration_number ?? ""}
      />
      <input
        type="hidden"
        name="usdt_payout_address"
        value={vendor.usdt_payout_address ?? ""}
      />

      {field !== "email" ? (
        <input type="hidden" name="contact_email" value={vendor.contact_email ?? ""} />
      ) : null}
      {field !== "phone" ? (
        <input type="hidden" name="contact_phone" value={vendor.contact_phone ?? ""} />
      ) : null}
      {field !== "address" ? (
        <>
          <input
            type="hidden"
            name="business_address"
            value={vendor.business_address ?? ""}
          />
          <input
            type="hidden"
            name="business_country"
            value={vendor.business_country ?? ""}
          />
        </>
      ) : null}

      {field === "email" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Contact email</span>
          <input
            type="email"
            name="contact_email"
            defaultValue={vendor.contact_email ?? ""}
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="ops@yourstore.com"
          />
        </label>
      ) : null}

      {field === "phone" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">Phone</span>
          <input
            name="contact_phone"
            type="tel"
            defaultValue={vendor.contact_phone ?? ""}
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            placeholder="+95…"
          />
        </label>
      ) : null}

      {field === "address" ? (
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Business address</span>
            <textarea
              name="business_address"
              rows={3}
              defaultValue={vendor.business_address ?? ""}
              required
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
        </div>
      ) : null}

      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function VendorProfileFieldForm({
  vendor,
  field,
}: {
  vendor: Vendor;
  field: Field;
}) {
  return (
    <ClientOnly fallback={<FormSkeleton rows={field === "address" ? 3 : 2} />}>
      <ProfileFieldFormInner vendor={vendor} field={field} />
    </ClientOnly>
  );
}
