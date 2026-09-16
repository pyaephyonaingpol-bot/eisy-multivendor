import Link from "next/link";
import { AdminOrdersTable } from "@/components/orders/admin-orders-table";
import {
  listOrdersForAdmin,
  listVendorsForOrderFilter,
} from "@/lib/orders/queries";
import type { OrderPayoutStatus, OrderStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    vendor?: string;
    q?: string;
    payout?: string;
    status?: string;
  }>;
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const vendorId = params.vendor?.trim() || undefined;
  const q = params.q?.trim() || undefined;
  const payoutFilter =
    params.payout === "held" ||
    params.payout === "disputed" ||
    params.payout === "released" ||
    params.payout === "refunded"
      ? (params.payout as OrderPayoutStatus)
      : undefined;
  const statusFilter =
    params.status === "pending" ||
    params.status === "paid" ||
    params.status === "processing" ||
    params.status === "shipped" ||
    params.status === "delivered" ||
    params.status === "cancelled" ||
    params.status === "refunded"
      ? (params.status as OrderStatus)
      : undefined;

  const [orders, vendors] = await Promise.all([
    listOrdersForAdmin({
      vendorId,
      q,
      payoutStatus: payoutFilter,
      status: statusFilter,
      limit: 150,
    }),
    listVendorsForOrderFilter(),
  ]);

  const selectedVendor = vendorId
    ? vendors.find((vendor) => vendor.id === vendorId)
    : null;

  const payoutFilters = [
    { href: buildHref({ vendor: vendorId, q, status: statusFilter }), label: "All escrow" },
    {
      href: buildHref({
        vendor: vendorId,
        q,
        status: statusFilter,
        payout: "held",
      }),
      label: "Held",
    },
    {
      href: buildHref({
        vendor: vendorId,
        q,
        status: statusFilter,
        payout: "disputed",
      }),
      label: "Disputed",
    },
    {
      href: buildHref({
        vendor: vendorId,
        q,
        status: statusFilter,
        payout: "released",
      }),
      label: "Released",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-zinc-600">
          Track every order with its seller vendor, contact details, USDT payout
          wallet, and related disputes.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {vendorId ? (
          <input type="hidden" name="vendor" value={vendorId} />
        ) : null}
        {payoutFilter ? (
          <input type="hidden" name="payout" value={payoutFilter} />
        ) : null}
        {statusFilter ? (
          <input type="hidden" name="status" value={statusFilter} />
        ) : null}

        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Search vendor</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, store, email, Telegram…"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>

        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Filter by vendor</span>
          <select
            name="vendor"
            defaultValue={vendorId ?? ""}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.store_name || vendor.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply
        </button>
        {(vendorId || q || payoutFilter || statusFilter) && (
          <Link
            href="/admin/orders"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Clear
          </Link>
        )}
      </form>

      {selectedVendor ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          Showing orders for{" "}
          <span className="font-semibold">
            {selectedVendor.store_name || selectedVendor.name}
          </span>
          .{" "}
          <Link href="/admin/disputes?status=open" className="underline">
            Open disputes queue
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {payoutFilters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <p className="text-sm text-zinc-500">
        {orders.length} order{orders.length === 1 ? "" : "s"}
      </p>

      <AdminOrdersTable orders={orders} />
    </div>
  );
}

function buildHref(opts: {
  vendor?: string;
  q?: string;
  payout?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (opts.vendor) params.set("vendor", opts.vendor);
  if (opts.q) params.set("q", opts.q);
  if (opts.payout) params.set("payout", opts.payout);
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}
