import type { OrderStatus } from "@/lib/types/database";
import {
  ORDER_STATUS_STEPS,
  isTerminalOrderStatus,
  orderStatusLabel,
  orderStatusStepIndex,
} from "@/lib/orders/status";

type OrderStatusTimelineProps = {
  status: OrderStatus;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

export function OrderStatusTimeline({
  status,
  shippedAt,
  deliveredAt,
}: OrderStatusTimelineProps) {
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
