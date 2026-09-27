import Link from "next/link";
import { redirect } from "next/navigation";
import {
  VendorOrderMarketTabs,
  orderMatchesMarket,
  parseOrderMarketParam,
  shippingTypeLabel,
} from "@/components/orders/vendor-order-market-tabs";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import { listCjOrdersForVendor } from "@/lib/orders/queries";
import { getVendorForOwner } from "@/lib/vendors/queries";
import { formatDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ market?: string }>;
};

export default async function DropshipCjOrdersPage({ searchParams }: Props) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/dropship/orders");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
          Dropshipper · CJ
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">CJ orders</h1>
        <p className="text-zinc-600">
          Apply as a vendor before viewing CJ Dropshipping orders.
        </p>
        <Link href="/vendor/apply" className="font-medium underline">
          Apply as a vendor
        </Link>
      </div>
    );
  }

  const params = await searchParams;
  const market = parseOrderMarketParam(params.market);
  const allOrders = await listCjOrdersForVendor(vendor.id);
  const orders = allOrders.filter((order) => orderMatchesMarket(order, market));
  const counts = {
    ALL: allOrders.length,
    AE: allOrders.filter((o) => orderMatchesMarket(o, "AE")).length,
    PH: allOrders.filter((o) => orderMatchesMarket(o, "PH")).length,
    MM: allOrders.filter((o) => orderMatchesMarket(o, "MM")).length,
    GLOBAL: allOrders.filter((o) => orderMatchesMarket(o, "GLOBAL")).length,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">CJ Orders</h1>
        <p className="max-w-2xl text-zinc-600">
          Orders fulfilled through the CJ Dropshipping API. Filter by destination
          market to process Free Shipping (UAE / PH / MM) vs Global plus-shipping
          orders.
        </p>
      </div>

      <VendorOrderMarketTabs
        basePath="/vendor/dropship/orders"
        active={market}
        counts={counts}
      />

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 px-6 py-10 text-center">
          <p className="text-zinc-700">No CJ orders yet for this market.</p>
          <Link
            href="/vendor/sourcing"
            className="mt-3 inline-flex text-sm font-medium underline"
          >
            Browse CJ catalog
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-sky-100 bg-white">
          {orders.map((order) => (
            <li key={order.id} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-zinc-950">
                      Order {order.id.slice(0, 8)}…
                    </p>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-900 ring-1 ring-inset ring-sky-200">
                      CJ
                    </span>
                    {order.target_market || order.buyer_country_code ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-900 ring-1 ring-inset ring-violet-200">
                        {order.target_market ?? order.buyer_country_code}
                        {order.display_currency
                          ? ` · ${order.display_currency}`
                          : ""}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      {shippingTypeLabel(order.shipping_type)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    {formatDateTime(order.created_at)} · {order.status} /{" "}
                    {order.payment_status}
                    {order.buyer_country_code
                      ? ` · Ship to ${order.buyer_country_code}`
                      : ""}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {formatMoney(Number(order.total), order.currency)}
                    {order.shipping_fee > 0
                      ? ` · ship ${formatMoney(Number(order.shipping_fee), order.currency)}`
                      : ""}
                    {order.supplier_order_ref
                      ? ` · CJ ref ${order.supplier_order_ref}`
                      : ""}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
