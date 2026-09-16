"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminOrderRow } from "@/lib/orders/queries";
import {
  orderStatusLabel,
  paymentStatusLabel,
  payoutStatusBadgeClass,
  payoutStatusLabel,
} from "@/lib/orders/status";
import { formatMoney } from "@/lib/money";

function VendorBlock({
  order,
  compact = false,
}: {
  order: AdminOrderRow;
  compact?: boolean;
}) {
  const vendor = order.seller ?? order.fulfillment;
  if (!vendor) {
    return <span className="text-zinc-400">—</span>;
  }

  const store = vendor.store_name || vendor.name;
  const email = vendor.contact_email || vendor.owner_email;
  const telegram = vendor.telegram_handle
    ? vendor.telegram_handle.startsWith("@")
      ? vendor.telegram_handle
      : `@${vendor.telegram_handle}`
    : null;
  const payout =
    vendor.usdt_payout_address || vendor.usdt_deposit_address || null;

  if (compact) {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-950">{store}</p>
        <p className="truncate text-xs text-zinc-500">{vendor.name}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Vendor (seller)
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Vendor name</dt>
          <dd className="font-medium text-zinc-950">{vendor.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Store name</dt>
          <dd className="font-medium text-zinc-950">{store}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Contact email</dt>
          <dd className="break-all text-zinc-800">
            {email ? (
              <a href={`mailto:${email}`} className="underline">
                {email}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Telegram</dt>
          <dd className="text-zinc-800">
            {telegram ? (
              <a
                href={`https://t.me/${telegram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {telegram}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-zinc-500">USDT TRC-20 payout wallet</dt>
          <dd className="break-all font-mono text-xs text-zinc-800">
            {payout ?? "—"}
          </dd>
        </div>
      </dl>
      <Link
        href={`/admin/orders?vendor=${vendor.id}`}
        className="inline-flex text-xs font-medium underline"
      >
        View all orders for this vendor
      </Link>
    </div>
  );
}

function OrderDetailModal({
  order,
  onClose,
}: {
  order: AdminOrderRow;
  onClose: () => void;
}) {
  const vendor = order.seller ?? order.fulfillment;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/50"
        aria-label="Close order details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[101] max-h-[min(92vh,720px)] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Order {order.id.slice(0, 8)}…
            </h2>
            <p className="text-sm text-zinc-500">
              {new Date(order.created_at).toLocaleString()} ·{" "}
              {formatMoney(Number(order.total), order.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <VendorBlock order={order} />

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Fulfillment</p>
              <p className="font-medium">{orderStatusLabel(order.status)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Payment</p>
              <p className="font-medium">
                {paymentStatusLabel(order.payment_status)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Escrow</p>
              <p className="font-medium">
                {payoutStatusLabel(order.payout_status)}
              </p>
            </div>
          </div>

          {order.open_dispute_count > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {order.open_dispute_count} open dispute
              {order.open_dispute_count === 1 ? "" : "s"} on this order.{" "}
              <Link href="/admin/disputes?status=open" className="underline">
                Review disputes
              </Link>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Line items</h3>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span>
                    {item.product_name} × {item.quantity}
                  </span>
                  <span className="font-medium">
                    {formatMoney(Number(item.total_price), order.currency)}
                  </span>
                </li>
              ))}
              {order.items.length === 0 ? (
                <li className="px-3 py-4 text-sm text-zinc-500">No items.</li>
              ) : null}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/orders/${order.id}`} className="underline">
              Open order page
            </Link>
            {vendor ? (
              <Link href={`/store/${vendor.slug}`} className="underline">
                Public store
              </Link>
            ) : null}
            {vendor ? (
              <Link
                href={`/admin/disputes?status=open`}
                className="underline"
              >
                Disputes queue
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminOrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId],
  );

  if (orders.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
        No orders match this vendor filter.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Payout wallet</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Escrow</th>
              <th className="px-4 py-3 font-medium">Disputes</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {orders.map((order) => {
              const vendor = order.seller ?? order.fulfillment;
              const email = vendor?.contact_email || vendor?.owner_email;
              const telegram = vendor?.telegram_handle
                ? vendor.telegram_handle.startsWith("@")
                  ? vendor.telegram_handle
                  : `@${vendor.telegram_handle}`
                : null;
              const payout =
                vendor?.usdt_payout_address ||
                vendor?.usdt_deposit_address ||
                null;

              return (
                <tr key={order.id} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs">
                    {order.id.slice(0, 8)}…
                    <p className="mt-1 font-sans text-[11px] text-zinc-400">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <VendorBlock order={order} compact />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    <p className="break-all">{email ?? "—"}</p>
                    <p>{telegram ?? "—"}</p>
                  </td>
                  <td className="max-w-[10rem] px-4 py-3 font-mono text-[11px] text-zinc-600">
                    <span className="line-clamp-2 break-all">
                      {payout ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatMoney(Number(order.total), order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <p>{orderStatusLabel(order.status)}</p>
                    <p className="text-xs text-zinc-500">
                      {paymentStatusLabel(order.payment_status)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${payoutStatusBadgeClass(order.payout_status)}`}
                    >
                      {payoutStatusLabel(order.payout_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {order.open_dispute_count > 0 ? (
                      <Link
                        href="/admin/disputes?status=open"
                        className="text-xs font-medium text-rose-700 underline"
                      >
                        {order.open_dispute_count} open
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
