import Link from "next/link";
import { listOrdersForAdmin } from "@/lib/orders/queries";
import {
  orderStatusLabel,
  paymentStatusLabel,
  payoutStatusBadgeClass,
  payoutStatusLabel,
} from "@/lib/orders/status";
import { formatMoney } from "@/lib/money";
import type { OrderPayoutStatus } from "@/lib/types/database";
import { formatDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ payout?: string }>;
};

export default async function AdminTransactionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const payoutFilter =
    params.payout === "held" ||
    params.payout === "disputed" ||
    params.payout === "released" ||
    params.payout === "refunded"
      ? (params.payout as OrderPayoutStatus)
      : undefined;

  const orders = await listOrdersForAdmin({
    payoutStatus: payoutFilter,
    limit: 100,
  });

  const filters = [
    { href: "/admin/transactions", label: "All" },
    { href: "/admin/transactions?payout=held", label: "Escrow held" },
    { href: "/admin/transactions?payout=disputed", label: "Disputed" },
    { href: "/admin/transactions?payout=released", label: "Released" },
    { href: "/admin/transactions?payout=refunded", label: "Refunded" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform transactions
        </h1>
        <p className="text-zinc-600">
          Monitor paid orders, escrow holds, disputes, and payouts across the
          marketplace.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
          No transactions in this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Seller</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Fulfillment</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Escrow</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <tr key={order.id} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/orders/${order.id}`}
                      className="underline underline-offset-2"
                    >
                      {order.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {order.seller?.store_name ||
                          order.seller?.name ||
                          order.fulfillment?.store_name ||
                          order.fulfillment?.name ||
                          "—"}
                      </p>
                      {(order.seller || order.fulfillment) && (
                        <Link
                          href={`/admin/orders?vendor=${order.seller?.id ?? order.fulfillment?.id}`}
                          className="text-xs underline"
                        >
                          Filter orders
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(Number(order.total), order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    {orderStatusLabel(order.status)}
                  </td>
                  <td className="px-4 py-3">
                    {paymentStatusLabel(order.payment_status)}
                  </td>
                  <td className="px-4 py-3">
                    {order.payout_status ? (
                      <>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${payoutStatusBadgeClass(order.payout_status)}`}
                        >
                          {payoutStatusLabel(order.payout_status)}
                        </span>
                        {order.payout_status === "disputed" ? (
                          <Link
                            href="/admin/disputes?status=open"
                            className="mt-1 block text-xs underline"
                          >
                            Open disputes
                          </Link>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDateTime(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
