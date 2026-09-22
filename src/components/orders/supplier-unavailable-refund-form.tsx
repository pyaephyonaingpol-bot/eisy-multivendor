"use client";

import { useActionState } from "react";
import {
  refundSupplierUnavailableOrder,
  type FulfillmentActionState,
} from "@/lib/orders/actions";
import { isSupplierUnavailableStatus } from "@/lib/orders/status";
import type { OrderStatus, PaymentStatus } from "@/lib/types/database";

const initialState: FulfillmentActionState = null;

type Props = {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentError?: string | null;
};

/**
 * Cancel / refund path when CJ (or another supplier) is out of stock at
 * fulfillment time.
 */
export function SupplierUnavailableRefundForm({
  orderId,
  status,
  paymentStatus,
  fulfillmentError,
}: Props) {
  const [state, action, pending] = useActionState(
    refundSupplierUnavailableOrder,
    initialState,
  );

  if (!isSupplierUnavailableStatus(status)) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-rose-950">
          Supplier cannot fulfill
        </p>
        <p className="text-sm text-rose-900/80">
          {fulfillmentError ||
            "Live stock check failed or the supplier rejected the order."}{" "}
          Refund the buyer’s escrow to close this order.
        </p>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="order_id" value={orderId} />
        <label className="min-w-[12rem] flex-1 space-y-1 text-xs text-rose-900">
          Note (optional)
          <input
            name="note"
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-zinc-950"
            placeholder="Refund reason for audit trail"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-rose-900 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-60"
        >
          {pending
            ? "Refunding…"
            : paymentStatus === "paid"
              ? "Cancel & refund buyer"
              : "Cancel order"}
        </button>
      </form>
      {state?.error ? (
        <p className="text-sm text-rose-800" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
