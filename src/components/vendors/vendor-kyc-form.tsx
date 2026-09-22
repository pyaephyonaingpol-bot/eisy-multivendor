"use client";

import { useActionState } from "react";
import { ClientOnly } from "@/components/client-only";
import { FormSkeleton } from "@/components/form-skeleton";
import {
  submitVendorKyc,
  type VendorActionState,
} from "@/lib/vendors/actions";
import type { Vendor, VendorKycStatus } from "@/lib/types/database";

const initialState: VendorActionState = null;

const statusStyles: Record<VendorKycStatus, string> = {
  unsubmitted: "bg-zinc-100 text-zinc-700",
  pending: "bg-amber-50 text-amber-900",
  approved: "bg-emerald-50 text-emerald-900",
  rejected: "bg-red-50 text-red-800",
};

const statusLabels: Record<VendorKycStatus, string> = {
  unsubmitted: "Not submitted",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

type VendorKycFormProps = {
  vendor: Vendor;
};

function VendorKycFormFields({ vendor }: VendorKycFormProps) {
  const [state, formAction, pending] = useActionState(submitVendorKyc, initialState);
  const status = vendor.kyc_status ?? "unsubmitted";
  const canSubmit = status === "unsubmitted" || status === "rejected";

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
        >
          {statusLabels[status]}
        </span>
        {vendor.kyc_submitted_at ? (
          <span className="text-xs text-zinc-500">
            Submitted {new Date(vendor.kyc_submitted_at).toLocaleString()}
          </span>
        ) : null}
      </div>

      {status === "approved" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your identity is verified. You can publish products and withdraw wallet
          funds.
        </p>
      ) : null}

      {status === "pending" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your documents are awaiting admin review. Publishing and withdrawals
          stay locked until approval.
        </p>
      ) : null}

      {status === "rejected" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          KYC was rejected
          {vendor.kyc_rejection_reason
            ? `: ${vendor.kyc_rejection_reason}`
            : "."}{" "}
          Please upload updated documents below.
        </p>
      ) : null}

      {canSubmit ? (
        <form action={formAction} className="space-y-5">
          <p className="text-sm text-zinc-600">
            Upload a clear photo or PDF of your passport, national ID, or trade
            license. Unverified sellers cannot publish products or withdraw
            funds.
          </p>

          <div className="space-y-2">
            <label htmlFor="legal_name" className="text-sm font-medium text-zinc-700">
              Legal name
            </label>
            <input
              id="legal_name"
              name="legal_name"
              required
              defaultValue={vendor.kyc_legal_name ?? ""}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Name as shown on the document"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="document_type"
              className="text-sm font-medium text-zinc-700"
            >
              Document type
            </label>
            <select
              id="document_type"
              name="document_type"
              required
              defaultValue={vendor.kyc_document_type ?? "national_id"}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="passport">Passport</option>
              <option value="national_id">National ID card</option>
              <option value="trade_license">Trade license</option>
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="document_number"
              className="text-sm font-medium text-zinc-700"
            >
              Document number (optional)
            </label>
            <input
              id="document_number"
              name="document_number"
              defaultValue={vendor.kyc_document_number ?? ""}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="usdt_payout_address"
              className="text-sm font-medium text-zinc-700"
            >
              USDT TRC-20 payout address
            </label>
            <input
              id="usdt_payout_address"
              name="usdt_payout_address"
              defaultValue={
                vendor.usdt_payout_address || vendor.usdt_deposit_address || ""
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
              placeholder="T…"
            />
            <p className="text-xs text-zinc-500">
              Required for withdrawals after KYC approval. You can also manage
              this on your vendor profile.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="document" className="text-sm font-medium text-zinc-700">
              Document file
            </label>
            <input
              id="document"
              name="document"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800"
            />
            <p className="text-xs text-zinc-500">JPEG, PNG, WebP, or PDF · max 5 MB</p>
          </div>

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
            disabled={pending}
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit KYC for review"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function VendorKycForm({ vendor }: VendorKycFormProps) {
  return (
    <ClientOnly fallback={<FormSkeleton />}>
      <VendorKycFormFields vendor={vendor} />
    </ClientOnly>
  );
}
