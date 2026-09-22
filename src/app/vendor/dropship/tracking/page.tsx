import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { listCjOrdersForVendor } from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function DropshipCjTrackingPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship/tracking");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper · CJ
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">CJ tracking</h1>
        <p className="text-zinc-600">
          Apply as a vendor before viewing CJ shipment tracking.
        </p>
        <Link href="/vendor/apply" className="font-medium underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const orders = await listCjOrdersForVendor(vendor.id);
  const supabase = await createClient();
  const { data: registry } = await supabase
    .from("cj_order_fulfillments")
    .select(
      "order_id, supplier_order_ref, tracking_number, tracking_carrier, tracking_url, last_sync_status, last_synced_at",
    )
    .or(`vendor_id.eq.${vendor.id},seller_vendor_id.eq.${vendor.id}`);

  const byOrder = new Map(
    ((registry as Array<{ order_id: string }> | null) ?? []).map((row) => [
      row.order_id,
      row as {
        order_id: string;
        supplier_order_ref: string | null;
        tracking_number: string | null;
        tracking_carrier: string | null;
        tracking_url: string | null;
        last_sync_status: string | null;
        last_synced_at: string | null;
      },
    ]),
  );

  const tracked = orders.filter(
    (order) =>
      Boolean(order.tracking_number) ||
      Boolean(order.supplier_order_ref) ||
      Boolean(byOrder.get(order.id)?.tracking_number) ||
      order.status === "shipped" ||
      order.status === "delivered" ||
      order.status === "processing",
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">CJ Tracking</h1>
        <p className="max-w-2xl text-zinc-600">
          Live shipment status from the CJ Dropshipping API. Custom-source
          tracking is under More in the Independent Vendor workspace.
        </p>
      </div>

      {tracked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-6 py-10 text-center">
          <p className="text-zinc-700">No CJ shipments to track yet.</p>
          <Link
            href="/vendor/dropship/orders"
            className="mt-3 inline-flex text-sm font-medium underline"
          >
            Open CJ orders
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-sky-100 bg-white">
          {tracked.map((order) => {
            const cj = byOrder.get(order.id);
            const trackingNumber =
              cj?.tracking_number || order.tracking_number;
            const carrier = cj?.tracking_carrier || order.tracking_carrier;
            const url = cj?.tracking_url || order.tracking_url;
            const supplierRef =
              cj?.supplier_order_ref || order.supplier_order_ref;
            return (
              <li key={order.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-950">
                        Order {order.id.slice(0, 8)}…
                      </p>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-900 ring-1 ring-inset ring-sky-200">
                        CJ API
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {order.status}
                      {carrier ? ` · ${carrier}` : ""}
                      {cj?.last_sync_status
                        ? ` · sync ${cj.last_sync_status}`
                        : ""}
                    </p>
                    {supplierRef ? (
                      <p className="text-xs text-zinc-500">
                        CJ order ref: {supplierRef}
                      </p>
                    ) : null}
                    {trackingNumber ? (
                      <p className="font-mono text-sm text-zinc-700">
                        {trackingNumber}
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-500">
                        Awaiting CJ tracking number…
                      </p>
                    )}
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-950 hover:bg-sky-100"
                    >
                      Track on CJ
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
