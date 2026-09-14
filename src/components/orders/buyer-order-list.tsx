import Link from "next/link";
import { formatMoney } from "@/lib/money";
import {
  orderStatusBadgeClass,
  orderStatusLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
} from "@/lib/orders/status";
import type { BuyerOrderRow } from "@/lib/orders/queries";

export function BuyerOrderList({ orders }: { orders: BuyerOrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
        <p className="text-sm font-medium text-zinc-950">No orders yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          When you checkout with USDT, your order history will appear here.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Browse shop
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {orders.map((order) => {
        const itemCount = order.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        return (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex flex-col gap-3 px-4 py-4 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-950">
                    Order {order.id.slice(0, 8)}…
                  </p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${orderStatusBadgeClass(order.status)}`}
                  >
                    {orderStatusLabel(order.status)}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${paymentStatusBadgeClass(order.payment_status)}`}
                  >
                    {paymentStatusLabel(order.payment_status)}
                  </span>
                </div>
                <p className="text-sm text-zinc-500">
                  {new Date(order.created_at).toLocaleString()} · {itemCount}{" "}
                  item{itemCount === 1 ? "" : "s"}
                  {order.seller?.name ? ` · ${order.seller.name}` : ""}
                </p>
                {order.tracking_number ? (
                  <p className="text-sm text-zinc-600">
                    Tracking:{" "}
                    {order.tracking_carrier
                      ? `${order.tracking_carrier} · `
                      : ""}
                    <span className="font-mono">{order.tracking_number}</span>
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Tracking number will appear when the order ships.
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold text-zinc-950 sm:text-right">
                {formatMoney(Number(order.total), order.currency)}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
