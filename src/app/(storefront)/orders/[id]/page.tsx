import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmDeliveryForm } from "@/components/orders/confirm-delivery-form";
import { OpenDisputeForm } from "@/components/orders/open-dispute-form";
import { OrderStatusTimeline } from "@/components/orders/order-status-timeline";
import { getSessionProfile } from "@/lib/auth/session";
import { getOpenDisputeForOrder } from "@/lib/disputes/queries";
import { formatMoney } from "@/lib/money";
import { getOrderForCustomer } from "@/lib/orders/queries";
import {
  orderStatusBadgeClass,
  orderStatusLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
  payoutStatusBadgeClass,
  payoutStatusLabel,
} from "@/lib/orders/status";
import { formatDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function addressLines(address: Record<string, unknown> | null) {
  if (!address) return [];
  const keys = [
    "full_name",
    "phone",
    "line1",
    "line2",
    "city",
    "region",
    "postal_code",
    "country",
    "note",
  ];
  return keys
    .map((key) => address[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/orders");
  }

  const { id } = await params;
  const order = await getOrderForCustomer(id, session.userId);
  if (!order) {
    notFound();
  }

  const openDispute = await getOpenDisputeForOrder(order.id);
  const shippingLines = addressLines(order.shipping_address);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            <Link href="/orders" className="underline underline-offset-4">
              Orders
            </Link>{" "}
            / {order.id.slice(0, 8)}…
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            Order details
          </h1>
          <p className="text-sm text-zinc-600">
            Placed {formatDateTime(order.created_at)}
            {order.seller?.name ? ` · Sold by ${order.seller.name}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${orderStatusBadgeClass(order.status)}`}
            >
              {orderStatusLabel(order.status)}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${paymentStatusBadgeClass(order.payment_status)}`}
            >
              Payment: {paymentStatusLabel(order.payment_status)}
            </span>
            {order.payout_status && order.payout_status !== "not_applicable" ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${payoutStatusBadgeClass(order.payout_status)}`}
              >
                Payout: {payoutStatusLabel(order.payout_status)}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-right text-xl font-semibold text-zinc-950">
          {formatMoney(Number(order.total), order.currency)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-950">Status</h2>
        <OrderStatusTimeline
          status={order.status}
          shippedAt={order.shipped_at}
          deliveredAt={order.delivered_at}
          syncError={order.fulfillment_sync_error}
        />
        <ConfirmDeliveryForm
          orderId={order.id}
          status={order.status}
          paymentStatus={order.payment_status}
          payoutStatus={order.payout_status ?? "not_applicable"}
        />
        <OpenDisputeForm
          orderId={order.id}
          status={order.status}
          paymentStatus={order.payment_status}
          payoutStatus={order.payout_status ?? "not_applicable"}
          existingDispute={openDispute}
        />
      </section>

      <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-950">USDT payment</h2>
          <p className="text-sm text-zinc-600">
            Status: {paymentStatusLabel(order.payment_status)}
          </p>
          <p className="text-sm text-zinc-600">
            Subtotal {formatMoney(Number(order.subtotal), order.currency)} ·
            Shipping {formatMoney(Number(order.shipping_fee), order.currency)} ·
            Tax {formatMoney(Number(order.tax), order.currency)}
          </p>
          <p className="text-sm font-medium text-zinc-950">
            Total {formatMoney(Number(order.total), order.currency)}
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-950">Shipping tracking</h2>
          {order.tracking_number ? (
            <>
              <p className="text-sm text-zinc-600">
                Carrier: {order.tracking_carrier ?? "Not specified"}
              </p>
              <p className="font-mono text-sm text-zinc-950">
                {order.tracking_number}
              </p>
              {order.tracking_url ? (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-zinc-950 underline underline-offset-4"
                >
                  Open tracking page
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              No tracking number yet. Supplier auto-fulfillment sync will attach
              one when the parcel ships.
            </p>
          )}
          {order.supplier_order_ref ? (
            <p className="text-xs text-zinc-400">
              Supplier ref: {order.supplier_order_ref}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-950">Ship to</h2>
          {shippingLines.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-600">
              {shippingLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No shipping address on file.</p>
          )}
          {order.buyer_country_code ? (
            <p className="mt-2 text-xs text-zinc-400">
              Buyer country: {order.buyer_country_code}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-950">Fulfillment</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Seller: {order.seller?.name ?? "—"}
          </p>
          <p className="text-sm text-zinc-600">
            Supplier: {order.fulfillment?.name ?? "—"}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Sync: {order.fulfillment_sync_status}
            {order.fulfillment_synced_at
              ? ` · ${formatDateTime(order.fulfillment_synced_at)}`
              : ""}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-950">Items</h2>
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-zinc-950">
                  {item.quantity}× {item.product_name}
                </p>
                <p className="text-zinc-500">
                  {formatMoney(Number(item.unit_price), order.currency)} each
                  {item.warehouse_country
                    ? ` · via ${item.warehouse_country}`
                    : ""}
                  {item.shipping_estimate_days_min != null ||
                  item.shipping_estimate_days_max != null
                    ? ` · ETA ${item.shipping_estimate_days_min ?? "?"}–${item.shipping_estimate_days_max ?? "?"}d`
                    : ""}
                </p>
              </div>
              <p className="font-medium text-zinc-950">
                {formatMoney(Number(item.total_price), order.currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {order.events.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-950">
            Fulfillment activity
          </h2>
          <ul className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
            {order.events.map((event) => (
              <li key={event.id} className="border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                <p className="font-medium text-zinc-950">
                  {event.previous_status
                    ? `${orderStatusLabel(event.previous_status)} → `
                    : ""}
                  {event.new_status
                    ? orderStatusLabel(event.new_status)
                    : "Update"}
                  <span className="ml-2 text-xs font-normal uppercase tracking-wide text-zinc-400">
                    {event.source}
                  </span>
                </p>
                <p className="text-zinc-500">
                  {formatDateTime(event.created_at)}
                  {event.tracking_number
                    ? ` · ${event.tracking_carrier ?? "Tracking"} ${event.tracking_number}`
                    : ""}
                </p>
                {event.note ? (
                  <p className="text-zinc-500">{event.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
