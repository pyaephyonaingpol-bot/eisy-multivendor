import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { listManualOrdersForVendor } from "@/lib/orders/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function VendorTrackingPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/tracking");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Vendor
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="text-zinc-600">
          Submit a vendor application before you can track shipments.
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

  const orders = await listManualOrdersForVendor(vendor.id);
  const tracked = orders.filter(
    (order) =>
      Boolean(order.tracking_number) ||
      Boolean(order.tracking_carrier) ||
      Boolean(order.tracking_url) ||
      order.status === "shipped" ||
      order.status === "delivered",
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Vendor · Manual tracking
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="max-w-2xl text-zinc-600">
          Local shipment tracking for custom-sourced orders. CJ API tracking
          lives under Dropshipper → CJ tracking.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/vendor/orders" className="font-medium underline">
            Manual orders
          </Link>
          {" · "}
          <Link
            href="/vendor/dropship/tracking"
            className="font-medium underline"
          >
            CJ tracking
          </Link>
        </p>
      </div>

      {tracked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-zinc-700">No tracked manual shipments yet.</p>
          <Link
            href="/vendor/orders"
            className="mt-3 inline-flex text-sm font-medium underline"
          >
            Open manual orders
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {tracked.map((order) => (
            <li key={order.id} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">
                    Order {order.id.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-zinc-500">
                    {order.status}
                    {order.tracking_carrier
                      ? ` · ${order.tracking_carrier}`
                      : ""}
                  </p>
                  {order.tracking_number ? (
                    <p className="font-mono text-sm text-zinc-700">
                      {order.tracking_number}
                    </p>
                  ) : null}
                </div>
                {order.tracking_url ? (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Track
                  </a>
                ) : (
                  <Link
                    href="/vendor/orders"
                    className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Update
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
