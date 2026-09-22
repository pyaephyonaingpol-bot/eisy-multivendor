import type { OrderStatus } from "@/lib/types/database";
import {
  ORDER_STATUS_STEPS,
  isSupplierUnavailableStatus,
  isTerminalOrderStatus,
  orderStatusLabel,
  orderStatusStepIndex,
} from "@/lib/orders/status";

type OrderStatusTimelineProps = {
  status: OrderStatus;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  syncError?: string | null;
};

export function OrderStatusTimeline({
  status,
  shippedAt,
  deliveredAt,
  syncError = null,
}: OrderStatusTimelineProps) {
  if (isSupplierUnavailableStatus(status)) {
    const shippingUnavailable =
      syncError &&
      /does not ship|shipping unavailable|no available shipping/i.test(
        syncError,
      );
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
        <p className="font-medium">
          {orderStatusLabel(status, syncError)}
        </p>
        <p className="mt-1 text-rose-900/80">
          {shippingUnavailable
            ? "CJ Dropshipping does not ship to this buyer’s region. Cancel and refund escrow, or handle the order manually."
            : `The supplier could not fulfill this order${
                status === "out_of_stock" ? " because stock ran out" : ""
              }. An admin or vendor can cancel and refund escrow from the orders dashboard.`}
        </p>
        {syncError ? (
          <p className="mt-2 text-xs text-rose-900/70">{syncError}</p>
        ) : null}
      </div>
    );
  }

  if (isTerminalOrderStatus(status)) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Order {orderStatusLabel(status).toLowerCase()}. Tracking updates stop
        once an order is {orderStatusLabel(status).toLowerCase()}.
      </div>
    );
  }

  const activeIndex = orderStatusStepIndex(status);

  return (
    <ol className="grid gap-3 sm:grid-cols-5">
      {ORDER_STATUS_STEPS.map((step, index) => {
        const complete = activeIndex >= index;
        const stamp =
          step === "shipped" && shippedAt
            ? new Date(shippedAt).toLocaleString()
            : step === "delivered" && deliveredAt
              ? new Date(deliveredAt).toLocaleString()
              : null;

        return (
          <li
            key={step}
            className={`rounded-xl border px-3 py-3 text-sm ${
              complete
                ? "border-zinc-900 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-500"
            }`}
          >
            <p className="text-[11px] uppercase tracking-wide opacity-70">
              Step {index + 1}
            </p>
            <p className="font-medium">{orderStatusLabel(step)}</p>
            {stamp ? (
              <p className="mt-1 text-[11px] opacity-80">{stamp}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
