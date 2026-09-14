"use client";

import { useActionState } from "react";
import {
  updateOrderFulfillment,
  type FulfillmentActionState,
} from "@/lib/orders/actions";
import type { OrderStatus } from "@/lib/types/database";

const initialState: FulfillmentActionState = null;

type VendorFulfillmentFormProps = {
  orderId: string;
  currentStatus: OrderStatus;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingUrl?: string | null;
  supplierOrderRef?: string | null;
};

export function VendorFulfillmentForm({
  orderId,
  currentStatus,
  trackingNumber,
  trackingCarrier,
  trackingUrl,
  supplierOrderRef,
}: VendorFulfillmentFormProps) {
  const [state, action, pending] = useActionState(
    updateOrderFulfillment,
    initialState,
  );

  return (
    <form action={action} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm font-medium text-zinc-950">Update fulfillment</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-zinc-600">
          Status
          <select
            name="status"
            defaultValue={currentStatus}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          >
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-600">
          Carrier
          <input
            name="tracking_carrier"
            defaultValue={trackingCarrier ?? ""}
            placeholder="DHL / Myanmar Post / CJ"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-600 sm:col-span-2">
          Tracking number
          <input
            name="tracking_number"
            defaultValue={trackingNumber ?? ""}
            placeholder="Tracking number"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-600 sm:col-span-2">
          Tracking URL
          <input
            name="tracking_url"
            defaultValue={trackingUrl ?? ""}
            placeholder="https://"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-600 sm:col-span-2">
          Supplier order ref
          <input
            name="supplier_order_ref"
            defaultValue={supplierOrderRef ?? ""}
            placeholder="External supplier order id"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-600 sm:col-span-2">
          Note
          <input
            name="note"
            placeholder="Optional note for the audit trail"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950"
          />
        </label>
      </div>
      {state?.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save fulfillment"}
      </button>
    </form>
  );
}
