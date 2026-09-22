"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { AdminOrderRow } from "@/lib/orders/queries";
import {
  adminMarkOrderShipped,
  adminRefundSupplierUnavailableOrder,
  adminReleaseOrderEscrow,
  adminResolveOrderDisputeRefund,
  adminResolveOrderDisputeRelease,
  type AdminOrderActionState,
} from "@/lib/orders/admin-actions";
import {
  adminEscrowStatusBadgeClass,
  adminEscrowStatusLabel,
  isSupplierUnavailableStatus,
  orderStatusLabel,
  paymentStatusLabel,
  tronscanTxUrl,
} from "@/lib/orders/status";
import { formatMoney } from "@/lib/money";

const initialActionState: AdminOrderActionState = null;

function VendorTelegram({ handle }: { handle: string | null | undefined }) {
  if (!handle) return <span className="text-zinc-400">—</span>;
  const telegram = handle.startsWith("@") ? handle : `@${handle}`;
  return (
    <a
      href={`https://t.me/${telegram.replace(/^@/, "")}`}
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      {telegram}
    </a>
  );
}

function OrderActions({ order }: { order: AdminOrderRow }) {
  const [shipState, shipAction, shipPending] = useActionState(
    adminMarkOrderShipped,
    initialActionState,
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    adminReleaseOrderEscrow,
    initialActionState,
  );
  const [refundState, refundAction, refundPending] = useActionState(
    adminResolveOrderDisputeRefund,
    initialActionState,
  );
  const [stockRefundState, stockRefundAction, stockRefundPending] =
    useActionState(adminRefundSupplierUnavailableOrder, initialActionState);
  const [resolveReleaseState, resolveReleaseAction, resolveReleasePending] =
    useActionState(adminResolveOrderDisputeRelease, initialActionState);

  const canShip =
    order.payment_status === "paid" &&
    (order.status === "paid" ||
      order.status === "processing" ||
      order.status === "pending");
  const canRelease =
    order.payment_status === "paid" &&
    order.payout_status === "held" &&
    order.escrow_status !== "disputed" &&
    !isSupplierUnavailableStatus(order.status);
  const canStockRefund = isSupplierUnavailableStatus(order.status);
  const primaryDisputeId = order.dispute_ids[0] ?? null;
  const canResolveDispute =
    order.escrow_status === "disputed" && Boolean(primaryDisputeId);

  const feedback =
    shipState?.error ||
    shipState?.success ||
    releaseState?.error ||
    releaseState?.success ||
    refundState?.error ||
    refundState?.success ||
    stockRefundState?.error ||
    stockRefundState?.success ||
    resolveReleaseState?.error ||
    resolveReleaseState?.success;

  const feedbackIsError = Boolean(
    shipState?.error ||
      releaseState?.error ||
      refundState?.error ||
      stockRefundState?.error ||
      resolveReleaseState?.error,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canShip ? (
          <form action={shipAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <button
              type="submit"
              disabled={shipPending}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {shipPending ? "Saving…" : "Mark shipped"}
            </button>
          </form>
        ) : null}

        {canRelease ? (
          <form action={releaseAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <button
              type="submit"
              disabled={releasePending}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              {releasePending ? "Releasing…" : "Release escrow"}
            </button>
          </form>
        ) : null}

        {canStockRefund ? (
          <form action={stockRefundAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <input
              type="hidden"
              name="note"
              value="Admin refund — supplier out of stock / fulfillment failed"
            />
            <button
              type="submit"
              disabled={stockRefundPending}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            >
              {stockRefundPending ? "Refunding…" : "Cancel & refund (OOS)"}
            </button>
          </form>
        ) : null}

        {canResolveDispute && primaryDisputeId ? (
          <>
            <form action={resolveReleaseAction}>
              <input type="hidden" name="dispute_id" value={primaryDisputeId} />
              <button
                type="submit"
                disabled={resolveReleasePending}
                className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                {resolveReleasePending ? "Resolving…" : "Resolve → seller"}
              </button>
            </form>
            <form action={refundAction}>
              <input type="hidden" name="dispute_id" value={primaryDisputeId} />
              <button
                type="submit"
                disabled={refundPending}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              >
                {refundPending ? "Refunding…" : "Resolve → refund"}
              </button>
            </form>
          </>
        ) : null}

        {order.open_dispute_count > 0 ? (
          <Link
            href="/admin/disputes?status=open"
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50"
          >
            Disputes
          </Link>
        ) : null}
      </div>
      {feedback ? (
        <p
          className={`text-xs ${feedbackIsError ? "text-rose-600" : "text-emerald-700"}`}
          role={feedbackIsError ? "alert" : undefined}
        >
          {feedback}
        </p>
      ) : null}
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
  const store = vendor?.store_name || vendor?.name || "—";
  const txUrl = order.payment_tx_hash
    ? tronscanTxUrl(order.payment_tx_hash)
    : null;

  return (
    <div className="fixed inset-0 z-[100] box-border flex w-full max-w-full items-end justify-center sm:items-center sm:p-4">
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
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Buyer</p>
              <p className="font-medium break-all">
                {order.buyer_email ?? "—"}
              </p>
              {order.buyer_name ? (
                <p className="text-xs text-zinc-500">{order.buyer_name}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-xs text-zinc-500">Store</p>
              <p className="font-medium">{store}</p>
              <p className="text-xs text-zinc-500">
                <VendorTelegram handle={vendor?.telegram_handle} />
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 px-3 py-2 sm:col-span-2">
              <p className="text-xs text-zinc-500">Deposit address</p>
              <p className="break-all font-mono text-xs">
                {order.deposit_address ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 px-3 py-2 sm:col-span-2">
              <p className="text-xs text-zinc-500">TxID</p>
              {order.payment_tx_hash && txUrl ? (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs underline"
                >
                  {order.payment_tx_hash}
                </a>
              ) : (
                <p className="text-zinc-400">—</p>
              )}
            </div>
          </div>

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
              <p className="text-xs text-zinc-500">Escrow status</p>
              <p className="font-medium">
                {adminEscrowStatusLabel(order.escrow_status)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Admin actions</h3>
            <OrderActions order={order} />
          </div>

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
        No orders match this filter.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-medium">Order ID</th>
              <th className="px-3 py-3 font-medium">Buyer email</th>
              <th className="px-3 py-3 font-medium">Store</th>
              <th className="px-3 py-3 font-medium">Total USDT</th>
              <th className="px-3 py-3 font-medium">Deposit address</th>
              <th className="px-3 py-3 font-medium">TxID</th>
              <th className="px-3 py-3 font-medium">Escrow status</th>
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {orders.map((order) => {
              const vendor = order.seller ?? order.fulfillment;
              const store = vendor?.store_name || vendor?.name || "—";
              const txUrl = order.payment_tx_hash
                ? tronscanTxUrl(order.payment_tx_hash)
                : null;

              return (
                <tr key={order.id} className="align-top">
                  <td className="px-3 py-3 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className="underline underline-offset-2"
                    >
                      {order.id.slice(0, 8)}…
                    </button>
                    <p className="mt-1 font-sans text-[11px] text-zinc-400">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="max-w-[10rem] px-3 py-3 text-xs text-zinc-700">
                    <p className="break-all">{order.buyer_email ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-zinc-950">{store}</p>
                    <p className="text-xs text-zinc-500">
                      <VendorTelegram handle={vendor?.telegram_handle} />
                    </p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatMoney(Number(order.total), order.currency)}
                  </td>
                  <td className="max-w-[9rem] px-3 py-3 font-mono text-[11px] text-zinc-600">
                    <span className="line-clamp-2 break-all">
                      {order.deposit_address ?? "—"}
                    </span>
                  </td>
                  <td className="max-w-[9rem] px-3 py-3 font-mono text-[11px]">
                    {order.payment_tx_hash && txUrl ? (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 break-all text-sky-800 underline"
                        title={order.payment_tx_hash}
                      >
                        {order.payment_tx_hash.slice(0, 10)}…
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${adminEscrowStatusBadgeClass(order.escrow_status)}`}
                    >
                      {order.escrow_status}
                    </span>
                  </td>
                  <td className="min-w-[11rem] px-3 py-3">
                    <OrderActions order={order} />
                    <button
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className="mt-2 text-xs font-medium text-zinc-500 underline"
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
