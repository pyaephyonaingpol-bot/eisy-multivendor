"use client";

import { useActionState } from "react";
import {
  openOrderDispute,
  type DisputeActionState,
} from "@/lib/disputes/actions";
import { DISPUTE_REASON_LABELS } from "@/lib/disputes/queries";
import type {
  Dispute,
  DisputeReason,
  OrderPayoutStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types/database";

const initialState: DisputeActionState = null;

const OPENABLE: OrderStatus[] = ["paid", "processing", "shipped"];

export function OpenDisputeForm({
  orderId,
  status,
  paymentStatus,
  payoutStatus,
  existingDispute,
}: {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payoutStatus: OrderPayoutStatus;
  existingDispute: Dispute | null;
}) {
  const [state, action, pending] = useActionState(openOrderDispute, initialState);

  if (existingDispute) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Dispute open — escrow release paused</p>
        <p className="mt-1 text-amber-900/80">
          Reason:{" "}
          {DISPUTE_REASON_LABELS[existingDispute.reason as DisputeReason] ??
            existingDispute.reason}
          . Status: {existingDispute.status.replace(/_/g, " ")}. An admin will
          refund you or release funds to the seller.
        </p>
      </div>
    );
  }

  const canOpen =
    paymentStatus === "paid" &&
    payoutStatus === "held" &&
    OPENABLE.includes(status);

  if (!canOpen) {
    return null;
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm font-medium text-zinc-950">Open a dispute</p>
      <p className="text-sm text-zinc-600">
        Report a problem (not received, damaged, etc.). This pauses escrow
        release until an admin resolves the case.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-700">Reason</span>
        <select
          name="reason"
          required
          defaultValue="not_received"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2"
        >
          {(Object.keys(DISPUTE_REASON_LABELS) as DisputeReason[]).map(
            (reason) => (
              <option key={reason} value={reason}>
                {DISPUTE_REASON_LABELS[reason]}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-700">Details (optional)</span>
        <textarea
          name="description"
          rows={3}
          placeholder="Describe what went wrong…"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2"
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit dispute"}
      </button>
    </form>
  );
}
