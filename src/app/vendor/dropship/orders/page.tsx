import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { listOrdersForVendor } from "@/lib/orders/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function DropshipOrdersPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship/orders");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-zinc-600">
          Apply as a vendor before viewing dropship orders.
        </p>
        <Link href="/vendor/apply" className="font-medium underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const orders = await listOrdersForVendor(vendor.id);
  // Dropshipper sales: you sold the order; fulfillment may be another supplier.
  const dropshipOrders = orders.filter(
    (order) =>
      order.seller_vendor_id === vendor.id &&
      (order.vendor_id !== vendor.id ||
        order.role === "seller" ||
        order.role === "both"),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="max-w-2xl text-zinc-600">
          Sales from your store that route fulfillment to a supplier catalog.
          Store-owned inventory orders stay under Vendor → Orders.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/vendor/dropship" className="font-medium underline">
            Dropshipper hub
          </Link>
          {" · "}
          <Link href="/vendor/sourcing" className="font-medium underline">
            Catalog
          </Link>
        </p>
      </div>

      {dropshipOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-6 py-10 text-center">
          <p className="text-zinc-700">No dropship orders yet.</p>
          <Link
            href="/vendor/sourcing"
            className="mt-3 inline-flex text-sm font-medium underline"
          >
            Browse catalog
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-sky-100 bg-white">
          {dropshipOrders.map((order) => (
            <li key={order.id} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">
                    Order {order.id.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-zinc-500">
                    {new Date(order.created_at).toLocaleString()} · {order.status}{" "}
                    / {order.payment_status}
                  </p>
                </div>
                <p className="text-sm font-semibold text-zinc-950">
                  {formatMoney(order.total, order.currency || "USDT")}
                </p>
              </div>
              <p className="text-sm text-zinc-600">
                Fulfillment:{" "}
                <strong>{order.fulfillment?.name ?? "Supplier"}</strong>
                {order.tracking_number
                  ? ` · Tracking ${order.tracking_number}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
