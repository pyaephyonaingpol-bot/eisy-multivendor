"use client";

import { useActionState } from "react";
import {
  confirmOrderDeliveredByBuyer,
  type ConfirmDeliveryActionState,
} from "@/lib/orders/actions";
import type { OrderPayoutStatus, OrderStatus, PaymentStatus } from "@/lib/types/database";

const initialState: ConfirmDeliveryActionState = null;

const CONFIRMABLE: OrderStatus[] = ["paid", "processing", "shipped"];

export function ConfirmDeliveryForm({
  orderId,
  status,
  paymentStatus,
  payoutStatus,
}: {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payoutStatus: OrderPayoutStatus;
}) {
  const [state, action, pending] = useActionState(
    confirmOrderDeliveredByBuyer,
    initialState,
  );

  const canConfirm =
    paymentStatus === "paid" &&
    (CONFIRMABLE.includes(status) ||
      (status === "delivered" && payoutStatus === "held"));

  if (!canConfirm && !state?.success) {
    if (status === "delivered" && payoutStatus === "released") {
      return (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Delivered — seller payouts have been released from escrow.
        </p>
      );
    }
    return null;
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm font-medium text-zinc-950">Confirm delivery</p>
      <p className="text-sm text-zinc-600">
        Once you confirm receipt, the order is marked delivered and seller
        earnings (after the 3% platform fee) leave escrow for withdrawal.
      </p>
      {state?.error ? (
        <p className="text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.success}</p>
      ) : null}
      {canConfirm ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Confirming…" : "I received this order"}
        </button>
      ) : null}
    </form>
  );
}
