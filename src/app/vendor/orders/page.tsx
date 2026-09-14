import Link from "next/link";
import { VendorFulfillmentForm } from "@/components/orders/vendor-fulfillment-form";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { listOrdersForVendor } from "@/lib/orders/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorOrdersPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login?next=/vendor/orders");
  }

  const vendor = await getVendorForOwner(session.userId);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor orders</h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can receive orders.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const orders = await listOrdersForVendor(vendor.id);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor orders</h1>
        <p className="text-zinc-600">
          Fulfillment orders route to the supplier. Dropship sales you made appear
          here as seller orders; supplier stock and fulfillment stay with the
          original vendor.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-zinc-700">No orders yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {orders.map((order) => (
            <li key={order.id} className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">
                    Order {order.id.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-zinc-500">
                    {new Date(order.created_at).toLocaleString()} · {order.status} /{" "}
                    {order.payment_status}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {order.role === "fulfillment" || order.role === "both" ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-900 ring-1 ring-inset ring-sky-200">
                        Fulfill as supplier
                      </span>
                    ) : null}
                    {order.role === "seller" || order.role === "both" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
                        Sold from your store
                      </span>
                    ) : null}
                    {order.vendor_id !== order.seller_vendor_id ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                        Dropship routed
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-zinc-600">
                    Seller: {order.seller?.name ?? "—"} · Fulfillment:{" "}
                    {order.fulfillment?.name ?? "—"}
                    {order.buyer_country_code
                      ? ` · Ship to ${order.buyer_country_code}`
                      : ""}
                  </p>
                </div>
                <p className="text-right font-medium text-zinc-950">
                  {formatMoney(Number(order.total), order.currency)}
                </p>
              </div>
              <ul className="space-y-1 text-sm text-zinc-600">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      {item.quantity}× {item.product_name}
                    </span>
                    <span className="text-zinc-500">
                      {formatMoney(Number(item.total_price), order.currency)}
                      {item.cost_unit_price != null &&
                      order.vendor_id !== order.seller_vendor_id
                        ? ` · cost ${formatMoney(
                            Number(item.cost_unit_price) * item.quantity,
                            order.currency,
                          )}`
                        : ""}
                      {item.warehouse_country
                        ? ` · via ${item.warehouse_country}`
                        : ""}
                      {item.shipping_estimate_days_min != null ||
                      item.shipping_estimate_days_max != null
                        ? ` · ETA ${item.shipping_estimate_days_min ?? "?"}–${item.shipping_estimate_days_max ?? "?"}d`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {order.role === "fulfillment" || order.role === "both" ? (
                <VendorFulfillmentForm
                  orderId={order.id}
                  currentStatus={order.status}
                  trackingNumber={order.tracking_number}
                  trackingCarrier={order.tracking_carrier}
                  trackingUrl={order.tracking_url}
                  supplierOrderRef={order.supplier_order_ref}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
